// Real-time voice client for the Gemini Live bridge (backend /ws/voice).
//
// Captures mic audio, downsamples to PCM16 @ 16 kHz in an AudioWorklet, and
// streams it over a WebSocket. Plays back the PCM16 @ 24 kHz audio the server
// streams down, and surfaces transcripts/status via callbacks. The API key and
// all tool execution stay server-side — this only moves audio + transcripts.

import { store } from "./api";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export type VoiceRole = "user" | "assistant";

export interface VoiceCallbacks {
  onStatus?: (status: "connecting" | "listening" | "closed") => void;
  onTranscript?: (role: VoiceRole, textFragment: string) => void;
  onTurnComplete?: () => void;
  onInterrupted?: () => void;
  onError?: (message: string) => void;
}

// AudioWorklet: decimate the mic stream to 16 kHz and emit Int16 PCM frames.
const WORKLET_SRC = `
class PCMWorklet extends AudioWorkletProcessor {
  constructor() { super(); this._ratio = sampleRate / 16000; this._acc = 0; this._out = []; }
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const ch = input[0];
      for (let i = 0; i < ch.length; i++) {
        this._acc += 1;
        if (this._acc >= this._ratio) { this._acc -= this._ratio; this._out.push(ch[i]); }
      }
      if (this._out.length >= 640) {
        const n = this._out.length, b = new Int16Array(n);
        for (let i = 0; i < n; i++) { let s = this._out[i]; s = s < -1 ? -1 : s > 1 ? 1 : s; b[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
        this.port.postMessage(b.buffer, [b.buffer]);
        this._out = [];
      }
    }
    return true;
  }
}
registerProcessor('pcm-worklet', PCMWorklet);
`;

export class VoiceSession {
  private ws?: WebSocket;
  private micCtx?: AudioContext;
  private outCtx?: AudioContext;
  private stream?: MediaStream;
  private node?: AudioWorkletNode;
  private srcNode?: MediaStreamAudioSourceNode;
  private nextTime = 0;
  private playing: AudioBufferSourceNode[] = [];
  private stopped = false;

  constructor(private cb: VoiceCallbacks) {}

  async start(): Promise<void> {
    this.cb.onStatus?.("connecting");

    // 1) Microphone first — if this is denied there's no point opening the socket.
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      this.cb.onError?.("Microphone access was blocked. Allow it and try again.");
      return;
    }

    // 2) WebSocket to the backend Live bridge.
    const url = API_BASE.replace(/^http/, "ws") + "/ws/voice";
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ token: store.getToken(), org_id: store.getOrg() }));
    ws.onmessage = (e) => this.onMessage(e);
    ws.onerror = () => this.cb.onError?.("Voice connection error.");
    ws.onclose = () => {
      if (!this.stopped) this.cb.onStatus?.("closed");
    };

    // 3) Capture graph: mic → worklet → (muted) destination → WS.
    this.micCtx = new AudioContext();
    await this.micCtx.resume(); // a fresh context can start suspended
    const blobUrl = URL.createObjectURL(new Blob([WORKLET_SRC], { type: "application/javascript" }));
    await this.micCtx.audioWorklet.addModule(blobUrl);
    URL.revokeObjectURL(blobUrl);
    this.srcNode = this.micCtx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.micCtx, "pcm-worklet");
    this.node.port.onmessage = (e) => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(e.data as ArrayBuffer);
    };
    this.srcNode.connect(this.node);
    // The worklet MUST reach a destination or Chrome won't run its process()
    // (so no audio would be captured). It emits no samples, so this is silent —
    // the user doesn't hear themselves.
    this.node.connect(this.micCtx.destination);

    // 4) Playback context at the model's 24 kHz output rate.
    this.outCtx = new AudioContext({ sampleRate: 24000 });
    await this.outCtx.resume();
    this.nextTime = 0;
  }

  private onMessage(e: MessageEvent): void {
    if (typeof e.data === "string") {
      let msg: { type: string; role?: VoiceRole; text?: string; message?: string };
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case "ready":
          this.cb.onStatus?.("listening");
          break;
        case "transcript":
          if (msg.role && msg.text) this.cb.onTranscript?.(msg.role, msg.text);
          break;
        case "interrupted":
          this.clearPlayback();
          this.cb.onInterrupted?.();
          break;
        case "turn_complete":
          this.cb.onTurnComplete?.();
          break;
        case "error":
          this.cb.onError?.(msg.message || "Voice error.");
          break;
      }
    } else {
      this.playPcm(e.data as ArrayBuffer);
    }
  }

  private playPcm(buf: ArrayBuffer): void {
    if (!this.outCtx) return;
    if (this.outCtx.state === "suspended") this.outCtx.resume();
    const int16 = new Int16Array(buf);
    const f32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 0x8000;
    const audioBuf = this.outCtx.createBuffer(1, f32.length, 24000);
    audioBuf.copyToChannel(f32, 0);
    const node = this.outCtx.createBufferSource();
    node.buffer = audioBuf;
    node.connect(this.outCtx.destination);
    const start = Math.max(this.outCtx.currentTime, this.nextTime);
    node.start(start);
    this.nextTime = start + audioBuf.duration;
    this.playing.push(node);
    node.onended = () => {
      this.playing = this.playing.filter((n) => n !== node);
    };
  }

  // Stop any queued playback immediately (on barge-in / interruption).
  private clearPlayback(): void {
    for (const n of this.playing) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    }
    this.playing = [];
    this.nextTime = this.outCtx?.currentTime || 0;
  }

  stop(): void {
    this.stopped = true;
    this.clearPlayback();
    try {
      this.node?.disconnect();
    } catch {
      /* noop */
    }
    try {
      this.srcNode?.disconnect();
    } catch {
      /* noop */
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.micCtx?.close().catch(() => {});
    this.outCtx?.close().catch(() => {});
    try {
      this.ws?.close();
    } catch {
      /* noop */
    }
  }
}
