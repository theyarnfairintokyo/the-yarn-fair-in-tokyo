import {supabase} from './supabase.js';import * as XLSX from 'xlsx';
async function auth(){const {data:{session}}=await supabase.auth.getSession();if(!session)return null;
const {data:profile}=await supabase.from('staff_profiles').select('display_name,role,is_active').eq('user_id',session.user.id).single();
return profile?.is_active?{session,profile}:null}
async function req(){const a=await auth();if(!a){location.href='/staff-login.html';return null}return a}
document.querySelector('#staff-login')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,m=document.querySelector('[data-login-message]');
const {error}=await supabase.auth.signInWithPassword({email:f.email.value.trim(),password:f.password.value});if(error){m.textContent=error.message;return}location.href='/admin.html'});
window.staffLogout=async()=>{await supabase.auth.signOut();location.href='/staff-login.html'};
async function admin(){const mount=document.querySelector('[data-admin-dashboard]');if(!mount)return;const a=await req();if(!a)return;
document.querySelector('[data-staff-name]').textContent=`${a.profile.display_name} (${a.profile.role})`;
const {data:regs,error}=await supabase.from('registrations').select(`id,registration_number,registered_at,planned_visit_dates,status,visitors(full_name,company_name,email,phone,industry)`).order('registered_at',{ascending:false}).limit(5000);
if(error){mount.innerHTML=`<p class="status-error">${error.message}</p>`;return}
const {data:checks}=await supabase.from('checkins').select('registration_id,checked_in_at,checkin_kind,is_void').eq('is_void',false);
const cm=new Map();(checks||[]).forEach(c=>{if(!cm.has(c.registration_id))cm.set(c.registration_id,c)});
document.querySelector('[data-total-registrations]').textContent=regs.length;document.querySelector('[data-total-checkins]').textContent=regs.filter(r=>cm.has(r.id)).length;
document.querySelector('[data-total-unchecked]').textContent=regs.filter(r=>!cm.has(r.id)).length;
window.__ROWS__=regs.map(r=>({'Registration No.':r.registration_number,'Registered At':r.registered_at,Company:r.visitors?.company_name||'',Name:r.visitors?.full_name||'',Email:r.visitors?.email||'',Phone:r.visitors?.phone||'',Industry:r.visitors?.industry||'','Planned Dates':(r.planned_visit_dates||[]).join(', '),'Check-in':cm.get(r.id)?.checked_in_at||'',Status:r.status}));
mount.innerHTML=`<div class="table-wrap"><table class="data-table"><thead><tr><th>Registration</th><th>Company</th><th>Name</th><th>Email</th><th>Phone</th><th>Planned dates</th><th>Check-in</th></tr></thead><tbody>${regs.map(r=>`<tr><td>${r.registration_number}</td><td>${r.visitors?.company_name||''}</td><td>${r.visitors?.full_name||''}</td><td>${r.visitors?.email||''}</td><td>${r.visitors?.phone||''}</td><td>${(r.planned_visit_dates||[]).join(', ')}</td><td>${cm.get(r.id)?.checked_in_at||'Not checked in'}</td></tr>`).join('')}</tbody></table></div>`}
window.exportExcel=()=>{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(window.__ROWS__||[]),'Visitors');XLSX.writeFile(wb,`TYF_AW2026_${new Date().toISOString().slice(0,10)}.xlsx`)};
function token(raw){try{return new URL(raw).searchParams.get('token')||raw.trim()}catch{return raw.trim()}}
window.lookupQrToken=async raw=>{if(!await req())return;const mount=document.querySelector('[data-checkin-result]');
const {data,error}=await supabase.rpc('lookup_registration_by_qr',{p_qr_token:token(raw)});if(error||!data?.length){mount.innerHTML=`<p class="status-error">${error?.message||'Registration not found.'}</p>`;return}
const r=data[0];mount.innerHTML=`<h2>${r.company_name}</h2><p>${r.full_name}</p><p>${r.registration_number}</p><p>${Number(r.active_checkin_count)>0?`Already checked in: ${r.first_checkin_at}`:'Not checked in'}</p><button class="btn primary" onclick="recordCheckin('${r.registration_id}',${Number(r.active_checkin_count)>0})">${Number(r.active_checkin_count)>0?'Record re-entry':'Check in'}</button>`};
window.recordCheckin=async(id,re)=>{if(!await req())return;const {data,error}=await supabase.rpc('record_checkin',{p_registration_id:id,p_device_label:navigator.userAgent.slice(0,240),p_force_reentry:re});document.querySelector('[data-checkin-result]').innerHTML=error?`<p class="status-error">${error.message}</p>`:`<h2>Check-in complete</h2><p>${data?.[0]?.checked_in_at||''}</p>`};
window.startQrScanner=async()=>{if(!await req())return;try{const s=new Html5Qrcode('qr-reader');await s.start({facingMode:'environment'},{fps:10,qrbox:{width:250,height:250}},async t=>{await s.stop();await window.lookupQrToken(t)},()=>{})}catch(e){document.querySelector('[data-checkin-result]').innerHTML=`<p class="status-error">${e.message}</p>`}};
admin();
