// Arranque y guion del juego: portada → teoría → (coche) técnicas → examen de circulación → compromiso → pedida → cajita del corazón.
import * as THREE from 'three';
import { CONFIG, URLP } from './config.js';
import { Engine } from './engine.js';
import { onLoadProgress, loadModel } from './assets.js';
import { buildItinerary } from './itinerary.js';
import { Track } from './track.js';
import { World } from './world.js';
import { FX } from './effects.js';
import { Car } from './car.js';
import { CameraRig } from './camera.js';
import { Stops, SIGN_AHEAD } from './stops.js';
import { buildDioramas } from './dioramas.js';
import { buildRingBox, buildGlovebox } from './finale.js';
import { applyLook } from './looks.js';
import { planRoadtrips, buildRoadtrips } from './roadtrip.js';
import { UI } from './ui.js';
import { buildExam, examSummary } from './exam.js';
import { buildPaseo } from './paseo.js';

const app = {};
window.__app = app; // para depurar desde la consola
const sfx = (name, ...a) => { if (window.sfx && window.sfx[name]) window.sfx[name](...a); };

async function boot() {
    onLoadProgress((d, t) => UI.loading(d, t));
    // Las fuentes deben estar listas antes de pintar los letreros en canvas
    await Promise.all(['400 40px Bangers', '700 40px Fredoka', '700 40px Caveat', '700 40px "Playfair Display"']
        .map(f => document.fonts.load(f).catch(() => null)));

    const itinerary = await buildItinerary();
    const engine = new Engine(document.getElementById('scene'));
    const track = new Track(itinerary);
    planRoadtrips(track);          // zonas llanas de los viajes largos (antes del terreno)
    Object.assign(app, { itinerary, engine, track });
    app.world = new World(engine, track);
    app.fx = new FX(engine);

    loadModel('tesla');
    const buildDioramaObjects = await buildDioramas(app, itinerary.places); // registra colinas
    app.world.buildTerrain();
    engine.scene.add(track.buildMesh());
    await buildDioramaObjects();
    await buildRoadtrips(app);
    // Sin árboles entre la cámara y la señal de cada parada (la cámara de parada mira en diagonal
    // desde detrás a la izquierda: se despeja el pasillo de la señal hacia ella)
    for (const st of itinerary.stops) {
        const sign = track.point(st.s + SIGN_AHEAD, CONFIG.road.signSide);
        app.world.reserve(sign.x, sign.z, 4);
        for (const [a, b, r] of [[-10, -6, 4], [-5, -4.5, 3.5], [0, -3.5, 2.5]]) {
            const p = track.point(st.s + a, b);
            app.world.reserve(p.x, p.z, r);
        }
        const f = track.frame(st.s), yaw = 0.3;
        const scene = track.point(st.s + SIGN_AHEAD, st.place.mountain ? 3 : 9);
        const C = sign.clone().lerp(scene, 0.5);
        const dx = f.tx * Math.cos(yaw) + f.nx * Math.sin(yaw), dz = f.tz * Math.cos(yaw) + f.nz * Math.sin(yaw);
        const cam = new THREE.Vector3(C.x - dx * 22, 0, C.z - dz * 22);
        for (let k = 1; k <= 5; k++) { const u = k / 8; app.world.reserve(sign.x + (cam.x - sign.x) * u, sign.z + (cam.z - sign.z) * u, 3.4); }
    }
    await app.world.scatter();
    app.world.buildTrees();
    app.world.decorateHighways();
    await app.world.decorateApproaches();
    app.world.buildClouds();

    app.car = new Car(engine, track);
    await app.car.load();
    app.rig = new CameraRig(engine, track, app.car);
    app.world.occCar = app.car;
    // en marcha solo importa que no tapen el coche; en los planos fijos, también lo que se mira
    app.rig.onMove = (pos, look) => { app.world.lookTarget = look; app.world.occLook = !['follow', 'travel'].includes(app.rig.mode.name); };
    app.stops = new Stops(engine, track, app.fx);
    const mirador = itinerary.places.find(p => p.stage === 'finale');
    if (mirador && mirador.runtime && mirador.runtime.pedestalTop) app.ringBox = buildRingBox(engine.scene, mirador.runtime.pedestalTop);
    app.glovebox = buildGlovebox(engine.scene);
    app.currentPlace = itinerary.places[0];

    engine.onUpdate(updateEnvironment);
    applyLook(app, URLP.look || 'cartoon');      // estilo: cartoon + filtro cálido (?look=actual para quitarlo)
    const first = itinerary.places[0];
    app.rig.orbit(track.point(first.sCenter, 20), { radius: 46, height: 22, speed: 0.035, lookY: 1 });
    app.rig.snap();
    engine.start();

    window.__gameReady = true;
    await UI.wait(300);
    UI.hideLoading();
    // El barrio del examen de circulación se monta en segundo plano (está lejos y no se ve)
    app.examReady = buildExam(app).catch(err => { console.error('Examen de circulación', err); return null; });
    // Paseo nocturno en bucle antes del mirador (también lejos del recorrido)
    app.paseoReady = buildPaseo(app).catch(err => { console.error('Paseo nocturno', err); return null; });
    route();
}

