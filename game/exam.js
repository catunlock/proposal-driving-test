// ============================================================================
//  EXAMEN DE CIRCULACIÓN (final de la Parte 2 · conducción libre con mando)
// ============================================================================
// Un barrio propio, lejos del recorrido (la niebla lo aísla), donde ella conduce el
// Tesla con el mando como en un simulador de autoescuela. El examinador va dando
// indicaciones y cuenta faltas, como en el práctico de la DGT:
//   1. STOP (parar del todo antes de la línea) y giro a la izquierda
//   2. Zona 30 y paso de peatones (ceder el paso)
//   3. Rotonda: tercera salida, con intermitente para salir
//   4. Semáforo en rojo y giros a la derecha
//   5. Aparcar en la plaza del corazón, entre dos coches
// Las faltas "graves" no suspenden: se repite esa prueba (hoy no suspende nadie 😉).
//
// Controles · mando: RT acelera · LT frena / marcha atrás · stick izquierdo gira ·
//   LB / RB intermitentes · Y vuelve a la ruta · A confirma.
// Teclado: ↑/W · ↓/S · ←→ / A D · Q / E intermitentes · R vuelve · Enter confirma.
// Salida de emergencia: Ctrl+Mayús+X, o mantener Select + Start del mando 2 s.
//
// La ruta, las pruebas y los textos están en ROUTE / buildTests(); el barrio en build().
// ============================================================================
import * as THREE from 'three';
import { CONFIG, URLP } from './config.js';
import { toon, model, textPlane, textTexture, heartGeometry } from './assets.js';
import { building } from './buildings.js';
import { mergeStatic } from './dioramas.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { UI } from './ui.js';

const O = new THREE.Vector3(6000, 0, 6000);   // origen del barrio (lejos de todo)
const Y = 0.3;            // altura del asfalto
const CURB = 0.16;        // altura de la acera
const HW = 3.5;           // media calzada (dos carriles de 3,5)
const LANE = 1.75;        // centro del carril derecho
const STREETS = [-40, 0, 40];
const EDGE = 40 + HW;     // fin de las calles exteriores
const RING = { r0: 4.5, r1: 11.5, lane: 8 };  // rotonda en (0, 0)
const KMH = 6.5;          // unidades/s → km/h (el Tesla de 2,6 u ≈ 4,7 m)
const PHYS = { maxV: 11, maxRev: 3.2, accel: 6.2, brake: 11, drag: 0.32, roll: 0.7, steerMax: 0.7, wheelbase: 1.65 };
const CAR_PTS = [[0.52, 1.22], [-0.52, 1.22], [0.52, -1.22], [-0.52, -1.22], [0.55, 0], [-0.55, 0]];
const PARK = { x: -16, z: -37.25, len: 5.2, wid: 1.6 };      // 1ª plaza (corazón): amplia
const PARK2 = { x: 18, z: -42.8, len: 4.8, wid: 1.3 };       // plaza final (💍): más estrecha, él espera al lado

const sfx = (name, ...a) => { if (window.sfx && window.sfx[name]) window.sfx[name](...a); };
const $ = id => document.getElementById(id);
const deg = d => d * Math.PI / 180;

// --- ¿Se puede pisar este punto? (calzada, sin aceras ni isleta) -------------------
function onRoad(x, z) {
    const r = Math.hypot(x, z);
    if (r < RING.r0 + 0.15) return false;
    if (r <= RING.r1) return true;
    if (Math.abs(x) > EDGE || Math.abs(z) > EDGE) return false;
    for (const s of STREETS) if (Math.abs(x - s) < HW || Math.abs(z - s) < HW) return true;
    return false;
}

// ============================================================================
//  RUTA (línea por el centro del carril derecho)
// ============================================================================
function buildRoute() {
    const pts = [];
    const push = (x, z) => { const l = pts[pts.length - 1]; if (!l || Math.hypot(l.x - x, l.z - z) > 0.3) pts.push({ x, z }); };
    const line = (x0, z0, x1, z1) => { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 2)); for (let i = 0; i <= n; i++) push(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n); };
    const arc = (cx, cz, r, a0, a1) => { const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / deg(8))); for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; push(cx + r * Math.cos(a), cz + r * Math.sin(a)); } };
    const quad = (x0, z0, cx, cz, x1, z1) => { for (let i = 0; i <= 10; i++) { const t = i / 10, u = 1 - t; push(u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * z0 + 2 * u * t * cz + t * t * z1); } };
    const ring = a => ({ x: RING.lane * Math.cos(a), z: RING.lane * Math.sin(a) });

    line(-33, 40 + LANE, -4, 40 + LANE);                         // calle de la autoescuela, hacia el STOP
    arc(-4, 36, 5.75, deg(90), deg(0));                          // giro a la izquierda
    line(LANE, 36, LANE, 14);                                    // zona 30 y paso de peatones
    const inA = ring(deg(70)), outA = ring(deg(-150));
    quad(LANE, 14, LANE, 7.88, inA.x, inA.z);                    // entrada a la rotonda
    arc(0, 0, RING.lane, deg(70), deg(-150));                    // tres cuartos de vuelta
    quad(outA.x, outA.z, -8.23, -LANE, -13, -LANE);              // tercera salida
    line(-13, -LANE, -35.5, -LANE);                              // hacia el semáforo
    arc(-35.5, -4.5, 2.75, deg(90), deg(180));                   // derecha
    line(-40 + LANE, -4.5, -40 + LANE, -35.5);
    arc(-35.5, -35.5, 2.75, deg(180), deg(270));                 // derecha
    line(-35.5, -38.25, -31, -38.9);
    line(-31, -38.9, -21, -38.9);
    line(-21, -38.9, PARK.x, PARK.z);                            // la plaza del corazón (1ª)
    // --- Segunda vuelta, más difícil -------------------------------------------------
    line(PARK.x, PARK.z, -11, -38.9);                            // salir de la plaza
    line(-11, -38.9, -4.5, -38.9);
    arc(-4.5, -36.15, 2.75, deg(-90), deg(0));                   // derecha, hacia la rotonda por el norte
    line(-LANE, -36.15, -LANE, -14);
    const in2 = ring(deg(-110)), out2 = ring(deg(-250));
    quad(-LANE, -14, -LANE, -7.88, in2.x, in2.z);
    arc(0, 0, RING.lane, deg(-110), deg(-250));                  // segunda salida
    quad(out2.x, out2.z, -LANE, 7.88, -LANE, 13);
    line(-LANE, 13, -LANE, 36.2);                                // zona 30 y paso de cebra al revés, hasta el 2º STOP
    arc(3.8, 36.2, 5.55, deg(180), deg(90));                     // izquierda
    line(3.8, 40 + LANE, 36.5, 40 + LANE);
    arc(36.5, 36.5, 5.25, deg(90), deg(0));                      // izquierda
    line(40 + LANE, 36.5, 40 + LANE, -36.5);                     // 2º semáforo (más rápido)
    arc(36.5, -36.5, 5.25, deg(0), deg(-90));                    // izquierda
    line(36.5, -40 - LANE, 30, -41.2);
    line(30, -41.2, 23.5, -41.2);
    line(23.5, -41.2, 20, -42.3);                                // entrar en diagonal pasado el taxi…
    line(20, -42.3, PARK2.x, PARK2.z);                           // …y enderezar: plaza final 💍

    const d = [0];
    for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const R = { pts, d, len: d[d.length - 1] };

    // Punto y tangente a una distancia de la ruta
    R.at = (dist) => {
        dist = THREE.MathUtils.clamp(dist, 0, R.len);
        let i = 1;
        while (i < d.length - 1 && d[i] < dist) i++;
        const a = pts[i - 1], b = pts[i], k = (dist - d[i - 1]) / Math.max(1e-6, d[i] - d[i - 1]);
        const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, tx: (b.x - a.x) / L, tz: (b.z - a.z) / L };
    };
    // Proyección de un punto sobre la ruta (buscando cerca del progreso actual)
    R.project = (x, z, hint = 0) => {
        let best = null;
        let i0 = 0;
        while (i0 < d.length - 1 && d[i0 + 1] < hint - 30) i0++;
        for (let i = i0; i < pts.length - 1 && d[i] < hint + 45; i++) {
            const a = pts[i], b = pts[i + 1];
            const vx = b.x - a.x, vz = b.z - a.z, L2 = vx * vx + vz * vz || 1e-6;
            const t = THREE.MathUtils.clamp(((x - a.x) * vx + (z - a.z) * vz) / L2, 0, 1);
            const px = a.x + vx * t, pz = a.z + vz * t, dist = Math.hypot(x - px, z - pz);
            if (!best || dist < best.dist) {
                const L = Math.sqrt(L2), tx = vx / L, tz = vz / L;
                best = { along: d[i] + t * L, dist, tx, tz, off: (x - px) * -tz + (z - pz) * tx };
            }
        }
        return best;
    };
    return R;
}

