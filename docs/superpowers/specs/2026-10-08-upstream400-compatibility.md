# Upstream HTTP400 compatibility and safe diagnostics — 2026-10-08

The user reports HTTP400 after HTTP401 and confirms both Chat Completions and Responses are supported by the relay. Public app metadata shows the intended /v1 URL and model. Actual credentials were not tested.

- Preserve Chat Completions as the default; use strings for text-only content and arrays only for image requests. A local HTTP test reproduces the previous 400 for a relay accepting only strings.
- Add explicit Responses support (full /v1/responses or CF_API_PROTOCOL=responses) with input_text/input_image, instructions and store=false. No automatic protocol switching or retry; stream=false is explicit for both. Do not infer the user's actual model capability from vendor-wide API support.
- Interpret only known 400 patterns and allowlisted error codes/parameters; never expose upstream raw messages, secrets, materials or gateway HTML. Keep 401/403 diagnostics unchanged.
- Share endpoint resolution, payloads and response text extraction between author backend and custom browser direct calls. Custom credentials never enter app APIs or persisted workspace.
- Validate both protocols end-to-end locally, real browser custom requests, failure/input retention and existing material/version/export regressions. Live third-party generation remains unverified until the user retries on deployment.
