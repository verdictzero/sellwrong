/* =====================================================================
   GROCERY STORE SIMULATOR — the front door
   =====================================================================

   The page is not the game any more. It is a terminal: black glass, red
   type, one prompt that reads INTERFACE 2037 and a cursor after it, and
   nothing on the screen says what it wants. Every line it puts up is
   typed out a character at a time, the way the ship's computer in ALIEN
   talks to the crew, and every entry but one is refused.

   The one that is not refused is the name of a program. It is not
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

/* THE ANSWER, hashed. See the top of the file. */
const KEY = '30af7bc7';
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

/* What it says when the page opens. Two lines of system furniture, the
   date off the machine, and the prompt. NO INSTRUCTIONS: at the user's
   request there is nothing on the glass that says what to type or that
   anything can be typed at all. The cursor is the only invitation. */
function banner() {
  const d = new Date();
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const two = n => String(n).padStart(2, '0');
  const stamp = `${two(d.getDate())} ${MON[d.getMonth()]} ${d.getFullYear()}  ${two(d.getHours())}:${two(d.getMinutes())}`;
  return [
    'SELLWRONG STORES INC  ·  STORE SYSTEMS',
    'MAINFRAME GSS/6000  ·  NIGHT MODE',
    '',
    `TERMINAL 04  ·  BACK OFFICE  ·  ${stamp}`,
    '',
  ];
}

/* What it says to everything else. The same two lines every time, so
   there is nothing to learn from trying things. */
const REFUSED = entry => [
  'ERROR  —  UNABLE TO COMPUTE',
  `ENTRY "${entry.slice(0, 48)}" REFUSED`,
  '',
];

/* And what it says on the way in. */
const GRANTED = [
  'ACCESS GRANTED',
  'STAFF EXPENDABLE',
  'HANDING OVER TO PROGRAM',
];

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

    /* The keyboard is a real <input>, off the glass, because that is
       the only thing a phone will put its keyboard up for. Everything
       that is typed into it is mirrored into the prompt line. */
    this.input.addEventListener('input', () => this.mirror());
    this.input.addEventListener('keydown', e => this.key(e));
    /* A tap anywhere on the glass is a tap on the input. click, not
       pointerdown: iOS only raises its keyboard for a focus() made
       inside a click or a touchend. */
    root.addEventListener('click', () => this.focus());
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
    if (hash(entry) === KEY) { await this.open(); return; }
    await this.tell(REFUSED(entry));
    await this.prompt();
  }

  /* IN. Three lines, then the game — js/main.js boots itself on import,
     and its loading screen comes up under this one — and then this
     fades and is removed, input and all, so the keys go to the game. If
     the import fails it says so in the terminal's own voice and offers
     the prompt again; a failure inside the boot is the game's to report
     on its own loading screen, and it does. */
  async open() {
    await this.tell(GRANTED);
    this.line('');
    this.cur.remove();
    let mod;
    try { mod = import('./main.js'); await mod; }
    catch (e) {
      console.error(e);
      await this.tell(['ERROR  —  PROGRAM DID NOT LOAD', '']);
      await this.prompt();
      return;
    }
    this.done = true;
    this.input.blur();
    await sleep(700);
    this.root.classList.add('gone');
    await sleep(800);
    this.root.remove();
  }

  async boot() {
    await sleep(500);
    await this.tell(banner());
    await this.prompt();
  }
}

const term = new Terminal($('term'));
term.boot();
