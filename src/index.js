/* ============================================================
   YepTennis Worker
   Version: 2026-09-27.11

   Architecture:
   - RapidAPI is used ONLY by scheduled refreshes.
   - Visitors read data from KV.
   - ATP + WTA fixtures/results are cached.
   - ATP + WTA rankings are cached.
   - ATP + WTA calendar is cached.
   - BBC Tennis news is cached in KV.
   - Six scheduled refreshes per day.
   ============================================================ */

const VERSION = "YepTennis Worker 2026-09-27.11";

const RAPIDAPI_HOST =
  "tennis-api-atp-wta-itf.p.rapidapi.com";

const BBC_TENNIS_RSS =
  "https://feeds.bbci.co.uk/sport/tennis/rss.xml";


/* ============================================================
   BASIC HELPERS
   ============================================================ */

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function dateUTC(daysOffset = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysOffset);
  return d.toISOString().slice(0, 10);
}

function arr(value) {
  if (Array.isArray(value)) return value;

  if (value && Array.isArray(value.data)) {
    return value.data;
  }

  if (value && Array.isArray(value.results)) {
    return value.results;
  }

  if (value && Array.isArray(value.items)) {
    return value.items;
  }

  if (value && Array.isArray(value.matches)) {
    return value.matches;
  }

  if (value && Array.isArray(value.fixtures)) {
    return value.fixtures;
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


/* ============================================================
   KV HELPERS
   ============================================================ */

async function getCache(env, key) {
  if (!env.TENNIS_CACHE) {
    return null;
  }

  try {
    const value = await env.TENNIS_CACHE.get(key, "json");
    return value || null;
  } catch (error) {
    console.log("KV GET ERROR", key, error?.message);
    return null;
  }
}

async function putCache(env, key, value) {
  if (!env.TENNIS_CACHE) {
    return false;
  }

  try {
    await env.TENNIS_CACHE.put(
      key,
      JSON.stringify(value)
    );

    return true;
  } catch (error) {
    console.log("KV PUT ERROR", key, error?.message);
    return false;
  }
}


/* ============================================================
   RAPIDAPI
   ============================================================ */

async function callRapidAPI(path, env) {
  if (!env.TENNIS_API_KEY) {
    throw new Error("Missing TENNIS_API_KEY");
  }

  const url =
    `https://${RAPIDAPI_HOST}${path}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "x-rapidapi-key": env.TENNIS_API_KEY,
      "x-rapidapi-host": RAPIDAPI_HOST
    }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `RapidAPI ${response.status}: ${text.slice(0, 500)}`
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      "RapidAPI returned invalid JSON"
    );
  }
}


/* ============================================================
   PLAYER PARSER
   ============================================================ */

function parsePlayer(p) {
  if (!p || typeof p !== "object") {
    return {
      id: null,
      name: "Player",
      country: "",
      rank: null,
      points: 0
    };
  }

  /*
     IMPORTANT:

     Ranking rows from Matchstat contain:

       {
         id: snapshot row ID,
         position: 1,
         rankingPoints: 11500,
         player: {
           id: ...,
           name: ...,
           countryAcr: ...
         }
       }

     Therefore we must NOT use the row "id"
     as the player ID.
  */

  const nested =
    p.player ||
    p.Player ||
    p.athlete ||
    {};

  const playerId =
    val(
      nested,
      [
        "id",
        "playerId",
        "playerID"
      ],
      null
    );

  const name =
    val(
      nested,
      [
        "name",
        "fullName",
        "playerName",
        "displayName"
      ],
      null
    ) ||
    val(
      p,
      [
        "name",
        "fullName",
        "playerName",
        "displayName"
      ],
      "Player"
    );

  const country =
    val(
      nested,
      [
        "countryAcr",
        "country",
        "countryCode",
        "countryCodeAcr"
      ],
      ""
    ) ||
    val(
      p,
      [
        "countryAcr",
        "country",
        "countryCode",
        "countryCodeAcr"
      ],
      ""
    );

  const rank =
    val(
      p,
      [
        "position",
        "rank",
        "ranking",
        "currentRank"
      ],
      null
    );

  const points =
    val(
      p,
      [
        "rankingPoints",
        "point",
        "points",
        "pointsCurrent"
      ],
      0
    );

  return {
    id: playerId,
    name,
    country,
    rank,
    points
  };
}


/* ============================================================
   MATCH PLAYER PARSER
   ============================================================ */

function matchPlayer(value) {
  if (!value) {
    return {
      id: null,
      name: "Player",
      country: ""
    };
  }

  if (typeof value === "string") {
    return {
      id: null,
      name: value,
      country: ""
    };
  }

  const nested =
    value.player ||
    value.Player ||
    value.athlete ||
    value;

  return {
    id: val(
      nested,
      [
        "id",
        "playerId",
        "playerID"
      ],
      null
    ),

    name: val(
      nested,
      [
        "name",
        "playerName",
        "fullName",
        "displayName"
      ],
      "Player"
    ),

    country: val(
      nested,
      [
        "countryAcr",
        "country",
        "countryCode",
        "countryCodeAcr"
      ],
      ""
    )
  };
}


/* ============================================================
   SCORE PARSER
   ============================================================ */

function extractScore(m) {
  const score =
    m.score ||
    m.Score ||
    {};

  return {
    home: val(
      score,
      [
        "home",
        "homeScore",
        "player1",
        "player1Score"
      ],
      val(
        m,
        [
          "homeScore",
          "player1Score"
        ],
        null
      )
    ),

    away: val(
      score,
      [
        "away",
        "awayScore",
        "player2",
        "player2Score"
      ],
      val(
        m,
        [
          "awayScore",
          "player2Score"
        ],
        null
      )
    ),

    sets:
      score.sets ||
      score.periods ||
      m.sets ||
      []
  };
}


/* ============================================================
   MATCH NORMALISATION
   ============================================================ */

function normaliseMatch(raw, tour) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const home =
    raw.homePlayer ||
    raw.player1 ||
    raw.playerA ||
    raw.playerOne ||
    raw.home ||
    raw.player1Data;

  const away =
    raw.awayPlayer ||
    raw.player2 ||
    raw.playerB ||
    raw.playerTwo ||
    raw.away ||
    raw.player2Data;

  const p1 = matchPlayer(home);
  const p2 = matchPlayer(away);

  const tournament =
    raw.tournament ||
    raw.Tournament ||
    {};

  const round =
    raw.round ||
    raw.Round ||
    {};

  const score = extractScore(raw);

  return {
    id: val(
      raw,
      [
        "id",
        "matchId",
        "fixtureId"
      ],
      null
    ),

    tour: String(tour).toUpperCase(),

    date: val(
      raw,
      [
        "date",
        "matchDate",
        "startDate",
        "startTime",
        "start"
      ],
      null
    ),

    status: val(
      raw,
      [
        "status",
        "matchStatus",
        "state"
      ],
      ""
    ),

    statusLong: val(
      raw,
      [
        "statusLong",
        "statusName"
      ],
      ""
    ),

    player1: p1,
    player2: p2,

    tournament: {
      id: val(
        tournament,
        [
          "id",
          "tournamentId"
        ],
        val(
          raw,
          [
            "tournamentId"
          ],
          null
        )
      ),

      name: val(
        tournament,
        [
          "name",
          "tournamentName"
        ],
        val(
          raw,
          [
            "tournamentName"
          ],
          "Tournament"
        )
      ),

      country: val(
        tournament,
        [
          "country",
          "countryAcr",
          "countryCode"
        ],
        ""
      )
    },

    round: {
      id: val(
        round,
        [
          "id",
          "roundId"
        ],
        val(
          raw,
          [
            "roundId"
          ],
          null
        )
      ),

      name: val(
        round,
        [
          "name",
          "roundName"
        ],
        val(
          raw,
          [
            "roundName"
          ],
          ""
        )
      )
    },

    score,

    raw
  };
}


/* ============================================================
   FIXTURES
   ============================================================ */

async function fetchFixtures(env, tour, date) {
  /*
     Correct Matchstat syntax:

     filter=PlayerGroup:singles

     NOT:
     ?PlayerGroup=singles
  */

  const path =
    `/tennis/v2/${tour}/fixtures/${date}` +
    `?filter=PlayerGroup:singles&pageNo=1&pageSize=200`;

  const data =
    await callRapidAPI(path, env);

  return arr(data)
    .map(m => normaliseMatch(m, tour))
    .filter(Boolean);
}


/* ============================================================
   RESULTS
   ============================================================ */

async function fetchResults(env, tour, date) {
  /*
     Results endpoint requires a DATE RANGE.

     Correct:

       /results/2026-09-26/2026-09-26

     Not:

       /results/2026-09-26
  */

  const path =
    `/tennis/v2/${tour}/results/${date}/${date}` +
    `?filter=PlayerGroup:singles&pageNo=1&pageSize=200`;

  const data =
    await callRapidAPI(path, env);

  return arr(data)
    .map(m => normaliseMatch(m, tour))
    .filter(Boolean);
}


/* ============================================================
   LIVE
   ============================================================ */

async function fetchLive(env, tour) {
  const path =
    `/tennis/v2/${tour}/fixtures/live` +
    `?filter=PlayerGroup:singles&pageNo=1&pageSize=200`;

  const data =
    await callRapidAPI(path, env);

  return arr(data)
    .map(m => normaliseMatch(m, tour))
    .filter(Boolean);
}


/* ============================================================
   REFRESH TODAY
   ============================================================ */

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

  const payload = {
    ok: true,
    version: VERSION,
    date,
    atp,
    wta,
    matches: [...atp, ...wta],
    count: atp.length + wta.length,
    atpCount: atp.length,
    wtaCount: wta.length,
    updated: new Date().toISOString()
  };

  await putCache(
    env,
    `today:${date}`,
    payload
  );

  return payload;
}


/* ============================================================
   REFRESH YESTERDAY
   ============================================================ */

async function refreshYesterday(env, date) {
  const [atpResult, wtaResult] =
    await Promise.allSettled([
      fetchResults(env, "atp", date),
      fetchResults(env, "wta", date)
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
    version: VERSION,
    date,
    atp,
    wta,
    matches: [...atp, ...wta],
    count: atp.length + wta.length,
    atpCount: atp.length,
    wtaCount: wta.length,
    updated: new Date().toISOString()
  };

  await putCache(
    env,
    `yesterday:${date}`,
    payload
  );

  return payload;
}


/* ============================================================
   REFRESH LIVE
   ============================================================ */

async function refreshLive(env, date) {
  const [atpResult, wtaResult] =
    await Promise.allSettled([
      fetchLive(env, "atp"),
      fetchLive(env, "wta")
    ]);

  const atp =
    atpResult.status === "fulfilled"
      ? atpResult.value
      : [];

  const wta =
    wtaResult.status === "fulfilled"
      ? wtaResult.value
      : [];

  const live = [...atp, ...wta];

  const payload = {
    ok: true,
    version: VERSION,
    date,
    live,
    count: live.length,
    atpCount: atp.length,
    wtaCount: wta.length,
    updated: new Date().toISOString()
  };

  await putCache(
    env,
    `live:${date}`,
    payload
  );

  return payload;
}


/* ============================================================
   RANKINGS
   ============================================================ */

async function fetchRankings(env, tour) {
  const path =
    `/tennis/v2/${tour}/ranking/singles` +
    `?pageNo=1&pageSize=50`;

  const data =
    await callRapidAPI(path, env);

  const rows = arr(data);

  const players = rows.map(
    (row, index) => {
      const p =
        row?.player ||
        row?.Player ||
        {};

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
            "fullName",
            "playerName",
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

        rank:
          val(
            row,
            [
              "position",
              "rank",
              "ranking"
            ],
            null
          ) ||
          index + 1,

        points:
          val(
            row,
            [
              "rankingPoints",
              "point",
              "points"
            ],
            0
          )
      };
    }
  );

  return players;
}


async function refreshRankings(env) {
  const [atpResult, wtaResult] =
    await Promise.allSettled([
      fetchRankings(env, "atp"),
      fetchRankings(env, "wta")
    ]);

  const atp =
    atpResult.status === "fulfilled"
      ? atpResult.value
      : [];

  const wta =
    wtaResult.status === "fulfilled"
      ? wtaResult.value
      : [];

  const updated =
    new Date().toISOString();

  await putCache(
    env,
    "rankings:atp",
    {
      ok: true,
      tour: "ATP",
      players: atp,
      count: atp.length,
      updated
    }
  );

  await putCache(
    env,
    "rankings:wta",
    {
      ok: true,
      tour: "WTA",
      players: wta,
      count: wta.length,
      updated
    }
  );

  return {
    atp,
    wta,
    updated
  };
}


/* ============================================================
   CALENDAR
   ============================================================ */

async function fetchCalendar(env, tour, year) {
  const path =
    `/tennis/v2/${tour}/tournament/calendar/${year}` +
    `?pageNo=1&pageSize=200`;

  const data =
    await callRapidAPI(path, env);

  return arr(data);
}


async function refreshCalendar(env, year) {
  const [atpResult, wtaResult] =
    await Promise.allSettled([
      fetchCalendar(env, "atp", year),
      fetchCalendar(env, "wta", year)
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
    version: VERSION,
    year,
    atp,
    wta,
    count: atp.length + wta.length,
    atpCount: atp.length,
    wtaCount: wta.length,
    updated: new Date().toISOString()
  };

  await putCache(
    env,
    `calendar:${year}`,
    payload
  );

  return payload;
}


/* ============================================================
   BBC TENNIS NEWS
   ============================================================ */

function decodeXML(value) {
  if (!value) return "";

  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCharCode(Number(n))
    );
}


function stripHTML(value) {
  if (!value) return "";

  return decodeXML(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}


function xmlValue(block, tag) {
  const re =
    new RegExp(
      `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
      "i"
    );

  const match = block.match(re);

  return match
    ? decodeXML(match[1].trim())
    : "";
}


function xmlAttribute(block, tag, attribute) {
  const re =
    new RegExp(
      `<${tag}\\b[^>]*\\b${attribute}=["']([^"']+)["'][^>]*>`,
      "i"
    );

  const match =
    block.match(re);

  return match
    ? decodeXML(match[1])
    : "";
}


function extractNewsImage(block, description) {
  /*
     Try BBC media:content
  */

  let image =
    xmlAttribute(
      block,
      "media:content",
      "url"
    );

  if (image) return image;


  /*
     Try media:thumbnail
  */

  image =
    xmlAttribute(
      block,
      "media:thumbnail",
      "url"
    );

  if (image) return image;


  /*
     Try enclosure
  */

  image =
    xmlAttribute(
      block,
      "enclosure",
      "url"
    );

  if (image) return image;


  /*
     Try an image inside the description.
  */

  const img =
    decodeXML(description || "")
      .match(
        /<img[^>]+src=["']([^"']+)["']/i
      );

  if (img && img[1]) {
    return img[1];
  }

  return "";
}


function parseBBCNews(xml) {
  if (!xml) return [];

  const items = [];

  const itemRegex =
    /<item\b[\s\S]*?<\/item>/gi;

  const blocks =
    xml.match(itemRegex) || [];

  for (const block of blocks) {
    const title =
      stripHTML(
        xmlValue(block, "title")
      );

    const link =
      xmlValue(block, "link");

    const pubDate =
      xmlValue(block, "pubDate");

    const rawDescription =
      xmlValue(block, "description");

    const description =
      stripHTML(rawDescription);

    const image =
      extractNewsImage(
        block,
        rawDescription
      );

    if (!title || !link) {
      continue;
    }

    items.push({
      title,
      link,
      pubDate,
      description,
      image,
      source: "BBC Sport"
    });
  }

  return items.slice(0, 20);
}


async function refreshNews(env) {
  try {
    const response =
      await fetch(
        BBC_TENNIS_RSS,
        {
          headers: {
            "User-Agent":
              "YepTennis/1.0"
          }
        }
      );

    if (!response.ok) {
      throw new Error(
        `BBC RSS ${response.status}`
      );
    }

    const xml =
      await response.text();

    const articles =
      parseBBCNews(xml);

    const payload = {
      ok: true,
      source: "BBC Sport",
      articles,
      count: articles.length,
      updated:
        new Date().toISOString()
    };

    await putCache(
      env,
      "news:bbc",
      payload
    );

    return payload;

  } catch (error) {
    console.log(
      "BBC NEWS ERROR",
      error?.message
    );

    /*
       Do not destroy a previously
       working cache if BBC is temporarily
       unavailable.
    */

    const existing =
      await getCache(
        env,
        "news:bbc"
      );

    if (existing) {
      return existing;
    }

    return {
      ok: false,
      source: "BBC Sport",
      articles: [],
      count: 0,
      updated: null,
      error: error?.message || "BBC RSS error"
    };
  }
}


/* ============================================================
   RESPONSE HELPERS
   ============================================================ */

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=UTF-8",
        "cache-control":
          "no-store"
      }
    }
  );
}


