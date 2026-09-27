# YepTennis Simple 1.0

Clean rebuild using the existing Worker, KV and Cloudflare secret.

Worker: shrill-water-7a45
KV binding: TENNIS_CACHE
KV ID: a77843203ff04441a518708bea759b16
Secret: TENNIS_API_KEY (kept in Cloudflare, NOT in GitHub)

Features: ATP/WTA Top 50 rankings, clickable player summary, results by date, upcoming ATP/WTA 1000/500/250 and Grand Slams, latest BBC Sport/ATP Tour news. No live scores.


## 1.1 fallback data

If RapidAPI/KV returns an empty response, the front end displays a small reference dataset so the site is not blank. When the API returns valid data, the API data is used instead.

The fallback content is not intended to replace the API as the long-term source.
