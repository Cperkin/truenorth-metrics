
// Rent Fairness v1.1 client
const zoneEl = document.getElementById('zone');
const brEl   = document.getElementById('bedrooms');
const rentEl = document.getElementById('rent');
const btn    = document.getElementById('check');
const out    = document.getElementById('result');

let ZONES = [];

async function loadCities() {
  const data = await fetch('/api/rent/zones').then(r=>r.json());
  const cities = [...new Set(data.rows.map(r => r.city))].sort();

  cityEl.innerHTML = '<option value="">Select a City…</option>' +
    cities.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

  zoneEl.innerHTML = '<option value="">Select a Zone…</option>';
}

btn.addEventListener('click', async () => {
  const zone = zoneEl.value;
  const br   = brEl.value;
  const rent = Number(rentEl.value);
  if (!zone || !Number.isFinite(rent) || rent <= 0) {
    out.innerHTML = `<p role="alert">Please pick a Zone and enter a valid monthly rent.</p>`;
    return;
  }
  out.innerHTML = `<p>Checking…</p>`;
  try {
    const u = `/api/rent/estimate?zone=${encodeURIComponent(zone)}&bedrooms=${encodeURIComponent(br)}&rent=${encodeURIComponent(rent)}`;
    const res = await fetch(u, { cache: 'no-store' });
    const j = await res.json();
    if (!res.ok) {
      out.innerHTML = `<p role="alert">${escapeHtml(j.error || 'Unexpected error')}</p>`;
      return;
    }
    render(j, rent);
  } catch (e) {
    out.innerHTML = `<p role="alert">Failed to fetch estimate. Please try again.</p>`;
  }
});

function explainReliability(letter) {
  const map = { a: 'Excellent', b: 'Very good', c: 'Good', d: 'Poor (use with caution)' };
  return map[String(letter || '').toLowerCase()] || null;
}


cityEl.addEventListener('change', () => {
  const city = cityEl.value;
  const options = DATA.rows
      .filter(r => r.city === city)
      .map(r => r.zone)
      .sort();

  zoneEl.innerHTML = '<option value="">Select a Zone…</option>' +
    options.map(z => `<option value="${escapeHtml(z)}">${escapeHtml(z)}</option>`).join('');
});

function render(j, rent) {
  const vtxt = { 'likely-overpaying':'Likely Overpaying', 'fair-range':'In the Fair Range', 'likely-underpaying':'Likely Underpaying' }[j.result.verdict] || 'Result';
  const brLabel = { total:'All', '0':'Studio', '1':'1 BR', '2':'2 BR', '3':'3+ BR' }[j.inputs.bedrooms] || j.inputs.bedrooms;
  const reliText = explainReliability(j.benchmark.reliability);
  const reli = j.benchmark.reliability? ` • reliability: <span title="${escapeHtml(reliText || '')}">${escapeHtml(j.benchmark.reliability)}</span>`: '';
  out.innerHTML = `
    <h3 style="margin:0 0 .25rem 0;">${vtxt}</h3>
    <p style="margin:.25rem 0;">Zone: <strong>${escapeHtml(j.inputs.zone)}</strong> • Bedroom: <strong>${escapeHtml(brLabel)}</strong></p>
    <p style="margin:.25rem 0;">Your rent: <strong>$${fmt(rent)}</strong></p>
    <p style="margin:.25rem 0;">Benchmark (${j.benchmark.basis}): <strong>$${fmt(j.benchmark.value)}</strong> <small>${escapeHtml(j.benchmark.vintage)}${reli}</small></p>
    <p style="margin:.25rem 0;">Difference: <strong>$${fmt(j.result.delta)}</strong> (${j.result.percent}%)</p>
    <details style="margin-top:.5rem;">
      <summary>Method & caveats</summary>
      <ul>
        <li>CMHC Rental Market Survey (purpose‑built), zone + bedroom medians where available (fallback to averages/totals if suppressed).</li>
        <li>Rents can differ by inclusions (utilities, parking, appliances). Guidance only.</li>
      </ul>
      <p><small>Source: ${escapeHtml(j.benchmark.source)}</small></p>
    </details>`;
}




function fmt(n) { return new Intl.NumberFormat().format(Math.round(n)); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

loadZones();
