# Zorifi change log

## Unreleased — 9–11 October 2026

### Color scopes

- Replaced decorative scope bars with measured luma waveform, RGB parade and Rec. 709 vectorscope displays in the Color and Professional panels.
- Samples the visible source with its color filters at 256×144 up to five times per second; releases analysis resources when the panel closes. These SDR estimates exclude compositing, masks and overlays and are not calibrated broadcast measurements.
- Verified 58 JavaScript tests, including scope calculations, plus a browser check for actual image pixels, exposure response and cleanup.

This records the work completed in the recovered local project. These changes have **not been committed, pushed to GitHub or deployed by this chat**. The owner reports that the GitHub repository is connected to Vercel; the live Vercel configuration has not been inspected.

### Project recovery and builds

- Recovered the available source from `Jaysonuche/Zorifi`, starting at commit `d7f59be`.
- Reconstructed missing development, web build, asset generation, packaging, Android synchronization and integrity-check scripts.
- Added replacement icons and artwork for assets missing from the recovered snapshot.
- Restored dependencies and lockfiles, a server environment template, tests and recovery instructions.
- Built the web bundle and an unsigned Windows folder application at `installer-dist/win-unpacked/Zorifi.exe`. The entire folder is required to run it.
- Reconstructed the Capacitor Android scaffold and synchronized the web assets into it. This is separate from the Flutter companion.
- Kept dependencies, SDK downloads, generated builds, test artifacts and local credentials out of Git through ignore rules.

Original source media, unpublished laptop changes and provider credentials were not recoverable from the GitHub snapshot.

### Existing browser and desktop editor

- Replaced the placeholder multicam camera buttons with a working **Multicam audio sync** dialog: choose a master and up to eight targets, analyze locally, cancel safely and undo the result. This aligns recordings; it does not add live camera switching.
- Added `ZorifiMulticamSyncEngine` with multichannel envelopes and bounded, zero-mean normalized correlation in a dedicated worker. Offset signs, minimum overlap, match confidence and ambiguous periodic signals are checked before applying changes. The analysis uses the first 60 seconds, a ±15-second search and 10 ms envelope resolution; it is an estimate, not guaranteed sample-perfect sync or clock-drift correction.
- Sync supports restored URLs and file objects up to 100 MB with browser-decodable audio. It requires matching constant playback speeds, unlocked tracks and nonnegative resulting times. Clip trims, linked captions/word times and keyframes move together; angles receive separate tracks and saved per-clip group IDs. Changes are prepared before an undo snapshot, and stale or failed analyses do not partially move clips.
- Multicam verification: all 54 JavaScript tests passed; integrity checks covered 101 sources and 134 asset references. The browser test decoded real synthetic WAVs, matched them in the worker, aligned through the modal and verified Undo. Refreshed web/Capacitor/Windows builds passed; the packaged executable also ran the multicam correlation worker successfully.

- Integrated `ZorifiEasingCurves` into the existing property interpolation path used by keyframe graphs, preview and export. Added cubic in/out and bounce in/out options to the keyframe dropdown, preserving the editor's existing quadratic ease-in/out default.
- Bézier evaluation solves X before sampling Y, accepts array/object controls without replacing zero values, and returns exact endpoints. Interpolation sorts a copy, resolves duplicate timestamps using the last supplied key, and reaches the next value at an exact hold boundary. Nonfinite values are rejected.
- Easing verification: all 49 JavaScript tests passed. A browser check selected cubic/bounce modes, edited zero-valued Bézier controls and verified editor property samples and the generated curve graph. The graph represents property values over time, not a separate velocity plot.

