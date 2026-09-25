const HOST = "tennis-api-atp-wta-itf.p.rapidapi.com";
const BASE = `https://${HOST}`;


/* =========================================================
   JSON RESPONSE
========================================================= */

const J = (
  data,
  status = 200
) =>
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
   RAPIDAPI CALL
========================================================= */

async function call(
  path,
  env
) {

  if (!env.TENNIS_API_KEY) {
    throw new Error(
      "TENNIS_API_KEY is not configured in Cloudflare."
    );
  }


  const response =
    await fetch(
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
    data =
      JSON.parse(text);
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

const arr = data => {

  if (Array.isArray(data)) {
    return data;
  }

  if (
    Array.isArray(
      data?.data
    )
  ) {
    return data.data;
  }

  if (
    Array.isArray(
      data?.results
    )
  ) {
    return data.results;
  }

  if (
    Array.isArray(
      data?.result
    )
  ) {
    return data.result;
  }

  return [];
};


/* =========================================================
   VALUE HELPER
========================================================= */

const val = (
  object,
  keys,
  fallback = ""
) => {

  for (
    const key of keys
  ) {

    if (
      object?.[key] !==
        null &&
      object?.[key] !==
        undefined &&
      object?.[key] !== ""
    ) {

      return object[key];
    }
  }

  return fallback;
};


/* =========================================================
   PLAYER
========================================================= */

function player(p) {

  if (
    typeof p ===
    "string"
  ) {

    return {
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
        ["id", "playerId"],
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

function match(
  x,
  tour
) {

  const a =
    player(
      x.player1 ||
      x.home
    );


  const b =
    player(
      x.player2 ||
      x.away
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
    typeof score ===
    "object"
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


  const end =
    x.endTime ||
    x.endDate ||
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

    points1:
      a.points,

    points2:
      b.points,

    seed1:
      x.seed1 ||
      "",

    seed2:
      x.seed2 ||
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

    end
  };
}


/* =========================================================
   DATE HELPERS
========================================================= */

/*
 * Returns YYYY-MM-DD.
 */

function isoDate(
  date
) {

  return date
    .toISOString()
    .slice(
      0,
      10
    );
}


/*
 * Add/subtract UTC days.
 */

function addDays(
  date,
  amount
) {

  const d =
    new Date(date);

  d.setUTCDate(
    d.getUTCDate() +
      amount
  );

  return d;
}


/*
 * Today's date in France.
 *
 * This is important because the
 * API uses UTC timestamps while
 * the website is being viewed
 * from France.
 */

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


  for (
    const part of parts
  ) {

    if (
      part.type !==
      "literal"
    ) {

      values[
        part.type
      ] =
        part.value;
    }
  }


  return `${values.year}-${values.month}-${values.day}`;
}


/*
 * Convert a timestamp into
 * a Paris calendar date.
 */

function timestampParisDate(
  value
) {

  if (!value) {
    return "";
  }


  const d =
    new Date(value);


  if (
    Number.isNaN(
      d.getTime()
    )
  ) {

    return "";
  }


  return parisDate(d);
}


/* =========================================================
   FETCH FIXTURES FOR ONE DATE
========================================================= */

async function fixturesForDate(
  date,
  tour,
  env
) {

  const path =
    `/tennis/v2/${tour}/fixtures/${date}` +
    `?include=round,tournament` +
    `&pageNo=1` +
    `&pageSize=100` +
    `&filter=PlayerGroup:singles`;


  try {

    const data =
      await call(
        path,
        env
      );


    return {
      ok: true,
      date,
      matches:
        arr(data)
          .map(
            item =>
              match(
                item,
                tour
              )
          )
    };

  } catch (error) {

    return {
      ok: false,
      date,
      matches: [],
      error:
        error.message
    };
  }
}


/* =========================================================
   LIVE EVENTS
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

async function today(
  env
) {

  /*
   * Use the date in France,
   * not simply UTC.
   */

  const targetDate =
    parisDate();


  /*
   * Current UTC date.
   */

  const now =
    new Date();


  const currentUTC =
    isoDate(now);


  /*
   * Previous UTC date.
   *
   * This catches matches such as:
   *
   * 23:30 UTC on 24 September
   *
   * which is 01:30 on
   * 25 September in France.
   */

  const previousUTC =
    isoDate(
      addDays(
        now,
        -1
      )
    );


  /*
   * First try today's UTC date.
   *
   * Only if necessary do we also
   * check the previous UTC date.
   */

  const currentResults =
    await Promise.all([
      fixturesForDate(
        currentUTC,
        "atp",
        env
      ),

      fixturesForDate(
        currentUTC,
        "wta",
        env
      )
    ]);


  let allResults =
    [
      ...currentResults[0].matches,
      ...currentResults[1].matches
    ];


  /*
   * If the current UTC date gives
   * no matches, check the previous
   * UTC date.
   *
   * This avoids making extra API
   * calls every time while still
   * handling the midnight timezone
   * problem.
   */

  if (
    allResults.length ===
    0
  ) {

    const previousResults =
      await Promise.all([
        fixturesForDate(
          previousUTC,
          "atp",
          env
        ),

        fixturesForDate(
          previousUTC,
          "wta",
          env
        )
      ]);


    allResults =
      [
        ...previousResults[0].matches,
        ...previousResults[1].matches
      ];
  }


  /*
   * Keep only matches which
   * actually belong to today's
   * date in France.
   *
   * If the API does not provide
   * a usable timestamp, keep it
   * rather than losing the match.
   */

  let matches =
    allResults.filter(
      item => {

        if (!item.start) {
          return true;
        }


        const localDate =
          timestampParisDate(
            item.start
          );


        return (
          !localDate ||
          localDate ===
            targetDate
        );
      }
    );


  /*
   * If the timestamp filtering
   * removed everything, return the
   * API results rather than falsely
   * reporting zero matches.
   */

  if (
    matches.length ===
      0 &&
    allResults.length >
      0
  ) {

    matches =
      allResults;
  }


  /*
   * Get live events.
   */

  const live =
    await liveEvents(
      env
    );


  /*
   * Merge live status and score
   * into the fixture data.
   */

  for (
    const liveMatch of live
  ) {

    const livePlayer1 =
      val(
        liveMatch,
        [
          "player1",
          "player1Name"
        ]
      );


    const livePlayer2 =
      val(
        liveMatch,
        [
          "player2",
          "player2Name"
        ]
      );


    if (
      !livePlayer1 ||
      !livePlayer2
    ) {
      continue;
    }


    const found =
      matches.find(
        item => {

          const sameOrder =
            item.player1 ===
              livePlayer1 &&
            item.player2 ===
              livePlayer2;


          const reverseOrder =
            item.player1 ===
              livePlayer2 &&
            item.player2 ===
              livePlayer1;


          return (
            sameOrder ||
            reverseOrder
          );
        }
      );


    if (found) {

      found.live =
        true;

      found.status =
        "Live";


      const liveScore =
        val(
          liveMatch,
          ["score"],
          ""
        );


      if (
        liveScore
      ) {

        found.score =
          liveScore;
      }
    }
  }


  /*
   * Sort by start time.
   */

  matches.sort(
    (
      a,
      b
    ) => {

      const da =
        new Date(
          a.start ||
          0
        ).getTime();


      const db =
        new Date(
          b.start ||
          0
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

    matches,

    checkedUTC:
      currentUTC,

    fallbackUTC:
      previousUTC
  };
}


/* =========================================================
   MASTERS / CALENDAR
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


  return {

    name,

    tour,

    tier:
      tier ||
      rank,

    start,

    end,

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

async function calendar(
  env
) {

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


  const tournaments =
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
        (
          a,
          b
        ) =>
          new Date(
            a.start
          ) -
          new Date(
            b.start
          )
      );


  return {
    year,
    tournaments
  };
}


/* =========================================================
   RSS XML PARSER
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
      matchItem =>
        matchItem[0]
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

            const regex =
              new RegExp(
                `<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
                "i"
              );


            const found =
              item.match(
                regex
              );


            return found
              ? clean(
                  found[1]
                )
              : "";
          };


        const linkMatch =
          item.match(
            /<link>([\s\S]*?)<\/link>/i
          );


        const link =
          linkMatch
            ? linkMatch[1]
            : "";


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
      item =>
        item.title &&
        item.link
    );
}


/* =========================================================
   NEWS
========================================================= */

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
    ] of urls
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

        out.push(
          ...xml(
            await response.text(),
            source
          )
        );
      }

    } catch {
      /*
       * Ignore one news source
       * if it is temporarily unavailable.
       */
    }
  }


  return {
    items: out
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

      /*
       * TODAY
       */

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


      /*
       * CALENDAR
       */

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


      /*
       * RANKINGS
       */

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


      /*
       * NEWS
       */

      if (
        url.pathname ===
        "/api/news"
      ) {

        return J(
          await news()
        );
      }


      /*
       * UNKNOWN API
       */

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


      /*
       * WEBSITE ASSETS
       */

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