// Cielo, música y ambiente según dónde esté el coche (las transiciones van con el viaje, no con el reloj)
function updateEnvironment() {
    const { track, car, world } = app;
    const s = car.s;
    world.focus.copy(car.root.position);
    const r = track.regionAt(s);
    let a, b, t = 0;
    if (r.place) { a = b = r.place.sky; }
    else if (r.type === 'lead') { a = b = r.to.sky; }
    else if (r.type === 'end') { a = b = r.from.sky; }
    else {
        a = r.from.sky; b = r.to.sky;
        t = THREE.MathUtils.smoothstep((s - r.s0) / (r.s1 - r.s0), 0.12, 0.88);
    }
    // Viaje espacial: el cielo se vuelve negro con estrellas al subir (y vuelve al bajar)
    const fs = track.flightState(s);
    world.spaceK = fs.region && fs.region.type === 'space' ? fs.space : 0;
    if (world.spaceK > 0) {
        const R = fs.region, orbit = R.pieces.find(p => p.type === 'orbit');
        const second = s > (orbit.s0 + orbit.s1) / 2;
        a = second ? R.to.sky : R.from.sky; b = 'space'; t = world.spaceK;
    }
    if (app.skyOverride) { a = b = app.skyOverride; t = 0; }
    world.setSkyMix(a, b, t);

    if (!app.audioOn) return;
    const here = track.placeAt(s);
    const zone = here.zone;
    const spacey = world.spaceK > 0.3 || (r.type === 'place' && here.props.mars);
    const music = app.musicOverride || (spacey ? 'space' : zone.music);
    if (!app.musicLock && music !== app.musicNow) { app.musicNow = music; sfx('music', music); }
    const amb = world.quiet > 0.5 || world.spaceK > 0.3 ? null : world.nightness > 0.5 ? 'night' : 'day';
    if (amb !== app.ambNow) { app.ambNow = amb; sfx('ambience', amb); }
}

function startAudio() {
    app.audioOn = true;
    app.musicNow = null; app.ambNow = null;
    updateEnvironment();
}

function stageStops(stage) { return app.itinerary.stops.filter(s => s.stage === stage); }

// Coloca el coche en un punto del recorrido, con todo lo anterior ya "florecido"
async function jumpTo(stopIndex, fromS = null) {
    const stops = app.itinerary.stops;
    for (let i = 0; i < stopIndex && i < stops.length; i++) {
        const st = stops[i];
        if (st.q) await app.stops.bloom(st, { lantern: st.kind === 'commitment', silent: true });
    }
    const target = stops[Math.min(stopIndex, stops.length - 1)];
    const s = fromS ?? Math.max(app.track.startS, target.s - 8);
    app.car.place(s);
    app.currentPlace = fromS !== null ? app.track.placeAt(s) : target.place;
    app.rig.follow();
    app.rig.snap();
    await UI.wait(50);
}

