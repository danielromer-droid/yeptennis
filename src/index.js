const HOST = "tennis-api-atp-wta-itf.p.rapidapi.com";
const BASE = `https://${HOST}`;

/* =========================================================
   RESPONSE HELPERS
   ========================================================= */

function J(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function jsonError(message, status = 500, extra = {}) {
  return J({
    ok: false,
    error: message,
    ...extra
  }, status);
}

/* =========================================================
   TENNIS API REQUEST
   ========================================================= */

async function call(path, env) {
  if (!env.TENNIS_API_KEY) {
    throw new Error(
      "TENNIS_API_KEY is not configured in Cloudflare."
    );
  }

  const response = await fetch(BASE + path, {
    headers: {
      "X-RapidAPI-Key": env.TENNIS_API_KEY,
      "X-RapidAPI-Host": HOST
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
      data?.message ||
      data?.error ||
      data?.err ||
      `Tennis API HTTP ${response.status}`
    );
  }

  /* Some API errors are returned with HTTP 200 */
  if (data?.error) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : JSON.stringify(data.error)
    );
  }

  if (data?.err) {
    throw new Error(
      typeof data.err === "string"
        ? data.err
        : JSON.stringify(data.err)
    );
  }

  return data;
}

/* =========================================================
   GENERIC DATA EXTRACTION
   ========================================================= */

function arr(value) {
  if (Array.isArray(value)) return value;

  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.result)) return value.result;

  return [];
}

function val(object, keys, fallback = "") {
  for (const key of keys) {
    if (
      object?.[key] !== undefined &&
      object?.[key] !== null &&
      object?.[key] !== ""
    ) {
      return object[key];
    }
  }

  return fallback;
}

/* =========================================================
   PLAYER NORMALISATION
   ========================================================= */

function player(p) {
  if (!p) {
    return {
      id: null,
      name: "",
      country: "",
      countryCode: "",
      rank: null,
      points: 0
    };
  }

  if (typeof p === "string") {
    return {
      id: null,
      name: p,
      country: "",
      countryCode: "",
      rank: null,
      points: 0
    };
  }

  const countryObject =
    typeof p.country === "object"
      ? p.country
      : null;

  return {
    id: val(p, ["id", "playerId", "player_id"], null),

    name: val(
      p,
      ["name", "playerName", "fullName"],
      ""
    ),

    country:
      countryObject?.name ||
      val(p, ["countryName", "country"], ""),

    countryCode:
      countryObject?.acronym ||
      countryObject?.country_acronym ||
      val(
        p,
        ["countryAcr", "countryCode", "country_acronym"],
        ""
      ),

    rank: val(
      p,
      [
        "currentRank",
        "curRank",
        "rank",
        "ranking",
        "position"
      ],
      null
    ),

    points: val(
      p,
      [
        "points",
        "rankingPoints",
        "ranking_points"
      ],
      0
    )
  };
}

/* =========================================================
   MATCH NORMALISATION
   ========================================================= */

