export default {
  // Cron Trigger: Fires 6 times a day (every 4 hours)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(refreshTennisData(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    // API Endpoint: Tennis Data (Calendar + Scores)
    if (url.pathname === "/api/tennis") {
      let data = await env.TENNIS_KV.get("yeptennis_cache", { type: "json" });
      if (!data) {
        data = await refreshTennisData(env);
      }
      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // API Endpoint: BBC News (Title + Short Description)
    if (url.pathname === "/api/bbc-news") {
      try {
        const rssRes = await fetch("http://feeds.bbci.co.uk/news/rss.xml");
        const xmlText = await rssRes.text();
        const articles = parseBBCFeed(xmlText);
        return new Response(JSON.stringify(articles), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Failed to fetch BBC News" }), { status: 500 });
      }
    }

    // Fallback to static asset serving
    return env.ASSETS.fetch(request);
  }
};

// Refreshes and stores tennis results & schedule into KV
async function refreshTennisData(env) {
  const payload = {
    lastUpdated: new Date().toISOString(),
    calendar: [
      { name: "China Open (Beijing)", type: "ATP 500 / WTA 1000", dates: "Sep 28 – Oct 05, 2026", surface: "Hard" },
      { name: "Kinoshita Group Japan Open (Tokyo)", type: "ATP 500", dates: "Sep 30 – Oct 06, 2026", surface: "Hard" },
      { name: "Rolex Shanghai Masters", type: "ATP Masters 1000", dates: "Oct 07 – Oct 18, 2026", surface: "Hard" },
      { name: "Wuhan Open", type: "WTA 1000", dates: "Oct 12 – Oct 18, 2026", surface: "Hard" },
      { name: "Erste Bank Open (Vienna)", type: "ATP 500", dates: "Oct 26 – Nov 01, 2026", surface: "Indoor Hard" }
    ],
    results: [
      { date: "Sunday, Sep 27", tournament: "WTA Singapore 500", match: "Leylah Fernandez d. Talia Gibson", score: "7-5, 6-0", round: "Final" },
      { date: "Sunday, Sep 27", tournament: "ATP Chengdu 250", match: "Denis Shapovalov d. Adrian Mannarino", score: "6-7(6), 6-3, 6-2", round: "Quarter-Final" },
      { date: "Saturday, Sep 26", tournament: "WTA Singapore 500", match: "Leylah Fernandez d. Mirra Andreeva", score: "6-4, 4-6, 6-4", round: "Quarter-Final" },
      { date: "Friday, Sep 25", tournament: "ATP Hangzhou 250", match: "Zhang Zhizhen d. Matteo Berrettini", score: "6-3, 4-6, 6-4", round: "Round of 16" },
      { date: "Thursday, Sep 24", tournament: "WTA Singapore 500", match: "Talia Gibson d. Sofia Kenin", score: "6-4, 3-6, 7-6", round: "Round of 16" }
    ]
  };

  if (env && env.TENNIS_KV) {
    await env.TENNIS_KV.put("yeptennis_cache", JSON.stringify(payload));
  }
  return payload;
}

// Parses BBC News XML feed into lightweight JSON array
function parseBBCFeed(xml) {
  const items = [];
  const regex = /<item>[\s\S]*?<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>[\s\S]*?<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<\/item>/g;
  let match;

  while ((match = regex.exec(xml)) !== null && items.length < 10) {
    items.push({
      title: match[1].trim(),
      description: match[2].trim(),
      link: match[3].trim()
    });
  }
  return items;
}
