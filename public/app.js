/* =========================================================
   YepTennis - Homepage App
========================================================= */

let todayData = null;
let calendarData = null;
let newsData = null;

let resultsFilter = "all";


/* =========================================================
   HELPERS
========================================================= */

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


async function getJSON(url) {

  const response = await fetch(
    `${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}`,
    {
      cache: "no-store",
      headers: {
        Accept: "application/json"
      }
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
   DATE / TIME
========================================================= */

function validDate(value) {

  if (!value) return null;

  const d = new Date(value);

  return Number.isNaN(d.getTime())
    ? null
    : d;
}


function formatDate(value) {

  const d = validDate(value);

  if (!d) return "";

  return d.toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric"
    }
  );
}


function formatShortDate(value) {

  const d = validDate(value);

  if (!d) return "";

  return d.toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "short"
    }
  );
}


function formatTime(value) {

  const d = validDate(value);

  if (!d) return "";

  return d.toLocaleTimeString(
    "en-GB",
    {
      hour: "2-digit",
      minute: "2-digit"
    }
  );
}


/* =========================================================
   COUNTRY FLAG
========================================================= */

function countryFlag(code) {

  const c =
    String(code || "")
      .trim()
      .toUpperCase();

  if (!/^[A-Z]{2}$/.test(c)) {
    return "";
  }

  return c
    .split("")
    .map(
      letter =>
        String.fromCodePoint(
          127397 +
          letter.charCodeAt(0)
        )
    )
    .join("");
}


/* =========================================================
   MATCH DATA
========================================================= */

function rawMatches() {

  if (!todayData) {
    return [];
  }

  /*
   * Normal API response:
   *
   * {
   *   date: "...",
   *   matches: [...]
   * }
   *
   * The additional checks make this
   * tolerant of slightly different
   * response formats.
   */

  if (
    Array.isArray(
      todayData.matches
    )
  ) {
    return todayData.matches;
  }

  if (
    Array.isArray(
      todayData.events
    )
  ) {
    return todayData.events;
  }

  if (
    Array.isArray(
      todayData.data
    )
  ) {
    return todayData.data;
  }

  return [];
}


function isSingles(match) {

  if (!match) {
    return false;
  }

  const p1 =
    String(
      match.player1 ||
      match.homeTeam ||
      ""
    );

  const p2 =
    String(
      match.player2 ||
      match.awayTeam ||
      ""
    );

  /*
   * Doubles players in the API
   * contain "/".
   */

  if (
    p1.includes("/") ||
    p2.includes("/")
  ) {
    return false;
  }

  return true;
}


function matchTour(match) {

  return String(
    match.tour ||
    match.league ||
    ""
  )
    .trim()
    .toLowerCase();
}


function isLive(match) {

  return (
    match.live === true ||
    String(
      match.status || ""
    )
      .toLowerCase()
      .includes("live")
  );
}


function isCompleted(match) {

  const status =
    String(
      match.status || ""
    ).toLowerCase();

  return (
    status.includes("finished") ||
    status.includes("complete") ||
    status.includes("final")
  );
}


/* =========================================================
   FILTER
========================================================= */

function getFilteredMatches() {

  let matches =
    rawMatches()
      .filter(
        isSingles
      );


  /*
   * IMPORTANT:
   * Default = ALL.
   *
   * This lets us immediately
   * see the live API feed.
   */

  if (
    resultsFilter ===
    "atp"
  ) {

    matches =
      matches.filter(
        match =>
          matchTour(match) ===
          "atp"
      );

  } else if (
    resultsFilter ===
    "wta"
  ) {

    matches =
      matches.filter(
        match =>
          matchTour(match) ===
          "wta"
      );

  } else if (
    resultsFilter ===
    "live"
  ) {

    matches =
      matches.filter(
        isLive
      );

  } else if (
    resultsFilter ===
    "completed"
  ) {

    matches =
      matches.filter(
        isCompleted
      );
  }


  return matches;
}


/* =========================================================
   SCORE
========================================================= */

function getScore(match) {

  if (
    match.score !== undefined &&
    match.score !== null &&
    String(match.score) !== ""
  ) {

    if (
      typeof match.score ===
      "string"
    ) {
      return match.score;
    }

    if (
      Array.isArray(
        match.score
      )
    ) {
      return match.score.join(" ");
    }

    if (
      typeof match.score ===
      "object"
    ) {

      return (
        match.score.display ||
        match.score.score ||
        ""
      );
    }
  }

  return "";
}


/* =========================================================
   MATCH HTML
========================================================= */

