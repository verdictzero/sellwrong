/* =====================================================================
   GROCERY STORE SIMULATOR — who comes when a supermarket is on fire at 2am
   =====================================================================

   THE SWAT COME, and they are the first thing in the game that fights
   back. The rest of this file is still the shape it was — an alarm that
   only climbs, six tiers that are dispatched at a threshold and arrive
   after a drive — and that shape is kept, because the night manager and
   the fire brigade are still coming one day and the escalation is
   already written and tested. What is new is underneath it: one squad,
   on its own trigger, that does not wait for the alarm.

   WHAT CALLS THEM IS THE TRIGGER, at the user's request. Not the fire —
   a supermarket alight is the fire brigade's business — but the first
   shot out of any weapon, on the tic you fire it, which in this game is
   the first thing anybody does. It used to be the first KILL and a
   sixteen-second wait on top, which together read as the game giving
   you a head start; now there is no head start and the sirens are the
   answer to the flamethrower rather than to the body. THREE AT A TIME,
   at the user's request: where one van used to be sent,
   three are, nose to tail from the same end of the road, and the budget
   is three times what it was so that the second and third are not
   simply refused. They unload their crews one at a time and, when the
   crew is out, keep trickling for as long as they stand there, which is
   for ever, because a squad van is fireproof (see SwatVan) and nothing
   in the game ends one.

   AND THEY COME TO WHEREVER YOU ARE. Inside the building they pull up
   across the fire lane in front of the doors, which is what the fire
   lane is for and what the map's bays say. Anywhere else — the car
   park, the verge, the trees, round the back of the shop — the
   destination is YOU: the nearest point on the perimeter road to
   wherever you are standing, reached by walking the ring the short way
   round from the junction they came in at, and then off the road
   toward you for as far as the tarmac holds. In the middle of the lot
   that is a van pulling up two car lengths away with its side door
   facing you. Behind the building, where no road goes, it is a van on
   the frontage lane and a crew already walking. Hiding moves the fight;
   it does not end it.

   AND IT RAMPS EXPONENTIALLY, at the user's request, and the ramp is
   ONE NUMBER: the PRESSURE, 1 at the call and doubling every so many
   seconds from then on, without limit. Everything that says how much
   police there is — how many vans may be on the road or standing, how
   many troopers may be on their feet, how long between vans, how long
   between one trooper and the next out of a standing van — is a
   starting value times that number, read off the curve at the moment
   the question is asked rather than fixed at the call. So the same
   minute of the night is the same everywhere: the vans come twice as
   often, the doors open twice as often and twice as many are allowed
   out, all together. The floors under the gaps and the ceiling on the
   troopers are what the engine can carry, not the design; the design
   is the curve, and the curve does not stop.

   WHERE THEY GO is the map's business. level.swatRoutes is the way in
   from each end of the road and level.swatBays is where a van may stop,
   both worked out where the lot's own numbers are; this file joins one
   to the other and drives nothing itself. See SwatVan in js/vehicles.js
   for the driving and js/states.js for the trooper.
   ===================================================================== */

import { TICRATE, pRandom } from './util.js';
import { SwatVan } from './vehicles.js';

/* Who, at what alarm, and how long they take to get here. Delays are in
   tics. `count` and `note` describe the wave that will arrive when there
   is something to arrive. */
