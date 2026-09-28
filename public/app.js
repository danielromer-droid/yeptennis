/* =========================================================
   YepTennis - API Frontend
   ATP / WTA / Grand Slams / 1000 / 500
   ========================================================= */

const todayISO = () =>
  new Date().toISOString().slice(0, 10);

let resultsByDate = new Map(); // date string -> /api/results payload
let resultsDateISO = todayISO();
let calendarData = null;
let newsData = null;
let rankingsData = { atp: null, wta: null };
let resultsFilter = "all";   // all / atp / wta / live / completed
let resultsLevel = "all";    // all / Grand Slam / 1000 / 500 / 250
let rankingsTour = "atp";

const REFRESH_MS = 60000;

/*
   The worker caches upstream calls (12h for today's results,
   7 days for past dates, 24h for rankings/calendar), so
   polling or browsing dates this often only re-reads the
   worker's own cache - it does not add extra load on the
   RapidAPI quota.
*/


document.addEventListener("DOMContentLoaded", () => {

  setupNavigation();
  setupDateNav();
  renderDayChips();
  setupResultTabs();
  setupTourLinks();
  setupLevelTabs();
  setupRankingsTabs();

  loadResultsForDate(resultsDateISO);
  loadNews();
  loadCalendar();
  loadRankings("atp");

  setInterval(() => {
    // Only auto-refresh while looking at today - a past
    // date's results are already final.
    if (resultsDateISO === todayISO()) {
      loadResultsForDate(resultsDateISO, { silent: true });
    }
  }, REFRESH_MS);

});


/* =========================================================
   NAVIGATION
   ========================================================= */

function setupNavigation() {

  const menu = document.querySelector(".menu");
  const nav = document.querySelector(".mobile-nav");

  if (!menu || !nav) return;

  const setOpen = open => {
    nav.classList.toggle("open", open);
    menu.setAttribute("aria-expanded", open ? "true" : "false");
    menu.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    menu.textContent = open ? "✕" : "☰";
  };

  menu.addEventListener("click", () => {
    setOpen(!nav.classList.contains("open"));
  });

  nav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => setOpen(false));
  });

}


/* =========================================================
   DATE NAVIGATION (browse results day by day)
   ========================================================= */

function setupDateNav() {

  const prev = document.getElementById("date-prev");
  const next = document.getElementById("date-next");

  if (prev) {
    prev.addEventListener("click", () => shiftResultsDate(-1));
  }

  if (next) {
    next.addEventListener("click", () => shiftResultsDate(1));
  }

}

function shiftResultsDate(deltaDays) {

  const d = new Date(resultsDateISO + "T00:00:00Z");

  d.setUTCDate(d.getUTCDate() + deltaDays);

  setResultsDate(d.toISOString().slice(0, 10));

}

function setResultsDate(date) {

  if (date > todayISO()) return; // no fixtures for the future

  resultsDateISO = date;

  updateDateNavUI();

  if (resultsByDate.has(resultsDateISO)) {
    renderResults();
    updateResultsDate();
  }
  else {
    loadResultsForDate(resultsDateISO);
  }

}

/* Quick access to today + the previous 3 days (the days the
   worker keeps warm in its cache and refreshes 6x a day). */

function renderDayChips() {

  const wrap = document.getElementById("day-chips");

  if (!wrap) return;

  const base = new Date(todayISO() + "T00:00:00Z");

  const days = [0, 1, 2, 3].map(n => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  });

  wrap.innerHTML =
    days
      .map((iso, i) => {

        const label =
          i === 0
            ? "Today"
            : i === 1
              ? "Yesterday"
              : new Date(iso + "T00:00:00Z").toLocaleDateString(
                  "en-GB",
                  { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }
                );

        return `<button type="button" data-date="${iso}"${iso === resultsDateISO ? ' class="selected"' : ""}>${escapeHTML(label)}</button>`;

      })
      .join("");

  wrap.querySelectorAll("button").forEach(b => {
    b.addEventListener("click", () => setResultsDate(b.dataset.date));
  });

}

function updateDateNavUI() {

  const label = document.getElementById("date-label");
  const next = document.getElementById("date-next");

  if (label) {
    label.textContent =
      resultsDateISO === todayISO()
        ? `Today · ${formatDate(resultsDateISO)}`
        : formatDate(resultsDateISO);
  }

  if (next) {
    next.disabled = resultsDateISO >= todayISO();
  }

  document.querySelectorAll("#day-chips button").forEach(b => {
    b.classList.toggle("selected", b.dataset.date === resultsDateISO);
  });

}


