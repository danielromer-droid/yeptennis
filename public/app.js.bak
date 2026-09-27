/* =========================================================
   YepTennis - API Frontend
   ATP / WTA / Grand Slams / 1000 / 500
   ========================================================= */

let todayData = null;
let calendarData = null;
let newsData = null;
let rankingsData = { atp: null, wta: null };
let resultsFilter = "all";
let rankingsTour = "atp";

const REFRESH_MS = 60000;

/*
   The worker caches upstream calls (12h for results, 24h
   for rankings/calendar), so polling this often only
   re-reads the worker's own cache - it does not add extra
   load on the RapidAPI quota.
*/


document.addEventListener("DOMContentLoaded", () => {

  setupNavigation();
  setupResultTabs();
  setupRankingsTabs();

  loadToday();
  loadNews();
  loadCalendar();
  loadRankings("atp");

  setInterval(loadToday, REFRESH_MS);

});


/* =========================================================
   NAVIGATION
   ========================================================= */

function setupNavigation() {

  const menu = document.querySelector(".menu");
  const nav = document.querySelector("nav");

  if (!menu || !nav) return;

  menu.addEventListener("click", () => {
    nav.classList.toggle("open");
  });

  nav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      nav.classList.remove("open");
    });
  });

}


/* =========================================================
   RESULT TABS
   ========================================================= */

function setupResultTabs() {

  const tabs = document.querySelectorAll(".results-card .tabs button");

  if (!tabs.length) return;

  tabs.forEach(button => {

    button.addEventListener("click", () => {

      tabs.forEach(b => b.classList.remove("selected"));

      button.classList.add("selected");

      resultsFilter = button.dataset.filter || "all";

      renderResults();

    });

  });

}


/* =========================================================
   RANKINGS TABS
   ========================================================= */

function setupRankingsTabs() {

  const tabs = document.querySelectorAll(".rankings-card .tabs button");

  if (!tabs.length) return;

  tabs.forEach(button => {

    button.addEventListener("click", () => {

      tabs.forEach(b => b.classList.remove("selected"));

      button.classList.add("selected");

      rankingsTour = button.dataset.tour || "atp";

      if (rankingsData[rankingsTour]) {
        renderRankings();
      }
      else {
        loadRankings(rankingsTour);
      }

    });

  });

}


/* =========================================================
   FETCH HELPER
   ========================================================= */

async function fetchJSON(url) {

  const response = await fetch(url, {
    cache: "no-store"
  });

  const text = await response.text();

  let data = {};

  try {
    data = JSON.parse(text);
  }
  catch {
    throw new Error("Invalid JSON returned by " + url);
  }

  if (!response.ok) {
    throw new Error(data.error || data.message || "API error");
  }

  return data;

}


/* =========================================================
   TODAY'S RESULTS
   ========================================================= */

async function loadToday() {

  const container =
    document.getElementById("results-list") ||
    document.querySelector(".results-card");

  if (!container) return;

  try {

    todayData = await fetchJSON("/api/today");

    renderResults();

    updateResultsDate();

  }
  catch (error) {

    console.error("YepTennis /api/today:", error);

    const list =
      document.getElementById("results-list");

    if (list && !todayData) {

      list.innerHTML = `
        <div class="api-message">
          Results temporarily unavailable.
        </div>
      `;

    }

  }

}


/* =========================================================
   MATCH CATEGORY (derived from the tournament name only -
   the worker already gives us clean tour/player/score/status
   fields, so we just add display-only classification here)
   ========================================================= */

function matchCategory(match) {

  const text =
    `${match.tournament || ""} ${match.level || ""}`
      .toLowerCase();

  if (
    /grand slam|australian open|roland garros|wimbledon|us open/
      .test(text)
  ) {
    return "Grand Slam";
  }

  if (
    /finals|wta finals|atp finals/
      .test(text)
  ) {
    return "Finals";
  }

  if (
    /masters 1000|masters|1000/
      .test(text)
  ) {
    return match.tour === "wta" ? "WTA 1000" : "ATP 1000";
  }

  if (/500/.test(text)) {
    return match.tour === "wta" ? "WTA 500" : "ATP 500";
  }

  return "";

}


