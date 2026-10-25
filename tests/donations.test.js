import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDonationFeed,fetchDonationFeed} from '../lib/donations.js';
import {createDonationsHandler} from '../lib/donations.js';
const now=Date.now(),row=(n,h=0)=>({id:n.toString(16).padStart(64,'0'),amount:10000,received_at:new Date(now-h*3600000).toISOString(),message:'=1+1 <script>test</script>',thanks:'Cảm ơn đại ca đã tiếp tế pate!'}),feed=items=>({schema:1,bank:'MB',enabled:true,server_time:new Date(now).toISOString(),items});
test('rolling day includes every recent gift and at least newest ten older gifts',()=>{
 const old=Array.from({length:20},(_,i)=>row(i,25+i));assert.equal(validateDonationFeed(feed(old)).items.length,10);
 const recent=Array.from({length:30},(_,i)=>row(i,i/2));assert.equal(validateDonationFeed(feed(recent)).items.length,30);
 assert.equal(validateDonationFeed(feed([row(1,50)])).items.length,1);
 assert.equal(validateDonationFeed(feed([])).items.length,0);
});
test('public projection strips all non-donation fields and rejects bad amounts/duplicates',()=>{
 const out=validateDonationFeed(feed([{...row(1),balance:999,account:'private',raw:'private'}]));assert.deepEqual(Object.keys(out.items[0]),['id','amount','received_at','message','thanks']);
 for(const amount of [-1,0,1.5,1e13])assert.throws(()=>validateDonationFeed(feed([{...row(1),amount}])));
 assert.throws(()=>validateDonationFeed(feed([row(1),row(1)])));assert.throws(()=>validateDonationFeed({...feed([]),bank:'VIB'}));
});
test('GAS redirect is allowlisted and cannot redirect to arbitrary destinations',async()=>{
 let calls=0;const result=await fetchDonationFeed(async()=>++calls===1?{status:302,headers:{get:()=> 'https://script.googleusercontent.com/macros/echo?test=1'}}:{status:200,ok:true,text:async()=>JSON.stringify(feed([]))});assert.equal(result.bank,'MB');assert.equal(calls,2);
 for(const url of ['https://evil.test/','http://script.googleusercontent.com/x','https://user@script.googleusercontent.com/x'])await assert.rejects(fetchDonationFeed(async()=>({status:302,headers:{get:()=>url}})));
});
test('public GET is read-only; POST never reaches upstream and errors are sanitized',async()=>{
 const result={};const res={setHeader(){},status(code){result.code=code;return this;},json(value){result.data=value;return value;}};
 const handler=createDonationsHandler({request:async()=>{throw Error('private upstream body');}});
 await handler({method:'POST'},res);assert.equal(result.code,405);
 await handler({method:'GET'},res);assert.equal(result.code,502);assert.ok(!JSON.stringify(result).includes('private upstream'));
});
