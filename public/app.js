/* =========================================================
   YepTennis - Frontend
   ATP / WTA Results + News + Calendar + Rankings
   ========================================================= */

let todayData = null;
let calendarData = null;
let newsData = null;
let resultsFilter = "all";


/* =========================================================
   START
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

  setupNavigation();
  setupResultTabs();

  loadToday();
  loadNews();
  loadCalendar();
  loadRankings();

});


/* =========================================================
   MOBILE NAVIGATION
   ========================================================= */

function setupNavigation() {

  const menu = document.querySelector(".menu");
  const nav = document.querySelector("nav");

  if (!menu || !nav) return;

  menu.addEventListener("click", () => {

    nav.classList.toggle("mobile-open");

  });

}


/* =========================================================
   RESULT TABS
   ========================================================= */

function setupResultTabs() {

  const tabs = document.querySelectorAll(
    ".results-card .tabs button"
  );

  if (!tabs.length) return;

  tabs.forEach((button, index) => {

    button.addEventListener("click", () => {

      tabs.forEach(b =>
        b.classList.remove("selected")
      );

      button.classList.add("selected");

      if (index === 0) {
        resultsFilter = "all";
      }

      if (index === 1) {
        resultsFilter = "wta";
      }

      if (index === 2) {
        resultsFilter = "live";
      }

      if (index === 3) {
        resultsFilter = "completed";
      }

      renderResults();

    });

  });

}


/* =========================================================
   GENERIC FETCH
   ========================================================= */

async function fetchJSON(url) {

  const response = await fetch(url, {
    cache: "no-store"
  });

  const text = await response.text();

  let data = {};

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON response");
  }

  if (!response.ok) {

    throw new Error(
      data.error ||
      data.message ||
      `HTTP ${response.status}`
    );

  }

  return data;

}


/* =========================================================
   TODAY'S RESULTS
   ========================================================= */

async function loadToday() {

  const container =
    document.getElementById("results-list");

  if (container) {

    container.innerHTML =
      `<div class="loading">Loading today's results...</div>`;

  }

  try {

    todayData =
      await fetchJSON("/api/today");

    renderResults();

    updateResultsDate();

  } catch (error) {

    console.error("Today API:", error);

    if (container) {

      container.innerHTML =
        `<div class="loading">
          Results temporarily unavailable.
        </div>`;

    }

  }

}


/* =========================================================
   NORMALISE MATCH
   ========================================================= */

function normaliseMatch(match) {

  const p1 =
    match.player1 ||
    match.home ||
    match.playerOne ||
    {};

  const p2 =
    match.player2 ||
    match.away ||
    match.playerTwo ||
    {};

  const player1 =
    typeof p1 === "string"
      ? p1
      : p1.name ||
        p1.playerName ||
        p1.fullName ||
        "Player 1";

  const player2 =
    typeof p2 === "string"
      ? p2
      : p2.name ||
        p2.playerName ||
        p2.fullName ||
        "Player 2";

  const country1 =
    typeof p1 === "object"
      ? (
          p1.countryAcr ||
          p1.country ||
          p1.countryCode ||
          match.country1 ||
          ""
        )
      : (match.country1 || "");

  const country2 =
    typeof p2 === "object"
      ? (
          p2.countryAcr ||
          p2.country ||
          p2.countryCode ||
          match.country2 ||
          ""
        )
      : (match.country2 || "");

  let score =
    match.score ||
    match.result ||
    match.scores ||
    "";

  if (typeof score === "object") {

    score =
      score.display ||
      score.score ||
      "";

  }

  return {

    id:
      match.id ||
      match.matchId ||
      "",

    tour:
      String(match.tour || "")
        .toLowerCase(),

    player1,
    player2,

    country1,
    country2,

    rank1:
      match.rank1 ||
      (typeof p1 === "object"
        ? p1.rank
        : "") ||
      "",

    rank2:
      match.rank2 ||
      (typeof p2 === "object"
        ? p2.rank
        : "") ||
      "",

    score: score || "",

    status:
      match.status ||
      match.matchStatus ||
      "Scheduled",

    live:
      !!match.live ||
      /live|inplay|in play/i.test(
        String(match.status || "")
      ),

    tournament:
      match.tournament ||
      match.tournamentName ||
      "",

    round:
      match.round ||
      match.roundName ||
      "",

    start:
      match.start ||
      match.startTime ||
      match.date ||
      ""

  };

}


