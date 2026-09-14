GROCERY STORE SIMULATOR
=======================

A Doom-style game in which you walk into a supermarket at night with a
flamethrower and burn it down. Then the forest it stands in.

The store is SellWrong, the anchor of a strip mall — one long shed cut
into tenancies, with the big one in the middle paying most of the rent
and ten small ones either side hanging on. Four of them have a name on
the fascia and the rest never did. Seven of them you can walk into. All
of them burn. Round the lot is a perimeter road, and round the whole
parade, for nine thousand units in every direction, is a wood of fifty
thousand firs and bushes, and that burns too.

Open index.html in a browser. No install, no build step. Every texture,
every sprite, every sound and the whole level are generated in the page
at start-up, in about half a second. What it loads is what was made
somewhere else: the people, the trees, the sky, and the gun.

  .gitlab-ci.yml        test, then publish to GitLab Pages
  .github/workflows/    the same two jobs, for GitHub Pages
  index.html            the page
  css/style.css         the furniture around the frame, and the thumb controls
  manifest.webmanifest  what a phone calls it when it is added to a home screen
  icon.png              and what it draws there — node tools/bake-icons.mjs
  vendor/three.module.js  three r160, local so the game runs off a memory stick
  js/                   the game — js/ruin.js is the newest of it: the
                          steel frame a burnt-out roof leaves behind
  art/                  the logo, the old sprite weapon, the seven four-view
                          vehicle sheets and the atlas packed out of them —
                          which nothing loads any more — and art/people/,
                          the SWAT sheet and the army sheet as the user
                          drew them
  assets/people/        the crowd, and what is left of one: seventeen
                          shoppers, eleven pieces, three splats, a fireball;
                          the squad, fifty-one cells of SWAT; and the army,
                          fifty-one cells cut the same way
  assets/forest/        the wood: ten plants with their burn maps, two grounds
  assets/sky/night.png  the night, baked from a Polyhaven panorama
  assets/models/        the flamethrower, the fire extinguisher rifle and
                          the cerebral bore, all three Vaportrash's and all
                          three stripped by tools/prep-model.mjs; the
                          minigun, the user's own, stripped by the same tool
                          with its emission marker read into the file's
                          extras and its barrel set named there; the van,
                          the police van and the army's hover APC, which
                          are the user's three — the APC stripped by the
                          same tool, two megabytes of normal and
                          metal-rough off a renderer that has no lighting
                          model to spend them on
  assets/fonts/         Michroma (SIL OFL), the title face
  assets/music/         the user's three E1M1 remixes, mixed on the beat
                          by js/music.js
  tools/bake-art.mjs    node tools/bake-art.mjs — turns art/ into source
  tools/prep-people.mjs the crowd's art, crunched down from galvarius
  tools/prep-troops.mjs a troops sheet — the SWAT's or the army's — found
                          cell by cell and cut into a strip
  tools/prep-forest.sh  copies the wood's art over from the golf project
  tools/bake-sky.mjs    the sky: 8k panorama to 1024 palette pixels
  tools/prep-model.mjs  a .glb down to what this renderer binds: the colour
                          map, four attributes, one tight view an accessor
                          — and marker spheres out of the mesh and into
                          the file's extras, for a model that has them
  tools/build-site.sh   assembles public/ — what actually gets published
  tools/bake-icons.mjs  the home-screen icon, out of the game's own fire
  tools/smoke-test.mjs  node tools/smoke-test.mjs — no install, no browser


DEPLOYING
---------

It is a static site with no build step, so publishing it is a copy. What
gets copied is not the whole repository: the untouched Freedoom frames
the apron is painted over, the source PNGs for art already baked into
js/art-data.js, the tools and this file are all repository, not site.
tools/build-site.sh is the one definition of the difference, and both CI
files call it rather than each keeping a list that can drift. The smoke
test assembles the site the same way into a scratch directory and checks
that every asset path the page's own source loads is in it, so a copy
that leaves something out fails the test rather than the live game.

The repository setting has to agree with all this: Settings > Pages >
Source must be GitHub Actions. Set to deploy from a branch instead,
GitHub builds the branch with Jekyll and publishes the whole tree, this
file and the tools included, over the top of the artifact the workflow
uploaded — the site works, but it is not the site the script defines.

Both pipelines run the same two checks first, and the deploy DEPENDS on
them rather than merely following them — a broken build that reaches the
URL is worse than no deploy, because nobody files a bug against a game,
they close the tab.

  the smoke test         976 checks, no install and no browser
  art is in step         re-bakes art/ and fails if js/art-data.js moved

That second one exists because baking the logo and the weapon into source
by hand is what buys the no-build-step property, and a hand-run step is
only safe if something notices when it has not been run. Otherwise a
re-exported logo sits in the repo looking authoritative while the game
goes on drawing the old one.

There is no npm install anywhere on purpose: the smoke test stubs three.js
itself and nothing else in the repo has a dependency, so a pipeline is one
container pull and about a second of work.


WHAT YOU DO
-----------

You start at the mouth of the car park at night, across the road from it. The
parade is in front of you, the automatic doors open when you get near them,
and the night crew are still inside.

There is no goal. Burn what you like — the store, the wood behind it,
both — and see what the night brings down the road. The sixty-per-cent
target and the run back to the car park are gone, at the user's request:
the only aim for now is open mayhem, and the night ends when you close
the tab.

There are seven hundred and thirty-six people in the shop and six fire
exits for them to get out of, so the shop empties: light one aisle and
most of the building is in the car park or in the trees inside a minute.

