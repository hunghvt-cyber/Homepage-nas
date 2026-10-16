// TEMPLATE ONLY: outside /api so the existing Vercel project cannot expose it.
// For an isolated checkout/project copy this file to api/notes-prototype.mjs;
// adjust imports to ../experiments/notes-gas/adapter.mjs and ../lib/security.js.
import {createGasClient,prepareRequest} from '../adapter.mjs';
import {owner,sameOrigin,body,reply,fail,HttpError} from '../../../lib/security.js';
export function createPrototypeHandler({authorize=owner,client,env=process.env}={}) {
  return async (req,res)=>{
    try {
      if(env.VERCEL_ENV==='production'||env.NOTES_GAS_PROTOTYPE_ENABLED!=='true')throw new HttpError(404,'Prototype disabled.');
      if(req.method!=='POST')throw new HttpError(405,'POST required.');
      sameOrigin(req);const b=body(req);
      if(!/^[0-9a-f-]{36}$/.test(b.requestId||'')||!Number.isSafeInteger(b.issuedAt))throw new HttpError(400,'Stable requestId and issuedAt required.');
      if(!b.token)await authorize(req,res);
      const key=env.NOTES_GAS_HMAC_KEY;
      const {req:command,token}=prepareRequest(b,key);
      const call=client||createGasClient({url:env.NOTES_GAS_URL,key,observe:info=>{res.setHeader('X-Prototype-Request',info.reference);res.setHeader('X-Prototype-Log',info.persisted?'persisted':'unavailable');}});
      const result=await call(command);
      return reply(res,200,{...result,...(token?{token}:{})});
    }catch(e){return fail(res,new HttpError(e.status||503,e.status?e.message:'Prototype unavailable.'));}
  };
}
export default createPrototypeHandler();
