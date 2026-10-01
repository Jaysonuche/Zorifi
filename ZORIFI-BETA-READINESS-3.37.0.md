# Zorifi 3.37.0 — real-world beta readiness and user validation

## Decision

**READY FOR A CONTROLLED/CLOSED WINDOWS BETA.**

Zorifi 3.37.0 is not yet an unrestricted production release. Its local editor, project persistence, Vanessa editor integration, support cases, Windows package, installer and WebM renderer passed meaningful automated and packaged-runtime tests. Provider-backed generation, Gmail delivery, live billing, semantic vision, native mobile distribution and long-duration 4K soak testing remain external or unverified dependencies and are not represented as live.

## Release evidence

| Gate | Result | Evidence |
|---|---:|---|
| Complete Node test suite | PASS | 1,027/1,027 tests; 0 failed/skipped |
| Web production build | PASS | 53 core files plus assets in `web-dist` |
| Windows x64 package | PASS | `release/Zorifi-win32-x64/Zorifi.exe` |
| Windows NSIS installer | PASS | `installer-dist/Zorifi-Setup-3.37.0.exe` |
| Actual silent installation | PASS | Installed into a clean temporary Windows directory and launched from the installed executable |
| Installed-app beta journey | PASS | Clean signup, media, edit, Vanessa, support, export, reload and persistence |
| Deep packaged runtime | PASS | Timeline, preview, playback, Vanessa Steps 7–25, docked layout and export |
| Real beta export | PASS | Valid `video/webm`, 63,329 bytes, from the rebuilt installed package |
| Deep runtime export | PASS | Valid `video/webm`, 70,717 bytes, from the final unpacked build |
| Responsive desktop | PASS | 1440×720, 1280×720 and 1024×720; 0 px horizontal overflow |
| AI provider availability | BLOCKED | Image/video/music/voice/language each returned honest 502/not configured |

## Real new-user journey

The dedicated test `tests/windows-beta-readiness.cjs` launches Zorifi from a clean user-data directory and exercises the application through Chrome DevTools Protocol without replacing editor services.

1. **First launch and account:** the real login/signup screen rendered; the signup form created a local account; the user session matched the persisted session identifier.
2. **Workspace discovery:** Create Project, Vanessa, Install and the new direct Help & Support entry were visible. Help & Support opened the real support-case UI.
3. **Media:** a real browser-encoded WebM, a decoded 1600×900 PNG and a decoded PCM WAV passed through `importFiles`, IndexedDB persistence, metadata/thumbnail/waveform generation and timeline insertion. A malformed PNG was rejected. An exact repeated file was rejected as a duplicate.
4. **Editing:** the video split into two clips; a real timeline effect and text layer were added; undo restored opacity to 100 and redo restored 72; the opening video set the 640×360 project frame.
5. **Vanessa:** “What’s your name?” returned a clean offline-capable response with no raw network error. “Add a title to my video” changed the real timeline.
6. **Support:** a BUG_REPORT case was created, stored by account and recovered after reload.
7. **Layout:** preview, timeline, Export and Support remained reachable at 1440, 1280 and 1024 pixels, with no document overflow.
8. **Export:** the installed application rendered and exposed a non-empty video WebM whose MIME type and byte size were validated.
9. **Close/reopen equivalent:** a full renderer reload restored the signed-in session, saved project, three persisted media assets, seven timeline clips, Vanessa’s four-message history and the support case.

The native Windows file-picker dialog itself is not driven by the automated test. The test uses genuine `File` objects through the exact production import/validation/storage pipeline. Physical microphone, fullscreen, native OS drag, screen reader and every installed codec remain manual beta checks.

## Bugs found and fixed

1. **Support was difficult to discover.** Help & Support was functional but buried in Account Settings. It now has a direct workspace-sidebar entry and an editor top-bar entry; both open the existing support system.
2. **1024 px desktop overflow.** The added editor control exposed a 36 px horizontal overflow on compact Windows laptops. Compact-desktop CSS now hides the nonessential search box, tightens top-bar spacing and uses bounded editor columns. The final packaged test reports zero overflow at 1024, 1280 and 1440 px.
3. **Duplicate Project Media.** Re-importing the exact same name/size/MIME combination silently created another asset. Imports now reject exact duplicates already present in the project or duplicated within one batch, with a clear toast; legitimate distinct files are unaffected.
4. **Beta regression evidence gap.** Existing tests covered deep architecture but did not prove the complete clean-user journey. A dedicated installed-app test now covers onboarding, real decoded media, editing, Vanessa, support, export and persistence.

