/* =========================================================
   YepTennis - Homepage App
   Connects the existing homepage to the live API
========================================================= */

let todayData = null;
let calendarData = null;
let newsData = null;

let resultsFilter = "atp";


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

  const separator =
    url.includes("?") ? "&" : "?";

  const response = await fetch(
    `${url}${separator}_=${Date.now()}`,
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

  if (!value) {
    return null;
  }

  const d = new Date(value);

  return Number.isNaN(d.getTime())
    ? null
    : d;
}


function formatDate(value) {

  const d = validDate(value);

  if (!d) {
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


function formatShortDate(value) {

  const d = validDate(value);

  if (!d) {
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


function formatTime(value) {

  const d = validDate(value);

  if (!d) {
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
   COUNTRY FLAGS
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
   MATCH HELPERS
========================================================= */

function isSingles(match) {

  if (!match) {
    return false;
  }

  /*
   * The API represents doubles players
   * with names containing "/".
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


function isLive(match) {

  return (
    match.live === true ||
    String(
      match.status || ""
    ).toLowerCase() === "live"
  );
}


function isCompleted(match) {

  const status =
    String(
      match.status || ""
    ).toLowerCase();

  return (
    status.includes("complete") ||
    status.includes("finished") ||
    status.includes("final") ||
    !!match.score &&
    !isLive(match) &&
    status !== "scheduled"
  );
}


function matchTime(match) {

  return formatTime(
    match.start
  );
}


/* =========================================================
   SCORE DISPLAY
========================================================= */

function scoreText(match) {

  if (
    match.score === null ||
    match.score === undefined
  ) {
    return "";
  }

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

    if (
      match.score.display
    ) {
      return match.score.display;
    }

    if (
      match.score.score
    ) {
      return match.score.score;
    }
  }

  return "";
}


/* =========================================================
   FILTER
========================================================= */

function filteredMatches() {

  let matches =
    getMatches();


  if (
    resultsFilter ===
    "atp"
  ) {

    matches =
      matches.filter(
        m =>
          String(
            m.tour || ""
          ).toLowerCase() ===
          "atp"
      );

  } else if (
    resultsFilter ===
    "wta"
  ) {

    matches =
      matches.filter(
        m =>
          String(
            m.tour || ""
          ).toLowerCase() ===
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
   SORT MATCHES
========================================================= */

function sortMatches(
  matches
) {

  return [...matches]
    .sort(
      (a, b) => {

        /*
         * Live matches first.
         */

        if (
          isLive(a) !==
          isLive(b)
        ) {
          return isLive(a)
            ? -1
            : 1;
        }


        /*
         * Then chronological.
         */

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
}


/* =========================================================
   CREATE MATCH HTML
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


  const flag1 =
    countryFlag(
      match.country1
    );

  const flag2 =
    countryFlag(
      match.country2
    );


  const score =
    scoreText(
      match
    );


  const live =
    isLive(
      match
    );


  let status = "";


  if (live) {

    status =
      `<span class="live-label">● Live</span>`;

  } else if (
    isCompleted(match)
  ) {

    status =
      `<span>Completed</span>`;

  } else {

    status =
      `<span>${
        escapeHTML(
          matchTime(match)
        )
      }</span>`;
  }


  /*
   * If score exists, display it.
   * Otherwise show the scheduled time.
   */

  const displayScore =
    score
      ? escapeHTML(score)
      : matchTime(match)
        ? escapeHTML(
            matchTime(match)
          )
        : "—";


  return `
    <div class="match">

      <div>

        <b>
          ${flag1}
          ${escapeHTML(
            player1
          )}

          ${
            match.seed1
              ? `<em>(${escapeHTML(
                  match.seed1
                )})</em>`
              : ""
          }
        </b>

        <b>
          ${flag2}
          ${escapeHTML(
            player2
          )}

          ${
            match.seed2
              ? `<em>(${escapeHTML(
                  match.seed2
                )})</em>`
              : ""
          }
        </b>

      </div>


      <div class="scores">

        <b>
          ${displayScore}
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
        ${status}
      </small>

    </div>
  `;
}


/* =========================================================
   RESULTS HEADER DATE
========================================================= */

function updateResultsDate() {

  const tabs =
    document.querySelector(
      ".results-card .tabs"
    );

  if (!tabs) {
    return;
  }


  let dateSpan =
    tabs.querySelector(
      ".api-date"
    );


  if (!dateSpan) {

    dateSpan =
      document.createElement(
        "span"
      );

    dateSpan.className =
      "api-date";

    tabs.appendChild(
      dateSpan
    );
  }


  const date =
    todayData?.date
      ? formatDate(
          todayData.date
        )
      : "";


  dateSpan.innerHTML =
    date
      ? `▣ &nbsp; ${escapeHTML(
          date
        )}`
      : "";
}


/* =========================================================
   RESULTS TABS
========================================================= */

function setupResultsTabs() {

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


  if (
    buttons.length <
    4
  ) {
    return;
  }


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

      /*
       * Remove old click
       * handlers by cloning.
       */

      const newButton =
        button.cloneNode(
          true
        );


      button.replaceWith(
        newButton
      );


      newButton.textContent =
        filters[index] ===
        "live"
          ? "Live"
          : filters[index]
              .charAt(0)
              .toUpperCase() +
            filters[index]
              .slice(1);


      newButton.addEventListener(
        "click",
        () => {

          resultsFilter =
            filters[index];

          renderResults();

        }
      );

    }
  );


  updateActiveTab();
}


function updateActiveTab() {

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
   RENDER RESULTS
========================================================= */

function renderResults() {

  const card =
    document.querySelector(
      ".results-card"
    );


  if (!card) {
    return;
  }


  let matches =
    filteredMatches();


  matches =
    sortMatches(
      matches
    );


  /*
   * Keep homepage compact.
   */

  matches =
    matches.slice(
      0,
      8
    );


  /*
   * Remove old match rows.
   */

  card
    .querySelectorAll(
      ".match"
    )
    .forEach(
      element =>
        element.remove()
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
        No ${escapeHTML(
          resultsFilter
        )} singles matches
      </small>
    `;


    card.appendChild(
      empty
    );

  } else {

    const html =
      matches
        .map(
          createMatchHTML
        )
        .join("");


    card.insertAdjacentHTML(
      "beforeend",
      html
    );
  }


  updateActiveTab();

  updateResultsDate();
}


/* =========================================================
   NEXT MASTERS
========================================================= */

function getUpcomingMasters() {

  const tournaments =
    calendarData &&
    Array.isArray(
      calendarData.tournaments
    )
      ? calendarData.tournaments
      : [];


  const now =
    Date.now();


  return tournaments
    .filter(
      tournament => {

        if (
          !tournament ||
          !tournament.start
        ) {
          return false;
        }


        const start =
          validDate(
            tournament.start
          );


        if (!start) {
          return false;
        }


        return (
          start.getTime() >=
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
    );
}


/* =========================================================
   MASTERS THUMBNAIL CLASS
========================================================= */

function mastersClass(
  name
) {

  const n =
    String(
      name || ""
    ).toLowerCase();


  if (
    n.includes("shanghai")
  ) {
    return "shanghai";
  }

  if (
    n.includes("paris")
  ) {
    return "paris";
  }

  if (
    n.includes("miami")
  ) {
    return "miami";
  }

  if (
    n.includes("madrid")
  ) {
    return "madrid";
  }

  return "shanghai";
}


/* =========================================================
   RENDER NEXT MASTERS
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
    getUpcomingMasters()
      .slice(
        0,
        4
      );


  /*
   * If API did not return calendar data,
   * keep the existing HTML.
   */

  if (!tournaments.length) {
    return;
  }


  list.innerHTML =
    tournaments
      .map(
        tournament => {

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


          const tour =
            String(
              tournament.tour ||
              ""
            ).toLowerCase() ===
            "wta"
              ? "WTA"
              : "ATP";


          const tier =
            tournament.tier ||
            "Masters";


          return `
            <article>

              <div
                class="thumb ${mastersClass(
                  tournament.name
                )}"
              ></div>

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
                    tier
                      ? " " +
                        escapeHTML(
                          tier
                        )
                      : ""
                  }
                </span>

                <span>
                  ${escapeHTML(
                    dates
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


  if (!tournaments.length) {
    return;
  }


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
          ) ||
          start;


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


  const paragraphs =
    card.querySelectorAll(
      ".featured-info p"
    );


  if (title) {

    title.textContent =
      current.name ||
      title.textContent;
  }


  if (
    paragraphs.length >=
    1
  ) {

    paragraphs[0]
      .textContent =
      current.country ||
      paragraphs[0]
        .textContent;
  }


  if (
    paragraphs.length >=
    2
  ) {

    const start =
      formatShortDate(
        current.start
      );

    const end =
      formatShortDate(
        current.end
      );


    paragraphs[1]
      .textContent =
      end
        ? `${start} – ${end}`
        : start;
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


  /*
   * If API fails or returns
   * no articles, leave the
   * existing design/content.
   */

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
        (
          article,
          index
        ) => {

          const title =
            article.title ||
            "Tennis news";


          const date =
            article.dateLabel ||
            formatShortDate(
              article.date
            ) ||
            "";


          const link =
            article.link ||
            "#";


          const imageClass =
            [
              "player",
              "court",
              "crowd"
            ][index] ||
            "court";


          return `
            <article>

              <a
                href="${escapeHTML(
                  link
                )}"
                target="_blank"
                rel="noopener noreferrer"
                class="news-img ${imageClass}"
                aria-label="${escapeHTML(
                  title
                )}"
              ></a>

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
   LOAD TODAY
========================================================= */

async function loadToday() {

  try {

    todayData =
      await getJSON(
        "/api/today"
      );


    renderResults();

  } catch (error) {

    console.error(
      "YepTennis today API:",
      error
    );
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


    renderNextMasters();

    renderCurrentMasters();

  } catch (error) {

    console.error(
      "YepTennis calendar API:",
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
      "YepTennis news API:",
      error
    );
  }
}


/* =========================================================
   INITIALISE
========================================================= */

async function init() {

  /*
   * Set up the existing
   * four buttons in index.html.
   */

  setupResultsTabs();


  /*
   * Load all live data.
   */

  await Promise.allSettled(
    [
      loadToday(),
      loadCalendar(),
      loadNews()
    ]
  );
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
    init
  );

} else {

  init();
}


/* =========================================================
   AUTO REFRESH
========================================================= */

/*
 * Results every 2 minutes.
 */

setInterval(
  loadToday,
  120000
);


/*
 * Calendar every 30 minutes.
 */

setInterval(
  loadCalendar,
  1800000
);


/*
 * News every 30 minutes.
 */

setInterval(
  loadNews,
  1800000
);
