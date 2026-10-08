# Configurable model request deadline and timing — 2026-10-09

The user has switched providers and reports application504 from f7f99ec with high reasoning and pure text. That version has a hardcoded 90s AbortSignal timeout. Do not infer actual provider/credential validity from reaching this boundary or automatically change high.

- Default to 240s, bounded admin AI_REQUEST_TIMEOUT_MS (1000–270000ms) for the author API. Same default in browser-direct custom mode; retain CORS/no-backend fallback.
- One deadline for destination check, wait for headers and read body; no automatic retry or protocol/model/effort change. Preserve submitted materials.
- Add safe timeout budget, elapsed and phase metadata to response and [ai-error]. Local deadline=request_timeout vs upstream408/504=upstream_timeout. Never log Key, payload or response text.
- Keep timeout below typical 5min Railway no-data limit, not unlimited waiting. Actual throughput/queue needs provider-side confirmation.
- Tests use slow local dummy upstream and fake credentials to verify deadline override, body-read abort, gateway504 distinction, no repeat requests, user high retained, data preserved and frontend feedback.
