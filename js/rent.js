
// Rent Fairness v2 (Canada-wide UI)
// - Loads full dataset via /api/rent/zones
// - Populates City dropdown, then Zones for the selected City
// - Calls /api/rent/estimate (v1.1) for the verdict
//   NOTE: If you later implement Part E (city-aware estimate), switch the fetch URL in onCheck().

const cityEl = document.getElementById('city');
const zoneEl = document.getElementById('zone');
const brEl   = document.getElementById('bedrooms');
const rentEl = document.getElementById('rent');
const btn    = document.getElementById('check');
const out    = document.getElementById('result');

let DATA = { rows: [] };

init().catch(err => {
  console.error(err);
  out.innerHTML = `<p role="alert">Failed to initialize. Please try again.</p>`;
});

async function init() {
  // Load the unified dataset (works with Vancouver-only JSON too)
  DATA = await fetch('/api/rent/zones', { cache: 'no-store' }).then(r => r.json());

  // 1) Populate City dropdown
  const cities = uniqueCities(DATA.rows);
  cityEl.innerHTML = '<option value="">Select a City…</option>' +
    cities.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

  // 2) If dataset has only one city (e.g., Vancouver-only), preselect and populate Zones
  if (cities.length === 1) {
    cityEl.value = cities[0];
    populateZones();
  }

  // Hook up events
  cityEl.addEventListener('change', populateZones);
  btn.addEventListener('click', onCheck);
}

function populateZones() {
  const city = cityEl.value;
  const zones = DATA.rows
    .filter(r => (!city || r.city === city))
    .map(r => r.zone)
    .filter(Boolean);
  const uniqueZones = Array.from(new Set(zones)).sort((a,b) => a.localeCompare(b));

  zoneEl.innerHTML = '<option value="">Select a Zone…</option>' +
    uniqueZones.map(z => `<option value="${escapeHtml(z)}">${escapeHtml(z)}</option>`).join('');

  out.innerHTML = ''; // clear old result
}

async function onCheck() {
  const city = cityEl.value;
  const zone = zoneEl.value;
  const br   = brEl.value;
  const rent = Number(rentEl.value);

  if (!city) {
    out.innerHTML = `<p role="alert">Please select a City.</p>`;
    return;
  }
  if (!zone) {
    out.innerHTML = `<p role="alert">Please select a Zone.</p>`;
    return;
  }
  if (!Number.isFinite(rent) || rent <= 0) {
    out.innerHTML = `<p role="alert">Please enter a valid monthly rent.</p>`;
    return;
  }

  out.innerHTML = `<p>Checking…</p>`;

  try {
    // ──────────────────────────────────────────────────────────────────────
    // If you have NOT yet applied Part E (city-aware /api/rent/estimate):
    // Keep using the original endpoint (which finds by zone only).
    // This works best when zone names are unique across cities.
    // ──────────────────────────────────────────────────────────────────────
    const url = `/api/rent/estimate?zone=${encodeURIComponent(zone)}&bedrooms=${encodeURIComponent(br)}&rent=${encodeURIComponent(rent)}`;

    // ──────────────────────────────────────────────────────────────────────
    // If you DO apply Part E later, switch to:
    // const url = `/api/rent/estimate?city=${encodeURIComponent(city)}&zone=${encodeURIComponent(zone)}&bedrooms=${encodeURIComponent(br)}&rent=${encodeURIComponent(rent)}`;
    // ──────────────────────────────────────────────────────────────────────

    const res = await fetch(url, { cache: 'no-store' });
    const j = await res.json();

    if (!res.ok) {
      out.innerHTML = `<p role="alert">${escapeHtml(j.error || 'Unexpected error')}</p>`;
      return;
    }

    renderResult(j, { city, zone, br, rent });
  } catch (e) {
    console.error(e);
    out.innerHTML = `<p role="alert">Failed to fetch estimate. Please try again.</p>`;
  }
}

function renderResult(j, inputs) {
  const vtxt = { 'likely-overpaying':'Likely Overpaying', 'fair-range':'In the Fair Range', 'likely-underpaying':'Likely Underpaying' }[j.result.verdict] || 'Result';
  const brLabel = { total:'All', '0':'Studio', '1':'1 BR', '2':'2 BR', '3':'3+ BR' }[j.inputs?.bedrooms || inputs.br] || inputs.br;

  const reliabilityText = explainReliability(j.benchmark.reliability);
  const reli = j.benchmark.reliability
    ? ` • reliability: <span title="${escapeHtml(reliabilityText || '')}">${escapeHtml(j.benchmark.reliability)}</span>`
    : '';

  out.innerHTML = `
    <h3 style="margin:0 0 .25rem 0;">${vtxt}</h3>
    <p style="margin:.25rem 0;">City: <strong>${escapeHtml(inputs.city)}</strong> • Zone: <strong>${escapeHtml(inputs.zone)}</strong> • Bedroom: <strong>${escapeHtml(brLabel)}</strong></p>
    <p style="margin:.25rem 0;">Your rent: <strong>$${fmt(inputs.rent)}</strong></p>
    <p style="margin:.25rem 0;">Benchmark (${j.benchmark.basis}): <strong>$${fmt(j.benchmark.value)}</strong> <small>${escapeHtml(j.benchmark.vintage)}${reli}</small></p>
    <p style="margin:.25rem 0;">Difference: <strong>$${fmt(j.result.delta)}</strong> (${j.result.percent}%)</p>
    <details style="margin-top:.5rem;">
      <summary>Method & caveats</summary>
      <ul>
        <li>CMHC Rental Market Survey (purpose‑built), City → Zone + bedroom medians where available (fallbacks apply if suppressed).</li>
        <li>Rents can differ by inclusions (utilities, parking, appliances). Guidance only.</li>
      </ul>
      <p><small>Source: ${escapeHtml(j.benchmark.source || 'CMHC HMIP / RMS tables')}</small></p>
    </details>`;
}

function uniqueCities(rows) {
  // If dataset lacks city field (legacy Vancouver-only JSON), synthesize a single “Vancouver” city
  const hasCity = rows.some(r => r.city);
  if (!hasCity) {
    rows.forEach(r => r.city = 'Vancouver');
  }
  return Array.from(new Set(rows.map(r => r.city).filter(Boolean))).sort((a,b) => a.localeCompare(b));
}

function explainReliability(letter) {
  const map = { a: 'Excellent', b: 'Very good', c: 'Good', d: 'Poor (use with caution)' };
  return map[String(letter || '').toLowerCase()] || null;
}

function fmt(n) { return new Intl.NumberFormat().format(Math.round(n)); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
``
