/* =========================================================
   YepTennis Worker
   Version: 2026-09-27.9
   ========================================================= */

const VERSION = "YepTennis Worker 2026-09-27.9";

const RAPIDAPI_HOST =
  "tennis-api-atp-wta-itf.p.rapidapi.com";

const RAPIDAPI_BASE =
  "https://" + RAPIDAPI_HOST;

const CACHE_TTL = 60 * 60 * 12; // 12 hours

/* =========================================================
   BASIC HELPERS
   ========================================================= */

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders
    }
  });
}

function nowISO() {
  return new Date().toISOString();
}

function dateUTC(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function yearUTC() {
  return new Date().getUTCFullYear();
}

function arr(v) {
  if (Array.isArray(v)) return v;

  if (v && Array.isArray(v.data)) return v.data;
  if (v && Array.isArray(v.results)) return v.results;
  if (v && Array.isArray(v.items)) return v.items;
  if (v && Array.isArray(v.matches)) return v.matches;
  if (v && Array.isArray(v.fixtures)) return v.fixtures;

  return [];
}

function val(obj, keys, fallback = null) {
  if (!obj || typeof obj !== "object") {
    return fallback;
  }

  for (const key of keys) {
    if (
      obj[key] !== undefined &&
      obj[key] !== null &&
      obj[key] !== ""
    ) {
      return obj[key];
    }
  }

  return fallback;
}

/* =========================================================
   KV
   ========================================================= */

async function getCache(env, key) {
  if (!env.TENNIS_CACHE) return null;

  try {
    const value = await env.TENNIS_CACHE.get(key, "json");
    return value || null;
  } catch (e) {
    return null;
  }
}

async function putCache(env, key, value) {
  if (!env.TENNIS_CACHE) return false;

  try {
    await env.TENNIS_CACHE.put(
      key,
      JSON.stringify(value),
      {
        expirationTtl: CACHE_TTL
      }
    );

    return true;
  } catch (e) {
    return false;
  }
}

/* =========================================================
   RAPIDAPI
   ========================================================= */

async function call(path, env) {
  const key = env.TENNIS_API_KEY;

  if (!key) {
    throw new Error("Missing TENNIS_API_KEY");
  }

  const response = await fetch(
    RAPIDAPI_BASE + path,
    {
      headers: {
        "x-rapidapi-host": RAPIDAPI_HOST,
        "x-rapidapi-key": key
      }
    }
  );

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = {
      raw: text
    };
  }

  if (!response.ok) {
    throw new Error(
      "RapidAPI " +
      response.status +
      ": " +
      JSON.stringify(data)
    );
  }

  return data;
}

/* =========================================================
   PLAYER
   IMPORTANT:
   ATP ranking data has player nested inside "player".
   ========================================================= */

function player(p) {
  const q =
    p?.player &&
    typeof p.player === "object"
      ? p.player
      : p;

  if (typeof q === "string") {
    return {
      id: null,
      name: q,
      country: "",
      rank: null,
      points: 0
    };
  }

  if (!q || typeof q !== "object") {
    return {
      id: null,
      name: "Player",
      country: "",
      rank: null,
      points: 0
    };
  }

  return {
    id: val(
      q,
      [
        "id",
        "playerId",
        "playerID"
      ],
      null
    ),

    name: val(
      q,
      [
        "name",
        "playerName",
        "fullName",
        "displayName"
      ],
      "Player"
    ),

    country: val(
      q,
      [
        "countryAcr",
        "country",
        "countryCode",
        "countryCodeAcr"
      ],
      ""
    ),

    rank: val(
      p,
      [
        "currentRank",
        "rank",
        "ranking"
      ],
      val(
        q,
        [
          "currentRank",
          "rank",
          "ranking"
        ],
        null
      )
    ),

    points: Number(
      val(
        p,
        [
          "points",
          "rankingPoints",
          "pointsCurrent"
        ],
        val(
          q,
          [
            "points",
            "rankingPoints",
            "pointsCurrent"
          ],
          0
        )
      ) || 0
    )
  };
}

/* =========================================================
   SCORE
   ========================================================= */

