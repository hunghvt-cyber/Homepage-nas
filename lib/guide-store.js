import https from 'node:https';
import {createHash,randomUUID} from 'node:crypto';
import {HttpError} from './security.js';
const unavailable=()=>new HttpError(503,'Chưa kết nối được kho hướng dẫn. Bản đang nhập vẫn được giữ.');
const hash=text=>createHash('sha256').update(text).digest('hex');
const LIMIT=3000000;
export function createGuideDav(env=process.env) {
  const {KOOFR_GUIDES_USER:user,KOOFR_GUIDES_APP_PASSWORD:password,KOOFR_GUIDES_NAMESPACE:namespace}=env;
  if(!user || !password || !/^Homepage-Guides-[a-f0-9-]{36}$/.test(namespace||'') ||
    env.VERCEL_ENV && env.VERCEL_ENV!=='production' ||
    env.VERCEL_PROJECT_ID && env.VERCEL_PROJECT_ID!=='prj_3CCmGVbfaymDVoO66d6MPU1CQ1nw') throw unavailable();
  // Koofr inherited locks and writes use the same connection.
  const agent=new https.Agent({keepAlive:true,maxSockets:1});
  const root='/dav/Koofr/'+encodeURIComponent(namespace)+'/';
  return {close:()=>agent.destroy(),request(method,file='',headers={},text='') {
    if(file && !/^[a-z0-9-]+\.json$/.test(file)) throw unavailable();
    return new Promise((resolve,reject)=>{
      const req=https.request({hostname:'app.koofr.net',path:root+file,method,agent,
        headers:{Authorization:'Basic '+Buffer.from(user+':'+password).toString('base64'),...headers,
          ...(text?{'Content-Length':Buffer.byteLength(text)}:{})}},res=>{
        const chunks=[];let length=0;
        res.on('data',chunk=>{length+=chunk.length;if(length>LIMIT)res.destroy(unavailable());else chunks.push(chunk);});
        res.on('error',()=>reject(unavailable()));
        res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text:Buffer.concat(chunks).toString('utf8')}));
      });
      const timer=setTimeout(()=>req.destroy(unavailable()),10000);
      req.on('close',()=>clearTimeout(timer));req.on('error',()=>reject(unavailable()));req.end(text);
    });
  }};
}
export function seedGuide(guide,history=[],updatedAt=null) {
  return {version:1,guide,revision:randomUUID(),sha256:hash(JSON.stringify(guide)),updatedAt,history:history.slice(0,5),receipts:[]};
}
export function createGuideStore({slugs,connect=()=>createGuideDav(),ready=()=>process.env.KOOFR_GUIDES_READY==='true'}={}) {
  const allowed=new Set(slugs);
  function check(slug) {if(!allowed.has(slug))throw new HttpError(404,'Không tìm thấy hướng dẫn.');if(!ready())throw unavailable();}
  async function read(dav,slug) {
    const r=await dav.request('GET',slug+'.json');
    // Every guide must have been explicitly seeded during migration.
    if(r.status!==200)throw unavailable();
    let v;try{v=JSON.parse(r.text);}catch{throw unavailable();}
    if(v?.version!==1 || v.guide?.slug!==slug || !/^[a-f0-9-]{36}$/.test(v.revision||'') ||
      !Array.isArray(v.history) || v.history.length>5 || !Array.isArray(v.receipts) || v.receipts.length>24 ||
      hash(JSON.stringify(v.guide))!==v.sha256)throw unavailable();
    return v;
  }
  return {
    async read(slug) {check(slug);const dav=connect();try{return await read(dav,slug);}finally{dav.close();}},
    async save(slug,guide,revision,operationId) {
      check(slug);if(!/^[a-f0-9-]{36}$/.test(operationId||''))throw new HttpError(400,'Mã lần lưu không hợp lệ.');
      const dav=connect();let token;
      try {
        const lock=await dav.request('LOCK','',{'Depth':'infinity','Timeout':'Second-60','Content-Type':'application/xml'},
          '<?xml version="1.0"?><D:lockinfo xmlns:D="DAV:"><D:lockscope><D:exclusive/></D:lockscope><D:locktype><D:write/></D:locktype></D:lockinfo>');
        if(lock.status===423)throw new HttpError(409,'Có thiết bị khác đang lưu. Vui lòng thử lại.');
        token=lock.headers['lock-token'];
        if(![200,201].includes(lock.status)||!/^<[^<>\r\n]{1,500}>$/.test(token||'')){token=undefined;throw unavailable();}
        const current=await read(dav,slug),fingerprint=hash(JSON.stringify({guide,revision}));
        const receipt=current.receipts.find(r=>r.id===operationId);
        if(receipt){if(receipt.fingerprint!==fingerprint)throw new HttpError(409,'Mã lần lưu đã dùng cho nội dung khác.');return current;}
        if(current.revision!==revision)throw new HttpError(409,'Hướng dẫn đã đổi trên thiết bị khác. Bản đang nhập vẫn được giữ; tải lại bản mới trước khi lưu.');
        const value={...seedGuide(guide,[{guide:current.guide,updatedAt:current.updatedAt},...current.history],new Date().toISOString()),
          receipts:[{id:operationId,fingerprint},...current.receipts].slice(0,24)};
        const text=JSON.stringify(value);if(Buffer.byteLength(text)>LIMIT)throw new HttpError(413,'Hướng dẫn và lịch sử quá dài để lưu.');
        let put;try{put=await dav.request('PUT',slug+'.json',{'If':'('+token+')','Content-Type':'application/json'},text);}catch{}
        // Read back even when the PUT acknowledgement was lost.
        const confirmed=await read(dav,slug);
        if(JSON.stringify(confirmed)!==text){if([412,423].includes(put?.status))throw new HttpError(409,'Phiên lưu hết hạn. Bản đang nhập vẫn được giữ.');throw unavailable();}
        return confirmed;
      } finally {if(token){try{await dav.request('UNLOCK','',{'Lock-Token':token});}catch{}}dav.close();}
    }
  };
}
