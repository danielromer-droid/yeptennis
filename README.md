# YepTennis — live ATP/WTA version

## What is live
- ATP and WTA singles fixtures/results, browsable **day by day** via
  `/api/results?date=YYYY-MM-DD` (the Results section has ←/→ day navigation)
- Filter results by tour (ATP/WTA), status (LIVE/COMPLETED), and by
  tournament level (**Grand Slam / 1000 / 500 / 250**) — the same
  classification is shared by results and the calendar
- Live-match updates where the API plan exposes the live endpoint
- Tournament calendar covering Grand Slams, 1000s, 500s, and 250s
  (rendered under **Calendar**)
- ATP/WTA rankings, **top 20**, each with a link to more information about
  the player (rendered under **Rankings**)
- Tennis news from BBC Sport Tennis RSS and ATP Tour RSS
- Browser refresh of today's results every 60 seconds (only while viewing
  today — past dates are already final and aren't re-fetched)

## RapidAPI quota protection
The worker caches every RapidAPI response in a Cloudflare KV namespace so the
upstream API is only actually called on a schedule, no matter how many
visitors hit the site, how often the browser polls, or how many past dates
someone browses:

- `/api/results` (today) and `/api/debug` — refetched at most **every 12
  hours** (≈2 calls/day)
- `/api/results` for any **past** date — cached for **7 days**, since a
  finished day's results don't change
- `/api/calendar` and `/api/rankings` — refetched at most **every 24 hours**
  (≈1 call/day each)
- A Cloudflare Cron Trigger (`triggers.crons` in `wrangler.json`, every 4
  hours) pre-warms today's cache in the background, so visitors almost
  never trigger the live upstream call themselves

The 60-second browser refresh only re-reads the worker's own cache, so it does
not add extra load against your RapidAPI plan.

### Setting up the cache
1. Create a KV namespace:
   ```
   npx wrangler kv namespace create TENNIS_CACHE
   ```
2. Copy the `id` it prints into `wrangler.json`, replacing
   `REPLACE_WITH_YOUR_KV_NAMESPACE_ID`.
3. Deploy. If the KV binding is ever missing or misconfigured, the worker
   still works — it just falls back to calling RapidAPI on every request, so
   don't skip this step if you're on a limited plan.

## Important
The RapidAPI key is NOT in the website or GitHub. It is a Cloudflare Worker secret named:

`TENNIS_API_KEY`

The current Tennis API documentation uses the host:
`tennis-api-atp-wta-itf.p.rapidapi.com`

## GitHub
Upload this exact structure to the root of your `yeptennis` repository:

```text
public/
  index.html
  style.css
  app.js
src/
  index.js
wrangler.json
README.md
```

## Cloudflare
Use **Workers & Pages → Create application → Import an existing repository** and connect the GitHub repository.

Build command: leave empty.
Deploy command: `npx wrangler deploy`

Then in the Worker:
**Settings → Variables and Secrets → Add → Secret**
Name: `TENNIS_API_KEY`
Value: your RapidAPI key.

## Domain
Use:
**Workers & Pages → yeptennis → Settings → Domains & Routes → Add → Custom Domain**
and enter:

`yeptennis.com`

Do NOT manually create a CNAME from `yeptennis.com` to another `*.pages.dev` hostname. Cloudflare Custom Domains creates the DNS record for the Worker.

## Data source
The tennis data is supplied by the Tennis API - ATP WTA ITF product on RapidAPI. The API documentation says the product covers ATP/WTA fixtures, rankings, players and tournament calendars, and provides live routes. Some advanced live/Socket.IO features require higher plans.

BBC Sport RSS and ATP Tour RSS are used for news. BBC requires attribution when its RSS feed is displayed; YepTennis labels BBC Sport as the source.


## Update: populated sections (latest)
- **Scores, last 4 days**: quick chips for Today / Yesterday / the 2 days before,
  plus ←/→ for anything older. A cron (every 4 hours = 6 runs/day) refreshes
  today's scores + live matches each run, refreshes yesterday once a day, and
  backfills any of the previous 3 days that are missing.
