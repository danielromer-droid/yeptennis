/* =========================================================
   YepTennis
   Frontend application

   API:
   /api/today
   /api/calendar
   /api/rankings
   /api/news
========================================================= */


/* =========================================================
   GLOBAL STATE
========================================================= */

let todayData = null;
let calendarData = null;
let newsData = null;

let selectedTour = "all";


/* =========================================================
   DOM HELPER
========================================================= */

function $(selector) {
  return document.querySelector(selector);
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


/* =========================================================
   FETCH JSON
========================================================= */

async function getJSON(url) {

  const separator =
    url.includes("?")
      ? "&"
      : "?";

  const response =
    await fetch(
      `${url}${separator}_=${Date.now()}`,
      {
        method: "GET",
        headers: {
          "Accept":
            "application/json"
        },
        cache: "no-store"
      }
    );

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}`
    );
  }

  return response.json();
}


/* =========================================================
   DATE
========================================================= */

function formatDate(value) {

  if (!value) {
    return "";
  }

  const d =
    new Date(value);

  if (
    Number.isNaN(
      d.getTime()
    )
  ) {
    return "";
  }

  return d.toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric"
    }
  );
}


/* =========================================================
   TIME
========================================================= */

function formatTime(value) {

  if (!value) {
    return "";
  }

  const d =
    new Date(value);

  if (
    Number.isNaN(
      d.getTime()
    )
  ) {
    return "";
  }

  return d.toLocaleTimeString(
    "en-GB",
    {
      hour: "2-digit",
      minute: "2-digit"
    }
  );
}


/* =========================================================
   SHORT DATE
========================================================= */

function formatShortDate(value) {

  if (!value) {
    return "";
  }

  const d =
    new Date(value);

  if (
    Number.isNaN(
      d.getTime()
    )
  ) {
    return "";
  }

  return d.toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "short"
    }
  );
}


/* =========================================================
   TOUR LABEL
========================================================= */

function tourLabel(tour) {

  return String(tour)
    .toLowerCase() === "wta"
    ? "WTA"
    : "ATP";
}


/* =========================================================
   FILTER SINGLES
========================================================= */

function isSingles(match) {

  if (!match) {
    return false;
  }

  /*
   * Doubles are returned by the API in some fixtures.
   * They appear as:
   *
   * Player One/Player Two
   *
   * Exclude them from the homepage.
   */

  if (
    String(
      match.player1 || ""
    ).includes("/")
  ) {
    return false;
  }

  if (
    String(
      match.player2 || ""
    ).includes("/")
  ) {
    return false;
  }

  return true;
}


/* =========================================================
   GET MATCHES
========================================================= */

function getMatches() {

  if (
    !todayData ||
    !Array.isArray(
      todayData.matches
    )
  ) {
    return [];
  }

  return todayData.matches
    .filter(isSingles);
}


/* =========================================================
   SELECTED TOUR
========================================================= */

function filterTour(
  matches
) {

  if (
    selectedTour ===
    "all"
  ) {
    return matches;
  }

  return matches.filter(
    match =>
      String(
        match.tour || ""
      ).toLowerCase() ===
      selectedTour
  );
}


/* =========================================================
   MATCH STATUS
========================================================= */

function matchStatus(
  match
) {

  if (match.live) {
    return "LIVE";
  }

  if (
    match.status &&
    String(
      match.status
    ).toLowerCase() !==
      "scheduled"
  ) {
    return match.status;
  }

  return "Scheduled";
}


/* =========================================================
   MATCH CARD
========================================================= */

function matchCard(
  match
) {

  const p1 =
    match.player1 ||
    "Player 1";

  const p2 =
    match.player2 ||
    "Player 2";

  const c1 =
    match.country1 ||
    "";

  const c2 =
    match.country2 ||
    "";

  const tournament =
    match.tournament ||
    "Tournament";

  const round =
    match.round ||
    "";

  const time =
    formatTime(
      match.start
    );

  const status =
    matchStatus(
      match
    );

  const isLive =
    !!match.live;

  const score =
    match.score ||
    "";

  return `
    <article
      class="tennis-result-card ${
        isLive
          ? "is-live"
          : ""
      }"
    >

      <div class="tennis-result-top">

        <span class="tennis-tour">
          ${escapeHTML(
            tourLabel(
              match.tour
            )
          )}
        </span>

        <span class="${
          isLive
            ? "tennis-live"
            : "tennis-status"
        }">

          ${
            isLive
              ? "● LIVE"
              : escapeHTML(
                  status
                )
          }

        </span>

      </div>


      <div class="tennis-players">

        <div class="tennis-player">

          <strong>
            ${escapeHTML(
              p1
            )}
          </strong>

          ${
            c1
              ? `<small>${escapeHTML(
                  c1
                )}</small>`
              : ""
          }

        </div>


        <div class="tennis-score">

          ${
            score
              ? escapeHTML(
                  score
                )
              : time
              ? escapeHTML(
                  time
                )
              : "—"
          }

        </div>


        <div class="tennis-player">

          <strong>
            ${escapeHTML(
              p2
            )}
          </strong>

          ${
            c2
              ? `<small>${escapeHTML(
                  c2
                )}</small>`
              : ""
          }

        </div>

      </div>


      <div class="tennis-result-bottom">

        <span>
          ${escapeHTML(
            tournament
          )}
        </span>

        ${
          round
            ? `<span>${escapeHTML(
                round
              )}</span>`
            : ""
        }

      </div>

    </article>
  `;
}


/* =========================================================
   TODAY RESULTS
========================================================= */

function renderTodayResults() {

  const matches =
    filterTour(
      getMatches()
    );


  /*
   * Try the IDs first.
   */

  let container =
    $(
      "#today-results"
    ) ||
    $(
      "#today-results-grid"
    ) ||
    $(
      "#results-grid"
    );


  /*
   * If your existing HTML uses
   * #scores-grid, use that.
   */

  if (!container) {
    container =
      $(
        "#scores-grid"
      );
  }


  /*
   * If there is no recognised
   * container, don't touch the page.
   */

  if (!container) {
    return;
  }


  if (!matches.length) {

    container.innerHTML = `
      <div class="empty">

        No ${
          selectedTour === "all"
            ? ""
            : tourLabel(
                selectedTour
              ) + " "
        }singles matches
        available today.

      </div>
    `;

    return;
  }


  /*
   * Sort:
   * LIVE first,
   * then completed,
   * then upcoming.
   */

  const sorted =
    [...matches].sort(
      (a, b) => {

        const liveA =
          a.live ? 0 : 1;

        const liveB =
          b.live ? 0 : 1;

        if (
          liveA !==
          liveB
        ) {
          return (
            liveA -
            liveB
          );
        }

        const dateA =
          new Date(
            a.start || 0
          ).getTime();

        const dateB =
          new Date(
            b.start || 0
          ).getTime();

        return (
          dateA -
          dateB
        );
      }
    );


  /*
   * Homepage should remain
   * compact.
   *
   * Show the first 8.
   */

  const visible =
    sorted.slice(
      0,
      8
    );


  container.innerHTML =
    visible
      .map(
        matchCard
      )
      .join("");
}


/* =========================================================
   RESULTS TABS
========================================================= */

function renderResultTabs() {

  /*
   * Look for a tab container.
   */

  const container =
    $(
      "#results-tabs"
    ) ||
    $(
      "#today-tabs"
    ) ||
    $(
      ".results-tabs"
    );


  if (!container) {
    return;
  }


  container.innerHTML = `

    <button
      type="button"
      class="${
        selectedTour === "all"
          ? "active"
          : ""
      }"
      data-tour="all"
    >
      All
    </button>

    <button
      type="button"
      class="${
        selectedTour === "atp"
          ? "active"
          : ""
      }"
      data-tour="atp"
    >
      ATP
    </button>

    <button
      type="button"
      class="${
        selectedTour === "wta"
          ? "active"
          : ""
      }"
      data-tour="wta"
    >
      WTA
    </button>

  `;


  container
    .querySelectorAll(
      "[data-tour]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            selectedTour =
              button.dataset
                .tour ||
              "all";

            renderResultTabs();

            renderTodayResults();

          }
        );

      }
    );
}


/* =========================================================
   NEXT MASTERS
========================================================= */

function getMasters() {

  if (
    !calendarData ||
    !Array.isArray(
      calendarData.tournaments
    )
  ) {
    return [];
  }

  return calendarData
    .tournaments
    .filter(
      tournament =>
        tournament &&
        tournament.start
    );
}


/* =========================================================
   FIND NEXT MASTERS
========================================================= */

function nextMasters() {

  const now =
    Date.now();


  return getMasters()
    .filter(
      tournament => {

        const start =
          new Date(
            tournament.start
          ).getTime();

        return (
          Number.isFinite(
            start
          ) &&
          start >= now
        );
      }
    )
    .sort(
      (a, b) =>
        new Date(
          a.start
        ) -
        new Date(
          b.start
        )
    );
}


/* =========================================================
   NEXT MASTERS CARD
========================================================= */

function mastersCard(
  tournament
) {

  const name =
    tournament.name ||
    "Masters tournament";

  const tour =
    tourLabel(
      tournament.tour
    );

  const start =
    formatShortDate(
      tournament.start
    );

  const end =
    formatShortDate(
      tournament.end
    );

  const dates =
    end
      ? `${start} – ${end}`
      : start;


  return `
    <article
      class="next-masters-card"
    >

      <div
        class="next-masters-image"
      >

        <div
          class="masters-placeholder"
        >
          ${escapeHTML(
            tour
          )}
        </div>

      </div>


      <div
        class="next-masters-info"
      >

        <strong>
          ${escapeHTML(
            name
          )}
        </strong>

        <small>
          ${escapeHTML(
            tour
          )}
          ${
            tournament.country
              ? " · " +
                escapeHTML(
                  tournament.country
                )
              : ""
          }
        </small>

        <small>
          ${escapeHTML(
            dates
          )}
        </small>

      </div>

    </article>
  `;
}


/* =========================================================
   RENDER NEXT MASTERS
========================================================= */

function renderNextMasters() {

  const tournaments =
    nextMasters()
      .slice(
        0,
        4
      );


  let container =
    $(
      "#next-masters"
    ) ||
    $(
      "#next-masters-list"
    ) ||
    $(
      "#masters-next"
    );


  if (!container) {
    return;
  }


  if (!tournaments.length) {

    container.innerHTML = `
      <div class="empty">
        No upcoming Masters tournaments found.
      </div>
    `;

    return;
  }


  container.innerHTML =
    tournaments
      .map(
        mastersCard
      )
      .join("");
}


/* =========================================================
   CURRENT MASTERS
========================================================= */

function currentMasters() {

  const tournaments =
    getMasters();


  const now =
    Date.now();


  return tournaments
    .filter(
      tournament => {

        const start =
          new Date(
            tournament.start
          ).getTime();

        const end =
          tournament.end
            ? new Date(
                tournament.end
              ).getTime()
            : start;


        return (
          start <= now &&
          end >= now
        );
      }
    )
    .sort(
      (a, b) =>
        new Date(
          a.start
        ) -
        new Date(
          b.start
        )
    );
}


/* =========================================================
   RENDER CURRENT MASTERS
========================================================= */

function renderCurrentMasters() {

  const current =
    currentMasters()[0];


  if (!current) {
    return;
  }


  const name =
    $(
      "#current-masters-name"
    ) ||
    $(
      "#current-tournament-name"
    );


  if (name) {
    name.textContent =
      current.name ||
      "Masters";
  }


  const dates =
    $(
      "#current-masters-dates"
    ) ||
    $(
      "#current-tournament-dates"
    );


  if (dates) {

    dates.textContent =
      `${formatShortDate(
        current.start
      )}${
        current.end
          ? " – " +
            formatShortDate(
              current.end
            )
          : ""
      }`;
  }


  const country =
    $(
      "#current-masters-country"
    );


  if (country) {

    country.textContent =
      current.country ||
      "";
  }
}


/* =========================================================
   NEWS CARD
========================================================= */

function newsCard(
  article
) {

  const title =
    article.title ||
    "Tennis news";


  const link =
    article.link ||
    "#";


  const source =
    article.source ||
    "Tennis";


  const date =
    article.dateLabel ||
    formatShortDate(
      article.date
    );


  return `
    <article
      class="tennis-news-card"
    >

      <div
        class="tennis-news-meta"
      >

        <span>
          ${escapeHTML(
            source
          )}
        </span>

        ${
          date
            ? `<span>${escapeHTML(
                date
              )}</span>`
            : ""
        }

      </div>


      <h3>

        <a
          href="${escapeHTML(
            link
          )}"
          target="_blank"
          rel="noopener noreferrer"
        >

          ${escapeHTML(
            title
          )}

        </a>

      </h3>

    </article>
  `;
}


/* =========================================================
   RENDER NEWS
========================================================= */

function renderNews() {

  const articles =
    newsData &&
    Array.isArray(
      newsData.items
    )
      ? newsData.items
      : [];


  let container =
    $(
      "#latest-news"
    ) ||
    $(
      "#latest-news-list"
    ) ||
    $(
      "#news-grid"
    ) ||
    $(
      "#news-list"
    );


  if (!container) {
    return;
  }


  if (!articles.length) {

    container.innerHTML = `
      <div class="empty">
        No tennis news available.
      </div>
    `;

    return;
  }


  container.innerHTML =
    articles
      .slice(
        0,
        5
      )
      .map(
        newsCard
      )
      .join("");
}


/* =========================================================
   UPDATED LABEL
========================================================= */

function updateTimestamp() {

  const element =
    $(
      "#updated"
    );


  if (!element) {
    return;
  }


  element.textContent =
    `Updated ${new Date()
      .toLocaleTimeString(
        "en-GB",
        {
          hour:
            "2-digit",
          minute:
            "2-digit"
        }
      )}`;
}


/* =========================================================
   RESULTS STATUS
========================================================= */

function updateResultsStatus() {

  const element =
    $(
      "#results-status"
    ) ||
    $(
      "#today-status"
    ) ||
    $(
      "#scores-status"
    );


  if (!element) {
    return;
  }


  const count =
    filterTour(
      getMatches()
    ).length;


  element.textContent =
    `${count} ${
      count === 1
        ? "match"
        : "matches"
    }`;
}


/* =========================================================
   LOAD TODAY
========================================================= */

async function loadToday() {

  try {

    todayData =
      await getJSON(
        "/api/today"
      );


    renderResultTabs();

    renderTodayResults();

    updateResultsStatus();

    updateTimestamp();


  } catch (error) {

    console.error(
      "YepTennis /api/today:",
      error
    );


    const container =
      $(
        "#today-results"
      ) ||
      $(
        "#today-results-grid"
      ) ||
      $(
        "#results-grid"
      ) ||
      $(
        "#scores-grid"
      );


    if (container) {

      container.innerHTML = `
        <div class="empty">
          Today's results are temporarily unavailable.
        </div>
      `;
    }


    const status =
      $(
        "#results-status"
      ) ||
      $(
        "#today-status"
      ) ||
      $(
        "#scores-status"
      );


    if (status) {
      status.textContent =
        "Feed unavailable";
    }
  }
}


/* =========================================================
   LOAD CALENDAR
========================================================= */

async function loadCalendar() {

  try {

    calendarData =
      await getJSON(
        "/api/calendar"
      );


    renderCurrentMasters();

    renderNextMasters();


  } catch (error) {

    console.error(
      "YepTennis /api/calendar:",
      error
    );
  }
}


/* =========================================================
   LOAD NEWS
========================================================= */

async function loadNews() {

  try {

    newsData =
      await getJSON(
        "/api/news"
      );


    renderNews();


  } catch (error) {

    console.error(
      "YepTennis /api/news:",
      error
    );
  }
}


/* =========================================================
   OPTIONAL RANKINGS LOADER
========================================================= */

async function loadRankings(
  tour = "atp"
) {

  try {

    return await getJSON(
      `/api/rankings?tour=${encodeURIComponent(
        tour
      )}`
    );

  } catch (error) {

    console.error(
      "YepTennis rankings:",
      error
    );

    return null;
  }
}


/* =========================================================
   INITIALISE
========================================================= */

async function initYepTennis() {

  /*
   * Load the three main
   * homepage feeds.
   */

  await Promise.allSettled(
    [
      loadToday(),
      loadCalendar(),
      loadNews()
    ]
  );


  updateTimestamp();
}


/* =========================================================
   START
========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initYepTennis
  );

} else {

  initYepTennis();
}


/* =========================================================
   AUTOMATIC REFRESH
========================================================= */

/*
 * Today's results:
 * refresh every 2 minutes.
 */

setInterval(
  () => {

    loadToday();

  },
  2 * 60 * 1000
);


/*
 * Masters calendar:
 * refresh every 30 minutes.
 */

setInterval(
  () => {

    loadCalendar();

  },
  30 * 60 * 1000
);


/*
 * News:
 * refresh every 30 minutes.
 */

setInterval(
  () => {

    loadNews();

  },
  30 * 60 * 1000
);
