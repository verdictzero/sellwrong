/* =====================================================================
   GROCERY STORE SIMULATOR — state tables
   =====================================================================

   Doom's monsters are a linked list of states. Each one says which
   sprite frame to show, how many tics to show it for, one function to
   call the moment it starts, and which state to go to next. That is the
   entire animation system and the entire AI scheduler, and it is the
   reason a Doom monster feels like it has WEIGHT: the thing cannot
   change its mind mid-frame, because the frame owns the next several
   tics and there is nowhere for a change of mind to go.

   Read a run of states out loud and you have the animation:

     RUN: A 4, A 4, B 4, B 4, C 4, C 4, D 4, D 4, back to the start

   Each walk frame is held twice — eight states, four drawings — which
   makes the cycle 32 tics, a bit under a second, which is the pace of a
   walk. A_Chase runs on every one of those eight, so the monster gets
   eight chances a cycle to notice you have moved.

   TIMING IS IN TICS, always. 35 to the second, exactly as Doom.

   WHAT IS IN THE SHOP NOW is not a monster. The staff used to be: two
   of them, the Zombieman and the Imp with the numbers filed off, with
   walk cycles, pain frames, attacks and two ways of dying each. They are
   gone. What stands in the aisles instead is a crowd of SHOPPERS, and a
   shopper has exactly one state and one frame, because a shopper is one
   drawing seen from every side (see js/people.js for why that is the
   right way to use this art rather than a corner cut).

   So most of this file is now fire, fittings and the things a fire
   leaves behind, and the only run of states with any length to it is the
   fireball a person turns into.

   THE MACHINERY UNDER IT IS UNTOUCHED. A_Look, A_Chase and the rest of
   Doom's chase are still in js/actor.js with nothing calling them,
   because the responders in js/responders.js will, and forty lines of
   P_NewChaseDir is not something to delete and write again.
   ===================================================================== */

import { SHOPPERS, SPLATS, BLASTS } from './people.js';
import { FIRE_FRAMES, BLAZE_FRAMES, EMBER_FRAMES } from './fireart.js';
import { TICRATE } from './util.js';

/* Every state: [sprite, frame, tics, action, next]. -1 tics means stay
   here forever, which is what a corpse does. */
export const STATES = {};

function S(name, sprite, frame, tics, action, next, opts = {}) {
  STATES[name] = { name, sprite, frame, tics, action, next, ...opts };
}

/* ---------------------------------------------------------------------
   THE SHOPPERS

   Standing there is the whole animation, and it is one frame held for
   ever. `variants` on the actor turns the sprite name SHOP into SHO0,
   SHO1 ... SHO16 — the same hook the cars will use — so seventeen
   different people share one state and one line of table.

   There is no death sequence because there is nothing left to animate:
   one tic in which A_Gib throws the pieces, and then the actor is gone.

   AND THEY RUN. Standing is A_Watch on an eight-tic clock, which sniffs
   the fire grid round the actor; anything hot near enough and it goes to
   SHOP_RUN, which is A_Flee every three tics until the panic runs out
   and there is nothing hot left nearby. Both states draw the same single
   frame, because there is only one; the difference is entirely that one
   of them moves.
   ------------------------------------------------------------------- */
S('SHOP_STAND',  'SHOP', 'A', 8, 'A_Watch', 'SHOP_STAND2');
S('SHOP_STAND2', 'SHOP', 'A', 8, 'A_Watch', 'SHOP_STAND');
/* Running is the same drawing on a shorter clock. What makes it read as
   running is not the frame, it is that the thing is moving and leaning
   harder while it does — see swayOf in js/people.js. */
S('SHOP_RUN1',   'SHOP', 'A', 3, 'A_Flee', 'SHOP_RUN2');
S('SHOP_RUN2',   'SHOP', 'A', 3, 'A_Flee', 'SHOP_RUN1');