function setURL(stage, q) {
    const url = new URL(location.href);
    ['tesla_fullscreen', 'test'].forEach(p => url.searchParams.delete(p));
    if (stage) url.searchParams.set('stage', stage); else url.searchParams.delete('stage');
    if (q !== undefined && q !== null) url.searchParams.set('q', q); else url.searchParams.delete('q');
    history.replaceState({}, '', url);
}

async function route() {
    const tesla = detectCarBrowser() || URLP.tesla;
    if (tesla) { try { sessionStorage.setItem('isTesla', '1'); } catch (e) { /* ignorar */ } }

    if (URLP.teslaFullscreen) { startAudio(); return runFrom('technical'); }
    if (URLP.stage) { startAudio(); return runFrom(URLP.stage, URLP.q || 0); }
    // Desde la portada pública: ya pulsó START y acertó la contraseña → un toque para arrancar
    // (el toque hace falta para que suene la música y para la pantalla completa en el coche)
    if (URLP.go === 'start' || URLP.go === 'practical') {
        const url = new URL(location.href); url.searchParams.delete('go'); history.replaceState({}, '', url);
        await UI.prompt('¡Contraseña correcta! Ya puedes empezar 🚦', URLP.go === 'practical' ? '🏁 Continuar ruta' : '▶ Empezar el examen');
        startAudio();
        if (URLP.go === 'practical') { requestAppFullscreen(); return runFrom('technical'); }
        return runFrom('theory');
    }

    sfx('music', 'day');
    const choice = await UI.title({ tesla: tesla || isLocal() });
    startAudio();
    if (choice === 'practical') {
        requestAppFullscreen();
        return runFrom('technical');
    }
    return runFrom('theory');
}

function isLocal() {
    const h = location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h.startsWith('192.168.');
}

const ORDER = ['theory', 'technical', 'exam', 'commitment', 'paseo', 'last', 'proposal', 'celebration', 'glovebox'];

// --- Supercharger: la Parte 1 termina aparcando y cargando; la Parte 2 empieza saliendo -----
function chargerPlace() { return app.itinerary.places.find(p => p.park); }

async function arriveAtCharger() {
    const sc = chargerPlace();
    if (!sc) return;
    const { car, rig } = app;
    UI.hideHud();
    await travelTo({ s: sc.park.s, place: sc, q: null, kind: 'arrive' });
    app.currentPlace = sc;
    rig.establish(sc, sc.park.s - sc.park.R - 1, 6.5);
    UI.placeBanner(sc);
    await car.park(sc.park);
    sc.runtime.startCharging && sc.runtime.startCharging(car);
    sfx('bloom');
    UI.toast('⚡ Cargando…', 2200);
    await UI.wait(2400);
}

// Coloca el coche aparcado y cargando (inicio de la Parte 2 desde el Tesla)
async function parkedAtCharger() {
    const sc = chargerPlace();
    if (!sc) return false;
    const stops = app.itinerary.stops;
    for (const st of stops) if (st.q && st.stage === 'theory') await app.stops.bloom(st, { silent: true });
    app.car.placeParked(sc.park);
    app.currentPlace = sc;
    app.rig.establish(sc, sc.park.s - sc.park.R - 1, 6.5);
    app.rig.snap();
    sc.runtime.startCharging && sc.runtime.startCharging(app.car);
    return true;
}

async function leaveCharger() {
    const sc = chargerPlace();
    if (!sc || !app.car.lateral) return;
    const { car, rig } = app;
    // Carga hasta el 100 % y esperamos a que el conductor arranque
    for (const pct of [92, 96, 99]) { UI.toast(`⚡ ${pct}%`, 900); await UI.wait(1000); }
    UI.toast('🔋 100% · ¡Batería llena!', 1600);
    await UI.prompt('Parte 2 · Examen práctico en el coche 🚗 ¿Listos para salir?', '🔑 Arrancar');
    sfx('start');
    sc.runtime.stopCharging && sc.runtime.stopCharging();
    await car.unpark(sc.park);
    rig.follow();
}