/* =========================================================
   RESULT TABS (tour / live / completed)
   ========================================================= */

function setupResultTabs() {

  const tabs = document.querySelectorAll("#results-tabs button");

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
   ATP / WTA LINKS (menu, tour bar, footer)
   Jump to Results with the matching tour tab already selected.
   ========================================================= */

function setupTourLinks() {

  document.querySelectorAll("[data-tour-link]").forEach(link => {

    link.addEventListener("click", () => {

      const tour = link.dataset.tourLink;

      const tab =
        document.querySelector(`#results-tabs button[data-filter="${tour}"]`);

      if (tab) tab.click();

    });

  });

}


/* =========================================================
   LEVEL TABS (Grand Slam / 1000 / 500 / 250)
   ========================================================= */

function setupLevelTabs() {

  const tabs = document.querySelectorAll("#level-tabs button");

  if (!tabs.length) return;

  tabs.forEach(button => {

    button.addEventListener("click", () => {

      tabs.forEach(b => b.classList.remove("selected"));
      button.classList.add("selected");

      resultsLevel = button.dataset.level || "all";

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

async function loadResultsForDate(date, { silent = false } = {}) {

  const list = document.getElementById("results-list");

  if (!silent && list && !resultsByDate.has(date)) {
    list.innerHTML = `<div class="loading">Loading results...</div>`;
  }

  try {

    const data =
      await fetchJSON(`/api/results?date=${date}`);

    resultsByDate.set(date, data);

    if (resultsDateISO === date) {
      renderResults();
      updateResultsDate();
    }

  }
  catch (error) {

    console.error("YepTennis /api/results:", error);

    if (resultsDateISO === date && !resultsByDate.has(date)) {
      showResultsError();
    }

  }

}

function explainResultsError(errors) {
  const text = errors.join(" ");
  if (/QUOTA|429|quota|exceeded/i.test(text)) {
    return "Scores can't load right now: the tennis data provider's daily limit has been reached. They will appear automatically after the limit resets.";
  }
  if (/KEY|401|403|subscribed|not configured/i.test(text)) {
    return "Scores can't load: the tennis data key isn't accepted. Check the TENNIS_API_KEY secret in Cloudflare.";
  }
  return "Scores can't load right now from the tennis data provider. The site retries automatically.";
}

function showResultsError() {
  const list = document.getElementById("results-list");
  if (list) list.innerHTML = `<div class="api-message">Results temporarily unavailable.</div>`;
}


/* =========================================================
   RESULTS RENDERING
   ========================================================= */

function renderResults() {

  const activeData = resultsByDate.get(resultsDateISO);
  if (!activeData) return;

  const matches =
    Array.isArray(activeData.matches)
      ? activeData.matches
      : [];


  let filtered = matches;


  /* ---------------------------------------------
     Tour / live / completed filter
     --------------------------------------------- */

  if (resultsFilter === "atp") {

    filtered =
      filtered.filter(m => m.tour === "atp");

  }
  else if (resultsFilter === "wta") {

    filtered =
      filtered.filter(m => m.tour === "wta");

  }
  else if (resultsFilter === "live") {

    filtered =
      filtered.filter(m => m.live);

  }
  else if (resultsFilter === "completed") {

    filtered =
      filtered.filter(m => m.completed);

  }


  /* ---------------------------------------------
     Level filter (Grand Slam / 1000 / 500 / 250)
     --------------------------------------------- */

  if (resultsLevel !== "all") {

    filtered =
      filtered.filter(m => m.category === resultsLevel);

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

    const errors =
      Array.isArray(activeData.errors) ? activeData.errors : [];

    const failedAll = !matches.length && errors.length;

    message.textContent =
      failedAll
        ? explainResultsError(errors)
        : resultsFilter === "wta"
          ? "No WTA matches for this day/filter."
          : resultsFilter === "atp"
            ? "No ATP matches for this day/filter."
            : "No matches for this day/filter.";

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

    const category = first.category || "";

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
      else if (match.status === "Final score pending") {
        status = "Played · final score soon";
      }
      else if (!match.completed && match.start) {
        const t = new Date(match.start);
        if (!Number.isNaN(t.getTime())) {
          status = "Scheduled · " + t.toLocaleTimeString(
            "en-GB",
            { hour: "2-digit", minute: "2-digit" }
          );
        }
      }

      const round =
        match.round
          ? `<span class="match-round">${escapeHTML(formatRound(match.round))}</span>`
          : "";

      article.innerHTML = `
        <div class="match-players">
          <b class="${match.winner === 1 ? "winner" : ""}">${player1}${match.winner === 1 ? " ✓" : ""}</b>
          <b class="${match.winner === 1 ? "loser" : ""}">${player2}</b>
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
      "#results-tabs button"
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


  updateLevelCounts(matches);

}


function updateLevelCounts(matches) {

  const tabs =
    document.querySelectorAll(
      "#level-tabs button"
    );

  if (!tabs.length) return;

  const counts = {};

  matches.forEach(m => {
    const key = m.category || "";
    counts[key] = (counts[key] || 0) + 1;
  });

  tabs.forEach(button => {

    const level = button.dataset.level;

    if (level === "all") {
      button.textContent = "ALL LEVELS";
      return;
    }

    const n = counts[level] || 0;

    button.textContent = `${level.toUpperCase()}${n ? ` (${n})` : ""}`;

  });

}


/* =========================================================
   DATE
   ========================================================= */

function updateResultsDate() {

  const el =
    document.querySelector(".results-section .api-date");

  if (!el) return;

  const activeData = resultsByDate.get(resultsDateISO);

  if (activeData?.date) {
    el.textContent = `▣ ${formatDate(activeData.date)}`;
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
      .slice(0, 20);

  if (!tournaments.length) {

    container.innerHTML = `
      <div class="api-message">
        No upcoming Grand Slam / 1000 / 500 / 250 events found.
      </div>
    `;

    return;

  }

  const tourLabel = t =>
    t.tour === "both" ? "ATP · WTA" : String(t.tour || "").toUpperCase();

  const approx =
    calendarData.source === "fallback"
      ? `<div class="api-message">Typical annual schedule — exact dates will appear once the live calendar loads.</div>`
      : "";

  container.innerHTML =
    tournaments
      .map(t => `
        <article class="calendar-item">
          <div>
            <b>${escapeHTML(t.name || "Tournament")}</b>
            <span>
              ${escapeHTML(tourLabel(t))}
              ${t.country ? " · " + escapeHTML(t.country) : ""}
            </span>
          </div>
          <span class="calendar-badge${t.category ? " cat-" + slug(t.category) : ""}">
            ${escapeHTML(t.category || t.tier || "")}
          </span>
          <small>${escapeHTML(t.when || formatDate(t.start))}</small>
        </article>
      `)
      .join("") + approx;

}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
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
      .slice(0, 20);

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
            <b>${countryFlag(p.country)} ${escapeHTML(p.name || "Player")}</b>
            <small class="ranking-bio" data-name="${escapeHTML(p.name || "")}"></small>
          </span>
          <span class="ranking-points">${escapeHTML(String(p.points ?? ""))}</span>
          <a
            class="ranking-info"
            href="${playerInfoURL(p.name)}"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="More about ${escapeHTML(p.name || "this player")}"
          >
            ⓘ
          </a>
        </article>
      `)
      .join("");

  loadPlayerBios(container);

}


/* =========================================================
   PLAYER BIOS ("a few words about the player")

   Fetched from the worker (Wikipedia summary, cached 30 days),
   3 at a time, and filled in under each name.
   ========================================================= */

const bioCache = new Map();

async function loadPlayerBios(container) {

  const slots = [...container.querySelectorAll(".ranking-bio")];

  const fill = (slot, bio) => {
    if (!bio?.summary) return;
    slot.textContent = bio.summary;
    const link = slot.closest(".ranking-item")?.querySelector(".ranking-info");
    if (link && bio.url) link.href = bio.url;
  };

  const queue = slots.slice();

  const worker = async () => {

    while (queue.length) {

      const slot = queue.shift();
      const name = slot.dataset.name;

      if (!name) continue;

      if (!bioCache.has(name)) {
        try {
          bioCache.set(
            name,
            await fetchJSON(`/api/player-bio?name=${encodeURIComponent(name)}`)
          );
        }
        catch {
          bioCache.set(name, null);
        }
      }

      if (slot.isConnected) fill(slot, bioCache.get(name));

    }

  };

  await Promise.all([worker(), worker(), worker()]);

}


/* =========================================================
   PLAYER INFO LINK

   We don't get a canonical profile URL from the API, so
   this points at a Wikipedia search for the player's name -
   a reliable link that will surface their page (or the
   closest match) rather than guessing a URL that might 404.
   ========================================================= */

function playerInfoURL(name) {

  const query =
    encodeURIComponent(`${name || ""} tennis`);

  return `https://en.wikipedia.org/w/index.php?search=${query}&title=Special:Search&fulltext=1`;

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
