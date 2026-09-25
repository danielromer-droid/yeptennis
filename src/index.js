const HOST = "tennis-api-atp-wta-itf.p.rapidapi.com";
const BASE = `https://${HOST}`;


/* =========================================================
   JSON RESPONSE
========================================================= */

const J = (data, status = 200) =>
  new Response(
    JSON.stringify(data),
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


/* =========================================================
   API CALL
========================================================= */

async function call(path, env) {

  if (!env.TENNIS_API_KEY) {
    throw new Error(
      "TENNIS_API_KEY is not configured in Cloudflare."
    );
  }

  const response = await fetch(
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

  const text =
    await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data.message ||
      data.error ||
      `Tennis API HTTP ${response.status}`
    );
  }

  return data;
}


/* =========================================================
   ARRAY HELPER
========================================================= */

function arr(data) {

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.data)) {
    return data.data;
  }

  if (Array.isArray(data?.results)) {
    return data.results;
  }

  if (Array.isArray(data?.result)) {
    return data.result;
  }

  return [];
}


/* =========================================================
   VALUE HELPER
========================================================= */

function val(
  object,
  keys,
  fallback = ""
) {

  for (const key of keys) {

    if (
      object?.[key] !== null &&
      object?.[key] !== undefined &&
      object?.[key] !== ""
    ) {
      return object[key];
    }
  }

  return fallback;
}


/* =========================================================
   PLAYER
========================================================= */

function player(p) {

  if (typeof p === "string") {

    return {
      id: null,
      name: p,
      country: "",
      rank: "",
      points: 0
    };
  }

  return {

    id:
      val(
        p,
        [
          "id",
          "playerId"
        ],
        null
      ),

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
        ]
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
}


/* =========================================================
   MATCH NORMALISATION
========================================================= */

function match(x, tour) {

  const a =
    player(
      x.player1 ||
      x.home ||
      x.player1Name
    );

  const b =
    player(
      x.player2 ||
      x.away ||
      x.player2Name
    );


  let score =
    val(
      x,
      [
        "result",
        "score",
        "scores"
      ]
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


  const status =
    val(
      x,
      [
        "status",
        "matchStatus",
        "state"
      ],
      "Scheduled"
    );


  const tournament =
    x.tournament?.name ||
    x.tournamentName ||
    "";


  const round =
    x.round?.name ||
    x.roundName ||
    "";


  const start =
    x.startTime ||
    x.timeGame ||
    x.date ||
    x.start ||
    "";


  return {

    id:
      x.id ||
      x.matchId ||
      null,

    tour,

    player1:
      a.name,

    player2:
      b.name,

    player1Id:
      a.id ||
      x.player1Id ||
      null,

    player2Id:
      b.id ||
      x.player2Id ||
      null,

    country1:
      a.country,

    country2:
      b.country,

    rank1:
      a.rank,

    rank2:
      b.rank,

    seed1:
      x.seed1 ||
      x.player1Seed ||
      "",

    seed2:
      x.seed2 ||
      x.player2Seed ||
      "",

    score:
      score || "",

    status,

    live:
      x.live === true ||
      /live|inplay|in play/i.test(
        String(status)
      ),

    tournament,

    tournamentId:
      x.tournamentId ||
      x.tournament?.id ||
      null,

    round,

    roundId:
      x.roundId ||
      x.round?.id ||
      null,

    start,

    end:
      x.endTime ||
      x.endDate ||
      ""
  };
}


/* =========================================================
   PARIS DATE
========================================================= */

function parisDate(
  date = new Date()
) {

  const parts =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone:
          "Europe/Paris",

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit"
      }
    ).formatToParts(date);


  const values = {};

  for (const part of parts) {

    if (
      part.type !==
      "literal"
    ) {
      values[
        part.type
      ] = part.value;
    }
  }


  return (
    `${values.year}-${values.month}-${values.day}`
  );
}


/* =========================================================
   TIMESTAMP → PARIS DATE
========================================================= */

function timestampParisDate(
  value
) {

  if (!value) {
    return "";
  }


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }


  return parisDate(
    date
  );
}


/* =========================================================
   FIXTURES
========================================================= */

