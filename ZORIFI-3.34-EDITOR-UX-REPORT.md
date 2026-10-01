# Zorifi 3.34 — Editor UX and Direct Text Editing

## Implemented

- Direct preview text selection by clicking or tapping a visible text layer.
- Drag-to-move text using frame-relative X/Y values shared by preview and export.
- Four corner handles for live text resizing from 8 px to 360 px.
- Rotation handle for direct text rotation.
- Mouse, pen and touch pointer support.
- Center alignment guides and snapping while moving text.
- Undo snapshot before a direct manipulation gesture.
- Autosave after moving, resizing or rotating text.
- Selection and locked-track protection.
- Preview/export text positioning parity.
- Dedicated text transform selection styling that keeps Zorifi's purple/pink identity.
- Desktop editor tool groups: Create, Composite, Finish and Motion.
- Refined desktop top bar, tool rail, panels, preview stage, inspector and timeline styling.
- Timeline **Fit** control that calculates zoom from the current sequence duration and viewport.
- Existing timeline zoom, snapping, multi-track drag/drop, resize, trim, keyframes and track controls preserved.

## Release

- Version: `3.34.0`
- Offline cache: `v167`
- Web production build: passed (44 files plus optimized assets)
- Windows installer: `installer-dist/Zorifi-Setup-3.34.0.exe`

## Verification

- Focused direct-text/layout tests: 3/3 passed.
- Complete automated suite: 960/960 passed.
- Windows packaged runtime smoke test: passed.
- Real packaged WebM export: passed.
- Playback/playhead synchronization: passed.
- Vanessa conversational and editor-control checks: passed.
- Scroll preservation: passed.
- Renderer exceptions: none.

## Honest scope note

This release implements the editor/layout/timeline and direct text interaction requested in this iteration. Large independent infrastructure programs such as a full proxy-generation service, portable project archives, plugin SDK, and opt-in telemetry remain separate production phases; no placeholder controls were added for unfinished infrastructure.