/* =========================================================
   RESULTS RENDERING
   ========================================================= */

function renderResults() {

  if (!todayData) return;

  const matches =
    Array.isArray(todayData.matches)
      ? todayData.matches
      : [];


  let filtered = matches;


  /* ---------------------------------------------
     Filters
     --------------------------------------------- */

  if (resultsFilter === "atp") {

    filtered =
      matches.filter(m => m.tour === "atp");

  }
  else if (resultsFilter === "wta") {

    filtered =
      matches.filter(m => m.tour === "wta");

  }
  else if (resultsFilter === "live") {

    filtered =
      matches.filter(m => m.live);

  }
  else if (resultsFilter === "completed") {

    filtered =
      matches.filter(m => m.completed);

  }


  /* ---------------------------------------------
     Find result container
     --------------------------------------------- */

  let list =
    document.getElementById("results-list");


  if (!list) {

    list =
      document.querySelector(".results-card");

  }


  if (!list) return;


  list.innerHTML = "";


  /* ---------------------------------------------
     No matches
     --------------------------------------------- */

  if (!filtered.length) {

    const message =
      document.createElement("div");

    message.className =
      "api-message";

    message.textContent =
      resultsFilter === "wta"
        ? "No WTA matches available today."
        : resultsFilter === "atp"
          ? "No ATP matches available today."
          : "No matches available.";

    list.appendChild(message);

    updateTabCounts(matches);

    return;

  }


  /* ---------------------------------------------
     Render matches, grouped by tournament
     --------------------------------------------- */

  const fragment =
    document.createDocumentFragment();

  const groups = new Map();


  filtered.forEach(match => {

    const key =
      `${match.tour}-${match.tournament || "Other"}`;

    if (!groups.has(key)) {

      groups.set(key, []);

    }

    groups.get(key).push(match);

  });


  groups.forEach(group => {

    const first = group[0];

    const category = matchCategory(first);

    const tournamentHeader =
      document.createElement("div");

    tournamentHeader.className =
      "api-tournament-header";

    tournamentHeader.innerHTML = `
      <strong>
        ${escapeHTML(first.tournament || "Tennis")}
      </strong>
      <span>
        ${first.tour.toUpperCase()}${category ? " · " + escapeHTML(category) : ""}
      </span>
    `;

    fragment.appendChild(tournamentHeader);


    group.forEach(match => {

      const article =
        document.createElement("div");

      article.className =
        "match api-match";


      const flag1 = countryFlag(match.country1);
      const flag2 = countryFlag(match.country2);

      const player1 =
        `${flag1} ${escapeHTML(match.player1 || "TBD")}`;

      const player2 =
        `${flag2} ${escapeHTML(match.player2 || "TBD")}`;

      const score =
        formatScore(match.score);

      let status = match.status || "Scheduled";

      if (match.live) {
        status = "LIVE";
      }
      else if (match.completed) {
        status = "Completed";
      }

      const round =
        match.round
          ? `<span class="match-round">${escapeHTML(formatRound(match.round))}</span>`
          : "";

      article.innerHTML = `
        <div class="match-players">
          <b>${player1}</b>
          <b>${player2}</b>
          ${round}
        </div>

        <div class="scores">
          <b>${escapeHTML(score)}</b>
        </div>

        <small class="${match.live ? "live-status" : ""}">
          ${escapeHTML(status)}
        </small>
      `;

      fragment.appendChild(article);

    });

  });


  list.appendChild(fragment);

  updateTabCounts(matches);

}


/* =========================================================
   TAB COUNTS
   ========================================================= */

function updateTabCounts(matches) {

  const tabs =
    document.querySelectorAll(
      ".results-card .tabs button"
    );

  if (!tabs.length) return;


  const atp =
    matches.filter(m => m.tour === "atp").length;

  const wta =
    matches.filter(m => m.tour === "wta").length;

  const live =
    matches.filter(m => m.live).length;

  const completed =
    matches.filter(m => m.completed).length;


  const labels = {
    all: "ALL",
    atp: `ATP${atp ? ` (${atp})` : ""}`,
    wta: `WTA${wta ? ` (${wta})` : ""}`,
    live: `LIVE${live ? ` (${live})` : ""}`,
    completed: `COMPLETED${completed ? ` (${completed})` : ""}`
  };


  tabs.forEach(button => {

    const filter = button.dataset.filter;

    if (labels[filter]) {
      button.textContent = labels[filter];
    }

  });

}