/* ============================================================
   VISITOR ENDPOINTS
   IMPORTANT:
   These endpoints ONLY READ KV.
   They do NOT call RapidAPI.
   ============================================================ */

async function getToday(env) {
  const date =
    todayUTC();

  const data =
    await getCache(
      env,
      `today:${date}`
    );

  if (!data) {
    return {
      ok: true,
      date,
      version: VERSION,
      atp: [],
      wta: [],
      matches: [],
      live: [],
      count: 0,
      atpCount: 0,
      wtaCount: 0,
      liveCount: 0,
      cached: false,
      updated: null
    };
  }

  const live =
    await getCache(
      env,
      `live:${date}`
    );

  return {
    ...data,
    live:
      live?.live || [],
    liveCount:
      live?.count || 0,
    cached: true
  };
}


async function getYesterday(env) {
  const date =
    dateUTC(-1);

  const data =
    await getCache(
      env,
      `yesterday:${date}`
    );

  if (!data) {
    return {
      ok: true,
      date,
      version: VERSION,
      atp: [],
      wta: [],
      matches: [],
      count: 0,
      atpCount: 0,
      wtaCount: 0,
      cached: false,
      updated: null
    };
  }

  return {
    ...data,
    cached: true
  };
}


async function getRankings(env, tour) {
  const data =
    await getCache(
      env,
      `rankings:${tour}`
    );

  if (!data) {
    return {
      ok: true,
      tour: tour.toUpperCase(),
      players: [],
      count: 0,
      cached: false,
      updated: null
    };
  }

  return {
    ...data,
    cached: true
  };
}