// ============================================================================
//  ENTRADA: mando (Gamepad API, mapeo estándar) + teclado
// ============================================================================
class Input {
    constructor() {
        this.keys = new Set();
        this.taps = new Set();       // pulsaciones muy cortas (bajan y suben entre dos fotogramas)
        this.prev = {};
        this.pad = null;
        this.onKey = e => {
            if (!this.active) return;
            const k = e.key.toLowerCase();
            if (e.type === 'keydown') { this.keys.add(k); this.taps.add(k); } else this.keys.delete(k);
            if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
            if (e.type === 'keydown' && e.ctrlKey && e.shiftKey && k === 'x') this.skip = true;
        };
        window.addEventListener('keydown', this.onKey);
        window.addEventListener('keyup', this.onKey);
        window.addEventListener('blur', () => this.keys.clear());
    }
    poll(dt) {
        const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
        const gp = pads.find(p => p.mapping === 'standard' && p.connected) || pads.find(p => p.connected) || null;
        this.pad = gp;
        const B = i => (gp && gp.buttons[i] ? gp.buttons[i].value : 0);
        const k = n => this.keys.has(n) || this.taps.has(n);
        const dz = (v, t = 0.14) => Math.abs(v) < t ? 0 : (v - Math.sign(v) * t) / (1 - t);
        const s = {
            thr: Math.max(B(7), k('arrowup') || k('w') ? 1 : 0),
            brk: Math.max(B(6), k('arrowdown') || k('s') ? 1 : 0),
            steer: THREE.MathUtils.clamp(dz(gp ? gp.axes[0] || 0 : 0) + (B(15) - B(14)) + ((k('arrowright') || k('d') ? 1 : 0) - (k('arrowleft') || k('a') ? 1 : 0)), -1, 1),
            left: B(4) > 0.5 || k('q'),
            right: B(5) > 0.5 || k('e'),
            a: B(0) > 0.5 || k('enter'),
            y: B(3) > 0.5 || k('r'),
            horn: B(1) > 0.5 || k(' ') || k('h'),
            panic: B(8) > 0.5 && B(9) > 0.5
        };
        // Pulsaciones (flanco de subida)
        this.taps.clear();
        s.pressed = {};
        for (const n of ['left', 'right', 'a', 'y', 'horn']) { s.pressed[n] = s[n] && !this.prev[n]; this.prev[n] = s[n]; }
        this.panicT = s.panic ? (this.panicT || 0) + dt : 0;
        if (this.panicT > 2) this.skip = true;
        this.state = s;
        return s;
    }
    rumble(strong = 0.6, ms = 180) {
        const a = this.pad && this.pad.vibrationActuator;
        if (a && a.playEffect) a.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: strong * 0.6 }).catch(() => {});
    }
    // Fuera de la conducción: A (o Enter) pulsa el botón de la tarjeta que haya en pantalla
    padUI(engine) {
        this.active = true;
        return engine.onUpdate(dt => {
            const s = this.poll(dt);
            if (s.pressed.a) this.clickVisible();
            if (s.pressed.y) this.clickVisible(['sr-btn2']);      // Y: repetir el examen
        });
    }
    // A en el mando pulsa el botón visible de la tarjeta que haya en pantalla
    clickVisible(ids = ['ch-btn', 'sr-btn', 'prompt-btn']) {
        for (const id of ids) {
            const b = $(id);
            if (b && !b.hidden && b.offsetParent !== null && b.closest('[hidden]') === null) { b.click(); return true; }
        }
        return false;
    }
}

// ============================================================================
//  EL BARRIO
// ============================================================================
const MAT = {};
const mat = (c, o) => { const k = c + JSON.stringify(o || {}); return MAT[k] || (MAT[k] = toon(c, o)); };

// Acera de una manzana (con la esquina recortada en curva si toca la rotonda)
function blockShape(x0, z0, x1, z1) {
    const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    const sh = new THREE.Shape();
    const pts = [];
    for (let i = 0; i < 4; i++) {
        const [cx, cz] = corners[i];
        if (Math.hypot(cx, cz) >= RING.r1) { pts.push([cx, cz]); continue; }
        const prev = corners[(i + 3) % 4], next = corners[(i + 1) % 4];
        // corte con la circunferencia de la rotonda a lo largo de cada arista
        const cut = (from) => from[1] === cz
            ? [Math.sign(from[0] - cx) * Math.sqrt(RING.r1 ** 2 - cz * cz), cz]
            : [cx, Math.sign(from[1] - cz) * Math.sqrt(RING.r1 ** 2 - cx * cx)];
        const p1 = cut(prev), p2 = cut(next);
        let a1 = Math.atan2(p1[1], p1[0]), a2 = Math.atan2(p2[1], p2[0]);
        let da = a2 - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        for (let k = 0; k <= 10; k++) { const a = a1 + da * k / 10; pts.push([RING.r1 * Math.cos(a), RING.r1 * Math.sin(a)]); }
    }
    pts.forEach(([x, z], i) => (i ? sh.lineTo(x, z) : sh.moveTo(x, z)));
    sh.closePath();
    return sh;
}
function slab(shape, h, color) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 4 });
    g.rotateX(Math.PI / 2);
    g.translate(0, Y + h, 0);
    const m = new THREE.Mesh(g, mat(color));
    m.receiveShadow = true;
    return m;
}
function flat(w, d, color, x, z, { y = 0.012, rot = 0, basic = false } = {}) {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    if (rot) g.rotateY(rot);
    g.translate(x, Y + y, z);
    g.userData.color = color; g.userData.basic = basic;
    return g;
}
// Señal redonda o cuadrada pintada en canvas
function roadSign(draw, size = 1.0, pole = 2.4) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    draw(c.getContext('2d'));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, pole, 8), mat('#9aa3b5'));
    p.position.y = pole / 2; g.add(p);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide }));
    s.position.y = pole + size / 2 - 0.1; s.position.z = 0.06; g.add(s);
    return g;
}
const speedSign = n => roadSign(g => {
    g.fillStyle = '#e8173b'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 46, 0, 7); g.fill();
    g.fillStyle = '#1b1b2f'; g.font = '700 56px Fredoka, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n, 64, 68);
});
const blueSign = (txt, round = false) => roadSign(g => {
    g.fillStyle = '#ffffff';
    if (round) { g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); g.fillStyle = '#1d5bbf'; g.beginPath(); g.arc(64, 64, 56, 0, 7); g.fill(); }
    else { g.fillRect(0, 0, 128, 128); g.fillStyle = '#1d5bbf'; g.fillRect(6, 6, 116, 116); }
    g.fillStyle = '#fff'; g.font = '700 64px Fredoka, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 64, 70);
});
const stopSign = () => roadSign(g => {
    g.fillStyle = '#ffffff'; g.beginPath();
    for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; g.lineTo(64 + 63 * Math.cos(a), 64 + 63 * Math.sin(a)); }
    g.fill(); g.fillStyle = '#d0102e'; g.beginPath();
    for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; g.lineTo(64 + 57 * Math.cos(a), 64 + 57 * Math.sin(a)); }
    g.fill(); g.fillStyle = '#fff'; g.font = '700 40px Fredoka, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('STOP', 64, 66);
}, 1.1);