// Final de la última isla de una etapa (para empezar la siguiente recorriendo la autopista)
function stageExitS(stage) {
    const ps = app.itinerary.places.filter(p => p.stage === stage);
    return ps.length ? ps[ps.length - 1].s1 - 2 : null;
}

async function runFrom(stage, q = 0) {
    if (!ORDER.includes(stage)) stage = 'theory';
    const idx = ORDER.indexOf(stage);
    let parked = false;
    if (stage === 'technical' && q === 0) parked = await parkedAtCharger();
    if (parked) { /* empieza aparcado en el Supercharger */ }
    else if (stage === 'paseo') {
        // el paseo nocturno empieza al acabar la Parte 3
        const list = stageStops('commitment');
        await jumpTo(list.length ? list[list.length - 1].index : 0, stageExitS('commitment'));
    }
    else if (stage === 'theory' || stage === 'technical' || stage === 'commitment' || stage === 'exam') {
        // el examen de circulación empieza donde acaba la Parte 2 (y después sigue la Parte 3)
        const list = stageStops(stage === 'exam' ? 'commitment' : stage);
        if (stage === 'exam') q = 0;
        const first = list[Math.min(q, Math.max(list.length - 1, 0))];
        // Al empezar una parte desde el principio, salimos desde el final de la anterior: se ve la autopista
        const prevStage = { technical: 'theory', commitment: 'technical', exam: 'technical' }[stage];
        const fromS = q === 0 && prevStage ? stageExitS(prevStage) : null;
        if (first && (first.index > 0 || fromS !== null)) await jumpTo(first.index, fromS);
        else app.rig.follow();
    } else {
        const fin = stageStops('finale')[0];
        await jumpTo(fin ? fin.index : app.itinerary.stops.length - 1);
    }

    if (idx <= 0) {
        await playStage('theory', q);
        setURL(null);
        await arriveAtCharger();
        const r = await theoryEnd();
        if (r === 'home') { location.href = location.pathname; return; }
    }
    if (idx <= 1) {
        await leaveCharger();
        await playStage('technical', idx === 1 ? q : 0);
    }
    // Justo después de las preguntas del Tesla: el examen de circulación (su APTO cierra la Parte 2)
    if (idx <= 2 && !(await drivingExam())) await technicalEnd();
    if (idx <= 3) {
        if (idx < 3 || q === 0) await commitmentIntro();
        await playStage('commitment', idx === 3 ? q : 0);
    }
    // Paseo nocturno en bucle: tiempo para hablar tranquilos hasta pulsar "Continuar"
    if (idx <= 4) await paseo();
    await finale(idx <= 5 ? 'last' : stage);
}

async function playStage(stage, fromQ = 0) {
    const list = stageStops(stage);
    for (let i = fromQ; i < list.length; i++) {
        setURL(stage, i);
        await visit(list[i]);
    }
}

function judge(stop, index) {
    const q = stop.q;
    if (stop.kind === 'commitment' || q.isPersonal || q.correctIndex === -1 || q.correctIndex === undefined) return 'correct';
    if (index === q.correctIndex) return 'correct';
    return stop.kind === 'technical' ? 'retry' : 'wrong';
}

const CHEERS = ['¡Correcto!', '¡Muy bien!', '¡Genial!', '¡Bravo!', '¡De 10!'];
const COMMIT_CHEERS = ['¡Aceptado! 💖', '¡Sí! 💞', '¡Firmado! ✍️', '¡Hecho! 🥰'];