## Original 34 YELLOW review

| Original YELLOW | Beta result | Evidence / remaining limit |
|---|---|---|
| Autosave/recovery | YELLOW | Reload persistence passed; an abrupt OS kill during a write was not induced. |
| Import validation | GREEN | Real WebM/PNG/WAV accepted, malformed PNG and exact duplicate rejected, media persisted. Native picker UI remains a manual OS check. |
| Generated media groups | YELLOW | Grouping works; no live provider credential generated new remote assets. |
| Stock media | YELLOW | Local grouping exists; no stock-catalog service is configured. |
| Drag/drop insertion | YELLOW | State/drop routing tests pass; native OS pointer drag was not replayed. |
| Auto-created tracks | YELLOW | Routing works; hundreds-of-tracks pointer stress remains unperformed. |
| Frame stepping | YELLOW | Frame paths pass; not tested against every machine codec. |
| Fullscreen preview | YELLOW | Control is wired; native OS fullscreen was not automated. |
| Font/style/alignment | YELLOW | State/preview/export tests pass; exact system-font availability varies. |
| Automatic captions | YELLOW | Safe workflow exists; live transcription provider is not configured. |
| Audio import/placement | GREEN | Real PCM WAV decoded, generated a waveform, persisted and entered the timeline. |
| Audio extraction | YELLOW | Processing architecture passes; no multi-gigabyte real extraction was run. |
| Audio speed/pitch | YELLOW | Model and processing paths pass; pitch quality depends on Web Audio/runtime. |
| Noise reduction/voice enhancement | YELLOW | Real browser DSP graph passes; it is not a neural stem service. |
| Multiple audio tracks/A-V sync | YELLOW | Runtime playback sync passes; no multi-hour soak run. |
| Masks | YELLOW | Rendering/keyframes pass; complex rotoscoping is not implemented. |
| Motion tracking | YELLOW | Pixel-motion/keyframe tracking passes; semantic object tracking needs vision infrastructure. |
| Background removal | YELLOW | Local image alpha removal passes; semantic video removal needs a provider/model. |
| Freeze/hold/reverse | YELLOW | Source mapping passes; reverse was not tested across packaged codecs. |
| Templates | YELLOW | Local editable templates pass; remote marketplace is absent. |
| MP4/4K export | YELLOW | Settings are real; MediaRecorder cannot guarantee MP4/4K on all hardware. WebM is verified. |
| Account login persistence | GREEN | Clean signup and renderer reload restored the same signed-in account. This remains device-local, not multi-device identity. |
| Vanessa reference analysis | YELLOW | Steps 9–25 pass; advanced semantic vision requires a configured provider. |
| Vanessa voice input/wake word | YELLOW | Logic/orb tests pass; physical microphone and OS speech services vary. |
| Vanessa speech output | YELLOW | Routing passes; exact voice needs an installed voice or configured voice provider. |
| Live AI image generation | YELLOW/BLOCKED | Honest 502 while unconfigured; no fake success/media. |
| Live AI video generation | YELLOW/BLOCKED | Honest 502 while unconfigured; Vanessa GPU/xAI provider required. |
| Live AI music generation | YELLOW/BLOCKED | Honest 502 while unconfigured; compatible provider URL/key required. |
| Live AI voice generation | YELLOW/BLOCKED | Honest 502 while unconfigured; voice provider key/voice ID required. |
| Responsive desktop | GREEN | Packaged runtime passed 1024/1280/1440 with 0 px overflow after remediation. |
| Mobile/iPad | YELLOW | Responsive/PWA suites pass; no native App Store or Play Store package exists. |
| Performance scheduler | YELLOW | Scheduling/cache/large-query tests pass; no multi-hour 4K soak. |
| Gmail support escalation | YELLOW/BLOCKED | Failure state is honest. Real delivery needs `GMAIL_ACCESS_TOKEN` and `ZORIFI_SUPPORT_EMAIL`. |
| Billing/subscription | YELLOW/BLOCKED | Verified-only entitlement architecture passes; live checkout/webhooks require a payment provider. |

