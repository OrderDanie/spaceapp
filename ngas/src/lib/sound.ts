/*
 * Epoch sound design — synthesized live with Web Audio, no audio files.
 *
 * Written to Apple's WWDC17 "Designing Sound" guidance:
 *   · every touch and every move has a voice, but only a whisper of one
 *   · far quieter than a notification — it sits under the visuals
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
/** Hover, scroll and drag sounds — the ones tied to movement, not to a decision. */
let moveEnabled = true;
export function setMoveSounds(v: boolean) {
  moveEnabled = v;
}
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
      master.gain.value = 0.26; // UI sounds sit far below notification level
      // Softening chain: a low-pass rounds off anything sharp, and a limiter
      // guarantees overlapping sounds can never add up to something loud.
      const soften = ctx.createBiquadFilter();
      soften.type = "lowpass";
      soften.frequency.value = 3100;
      soften.Q.value = 0.4;
      const limit = ctx.createDynamicsCompressor();
      limit.threshold.value = -30;
      limit.knee.value = 12;
      limit.ratio.value = 8;
      limit.attack.value = 0.002;
      limit.release.value = 0.12;
      master.connect(soften).connect(limit).connect(ctx.destination);
      // A breath of room: a very short, quiet tail takes the dry edge off every
      // sound, so even a click lands like felt, not like plastic.
      const room = ctx.createConvolver();
      const tail = Math.floor(ctx.sampleRate * 0.26);
      const ir = ctx.createBuffer(2, tail, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = ir.getChannelData(ch);
        for (let i = 0; i < tail; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / tail, 3.2);
      }
      room.buffer = ir;
      const wet = ctx.createGain();
      wet.gain.value = 0.15;
      soften.connect(room).connect(wet).connect(limit);
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

/** When any sound last played — lets the global handlers stay out of each other's way. */
let lastAny = 0;
export const msSinceLastSound = () => performance.now() - lastAny;
/** The same, ignoring the incidental ones (touch-down, hover, drag, scroll). */
let lastVoiced = 0;
export const msSinceLastVoiced = () => performance.now() - lastVoiced;
const INCIDENTAL = new Set(["touch", "hover", "glide", "scroll"]);

