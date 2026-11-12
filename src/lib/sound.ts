/*
 * Epoch sound design — synthesized live with Web Audio, no audio files.
 *
 * Written to Apple's WWDC17 "Designing Sound" guidance:
 *   · used sparingly — only state changes and confirmations speak
 *   · much quieter than a notification — a whisper under the visuals
 *   · unobtrusive and repeatable — nothing you'd tire of hearing daily
 *   · directional — different contours mean different things
 *   · never the only feedback — every sound mirrors a visual one
 * Native Apple system sounds are licensed and can't ship in a web app, so
 * these are original tones composed in the same register.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let enabled = true;
let introQueued = false;
const lastAt = new Map<string, number>();

/** Syncs with the persisted setting. On unless explicitly turned off. */
export function setSoundsEnabled(v: boolean) {
  enabled = v;
}

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5; // UI sounds sit far below notification level
      master.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 0.6);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      return null;
    }
  }
  return ctx;
}

/** Called on the user's first gesture — browsers keep audio locked until then. */
export function unlockAudio() {
  const c = ensure();
  if (!c) return;
  if (c.state === "suspended") void c.resume().catch(() => {});
  if (introQueued) {
    introQueued = false;
    window.setTimeout(() => sfx.intro(), 120);
  }
}

function gate(name: string, minInterval = 0): AudioContext | null {
  if (!enabled || document.hidden) return null;
  const now = performance.now();
  if (minInterval && now - (lastAt.get(name) ?? 0) < minInterval) return null;
  lastAt.set(name, now);
  const c = ensure();
  if (!c || c.state !== "running" || !master) return null;
  return c;
}

interface ToneOpts {
  f: number;
  f2?: number;
  t?: OscillatorType;
  d: number; // seconds
  g: number; // peak gain
  at?: number; // delay seconds
  curve?: number; // envelope shape
}

/** One pure tone with a fast attack and an exponential tail — the basic phoneme. */
function tone({ f, f2, t = "sine", d, g, at = 0, curve = 3 }: ToneOpts) {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = t;
  osc.frequency.setValueAtTime(f, t0);
  if (f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t0 + d);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(g, t0 + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + d * curve);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + d * curve + 0.05);
}

interface NoiseOpts {
  d: number;
  g: number;
  type: BiquadFilterType;
  f: number;
  f2?: number;
  q?: number;
  at?: number;
}

