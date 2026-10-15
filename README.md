# Zorifi

## Project entry points

```text
Zorifi/
├── index.html                    # Loads the editor and its engines in order
├── styles.css                    # Desktop, tablet and mobile layouts
├── app.js                        # Existing editor UI and project state
├── zorifi-master-app.js           # Single window.ZorifiMasterApp facade
├── ZorifiVanessaStudioCore.js     # Public gateway, director and planner exports
├── ZorifiVanessaTrueAudioAI.js    # Compatibility export for local audio DSP
├── ZorifiAutoCaptions.js          # Caption engine and timeline bridge exports
├── ZorifiMulticamSyncEngine.js    # Worker-backed alignment export
├── api/vanessa-provider.js       # Vercel server-side gateway
├── netlify/functions/            # Shared backend service implementations
├── tests/                       # Unit and browser integration checks
└── flutter_mobile/              # Separate Flutter companion
```

Keep `app.js` lowercase: `App.js` would collide with it on Windows. The four
capitalized module files are public ES-module adapters to the implementations
already loaded by `index.html`; they do not boot a second editor. Import them
after the editor scripts have loaded. Call `window.ZorifiMasterApp` for operations
on the current project, including cleanup, captions, multicam and Vanessa chat.
The existing lowercase engine files remain the implementation sources.

The audio compatibility name does not imply AI isolation or reverb removal:
it provides local filtering and WAV encoding. Caption generation needs a real
transcription provider; keys stay in private server-side environment variables.

See [CHANGELOG.md](CHANGELOG.md) for the recovered project changes, Flutter additions, privacy controls, verification results and deployment status.

A polished, dependency-free browser video editor with on-device project rendering.

Zorifi is an Electron desktop application for Windows, macOS and Linux, a native Android package, and an installable Progressive Web App for Android, iOS/iPadOS and modern desktop browsers. It includes a responsive touch layout and offline app-shell startup.

The installed app detects its platform automatically. Mobile installations use the touch-first interface with safe-area support and horizontally scrollable tools/timeline; desktop installations use the full three-panel professional editor with inspector and precision controls.

## Run locally

Install Node.js and pnpm, then use the restored development server:

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Then open `http://127.0.0.1:4173`. Run `pnpm start` for the desktop app. See [REBUILD.md](REBUILD.md) for the recovery status, provider configuration, and checks that were actually run. Historical release and test claims elsewhere in this repository are not verification of this rebuilt copy.

## Install on devices

The new [Flutter mobile companion](flutter_mobile/README.md) lives alongside the existing editor. It supports local imports, selected-media preview, saved trim/volume edits, backups and optional Vanessa chat. Its native video rendering and desktop project synchronization are not yet implemented. Both apps now provide privacy choices, metadata export and local erasure; see [PRIVACY.md](PRIVACY.md) for implementation details and operational requirements.

- **Android APK:** Install `android-dist/Zorifi-debug.apk` for device testing. Android may ask you to allow installation from the app that opens the file.
- **Android PWA:** Open the hosted app in Chrome and choose **Install app** or **Add to Home screen**.
- **iPhone/iPad:** Open it in Safari, tap **Share**, then **Add to Home Screen**.
- **Windows:** Open it in Edge or Chrome and choose **Install Zorifi** from the address bar or app menu.
- **macOS:** Use the native DMG/ZIP release when available, or install the PWA from Safari/Chrome.
- **Linux:** Use the AppImage on most distributions or the `.deb` package on Debian/Ubuntu-compatible systems. The PWA remains available in Chrome/Edge.

Installation and offline support require the app to be served over HTTPS or localhost; opening `index.html` directly is not enough for PWA installation.

## Android application

The Capacitor Android project uses application ID `com.zorifi.editor`, supports Android 8.0/API 24 and newer, and bundles the current web release so the editor shell works without loading a remote website. Build and synchronize it with:

```powershell
npm run android:sync
npm run android:apk
```

The APK command writes `android-dist/Zorifi-debug.apk`. This debug-signed build is directly installable for testing. A public Play Store release must be built with an owner-controlled release signing key; credentials are intentionally not stored in this repository.

The desktop and hosted versions share this single source project. Follow `DEPLOY.md` to connect the project repository to Vercel, Netlify, Cloudflare Pages, GitHub Pages, or Azure Static Web Apps. Once connected, pushing an update redeploys the website automatically.

## Desktop applications

Zorifi 3.37.0 stores autosaved projects and recovery checkpoints in the operating-system application profile. Provider keys use Windows DPAPI, macOS Keychain, or a supported Linux keyring. Linux sessions that expose only Electron's insecure `basic_text` fallback are refused for provider-secret storage.

