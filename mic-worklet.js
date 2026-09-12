// AudioWorkletProcessor for slice 5b narration capture. Registered by
// src/app/mic.ts via audioContext.audioWorklet.addModule("/mic-worklet.js").
// Runs on the audio rendering thread: no window, no imports, no bundler —
// public/ ships it verbatim and the precache script sweeps it up like any
// other file in dist/ (see scripts/gen-precache.mjs).
//
// Batches into ~100ms chunks before posting rather than one postMessage per
// 128-sample render quantum (every ~2.7ms at 48kHz) — needless main-thread
// traffic over a multi-minute take. CHUNK_FRAMES matches AUDIO_CHUNK_FRAMES
// in src/core/export/audio.ts, though nothing requires them to match.
const CHUNK_FRAMES = 4800;

class MicCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Float32Array(CHUNK_FRAMES);
    this._filled = 0;
    // currentFrame is the exact, drift-free sample count since this
    // AudioContext started — used instead of accumulating durations so a
    // long take can't compound floating-point rounding into audible drift.
    this._chunkStartFrame = currentFrame;
    // The main thread asks for a final partial chunk before it disconnects
    // this node — otherwise up to ~100ms of tail audio is lost right where a
    // coach is often still finishing a sentence.
    this.port.onmessage = (e) => {
      if (e.data === "flush") {
        if (this._filled > 0) this._flush();
        this.port.postMessage({ done: true });
      }
    };
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel || channel.length === 0) return true; // mic not delivering yet — stay alive

    if (this._filled === 0) this._chunkStartFrame = currentFrame;

    let i = 0;
    while (i < channel.length) {
      const room = CHUNK_FRAMES - this._filled;
      const take = Math.min(room, channel.length - i);
      this._buf.set(channel.subarray(i, i + take), this._filled);
      this._filled += take;
      i += take;
      if (this._filled === CHUNK_FRAMES) this._flush();
    }
    return true;
  }

  _flush() {
    const frame = this._buf.slice(0, this._filled);
    this.port.postMessage(
      { pcm: frame, contextTime: this._chunkStartFrame / sampleRate },
      [frame.buffer],
    );
    this._buf = new Float32Array(CHUNK_FRAMES);
    this._filled = 0;
  }
}

registerProcessor("mic-capture-processor", MicCaptureProcessor);
