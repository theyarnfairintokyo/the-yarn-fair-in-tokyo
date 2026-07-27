function currentLang(){
  return localStorage.getItem("tyf-lang") || "ja";
}

function setLang(lang){
  const selected = lang === "en" ? "en" : "ja";
  document.querySelectorAll(".ja").forEach(el=>{el.hidden=selected!=="ja";});
  document.querySelectorAll(".en").forEach(el=>{el.hidden=selected!=="en";});
  document.querySelectorAll("[data-lang]").forEach(btn=>{
    btn.classList.toggle("active",btn.dataset.lang===selected);
    btn.setAttribute("aria-pressed",btn.dataset.lang===selected ? "true" : "false");
  });
  document.documentElement.lang=selected;
  localStorage.setItem("tyf-lang",selected);
  window.dispatchEvent(new CustomEvent("tyf-language-change",{detail:{lang:selected}}));
}

function toggleMenu(force){
  const menu=document.querySelector(".nav-links");
  if(!menu) return;
  if(typeof force==="boolean") menu.classList.toggle("open",force);
  else menu.classList.toggle("open");
}

function callWindowFunction(name,...args){
  const fn=window[name];
  if(typeof fn==="function") return fn(...args);
  console.warn(`Action ${name} is not available on this page.`);
}

document.addEventListener("click",event=>{
  const langButton=event.target.closest("[data-set-lang]");
  if(langButton){
    event.preventDefault();
    setLang(langButton.dataset.setLang);
    return;
  }

  const target=event.target.closest("[data-action]");
  if(!target) return;
  const action=target.dataset.action;
  if(action==="toggle-menu") toggleMenu();
  if(action==="close-menu") toggleMenu(false);
  if(action==="export-csv") callWindowFunction("exportCsv");
  if(action==="export-excel") callWindowFunction("exportExcel");
  if(action==="staff-logout") callWindowFunction("staffLogout");
  if(action==="start-qr-scanner") callWindowFunction("startQrScanner");
  if(action==="lookup-manual-token"){
    const value=document.querySelector("[data-manual-token]")?.value || "";
    callWindowFunction("lookupQrToken",value);
  }
  if(action==="print-page") window.print();
});

document.addEventListener("DOMContentLoaded",()=>{
  setLang(currentLang());
});
