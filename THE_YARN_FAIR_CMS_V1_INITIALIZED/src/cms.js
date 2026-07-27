import { supabase } from './supabase.js';

const mount=document.querySelector('[data-exhibitor-cms]');
let items=[];

function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}

async function token(){const {data:{session}}=await supabase.auth.getSession();return session?.access_token||'';}
async function api(method,body,url='/api/exhibitors'){
  const response=await fetch(url,{method,headers:{'content-type':'application/json','authorization':`Bearer ${await token()}`},body:body?JSON.stringify(body):undefined});
  const result=await response.json();
  if(!response.ok) throw new Error(result.message||result.error||'Operation failed');
  return result;
}

function form(item={}){
  const ex=item.exhibitors||{};
  const contacts=[...(ex.exhibitor_contacts||[])].sort((a,b)=>
    Number(Boolean(b.is_primary))-Number(Boolean(a.is_primary)) ||
    Number(a.display_order||0)-Number(b.display_order||0)
  );
  const primary=contacts[0]||{};
  return `<form class="cms-form" data-cms-form>
    <input type="hidden" name="eventExhibitorId" value="${esc(item.id||'')}">
    <input type="hidden" name="exhibitorId" value="${esc(ex.id||'')}">
    <input type="hidden" name="contactId" value="${esc(primary.id||'')}">
    <div class="field-grid">
      <div class="field"><label>Company name</label><input name="companyName" required value="${esc(ex.company_name||'')}"></div>
      <div class="field"><label>Company name local</label><input name="companyNameLocal" value="${esc(ex.company_name_local||'')}"></div>
    </div>
    <div class="field-grid">
      <div class="field"><label>Country code</label><input name="countryCode" maxlength="2" value="${esc(ex.country_code||'')}"></div>
      <div class="field"><label>Website</label><input name="websiteUrl" value="${esc(ex.website_url||'')}"></div>
    </div>
    <div class="field"><label>説明（日本語）</label><textarea name="descriptionLocal">${esc(ex.description_local||'')}</textarea></div>
    <div class="field"><label>Description (English)</label><textarea name="descriptionEn">${esc(ex.description_en||'')}</textarea></div>
    <div class="field-grid">
      <div class="field"><label>Booth code</label><input name="boothCode" value="${esc(item.booth_code||'')}"></div>
      <div class="field"><label>Display order</label><input type="number" name="displayOrder" value="${Number(item.display_order||0)}"></div>
    </div>
    <h3>Primary contact</h3>
    <div class="field-grid">
      <div class="field"><label>担当者</label><input name="contactNameLocal" value="${esc(primary.contact_name_local||'')}"></div>
      <div class="field"><label>Contact</label><input name="contactNameEn" value="${esc(primary.contact_name_en||'')}"></div>
    </div>
    <div class="field-grid">
      <div class="field"><label>所属（日本語）</label><input name="organizationLocal" value="${esc(primary.organization_label_local||'')}"></div>
      <div class="field"><label>Organization</label><input name="organizationEn" value="${esc(primary.organization_label_en||'')}"></div>
    </div>
    <div class="field-grid">
      <div class="field"><label>Email</label><input type="email" name="contactEmail" value="${esc(primary.email||'')}"></div>
      <div class="field"><label>Phone</label><input name="contactPhone" value="${esc(primary.phone||'')}"></div>
    </div>
    <label class="checkline"><input type="checkbox" name="isPublished" ${item.is_published!==false?'checked':''}> Publicly visible</label>
    <label class="checkline"><input type="checkbox" name="appointmentEnabled" ${item.appointment_enabled?'checked':''}> Appointment enabled</label>
    <div class="phase-actions"><button class="btn primary" type="submit">SAVE</button><button class="btn" type="button" data-cancel>CANCEL</button></div>
    <p class="status-message" data-cms-message></p>
  </form>`;
}
function renderList(){
  if(!mount) return;
  mount.innerHTML=`<div class="phase-actions"><button class="btn primary" type="button" data-new-exhibitor>ADD EXHIBITOR</button></div>
  <div class="table-wrap"><table class="data-table"><thead><tr><th>Order</th><th>Company</th><th>Booth</th><th>Published</th><th>Actions</th></tr></thead><tbody>
  ${items.map((item,index)=>`<tr><td>${item.display_order}</td><td>${esc(item.exhibitors?.company_name)}</td><td>${esc(item.booth_code||'')}</td><td>${item.is_published?'Yes':'No'}</td><td><button class="btn compact" data-edit="${index}">EDIT</button><button class="btn compact danger" data-delete="${esc(item.id)}">REMOVE FROM EVENT</button></td></tr>`).join('')}
  </tbody></table></div>`;
  mount.querySelector('[data-new-exhibitor]').onclick=()=>showForm();
  mount.querySelectorAll('[data-edit]').forEach(btn=>btn.onclick=()=>showForm(items[Number(btn.dataset.edit)]));
  mount.querySelectorAll('[data-delete]').forEach(btn=>btn.onclick=()=>remove(btn.dataset.delete));
}

function showForm(item){
  mount.innerHTML=form(item);
  const el=mount.querySelector('[data-cms-form]');
  el.querySelector('[data-cancel]').onclick=renderList;
  el.onsubmit=async event=>{
    event.preventDefault();
    const fd=new FormData(el);const body=Object.fromEntries(fd.entries());
    body.isPublished=fd.get('isPublished')==='on';body.appointmentEnabled=fd.get('appointmentEnabled')==='on';
    const msg=el.querySelector('[data-cms-message]');msg.textContent='Saving…';
    try{await api(body.eventExhibitorId?'PUT':'POST',body);await load();}catch(error){msg.className='status-message status-error';msg.textContent=error.message;}
  };
}

async function remove(id){
  if(!confirm('Remove this exhibitor from this event? The exhibitor master record will remain.')) return;
  try{await api('DELETE',null,`/api/exhibitors?eventExhibitorId=${encodeURIComponent(id)}`);await load();}catch(error){alert(error.message);}
}

async function load(){
  if(!mount) return;
  mount.innerHTML='<p>Loading exhibitors…</p>';
  try{const result=await api('GET');items=result.items||[];renderList();}catch(error){mount.innerHTML=`<p class="status-error">${esc(error.message)}</p>`;}
}
load();
