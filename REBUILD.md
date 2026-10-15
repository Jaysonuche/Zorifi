# Recovered Zorifi

Recovered from `Jaysonuche/Zorifi`, commit `d7f59be`. The GitHub snapshot contained the editor source but omitted build scripts, tests, icons/backgrounds, backend functions, and Android/GPU projects. The build scripts, replacement artwork, service adapters, tests, and Android scaffold were reconstructed here. Original media, unpublished laptop changes, provider secrets, and GPU model code cannot be recovered from that snapshot.

## Open the app

The Windows folder build is `installer-dist/win-unpacked/Zorifi.exe`. Keep its entire folder together. This local development build is unsigned. To develop, run `pnpm install --frozen-lockfile`, then `pnpm dev` and open `http://127.0.0.1:4173`; `pnpm start` opens Electron. Accounts, projects, and imported media are stored on this device, so a fresh account starts with an empty library.

## Configuration

The added [Flutter mobile companion](flutter_mobile/README.md) uses the requested HTTP, video playback, audio playback and file picker dependencies, plus path_provider for app-owned media storage. It has Android/iOS scaffolds, selected-media previews, persisted editing metadata and full mobile backups. Finished native video rendering and desktop/mobile project interoperability are not implemented.

Privacy controls identify Jayson Uche at zorifvideoeditor@gmail.com. Optional AI starts off, can be withdrawn independently of Terms, and local metadata export and erasure are available in both apps. See [PRIVACY.md](PRIVACY.md) for the controller's remaining cloud retention, processor, transfer and rights-request work. These controls are not a certification of legal compliance.

Local editing and on-device export work without AI credentials. In the desktop app, use the existing provider settings to store keys securely. For the development server, copy `.env.example` to `.env` and launch `node --env-file=.env scripts/dev-server.cjs`. Configure server environment variables in Netlify when hosting. Never place provider keys in browser JavaScript.

Restored adapters cover OpenAI language/planning, web search and image generation, Whisper captions, ElevenLabs speech, and xAI video jobs. Music, stems and the optional GPU video service require separately deployed compatible endpoints; see `vanessa-gpu/README.md`. No GPU model implementation or Google Lyria integration was present in the snapshot. Support delivery uses configured Gmail OAuth credentials and only marks a case sent after receiving a real message ID. Rebuild tests mock provider calls and do not prove paid provider access or send support email.

Hosted services require Firebase authentication. `build:web` embeds only public Firebase configuration. Hosted Pro checks read the signed-in user's private subscription record under existing Firestore rules; subscription verification and billing administration still require the owner's service setup. Desktop credentials do not activate a hosted deployment.

## Build and verification

The optimization update adds tracked media URLs, an offline-cached waveform worker and a provider proxy client wired to existing privacy/authentication checks. The worker correlates simultaneous jobs, scans every sample per waveform bucket, preserves original PCM buffers, and rejects timed-out/terminated work. GPU cleanup is opt-in for owned canvases. Audio decoding remains in AudioContext; browsers without a usable worker retain the existing synchronous waveform fallback. No stem separation engine or Vercel deployment is introduced by this module.

- `pnpm check`: JavaScript syntax and referenced asset checks.
- `pnpm test`: project persistence/action validation and mocked provider integration checks.
- `pnpm test:browser`: actual image import, timeline edits, IndexedDB save/reload, WebM export, responsive editor and offline startup.
- `pnpm test:desktop`: isolated hidden Electron startup and local settings.
- `pnpm build:web`: static frontend in `web-dist`.
- `pnpm exec electron-builder --win --dir`: Windows folder build.
- `pnpm installer:windows`: Windows installer.
- `pnpm android:sync`: restored Capacitor scaffold and bundled web assets. APK/AAB compilation additionally requires Java and the Android SDK; no Android binary is claimed until Gradle completes.

Browser export uses this device's MediaRecorder codecs and renders in real time. MP4 availability varies by runtime. This recovery preserves the existing interface and feature code; it does not establish that every historic feature or platform is tested.

Recovery verification on Windows: 13 unit/service tests passed, 83 JavaScript sources and 125 asset references passed integrity checks, browser import/save/reload/WebM export/mobile/offline checks passed, and the actual Windows folder executable passed its isolated desktop check. Android synchronization passed; no APK compilation was performed. Runtime dependency audit reported no known vulnerabilities. The full development-tool audit still reports advisories, including a critical `node-tar` decompression issue requiring a separate dependency upgrade review before treating the build pipeline as hardened.

