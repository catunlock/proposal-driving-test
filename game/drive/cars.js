// ============================================================================
//  GARAJE: los coches que se pueden elegir y su tuneo
// ============================================================================
// Los coches de Kenney traen las ruedas como piezas separadas (pivote en el centro, radio 0,3),
// así que se pueden agrandar, separar y subir la carrocería de verdad. El Tesla es una sola malla:
// solo se puede estirar (largo y ancho) y pintar.
//
// Cada ajuste cambia la conducción (physicsFor):
//   ruedas grandes  → más altura libre y más punta, pero menos agarre y menos aceleración
//   vía ancha       → más agarre y estabilidad
//   suspensión alta → monster truck: pasa por encima de migas, lápices y piedras, pero vuelca… de lado
//   coche largo     → más estable y algo más rápido, pero gira peor
import * as THREE from 'three';
import { loadModel, toon } from '../assets.js';
import { parkedTesla } from '../car.js';

export const CARS = [
    { id: 'tesla', name: 'Tesla Model 3', model: 'tesla', mass: 1.15, power: 1.18, top: 1.06, grip: 1.05, color: '#f4f6fb', fixed: true, desc: 'Eléctrico: sale disparado en cada semáforo.' },
    { id: 'sport', name: 'Deportivo', model: 'car/hatchback-sports', mass: 0.85, power: 1.05, top: 1.12, grip: 1.15, color: '#e8173b', desc: 'Ligero, rápido y pegado al suelo.' },
    { id: 'sedan', name: 'Sedán', model: 'car/sedan', mass: 1, power: 1, top: 1, grip: 1, color: '#2f6fe0', desc: 'El de toda la vida: equilibrado.' },
    { id: 'taxi', name: 'Taxi', model: 'car/taxi', mass: 1, power: 0.98, top: 1.02, grip: 1, color: '#ffd23f', desc: 'Conoce todos los atajos de la ciudad.' },
    { id: 'police', name: 'Policía', model: 'car/police', mass: 1.05, power: 1.08, top: 1.08, grip: 1.02, color: '#1e2130', noPaint: true, desc: 'Motor preparado para las persecuciones.' },
    { id: 'suv', name: 'Todoterreno', model: 'car/suv', mass: 1.3, power: 1.05, top: 0.95, grip: 0.95, color: '#2f9e44', desc: 'Alto y robusto: no le asustan las migas.' },
    { id: 'van', name: 'Furgoneta', model: 'car/van', mass: 1.45, power: 0.92, top: 0.9, grip: 0.92, color: '#ff7a2b', desc: 'Cabe toda la mudanza… y gira como un sofá.' },
    { id: 'delivery', name: 'Camión de reparto', model: 'car/delivery', mass: 1.8, power: 0.9, top: 0.86, grip: 0.88, color: '#8e5bd8', desc: 'El más grande: lo que embiste, se aparta.' }
];
export const carDef = id => CARS.find(c => c.id === id) || CARS[0];

export const TUNING = {
    wheels: { min: 0.7, max: 2.0, step: 0.05, def: 1, label: 'Ruedas', icon: '🛞' },
    track: { min: 0.85, max: 1.35, step: 0.05, def: 1, label: 'Ancho de vía', icon: '↔️' },
    lift: { min: 0, max: 1, step: 0.05, def: 0, label: 'Suspensión', icon: '⬆️' },
    length: { min: 0.8, max: 1.3, step: 0.05, def: 1, label: 'Largo', icon: '📏' }
};
export const COLORS = ['#f4f6fb', '#1e2130', '#e8173b', '#ff4d8d', '#ff7a2b', '#ffd23f', '#2f9e44', '#20c4b0', '#2f6fe0', '#8e5bd8', '#9aa3b5', '#6b4a2b'];

export function defaultConfig(id = 'tesla') {
    const d = carDef(id);
    const tune = {};
    for (const [k, t] of Object.entries(TUNING)) tune[k] = t.def;
    return { id: d.id, color: d.color, tune };
}

// Física de un coche con su tuneo (unidades del mundo: el Tesla mide 2,6; 1 u/s ≈ 6,5 km/h)
export function physicsFor(cfg, dims) {
    const def = carDef(cfg.id), t = cfg.tune;
    const w = def.fixed ? 1 : t.wheels, tr = t.track, lift = def.fixed ? 0 : t.lift, L = t.length;
    const mass = def.mass * (0.8 + 0.2 * L) * (0.9 + 0.1 * tr) * (1 + 0.14 * (w - 1) + 0.1 * lift);
    return {
        mass,
        maxV: 17 * def.top * (1 + 0.16 * (w - 1)) * (1 - 0.06 * lift) * (0.95 + 0.07 * L),
        accel: 10.5 * def.power / Math.sqrt(mass) * (1 - 0.12 * (w - 1)),
        brake: 22,
        grip: def.grip * (1 + 0.45 * (tr - 1)) * (1 - 0.2 * (w - 1)) * (1 - 0.18 * lift),
        steerMax: 0.62 * (1 - 0.3 * (L - 1)),
        wheelbase: dims.wheelbase,
        clearance: dims.clearance,
        len: dims.len, wid: dims.wid
    };
}