// Viaje hasta una parada. Si cambia de lugar: secuencia de viaje con banner de ruta.
async function travelTo(stop) {
    const { car, rig, track } = app;
    const dest = stop.place;
    const from = app.currentPlace;
    // Subida larga dentro del mismo lugar (montaña): también con cámara de viaje
    if (from === dest && dest.mountain && stop.s - car.s > 40) {
        UI.route('Base', dest.name, 'Subida a ' + dest.name + ' ⛰️');
        rig.travel();
        const startS = car.s, endS = stop.s - 14;
        let done = false;
        const off = app.engine.onUpdate(() => {
            UI.routeProgress((car.s - startS) / Math.max(1, endS - startS));
            if (!done && car.s >= endS) { done = true; rig.follow(); UI.hideRoute(); }
        });
        await car.driveTo(stop.s, { speed: s => (s < endS ? CONFIG.car.travelSpeed : CONFIG.car.speed) });
        off();
        if (!done) { rig.follow(); UI.hideRoute(); }
        return true;
    }
    if (!from || from === dest) {
        rig.follow();
        await car.driveTo(stop.s);
        return false;
    }
    const C = CONFIG.car;
    const highway = from.stage !== dest.stage;
    const startS = car.s, arriveS = dest.mountain ? stop.s - 14 : dest.s0 - 12;
    const gapReg = track.regionAt(Math.max(startS, dest.s0 - 1));
    const label = dest.park ? `Rumbo al ${dest.name} ⚡ · fin de la Parte 1` : highway ? `Rumbo a ${dest.zone.label}` : gapReg.type === 'roadtrip' ? `Road trip hasta ${dest.name} 🚗💨` : gapReg.type === 'flight' ? `Volando a ${dest.name} ✈️💕` : gapReg.type === 'space' ? (dest.props.mars ? `Rumbo a Marte 🚀 · ${dest.name}` : 'Vuelta a la Tierra 🌍') : '';
    UI.route(from.name, dest.name, label);
    rig.travel();
    if (highway) sfx('start');
    const speed = s => {
        if (s >= dest.s0 - 6) return C.speed;
        const hint = track.speedHint(s);
        if (hint) return hint;
        return track.regionAt(s).type === 'highway' ? C.highwaySpeed : C.travelSpeed;
    };
    let arrived = false;
    const off = app.engine.onUpdate(() => {
        UI.routeProgress((car.s - startS) / Math.max(1, arriveS - startS));
        if (!arrived && car.s >= arriveS) {
            arrived = true;
            rig.follow();
            UI.hideRoute();
        }
    });
    await car.driveTo(stop.s, { speed });
    off();
    if (!arrived) { rig.follow(); UI.hideRoute(); }
    app.currentPlace = dest;
    return true;
}

// Montserrat está junto a la carretera: la cámara se aleja para ver la montaña y la foto entre las nubes
const MONTSERRAT_VIEW = { lookUp: 5, back: 44, up: 8, shift: 0 };