async function getCalendar(env) {
  const year =
    new Date().getUTCFullYear();

  const data =
    await getCache(
      env,
      `calendar:${year}`
    );

  if (!data) {
    return {
      ok: true,
      year,
      atp: [],
      wta: [],
      count: 0,
      cached: false,
      updated: null
    };
  }

  return {
    ...data,
    cached: true
  };
}


async function getNews(env) {
  const data =
    await getCache(
      env,
      "news:bbc"
    );

  if (!data) {
    return {
      ok: true,
      source: "BBC Sport",
      articles: [],
      count: 0,
      cached: false,
      updated: null
    };
  }

  return {
    ...data,
    cached: true
  };
}


/* ============================================================
   DEBUG / HEALTH
   ============================================================ */

async function health(env) {
  const date =
    todayUTC();

  const yesterday =
    dateUTC(-1);

  const [
    todayATP,
    todayWTA,
    live,
    yesterdayATP,
    yesterdayWTA,
    calendar,
    rankingsATP,
    rankingsWTA,
    news
  ] = await Promise.all([
    getCache(
      env,
      `today:${date}`
    ),

    getCache(
      env,
      `today:${date}`
    ).then(
      async x => {
        /*
           Today is stored as one combined
           cache object, so this simply
           returns the same cache state.
        */
        return x;
      }
    ),

    getCache(
      env,
      `live:${date}`
    ),

    getCache(
      env,
      `yesterday:${yesterday}`
    ),

    getCache(
      env,
      `yesterday:${yesterday}`
    ),

    getCache(
      env,
      `calendar:${new Date().getUTCFullYear()}`
    ),

    getCache(
      env,
      "rankings:atp"
    ),

    getCache(
      env,
      "rankings:wta"
    ),

    getCache(
      env,
      "news:bbc"
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
      cached: !!todayATP,
      count:
        todayATP?.count || 0,
      updated:
        todayATP?.updated || null
    },

    live: {
      cached: !!live,
      count:
        live?.count || 0,
      updated:
        live?.updated || null
    },

    yesterday: {
      date: yesterday,
      cached: !!yesterdayATP,
      count:
        yesterdayATP?.count || 0,
      updated:
        yesterdayATP?.updated || null
    },

    calendar: {
      cached: !!calendar,
      count:
        calendar?.count || 0,
      updated:
        calendar?.updated || null
    },

    rankings: {
      atp: {
        cached: !!rankingsATP,
        count:
          rankingsATP?.count || 0,
        updated:
          rankingsATP?.updated || null
      },

      wta: {
        cached: !!rankingsWTA,
        count:
          rankingsWTA?.count || 0,
        updated:
          rankingsWTA?.updated || null
      }
    },

    news: {
      cached: !!news,
      count:
        news?.count || 0,
      updated:
        news?.updated || null
    }
  };
}


async function debug(env) {
  const date =
    todayUTC();

  const yesterday =
    dateUTC(-1);

  const [
    today,
    live,
    yesterdayData,
    calendar,
    atpRanking,
    wtaRanking,
    news
  ] = await Promise.all([
    getCache(
      env,
      `today:${date}`
    ),

    getCache(
      env,
      `live:${date}`
    ),

    getCache(
      env,
      `yesterday:${yesterday}`
    ),

    getCache(
      env,
      `calendar:${new Date().getUTCFullYear()}`
    ),

    getCache(
      env,
      "rankings:atp"
    ),

    getCache(
      env,
      "rankings:wta"
    ),

    getCache(
      env,
      "news:bbc"
    )
  ]);

  return {
    ok: true,
    version: VERSION,
    date,

    today: {
      cached: !!today,
      count:
        today?.count || 0,
      atpCount:
        today?.atpCount || 0,
      wtaCount:
        today?.wtaCount || 0,
      updated:
        today?.updated || null
    },

    live: {
      cached: !!live,
      count:
        live?.count || 0,
      updated:
        live?.updated || null
    },

    yesterday: {
      date: yesterday,
      cached: !!yesterdayData,
      count:
        yesterdayData?.count || 0,
      atpCount:
        yesterdayData?.atpCount || 0,
      wtaCount:
        yesterdayData?.wtaCount || 0,
      updated:
        yesterdayData?.updated || null
    },

    calendar: {
      cached: !!calendar,
      count:
        calendar?.count || 0,
      atpCount:
        calendar?.atpCount || 0,
      wtaCount:
        calendar?.wtaCount || 0,
      updated:
        calendar?.updated || null
    },

    rankings: {
      atp: {
        cached: !!atpRanking,
        count:
          atpRanking?.count || 0,
        updated:
          atpRanking?.updated || null
      },

      wta: {
        cached: !!wtaRanking,
        count:
          wtaRanking?.count || 0,
        updated:
          wtaRanking?.updated || null
      }
    },

    news: {
      cached: !!news,
      count:
        news?.count || 0,
      updated:
        news?.updated || null
    }
  };
}


/* ============================================================
   RANKING DEBUG
   ============================================================ */

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
        atp?.count || 0,
      updated:
        atp?.updated || null,
      first:
        atp?.players?.[0] || null,
      second:
        atp?.players?.[1] || null
    },

    wta: {
      cached: !!wta,
      count:
        wta?.count || 0,
      updated:
        wta?.updated || null,
      first:
        wta?.players?.[0] || null,
      second:
        wta?.players?.[1] || null
    }
  };
}