/* =========================================================
   RENDER RESULTS
   ========================================================= */

function renderResults() {

  const container =
    document.getElementById("results-list");

  if (!container) return;

  if (
    !todayData ||
    !Array.isArray(todayData.matches)
  ) {

    container.innerHTML =
      `<div class="loading">
        No results available.
      </div>`;

    updateResultCounts([]);

    return;

  }

  const matches =
    todayData.matches.map(
      normaliseMatch
    );

  let filtered = matches;

  if (resultsFilter === "wta") {

    filtered =
      matches.filter(
        m => m.tour === "wta"
      );

  }

  if (resultsFilter === "live") {

    filtered =
      matches.filter(
        m => m.live
      );

  }

  if (resultsFilter === "completed") {

    filtered =
      matches.filter(
        m => isCompleted(m)
      );

  }

  if (!filtered.length) {

    container.innerHTML =
      `<div class="loading">
        No matches found.
      </div>`;

    updateResultCounts(matches);

    return;

  }

  container.innerHTML =
    filtered
      .map(renderMatch)
      .join("");

  updateResultCounts(matches);

}


/* =========================================================
   COMPLETED STATUS
   ========================================================= */

function isCompleted(match) {

  return /finished|completed|final|ended/i.test(
    String(match.status || "")
  );

}


/* =========================================================
   RENDER ONE MATCH
   ========================================================= */

function renderMatch(match) {

  const flag1 =
    flagForCountry(match.country1);

  const flag2 =
    flagForCountry(match.country2);

  const rank1 =
    match.rank1
      ? `<em>(${escapeHTML(match.rank1)})</em>`
      : "";

  const rank2 =
    match.rank2
      ? `<em>(${escapeHTML(match.rank2)})</em>`
      : "";

  const score =
    match.score
      ? escapeHTML(formatScore(match.score))
      : "";

  const status =
    match.live
      ? "LIVE"
      : match.status || "Scheduled";

  const tournament =
    match.tournament
      ? escapeHTML(match.tournament)
      : "";

  const round =
    match.round
      ? escapeHTML(
          typeof match.round === "object"
            ? (
                match.round.name ||
                match.round.roundName ||
                ""
              )
            : match.round
        )
      : "";

  let meta = "";

  if (tournament) {
    meta += tournament;
  }

  if (round) {

    if (meta) meta += " · ";

    meta += round;

  }

  return `

    <div class="match">

      <div>

        <b>
          ${flag1}
          ${escapeHTML(match.player1)}
          ${rank1}
        </b>

        <b>
          ${flag2}
          ${escapeHTML(match.player2)}
          ${rank2}
        </b>

        ${
          meta
            ? `<small class="match-meta">${meta}</small>`
            : ""
        }

      </div>

      <div class="scores">

        <b>
          ${score}
        </b>

      </div>

      <small>
        ${escapeHTML(status)}
      </small>

    </div>

  `;

}


/* =========================================================
   FORMAT SCORE
   ========================================================= */

function formatScore(score) {

  if (typeof score !== "string") {
    return "";
  }

  return score
    .replace(/\[/g, "")
    .replace(/\]/g, "")
    .trim();

}


/* =========================================================
   RESULT COUNTS
   ========================================================= */

function updateResultCounts(matches) {

  const tabs =
    document.querySelectorAll(
      ".results-card .tabs button"
    );

  if (!tabs.length) return;

  const atp =
    matches.filter(
      m => m.tour === "atp"
    ).length;

  const wta =
    matches.filter(
      m => m.tour === "wta"
    ).length;

  const live =
    matches.filter(
      m => m.live
    ).length;

  const completed =
    matches.filter(
      m => isCompleted(m)
    ).length;

  if (tabs[0]) {
    tabs[0].textContent =
      `ATP (${atp})`;
  }

  if (tabs[1]) {
    tabs[1].textContent =
      `WTA (${wta})`;
  }

  if (tabs[2]) {
    tabs[2].textContent =
      `Live (${live})`;
  }

  if (tabs[3]) {
    tabs[3].textContent =
      `Completed (${completed})`;
  }

}


