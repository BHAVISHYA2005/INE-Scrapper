# Deployment

## Render backend

- **Service type:** Web Service
- **Root Directory:** leave blank
- **Build Command:** `npm ci`
- **Start Command:** `npm run start`
- **Note:** keep the backend environment variables on Render only; do not expose server secrets to the frontend.

## Vercel frontend

- **Root Directory:** `frontend`
- **Build Command:** `npm ci && npm run build`

## Frontend environment variables

Set this in Vercel:

- `VITE_API_BASE_URL` — the public URL of your Render backend, for example `https://your-backend.onrender.com`

## Environment variables

Set these in Render:

- `PORT` — Render sets this automatically; do not hardcode it
- `STOREFRONT_BASE_URL` — defaults to `https://demo.inelabteamdev.com`
- `SUPABASE_URL` — your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only, never expose in the browser
- `CRON_SECRET` — shared secret sent by cron-job.org to `POST /api/cron/scrape`
- `PLAYWRIGHT_BROWSERS_PATH` — set to `0` so Chromium installs into the app bundle and is available at runtime

## Notes

- The app installs Playwright Chromium during `npm ci` via `postinstall`, so the browser is available on Render.
- Playwright is configured to use a repo-local browser path, which keeps the Chromium binary available in Render's runtime environment.
- Do not run `npx playwright install --with-deps chromium` on Render; the standard `npm ci` flow is the compatible setup here.
- The health endpoint is `GET /health`.
- Search endpoint: `GET /api/search?q=keyword`
- Track product: `POST /api/tracked-products`
- Untrack product: `POST /api/tracked-products/:id/untrack`
- Trigger scrape: `POST /api/tracked-products/:id/scrape`
- Scrape history: `GET /api/tracked-products/:id/history`
- Chart data: `GET /api/tracked-products/:id/chart-data`
- CSV export: `GET /api/export.csv`
- Cron scrape: `POST /api/cron/scrape` with `x-cron-secret: <secret>`