/* AND THEN THERE IS BEING ON FIRE, which is a third way of standing in
   the same drawing and the most useful thing a person in this building
   does.

   Somebody the flame touches used to come apart where they stood: twelve
   health against eight a tic is a person deleted in the first tenth of a
   second, and what the fire got out of it was thirteen pieces thrown a
   couple of aisles and a pool of heat where they had been. At the user's
   request they now RUN — alight, for several seconds, dropping fire the
   whole way — and go off wherever they get to.

   That is not a death animation, it is a DELIVERY MECHANISM. A fire
   spreads at a cell every second or so through bare lino; a burning
   shopper covers eight units a tic in a straight line towards a door
   they are never going to reach, through the cross-aisles the fire
   cannot cross by itself, and then explodes in the middle of whatever is
   on the other side. Set light to the queue at the tills and the back of
   the store is alight in twenty seconds — not because the fire travelled
   but because the people did.

   Two tics a frame rather than three, so somebody alight outruns
   somebody merely frightened. A_Torch does the rest: it tops the panic
   up (nobody calms down while they are burning), and it counts down to
   the bang. Fullbright, because they are lit by the fire on them and
   that is what makes one legible across a dark shop. */
S('SHOP_BURN1',  'SHOP', 'A', 2, 'A_Torch', 'SHOP_BURN2', { fullbright: true });
S('SHOP_BURN2',  'SHOP', 'A', 2, 'A_Torch', 'SHOP_BURN1', { fullbright: true });
S('SHOP_GIB',    'SHOP', 'A', 1, 'A_Gib', null);      // null next: remove me

/* ---------------------------------------------------------------------
   Things that are not monsters
   ------------------------------------------------------------------- */
S('TRLY_STAND',  'TRLY', 'A', -1, null, null);
S('BOLL_STAND',  'BOLL', 'A', -1, null, null);
S('GCAN_STAND',  'GCAN', 'A', -1, null, null);
S('CRAT_STAND',  'CRAT', 'A', -1, null, null);
/* What is left where somebody was. Three paintings, picked per actor
   the same way the shoppers are, so a floor covered in these does not
   read as one stamp repeated. */
S('BLUD_REST',   'BLUD', 'A', -1, null, null);

/* THE LIGHTS HAVE NO STATES, because they have no sprite. There were
   ten of them here — lit, burst, dead for ever, one tube gone, and a
   ring of six that a dying ballast stuttered round — and the fitting
   they all drew is painted into the ceiling now (T.CEILFIT). A light in
   this game is a source and a target and nothing you can see, so the
   only trace of one going out is the sparks below it and the aisle
   above going dark. See ACTORS.LAMP at the bottom of this file. */
S('SPARK1', 'SPRK', 'A', 3, null, 'SPARK2');
S('SPARK2', 'SPRK', 'B', 3, null, 'SPARK3');
S('SPARK3', 'SPRK', 'C', 4, null, null);

/* The flame that sits on something burning. Loops for ever; the fire
   system removes it when the fuel runs out. The lengths come from
   js/fireart.js, which draws the frames — a chain shorter than the set
   it plays would simply never show the rest of them, and one longer
   would ask the bank for a letter nobody drew. */
const chain = (name, frames, tics) =>
  Array.from({ length: frames }, (_, i) =>
    S(`${name}${i + 1}`, name, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[i], tics, null,
      `${name}${(i + 1) % frames + 1}`, { fullbright: true }));
chain('FIRE', FIRE_FRAMES, 2);
chain('BLAZ', BLAZE_FRAMES, 2);
chain('EMBR', EMBER_FRAMES, 3);

/* THE FIREBALL a person becomes. Twenty-six frames at a tic each is
   three quarters of a second: a flash at the floor, a column of fire up
   past head height, and then eight frames of it going to smoke and
   coming apart. It is the longest animation in the game and the only one
   that is worth watching. */
const BLAST_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.slice(0, BLASTS);
[...BLAST_LETTERS].forEach((L, i, arr) =>
  S(`BLAST${i + 1}`, 'BLST', L, 1, null,
    i === arr.length - 1 ? null : `BLAST${i + 2}`, { fullbright: true }));

