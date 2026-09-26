/* =====================================================================
   GROCERY STORE SIMULATOR — the front door
   =====================================================================

   The page is not the game any more. It is a terminal: black glass, red
   type, one prompt that reads INTERFACE 2037 and a cursor after it, and
   nothing else at all — no name on it, no date, no word of what it is
   or what it wants, at the user's request. Every line it puts up is
   typed out a character at a time, the way the ship's computer in ALIEN
   talks to the crew, and every entry but one is refused.

   IT MAKES A NOISE. A teletype tick under every character it types, a
   click under every key you press, a buzz when it refuses you, a chime
   when it lets you in, and a hum under all of it while it is on. All
   of it is synthesised in the page with WebAudio — no files, like
   everything else this game draws for itself. The browser will not let
   a page make a sound before it has been touched, so the first prompt
   types silently if nothing has been pressed yet; the hum starts on
   the first key or tap.

   The one that is not refused is the name of a program — or, at the
   user's request, a shortcut typed along the keyboard. It is not
   written anywhere in the site — not here, not in the page, not in the
   stylesheet. What is here is a hash of it, and what you type is hashed
   the same way and compared, so reading the source gets you as far as
   the screen does. (The name IS in the README, which is not shipped, so
   the person who owns this can find it again; and tools/smoke-test.mjs
   checks the hash below is still the hash of it.)

   When the entry matches, the terminal says so in three lines, imports
   js/main.js — which boots the game the moment it is evaluated, exactly
   as it did when the page loaded it directly — and fades off the glass
   in front of the game's own loading screen. Nothing in js/main.js or
   under it knows this file exists. That is the whole of the rule: the
   game is untouched, and this is the wall in front of it.

   The hash is FNV-1a, 32-bit, over the entry trimmed and uppercased. It
   is not cryptography and does not pretend to be: it is a lock on a
   shed, there to keep the answer out of view-source.
   ===================================================================== */

const $ = id => document.getElementById(id);

/* THE ANSWERS, hashed. See the top of the file. The first is the name
   of the program; the second, at the user's request, is a shortcut — a
   run along three rows of the keyboard — and it is kept out of view the
   same way. */
const KEYS = ['30af7bc7', '8ce4dd6b'];
/* AND THE EDITOR, at the user's request: GSS-EDIT, the map editor
   (js/editor/editor.js), opened by typing its program name — EDIT,
   GSS-EDIT or GSS-EDIT.EXE. Hashed like the answers above, for the same
   reason and with the same honesty about what that is worth. */
const EDIT_KEYS = ['077e1c11', 'a800a207', 'e1d497e9'];
const hash = s => {
  let h = 0x811c9dc5;
  for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
};

/* THE PROMPT, at the user's request: the interface's number and a
   chevron. Everything the person types goes on the same line after it,
   in the same red. */
const PROMPT = 'INTERFACE 2037 > ';

/* HOW FAST IT TALKS. Milliseconds per character, with a little jitter
   so it does not sound like a clock; the gap after a line; the longer
   gap a blank line stands for. The ship's computer was slower than this
   and nobody wants to sit through the boot twice. */
const CHAR_MS = 14, JITTER_MS = 22, LINE_MS = 110, BLANK_MS = 260;
const MAX_LINES = 240;     // the screen forgets the top when it fills

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* What it says when the page opens: NOTHING. At the user's request
   there is no banner, no name, no date and no instruction — the glass
   is empty until the prompt types itself onto it. The cursor is the
   only invitation. */
const BANNER = [];

/* What it says to everything else. The same two lines every time, so
   there is nothing to learn from trying things, and nothing in them
   about where you are. */
const REFUSED = entry => [
  'UNDEFINED COMMAND / SYNTAX ERROR',
  `ENTRY "${entry.slice(0, 48)}" REFUSED`,
  '',
];

/* And what it says on the way in. */
/* what it says for the editor */
const EDITOR = [
  'GSS-EDIT  —  MAP EDITOR',
  'LOADING WORKSPACE',
];

const GRANTED = [
  'ACCESS GRANTED',
  'LOADING',
];

/* ---------------------------------------------------------------------
   THE SOUND, synthesised

   Five noises and nothing loaded. The tick and the click are a burst of
   white noise through a band-pass, which is what a relay in a teletype
   sounds like from across the room; the buzz is a square wave a fifth
   below the hum; the chime is two sines a fourth apart; the hum is a
   sine at mains pitch with its second harmonic, very quiet, that starts
   when the browser lets it and stops when the game takes over.

   The context is made on the first gesture and never before: made
   earlier it sits suspended, and a suspended context makes nothing.
   --------------------------------------------------------------------- */
class Sfx {
  constructor() { this.ctx = null; this.master = null; this.noise = null; this.humNode = null; }

