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
  art/                  the logo, the old sprite weapon and the van's
                          four-view sheet, as PNGs
  assets/cars/          the van, as one packed sheet of its four views
  assets/people/        the crowd, and what is left of one: seventeen
                          shoppers, eleven pieces, three splats, a fireball
  assets/forest/        the wood: ten plants with their burn maps, two grounds
  assets/sky/night.png  the night, baked from a Polyhaven panorama
  assets/models/        the flamethrower, prepared from the user's .glb
  assets/fonts/         Michroma (SIL OFL), the title face
  tools/bake-art.mjs    node tools/bake-art.mjs — turns art/ into source
  tools/prep-people.mjs the crowd's art, crunched down from galvarius
  tools/prep-forest.sh  copies the wood's art over from the golf project
  tools/bake-sky.mjs    the sky: 8k panorama to 1024 palette pixels
  tools/prep-model.mjs  strips the marker spheres out of a .glb, keeps their positions
  tools/prep-car.mjs    measures a vehicle off a four-view sheet and packs it
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

  the smoke test         379 checks, no install and no browser
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

You start at the mouth of the car park at night, under the pylon sign. The
parade is in front of you, the automatic doors open when you get near them,
and the night crew are still inside.

There is no goal. Burn what you like — the store, the wood behind it,
both — and see what the night brings down the road. The sixty-per-cent
target and the run back to the car park are gone, at the user's request:
the only aim for now is open mayhem, and the night ends when you close
the tab.

  WASD          move            MOUSE     look
  SHIFT         run             LMB/CTRL  flamethrower
  SPACE / F     open, use       ESC       pause
  [  ]          chunkiness      N         palette on / off
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
and no further, which is the whole feel of the thing. FOR NOW the player cannot be hurt and the tank never
empties; both are one flag each at the top of js/player.js. A boxcutter
and a molotov are written, tested and switched off.


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
  a produce bench       150
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

Left completely alone, one match takes the entire shop, and takes the
better part of half an hour to do it. Your flamethrower is very much
faster than that, which is the point of carrying it — you are not
starting the fire so much as deciding where it starts and how long the
store has.

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

AND THEY RUN. A shopper on eight-tic watch samples the fire grid at nine
points around itself — where it is standing and eight at its scare range
— which is what tells it both THAT there is a fire and WHICH WAY, and the
second is the part one sample cannot give you. Then it runs: of the eight
compass directions, the one that gets furthest from the heat and lands
somewhere cool, looking two steps ahead so it does not stop one step
short of noticing a wall of fire. Somebody going off frightens a much
wider circle than the fire does, so torching one at the tills empties the
front end before the pieces land.

Not Doom's chase with the sign flipped. P_NewChaseDir walks TOWARD a
thing and all its cleverness is about not oscillating in a doorway;
running away is a different problem, because what you are running from is
a region and the wrong step is not a wasted one, it is a step into the
fire.

THE CROWD is the third way it travels, and the fastest. A shopper has
twelve health, which is under a fifth of what one tic of the stream
delivers, so anything you point it at comes apart at once: a fireball
where they were, thirteen pieces of them thrown sixty or seventy units on
fire, and a little heat in the floor wherever each lands. Torch the queue
at the tills and you have not started one fire, you have started nine, in
a fan, in the part of the shop with the most cardboard in it.

The car park has no fuel at all and never burns, which makes it the safe
room: the one place you can stand and watch what you have done.


AND THEN IT FALLS DOWN
----------------------

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
over them goes. A dead fitting still draws, and a row of them hanging in
the open air over a roofless shop is the one thing in the shot that says
this is a computer program.


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

UNITS ARE DOOM UNITS. The player is 56 tall with his eye at 41, he is 32
across, and he steps up anything 24 or under without noticing. A wall
texture is 64 across and 64 up. That last one is the reason for the choice:
at 64 units to a 64-pixel texture the mapping between world and art is one
texel to one unit, everywhere, with no scale factor to carry around.

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
  a pylon sign      a HOLE: a ring of four thin sectors with a void in the
                      middle, so all four faces of the void are one-sided
                      walls carrying the sign. A freestanding object built
                      out of an absence, which is the only kind a sector
                      engine can make without a new primitive.
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