/* Blood in the air, which then is not. */
S('PUFF1', 'PUFF', 'A', 4, null, 'PUFF2');
S('PUFF2', 'PUFF', 'B', 4, null, 'PUFF3');
S('PUFF3', 'PUFF', 'C', 4, null, null);      // null next = remove me

/* =====================================================================
   Actor types

   Doom's mobjinfo, minus the fields nothing here uses. Health, speed and
   painchance are the three that decide how a monster feels, and they are
   Doom's numbers because Doom's numbers are correct.
   ===================================================================== */
export const ACTORS = {
  /* A SHOPPER. Twelve health, which is less than one tic of the
     flamethrower delivers, so anything you point the stream at comes
     apart at once — the weapon is the verb and there is no wrestling
     with a health bar. Solid, so a crowd is something you have to get
     through; flammable, so a fire that reaches one takes it; and worth
     ninety of fuel to the floor underneath, because a person on fire in
     an aisle is how the aisle catches.

     No speed, no sight range, no attack: they are not fighting you. The
     things that will fight you come up the road later. */
  SHOPPER: {
    name: 'Shopper', spawn: 'SHOP_STAND', see: 'SHOP_RUN1', death: 'SHOP_GIB',
    health: 12, radius: 18, height: 56, mass: 100, painchance: 0,
    /* Sixteen units a call at three tics a call: faster than a Doom
       zombie and slower than you, so a crowd that has decided to leave
       is something you have to get in front of rather than something you
       can walk after. */
    speed: 16,
    monster: true, flammable: true, fuel: 90, painSound: 'shopper',
    /* WHAT CATCHING FIRE DOES TO ONE. `burn` is the state they go to the
       moment they are alight, and `burnTics` is how long they have: three
       and a half to seven seconds of running before they go off, rolled
       per person so a queue that catches together does not pop together.

       The range is the whole of the feel. Under two seconds and it reads
       as a delayed death rather than as somebody on fire; over ten and
       the shop fills up with torches that never resolve and the player
       stops watching any of them. Three to seven is about the length of
       an aisle at a panicked run, which is the distance that makes the
       mechanic mean something. */
    burn: 'SHOP_BURN1', burnTics: [3.5 * TICRATE, 7 * TICRATE],
    /* AND WHAT THEY LEAVE BEHIND THEM. A drop every eight tics at eight
       units a tic is a line of fire with sixty-four-unit steps in it,
       which on a thirty-two-unit grid is two cells lit and one skipped —
       near enough continuous that the fire behind them joins up.

       burnFuel is FOURTEEN and the number is chosen against a threshold
       rather than by feel: a cell that is ignited starts at 55 heat plus
       the strength, js/fire.js lights anything standing in a cell above
       70, and 55 + 14 is 69. So the trail starts a FIRE and does not
       itself set light to the person it is running past — that cell
       climbs over the threshold a fire tic or two later, by which time
       the runner is fifty units away and whoever catches, catches off
       the floor like everybody else. One below the line, deliberately:
       a trail that lights bystanders directly turns a crowd into a
       chain reaction with nothing in between.

       burnRadius is ONE, meaning the cell they are standing in and not
       the ninety-six-unit square the default lights. A person is a
       person wide. */
    burnTrail: 8, burnFuel: 14, burnRadius: 1,
    /* and how far the sight of them clears. Less than the nine hundred
       a fireball clears, more than the three hundred and twenty a fire
       is noticed at: somebody alight coming down the aisle is worse news
       than the fire they came from and better news than the bang. */
    burnScare: 520,
    /* how far a fire has to be before it is somebody else's problem, and
       how long a fright lasts once nothing is chasing it */
    scareRange: 320, panicTics: 8 * TICRATE,
    variants: SHOPPERS,
    /* one drawing, so every side of them is the front */
    flat: true,
    /* and it leans where it stands — see swayOf in js/people.js */
    sway: true,
  },

  /* Scenery. Solid, mostly, and most of it burns. */
  TROLLEY: { name: 'Trolley', spawn: 'TRLY_STAND', radius: 16, height: 44, solid: true, pushable: true },
  BOLLARD: { name: 'Bollard', spawn: 'BOLL_STAND', radius: 10, height: 42, solid: true },
  FUELCAN: { name: 'Fuel can', spawn: 'GCAN_STAND', radius: 12, height: 38, solid: false,
             shootable: true, health: 1, flammable: true, fuel: 400, explodes: true, pickup: 'fuel' },
  CRATE:   { name: 'Stock',   spawn: 'CRAT_STAND', radius: 20, height: 58, solid: true,
             shootable: true, health: 40, flammable: true, fuel: 300 },

  /* A FITTING, WHICH DRAWS NOTHING. The picture of it is painted into
     the ceiling by T.CEILFIT — one per 256-unit tile, on this grid and
     at this offset — so what is left here is the part paint cannot do:
     a position for Game.relight to light the shop from, and a box for
     the fire and for a shot to hit. No spawn state and no death state,
     which makes it the second thing in the game with neither.

     Not solid — you walk under it — but shootable, and the fire reaches
     it too: the burn check is two-dimensional, so anything alight on
     the floor below will eventually take out the light above it, which
     is exactly right. It does not itself burn.

     WHAT A DEAD LIGHT LOOKS LIKE is the sector it was lighting going
     dark, which is baked by relight the moment it dies (see
     Game.onLampDestroyed, which also throws the sparks). The painted
     fitting goes dark with it, because a flat is lit by its sector's
     own light level like everything else — so the old objection to
     painting a light into a ceiling, that it stays lit after you have
     broken it, is answered by the renderer rather than by a sprite. */
  LAMP:    { name: 'Light', radius: 26, height: 14, health: 10,
             shootable: true, solid: false, flammable: false, hangBelow: 34 },

  FIRE:    { name: 'Fire',    spawn: 'FIRE1', radius: 12, height: 48, noclip: true, fullbright: true },
  BLAZE:   { name: 'Blaze',   spawn: 'BLAZ1', radius: 20, height: 80, noclip: true, fullbright: true },
  EMBER:   { name: 'Ember',   spawn: 'EMBR1', radius: 8,  height: 24, noclip: true, fullbright: true },
  PUFF:    { name: 'Blood',   spawn: 'PUFF1', radius: 4,  height: 8,  noclip: true },
  GORE:    { name: 'Gore',    spawn: 'BLUD_REST', radius: 4, height: 2, noclip: true, flat: true,
             variants: SPLATS },
  BLAST:   { name: 'Fireball', spawn: 'BLAST1', radius: 8, height: 96, noclip: true,
             flat: true, fullbright: true },

  /* A PARKED VEHICLE, one of the two things in the game with no state
     and no sprite — the other is the light above, for the opposite
     reason: a van is drawn by something that is not the sprite bank, a
     light is drawn by the ceiling it is in. js/car.js draws it — nine boxes with an orthographic
     turnaround projected onto them — and this is here for the part of a
     van you cannot walk through. Doom's things are cylinders, so a van
     is three of these in a row; see carBlockers().

     No `spawn`, so no state, so Actor.render and Actor.tic both fall out
     on their first line. The alternative was a one-frame sprite that
     never gets drawn, which is a lie in the sprite bank and an entry in
     every table that walks it.

     Shootable and flammable, but the health here is a number nothing
     ever reaches: a blocker carries a pointer to its vehicle and hands
     everything done to it straight over, so the vehicle's own hundred
     and fifty is what decides when it goes up. Radius and height come
     from the vehicle too — see the note in Actor's constructor — because
     a hatchback and an APC are not the same cylinder. */
  CARBODY: { name: 'Vehicle', radius: 38, height: 86, solid: true,
             shootable: true, flammable: true, health: 100000 },
};

export function stateOf(name) {
  const s = STATES[name];
  if (!s) console.warn('missing state:', name);
  return s || null;
}