function extractScore(m) {
  const score =
    m?.score ||
    m?.result ||
    m?.scores ||
    {};

  if (typeof score === "string") {
    return score;
  }

  const sets =
    score?.sets ||
    score?.setScores ||
    m?.setScores;

  if (Array.isArray(sets)) {
    return sets
      .map(s => {
        if (typeof s === "string") return s;

        const a = val(
          s,
          [
            "player1",
            "home",
            "homeScore",
            "score1",
            "p1"
          ],
          ""
        );

        const b = val(
          s,
          [
            "player2",
            "away",
            "awayScore",
            "score2",
            "p2"
          ],
          ""
        );

        return a !== "" || b !== ""
          ? `${a}-${b}`
          : "";
      })
      .filter(Boolean)
      .join(" ");
  }

  const direct =
    val(
      score,
      [
        "display",
        "score",
        "text"
      ],
      ""
    );

  return direct || "";
}

/* =========================================================
   MATCH NORMALISER
   ========================================================= */

function match(m, tour) {
  if (!m || typeof m !== "object") {
    return null;
  }

  const p1 =
    m.player1 ||
    m.playerOne ||
    m.homePlayer ||
    m.home ||
    m.playerA ||
    {};

  const p2 =
    m.player2 ||
    m.playerTwo ||
    m.awayPlayer ||
    m.away ||
    m.playerB ||
    {};

  const a = player(p1);
  const b = player(p2);

  const tournament =
    m.tournament ||
    m.event ||
    m.competition ||
    {};

  const tournamentName =
    typeof tournament === "string"
      ? tournament
      : val(
          tournament,
          [
            "name",
            "tournamentName",
            "title"
          ],
          val(
            m,
            [
              "tournamentName",
              "eventName"
            ],
            ""
          )
        );

  const tournamentId =
    typeof tournament === "object"
      ? val(
          tournament,
          [
            "id",
            "tournamentId"
          ],
          null
        )
      : val(
          m,
          [
            "tournamentId",
            "eventId"
          ],
          null
        );

  const date =
    val(
      m,
      [
        "date",
        "startTime",
        "startDate",
        "scheduledAt"
      ],
      null
    );

  const status =
    val(
      m,
      [
        "status",
        "matchStatus",
        "state"
      ],
      ""
    );

  const round =
    m.round ||
    m.roundName ||
    m.roundInfo ||
    "";

  return {
    id: val(
      m,
      [
        "id",
        "matchId",
        "fixtureId"
      ],
      null
    ),

    tour,

    date,

    status,

    round:
      typeof round === "object"
        ? val(
            round,
            [
              "name",
              "roundName",
              "title"
            ],
            ""
          )
        : round,

    tournament: tournamentName,

    tournamentId,

    player1: a,

    player2: b,

    score: extractScore(m),

    winner:
      val(
        m,
        [
          "winner",
          "winnerId"
        ],
        null
      )
  };
}

/* =========================================================
   FIXTURES
   ========================================================= */

async function fetchFixtures(env, tour, date) {
  const path =
    `/tennis/v2/${tour}/fixtures/${date}`;

  const data = await call(path, env);

  return arr(data)
    .map(x => match(x, tour.toUpperCase()))
    .filter(Boolean);
}

/* =========================================================
   LIVE
   ========================================================= */

async function fetchLive(env) {
  const result = {
    atp: [],
    wta: [],
    matches: [],
    updated: nowISO()
  };

  const tours = ["atp", "wta"];

  for (const tour of tours) {
    try {
      const data = await call(
        `/tennis/v2/${tour}/fixtures/live`,
        env
      );

      const rows = arr(data)
        .map(x =>
          match(
            x,
            tour.toUpperCase()
          )
        )
        .filter(Boolean);

      result[tour] = rows;
      result.matches.push(...rows);
    } catch (e) {
      // Keep other tour alive.
    }
  }

  return result;
}

/* =========================================================
   TODAY
   ========================================================= */

async function refreshToday(env, date) {
  const [atpResult, wtaResult] =
    await Promise.allSettled([
      fetchFixtures(env, "atp", date),
      fetchFixtures(env, "wta", date)
    ]);

  const atp =
    atpResult.status === "fulfilled"
      ? atpResult.value
      : [];

  const wta =
    wtaResult.status === "fulfilled"
      ? wtaResult.value
      : [];

  const live =
    await fetchLive(env);

  const payload = {
    ok: true,
    date,
    version: VERSION,
    atp,
    wta,
    matches: [
      ...atp,
      ...wta
    ],
    live: live.matches || [],
    updated: nowISO()
  };

  await putCache(
    env,
    `today:${date}:atp`,
    {
      ok: true,
      date,
      tour: "ATP",
      matches: atp,
      updated: payload.updated
    }
  );

  await putCache(
    env,
    `today:${date}:wta`,
    {
      ok: true,
      date,
      tour: "WTA",
      matches: wta,
      updated: payload.updated
    }
  );

  await putCache(
    env,
    `live:${date}`,
    live
  );

  // Keep a combined copy for compatibility
  // with the previous Worker version.
  await putCache(
    env,
    `today:${date}`,
    payload
  );

  return payload;
}

