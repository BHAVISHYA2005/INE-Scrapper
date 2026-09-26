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

## Notes

- The app now installs Playwright Chromium during `npm ci` via `postinstall`, so the browser is available on Render.
- The health endpoint is `GET /health`.
- Search endpoint: `GET /search?q=keyword`
- Scrape endpoint: `GET /scrape/:productId?option=PackLabel`