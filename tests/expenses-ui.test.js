import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
test('expense drilldown keeps date and amount order, payer scope and clears private rows on logout',async()=>{
 const ids=['expense-month','expense-message','expense-updated','expense-summary','expense-days','expense-categories','expense-details','expense-detail-title','expense-detail-count','expense-transactions','expenses-workspace'];
 const dom=new JSDOM(ids.map(id=>`<div id="${id}"></div>`).join('')+'<select id="expense-payer"><option value="">Cả nhà</option></select><select id="expense-sort"><option value="date">Date</option><option value="amount">Amount</option></select><button id="expense-refresh"></button><button id="expense-detail-close"></button>',{runScripts:'outside-only'});
 const w=dom.window,d=w.document;const row=(day,amount,category,payerId='a')=>({day:'2026-10-'+day,amount,category,payerId,payer:payerId,description:'Ăn trưa <img src=x onerror=alert(1)>',type:'ChiTieu'});
 w.PortalAccount={state:{authenticated:true},api:async()=>({transactions:[row('02',500,'Ăn uống'),row('19',100,'Khác'),row('09',900,'Ăn uống','b'),{...row('19',50,'Lãi'),type:'ThuNhap'}],measuredAt:'2026-10-19'})};
 w.eval(readFileSync('public/expenses.js','utf8'));w.dispatchEvent(new w.CustomEvent('account-change',{detail:{authenticated:true}}));await new Promise(r=>setTimeout(r,0));
 const labels=()=>[...d.querySelectorAll('#expense-days button > span:first-child')].map(e=>e.textContent);
 assert.deepEqual(labels(),['19/10/2026','09/10/2026','02/10/2026']);
 d.getElementById('expense-sort').value='amount';d.getElementById('expense-sort').dispatchEvent(new w.Event('change'));assert.deepEqual(labels(),['09/10/2026','02/10/2026','19/10/2026']);
 d.querySelector('#expense-days button').click();assert.equal(d.querySelectorAll('#expense-transactions tr').length,1);assert.match(d.getElementById('expense-transactions').textContent,/900/);assert.match(d.getElementById('expense-transactions').textContent,/Ăn trưa/);assert.equal(d.querySelector('#expense-transactions img'),null);
 d.querySelector('#expense-categories button').click();assert.equal(d.querySelectorAll('#expense-transactions tr').length,2);
 d.getElementById('expense-payer').value='a';d.getElementById('expense-payer').dispatchEvent(new w.Event('change'));assert.equal(d.querySelectorAll('#expense-transactions tr').length,1);
 d.querySelectorAll('#expense-summary button')[1].click();assert.match(d.getElementById('expense-transactions').textContent,/Lãi/);
 w.dispatchEvent(new w.CustomEvent('account-change',{detail:{authenticated:false}}));assert.equal(d.getElementById('expense-transactions').children.length,0);assert.equal(d.getElementById('expense-details').hidden,true);
});
