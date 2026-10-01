# Zorifi 3.37.0 beta test checklist

Use one copy per platform/device/browser. Attach evidence to every failure.

## Test identity

- [ ] Platform and OS version recorded
- [ ] Browser/Electron version recorded
- [ ] Device model, CPU/RAM/GPU and display recorded
- [ ] Zorifi version/build hash recorded
- [ ] Install mode recorded (installer, unpacked, browser, PWA)
- [ ] Clean profile vs returning profile recorded

## Installation, startup and account

- [ ] Installation/open succeeds with no fatal console/runtime error
- [ ] Startup animation respects reduced motion and does not delay use
- [ ] Signup/login works locally
- [ ] Session survives close/reopen on the same profile
- [ ] Logout removes the active local session
- [ ] No claim of cloud identity or cross-device sync appears

## Responsive/mobile protection

- [ ] No horizontal document overflow
- [ ] No clipped or unreachable primary controls
- [ ] Preview, timeline, inspector/tools and Vanessa remain usable
- [ ] Phone portrait and landscape pass
- [ ] Safe areas/notches/camera cutouts pass
- [ ] iPad/tablet layout is not the phone layout merely stretched
- [ ] Touch targets, drag, trim, scrub and pinch/zoom are usable
- [ ] Keyboard shortcuts pass where a keyboard is supported
- [ ] Rotation/resizing preserves project, selection, scroll and playhead

## Media and project continuity

- [ ] Real video, image and audio import
- [ ] Multiple files and duplicate rejection
- [ ] Unsupported/malformed file gives a bounded error
- [ ] Thumbnails/waveforms/previews are valid
- [ ] Assets enter the correct tracks
- [ ] Save/reload restores project metadata and media
- [ ] Missing media is reported without losing project structure
- [ ] Browser quota/eviction behavior is documented
- [ ] Tester understands projects do not sync to other devices

## Editing and timeline

- [ ] Select, move, trim, split, duplicate and delete clips
- [ ] Multiple video/audio/text/overlay tracks
- [ ] Snapping, ruler, scroll and zoom
- [ ] Track visibility/mute/lock where exposed
- [ ] Effect and parameter visibly alter preview
- [ ] Transition plays between real clips
- [ ] Text/caption appears and can be edited/timed
- [ ] Audio volume/mute/trim/split/waveform and sync
- [ ] Keyframe change is visible during playback
- [ ] Undo and redo restore exact states
- [ ] Save/reload preserves all edits

## Playback and export

- [ ] Play/pause/seek and playhead stay synchronized
- [ ] Multiple clips and audio remain synchronized
- [ ] Fullscreen/fit/fill controls work where exposed
- [ ] Background/resume does not duplicate audio
- [ ] Real WebM export completes with truthful progress
- [ ] Output opens in an independent player/browser
- [ ] Output duration, video, audio, text, effect and transition verified
- [ ] MP4 is offered only when runtime support exists
- [ ] Cancel/failure leaves project usable
- [ ] Large project/high-resolution constraints are reported honestly

## Vanessa

- [ ] Casual conversation works without loading editor state
- [ ] No raw “Failed to fetch” or stack/API error appears
- [ ] Editing request uses the selected real context
- [ ] Confirmation/permission behavior remains intact
- [ ] Successful response corresponds to an actual state change
- [ ] Failed/partial action is not reported as complete
- [ ] Reference workflow uses the existing Steps 9–25 path
- [ ] Undo/retry/recovery works after a Vanessa edit
- [ ] Conversation and editor selection survive panel open/close
- [ ] Microphone denial and unavailable speech services degrade cleanly

## Support, security and privacy

- [ ] Support case creation/continuation/duplicate detection works
- [ ] Support case remains account-isolated after reload
- [ ] Diagnostics contain no token/password/key/secret
- [ ] Gmail escalation says blocked when not configured
- [ ] Provider credentials are never stored in frontend source/storage
- [ ] Permissions are requested only for the action that needs them
- [ ] Clearing site/app data consequence is documented

## Final disposition

- [ ] All Blocker/Critical issues attached to bug reports
- [ ] Gate results recorded
- [ ] Export artifact and validation evidence attached
- [ ] Platform status is GREEN, YELLOW, RED or UNVERIFIED without exaggeration