export const TIERS = [
  { tier: 1, name: 'the night manager', at: 3,  delay: 25 * TICRATE,  count: 1,
    dispatch: 'SOMEBODY HAS NOTICED', arrive: 'THE NIGHT MANAGER IS OUT THE BACK WITH A TORCH',
    note: 'one person, an extinguisher and a torch; the softest tier' },
  { tier: 2, name: 'security', at: 8,  delay: 40 * TICRATE,  count: 2,
    dispatch: 'SOMEBODY HAS CALLED IT IN', arrive: 'SECURITY HAS PULLED INTO THE LOT',
    note: 'two in a van, radios, no appetite for it' },
  { tier: 3, name: 'the police', at: 18, delay: 55 * TICRATE,  count: 2,
    dispatch: 'SIRENS, A LONG WAY OFF', arrive: 'BLUE LIGHTS ON THE ROAD',
    note: 'two cars; they want you, not the fire' },
  { tier: 4, name: 'the fire brigade', at: 30, delay: 70 * TICRATE,  count: 2,
    dispatch: 'A SECOND SIREN, DEEPER', arrive: 'THE FIRE BRIGADE IS HERE',
    note: 'two appliances; they want the fire, and they will put it out' },
  { tier: 5, name: 'riot police', at: 50, delay: 90 * TICRATE,  count: 4,
    dispatch: 'HELICOPTER', arrive: 'THE VANS ARE HERE',
    note: 'four vans and shields; the last thing on the ground' },
  { tier: 6, name: 'the helicopter', at: 75, delay: 120 * TICRATE, count: 1,
    dispatch: 'YOU CAN HEAR IT COMING', arrive: 'IT IS OVERHEAD',
    note: 'searchlight and a water bucket; the ceiling of the escalation' },
];

/* How the alarm is made from what the night looks like. */
export const ALARM = {
  store: 0.55,      // per percent of the store burnt
  wood: 0.25,       // per percent of the wood
  kill: 2.0,        // per member of staff
  minute: 3.0,      // per minute anything has been alight
  max: 100,
};

/** The alarm, as a pure function of the night, for the test. */
export function alarmOf({ storePct = 0, woodPct = 0, kills = 0, minutesAlight = 0 }) {
  return Math.min(ALARM.max,
    storePct * ALARM.store + woodPct * ALARM.wood + kills * ALARM.kill + minutesAlight * ALARM.minute);
}

/* ---------------------------------------------------------------------
   THE SQUAD, IN NUMBERS

   `after` is the trigger pull that calls them — the first — and
   `firstDelay` is what used to be the drive from wherever they were
   and is now nothing: they are dispatched on the tic you fire.

   THEN THE CURVE. `doubling` is how often the pressure doubles, from
   the call; the four `at pressure 1` numbers are what the night starts
   at, and every one of them is divided or multiplied by the pressure
   as it is used (see pressure, vanCap, trooperCap, gapNow, trickleNow).
   A minute in: twice the vans allowed, twice the troopers, half the
   gap, half the trickle. Two minutes: four times. Three: eight. The
   floors and the ceiling are the engine's, and the bays are the map's;
   the curve reaches all of them inside four minutes and then simply
   holds the lot at what the engine will carry.
   ------------------------------------------------------------------- */
export const SWAT = {
  /* WHAT CALLS THEM IS THE TRIGGER, at the user's request: one shot out
     of any weapon, which is the first thing anybody does in this game.
     It used to be one kill, which in practice was ten seconds later and
     read as the game letting you start. */
  after: 1,                              // shots fired before anybody is called
  firstDelay: 0,                         // and they are dispatched on that tic
  doubling: 60 * TICRATE,                // how often the pressure doubles, from the call
  every: 55 * TICRATE,                   // the gap between sends, at pressure 1, give or take a fifth
  minEvery: 6 * TICRATE,                 // and the least it can ever be
  /* THREE AT A TIME, at the user's request: where one van used to come,
     three come. The gap between sends is untouched, and so is every
     other clock — what tripled is the size of a send and, with it, the
     budget, or the first two of the three would have been the whole of
     it. */
  convoy: 3,                             // vans per send
  vans: 6,                               // on the road or standing at once, at pressure 1
  maxVans: 27,                           // and the most the engine is asked to carry
  troopers: 6,                           // on their feet at once, at pressure 1
  maxTroopers: 80,                       // and the most the engine is asked to carry
  crew: 6,                               // what a van carries
  unloadEvery: 50,                       // tics between one and the next
  trickle: 9 * TICRATE,                  // and after the crew is out, for ever, at pressure 1
  minTrickle: 2 * TICRATE,               // and the least that can be
  bays: 9,                               // spaces along the fire lane, for the doors
  /* WHERE A VAN STOPS WHEN IT IS COMING FOR YOU rather than for the
     doors. `stand` is how far apart two of them park along the ring,
     `push` is how far off the road one will drive to reach you, `stop`
     is how close it parks, and `convoyGap` is how far back down the
     road the second and third of a send start, so they arrive as a
     line rather than inside one another. */
  stand: 560,
  push: 1400,
  stop: 260,
  convoyGap: 460,
};

