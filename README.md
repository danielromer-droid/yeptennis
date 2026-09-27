# YepTennis — live ATP/WTA version

## What is live
- Today's ATP and WTA singles fixtures/results
- Live-match updates where the API plan exposes the live endpoint
- ATP/WTA Masters calendar (rendered under **Calendar**)
- ATP/WTA rankings (rendered under **Rankings**)
- Tennis news from BBC Sport Tennis RSS and ATP Tour RSS
- Browser refresh of today's results every 60 seconds

## RapidAPI quota protection
The worker caches every RapidAPI response in a Cloudflare KV namespace so the
upstream API is only actually called on a schedule, no matter how many
visitors hit the site or how often the browser polls:

- `/api/today` and `/api/debug` — refetched at most **every 12 hours**
  (≈2 calls/day)
- `/api/calendar` and `/api/rankings` — refetched at most **every 24 hours**
  (≈1 call/day each)

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