/* =========================================================
   RESULTS / YESTERDAY
   ========================================================= */

async function fetchResults(
  env,
  tour,
  start,
  end
) {
  const path =
    `/tennis/v2/${tour}/results/${start}/${end}`;

  const data = await call(path, env);

  return arr(data)
    .map(x =>
      match(
        x,
        tour.toUpperCase()
      )
    )
    .filter(Boolean);
}

async function refreshYesterday(
  env,
  date
) {
  const atpResult =
    await Promise.allSettled([
      fetchResults(
        env,
        "atp",
        date,
        date
      ),
      fetchResults(
        env,
        "wta",
        date,
        date
      )
    ]);

  const atp =
    atpResult[0].status === "fulfilled"
      ? atpResult[0].value
      : [];

  const wta =
    atpResult[1].status === "fulfilled"
      ? atpResult[1].value
      : [];

  const payload = {
    ok: true,
    date,
    version: VERSION,
    atp,
    wta,
    matches: [
      ...atp,
      ...wta
    ],
    updated: nowISO()
  };

  await putCache(
    env,
    `yesterday:${date}:atp`,
    {
      ok: true,
      date,
      tour: "ATP",
      matches: atp,
      updated: payload.updated
    }
  );

  await putCache(
    env,
    `yesterday:${date}:wta`,
    {
      ok: true,
      date,
      tour: "WTA",
      matches: wta,
      updated: payload.updated
    }
  );

  await putCache(
    env,
    `yesterday:${date}`,
    payload
  );

  return payload;
}

/* =========================================================
   CALENDAR
   ========================================================= */

async function fetchCalendar(
  env,
  tour,
  year
) {
  const data = await call(
    `/tennis/v2/${tour}/tournament/calendar/${year}?pageNo=1&pageSize=200`,
    env
  );

  return arr(data);
}

async function refreshCalendar(
  env,
  year
) {
  const [atpResult, wtaResult] =
    await Promise.allSettled([
      fetchCalendar(
        env,
        "atp",
        year
      ),
      fetchCalendar(
        env,
        "wta",
        year
      )
    ]);

  const atp =
    atpResult.status === "fulfilled"
      ? atpResult.value
      : [];

  const wta =
    wtaResult.status === "fulfilled"
      ? wtaResult.value
      : [];

  const payload = {
    ok: true,
    year,
    version: VERSION,
    atp,
    wta,
    updated: nowISO()
  };

  await putCache(
    env,
    `calendar:${year}`,
    payload
  );

  // New generic key as well.
  await putCache(
    env,
    "calendar",
    payload
  );

  return payload;
}

/* =========================================================
   RANKINGS
   ========================================================= */

async function fetchRankings(
  env,
  tour
) {
  const data = await call(
    `/tennis/v2/${tour}/ranking/singles?pageNo=1&pageSize=50`,
    env
  );

  const players =
    arr(data)
      .map((p, i) => {
        const x = player(p);

        return {
          ...x,

          rank:
            x.rank ||
            i + 1
        };
      });

  return players;
}

async function refreshRankings(
  env,
  tour
) {
  const players =
    await fetchRankings(
      env,
      tour
    );

  const payload = {
    ok: true,
    tour: tour.toUpperCase(),
    version: VERSION,
    players,
    count: players.length,
    updated: nowISO()
  };

  await putCache(
    env,
    `rankings:${tour}`,
    payload
  );

  return payload;
}

/* =========================================================
   CACHE READERS
   Includes compatibility with previous
   combined cache keys.
   ========================================================= */

async function readTodayTour(
  env,
  date,
  tour
) {
  const key =
    `today:${date}:${tour}`;

  const current =
    await getCache(env, key);

  if (current) {
    return current;
  }

  // Compatibility with older Worker.
  const old =
    await getCache(
      env,
      `today:${date}`
    );

  if (old) {
    return {
      ok: true,
      date,
      tour: tour.toUpperCase(),
      matches:
        tour === "atp"
          ? old.atp || []
          : old.wta || [],
      updated:
        old.updated ||
        old.cachedAt ||
        null
    };
  }

  return null;
}

