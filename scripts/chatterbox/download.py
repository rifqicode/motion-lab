"""Explicit online setup. Generation never downloads a model."""
import json
import os
from pathlib import Path
import shutil
import sys

from huggingface_hub import hf_hub_download
import torch

cache = Path(sys.argv[1]).resolve()
model_dir = cache / "model"
model_dir.mkdir(parents=True, exist_ok=True)
base_revision = "5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18"
indonesian_revision = "15027c10d34ac7bbb2796ec5cd727a17a3bf862b"
for filename in ["ve.safetensors", "s3gen.safetensors", "tokenizer.json", "conds.pt"]:
    print(f"Staging {filename}", flush=True)
    downloaded = hf_hub_download("ResembleAI/chatterbox", filename, revision=base_revision)
    shutil.copyfile(downloaded, model_dir / filename)
print("Staging Indonesian t3_cfg.safetensors", flush=True)
downloaded = hf_hub_download("grandhigh/Chatterbox-TTS-Indonesian", "t3_cfg.safetensors", revision=indonesian_revision)
shutil.copyfile(downloaded, model_dir / "t3_cfg.safetensors")
device = "cuda" if torch.cuda.is_available() else "cpu"
ready = {"version": 1, "device": device, "model": "grandhigh/Chatterbox-TTS-Indonesian", "revision": indonesian_revision, "baseRevision": base_revision}
(cache / "downloaded.json").write_text(json.dumps(ready), encoding="utf-8")
print(json.dumps(ready))
