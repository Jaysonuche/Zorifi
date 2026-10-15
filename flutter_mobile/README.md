# Zorifi mobile companion

A Flutter Android/iOS companion alongside the recovered browser/Electron editor. It imports video, audio and images, previews the selected asset with native players, saves trim ranges and volume, reorders timeline clips, autosaves projects, and saves/restores backups containing the imported media. Vanessa chat uses the existing backend with optional Firebase sign-in.

The supplied layout is integrated as **Vaness AI**, **Video** and **Music** tabs. Video shows video/photo clips and media; Music shows audio clips and media with the existing playback, trim and volume controls. Both edit the same saved project. The toolbar folder button opens project creation, reopening and backup restoration. Importing media opens its corresponding editor; changing tabs pauses preview playback. The assistant uses real backend responses and the existing consent controls.

This is a companion baseline: the supplied playback packages do not render a finished edited video or mix the timeline into a continuous native preview. Use the existing editor for finished-video export. Mobile projects/backups have their own versioned format and do not yet sync with, or import backups from, the desktop editor. Individual imports are limited to 256 MB and backups to 64 MB of media.

## Run

The package is now named `zorifi`, version `1.0.0+1`. Windows, macOS and Linux source scaffolds are included alongside Android/iOS. Wide screens use a navigation rail; narrow screens retain the three bottom tabs. Desktop window setup uses 1200×800 with a 500×700 minimum, and Ctrl+Shift+V selects the assistant and focuses the app. A shortcut conflict is reported without blocking the editor. Windows/Linux video preview is wired through video_player_media_kit and its native libraries; Android/iOS/macOS retain their existing video_player backend. Native desktop binaries, video decoding and actual OS shortcut registration remain unverified. This Flutter desktop scaffold is separate from the already-built Electron app.

On this laptop, `flutter doctor` reports no Visual Studio C++ desktop workload or Android SDK. Flutter also reports that native plugin setup requires Windows symlink support (Developer Mode). Package resolution and Dart tests succeed independently of these native-build prerequisites; a Windows Flutter executable has not been built. After configuring the tools, rerun `flutter pub get` and `flutter run -d windows`. The new video backend follows the [package's desktop initialization instructions](https://pub.dev/packages/video_player_media_kit).

The existing Dart `^3.13.5` constraint is retained rather than claiming compatibility with Dart 3.0; current project code and dependencies use newer APIs. The desktop dependencies use the requested ranges. FFmpeg, path_provider and flutter_lints remain included.

Processing dependencies now include `ffmpeg_kit_flutter_new: ^4.6.7` and `permission_handler: ^11.3.1` (currently locked to 11.4.0). The supplied FFmpeg constraint `^6.0.3` does not exist for this fork, so the published 4.6.7 release is used. Android has an explicit API 24 minimum; the existing iOS target is 15.0. Dependency resolution and Dart checks do not verify the native binaries or implement media export. Permission handling is available for future features; current system-file selection does not request blanket access to device storage.

The requested FFmpeg package bundles GPL components; its [package documentation](https://pub.dev/packages/ffmpeg_kit_flutter_new/versions/4.6.7) describes the distribution licensing requirements. This dependency addition does not change the project's own license declaration.

Use Flutter 3.47.7 / Dart 3.13.5 or a compatible newer SDK. The recovery workspace has a local SDK at `../.flutter-tools/sdk`; this SDK and its cache are ignored by Git. With a normal Flutter installation:

```powershell
cd flutter_mobile
flutter pub get
flutter analyze
flutter test
flutter run
```

For this workspace's local SDK, use `../.flutter-tools/sdk/bin/flutter.bat` instead of `flutter` and set `PUB_CACHE` to the absolute workspace path `.flutter-tools/pub-cache`.

Android requires Java, the Android SDK, accepted Android licenses and a device/emulator. iOS compilation requires macOS with Xcode. Android/iOS source scaffolds are included; native device playback and installation must be verified on those platforms. No APK or iOS binary is claimed by the source and widget tests.

## Connect Vanessa

The settings panel accepts an HTTPS backend address. The default matches the existing app's configured homepage; availability depends on the owner's deployment. Server-side provider keys and a deployed authenticated backend are required for cloud AI. No provider secret belongs in Flutter source or build arguments.

```powershell
flutter run --dart-define=ZORIFI_API_URL=https://your-backend.example --dart-define=FIREBASE_WEB_API_KEY=your-public-firebase-web-key
```

The Firebase web key is public project configuration, not a provider credential. Hosted requests attach the signed-in Firebase ID token. Passwords and session tokens stay in memory; reopening the app requires a new sign-in. Changing the backend signs out the session.

For Android USB development, run the root Node development server on port 4173, use `adb reverse tcp:4173 tcp:4173`, and set the app backend to `http://127.0.0.1:4173`. Debug Android permits HTTP only for localhost/127.0.0.1; production addresses require HTTPS. Localhost mode is for the trusted local development server and does not require Firebase. Do not expose that server publicly.

## Privacy and checks

`lib/zorifi_engine.dart` provides `ZorifiEngine.trimVideo(...)` and `extractAudio(...)` for native FFmpeg processing. The editor now exposes **Export trimmed source** for selected video/audio and **Extract source audio** for selected video. These actions use `MediaExporter` to process into owned temporary storage, open the system save dialog and clean up after success, cancellation or failure. Extracted audio uses a Matroska `.mka` container to preserve the original codec. Stream-copy trims may follow keyframes and do not apply saved volume/effects or combine timeline clips. Existing engine output files are refused; a system save dialog governs the final destination. Native FFmpeg execution still requires device testing.

`ZorifiEngine.requestPermissions(permissions: [...])` requests only the supplied permissions. With no permissions supplied, supported mobile platforms proceed without a prompt. Request microphone/camera permissions at the recording action, not for trimming app-owned files. Direct Android library browsing must select permissions appropriate to the OS version; iOS permission-plugin native configuration must be verified when those features are wired in. Limited photo access is accepted by default. Existing imports use the system file picker.

The Privacy & data panel identifies Jayson Uche and zorifvideoeditor@gmail.com. Optional AI and sharing project details both start off. You can export local metadata, copy the privacy contact, withdraw consent and erase app-owned editor data. Local erasure preserves original files and external backups; cloud/provider data and billing are separate. See [privacy implementation and launch work](../PRIVACY.md).

The tests exercise real file import copies, saved edits, backups/restores, invalid data rejection, queued saves, metadata export and erasure. Mocked HTTP verifies authentication, consent withdrawal and sanitized service errors. A phone-sized widget test checks navigation, privacy choices and chat without sending project details. No test sends a real paid provider request.

Package references: [Flutter installation](https://docs.flutter.dev/install/manual), [video_player](https://pub.dev/packages/video_player), [audioplayers](https://pub.dev/packages/audioplayers), [file_picker](https://pub.dev/packages/file_picker), [path_provider](https://pub.dev/packages/path_provider), [Firebase authentication REST API](https://firebase.google.com/docs/reference/rest/auth).
