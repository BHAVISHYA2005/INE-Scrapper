# Deployment

## Render backend

- **Service type:** Web Service
- **Root Directory:** leave blank
- **Build Command:** `npm ci`
- **Start Command:** `npm run start`

## Environment variables

Set these in Render:

- `PORT` — Render sets this automatically; do not hardcode it
- `STOREFRONT_BASE_URL` — defaults to `https://demo.inelabteamdev.com`
- `SUPABASE_URL` — your Supabase project URL
- `SUPABASE_ANON_KEY` — client-side key for the frontend if needed
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only, never expose in the browser
- `CRON_SECRET` — shared secret sent by cron-job.org to `POST /api/cron/scrape`

## Notes

- The app now installs Playwright Chromium during `npm ci` via `postinstall`, so the browser is available on Render.
- The health endpoint is `GET /health`.
- Search endpoint: `GET /api/search?q=keyword`
- Track product: `POST /api/tracked-products`
- Untrack product: `POST /api/tracked-products/:id/untrack`
- Trigger scrape: `POST /api/tracked-products/:id/scrape`
- Scrape history: `GET /api/tracked-products/:id/history`
- Chart data: `GET /api/tracked-products/:id/chart-data`
- CSV export: `GET /api/export.csv`
- Cron scrape: `POST /api/cron/scrape` with `x-cron-secret: <secret>`