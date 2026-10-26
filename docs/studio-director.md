# Vanessa Studio Director

The director shares the running editor's project state, scene planner, music provider and local media store. It does not create a second timeline or expose provider credentials.

In Vanessa, try: **Create a cinematic montage with an upbeat synthwave soundtrack at 128 BPM in D minor.** Import photos or video into an open project first. Music-only commands work in either the video or music workspace.

## Application API

```js
const result = await window.ZorifiMasterApp.executeDirectorCommand(
  'Create a cinematic montage with a synthwave soundtrack',
  window.ZorifiMasterApp.state.mediaAssets,
  { signal: abortController.signal }
);
// result.type: studio_directed | video_planned | music_generated | conversational
// result.applied: clipIds, sceneClipIds, musicClipIds, musicDuration
```

Use `window.ZorifiMasterApp.cancelDirectorCommand()` or Vanessa's **Stop** button to cancel pending direction. Cancellation and account/project/source changes prevent pending content from being applied.

The public ES module is `ZorifiVanessaStudioDirector.js`. `ZorifiVanessaStudioCore.js` continues to export the same class and `processUserPrompt()` compatibility method. A no-argument director delegates to the running application's live bridge:

```js
import { ZorifiVanessaStudioDirector } from './ZorifiVanessaStudioDirector.js';
const director = new ZorifiVanessaStudioDirector();
await director.processUserPrompt('Generate upbeat music at 128 BPM');
```

The injectable core in `zorifi-studio-director.js` accepts `(aiGateway, scenePlanner, audioStudio, hooks)`. Hooks provide captured scope checks, scene requests, music generation, decoded/persisted music preparation, a synchronous commit, staged-resource cleanup and progress. Live application hooks are implemented in `zorifi-master-app.js`.

## Application behavior

- Scene and music results are prepared and validated before one undo snapshot. Existing edits remain; new scenes append before any automatic ending.
- Audio must download, decode and persist on the device before insertion. Only completed, playable provider results can succeed.
- Timeline tracks use the existing typed allocator and avoid locked, muted and hidden tracks. Music starts with the appended scenes, or at the captured playhead for music-only requests.
- The decoded audio duration determines valid source bounds. The current Lyria Clip provider generates 30-second MP3 files. Shorter scene plans trim the inserted soundtrack; a longer plan retains the available source duration rather than stretching or inventing audio.
- Optional AI consent, account authentication and hosted generation permissions remain enforced. Keys and model selection remain on the server. Provider access, quota or decoding failure produces an error without applying a partial scene/music edit.
- Private projects and generated originals remain in the device's account-scoped local store. The scene planner can use its existing metadata-based on-device fallback, and the result identifies that fallback.

Tests cover mixed commands, real WAV decoding/persistence with fixture provider responses, one Undo, track selection, cancellation, stale scope cleanup, failure handling, public module imports and the Vanessa chat route. They do not make paid generation calls.