Build the release on the target operating system:

```sh
npm install
npm run package:current
```

Explicit targets:

- Windows: `npm run installer:windows`
- macOS Intel + Apple silicon DMG/ZIP: `npm run package:macos` (run on macOS; signing/notarization credentials are external)
- Linux x64 AppImage + deb: `npm run package:linux`

The macOS and Linux configurations are implemented but remain YELLOW until their installers and the full import/playback/export checklist run on real target systems.

## Included interactions

- Launch dashboard with a new-project action and recent project cards
- Automatic browser storage for project timelines, effects, captions, playhead, and display settings
- Reopen autosaved projects from the Recent Projects dashboard
- Search, sort, favorite and organize saved projects into folders
- Integrity-checked recovery checkpoints while an autosave is pending
- Create full editable project templates with required media and text placeholders
- Use, duplicate, rename, update and delete personal templates
- Creator workflow stages from idea through sharing, plus social frame and safe-guide presets
- Built-in and reusable custom export presets with progress, cancel, failure and retry states
- Save and apply real per-clip creator content presets
- Import video, image, or audio files by picker or drag and drop
- Keep imported files in a Project Media library until explicitly added to the timeline
- Import multiple files and add them by button or double-click
- Preview playback, scrubbing, aspect-ratio changes, and transport controls
- Select, split, delete, and add clips on a multi-track timeline
- Drag clips with edge snapping, nudge their timing, and ripple-delete gaps
- Frame-accurate playhead, clip and trim snapping to nearby clips and the playhead
- Exact photo durations with presets, free extension, correct left/right trimming and export persistence
- Set exact timeline start, duration, source in-point, speed, scale, position, rotation, opacity, and fit mode
- Edit clip names, opacity, and volume in the inspector
- Generate provider-backed captions from selected audio or video, auto-detect language, retry failures, and edit, retime, split, merge or delete every caption
- Dedicated Text workspace with 10 font families, searchable font cards, and text presets
- Eight editable text templates covering neon, lower-third, news, retro, cinematic, karaoke, typewriter, and social styles
- Text controls for font, size, weight, color, alignment, shadow, and outline
- Professional workspace with RGB scopes, colour correction, proxy mode, multicam monitor, and audio mixer
- Smart creator tools for AutoCut, vertical shorts, auto reframe, captions, background removal, filler-word cleanup, stabilization, and voice enhancement
- Apply 12 live video effects across trending, blur, light, retro, distortion, cinematic, and party categories
- Search effects and animations with persistent favorites, recently used shelves, deterministic visual covers, drag-to-apply and editable effect/keyframe state
- Adjust effect intensity and fade from a dedicated effects inspector
- Undo/redo editing actions
- Real on-device timeline rendering and downloadable WebM export, with MP4 when supported by the browser
- Separate secure provider configuration for AI image, video, music, voice and language work
- Real provider connection tests, truthful failure states, cancellation and on-device generation history
- Editable AI scripts, hook variations and storyboards generated by Vanessa's configured language provider
- AI caption translation that preserves original captions and exact timing on a separate track
- Real generated image, music and voice assets that enter Project Media and the editable timeline
- Vanessa Memory review with separate candidate and approved states, explicit Remember/Don't remember controls, per-category browsing, safe editing and confirmed deletion
- A responsive Memory Manager for approved preferences, interests, goals, projects and working context, isolated per signed-in user
- Confirmed clear-all memory that follows the personal-memory store lifecycle without deleting Vanessa conversation history
- Lightweight contextual-memory retrieval that scores approved memories against the current topic and recent ConversationContext, with a configurable minimum score of 5
- Context remains bounded to six approved memories, 300 characters per memory and 1,200 characters total; unrelated, duplicate, candidate and malformed sensitive records are excluded
- Contradictory statements become reviewable update candidates instead of silently overwriting approved memory, while explicit forget requests require confirmation and delete only the selected memory
- Phase 2 Step 4 adds a session-only conversation-continuity layer: current message and ConversationContext take priority over approved memory, while compact current-topic, task, project, decision and next-step context reduces repeated questions
- Natural remember, correction and forget intent routes through the existing candidate, approval and confirmation controls; candidates never enter provider context before approval
- Memory-aware provider context remains bounded and user-isolated, works with the offline conversation fallback, and never turns its session summary into permanent memory
- Dedicated audio import and real selected-video audio extraction to multi-channel PCM WAV with progress, retry, Project Media storage and optional timeline placement
- Project Media preview, rename, safe unused-media deletion, resolution/type/duration/size metadata and lazy image loading

The UI works without a build step or third-party dependency. Browser rendering is designed for short and medium projects; a future FFmpeg or native rendering engine would add broader codec support and faster long-form exports.

