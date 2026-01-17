
// CMHC Zones dataset service (Vancouver)
// Serves normalized CMHC RMS zone rents. Prefers JSON under /data; if missing, tries CSV
// exported from HMIP and parses it on the fly.

export async function onRequest({ request }) {
  try {
    const base = new URL(request.url);
    const jsonUrl = new URL('/data/cmhc_vancouver_zone_rents_2025.json', base);
    const csvUrl  = new URL('/data/cmhc_vancouver_zone_rents_2025.csv', base);

    // Try JSON first
    const tryJson = await fetch(jsonUrl, { cache: 'no-store' });
    if (tryJson.ok && isJson(tryJson)) {
      const j = await tryJson.json();
      return respond(j);
    }

    // Fallback to CSV
    const tryCsv = await fetch(csvUrl, { cache: 'no-store' });
    if (!tryCsv.ok) return respond({ error: 'No CMHC dataset found in /data (expected JSON or CSV).'}, 404);
    const text = await tryCsv.text();
    const j = normalizeHMIPCsv(text);
    return respond(j);
  } catch (err) {
    return respond({ error: err.message || String(err) }, 500);
  }
}

function respond(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'access-control-allow-origin': '*'
    }
  });
}

function isJson(res) {
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json');
}

// --- HMIP CSV normalization ---
// Typical columns: Zone | Apartment Bedroom Type | Median Rent ($) | Average Rent ($) | Reliability letter
// Bedroom values: Total, Bachelor, 1 Bedroom, 2 Bedroom, 3 Bedroom+

function normalizeHMIPCsv(csv) {
  const rows = parseCSV(csv);
  if (!rows.length) return baseMeta([]);

  const header = rows[0].map(h => (h || '').trim());
  const H = (needle) => header.findIndex(c => c.toLowerCase().includes(needle));

  const idxZone = H('zone');
  const idxBR   = H('bedroom');
  const idxMed  = header.findIndex(c => c.toLowerCase().includes('median') && c.includes('$'));
  const idxAvg  = header.findIndex(c => c.toLowerCase().includes('average') && c.includes('$'));
  const idxRel  = header.findIndex(c => c.toLowerCase().includes('reliab'));

  const map = new Map();
  const keyOf = (z) => z.replace(/\s+/g, ' ').trim();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const zone = (r[idxZone] || '').trim();
    if (!zone) continue;
    const brRaw = (r[idxBR] || '').trim();
    const br = normalizeBR(brRaw);
    const med = toNum(r[idxMed]);
    const avg = toNum(r[idxAvg]);
    const rel = (r[idxRel] || '').trim();

    const key = keyOf(zone);
    if (!map.has(key)) map.set(key, { zone: key, rent_median: {}, rent_avg: {}, reliability: {} });
    const ref = map.get(key);

    if (Number.isFinite(med)) ref.rent_median[br] = med;
    if (Number.isFinite(avg)) ref.rent_avg[br] = avg;
    if (rel) ref.reliability[br] = rel;
  }

  return baseMeta(Array.from(map.values()));
}

function baseMeta(rows) {
  return {
    vintage: 'CMHC RMS (latest export)',
    geography: 'Zone (Vancouver)',
    units: 'CAD per month',
    source: 'CMHC HMIP — Vancouver, Summary by Zone',
    rows
  };
}

function normalizeBR(s) {
  const t = s.toLowerCase();
  if (t.includes('bachelor') || t === '0' || t.includes('studio')) return '0';
  if (t.includes('1')) return '1';
  if (t.includes('2')) return '2';
  if (t.includes('3')) return '3';
  if (t.includes('total') || t.includes('all')) return 'total';
  return 'total';
}

function toNum(v) {
  if (v == null) return undefined;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

// Minimal CSV parser (quotes + CRLF)
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQ = false; }
      } else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* ignore */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