  /* Called from inside a click or a keydown, which is where the
     browser allows it. Safe to call again and again. */
  wake() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
      /* fifty milliseconds of noise, shared by the tick and the click */
      const n = Math.floor(this.ctx.sampleRate * 0.05);
      this.noise = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().then(() => this.hum()).catch(() => {});
    else this.hum();
  }

  get t() { return this.ctx.currentTime; }

  /* the noise burst: band-passed at `hz`, `ms` long, at `vol` */
  burst(hz, ms, vol) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = hz; bp.Q.value = 1.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, this.t);
    g.gain.exponentialRampToValueAtTime(0.001, this.t + ms / 1000);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(this.t); src.stop(this.t + ms / 1000);
  }
  tick()  { this.burst(2400 + Math.random() * 600, 18, 0.12); }   // the machine typing
  click() { this.burst(1400, 28, 0.2); }                          // you typing

  /* a tone: `type` wave at `hz`, from `at` for `ms`, at `vol` */
  tone(type, hz, at, ms, vol) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = hz;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.008);
    g.gain.setValueAtTime(vol, at + ms / 1000 - 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, at + ms / 1000);
    o.connect(g); g.connect(this.master);
    o.start(at); o.stop(at + ms / 1000 + 0.01);
  }
  error() { this.tone('square', 110, this.t, 220, 0.09); this.tone('square', 82.4, this.t + 0.26, 340, 0.09); }
  grant() { this.tone('sine', 659, this.t, 140, 0.16); this.tone('sine', 880, this.t + 0.16, 360, 0.16); }

  hum() {
    if (this.humNode || !this.ctx || this.ctx.state !== 'running') return;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, this.t);
    g.gain.exponentialRampToValueAtTime(0.028, this.t + 1.2);
    for (const [hz, v] of [[50, 1], [100, 0.35]]) {
      const o = this.ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = hz;
      const og = this.ctx.createGain(); og.gain.value = v;
      o.connect(og); og.connect(g); o.start();
    }
    g.connect(this.master);
    this.humNode = g;
  }

  /* The game has its own AudioContext; this one goes away rather than
     sit under it. The hum fades over the hand-over. */
  async close() {
    if (!this.ctx) return;
    try {
      if (this.humNode && this.ctx.state === 'running') {
        this.humNode.gain.setValueAtTime(this.humNode.gain.value, this.t);
        this.humNode.gain.exponentialRampToValueAtTime(0.0001, this.t + 1.2);
        await new Promise(r => setTimeout(r, 1300));
      }
      await this.ctx.close();
    } catch (e) { /* a context that is already gone is fine */ }
    this.ctx = null; this.humNode = null;
  }
}

class Terminal {
  constructor(root) {
    this.root = root;
    this.out = root.querySelector('#term-out');
    this.input = root.querySelector('#term-in');
    this.cur = document.createElement('span');
    this.cur.className = 'cur';
    this.busy = true;              // talking, or handing over: entries wait
    this.pending = false;          // an Enter pressed while it was talking
    this.echo = null;              // the span the person's typing shows in
    this.history = [];
    this.hist = 0;
    this.done = false;
    this.sfx = new Sfx();

    /* The keyboard is a real <input>, off the glass, because that is
       the only thing a phone will put its keyboard up for. Everything
       that is typed into it is mirrored into the prompt line. */
    this.input.addEventListener('input', () => this.mirror());
    this.input.addEventListener('keydown', e => this.key(e));
    /* A tap anywhere on the glass is a tap on the input. click, not
       pointerdown: iOS only raises its keyboard for a focus() made
       inside a click or a touchend. */
    root.addEventListener('click', () => { this.sfx.wake(); this.focus(); });
    /* On a desktop the input never lets go of the keys: nothing else on
       the page wants them. A phone is left alone, so the keyboard can
       be put away. */
    this.coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    if (!this.coarse) {
      this.input.addEventListener('blur', () => { if (!this.done) setTimeout(() => this.focus(), 0); });
      addEventListener('keydown', e => { if (!this.done && document.activeElement !== this.input) this.focus(); });
    }
  }

  focus() { if (!this.done) this.input.focus({ preventScroll: true }); }

  line(text = '') {
    const el = document.createElement('div');
    el.className = 'line';
    el.textContent = text;
    this.out.appendChild(el);
    while (this.out.childElementCount > MAX_LINES) this.out.firstElementChild.remove();
    this.out.scrollTop = this.out.scrollHeight;
    return el;
  }

