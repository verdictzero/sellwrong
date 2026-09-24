/* =====================================================================
   GROCERY STORE SIMULATOR — the fire brigade
   =====================================================================

   A supermarket alight is the fire brigade's business, as the top of
   js/responders.js has said since there was a responders.js. TIERS has
   carried "the fire brigade" for as long, as a line in a table that sent
   nobody. This sends somebody, at the user's request: the user's fire
   truck (FireTruck in js/vehicles.js), with its water cannon working.
   It does not yet put firefighters on the ground; the truck is the whole
   of the brigade for now.

   WHAT CALLS THEM IS THE FIRE, not you: anything alight — the store, the
   wood, a car in the lot — for CALL_AFTER seconds, all told. The SWAT
   answer the trigger; the brigade answer the smoke. So a night with a
   gun in it and no fire has no fire engines, and a night of nothing but
   matches has nothing else.

   HOW MANY. One truck at the call, and then another every SEND_EVERY
   seconds for as long as something is still burning, up to one per
   CELLS_PER_TRUCK cells alight and never more than MAX_TRUCKS on the
   scene. A fire that is being won stops the sends; one that is being
   lost brings the whole station.

   WHERE THEY GO is where the fire is. The brigade picks the thickest
   part of whatever is burning (hotspot) and stands a truck as close to
   it as the tarmac allows, on the same ring and by the same arithmetic
   the SWAT use to come to you (Responders.chaseStand), keeping STOP back
   from it because a fire engine parked in the fire is a second fire. A
   fire INSIDE the building is fought from the fire lane, which is what a
   fire lane is: a truck takes a bay in front of the doors, and plays on
   whatever of it the doors let it see.

   THEY COME FROM THE FIRE STATION's end of the road — the town keeps its
   engines in the yard on A5 (see arrivalPoints in js/responders.js) —
   which here means whichever end of the road is the shorter drive to the
   stand, and they come on at the same run-in the SWAT do, out of your
   view, so a truck does not appear in front of you.
   ===================================================================== */

import { TICRATE } from './util.js';
import { FireTruck } from './vehicles.js';

export const BRIGADE = {
  key: 'fire',
  callAfter: 8 * TICRATE,          // tics of anything alight before the call
  sendEvery: 40 * TICRATE,         // between trucks while it is still burning
  cellsPerTruck: 60,               // how much fire one truck is for
  maxTrucks: 4,                    // and never more than this on the scene
  bays: 9,                         // the fire lane, shared with the SWAT
  /* the stand, in the units Responders.chaseStand takes: how far apart
     two trucks park, how far off the road they will drive, and how far
     short of the fire they stop */
  stand: 620, push: 2600, stop: 520,
};

/* The row the rest of the responders' machinery reads a force by. */
const FORCE = { def: { key: 'fire', name: 'the fire brigade', model: 'firetruck', Van: FireTruck }, num: BRIGADE };

export class FireBrigade {
  constructor(game) {
    this.game = game;
    this.alight = 0;             // tics anything has been burning, all told
    this.called = false;
    this.calledAt = -1;
    this.nextAt = -1;
    this.sent = 0;
    this.trucks = [];
    this.force = FORCE;
  }

  /** How much is burning, in cells: the store's, the wood's, and a
   *  vehicle alight counted as a patch of each. */
  get burning() {
    const g = this.game;
    let n = (g.fire?.burningCells || 0) + (g.forest?.burningCells || 0);
    for (const v of g.vehicles?.all || []) if (v.whole && v.burning > 0) n += 12;
    return n;
  }

  get liveTrucks() { return this.trucks.filter(v => v.whole); }

  /** How many trucks this much fire wants on the scene. */
  capFor(cells) { return Math.max(1, Math.min(BRIGADE.maxTrucks, Math.ceil(cells / BRIGADE.cellsPerTruck))); }