async function visit(stop) {
    const { car, rig, stops } = app;
    const traveled = await travelTo(stop);
    app.currentPlace = stop.place;
    app.musicOverride = null;
    if (!stop.q) {
        // Lugar sin preguntas pero para enseñar (p. ej. Lanzarote): presentación y seguimos
        if (stop.place.props.showcase) {
            const rt = stop.place.runtime;
            if (stop.place.diorama === 'montserrat' && rt.reveal) {
                // Montserrat: la cámara mira a la montaña y las nubes se abren con la foto
                sfx('arrive');
                UI.placeBanner(stop.place);
                rig.vista(rt.target, MONTSERRAT_VIEW);
                await UI.wait(1800);
                sfx('shimmer');
                await rt.reveal(true);
                await UI.wait(6500);
            } else {
                rig.establish(stop.place);
                sfx('arrive');
                await UI.placeBanner(stop.place);
                await UI.wait(2500);
            }
        }
        return;
    }

    // Primera parada en un lugar: plano de presentación de la maqueta
    if ((stop.localIndex === 0 || traveled) && stop.place.diorama !== 'montserrat') {
        rig.establish(stop.place, stop.place.length > 80 ? stop.s + 6 : null);
        sfx('arrive');
        await UI.placeBanner(stop.place);
    }

    UI.hud(stop);
    const isVista = stop.place.diorama === 'montserrat' && stop.place.runtime.reveal;
    if (isVista) {
        rig.vista(stop.place.runtime.target, MONTSERRAT_VIEW);
        sfx('shimmer');
        await stop.place.runtime.reveal(true);
    } else {
        rig.stop(stop.s, { focus: stops.signPosition(stop) });
        sfx('pop');
        await stops.showSign(stop);
    }

    const res = await UI.question(stop, i => {
        const v = judge(stop, i);
        if (v === 'retry') { stops.wobble(); car.shake(); sfx('bad'); UI.toast('¡Prueba otra vez!'); }
        return v;
    });
    if (res.verdict === 'correct') {
        sfx('good');
        car.jump();
        const list = stop.kind === 'commitment' ? COMMIT_CHEERS : CHEERS;
        UI.toast(list[stop.index % list.length]);
    } else {
        sfx('bad');
        stops.wobble();
        car.shake();
        UI.toast('¡Uy! 🙈');
    }
    await UI.wait(CONFIG.timings.answerDelay);
    await UI.hideQuestion();
    if (isVista) await UI.wait(1200);
    else await stops.hideSign();
    sfx('bloom');
    await stops.bloom(stop, { lantern: stop.kind === 'commitment' });
}

async function theoryEnd() {
    const { rig } = app;
    UI.hideHud();
    rig.overview({ spin: 0.05, dist: 42 });
    setTimeout(() => {
        sfx('fanfare');
        if (window.confetti) window.confetti({ particleCount: 120, spread: 90, origin: { y: 0.6 } });
    }, URLP.fast ? 1000 : 3600);
    return UI.theoryResult();
}

// Fin de la Parte 2: sello de APTO sobre el desierto al atardecer
async function technicalEnd() {
    const { rig } = app;
    UI.hideHud();
    setURL(null);
    rig.overview({ spin: 0.05, dist: 30 });
    setTimeout(() => {
        sfx('fanfare');
        if (window.confetti) window.confetti({ particleCount: 110, spread: 90, origin: { y: 0.6 }, colors: ['#ffd23f', '#ff9f1c', '#ff4d8d', '#ffffff'] });
    }, URLP.fast ? 500 : 1400);
    await UI.stageResult({
        stamp: 'APTO',
        title: '¡Práctico aprobado! 🚗',
        text: 'Conoces nuestro coche de arriba abajo ⚡<br>Ya solo queda la parte más importante…',
        button: 'Continuar 💖'
    });
}