Updated audit totals: **73 GREEN, 30 YELLOW, 0 RED** across the existing 103 feature groups. “YELLOW/BLOCKED” indicates a real external dependency, not fake local success.

## Vanessa validation

- Normal offline-capable conversation: passed; no “Failed to fetch” or raw network error.
- Existing editor action: passed; title appeared in real timeline state.
- Conversation and editor state remained separate.
- Deep packaged regression passed response planning, follow-up resolution, workflow pause/resume/correction, reference analysis, visual analysis, Steps 11–25 execution/planning/verification, recovery, docked panel state and selection preservation.
- Provider-backed knowledge/generation remains blocked until configured. No synthetic media or fake progress was substituted.

## Support and billing validation

- Direct support discoverability: passed from workspace and editor.
- Case creation, continuation, duplicate detection, user isolation, diagnostic secret removal and reload persistence: passed.
- Gmail missing configuration: accurately failed/blocked, not marked sent.
- Billing FREE → pending PRO → verified PRO entitlement transition: passed in provider-event tests.
- No card data is stored and no live checkout success is claimed.

## Performance and stability observations

- The beta project with simultaneous video, image, audio, text and effect layers completed editing and export without a renderer exception.
- Playback play/pause/seek/resume/end and playhead synchronization passed the deep Windows runtime.
- Project media was persisted in IndexedDB and recovered after reload.
- No infinite loading was observed in the exercised workflows.
- This pass did not run multi-hour timelines, multi-gigabyte media, exhaustive GPU matrices or extended memory-leak soak testing. Those remain controlled-beta telemetry/manual test items.

## Accessibility and usability

- Primary Support, Export, Install, Vanessa and project controls have labels/titles in the tested paths.
- Keyboard and focus behavior has automated coverage in the existing suite.
- No controls were clipped at the three Windows desktop widths tested.
- Physical screen-reader, high-contrast, keyboard-only end-to-end and reduced-motion review should be included in human beta sessions.

## Architecture preservation

No Step 26 was added. PersonalMemoryStore, Memory Manager/Context, ConversationContext, Continuity, Personalization, ConversationEngine, Vanessa Router, identity, EditorBridge, permissions, safety, Steps 15–25, customer support, billing, timeline, preview and export architecture remain in place. The changes integrate with the existing import, UI and test paths rather than creating competing systems.

## Cross-platform assessment

The Windows decision remains GREEN for a controlled beta. Web, iPhone, iPad and Android are YELLOW validation tracks: a real shared PWA/responsive implementation exists, but current browser/device runtime matrices have not been completed. macOS and Linux are GRAY/UNVERIFIED because there are no package targets or runtime artifacts. These statuses, capability-level evidence and release gates are maintained in `zorifi-platform-capabilities-3.37.0.json` and the five cross-platform beta documents.

## Files changed or created in this pass

- `app.js` — direct Support access and exact duplicate-media rejection.
- `styles.css` — compact Windows desktop layout protection.
- `tests/integration-wiring.test.cjs` — support discoverability and duplicate-import regression tests.
- `tests/windows-beta-readiness.cjs` — clean installed-app beta journey with real media/export/reload.
- `ZORIFI-BETA-READINESS-3.37.0.md` — this evidence report.
- `zorifi-beta-readiness.js` — bounded matrix, gate and sanitized bug-report validation logic.
- `zorifi-platform-capabilities-3.37.0.json` — machine-readable platform capability evidence.
- `tests/zorifi-cross-platform-beta.test.cjs` — cross-platform claim and readiness regression checks.
- `ZORIFI-CROSS-PLATFORM-BETA-PLAN-3.37.0.md`, `ZORIFI-PLATFORM-CAPABILITY-MATRIX-3.37.0.md`, `ZORIFI-BETA-TEST-CHECKLIST-3.37.0.md`, `ZORIFI-BETA-BUG-REPORT-TEMPLATE-3.37.0.md`, `ZORIFI-BETA-GATES-3.37.0.md` — controlled validation deliverables.

## Controlled-beta manual checklist

Before broad distribution, run human sessions on at least one low-spec laptop and one high-DPI monitor; use large phone videos from several codecs; test physical microphone/wake word/fullscreen/native drag; interrupt power during autosave; exercise a one-hour timeline; configure provider sandbox credentials separately; and test Gmail/payment sandbox integrations without placing secrets in source control.
