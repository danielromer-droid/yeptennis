/* =========================================================
   YepTennis Worker
   Version: 2026-09-27.8
   ========================================================= */

const VERSION = "YepTennis Worker 2026-09-27.8";

const HOST = "tennis-api-atp-wta-itf.p.rapidapi.com";
const BASE = `https://${HOST}`;

/* =========================================================
   CACHE SETTINGS
   ========================================================= */

const TODAY_TTL = 60 * 60 * 12;          // 12 hours
const YESTERDAY_TTL = 60 * 60 * 48;       // 48 hours
const RANKINGS_TTL = 60 * 60 * 24;        // 24 hours
const CALENDAR_TTL = 60 * 60 * 24;        // 24 hours
const LIVE_TTL = 60 * 60 * 2;             // 2 hours

/* =========================================================
   JSON RESPONSE
   ========================================================= */

function J(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      }
    }
  );
}

/* =========================================================
   DATE HELPERS
   ========================================================= */

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function previousDate(dateString) {
  const d = new Date(`${dateString}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/* =========================================================
   KV HELPERS
   ========================================================= */

async function getCache(env, key) {
  if (!env.TENNIS_CACHE) return null;

  try {
    const raw = await env.TENNIS_CACHE.get(key);

    if (!raw) return null;

    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

async function putCache(env, key, data, ttlSeconds) {
  if (!env.TENNIS_CACHE) return false;

  try {
    await env.TENNIS_CACHE.put(
      key,
      JSON.stringify(data),
      {
        expirationTtl: ttlSeconds
      }
    );

    return true;
  } catch (e) {
    return false;
  }
}

/* =========================================================
   RAPIDAPI CALL
   ========================================================= */

async function call(path, env) {

  if (!env.TENNIS_API_KEY) {
    throw new Error("Missing TENNIS_API_KEY");
  }

  const response = await fetch(`${BASE}${path}`, {
    method: "GET",
    headers: {
      "x-rapidapi-host": HOST,
      "x-rapidapi-key": env.TENNIS_API_KEY
    }
  });

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
      `RapidAPI ${response.status}: ${JSON.stringify(data)}`
    );
  }

  return data;
}

/* =========================================================
   GENERIC DATA HELPERS
   ========================================================= */

function arr(x) {

  if (Array.isArray(x)) return x;

  if (!x || typeof x !== "object") return [];

  const possible = [
    x.data,
    x.results,
    x.matches,
    x.fixtures,
    x.events,
    x.players,
    x.items,
    x.tournaments
  ];

  for (const p of possible) {
    if (Array.isArray(p)) return p;
  }

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
   PLAYER NORMALISATION
   ========================================================= */

function player(p) {

  if (typeof p === "string") {
    return {
      id: null,
      name: p,
      country: "",
      rank: null,
      points: 0
    };
  }

  if (!p || typeof p !== "object") {
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
      p,
      [
        "id",
        "playerId",
        "playerID"
      ],
      null
    ),

    name: val(
      p,
      [
        "name",
        "playerName",
        "fullName",
        "displayName"
      ],
      "Player"
    ),

    country: val(
      p,
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
      null
    ),

    points: val(
      p,
      [
        "points",
        "rankingPoints",
        "pointsCurrent"
      ],
      0
    )
  };
}

/* =========================================================
   SCORE
   ========================================================= */

function extractScore(m) {

  if (!m || typeof m !== "object") {
    return "";
  }

  const direct = val(
    m,
    [
      "score",
      "scoreString",
      "result"
    ],
    null
  );

  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }

  const s = m.score;

  if (s && typeof s === "object") {

    const text = val(
      s,
      [
        "display",
        "formatted",
        "scoreString"
      ],
      null
    );

    if (text) return text;

    const sets = [];

    for (let i = 1; i <= 5; i++) {

      const v = val(
        s,
        [
          `set${i}`,
          `set${i}Score`
        ],
        null
      );

      if (v !== null) {
        sets.push(v);
      }
    }

    if (sets.length) {
      return sets.join(" ");
    }
  }

  return "";
}

/* =========================================================
   MATCH NORMALISATION
   ========================================================= */

function match(m, tour) {

  if (!m || typeof m !== "object") {
    return null;
  }

  const p1 =
    val(
      m,
      [
        "player1",
        "playerA",
        "homePlayer",
        "playerOne"
      ],
      null
    ) ||
    val(m, ["firstPlayer"], null);

  const p2 =
    val(
      m,
      [
        "player2",
        "playerB",
        "awayPlayer",
        "playerTwo"
      ],
      null
    ) ||
    val(m, ["secondPlayer"], null);

  const tournamentObj =
    m.tournament &&
    typeof m.tournament === "object"
      ? m.tournament
      : {};

  const roundObj =
    m.round &&
    typeof m.round === "object"
      ? m.round
      : {};

  const tournament =
    val(
      m,
      [
        "tournamentName",
        "tournament"
      ],
      null
    );

  const tournamentName =
    typeof tournament === "string"
      ? tournament
      : val(
          tournamentObj,
          [
            "name",
            "tournamentName"
          ],
          "Tournament"
        );

  const tournamentId =
    val(
      m,
      [
        "tournamentId",
        "tournamentID"
      ],
      null
    ) ||
    val(
      tournamentObj,
      [
        "id",
        "tournamentId"
      ],
      null
    );

  const round =
    val(
      m,
      [
        "roundName",
        "round"
      ],
      null
    );

  const roundName =
    typeof round === "string"
      ? round
      : val(
          roundObj,
          [
            "name",
            "roundName"
          ],
          ""
        );

  const date =
    val(
      m,
      [
        "date",
        "startTime",
        "startDate",
        "matchDate"
      ],
      null
    );

  const id =
    val(
      m,
      [
        "id",
        "matchId"
      ],
      null
    );

  return {
    id,

    date,

    tour: tour || "",

    tournament: tournamentName,

    tournamentId,

    round: roundName,

    player1: player(p1),

    player2: player(p2),

    score: extractScore(m),

    status: val(
      m,
      [
        "status",
        "statusName",
        "matchStatus"
      ],
      ""
    ),

    winner: val(
      m,
      [
        "winner",
        "winnerId",
        "winnerPlayerId"
      ],
      null
    ),

    seed1: val(
      m,
      [
        "seed1",
        "player1Seed"
      ],
      null
    ),

    seed2: val(
      m,
      [
        "seed2",
        "player2Seed"
      ],
      null
    )
  };
}

/* =========================================================
   FETCH FIXTURES
   ========================================================= */

async function fetchTour(env, tour, date) {

  const endpoint =
    `/tennis/v2/${tour}/fixtures/${date}` +
    `?include=round,tournament` +
    `&pageNo=1&pageSize=100` +
    `&filter=PlayerGroup:singles`;

  const data = await call(endpoint, env);

  return arr(data)
    .map(x => match(x, tour))
    .filter(Boolean);
}

/* =========================================================
   FETCH LIVE
   ========================================================= */

async function fetchLive(env) {

  const data = await call(
    `/tennis/v2/extend/api/events/live`,
    env
  );

  return arr(data)
    .map(x => {

      const tour =
        String(
          val(
            x,
            [
              "tour",
              "tourName",
              "category"
            ],
            ""
          )
        ).toLowerCase()
        .includes("wta")
          ? "wta"
          : "atp";

      return match(x, tour);
    })
    .filter(Boolean);
}

/* =========================================================
   REFRESH TODAY
   ========================================================= */

async function refreshToday(env, date) {

  const results = await Promise.allSettled([
    fetchTour(env, "atp", date),
    fetchTour(env, "wta", date)
  ]);

  const atp =
    results[0].status === "fulfilled"
      ? results[0].value
      : [];

  const wta =
    results[1].status === "fulfilled"
      ? results[1].value
      : [];

  await Promise.all([
    putCache(
      env,
      `today:${date}:atp`,
      {
        ok: true,
        tour: "atp",
        date,
        matches: atp,
        count: atp.length,
        updated: new Date().toISOString()
      },
      TODAY_TTL
    ),

    putCache(
      env,
      `today:${date}:wta`,
      {
        ok: true,
        tour: "wta",
        date,
        matches: wta,
        count: wta.length,
        updated: new Date().toISOString()
      },
      TODAY_TTL
    )
  ]);

  return {
    atp,
    wta
  };
}

/* =========================================================
   REFRESH YESTERDAY
   ========================================================= */

async function refreshYesterday(env, date) {

  const results = await Promise.allSettled([
    fetchTour(env, "atp", date),
    fetchTour(env, "wta", date)
  ]);

  const atp =
    results[0].status === "fulfilled"
      ? results[0].value
      : [];

  const wta =
    results[1].status === "fulfilled"
      ? results[1].value
      : [];

  await Promise.all([
    putCache(
      env,
      `yesterday:${date}:atp`,
      {
        ok: true,
        tour: "atp",
        date,
        matches: atp,
        count: atp.length,
        updated: new Date().toISOString()
      },
      YESTERDAY_TTL
    ),

    putCache(
      env,
      `yesterday:${date}:wta`,
      {
        ok: true,
        tour: "wta",
        date,
        matches: wta,
        count: wta.length,
        updated: new Date().toISOString()
      },
      YESTERDAY_TTL
    )
  ]);

  return {
    atp,
    wta
  };
}

/* =========================================================
   REFRESH LIVE
   ========================================================= */

async function refreshLive(env, date) {

  try {

    const live = await fetchLive(env);

    await putCache(
      env,
      `live:${date}`,
      {
        ok: true,
        date,
        matches: live,
        count: live.length,
        updated: new Date().toISOString()
      },
      LIVE_TTL
    );

    return live;

  } catch (e) {

    return [];
  }
}

/* =========================================================
   CALENDAR
   ========================================================= */

async function fetchCalendarTour(env, tour) {

  const endpoint =
    `/tennis/v2/${tour}/tournaments` +
    `?pageNo=1&pageSize=100`;

  const data = await call(endpoint, env);

  return arr(data);
}

async function refreshCalendar(env) {

  const results = await Promise.allSettled([
    fetchCalendarTour(env, "atp"),
    fetchCalendarTour(env, "wta")
  ]);

  const atp =
    results[0].status === "fulfilled"
      ? results[0].value
      : [];

  const wta =
    results[1].status === "fulfilled"
      ? results[1].value
      : [];

  const data = {
    ok: true,
    atp,
    wta,
    atpCount: atp.length,
    wtaCount: wta.length,
    updated: new Date().toISOString()
  };

  await putCache(
    env,
    "calendar",
    data,
    CALENDAR_TTL
  );

  return data;
}

/* =========================================================
   RANKINGS
   ========================================================= */

async function fetchRankings(env, tour) {

  const data = await call(
    `/tennis/v2/${tour}/ranking/singles?pageNo=1&pageSize=50`,
    env
  );

  const players = arr(data)
    .map((p, i) => {

      const x = player(p);

      return {
        ...x,
        rank: x.rank || i + 1
      };
    });

  return players;
}

async function refreshRankings(env, tour) {

  try {

    const players =
      await fetchRankings(env, tour);

    const data = {
      ok: true,
      tour,
      players,
      count: players.length,
      updated: new Date().toISOString()
    };

    await putCache(
      env,
      `rankings:${tour}`,
      data,
      RANKINGS_TTL
    );

    return data;

  } catch (e) {

    return {
      ok: false,
      tour,
      players: [],
      count: 0,
      error: e.message
    };
  }
}

/* =========================================================
   READ TODAY FROM KV
   IMPORTANT:
   NO RAPIDAPI CALL FROM VISITOR
   ========================================================= */

async function today(env) {

  const date = todayDate();

  const [atp, wta, live] =
    await Promise.all([
      getCache(env, `today:${date}:atp`),
      getCache(env, `today:${date}:wta`),
      getCache(env, `live:${date}`)
    ]);

  const atpMatches =
    atp?.matches || [];

  const wtaMatches =
    wta?.matches || [];

  const liveMatches =
    live?.matches || [];

  return {
    ok: true,
    date,
    version: VERSION,

    atp: atpMatches,

    wta: wtaMatches,

    matches: [
      ...atpMatches,
      ...wtaMatches
    ],

    live: liveMatches,

    count:
      atpMatches.length +
      wtaMatches.length,

    atpCount: atpMatches.length,

    wtaCount: wtaMatches.length,

    liveCount: liveMatches.length,

    cached: true,

    updated:
      atp?.updated ||
      wta?.updated ||
      null
  };
}

/* =========================================================
   READ YESTERDAY FROM KV
   ========================================================= */

async function yesterday(env) {

  const date =
    previousDate(todayDate());

  const [atp, wta] =
    await Promise.all([
      getCache(
        env,
        `yesterday:${date}:atp`
      ),

      getCache(
        env,
        `yesterday:${date}:wta`
      )
    ]);

  const atpMatches =
    atp?.matches || [];

  const wtaMatches =
    wta?.matches || [];

  return {
    ok: true,

    date,

    version: VERSION,

    atp: atpMatches,

    wta: wtaMatches,

    matches: [
      ...atpMatches,
      ...wtaMatches
    ],

    count:
      atpMatches.length +
      wtaMatches.length,

    atpCount:
      atpMatches.length,

    wtaCount:
      wtaMatches.length,

    cached: true,

    updated:
      atp?.updated ||
      wta?.updated ||
      null
  };
}

/* =========================================================
   RANKINGS READ
   ========================================================= */

async function rankings(env, tour) {

  const data =
    await getCache(
      env,
      `rankings:${tour}`
    );

  if (data) {

    return {
      ...data,
      version: VERSION,
      cached: true
    };
  }

  /*
    IMPORTANT:
    Do NOT call RapidAPI here.

    Rankings are refreshed by the scheduled
    Worker. This prevents visitors from
    consuming the RapidAPI quota.
  */

  return {
    ok: false,

    version: VERSION,

    tour,

    players: [],

    count: 0,

    cached: false,

    error:
      "Ranking cache not available; waiting for scheduled refresh"
  };
}

/* =========================================================
   CALENDAR READ
   ========================================================= */

async function calendar(env) {

  const data =
    await getCache(
      env,
      "calendar"
    );

  if (data) {

    return {
      ...data,
      version: VERSION,
      cached: true
    };
  }

  return {
    ok: false,

    version: VERSION,

    atp: [],

    wta: [],

    atpCount: 0,

    wtaCount: 0,

    cached: false,

    error:
      "Calendar cache not available; waiting for scheduled refresh"
  };
}

/* =========================================================
   HEALTH
   ========================================================= */

async function health(env) {

  const date = todayDate();

  const [atp, wta, live, cal, ratp, rwta] =
    await Promise.all([
      getCache(
        env,
        `today:${date}:atp`
      ),

      getCache(
        env,
        `today:${date}:wta`
      ),

      getCache(
        env,
        `live:${date}`
      ),

      getCache(
        env,
        "calendar"
      ),

      getCache(
        env,
        "rankings:atp"
      ),

      getCache(
        env,
        "rankings:wta"
      )
    ]);

  return {
    ok: true,

    version: VERSION,

    date,

    cacheConfigured:
      !!env.TENNIS_CACHE,

    rapidApiConfigured:
      !!env.TENNIS_API_KEY,

    today: {
      atp: !!atp,
      wta: !!wta,
      live: !!live
    },

    calendar:
      !!cal,

    rankings: {
      atp: !!ratp,
      wta: !!rwta
    },

    cached: !!(
      atp ||
      wta
    ),

    updated:
      atp?.updated ||
      wta?.updated ||
      null
  };
}

/* =========================================================
   DEBUG
   ========================================================= */

async function debug(env) {

  const date = todayDate();

  const [atp, wta, live] =
    await Promise.all([
      getCache(
        env,
        `today:${date}:atp`
      ),

      getCache(
        env,
        `today:${date}:wta`
      ),

      getCache(
        env,
        `live:${date}`
      )
    ]);

  return {
    ok: true,

    version: VERSION,

    date,

    cacheConfigured:
      !!env.TENNIS_CACHE,

    atp: {
      cached: !!atp,
      count:
        atp?.count ||
        atp?.matches?.length ||
        0,

      cachedAt:
        atp?.updated ||
        null
    },

    wta: {
      cached: !!wta,
      count:
        wta?.count ||
        wta?.matches?.length ||
        0,

      cachedAt:
        wta?.updated ||
        null
    },

    live: {
      cached: !!live,
      count:
        live?.count ||
        live?.matches?.length ||
        0,

      cachedAt:
        live?.updated ||
        null
    }
  };
}

/* =========================================================
   RANKINGS DEBUG
   ========================================================= */

async function rankingsDebug(env) {

  const [atp, wta] =
    await Promise.all([
      getCache(
        env,
        "rankings:atp"
      ),

      getCache(
        env,
        "rankings:wta"
      )
    ]);

  return {
    ok: true,

    version: VERSION,

    cacheConfigured:
      !!env.TENNIS_CACHE,

    atp: {
      cached: !!atp,

      count:
        atp?.count ||
        atp?.players?.length ||
        0,

      cachedAt:
        atp?.updated ||
        null
    },

    wta: {
      cached: !!wta,

      count:
        wta?.count ||
        wta?.players?.length ||
        0,

      cachedAt:
        wta?.updated ||
        null
    }
  };
}

/* =========================================================
   SCHEDULED DEBUG
   ========================================================= */

async function scheduledDebug(env) {

  const keys = [
    "calendar",
    "rankings:atp",
    "rankings:wta"
  ];

  const result = {};

  for (const key of keys) {

    const data =
      await getCache(
        env,
        key
      );

    result[key] = {
      cached: !!data,

      updated:
        data?.updated ||
        null,

      count:
        data?.count ||
        0
    };
  }

  return {
    ok: true,

    version: VERSION,

    now:
      new Date().toISOString(),

    cacheConfigured:
      !!env.TENNIS_CACHE,

    keys: result
  };
}

/* =========================================================
   SCHEDULED WORKER
   =========================================================

   6 scheduled refreshes per day:

   00:00 UTC
   04:00 UTC
   08:00 UTC
   12:00 UTC
   16:00 UTC
   20:00 UTC

   Every run:
     ATP fixtures
     WTA fixtures
     Live

   At 08:00:
     Yesterday ATP
     Yesterday WTA

   At 00:00:
     Calendar
     ATP rankings
     WTA rankings

   Visitors NEVER call RapidAPI.
   ========================================================= */

async function scheduled(event, env, ctx) {

  const now =
    new Date();

  const date =
    now.toISOString().slice(0, 10);

  const hour =
    now.getUTCHours();

  ctx.waitUntil(
    (async () => {

      /* -------------------------------
         TODAY ATP + WTA
         ------------------------------- */

      await refreshToday(
        env,
        date
      );

      /* -------------------------------
         LIVE
         ------------------------------- */

      await refreshLive(
        env,
        date
      );

      /* -------------------------------
         YESTERDAY
         08:00 UTC
         ------------------------------- */

      if (hour === 8) {

        const yd =
          previousDate(date);

        await refreshYesterday(
          env,
          yd
        );
      }

      /* -------------------------------
         CALENDAR + RANKINGS
         00:00 UTC
         ------------------------------- */

      if (hour === 0) {

        await Promise.allSettled([

          refreshCalendar(env),

          refreshRankings(
            env,
            "atp"
          ),

          refreshRankings(
            env,
            "wta"
          )
        ]);
      }

    })().catch(() => {})
  );
}

/* =========================================================
   FETCH HANDLER
   ========================================================= */

export default {

  async fetch(request, env) {

    const url =
      new URL(request.url);

    const pathname =
      url.pathname;

    /* --------------------------------
       HEALTH
       -------------------------------- */

    if (
      pathname ===
      "/api/health"
    ) {
      return J(
        await health(env)
      );
    }

    /* --------------------------------
       TODAY
       -------------------------------- */

    if (
      pathname ===
      "/api/today"
    ) {
      return J(
        await today(env)
      );
    }

    /* --------------------------------
       YESTERDAY
       -------------------------------- */

    if (
      pathname ===
      "/api/yesterday"
    ) {
      return J(
        await yesterday(env)
      );
    }

    /* --------------------------------
       CALENDAR
       -------------------------------- */

    if (
      pathname ===
      "/api/calendar"
    ) {
      return J(
        await calendar(env)
      );
    }

    /* --------------------------------
       ATP RANKINGS
       -------------------------------- */

    if (
      pathname ===
      "/api/rankings/atp"
    ) {
      return J(
        await rankings(
          env,
          "atp"
        )
      );
    }

    /* --------------------------------
       WTA RANKINGS
       -------------------------------- */

    if (
      pathname ===
      "/api/rankings/wta"
    ) {
      return J(
        await rankings(
          env,
          "wta"
        )
      );
    }

    /* --------------------------------
       RANKINGS DEBUG
       -------------------------------- */

    if (
      pathname ===
      "/api/rankings-debug"
    ) {
      return J(
        await rankingsDebug(env)
      );
    }

    /* --------------------------------
       GENERAL DEBUG
       -------------------------------- */

    if (
      pathname ===
      "/api/debug"
    ) {
      return J(
        await debug(env)
      );
    }

    /* --------------------------------
       SCHEDULE DEBUG
       -------------------------------- */

    if (
      pathname ===
      "/api/scheduled-debug"
    ) {
      return J(
        await scheduledDebug(env)
      );
    }

    /* --------------------------------
       API NOT FOUND
       -------------------------------- */

    if (
      pathname.startsWith(
        "/api/"
      )
    ) {

      return J(
        {
          error:
            "API endpoint not found",

          version:
            VERSION,

          path:
            pathname
        },
        404
      );
    }

    /* --------------------------------
       STATIC WEBSITE
       -------------------------------- */

    if (
      env.ASSETS &&
      typeof env.ASSETS.fetch ===
        "function"
    ) {

      return env.ASSETS.fetch(
        request
      );
    }

    return new Response(
      "YepTennis",
      {
        status: 200,
        headers: {
          "content-type":
            "text/plain; charset=utf-8"
        }
      }
    );
  },

  scheduled
};