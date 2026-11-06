// ============================================================================
//  GYMKHANA en la pista de prácticas de la autoescuela
// ============================================================================
// Cinco pruebas seguidas, cada una con 1–3 estrellas (la mejor se guarda en el navegador):
//   1 · Slalom: seis conos alternando el lado; saltarse uno = repetir; derribarlo = +2 s
//   2 · Aparcar en batería en la plaza rosa (de frente o marcha atrás)
//   3 · Aparcar en línea entre dos coches, pegado al bordillo
//   4 · Marcha atrás al garaje (si se entra de frente, se repite)
//   5 · Frenada de precisión: pasar de 45 km/h y dejar el morro lo más cerca posible de la línea
// Las marcas del suelo se pintan en una sola textura (nítidas y baratas).
import * as THREE from 'three';
import { Circuit } from './circuit.js';
import { Vehicle, Effects, KMH } from './vehicle.js';
import { buildCar, physicsFor } from './cars.js';
import { ChaseCam } from './camera.js';
import { fmt } from './hud.js';
import { setupEnv, grassTex, asphaltTex, mesh, mat, flatTex } from './maps/common.js';
import { textPlane } from '../assets.js';

const sfx = (n, ...a) => { if (window.sfx && window.sfx[n]) window.sfx[n](...a); };
const PAD = { x0: -62, x1: 62, z0: -46, z1: 46 };
const deg = d => d * Math.PI / 180;
const KEY = 'drive.gym.v1';
const E_ = Math.PI / 2;          // rumbo hacia +x (este)

// Disposición de las pruebas
const SL = { z: -34, x: [-36, -28, -20, -12, -4, 4], start: -48, end: 14 };
const BAY = { z0: 28, z1: 34, x0: -44, w: 3.4, n: 12, target: 6 };
const PAR = { x: 50.5, zA: -20, zB: -10.6, curb: 52 };
const GAR = { x0: -57, x1: -47.5, z0: -7, z1: 1 };
const BRK = { z: -16, x0: -44, line: 24, minKmh: 45 };

export class GymkhanaSession {
    constructor(app, opts) { this.app = app; this.opts = opts; this.mode = 'gymkhana'; this.state = 'loading'; }

