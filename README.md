# INE Price Tracker

A full-stack product price tracker for the INE Software Engineer Intern assignment.

## What this project includes

- React dashboard deployed on Vercel
- Express API deployed on Render
- Supabase-backed persistence for tracked products and scrape history
- Scheduled scraping via cron-job.org
- CSV export of all scrape attempts
- A headed scraper mode for the required observable run

## Live deployment

- Frontend: set your Vercel URL here once deployed
- Backend: set your Render backend URL here once deployed

## Repository structure

- `frontend/` — React dashboard
- `src/` — Express backend, scraper, and CLI
- `supabase/schema.sql` — database schema for tracked products and scrape logs
- `DEPLOYMENT.md` — deployment checklist
- `DESIGN_NOTE.md` — reliability and trade-off notes for submission

## Local setup

1. Install dependencies:
   ```bash
   npm ci
   ```

2. Set environment variables in a `.env` file or in your deployment provider.

3. Start the backend:
   ```bash
   npm run start
   ```

4. Run the frontend from the `frontend/` folder with the Vite scripts defined there.

## Environment variables

### Render backend

- `STOREFRONT_BASE_URL` — defaults to `https://demo.inelabteamdev.com`
- `SUPABASE_URL` — your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — server-only Supabase key
- `CRON_SECRET` — shared secret for cron-job.org

### Vercel frontend

- `VITE_API_BASE_URL` — the public Render backend URL

## Scheduled scraping

The assignment requires scraping every 2 hours. Use `cron-job.org` to call:

- `POST https://<your-render-backend>/api/cron/scrape`
- Header: `x-cron-secret: <your-secret>`

## CSV export

The dashboard exposes a CSV export button that downloads the full scrape history with one row per scrape attempt.

## Headed scraper run

Run the scraper in headed mode with:

```bash
npm run scrape:headed -- <productId> [optionLabel]
```

Example:

```bash
npm run scrape:headed -- 12345 "32 GB"
```

This opens the browser so you can record the scraper handling slow or failing responses for the assignment video.

## Notes for submission

Before submitting, make sure you provide:

- Hosted live site link
- Public GitHub repository URL
- 2–4 minute headed screen recording
- This README
- `DESIGN_NOTE.md`
- PDF resume
