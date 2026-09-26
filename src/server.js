const express = require('express');
const cors = require('cors');
const { StorefrontScraper, DEFAULT_BASE_URL } = require('./scraper');
const { getSupabaseAdminClient } = require('./lib/supabase');
const { buildOptionKey, toTrackedProductRow, toScrapeLogRow } = require('./lib/tracker');

const port = Number(process.env.PORT || 3000);
const baseUrl = process.env.STOREFRONT_BASE_URL || DEFAULT_BASE_URL;
const cronSecret = process.env.CRON_SECRET || '';
const scraper = new StorefrontScraper({
  baseUrl,
  headless: true,
});

function getSupabase() {
  return getSupabaseAdminClient();
}

function asyncHandler(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function csvFromRows(rows) {
  const header = [
    'product_id',
    'product_name',
    'selected_option',
    'scraped_at_utc',
    'price',
    'stock',
    'outcome',
  ];

  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push([
      escapeCsv(row.product_id),
      escapeCsv(row.product_name),
      escapeCsv(row.selected_option),
      escapeCsv(row.scraped_at_utc),
      escapeCsv(row.price),
      escapeCsv(row.stock),
      escapeCsv(row.outcome),
    ].join(','));
  }

  return `${lines.join('\n')}\n`;
}

function toApiTrackedProduct(row) {
  return {
    id: row.id,
    productId: row.product_id,
    productSlug: row.product_slug,
    productName: row.product_name,
    productBrand: row.product_brand,
    productCategory: row.product_category,
    productSku: row.product_sku,
    optionKey: row.option_key,
    optionId: row.option_id,
    optionLabel: row.option_label,
    productUrl: row.product_url,
    isTracked: row.is_tracked,
    lastScrapedAt: row.last_scraped_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toApiLogRow(row) {
  return {
    id: row.id,
    trackedProductId: row.tracked_product_id,
    productId: row.product_id,
    productName: row.product_name,
    optionKey: row.option_key,
    optionLabel: row.option_label,
    scrapedAt: row.scraped_at,
    priceText: row.price_text,
    priceAmount: row.price_amount,
    stockText: row.stock_text,
    stockQuantity: row.stock_quantity,
    stockAvailable: row.stock_available,
    outcome: row.outcome,
    attemptCount: row.attempt_count,
    errorMessage: row.error_message,
    sourceUrl: row.source_url,
  };
}

async function upsertTrackedProductFromScrape(scrapeResult) {
  const supabase = getSupabase();
  const row = toTrackedProductRow(scrapeResult);
  const { data, error } = await supabase
    .from('tracked_products')
    .upsert(row, { onConflict: 'product_id,option_key' })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function insertScrapeLog(scrapeResult, trackedProductId = null) {
  const supabase = getSupabase();
  const row = toScrapeLogRow(scrapeResult, trackedProductId);
  const { data, error } = await supabase
    .from('scrape_log')
    .insert(row)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function getTrackedProductById(trackedProductId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('tracked_products')
    .select('*')
    .eq('id', trackedProductId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchTrackedProducts({ includeInactive = false } = {}) {
  const supabase = getSupabase();
  let query = supabase.from('tracked_products').select('*').order('created_at', { ascending: false });
  if (!includeInactive) {
    query = query.eq('is_tracked', true);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return data || [];
}

async function scrapeAndPersistTrackedProduct(trackedProduct) {
  const scrapeResult = await scraper.scrapeProduct({
    productId: trackedProduct.product_id,
    optionLabel: trackedProduct.option_label || trackedProduct.option_id || trackedProduct.option_key || null,
    attempts: 3,
    timeoutMs: 25000,
  });

  const savedTrackedProduct = await upsertTrackedProductFromScrape(scrapeResult);
  const savedLog = await insertScrapeLog(scrapeResult, savedTrackedProduct.id);

  const supabase = getSupabase();
  await supabase
    .from('tracked_products')
    .update({ last_scraped_at: scrapeResult.scrapedAt })
    .eq('id', savedTrackedProduct.id);

  return {
    trackedProduct: savedTrackedProduct,
    log: savedLog,
    scrapeResult,
  };
}

const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/', (request, response) => {
  response.type('html').send(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>INE Scrapper API</title>
        <style>
          body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: Inter, Arial, sans-serif; background: #0b1020; color: #e2e8f0; }
          .card { max-width: 720px; margin: 24px; padding: 28px; border: 1px solid rgba(148,163,184,.18); border-radius: 20px; background: rgba(17,24,46,.9); box-shadow: 0 24px 80px rgba(2,6,23,.35); }
          h1 { margin: 0 0 12px; }
          p, li { color: #94a3b8; line-height: 1.6; }
          code, a { color: #c4b5fd; }
          ul { padding-left: 20px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>INE Scrapper backend is running</h1>
          <p>This Render service is the API backend, not the dashboard UI.</p>
          <ul>
            <li>Health: <a href="/health">/health</a></li>
            <li>Search: <code>/api/search?q=product</code></li>
            <li>Tracked products: <code>/api/tracked-products</code></li>
            <li>CSV export: <code>/api/export.csv</code></li>
          </ul>
          <p>The dashboard should be deployed separately on Vercel and pointed at this backend with <code>VITE_API_BASE_URL</code>.</p>
        </div>
      </body>
    </html>
  `);
});

app.get('/health', (request, response) => {
  response.json({ ok: true, service: 'ine-scrapper', baseUrl });
});

app.get('/api/search', asyncHandler(async (request, response) => {
  const query = String(request.query.q || '').trim();
  if (!query) {
    response.status(400).json({ ok: false, error: 'Missing q query parameter' });
    return;
  }

  const results = await scraper.searchProducts(query, { limit: toInt(request.query.limit, 25) });
  response.json({ ok: true, query, count: results.length, results });
}));

app.get('/api/tracked-products', asyncHandler(async (request, response) => {
  const includeInactive = request.query.includeInactive === 'true' || request.query.includeInactive === '1';
  const trackedProducts = await fetchTrackedProducts({ includeInactive });
  response.json({ ok: true, count: trackedProducts.length, trackedProducts: trackedProducts.map(toApiTrackedProduct) });
}));

app.post('/api/tracked-products', asyncHandler(async (request, response) => {
  const productId = Number(request.body.productId);
  if (!Number.isFinite(productId)) {
    response.status(400).json({ ok: false, error: 'productId is required' });
    return;
  }

  const optionLabel = request.body.optionLabel || request.body.option || null;
  const optionId = request.body.optionId || null;
  const item = await scraper.getItemById(productId);
  const resolvedOption = scraper.resolveOption(item, optionLabel || optionId);
  const scrapeSeed = {
    productId: item.id,
    productSlug: item.slug,
    productName: item.name,
    productBrand: item.brand,
    productCategory: item.category,
    productSku: item.sku,
    optionId: resolvedOption?.id || optionId || null,
    optionLabel: resolvedOption?.label || optionLabel || null,
    productUrl: `${baseUrl.replace(/\/$/, '')}/item/${item.id}`,
    scrapedAt: new Date().toISOString(),
  };

  const savedTrackedProduct = await upsertTrackedProductFromScrape(scrapeSeed);
  response.status(201).json({ ok: true, trackedProduct: toApiTrackedProduct(savedTrackedProduct) });
}));

app.post('/api/tracked-products/:id/untrack', asyncHandler(async (request, response) => {
  const trackedProduct = await getTrackedProductById(request.params.id);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('tracked_products')
    .update({ is_tracked: false })
    .eq('id', trackedProduct.id)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  response.json({ ok: true, trackedProduct: toApiTrackedProduct(data) });
}));

app.delete('/api/tracked-products/:id', asyncHandler(async (request, response) => {
  const supabase = getSupabase();
  const { error } = await supabase.from('tracked_products').delete().eq('id', request.params.id);
  if (error) {
    throw error;
  }

  response.json({ ok: true });
}));

app.get('/api/tracked-products/:id/history', asyncHandler(async (request, response) => {
  const trackedProduct = await getTrackedProductById(request.params.id);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('scrape_log')
    .select('*')
    .eq('tracked_product_id', trackedProduct.id)
    .order('scraped_at', { ascending: false })
    .limit(toInt(request.query.limit, 100));

  if (error) {
    throw error;
  }

  response.json({
    ok: true,
    trackedProduct: toApiTrackedProduct(trackedProduct),
    count: data.length,
    logs: data.map(toApiLogRow),
  });
}));

app.post('/api/tracked-products/:id/scrape', asyncHandler(async (request, response) => {
  const trackedProduct = await getTrackedProductById(request.params.id);
  const result = await scrapeAndPersistTrackedProduct(trackedProduct);
  response.json({
    ok: true,
    trackedProduct: toApiTrackedProduct(result.trackedProduct),
    log: toApiLogRow(result.log),
    scrapeResult: result.scrapeResult,
  });
}));

app.post('/api/cron/scrape', asyncHandler(async (request, response) => {
  const providedSecret = request.header('x-cron-secret') || request.header('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!cronSecret || providedSecret !== cronSecret) {
    response.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }

  const trackedProducts = await fetchTrackedProducts();
  const results = [];

  for (const trackedProduct of trackedProducts) {
    try {
      const result = await scrapeAndPersistTrackedProduct(trackedProduct);
      results.push({
        trackedProductId: trackedProduct.id,
        outcome: 'success',
        logId: result.log.id,
      });
    } catch (error) {
      results.push({
        trackedProductId: trackedProduct.id,
        outcome: 'failed',
        error: error.message || String(error),
      });
    }
  }

  response.json({ ok: true, count: results.length, results });
}));

app.get('/api/export.csv', asyncHandler(async (request, response) => {
  const supabase = getSupabase();
  let query = supabase
    .from('scrape_log')
    .select('product_id,product_name,option_label,scraped_at,price_text,stock_text,outcome')
    .order('scraped_at', { ascending: false });

  if (request.query.trackedProductId) {
    query = query.eq('tracked_product_id', request.query.trackedProductId);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const csv = csvFromRows((data || []).map((row) => ({
    product_id: row.product_id,
    product_name: row.product_name,
    selected_option: row.option_label || '',
    scraped_at_utc: row.scraped_at,
    price: row.price_text || '',
    stock: row.stock_text || '',
    outcome: row.outcome,
  })));

  response.setHeader('Content-Type', 'text/csv; charset=utf-8');
  response.setHeader('Content-Disposition', 'attachment; filename="scrape-log.csv"');
  response.status(200).send(csv);
}));

app.get('/api/tracked-products/:id/chart-data', asyncHandler(async (request, response) => {
  const trackedProduct = await getTrackedProductById(request.params.id);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('scrape_log')
    .select('scraped_at,price_amount,stock_quantity,stock_available,outcome')
    .eq('tracked_product_id', trackedProduct.id)
    .order('scraped_at', { ascending: true });

  if (error) {
    throw error;
  }

  response.json({
    ok: true,
    trackedProduct: toApiTrackedProduct(trackedProduct),
    points: data || [],
  });
}));

app.use((error, request, response, next) => {
  response.status(error.status || 500).json({
    ok: false,
    error: error.message || 'Internal server error',
  });
});

const server = app.listen(port, () => {
  process.stdout.write(`Server listening on ${port}\n`);
});

async function shutdown(signal) {
  await scraper.close().catch(() => {});
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);