Adapter references: [OpenAI Responses and web search](https://developers.openai.com/api/docs/guides/tools-web-search), [OpenAI image generation](https://developers.openai.com/api/reference/resources/images/methods/generate), [xAI video API](https://docs.x.ai/developers/rest-api-reference/inference/videos), [ElevenLabs speech API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), [Gmail send API](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send).

## Companion and privacy verification

After the companion/privacy additions: all 15 JavaScript unit/service tests and all 9 Flutter tests passed. Flutter analysis reported no issues. Integrity checks passed for 86 JavaScript sources and 129 asset references. Browser checks passed for import/edit/save/reload, decoded 720p WebM export, phone access to Privacy & data, offline startup, consent withdrawal and erasure of imported media copies. Unrelated browser storage and original mobile source files were preserved in isolated erasure tests. Android web synchronization and the refreshed Windows folder build completed. Native Flutter Android/iOS playback and binary compilation still require platform/device verification; Java/Android SDK and macOS/Xcode are not available in this workspace setup.

The Windows folder build was made with `pnpm exec electron-builder --win --dir "-c.win.signAndEditExecutable=false"`; executable resource editing and signing are skipped for this local build. Keep the entire `win-unpacked` folder together. No deployment or GitHub push was performed.

### Optimization build completion — 10 October 2026

Multicam audio sync now replaces the placeholder monitor under Transform/Workflow. The local `zorifi-multicam.js` file supplies both the engine and its worker; it is included in browser caching and Electron packaging. `calculateAudioOffset()` is a bounded synchronous API for envelopes, while the UI uses the worker via `matchEnvelopes()`. The returned offset is the target's start relative to the master. Negative resulting timeline positions are rejected with instructions to move the master later. Audio decoding depends on the browser's codecs; silent, unrelated, repetitive or drifted recordings may not align. Run `node --test tests/multicam.test.cjs` and `node tests/multicam-browser.cjs`; the browser test decodes synthetic WAV recordings, uses the actual worker and UI, and verifies Undo.

The easing continuation exposes `ZorifiEasingCurves` and `ZorifiAdvancedEditing.ZorifiEasingCurves`, and routes existing `keyframedValue` sampling through it. The public API defaults to cubic in/out; existing editor clips retain quadratic ease-in/out when no easing is specified. Bézier controls may be arrays or `{x1,y1,x2,y2}`; X must be in [0,1], while the API permits finite Y overshoot. The existing controls constrain both axes to [0,1]. Use `node --test tests/easing.test.cjs` and `node tests/easing-browser.cjs` to check mathematical behavior and the actual graph controls.

The cloud client continuation adds `ZorifiFirebase.ZorifiCloudSyncEngine` (also a browser global). `firebaseGateway.createTeamspaceSync({enabled:true})` can construct an authenticated client only after an actual same-origin teamspace service is supplied. It is disabled by default and is not connected to autosave. `pushProjectSnapshot()` returns the acknowledged `revision`; callers must retain it as `projectState.cloudRevision` for the next update. `flushPending()` retries persisted items with their original request IDs. Conflicts remain queued and block later requests for that project until the owner reconciles with the remote version; `clearPending()` explicitly discards the current account/endpoint's queue. This is a client integration, not a deployed cloud backend or complete cross-device sync.

Required server contract: POST `/api/teamspace/sync` and `/api/teamspace/comments` must verify the Firebase bearer token, enforce project/team membership and write roles, validate payload limits, derive the comment author, and atomically deduplicate the `idempotency-key`/`requestId`. Sync must compare `baseRevision` (null only for a new remote project), return HTTP 409 on a mismatch, and persist any required version checkpoint before acknowledging. Successful JSON must echo `projectId` and `requestId`, plus a nonempty string `revision` for sync or `commentId` for comments. Retryable responses are network failure, timeout, HTTP 429 or 5xx. No remote write, cloud deployment or team invitation was performed. Media binaries and remote history retrieval remain separate required services. Client tests use mock transports; they do not verify server authorization.

The caption editor bridge is exposed as `ZorifiCaptionEditorBridge` and `ZorifiPhase8.ZorifiCaptionEditorBridge`. The editor now uses its media-loading, timeline-alignment and scoped replacement flow, with the existing undo snapshot supplied as `beforeApply`. Generate for a source before applying captions; source changes invalidate the result. `exportTimelineCaptionsToSRT()` reads current timeline text, including legacy caption markers, and supports a track filter or originals-only export. Tests in `tests/caption-bridge.test.cjs` cover replacement boundaries, source-change rejection, cancellation signal forwarding and failure atomicity.

The captions continuation exposes `ZorifiAutoCaptionsEngine` globally and as `ZorifiPhase8.ZorifiAutoCaptionsEngine`. Construct it with an actual `transcribe(audio, options)` transport; the editor wires this to its existing media upload/chunking and privacy checks. AudioBuffer use requires the supplied transport to encode it; sending duration alone is rejected. Offline work supports existing/imported captions and SRT export, not fabricated speech recognition. The low-level timeline API creates actual caption clips rather than toggling the editor's legacy `hasCaptions` placeholder flag. Run `node --test tests/auto-captions.test.cjs` and `node tests/captions-browser.cjs`; the latter mocks speech recognition and verifies the UI's SRT download without calling a paid provider.

The scene-planner continuation exposes `ZorifiScenePlanner` globally and under `ZorifiScenes`. Its creation API accepts `mediaItems`; validation also accepts singular legacy scene media references without replacing missing assets. `applyToTimeline(state, plan)` appends a prepared draft after existing clips and expects `state.mediaAssets` with actual types and duration metadata. It throws before mutation if a video scene exceeds its source; callers can revise the scene before retrying. This low-level API does not itself save or render the editor. The Scenes screen retains its existing review/application workflow and now includes Commercial planning. Run `node --test tests/scene-planner.test.cjs` for its contract checks.

The subsequent music-engine update exposes `window.ZorifiAudioStudio` (also `ZorifiAudioEngine.ZorifiAudioStudio`) through the existing audio script. Create it on a user action, add decoded AudioBuffers, call `playAll()`/`stopAll()`, and call `dispose()` when its owner closes. It does not replace timeline playback or add another visible transport. `ZorifiMusicStudio.buildAIMusicPrompt()` builds a validated brief without opening an AudioContext and feeds the existing provider payload. `node tests/audio-studio-browser.cjs` verifies actual browser audio rendering; `node --test tests/audio-studio.test.cjs` covers lifecycle and parameter edge cases.

The refreshed Windows folder executable passed the isolated desktop smoke test, including real waveform worker execution, editor startup, local provider settings and privacy controls. Web and Capacitor assets were also refreshed. The optimization update passed 21 JavaScript tests, browser checks and integrity checks covering 89 source files and 132 references.

After the Documents folder redirect, direct electron-builder invocation defaulted to npm because both lockfiles exist, and dependency collection failed. The successful PowerShell build selected pnpm explicitly without reinstalling the moved dependency tree:

```powershell
$env:npm_config_user_agent='pnpm/11.25.0'
node node_modules/electron-builder/cli.js --win --dir "-c.win.signAndEditExecutable=false"
$env:ZORIFI_DESKTOP_EXECUTABLE=(Resolve-Path -LiteralPath installer-dist/win-unpacked/Zorifi.exe).Path
node tests/desktop-smoke.cjs
```

Run these commands from `C:\Users\User\OneDrive\Documents\ChatGPT\Zorifi`. This verifies the Electron editor; it does not establish a native Flutter build or live provider access.

### Color scopes — 11 October 2026

The browser global `ZorifiColorScopesEngine` and CommonJS namespace in `zorifi-color-scopes.js` provide measured luma, RGB and Rec. 709 chroma data. The Color and Professional panels analyze one visible source with color filters at 256×144, up to five times per second. Compositing, masks, overlays and calibrated HDR/broadcast measurements are outside this scope. Cross-origin pixel restrictions show an error instead of invented readings. Run `node --test tests/color-scopes.test.cjs` and `node tests/color-scopes-browser.cjs` for numeric and browser integration checks. The complete JavaScript suite passed 58 tests; integrity checks covered 104 sources and 136 references.

### Vanessa local audio cleanup

`ZorifiVanessaAudioCleanup` is available globally and through `ZorifiAudioEngine`. The attachment's name `ZorifiVanessaTrueAudioAI` is a compatibility alias only. Use `processAudio(decodedBuffer, {mode:'dialogue_cleanup', strength:0.75})`, then `audioBufferToWavBlob(result)` for a mono/stereo PCM16 WAV. Strength must be a finite number in [0,1]; zero produces a separate unprocessed buffer. Processing preserves source samples and uses only an offline context; an optional supplied live context is neither resumed nor closed. Inputs are capped at 32 million channel samples.

This API does not replace timeline media automatically or add an isolation button. The existing Studio Dialogue preset remains available for adjustable timeline filtering. No model inference, spectral subtraction, source separation or dereverberation is implemented; the attachment's `isolate_and_dereverb` mode is explicitly rejected. Compressor makeup behavior means this is not a brick-wall peak guarantee. Run `node tests/vanessa-audio-cleanup-browser.cjs` for actual browser rendering, dry bypass, invalid modes/strengths, WAV round-trip, signed PCM and non-finite sample checks.

### Local environment credentials

A local `.env` file can be copied from `.env.example`; it is ignored by Git and must remain private. The development server loads it on startup with Node.js 22+ (`npm run dev`); existing process environment values take precedence. Put a provider key only in its matching field, such as `OPENAI_LANGUAGE_API_KEY`, `ELEVENLABS_API_KEY`, or `VANESSA_STEMS_KEY`. Restart the server after changing it. Blank keys do not configure a provider. The development server blocks requests for environment files; web builds use an asset allowlist, Electron Builder uses a file allowlist, and the older Electron Packager commands exclude `.env` paths. Configure deployment credentials separately through the host's server-side environment settings. No live deployment settings were changed.

### OpenRouter and Vercel gateway

`api/vanessa-provider.js` adapts Vercel Node requests to the existing validated service handlers. `vercel.json` builds `web-dist` and rewrites the browser's existing `/.netlify/functions/...` URLs to this gateway. Configure `AI_PROVIDER_KEY` server-side and optionally `AI_PROVIDER_MODEL` (default `openrouter/free`). A nonempty OpenRouter key takes precedence over OpenAI for text and structured planning only; image generation, captions, voice, music and video retain their own providers. No paid model fallback is configured. The supplied `openai/gpt-oss-20b:free` ID was absent from the live OpenRouter model catalog when checked; the free router was listed at zero prompt/completion price. Availability, limits and model capabilities can change.

Hosted requests still require a verified Firebase user and the existing Firebase environment settings. This is not an unauthenticated public key proxy. The Vercel adapter limits requests to 4 MiB, so media uploads may need smaller chunks than local/Netlify limits. Provider errors are sanitized; incomplete or malformed model output is rejected. OpenRouter text mode does not claim web research, image analysis, speech transcription or audio isolation. Connection testing checks the key and current model catalog without generation. Actual JSON-planning quality and free-tier availability require a live account test.

Run `node --test tests/openrouter.test.cjs tests/services.test.cjs`. These tests mock upstream services; no real provider key, credit spending, Vercel deployment or GitHub push was performed. Set the same server-side variables in Vercel's environment settings before deploying. Local `.env` is never uploaded as frontend content.

### Unified application entry point

`zorifi-master-app.js` loads after the existing `app.js` and boots exactly one `window.ZorifiMasterApp`. Its `state` getter always reads the editor's current project; it does not create a second editor or duplicate state. It exposes `consultVanessa(prompt)`, `generateCaptions(clipId)`, `exportCaptionsToSRT(options)`, `synchronizeMulticam(masterId,targetIds)`, `enhanceSelectedClipAudio(clipId,{strength})`, plus `aiGateway`, `scenePlanner` and `easing`. Chat uses the existing director workflow; captions use the existing consent, limits and transcription transport. Server keys remain in the backend.

The Audio controls include Create cleaned audio copy. This processes the full source, stores a separate local WAV in Project Media, and leaves original media and timeline clips unchanged. Add the copy through the existing media controls when desired; it is not automatically mixed with the original. This is local DSP, not AI voice isolation or reverb removal. Changes of account, project or source reject a pending cleanup; contexts, request controllers and multicam workers have lifecycle cleanup. Test with `node tests/master-app-browser.cjs`.