/** The curve, as a pure function: how many times harder the night is
 *  pressing `tics` after the call. 1 at the call, 2 a doubling later,
 *  4 after two, and so on — equal steps in time multiply by the same
 *  amount, which is what exponential means and what the test pins. */
export function pressureAfter(tics) {
  return Math.pow(2, Math.max(0, tics) / SWAT.doubling);
}

const rnd = () => pRandom() / 255;

export class Responders {
  constructor(game) {
    this.game = game;
    this.alarm = 0;
    this.alightTics = 0;
    this.dispatched = new Map();     // tier -> tic dispatched
    this.arrived = new Set();
    this.defeatedCount = 0;
    this.waves = [];                 // what spawn() was asked for, for anyone watching
    this.tics = 0;

    /* the squad */
    this.called = false;             // somebody has died by your hand
    this.calledAt = -1;
    this.nextVanAt = -1;
    this.gap = 0;                    // the gap the last van set, in tics
    this.vans = [];                  // every SwatVan that has come
    this.side = 0;                   // which end of the road the next one uses
    this.spawned = 0;                // troopers put on the ground, ever
  }

  /* ------------------------------------------------------------------
     THE CURVE, read off the clock
     ------------------------------------------------------------------ */
  /** How hard the night is pressing now: 0 before the call, 1 at it,
   *  and doubling every SWAT.doubling tics from then on. */
  get pressure() { return this.called ? pressureAfter(this.tics - this.calledAt) : 0; }
  /** Vans allowed on the road or standing at once, now. */
  get vanCap() { return Math.min(SWAT.maxVans, Math.floor(SWAT.vans * this.pressure)); }
  /** Troopers allowed on their feet at once, now, across every van. */
  get trooperCap() { return Math.min(SWAT.maxTroopers, Math.floor(SWAT.troopers * this.pressure)); }
  /** The gap to the next van, now: the starting gap over the pressure,
   *  give or take a fifth so two nights are not the same night. */
  gapNow() { return Math.max(SWAT.minEvery, SWAT.every * (0.8 + 0.4 * rnd()) / this.pressure); }
  /** The gap between one trooper and the next out of a standing van
   *  whose crew is already out, now. */
  trickleNow() { return Math.max(SWAT.minTrickle, SWAT.trickle / this.pressure); }

  get tier() { return Math.max(0, ...this.arrived); }
  get nextTier() { return TIERS.find(t => !this.dispatched.has(t.tier)) || null; }

  /* Where the road leaves the map: whoever comes, comes from one of
     these. Falls back to the mouth of the lot if the map has no road. */
  arrivalPoints() {
    const lv = this.game.level;
    if (lv.roadEnds?.length) return lv.roadEnds;
    const p = this.game.player;
    return [{ x: p ? p.x : 0, y: p ? p.y - 400 : 0, heading: Math.PI / 2, side: 'the lot' }];
  }

