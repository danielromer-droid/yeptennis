/* ============================================================
   YepTennis Worker
   Version: 2026-09-27.12

   Architecture
   ------------------------------------------------------------
   - RapidAPI is used ONLY by scheduled refreshes.
   - Website visitors read KV only.
   - Every scheduled run refreshes:
       ATP today
       WTA today
       ATP live
       WTA live
       ATP yesterday
       WTA yesterday
       ATP rankings
       WTA rankings
       ATP calendar
       WTA calendar
       BBC Tennis news
   - Six scheduled runs per day.
   ============================================================ */

const VERSION = "YepTennis Worker 2026-09-27.12";

const RAPIDAPI_HOST =
  "tennis-api-atp-wta-itf.p.rapidapi.com";

const BBC_TENNIS_RSS =
  "https://feeds.bbci.co.uk/sport/tennis/rss.xml";


/* ============================================================
   DATE HELPERS
   ============================================================ */

function utcDate(offset = 0) {
  const d = new Date();

  d.setUTCDate(
    d.getUTCDate() + offset
  );

  return d
    .toISOString()
    .slice(0, 10);
}


/* ============================================================
   GENERAL HELPERS
   ============================================================ */

function arr(value) {

  if (Array.isArray(value)) {
    return value;
  }

  if (
    value &&
    Array.isArray(value.data)
  ) {
    return value.data;
  }

  if (
    value &&
    Array.isArray(value.results)
  ) {
    return value.results;
  }

  if (
    value &&
    Array.isArray(value.items)
  ) {
    return value.items;
  }

  if (
    value &&
    Array.isArray(value.matches)
  ) {
    return value.matches;
  }

  if (
    value &&
    Array.isArray(value.fixtures)
  ) {
    return value.fixtures;
  }

  return [];
}