Vanessa’s continuity is bounded contextual memory, not human-like memory or unrestricted learning. It uses only the current session and memories the user has explicitly approved.

## Phase 2 Step 5 — Memory-Aware Personalization & Adaptive Conversation

Vanessa now uses a dedicated, local `PersonalizationEngine` after conversation continuity has selected relevant context. It consumes the existing approved personal-memory store and emits a compact provider payload; it does not create another database or perform background profiling.

Personalization follows this priority: explicit current instruction, current conversation, session continuity, approved long-term preference, then Vanessa’s normal default. Current requests such as “explain this in detail” therefore override an approved concise-answer preference. Temporary requests affect only the current conversation, while lasting changes continue through the existing candidate, review and approval flow.

Supported signals include concise, detailed or standard response depth; direct, step-by-step, example-led and plain-language communication; relevant structured, phased, implementation and verification workflows; and relevant approved creative preferences. Working preferences are limited to technical/project work, while creative preferences are limited to editing and content-creation contexts. Compatible preferences combine. Conflicting concise/detailed preferences are resolved from task complexity when possible, otherwise the payload requests clarification without deleting or rewriting either memory.

Only approved, valid, non-sensitive memories are eligible. Candidates, rejected or deleted items, credentials, payment information and other sensitive records are excluded. Stores and personalization engines remain scoped to the signed-in user or isolated guest scope. Provider personalization is allow-listed, capped at 800 characters, and does not include memory IDs, scores, the complete memory database or internal prompt construction.

The Step 5 suite covers communication and working preferences, precedence, temporary versus lasting requests, candidate approval, conflicts, corrections, relevance, privacy, user isolation, bounded provider payloads and desktop/PWA wiring. This is controlled personalization based on approved information—not psychological profiling, unrestricted learning or human-like understanding.

## Phase 2 Step 6 — Memory-Aware Intent & Goal Understanding

Vanessa now has a bounded local intent-understanding layer between conversation continuity and personalization. It describes what the user is trying to achieve without executing actions itself; editor work still passes through the existing router, EditorBridge, validation, permission and transactional action systems.

Supported primary intents are question, action request, creative goal, information goal, development goal, continuation, clarification, correction, memory request, reference-based editing and general conversation. A request may also retain secondary intents. The intent context keeps the ultimate goal, requested action, explicit constraints, editor entities, development subtype and reference status separate.

Continuation phrases such as “do it” and “continue” resolve from the current conversation first, then session continuity, then a single approved project memory. Ambiguous targets request clarification. Reference intent requires explicit language indicating reference, inspiration, comparison or recreation; an upload alone is not treated as a reference. Reference guidance concerns transferable characteristics such as pacing, cuts, timing, captions, effects, animation, colour and composition rather than frame-for-frame copying.

Development intent distinguishes bug investigation, feature development, redesign, performance work, architecture changes, testing, deployment, documentation, investigation and phase continuation. Editor intent recognizes only established editing concepts and informs the controlled editor workflow without directly changing state.

The provider receives an allow-listed intent payload capped at 1,400 characters. Raw confidence, internal priority, full memories and unnecessary history are excluded. Sensitive values are removed, candidates cannot influence continuation, users remain isolated, and the layer does not infer personality, mental state or protected characteristics.

Intent understanding identifies task intent from explicit language and bounded context. It is deterministic foundation work, not autonomous planning, unrestricted agency or psychological inference.

## Phase 2 Step 7 — Context-Aware Conversation Reasoning & Response Planning

Vanessa now has a bounded, session-only response planner in `zorifi-vanessa-response-planner.js`. It consumes Step 6 intent context and prepares a compact response plan before the existing router chooses the conversational or controlled editor path. It does not execute actions, bypass EditorBridge, or create a second personal-memory store.

The planner maintains a small conversation state containing the current topic, task, goal, action, target, project, active reference, recent decisions and suggestions, pending question or action, unresolved point, last confirmed or rejected instruction, conversation mode, and at most four recent tasks. Current explicit instructions remain authoritative over immediate conversation, session continuity, approved memory, and defaults.

Supported local resolution includes pronouns and conversational references, short follow-ups, ellipsis such as “more” or “a little,” corrections, topic shifts, returns to recent tasks, answers to pending questions, and acceptance or rejection of immediately pending suggestions. Acceptance never creates an action unless Vanessa actually proposed one. Ambiguous targets, missing references, and unsupported deictic requests produce a short clarification instead of a guessed edit.

Reference conversations can retain explicitly selected transferable characteristics such as transitions and pacing while excluding rejected characteristics. This is conversation planning only: Step 7 does not perform full visual reference analysis or claim media was analyzed when it was not.