THE CORNER IS TWO BARS UNTIL SOMETHING HURTS YOU, at the user's request.
It used
to be four numbers — how much of the store had gone, how much of the
wood, how many were left, how much was in the tank — with a running list
of notifications under them, and all of the words are gone. What is left
is the two gauges that were already drawn under the numbers: the store
burning, in fire colours, and whatever is in the thing you are holding.
The count of the living went with the text and went on purpose; a bar
cannot say a number and the shop on fire in front of you was always the
better readout anyway. From the first hit it is five: the two gauges and
the three layers of you — see AND YOU CAN BE HURT NOW.

  WASD          move            MOUSE     look
  SHIFT         run             LMB/CTRL  fire
  SPACE         jump            WHEEL     cycle weapons
  F             open, use
  1 2 3 4       flamer / extinguisher / bore / minigun
  [  ]          render size     SHIFT [ ] pixel size
  N             palette on / off          ESC       pause
  `             the frame-rate readout, off by default

GAMEPAD, laid out the way the user asked for it, which is not the way
most games do it and is the whole point of a preference:

  LEFT STICK    look            RIGHT STICK  move
  R2            fire            L2           jump
  L1 / R1       previous / next weapon
  A             use             L3 / R3      run

And a pad in use takes the phone's thumb controls off the picture — see
ON A PHONE. Mouse look needs a click to grab the pointer. On a phone
none of the keyboard applies and the next section is the one that does.

THERE IS MUSIC, at the user's request: the user's three E1M1 remixes
(assets/music/, four files arrived and two were the same file byte
for byte), one into the next into the next and round again for ever,
each fading into the one after it ON THE BEAT. Nothing is analysed
while the game runs: each track was measured once, offline, in the
same decoder the browser uses — tempo to a hundredth, the downbeat at
the head, a downbeat in the last forty seconds to hand over on — and
the answers are a table at the top of js/music.js. On the outgoing
track's handover downbeat the incoming's first downbeat lands, both
gains ramp LINEARLY over eight bars, one up and one down, and the
outgoing stops. And the incoming arrives at the OUTGOING'S TEMPO —
the three are 145.8, 140.3 and 142.3, and a fade between grids four
per cent apart flams by a quarter of a beat before it is half done —
with its playback rate set to the ratio, so its bars are the other's
bars for as long as both can be heard, and then eased back to one
over eight more bars, which is a DJ's pitch fader going home. All of
it is Web Audio's own clock, sample accurate. A MUSIC fader is in the
pause menu and remembered; the music has its own context, so the
switch below does not take it.

AND THE SOUND IS OFF, all of it, for now, at the user's request: MUTED
at the top of js/audio.js is one switch, and with it on resume() never
opens an AudioContext, so every sound in the game is still asked for
and none of them is made. Flip it and they are all back.

THE LOADING SCREEN SAYS RETICULATING SPLINES, at the user's request, and
nothing else, for the whole of the half second; the bar still moves.
And nothing is written across the middle of the picture any more — the
SIRENS and THE ARMY IS ON THE ROAD cards that used to announce a convoy
are gone, at the user's request. The siren says it. The one card left
is the one that ends the night.

One weapon, and it is a flamethrower: a STREAM. Hold the trigger and
six fireballs a tic leave the nozzle at a thousand units a second, in a
line rather than a string of beads, slow in the air, drop, and set fire
to whatever they land on — seven hundred units of reach, on the floor
about four hundred out if you fire level, further if you lift it. Drawn
additively, so where they overlap they add up to a white-hot core and
the whole arc reads as one unbroken tongue. It goes where you point it
and no further, which is the whole feel of the thing.

THE TANK EMPTIES, at the user's request, and nothing in the shop refills
it. It holds twelve seconds of flame with the trigger held down, and it
fills itself at one unit every ten tics — a full tank in two minutes. So
a second of firing costs ten seconds of walking, and the honest way to
play is short bursts a long way apart. The forty-two fuel cans that used
to be laid out over the shop floor are gone with it: a can on the floor
and a tank that regenerates are two answers to the same question, and
having both means the regeneration never matters.

AND IT WILL NOT LIGHT AGAIN UNTIL IT IS HALF FULL, which is the knob that
turns that budget into a decision. A tank that refuses only when it is
empty is a tank you hold the trigger on until it stops and then hold it
again the moment one unit has trickled back: twelve seconds of flame
becomes twelve seconds and then a stutter of tenths, and the ten-seconds
of-walking-per-second-of-flame arithmetic never actually bites. A tank
that will not light below half is a tank you have to WALK AWAY FROM for a
full minute — and that minute is the one the fire you have already set
does its own work in. It latches on empty and clears at half, so the
gauge only ever has two things to say, and while it is latched the fuel
percentage on the status bar is replaced by the mark it is climbing to
with a pip on the bar where that is.

THE BOXCUTTER IS GONE, deleted at the user's request, and the third
weapon is the CEREBRAL BORE — see THE CEREBRAL BORE below — and the
fourth is THE MINIGUN, see the section of that name. Mouse wheel, or
1, 2, 3, 4. The molotov is written, tested and still switched off. The
player cannot be hurt BY FIRE — that is one flag at the top of js/player.js, FIREPROOF, and it
used to be the whole of the player's invulnerability. A bullet gets
through it now, because there are bullets: see THE ROAD, AND WHO COMES
DOWN IT.

AND THERE ARE TWO SWITCHES IN THE PAUSE MENU THAT TURN ALL OF THAT OFF.
DEBUG: INFINITE AMMO fills every tank — the flamethrower's, the
extinguisher's and the molotovs — back to the top once a tic, so nothing
ever empties and neither latch ever catches. It is for looking at the
place rather than for playing it: with the fire as slow as it now is,
walking the whole shop to see what it looks like burnt should not also
be a two-minute wait every twelve seconds.

DEBUG: INVINCIBLE is the other one, at the user's request, and it is the
same shape: one branch, at the top of Player.damage, which returns. Every
way the player can be hurt arrives there — the rifles, the vans, the fire
FIREPROOF already refuses — and the only way out of the level dead is the
health check at the bottom of that same function, so refusing it is the
whole feature and nothing else in the game knows the mode is there. It
takes the SHOVE with it, because being knocked sideways by a van is part
of being hit by one. And it is NOT a heal: turn it on at forty health and
you stay at forty for ever, which is the honest reading of the word and
keeps one switch from quietly being two. It is what makes the squad
watchable — nine vans and eighty troopers is a fight you lose in about
fifteen seconds, and looking at it is a different job from surviving it.

INFINITE AMMO IS ONE BRANCH, in Player.fuelTic, and that is deliberate.
Everything that asks a question about ammunition — whether the trigger works,
whether the gauge is red, where the refire pip sits, whether the gun is
latched — reads the tank, and the refill runs once a tic upstream of all
of them. So the spending still happens exactly as it always did and is
simply undone before anybody looks, and not one line anywhere else in
the game knows the mode exists.


AND THE OTHER END OF IT
-----------------------

THE SECOND WEAPON IS A FIRE EXTINGUISHER, at the user's request, and it
is a rifle built out of one — somebody else's model, dropped in as it
stands the way the van was. Slot 2. It is the same KIND of thing as the
flamethrower, deliberately: a stream, billed per tic of pour, on its own
tank with its own latch, so the two are held the same way and used
against each other.

WHAT IT OBVIOUSLY DOES is put fires out. The jet takes heat out of the
fuel grid where it lands and out of the wood if it lands there, and it
clears the ember clock with it — the difference between a fire that is
out and a fire that is sulking, because a cell left at a glow relights
anything that wanders past. It is a shorter arm than the flamethrower,
four hundred units against seven hundred, and it sinks harder: cold gas
is heavier than the air it is in, so the jet pools along the floor where
it lands, which is where the fire is.

WHAT IT CANNOT DO IS UNDO ANYTHING. Fuel that has burned is burned, the
store's percentage never goes backwards, and a charred aisle stays
charred. So it is not an undo button, it is a firebreak you can draw
with, and the thing it saves is whatever has not caught yet.

AND IT FREEZES PEOPLE. Enough gas on one and they go solid: a blue
statue that stops running, stops burning if they were burning, and
BLOCKS THE AISLE for everybody behind them. Three things can then happen
and the player picks:

  leave them    the frost bleeds off over about seventeen seconds and
                they thaw, get up and run — which is the outcome that
                makes freezing somebody a decision rather than a slower
                way of killing them
  burn them     fire on ice is an execution. They stay exactly where
                they are, an ember front eats the drawing from the feet
                up, and about three and a half seconds later there is a
                heap of ash on the lino. A fire anywhere near their feet
                does it as well as a direct hit — it reads the heat of
                the CELL they are standing in, so a store that is
                burning does this to its own frozen people as it goes
  break them    anything at all that hits a frozen person shatters
                them, whole, into bloody frozen chunks

AND NOTHING ELSE GETS THEM OUT OF IT, which is what makes that a list of
three rather than a list of three plus whatever happens to go off nearby.
Being frozen is a HOLD, and so is being eaten: for as long as either one
lasts, every system in the game that makes people react is refused. A car going up forty units away,
the noise of the player's own trigger, a neighbour sprinting past — all of
them used to reach past the ice and set a block of it running, still
solid, still blue, with ninety of its hundred frost still on. The lock is
one line in Actor.setState, which is the single door all of them came
through, and the two functions allowed to overrule it are the two that
own the ice. A fright that arrives while somebody is held is dropped
rather than queued, and a fresh one is handed to them on the way out —
what you should run from is what is there NOW.

THE TWO WEAPONS TOGETHER ARE A THIRD THING, which is the point of the
second one. Fire used to MELT a frozen shopper free and set them running,
which made the flamethrower the undo button for the extinguisher: a
player could spoil their own freeze by sweeping the aisle a moment later.
Turned round, the pair are a combination — freeze one, burn them, and
they are gone where they stood. No fireball, no thirteen pieces two
aisles over, nobody else running. With the shatter that is two quiet ways
of emptying an aisle, and quiet is the thing the flamethrower alone can
never be.

AND YOU WATCH IT HAPPEN, which is the other half. Nothing else in this
game kills a person slowly enough to look at: a shopper the stream
touches runs for five seconds and explodes, and a frozen one hit with
anything solid is thirteen pieces in a single frame. This one takes three
and a half seconds and the whole of it is on the drawing — a line of
coals crossing them from the feet up, the coat and the shape going with
it, the body settling as its legs stop being there, and a heap of ash and
a few embers left on the floor. It is done in the sprite shader rather
than in art, because seventeen shoppers times an animation of a person
burning away is art nobody is going to draw, and because the drawing
being EATEN — their own coat, their own silhouette — is what makes it
read as that person rather than as an effect played over them.

ONE RULE, HOWEVER THE FIRE ARRIVES. A flame particle, a car going up
beside them, or simply the floor they are standing on being alight: all
three do the same thing. That took a fix — the fire system lights
anything standing in a cell over 70 of 255 and the thaw was reading heat
from a fifth of that, so there was a window in which a block of ice at
the EDGE of a fire melted free while one in the middle of it was eaten.

THE COLOUR IS A MAP AND NOT A TINT, which is the difference between
somebody frozen and somebody with a blue light on them. Multiplying a
red coat by blue gives a dark muddy coat; what a person inside a block of
ice looks like is their SHAPE in ice. So the texel's luminance is kept,
everything else is thrown away, and that one number runs up a ramp from a
deep shadowed blue to a pale lit one — a red coat and a green coat come
out as the same ice at different brightnesses, which is exactly right.

SHATTERING IS QUIET, and that is the mechanic rather than an oversight.
A person going off in flames is an explosion: a fireball, heat into the
floor, and everybody within nine hundred units running. A person
shattering is a crack and a scatter, and the shopper four feet away
carries on looking at the beans. A player who wants to clear an aisle
without starting a stampede now has a way to do it, and it is the only
way there is.

THE TWO TANKS ARE NOT THE SAME TANK. The flamethrower holds twelve
seconds and fills in two minutes, because fire is the thing the game is
about and should be rationed. The extinguisher holds seven and a half
and fills in thirty, and comes back at a third rather than a half,
because putting a fire out is defensive, is usually done under time
pressure, and an extinguisher that is empty when the aisle you wanted is
alight is a weapon that exists to disappoint.

AND THERE IS A HOOK FOR A WEAPON THAT DOES NOT EXIST. Something physical
is coming — a bat, a hammer, whatever it turns out to be — and the half
of a weapon that is hard is not the art, it is the question of what a
swing MEANS to the rest of the game. Game.impact is the answer, written
and measured ahead of the thing that will call it: a short reach, a wide
arc, the nearest thing in it, and a DIRECTION. That last one is the new
part. The shatter itself needed nothing — a blow on a frozen person was
already a shatter, because everything that is not fire is — but the
pieces now go the way the blow went, in a sixty-degree cone either side
of it and harder the heavier the swing, which is the difference between
being hit and coming apart on your own. It hits people who are not
frozen too, as ordinary damage, because breaking is a property of the
ICE and not of the weapon. It does not push anybody: actors in this game
have no momentum, they move a whole step or none of it, and knocking a
shopper across an aisle would be a physics system rather than a
parameter. When the weapon arrives it is an animation, a table entry and
one call.

THE BOXCUTTER USED TO SWING THROUGH IT and is deleted; the hook stays,
and the smoke test swings through it directly so it is not rotting while
it waits — a blow with a direction on it through a block of ice throws
the pieces down the aisle in front of you instead of dropping them in a
ring.


THE CEREBRAL BORE
-----------------

TUROK 2'S, at the user's request, and the user's model: assets/models/
bore.glb, stripped of the normal and metal-rough maps by
tools/prep-model.mjs the way the flamethrower was — half of what it
weighed — and held low and right like the other two, a third smaller
and a third farther from the eye than they are (at the user's request:
it is a big square thing and at the flamethrower's size it was a
quarter of the picture). Both numbers are the gun's own in GUNS rather
than a change to VIEW, and "farther" is a push straight back along the
view, z alone — the first try scaled the whole position along the line
from the eye, which keeps a point's place on screen and did, for the
gun's centre, which is below the bottom of the frame by design, so the
launcher shrank around a point nobody can see and all but left the
picture; see WHAT WENT WRONG. It is the one weapon in the game that is
AIMED rather than poured, and the rules are Turok's; js/bore.js is the
whole of it.

THE SIGHT. Every tic the bore is in hand a ray goes out of the eye along
the view, pitch and all — the flamethrower's aim never needed the pitch;
this one stops at the floor when you look at your feet — to the first
wall or the first body. A red line is drawn from the mouth of the
launcher to that point and a dot put on it. When the point is a person
the dot becomes a reticle on their head and you are LOCKED: a beep, and
the reticle stays with the head for fourteen tics after the beam leaves
it, because a sight that drops the lock the instant you twitch is a
sight you fight rather than use. Anyone alive and shootable with a head
can be locked — the crowd, the squad, a block of ice with somebody in it
— and not a van.

THE TRIGGER DOES NOTHING WITHOUT A LOCK. That is Turok's rule and the
whole feel of the thing: it is not a gun you point, it is a gun you wait
with. The refusal clicks, once a press, because a trigger that does
nothing at all is a trigger you press harder. Five in the magazine and
one back every twelve seconds — the slowest thing in the game to refill,
because it is the only thing that never misses: a lock is a kill, so what
the magazine rations is kills.

THE FLIGHT. The bore leaves the launcher along the line of sight, slowly,
and every tic bends toward the head it was sent to by at most nine
degrees while it speeds up threefold — so it leaves in a curve and
arrives fast, which is the shape of the thing in the original. It stops
for walls, floors, ceilings and the target's head and nothing else; a
target that dies on the way is a target it flies straight past and rings
off a wall.

THE DRILL is the third HOLD, after the ice and the burn-away (see
Actor.held): two seconds of standing exactly where they were, shaking —
a drawing offset, fresh every frame, a fit rather than a sway — while
the bore sits in the skull turning and what was in there comes out of
the top in a fountain. The fountain is the crowd's own gore pieces at
half size and a fifth of the speed, carrying a flag that says they were
never alight, so they trail no fire and land as blood rather than
sparks; and a red mist over it out of the smoke pool. Nothing scares
them, nothing hurries it. A block of ice the bore reaches shatters
instead; somebody half ash is finished.

AND THEN THEY EXPLODE — the same coming-apart the flamethrower gets, the
fireball and the thirteen pieces for a shopper and the gore animation
for a trooper, because "explode" already means one thing in this game
and the bore should not teach it a second one. The kill is the player's,
and a kill is what calls the SWAT.


THE MINIGUN
-----------

THE FOURTH WEAPON, at the user's request, and the user's own model:
assets/models/minigun.glb, twelve and a half megabytes as it arrived
and seven and a half after tools/prep-model.mjs took the normal and
metal-rough maps off it. Slot 4, or the wheel, or SWAP. And it is the
first model since the old flamethrower to carry its own answers, in
its own node names: a marker cylinder named for the emission point,
which the tool takes out of the mesh and writes into the file's extras
as the nozzle (through the node's own scale, quarter-turn and
translation, because the cylinder sits thirty units up its own node's
y), and a barrel set named to be ROTATED, which the tool leaves in and
names in the same place. js/weapon3d.js reads both back: the nozzle is
where the muzzle flash sits and the rounds are born, and the barrel
set turns about its own z.

ABSURDLY DESTRUCTIVE, which was the specification. Four rounds a tic
out of a belt of three thousand — a hundred and forty a second for
twenty-one seconds with the trigger down — each one a hitscan of
twenty-four to forty-eight, which is two to four times a shopper and
enough of them, in a burst, to open a van. It goes where the eye
looks, PITCH AND ALL: Game.hitscan grew a pitch for it, since a rifle
that fires level was fine for a trooper and is not fine for a gun you
point at the floor of the car park. The belt fills itself a round a
tic and latches at a quarter, on the tanks' terms and for the tanks'
reason. Infinite ammo fills it like the rest.

AND IT SPINS UP, a third of a second from the trigger going down to
the first round, and eight tenths to stop after it comes up — the
barrel set on the model turns to match, and js/audio.js has a sawtooth
for each direction. A dry belt does not spin, because a spin that
leads to nothing is a promise the gun cannot keep. AND IT HEATS: four
seconds of fire takes the barrel material from cold to the yellow-white
of steel that should have stopped, dull red first from the muzzle
back, then orange, then white; seven seconds of not firing brings it
back. It is one uniform on the one material the barrels wear, banded
like the rest of the gun's light, and nothing else happens at the top
— the glow is the whole of it, at the user's request — but the gun
tells you how long you have been holding the trigger, which a belt
gauge in a corner only says in a corner.

WHERE IT SITS WAS DRAWN UP SIX WAYS BEFORE ONE WAS PICKED, at the
user's request, off the same scene the game draws. The model's own
centre is well back in its body, so held close (like the flamethrower
used to be) everything but the barrels drops off the bottom of the
picture; held dead centre at the hip it is a grey tube; held out far
enough to see the whole thing it is a toy. The user picked the CORNER:
GUNS.MINIGUN in js/weapon3d.js holds it on VIEW's own hold like the
streams, a quarter longer than the flamethrower and a little nearer,
so the receiver fills the corner and the barrel set comes in across
the lower right quarter of the picture, the way the old flamethrower
did. The other five are the same two numbers (fit, out) plus an offset
(pos) and a turn (rot), and any of them is a one-line change.

THE HUD SAYS WHAT YOU ARE HOLDING, small, top right, at the user's
request — the one word the readout has grown back since the corner
went to bars. Four weapons that all cycle off one button on a phone is
one too many to keep track of by the shape of the barrel.


THE JUMP, AND BEING HIT BY A VAN
--------------------------------

THE PLAYER CAN JUMP, at the user's request, which is the end of the
line at the top of js/player.js that said NO GRAVITY, NO JUMPING — and
it is done the way a Doom port does it rather than a physics engine:
a vertical momentum, a gravity of a unit a tic off it, and a floor
that stops it. Nine units of push is forty of height, enough to clear
a shelf end or a bonnet and not a gondola. A step up or down within
twenty-four is still instant, like Doom; a drop deeper than a step is
a FALL now, on the same gravity, which is what makes a jump off the
loading dock feel like one; a hard landing dips the eye by a share of
the speed it arrived at and the view's own smoothing brings it back.
The ceiling stops a jump the way the floor stops a fall. Space, L2 or
the JUMP button, one jump per press — holding it is not a pogo stick.

AND A VEHICLE THROWS YOU, at the user's request, instead of the six
units of sideways shove a hit used to be. SwatVan.runOver (the APC
inherits it) works a velocity out of how fast it was going — along its
heading blended with the line from its nose to you, so a square hit
throws you down the road and a glancing one throws you off it — and
UP, in proportion, so a van at speed puts you in the air and the
gravity above brings you down somewhere else. Player.damage spends it
(opts.launch), and thirty tics of grace on the player stop the same
nose finding you again every tic while you are still in front of it,
which is what it used to do at a shove's worth of push: the hit is one
hit now, at forty, rather than twenty-eight every tic for as long as
you overlapped. DEBUG: INVINCIBLE still refuses the whole function,
launch included, which is the documented reading of the word.


BRIGHTNESS, CONTRAST, GAMMA
---------------------------

THREE SLIDERS IN THE PAUSE MENU, at the user's request, and they are
applied in the one place in the pipeline where they are honest: after
the block average and BEFORE the dither and the palette snap. Doom's
own gamma keys worked that way — they changed the palette the picture
was quantised to, not the picture after — and the reason still holds:
a brighter picture should still be made of the same two hundred and
fifty-six colours, and a lift applied after the snap puts colours on
the screen the palette does not have. Contrast pivots on mid grey,
brightness multiplies, gamma is the usual curve, and 1 on all three is
the picture as drawn. They are remembered with the rest.


ON A PHONE
----------

The phone is the main way this is meant to be played, so the controls
were designed rather than bolted on. Open the page, tap, and:

  LEFT THUMB    a stick appears where the thumb lands. Push a little
                to walk, all the way to run; the knob goes yellow at a
                run. Pull past the rim and the stick is towed along
                behind the thumb, so a long drag in a new direction
                changes direction instead of pinning you against the
                old rim.
  RIGHT THUMB   drag anywhere to look. The view moves exactly as far
                as the thumb did and stops when it stops.
  FIRE          under the right thumb's rest, and it says FIRE now
                rather than wearing a flame, at the user's request —
                with a minigun in the game a flame was a lie a quarter
                of the time. Hold it — and while it is held, sliding
                the same thumb still looks, so a held flame swept
                across an aisle is one motion. That one detail is what
                makes a one-weapon game playable with two thumbs: the
                thumb that fires never lets go to aim.
  JUMP USE SWAP the three small buttons, in an arc round the big one:
                jump at nine o'clock, use at half past ten, swap at
                twelve, all the same distance from FIRE's centre, so
                the thumb rolls from one to the next without leaving
                its corner and the big one is always nearest. JUMP is
                the newest, at the user's request, and took the spot
                beside FIRE because jumping and firing are the two
                things you do without looking.
  PAUSE         top corner. The menu has look speed, invert, a
                left-handed mirror of the whole layout, vibration,
                brightness, contrast and gamma, chunkiness and
                fullscreen, and remembers them.

AND A PAD TAKES THEM OFF THE PICTURE, at the user's request. A phone
with a controller paired is still a phone — no keyboard, menus you tap
— but while the pad is being used the thumb controls are in the way of
nothing but the view, so the moment a stick moves or a button goes
down they fade, in a quarter of a second, and the moment a finger
touches the screen they are back as fast. input.js decides
(Input.padHeld, true from the first button until the next touch);
touch.js only wears the class. The weapon's name in the top right
steps left past the pause button on a phone, for the same reason the
old status bar's height used to be handed to the CSS: the two corners
are shared and somebody has to give way.

The rules the layout follows: nothing ever sits over the picture's
status bar, whatever the chunkiness (the bar's height on screen is
handed to the CSS every resize); every target is at least a thumb wide;
the controls dim after a couple of seconds untouched and brighten under
a thumb; the frame and the controls both keep inside the notch and the
home indicator; the first-time MOVE and DRAG TO LOOK hints go away the
moment each is used. A finger the browser takes back — an edge swipe, a
notification — releases whatever it was holding, so a stick is never
left pushed. Dying or getting out drops the controls, and after a
moment's grace any touch goes again.

The page asks for fullscreen and landscape on the start tap where the
browser allows it (Android); on an iPhone neither is allowed from a
page, and adding it to the home screen — the manifest and the icon are
for that — opens it without the browser around it. Held upright it
still plays, but a first-person view through a keyhole is not the game,
and it says so at the top of the screen.

Which kind of machine it is gets decided by whatever spoke last: a
laptop with a touchscreen is a phone until a key goes down, a phone
with a keyboard is a desktop until it is tapped. The game never finds
out — it reads one Input, and touch.js writes into it like any other
device. Pointer lock is a desktop-only idea and is never asked for by
touch.

One thing came out of building this that had nothing to do with
phones: the pause was a one-way door. update() returned before the tic
that sampled the pause key, so nothing could ever unpause, and on the
desktop Escape drops the pointer lock and the browser swallows the key
anyway. Now a lost pointer lock is a pause, the menu releases the mouse
so it can be pointed at, and a hidden tab pauses too.


THE PARADE
----------

TWENTY IN-LINE UNITS, ten each side, and four of them have a name. It was
six, three each side, and fourteen more went in at the user's request.
That is a different building: the frontage was six and a half thousand
units long and is nearly thirteen now, about three hundred and seventy
metres, and it changes what the place IS. Six units either side of a
superstore is a shopping parade with an anchor on it. Twenty is a STRIP
MALL, and the difference is that the anchor stops being most of what you
can see — from the mouth of the car park the building runs off both edges
of the screen and the store is the lit part in the middle of it.

THE FOURTEEN ARE UNBRANDED, which is what was asked for and is also the
only honest way to draw fourteen more. A fascia is one repeat of a
96-tall texture and a 432-wide unit says its name seven times, so
eighteen NAMES along that elevation is a hundred and twenty-six legible
words shouting over the one sign the level is about. Four is a parade
with character. Eighteen is noise. So the new ones carry the TRAY and the
paint in it and nothing else — six colours, muted, because a row of
saturated boards reads as bunting — and what tells one from the next is
what tells one unnamed unit from the next in a real parade: whether the
lights are on, the roller is down, or the glass has been whitewashed from
the inside.

AND THE RULE IS VISIBLE FROM THE CAR PARK: if the lights are on, the door
works. Seven of the twenty are open now, up from two, each with a run of
shelving down both sides, a counter with a flap in it and a back room.

THE CAR PARK HAD TO GROW WITH IT, because the wood down each flank of the
building is the strip between the lot's edge and the end of the parade —
a parade longer than its own car park is a rectangle with a negative
width and a map that will not build. So the lot is derived from the
parade now instead of being two typed numbers, and the parking thins in
two directions rather than one: people park near the DOORS, so the
chance of a bay being taken falls off with distance from the entrance as
well as with distance from the road. A lot this wide with cars only in
the middle of it is the cheapest frame in the game for how much of this
place is already over.


THE ONE IDEA
------------

The fire is a simulation running under the level, not an effect painted on
top of it. There is a grid of FUEL over the whole map, and every cell takes
its value from the sector it lands in.

  a gondola of stock    300      goes up like a gondola of stock
  the stockroom         340
  a produce bin         150
  the aisle between      55      creeps
  the car park            0      will not burn at all, ever

A FIRE LEFT ALONE GOES OUT. That is the requirement, and it is a
statement about percolation rather than about flammability: a fire
crossing a region carries on only if each burning cell lights, on
average, MORE THAN ONE new one before it burns out.

  expected spreads  =  tics alight  x  chance  x  neighbours

Above one and it runs away and takes everything connected to it, and no
player is needed. Below one it peters out, and no amount of waiting
brings it back, because a burnt cell has no fuel left to relight. There
is no middle setting: it either eventually takes the store on its own or
it never does.

IT USED TO BE ABOVE ONE EVERYWHERE, and the requirement was the exact
opposite of the one above: everything indoors went eventually, from one
match, with nobody helping. Measured with the building empty, one match
dropped in a gondola took 91% of the shop, one in a bare aisle took 86%,
and one in the stockroom took 94%. It did not matter where you put it
and it did not matter what you did afterwards.

Asked for the other way round — much slower, self-extinguishing, and the
player having to WORK to burn the place down — every number went under
the line. What that buys:

  A MATCH IS A PATCH        One ignition in the richest stock in the
                            building takes twenty-odd cells, about five
                            metres across, over a couple of minutes, and
                            then it is out. Two tenths of one per cent
                            of the store.
  A WALKWAY IS A WALL       Bare floor is sixty times less willing to
                            pass fire on than a gondola, which puts it so
                            far under the line that fire does not cross
                            an aisle at all. The cross-aisles are real
                            firebreaks now rather than slow ones.
  THE SHELVES ARE THE FUSE  Dense stock is still the most willing thing
                            in the building, so pouring along a run takes
                            the run. It will not jump to the next one.

So you point the gun at the shelving and the shelving you pointed at is
what burns. A full sweep of the shop still reaches a hundred per cent,
everything charred and everything gutted — that is measured rather than
hoped — but it takes walking every aisle of it, which is the point. The
flamethrower stopped being the fast way to do what waiting would do
anyway and became the only way it happens at all.

AND IT ALL HAPPENS MUCH MORE SLOWLY, which is the other half of the same
request and a SEPARATE number. A fire front creeps about one cell every
twelve seconds through dense stock where it used to manage six cells a
second. What moved for that is the CLOCK — one constant saying how many
game tics a fire tic is worth, which has been 2, 6, 18, 3 and is now 10,
each time because somebody watched it and said faster or slower.

THE TWO ARE SEPARABLE AND THAT IS WHY THERE ARE TWO OF THEM. The
expected-spreads figure is counted in FIRE tics, so it is identical at
any interval: the clock decides HOW FAST and the spread chance decides
HOW FAR. Turn the wrong one and you get a fire that is sluggish and
still unstoppable, or brisk and already over.

THE TWO TERMS TRADE EXACTLY, which is the thing to know before touching
either — tics alight and chance multiply, so halving one is the same as
halving the other. Thin fuel is still deliberately long-lived: a cell of
bare lino smoulders for the better part of three minutes and gets
nowhere, which is exactly the picture wanted — a fire lying on the floor,
visibly alight, visibly not going anywhere, until it gives up. It is also
why the fuel grid is floats: as integers the smallest burn rate
expressible was one unit a tic, and for bare lino that floor WAS the burn
rate.

AND NOTHING ELSE LIGHTS ANYTHING EITHER. A person going off used to
throw thirteen burning pieces seventy units in every direction, each of
which lit the floor where it landed — so one shopper exploding in a crowd
seeded a ring of new fires across the aisle they had been running down,
and that was the single largest reason the shop burnt itself down without
help. The pieces still come off alight, because a body going up is a body
going up. They simply do not hand it on. What a burning person still does
is drag a line of fire along behind them while they RUN, which is a
trail you can see and follow and which now goes out behind them.

AND THEY RUN, AND NOW THEY HAVE SOMEWHERE TO RUN TO. A shopper on
eight-tic watch samples the fire grid at nine points around itself —
where it is standing and eight at its scare range — which is what tells
it both THAT there is a fire and WHICH WAY, and the second is the part
one sample cannot give you.

THEN IT HEADS FOR A DOOR, which is the change that made the crowd behave
like a crowd. Running AWAY from a fire in a supermarket takes you to the
back of the shop and then into a corner, because that is what "away"
means inside a rectangle with one door in it: the crowd used to pile into
the frozen aisle and cook. So the map publishes every way out of the
building as a point on the OUTSIDE of it — six fire exits down the flanks
and the two front sliders — and a frightened shopper picks one and scores
its eight compass directions on how much CLOSER to it they get, minus how
hot it is where it would land, looking two steps ahead so it does not
stop one step short of noticing a wall of fire.

Nearest is not enough, and the case that proves it happens most: a fire
at the west end of the mid cross-aisle is nearest to the west mid exit
for everybody in it, including the people the fire is between. So an exit
is charged for being close to the thing being run from, heavily enough to
lose a thousand units of walking — a longer way out you can use beats a
shorter one you cannot. And the choice is re-made about once a second
rather than every step, because a shopper who re-decides every step in
the region where two exits score the same walks on the spot between them.

GREEDY, AND IT WORKS HERE FOR A REASON WORTH WRITING DOWN. Hill climbing
toward a point gets stuck in dead ends and a supermarket is nothing but
dead ends — except that every aisle in this one runs north-south and
opens onto a cross-aisle at BOTH ends, and every exit sits on a
cross-aisle. So from anywhere in an aisle the door is never at your own
y: moving toward the nearer cross-aisle always gets you closer to it, and
the aisle you are in is a corridor to somewhere rather than a pocket. No
graph, no nodes, and seven hundred of them cost eight distance calls
each.

PANIC IS CONTAGIOUS, because nobody in a supermarket finds out about a
fire by seeing flames — they find out because the aisle in front of them
is suddenly full of people going the other way. Without that, a shop this
size behaves as hundreds of independent people who each notice at 320
units, and with a fire six times faster than it used to be most of them
never started moving until it was on them: the front end stood at the
tills while the back of the store burned. So a fright spreads to anybody
within 190 units, and it carries the point being run FROM with it, so a
stampede goes one way rather than each new person choosing afresh.

AND IT HAS TO RUN DOWN, which took two goes. A fright handed on at full
strength is a loop, and it ran for the whole level: six hundred people in
the woods behind the store, none of them able to see a fire, each one
renewing the neighbour who had just renewed them. So what is passed on is
what is LEFT minus a bit — a rumour weakens with every telling — and a
chain of it dies after about a dozen hops unless somebody along it can
actually see the fire and start a fresh one.

Somebody going off frightens a much wider circle than the fire does, so
torching one at the tills empties the front end before the pieces land.

Not Doom's chase with the sign flipped. P_NewChaseDir walks TOWARD a
thing and all its cleverness is about not oscillating in a doorway;
running away is a different problem, because the wrong step is not a
wasted one, it is a step into the fire. And the fallback when the best
direction is blocked is the SECOND best rather than a random one, which
is Doom's answer and is right for a monster that has lost sight of you
and wrong for somebody with a door in mind: the second-best direction at
the end of an aisle is the one that goes round the gondola, and picking
at random instead threw that away half the time.

WHAT IT LOOKS LIKE, MEASURED. One fire in the middle of the shop, no
player, no help, sixty seconds: three hundred of the seven hundred and
thirty-six end up outside the building, scattered across the wood on both
flanks, the bays, the driving lanes, the verge and the road; the fire
takes four fifths of the store in that minute, and nobody alive is still
standing inside at the end of it. The count of people running drops to
nothing after the first wave and climbs back a minute later as the fire
reaches the second run of shelving and finds the people who had gone back
to shopping.

Those numbers used to read six hundred out and fewer than fifty lost,
with a quarter of the store gone, and the difference between then and now
is one change: a person the fire reaches now RUNS.

THE CROWD is the third way fire travels and it is by a long way the
fastest, because the crowd is the only thing in the building that moves.
A shopper the flame touches used to come apart where they stood — twelve
health against eight a tic is a person deleted in the first tenth of a
second — and what the fire got out of it was thirteen pieces thrown a
couple of aisles and a pool of heat where they had been. At the user's
request they now catch, RUN for three and a half to seven seconds
dropping a line of fire behind them, and explode wherever they get to.

That is not a death animation, it is a DELIVERY MECHANISM. Fire spreads
at about a cell a second through bare lino; a burning shopper covers
eight units a tic in a straight line toward a door they are never going
to reach, through the cross-aisles the fire cannot cross by itself, and
then goes off in the middle of whatever is on the other side. Set light
to the queue at the tills and the back of the store is alight in twenty
seconds — not because the fire travelled but because the people did.

AND YOU CAN SEE THEM. Until recently the best thing in this game was
invisible: somebody alight was the ordinary drawing turned fullbright,
and the entire read was carried by the fire they had dropped on the
floor. What you actually saw was a normal shopper standing near some
flames. Three things fix it and it needs all three of them.

  THE FLAME ON THEM   licks of fire thrown off the body every tic,
                      short-lived and rising. They are PARTICLES and the
                      person is moving eight units a tic, so the ones
                      behind ARE the trail — the same pool does the fire
                      and the tail of it, and somebody alight who stops
                      running piles them up on the spot instead, which
                      is correct and costs nothing. Sparks and smoke off
                      them on their own slower clocks, which is the part
                      of the trail that outlasts the flame and goes
                      where the wind does.
  THE SPRITE ITSELF   a fire colour map on the drawing, the same trick
                      as the ice and for the same reason: multiplying a
                      green coat by orange gives a muddy brown coat, and
                      what somebody on fire looks like is their SHAPE in
                      flame. Luminance is kept, everything else thrown
                      away, and that one number picks off the ember ramp
                      — the same eight colours the coals in a burnt
                      aisle use, so a person burning and the aisle they
                      set light to are made of the same paint. Hottest
                      at the feet, because fire climbs: white at the
                      knees, and their face is the last thing left
                      recognisable, which is what keeps them legible as
                      a PERSON rather than a silhouette.
  THE LIGHT THEY GIVE the flame colour is ADDED and not mixed, so a
                      burning shopper is brighter than a lit one — every
                      colour in the ramp is at most white, and a map
                      alone made a person the colour of terracotta
                      standing in a dark aisle. And they pull the store's
                      one fire light toward themselves like everything
                      else that burns, so a torch running down an aisle
                      lights it as it goes.

AND ALL OF IT IS BUDGETED, because a crowd fire is dozens of them at
once and the aisle is already full of the fire's own flames. Nobody more
than fourteen hundred units off throws a single particle — at that range
they are a glow on the shelving, which is the right answer anyway — and
no more than fourteen of them in any one tic. Forty people alight at
arm's length runs a third of the flame pool.

THE TRAIL IS ONE BELOW A THRESHOLD, and that number is the whole of the
tuning. A cell that is ignited starts at 55 heat plus whatever strength
lit it; js/fire.js sets light to anything standing in a cell above 70; so
a trail of 14 starts a FIRE and does not itself set light to the person
it is running past. That cell climbs over the threshold a fire tic or two
later, by which time the runner is fifty units away and whoever catches,
catches off the floor like everybody else. A trail that lights bystanders
directly turns a crowd into a chain reaction with nothing in between, and
the shop dies in ten seconds flat.

It is still a cascade — this whole system sits near its own critical
point, and the survivor count moves by a hundred and fifty on a change of
one in those numbers — which is why the test measures the things that do
not move: the building empties, hundreds leave through doors, and most of
the store goes.

THERE ARE SEVEN HUNDRED AND THIRTY-SIX OF THEM, at the user's request,
up from four hundred and sixty and before that ninety-two. Ninety-two was
a supermarket at two in the morning; this is a different hour of a
different day. The multiplier is one constant in js/maps/sellwrong.js and
every count beside it is the count the old shop had, so putting it back
to 1 puts the old shop back.

MULTIPLYING A CROWD IS NOT THE SAME PROBLEM AS PLACING ONE, and it went
wrong three ways first.

Random placement stops working. Three people dropped into a 560-deep
aisle land apart because there is nowhere else to land; ten do not. So
every run of people is stratified — each one owns a slice of the run and
is dropped inside it — and every placement has to clear 54 units of
everybody already standing, with retries if it does not.

A shopper is a DISC, and every version of the test that treated one as a
point put somebody somewhere they could never leave. The sales floor is a
rectangle, so it cannot tell an aisle from the gondola beside it. The
sector under the middle of somebody is better and still not enough:
eighteen units of shopper flush against the side of a till is a body half
inside the till, and the move check then refuses all eight directions for
the rest of the level. Two more were standing inside a crate of stock,
because the crates go down before the crowd does. So the disc is tested
against three things — the sector it is in, every rectangle that is not
shop floor, and everything solid already placed.

And five times the old shape does not fit. The old shape was almost all
aisle, and an aisle is 160 wide: five times three people in one is a
queue nobody can get out of, and the flee test caught exactly that — a
shopper beside a fire that shuffled twenty-four units in two and a half
seconds because it was walled in by its neighbours. The extra people go
where a busy shop actually puts them: the two cross-aisles in the middle
of the runs, the front cross-aisle, the mat inside the doors and the
lanes at the tills, all of which had nobody on them at all and all of
which are wider than an aisle.

AND EIGHT TIMES DOES NOT FIT EITHER, which is a different failure from
the one above and needed a different answer. Every group is a region and
a count, and the counts were balanced by eye against the region they sit
in; at eight times, eighty people found nowhere to stand in the region
they had been offered and the shop came out at 656 of the 736 asked for.
A shortfall like that is invisible as a number and shows up as the back
of the store being emptier than the front. So there is a last pass that
ignores the regions entirely, offers the whole sales floor a random point
at a time, and stops when the shop holds what it was asked to hold. The
placement predicate does all the work — it will not put anybody on a
gondola, in a till, inside a crate or within 54 of somebody already
standing — so a uniform scatter over a rectangle comes out as people in
the walkable gaps of it.

IT USED NOT TO BE A FREE KNOB AND NOW NEARLY IS. The cost of a crowd is
not the crowd, it is the panicking: an actor deciding where to step asks
every solid actor whether it is in the way, and against a flat list that
is the crowd SQUARED. Measured with no renderer in the way, against a
35 Hz tic, five fires going with a third of the shop running: 0.21 ms at
ninety-two people, 2.0 at four hundred and sixty. Ten times the work for
five times the people, and the reason this section used to end by saying
that another doubling wanted a grid over the actors rather than a scan of
them.

It has one now. ActorGrid in js/actor.js is a hash of cells 128 units
across holding every actor that was ever solid, and the same measurement
is 0.6 ms at four hundred and sixty and 0.8 at seven hundred and
thirty-six — a third of what the scan cost with sixty per cent more
people on the floor, and about three per cent of a tic. The one design
decision in it worth stating: only the POSITION has to be right. Whether
an actor is still solid, still alive and still in the world changes in a
dozen places, and threading grid maintenance through all of them is how
you get a crowd that can walk through a body one time in a thousand. So
a thing that has stopped being solid stays in the grid and the caller
filters it, exactly as it filtered the flat list. The waste is a handful
of entries per cell; the guarantee is that the grid can never disagree
with the world about who is where.

What limits the crowd from here is not the arithmetic any more, it is the
floor: at 54 apart there is only so much shop.

The car park has no fuel at all and never burns, which makes it the safe
room: the one place you can stand and watch what you have done.


SIX FIRE EXITS
--------------

At the user's request, and they are the single biggest change the shop
floor has ever had, because they are the difference between a crowd that
dies where it stands and a crowd that GETS OUT.

WHERE. At the ends of the three cross-aisles, west and east, because that
is where a real supermarket puts them and because it is the only place
they can go: the perimeter of this building is fixtures — produce bins,
the bakery case, the chill wall, the freezers — and a door in the middle
of a run of chillers opens onto the top of a chiller. A cross-aisle is
walkable floor that reaches the outside wall, and there are exactly three
of them.

WHAT IS ON THE OTHER SIDE. The flanks of the parade, which are wood. So a
shopper who makes it out is in the trees at the side of the building, in
the dark, and there are nine thousand units of forest for them to be
somewhere in. That is the hunt, and it is free: no new geometry, and the
wood already burns.

WHAT MAKES THEM READ AS AN EXIT AND NOT A HOLE: they are LIT. The
cross-aisles are at 0.26 and these are at 0.62, so the end of the aisle
glows and you can see from the middle of the shop where the crowd is
going. That is the whole signage budget and it is more legible than a
sign would be — see the note further down on why a word in a texture is
always the bug.

THE LEAF SWINGS, which is the one thing in this engine that has no Doom
precedent at all. Doom had exactly one door and it was a ceiling that
goes up; the front entrance here is already a departure, because a
supermarket slider cannot be faked by a rising portcullis, and it is done
as two quads on a track with the collision lines switched between wall
and hole. A quad on a transform can be MOVED along the wall or TURNED
about one end of it, and the second one is a hinge. So the same class,
the same state machine and the same blocking lines give both the
entrance and the six crash-bar doors, and the differences are two lines
of spec:

  swing       one leaf instead of two, turned up to a right angle about
                the (x0,y0) end. It turns OUTWARD, away from the shop,
                because that is which way a fire door opens and it is not
                a detail: a door that opens inward against a crowd is the
                thing every fire regulation in the world exists to
                prevent. There is no sign to choose in the code — yawing
                by minus ninety takes the leaf's own +X onto the wall's
                outward normal, so an opening declared left-to-right as
                seen from outside swings the right way by construction.
  panicOnly   the mat under it only trips for somebody who is RUNNING. A
                fire exit is not an automatic door: it is shut all night
                and it opens when a person in a hurry leans on the bar.
                The first cut of these opened for anybody and the shop's
                six fire doors stood open all night with nothing on fire.
                The player counts as such a person at any time, because
                the player is allowed to walk out of a building.

Both faces of the wall are blocked when it is shut, which sounds obvious
and is worth stating: a door that seals the inside face and leaves the
outside one open is a door you can walk round from the car park.

AND THE LEAF IS PAINTED STEEL WITH A CRASH BAR AND A RUNNING MAN, and
neither of those is a word. A supermarket fire door in this country
carries the pictogram and the bar and nothing else, which is lucky,
because the last four textures with lettering on them came down for the
reason further down this file. The bar is the brightest thing on it: it
is the reason the crowd can leave and the player cannot lock them in,
since a fire door has no handle on this side and no keyhole on the other.


AND THEN IT FALLS DOWN
----------------------

FIRST, THOUGH, IT GOES BLACK — which it did not used to, at the user's
request. The store knew three things about the fire: untouched, charred,
gutted. Two stages, both of them a texture swap, and between them
nothing. An aisle could lose half its stock without a pixel of it
changing and then change all at once, so the whole first half of every
region's life was invisible and the second half was a step.

WHAT WAS MISSING WAS NOT ART, IT WAS A WIRE. The simulation has always
known exactly how far through burning every region is — js/fire.js keeps
burnt and total fuel per sector — and there was no way from that number
to the fragment shader. It cannot be a per-vertex attribute: the level's
geometry is batched by TEXTURE, so a region's vertices are scattered
across every batch it touches and updating one region would mean walking
the whole store. So it is a DATA TEXTURE, one texel per sector, updated
once a tic, and every wall carries its own region index as an attribute.
The whole store is a few hundred bytes; the shader reads it with one
fetch. A byte is enough resolution: a 256th of a region's fuel is a tenth
of a second of it burning.

SOOT ARRIVES BEFORE THE FIRE DOES, and it arrives in PATCHES. Where it
lands first is a world-space field, so the soot has a SHAPE of its own
rather than a level of its own, and it spreads across a wall as the
region's number climbs: the lowest-numbered cells first, joining up,
until the wall is black. Nothing about it is per-region except the
number, so two aisles burning at once are never in step, because they
are not in the same place.

A PATCH IS NOT A CUBE, which took a second pass to fix. Every scatter in
here is a hash over floor(wpos * k), and an axis-aligned cell on a floor
or a ceiling is a SQUARE — two scales of them read as a chequerboard of
soot with dead-straight edges, in step with the chequerboard on the
ceiling above. The fix is not a finer lattice, which only makes smaller
squares: it is to MOVE THE POINT before looking it up. A coarse vector
field offsets wpos by most of a cell before the floor(), so a patch comes
out with a ragged outline at the warp's scale rather than a straight one
at its own — and then three scales of scatter over that warped lattice
give it structure at a bay, at a shelf and at a hand. The same warp is
used by the ash and by the coals, for the same reason.

AND THE EDGE CRAWLS, on the same clock the coals run on, which is what
makes a wall halfway through catching still be doing something while you
look at it. The advancing edge is also the only part of it that is HOT: a
scorch mark is orange at its rim and dead black behind it, and that is
one line of arithmetic — the product of the amount and its complement,
which peaks exactly where the boundary is. It is the difference between
soot spreading and a texture fading.

HOW DARK IS NOT A MATTER OF TASTE. It has to match what it hands over to.
The soot rises over a region's first two fifths, holds, and fades out
again across the halfway mark as the charred textures arrive and take the
job over — both driven by the same number, so the hand-off cannot drift.
The first cut of it took the albedo to a fifth, which the room light then
took to nothing, and a 40%-burnt aisle was a black void with shoppers
floating in it. It keeps about half now, patchily, and gets its own pale
ash for exactly the reason charVariant has some: a burnt store dark
enough to be accurate is a store you cannot walk back out of.

The coals arrive on the region's number too, rather than on its stage, so
the first few show up in the recesses while there is still stock on the
shelves and they thicken from there. It all costs nothing where nothing
has burnt, which is most of the game and all of it until you do
something.

CHARRED IS A SURFACE. GUTTED IS A STRUCTURE. They are two stages and the
second one is the end the whole fire is for.

A region that has lost half its fuel is CHARRED: the same room with
everything in it blackened, which is `_B` twins of the forty textures
that can burn. A region that has lost nearly all of it is GUTTED, and
that is not a darker room, it is a room that is no longer there:

  the walls    THE FRAME SURVIVES AND THE SKIN DOES NOT. Studs standing
                 the full height with a noggin across, and the board gone
                 between them from the top down — because fire climbs,
                 and because the bottom of a wall is the last place the
                 heat reaches. A hole with nothing behind it is a hole in
                 the world; a hole with framing behind it is a building
  the floor    slab, ash, and the bits of the ceiling that came down,
                 with the fire visible in the cracks — which is where
                 the light in a gutted aisle comes from
  the shelves  bare uprights, leaning where the heat was worst, with
                 whatever shelf did not fall
  the roof     THREE STAGES, and the last of them is a STEEL FRAME
                 against the sky rather than a hole in the world — see
                 below, because it is the part of a burnt building people
                 actually picture

THE ROOF DOES NOT ALL GO, and getting that wrong made the first cut of
this look like a demolition rather than a fire. Every gutted region
opening straight to the sky left a burnt-out store with no ceiling
anywhere, which is neither what a burnt building looks like nor what
holds one up. A region needs two things to lose its deck: a span long
enough to fall — how many cells of the fuel grid it covers — and the luck
of the draw. Corridors, doorways and small rooms keep theirs.

AND IT GOES IN THREE STAGES, at the user's request, because two was one
too few. What a region used to do was keep a charred deck or become SKY,
and "become sky" draws NOTHING — a sky ceiling is a hole the engine does
not build a surface for — so half a burnt store was a clean rectangular
absence with a hard edge where the next aisle's ceiling was still up.
That is a hole in the world, not a roof that has gone. Now:

  the deck holds    RUINDECK: the charred underside of a roof that is
                      still a roof. Short spans, and the long ones that
                      got lucky
  the deck is holed RUINHOLE, which is MASKED — the burnt-through parts
                      are not drawn at all, so you see the framing under
                      it and the night past that, and the deck is still
                      overhead between the holes. Every torn edge glows,
                      because every hole is somewhere the fire came
                      through. This is the stage that was missing and it
                      is the one that does most of the work: it is what a
                      roof looks like WHILE it is failing rather than
                      after
  the deck is gone  sky, as before — and the STEEL the deck was sitting
                      on, built as real geometry by js/ruin.js

THE STEEL IS THE POINT. A shed this size is a frame with a deck on it;
the deck burns and the frame is what is standing in the photograph the
next morning. So a region whose deck has failed gets joists across the
span at a pitch of ninety-six, beams under them on a column grid of three
hundred and eighty-four, about a third of the joists sagging between
supports, one in six simply gone, and the odd panel of deck still lying
across a bay. Thirteen members over a gutted aisle, twelve triangles
each, in the same batch as every other piece of steel in the building —
the whole ruined roof of a fully burnt store is about seven thousand
triangles and one draw call.

THE ROOF IS ONE ROOF, which is the thing that file exists to get right.
The fire guts REGIONS, an aisle at a time, so the obvious way to build
this is per region and the obvious way is wrong: two aisles either side
of a gutted gondola would each get their own joists, at their own
offsets, meeting the shelf between them at nothing in particular. What is
drawn instead is one LATTICE over the whole world, and a region draws the
piece of it that falls inside its own outline. Which joists sag, which
are missing, how far one has drooped at a given x — all of it is a hash
or a curve over the WORLD coordinate, never a number drawn at build time,
so the steel over one region lines up with the steel over the next and a
rebuild puts the same frame back in the same place. There are twenty
rebuilds in a level.

AND IT IS NOT BLACK, which is a decision and not an error. Charred steel
really is nearly black, and nearly black at this game's brightness —
everything is written to the framebuffer in linear, so a surface at a
tenth of the grey ramp lands at about two of 255 — is nothing at all. The
frame is the only thing in a gutted region with the sky behind it and it
has to read as a shape, so it sits a third of the way up the ramp with
rust in its seams and coals down its web. A coal is bright at any
exposure, and a joist with a line of them along it is legible across a
dark shop in a way a grey bar is not.

FOUR TEXTURES DO ALL OF IT, chosen by which SLOT a surface fills rather
than by what it used to be, because past a certain point a partition, a
chiller surround and a shopfront are the same rubble and forty more
textures would all have had to converge on the same look anyway. THREE OF
EACH, though, because a ruin is not a material, it is an accident: two
aisles that burned do not char identically, and one texture repeated over
a whole gutted store reads as a pattern, which is the one thing a ruin
must not read as. A region picks its own by a hash of its index — stable
across a reload, different from its neighbour's.

IT HAPPENS REGION BY REGION, which is the part worth watching. The roof
goes in patches, so there is a long stretch where half the shop is still
a shop, some of it is a deck with holes burnt through it, and the rest is
open steel with fire in the floor under it — and the join between them, a
hard edge of ceiling against a frame against stars, is the best thing in
the game.

AND ALL OF IT IS STILL ALIGHT. The burning trees have always run an
eight-colour ember ramp against a clock in their shader; a charred wall
was a PICTURE of embers, baked in and dead, at the exact moment the game
most wants to look alive. Now the world material runs the same ramp on
the same clock, so a charred aisle and a charred fir are one fire going
out rather than two effects that happen to be orange. The ramp moved to
js/palette.js so there is one of it.

WHERE THE COALS SIT, with no second texture to say so: a scatter of
world-space cells about fourteen units across, kept only where the
surface is ALREADY DARK — coals live in the recesses of a burnt thing,
and a burnt texture's own dark places are exactly those recesses, so the
texture picks the spots and the shader lights them. Two sines beaten
against each other keep neighbours out of step, the palette index is
quantised to whole steps so it flips between real colours instead of
sliding through the gaps, and it costs nothing at all where nothing has
burnt. The first cut used cells five units across and lit a quarter of
them, which at a grazing angle put more coals on a ceiling than there
were pixels to draw them in and read as television static.

THEY ARE BRIGHTER NOW, at the user's request, and turning them up was
three changes rather than one, because the first attempt at it made them
WORSE. Multiplying the output by two thirds again gave a burnt aisle
covered in pale cream confetti: heat lands near 1 on anything fully
charred, so the palette index clamped at the top of the ramp, and the top
of the ember ramp is #f8d0a0 — correct for the white-hot heart of a fire
and nothing like the colour of a coal. So the index is biased two thirds
of the way down, into #985800 and #c07820, which is what a coal actually
is, and the wave still takes the odd one to the top and back. Turned up
from there they read as fire rather than as litter.

AND A COAL IS A BLOB IN ITS CELL, NOT THE CELL. Lighting the whole cell
makes every coal the same axis-aligned rectangle and every one of them
the same size; falling off from the middle gives it a round edge, a dark
gap between it and its neighbour, and — because the radius comes from the
cell's own hash — a SIZE, which is the detail that makes a scatter of
them read as coals of different ages. There is a second scatter at a
third the size for the SPARKS in among them, much rarer and cut off by a
thousand units rather than two, because a one-pixel bright thing at range
is aliasing and not a spark.

AND THE CREEPING EDGE IS A LINE RATHER THAN A WASH. The rim of a
spreading soot patch is the product of the amount and its complement,
which peaks exactly at the boundary; SQUARED, it peaks in a band a third
as wide, and a band a third as wide can be several times brighter without
washing anything out. It carries two colours now, because a burning edge
is not one temperature: a broad orange shoulder, and a pale core that
only the very boundary reaches.

The light fittings are taken away rather than switched off when the roof
over them goes, because there is no wiring left in a roof that is not
there. That used to be about the picture as well — a row of dead fitting
sprites hanging in the open air over a roofless shop was the one thing in
the shot that said this is a computer program — and now that a light
draws nothing it is only about the light.


WHAT IS LEFT AFTERWARDS
-----------------------

A store that burns down and looks identical afterwards is an animation,
not a simulation. Two things stop that.

EMBERS. A cell whose fuel is spent drops to a low glow and sits there for
most of a minute before going cold, rather than fading out in a second.
Ground you have already taken stays visibly taken, and an aisle you gutted
five minutes ago is still ticking over in the dark behind you.

CHARRING. Every surface that can burn has a charred twin, generated from
the original rather than drawn separately — so a shelf that goes up turns
into a burnt version of ITSELF and stays in register. Three things happen
to it, and all three are needed or it just looks dim: it goes dark but
unevenly, with soot in the recesses so the relief is still legible; it
goes pale and patchy where the ash settles, which is what stops it reading
as "the lights went out"; and a few embers survive in the cracks as the
only saturated colour left.

When a region is half gone its surfaces are swapped, all at once, and the
level geometry is rebuilt. That costs about ten milliseconds and happens
perhaps twenty times in a level, debounced so that six gondolas passing
the line in the same second produce one rebuild rather than six.

The ambient light also lifts as the store goes — partly embers, partly the
roof no longer being entirely there. A gutted store lit only by embers is
accurately almost pitch black, and you still have to find the way out of
it, so accuracy loses that one on purpose.


THE YARD OUT THE BACK
---------------------

Behind the anchor there is a service yard: a strip of hardstanding as
wide as the store and about four hundred and eighty deep, with chain link
along its three open sides and ONE way in and out of it. The gate lines
up with the roller shutter the night crew left open, so the gate, the
dock and the shutter are one straight line through the back of the
building — which is where the lorries would go, and is also the only way
into the yard that is not a walk around the whole store.

A FENCE IS NOT A WALL, and in this engine that is a statement about
geometry rather than a figure of speech. A wall here is the ABSENCE of a
sector: leave sixteen units between two rectangles and the void between
them is the wall. A wall you cannot see through would make the yard a
corridor with no relationship to the wood on the other side of it, and
what is wanted is the opposite — something you see the trees through and
still cannot walk through. So the yard and the wood TOUCH, every edge
between them is an opening, and the chain link hangs IN those openings as
a MIDDLE TEXTURE on a two-sided line: masked, drawn from both sides,
blocking.

WHICH MAKES THE GAP FREE. A fence is a property of LINES, so the opening
is not a hole cut in anything — it is the one line along the back that
was never given any wire. The rectangle mapper splits a shared edge at
the corners of whatever abuts it, so the wood behind the yard is three
rectangles instead of one and the middle one's edge is the gate. Nothing
else in the map has to know, and the map itself throws if that line ever
comes back fenced or if a fifth one ever comes back bare.

AND IT STOPS AT THE TOP RAIL. That needed a new idea in the geometry
builder, because a middle texture had always spanned the whole opening —
which is right for a grating and right for a shop window, both of which
FILL the hole they are in. A fence does not: it is eight feet of wire
standing on a line between two patches of ground that are open to the
sky, so spanning the gap meant stretching the mesh from the tarmac to the
cloud base and tiling it five times on the way up. A line may now say how
tall the thing standing in it is, and the opening is the LIMIT rather
than the answer.

The mesh is two families of forty-five-degree diagonals eight texels
apart, over sixty-four by forty-eight, spanning a hundred and twenty-eight
by ninety-six world units. Eight divides both, so the diamonds run on
across a repeat in either direction with no seam and no half-diamond at
the joint, and one post per repeat puts an upright every hundred and
twenty-eight units, which is about where a real one goes.

NOTHING GROWS IN THE GATEWAY, and that is not luck either. The forest
keeps a margin outside `clearing`, which is the store's own fuel-grid
rectangle — and the yard, being tarmac rather than wood, is inside that
grid for the same reason the car park is. Extending the grid past the
fence is what holds the gate open.


THE WOOD
--------

Everything past the kerb of the car park is forest: a flat plain of firs,
bushes, ferns and grass, a hundred and seventy thousand plants, nine
thousand units deep on every side. It is eight big outdoor rectangles in
the map, so you walk out of the car park and keep walking, and it is one
module, js/forest.js, that keeps two things deliberately apart.

IT IS PLANTED THE WAY THE GOLF PROJECT PLANTS ITS OWN, which is one cell
of ground deciding what — if anything — grows in it, with the three
classes as a PRIORITY rather than three independent probabilities. Firs
take their share first and are never squeezed, because the canopy is the
forest and thickening the undergrowth must not thin it. Bushes take
theirs out of what the trunks left, through a THRESHOLDED clump noise, so
scrub arrives in thickets rather than as an even speckle. Ground cover
fills whatever is still empty, which is not a demotion: it is the
definition of a ground layer, and it thins out on its own exactly where
the trunks and the thickets are dense. The understory is several plants
per accepted cell, which is the density dial that is nearly free.

AND BUSHES MOVED OUT OF THE CANOPY. They used to be one per cell and they
BLOCKED, so the only way to thicken the undergrowth was to fill the wood
with obstacles. As understory they are several per cell and you walk
through them — the wood reads dense at eye level and is still something
you can run through with a fire behind you. Only trunks stop you, which
is the rule the collision code already had.

WHAT PAYS FOR ALL OF IT is that the plants are cut into square chunks of
ground, one draw per kind per chunk. This forest costs LINEARLY IN
INSTANCES SUBMITTED and not at all in how much of the screen they cover:
measured in a software rasteriser, a hundred thousand plants cost a
second a frame whether they were a wall of green or collapsed to nothing
by a fade in the vertex shader. Collapsing the quad saves the fill; it
does not save the vertex, and the vertex was the bill. So a chunk gets a
real bounding sphere and three.js frustum-culls the two thirds of the
wood behind you for free, and each class hides the chunks past its own
range — the fern carpet is submitted for the ground you are standing on
and nowhere else. Twice the plants, a third of the frame time.

THE SIMULATION is a grid of 64-unit cells with a byte of state each —
green, alight, gone — and a list of the ones burning. Every cell is fuel
(the floor is dry litter) and a cell with a tree in it burns longer and
throws fire further; there is a wind from the west and the fire moves
with it three times as readily as against it. It percolates — and that
is a separate dial from how fast. The first tuning had a quarter of the
wood gone in eight minutes; simply lowering the chances put the floor on
the percolation line, where whether a match took depended on which
trees stood nearby. So the chances stay high and the burn is long, with
nothing able to spread until it is a third of the way through: a ground
cell smoulders for ten seconds, a tree for eighteen, and one match, left
alone, has a twentieth of the wood gone in about ten minutes and a
quarter in twenty-three, downwind faster than across. The smoke test
runs that match in Node and holds it to those numbers.

AND IT HAS FLAMES ON IT. The burn map chars a tree and puts coals on
it; a pool of two hundred instanced flame quads, re-parked every frame
on the hottest burning cells near the eye, puts FIRE on it — carried at
the height the front has climbed to and held to the crown, so a fir is
seen burning from the ground up rather than carrying a lantern over its
own head. The flames come from js/fireart.js, like every other flame in
the game.

EACH ONE IS STEPPED TOWARD THE EYE as it is parked, and shrunk by the
same fraction. A flame on a fir and the fir itself are both quads yawed
to face the camera plane, at the same place: two parallel surfaces at
the same depth, which the depth test cannot separate, so the fire came
out chopped up by needles in a pattern that changed every time the eye
moved. Moving it along the line to the eye and scaling it to match lands
it on exactly the same pixels at exactly the same size — a perspective
projection is a scaling about the eye — and the only thing that changes
is the depth it writes, which is the thing that was wrong.

THE DRAWING is instanced billboards: every plant is one entry in a buffer
and each kind of plant is one draw call, so the whole wood is ten calls
and a ground plane. The plants are the golf project's
(github.com/verdictzero/golf): each sprite comes with a BURN MAP baked
from its own pixels — where the coals sit, how black it ends, WHEN each
texel catches, how leafy it is — and one number per plant swept across
that map takes it from green through scorched, alight and charred with
no second set of art. The shader is that mechanism ported. The ground
under it crossfades forest floor into charred dirt from one texel of
burn per cell, so a burnt patch is black to the ground and stays black.

WHAT COMES OFF IT. Embers and smoke are two pools of a few hundred
instanced quads, in two draw calls, and they spawn from a handful of
burning cells sampled near the player each tic — never from every
burning cell, because with a forest alight that is thousands and a
spark two thousand units off is a pixel. The flame out of the gun is
the same class with the fire's own frames on it.


THE GUN IN YOUR HANDS
---------------------

The flamethrower is a model of Vaportrash's, loaded from assets/models/
by a loader that reads exactly what the exporter wrote and nothing more
(js/glb.js), and drawn in its own little scene in front of the world —
low and hard right, the body off the bottom of the frame, the barrel
coming in across the lower right quarter. It is drawn into the same
low-res buffer as everything else, so the painted diffuse goes chunky
with the walls and the palette eats it with the floor.

IT IS THE SECOND ONE. The first was the user's own, built in Blender
with two marker spheres in it saying where the pilot light burns and
where the flame comes out, which tools/prep-model.mjs lifted out of the
mesh and wrote into the file's own extras. The user replaced it with
this one — a fire extinguisher bottle strapped to a green machine gun,
which is a better joke than anything the game could have modelled — and
it arrives with no markers in it at all. So the two points are numbers
in js/weapon3d.js now, in the model's own units, which is the same
answer the extinguisher and the bore got and the same rule the van set:
somebody else's file is not rewritten on the way in.

AND THE NUMBERS WERE FOUND BY LOOKING. A model with no markers has to
be measured, and the measuring was done with pictures: the gun drawn
flat from its left, from above and straight down the barrel, over a
grid ruled in its own units, with a crosshair on the two candidate
points that was moved until it sat where it belonged. The nozzle is the
middle of the bore inside the C-shaped muzzle bracket; the pilot is the
lip of the little gold igniter pipe that runs under the barrel and
turns up in front of it — below the nozzle and further forward, which
is how the old gun had it too and is what a pilot light is for. Neither
could have been read off a bounding box: the box's centre is inside the
metal and the pipe is a different part from the barrel.

The pilot is a small flame sprite parked on one anchor, the muzzle
flame grows out of the other along the barrel, and the stream that
flies into the world is born at that same nozzle — projected as a ray
out of the gun's scene and back into the world's, so it always leaves
the end of the gun you can see, whatever the two fields of view are.

BOTH STREAM WEAPONS ARE HELD AT ARM'S LENGTH AND THEN SOME, at the
user's request: the flamethrower three times as far from the eye as a
gun used to be, the extinguisher rifle nearly the same. It is one
number each (`out` in the GUNS table, a multiple of how far in front of
the eye the scene parks a gun) and it buys the LENGTH of them. At one,
a quarter of a gun is behind your eye and the rest is too close to
read: what you saw of the flamethrower was a red bottle and a corner of
green. At three the whole weapon is in front of you — muzzle, bottles,
receiver, grip — the bottle is a third of what it was, and the
extinguisher is finally a fire extinguisher with a stock on it rather
than a red cylinder. The cerebral bore keeps its own 1.33, being a
different request: smaller, not longer.

AND THAT IS WHERE THE GUN IS DRAWN, NOT WHERE ITS FIRE STARTS, which
had to be split the moment the guns moved. The world takes the nozzle
as a RAY out of the eye and puts the birth of the stream somewhere
along it; the distance used to be the drawn nozzle's own, forty-two
units, which is a little past arm's reach. Holding the gun three times
further out would have carried that to seventy — the far side of a
shelf you are standing against — so the distance is capped at
NOZZLE_REACH, forty-six, which is what the longest-reaching gun
measured before any of this. The picture moved; the level did not.

WHAT THE PREP TOOL TAKES OFF IT, on the way in, is two thirds of the
file: 6.8 megabytes to 3.3. The maps an unlit renderer cannot use (a
normal map and a metal-rough map, a megabyte and a half between them);
the vertex attributes it cannot bind, which on a Sketchfab export is a
TANGENT for the normal map that has just gone and four sets of UVs for
light maps this game does not have; and then — the part that actually
saves the bytes — a repack that gives every accessor a tight buffer
view of its own. A bufferView is a RANGE, and an exporter is free to
park twenty accessors in one, so deleting the attributes saved nothing
at all until the geometry was copied out element by element at the
source's own stride. Every float accessor that came with a min and a
max is measured again out of the bytes that were written, and a
mismatch throws, because a repack that bends the model quietly is worse
than no repack.


THE ROAD, AND WHO COMES DOWN IT
-------------------------------

IT IS A LOOP, at the user's request. There were two roads and they did
not meet — a frontage lane along the front of the lot that stopped dead
at both ends, and a traversal road across the far end that ran on through
the wood — which is fine until you stand at the west end of the lot and
look at where the tarmac simply stops. Now there is one PERIMETER ROAD
all the way round the car park: four straights, four junctions, and the
public road crossing it at the two bottom corners and carrying on into
the trees in both directions. Which is what a lot this size has — nobody
drives through a strip mall's parking, they drive round the edge of it
and turn in — and it is also the only firebreak in the wood, so the loop
is the shape of the safe ground.

Which order the bands are in is the whole reason the through road is at
the far end. A road, then a car park, then a shop, in that order, is what
arriving at a supermarket looks like; a road against the shopfront with
the car park behind it is not a lot, it is a forecourt. You start on the
verge south of it, so the opening shot is across a road, over a car park,
at a supermarket.

A STRAIGHT IS FIVE STRIPS of sector — an edge line, a lane, the centre
line, a lane, an edge line — because a floor is textured to the world
grid and a 64-unit tile cannot hold one line across a 300-unit road, but
a strip six units wide wearing a tile that is line all the way through
can. That same world-grid mapping is why there are TWO centre-line
textures: a tile whose dash runs along x draws one solid unbroken stripe
down a road that runs along y, which is a different marking meaning a
different thing, so the two legs of the loop wear ROADLINV and the two
straights wear ROADLINE.

AND A JUNCTION IS THE PART EVERYBODY LEAVES OUT. Two things happen at
one and both of them are ABSENCES: there is no centre line through it,
because you do not paint a lane divider across the place two streams of
traffic cross, and the edge lines TURN — they run down whichever sides
are still kerb and stop dead at the sides that are a mouth. A ring road
with its dashes carried straight through its own corners reads as two
roads laid on top of each other. The two bottom corners are T-junctions
rather than bends, so they get the other thing a junction has: a give-way
bar across the mouth of the minor road, which is the marking that says
"this is a junction" before you have looked at anything else.

THE SWAT COME DOWN IT, at the user's request, and they are the first
thing in the game that fights back.

WHAT CALLS THEM IS THE TRIGGER, at the user's request. Not the fire — a
supermarket alight is the fire brigade's business — and no longer the
first body either: ONE SHOT out of any weapon, on the tic you fire it.
SIRENS across the middle of the screen and the first convoy is already on
the road. It used to be the first kill and a sixteen-second wait on top of
it, which together read as the game giving you a head start; there is no
head start now, and the sirens are the answer to the flamethrower rather
than to the body. (A death still calls them, for the night the fire kills
somebody on its own after you have stopped firing — but in practice you
fire first, because firing is how anything in this game begins.)

AND THEY SPEED IN. From the shot to a van standing in front of you is
THREE AND A HALF SECONDS if you are outside, at the user's request, and
this is the third time that number has come down: thirty-five, then
fourteen, now this. Four things make it.

They come in at whichever END OF THE ROAD is the shorter drive to where
they are going — the two are nine thousand units out from the ring on
either side, so guessing wrong was half a minute of tarmac.

The van does THIRTY-SIX units a tic, and it is a top speed now rather
than a constant. Fifteen was twice a running shopper; thirty was a van
with its lights on at two in the morning; sixty was not a van at all, and
the user said so. Thirty-six with a standing start and a braking stop
averages well under itself, which is why the clock kept getting shorter
while the driving got slower.

AND IF THEY ARE COMING FOR YOU THEY DO NOT DRIVE THE ROAD AT ALL. The
map's way in starts where the road leaves the world, and crossing it was
five of those fourteen seconds — five seconds of a van driving down a
road that nobody standing in the car park can see. So the whole way in is
built as it always was and then CUT SHORT from its far end: they come
into being on the road eleven hundred units back from wherever they leave
it, which is about two seconds once the standing start and the braking
are paid for.

AND NEVER SOMEWHERE YOU ARE LOOKING. Eleven hundred units is four van
lengths — near enough to watch one appear, if you happen to be facing
that way. So the spot is walked further back, five hundred at a time, for
as long as it is inside your view: face the road and they come from
further off, face the shop and they are on you in two seconds from behind
your shoulder. It is a view cone and a walk down a polyline, both pinned
on their own in the test, and the invariant the route is held to is the
honest one — the place it comes into being is out of sight, OR the search
spent every try it had. The second half has to be in it, because walking
back along a RING can bring a point round the other side of the lot and
into view again.

THE CUT ONLY EVER TOUCHES THE ROAD. The lead — the last leg, off the
tarmac and in toward you — is appended afterwards and never trimmed, or a
van would come into being in the middle of the car park.

Inside the building nothing changed: you are not watching the road, and a
van that has come the whole length of it is the same van. Both routes are
built the same way and the test holds them against each other: two and a
half thousand units coming for you against eighteen thousand coming for
the doors.

It is the user's police van, an armoured assault truck loaded the same way
the customers' van is (see THE ART) and drawn as its own mesh on its own
sheet, because it can never be in the slab with the others and, unlike
them, it MOVES: in along the through road from whichever end it was sent
to, round the perimeter loop the short way, and off it toward you. The
route is the map's (level.swatRing, level.swatRoutes, level.swatBays; the
lot's own numbers are in scope there and nowhere else), the driving is
SwatVan in js/vehicles.js. It does not stop for anybody: a crowd running
from the fire is a crowd in the road, and a squad van at speed goes
through it; the player is shoved and hurt.

AND IT IS A LITTLE BIT OF A CAR PHYSICS NOW, at the user's request. The
position still rides the polyline exactly — there is no grip, no slip and
no mass — but the SPEED along it is integrated rather than assumed, and
the body is hung off it.

IT BRAKES FOR THE END OF THE ROUTE, not for the next corner, on the
oldest trick in the book: the fastest it is allowed to be going is the
speed from which it could still stop in the distance it has left. So it
comes off the ring already slowing and rolls the last two lengths into
its place, instead of arriving at speed and switching off. It leaves from
a standing start for the same reason. The test records the speed and the
distance remaining on every tic of a real drive and checks that the first
never exceeds what the second allows.

AND THE BODY SHIFTS ITS WEIGHT. Two damped springs, one on the pitch and
one on the roll, driven by what the drive just did to its speed and its
heading. The nose goes DOWN under braking — measured, not asserted: at
two and a half degrees of pitch the nose sits nine units below the tail
in world space — the tail squats under power, and it leans OUT of a bend
the way a real one does, because it is the outside springs that compress.
When it stops it rocks back through level and settles. Five degrees of
dive, four and a half of squat, five of lean, and about a second to stop
moving.

Neither spring is simulated from a suspension: they are the acceleration,
read twice, through something that overshoots. SPRING and DAMP are the
whole of the character — undamped it wobbles for ever, critically damped
it slides into place with nothing to say. It costs four numbers and it is
the difference between a model sliding along a line and a van pulling up.

THREE AT A TIME, at the user's request. Where one van used to be sent,
three are: a convoy, nose to tail from the same end of the road, each
going to its own place. The budget went up by the same factor — six on
the road at once at the start instead of two, twenty-seven at the
ceiling instead of nine — because sending three into a budget of two is
sending two.

AND THEY COME TO WHEREVER YOU ARE, AND THEY NEARLY HIT YOU. Inside the
building they pull up across the fire lane in front of the doors, which
is what the fire lane is for and what the map's bays say. ANYWHERE ELSE
the destination is YOU: a point on the perimeter road, reached by
entering at the junction and walking the ring the short way round, and
then off the road toward you for as far as the tarmac holds — up to
twenty-six hundred units of it, stopping a HUNDRED AND TWENTY short.

Three hundred is to the MIDDLE of a van two hundred and fourteen long, so
its nose ends up about two hundred units off — half a van of daylight.
This is the third number it has been and the user's second thought about
it: two hundred and sixty was called too far away, a hundred and twenty
put the nose thirteen units from your face, and three hundred is near
enough to be in your way and far enough to be a van rather than a wall.
Braking into it rather than stopping dead is the other half of why it
reads differently; see below.

AND IT IS THE BEST POINT ON THE RING, NOT THE NEAREST ONE. Taking the
nearest is right whenever the ground between the road and you is open,
and wrong the moment something is in the way: stand in the trees and the
nearest point has a wood between it and you, so the van gives up at the
kerb — while a point further round, with the tarmac of the lot in front
of it, would have got most of the way. So every free place along the ring
is walked and the one that ENDS nearest you wins, and the search stops
the moment one lands within a step of the stop distance, which out in the
car park is the first one it tries.

Stand in the middle of the lot and a van leaves the road, drives between
the rows and stops with its nose forty units off you and its side door
facing you, three to five seconds after you fired. Stand in the trees and
it stops at the treeline — a van is not going into a pine wood, and the
crew that gets out of it will walk in, because THEY respect the trunks
(see Forest.blocks). Stand behind the building and it gets as far as the
frontage lane and the crew walks the rest: the service yard is drivable
ground with no drivable ground connecting it to the lot, which is a fact
about the map rather than a shortcoming of the driving. The loop is
published by the map as four corners (level.swatRing) and every question
about where a van goes is a distance round it; see js/responders.js,
which is where the ring arithmetic lives.

THEN THE CREW. Parked, it unloads a trooper every second and a half onto
the ground, six of them, out of the side facing YOU — which used to be
the side facing the shop and was the same thing only while every van
stood across the fire lane. When the crew is out it does not stop: it
trickles, one every nine seconds to begin with, for as long as it stands
there — which is for ever, because the van is FIREPROOF (below) and
nothing in the game ends one.

AND IT RAMPS EXPONENTIALLY, at the user's request, and the ramp is one
number: the PRESSURE, 1 at the call and doubling every seventy seconds
from then on, without limit. Everything that says how much police there
is — how many vans may be on the road or standing at once (five, to begin
with), how many troopers may be on their feet across every van (five),
how long between sends (sixty seconds, give or take a fifth), how long
between one trooper and the next out of a standing van (ten) — is that
starting value times the pressure, read off the curve at the moment the
question is asked rather than fixed at the call. So a minute and ten
seconds after the first shot the vans come twice as often and twice as
many are allowed out; two and a half minutes, four times; and the same
minute of the night is the same everywhere, because it is one curve read
four ways. The floors (a send every seven seconds, a trooper every three)
and the ceilings (twenty vans, sixty troopers on their feet) are what the
engine is asked to carry, not the design; the curve reaches all of them
inside five minutes and then holds the lot there. At the doors the map's
nine bays used to be the real limit and are not any more — when they are
full the next one stands along the ring by the doors instead of not
coming. It is js/responders.js, top to bottom, and pressureAfter() is the
curve as a pure function for the test to pin: equal steps in time
multiply by the same amount, which is what exponential means. There is no
goal in this game and this is the nearest thing to an ending it has: the
night gets worse at a rate that does not care how well you are doing.

A SMIDGE LESS OF ALL OF IT, at the user's request, and the second pass
over these numbers. The doubling went from sixty seconds to seventy, the
four starting values each lost one, and the two ceilings came down a
quarter. Nothing about WHEN the first convoy arrives moved — that is the
run-in and the speed above, which the user asked for and which stay — and
neither did the size of a send. Standing still in the middle of the lot
and never firing again, so nobody dies and the count is what the budget
allows rather than what you let live:

              was                 now
  1 min       11 troopers          9
  2 min       23                  16
  3 min       47                  29
  4 min       80, the ceiling     53
  5 min       80 + 15 army        60, the ceiling, + 9
  6 min       80 + 31 army        60 + 17

The army's own numbers are untouched — it is the newest thing here and
there is not much of it — but it starts later anyway, because its trigger
is a PRESSURE on this curve rather than a time, and this curve now takes
three and a half minutes to reach it rather than three. That is the whole
argument for writing a threshold in the units of the thing it is a
threshold on.

A TROOPER IS THE ZOMBIEMAN with the numbers looked at again, and he walks
on the chase this file has described for a year with nobody in it —
A_Look, A_Chase, P_NewChaseDir, untouched. Sixty health, so the stream is
held on one for a moment rather than waved past; a rifle at anything he
can see, face-fire-face on Doom's own ten-eight-eight, three to fifteen
off whatever the shot meets first with the Zombieman's five and a half
degrees of spread either way, which at point blank never misses and across
the car park mostly does; one hit in five makes him flinch. They are a
TEAM, and since the army came the team is everybody who turned up: a
round from one of them does NOTHING to another of them, and neither of
them turns round about it. Doom's infighting is the best thing in Doom
and the wrong thing for a squad, and the damage half of it is worse than
the grudge half once there are two forces on the same ground — a hundred
and forty of soldier that crosses a fire lane with twenty-six troopers
firing down it arrives at twenty, and an army tier that turns up already
shot to pieces by the tier below it is not an escalation. A round is
still STOPPED by whoever it meets, though, so the man in front of you is
still cover and a crowd of them is not a crowd of clear shots; and
anything that is not a round still lands, including their own van running
them down. They come out already after you.

THE TROOPERS ARE FIREPROOF, at the user's request, and it is one flag
(`fireproof` on the actor type in js/states.js) asked in the handful of
places fire arrives: Actor.damage refuses anything flagged `fire`, which
is the stream, the burning floor, a blast and a torch running past;
Actor.ignite refuses to light one because a fireproof thing is not a
flammable thing; and the floor fire does not bother asking. The stream
splashes off the armour and heats the tarmac under it. Nothing eats a
trooper to ash; the two ash states are gone with the flag that reached
them. What still gets through: YOUR bullet, a van (his own, if he is
standing in the lane when the next one comes), and the bore — which is
the answer to them, and is rationed, which is the point. The flamethrower
is not the answer to a man in armour any more than it is to a bullet.

THEIR VEHICLES ARE NOT, ANY MORE. They were — the same flag on the
Vehicle, which for a vehicle means invulnerable, since fire is the only
thing that ends one — and at the user's second request they are ARMOURED
instead: they catch, they char and they go up exactly like the customers'
vans, MUCH more slowly. Which is the better answer, because "you cannot"
and "you can, at a price" are different games and this one was always the
second.

Two numbers, both 1 for a car in the lot: `fireArmour` is what fire's
damage is divided by on the way in, and `charFuse` is what the blackening
is multiplied by once the health has gone. Eight and four for a squad
van, fourteen and six for the APC. Measured in the browser by holding a
fire on one of each:

  a hatchback in the lot        9.7 seconds, flame to wreck
  a squad van                  44.6
  an APC                       about ninety

The armour is only against FIRE. A bullet, a bang and a van are the same
to a squad van as to a hatchback; what it is built to stand in is the
burning. And burning one out of the fire lane gives the bay back, which
never came up while nothing could end one — a wreck that still held its
place would close that bay for the rest of the night.

THE COLD STILL WORKS. A trooper freezes like anybody else, on his own
drawing, and a block of ice with a rifle in it is the best joke the two
weapons together tell. And it is the one place fire does anything to a
trooper: fire on a fireproof block of ice is a THAW, not the execution it
is for a shopper, because nothing inside can be eaten — the old melt rule
from before burn-away, kept for the one kind of person it is right for.
Freeze one and the flamethrower lets him out, running; the bore or a blow
is what finishes him. Fire on the floor under a frozen trooper thaws him
the same way, where it would eat a shopper.

AND YOU CAN BE HURT NOW, THROUGH THREE LAYERS. There was no health on the
screen because nothing could take any off; from the first bullet that
lands there are THREE bars in the corner, at the user's request, and not
before, because a full bar that never moves is the plate of numbers that
corner got rid of.

They are the user's numbers as well as the user's idea: an OUTER PLATE
worth ten of you, an INNER PLATE worth five, and then you — a thousand,
five hundred and a hundred, sixteen hundred in all, against a trooper's
rifle that does three to fifteen a round. They are spent OUTSIDE IN, and
that order is the whole feature: this is not Doom's armour, which takes a
third of every hit for as long as any of it lasts and so drains alongside
your health rather than in front of it. A layer here takes the whole of
every hit until there is none of it left, and only the overflow reaches
the next, so one hit big enough goes through all three in the same call.
That is what makes a stack of three bars worth drawing — the top one is
the only one moving, until it isn't. Blue, then the purple this palette
keeps for bruises, then the old bone-amber-red one that ends the night in
aisle five like the card always said. It is js/player.js: three fields, a
loop over two of them in damage(), and nothing else in the game knows.

AND THEN THE ARMY COMES
-----------------------

At the user's request, and in the order the user set the day the sheet
arrived: the SWAT, then the army, then a super army after them whose
drawings are still to come. The army sat cut and unused in assets/people/
for a while because the piece that was missing was not the soldier, it
was the thing that brings him up the road; the user's HOVER APC is that
piece, and the army was built the day it arrived.

IT IS A SECOND FORCE, NOT A HARDER VAN. That is the whole of the design
in js/responders.js: FORCES is a row per force — which troop gets out,
which model it gets out of, which class drives it, and a block of numbers
— and everything under it takes a force as an argument. Both forces are
on the road at once and neither stops. The super army is a third row
there, a third entry in js/people.js, a third call to troopStates in
js/states.js and a third kit in js/sprites.js. Four tables and a sheet.

THEY ARE CALLED AT A PRESSURE, NOT AT A TIME: when the night is pressing
EIGHT times what it was at your first shot, which on the police's own
doubling clock is three minutes in. Writing the threshold in the units of
the escalation rather than in seconds means retuning the doubling moves
the army with it instead of leaving it stranded. From that tic the army
has a curve of its own STARTING AT 1 — so it arrives small underneath a
police force already eightfold, and then doubles on the same clock. Both
curves run to the end of the night.

FEWER AND HEAVIER is the difference in every number. Two carriers a send
against three vans; two on the road at the start against six, ten at the
ceiling against twenty-seven; four soldiers on their feet against six,
forty at the ceiling against eighty. But eight in the back of one against
six, a soldier out of the ramp every forty tics against fifty, and a
soldier who is two and a third of a trooper: a hundred and forty health,
one flinch in eight instead of one in five, nineteen hundred of rifle
range instead of fifteen, and a TWO-ROUND BURST off one frame at four to
twenty a round with the scatter halved — two and a half times the damage
out of one squeeze at half the spread, which across a car park is the
difference between being shot at and being hit. The soldiers are
fireproof on the same flag the SWAT wear and they freeze on the same one;
the carrier is not, and is the most fire-resistant thing in the game —
fourteen times the armour of a hatchback and six times as long turning
black. The bore is still the answer to the men and it is still rationed.

AND THE CARRIER HOVERS, which is the first vehicle in this game that does
not touch the road. The model says nothing about it — a GLB has no
opinion — so all of it is in ArmyApc (js/vehicles.js). It rides
thirty-four units off the tarmac and it is never still and never level.

THE BREATH IS TWO SINES, on periods that do not divide into one another:
a four-second one with a ten-second swell under it. One sine on its own
is a metronome and the eye finds it in about three cycles; two is a thing
being held up by something that is not quite managing it. Seven units
either way when it is parked and a little under half that while it is
moving, at the user's request and for a reason — a hovercraft at speed is
held steadier by the ground under it and one standing still wallows, and
the bob you actually watch is the parked one. Measured: twenty-nine to
forty-one units of air standing, thirty-one to thirty-six on the road.

AND TWO MORE SLOW SINES put a degree of pitch and a degree and a half of
roll into it and take them out again. Those are not a movement, they are
what the SPRINGS SETTLE ONTO — `restPitch` and `restRoll`, which is how
the same suspension that serves a van serves this. A parked van's springs
reach zero and are then left alone for the rest of the night; a parked
carrier's are settling onto something that keeps moving, so it never
arrives and is never asleep. Two point two degrees of pitch drift and
three point one of roll, parked, measured over four hundred tics.

AND IT BANKS INTO ITS TURNS AND PITCHES UP TO STOP, which is SwatVan's
two springs with both signs turned over — and turned over for a reason
rather than for the look. A thing on springs leans OUT of a bend, because
the outside springs compress, and dips its nose to brake, because the
weight goes forward. A thing on THRUST has no springs and no weight to
move: to turn it points its lift into the bend, to stop it points its
lift forward. So it banks IN and it pitches nose UP. Given the same
braking left-hander, side by side in the test: the carrier +3.4 degrees
of pitch and -6.3 of roll, the van -2.9 and +2.3. Opposite in both axes,
and the carrier banks nearly three times as hard.

The angles are capped where they are because of the GROUND. At seven
degrees of pitch the nose drops fifteen units and at ten of bank the low
flank drops eleven, against thirty-four of hover with seven of breath in
it. It leans as far as it can without putting a corner through the
tarmac, and the test measures the lowest corner over a whole drive and
holds it against the hover at the bottom of its breath.

It throws GRIT: a puff under the skirts every three tics while it is
moving and every thirteen while it stands, which is what sells the hover
at a distance where seven units of bob is nothing. And you do not get to
walk under it — the three cylinders you cannot walk through stand on the
ground the way every other vehicle's do, and are as tall as the gap plus
the hull. A wreck loses the hover, because nothing that has stopped
working floats.

It is two hundred and sixty units nose to tail against the assault van's
two hundred and fourteen, and a hundred and thirty-three across against
its eighty-nine: an APC is not a longer van, it is a WIDER one. A hundred
and thirty-three is what fits a fire lane a hundred and sixty deep with
thirteen units of tarmac either side, which is the right amount — it fits,
and it looks like it only just does. It has no siren: two notes still, on
the same clock, but a low sawtooth that rises and falls instead of a
square wave that wails, which is the difference between a thing with an
engine and a thing with a warning.

AND THE FIRE LANE HOLDS NINE, which the curve asks past inside four
minutes. It used to mean the escalation quietly stopped at nine whenever
you were indoors — the one place the design's own "the curve does not
stop" was not true. When every bay is taken the next one now stands along
the perimeter road by the doors instead of not coming, which is the same
answer this file already gave for a player out in the car park. Three
minutes into a night spent inside: twenty-seven vehicles, fifty troopers
on their feet, a hundred and sixteen put on the ground so far.

THE REST OF js/responders.js is still the shape it was: one number, the
ALARM, climbing with how much of the store and the wood has gone and how
long anything has been alight, and six tiers — night manager, security,
the police, the fire brigade, riot police, the helicopter — each with an
alarm they are dispatched at and a delay before they would arrive. That
escalation is written and tested and still records a wave and returns;
the forces have a trigger of their own and do not wait for it.


THE SKY AND THE NAME
--------------------

The sky is a Polyhaven panorama (moonless_golf, CC0), baked by
tools/bake-sky.mjs to 1024 palette pixels round the horizon, on a sphere
that follows the camera. Stars survive the 8:1 downsample because a
block that holds a pixel far brighter than its average is pulled toward
that pixel — and only then, because doing it everywhere turns a night
into speckle.

The name is set in Michroma — the open-licensed cousin of the extended
square sans the Flight Simulator wordmark uses, bundled in assets/fonts
so nothing is fetched — as two SVG text lines held to one width by
textLength, GROCERY STORE small over SIMULATOR large, the pair skewed
together so they lean as one. The title screen is that and a way in,
over the car park standing still, with the eye wandering very slightly
so the picture breathes. Nothing else on it.


HOW IT IS BUILT
---------------

It is Doom's architecture, on purpose, because Doom's architecture is right
and because every piece of documentation about how Doom works is written in
its terms.

UNITS ARE DOOM UNITS. The player is 56 tall, 32 across, and steps up
anything 24 or under without noticing. A wall texture is 64 across and 64
up. That last one is the reason for the choice: at 64 units to a 64-pixel
texture the mapping between world and art is one texel to one unit,
everywhere, with no scale factor to carry around.

THE EYE IS AT 49, NOT 41. Doom's is 41 — and Doom drew that on a 4:3
monitor at 320x200, every pixel a fifth taller than it was wide, so the
eye it SHOWED was 41 stretched by 1.2, which is 49. This pipeline
rasterises square pixels — the buffer's height is fixed and its width
follows the window — so 49 here is Doom's eye as Doom showed it.

And it stays 49 with the PIXEL ASPECT set to 5:6, which looks like it
ought to stretch it twice and does not. That setting shapes the GRID the
finished frame is quantised onto, not the frame: the content of a
tall-pixel picture is identical to a square-pixel one, in taller squares.
Doom's 1.2 was a stretch of what it had drawn; this is not one. It was 41 for a long time and nothing
in the store said otherwise, because the store is Doom-sized: a gondola
is taller than you either way. The cars said otherwise. They are drawn at
32 units to the metre, a hatchback's roof is 45 units up, and from 41 the
player looked UP at a hatchback and a van read as a lorry. From 49 a
hatchback is looked down on and a van looked up at, which is what happens
to someone a metre seventy-five tall in a car park.

THE LEVEL IS SECTORS AND LINEDEFS. A sector is a floor height, a ceiling
height, a light level and two flats. A line has a sector on one side or on
both; two sides makes it a hole, with a bit of wall above (the gap between
the ceilings) and a bit of wall below (the gap between the floors). Every
piece of architecture in the store is one of those two pieces:

  a doorway         upper only
  a checkout        lower only, 40 tall, you can see over it
  a gondola         lower only, 80 tall — over your head, so an aisle is
                      a canyon and the next aisle is a different room
  a kerb            lower, 12 tall, walked over without noticing
  a shop fascia     upper, 96 tall, between the canopy soffit and the
                      canopy edge — a band across the front of a building
                      is a ceiling height, because that is the only thing
                      a sector engine has that draws a band
  a parapet         upper, from the canopy edge to the sky
  a produce bin     lower only, 40 tall, wearing crate boards, with the
                      divider between it and the next bin eight higher
  a freestanding    a HOLE: a ring of four thin sectors round a void, so
    object            that all four faces of the void are one-sided walls
                      carrying its picture. An object built out of an
                      absence, which is the only kind a sector engine can
                      make without a new primitive. The pylon sign at the
                      mouth of the car park was one. It has been taken
                      down; the trick has not.
  the back door     a sector whose ceiling is on the floor and rises

WALLS ARE THE GAPS. Two rectangles that touch become an opening between two
rooms — that is what touching means. A wall is drawn by NOT putting a
rectangle there: leave sixteen units between two rooms and the void between
them is the wall. A doorway is a small rectangle bridging that gap, which is
what a doorway is in a real building. js/maps/sellwrong.js reads as a floor
plan because of that one rule.

THE FRONT DOORS ARE THE EXCEPTION. Doom had exactly one door — a ceiling
that goes up — because the renderer could move a sector's height and could
not move anything sideways. Every door in the original game is that, dressed
differently. A supermarket entrance is the one thing that cannot fake:
everybody has walked through ten thousand sliding doors and a rising
portcullis at the front of a SellWrong would be the first thing anyone
noticed. So js/slidedoor.js draws the leaves as two quads on a track,
sitting in the MIDDLE of the sixteen-unit wall void so that opening one
slides it into the thickness of the wall, where there is nothing to draw and
nothing to z-fight with. What they share with a Doom door is the only part
that matters: a shut one sets `blocking` on the lines across the opening and
the collision system treats them as wall. Nothing else in the engine knows
they exist. They open for anybody, not just for you, and once the fire has
been through the entrance they jam part open and stop being a door.

THEY ARE 128 TALL, which is Doom's door height, two and a bit of you, and
the clear opening is 160, so a leaf is 80 wide and stands taller than it
is wide the way a sliding leaf does. They were 210 by 224 — three and
three quarters of you, each leaf wider than it was tall — and read as a
hangar. Above the leaves the entrance sector's ceiling comes down to the
door head, which turns the band between it and the soffit into that
sector's upper texture on both faces of the wall: glazing, a transom,
where there used to be twenty-two units of open air over a 210 door.

THE SIGNS CAME DOWN, at the user's request, and what they had in common is
worth writing down: every one of them was a WORD in a texture that tiles.
The store's fascia is a single 64-wide picture repeating the length of the
anchor, so SELLWRONG SUPERSTORE was written across the front of the
building about sixty times. A vacant shopfront is four tiles across and
four up, so the agent's TO LET board hung on the whitewash twenty-eight
times. The pylon at the mouth of the car park had the opposite problem and
the same cause: it was declared 340 tall on a wall 480 tall, so its board
appeared once where a board goes and then again two thirds of the way down
the post.

A word is a shape the eye locks onto and counts, which is the one thing a
tiling texture must not contain. What tiles honestly is the MATERIAL. So
the fascia keeps its red tray and gets a panel joint at every repeat, which
is a rhythm a fascia really has; the vacant unit keeps its whitewash, which
has no shape to count; the trolley rail loses its BAY plate and keeps the
bracket it was bolted to; and the pylon is gone along with the eight
rectangles that stood it up. One sign is left on the building and it is the
only one that was never a repeat: the logo over the entrance, which gets
GEOMETRY instead — four tiles hung as a two-by-two, drawn once at its own
size, which is why it was worth the two ceiling steps it costs.

A FIXTURE IS A RAISED FLOOR, AND THE FLOOR IS THE PART YOU LOOK AT. Every
department in the store is a rectangle with its floor lifted to bench or
gondola height and a lower texture round the edge, and every bit of care
here went into the edge, because the edge is what shows in a screenshot
taken from the end of an aisle. The tops were all SHELFBAK — perforated
gondola steel — because a fixture's top had always been gondola steel and
nothing had ever been looked down at.

For a chiller or a shelf run that is right. For fruit and veg it is the
whole department: a supermarket does not SHELVE produce, it BINS it, one
category to an open crate, and the way anybody shops it is by looking down
in. So produce is a run of four bins now — apples, citrus, greens, roots —
with a crate rim between each pair standing eight units proud, which is
enough to throw a shadow line and read as separate boxes from the end of
the aisle and low enough that the run is still one department from the
front of the store. The flowers are three more with pails in them. The
tops are their own pictures at 64 by 64, which is two metres of shop, so a
five-pixel apple is a fifteen-centimetre apple, and each bin is anchored
to its own corner so the packing starts at the crate edge rather than
wherever the world grid falls — the fix the parking bays needed, for the
same reason. Produce is also the brightest thing on that side of the
building, because it is the brightest thing in a real supermarket and for
the same reason: fruit under a dim fitting looks like fruit nobody wants.

THE MAP'S Y IS THE RENDERER'S MINUS Z. A map with x east and y north laid
onto a renderer with x east and z north is LEFT-handed, and everything
still works: movement, collision, the camera, the sprites, all of it
self-consistent, and the picture a mirror image of the floor plan. Nothing
in a supermarket is chiral, so nobody notices — until the day a shopfront
says TO LET and it comes out backwards, and so does the fascia, and so does
the sign at the mouth of the car park. Negating y reverses the screen
winding of every polygon, so every winding in mapgeo.js is written reversed
to match; that is not a style, it is the other half of the sign change.
All three of those signs have since come down. The fix stays, because the
logo over the entrance is still four tiles of artwork and would mirror
just as happily.

LIGHT FROM THE SKY IS NOT LIGHT FROM A FITTING. Doom diminished everything
by distance at one rate, which is right for a corridor and wrong the moment
a level has a car park seven thousand units across: the far end of the
parade came out as a black mass, because the far end of a CORRIDOR should.
So every vertex carries a `sky` term alongside its light — 1 outdoors, 0
indoors, 0.55 under the canopy — and the shader stretches the falloff and
lifts its floor by it. Nothing indoors changed at all.

ACTORS ARE STATE TABLES. Each state says which sprite frame, how many
tics, one function to call, and which state comes next. Read a run of them
out loud and you have the animation:

  RUN: A 4, A 4, B 4, B 4, C 4, C 4, D 4, D 4, and round again

Eight states, four drawings, 32 tics — a bit under a second, which is the
pace of a walk. A_Chase runs on every one of the eight, so the monster gets
eight chances a cycle to notice you have moved.

THE SWAT WALK ON IT. The two staff monsters that used that run of states
are gone, and for a long while the next two paragraphs described a
machine with nobody in it, kept exactly as it was because it was correct
and because getting it correct a second time from the same source would
have taken longer than reading it. Then the squad arrived (see THE ROAD,
AND WHO COMES DOWN IT) and walked on it without a line of it changing,
which is the argument for keeping correct code made in full.

THE CHASE IS P_NewChaseDir. A monster does not path-find. It picks whichever
of eight compass directions points most nearly at you, tries to walk that
way, and if it cannot, works through the others in a randomised order until
something gives. What comes out is a thing that confidently walks into a
shelf, hesitates, slides along it, finds the end and comes round — with no
graph, no nodes, and no map data at all. It refuses to turn round until
there is nothing else left, which is what stops monsters oscillating in a
doorway and is the detail most reimplementations drop.

THE WORLD RUNS AT 35 HZ, always. Every duration in the state tables is in
tics and every movement constant is per tic, so the frame time goes into an
accumulator and the world steps in whole tics. The renderer runs at whatever
rate it likes. Doom's movement numbers are used exactly —

  friction     0.90625 a tic
  walk thrust  0.78125   ->  8.33 u/tic terminal  (292 u/s)
  run thrust   1.5625    -> 16.66 u/tic terminal  (583 u/s)

— because terminal velocity is thrust over one-minus-friction, and those
awkward fractions are 25/32 and 50/32, the numbers in Doom's own table.


HOW IT LOOKS
------------

Everything is drawn into a buffer a few hundred pixels tall, filtered down
onto a grid of chunky pixels, and thrown at the screen with no smoothing.

THOSE ARE TWO SIZES AND THEY USED TO BE ONE. For most of this project's
life there was a single number — the buffer's height — answering two
questions at once: how much detail the world is drawn with, and how big a
pixel is. Which is how it worked in 1993, because the buffer WAS the
screen, and it is a bad control because the two answers pull opposite
ways. Turn it up for a sharper picture and the pixels vanish; turn it down
for the pixels and the far end of the shop turns to mush. There was no
setting at which the store was legible AND the picture was made of visible
squares, which is the look. So there are two now, both steppers in the
pause menu:

  RENDER    the buffer's height, 120 to 720, on [ and ]. How much the
            world is drawn with, and where the frame rate goes
  PIXELS    the height of the grid it is filtered onto, 120 to 600 or
            OFF, on shift-[ and shift-]. How big a pixel is, and it
            costs almost nothing

IT SHIPS AT 720 AND 200 with 5:6 pixels, at the user's request: the
finest render on the ladder filtered down onto the coarsest picture the
game has shipped — about 384 by 200 of tall pixels off an 1152 by 720
buffer, which is a 320x200-shaped picture with every chunky pixel the
average of roughly twenty rasterised ones. It was 600 and 300 before,
and the pair moved in opposite directions on purpose: the grid is the
LOOK and the buffer is the DETAIL BEHIND IT, so making the look coarser
is a reason to draw more behind it, not less.

The widths follow the window's shape either way, so a wider monitor shows
MORE STORE rather than the same store stretched, and the menu prints both
actual sizes beside their settings, because "400P" says nothing about how
wide it is and the width is where the pixels are.

FILTERED DOWN MEANS AVERAGED, which is the entire reason the two are worth
separating. Point-sampling a 600-row buffer onto a 200-row grid picks one
row in three and throws the rest away — a 200-row picture that cost three
times as much, and two controls that are one control wearing a hat.
Averaging each block spends the extra buffer on the CONTENT of the chunky
pixel instead: an edge falling two thirds of the way across a block comes
out two thirds of the way between the two colours. A 320x200 picture with
every square correct to an eighth of itself is a thing no 1993 machine
could draw, and it is what the setting is for.

AND THE PIXELS NEED NOT BE SQUARE, which is the PIXEL ASPECT ladder beside
them. 320x200 filling a 4:3 monitor is not a square-pixel mode and never
was: each pixel stood five wide to six tall, and every Doom sprite was
drawn by somebody looking at that screen, so a square-pixel 320x200 is a
squashed Doom. The setting is the width of one chunky pixel over its
height — SQUARE, TALL 5:6, or WIDE 7:6, which is a console's 256x224 on
the same screen — and the grid's width is the window's shape divided by
it. Ask for 5:6 at two hundred rows on a 4:3 window and you get 320x200,
which is not a coincidence and is the whole of the arithmetic.

Nothing about the world moves when that changes. The camera reads the
BUFFER's shape and the buffer's pixels are always square; the grid is a
quantisation laid over a finished frame, and quantising a frame
anisotropically does not stretch what is in it. Two things fall out of
that and are held by the smoke test: OFF means OFF rather than "square",
because with no grid of its own there is nothing for an aspect to be the
aspect of; and when the buffer has not got the columns a shape asks for,
it is the ROW COUNT that gives way and not the shape, because tall pixels
need more columns than square ones and clamping the width would quietly
hand back square pixels and a control that looks broken.

The status bar and the weapon go into the same buffer and through the same
filter, because a crisp overlay on a chunky world reads as a filter applied
to a photograph. The bar is laid out in CHUNKY pixels rather than buffer
ones — its camera is orthographic, so its extents are a unit of measure
rather than a resolution — which is what keeps it the same size on screen
when RENDER moves, and at a whole-number ratio the block average puts each
of its texels back exactly. It is two bars now, and the four numbers and
the notifications that used to be up there are gone at the user's request;
the machinery that posted a message is gone with them rather than left
standing unread.

AND NOTHING IN FRONT OF A WALL IS A WALL, which had been quietly wrong
since the soot went in. Every sprite in the game shares the fragment
shader with the walls, and the block that asks the burn grid "how burnt is
the floor here" is the right question for a surface and the wrong one for
a thing standing on it: shoppers were being given the soot and the live
coals of whatever they stood over, and the smoke — which drifts, and so
sampled a different part of the grid every frame — had the fire's coals
CRAWLING across it. It is a define now, set by the wall material and by
nothing else. Walls, floors, ceilings, the ruined roof steel and the
vehicles are surfaces and burn; sprites are things in front of them.

THE SMOKE ALSO STEPPED. The churn, the sway and the lift all came off the
whole tic count, which advances thirty-five times a second while the
renderer runs at sixty or more, so every drifting puff moved in visible
jerks beside a camera that did not. They read a clock with the fraction
still on it now. The body of smoke over the fire went from eight frames
to sixteen — the loop was always exact, it just was not fine, and a step
every eleven tics of a sprite that size is long enough to watch it hold
still — and each puff KEEPS the cell it is standing over between frames
instead of being re-dealt off a list that re-sorts itself, which is what
had thirty-six of them teleporting. The drifting puffs were four
independent noise fields, so walking them was not a churn but four cuts;
they are eight frames of one field scrolled by an eighth of its height,
which loops.

THREE PASSES, AND IT IS CHEAPER THAN THE TWO IT REPLACED. World into the
buffer; buffer onto the grid, averaged and dithered and snapped; grid onto
the screen, nearest, no arithmetic at all. The palette search used to run
once per SCREEN pixel — two million of them on a 1080p monitor — and now
runs once per chunky pixel, which at 320x200 is sixty-four thousand.

WHAT TO SPEND THE FRAME ON. Four settings, and they are in the order of
what they are worth, measured:

  RENDER    the buffer's height, now up to 720. Halving it quarters the pixels, and on
            anything with a weak fill rate that is the whole answer.
            PIXELS is not on this list: it is a look, not a cost, and
            turning it down does not make the world any cheaper to draw
  THE WOOD  how far into the trees the chunks are kept. Twenty-eight
            thousand plants in distance-culled chunks, and pulling the
            range in was worth two to three times the frame rate on its
            own — the single biggest thing in the frame
  CROWD     how many of the standees are drawn. Seven hundred billboards
            are seven hundred draw calls, because a quad the shader
            turns cannot be batched with the next one
  EFFECTS   how much of the fire's sprite pool gets used. The candidates
            are sorted nearest-and-hottest first, so spending less of it
            drops the far, cold end, which is the right end to drop

NONE OF THEM TOUCHES THE SIMULATION. The shop is the same shop at every
setting: the same seven hundred and thirty-six people, walking the same
way, running from the same fire and getting out of the same doors. Only
the drawing is cheaper. A crowd setting that spawned fewer people would
change who gets out of the building alive, and the smoke test holds that
line — four hundred tics at the lowest setting, and the cast list is
unchanged.

AND THE CROWD CULLS ITSELF. Every standee is its own mesh with its own
material, because the quad is spun and scaled by uniforms, and the meshes
say frustumCulled = false — a quad the shader turns has bounds that are a
lie, so three.js is not allowed to cull any of them. It was therefore
drawing all seven hundred every frame, however far away and whether or
not they were behind you. Actor.render does it instead, with the two
tests that are safe for a billboard: behind the camera PLANE (which every
sprite in the game is turned to, so a thing behind it is edge-on and
invisible by construction) and too far to matter. The cone is generous —
eighty degrees against a field of about forty-eight, because a sprite is
as wide as it is and popping one in at the edge of the screen is worse
than drawing it — and it still takes the shop from about a thousand draw
calls to under eight hundred, and to under five hundred when you turn
round and face a wall.

256 COLOURS. Fourteen ramps, generated, so nothing here is anybody's palette
and there is nothing to attribute. A ramp is a list of stops with the middle
one deliberately off the straight line between the ends, because
interpolating a light brown to black gives a dead grey-brown that no real
material does. Fire gets seven stops and 44 of the 256 entries, because the
store burning down is the only thing anyone is going to look at closely.

Colours are snapped to the palette on the GPU through a 32x32x32 lookup
cube, built once at start-up, flattened into a 1024x32 texture. Dither
first, then snap: dithering afterwards would put back colours the palette
does not contain.

THE FIRE IS THE ONE THING DRAWN ADDITIVELY, at the user's request, and it
is the one thing in the game that should be. Doom had exactly one way of
drawing a sprite — a cut-out, every pixel either there or not — and
everything here that is a THING is drawn that way. Fire is not a thing.
Two flames overlapping are brighter than one flame, and it is the adding
that makes a mass of flame read as a source of light rather than as
orange wallpaper. So the flame material adds to the frame buffer and
writes no depth, and the soft edge the flame generator always drew and
the alpha test always threw away is finally being used for something.

A CLUMP, NOT A FLAME. One sprite per fuel cell puts one flame every
thirty-two units on a grid, and a grid was exactly what you saw. Each
cell now gets between one and three, scattered inside it and a little
past it, at offsets HASHED off the cell index and the slot — so the
scatter is random but it is the same random every frame, and the fire
does not boil. Everything that moves in it moves because the flame art is
animating.

BIG IN THE MIDDLE, SMALL AT THE EDGE. `core` is how surrounded by heat a
cell is: the mean of its four neighbours' heat, which is a number the
simulation already has, so it costs four array reads. A cell in the
middle of a burning gondola has hot neighbours in every direction and
gets three big flames; a cell on the advancing front has cold ones and
gets a single small one. That is the shape of a real fire — a bright body
with a ragged fringe. It picks the SET as well as the scale: the outer
members of a clump come off the size below, so a small flame is genuinely
a smaller drawing rather than a big one shrunk.

AND IT SHRINKS FOR BEING CLOSE, which is the same problem the particle
system solved from the other end. The near cull only refuses a flame
within forty-six units of the eye and it was written when a flame was a
hundred and fifty units tall; a two-hundred-unit blaze on top of the
gondola BESIDE you is a hundred and forty away, passes the cull, and
covers half the screen. Standing in a burning aisle should be alarming
and it should not be opaque. So a flame shrinks with its own distance,
down to two fifths at the near cull. What that costs is a fire that is
not perspective-correct at arm's length, which nobody can see; what it
buys is that you can still find the door.

AND THERE IS SMOKE STANDING ON IT. A fire without smoke is a light.
Everything you would actually notice about a burning supermarket from the
car park is the smoke: it is bigger than the flames by a factor of ten,
it is the thing that gets into the aisle you were about to walk down, and
it is the only part of a fire still there after the fire is out. There
were already drifting puffs — particles, which go where the wind takes
them — and no BODY of it on the fire itself. Now there is: billboards
parked over the cells with the highest core, at a height that rises with
it, alpha-blended and NOT fullbright, so the one fire light in the game
lights them from underneath. Both halves are wanted. A plume that does
not shed is a prop; puffs with nothing under them are litter.

The art churns and loops exactly, by a trick the noise makes free: the
lattice wraps after h rows, so sampling it with a vertical offset of
h/count per frame comes back to itself after count frames. The same field
decides the silhouette AND the shading, so the scroll that stirs the
inside also eats the outline — which is what separates smoke from a grey
ball with a pattern on it. It is the one piece of art here that is not
snapped to the palette: a cut-out edge is what makes a Doom sprite a Doom
sprite and it is exactly wrong for smoke, which has no edge.

LIGHT STEPS, IT DOES NOT FADE. Doom did not multiply a surface by a light
level, it kept 32 pre-darkened copies of the palette and picked one. So
brightness drops a BAND at a time down a dark aisle, and those steps are
half the atmosphere. The material shader quantises light to 32 levels before
it uses it. Doom's fake contrast comes with the same idea: walls running
east-west read a notch brighter and north-south a notch darker, so a corner
is visible in a renderer that does no shading at all.

THE LIGHTS ARE PAINT, NOT OBJECTS. A suspended ceiling is a grid of tiles
with a fluorescent fitting every so often, and "every so often" is the
problem: a 64-pixel texture tiling every 64 units puts a fitting in every
tile. So the ceiling texture is declared as 256 units square — one texture
is a 4x4 block of tiles with a single fitting in it — and the sources land
every 256 units at the same offset. A texel is four units instead of one,
which is nothing on a surface three metres over your head.

There used to be a LAMP SPRITE as well: a suspended troffer hung 34 units
under the ceiling, drawn four ways, with a six-state ring for the
stuttering ones. It is gone at the user's request — the fitting is the
ceiling texture and nothing else. What that costs and what it buys is
below.

THE FITTING IS THE USER'S, from a reference photograph: a four-tube
recessed troffer behind a prismatic diffuser, dark lampholders at both
ends of every tube, a pale works-painted tray with a flange round it.
Thirty-two texels by fourteen is what a 256-unit ceiling texture has to
spend on one, and the ribs are the whole look of a prismatic diffuser
and are two texels wide — one for the facet that faces the light and one
for the one that does not. At one texel they alias into a flat grey the
moment the ceiling is at an angle, which is always, because it is a
ceiling.

THE PLAID IS THE PICTURE, and that is worth saying because it looks like
a mistake. Ribs run across the fitting the short way and four tubes glow
along it the long way, so the face of a fitting is crossed both ways.
The first cut washed the tube rows and the gaps between them by
different amounts and the crossing came out as a chequerboard, which is
what a diffuser does not look like; one alpha the whole height of the
tray fixes it. The bands then have to BEAT the ribs — two bright texels
against one dim one, and the ribs faint enough to be only a shine taken
off — or the fitting reads as a grille, and a grille in a ceiling is not
a light, it is a vent.

AND IT HAD TO BECOME A LIGHT THAT IS ON. The texture was originally drawn
as a fitting that is OFF, on purpose, because the sprite was doing the lit
part: pale ribbed glass at about the brightness of the tiles round it,
neither a hole nor a lamp. With the sprite gone that is a shop full of
switched-off fittings, which looks like a power cut. So the tubes are the
only thing in the game drawn at the very top of a ramp, the tray behind
them is near-white, and the tiles for five texels around the flange are
washed paler — that last part is what actually says the thing is on,
because you can tell from a ceiling alone whether a shop's lights are lit,
and what you are reading is the spill on the tiles. The flange's SHADOW
went with it: a fitting that is lit does not cast one onto the tiles it is
lighting. Measured, in the smoke test, because a flat has no opinion about
whether it is meant to be a light and nothing else in the game would say
so: the fitting is 0.74 against 0.54 of ceiling tile, 0.63 for the tiles
beside it, four bands read as four, and the darkest texel in it is a
lampholder at 0.15. Without the holders a lit troffer at this size is a
white slab, and a white slab in a ceiling is a hole.

A COOL TUBE OVER WARM PAINT. Grey at the top of its ramp is 248,248,252
and bone at the top is 244,238,216 — the same luminance, a different
white — and that split is what makes white read as LIGHT rather than as
more white paint. It is also the entire reason the palette has two
near-whites.

WHAT IT COSTS: every fitting in the shop is now the same fitting, because
a tiling texture cannot be anything else. One in fourteen used to have a
tube gone and one in eleven used to stutter, and both of those were
sprites; the hash that picked them is gone too, because a dim patch under
a fitting that still looks perfect reads as a bug rather than as a
knackered shop.

WHAT IT BUYS, and this was the old objection to painting a light into a
ceiling — that it stays lit after you have broken it — is answered by the
renderer instead of by a sprite. A flat is shaded by its sector's light
level like every other surface, and the sector's light level IS these
fittings. Kill the lights over an aisle and the ceiling that was throwing
the light goes down with the aisle it was throwing it on.

A LIGHT IS STILL AN OBJECT, with no state and no sprite — the second such
thing in the game after a parked vehicle. It exists for its position, so
the relight pass knows where the sources are, and for its box, so a shot
or a fire can take it out. Ten health. Shoot it, or let a fire get under
it (the burn check is two-dimensional, so anything alight on the floor
below will eventually take out the light above it), and it throws sparks
that fall, pops, and the aisle goes dark for the rest of the level.

AND THE FIRE DOES MORE THAN DARKEN IT. Charring is a filter over pixels:
it can make a light fitting darker, and a darker picture of a light is
still a picture of a light — which is exactly what the first attempt
produced, a gutted black ceiling with four crisp lit panels in it. So the
charred ceiling has the fitting drawn again over it, dead: four broken
tube stubs with pieces missing, no diffuser at all (the glass is the first
thing off a fitting that has been in a fire), the flange's shadow back,
the ballast's scorch, and a few embers still in the tray. It is the one
texture in the game with a hand-drawn charred half, and it measures 0.17
against 0.33 for the burnt ceiling around it — darker than what it is set
in, which is what a dead recess is.

A sector's brightness is its own AMBIENT — emergency lighting, whatever
comes through the front — plus every working fitting that can see it. So
shooting one out genuinely takes light away, and a fire working its way
along a run of them puts an aisle out a section at a time. The reach test
is done near the ceiling on purpose: walls run floor to ceiling and stop
it, but a gondola is only 80 tall under a 352 ceiling, so light passes over
the shelves into the next aisle, which is what light does.

A sector is lit by the AVERAGE over sample points across its area, not by
the value at one place in it. The first version measured each lamp against
the nearest point of the sector's bounding box, which for a 600-unit aisle
is distance zero from every fitting along its length — so every sector
summed four or five lamps at full strength, clamped, and shooting them out
changed nothing anywhere. A long room is not close to a lamp; parts of it
are.

ONE MORE LIGHT, for the fire. Everything else is unlit, but a store that is
burning down and does not get brighter as it burns is not really burning. It
parks itself at the centre of mass of whatever is alight nearest you, and it
is added after the light is quantised, so the glow slides smoothly over the
banding instead of fighting it.


THE ART
-------

The store's own art is not an image file anywhere. Two reasons, and the
second is the real one: it loads instantly, and everything comes out of
the same box of parts so it all matches. The light comes from the top left in every
texture and every sprite — a rule, not a parameter, because a rivet lit from
the left next to a panel lit from the right is the loudest way to make a
wall look wrong.

MAX 64 PIXELS, everywhere. That is not a limitation, it is the brief. What
survives the cut, in every texture: one big shape you can read across the
store, one lit edge, and dirt at the bottom. Anything finer is gone by the
second repeat.

TWO THINGS ARE NOT DRAWN BY CODE, and could not be: the LOGO, because a
procedural approximation of somebody's logo is not their logo, and the
WEAPON, because it is a photograph of a piece of kit and there is no set
of primitives that gets you there. They live in art/ as PNGs and
tools/bake-art.mjs turns them into source — cut out (by brightness for
the logo, by chroma key for the weapon), resampled, snapped to the game's
own 256 colours, run-length encoded into js/art-data.js. Nothing is
fetched at run time and there is still no build step: the build step is
that file, run by hand, when the art changes.

Neither gets an exemption from the 64-pixel rule; they get GEOMETRY
instead. The logo is four 64x64 tiles hung as a two-by-two on the
entrance tower — two ceiling steps for the rows, one vertical split for
the columns — because a sector engine cannot draw a big picture but it
can draw four small ones next to each other, which is the same thing and
is how every large sign in Doom was done. The weapon is one tile with its
top third left empty, and that empty third is where the muzzle flame is
drawn, in code, per frame: one still gun and a separate flash, exactly
how Doom's weapons worked and why they only ever needed one drawing.

THE FIRE IS DRAWN, and js/fireart.js is the whole of it: the flame on a
shelf, the blaze a gondola becomes, the ember guttering afterwards, the
fire climbing a fir, the pilot light and the muzzle flash. One generator,
four sizes, so all of it is visibly the same fire.

IT IS A CHAIN OF CIRCLES — a ball at the foot and smaller ones going up
to a point — with a noise field scrolling upward that eats into the edge
and pushes tongues out of it, and an axis that sways, anchored at the
foot and loosest at the tip. Brightness is banded into eight steps, which
is the difference between a painted flame and an airbrushed one.

THE ROUND BOTTOM IS THE INVARIANT and it is why the file exists. The
widest circle is the LOWEST one, so every circle above it is smaller and
sits higher, so nothing in the chain can reach below the foot and the
underside of the shape is the underside of one circle. It cannot come out
flat. What was there before was four painted strips from the golf project
put through a mask that pinched their feet in from the sides — and a mask
cannot round a bottom, because narrowing a flat edge leaves a narrower
flat edge. Measured the only way that means anything, column by column,
the strips' bottom edge rose four per cent of the flame's width from the
middle to the sides. These rise thirty.

AND IT LOOPS EXACTLY, which the PSX Doom routine that used to be here
could not: that is a simulation, and a simulation cannot be made to come
back to where it started. Something is alight for most of the game, so a
pop once a second is the thing a player would notice about the fire. The
noise lattice wraps after a whole number of rows and the scroll over a
loop is exactly that distance, so the last frame hands back to the first
with nothing moving.

THE PEOPLE ARE STANDEES, and there used to be a whole machine here for
making them something else. Two staff monsters, the Zombieman and the Imp
with the numbers filed off, built by posing a small articulated figure in
3D and flattening it to eight views per frame, then replaced by Freedoom's
player sprite with a smiley face over the visor and an apron painted onto
the armour. All of it is gone — the figure, the rig, the walk cycles, the
hundred and two frames, the two Python scripts that painted them — and
what stands in the aisles now is seventeen painted characters out of
github.com/verdictzero/galvarius, one drawing each.

One drawing each is the whole design and not a corner cut. Eight rotations
faked by mirroring one view look wrong from seven of the eight. A walk
cycle faked by sliding one drawing about looks wrong from all of them. So a
shopper does not walk, and every side of one is the front — which is how
Doom drew anything it only had one picture of, and it is what the actor's
`flat` flag has always meant. (The SWAT are the exception and the proof:
they were DRAWN from five sides, so they turn — see below.) They SWAY instead: two sines phased off the
actor's own id, an inch and a half of lean and half an inch of bob, in a
direction that also comes off the id so that no two of them move together.
It is a drawing offset and nothing in the simulation moves. On the title
screen, where the world is not being stepped at all, they are perfectly
still, which is what the title screen is for.

Seventeen people, thirteen pieces of one, three splats and twenty-six
frames of fireball come over in four STRIPS: one picture per kind, equal
cells, laid out left to right. tools/prep-people.mjs writes them and
js/people.js declares the cell sizes both sides agree on, so there is one
set of numbers rather than two that have to match.

Getting somebody else's art down to this game's scale is mostly one
decision and one trap. The decision is to scale every character by the SAME
factor — worked out from the 575 pixels a standing adult is drawn at over
there — rather than stretching each to a common height: three of these
drawings are of somebody crouching or sitting, and normalising by height
would stand them up into giants. The trap is the filter. A box filter that
averages colour and alpha separately drags the colour of every transparent
pixel into its neighbours, and at ten to one that puts a halo of whatever
was in the margins around every character; multiplying by coverage first
and dividing back out afterwards is the fix, and the alpha then gets a
small gain because a limb four pixels wide arrives as four tenths of one.

The fireball is the one set that is NOT trimmed to its contents. Its thirty
frames are one drawing moving inside a fixed window — the ball leaves the
ground, climbs, spreads — so the window IS the animation, and trimming each
frame would scale them all back to the same size and turn a rising mushroom
into a flickering still. It is resampled to twenty-six because a frame is a
letter and the letters stop at Z.

THE SWAT ARE THE USER'S SHEET, and the first people in the game with
ROTATIONS: eleven rows on a magenta ground, the first seven of them five
views of one pose — head on, a quarter turn, side on, three quarters, from
behind — and the rest a death, three frames of lying there and nine of
coming apart, drawn from the front only. That is Doom's own economy
exactly: five drawings, and rotations 1, 2 and 3 are the mirror of 7, 6
and 5, which js/people.js says in a table (SWAT_ROTATIONS) and
Pix.mirrored does. A trooper walking away from you shows you his back,
which no shopper can, and it is the whole of what makes a thing you can
walk round read as a thing rather than a card.

tools/prep-troops.mjs cuts it (it was tools/prep-swat.mjs until a second
sheet arrived; see THE ARMY TROOPER below), and two things about that were
harder than they sound. THE SHEET IS A JPEG, so the magenta is not a colour but a
cloud of them and every edge carries a halo where the ground bled into the
ink; the tool measures how magenta each pixel is, spends that number as
the pixel's transparency, and unmixes the magenta back out of what colour
is left, so a halo pixel a third magenta becomes a two-thirds-opaque
pixel of the colour it was hiding. AND THE CELLS ARE NOT ON A GRID: the
widest side view is twice the width of the narrowest back view and the
lying frames are stacked three high in the last column, so the cells are
FOUND — an XY cut, splitting on empty rows and then empty columns and
again until nothing splits — with one seam found by hand, where the death
row's blood reaches the gore row under it. Sixty tall, a shade under the
crowd's sixty-two, because the frame of somebody coming apart is taller
than the somebody and the sixty-four-pixel rule is a rule.

THE ARMY TROOPER IS THE USER'S SECOND SHEET, prepared the same way and,
at the user's request, NOT YET IN THE GAME. Same artist, same eleven rows
in the same order — seven poses in five views, the fall, the three lying
frames stacked in the last column, the nine of coming apart — on the same
magenta, as a JPEG again, decoded in a browser to art/people/army_sheet.png
and cut by the same tool into assets/people/army.png: fifty-one cells,
sixty-four square, in the order the SWAT's are. The tool is driven by a
table now (TROOPS in js/people.js: which sheet, which strip, how tall,
how much lift) and the SWAT strip it writes is byte for byte the one the
old tool wrote, which was checked when it was renamed. THE SAME SIXTY
TALL, so the two stand level side by side — and at that scale three of
the army's floor frames, the last splatter and the two pools a body ends
as, come out sixty-five, seventy-one and seventy-two across against a
cell of sixty-four. The SWAT's sheet happened to fit; this one does not,
by a few columns of the thin smear at a pool's edge. Scaling the whole
figure down until the pools fit makes a trooper fifty-three tall beside a
SWAT at sixty, so instead a FLOOR frame — never the figure — may lose up
to eight columns off its two edges, and the tool says what fraction of
the ink that was: a tenth of a per cent of the splatter, four per cent of
one pool and two of the other, all of it the tail of a smear. A QUARTER
OF THE LIFT is the
other number of the army's own — 0.85 against the SWAT's 0.62 — because
the tone curve that rescued
navy from the dark would turn tan and olive pale: the army figure is drawn
three and a half times brighter in linear than the SWAT to begin with, and
the tool prints the figure's mean before and after so the next sheet can
be set by the same number. addTroops reads either strip back into the
bank under its own name, the smoke test proves both, and that is the
whole of what exists: no actor, no states, nothing loads it, and the
letters mean nothing until there is one. When there is, THE SWAT in
js/states.js is the table to copy, letter for letter.


THE CAR PARK IS ONE VAN, THREE DOZEN TIMES, at the user's request, and
it arrived MODELLED — a GLB, dropped in as it is. There is no other kind
of vehicle in the project now: the system that built seven of them out of
four drawings each is deleted, and there is an obituary for it further
down, because it was a good piece of work aimed at the wrong question.

WHAT IS LEFT IS SHORT. The file's own triangles, its own UVs, its own
texture, drawn both sides. A second GLB would drop in beside this one
with no new code at all, which is the thing the old system could never
say — and then one did, the police van, and it cost eight lines: the
loader was taking the FIRST image in the file for the sheet, and the
police van arrives with four (emissive, normal, diffuse, metal-rough, in
that order), so the first cut of it was painted with a flat black
emissive map. A GLB says which picture is the colour — the material's
baseColorTexture — and the loader asks it now. See THE ROAD, AND WHO
COMES DOWN IT for what the van does.

AND THEY ARE NOT ALL THE SAME COLOUR, at the user's request. One model
in every bay is a delivery fleet, which was a joke worth exactly one
look; a car park is what this is meant to be, and a car park is a dozen
colours of the same few shapes. It is still one model, one texture and
one draw call — that was the thing worth keeping — so a red van is not
a second file. It is the same texel, multiplied.

THE WHITE IS ISOLATED IN THE SHADER, out of the texel itself, rather
than painted into a copy of the sheet by hand. The van's paint is white:
bright and dead neutral. Everything that must not take the colour — the
grille, the bumpers, the tyres, the glass — is far darker. So a
luminance ramp with a saturation guard picks out the bodywork exactly,
and it does it per TEXEL, which is the whole reason it looks like paint:
every bit of shading the artist put in the sheet survives, so the
shadowed flank of a blue van is dark blue and the lit roof is bright
blue. A flat colour over the body would have thrown all of that away.
Nineteen per cent of the sheet is paint, eight per cent is the shading
on it, and the shading takes a part of the colour, which is the bit that
sells it.

THE COLOUR RIDES IN A CHANNEL THAT WAS ALREADY THERE. Every vehicle
vertex already carried an `ink` — what an untextured surface is painted,
for the flat materials glTF allows, with a flag saying whether to use
it. When the flag is off, the three numbers beside it were zeroes saying
nothing. They are the paint now. One attribute, two meanings, no new
bytes: a surface with no picture IS that colour, and a surface with one
has its white multiplied by it.

IN LINEAR, AND THAT IS THE WHOLE TRAP. The sheet is an sRGB texture and
is decoded on the way out of the sampler, so the numbers in the shader
are not the numbers a colour picker says about the PNG. Set off the file
— paint at 0.75 to 0.94, ramp from 0.55 — the ramp caught only the
brightest highlights, and what came out was a white van with a red
pinstripe down every edge. Measured in linear instead: background 0.06,
tyres and grille under 0.09, glass 0.28, the darkest shadowed paint
0.53, a lit panel 0.67, the roof 0.78. The ramp goes between the glass
and the shadow.

WHICH BAY GETS WHICH is a hash of the bay's own position and not a fresh
random, for two reasons: the map lays the lot out with its own seeded
stream and drawing from it here would move every number after it, which
is most of the level; and a fleet that is the same fleet every time the
level is built is a fleet you can take a screenshot of twice. The quiet
colours are in the list twice, which is the cheapest weighting there is
— a real car park is mostly white, silver and beige with a few colours
in it, and a list sampled evenly puts a turquoise van in every eighth
bay.

AND NOTHING IS AS DARK AS A VAN REALLY IS, because this multiplies
twice: the sheet's own shading, and then a car park at dusk on top of
it. The first palette was picked at the values a van is actually painted
— 0.24 to 0.6 — and the lot came out as two whites and ten grey shapes
with wheels.

WHAT A MODELLED VEHICLE NEEDS, AND IT IS NOTHING. There is no
preparation step and no tool: assets/models/van.glb is the author's own
export, byte for byte, and js/car.js reads it as it stands. It walks the
scene graph, multiplies the node matrices through, puts the triangles
into the space the game speaks — x +0.5 at the nose, y to the vehicle's
left, z 0 on the ground, all as fractions of the length — and measures
the width and height off the triangles themselves, which is what the
collision and the tumble want. The ONE number that is not in the file is
how long a van is in game units, and that is a fact about the game rather
than about the model: a bay is 186 across and a shopper is 62 tall, so
VAN_LENGTH is 174 and everything else follows from the model's own
proportions.

THERE USED TO BE A TOOL. tools/prep-van.mjs halved the texture, snapped
it to the game's 256 colours, painted a dark block into a corner of the
sheet for the untextured triangles to point at, and wrote the axes it had
measured into asset.extras. All of it is deleted, at the user's request:
the model's textures and UVs are deliberately configured as they are, and
a game that rewrites an asset on the way in is a game arguing with its
own author.

THE MODEL'S OWN UVs ARE USED, and getting there took four attempts, three
of which shipped. The mesh is unwrapped onto the very sheet embedded in
it, which is why it renders correctly in Blender and on Sketchfab, and
for three rounds this game painted it by projection instead — on the
strength of a measurement that said the flanks were a fan of long thin
triangles all sharing one corner.

That measurement pooled BOTH primitives of the van of the day. The
flat-black one had no texture, so its UVs were unused junk — 490
triangles "covering" 321 per cent of the sheet, which cannot be a layout
at all — and the junk was the fan. Drawing the UV layout over the texture
PER PRIMITIVE is what finally showed it; drawing it over both at once is
what hid it.

THE VAN IN THE LOT NOW IS ONE MATERIAL AND ONE UNWRAP, and every triangle
of it is on the sheet: 1,050 of them over 38 per cent of it, the biggest
covering one per cent. The layout is a four-view PROJECTION drawn into
the file — the flanks onto the side elevation, the roof onto the plan,
the nose and the tail onto theirs — which is the same mapping the deleted
fleet used to compute, made by hand by somebody who could see it. It is
also what made the next bug visible in one screenshot.

WHICH WAY UP THE SHEET GOES, and this one stood for a whole model.
glTF puts v's origin at the TOP-LEFT of the image and GL puts t's at the
bottom, so exactly one turn has to happen somewhere. There were two:
`1 - v` on the way out of the model AND `flipY` on the texture, which
looks symmetrical, reads as careful, and is wrong — `flipY` is quietly
IGNORED for an ImageBitmap, which is what a texture packed inside a GLB
is decoded into. So one turn happened instead of two, and every panel of
every van in the car park wore the wrong half of its own sheet: flanks
painted with the front elevation, grille and headlights down the side.

Nothing caught it because nothing could. The van it was written for had
134 textured triangles on a sheet of white bodywork and 490 flat black
ones over them, and a white van painted with the wrong view of a white
van is still a white van. Replacing it with a model unwrapped all over
put a radiator grille down the side of thirty-six vehicles at once.

The sheet goes up the way it is stored now — `flipY = false` and the
model's own v untouched, which is what js/glb.js had always done for the
gun — and the smoke test pins BOTH halves, because either one alone is
the same trap set again.

AND IT IS DRAWN BOTH SIDES, which was the other half of the same lesson.
The file declares which way a face points twice — the winding of its
corners and the NORMAL on them — and both declarations disagree with the
SOLID: this shell comes to minus a quarter of its own bounding box, which
is a surface wound inward. The van before it was two shells wound against
each other, the body at minus a third of its box and the chassis at plus
a tenth, and the first attempt at a fix was a single flip: reverse
everything when the total volume comes out negative. That turned the body
the right way out and the chassis inside out with it, and the car park
went from vans seen from the inside to vans with no bodywork.

The model is not wrong. Blender and Sketchfab both draw BOTH SIDES of a
single-sided material by default, and that is the entire oversight — this
renderer culls back faces, and the model was authored where that never
mattered. Vehicles are double-sided now, the winding is left exactly as
the file has it, and a vehicle is a thin shell you are never inside, so
the cost is drawing the far face of a solid that already covers it.

The NORMALS are still turned outward from the model's own centre, 582 of
the 1,050, because the face light reads them: Doom's fake contrast wants to
know whether a face is a roof, an underside or a flank, and a roof
triangle whose normal points down is given the tarmac's light, which is a
third of the brightness. That IS a heuristic, and it is used for the
light and nothing else — a triangle it guesses wrong about is one step of
shading out on one face. It can no longer cull anything or choose
anybody's paint, which is exactly what made the same guess fatal when the
projection depended on it.

AN UNTEXTURED MATERIAL RIDES IN THE VERTICES, which is how the car park
stays one draw call. The van in the lot has no such material — all 1,050
of its triangles are on the sheet — but the one before it was two: the
body, unwrapped, and van_black, which was glass, tyres, bumpers and
chassis, 490 of its 624 triangles, with no texture at all and just a flat
baseColorFactor of 0.0059367 linear, about 18 of 255 on a screen.

glTF allows that and so does the reader, because a second material is a
second draw call for every slab of parked cars. Every vertex carries the
colour ITS OWN material declared plus a one-or-nothing saying whether to
use it, in an `ink` attribute, and js/material.js mixes between the sheet
and that colour in the fragment shader. The number goes through
UNTOUCHED: baseColorFactor is linear and an sRGB texture is decoded to
linear when the GPU samples it, so both sides of the mix are already in
the same space. The deleted tool used to paint a lifted version of that
colour into a corner of the sheet and point 490 triangles at it.

With nobody using it the path would rot, so it is held against a
hand-built two-primitive file in the smoke test rather than deleted for
want of a user: drop in a model that declares a flat colour and it still
comes out wearing it, through the clip and into the debris.

AND WHICH END IS THE NOSE IS IN THE FILE AFTER ALL — in the format, not
in the asset. glTF says +Y is up and that the front of an asset faces +Z,
so the nose is +Z and the left flank is +X, and the swap from (z, x, y)
to (nose, left, up) is a cyclic permutation that preserves handedness.
This used to be established by rendering four orthographic views in a
scratch script and looking at which end had the grille in it, which is a
fine way to check a convention and a poor way to have one. The only thing
asserted at load is that the model IS longest along +Z, because a van
that is not is a van exported facing some other way, and the honest time
to find that out is the moment it is read.

AND THE TEXTURE IS THE FILE'S OWN, at its own size. It is a 512x256
four-view turnaround — front, rear, side and plan on a flat grey field —
used as it is. The model is 198K, of which 158K is that PNG, and it is
downloaded once.

BUT IT IS POINT SAMPLED WHETHER IT ASKS TO BE OR NOT, at the user's
request, and so is every other model this game imports: NEAREST
magnified, NEAREST_MIPMAP_NEAREST minified, which is exactly what
js/textures.js does to the walls and floors. This renderer point-samples
everything — the walls, the sprites, the sky, the fire, the HUD — and the
whole look of the game is downstream of that.

It used to be the file's own sampler, on the grounds that a model is a
self-describing thing and its author had an opinion. The van agreed with
the game, because it is exported NEAREST, so for a long while there was
nothing to notice. Every model since has asked for LINEAR — which is
simply what a modelling program writes by default — and got it: five of
the six, the gun in your hands among them, were going through a bilinear
filter that softened them against a world that is not soft. Held side by
side at full resolution with one property flipped, the lettering down the
flank of a police van goes from feathered to hard-edged and the frame
carries fourteen per cent more edge.

Mipmaps stay ON, which is the one part that is not simply "nearest".
Without them a minified surface boils into aliasing noise as it moves,
which is a different artefact from the one Doom had and not a better one;
with them a van at the far end of the lot picks one mip level and samples
it sharp. The sprites get no mipmaps for a reason of their own — a mipped
sprite loses its cut-out edge — and a model is not a cut-out.

WHAT IS STILL THE FILE'S IS THE WRAPPING, because that is not a question
about how the game looks, it is a question about what the UVs mean: a
model unwrapped to tile across a seam needs REPEAT and one unwrapped into
an atlas needs CLAMP, and only the file knows which. Where a glTF says
nothing the spec's own default is taken and not this renderer's habit,
which is how wrapping ends up REPEAT.

It is one function — pointSample in js/glb.js — called from both places a
model's texture is built, because the vehicles come through js/car.js and
the guns through js/glb.js and a rule that only half the models obey is
not a rule. There is no filter table in either file any more.



THERE WAS A WHOLE SYSTEM HERE and it is gone, at the user's request, so
what follows is an obituary rather than a description. It is worth one,
because it was a good answer to a question nobody was asking by the end.

WHAT IT DID. Seven vehicles arrived as orthographic turnarounds on a
green field — front, rear, side and plan, a hatchback, two white vans a
model year apart, a pickup, a custom van with an eagle down its flank, a
riot van and a tracked APC. tools/prep-car.mjs keyed the green, measured
each sheet and wrote js/car-data.js: proportions, and three curves that
between them are the VISUAL HULL of the three silhouettes. js/car.js put
a vertex at every crossing of those curves and painted every triangle by
PROJECTION — take the axis a face's normal points most nearly along, read
the view that was drawn down that axis, and the pixel lands where it came
from. No unwrapping, no seams, no atlas authored by a person. Four
pictures in, a solid out, and the debris got real paint for free because
a torn piece was a box cut out of the same model space and put through
the same projection.

It was over-determined, too, which is the part that was genuinely nice:
three of the four views claim the vehicle's width, so each sheet could be
checked against itself, and the check caught a sheet that was not one
vehicle, two sheets drawn facing the other way, a right flank painted
with its tail at its nose, and a wheel measured off a bull bar.

WHY IT IS GONE. Because the car park stopped being four pictures and
became a MODEL, and a projection that infers a mapping is strictly worse
than a mapping somebody already made. Three rounds of trouble came out of
that mismatch and every one of them was the projection arguing with a
file that already knew better: the flanks smeared (the measurement that
condemned the model's own UVs had pooled them with a second primitive's
junk), the vans inside out (the projection reads a normal to choose a
picture, so an inverted normal paints a panel with the opposite panel),
and then the vans with no bodywork (the fix for that was a global winding
reversal, and that mesh was two shells wound opposite ways).

So js/car-data.js, tools/prep-car.mjs and art/vehicles-atlas.png are
deleted, along with the hull builder, the projection and about a hundred
and fifty checks that held them together. The seven sheets stay in art/,
unshipped, in case anybody wants them back. js/car.js is a fifth of the
size and does what the file says.

WHAT REPLACED IT IS NOTHING, WHICH IS THE POINT. The GLB's own nodes,
its own triangles, its own UVs, its own texture, its own material
colours, drawn both sides. There is no tool between the file and the
game: the length in game units is a constant in js/car.js, and the width,
the height and the ground line come off the triangles at load time.

THE PIECES COST SOMETHING, and it is the only thing that got harder. A
chunk used to be a fresh box with the views projected onto its six faces,
so it was small by construction. Now it is the model's own surface inside
the cut, and the first attempt at that — whole triangles, in or out by
their centroid — sheds roof panels two thirds of the van long, because a
whole van's body shell is 134 triangles. So the pieces are clipped
properly: Sutherland-Hodgman against the six planes of the cut, carrying
u and v along with the position, fan-triangulated. Forty lines, and a
piece is a piece.



YOU CANNOT WALK THROUGH ONE. Doom's things are cylinders — one radius, no
rotation, however long the thing is — so five and a half metres of van is
three of them in a row, which is the oldest trick in the format and still
the right answer. That leaves the corners a few units short and the flanks
a few units proud, and a shopper brushing past reads it as a van. Those
cylinders are the only actors in the game with NO STATE and no sprite:
they have no `spawn`, so Actor.render and Actor.tic both fall out on their
first line. Each one carries a pointer back to its vehicle and hands
everything done to it straight over, because a shot into any third of a
van is a shot into the van, and health that lived in the cylinders would
make a van take three times the punishment and come apart in thirds.


AND THEN IT GOES UP
-------------------

A car is flammable and shootable, so the flamethrower lights it, the fire
under it keeps it lit, and about four seconds later the tank is done for.
What follows is one sequence and every part of it is arithmetic you can
read.

IT CHARS FIRST, at the user's request. A car used to go from parked to
airborne in the tic its health ran out; now the tank going is the END of
something you watch. For five to seven and a half seconds — rolled per
car, so a row lit together does not go off like a firework display on one
fuse — the car leaves the slab for a mesh of its own, the only way to
change one vehicle's vertices without rebuilding thirty-six, and two of
its attributes are wound by hand: `charred`, which js/material.js scatters
live coals across in proportion, and `light`, which comes down to under
half so the paint goes black beneath them. Sparks off it the whole time,
more as it goes; smoke, thicker; and the one fire light pulled toward it,
harder as it goes, so the bay round a car about to go is lit like a
hearth. More damage to a car already charring HURRIES it — two tics off
the fuse a point — so a chain reaction across a full row is a ripple
rather than a metronome. It is a wreck arriving gradually, and when it
reaches the end it goes up on the geometry it has, so what is in the air
is the black thing you watched turn black.

THE FIRST BANG IS FOUR OF THE OLD ONE, also at the user's request, and
four is spent where four can be seen: four times the fireballs, spread
past the car's own footprint rather than four times as many in the same
square, four times the embers and the smoke, the heat of the floor pinned
to the top of its scale, a light thrown at the bay and decaying over the
next second so the whole car park is lit from it for a moment and then is
not, and a sound made the loudest thing in the game. The RADIUS is doubled
rather than quadrupled — a doubled radius is a quadrupled area, which is
what four times the blast means on a floor plan — and the damage is
doubled, which with the area is eight times what the old bang put into the
car park. It damages and IGNITES everything within four hundred and
twenty units, clears the car park of anybody who can be frightened, and
puts the car in the air. The second bang, where it lands, is what it
always was.

THE TUMBLE IS NOT A PHYSICS ENGINE and does not want to be. It is a
velocity and a gravity of 0.85 units per tic per tic — the same fall the
sparks off a broken light take, which happens to be very close to a real g
at this world's scale — plus three spin rates integrated separately as
Euler angles in the order the mesh is built for: yaw, then roll about the
car's own length, then pitch nose over tail. That is not rigid-body
dynamics and for a car in the air for forty tics nobody can tell.

IT LANDS ON ITS ROOF BECAUSE THE ROLL RATE IS CHOSEN SO IT WILL. The
flight is ballistic, so how long it will be up there is known the moment
it leaves the ground: a box turned half a turn about its own length is
exactly as tall as it was, so its middle comes back to the height it
started at and the flight lasts 2v/g. Divide half a turn by that and the
car completes its roll as it arrives. It is aimed, not simulated, and it
is the difference between a car that lands upside down and a car that
lands upside down SOMETIMES.

HOW HIGH A CAR ON ITS ROOF SITS is not a number anybody types in. The
eight corners of its own box get turned by whatever orientation it has and
the lowest one is put on the tarmac — which works at any angle, so the ten
tics it spends rocking from however it hit onto its roof are just the same
test run every tic while the orientation eases to its resting one. It ends
up half a turn over and a few degrees crooked, resting on a corner of its
roof and its bonnet, at whatever height that leaves it.

THE SECOND BANG happens on impact, and with it the bulk of the debris.

THE DEBRIS IS MADE OF THE CAR. A chunk is a small box cut in around a
random point on that vehicle's own hull — a bit of roof, a bit of
bonnet, a bit of door — and put through exactly the same projection, so
a piece off the tail is painted with the tail on every face and nobody had
to decide what a torn piece of van looks like. Each one tumbles on the
same integrator, bounces once if it came down hard, snaps flat to the
nearest half turn when it stops — a piece lying still would otherwise go
on spinning for ever — and then lies there throwing sparks and smoke for
twenty seconds. After that the particles stop and the coals do not,
because a wreck and every piece of it are built with `charred` set, which
is the attribute js/material.js scatters live embers across: the same ones
burning in the gutted aisles indoors, on the same clock.

AND THE CAR PARK GOES UP A BAY AT A TIME. Nobody wrote a chain reaction.
Cars are flammable and explosions light what they reach, so the bay either
side catches, cooks for its own few seconds and goes in turn, and a row of
them is a wall of fire inside a minute. It is the same emergence the store
has: the thing that makes a fire game a fire game is that you only ever
light the first one.

THE TEST
--------

  node tools/smoke-test.mjs

No install and no browser — a stub stands in for three.js, since the
bakeries, the map builder, the collision and the state tables are all pure.
976 checks. Every one of them earns its place by having caught something
that had already reached a screenshot:

  a sprite whose art wrapped round the edge of its own canvas, so a forearm
    drawn off the bottom appeared in the sky, at a fixed point on screen,
    in every shot
  a state naming a frame letter the bakery never made, so a monster's
    pain frame did not exist — and its descendant, which is that an actor
    with `variants` never draws the sprite its state names at all, so the
    check expands SHOP into SHO0 through SHO16 and a missing sixteenth
    shopper cannot hide as one magenta person in a crowd
  a wall texture chosen by whichever sector was DECLARED first, so an aisle
    had shelving down one side and blank plaster down the other
  every tread face on every wheel of every vehicle wound inside out —
    sixty-four triangles a car, shipped, through a test that passed. The
    test could only decide a face with air on one side of it, and a tyre
    is buried under a wheel arch; and a back-facing tyre in a dark car
    park is a black shape either way. Now the builder emits every
    triangle the way round its declared normal says, the test holds the
    winding against that, and every solid must be closed — each edge
    shared by exactly one triangle going the other way — with a positive
    volume about the size of a car. None of that needs air or guessing
  a third of the fleet built back to front, because two of six sheets
    were drawn facing the other way and the tool assumed one direction
    for all of them; every right-hand flank painted with its tail at its
    nose, on the theory that a mirrored picture needs mirrored
    coordinates; and then the hatchback declared the wrong way round by
    eye, and caught by its own top edge
  the roof line diving into a rear window, because the opened mask that
    is the right ruler for the box thins a pillar to nothing, and a
    window with no pillar reaches the sky
  seventy-seven cars parked on the bay lines instead of between them,
    because the texture that draws those lines tiles from the world
    origin and the car park does not start there
  a white van that came out pale green, because a green screen throws
    green light on what stands in front of it and the eye only forgives
    that while the green field is still there to compare against
  a wheel measured off a bull bar, which made each tyre four tenths of
    the van long
  a move long enough to step clean through a wall with nothing noticing it
    had been there
  a hard fuel threshold that stopped fire crossing a walkway at all, which
    meant most of the shop could never burn — the check demands every
    region of the store, and demands that every region says so
    afterwards. It used to prove that with ONE MATCH left for forty
    thousand tics, and cannot any more, because a match now goes out:
    it walks a flamethrower over the whole shop instead, which is a
    claim about whether the store CAN burn rather than whether it does,
    and that was always the claim the floor plan was written against
  the same sweep done at molotov strength, which quietly torched the car
    park. Anything over 40 leaves accelerant behind, and accelerant
    poured on tarmac makes tarmac burn — so a sweep with a generous
    number would have taken the "a sector with no fuel never burns"
    check down with it and called it a pass. It pours 36, which is what
    the flamethrower actually lays
  an evacuation measured against a carpet bomb. The fire no longer
    empties a building on its own, so the check that the fire exits are
    load-bearing had to start lighting the shop itself — and painting
    all eleven aisles inside four seconds is not a player, it is an air
    raid: everybody is standing in fire before anybody has taken a step,
    five hundred and seventy die where they stand, and the doors get no
    chance to be load-bearing. It pours at a walking pace now, and the
    aisle ahead of you empties the way it does in play
  sector light measured to a bounding box, which pinned the whole shop at
    full brightness and made the lights unshootable in effect — the check
    now bursts every fitting over one aisle and demands it get darker
  a fixture texture whose declared world height did not match the fixture,
    showing a slice of a second copy of itself cut off at the floor
  a fixture whose TOP was gondola steel, on the one department in the shop
    you look down into rather than at
  a texture drawn with fractional pixel centres — which on a surface that
    wraps by modulo rather than flooring means a fractional array index,
    and a fractional index into a Uint8ClampedArray writes NOWHERE. No
    error, no pixel: every crate of produce came out as bare liner
  a firebreak check phrased as "no outdoor sector burns", which stopped
    being the same statement the moment the store got a footway — the
    pavement is outdoors AND carries fuel, on purpose, because it is the
    fuse that takes the fire along the parade to the neighbours. The
    check is now the invariant the map is actually written against: a
    sector with no fuel never burns, whatever else is true about it
  a flame that stopped dead a hand's width from the nozzle, because the
    tree hit test took a fir's whole sprite width as solid down to the
    ground — every particle "hit a tree" beside the player and the splash
    embers spawned in the camera's face as thirty-pixel squares. The
    check now fires beside a trunk and demands the stream pass it
  a forest fire whose pace was a guess; the check runs one match for an
    hour of game time and holds it between a flash and an afternoon —
    and it caught the second tuning sitting on the percolation edge,
    where a match took or fizzled by luck
  a store fire quartered to please the ear, which stopped the footway
    carrying it along the parade; the neighbours never caught. The
    slowing moved to the fire's clock, which is what the clock is for
  a copy of the site that left out the fire strips, so the published game
    would have fallen back to its baked flames without a word — the check
    now assembles the site and holds every asset path the page loads
    against what was copied. The fire is drawn now and there is nothing
    left to leave out, but the check is what found it
  strips of somebody else's art whose cell sizes live in two places
    at once — the tool that writes them and the game that cuts them up.
    They now live in ONE place, js/people.js, and the check holds the
    files on disk against it: a strip one pixel narrow cuts every shopper
    after the first in half, silently, at load time
  a THIRD attempt to slow the fire that put thin fuel back under the
    percolation line — the footway stopped carrying the fire east along
    the parade and three of the neighbouring units could never burn at
    all. The check that caught it is now two checks, because it was
    making two claims at once: whether the fire GETS IN to a region is
    absolute, and whether it then eats the region is a matter of degree
    that a doorway four cells across cannot express
  a customer standing in the loading dock, which is not a thing a
    customer does. The map places the crowd through one predicate and
    exports the rectangle it used; the check holds every one of them
    against it from the other side
  two customers at the same coordinate, which is one customer with a
    shadow and, worse, two who can never move again: the move check
    refuses any step that ends inside somebody, so a pair placed already
    touching is a pair welded to the floor. The check measures the
    closest two in the shop and demands they be further apart than two
    shoppers are wide
  and a customer who is not overlapping anybody and still cannot move,
    which is not the same statement: thirty-six apart is not touching and
    is still nowhere to go, because a step is sixteen. The check asks
    every one of them for a step it could take
  a customer standing on top of a till, a gondola or the butchery
    found by testing the sector under them rather than the rectangle
    round the shop
  a hard straight line across the shop floor where a burnt aisle met a
    clean cross-aisle, reported as z-fighting and near enough: the soot
    read how far through burning a surface was out of a
    one-texel-per-SECTOR picture, and a sector's progress is one number.
    Every surface in one sooted together, and the sectors of this map
    are big axis-aligned rectangles, so the step landed as a knife edge
    — exactly vertical or exactly horizontal on screen, with a different
    texture and a different light level on each side of it. It reads as
    two surfaces fighting rather than as a fire. The shader reads the
    fire's own 32-unit cell grid by world position now, so the soot
    front creeps at the resolution the fire actually has and crosses a
    sector boundary without knowing it is there. The region attribute
    and its texture are gone with it: a surface finds its own burn from
    where it is
  a 40%-burnt aisle drawn as a black void with shoppers floating in it,
    because the soot took the albedo to a fifth and the room light took
    that to nothing. What a surface part-way through burning has to look
    like is set by what it hands over to, not by what a burnt surface
    reflects
  a burnt-out store with no ceiling anywhere, because the first gutting
    opened every region to the sky. The check now demands BOTH — some of
    the roof fallen in and most of it still up — since either alone is a
    different building
  a van with four of its faces wound inside out, which in a single-sided
    material is a hole you see the inside of the van through. The check
    steps a little way along every triangle's own normal and asks whether
    that lands inside the solid, which is the only phrasing that does not
    just restate the code that built it
  a van painted with a pale band along the top of its nose and its tail,
    because the head-on views draw it sitting lower in the frame than the
    side view does and the roof therefore landed in a band of the picture
    that is nothing but light bar. The views are anchored on the roof line
    now, and the check holds the top of the body against it
  a fire door that sealed the inside face of its wall and left the
    outside one open, which is a door you walk round from the car park.
    The check counts the blocked lines and demands two
  a fire door that opened for anybody who walked past it, so the shop's
    six of them stood open all night with nothing on fire. The check
    stands a calm shopper against the bar and requires nothing to happen,
    then frightens the same shopper and requires the leaf to move
  a crowd that could not calm down. Contagious panic passed on at full
    strength is a loop — six hundred people in the woods behind the
    store, none of them able to see a fire, each one renewing the
    neighbour who had just renewed them. What the check watches is not
    "is everybody calm at the end", because the count legitimately climbs
    again each time the fire reaches a part of the shop that still has
    people in it; it is the LOW WATER MARK after the first wave, which a
    loop can never reach
  a fire whose scatter was re-rolled every frame, which is not a fire, it
    is a fire boiling. The check renders the same frame twice and demands
    every sprite be in the same place
  seventy-seven vans with their flanks smeared, because the model's own
    UV layout maps every side panel as a fan of slivers sharing one
    corner. The check holds the widest single triangle's share of the
    sheet against a tenth of it: a fan collapses to nothing and a
    stretched sliver covers everything
  and then seventy-seven vans seen from the INSIDE, which was the real
    fault under that one and took three reports to find. The model
    declares which way its faces point twice, by winding and by normal,
    and its two declarations agree with each other and disagree with the
    solid; every face of the body was culled, and the projection painted
    each panel with the picture of the opposite one. The test measured
    the axes, the scale, the ground line and the UV spread —
    everything except whether the van was the right way out
  and then vans with no bodywork, which is the SAME bug fixed wrongly.
    The fix was a global reversal when the whole mesh's signed volume
    came out negative, and the mesh is two shells wound opposite ways:
    the body at minus a third of its box and the chassis at plus a
    twentieth. Reversing both put the body right and the chassis wrong.
    There is no single flip, and there did not need to be one — Blender
    and Sketchfab both draw BOTH SIDES of a single-sided material, which
    is the whole of what this renderer was not doing. A vehicle is
    double-sided now and the file's winding is untouched. The test
    reports both shells' volumes rather than the mesh's, which is the
    number that would have said so in the first place
  A FROZEN SHOPPER SETTING THE BEANS AISLE ON FIRE, which shipped for
    about ten minutes and is the funniest way this could have gone
    wrong. A burning piece of somebody trailed fire behind it and lit
    the floor where it landed — which was how a crowd MOVED a fire, and
    was one of the best things in the game right up until the day the
    fire was asked to stop spreading on its own — and the shatter reused
    that pool for its pieces. So the one weapon whose job is putting
    fires out, used properly on a person, started one. The pieces are
    the same art and the same ballistics; what they do when they arrive
    is the whole difference, so they are a second pool with a tic of
    their own that lands a splat and a breath of vapour and nothing
    else. The test shatters somebody and then runs two hundred tics of
    giblets and counts the cells that caught: none
  THE SAME BUG WEARING THE OTHER DOOR, found while checking that the one
    above had really been fixed. Fire is meant to be the counter to the
    extinguisher: it eats the frost, the person thaws, and what comes
    out the other side is alive and alight. That is what the manual
    above promises and what ignite() does — but a flame particle is TWO
    calls, ignite and then damage, and damage knew nothing about frost.
    So the melting and the hurting raced and the hurting won: a shopper
    has twelve health and a particle does five to nine, so the SECOND
    one killed them with forty-four of their hundred frost still on.
    They never thawed, never got up, and — because dying runs the
    ordinary death state — came apart into BURNING giblets that lit the
    floor where they landed, exactly the way the shatter used to. The
    extinguisher had been making people more flammable. Fire damage is
    spent on the ice now, at twice its value, and none of it reaches the
    person until the ice is gone; a blast carries enough to take the
    whole bar off at once, so a car going up beside a block of ice frees
    whoever is in it and then lights them. What let it hide is that the
    test drove ignite() on its own — the half that was right. It drives
    the real FlameStream._burnActor now, and asks what came out
  A CORPSE STANDING BACK UP WHEN IT THAWED, which nothing in the shipped
    game could reach and which is checked anyway. thaw() ends in
    setState(freezeReturn) — get up and run — and it ran on whatever it
    was called on. A shopper's death state removes them on the tic it
    runs, so there was never a body left to melt; the day something
    freezable has a death animation that lingers, there would be. The
    dead stop being blue and stay where they are
  A BLOCK OF ICE FOR SIX TICS. Freezing put the frost bar at the top
    and thawing took it off at a unit every six tics — and the thaw
    triggered the moment the number dipped BELOW the threshold, which
    it does six tics later. So a frozen shopper was frozen for a sixth
    of a second and then walked off. Freezing happens at the top of the
    dial and thawing at the BOTTOM of it now, so the whole bar is the
    time they spend solid and the state has hysteresis. The test freezes
    one, tics once, and asserts they are still frozen — and then counts
    how long it actually takes, which is about seventeen seconds
  A BLOCK OF ICE WALKING OFF DOWN THE AISLE, which is the same mistake
    as the one above made in a different place: freezing somebody
    stopped them moving THEMSELVES and nothing else. setState is the
    door every other system in the game reaches an actor through, and
    it had no lock on it, so all three of the things that make a crowd
    react reached straight past the ice: a car going up nearby
    (Game.scare), the noise of the player's own trigger (Game.noise,
    once per tic for as long as it is held), and a neighbour running
    past (A_Scare). Measured: a bang forty units away moved a frozen
    shopper ninety units in under two seconds, still solid, still blue,
    with ninety of its hundred frost on. The lock is one line at that
    one door rather than a guard at each caller — the callers were not
    the problem, the NEXT caller was — and the two functions that own
    the ice pass a flag through it. The test knocks on all three doors
    and measures how far the block of ice got: nothing
  A BLOCK OF ICE ROCKING GENTLY ON ITS HEELS, reported by the user and
    a straight miss when the freeze went in. Every standee leans and
    bobs a little — two sines off its own id, which is what stops a
    shop floor of them reading as a room full of cardboard — and the
    freeze parked the state machine without ever touching the drawing.
    So the one figure in the game that has to be dead still was the one
    still swaying. The guard is at the call in Actor.render rather than
    inside swayOf, because swayOf was not wrong: it was asked to sway
    and it swayed. Somebody the fire is eating is held the same way, for
    the same reason — a body coming apart should sag, not sway
  A HALF-BURNT SHOPPER HANGING IN THE AIR, which was the first thing
    wrong with the burn-away on screen and is obvious in hindsight: the
    front eats the drawing from the feet up and the quad does not move,
    so what was left of somebody was a head and a pair of shoulders
    floating at eye level with nothing under them. The sprite sinks at
    the rate the front climbs now, so the unburnt top of them slides
    down to the floor as the bottom goes — which is not a workaround,
    it is the collapse, and it is what makes the three seconds read as
    a person going down rather than as a person being erased
  A SHOPPER ON FIRE THAT LOOKED EXACTLY LIKE A SHOPPER, which is the
    longest-running of these and was never a bug in anything: the code
    was right, the mechanic was right, and nobody had ever drawn the
    fire. Somebody alight was the ordinary sprite with fullbright set,
    and every screenshot of the best thing in the game is a person
    standing near some flames on the floor. Three things now, because
    any one or two of them is not enough: flame licks off the body,
    which trail because they are particles and the person is running; a
    fire colour map on the drawing, without which the licks read as
    somebody standing BEHIND a fire; and the colour being ADDED rather
    than mixed, without which they are the colour of terracotta,
    because every colour in the ember ramp is at most white and a map
    can never make a burning person brighter than a lit one
  AND THEN A COLUMN OF FIRE WITH SOMEBODY LOST INSIDE IT, which was the
    first cut of that: two licks a tic at up to thirty-four units, on a
    person fifty-six units tall, is thirty overlapping blobs each a
    third of their height. One a tic and smaller leaves the drawing
    showing through, which is where the colour map does its work — and
    the point of a burning shopper is that you can see WHO is burning
  A WHITE VAN WITH A RED PINSTRIPE DOWN EVERY EDGE, which is a good
    picture of getting a colour space wrong. The mask that isolates the
    van's white paint is a luminance ramp, and its two numbers were
    measured off the PNG: paint at 0.75 to 0.94, so a ramp from 0.55.
    But the sheet is an sRGB texture and is DECODED on the way out of
    the sampler, so what the shader sees is 0.50 to 0.78 linear — and a
    ramp starting at 0.55 caught the highlights along the panel edges
    and nothing else. Re-measured in linear the bands are miles apart
    (glass 0.28, the darkest shadowed paint 0.53) and the ramp goes
    between them. The test reads the two numbers OUT of the shader and
    applies them to the van's own sheet, decoded the same way, so the
    check and the thing it checks cannot drift
  A CAR PARK OF GREY SHAPES WITH WHEELS, one screenshot later. The
    palette was picked at the values a van is really painted, 0.24 to
    0.6, and this multiplies twice — the sheet's own shading first and
    then a lot at dusk on top of it. Nothing under about 0.4 in its
    strongest channel survives to the screen. The test holds every
    entry against that floor
  A SMOKE TEST THAT COULD NOT REPORT ITS OWN FAILURE. A backtick in a
    comment inside the GLSL ends the template literal early and the game
    dies on IMPORT; the check that would have caught it recorded a
    failure and waited for the summary at the end of the run, which
    never came, because the import that kills the process is a few lines
    further down. It is the first thing the suite does now, reads the
    file as TEXT, and prints and exits on the spot rather than counting
    a failure nobody will ever see
  A PILOT LIGHT HANGING UNDER THE GUN, reported by the user and
    measured at 0.537m off on a gun 1.4 metres long — a fifth of the
    screen's height below the barrel and nearly off the bottom of the
    frame. The two effects on the flamethrower hang off different
    things, and that asymmetry is the whole of it: the muzzle is a
    child of the MODEL and takes its anchor in the model's own units,
    so it is right by construction; the pilot flame cannot be, because
    the model is turned a half circle to point its barrel at the camera
    and a quad that inherits that turn is a flame seen from behind. So
    it hangs off the group instead — and a point handed to `position`
    is read in the PARENT's space, while it was being given a WORLD
    one. The group's own transform, which is the whole of the view
    offset plus the yaw and the bob, was applied to it twice. The tell,
    for anyone who meets this again: the glow the pilot throws ON the
    gun was in the right place the whole time, because that uniform
    takes the same vector in view space and was correct. Only the mesh
    needed converting back out of the world
  A SHADER ENDING IN THE MIDDLE OF A SENTENCE. The GLSL lives in a
    JavaScript template literal, and a pair of backticks in a COMMENT
    inside it closes the string: the file still parsed, and the game
    died on import with "Unexpected identifier". Thirty seconds to
    find, and worth writing down because the prose in that file is
    dense and the temptation to quote an identifier in it is constant
  AND THE SAME BURN RUNNING FROM THE HEAD DOWN, one screenshot earlier.
    vUv.y is measured DOWN the picture — the sprite sheets are
    canvas-backed and arrive with the first row at the top — so the
    obvious spelling of "from the feet up" was upside down. A person
    dissolving from the hat is not a person on fire. The test now pins
    the direction in the shader source, because it is one character and
    nothing else in the game would notice
  A CHARRING CAR AT MINUS INFINITY. The char phase was put in front of
    the launch, and the tic that tipped a burning car over into it —
    burnTic, three lines up in the same function — then fell through
    to the settle code below, which is written for a car that has
    LANDED and integrates its resting angle off numbers a parked car
    does not have. One tic of NaN angles put the lowest corner of the
    box at infinity and the car's middle at minus that, and the first
    spark thrown off it asked the level which sector minus infinity was
    in. The fix is one line — stop after the tic that starts the char —
    and the lesson is the same as the frozen walk-off's: a state added
    to a function written as a run of ifs has to be checked again after
    every call that can change it
  A POLICE VAN PAINTED BLACK. The loader took the first image in a GLB
    for its sheet, and for the van that was the only image. The police
    van carries four — emissive, normal, diffuse, metal-rough — and the
    first is a flat black emissive map, so the whole truck arrived
    matte black with no lettering. A GLB says which picture is the
    colour, in the material's baseColorTexture, and the loader asks it
    now; the test checks that the colour image is NOT the first one in
    the file, so the shortcut cannot come back
  A DEATH ROW WITH ITS FRAMES OUT OF ORDER. The SWAT sheet stacks the
    three lying-down frames in the last column of the death row, and
    grouping the found cells into rows by their vertical middles put
    the second lying frame beside the third falling one, because their
    middles were near enough. So the trooper fell, lay down, knelt up
    again and lay down. That band is cut COLUMNS FIRST now, and the
    order the cut returns is the order the frames play in
  A MEASURING TOOL THAT LIED, for four of its own panels. The new
    flamethrower has no marker spheres, so its nozzle and pilot had to
    be measured off pictures, and the tool drawn to do it took the
    screen's right-hand and up axes as ARGUMENTS: name the camera and
    name what is across the screen. Two of the four views got the
    handedness backwards — a camera looking from +x with +y up has -z
    across the screen, not +z — so the rulers under those panels
    counted the wrong way and the muzzle appeared to be at the tail of
    the gun. The fix is not a better argument: the axes come off the
    camera's own matrix now, so a view cannot disagree with its own
    ruler. Everything a picture is measured against has to be derived
    from the same thing the picture is
  A FLAME THAT WAS NEVER DRAWN, and the gun was blamed for it. The first
    look at the new flamethrower firing showed no plume at the muzzle,
    which read as the bottle on top of the barrel hiding it, and an hour
    went into holding the gun further out, higher and rolled over to get
    round a problem that did not exist. main.js draws the gun with
    weapon3d.update(player, player.firing, ...) and `firing` is
    fireIndex >= 0 — a thing that is true only DURING the fire cycle. The
    probe ticked the world eight times with the trigger down and then
    took the screenshot, by which time the cycle had ended and the muzzle
    quad was hidden, correctly. Parking the cycle open before the shutter
    opens shows the plume exactly where it should be. A screenshot of a
    paused game is a screenshot of whatever state the pause caught
  A LAUNCHER THAT LEFT THE PICTURE. The bore was asked to be a third
    smaller and a third farther off, and the first version of "farther
    off" scaled the gun's whole position along the line from the eye —
    on the theory, which is true, that a point moved along that line
    keeps its place on screen, so the gun would keep its corner of the
    frame and only shrink. The point that kept its place was the gun's
    CENTRE, which sits below the bottom of the frame by design (VIEW.pos
    is low and right so the body is off screen and the barrel comes in
    across the corner), so the launcher shrank around a point nobody
    can see and what was left in the picture was one edge of it. The
    push is straight back along the view now, z alone, which is what
    holding a thing farther from your face is; it recedes toward the
    middle the way anything farther off does, and the whole of the
    launcher's mouth end is in the corner at half its old size. Caught
    by the screenshot, not the test, which can only pin which line the
    push is on: a picture is the one check a scene graph in a stub
    cannot give you
  A PIECE OF CAR ONE PAST THE END OF THE MODEL. rnd() in js/vehicles.js
    is pRandom() / 255 and pRandom() rolls 0 to 255 INCLUSIVE, so it
    returns exactly 1.0 about once in every 256 calls — and the one
    place that used it as an array index, picking which of the van's
    triangles a shed chunk is torn from, then read one past the end and
    threw. Every chunk off every car draws one of these and a chain
    reaction across the car park sheds hundreds, so this was not a rare
    crash, it was a question of how long the player stood and watched.
    It surfaced because an unrelated change moved the shared random
    stream by a few calls and the smoke test's exploding car landed on
    it — which is the argument for a test suite that shares one LCG
    with the game. Clamped at the point of use: the other nine uses of
    rnd() in that file are ranges, where reaching the top is correct
  SMOKE WEARING THE FIRE'S COALS, for as long as there has been soot.
    Every sprite in the game shares the fragment shader with the walls,
    and the block that asks the burn grid how burnt the floor is was
    running for all of them: shoppers stained, giblets stained, and the
    smoke — thirty units up in the air, and drifting, so it sampled a
    different part of the grid every frame and the coals crawled across
    it. Nobody had named it until the user did. A define now, set by
    the wall material and nothing else
  A ROW OF DITHER ONE STEP OUT, every other row, for the whole life of
    the project, and found by accident on the way to something else.
    The post pass ran at SCREEN resolution and worked out its Bayer
    index as floor(uv * bufferSize) — the buffer texel this screen
    pixel is standing on, which is the right quantity and was not
    always the right ANSWER. The hardware's nearest fetch does its own
    floor of the same product in its own arithmetic, and on a 600-row
    window over a 400-row buffer that product lands on a whole number
    every other row; where the two floors fell either side of it, a row
    got its neighbour's threshold. Nobody can see it on a 256-colour
    picture, which is why it lasted. What found it was diffing a frame
    before and after the pipeline was rebuilt: seven per cent of the
    pixels moved, in regular stripes, and with the dither turned off in
    both the two frames came out byte-identical. The filter now works
    the threshold out at grid fragment centres, where it is the same
    number as the fetch by construction
  THE FOUR NUMBERS ALONG THE TOP running off a 160-column grid, which
    had been true since the day there were four of them and only
    became reachable on purpose the day the pixel filter stopped being
    the render size. The bar already stepped its scale down to fit and
    the floor of that is 1, below which it clipped — and what it
    clipped was FUEL, the last one drawn and the one this panel can
    least spare. It gives up a READOUT now once the scale has nowhere
    to go, from the middle out, and the test holds the three lengths
    against the chunkiest grid there is
  and a van painted by projection when it was already unwrapped, on a
    measurement that pooled the body's UVs with the flat material's.
    The flat material has no texture, so its UVs are junk — 490
    triangles "covering" 321 per cent of the sheet — and the junk was
    the fan of slivers the flanks were condemned for. The body's own
    unwrap is 134 triangles over 39 per cent of it. The test measures
    the textured primitive alone, and asserts the other one IS the junk
  and then THE SHEET UPSIDE DOWN on every van in the lot, for a whole
    model, because two flips cancelled and only one of them happened.
    glTF's v starts at the top of the image and GL's t at the bottom,
    so one turn is needed; the code asked for two — `1 - v` on the
    model and `flipY` on the texture — and `flipY` is ignored for an
    ImageBitmap, which is what a texture inside a GLB decodes to. The
    old van hid it, having only 134 textured triangles on a sheet of
    white bodywork; its replacement is unwrapped all over and put a
    radiator grille down the flank of thirty-six vehicles. Nothing in
    564 checks could see it, because every one of them measured the
    UVs and none of them measured which way the picture went on. The
    test pins both halves of the convention now: `flipY` false, and
    the file's own v arriving at the triangles unchanged
  ONE SHOP DOORWAY OUT OF TWENTY that the fire never got through, and
    five rooms behind it that never burned on a map where every other
    room did. A doorway is 120 by 16 — two or three cells of a
    thirty-two-unit grid, in a line — and it is the only way in from the
    footway. At an aisle's fuel a front two cells wide only has to fail
    once, which is the note on the footway's own fuel in its smallest
    possible form, and it did not show up until the parade got long
    enough to have twenty of them. A doorway holds what the pavement
    outside it holds now, which is also true of a real one. The check
    that caught it was already there and phrased correctly: every region
    of the shop must be REACHED, not 97% of the fuel
  a car park with two typed coordinates in it, which was correct until
    the parade grew past them and then described a strip of wood with a
    negative width. The lot is derived from the parade now. The general
    form of this one — a number typed twice, in two files, that has to
    agree — is most of what the checks in tools/smoke-test.mjs are for,
    and three of them were themselves guilty: they asserted the fuel
    grid's bounds and the ends of the road as literal coordinates, and
    they all failed the moment the building changed size. They ask
    structural questions now (is the grid wider than the parade, does
    the road leave the map at both ends) rather than arithmetic ones
  a burn timer that ran at half the speed it said, because the state
    that counts it down runs every TWO tics and the countdown was
    decremented by one. A shopper asked to burn for seven seconds burned
    for fourteen. Nothing errors, nothing looks broken, and the only
    symptom is that every number tuned against it is wrong by a factor
    of two — which it was, through an entire afternoon of tuning. It
    decrements by the frame's own length now: the frame knows how long
    it is, so ask it
  a fatal, silent break. A comment rewritten with a text splice whose end
    offset was one line too far took the function between the two offsets
    with it, and js/main.js was left importing a name js/car.js no longer
    exported. The page died on the first line of module evaluation — no
    textures, no map, no game, a title screen that says STARTING for ever
    — and the test suite passed with 633 green checks, because it imports
    the modules it wants one at a time and never asks whether THEY can
    find each other. There is now a pass that reads every import and
    every export out of the source and holds them against each other
  "the pieces of a person all come down", which stopped being true the
    moment the fire got six times faster: two hundred tics of it beside a
    queue takes the neighbours too, so the count in the air was somebody
    else's pieces and the check was asking the wrong question
  a shop lit by two hundred switched-off light fittings. The ceiling
    texture was drawn as HARDWARE on purpose, with a sprite doing the lit
    part, and the day the sprite came out nothing anywhere said the paint
    was now the only picture of a light in the game — a flat has no
    opinion about whether it is meant to be luminous. The fitting is
    measured against the ceiling tile round it now, and so is the glow it
    throws on that tile, which is the part you actually read
  and the same bug again in the charred half, which is the one that makes
    the point: charring is a filter over pixels, and a darker picture of a
    light is still a picture of a light. A gutted, roofless, black shop
    with four crisp lit panels in every ceiling tile. The dead fitting is
    drawn by hand over the charred ceiling now, and the check demands it
    be darker than the burnt ceiling it is set in rather than merely
    darker than it used to be


WHAT IS NOT DONE
----------------

  the people, the wood, the sky, the logo and the weapon are the art a
    person made; every other surface in the game is still procedural and
    still provisional
  the shoppers run from fire and from each other going off, and from
    nothing else. They do not get out of your way, they do not use the
    doors, and they do not know the shop — a panicked one takes the
    coolest walkable compass direction that is away from what frightened
    it, which is enough to empty an aisle and is not enough to look like
    somebody leaving a building
  a shopper is drawn from one angle, so a crowd seen from the side is a
    crowd all facing you. At Doom's sprite scale in a dark shop this
    reads; in daylight it would not
  every vehicle in the car park is the same van. It is the user's model
    and it is the only civilian one in the project: about thirty-six of
    them now that the lot is twice as long, sparse, clustered near the
    doors and thinning to almost nothing at the ends, and only the
    heading and the paint differ — no dents, nothing that would break
    the repeat. The six drawn vehicles that used to be measured and
    waiting are deleted with the system that built them; their sheets
    are still in art/ if anybody wants them back. The second GLB did
    drop in beside the van — the police van — and cost eight lines
  the windows are the renderer's, not the game's. The four civilian
    sheets were rendered with see-through glass, so a windscreen shows
    the seats and, past them, the green screen; the tool paints the
    green near-black and leaves the seats. There is no alpha anywhere
    in a vehicle, but the look wants sheets rendered with opaque glass,
    which drop straight in
  a wrecked car never cools past smoking, and never goes away. The
    particles stop after twenty seconds and the coals in the shader do
    not, which is right for the ten minutes anybody plays and would be
    wrong for an hour
  a vehicle in the air ignores everything. It does not hit the building,
    it does not hit another car, and it does not care whose bay it lands
    in — the only thing it collides with is the ground. Two cars going up
    together can end up inside one another, which so far has looked more
    like a pile-up than like a bug
  the police van drives on a polyline and stops for nothing: it does
    not steer round a wreck in the fire lane, it does not slow for a
    crowd, and two of them sent to the same bay would arrive inside one
    another. The bays are taken in order so they do not, and a wreck
    keeps its bay
  four of the six neighbouring units are a shopfront with nothing behind
    it, which is one wall each and buys the whole read of the place
  no music
  no second level, and no level-to-level flow
  the molotov is built and switched off; the boxcutter is deleted
  the cerebral bore's sight is a one-pixel line, which at 300 rows is a
    thick red thread and at 600 a hair; and the bore itself is a
    fourteen-pixel cone that reads as a red blob in flight. Both want
    art
  only the SWAT fight back. The other five tiers in js/responders.js —
    the night manager, security, the police, the fire brigade, the
    helicopter — are still an alarm, a dispatch and a delay with nobody
    at the end of it; the squad has a trigger of its own
  a trooper does not put fires out, does not use a door on purpose (the
    sliders open for anything solid, so he gets in), and walks through a
    burning car park without noticing it, being fireproof. Nothing you
    can pour stops one; the bore is five kills a minute and the curve
    is more than that inside three
  a squad van standing in a fire takes forty-five seconds to go and an
    APC about ninety, which is deliberate and is still a long time to
    stand watching one. What it costs you is a tank; what it buys is a
    bay back. Whether that is a trade anybody makes is not yet known
  the touch controls were proven on an emulated phone — real touch
    events through Chromium, both thumbs at once — and not yet on glass;
    the look speed, the dead zone and the button sizes want a real thumb
    on them, which is what the LOOK SPEED slider is for in the meantime
  the wood, the gun and the particles were proven in software-rendered
    Chromium, which draws them correctly and slowly; fifty-four thousand
    instances at 400 rows is well inside any real GPU, but nobody has
    yet watched it on one
  the player cannot be hurt by fire — asked for, and one flag in
    js/player.js, FIREPROOF. Bullets and vans get through it; nothing
    else does. The tank is finite and fills itself very slowly; nothing
    else refills it, and nothing refills any of the three bars at all.
    There is no armour on the floor to pick up either: what you start
    the night with is what there is of you
  the SWAT sheet and the army sheet are JPEGs, decoded to PNGs in a
    browser and kept in art/people/ as those PNGs, because node has no
    JPEG decoder and one was not worth writing for files converted once
  the army trooper is cut, loadable and proven, and nothing in the game
    spawns one: no actor, no states, and main.js does not fetch the
    strip. Asked for that way — prepared now, built later. THE ORDER IS
    DECIDED: the SWAT, then the army after them, then a SUPER ARMY after
    the army, whose sheet has not arrived. What "after" is measured in
    — the pressure, the clock, the count of the dead — and what brings
    them are not. The SWAT's table in js/states.js is the one to copy
    when the time comes, and the smoke test pins the boundary so that it
    is crossed on purpose
  nothing follows you into the wood, and the wood's fire and the
    store's do not cross the car park to each other; the flamethrower is
    the bridge
  the trees are 128 and 256 pixels, the sky 1024, all three guns' paint
    1024, the van's sheet 512x256, the police van's 1024: art that came
    from outside was left as it came, and the 64-pixel rule stands for
    everything the game draws itself
  three of the five models are Vaportrash's, off Sketchfab. The fire
    extinguisher rifle and the cerebral bore are CC-BY-4.0 and want the
    credit above kept wherever the game goes; the flamethrower's own
    extras say COPYRIGHT TO VAPORTRASH and nothing else, which is not a
    licence to ship. Whoever publishes this owes that one either a
    licence from its author or a replacement — the anchors and the prep
    are a table and a tool, so a different model is two numbers and a
    re-run
  no save
