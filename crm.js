(function(){
 'use strict';let token='',db=null,selected='',busy=false,lastActivity=Date.now();
 const $=s=>document.querySelector(s),escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
 const openCases=c=>c.cases.some(item=>!['RESOLVED','CLOSED'].includes(item.status));
 const pendingDeletion=c=>c.deletions.some(item=>!['COMPLETED','DECLINED'].includes(item.status));
 const due=c=>c.followup&&c.followup<=today();
 function message(text){$('#message').textContent=text;}
 function lock(){token='';db=null;selected='';$('#workspace').hidden=true;$('#login').hidden=false;$('#lock').hidden=true;$('#detail').replaceChildren();$('#customer-list').replaceChildren();$('#overview').replaceChildren();$('#login-form').reset();message('Dashboard locked.');}
 async function request(input){
  const key=token;if(!key)throw Error('Unlock the dashboard first.');
  const response=await fetch('/api/crm',{method:input?'POST':'GET',headers:{authorization:`Bearer ${key}`,...(input?{'content-type':'application/json'}:{})},cache:'no-store',...(input?{body:JSON.stringify({...input,revision:db?.revision})}:{})});
  if(key!==token)throw Error('The dashboard was locked.');
  if(!response.headers.get('content-type')?.includes('application/json'))throw Error('CRM requires the local development server. Start npm run dev.');
  const data=await response.json();if(key!==token)throw Error('The dashboard was locked.');if(!response.ok){if(response.status===401)lock();throw Error(data.error||'Customer request failed.');}return data;
 }
 async function run(work){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>{if(b.id!=='lock')b.disabled=true;});try{await work();}catch(error){message(error.message);}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
 function renderList(){const query=$('#search').value.toLowerCase(),filter=$('#filter').value,customers=db.customers.filter(c=>(`${c.name} ${c.email}`.toLowerCase().includes(query))&&(filter==='all'||filter==='due'&&due(c)||filter==='support'&&openCases(c)||filter==='deletion'&&pendingDeletion(c)));$('#customer-list').innerHTML=customers.length?customers.map(c=>`<button class="customer" data-customer="${escape(c.id)}" aria-pressed="${c.id===selected}">${escape(c.name)}<small>${escape(c.email)}</small><small>${escape(c.plan)} · ${due(c)?'Follow-up due':c.followup?escape(c.followup):'No follow-up'}</small></button>`).join(''):'<p>No matching customers.</p>';}
 function render(){
  $('#overview').innerHTML=[['Customers',db.customers.length],['Follow-ups due',db.customers.filter(due).length],['With open cases',db.customers.filter(openCases).length],['Deletion requests',db.customers.filter(pendingDeletion).length]].map(([label,n])=>`<div><b>${n}</b>${label}</div>`).join('');renderList();const c=db.customers.find(item=>item.id===selected);if(!c){$('#detail').innerHTML='<h2>Select a customer</h2><p>Add a customer or import local profiles to get started.</p>';return;}
  const status=(item,action,values)=>`<form data-action="${action}" data-item="${escape(item.id)}"><label>Status<select name="status">${values.map(s=>`<option ${s===item.status?'selected':''}>${s}</option>`).join('')}</select></label><button>Save status</button></form>`;
  $('#detail').innerHTML=`<h1>${escape(c.name)}</h1><p>${escape(c.email)}</p><form data-action="profile"><div class="profile-grid"><label>Reported subscription<select name="plan">${['UNKNOWN','FREE','PRO'].map(s=>`<option ${s===c.plan?'selected':''}>${s}</option>`).join('')}</select></label><label>Next follow-up<input name="followup" type="date" value="${escape(c.followup)}"></label></div><small>Administrative label only. Does not change billing or editor access.</small><p><button>Save customer details</button></p></form><h2>Internal notes</h2><form data-action="note"><label>New note<textarea name="text" maxlength="2000" required></textarea></label><button>Add note</button></form>${c.notes.slice().reverse().map(n=>`<div class="record"><small>${escape(n.createdAt)}</small><p>${escape(n.text)}</p></div>`).join('')||'<p>No notes yet.</p>'}<h2>Support cases</h2><form data-action="case"><label>Case title<input name="title" maxlength="200" required></label><button>Add case</button></form>${c.cases.map(item=>`<div class="record"><b>${escape(item.title)}</b>${status(item,'caseStatus',['NEW','OPEN','WAITING','RESOLVED','CLOSED'])}</div>`).join('')||'<p>No cases yet.</p>'}<h2>Deletion requests</h2><p>Track verification and handling here. Changing status does not delete accounts, billing, source files or provider records.</p><form data-action="deletion"><label>Request details<textarea name="text" maxlength="2000" required></textarea></label><button>Record deletion request</button></form>${c.deletions.map(item=>`<div class="record"><p>${escape(item.reason)}</p>${status(item,'deletionStatus',['REQUESTED','VERIFYING','IN_PROGRESS','COMPLETED','DECLINED'])}</div>`).join('')||'<p>No deletion requests.</p>'}`;
 }
 $('#login-form').onsubmit=e=>{e.preventDefault();run(async()=>{token=e.target.elements.key.value.trim();try{db=await request();}catch(error){token='';throw error;}e.target.reset();$('#login').hidden=true;$('#workspace').hidden=false;$('#lock').hidden=false;lastActivity=Date.now();render();message('Local customer records loaded.');});};
 $('#lock').onclick=lock;$('#search').oninput=renderList;$('#filter').onchange=renderList;
 $('#refresh').onclick=()=>run(async()=>{db=await request();render();message('Records refreshed.');});
 $('#create').onsubmit=e=>{e.preventDefault();const form=e.target;run(async()=>{db=await request({action:'create',name:form.elements.name.value,email:form.elements.email.value});selected=db.customers.at(-1).id;form.reset();render();message('Customer added.');});};
 $('#customer-list').onclick=e=>{const button=e.target.closest('[data-customer]');if(button&&!busy){selected=button.dataset.customer;render();}};
 $('#detail').onsubmit=e=>{const form=e.target.closest('form[data-action]');if(!form)return;e.preventDefault();const input={...Object.fromEntries(new FormData(form)),action:form.dataset.action,customerId:selected,itemId:form.dataset.item};run(async()=>{db=await request(input);render();message('Record saved.');});};
 $('#import-local').onclick=()=>run(async()=>{
  const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};
  const accounts=read('zorifi-accounts-v1');if(!Array.isArray(accounts))throw Error('No local Zorifi profiles found in this browser.');
  const customers=accounts.filter(a=>a&&a.email&&a.name).slice(0,500).map(a=>{const support=read(`zorifi-support-cases-v1:${encodeURIComponent(a.id)}`);return {name:a.name,email:a.email,cases:(support?.cases||[]).map(c=>({id:c.id,title:c.summary||c.description,status:c.status}))};});
  if(!customers.length)throw Error('No local profiles with an email address were found.');db=await request({action:'import',customers});render();message(`Imported or matched ${customers.length} local profiles and available case summaries. Passwords and tokens were excluded. Case updates here are independent of the editor.`);
 });
 for(const event of ['pointerdown','keydown'])document.addEventListener(event,()=>lastActivity=Date.now());
 setInterval(()=>{if(token&&Date.now()-lastActivity>15*60*1000)lock();},30000);
 window.addEventListener('pagehide',lock);
})();
