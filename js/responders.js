/* =====================================================================
   SELLWRONG — who comes when a supermarket is on fire at 2am
   =====================================================================

   A PLACEHOLDER, and an honest one: this file is the SHAPE of the thing
   that is coming, with nothing in it that can hurt you yet. What it
   already does is keep score of how loud the night has got and decide,
   on that score, who has been called and when they turn up. What it
   does not do yet is put anybody on the road. The hooks are here; the
   actors, the models and the fights are not.

   THE ALARM is one number, 0..100: how much of the store has gone, how
   much of the wood, how many of the staff, and how long anything has
   been alight — because a fire nobody has noticed is a fire nobody has
   reported, and a fire that has been going for ten minutes has been
   reported by everyone. It only ever goes up. Nothing you do quiets it.

   THE TIERS are who the alarm brings, in order, each with a threshold
   on the alarm and a delay before they are actually here — the drive
   from the station. They are DISPATCHED when the alarm crosses their
   line (you hear about it: a message, sirens in the distance) and they
   ARRIVE after their delay, at one end of the road, which is the whole
   reason the road runs off into the wood in both directions. When they
   arrive `spawn()` is called with where; today it announces them and
   returns.

   THE FIGHT, when it exists, is against people whose job is to make the
   fire stop: they will put fires out (the fire system already exposes
   heat per cell; extinguishing is subtracting from it), they will try to
   get between you and the store, and each tier will be harder to get
   past than the last. `defeated()` is where a tier's members report in
   when they are down, so a cleared tier can stay cleared. That, and a
   set of sprites, is the work; the escalation is done.
   ===================================================================== */

import { TICRATE } from './util.js';

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
  }

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
    this.game.message(t.dispatch);
    this.game.onResponders?.('dispatch', t);
  }

  arrive(t) {
    this.arrived.add(t.tier);
    const points = this.arrivalPoints();
    const from = points[(t.tier + this.tics) % points.length];
    this.game.message(t.arrive);
    this.spawn(t, from);
    this.game.onResponders?.('arrive', t, from);
  }

  /**
   * PLACEHOLDER. Where a wave would be put on the road. Records what was
   * asked for and returns; when there are actors to spawn, this is the
   * one function that changes.
   */
  spawn(t, from) {
    this.waves.push({ tier: t.tier, name: t.name, count: t.count, x: from.x, y: from.y, heading: from.heading, side: from.side, tic: this.tics });
  }

  /** A member of a wave reporting in as beaten. */
  defeated(actor) {
    this.defeatedCount++;
    this.game.onResponders?.('defeated', actor);
  }
}