async function readYesterdayTour(
  env,
  date,
  tour
) {
  const key =
    `yesterday:${date}:${tour}`;

  const current =
    await getCache(env, key);

  if (current) {
    return current;
  }

  // Compatibility with older Worker.
  const old =
    await getCache(
      env,
      `yesterday:${date}`
    );

  if (old) {
    return {
      ok: true,
      date,
      tour: tour.toUpperCase(),
      matches:
        tour === "atp"
          ? old.atp || []
          : old.wta || [],
      updated:
        old.updated ||
        old.cachedAt ||
        null
    };
  }

  return null;
}

async function readCalendar(
  env,
  year
) {
  const current =
    await getCache(
      env,
      "calendar"
    );

  if (current) {
    return current;
  }

  return await getCache(
    env,
    `calendar:${year}`
  );
}

/* =========================================================
   HEALTH
   ========================================================= */

async function health(env) {
  const today =
    dateUTC(0);

  const yesterday =
    dateUTC(-1);

  const atp =
    await readTodayTour(
      env,
      today,
      "atp"
    );

  const wta =
    await readTodayTour(
      env,
      today,
      "wta"
    );

  const live =
    await getCache(
      env,
      `live:${today}`
    );

  const calendar =
    await readCalendar(
      env,
      yearUTC()
    );

  const rankingsATP =
    await getCache(
      env,
      "rankings:atp"
    );

  const rankingsWTA =
    await getCache(
      env,
      "rankings:wta"
    );

  const yesterdayATP =
    await readYesterdayTour(
      env,
      yesterday,
      "atp"
    );

  const yesterdayWTA =
    await readYesterdayTour(
      env,
      yesterday,
      "wta"
    );

  return {
    ok: true,
    version: VERSION,
    date: today,

    cacheConfigured:
      !!env.TENNIS_CACHE,

    rapidApiConfigured:
      !!env.TENNIS_API_KEY,

    today: {
      atp: !!atp,
      wta: !!wta,
      live: !!live
    },

    yesterday: {
      atp: !!yesterdayATP,
      wta: !!yesterdayWTA
    },

    calendar:
      !!calendar,

    rankings: {
      atp: !!rankingsATP,
      wta: !!rankingsWTA
    },

    cached:
      !!(
        atp ||
        wta ||
        live ||
        calendar ||
        rankingsATP ||
        rankingsWTA
      ),

    updated:
      atp?.updated ||
      wta?.updated ||
      live?.updated ||
      null
  };
}

/* =========================================================
   DEBUG
   ========================================================= */

async function debug(env) {
  const today =
    dateUTC(0);

  const yesterday =
    dateUTC(-1);

  const atp =
    await readTodayTour(
      env,
      today,
      "atp"
    );

  const wta =
    await readTodayTour(
      env,
      today,
      "wta"
    );

  const yATP =
    await readYesterdayTour(
      env,
      yesterday,
      "atp"
    );

  const yWTA =
    await readYesterdayTour(
      env,
      yesterday,
      "wta"
    );

  const live =
    await getCache(
      env,
      `live:${today}`
    );

  return {
    ok: true,
    version: VERSION,
    date: today,

    today: {
      atp: {
        cached: !!atp,
        count:
          atp?.matches?.length || 0,
        updated:
          atp?.updated || null
      },

      wta: {
        cached: !!wta,
        count:
          wta?.matches?.length || 0,
        updated:
          wta?.updated || null
      },

      live: {
        cached: !!live,
        count:
          live?.matches?.length || 0,
        updated:
          live?.updated || null
      }
    },

    yesterday: {
      date: yesterday,

      atp: {
        cached: !!yATP,
        count:
          yATP?.matches?.length || 0,
        updated:
          yATP?.updated || null
      },

      wta: {
        cached: !!yWTA,
        count:
          yWTA?.matches?.length || 0,
        updated:
          yWTA?.updated || null
      }
    }
  };
}

/* =========================================================
   RANKINGS DEBUG
   ========================================================= */