// Barras del garaje (0..1)
export function statsFor(cfg, dims) {
    const p = physicsFor(cfg, dims);
    const c = x => THREE.MathUtils.clamp(x, 0.04, 1);
    return {
        Velocidad: c((p.maxV - 12) / 12),
        Aceleración: c((p.accel - 6) / 7),
        Giro: c((p.steerMax / p.wheelbase - 0.25) / 0.25),
        Agarre: c((p.grip - 0.55) / 0.85),
        'Altura libre': c(p.clearance / 1.25)
    };
}

// ----------------------------------------------------------------------------
//  Pintura: en los coches de Kenney todo sale de una paleta (una textura con casillas de color).
//  Se separan los triángulos de la carrocería (el color dominante de la paleta) en otro material.
// ----------------------------------------------------------------------------
const splitCache = new Map();
function texelReader(tex) {
    const img = tex && tex.image;
    if (!img || !img.width) return null;
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height).data;
    return (u, v) => {
        const x = THREE.MathUtils.clamp(Math.floor(u * c.width), 0, c.width - 1);
        const y = THREE.MathUtils.clamp(Math.floor(v * c.height), 0, c.height - 1);     // glTF: v hacia abajo
        const i = (y * c.width + x) * 4;
        return [data[i], data[i + 1], data[i + 2]];
    };
}
function splitPaint(geo, tex) {
    if (splitCache.has(geo.uuid)) return splitCache.get(geo.uuid);
    const read = texelReader(tex);
    let res = null;
    if (read && geo.index && geo.attributes.uv) {
        const uv = geo.attributes.uv, pos = geo.attributes.position, idx = geo.index.array;
        const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
        const tris = [];
        const area = new Map();
        for (let i = 0; i < idx.length; i += 3) {
            const u = (uv.getX(idx[i]) + uv.getX(idx[i + 1]) + uv.getX(idx[i + 2])) / 3;
            const v = (uv.getY(idx[i]) + uv.getY(idx[i + 1]) + uv.getY(idx[i + 2])) / 3;
            const [r, g, bb] = read(u, v);
            const key = (r << 16) | (g << 8) | bb;
            a.fromBufferAttribute(pos, idx[i]); b.fromBufferAttribute(pos, idx[i + 1]); c.fromBufferAttribute(pos, idx[i + 2]);
            const A = b.sub(a).cross(c.sub(a)).length() / 2;
            tris.push(key);
            area.set(key, (area.get(key) || 0) + A);
        }
        // El color de la carrocería. La paleta trae el sombreado horneado (cada cara, un tono algo
        // distinto), así que se agrupa por tono: gana el tono vivo con más superficie; si no hay uno
        // claro (coche patrulla, blanco y negro), los blancos.
        const hsl = new Map(), total = [...area.values()].reduce((s, a) => s + a, 0);
        for (const key of area.keys()) hsl.set(key, new THREE.Color((key >> 16) / 255, ((key >> 8) & 255) / 255, (key & 255) / 255).getHSL({}));
        const vivid = k => { const c = hsl.get(k); return c.s > 0.22 && c.l > 0.2 && c.l < 0.86; };
        const bins = new Float32Array(24);
        for (const [k, A] of area) if (vivid(k)) bins[Math.floor(hsl.get(k).h * 24) % 24] += A;
        let bi = -1, bA = 0;
        for (let b = 0; b < 24; b++) { const A = bins[b] + 0.6 * (bins[(b + 23) % 24] + bins[(b + 1) % 24]); if (A > bA) { bA = A; bi = b; } }
        let isPaint;
        if (bi >= 0 && bA > total * 0.12) {
            const hc = (bi + 0.5) / 24;
            isPaint = k => { if (!vivid(k)) return false; let d = Math.abs(hsl.get(k).h - hc); d = Math.min(d, 1 - d); return d < 1.6 / 24; };
        } else isPaint = k => hsl.get(k).l > 0.6 && hsl.get(k).s < 0.25;
        const rest = [], paint = [];
        for (let t = 0; t < tris.length; t++) (isPaint(tris[t]) ? paint : rest).push(idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]);
        if (paint.length) {
            const g2 = geo.clone();
            g2.setIndex([...rest, ...paint]);
            g2.clearGroups();
            g2.addGroup(0, rest.length, 0);
            g2.addGroup(rest.length, paint.length, 1);
            res = g2;
        }
    }
    splitCache.set(geo.uuid, res);
    return res;
}

const R0 = 0.3;              // radio de las ruedas de Kenney (en el modelo)