THE MAP'S Y IS THE RENDERER'S MINUS Z. A map with x east and y north laid
onto a renderer with x east and z north is LEFT-handed, and everything
still works: movement, collision, the camera, the sprites, all of it
self-consistent, and the picture a mirror image of the floor plan. Nothing
in a supermarket is chiral, so nobody notices — until the day a shopfront
says TO LET and it comes out backwards, and so does the fascia, and so does
the sign at the mouth of the car park. Negating y reverses the screen
winding of every polygon, so every winding in mapgeo.js is written reversed
to match; that is not a style, it is the other half of the sign change.

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

LIGHT STEPS, IT DOES NOT FADE. Doom did not multiply a surface by a light
level, it kept 32 pre-darkened copies of the palette and picked one. So
brightness drops a BAND at a time down a dark aisle, and those steps are
half the atmosphere. The material shader quantises light to 32 levels before
it uses it. Doom's fake contrast comes with the same idea: walls running
east-west read a notch brighter and north-south a notch darker, so a corner
is visible in a renderer that does no shading at all.

THE LIGHTS ARE OBJECTS, NOT PAINT. A suspended ceiling is a grid of tiles
with a fluorescent fitting every so often, and "every so often" is the
problem: a 64-pixel texture tiling every 64 units puts a fitting in every
tile. So the ceiling texture is declared as 256 units square — one texture
is a 4x4 block of tiles with a single housing in it — and the fittings land
every 256 units. A texel is four units instead of one, which is nothing on
a surface three metres over your head.

The texture only draws the HOUSING. The light itself hangs in it as a
separate object, because a light you can shoot out is worth ten you cannot,
and a lamp painted into the ceiling can never be anything but painted. Each
one has ten health. Shoot it, or let a fire get under it — the burn check
is two-dimensional, so anything alight on the floor below will eventually
take out the light above it — and it bursts, showers sparks that fall, and
goes dark for the rest of the level.

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


THE VAN IS A PICTURE OF A VAN, FOUR TIMES. What arrived is one image: an
armoured police truck on a green field, drawn front, rear, side and plan.
What is in the car park is nine boxes with that image projected back onto
them. tools/prep-car.mjs does the measuring, js/car.js does the building,
and js/car-data.js is what one hands the other.

THE FOUR PICTURES ARE MEASUREMENTS AS WELL AS PAINT, and that is the whole
idea. An orthographic view is a parallel projection, so the side view's
silhouette is the vehicle's length by its height, the front view's is its
width by its height, the plan view's is its length by its width. Every pair
shares an axis with two others — three of the views claim a width — so the
sheet is OVER-DETERMINED and it can be checked against itself. It agrees
to one per cent, and the residual is printed, recorded and held by the
test. Nothing about this vehicle's shape is a number somebody typed in
after looking at the picture: it is 2.39 long and 1.15 tall for every 1
wide because that is what the sheet says, which at 32 units to the metre
makes it five and a half metres of van, and it fills the depth of a bay.

THE SHAPE COMES OUT OF THE SIDE VIEW'S OWN OUTLINE. Its top edge,
simplified into five steps, is five boxes stacked from the sill; its
bottom edge dips exactly twice, and those are the wheels. Each box is then
as wide as the FRONT view is over the band of height that box occupies,
which is what makes the light bar a bar and the body a body without either
being named anywhere. Every box sinks a fraction of a unit into the one
below it and the wheels sit a fraction inside the flanks, because two
faces at exactly the same depth is not a drawing-order problem, it is a
tie, and a tie in the depth buffer is the flicker the trees used to have.

THE PAINT IS PROJECTED, not unwrapped. For each triangle: take the axis
its normal points most nearly along, and read the view that was drawn down
that axis — forward gets the front, sideways gets the side, up gets the
plan, and the two views down the same axis from opposite sides share one
picture, mirrored. There is no atlas laid out by a person and no seam to
place anywhere. It is the reason a model this crude reads as a vehicle:
the light bar, the vision slits, the white stripe and the wheel arches are
all paint that lands where the shape says it should.