/* ============================================================
   SCHEDULED REFRESH
   ============================================================ */

async function scheduledRefresh(env, controller) {
  const now =
    new Date();

  const date =
    now.toISOString().slice(0, 10);

  /*
     The Worker has six cron runs per day.

     Every run:
       - today's ATP
       - today's WTA
       - live ATP/WTA
       - BBC news

     08:00 UTC:
       - yesterday ATP
       - yesterday WTA

     00:00 UTC:
       - ATP ranking
       - WTA ranking
       - ATP calendar
       - WTA calendar

     We use controller.cron when available.
     This avoids relying on the local hour.
  */

  const cron =
    controller?.cron || "";

  console.log(
    `${VERSION} scheduled run`,
    cron,
    date
  );

  /*
     Always refresh today's fixtures.
  */

  await Promise.allSettled([
    refreshToday(env, date),
    refreshLive(env, date),
    refreshNews(env)
  ]);


  /*
     08:00 UTC cron.

     If your wrangler.json uses:

       0 8 * * *

     this refreshes yesterday.
  */

  if (
    cron === "0 8 * * *" ||
    cron === "0 08 * * *"
  ) {
    await refreshYesterday(
      env,
      dateUTC(-1)
    );
  }


  /*
     Midnight UTC cron.

     Refresh rankings and calendar.
  */

  if (
    cron === "0 0 * * *" ||
    cron === "0 00 * * *"
  ) {
    const year =
      now.getUTCFullYear();

    await Promise.allSettled([
      refreshRankings(env),
      refreshCalendar(env, year)
    ]);
  }

  return {
    ok: true,
    version: VERSION,
    cron,
    date,
    completed:
      new Date().toISOString()
  };
}


