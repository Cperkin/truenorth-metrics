
// /functions/api/rent/zones.js
// CMHC Zones dataset service (Canada-wide)
// - Preferred inputs under /data/ :
//     1) cmhc_rms_canada_2025.json  ← normalized national JSON (see shape below)
//     2) cmhc_rms_canada_2025.csv   ← raw national CSV (this script parses it)
// - Backward-compatibility fallback:
//     /data/cmhc_vancouver_zone_rents_2025.json  ← your existing Vancouver file
//
// Query params:
//   ?city=Toronto          → filter rows by city
//   ?list=cities           → return only the list of cities
//
// Expected normalized row shape:
//   { city, geography, zone, rent_median: { total, '0','1','2','3' }, rent_avg: {...}, reliability: {...} }
//
// Expected CSV columns (flexible matching, case-insensitive):
//   city | geography | zone (or name) | Apartment Bedroom Type | Median Rent ($) | Average Rent ($) | Reliability letter
//   where “geography” is often "zone" or "cma"/"csd"; we pass through what you provide.

export async function onRequest({ request }) {
  try {
    const { searchParams, origin, pathname } = new URL(request.url);
    const cityFilter = (searchParams.get('city') || '').trim();
    const listType   = (searchParams.get('list') || '').trim().toLowerCase();

    // 1) Try unified JSON (national)
    let dataset = await tryLoadJson('/data/cmhc_rms_canada_2025.json', request);
    if (!dataset) {
      // 2) Try unified CSV (national)
      dataset = await tryLoadCsv('/data/cmhc_rms_canada_2025.csv', request);
    }
    if (!dataset) {
      // 3) Fallback: your legacy Vancouver JSON
      dataset = await tryLoadJson('/data/cmhc_vancouver_zone_rents_2025.json', request);
      // Normalize minimal fields for the UI (synthesize city="Vancouver" if missing)
      if (dataset && dataset.rows) {
        dataset.rows.forEach(r => { if (!r.city) r.city = 'Vancouver'; if (!r.geography) r.geography = 'zone'; });
      }
    }
    if (!dataset) {
      return respond({ error: 'No CMHC dataset found under /data (expected *canada* JSON or CSV, or Vancouver JSON fallback).'}, 404);
    }

    // Filter by city if requested
    let rows = dataset.rows || [];
    if (cityFilter) rows = rows.filter(r => (r.city || '').trim() === cityFilter);

    // Return list of cities only
    if (listType === 'cities') {
      const cities = Array.from(new Set((dataset.rows || []).map(r => r.city).filter(Boolean))).sort();
      return respond({ cities });
    }

    return respond({
      vintage: dataset.vintage || 'CMHC RMS (latest export)',
      geography: dataset.geography || 'Zone / CMA / CSD',
      units: dataset.units || 'CAD per month',
      source: dataset.source || 'CMHC HMIP / RMS tables',
      rows
    });
  } catch (err) {
    return respond({ error: err.message || String(err) }, 500);
  }
}

// ───────────────────────────── helpers ─────────────────────────────

async function tryLoadJson(path, request) {
  try {
    const url = new URL(path, request.url);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return null;
    const j = await res.json();
    if (!j || !Array.isArray(j.rows)) return null;
    return j;
  } catch { return null; }
}

async function tryLoadCsv(path, request) {
  try {
    const url = new URL(path, request.url);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const text = await res.text();
    const parsed = normalizeHMIPCanadaCsv(text);
    return parsed;
  } catch { return null; }
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

// ───────────── CSV normalization (national) ─────────────
// Flexible matcher for headers likely to appear in HMIP exports or RMS tables
function normalizeHMIPCanadaCsv(csv) {
  const rows = parseCSV(csv);
  if (!rows.length) return baseMeta([]);

  const header = rows[0].map(h => (h || '').trim());
  const H = (needle) => header.findIndex(c => c.toLowerCase().includes(needle));

  const idxCity = H('city');
  const idxGeo  = H('geograph');          // geography
  const idxZone = matchAny(header, ['zone', 'neighbour', 'neighborhood', 'name']); // zone/name
  const idxBR   = H('bedroom');
  const idxMed  = header.findIndex(c => c.toLowerCase().includes('median') && c.includes('$'));
  const idxAvg  = header.findIndex(c => c.toLowerCase().includes('average') && c.includes('$'));
  const idxRel  = header.findIndex(c => c.toLowerCase().includes('reliab'));