/* =========================================================
   DATE
   ========================================================= */

function updateResultsDate() {

  const el =
    document.querySelector(".results-section .api-date");

  if (!el) return;

  if (todayData?.date) {

    el.textContent =
      `▣ ${formatDate(todayData.date)}`;

  }

}


/* =========================================================
   DATE FORMAT
   ========================================================= */

function formatDate(value) {

  if (!value) return "";

  const d =
    new Date(value);

  if (Number.isNaN(d.getTime())) {
    return value;
  }

  return d.toLocaleDateString(
    "en-GB",
    {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric"
    }
  );

}


/* =========================================================
   ROUND FORMAT
   ========================================================= */

function formatRound(round) {

  const r =
    String(round || "")
      .toLowerCase()
      .trim();


  const map = {

    "1": "Round 1",
    "2": "Round 2",
    "3": "Round 3",

    "second": "Round 2",
    "third": "Round 3",

    "quarterfinal": "Quarter-final",
    "quarterfinals": "Quarter-finals",
    "quarter final": "Quarter-final",
    "quarter finals": "Quarter-finals",

    "semifinal": "Semi-final",
    "semifinals": "Semi-finals",
    "semi final": "Semi-final",
    "semi finals": "Semi-finals",

    "final": "Final"

  };


  return map[r] || round;

}


/* =========================================================
   SCORE FORMAT
   ========================================================= */

function formatScore(score) {

  if (!score) return "—";

  if (typeof score === "object") {

    return (
      score.display ||
      score.score ||
      score.result ||
      "—"
    );

  }

  return String(score);

}


/* =========================================================
   COUNTRY FLAGS
   ========================================================= */

function countryFlag(code) {

  if (!code) return "";

  const c =
    String(code)
      .trim()
      .toUpperCase();


  const flags = {

    FRA: "🇫🇷",
    ESP: "🇪🇸",
    ITA: "🇮🇹",
    GBR: "🇬🇧",
    USA: "🇺🇸",
    CAN: "🇨🇦",
    AUS: "🇦🇺",
    SRB: "🇷🇸",
    GER: "🇩🇪",
    POL: "🇵🇱",
    BEL: "🇧🇪",
    CZE: "🇨🇿",
    ROU: "🇷🇴",
    RUS: "🇷🇺",
    UKR: "🇺🇦",
    JPN: "🇯🇵",
    CHN: "🇨🇳",
    KOR: "🇰🇷",
    SGP: "🇸🇬",
    BRA: "🇧🇷",
    ARG: "🇦🇷",
    CRO: "🇭🇷",
    GRE: "🇬🇷",
    TUN: "🇹🇳",
    KAZ: "🇰🇿",
    SUI: "🇨🇭",
    NED: "🇳🇱",
    AUT: "🇦🇹",
    DEN: "🇩🇰",
    SWE: "🇸🇪",
    NOR: "🇳🇴",
    EST: "🇪🇪",
    LAT: "🇱🇻",
    SVK: "🇸🇰",
    SLO: "🇸🇮",
    COL: "🇨🇴",
    MEX: "🇲🇽",
    POR: "🇵🇹",
    TUR: "🇹🇷",
    NZL: "🇳🇿"

  };


  return flags[c] || "";

}


/* =========================================================
   NEWS
   ========================================================= */

async function loadNews() {

  const container =
    document.getElementById("news-list") ||
    document.querySelector(".news-list");

  if (!container) return;


  try {

    newsData =
      await fetchJSON("/api/news");

    renderNews();

  }
  catch (error) {

    console.error(
      "YepTennis /api/news:",
      error
    );

  }

}


