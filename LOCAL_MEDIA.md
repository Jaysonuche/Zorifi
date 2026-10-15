# Local image and music generation

Zorifi's local development server can create images and short music clips on this computer without sending those prompts to a paid image or music API. The server runs the models in separate Python environments; browser code receives only the finished PNG or WAV. The models are stored outside Git in `%USERPROFILE%\.cache\zorifi-local`.

The local `.env` selects the engines:

```text
ZORIFI_IMAGE_PROVIDER=local
ZORIFI_MUSIC_PROVIDER=local
```

Start the project with `npm run dev` and open `http://127.0.0.1:4173`. In **AI Video Creation**, choose the **Image** or **Music** tab. Image generation currently supports a prompt and a square 512 × 512 PNG. Music generation supports a prompt and a 5–30 second instrumental WAV. Only one local render runs at a time; finish or cancel it before starting another. The app reports unavailable models instead of silently charging a cloud provider. Vanessa chat can also start these jobs. The privacy choice for optional AI processing must be enabled in Zorifi.

On the tested Surface Laptop 4 (Intel i7-1185G7, 32 GB RAM), a four-step image render took about 66 seconds through the Zorifi gateway; a five-second music clip took about 9–11 seconds. The browser flow generated both and saved them as project media. Times vary with the prompt, clip duration and other CPU work.

The image runtime uses [OpenVINO's LCM DreamShaper v7 INT8 model](https://huggingface.co/OpenVINO/LCM_Dreamshaper_v7-int8-ov) and the project script at `scripts/local-image-generate.py`. The music runtime uses [Stability AI's Stable Audio 3 LiteRT CPU implementation](https://github.com/Stability-AI/stable-audio-3/blob/main/optimized/tflite/README.md), with the `sm-music` and `same-s` models. If this computer is replaced, recreate the Python environments and download the model files into the same cache layout before enabling the two flags. The music models download on the first direct run of `sa3_tflite.py`; Zorifi itself runs with model downloads disabled so a missing model cannot unexpectedly reach the network.

For a fresh Windows setup with Python 3.12 and Git installed, these commands recreate the layout (the model downloads are several gigabytes):

```powershell
$zorifiCache = Join-Path $env:USERPROFILE '.cache\zorifi-local'
py -3.12 -m venv (Join-Path $zorifiCache 'image\venv')
& (Join-Path $zorifiCache 'image\venv\Scripts\python.exe') -m pip install openvino-genai pillow huggingface-hub
& (Join-Path $zorifiCache 'image\venv\Scripts\python.exe') -c "from huggingface_hub import snapshot_download; snapshot_download(repo_id='OpenVINO/LCM_Dreamshaper_v7-int8-ov', local_dir=r'$zorifiCache\image\model')"

git clone https://github.com/Stability-AI/stable-audio-3 (Join-Path $zorifiCache 'music\stable-audio-3')
py -3.12 -m venv (Join-Path $zorifiCache 'music\.venv')
& (Join-Path $zorifiCache 'music\.venv\Scripts\python.exe') -m pip install -r (Join-Path $zorifiCache 'music\stable-audio-3\optimized\tflite\requirements.txt')
& (Join-Path $zorifiCache 'music\.venv\Scripts\python.exe') (Join-Path $zorifiCache 'music\stable-audio-3\optimized\tflite\scripts\sa3_tflite.py') --prompt 'gentle instrumental piano' --dit sm-music --decoder same-s --seconds 5 --out (Join-Path $zorifiCache 'music\first-test.wav')
```

The Vercel or Netlify server cannot run models stored on this laptop. Hosted image and music generation keep their separate provider configuration and may incur charges unless the browser uses the local music bridge below. Review the [Stable Audio Community License](https://stability.ai/license) and the image model's license before redistributing model weights or using outputs commercially.

## Use local music in the desktop app

The desktop app automatically selects **Local CPU** for Music when the installed music runtime and model files are present. Open the Music section, enter a prompt, and generate a 5–30 second instrumental clip. The desktop loopback server runs the model on this computer and returns a WAV for preview and project import. Set `ZORIFI_MUSIC_PROVIDER=hosted` only if you intentionally want to use a configured remote music provider instead.

## Use local music from the hosted website

On this same computer, start the Zorifi desktop app with the local music model installed, then open the hosted Zorifi site at `https://zorifi.vercel.app`. In the Music section, choose **Use this computer** and allow the browser's local network access prompt. Keep the desktop app running while generating. The hosted page sends the music request directly to the desktop app at `127.0.0.1`; the model runs on this computer and returns the WAV to that browser for preview or project import. The desktop companion accepts requests only from the configured Zorifi site origin. If you use another production domain, set `ZORIFI_COMPANION_ORIGIN` to that exact HTTPS origin before starting the desktop app.

This bridge works only when the website and desktop app are open on the same computer, and only in browsers that permit the local connection. Install and run the current desktop build (`installer-dist/Zorifi-Setup-3.37.0.exe` in this workspace); an older installed build does not have the bridge. The bridge is deployed to `https://zorifi.vercel.app`. It does not install the model on Vercel or provide generation to another device or visitor. Those users need a separately configured hosted music provider, which can incur charges. If the browser blocks the connection, use the local Zorifi app or its `127.0.0.1:4173` development preview instead.
