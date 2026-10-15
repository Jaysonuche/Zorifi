"""Run a single offline OpenVINO image render for the loopback Zorifi server."""

import argparse
import json
from pathlib import Path
from time import perf_counter

from PIL import Image
import openvino_genai as ov_genai


def main():
    parser = argparse.ArgumentParser(description="Generate one local Zorifi image on CPU")
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--steps", type=int, default=4)
    parser.add_argument("--width", type=int, default=512)
    parser.add_argument("--height", type=int, default=512)
    args = parser.parse_args()

    output = Path(args.output)
    if output.suffix.lower() != ".png":
        parser.error("output must be a .png path")
    output.parent.mkdir(parents=True, exist_ok=True)

    started = perf_counter()
    pipe = ov_genai.Text2ImagePipeline(args.model, "CPU")
    loaded = perf_counter()
    image_tensor = pipe.generate(
        args.prompt,
        num_inference_steps=args.steps,
        width=args.width,
        height=args.height,
    )
    generated = perf_counter()
    image = Image.fromarray(image_tensor.data[0])
    image.save(output, format="PNG")
    with Image.open(output) as verified:
        verified.verify()
    finished = perf_counter()
    print(json.dumps({
        "width": image.width,
        "height": image.height,
        "bytes": output.stat().st_size,
        "load_seconds": round(loaded - started, 2),
        "generate_seconds": round(generated - loaded, 2),
        "total_seconds": round(finished - started, 2),
        "device": "CPU",
        "steps": args.steps,
    }), flush=True)


if __name__ == "__main__":
    main()
