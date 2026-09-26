/* =========================================================
   YepTennis - API Frontend
   ATP / WTA / Grand Slams / 1000 / 500
   ========================================================= */

let todayData = null;
let calendarData = null;
let newsData = null;
let resultsFilter = "all";


document.addEventListener("DOMContentLoaded", () => {

  setupNavigation();
  setupResultTabs();

  loadToday();
  loadNews();
  loadCalendar();
  loadRankings("atp");

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

      const text = button.textContent.trim().toLowerCase();

      if (text.includes("wta")) {
        resultsFilter = "wta";
      }
      else if (text.includes("live")) {
        resultsFilter = "live";
      }
      else if (text.includes("completed")) {
        resultsFilter = "completed";
      }
      else {
        resultsFilter = "atp";
      }

      renderResults();

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

    if (list) {

      list.innerHTML = `
        <div class="api-message">
          Results temporarily unavailable.
        </div>
      `;

    }

  }

}


/* =========================================================
   NORMALISE MATCH
   ========================================================= */

function normaliseMatch(raw) {

  if (!raw) return null;

  const player1 =
    raw.player1 ||
    raw.home ||
    raw.player1Name ||
    "";

  const player2 =
    raw.player2 ||
    raw.away ||
    raw.player2Name ||
    "";

  const name1 =
    typeof player1 === "string"
      ? player1
      : (
          player1.name ||
          player1.fullName ||
          player1.playerName ||
          ""
        );

  const name2 =
    typeof player2 === "string"
      ? player2
      : (
          player2.name ||
          player2.fullName ||
          player2.playerName ||
          ""
        );

  const country1 =
    typeof player1 === "object"
      ? (
          player1.countryAcr ||
          player1.countryCode ||
          player1.country ||
          ""
        )
      : (
          raw.country1 ||
          ""
        );

  const country2 =
    typeof player2 === "object"
      ? (
          player2.countryAcr ||
          player2.countryCode ||
          player2.country ||
          ""
        )
      : (
          raw.country2 ||
          ""
        );


  /* ---------------------------------------------
     Tournament
     --------------------------------------------- */

  let tournament =
    raw.tournament ||
    raw.tournamentName ||
    "";

  if (typeof tournament === "object") {

    tournament =
      tournament.name ||
      tournament.tournamentName ||
      "";

  }


  /* ---------------------------------------------
     Tournament ID
     --------------------------------------------- */

  const tournamentId =
    raw.tournamentId ||
    raw.tournament?.id ||
    "";


  /* ---------------------------------------------
     Tour
     --------------------------------------------- */

  let tour =
    String(
      raw.tour ||
      raw.gender ||
      ""
    ).toLowerCase();

  if (tour !== "atp" && tour !== "wta") {

    if (/wta/i.test(tournament)) {
      tour = "wta";
    }
    else {
      tour = "atp";
    }

  }


  /* ---------------------------------------------
     Round
     --------------------------------------------- */

  let round =
    raw.round ||
    raw.roundName ||
    raw.roundLabel ||
    "";

  if (typeof round === "object") {

    round =
      round.name ||
      round.label ||
      "";

  }


  /* ---------------------------------------------
     Start time
     --------------------------------------------- */

  const start =
    raw.start ||
    raw.startTime ||
    raw.date ||
    raw.timeGame ||
    "";


  /* ---------------------------------------------
     Score
     --------------------------------------------- */

  let score =
    raw.score ||
    raw.result ||
    raw.scores ||
    "";

  if (typeof score === "object") {

    score =
      score.display ||
      score.score ||
      score.result ||
      "";

  }


  /* ---------------------------------------------
     Status
     --------------------------------------------- */

  let status =
    raw.status ||
    raw.matchStatus ||
    raw.state ||
    "";

  status = String(status);


  let live =
    raw.live === true ||
    /live|inplay|in play/i.test(status);


  /* ---------------------------------------------
     Detect completed matches
     --------------------------------------------- */

  const completed =
    /finished|completed|final|ended/i.test(status);


  /* ---------------------------------------------
     Tournament category
     --------------------------------------------- */

  let level =
    raw.level ||
    raw.tier ||
    raw.category ||
    raw.rankName ||
    raw.rank ||
    "";

  if (typeof level === "object") {

    level =
      level.name ||
      "";

  }

  level = String(level || "");


  /* ---------------------------------------------
     Identify 500 / 1000 / Grand Slam / Finals
     --------------------------------------------- */

  const tournamentText =
    `${tournament} ${level}`.toLowerCase();


  let category = "";


  if (
    /grand slam|australian open|roland garros|wimbledon|us open/
      .test(tournamentText)
  ) {

    category = "Grand Slam";

  }
  else if (
    /finals|wta finals|atp finals/
      .test(tournamentText)
  ) {

    category = "Finals";

  }
  else if (
    /masters 1000|masters|1000/
      .test(tournamentText)
  ) {

    category =
      tour === "wta"
        ? "WTA 1000"
        : "ATP 1000";

  }
  else if (
    /500/
      .test(tournamentText)
  ) {

    category =
      tour === "wta"
        ? "WTA 500"
        : "ATP 500";

  }


  /* ---------------------------------------------
     Known tournament detection
     --------------------------------------------- */

  /*
     Singapore Tennis Open is supplied by the API as:

     Singapore Tennis Open - Singapore

     The API data we have already received identifies it
     as WTA and tournamentId 16747.
  */

  if (
    /singapore tennis open/i.test(tournament)
    ||
    String(tournamentId) === "16747"
  ) {

    tour = "wta";
    category = "WTA 500";

  }


  return {

    id:
      raw.id ||
      raw.matchId ||
      `${name1}-${name2}-${start}`,

    tour,

    player1: name1,
    player2: name2,

    country1,
    country2,

    rank1:
      raw.rank1 ||
      player1?.rank ||
      "",

    rank2:
      raw.rank2 ||
      player2?.rank ||
      "",

    score: score || "",

    status:
      status ||
      (live ? "Live" : "Scheduled"),

    live,

    completed,

    tournament,

    tournamentId,

    category,

    level,

    round,

    start

  };

}


