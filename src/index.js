const HOST = "tennis-api-atp-wta-itf.p.rapidapi.com";
const BASE = `https://${HOST}`;


/* =====================================================
   JSON RESPONSE
===================================================== */

const J = (
  x,
  s = 200
) =>
  new Response(
    JSON.stringify(x),
    {
      status: s,
      headers: {
        "content-type":
          "application/json; charset=utf-8",
        "cache-control":
          "no-store"
      }
    }
  );


/* =====================================================
   RAPIDAPI CALL
===================================================== */

async function call(
  path,
  env
) {
  if (!env.TENNIS_API_KEY) {
    throw Error(
      "TENNIS_API_KEY is not configured in Cloudflare."
    );
  }

  const r = await fetch(
    BASE + path,
    {
      headers: {
        "X-RapidAPI-Key":
          env.TENNIS_API_KEY,
        "X-RapidAPI-Host":
          HOST
      }
    }
  );

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


/* =====================================================
   API ARRAY HELPER
===================================================== */

const arr = d => {
  if (Array.isArray(d)) {
    return d;
  }

  if (
    Array.isArray(d?.data)
  ) {
    return d.data;
  }

  if (
    Array.isArray(d?.results)
  ) {
    return d.results;
  }

  if (
    Array.isArray(d?.result)
  ) {
    return d.result;
  }

  return [];
};


/* =====================================================
   VALUE HELPER
===================================================== */

const val = (
  o,
  ks,
  f = ""
) => {
  for (
    const k of ks
  ) {
    if (
      o?.[k] != null &&
      o[k] !== ""
    ) {
      return o[k];
    }
  }

  return f;
};


/* =====================================================
   PLAYER NORMALISATION
===================================================== */

const player = p => {

  if (
    typeof p === "string"
  ) {
    return {
      name: p,
      country: "",
      rank: null,
      points: 0
    };
  }

  return {
    id:
      p?.id ??
      null,

    name:
      val(
        p,
        [
          "name",
          "playerName",
          "fullName"
        ]
      ),

    country:
      val(
        p,
        [
          "countryAcr",
          "country",
          "countryCode"
        ]
      ),

    rank:
      val(
        p,
        [
          "currentRank",
          "rank",
          "ranking"
        ],
        null
      ),

    points:
      val(
        p,
        [
          "points",
          "rankingPoints"
        ],
        0
      )
  };
};


/* =====================================================
   MATCH NORMALISATION

   IMPORTANT:
   Tennis API returns:

   player1: {...}
   player2: {...}
   tournament: {...}
   round: {...}

===================================================== */

function match(
  x,
  tour
) {

  const p1 =
    x?.player1 ||
    x?.home ||
    {};

  const p2 =
    x?.player2 ||
    x?.away ||
    {};

  const tournament =
    x?.tournament ||
    {};

  const round =
    x?.round ||
    {};

  const a =
    player(p1);

  const b =
    player(p2);


  /* -------------------------------------------------
     SCORE
  ------------------------------------------------- */

  let score =
    val(
      x,
      [
        "result",
        "score",
        "scores"
      ],
      ""
    );

  if (
    typeof score === "object"
  ) {
    score =
      val(
        score,
        [
          "score",
          "display"
        ],
        ""
      );
  }


  /* -------------------------------------------------
     LIVE STATUS
  ------------------------------------------------- */

  const live =
    x?.live === true ||
    x?.live === 1 ||
    /live|inplay|in play/i.test(
      String(
        val(
          x,
          [
            "status",
            "matchStatus",
            "state"
          ],
          ""
        )
      )
    );


  /* -------------------------------------------------
     START TIME
  ------------------------------------------------- */

  const start =
    x?.startTime ||
    x?.date ||
    x?.timeGame ||
    "";


  /* -------------------------------------------------
     RETURN NORMALISED MATCH
  ------------------------------------------------- */

  return {

    id:
      x?.id ??
      x?.matchId ??
      null,

    tour,

    player1:
      a.name || "",

    player2:
      b.name || "",

    player1Id:
      a.id ??
      x?.player1Id ??
      null,

    player2Id:
      b.id ??
      x?.player2Id ??
      null,

    country1:
      a.country || "",

    country2:
      b.country || "",

    rank1:
      a.rank ??
      null,

    rank2:
      b.rank ??
      null,

    seed1:
      x?.seed1 ??
      "",

    seed2:
      x?.seed2 ??
      "",

    score:
      score || "",

    status:
      live
        ? "Live"
        : "Scheduled",

    live,

    tournament:
      tournament.name ||
      x?.tournamentName ||
      "",

    tournamentId:
      tournament.id ??
      x?.tournamentId ??
      null,

    tournamentCountry:
      tournament.countryAcr ||
      tournament.country?.countryAcr ||
      tournament.country?.name ||
      "",

    round:
      round.name ||
      x?.roundName ||
      "",

    roundId:
      round.id ??
      x?.roundId ??
      null,

    start,

    date:
      x?.date ||
      start ||
      ""
  };
}


/* =====================================================
   MASTERS / TOURNAMENT NORMALISATION
===================================================== */

function masters(
  x,
  tour
) {

  const name =
    val(
      x,
      [
        "name",
        "tournamentName"
      ]
    );

  const tier =
    val(
      x,
      [
        "tier",
        "level",
        "category"
      ]
    );

  const rank =
    x?.rank?.name ||
    x?.rankName ||
    "";

  const start =
    val(
      x,
      [
        "date",
        "startDate",
        "start"
      ]
    );

  const end =
    val(
      x,
      [
        "endDate",
        "end"
      ]
    );

  const country =
    x?.country?.name ||
    x?.countryName ||
    x?.countryAcr ||
    "";

  const surface =
    x?.court?.name ||
    x?.surface ||
    "";


  return {

    id:
      x?.id ??
      x?.tournamentId ??
      null,

    name,

    tour,

    tier:
      tier ||
      rank,

    start,

    end,

    country,

    surface,

    isMasters:
      /masters|1000/i.test(
        `${name} ${tier} ${rank}`
      )
  };
}


/* =====================================================
   TODAY'S MATCHES
===================================================== */

async function today(
  env
) {

  const d =
    new Date()
      .toISOString()
      .slice(0, 10);


  const [
    a,
    w,
    l
  ] =
    await Promise.allSettled(
      [

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

      ]
    );


  let matches = [];


  /* -------------------------------------------------
     ATP
  ------------------------------------------------- */

  if (
    a.status ===
    "fulfilled"
  ) {

    matches.push(
      ...arr(a.value)
        .map(
          x =>
            match(
              x,
              "atp"
            )
        )
    );
  }


  /* -------------------------------------------------
     WTA
  ------------------------------------------------- */

  if (
    w.status ===
    "fulfilled"
  ) {

    matches.push(
      ...arr(w.value)
        .map(
          x =>
            match(
              x,
              "wta"
            )
        )
    );
  }


  /* -------------------------------------------------
     LIVE MATCHES
  ------------------------------------------------- */

  if (
    l.status ===
    "fulfilled"
  ) {

    for (
      const x
      of arr(l.value)
    ) {

      const p1 =
        val(
          x,
          [
            "player1",
            "player1Name"
          ]
        );

      const p2 =
        val(
          x,
          [
            "player2",
            "player2Name"
          ]
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

        found.live =
          true;

        found.status =
          "Live";

        found.score =
          val(
            x,
            ["score"],
            found.score
          );
      }
    }
  }


  /* -------------------------------------------------
     SORT BY START TIME
  ------------------------------------------------- */

  matches.sort(
    (a, b) => {

      const da =
        a.start
          ? new Date(a.start).getTime()
          : Number.MAX_SAFE_INTEGER;

      const db =
        b.start
          ? new Date(b.start).getTime()
          : Number.MAX_SAFE_INTEGER;

      return da - db;
    }
  );


  return {
    ok: true,
    date: d,
    count: matches.length,
    matches
  };
}


/* =====================================================
   TOURNAMENT CALENDAR
===================================================== */

async function calendar(
  env
) {

  const y =
    new Date()
      .getUTCFullYear();


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


  const tournaments = [

    ...arr(a.value || a)
      .map(
        x =>
          masters(
            x,
            "atp"
          )
      ),

    ...arr(w.value || w)
      .map(
        x =>
          masters(
            x,
            "wta"
          )
      )

  ]
    .filter(
      x =>
        x.isMasters &&
        x.start
    )
    .sort(
      (a, b) =>
        new Date(a.start) -
        new Date(b.start)
    );


  return {
    ok: true,
    year: y,
    tournaments
  };
}


/* =====================================================
   RSS XML PARSER
===================================================== */

function xml(
  xmlText,
  source
) {

  return [
    ...xmlText.matchAll(
      /<item\b[\s\S]*?<\/item>/gi
    )
  ]

    .map(
      m =>
        m[0]
    )

    .map(
      item => {

        const clean =
          s =>
            String(s)
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
                /&apos;/g,
                "'"
              );


        const get =
          tag => {

            const m =
              item.match(
                new RegExp(
                  `<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
                  "i"
                )
              );

            return m
              ? clean(
                  m[1]
                ).trim()
              : "";
          };


        const linkMatch =
          item.match(
            /<link>([\s\S]*?)<\/link>/i
          );


        const link =
          linkMatch
            ? clean(
                linkMatch[1]
              )
            : "";


        const date =
          get("pubDate") ||
          get("published");


        return {

          title:
            get("title"),

          link,

          source,

          dateLabel:
            date
              ? new Date(
                  date
                ).toLocaleDateString(
                  "en-GB",
                  {
                    day:
                      "numeric",
                    month:
                      "short"
                  }
                )
              : ""
        };
      }
    )

    .filter(
      x =>
        x.title &&
        x.link
    );
}


/* =====================================================
   NEWS
===================================================== */

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
    const [
      url,
      source
    ]
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

        const text =
          await r.text();

        out.push(
          ...xml(
            text,
            source
          )
        );
      }

    } catch {
      /* Continue with other news source */
    }
  }


  return {
    ok: true,
    items: out
  };
}


/* =====================================================
   HEALTH
===================================================== */

function health(
  env
) {

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


/* =====================================================
   WORKER
===================================================== */

export default {

  async fetch(
    req,
    env
  ) {

    const u =
      new URL(req.url);


    try {

      /* -----------------------------------------------
         HEALTH
      ----------------------------------------------- */

      if (
        u.pathname ===
        "/api/health"
      ) {

        return J(
          health(env)
        );
      }


      /* -----------------------------------------------
         TODAY
      ----------------------------------------------- */

      if (
        u.pathname ===
        "/api/today"
      ) {

        return J(
          await today(env)
        );
      }


      /* -----------------------------------------------
         CALENDAR
      ----------------------------------------------- */

      if (
        u.pathname ===
        "/api/calendar"
      ) {

        return J(
          await calendar(env)
        );
      }


      /* -----------------------------------------------
         RANKINGS
      ----------------------------------------------- */

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


        const d =
          await call(
            `/tennis/v2/${tour}/ranking/singles?pageNo=1&pageSize=50`,
            env
          );


        return J({

          ok: true,

          tour,

          players:
            arr(d)
              .map(
                (p, i) => {

                  const item =
                    player(p);

                  return {
                    ...item,

                    rank:
                      item.rank ||
                      i + 1
                  };
                }
              )

        });
      }


      /* -----------------------------------------------
         NEWS
      ----------------------------------------------- */

      if (
        u.pathname ===
        "/api/news"
      ) {

        return J(
          await news()
        );
      }


      /* -----------------------------------------------
         UNKNOWN API
      ----------------------------------------------- */

      if (
        u.pathname.startsWith(
          "/api/"
        )
      ) {

        return J(
          {
            ok: false,
            error:
              "API endpoint not found"
          },
          404
        );
      }


      /* -----------------------------------------------
         WEBSITE ASSETS
      ----------------------------------------------- */

      return env.ASSETS.fetch(
        req
      );

    } catch (e) {

      return J(
        {
          ok: false,
          error:
            e?.message ||
            "API error"
        },
        500
      );
    }
  }
};