/* =========================================================
   RESULTS DATE
   ========================================================= */

function updateResultsDate() {

  const tabs =
    document.querySelector(
      ".results-card .tabs"
    );

  if (!tabs) return;

  tabs
    .querySelectorAll(
      "span:not(.api-date)"
    )
    .forEach(
      element => element.remove()
    );

  let date =
    tabs.querySelector(
      ".api-date"
    );

  if (!date) {

    date =
      document.createElement(
        "span"
      );

    date.className =
      "api-date";

    date.style.marginLeft =
      "auto";

    tabs.appendChild(date);

  }

  if (
    todayData &&
    todayData.date
  ) {

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
   BBC / TENNIS NEWS
   ========================================================= */

async function loadNews() {

  const container =
    document.getElementById("news-list");

  if (!container) return;

  container.innerHTML =
    `<div class="loading">
      Loading latest news...
    </div>`;

  try {

    newsData =
      await fetchJSON("/api/news");

    renderNews();

  } catch (error) {

    console.error("News API:", error);

    container.innerHTML =
      `<div class="loading">
        News temporarily unavailable.
      </div>`;

  }

}


/* =========================================================
   RENDER NEWS
   ========================================================= */

function renderNews() {

  const container =
    document.getElementById("news-list");

  if (!container) return;

  const items =
    newsData &&
    Array.isArray(newsData.items)
      ? newsData.items.slice(0, 6)
      : [];

  if (!items.length) {

    container.innerHTML =
      `<div class="loading">
        No news available.
      </div>`;

    return;

  }

  container.innerHTML =
    items
      .map(renderNewsItem)
      .join("");

}


/* =========================================================
   ONE NEWS ITEM
   ========================================================= */

function renderNewsItem(item) {

  const title =
    item.title ||
    "Tennis news";

  const link =
    item.link ||
    "#";

  const source =
    item.source ||
    "Tennis";

  const date =
    item.dateLabel ||
    "";

  /*
    BBC image supplied by /api/news.

    If the BBC RSS feed contains an image,
    it is displayed as a square 90 x 90 image.
  */

  let imageHTML = "";

  if (item.image) {

    imageHTML = `
      <img
        class="news-img"
        src="${escapeHTML(item.image)}"
        alt=""
        loading="lazy"
      >
    `;

  } else {

    imageHTML = `
      <div class="news-img news-placeholder"></div>
    `;

  }

  return `

    <a
      class="news-item"
      href="${escapeHTML(link)}"
      target="_blank"
      rel="noopener noreferrer"
    >

      ${imageHTML}

      <div class="news-content">

        <b>
          ${escapeHTML(title)}
        </b>

        ${
          item.description
            ? `<p>${escapeHTML(
                shortenText(item.description, 150)
              )}</p>`
            : ""
        }

        <span>
          ${escapeHTML(source)}
          ${date ? ` · ${escapeHTML(date)}` : ""}
        </span>

      </div>

    </a>

  `;

}


/* =========================================================
   SHORTEN NEWS TEXT
   ========================================================= */

function shortenText(text, maxLength) {

  if (!text) return "";

  text =
    String(text)
      .replace(/\s+/g, " ")
      .trim();

  if (text.length <= maxLength) {
    return text;
  }

  return (
    text.substring(0, maxLength)
      .replace(/\s+\S*$/, "") +
    "..."
  );

}


/* =========================================================
   CALENDAR
   ========================================================= */

async function loadCalendar() {

  const container =
    document.getElementById(
      "calendar-list"
    );

  if (!container) return;

  try {

    calendarData =
      await fetchJSON(
        "/api/calendar"
      );

    renderCalendar();

  } catch (error) {

    console.error(
      "Calendar API:",
      error
    );

    container.innerHTML =
      `<div class="loading">
        Calendar temporarily unavailable.
      </div>`;

  }

}


/* =========================================================
   RENDER CALENDAR
   ========================================================= */

function renderCalendar() {

  const container =
    document.getElementById(
      "calendar-list"
    );

  if (!container) return;

  const tournaments =
    calendarData &&
    Array.isArray(
      calendarData.tournaments
    )
      ? calendarData.tournaments
      : [];

  if (!tournaments.length) {

    container.innerHTML =
      `<div class="loading">
        No tournament data available.
      </div>`;

    return;

  }

  container.innerHTML =
    tournaments
      .slice(0, 12)
      .map(t => {

        return `

          <article class="calendar-item">

            <b>
              ${escapeHTML(
                t.name || "Tournament"
              )}
            </b>

            <span>
              ${escapeHTML(
                String(
                  t.tour || ""
                ).toUpperCase()
              )}
            </span>

            <span>
              ${
                t.start
                  ? formatDate(t.start)
                  : ""
              }
            </span>

          </article>

        `;

      })
      .join("");

}


/* =========================================================
   RANKINGS
   ========================================================= */

async function loadRankings() {

  loadRanking(
    "atp",
    "atp-ranking-list"
  );

  loadRanking(
    "wta",
    "wta-ranking-list"
  );

}


/* =========================================================
   LOAD ONE RANKING
   ========================================================= */

async function loadRanking(
  tour,
  elementId
) {

  const container =
    document.getElementById(
      elementId
    );

  if (!container) return;

  try {

    const data =
      await fetchJSON(
        `/api/rankings?tour=${tour}`
      );

    const players =
      Array.isArray(data.players)
        ? data.players
        : [];

    if (!players.length) {

      container.innerHTML =
        `<div class="loading">
          Rankings unavailable.
        </div>`;

      return;

    }

    container.innerHTML =
      players
        .slice(0, 10)
        .map((player, index) => {

          const rank =
            player.rank ||
            index + 1;

          return `

            <div class="ranking-row">

              <strong>
                ${escapeHTML(rank)}
              </strong>

              <span>
                ${escapeHTML(
                  player.name ||
                  "Player"
                )}
              </span>

              <small>
                ${
                  player.points
                    ? escapeHTML(
                        String(
                          player.points
                        )
                      )
                    : ""
                }
              </small>

            </div>

          `;

        })
        .join("");

  } catch (error) {

    console.error(
      `${tour} rankings:`,
      error
    );

    container.innerHTML =
      `<div class="loading">
        Rankings unavailable.
      </div>`;

  }

}


/* =========================================================
   FLAGS
   ========================================================= */

function flagForCountry(
  country
) {

  const c =
    String(country || "")
      .toUpperCase();

  const flags = {

    USA: "🇺🇸",
    GBR: "🇬🇧",
    FRA: "🇫🇷",
    ESP: "🇪🇸",
    ITA: "🇮🇹",
    SRB: "🇷🇸",
    GER: "🇩🇪",
    SUI: "🇨🇭",
    AUT: "🇦🇹",
    BEL: "🇧🇪",
    CRO: "🇭🇷",
    CZE: "🇨🇿",
    DEN: "🇩🇰",
    POL: "🇵🇱",
    NED: "🇳🇱",
    GRE: "🇬🇷",
    RUS: "🇷🇺",
    UKR: "🇺🇦",
    CAN: "🇨🇦",
    AUS: "🇦🇺",
    JPN: "🇯🇵",
    CHN: "🇨🇳",
    KOR: "🇰🇷",
    BRA: "🇧🇷",
    ARG: "🇦🇷",
    CHI: "🇨🇱",
    COL: "🇨🇴",
    MEX: "🇲🇽",
    TUN: "🇹🇳",
    POR: "🇵🇹",
    ROU: "🇷🇴",
    BUL: "🇧🇬",
    KAZ: "🇰🇿",
    HUN: "🇭🇺",
    SVK: "🇸🇰",
    SRB: "🇷🇸",
    SWE: "🇸🇪",
    NOR: "🇳🇴",
    FIN: "🇫🇮",
    RSA: "🇿🇦",
    IND: "🇮🇳",
    NZL: "🇳🇿"

  };

  return flags[c] || "🌐";

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
