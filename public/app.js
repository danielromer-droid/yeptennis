const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const get=async u=>{const r=await fetch(u);const d=await r.json();if(!r.ok)throw Error(d.error||("HTTP "+r.status));return d};
const flag=c=>({ESP:"🇪🇸",ITA:"🇮🇹",FRA:"🇫🇷",GBR:"🇬🇧",USA:"🇺🇸",SRB:"🇷🇸",GER:"🇩🇪",POL:"🇵🇱",JPN:"🇯🇵",AUS:"🇦🇺",CZE:"🇨🇿",CAN:"🇨🇦"}[c]||"🎾");
const fmt=d=>d?new Date(d).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"}):"";
async function loadResults(){
 const el=$("#resultsList"); el.innerHTML="<p>Loading live results…</p>";
 try{const d=await get("/api/today");el.innerHTML=d.matches.length?d.matches.slice(0,40).map(m=>`<div class="card"><b>${flag(m.country1)} ${esc(m.player1)} ${m.rank1?`(${m.rank1})`:""}</b> — <b>${flag(m.country2)} ${esc(m.player2)}</b><br><strong>${esc(m.score||"Scheduled")}</strong> &nbsp; <span class="${m.live?"live":""}">${m.live?"● LIVE":esc(m.status||"")}</span><small> · ${esc(m.tour.toUpperCase())} ${esc(m.tournament||"")}</small></div>`).join(""):"<p>No ATP/WTA singles matches found today.</p>"}catch(e){el.innerHTML=`<p>${esc(e.message)}</p>`}
}
async function loadCalendar(){
 const el=$("#calendarList");el.innerHTML="<p>Loading ATP/WTA Masters calendar…</p>";
 try{const d=await get("/api/calendar");el.innerHTML=d.tournaments.map(t=>`<div class="card"><b>${esc(t.name)}</b> <small>${esc(t.tour.toUpperCase())} ${esc(t.tier||"")}</small><br>${fmt(t.start)}${t.end?" – "+fmt(t.end):""} · ${esc(t.country||"")} · ${esc(t.surface||"")}</div>`).join("")||"<p>No Masters tournaments found.</p>"}catch(e){el.innerHTML=`<p>${esc(e.message)}</p>`}
}
async function loadNews(){
 const el=$("#newsList");el.innerHTML="<p>Loading tennis news…</p>";
 try{const d=await get("/api/news");el.innerHTML=d.items.slice(0,10).map(n=>`<div class="card"><a href="${esc(n.link)}" target="_blank" rel="noopener"><b>${esc(n.title)}</b></a><br><small>${esc(n.source)} · ${esc(n.dateLabel)}</small></div>`).join("")}catch(e){el.innerHTML=`<p>${esc(e.message)}</p>`}
}
async function loadRankings(){
 const el=$("#rankingList");el.innerHTML="<p>Loading ATP rankings…</p>";
 try{const d=await get("/api/rankings?tour=atp");el.innerHTML=d.players.slice(0,20).map((p,i)=>`<div class="card"><b>${p.rank||i+1}. ${flag(p.country)} ${esc(p.name)}</b><span style="float:right">${Number(p.points||0).toLocaleString()} pts</span></div>`).join("")}catch(e){el.innerHTML=`<p>${esc(e.message)}</p>`}
}
async function init(){await Promise.allSettled([loadResults(),loadCalendar(),loadNews(),loadRankings()])}
init();setInterval(loadResults,60000);setInterval(loadNews,300000);
