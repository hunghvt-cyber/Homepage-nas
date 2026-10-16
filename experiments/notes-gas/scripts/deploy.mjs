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
        report.googleError={httpStatus:r.status,status:['INVALID_ARGUMENT','PERMISSION_DENIED','FAILED_PRECONDITION','NOT_FOUND','INTERNAL'].includes(error?.status)?error.status:'OTHER',hints:['scriptId','deploymentConfig','Unknown name','read-only','manifest','version','permission','caller','deployment'].filter(x=>String(error?.message||'').toLowerCase().includes(x.toLowerCase()))};
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
    if(!dep){
      if(env.NOTES_GAS_BOOTSTRAP!=='true'){report.phase='source_verified_deployment_not_configured';return report;}
      report.phase='bootstrap_discovery';
      const marker='Homepage Notes prototype managed endpoint';
      let deployments=[],pageToken;
      do {
        const page=await api('/deployments?pageSize=50'+(pageToken?'&pageToken='+encodeURIComponent(pageToken):''));
        deployments.push(...(page.deployments||[]));pageToken=page.nextPageToken;
        if(deployments.length>200)fail('DEPLOYMENT_LIST_LIMIT');
      }while(pageToken);
      const managed=deployments.filter(d=>d.deploymentConfig?.description===marker);
      if(managed.length>1)fail('MULTIPLE_MANAGED_DEPLOYMENTS');
      let endpoint=managed[0];
      if(!endpoint){
        report.phase='bootstrap_version';
        const version=await api('/versions','POST',{description});
        if(!Number.isSafeInteger(version.versionNumber))fail('VERSION_INVALID');
        report.version=version.versionNumber;
        if(digest((await api('/content?versionNumber='+version.versionNumber)).files)!==desired)fail('VERSION_VERIFY_FAILED');
        report.phase='bootstrap_create';
        // Never retry this mutation blindly: a lost response may have created it.
        endpoint=await api('/deployments','POST',{versionNumber:version.versionNumber,manifestFileName:'appsscript',description:marker});
      }
      if(!/^[\w-]{20,200}$/.test(endpoint.deploymentId||''))fail('DEPLOYMENT_MISMATCH');
      endpoint=await api('/deployments/'+endpoint.deploymentId);
      report.deploymentId=endpoint.deploymentId;report.version=endpoint.deploymentConfig?.versionNumber;
      const entry=endpoint.entryPoints?.find(e=>e.entryPointType==='WEB_APP');
      const url=entry?.webApp?.url;
      if(url!=='https://script.google.com/macros/s/'+endpoint.deploymentId+'/exec')fail('WEBAPP_ENDPOINT_INVALID');
      report.url=url;
      if(digest((await api('/content?versionNumber='+report.version)).files)!==desired)fail('BOOTSTRAP_VERSION_DIFFERS_PIN_DEPLOYMENT');
      report.deployed=true;report.phase='bootstrap_health';
      if(!await verify(url))fail('BOOTSTRAP_HEALTH_FAILED');
      report.phase='verified';return report;
    }
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
    }catch(cause) {
      report.failureCode=/^[A-Z_0-9]{1,80}$/.test(cause.message)?cause.message:'REQUEST_FAILED';
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
  const runtimeEnabled=process.env.NOTES_GAS_DEPLOYMENT_ID||process.env.NOTES_GAS_BOOTSTRAP==='true';
  if(runtimeEnabled&&!/^[a-fA-F0-9]{64}$/.test(process.env.NOTES_GAS_HMAC_KEY||''))throw Error('RUNTIME_KEY_REQUIRED');
  const verify=async(url=process.env.NOTES_GAS_URL)=>{
    const client=createGasClient({url,key:process.env.NOTES_GAS_HMAC_KEY});
    for(let i=0;i<3;i++){try{if((await client(newRequest('health'))).readVerified)return true;}catch{}if(i<2)await new Promise(r=>setTimeout(r,1500));}return false;
  };
  try{const result=await deploy({env:process.env,files,verify});await writeFile(new URL('../deployment-result.local.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
  catch(e){if(e.report)await writeFile(new URL('../deployment-result.local.json',import.meta.url),JSON.stringify({...e.report,error:e.message},null,2)+'\n');console.error(e.report?JSON.stringify({...e.report,error:e.message}):'DEPLOY_FAILED');process.exitCode=1;}
}