/* =========================================================
   RESULTS RENDERING
   ========================================================= */

function renderResults() {

  if (!todayData) return;

  const rawMatches =
    todayData.matches ||
    todayData.events ||
    todayData.data ||
    [];

  const matches =
    Array.isArray(rawMatches)
      ? rawMatches
          .map(normaliseMatch)
          .filter(Boolean)
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


  /*
     If the old HTML structure is being used,
     remove the hard-coded matches before
     inserting API results.
  */

  const oldMatches =
    list.querySelectorAll(".match");

  oldMatches.forEach(match => match.remove());


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
     Render matches
     --------------------------------------------- */

  const fragment =
    document.createDocumentFragment();


  /*
     Group matches by tournament.
     This is important for tournaments such as
     Singapore Tennis Open.
  */

  const groups = new Map();


  filtered.forEach(match => {

    const key =
      `${match.tour}-${match.tournament || "Other"}`;

    if (!groups.has(key)) {

      groups.set(key, []);

    }

    groups.get(key).push(match);

  });


  groups.forEach((group, key) => {

    const first = group[0];

    const tournamentHeader =
      document.createElement("div");

    tournamentHeader.className =
      "api-tournament-header";


    const category =
      first.category
        ? ` · ${first.category}`
        : "";


    tournamentHeader.innerHTML = `
      <strong>
        ${escapeHTML(first.tournament || "Tennis")}
      </strong>
      <span>
        ${first.tour.toUpperCase()}${escapeHTML(category)}
      </span>
    `;


    fragment.appendChild(tournamentHeader);


    group.forEach(match => {

      const article =
        document.createElement("div");

      article.className =
        "match api-match";


      const flag1 =
        countryFlag(match.country1);

      const flag2 =
        countryFlag(match.country2);


      const player1 =
        `${flag1} ${escapeHTML(match.player1 || "TBD")}`;


      const player2 =
        `${flag2} ${escapeHTML(match.player2 || "TBD")}`;


      const score =
        formatScore(match.score);


      let status =
        match.status || "Scheduled";


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


  /*
     Remove old API messages
  */

  list
    .querySelectorAll(".api-message")
    .forEach(el => el.remove());


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


  tabs.forEach(button => {

    const text =
      button.textContent
        .trim()
        .toLowerCase();


    if (text.startsWith("atp")) {

      button.textContent =
        `ATP${atp ? ` (${atp})` : ""}`;

    }
    else if (text.startsWith("wta")) {

      button.textContent =
        `WTA${wta ? ` (${wta})` : ""}`;

    }
    else if (text.startsWith("live")) {

      button.textContent =
        `Live${live ? ` (${live})` : ""}`;

    }
    else if (text.startsWith("completed")) {

      button.textContent =
        `Completed${completed ? ` (${completed})` : ""}`;

    }

  });

}


/* =========================================================
   DATE
   ========================================================= */

function updateResultsDate() {

  const tabs =
    document.querySelector(".results-card .tabs");

  if (!tabs) return;


  tabs
    .querySelectorAll(
      "span:not(.api-date)"
    )
    .forEach(el => el.remove());


  let date =
    tabs.querySelector(".api-date");


  if (!date) {

    date =
      document.createElement("span");

    date.className =
      "api-date";

    date.style.marginLeft =
      "auto";

    tabs.appendChild(date);

  }


  if (todayData?.date) {

    date.textContent =
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
    GBR: "🇬🇧",
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

  }

}


function renderCalendar() {

  if (!calendarData) return;


  const tournaments =
    calendarData.tournaments || [];


  /*
     We deliberately don't replace the whole
     homepage with calendar data.

     The calendar remains available for the
     tournament sections.
  */


  console.log(
    "YepTennis calendar:",
    tournaments
  );

}


/* =========================================================
   RANKINGS
   ========================================================= */

async function loadRankings(tour = "atp") {

  try {

    const data =
      await fetchJSON(
        `/api/rankings?tour=${tour}`
      );


    console.log(
      `YepTennis ${tour.toUpperCase()} rankings:`,
      data
    );

  }
  catch (error) {

    console.error(
      `YepTennis rankings ${tour}:`,
      error
    );

  }

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