- Added `ZorifiCloudSyncEngine` to the Firebase module and `FirebaseGateway.createTeamspaceSync()` for the current authenticated session. Cloud sync is disabled by default; the recovered project does not contain a deployed teamspace endpoint, media upload service, version-history store or team-membership rules. The existing UI correctly continues to say cross-device sync is unavailable.
- Implemented an account/endpoint-scoped persistent retry outbox, request IDs for server idempotency, revision preconditions, acknowledgement validation, serialized client operations and per-project conflict blocking. Authentication/configuration/storage errors do not report fake offline success. Pending queues use the existing Zorifi storage namespace, so local privacy erasure includes them.
- Snapshot payloads contain project metadata and media references, excluding credentials, file objects, local paths and preview URLs. Media binaries must be uploaded separately before another device can restore an edit. Review comments use integer frame positions and explicit frame rates; the server must derive authorship from authentication, not the supplied author argument.
- Cloud client verification: all 44 JavaScript tests passed; 96 sources and 132 asset references passed integrity checks. Web/Capacitor assets and the Windows folder app were rebuilt, and the packaged app passed startup/editor/worker/settings/privacy checks. Cloud transport tests are mocked; no server or teamspace deployment was performed.

- Connected `ZorifiCaptionEditorBridge` to Generate Captions and SRT export. It loads nonempty media files or stored URLs, retains cancellation, maps source/word timestamps through source trims and playback speed, and rejects results when the project, source asset or clip timing changes during transcription.
- Caption replacement is prepared before the undo snapshot and affects only original captions belonging to the selected source. Other clips' captions and translated tracks are retained. Empty filler-cleanup results and invalid styles/timestamps leave the timeline untouched. Existing caption templates and the shared SRT formatter remain in use.
- Bridge verification: all 38 JavaScript tests passed, integrity checks covered 95 source files and 132 references, and the browser caption workflow/SRT download passed with mocked speech recognition.
- Completion check confirmed the packaged app's caption bridge, application script and offline cache match current source; the rebuilt Windows executable passed its startup/editor/worker/settings/privacy checks. Web and Capacitor assets were refreshed. Changes remain local.

- Integrated `ZorifiAutoCaptionsEngine` into Phase8 and the existing caption generation flow, using real media uploads through the existing consent/authenticated transport. Failed, cancelled or superseded requests do not insert mock captions or overwrite previous engine results.
- Added validated segment/text/timing edits, word alignment adjustment, line wrapping, SRT timestamp carry/rounding, and typed timeline overlays using numeric text tracks. The API maps pop/highlight styles to existing text styles and fade to opacity keyframes. It does not invent word timestamps when the provider supplies none.
- Added **Export captions as SRT** to the Captions panel. Selecting a caption exports its track (including a translated track); otherwise original captions are exported. Removed the 0.45-second forced minimum that could extend short generated captions beyond the source clip.
- Caption verification: 34 JavaScript tests passed. A browser test exercised the real caption UI with mocked speech recognition, source trim/speed alignment, a 0.1-second caption and an actual downloaded SRT file. This does not verify paid speech-provider access.

- Integrated `ZorifiScenePlanner` into the existing Scenes module and local planning fallback. Accepted `mediaItems` and legacy scene `mediaId`/`title`/`description` fields, added derived total duration/status, and added Commercial planning and direction controls. Local plans use metadata and templates; they do not claim semantic video analysis.
- Added a standalone append-to-timeline API with numeric editor tracks, image/video typing, distinct IDs and preparation before mutation. Missing media, invalid timing and video scenes longer than their source are rejected; soundtrack clips are bounded by source duration. Existing Scenes UI continues using its richer review, undo, effects and timeline application path.
- Scene update verification: all 29 JavaScript tests and browser import/edit/save/export/offline/privacy checks passed. Integrity checks covered 92 source files and 132 asset references.

