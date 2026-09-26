let todayData = null;
let resultsFilter = "all";

document.addEventListener("DOMContentLoaded", () => {
  setupNavigation();
  setupResultTabs();
  loadToday();
  loadNews();
  loadCalendar();
  loadRankings();
});

function setupNavigation() {
  const menu = document.querySelector(".menu");
  const nav = document.querySelector(".mobile-nav");

  if (menu && nav) {
    menu.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      menu.setAttribute(
        "aria-expanded",
        open ? "true" : "false"
      );
    });

    nav.querySelectorAll("a").forEach(a => {
      a.addEventListener(
        "click",
        () => nav.classList.remove("open")
      );
    });
  }

  document.querySelectorAll("nav a").forEach(a => {
    a.addEventListener("click", () => {
      document
        .querySelectorAll("nav a")
        .forEach(x =>
          x.classList.remove("active")
        );

      a.classList.add("active");
    });
  });
}

function setupResultTabs() {
  const tabs =
    document.querySelector("#results-tabs");

  if (!tabs) return;

  tabs
    .querySelectorAll("button[data-filter]")
    .forEach(button => {
      button.addEventListener("click", () => {
        resultsFilter =
          button.dataset.filter || "all";

        tabs
          .querySelectorAll("button")
          .forEach(x =>
            x.classList.remove("selected")
          );

        button.classList.add("selected");

        renderResults();
      });
    });
}

async function fetchJSON(url) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json"
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
    throw Error(
      `Invalid response from ${url}`
    );
  }

  if (!response.ok) {
    throw Error(
      data.message ||
      data.error ||
      `HTTP ${response.status}`
    );
  }

  return data;
}

async function loadToday() {
  const container =
    document.querySelector(
      "#results-list"
    );

  if (!container) return;

  try {
    todayData =
      await fetchJSON("/api/today");

    if (todayData?.error) {
      throw Error(
        todayData.error
      );
    }

    updateResultTabCounts();
    updateResultsDate();
    renderResults();

  } catch (error) {
    console.error(
      "YepTennis results:",
      error
    );

    container.innerHTML =
      `<div class="error-state">
        Results are temporarily unavailable.
      </div>`;

    updateResultsDate();
  }
}