Provider response-plan context is allow-listed and bounded to 1,200 characters. It excludes resolved command text, permission decisions, confidence values, private reasoning, full history, full memory records, credentials, and unnecessary editor state. Personalization still runs after intent and planning. The response planner works offline and provider failures continue to use sanitised fallbacks.

Privacy boundaries remain unchanged: temporary task context is not permanent memory; only approved memories may provide secondary context; candidates, rejected or deleted memories, and another user’s data cannot influence planning. The planner does not infer mental health, personality, beliefs, religion, sexuality, or other protected characteristics.

Known limitations: resolution is deterministic and bounded rather than human-level semantic understanding; unusual phrasing may require clarification; recent task branches are limited; visual reference analysis and automatic style recreation are not part of this step; provider-generated conversation still requires configured infrastructure; and development execution remains controlled rather than autonomous.

## Phase 2 Step 8 — Multi-Step Task Planning & Workflow Orchestration

Vanessa now has a bounded, session-only workflow planner in `zorifi-vanessa-workflow.js`. It consumes the structured Step 6 intent and Step 7 response plan, extracts up to 12 related tasks, preserves explicit order and constraints, identifies dependencies and independent work, and tracks pending, ready, running, completed, failed, blocked, paused and cancelled steps.

Workflow state is descriptive until a step passes through the existing router, EditorBridge, permission checks, action validation and editor transaction. The planner has no editor, filesystem, operating-system, network or code-execution access. It never grants itself permission, never invents a capability and never marks a step complete without a real result. One supported step is handed to the controlled editor path at a time; Vanessa asks the user to continue before advancing, preventing autonomous loops.

The workflow foundation supports continuation, pause/resume, cancellation, targeted retry, correction of duration or aspect-ratio constraints, removal of pending steps and insertion of new non-duplicate steps. Failed work blocks dependent tasks while preserving completed edits. Cancelling future work does not pretend already completed editor operations were undone.

Reference workflows retain only a bounded reference name, type and explicitly selected characteristics. Full visual reference analysis remains outside this step, so unsupported reference analysis is marked blocked rather than fabricated. Workflow state is separate from ConversationContext and PersonalMemory; it is never automatically saved as a preference, and candidate memories cannot influence it.

Provider workflow context is allow-listed and capped at 1,600 characters: overall goal, current step, remaining summaries, relevant constraints, target, reference summary, workflow status and response type. It excludes dependency internals, raw errors, confidence, hidden reasoning, complete history, complete memory data, credentials and unnecessary editor state. Local planning, ordering, state tracking, corrections, pause/resume, cancellation and retry selection work without a provider.

Known limitations: planning is deterministic and intentionally limited to 12 steps; unusual or vague wording may require clarification; independent steps are identified but not executed concurrently; unsupported editor operations stay blocked; full visual-reference analysis is not implemented; development workflows remain descriptive and controlled; workflow state is session-only; and provider-generated language still requires configured provider infrastructure.

Version 3.23.0 uses asset cache v155. Vanessa Phase 2 Step 9 adds a truthful, bounded reference-video analysis and editing-blueprint foundation. A video becomes a reference only after an explicit user instruction. Reliable local metadata and sampled cuts can produce duration, aspect ratio, segments and pacing; unmeasured transitions, zooms, speed changes, text, captions, overlays, effects, colour and composition remain `UNKNOWN` or `UNSUPPORTED`. The blueprint is descriptive-only and can prepare a confirmation-gated Step 8 workflow, but Step 9 never modifies editor state directly and does not implement automatic recreation.

The Step 9 suite contains 48 focused reference-analysis tests. The focused Vanessa suite passes 304/304 tests and the complete suite passes 472/472 tests with no skips or failures.

## Phase 2 Step 10 — Advanced Reference Visual Understanding

Version 3.24.0 uses asset cache v156. `zorifi-vanessa-visual-analysis.js` extends the Step 9 reference report with a bounded visual-analysis layer and richer editing blueprint. Locally measured cuts produce cut patterns, shot-duration statistics, pacing curves and editing rhythm. Bounded 32×18 frame samples can measure broad brightness, contrast, saturation and frame-translation trends without retaining the video. Frame translation is explicitly not presented as proven camera motion, and an exact filter is never inferred from colour statistics.

Transitions, zooms, speed changes, text, captions, overlays, effects, composition and audio/visual rhythm become `DETECTED` only when a verified measured signal is supplied. Inferences remain `UNKNOWN`; unsupported analysis remains `UNSUPPORTED`; unconfigured or HTTP 502 providers remain `BLOCKED`. Every result records whether its basis was measured, inferred or unavailable. OCR text, camera intent and beat alignment are never invented.