async function rankingsDebug(env) {
  const atp =
    await getCache(
      env,
      "rankings:atp"
    );

  const wta =
    await getCache(
      env,
      "rankings:wta"
    );

  return {
    ok: true,
    version: VERSION,

    atp: {
      cached: !!atp,
      count:
        atp?.players?.length || 0,
      cachedAt:
        atp?.updated || null
    },

    wta: {
      cached: !!wta,
      count:
        wta?.players?.length || 0,
      cachedAt:
        wta?.updated || null
    }
  };
}

/* =========================================================
   SCHEDULED DEBUG
   ========================================================= */

async function scheduledDebug(env) {
  return {
    ok: true,
    version: VERSION,
    message:
      "Scheduled refreshes use RapidAPI only. Visitor requests use KV cache only.",
    schedule: [
      "00:00 UTC",
      "04:00 UTC",
      "08:00 UTC",
      "12:00 UTC",
      "16:00 UTC",
      "20:00 UTC"
    ],
    special: {
      "00:00 UTC":
        "Calendar + ATP/WTA rankings",
      "08:00 UTC":
        "Yesterday ATP/WTA results"
    }
  };
}

/* =========================================================
   VISITOR: TODAY
   ========================================================= */

async function todayEndpoint(
  env
) {
  const date =
    dateUTC(0);

  const atp =
    await readTodayTour(
      env,
      date,
      "atp"
    );

  const wta =
    await readTodayTour(
      env,
      date,
      "wta"
    );

  const live =
    await getCache(
      env,
      `live:${date}`
    );

  const ATP =
    atp?.matches || [];

  const WTA =
    wta?.matches || [];

  const LIVE =
    live?.matches || [];

  return {
    ok: true,
    date,
    version: VERSION,

    atp: ATP,
    wta: WTA,

    matches: [
      ...ATP,
      ...WTA
    ],

    live: LIVE,

    count:
      ATP.length +
      WTA.length,

    atpCount:
      ATP.length,

    wtaCount:
      WTA.length,

    liveCount:
      LIVE.length,

    cached: true,

    updated:
      atp?.updated ||
      wta?.updated ||
      live?.updated ||
      null
  };
}

/* =========================================================
   VISITOR: YESTERDAY
   ========================================================= */

async function yesterdayEndpoint(
  env
) {
  const date =
    dateUTC(-1);

  const atp =
    await readYesterdayTour(
      env,
      date,
      "atp"
    );

  const wta =
    await readYesterdayTour(
      env,
      date,
      "wta"
    );

  const ATP =
    atp?.matches || [];

  const WTA =
    wta?.matches || [];

  return {
    ok: true,
    date,
    version: VERSION,

    atp: ATP,
    wta: WTA,

    matches: [
      ...ATP,
      ...WTA
    ],

    count:
      ATP.length +
      WTA.length,

    atpCount:
      ATP.length,

    wtaCount:
      WTA.length,

    cached: true,

    updated:
      atp?.updated ||
      wta?.updated ||
      null
  };
}

/* =========================================================
   VISITOR: CALENDAR
   ========================================================= */

async function calendarEndpoint(
  env
) {
  const data =
    await readCalendar(
      env,
      yearUTC()
    );

  if (!data) {
    return {
      ok: true,
      version: VERSION,
      year: yearUTC(),
      atp: [],
      wta: [],
      cached: true,
      updated: null
    };
  }

  return {
    ...data,
    cached: true
  };
}

/* =========================================================
   VISITOR: RANKINGS
   ========================================================= */

async function rankingsEndpoint(
  env,
  tour
) {
  const t =
    String(tour || "atp")
      .toLowerCase();

  if (
    t !== "atp" &&
    t !== "wta"
  ) {
    return json(
      {
        error:
          "Tour must be atp or wta",
        version: VERSION
      },
      400
    );
  }

  const data =
    await getCache(
      env,
      `rankings:${t}`
    );

  if (!data) {
    return {
      ok: true,
      tour: t.toUpperCase(),
      version: VERSION,
      players: [],
      count: 0,
      cached: true,
      updated: null
    };
  }

  return {
    ...data,
    cached: true
  };
}

/* =========================================================
   SCHEDULED REFRESH
   ========================================================= */

