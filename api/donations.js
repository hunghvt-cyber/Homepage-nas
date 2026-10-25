import {reply,fail,HttpError} from '../lib/security.js';
import {fetchDonationFeed} from '../lib/donations.js';
export function createDonationsHandler({request=fetch}={}){
 return async(req,res)=>{
  try{
   if(req.method!=='GET')throw new HttpError(405,'Chỉ hỗ trợ đọc sổ donate.');
   // Fixed, public sanitized GAS feed. No private ledger or Gemini call on reads.
   return reply(res,200,await fetchDonationFeed(request));
  }catch(error){return fail(res,error.status?error:new HttpError(502,'Chưa kết nối được sổ donate.'));}
 };
}
export default createDonationsHandler();