  tic() {
    this.tics++;
    const g = this.game;
    if (g.fire?.burningCells > 0 || g.forest?.burningCells > 0) this.alightTics++;
    this.squadTic();
    /* once a second is plenty for something that only ever climbs */
    if (this.tics % TICRATE) return;
    const a = alarmOf({
      storePct: g.burnPercent, woodPct: g.forestPercent,
      kills: g.player?.kills || 0, minutesAlight: this.alightTics / TICRATE / 60,
    });
    if (a > this.alarm) this.alarm = a;

    for (const t of TIERS) {
      if (!this.dispatched.has(t.tier) && this.alarm >= t.at) this.dispatch(t);
      const when = this.dispatched.get(t.tier);
      if (when !== undefined && !this.arrived.has(t.tier) && this.tics - when >= t.delay) this.arrive(t);
    }
  }

  dispatch(t) {
    this.dispatched.set(t.tier, this.tics);
    this.game.onResponders?.('dispatch', t);
  }

  arrive(t) {
    this.arrived.add(t.tier);
    const points = this.arrivalPoints();
    const from = points[(t.tier + this.tics) % points.length];
    this.spawn(t, from);
    this.game.onResponders?.('arrive', t, from);
  }

  /**
   * PLACEHOLDER, still: where a tier's wave would be put on the road.
   * Records what was asked for and returns. The SWAT do not come
   * through here — they have a trigger of their own, below.
   */
  spawn(t, from) {
    this.waves.push({ tier: t.tier, name: t.name, count: t.count, x: from.x, y: from.y, heading: from.heading, side: from.side, tic: this.tics });
  }

  /** A member of a wave reporting in as beaten. */
  defeated(actor) {
    this.defeatedCount++;
    this.game.onResponders?.('defeated', actor);
  }

  /* ------------------------------------------------------------------
     THE SQUAD
     ------------------------------------------------------------------ */
  /** Vans that are still a van: on the road, standing, or charring. A
   *  wreck is not one, and neither is one in the air — which since the
   *  van became fireproof is every van that has ever come, but the
   *  count is kept honest against the day something else ends one. */
  get liveVans() { return this.vans.filter(v => v.whole); }

  /** Troopers on their feet, anywhere. Counted, not kept, for the same
   *  reason Game.peopleLeft is. */
  get troopers() {
    let n = 0;
    for (const a of this.game.actors) if (a.type === 'SWAT' && !a.dead && !a.removed) n++;
    return n;
  }

  squadTic() {
    const g = this.game, p = g.player;
    if (!p) return;
    /* THE CALL. One pull of the trigger and the first convoy is on the
       road that tic — or one death, if somebody has managed to die
       without a shot being fired, which the fire can do on its own once
       it is going. */
    if (!this.called && (p.shotsFired >= SWAT.after || p.kills > 0)) this.call();
    if (!this.called || p.dead) return;
    /* the next van, if the curve allows another on the road. The gap is
       read off the curve as each van leaves, not set at the call, so
       the fourth van comes on the fourth van's terms; and when the cap
       itself climbs past the vans standing, the next is sent the tic
       it does, because the gap has long since run out */
    if (this.tics >= this.nextVanAt && this.liveVans.length < this.vanCap && g.police) {
      this.sendConvoy();
      this.gap = this.gapNow();
      this.nextVanAt = this.tics + Math.round(this.gap);
    }
    /* and what comes out of the ones that are here */
    const cap = this.trooperCap;
    for (const v of this.vans) {
      if (v.state !== 'parked' && v.state !== 'charring') continue;
      if (v.unloadAt === undefined) v.unloadAt = this.tics + SWAT.unloadEvery;
      if (this.tics < v.unloadAt) continue;
      if (this.troopers >= cap) { v.unloadAt = this.tics + TICRATE; continue; }
      if (this.unload(v)) {
        v.unloaded = (v.unloaded || 0) + 1;
        v.unloadAt = this.tics + (v.unloaded < SWAT.crew ? SWAT.unloadEvery : Math.round(this.trickleNow()));
      } else v.unloadAt = this.tics + 12;          // the door is blocked; try again shortly
    }
  }