function renderNews() {

  if (!newsData) return;


  const container =
    document.getElementById("news-list") ||
    document.querySelector(".news-list");

  if (!container) return;


  const items =
    newsData.items ||
    newsData.news ||
    [];


  if (!Array.isArray(items) || !items.length) {
    return;
  }


  container.innerHTML =
    items
      .slice(0, 8)
      .map(renderNewsItem)
      .join("");

}


function renderNewsItem(item) {

  const image =
    item.image
      ? `
        <img
          class="news-img"
          src="${escapeHTML(item.image)}"
          alt=""
          loading="lazy"
        >
      `
      : `
        <div class="news-img news-placeholder"></div>
      `;


  const description =
    item.description
      ? `<p>${escapeHTML(item.description)}</p>`
      : "";


  return `
    <article class="news-item">

      ${image}

      <div>

        <b>
          <a
            href="${escapeHTML(item.link || "#")}"
            target="_blank"
            rel="noopener noreferrer"
          >
            ${escapeHTML(item.title || "")}
          </a>
        </b>

        ${description}

        <span>
          ${escapeHTML(item.source || "Tennis")}
          ${item.dateLabel ? " · " + escapeHTML(item.dateLabel) : ""}
        </span>

      </div>

    </article>
  `;

}


/* =========================================================
   CALENDAR
   ========================================================= */

async function loadCalendar() {

  const container =
    document.getElementById("calendar-list");

  if (!container) return;

  try {

    calendarData =
      await fetchJSON("/api/calendar");

    renderCalendar();

  }
  catch (error) {

    console.error(
      "YepTennis /api/calendar:",
      error
    );

    container.innerHTML = `
      <div class="api-message">
        Calendar temporarily unavailable.
      </div>
    `;

  }

}


function renderCalendar() {

  if (!calendarData) return;

  const container =
    document.getElementById("calendar-list");

  if (!container) return;

  const tournaments =
    (calendarData.tournaments || [])
      .slice(0, 10);

  if (!tournaments.length) {

    container.innerHTML = `
      <div class="api-message">
        No upcoming Masters/1000-level events found.
      </div>
    `;

    return;

  }

  container.innerHTML =
    tournaments
      .map(t => `
        <article class="calendar-item">
          <div>
            <b>${escapeHTML(t.name || "Tournament")}</b>
            <span>
              ${t.tour.toUpperCase()}${t.tier ? " · " + escapeHTML(t.tier) : ""}
              ${t.country ? " · " + escapeHTML(t.country) : ""}
            </span>
          </div>
          <small>${escapeHTML(formatDate(t.start))}</small>
        </article>
      `)
      .join("");

}


/* =========================================================
   RANKINGS
   ========================================================= */

async function loadRankings(tour = "atp") {

  const container =
    document.getElementById("rankings-list");

  if (!container) return;

  try {

    const data =
      await fetchJSON(
        `/api/rankings?tour=${tour}`
      );

    rankingsData[tour] = data;

    if (rankingsTour === tour) {
      renderRankings();
    }

  }
  catch (error) {

    console.error(
      `YepTennis rankings ${tour}:`,
      error
    );

    if (rankingsTour === tour) {

      container.innerHTML = `
        <div class="api-message">
          Rankings temporarily unavailable.
        </div>
      `;

    }

  }

}


function renderRankings() {

  const container =
    document.getElementById("rankings-list");

  if (!container) return;

  const data = rankingsData[rankingsTour];

  if (!data) return;

  const players =
    (data.players || [])
      .slice(0, 10);

  if (!players.length) {

    container.innerHTML = `
      <div class="api-message">
        Rankings unavailable right now.
      </div>
    `;

    return;

  }

  container.innerHTML =
    players
      .map(p => `
        <article class="ranking-item">
          <span class="ranking-rank">${escapeHTML(String(p.rank ?? ""))}</span>
          <span class="ranking-name">
            ${countryFlag(p.country)} ${escapeHTML(p.name || "Player")}
          </span>
          <span class="ranking-points">${escapeHTML(String(p.points ?? ""))}</span>
        </article>
      `)
      .join("");

}


/* =========================================================
   HTML ESCAPE
   ========================================================= */

function escapeHTML(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}