The Step 10 blueprint is capped at 12,000 characters, provider payloads at 2,200 characters, media duration at 600 seconds, frame sampling at 160 frames and 32×18 resolution, local analysis time at 18 seconds, segments at 120, characteristics at 24 and workflow steps at 12. Raw media is not stored in the blueprint or sent in provider payloads. Browser sampling yields while seeking each frame and returns an explicit timeout state instead of freezing or inventing a result; provider-assisted analysis is prepared but remains blocked until a real provider is configured.

User selections support additive and subtractive multi-turn requests, including “only” and “copy everything that Zorifi can reproduce.” “Copy everything” selects only fully supported, actually detected characteristics. Reference and target IDs are validated as separate. The resulting Step 8 workflow is confirmation-gated, uses concrete commands supported by the existing action parser where available, and still passes through the Router, permissions, EditorBridge and validated editor transaction. Step 10 does not edit the reference, duplicate source footage, perform frame-for-frame copying or automatically recreate an entire video.

Step 10 validation contains 55 focused visual-analysis tests. The focused Vanessa suite passes 359/359 and the complete Zorifi suite passes 527/527 with no failures or skips. The v156 production web build contains 36 top-level files with matching source/build hashes. The Windows 3.24.0 packaged runtime completes its Step 10 probe without renderer exceptions and produces a real WebM export. All five optional generation/language providers remain truthfully blocked with HTTP 502 until configured by the user.

## Phase 2 Step 11 — Reference-to-Edit Execution

Version 3.25.0 uses asset cache v157. `zorifi-vanessa-reference-execution.js` converts a verified Step 10 visual blueprint into a bounded, confirmation-gated execution plan for the user’s own target media. It validates the blueprint and target clips, keeps reference and target media separate, compares every requested characteristic with real Zorifi capabilities, and marks operations as ready, unsupported, unknown, blocked, completed or failed. A dry run describes what will happen without modifying the project.

Confirmed operations become an existing Step 8 workflow and continue through the Router, permission checks, EditorBridge and validated editor transaction. Step 11 does not contain an editor engine or mutate editor state directly. Each successful operation uses the existing transaction/history adapter, records progress only after the transaction succeeds, and remains editable, previewable, saveable, reloadable, undoable and exportable through the established project model.

Measured cut timing can be adapted across available clips; pacing, supported shot durations, verified zoom and speed patterns, captions, aspect ratio and bounded basic colour adjustments use existing registered editor commands. Exact supported transition IDs can be applied when available. Unidentified transitions, effects, fonts, overlays, unverified camera motion and provider-dependent work remain unsupported, unknown or blocked instead of being substituted. When the reference has more structural segments than target clips, the plan reports the shortfall and adapts timing without inventing media.

Pending plans support explicit confirmation or rejection, characteristic additions/removals, “only” corrections, slower pacing corrections, retry, pause, resume, cancel and applying the same supported treatment to the next available clip. Corrections never rewrite operations already recorded as completed. Partial execution preserves successful edits while reporting failed and unavailable work.

Step 11 validation contains 57 focused execution tests. The focused Vanessa suite passes 416/416 and the complete Zorifi suite passes 584/584 with no failures or skips. The v157 production web build contains 37 top-level files with matching source/build hashes. The Windows 3.25.0 packaged runtime executes a real reference-derived speed operation through the transaction pipeline, creates an undo history entry, keeps the reference separate, completes playback checks and produces a real WebM export. Optional image, video, music, voice and language providers remain truthfully blocked with HTTP 502 until configured.

## Phase 2 Step 12 — Reference Style Intelligence & Adaptive Recreation

Version 3.26.0 uses asset cache v158. `zorifi-vanessa-style-intelligence.js` derives a bounded style profile exclusively from measured Step 10 evidence, analyzes the user’s target clips locally, preserves relative rhythm instead of copying absolute reference timing, and creates an adaptive Step 11 execution plan. It supports fewer, more, unequal and mixed-orientation target clips; pacing preservation, compression, expansion, distribution and minimum-duration clamping; measurable boundary-based emphasis; bounded zoom and speed adaptation; supported transition validation; caption/text timing; broad supported colour adjustments; and explicit aspect-ratio choice without silently cropping.

Natural corrections support subtle, moderate and strong intensity plus persistent per-session reference/target locks. Mixed requests such as keeping reference pacing while excluding transitions or retaining target colours are resolved per characteristic. Every major transformation produces a non-mutating dry run and requires confirmation. Step 12 contains no editor mutation logic: confirmed operations continue through Step 11, Step 8, Router, permissions, EditorBridge and the validated transaction/history system.