function createMatchHTML(
  match
) {

  const player1 =
    match.player1 ||
    "Player 1";

  const player2 =
    match.player2 ||
    "Player 2";


  const country1 =
    match.country1 ||
    "";

  const country2 =
    match.country2 ||
    "";


  const score =
    getScore(
      match
    );


  const live =
    isLive(
      match
    );


  const completed =
    isCompleted(
      match
    );


  let rightSide =
    "";


  if (live) {

    rightSide =
      `<span class="live-label">● Live</span>`;

  } else if (completed) {

    rightSide =
      `<span>Completed</span>`;

  } else {

    rightSide =
      `<span>${
        escapeHTML(
          formatTime(
            match.start
          )
        )
      }</span>`;
  }


  return `
    <div class="match">

      <div>

        <b>
          ${countryFlag(
            country1
          )}
          ${escapeHTML(
            player1
          )}
        </b>

        <b>
          ${countryFlag(
            country2
          )}
          ${escapeHTML(
            player2
          )}
        </b>

      </div>


      <div class="scores">

        <b>
          ${
            score
              ? escapeHTML(
                  score
                )
              : escapeHTML(
                  formatTime(
                    match.start
                  )
                ) || "—"
          }
        </b>

        ${
          match.tournament
            ? `<small>${escapeHTML(
                match.tournament
              )}</small>`
            : ""
        }

      </div>


      <small>
        ${rightSide}
      </small>

    </div>
  `;
}


/* =========================================================
   RESULTS
========================================================= */

function renderResults() {

  const card =
    document.querySelector(
      ".results-card"
    );


  if (!card) {
    return;
  }


  /*
   * Remove old hard-coded
   * matches.
   */

  card
    .querySelectorAll(
      ".match"
    )
    .forEach(
      element =>
        element.remove()
    );


  let matches =
    getFilteredMatches();


  /*
   * Live first.
   * Then earliest start time.
   */

  matches.sort(
    (a, b) => {

      if (
        isLive(a) !==
        isLive(b)
      ) {
        return isLive(a)
          ? -1
          : 1;
      }


      const da =
        validDate(
          a.start
        );

      const db =
        validDate(
          b.start
        );


      if (!da && !db) {
        return 0;
      }

      if (!da) {
        return 1;
      }

      if (!db) {
        return -1;
      }

      return (
        da.getTime() -
        db.getTime()
      );
    }
  );


  /*
   * Show maximum 8
   * on homepage.
   */

  matches =
    matches.slice(
      0,
      8
    );


  if (!matches.length) {

    const empty =
      document.createElement(
        "div"
      );

    empty.className =
      "match api-empty";


    empty.innerHTML = `
      <div>
        <b>
          No matches
        </b>

        <b>
          available
        </b>
      </div>

      <div class="scores">
        <b>—</b>
      </div>

      <small>
        No matches found
      </small>
    `;


    card.appendChild(
      empty
    );

  } else {

    card.insertAdjacentHTML(
      "beforeend",
      matches
        .map(
          createMatchHTML
        )
        .join("")
    );
  }


  updateResultsDate();

  updateTabs();
}


/* =========================================================
   DATE IN RESULTS HEADER
========================================================= */

function updateResultsDate() {

  const tabs =
    document.querySelector(
      ".results-card .tabs"
    );


  if (!tabs) {
    return;
  }


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

    tabs.appendChild(
      date
    );
  }


  if (
    todayData &&
    todayData.date
  ) {

    date.textContent =
      `▣ ${formatDate(
        todayData.date
      )}`;
  }
}


/* =========================================================
   TABS
========================================================= */

function setupTabs() {

  const tabs =
    document.querySelector(
      ".results-card .tabs"
    );


  if (!tabs) {
    return;
  }


  const buttons =
    tabs.querySelectorAll(
      "button"
    );


  const filters = [
    "atp",
    "wta",
    "live",
    "completed"
  ];


  buttons.forEach(
    (
      button,
      index
    ) => {

      const replacement =
        button.cloneNode(
          true
        );


      button.replaceWith(
        replacement
      );


      replacement.addEventListener(
        "click",
        () => {

          resultsFilter =
            filters[index];

          renderResults();

        }
      );

    }
  );


  updateTabs();
}


function updateTabs() {

  const buttons =
    document.querySelectorAll(
      ".results-card .tabs button"
    );


  const filters = [
    "atp",
    "wta",
    "live",
    "completed"
  ];


  buttons.forEach(
    (
      button,
      index
    ) => {

      button.classList.toggle(
        "selected",
        filters[index] ===
          resultsFilter
      );

    }
  );
}


/* =========================================================
   NEXT MASTERS
========================================================= */

