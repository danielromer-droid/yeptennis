const VERSION = "YepTennis Worker 2026-09-27.7";

const HOST = "tennis-api-atp-wta-itf.p.rapidapi.com";
const BASE = `https://${HOST}`;

/* =====================================================
   CACHE SETTINGS

   Every one of these is a call that counts against the
   RapidAPI monthly quota. To stay under a free/low plan,
   we cache each endpoint in Cloudflare KV so the upstream
   API is only actually hit once per TTL, no matter how
   many visitors load the site or how often the browser
   polls the worker.

   TODAY_TTL = 12h
   CALENDAR_TTL / RANKINGS_TTL = 24h
   ===================================================== */

const TODAY_TTL = 12 * 60 * 60;
const CALENDAR_TTL = 24 * 60 * 60;
const RANKINGS_TTL = 24 * 60 * 60;
const DEBUG_TTL = TODAY_TTL;
const YESTERDAY_TTL = 48 * 60 * 60;

const J = (x, s = 200) =>
  new Response(JSON.stringify(x), {
    status: s,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });

/* =====================================================
   KV CACHE WRAPPER
   ===================================================== */

async function cached(env, key, ttlSeconds, fetcher) {
  const kv = env.TENNIS_CACHE;

  if (kv) {
    try {
      const hit = await kv.get(key, "json");

      if (hit) {
        return { ...hit, cached: true };
      }
    } catch {
      /* KV read failed */
    }
  }

  const fresh = await fetcher();

  const payload = {
    ...fresh,
    cached: false,
    cachedAt: new Date().toISOString()
  };

  if (kv) {
    try {
      await kv.put(key, JSON.stringify(payload), {
        expirationTtl: ttlSeconds
      });
    } catch {
      /* KV write failed */
    }
  }

  return payload;
}

async function refreshCache(env, key, ttlSeconds, fetcher) {
  const fresh = await fetcher();

  const payload = {
    ...fresh,
    cached: false,
    cachedAt: new Date().toISOString()
  };

  if (env.TENNIS_CACHE) {
    await env.TENNIS_CACHE.put(
      key,
      JSON.stringify(payload),
      {
        expirationTtl: ttlSeconds
      }
    );
  }

  return payload;
}

async function call(path, env) {
  if (!env.TENNIS_API_KEY) {
    throw Error(
      "TENNIS_API_KEY is not configured in Cloudflare."
    );
  }

  const r = await fetch(BASE + path, {
    headers: {
      "X-RapidAPI-Key": env.TENNIS_API_KEY,
      "X-RapidAPI-Host": HOST
    }
  });

  const t = await r.text();

  let d;

  try {
    d = JSON.parse(t);
  } catch {
    d = {};
  }

  if (!r.ok) {
    throw Error(
      d.message ||
      d.error ||
      `Tennis API HTTP ${r.status}`
    );
  }

  return d;
}

const arr = d => {
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(d?.results)) return d.results;
  if (Array.isArray(d?.result)) return d.result;
  if (Array.isArray(d?.players)) return d.players;
  if (Array.isArray(d?.rankings)) return d.rankings;
  if (Array.isArray(d?.data?.players)) {
    return d.data.players;
  }
  if (Array.isArray(d?.data?.rankings)) {
    return d.data.rankings;
  }
  if (Array.isArray(d?.data?.results)) {
    return d.data.results;
  }

  return [];
};

const val = (o, keys, fallback = "") => {
  for (const k of keys) {
    if (
      o?.[k] !== undefined &&
      o?.[k] !== null &&
      o[k] !== ""
    ) {
      return o[k];
    }
  }

  return fallback;
};

const player = p => {
  if (
    p?.player &&
    typeof p.player === "object"
  ) {
    p = {
      ...p.player,
      ...p
    };
  }

  if (typeof p === "string") {
    return {
      name: p,
      country: "",
      rank: null,
      points: 0
    };
  }

  return {
    id: val(
      p,
      ["id", "playerId"],
      null
    ),

    name: val(
      p,
      [
        "name",
        "playerName",
        "fullName"
      ],
      "Player"
    ),

    country: val(
      p,
      [
        "countryAcr",
        "country",
        "countryCode"
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
        "rankingPoints"
      ],
      0
    )
  };
};