async function fixturesForDate(
  date,
  tour,
  env
) {

  try {

    const data =
      await call(
        `/tennis/v2/${tour}/fixtures/${date}?include=round,tournament&pageNo=1&pageSize=100&filter=PlayerGroup:singles`,
        env
      );


    return arr(data)
      .map(
        item =>
          match(
            item,
            tour
          )
      );

  } catch (error) {

    console.error(
      `Fixtures ${tour} ${date}:`,
      error.message
    );

    return [];
  }
}


/* =========================================================
   UPCOMING MATCHES
========================================================= */

async function upcoming(
  tour,
  env
) {

  try {

    const data =
      await call(
        `/tennis/v2/extend/api/events/upcoming/${tour}`,
        env
      );


    return arr(data)
      .map(
        item =>
          match(
            item,
            tour
          )
      );

  } catch (error) {

    console.error(
      `Upcoming ${tour}:`,
      error.message
    );

    return [];
  }
}


/* =========================================================
   LIVE
========================================================= */

async function liveEvents(
  env
) {

  try {

    const data =
      await call(
        "/tennis/v2/extend/api/events/live",
        env
      );

    return arr(data);

  } catch {
    return [];
  }
}


/* =========================================================
   TODAY
========================================================= */

async function today(env) {

  const targetDate =
    parisDate();


  /*
   * Get:
   *
   * 1. Fixtures for today
   * 2. Upcoming ATP
   * 3. Upcoming WTA
   * 4. Live matches
   */

  const [
    atpFixtures,
    wtaFixtures,
    atpUpcoming,
    wtaUpcoming,
    live
  ] =
    await Promise.all([
      fixturesForDate(
        targetDate,
        "atp",
        env
      ),

      fixturesForDate(
        targetDate,
        "wta",
        env
      ),

      upcoming(
        "atp",
        env
      ),

      upcoming(
        "wta",
        env
      ),

      liveEvents(
        env
      )
    ]);


  /*
   * Fixtures contain completed
   * and possibly scheduled matches.
   */

  const fixtureMatches =
    [
      ...atpFixtures,
      ...wtaFixtures
    ];


  /*
   * Upcoming contains future
   * scheduled matches.
   *
   * Keep only those belonging
   * to today's date in France.
   */

  const upcomingMatches =
    [
      ...atpUpcoming,
      ...wtaUpcoming
    ].filter(
      item => {

        const date =
          timestampParisDate(
            item.start
          );

        return (
          !date ||
          date === targetDate
        );
      }
    );


  /*
   * Combine them.
   */

  let matches = [
    ...fixtureMatches,
    ...upcomingMatches
  ];


  /*
   * Remove duplicates.
   */

  const unique =
    new Map();


  for (const item of matches) {

    const key =
      item.id
        ? String(item.id)
        : [
            item.tour,
            item.player1,
            item.player2,
            item.start
          ].join("|");


    if (!unique.has(key)) {
      unique.set(
        key,
        item
      );
    }
  }


  matches =
    Array.from(
      unique.values()
    );


  /*
   * Merge live information.
   */

  for (
    const liveMatch of live
  ) {

    const p1 =
      val(
        liveMatch,
        [
          "player1",
          "player1Name"
        ]
      );

    const p2 =
      val(
        liveMatch,
        [
          "player2",
          "player2Name"
        ]
      );


    if (
      !p1 ||
      !p2
    ) {
      continue;
    }


    const found =
      matches.find(
        item =>
          (
            item.player1 === p1 &&
            item.player2 === p2
          ) ||
          (
            item.player1 === p2 &&
            item.player2 === p1
          )
      );


    if (found) {

      found.live =
        true;

      found.status =
        "Live";


      found.score =
        val(
          liveMatch,
          ["score"],
          found.score
        );
    }
  }


  /*
   * Sort:
   *
   * Live first,
   * then chronological.
   */

  matches.sort(
    (a, b) => {

      if (
        a.live !==
        b.live
      ) {
        return a.live
          ? -1
          : 1;
      }


      const da =
        new Date(
          a.start || 0
        ).getTime();


      const db =
        new Date(
          b.start || 0
        ).getTime();


      return da - db;
    }
  );


  return {

    ok: true,

    date:
      targetDate,

    count:
      matches.length,

    matches
  };
}