- Added the supplied `ZorifiAudioStudio` API to the browser audio engine for decoded stem buffers: synchronized starts, fresh source nodes on replay, per-track gain and stereo pan, natural-end state, replacement/removal and explicit disposal. A stop during AudioContext resume cancels delayed starts; borrowed contexts remain owned by their caller. Existing timeline playback continues through its existing effects/mixer pipeline.
- Added short/empty-safe waveform and approximate transient analysis, with 10 ms energy windows and spacing between detections. This is not reliable tempo detection or stem separation. The direct analysis method is synchronous; the existing imported waveform workflow still uses its worker.
- Added a validated AI music brief builder and connected its fields to the existing music provider payload. Generation still requires a configured provider and the existing consent/authentication flow; the engine name identifies the brief schema, not a bundled AI model.
- Audio update verification: 25 JavaScript tests passed; a real browser OfflineAudioContext render verified synchronized stems, gain, left/right panning and natural completion. The focused audio tests also passed after adding offline-context support.

- Removed the Effects and Animation shortcut tabs from the inspector header shown in the supplied screenshot. Properties and AI remain in that header; the editing tools remain accessible from the main tool navigation. Refreshed the offline cache version for the updated interface.

- Integrated the supplied optimization module using the project's browser/CommonJS module pattern. The editor tracks Blob URLs and releases them through existing deletion/project transitions and page teardown. GPU disposal is explicit for owned canvases/contexts, avoiding accidental destruction of shared preview canvases.
- Moved waveform peak scanning into a separately cached worker with concurrent request IDs, timeouts, cancellation/error cleanup and transferable owned buffers. Peak scanning includes every sample in each bucket and preserves caller/AudioBuffer storage. Audio decoding remains in the browser's AudioContext; unsupported/failed workers use the existing local fallback.
- Routed provider generation through a service-name allowlist and the existing consent/authentication transport, with request cancellation, timeouts and sanitized errors. This reuses the configured proxy routes and does not create a new Vercel backend.

- Fixed an export startup race so rendering continues while the video recorder initializes.
- Added a live render preview to the export dialog.
- Verified actual media import, timeline edits, project save/reload, offline startup and a decoded 720p WebM export.
- Updated asset loading, offline caching and desktop packaging for the added privacy modules.

### Vanessa and backend services

- Reconstructed Netlify function handlers and shared service adapters for language assistance, planning, web research, image generation, captions, speech and video jobs.
- Added configurable connections for external music, stem separation and GPU services; those external services still need to be supplied and configured.
- Restored support email delivery through configured Gmail credentials, with delivery reported only after a confirmed message ID.
- Added authentication handling for hosted requests, origin checks, sanitized provider errors and protection against exposing server credentials to the frontend.
- Tested provider integrations with mocked responses. Real paid provider access and email delivery have not been verified.

### Flutter mobile companion

- Continued the desktop integration with a Windows/Linux video backend (`video_player_media_kit` and native libraries), and connected FFmpeg to **Export trimmed source** and **Extract source audio** controls. Added a processing dialog, real save/cancel outcomes, error reporting and temporary-file cleanup. Source exports do not render the full timeline or apply volume/effects; stream-copy cuts may follow keyframes.
- Added tests for desktop shortcut activation/lifecycle and processed-media save, cancellation and failure using mocked native calls. Native builds remain blocked on this laptop by missing Visual Studio C++ tools/Android SDK and Windows symlink support. No native export or desktop-video execution is claimed by the Dart tests.

- Renamed the Flutter package to `zorifi`, set its description to "Zorifi Media Suite & Vaness AI" and version to `1.0.0+1`, and updated test imports. Kept the existing modern Dart constraint and working processing/storage dependencies.
- Added `window_manager` 0.3.9 and `hotkey_manager` 0.2.3, desktop source scaffolds, a 1200×800 window with a 500×700 minimum, and Ctrl+Shift+V registration to select/focus the assistant. Shortcut failures are handled and the app unregisters its own shortcut on disposal.
- Added a navigation rail above 700 logical pixels and retained bottom tabs on narrow screens, preserving the project and chat draft while resizing. The existing editor, chat, privacy and backup controls remain connected. Windows/Linux playback now uses the media-kit backend described above; native playback, desktop hotkeys and binaries still require target-platform verification.
- Located the working project under Windows' redirected Documents folder: `C:\Users\User\OneDrive\Documents\ChatGPT\Zorifi`.

