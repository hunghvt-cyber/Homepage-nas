const crypto = require('node:crypto');
const ORIGIN = 'https://homepage-nas.vercel.app';
const REPO = 'hunghvt-cyber/Homepage-nas';
const PATH = 'content/guides.json';
const fail = (status, message) => Object.assign(new Error(message), {status});
function key() {
  const secret = process.env.EDITOR_SESSION_SECRET || '';
  if (secret.length < 32) throw fail(503, 'Chưa cấu hình đăng nhập GitHub.');
  return crypto.createHash('sha256').update(secret).digest();
}
function seal(value) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  return Buffer.concat([iv, cipher.update(JSON.stringify(value)), cipher.final(), cipher.getAuthTag()]).toString('base64url');
}
function unseal(value) {
  try {
    const raw = Buffer.from(value || '', 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), raw.subarray(0,12));
    decipher.setAuthTag(raw.subarray(-16));
    const data = JSON.parse(Buffer.concat([decipher.update(raw.subarray(12,-16)),decipher.final()]).toString());
    if (data.exp < Date.now()) return null;
    return data;
  } catch { return null; }
}
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(x => x.trim().split(/=(.*)/s)).filter(x => x.length > 1).map(x => [x[0], x[1]]));
}
function cookie(name, value, age) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
}
async function github(token, path, options={}) {
  const response = await fetch('https://api.github.com'+path, {...options, headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28',...options.headers},signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw fail(response.status === 409 || response.status === 422 ? 409 : response.status === 401 ? 401 : 502, response.status === 409 || response.status === 422 ? 'Nội dung đã thay đổi. Tải lại trước khi lưu.' : 'Không đọc/lưu được GitHub.');
  return response.json();
}
async function permission(token) {
  const repo = await github(token, '/repos/'+REPO);
  if (!repo.permissions?.push) throw fail(403, 'Tài khoản GitHub này chưa có quyền sửa repo.');
}
function validateUpdate(old, update) {
  if (!update || update.slug !== old.slug) throw fail(400, 'Không được đổi đường dẫn hướng dẫn.');
  const out = {...old};
  for (const field of ['title','area','summary','notes','last_cleaned']) {
    if (typeof update[field] !== 'string' || update[field].length > (field === 'notes' ? 8000 : 2000)) throw fail(400,'Nội dung không hợp lệ.');
    out[field] = update[field];
  }
  if (!out.title.trim() || !out.area.trim()) throw fail(400,'Tên và khu vực không được trống.');
  if (out.last_cleaned && (!/^\d{4}-\d{2}-\d{2}$/.test(out.last_cleaned) || !Number.isFinite(Date.parse(out.last_cleaned)) || new Date(out.last_cleaned).toISOString().slice(0,10)!==out.last_cleaned)) throw fail(400,'Ngày vệ sinh không hợp lệ.');
  if (!Array.isArray(update.steps) || update.steps.length<1 || update.steps.length>30 || update.steps.some(x=>typeof x!=='string'||!x.trim()||x.length>4000)) throw fail(400,'Các thao tác không hợp lệ.');
  out.steps = update.steps;
  if (!Array.isArray(update.details) || update.details.length > 12 || update.details.some(x=>!x||typeof x.title!=='string'||!x.title.trim()||x.title.length>200||typeof x.body!=='string'||x.body.length>8000)) throw fail(400,'Thông tin bổ sung không hợp lệ.');
  out.details=update.details.map(({title,body})=>({title,body}));
  return out;
}
module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  const action = new URL(req.url,ORIGIN).searchParams.get('action');
  try {
    if (['login','callback','load'].includes(action) && req.method !== 'GET') throw fail(405,'Sai phương thức.');
    if (['save','logout'].includes(action) && req.method !== 'POST') throw fail(405,'Sai phương thức.');
    if (req.method === 'POST' && req.headers.origin !== ORIGIN) throw fail(403,'Yêu cầu không hợp lệ.');
    const jar = cookies(req);
    if (action === 'login') {
      if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) throw fail(503,'Chưa cấu hình đăng nhập GitHub.');
      const state=crypto.randomBytes(32).toString('hex');
      res.setHeader('Set-Cookie',cookie('__Host-editor_state',seal({state,exp:Date.now()+600000}),600));
      const query=new URLSearchParams({client_id:process.env.GITHUB_CLIENT_ID,redirect_uri:ORIGIN+'/api/editor?action=callback',scope:'repo',state});
      res.writeHead(302,{Location:'https://github.com/login/oauth/authorize?'+query}); return res.end();
    }
    if (action === 'callback') {
      const query=new URL(req.url,ORIGIN).searchParams, saved=unseal(jar['__Host-editor_state']);
      res.setHeader('Set-Cookie',cookie('__Host-editor_state','',0));
      if (!saved || query.get('state')!==saved.state || !query.get('code') || query.has('error')) throw fail(403,'Đăng nhập không thành công. Hãy thử lại.');
      const response=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:process.env.GITHUB_CLIENT_ID,client_secret:process.env.GITHUB_CLIENT_SECRET,code:query.get('code'),redirect_uri:ORIGIN+'/api/editor?action=callback'}),signal:AbortSignal.timeout(15000)});
      const result=await response.json();
      if (!response.ok || !result.access_token || result.error) throw fail(403,'Đăng nhập GitHub không thành công.');
      await permission(result.access_token);
      const user=await github(result.access_token,'/user');
      res.setHeader('Set-Cookie',[cookie('__Host-editor_state','',0),cookie('__Host-editor_session',seal({token:result.access_token,login:user.login,exp:Date.now()+3600000}),3600)]);
      res.writeHead(302,{Location:'/sua/'});return res.end();
    }
    if (action === 'logout') {
      res.setHeader('Set-Cookie',cookie('__Host-editor_session','',0));return res.status(200).json({ok:true});
    }
    if (!['load','save'].includes(action)) throw fail(404,'Không tìm thấy.');
    const session=unseal(jar['__Host-editor_session']);
    if (!session) throw fail(401,'Hãy đăng nhập GitHub để sửa.');
    await permission(session.token);
    const file=await github(session.token,'/repos/'+REPO+'/contents/'+PATH+'?ref=main');
    const guides=JSON.parse(Buffer.from(file.content,'base64').toString());
    if (action==='load') return res.status(200).json({guides,sha:file.sha,login:session.login});
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if (!body || JSON.stringify(body).length>100000) throw fail(400,'Nội dung quá lớn.');
    if (body.sha!==file.sha) throw fail(409,'Nội dung đã thay đổi. Tải lại trước khi lưu.');
    const index=guides.findIndex(x=>x.slug===body.guide?.slug);
    if(index<0) throw fail(400,'Không tìm thấy hướng dẫn.');
    guides[index]=validateUpdate(guides[index],body.guide);
    const saved=await github(session.token,'/repos/'+REPO+'/contents/'+PATH,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'docs: update guide '+guides[index].slug,content:Buffer.from(JSON.stringify(guides,null,2)+'\n').toString('base64'),sha:file.sha,branch:'main'})});
    return res.status(200).json({sha:saved.content.sha,commit:saved.commit.html_url});
  } catch(error) {return res.status(error.status||500).json({error:error.status?error.message:'Có lỗi xảy ra. Hãy thử lại.'});}
};
module.exports._test={seal,unseal,validateUpdate};