async function kenneyCar(def, cfg) {
    const src = await loadModel(def.model);
    const car = src.clone(true);
    const t = cfg.tune;
    const w = t.wheels, tr = t.track, lift = t.lift, L = t.length;
    const paintMat = toon(cfg.color, { emissive: new THREE.Color(cfg.color), emissiveIntensity: 0.08 });
    const wheels = [];
    const body = new THREE.Group();
    for (const n of [...car.children]) {
        if (/^wheel-(front|back)-(left|right)$/.test(n.name)) {
            wheels.push({ node: n, front: n.name.includes('front'), left: n.name.includes('left'), base: n.position.clone() });
        } else body.add(n);
    }
    body.traverse(o => {
        if (!o.isMesh || def.noPaint) return;                      // la policía lleva su librea oficial
        const g2 = splitPaint(o.geometry, o.material.map);
        if (g2) { o.geometry = g2; o.material = [o.material, paintMat]; }
    });
    const bb = new THREE.Box3().setFromObject(body);
    const bodyLen = bb.max.z - bb.min.z, bodyWid = bb.max.x - bb.min.x;
    // Tuneo
    body.scale.set(1 + (tr - 1) * 0.3, 1 + lift * 0.08, L);
    body.position.y = R0 * (w - 1) + lift * 0.6;
    let zf = -Infinity, zb = Infinity, outer = 0;
    const holder = new THREE.Group();
    holder.add(body);
    for (const W of wheels) {
        const sx = Math.sign(W.base.x) || 1;
        // las ruedas se abren con la vía y, al crecer, también hacia fuera para no meterse en la carrocería
        const x = sx * (Math.abs(W.base.x) + (tr - 1) * 0.75 + Math.max(0, w - 1) * 0.12);
        const z = W.base.z * L;
        W.node.scale.setScalar(w);
        W.node.position.set(x, R0 * w, z);
        W.spin = new THREE.Group();          // pivote de dirección (y) → giro de la rueda (x)
        W.spin.position.copy(W.node.position);
        W.node.position.set(0, 0, 0);
        W.spin.add(W.node);
        holder.add(W.spin);
        zf = Math.max(zf, z); zb = Math.min(zb, z);
        outer = Math.max(outer, Math.abs(x) + 0.3 * w);
    }
    const dims = {
        len: Math.max(bodyLen * L, (zf - zb) + 2 * R0 * w),
        wid: Math.max(bodyWid * (1 + (tr - 1) * 0.3), outer * 2),
        height: (bb.max.y - bb.min.y) * (1 + lift * 0.08) + body.position.y,
        wheelbase: Math.max(0.8, zf - zb),
        wheelR: R0 * w,
        clearance: 0.15 + body.position.y
    };
    return { group: holder, body, wheels, dims, paint: [paintMat] };
}

async function teslaCar(def, cfg, lod) {
    const holder = await parkedTesla(cfg.color, { full: !lod });
    const t = cfg.tune;
    holder.scale.set(t.track, 1, t.length);
    const bb = new THREE.Box3().setFromObject(holder, true);
    const s = bb.getSize(new THREE.Vector3());
    const body = new THREE.Group();
    body.add(holder);
    return {
        group: body, body: holder, wheels: [],
        dims: { len: s.z, wid: s.x, height: s.y, wheelbase: s.z * 0.62, wheelR: 0.33, clearance: 0.15 },
        paint: []
    };
}

// Modelo listo para conducir: { group, body, wheels: [{ spin, node, front, left }], dims }
// lod: versión ligera (rivales de la IA, fantasma)
export async function buildCar(cfg, { lod = false } = {}) {
    const def = carDef(cfg.id);
    const m = def.fixed ? await teslaCar(def, cfg, lod) : await kenneyCar(def, cfg);
    m.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    m.def = def;
    m.cfg = cfg;
    return m;
}

// Fantasma: mismo coche, translúcido
export function ghostify(m, color = '#bfe8ff') {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, depthWrite: false });
    m.group.traverse(o => { if (o.isMesh) { o.material = Array.isArray(o.material) ? o.material.map(() => mat) : mat; o.castShadow = false; } });
}

// Configuración guardada en el navegador
const KEY = 'drive.car.v1';
export function loadConfig(slot = 'p1') {
    try {
        const all = JSON.parse(localStorage.getItem(KEY) || '{}');
        const c = all[slot];
        if (c && carDef(c.id).id === c.id) return { ...defaultConfig(c.id), ...c, tune: { ...defaultConfig(c.id).tune, ...c.tune } };
    } catch (e) { /* sin almacenamiento */ }
    return defaultConfig(slot === 'p2' ? 'sport' : 'tesla');
}
export function saveConfig(cfg, slot = 'p1') {
    try {
        const all = JSON.parse(localStorage.getItem(KEY) || '{}');
        all[slot] = cfg;
        localStorage.setItem(KEY, JSON.stringify(all));
    } catch (e) { /* sin almacenamiento */ }
}
