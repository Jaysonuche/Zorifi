# Zorifi 3.37.0 controlled beta operations

Official support contact: **zorifvideoeditor@gmail.com**

## Beta scope

Windows is the currently verified controlled-beta platform. The Web/PWA, iPhone, iPad and Android experiences are validation tracks. iPhone/iPad/Android are responsive web/PWA experiences, not native production applications. macOS and Linux remain unverified.

The beta does not introduce cloud synchronization. Projects, imported media, account sessions and Vanessa history remain on the current device/profile. Testers should not expect a project created on one device to appear on another.

## Tester journey

1. Install or open Zorifi 3.37.0.
2. Sign in or create a local account.
3. Read and acknowledge the one-time controlled-beta welcome.
4. Open the optional **Beta testing guide** from the persistent Beta 3.37.0 badge or Help & Support.
5. Exercise normal editing, Vanessa, persistence and export workflows.
6. Choose **Report beta issue** in Help & Support when behavior is unexpected.
7. Review the locally stored case, add updates, resolve/reopen it, or request configured email escalation.

Acknowledgement and checklist state are account-scoped and stored locally. The checklist is guidance only and never blocks editing.

## Beta report data

Reports capture category, short title, description, reproduction steps, expected/actual result, tester severity, reproducibility, platform, runtime/browser, Zorifi version, optional test identifier, opaque tester ID and bounded diagnostics. Sensitive keys, payment-card patterns and common private home-directory paths are redacted. Reports remain isolated to the current local account.

Tester severity is evidence, not engineering priority. The existing impact-based support priority system remains authoritative.

Similar reports remain separate cases. When the existing category-aware similarity check finds a credible match, the new case points to the earlier case and the earlier case records the related report. Nothing is silently merged.

## Case lifecycle

Beta cases support `NEW`, `TRIAGED`, `INVESTIGATING`, `FIXED`, `VERIFIED`, `RESOLVED`, `REOPENED` and the existing support lifecycle values. The existing local SupportCaseStore remains the sole case database.

## Gmail escalation

The recipient defaults to `zorifvideoeditor@gmail.com`. Delivery still requires a valid `GMAIL_ACCESS_TOKEN`; `ZORIFI_SUPPORT_EMAIL` may override the recipient and `ZORIFI_SUPPORT_SENDER` may override the sender. A case is marked `SENT`/`ESCALATED` only when Gmail returns a real message ID. Without credentials, the case stays saved locally and the UI says email escalation is not configured. Raw provider errors are not shown to testers.

No credentials belong in frontend files, local beta reports or source control.

## Vanessa support behavior

Vanessa uses the existing support intent and case store. Vague problem statements produce diagnostic questions and point the tester to the structured beta flow. Clear reports may create a local support case. Vanessa never claims a developer was notified unless a real escalation is confirmed, and this beta layer does not bypass EditorBridge or change Vanessa’s intelligence architecture.

## Release truth

The cross-platform capability matrix and beta gates remain authoritative:

- `zorifi-platform-capabilities-3.37.0.json`
- `ZORIFI-PLATFORM-CAPABILITY-MATRIX-3.37.0.md`
- `ZORIFI-BETA-GATES-3.37.0.md`
- `ZORIFI-BETA-TEST-CHECKLIST-3.37.0.md`

## Verified controlled-beta build — 29 September 2026

- Full automated suite: **1,037/1,037 passed** (the 1,027-test baseline plus 10 controlled-beta tests).
- Focused beta/support/cross-platform suite: **27/27 passed**.
- Production web build: **passed**, 54 application files plus optimized assets.
- Windows x64 portable package: **passed**.
- Windows NSIS installer: **passed** (`Zorifi-Setup-3.37.0.exe`).
- Existing packaged-runtime smoke test: **passed**, valid WebM output of **57,668 bytes**.
- Fresh-profile controlled-beta journey: **passed** in the newly packaged Windows payload.
- Controlled-beta journey export: valid `video/webm`, **74,928 bytes**.
- The journey verified signup, the one-time notice, acknowledgement persistence, the 21-item optional checklist, real video/image/WAV import, duplicate and malformed-media rejection, split, undo/redo, text, effect, Vanessa conversation, a real Vanessa editor command, a structured beta report, restart recovery and responsive desktop layouts at 1024, 1280 and 1440 pixels.
- The created beta case remained separate, used status `NEW`, preserved tester severity independently from engineering priority, and survived restart with the project, media and Vanessa history.
- Gmail escalation: **not configured in the tested fresh profile**. The official recipient is present, but there is no Gmail access token. No email-delivery success was claimed.

Current release classification remains Windows **GREEN** for controlled closed beta. Web/PWA, iPhone/iPad PWA and Android PWA remain **YELLOW** pending real-browser/device validation. macOS and Linux remain unverified.