function extractScore(x) {
  let score = val(
    x,
    [
      "result",
      "score",
      "scores"
    ],
    ""
  );

  if (
    typeof score === "object" &&
    score !== null
  ) {
    score = val(
      score,
      [
        "score",
        "display",
        "result"
      ],
      ""
    );
  }

  if (Array.isArray(score)) {
    return score;
  }

  return score || "";
}

function match(x, tour) {
  const a = player(
    x.player1 || x.home
  );

  const b = player(
    x.player2 || x.away
  );

  const status = val(
    x,
    [
      "status",
      "matchStatus",
      "state"
    ],
    "Scheduled"
  );

  const tournament =
    typeof x.tournament === "object"
      ? val(
          x.tournament,
          ["name"],
          ""
        )
      : val(
          x,
          ["tournamentName"],
          ""
        );

  const level =
    typeof x.tournament === "object"
      ? val(
          x.tournament,
          [
            "tier",
            "level",
            "category"
          ],
          ""
        )
      : val(
          x,
          [
            "level",
            "tier",
            "category"
          ],
          ""
        );

  const round =
    typeof x.round === "object"
      ? val(
          x.round,
          ["name"],
          ""
        )
      : val(
          x,
          [
            "round",
            "roundName"
          ],
          ""
        );

  const start = val(
    x,
    [
      "startTime",
      "timeGame",
      "date",
      "start"
    ],
    ""
  );

  const status_str = String(status);

  return {
    id: val(
      x,
      [
        "id",
        "matchId"
      ],
      null
    ),

    tour,

    player1: a.name,
    player2: b.name,

    player1Id: a.id,
    player2Id: b.id,

    country1: a.country,
    country2: b.country,

    rank1: a.rank,
    rank2: b.rank,

    score: extractScore(x),

    status: status_str,

    live:
      Boolean(x.live) ||
      /live|inplay|in play/i.test(
        status_str
      ),

    completed:
      /finished|completed|final|ended/i.test(
        status_str
      ),

    tournament,

    tournamentId:
      x.tournament?.id ||
      x.tournamentId ||
      null,

    level,

    round,

    start
  };
}

function masters(x, tour) {
  const name = val(
    x,
    [
      "name",
      "tournamentName"
    ]
  );

  const tier = val(
    x,
    [
      "tier",
      "level",
      "category"
    ]
  );

  const rank =
    x.rank?.name ||
    x.rankName ||
    "";

  return {
    name,

    tour,

    tier:
      tier ||
      rank,

    start: val(
      x,
      [
        "date",
        "startDate",
        "start"
      ]
    ),

    end: val(
      x,
      [
        "endDate",
        "end"
      ]
    ),

    country:
      x.country?.name ||
      x.countryName ||
      "",

    surface:
      x.court?.name ||
      x.surface ||
      "",

    isMasters:
      /masters|1000/i.test(
        `${name} ${tier} ${rank}`
      )
  };
}

/* =====================================================
   TODAY / YESTERDAY

   ATP and WTA are cached separately so a temporary
   failure of one tour never destroys the other tour's
   good cache.
   ===================================================== */

async function fetchTour(
  env,
  d,
  tour
) {
  const path =
    `/tennis/v2/${tour}/fixtures/${d}?include=round,tournament&pageNo=1&pageSize=100&filter=PlayerGroup:singles`;

  const response =
    await call(path, env);

  return {
    ok: true,
    version: VERSION,
    date: d,
    tour,
    count: arr(response).length,
    matches:
      arr(response).map(
        x => match(x, tour)
      )
  };
}

async function fetchLive(env) {
  const response =
    await call(
      `/tennis/v2/extend/api/events/live`,
      env
    );

  return arr(response);
}

async function applyLiveToMatches(
  env,
  matches
) {
  try {
    const liveItems =
      await fetchLive(env);

    for (const x of liveItems) {
      const p1 = val(
        x,
        [
          "player1",
          "player1Name"
        ],
        ""
      );

      const p2 = val(
        x,
        [
          "player2",
          "player2Name"
        ],
        ""
      );

      const found =
        matches.find(
          z =>
            (
              z.player1 === p1 &&
              z.player2 === p2
            ) ||
            (
              z.player1 === p2 &&
              z.player2 === p1
            )
        );

      if (found) {
        found.live = true;
        found.status = "Live";

        const liveScore =
          val(
            x,
            [
              "score",
              "result"
            ],
            ""
          );

        if (liveScore) {
          found.score =
            liveScore;
        }
      }
    }
  } catch {
    // Live data is supplementary.
    // Never discard ATP/WTA data.
  }

  return matches;
}