function match(x, tour) {
  const p1 = player(
    x.player1 ||
    x.home ||
    x.playerOne
  );

  const p2 = player(
    x.player2 ||
    x.away ||
    x.playerTwo
  );

  let score = val(
    x,
    [
      "result",
      "score",
      "scores"
    ],
    ""
  );

  if (typeof score === "object" && score !== null) {
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

  const status = val(
    x,
    [
      "status",
      "matchStatus",
      "state"
    ],
    "Scheduled"
  );

  const tournamentObject =
    typeof x.tournament === "object"
      ? x.tournament
      : null;

  const tournamentName =
    tournamentObject?.name ||
    x.tournamentName ||
    "";

  const round =
    typeof x.round === "object"
      ? x.round?.name
      : x.round || "";

  return {
    id: val(
      x,
      ["id", "fixtureId"],
      null
    ),

    tour,

    player1: p1.name,
    player2: p2.name,

    player1Id: p1.id,
    player2Id: p2.id,

    country1: p1.countryCode,
    country2: p2.countryCode,

    rank1: p1.rank,
    rank2: p2.rank,

    score: score || "",

    status,

    live: /live|inplay|in play/i.test(
      String(status)
    ),

    tournament: tournamentName,

    round,

    start: val(
      x,
      [
        "start",
        "date",
        "startDate",
        "startTimestamp"
      ],
      ""
    )
  };
}

/* =========================================================
   TODAY'S RESULTS / FIXTURES
   ========================================================= */

async function today(env) {

  /*
     IMPORTANT:
     The Tennis API's current "today" fixtures
     endpoint does NOT require a date in the URL.
  */

  const results = await Promise.allSettled([

    call(
      "/tennis/v2/atp/fixtures" +
      "?filter=PlayerGroup:singles" +
      "&pageNo=1" +
      "&pageSize=500",
      env
    ),

    call(
      "/tennis/v2/wta/fixtures" +
      "?filter=PlayerGroup:singles" +
      "&pageNo=1" +
      "&pageSize=500",
      env
    ),

    call(
      "/tennis/v2/extend/api/events/live",
      env
    )
  ]);

  const matches = [];

  /*
     ATP
  */

  if (results[0].status === "fulfilled") {

    matches.push(
      ...arr(results[0].value).map(
        x => match(x, "atp")
      )
    );
  }

  /*
     WTA
  */

  if (results[1].status === "fulfilled") {

    matches.push(
      ...arr(results[1].value).map(
        x => match(x, "wta")
      )
    );
  }

  /*
     LIVE MATCHES
  */

  let liveMatches = [];

  if (results[2].status === "fulfilled") {

    const liveData = arr(results[2].value);

    liveMatches = liveData.map(x => {

      const p1 = val(
        x,
        ["player1", "player1Name"],
        ""
      );

      const p2 = val(
        x,
        ["player2", "player2Name"],
        ""
      );

      return {
        id: val(x, ["id"], null),

        player1: p1,
        player2: p2,

        score: val(
          x,
          ["score"],
          ""
        ),

        points: val(
          x,
          ["points"],
          ""
        ),

        status: val(
          x,
          ["status"],
          "Live"
        ),

        tour: val(
          x,
          ["tourType"],
          ""
        ),

        live: true,

        startTimestamp: val(
          x,
          ["startTimestamp"],
          null
        )
      };
    });

    /*
       Update the normal fixture list
       with live information.
    */

    for (const live of liveMatches) {

      const found = matches.find(m => {

        const samePlayers =
          (
            m.player1 === live.player1 &&
            m.player2 === live.player2
          ) ||
          (
            m.player1 === live.player2 &&
            m.player2 === live.player1
          );

        return samePlayers;
      });

      if (found) {

        found.live = true;

        found.status = "Live";

        if (live.score) {
          found.score = live.score;
        }

        found.points = live.points;
      }
    }
  }

  const date =
    new Date()
      .toISOString()
      .slice(0, 10);

  return {
    ok: true,
    date,
    matches,
    live: liveMatches,
    count: matches.length,
    liveCount: liveMatches.length
  };
}

/* =========================================================
   TOURNAMENT CALENDAR
   ========================================================= */

function tournament(x, tour) {

  const tournamentObject =
    typeof x.tournament === "object"
      ? x.tournament
      : null;

  const countryObject =
    typeof x.country === "object"
      ? x.country
      : null;

  const courtObject =
    typeof x.court === "object"
      ? x.court
      : null;

  const name =
    val(
      x,
      [
        "name",
        "tournamentName"
      ],
      ""
    );

  const tier =
    val(
      x,
      [
        "tier",
        "level"
      ],
      ""
    );

  const rankId =
    val(
      x,
      [
        "rankId",
        "rank_id"
      ],
      null
    );

  return {

    id: val(
      x,
      ["id", "seasonId"],
      null
    ),

    name:
      tournamentObject?.name ||
      name,

    tour,

    tier,

    rankId,

    start: val(
      x,
      [
        "date",
        "startDate",
        "start"
      ],
      ""
    ),

    end: val(
      x,
      [
        "endDate",
        "end"
      ],
      ""
    ),

    country:
      countryObject?.name ||
      val(
        x,
        ["countryName"],
        ""
      ),

    countryCode:
      countryObject?.acronym ||
      val(
        x,
        ["countryAcr"],
        ""
      ),

    surface:
      courtObject?.name ||
      val(
        x,
        ["surface"],
        ""
      )
  };
}

async function calendar(env) {

  const year =
    new Date()
      .getUTCFullYear();

  const results =
    await Promise.allSettled([

      call(
        `/tennis/v2/atp/tournament/calendar/${year}` +
        "?pageNo=1&pageSize=500",
        env
      ),

      call(
        `/tennis/v2/wta/tournament/calendar/${year}` +
        "?pageNo=1&pageSize=500",
        env
      )
    ]);

  let tournaments = [];

  if (results[0].status === "fulfilled") {

    tournaments.push(
      ...arr(results[0].value).map(
        x => tournament(x, "atp")
      )
    );
  }

  if (results[1].status === "fulfilled") {

    tournaments.push(
      ...arr(results[1].value).map(
        x => tournament(x, "wta")
      )
    );
  }

  /*
     Keep the full ATP/WTA calendar.
     The front end can filter Masters / Grand Slams /
     ATP 1000 / WTA 1000 from tier and rankId.
  */

  tournaments.sort(
    (a, b) =>
      new Date(a.start || 0) -
      new Date(b.start || 0)
  );

  return {
    ok: true,
    year,
    tournaments,
    count: tournaments.length
  };
}

/* =========================================================
   RANKINGS
   ========================================================= */

async function rankings(env, tour) {

  const data = await call(
    `/tennis/v2/${tour}/ranking/singles` +
    "?pageNo=1&pageSize=500",
    env
  );

  const players = arr(data)
    .map((p, index) => {

      const item = player(p);

      return {
        ...item,

        rank:
          item.rank ||
          index + 1
      };
    });

  return {
    ok: true,
    tour,
    players,
    count: players.length
  };
}

/* =========================================================
   PLAYERS
   ========================================================= */

async function players(env, tour) {

  const data = await call(
    `/tennis/v2/${tour}/player` +
    "?pageNo=1&pageSize=500",
    env
  );

  const list = arr(data)
    .map(player);

  return {
    ok: true,
    tour,
    players: list,
    count: list.length
  };
}

/* =========================================================
   PLAYER PROFILE
   ========================================================= */

async function playerProfile(env, tour, id) {

  if (!id) {
    throw new Error(
      "Player ID is required."
    );
  }

  const data = await call(
    `/tennis/v2/${tour}/player/profile/${encodeURIComponent(id)}` +
    "?include=form,ranking,country",
    env
  );

  return {
    ok: true,
    tour,
    player:
      data?.data ||
      data?.result ||
      data
  };
}

/* =========================================================
   SEARCH
   ========================================================= */

async function search(env, query) {

  if (!query) {
    throw new Error(
      "Search query is required."
    );
  }

  const data = await call(
    `/tennis/v2/search?search=${encodeURIComponent(query)}`,
    env
  );

  return {
    ok: true,
    query,
    results:
      data?.data ||
      data?.results ||
      []
  };
}

/* =========================================================
   NEWS
   ========================================================= */

function parseXML(xml, source) {

  const items = [];

  const matches = [
    ...xml.matchAll(
      /<item\b[\s\S]*?<\/item>/gi
    )
  ];

  for (const matchItem of matches) {

    const item = matchItem[0];

    const clean = value =>
      String(value || "")
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
        .replace(
          /&lt;/g,
          "<"
        )
        .replace(
          /&gt;/g,
          ">"
        );

    const getTag = tag => {

      const found =
        item.match(
          new RegExp(
            `<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
            "i"
          )
        );

      return found
        ? clean(found[1]).trim()
        : "";
    };

    let link = "";

    const linkMatch =
      item.match(
        /<link>([\s\S]*?)<\/link>/i
      );

    if (linkMatch) {
      link = clean(
        linkMatch[1]
      );
    }

    const title =
      getTag("title");

    const pubDate =
      getTag("pubDate") ||
      getTag("published");

    if (!title || !link) {
      continue;
    }

    let dateLabel = "";

    if (pubDate) {

      const parsed =
        new Date(pubDate);

      if (!Number.isNaN(
        parsed.getTime()
      )) {

        dateLabel =
          parsed.toLocaleDateString(
            "en-GB",
            {
              day: "numeric",
              month: "short"
            }
          );
      }
    }

    items.push({
      title,
      link,
      source,
      date: pubDate,
      dateLabel
    });
  }

  return items;
}

async function news() {

  const feeds = [

    [
      "https://feeds.bbci.co.uk/sport/tennis/rss.xml",
      "BBC Sport"
    ],

    [
      "https://www.atptour.com/en/media/rss-feed/xml-feed",
      "ATP Tour"
    ]
  ];

  const items = [];

  for (
    const [url, source]
    of feeds
  ) {

    try {

      const response =
        await fetch(
          url,
          {
            headers: {
              "User-Agent":
                "YepTennis/1.0"
            }
          }
        );

      if (!response.ok) {
        continue;
      }

      const xml =
        await response.text();

      items.push(
        ...parseXML(
          xml,
          source
        )
      );

    } catch {
      /*
         Ignore a failed individual
         news feed so the other feed
         can still work.
      */
    }
  }

  /*
     Newest first
  */

  items.sort(
    (a, b) =>
      new Date(b.date || 0) -
      new Date(a.date || 0)
  );

  return {
    ok: true,
    items
  };
}

/* =========================================================
   HEALTH CHECK
   ========================================================= */

async function health(env) {

  return {
    ok: true,
    service: "YepTennis",
    apiConfigured:
      !!env.TENNIS_API_KEY,
    host: HOST,
    time:
      new Date().toISOString()
  };
}

/* =========================================================
   ROUTER
   ========================================================= */

export default {

  async fetch(request, env) {

    const url =
      new URL(request.url);

    const path =
      url.pathname;

    try {

      /*
         HEALTH
      */

      if (
        path === "/api/health"
      ) {

        return J(
          await health(env)
        );
      }

      /*
         TODAY
      */

      if (
        path === "/api/today"
      ) {

        return J(
          await today(env)
        );
      }

      /*
         CALENDAR
      */

      if (
        path === "/api/calendar"
      ) {

        return J(
          await calendar(env)
        );
      }

      /*
         RANKINGS

         /api/rankings?tour=atp
         /api/rankings?tour=wta
      */

      if (
        path === "/api/rankings"
      ) {

        const tour =
          url.searchParams
            .get("tour")
            ?.toLowerCase() === "wta"
            ? "wta"
            : "atp";

        return J(
          await rankings(
            env,
            tour
          )
        );
      }

      /*
         PLAYERS

         /api/players?tour=atp
         /api/players?tour=wta
      */

      if (
        path === "/api/players"
      ) {

        const tour =
          url.searchParams
            .get("tour")
            ?.toLowerCase() === "wta"
            ? "wta"
            : "atp";

        return J(
          await players(
            env,
            tour
          )
        );
      }

      /*
         PLAYER PROFILE

         /api/player?id=68074&tour=atp
      */

      if (
        path === "/api/player"
      ) {

        const tour =
          url.searchParams
            .get("tour")
            ?.toLowerCase() === "wta"
            ? "wta"
            : "atp";

        const id =
          url.searchParams.get(
            "id"
          );

        return J(
          await playerProfile(
            env,
            tour,
            id
          )
        );
      }

      /*
         SEARCH

         /api/search?q=Alcaraz
      */

      if (
        path === "/api/search"
      ) {

        const query =
          url.searchParams.get(
            "q"
          );

        return J(
          await search(
            env,
            query
          )
        );
      }

      /*
         NEWS
      */

      if (
        path === "/api/news"
      ) {

        return J(
          await news()
        );
      }

      /*
         UNKNOWN API
      */

      if (
        path.startsWith("/api/")
      ) {

        return jsonError(
          "API endpoint not found.",
          404
        );
      }

      /*
         WEBSITE

         Everything that is not
         /api/* is served from
         the Cloudflare ASSETS binding.
      */

      return env.ASSETS.fetch(
        request
      );

    } catch (error) {

      return jsonError(
        error?.message ||
        "API error"
      );
    }
  }
};
