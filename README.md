
# TrueNorth Metrics (Cloudflare Pages + Google Sheets)

Static front-end on Cloudflare Pages, dynamic data from a published-to-web Google Sheet (CSV) aggregated by a Pages Function.

## Quick Start
1. Create a Google Sheet with columns: `id,title,summary,lastUpdated,region,status,metric_key,metric_value,link_label,link_url`.
2. File → Share → Publish to web → select sheet tab → Format: CSV → Publish → copy URL.
3. Create a new GitHub repo and add the files from this starter.
4. Cloudflare Pages → New project → Connect to your repo. Build command: (empty). Output: `/`.
5. Add environment variable: `SHEET_CSV_URL` = your published CSV URL.
6. Deploy. Visit `/api/topics` to verify JSON. The homepage will render cards.

## Data Model (aggregated)
The `/api/topics` endpoint returns an array of objects like:
```json
{
  "id": "lmia-scams",
  "title": "LMIA Scams",
  "summary": "Signals, reporting channels, and verified resources.",
  "lastUpdated": "2026-01-16",
  "region": ["Canada", "BC"],
  "status": "active",
  "metrics": { "reportsThisMonth": 37 },
  "links": [ { "label": "How to verify an LMIA", "url": "https://…" } ]
}
 
