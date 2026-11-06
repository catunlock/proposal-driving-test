// ============================================================================
//  MODO CONDUCCIÓN: arranque, menús (modo → garaje → circuito) y partidas
// ============================================================================
// Página aparte (drive.html) para que cargue rápido: solo el circuito elegido, no toda la isla.
// URL para pruebas: ?mode=time|race|versus|gymkhana|exam &map=desayuno &car=sport (salta los menús)
import * as THREE from 'three';
import { Engine } from '../engine.js';
import { onLoadProgress } from '../assets.js';
import { applyLook } from '../looks.js';
import { Controls } from './input.js';
import { HUD, fmt } from './hud.js';
import { CARS, TUNING, COLORS, carDef, buildCar, statsFor, loadConfig, saveConfig, defaultConfig } from './cars.js';
import { RaceSession } from './session.js';
import { loadGhost } from './ghost.js';
import { MAPS, mapById } from './maps/index.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const sfx = (n, ...a) => { if (window.sfx && window.sfx[n]) window.sfx[n](...a); };

const MODES = [
    { id: 'time', emoji: '⏱️', name: 'Contrarreloj', desc: 'Tú contra el reloj… y contra el fantasma de tu mejor vuelta.' },
    { id: 'race', emoji: '🏁', name: 'Carrera', desc: 'Tres vueltas contra tres rivales de la IA.' },
    { id: 'versus', emoji: '🎮', name: 'Pique a dos', desc: `Pantalla partida, a lo Micro Machines: si uno se escapa, punto para él. Gana quien llegue a 5.`, players: 2, tag: '2 jugadores' },
    { id: 'gymkhana', emoji: '🅿️', name: 'Gymkhana', desc: 'Slalom, aparcar en batería y en línea, marcha atrás y frenada de precisión.', special: 'gymkhana' },
    { id: 'exam', emoji: '👨‍🏫', name: 'Examen de circulación', desc: 'El examen práctico de la autoescuela con el coche que elijas.', special: 'exam' }
];

// ---------------------------------------------------------------- estado
const app = {};
const S = { mode: null, players: [loadConfig('p1'), loadConfig('p2')], editing: 0, map: null, session: null, screen: null };

function show(el) { el.hidden = false; requestAnimationFrame(() => el.classList.add('on')); }
function hide(el) { el.classList.remove('on'); setTimeout(() => { if (!el.classList.contains('on')) el.hidden = true; }, 300); }
function screen(id) {
    for (const s of document.querySelectorAll('.d-screen')) if (s.id !== id && !s.hidden) hide(s);
    S.screen = id ? $(id) : null;
    if (S.screen) { show(S.screen); nav.reset(); }
}
function loading(on, text) {
    const el = $('d-loading');
    if (text) $('d-loading-text').textContent = text;
    if (on) { el.hidden = false; el.classList.add('on'); } else hide(el);
}

// ---------------------------------------------------------------- navegación con mando
const nav = {
    i: -1,
    items() { return S.screen ? [...S.screen.querySelectorAll('.nav, .d-pick, .d-car, .d-colors button, .d-slider')].filter(e => e.offsetParent !== null && !e.disabled) : []; },
    reset() { this.cur && this.cur.classList.remove('focus'); this.cur = null; },
    focus(e) {
        if (this.cur) this.cur.classList.remove('focus');
        this.cur = e; e.classList.add('focus');
        e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const inp = e.querySelector && e.querySelector('input'); (inp || e).focus({ preventScroll: true });
    },
    move(dir) {
        const items = this.items();
        if (!items.length) return;
        if (!this.cur || !items.includes(this.cur)) { this.focus(items.find(e => e.matches('[data-primary], .on')) || items.find(e => e.matches('.d-pick')) || items[0]); return; }
        const r0 = this.cur.getBoundingClientRect(), c0 = [r0.left + r0.width / 2, r0.top + r0.height / 2];
        const D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
        let best = null, bs = Infinity;
        for (const e of items) {
            if (e === this.cur) continue;
            const r = e.getBoundingClientRect(), dx = r.left + r.width / 2 - c0[0], dy = r.top + r.height / 2 - c0[1];
            const along = dx * D[0] + dy * D[1];
            if (along <= 4) continue;
            const across = Math.abs(dx * D[1] - dy * D[0]);
            const sc = along + across * 2.2;
            if (sc < bs) { bs = sc; best = e; }
        }
        if (best) { this.focus(best); sfx('tap'); }
    },
    tick(dt) {
        if (!S.screen || S.screen.hidden) return;
        const m = app.controls.menu(dt);
        if (m.dir) {
            const cur = this.cur, inp = cur && cur.classList.contains('d-slider') && cur.querySelector('input');
            if (inp && (m.dir === 'left' || m.dir === 'right') && !inp.disabled) {
                const st = +inp.step || 0.05;
                inp.value = String(Math.min(+inp.max, Math.max(+inp.min, +inp.value + (m.dir === 'right' ? st : -st))));
                inp.dispatchEvent(new Event('input', { bubbles: true }));
            } else this.move(m.dir);
        }
        if (m.a && this.cur && !this.cur.classList.contains('d-slider')) this.cur.click();
        if (m.b) { const b = S.screen.querySelector('[data-back]'); if (b) b.click(); }
        if (m.start) { const p = S.screen.querySelector('[data-primary]'); if (p) p.click(); }
    }
};

