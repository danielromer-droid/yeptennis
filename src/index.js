const VERSION = "YepTennis Worker 2026-09-28.2";

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
    const err = Error(
      d.message ||
      d.error ||
      `Tennis API HTTP ${r.status}`
    );
    err.status = r.status;
    throw err;
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

/* Build one match row from either API shape:
   - FIXTURES rows: schedule; `result` empty until played; `live` holds the
     in-progress score; player1 is just the first-listed player.
   - RESULTS rows: finished; `result` is the score; player1 is the WINNER.
   `kind` tells us which one we were given. `levels` is an optional
   tournamentId -> category lookup built from the calendar. */

function match(x, tour, kind = "fixture", levels = null) {
  const a = player(x.player1 || x.home);
  const b = player(x.player2 || x.away);

  const t =
    x.tournament && typeof x.tournament === "object"
      ? x.tournament
      : {};

  const tournamentId =
    t.id || x.tournamentId || null;

  const tournament =
    val(t, ["name"], "") ||
    val(x, ["tournamentName"], "");

  const level =
    val(t, ["tier", "level", "category"], "") ||
    t.rank?.name ||
    t.round?.name ||
    val(x, ["level", "tier", "category"], "");

  const round =
    x.round && typeof x.round === "object"
      ? val(x.round, ["name"], "")
      : val(x, ["round", "roundName"], "");

  const start = val(
    x,
    ["startTime", "date", "timeGame", "start"],
    ""
  );

  const resultText =
    typeof x.result === "string" ? x.result.trim() : "";

  const liveText =
    typeof x.live === "string" ? x.live.trim() : "";

  const finished =
    kind === "result" ||
    (Boolean(resultText) && !liveText);

  const isLive =
    !finished &&
    (Boolean(liveText) ||
      /live|inplay|in play/i.test(String(x.status || "")));

  let status = "Scheduled";

  if (finished) {
    const rt = String(x.result_type || "").toLowerCase();
    status =
      rt === "retired" ? "Retired"
      : rt === "walkover" ? "Walkover"
      : rt === "default" ? "Default"
      : "Completed";
  }
  else if (isLive) {
    status = "Live";
  }

  const category =
    (levels && tournamentId && levels[tournamentId]) ||
    classify(tournament, level) ||
    (t.rankId === 4 ? "Grand Slam" : t.rankId === 3 ? "1000" : "");

  return {
    id: val(x, ["matchId", "id"], null),

    tour,

    player1: a.name,
    player2: b.name,

    player1Id: a.id,
    player2Id: b.id,

    country1: a.country,
    country2: b.country,

    rank1: a.rank,
    rank2: b.rank,

    seed1: x.seed1 || "",
    seed2: x.seed2 || "",

    // 1 = player1 won (results rows only)
    winner: finished ? 1 : 0,

    score: finished ? resultText : (liveText || ""),

    status,

    live: isLive,

    completed: finished,

    tournament,

    tournamentId,

    level,

    category,

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

  const startDate = val(
    x,
    ["date", "startDate", "start", "dateStart", "startTime"]
  );

  const rankId = x.rankId || x.rank?.id || null;

  const category =
    classify(name, `${tier || ""} ${rank || ""} ${x.round?.name || ""}`) ||
    (rankId === 4 ? "Grand Slam" : rankId === 3 ? "1000" : "");

  // The API stores no end date. Slams and Masters run ~2 weeks,
  // everything else one tennis week (Mon-Sun).
  const spanDays = category === "Grand Slam" || category === "1000" ? 13 : 6;

  const computedEnd =
    startDate
      ? new Date(new Date(startDate).getTime() + spanDays * 86400000)
          .toISOString()
          .slice(0, 10)
      : "";

  return {
    id: x.id || null,

    name,

    tour,

    tier:
      tier ||
      rank,

    category,

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

    end: val(x, ["endDate", "end"]) || computedEnd,

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

/* tournamentId -> category ("Grand Slam" / "1000" / "500" / "250"),
   read from the cached calendar. Lets us tag 500 vs 250 correctly,
   because match rows only carry a tournament id and name. */

async function levelLookup(env) {
  const y = new Date().getUTCFullYear();
  const cal = await readGood(env, `calendar2:${y}`);
  const out = { ...(cal?.levelIds || {}) };

  for (const t of cal?.tournaments || []) {
    if (t.id && t.category) out[t.id] = t.category;
  }

  return out;
}

const CATEGORY_ORDER = {
  "Grand Slam": 0,
  "Finals": 1,
  "1000": 2,
  "500": 3,
  "250": 4
};

const listPath = (tour, kind, d) =>
  `/tennis/v2/${tour}/${kind}/${d}?pageNo=1&pageSize=500&filter=PlayerGroup:singles`;

/* Results rows are asked with include=round,tournament so we get the
   tournament name and round. If the API rejects the parameter, retry
   plain - the rows still carry scores. */
async function callResults(tour, d, env) {
  try {
    return await call(listPath(tour, "results", d) + "&include=round,tournament", env);
  }
  catch (e) {
    if (e.status === 400 || e.status === 422) {
      return call(listPath(tour, "results", d), env);
    }
    throw e;
  }
}

/* One day of matches.
   - Past days: the RESULTS endpoint (finished matches, real scores).
   - Today: RESULTS (finished so far) + FIXTURES (scheduled and in
     progress; `live` holds the running score), de-duplicated.
   Fixtures alone never held final scores - that is why old days looked
   empty. */

async function fetchToday(env, d) {

  const isToday =
    d === new Date().toISOString().slice(0, 10);

  const jobs = [
    callResults("atp", d, env),
    callResults("wta", d, env)
  ];

  if (isToday) {
    jobs.push(
      call(listPath("atp", "fixtures", d) + "&include=round,tournament", env),
      call(listPath("wta", "fixtures", d) + "&include=round,tournament", env)
    );
  }

  const [ra, rw, fa, fw] = await Promise.allSettled(jobs);

  const levels = await levelLookup(env);

  const rows = [];
  const seen = new Set();

  const add = (settled, tour, kind) => {
    if (!settled || settled.status !== "fulfilled") return;

    for (const x of arr(settled.value)) {
      const m = match(x, tour, kind, levels);

      // results win over fixtures if a match shows up in both
      const key = m.id ? `${tour}:${m.id}` : null;
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);

      rows.push(m);
    }
  };

  add(ra, "atp", "result");
  add(rw, "wta", "result");
  add(fa, "atp", "fixture");
  add(fw, "wta", "fixture");

  const rankOf = m =>
    m.category in CATEGORY_ORDER ? CATEGORY_ORDER[m.category] : 5;

  const matches =
    rows.sort(
      (p, q) =>
        rankOf(p) - rankOf(q) ||
        String(p.tournament).localeCompare(String(q.tournament)) ||
        Number(q.live) - Number(p.live) ||
        String(p.start).localeCompare(String(q.start))
    );

  const errors =
    [ra, rw, fa, fw]
      .filter(r => r && r.status === "rejected")
      .map(r => String(r.reason?.message || r.reason));

  return {
    ok: true,
    version: VERSION,
    date: d,
    count: matches.length,
    completedCount: matches.filter(m => m.completed).length,
    errors,
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
    `res2:${date}`,
    ttl,
    () => fetchToday(env, date)
  );
}


/* =====================================================
   DEBUG (also cached - it hits the same upstream routes)
   ===================================================== */

async function debug(env) {
  const d = new Date().toISOString().slice(0, 10);
  const key = `res2:${d}`;
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

  // TourRank: 2 = Main tour (250/500), 3 = Masters 1000, 4 = Grand Slam
  // (1 = Challenger/ITF, which we leave out). `since` starts 3 weeks back
  // so events still in progress - and the ones needed to tag recent
  // results with their level - are included.
  const since =
    new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10);

  const q =
    `?pageNo=1&pageSize=300&since=${since}&filter=TourRank:2,3,4`;

  const [a, w] =
    await Promise.allSettled([
      call(`/tennis/v2/atp/tournament/calendar/${y}${q}`, env),
      call(`/tennis/v2/wta/tournament/calendar/${y}${q}`, env)
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

  // every classified event, including ones that already ended, so recent
  // results can still be tagged Grand Slam / 1000 / 500 / 250
  const levelIds = {};
  for (const t of all) {
    if (t.id && t.category) levelIds[t.id] = t.category;
  }

  if (tournaments.length) {
    return {
      year: y,
      source: "api",
      apiCount: all.length,
      levelIds,
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
    `calendar2:${y}`,
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


      // BBC thumbnails come at 240px wide; ask for the 480px version so the
      // wider rectangular image stays sharp.
      if (image && /ichef\.bbci\.co\.uk/.test(image)) {
        image = image.replace(/\/(\d{2,4})\//, (m, w) =>
          Number(w) < 480 ? "/480/" : m
        );
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

      const y = now.getUTCFullYear();

      const jobs = [
        [`calendar2:${y}`, CALENDAR_TTL, () => fetchCalendar(env, y)],
        ["rankings:atp", RANKINGS_TTL, () => fetchRankings(env, "atp")],
        ["rankings:wta", RANKINGS_TTL, () => fetchRankings(env, "wta")]
      ];

      // 1) Calendar + rankings: daily at 00:00 UTC, and retried at
      //    12:00 UTC if missing / only the approximate fallback. Run first,
      //    because the calendar is what tags results as 1000 / 500 / 250.
      for (const [key, ttl, fetcher] of jobs) {
        const due =
          hour === 0 ||
          (hour === 12 && !(await readGood(env, key))) ||
          (key.startsWith("calendar2") && !(await readGood(env, key)) && hour % 8 === 0);

        if (due) {
          await step(() => refreshCache(env, key, ttl, fetcher));
        }
      }

      // 2) Today: finished results + scheduled/in-progress fixtures,
      //    refreshed on every run (6x/day).
      await step(() =>
        refreshCache(env, `res2:${d}`, TODAY_TTL, () => fetchToday(env, d))
      );

      // 3) The previous days (RECENT_DAYS = today + last 3), results only.
      //    Yesterday is re-checked at 00:00 and 08:00 UTC to catch late
      //    finishes; older days are only backfilled when missing/empty.
      for (let offset = 1; offset < RECENT_DAYS; offset++) {
        const dd = dateOffset(now, -offset);
        const key = `res2:${dd}`;

        const force = offset === 1 && (hour === 0 || hour === 8);

        if (force || !(await readGood(env, key))) {
          await step(() =>
            refreshCache(env, key, PAST_RESULTS_TTL, () => fetchToday(env, dd))
          );
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
