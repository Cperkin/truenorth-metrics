
// Cloudflare Pages Function: /api/topics
// Aggregates a published-to-web Google Sheet (CSV) into topic objects.
// Set env var SHEET_CSV_URL to your Google Sheet CSV publish URL.

export async function onRequest({ env, request }) {
  const url = env.SHEET_CSV_URL;
  if (!url) {
    return new Response(JSON.stringify({ error: 'Missing SHEET_CSV_URL env var' }), {
      status: 500,
      headers: corsJson()
    });
  }

  try {
    const res = await fetch(url, { cf: { cacheEverything: true, cacheTtl: 300 } });
    if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
    const text = await res.text();

    const rows = parseCSV(text);
    if (!rows.length) throw new Error('Empty sheet');
    const [header, ...data] = rows;
    const headers = header.map(h => (h || '').trim());

    const topicsMap = new Map();

    for (const row of data) {
      if (!row || row.length === 0) continue;
      const rec = rowToObj(headers, row);
      const id = (rec.id || '').trim();
      if (!id) continue; // skip rows without id

      if (!topicsMap.has(id)) {
        topicsMap.set(id, {
          id,
          title: rec.title || id,
          summary: rec.summary || '',
          lastUpdated: rec.lastUpdated || '',
          region: splitList(rec.region),
          status: (rec.status || 'active').toLowerCase(),
          metrics: {},
          links: []
        });
      }

      const t = topicsMap.get(id);
      // Metric aggregation
      if (rec.metric_key) {
        const key = String(rec.metric_key).trim();
        const val = parseMaybeNumber(rec.metric_value);
        if (key) t.metrics[key] = val;
      }
      // Link aggregation
      if (rec.link_url) {
        const label = rec.link_label || rec.link_url;
        t.links.push({ label, url: rec.link_url });
      }
      // Allow later rows to update summary/lastUpdated/status/region if provided
      if (rec.summary) t.summary = rec.summary;
      if (rec.lastUpdated) t.lastUpdated = rec.lastUpdated;
      if (rec.status) t.status = rec.status.toLowerCase();
      if (rec.region) t.region = splitList(rec.region);
      if (rec.title) t.title = rec.title;
    }

    const out = Array.from(topicsMap.values());
    return new Response(JSON.stringify(out, null, 2), { headers: corsJson() });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: corsJson()
    });
  }
}

function corsJson() {
  return {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'public, max-age=300',
    'access-control-allow-origin': '*'
  };
}

function rowToObj(headers, row) {
  const o = {};
  for (let i = 0; i < headers.length; i++) {
    o[headers[i]] = (row[i] ?? '').trim();
  }
  return o;
}

function splitList(val) {
  if (!val) return [];
  // Support pipe or comma separated
  return String(val).split(/\||,/).map(s => s.trim()).filter(Boolean);
}

function parseMaybeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

// Minimal CSV parser supporting quoted fields and escaped quotes
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { // escaped quote
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (c === '\r') {
        // ignore
      } else {
        field += c;
      }
    }
    i++;
  }
  // flush last field/row
  if (inQuotes) {
    // Unclosed quote – best effort flush
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

