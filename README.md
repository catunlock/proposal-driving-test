# Autoescuela Cari · a 3D driving test that ends in a marriage proposal

![Title screen](docs/screenshots/title.webp)

I built this game to propose to my partner. She sat a "driving test" at home, then finished it inside our
Tesla on the car's own touchscreen. The last question was the real one. **She said yes. 💍**

This repository is the **anonymized public version**. Names, places, photos and inside jokes have been replaced
with fictional ones, but the engine and the whole experience are the same.

**▶ Play it: [proposal.alopezs.com](https://proposal.alopezs.com)**. The game UI is in Spanish, because the quiz parodies the Spanish
DGT driving theory test.

| | |
|---|---|
| ![Mountain road with hairpins](docs/screenshots/mola.webp) | ![Road trip to Mars](docs/screenshots/mars.webp) |
| ![Gamepad driving exam](docs/screenshots/exam.webp) | ![Night drive around a heart-shaped lake](docs/screenshots/paseo.webp) |

## The experience

1. **Theory test, at home.** A white Model 3 drives along a road through miniature dioramas of "our story":
   a café, a mountain road with hairpin bends, a cinema, Barcelona, a road trip south, a control tower where the car
   sprouts wings, and a rocket trip to Mars. Each stop raises a 3D road sign and asks a parody DGT question with
   three answers.
2. **In the car.** The car parks at a Supercharger, and the game continues on the Tesla's browser. It asks
   questions about the car itself, then runs a **free-driving exam with a gamepad**: STOP sign, 30 km/h zone with a
   pedestrian crossing, roundabout with indicators, traffic light and parking. An examiner gives directions and
   counts faults.
3. **Commitment.** A forest road lit by lanterns, where every answer is "yes".
4. **The question.** A night drive around a heart-shaped lake, a gazebo on a cliff, a ring box that opens… and
   _¿Quieres casarte conmigo?_ Fireworks follow, then a final "inspection": a red heart-shaped box hidden under the
   TV stand in the real living room.

![The proposal](docs/screenshots/proposal.webp)

## Engineering highlights

- **No build step.** About 13k lines of plain JavaScript in native ES modules. Three.js r160 loads through an
  import map, so any static host can serve it.
- **Data-driven procedural world.**
  - The road is generated from an itinerary (`data/places.js`). Cars drive in the right lane.
  - Mountain roads have hairpins, a summit roundabout and a separate lane for the descent.
  - There are three-lane motorways, road trips with roundabouts, tolls and traffic, and "flight" and "space"
    transitions between places.
  - Each place gets a diorama made of procedural geometry plus CC0 models. Static geometry is merged and vegetation
    is instanced to keep draw calls low.
- **Stylised rendering.**
  - Toon shading with post-processing: tilt-shift for the miniature look, bloom, and a colour grade that adapts to
    time of day and outer space.
  - A "lite" mode turns off shadows and post-processing on slow devices.
- **Camera direction.**
  - Follow, crane and travel shots, establishing shots and orbits.
  - Trees that would block the car are hidden only when they actually cover it on screen, using a screen-space
    bounding-box test.
- **Readable, touch-friendly UI.** Questions are HTML overlays anchored to 3D points, so the text stays crisp and
  tapping works reliably on the Tesla's touchscreen.
- **Gamepad driving sim.**
  - Uses the Gamepad API (Xbox or PlayStation pads) with keyboard as a fallback.
  - Arcade car physics, turn signals, speed limits and fault detection.
  - A rule-based examiner adds a harder second lap.
- **Generative audio.** Music, ambience, effects and the electric motor hum are synthesised at runtime with the
  Web Audio API.
- **In-car browser support.** The game detects the Tesla browser and offers a full-screen "theatre mode" and a
  "continue the route" entry point.
- **Graceful fallback.** Without WebGL, the game falls back to a 2D version (`classic.html`).
- **Optional password gate on Vercel.**
  - Routing Middleware plus a serverless function check the password on the server.
  - Sessions use an HMAC-SHA256-signed, HttpOnly cookie.
  - The hint UI never leaks letters. A wrong guess only tells you whether you are "close" or "half right".
- **Content tooling.** `admin.html` with `server.py` is a local editor for questions and their images.
- **Visual testing.** Headless Chrome (Puppeteer) captures screenshots of any point in the game through URL
  parameters such as `?stage=exam` or `?stage=theory&q=12`.

## Run it locally

```bash
./server.sh          # Python static server + question editor API on http://localhost:8000
```

Then open <http://localhost:8000>. Useful URL parameters:

| Parameter | What it does |
|---|---|
| `?stage=theory&q=5` | Jump to a question. Other stages: `technical`, `exam`, `commitment`, `paseo`, `last`, `proposal`, `celebration`, `glovebox` |
| `?tesla=true` | Pretend to be the car's browser |
| `?lite=1` | Lite mode (no shadows or post-processing) |
| `?debug=1` | FPS and draw-call counter |
| `?classic=1` | 2D version |
| `?fast=1`, `?timescale=0.5` | Speed animations up, or slow the camera down |

Exam controls: on a gamepad, **RT** accelerates, **LT** brakes or reverses, the **left stick** steers,
**LB/RB** work the indicators and **A** confirms. On a keyboard: arrow keys or **WASD**, **Q/E** for the
indicators and **Enter** to confirm.

## Deploy

The site is fully static, so it runs on any static host. The public demo runs on GitHub Pages. On Vercel you also
get the optional password gate:

| Env var | |
|---|---|
| `GAME_PASSWORD` | When set, a password is required before playing. When unset, the site is public. |
| `SESSION_SECRET` | A long random string used to sign the session cookie. |

The login hints live at the top of `login.html`.

## Make your own

Everything personal sits in a handful of data files: places, questions, texts, the couple's initials and the
characters. See [CUSTOMIZE.md](CUSTOMIZE.md).

```
index.html            3D game (Three.js)       classic.html   2D fallback
game/                 engine, world, track, dioramas, camera, exam, finale, UI
data/places.js        the itinerary (one diorama per place)
questions.json        theory questions          data/practical-questions.js   in-car questions
sfx.js                generative music and sound effects
middleware.js, api/   optional password gate (Vercel)
admin.html, server.py local question editor
```

## Credits

- Low-poly models by [Kenney](https://kenney.nl) (CC0).
- Tesla model: ["Tesla White car."](https://sketchfab.com/3d-models/tesla-white-car-2a4ee44439dc4b1b98f452a9ff427116)
  by [aarajesh](https://sketchfab.com/aarajesh), licensed under
  [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/). Optimised and lightly modified (headlights).
- Question illustrations generated with Google Gemini.
- [three.js](https://threejs.org), [canvas-confetti](https://github.com/catdad/canvas-confetti), and Google Fonts
  (Bangers, Fredoka, Caveat, Playfair Display).
- Built with [Claude Code](https://claude.com/claude-code) as an AI pair programmer.

---

Code © 2026 Alberto López Sánchez, [MIT licensed](LICENSE). Third-party assets keep their own licenses (see
Credits) · [cv.alopezs.com](https://cv.alopezs.com)