// ---------------------------------------------------------------- garaje 3D
function buildGarage() {
    const G = new THREE.Group();
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#3a3050' : '#463a60'; g.fillRect(i * 8, j * 8, 8, 8); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10); t.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 48).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: t }));
    floor.receiveShadow = true; G.add(floor);
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.6, 0.4, 48), new THREE.MeshToonMaterial({ color: '#5b4f7a' }));
    pod.position.y = 0.2; pod.receiveShadow = true; G.add(pod);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(3.5, 0.08, 8, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff4d8d' }));
    rim.position.y = 0.4; G.add(rim);
    const hemi = new THREE.HemisphereLight('#fff4f8', '#3a3050', 1.4);
    const key = new THREE.DirectionalLight('#ffffff', 2.4); key.position.set(6, 10, 7); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
    const back = new THREE.DirectionalLight('#7ad7ff', 1.2); back.position.set(-6, 4, -8);
    G.add(hemi, key, back);
    const turn = new THREE.Group(); turn.position.y = 0.4; G.add(turn);
    G.userData = { turn };
    return G;
}
let garageToken = 0;
async function garageCar(cfg) {
    const tk = ++garageToken;
    const m = await buildCar(cfg);
    if (tk !== garageToken) return;
    const turn = app.garage.userData.turn;
    turn.clear();
    turn.add(m.group);
    app.garageDims = m.dims;
    renderStats(cfg, m.dims);
}
function garageCamera(dt) {
    const d = app.garageDims || { len: 2.6, height: 1.4 };
    const k = Math.max(1, d.len / 2.6);
    const cam = app.engine.camera;
    // el coche queda entre la lista (izquierda) y el panel (derecha)
    cam.position.set(3.4 * k, 1.5 + d.height * 0.55, 4.3 * k);
    cam.lookAt(0.75 * k, 0.55 + d.height * 0.3, 0);
    cam.fov = 40; cam.updateProjectionMatrix();
    app.garage.userData.turn.rotation.y += dt * 0.4;
}
function enterGarage() {
    const E = app.engine;
    E.scene.background = new THREE.Color('#2b2140');
    E.scene.fog = new THREE.Fog('#2b2140', 18, 60);
    app.garage.visible = true;
    E.setTiltShift(0);
}

// ---------------------------------------------------------------- pantallas
function homeScreen() {
    const box = $('m-modes'); box.innerHTML = '';
    for (const M of MODES) {
        const b = document.createElement('button');
        b.className = 'd-pick';
        b.innerHTML = `<span class="em">${M.emoji}</span>${M.tag ? `<span class="tag">${M.tag}</span>` : ''}<h3>${M.name}</h3><p>${M.desc}</p>`;
        b.onclick = () => { sfx('click'); S.mode = M; S.editing = 0; garageScreen(); };
        box.append(b);
    }
    const pads = app.controls.pads().length;
    $('m-pad-hint').textContent = pads ? `🎮 ${pads} mando${pads > 1 ? 's' : ''} conectado${pads > 1 ? 's' : ''} · cruceta para moverte, A para elegir, B para volver` : '🎮 ¿Mando? Conéctalo y pulsa cualquier botón · ⌨️ también se juega con el teclado';
    enterGarage();
    screen('m-home');
}

