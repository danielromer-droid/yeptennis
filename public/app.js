/* =====================================================
   YepTennis frontend
   ATP / WTA / Grand Slams / Finals / 1000 / 500
   ===================================================== */

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

});


/* =====================================================
   NAVIGATION
   ===================================================== */

function setupNavigation() {

  const menu =
    document.querySelector(".menu");

  const mobileNav =
    document.querySelector(".mobile-nav");


  if (menu && mobileNav) {

    menu.addEventListener("click", () => {

      mobileNav.classList.toggle("open");

    });


    mobileNav
      .querySelectorAll("a")
      .forEach(link => {

        link.addEventListener(
          "click",
          () => {

            mobileNav.classList.remove(
              "open"
            );

          }
        );

      });

  }


  document
    .querySelectorAll(
      ".desktop-nav a, .mobile-nav a"
    )
    .forEach(link => {

      link.addEventListener(
        "click",
        () => {

          document
            .querySelectorAll(
              ".desktop-nav a"
            )
            .forEach(x => {

              x.classList.remove(
                "active"
              );

            });


          const desktopLink =
            document.querySelector(
              `.desktop-nav a[href="${link.getAttribute("href")}"]`
            );


          if (desktopLink) {

            desktopLink.classList.add(
              "active"
            );

          }

        }
      );

    });

}


/* =====================================================
   RESULTS TABS
   ===================================================== */

function setupResultTabs() {

  const tabs =
    document.querySelector(
      "#results-tabs"
    );


  if (!tabs) return;


  tabs
    .querySelectorAll(
      "button[data-filter]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          resultsFilter =
            button.dataset.filter ||
            "all";


          tabs
            .querySelectorAll(
              "button"
            )
            .forEach(x => {

              x.classList.remove(
                "selected"
              );

            });


          button.classList.add(
            "selected"
          );


          renderResults();

        }
      );

    });

}


/* =====================================================
   API HELPER
   ===================================================== */

async function fetchJSON(url) {

  const response =
    await fetch(url, {
      cache: "no-store",
      headers: {
        "Accept": "application/json"
      }
    });


  const text =
    await response.text();


  let data = {};


  try {

    data =
      text
        ? JSON.parse(text)
        : {};

  } catch {

    throw new Error(
      `Invalid response from ${url}`
    );

  }


  if (!response.ok) {

    throw new Error(
      data.message ||
      data.error ||
      `HTTP ${response.status}`
    );

  }


  return data;

}


/* =====================================================
   TODAY'S RESULTS
   ===================================================== */

async function loadToday() {

  const container =
    document.querySelector(
      "#results-list"
    );


  if (!container) return;


  try {

    todayData =
      await fetchJSON(
        "/api/today"
      );


    if (todayData?.error) {

      throw new Error(
        todayData.error
      );

    }


    updateResultsDate();

    renderResults();

  } catch (error) {

    console.error(
      "YepTennis results:",
      error
    );


    container.innerHTML = `
      <div class="error-state">
        Today's results are temporarily unavailable.
      </div>
    `;


    updateResultsDate();

  }

}


/* =====================================================
   RAW MATCH DATA
   ===================================================== */