async function refreshTourCache(
  env,
  d,
  tour,
  ttl = TODAY_TTL
) {
  return refreshCache(
    env,
    `today:${d}:${tour}`,
    ttl,
    () => fetchTour(
      env,
      d,
      tour
    )
  );
}

async function readTourCache(
  env,
  d,
  tour
) {
  if (!env.TENNIS_CACHE) {
    return null;
  }

  try {
    return await env.TENNIS_CACHE.get(
      `today:${d}:${tour}`,
      "json"
    );
  } catch {
    return null;
  }
}

async function buildCombinedDay(
  env,
  d
) {
  let atp =
    await readTourCache(
      env,
      d,
      "atp"
    );

  let wta =
    await readTourCache(
      env,
      d,
      "wta"
    );

  /*
   * If KV is not configured, use RapidAPI
   * directly. With KV configured, visitors
   * never trigger RapidAPI just because a
   * cache is absent.
   */

  if (!env.TENNIS_CACHE) {
    if (!atp) {
      try {
        atp =
          await fetchTour(
            env,
            d,
            "atp"
          );
      } catch (e) {
        atp = {
          ok: false,
          error:
            e.message ||
            String(e),
          matches: []
        };
      }
    }

    if (!wta) {
      try {
        wta =
          await fetchTour(
            env,
            d,
            "wta"
          );
      } catch (e) {
        wta = {
          ok: false,
          error:
            e.message ||
            String(e),
          matches: []
        };
      }
    }
  }

  const matches = [
    ...(atp?.matches || []),
    ...(wta?.matches || [])
  ];

  await applyLiveToMatches(
    env,
    matches
  );

  return {
    ok: true,
    version: VERSION,
    date: d,
    count: matches.length,
    matches,

    atp: {
      cached: Boolean(atp),
      count:
        atp?.matches?.length || 0,
      cachedAt:
        atp?.cachedAt || null,
      error:
        atp?.error || null
    },

    wta: {
      cached: Boolean(wta),
      count:
        wta?.matches?.length || 0,
      cachedAt:
        wta?.cachedAt || null,
      error:
        wta?.error || null
    }
  };
}

async function today(env) {
  const d =
    new Date()
      .toISOString()
      .slice(0, 10);

  return buildCombinedDay(
    env,
    d
  );
}

async function yesterday(env) {
  const d =
    new Date(
      Date.now() -
      24 * 60 * 60 * 1000
    )
      .toISOString()
      .slice(0, 10);

  return buildCombinedDay(
    env,
    d
  );
}

/* =====================================================
   DEBUG
   ===================================================== */

async function debug(env) {
  const d =
    new Date()
      .toISOString()
      .slice(0, 10);

  let atp = null;
  let wta = null;
  let error = null;

  if (env.TENNIS_CACHE) {
    try {
      atp =
        await env.TENNIS_CACHE.get(
          `today:${d}:atp`,
          "json"
        );

      wta =
        await env.TENNIS_CACHE.get(
          `today:${d}:wta`,
          "json"
        );
    } catch (e) {
      error =
        e.message ||
        String(e);
    }
  }

  return {
    ok: true,
    version: VERSION,
    date: d,

    cacheConfigured:
      Boolean(
        env.TENNIS_CACHE
      ),

    cached:
      Boolean(atp || wta),

    atp: {
      cached:
        Boolean(atp),

      count:
        atp?.matches?.length ||
        0,

      cachedAt:
        atp?.cachedAt ||
        null,

      error:
        atp?.error ||
        null
    },

    wta: {
      cached:
        Boolean(wta),

      count:
        wta?.matches?.length ||
        0,

      cachedAt:
        wta?.cachedAt ||
        null,

      error:
        wta?.error ||
        null
    },

    count:
      (atp?.matches?.length || 0) +
      (wta?.matches?.length || 0),

    error
  };
}
/* =====================================================
   BLOCK 2 — API DATA FUNCTIONS
   YepTennis Worker 2026-09-27.7
   ===================================================== */

