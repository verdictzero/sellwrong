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

   WHAT CALLS THEM IS A KILL. Not the fire — a supermarket alight is the
   fire brigade's business — but the moment somebody is dead by your
   hand the night has changed, and the first van is on the road. From
   then on they keep coming: a van every forty to seventy seconds, up to
   a handful standing at once, each one pulling up across the fire lane
   in front of the doors and unloading its crew one at a time onto the
   footway. When the crew is out it does not stop; it trickles, one
   trooper every nine seconds, for as long as it stands there. Which
   makes the VAN the thing to deal with — a squad van is a vehicle and
   burns, chars and goes up like any other, and a van that has gone up
   is a van that has stopped — and that is the fight: the store behind
   you, the lot in front of you, and the road bringing more.

   WHERE THEY GO is the map's business. level.swatRoutes is the way in
   from each end of the road and level.swatBays is where a van may stop,
   both worked out where the lot's own numbers are; this file joins one
   to the other and drives nothing itself. See SwatVan in js/vehicles.js
   for the driving and js/states.js for the trooper.

   THE BUDGET is a cap on troopers alive at once, across every van, and
   it is the whole of what keeps a long night from filling the lot with
   navy blue. A van that would unload past it waits.
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

   `after` is the kill that calls them — the first — and `firstDelay`
   is the drive from wherever they were, which is long enough to have
   forgotten and short enough that you have not gone far. `every` is
   the gap between vans after that, rolled, and shrinks as the night
   goes on (see nextVanAt): the third van comes sooner than the second.
   ------------------------------------------------------------------- */
export const SWAT = {
  after: 1,                              // kills before anybody is called
  firstDelay: 16 * TICRATE,              // the first van's drive
  every: [40 * TICRATE, 70 * TICRATE],   // and the gap between vans
  quicker: 0.85,                         // what each van does to the next gap
  minEvery: 18 * TICRATE,                // but never closer than this
  maxVans: 4,                            // standing or coming at once
  crew: 6,                               // what a van carries
  unloadEvery: 50,                       // tics between one and the next
  trickle: 9 * TICRATE,                  // and after the crew is out, for ever
  maxTroopers: 22,                       // alive at once, across every van
  bays: 9,                               // spaces along the fire lane
};

const rnd = () => pRandom() / 255;
const between = ([a, b]) => a + rnd() * (b - a);

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
    this.gap = 0;                    // the current gap between vans, in tics
    this.vans = [];                  // every SwatVan that has come, wreck or not
    this.side = 0;                   // which end of the road the next one uses
    this.spawned = 0;                // troopers put on the ground, ever
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
   *  wreck is not one, and neither is one in the air. */
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
    /* THE CALL. One kill, and the first van is on its way. */
    if (!this.called && p.kills >= SWAT.after) this.call();
    if (!this.called || p.dead) return;
    /* the next van, if there is room on the road for one */
    if (this.tics >= this.nextVanAt && this.liveVans.length < SWAT.maxVans && g.police) {
      this.sendVan();
      this.gap = Math.max(SWAT.minEvery, this.gap ? this.gap * SWAT.quicker : between(SWAT.every));
      this.nextVanAt = this.tics + Math.round(this.gap);
    }
    /* and what comes out of the ones that are here */
    for (const v of this.vans) {
      if (v.state !== 'parked' && v.state !== 'charring') continue;
      if (v.unloadAt === undefined) v.unloadAt = this.tics + SWAT.unloadEvery;
      if (this.tics < v.unloadAt) continue;
      if (this.troopers >= SWAT.maxTroopers) { v.unloadAt = this.tics + TICRATE; continue; }
      if (this.unload(v)) {
        v.unloaded = (v.unloaded || 0) + 1;
        v.unloadAt = this.tics + (v.unloaded < SWAT.crew ? SWAT.unloadEvery : SWAT.trickle);
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

  /** The route for the next van: in from one end of the road, alternating,
   *  along the frontage lane to the first free bay, and into it. */
  routeFor(bay, side) {
    const lv = this.game.level;
    const routes = lv.swatRoutes;
    if (!routes) return null;
    const way = (routes[side] || Object.values(routes)[0]).map(p => ({ x: p.x, y: p.y }));
    const last = way[way.length - 1];
    /* which way along the front it is coming: from the west, +x */
    const dir = bay.x >= last.x ? 1 : -1;
    const ay = bay.approach?.y ?? last.y;
    way.push({ x: bay.x - dir * 420, y: ay });
    way.push({ x: bay.x - dir * 120, y: bay.y });
    way.push({ x: bay.x, y: bay.y });
    /* squared up along the front once it stops, facing the way it came */
    way[way.length - 1].angle = dir > 0 ? 0 : Math.PI;
    return way;
  }

  /** A bay nobody is standing in — a wreck counts as standing. The
   *  middle one first, then either side of it, working outward. */
  freeBay() {
    const bays = this.game.level.swatBays;
    if (!bays || !bays.length) return null;
    const taken = new Set(this.vans.map(v => v.bay));
    return bays.slice(0, SWAT.bays).find(b => !taken.has(b)) || null;
  }

  sendVan() {
    const g = this.game;
    const bay = this.freeBay();
    if (!bay) return null;
    const side = this.side++ % 2 ? 'east' : 'west';
    const route = this.routeFor(bay, side);
    if (!route) return null;
    const v = new SwatVan(g.vehicles, g.police.def, g.police.texture, route);
    v.parkAngle = route[route.length - 1].angle;
    v.bay = bay;
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
    const toward = { x: v.x, y: v.y + 1000 };            // the shop is north of the fire lane
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