async function sized(key, length) {
    const m = await model(key);
    const b = new THREE.Box3().setFromObject(m), s = b.getSize(new THREE.Vector3());
    m.scale.multiplyScalar(length / Math.max(s.x, s.z));
    const b2 = new THREE.Box3().setFromObject(m);
    m.position.y -= b2.min.y;
    const g = new THREE.Group(); g.add(m);
    return g;
}

// Semáforo con tres luces que se pueden encender
function trafficLight() {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 3.1, 10), mat('#3a3f52'));
    pole.position.y = 1.55; g.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.35, 0.42), mat('#24273a'));
    head.position.set(0, 3.55, 0); g.add(head);
    const lamps = {};
    [['red', '#ff2a3c', 3.98], ['amber', '#ffb703', 3.55], ['green', '#2ee87a', 3.12]].forEach(([n, c, y]) => {
        const m = new THREE.MeshToonMaterial({ color: '#2c2f40', emissive: new THREE.Color(c), emissiveIntensity: 0 });
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), m);
        l.scale.z = 0.5; l.position.set(0, y, 0.22); g.add(l);
        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.2), mat('#1b1b2f'));
        visor.position.set(0, y + 0.19, 0.3); g.add(visor);
        lamps[n] = { m, c: new THREE.Color(c) };
    });
    g.userData.set = (state) => {
        for (const [n, l] of Object.entries(lamps)) {
            const on = n === state;
            l.m.emissiveIntensity = on ? 1.6 : 0;
            l.m.color.set(on ? l.c : '#2c2f40');
        }
    };
    g.userData.set('green');
    return g;
}

// Flechas amarillas de guía (como en los simuladores de autoescuela)
function chevronGeometry() {
    const s = new THREE.Shape();
    s.moveTo(0, 0.55); s.lineTo(0.62, -0.1); s.lineTo(0.38, -0.32); s.lineTo(0, 0.08); s.lineTo(-0.38, -0.32); s.lineTo(-0.62, -0.1); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: false });
    g.rotateX(Math.PI / 2);
    return g;
}