Step 12 validation contains 67 focused tests. The focused Vanessa suite passes 483/483 and the complete Zorifi suite passes 651/651 with no failures or skips. The v158 production web build contains 38 top-level files with matching source/build hashes. The Windows 3.26.0 packaged runtime executes a real adaptive pacing operation, changes the target clip from 1.0× to 1.25×, creates an undo entry, exports a 69,454-byte WebM, and verifies real playback, pause, seek, resume and synchronized playhead behavior. Optional image, video, music, voice and language providers remain truthfully blocked with HTTP 502 until configured.

## Phase 2 Step 13 — Intelligent Content-to-Reference Matching

Version 3.27.0 uses asset cache v159. `zorifi-vanessa-content-matching.js` creates bounded measurable reference-segment and target-clip profiles, scores their structural compatibility, and prepares an ordered content mapping before Step 12 adapts the reference style. Strategies include structural, rhythm, visual similarity, duration and balanced matching. The plan distinguishes matched, possible, low, unknown, unsupported, blocked, user-selected and unmatched states without inventing semantic recognition.

Users can allow or prevent reuse, exclude clips, assign a clip to a particular segment, group selected clips for an opening or ending, reset Vanessa’s choices and preview the mapping before confirmation. Default behavior does not reuse a target clip; insufficient content produces a clarification instead of silently duplicating media. Confirmed work continues through Step 12, Step 11, Step 8, Router, permissions, EditorBridge and validated transactions, so preview, undo/redo, persistence and export retain the existing authority boundaries.

Step 13 adds 71 focused tests. The focused Vanessa suite passes 554/554 and the complete Zorifi suite passes 722/722 with no failures or skips. The v159 production web build contains 39 top-level files and all 39 source/build SHA-256 hashes match. The Windows 3.27.0 packaged runtime performs a real three-segment match, executes a real pacing edit, creates undo history, exports a 43,816-byte WebM, and verifies real playback through project end. See `PHASE-13-IMPLEMENTATION-REPORT.md` for the detailed report and limitations.

## Phase 2 Step 14 — Intelligent Edit Planning & Safe Execution

Version 3.28.0 uses asset cache v160. `zorifi-vanessa-edit-planner.js` converts Step 13 mappings and supported Step 11 operations into deterministic, inspectable edit plans. Plans contain stable IDs, version lineage, ordered actions, dependencies, provenance, confidence, unresolved items, warnings, permissions, estimated impact, confirmation state, transaction state and recovery metadata. Unsupported and uncertain capabilities remain explicit and cannot execute.

Dry runs are immutable and repeatable. They validate dependencies, permissions, duplicates, conflicts and arbitrary-code rejection while reporting exactly what can change, what cannot run and whether supported work is reversible. Confirmation is mandatory before mutations. Execution uses injected permission, transaction, EditorBridge and recovery adapters; the live app continues through Router, permissions and `VanessaActions.execute`, preserving capture/restore rollback and undo history. Corrections create a new plan version instead of silently changing a confirmed plan.

Step 14 adds 73 focused tests. The focused Vanessa suite passes 627/627 and the complete suite passes 795/795 with zero failures or skips. The v160 web build contains 40 top-level application files with 40/40 matching source/build hashes. The Windows 3.28.0 packaged runtime performs a real Step 14 dry run and confirmation, records transaction/recovery/undo metadata, executes a validated pacing edit, exports a 43,816-byte WebM and verifies real playback through project end. See `PHASE-14-IMPLEMENTATION-REPORT.md` for full architecture, safety boundaries and limitations.

## Mobile workspace release

Version 3.29.0 uses asset cache v161. The phone editor now has a dedicated touch-first Creative tools drawer connected to the real Media, Overlay, Text, Captions, Audio, Smart Edit, Effects, Filters, Animation, Transitions, Adjust, Cutout, Keyframes, Speed and Transform workspaces. It also exposes real fullscreen preview and Vanessa entry points, plus a reversible precision timeline mode. The layout accounts for safe areas, small phones, landscape phones, coarse-pointer devices and reduced-motion preferences. No desktop editor behavior is replaced by this release.

## Vanessa Phase 2 — Step 15

Version 3.30.0 uses asset cache v162. Vanessa now records structured edit outcomes, verifies approved Step 14 actions against safe before/after editor state, identifies partial completion, blocks duplicate successful operations, classifies failures and offers confirmation-gated recovery through existing editor adapters. Normal conversation remains independent of project state. See [VANESSA-PHASE-2-STEP-15-REPORT.md](VANESSA-PHASE-2-STEP-15-REPORT.md) for the implementation and verification report.

