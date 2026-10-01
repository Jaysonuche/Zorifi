# Zorifi 3.37.0 beta gates

Evidence is platform-specific. A Windows result cannot satisfy a macOS, browser or mobile gate.

## Gate 0 — architecture and truth

Required:

- Protected editor and Vanessa architecture remains intact; no competing bypass.
- Capability matrix is complete and machine-validated.
- Distribution type and runtime requirements are documented.
- Project/session/media persistence is described accurately as device-local.
- No fake provider, sync, export or support success.
- No source-controlled credentials.

Failure at Gate 0 blocks every later gate.

## Gate 1 — build, install and startup

Required for the target platform:

- Reproducible production build.
- Install/open/uninstall or PWA install/update path validated.
- Clean and returning-profile startup.
- Fatal error and infinite-loading checks.
- Account/session lifecycle.
- Basic responsive/safe-area check.

Current result: **Windows PASS**; **Web partial/YELLOW**; all others not complete.

## Gate 2 — core editor and continuity

Required:

- Real video/image/audio import and media persistence.
- Timeline move/trim/split/delete/multiple tracks.
- Preview playback and A/V synchronization.
- Representative effect/transition/text/audio/keyframe.
- Undo/redo.
- Save/reload and missing-media recovery.
- No Blocker/Critical data-loss issue.

Current result: **Windows PASS for controlled beta evidence**; other platforms need runtime sessions.

## Gate 3 — export, Vanessa and support

Required:

- Real export produced and independently opened/validated.
- Failure/cancel does not corrupt project.
- Vanessa conversation, editor command, confirmation, verification, retry/undo and reference path.
- No Vanessa false-success response.
- Support case persistence and sanitized diagnostics.
- External providers report blocked/unconfigured honestly.

Current result: **Windows PASS for verified WebM/local support/Vanessa paths**; provider-dependent services remain YELLOW/BLOCKED; other platforms need runtime sessions.

## Gate 4 — platform beta release

Required:

- Gate 0–3 evidence complete on representative hardware/browser matrix.
- Accessibility and input-mode review.
- Performance/thermal/memory soak appropriate to platform.
- Blocker/Critical count is zero; accepted Major issues have documented workaround and owner.
- Recovery and rollback plan exists.
- Tester-facing disclosure explains local-only persistence and external-provider limits.

Release decision:

| Platform | Gate 4 result | Recommendation |
|---|---|---|
| Windows | PASS for controlled/closed beta | Proceed with telemetry and manual hardware checks |
| Web | NOT PASSED | Run HTTPS browser matrix |
| iPhone | NOT PASSED | Run real-device Safari/PWA track after Web |
| iPad | NOT PASSED | Run real-device tablet/keyboard/Pencil track |
| Android | NOT PASSED | Run real-device Chrome/PWA hardware matrix |
| macOS | NOT PASSED | Create signed/notarized build and test on Mac |
| Linux | NOT PASSED | Define supported distro/package and test |

## Existing YELLOW classification

Does **not** block the current Windows controlled beta when disclosed and isolated: stock catalog absence, provider-backed generated media, live captions provider, neural semantic tracking/background removal, remote template marketplace, MP4/4K variability, voice-provider exact voice, Gmail delivery, billing checkout and native mobile distribution.

Requires Windows beta monitoring/manual coverage: crash-safe autosave under forced termination, native drag/drop, fullscreen, physical microphone/wake word, system-font differences, very large audio extraction, long A/V sync, reverse codec behavior, responsive touch laptops, and extended performance/memory soak.

Blocks promotion of another platform: absence of that platform’s package/runtime evidence, unvalidated local persistence/reopen behavior, unvalidated import/playback/export codecs, unsafe responsive overflow, false Vanessa success, or any unrecoverable project loss.