function garageScreen() {
    const i = S.editing, cfg = S.players[i];
    const two = S.mode && S.mode.players === 2;
    $('g-title').textContent = two ? `Garaje · Jugador ${i + 1}` : 'Garaje';
    const list = $('g-cars'); list.innerHTML = '';
    for (const c of CARS) {
        const b = document.createElement('button');
        b.className = 'd-car' + (c.id === cfg.id ? ' on' : '');
        b.innerHTML = `<i style="background:${c.id === cfg.id ? cfg.color : c.color}"></i>${c.name}`;
        b.onclick = () => { sfx('click'); S.players[i] = { ...defaultConfig(c.id), tune: { ...cfg.tune } }; if (c.fixed) { S.players[i].tune.wheels = 1; S.players[i].tune.lift = 0; } garageScreen(); };
        list.append(b);
    }
    const def = carDef(cfg.id);
    $('g-name').textContent = def.name;
    $('g-desc').textContent = def.desc + (def.fixed ? ' (De una pieza: solo se estira y se pinta.)' : '');
    const tune = $('g-tune'); tune.innerHTML = '';
    for (const [k, T] of Object.entries(TUNING)) {
        const off = def.fixed && (k === 'wheels' || k === 'lift');
        const row = document.createElement('div');
        row.className = 'd-slider' + (off ? ' off' : '');
        row.innerHTML = `<label>${T.label}</label><span>${T.icon}</span><input type="range" min="${T.min}" max="${T.max}" step="${T.step}" value="${cfg.tune[k]}" ${off ? 'disabled' : ''}><output>${fmtTune(k, cfg.tune[k])}</output>`;
        const inp = row.querySelector('input');
        inp.oninput = () => { cfg.tune[k] = +inp.value; row.querySelector('output').textContent = fmtTune(k, cfg.tune[k]); garageCarSoon(cfg); };
        tune.append(row);
    }
    const cols = $('g-colors'); cols.innerHTML = '';
    if (def.noPaint) cols.innerHTML = '<p class="d-desc">🚓 Librea oficial: no se puede pintar.</p>';
    else for (const c of COLORS) {
        const b = document.createElement('button');
        b.style.background = c; b.title = c;
        if (c === cfg.color) b.className = 'on';
        b.onclick = () => { cfg.color = c; cols.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); list.querySelector('.d-car.on i').style.background = c; garageCarSoon(cfg); };
        cols.append(b);
    }
    $('g-reset').onclick = () => { S.players[i] = defaultConfig(cfg.id); garageScreen(); };
    $('g-back').onclick = () => { sfx('click'); if (i > 0) { S.editing = 0; garageScreen(); } else homeScreen(); };
    $('g-ok').onclick = () => {
        sfx('click');
        saveConfig(S.players[i], i ? 'p2' : 'p1');
        if (two && i === 0) { S.editing = 1; return garageScreen(); }
        if (S.mode.special) return play(S.mode.special);
        mapsScreen();
    };
    enterGarage();
    garageCar(cfg);
    if (S.screen !== $('m-garage')) screen('m-garage');
}
let gTimer = 0;
function garageCarSoon(cfg) { clearTimeout(gTimer); gTimer = setTimeout(() => garageCar(cfg), 80); }
function fmtTune(k, v) { return k === 'lift' ? `${Math.round(v * 100)}%` : `×${(+v).toFixed(2)}`; }
function renderStats(cfg, dims) {
    const st = statsFor(cfg, dims);
    $('g-stats').innerHTML = Object.entries(st).map(([k, x]) => `<div class="d-stat"><span>${k}</span><div><i style="width:${Math.round(x * 100)}%"></i></div></div>`).join('');
}

function mapsScreen() {
    const box = $('m-maplist'); box.innerHTML = '';
    $('m-maps-sub').textContent = `${S.mode.emoji} ${S.mode.name}`;
    for (const M of MAPS) {
        const g = loadGhost(M.id);
        const b = document.createElement('button');
        b.className = 'd-pick';
        b.innerHTML = `<span class="em">${M.emoji}</span><h3>${M.name}</h3><p>${M.desc}</p>${g ? `<span class="rec">🏆 Récord: ${fmt(g.time)}</span>` : ''}`;
        b.onclick = () => { sfx('click'); S.map = M; play(); };
        box.append(b);
    }
    $('m-maps-back').onclick = () => { sfx('click'); S.editing = S.mode.players === 2 ? 1 : 0; garageScreen(); };
    screen('m-maps');
}

// ---------------------------------------------------------------- partidas
async function play(special = null) {
    screen(null);
    loading(true, special === 'exam' ? 'Preparando el examen…' : special === 'gymkhana' ? 'Colocando los conos…' : `Montando «${S.map.name}»…`);
    if (S.session) { S.session.dispose(); S.session = null; }
    app.garage.visible = false;
    let session;
    if (special === 'gymkhana') { const { GymkhanaSession } = await import('./gymkhana.js'); session = new GymkhanaSession(app, { players: S.players }); }
    else if (special === 'exam') { const { ExamSession } = await import('./exam-mode.js'); session = new ExamSession(app, { players: S.players }); }
    else session = new RaceSession(app, { map: S.map, mode: S.mode.id, players: S.players, autopilot: params.has('autopilot'), laps: params.get('laps') ? +params.get('laps') : undefined });
    S.session = session;
    try { await session.load(); }
    catch (e) { console.error(e); loading(false); homeScreen(); return; }
    app.engine.setTiltShift(0.5, 0.52, 0.42);
    loading(false);
    session.onPause = () => pauseScreen();
    const res = await session.run();
    if (S.session !== session) return;          // se salió desde la pausa
    resultsScreen(res);
}

