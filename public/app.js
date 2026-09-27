const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let currentRankingTour = "atp";
let currentResultsTour = "all";
let resultsData = [];

const FALLBACK = {
  rankings: {
    atp: [
      ["Jannik Sinner","ITA",1,14350],["Carlos Alcaraz","ESP",2,12960],
      ["Alexander Zverev","GER",3,5805],["Novak Djokovic","SRB",4,4700],
      ["Felix Auger-Aliassime","CAN",5,4050],["Ben Shelton","USA",6,4030],
      ["Taylor Fritz","USA",7,3770],["Alex de Minaur","AUS",8,3755],
      ["Daniil Medvedev","RUS",9,3460],["Lorenzo Musetti","ITA",10,3415],
      ["Alexander Bublik","KAZ",11,3355],["Flavio Cobolli","ITA",12,2750],
      ["Jiri Lehecka","CZE",13,2715],["Andrey Rublev","RUS",14,2590],
      ["Karen Khachanov","RUS",15,2220],["Valentin Vacherot","MON",16,2147],
      ["Arthur Fils","FRA",17,2130],["Tommy Paul","USA",18,1975]
    ],
    wta: [
      ["Elena Rybakina","KAZ",1,9901],["Aryna Sabalenka","BLR",2,9467],
      ["Iga Swiatek","POL",3,8468],["Coco Gauff","USA",4,7263],
      ["Jessica Pegula","USA",5,6548],["Amanda Anisimova","USA",6,6042],
      ["Mirra Andreeva","RUS",7,5680],["Jasmine Paolini","ITA",8,5075],
      ["Qinwen Zheng","CHN",9,4810],["Madison Keys","USA",10,4520]
    ]
  },
  results: {
    "2026-09-27": [
      ["ATP","Laver Cup","Alexander Zverev","Learner Tien","7-6(3), 6-3"],
      ["ATP","Chengdu Open","Jenson Brooksby","Nikoloz Basilashvili","4-6, 7-6(4), 6-7(7)"],
      ["ATP","Chengdu Open","Alexandre Muller","Alejandro Davidovich Fokina","1-6, 5-7"],
      ["ATP","Chengdu Open","Adrian Mannarino","Denis Shapovalov","7-6(8), 3-6, 2-6"],
      ["ATP","Chengdu Open","Lloyd Harris","Hubert Hurkacz","6-7(10), 4-6"],
      ["ATP","Hangzhou Open","Andrey Rublev","Hugo Gaston","7-6(6), 1-6, 7-6(6)"],
      ["ATP","Hangzhou Open","Daniil Medvedev","Coleman Wong","6-4, 6-3"],
      ["WTA","Singapore Tennis Open","Leylah Fernandez","Talia Gibson","6-7, 7-6, 6-1"]
    ],
    "2026-09-26": [
      ["ATP","Laver Cup","Carlos Alcaraz","Alexander Zverev","6-4, 6-4"],
      ["ATP","Laver Cup","Alex de Minaur","Alexander Zverev","6-3, 6-4"],
      ["WTA","Singapore Tennis Open","Talia Gibson","Jelena Ostapenko","6-4, 6-3"],
      ["WTA","Singapore Tennis Open","Leylah Fernandez","Linda Noskova","6-3, 6-4"]
    ]
  },
  tournaments: [
    ["2026-09-27","Singapore Tennis Open","WTA","WTA 500","Singapore","Hard"],
    ["2026-09-27","Korea Open","WTA","WTA 250","Seoul","Hard"],
    ["2026-09-29","Chengdu Open","ATP","ATP 250","Chengdu","Hard"],
    ["2026-09-29","Hangzhou Open","ATP","ATP 250","Hangzhou","Hard"],
    ["2026-09-30","China Open","WTA","WTA 1000","Beijing","Hard"],
    ["2026-09-30","Japan Open","ATP","ATP 500","Tokyo","Hard"],
    ["2026-10-07","Shanghai Masters","ATP","ATP 1000","Shanghai","Hard"],
    ["2026-10-12","Wuhan Open","WTA","WTA 1000","Wuhan","Hard"]
  ],
  news: [
    {
      title:"Zverev comeback leads Europe to Laver Cup victory",
      description:"Alexander Zverev beat Learner Tien as Team Europe secured its sixth Laver Cup title.",
      source:"BBC Sport",
      link:"https://www.bbc.com/sport/tennis",
      date:"2026-09-27"
    },
    {
      title:"Asian Swing begins with Singapore and Korea",
      description:"The WTA Tour heads into the Asian swing with Singapore and Seoul among the opening events.",
      source:"WTA Tour",
      link:"https://www.wtatennis.com/",
      date:"2026-09-27"
    },
    {
      title:"Chengdu and Hangzhou open the ATP Asian swing",
      description:"ATP 250 events in Chengdu and Hangzhou form part of the first week of the Asian swing.",
      source:"ATP Tour",
      link:"https://www.atptour.com/",
      date:"2026-09-27"
    }
  ]
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function flag(code) {
  const map = {
    ESP:"🇪🇸", ITA:"🇮🇹", SRB:"🇷🇸", GER:"🇩🇪", FRA:"🇫🇷",
    GBR:"🇬🇧", USA:"🇺🇸", AUS:"🇦🇺", RUS:"🇷🇺", POL:"🇵🇱",
    KAZ:"🇰🇿", CZE:"🇨🇿", CAN:"🇨🇦", CHN:"🇨🇳", JPN:"🇯🇵",
    TUN:"🇹🇳", GRE:"🇬🇷", BRA:"🇧🇷", CRO:"🇭🇷", BLR:"🇧🇾",
    MON:"🇲🇨"
  };
  return map[code] || "";
}

async function getJSON(url) {
  const r = await fetch(url);
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

function showError(el, message) {
  el.innerHTML = `<div class="empty"><b>${esc(message)}</b></div>`;
}

function rankingFallback(tour) {
  return FALLBACK.rankings[tour].map((p,i)=>({
    id:`fallback-${tour}-${i}`, name:p[0], country:p[1], rank:p[2], points:p[3]
  }));
}

async function loadResults() {
  const el = $("#resultsList");
  el.innerHTML = "<p>Loading results…</p>";
  const date = $("#resultDate").value;
  let list = [];
  try {
    const data = await getJSON(`/api/results?date=${encodeURIComponent(date)}`);
    list = data.results || [];
  } catch {}
  if (!list.length) {
    list = (FALLBACK.results[date] || []).map((m,i)=>({
      id:`fallback-${date}-${i}`, tour:m[0], tournament:m[1],
      winner:{name:m[2],country:""}, loser:{name:m[3],country:""}, score:m[4], round:""
    }));
  }
  resultsData = list;
  const filtered = list.filter(x => currentResultsTour==="all" || x.tour.toLowerCase()===currentResultsTour);
  if (!filtered.length) {
    el.innerHTML = `<div class="empty">No completed singles matches found for ${esc(date)}.</div>`;
    return;
  }
  const groups = {};
  filtered.forEach(m => {
    const key = `${m.tour}-${m.tournament}`;
    (groups[key] ||= {tour:m.tour,tournament:m.tournament,matches:[]}).matches.push(m);
  });
  el.innerHTML = Object.values(groups).map(g=>`
    <div class="result-group">
      <div class="group-title"><b>${esc(g.tournament)}</b><span>${esc(g.tour)} · Completed results</span></div>
      ${g.matches.map(m=>`
        <article class="result-card">
          <div class="players">
            <div><b>${esc(m.winner?.name || "Unknown")}</b> ${flag(m.winner?.country)}</div>
            <div>${esc(m.loser?.name || "Unknown")} ${flag(m.loser?.country)}</div>
          </div>
          <div class="score">${esc(m.score || "—")}</div>
        </article>`).join("")}
    </div>`).join("");
}

async function loadRankings() {
  const el = $("#rankingList");
  el.innerHTML = "<p>Loading rankings…</p>";
  let players = [];
  try {
    const data = await getJSON(`/api/rankings?tour=${currentRankingTour}`);
    players = data.players || [];
  } catch {}
  if (!players.length) players = rankingFallback(currentRankingTour);
  el.innerHTML = players.map(p=>`
    <div class="rank-row" data-player="${esc(p.id)}" data-name="${esc(p.name)}">
      <div class="rank">${esc(p.rank)}</div>
      <div class="player-name">${flag(p.country)} ${esc(p.name)}</div>
      <div class="points">${Number(p.points||0).toLocaleString()}</div>
    </div>`).join("");
  $$(".rank-row").forEach(row=>{
    row.addEventListener("click",()=>openPlayer(currentRankingTour,row.dataset.player,row.dataset.name));
  });
}

async function openPlayer(tour,id,name) {
  const modal=$("#playerModal"), content=$("#playerSummary");
  modal.classList.remove("hidden");
  content.innerHTML="<p>Loading player…</p>";
  try {
    const data=await getJSON(`/api/player?tour=${tour}&id=${encodeURIComponent(id)}`);
    if(data.found){ renderPlayer(data.player,tour); return; }
  } catch {}
  const p=rankingFallback(tour).find(x=>x.name===name) || {name,country:"",rank:"",points:0};
  renderPlayer(p,tour);
}

function renderPlayer(p,tour) {
  const age = {
    "Jannik Sinner":25,"Carlos Alcaraz":23,"Alexander Zverev":29,"Novak Djokovic":39,
    "Elena Rybakina":27,"Aryna Sabalenka":28,"Iga Swiatek":25,"Coco Gauff":22
  }[p.name];
  $("#playerSummary").innerHTML=`
    <div class="player-summary">
      <p class="eyebrow">${esc(tour.toUpperCase())} PLAYER</p>
      <h2>${esc(p.name)}</h2>
      <div class="country">${flag(p.country)} ${esc(p.country||"Country unavailable")}</div>
      <div class="summary-grid">
        <div class="summary-box"><b>RANKING</b>#${esc(p.rank)}</div>
        <div class="summary-box"><b>POINTS</b>${Number(p.points||0).toLocaleString()}</div>
        ${age?`<div class="summary-box"><b>AGE</b>${age}</div>`:""}
        <div class="summary-box"><b>TOUR</b>${esc(tour.toUpperCase())}</div>
      </div>
      <p style="margin-top:20px">${esc(p.name)} is currently ranked #${esc(p.rank)} in the ${esc(tour.toUpperCase())} singles rankings with ${Number(p.points||0).toLocaleString()} points.</p>
    </div>`;
}

async function loadTournaments() {
  const el=$("#tournamentList");
  el.innerHTML="<p>Loading tournaments…</p>";
  let list=[];
  try {
    const data=await getJSON("/api/calendar");
    list=data.tournaments||[];
  } catch {}
  if(!list.length) list=FALLBACK.tournaments.map(t=>({
    date:t[0],name:t[1],tour:t[2],category:t[3],country:t[4],surface:t[5]
  }));
  list=list.filter(t=>t.category);
  el.innerHTML=list.slice(0,12).map(t=>`
    <article class="tournament">
      <span class="badge">${esc(t.category)}</span>
      <div class="date">${new Date(t.date).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}</div>
      <h3>${esc(t.name)}</h3>
      <div>${esc(t.tour)}${t.country?` · ${esc(t.country)}`:""}${t.surface?` · ${esc(t.surface)}`:""}</div>
    </article>`).join("");
}

async function loadNews() {
  const el=$("#newsList");
  el.innerHTML="<p>Loading news…</p>";
  let items=[];
  try {
    const data=await getJSON("/api/news");
    items=data.items||[];
  } catch {}
  if(!items.length) items=FALLBACK.news;
  el.innerHTML=items.slice(0,12).map(n=>`
    <a class="news-card" href="${esc(n.link)}" target="_blank" rel="noopener">
      ${n.image?`<img src="${esc(n.image)}" alt="">`:`<div class="news-image"></div>`}
      <div>
        <h3>${esc(n.title)}</h3>
        <p>${esc((n.description||"").slice(0,150))}</p>
        <small>${esc(n.source||"")}</small>
      </div>
    </a>`).join("");
}

function setup(){
  $("#resultDate").value=new Date().toISOString().slice(0,10);
  $("#resultDate").addEventListener("change",loadResults);
  $$("[data-results-tour]").forEach(btn=>btn.addEventListener("click",()=>{
    $$("[data-results-tour]").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active"); currentResultsTour=btn.dataset.resultsTour; loadResults();
  }));
  $$("[data-ranking-tour]").forEach(btn=>btn.addEventListener("click",()=>{
    $$("[data-ranking-tour]").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active"); currentRankingTour=btn.dataset.rankingTour; loadRankings();
  }));
  $("#closeModal").addEventListener("click",()=>$("#playerModal").classList.add("hidden"));
  $("#playerModal").addEventListener("click",e=>{if(e.target.id==="playerModal")$("#playerModal").classList.add("hidden")});
  loadResults(); loadRankings(); loadTournaments(); loadNews();
}
setup();