function rawMatches() {

  if (!todayData) {
    return [];
  }


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


/* =====================================================
   NORMALISE MATCH
   ===================================================== */

function normaliseMatch(match) {

  const player1 =
    match.player1 ||
    match.home ||
    {};


  const player2 =
    match.player2 ||
    match.away ||
    {};


  const name1 =
    typeof player1 === "string"
      ? player1
      : (
          player1.name ||
          player1.playerName ||
          player1.fullName ||
          "Player 1"
        );


  const name2 =
    typeof player2 === "string"
      ? player2
      : (
          player2.name ||
          player2.playerName ||
          player2.fullName ||
          "Player 2"
        );


  const country1 =
    typeof player1 === "object"
      ? (
          player1.countryAcr ||
          player1.country ||
          player1.countryCode ||
          ""
        )
      : "";


  const country2 =
    typeof player2 === "object"
      ? (
          player2.countryAcr ||
          player2.country ||
          player2.countryCode ||
          ""
        )
      : "";


  let score =
    match.score ||
    match.result ||
    "";


  if (
    typeof score === "object"
  ) {

    score =
      score.display ||
      score.score ||
      "";

  }


  const status =
    match.status ||
    match.matchStatus ||
    match.state ||
    "Scheduled";


  const tournament =
    match.tournament ||
    match.tournamentName ||
    "";


  const tournamentName =
    typeof tournament === "object"
      ? tournament.name || ""
      : tournament;


  const tour =
    String(
      match.tour ||
      match.gender ||
      match.type ||
      ""
    ).toLowerCase();


  const live =
    Boolean(match.live) ||
    /live|inplay|in play/i.test(
      String(status)
    );


  return {

    player1: name1,

    player2: name2,

    country1: country1,

    country2: country2,

    score: score || "",

    status: status,

    tournament: tournamentName,

    tour:
      tour.includes("wta")
        ? "wta"
        : "atp",

    live: live

  };

}


/* =====================================================
   FILTER RESULTS
   ===================================================== */

function getFilteredMatches() {

  const matches =
    rawMatches()
      .map(normaliseMatch);


  switch (resultsFilter) {

    case "atp":

      return matches.filter(
        x => x.tour === "atp"
      );


    case "wta":

      return matches.filter(
        x => x.tour === "wta"
      );


    case "live":

      return matches.filter(
        x => x.live
      );


    case "completed":

      return matches.filter(
        x =>
          /final|completed|finished/i.test(
            String(x.status)
          )
      );


    default:

      return matches;

  }

}


/* =====================================================
   DISPLAY RESULTS
   ===================================================== */

function renderResults() {

  const container =
    document.querySelector(
      "#results-list"
    );


  if (!container) return;


  const matches =
    getFilteredMatches();


  if (!matches.length) {

    container.innerHTML = `
      <div class="empty-state">
        No matches available for this selection.
      </div>
    `;

    return;

  }


  container.innerHTML =
    matches
      .map(match => {

        const statusClass =
          match.live
            ? "live-status"
            : "match-status";


        const statusText =
          match.live
            ? "LIVE"
            : (
                match.status ||
                "Scheduled"
              );


        return `
          <div class="match">

            <div>

              <b>
                ${escapeHTML(
                  countryFlag(
                    match.country1
                  )
                )}
                ${escapeHTML(
                  match.player1
                )}
              </b>

              <b>
                ${escapeHTML(
                  countryFlag(
                    match.country2
                  )
                )}
                ${escapeHTML(
                  match.player2
                )}
              </b>

              ${
                match.tournament
                  ? `
                    <span class="tournament-name">
                      ${escapeHTML(
                        match.tournament
                      )}
                    </span>
                  `
                  : ""
              }

            </div>


            <div class="scores">

              <b>
                ${escapeHTML(
                  formatScore(
                    match.score,
                    0
                  )
                )}
              </b>

              <b>
                ${escapeHTML(
                  formatScore(
                    match.score,
                    1
                  )
                )}
              </b>

            </div>


            <small
              class="${statusClass}"
            >
              ${escapeHTML(
                statusText
              )}
            </small>

          </div>
        `;

      })
      .join("");

}


/* =====================================================
   RESULTS DATE
   ===================================================== */

function updateResultsDate() {

  const date =
    document.querySelector(
      ".api-date"
    );


  if (!date) return;


  const value =
    todayData?.date ||
    todayData?.checkedUTC ||
    new Date()
      .toISOString()
      .slice(0, 10);


  date.textContent =
    `▣ ${formatDate(value)}`;

}


function formatDate(value) {

  if (!value) {
    return "";
  }


  const date =
    new Date(
      `${value}T12:00:00`
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return value;

  }


  return date.toLocaleDateString(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  );

}


/* =====================================================
   SCORE FORMAT
   ===================================================== */

function formatScore(
  score,
  playerIndex
) {

  if (!score) {
    return "—";
  }


  if (Array.isArray(score)) {

    return score.join("  ");

  }


  const text =
    String(score);


  if (text.includes("|")) {

    const rows =
      text.split("|");


    return (
      rows[playerIndex] ||
      "—"
    );

  }


  return text;

}


/* =====================================================
   COUNTRY FLAGS
   ===================================================== */

function countryFlag(country) {

  const map = {

    FRA: "🇫🇷",
    ESP: "🇪🇸",
    ITA: "🇮🇹",
    SRB: "🇷🇸",
    USA: "🇺🇸",
    GBR: "🇬🇧",
    GER: "🇩🇪",
    AUS: "🇦🇺",
    RUS: "🇷🇺",
    POL: "🇵🇱",
    CZE: "🇨🇿",
    CAN: "🇨🇦",
    JPN: "🇯🇵",
    CHN: "🇨🇳",
    ARG: "🇦🇷",
    BRA: "🇧🇷",
    CRO: "🇭🇷",
    BEL: "🇧🇪",
    NED: "🇳🇱",
    GRE: "🇬🇷",
    NOR: "🇳🇴",
    DEN: "🇩🇰",
    SUI: "🇨🇭",
    AUT: "🇦🇹",
    UKR: "🇺🇦"

  };


  return (
    map[
      String(country)
        .toUpperCase()
    ] || ""
  );

}


/* =====================================================
   BBC NEWS
   ===================================================== */

/* =====================================================
   BBC NEWS
   ===================================================== */

async function loadNews() {

  const container =
    document.querySelector("#news-list");

  if (!container) return;

  try {

    newsData =
      await fetchJSON("/api/news");

    const items =
      Array.isArray(newsData)
        ? newsData
        : Array.isArray(newsData?.news)
          ? newsData.news
          : Array.isArray(newsData?.items)
            ? newsData.items
            : [];

    if (!items.length) {

      container.innerHTML = `
        <div class="empty-state">
          No latest news available.
        </div>
      `;

      return;
    }

    container.innerHTML =
      items
        .slice(0, 6)
        .map(item => {

          const title =
            item.title ||
            "Tennis news";

          const link =
            item.link ||
            "#";

          const source =
            item.source ||
            "BBC Sport";

          const date =
            item.dateLabel ||
            item.date ||
            item.pubDate ||
            "";

          const image =
            item.image ||
            "";

          const summary =
            item.summary ||
            item.description ||
            "";

          return `
            <a
              class="news-card"
              href="${escapeAttribute(link)}"
              target="_blank"
              rel="noopener noreferrer"
            >

              <div
                class="news-img"
                ${
                  image
                    ? `style="background-image:url('${escapeAttribute(image)}')"`
                    : ""
                }
              >
                ${
                  !image
                    ? `
                      <div class="news-image-fallback">
                        TENNIS
                      </div>
                    `
                    : ""
                }
              </div>


              <div class="news-info">

                <div class="news-meta">

                  <span class="news-source">
                    ${escapeHTML(source)}
                  </span>

                  <span class="news-date">
                    ${escapeHTML(date)}
                  </span>

                </div>


                <h3>
                  ${escapeHTML(title)}
                </h3>


                ${
                  summary
                    ? `
                      <p>
                        ${escapeHTML(summary)}
                      </p>
                    `
                    : ""
                }

                <span class="read-more">
                  Read article →
                </span>

              </div>

            </a>
          `;

        })
        .join("");

  } catch (error) {

    console.error(
      "YepTennis news:",
      error
    );

    container.innerHTML = `
      <div class="error-state">
        News are temporarily unavailable.
      </div>
    `;

  }

}
/* =====================================================
   TOURNAMENT CALENDAR
   ===================================================== */

async function loadCalendar() {

  const container =
    document.querySelector(
      "#calendar-list"
    );


  /*
     The new homepage does not currently
     display the calendar.

     We keep this function so that the
     calendar can be reintroduced later
     without breaking the site.
  */

  if (!container) {
    return;
  }


  try {

    calendarData =
      await fetchJSON(
        "/api/calendar"
      );


    const tournaments =
      Array.isArray(
        calendarData
      )
        ? calendarData
        : Array.isArray(
            calendarData?.tournaments
          )
          ? calendarData.tournaments
          : Array.isArray(
              calendarData?.data
            )
            ? calendarData.data
            : [];


    if (!tournaments.length) {

      container.innerHTML = `
        <div class="empty-state">
          Tournament calendar unavailable.
        </div>
      `;

      return;

    }


    container.innerHTML =
      tournaments
        .slice(0, 20)
        .map(item => {

          const name =
            item.name ||
            item.tournamentName ||
            "Tournament";


          const tour =
            String(
              item.tour ||
              item.gender ||
              ""
            ).toUpperCase() ||
            "ATP / WTA";


          const start =
            item.start ||
            item.startDate ||
            item.date ||
            "";


          const end =
            item.end ||
            item.endDate ||
            "";


          const location =
            item.country ||
            item.location ||
            "";


          return `
            <article
              class="calendar-item"
            >

              <div
                class="calendar-date"
              >
                ${escapeHTML(
                  formatCalendarDate(
                    start,
                    end
                  )
                )}
              </div>


              <div>

                <div
                  class="calendar-name"
                >
                  ${escapeHTML(name)}
                </div>

                <div
                  class="calendar-meta"
                >

                  ${escapeHTML(tour)}

                  ${
                    location
                      ? ` · ${escapeHTML(
                          location
                        )}`
                      : ""
                  }

                </div>

              </div>

            </article>
          `;

        })
        .join("");


  } catch (error) {

    console.error(
      "YepTennis calendar:",
      error
    );

  }

}


function formatCalendarDate(
  start,
  end
) {

  if (!start) {
    return "TBC";
  }


  const a =
    new Date(start);


  if (
    Number.isNaN(
      a.getTime()
    )
  ) {

    return String(start);

  }


  const startText =
    a.toLocaleDateString(
      "en-GB",
      {
        day: "2-digit",
        month: "short"
      }
    );


  if (!end) {
    return startText;
  }


  const b =
    new Date(end);


  if (
    Number.isNaN(
      b.getTime()
    )
  ) {

    return startText;

  }


  const endText =
    b.toLocaleDateString(
      "en-GB",
      {
        day: "2-digit",
        month: "short"
      }
    );


  return `${startText} – ${endText}`;

}


/* =====================================================
   SECURITY HELPERS
   ===================================================== */

function escapeHTML(value) {

  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );

}


function escapeAttribute(value) {

  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    );

}