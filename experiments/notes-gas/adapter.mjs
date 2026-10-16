import {createHmac,createHash,randomUUID,timingSafeEqual} from 'node:crypto';
const mac=(key,s)=>createHmac('sha256',key).update(s).digest('hex');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export class BackendError extends Error {constructor(status,code){super(code);this.status=status;}}
export function createGasClient({url,key,fetcher=fetch,timeoutMs=12000,attempts=2,observe=()=>{},onAttempt=()=>{},wait=ms=>new Promise(r=>setTimeout(r,ms))}) {
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url||'')||!/^[a-f0-9]{64}$/.test(key||''))throw new BackendError(503,'PROTOTYPE_NOT_CONFIGURED');
  return async function call(req) {
    if(!/^[0-9a-f-]{36}$/.test(req.requestId||''))throw new BackendError(400,'REQUEST_ID_REQUIRED');
    const request=JSON.stringify(req);
    if(Buffer.byteLength(request)>3000000)throw new BackendError(413,'REQUEST_TOO_LARGE');
    for(let attempt=0;attempt<attempts;attempt++) {
      const started=performance.now(),metrics={attempt:attempt+1,stage:'post',ok:false};let mark=started;
      try {
        const sentAt=Date.now(),signature=mac(key,'request\n'+sentAt+'\n'+request);
        const signal=AbortSignal.timeout(timeoutMs);
        let response=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({v:1,sentAt,request,signature}),redirect:'manual',signal});
        metrics.postMs=performance.now()-mark;mark=performance.now();
        if([301,302,303].includes(response.status)) {
          const location=response.headers.get('location'),target=new URL(location||'',url);
          if(target.protocol!=='https:'||target.hostname!=='script.googleusercontent.com'||target.username||target.password)throw new BackendError(502,'UNEXPECTED_REDIRECT');
          // GET redirect must never forward signed request body or credentials.
          metrics.stage='redirect';response=await fetcher(target.href,{method:'GET',redirect:'error',signal});
        }
        metrics.redirectMs=performance.now()-mark;mark=performance.now();metrics.stage='body';
        if(!response.ok)throw new BackendError([429,500,502,503,504].includes(response.status)?503:502,'UPSTREAM_HTTP');
        if(!response.headers.get('content-type')?.includes('application/json'))throw new BackendError(502,'UPSTREAM_NOT_JSON');
        const text=await response.text();
        metrics.bodyMs=performance.now()-mark;mark=performance.now();metrics.stage='verify';
        if(Buffer.byteLength(text)>4000000)throw new BackendError(413,'RESPONSE_TOO_LARGE');
        let wire;try{wire=JSON.parse(text);}catch{throw new BackendError(502,'UPSTREAM_NOT_JSON');}
        if(typeof wire.body!=='string'||!equal(wire.signature,mac(key,'response\n'+req.requestId+'\n'+wire.body)))throw new BackendError(502,'RESPONSE_AUTH_INVALID');
        const data=JSON.parse(wire.body);
        if(data.observability){try{observe(data.observability);}catch{}}
        if(!data.ok)throw new BackendError(data.status||503,data.code||'UPSTREAM_ERROR');
        metrics.verifyMs=performance.now()-mark;metrics.ok=true;metrics.stage='complete';return data.result;
      } catch(e) {
        const error=e instanceof BackendError?e:new BackendError(503,'NETWORK_OR_TIMEOUT');
        metrics.durationMs=performance.now()-started;metrics.code=/^[A-Z_]{1,64}$/.test(error.message)?error.message:'ERROR';
        if(error.status!==503||attempt===attempts-1)throw error;
        await wait(250*2**attempt+Math.floor(Math.random()*100));
      } finally {metrics.durationMs??=performance.now()-started;try{onAttempt(metrics);}catch{}}
    }
  };
}
// Request IDs and issuedAt are supplied by the test caller and reused verbatim on retry.
export function prepareRequest(b,key) {
  const req={requestId:b.requestId,issuedAt:b.issuedAt,actor:b.token?'share':'owner',op:b.op,payload:{...(b.payload||{}),...(b.token?{token:b.token}:{})}};
  let token;
  if(req.op==='shareCreate') {
    const secret=mac(key,'capability\n'+req.requestId),id=createHash('sha256').update('id\n'+secret).digest('hex').slice(0,32);
    token=id+'.'+secret;req.payload.shareId=id;req.payload.tokenHash=createHash('sha256').update(secret).digest('hex');
  }
  if(req.op==='save'&&!req.payload.id)req.payload.id=req.requestId;
  return {req,token};
}
export const newRequest=(op,payload={},actor='owner')=>({op,payload,actor,requestId:randomUUID(),issuedAt:Date.now()});
