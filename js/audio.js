/* =====================================================================
   GROCERY STORE SIMULATOR — noises
   =====================================================================

   Synthesised, not sampled. Same reason as the textures: nothing to
   load, nothing to license, and everything comes out of one place so it
   all sits together. Six primitives — a noise burst, a tone sweep, a
   click, a thud, a hiss and a crackle — and every sound in the game is
   some arrangement of those.

   Sounds are POSITIONED. A fire two aisles over is quieter than one
   behind you, and that is most of what a Doom soundscape does for you:
   it tells you what is in the room before you can see it.
   Distance attenuation only — no panning — because Doom did not pan
   either and stereo separation on a thing you cannot see turns out to be
   less useful than it sounds.
   ===================================================================== */

/* ALL OF IT IS OFF FOR NOW, at the user's request. One switch: with it
   on, resume() never opens an AudioContext, so play(), the ambience
   and everything that calls them fall through the `!this.ctx` guards
   they already have, and no oscillator is ever made. Every sound in
   the table below is still defined and still asked for by the game;
   flip this and they are all back. */
export const MUTED = true;

const DEFS = {
  /* the store */
  ignite:    { kind: 'hiss',  dur: 0.55, f0: 900,  f1: 200,  gain: 0.30 },
  flame:     { kind: 'hiss',  dur: 0.20, f0: 1400, f1: 500,  gain: 0.16 },
  burn:      { kind: 'hiss',  dur: 0.35, f0: 600,  f1: 160,  gain: 0.22 },
  explode:   { kind: 'boom',  dur: 0.90, f0: 180,  f1: 30,   gain: 0.60 },
  throw:     { kind: 'sweep', dur: 0.18, f0: 500,  f1: 900,  gain: 0.16, wave: 'triangle' },
  glass:     { kind: 'noise', dur: 0.30, f0: 4200, f1: 1600, gain: 0.30 },

  /* weapons */
  swing:     { kind: 'sweep', dur: 0.12, f0: 700,  f1: 260,  gain: 0.14, wave: 'triangle' },
  cut:       { kind: 'noise', dur: 0.10, f0: 2600, f1: 700,  gain: 0.26 },
  /* THE COLD PAIR. `freeze` is a hiss running the WRONG WAY — up rather
     than down, which is the whole difference between a thing catching
     fire and a thing seizing up — and `shatter` is glass with the bottom
     taken off it, short and bright, because that is what a person full
     of ice sounds like when something hits them. */
  freeze:    { kind: 'hiss',  dur: 0.45, f0: 260,  f1: 1500, gain: 0.26 },
  shatter:   { kind: 'noise', dur: 0.22, f0: 5200, f1: 900,  gain: 0.40 },
  /* and the melt, which is `freeze` played backwards in every sense
     that matters here: down rather than up, longer, and quieter,
     because coming out of it is a slower thing than going in */
  thaw:      { kind: 'hiss',  dur: 0.60, f0: 1500, f1: 260,  gain: 0.18 },
  /* SOMETHING HITTING SOMETHING, for the weapon that is not built yet
     — see Game.impact. A thud with a bit of edge left on it: the body
     of it is the low sweep and what makes it read as a blow rather
     than a door closing is that it is over in a fifth of a second. */
  whack:     { kind: 'thud',  dur: 0.20, f0: 300,  f1: 70,   gain: 0.38 },
  /* AND THE FIRST THINGS IN THE GAME THAT SHOOT BACK. A rifle is a
     crack of noise with no pitch to it; the siren is two sweeps that
     alternate, played by the van as it comes; and the troopers have a
     bark, a grunt and a cry, all off the same triangle the shoppers
     use, lower and shorter, because they are men in helmets. */
  shot:      { kind: 'noise', dur: 0.14, f0: 3200, f1: 500,  gain: 0.40 },
  siren:     { kind: 'sweep', dur: 0.55, f0: 620,  f1: 940,  gain: 0.20, wave: 'square' },
  siren2:    { kind: 'sweep', dur: 0.55, f0: 940,  f1: 620,  gain: 0.20, wave: 'square' },
  swatsee:   { kind: 'sweep', dur: 0.16, f0: 420,  f1: 300,  gain: 0.24, wave: 'triangle' },
  swatpain:  { kind: 'sweep', dur: 0.14, f0: 360,  f1: 220,  gain: 0.24, wave: 'triangle' },
  swatdie:   { kind: 'sweep', dur: 0.50, f0: 380,  f1: 90,   gain: 0.30, wave: 'triangle' },
  /* AND THE ARMY BEHIND THEM, which is the same five sounds a few
     semitones down and a little longer. A heavier rifle is a lower
     crack with more of it, the turbine under the APC is a sawtooth that
     rises and falls where the siren is a square wave that wails — the
     difference between a thing with an engine and a thing with a
     warning — and the three voices are the SWAT's with bigger men in
     them. */
  rifle:     { kind: 'noise', dur: 0.17, f0: 2400, f1: 380,  gain: 0.46 },
  hover:     { kind: 'sweep', dur: 0.85, f0: 96,   f1: 142,  gain: 0.18, wave: 'sawtooth' },
  hover2:    { kind: 'sweep', dur: 0.85, f0: 142,  f1: 96,   gain: 0.18, wave: 'sawtooth' },
  armysee:   { kind: 'sweep', dur: 0.19, f0: 300,  f1: 200,  gain: 0.26, wave: 'triangle' },
  armypain:  { kind: 'sweep', dur: 0.16, f0: 260,  f1: 150,  gain: 0.26, wave: 'triangle' },
  armydie:   { kind: 'sweep', dur: 0.58, f0: 270,  f1: 62,   gain: 0.32, wave: 'triangle' },
  /* the bang a vehicle ends on now, which is four of the old one: the
     same boom, longer and lower, with the master gain it needs to be
     the loudest thing in the game */
  bigboom:   { kind: 'boom',  dur: 1.60, f0: 140,  f1: 22,   gain: 0.95 },
  /* THE CEREBRAL BORE: the sight finding a head, the launcher, the
     thing in flight, the drill in a skull, and a miss ringing off a
     wall. All sawtooth, because a drill is a sawtooth. */
  lock:      { kind: 'sweep', dur: 0.07, f0: 1500, f1: 1500, gain: 0.22, wave: 'square' },
  borefire:  { kind: 'sweep', dur: 0.35, f0: 300,  f1: 1400, gain: 0.34, wave: 'sawtooth' },
  borefly:   { kind: 'sweep', dur: 0.20, f0: 1100, f1: 1300, gain: 0.12, wave: 'sawtooth' },
  bore:      { kind: 'sweep', dur: 0.24, f0: 700,  f1: 1900, gain: 0.30, wave: 'sawtooth' },
  clang:     { kind: 'thud',  dur: 0.12, f0: 900,  f1: 300,  gain: 0.30 },
  /* THE MINIGUN: a round is the rifle's crack cut short, and the audio
     layer's own rate limit turns a hundred and forty of them a second
     into the buzz a minigun actually makes; the barrels winding up are
     a sawtooth climbing over a third of a second, and winding down the
     same run the other way, longer. */
  minigun:   { kind: 'noise', dur: 0.06, f0: 2600, f1: 500,  gain: 0.34 },
  spinup:    { kind: 'sweep', dur: 0.34, f0: 120,  f1: 520,  gain: 0.22, wave: 'sawtooth' },
  spindown:  { kind: 'sweep', dur: 0.80, f0: 520,  f1: 90,   gain: 0.18, wave: 'sawtooth' },

  /* the staff */
  gib:       { kind: 'noise', dur: 0.42, f0: 1500, f1: 180,  gain: 0.44 },
  shopper:   { kind: 'sweep', dur: 0.30, f0: 620,  f1: 240,  gain: 0.26, wave: 'triangle' },
  bodyfall:  { kind: 'thud',  dur: 0.28, f0: 130,  f1: 44,   gain: 0.30 },

  /* you */
  hurt:      { kind: 'sweep', dur: 0.24, f0: 420,  f1: 200,  gain: 0.30, wave: 'square' },
  playerDie: { kind: 'sweep', dur: 1.30, f0: 340,  f1: 46,   gain: 0.44, wave: 'sawtooth' },
  pickup:    { kind: 'sweep', dur: 0.14, f0: 700,  f1: 1300, gain: 0.22, wave: 'square' },
  noammo:    { kind: 'click', dur: 0.05, f0: 240,  f1: 160,  gain: 0.18 },

  /* the building */
  dooropen:  { kind: 'sweep', dur: 0.60, f0: 90,   f1: 190,  gain: 0.24, wave: 'sawtooth' },
  doorclose: { kind: 'sweep', dur: 0.55, f0: 190,  f1: 80,   gain: 0.24, wave: 'sawtooth' },
  switch:    { kind: 'click', dur: 0.07, f0: 900,  f1: 400,  gain: 0.24 },
  lampbreak: { kind: 'noise', dur: 0.34, f0: 5200, f1: 900,  gain: 0.34 },
  spark:     { kind: 'click', dur: 0.04, f0: 2600, f1: 1400, gain: 0.10 },
  alarm:     { kind: 'sweep', dur: 0.70, f0: 880,  f1: 660,  gain: 0.22, wave: 'square' },
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.listener = { x: 0, y: 0 };
    this.maxDistance = 1800;
    this._noiseBuf = null;
    this._lastAt = new Map();       // one of each sound per few tics, at most
  }

  /* Browsers will not start an AudioContext until the user has done
     something, so this is called from the first click. */
  resume() {
    if (MUTED) { this.enabled = false; return; }
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this._makeNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) { if (this.master) this.master.gain.value = v; }

  _makeNoise() {
    const n = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    /* pink-ish: white noise run through a one-pole low pass, which is
       much closer to fire and to impacts than white ever is */
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      last = last * 0.86 + w * 0.14;
      d[i] = last * 3.2 + w * 0.3;
    }
    this._noiseBuf = buf;
  }

  play(name, from) {
    if (!name || !this.enabled || !this.ctx) return;
    const def = DEFS[name];
    if (!def) return;

    /* Distance. A sound with no source is the player's own and plays at
       full volume. */
    let gain = def.gain;
    if (from && from !== this.listener) {
      const d = Math.hypot(from.x - this.listener.x, from.y - this.listener.y);
      if (d > this.maxDistance) return;
      gain *= Math.max(0, 1 - d / this.maxDistance) ** 1.7;
      if (gain < 0.004) return;
    }

    /* Twenty of the same groan in one tic is a buzz, not a soundscape. */
    const now = this.ctx.currentTime;
    const last = this._lastAt.get(name) || -1;
    if (now - last < 0.045) return;
    this._lastAt.set(name, now);

    const g = this.ctx.createGain();
    g.connect(this.master);
    const t = now;
    const dur = def.dur;

    if (def.kind === 'noise' || def.kind === 'hiss' || def.kind === 'boom' || def.kind === 'thud') {
      const src = this.ctx.createBufferSource();
      src.buffer = this._noiseBuf;
      src.loop = true;
      src.playbackRate.value = def.kind === 'boom' ? 0.5 : 1;
      const f = this.ctx.createBiquadFilter();
      f.type = (def.kind === 'boom' || def.kind === 'thud') ? 'lowpass' : 'bandpass';
      f.Q.value = def.kind === 'hiss' ? 0.7 : 1.4;
      f.frequency.setValueAtTime(def.f0, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(20, def.f1), t + dur);
      src.connect(f); f.connect(g);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.03, dur * 0.2));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.start(t); src.stop(t + dur + 0.02);
    } else {
      const o = this.ctx.createOscillator();
      o.type = def.wave || 'sine';
      o.frequency.setValueAtTime(def.f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, def.f1), t + dur);
      o.connect(g);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur * 0.2));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur + 0.02);
    }
  }

  /** The bed of noise a burning building makes. Started once the fire
   *  gets going and modulated by how much of the store is alight. */
  startAmbience() {
    if (!this.ctx || this._amb) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 700; f.Q.value = 0.4;
    const g = this.ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    this._amb = { src, g, f };
  }

  setAmbience(level) {
    if (!this._amb) return;
    const g = this._amb.g.gain;
    g.setTargetAtTime(Math.min(0.30, level * 0.34), this.ctx.currentTime, 0.6);
    this._amb.f.frequency.setTargetAtTime(500 + level * 1600, this.ctx.currentTime, 0.6);
  }
}