  call() {
    this.called = true;
    this.calledAt = this.tics;
    this.nextVanAt = this.tics + SWAT.firstDelay;
    this.gap = 0;
    const g = this.game;
    g.setBigMessage?.('SIRENS', 3 * TICRATE);
    g.sound?.play('siren', null);
    g.onResponders?.('called');
  }

  /* ------------------------------------------------------------------
     THE RING, AS ONE NUMBER

     The perimeter road is a closed loop (level.swatRing, four corners)
     and every question about where a van goes turns into a distance
     round it. A van enters at whichever junction the through road meets
     and walks the loop the short way to its stand, which is how it can
     now be sent to any side of the lot rather than only to the doors.
     ------------------------------------------------------------------ */
  get ring() {
    const pts = this.game.level.swatRing;
    if (!pts || pts.length < 3) return null;
    if (this._ring && this._ring.pts === pts) return this._ring;
    const segs = [];
    let total = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      segs.push({ a, b, len, start: total, dx: (b.x - a.x) / len, dy: (b.y - a.y) / len });
      total += len;
    }
    return (this._ring = { pts, segs, total });
  }

  /** A distance round the loop, as a point and the way you are facing. */
  ringAt(t) {
    const R = this.ring;
    const u = ((t % R.total) + R.total) % R.total;
    const s = R.segs.find(q => u >= q.start && u <= q.start + q.len) || R.segs[R.segs.length - 1];
    const d = u - s.start;
    return { x: s.a.x + s.dx * d, y: s.a.y + s.dy * d, dx: s.dx, dy: s.dy };
  }

  /** How far round the loop the point nearest (x, y) is. */
  ringNearest(x, y) {
    const R = this.ring;
    let best = 0, bd = Infinity;
    for (const s of R.segs) {
      const d = Math.max(0, Math.min(s.len, (x - s.a.x) * s.dx + (y - s.a.y) * s.dy));
      const px = s.a.x + s.dx * d, py = s.a.y + s.dy * d;
      const q = (px - x) ** 2 + (py - y) ** 2;
      if (q < bd) { bd = q; best = s.start + d; }
    }
    return best;
  }

  /** The corners strictly between two points on the loop, the short way
   *  round, in the order they are driven through. */
  ringPath(t0, t1) {
    const R = this.ring;
    const fwd = ((t1 - t0) % R.total + R.total) % R.total;
    const dir = fwd <= R.total - fwd ? 1 : -1;
    const dist = dir > 0 ? fwd : R.total - fwd;
    const out = [];
    for (const s of R.segs) {
      const d = dir > 0 ? ((s.start - t0) % R.total + R.total) % R.total
                        : ((t0 - s.start) % R.total + R.total) % R.total;
      if (d > 1 && d < dist - 1) out.push({ d, x: s.a.x, y: s.a.y });
    }
    return out.sort((p, q) => p.d - q.d).map(p => ({ x: p.x, y: p.y }));
  }

  /** Tarmac a van will drive on: outdoors, and not the wood, the
   *  covered walkway or the sign it stands on. */
  drivable(x, y) {
    const s = this.game.level.sectorAt(x, y);
    return !!s && !!s.outdoor && !/wood|canopy|sign/i.test(s.name || '');
  }

  /* ------------------------------------------------------------------
     WHERE THIS ONE IS GOING

     Inside the building, they come to the doors, which is what the fire
     lane is for and what the map's bays say. ANYWHERE ELSE — the car
     park, the verge, the trees, round the back — they come to YOU, at
     the user's request: the nearest point on the ring to wherever you
     are standing, and then off the road toward you for as far as the
     tarmac holds. Behind the building the tarmac holds for no distance
     at all, so what arrives is a van on the frontage lane with its
     crew already walking; in the middle of the lot it is a van pulling
     up two car lengths away.
     ------------------------------------------------------------------ */
  /** Is the player somewhere a van should come to, rather than the doors? */
  get chasing() {
    const p = this.game.player;
    return !!p && !p.dead && !!p.sector && !!p.sector.outdoor;
  }

  /** A stand at the doors: one of the map's bays, squared up along the
   *  front, with the lead in off the frontage lane. */
  bayStand(bay) {
    const t = this.ringNearest(bay.x, bay.approach?.y ?? bay.y);
    const on = this.ringAt(t);
    return {
      x: bay.x, y: bay.y, bay,
      angle: on.dx >= 0 ? 0 : Math.PI,
      ring: t,
      lead: [{ x: bay.x, y: on.y }, { x: bay.x, y: bay.y }],
    };
  }

  /** A stand beside the player: `slot` steps along the ring from the
   *  point nearest them, then in off the road as far as it goes. */
  chaseStand(p, slot) {
    const t = this.ringNearest(p.x, p.y) + slot * SWAT.stand;
    const on = this.ringAt(t);
    const dx = p.x - on.x, dy = p.y - on.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    const reach = Math.min(SWAT.push, Math.max(0, d - SWAT.stop));
    let gone = 0, x = on.x, y = on.y;
    const STEP = 70;
    while (gone + STEP <= reach) {
      const nx = x + ux * STEP, ny = y + uy * STEP;
      if (!this.drivable(nx, ny)) break;
      x = nx; y = ny; gone += STEP;
    }
    return {
      x, y, ring: ((t % this.ring.total) + this.ring.total) % this.ring.total,
      angle: gone > 0 ? Math.atan2(uy, ux) : Math.atan2(on.dy, on.dx),
      lead: gone > 0 ? [{ x, y }] : [],
    };
  }

  /** Nothing already standing there. */
  standClear(s) {
    const r = SWAT.stand * 0.7;
    return !this.liveVans.some(v => v.stand && (v.stand.x - s.x) ** 2 + (v.stand.y - s.y) ** 2 < r * r);
  }

  /** The next place a van should go, or null if every one is taken. */
  freeStand() {
    if (!this.ring) return null;
    if (!this.chasing) {
      const bay = this.freeBay();
      return bay ? this.bayStand(bay) : null;
    }
    const p = this.game.player;
    for (let k = 0; k <= 12; k++) {
      const slot = k === 0 ? 0 : (k & 1 ? (k + 1) >> 1 : -(k >> 1));
      const s = this.chaseStand(p, slot);
      if (this.standClear(s)) return s;
    }
    return null;
  }

  /** A bay nobody is standing in. The middle one first, then either
   *  side of it, working outward; a van never leaves one. */
  freeBay() {
    const bays = this.game.level.swatBays;
    if (!bays || !bays.length) return null;
    const taken = new Set(this.vans.map(v => v.bay));
    return bays.slice(0, SWAT.bays).find(b => !taken.has(b)) || null;
  }

  /** In from one end of the road, round the ring the short way, and in
   *  to the stand. `back` starts it that far further down the road, so
   *  a convoy arrives as a line rather than as one van. */
  routeTo(stand, side, back = 0) {
    const lv = this.game.level;
    const routes = lv.swatRoutes;
    if (!routes || !this.ring) return null;
    const way = (routes[side] || Object.values(routes)[0]).map(p => ({ x: p.x, y: p.y }));
    if (back > 0 && way.length >= 2) {
      const a = way[0], b = way[1];
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      a.x -= (b.x - a.x) / d * back;
      a.y -= (b.y - a.y) / d * back;
    }
    const join = way[way.length - 1];
    way.push(...this.ringPath(this.ringNearest(join.x, join.y), stand.ring));
    const on = this.ringAt(stand.ring);
    way.push({ x: on.x, y: on.y });
    for (const q of stand.lead) way.push({ x: q.x, y: q.y });
    const end = way[way.length - 1];
    end.angle = stand.angle;
    /* two points in the same place make a zero-length leg, which the
       driving reads as arrival */
    return way.filter((q, i) => i === 0 || Math.hypot(q.x - way[i - 1].x, q.y - way[i - 1].y) > 1);
  }

  /** Which end of the road they come from: whichever is the shorter
   *  drive to where they are going. The road ends are nine thousand
   *  units out from the ring on either side, so coming in at the wrong
   *  one is half a minute of tarmac and the difference between a
   *  response and an interval. */
  sideFor(ringT) {
    const routes = this.game.level.swatRoutes, R = this.ring;
    let best = Object.keys(routes)[0], bd = Infinity;
    for (const name of Object.keys(routes)) {
      const r = routes[name], e = r[r.length - 1];
      const fwd = ((ringT - this.ringNearest(e.x, e.y)) % R.total + R.total) % R.total;
      const d = Math.min(fwd, R.total - fwd);
      if (d < bd) { bd = d; best = name; }
    }
    return best;
  }

  /** THREE OF THEM, at the user's request, nose to tail from the same
   *  end of the road — as many as the budget still has room for. */
  sendConvoy() {
    const room = this.vanCap - this.liveVans.length;
    const first = this.freeStand();
    if (!first) return [];
    const side = this.sideFor(first.ring);
    this.side++;
    const sent = [];
    for (let k = 0; k < Math.min(SWAT.convoy, room); k++) {
      const v = this.sendVan(side, k * SWAT.convoyGap);
      if (!v) break;
      sent.push(v);
    }
    return sent;
  }

  sendVan(side = (this.side++ % 2 ? 'east' : 'west'), back = 0) {
    const g = this.game;
    const stand = this.freeStand();
    if (!stand) return null;
    const route = this.routeTo(stand, side, back);
    if (!route) return null;
    const v = new SwatVan(g.vehicles, g.police.def, g.police.texture, route);
    v.parkAngle = route[route.length - 1].angle;
    v.stand = stand;
    v.bay = stand.bay || null;
    v.side = side;
    g.vehicles.addVehicle(v);
    this.vans.push(v);
    g.onResponders?.('van', v);
    return v;
  }

  /** One trooper out of the side door, if there is room to stand. Tries
   *  the five places along the flank before giving up for this tic. */
  unload(v) {
    const g = this.game, lv = g.level;
    /* THE DOOR THEY USE IS THE ONE FACING YOU. It used to be the one
       facing the shop, which was the same thing while the only place a
       van ever stood was across the fire lane; a van that has driven
       out into the lot to reach you would otherwise unload its crew
       out of the far side. */
    const p = g.player;
    const toward = p && !p.dead ? { x: p.x, y: p.y } : { x: v.x, y: v.y + 1000 };
    for (let k = 0; k < 5; k++) {
      const d = v.door(k, toward);
      const sec = lv.sectorAt(d.x, d.y);
      if (!sec) continue;
      if (!this.roomAt(d.x, d.y, 20)) continue;
      const a = g.spawn('SWAT', d.x, d.y, undefined, { angle: d.angle });
      /* they know why they are here: the player, from the first step */
      a.target = g.player;
      a.threshold = 0;
      a.setState(a.info.see);
      a.van = v;
      this.spawned++;
      g.sound?.play('swatsee', a);
      return a;
    }
    return null;
  }

  /** Nothing solid within `r` of a point, and the player is not there. */
  roomAt(x, y, r) {
    const g = this.game;
    const list = g.blockmap ? g.blockmap.near(x, y, this._near || (this._near = [])) : g.actors;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o.removed || !o.solid || o.dead) continue;
      const rr = r + o.radius;
      if ((o.x - x) ** 2 + (o.y - y) ** 2 < rr * rr) return false;
    }
    const p = g.player;
    if (p && !p.dead && (p.x - x) ** 2 + (p.y - y) ** 2 < (r + p.radius) ** 2) return false;
    return true;
  }
}
