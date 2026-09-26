const cheerio = require('cheerio');
const { chromium } = require('playwright');

const DEFAULT_BASE_URL = 'https://demo.inelabteamdev.com';
const DEFAULT_SEARCH_PAGE_SIZE = 100;
const DEFAULT_SCRAPE_ATTEMPTS = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function backoffDelayMs(attempt) {
  const base = 600 * Math.pow(2, Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

function parsePriceAmount(priceText) {
  if (!priceText) return null;
  const normalized = String(priceText).replace(/,/g, '').replace(/[^0-9.]+/g, '');
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function parseStockQuantity(stockText) {
  if (!stockText) return null;
  const match = String(stockText).match(/\b(\d+)\b/);
  if (!match) return null;
  const quantity = Number(match[1]);
  return Number.isFinite(quantity) ? quantity : null;
}

function buildItemUrl(baseUrl, id) {
  return `${baseUrl.replace(/\/$/, '')}/item/${id}`;
}

function scoreSearchResult(item, query) {
  const searchableFields = [item.name, item.brand, item.category, item.sku, item.slug]
    .filter(Boolean)
    .map(normalizeText);
  const exact = searchableFields.some((field) => field === query);
  const startsWith = searchableFields.some((field) => field.startsWith(query));
  const includes = searchableFields.some((field) => field.includes(query));

  let score = 0;
  if (exact) score += 100;
  if (startsWith) score += 50;
  if (includes) score += 25;
  if (normalizeText(item.sku) === query) score += 75;
  if (normalizeText(item.brand).includes(query)) score += 15;
  if (normalizeText(item.category).includes(query)) score += 10;

  return score;
}

function readTextFromSelectors($, selectors) {
  for (const selector of selectors) {
    const text = $(selector).first().text().replace(/\s+/g, ' ').trim();
    if (text) return text;
  }
  return null;
}

class StorefrontScraper {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || DEFAULT_BASE_URL;
    this.headless = options.headless ?? true;
    this.launchOptions = options.launchOptions || {};
    this.browserPromise = null;
  }

  async close() {
    if (this.browserPromise) {
      const browser = await this.browserPromise;
      await browser.close();
      this.browserPromise = null;
    }
  }

  async ensureBrowser() {
    if (!this.browserPromise) {
      this.browserPromise = chromium.launch({
        headless: this.headless,
        ...this.launchOptions,
      }).catch((error) => {
        this.browserPromise = null;
        throw error;
      });
    }
    return this.browserPromise;
  }

  async fetchJson(pathname) {
    const url = new URL(pathname, this.baseUrl).toString();
    const response = await fetch(url, {
      headers: {
        accept: 'application/json, text/plain, */*',
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Request failed ${response.status} for ${pathname}${body ? `: ${body.slice(0, 200)}` : ''}`);
    }

    return response.json();
  }

  async getListingsPage(page = 1, limit = DEFAULT_SEARCH_PAGE_SIZE) {
    return this.fetchJson(`/api/v2/listings?page=${page}&limit=${limit}`);
  }

  async getItemById(id) {
    return this.fetchJson(`/api/v2/items/${id}`);
  }

  async getUiManifest() {
    return this.fetchJson('/api/v2/ui/manifest');
  }

  async searchProducts(query, options = {}) {
    const normalizedQuery = normalizeText(query);
    const pageSize = options.pageSize || DEFAULT_SEARCH_PAGE_SIZE;
    const maxPages = options.maxPages || 20;
    const collected = [];
    const seenIds = new Set();
    let totalPages = 1;

    for (let page = 1; page <= totalPages && page <= maxPages; page += 1) {
      const payload = await this.getListingsPage(page, pageSize);
      totalPages = payload.totalPages || totalPages;
      const items = Array.isArray(payload.results) ? payload.results : [];

      for (const item of items) {
        if (seenIds.has(item.id)) {
          continue;
        }
        const score = scoreSearchResult(item, normalizedQuery);
        if (score > 0) {
          seenIds.add(item.id);
          collected.push({
            id: item.id,
            slug: item.slug,
            name: item.name,
            brand: item.brand,
            category: item.category,
            sku: item.sku,
            score,
            url: buildItemUrl(this.baseUrl, item.id),
          });

          if (collected.length >= (options.limit || 25)) {
            return collected
              .sort((left, right) => {
                if (right.score !== left.score) return right.score - left.score;
                return String(left.name).localeCompare(String(right.name));
              })
              .slice(0, options.limit || 25);
          }
        }
      }
    }

    return collected
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return String(left.name).localeCompare(String(right.name));
      })
      .slice(0, options.limit || 25);
  }

  resolveOption(item, optionInput) {
    if (!Array.isArray(item?.options) || item.options.length === 0) {
      return null;
    }

    if (!optionInput) {
      return item.options[0];
    }

    const normalizedInput = normalizeText(optionInput);
    return item.options.find((option) => {
      return normalizeText(option.id) === normalizedInput
        || normalizeText(option.label) === normalizedInput
        || normalizeText(option.label).includes(normalizedInput);
    }) || null;
  }

  buildSelectors(manifest = {}) {
    const classes = manifest.classes || {};
    return {
      priceWrap: classes.priceWrap ? `.${classes.priceWrap}` : '.offer-panel',
      priceValue: classes.priceValue ? `.${classes.priceValue}` : '.offer-ready .price-value',
      stock: classes.stock ? `.${classes.stock}` : '.offer-ready .avail-pill',
    };
  }

  async chooseOption(page, item, optionInput) {
    const chosenOption = this.resolveOption(item, optionInput);

    if (!chosenOption) {
      return null;
    }

    const optionButton = page.getByRole('button', { name: new RegExp(`^${escapeRegex(chosenOption.label)}$`, 'i') });
    await optionButton.click({ timeout: 5000 });
    await page.waitForTimeout(150);
    return chosenOption;
  }

  async unlockPricePanel(page, selectors, timeoutMs) {
    const panel = page.locator(selectors.priceWrap).first();
    await panel.waitFor({ state: 'visible', timeout: timeoutMs });

    const box = await panel.boundingBox();
    if (!box) {
      throw new Error('Could not find the price panel on the page');
    }

    const points = [
      { x: box.x + Math.max(10, box.width * 0.2), y: box.y + Math.max(10, box.height * 0.2) },
      { x: box.x + Math.max(15, box.width * 0.6), y: box.y + Math.max(15, box.height * 0.3) },
      { x: box.x + Math.max(20, box.width * 0.4), y: box.y + Math.max(20, box.height * 0.7) },
      { x: box.x + Math.max(25, box.width * 0.75), y: box.y + Math.max(25, box.height * 0.55) },
      { x: box.x + Math.max(12, box.width * 0.25), y: box.y + Math.max(12, box.height * 0.65) },
      { x: box.x + Math.max(18, box.width * 0.5), y: box.y + Math.max(18, box.height * 0.15) },
      { x: box.x + Math.max(22, box.width * 0.8), y: box.y + Math.max(22, box.height * 0.75) },
      { x: box.x + Math.max(28, box.width * 0.35), y: box.y + Math.max(28, box.height * 0.45) },
    ];

    for (const point of points) {
      await page.mouse.move(point.x, point.y, { steps: 6 });
      await page.waitForTimeout(160);
    }

    await page.waitForTimeout(800);

    const button = page.getByRole('button', { name: /Check today.?s price/i }).first();
    const enabled = await button.isEnabled().catch(() => false);
    if (!enabled) {
      throw new Error('Price button stayed disabled after hover interaction');
    }

    await button.click({ timeout: timeoutMs });
  }

  async readPriceAndStock(page, selectors, timeoutMs) {
    await page.waitForSelector('.offer-ready, .offer-failed', { timeout: timeoutMs });
    const failurePanel = page.locator('.offer-failed').first();
    if (await failurePanel.count()) {
      const failureText = await failurePanel.innerText().catch(() => 'The store rejected the price request');
      throw new Error(failureText.trim() || 'The store rejected the price request');
    }

    const html = await page.content();
    const $ = cheerio.load(html);
    const priceText = readTextFromSelectors($, [
      selectors.priceValue,
      '.offer-ready [data-price="true"]',
      '.offer-ready .amount',
      '.offer-ready .price-value',
    ]);
    const stockText = readTextFromSelectors($, [
      `${selectors.stock} .avail-pill`,
      '.offer-ready .avail-pill',
      '.offer-ready [class*="avail-pill"]',
    ]);

    if (!priceText) {
      throw new Error('Price text was not found after the quote loaded');
    }

    return {
      priceText,
      priceAmount: parsePriceAmount(priceText),
      stockText,
      stockQuantity: parseStockQuantity(stockText),
      stockAvailable: stockText ? !/sold out/i.test(stockText) : null,
    };
  }

  async scrapeProduct(input = {}) {
    const attempts = input.attempts || DEFAULT_SCRAPE_ATTEMPTS;
    const timeoutMs = input.timeoutMs || 25000;

    let item = null;
    let chosenOption = null;
    try {
      item = await this.getItemById(input.productId);
      chosenOption = this.resolveOption(item, input.optionLabel || input.optionId);
      if (Array.isArray(item.options) && item.options.length > 0 && !chosenOption) {
        return this.buildFailureResult(item, input.optionLabel || input.optionId, new Error('Requested option was not found on the product page'));
      }
    } catch (error) {
      return this.buildFailureResult(item, input.optionLabel || input.optionId, error);
    }

    const manifest = await this.getUiManifest().catch(() => ({}));
    const selectors = this.buildSelectors(manifest);
    const browser = await this.ensureBrowser();
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1200 },
        locale: 'en-US',
        javaScriptEnabled: true,
      });
      const page = await context.newPage();

      try {
        const itemUrl = buildItemUrl(this.baseUrl, item.id);
        await page.goto(itemUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
        await page.waitForSelector(selectors.priceWrap, { timeout: timeoutMs });

        if (chosenOption) {
          await this.chooseOption(page, item, chosenOption.id);
        }

        await this.unlockPricePanel(page, selectors, timeoutMs);
        const priceInfo = await this.readPriceAndStock(page, selectors, timeoutMs);

        return {
          productId: item.id,
          productSlug: item.slug,
          productName: item.name,
          productBrand: item.brand,
          productCategory: item.category,
          productSku: item.sku,
          productUrl: itemUrl,
          optionId: chosenOption?.id || null,
          optionLabel: chosenOption?.label || null,
          scrapedAt: new Date().toISOString(),
          outcome: attempt === 1 ? 'success' : 'retried',
          attemptsUsed: attempt,
          priceText: priceInfo.priceText,
          priceAmount: priceInfo.priceAmount,
          stockText: priceInfo.stockText,
          stockQuantity: priceInfo.stockQuantity,
          stockAvailable: priceInfo.stockAvailable,
          error: null,
        };
      } catch (error) {
        lastError = error;
        if (attempt < attempts) {
          await sleep(backoffDelayMs(attempt));
        }
      } finally {
        await page.close().catch(() => {});
        await context.close().catch(() => {});
      }
    }

    return this.buildFailureResult(item, chosenOption?.label || input.optionLabel || input.optionId, lastError, attempts);
  }

  buildFailureResult(item, optionInput, error, attemptsUsed = DEFAULT_SCRAPE_ATTEMPTS) {
    return {
      productId: item?.id ?? null,
      productSlug: item?.slug ?? null,
      productName: item?.name ?? null,
      productBrand: item?.brand ?? null,
      productCategory: item?.category ?? null,
      productSku: item?.sku ?? null,
      productUrl: item?.id ? buildItemUrl(this.baseUrl, item.id) : null,
      optionId: null,
      optionLabel: optionInput || null,
      scrapedAt: new Date().toISOString(),
      outcome: 'failed',
      attemptsUsed,
      priceText: null,
      priceAmount: null,
      stockText: null,
      stockQuantity: null,
      stockAvailable: null,
      error: error?.message || String(error || 'Unknown scrape failure'),
    };
  }
}

module.exports = {
  StorefrontScraper,
  DEFAULT_BASE_URL,
  buildItemUrl,
  normalizeText,
};