- **Failed/empty upstream fetches never overwrite good data** (e.g. when the
  RapidAPI quota is reached, the last good snapshot keeps being served).
- **Calendar**: uses the live API; if it returns nothing usable it shows the
  typical annual schedule of Slams / 1000s / Finals (approximate months) instead
  of a blank section. Check `/api/calendar` -> `source` ("api" or "fallback"),
  `apiCount` and `errors` to see which one you're getting.
- **News**: BBC Sport (then ATP Tour) with title + short description, cached 30 min.
- **Rankings**: top 20 with a one-line bio per player from Wikipedia
  (`/api/player-bio?name=...`, cached 30 days in KV) and a link to their page.
- Approx. RapidAPI usage in steady state: ~3 calls x 6 runs/day for today
  (~18/day, ~550/month) plus daily calendar/rankings refreshes and rare backfills.


## Fix: scores for past days (why days looked empty)
The site used the API's **fixtures** endpoint for every day. Fixtures is the
*schedule*: no final scores, and matches drop out once played. Now:
- **Past days** use `/tennis/v2/{atp|wta}/results/{date}` (finished matches, real
  scores; `player1` is the winner, marked with a check).
- **Today** = results so far + fixtures (scheduled, and the in-progress score
  from the `live` field), de-duplicated. The separate live-events call was dropped.
- Tournament levels (Grand Slam / 1000 / 500 / 250) are tagged from the calendar
  by tournament id; matches from other events (Challengers etc.) sort last.
- The calendar now asks the API only for TourRank 2,3,4 (250/500, Masters, Slams)
  from 3 weeks back, so it is no longer swamped by Challenger/ITF rows.
- Cache keys were renamed (`res2:*`, `calendar2:*`) so old schedule-only data is ignored.
- RapidAPI free plan = 50 requests/day. Usage now: 4 calls x 6 runs (today) + 4 for
  yesterday re-checks + ~4 calendar/rankings = about 32/day. Visitors add none.


## v6 changes
- Removed the static "ATP Tour" / "WTA Tour" card panels and the "Finals / 1000 / 500"
  series blocks: they had no live data and only repeated the level filters.
- The ATP and WTA links (menu, tour bar, footer) now jump to Results with the
  ATP or WTA tab already selected.
- News images are now 16:9 rectangles (160px wide, 120px on phones) and are
  cropped instead of squashed. BBC thumbnails are requested at 480px so they stay sharp.
- Testing the API: use your tennis domain, e.g.
  `https://yeptennis.com/api/results?date=2026-09-27`
  (or the `*.workers.dev` address shown in Cloudflare), not yepfootball.com.


## v8: how scores work now
Your RapidAPI plan does NOT have the "results by date" route (it answers
"Endpoint does not exist"), so the site no longer uses it:
- **Today**: fixtures by date (2 requests per run, every 4 hours) give the
  schedule and live scores. Matches that were played between two runs stay
  listed as "Played · final score soon" until their final score arrives.
- **Finished scores (today and the last 3 days)**: tournament results, one request
  per ATP/WTA 250-and-up event that is running or just ended, at 00, 08, 12 and
  20 UTC. Each tournament's matches are split into days by match date.
  Challengers and ITF events are not swept (too many requests for the free plan).
- `/api/check` (no requests): which tournaments are swept, when the last sweep ran,
  and how many matches each of the last 4 days has.
- `/api/refresh`: runs the full update immediately (about 2 + 1 per tournament
  requests; allowed once an hour). Use it once right after deploying.
- Expected usage: about 12 (fixtures) + 12-20 (sweeps) + 3-4 (calendar/rankings)
  = roughly 30-36 requests a day, under the free plan's 50.
- Also in this version: iPhone menu fix, clear error messages when scores can't load.

## v9
- Footer: new row with **About us** (`/about.html`), **Terms and conditions**
  (`/terms.html`) and **contact@yeptennis.com** (opens the visitor's email app).
- The two new pages use the site's header, colours and fonts and work on phones.
- The terms are a general template: have them checked if YepTennis becomes a
  business (company name, address and publisher details may be required in France).
