import { useEffect, useMemo, useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

function formatMoney(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value));
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function buildCsvUrl(trackedProductId) {
  const url = new URL(`${API_BASE_URL}/api/export.csv`);
  if (trackedProductId) {
    url.searchParams.set('trackedProductId', trackedProductId);
  }
  return url.toString();
}

async function fetchJson(path, options) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }
  return payload;
}

function MiniChart({ points }) {
  const data = useMemo(() => {
    return (points || [])
      .filter((point) => point.price_amount !== null && point.price_amount !== undefined)
      .map((point, index) => ({
        x: index,
        y: Number(point.price_amount),
        label: new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric' }).format(new Date(point.scraped_at)),
      }));
  }, [points]);

  if (!data.length) {
    return <div className="chart-empty">No price history yet.</div>;
  }

  const width = 700;
  const height = 220;
  const padding = 28;
  const min = Math.min(...data.map((point) => point.y));
  const max = Math.max(...data.map((point) => point.y));
  const span = Math.max(1, max - min);

  const coords = data.map((point, index) => {
    const x = padding + (index / Math.max(1, data.length - 1)) * (width - padding * 2);
    const y = padding + (1 - (point.y - min) / span) * (height - padding * 2);
    return { ...point, x, y };
  });

  const path = coords
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');

  return (
    <div className="chart-card">
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" aria-label="Price chart">
        <defs>
          <linearGradient id="lineGradient" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="chart-axis" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} className="chart-axis" />
        <path d={path} fill="none" stroke="url(#lineGradient)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((point) => (
          <g key={`${point.x}-${point.y}`}>
            <circle cx={point.x} cy={point.y} r="5" className="chart-point" />
            <title>{`${point.label}: ${formatMoney(point.y)}`}</title>
          </g>
        ))}
      </svg>
      <div className="chart-legend">
        <span>Min {formatMoney(min)}</span>
        <span>Max {formatMoney(max)}</span>
      </div>
    </div>
  );
}

