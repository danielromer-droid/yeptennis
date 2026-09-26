const VERSION = "YepTennis Worker 2026-09-26.3";

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

   TODAY_TTL = 12h -> at most 2 upstream refreshes/day
   CALENDAR_TTL / RANKINGS_TTL = 24h -> at most 1/day
   ===================================================== */

const TODAY_TTL = 12 * 60 * 60;
const CALENDAR_TTL = 24 * 60 * 60;
const RANKINGS_TTL = 24 * 60 * 60;
const DEBUG_TTL = TODAY_TTL;

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

   If env.TENNIS_CACHE isn't bound yet (not configured in
   wrangler.json / dashboard), this quietly falls back to
   calling the upstream API directly every time, so the
   site still works while you set the KV namespace up.
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
      /* KV read failed - fall through to a live fetch */
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
      /* KV write failed - not fatal, just no caching this round */
    }
  }

  return payload;
}

async function call(path, env) {
  if (!env.TENNIS_API_KEY) {
    throw Error("TENNIS_API_KEY is not configured in Cloudflare.");
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

const arr = d =>
  Array.isArray(d)
    ? d
    : Array.isArray(d?.data)
      ? d.data
      : Array.isArray(d?.results)
        ? d.results
        : Array.isArray(d?.result)
          ? d.result
          : [];

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
  if (typeof p === "string") {
    return {
      name: p,
      country: "",
      rank: null,
      points: 0
    };
  }

  return {
    id: val(p, ["id", "playerId"], null),

    name: val(
      p,
      ["name", "playerName", "fullName"],
      "Player"
    ),

    country: val(
      p,
      ["countryAcr", "country", "countryCode"],
      ""
    ),

    rank: val(
      p,
      ["currentRank", "rank", "ranking"],
      null
    ),

    points: val(
      p,
      ["points", "rankingPoints"],
      0
    )
  };
};

function extractScore(x) {
  let score = val(
    x,
    ["result", "score", "scores"],
    ""
  );

  if (
    typeof score === "object" &&
    score !== null
  ) {
    score = val(
      score,
      ["score", "display", "result"],
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
    ["status", "matchStatus", "state"],
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
          ["tier", "level", "category"],
          ""
        )
      : val(
          x,
          ["level", "tier", "category"],
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
          ["round", "roundName"],
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
      ["id", "matchId"],
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
      /live|inplay|in play/i.test(status_str),

    completed:
      /finished|completed|final|ended/i.test(status_str),

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
    ["name", "tournamentName"]
  );

  const tier = val(
    x,
    ["tier", "level", "category"]
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
   TODAY (cached, at most 2 upstream refreshes/day)
   ===================================================== */

async function fetchToday(env, d) {

  const [
    a,
    w,
    l
  ] =
    await Promise.allSettled([

      call(
        `/tennis/v2/atp/fixtures/${d}?include=round,tournament&pageNo=1&pageSize=100&filter=PlayerGroup:singles`,
        env
      ),

      call(
        `/tennis/v2/wta/fixtures/${d}?include=round,tournament&pageNo=1&pageSize=100&filter=PlayerGroup:singles`,
        env
      ),

      call(
        `/tennis/v2/extend/api/events/live`,
        env
      )

    ]);

  let matches = [];

  if (a.status === "fulfilled") {

    matches.push(
      ...arr(a.value).map(
        x => match(x, "atp")
      )
    );

  }

  if (w.status === "fulfilled") {

    matches.push(
      ...arr(w.value).map(
        x => match(x, "wta")
      )
    );

  }

  if (l.status === "fulfilled") {

    for (
      const x of arr(l.value)
    ) {

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

  }

  return {
    ok: true,
    version: VERSION,
    date: d,
    count: matches.length,
    matches
  };
}

async function today(env) {

  const d = new Date()
    .toISOString()
    .slice(0, 10);

  return cached(
    env,
    `today:${d}`,
    TODAY_TTL,
    () => fetchToday(env, d)
  );
}


/* =====================================================
   DEBUG (also cached - it hits the same upstream routes)
   ===================================================== */

async function fetchDebug(env, d) {

  const atpPath =
    `/tennis/v2/atp/fixtures/${d}?include=round,tournament&pageNo=1&pageSize=100&filter=PlayerGroup:singles`;

  const wtaPath =
    `/tennis/v2/wta/fixtures/${d}?include=round,tournament&pageNo=1&pageSize=100&filter=PlayerGroup:singles`;

  const [
    atp,
    wta
  ] =
    await Promise.allSettled([

      call(
        atpPath,
        env
      ),

      call(
        wtaPath,
        env
      )

    ]);


  return {
    ok: true,

    version: VERSION,

    date: d,

    atp: {
      status: atp.status,

      count:
        atp.status === "fulfilled"
          ? arr(atp.value).length
          : 0,

      first:
        atp.status === "fulfilled"
          ? (
              arr(atp.value)[0] ||
              null
            )
          : null,

      error:
        atp.status === "rejected"
          ? String(
              atp.reason?.message ||
              atp.reason
            )
          : null
    },

    wta: {
      status: wta.status,

      count:
        wta.status === "fulfilled"
          ? arr(wta.value).length
          : 0,

      first:
        wta.status === "fulfilled"
          ? (
              arr(wta.value)[0] ||
              null
            )
          : null,

      error:
        wta.status === "rejected"
          ? String(
              wta.reason?.message ||
              wta.reason
            )
          : null
    }
  };
}

async function debug(env) {

  const d = new Date()
    .toISOString()
    .slice(0, 10);

  return cached(
    env,
    `debug:${d}`,
    DEBUG_TTL,
    () => fetchDebug(env, d)
  );
}


/* =====================================================
   CALENDAR (cached, at most 1 upstream refresh/day)
   ===================================================== */

async function fetchCalendar(env, y) {

  const [
    a,
    w
  ] =
    await Promise.all([

      call(
        `/tennis/v2/atp/tournament/calendar/${y}?pageNo=1&pageSize=200`,
        env
      ),

      call(
        `/tennis/v2/wta/tournament/calendar/${y}?pageNo=1&pageSize=200`,
        env
      )

    ]);

  const todayIso =
    new Date()
      .toISOString()
      .slice(0, 10);

  return {

    year: y,

    tournaments: [

      ...arr(a).map(
        x => masters(x, "atp")
      ),

      ...arr(w).map(
        x => masters(x, "wta")
      )

    ]

      .filter(
        x =>
          x.isMasters &&
          x.start &&
          (!x.end || x.end >= todayIso)
      )

      .sort(
        (a, b) =>
          new Date(a.start) -
          new Date(b.start)
      )

  };
}

async function calendar(env) {

  const y =
    new Date()
      .getUTCFullYear();

  return cached(
    env,
    `calendar:${y}`,
    CALENDAR_TTL,
    () => fetchCalendar(env, y)
  );
}


/* =====================================================
   RANKINGS (cached, at most 1 upstream refresh/day/tour)
   ===================================================== */

async function fetchRankings(env, tour) {

  const d =
    await call(
      `/tennis/v2/${tour}/ranking/singles?pageNo=1&pageSize=50`,
      env
    );

  return {
    players:
      arr(d).map(
        (p, i) => ({

          ...player(p),

          rank:
            player(p).rank ||
            i + 1

        })
      )
  };
}

async function rankings(env, tour) {

  return cached(
    env,
    `rankings:${tour}`,
    RANKINGS_TTL,
    () => fetchRankings(env, tour)
  );
}


/* =====================================================
   RSS NEWS
   ===================================================== */

function xml(xml, source) {

  return [
    ...xml.matchAll(
      /<item\b[\s\S]*?<\/item>/gi
    )
  ]

    .map(
      m => m[0]
    )

    .map(i => {

      const clean = s =>
        s

          .replace(
            /<!\[CDATA\[([\s\S]*?)\]\]>/g,
            "$1"
          )

          .replace(
            /<[^>]+>/g,
            ""
          )

          .replace(
            /&amp;/g,
            "&"
          )

          .replace(
            /&quot;/g,
            '"'
          )

          .replace(
            /&#39;/g,
            "'"
          )

          .trim();


      const g = t => {

        const m =
          i.match(
            new RegExp(
              `<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`,
              "i"
            )
          );

        return m
          ? clean(m[1])
          : "";

      };


      let link =
        (
          i.match(
            /<link>([\s\S]*?)<\/link>/i
          ) || []
        )[1] || "";


      let date =
        g("pubDate") ||
        g("published");


      let image = "";


      const mediaContent =
        i.match(
          /<media:content[^>]+url=["']([^"']+)["']/i
        );


      const mediaThumbnail =
        i.match(
          /<media:thumbnail[^>]+url=["']([^"']+)["']/i
        );


      const enclosure =
        i.match(
          /<enclosure[^>]+url=["']([^"']+)["']/i
        );


      if (mediaContent) {

        image =
          mediaContent[1];

      }
      else if (mediaThumbnail) {

        image =
          mediaThumbnail[1];

      }
      else if (enclosure) {

        image =
          enclosure[1];

      }


      if (!image) {

        const description =
          g("description");

        const img =
          description.match(
            /<img[^>]+src=["']([^"']+)["']/i
          );

        if (img) {
          image =
            img[1];
        }

      }


      return {

        title:
          g("title"),

        link:
          clean(link),

        source,

        dateLabel:
          date
            ? new Date(date)
                .toLocaleDateString(
                  "en-GB",
                  {
                    day: "numeric",
                    month: "short"
                  }
                )
            : "",

        image

      };

    })

    .filter(
      x =>
        x.title &&
        x.link
    );
}


async function news() {

  const urls = [

    [
      "https://feeds.bbci.co.uk/sport/tennis/rss.xml",
      "BBC Sport"
    ],

    [
      "https://www.atptour.com/en/media/rss-feed/xml-feed",
      "ATP Tour"
    ]

  ];


  const out = [];


  for (
    const [url, source]
    of urls
  ) {

    try {

      const r =
        await fetch(
          url,
          {
            headers: {
              "User-Agent":
                "YepTennis/1.0"
            }
          }
        );


      if (r.ok) {

        out.push(
          ...xml(
            await r.text(),
            source
          )
        );

      }

    }
    catch {}

  }


  return {
    items: out
  };

}


/* =====================================================
   WORKER
   ===================================================== */

export default {

  async fetch(req, env) {

    const u =
      new URL(req.url);


    try {

      /* HEALTH */

      if (
        u.pathname ===
        "/api/health"
      ) {

        return J({

          ok: true,

          service:
            "YepTennis",

          version:
            VERSION,

          apiConfigured:
            Boolean(
              env.TENNIS_API_KEY
            ),

          cacheConfigured:
            Boolean(
              env.TENNIS_CACHE
            ),

          host:
            HOST,

          time:
            new Date()
              .toISOString()

        });

      }


      /* DEBUG */

      if (
        u.pathname ===
        "/api/debug"
      ) {

        return J(
          await debug(env)
        );

      }


      /* TODAY */

      if (
        u.pathname ===
        "/api/today"
      ) {

        return J(
          await today(env)
        );

      }


      /* CALENDAR */

      if (
        u.pathname ===
        "/api/calendar"
      ) {

        return J(
          await calendar(env)
        );

      }


      /* RANKINGS */

      if (
        u.pathname ===
        "/api/rankings"
      ) {

        const tour =
          u.searchParams.get(
            "tour"
          ) === "wta"
            ? "wta"
            : "atp";


        return J(
          await rankings(env, tour)
        );

      }


      /* NEWS */

      if (
        u.pathname ===
        "/api/news"
      ) {

        return J(
          await news()
        );

      }


      /* UNKNOWN API */

      if (
        u.pathname.startsWith(
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
              u.pathname

          },
          404
        );

      }


      /* WEBSITE */

      return env.ASSETS.fetch(req);

    }


    catch (e) {

      return J(

        {

          error:
            e.message ||
            "API error",

          version:
            VERSION

        },

        500

      );

    }

  }

};
