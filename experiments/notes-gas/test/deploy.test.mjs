import test from 'node:test';
import assert from 'node:assert/strict';
import {deploy} from '../scripts/deploy.mjs';
const id='test_script_id_123456789012345',dep='test_deployment_123456789012345';
const files=[{name:'Core',type:'SERVER_JS',source:'var NotesCore={};'},{name:'Server',type:'SERVER_JS',source:'function doPost(){}'},{name:'appsscript',type:'JSON',source:JSON.stringify({oauthScopes:['https://www.googleapis.com/auth/drive'],webapp:{executeAs:'USER_DEPLOYING',access:'ANYONE_ANONYMOUS'}})}];
const env={NOTES_GAS_AUTODEPLOY:'true',GITHUB_REF:'refs/heads/prototype/notes-apps-script-drive-20261016',GITHUB_SHA:'a'.repeat(40),NOTES_GAS_SCRIPT_ID:id,NOTES_GAS_DEPLOYMENT_ID:dep,GAS_OAUTH_CLIENT_ID:'fake',GAS_OAUTH_CLIENT_SECRET:'DO_NOT_LOG_CLIENT_SECRET',GAS_OAUTH_REFRESH_TOKEN:'DO_NOT_LOG_REFRESH_TOKEN'};
function fake({extra=false,title='Homepage Notes Prototype',lost=false,changed=false,staleRead=false,initialCurrent=false}={}){
 let source=files.map(f=>({...f,source:f.name==='Core'&&!initialCurrent?'old source':f.source})),version=1,puts=0,contentReads=0,staleShown=false;const calls=[],initialFiles=JSON.parse(JSON.stringify(source));
 const fetcher=async(url,o={})=>{
  calls.push({url,method:o.method||'GET'});
  if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'DO_NOT_LOG_ACCESS_TOKEN'});
  assert.equal(o.headers.Authorization,'Bearer DO_NOT_LOG_ACCESS_TOKEN');
  const path=url.replace('https://script.googleapis.com/v1/projects/'+id,'');
  if(path==='')return Response.json({scriptId:id,title});
  if(path==='/content'&&o.method==='PUT'){source=JSON.parse(o.body).files;return Response.json({files:source});}
  if(path==='/content'){contentReads++;return Response.json({files:[...source,...(extra?[{name:'other-private-file',type:'SERVER_JS',source:'DO NOT DELETE'}]:[]),...(changed&&contentReads===2?[{name:'Core2',type:'SERVER_JS',source:'external update'}]:[])]});}
  if(path==='/content?versionNumber=1')return Response.json({files:initialFiles});
  if(path==='/versions')return Response.json({versionNumber:2});
  if(path==='/content?versionNumber=2')return Response.json({files:source});
  if(path==='/deployments/'+dep&&o.method==='PUT'){version=JSON.parse(o.body).deploymentConfig.versionNumber;puts++;if(lost&&puts===1)throw Error('network lost');return Response.json({});}
  if(path==='/deployments/'+dep&&staleRead&&puts===1&&!staleShown){staleShown=true;return Response.json({deploymentId:dep,deploymentConfig:{versionNumber:1}});}
  if(path==='/deployments/'+dep)return Response.json({deploymentId:dep,deploymentConfig:{scriptId:id,versionNumber:version,manifestFileName:'appsscript',description:'old'}});
  throw Error('Unexpected path '+path);
 };
 return {fetcher,calls,version:()=>version,puts:()=>puts};
}

test('deployment disabled/branch guard fail before OAuth and never contact API',async()=>{
 for(const patch of [{NOTES_GAS_AUTODEPLOY:'false'},{GITHUB_REF:'refs/heads/main'},{NOTES_GAS_SCRIPT_ID:''}])await assert.rejects(deploy({env:{...env,...patch},files,fetcher:()=>{throw Error('must not contact');}}));
});
test('push exact files, readback, create immutable version, update pinned deployment and verify',async()=>{
 const f=fake();let probes=0;const r=await deploy({env,files,fetcher:f.fetcher,verify:async()=>{probes++;return true;}});
 assert.equal(r.phase,'verified');assert.equal(r.previousVersion,1);assert.equal(r.version,2);assert.equal(f.version(),2);assert.equal(probes,1);
 assert.equal(f.calls.filter(c=>c.method==='PUT'&&c.url.endsWith('/content')).length,1);
 assert.equal(JSON.stringify(r).includes('DO_NOT_LOG'),false);
});
test('wrong project title, extra files or concurrent edit block source replacement',async()=>{
 for(const config of [{title:'Botchitieu'},{extra:true},{changed:true}]){const f=fake(config);await assert.rejects(deploy({env,files,fetcher:f.fetcher}));assert.equal(f.calls.some(c=>c.method==='PUT'),false);}
});
test('health failure and ambiguous network loss roll deployment back with verified readback',async()=>{
 for(const lost of [false,true]){const f=fake({lost});await assert.rejects(deploy({env,files,fetcher:f.fetcher,verify:async()=>false}),e=>{assert.equal(e.report.rollback,'verified');assert.equal(e.report.previousVersion,1);assert.equal(JSON.stringify(e.report).includes('DO_NOT_LOG'),false);return true;});assert.equal(f.version(),1);assert.equal(f.puts(),2);}
});
test('source-only update requires no deployment and runtime scope broadening is blocked',async()=>{
 const f=fake();const r=await deploy({env:{...env,NOTES_GAS_DEPLOYMENT_ID:''},files,fetcher:f.fetcher});assert.equal(r.phase,'source_verified_deployment_not_configured');assert.equal(f.calls.some(c=>c.url.includes('/deployments/')),false);
 const changed=files.map(f=>f.name==='appsscript'?{...f,source:JSON.stringify({oauthScopes:['https://www.googleapis.com/auth/spreadsheets']})}:f);
 await assert.rejects(deploy({env,files:changed,fetcher:()=>{throw Error('must not contact');}}),/RUNTIME_SCOPES_CHANGED/);
});
test('OAuth errors contain no API response or credentials',async()=>{
 await assert.rejects(deploy({env,files,fetcher:async()=>new Response('DO_NOT_LOG_REFRESH_TOKEN',{status:400})}),e=>{assert.equal(e.message,'OAUTH_REFRESH_FAILED');assert.equal(JSON.stringify(e.report).includes('DO_NOT_LOG'),false);return true;});
});

