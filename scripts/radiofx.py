#!/usr/bin/env python3
"""The old-timey radio treatment (V3.0 pass 3g; Adam: "that authentic old
timey radio sound and voice and maybe the little beep sound that is often
in the recorded clips").

Pure stdlib over 16-bit mono WAV: a bandpass built from two biquads
(high-pass ~280Hz, low-pass ~3.1kHz - the voice band a transmission
keeps), a touch of soft drive, and optionally the QUINDAR TONE - the
2525Hz quarter-second beep that keyed NASA's ground transmissions -
appended as the sign-off. ffmpeg-free because the machine is (afconvert
handles the container work either side of this).

Usage: radiofx.py in.wav out.wav [--beep]
"""
import math
import struct
import sys
import wave


def biquad(kind: str, freq: float, rate: float, q: float = 0.707):
    w0 = 2 * math.pi * freq / rate
    alpha = math.sin(w0) / (2 * q)
    cw = math.cos(w0)
    if kind == "hp":
        b0, b1, b2 = (1 + cw) / 2, -(1 + cw), (1 + cw) / 2
    else:  # lp
        b0, b1, b2 = (1 - cw) / 2, 1 - cw, (1 - cw) / 2
    a0, a1, a2 = 1 + alpha, -2 * cw, 1 - alpha
    return (b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0)


def run(samples, coef):
    b0, b1, b2, a1, a2 = coef
    x1 = x2 = y1 = y2 = 0.0
    out = []
    for x in samples:
        y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1 = x1, x
        y2, y1 = y1, y
        out.append(y)
    return out


def main() -> None:
    src, dst = sys.argv[1], sys.argv[2]
    beep = "--beep" in sys.argv
    with wave.open(src, "rb") as f:
        rate = f.getframerate()
        assert f.getnchannels() == 1 and f.getsampwidth() == 2, "expect 16-bit mono"
        raw = f.readframes(f.getnframes())
    samples = [s / 32768.0 for (s,) in struct.iter_unpack("<h", raw)]

    samples = run(samples, biquad("hp", 280, rate))
    samples = run(samples, biquad("lp", 3100, rate))
    # Soft drive: the gentle compression-and-grit a small transmitter adds.
    samples = [math.tanh(2.2 * s) / math.tanh(2.2) for s in samples]

    if beep:
        samples += [0.0] * int(rate * 0.06)
        n = int(rate * 0.25)
        fade = int(rate * 0.012)
        for i in range(n):
            amp = 0.32
            if i < fade:
                amp *= i / fade
            elif i > n - fade:
                amp *= (n - i) / fade
            samples.append(amp * math.sin(2 * math.pi * 2525 * i / rate))

    peak = max(0.001, max(abs(s) for s in samples))
    gain = 0.92 / peak
    frames = b"".join(
        struct.pack("<h", max(-32768, min(32767, round(s * gain * 32767)))) for s in samples
    )
    with wave.open(dst, "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(rate)
        f.writeframes(frames)


if __name__ == "__main__":
    main()
