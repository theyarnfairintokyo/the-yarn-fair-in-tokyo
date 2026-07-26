function vals(f,n){return [...f.querySelectorAll(`[name="${n}"]:checked`)].map(x=>x.value)}
const f=document.querySelector('#visitor-registration'),m=document.querySelector('[data-registration-message]');
f?.addEventListener('submit',async e=>{e.preventDefault();const lang=document.documentElement.lang==='en'?'en':'ja';
const dates=vals(f,'planned_visit_dates');if(!dates.length){m.className='status-message status-error';m.textContent=lang==='en'?'Select at least one planned visit date.':'来場予定日を1日以上選択してください。';return}
const buttons=f.querySelectorAll('button[type=submit]');buttons.forEach(b=>b.disabled=true);m.textContent=lang==='en'?'Registering…':'登録しています…';
const p={fullName:f.full_name.value.trim(),romanName:f.roman_name.value.trim(),companyName:f.company_name.value.trim(),
companyNameEn:f.company_name_en.value.trim(),department:f.department.value.trim(),positionTitle:f.position_title.value.trim(),
email:f.email.value.trim(),phone:f.phone.value.trim(),countryRegion:f.country_region.value.trim(),industry:f.industry.value,
language:lang,plannedVisitDates:dates,interestMaterials:vals(f,'interest_materials'),organizerMessage:f.organizer_message.value.trim(),
privacyConsent:f.privacy_consent.checked,marketingConsent:f.marketing_consent.checked};
try{const r=await fetch('/api/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(p)});
const x=await r.json();if(!r.ok)throw new Error(x.message||x.error||'Registration failed.');
sessionStorage.setItem('tyf-registration-result',JSON.stringify(x));location.href='/registration-complete.html'}
catch(err){m.className='status-message status-error';m.textContent=err.message;buttons.forEach(b=>b.disabled=false)}});
