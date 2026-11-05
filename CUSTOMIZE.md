# Customizing the game

The 3D version is `index.html` plus the `game/` folder. The 2D version in `classic.html` loads automatically
when the browser has no WebGL, or with `?classic=1`. The game texts are in Spanish; the code comments are mostly
in Spanish too.

## The world

The world is one long, winding road. Each part of the game is a different zone, with a motorway between zones.
Sky, music and scenery change as the car moves forward:

| Part | Zone | Mood |
|---|---|---|
| 1 · Theory | Mediterranean islands joined by bridges | Morning → noon → golden hour |
| 1 → 2 | The car reverses into a Supercharger bay and charges; part 2 starts from there | Sunset |
| 2 · The car | "Desert route" with red mesas, a motel and tumbleweeds; car questions on the move | Sunset |
| 2 · Driving exam | A separate city block where the player drives with a gamepad | Dusk |
| 3 · Commitment | Forest with lanterns and a campfire | Night |
| Finale | Night drive around a heart-shaped lake, then a gazebo on a cliff over the sea | Starry night |

Zones are configured in `game/config.js` → `zones`, and distances in `road` (`placeGap`, `stageGap`).

## Questions

| Part | File |
|---|---|
| 1 · Theory | `questions.json`, or the local editor `admin.html` (run `./server.sh`) |
| 2 · The car and 3 · Commitment | `data/practical-questions.js` |

Add `"place": "<place id>"` to a question to choose the stop where it appears. In `admin.html` this is the
**Lugar de la isla** dropdown.

- **Adding or removing questions** rebuilds the world: places grow or shrink to fit.
- **Without `place`**, a question goes to the same place as the previous one.
- **Order:** within a place, questions appear in file order.
- **`correctIndex: -1`** marks a "personal" question where every answer is accepted.
- **Roadside extras:** `"extra": "agente"` puts a 3D traffic officer in front of the car. Extras live in
  `EXTRAS` in `game/stops.js`.

## Places

Everything is in `data/places.js`, and the order of the list is the order of the trip.

- **Add a place** with `{ id, name, subtitle, stage: 'theory', sky, diorama: 'generic', props }`. The `generic`
  diorama already places buildings, trees and the couple.
- **Terrain:** `props.biome` (`island`, `city`, `beach`, `desert`, `forest`, `cliff`, `country`),
  `props.elevation`, and `props.islandRight` / `props.islandLeft` for the width of the land.
- **Custom diorama:** add an entry to `DIORAMAS` in `game/dioramas.js`. These helpers are available:
  - placing models and people: `ctx.put(model, along, side, { height })`, `ctx.couple(...)`,
    `ctx.character(...)`, `ctx.walker(...)`
  - scenery: `ctx.label(...)`, `ctx.lamps()`, `ctx.cityBackdrop()`, `ctx.trees(...)`
- **Sky:** `morning`, `noon`, `golden`, `sunset`, `dusk`, `night`, `space`, `mars`.
- **Mountain road:** `props.mountain: { legs, legLength, spacing, height }` zig-zags up, turns around a summit
  roundabout and comes back down in the opposite lane.
- **Road trip:** `props.approach: 'roadtrip'` adds roundabouts, a motorway with oncoming traffic, exits, a petrol
  station, a service area and a toll.
  - The stretches are planned in `roadtripPlan()` (`game/track.js`).
  - The scenes are in `SCENES` (`game/roadtrip.js`) and the billboard texts in `BILLBOARDS`.
- **Flight:** `props.approach: 'flight'` turns the motorway into a runway; the car grows wings, takes off and lands
  at the place.
- **Space:** `props.approach: 'space'` gives the car rockets and sends it through space (`mars: true` makes the
  place Mars).
- **Parking:** `props.parking: true` makes the previous part end with the car reversing into a bay, and the next
  part start by pulling out. `props.noQuestions: true` keeps questions from landing there.
- **Showcase places:** `minStops: 1` with `props.showcase: true` stops the car, presents the place and drives on.
- **Photo in the clouds:** `props.photo` on the mountain place. When the car arrives, the clouds part and the photo
  appears in a polaroid.
- **City entrance:** `props.approach: 'ronda'` turns the approach into the ring road into Barcelona, with gantries,
  traffic and the skyline.

## The couple

The two characters are Kenney models. Pick them in `game/config.js` → `couple`; any model in
`assets/models/chars` keeps all its animations. Set the couple's initials (on the pen, the flag on Mars and so on)
in `coupleInitials`. The 2D version uses `COUPLE_INITIALS` in `main.js` and the `#couple-initials` element in
`classic.html`.

## Driving exam

The exam lives in `game/exam.js`. It has two laps, and the second repeats the tests with tighter timing:

| Test | Rule |
|---|---|
| STOP | Come to a full stop before the line |
| Turns | Use the indicator |
| 30 zone and zebra crossing | Give way to the pedestrian |
| Roundabout | Take the right exit and signal when leaving |
| Traffic light | Stop on red |
| Parking | Park in the marked bay |

- **Faults:** minor faults are counted. Major faults only repeat that test, so nobody ever fails.
- **When it ends**, a "pass" card offers **Continue** or **Retry**.
- **Emergency exit:** Ctrl+Shift+X, or hold Select + Start on the gamepad for 2 s.

## Password gate (optional)

When `GAME_PASSWORD` is set on Vercel, `middleware.js` keeps the whole site behind a session:

- **Without a session:** the root shows `portada.html`, and START asks for the password on the licence-plate
  screen (`login.html`).
- **The check:** the password is verified on the server (`api/login.js`), and the cookie is signed with
  `SESSION_SECRET`.
- **The plate** shows one box per letter of each word.
- **Wrong guesses** only say whether the guess was close (1–2 letters off) or got one of the words right.
- **The hints** are the `HINTS` array in `login.html`.

## Sound

Everything is in `sfx.js`. The music is generated live (music box, pads and reverb in F major) in several moods
(`day`, `sunset`, `road`, `night`, `space`, `suspense`, `love`, `celebrate`, …). It also adds ambience: waves and
birds by day, crickets at night, and the electric hum of the car following its speed.
