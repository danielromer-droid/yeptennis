# YepTennis — live ATP/WTA version

## What is live
- Today's ATP and WTA singles fixtures/results
- Live-match updates where the API plan exposes the live endpoint
- ATP/WTA Masters calendar (rendered under **Calendar**)
- ATP/WTA rankings (rendered under **Rankings**)
- Tennis news from BBC Sport Tennis RSS and ATP Tour RSS
- Browser refresh of today's results every 60 seconds

## RapidAPI quota protection
The worker uses Cloudflare's built-in edge Cache API so repeated visitor
requests do not call RapidAPI again and again.

- `/api/today` and `/api/debug` — cached for 12 hours
- `/api/calendar` and `/api/rankings` — cached for 24 hours

The browser can refresh today's results every 60 seconds; those requests read
the worker cache and do not normally create another RapidAPI request.

No KV namespace is required for this version. This avoids deployment failures
caused by an unset or placeholder KV namespace ID.

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