MEASURING A SILHOUETTE THAT HAS RUBBISH IN IT is most of the tool. The
sheet is a render and renders come with specks — a stray three-pixel line
off the tail, a thin grid of stray rows over the plan view — and taken
literally they made the side view eleven pixels longer than it is, which
is five per cent, which is the difference between the three views agreeing
and not. So each view is measured after a 5x5 morphological opening, which
deletes anything thinner than five pixels and leaves a boxy vehicle alone,
and then from the largest connected blob of what survives. The opening is
a RULER and not an edit: the pixels that get packed are the original ones.

THE WINDOWS ARE HOLES IN THE KEY. Whoever rendered the sheet let the glass
go through to the green, so "green is background" cuts the windscreen out
of the van. The rule that works is topological rather than chromatic: key
you can reach from outside the vehicle is background, key you cannot reach
is glass. One flood fill from the border separates them. Background gets
the nearest body colour bled into it, so a face that overhangs the
silhouette by a pixel lands on paint rather than on a green screen; glass
gets the same colour, darkened, which is what glass in a dark blue
armoured van looks like and gets the vision slits right for free. The
colour is taken from two pixels IN from the edge, because every edge in a
JPEG is fringed and against a green screen the fringe is green — filled
from the pixel next door, a windscreen slit comes out dark green.

THE THREE VIEWS AGREE ABOUT THE VEHICLE AND NOT ABOUT THE FRAME. They put
its proportions within one per cent of each other and then draw it sitting
in different places inside its own picture: the head-on views give it a
taller light bar and shallower wheels, which slides everything else three
per cent of the height down the frame. Map frame to bounding box and have
done with it, and the model's roof lands up in a band where the head-on
view has nothing but light bar — which paints a pale stripe along the top
of the nose and the tail, and that is exactly what it did. So the SCALE
still comes from the frames, which is the measurement that agrees, and the
OFFSET comes from the ROOF LINE, which is the one horizontal all three
views draw unambiguously. Line those up and the sills come out within a
fifth of a pixel of each other as well. Each view therefore carries the
window of the model it covers, and the projection is a plain remap.

AND IT IS LIT LIKE A WALL. This renderer does no shading, so a box comes
out a silhouette — every face the same value, no edge anywhere. The car
borrows the trick the walls use, Doom's FAKE CONTRAST: a face looking
north or south reads a notch brighter than one looking east or west, the
same 0.055 js/level.js uses. The walls take it as a step because Doom's
walls are mostly on the grid; a van parked at a fifth of a radian never is,
so here it is the same number interpolated. The roof gets a lift on top of
that, being the face pointing at the floodlights, and the underside goes
dark. Four brightnesses on nine boxes is the whole of the shading and it
is the difference between a vehicle and a black rectangle.

YOU CANNOT WALK THROUGH IT. Doom's things are cylinders — one radius, no
rotation, however long the thing is — so five and a half metres of van is
three of them in a row, which is the oldest trick in the format and still
the right answer. That leaves the corners a few units short and the flanks
a few units proud, and a shopper brushing past reads it as a van. The
actor those three are is the only thing in the game with NO STATE and no
sprite: it has no `spawn`, so Actor.render and Actor.tic both fall out on
their first line, and the alternative was a one-frame sprite that never
gets drawn — a lie in the sprite bank and an entry in every table that
walks it.

THE TEST
--------

  node tools/smoke-test.mjs

No install and no browser — a stub stands in for three.js, since the
bakeries, the map builder, the collision and the state tables are all pure.
379 checks. Every one of them earns its place by having caught something
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
  there is ONE car. `level.carSlots` still holds seventy-seven of them —
    a position, a heading and a variant each, off the same arithmetic
    that drew the bay lines — and the van goes in the nearest one the
    player is facing when the level opens. Filling the rest is a loop the
    day there is more than one vehicle; nothing in js/game.js assumes
    there is only ever one
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
  the player cannot be hurt and the tank never empties — asked for, for
    now, and one flag each in js/player.js
  nobody comes down the road yet: js/responders.js escalates, announces
    and records the waves, and spawn() is one function waiting for
    actors and art
  nothing follows you into the wood, and the wood's fire and the
    store's do not cross the car park to each other; the flamethrower is
    the bridge
  the trees are 128 and 256 pixels, the sky 1024, the gun's paint 1024,
    the van's four views 106 to 221: art that came from outside was left
    as it came, and the 64-pixel rule stands for everything the game
    draws itself
  no save
