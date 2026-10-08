# Verify configured model id without generating user content — 2026-10-09

User reports latest-version model_unavailable with pure text, reasoning omitted and Chat Completions. This is an upstream-message classification, not a returned model_not_found code. The live model reason remains unverified.

- No model/protocol/reasoning fallback or random parameter change.
- Provide administrator-only npm run check:model, using CF_* runtime variables to perform one GET on the same relay /models path. Strip completion suffix and query. Never send prompt/resume, print credentials/upstream errors, modify env or auto-select another id.
- Report exact configured-id presence plus safe returned IDs. Listed=true is not generation authorization; absent=false is not universal nonexistence. Unsupported/denied list is unknown, not failed-model proof.
- Check explicit non-streaming/image constraints before vague model/unsupported language; do not turn support for non-streaming into a requirement for streaming.
- Tests use fake credentials/injected responses. Actual third-party availability requires the owner's model-list check or provider account confirmation.