- Added `lib/zorifi_engine.dart` with FFmpeg stream-copy trimming and first-audio-stream extraction, argument-list execution, range validation, overwrite protection and cleanup of owned temporary output. Permission requests accept an explicit feature-specific list instead of requiring microphone access for editing. These engine methods are not yet connected to export buttons or verified against native device codecs; stream-copy cuts may follow keyframes and output containers must support the source codec.

- Added the supplied iOS photo-library read/add, microphone and camera usage descriptions to `ios/Runner/Info.plist`. These descriptions prepare permission prompts; camera capture, recording, voice commands and saving exports to the library are not implemented by this configuration change.

- Set Flutter Android `defaultConfig` to `minSdk = 24` and `targetSdk = 34`, translating the supplied Groovy snippet into this project's Kotlin Gradle syntax. Native Android compilation remains unverified.

- Added the requested Android image, video, audio and microphone permission declarations alongside the existing internet permission. This manifest change does not implement recording, direct media-library browsing or runtime permission prompts; existing imports continue through the system file picker.

- Added `ffmpeg_kit_flutter_new: ^4.6.7` and `permission_handler: ^11.3.1` (resolved to 11.4.0), with the lockfile updated. The supplied FFmpeg version 6.0.3 is not published for this fork. Android now explicitly requires API 24 or newer; the existing iOS 15 target meets the plugin minimum. These dependencies prepare for processing and permissions; native export remains unfinished. The FFmpeg package's GPL components and distribution requirements are noted in the mobile README.

- Added the `flutter_mobile/` project with Android and iOS source scaffolds.
- Added the requested `http`, `video_player`, `audioplayers` and `file_picker` packages, plus `path_provider` for app-owned file storage.
- Implemented video, audio and image import; selected-media preview; saved clip trim, order and volume; project creation, naming, reopening and autosave.
- Added backups and restoration that include imported media. Imports are limited to 256 MB per file; backups currently support 64 MB of media.
- Connected chat to the existing backend, with optional Firebase sign-in. Passwords and session tokens are held in memory rather than saved in projects.
- Adapted the supplied design into **Vaness AI**, **Video** and **Music** tabs with purple/cyan styling.
- Video shows video/photo media and clips; Music shows audio media and clips. Both edit the same saved project. The folder toolbar button opens project management.
- Preserved real backend responses, working media controls, backups and privacy controls when applying the supplied layout.

### Privacy and GDPR-related controls

- Added Privacy & data panels to the main editor and Flutter companion.
- Set the data controller to **Jayson Uche**, with **zorifvideoeditor@gmail.com** as the privacy contact.
- Made optional AI processing off by default, separate from Terms acceptance, with recorded consent and withdrawal controls.
- Added a separate mobile choice for sharing project names, filenames and clip timings with Vanessa.
- Added local metadata export and confirmed local erasure. Tests verify removal of imported copies while preserving unrelated browser storage and original mobile source files.
- Explained that local erasure does not delete cloud/provider records, cancel billing or remove external backups.
- Documented the remaining controller responsibilities in [PRIVACY.md](PRIVACY.md). These software controls alone do not establish GDPR compliance.

### Verification completed

Optimization update: **21 JavaScript tests passed**, including real worker-thread execution for concurrent jobs, resource ownership, timeout/termination and proxy validation. Browser checks also passed with actual Web Worker jobs, decoded WAV peaks, tracked preview URLs and proxy consent blocking, alongside the existing import/save/export/offline/privacy workflows. Integrity checks covered 89 source files and 132 browser/cache references.

10 October completion: rebuilt the web/Capacitor assets and unsigned Windows folder application with the optimization module. The packaged `Zorifi.exe` passed isolated checks for startup, editor, assets, actual waveform worker output, local provider settings and privacy controls. Explicit pnpm environment selection resolved electron-builder's ambiguous lockfile detection; the PowerShell command is recorded in REBUILD.md. No GitHub push or deployment was performed.

