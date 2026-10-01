# Zorifi 3.37.0 — macOS and Linux Desktop Enablement

## Implemented

- macOS Electron packaging for Intel (`x64`) and Apple silicon (`arm64`).
- DMG and ZIP release targets.
- macOS camera, microphone, document-folder and hardened-runtime metadata.
- Electron/Chromium entitlements for JIT, media devices and the loopback provider server.
- Linux x64 AppImage and Debian package targets.
- Debian desktop/runtime dependencies including GTK, NSS, accessibility and libsecret.
- Platform-aware `npm run package:current` dispatcher.
- Target-native project/session storage through Electron's application profile.
- Windows DPAPI, macOS Keychain and supported Linux keyring credential handling.
- Explicit rejection of Electron's Linux `basic_text` secret-storage fallback.
- Local-origin-only desktop media/fullscreen/notification permission handling.
- Platform-neutral recording, provider, installation and export messages.
- GitHub Actions release jobs for macOS and Linux artifacts.

## Commands

```sh
npm run test:desktop-platforms
npm run package:macos
npm run package:linux
```

`package:macos` must run on macOS to create release-quality DMG artifacts. Apple signing and notarization credentials must be supplied through the secure release environment; they are deliberately not stored in this repository.

`package:linux` creates an AppImage for broad distribution and a `.deb` for Debian, Ubuntu, Mint and compatible systems.

## Honest validation state

- Windows runtime: GREEN and already validated.
- macOS: YELLOW. Packaging, lifecycle, permissions and architecture are configured and source-tested; no actual Mac was available in this workspace.
- Linux: YELLOW. Packaging, keyring and runtime dependencies are configured and source-tested; no Wayland/X11 Linux desktop was available in this workspace.

Neither platform should be promoted to GREEN until the generated package is installed on the target OS and passes real import, playback, audio, timeline, Vanessa, persistence, restart and WebM export checks.

## Validation performed in this task

| Check | Result |
|---|---|
| Cross-platform desktop tests | **PASS — 14/14** |
| Complete Zorifi regression suite | **PASS — 1,054/1,054** |
| Production web build | **PASS — 54 application files plus optimized assets** |
| Windows package and NSIS installer rebuild | **PASS** |
| Packaged Windows runtime and real WebM smoke export | **PASS — 58,098-byte playable export produced** |
| Linux x64 Electron unpacked bundle | **BUILT — `installer-dist/linux-unpacked`** |
| Linux AppImage on this Windows host | **BLOCKED — Windows denied the Unix symlink required by AppImage assembly** |
| Linux `.deb` on this Windows host | **BLOCKED — the Linux `fpm` packager is unavailable on Windows** |
| macOS DMG/ZIP on this Windows host | **NOT RUN — release-quality macOS artifacts require a macOS runner** |

The repository workflow `.github/workflows/desktop-builds.yml` builds Linux artifacts on Ubuntu and macOS artifacts on macOS, where their native packaging tools are available. These artifacts remain YELLOW until installed and exercised on actual target systems. No signing or notarization secret is stored in the source tree.

## Required target-system checks

### macOS

- Build DMG/ZIP on macOS.
- Sign and notarize with Apple Developer credentials.
- Install on Intel and Apple-silicon Macs.
- Verify Keychain, camera, microphone, file picker and Gatekeeper behavior.
- Run the full editing and export journey.

### Linux

- Launch AppImage on representative GNOME and KDE distributions.
- Install the Debian package on current Ubuntu/Debian/Mint.
- Verify GNOME Keyring/libsecret and KWallet behavior.
- Verify Wayland and X11 startup, drag/drop, file picker, playback/audio and export.
- Verify behavior when FUSE is absent using the standard AppImage extraction fallback.
