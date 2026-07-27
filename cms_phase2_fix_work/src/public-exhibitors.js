import { supabase } from './supabase.js';

let cached = [];

function escapeHtml(value){
  return String(value ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');
}

async function loadExhibitors(){
  const { data, error } = await supabase
    .from('event_exhibitors')
    .select(`
      id,display_order,booth_code,is_published,appointment_enabled,
      exhibitors(
        id,company_name,company_name_local,country_code,website_url,
        description_local,description_en,is_active,
        exhibitor_contacts(
          id,contact_name_local,contact_name_en,
          organization_label_local,organization_label_en,
          email,phone,is_primary,display_order
        )
      ),
      events!inner(event_code,is_public)
    `)
    .eq('events.event_code','TYF-TYO-AW26')
    .eq('events.is_public',true)
    .eq('is_published',true)
    .order('display_order',{ascending:true});

  if(error) throw error;
  cached=(data||[]).map(row=>({
    eventExhibitorId:row.id,
    displayOrder:row.display_order,
    boothCode:row.booth_code,
    appointmentEnabled:row.appointment_enabled,
    ...row.exhibitors,
    contacts:[...(row.exhibitors?.exhibitor_contacts||[])].sort((a,b)=>(a.display_order||0)-(b.display_order||0))
  }));
  return cached;
}

function lang(){ return document.documentElement.lang === 'en' ? 'en' : 'ja'; }

function renderGrid(){
  const mount=document.querySelector('[data-company-grid]');
  if(!mount) return;
  mount.innerHTML=cached.map(company=>`
    <a class="company-card" href="/company.html?id=${encodeURIComponent(company.id)}">
      <span><strong>${escapeHtml(company.company_name)}</strong>${company.boothCode?`<small>${escapeHtml(company.boothCode)}</small>`:''}</span>
      <span aria-hidden="true">›</span>
    </a>`).join('');
}

function renderContacts(){
  const mount=document.querySelector('[data-contact-list]');
  if(!mount) return;
  const selected=lang();
  mount.innerHTML=cached.map(company=>{
    const contacts=company.contacts||[];
    return `<div class="contact-row">
      <div class="contact-name">${escapeHtml(company.company_name)}</div>
      <div>${contacts.map(c=>{
        const org=selected==='en'?c.organization_label_en:c.organization_label_local;
        const name=selected==='en'?(c.contact_name_en||c.contact_name_local):(c.contact_name_local||c.contact_name_en);
        return `<div class="contact-person">${escapeHtml([org,name].filter(Boolean).join(' '))}</div>`;
      }).join('')}</div>
      <div class="contact-email">${contacts.map(c=>`<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>`).join('<br>')}</div>
    </div>`;
  }).join('');
}

function renderDetail(){
  const mount=document.querySelector('[data-company-detail]');
  if(!mount) return;
  const requested=new URLSearchParams(location.search).get('id');
  const company=cached.find(c=>c.id===requested)||cached[0];
  if(!company){ mount.innerHTML='<p>No exhibitor data.</p>'; return; }
  const selected=lang();
  const description=selected==='en'?(company.description_en||company.description_local):(company.description_local||company.description_en);
  mount.innerHTML=`
    <div class="kicker">COMPANY</div>
    <h1>${escapeHtml(company.company_name)}</h1>
    ${company.company_name_local?`<p class="company-local-name">${escapeHtml(company.company_name_local)}</p>`:''}
    ${description?`<div class="company-description">${escapeHtml(description).replaceAll('\n','<br>')}</div>`:''}
    <dl class="company-meta">
      <dt>${selected==='en'?'Contact':'担当者'}</dt>
      <dd>${(company.contacts||[]).map(c=>{
        const org=selected==='en'?c.organization_label_en:c.organization_label_local;
        const name=selected==='en'?(c.contact_name_en||c.contact_name_local):(c.contact_name_local||c.contact_name_en);
        return escapeHtml([org,name].filter(Boolean).join(' '));
      }).join('<br>')||'—'}</dd>
      <dt>Email</dt>
      <dd>${(company.contacts||[]).map(c=>`<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>`).join('<br>')||'—'}</dd>
      ${company.website_url?`<dt>Website</dt><dd><a href="${escapeHtml(company.website_url)}" target="_blank" rel="noopener">${escapeHtml(company.website_url)}</a></dd>`:''}
    </dl>
    <p><a class="btn" href="/exhibitors.html">${selected==='en'?'Back to Exhibitors':'出展企業一覧へ戻る'}</a></p>`;
}

function renderAll(){ renderGrid(); renderContacts(); renderDetail(); }

async function init(){
  const loading=document.querySelector('[data-exhibitor-loading]');
  try{
    await loadExhibitors();
    renderAll();
    if(loading) loading.hidden=true;
  }catch(error){
    console.error(error);
    if(loading){loading.textContent=document.documentElement.lang==='en'?'Unable to load exhibitors.':'出展企業情報を読み込めませんでした。';}
  }
}

window.addEventListener('tyf-language-change',renderAll);
init();
