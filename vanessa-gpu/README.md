# Vanessa GPU integration

The lost repository did not contain a GPU server, model weights, or its environment. The recovered editor can connect to a separately deployed, authenticated video server through `VANESSA_GPU_URL` and `VANESSA_GPU_KEY`.

The rebuilt adapter expects an xAI-compatible protocol:

- `GET /health` with bearer authentication returns `{ "ok": true }`.
- `POST /v1/videos/generations` accepts model, prompt, duration, aspect_ratio, resolution, optional image and reference_images; returns request_id.
- `GET /v1/videos/:id` returns status (`pending`, `done`, `failed`) and a completed `video.url` over HTTPS.

Generation percentages are displayed only when the server reports them. No model or generated-media substitute is bundled. Without a GPU server, configure xAI through the desktop provider settings instead. Generation requires credentials and provider access.
