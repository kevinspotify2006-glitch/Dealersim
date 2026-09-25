/**
 * Synthesised sound effects and a quiet generative music bed.
 *
 * No audio files: everything is made with the Web Audio API at runtime, so the
 * APK stays small and works offline. Audio is optional — if the browser blocks
 * it or has no Web Audio, every call is a silent no-op.
 */

type Sfx = 'click' | 'buy' | 'sale' | 'success' | 'error' | 'notify' | 'levelup' | 'cash' | 'customer';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let musicOn = false;
let musicTimer: number | null = null;

function audio(): AudioContext | null {
  if (!enabled && !musicOn) return null;
  try {
    if (!ctx) {
      const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
      if (!Ctor) return null;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.5, slide?: number): void {
  const a = audio();
  if (!a || !master) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function setSound(on: boolean): void {
  enabled = on;
}

export function play(sfx: Sfx): void {
  if (!enabled) return;
  switch (sfx) {
    case 'click': tone(880, 0, 0.05, 'triangle', 0.18); break;
    case 'buy': tone(330, 0, 0.12, 'triangle', 0.35); tone(495, 0.08, 0.16, 'triangle', 0.35); break;
    case 'cash': tone(1318, 0, 0.08, 'square', 0.12); tone(1760, 0.07, 0.14, 'square', 0.12); break;
    case 'sale':
      tone(523, 0, 0.12, 'triangle', 0.4); tone(659, 0.1, 0.12, 'triangle', 0.4); tone(784, 0.2, 0.25, 'triangle', 0.4);
      tone(1568, 0.32, 0.12, 'square', 0.1);
      break;
    case 'success': tone(660, 0, 0.1, 'sine', 0.4); tone(990, 0.09, 0.18, 'sine', 0.35); break;
    case 'error': tone(220, 0, 0.16, 'sawtooth', 0.2, 150); break;
    case 'notify': tone(740, 0, 0.09, 'sine', 0.3); tone(740, 0.14, 0.09, 'sine', 0.25); break;
    case 'customer': tone(988, 0, 0.08, 'sine', 0.3); tone(1319, 0.1, 0.16, 'sine', 0.3); break;
    case 'levelup':
      [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, i * 0.09, 0.3, 'triangle', 0.35));
      break;
  }
}

/** Soft, slow chord pad. Starts only after a user gesture (browser rule). */
export function setMusic(on: boolean): void {
  musicOn = on;
  if (musicTimer !== null) {
    window.clearInterval(musicTimer);
    musicTimer = null;
  }
  if (!on) return;
  const chords = [[220, 277.2, 329.6], [196, 246.9, 293.7], [174.6, 220, 261.6], [196, 246.9, 329.6]];
  let i = 0;
  const playChord = (): void => {
    const a = audio();
    if (!a || !master) return;
    const chord = chords[i % chords.length];
    i += 1;
    for (const f of chord) {
      const t0 = a.currentTime;
      const osc = a.createOscillator();
      const g = a.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.05, t0 + 1.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 5.8);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + 6);
    }
  };
  playChord();
  musicTimer = window.setInterval(playChord, 6000);
}
