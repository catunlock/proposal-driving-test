// Vegetación procedural: árboles con copas orgánicas, colores con degradado y viento suave.
// Cada especie tiene varias variantes; se reparten con InstancedMesh (una llamada de dibujo por variante y tramo).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const windUniforms = { uTime: { value: 0 } };
export function updateWind(t) { windUniforms.uTime.value = t; }

// Material con colores por vértice y balanceo con el viento (la copa se mueve más que la base)
let treeMat = null;
export function treeMaterial() {
    if (treeMat) return treeMat;
    treeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    treeMat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = windUniforms.uTime;
        shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            #ifdef USE_INSTANCING
                vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
            #else
                vec2 ip = vec2(0.0);
            #endif
            float sway = max(position.y - 0.4, 0.0);
            float ph = uTime * 1.3 + ip.x * 0.11 + ip.y * 0.07;
            transformed.x += sin(ph) * 0.035 * sway;
            transformed.z += cos(ph * 0.8) * 0.025 * sway;`
        );
        // un poco de luz propia: la vegetación no se queda negra de noche ni en sombra
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <emissivemap_fragment>',
            '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * 0.14;'
        );
    };
    treeMat.customProgramCacheKey = () => 'tree-wind';
    return treeMat;
}

// Material sin viento (rocas)
let staticMat = null;
export function treeMaterialStatic() {
    if (!staticMat) staticMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    return staticMat;
}

// Aleatorio con semilla
function rng(seed) {
    return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

// Fusión segura: todas las piezas sin índice y con los mismos atributos (posición, normal, color)
function merge(parts) {
    const clean = parts.map(p => {
        let g = p.index ? p.toNonIndexed() : p;
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
        if (!g.attributes.normal) g.computeVertexNormals();
        return g;
    });
    return mergeGeometries(clean, false);
}

const tmpC = new THREE.Color();
function paint(geo, fn) {
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
        fn(tmpC, pos.getX(i), pos.getY(i), pos.getZ(i));
        col[i * 3] = tmpC.r; col[i * 3 + 1] = tmpC.g; col[i * 3 + 2] = tmpC.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
}

// Bola de hojas irregular (icosaedro deformado) con degradado: sombra abajo, luz arriba
function blob(r, center, colors, R, detail = 1) {
    const g = new THREE.IcosahedronGeometry(r, detail);
    const pos = g.attributes.position;
    // deformar (mismo ruido para vértices coincidentes → sin grietas)
    const key = (x, y, z) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    const off = new Map();
    for (let i = 0; i < pos.count; i++) {
        const k = key(pos.getX(i), pos.getY(i), pos.getZ(i));
        if (!off.has(k)) off.set(k, 0.82 + R() * 0.32);
        const f = off.get(k);
        pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * 0.88, pos.getZ(i) * f);
    }
    g.translate(center.x, center.y, center.z);
    g.computeVertexNormals();
    const [dark, mid, light] = colors;
    return paint(g, (c, x, y, z) => {
        const k = THREE.MathUtils.clamp((y - (center.y - r)) / (2 * r), 0, 1);
        c.copy(dark).lerp(mid, Math.min(1, k * 1.6));
        if (k > 0.6) c.lerp(light, (k - 0.6) / 0.4 * 0.8);
        const n = 0.92 + 0.16 * Math.sin(x * 7.1 + z * 5.3 + y * 3.7);
        c.multiplyScalar(n);
    });
}

function trunk(h, r0, r1, color, bend = 0, segs = 6) {
    const g = new THREE.CylinderGeometry(r1, r0, h, segs, 4);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) + h / 2;
        pos.setX(i, pos.getX(i) + bend * (y / h) * (y / h));
        pos.setY(i, y);
    }
    g.computeVertexNormals();
    const base = new THREE.Color(color);
    return paint(g, (c, x, y) => c.copy(base).multiplyScalar(0.8 + 0.25 * (y / h)));
}

const C = (h) => new THREE.Color(h);
const PALETTES = {
    oak: [[C('#2f6b2c'), C('#4f9a3c'), C('#9fd36a')], [C('#356f2a'), C('#5aa344'), C('#b4dc7a')], [C('#2c5f34'), C('#468f45'), C('#8cc46a')]],
    olive: [[C('#4f6b46'), C('#7d9a6a'), C('#b8c99a')]],
    pine: [[C('#1f4a33'), C('#2f6b47'), C('#5f9a63')], [C('#1c4430'), C('#2a6142'), C('#4f8a5a')]],
    umbrella: [[C('#2a5a2c'), C('#3f7f3a'), C('#86b863')]],
    cypress: [[C('#1d4428'), C('#2c5e35'), C('#4f8650')]],
    palm: [[C('#2f7a3a'), C('#4fa64a'), C('#9bd46a')]],
    night: [[C('#173a2c'), C('#24543c'), C('#3f7a52')]],
    almond: [[C('#e7a3bd'), C('#f6c7d8'), C('#fff1f6')], [C('#e9b7c8'), C('#f9dbe6'), C('#ffffff')]]
};

// --- Especies ------------------------------------------------------------------------
function oakTree(seed, pal = PALETTES.oak) {
    const R = rng(seed);
    const h = 1.6 + R() * 0.8;
    const parts = [trunk(h, 0.16, 0.09, '#7a5236', (R() - 0.5) * 0.3)];
    // ramas
    const colors = pal[Math.floor(R() * pal.length)];
    const n = 5 + Math.floor(R() * 3);
    const top = new THREE.Vector3(0, h + 0.35, 0);
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + R() * 0.6;
        const d = i === 0 ? 0 : 0.45 + R() * 0.35;
        const c = top.clone().add(new THREE.Vector3(Math.cos(a) * d, (i === 0 ? 0.35 : R() * 0.4 - 0.1), Math.sin(a) * d));
        parts.push(blob(0.55 + R() * 0.3, c, colors, R));
    }
    return merge(parts);
}

function oliveTree(seed) {
    const R = rng(seed);
    const parts = [];
    // tronco retorcido doble
    for (let k = 0; k < 2; k++) {
        const t = trunk(1.1 + R() * 0.3, 0.13, 0.08, '#8a7a66', (k ? 1 : -1) * (0.25 + R() * 0.2), 6);
        parts.push(t);
    }
    for (let i = 0; i < 6; i++) {
        const a = R() * Math.PI * 2, d = 0.3 + R() * 0.45;
        parts.push(blob(0.38 + R() * 0.18, new THREE.Vector3(Math.cos(a) * d, 1.35 + R() * 0.35, Math.sin(a) * d), PALETTES.olive[0], R));
    }
    return merge(parts);
}

function pineTree(seed, pal = PALETTES.pine) {
    const R = rng(seed);
    const h = 0.6 + R() * 0.3;
    const parts = [trunk(h + 0.6, 0.12, 0.06, '#6b4630')];
    const colors = pal[Math.floor(R() * pal.length)];
    const layers = 4 + Math.floor(R() * 2);
    for (let i = 0; i < layers; i++) {
        const k = i / layers;
        const r = (1 - k) * 0.95 + 0.25;
        const cone = new THREE.ConeGeometry(r, 0.95, 9, 2);
        // capas con bordes irregulares y "caídos"
        const pos = cone.attributes.position;
        for (let j = 0; j < pos.count; j++) {
            const y = pos.getY(j);
            if (y < -0.4) { const f = 0.9 + R() * 0.25; pos.setX(j, pos.getX(j) * f); pos.setZ(j, pos.getZ(j) * f); pos.setY(j, y - R() * 0.12); }
        }
        cone.translate(0, h + 0.4 + i * 0.55, 0);
        cone.computeVertexNormals();
        const [dark, mid, light] = colors;
        paint(cone, (c, x, y, z) => {
            const local = (y - (h + 0.4 + i * 0.55) + 0.475) / 0.95;
            c.copy(dark).lerp(mid, local).lerp(light, Math.max(0, local - 0.7) * 0.8);
            c.multiplyScalar(0.92 + 0.12 * Math.sin(x * 9 + z * 7));
        });
        parts.push(cone);
    }
    return merge(parts);
}

// Pino piñonero (pi pinyer): tronco alto e inclinado y copa ancha y plana
function umbrellaPine(seed) {
    const R = rng(seed);
    const h = 2.4 + R() * 0.7;
    const bend = (R() - 0.5) * 0.7;
    const parts = [trunk(h, 0.15, 0.08, '#8a5a3a', bend, 6)];
    const colors = PALETTES.umbrella[0];
    const top = new THREE.Vector3(bend, h + 0.15, 0);
    for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + R() * 0.4, d = i === 0 ? 0 : 0.55 + R() * 0.35;
        const b = blob(0.5 + R() * 0.15, top.clone().add(new THREE.Vector3(Math.cos(a) * d, R() * 0.12, Math.sin(a) * d)), colors, R);
        b.scale(1, 0.55, 1);
        parts.push(b);
    }
    // corregir la altura tras aplastar
    const merged = merge(parts.slice(1));
    merged.translate(0, (h + 0.15) * 0.45, 0);
    return merge([parts[0], merged]);
}

// Ciprés: alto, estrecho y oscuro (muy mediterráneo)
function cypress(seed) {
    const R = rng(seed);
    const h = 2.6 + R() * 1.2;
    const parts = [trunk(0.4, 0.08, 0.07, '#5a3d2a')];
    const g = new THREE.SphereGeometry(0.42, 10, 12);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const k = (y + 0.42) / 0.84;           // 0 abajo, 1 arriba
        const taper = Math.sin(Math.min(1, k * 1.15) * Math.PI * 0.5 + 0.35) * (1 - k * 0.55);
        const jitter = 0.9 + R() * 0.2;
        pos.setXYZ(i, pos.getX(i) * taper * jitter, 0.3 + k * h, pos.getZ(i) * taper * jitter);
    }
    g.computeVertexNormals();
    const [dark, mid, light] = PALETTES.cypress[0];
    paint(g, (c, x, y, z) => { const k = (y - 0.3) / h; c.copy(dark).lerp(mid, k).lerp(light, Math.max(0, k - 0.75)); c.multiplyScalar(0.9 + 0.15 * Math.sin(y * 9 + x * 13)); });
    parts.push(g);
    return merge(parts);
}

// Palmera: tronco curvado con anillos y hojas arqueadas
function palmTree(seed) {
    const R = rng(seed);
    const h = 2.8 + R() * 0.8;
    const bend = 0.5 + R() * 0.6;
    const t = trunk(h, 0.14, 0.1, '#a07850', bend, 7);
    paint(t, (c, x, y) => c.set('#a07850').multiplyScalar(0.85 + 0.2 * ((Math.floor(y * 6) % 2))));
    const parts = [t];
    const top = new THREE.Vector3(bend, h, 0);
    const [dark, mid, light] = PALETTES.palm[0];
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + R() * 0.3;
        // hoja: tira arqueada con anchura en el centro
        const segs = 8, len = 1.3 + R() * 0.3;
        const pts = [], idx = [];
        for (let j = 0; j <= segs; j++) {
            const u = j / segs;
            const w = Math.sin(u * Math.PI) * 0.22;
            const d = u * len, y = Math.sin(u * Math.PI * 0.8) * 0.45 - u * u * 0.6;
            for (const sgn of [-1, 1]) {
                pts.push(top.x + Math.cos(a) * d - Math.sin(a) * w * sgn, top.y + y + (sgn > 0 ? 0.02 : 0), top.z + Math.sin(a) * d + Math.cos(a) * w * sgn);
            }
            if (j > 0) { const b = j * 2; idx.push(b - 2, b - 1, b, b - 1, b + 1, b); }
        }
        const leaf = new THREE.BufferGeometry();
        leaf.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        leaf.setIndex(idx);
        leaf.computeVertexNormals();
        paint(leaf, (c, x, y) => c.copy(mid).lerp(light, THREE.MathUtils.clamp((y - top.y) * 1.5 + 0.3, 0, 1)).lerp(dark, 0.15));
        // las hojas son de una cara: duplicar invertidas para verlas por debajo
        const back = leaf.clone();
        const bi = back.index.array;
        for (let k = 0; k < bi.length; k += 3) [bi[k + 1], bi[k + 2]] = [bi[k + 2], bi[k + 1]];
        back.computeVertexNormals();
        parts.push(leaf, back);
    }
    return merge(parts);
}

// Mata de hierba (3 hojas cruzadas)
function grassTuft(seed) {
    const R = rng(seed);
    const pts = [], cols = [];
    const base = new THREE.Color('#4f8f3a'), tip = new THREE.Color('#b9df7a');
    for (let i = 0; i < 7; i++) {
        const a = R() * Math.PI, h = 0.25 + R() * 0.25, w = 0.05;
        const lean = (R() - 0.5) * 0.15;
        const cx = (R() - 0.5) * 0.25, cz = (R() - 0.5) * 0.25;
        const dx = Math.cos(a) * w, dz = Math.sin(a) * w;
        pts.push(cx - dx, 0, cz - dz, cx + dx, 0, cz + dz, cx + lean, h, cz + lean * 0.5);
        cols.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    // normales hacia arriba: la hierba se ilumina como el suelo
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    return g;
}

function bush(seed) {
    const R = rng(seed);
    const parts = [];
    for (let i = 0; i < 4; i++) {
        const a = R() * Math.PI * 2, d = R() * 0.3;
        parts.push(blob(0.28 + R() * 0.12, new THREE.Vector3(Math.cos(a) * d, 0.22, Math.sin(a) * d), PALETTES.oak[i % 3], R, 1));
    }
    return merge(parts);
}

// Roca: piedra gris deformada con un poco de musgo arriba
function rockStone(seed) {
    const R = rng(seed);
    const parts = [];
    const n = 1 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) {
        const r = 0.35 + R() * 0.35;
        const g = new THREE.IcosahedronGeometry(r, 1);
        const pos = g.attributes.position;
        const key = (x, y, z) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
        const off = new Map();
        for (let j = 0; j < pos.count; j++) {
            const k = key(pos.getX(j), pos.getY(j), pos.getZ(j));
            if (!off.has(k)) off.set(k, 0.75 + R() * 0.4);
            const f = off.get(k);
            pos.setXYZ(j, pos.getX(j) * f * 1.2, Math.max(pos.getY(j) * f * 0.75, -0.05), pos.getZ(j) * f);
        }
        g.translate((R() - 0.5) * 0.6, r * 0.35, (R() - 0.5) * 0.6);
        g.computeVertexNormals();
        const grey = new THREE.Color('#8f8c86'), dark = new THREE.Color('#6f6c67'), moss = new THREE.Color('#6f9a4a');
        paint(g, (c, x, y, z) => {
            c.copy(dark).lerp(grey, THREE.MathUtils.clamp(y / (r * 0.9), 0, 1));
            if (y > r * 0.55) c.lerp(moss, 0.55);
            c.multiplyScalar(0.92 + 0.14 * Math.sin(x * 11 + z * 7));
        });
        parts.push(g);
    }
    return merge(parts);
}

// Naranjo: copa redonda y compacta, con naranjas
function orangeTree(seed) {
    const R = rng(seed);
    const parts = [trunk(0.7, 0.1, 0.07, '#6b4a30')];
    const colors = [C('#24572a'), C('#357a35'), C('#5fa64a')];
    for (let i = 0; i < 4; i++) {
        const a = R() * Math.PI * 2, d = i === 0 ? 0 : 0.25 + R() * 0.15;
        parts.push(blob(0.5 + R() * 0.12, new THREE.Vector3(Math.cos(a) * d, 1.15 + R() * 0.2, Math.sin(a) * d), colors, R));
    }
    const orange = C('#ff9214');
    for (let i = 0; i < 14; i++) {
        const th = R() * Math.PI * 2, ph = 0.3 + R() * 1.2, r = 0.62;
        const o = new THREE.IcosahedronGeometry(0.07, 0);
        o.translate(Math.cos(th) * Math.sin(ph) * r, 1.2 + Math.cos(ph) * r * 0.85, Math.sin(th) * Math.sin(ph) * r);
        paint(o, (c) => c.copy(orange));
        parts.push(o);
    }
    return merge(parts);
}

// Cepa de viña sobre su estaca
function vine(seed) {
    const R = rng(seed);
    const parts = [trunk(0.7, 0.03, 0.03, '#7a5a3c', 0, 4)];
    const colors = [C('#3f6f2a'), C('#5f9a3a'), C('#a5c95a')];
    for (let i = 0; i < 3; i++) parts.push(blob(0.2 + R() * 0.06, new THREE.Vector3((R() - 0.5) * 0.3, 0.55 + R() * 0.15, (R() - 0.5) * 0.15), colors, R, 0));
    const grape = C('#5b2a6e');
    for (let i = 0; i < 3; i++) { const g = new THREE.IcosahedronGeometry(0.05, 0); g.translate((R() - 0.5) * 0.3, 0.4, 0.12); paint(g, c => c.copy(grape)); parts.push(g); }
    return merge(parts);
}

// Girasol
function sunflower(seed) {
    const R = rng(seed);
    const h = 0.9 + R() * 0.35;
    const stem = trunk(h, 0.025, 0.02, '#4f7f2a', (R() - 0.5) * 0.1, 4);
    const leaf = new THREE.IcosahedronGeometry(0.12, 0); leaf.scale(1.4, 0.3, 0.8); leaf.translate(0.1, h * 0.5, 0);
    paint(leaf, c => c.set('#4f8a2a'));
    const petals = new THREE.CylinderGeometry(0.2, 0.2, 0.03, 12); petals.rotateX(Math.PI / 2 - 0.35); petals.translate(0, h, 0.03);
    paint(petals, c => c.set('#ffcc1f'));
    const disc = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 10); disc.rotateX(Math.PI / 2 - 0.35); disc.translate(0, h + 0.005, 0.05);
    paint(disc, c => c.set('#5a3416'));
    return merge([stem, leaf, petals, disc]);
}

// Tulipán (rojo o rosa)
function tulip(seed) {
    const R = rng(seed);
    const h = 0.45 + R() * 0.15;
    const stem = trunk(h, 0.018, 0.015, '#4f8a2a', 0, 4);
    const cup = new THREE.CylinderGeometry(0.075, 0.035, 0.13, 6); cup.translate(0, h + 0.05, 0);
    const col = R() < 0.75 ? '#e8173b' : '#ff5d8f';
    paint(cup, c => c.set(col));
    return merge([stem, cup]);
}

// Mata de trigo: tallos finos con espiga dorada (se mece con el viento)
function wheat(seed) {
    const R = rng(seed);
    const parts = [];
    const stalk = C('#c9a43a'), ear = C('#f3d36e'), base = C('#a3a84a');
    for (let i = 0; i < 12; i++) {
        const h = 0.7 + R() * 0.3, a = R() * Math.PI * 2, r = Math.sqrt(R()) * 0.22;
        const x = Math.cos(a) * r, z = Math.sin(a) * r, lean = (R() - 0.5) * 0.18;
        const st = new THREE.CylinderGeometry(0.008, 0.012, h, 3, 1, true);
        st.translate(0, h / 2, 0); st.rotateZ(lean); st.translate(x, 0, z);
        paint(st, (c, px, py) => c.copy(base).lerp(stalk, Math.min(1, py / h)));
        const e = new THREE.CylinderGeometry(0.024, 0.014, 0.2, 4, 1);
        e.translate(0, h + 0.08, 0); e.rotateZ(lean); e.translate(x, 0, z);
        paint(e, c => c.copy(ear));
        parts.push(st, e);
    }
    return merge(parts);
}

const BUILDERS = { almond: (s) => oakTree(s, PALETTES.almond), wheat, orange: orangeTree, vine, sunflower, tulip, rock: rockStone, oak: oakTree, olive: oliveTree, pine: pineTree, umbrella: umbrellaPine, cypress, palm: palmTree, grass: grassTuft, bush, nightpine: (s) => pineTree(s, PALETTES.night) };
const cache = new Map();

// Variantes de una especie (geometrías ya listas para InstancedMesh)
export function variants(kind, n = 4) {
    const k = kind + n;
    if (cache.has(k)) return cache.get(k);
    const out = [];
    for (let i = 0; i < n; i++) {
        const g = BUILDERS[kind](1000 + i * 97 + kind.length * 13);
        // sin atributos sobrantes (uv) para poder instanciar igual
        if (g.attributes.uv) g.deleteAttribute('uv');
        g.computeBoundingSphere();
        out.push(g);
    }
    cache.set(k, out);
    return out;
}

export function isProcedural(kind) { return kind in BUILDERS; }