// Examen de circulación (final de la Parte 2): ella conduce el Tesla con el mando por un barrio de
// ciudad (game/exam.js). Al aparcar en la plaza del corazón, sello de APTO y sigue la Parte 3.
async function drivingExam() {
    const exam = await app.examReady;
    if (!exam) return false;                 // si algo falló al montar el barrio, se salta (APTO normal)
    const { car, rig, engine } = app;
    const back = { s: car.s, place: app.currentPlace };
    UI.hideHud();
    setURL('exam');
    app.musicOverride = 'road';
    sfx('music', 'road');
    app.musicNow = 'road';
    let offPad = exam.input.padUI(engine);   // A en el mando pulsa los botones de las tarjetas
    sfx('shimmer');
    await UI.chapter({
        kicker: 'Parte 2 · Última prueba',
        title: 'Examen de circulación',
        sub: 'Ya conoces el coche… ¡ahora lo conduces tú! 🚦<br>🎮 Coge el mando · <b>RT</b> acelera · <b>LT</b> frena · <b>LB</b>/<b>RB</b> intermitentes',
        button: '🔑 Arrancar'
    });
    offPad();
    // Se puede repetir tantas veces como se quiera (es la parte más divertida 😄)
    for (let round = 1; ; round++) {
        await UI.fade(true);
        app.skyOverride = 'dusk';
        const resP = exam.run();
        await UI.wait(150);
        await UI.fade(false);
        const res = await resP;
        offPad = exam.input.padUI(engine);
        if (!res.skipped) {
            setTimeout(() => {
                sfx('fanfare');
                if (window.confetti) window.confetti({ particleCount: 110, spread: 90, origin: { y: 0.6 }, colors: ['#ff4d8d', '#ffd23f', '#2ee87a', '#ffffff'] });
            }, URLP.fast ? 300 : 700);
        }
        const pad = !!exam.input.pad;
        const choice = await UI.stageResult({
            stamp: 'APTO',
            title: round > 1 ? `¡Práctico aprobado otra vez! 🚗 (intento ${round})` : '¡Práctico aprobado! 🚗',
            text: examSummary(res) + '<br>Conoces nuestro coche y sabes conducirlo ⚡<br>Ya solo queda la parte más importante…'
                + (pad ? '<br><small>🎮 A: continuar · Y: repetir el examen</small>' : ''),
            button: 'Continuar 💖',
            button2: '🔁 Repetir el examen'
        });
        offPad();
        if (choice !== 'again' || res.skipped) break;
    }
    await UI.fade(true);
    exam.leave();
    app.skyOverride = null;
    app.musicOverride = null;
    car.place(back.s);
    app.currentPlace = back.place;
    rig.follow();
    rig.snap();
    await UI.wait(150);
    await UI.fade(false);
    return true;
}

// Paseo nocturno: el Tesla da vueltas solo alrededor de un lago con forma de corazón
// (game/paseo.js) hasta que se pulsa "Continuar"; después, rumbo al mirador.
async function paseo() {
    const P = await app.paseoReady;
    if (!P) return;
    const exam = await app.examReady;
    const { car, rig } = app;
    const back = { s: car.s, place: app.currentPlace };
    UI.hideHud();
    setURL('paseo');
    app.musicOverride = 'romance';
    sfx('music', 'romance');
    app.musicNow = 'romance';
    await UI.fade(true);
    app.skyOverride = 'night';
    const runP = P.run({ input: exam ? exam.input : null });
    await UI.wait(200);
    await UI.fade(false);
    await runP;
    sfx('shimmer');
    await UI.fade(true);
    P.leave();
    app.skyOverride = null;
    app.musicOverride = null;
    car.place(back.s);
    app.currentPlace = back.place;
    rig.follow();
    rig.snap();
    await UI.wait(150);
    await UI.fade(false);
}

// Cortinilla de la Parte 3: cambio claro de capítulo (noche, música romántica)
async function commitmentIntro() {
    UI.hideHud();
    app.musicOverride = 'romance';
    sfx('music', 'romance');
    app.musicNow = 'romance';
    sfx('shimmer');
    await UI.chapter({
        kicker: 'Parte 3',
        title: 'El compromiso',
        sub: 'Aquí no hay respuestas incorrectas…<br>solo promesas 💞',
        button: '💍 Empezar'
    });
}

