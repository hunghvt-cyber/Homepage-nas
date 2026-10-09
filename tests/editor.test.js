const test=require('node:test'),assert=require('node:assert/strict');
process.env.EDITOR_SESSION_SECRET='test-only-session-secret-32-characters';
const handler=require('../api/editor');
const {seal,unseal,validateUpdate}=handler._test;
const original={slug:'fixed-url',title:'Tên',area:'Bếp',summary:'',steps:['Bật'],notes:'',images:[{src:'/images/existing.webp'}],custom:'keep'};
const update={...original,last_cleaned:'',details:[]};
function response(){return {code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},json(v){this.body=v;return this;},writeHead(c,h){this.code=c;Object.assign(this.headers,h);},end(){}};}
test('encrypted session: roundtrip, expiry, tampering',()=>{
  const token=seal({token:'secret-test-token',exp:Date.now()+10000});
  assert(!token.includes('secret-test-token'));assert.equal(unseal(token).token,'secret-test-token');
  assert.equal(unseal(seal({exp:Date.now()-1})),null);assert.equal(unseal('bad'+token),null);
});
test('immutable slug and preservation of images/unrecognized fields',()=>{
  assert.throws(()=>validateUpdate(original,{...update,slug:'changed'}));
  const result=validateUpdate(original,{...update,images:[]});assert.deepEqual(result.images,original.images);assert.equal(result.custom,'keep');
  assert.throws(()=>validateUpdate(original,{...update,last_cleaned:'2026-02-30'}));
  assert.throws(()=>validateUpdate(original,{...update,steps:[]}));
});
test('unauthenticated access, cross-origin save and method rejection',async()=>{
  for(const [req,code] of [[{method:'GET',url:'/api/editor?action=load',headers:{}},401],[{method:'POST',url:'/api/editor?action=save',headers:{origin:'https://evil.example'}},403],[{method:'GET',url:'/api/editor?action=save',headers:{}},405]]){const res=response();await handler(req,res);assert.equal(res.code,code);}
});
test('callback with invalid state cannot exchange code',async()=>{
  const res=response();await handler({method:'GET',url:'/api/editor?action=callback&code=x&state=wrong',headers:{}},res);assert.equal(res.code,403);
});
test('permission and concurrent update protections; only selected guide written',async()=>{
  const savedFetch=global.fetch;const cookies='__Host-editor_session='+seal({token:'test',login:'editor',exp:Date.now()+10000});
  let write=null,push=true;
  const guides=[original,{...original,slug:'other'}];
  global.fetch=async(url,options)=>{let data;if(url.endsWith('/repos/hunghvt-cyber/Homepage-nas'))data={permissions:{push}};else if(options.method==='PUT'){write=JSON.parse(options.body);data={content:{sha:'new-sha'},commit:{html_url:'https://github.com/hunghvt-cyber/Homepage-nas/commit/test'}};}else data={sha:'current-sha',content:Buffer.from(JSON.stringify(guides)).toString('base64')};return {ok:true,json:async()=>data};};
  try {
    const req={method:'POST',url:'/api/editor?action=save',headers:{origin:'https://homepage-nas.vercel.app',cookie:cookies},body:{sha:'old-sha',guide:update}};
    let res=response();await handler(req,res);assert.equal(res.code,409);assert.equal(write,null);
    req.body.sha='current-sha';push=false;res=response();await handler(req,res);assert.equal(res.code,403);assert.equal(write,null);
    push=true;res=response();await handler(req,res);assert.equal(res.code,200);assert.equal(write.branch,'main');assert.equal(write.sha,'current-sha');
    const contents=JSON.parse(Buffer.from(write.content,'base64').toString());assert.deepEqual(contents[1],guides[1]);
  } finally {global.fetch=savedFetch;}
});
