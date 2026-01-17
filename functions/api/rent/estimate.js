
// Rent Fairness (CMHC-first) — Vancouver v1
// Benchmarks user-entered rent against CMHC RMS (Median Rent, All Bedrooms) by Zone.
// Inputs (query): zone=<zone name>, rent=<number>
// Output: JSON with verdict, deltas, benchmark, reliability, and provenance.

export async function onRequest({ request }) {
  try {
    const { searchParams } = new URL(request.url);
    const zone = (searchParams.get('zone') || '').trim();
    const rent = Number(searchParams.get('rent'));

    if (!zone || !Number.isFinite(rent) || rent <= 0) {
      return json({ error: 'Missing or invalid query. Example: /api/rent/estimate?zone=Kitsilano%2FPoint%20Grey&rent=2500' }, 400);
    }

    // Load CMHC RMS zone medians for Vancouver (2025 vintage in this starter)
    const dataUrl = new URL('/data/cmhc_vancouver_zone_rents_2025.json', request.url);
    const dataset = await fetch(dataUrl, { cache: 'no-store' }).then(r => r.json());

    // Try exact match, else case-insensitive match
    const rows = dataset.rows || [];
    let row = rows.find(r => r.zone === zone);
    if (!row) {
      const z = zone.toLowerCase();
      row = rows.find(r => (r.zone || '').toLowerCase() === z);
    }
    if (!row) {
      return json({ error: `Zone not found: "${zone}".`, zones: rows.map(r => r.zone).sort() }, 404);
    }

    // Prefer median; if suppressed/null, fall back to average
    const median = row.rent_median?.total ?? null;
    const avg = row.rent_avg?.total ?? null;
    const benchmark = Number.isFinite(median) ? median : (Number.isFinite(avg) ? avg : null);

    if (!Number.isFinite(benchmark)) {
      return json({ error: `No usable rent benchmark for zone: ${zone}.` }, 422);
    }

    const delta = rent - benchmark;
    const pct = benchmark ? (delta / benchmark) : 0;

    const verdict = pct > 0.10 ? 'likely-overpaying'
                  : pct < -0.10 ? 'likely-underpaying'
                  : 'fair-range';

    return json({
      inputs: { zone, rent },
      benchmark: {
        value: Math.round(benchmark),
        basis: Number.isFinite(median) ? 'median' : 'average',
        reliability: row.reliability?.total || null,
        vintage: dataset.vintage,
        source: dataset.source
      },
      result: {
        verdict,
        delta: Math.round(delta),
        percent: Number((pct * 100).toFixed(1))
      },
      notes: {
        scope: "CMHC Rental Market Survey (purpose-built, all bedrooms). See CMHC HMIP.",
        caveats: [
          "Rents vary by inclusions (utilities, parking, appliances). Comparisons are guidance only.",
          "Medians may be suppressed in low-sample cells; we fall back to averages or broader geographies."
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
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'access-control-allow-origin': '*'
    }
  });
}