function pauseScreen() {
    const s = S.session;
    if (!s) return;
    s.pause(true);
    $('p-resume').onclick = () => { screen(null); s.pause(false); };
    $('p-restart').onclick = () => { screen(null); replay(); };
    $('p-garage').onclick = () => { quit(); S.editing = 0; garageScreen(); };
    $('p-menu').onclick = () => { quit(); homeScreen(); };
    screen('m-pause');
}
function quit() { if (S.session) { S.session.dispose(); S.session = null; } sfx('music', null); }
function replay() { const sp = S.mode.special || null; quit(); play(sp); }

function resultsScreen(r) {
    const body = $('r-body');
    let title = '¡Meta! 🏁', html = '';
    if (r.mode === 'time') {
        title = r.newRecord ? '¡Nuevo récord! 🏆' : 'Contrarreloj ⏱️';
        html = `<table>${r.laps.map((t, i) => `<tr class="${t === r.best ? 'me' : ''}"><td>Vuelta ${i + 1}</td><td class="t">${fmt(t)}</td></tr>`).join('')}
            <tr><td><b>Mejor vuelta</b></td><td class="t">${fmt(r.best)}</td></tr>
            <tr><td><b>Récord del circuito</b></td><td class="t">${fmt(r.record)}</td></tr></table>
            <p>El fantasma de tu récord te esperará en la próxima. 👻</p>`;
    } else if (r.mode === 'race') {
        const me = r.places.findIndex(p => p.player);
        title = me === 0 ? '¡Has ganado! 🥇' : me === 1 ? '¡Segunda! 🥈' : me === 2 ? '¡Podio! 🥉' : '¡A la próxima! 🏁';
        html = `<table>${r.places.map((p, i) => `<tr class="${p.player ? 'me' : ''}"><td>${['🥇', '🥈', '🥉', '4º'][i]}</td><td><i style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${p.color};border:2px solid #1b1b2f"></i> ${p.name}</td><td class="t">${p.time ? fmt(p.time) : '—'}</td></tr>`).join('')}</table>`;
    } else if (r.mode === 'versus') {
        title = `¡Gana el Jugador ${r.winner + 1}! 🏆`;
        html = `<p class="big">${r.points[0]} – ${r.points[1]}</p><p>¿La revancha?</p>`;
    } else if (r.html) { title = r.title; html = r.html; }
    $('r-title').textContent = title;
    body.innerHTML = html;
    $('r-again').onclick = () => { screen(null); replay(); };
    $('r-maps').hidden = !!S.mode.special;
    $('r-maps').onclick = () => { quit(); mapsScreen(); };
    $('r-menu').onclick = () => { quit(); homeScreen(); };
    screen('m-results');
}

// ---------------------------------------------------------------- arranque
async function boot() {
    // los letreros se pintan en canvas: hace falta que las fuentes estén cargadas
    try { await Promise.all(['400 64px Bangers', '700 64px Fredoka'].map(f => document.fonts.load(f))); } catch (e) { /* sin fuentes */ }
    const E = app.engine = new Engine($('scene'));
    window.__drive = { app, S };
    app.controls = new Controls();
    app.controls.capture = true;
    app.hud = new HUD($('d-hud'));
    applyLook({ engine: E, world: { nightness: 0, spaceK: 0 } }, params.get('look') || 'cartoon');
    onLoadProgress((d, t) => { $('d-loading-bar').style.width = (t ? Math.round(d / t * 100) : 0) + '%'; });
    app.garage = buildGarage();
    E.scene.add(app.garage);
    E.onUpdate(dt => { if (app.garage.visible) garageCamera(dt); nav.tick(dt); });
    E.start();
    // sonido
    const mute = $('sfx-toggle');
    const icon = () => { mute.textContent = window.sfx && window.sfx.isMuted() ? '🔇' : '🔊'; };
    mute.onclick = () => { if (window.sfx) window.sfx.setMuted(!window.sfx.isMuted()); icon(); };
    icon();
    addEventListener('gamepadconnected', () => { if (S.screen === $('m-home')) homeScreen(); });
    // atajos de prueba
    const mode = MODES.find(m => m.id === params.get('mode'));
    if (params.get('car')) S.players[0] = defaultConfig(params.get('car'));
    if (mode) {
        S.mode = mode;
        S.map = mapById(params.get('map')) || MAPS[0];
        await garageCar(S.players[0]);
        play(mode.special || null);
        return;
    }
    await garageCar(S.players[0]);
    loading(false);
    if (params.get('garage')) { S.mode = MODES[0]; garageScreen(); } else homeScreen();
}
boot();