/** Filtered noise — clicks, ticks and air (whooshes). */
function noise({ d, g, type, f, f2, q = 1, at = 0 }: NoiseOpts) {
  if (!ctx || !master || !noiseBuf) return;
  const t0 = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(f, t0);
  if (f2) filter.frequency.exponentialRampToValueAtTime(f2, t0 + d);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(g, t0 + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  src.connect(filter).connect(gain).connect(master);
  src.start(t0);
  src.stop(t0 + d + 0.05);
}

export const sfx = {
  /** The quiet "tock" of a tap landing — pairs with the press-scale animation. */
  tap() {
    if (!gate("tap", 45)) return;
    noise({ d: 0.05, g: 0.16, type: "bandpass", f: 2400, q: 1.1 });
    tone({ f: 620, f2: 420, t: "triangle", d: 0.06, g: 0.06 });
  },
  /** Slightly deeper, for committing to something (primary buttons, play). */
  press() {
    if (!gate("press", 60)) return;
    tone({ f: 190, f2: 95, d: 0.09, g: 0.14 });
    noise({ d: 0.04, g: 0.1, type: "bandpass", f: 1600, q: 1 });
  },
  /** Moving between places in the app — air, not a beep. */
  navigate() {
    if (!gate("navigate", 180)) return;
    noise({ d: 0.22, g: 0.05, type: "bandpass", f: 500, f2: 2100, q: 1.4 });
    tone({ f: 740, f2: 990, d: 0.07, g: 0.028, at: 0.05 });
  },
  switchOn() {
    if (!gate("switch", 70)) return;
    tone({ f: 660, d: 0.05, g: 0.07, curve: 2.4 });
    tone({ f: 990, d: 0.06, g: 0.075, at: 0.045, curve: 2.6 });
  },
  switchOff() {
    if (!gate("switch", 70)) return;
    tone({ f: 880, d: 0.05, g: 0.06, curve: 2.4 });
    tone({ f: 587, d: 0.06, g: 0.06, at: 0.045, curve: 2.6 });
  },
  /** Selection moving — segmented controls, picker rows. */
  tick() {
    if (!gate("tick", 55)) return;
    noise({ d: 0.03, g: 0.1, type: "bandpass", f: 3000, q: 1.2 });
  },
  /** Detents while scrubbing (divider, time dial). Very quiet, heavily throttled. */
  scrub() {
    if (!gate("scrub", 65)) return;
    noise({ d: 0.022, g: 0.05, type: "bandpass", f: 2600, q: 1.3 });
  },
  /** A small confirmation pop — something was chosen or saved. */
  select() {
    if (!gate("select", 80)) return;
    tone({ f: 523, f2: 784, t: "triangle", d: 0.09, g: 0.07, curve: 2.6 });
  },
  /** Task finished well. Two notes, resolved upward. */
  success() {
    if (!gate("success", 250)) return;
    tone({ f: 659.25, d: 0.16, g: 0.09 }); // E5
    tone({ f: 987.77, d: 0.2, g: 0.09, at: 0.09 }); // B5
    tone({ f: 1318.5, d: 0.1, g: 0.03, at: 0.09 });
  },
  /** Needs attention — low and round, never a buzzer. */
  alert() {
    if (!gate("alert", 400)) return;
    tone({ f: 392, d: 0.12, g: 0.075, curve: 2.4 }); // G4
    tone({ f: 329.63, d: 0.16, g: 0.07, at: 0.1, curve: 2.4 }); // E4
  },
  /** A surface opening — Spotlight, sheets. */
  whoosh() {
    if (!gate("whoosh", 200)) return;
    noise({ d: 0.26, g: 0.055, type: "bandpass", f: 700, f2: 2600, q: 1.2 });
  },
  /** A surface settling closed. */
  settle() {
    if (!gate("settle", 200)) return;
    noise({ d: 0.18, g: 0.045, type: "bandpass", f: 2200, f2: 600, q: 1.2 });
  },
  play() {
    if (!gate("playstate", 90)) return;
    tone({ f: 587, d: 0.05, g: 0.06, curve: 2.4 });
    tone({ f: 880, d: 0.07, g: 0.065, at: 0.05, curve: 2.6 });
  },
  pause() {
    if (!gate("playstate", 90)) return;
    tone({ f: 880, d: 0.05, g: 0.055, curve: 2.4 });
    tone({ f: 587, d: 0.07, g: 0.055, at: 0.05, curve: 2.6 });
  },
  /** The Dynamic Island arriving with something good. */
  chime() {
    if (!gate("chime", 300)) return;
    tone({ f: 1046.5, d: 0.14, g: 0.05, curve: 3.2 }); // C6
    tone({ f: 1568, d: 0.18, g: 0.045, at: 0.07, curve: 3.2 }); // G6
  },
  /** Launch motif: four notes rising a major scale, the last one sparkling. */
  intro() {
    const c = ensure();
    if (!c || c.state !== "running") {
      introQueued = true; // plays the moment audio unlocks
      return;
    }
    if (!gate("intro", 1000)) return;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((f, i) => {
      tone({ f, d: 0.34, g: 0.055, at: i * 0.11, curve: 3.4 });
      tone({ f: f * 2, d: 0.2, g: 0.016, at: i * 0.11, curve: 3 });
    });
    noise({ d: 0.5, g: 0.02, type: "bandpass", f: 900, f2: 3400, q: 1.1, at: 0.05 });
  },
};

/** Explicit user-requested audition (Settings → Preview). Answers even when muted. */
export function previewSounds() {
  const was = enabled;
  enabled = true;
  try {
    sfx.success();
    window.setTimeout(() => sfx.tap(), 420);
  } finally {
    window.setTimeout(() => {
      enabled = was;
    }, 900);
  }
}