async function fetchTourFixtures(env, tour, date) {
  const endpoint =
    `/tennis/v2/${tour}/fixtures/${date}` +
    `?include=round,tournament` +
    `&pageNo=1&pageSize=100` +
    `&filter=PlayerGroup:singles`;

  const data = await call(endpoint, env);

  const items = arr(data);

  return items
    .map(item => match(item, tour))
    .filter(Boolean);
}


/* -----------------------------------------------------
   FETCH LIVE EVENTS
   ----------------------------------------------------- */

async function fetchLive(env) {
  const data = await call(
    `/tennis/v2/extend/api/events/live`,
    env
  );

  return arr(data)
    .map(item => {
      try {
        return match(item, "live");
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}


/* -----------------------------------------------------
   FETCH A COMPLETE DAY
   ----------------------------------------------------- */

async function fetchDay(env, date) {
  const results = await Promise.allSettled([
    fetchTourFixtures(env, "atp", date),
    fetchTourFixtures(env, "wta", date)
  ]);

  const atp =
    results[0].status === "fulfilled"
      ? results[0].value
      : [];

  const wta =
    results[1].status === "fulfilled"
      ? results[1].value
      : [];

  return {
    date,
    atp,
    wta,
    count: atp.length + wta.length
  };
}


/* -----------------------------------------------------
   REFRESH ATP CACHE
   ----------------------------------------------------- */

async function refreshATP(env, date, ttl) {
  try {
    const data = await fetchTourFixtures(
      env,
      "atp",
      date
    );

    await putCache(
      env,
      `today:${date}:atp`,
      {
        ok: true,
        date,
        tour: "atp",
        matches: data,
        count: data.length,
        updated: new Date().toISOString()
      },
      ttl
    );

    return {
      ok: true,
      count: data.length
    };

  } catch (error) {

    await putCache(
      env,
      `error:${date}:atp`,
      {
        ok: false,
        tour: "atp",
        error: String(error),
        updated: new Date().toISOString()
      },
      86400
    );

    return {
      ok: false,
      count: 0,
      error: String(error)
    };
  }
}


/* -----------------------------------------------------
   REFRESH WTA CACHE
   ----------------------------------------------------- */

async function refreshWTA(env, date, ttl) {
  try {
    const data = await fetchTourFixtures(
      env,
      "wta",
      date
    );

    await putCache(
      env,
      `today:${date}:wta`,
      {
        ok: true,
        date,
        tour: "wta",
        matches: data,
        count: data.length,
        updated: new Date().toISOString()
      },
      ttl
    );

    return {
      ok: true,
      count: data.length
    };

  } catch (error) {

    await putCache(
      env,
      `error:${date}:wta`,
      {
        ok: false,
        tour: "wta",
        error: String(error),
        updated: new Date().toISOString()
      },
      86400
    );

    return {
      ok: false,
      count: 0,
      error: String(error)
    };
  }
}


/* -----------------------------------------------------
   REFRESH LIVE CACHE
   ----------------------------------------------------- */

async function refreshLive(env, date, ttl) {
  try {

    const data = await fetchLive(env);

    await putCache(
      env,
      `live:${date}`,
      {
        ok: true,
        date,
        matches: data,
        count: data.length,
        updated: new Date().toISOString()
      },
      ttl
    );

    return {
      ok: true,
      count: data.length
    };

  } catch (error) {

    await putCache(
      env,
      `error:${date}:live`,
      {
        ok: false,
        error: String(error),
        updated: new Date().toISOString()
      },
      86400
    );

    return {
      ok: false,
      count: 0,
      error: String(error)
    };
  }
}


/* -----------------------------------------------------
   READ ATP CACHE
   ----------------------------------------------------- */

async function readATP(env, date) {

  const data = await cached(
    env,
    `today:${date}:atp`
  );

  if (!data) {
    return {
      matches: [],
      cached: false,
      count: 0
    };
  }

  return {
    matches: arr(data.matches),
    cached: true,
    count: Number(data.count || 0),
    updated: data.updated || null
  };
}


/* -----------------------------------------------------
   READ WTA CACHE
   ----------------------------------------------------- */

async function readWTA(env, date) {

  const data = await cached(
    env,
    `today:${date}:wta`
  );

  if (!data) {
    return {
      matches: [],
      cached: false,
      count: 0
    };
  }

  return {
    matches: arr(data.matches),
    cached: true,
    count: Number(data.count || 0),
    updated: data.updated || null
  };
}


/* -----------------------------------------------------
   READ LIVE CACHE
   ----------------------------------------------------- */

async function readLive(env, date) {

  const data = await cached(
    env,
    `live:${date}`
  );

  if (!data) {
    return {
      matches: [],
      cached: false,
      count: 0
    };
  }

  return {
    matches: arr(data.matches),
    cached: true,
    count: Number(data.count || 0),
    updated: data.updated || null
  };
}


/* -----------------------------------------------------
   COMBINE CACHED DATA
   IMPORTANT:
   NO RAPIDAPI CALL HERE
   ----------------------------------------------------- */

async function buildCombinedDay(env, date) {

  const [
    atp,
    wta,
    live
  ] = await Promise.all([
    readATP(env, date),
    readWTA(env, date),
    readLive(env, date)
  ]);

  const allMatches = [
    ...atp.matches,
    ...wta.matches
  ];

  return {
    ok: true,
    date,

    matches: allMatches,

    atp: atp.matches,
    wta: wta.matches,
    live: live.matches,

    count: allMatches.length,

    atpCount: atp.count,
    wtaCount: wta.count,
    liveCount: live.count,

    cache: {
      atp: atp.cached,
      wta: wta.cached,
      live: live.cached
    },

    updated: {
      atp: atp.updated,
      wta: wta.updated,
      live: live.updated
    }
  };
}


/* -----------------------------------------------------
   TODAY
   ----------------------------------------------------- */

async function today(env) {

  const date = todayDate();

  return buildCombinedDay(
    env,
    date
  );
}


/* -----------------------------------------------------
   YESTERDAY
   ----------------------------------------------------- */

async function yesterday(env) {

  const date = previousDate(
    todayDate()
  );

  const atp = await cached(
    env,
    `yesterday:${date}:atp`
  );

  const wta = await cached(
    env,
    `yesterday:${date}:wta`
  );

  return {
    ok: true,
    date,

    atp: arr(atp?.matches),
    wta: arr(wta?.matches),

    matches: [
      ...arr(atp?.matches),
      ...arr(wta?.matches)
    ],

    atpCount: arr(atp?.matches).length,
    wtaCount: arr(wta?.matches).length,

    count:
      arr(atp?.matches).length +
      arr(wta?.matches).length
  };
}


/* -----------------------------------------------------
   REFRESH YESTERDAY
   ----------------------------------------------------- */

async function refreshYesterday(
  env,
  date,
  ttl
) {

  const results = await Promise.allSettled([
    fetchTourFixtures(env, "atp", date),
    fetchTourFixtures(env, "wta", date)
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
        date,
        tour: "atp",
        matches: atp,
        count: atp.length,
        updated: new Date().toISOString()
      },
      ttl
    ),

    putCache(
      env,
      `yesterday:${date}:wta`,
      {
        ok: true,
        date,
        tour: "wta",
        matches: wta,
        count: wta.length,
        updated: new Date().toISOString()
      },
      ttl
    )
  ]);

  return {
    ok: true,
    date,
    atpCount: atp.length,
    wtaCount: wta.length,
    count: atp.length + wta.length
  };
}


/* -----------------------------------------------------
   DEBUG
   ----------------------------------------------------- */

async function debug(env) {

  const date = todayDate();

  const [
    atp,
    wta,
    live
  ] = await Promise.all([
    cached(env, `today:${date}:atp`),
    cached(env, `today:${date}:wta`),
    cached(env, `live:${date}`)
  ]);

  return {
    ok: true,

    version: VERSION,

    date,

    cacheConfigured:
      !!env.TENNIS_CACHE,

    atp: {
      cached: !!atp,
      count: arr(atp?.matches).length,
      updated: atp?.updated || null
    },

    wta: {
      cached: !!wta,
      count: arr(wta?.matches).length,
      updated: wta?.updated || null
    },

    live: {
      cached: !!live,
      count: arr(live?.matches).length,
      updated: live?.updated || null
    },

    total:
      arr(atp?.matches).length +
      arr(wta?.matches).length
  };
}
/* =====================================================
   BLOCK 3 — CALENDAR, RANKINGS, SCHEDULED REFRESH
   AND API ROUTING
   YepTennis Worker 2026-09-27.7
   ===================================================== */


/* -----------------------------------------------------
   CALENDAR
   ----------------------------------------------------- */

async function fetchCalendar(env, tour) {

  const endpoint =
    `/tennis/v2/${tour}/calendar` +
    `?pageNo=1&pageSize=100`;

  const data = await call(
    endpoint,
    env
  );

  return arr(data);
}


async function refreshCalendar(
  env,
  tour,
  ttl
) {

  try {

    const data =
      await fetchCalendar(
        env,
        tour
      );

    await putCache(
      env,
      `calendar:${tour}`,
      {
        ok: true,
        tour,
        tournaments: data,
        count: data.length,
        updated:
          new Date().toISOString()
      },
      ttl
    );

    return {
      ok: true,
      tour,
      count: data.length
    };

  } catch (error) {

    await putCache(
      env,
      `error:calendar:${tour}`,
      {
        ok: false,
        tour,
        error: String(error),
        updated:
          new Date().toISOString()
      },
      86400
    );

    return {
      ok: false,
      tour,
      count: 0,
      error: String(error)
    };
  }
}


async function calendar(env) {

  const [
    atp,
    wta
  ] = await Promise.all([
    cached(env, "calendar:atp"),
    cached(env, "calendar:wta")
  ]);

  return {
    ok: true,

    atp: arr(atp?.tournaments),
    wta: arr(wta?.tournaments),

    atpCount:
      arr(atp?.tournaments).length,

    wtaCount:
      arr(wta?.tournaments).length,

    updated: {
      atp: atp?.updated || null,
      wta: wta?.updated || null
    }
  };
}


/* -----------------------------------------------------
   RANKINGS
   ----------------------------------------------------- */

async function fetchRankings(
  env,
  tour
) {

  const endpoint =
    `/tennis/v2/${tour}/ranking/singles` +
    `?pageNo=1&pageSize=50`;

  const data =
    await call(endpoint, env);

  const players =
    arr(data)
      .map((p, i) => {

        const item =
          player(p);

        return {
          ...item,

          rank:
            item.rank ||
            i + 1
        };
      });

  return players;
}


/* -----------------------------------------------------
   REFRESH ATP RANKINGS
   ----------------------------------------------------- */

async function refreshATPRankings(
  env,
  ttl
) {

  try {

    const players =
      await fetchRankings(
        env,
        "atp"
      );

    await putCache(
      env,
      "rankings:atp",
      {
        ok: true,
        tour: "atp",
        players,
        count: players.length,
        updated:
          new Date().toISOString()
      },
      ttl
    );

    return {
      ok: true,
      tour: "atp",
      count: players.length
    };

  } catch (error) {

    await putCache(
      env,
      "error:rankings:atp",
      {
        ok: false,
        tour: "atp",
        error: String(error),
        updated:
          new Date().toISOString()
      },
      86400
    );

    return {
      ok: false,
      tour: "atp",
      count: 0,
      error: String(error)
    };
  }
}


/* -----------------------------------------------------
   REFRESH WTA RANKINGS
   ----------------------------------------------------- */

async function refreshWTARankings(
  env,
  ttl
) {

  try {

    const players =
      await fetchRankings(
        env,
        "wta"
      );

    await putCache(
      env,
      "rankings:wta",
      {
        ok: true,
        tour: "wta",
        players,
        count: players.length,
        updated:
          new Date().toISOString()
      },
      ttl
    );

    return {
      ok: true,
      tour: "wta",
      count: players.length
    };

  } catch (error) {

    await putCache(
      env,
      "error:rankings:wta",
      {
        ok: false,
        tour: "wta",
        error: String(error),
        updated:
          new Date().toISOString()
      },
      86400
    );

    return {
      ok: false,
      tour: "wta",
      count: 0,
      error: String(error)
    };
  }
}


/* -----------------------------------------------------
   READ RANKINGS
   ----------------------------------------------------- */

async function rankings(
  env,
  tour
) {

  const key =
    `rankings:${tour}`;

  const data =
    await cached(
      env,
      key
    );

  return {
    ok: true,

    tour,

    players:
      arr(data?.players),

    count:
      arr(data?.players).length,

    cached:
      !!data,

    updated:
      data?.updated || null
  };
}


/* -----------------------------------------------------
   RANKINGS DEBUG
   ----------------------------------------------------- */

async function rankingsDebug(
  env
) {

  const [
    atp,
    wta,
    atpError,
    wtaError
  ] = await Promise.all([
    cached(env, "rankings:atp"),
    cached(env, "rankings:wta"),
    cached(env, "error:rankings:atp"),
    cached(env, "error:rankings:wta")
  ]);

  return {
    ok: true,

    version: VERSION,

    cacheConfigured:
      !!env.TENNIS_CACHE,

    atp: {
      cached: !!atp,
      count:
        arr(atp?.players).length,
      cachedAt:
        atp?.updated || null,
      error:
        atpError?.error || null
    },

    wta: {
      cached: !!wta,
      count:
        arr(wta?.players).length,
      cachedAt:
        wta?.updated || null,
      error:
        wtaError?.error || null
    }
  };
}


/* -----------------------------------------------------
   SCHEDULED REFRESH
   -----------------------------------------------------

   Six updates per day:

   00:00 UTC
   04:00 UTC
   08:00 UTC
   12:00 UTC
   16:00 UTC
   20:00 UTC

   Each update refreshes:

   ATP fixtures
   WTA fixtures
   Live events

   Additional once-daily data:

   Calendar
   ATP rankings
   WTA rankings

   At 08:00 UTC:

   Yesterday's ATP results
   Yesterday's WTA results
   ----------------------------------------------------- */

async function scheduled(
  event,
  env,
  ctx
) {

  const now =
    new Date();

  const date =
    now.toISOString()
      .slice(0, 10);

  const hour =
    now.getUTCHours();

  ctx.waitUntil(
    (async () => {

      /* -----------------------------------------------
         1. TODAY ATP
         ----------------------------------------------- */

      const atp =
        await refreshATP(
          env,
          date,
          TODAY_TTL
        );


      /* -----------------------------------------------
         2. TODAY WTA
         ----------------------------------------------- */

      const wta =
        await refreshWTA(
          env,
          date,
          TODAY_TTL
        );


      /* -----------------------------------------------
         3. LIVE EVENTS
         ----------------------------------------------- */

      const live =
        await refreshLive(
          env,
          date,
          TODAY_TTL
        );


      /* -----------------------------------------------
         4. YESTERDAY RESULTS
         08:00 UTC ONLY
         ----------------------------------------------- */

      let yesterdayResult =
        null;

      if (hour === 8) {

        const yesterdayDate =
          previousDate(date);

        yesterdayResult =
          await refreshYesterday(
            env,
            yesterdayDate,
            YESTERDAY_TTL
          );
      }


      /* -----------------------------------------------
         5. CALENDAR + RANKINGS
         00:00 UTC ONLY
         ----------------------------------------------- */

      let calendarResult =
        null;

      let atpRankingResult =
        null;

      let wtaRankingResult =
        null;

      if (hour === 0) {

        /*
          Use allSettled so a failure of one
          endpoint does NOT prevent the other
          endpoints from updating.
        */

        const results =
          await Promise.allSettled([

            refreshCalendar(
              env,
              "atp",
              CALENDAR_TTL
            ),

            refreshCalendar(
              env,
              "wta",
              CALENDAR_TTL
            ),

            refreshATPRankings(
              env,
              RANKINGS_TTL
            ),

            refreshWTARankings(
              env,
              RANKINGS_TTL
            )

          ]);

        calendarResult = {
          atp:
            results[0].status ===
            "fulfilled"
              ? results[0].value
              : {
                  ok: false,
                  error:
                    String(
                      results[0].reason
                    )
                },

          wta:
            results[1].status ===
            "fulfilled"
              ? results[1].value
              : {
                  ok: false,
                  error:
                    String(
                      results[1].reason
                    )
                }
        };


        atpRankingResult =
          results[2].status ===
          "fulfilled"
            ? results[2].value
            : {
                ok: false,
                error:
                  String(
                    results[2].reason
                  )
              };


        wtaRankingResult =
          results[3].status ===
          "fulfilled"
            ? results[3].value
            : {
                ok: false,
                error:
                  String(
                    results[3].reason
                  )
              };
      }


      /* -----------------------------------------------
         SAVE LAST SCHEDULED STATUS
         ----------------------------------------------- */

      await putCache(
        env,
        "scheduled:last",
        {
          ok: true,

          version: VERSION,

          date,

          hour,

          updated:
            new Date().toISOString(),

          today: {
            atp,
            wta,
            live
          },

          yesterday:
            yesterdayResult,

          calendar:
            calendarResult,

          rankings: {
            atp:
              atpRankingResult,
            wta:
              wtaRankingResult
          }
        },

        86400
      );

    })().catch(async error => {

      try {

        await putCache(
          env,
          "scheduled:error",
          {
            ok: false,

            version: VERSION,

            error:
              String(error),

            updated:
              new Date().toISOString()
          },

          86400
        );

      } catch {
        /* Do nothing */
      }
    })
  );
}


/* -----------------------------------------------------
   SCHEDULE DEBUG
   ----------------------------------------------------- */

async function scheduledDebug(
  env
) {

  const data =
    await cached(
      env,
      "scheduled:last"
    );

  const error =
    await cached(
      env,
      "scheduled:error"
    );

  return {
    ok: true,

    version: VERSION,

    last:
      data || null,

    error:
      error || null
  };
}


/* -----------------------------------------------------
   API RESPONSE HELPERS
   ----------------------------------------------------- */

function jsonResponse(
  data,
  status = 200
) {

  return new Response(
    JSON.stringify(
      data,
      null,
      2
    ),
    {
      status,

      headers: {
        "content-type":
          "application/json; charset=utf-8",

        "cache-control":
          "no-store"
      }
    }
  );
}


/* -----------------------------------------------------
   MAIN FETCH HANDLER
   ----------------------------------------------------- */

async function fetch(
  request,
  env,
  ctx
) {

  const url =
    new URL(request.url);

  const pathname =
    url.pathname;


  /* -----------------------------------------------
     API ROUTES
     ----------------------------------------------- */

  if (
    pathname === "/api/health"
  ) {

    return jsonResponse({
      ok: true,

      service:
        "YepTennis",

      version:
        VERSION,

      apiConfigured:
        !!env.TENNIS_API_KEY,

      cacheConfigured:
        !!env.TENNIS_CACHE,

      host:
        RAPIDAPI_HOST,

      time:
        new Date().toISOString()
    });
  }


  if (
    pathname === "/api/today"
  ) {

    return jsonResponse(
      await today(env)
    );
  }


  if (
    pathname === "/api/yesterday"
  ) {

    return jsonResponse(
      await yesterday(env)
    );
  }


  if (
    pathname === "/api/calendar"
  ) {

    return jsonResponse(
      await calendar(env)
    );
  }


  if (
    pathname === "/api/rankings/atp"
  ) {

    return jsonResponse(
      await rankings(
        env,
        "atp"
      )
    );
  }


  if (
    pathname === "/api/rankings/wta"
  ) {

    return jsonResponse(
      await rankings(
        env,
        "wta"
      )
    );
  }


  if (
    if (pathname === "/api/rankings/atp") {
  return jsonResponse(
    await rankings(env, "atp")
  );
}

if (pathname === "/api/rankings/wta") {
  return jsonResponse(
    await rankings(env, "wta")
  );
}
    pathname === "/api/rankings-debug"
  ) {

    return jsonResponse(
      await rankingsDebug(env)
    );
  }


  if (
    pathname === "/api/debug"
  ) {

    return jsonResponse(
      await debug(env)
    );
  }


  if (
    pathname === "/api/scheduled-debug"
  ) {

    return jsonResponse(
      await scheduledDebug(env)
    );
  }


  /* -----------------------------------------------
     API 404
     ----------------------------------------------- */

  if (
    pathname.startsWith("/api/")
  ) {

    return jsonResponse(
      {
        ok: false,

        error:
          "API endpoint not found",

        path:
          pathname
      },
      404
    );
  }


  /* -----------------------------------------------
     STATIC WEBSITE
     ----------------------------------------------- */

  if (
    env.ASSETS
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
}


/* =====================================================
   WORKER EXPORT
   ===================================================== */

export default {

  async fetch(
    request,
    env,
    ctx
  ) {

    return fetch(
      request,
      env,
      ctx
    );
  },


  async scheduled(
    event,
    env,
    ctx
  ) {

    return scheduled(
      event,
      env,
      ctx
    );
  }

};