Latest continuation: all **17 Flutter tests passed** and static analysis reported no issues. Tests cover native-call simulation for shortcut activation/cleanup and FFmpeg processing, real temporary-file cleanup, export save cancellation/failure, plus the previous editor/privacy/storage checks. Native plugin setup reported a Windows symlink requirement; an executable build and real codec/shortcut operation remain unverified.

After the engine and adaptive-desktop additions, all 12 Flutter tests passed, including resize/navigation checks that preserve chat drafts and project state. Native desktop shortcut activation and media processing are not established by these tests.

These results describe checks already run during this work; they are not a new test run performed when this change log was written.

| Check | Result |
| --- | --- |
| JavaScript unit and service tests | 15 passed |
| Flutter tests | 9 passed |
| Final Flutter layout regression | Passed after the colour and navigation changes |
| Flutter static analysis | No issues found |
| JavaScript integrity checks | 86 source files and 129 asset references passed |
| Browser workflow | Import, edits, save/reload, decoded WebM export, phone privacy access, offline startup, consent withdrawal and local erasure passed |
| Packaged Windows app | Startup, editor, assets, provider settings and privacy controls passed |
| Web build and Capacitor Android synchronization | Completed |

### Still unfinished or unverified

- Flutter finished-video/audio rendering and mixed-track preview.
- Desktop/mobile project synchronization and compatible backup interchange.
- Native Android/iOS playback checks and installable Flutter APK/iOS builds. Platform tooling and device verification remain necessary.
- Signed installers, macOS/Linux verification and mobile store releases.
- Real provider credentials, deployed external music/GPU services, cloud account/billing setup and end-to-end hosted service checks.
- Processor agreements, cloud retention, international-transfer arrangements and the operational privacy-request procedure.
- Development-tool dependency advisories recorded in [REBUILD.md](REBUILD.md).

### GitHub and Vercel status

The source changes and this document are currently local. Saving this file does not upload them to GitHub or publish the website. A reviewed commit and push are still needed. Vercel production branch, build settings and environment variables must be checked against the actual connected project.

The restored frontend build command is `pnpm build:web`, with output in `web-dist`. The reconstructed backend handlers are under `netlify/functions/`, and no root `vercel.json` was found when writing this log. Vercel backend routing/runtime compatibility therefore remains to be verified or adapted before claiming the hosted AI and support features work. Flutter mobile releases require their own build and distribution process.

### Supporting documentation

- [Recovery, builds and configuration](REBUILD.md)
- [Flutter setup and current limits](flutter_mobile/README.md)
- [Privacy implementation and operational requirements](PRIVACY.md)
- [Project README](README.md)

### Responsive workspace

- Adapted the editor's existing nested Grid/Flex layout to desktop (1024px+), tablet (768–1023px) and phone (up to 767px) widths, with dynamic viewport height and safe-area spacing.
- Added accessible Tools and Properties toggles and close buttons: the tablet inspector slides over the workspace, while phone editing panels open as sheets. Escape closes these panels. Preserved desktop panel sizing and vertical as well as horizontal touch scrolling for timeline tracks.
- Updated the viewport tag to the owner's requested scaling settings and refreshed the service-worker cache version. Browser checks cover 390, 767, 800, 1024 and 1440 pixel widths and panel interactions.

### Touch and keyboard responsiveness

- Enforced 44×44 minimum buttons and trim handles at widths below 1024px, expanded track-control space, and preserved exact clip duration widths.
- Assigned custom gesture surfaces `touch-action:none`; added one-finger timeline panning alongside two-finger zoom on phone and tablet widths.
- Added `interactive-widget=resizes-content` and a Visual Viewport fallback. Vanessa uses a full-screen overlay on compact layouts and retains the desktop docking behavior.
- Browser checks passed for visible button sizes and the assistant input within a simulated 350px-high viewport at 390px and 800px widths. The five-width layout regression also passed. A real iOS/Android keyboard still requires device verification.