async function build(app) {
    const root = new THREE.Group();
    root.name = 'exam-district';
    root.position.copy(O);
    const stat = new THREE.Group();
    const lines = [], pinks = [];

    // Suelo de asfalto (tapa el mar dentro de la niebla)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), mat('#4d5266'));
    ground.position.y = Y; ground.receiveShadow = true;
    root.add(ground);

    // Aceras: 4 manzanas interiores y el anillo exterior
    const SIDE = '#d9cfbf';
    for (const [x0, x1] of [[-40, 0], [0, 40]]) for (const [z0, z1] of [[-40, 0], [0, 40]]) {
        stat.add(slab(blockShape(x0 + HW, z0 + HW, x1 - HW, z1 - HW), CURB, SIDE));
    }
    const outer = new THREE.Shape();
    outer.moveTo(-260, -260); outer.lineTo(260, -260); outer.lineTo(260, 260); outer.lineTo(-260, 260); outer.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-EDGE, -EDGE); hole.lineTo(-EDGE, EDGE); hole.lineTo(EDGE, EDGE); hole.lineTo(EDGE, -EDGE); hole.closePath();
    outer.holes.push(hole);
    stat.add(slab(outer, CURB, SIDE));

    // Isleta de la rotonda con un corazón gigante
    const island = new THREE.Mesh(new THREE.CylinderGeometry(RING.r0, RING.r0 + 0.1, 0.36, 48), mat('#6fbf5c'));
    island.position.y = Y + 0.18; stat.add(island);
    const kerb = new THREE.Mesh(new THREE.TorusGeometry(RING.r0, 0.12, 6, 48), mat('#efe3c4'));
    kerb.rotation.x = Math.PI / 2; kerb.position.y = Y + 0.3; stat.add(kerb);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 1.1, 20), mat('#efe3c4'));
    ped.position.y = Y + 0.9; stat.add(ped);
    const heart = new THREE.Mesh(heartGeometry(), toon('#ff4d8d', { emissive: new THREE.Color('#ff4d8d'), emissiveIntensity: 0.4 }));
    heart.scale.setScalar(1.6);
    const hg = new THREE.Group(); hg.add(heart); hg.position.y = Y + 3.2; root.add(hg);
    const ini = textPlane(CONFIG.coupleInitials, 1.8, { width: 512, height: 160, bg: '#ffffff', fg: '#ff4d8d', borderColor: '#1b1b2f' });
    const ini2 = ini.clone(); ini.position.set(0, Y + 0.95, 1.12); ini2.position.set(0, Y + 0.95, -1.12); ini2.rotation.y = Math.PI;
    root.add(ini, ini2);
    for (let i = 0; i < 14; i++) {
        const a = i / 14 * Math.PI * 2, f = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat(['#ff7eb3', '#ffd23f', '#ffffff', '#ff4d8d'][i % 4]));
        f.position.set(Math.cos(a) * 3.3, Y + 0.45, Math.sin(a) * 3.3); stat.add(f);
    }

    // Marcas viales
    for (const s of STREETS) {
        for (let u = -EDGE; u < EDGE; u += 3.2) {
            const c = u + 0.8;
            const nearX = STREETS.some(t => Math.abs(c - t) < HW + 1.2);
            if (!nearX) {
                if (Math.hypot(s, c) > RING.r1 + 1) lines.push(flat(0.16, 1.6, '#ffffff', s, c));
                if (Math.hypot(c, s) > RING.r1 + 1) lines.push(flat(1.6, 0.16, '#ffffff', c, s));
            }
        }
    }
    // línea de STOP, letras y línea del semáforo
    lines.push(flat(0.5, HW, '#ffffff', -4.3, 40 + HW / 2));
    const stopTxt = textPlane('STOP', 3.0, { width: 512, height: 160, bg: null, fg: '#ffffff' });
    stopTxt.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); stopTxt.position.set(-7.4, Y + 0.015, 40 + LANE); root.add(stopTxt);
    lines.push(flat(0.5, HW, '#ffffff', -35.3, -HW / 2));
    // 2º STOP (llegando al cruce desde el norte) y ceda el paso de la entrada norte de la rotonda
    lines.push(flat(HW, 0.5, '#ffffff', -HW / 2, 36.45));
    const stopTxt2 = textPlane('STOP', 3.0, { width: 512, height: 160, bg: null, fg: '#ffffff' });
    stopTxt2.rotation.set(-Math.PI / 2, 0, Math.PI); stopTxt2.position.set(-LANE, Y + 0.015, 33.3); root.add(stopTxt2);
    for (let x = -0.3; x > -HW; x -= 0.7) lines.push(flat(0.35, 0.18, '#ffffff', x, -RING.r1 - 0.6));
    const z30b = textPlane('30', 2.0, { width: 256, height: 256, bg: null, fg: '#ffffff' });
    z30b.rotation.set(-Math.PI / 2, 0, Math.PI); z30b.position.set(-LANE, Y + 0.015, 16.5); root.add(z30b);
    lines.push(flat(HW, 0.5, '#ffffff', 40 + HW / 2, 4.3));    // línea del 2º semáforo
    // paso de cebra (marcas)
    for (let x = -3.1; x <= 3.11; x += 0.9) lines.push(flat(0.5, 2.8, '#ffffff', x, 24));
    const z30 = textPlane('30', 2.0, { width: 256, height: 256, bg: null, fg: '#ffffff' });
    z30.rotation.set(-Math.PI / 2, 0, 0); z30.position.set(LANE, Y + 0.015, 31); root.add(z30);
    // ceda el paso al entrar en la rotonda
    for (let x = 0.3; x < HW; x += 0.7) lines.push(flat(0.35, 0.18, '#ffffff', x, RING.r1 + 0.6));
    // plaza del corazón
    const P = PARK;
    pinks.push(flat(P.len, 0.12, '#ff4d8d', P.x, P.z - P.wid / 2), flat(P.len, 0.12, '#ff4d8d', P.x, P.z + P.wid / 2));
    pinks.push(flat(0.12, P.wid, '#ff4d8d', P.x - P.len / 2, P.z), flat(0.12, P.wid, '#ff4d8d', P.x + P.len / 2, P.z));
    const P2 = PARK2;
    pinks.push(flat(P2.len, 0.12, '#ff4d8d', P2.x, P2.z - P2.wid / 2), flat(P2.len, 0.12, '#ff4d8d', P2.x, P2.z + P2.wid / 2));
    pinks.push(flat(0.12, P2.wid, '#ff4d8d', P2.x - P2.len / 2, P2.z), flat(0.12, P2.wid, '#ff4d8d', P2.x + P2.len / 2, P2.z));
    const paint = (list, color) => {
        const m = new THREE.Mesh(mergeGeometries(list, false), new THREE.MeshToonMaterial({ color, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        m.receiveShadow = true; root.add(m);
    };
    paint(lines, '#f4f1e8'); paint(pinks, '#ff4d8d');
    const spotHeart = new THREE.Mesh(heartGeometry(), new THREE.MeshBasicMaterial({ color: '#ff7eb3', transparent: true, opacity: 0.85 }));
    spotHeart.scale.set(0.55, 0.55, 0.05); spotHeart.rotation.x = -Math.PI / 2; spotHeart.position.set(P.x, Y + 0.02, P.z); root.add(spotHeart);
    const ringTxt = textPlane('💍', 1.2, { width: 256, height: 256, bg: null, fg: '#ff4d8d' });
    ringTxt.rotation.set(-Math.PI / 2, 0, 0); ringTxt.position.set(P2.x, Y + 0.02, P2.z); root.add(ringTxt);

    // Edificios: fachadas mirando a la calle
    const styles = ['eixample', 'stone', 'modern', 'brick', 'eixample'];
    let seed = 3;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const put = (b, x, z, face) => { b.position.set(x, Y + CURB, z); b.rotation.y = face; stat.add(b); };
    const row = (x, z, face, n = 1, sign = null) => {
        const w = 8 + rnd() * 0.8, d = 6.5;
        put(building({ w, d, floors: 3 + Math.floor(rnd() * 4), style: styles[Math.floor(rnd() * styles.length)], seed: seed % 97, sign }), x, z, face);
        return n;
    };
    for (const [x0, x1] of [[-40, 0], [0, 40]]) for (const [z0, z1] of [[-40, 0], [0, 40]]) {
        const a = x0 + HW, b = x1 - HW, c = z0 + HW, e = z1 - HW, mx = (a + b) / 2, mz = (c + e) / 2;
        for (const u of [-10, 0, 10]) {
            if (Math.hypot(mx + u, c + 6) > 17) row(mx + u, c + 2.5 + 3.25, Math.PI);   // fachada a -z
            if (Math.hypot(mx + u, e - 6) > 17) row(mx + u, e - 2.5 - 3.25, 0);         // fachada a +z
        }
        if (Math.hypot(a + 6, mz) > 17) row(a + 2.5 + 3.25, mz, -Math.PI / 2);
        if (Math.hypot(b - 6, mz) > 17) row(b - 2.5 - 3.25, mz, Math.PI / 2);
    }
    const ring = EDGE + 2.6 + 3.25;
    for (let u = -48; u <= 48; u += 10) {
        row(u, ring, Math.PI, 1, u === -28 ? 'AUTOESCUELA CARI' : null);
        row(u, -ring, 0);
        if (Math.abs(u) <= 40) { row(ring, u, -Math.PI / 2); row(-ring, u, Math.PI / 2); }
    }
    // segunda fila más alta (skyline)
    for (let u = -60; u <= 60; u += 12) for (const [x, z, f] of [[u, ring + 14, Math.PI], [u, -ring - 14, 0], [ring + 14, u, -Math.PI / 2], [-ring - 14, u, Math.PI / 2]]) {
        put(building({ w: 10, d: 9, floors: 7 + Math.floor(rnd() * 5), style: styles[Math.floor(rnd() * styles.length)], seed: seed % 89 }), x, z, f);
    }

    // Árboles y farolas en las aceras
    const treeSrc = await model('suburb/tree-small');
    const lampSrc = await model('roads/light-curved');
    const fit = (src, h) => { const o = src.clone(true); const s = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()); o.scale.multiplyScalar(h / s.y); return o; };
    const sidewalkSpots = [];
    for (const s of STREETS) for (let u = -36; u <= 36; u += 9) {
        if (STREETS.some(t => Math.abs(u - t) < HW + 2.5)) continue;
        for (const side of [-1, 1]) {
            sidewalkSpots.push([s + side * (HW + 1.1), u, side, 'x'], [u, s + side * (HW + 1.1), side, 'z']);
        }
    }
    sidewalkSpots.forEach(([x, z, side, ax], i) => {
        if (Math.hypot(x, z) < RING.r1 + 2.5) return;
        if (Math.abs(x - PARK.x) < 4 && Math.abs(z - (-35.4)) < 2) return;      // junto a la plaza
        if (Math.abs(x - PARK2.x) < 5 && Math.abs(z - (-44.6)) < 2) return;     // junto a la plaza final
        if (Math.abs(x + HW + 0.8) < 2 && [-17, 14.5, 21.2, 35.2].some(zz => Math.abs(z - zz) < 2.5)) return;   // señales de la 2ª vuelta
        if (Math.abs(z - 24) < 4 && Math.abs(x) < 8) return;                     // paso de cebra
        if (i % 3 === 0) {
            const l = fit(lampSrc, 4);
            l.position.set(x, Y + CURB, z);
            l.rotation.y = ax === 'x' ? (side > 0 ? Math.PI : 0) : (side > 0 ? -Math.PI / 2 : Math.PI / 2);
            l.rotation.y += Math.PI / 2;
            stat.add(l);
        } else {
            const t = fit(treeSrc, 2.6 + (i % 4) * 0.25);
            t.position.set(x, Y + CURB, z); t.rotation.y = i;
            stat.add(t);
        }
    });

    // Señales (la cara mira al coche que llega)
    const sign = (g, x, z, face) => { g.position.set(x, Y + CURB, z); g.rotation.y = face; stat.add(g); };
    sign(stopSign(), -5.0, EDGE + 0.8, -Math.PI / 2);
    sign(speedSign(30), HW + 0.8, 34, 0);
    sign(blueSign('🚸'), HW + 0.8, 26.8, 0);
    sign(blueSign('⟲', true), HW + 0.8, 16, 0);
    sign(speedSign(50), -15, -HW - 0.8, Math.PI / 2);
    // segunda vuelta
    sign(blueSign('⟲', true), -HW - 0.8, -17, Math.PI);
    sign(speedSign(30), -HW - 0.8, 14.5, Math.PI);
    sign(blueSign('🚸'), -HW - 0.8, 21.2, Math.PI);
    sign(stopSign(), -HW - 0.8, 35.2, Math.PI);
    const parkPanel = (txt) => {
        const t = textPlane(txt, 2.6, { width: 640, height: 200, bg: '#1d5bbf', fg: '#ffffff', borderColor: '#ffffff' });
        const pg = new THREE.Group(); pg.add(t); t.position.y = 2.5;
        const pp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), mat('#9aa3b5')); pp.position.y = 1.1; pg.add(pp);
        return pg;
    };
    sign(parkPanel('P · Plaza del corazón 💗'), PARK.x + 3.2, -40 + HW + 0.7, Math.PI);
    sign(parkPanel('P · Reservado 💍'), PARK2.x - 3.4, -EDGE - 0.8, 0);

    const merged = mergeStatic(stat);
    root.add(merged);

    // Semáforo (dinámico)
    const light = trafficLight();
    light.position.set(-34.3, Y + CURB, -HW - 0.7);
    light.rotation.y = Math.PI / 2;      // las luces miran a +x (al coche que llega hacia el oeste)
    root.add(light);
    const light2 = trafficLight();
    light2.position.set(EDGE + 0.8, Y + CURB, 5.4);       // las luces miran a +z (al coche que sube hacia el norte)
    root.add(light2);

    // Coches aparcados (obstáculos)
    const obstacles = [];
    // [modelo, x, z, alineado con el eje x]: los dos primeros flanquean la plaza del corazón
    const parked = [['car/sedan', -22.6, -37.25, true], ['car/suv', -9.4, -37.25, true],
        ['car/hatchback-sports', PARK2.x - 5.1, -42.85, true], ['car/taxi', PARK2.x + 5.1, -42.85, true],     // la plaza final, más justa
        ['car/van', -42.6, 22, false], ['car/hatchback-sports', 25, -2.6, true], ['car/delivery', -20, 2.6, true], ['car/sedan', -42.6, -20, false]];
    for (const [key, x, z, alongX] of parked) {
        const c = await sized(key, 2.7);
        c.position.set(x, Y, z);
        c.rotation.y = alongX ? Math.PI / 2 : 0;
        root.add(c);
        obstacles.push(alongX ? { x0: x - 1.35, x1: x + 1.35, z0: z - 0.62, z1: z + 0.62 } : { x0: x - 0.62, x1: x + 0.62, z0: z - 1.35, z1: z + 1.35 });
    }

    // El peatón del paso de cebra
    const walker = await model('chars/character-female-c');
    walker.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    root.add(walker);
    const mixer = new THREE.AnimationMixer(walker);
    const clips = walker.userData.animations || [];
    const acts = {};
    const play = (name) => {
        const clip = THREE.AnimationClip.findByName(clips, name) || THREE.AnimationClip.findByName(clips, 'idle');
        if (!clip) return;
        const a = acts[name] || (acts[name] = mixer.clipAction(clip));
        for (const k in acts) if (acts[k] !== a) acts[k].fadeOut(0.25);
        a.reset().fadeIn(0.25).play();
    };

    // Él, esperando junto a la plaza del corazón
    const him = await model(CONFIG.couple.him);
    him.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    him.position.set(PARK2.x - 0.4, Y + CURB, -EDGE - 1.0);
    him.rotation.y = 0;
    root.add(him);
    const himMixer = new THREE.AnimationMixer(him);
    const himClips = him.userData.animations || [];
    const himPlay = (name) => { const c = THREE.AnimationClip.findByName(himClips, name) || THREE.AnimationClip.findByName(himClips, 'idle'); if (c) { himMixer.stopAllAction(); himMixer.clipAction(c).reset().play(); } };
    himPlay('idle');

    // Flechas de guía
    const chevMat = new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.95, toneMapped: false, depthWrite: false });
    const chevGeo = chevronGeometry();
    const chevrons = [];
    for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(chevGeo, chevMat.clone()); m.renderOrder = 3; root.add(m); chevrons.push(m); }
    // Corazón flotante sobre la plaza
    const goal = new THREE.Mesh(heartGeometry(), new THREE.MeshBasicMaterial({ color: '#ff4d8d', toneMapped: false }));
    goal.scale.setScalar(0.5);
    goal.position.set(PARK.x, Y + 2.2, PARK.z);
    root.add(goal);

    // Intermitentes del Tesla: solo los traseros, un piloto naranja y un destello que siempre mira a la
    // cámara (se ve bien desde detrás, de día y de noche).
    const glowTex = (() => {
        const c = document.createElement('canvas'); c.width = c.height = 128;
        const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        gr.addColorStop(0, 'rgba(255,245,200,1)'); gr.addColorStop(0.18, 'rgba(255,190,60,1)');
        gr.addColorStop(0.45, 'rgba(255,140,0,0.55)'); gr.addColorStop(1, 'rgba(255,120,0,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const lensMat = new THREE.MeshBasicMaterial({ color: '#ffb020', toneMapped: false });
    const glowMat = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, transparent: true });
    const size = app.car.size || new THREE.Vector3(1.15, 0.9, CONFIG.car.length);
    const hx = size.x / 2, hz = size.z / 2;
    const blinkers = { left: [], right: [] };
    for (const sx of [1, -1]) for (const front of [false]) {     // solo los traseros
        const g = new THREE.Group();
        g.position.set(sx * (hx - 0.1), front ? 0.5 : 0.66, front ? hz - 0.02 : -hz + 0.02);
        const lens = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.06), lensMat);
        lens.position.z = front ? 0.03 : -0.03;
        const glow = new THREE.Sprite(glowMat);
        glow.scale.setScalar(front ? 0.8 : 1.05);
        glow.position.set(sx * 0.06, 0, front ? 0.12 : -0.12);
        glow.renderOrder = 5;
        g.add(lens, glow);
        g.visible = false;
        app.car.root.add(g);
        (sx > 0 ? blinkers.left : blinkers.right).push(g);      // +x local del coche = su izquierda
    }

    root.visible = false;
    app.engine.scene.add(root);
    return { root, light, light2, obstacles, walker, play, mixer, him, himPlay, himMixer, chevrons, goal, hg, blinkers };
}

