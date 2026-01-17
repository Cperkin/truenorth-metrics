
// Rent Fairness (CMHC-first) — v1.1
// GET /api/rent/estimate?zone=Downtown&bedrooms=2&rent=2500

export async function onRequest({ request }) {
  try {
    const { searchParams } = new URL(request.url);
    const zone = (searchParams.get('zone') || '').trim();
    const br   = (searchParams.get('bedrooms') || 'total').trim();
    const rent = Number(searchParams.get('rent'));

    if (!zone || !Number.isFinite(rent) || rent <= 0) {
      return json({ error: 'Missing or invalid query. Example: /api/rent/estimate?zone=Kitsilano%2FPoint%20Grey&bedrooms=2&rent=2500' }, 400);
    }

    // Load normalized CMHC zones dataset
    const zonesUrl = new URL('/api/rent/zones', request.url);
    const dataset = await fetch(zonesUrl, { cache: 'no-store' }).then(r => r.json());

    const rows = dataset.rows || [];
    const target = findZone(rows, zone);
    if (!target) {
      return json({ error: `Zone not found: "${zone}".`, zones: rows.map(r => r.zone).sort() }, 404);
    }

    const bbed = normalizeBR(br);

    // Prefer median at bedroom; fallback to avg at bedroom; else totals
    const med = pick(target.rent_median, bbed);
    const avg = pick(target.rent_avg, bbed);
    const benchmark = nn(med) ? med : (nn(avg) ? avg : (nn(target.rent_median?.total) ? target.rent_median.total : target.rent_avg?.total));

    if (!nn(benchmark)) return json({ error: `No usable benchmark for zone: ${target.zone}` }, 422);

    const delta = rent - benchmark;
    const pct = benchmark ? (delta / benchmark) : 0;
    const verdict = pct > 0.10 ? 'likely-overpaying' : pct < -0.10 ? 'likely-underpaying' : 'fair-range';

    // Reliability — prefer bedroom-specific letter, else total
    const reli = (target.reliability && (target.reliability[bbed] || target.reliability.total)) || null;

    return json({
      inputs: { zone: target.zone, bedrooms: bbed, rent },
      benchmark: {
        value: Math.round(benchmark),
        basis: nn(med) ? 'median' : 'average',
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
        scope: 'CMHC Rental Market Survey (purpose-built). Benchmarks are zone + bedroom medians where available.',
        caveats: [
          'Rents differ by inclusions (utilities, parking, appliances). Treat as guidance.',
          'Some bedroom-level medians may be suppressed; we fall back to averages or totals.'
        ]
      }
    });

  } catch (err) {
    return json({ error: err.message || String(err) }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' }
  });
}

function findZone(rows, z) {
  const exact = rows.find(r => r.zone === z);
  if (exact) return exact;
  const zl = z.toLowerCase();
  return rows.find(r => (r.zone || '').toLowerCase() === zl);
}

function normalizeBR(s) {
  s = (s || '').toString().toLowerCase();
  if (['0', 'studio', 'bachelor'].some(k => s.includes(k))) return '0';
  if (s.includes('1')) return '1';
  if (s.includes('2')) return '2';
  if (s.includes('3')) return '3';
  if (s === 'total') return 'total';
  return 'total';
}

function pick(obj, key) { return obj ? obj[key] : undefined; }
function nn(v) { return Number.isFinite(v); }
