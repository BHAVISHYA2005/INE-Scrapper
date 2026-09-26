#!/usr/bin/env node

const { StorefrontScraper, DEFAULT_BASE_URL } = require('../scraper');

function parseArgs(argv) {
  const args = [...argv];
  const commandNames = new Set(['search', 'scrape']);
  const command = commandNames.has(args[0]) ? args.shift() : 'scrape';
  const options = { command };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) {
      if (!options._) options._ = [];
      options._.push(token);
      continue;
    }

    const [key, inlineValue] = token.slice(2).split('=');
    if (inlineValue !== undefined) {
      options[key] = inlineValue;
      continue;
    }

    const nextValue = args[index + 1];
    if (nextValue && !nextValue.startsWith('--')) {
      options[key] = nextValue;
      index += 1;
    } else {
      options[key] = true;
    }
  }

  return options;
}

function toBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  return !['false', '0', 'no', 'off'].includes(String(value).toLowerCase());
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const command = parsed.command || 'scrape';
  const baseUrl = parsed['base-url'] || parsed.baseUrl || DEFAULT_BASE_URL;
  const headless = toBoolean(parsed.headless, !parsed.headed);
  const scraper = new StorefrontScraper({ baseUrl, headless });

  try {
    if (command === 'search') {
      const query = parsed._?.join(' ') || parsed.query || parsed.q;
      if (!query) {
        throw new Error('Usage: npm run search -- "product name"');
      }

      const results = await scraper.searchProducts(query, {
        limit: Number(parsed.limit || 25),
        pageSize: Number(parsed['page-size'] || 100),
        maxPages: Number(parsed['max-pages'] || 20),
      });

      printJson({ query, baseUrl, count: results.length, results });
      return;
    }

    const productId = parsed.productId || parsed.id || parsed._?.[0];
    const optionLabel = parsed.option || parsed.optionLabel || parsed._?.[1] || null;
    if (!productId) {
      throw new Error('Usage: npm run scrape -- <productId> [optionLabel] [--headed]');
    }

    const result = await scraper.scrapeProduct({
      productId,
      optionLabel,
      attempts: Number(parsed.attempts || 3),
      timeoutMs: Number(parsed.timeout || 25000),
    });

    printJson(result);
  } catch (error) {
    printJson({
      ok: false,
      error: error.message || String(error),
    });
    process.exitCode = 1;
  } finally {
    await scraper.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`);
  process.exit(1);
});
