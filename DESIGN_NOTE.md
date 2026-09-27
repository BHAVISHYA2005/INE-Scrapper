# Design Note

## Approach

The app uses a React dashboard on Vercel, an Express API on Render, and Supabase for persistent tracking data. The scraper targets INE's hosted mock storefront only and uses a headless browser because the product page behavior is intentionally awkward and can require JavaScript-driven interaction to reveal the current price and stock.

## Reliability strategy

- The scraper searches the mock storefront by partial or full product name.
- It resolves the exact product option to track, because each option can have its own price.
- It retries slow or failed scrapes instead of silently accepting incomplete data.
- It records every attempt in `scrape_log`, including failures, so the history is honest.
- It persists tracked products and scrape history in Supabase so the data survives unattended runs.
- The scheduled scrape is triggered externally through `cron-job.org` every 2 hours, which avoids relying on a free-tier backend staying awake.

## Trade-offs

- A headless browser is heavier than simple HTML parsing, but it is the safer choice for this storefront because the page can defer content or require interaction before the real price becomes available.
- The implementation prioritizes correctness and honest logging over speed.
- The scrape flow is designed to fail visibly if the page structure changes instead of silently writing incorrect values.

## What AI got wrong first and how it was corrected

- The first pass assumed the scraper could be treated like a simple static HTML parse. That was not reliable enough for this storefront, so the implementation was shifted toward a browser-based flow.
- The first deployment attempt also used an overly aggressive Playwright install command on Render. That was corrected by simplifying the Render build to `npm ci` so the project’s install flow stays compatible with the platform.
- The frontend/backend environment split was clarified so only the backend keeps server secrets, while the frontend uses only the public `VITE_API_BASE_URL`.

## Submission checklist

- Backend deployed on Render
- Frontend deployed on Vercel
- Supabase schema applied
- Cron endpoint protected by `CRON_SECRET`
- CSV export available in the dashboard
- Headed mode available through `npm run scrape:headed`
