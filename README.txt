GROCERY STORE SIMULATOR
=======================

A Doom-style game in which you walk into a supermarket at night with a
flamethrower and burn it down. Then the forest it stands in.

The store is SellWrong, the anchor of a strip mall — one long shed cut
into tenancies, with the big one in the middle paying most of the rent
and six small ones either side hanging on. Two of those you can walk
into. All of them burn. Round the whole parade, for nine thousand units
in every direction, is a wood of fifty thousand firs and bushes, and
that burns too.

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
  js/                   the game
  art/                  the logo, the old sprite weapon, the seven four-view
                          vehicle sheets and the atlas packed out of them —
                          which nothing loads any more, and waits there for
                          the responders' riot van and APC
  assets/people/        the crowd, and what is left of one: seventeen
                          shoppers, eleven pieces, three splats, a fireball
  assets/forest/        the wood: ten plants with their burn maps, two grounds
  assets/sky/night.png  the night, baked from a Polyhaven panorama
  assets/models/        the flamethrower and the van, prepared from the
                          user's .glb files
  assets/fonts/         Michroma (SIL OFL), the title face
  tools/bake-art.mjs    node tools/bake-art.mjs — turns art/ into source
  tools/prep-people.mjs the crowd's art, crunched down from galvarius
  tools/prep-forest.sh  copies the wood's art over from the golf project
  tools/bake-sky.mjs    the sky: 8k panorama to 1024 palette pixels
  tools/prep-model.mjs  strips the marker spheres out of a .glb, keeps their positions
  tools/prep-car.mjs    measures six vehicles off their sheets and packs them
  tools/prep-van.mjs    measures the van model and halves its texture
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

  the smoke test         639 checks, no install and no browser
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
The status bar counts how many are left, which is the number the game is
actually played against once the fire is going — you started it, and now
you have to go and find them. It counts the tank too, because the tank
empties now.

  WASD          move            MOUSE     look
  SHIFT         run             LMB/CTRL  fire
  SPACE / F     open, use       WHEEL     flamethrower / boxcutter
  [  ]          chunkiness      ESC       pause
  N             palette on / off
  `             the frame-rate readout, off by default

Gamepad works. Mouse look needs a click to grab the pointer. On a phone
none of that applies and the next section is the one that does.

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

That also gives the BOXCUTTER its job back, so it is issued now — the
note at the top of js/player.js has said since the day it was written
that a boxcutter is "what is left when the fuel runs out, which it
will", and the fuel did not run out. Mouse wheel, or 1. The molotov is
written, tested and still switched off. The player still cannot be hurt;
that is one flag at the top of js/player.js.


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
  FLAME         under the right thumb's rest. Hold it to burn — and
                while it is held, sliding the same thumb still looks,
                so a held flame swept across an aisle is one motion.
                That one detail is what makes a one-weapon game
                playable with two thumbs: the thumb that fires never
                lets go to aim.
  USE           above the flame, for the doors that are not automatic.
  PAUSE         top corner. The menu has look speed, invert, a
                left-handed mirror of the whole layout, vibration,
                chunkiness and fullscreen, and remembers them.

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

Everything indoors goes eventually, from one match, with nobody helping.
That is a requirement, and it is a statement about percolation rather than
about flammability: a fire crossing a region survives only if each burning
cell lights, on average, MORE THAN ONE new one before it burns out.

  expected spreads  =  tics alight  x  chance/256  x  neighbours

Above one and it runs away and takes everything connected to it. Below one
it peters out, and no amount of waiting brings it back, because a burnt cell
has no fuel left to relight. There is no middle setting.

So both terms are tuned per cell from how rich it is, and both point the
same way. Rich stock burns HOT and FAST and throws sparks eagerly; thin
fuel SMOULDERS, never getting hot, burning a unit at a time, staying alight
long enough to pass the fire on. A bare walkway gets about 1.9 expected
spreads and a gondola about 25 — both above one, so both go.

What differs is PACE, and that is the whole feel of it. The two ends are
now a factor of twenty apart rather than a factor of six, because the
curve from fuel to spread chance is a power law rather than a shift:

  a gondola of stock     a cell about every second — a full run is up in
                           a minute, and it takes the run next to it
  bare lino              a cell every half a minute — crossing one aisle
                           is minutes of watching it creep

AND IT ALL HAPPENS SIX TIMES FASTER THAN IT USED TO, at the user's
request: a gondola cell rises, roars and is spent in about four seconds
rather than twenty-three, and the ember tail behind the front is a dozen
seconds rather than a minute and a quarter. What moved is the CLOCK — one
constant saying how many game tics a fire tic is worth, 18 down to 3 —
and nothing else, for the reason in the next paragraph: the burn rate and
the spread chance are the same two terms multiplied, so burning the fuel
six times faster to shorten a fire also cuts the rolls it gets to pass
itself on, and bare lino was only ever at 1.9 expected spreads. Six times
the burn rate would have taken it to 0.3 and left holes in the shop that
could never catch. Six times the clock changes nothing about what
eventually burns and everything about when.

What that buys is a chase rather than a siege. A run of shelving flashes
over and dies back while you are still standing in the aisle, and with
seven hundred people in the building and six fire exits for them to get
out of, the fire is now the thing that starts the level rather than the
thing that is the level.

Left completely alone, one match still takes the entire shop; it now
takes about seven minutes rather than the better part of half an hour.
Your flamethrower is very much faster than that, which is the point of
carrying it — you are not starting the fire so much as deciding where it
starts and how long the store has.

THE TWO TERMS TRADE EXACTLY, which is the thing to know before touching
either. A fire crossing a region survives only if each burning cell
lights, on average, more than one new one:

  expected spreads  =  tics alight  x  chance  x  neighbours

so slowing the crawl across bare floor by lowering the chance ALONE puts
thin fuel under the line and leaves holes in the shop that can never
burn. That mistake is in the history of this file twice. What happened
instead is that the chance came down by about three and thin fuel's
LIFETIME went up by about three: the same fire reaches the same places
and takes three times as long to creep there. It is also why the fuel
grid is floats — as integers the smallest burn rate expressible was one
unit a tic, and for bare lino that floor WAS the burn rate.

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
player, no help, sixty seconds: 583 of the 736 end up outside the
building, scattered across the wood on both flanks, the bays, the driving
lanes, the verge and the road; about a hundred are still inside in parts
the fire never reached, and fewer than fifty do not make it. The count of
people running drops to nothing after the first wave and climbs back over
a hundred a minute later as the fire reaches the second run of shelving
and finds the people who had gone back to shopping.

THE CROWD is the third way it travels, and the fastest. A shopper has
twelve health, which is under a fifth of what one tic of the stream
delivers, so anything you point it at comes apart at once: a fireball
where they were, thirteen pieces of them thrown sixty or seventy units on
fire, and a little heat in the floor wherever each lands. Torch the queue
at the tills and you have not started one fire, you have started nine, in
a fan, in the part of the shop with the most cardboard in it.

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
lands first is a world-space field at two scales — cells about a shelf
bay across decide which patches go early, cells a few units across
ragged the edge of each one — so the soot has a SHAPE of its own rather
than a level of its own, and it spreads across a wall as the region's
number climbs: the lowest-numbered cells first, joining up, until the
wall is black. Nothing about it is per-region except the number, so two
aisles burning at once are never in step, because they are not in the
same place.

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
  the roof     mostly STILL THERE, and holed. The profiled deck goes in
                 patches and the steel purlins never do; where the span
                 was long enough to fall it has fallen and the ceiling is
                 sky, and you are standing in a supermarket looking up at
                 the Milky Way

THE ROOF DOES NOT ALL GO, and getting that wrong made the first cut of
this look like a demolition rather than a fire. Every gutted region
opening straight to the sky left a burnt-out store with no ceiling
anywhere, which is neither what a burnt building looks like nor what
holds one up. A region needs two things to lose its ceiling now: a span
long enough to fall — how many cells of the fuel grid it covers — and the
luck of the draw. Corridors, doorways and small rooms keep theirs. About
two in five of the big ones come down.

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
a shop and the other half is a shell open to the night with fire in the
floor of it — and the join between them, a hard edge of ceiling against
stars, is the best thing in the game.

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

The flamethrower is the user's model, loaded from assets/models/ by a
loader that reads exactly what Blender exported and nothing more
(js/glb.js), and drawn in its own little scene in front of the world —
low and hard right, the body off the bottom of the frame, the barrel
coming in across the lower right quarter. It is drawn into the same
low-res buffer as everything else, so the painted diffuse goes chunky
with the walls and the palette eats it with the floor.

The model arrived with two marker spheres in it saying where the pilot
light burns and where the flame comes out. tools/prep-model.mjs takes
them out of the mesh and writes their positions into the file's own
extras; the pilot is a small flame sprite parked on one, the muzzle
flame grows out of the other along the barrel, and the stream that
flies into the world is born at that same nozzle — projected as a ray
out of the gun's scene and back into the world's, so it always leaves
the end of the gun you can see, whatever the two fields of view are.
The same tool drops the maps an unlit renderer cannot use, which was a
third of the download.


THE ROAD, AND WHO COMES DOWN IT
-------------------------------

THERE ARE TWO ROADS AND THEY ARE DIFFERENT THINGS. The FRONTAGE LANE
runs along the front of the lot between the fire lane and the first row
of bays; it is the store's own, you drive along it to reach a row, and
it stops at the ends of the lot. The TRAVERSAL ROAD is the public one
and it is at the far end, past the last row of bays, running the whole
width of the lot and on through the wood in both directions until the
forest ends — the way you drove in, the way everyone else is going to
arrive, and the only firebreak in the wood.

Which order they are in is the whole reason the second one moved down
there. A road, then a car park, then a shop, in that order, is what
arriving at a supermarket looks like; a road against the shopfront with
the car park behind it is not a lot, it is a forecourt. You start on the
verge south of the traversal road, so the opening shot is across a road,
over a car park, at a supermarket.

Both are five strips of sector (an edge line, a lane, the centre line, a
lane, an edge line), because a floor is textured to the world grid and a
64-unit tile cannot hold one line across a 300-unit road, but a strip six
units wide wearing a tile that is line all the way through can.

js/responders.js is the PLACEHOLDER for what comes down it: the shape of
the thing, with nothing in it that can hurt you yet. One number, the
ALARM, climbs with how much of the store and the wood has gone, how many
people you have killed, and how long anything has been alight. Six tiers — the
night manager, security, the police, the fire brigade, riot police, the
helicopter — each have an alarm they are dispatched at (you hear about
it) and a delay before they arrive, at one end of the road. Arrival
calls spawn(), which today records the wave and returns. The fight, when
it exists, is against people whose job is to make the fire stop, and
defeated() is where a beaten tier reports in. The escalation is done;
the people are not.


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
eye it SHOWED was 41 stretched by 1.2, which is 49. This pipeline draws
square pixels (a fixed height, and the width follows the window), so 49
here is Doom's eye as Doom showed it. It was 41 for a long time and nothing
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

NOTHING WALKS AT THE MOMENT. The two staff monsters that used that run of
states are gone and the responders that will use it are not written, so
the next two paragraphs describe a machine with nobody in it. It stays
exactly as it is, because it is correct and because getting it correct a
second time from the same source would take longer than reading it does.

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

Everything is drawn into a buffer about 200 pixels tall and thrown at the
screen with no smoothing. The vertical resolution is fixed — that is the
chunkiness control, on [ and ] — and the width follows the window's shape,
so a wider monitor shows MORE STORE rather than the same store stretched.
The status bar and the weapon go into the same buffer, at the same chunk
size, because a crisp overlay on a chunky world reads as a filter applied to
a photograph.

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
`flat` flag has always meant. They SWAY instead: two sines phased off the
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


THE CAR PARK IS ONE VAN, SEVENTY-SEVEN TIMES, at the user's request, and
it arrived MODELLED. So the two sections after this one describe how the
seven drawn vehicles are measured off their sheets and built out of
boxes, and none of that is what you are looking at in the lot any more.
It is all still there — measured, packed, tested — because the riot van
and the APC in it are the responders' vehicles and js/responders.js has
not driven them up the road yet. The sheet itself has moved out of
assets/ into art/, so it is no longer half a megabyte the page
downloads.

WHAT A MODELLED VEHICLE NEEDS, AND IT IS NOT MUCH. tools/prep-van.mjs
measures the .glb and writes what it found into the file's own
asset.extras — the length, width and height in the game's units, which
axis is the length and which end of it is the nose, the two curves
(columns and levels) that everything downstream of the body asks for,
and the four view rectangles its paint comes from. js/car.js reads that
back, puts the triangles into the space the drawn fleet already speaks —
x +0.5 at the nose, y to the vehicle's left, z 0 on the ground, all as
fractions of the length — and hands back something shaped exactly like
an entry in js/car-data.js. Nothing in the tumble, the blockers, the
debris, the wrecks or the smouldering had to change.

THE MODEL'S OWN UVs ARE NOT USED, AND THAT IS THE POINT. They were, for
one afternoon, and the van shipped with its flanks smeared — the user's
words were "super fucked", which was fair. The mesh's side panels are
UV-mapped as a FAN of long thin triangles all sharing one corner, so a
few pixels of the picture are stretched across the whole side of the
van. Nothing catches that except drawing the UV layout over the texture
and looking at it, which took four minutes once the question was asked
properly and which I had already half-seen and waved away as an artefact
of my own scratch renderer.

What the texture IS, though, is a four-view sheet: front, rear, side and
plan of this very van, one per quadrant, on a flat grey field — exactly
the input the rest of js/car.js has wanted since the day it was written,
because the drawn fleet is seven of those sheets and the whole file is
about projecting them back onto a solid. So the SHAPE comes from the
model and the PAINT comes from the projection, and the two are
independent. That is better than fixing the UVs would have been: the
torn pieces of a wrecked van get real projected paint as well, which the
drawn fleet's debris has always had and a flat texel per piece never
would.

IT ALSO MEANS THE UNTEXTURED PRIMITIVE STOPPED BEING A PROBLEM. The
model's second primitive — glass, tyres, bumpers, chassis — arrives with
no texture at all, just a base colour of near-black, and a car park is
ONE material and one draw call. Projected, it does not need one: the
four views are renders of this mesh, so the side view has the tyre in it
where the tyre is and the front view has the windscreen where the
windscreen is. Painting the whole van from its own photographs gets the
black parts black for free.

MEASURING THE FOUR VIEWS is the only hard part, and the hard part of
that is that the picture has WING MIRRORS and the mesh does not. Key the
background out, take the bounding box in each quadrant, and the front
view comes out 55 per cent wider than the model, the rear 39, the plan
30 — all of it mirror. The LENGTH axis is clean, and it agrees between
the side and the plan view to under one per cent, so that is the ruler:
pixels per unit length from the two views that have a length in them,
and then every other window derived from the model's own proportions and
anchored on the two datums the picture and the mesh genuinely share —
the ground the tyres stand on, and the centre line a van is symmetric
about.

THREE THINGS ABOUT IT ARE WORTH WRITING DOWN.

WHICH END IS THE NOSE IS NOT IN THE FILE. A GLB says which way is up by
convention and says nothing at all about which way a van faces. This one
lies along its Z with the nose at +Z, established by rendering four
orthographic views of it in a scratch script and looking at which end has
the grille in it. Guessing would have parked seventy-seven vans
backwards, which is the kind of mistake that looks like a rendering bug.
The axis swap from (z, x, y) to (nose, left, up) is a cyclic permutation,
so it preserves handedness — which is the one thing that would otherwise
turn every triangle in the model inside out.

AND WHICH WAY ROUND IT IS IS NOT IN THE FILE EITHER, which is the same
lesson twice and cost three rounds of work to learn. That paragraph above
is correct and it is not the whole story: the conversion preserves
handedness, and the vans were still inside out, because the MODEL is.

A GLB states which way a face points twice over — the order of its three
corners, and the NORMAL attribute on them — and in this file the two
agree with each other on all 624 triangles and both point INWARD. That is
a thing a modeller can do without ever seeing it: flip a normal and its
winding together and the file is self-consistent, and most viewers draw
both sides anyway. This renderer does not draw both sides. Every face was
a back face, every back face was culled, and what stood in the car park
was the INSIDE of a van: a dark plate where the roof's underside was,
white boxes where the far panels were, no wheels, no grille, no van.
Seventy-seven times, through a smoke test that was checking the axes, the
scale, the ground line and the UVs and never once asked whether the thing
was the right way out.

It also wrecked the paint, and that is why this took three goes. The view
a face reads is chosen by WHERE IT POINTS, so with every normal inverted
the left flank was painted with the right flank's picture and the roof
with the underside's. Reported as "the van UV mapping is super fucked",
which it was; the UVs were a symptom.

So orientation is measured rather than trusted, the same way the length
and the nose are: the signed volume of the whole mesh about its own
centre, which is positive for a shell wound outward and negative for one
wound in, and if it is negative every triangle is reversed. A van's own
interior — seats, door cards, the cargo bay — subtracts from that, so the
claim is the SIGN and not the size: this model comes out at minus 27 per
cent of its bounding box, and reversed, plus 27. The drawn fleet, which is
solid boxes, sits between 55 and 69, and is the calibration.

THE FLAT MATERIAL IS THE INTERESTING PROBLEM. The model has two
primitives: the body, textured, and a second one — glass, tyres,
bumpers, chassis — with no texture at all, just a base colour of
near-black. A car park is ONE material and one draw call, so a second
material is not available. The answer is to find the darkest texel in the
texture and point every vertex of the flat primitive at it. One texture,
one draw call, and the tyres come out the colour tyres are.

AND THE TEXTURE IS HALVED. The gun's diffuse is copied byte for byte
because resampling pixel art is vandalism; the van's is a 700x382
photograph of a van, and the van is sixty pixels tall on screen. So it is
box-filtered to half and snapped to the game's own 256 colours — which
the GPU does to it at draw time anyway, so nothing is lost on screen, and
a photograph reduced to 256 colours compresses to a seventieth of what it
was: 785K to 11K, and the whole model 812K to 39K.



A CAR IS A PICTURE OF A CAR, FOUR TIMES. What arrived is seven images: a
hatchback, two white vans a model year apart, a pickup, a custom van with
an eagle down its flank, a riot van and a tracked APC, each drawn front,
rear, side and plan on a green field. What was in the car park until now
is a few boxes each with those images projected back onto them.
tools/prep-car.mjs does the measuring, js/car.js does the building,
js/vehicles.js does everything that happens afterwards, and
js/car-data.js is what one hands the other.

THE FOUR PICTURES ARE MEASUREMENTS AS WELL AS PAINT, and that is the whole
idea. An orthographic view is a parallel projection, so the side view's
silhouette is the vehicle's length by its height, the front view's is its
width by its height, the plan view's is its length by its width. Every pair
shares an axis with two others — three of the views claim a width — so each
sheet is OVER-DETERMINED and can be checked against itself. The riot van
agrees to one per cent; across all seven the spread is 1, 2.3, 2.4, 3,
4.6, 5 and
— the pickup, whose side view draws it taller for its length than its own
head-on views do — 11.5. So one per cent was luck, and the check is there
to catch a sheet that is NOT ONE VEHICLE (a swapped side and plan shows up
as twenty-odd per cent) rather than to grade the artwork. Each vehicle
carries its own residual into js/car-data.js and the test holds it. The
one number NOT taken off a picture is the length in metres, because
nothing in a picture of a van says how big a van is.

THE SHAPE IS THE VISUAL HULL OF THE THREE SILHOUETTES. Each view is a
parallel projection, so the vehicle lies inside its own silhouette
extruded along the axis that view was drawn down — the side view's,
pushed across the width, is a slab the vehicle is inside; the plan's,
pushed down, is another; the head-on views', pushed along the length, a
third — and inside all three at once is the tightest solid three pictures
can vouch for. It comes out as three curves: along the length, the side
view's top edge and the plan view's half width at each x (the COLUMNS);
up the height, the head-on views' half width at each z (the LEVELS).
js/car.js puts a vertex at every column and level, as high as the side
view allows there and as far out as the narrower of the other two views
allows, and the grid of them — two flanks, a top, an underside, a cap at
each end — is the body. A column whose top is below a level puts that
level's vertex ON its top, so up a windscreen the levels bunch and across
a bonnet they fall together, and the quads between fallen-together
vertices are skipped. Nothing is named: the nose corners round off because
the plan view rounds them, the shoulders because the head-on views do,
the windscreen slopes because the side view slopes it, a pickup steps down
to its bed because its top edge does, and the riot van's bonnet is
narrower than its cab because its plan view says so. Each curve is
simplified to its breakpoints (Douglas-Peucker: throw away every point
within half a percent of the length of the straight line through its
neighbours), so a straight roof is two columns and a rounded corner four
or five — twenty-odd columns and seven to nine levels per vehicle, a
thousand-odd triangles. Every edge on these sheets has the same specks in
it, so every curve goes through the same one-dimensional closing the side
view's top edge always did: a slot narrower than the window is bridged
and anything wider is kept exactly. The head-on views are taken as the
WIDER of the pair at each height, because both see the same widths and
where they differ it is the drawing — the pickup's rear bumper is a
chrome bar thinner than the ruler, and ruled away it left four rows of
nothing but tow hitch, which averaged with the front put a groove round
the truck at bumper height. A head-on silhouette cannot tell a tyre from
the body behind it, so the lowest levels are tyre to tyre; the plan view,
which sees the body over the tyres, clamps them back. The wheels stay
separate — the sill is the body's underside and they hang below it — and
sit a fraction inside the flank at their own x, because two faces at
exactly the same depth is a tie in the depth buffer, and a tie is the
flicker the trees used to have.

IT WAS THE SIDE OUTLINE LOFTED ACROSS ONE WIDTH BEFORE THAT, and a
staircase of boxes before that. The loft was the right silhouette from
the side and a rectangle from above: square nose corners, a crease for a
shoulder, and — because the projection paints whatever is under a face
with whatever the picture has at that spot — bled body colour on every
corner the picture had rounded off, which is what read as stretching. The
picture had the shape the whole time, in three views; the tool was reading
one of them. Tight geometry is what lets projected paint land where it
came from, and it is why the body is a thousand triangles now and not the
forty it was: forty was a box with rounded pictures on it.

SOME OF THE SHEETS FACE THE OTHER WAY. Two of the seven side views were
drawn nose to the right and five nose to the left, and a tool that
assumed one of those built a third of the fleet back to front: bonnet at
the tail, and the front view painted over it. Nothing in the arithmetic
can tell which way a picture of a van faces, so it is declared per sheet,
and a nose-right side view is flipped as it goes into the atlas — from
js/car.js onward every side view faces left and there is one rule. (All
seven plan views face left. The head-on views have no way to face.)

AND THE DECLARATION WAS WRONG ONCE, which is the reason it is checked
against the drawing now. The hatchback was read as nose-right off a
thumbnail, and for a day its grille was painted on its hatch and its
hatch glass served as a bonnet — a wedge, from every angle. Its top edge
column by column says otherwise, unmistakably: a long gentle rise into a
steep one is a bonnet and a windscreen; a slope into a drop is a hatch
and a tail. The eye gets a hatchback wrong at a hundred pixels. The
numbers do not, and PROFILE_DEBUG=<id> prints them.

AND THE RIGHT FLANK WAS PAINTED BACKWARDS. The projection took the side
view the other way round on the right-hand side, on the theory that a
picture seen from the other side is mirrored. It is; but a face's
coordinates are its own and do not care which side you are standing on —
nose is nose — and the effect was the tail's paint on the nose of every
right flank. On a plain van it is invisible. On a pickup it is the cab at
the back. The same on the underside, which mattered from the day cars
started landing on their roofs.

THE PAINT IS PROJECTED, not unwrapped. For each triangle: take the axis
its normal points most nearly along, and read the view that was drawn down
that axis — forward gets the front, sideways gets the side, up gets the
plan, and the two views down the same axis from opposite sides share one
picture, mirrored. There is no atlas laid out by a person and no seam to
place anywhere. It is the reason a model this crude reads as a vehicle:
the light bar, the wheel arches, the ribbed floor of the pickup's bed and
the airbrushed eagle down the custom van are all paint that lands where
the shape says it should.

WHAT A FLEET CHANGED. One sheet could be measured against itself in
fractions of its own length. Six could not, and every constant that was
secretly about vans had to be found and replaced:

  the roof line was "the topmost row of the side view that runs nearly
    half the length", because a van's roof does. A PICKUP'S DOES NOT: its
    cab is a quarter of its length, so the topmost row running half the
    length is the BONNET, and the side view would have anchored on the
    bonnet while the front view, which sees nothing but cab, anchored on
    the cab roof — sliding the paint a fifth of the height. The test is
    now relative to the longest run in the top third of each view, so a
    light bar is still a narrow thing sitting on a roof and a cab roof is
    still a roof, and a vehicle with nothing on top of it finds its roof
    in the first row or two, which is frame alignment, which is right
  the silhouette was "the largest connected blob after the opening",
    which on a van discards a mirror and on a PICKUP discards the truck:
    its windscreen is drawn see-through, so the head-on view's body is one
    island and its bumper another, and its rear wheels stand clear of the
    tailgate on either side. Measured across the six sheets the gap is not
    close — real parts are six per cent of the body and up, specks and
    mirrors are one per cent and under — so the vehicle is every piece at
    least three per cent of the biggest one. Losing the mirrors is right
    and not a compromise: the three views only agree about the width
    because none of them counts a wing mirror as bodywork
  the tyre was "the longest run at the bottom of the front view", which
    is right on four of the six and catastrophic on the fifth: the custom
    van has a BULL BAR across its nose, one run the whole width of the
    vehicle, read as a tyre four tenths of the van long — a slab of rubber
    from flank to flank. A tyre is one of the TWO things at the bottom of
    a head-on view, so only rows showing exactly two runs count
  two of the six carry a faint one-pixel seam straight across the middle
    of the picture, left over from however they were composited. Against
    the raw pixels that seam is a row which is not a gutter, so the sheet
    has three rows of views in it and the tool gives up. The opening that
    was already the ruler now runs over the WHOLE SHEET before the cells
    are cut, and the seam is not there
  a tracked vehicle has no wheel dips at all, so the count is declared
    per vehicle and the tool throws if the underside disagrees. It also
    has nothing to stand on but its bottom layer, so that layer starts at
    the ground rather than at the sill — otherwise the whole APC hovers
    the one pixel its tracks measured

MEASURING A SILHOUETTE THAT HAS RUBBISH IN IT is most of the tool. The
sheets are renders and renders come with specks — a stray three-pixel line
off the tail, a thin grid of stray rows over a plan view — and taken
literally they made the riot van's side view eleven pixels longer than it
is, which is five per cent, which is the difference between the three
views agreeing and not. So everything is measured after a 5x5
morphological opening, which deletes anything thinner than five pixels and
leaves a boxy vehicle alone. The opening is a RULER and not an edit: the
pixels that get packed are the original ones.

THE WINDOWS ARE HOLES IN THE KEY. Whoever rendered the sheets let the
glass go through to the green, so "green is background" cuts the
windscreen out of the van. The rule that works is topological rather than
chromatic: key you can reach from outside the vehicle is background, key
you cannot reach is glass. One flood fill from the border separates them.
Background gets the nearest body colour bled into it, so a face that
overhangs the silhouette by a pixel lands on paint rather than on a green
screen; glass is painted dark dark grey, a shade off black. (It used to
get the body colour, darkened, and a red car with dark red windows read
as a car with no windows at all.) The bled colour is taken from two
pixels IN from the edge, because every edge in a JPEG is fringed and
against a green screen the fringe is green — filled from the pixel next
door, an overhang comes out dark green.
That fill is a STOPGAP and the tool says how much of each view it covers
("see-through glass, painted dark"): a fifth of the hatchback's side view,
an eighth of the pickup's front. Nothing about a vehicle is drawn with
alpha — the atlas is opaque to the last pixel and the body uses the plain
wall material — but a windscreen the renderer let the seats and the green
through still looks like one you can see into, because those seats are
pixels in the sheet. The cure is upstream: a sheet rendered with opaque
glass, in the same four views on the same green, reads ~0% here and gets
its windows exactly as drawn.

AND THE GREEN COMES BACK OFF THE PAINT. A green screen throws green light
on what is standing in front of it, and white paint takes it: the panel
van's body is about six units greener than it is red or blue ALL OVER,
everywhere, three pixels in or thirty. That is not a fringe and no amount
of eroding reaches it. Against a saturated green field it reads as white,
which is why nobody notices in the sheet; cut out and parked on tarmac, it
is a pale green van, and it was. So no pixel may be greener than its own
strongest other channel — which leaves a red car red, a blue one blue and
a grey APC grey, because it only bites where green actually dominates, and
which is safe here for the reason the whole tool is: nothing that can be
cut out of a green screen was ever green itself.

THE THREE VIEWS AGREE ABOUT THE VEHICLE AND NOT ABOUT THE FRAME. They put
its proportions within a few per cent of each other and then draw it
sitting in different places inside its own picture: the riot van's head-on
views give it a taller light bar and shallower wheels, which slides
everything else three per cent of the height down the frame. Map frame to
bounding box and have done with it, and the model's roof lands up in a
band where the head-on view has nothing but light bar — which paints a
pale stripe along the top of the nose and the tail, and that is exactly
what it did. So the SCALE still comes from the frames, which is the
measurement that agrees, and the OFFSET comes from the ROOF LINE. Line
those up and the sills come out within a fifth of a pixel of each other as
well. Each view therefore carries the window of the model it covers, and
the projection is a plain remap.

AND IT IS LIT LIKE A WALL. This renderer does no shading, so a solid
comes out a silhouette — every face the same value, no edge anywhere. A car
borrows the trick the walls use, Doom's FAKE CONTRAST: a face looking
north or south reads a notch brighter than one looking east or west, the
same 0.055 js/level.js uses. The walls take it as a step because Doom's
walls are mostly on the grid; a van parked at a fifth of a radian never is,
so here it is the same number interpolated. The roof gets a lift on top of
that, being the face pointing at the floodlights, and the underside goes
dark. Four brightnesses is the whole of the shading and it is the
difference between a vehicle and a black rectangle.

THE LOT IS ONE MESH. There are a couple of hundred bays and about twenty
vehicles in them — sparse at the user's request, roughly one bay in six
near the doors and almost nothing by the road, because half the town has
already left; that is the map's decision and js/vehicles.js just fills
what it was given. Three of the twenty are abandoned across the driving
lanes, which are FOUND from the row geometry rather than guessed at: the
first cut put them at a hand-picked distance south of the road, where
there is no lane at all, and one of them ended up thirty-two units from a
parked van. Two vehicles in one bay — invisible while the lot was full,
and the first thing you see once it is not. Twenty meshes
would be twenty draw calls for a row of things that never move, so
a parked car is not a mesh: it is a slab of vertices baked into world
space and concatenated into ONE geometry, the same bargain js/mapgeo.js
makes with the walls. A car gets a mesh of its own for the second and a
half it is in the air and then goes back into a second slab with the other
wrecks, and so does every piece of debris that has come to rest. Rebuilds
happen once at the end of whichever tic dirtied them, so a chain reaction
that takes out six cars rebuilds once and nothing is ever drawn twice in
one frame. The whole car park costs about two hundredths of a millisecond
a tic, against a budget of 28.6.

AND THEY ARE IN THE BAYS, WHICH TOOK ANOTHER THING. The bay lines are
not geometry: the whole car park is a dozen polygons because one repeat
of the BAYROW texture IS one bay — 186 across, 180 deep, with the line
down its left edge — so a row of forty bays is one sector rather than
forty. But a floor tiles from the WORLD ORIGIN, which is right for tarmac
and lino and anything else with no feature to line up, and wrong for a
texture whose repeat means something: the lot starts at x = -1400, which
is not a multiple of 186, so the painted lines fell five units from the
middle of every bay and every car in the lot was parked ON a line
rather than between two of them. A sector can now say where its floor
texture starts, and the bay rows say their own corner — which does not
move a single car, it makes the arithmetic the parking already used come
out true. The test measures the two against each other: how far across
one repeat of the bay texture each car is standing, which had better be
half way.

ONLY CARS A SHOPPER MIGHT OWN. Four of the six are in the lot; the riot
van and the APC are measured, packed into the same atlas and parked
nowhere, waiting for js/responders.js to drive them up the road.

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
under it keeps it lit, and about four seconds later the tank goes. What
follows is one sequence and every part of it is arithmetic you can read.

THE FIRST BANG throws a blast that damages and IGNITES everything within
about two hundred units, clears the car park of anybody who can be
frightened, and puts the car in the air.

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
639 checks. Every one of them earns its place by having caught something
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
    meant most of the shop could never burn — the check now runs one match
    for forty thousand tics and demands every region of the store, and
    demands that every region says so afterwards
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
  a customer standing on top of a till, a gondola or the deli counter,
    found by testing the sector under them rather than the rectangle
    round the shop
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
    and its two declarations agree with each other and both point
    inward; every face was culled, and the projection painted each panel
    with the picture of the opposite one. The test measured the axes,
    the scale, the ground line and the UV spread — everything except
    whether the van was the right way out. It measures the signed
    volume now, and the drawn fleet beside it is the calibration
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
    and it is the only one out there: about twenty of them, sparse, and
    only the heading differs — no colour variation, no dents, nothing
    that would break the repeat. Six more vehicles are measured and
    ready in js/car-data.js (a hatchback, a work van, a pickup, a custom
    van, a riot van and an APC) and none of them is placed; the drawn
    panel van that used to be in there has been deleted at the user's
    request, since the modelled one answers to the same name
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
  nothing drives. The riot van and the APC are built, measured and packed
    and there is nowhere for them to be until js/responders.js brings
    them up the road
  four of the six neighbouring units are a shopfront with nothing behind
    it, which is one wall each and buys the whole read of the place
  no music
  no second level, and no level-to-level flow
  the boxcutter and the molotov are built and switched off
  nothing in the game fights back yet. Doom's chase — A_Look, A_Chase and
    P_NewChaseDir — is still in js/actor.js with nothing calling it, kept
    for the responders coming up the road
  the touch controls were proven on an emulated phone — real touch
    events through Chromium, both thumbs at once — and not yet on glass;
    the look speed, the dead zone and the button sizes want a real thumb
    on them, which is what the LOOK SPEED slider is for in the meantime
  the wood, the gun and the particles were proven in software-rendered
    Chromium, which draws them correctly and slowly; fifty-four thousand
    instances at 400 rows is well inside any real GPU, but nobody has
    yet watched it on one
  the player cannot be hurt — asked for, for now, and one flag in
    js/player.js. The tank is finite as of this pass and fills itself
    very slowly; nothing else refills it
  nobody comes down the road yet: js/responders.js escalates, announces
    and records the waves, and spawn() is one function waiting for
    actors and art
  nothing follows you into the wood, and the wood's fire and the
    store's do not cross the car park to each other; the flamethrower is
    the bridge
  the trees are 128 and 256 pixels, the sky 1024, the gun's paint 1024,
    the fleet's twenty-four views 85 to 231: art that came from outside
    was left as it came, and the 64-pixel rule stands for everything the
    game draws itself
  no save
