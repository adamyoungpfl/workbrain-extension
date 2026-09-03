#!/usr/bin/env python3
"""The step stack's check-off chime (V3.0 pass 3i; Adam: "a subtle,
pleasing sound effect when the box is clicked the first time").

A soft marimba-ish tick: a fundamental with its perfect fifth, fast
attack, exponential decay, 220ms, quiet by construction. Synthesized -
nothing spoken, nothing fetched - and shipped like every other cue:
public/cues/tick.m4a via afconvert.

Run: python3 scripts/tick-render.py
"""
import math
import struct
import subprocess
import wave
from pathlib import Path

RATE = 22050
DUR = 0.22
FUND = 830.0

samples = []
n = int(RATE * DUR)
for i in range(n):
    t = i / RATE
    env = math.exp(-t * 22) * min(1.0, i / (RATE * 0.004))
    s = 0.22 * env * (math.sin(2 * math.pi * FUND * t) + 0.45 * math.sin(2 * math.pi * FUND * 1.5 * t))
    samples.append(s)

out = Path("public/cues")
out.mkdir(parents=True, exist_ok=True)
wav_path = out / "tick.wav"
with wave.open(str(wav_path), "wb") as f:
    f.setnchannels(1)
    f.setsampwidth(2)
    f.setframerate(RATE)
    f.writeframes(b"".join(struct.pack("<h", round(s * 32767)) for s in samples))

subprocess.run(
    ["afconvert", str(wav_path), str(out / "tick.m4a"), "-f", "m4af", "-d", "aac", "-b", "32000", "-c", "1"],
    check=True,
)
wav_path.unlink()
print("cues/tick.m4a")