async function scheduledRefresh(
  env,
  scheduledTime
) {
  const d =
    new Date(
      scheduledTime ||
      Date.now()
    );

  const hour =
    d.getUTCHours();

  const today =
    d.toISOString()
      .slice(0, 10);

  const results = {
    version: VERSION,
    scheduledAt: d.toISOString(),
    hour,
    today: false,
    yesterday: false,
    calendar: false,
    rankings: false,
    errors: []
  };

  /* -----------------------------------------
     EVERY RUN:
     TODAY ATP + WTA + LIVE
     ----------------------------------------- */

  try {
    await refreshToday(
      env,
      today
    );

    results.today = true;
  } catch (e) {
    results.errors.push(
      "today: " +
      e.message
    );
  }

  /* -----------------------------------------
     08:00 UTC:
     YESTERDAY RESULTS
     ----------------------------------------- */

  if (hour === 8) {
    try {
      await refreshYesterday(
        env,
        dateUTC(-1)
      );

      results.yesterday = true;
    } catch (e) {
      results.errors.push(
        "yesterday: " +
        e.message
      );
    }
  }

  /* -----------------------------------------
     00:00 UTC:
     CALENDAR + RANKINGS
     ----------------------------------------- */

  if (hour === 0) {
    try {
      await refreshCalendar(
        env,
        yearUTC()
      );

      results.calendar = true;
    } catch (e) {
      results.errors.push(
        "calendar: " +
        e.message
      );
    }

    try {
      await refreshRankings(
        env,
        "atp"
      );

      await refreshRankings(
        env,
        "wta"
      );

      results.rankings = true;
    } catch (e) {
      results.errors.push(
        "rankings: " +
        e.message
      );
    }
  }

  return results;
}

/* =========================================================
   REQUEST ROUTER
   ========================================================= */

async function handle(
  request,
  env
) {
  const url =
    new URL(request.url);

  const path =
    url.pathname;

  /* -----------------------------------------
     HEALTH
     ----------------------------------------- */

  if (path === "/api/health") {
    return json(
      await health(env)
    );
  }

  /* -----------------------------------------
     DEBUG
     ----------------------------------------- */

  if (path === "/api/debug") {
    return json(
      await debug(env)
    );
  }

  if (
    path ===
    "/api/rankings-debug"
  ) {
    return json(
      await rankingsDebug(env)
    );
  }

  if (
    path ===
    "/api/scheduled-debug"
  ) {
    return json(
      await scheduledDebug(env)
    );
  }

  /* -----------------------------------------
     TODAY
     ----------------------------------------- */

  if (
    path === "/api/today" ||
    path === "/api/results"
  ) {
    return json(
      await todayEndpoint(env)
    );
  }

  /* -----------------------------------------
     YESTERDAY
     ----------------------------------------- */

  if (
    path === "/api/yesterday"
  ) {
    return json(
      await yesterdayEndpoint(env)
    );
  }

  /* -----------------------------------------
     CALENDAR
     ----------------------------------------- */

  if (
    path === "/api/calendar"
  ) {
    return json(
      await calendarEndpoint(env)
    );
  }

  /* -----------------------------------------
     RANKINGS
     ----------------------------------------- */

  if (
    path === "/api/rankings/atp"
  ) {
    return json(
      await rankingsEndpoint(
        env,
        "atp"
      )
    );
  }

  if (
    path === "/api/rankings/wta"
  ) {
    return json(
      await rankingsEndpoint(
        env,
        "wta"
      )
    );
  }

  if (
    path === "/api/rankings"
  ) {
    const tour =
      url.searchParams.get(
        "tour"
      ) || "atp";

    return json(
      await rankingsEndpoint(
        env,
        tour
      )
    );
  }

  /* -----------------------------------------
     STATIC WEBSITE
     ----------------------------------------- */

  if (env.ASSETS) {
    return env.ASSETS.fetch(
      request
    );
  }

  return new Response(
    "YepTennis Worker",
    {
      status: 200,
      headers: {
        "content-type":
          "text/plain; charset=utf-8"
      }
    }
  );
}

/* =========================================================
   WORKER EXPORT
   ========================================================= */

export default {
  async fetch(
    request,
    env,
    ctx
  ) {
    try {
      return await handle(
        request,
        env
      );
    } catch (e) {
      return json(
        {
          ok: false,
          version: VERSION,
          error:
            e?.message ||
            String(e)
        },
        500
      );
    }
  },

  async scheduled(
    controller,
    env,
    ctx
  ) {
    ctx.waitUntil(
      scheduledRefresh(
        env,
        controller.scheduledTime
      )
    );
  }
};