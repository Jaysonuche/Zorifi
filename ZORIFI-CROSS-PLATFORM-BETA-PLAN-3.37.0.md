# Zorifi 3.37.0 cross-platform beta plan

## Objective and scope

This plan expands **validation**, not features. Zorifi remains at 3.37.0. The protected editor and Vanessa architecture is unchanged. A platform is promoted only after its own runtime evidence exists; passing Windows tests does not prove macOS, mobile or Linux.

## Recommended order

1. **Windows closed beta — active track.** Continue with the verified installer and package.
2. **Web validation track.** Validate current Chrome and Edge first, then Safari and Firefox, on an HTTPS deployment built from the same commit.
3. **Android PWA track.** Test real low-, mid- and high-tier phones after the web gate passes.
4. **iPhone/iPad PWA track.** Test Safari storage, media, export and background recovery on real Apple devices.
5. **macOS desktop track.** Run the configured Intel/Apple-silicon DMG/ZIP build on a macOS runner, then complete signing, notarization and real-device validation. Do not cross-label an unsigned or untested artifact as supported.
6. **Linux desktop track.** Build the configured x64 AppImage/deb artifacts on Linux, choose the supported distributions, and validate keyring, codecs, Wayland/X11, playback and export before promotion.

## Shared test data

- Short WebM/H.264 MP4/MOV clips, portrait and landscape.
- PNG/JPEG images including large dimensions and alpha.
- WAV/MP3/AAC audio with known duration and audible markers.
- A 20–60 minute mixed project and a constrained-memory project.
- Malformed files, duplicate files and missing-media cases.
- Reference video/image for Vanessa planning, with provider-free and configured-provider variants.
- Test accounts containing no real secrets or customer data.

## Per-platform session

For every device/browser/build, record exact OS, browser/runtime version, hardware, RAM, GPU, screen, input method, build hash and install mode. Start from clean storage, then repeat with an existing project.

Run this functional path:

1. Install/open; create account; close/reopen; confirm local session.
2. Create project; import real video/image/audio; verify thumbnail/waveform/preview.
3. Place multiple clip types on multiple tracks; move, trim, split, duplicate and delete.
4. Apply representative effect, transition, text/caption and audio changes.
5. Exercise keyframes, playback, seek, pause, frame step, undo and redo.
6. Save/reload; verify assets, clip state, history/session and missing-media behavior.
7. Open Vanessa; test casual conversation, selected-clip command, reference plan, confirmation, execution and undo. Verify no false success.
8. Open Support; create and continue a local case; verify reload persistence and sanitized diagnostics.
9. Export real WebM (and MP4 only if offered); open the output; verify duration, video, audio, text and effects.
10. Interrupt or deny permission/network/storage operations; confirm bounded, recoverable errors.

## Browser matrix

| Track | Required minimum |
|---|---|
| Windows Web | Current and previous Chrome; current Edge |
| macOS Web | Current Safari; current Chrome |
| iPhone/iPad | Current and previous supported iOS/iPadOS Safari; installed PWA |
| Android | Current Chrome on low/mid/high-tier hardware; installed PWA |
| Linux Web | Current Chrome/Chromium and Firefox on selected supported distro |

Test fresh load, cached load, service-worker update, offline shell, return online, quota pressure, private/incognito limitation messaging, install prompt availability and uninstallation/reinstallation.

## Vanessa validation

For each platform test both offline/unconfigured and configured-provider modes:

- “What’s your name?” stays conversational and never exposes raw network errors.
- “Add a title to my video” uses current editor context, confirmation/permissions where needed, EditorBridge, transaction and verification.
- “Use this reference and make the intro more cinematic” produces an honest plan and never reports completion without a state change.
- Denied permission, missing selected clip, provider timeout and project reload are recoverable.
- Mobile/tablet panels do not cover preview/timeline or introduce a second execution path.

## Exit criteria

A platform leaves UNVERIFIED/YELLOW only when all Gate 0–4 criteria in `ZORIFI-BETA-GATES-3.37.0.md` have evidence from that platform. Any data-loss, false-success, unopenable export, security/privacy leak or unrecoverable startup crash blocks promotion.
