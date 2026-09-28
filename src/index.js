const VERSION = "YepTennis Worker 2026-09-28.1";

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
const PAST_RESULTS_TTL = 7 * 24 * 60 * 60; // completed days don't change

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

/* An upstream failure (quota reached, timeout...) makes the fetchers
   return an "empty" payload instead of throwing. We must never let one
   of those replace good cached data, and never cache one for long. */

const EMPTY_TTL = 60 * 60; // 1h: retry soon if a fetch came back empty

function isEmptyPayload(p) {
  return (
    !p ||
    (Array.isArray(p.matches) && !p.matches.length) ||
    (Array.isArray(p.tournaments) && !p.tournaments.length) ||
    (Array.isArray(p.players) && !p.players.length) ||
    (Array.isArray(p.items) && !p.items.length)
  );
}

function ttlFor(payload, ttlSeconds) {
  if (isEmptyPayload(payload)) return Math.min(ttlSeconds, EMPTY_TTL);
  if (payload.source === "fallback") return Math.min(ttlSeconds, 4 * 60 * 60);
  return ttlSeconds;
}

async function readGood(env, key) {
  if (!env.TENNIS_CACHE) return null;
  try {
    const hit = await env.TENNIS_CACHE.get(key, "json");
    return hit && !isEmptyPayload(hit) && hit.source !== "fallback" ? hit : null;
  } catch {
    return null;
  }
}

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

  return refreshCache(env, key, ttlSeconds, fetcher);
}

