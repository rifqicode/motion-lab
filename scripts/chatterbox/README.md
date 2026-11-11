# Local Indonesian voice-over

Run `node scripts/chatterbox/setup.mjs` from the repository root. Setup requires
`uv`, internet access, disk space for PyTorch/CUDA and model weights, and Python
3.11 (provisioned by uv when missing). Files stay in ignored `.cache/` directories;
the system Python and Node dependencies are unchanged.

The setup stages the base Chatterbox voice encoder, S3Gen, tokenizer and built-in
voice conditionals from `ResembleAI/chatterbox`, then replaces T3 with
`grandhigh/Chatterbox-TTS-Indonesian`. Both model revisions are pinned in
`download.py`. Chatterbox 0.1.6 is pinned for compatibility with this checkpoint.

Readiness is recorded only after a real local Indonesian synthesis succeeds. The
smoke WAV remains at `.cache/chatterbox/setup-smoke.wav`. Runtime status checks
read this receipt and required local files without loading the model.
After dependencies and model files are staged, `node scripts/chatterbox/setup.mjs
--verify-only` reruns the offline smoke without downloading/copying weights again.
Setuptools 80.9.0 is pinned because the required Perth watermark implementation
still imports `pkg_resources`; setup checks this before loading the full model.

Generation starts one Python process per job, releasing GPU memory when done.
Requests across projects are serialized; cancellation kills and reaps the process.
Inference uses `from_local`, Hugging Face offline flags, and a socket guard that
rejects internet connections. Narration is sent through stdin, never shell command
arguments. Long scripts are split into bounded phrases rather than truncated.
Output is mono 24 kHz PCM WAV, independently checked with ffprobe by the server.

Current workflow uses the checkpoint's default voice. User reference uploads and
voice selection are separate future work. A CUDA device is selected when PyTorch
can use it; otherwise generation uses CPU and can be substantially slower. Voice
quality and exact render speed require testing on the actual machine and script.

Verified on RTX 3050 6 GB with CUDA: a short offline smoke produced 4.07 seconds
of audio and peaked at about 3.2 GiB allocated GPU memory. A real Studio request
produced 4.91 seconds of narration, previewed and exported with AAC audio. Loading
the model was slow on the tested WSL instance with 7.7 GiB RAM and full swap: that
request took about eight minutes including preview validation. This is not a
real-time workflow on that host; allow for model loading before synthesis.

References and licensing:

- https://github.com/resemble-ai/chatterbox (upstream model/runtime)
- https://huggingface.co/grandhigh/Chatterbox-TTS-Indonesian (Indonesian checkpoint,
  model card declares Apache 2.0; preserve applicable notices)