function val(
  obj,
  keys,
  fallback = null
) {

  if (
    !obj ||
    typeof obj !== "object"
  ) {
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
   KV
   ============================================================ */

async function getCache(
  env,
  key
) {

  if (!env.TENNIS_CACHE) {
    return null;
  }

  try {

    return await env.TENNIS_CACHE.get(
      key,
      "json"
    );

  } catch (error) {

    console.log(
      "KV GET ERROR",
      key,
      error?.message
    );

    return null;
  }
}


async function putCache(
  env,
  key,
  value
) {

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

    console.log(
      "KV PUT ERROR",
      key,
      error?.message
    );

    return false;
  }
}


/* ============================================================
   RAPIDAPI
   ============================================================ */

async function rapidAPI(
  env,
  path
) {

  if (!env.TENNIS_API_KEY) {
    throw new Error(
      "Missing TENNIS_API_KEY"
    );
  }

  const url =
    `https://${RAPIDAPI_HOST}${path}`;

  const response =
    await fetch(
      url,
      {
        method: "GET",
        headers: {
          "x-rapidapi-key":
            env.TENNIS_API_KEY,

          "x-rapidapi-host":
            RAPIDAPI_HOST
        }
      }
    );

  const text =
    await response.text();

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

function parsePlayer(value) {

  if (
    !value ||
    typeof value !== "object"
  ) {

    return {
      id: null,
      name: "Player",
      country: "",
      rank: null,
      points: 0
    };
  }

  const p =
    value.player ||
    value.Player ||
    value.athlete ||
    value;

  return {

    id:
      val(
        p,
        [
          "id",
          "playerId",
          "playerID"
        ],
        null
      ),

    name:
      val(
        p,
        [
          "name",
          "fullName",
          "playerName",
          "displayName"
        ],
        "Player"
      ),

    country:
      val(
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
        value,
        [
          "position",
          "rank",
          "ranking",
          "currentRank"
        ],
        null
      ),

    points:
      val(
        value,
        [
          "rankingPoints",
          "point",
          "points",
          "pointsCurrent"
        ],
        0
      )
  };
}


/* ============================================================
   MATCH PLAYER
   ============================================================ */

function matchPlayer(value) {

  if (!value) {

    return {
      id: null,
      name: "Player",
      country: ""
    };
  }

  if (
    typeof value === "string"
  ) {

    return {
      id: null,
      name: value,
      country: ""
    };
  }

  const p =
    value.player ||
    value.Player ||
    value.athlete ||
    value;

  return {

    id:
      val(
        p,
        [
          "id",
          "playerId",
          "playerID"
        ],
        null
      ),

    name:
      val(
        p,
        [
          "name",
          "playerName",
          "fullName",
          "displayName"
        ],
        "Player"
      ),

    country:
      val(
        p,
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
   SCORE
   ============================================================ */

function extractScore(m) {

  const score =
    m?.score ||
    m?.Score ||
    {};

  return {

    home:
      val(
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

    away:
      val(
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

function normaliseMatch(
  raw,
  tour
) {

  if (
    !raw ||
    typeof raw !== "object"
  ) {
    return null;
  }

  const p1 =
    raw.homePlayer ||
    raw.player1 ||
    raw.playerA ||
    raw.playerOne ||
    raw.home ||
    raw.player1Data;

  const p2 =
    raw.awayPlayer ||
    raw.player2 ||
    raw.playerB ||
    raw.playerTwo ||
    raw.away ||
    raw.player2Data;

  const tournament =
    raw.tournament ||
    raw.Tournament ||
    {};

  const round =
    raw.round ||
    raw.Round ||
    {};

  return {

    id:
      val(
        raw,
        [
          "id",
          "matchId",
          "fixtureId"
        ],
        null
      ),

    tour:
      String(tour).toUpperCase(),

    date:
      val(
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

    status:
      val(
        raw,
        [
          "status",
          "matchStatus",
          "state"
        ],
        ""
      ),

    statusLong:
      val(
        raw,
        [
          "statusLong",
          "statusName"
        ],
        ""
      ),

    player1:
      matchPlayer(p1),

    player2:
      matchPlayer(p2),

    tournament: {

      id:
        val(
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

      name:
        val(
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

      country:
        val(
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

      id:
        val(
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

      name:
        val(
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

    score:
      extractScore(raw)
  };
}


/* ============================================================
   FIXTURES
   ============================================================ */

async function fetchFixtures(
  env,
  tour,
  date
) {

  const path =
    `/tennis/v2/${tour}/fixtures/${date}` +
    `?filter=PlayerGroup:singles&pageNo=1&pageSize=200`;

  const data =
    await rapidAPI(
      env,
      path
    );

  return arr(data)
    .map(
      m =>
        normaliseMatch(
          m,
          tour
        )
    )
    .filter(Boolean);
}


/* ============================================================
   RESULTS
   ============================================================ */

async function fetchResults(
  env,
  tour,
  date
) {

  const path =
    `/tennis/v2/${tour}/results/${date}/${date}` +
    `?filter=PlayerGroup:singles&pageNo=1&pageSize=200`;

  const data =
    await rapidAPI(
      env,
      path
    );

  return arr(data)
    .map(
      m =>
        normaliseMatch(
          m,
          tour
        )
    )
    .filter(Boolean);
}


/* ============================================================
   LIVE
   ============================================================ */

async function fetchLive(
  env,
  tour
) {

  const path =
    `/tennis/v2/${tour}/fixtures/live` +
    `?filter=PlayerGroup:singles&pageNo=1&pageSize=200`;

  const data =
    await rapidAPI(
      env,
      path
    );

  return arr(data)
    .map(
      m =>
        normaliseMatch(
          m,
          tour
        )
    )
    .filter(Boolean);
}


/* ============================================================
   TODAY CACHE
   ============================================================ */

async function refreshToday(
  env,
  date
) {

  const results =
    await Promise.allSettled([

      fetchFixtures(
        env,
        "atp",
        date
      ),

      fetchFixtures(
        env,
        "wta",
        date
      )
    ]);

  const atp =
    results[0].status === "fulfilled"
      ? results[0].value
      : [];

  const wta =
    results[1].status === "fulfilled"
      ? results[1].value
      : [];

  const updated =
    new Date().toISOString();

  const payload = {

    ok: true,

    version: VERSION,

    date,

    atp,

    wta,

    matches: [
      ...atp,
      ...wta
    ],

    count:
      atp.length +
      wta.length,

    atpCount:
      atp.length,

    wtaCount:
      wta.length,

    updated
  };

  await putCache(
    env,
    `today:${date}`,
    payload
  );

  return payload;
}


/* ============================================================
   YESTERDAY CACHE
   ============================================================ */

async function refreshYesterday(
  env,
  date
) {

  const results =
    await Promise.allSettled([

      fetchResults(
        env,
        "atp",
        date
      ),

      fetchResults(
        env,
        "wta",
        date
      )
    ]);

  const atp =
    results[0].status === "fulfilled"
      ? results[0].value
      : [];

  const wta =
    results[1].status === "fulfilled"
      ? results[1].value
      : [];

  const updated =
    new Date().toISOString();

  const payload = {

    ok: true,

    version: VERSION,

    date,

    atp,

    wta,

    matches: [
      ...atp,
      ...wta
    ],

    count:
      atp.length +
      wta.length,

    atpCount:
      atp.length,

    wtaCount:
      wta.length,

    updated
  };

  await putCache(
    env,
    `yesterday:${date}`,
    payload
  );

  return payload;
}


/* ============================================================
   LIVE CACHE
   ============================================================ */

async function refreshLive(
  env,
  date
) {

  const results =
    await Promise.allSettled([

      fetchLive(
        env,
        "atp"
      ),

      fetchLive(
        env,
        "wta"
      )
    ]);

  const atp =
    results[0].status === "fulfilled"
      ? results[0].value
      : [];

  const wta =
    results[1].status === "fulfilled"
      ? results[1].value
      : [];

  const live = [
    ...atp,
    ...wta
  ];

  const updated =
    new Date().toISOString();

  const payload = {

    ok: true,

    version: VERSION,

    date,

    live,

    count:
      live.length,

    atpCount:
      atp.length,

    wtaCount:
      wta.length,

    updated
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

async function fetchRankings(
  env,
  tour
) {

  const path =
    `/tennis/v2/${tour}/ranking/singles` +
    `?pageNo=1&pageSize=50`;

  const data =
    await rapidAPI(
      env,
      path
    );

  const rows =
    arr(data);

  return rows.map(
    (row, index) => {

      const p =
        row?.player ||
        row?.Player ||
        {};

      return {

        /*
           IMPORTANT:
           Use player.id.

           Do NOT use row.id.
        */

        id:
          val(
            p,
            [
              "id",
              "playerId",
              "playerID"
            ],
            null
          ),

        name:
          val(
            p,
            [
              "name",
              "fullName",
              "playerName",
              "displayName"
            ],
            "Player"
          ),

        country:
          val(
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
              "points",
              "pointsCurrent"
            ],
            0
          )
      };
    }
  );
}


async function refreshRankings(
  env
) {

  const results =
    await Promise.allSettled([

      fetchRankings(
        env,
        "atp"
      ),

      fetchRankings(
        env,
        "wta"
      )
    ]);

  const atp =
    results[0].status === "fulfilled"
      ? results[0].value
      : [];

  const wta =
    results[1].status === "fulfilled"
      ? results[1].value
      : [];

  const updated =
    new Date().toISOString();

  await putCache(
    env,
    "rankings:atp",
    {
      ok: true,
      version: VERSION,
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
      version: VERSION,
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

async function fetchCalendar(
  env,
  tour,
  year
) {

  const path =
    `/tennis/v2/${tour}/tournament/calendar/${year}` +
    `?pageNo=1&pageSize=200`;

  const data =
    await rapidAPI(
      env,
      path
    );

  return arr(data);
}


async function refreshCalendar(
  env,
  year
) {

  const results =
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
    results[0].status === "fulfilled"
      ? results[0].value
      : [];

  const wta =
    results[1].status === "fulfilled"
      ? results[1].value
      : [];

  const updated =
    new Date().toISOString();

  const payload = {

    ok: true,

    version: VERSION,

    year,

    atp,

    wta,

    count:
      atp.length +
      wta.length,

    atpCount:
      atp.length,

    wtaCount:
      wta.length,

    updated
  };

  await putCache(
    env,
    `calendar:${year}`,
    payload
  );

  return payload;
}


/* ============================================================
   BBC NEWS
   ============================================================ */

function decodeXML(
  value
) {

  if (!value) {
    return "";
  }

  return value

    .replace(
      /<!\[CDATA\[([\s\S]*?)\]\]>/g,
      "$1"
    )

    .replace(
      /&amp;/g,
      "&"
    )

    .replace(
      /&lt;/g,
      "<"
    )

    .replace(
      /&gt;/g,
      ">"
    )

    .replace(
      /&quot;/g,
      '"'
    )

    .replace(
      /&#39;/g,
      "'"
    )

    .replace(
      /&#x27;/g,
      "'"
    )

    .replace(
      /&#(\d+);/g,
      (_, n) =>
        String.fromCharCode(
          Number(n)
        )
    );
}


function stripHTML(
  value
) {

  if (!value) {
    return "";
  }

  return decodeXML(value)

    .replace(
      /<br\s*\/?>/gi,
      " "
    )

    .replace(
      /<\/p>/gi,
      " "
    )

    .replace(
      /<[^>]*>/g,
      ""
    )

    .replace(
      /\s+/g,
      " "
    )

    .trim();
}


function xmlValue(
  block,
  tag
) {

  const regex =
    new RegExp(
      `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
      "i"
    );

  const match =
    block.match(regex);

  return match
    ? decodeXML(
        match[1].trim()
      )
    : "";
}


function xmlAttribute(
  block,
  tag,
  attribute
) {

  const regex =
    new RegExp(
      `<${tag}\\b[^>]*\\b${attribute}=["']([^"']+)["'][^>]*>`,
      "i"
    );

  const match =
    block.match(regex);

  return match
    ? decodeXML(match[1])
    : "";
}


function extractNewsImage(
  block,
  description
) {

  let image =
    xmlAttribute(
      block,
      "media:content",
      "url"
    );

  if (image) {
    return image;
  }

  image =
    xmlAttribute(
      block,
      "media:thumbnail",
      "url"
    );

  if (image) {
    return image;
  }

  image =
    xmlAttribute(
      block,
      "enclosure",
      "url"
    );

  if (image) {
    return image;
  }

  const img =
    decodeXML(
      description || ""
    ).match(
      /<img[^>]+src=["']([^"']+)["']/i
    );

  if (
    img &&
    img[1]
  ) {
    return img[1];
  }

  return "";
}


function parseBBCNews(
  xml
) {

  if (!xml) {
    return [];
  }

  const blocks =
    xml.match(
      /<item\b[\s\S]*?<\/item>/gi
    ) || [];

  const articles = [];

  for (
    const block of blocks
  ) {

    const title =
      stripHTML(
        xmlValue(
          block,
          "title"
        )
      );

    const link =
      xmlValue(
        block,
        "link"
      );

    const pubDate =
      xmlValue(
        block,
        "pubDate"
      );

    const description =
      xmlValue(
        block,
        "description"
      );

    const image =
      extractNewsImage(
        block,
        description
      );

    if (
      !title ||
      !link
    ) {
      continue;
    }

    articles.push({

      title,

      link,

      pubDate,

      description:
        stripHTML(
          description
        ),

      image,

      source:
        "BBC Sport"
    });
  }

  return articles.slice(
    0,
    20
  );
}


async function refreshNews(
  env
) {

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

      version: VERSION,

      source:
        "BBC Sport",

      articles,

      count:
        articles.length,

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

      version: VERSION,

      source:
        "BBC Sport",

      articles: [],

      count: 0,

      updated: null,

      error:
        error?.message ||
        "BBC RSS error"
    };
  }
}


/* ============================================================
   VISITOR DATA
   ============================================================ */

async function getToday(
  env
) {

  const date =
    utcDate(0);

  const today =
    await getCache(
      env,
      `today:${date}`
    );

  const live =
    await getCache(
      env,
      `live:${date}`
    );

  if (!today) {

    return {

      ok: true,

      version: VERSION,

      date,

      atp: [],

      wta: [],

      matches: [],

      live:
        live?.live || [],

      count: 0,

      atpCount: 0,

      wtaCount: 0,

      liveCount:
        live?.count || 0,

      cached: false,

      updated: null
    };
  }

  return {

    ...today,

    live:
      live?.live || [],

    liveCount:
      live?.count || 0,

    cached: true
  };
}


async function getYesterday(
  env
) {

  const date =
    utcDate(-1);

  const data =
    await getCache(
      env,
      `yesterday:${date}`
    );

  if (!data) {

    return {

      ok: true,

      version: VERSION,

      date,

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


async function getRankings(
  env,
  tour
) {

  const data =
    await getCache(
      env,
      `rankings:${tour}`
    );

  if (!data) {

    return {

      ok: true,

      version: VERSION,

      tour:
        tour.toUpperCase(),

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


async function getCalendar(
  env
) {

  const year =
    new Date()
      .getUTCFullYear();

  const data =
    await getCache(
      env,
      `calendar:${year}`
    );

  if (!data) {

    return {

      ok: true,

      version: VERSION,

      year,

      atp: [],

      wta: [],

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


async function getNews(
  env
) {

  const data =
    await getCache(
      env,
      "news:bbc"
    );

  if (!data) {

    return {

      ok: true,

      version: VERSION,

      source:
        "BBC Sport",

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
   HEALTH
   ============================================================ */

async function health(
  env
) {

  const today =
    utcDate(0);

  const yesterday =
    utcDate(-1);

  const year =
    new Date()
      .getUTCFullYear();

  const [
    todayData,
    liveData,
    yesterdayData,
    calendarData,
    atpRanking,
    wtaRanking,
    newsData
  ] = await Promise.all([

    getCache(
      env,
      `today:${today}`
    ),

    getCache(
      env,
      `live:${today}`
    ),

    getCache(
      env,
      `yesterday:${yesterday}`
    ),

    getCache(
      env,
      `calendar:${year}`
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

    date: today,

    cacheConfigured:
      !!env.TENNIS_CACHE,

    rapidApiConfigured:
      !!env.TENNIS_API_KEY,

    today: {

      cached:
        !!todayData,

      count:
        todayData?.count || 0,

      atpCount:
        todayData?.atpCount || 0,

      wtaCount:
        todayData?.wtaCount || 0,

      updated:
        todayData?.updated || null
    },

    live: {

      cached:
        !!liveData,

      count:
        liveData?.count || 0,

      atpCount:
        liveData?.atpCount || 0,

      wtaCount:
        liveData?.wtaCount || 0,

      updated:
        liveData?.updated || null
    },

    yesterday: {

      date: yesterday,

      cached:
        !!yesterdayData,

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

      cached:
        !!calendarData,

      count:
        calendarData?.count || 0,

      atpCount:
        calendarData?.atpCount || 0,

      wtaCount:
        calendarData?.wtaCount || 0,

      updated:
        calendarData?.updated || null
    },

    rankings: {

      atp: {

        cached:
          !!atpRanking,

        count:
          atpRanking?.count || 0,

        updated:
          atpRanking?.updated || null
      },

      wta: {

        cached:
          !!wtaRanking,

        count:
          wtaRanking?.count || 0,

        updated:
          wtaRanking?.updated || null
      }
    },

    news: {

      cached:
        !!newsData,

      count:
        newsData?.count || 0,

      updated:
        newsData?.updated || null
    }
  };
}


/* ============================================================
   DEBUG
   ============================================================ */

async function debug(
  env
) {

  const today =
    utcDate(0);

  const yesterday =
    utcDate(-1);

  const year =
    new Date()
      .getUTCFullYear();

  const [
    todayData,
    liveData,
    yesterdayData,
    calendarData,
    atpRanking,
    wtaRanking,
    newsData
  ] = await Promise.all([

    getCache(
      env,
      `today:${today}`
    ),

    getCache(
      env,
      `live:${today}`
    ),

    getCache(
      env,
      `yesterday:${yesterday}`
    ),

    getCache(
      env,
      `calendar:${year}`
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

    date: today,

    today: {

      cached:
        !!todayData,

      count:
        todayData?.count || 0,

      atpCount:
        todayData?.atpCount || 0,

      wtaCount:
        todayData?.wtaCount || 0,

      updated:
        todayData?.updated || null
    },

    live: {

      cached:
        !!liveData,

      count:
        liveData?.count || 0,

      updated:
        liveData?.updated || null
    },

    yesterday: {

      date: yesterday,

      cached:
        !!yesterdayData,

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

      cached:
        !!calendarData,

      count:
        calendarData?.count || 0,

      atpCount:
        calendarData?.atpCount || 0,

      wtaCount:
        calendarData?.wtaCount || 0,

      updated:
        calendarData?.updated || null
    },

    rankings: {

      atp: {

        cached:
          !!atpRanking,

        count:
          atpRanking?.count || 0,

        updated:
          atpRanking?.updated || null,

        first:
          atpRanking?.players?.[0] || null
      },

      wta: {

        cached:
          !!wtaRanking,

        count:
          wtaRanking?.count || 0,

        updated:
          wtaRanking?.updated || null,

        first:
          wtaRanking?.players?.[0] || null
      }
    },

    news: {

      cached:
        !!newsData,

      count:
        newsData?.count || 0,

      updated:
        newsData?.updated || null
    }
  };
}


/* ============================================================
   RANKING DEBUG
   ============================================================ */

async function rankingsDebug(
  env
) {

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

      cached:
        !!atp,

      count:
        atp?.count || 0,

      updated:
        atp?.updated || null,

      first:
        atp?.players?.[0] || null,

      second:
        atp?.players?.[1] || null,

      third:
        atp?.players?.[2] || null
    },

    wta: {

      cached:
        !!wta,

      count:
        wta?.count || 0,

      updated:
        wta?.updated || null,

      first:
        wta?.players?.[0] || null,

      second:
        wta?.players?.[1] || null,

      third:
        wta?.players?.[2] || null
    }
  };
}


/* ============================================================
   SCHEDULED REFRESH
   ============================================================ */

async function scheduledRefresh(
  env,
  controller
) {

  const now =
    new Date();

  const today =
    utcDate(0);

  const yesterday =
    utcDate(-1);

  const year =
    now.getUTCFullYear();

  const cron =
    controller?.cron || "";

  console.log(
    `${VERSION} scheduled refresh`,
    cron,
    today
  );


  /*
     EVERY RUN:

     1. ATP today
     2. WTA today
     3. ATP live
     4. WTA live
     5. ATP yesterday
     6. WTA yesterday
     7. ATP ranking
     8. WTA ranking
     9. ATP calendar
     10. WTA calendar
     11. BBC news

     This deliberately refreshes everything
     every 4 hours.
  */

  const results =
    await Promise.allSettled([

      refreshToday(
        env,
        today
      ),

      refreshLive(
        env,
        today
      ),

      refreshYesterday(
        env,
        yesterday
      ),

      refreshRankings(
        env
      ),

      refreshCalendar(
        env,
        year
      ),

      refreshNews(
        env
      )
    ]);


  console.log(
    `${VERSION} refresh complete`,
    results.map(
      r => r.status
    )
  );
}


/* ============================================================
   JSON RESPONSE
   ============================================================ */

function json(
  data,
  status = 200
) {

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
   HTTP ROUTER
   ============================================================ */

async function handleRequest(
  request,
  env
) {

  const url =
    new URL(request.url);

  const path =
    url.pathname;


  /* HEALTH */

  if (
    path === "/api/health"
  ) {

    return json(
      await health(env)
    );
  }


  /* DEBUG */

  if (
    path === "/api/debug"
  ) {

    return json(
      await debug(env)
    );
  }


  /* RANKING DEBUG */

  if (
    path === "/api/rankings-debug"
  ) {

    return json(
      await rankingsDebug(env)
    );
  }


  /* TODAY */

  if (
    path === "/api/today"
  ) {

    return json(
      await getToday(env)
    );
  }


  /* YESTERDAY */

  if (
    path === "/api/yesterday"
  ) {

    return json(
      await getYesterday(env)
    );
  }


  /* ATP RANKINGS */

  if (
    path === "/api/rankings/atp"
  ) {

    return json(
      await getRankings(
        env,
        "atp"
      )
    );
  }


  /* WTA RANKINGS */

  if (
    path === "/api/rankings/wta"
  ) {

    return json(
      await getRankings(
        env,
        "wta"
      )
    );
  }


  /* CALENDAR */

  if (
    path === "/api/calendar"
  ) {

    return json(
      await getCalendar(env)
    );
  }


  /* BBC NEWS */

  if (
    path === "/api/news"
  ) {

    return json(
      await getNews(env)
    );
  }


  /* API ROOT */

  if (
    path === "/api"
  ) {

    return json({

      ok: true,

      version: VERSION,

      endpoints: [

        "/api/health",

        "/api/debug",

        "/api/today",

        "/api/yesterday",

        "/api/rankings/atp",

        "/api/rankings/wta",

        "/api/calendar",

        "/api/news"
      ]
    });
  }


  /* STATIC WEBSITE */

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
          "text/plain; charset=UTF-8"
      }
    }
  );
}


/* ============================================================
   WORKER
   ============================================================ */

export default {

  async fetch(
    request,
    env
  ) {

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


  async scheduled(
    controller,
    env
  ) {

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