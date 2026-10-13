# Home resume navigation to the most recently edited version

## Behavior

Clicking the home page's "我的简历" button selects the saved version with the
newest updatedAt timestamp and opens the workspace for that version. When no
saved versions exist, the button keeps the user on the home page and only opens
the existing sidebar behavior.

## Implementation

Keep version ordering unchanged. Add an onOpenSidebar handler in App that
finds the newest valid updatedAt, calls the existing selectVersion flow,
and lets that flow close the mobile drawer. The sidebar remains available for
manual selection.

## Validation

Add an end-to-end test with two saved versions whose edit timestamps differ,
return to the home page, click "我的简历", and assert that the newer version's
resume is shown. Keep the existing empty-home behavior covered.