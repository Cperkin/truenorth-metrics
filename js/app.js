
// TrueNorth Metrics client
const YEAR = document.getElementById('year');
if (YEAR) YEAR.textContent = new Date().getFullYear();

const listEl = document.getElementById('topic-list');
const emptyEl = document.getElementById('empty');
const searchEl = document.getElementById('search');
const regionEl = document.getElementById('region-filter');
const statusEl = document.getElementById('status-filter');

let TOPICS = [];

function formatNumber(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return new Intl.NumberFormat().format(v);
  const n = Number(v);
  return Number.isFinite(n) ? new Intl.NumberFormat().format(n) : String(v);
}

function card(t) {
  const metrics = t.metrics ? Object.entries(t.metrics).map(([k, v]) => `
    <div class="metric">
      <span class="metric-key">${k}</span>
      <span class="metric-val">${formatNumber(v)}</span>
    </div>`).join('') : '';

  const links = Array.isArray(t.links) ? t.links.map(l => `
    <li><a href="${l.url}" target="_blank" rel="noopener">${l.label}</a></li>`).join('') : '';

  const region = Array.isArray(t.region) ? t.region.join(', ') : (t.region || '');

  return `
    <article class="card" role="listitem">
      <h3>${t.title}</h3>
      <p>${t.summary || ''}</p>
      <div class="meta">
        <span class="badge">${t.status || 'active'}</span>
        ${region ? `<span class="region">${region}</span>` : ''}
        ${t.lastUpdated ? `<time datetime="${t.lastUpdated}">Updated ${t.lastUpdated}</time>` : ''}
      </div>
      ${metrics ? `<div class="metrics">${metrics}</div>` : ''}
      ${links ? `<ul class="links">${links}</ul>` : ''}
    </article>`;
}

function populateFilters(topics) {
  const regions = new Set();
  topics.forEach(t => (t.region || []).forEach(r => regions.add(r)));
  regionEl.innerHTML = '<option value="">All regions</option>' +
    Array.from(regions).sort().map(r => `<option value="${r}">${r}</option>`).join('');
}

function applyFilters() {
  const q = (searchEl.value || '').toLowerCase().trim();
  const r = regionEl.value;
  const s = statusEl.value;
  const filtered = TOPICS.filter(t => {
    const hay = [t.title, t.summary, ...(t.region || [])].join(' ').toLowerCase();
    const matchQ = !q || hay.includes(q);
    const matchR = !r || (t.region || []).includes(r);
    const matchS = !s || (t.status || '').toLowerCase() === s;
    return matchQ && matchR && matchS;
  });
  listEl.innerHTML = filtered.map(card).join('');
  emptyEl.hidden = filtered.length !== 0;
}

async function load() {
  try {
    const res = await fetch('/api/topics', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load topics');
    const topics = await res.json();
    TOPICS = topics;
    populateFilters(TOPICS);
    applyFilters();
  } catch (err) {
    console.error(err);
    listEl.innerHTML = '<p role="alert">Could not load topics. Please try again later.</p>';
  }
}

searchEl.addEventListener('input', applyFilters);
regionEl.addEventListener('change', applyFilters);
statusEl.addEventListener('change', applyFilters);

// Minimal consent banner (adjust to your policy/regulatory needs)
(function consent() {
  const key = 'tnm-consent';
  const el = document.getElementById('consent');
  if (!el) return;
  const saved = localStorage.getItem(key);
  if (!saved) el.hidden = false;
  document.getElementById('consent-accept').onclick = () => {
    localStorage.setItem(key, 'accepted');
    el.hidden = true;
  };
  document.getElementById('consent-decline').onclick = () => {
    localStorage.setItem(key, 'declined');
    el.hidden = true;
  };
})();

load();