function renderNextMasters() {

  const list =
    document.querySelector(
      ".next-list"
    );


  if (!list) {
    return;
  }


  const tournaments =
    calendarData &&
    Array.isArray(
      calendarData.tournaments
    )
      ? calendarData.tournaments
      : [];


  if (!tournaments.length) {
    return;
  }


  const now =
    Date.now();


  const upcoming =
    tournaments
      .filter(
        tournament => {

          const d =
            validDate(
              tournament.start
            );

          return (
            d &&
            d.getTime() >=
              now
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
      )
      .slice(
        0,
        4
      );


  if (!upcoming.length) {
    return;
  }


  list.innerHTML =
    upcoming
      .map(
        tournament => {

          const tour =
            String(
              tournament.tour ||
              ""
            ).toUpperCase();


          return `
            <article>

              <div class="thumb"></div>

              <div>

                <b>
                  ${escapeHTML(
                    tournament.name ||
                    "Masters"
                  )}
                </b>

                <span>
                  ${escapeHTML(
                    tour
                  )}
                  ${
                    tournament.tier
                      ? " " +
                        escapeHTML(
                          tournament.tier
                        )
                      : ""
                  }
                </span>

                <span>
                  ${escapeHTML(
                    formatShortDate(
                      tournament.start
                    )
                  )}
                  ${
                    tournament.end
                      ? " – " +
                        escapeHTML(
                          formatShortDate(
                            tournament.end
                          )
                        )
                      : ""
                  }
                </span>

              </div>

            </article>
          `;
        }
      )
      .join("");
}


/* =========================================================
   CURRENT MASTERS
========================================================= */

function renderCurrentMasters() {

  const tournaments =
    calendarData &&
    Array.isArray(
      calendarData.tournaments
    )
      ? calendarData.tournaments
      : [];


  const now =
    Date.now();


  const current =
    tournaments.find(
      tournament => {

        const start =
          validDate(
            tournament.start
          );

        const end =
          validDate(
            tournament.end
          );


        if (
          !start ||
          !end
        ) {
          return false;
        }


        return (
          start.getTime() <=
          now &&
          end.getTime() >=
          now
        );
      }
    );


  if (!current) {
    return;
  }


  const card =
    document.querySelector(
      ".featured-card"
    );


  if (!card) {
    return;
  }


  const title =
    card.querySelector(
      "h3"
    );


  if (title) {
    title.textContent =
      current.name;
  }
}


/* =========================================================
   NEWS
========================================================= */

function renderNews() {

  const list =
    document.querySelector(
      ".news-list"
    );


  if (!list) {
    return;
  }


  const items =
    newsData &&
    Array.isArray(
      newsData.items
    )
      ? newsData.items
      : [];


  if (!items.length) {
    return;
  }


  list.innerHTML =
    items
      .slice(
        0,
        3
      )
      .map(
        item => {

          const title =
            item.title ||
            "Tennis news";


          const link =
            item.link ||
            "#";


          const date =
            item.dateLabel ||
            formatShortDate(
              item.date
            );


          return `
            <article>

              <div
                class="news-img court"
              ></div>

              <div>

                <b>
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
                </b>

                <span>
                  ${escapeHTML(
                    date
                  )}
                </span>

              </div>

            </article>
          `;
        }
      )
      .join("");
}


/* =========================================================
   API LOADERS
========================================================= */

async function loadToday() {

  try {

    const data =
      await getJSON(
        "/api/today"
      );


    console.log(
      "YepTennis /api/today:",
      data
    );


    todayData =
      data;


    renderResults();

  } catch (error) {

    console.error(
      "YepTennis today:",
      error
    );
  }
}


async function loadCalendar() {

  try {

    calendarData =
      await getJSON(
        "/api/calendar"
      );


    renderNextMasters();

    renderCurrentMasters();

  } catch (error) {

    console.error(
      "YepTennis calendar:",
      error
    );
  }
}


async function loadNews() {

  try {

    newsData =
      await getJSON(
        "/api/news"
      );


    renderNews();

  } catch (error) {

    console.error(
      "YepTennis news:",
      error
    );
  }
}


/* =========================================================
   START
========================================================= */

async function init() {

  setupTabs();

  await Promise.allSettled(
    [
      loadToday(),
      loadCalendar(),
      loadNews()
    ]
  );
}


if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    init
  );

} else {

  init();
}


/* =========================================================
   REFRESH
========================================================= */

setInterval(
  loadToday,
  120000
);

setInterval(
  loadCalendar,
  1800000
);

setInterval(
  loadNews,
  1800000
);