### Multi-device layout strategy refinement

- Tablet asset tools now join Properties in slide-over drawers, leaving the closed-drawer preview at full workspace width; Vanessa uses a right-side overlay.
- Docked desktop Vanessa shares the left sidebar position with assets, retaining three workspace columns. Closing Vanessa restores the asset sidebar. Mobile sheets and 44px touch controls remain in place.

### Local dialogue enhancement

- Added `ZorifiAudioCleanupEngine` in the existing audio engine, available globally and through `ZorifiAudioEngine`. Its offline rendering uses a high-pass filter, presence EQ and compressor with professional/gentle strengths, validates decoded inputs, bounds memory allocation and disconnects nodes after success or failure. It opens no live AudioContext and does not alter the input buffer.
- Added Studio Dialogue (filters) to the existing preview/export audio preset controls, using the established adjustable processing chain. This real-time preset uses the existing high/low-pass noise control and EQ/compressor implementation; it is not a baked offline replacement of the media file.
- Actual browser audio rendering verified low-rumble attenuation, speech-band retention, stereo/sample-rate/length preservation and unchanged source data. Existing audio-studio tests passed. These local DSP tools do not perform AI source separation or reverb removal.

### Vanessa cleanup attachment

- Added the supported local filter pipeline with validated continuous strength and a true zero-strength bypass, without opening a live audio context or modifying source media.
- Added a mono/stereo PCM16 WAV encoder with correct signed conversion, clipping, non-finite sample handling and size validation.
- Preserved the supplied class name as a compatibility alias while rejecting unsupported AI isolation/reverb modes. This is an engine API, not an automatic timeline replacement or a trained AI model.
- Browser audio tests passed for filtering, source preservation and WAV round-trip; the preceding dialogue-cleanup browser test also passed.

### OpenRouter server-side gateway

- Added the Vercel gateway and routing configuration using the existing allowlisted services, Firebase authentication and response contracts.
- Added OpenRouter text/scene planning via private `AI_PROVIDER_KEY` and configurable `AI_PROVIDER_MODEL`, defaulting to the currently listed `openrouter/free` router. Unsupported capabilities and incomplete responses fail clearly; credentials and upstream error text are not returned.
- Added four mocked gateway/provider tests; all 12 focused service tests passed. No live provider request or deployment was made.

### Unified master application

- Added one master facade over the existing editor, connecting the authenticated gateway, Vanessa conversation workflow, captions/SRT, scene planning, multicam, easing and local audio cleanup.
- Added an Audio-panel action that creates a separately persisted cleaned WAV without replacing the original video/audio or timeline clips.
- Browser integration verified shared project state, project switching, actual cleanup rendering, persistence and source preservation. Included the entry point in web caching and desktop packaging.

### Public module structure

- Added the requested capitalized studio, audio, caption and multicam ES-module entry files as adapters to the existing implementations. They are designed for the editor loaded by index.html and do not duplicate initialization.
- Documented the root layout and the existing app.js / zorifi-master-app.js relationship in README.md. Retained lowercase app.js to avoid a case-only filename collision on Windows.
- Included adapters in development/Electron serving, web output, offline caching and desktop packaging configuration. Browser imports and shared constructor identity passed the master-app integration check.

### Master UI event hookups — 12 October 2026

- Routed caption generation/retry and Vanessa form submission through the master application, preserving selected caption sources, provider consent, scene review and the existing chat history.
- Added stable control IDs and persistent audio cleanup busy/success/error feedback scoped to the selected clip and project; repeated clicks are blocked while processing.
- Chat supports Enter and the Send button without duplicating messages, catches unexpected failures, and exposes its escaped existing history as an accessible log.
- Browser tests passed for audio click/redraw/error/retry/success, single chat submission, caption button-to-transcription/timeline/SRT flow, and the real master-app audio integration. Speech/provider responses were mocked; no live AI request was sent.