  tic() {
    const g = this.game;
    if (!g.firetruck) return;
    const cells = this.burning;
    if (cells > 0) this.alight++;
    if (!this.called) {
      if (this.alight < BRIGADE.callAfter) return;
      this.called = true;
      this.calledAt = g.tics;
      this.nextAt = g.tics;
      g.sound?.play('firehorn', null);
      g.onResponders?.('called', FORCE.def);
    }
    if (g.tics < this.nextAt || cells <= 0) return;
    if (this.liveTrucks.length >= this.capFor(cells)) return;
    if (this.send()) this.nextAt = g.tics + BRIGADE.sendEvery;
    else this.nextAt = g.tics + TICRATE;            // nowhere to stand yet; ask again shortly
  }

  /** The thickest part of what is burning: of a handful of burning
   *  points, the one with the most of the others near it. */
  hotspot() {
    const g = this.game, pts = [];
    const F = g.fire;
    if (F && F.hotCells > 0) {
      const act = F.active, step = Math.max(1, Math.floor(act.length / 48));
      for (let k = 0; k < act.length; k += step) {
        const i = act[k];
        if (F.heat[i] < 40) continue;
        const j = i % F.plane;
        pts.push({ x: F.worldX(j % F.cols), y: F.worldY((j / F.cols) | 0) });
      }
    }
    const W = g.forest;
    if (W && W.burningCells > 0) {
      const out = [];
      const p = g.player || { x: 0, y: 0 };
      W.emitters(p.x, p.y, 1e6, 24, out);
      for (const e of out) pts.push({ x: e.x, y: e.y });
    }
    for (const v of g.vehicles?.all || []) if (v.whole && v.burning > 0) for (let k = 0; k < 4; k++) pts.push({ x: v.x, y: v.y });
    if (!pts.length) return null;
    let best = pts[0], bn = -1;
    for (const a of pts) {
      let n = 0;
      for (const b of pts) if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 < 450 * 450) n++;
      if (n > bn) { bn = n; best = a; }
    }
    return best;
  }

  /** Where the next truck stands, for a fire at `at`. */
  standFor(at) {
    const R = this.game.responders, lv = this.game.level;
    if (!R?.ring) return null;
    const sec = lv.sectorAt(at.x, at.y);
    if (sec && !sec.outdoor) {
      /* INDOORS: the fire lane. A bay first, and when they are gone,
         along the ring by the doors like everybody else. */
      const bay = R.freeBay(FORCE);
      if (bay) return R.bayStand(bay);
      at = R.doorsPoint() || at;
    }
    let best = null, bd = Infinity;
    for (let k = 0; k <= 12; k++) {
      const slot = k === 0 ? 0 : (k & 1 ? (k + 1) >> 1 : -(k >> 1));
      const s = R.chaseStand(at, slot, BRIGADE);
      if (!R.standClear(s, BRIGADE)) continue;
      /* and never ON the fire: a truck parked in it is a second fire */
      if ((this.game.fire?.heatAt(s.x, s.y) || 0) > 0) continue;
      const d = Math.hypot(s.x - at.x, s.y - at.y);
      if (d < bd) { bd = d; best = s; }
      if (bd <= BRIGADE.stop + 36) break;
    }
    return best;
  }

  /** One truck on the road, to the fire. */
  send() {
    const g = this.game, R = g.responders, model = g.firetruck;
    if (!model || !R) return null;
    const at = this.hotspot();
    if (!at) return null;
    const stand = this.standFor(at);
    if (!stand) return null;
    const side = R.sideFor(stand.ring);
    const route = R.routeTo(stand, side, 0, true);
    if (!route) return null;
    const v = new FireTruck(g.vehicles, model.def, model.texture, route);
    v.parkAngle = route[route.length - 1].angle;
    v.stand = stand;
    v.bay = stand.bay || null;
    v.side = side;
    v.force = FORCE;
    g.vehicles.addVehicle(v);
    /* in the responders' list, so a SWAT van does not park on it and
       it does not park on one — but never unloaded: nobody's force
       loop matches FORCE */
    R.vans.push(v);
    this.trucks.push(v);
    this.sent++;
    g.onResponders?.('van', v);
    return v;
  }
}