async function finale(from) {
    const { rig, car, fx, stops } = app;
    const fin = stageStops('finale')[0];
    const place = fin ? fin.place : null;
    const center = place && place.runtime.center ? place.runtime.center : car.root.position.clone();
    setURL(null);
    UI.hideHud();

    if (from === 'last') {
        if (fin) await travelTo(fin);
        app.musicLock = true;
        sfx('music', 'waltz');      // la misma música que en la muestra del anillo (sin cortes)
        rig.orbit(center, { radius: 13, height: 3.8, speed: 0.07, angle: Math.atan2(car.root.position.z - center.z, car.root.position.x - center.x), lookY: 2.2 });
        await UI.cinematic();
    }
    app.musicLock = true;
    if (from === 'last' || from === 'proposal') {
        sfx('music', 'waltz');
        const ped = place && place.runtime.pedestalTop ? place.runtime.pedestalTop : center;
        // Plano de la pedida: entre dos columnas del templete, contrapicado suave para que se vean
        // el estuche dentro (sin que la cornisa lo corte) y el corazón sobre la cúpula
        const a = proposalAngle(center, rig.cam.position);
        const R = 18, camPos = new THREE.Vector3(ped.x + Math.cos(a) * R, ped.y + 1.4, ped.z + Math.sin(a) * R);
        rig.orbit(ped, { radius: R, height: 1.4, angle: a, sway: 0.05, lookY: 3.0, stiffness: 1.1, tilt: { amount: 0.3, focus: 0.5, range: 0.45 } });
        const heart = place && place.runtime.heart;
        if (heart) heart.userData.face = Math.atan2(Math.cos(a), Math.sin(a));
        if (app.ringBox) { app.ringBox.aim(camPos); sfx('shimmer'); app.ringBox.open(fx); }
        await UI.proposal();
    }
    if (from !== 'glovebox') {
        sfx('music', 'celebrate');
        sfx('fanfare');
        celebrateConfetti();
        stops.releaseFloaters();
        rig.orbit(center, { radius: 26, height: 12, speed: 0.06, lookY: 4 });
        let fireworks = true;
        (async () => {
            while (fireworks) {
                const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 14;
                fx.rocket(new THREE.Vector3(center.x + Math.cos(a) * d, center.y, center.z + Math.sin(a) * d), 14 + Math.random() * 10);
                setTimeout(() => sfx('firework'), 1000);
                await UI.wait(650 + Math.random() * 700);
            }
        })();
        await UI.celebration();
        fireworks = false;
    }
    // Inspección final: la cajita del corazón debajo del mueble de la tele
    sfx('music', 'waltz');
    await UI.fade(true);
    app.glovebox.show();
    const gbCam = app.glovebox.camera(app.engine.camera.aspect);
    rig.fixed(gbCam.pos, gbCam.look, 2, { amount: 0.25, focus: 0.5, range: 0.45 });
    rig.snap();
    await UI.fade(false);
    const gb = UI.glovebox();
    await gb.opened;
    await app.glovebox.open(fx);
    sfx('bloom');
    gb.reveal();
    if (window.confetti) window.confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors: ['#ffd23f', '#ff5d8f', '#4cc9f0', '#ffffff'] });
    await gb.done;
    location.href = location.pathname;
}

// Ángulo de cámara para la pedida: el hueco entre columnas más cercano a la cámara actual
// (columnas cada 45°, farolas cada 60° + 0,3 rad: que ninguna se cruce delante)
function proposalAngle(center, camPos) {
    const cur = Math.atan2(camPos.z - center.z, camPos.x - center.x);
    const diff = (x, y) => Math.abs(Math.atan2(Math.sin(x - y), Math.cos(x - y)));
    let best = cur, bestD = Infinity;
    for (let k = 0; k < 8; k++) {
        const a = Math.PI / 8 + k * Math.PI / 4;
        let lamp = Infinity;
        for (let i = 0; i < 6; i++) lamp = Math.min(lamp, diff(a, i * Math.PI / 3 + 0.3));
        if (lamp < 0.22) continue;
        const d = diff(a, cur);
        if (d < bestD) { bestD = d; best = a; }
    }
    return best;
}

function celebrateConfetti() {
    if (!window.confetti) return;
    const heart = confetti.shapeFromPath({ path: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' });
    const colors = ['#ff4d8d', '#ff7eb3', '#ffd23f', '#ffffff'];
    const end = Date.now() + 4000;
    (function frame() {
        confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0, y: 0.8 }, colors, shapes: [heart, 'circle'] });
        confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1, y: 0.8 }, colors, shapes: [heart, 'circle'] });
        if (Date.now() < end) requestAnimationFrame(frame);
    })();
}

boot().catch(err => {
    console.error(err);
    document.getElementById('classic-link').hidden = false;
});