async function refreshCache(env, key, ttlSeconds, fetcher) {
  const fresh = await fetcher();
  const payload = {
    ...fresh,
    cached: false,
    cachedAt: new Date().toISOString()
  };

  if (env.TENNIS_CACHE) {
    try {
      if (isEmptyPayload(payload) || payload.source === "fallback") {
        // keep any previous good snapshot instead of overwriting it
        const prev = await readGood(env, key);
        if (prev) return { ...prev, cached: true, stale: true };
      }

      await env.TENNIS_CACHE.put(key, JSON.stringify(payload), {
        expirationTtl: ttlFor(payload, ttlSeconds)
      });
    } catch {
      /* KV failure is not fatal */
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

const arr = d => {
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(d?.results)) return d.results;
  if (Array.isArray(d?.result)) return d.result;
  if (Array.isArray(d?.players)) return d.players;
  if (Array.isArray(d?.rankings)) return d.rankings;
  if (Array.isArray(d?.data?.players)) return d.data.players;
  if (Array.isArray(d?.data?.rankings)) return d.data.rankings;
  if (Array.isArray(d?.data?.results)) return d.data.results;
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
  if (p?.player && typeof p.player === "object") p = { ...p.player, ...p };

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

/* =====================================================
   TOURNAMENT LEVEL CLASSIFICATION

   Shared by match() and tournamentInfo() so results,
   calendar, and the frontend filters all agree on the
   same set of levels: Grand Slam, Finals, 1000, 500, 250.
   Anything that doesn't match stays "" (unclassified) and
   is left out of the calendar, since it's the "most
   relevant" tiers the site focuses on.
   ===================================================== */

function classify(name, levelRaw) {

  const text =
    `${name || ""} ${levelRaw || ""}`.toLowerCase();

  if (
    /australian open|roland garros|french open|wimbledon|us open|grand slam/
      .test(text)
  ) {
    return "Grand Slam";
  }

  if (/finals/.test(text)) {
    return "Finals";
  }

  if (
    /1000|masters|premier mandatory|premier 5/
      .test(text)
  ) {
    return "1000";
  }

  if (
    /\b500\b|premier\b/
      .test(text)
  ) {
    return "500";
  }

  if (/\b250\b|international/.test(text)) {
    return "250";
  }

  return "";
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

    category:
      classify(tournament, level),

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

    category:
      classify(name, tier || rank),

    start: val(
      x,
      [
        "date",
        "startDate",
        "start",
        "dateStart",
        "startTime"
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
      ""
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

      // live scores only make sense for today; past days are final
      d === new Date().toISOString().slice(0, 10)
        ? call(`/tennis/v2/extend/api/events/live`, env)
        : Promise.resolve(null)

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

  return resultsForDate(env, d);
}


async function yesterday(env) {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  return resultsForDate(env, d);
}


/* =====================================================
   RESULTS FOR ANY DATE

   Today's date gets a 12h TTL (results can still change
   over the day). Any other date is a day that has already
   finished, so its results are final - cache those for a
   full week instead of re-hitting the upstream API for
   dates users are just browsing back through.
   ===================================================== */

async function resultsForDate(env, date) {

  const todayIso = new Date()
    .toISOString()
    .slice(0, 10);

  const ttl =
    date === todayIso
      ? TODAY_TTL
      : PAST_RESULTS_TTL;

  return cached(
    env,
    `results:${date}`,
    ttl,
    () => fetchToday(env, date)
  );
}


/* =====================================================
   DEBUG (also cached - it hits the same upstream routes)
   ===================================================== */

async function debug(env) {
  const d = new Date().toISOString().slice(0, 10);
  const key = `results:${d}`;
  let cachedToday = null;
  let error = null;

  if (env.TENNIS_CACHE) {
    try {
      cachedToday = await env.TENNIS_CACHE.get(key, "json");
    } catch (e) {
      error = e.message || String(e);
    }
  }

  return {
    ok: true,
    version: VERSION,
    date: d,
    cacheConfigured: Boolean(env.TENNIS_CACHE),
    cached: Boolean(cachedToday),
    cachedAt: cachedToday?.cachedAt || null,
    count: cachedToday?.count || 0,
    atpCount: cachedToday?.matches?.filter(x => x.tour === "atp").length || 0,
    wtaCount: cachedToday?.matches?.filter(x => x.tour === "wta").length || 0,
    error
  };
}


/* =====================================================
   CALENDAR (cached, at most 1 upstream refresh/day)
   ===================================================== */

/* Well-known events that appear every year. Used ONLY when the
   live API returns nothing (quota reached, unknown field names...),
   so the section is never blank. Months are approximate. */

const FALLBACK_EVENTS = [
  ["Australian Open", "both", "Grand Slam", "Melbourne, Australia", 1, 1],
  ["Indian Wells Masters", "both", "1000", "California, USA", 3, 3],
  ["Miami Open", "both", "1000", "Florida, USA", 3, 4],
  ["Monte-Carlo Masters", "atp", "1000", "Monaco", 4, 4],
  ["Madrid Open", "both", "1000", "Madrid, Spain", 4, 5],
  ["Italian Open", "both", "1000", "Rome, Italy", 5, 5],
  ["Roland-Garros", "both", "Grand Slam", "Paris, France", 5, 6],
  ["Wimbledon", "both", "Grand Slam", "London, UK", 6, 7],
  ["Canadian Open", "both", "1000", "Toronto / Montreal, Canada", 8, 8],
  ["Cincinnati Open", "both", "1000", "Ohio, USA", 8, 8],
  ["US Open", "both", "Grand Slam", "New York, USA", 8, 9],
  ["China Open (Beijing)", "wta", "1000", "Beijing, China", 9, 10],
  ["Shanghai Masters", "atp", "1000", "Shanghai, China", 10, 10],
  ["Wuhan Open", "wta", "1000", "Wuhan, China", 10, 10],
  ["Paris Masters", "atp", "1000", "Paris, France", 10, 11],
  ["ATP Finals", "atp", "Finals", "Turin, Italy", 11, 11],
  ["WTA Finals", "wta", "Finals", "Riyadh, Saudi Arabia", 11, 11]
];

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fallbackCalendar(y, now = new Date()) {
  const m = now.getUTCMonth() + 1;

  return FALLBACK_EVENTS
    .filter(e => e[5] > m || (e[5] === m && e[4] >= m))
    .map(e => ({
      name: e[0],
      tour: e[1],
      category: e[2],
      tier: e[2],
      country: e[3],
      surface: "",
      start: `${y}-${String(e[4]).padStart(2, "0")}-01`,
      end: "",
      when:
        e[4] === e[5]
          ? MONTHS[e[4] - 1]
          : `${MONTHS[e[4] - 1]} – ${MONTHS[e[5] - 1]}`
    }));
}

async function fetchCalendar(env, y) {

  const [a, w] =
    await Promise.allSettled([
      call(`/tennis/v2/atp/tournament/calendar/${y}?pageNo=1&pageSize=200`, env),
      call(`/tennis/v2/wta/tournament/calendar/${y}?pageNo=1&pageSize=200`, env)
    ]);

  const todayIso =
    new Date().toISOString().slice(0, 10);

  const all = [];

  if (a.status === "fulfilled") {
    all.push(...arr(a.value).map(x => masters(x, "atp")));
  }

  if (w.status === "fulfilled") {
    all.push(...arr(w.value).map(x => masters(x, "wta")));
  }

  const tournaments =
    all
      .filter(
        x =>
          x.category &&
          x.start &&
          (!x.end || String(x.end).slice(0, 10) >= todayIso)
      )
      .sort((p, q) => new Date(p.start) - new Date(q.start));

  const errors = [a, w]
    .filter(r => r.status === "rejected")
    .map(r => String(r.reason?.message || r.reason));

  if (tournaments.length) {
    return {
      year: y,
      source: "api",
      apiCount: all.length,
      tournaments
    };
  }

  return {
    year: y,
    source: "fallback",
    apiCount: all.length,
    errors,
    tournaments: fallbackCalendar(y)
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


/* Trim text to whole words, ending on a sentence if one fits. */
function shorten(text, max = 170) {
  const t = String(text || "").replace(/\s+/g, " ").trim();

  if (t.length <= max) return t;

  const cut = t.slice(0, max);
  const sentence = cut.match(/^(.*[.!?])\s/);

  if (sentence && sentence[1].length > max * 0.5) {
    return sentence[1];
  }

  return cut.replace(/\s+\S*$/, "") + "…";
}


/* =====================================================
   PLAYER BIOS

   A short "few words about the player" line, taken from the
   opening sentence of the player's Wikipedia article and cached
   in KV for 30 days, so each player costs 2 tiny public requests
   once a month and nothing on the RapidAPI quota.
   ===================================================== */

const BIO_TTL = 30 * 24 * 60 * 60;
const BIO_MISS_TTL = 24 * 60 * 60;

async function playerBio(env, rawName) {

  const name =
    String(rawName || "").replace(/\s+/g, " ").trim().slice(0, 60);

  if (!name) return { name: "", summary: "", url: "" };

  const key = `bio:${name.toLowerCase()}`;

  if (env.TENNIS_CACHE) {
    try {
      const hit = await env.TENNIS_CACHE.get(key, "json");
      if (hit) return { ...hit, cached: true };
    } catch {}
  }

  const headers = {
    "User-Agent": "YepTennis/1.0 (https://yeptennis.com)",
    "Accept": "application/json"
  };

  let summary = "";
  let url = "";

  try {

    const s = await fetch(
      "https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&format=json" +
      `&srsearch=${encodeURIComponent(name + " tennis player")}`,
      { headers }
    );

    const title = (await s.json())?.query?.search?.[0]?.title;

    if (title) {

      const r = await fetch(
        "https://en.wikipedia.org/api/rest_v1/page/summary/" +
        encodeURIComponent(title.replace(/ /g, "_")),
        { headers }
      );

      const j = await r.json();

      // only accept it if the article really is about a tennis player
      if (j?.extract && /tennis/i.test(j.extract)) {
        summary = shorten(j.extract, 190);
        url = j.content_urls?.desktop?.page || "";
      }

    }

  } catch {}

  const payload = { name, summary, url, source: "Wikipedia" };

  if (env.TENNIS_CACHE) {
    try {
      await env.TENNIS_CACHE.put(key, JSON.stringify(payload), {
        expirationTtl: summary ? BIO_TTL : BIO_MISS_TTL
      });
    } catch {}
  }

  return payload;
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
            /&#39;|&#x27;|&apos;/g,
            "'"
          )

          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&nbsp;/g, " ")

          .replace(/\s+/g, " ")

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

        description:
          shorten(g("description"), 170),

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


async function news(env) {
  return cached(env, "news:v1", 30 * 60, fetchNews);
}

async function fetchNews() {

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

const RECENT_DAYS = 4; // Today + the last 3 days, kept populated for browsing

function dateOffset(base, days) {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export default {

  /* Cron (every 4 hours): 00,04,08,12,16,20 UTC = six runs a day.
     Every step is isolated, so one upstream failure (e.g. quota)
     never stops the others, and a failed/empty fetch never
     overwrites a good snapshot (see refreshCache). */

  async scheduled(event, env, ctx) {
    const now = new Date();
    const hour = now.getUTCHours();
    const d = now.toISOString().slice(0, 10);

    const step = fn => fn().catch(() => {});

    ctx.waitUntil((async () => {

      // 1) Today's scores + live matches: refreshed on every run (6x/day).
      await step(() =>
        refreshCache(env, `results:${d}`, TODAY_TTL, () => fetchToday(env, d))
      );

      // 2) The previous days (RECENT_DAYS = today + last 3).
      //    Yesterday gets one forced refresh at 08:00 UTC to pick up
      //    matches that were still live at the last "today" snapshot.
      //    Older days are only backfilled when missing/empty, which keeps
      //    RapidAPI usage to about 3 calls per run in steady state.
      for (let offset = 1; offset < RECENT_DAYS; offset++) {
        const dd = dateOffset(now, -offset);
        const key = `results:${dd}`;

        const force = offset === 1 && hour === 8;

        if (force || !(await readGood(env, key))) {
          await step(() =>
            refreshCache(env, key, PAST_RESULTS_TTL, () => fetchToday(env, dd))
          );
        }
      }

      // 3) Calendar + rankings: refreshed daily at 00:00 UTC, and retried
      //    at 12:00 UTC if the cache is missing or only holds the
      //    approximate fallback calendar.
      const y = now.getUTCFullYear();

      const jobs = [
        [`calendar:${y}`, CALENDAR_TTL, () => fetchCalendar(env, y)],
        ["rankings:atp", RANKINGS_TTL, () => fetchRankings(env, "atp")],
        ["rankings:wta", RANKINGS_TTL, () => fetchRankings(env, "wta")]
      ];

      for (const [key, ttl, fetcher] of jobs) {
        const due =
          hour === 0 ||
          (hour === 12 && !(await readGood(env, key)));

        if (due) {
          await step(() => refreshCache(env, key, ttl, fetcher));
        }
      }

    })());
  },

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


      /* YESTERDAY */

      if (u.pathname === "/api/yesterday") {
        return J(await yesterday(env));
      }

      /* RESULTS FOR ANY DATE (?date=YYYY-MM-DD, defaults to today) */

      if (u.pathname === "/api/results") {

        const requested =
          u.searchParams.get("date");

        const todayIso =
          new Date().toISOString().slice(0, 10);

        const date =
          requested &&
          /^\d{4}-\d{2}-\d{2}$/.test(requested)
            ? requested
            : todayIso;

        // never fetch future dates - fixtures for them
        // simply don't exist yet
        if (date > todayIso) {
          return J(
            { error: "date is in the future", version: VERSION },
            400
          );
        }

        return J(await resultsForDate(env, date));

      }

      /* RANKINGS DEBUG */

      if (u.pathname === "/api/rankings-debug") {
        const atp = env.TENNIS_CACHE ? await env.TENNIS_CACHE.get("rankings:atp", "json") : null;
        const wta = env.TENNIS_CACHE ? await env.TENNIS_CACHE.get("rankings:wta", "json") : null;
        return J({
          ok: true,
          version: VERSION,
          cacheConfigured: Boolean(env.TENNIS_CACHE),
          atp: { cached: Boolean(atp), count: atp?.players?.length || 0, cachedAt: atp?.cachedAt || null },
          wta: { cached: Boolean(wta), count: wta?.players?.length || 0, cachedAt: wta?.cachedAt || null }
        });
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


      /* PLAYER BIO (?name=Jannik%20Sinner) */

      if (u.pathname === "/api/player-bio") {
        return J(
          await playerBio(env, u.searchParams.get("name"))
        );
      }

      /* NEWS */

      if (
        u.pathname ===
        "/api/news"
      ) {

        return J(
          await news(env)
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
