
// Simple client for Rent Fairness v1
const zoneEl = document.getElementById('zone');
const rentEl = document.getElementById('rent');
const btn = document.getElementById('check');
const out = document.getElementById('result');

async function loadZones() {
  try {
    const data = await fetch('/data/cmhc_vancouver_zone_rents_2025.json', { cache: 'no-store' }).then(r => r.json());
    const zones = (data.rows || []).map(r => r.zone).sort((a,b)=>a.localeCompare(b));
    zoneEl.innerHTML = '<option value="">Select a Zone…</option>' + zones.map(z => `<option value="${escapeHtml(z)}">${escapeHtml(z)}</option>`).join('');
    out.innerHTML = '';
  } catch (e) {
    out.innerHTML = `<p role="alert">Could not load zones. Please try again later.</p>`;
  }
}

btn.addEventListener('click', async () => {
  const zone = zoneEl.value;
  const rent = Number(rentEl.value);
  if (!zone || !Number.isFinite(rent) || rent <= 0) {
    out.innerHTML = `<p role="alert">Please pick a Zone and enter a valid monthly rent.</p>`;
    return;
  }
  out.innerHTML = `<p>Checking…</p>`;
  try {
    const u = `/api/rent/estimate?zone=${encodeURIComponent(zone)}&rent=${encodeURIComponent(rent)}`;
    const res = await fetch(u, { cache: 'no-store' });
    const j = await res.json();

    if (!res.ok) {
      out.innerHTML = `<p role="alert">${escapeHtml(j.error || 'Unexpected error')}</p>`;
      if (j.zones) {
        out.innerHTML += `<details><summary>Available zones</summary><ul>${j.zones.map(z=>`<li>${escapeHtml(z)}</li>`).join('')}</ul></details>`;
      }
      return;
    }

    const b = j.benchmark;
    const verdictTxt = {
      'likely-overpaying': 'Likely Overpaying',
      'fair-range': 'In the Fair Range',
      'likely-underpaying': 'Likely Underpaying'
    }[j.result.verdict] || 'Result';

    out.innerHTML = `
      <h3 style="margin:0 0 .25rem 0;">${verdictTxt}</h3>
      <p style="margin:.25rem 0;">Your rent: <strong>$${fmt(rent)}</strong></p>
      <p style="margin:.25rem 0;">Benchmark (${b.basis}): <strong>$${fmt(b.value)}</strong> <small>${escapeHtml(b.vintage)}${b.reliability ? ` • reliability: ${escapeHtml(b.reliability)}` : ''}</small></p>
      <p style="margin:.25rem 0;">Difference: <strong>$${fmt(j.result.delta)}</strong> (${j.result.percent}%)</p>
      <details style="margin-top:.5rem;">
        <summary>Method & caveats</summary>
        <ul>
          <li>CMHC Rental Market Survey (purpose‑built, all bedrooms); zone-level medians (fallback to averages if suppressed).</li>
          <li>Rents can differ by inclusions (utilities, parking, appliances), so treat this as guidance.</li>
        </ul>
        <p style="margin:.25rem 0;"><small>Source: ${escapeHtml(b.source)}</small></p>
      </details>
    `;
  } catch (e) {
    out.innerHTML = `<p role="alert">Failed to fetch estimate. Please try again.</p>`;
  }
});

function fmt(n) { return new Intl.NumberFormat().format(Math.round(n)); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

loadZones();