function ProductCard({ product, selected, onSelect, onTrack, onScrape, onUntrack }) {
  return (
    <div
      className={`product-card ${selected ? 'selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(product)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(product);
        }
      }}
    >
      <div className="product-card-head">
        <div>
          <h3>{product.productName}</h3>
          <p>{product.productBrand || 'Unknown brand'} · {product.productCategory || 'Uncategorized'}</p>
        </div>
        <span className={`status-pill ${product.isTracked ? 'success' : 'muted'}`}>
          {product.isTracked ? 'Tracked' : 'Inactive'}
        </span>
      </div>
      <div className="product-meta">
        <span>ID {product.productId}</span>
        <span>{product.optionLabel || product.optionKey || 'Default option'}</span>
      </div>
      <div className="product-actions">
        <button type="button" className="btn secondary" onClick={(event) => { event.stopPropagation(); onTrack(product); }}>
          Track
        </button>
        <button type="button" className="btn secondary" onClick={(event) => { event.stopPropagation(); onScrape(product); }}>
          Scrape now
        </button>
        <button type="button" className="btn ghost" onClick={(event) => { event.stopPropagation(); onUntrack(product); }}>
          Untrack
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [trackedProducts, setTrackedProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [history, setHistory] = useState([]);
  const [chartPoints, setChartPoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function loadTrackedProducts() {
    const payload = await fetchJson('/api/tracked-products?includeInactive=true');
    setTrackedProducts(payload.trackedProducts || []);
    if (!selectedProduct && payload.trackedProducts?.length) {
      setSelectedProduct(payload.trackedProducts[0]);
    }
  }

  async function loadDetails(productId) {
    const [historyPayload, chartPayload] = await Promise.all([
      fetchJson(`/api/tracked-products/${productId}/history?limit=50`),
      fetchJson(`/api/tracked-products/${productId}/chart-data`),
    ]);
    setHistory(historyPayload.logs || []);
    setChartPoints(chartPayload.points || []);
  }

  useEffect(() => {
    loadTrackedProducts().catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (selectedProduct?.id) {
      loadDetails(selectedProduct.id).catch((error) => setMessage(error.message));
    }
  }, [selectedProduct?.id]);

  async function runSearch(event) {
    event.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setMessage('');
    try {
      const payload = await fetchJson(`/api/search?q=${encodeURIComponent(query.trim())}`);
      setSearchResults(payload.results || []);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function trackProduct(product) {
    setMessage('');
    try {
      const payload = await fetchJson('/api/tracked-products', {
        method: 'POST',
        body: JSON.stringify({
          productId: product.id,
          optionLabel: product.optionLabel,
          optionId: product.optionId,
        }),
      });
      setMessage(`Tracked ${payload.trackedProduct.productName}`);
      await loadTrackedProducts();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function untrackProduct(product) {
    setMessage('');
    try {
      await fetchJson(`/api/tracked-products/${product.id}/untrack`, { method: 'POST' });
      setMessage(`Untracked ${product.productName}`);
      await loadTrackedProducts();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function scrapeProduct(product) {
    setMessage('');
    try {
      const payload = await fetchJson(`/api/tracked-products/${product.id}/scrape`, { method: 'POST' });
      setMessage(`Scrape ${payload.log.outcome} for ${payload.trackedProduct.productName}`);
      await loadTrackedProducts();
      setSelectedProduct(payload.trackedProduct);
    } catch (error) {
      setMessage(error.message);
    }
  }

  const exportUrl = buildCsvUrl(selectedProduct?.id);

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <span className="eyebrow">INE Scrapper</span>
          <h1>Price tracker dashboard</h1>
          <p>Search products, track options, run scrapes, and review charted price history from the backend API.</p>
        </div>
        <div className="hero-metrics">
          <div>
            <strong>{trackedProducts.length}</strong>
            <span>Tracked items</span>
          </div>
          <div>
            <strong>{history.length}</strong>
            <span>Log rows</span>
          </div>
          <div>
            <strong>{searchResults.length}</strong>
            <span>Search matches</span>
          </div>
        </div>
      </header>

      <section className="panel search-panel">
        <form onSubmit={runSearch} className="search-form">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by product name, brand, SKU, or category"
          />
          <button className="btn primary" type="submit" disabled={loading}>
            {loading ? 'Searching…' : 'Search'}
          </button>
          <a className="btn ghost" href={exportUrl} target="_blank" rel="noreferrer">
            Export CSV
          </a>
        </form>
        {message ? <p className="message">{message}</p> : null}
      </section>

      <main className="grid-layout">
        <section className="panel">
          <div className="section-head">
            <h2>Search results</h2>
            <p>{searchResults.length} products found</p>
          </div>
          <div className="card-list">
            {searchResults.map((product) => (
              <div key={product.id} className="search-result">
                <div>
                  <h3>{product.name}</h3>
                  <p>{product.brand} · {product.category} · {product.sku}</p>
                </div>
                <div className="result-actions">
                  <button className="btn secondary" type="button" onClick={() => trackProduct(product)}>
                    Track
                  </button>
                  <a className="btn ghost" href={product.url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </div>
              </div>
            ))}
            {!searchResults.length ? <div className="empty-state">Search for a product to begin.</div> : null}
          </div>
        </section>

        <section className="panel">
          <div className="section-head">
            <h2>Tracked products</h2>
            <p>Click a card to inspect chart and logs</p>
          </div>
          <div className="tracked-list">
            {trackedProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                selected={selectedProduct?.id === product.id}
                onSelect={setSelectedProduct}
                onTrack={trackProduct}
                onScrape={scrapeProduct}
                onUntrack={untrackProduct}
              />
            ))}
            {!trackedProducts.length ? <div className="empty-state">No tracked products yet.</div> : null}
          </div>
        </section>
      </main>

      <section className="panel detail-panel">
        <div className="section-head">
          <h2>Selected product</h2>
          <p>{selectedProduct ? selectedProduct.productName : 'Pick a tracked product'}</p>
        </div>

        {selectedProduct ? (
          <>
            <MiniChart points={chartPoints} />
            <div className="log-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th>Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDateTime(row.scrapedAt)}</td>
                      <td>{row.priceText || '—'}</td>
                      <td>{row.stockText || '—'}</td>
                      <td>
                        <span className={`status-pill ${row.outcome === 'failed' ? 'danger' : 'success'}`}>
                          {row.outcome}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!history.length ? <div className="empty-state">No scrape logs for this product yet.</div> : null}
            </div>
          </>
        ) : (
          <div className="empty-state">Select a tracked product to see its price chart and scrape log.</div>
        )}
      </section>
    </div>
  );
}
