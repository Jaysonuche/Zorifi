# Zorifi 3.37.0 — Beta 1 Terms and signup readiness

Assessment date: 2026-09-29

## Implemented

- Removed the permanent Beta badge from the normal home and editor headers.
- Preserved controlled-beta state, tester ID, onboarding, checklist, reporting, diagnostics and support classification.
- Added a dedicated, versioned Terms module with sixteen readable sections and an explicitly non-final Privacy Policy configuration point.
- Added a responsive Terms screen for desktop, phone and tablet layouts.
- Deferred new account creation and session persistence until the required agreement is checked and submitted.
- Required existing accounts without the current accepted version to accept before entering the workspace.
- Preserved accepted users across login and reload without repeatedly prompting them.
- Preserved acceptance history so a future Terms version can request renewed acceptance without replacing prior records.
- Kept Beta acknowledgement as the next controlled-beta step after Terms acceptance.
- Kept Help & Support as the normal entry point to the beta guide and beta report workflow.

## Versioning and persistence

- Current Terms version: `3.37.0`
- Published content date: `2026-09-29`
- Storage schema: `zorifi.terms/1`
- Storage namespace: `zorifi-terms-acceptance-v1:<encoded account id>`
- Each record contains only the Terms version, acceptance timestamp, account ID and applicable beta version.
- Passwords, payment information, API keys and provider credentials are not accepted by or written to the Terms record.
- The current accepted version and timestamp are mirrored into the existing local account record for inspection; version history remains in the account-scoped Terms store.

## Signup flow

`Create account → Terms & Conditions → required unchecked agreement → Continue → controlled-beta acknowledgement → Zorifi`

Refreshing before acceptance creates no account and no session. Existing sessions are also checked by account ID and version in the central application render gate.

## Verification evidence

| Check | Result |
|---|---|
| Focused Terms + controlled-beta tests | **PASS — 23/23** |
| Complete automated regression suite | **PASS — 1,067/1,067** |
| Production web build | **PASS — 55 application files plus optimized assets** |
| Windows Electron package | **PASS** |
| Windows NSIS installer | **PASS — 92,705,334 bytes** |
| Packaged Terms signup/reload runtime | **PASS** |
| Terms responsive runtime: 1440×900 | **PASS — no overflow** |
| Terms responsive runtime: 390×844 | **PASS — no overflow** |
| Terms responsive runtime: 768×1024 | **PASS — no overflow** |
| Existing packaged editor/Vanessa runtime | **PASS** |
| Existing real WebM smoke export | **PASS — 73,711 bytes** |
| Controlled Beta full journey | **PASS** |
| Controlled Beta real WebM export | **PASS — 75,816 bytes** |
| Support and beta report persistence | **PASS** |
| Vanessa conversation and editor title action | **PASS** |

## Honest YELLOW / review-required items

- The supplied Terms content is a product draft and is **not certified as legally sufficient** for every jurisdiction.
- A Zorifi owner/legal adviser must review minimum age, consumer rights, governing law, liability, privacy, data retention, intellectual-property language and any paid-service terms before wider release.
- The Privacy Policy remains an explicitly marked `REVIEW_REQUIRED` configuration point; no fake final policy was introduced.
- Gmail escalation remains unconfigured until a real provider credential is supplied, and Zorifi continues to report that state honestly.
- Projects, media, sessions and relevant Vanessa history remain local to the current device/profile; cross-device cloud synchronization is not implemented.
- macOS and Linux desktop builds remain YELLOW pending real target-device validation and release signing/notarization where applicable.