test('OAuth invalid_grant uses fixed diagnostic code and never logs response secrets',async()=>{
 await assert.rejects(deploy({env,files,fetcher:async()=>Response.json({error:'invalid_grant',error_description:'DO_NOT_LOG_REFRESH_TOKEN'},{status:400})}),e=>{assert.equal(e.message,'OAUTH_INVALID_GRANT');assert.equal(JSON.stringify(e.report).includes('DO_NOT_LOG'),false);return true;});
});
test('Apps Script API setup errors are safely distinguished before source writes',async()=>{
 for(const [body,code] of [[{error:{message:'User has not enabled the Apps Script API. See script.google.com/home/usersettings'}},'USER_APPS_SCRIPT_API_DISABLED'],[{error:{details:[{reason:'SERVICE_DISABLED'}]}},'CLOUD_APPS_SCRIPT_API_DISABLED'],[{error:{details:[{reason:'ACCESS_TOKEN_SCOPE_INSUFFICIENT'}]}},'OAUTH_SCOPES_INSUFFICIENT']]){
  let writes=0;const fetcher=async(url,o)=>{if(url.includes('oauth2.googleapis.com'))return Response.json({access_token:'fake'});if(o.method==='PUT')writes++;return Response.json(body,{status:403});};
  await assert.rejects(deploy({env,files,fetcher}),e=>{assert.equal(e.message,code);return true;});assert.equal(writes,0);
 }
});

test('leading whitespace in the intended project title is normalized without relaxing Script ID guard',async()=>{
 const f=fake({title:'    Homepage Notes Prototype  '});const r=await deploy({env,files,fetcher:f.fetcher});assert.equal(r.phase,'verified');
});

test('bootstrap discovers a previously created endpoint without creating duplicates',async()=>{
 const f=fake();let creates=0,probed;
 const endpoint={deploymentId:dep,deploymentConfig:{versionNumber:2,description:'Homepage Notes prototype managed endpoint'},entryPoints:[{entryPointType:'WEB_APP',webApp:{url:'https://script.google.com/macros/s/'+dep+'/exec'}}]};
 const fetcher=async(url,o)=>{
  if(url.endsWith('/deployments?pageSize=50'))return Response.json({deployments:[endpoint]});
  if(url.endsWith('/deployments/'+dep))return Response.json(endpoint);
  if(url.endsWith('/deployments')&&o.method==='POST'){creates++;return Response.json(endpoint);}
  return f.fetcher(url,o);
 };
 const r=await deploy({env:{...env,NOTES_GAS_DEPLOYMENT_ID:'',NOTES_GAS_BOOTSTRAP:'true'},files,fetcher,verify:async url=>{probed=url;return true;}});
 assert.equal(r.phase,'verified');assert.equal(creates,0);assert.equal(probed,endpoint.entryPoints[0].webApp.url);
});
test('bootstrap creates a versioned endpoint once and records metadata on failed health',async()=>{
 const f=fake();let creates=0;
 const endpoint={deploymentId:dep,deploymentConfig:{versionNumber:2},entryPoints:[{entryPointType:'WEB_APP',webApp:{url:'https://script.google.com/macros/s/'+dep+'/exec'}}]};
 const fetcher=async(url,o)=>{
  if(url.endsWith('/deployments?pageSize=50'))return Response.json({deployments:[]});
  if(url.endsWith('/deployments/'+dep))return Response.json(endpoint);
  if(url.endsWith('/deployments')&&o.method==='POST'){creates++;assert.equal(JSON.parse(o.body).versionNumber,2);return Response.json(endpoint);}
  return f.fetcher(url,o);
 };
 await assert.rejects(deploy({env:{...env,NOTES_GAS_DEPLOYMENT_ID:'',NOTES_GAS_BOOTSTRAP:'true'},files,fetcher,verify:async()=>false}),e=>{assert.equal(e.message,'BOOTSTRAP_HEALTH_FAILED');assert.equal(e.report.deploymentId,dep);return true;});assert.equal(creates,1);
});

test('deployment readback tolerates a stale old version before convergence',async()=>{const f=fake({staleRead:true});const r=await deploy({env,files,fetcher:f.fetcher});assert.equal(r.phase,'verified');assert.equal(f.puts(),1);});

test('docs-only change reuses identical deployed content and still requires signed health',async()=>{
 const f=fake({initialCurrent:true});let probes=0;
 const r=await deploy({env,files,fetcher:f.fetcher,verify:async()=>{probes++;return true;}});
 assert.equal(r.phase,'verified_unchanged');assert.equal(r.reusedVersion,true);assert.equal(r.version,1);assert.equal(probes,1);assert.equal(f.calls.some(x=>x.url.includes('script.googleapis.com')&&(x.method==='POST'||x.method==='PUT')),false);
 const bad=fake({initialCurrent:true});await assert.rejects(deploy({env,files,fetcher:bad.fetcher,verify:async()=>false}),/POST_DEPLOY_HEALTH_FAILED/);assert.equal(bad.puts(),0);
});
