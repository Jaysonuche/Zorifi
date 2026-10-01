# Zorifi 3.37.0 — Customer Support and Vanessa First-Line Support Report

Date: 29 September 2026

## A. Support UI changes

- Replaced the developer-oriented support surface with a Zorifi-styled **How can we help?** experience.
- Added clear entry points for Vanessa, problem reports, bug reports, export, import, account/billing and other questions.
- Kept customer-facing status language separate from internal priority and engineering state.
- Preserved case continuation, resolution, reopening, human-review requests, beta guidance and structured beta reports.
- Added responsive one-column behavior, touch-sized controls, safe scrolling and narrow-screen overflow protection.

## B. Vanessa support changes

- Vanessa now classifies support requests before creating a case.
- Supported how-to and known import/export conditions receive concise first-line guidance without an unnecessary case.
- Vague reports request the missing detail instead of inventing a diagnosis.
- Existing authorized editing commands remain outside support interception and continue through the protected Router, permissions, EditorBridge, transaction and verification pipeline.
- Problems outside Vanessa's authority and explicit requests for a human create or update an account-isolated support case.
- Support metadata records whether Vanessa handled the issue, attempted a fix, verified a fix and required human review.

## C. Escalation changes

- Escalation uses the existing support store and Gmail endpoint; no second case system was introduced.
- Duplicate reports remain separate but can be related bidirectionally.
- Escalation now distinguishes `SENT`, `FAILED` and `UNCONFIGURED` truthfully.
- The customer receives human-readable status text rather than provider or JavaScript errors.
- Sensitive values, card-like numbers, private user paths and secret-bearing fields are filtered before storage and transport.

## D. Gmail behavior

- Destination remains `zorifvideoeditor@gmail.com`.
- A case becomes `SENT` only when the transport returns both `sent: true` and a provider message ID.
- The provider message ID is recorded for confirmed delivery.
- With no Gmail credential in the tested fresh profile, the case remains stored locally with `UNCONFIGURED`; the UI says human follow-up is pending and never says the email was sent.
- The configured-delivery branch is covered with a confirmed provider-transport test. No live Gmail message was sent during this run because real Gmail credentials were unavailable.

## E. Files changed

- `app.js`
- `styles.css`
- `zorifi-support.js`
- `zorifi-editor-overhaul.js`
- `netlify/functions/support-email.mjs`
- `sw.js`
- `tests/zorifi-support.test.cjs`
- `tests/zorifi-controlled-beta.test.cjs`
- `tests/integration-wiring.test.cjs`
- `tests/windows-runtime-smoke.cjs`
- Vanessa Step 13–25 wiring tests updated for the current service-worker cache revision.

## F. Files created

- `tests/zorifi-customer-support.test.cjs`
- `ZORIFI-CUSTOMER-SUPPORT-3.37.0.md`

## G–I. Tests and exact results

| Test run | Result |
| --- | ---: |
| Customer support + editor playback focused tests | 21/21 passed |
| Support/beta/cross-platform focused suite | 39/39 passed |
| Complete Zorifi regression suite | 1,049/1,049 passed |
| Packaged Windows runtime smoke | Passed |
| Fresh-profile controlled-beta journey | Passed |

The original 1,037-test baseline remains passing. Twelve customer-support tests were added, bringing the complete suite to 1,049 tests.

## J. Web build

- `npm run build:web`: passed.
- Output: 54 files plus optimized assets in `web-dist`.

## K. Windows build and installer

- Windows x64 portable package: passed.
- Windows x64 NSIS installer: passed.
- Portable executable: `release/Zorifi-win32-x64/Zorifi.exe` (204,521,984 bytes).
- Installer: `installer-dist/Zorifi-Setup-3.37.0.exe` (92,700,197 bytes).
- Non-blocking packaging warning: the PNG source icon was not usable as an ICO by electron-packager. The NSIS build still completed and produced the installer.

## L. Real export

- Packaged runtime created and fetched a valid `video/webm` output of 42,854 bytes.
- Fresh-profile controlled-beta journey created a valid `video/webm` output of 63,862 bytes.
- Playback, pause, seek, resume, project clock, real media clock and playhead synchronization passed in the packaged runtime.
- A throttled-renderer timing defect discovered during validation was fixed with a bounded timer fallback while retaining animation-frame timing in normal visible playback.

## M. Mobile responsive result

- Support UI has responsive single-column layout, touch targets, 16 px form fields, `100dvh` sizing, scrolling and overflow protection.
- Packaged runtime checks at 1,440 px, 1,280 px and 1,024 px reported zero horizontal overflow and accessible preview, timeline, export and support controls.
- Physical iPhone, iPad and Android validation was not available in this run and remains a real-device beta requirement.

## N. RED issues

- None discovered in the implemented support, packaged Windows or export paths.

## O. YELLOW issues

- Gmail delivery is `UNCONFIGURED` in the tested profile; cases are saved but cannot be emailed until valid server-side Gmail configuration is supplied.
- Web/PWA and phone/tablet support UI still require real-device/browser beta validation.
- macOS and Linux remain unverified.
- Portable-package icon conversion emits a PNG-to-ICO warning.

## P. Remaining limitations

- Vanessa cannot change source code, production infrastructure, payment systems, entitlements, security configuration, credentials, databases or system permissions.
- Vanessa does not have unrestricted Gmail/network/filesystem access.
- First-line guidance is intentionally limited to known supported Zorifi behavior and authorized editor operations.
- Live Gmail delivery and physical mobile testing require external credentials/devices not present in this environment.

## Q. What Vanessa can resolve herself

Vanessa can explain supported tools and workflows; identify known duplicate, malformed or unsupported import rejections; explain an empty-timeline export condition; guide supported export troubleshooting; and execute existing authorized editor actions. Editor mutations continue through the existing confirmation/permission, EditorBridge, transaction, verification, undo/recovery and support-feedback systems. Vanessa may report a fix only when the existing verification layer confirms the state change.

## R. What is escalated

Requests go to the existing human-review flow for `zorifvideoeditor@gmail.com` when they involve code/backend/infrastructure work, billing or account intervention, security/privacy, credentials or permissions, data recovery, serious/unresolved complaints, a failed authorized resolution, insufficient authority, or an explicit request for a human. The structured case includes safe complaint, reproduction, platform, result, assistance and relationship data where available.

## S. False Gmail delivery claims

The escalation service cannot mark a case `SENT` or display the sent confirmation without both a successful transport result and a real provider message ID. Unconfigured delivery is recorded as `UNCONFIGURED`; failed or unconfirmed delivery remains non-success. Tests cover unconfigured, failed/unconfirmed and confirmed-message-ID behavior.

## T. Architecture preservation

The existing Vanessa Core, Identity, PersonalMemoryStore, memory/context systems, ConversationEngine, Router, continuity/planning Steps 15–25, provider permissions, EditorBridge, validated transactions, verification/recovery, account isolation, support persistence, beta infrastructure and editor architecture were preserved. No Step 26, second Vanessa, second support store or editor bypass was introduced.