// ============================================================================
//  EL EXAMEN
// ============================================================================
// opts.phys / opts.pts: física y huella de otro coche (modo conducción, game/drive/exam-mode.js)
export async function buildExam(app, opts = {}) {
    const PH = opts.phys || PHYS, PTS = opts.pts || CAR_PTS;
    const R = buildRoute();
    const W = await build(app);
    const input = new Input();
    // Proyección global (sin pista): busca en toda la ruta
    const markAll = (x, z) => { let best = null; for (let h = 0; h < R.len; h += 40) { const p = R.project(x, z, h); if (p && (!best || p.dist < best.dist)) best = p; } return best.along; };
    const D = {
        stop: markAll(-4.3, 40 + LANE),
        turnL: markAll(-1.2, 39.5),
        z30a: markAll(LANE, 34), z30b: markAll(LANE, 13),
        cross: markAll(LANE, 24),
        ringIn: markAll(2.7, 7.5),
        exit: markAll(-8.2, -1.9),
        light: markAll(-35.3, -LANE),
        turnR1: markAll(-37.3, -3.3),
        turnR2: markAll(-37.3, -37.3),
        park1: markAll(PARK.x, PARK.z),
        // segunda vuelta
        turnR3: markAll(-2.56, -38.09),
        ringIn2: markAll(-2.736, -7.518),
        exit2: markAll(-2.23, 8.16),
        z30c: markAll(-LANE, 13.5), z30d: markAll(-LANE, 34.5),
        cross2: markAll(-LANE, 24),
        stop2: markAll(-LANE, 36.2),
        turnL2: markAll(-0.12, 40.12),
        turnL3: markAll(40.21, 40.21),
        light2: markAll(40 + LANE, 4.5),
        turnL4: markAll(40.21, -40.21),
        park: R.len
    };
    const SIGNALS = [
        { d: D.turnL, side: 'left', label: 'izquierda' },
        { d: D.exit, side: 'right', label: 'derecha' },
        { d: D.turnR1, side: 'right', label: 'derecha' },
        { d: D.turnR2, side: 'right', label: 'derecha' },
        { d: D.turnR3, side: 'right', label: 'derecha' },
        { d: D.exit2, side: 'right', label: 'derecha' },
        { d: D.turnL2, side: 'left', label: 'izquierda' },
        { d: D.turnL3, side: 'left', label: 'izquierda' },
        { d: D.turnL4, side: 'left', label: 'izquierda' }
    ];
    const NODES = [D.turnL, D.turnR1, D.turnR2, D.turnR3, D.turnL2, D.turnL3, D.turnL4];
    // Las pruebas se repiten en la segunda vuelta, cada vez más difíciles
    const STOPS = [{ d: D.stop }, { d: D.stop2 }];
    const CROSSINGS = [
        { d: D.cross, from: -5.8, to: 5.8, speed: 1.7, trigger: 17 },
        { d: D.cross2, from: 5.8, to: -5.8, speed: 2.4, trigger: 12 }      // sale más tarde y más deprisa
    ];
    const LIGHTS = [
        { d: D.light, obj: W.light, start: D.exit + 2, amber: 1.7 },
        { d: D.light2, obj: W.light2, start: D.light2 - 21, amber: 1.0 }  // ámbar más corto
    ];
    const PARKS = [
        { ...PARK, d: D.park1, dx: 1.5, dz: 0.65, tol: 22, final: false },
        { ...PARK2, d: R.len, dx: 1.3, dz: 0.5, tol: 20, final: true }
    ];
    const Z30 = [[D.z30a - 2, D.z30b], [D.z30c, D.z30d]];
    const RINGS = [[D.ringIn - 7, D.exit + 5], [D.ringIn2 - 7, D.exit2 + 5]];

    function run() {
        return new Promise(resolve => {
            const car = app.car, rig = app.rig, engine = app.engine;
            const st = {
                x: 0, z: 0, h: 0, v: 0, steer: 0, along: 0, revT: 0, dist: 0,
                faults: [], graves: 0, cool: {}, blink: null, blinkT: 0, signalOk: {}, signalDone: {},
                stops: STOPS.map(() => ({ ok: false, done: false })), speedT: 0, laneT: 0, offT: 0, wrongT: 0, lost: false,
                peds: CROSSINGS.map(() => ({ state: 'wait', passed: false })), wx: -5.8,
                lights: LIGHTS.map(() => ({ state: 'green', t: 0, stopT: 0, cycled: false })),
                parksDone: PARKS.map(() => false), parkT: 0, parked: false, finished: false, last: 0, flashT: 0
            };
            const pose = { pos: new THREE.Vector3(), h: 0, v: 0, acc: 0, yawRate: 0, dist: 0 };
            app.examDebug = { R, D, st, SIGNALS, STOPS, CROSSINGS, LIGHTS, PARKS };     // para depurar desde la consola
            input.skip = false;

            // --- Interfaz ---------------------------------------------------------
            const hud = $('exam-hud');
            const say = (t) => { const e = $('ex-say'); if (e.textContent !== t) { e.textContent = t; e.parentElement.parentElement.classList.remove('bump'); void e.offsetWidth; e.parentElement.parentElement.classList.add('bump'); } };
            const flash = (t, kind = 'info', ms = 2600) => {
                const f = $('ex-flash'); f.textContent = t; f.dataset.kind = kind;
                f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
                st.flashT = ms / 1000;
            };
            const fault = (key, text, grave = false, cool = 5) => {
                const now = engine.time;
                if (st.cool[key] && now - st.cool[key] < cool) return false;
                st.cool[key] = now;
                if (grave) { st.graves++; flash(`⛔ ${text}`, 'grave', 3600); sfx('bad'); input.rumble(0.9, 320); }
                else { st.faults.push(text); flash(`⚠️ Falta leve: ${text}`, 'leve', 2800); sfx('bad'); input.rumble(0.4, 140); }
                $('ex-faults').textContent = st.faults.length;
                $('ex-graves').textContent = st.graves;
                $('ex-graves').parentElement.hidden = !st.graves;
                return true;
            };
            const setPadHelp = () => {
                const pad = !!input.pad;
                $('ex-pad').innerHTML = pad
                    ? '🎮 <b>RT</b> acelerar · <b>LT</b> frenar / atrás · <b>🕹</b> girar · <b>LB</b>/<b>RB</b> intermitentes · <b>Y</b> volver a la ruta'
                    : '⌨️ <b>↑</b> acelerar · <b>↓</b> frenar / atrás · <b>← →</b> girar · <b>Q</b>/<b>E</b> intermitentes · <b>R</b> volver <span class="ex-dim">· ¿Mando? Pulsa cualquier botón</span>';
                hud.classList.toggle('has-pad', pad);
            };

            // --- Colocar el coche en un punto de la ruta ---------------------------
            const placeAt = (d) => {
                const p = R.at(d);
                st.x = p.x; st.z = p.z; st.h = Math.atan2(p.tx, p.tz);
                st.v = 0; st.steer = 0; st.along = d; st.revT = 0;
                st.offT = 0; st.wrongT = 0; st.lost = false;
            };
            let respawning = false;
            const respawn = async (d, msg) => {
                if (respawning) return;
                respawning = true;
                if (msg) flash(msg, 'grave', 3200);
                await UI.wait(900);
                await UI.fade(true);
                placeAt(d);
                if (st.blink) setBlink(null);
                writePose(0);
                rig.snap();
                await UI.fade(false);
                respawning = false;
            };
            const setBlink = (side) => {
                st.blink = st.blink === side ? null : side;
                st.blinkT = 0;
                W.blinkers._on = false;          // el primer destello sale ya (y suena)
            };
            const writePose = (acc) => {
                pose.pos.set(O.x + st.x, Y - 0.02, O.z + st.z);
                pose.h = st.h; pose.v = st.v; pose.acc = acc; pose.dist = st.dist;
                car.setFree(pose);
                car.root.position.copy(pose.pos);
                car.root.rotation.y = st.h;
            };
            const blocked = (x, z, h) => {
                const fx = Math.sin(h), fz = Math.cos(h), rx = -fz, rz = fx;
                for (const [lx, lz] of PTS) {
                    const px = x + fx * lz + rx * lx, pz = z + fz * lz + rz * lx;
                    if (!onRoad(px, pz)) return 'curb';
                    for (const o of W.obstacles) if (px > o.x0 && px < o.x1 && pz > o.z0 && pz < o.z1) return 'car';
                }
                return null;
            };

            // --- Arranque ------------------------------------------------------------
            W.root.visible = true;
            placeAt(0);
            writePose(0);
            rig.chase();
            rig.snap();
            W.light.userData.set('green'); W.light2.userData.set('green');
            W.walker.position.set(-5.8, Y + CURB, 24); W.walker.rotation.y = Math.PI / 2; W.play('idle');
            W.himPlay('idle');
            hud.hidden = false; requestAnimationFrame(() => hud.classList.add('on'));
            input.active = true;
            setPadHelp();
            say('Buenas tardes. Cuando quieras, arranca y sigue las flechas amarillas. 🚗');
            sfx('start');

            const off = engine.onUpdate((dt, time) => {
                const inp = input.poll(dt);
                W.mixer.update(dt); W.himMixer.update(dt);
                W.hg.rotation.y = time * 0.8; W.hg.position.y = Y + 3.2 + Math.sin(time * 1.6) * 0.15;
                const gp = PARKS[Math.max(0, st.parksDone.indexOf(false))];
                W.goal.rotation.y = time * 2; W.goal.position.set(gp.x, Y + 2.2 + Math.sin(time * 3) * 0.18, gp.z);
                if (!!input.pad !== hud.classList.contains('has-pad')) setPadHelp();
                if (st.flashT > 0) { st.flashT -= dt; if (st.flashT <= 0) $('ex-flash').classList.remove('on'); }
                if (input.skip && !st.finished) { st.finished = true; finish(true); return; }
                if (st.finished) return;

                if (inp.pressed.left) setBlink('left');
                if (inp.pressed.right) setBlink('right');
                if (inp.pressed.horn) car.honk();
                if (inp.pressed.y && !respawning) respawn(checkpoint(), null);

                // Al aparcar: A apaga el motor y termina el examen
                if (st.parked) {
                    if (inp.pressed.a) { st.finished = true; finish(false); }
                    st.v = 0; pose.yawRate = 0; writePose(0);
                    W.chevrons.forEach(c => (c.visible = false));
                    blinkStep(dt);
                    return;
                }
                if (respawning) { st.v *= Math.max(0, 1 - dt * 6); writePose(0); return; }
                driveStep(dt, inp);
                blinkStep(dt);
                rules(dt);
                guide(time);
            });

            // --- Física del coche ----------------------------------------------------
            function driveStep(dt, inp) {
                let v = st.v, acc = 0;
                const coast = inp.thr < 0.03 && inp.brk < 0.03;
                if (v >= -0.05) {
                    if (inp.thr > 0.03) acc += inp.thr * PH.accel * (1 - Math.max(0, v) / PH.maxV * 0.55);
                    if (inp.brk > 0.03) {
                        if (v > 0.15) acc -= inp.brk * PH.brake;
                        else { st.revT += dt; if (st.revT > 0.35) acc -= inp.brk * PH.accel * 0.6; else { v = 0; } }
                    } else st.revT = 0;
                } else {
                    if (inp.thr > 0.03) acc += inp.thr * PH.brake;
                    if (inp.brk > 0.03) acc -= inp.brk * PH.accel * 0.6;
                }
                acc -= v * PH.drag + Math.sign(v) * PH.roll * (coast ? 1 : 0.25);
                let nv = v + acc * dt;
                if ((coast || (v > 0 && inp.brk > 0.03 && st.revT <= 0.35)) && Math.sign(nv) !== Math.sign(v) && v !== 0) nv = 0;
                if (v < 0 && inp.thr > 0.03 && nv > 0) nv = 0;
                st.v = THREE.MathUtils.clamp(nv, -PH.maxRev, PH.maxV);
                // Dirección: más suave cuanto más rápido
                const target = inp.steer * PH.steerMax / (1 + Math.abs(st.v) * 0.085);
                st.steer += (target - st.steer) * Math.min(1, dt * 7);
                const yawRate = -st.v / PH.wheelbase * Math.tan(st.steer);
                const nh = st.h + yawRate * dt;
                const nx = st.x + Math.sin(nh) * st.v * dt, nz = st.z + Math.cos(nh) * st.v * dt;
                const hit = blocked(nx, nz, nh);
                if (hit) {
                    if (Math.abs(st.v) > 0.6) {
                        input.rumble(0.7, 160);
                        sfx('tap');
                        car.shake();
                        if (hit === 'car') fault('car', 'Has tocado un coche aparcado', false, 4);
                        else fault('curb', 'Has subido el bordillo', false, 4);
                    }
                    st.v = -st.v * 0.2;
                    // permite girar en el sitio si así se libera
                    if (!blocked(st.x, st.z, nh)) st.h = nh;
                } else { st.x = nx; st.z = nz; st.h = nh; }
                st.dist += Math.abs(st.v) * dt;
                pose.yawRate = yawRate;
                writePose(acc);
            }

            function blinkStep(dt) {
                st.blinkT += dt;
                const on = st.blink && (st.blinkT % 0.75) < 0.45;     // ~80 destellos/min, como un coche
                const was = W.blinkers._on;
                for (const side of ['left', 'right']) for (const b of W.blinkers[side]) b.visible = !!on && st.blink === side;
                $('ex-blink-l').classList.toggle('on', !!on && st.blink === 'left');
                $('ex-blink-r').classList.toggle('on', !!on && st.blink === 'right');
                if (on !== was) { W.blinkers._on = on; if (st.blink && on) sfx('click'); }
            }

            // Último punto de control pasado (para "volver a la ruta")
            function checkpoint() {
                const cps = [0, D.stop + 6, D.cross + 5, D.exit + 6, D.light + 7, D.turnR2 + 6, D.park1 + 2, D.turnR3 + 5,
                    D.exit2 + 5, D.cross2 + 5, D.stop2 + 6, D.turnL3 + 5, D.light2 + 6, D.turnL4 + 5];
                let c = 0;
                for (const p of cps) if (st.last >= p) c = p;
                return c;
            }

            // --- Normas, pruebas y examinador -----------------------------------------
            function rules(dt) {
                const pr = R.project(st.x, st.z, st.along);
                if (!pr) return;
                const prev = st.along;
                if (pr && pr.dist < 9) st.along = pr.along;
                st.last = Math.max(st.last, st.along);
                const a = st.along;
                const kmh = Math.abs(st.v) * KMH;
                $('ex-kmh').textContent = Math.round(kmh);
                const limit = Z30.some(([z0, z1]) => a > z0 && a < z1) ? 30 : 50;
                $('ex-limit').textContent = limit;

                // Fuera de la ruta o en sentido contrario
                const fwd = Math.sin(st.h) * pr.tx + Math.cos(st.h) * pr.tz;
                st.offT = pr.dist > 7 ? st.offT + dt : 0;
                st.wrongT = fwd < -0.3 && st.v > 1 && pr.dist < 7 ? st.wrongT + dt : 0;
                if (st.offT > 1.5 || st.wrongT > 1.5) {
                    if (!st.lost) { st.lost = true; st.lostT = 0; }
                    st.lostT += dt;
                    say(input.pad ? 'Por ahí no es 😅 Da la vuelta o pulsa Y para volver a la ruta.' : 'Por ahí no es 😅 Da la vuelta o pulsa R para volver a la ruta.');
                    if (st.lostT > 9) respawn(checkpoint(), null);
                    return;
                }
                st.lost = false;

                // Velocidad
                st.speedT = kmh > limit + 3 ? st.speedT + dt : 0;
                if (st.speedT > 1.4) { fault('speed' + limit, `Exceso de velocidad (máx. ${limit} km/h)`, false, 8); st.speedT = 0; }

                // Carril contrario (fuera de cruces y rotonda)
                const nearNode = NODES.some(n => Math.abs(a - n) < 10) || RINGS.some(([r0, r1]) => a > r0 && a < r1)
                    || STOPS.some(t => Math.abs(a - t.d) < 6) || (a > D.turnR2 + 8 && a < D.park1 + 12) || a > D.turnL4 + 8;
                st.laneT = !nearNode && pr.off < -1.2 && st.v > 1 ? st.laneT + dt : 0;
                if (st.laneT > 1.6) { fault('lane', 'Invades el carril contrario', false, 7); st.laneT = 0; }

                // Intermitentes: hay que señalizar antes de cada giro
                for (const s of SIGNALS) {
                    if (a > s.d - 24 && a < s.d + 3 && st.blink === s.side) st.signalOk[s.d] = true;
                    if (!st.signalDone[s.d] && prev < s.d && a >= s.d) {
                        st.signalDone[s.d] = true;
                        if (!st.signalOk[s.d]) fault('sig' + s.d, `No has señalizado el giro a la ${s.label}`, false, 1);
                        else flash('👍 Bien señalizado', 'ok', 1600);
                    }
                    // el intermitente se apaga solo al acabar el giro
                    if (st.blink === s.side && prev < s.d + 6 && a >= s.d + 6) { st.blink = null; }
                }

                // 1 · STOP (dos veces)
                STOPS.forEach((T, i) => {
                    const S = st.stops[i];
                    if (S.done) return;
                    if (a > T.d - 7 && a < T.d + 0.5 && Math.abs(st.v) < 0.3 && !S.ok) { S.ok = true; flash('✋ ¡Bien parada en el STOP!', 'ok', 1800); sfx('good'); }
                    if (prev < T.d && a >= T.d) {
                        if (S.ok) S.done = true;
                        else { fault('stop' + i, 'No has parado en el STOP', true, 1); respawn(T.d - 14, null); }
                    }
                });

                // 2 · Paso de peatones (a la vuelta sale más tarde y más deprisa, desde el otro lado)
                CROSSINGS.forEach((C, i) => {
                    const P = st.peds[i], dir = Math.sign(C.to - C.from);
                    if (P.state === 'wait' && a > C.d - C.trigger && a < C.d) {
                        P.state = 'walk'; st.wx = C.from;
                        W.walker.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2; W.play('walk');
                    }
                    if (P.state === 'walk') {
                        st.wx += dt * C.speed * dir;
                        if ((C.to - st.wx) * dir <= 0) { st.wx = C.to; P.state = 'done'; W.play('emote-yes'); }
                        W.walker.position.set(st.wx, Y + (Math.abs(st.wx) > HW ? CURB : 0) + 0.02, 24);
                        if (Math.abs(st.wx) < HW + 0.3 && st.v > 0.4 && a > C.d - 2.4 && a < C.d + 1.5) {
                            fault('ped' + i, 'No has cedido el paso al peatón', true, 1);
                            P.state = 'wait'; P.passed = false; st.wx = C.from;
                            W.walker.position.set(C.from, Y + CURB, 24); W.walker.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2; W.play('idle');
                            respawn(C.d - 16, null);
                        }
                    }
                    if (P.state === 'done' && !P.passed && a > C.d + 1) { P.passed = true; flash('🚸 ¡Has cedido el paso, muy bien!', 'ok', 2000); sfx('good'); }
                });

                // 3 · Semáforos (el segundo cambia más tarde y con el ámbar más corto)
                LIGHTS.forEach((T, i) => {
                    const L = st.lights[i];
                    L.t += dt;
                    if (!L.cycled && a > T.start && a < T.d && L.state === 'green') { L.state = 'amber'; L.t = 0; T.obj.userData.set('amber'); }
                    if (L.state === 'amber' && L.t > T.amber) { L.state = 'red'; L.t = 0; L.stopT = 0; T.obj.userData.set('red'); }
                    if (L.state === 'red') {
                        if (Math.abs(st.v) < 0.25 && a > T.d - 12 && a < T.d + 0.3) L.stopT += dt;
                        if (L.stopT > 2.2 || L.t > 12) { L.state = 'green'; L.cycled = true; T.obj.userData.set('green'); if (L.stopT > 2.2) { flash('🚦 ¡Bien esperado!', 'ok', 1600); sfx('good'); } }
                        if (prev < T.d && a >= T.d) {
                            fault('red' + i, 'Te has saltado el semáforo en rojo', true, 1);
                            L.t = 0; L.stopT = 0;
                            respawn(T.d - 16, null);
                        }
                    } else if (L.state === 'amber' && prev < T.d && a >= T.d) flash('🟡 Ámbar… ¡por los pelos! 😬', 'leve', 1800);
                });

                // 4 · Aparcar: primero en la plaza del corazón (y salir), al final en la plaza 💍, más estrecha
                const pi = st.parksDone.indexOf(false);
                if (pi >= 0) {
                    const K = PARKS[pi];
                    if (a > K.d - 14) {
                        const dx = st.x - K.x, dz = st.z - K.z;
                        const hd = Math.abs(Math.sin(st.h - Math.PI / 2));    // 0 = alineado con la calle
                        const inside = Math.abs(dx) < K.dx && Math.abs(dz) < K.dz && hd < Math.sin(deg(K.tol));
                        st.parkT = inside && Math.abs(st.v) < 0.18 ? st.parkT + dt : 0;
                        W.goal.material.color.set(inside ? '#2ee87a' : '#ff4d8d');
                        if (st.parkT > 0.9) {
                            st.parkT = 0;
                            st.parksDone[pi] = true;
                            W.goal.material.color.set('#ff4d8d');
                            if (!K.final) {
                                sfx('good');
                                flash('🅿️ ¡Bien aparcado! Ahora la segunda vuelta… más difícil 😉', 'ok', 3200);
                            } else {
                                st.parked = true;
                                sfx('fanfare');
                                W.himPlay('emote-yes');
                                if (window.confetti) window.confetti({ particleCount: 90, spread: 80, origin: { y: 0.55 }, colors: ['#ff4d8d', '#ffd23f', '#ffffff'] });
                                say(input.pad ? '¡Perfecto! Aparcada. Pulsa A para apagar el motor 🔑' : '¡Perfecto! Aparcada. Pulsa Enter para apagar el motor 🔑');
                                return;
                            }
                        }
                    }
                    if (!K.final && a > K.d + 5) {
                        fault('park' + pi, 'No has aparcado en la plaza del corazón', true, 1);
                        respawn(K.d - 12, null);
                    }
                }

                // Indicaciones del examinador según dónde está
                say(instruction(a));
            }

            function instruction(a) {
                const LB = input.pad ? 'LB' : 'Q', RB = input.pad ? 'RB' : 'E';
                const sig = (side) => (st.blink === side ? '' : ` (intermitente ${side === 'left' ? LB : RB})`);
                const light = (i, def) => {
                    const L = st.lights[i].state;
                    return L === 'red' ? 'Semáforo en rojo: detente antes de la línea. 🔴' : L === 'amber' ? 'Ámbar: si puedes parar con seguridad, para. 🟡' : def;
                };
                if (a < D.stop - 16) return 'Sigue las flechas amarillas hasta el cruce. 🚗';
                if (a < D.stop && !st.stops[0].ok) return 'Señal de STOP: detén el coche por completo antes de la línea. ✋';
                if (a < D.turnL + 4) return `Gira a la izquierda${sig('left')}. ↰`;
                if (a < D.cross + 1) return 'Zona escolar: máximo 30 km/h. Atenta al paso de peatones. 🚸';
                if (a < D.ringIn - 1) return 'En la rotonda, toma la tercera salida. ⟲';
                if (a < D.exit) return a > D.exit - 14 ? `Vas a salir${sig('right')}. ➡` : 'Tercera salida… sigue rodeando la isleta. ⟲';
                if (a < D.light + 0.5) return light(0, 'Sigue recto hasta el semáforo. 🚦');
                if (a < D.turnR1 + 4) return `Gira a la derecha${sig('right')}. ↱`;
                if (a < D.turnR2 + 4) return 'Al final de la calle, otra vez a la derecha. ↱';
                if (!st.parksDone[0]) return 'Aparca en la plaza del corazón, entre los dos coches. 💗';
                if (a < D.turnR3 + 4) return `Sal de la plaza y en el cruce gira a la derecha${sig('right')}. ↱`;
                if (a < D.ringIn2 - 1) return 'Segunda vuelta, ahora más difícil 😉 En la rotonda, la segunda salida. ⟲';
                if (a < D.exit2) return a > D.exit2 - 12 ? `Segunda salida${sig('right')}. ➡` : 'Segunda salida… atenta. ⟲';
                if (a < D.cross2 + 1) return 'Otra vez zona 30 y el paso de peatones… puede salir alguien de repente. 🚸';
                if (a < D.stop2 && !st.stops[1].ok) return 'STOP otra vez: para del todo antes de la línea. ✋';
                if (a < D.turnL2 + 4) return `Gira a la izquierda${sig('left')}. ↰`;
                if (a < D.turnL3 + 4) return `Al final de la calle, a la izquierda${sig('left')}. ↰`;
                if (a < D.light2 + 0.5) return light(1, 'Semáforo al fondo… este cambia más deprisa. 🚦');
                if (a < D.turnL4 + 4) return `Al final, a la izquierda${sig('left')}. ↰`;
                return 'Último ejercicio: aparca en la plaza 💍, entre los dos coches. Esta es más estrecha.';
            }

            // Flechas amarillas por delante del coche
            function guide(time) {
                const a = st.along;
                W.chevrons.forEach((m, i) => {
                    const d = a + 5 + i * 3.4 - ((time * 2.2) % 3.4);
                    if (d > R.len - 1.5 || st.lost) { m.visible = false; return; }
                    const p = R.at(d);
                    m.visible = true;
                    m.position.set(p.x, Y + 0.9 + Math.sin(time * 3 + i) * 0.06, p.z);
                    m.rotation.y = Math.atan2(p.tx, p.tz);
                    const k = (d - a - 5) / (6 * 3.4);
                    m.material.opacity = 0.95 * (1 - k * 0.8);
                });
            }

            async function finish(skipped) {
                off();
                input.active = false;
                car.setFree(pose);           // se queda aparcado mientras sale la tarjeta
                W.chevrons.forEach(c => (c.visible = false));
                hud.classList.remove('on');
                setTimeout(() => { hud.hidden = true; }, 400);
                for (const side of ['left', 'right']) for (const b of W.blinkers[side]) b.visible = false;
                if (!skipped) {
                    rig.orbit(new THREE.Vector3(O.x + st.x, Y, O.z + st.z), { radius: 11, height: 4.5, speed: 0.12, angle: st.h + Math.PI * 0.7, lookY: 1 });
                    await UI.wait(1600);
                }
                resolve({ skipped, faults: st.faults.slice(), graves: st.graves, input });
            }
        });
    }

    // Vuelta a la normalidad (el coche vuelve a la carretera)
    function leave() {
        W.root.visible = false;
        app.car.setFree(null);
    }

    return { run, leave, input };
}

// Resumen para la tarjeta final
export function examSummary(r) {
    if (r.skipped) return 'El examinador ha tenido prisa… ¡pero te lo da por aprobado! 😉';
    const n = r.faults.length;
    const leves = n === 0 ? 'Sin ninguna falta leve 😍' : n === 1 ? '1 falta leve' : `${n} faltas leves`;
    const rep = r.graves ? ` · ${r.graves} ${r.graves === 1 ? 'prueba repetida' : 'pruebas repetidas'} (hoy perdonamos 😉)` : '';
    const verdict = n === 0 && !r.graves ? '¡Conducción de matrícula de honor!' : n <= 3 && r.graves <= 1 ? '¡Muy buena conducción!' : 'Con práctica, cada vez mejor… ¡y con mucho estilo!';
    return `${verdict}<br><small>${leves}${rep}</small>`;
}
