# Zorifi AI Music provider setup

Zorifi does not bundle a provider key or substitute demo audio. The Music Studio becomes live only when a compatible HTTPS music service is configured.

## Netlify environment variables

- `VANESSA_MUSIC_URL`: provider base URL. Zorifi calls `POST /v1/music/generations` and polls `/v1/music/generations/:id`.
- `VANESSA_MUSIC_KEY`: secret provider bearer token. Keep this in Netlify environment variables, never in browser code.
- `VANESSA_MUSIC_MODEL`: optional provider model identifier.
- `GEMINI_API_KEY` (or `LYRIA_API_KEY`): optional Google Gemini API key. When the custom URL/key pair above is absent, Zorifi calls Google's server-side `POST /v1beta/interactions` endpoint with `lyria-3.5` (or `VANESSA_MUSIC_MODEL`). The key is never sent to the browser.
- `VANESSA_STEMS_URL` and `VANESSA_STEMS_KEY`: optional compatible stem-separation service.
- `FIREBASE_WEB_API_KEY`: Firebase web API key used for Identity Toolkit verification and injected as public browser configuration during the production build.
- `FIREBASE_PROJECT_ID`: Firebase project containing the verified subscription document.
- `FIREBASE_AUTH_DOMAIN` and `FIREBASE_APP_ID`: optional public Firebase browser configuration.

## Verified subscription record

The server checks `users/{firebaseUid}/private/subscription`. Pro access is granted only when the authenticated user owns the record and it contains:

```json
{
  "uid": "the Firebase user ID",
  "verified": true,
  "plan": "PRO",
  "status": "ACTIVE"
}
```

Unconfigured, unauthenticated, missing, malformed, or unverified records fail closed to the Free limits: a maximum 30-second MP3 mix and no separated stems. Verified Pro requests may request longer tracks, separated stems, and WAV output. The upstream provider must support the fields documented in `netlify/functions/vanessa-music.mjs`.

## Provider response contract

Start responses must contain either a secure `https://` audio URL, secure stem URLs, or a job ID. Poll responses may return provider-derived progress; Zorifi never manufactures generation percentages or media.

Google Lyria Interactions responses are synchronous. Zorifi accepts only a valid audio MIME type with base64 audio returned by that secure function, persists the decoded result into Project Media, and adds the real audio clip to the timeline. Lyria does not return separated stems through this route; configure the separate stem service for that capability. If neither provider path is configured, generation fails clearly and no mock audio is created.