/* ============================================================
   HTTP ROUTER
   ============================================================ */

async function handleRequest(request, env) {
  const url =
    new URL(request.url);

  const path =
    url.pathname;


  /* ----------------------------------------------------------
     HEALTH
     ---------------------------------------------------------- */

  if (path === "/api/health") {
    return json(
      await health(env)
    );
  }


  /* ----------------------------------------------------------
     DEBUG
     ---------------------------------------------------------- */

  if (path === "/api/debug") {
    return json(
      await debug(env)
    );
  }


  /* ----------------------------------------------------------
     RANKING DEBUG
     ---------------------------------------------------------- */

  if (
    path === "/api/rankings-debug"
  ) {
    return json(
      await rankingsDebug(env)
    );
  }


  /* ----------------------------------------------------------
     TODAY
     ---------------------------------------------------------- */

  if (path === "/api/today") {
    return json(
      await getToday(env)
    );
  }


  /* ----------------------------------------------------------
     YESTERDAY
     ---------------------------------------------------------- */

  if (path === "/api/yesterday") {
    return json(
      await getYesterday(env)
    );
  }


  /* ----------------------------------------------------------
     RANKINGS
     ---------------------------------------------------------- */

  if (path === "/api/rankings/atp") {
    return json(
      await getRankings(
        env,
        "atp"
      )
    );
  }

  if (path === "/api/rankings/wta") {
    return json(
      await getRankings(
        env,
        "wta"
      )
    );
  }


  /* ----------------------------------------------------------
     CALENDAR
     ---------------------------------------------------------- */

  if (path === "/api/calendar") {
    return json(
      await getCalendar(env)
    );
  }


  /* ----------------------------------------------------------
     BBC NEWS
     ---------------------------------------------------------- */

  if (path === "/api/news") {
    return json(
      await getNews(env)
    );
  }


  /* ----------------------------------------------------------
     API ROOT
     ---------------------------------------------------------- */

  if (path === "/api") {
    return json({
      ok: true,
      version: VERSION,
      endpoints: [
        "/api/health",
        "/api/debug",
        "/api/today",
        "/api/yesterday",
        "/api/calendar",
        "/api/rankings/atp",
        "/api/rankings/wta",
        "/api/news"
      ]
    });
  }


  /* ----------------------------------------------------------
     STATIC WEBSITE
     ---------------------------------------------------------- */

  if (
    env.ASSETS &&
    typeof env.ASSETS.fetch === "function"
  ) {
    return env.ASSETS.fetch(request);
  }


  return new Response(
    "YepTennis",
    {
      status: 200,
      headers: {
        "content-type":
          "text/plain; charset=UTF-8"
      }
    }
  );
}


/* ============================================================
   WORKER EXPORT
   ============================================================ */

export default {

  async fetch(request, env) {
    try {
      return await handleRequest(
        request,
        env
      );
    } catch (error) {

      console.log(
        "FETCH ERROR",
        error?.stack ||
        error?.message ||
        error
      );

      return json(
        {
          ok: false,
          version: VERSION,
          error:
            error?.message ||
            "Internal Worker error"
        },
        500
      );
    }
  },


  async scheduled(controller, env) {
    try {
      await scheduledRefresh(
        env,
        controller
      );
    } catch (error) {

      console.log(
        "SCHEDULED ERROR",
        error?.stack ||
        error?.message ||
        error
      );
    }
  }

};