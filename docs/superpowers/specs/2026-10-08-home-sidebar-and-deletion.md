# Home sidebar and resume version deletion — 2026-10-08

- Replace the standalone continue-editing button with a home “我的简历” action opening the same sidebar used in the editor. Keep the introduction and upload inputs on home.
- Extract one shared sidebar with persisted collapse preference, selectable saved versions, empty state and independent per-version delete controls. Default to collapsed for first visits.
- Delete requires an alert dialog showing the exact version title and explaining removal of its document, analysis, messages and history. Cancel/Escape must not change the workspace.
- Deleting a non-active version leaves the active data/history unchanged. Deleting the active version selects the first remaining version. Deleting the last returns to an empty home. Abort active AI editing and discard stale proposals when its version is removed.
- Deletion persists in browser storage. Downloaded files are unaffected. No new backend storage or Railway variables.
- On phones, expanded sidebar is an overlay drawer with backdrop; selection closes it. Validate no horizontal page overflow, keyboard focus, reload and safe deletion boundaries.
