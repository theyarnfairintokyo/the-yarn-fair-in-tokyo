
const companies = [
  {name:"BESTSHAN",ja:"オフィスパラマス 押田",en:"Office Paramus Oshida",emails:["ctxt0659@gmail.com"]},
  {name:"CASHMORIA",ja:"オフィスパラマス 押田 / Y&C ROYAL 大和田",en:"Office Paramus Oshida / Y&C ROYAL Owada",emails:["ctxt0659@gmail.com","masaru.owada@gmail.com"]},
  {name:"CKRC",ja:"SABRINA",en:"SABRINA",emails:["cfkm2010@163.com"]},
  {name:"FILIVIVI",ja:"オフィスパラマス 押田",en:"Office Paramus Oshida",emails:["ctxt0659@gmail.com"]},
  {name:"FORTUNE",ja:"トップヒルズ 岡崎",en:"TOP HILLS Okazaki",emails:["ta-okazaki@top-hills.com"]},
  {name:"M.ORO CASHMERE",ja:"オフィスパラマス 押田",en:"Office Paramus Oshida",emails:["ctxt0659@gmail.com"]},
  {name:"ORIENT HONGDA",ja:"ZOE",en:"ZOE",emails:["Zoe@orientzj.com"]},
  {name:"RUNSUN",ja:"POWER HK 中内",en:"POWER HK Nakauchi",emails:["nakauchi@100pw.com"]},
  {name:"SAMWON ILMO",ja:"POWER HK 中内",en:"POWER HK Nakauchi",emails:["nakauchi@100pw.com"]},
  {name:"SHI-KWAN",ja:"JEAN",en:"JEAN",emails:["jean@shi-kwan.cn"]},
  {name:"TANGOLA",ja:"カリン",en:"Karin",emails:["helle831@163.com"]},
  {name:"UPW",ja:"王",en:"Wang",emails:["carlwang@upwhk.com"]},
  {name:"WANXIN WEISHEN",ja:"AZUKI",en:"AZUKI",emails:["doumeng@wanxinweishen-zj.com"]},
  {name:"WINNING",ja:"SHELLY",en:"SHELLY",emails:["trading@winningdyeing.com"]},
  {name:"XINAO",ja:"渡辺",en:"Watanabe",emails:["watanabe@tune.ocn.ne.jp"]},
  {name:"YARNS&COLORS",ja:"Y&C ROYAL 大和田",en:"Y&C ROYAL Owada",emails:["masaru.owada@gmail.com"]},
  {name:"ZHONGDING",ja:"イタロフィル 中村",en:"ITALO-FIL Nakamura",emails:["nakamura@italo-fil.co.jp"]}
];

function setLang(lang){
  document.querySelectorAll(".ja").forEach(el=>el.hidden=lang!=="ja");
  document.querySelectorAll(".en").forEach(el=>el.hidden=lang!=="en");
  document.querySelectorAll("[data-lang]").forEach(btn=>{
    btn.classList.toggle("active",btn.dataset.lang===lang);
  });
  document.documentElement.lang=lang;
  localStorage.setItem("tyf-lang",lang);
  renderCompanyDetail();
}

function toggleMenu(){
  document.querySelector(".nav-links")?.classList.toggle("open");
}

function renderCompanyLists(){
  const grid=document.querySelector("[data-company-grid]");
  if(grid){
    grid.innerHTML=companies.map(c=>`
      <a class="company-card" href="company.html?company=${encodeURIComponent(c.name)}">
        <strong>${c.name}</strong><span>›</span>
      </a>`).join("");
  }

  const contacts=document.querySelector("[data-contact-list]");
  if(contacts){
    contacts.innerHTML=companies.map(c=>`
      <div class="contact-row">
        <div class="contact-name">${c.name}</div>
        <div>
          <div class="contact-person ja">${c.ja}</div>
          <div class="contact-person en">${c.en}</div>
        </div>
        <div class="contact-email">
          ${c.emails.map(e=>`<a href="mailto:${e}">${e}</a>`).join("<br>")}
        </div>
      </div>`).join("");
  }
}

function renderCompanyDetail(){
  const mount=document.querySelector("[data-company-detail]");
  if(!mount) return;

  const params=new URLSearchParams(location.search);
  const requested=params.get("company")||companies[0].name;
  const company=companies.find(c=>c.name===requested)||companies[0];
  const lang=document.documentElement.lang==="en"?"en":"ja";

  mount.innerHTML=`
    <div class="kicker">COMPANY</div>
    <h1>${company.name}</h1>
    <dl class="company-meta">
      <dt>${lang==="ja"?"担当者":"Contact"}</dt>
      <dd>${lang==="ja"?company.ja:company.en}</dd>
      <dt>Email</dt>
      <dd>${company.emails.map(e=>`<a href="mailto:${e}">${e}</a>`).join("<br>")}</dd>
    </dl>
    <p>
      <a class="btn" href="exhibitors.html">
        ${lang==="ja"?"出展企業一覧へ戻る":"Back to Exhibitors"}
      </a>
    </p>`;
}

function registrationSubmit(event){
  event.preventDefault();

  const form=event.currentTarget;
  const data=Object.fromEntries(new FormData(form).entries());
  data.savedAt=new Date().toISOString();

  const records=JSON.parse(localStorage.getItem("tyf-preview-registrations")||"[]");
  records.push(data);
  localStorage.setItem("tyf-preview-registrations",JSON.stringify(records));

  form.style.display="none";

  const box=document.querySelector(".success-box");
  box.style.display="block";

  box.innerHTML=document.documentElement.lang==="en"
    ? "<h2>Registration preview completed</h2><p>This public front-end does not yet connect to the production database, email delivery or QR issuance.</p>"
    : "<h2>登録プレビューが完了しました</h2><p>この公開フロントエンドは、本番データベース、自動返信メール、QRコード発行にはまだ接続されていません。</p>";

  box.scrollIntoView({behavior:"smooth"});
}

document.addEventListener("DOMContentLoaded",()=>{
  renderCompanyLists();
  setLang(localStorage.getItem("tyf-lang")||"ja");
});
