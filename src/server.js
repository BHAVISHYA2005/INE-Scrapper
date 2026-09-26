const http = require('http');
const { URL } = require('url');
const { StorefrontScraper, DEFAULT_BASE_URL } = require('./scraper');

const port = Number(process.env.PORT || 3000);
const baseUrl = process.env.STOREFRONT_BASE_URL || DEFAULT_BASE_URL;
const scraper = new StorefrontScraper({
  baseUrl,
  headless: true,
});

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
}

function readRequestUrl(request) {
  return new URL(request.url, `http://${request.headers.host || 'localhost'}`);
}

async function handleRequest(request, response) {
  const requestUrl = readRequestUrl(request);

  if (request.method === 'GET' && requestUrl.pathname === '/health') {
    sendJson(response, 200, { ok: true, service: 'ine-scrapper', baseUrl });
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/search') {
    const query = requestUrl.searchParams.get('q');
    if (!query) {
      sendJson(response, 400, { ok: false, error: 'Missing q query parameter' });
      return;
    }

    try {
      const results = await scraper.searchProducts(query, { limit: 20 });
      sendJson(response, 200, { ok: true, query, count: results.length, results });
    } catch (error) {
      sendJson(response, 500, { ok: false, error: error.message || String(error) });
    }
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname.startsWith('/scrape/')) {
    const productId = requestUrl.pathname.split('/').pop();
    const optionLabel = requestUrl.searchParams.get('option');

    if (!productId) {
      sendJson(response, 400, { ok: false, error: 'Missing product id' });
      return;
    }

    try {
      const result = await scraper.scrapeProduct({ productId, optionLabel, attempts: 3, timeoutMs: 25000 });
      sendJson(response, 200, { ok: true, result });
    } catch (error) {
      sendJson(response, 500, { ok: false, error: error.message || String(error) });
    }
    return;
  }

  sendJson(response, 404, { ok: false, error: 'Not found' });
}

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    sendJson(response, 500, { ok: false, error: error.message || String(error) });
  });
});

server.listen(port, () => {
  process.stdout.write(`Server listening on ${port}\n`);
});

process.on('SIGINT', async () => {
  await scraper.close().catch(() => {});
  server.close(() => process.exit(0));
});

process.on('SIGTERM', async () => {
  await scraper.close().catch(() => {});
  server.close(() => process.exit(0));
});