## Local customer dashboard (CRM v1)

Run `npm run dev`, then open [Customers](http://127.0.0.1:4173/crm.html). Unlock with `CRM_ADMIN_KEY` from the private local `.env` file. This workspace has a generated key; on another machine, set a new random key of at least 32 characters. Restart the server after changing it. The dashboard forgets the key on reload, lock, or 15 minutes of inactivity.

Includes customer search, reported subscription labels, internal notes, dated follow-ups, support case status and deletion-request tracking. Import copies only profile names/emails and case summaries from this browser's Zorifi storage on the same origin; repeated imports do not duplicate cases or overwrite their CRM status. It does not discover all cloud customers.

Records persist in `.zorifi-private/customers.json`, excluded from Git and public static serving. Keep private backups of that folder. This is local file storage, not encrypted storage or a multi-server database. Run only one development server against a given record folder. Writes use revision checks and atomic file replacement. The audit records operations, but a shared administrator key cannot identify individual administrators.

Subscription labels do not change billing or grant access. Deletion statuses are tracking only: actually erasing customer data in other systems requires a separate process. CRM case changes are independent of the editor's support records. This version runs on the local development server; it is not deployed to Vercel, available in the packaged desktop app, or connected to cloud billing/customer records.

Verify with `node --test tests/crm.test.cjs` and `node tests/crm-browser.cjs`.

### Gemini language gateway

Set server-only `GEMINI_API_KEY` and optional `GEMINI_MODEL` (default `gemini-3.8-flash`). Set `GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite` to retry a transient primary-model service failure on another Gemini model before showing an error. Fallback happens only before any visible response text; interrupted responses are never joined to a second model's output. A configured Gemini key takes precedence over OpenRouter/OpenAI for language requests. The shared backend uses the official @google/genai SDK for streaming chat and structured planning. Text chat and JSON scene/editor planning are supported; Gemini image analysis, web research and audio transcription are not enabled by this adapter.

`POST /api/vanessa-provider` accepts `{prompt, editorContext}` and returns `{text, reply}`. Existing `?service=...` routes keep their response formats and hosted Firebase authentication. Provider errors are sanitized. Configure the same variables in Vercel and redeploy to enable hosted use; local `.env` changes alone do not deploy anything. Restart `npm run dev` after changing credentials.

The Windows desktop app uses the signed-in account to send Vanessa language requests through Zorifi's fixed Vercel gateway when no local language provider is configured. It loads only the public Firebase web configuration from the site; the Gemini key stays on the server. After upgrading an older desktop or installed web app that had only a local session, log out and sign back in once to establish a Firebase session. If the online request fails, Vanessa now shows the connection or sign-in problem instead of presenting a canned reply as an AI answer.

### Gemini image and music generation

The existing AI Image and AI Music prompt screens, Vanessa chat actions, and Music Studio now call Gemini through the server-side gateway when `GEMINI_API_KEY` is set. Image creation and reference variation use `GEMINI_IMAGE_MODEL` (default `gemini-nano-banana-2.1`) and return a real 1K image. Music uses `GEMINI_MUSIC_MODEL` (currently `lyria-3-clip-preview`) to return one 30-second MP3. Completed files can be saved into Project Media and placed on the editable timeline. Provider tests check that the key can list the model; they do not prove generation or billing access.

Google offers no API free tier for these image and music generation models. Each generation can incur a charge, and the Google project must have paid-tier access. Hosted Gemini media generation is limited to verified UIDs in `ZORIFI_ADMIN_UIDS` until per-user billing limits are in place. Zorifi keeps the key on the server, never sends it to browser code, and reports access, quota, or missing-media failures without fabricating results. The current Lyria route does not produce separated stems, a WAV file, or an exact user-selected duration. The Vercel function payload limit also bounds media returned directly to the browser; files larger than 3 MB are rejected with a clear error. Configure `GEMINI_API_KEY` in local `.env` and Vercel Production separately, then redeploy for hosted use. See Google's [image generation](https://ai.google.dev/gemini-api/docs/image-generation), [music generation](https://ai.google.dev/gemini-api/docs/music-generation), and [pricing](https://ai.google.dev/gemini-api/docs/pricing) documentation.

### Vanessa streaming

Text chat and writing requests opt into SSE with `stream: true` or `Accept: text/event-stream` on the conversation gateway. Gemini uses `generateContentStream`; each `data: {"text":"..."}` event is a text delta, followed by `data: [DONE]` only after a complete provider result. Stream failures emit a sanitized error event without a completion marker. Other providers retain JSON chat through the unsupported-stream fallback. Structured timeline/action plans remain JSON and execute only after existing validation.

The browser shows an escaped temporary response while receiving, saves the completed answer once, and supports Stop. A truncated response is marked interrupted rather than saved as completed. Local, Electron source and Vercel adapters relay chunks without buffering. Hosted requests require Firebase authentication; the loopback development preview uses its same-origin local gateway and does not require a Firebase cloud token. Optional-AI consent remains required.

### Replicate Wan video tool

Vanessa exposes the native Gemini function declaration `generate_ai_video` through `vanessa-video-tool`. Explicit chat requests such as “Generate a 5-second video of ocean waves” propose validated parameters, then start a job through `vanessa-motion`. Scripts, advice and existing-clip edits stay on their existing routes. The chat displays the finished video only after Replicate reports success.

Set `REPLICATE_API_TOKEN` in the server environment (local .env and Vercel Production), then redeploy. Keep it out of browser configuration. A Gemini key is also required for tool planning. No Replicate credential is bundled. The hosted identifier is `wan-video/wan-2.1-1.3b`, corresponding to the Wan 2.1 T2V 1.3B family; `Wan-AI/Wan2.1-T2V-1.3B-Diffusers` is the Hugging Face identifier, not a Replicate API endpoint.

Supported inputs: text prompt, integer duration 1–5 seconds, 16:9 or 9:16, silent 480p output. Frames are duration × 16 + 1. Unsupported sizes, audio and image inputs are rejected. Replicate is a paid service requiring account credit. Provider output links are temporary; save completed videos promptly. The chat preview does not automatically import footage into a project. Jobs are not resumed automatically after page reload.

All hosted calls require Firebase authentication. Poll/cancel requests carry a signed, expiring job ticket tied to the verified Firebase UID. Neither arbitrary prediction IDs nor client-supplied callback URLs are accepted. Token rotation invalidates outstanding job tickets. Tests use mocked provider calls; no paid render is part of the test suite.

References: https://replicate.com/wan-video/wan-2.1-1.3b/api/schema and https://replicate.com/docs/topics/predictions/create-a-prediction

### Firebase token refresh

The REST-based FirebaseGateway refreshes through Google's Secure Token endpoint one minute before expiry, coalesces concurrent refresh requests, and retries authenticated requests at most once after HTTP 401. Streaming response bodies remain untouched on success. The app initializes the manager at startup and rechecks tokens when the tab becomes visible or the browser comes online.

Hosted Firebase credentials are kept in memory and localStorage scoped by project, so the cloud session survives browser restarts and can refresh across tabs. Existing sessionStorage credentials are migrated once. Logout removes the cloud session; revoked refresh credentials return the user to the sign-in screen, while transient network errors retain the session for a later retry. Do not put provider API keys in browser storage.

The hosted site treats the Firebase UID as the online identity. A remembered device profile without a matching cloud session now shows a reconnect screen before Vanessa can be used. Email/password sign-in can create the local profile on a new browser; projects and media still remain on the device where they were made. A legacy email or phone-only profile can be linked when the user creates an online account with the same local password. Hosted sign-in requires email because Firebase phone authentication is not configured.

After a successful refresh, the console prints `[Zorifi Auth] Firebase ID token refreshed successfully.` It does not print tokens, and an unsigned-in startup does not falsely report a refresh.

This project uses `scripts/build-web.cjs`, not Vite or Next.js. The four public `FIREBASE_*` values are explicitly injected into hosted builds through `window.__ZORIFI_FIREBASE_CONFIG__`. The local preview serves its own same-origin API without that hosted Firebase configuration. Keep those existing names; `import.meta.env` and framework prefixes are not used. Gemini, Replicate and administrator settings remain server-only.

### Local video execution fallback
The video handler returns HTTP 200 with status `local_required` when the Replicate token is missing or a new render receives HTTP 402 (insufficient credit). Set server-only `VANESSA_VIDEO_EXECUTION_MODE=local` to request this mode explicitly. Existing configured GPU/xAI routing remains available unless local mode is selected. Authentication and video parameter validation still apply.

The `localExecution` JSON contains the Wan Diffusers model ID, prompt, frame count, dimensions and frame rate. Vanessa displays this payload without polling or claiming a completed render. This is a handoff only: no local runner is installed or launched, and Vercel cannot execute a GPU job on your laptop. A compatible local GPU, model weights and Python/PyTorch/Diffusers setup are required. Provider authentication errors, rate limits and ambiguous network failures do not trigger fallback, to avoid hiding errors or duplicating a potentially running job.

`ZORIFI_LOCAL_VIDEO_FALLBACK=true` also forces the local execution handoff, even when a cloud token is present. This flag is server-only.