function rawMatches() {
  if (!todayData) return [];

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

function normaliseMatch(x) {
  const p1 =
    x.player1 ||
    x.home ||
    {};

  const p2 =
    x.player2 ||
    x.away ||
    {};

  const name = p =>
    typeof p === "string"
      ? p
      : p.name ||
        p.playerName ||
        p.fullName ||
        "Player";

  const country = p =>
    typeof p === "object"
      ? (
          p.countryAcr ||
          p.country ||
          p.countryCode ||
          ""
        )
      : "";

  let score =
    x.score ||
    x.result ||
    x.scores ||
    "";

  if (
    typeof score === "object" &&
    score !== null
  ) {
    score =
      score.display ||
      score.score ||
      score.result ||
      "";
  }

  const status =
    x.status ||
    x.matchStatus ||
    x.state ||
    "Scheduled";

  const tour =
    String(
      x.tour ||
      x.gender ||
      x.type ||
      ""
    ).toLowerCase();

  return {
    id:
      x.id ||
      x.matchId ||
      "",

    player1:
      name(p1),

    player2:
      name(p2),

    country1:
      country(p1),

    country2:
      country(p2),

    rank1:
      p1.rank ||
      x.rank1 ||
      "",

    rank2:
      p2.rank ||
      x.rank2 ||
      "",

    score,

    status,

    tournament:
      typeof x.tournament === "object"
        ? (
            x.tournament?.name ||
            ""
          )
        : (
            x.tournament ||
            x.tournamentName ||
            ""
          ),

    round:
      typeof x.round === "object"
        ? (
            x.round?.name ||
            ""
          )
        : (
            x.round ||
            x.roundName ||
            ""
          ),

    start:
      x.start ||
      x.startTime ||
      x.timeGame ||
      x.date ||
      "",

    tour:
      tour.includes("wta")
        ? "wta"
        : "atp",

    live:
      Boolean(x.live) ||
      /live|inplay|in play/i.test(
        String(status)
      )
  };
}

function getFilteredMatches() {
  const matches =
    rawMatches()
      .map(normaliseMatch);

  if (resultsFilter === "atp") {
    return matches.filter(
      x => x.tour === "atp"
    );
  }

  if (resultsFilter === "wta") {
    return matches.filter(
      x => x.tour === "wta"
    );
  }

  if (resultsFilter === "live") {
    return matches.filter(
      x => x.live
    );
  }

  if (
    resultsFilter === "completed"
  ) {
    return matches.filter(
      x =>
        /final|completed|finished/i.test(
          String(x.status)
        )
    );
  }

  return matches;
}

function renderResults() {
  const container =
    document.querySelector(
      "#results-list"
    );

  if (!container) return;

  const matches =
    getFilteredMatches();

  if (!matches.length) {
    container.innerHTML =
      `<div class="empty-state">
        No matches available for this selection.
      </div>`;
    return;
  }

  container.innerHTML =
    matches
      .map(match => {
        const score1 =
          scorePart(
            match.score,
            0
          );

        const score2 =
          scorePart(
            match.score,
            1
          );

        const time =
          match.start
            ? formatMatchTime(
                match.start
              )
            : "";

        const details = [
          match.tournament,
          match.round
        ]
          .filter(Boolean)
          .join(" · ");

        return `
          <div class="match">
            <div>
              <b>
                ${countryFlag(match.country1)}
                ${escapeHTML(match.player1)}
                ${match.rank1 ? `<em>(${escapeHTML(match.rank1)})</em>` : ""}
              </b>

              <b>
                ${countryFlag(match.country2)}
                ${escapeHTML(match.player2)}
                ${match.rank2 ? `<em>(${escapeHTML(match.rank2)})</em>` : ""}
              </b>

              ${
                details
                  ? `<span class="tournament-name">
                       ${escapeHTML(details)}
                     </span>`
                  : ""
              }
            </div>

            <div class="scores">
              <b>
                ${escapeHTML(score1)}
              </b>
              <b>
                ${escapeHTML(score2)}
              </b>
            </div>

            <small
              class="${match.live ? "live-status" : ""}"
            >
              ${escapeHTML(
                match.live
                  ? "LIVE"
                  : (
                      match.status ||
                      time ||
                      "Scheduled"
                    )
              )}
            </small>
          </div>
        `;
      })
      .join("");
}

function updateResultTabCounts() {
  const tabs =
    document.querySelector(
      "#results-tabs"
    );

  if (!tabs) return;

  const all =
    rawMatches().map(
      normaliseMatch
    );

  const atp =
    all.filter(
      x => x.tour === "atp"
    ).length;

  const wta =
    all.filter(
      x => x.tour === "wta"
    ).length;

  const live =
    all.filter(
      x => x.live
    ).length;

  const completed =
    all.filter(
      x =>
        /final|completed|finished/i.test(
          String(x.status)
        )
    ).length;

  const setLabel = (
    filter,
    text
  ) => {
    const button =
      tabs.querySelector(
        `button[data-filter="${filter}"]`
      );

    if (button) {
      button.textContent = text;
    }
  };

  setLabel(
    "atp",
    `ATP (${atp})`
  );

  setLabel(
    "wta",
    `WTA (${wta})`
  );

  setLabel(
    "live",
    `LIVE (${live})`
  );

  setLabel(
    "completed",
    `Completed (${completed})`
  );
}

function updateResultsDate() {
  const date =
    document.querySelector(
      ".api-date"
    );

  if (date) {
    date.textContent =
      `▣ ${formatDate(
        todayData?.date ||
        todayData?.checkedUTC ||
        new Date()
          .toISOString()
          .slice(0, 10)
      )}`;
  }
}

function formatDate(value) {
  if (!value) return "";

  const raw =
    String(value);

  const d =
    raw.length === 10
      ? new Date(
          `${raw}T12:00:00`
        )
      : new Date(raw);

  if (isNaN(d)) {
    return raw;
  }

  return d.toLocaleDateString(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  );
}

function formatMatchTime(value) {
  const d =
    new Date(value);

  if (isNaN(d)) {
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

function scorePart(score, index) {
  if (!score) return "—";

  if (Array.isArray(score)) {
    return score[index] || "—";
  }

  const text =
    String(score);

  if (text.includes("|")) {
    return (
      text.split("|")[index] ||
      "—"
    );
  }

  return text;
}

function countryFlag(country) {
  const flags = {
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
    BRA: "🇧🇷",
    ARG: "🇦🇷",
    BEL: "🇧🇪",
    AUT: "🇦🇹",
    SUI: "🇨🇭",
    SWE: "🇸🇪",
    NED: "🇳🇱",
    CRO: "🇭🇷",
    GRE: "🇬🇷",
    DEN: "🇩🇰",
    NOR: "🇳🇴",
    FIN: "🇫🇮",
    UKR: "🇺🇦",
    KAZ: "🇰🇿",
    CHI: "🇨🇱",
    COL: "🇨🇴",
    MEX: "🇲🇽",
    SRB: "🇷🇸"
  };

  return (
    flags[
      String(
        country
      ).toUpperCase()
    ] || ""
  );
}

async function loadNews() {
  const container =
    document.querySelector(
      "#news-list"
    );

  if (!container) return;

  try {
    const data =
      await fetchJSON(
        "/api/news"
      );

    const items =
      Array.isArray(data)
        ? data
        : (
            data.news ||
            data.items ||
            []
          );

    if (!items.length) {
      container.innerHTML =
        `<div class="empty-state">
          No latest news available.
        </div>`;
      return;
    }

    container.innerHTML =
      items
        .slice(0, 5)
        .map(
          (x, i) =>
            `<article>
              <div
                class="news-img ${
                  ["player","court","crowd"][i % 3]
                }"
                ${
                  x.image
                    ? `style="background-image:url('${escapeAttribute(x.image)}')"`
                    : ""
                }
              ></div>

              <div>
                <b>
                  ${escapeHTML(
                    x.title ||
                    x.name ||
                    "Tennis news"
                  )}
                </b>

                <span>
                  ${escapeHTML(
                    formatNewsDate(
                      x.date ||
                      x.pubDate ||
                      x.published ||
                      x.dateLabel ||
                      ""
                    )
                  )}
                </span>
              </div>
            </article>`
        )
        .join("");

  } catch (error) {
    console.log(
      "YepTennis news:",
      error
    );

    container.innerHTML =
      `<div class="empty-state">
        News are temporarily unavailable.
      </div>`;
  }
}

function formatNewsDate(value) {
  if (!value) return "Latest";

  const d =
    new Date(value);

  return isNaN(d)
    ? value
    : d.toLocaleDateString(
        "en-GB",
        {
          day: "2-digit",
          month: "short",
          year: "numeric"
        }
      );
}

async function loadCalendar() {
  const container =
    document.querySelector(
      "#calendar-list"
    );

  if (!container) return;

  try {
    const data =
      await fetchJSON(
        "/api/calendar"
      );

    const items =
      Array.isArray(data)
        ? data
        : (
            data.tournaments ||
            data.data ||
            []
          );

    if (!items.length) {
      container.innerHTML =
        `<div class="empty-state">
          Tournament calendar unavailable.
        </div>`;
      return;
    }

    container.innerHTML =
      items
        .slice(0, 20)
        .map(item => {
          const start =
            item.start ||
            item.startDate ||
            item.date ||
            "";

          const end =
            item.end ||
            item.endDate ||
            "";

          return `
            <article class="calendar-item">
              <div class="calendar-date">
                ${escapeHTML(
                  calendarDate(
                    start,
                    end
                  )
                )}
              </div>

              <div>
                <div class="calendar-name">
                  ${escapeHTML(
                    item.name ||
                    item.tournamentName ||
                    "Tournament"
                  )}
                </div>

                <div class="calendar-meta">
                  ${escapeHTML(
                    String(
                      item.tour ||
                      item.gender ||
                      "ATP / WTA"
                    ).toUpperCase()
                  )}
                  ${
                    item.country
                      ? ` · ${escapeHTML(item.country)}`
                      : ""
                  }
                </div>
              </div>

              <div class="calendar-tour">
                ${escapeHTML(
                  item.tier ||
                  item.rank ||
                  ""
                )}
              </div>
            </article>
          `;
        })
        .join("");

  } catch (error) {
    console.log(
      "YepTennis calendar:",
      error
    );

    container.innerHTML =
      `<div class="empty-state">
        Tournament calendar is temporarily unavailable.
      </div>`;
  }
}

function calendarDate(start, end) {
  if (!start) return "TBC";

  const a =
    new Date(start);

  if (isNaN(a)) return start;

  const format =
    d =>
      d.toLocaleDateString(
        "en-GB",
        {
          day: "2-digit",
          month: "short"
        }
      );

  if (!end) {
    return format(a);
  }

  const b =
    new Date(end);

  if (isNaN(b)) {
    return format(a);
  }

  return `${format(a)} – ${format(b)}`;
}

async function loadRankings() {
  for (
    const [tour, id] of [
      ["atp", "atp-ranking-list"],
      ["wta", "wta-ranking-list"]
    ]
  ) {
    const container =
      document.getElementById(id);

    if (!container) continue;

    try {
      const data =
        await fetchJSON(
          `/api/rankings?tour=${tour}`
        );

      const items =
        Array.isArray(data?.players)
          ? data.players
          : Array.isArray(data?.[tour])
            ? data[tour]
            : [];

      renderRanking(
        container,
        items
      );

    } catch {
      container.innerHTML =
        `<div class="empty-state">
          Rankings will appear here when the daily data feed is available.
        </div>`;
    }
  }
}

function renderRanking(
  container,
  items
) {
  if (!items.length) {
    container.innerHTML =
      `<div class="empty-state">
        No ranking data available.
      </div>`;
    return;
  }

  container.innerHTML =
    items
      .slice(0, 5)
      .map(
        (x, i) =>
          `<div class="ranking-row">
            <div class="ranking-number">
              ${escapeHTML(
                String(
                  x.rank ||
                  x.currentRank ||
                  i + 1
                )
              )}
            </div>

            <div>
              <div class="ranking-player">
                ${escapeHTML(
                  x.name ||
                  x.playerName ||
                  x.fullName ||
                  "Player"
                )}
              </div>

              <div class="ranking-country">
                ${escapeHTML(
                  x.countryAcr ||
                  x.country ||
                  x.countryCode ||
                  ""
                )}
              </div>
            </div>

            <div class="ranking-points">
              ${escapeHTML(
                String(
                  x.points ||
                  x.rankingPoints ||
                  ""
                )
              )}
            </div>
          </div>`
      )
      .join("");
}

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
