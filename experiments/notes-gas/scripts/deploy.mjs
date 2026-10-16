/* Google source/deployment management. Disabled until explicit one-time OAuth setup. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const digest=files=>createHash('sha256').update(JSON.stringify(files.map(({name,type,source})=>({name,type,source:type==='JSON'?JSON.stringify(JSON.parse(source)):source.replace(/\r\n/g,'\n')})).sort((a,b)=>a.name.localeCompare(b.name)))).digest('hex');
const fail=code=>{throw new Error(code);};
export async function deploy({env,files,fetcher=fetch,verify=async()=>true}) {
  if(env.NOTES_GAS_AUTODEPLOY!=='true')fail('AUTODEPLOY_DISABLED');
  if(env.GITHUB_REF!=='refs/heads/prototype/notes-apps-script-drive-20261016')fail('BRANCH_FORBIDDEN');
  const id=env.NOTES_GAS_SCRIPT_ID,dep=env.NOTES_GAS_DEPLOYMENT_ID;
  if(!/^[\w-]{20,200}$/.test(id||'')||dep&&!/^[\w-]{20,200}$/.test(dep))fail('TARGET_REQUIRED');
  for(const key of ['GAS_OAUTH_CLIENT_ID','GAS_OAUTH_CLIENT_SECRET','GAS_OAUTH_REFRESH_TOKEN'])if(!env[key])fail('OAUTH_NOT_CONFIGURED');
  const expected=['Core','Server','appsscript'];
  const names=files.map(f=>f.name).sort();if(JSON.stringify(names)!==JSON.stringify(expected)||files.some(f=>!['SERVER_JS','JSON'].includes(f.type)||typeof f.source!=='string'))fail('SOURCE_SET_INVALID');
  const manifest=JSON.parse(files.find(f=>f.name==='appsscript').source);
  if(JSON.stringify(manifest.oauthScopes)!==JSON.stringify(['https://www.googleapis.com/auth/drive'])||manifest.webapp?.executeAs!=='USER_DEPLOYING'||manifest.webapp?.access!=='ANYONE_ANONYMOUS')fail('RUNTIME_SCOPES_CHANGED');
  const desired=digest(files),description='Homepage Notes prototype '+String(env.GITHUB_SHA||'local').slice(0,40);
  const report={phase:'oauth',sourceUpdateAttempted:false,sourceUpdated:false,deployed:false,sourceHash:desired,version:null,previousVersion:null,rollback:null};
  let access;
  try {
    const response=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GAS_OAUTH_CLIENT_ID,client_secret:env.GAS_OAUTH_CLIENT_SECRET,refresh_token:env.GAS_OAUTH_REFRESH_TOKEN,grant_type:'refresh_token'}),redirect:'error',signal:AbortSignal.timeout(20000)});
    if(!response.ok){
      let reason;try{reason=(await response.json()).error;}catch{}
      const code={invalid_grant:'OAUTH_INVALID_GRANT',invalid_client:'OAUTH_INVALID_CLIENT',unauthorized_client:'OAUTH_CLIENT_NOT_AUTHORIZED'}[reason];
      fail(code||'OAUTH_REFRESH_FAILED');
    }
    const token=await response.json();if(typeof token.access_token!=='string'||!token.access_token)fail('OAUTH_REFRESH_FAILED');access=token.access_token;
    const base='https://script.googleapis.com/v1/projects/'+id;
    async function api(path,method='GET',value) {
      const r=await fetcher(base+path,{method,headers:{Authorization:'Bearer '+access,...(value?{'Content-Type':'application/json'}:{})},...(value?{body:JSON.stringify(value)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});
      if(!r.ok){
        let body;try{body=await r.json();}catch{}
        const error=body?.error;
        if(/user has not enabled.*Apps Script API|script\.google\.com\/home\/usersettings/i.test(String(error?.message||'')))fail('USER_APPS_SCRIPT_API_DISABLED');
        const reasons=(Array.isArray(error?.details)?error.details:[]).map(x=>x?.reason);
        if(reasons.includes('SERVICE_DISABLED'))fail('CLOUD_APPS_SCRIPT_API_DISABLED');
        if(reasons.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT'))fail('OAUTH_SCOPES_INSUFFICIENT');
        fail('GOOGLE_API_'+r.status);
      }return r.json();
    }
    report.phase='target';const project=await api('');
    report.target={scriptIdMatches:project.scriptId===id,title:String(project.title||'').slice(0,160)};
    if(project.scriptId!==id||String(project.title||'').trim()!=='Homepage Notes Prototype'){
      console.log(JSON.stringify({diagnostic:'TARGET_METADATA_ONLY',target:report.target}));
      fail('TARGET_MISMATCH');
    }
    const initial=(await api('/content')).files;
    if(!Array.isArray(initial)||initial.some(f=>!expected.includes(f.name))){
      console.log(JSON.stringify({diagnostic:'REMOTE_FILES_METADATA_ONLY',files:Array.isArray(initial)?initial.map(f=>({name:String(f.name).slice(0,100),type:f.type})):null}));
      fail('REMOTE_EXTRA_FILES');
    }
    const before=digest(initial);let previous;
    if(dep){previous=await api('/deployments/'+dep);if(previous.deploymentId!==dep||!Number.isSafeInteger(previous.deploymentConfig?.versionNumber))fail('DEPLOYMENT_MISMATCH');report.previousVersion=previous.deploymentConfig.versionNumber;}
    report.phase='source';
    if(before!==desired){
      if(digest((await api('/content')).files)!==before)fail('REMOTE_CHANGED');
      report.sourceUpdateAttempted=true;
      try{await api('/content','PUT',{files});}catch{if(digest((await api('/content')).files)!==desired)fail('SOURCE_UPDATE_UNCERTAIN');}
      report.sourceUpdated=true;
      if(digest((await api('/content')).files)!==desired)fail('SOURCE_VERIFY_FAILED');
    }
    if(!dep){report.phase='source_verified_deployment_not_configured';return report;}
    // Reuse a matching deployed version; do not burn version quota on every push.
    if(previous.deploymentConfig.description===description){report.phase='already_deployed';return report;}
    report.phase='version';const version=await api('/versions','POST',{description});
    if(!Number.isSafeInteger(version.versionNumber))fail('VERSION_INVALID');report.version=version.versionNumber;
    if(digest((await api('/content?versionNumber='+version.versionNumber)).files)!==desired)fail('VERSION_VERIFY_FAILED');
    // Refuse to override a deployment changed by another operator during this job.
    const latest=await api('/deployments/'+dep);if(latest.deploymentConfig.versionNumber!==report.previousVersion)fail('DEPLOYMENT_CHANGED');
    report.phase='deploy';
    try {
      await api('/deployments/'+dep,'PUT',{deploymentConfig:{scriptId:id,versionNumber:version.versionNumber,manifestFileName:'appsscript',description}});
      const after=await api('/deployments/'+dep);
      if(after.deploymentConfig.versionNumber!==version.versionNumber)fail('DEPLOY_VERIFY_FAILED');
      report.deployed=true;report.phase='health';if(!await verify())fail('POST_DEPLOY_HEALTH_FAILED');
      report.phase='verified';return report;
    }catch(_) {
      // A timed-out update may have committed. Read actual deployment before rollback.
      report.phase='deploy_failed';
      try {
        const actual=await api('/deployments/'+dep);
        if(actual.deploymentConfig.versionNumber===version.versionNumber){
          await api('/deployments/'+dep,'PUT',{deploymentConfig:{...previous.deploymentConfig,scriptId:id}});
          report.rollback=(await api('/deployments/'+dep)).deploymentConfig.versionNumber===report.previousVersion?'verified':'uncertain';
        }else report.rollback=actual.deploymentConfig.versionNumber===report.previousVersion?'not_needed':'blocked_external_change';
      }catch{report.rollback='uncertain';}
      fail('DEPLOY_OR_HEALTH_FAILED');
    }
  }catch(e){
    // Only fixed internal codes are exposed. Never echo token/API bodies or remote source.
    const code=/^[A-Z_0-9]{1,80}$/.test(e.message)?e.message:'DEPLOY_FAILED';
    const error=new Error(code);error.report=report;throw error;
  }
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const root=new URL('../apps-script/',import.meta.url);
  const files=await Promise.all([['Core','Core.js','SERVER_JS'],['Server','Server.js','SERVER_JS'],['appsscript','appsscript.json','JSON']].map(async([name,path,type])=>({name,type,source:await readFile(new URL(path,root),'utf8')})));
  const {createGasClient,newRequest}=await import('../adapter.mjs');
  // Validate probe config before touching Google source/deployment.
  const verify=process.env.NOTES_GAS_DEPLOYMENT_ID?(()=>{
    const client=createGasClient({url:process.env.NOTES_GAS_URL,key:process.env.NOTES_GAS_HMAC_KEY});
    return async()=>{for(let i=0;i<3;i++){try{if((await client(newRequest('health'))).readVerified)return true;}catch{}if(i<2)await new Promise(r=>setTimeout(r,1500));}return false;};
  })():async()=>true;
  try{const result=await deploy({env:process.env,files,verify});await writeFile(new URL('../deployment-result.local.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
  catch(e){if(e.report)await writeFile(new URL('../deployment-result.local.json',import.meta.url),JSON.stringify({...e.report,error:e.message},null,2)+'\n');console.error(e.report?e.message:'DEPLOY_FAILED');process.exitCode=1;}
}