    async load() {
        const { engine } = this.app;
        const C = this.C = new Circuit(engine.scene, { id: 'pista', gravity: 30 });
        // trazado interno (no se dibuja) solo para la proyección; la superficie la decide offFn
        C.track([[-55, -40], [55, -40], [55, 40], [-55, 40]], { width: 120 });
        C.offFn = (x, z) => (x > PAD.x0 && x < PAD.x1 && z > PAD.z0 && z < PAD.z1) ? C.onSurface : { grip: 0.7, drag: 0.6, cap: 0.7, dust: 0x9bd77a, name: 'césped', marks: false };
        setupEnv(engine, C, { bg: '#9fdcff', fog: [120, 320], sky: '#dff3ff', ground: '#5a9a3c', hemi: 1.3, sun: '#fff4dc', sunI: 2.3, sunDir: [0.4, 1, 0.3] });
        C.add(flatTex(500, 500, grassTex([30, 30]), { y: -0.03 }));
        // asfalto con todas las marcas
        const pad = new THREE.Mesh(new THREE.PlaneGeometry(PAD.x1 - PAD.x0, PAD.z1 - PAD.z0).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: this._paint() }));
        pad.receiveShadow = true; pad.position.y = 0.01; C.add(pad);
        // valla alrededor
        const fence = [[PAD.x0, PAD.z0], [PAD.x1, PAD.z0], [PAD.x1, PAD.z1], [PAD.x0, PAD.z1]];
        C.wall(fence, { closed: true, thick: 0.6 });
        const postG = new THREE.CylinderGeometry(0.15, 0.15, 1.6, 6), barG = new THREE.BoxGeometry(1, 0.18, 0.18);
        for (let i = 0; i < 4; i++) {
            const [ax, az] = fence[i], [bx, bz] = fence[(i + 1) % 4], L = Math.hypot(bx - ax, bz - az);
            for (let d = 0; d <= L; d += 4) { const k = d / L; C.add(mesh(postG, '#f4f6fb', { x: ax + (bx - ax) * k, y: 0.8, z: az + (bz - az) * k })); }
            const bar = mesh(barG, '#e8173b', { x: (ax + bx) / 2, y: 1.3, z: (az + bz) / 2, ry: -Math.atan2(bz - az, bx - ax) }); bar.scale.x = L; C.add(bar);
        }
        // árboles fuera y la autoescuela al fondo
        for (let i = 0; i < 26; i++) {
            const a = i / 26 * Math.PI * 2, r = 82 + (i % 3) * 9;
            await C.prop(i % 2 ? 'nature/tree_default' : 'nature/tree_oak', Math.cos(a) * r * 1.1, Math.sin(a) * r * 0.85, { height: 10 + (i % 4) * 2, rot: a });
        }
        const school = new THREE.Group();
        school.add(mesh(new THREE.BoxGeometry(30, 9, 12), '#f4f6fb', { y: 4.5 }));
        school.add(mesh(new THREE.BoxGeometry(31, 0.8, 13), '#e8173b', { y: 9.2 }));
        const sign = textPlane('', 20, { width: 1024, height: 200, bg: '#ffffff', fg: '#e8173b', lines: ['AUTOESCUELA CARI'], font: 'Bangers', weight: 400, border: 14, borderColor: '#e8173b' });
        sign.position.set(0, 7, 6.05); school.add(sign);
        school.position.set(0, 0, 60); C.add(school);

        // --- Slalom: conos (dinámicos) y puertas de salida y llegada ---------------------
        this.cones = [];
        const coneM = mat('#ff7a2b'), whiteM = mat('#ffffff');
        const coneMesh = () => {
            const g = new THREE.Group();
            g.add(mesh(new THREE.ConeGeometry(0.42, 1.2, 14), coneM, { y: 0.66 }));
            g.add(mesh(new THREE.CylinderGeometry(0.27, 0.31, 0.16, 14), whiteM, { y: 0.66 }));
            g.add(mesh(new THREE.BoxGeometry(1, 0.08, 1), coneM, { y: 0.04 }));
            return g;
        };
        for (const x of SL.x) { const m = coneMesh(); C.add(m); this.cones.push({ x, z: SL.z, x0: x, z0: SL.z, m, knocked: false }); }
        for (const x of [SL.start, SL.end]) for (const s of [-1, 1]) {
            const f = new THREE.Group();
            f.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 8), '#f4f6fb', { y: 1.5 }));
            f.add(mesh(new THREE.BoxGeometry(0.05, 0.8, 1.2), x === SL.end ? '#2ee87a' : '#ffd23f', { y: 2.6, z: 0.6 }));
            f.position.set(x, 0, SL.z + s * 5.5); C.add(f); C.circle(x, SL.z + s * 5.5, 0.2);
        }
        // --- Batería: coches aparcados salvo en la plaza rosa -----------------------------
        const parked = ['car/sedan', 'car/taxi', 'car/suv', 'car/van', 'car/hatchback-sports', 'car/police'];
        for (let i = 0; i < BAY.n; i++) {
            if (i === BAY.target || i === 2 || i === 10) continue;
            const x = BAY.x0 + BAY.w * (i + 0.5), z = (BAY.z0 + BAY.z1) / 2;
            await C.prop(parked[i % parked.length], x, z + 0.2, { size: 2.6, rot: i % 3 ? 0 : Math.PI });
            C.box(x, z + 0.2, 1.5, 2.7, 0);
        }
        // --- En línea: dos coches junto al bordillo y la acera --------------------------
        for (const z of [PAR.zA, PAR.zB]) { await C.prop('car/sedan', PAR.x, z, { size: 2.6, rot: 0, color: null }); C.box(PAR.x, z, 1.5, 2.7, 0); }
        C.add(mesh(new THREE.BoxGeometry(10, 0.3, 60), '#c7ccd8', { x: PAR.curb + 5, y: 0.15, z: -16 }));
        C.box(PAR.curb + 5, -16, 10, 60, 0, { h: 0.3 });
        // --- Garaje ------------------------------------------------------------------------
        const gw = mat('#b5654a');
        C.add(mesh(new THREE.BoxGeometry(1, 3.4, GAR.z1 - GAR.z0 + 1), gw, { x: GAR.x0 - 0.5, y: 1.7, z: (GAR.z0 + GAR.z1) / 2 }));
        for (const z of [GAR.z0 - 0.5, GAR.z1 + 0.5]) C.add(mesh(new THREE.BoxGeometry(GAR.x1 - GAR.x0 + 1, 3.4, 1), gw, { x: (GAR.x0 + GAR.x1) / 2 - 0.5, y: 1.7, z }));
        C.add(mesh(new THREE.BoxGeometry(GAR.x1 - GAR.x0 + 2, 0.5, GAR.z1 - GAR.z0 + 3), '#5d6275', { x: (GAR.x0 + GAR.x1) / 2 - 0.5, y: 3.6, z: (GAR.z0 + GAR.z1) / 2 }));
        const gs = textPlane('', 6, { width: 600, height: 140, bg: '#ffd23f', fg: '#1b1b2f', lines: ['GARAJE ⬅'], font: 'Bangers', weight: 400 });
        gs.position.set(GAR.x1 + 0.6, 4.4, (GAR.z0 + GAR.z1) / 2); gs.rotation.y = E_; C.add(gs);
        C.box(GAR.x0 - 0.5, (GAR.z0 + GAR.z1) / 2, 1, GAR.z1 - GAR.z0 + 1);
        for (const z of [GAR.z0 - 0.5, GAR.z1 + 0.5]) C.box((GAR.x0 + GAR.x1) / 2 - 0.5, z, GAR.x1 - GAR.x0 + 1, 1);
        // --- Frenada: cartel de la línea -------------------------------------------------
        const bs = textPlane('', 4, { width: 512, height: 160, bg: '#e8173b', fg: '#ffffff', lines: ['¡PARA AQUÍ!'], font: 'Bangers', weight: 400 });
        bs.position.set(BRK.line + 1.5, 3, BRK.z + 5); bs.rotation.y = -E_; C.add(bs);
        C.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.6, 6), '#9aa3b5', { x: BRK.line + 1.5, y: 1.8, z: BRK.z + 5.1 }));
        C.finalize();

        // el coche
        const cfg = this.opts.players[0];
        const m = await buildCar(cfg);
        this.v = new Vehicle(m, physicsFor(cfg, m.dims), { name: 'Tú', color: '#ff4d8d' });
        this.v.isPlayer = true; this.v.slot = 'any'; this.v.pi = 0;
        engine.scene.add(this.v.root);
        this.FX = new Effects(engine.scene);
        this.cam = new ChaseCam(engine.camera); this.cam.target(this.v);
        this.tests = this._tests();
        this.state = 'ready';
    }

    // Marcas del suelo en una textura (1 px ≈ 6 cm)
    _paint() {
        const W = 2048, H = Math.round(2048 * (PAD.z1 - PAD.z0) / (PAD.x1 - PAD.x0));
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        const kx = W / (PAD.x1 - PAD.x0), kz = H / (PAD.z1 - PAD.z0);
        const X = x => (x - PAD.x0) * kx, Z = z => (z - PAD.z0) * kz;
        // asfalto con grano
        g.fillStyle = '#5d6275'; g.fillRect(0, 0, W, H);
        for (let i = 0; i < 9000; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(30,32,45,0.22)' : 'rgba(200,205,220,0.12)'; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
        const line = (x0, z0, x1, z1, col = '#ffffff', w = 0.18, dash = null) => {
            g.strokeStyle = col; g.lineWidth = w * kx; g.setLineDash(dash ? dash.map(d => d * kx) : []);
            g.beginPath(); g.moveTo(X(x0), Z(z0)); g.lineTo(X(x1), Z(z1)); g.stroke(); g.setLineDash([]);
        };
        const label = (txt, x, z, size = 2.4, col = '#ffd23f', rot = 0) => {
            g.save(); g.translate(X(x), Z(z)); g.rotate(rot);
            g.font = `400 ${size * kx}px Bangers, Fredoka, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
            g.lineWidth = size * kx * 0.12; g.strokeStyle = '#1b1b2f'; g.strokeText(txt, 0, 0);
            g.fillStyle = col; g.fillText(txt, 0, 0); g.restore();
        };
        // 1 · slalom: carril y puertas
        line(SL.start - 2, SL.z - 5.5, SL.end + 2, SL.z - 5.5); line(SL.start - 2, SL.z + 5.5, SL.end + 2, SL.z + 5.5);
        line(SL.start, SL.z - 5.5, SL.start, SL.z + 5.5, '#ffd23f', 0.4); line(SL.end, SL.z - 5.5, SL.end, SL.z + 5.5, '#2ee87a', 0.4);
        // rot: cómo leerlo según hacia dónde llega el coche (π/2 = hacia +x, π = hacia +z, −π/2 = hacia −x)
        label('1 · SLALOM', SL.start - 6, SL.z, 2.6, '#ffd23f', Math.PI / 2);
        // 2 · batería
        for (let i = 0; i <= BAY.n; i++) line(BAY.x0 + BAY.w * i, BAY.z0, BAY.x0 + BAY.w * i, BAY.z1);
        line(BAY.x0, BAY.z1, BAY.x0 + BAY.w * BAY.n, BAY.z1);
        const tx = BAY.x0 + BAY.w * (BAY.target + 0.5);
        g.fillStyle = 'rgba(255,77,141,0.45)'; g.fillRect(X(tx - BAY.w / 2 + 0.1), Z(BAY.z0), BAY.w * kx - 0.2 * kx, (BAY.z1 - BAY.z0) * kz);
        label('♥', tx, (BAY.z0 + BAY.z1) / 2, 3, '#ff4d8d');
        label('2 · BATERÍA', BAY.x0 + 6, BAY.z0 - 3, 2.4, '#ffd23f', Math.PI);
        // 3 · en línea: plaza entre los dos coches
        g.fillStyle = 'rgba(255,77,141,0.4)'; g.fillRect(X(PAR.x - 1.1), Z(PAR.zA + 1.5), 2.2 * kx, (PAR.zB - PAR.zA - 3) * kz);
        line(PAR.x - 1.2, PAR.zA - 8, PAR.x - 1.2, PAR.zB + 8, '#ffffff', 0.15, [1, 0.8]);
        label('3 · EN LÍNEA', PAR.x - 6, (PAR.zA + PAR.zB) / 2, 2.4, '#ffd23f', Math.PI);
        // 4 · garaje
        g.fillStyle = 'rgba(255,210,63,0.35)'; g.fillRect(X(GAR.x0), Z(GAR.z0), (GAR.x1 - GAR.x0) * kx, (GAR.z1 - GAR.z0) * kz);
        label('4 · GARAJE (MARCHA ATRÁS)', GAR.x1 + 12, GAR.z0 - 2.4, 2.1, '#ffd23f', -Math.PI / 2);
        // 5 · frenada
        line(BRK.x0, BRK.z - 3, BRK.line + 6, BRK.z - 3); line(BRK.x0, BRK.z + 3, BRK.line + 6, BRK.z + 3);
        line(BRK.line, BRK.z - 3, BRK.line, BRK.z + 3, '#e8173b', 0.5);
        for (const [x, t] of [[BRK.line - 1, '1'], [BRK.line - 2, '2']]) { line(x, BRK.z - 3, x, BRK.z + 3, 'rgba(255,255,255,0.5)', 0.08); label(t, x - 0.5, BRK.z - 2.2, 0.9, '#ffffff', Math.PI / 2); }
        label('5 · FRENADA', BRK.x0 + 6, BRK.z, 2.2, '#ffd23f', Math.PI / 2);
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
        return t;
    }

    _tests() {
        const v = () => this.v;
        const touches = () => this.touches;
        const stars3 = (t, a, b) => t <= a ? 3 : t <= b ? 2 : 1;
        const minus = (s) => Math.max(1, s - Math.floor(touches() / 2));
        return [
            {
                id: 'slalom', name: 'Slalom', emoji: '🚧',
                text: 'Zigzag entre los conos: el primero, por la izquierda, y luego alternando. ¡Sin tirarlos!',
                start: { x: SL.start - 6, z: SL.z, h: E_ },
                setup: () => { this.cones.forEach(c => { c.knocked = false; c.x = c.x0; c.z = c.z0; c.vx = c.vz = 0; c.m.position.set(c.x, 0, c.z); c.m.rotation.set(0, 0, 0); }); this.slI = 0; this.slT = null; },
                step: (dt) => {
                    const V = v();
                    if (this.slT === null) { if (V.x >= SL.start) { this.slT = 0; sfx('next'); } return null; }
                    this.slT += dt;
                    const c = SL.x[this.slI];
                    if (c !== undefined && V.x >= c) {
                        const left = this.slI % 2 === 0;          // rumbo este: la izquierda del coche es −z
                        const ok = left ? V.z < SL.z : V.z > SL.z;
                        if (!ok) return { fail: '¡Te has saltado un cono! Otra vez 🚧' };
                        this.slI++;
                    }
                    if (V.x >= SL.end && this.slI >= SL.x.length) {
                        const knocked = this.cones.filter(k => k.knocked).length;
                        const total = this.slT + knocked * 2;
                        return { ok: true, time: total, stars: stars3(total, 11, 15), info: `${fmt(this.slT)} + ${knocked} conos × 2 s` };
                    }
                    if (Math.abs(V.z - SL.z) > 9 || V.x > SL.end + 10) return { fail: 'Te has salido del carril del slalom 🙈' };
                    return null;
                }
            },
            {
                id: 'bateria', name: 'Aparcar en batería', emoji: '🅿️',
                text: 'Aparca en la plaza rosa ♥ entre los coches. Bien dentro y recto; para del todo.',
                start: { x: BAY.x0 - 6, z: 18, h: E_ },
                step: (dt) => {
                    const V = v(), tx = BAY.x0 + BAY.w * (BAY.target + 0.5), tz = (BAY.z0 + BAY.z1) / 2;
                    const inside = Math.abs(V.x - tx) < 0.75 && Math.abs(V.z - tz) < 1.1 && Math.abs(Math.sin(V.h)) < Math.sin(deg(12));
                    this.goal(tx, tz, inside);
                    if (inside && V.speed < 0.15) { this.holdT += dt; if (this.holdT > 0.7) return { ok: true, stars: minus(stars3(this.t, 14, 24)) }; } else this.holdT = 0;
                    return null;
                }
            },
            {
                id: 'linea', name: 'Aparcar en línea', emoji: '↩️',
                text: 'Aparca en línea entre los dos coches, pegado al bordillo de la derecha. Mejor marcha atrás 😉',
                start: { x: 42, z: -34, h: 0 },
                step: (dt) => {
                    const V = v(), tz = (PAR.zA + PAR.zB) / 2;
                    const room = (PAR.zB - PAR.zA) / 2 - 1.3 - V.model.dims.len / 2;
                    const inside = Math.abs(V.x - PAR.x) < 0.85 && Math.abs(V.z - tz) < Math.max(0.4, room + 0.6) && Math.abs(Math.sin(V.h)) < Math.sin(deg(10));
                    this.goal(PAR.x, tz, inside);
                    if (inside && V.speed < 0.15) { this.holdT += dt; if (this.holdT > 0.7) return { ok: true, stars: minus(stars3(this.t, 18, 32)) }; } else this.holdT = 0;
                    return null;
                }
            },
            {
                id: 'garaje', name: 'Marcha atrás al garaje', emoji: '🏠',
                text: 'Mete el coche en el garaje… ¡marcha atrás! Para del todo dentro, con el morro hacia fuera.',
                start: { x: -30, z: (GAR.z0 + GAR.z1) / 2, h: E_ },
                setup: () => { this.wasInside = false; },
                step: (dt) => {
                    const V = v();
                    const cx = (GAR.x0 + GAR.x1) / 2, cz = (GAR.z0 + GAR.z1) / 2;
                    const inside = V.x + V.model.dims.len / 2 < GAR.x1 + 0.3 && V.x > GAR.x0 && Math.abs(V.z - cz) < 2.3;
                    if (inside && !this.wasInside && V.vf > 0.5) return { fail: '¡De frente no! Tiene que ser marcha atrás 🔙' };
                    this.wasInside = inside;
                    const aligned = Math.abs(Math.cos(V.h - E_)) > Math.cos(deg(14)) && Math.sin(V.h) > 0;
                    this.goal(cx, cz, inside && aligned);
                    if (inside && aligned && V.speed < 0.15) { this.holdT += dt; if (this.holdT > 0.7) return { ok: true, stars: minus(stars3(this.t, 12, 22)) }; } else this.holdT = 0;
                    return null;
                }
            },
            {
                id: 'frenada', name: 'Frenada de precisión', emoji: '🛑',
                text: `Acelera hasta pasar de ${BRK.minKmh} km/h y frena para dejar el morro justo en la línea roja. ¡Sin pisarla!`,
                start: { x: BRK.x0 - 2, z: BRK.z, h: E_ },
                setup: () => { this.maxKmh = 0; },
                step: () => {
                    const V = v();
                    this.maxKmh = Math.max(this.maxKmh, V.kmh);
                    const front = V.x + V.model.dims.len / 2;
                    if (front > BRK.line + 0.15 && V.speed > 0.3) { if (front > BRK.line + 3) return { fail: '¡Te has pasado la línea! Otra vez 🛑' }; }
                    if (V.x > BRK.x0 + 6 && V.speed < 0.08 && this.t > 1) {
                        if (this.maxKmh < BRK.minKmh) return { fail: `Hay que pasar de ${BRK.minKmh} km/h antes de frenar 💨` };
                        const d = BRK.line - front;
                        if (d < -0.15) return { fail: `Has pisado la línea (${(-d * 100).toFixed(0)} cm) 😬` };
                        return { ok: true, stars: d < 0.35 ? 3 : d < 0.9 ? 2 : 1, info: `A ${(d * 100).toFixed(0)} cm de la línea` };
                    }
                    return null;
                }
            }
        ];
    }

    goal(x, z, ok) {
        if (!this.goalM) {
            this.goalM = mesh(new THREE.ConeGeometry(0.6, 1.2, 4), new THREE.MeshBasicMaterial({ color: '#ff4d8d', toneMapped: false }), { rx: Math.PI, shadow: false });
            this.C.add(this.goalM);
        }
        this.goalM.visible = true;
        this.goalM.position.set(x, 3.2 + Math.sin(this.app.engine.time * 3) * 0.2, z);
        this.goalM.rotation.y += 0.05;
        this.goalM.material.color.set(ok ? '#2ee87a' : '#ff4d8d');
    }

    _card(test, i) {
        let el = this.cardEl;
        if (!el) { el = this.cardEl = document.createElement('div'); el.className = 'gk-card'; this.app.hud.root.append(el); }
        el.innerHTML = `<b>${test.emoji} Prueba ${i + 1}/5 · ${test.name}</b><p>${test.text}</p>`;
        el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    }

    _start(i) {
        const T = this.tests[i];
        this.cur = i; this.t = 0; this.holdT = 0; this.touches = 0; this.failT = 0; this.pausedT = 0;
        if (T.setup) T.setup();
        this.v.reset(T.start.x, T.start.z, T.start.h);
        this.cam.snap();
        if (this.goalM) this.goalM.visible = false;
        this._card(T, i);
        const H = this.app.hud;
        H.set(0, 'test', `${i + 1}/5`); H.set(0, 'touch', '0'); H.set(0, 'time', fmt(0));
    }

    run() {
        const { engine, hud } = this.app;
        return new Promise(resolve => {
            this.resolve = resolve;
            this.results = [];
            hud.setup(1, { lap: false, best: false, title: '🅿️ Gymkhana', extra: [['test', 'Prueba'], ['touch', 'Toques']] });
            const pad = this.app.controls.pads().length > 0;
            hud.setHelp(pad ? '🎮 <b>RT</b>/<b>LT</b> acelerar y frenar (y marcha atrás) · <b>B</b> freno de mano · <b>Y</b> repetir la prueba · <b>Start</b> pausa'
                : '⌨️ <b>W A S D</b> / flechas · <b>S</b> mantenido = marcha atrás · <b>R</b> repetir la prueba · <b>Esc</b> pausa', 12000);
            this._start(0);
            this.state = 'run';
            if (window.sfx) sfx('music', 'day');
            this.off = engine.onUpdate((dt, t) => this.update(dt, t));
        });
    }

    update(dt, t) {
        const { controls, hud } = this.app;
        if (this.state !== 'run') { controls.endFrame(); return; }
        const inp = controls.read('any');
        if (inp.pressed.pause && this.onPause) { this.onPause(); controls.endFrame(); return; }
        if (inp.pressed.reset) { hud.msg(0, '↺ Otra vez', 'info', 1200); this._start(this.cur); }
        if (inp.pressed.horn) sfx('honk');
        const V = this.v;
        const n = Math.min(6, Math.ceil(dt / (1 / 60)));
        const before = V.hits || 0;
        const hold = this.pausedT > 0 || this.failT > 0;
        for (let k = 0; k < n; k++) V.step(dt / n, hold ? { thr: 0, brk: 1, steer: 0 } : inp, this.C, []);
        this.touchCool = Math.max(0, (this.touchCool || 0) - dt);
        if ((V.hits || 0) !== before && this.touchCool <= 0) { this.touches++; this.touchCool = 0.6; hud.set(0, 'touch', String(this.touches)); sfx('tap'); controls.rumble('any', 0.5, 120); }
        V.emit(dt, this.FX);
        this._cones(dt);
        if (this.pausedT > 0) { this.pausedT -= dt; if (this.pausedT <= 0) this._next(); }
        else if (this.failT > 0) { this.failT -= dt; if (this.failT <= 0) this._start(this.cur); }
        else {
            this.t += dt;
            hud.set(0, 'time', fmt(this.t));
            const r = this.tests[this.cur].step(dt);
            if (r && r.fail) { hud.msg(0, r.fail, 'bad', 2400); sfx('bad'); this.failT = 1.2; }
            else if (r && r.ok) this._done(r);
        }
        this.cam.update(dt, this.C);
        this.C.follow(V.root.position);
        this.C.update(dt, t, [{ pos: this.app.engine.camera.position, target: V.root.position }]);
        this.FX.update(dt);
        hud.dash(0, V);
        if (window.sfx) sfx('engine', Math.min(1, Math.abs(V.vf) / 20));
        controls.endFrame();
    }

    _cones(dt) {
        const V = this.v, fx = Math.sin(V.h), fz = Math.cos(V.h);
        for (const c of this.cones) {
            if (!c.knocked) {
                for (const C of V.circles) {
                    const cx = V.x + fx * C.lz, cz = V.z + fz * C.lz;
                    if (Math.hypot(cx - c.x, cz - c.z) < C.r + 0.42) {
                        c.knocked = true; c.vx = V.vx * 1.2 + (c.x - cx) * 3; c.vz = V.vz * 1.2 + (c.z - cz) * 3; c.spin = 6;
                        sfx('pop'); this.app.controls.rumble('any', 0.3, 80);
                        if (this.tests[this.cur].id === 'slalom') this.app.hud.msg(0, '🚧 ¡Cono al suelo! +2 s', 'bad', 1400);
                        break;
                    }
                }
            } else if (c.vx || c.vz) {
                c.x += c.vx * dt; c.z += c.vz * dt;
                const k = Math.max(0, 1 - dt * 3); c.vx *= k; c.vz *= k;
                if (Math.hypot(c.vx, c.vz) < 0.05) c.vx = c.vz = 0;
                c.m.position.set(c.x, 0, c.z);
                c.m.rotation.z = Math.min(Math.PI / 2, c.m.rotation.z + dt * c.spin);
                c.m.rotation.y += dt * c.spin * 0.5;
            }
        }
    }

    _done(r) {
        const T = this.tests[this.cur];
        const stars = '⭐'.repeat(r.stars) + '☆'.repeat(3 - r.stars);
        this.results.push({ ...r, name: T.name, emoji: T.emoji, time: r.time ?? this.t, touches: this.touches });
        // mejor marca
        try { const all = JSON.parse(localStorage.getItem(KEY) || '{}'); all[T.id] = Math.max(all[T.id] || 0, r.stars); localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* */ }
        this.app.hud.say(`${stars}  ${T.name}${r.info ? ' · ' + r.info : ''}`, 2600);
        sfx(r.stars === 3 ? 'fanfare' : 'good');
        this.pausedT = 2.4;
    }

    _next() {
        if (this.cur + 1 < this.tests.length) return this._start(this.cur + 1);
        this.state = 'over';
        const total = this.results.reduce((s, r) => s + r.stars, 0);
        if (window.confetti) window.confetti({ particleCount: 120, spread: 90, origin: { y: 0.6 } });
        this.resolve({
            mode: 'gymkhana',
            title: total >= 13 ? '¡Gymkhana de matrícula! 🏆' : total >= 9 ? '¡Gymkhana superada! 🎉' : 'Gymkhana completada 🚗',
            html: `<p class="stars">${'⭐'.repeat(Math.round(total / 3))}</p><table>${this.results.map(r => `<tr><td>${r.emoji} ${r.name}</td><td>${'⭐'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}</td><td class="t">${fmt(r.time)}</td></tr>`).join('')}</table><p><b>${total}/15 estrellas</b></p>`
        });
    }

    pause(on) { if (on && this.state === 'run') this.state = 'paused'; else if (!on && this.state === 'paused') this.state = 'run'; }

    dispose() {
        const { engine, hud } = this.app;
        if (this.off) this.off();
        if (this.v) engine.scene.remove(this.v.root);
        if (this.cardEl) this.cardEl.remove();
        this.FX && this.FX.dispose();
        this.C && this.C.dispose();
        hud.hide();
        sfx('engine', 0);
    }
}
