# Safe upstream failure tracing — 2026-10-09

User supplies Railway HTTP request metadata showing application POST /api/ai/generate returned 502. It does not contain model response body. Public health/preset/frontend asset reads show the expected live URL/model and latest frontend bundle; no authenticated generation was made against the user's service.

- Do not guess another model/protocol or retry automatically. Previous compatibility attempts do not prove the actual live failure cause.
- Reproduce the observability bug locally: unknown400 has no trace/context, and frontend discards existing structured diagnostic fields. Add failing API and browser regressions first.
- Give every API request a generated UUID and response header; expose safe build version via Railway commit SHA and diagnosticsVersion in health.
- On author model failure emit a concise [ai-error] application log and response context: app status, upstream status, known code/param/category, canonical protocol endpoint, bounded model label, validated reasoning setting, image presence and version. Never log raw error messages, request bodies, Key, personal data, IP or upstream response text.
- Frontend generation/edit errors format those safe fields and correlation UUID. Preserve submitted materials; no proxy fallback or credential persistence.
- Distinguish explicit reasoning-parameter rejection from model-not-found so prior heuristic cannot mislabel it. Validate invalid reasoning env values locally.
- Live model root cause stays unverified until the user retries and supplies safe application diagnostics, not edge HTTP metadata or credentials.