/* =========================================================
   MASTERS
========================================================= */

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
    x.rank?.name ||
    x.rankName ||
    "";


  return {

    name,

    tour,

    tier:
      tier ||
      rank,

    start:
      val(
        x,
        [
          "date",
          "startDate",
          "start"
        ]
      ),

    end:
      val(
        x,
        [
          "endDate",
          "end"
        ]
      ),

    country:
      x.country?.name ||
      x.countryName ||
      x.countryAcr ||
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


/* =========================================================
   CALENDAR
========================================================= */

async function calendar(env) {

  const year =
    new Date()
      .getUTCFullYear();


  const [
    atp,
    wta
  ] =
    await Promise.all([
      call(
        `/tennis/v2/atp/tournament/calendar/${year}?pageNo=1&pageSize=200`,
        env
      ),

      call(
        `/tennis/v2/wta/tournament/calendar/${year}?pageNo=1&pageSize=200`,
        env
      )
    ]);


  return {

    year,

    tournaments:
      [
        ...arr(atp)
          .map(
            x =>
              masters(
                x,
                "atp"
              )
          ),

        ...arr(wta)
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
            new Date(
              a.start
            ) -
            new Date(
              b.start
            )
        )
  };
}


/* =========================================================
   RSS
========================================================= */

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
      x => x[0]
    )

    .map(
      item => {

        const clean =
          value =>
            value
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
              .trim();


        const get =
          tag => {

            const found =
              item.match(
                new RegExp(
                  `<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
                  "i"
                )
              );

            return found
              ? clean(
                  found[1]
                )
              : "";
          };


        const link =
          (
            item.match(
              /<link>([\s\S]*?)<\/link>/i
            ) ||
            []
          )[1] || "";


        const date =
          get("pubDate") ||
          get("published");


        return {

          title:
            get("title"),

          link:
            clean(link),

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


/* =========================================================
   NEWS
========================================================= */

async function news() {

  const sources = [

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
    const [
      url,
      source
    ] of sources
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


      if (
        response.ok
      ) {

        items.push(
          ...xml(
            await response.text(),
            source
          )
        );
      }

    } catch {
      // Ignore failed news source.
    }
  }


  return {
    items
  };
}

/* =========================================================
   TEMPORARY DEBUG - UPCOMING API
========================================================= */

async function debugUpcoming(env) {

  const atp = await call(
    "/tennis/v2/extend/api/events/upcoming/atp?page=1",
    env
  );

  const wta = await call(
    "/tennis/v2/extend/api/events/upcoming/wta?page=1",
    env
  );

  return {
    atp,
    wta
  };
}
/* =========================================================
   WORKER
========================================================= */

export default {

  async fetch(
    req,
    env
  ) {

    const url =
      new URL(
        req.url
      );


    try {

      if (
        url.pathname ===
        "/api/today"
      ) {

        return J(
          await today(
            env
          )
        );
      }


      if (
        url.pathname ===
        "/api/calendar"
      ) {

        return J(
          await calendar(
            env
          )
        );
      }


      if (
        url.pathname ===
        "/api/rankings"
      ) {

        const tour =
          url.searchParams.get(
            "tour"
          ) === "wta"
            ? "wta"
            : "atp";


        const data =
          await call(
            `/tennis/v2/${tour}/ranking/singles?pageNo=1&pageSize=50`,
            env
          );


        return J({

          players:
            arr(data)
              .map(
                (
                  p,
                  index
                ) => {

                  const info =
                    player(p);


                  return {

                    ...info,

                    rank:
                      info.rank ||
                      index + 1
                  };
                }
              )
        });
      }


      if (
        url.pathname ===
        "/api/news"
      ) {

        return J(
          await news()
        );
      }


      if (
        url.pathname.startsWith(
          "/api/"
        )
      ) {

        return J(
          {
            error:
              "API endpoint not found"
          },
          404
        );
      }


      return env.ASSETS.fetch(
        req
      );

    } catch (
      error
    ) {

      return J(
        {
          error:
            error.message ||
            "API error"
        },
        500
      );
    }
  }
};
