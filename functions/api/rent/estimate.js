
// /functions/api/rent/estimate.js
// Rent Fairness (CMHC-first) — v2.0 (Canada-wide, city-aware)
// REQUIRED QUERY PARAMS:
//   city=<City Name>
//   zone=<Zone or Neighbourhood Name>
//   bedrooms=total|0|1|2|3
//   rent=<monthly rent>
//
// Operates on the unified RMS dataset served by /api/rent/zones.
// This endpoint now:
//  1) Requires city
//  2) Filters rows by city first, then by zone
//  3) Falls back logically if bedroom-specific or median values are suppressed
//  4) Returns verdict, deltas, reliability, and provenance

export async function onRequest({ request }) {
  try {
    const { searchParams } = new URL(request.url);

    const city = (searchParams.get('city') || '').trim();
    const zone = (searchParams.get('zone') || '').trim();
    const br   = (searchParams.get('bedrooms') || 'total').trim();
    const rent = Number(searchParams.get('rent'));

    // ───────────────────────────────
    // Validate params
    // ───────────────────────────────
    if (!city)
      return json({ error: 'Missing required parameter: city' }, 400);

    if (!zone)
      return json({ error: 'Missing required parameter: zone' }, 400);

    if (!Number.isFinite(rent) || rent <= 0)
      return json({ error: 'Invalid rent. Example: &rent=2500' }, 400);

    const bedroomKey = normalizeBR(br);

    // ───────────────────────────────
    // Load the Canada-wide dataset (through zones API)
    // ───────────────────────────────
    const zonesUrl = new URL(`/api/rent/zones?city=${encodeURIComponent(city)}`, request.url);
    const dataset = await fetch(zonesUrl, { cache: 'no-store' }).then(r => r.json());

    if (!dataset.rows || dataset.rows.length === 0) {
      return json({ error: `No data found for city: ${city}` }, 404);
    }

    // ───────────────────────────────
    // Find the matching zone inside the city
    // ───────────────────────────────
    const target = findZone(dataset.rows, zone);
    if (!target) {
      return json({
        error: `Zone "${zone}" not found in city "${city}".`,
        zones: dataset.rows.map(r => r.zone).sort()
      }, 404);
    }

    // ───────────────────────────────
    // Resolve benchmark:
    // median(br) → avg(br) → median(total) → avg(total)
    // ───────────────────────────────
    const medBr = pick(target.rent_median, bedroomKey);
    const avgBr = pick(target.rent_avg, bedroomKey);

    const medTotal = target.rent_median?.total;
    const avgTotal = target.rent_avg?.total;

    const benchmark =
      (nn(medBr)    && medBr)    ||
      (nn(avgBr)    && avgBr)    ||
      (nn(medTotal) && medTotal) ||
      (nn(avgTotal) && avgTotal) ||
      null;

    if (!nn(benchmark)) {
      return json({
        error: `No usable benchmark for ${city} → ${zone}`,
        note:  'Try another bedroom type or check if this zone has suppressed cells.'
      }, 422);
    }

    // ───────────────────────────────
    // Verdict calculation
    // ───────────────────────────────
    const delta = rent - benchmark;
    const pct   = benchmark ? delta / benchmark : 0;

    const verdict =
      pct > 0.10 ? 'likely-overpaying' :
      pct < -0.10 ? 'likely-underpaying' :
      'fair-range';

    // Reliability: prefer bedroom-specific letter, else total
    const reli =
      (target.reliability && (target.reliability[bedroomKey] || target.reliability.total))
      || null;

    // ───────────────────────────────
    // Final JSON response
    // ───────────────────────────────
    return json({
      inputs: {
        city,
        zone: target.zone,
        bedrooms: bedroomKey,
        rent
      },
      benchmark: {
        value: Math.round(benchmark),
        basis: nn(medBr) ? 'median' : nn(avgBr) ? 'average' : nn(medTotal) ? 'median' : 'average',
        reliability: reli,
        vintage: dataset.vintage,
        source: dataset.source
      },
      result: {
        verdict,
        delta: Math.round(delta),
        percent: Number((pct * 100).toFixed(1))
      },
      notes: {
        scope: 'CMHC Rental Market Survey (purpose-built). Benchmarks reflect City → Zone → Bedroom medians where available.',
        caveats: [
          'Rents differ by inclusions (utilities, parking, appliances). Guidance only.',
          'Some zone/bedroom medians are suppressed and fallback logic is applied.'
        ]
      }
    });
  } catch (err) {
    return json({ error: err.message || String(err) }, 500);
  }
}

// ───────────────────────────────
// Utility helpers
// ───────────────────────────────

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'access-control-allow-origin': '*'
    }
  });
}

function findZone(rows, zone) {
  const exact = rows.find(r => r.zone === zone);
  if (exact) return exact;
  const zl = zone.toLowerCase();
  return rows.find(r => (r.zone || '').toLowerCase() === zl);
}

function normalizeBR(s) {
  const t = (s || '').toString().toLowerCase();
  if (['0','studio','bachelor'].some(k => t.includes(k))) return '0';
  if (t.includes('1')) return '1';
  if (t.includes('2')) return '2';
  if (t.includes('3')) return '3';
  if (t.includes('total') || t.includes('all')) return 'total';
  return 'total';
}

function pick(obj, key) {
  return obj ? obj[key] : undefined;
}

function nn(v) {
  return Number.isFinite(v);
}
