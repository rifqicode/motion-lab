"""One offline process per job releases model and CUDA memory on completion."""
import contextlib
import json
import os
from pathlib import Path
import re
import socket
import sys

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"

# Fail rather than silently fetching assets if an upstream dependency changes.
original_connect = socket.socket.connect
def local_only_connect(sock, address):
    if sock.family in (socket.AF_INET, socket.AF_INET6):
        raise RuntimeError("Network access is disabled during voice-over generation")
    return original_connect(sock, address)
socket.socket.connect = local_only_connect

request = json.loads(sys.stdin.buffer.read(32_768))
text = request["text"].strip()
if not text or len(text) > 3000:
    raise ValueError("Narration must contain 1 to 3000 characters")
cache = Path(__file__).resolve().parents[2] / ".cache" / "chatterbox"
receipt = "downloaded.json" if os.environ.get("STUDIO_CHATTERBOX_SETUP_CHECK") == "1" else "ready.json"
if not (cache / receipt).is_file():
    raise RuntimeError("Run node scripts/chatterbox/setup.mjs first")

with contextlib.redirect_stdout(sys.stderr):
    import numpy as np
    import soundfile as sf
    import torch
    from perth.perth_net.perth_net_implicit.perth_watermarker import PerthImplicitWatermarker
    from chatterbox.tts import ChatterboxTTS

    torch.set_num_threads(min(4, os.cpu_count() or 1))
    torch.manual_seed(42)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Loading local Chatterbox Indonesian on {device}", file=sys.stderr, flush=True)
    model = ChatterboxTTS.from_local(cache / "model", device=device)
    print("Local model loaded; network access remains disabled", file=sys.stderr, flush=True)
    # Keep autoregressive generation bounded per phrase; never truncate a script.
    parts = re.split(r"(?<=[.!?;])\s+", text)
    chunks = []
    for part in parts:
        words = part.split()
        chunk = ""
        for word in words:
            if len(word) > 240:
                raise ValueError("A narration word exceeds the supported length")
            if chunk and len(chunk) + len(word) > 220:
                chunks.append(chunk)
                chunk = word
            else:
                chunk = f"{chunk} {word}".strip()
        if chunk:
            chunks.append(chunk)
    pieces = []
    for index, chunk in enumerate(chunks):
        print(f"Synthesizing phrase {index + 1}/{len(chunks)}", file=sys.stderr, flush=True)
        wav = model.generate(chunk, exaggeration=0.4, cfg_weight=0.5).squeeze(0).cpu().numpy()
        if wav.size == 0 or not np.isfinite(wav).all():
            raise RuntimeError("Model returned invalid audio")
        if index:
            pieces.append(np.zeros(round(model.sr * 0.15), dtype=np.float32))
        pieces.append(wav)
        if sum(len(piece) for piece in pieces) / model.sr > 120:
            raise RuntimeError("Narration exceeds the supported two-minute limit")
    audio = np.concatenate(pieces)
    output = Path(request["outputPath"])
    sf.write(output, audio, model.sr, subtype="PCM_16")
    result = {"durationMs": len(audio) / model.sr * 1000, "sampleRate": model.sr}
    if device == "cuda":
        print(f"Peak CUDA memory allocated: {torch.cuda.max_memory_allocated() / 1024**2:.0f} MiB", file=sys.stderr, flush=True)
print(json.dumps(result), flush=True)