  /* TYPE A LINE OUT, one character at a time, the cursor riding on the
     end of it, and settle after. A blank line is a beat. */
  async say(text) {
    const el = this.line('');
    el.appendChild(this.cur);
    this.cur.classList.remove('blink');
    if (text === '') { await sleep(BLANK_MS); return el; }
    const txt = document.createTextNode('');
    el.insertBefore(txt, this.cur);
    let s = '';
    for (const c of text) {
      s += c;
      txt.nodeValue = s;
      if (c !== ' ') this.sfx.tick();
      this.out.scrollTop = this.out.scrollHeight;
      await sleep(CHAR_MS + Math.random() * JITTER_MS);
    }
    await sleep(LINE_MS);
    return el;
  }
  async tell(lines) { for (const l of lines) await this.say(l); }

  /* PUT UP THE PROMPT and hand the line to the person. The prompt is
     typed like everything else; the cursor then sits blinking after
     whatever has been typed so far — anything keyed while it was
     talking is already in the input and shows up here. */
  async prompt() {
    const el = await this.say(PROMPT);
    this.echo = document.createElement('span');
    this.echo.className = 'echo';
    el.insertBefore(this.echo, this.cur);
    this.busy = false;
    this.cur.classList.add('blink');
    this.mirror();
    this.focus();
    if (this.pending) { this.pending = false; this.enter(); }
  }

  mirror() {
    if (this.echo) this.echo.textContent = this.input.value;
    this.out.scrollTop = this.out.scrollHeight;
  }

  key(e) {
    if (this.done) return;
    this.sfx.wake();
    if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter') this.sfx.click();
    /* TYPE-AHEAD: keys pressed while it is talking wait in the input,
       and an Enter pressed then is kept and fires when the prompt comes
       up, the way a line-buffered terminal takes a line you typed before
       it was ready for it. */
    if (e.key === 'Enter') { e.preventDefault(); this.busy ? (this.pending = true) : this.enter(); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!this.history.length) return;
      this.hist = Math.max(0, Math.min(this.history.length, this.hist + (e.key === 'ArrowUp' ? -1 : 1)));
      this.input.value = this.history[this.hist] ?? '';
      this.mirror();
    }
  }

  /* THE ENTRY. Empty is nothing: a new prompt. Anything else is either
     the answer or it is not, and there is no third thing it can be. */
  async enter() {
    const raw = this.input.value;
    const entry = raw.trim().toUpperCase();
    this.input.value = '';
    this.busy = true;
    this.cur.classList.remove('blink');
    /* the line as typed stays on the glass; the cursor leaves it */
    this.echo.textContent = entry;
    this.echo = null;
    if (entry === '') { await this.prompt(); return; }
    this.history.push(raw.trim());
    this.hist = this.history.length;
    if (KEYS.includes(hash(entry))) { await this.open(); return; }
    if (EDIT_KEYS.includes(hash(entry))) { await this.open('./editor/editor.js'); return; }
    this.sfx.error();
    await this.tell(REFUSED(entry));
    await this.prompt();
  }

  /* IN. Three lines, then the game — js/main.js boots itself on import,
     and its loading screen comes up under this one — and then this
     fades and is removed, input and all, so the keys go to the game. If
     the import fails it says so in the terminal's own voice and offers
     the prompt again; a failure inside the boot is the game's to report
     on its own loading screen, and it does. */
  async open(program = './main.js') {
    this.sfx.grant();
    await this.tell(program === './main.js' ? GRANTED : EDITOR);
    this.line('');
    this.cur.remove();
    let mod;
    try {
      mod = await import(program);
      /* the editor does not start itself on import, the game does */
      if (mod.startEditor) await mod.startEditor();
    }
    catch (e) {
      console.error(e);
      await this.tell(['ERROR  —  PROGRAM DID NOT LOAD', '']);
      await this.prompt();
      return;
    }
    this.done = true;
    this.input.blur();
    const quiet = this.sfx.close();
    await sleep(700);
    this.root.classList.add('gone');
    await sleep(800);
    this.root.remove();
    await quiet;
  }

  async boot() {
    await sleep(500);
    await this.tell(BANNER);
    await this.prompt();
  }
}

/* STRAIGHT PAST THE DOOR, for the two round trips the editor makes:
   `?edit` is the way back from a test run (F2 in the game) and opens
   the editor with no terminal; `?play` is a test run of an edited map,
   which js/main.js picks up on its own; and `?demo`, at the user's
   request, is the demo level, THE SPRAWL (js/maps/sprawl.js), which
   js/main.js picks up the same way. Anything else is the terminal. */
const params = new URLSearchParams(location.search);
if (params.has('edit') || params.has('play') || params.has('demo')) {
  $('term').remove();
  const go = params.has('edit')
    ? import('./editor/editor.js').then(m => m.startEditor())
    : import('./main.js');
  go.catch(e => { console.error(e); document.body.append(`did not load: ${e.message}`); });
} else {
  const term = new Terminal($('term'));
  term.boot();
}
