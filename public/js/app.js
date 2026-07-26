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

function toggleMenu(){
  document.querySelector(".nav-links")?.classList.toggle("open");
}

document.addEventListener("DOMContentLoaded",()=>{
  setLang(currentLang());
});
