# User-owned browser-direct AI channel — 2026-10-08

- Keep one Railway service: static frontend plus the author preset API. Splitting deployments is unnecessary.
- Only the author preset reaches `/api/ai/generate` or `/api/ai/edit`; it uses the author backend secret, processes payloads transiently in memory, and does not store user resumes/Keys in a database, files or body logs.
- Custom URL generation and editing use browser `fetch` to the user's HTTPS API with the user's model and Bearer Key. No app proxy fallback, no cookies, no referrer or redirects. Keys remain session-only. The model provider's own retention policy is outside this app's control.
- Share generation/edit prompt builders and structured parsers between browser and backend. Preserve strict result/style validation.
- API provider must support CORS including OPTIONS and Authorization/Content-Type. CORS/network failures preserve inputs and explain why direct calls may fail, without uploading to backend. HTTPS pages reject HTTP endpoints.
- Backend rejects old custom-proxy requests. Existing CF_API_* variables still work; ALLOWED_AI_HOSTS applies only to author backend egress, not user direct endpoints.
- Tests assert the actual custom request URL/model/header, zero app AI requests, failure without proxy fallback, local storage without Key, and independent author requests.
