# Zorifi 3.37.0 platform capability matrix

Assessment date: 2026-09-29. The machine-readable source is `zorifi-platform-capabilities-3.37.0.json`.

Status meanings:

- **GREEN** — verified through meaningful automated or real runtime evidence on that platform.
- **YELLOW** — implemented/available, but requires platform-specific beta validation or an external dependency.
- **RED** — broken or blocks the stated beta track.
- **GRAY / UNVERIFIED** — no supported distribution or insufficient platform evidence.

## Platform decision

| Platform | Status | Current distribution truth | Beta decision |
|---|---|---|---|
| Windows | **GREEN** | Electron x64 package and NSIS installer | Controlled beta ready |
| macOS | **YELLOW** | Electron DMG/ZIP targets for Intel and Apple silicon; unsigned until CI/release signing is configured | Platform-validation track |
| Web | **YELLOW** | Production PWA build and Netlify configuration | Validation track only |
| iPhone | **YELLOW** | Responsive web/PWA; no native binary | Device-validation track only |
| iPad | **YELLOW** | Dedicated tablet web mode; no native binary | Device-validation track only |
| Android | **YELLOW** | Responsive web/PWA; no APK/AAB | Device-validation track only |
| Linux | **YELLOW** | Electron AppImage/deb targets for x64; distribution runtime validation pending | Platform-validation track |

No RED platform blocker was found for the already-approved **Windows-only controlled beta**. That statement does not promote the other platforms.

## Capability summary

| Capability family | Windows | Web | iPhone | iPad | Android | macOS | Linux |
|---|---|---|---|---|---|---|---|
| UI/editor/timeline | GREEN | YELLOW | YELLOW | YELLOW | YELLOW | YELLOW | YELLOW |
| Media import/persistence | GREEN | YELLOW | YELLOW | YELLOW | YELLOW | YELLOW | YELLOW |
| Project/session/reopen | GREEN | YELLOW | YELLOW | YELLOW | YELLOW | YELLOW | YELLOW |
| Preview/playback | GREEN | YELLOW | YELLOW | YELLOW | YELLOW | YELLOW | YELLOW |
| Effects/transitions/text | GREEN | YELLOW | YELLOW | YELLOW | YELLOW | YELLOW | YELLOW |
| Audio | GREEN | YELLOW | YELLOW | YELLOW | YELLOW | YELLOW | YELLOW |
| Undo/redo | GREEN | YELLOW | YELLOW | YELLOW | YELLOW | YELLOW | YELLOW |
| Export | GREEN WebM | YELLOW | YELLOW | YELLOW | YELLOW | YELLOW | YELLOW |
| Vanessa conversation/edit/reference | GREEN | YELLOW | YELLOW | YELLOW | YELLOW | YELLOW | YELLOW |
| Support | GREEN local cases | YELLOW | YELLOW | YELLOW | YELLOW | YELLOW | YELLOW |
| Permissions | YELLOW manual OS checks | YELLOW | YELLOW | YELLOW | YELLOW | YELLOW | YELLOW |
| Keyboard | GREEN | YELLOW | GRAY | YELLOW | GRAY | YELLOW | YELLOW |
| Touch | YELLOW | YELLOW | YELLOW | YELLOW | YELLOW | YELLOW | YELLOW |
| Packaging/install | GREEN | YELLOW PWA | YELLOW PWA | YELLOW PWA | YELLOW PWA | YELLOW DMG/ZIP | YELLOW AppImage/deb |

## Architecture and runtime requirements

### Windows

Electron 37 serves the same application through a loopback HTTP server. Provider secrets are held through Electron secure storage. Project metadata/session data use localStorage and media blobs use IndexedDB. The package and installer have been exercised from clean data. Hardware codec, microphone, touchscreen and high-resolution soak coverage remain manual.

### Web

`scripts/build-web.cjs` creates the production static bundle; `manifest.webmanifest`, `sw.js`, `_redirects` and `netlify.toml` define the PWA/Netlify path. HTTPS is required for install and protected media APIs. The browser must provide IndexedDB, Web Audio, Canvas `captureStream` and `MediaRecorder`. There is no server-side project store.

### iPhone and Android phone

The phone UI is not a shrunken desktop: runtime detection selects `mobile`, and the editor uses bottom navigation, touch-first tool sheets, a mobile timeline, responsive Vanessa, safe-area insets and landscape protection. It is still a web/PWA experience. No real-device export, background/resume or storage-eviction test has been completed.

### iPad

iPad and MacIntel touch detection select `tablet`; dedicated tablet CSS preserves a larger workspace. Real iPad sizes, Stage Manager, Apple Pencil, hardware keyboard and Safari export remain unverified.

### macOS

Electron Builder now defines Intel and Apple-silicon DMG/ZIP targets, Apple privacy descriptions and hardened-runtime entitlements. Provider credentials use Electron `safeStorage`, which maps to the operating-system secure store. The application has not been run on real Mac hardware in this Windows-hosted task, and Apple signing/notarization credentials are not configured, so macOS remains YELLOW rather than release-verified.

### Linux

Electron Builder now defines x64 AppImage and Debian-package targets. Provider credentials use Electron `safeStorage`; the app rejects the unsafe `basic_text` fallback and tells the user to configure a supported keyring. Actual playback, codecs, microphone permissions, export and desktop integration still require validation on the selected Linux distributions and display servers, so Linux remains YELLOW.

## Persistence and continuity truth

- Account session: remembered **on the current browser/app profile only**.
- Projects: stored in localStorage, scoped to the current local account.
- Imported media: stored in IndexedDB and restored into blob URLs.
- Vanessa history/preferences: stored locally and account-scoped.
- Cross-platform/project sync: **not implemented**.
- Opening the same account on another device does **not** move projects/media there.
- Clearing site/app data, browser eviction, profile removal or device loss can remove local work. Beta testers must be told this plainly.

## Vanessa cross-platform truth

The UI modes share the existing ConversationEngine, context, router, permissions, EditorBridge, transaction, verification and recovery systems. Mobile/tablet do not have a parallel bypass. Offline-capable conversation remains distinct from editor commands. Provider-backed knowledge and media generation need configured services and network availability; the UI must not claim success when they are missing.

## Known platform-sensitive areas

- MediaRecorder MIME/container support, especially MP4 and 4K.
- iOS/Safari storage quotas, eviction, background suspension and PWA update behavior.
- Android OEM codec and memory differences.
- Microphone/speech recognition/wake-word permission policies.
- Native fullscreen, file picker, drag/drop, share/open flows.
- macOS signing/notarization, Keychain permission prompts and Apple-silicon runtime validation.
- Linux keyring availability, codec packages, Wayland/X11 behavior and distro-specific desktop integration.
- Gmail escalation, billing and AI provider functions require external configuration and remain honest YELLOW/BLOCKED.
