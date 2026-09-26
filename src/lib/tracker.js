const { buildItemUrl } = require('../scraper');

function buildOptionKey(optionId, optionLabel) {
  return String(optionId || optionLabel || '').trim();
}

function toTrackedProductRow(scrapeResult) {
  const optionKey = buildOptionKey(scrapeResult.optionId, scrapeResult.optionLabel);

  return {
    product_id: scrapeResult.productId,
    product_slug: scrapeResult.productSlug || null,
    product_name: scrapeResult.productName,
    product_brand: scrapeResult.productBrand || null,
    product_category: scrapeResult.productCategory || null,
    product_sku: scrapeResult.productSku || null,
    option_key: optionKey,
    option_id: scrapeResult.optionId || null,
    option_label: scrapeResult.optionLabel || null,
    product_url: scrapeResult.productUrl || buildItemUrl(process.env.STOREFRONT_BASE_URL || 'https://demo.inelabteamdev.com', scrapeResult.productId),
    is_tracked: true,
    last_scraped_at: scrapeResult.scrapedAt || null,
  };
}

function toScrapeLogRow(scrapeResult, trackedProductId = null) {
  const optionKey = buildOptionKey(scrapeResult.optionId, scrapeResult.optionLabel);

  return {
    tracked_product_id: trackedProductId,
    product_id: scrapeResult.productId,
    product_name: scrapeResult.productName,
    option_key: optionKey,
    option_label: scrapeResult.optionLabel || null,
    scraped_at: scrapeResult.scrapedAt || new Date().toISOString(),
    price_text: scrapeResult.priceText || null,
    price_amount: scrapeResult.priceAmount ?? null,
    stock_text: scrapeResult.stockText || null,
    stock_quantity: scrapeResult.stockQuantity ?? null,
    stock_available: scrapeResult.stockAvailable ?? null,
    outcome: scrapeResult.outcome,
    attempt_count: scrapeResult.attemptsUsed || 1,
    error_message: scrapeResult.error || null,
    source_url: scrapeResult.productUrl || null,
  };
}

module.exports = {
  buildOptionKey,
  toTrackedProductRow,
  toScrapeLogRow,
};