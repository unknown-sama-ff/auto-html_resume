# Model connection simplification — 2026-10-08

The user specified exactly two choices: 作者预设6.1-sol and 自定义URL.

- Retain the existing cf-api-fan preset id and CF_API_* deployment variables. Expose only this one author preset from the server and fallback data.
- Remove provider lists and legacy AI_PRESETS_JSON/OPENAI_*/DEEPSEEK_* handling; do not let stale metadata add UI choices.
- Custom URL continues to accept URL, model name and API Key, subject to the existing backend host allowlist. Keep Key session-only; cancelling must not apply draft settings. Retain custom fields across mode toggles.
- Tests cover labels, singleton metadata, secret non-disclosure, legacy environment variables, stale multi-provider responses and custom settings usage.