function gate(name: string, minInterval = 0): AudioContext | null {
  if (!enabled || document.hidden) return null;
  const now = performance.now();
  if (minInterval && now - (lastAt.get(name) ?? 0) < minInterval) return null;
  lastAt.set(name, now);
  lastAny = now;
  if (!INCIDENTAL.has(name)) lastVoiced = now;
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
  gain.gain.exponentialRampToValueAtTime(g, t0 + 0.009); // soft attack — no click
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
  gain.gain.exponentialRampToValueAtTime(g, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  src.connect(filter).connect(gain).connect(master);
  src.start(t0);
  src.stop(t0 + d + 0.05);
}

export const sfx = {
  /** The quiet "tock" of a tap landing — pairs with the press-scale animation. */
  tap() {
    if (!gate("tap", 45)) return;
    noise({ d: 0.05, g: 0.06, type: "bandpass", f: 1500, q: 1 });
    tone({ f: 560, f2: 400, d: 0.06, g: 0.045 });
  },
  /** Letting go of a glass control: a small, round drop of water. */
  droplet() {
    if (!gate("droplet", 45)) return;
    tone({ f: 330, f2: 590, d: 0.06, g: 0.04, curve: 2.2 });
    tone({ f: 880, d: 0.03, g: 0.008, at: 0.035, curve: 2 });
  },
  /** A finger (or cursor) landing — lower and rounder than the tap that follows. `level` 0–1. */
  touch(level = 1) {
    if (!gate("touch", 40)) return;
    tone({ f: 250, f2: 170, d: 0.05, g: 0.05 * level });
  },
  /** The pointer gliding onto a control. Barely there. */
  hover() {
    if (!moveEnabled || !gate("hover", 80)) return;
    tone({ f: 880, d: 0.02, g: 0.009, curve: 2 });
  },
  /** One typed character. */
  key() {
    if (!gate("key", 28)) return;
    noise({ d: 0.02, g: 0.026, type: "bandpass", f: 1100 + Math.random() * 400, q: 1.1 });
  },
  /** Content rolling past while scrolling — one faint detent per stretch. */
  scroll() {
    if (!moveEnabled || !gate("scroll", 90)) return;
    noise({ d: 0.03, g: 0.018, type: "bandpass", f: 850, q: 1 });
  },
  /** Something being dragged; brighter the faster it moves (`speed` 0–1). */
  glide(speed = 0.3) {
    if (!moveEnabled || !gate("glide", 85)) return;
    const s = Math.min(1, Math.max(0, speed));
    noise({ d: 0.06, g: 0.016 + s * 0.012, type: "bandpass", f: 420 + s * 650, q: 0.9 });
  },
  /** Taking hold of the globe, and letting it go. */
  grab() {
    if (!gate("grab", 120)) return;
    tone({ f: 210, f2: 150, d: 0.06, g: 0.05 });
  },
  release() {
    if (!gate("release", 120)) return;
    tone({ f: 160, f2: 220, d: 0.06, g: 0.035 });
  },
  /** Zoom detent — pitch follows the zoom level, so in and out sound different. */
  zoom(level = 2) {
    if (!gate("zoom", 75)) return;
    tone({ f: 300 + Math.min(10, Math.max(0, level)) * 42, d: 0.035, g: 0.028, curve: 2.2 });
  },
  /** The camera travelling to a place… */
  fly() {
    if (!gate("fly", 500)) return;
    noise({ d: 0.8, g: 0.03, type: "bandpass", f: 300, f2: 1300, q: 0.8 });
  },
  /** …and settling there. */
  arrive() {
    if (!gate("arrive", 500)) return;
    tone({ f: 392, d: 0.12, g: 0.03, curve: 3 }); // G4
    tone({ f: 587.33, d: 0.14, g: 0.022, at: 0.05, curve: 3 }); // D5
  },
  /** One frame of a timelapse advancing. */
  frame() {
    if (!gate("frame", 110)) return;
    tone({ f: 740, d: 0.022, g: 0.014, curve: 2 });
  },
  /** Slightly deeper, for committing to something (primary buttons, play). */
  press() {
    if (!gate("press", 60)) return;
    tone({ f: 190, f2: 95, d: 0.09, g: 0.065 });
    noise({ d: 0.04, g: 0.04, type: "bandpass", f: 1200, q: 1 });
  },
  /** Moving between sections — air, not a beep. Rises going forward, falls going back. */
  navigate(direction = 1) {
    if (!gate("navigate", 180)) return;
    const up = direction >= 0;
    noise({ d: 0.22, g: 0.04, type: "bandpass", f: up ? 450 : 1500, f2: up ? 1500 : 450, q: 1.2 });
    tone({ f: up ? 660 : 880, f2: up ? 880 : 660, d: 0.07, g: 0.022, at: 0.05 });
  },
  /** A card or section easing into view. */
  reveal() {
    if (!moveEnabled || !gate("reveal", 260)) return;
    noise({ d: 0.16, g: 0.012, type: "bandpass", f: 500, f2: 1100, q: 0.8 });
  },
  /** Something swept away with a flick. */
  swipe() {
    if (!gate("swipe", 200)) return;
    noise({ d: 0.2, g: 0.04, type: "bandpass", f: 1400, f2: 420, q: 1 });
  },
  /** A panel sliding in or out from the side (`out` = leaving). */
  slide(out = false) {
    if (!gate("slide", 200)) return;
    noise({ d: 0.22, g: 0.034, type: "bandpass", f: out ? 1300 : 520, f2: out ? 520 : 1300, q: 0.9 });
  },
  switchOn() {
    if (!gate("switch", 70)) return;
    tone({ f: 660, d: 0.05, g: 0.05, curve: 2.4 });
    tone({ f: 990, d: 0.06, g: 0.05, at: 0.045, curve: 2.6 });
  },
  switchOff() {
    if (!gate("switch", 70)) return;
    tone({ f: 880, d: 0.05, g: 0.045, curve: 2.4 });
    tone({ f: 587, d: 0.06, g: 0.045, at: 0.045, curve: 2.6 });
  },
  /** Selection moving — segmented controls, picker rows. */
  tick() {
    if (!gate("tick", 55)) return;
    noise({ d: 0.03, g: 0.05, type: "bandpass", f: 1600, q: 1.1 });
  },
  /** Detents while scrubbing (divider, time dial). Very quiet, heavily throttled. */
  scrub() {
    if (!gate("scrub", 65)) return;
    noise({ d: 0.024, g: 0.036, type: "bandpass", f: 1700, q: 1.1 });
  },
  /** A small confirmation pop — something was chosen or saved. */
  select() {
    if (!gate("select", 80)) return;
    tone({ f: 523, f2: 784, d: 0.09, g: 0.05, curve: 2.6 });
  },
  /** Task finished well. Two notes, resolved upward. */
  success() {
    if (!gate("success", 250)) return;
    tone({ f: 659.25, d: 0.16, g: 0.055 }); // E5
    tone({ f: 987.77, d: 0.2, g: 0.055, at: 0.09 }); // B5
    tone({ f: 1318.5, d: 0.1, g: 0.016, at: 0.09 });
  },
  /** Needs attention — low and round, never a buzzer. */
  alert() {
    if (!gate("alert", 400)) return;
    tone({ f: 392, d: 0.12, g: 0.055, curve: 2.4 }); // G4
    tone({ f: 329.63, d: 0.16, g: 0.05, at: 0.1, curve: 2.4 }); // E4
  },
  /** A message leaving — short, rising, airy. */
  send() {
    if (!gate("send", 150)) return;
    tone({ f: 520, f2: 1040, d: 0.07, g: 0.05, curve: 2.2 });
    noise({ d: 0.12, g: 0.03, type: "bandpass", f: 900, f2: 2800, q: 1.2 });
  },
  /** An answer arriving — two soft, close notes. */
  receive() {
    if (!gate("receive", 200)) return;
    tone({ f: 783.99, d: 0.1, g: 0.05, curve: 2.8 }); // G5
    tone({ f: 1046.5, d: 0.14, g: 0.045, at: 0.08, curve: 3 }); // C6
  },
  /** Dropping a pin on the globe. */
  drop() {
    if (!gate("drop", 120)) return;
    tone({ f: 420, f2: 180, d: 0.09, g: 0.065 });
    noise({ d: 0.05, g: 0.05, type: "bandpass", f: 1300, q: 1 });
  },
  /** A surface opening — Spotlight, sheets. */
  whoosh() {
    if (!gate("whoosh", 200)) return;
    noise({ d: 0.26, g: 0.04, type: "bandpass", f: 600, f2: 1800, q: 1 });
  },
  /** A surface settling closed. */
  settle() {
    if (!gate("settle", 200)) return;
    noise({ d: 0.18, g: 0.034, type: "bandpass", f: 1600, f2: 520, q: 1 });
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
    tone({ f: 783.99, d: 0.14, g: 0.04, curve: 3.2 }); // G5
    tone({ f: 1174.66, d: 0.18, g: 0.034, at: 0.07, curve: 3.2 }); // D6
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
