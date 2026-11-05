// ============================================================================
//  MAQUETAS DE LOS LUGARES
// ============================================================================
// Cada lugar de data/places.js indica un "diorama". Aquí está el registro.
// Un diorama es un objeto con:
//   terrain(ctx)  (opcional) se llama ANTES de crear el terreno: para colinas (ctx.bump)
//   build(ctx)    crea los objetos 3D del lugar
//
// Coordenadas relativas a la carretera:
//   along  distancia a lo largo de la carretera desde el centro del lugar
//          (de -ctx.len/2 a +ctx.len/2)
//   side   distancia lateral: > 0 a la derecha (donde va la maqueta, ~hasta 22),
//          < 0 a la izquierda (donde aparecen las señales de las preguntas)
//
// Herramientas del contexto (ctx):
//   ctx.put('kit/modelo' | objeto, along, side, { height, rot, y, scale, dynamic })
//   ctx.character('chars/character-female-b', along, side, { anim: 'idle' | 'walk' | 'sit' | 'emote-yes' ... })
//   ctx.couple(along, side, { anim })      ← vuestros muñequitos (config.js → couple)
//   ctx.walker(modelo, [along, side], [along, side])   ← personaje que pasea
//   ctx.label('texto', along, side, { width, height, opts })
//   ctx.lamps(), ctx.cityBackdrop(), ctx.trees(...)
//
// Para crear un lugar nuevo basta con copiar uno parecido o usar 'generic'.
// ============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CONFIG } from './config.js';
import { model, toon, textPlane, textTexture, imageTexture, heartGeometry } from './assets.js';
import { parkedTesla } from './car.js';
import { building, domeBuilding, masia, stoneMaterial, tileMaterial, metricUV } from './buildings.js';
import { buildWideRoad, gantry } from './roadtrip.js';

const mats = new Map();
const M = (color, opts) => {
    const k = color + JSON.stringify(opts || {});
    if (!mats.has(k)) mats.set(k, toon(color, opts));
    return mats.get(k);
};
const M_ = (c, o) => M(c, o);   // alias (dentro de laMola, M es la montaña)
const mat = (c) => (typeof c === 'string' ? M(c) : c);     // color o material ya hecho
const box = (w, h, d, color) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color)); m.position.y = h / 2; return m; };
const cyl = (rt, rb, h, color, seg = 16) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color)); m.position.y = h / 2; return m; };
const sphere = (r, color) => new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), M(color));
const glowMats = new Map();
const glow = (color) => {
    if (!glowMats.has(color)) glowMats.set(color, new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    return glowMats.get(color);
};
// Altura del asiento para la animación 'sit' (la cadera queda en el origen del muñeco)
const SEAT = { chair: 0.4, bench: 0.33, log: 0.3, ground: 0.17 };
const rnd = (seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; })(12345);

// Personajes animados (se actualizan sólo si están cerca de la cámara)
const actors = [];
function updateActors(dt, cam, time) {
    for (const a of actors) {
        const p = a.obj.getWorldPosition(a.tmp);
        if (p.distanceToSquared(cam) > 160 * 160) continue;
        a.mixer.update(dt);
        if (a.tick) a.tick(dt, time);
    }
}

// Contexto que recibe cada maqueta
export class DioramaCtx {
    constructor(app, place) {
        this.app = app;
        this.track = app.track;
        this.world = app.world;
        this.fx = app.fx;
        this.place = place;
        this.props = place.props || {};
        this.len = place.length;
        this.depth = CONFIG.road.dioramaDepth;
        this.group = new THREE.Group();      // objetos estáticos (se fusionan)
        this.dynamic = new THREE.Group();    // objetos animados
        this.group.name = 'diorama:' + place.id;
        place.runtime = place.runtime || {};
    }
    s(along) { return this.place.sCenter + along; }
    // side < -1.5: objetos al borde izquierdo → se apartan lo que ocupa el carril contrario
    _side(side) { return side <= -1.5 ? side - this.track.leftExtra : side; }
    pos(along, side) { return this.track.point(this.s(along), this._side(side)); }
    // Ángulo para que la "fachada" (+Z del objeto) mire hacia la carretera
    faceRoad(along, side) {
        const f = this.track.frame(this.s(along));
        const k = side >= 0 ? -1 : 1;
        return Math.atan2(f.nx * k, f.nz * k);
    }
    async put(obj, along, side, { rot = 0, scale = 1, y = 0, dynamic = false, face = true, height = null } = {}) {
        if (typeof obj === 'string') obj = await model(obj);
        if (height) {
            const h = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3()).y || 1;
            obj.scale.multiplyScalar(height / h);
        }
        const p = this.pos(along, side);
        obj.position.add(p).y += y;
        if (face) obj.rotation.y += this.faceRoad(along, side) + rot;
        else obj.rotation.y += rot;
        if (scale !== 1) obj.scale.multiplyScalar(scale);
        (dynamic ? this.dynamic : this.group).add(obj);
        return obj;
    }
    // Colocar en una posición de mundo (para lugares con geometría propia, como la montaña)
    async putWorld(obj, pos, { rotY = 0, height = null, y = 0, dynamic = false } = {}) {
        if (typeof obj === 'string') obj = await model(obj);
        if (height) {
            const h = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3()).y || 1;
            obj.scale.multiplyScalar(height / h);
        }
        obj.position.copy(pos).y += y;
        obj.rotation.y += rotY;
        (dynamic ? this.dynamic : this.group).add(obj);
        return obj;
    }
    reserve(along, side, radius) { const p = this.pos(along, side); this.world.reserve(p.x, p.z, radius); }
    bump(along, side, radius, height) { side = this._side(side); const f = this.track.frame(this.s(along)); this.track.addBump(f.x + f.nx * side, f.z + f.nz * side, radius, height); }
    label(text, along, side, { width = 4, height = 3, opts = {}, post = true, dynamic = false, rot = 0 } = {}) {
        const g = new THREE.Group();
        const plane = textPlane(text, width, opts);
        plane.position.y = height;
        g.add(plane);
        if (post) {
            const ph = height - (width * (opts.height || 128) / (opts.width || 512)) / 2;
            for (const dx of [-width * 0.35, width * 0.35]) {
                const p = cyl(0.07, 0.07, ph, '#6b4a2b', 8);
                p.position.x = dx;
                g.add(p);
            }
        }
        this.put(g, along, side, { dynamic, rot });
        return g;
    }
    anim(fn) { this.app.engine.onUpdate(fn); }

    // Parche de suelo que se adapta al relieve (campos, huertos...): nunca flota ni se hunde
    async ground(w, d, mat, along, side, { y = 0.04, rot = 0, seg = 1.2 } = {}) {
        if (typeof mat === 'string') mat = M(mat);
        const geo = new THREE.PlaneGeometry(w, d, Math.max(1, Math.ceil(w / seg)), Math.max(1, Math.ceil(d / seg)));
        geo.rotateX(-Math.PI / 2);
        const m = new THREE.Mesh(geo, mat);
        m.receiveShadow = true;
        await this.put(m, along, side, { rot });
        m.updateMatrix();
        const pos = geo.attributes.position, v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
            v.set(pos.getX(i), 0, pos.getZ(i)).applyMatrix4(m.matrix);
            pos.setY(i, this.track.heightAt(v.x, v.z) - m.position.y + y);
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
        return m;
    }

    // Personaje animado
    // Para 'sit' usa y = altura del asiento (SEAT.chair, SEAT.bench, SEAT.ground)
    async character(key, along, side, { anim = 'idle', rot = 0, y = 0, face = true } = {}) {
        const c = await model(key);
        y += 0.04;   // margen: el terreno de la maqueta está interpolado
        const mixer = new THREE.AnimationMixer(c);
        const clips = c.userData.animations || [];
        const actions = {};
        const play = (name, fade = 0.3) => {
            const clip = THREE.AnimationClip.findByName(clips, name) || THREE.AnimationClip.findByName(clips, 'idle');
            if (!clip) return;
            const act = actions[name] || (actions[name] = mixer.clipAction(clip));
            for (const k in actions) if (actions[k] !== act) actions[k].fadeOut(fade);
            act.reset().fadeIn(fade).play();
            act.time = rnd() * clip.duration;
        };
        play(anim, 0);
        c.userData.play = play;
        c.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
        await this.put(c, along, side, { rot, y, dynamic: true, face });
        const actor = { obj: c, mixer, tmp: new THREE.Vector3() };
        actors.push(actor);
        c.userData.actor = actor;
        return c;
    }

    // Vuestra pareja, con un corazoncito encima
    async couple(along, side, { anim = 'idle', her = anim, him = anim, rot = 0, gap = 0.6, heart = true, y = 0, lookAtEachOther = false } = {}) {
        const C = CONFIG.couple;
        const turn = lookAtEachOther ? Math.PI / 2.4 : 0;
        // ella va delante (along + gap/2) y mira hacia atrás; él detrás y mira hacia delante
        const a = await this.character(C.her, along + gap / 2, side, { anim: her, rot: rot + turn, y });
        const b = await this.character(C.him, along - gap / 2, side, { anim: him, rot: rot - turn, y });
        if (heart) {
            const h = new THREE.Mesh(heartGeometry(), M('#ff4d8d', { emissive: new THREE.Color('#ff4d8d'), emissiveIntensity: 0.35 }));
            h.scale.setScalar(0.22);
            const hg = new THREE.Group(); hg.add(h);
            await this.put(hg, along, side, { y: y + 1.85, dynamic: true });
            const y0 = hg.position.y;
            this.anim((dt, t) => { hg.position.y = y0 + Math.sin(t * 2.2) * 0.1; h.rotation.y = t * 1.5; });
        }
        return [a, b];
    }

    // Personaje que pasea entre dos puntos (ida y vuelta)
    async walker(key, from, to, { speed = 0.9 } = {}) {
        const c = await this.character(key, from[0], from[1], { anim: 'walk', face: false });
        const A = this.pos(...from), B = this.pos(...to);
        const len = A.distanceTo(B);
        let u = rnd() * 2;
        c.userData.actor.tick = (dt) => {
            u = (u + dt * speed / len) % 2;
            const k = u < 1 ? u : 2 - u;
            c.position.lerpVectors(A, B, k);
            c.position.y += 0.04;
            const dir = u < 1 ? B.clone().sub(A) : A.clone().sub(B);
            c.rotation.y = Math.atan2(dir.x, dir.z);
        };
        return c;
    }

    // Farolas a ambos lados de la carretera
    async lamps(every = 11, { key = 'roads/light-curved', height = 4 } = {}) {
        let i = 0;
        for (let a = -this.len / 2 + 2; a <= this.len / 2 - 1; a += every, i++) {
            const side = i % 2 ? 2.35 : -2.35;
            await this.put(key, a, side, { height, rot: Math.PI / 2 });
        }
    }

    // Edificios de fondo para que las islas de ciudad tengan "skyline" (generados con detalle)
    async cityBackdrop(minSide = 16, maxSide = 24, step = 8) {
        const styles = ['eixample', 'eixample', 'stone', 'modern', 'brick'];
        let i = 0;
        for (let a = -this.len / 2; a <= this.len / 2; a += step, i++) {
            const side = minSide + rnd() * (maxSide - minSide);
            const st = styles[Math.floor(rnd() * styles.length)];
            const b = building({ w: 6 + rnd() * 3, d: 5 + rnd() * 2, floors: 4 + Math.floor(rnd() * 5), style: st, seed: i + 7 });
            await this.put(b, a, side);
        }
    }

    async trees(keys, n, sideMin, sideMax, { height = null } = {}) {
        const PROC = { rock_largeA: 'rock', rock_largeB: 'rock', rock_tallA: 'rock', tree_default: 'oak', tree_oak: 'oak', tree_fat: 'oak', tree_cone: 'cypress', tree_pineRoundA: 'pine', tree_pineTallA: 'pine', tree_palmTall: 'palm', tree_palmShort: 'palm', tree_palmBend: 'palm' };
        for (let i = 0; i < n; i++) {
            const a = -this.len / 2 + rnd() * this.len;
            const side = sideMin + rnd() * (sideMax - sideMin);
            const key = Array.isArray(keys) ? keys[i % keys.length] : keys;
            let kind = PROC[key.split('/')[1]];
            if (kind === 'pine' && this.place.stage === 'commitment') kind = 'nightpine';
            if (kind) {
                const p = this.pos(a, side);
                const sc = (height ? height / 3.4 : 1) * (0.85 + rnd() * 0.4);
                this.world.plantTree(kind, p.x, p.z, sc, rnd() * 6, p.y - 0.05);
                continue;
            }
            await this.put(key, a, side, { rot: rnd() * 6, height: height ? height * (0.8 + rnd() * 0.5) : null });
        }
    }
}

// Fusiona la geometría estática por material: muchas menos llamadas de dibujo
// Los materiales toon lisos (sin textura, brillo ni transparencia) se funden en UNA malla con el
// color en los vértices: muchas menos llamadas de dibujo (importante en el coche)
let vcMat = null;
const isPlainToon = (m) => m.isMeshToonMaterial && !m.map && !m.transparent && !m.vertexColors && m.side === THREE.FrontSide
    && (!m.emissive || m.emissive.getHex() === 0 || !m.emissiveIntensity);
function bakeColor(geo, color) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
}

export function mergeStatic(group) {
    group.updateMatrixWorld(true);
    const buckets = new Map();
    const remove = [];
    vcMat = vcMat || toon('#ffffff', { vertexColors: true });
    group.traverse(o => {
        if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material) || o.material.transparent || (o.material.map && o.material.isMeshBasicMaterial)) return;
        const geo = o.geometry;
        if (isPlainToon(o.material)) {
            const g = bakeColor(geo, o.material.color).applyMatrix4(o.matrixWorld);
            if (!buckets.has('vc')) buckets.set('vc', { mat: vcMat, geos: [] });
            buckets.get('vc').geos.push(g);
            remove.push(o);
            return;
        }
        const sig = o.material.uuid + '|' + Object.keys(geo.attributes).sort().join(',') + '|' + (geo.index ? 'i' : 'n');
        const g = geo.clone().applyMatrix4(o.matrixWorld);
        if (!buckets.has(sig)) buckets.set(sig, { mat: o.material, geos: [] });
        buckets.get(sig).geos.push(g);
        remove.push(o);
    });
    for (const o of remove) o.parent.remove(o);
    const out = new THREE.Group();
    for (const { mat, geos } of buckets.values()) {
        const merged = mergeGeometries(geos, false);
        if (!merged) continue;
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        out.add(mesh);
    }
    const rest = [...group.children];
    group.updateMatrixWorld(true);
    rest.forEach(c => out.attach(c));
    return out;
}

// --- Piezas reutilizables -----------------------------------------------------

function flag(colors, { w = 1.6, h = 1, pole = 3.2, stripes = 'h' } = {}) {
    const g = new THREE.Group();
    g.add(cyl(0.05, 0.06, pole, '#d8dbe3', 8));
    const c = document.createElement('canvas'); c.width = 96; c.height = 64;
    const x = c.getContext('2d');
    colors.forEach((col, i) => {
        x.fillStyle = col;
        if (stripes === 'h') x.fillRect(0, i * 64 / colors.length, 96, 64 / colors.length + 1);
        else x.fillRect(i * 96 / colors.length, 0, 96 / colors.length + 1, 64);
    });
    if (colors.extra) colors.extra(x);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 8, 1), new THREE.MeshToonMaterial({ map: tex, side: THREE.DoubleSide }));
    cloth.position.set(w / 2 + 0.05, pole - h / 2, 0);
    g.add(cloth);
    g.userData.cloth = cloth;
    return g;
}

function waveFlag(ctx, f) {
    const cloth = f.userData.cloth;
    const pos = cloth.geometry.attributes.position;
    const base = Float32Array.from(pos.array);
    ctx.anim((dt, t) => {
        if (!ctx.dynamic.visible) return;
        for (let i = 0; i < pos.count; i++) {
            const x = base[i * 3];
            pos.setZ(i, Math.sin(t * 4 + x * 3) * 0.12 * (x + 0.8));
        }
        pos.needsUpdate = true;
    });
}

const SENYERA = ['#fcdd09', '#da121a', '#fcdd09', '#da121a', '#fcdd09', '#da121a', '#fcdd09', '#da121a', '#fcdd09'];

function bulbRow(n, length, color = '#fff2b0') {
    const g = new THREE.Group();
    const bulbs = [];
    for (let i = 0; i < n; i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
        b.position.x = -length / 2 + (i + 0.5) * length / n;
        g.add(b); bulbs.push(b);
    }
    g.userData.bulbs = bulbs;
    return g;
}

function polaroid(tex, w = 1.6) {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w, w * 1.18, 0.04), new THREE.MeshBasicMaterial({ color: 0xfffdf6, toneMapped: false }));
    const img = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.86, w * 0.86), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    img.position.set(0, w * 0.1, 0.025);
    g.add(frame, img);
    return g;
}

// Terraza: mesa redonda con sillas, tazas y croissant
async function terraceTable(ctx, along, side, { cups = true } = {}) {
    await ctx.put('furniture/tableRound', along, side, { height: 0.62 });
    await ctx.put('furniture/chair', along + 0.75, side, { height: 0.8, rot: Math.PI / 2 });
    await ctx.put('furniture/chair', along - 0.75, side, { height: 0.8, rot: -Math.PI / 2 });
    if (cups) {
        await ctx.put('food/cup-coffee', along + 0.15, side - 0.1, { height: 0.14, y: 0.62 });
        await ctx.put('food/cup-coffee', along - 0.18, side + 0.05, { height: 0.14, y: 0.62 });
        await ctx.put('food/croissant', along, side + 0.2, { height: 0.08, y: 0.62 });
    }
}

function placeSign(ctx) {
    const p = ctx.place;
    const g = new THREE.Group();
    const board = textPlane(p.name, 3.2, { width: 640, height: 160, bg: '#fff3d6', fg: '#1b1b2f', borderColor: '#6b4a2b', border: 14, radius: 30 });
    board.position.y = 1.9;
    g.add(board, cyl(0.08, 0.09, 1.6, '#6b4a2b', 8));
    ctx.put(g, -ctx.len / 2 + 1.5, -2.6);
}

// Degradado radial para los charcos de luz en el suelo
let poolTex = null;
function poolTexture() {
    if (poolTex) return poolTex;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,.55)'); grd.addColorStop(0.5, 'rgba(255,255,255,.2)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    poolTex = new THREE.CanvasTexture(c);
    return poolTex;
}

// Chapa grecada (paredes de la nave)
let corrTex = null;
function corrugatedTexture() {
    if (corrTex) return corrTex;
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    for (let x = 0; x < 64; x += 8) {
        const grd = g.createLinearGradient(x, 0, x + 8, 0);
        grd.addColorStop(0, '#6f7a90'); grd.addColorStop(0.5, '#a3adc0'); grd.addColorStop(1, '#6f7a90');
        g.fillStyle = grd; g.fillRect(x, 0, 8, 64);
    }
    corrTex = new THREE.CanvasTexture(c); corrTex.colorSpace = THREE.SRGBColorSpace;
    corrTex.wrapS = corrTex.wrapT = THREE.RepeatWrapping;
    return corrTex;
}

// Losetas de caucho de gimnasio
let rubTex = null;
function rubberTexture() {
    if (rubTex) return rubTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#3a3f50'; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 160; i++) { g.fillStyle = Math.random() < 0.5 ? '#454b5e' : '#33384a'; g.fillRect(Math.random() * 64, Math.random() * 64, 2, 2); }
    g.strokeStyle = '#2a2e3c'; g.lineWidth = 2; g.strokeRect(1, 1, 62, 62);
    rubTex = new THREE.CanvasTexture(c); rubTex.colorSpace = THREE.SRGBColorSpace;
    rubTex.wrapS = rubTex.wrapT = THREE.RepeatWrapping;
    return rubTex;
}

// Mantel de cuadros vichy
let gingham = null;
function ginghamTexture() {
    if (gingham) return gingham;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(214,40,57,.55)';
    for (let i = 0; i < 128; i += 32) { g.fillRect(i, 0, 16, 128); g.fillRect(0, i, 128, 16); }
    gingham = new THREE.CanvasTexture(c);
    gingham.colorSpace = THREE.SRGBColorSpace;
    gingham.wrapS = gingham.wrapT = THREE.RepeatWrapping;
    gingham.repeat.set(3, 1.5);
    return gingham;
}

// Tractor rojo de campo (frente hacia +X)
function tractor() {
    const g = new THREE.Group();
    const red = '#c0392b';
    const chassis = box(2.2, 0.5, 1.0, red); chassis.position.set(0, 0.75, 0); g.add(chassis);
    const hood = box(1.2, 0.6, 0.9, red); hood.position.set(0.55, 1.25, 0); g.add(hood);
    const grill = box(0.05, 0.45, 0.7, '#2b2d42'); grill.position.set(1.17, 1.22, 0); g.add(grill);
    const exhaust = cyl(0.05, 0.05, 0.7, '#3a3a3a', 6); exhaust.position.set(0.8, 1.85, 0.25); g.add(exhaust);
    const seat = box(0.45, 0.15, 0.45, '#2b2d42'); seat.position.set(-0.55, 1.15, 0); g.add(seat);
    for (const [x, z] of [[-0.95, 0.55], [-0.95, -0.55], [0.0, 0.55], [0.0, -0.55]]) { const p = box(0.07, 1.4, 0.07, '#2b2d42'); p.position.set(x, 1.75, z); g.add(p); }
    const roof = box(1.15, 0.08, 1.3, '#f1f1f1'); roof.position.set(-0.47, 2.45, 0); g.add(roof);
    for (const [x, r, w] of [[-0.7, 0.62, 0.38], [0.8, 0.36, 0.26]]) for (const z of [-0.68, 0.68]) {
        const wh = cyl(r, r, w, '#2a2a2a', 16); wh.rotation.x = Math.PI / 2; wh.position.set(x, r, z * (1 + (r > 0.5 ? 0.1 : 0))); g.add(wh);
        const hub = cyl(r * 0.45, r * 0.45, w + 0.02, '#ffcc33', 12); hub.rotation.x = Math.PI / 2; hub.position.copy(wh.position); g.add(hub);
    }
    return g;
}

// --- Registro de maquetas -------------------------------------------------------

export const DIORAMAS = {

    generic: {
        async build(ctx) {
            const P = ctx.props;
            const n = Math.max(1, Math.floor(ctx.len / 8));
            for (let i = 0; i < n; i++) {
                const along = -ctx.len / 2 + 4 + i * (ctx.len - 8) / Math.max(n - 1, 1);
                const b = P.buildings ? P.buildings[i % P.buildings.length] : building({ w: 6.5, d: 5, floors: 3 + (i % 3), style: P.style || 'eixample', seed: i });
                await ctx.put(b, along, 8 + (i % 2) * 1.5);
                ctx.reserve(along, 8, 5);
            }
            if (P.trees) await ctx.trees(P.trees, 5, 3, 5);
            if (P.flag) {
                const f = flag([P.flag, '#ffffff', P.flag]);
                ctx.put(f, ctx.len / 2 - 2, 3, { dynamic: true });
                waveFlag(ctx, f);
            }
            await ctx.couple(0, 3.3, { anim: 'idle' });
        }
    },

    autoescuela: {
        terrain(ctx) {
            // Zona llana para el aparcamiento y el circuito de prácticas
            for (const [al, sd, r] of [[-8, 18, 10], [2, 32, 18]]) { const p = ctx.pos(al, sd); ctx.track.addFlat(p.x, p.z, r); }
        },
        async build(ctx) {
            await ctx.put(building({ w: 10, d: 6, floors: 4, style: 'modern', seed: 11 }), -2, 9.5);
            await ctx.put(building({ w: 7, d: 6, floors: 6, style: 'eixample', seed: 12 }), -11, 10);
            ctx.reserve(-2, 9, 7);
            const sign = textPlane('AUTOESCUELA CARI', 6.5, { width: 1024, height: 200, bg: '#ffd23f', fg: '#ff4d8d', stroke: '#1b1b2f', font: 'Bangers', weight: 400, border: 14 });
            await ctx.put(sign, -2, 5.6, { y: 6.6 });
            const L = textPlane('L', 1.6, { width: 256, height: 256, bg: '#ffffff', fg: '#e8173b', borderColor: '#e8173b', font: 'Fredoka', weight: 700, size: 220, border: 18 });
            const lg = new THREE.Group(); L.position.y = 2.2; lg.add(L, cyl(0.06, 0.06, 1.5, '#3b3f4f', 8));
            await ctx.put(lg, 5, 3);
            await ctx.put('roads/traffic-light', 3.5, -2.5, { height: 3, rot: Math.PI });
            await ctx.put('roads/traffic-light', -6, 2.5, { height: 3 });
            await ctx.lamps();
            for (const a of [-9, -6, 3]) await ctx.put('suburb/planter', a, 4.6, { height: 0.8 });
            await ctx.couple(1.5, 4.2, { her: 'emote-yes', him: 'idle' });

            // --- Aparcamiento detrás de la autoescuela ---
            const t = ctx.track;
            const f = t.frame(ctx.s(0));
            const T = new THREE.Vector3(f.tx, 0, f.tz), N = new THREE.Vector3(f.nx, 0, f.nz);
            const heading = Math.atan2(f.tx, f.tz);
            const lot = ctx.pos(-8, 18);
            const flatGeo = (w, d) => { const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); return g; };
            const lotMesh = new THREE.Mesh(flatGeo(16, 9), M('#6b7083'));
            lotMesh.position.copy(lot).y += 0.06; lotMesh.rotation.y = heading;
            ctx.group.add(lotMesh);
            const parked = ['car/sedan', 'car/suv', 'car/van', 'car/hatchback-sports', 'car/taxi', 'car/sedan', 'car/police'];
            for (let i = 0; i < 7; i++) {
                const along = -14.5 + i * 2.2;
                const line = new THREE.Mesh(flatGeo(0.1, 3.6), glow('#ffffff'));
                const lp = ctx.pos(along - 1.1, 16.4); line.position.copy(lp).y = lot.y + 0.08; line.rotation.y = heading + Math.PI / 2;
                ctx.group.add(line);
                if (i === 3) continue;   // un hueco libre
                const c = await model(parked[i]);
                const h = new THREE.Box3().setFromObject(c).getSize(new THREE.Vector3());
                c.scale.multiplyScalar(2.3 / Math.max(h.x, h.z));
                c.position.copy(ctx.pos(along, 16.4)); c.position.y = lot.y + 0.05;
                c.rotation.y = heading + Math.PI / 2 + (rnd() - 0.5) * 0.1;
                ctx.group.add(c);
            }
            ctx.reserve(-8, 18, 10);

            // --- Circuito de prácticas (óvalo) estilo americano ---
            const C = ctx.pos(2, 32);
            const R = 6.5, SL = 16;   // radio de las curvas y longitud de las rectas
            const oval = (u) => {     // u en [0, 1): posición sobre el óvalo
                const per = 2 * SL + 2 * Math.PI * R;
                let d = u * per, a, b;
                if (d < SL) { a = -SL / 2 + d; b = -R; }
                else if ((d -= SL) < Math.PI * R) { const th = d / R; a = SL / 2 + Math.sin(th) * R; b = -Math.cos(th) * R; }
                else if ((d -= Math.PI * R) < SL) { a = SL / 2 - d; b = R; }
                else { d -= SL; const th = d / R; a = -SL / 2 - Math.sin(th) * R; b = Math.cos(th) * R; }
                return C.clone().addScaledVector(T, a).addScaledVector(N, b);
            };
            // Asfalto del óvalo
            const pts = [], idx = [];
            const NSEG = 120;
            for (let i = 0; i <= NSEG; i++) {
                const p = oval(i / NSEG), q = oval(((i + 1) % NSEG) / NSEG);
                const dir = q.clone().sub(p).normalize();
                const side = new THREE.Vector3(-dir.z, 0, dir.x);
                for (const w of [-1.6, 1.6]) { const v = p.clone().addScaledVector(side, w); pts.push(v.x, C.y + 0.07, v.z); }
                if (i > 0) { const b = i * 2; idx.push(b - 2, b, b - 1, b - 1, b, b + 1); }
            }
            const og = new THREE.BufferGeometry();
            og.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
            og.setIndex(idx); og.computeVertexNormals();
            const ovalMesh = new THREE.Mesh(og, toon('#5d6275', { side: THREE.DoubleSide }));
            ovalMesh.receiveShadow = true;
            ctx.group.add(ovalMesh);
            for (let i = 0; i < NSEG; i += 4) {   // línea discontinua central
                const p = oval(i / NSEG), q = oval((i + 1) / NSEG);
                const dash = new THREE.Mesh(flatGeo(0.14, 0.9), glow('#ffd23f'));
                dash.position.copy(p).y = C.y + 0.09;
                dash.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
                ctx.group.add(dash);
            }
            // Interior: conos en eslalon, STOP, paso de cebra y plazas de aparcamiento en batería
            for (let i = 0; i < 6; i++) await ctx.putWorld('roads/construction-cone', C.clone().addScaledVector(T, -6 + i * 2.4).addScaledVector(N, (i % 2 ? 1 : -1) * 0.8), { height: 0.55 });
            await ctx.putWorld('roads/road-sign-stop', C.clone().addScaledVector(T, SL / 2 - 1).addScaledVector(N, -R + 2.2), { rotY: heading, height: 2 });
            for (let i = 0; i < 5; i++) {
                const z = new THREE.Mesh(flatGeo(0.35, 2.6), glow('#ffffff'));
                z.position.copy(C.clone().addScaledVector(T, -SL / 2 + 1 + i * 0.6).addScaledVector(N, R)).y = C.y + 0.09;
                z.rotation.y = heading;
                ctx.group.add(z);
            }
            for (let i = 0; i < 4; i++) {
                const box3 = new THREE.Mesh(flatGeo(0.1, 2.4), glow('#ffffff'));
                box3.position.copy(C.clone().addScaledVector(T, -3 + i * 2).addScaledVector(N, 2.6)).y = C.y + 0.08;
                box3.rotation.y = heading + Math.PI / 2;
                ctx.group.add(box3);
            }
            // Cartel "DRIVER TRAINING" estilo americano
            const dt_ = textPlane('', 6, { width: 1000, height: 300, bg: '#ffd23f', fg: '#1b1b2f', lines: ['DRIVER TRAINING', 'Autoescuela Cari · since 2026'], border: 14, borderColor: '#1b1b2f', font: 'Bangers', weight: 400 });
            const dg = new THREE.Group(); dt_.position.y = 3.6; dg.add(dt_);
            for (const x of [-2.3, 2.3]) { const p = cyl(0.1, 0.1, 2.6, '#1b1b2f', 8); p.position.x = x; dg.add(p); }
            await ctx.putWorld(dg, C.clone().addScaledVector(N, -R - 3.5), { rotY: heading + Math.PI });
            // Grada con público animando
            const stands = new THREE.Group();
            for (let r = 0; r < 3; r++) { const st = box(9, 0.5, 1.1, r % 2 ? '#e8173b' : '#f4f6fb'); st.position.set(0, r * 0.5 + 0.25, -r * 1.1); stands.add(st); }
            const SP = C.clone().addScaledVector(N, R + 6);
            await ctx.putWorld(stands, SP, { rotY: heading + Math.PI });
            const fans = ['chars/character-female-b', 'chars/character-male-a', 'chars/character-female-e', 'chars/character-female-c'];
            for (let i = 0; i < fans.length; i++) {
                const c = await ctx.character(fans[i], 0, 0, { anim: i % 2 ? 'emote-yes' : 'idle', face: false });
                c.position.copy(SP.clone().addScaledVector(T, -3 + i * 2).addScaledVector(N, (i % 2) * 1.1)).y = SP.y + 0.5 + (i % 2) * 0.5 + 0.04;
                c.rotation.y = heading + Math.PI;
            }
            // El profesor con la carpeta, junto a la pista
            const inst = await ctx.character('chars/character-male-c', 0, 0, { anim: 'holding-right', face: false });
            inst.position.copy(C.clone().addScaledVector(N, -R - 2).addScaledVector(T, -4)); inst.position.y += 0.04;
            inst.rotation.y = heading;
            // Coches de alumnos dando vueltas, con su cartel en el techo
            const studentKeys = ['car/hatchback-sports', 'car/sedan', 'car/suv'];
            const movers = [];
            for (let i = 0; i < studentKeys.length; i++) {
                const c = await model(studentKeys[i]);
                const h = new THREE.Box3().setFromObject(c).getSize(new THREE.Vector3());
                c.scale.multiplyScalar(2.2 / Math.max(h.x, h.z));
                const box2 = new THREE.Box3().setFromObject(c);
                const top = new THREE.Group();
                const topper = box(0.9, 0.35, 0.3, '#ffd23f');
                const lbl = textPlane('', 0.85, { width: 512, height: 160, bg: '#ffd23f', fg: '#1b1b2f', lines: ['STUDENT', 'DRIVER'], border: 0, font: 'Bangers', weight: 400 });
                lbl.position.set(0, 0.18, 0.16);
                const lbl2 = lbl.clone(); lbl2.rotation.y = Math.PI; lbl2.position.z = -0.16;
                top.add(topper, lbl, lbl2);
                top.position.y = (box2.max.y - c.position.y) / c.scale.y;
                top.scale.setScalar(1 / c.scale.y);
                c.add(top);
                ctx.dynamic.add(c);
                movers.push({ c, u: i / 3, v: 0.035 + i * 0.008, base: C.y + 0.08 });
            }
            ctx.anim((dt, tm) => {
                if (!ctx.dynamic.visible) return;
                for (const m of movers) {
                    m.u = (m.u + dt * m.v) % 1;
                    const p = oval(m.u), q = oval((m.u + 0.01) % 1);
                    m.c.position.copy(p); m.c.position.y = m.base + Math.abs(Math.sin(tm * 9 + m.u * 20)) * 0.02;
                    m.c.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
                }
            });
            ctx.world.reserve(C.x, C.z, 16);
            await ctx.cityBackdrop(42, 48);
            // Línea de salida a cuadros
            const c = document.createElement('canvas'); c.width = 128; c.height = 32;
            const x = c.getContext('2d');
            for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#1b1b2f' : '#fff'; x.fillRect(i * 16, j * 16, 16, 16); }
            const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
            const line = new THREE.Mesh(flatGeo(CONFIG.road.width, 0.7), new THREE.MeshBasicMaterial({ map: tex }));
            line.position.x = -ctx.track.offset;   // (el grupo mira hacia delante: x local = izquierda)
            const s0 = ctx.track.startS + 4;
            const holder = new THREE.Group();
            holder.add(line);
            holder.position.copy(ctx.track.point(s0, 0)).y += 0.16;
            holder.rotation.y = ctx.track.headingAt(s0);
            ctx.group.add(holder);
        }
    },

    cafeteria: {
        async build(ctx) {
            await ctx.put(building({ w: 10, d: 6, floors: 6, style: 'eixample', shops: false, seed: 21 }), 0, 10);
            ctx.reserve(0, 9, 7);
            const sign = textPlane('CAFETERIA', 3.4, { width: 512, height: 160, bg: '#d71f3a', fg: '#ffffff', borderColor: '#1b1b2f', font: 'Fredoka', weight: 700, border: 12 });
            await ctx.put(sign, 0, 6.6, { y: 3.6 });
            await ctx.put('city/detail-awning-wide', 0, 7.1, { height: 1.2, y: 1.8 });
            // Terraza
            await terraceTable(ctx, -3.2, 4.4);
            await terraceTable(ctx, 3.6, 4.6);
            await terraceTable(ctx, 3.4, 6.2, { cups: false });
            for (const a of [-3.2, 3.5]) await ctx.put('city/detail-parasol-a', a, 5.6, { height: 2.4 });
            // Vosotros, sentados en la terraza donde empezó todo (con un globo de corazón atado a la silla)
            await ctx.couple(-3.2, 4.4, { anim: 'sit', y: SEAT.chair, lookAtEachOther: true, gap: 1.5 });
            await ctx.put('food/croissant', -3.2, 4.3, { height: 0.07, y: 0.62 });
            const balloon = new THREE.Group();
            const bh = new THREE.Mesh(heartGeometry(), M('#ff4d8d', { emissive: new THREE.Color('#ff4d8d'), emissiveIntensity: 0.25 })); bh.scale.setScalar(0.32); bh.position.y = 2.6; balloon.add(bh);
            const str = cyl(0.008, 0.008, 1.9, '#ffffff', 4); str.position.y = 0.75; balloon.add(str);
            await ctx.put(balloon, -2.2, 4.4, { dynamic: true });
            ctx.anim((dt, t) => { balloon.rotation.z = Math.sin(t * 1.3) * 0.08; bh.rotation.y = Math.sin(t * 0.9) * 0.5; });
            // Escaparate de la cafetería: marco rojo, interior cálido con la barra, la vitrina y la carta
            const shop = new THREE.Group();
            const SW = 5.2, SH = 2.5, SD = 0.9;
            const interior = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), M('#f3d9b0')); interior.position.set(0, SH / 2, -SD / 2 + 0.02); shop.add(interior);
            const floorS = box(SW, 0.04, SD, '#8a5a3c'); shop.add(floorS);
            for (const sx of [-1, 1]) { const side = box(0.18, SH, SD, '#d71f3a'); side.position.set(sx * (SW / 2 + 0.09), 0, 0); shop.add(side); }
            const topF = box(SW + 0.36, 0.5, SD, '#d71f3a'); topF.position.y = SH; shop.add(topF);
            const counter = box(3.4, 0.85, 0.35, '#d71f3a'); counter.position.set(-0.4, 0, -0.1); shop.add(counter);
            const vit = box(3.0, 0.3, 0.3, new THREE.MeshToonMaterial({ color: '#cfeefc', transparent: true, opacity: 0.55 })); vit.position.set(-0.4, 0.85, -0.1); shop.add(vit);
            for (let k = 0; k < 5; k++) { const sw = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.32, 4, 8), M('#e2b26a')); sw.rotation.z = Math.PI / 2; sw.position.set(-1.6 + k * 0.6, 0.97, -0.1); shop.add(sw); }
            const coffee = box(0.5, 0.6, 0.35, '#2b2d42'); coffee.position.set(1.8, 0.85, -0.25); shop.add(coffee);
            const menu = textPlane('', 1.5, { width: 400, height: 260, bg: '#1b1b2f', fg: '#ffffff', lines: ['ENTREPANS', 'Croissants ❤', 'Cafè amb llet'], font: 'Caveat', weight: 700, border: 8, borderColor: '#d71f3a' });
            menu.position.set(1.4, 1.85, -SD / 2 + 0.04); shop.add(menu);
            const lampS = box(SW - 0.4, 0.05, 0.15, glow('#fff6e0')); lampS.position.set(0, SH - 0.1, -0.1); shop.add(lampS);
            const glassS = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH - 0.1), new THREE.MeshToonMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.25, depthWrite: false })); glassS.position.set(0, SH / 2, SD / 2); shop.add(glassS);
            await ctx.put(shop, 0, 7.0 - SD / 2);
            // Paso de cebra, patinete aparcado y palomas
            const zebra = new THREE.Group();
            for (let k = 0; k < 6; k++) { const st = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 4.6), M('#ffffff')); st.rotation.x = -Math.PI / 2; st.position.set(-1.4 + k * 0.56, 0.2, 0); zebra.add(st); }
            await ctx.put(zebra, 7.5, -0.5, { face: true });
            const scoot = new THREE.Group();
            const deck = box(0.9, 0.05, 0.18, '#2b2d42'); deck.position.y = 0.12; scoot.add(deck);
            const stem = cyl(0.025, 0.025, 1.0, '#2b2d42', 6); stem.position.set(0.42, 0.6, 0); stem.rotation.z = -0.15; scoot.add(stem);
            for (const x of [-0.4, 0.42]) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 12), M('#1b1b22')); w.position.set(x, 0.1, 0); scoot.add(w); }
            await ctx.put(scoot, 6.5, 4.2, { rot: 0.4 });
            for (let i = 0; i < 5; i++) {
                const pg = new THREE.Group();
                const b = sphere(0.11, i % 2 ? '#9aa3b5' : '#e6e6ee'); b.scale.set(1, 0.8, 1.4); b.position.y = 0.11; pg.add(b);
                const hd = sphere(0.06, '#7d8597'); hd.position.set(0, 0.22, 0.12); pg.add(hd);
                await ctx.put(pg, -7 + rnd() * 3, 3.6 + rnd() * 1.4, { dynamic: true, rot: rnd() * 6 });
                const ph = rnd() * 6; ctx.anim((dt, t) => { if (ctx.dynamic.visible) hd.position.y = 0.18 + Math.max(0, Math.sin(t * 5 + ph)) * 0.05; });
            }
            ctx.label('Aquí empezó todo ✨', -7, 5, { width: 3.4, height: 2.8 });
            // Al lado, un bloque del Eixample con comercios (los grandes almacenes tienen su propia parada después)
            await ctx.put(building({ w: 11, d: 8, floors: 6, style: 'stone', seed: 22 }), 11, 15);
            await ctx.lamps();
            for (const a of [-9, 8]) await ctx.put('suburb/planter', a, 4.4, { height: 0.8 });
            await ctx.walker('chars/character-female-c', [-10, 3.2], [10, 3.4]);
            await ctx.cityBackdrop(18, 25);
        }
    },

    laMola: {
        async build(ctx) {
            const t = ctx.track, P = ctx.place, M = P.mountain;
            if (!M) return;
            const O = M.origin;
            const W = (a, b) => t.mountainPoint(P, a, b);
            const H0 = O.heading;                         // rumbo de "adelante" en la montaña
            const cfg = Object.assign({ legs: 7, legLength: 34, spacing: 10.5 }, P.props.mountain);
            // --- Cima: monasterio en el centro de la rotonda ---
            const plaza = W(M.plaza.a, M.plaza.b);
            const g = new THREE.Group();
            const stone = '#c9b08a';
            g.add(box(3.4, 1.8, 1.8, stone));
            const roof = new THREE.Mesh(new THREE.CylinderGeometry(0, 1.4, 0.9, 4), M_('#b5523b'));
            roof.rotation.y = Math.PI / 4; roof.scale.set(1.75, 1, 0.9); roof.position.y = 2.2; g.add(roof);
            const tower = box(1, 3.4, 1, stone); tower.position.x = 1.8; g.add(tower);
            const tr = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.9, 4), M_('#b5523b')); tr.position.set(1.8, 3.8, 0); tr.rotation.y = Math.PI / 4; g.add(tr);
            const bell = sphere(0.18, '#d4af37'); bell.position.set(1.8, 3, 0.52); g.add(bell);
            const wall = box(4.6, 0.6, 0.2, stone); wall.position.set(0, 0, 1.6); g.add(wall);
            await ctx.putWorld(g, plaza, { rotY: H0 + Math.PI, y: -0.05 });
            g.scale.setScalar(1.25);
            ctx.world.reserve(plaza.x, plaza.z, 6);
            // Mirador con barandilla al borde de la cima
            for (let i = -3; i <= 3; i++) {
                const p = W(M.plaza.a + 11, M.plaza.b + i * 1.4);
                await ctx.putWorld(cyl(0.05, 0.05, 0.9, '#6b4a2b', 6), p);
            }
            const rail = box(9, 0.08, 0.08, '#6b4a2b'); rail.position.y = 0.85;
            const rg = new THREE.Group(); rg.add(rail);
            await ctx.putWorld(rg, W(M.plaza.a + 11, M.plaza.b), { rotY: H0 + Math.PI / 2 });
            for (const db of [-3, 3]) await ctx.putWorld('furniture/bench', W(M.plaza.a + 9.5, M.plaza.b + db), { rotY: H0 + Math.PI, height: 0.6 });
            const sign = textPlane('', 3.4, { width: 640, height: 220, bg: '#fff3d6', fg: '#1b1b2f', lines: ['LA MOLA', '1.104 m'], borderColor: '#6b4a2b', border: 14, radius: 24 });
            const sg = new THREE.Group(); sign.position.y = 2.3; sg.add(sign, cyl(0.08, 0.09, 1.7, '#6b4a2b', 8));
            await ctx.putWorld(sg, W(M.summit.a - 2, M.summit.b + 3.5), { rotY: H0 + Math.PI });
            // Vosotros paseando por la cima
            const walk = async (key, a0, b0, a1, b1) => {
                const c = await ctx.character(key, 0, 0, { anim: 'walk', face: false });
                const A = W(a0, b0), B = W(a1, b1);
                const len = A.distanceTo(B);
                let u = rnd() * 2;
                c.userData.actor.tick = (dt) => {
                    u = (u + dt * 0.6 / len) % 2;
                    const k = u < 1 ? u : 2 - u;
                    c.position.lerpVectors(A, B, k); c.position.y += 0.04;
                    const d = u < 1 ? B.clone().sub(A) : A.clone().sub(B);
                    c.rotation.y = Math.atan2(d.x, d.z);
                };
            };
            await walk(CONFIG.couple.her, M.plaza.a + 8.5, M.plaza.b - 4, M.plaza.a + 8.5, M.plaza.b + 4);
            await walk(CONFIG.couple.him, M.plaza.a + 8.1, M.plaza.b - 4.6, M.plaza.a + 8.1, M.plaza.b + 3.4);
            // --- Subida: señales de curva peligrosa y bolardos en cada horquilla, mojones ---
            const L = cfg.legLength, sp = cfg.spacing;
            for (let k = 0; k < cfg.legs - 1; k++) {
                const ak = 11 + k * sp;
                const bEnd = k % 2 === 0 ? -5 - L : -5;
                const out = k % 2 === 0 ? -1 : 1;
                // borde exterior de la curva: en las de derecha (k par) es el lado izquierdo del coche (más ancho)
                const outerR = sp / 2 + (k % 2 === 0 ? t.leftEdge : t.rightEdge) + 0.9;
                const apex = W(ak + sp / 2, bEnd + out * (outerR + 0.6));
                const sgn = await model('roads/road-sign-warning');
                await ctx.putWorld(sgn, apex, { rotY: H0 + (out < 0 ? Math.PI / 2 : -Math.PI / 2), height: 1.6 });
                for (let j = -3; j <= 3; j++) {
                    const ang = j * 0.35;
                    const p = W(ak + sp / 2 + Math.sin(ang) * outerR, bEnd + out * Math.cos(ang) * outerR);
                    const post = cyl(0.07, 0.07, 0.5, j % 2 ? '#e8173b' : '#ffffff', 6);
                    await ctx.putWorld(post, p);
                }
                // Mojón kilométrico a mitad de tramo
                const km = textPlane(`km ${k + 1}`, 0.6, { width: 256, height: 128, bg: '#ffffff', fg: '#1b1b2f', borderColor: '#e8173b', border: 10 });
                const kg = new THREE.Group(); km.position.y = 0.55; kg.add(km, box(0.32, 0.3, 0.12, '#ffffff'));
                await ctx.putWorld(kg, W(ak + (k % 2 === 0 ? 1 : -1) * (t.rightEdge + 0.8), bEnd + (k % 2 === 0 ? 1 : -1) * L / 2), { rotY: H0 + Math.PI });
            }
            // Base: cartel del parque natural y senderistas
            const park = textPlane('', 3.8, { width: 800, height: 240, bg: '#2f6b3a', fg: '#ffffff', lines: ['Parc Natural', "Sant Llorenç del Munt i l'Obac"], borderColor: '#ffffff', border: 10, radius: 16 });
            const pg = new THREE.Group(); park.position.y = 2.2; pg.add(park);
            for (const x of [-1.5, 1.5]) { const pp = cyl(0.08, 0.08, 1.7, '#6b4a2b', 8); pp.position.x = x; pg.add(pp); }
            await ctx.putWorld(pg, W(2, 4.5), { rotY: H0 + Math.PI });
            const hk = await ctx.character('chars/character-male-a', 0, 0, { anim: 'walk', face: false });
            const A = W(4, 9), B = W(16, 12);
            hk.userData.actor.tick = (dt, tm) => { const k = (Math.sin(tm * 0.12) + 1) / 2; hk.position.lerpVectors(A, B, k); hk.position.y += 0.04; hk.rotation.y = Math.atan2(B.x - A.x, B.z - A.z) + (Math.cos(tm * 0.12) < 0 ? Math.PI : 0); };
            await ctx.put('nature/tent_detailedOpen', 0, 0, { height: 1.4 }).then(o => { o.position.copy(W(14, 6)); });
        }
    },

    cine: {
        async build(ctx) {
            const g = new THREE.Group();
            const wall = box(8, 5, 3.4, '#8e1b3a'); g.add(wall);
            const trim = box(8.2, 0.3, 3.6, '#ffd23f'); trim.position.y = 5.1; g.add(trim);
            const door = box(1.8, 2.2, 0.1, '#3a1222'); door.position.set(0, 1.1, 1.72); g.add(door);
            const marquee = box(6.6, 1.3, 1.3, '#ffd23f'); marquee.position.set(0, 3.2, 2.2); g.add(marquee);
            // remate art déco escalonado y pilastras
            for (const [w, h, y] of [[5, 0.9, 5.25], [3.2, 0.9, 6.15], [1.6, 0.8, 7.0]]) { const st = box(w, h, 3.2, '#8e1b3a'); st.position.y = y; g.add(st); const tr = box(w + 0.15, 0.12, 3.3, '#ffd23f'); tr.position.y = y + h - 0.02; g.add(tr); }
            for (const x of [-3.7, -2.5, 2.5, 3.7]) { const pil = box(0.35, 5, 0.25, '#b0274d'); pil.position.set(x, 0, 1.75); g.add(pil); }
            // carteles enmarcados en la fachada
            const posterCols = [['#2f6fe0', 'CATALÀ I'], ['#2f9e44', 'CATALÀ II'], ['#7a2340', 'CATALÀ III'], ['#ff7a2b', 'CATALÀ IV']];
            posterCols.forEach(([c, t], k) => {
                const fr = box(0.95, 1.35, 0.06, '#ffd23f'); fr.position.set(k < 2 ? -3.1 + k * 0 : 3.1, 0, 1.73); fr.position.x = [-3.1, -2.0, 2.0, 3.1][k]; fr.position.y = 1.05; g.add(fr);
                const pp = textPlane('', 0.8, { width: 240, height: 340, bg: c, fg: '#ffffff', lines: ['★', t, '7 sessions'], font: 'Bangers', weight: 400, border: 0, radius: 6 });
                pp.geometry = new THREE.PlaneGeometry(0.8, 1.13); pp.position.set(fr.position.x, 1.05, 1.77); g.add(pp);
            });
            await ctx.put(g, 0, 9.5);
            // Rótulo vertical "CINEMA" con bombillas, sobresaliendo de la fachada
            const blade = new THREE.Group();
            const bb = box(0.9, 4.2, 0.5, '#1b1b2f'); blade.add(bb);
            const bt = textPlane('', 3.6, { width: 160, height: 640, bg: '#1b1b2f', fg: '#ffd23f', lines: ['C', 'I', 'N', 'E', 'M', 'A'], font: 'Bangers', weight: 400, border: 0 });
            bt.geometry = new THREE.PlaneGeometry(0.8, 3.6); bt.position.set(0, 2.1, 0.26); blade.add(bt);
            const bt2 = bt.clone(); bt2.position.z = -0.26; bt2.rotation.y = Math.PI; blade.add(bt2);
            const bladeBulbs = [];
            for (let k = 0; k < 14; k++) for (const sx of [-1, 1]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: '#fff2b0', toneMapped: false })); b.position.set(sx * 0.48, 0.15 + k * 0.3, 0.27); blade.add(b); bladeBulbs.push(b); }
            await ctx.put(blade, 0, 9.5 - 1.7 + 0.3, { y: 4.2, rot: Math.PI / 2, dynamic: true });
            ctx.anim((dt, t) => { if (ctx.dynamic.visible) bladeBulbs.forEach((b, j) => b.material.color.set((Math.floor(t * 5) + Math.floor(j / 2)) % 3 ? '#fff2b0' : '#ff7eb3')); });
            // Postes con cordón de terciopelo a los lados de la alfombra
            for (const sd of [4.0, 5.0, 6.0, 7.0]) for (const dx of [-0.95, 0.95]) {
                const st = new THREE.Group();
                const pole = cyl(0.04, 0.05, 0.9, '#d4af37', 8); st.add(pole);
                const ball = sphere(0.07, '#d4af37'); ball.position.y = 0.95; st.add(ball);
                const base = cyl(0.16, 0.18, 0.05, '#d4af37', 12); st.add(base);
                await ctx.put(st, dx, sd);
            }
            for (const dx of [-0.95, 0.95]) {
                const pts = []; for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push(new THREE.Vector3(0, 0.85 - Math.sin((t * 3 % 1) * Math.PI) * 0.15, -1.5 + t * 3)); }
                const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 36, 0.03, 5), M('#b0123a'));
                await ctx.put(rope, dx, 5.5, { face: true });
            }
            // El barrio: el Bar del Cine (bar de barrio de una planta con rótulo luminoso en el tejado),
            // su terraza, quiosco y parada de bus
            const BA = 10.5, BS = 10.5;     // detrás del cine según se llega: entra en el plano de la pregunta
            const bar = new THREE.Group();
            const BW = 7, BH = 3.2, BD = 5;
            const barBody = box(BW, BH, BD, '#e9c9a0'); bar.add(barBody);
            const plinth = box(BW + 0.1, 0.5, BD + 0.1, '#8a3b2a'); bar.add(plinth);
            const cornice = box(BW + 0.3, 0.25, BD + 0.3, '#b0123a'); cornice.position.y = BH; bar.add(cornice);
            // escaparate con el interior iluminado: barra, grifos de cerveza, taburetes y botellas
            const barWin = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.9), new THREE.MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false }));
            barWin.position.set(-0.9, 1.55, BD / 2 + 0.01); bar.add(barWin);
            const barCounter = box(3.8, 0.7, 0.06, '#7a3b24'); barCounter.position.set(-0.9, 0.6, BD / 2 + 0.02); bar.add(barCounter);
            for (let k = 0; k < 4; k++) { const tap = box(0.05, 0.3, 0.03, '#d4af37'); tap.position.set(-2 + k * 0.25, 1.4, BD / 2 + 0.03); bar.add(tap); }
            for (let k = 0; k < 8; k++) { const bt = box(0.09, 0.28, 0.03, ['#2f8a3c', '#7a2340', '#d4af37', '#2f6fe0'][k % 4]); bt.position.set(-2.6 + k * 0.45, 2.15, BD / 2 + 0.03); bar.add(bt); }
            const barShelf = box(4, 0.05, 0.04, '#7a3b24'); barShelf.position.set(-0.9, 2.0, BD / 2 + 0.03); bar.add(barShelf);
            for (let k = 0; k < 4; k++) { const st = cyl(0.13, 0.13, 0.06, '#b0123a', 10); st.rotation.x = Math.PI / 2; st.position.set(-2.2 + k * 0.9, 0.82, BD / 2 + 0.05); bar.add(st); }
            for (const x of [-3.05, 1.25]) { const fr = box(0.12, 2.0, 0.1, '#b0123a'); fr.position.set(x, 0.55, BD / 2 + 0.03); bar.add(fr); }
            const winTop = box(4.4, 0.12, 0.1, '#b0123a'); winTop.position.set(-0.9, 2.5, BD / 2 + 0.03); bar.add(winTop);
            // puerta con el cartel de OBERT
            const barDoor = box(1.0, 2.1, 0.06, '#5a2a1c'); barDoor.position.set(2.3, 0, BD / 2 + 0.02); bar.add(barDoor);
            const dglass = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.0), new THREE.MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false })); dglass.position.set(2.3, 1.35, BD / 2 + 0.06); bar.add(dglass);
            const openSign = textPlane('OBERT', 0.55, { width: 300, height: 110, bg: '#2f8a3c', fg: '#ffffff', border: 6, radius: 10 }); openSign.position.set(2.3, 1.0, BD / 2 + 0.07); bar.add(openSign);
            // toldo a rayas con el faldón "Cafè · Tapes · Cervesa"
            const stripes = document.createElement('canvas'); stripes.width = 128; stripes.height = 16;
            const sg = stripes.getContext('2d'); for (let x = 0; x < 128; x += 16) { sg.fillStyle = (x / 16) % 2 ? '#ffffff' : '#c8102e'; sg.fillRect(x, 0, 16, 16); }
            const stex = new THREE.CanvasTexture(stripes); stex.colorSpace = THREE.SRGBColorSpace; stex.wrapS = THREE.RepeatWrapping; stex.repeat.x = 3;
            const awning = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.06, 1.3), new THREE.MeshToonMaterial({ map: stex }));
            awning.position.set(-0.4, 2.85, BD / 2 + 0.6); awning.rotation.x = 0.32; bar.add(awning);
            const valance = textPlane('', 5.6, { width: 900, height: 70, bg: '#c8102e', fg: '#ffffff', lines: ['Cafè · Tapes · Cervesa'], font: 'Fredoka', weight: 700, border: 0, radius: 0 });
            valance.position.set(-0.4, 2.55, BD / 2 + 1.23); bar.add(valance);
            // rótulo grande en el tejado, con bombillas
            const roofSign = new THREE.Group();
            const rsBack = box(6.2, 1.5, 0.2, '#1b1b2f'); roofSign.add(rsBack);
            const rsText = textPlane('', 5.9, { width: 1000, height: 220, bg: '#b0123a', fg: '#fff2b0', lines: ['BAR DEL CINE'], font: 'Bangers', weight: 400, border: 0, radius: 12 });
            rsText.position.set(0, 0.75, 0.11); roofSign.add(rsText);
            const rsBulbs = [];
            for (let k = 0; k < 16; k++) for (const y of [0.04, 1.46]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: '#fff2b0', toneMapped: false })); b.position.set(-2.9 + k * 0.387, y, 0.13); roofSign.add(b); rsBulbs.push(b); }
            for (const x of [-2.4, 2.4]) { const leg = box(0.1, 0.6, 0.1, '#5b6377'); leg.position.set(x, -0.6, -0.1); roofSign.add(leg); }
            roofSign.position.set(0, BH + 0.85, BD / 2 - 0.4);
            // banderola vertical "BAR" en la esquina, perpendicular a la calle
            const barBlade = new THREE.Group();
            const bl = textPlane('', 1.5, { width: 160, height: 420, bg: '#1b1b2f', fg: '#ff7eb3', lines: ['B', 'A', 'R'], font: 'Bangers', weight: 400, border: 8, borderColor: '#ff7eb3', radius: 10 });
            bl.geometry = new THREE.PlaneGeometry(0.6, 1.6); barBlade.add(bl);
            const bl2 = bl.clone(); bl2.rotation.y = Math.PI; barBlade.add(bl2);
            barBlade.position.set(BW / 2 - 0.05, 2.2, BD / 2 + 0.45); barBlade.rotation.y = Math.PI / 2;
            const barRoot = new THREE.Group(); barRoot.add(bar);
            await ctx.put(barRoot, BA, BS);
            const dyn = new THREE.Group(); dyn.add(roofSign, barBlade);
            await ctx.put(dyn, BA, BS, { dynamic: true });
            ctx.anim((dt, t) => { if (ctx.dynamic.visible) rsBulbs.forEach((b, j) => b.material.color.set((Math.floor(t * 3) + j) % 2 ? '#fff2b0' : '#ffb347')); });
            ctx.reserve(BA, BS, 5);
            // terraza: mesas con sombrillas a rayas, cañas y cafés
            for (const a of [BA - 2.4, BA + 0.4]) {
                await ctx.put('furniture/tableRound', a, 6.9, { height: 0.62 });
                await ctx.put('furniture/chair', a + 0.6, 6.9, { height: 0.8, rot: Math.PI / 2 });
                await ctx.put('furniture/chair', a - 0.6, 6.9, { height: 0.8, rot: -Math.PI / 2 });
                const beer = cyl(0.06, 0.05, 0.2, '#f2b632', 8); beer.position.y = 0.62; await ctx.put(beer, a + 0.12, 6.9);
                const foam = cyl(0.065, 0.065, 0.04, '#ffffff', 8); foam.position.y = 0.84; await ctx.put(foam, a + 0.12, 6.9);
                await ctx.put('food/cup-coffee', a - 0.15, 6.85, { height: 0.12, y: 0.62 });
                const um = new THREE.Group();
                um.add(cyl(0.04, 0.04, 2.3, '#ffffff', 6));
                const cone = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.45, 8), new THREE.MeshToonMaterial({ map: stex })); cone.position.y = 2.3; um.add(cone);
                await ctx.put(um, a, 6.9);
            }
            // pizarra en la acera y barriles de cerveza
            const easelB = new THREE.Group();
            const menuBoard = textPlane('', 1.0, { width: 300, height: 400, bg: '#1b1b2f', fg: '#ffffff', lines: ['MENÚ', 'Braves', 'Croquetes', 'Canya 2€'], font: 'Caveat', weight: 700, border: 10, borderColor: '#8a5a3c', radius: 8 });
            menuBoard.geometry = new THREE.PlaneGeometry(0.9, 1.2); menuBoard.position.set(0, 0.85, 0.05); menuBoard.rotation.x = -0.15; easelB.add(menuBoard);
            for (const x of [-0.35, 0.35]) { const lg = box(0.06, 1.3, 0.06, '#8a5a3c'); lg.rotation.x = -0.15; lg.position.x = x; easelB.add(lg); }
            await ctx.put(easelB, BA + 3.0, 6.6, { rot: -0.3 });
            for (const [a, sd] of [[BA + 3.4, BS - 2.8], [BA + 3.8, BS - 2.1]]) {
                const barrel = cyl(0.32, 0.32, 0.75, '#8a5a3c', 14); await ctx.put(barrel, a, sd);
                const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.025, 6, 16), M('#5b6377')); hoop.rotation.x = Math.PI / 2; hoop.position.y = 0.55; await ctx.put(hoop, a, sd);
            }
            const kiosk = new THREE.Group();
            const kb = box(1.6, 1.8, 1.2, '#2f8a5a'); kiosk.add(kb);
            const kr = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.6, 4), M('#1f5f3e')); kr.rotation.y = Math.PI / 4; kr.position.y = 2.1; kiosk.add(kr);
            const kw = box(1.2, 0.7, 0.05, '#fff3d6'); kw.position.set(0, 1.1, 0.61); kiosk.add(kw);
            for (let k = 0; k < 4; k++) { const mag = box(0.22, 0.3, 0.02, ['#e8173b', '#2f6fe0', '#ffd23f', '#7a2340'][k]); mag.position.set(-0.4 + k * 0.27, 0.6, 0.62); kiosk.add(mag); }
            await ctx.put(kiosk, -9.5, 6.2);
            const busStop = new THREE.Group();
            const roofB = box(2.4, 0.08, 0.9, '#2b2d42'); roofB.position.y = 2.2; busStop.add(roofB);
            const glassB = box(2.3, 1.7, 0.04, new THREE.MeshToonMaterial({ color: '#9fd3f0', transparent: true, opacity: 0.5 })); glassB.position.set(0, 1.2, -0.4); busStop.add(glassB);
            for (const x of [-1.1, 1.1]) { const p = cyl(0.05, 0.05, 2.2, '#2b2d42', 6); p.position.set(x, 0, -0.4); busStop.add(p); }
            const benchB = box(1.6, 0.08, 0.35, '#c58b4e'); benchB.position.set(0, 0.5, -0.2); busStop.add(benchB);
            await ctx.put(busStop, -12.5, 3.6);
            ctx.reserve(0, 9.5, 6.5);
            const msgs = [
                textTexture('', { width: 1024, height: 200, bg: '#1b1b2f', fg: '#fff2b0', lines: ['AVUI:', "PEL·LÍCULA EN CATALÀ"], font: 'Bangers', weight: 400, border: 0 }),
                textTexture('', { width: 1024, height: 200, bg: '#1b1b2f', fg: '#ff7eb3', lines: ['PROPERAMENT…', '(des de sempre)'], font: 'Bangers', weight: 400, border: 0 })
            ];
            const board = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 1.2), new THREE.MeshBasicMaterial({ map: msgs[0], toneMapped: false }));
            await ctx.put(board, 0, 9.5 - 1.7 - 1.42, { y: 3.2, dynamic: true });
            const bulbs = bulbRow(20, 6.4);
            await ctx.put(bulbs, 0, 9.5 - 1.7 - 1.4, { y: 3.92, dynamic: true });
            let k = 0;
            ctx.anim((dt, t) => {
                if (!ctx.dynamic.visible) return;
                const i = Math.floor(t / 2.2) % 2;
                if (i !== k) { k = i; board.material.map = msgs[i]; }
                bulbs.userData.bulbs.forEach((b, j) => b.material.color.set((Math.floor(t * 4) + j) % 2 ? '#fff2b0' : '#ffb347'));
            });
            // Alfombra roja (que no lleva a ningún sitio)
            const carpet = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 4.4), M('#c8102e'));
            carpet.geometry.rotateX(-Math.PI / 2);
            await ctx.put(carpet, 0, 5.7, { y: 0.05 });
            // Cartel de los 7 "sí" en un caballete delante del cine (en la fachada lo tapaba la marquesina)
            const easel = new THREE.Group();
            const PW = 2.2, PH = PW * 420 / 300;
            const poster = textPlane('', PW, { width: 300, height: 420, bg: '#fff3d6', fg: '#1b1b2f', lines: ['¿VAMOS?', 'SÍ ✔', 'SÍ ✔', 'SÍ ✔', 'SÍ ✔', 'SÍ ✔', 'SÍ ✔', 'SÍ ✔'], border: 10, radius: 12 });
            poster.geometry = new THREE.PlaneGeometry(PW, PH);
            poster.position.set(0, 0.7 + PH / 2, 0.07); poster.rotation.x = -0.1;
            const backing = box(PW + 0.16, PH + 0.16, 0.08, '#6b4a2b'); backing.position.set(0, 0.7 + PH / 2, 0); backing.rotation.x = -0.1;
            easel.add(backing, poster);
            for (const x of [-PW * 0.38, PW * 0.38]) { const leg = box(0.1, 2.4, 0.1, '#6b4a2b'); leg.position.set(x, 1.2, 0.12); leg.rotation.x = -0.1; easel.add(leg); }
            const back = box(0.1, 2.6, 0.1, '#6b4a2b'); back.position.set(0, 1.25, -0.42); back.rotation.x = 0.3; easel.add(back);
            await ctx.put(easel, -2.3, 5.2);
            const booth = new THREE.Group();
            booth.add(box(1.3, 2, 1.1, '#ffd23f'));
            const closed = textPlane('TANCAT', 1.1, { width: 400, height: 140, bg: '#e8173b', fg: '#fff', border: 6 });
            closed.position.set(0, 1.3, 0.57); booth.add(closed);
            // "Sala 7 · Sessió pendent" encima de la taquilla (antes tapaba el bar)
            const sala = textPlane('Sala 7 · Sessió pendent', 2.4, { width: 640, height: 130, bg: '#1b1b2f', fg: '#fff2b0', borderColor: '#ffd23f', border: 8 });
            sala.position.set(0, 2.45, 0.2); booth.add(sala);
            await ctx.put(booth, 3.6, 6.4);
            // Palomitas sin tocar y refrescos
            const pop = new THREE.Group();
            pop.add(cyl(0.35, 0.25, 0.7, '#ffffff', 12));
            for (let i = 0; i < 4; i++) { const st = cyl(0.36, 0.26, 0.7, '#e8173b', 4); st.scale.set(0.15, 1, 1.01); st.rotation.y = i * Math.PI / 4; pop.add(st); }
            for (let i = 0; i < 10; i++) { const s = sphere(0.1, '#fff2b0'); s.position.set((rnd() - 0.5) * 0.4, 0.75 + rnd() * 0.15, (rnd() - 0.5) * 0.4); pop.add(s); }
            await ctx.put('furniture/bench', -5, 4.4, { height: 0.6 });
            await ctx.put(pop, -5.4, 4.4, { scale: 0.7, y: 0.45 });
            await ctx.put('food/soda-glass', -4.6, 4.4, { height: 0.35, y: 0.45 });
            // La valla: el coche nunca llega a la sala 🚧
            for (let i = -2; i <= 2; i++) await ctx.put('roads/construction-barrier', i * 1.3, 3.6, { height: 0.9 });
            // Vosotros, ante la puerta cerrada
            await ctx.couple(1.6, 6.8, { her: 'emote-no', him: 'idle', rot: Math.PI });

            // (sin farolas: tapaban el cartel desde la cámara de la parada)
            await ctx.cityBackdrop(18, 24);
        }
    },

    escuela: {
        async build(ctx) {
            await ctx.put(building({ w: 11, d: 6, floors: 3, style: 'brick', shops: false, seed: 31 }), 0, 10.5);
            ctx.reserve(0, 10, 7);

            // Clase al aire libre
            const board = new THREE.Group();
            const bt = textPlane('', 2.6, { width: 512, height: 320, bg: '#24533a', fg: '#ffffff', lines: ['Bon dia! ☀️', 'T\'estimo ❤️', 'Hola! 👋'], borderColor: '#8a5a2b', border: 16, radius: 8, font: 'Caveat', weight: 700 });
            bt.position.y = 1.7;
            board.add(bt);
            for (const x of [-0.95, 0.95]) { const l = cyl(0.05, 0.05, 1.8, '#8a5a2b', 6); l.position.x = x; board.add(l); }
            await ctx.put(board, -6.5, 8);
            for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
                await ctx.put('furniture/desk', -7.5 + c * 2.2, 4.4 + r * 1.6, { height: 0.6, rot: Math.PI });
                await ctx.put('furniture/books', -7.5 + c * 2.2, 4.4 + r * 1.6, { height: 0.15, y: 0.6 });
            }
            // Ella y una compañera en clase; él esperando fuera con flores
            await ctx.put('furniture/chair', -7.5, 3.75, { height: 0.8 });
            await ctx.character(CONFIG.couple.her, -7.5, 3.75, { anim: 'sit', rot: Math.PI, y: SEAT.chair });
            await ctx.character('chars/character-female-b', -5.3, 3.8, { anim: 'emote-yes', rot: Math.PI });
            await ctx.character(CONFIG.couple.him, 4, 4.5, { anim: 'holding-both' });
            await ctx.put('nature/flower_redA', 4, 4.1, { height: 0.5, y: 0.45, dynamic: true });
            const c = flag(SENYERA);
            await ctx.put(c, 6.3, 7, { dynamic: true });
            waveFlag(ctx, c);
            ctx.label('Aprendiendo a decir «t\'estimo» 💛', 8.5, 4, { width: 3.2, height: 2.4 });
            // Valla publicitaria en el tejado: "Centre de Català · Aprenem català!" (se ve por encima de todo)
            const bill = new THREE.Group();
            const BH = 3 * 1.1;                       // altura del edificio (3 plantas de ladrillo)
            const panel = textPlane('', 8.4, { width: 1200, height: 340, bg: '#ffffff', fg: '#da121a', lines: ['CENTRE DE CATALÀ', 'Aprenem català!'], font: 'Bangers', weight: 400, border: 18, borderColor: '#fcdd09', radius: 18 });
            panel.geometry = new THREE.PlaneGeometry(8.4, 8.4 * 340 / 1200);
            panel.position.set(0, BH + 2.5, 0.12); bill.add(panel);
            const back = box(8.7, 2.7, 0.18, '#2b2d42'); back.position.set(0, BH + 1.15, 0); bill.add(back);
            // franjas de la senyera a los lados del panel
            for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) { const st = box(0.12, 2.5, 0.2, k % 2 ? '#da121a' : '#fcdd09'); st.position.set(sx * (4.55 + k * 0.12), BH + 1.25, 0); bill.add(st); }
            for (const x of [-3.2, 0, 3.2]) { const leg = box(0.16, 1.1, 0.16, '#5b6377'); leg.position.set(x, BH, -0.4); bill.add(leg); const br = box(0.1, 1.4, 0.1, '#5b6377'); br.position.set(x, BH, -0.9); br.rotation.x = 0.6; bill.add(br); }
            const walk = box(8.6, 0.06, 0.6, '#5b6377'); walk.position.set(0, BH + 1.05, 0.35); bill.add(walk);
            for (const x of [-3, 0, 3]) { const lamp = box(0.5, 0.12, 0.25, '#2b2d42'); lamp.position.set(x, BH + 4.0, 0.45); bill.add(lamp); }
            await ctx.put(bill, 0, 10.5);
            // Bocadillo de la compañera
            const bub = textPlane('', 2.2, { width: 520, height: 180, bg: '#ffffff', fg: '#1b1b2f', lines: ['Bon dia! 😊'], font: 'Fredoka', weight: 700, border: 8, radius: 60 });
            const bg2 = new THREE.Group(); bub.position.y = 2.5; bg2.add(bub);
            await ctx.put(bg2, -5.3, 3.8, { dynamic: true });
            const by0 = bg2.position.y; ctx.anim((dt, t) => { bg2.position.y = by0 + Math.sin(t * 2.4) * 0.06; });
            // Palabras en catalán que flotan sobre la escuela
            const words = ['Gràcies', 'Si us plau', "T'estimo", 'Bon dia', 'Petons', 'Molt bé!'];
            const floaters = [];
            for (let k = 0; k < words.length; k++) {
                const w = textPlane(words[k], 1.6, { width: 400, height: 110, bg: null, fg: ['#da121a', '#2f6fe0', '#ff4d8d', '#2f9e44', '#7a2340', '#ff7a2b'][k], stroke: '#ffffff', font: 'Bangers', weight: 400, border: 0 });
                const g = new THREE.Group(); g.add(w);
                await ctx.put(g, -5 + k * 2, 10.5, { dynamic: true });
                g.userData.base = g.position.clone(); g.userData.ph = k / words.length;
                floaters.push(g);
            }
            ctx.anim((dt, t) => { if (!ctx.dynamic.visible) return; floaters.forEach((g, k) => { const ph = (t * 0.08 + g.userData.ph) % 1; g.position.copy(g.userData.base); g.position.y += 6 + ph * 5; g.position.x += Math.sin(t + k) * 0.3; g.scale.setScalar(ph < 0.1 ? Math.max(0.001, ph * 10) : ph > 0.85 ? Math.max(0.001, (1 - ph) / 0.15) : 1); }); });
            // Patio: pista con canasta y rayuela (xarranca)
            await ctx.ground(9, 7, '#d9946a', 11, 10, { y: 0.05 });
            ctx.reserve(11, 10, 5.5);
            const hoop = new THREE.Group();
            const hp = cyl(0.08, 0.1, 3, '#2b2d42', 8); hoop.add(hp);
            const bd = box(1.2, 0.8, 0.06, '#ffffff'); bd.position.set(0, 3.1, 0.25); hoop.add(bd);
            const rimH = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.025, 6, 16), M('#ff7a2b')); rimH.rotation.x = Math.PI / 2; rimH.position.set(0, 2.85, 0.55); hoop.add(rimH);
            await ctx.put(hoop, 11, 13.2);
            const ball = sphere(0.14, '#ff7a2b'); ball.position.y = 0.14; await ctx.put(ball, 10.2, 9);
            const hop = new THREE.Group();
            const cells = [[0, 0], [0, 0.55], [-0.28, 1.1], [0.28, 1.1], [0, 1.65], [-0.28, 2.2], [0.28, 2.2], [0, 2.75]];
            cells.forEach(([x, z], k) => { const c = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), M('#ffffff')); c.rotation.x = -Math.PI / 2; c.position.set(x, 0.08, -z); hop.add(c); const n = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), M('#d9946a')); n.rotation.x = -Math.PI / 2; n.position.set(x, 0.085, -z); hop.add(n); });
            await ctx.put(hop, 13.5, 8.2);
            // Valla baja con puerta y aparcabicis
            for (let a = 6.4; a <= 15.6; a += 1.15) { const pk = box(0.08, 0.8, 0.08, '#2f8a5a'); await ctx.put(pk, a, 6.3); }
            const rail = box(9.4, 0.06, 0.06, '#2f8a5a'); rail.position.y = 0.7; await ctx.put(rail, 11, 6.3);
            for (let k = 0; k < 2; k++) {
                const bike = new THREE.Group();
                for (const z of [-0.45, 0.45]) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 6, 18), M('#1b1b22')); w.rotation.y = Math.PI / 2; w.position.set(0, 0.32, z); bike.add(w); }
                const fr = box(0.04, 0.04, 0.9, k ? '#e8173b' : '#2f6fe0'); fr.position.set(0, 0.55, 0); bike.add(fr);
                const seat = box(0.1, 0.05, 0.22, '#1b1b22'); seat.position.set(0, 0.75, -0.2); bike.add(seat);
                const hb = box(0.4, 0.04, 0.04, '#c7ccd8'); hb.position.set(0, 0.8, 0.35); bike.add(hb);
                await ctx.put(bike, 5 + k * 0.7, 7.2);
            }
            await ctx.lamps();
            await ctx.trees(['nature/tree_oak', 'nature/tree_fat'], 6, 14, 22);
        }
    },

    grandesAlmacenes: {
        async build(ctx) {
            const P = ctx.props;
            const big = P.big ? 1.25 : 1;
            const ci = building({ w: 12 * big, d: 8, floors: 7, style: 'almacenes', seed: 41 });
            await ctx.put(ci, 0, 12);
            ctx.reserve(0, 12, 8);
            for (const [a, st, fl] of [[-11, 'eixample', 5], [11, 'stone', 6]]) await ctx.put(building({ w: 7, d: 6, floors: fl, style: st, seed: a + 50 }), a, 11);
            // Rótulo en la fachada (como el de verdad), dentro del encuadre de la cámara
            const logo = textPlane('', 5.4 * big, { width: 900, height: 240, bg: '#ffffff', fg: '#1f4e8c', lines: ['Grans Magatzems'], font: 'Playfair Display', weight: 700, borderColor: '#1f4e8c', border: 10 });
            await ctx.put(logo, 0, 12 - 4.12, { y: ci.userData.height - 1.6 });
            // Y otro sobre la entrada, a la altura que ve la cámara de las paradas
            const entry = new THREE.Group();
            const canopy = box(5.2 * big, 0.12, 1.2, '#1f4e8c'); canopy.position.set(0, 1.42, 0.6); entry.add(canopy);
            const sign = textPlane('', 4.6 * big, { width: 900, height: 200, bg: '#1f4e8c', fg: '#ffffff', lines: ['Grans Magatzems'], font: 'Playfair Display', weight: 700, borderColor: '#ffffff', border: 8 });
            sign.position.set(0, 2.05, 0.1); entry.add(sign);
            await ctx.put(entry, 0, 12 - 4.05);
            ctx.label(P.label || '', 5, 4.2, { width: 2.8, height: 2.6, opts: { bg: '#1f4e8c', fg: '#fff' } });
            for (const a of [-5, -3.2, 3.2]) await ctx.put('town/hedge-large', a, 7.4, { height: 1 });
            await ctx.lamps();
            await ctx.cityBackdrop(20, 27);

            if (P.flashes) {
                // Plaça Catalunya: fuente, palomas y la era de las fotos 📸
                await ctx.put('town/fountain-round', -6, 6.5, { height: 0.6 });
                const water = new THREE.Mesh(new THREE.CircleGeometry(1.7, 24), M('#5fd0ef'));
                water.geometry.rotateX(-Math.PI / 2);
                await ctx.put(water, -6, 6.5, { y: 0.45 });
                for (const [a, sd] of [[-9, 4], [-3, 4], [-9, 9]]) await ctx.put('furniture/bench', a, sd, { height: 0.6 });
                // Palomas que picotean
                for (let i = 0; i < 8; i++) {
                    const pg = new THREE.Group();
                    const b = sphere(0.12, i % 3 ? '#9aa3b5' : '#e6e6ee'); b.scale.set(1, 0.8, 1.4); b.position.y = 0.12; pg.add(b);
                    const hd = sphere(0.07, '#7d8597'); hd.position.set(0, 0.24, 0.13); pg.add(hd);
                    await ctx.put(pg, -8 + rnd() * 6, 4.5 + rnd() * 3.5, { dynamic: true, rot: rnd() * 6 });
                    const ph = rnd() * 6;
                    ctx.anim((dt, t) => { if (ctx.dynamic.visible) hd.position.y = 0.2 + Math.max(0, Math.sin(t * 5 + ph)) * 0.06; });
                }
                // Selfie junto a la fuente
                await ctx.couple(-3.6, 5.8, { her: 'interact-right', him: 'emote-yes', gap: 0.5 });
                const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
                const flash = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 12), flashMat);
                await ctx.put(flash, -3.6, 5.2, { y: 1.4, dynamic: true });
                const tex = await imageTexture('assets/happy_couple_travel_1776806740487.webp');
                const pols = [];
                for (let i = 0; i < 5; i++) {
                    const p = polaroid(tex, 0.9);
                    await ctx.put(p, -3.6, 5.6, { y: 1.6, dynamic: true });
                    p.userData.base = p.position.clone();
                    p.userData.phase = i / 5;
                    pols.push(p);
                }
                ctx.anim((dt, t) => {
                    if (!ctx.dynamic.visible) return;
                    const c = (t * 0.45) % 1;
                    flashMat.opacity = c < 0.06 ? 0.9 * (1 - c / 0.06) : 0;
                    pols.forEach((p, i) => {
                        const k = (t * 0.22 + p.userData.phase) % 1;
                        p.position.copy(p.userData.base).add(new THREE.Vector3(Math.cos(i * 1.7) * k * 3, k * 5, Math.sin(i * 1.7) * k * 3));
                        p.rotation.z = Math.sin(t + i) * 0.4;
                        p.scale.setScalar(k < 0.1 ? Math.max(0.001, k * 10) : (k > 0.85 ? (1 - k) / 0.15 : 1));
                    });
                });
            } else {
                // De compras
                await ctx.couple(-4, 5, { anim: 'holding-both', gap: 0.7 });
                await ctx.put('food/bag', -4.4, 5.3, { height: 0.45, dynamic: true });
                await ctx.put('food/bag', -3.6, 5.3, { height: 0.45, dynamic: true });
                await ctx.walker('chars/character-male-a', [-9, 3.4], [9, 3.2]);
                await ctx.put('town/stall-green', 6.5, 6.5, { height: 2.4 });
            }
        }
    },

    // Plaça Catalunya: la plaza redonda con la estrella del suelo, las fuentes, el monumento a Macià
    // (la escalera invertida), los plátanos, las palomas, el metro y los grandes almacenes detrás
    placaCatalunya: {
        terrain(ctx) { const c = ctx.pos(2, 17); ctx.track.addFlat(c.x, c.z, 26); },
        async build(ctx) {
            const C = { a: 2, s: 17 };                 // centro de la plaza (along, side)
            const center = ctx.pos(C.a, C.s);
            const t = ctx.track;
            const flatDisc = (r, color, y, segs = 48) => { const m = new THREE.Mesh(new THREE.CircleGeometry(r, segs).rotateX(-Math.PI / 2), M(color)); m.position.copy(center).y += y; ctx.group.add(m); return m; };
            // Pavimento: explanada, anillo de parterres y la estrella central
            const pav = new THREE.Mesh(new THREE.PlaneGeometry(46, 30).rotateX(-Math.PI / 2), M('#e6dccb'));
            await ctx.put(pav, C.a, C.s, { y: 0.05 });
            flatDisc(12.5, '#7fb069', 0.07);
            flatDisc(10.8, '#ece3d2', 0.09);
            const sc = document.createElement('canvas'); sc.width = sc.height = 512;
            const x = sc.getContext('2d');
            x.fillStyle = '#ece3d2'; x.fillRect(0, 0, 512, 512);
            x.translate(256, 256);
            for (let r = 250; r > 40; r -= 42) { x.strokeStyle = '#c9b48f'; x.lineWidth = 3; x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.stroke(); }
            for (let i = 0; i < 16; i++) {
                const a = i * Math.PI / 8, long = i % 2 === 0 ? 240 : 150;
                x.fillStyle = i % 4 === 0 ? '#b5523b' : i % 2 === 0 ? '#8a8f9a' : '#d9c7a6';
                x.beginPath(); x.moveTo(0, 0);
                x.lineTo(Math.cos(a - 0.12) * 40, Math.sin(a - 0.12) * 40); x.lineTo(Math.cos(a) * long, Math.sin(a) * long); x.lineTo(Math.cos(a + 0.12) * 40, Math.sin(a + 0.12) * 40);
                x.closePath(); x.fill();
            }
            x.fillStyle = '#b5523b'; x.beginPath(); x.arc(0, 0, 26, 0, Math.PI * 2); x.fill();
            const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
            const star = new THREE.Mesh(new THREE.CircleGeometry(7.5, 48).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: st }));
            star.position.copy(center).y += 0.11; ctx.group.add(star);
            // Fuentes con chorros
            const sprays = [];
            for (const [da, ds] of [[-9, -6], [9, 6]]) {
                const p = ctx.pos(C.a + da, C.s + ds);
                const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.5, 32), M('#d9d2c3')); basin.position.copy(p).y += 0.3; ctx.group.add(basin);
                const water = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32).rotateX(-Math.PI / 2), M('#5fd0ef')); water.position.copy(p).y += 0.56; ctx.group.add(water);
                const col = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.4, 12), M('#d9d2c3')); col.position.copy(p).y += 1.1; ctx.group.add(col);
                const spray = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.6, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xcff4ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
                spray.rotation.x = Math.PI; spray.position.copy(p).y += 2.3; ctx.dynamic.add(spray); sprays.push(spray);
            }
            ctx.anim((dt, tm) => { if (ctx.dynamic.visible) sprays.forEach((sp, i) => { sp.scale.y = 1 + Math.sin(tm * 6 + i) * 0.08; sp.material.opacity = 0.4 + Math.sin(tm * 3 + i) * 0.1; }); });
            // Monumento a Macià: la escalera invertida
            const mon = new THREE.Group();
            const stone = M('#aaa49a');
            mon.add(box(1.6, 1.2, 1.6, '#c7c2b8'));
            for (let i = 0; i < 8; i++) { const step = box(0.9, 0.42, 0.42 + i * 0.36, stone); step.position.set(0, 1.2 + i * 0.42 + 0.21, -(i * 0.36) / 2 + 0.6); mon.add(step); }
            mon.rotation.y = 0;
            await ctx.put(mon, C.a + 13, C.s - 8.5);
            ctx.label('Monument a Macià', C.a + 13, C.s - 11.3, { width: 2.6, height: 1.6, opts: { bg: '#f6efe2', fg: '#1b1b2f' } });
            // Estatuas en peanas
            for (const [da, ds] of [[-12, 6], [12, -1]]) {
                const g = new THREE.Group();
                g.add(box(0.9, 1.1, 0.9, '#e2dbcd'));
                const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.7, 4, 10), M('#8a6b3d')); body.position.y = 1.65; g.add(body);
                const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), M('#8a6b3d')); head.position.y = 2.2; g.add(head);
                await ctx.put(g, C.a + da, C.s + ds);
            }
            // Plátanos (árboles) alrededor y bancos
            for (let i = 0; i < 14; i++) {
                const a = (i / 14) * Math.PI * 2;
                const p = new THREE.Vector3(center.x + Math.cos(a) * 12.8, 0, center.z + Math.sin(a) * 12.8);
                const d = t.nearest(p.x, p.z, 20);
                if (d && d.dist < 5.5) continue;
                ctx.world.plantTree('oak', p.x, p.z, 1.35, a, t.heightAt(p.x, p.z) - 0.03);
            }
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2 + 0.3;
                const b = await model('furniture/bench');
                const h = new THREE.Box3().setFromObject(b).getSize(new THREE.Vector3()).y || 1;
                b.scale.multiplyScalar(0.6 / h);
                b.position.set(center.x + Math.cos(a) * 9.6, center.y + 0.1, center.z + Math.sin(a) * 9.6);
                b.rotation.y = -a - Math.PI / 2;
                ctx.group.add(b);
            }
            // Farolas
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2 + 0.2;
                const lm = await model('town/lantern');
                const h = new THREE.Box3().setFromObject(lm).getSize(new THREE.Vector3()).y || 1;
                lm.scale.multiplyScalar(2.6 / h);
                lm.position.set(center.x + Math.cos(a) * 11.4, center.y + 0.05, center.z + Math.sin(a) * 11.4);
                ctx.group.add(lm);
            }
            // Metro: rombo rojo con la M y la boca de escaleras
            const metro = new THREE.Group();
            const sign = textPlane('M', 0.9, { width: 256, height: 256, bg: '#e8173b', fg: '#ffffff', border: 0, radius: 30, font: 'Fredoka', weight: 700, size: 200 });
            sign.rotation.z = Math.PI / 4; sign.position.y = 2.6; metro.add(sign, cyl(0.06, 0.06, 2.2, '#3b3f4f', 8));
            const hole = box(1.6, 0.05, 2.6, '#2a2d3a'); hole.position.set(1.4, 0.02, -0.6); metro.add(hole);
            for (const sx of [0.55, 2.25]) { const rail = box(0.06, 0.8, 2.6, '#3b3f4f'); rail.position.set(sx, 0.4, -0.6); metro.add(rail); }
            await ctx.put(metro, -ctx.len / 2 + 8, 4.2);
            ctx.label('Pl. Catalunya', -ctx.len / 2 + 11, 4.2, { width: 2.8, height: 2.4, opts: { bg: '#e8173b', fg: '#ffffff' } });
            // Palomas
            for (let i = 0; i < 16; i++) {
                const pg = new THREE.Group();
                const b = sphere(0.12, i % 3 ? '#9aa3b5' : '#e6e6ee'); b.scale.set(1, 0.8, 1.4); b.position.y = 0.12; pg.add(b);
                const hd = sphere(0.07, '#7d8597'); hd.position.set(0, 0.24, 0.13); pg.add(hd);
                const a = rnd() * Math.PI * 2, r = 3 + rnd() * 6;
                pg.position.set(center.x + Math.cos(a) * r, center.y + 0.1, center.z + Math.sin(a) * r);
                pg.rotation.y = rnd() * 6;
                ctx.dynamic.add(pg);
                const ph = rnd() * 6;
                ctx.anim((dt, tm) => { if (ctx.dynamic.visible) hd.position.y = 0.2 + Math.max(0, Math.sin(tm * 5 + ph)) * 0.06; });
            }
            // Vosotros haciendo un selfie junto a la estrella, con flashes y polaroids
            await ctx.couple(C.a - 6, C.s - 5.5, { her: 'interact-right', him: 'emote-yes', gap: 0.5 });
            const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
            const flash = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 12), flashMat);
            await ctx.put(flash, C.a - 6, C.s - 6.2, { y: 1.4, dynamic: true });
            const tex = await imageTexture('assets/happy_couple_travel_1776806740487.webp');
            const pols = [];
            for (let i = 0; i < 5; i++) {
                const p = polaroid(tex, 0.9);
                await ctx.put(p, C.a - 6, C.s - 5.8, { y: 1.6, dynamic: true });
                p.userData.base = p.position.clone(); p.userData.phase = i / 5;
                pols.push(p);
            }
            ctx.anim((dt, tm) => {
                if (!ctx.dynamic.visible) return;
                const c = (tm * 0.45) % 1;
                flashMat.opacity = c < 0.06 ? 0.9 * (1 - c / 0.06) : 0;
                pols.forEach((p, i) => {
                    const k = (tm * 0.22 + p.userData.phase) % 1;
                    p.position.copy(p.userData.base).add(new THREE.Vector3(Math.cos(i * 1.7) * k * 3, k * 5, Math.sin(i * 1.7) * k * 3));
                    p.rotation.z = Math.sin(tm + i) * 0.4;
                    p.scale.setScalar(k < 0.1 ? Math.max(0.001, k * 10) : (k > 0.85 ? (1 - k) / 0.15 : 1));
                });
            });
            // Edificios alrededor: los grandes almacenes al fondo, el de la cúpula y bloques del Eixample
            const ci = building({ w: 26, d: 11, floors: 9, style: 'almacenes', seed: 71 });
            await ctx.put(ci, C.a + 2, C.s + 19);
            const logo = textPlane('', 9, { width: 1000, height: 220, bg: '#ffffff', fg: '#1f4e8c', lines: ['Grans Magatzems'], font: 'Playfair Display', weight: 700, borderColor: '#1f4e8c', border: 10 });
            await ctx.put(logo, C.a + 2, C.s + 19 - 5.56, { y: ci.userData.height + 1.6 });
            await ctx.put(domeBuilding({ w: 9, d: 9, floors: 7, seed: 72 }), C.a - 21, C.s + 14);
            await ctx.put(building({ w: 9, d: 8, floors: 8, style: 'stone', seed: 73 }), C.a + 24, C.s + 12);
            await ctx.put(building({ w: 8, d: 7, floors: 7, style: 'eixample', seed: 74 }), C.a + 24, C.s - 2);
            await ctx.put(building({ w: 8, d: 7, floors: 6, style: 'eixample', seed: 75 }), C.a - 23, C.s + 1);
            const fl = flag(SENYERA, { pole: 2.2 });
            await ctx.put(fl, C.a + 24, C.s + 12, { y: 8 * 1.3 + 0.4, dynamic: true });
            waveFlag(ctx, fl);
            // Al otro lado de la calle: más Eixample
            for (let i = 0; i < 4; i++) await ctx.put(building({ w: 9, d: 6, floors: 6 + (i % 3), style: i % 2 ? 'stone' : 'eixample', seed: 80 + i }), -24 + i * 13, -9);
            ctx.reserve(C.a, C.s, 26);
            ctx.reserve(0, -9, 6);
        }
    },

    // El box del gimnasio: nave de chapa con el portón abierto, el rig, barras con discos de colores,
    // cajones, kettlebells, rueda, cuerdas... y el cajón volcado de la pregunta 🙈
    gimnasio: {
        terrain(ctx) { const c = ctx.pos(0, 10); ctx.track.addFlat(c.x, c.z, 18); },
        async build(ctx) {
            const metal = new THREE.MeshToonMaterial({ map: corrugatedTexture() });
            const rubber = M('#2c3040'), steel = M('#c7ccd8'), black = M('#1e2130'), wood = M('#c58b4e');
            const W = 13, D = 9, H = 4.6, SIDE = 15;
            // --- La nave ---
            const shed = new THREE.Group();
            const wall = (w, h, d, x, y, z) => { const m = new THREE.Mesh(metricUV(new THREE.BoxGeometry(w, h, d), 1.2), metal); m.position.set(x, y, z); shed.add(m); };
            wall(W, H, 0.2, 0, H / 2, -D / 2);                           // fondo
            for (const sx of [-1, 1]) wall(0.2, H, D, sx * W / 2, H / 2, 0); // laterales
            const doorW = 6.4, doorH = 3.6;
            wall((W - doorW) / 2, H, 0.2, -(W + doorW) / 4, H / 2, D / 2);    // fachada a los lados del portón
            wall((W - doorW) / 2, H, 0.2, (W + doorW) / 4, H / 2, D / 2);
            wall(doorW, H - doorH, 0.2, 0, doorH + (H - doorH) / 2, D / 2);
            const rollup = box(doorW, 0.5, 0.35, '#5b6377'); rollup.position.set(0, doorH + 0.05, D / 2 + 0.1); shed.add(rollup);
            // tejado de bóveda rebajada con sus hastiales
            const RV = 0.32;
            const roofM = new THREE.Mesh(new THREE.CylinderGeometry(D / 2 + 0.3, D / 2 + 0.3, W + 0.5, 28, 1, true, 0, Math.PI), new THREE.MeshToonMaterial({ color: '#97a0b3', side: THREE.DoubleSide }));
            roofM.rotation.z = Math.PI / 2; roofM.scale.x = RV; roofM.position.y = H; shed.add(roofM);
            for (const sx of [-1, 1]) {
                const sh = new THREE.Shape(); sh.absellipse(0, 0, D / 2 + 0.3, (D / 2 + 0.3) * RV, 0, Math.PI, false);
                const cap = new THREE.Mesh(new THREE.ShapeGeometry(sh, 20), M('#7c8598')); cap.rotation.y = sx * Math.PI / 2; cap.position.set(sx * (W / 2 + 0.1), H, 0); shed.add(cap);
            }
            for (let k = -2; k <= 2; k++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(D / 2 + 0.32, 0.05, 4, 20, Math.PI), M('#6f788c')); rib.rotation.y = Math.PI / 2; rib.scale.y = RV; rib.position.set(k * W / 5, H, 0); shed.add(rib); }
            // suelo de caucho dentro y forro oscuro (para que el portón abierto se lea como hueco)
            const floorIn = box(W - 0.4, 0.06, D - 0.4, rubber); shed.add(floorIn);
            const lining = M('#3b4152');
            const inBack = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.4, H), lining); inBack.position.set(0, H / 2, -D / 2 + 0.11); shed.add(inBack);
            for (const sx of [-1, 1]) { const inSide = new THREE.Mesh(new THREE.PlaneGeometry(D - 0.4, H), lining); inSide.rotation.y = -sx * Math.PI / 2; inSide.position.set(sx * (W / 2 - 0.11), H / 2, 0); shed.add(inSide); }
            const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.4, D - 0.4), M('#2a2e3c')); ceil.rotation.x = Math.PI / 2; ceil.position.y = H - 0.05; shed.add(ceil);
            for (const x of [-3, 0, 3]) { const lamp = box(1.6, 0.06, 0.2, glow('#fff6e0')); lamp.position.set(x, H - 0.12, 0.5); shed.add(lamp); }
            // dentro: remos, wall balls, diana y rack de discos
            for (let k = 0; k < 3; k++) {
                const row = new THREE.Group();
                const rail = box(0.12, 0.08, 2.0, '#1e2130'); rail.position.y = 0.35; row.add(rail);
                const fly = cyl(0.32, 0.32, 0.22, '#1e2130', 20); fly.rotation.z = Math.PI / 2; fly.position.set(0, 0.55, -0.95); row.add(fly);
                const seat = box(0.3, 0.08, 0.32, '#2f6fe0'); seat.position.set(0, 0.45, 0.3); row.add(seat);
                const mon = box(0.25, 0.2, 0.04, '#7ad7ff'); mon.position.set(0, 1.05, -0.8); row.add(mon);
                const arm = cyl(0.02, 0.02, 0.5, '#1e2130', 6); arm.position.set(0, 0.8, -0.85); row.add(arm);
                row.position.set(-4.4 + k * 1.2, 0, -1.4); shed.add(row);
            }
            const target = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), M('#e8173b')); target.position.set(3.6, 3.2, -D / 2 + 0.12); shed.add(target);
            const target2 = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.3, 20), M('#ffffff')); target2.position.set(3.6, 3.2, -D / 2 + 0.13); shed.add(target2);
            for (let k = 0; k < 5; k++) { const wb = sphere(0.24, ['#2f6fe0', '#e8173b', '#1e2130'][k % 3]); wb.position.set(2.6 + k * 0.5, 0.27, -D / 2 + 0.6); shed.add(wb); }
            const plateCols = ['#e8173b', '#2f6fe0', '#ffd23f', '#2f9e44'];
            const rack = box(2.2, 0.08, 0.5, '#1e2130'); rack.position.set(-0.4, 0.04, -D / 2 + 0.45); shed.add(rack);
            for (let k = 0; k < 8; k++) { const r = 0.42 - (k % 4) * 0.06; const pl = cyl(r, r, 0.08, plateCols[k % 4], 20); pl.rotation.z = Math.PI / 2; pl.position.set(-1.3 + k * 0.25, r + 0.08, -D / 2 + 0.45); shed.add(pl); }
            // banderas colgando del techo
            for (const [x, c] of [[-3, '#ffd23f'], [0, '#e8173b'], [3, '#2f6fe0']]) { const f = box(1.2, 0.8, 0.02, c); f.position.set(x, H - 0.6, -1); shed.add(f); }
            await ctx.put(shed, 0, SIDE);
            ctx.reserve(0, SIDE, 9);
            const sign = textPlane('', 6, { width: 900, height: 200, bg: '#1b1b2f', fg: '#ffd23f', lines: ['TRAINING · BOX'], font: 'Bangers', weight: 400, border: 10, borderColor: '#ffd23f' });
            await ctx.put(sign, 0, SIDE - D / 2 - 0.15, { y: H + 0.55 });

            // --- Zona exterior ---
            const rt = rubberTexture(); rt.repeat.set(22 / 1.5, 7 / 1.5);
            await ctx.ground(22, 7, new THREE.MeshToonMaterial({ map: rt }), -3, 6.4, { y: 0.05 });
            for (const a of [-12, -6, 0, 6]) ctx.reserve(a, 6.4, 4.5);
            const rt2 = rubberTexture().clone(); rt2.repeat.set(9 / 1.5, 6 / 1.5); rt2.needsUpdate = true;
            await ctx.ground(9, 6, new THREE.MeshToonMaterial({ map: rt2 }), 12, 5.8, { y: 0.05 });
            for (const a of [10, 14]) ctx.reserve(a, 5.8, 4);
            // rig de dominadas con cuerda de trepar y anillas
            const rig = new THREE.Group();
            for (let k = 0; k < 4; k++) { const p = cyl(0.08, 0.08, 3, '#1b1b22', 8); p.position.set(-3 + k * 2, 1.5, 0); rig.add(p); for (const dz of [-1, 1]) { const q = cyl(0.06, 0.06, 3, '#1b1b22', 8); q.position.set(-3 + k * 2, 1.5, dz * 1.1); rig.add(q); } }
            for (const dz of [-1.1, 0, 1.1]) { const top = cyl(0.05, 0.05, 6.2, '#e8173b', 8); top.rotation.z = Math.PI / 2; top.position.set(0, 2.95, dz); rig.add(top); }
            const rope = cyl(0.04, 0.04, 2.6, '#d9c39a', 6); rope.position.set(-2, 1.65, 1.1); rig.add(rope);
            for (const x of [1.6, 2.3]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 6, 14), M('#c58b4e')); r.position.set(x, 1.9, -1.1); rig.add(r); const st = cyl(0.01, 0.01, 1.0, '#d9c39a', 4); st.position.set(x, 2.45, -1.1); rig.add(st); }
            await ctx.put(rig, -10, 7.5);
            // barras con discos de colores
            const barbell = (cols) => {
                const b = new THREE.Group();
                const shaft = cyl(0.035, 0.035, 2.2, '#c7ccd8', 8); shaft.rotation.z = Math.PI / 2; shaft.position.y = 0.45; b.add(shaft);
                cols.forEach((c, i) => { for (const sx of [-1, 1]) { const pl = cyl(0.45 - i * 0.07, 0.45 - i * 0.07, 0.1, c, 20); pl.rotation.z = Math.PI / 2; pl.position.set(sx * (0.8 + i * 0.11), 0.45, 0); b.add(pl); } });
                return b;
            };
            await ctx.put(barbell(['#e8173b', '#ffd23f']), -4.5, 4.4);
            await ctx.put(barbell(['#2f6fe0']), -2, 4.6, { rot: 0.2 });
            // cajones de salto (uno volcado: ¡la caída del cajón!)
            const plyo = () => { const g = new THREE.Group(); const bx = box(0.75, 0.6, 0.6, '#c58b4e'); bx.position.y = 0.3; g.add(bx); const lbl = box(0.4, 0.12, 0.01, '#1b1b2f'); lbl.position.set(0, 0.32, 0.305); g.add(lbl); return g; };
            await ctx.put(plyo(), 1, 7.2);
            await ctx.put(plyo(), 1.9, 7.2, { rot: 0.1 });
            const fallen = plyo(); fallen.rotation.z = Math.PI / 2; fallen.position.y = 0.075;
            const fg = new THREE.Group(); fg.add(fallen);
            await ctx.put(fg, 3.4, 5.6, { rot: 0.5 });
            const ups = textPlane('¡Ups! 🙈', 1.5, { width: 400, height: 140, bg: '#ffffff', fg: '#e8173b', font: 'Bangers', weight: 400, border: 6 });
            const ug = new THREE.Group(); ups.position.y = 1.6; ug.add(ups);
            await ctx.put(ug, 3.4, 5.6, { dynamic: true });
            const ups0 = ug.position.y;
            ctx.anim((dt, t) => { ug.position.y = ups0 + Math.abs(Math.sin(t * 3)) * 0.15; });
            await ctx.character('chars/character-female-f', 4.3, 6.4, { anim: 'emote-no', rot: -0.6 });
            // kettlebells en fila, rueda gigante, cuerdas de batalla y trineo
            for (let i = 0; i < 6; i++) {
                const k = new THREE.Group();
                const ss = sphere(0.22 + (i % 3) * 0.04, ['#1e2130', '#e8173b', '#2f6fe0'][i % 3]); ss.position.y = 0.24; k.add(ss);
                const h = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.04, 8, 16, Math.PI), black); h.position.y = 0.46; k.add(h);
                await ctx.put(k, 6 + i * 0.6, 3.6);
            }
            const tireG = new THREE.Group();
            const tr = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.32, 10, 24), black); tr.rotation.x = Math.PI / 2; tr.position.y = 0.32; tireG.add(tr);
            await ctx.put(tireG, 9.5, 6.4);
            const ropes = new THREE.Group();
            for (const dz of [-0.25, 0.25]) {
                const pts = []; for (let k = 0; k <= 16; k++) { const t = k / 16; pts.push(new THREE.Vector3(-2 + t * 4, 0.08 + Math.abs(Math.sin(t * Math.PI * 3)) * 0.12, dz + Math.sin(t * Math.PI * 4) * 0.12)); }
                ropes.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.05, 6), M('#1b1b22')));
            }
            const anchor = cyl(0.12, 0.15, 0.5, '#5b6377', 10); anchor.position.set(-2.1, 0.25, 0); ropes.add(anchor);
            await ctx.put(ropes, 12.5, 7.6, { rot: 0.1 });
            const sled = new THREE.Group();
            const sb = box(0.9, 0.12, 0.6, '#e8173b'); sb.position.y = 0.12; sled.add(sb);
            for (const x of [-0.25, 0.25]) { const post = cyl(0.04, 0.04, 0.9, '#c7ccd8', 8); post.position.set(x, 0.55, -0.2); sled.add(post); }
            const pl2 = cyl(0.3, 0.3, 0.08, '#ffd23f', 16); pl2.rotation.x = Math.PI / 2; pl2.position.set(0, 0.45, 0.05); sled.add(pl2);
            await ctx.put(sled, 14.5, 4.8, { rot: -0.3 });
            // pizarra con el WOD
            const wod = textPlane('', 2.2, { width: 512, height: 360, bg: '#ffffff', fg: '#1b1b2f', lines: ['WOD de hoy:', '21-15-9 besos', '+ 100 abrazos', 'Time cap: ∞'], font: 'Caveat', weight: 700, border: 12 });
            const wg = new THREE.Group(); wod.position.y = 1.7; wg.add(wod);
            for (const x of [-0.9, 0.9]) { const lg = cyl(0.04, 0.04, 1.4, '#5b6377', 6); lg.position.set(x, 0.7, -0.05); wg.add(lg); }
            await ctx.put(wg, -6.6, 3.7, { rot: 0.25 });
            // Tu iniciación: ella saltando a la comba, él animándola
            await ctx.character(CONFIG.couple.her, -6, 6.2, { anim: 'jump' });
            await ctx.character(CONFIG.couple.him, -4.6, 6.6, { anim: 'emote-yes', rot: -0.6 });
            await ctx.lamps(14);
            await ctx.cityBackdrop(23, 29);
        }
    },

    // València: la Ciutat de les Arts i les Ciències (Hemisfèric con su reflejo, Museu, Palau,
    // Umbracle), estanques turquesa, naranjos y una paella gigante con una amiga
    valencia: {
        terrain(ctx) { for (const a of [-14, 0, 14]) { const c = ctx.pos(a, 15); ctx.track.addFlat(c.x, c.z, 16); } },
        async build(ctx) {
            const W = ctx.world;
            const plant = (kind, a, sd, sc = 1) => { const p = ctx.pos(a, sd); W.plantTree(kind, p.x, p.z, sc, rnd() * 6, p.y - 0.03); };
            const white = M('#f4f6fb'), glassM = M('#9fd3f0'), trenc = M('#e9eef5');
            // Estanque con el reflejo del Hemisfèric pintado en el agua (el ojo se completa abajo)
            const wc = document.createElement('canvas'); wc.width = 512; wc.height = 160;
            const wg = wc.getContext('2d');
            const grd = wg.createLinearGradient(0, 0, 0, 160); grd.addColorStop(0, '#46d2ec'); grd.addColorStop(1, '#1fa8cf');
            wg.fillStyle = grd; wg.fillRect(0, 0, 512, 160);
            wg.fillStyle = 'rgba(255,255,255,.28)';
            wg.beginPath(); wg.ellipse(256, 6, 205, 64, 0, 0, Math.PI); wg.fill();           // el párpado reflejado
            wg.fillStyle = 'rgba(255,255,255,.35)'; wg.beginPath(); wg.ellipse(256, 6, 52, 40, 0, 0, Math.PI); wg.fill();
            wg.strokeStyle = 'rgba(255,255,255,.35)'; wg.lineWidth = 2;
            for (let k = 0; k < 14; k++) { const y = 40 + k * 9, x = 30 + (k * 97) % 400; wg.beginPath(); wg.moveTo(x, y); wg.lineTo(x + 40 + (k % 3) * 20, y); wg.stroke(); }
            const wtex = new THREE.CanvasTexture(wc); wtex.colorSpace = THREE.SRGBColorSpace;
            const POOL = { a: -2, s: 14.6, w: 30, d: 10 };
            await ctx.put(box(POOL.w + 0.7, 0.12, POOL.d + 0.7, '#e6e1d6'), POOL.a, POOL.s);
            const water = new THREE.Mesh(new THREE.PlaneGeometry(POOL.w, POOL.d), new THREE.MeshBasicMaterial({ map: wtex, toneMapped: false }));
            water.geometry.rotateX(-Math.PI / 2);
            await ctx.put(water, POOL.a, POOL.s, { y: 0.13 });
            ctx.reserve(POOL.a, POOL.s, 15);

            // L'Hemisfèric: concha blanca detrás, fachada de cristal con nervios blancos (las pestañas)
            // y el iris (la cúpula) dentro; está justo en el borde del agua para que el reflejo case
            const eye = new THREE.Group();
            const back = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 14, Math.PI, Math.PI, 0, Math.PI / 2), white);
            back.scale.set(7, 2.9, 3.4); eye.add(back);
            const front = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 14, 0, Math.PI, 0, Math.PI / 2), new THREE.MeshToonMaterial({ color: '#7fc4e6', transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
            front.scale.set(7, 2.9, 3.4); eye.add(front);
            for (let k = 1; k < 12; k++) {      // nervios (meridianos) sobre el cristal
                const phi = k / 12 * Math.PI, pts = [];
                for (let j = 0; j <= 12; j++) { const th = j / 12 * Math.PI / 2; pts.push(new THREE.Vector3(-Math.cos(phi) * Math.sin(th) * 7, Math.cos(th) * 2.9, Math.sin(phi) * Math.sin(th) * 3.4)); }
                eye.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.08, 5), white));
            }
            const lidPts = []; for (let j = 0; j <= 30; j++) { const phi = j / 30 * Math.PI; lidPts.push(new THREE.Vector3(-Math.cos(phi) * 7.05, 0.15, Math.sin(phi) * 3.45)); }
            eye.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lidPts), 40, 0.16, 6), white));
            const iris = new THREE.Mesh(new THREE.SphereGeometry(1.75, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), M('#ffffff')); eye.add(iris);
            const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20), M('#2b3a55')); pupil.position.set(0, 1.2, 1.48); pupil.lookAt(0, 2.4, 3.2); eye.add(pupil);
            await ctx.put(eye, POOL.a, POOL.s + POOL.d / 2 - 0.2, { y: 0.12 });

            // Museu de les Ciències: costillas blancas en fila y cristal
            const mus = new THREE.Group();
            const glassBody = box(24, 5, 5, glassM); mus.add(glassBody);
            const roof = box(24.6, 0.4, 5.6, '#f4f6fb'); roof.position.y = 5.2; mus.add(roof);
            for (let k = 0; k < 15; k++) {
                const x = -11.5 + k * 1.64;
                for (const sx of [-1, 1]) { const rib = box(0.32, 6.2, 0.4, '#f4f6fb'); rib.position.set(x + sx * 0.32, 2.8, 2.9); rib.rotation.z = sx * 0.16; mus.add(rib); }
                const top = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.0, 4), white); top.position.set(x, 6.0, 2.9); mus.add(top);
            }
            await ctx.put(mus, 4, 26);
            ctx.reserve(4, 26, 13);

            // Palau de les Arts: casco de trencadís y su "pluma" en voladizo
            const pal = new THREE.Group();
            const helmet = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 18), trenc); helmet.scale.set(4.2, 3.0, 2.8); helmet.position.y = 1.5; pal.add(helmet);
            const glassBand = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.9, 1.6, 36, 1, true), glassM); glassBand.position.y = 0.8; glassBand.scale.z = 0.72; pal.add(glassBand);
            const fs = new THREE.Shape();
            fs.moveTo(-5, 0); fs.quadraticCurveTo(1, 3.2, 7.5, 1.2); fs.quadraticCurveTo(1.5, 1.9, -5, -0.6); fs.closePath();
            const feather = new THREE.Mesh(new THREE.ExtrudeGeometry(fs, { depth: 0.5, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 2, curveSegments: 20 }), white);
            feather.position.set(-0.5, 3.6, -0.25); pal.add(feather);
            await ctx.put(pal, -20, 22, { rot: -0.2 });
            ctx.reserve(-20, 22, 7);

            // L'Umbracle: arcos blancos junto a la carretera, con palmeras dentro
            for (let k = 0; k < 9; k++) {
                const arch = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.12, 6, 18, Math.PI), white);
                await ctx.put(arch, 6 + k * 1.6, 6.2, { rot: Math.PI / 2 });
            }
            const pergola = box(13.4, 0.1, 0.16, '#f4f6fb'); pergola.position.y = 1.98;
            await ctx.put(pergola, 12.4, 6.2);
            for (let k = 0; k < 4; k++) plant('palm', 7 + k * 3.4, 6.2, 1.05);

            // Naranjos y palmeras
            for (let i = 0; i < 10; i++) plant('orange', -20 + (i % 5) * 3, 6 + Math.floor(i / 5) * 3, 0.95);
            for (let i = 0; i < 6; i++) plant('palm', -12 + i * 4.5, 19.5 + (i % 2), 1.1);

            // Paella gigante con una amiga y vosotros
            const pae = new THREE.Group();
            const ring = cyl(0.55, 0.6, 0.45, '#2b2d3a', 16); pae.add(ring);
            const pan = cyl(1.25, 1.1, 0.14, '#3a3d48', 32); pan.position.y = 0.52; pae.add(pan);
            const rice = cyl(1.15, 1.15, 0.05, '#f2c14e', 32); rice.position.y = 0.6; pae.add(rice);
            for (const sx of [-1, 1]) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 6, 12), M('#3a3d48')); h.position.set(sx * 1.35, 0.55, 0); h.rotation.x = Math.PI / 2; pae.add(h); }
            for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; const pep = box(0.36, 0.04, 0.08, '#d1312a'); pep.position.set(Math.cos(a) * 0.75, 0.64, Math.sin(a) * 0.75); pep.rotation.y = -a; pae.add(pep); }
            for (let k = 0; k < 9; k++) { const a = rnd() * 6.28, r = rnd() * 0.9; const b = sphere(0.07, k % 2 ? '#c98a4b' : '#6aa84f'); b.position.set(Math.cos(a) * r, 0.65, Math.sin(a) * r); pae.add(b); }
            for (const a of [0.6, 2.4, 4.3]) { const l = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 4), M('#f7e463')); l.rotation.z = Math.PI / 2; l.position.set(Math.cos(a) * 1.0, 0.68, Math.sin(a) * 1.0); pae.add(l); }
            await ctx.put(pae, -7, 4.6);
            const steam = [];
            for (let k = 0; k < 3; k++) { const st = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false })); steam.push(st); await ctx.put(st, -7 + (k - 1) * 0.4, 4.6, { y: 1, dynamic: true }); st.userData.y0 = st.position.y; }
            ctx.anim((dt, t) => { if (!ctx.dynamic.visible) return; steam.forEach((st, k) => { const ph = (t * 0.4 + k / 3) % 1; st.position.y = st.userData.y0 + ph * 1.6; st.material.opacity = 0.5 * (1 - ph); st.scale.setScalar(0.6 + ph); }); });
            await ctx.couple(-9, 4.2, { anim: 'emote-yes' });
            await ctx.character('chars/character-female-c', -5.2, 4.4, { anim: 'emote-yes', rot: -0.7 });
            ctx.label('Parada técnica: ¡paella! 🥘', -1.5, 3.9, { width: 3.6, height: 2.6 });
            ctx.label('VALÈNCIA', 17, 3.6, { width: 3, height: 2.4, opts: { bg: '#f7c948', fg: '#c8102e', font: 'Bangers', weight: 400 } });
            await ctx.lamps(13);
        }
    },

    // Villena: el Castillo de la Atalaya (gran torre del homenaje con garitas y doble recinto
    // de cubos), el pueblo a sus pies con la torre de Santiago, almendros en flor... y los dos
    // coches de la relación aparcados juntitos
    castillo: {
        terrain(ctx) { const k = ctx.pos(18, 30); ctx.track.addFlat(k.x, k.z, 20); ctx.bump(18, 30, 17, 4); const c = ctx.pos(-6, 5); ctx.track.addFlat(c.x, c.z, 9); },
        async build(ctx) {
            const W = ctx.world;
            const stone = stoneMaterial();
            const plant = (kind, a, sd, sc = 1) => { const p = ctx.pos(a, sd); W.plantTree(kind, p.x, p.z, sc, rnd() * 6, p.y - 0.03); };
            const sbox = (w, h, d) => new THREE.Mesh(metricUV(new THREE.BoxGeometry(w, h, d), 1.8), stone);
            const merlons = (g, len, y, along = 'x', off = 0, other = 0) => {
                const n = Math.max(2, Math.round(len / 0.75));
                for (let k = 0; k < n; k++) { const u = -len / 2 + (k + 0.5) * len / n; const m = sbox(0.38, 0.42, 0.38); m.position.set(along === 'x' ? u + off : other, y + 0.21, along === 'x' ? other : u + off); g.add(m); }
            };
            const cubo = (g, x, z, r = 0.95, h = 3.6) => {
                const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, h, 16), stone); c.position.set(x, h / 2, z); g.add(c);
                for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; const m = sbox(0.34, 0.4, 0.34); m.position.set(x + Math.cos(a) * r * 0.85, h + 0.2, z + Math.sin(a) * r * 0.85); g.add(m); }
            };
            const wallRun = (g, x0, z0, x1, z1, h = 2.6, t = 0.6) => {
                const len = Math.hypot(x1 - x0, z1 - z0), m = sbox(len, h, t);
                m.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2); m.rotation.y = -Math.atan2(z1 - z0, x1 - x0); g.add(m);
                const mg = new THREE.Group(); merlons(mg, len, h, 'x'); mg.position.copy(m.position).setY(0); mg.rotation.copy(m.rotation); g.add(mg);
            };
            const cas = new THREE.Group();
            // peana de roca bajo el castillo (lo asienta en la cima)
            const rock = new THREE.Mesh(new THREE.CylinderGeometry(8.6, 10.5, 5, 10), M('#a8916d')); rock.position.y = -2.4; rock.scale.z = 0.8; cas.add(rock);
            // recinto exterior con cubos
            const O = { x: 7.2, z: 5.4 };
            const outer = [[-O.x, -O.z], [O.x, -O.z], [O.x, O.z], [-O.x, O.z]];
            for (let k = 0; k < 4; k++) { const [a, b] = [outer[k], outer[(k + 1) % 4]]; wallRun(cas, a[0], a[1], b[0], b[1]); cubo(cas, a[0], a[1]); }
            cubo(cas, 0, -O.z, 0.85, 3.2); cubo(cas, 0, O.z, 0.85, 3.2);
            const gate = new THREE.Mesh(new THREE.ShapeGeometry((() => { const sh = new THREE.Shape(); sh.moveTo(-0.6, 0); sh.lineTo(0.6, 0); sh.lineTo(0.6, 1.2); sh.absarc(0, 1.2, 0.6, 0, Math.PI, false); sh.lineTo(-0.6, 0); return sh; })(), 10), M('#2a1d14'));
            gate.position.set(2.4, 0.02, O.z + 0.31); cas.add(gate);
            // recinto interior
            const I = { x: 4.2, z: 3.4 };
            const inner = [[-I.x, -I.z], [I.x, -I.z], [I.x, I.z], [-I.x, I.z]];
            for (let k = 0; k < 4; k++) { const [a, b] = [inner[k], inner[(k + 1) % 4]]; wallRun(cas, a[0], a[1], b[0], b[1], 3.4, 0.55); cubo(cas, a[0], a[1], 0.8, 4.2); }
            // torre del homenaje con garitas en las esquinas
            const KH = 9.5, KW = 4.2;
            const keep = sbox(KW, KH, KW); keep.position.y = KH / 2; cas.add(keep);
            const band = sbox(KW + 0.3, 0.3, KW + 0.3); band.position.y = KH * 0.55; cas.add(band);
            merlons(cas, KW, KH, 'x', 0, KW / 2 - 0.15); merlons(cas, KW, KH, 'x', 0, -KW / 2 + 0.15);
            merlons(cas, KW, KH, 'z', 0, KW / 2 - 0.15); merlons(cas, KW, KH, 'z', 0, -KW / 2 + 0.15);
            for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
                const gt = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 1.2, 10), stone); gt.position.set(sx * KW / 2, KH - 0.1, sz * KW / 2); cas.add(gt);
                const gc = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.6, 10), stone); gc.position.set(sx * KW / 2, KH + 0.8, sz * KW / 2); cas.add(gc);
            }
            const slit = M('#2a1d14');
            for (const y of [3.5, 5.6, 7.6]) for (const [x, z, ry] of [[0, KW / 2 + 0.01, 0], [KW / 2 + 0.01, 0, Math.PI / 2], [-KW / 2 - 0.01, 0, -Math.PI / 2]]) {
                const w = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.7), slit); w.position.set(x, y, z); w.rotation.y = ry; cas.add(w);
            }
            const door = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.4), slit); door.position.set(0, 0.7, KW / 2 + 0.01); cas.add(door);
            const top = ctx.pos(18, 30);
            cas.position.copy(top).y -= 0.2;
            cas.scale.setScalar(1.15);
            cas.rotation.y = ctx.faceRoad(18, 30) - 0.45;
            ctx.group.add(cas);
            const f = flag(['#c60b1e', '#ffc400', '#ffc400', '#c60b1e'], { pole: 2.2 });
            f.position.set(top.x, top.y + KH * 1.15 + 0.1, top.z);
            ctx.dynamic.add(f);
            waveFlag(ctx, f);
            ctx.reserve(18, 30, 14);
            for (const [ra, rs] of [[2, 12], [6, 16], [10, 20], [-2, 9]]) ctx.reserve(ra, rs, 4.5);

            // El pueblo a los pies: casitas encaladas y la torre de la iglesia de Santiago
            // (todas a la izquierda o atrás: que no tapen el castillo desde la carretera)
            const houses = [[-16, 7, 0], [-12.6, 7.6, 1], [-9.2, 7.2, 2], [-6, -9.5, 3], [-2.6, -9.8, 4], [0.8, -9.4, 5], [-19.4, 9.6, 6]];
            for (const [a, sd, k] of houses) await ctx.put(building({ w: 3.2, d: 3.4, floors: 2 + (k % 2), style: k % 3 ? 'mediterranean' : 'stone', roof: 'tiles', shops: false, seed: 80 + k }), a, sd);
            const church = new THREE.Group();
            const nave = sbox(3.4, 3.6, 6); nave.position.y = 1.8; church.add(nave);
            const nroof = new THREE.Mesh(new THREE.CylinderGeometry(0, 2.5, 1.4, 4), tileMaterial()); nroof.rotation.y = Math.PI / 4; nroof.scale.set(0.75, 1, 1.35); nroof.position.y = 4.3; church.add(nroof);
            const tower = sbox(1.8, 8, 1.8); tower.position.set(0, 4, 3.6); church.add(tower);
            for (const [x, z, ry] of [[0, 4.51, 0], [0.91, 3.6, Math.PI / 2], [-0.91, 3.6, -Math.PI / 2]]) { const bell = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.0), slit); bell.position.set(x, 6.8, z); bell.rotation.y = ry; church.add(bell); }
            const spire = new THREE.Mesh(new THREE.ConeGeometry(1.35, 1.6, 4), tileMaterial()); spire.rotation.y = Math.PI / 4; spire.position.set(0, 8.8, 3.6); church.add(spire);
            await ctx.put(church, 6, -11.5, { rot: Math.PI / 2 });
            ctx.reserve(6, -11.5, 4.5);

            // Los dos coches de la relación, aparcados juntitos con un corazón encima
            await ctx.ground(5, 3.4, '#8d929e', -6, 4.8, { y: 0.05 });
            for (const x of [-1.2, 0, 1.2]) { const ln = box(0.06, 0.01, 1.9, '#ffffff'); ln.position.y = 0.07; await ctx.put(ln, -6 + x, 5.1); }
            await ctx.put('car/sedan', -6.6, 5.1, { height: 1.0, rot: Math.PI / 2 });
            await ctx.put('car/hatchback-sports', -5.4, 5.1, { height: 0.95, rot: Math.PI / 2 });
            const hh = new THREE.Mesh(heartGeometry(), M('#ff4d8d', { emissive: new THREE.Color('#ff4d8d'), emissiveIntensity: 0.4 }));
            hh.scale.setScalar(0.3); const hgp = new THREE.Group(); hgp.add(hh);
            await ctx.put(hgp, -6, 5.1, { y: 1.9, dynamic: true });
            const hy = hgp.position.y;
            ctx.anim((dt, t) => { hgp.position.y = hy + Math.sin(t * 2) * 0.12; hh.rotation.y = t * 1.3; });
            ctx.reserve(-6, 5, 3.4);

            // Camino de subida, vosotros paseando y almendros en flor
            await ctx.couple(-1.5, 6.4, { anim: 'walk', rot: Math.PI / 2 + 0.3 });
            for (let i = 0; i < 14; i++) plant('almond', -22 + i * 3.4 + rnd() * 1.5, (i % 2 ? -7 : 4.2) - rnd() * 3 * (i % 2 ? 1 : -1), 0.95 + rnd() * 0.3);
            for (let i = 0; i < 6; i++) plant('olive', -20 + i * 8, 22 + rnd() * 6, 1.1);
            ctx.label('Castillo de la Atalaya · Villena', -12, 3.4, { width: 3.8, height: 2.4, opts: { bg: '#fff3d6', borderColor: '#6b4a2b', width: 800 } });
            await ctx.put('town/windmill', 14, 24, { height: 5 });
            await ctx.put('town/windmill', -16, 24, { height: 5 });
        }
    },

    playa: {
        async build(ctx) {
            const umbrellaColors = ['#ff4d8d', '#ffd23f', '#4cc9f0', '#7bed9f'];
            for (let i = 0; i < 4; i++) {
                const u = new THREE.Group();
                u.add(cyl(0.04, 0.04, 2, '#ffffff', 6));
                const top = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.5, 8), M(umbrellaColors[i]));
                top.position.y = 2; u.add(top);
                await ctx.put(u, -6 + i * 3.6, 7 + (i % 2) * 2);
                const towel = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.8), M(umbrellaColors[(i + 2) % 4]));
                towel.geometry.rotateX(-Math.PI / 2);
                await ctx.put(towel, -6 + i * 3.6 + 1, 7.5 + (i % 2) * 2, { y: 0.06, face: false, rot: 0.3 });
            }
            // Vosotros en la toalla y un amigo saludando
            await ctx.couple(-5, 7.6, { anim: 'sit', y: SEAT.ground, heart: true, gap: 0.7 });
            await ctx.character('chars/character-male-a', -1.5, 5, { anim: 'emote-yes', rot: 0.5 });
            ctx.label('¡Hola, amigos! 👋', 2, 3.6, { width: 3.2, height: 2.6 });
            // Espeto, chiringuito y barcos en el mar
            // El espeto: barquita llena de arena con las sardinas ensartadas sobre las brasas
            const esp = new THREE.Group();
            const hs = new THREE.Shape(); hs.moveTo(-1.15, 0.5); hs.lineTo(1.35, 0.5); hs.quadraticCurveTo(1.2, 0.1, 0.9, 0); hs.lineTo(-0.9, 0); hs.quadraticCurveTo(-1.1, 0.1, -1.15, 0.5);
            const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(hs, { depth: 0.84, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 }), M('#2f6fe0'));
            hull.position.z = -0.42; esp.add(hull);
            const stripe = box(2.5, 0.08, 0.9, '#ffffff'); stripe.position.y = 0.42; esp.add(stripe);
            const sand = box(2.2, 0.06, 0.82, '#e8d2a0'); sand.position.y = 0.53; esp.add(sand);
            const embers = box(1.8, 0.05, 0.3, glow('#ff7a2b')); embers.position.set(0, 0.58, -0.15); esp.add(embers);
            for (let k = 0; k < 5; k++) {
                const sk = cyl(0.015, 0.015, 0.9, '#c8a774', 4); sk.position.set(-0.7 + k * 0.35, 0.85, 0.05); sk.rotation.x = -0.5; esp.add(sk);
                for (let j = 0; j < 3; j++) { const fish = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), M('#b8c4d0')); fish.scale.set(0.6, 0.6, 2.2); fish.position.set(-0.7 + k * 0.35, 0.72 + j * 0.13, -0.02 - j * 0.07); fish.rotation.x = -0.5; esp.add(fish); }
            }
            await ctx.put(esp, 6, 9.4, { rot: 0.3 });
            const smoke = [];
            for (let k = 0; k < 3; k++) { const sm = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.4, depthWrite: false })); smoke.push(sm); await ctx.put(sm, 6, 9.4, { y: 1.1, dynamic: true }); sm.userData.y0 = sm.position.y; }
            ctx.anim((dt, t) => { if (!ctx.dynamic.visible) return; smoke.forEach((sm, k) => { const ph = (t * 0.35 + k / 3) % 1; sm.position.y = sm.userData.y0 + ph * 2; sm.material.opacity = 0.4 * (1 - ph); sm.scale.setScalar(0.6 + ph * 1.4); }); });
            // Chiringuito con techo de paja, barra y taburetes
            const chir = new THREE.Group();
            const bar = box(3.6, 1.1, 0.8, '#b98550'); bar.position.set(0, 0.55, 0.9); chir.add(bar);
            const top = box(3.8, 0.08, 1.0, '#8a5a2e'); top.position.set(0, 1.12, 0.9); chir.add(top);
            const back = box(3.6, 2.4, 0.2, '#d9a066'); back.position.set(0, 1.2, -0.9); chir.add(back);
            for (const x of [-1.8, 1.8]) for (const z of [-0.9, 1.2]) { const p = cyl(0.08, 0.08, 2.6, '#8a5a2e', 6); p.position.set(x, 1.3, z); chir.add(p); }
            const thatch = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.9, 4), M('#d9b45a')); thatch.rotation.y = Math.PI / 4; thatch.scale.set(1.15, 1, 0.8); thatch.position.y = 3.2; chir.add(thatch);
            const fringe = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.75, 0.35, 4, 1, true), M('#c9a24a')); fringe.rotation.y = Math.PI / 4; fringe.scale.set(1.15, 1, 0.8); fringe.position.y = 2.55; chir.add(fringe);
            for (const x of [-1.2, 0, 1.2]) { const st = cyl(0.17, 0.12, 0.75, '#2f6fe0', 10); st.position.set(x, 0.375, 1.6); chir.add(st); }
            const chsign = textPlane('', 2.6, { width: 640, height: 160, bg: '#2f6fe0', fg: '#ffffff', lines: ['Chiringuito · Espetos'], font: 'Fredoka', weight: 700, border: 8, borderColor: '#ffffff' });
            chsign.position.set(0, 2.05, 1.32); chir.add(chsign);
            await ctx.put(chir, 11, 7.2);
            ctx.reserve(11, 7.2, 3.4);
            // Tumbonas
            for (let i = 0; i < 4; i++) {
                const tb = new THREE.Group();
                const seat = box(0.6, 0.06, 1.3, '#ffffff'); seat.position.y = 0.3; tb.add(seat);
                const back2 = box(0.6, 0.06, 0.6, '#ffffff'); back2.position.set(0, 0.5, -0.75); back2.rotation.x = 0.8; tb.add(back2);
                const cushion = box(0.55, 0.04, 1.2, i % 2 ? '#ff4d8d' : '#4cc9f0'); cushion.position.y = 0.35; tb.add(cushion);
                await ctx.put(tb, -12 + i * 1.3, 9.5);
            }
            // La Farola en su espigón, mar adentro
            const far = new THREE.Group();
            const jetty = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 12), M('#5b5f6b')); jetty.position.set(0, 0, 4); far.add(jetty);
            for (let k = 0; k < 12; k++) { const rk = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6 + rnd() * 0.4, 0), M('#6e7380')); rk.position.set((k % 2 ? 1 : -1) * 1.5, 0.1, -1.5 + k); far.add(rk); }
            const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.0, 6.5, 16), M('#f4f6fb')); tower.position.y = 3.6; far.add(tower);
            const gallery = cyl(1.05, 1.05, 0.2, '#2b2d42', 16); gallery.position.y = 6.9; far.add(gallery);
            const lantern = cyl(0.55, 0.55, 0.9, glow('#fff3b0'), 12); lantern.position.y = 7.45; far.add(lantern);
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M('#c8102e')); dome.position.y = 7.9; far.add(dome);
            const fbase = box(2.4, 1.2, 2.4, '#e6e1d6'); fbase.position.y = 0.6; far.add(fbase);
            await ctx.put(far, 16, 34, { y: 0.15 });
            // Letras de MÁLAGA en la arena
            const letters = textPlane('MÁLAGA', 7, { width: 900, height: 220, bg: null, fg: '#ffffff', stroke: '#2f6fe0', font: 'Bangers', weight: 400, border: 0 });
            const lg = new THREE.Group(); letters.position.y = 1.0; lg.add(letters);
            const lplinth = box(7.2, 0.3, 0.6, '#e6e1d6'); lg.add(lplinth);
            await ctx.put(lg, -2, 13);
            for (let i = 0; i < 4; i++) {
                const b = await ctx.put(i % 2 ? 'water/boat-sail-a' : 'water/boat-sail-b', -10 + i * 7, 32 + (i % 2) * 6, { height: 5, dynamic: true, rot: i });
                b.position.y = -0.2;
                const y0 = -0.2;
                ctx.anim((dt, t) => { if (ctx.dynamic.visible) { b.position.y = y0 + Math.sin(t * 1.2 + i) * 0.12; b.rotation.z = Math.sin(t + i) * 0.05; } });
            }
            await ctx.put('water/buoy', 4, 26, { height: 1.4 });
            await ctx.trees('nature/tree_palmTall', 7, 3.5, 5, { height: 4.5 });

        }
    },

    // AP-7 · La Jonquera: el área de servicio junto a la frontera. Pórtico azul de la AP-7, benzinera
    // con Superchargers, restaurante self-service, tienda de embutidos, camiones aparcados, los
    // Pirineos al fondo... y ella dándole comidita al conductor
    jonquera: {
        terrain(ctx) {
            const c = ctx.pos(0, 16); ctx.track.addFlat(c.x, c.z, 22);
            for (const [a, sd, r, h] of [[-30, -46, 22, 16], [0, -52, 26, 22], [28, -46, 20, 14], [50, -40, 18, 12]]) ctx.bump(a, sd, r, h);   // els Pirineus
        },
        async build(ctx) {
            const W = ctx.world;
            const plant = (kind, a, sd, sc = 1) => { const p = ctx.pos(a, sd); W.plantTree(kind, p.x, p.z, sc, rnd() * 6, p.y - 0.03); };
            // La AP-7 sigue ancha (3+3 carriles) delante del área; pórticos de aviso y de salida
            const P = ctx.place;
            buildWideRoad(ctx.app, P.s0 - 1, P.s1 + 14, { rightRail: false });
            await ctx.put(gantry(['Àrea de servei · La Jonquera', 'Benzinera · Restaurant · Botiga'], { wide: true, bg: '#2f8a3c' }), -ctx.len / 2 - 40, 0, { rot: Math.PI / 2 });
            await ctx.put(gantry(['Sortida 5 ↗', 'Costa Brava · Empordà'], { wide: true }), ctx.len / 2 + 6, 0, { rot: Math.PI / 2 });
            // Plataforma del área (asfalto) y vial de acceso
            await ctx.ground(34, 20, '#5b5e68', 0, 16, { y: 0.05 });
            await ctx.ground(30, 3, '#4c4f58', 0, 5, { y: 0.06 });
            for (let a = -14; a <= 14; a += 3) { const ln = box(1.4, 0.01, 0.12, '#ffffff'); ln.position.y = 0.08; await ctx.put(ln, a, 5); }
            ctx.reserve(0, 16, 18);
            // Benzinera con marquesina y, al lado, Superchargers
            const gas = new THREE.Group();
            const canopy = box(11, 0.5, 6, '#f4f6fb'); canopy.position.y = 4; gas.add(canopy);
            const band = box(11.05, 0.25, 6.05, '#2f8a3c'); band.position.y = 4.1; gas.add(band);
            for (const x of [-4.5, 0, 4.5]) for (const z of [-2, 2]) { const p = cyl(0.14, 0.14, 4, '#c7ccd8', 8); p.position.set(x, 0, z); gas.add(p); }
            for (const x of [-2.6, 2.6]) { const isl = box(1.4, 0.2, 3.4, '#9aa3b5'); isl.position.x = x; gas.add(isl); const pump = box(0.7, 1.6, 0.6, '#2f8a3c'); pump.position.set(x, 0.2, 0); gas.add(pump); const scr = box(0.5, 0.3, 0.02, '#7ad7ff'); scr.position.set(x, 1.4, 0.31); gas.add(scr); }
            const gsign = textPlane('', 4, { width: 800, height: 170, bg: '#ffffff', fg: '#2f8a3c', lines: ['Benzinera · 24 h'], font: 'Fredoka', weight: 700, border: 8, borderColor: '#2f8a3c' });
            gsign.position.set(0, 4.1, 3.04); gas.add(gsign);
            await ctx.put(gas, -10, 13);
            for (let k = 0; k < 4; k++) {
                const sc = new THREE.Group();
                const body = box(0.45, 1.8, 0.35, '#ffffff'); sc.add(body);
                const top = box(0.47, 0.25, 0.37, '#e8173b'); top.position.y = 1.6; sc.add(top);
                const led = box(0.05, 1.1, 0.02, glow('#3ddc84')); led.position.set(0, 0.5, 0.18); sc.add(led);
                await ctx.put(sc, -18 + k * 1.6, 9.5);
            }
            const scl = textPlane('Supercharger ⚡', 2.4, { width: 600, height: 120, bg: '#1b1b2f', fg: '#ffffff', border: 6, borderColor: '#e8173b' });
            await ctx.put(scl, -15.6, 9.2, { y: 2.6 });
            // Restaurante self-service y tienda (los clásicos de La Jonquera)
            // (el rótulo, en el tejado: en la fachada lo tapaban los toldos)
            const rest = building({ w: 13, d: 7, floors: 2, style: 'modern', seed: 72 });
            await ctx.put(rest, 15, 20);
            const RH = rest.userData.height + 0.35;
            const rsign = new THREE.Group();
            const rback = box(9.6, 1.9, 0.18, '#1b1b2f'); rback.position.y = RH + 0.55; rsign.add(rback);
            const rtext = textPlane('', 9.2, { width: 1300, height: 220, bg: '#c8102e', fg: '#ffffff', lines: ['RESTAURANT · SELF-SERVICE'], font: 'Bangers', weight: 400, border: 10, borderColor: '#ffd23f', radius: 14 });
            rtext.geometry = new THREE.PlaneGeometry(9.2, 9.2 * 220 / 1300); rtext.position.set(0, RH + 1.5, 0.11); rsign.add(rtext);
            for (const x of [-3.6, 0, 3.6]) { const leg = box(0.14, 2.1, 0.14, '#5b6377'); leg.position.set(x, RH - 1.15, -0.2); rsign.add(leg); }
            await ctx.put(rsign, 15, 20 - 3.6, { rot: 0.8 });   // girado hacia los que llegan por la autopista
            const shop = new THREE.Group();
            const sb = box(8, 3.2, 5, '#f2d7b0'); shop.add(sb);
            const sr = box(8.4, 0.3, 5.4, '#7a3b24'); sr.position.y = 3.2; shop.add(sr);
            const sw = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.8), new THREE.MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false })); sw.position.set(0, 1.4, 2.51); shop.add(sw);
            for (let k = 0; k < 5; k++) {   // jamones y fuets colgados en el escaparate
                const ham = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), M('#8a3b24')); ham.scale.set(0.7, 1.6, 0.6); ham.position.set(-2.4 + k * 1.2, 1.6, 2.6); shop.add(ham);
                const hook = cyl(0.01, 0.01, 0.4, '#5b6377', 4); hook.position.set(-2.4 + k * 1.2, 2.0, 2.6); shop.add(hook);
            }
            const shs = textPlane('', 6.5, { width: 1000, height: 180, bg: '#7a3b24', fg: '#fff2b0', lines: ['Botiga · Embotits · Formatges 🧀'], font: 'Fredoka', weight: 700, border: 8, borderColor: '#fff2b0' });
            shs.position.set(0, 3.95, 2.0); shop.add(shs);
            await ctx.put(shop, 4, 20);
            // Camiones aparcados (zona de camioneros) y coches con matrícula francesa
            for (let k = 0; k < 3; k++) {
                const tr = new THREE.Group();
                const cab = box(2.2, 2.4, 2.0, ['#e8173b', '#1d5bbf', '#f4f6fb'][k]); cab.position.x = 4.6; tr.add(cab);
                const win = box(0.05, 0.9, 1.7, '#25324f'); win.position.set(5.72, 1.6, 0); tr.add(win);
                const trailer = box(8.2, 3.0, 2.3, k === 1 ? '#f4f6fb' : '#c7ccd8'); trailer.position.y = 0.3; tr.add(trailer);
                const logo = textPlane(['Transports Empordà', 'Fuet & Co.', 'Amor Express ♥'][k], 5, { width: 900, height: 150, bg: null, fg: ['#1d5bbf', '#c8102e', '#ff4d8d'][k], font: 'Bangers', weight: 400, border: 0 });
                logo.position.set(-0.4, 2.0, 1.17); tr.add(logo);
                for (const x of [-3, -1.8, 3.8, 5]) for (const z of [-1.05, 1.05]) { const w = cyl(0.45, 0.45, 0.3, '#1e2130', 12); w.rotation.x = Math.PI / 2; w.position.set(x, 0.45, z); tr.add(w); }
                await ctx.put(tr, -8 + k * 0.2, 22.5 + k * 3.2, { rot: Math.PI / 2 + 0.05, y: 0 });
            }
            ctx.reserve(-8, 26, 7);
            await ctx.put('car/sedan', 12, 9.5, { height: 1.0, rot: Math.PI / 2 });
            await ctx.put('car/hatchback-sports', 14.5, 9.5, { height: 0.95, rot: Math.PI / 2 });
            // Banderas de la frontera y cartel
            for (const [a, cols, stripes] of [[-24, SENYERA, 'h'], [-21.5, ['#0055a4', '#ffffff', '#ef4135'], 'v'], [-19, ['#c60b1e', '#ffc400', '#ffc400', '#c60b1e'], 'h']]) {
                const f = flag(cols, { stripes, pole: 4.2 });
                await ctx.put(f, a, 6.5, { dynamic: true }); waveFlag(ctx, f);
            }
            const fr = new THREE.Group();
            const frb = textPlane('', 4.4, { width: 900, height: 260, bg: '#1d5bbf', fg: '#ffffff', lines: ['FRANÇA / FRANCE', 'Le Perthus · 5 km'], borderColor: '#fcdd09', border: 12, radius: 12 });
            frb.position.y = 2.8; fr.add(frb);
            for (const x of [-1.8, 1.8]) { const p = cyl(0.08, 0.08, 2.2, '#9aa3b5', 8); p.position.x = x; fr.add(p); }
            await ctx.put(fr, -28, 3.6, { rot: -0.3 });
            // Vosotros en una mesa de pícnic: ella le da un bocata al conductor 🥪
            const table = new THREE.Group();
            const tt = box(1.8, 0.08, 0.9, '#a0703c'); tt.position.y = 0.75; table.add(tt);
            for (const z of [-0.7, 0.7]) { const bench = box(1.8, 0.06, 0.32, '#a0703c'); bench.position.set(0, 0.45, z); table.add(bench); }
            for (const x of [-0.75, 0.75]) { const leg = box(0.08, 0.75, 1.6, '#7a4a2a'); leg.position.x = x; leg.scale.z = 1; table.add(leg); }
            const bocata = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.35, 4, 8), M('#d9a45a')); bocata.rotation.z = Math.PI / 2; bocata.position.set(-0.3, 0.84, 0.1); table.add(bocata);
            const can = cyl(0.04, 0.04, 0.13, '#e8173b', 8); can.position.set(0.3, 0.8, -0.1); table.add(can);
            const chips = box(0.18, 0.24, 0.06, '#ffd23f'); chips.position.set(0.55, 0.9, 0.1); table.add(chips);
            await ctx.put(table, 1, 9.6);
            await ctx.couple(1, 9.6, { her: 'interact-right', him: 'sit', anim: 'sit', y: SEAT.bench + 0.1, lookAtEachOther: true, gap: 1.4 });
            const sand = new THREE.Group();
            const sdw = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.28, 4, 8), M('#d9a45a')); sdw.rotation.z = Math.PI / 2; sand.add(sdw);
            const let_ = box(0.3, 0.03, 0.1, '#5fa84a'); let_.position.y = 0.06; sand.add(let_);
            await ctx.put(sand, 1, 9.6, { y: 1.3, dynamic: true });
            const sy = sand.position.y;
            ctx.anim((dt, t) => { sand.position.y = sy + Math.sin(t * 3) * 0.05; sand.rotation.y = Math.sin(t * 1.5) * 0.3; });
            ctx.label('Comidita para el conductor 🥪💕', -3.5, 4.2, { width: 3.6, height: 2.4, opts: { bg: '#fff3d6', fg: '#c8102e', borderColor: '#6b4a2b' } });
            // Árboles del Empordà alrededor
            for (let i = 0; i < 10; i++) plant('umbrella', -26 + i * 6 + rnd() * 2, 30 + rnd() * 6, 1.1 + rnd() * 0.3);
            for (let i = 0; i < 8; i++) plant('oak', -25 + i * 7, -24 - rnd() * 8, 1 + rnd() * 0.3);
        }
    },

    // La masía, rodeada de campos del Empordà (trigo, viñas, olivos)
    // y el Montgrí con su castillo al fondo
    masia: {
        terrain(ctx) {
            for (const [a, sd, r] of [[2, 15, 18], [15, 8, 10], [-15, 9, 10], [-8, -10, 12], [12, -9, 12]]) { const c = ctx.pos(a, sd); ctx.track.addFlat(c.x, c.z, r); }
            ctx.bump(-2, 47, 20, 13);     // el Montgrí
        },
        async build(ctx) {
            const W = ctx.world;
            const stone = stoneMaterial();
            const plant = (kind, a, sd, sc = 1) => { const p = ctx.pos(a, sd); W.plantTree(kind, p.x, p.z, sc, rnd() * 6, p.y - 0.03); };
            const ground = (w, d, color, a, sd, y = 0.04) => ctx.ground(w, d, color, a, sd, { y });

            // Llegando por la AP-7
            const ap7 = new THREE.Group();
            const sgn = textPlane('', 4.2, { width: 800, height: 300, bg: '#1d5bbf', fg: '#ffffff', lines: ['AP-7  →  Costa Brava', '🍽️ Restaurantes 2 km'], borderColor: '#ffffff', border: 12, radius: 14 });
            sgn.position.y = 4; ap7.add(sgn);
            for (const x of [-1.9, 1.9]) { const p = cyl(0.08, 0.08, 3.6, '#9aa3b5', 8); p.position.x = x; ap7.add(p); }
            await ctx.put(ap7, -ctx.len / 2 - 2, 2.9);
            ctx.label('EMPORDÀ', -17, -3.6, { width: 2.8, height: 2.4, opts: { bg: '#ffffff', fg: '#1d5bbf', font: 'Bangers', weight: 400 } });

            // --- La masía (girada hacia el coche que llega; el pajar queda hacia delante) ---
            await ctx.put(masia({ seed: 8 }), 1, 16, { rot: 0.45 });
            ctx.reserve(3, 15, 12);
            // que el paisaje aleatorio no ponga árboles delante ni granjas "americanas" detrás
            for (const [a, sd, r] of [[-6, 6, 4.5], [11.4, 6, 5], [0, 30, 14], [-15, 28, 10], [16, 28, 10]]) ctx.reserve(a, sd, r);
            const heart = new THREE.Mesh(heartGeometry(), M('#ff4d8d', { emissive: new THREE.Color('#ff4d8d'), emissiveIntensity: 0.4 }));
            heart.scale.setScalar(0.6);
            const hg = new THREE.Group(); hg.add(heart);
            await ctx.put(hg, 1, 16, { y: 11.2, dynamic: true });
            const hy0 = hg.position.y;
            ctx.anim((dt, t) => { hg.position.y = hy0 + Math.sin(t * 1.6) * 0.2; heart.rotation.y = t * 1.1; });

            // Era empedrada, camino de tierra y dos cipreses a la entrada (en el Empordà: "aquí se os acoge")
            await ground(1.9, 3.8, '#c9a46a', -2.4, 4.2, 0.06);
            const era = new THREE.Mesh(new THREE.CircleGeometry(3.1, 28), M('#d6c4a0')); era.geometry.rotateX(-Math.PI / 2);
            await ctx.put(era, -2.4, 8.9, { y: 0.05, face: false });
            const eraRing = new THREE.Mesh(new THREE.RingGeometry(3.1, 3.4, 28), M('#a88f68')); eraRing.geometry.rotateX(-Math.PI / 2);
            await ctx.put(eraRing, -2.4, 8.9, { y: 0.055, face: false });
            ctx.reserve(-2.4, 8.9, 4);
            plant('cypress', -4.3, 3.7, 1.15); plant('cypress', -0.5, 3.7, 1.1);
            ctx.label('Un finde en el campo 💕', -6.8, 3.3, { width: 3.6, height: 2.4, opts: { bg: '#fff3d6', fg: '#b0306a', borderColor: '#6b4a2b' } });
            // Muro de piedra seca junto a la carretera (con el hueco del camino)
            for (let a = -21; a < 21; a += 2) {
                if (a === -3) continue;      // hueco del camino
                const seg = new THREE.Mesh(metricUV(new THREE.BoxGeometry(2.04, 0.55, 0.42), 1.6), stone);
                seg.position.y = 0.27;
                await ctx.put(seg, a + 1, 3.45);
            }

            // Pozo con su tejadillo y el cubo
            const well = new THREE.Group();
            well.add(cyl(0.75, 0.8, 0.9, '#cdb489', 16));
            const rim = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.09, 6, 18), M('#e2cfa8')); rim.rotation.x = Math.PI / 2; rim.position.y = 0.9; well.add(rim);
            const water = new THREE.Mesh(new THREE.CircleGeometry(0.68, 16), M('#2f5d8a')); water.rotation.x = -Math.PI / 2; water.position.y = 0.75; well.add(water);
            for (const x of [-0.72, 0.72]) { const p = box(0.12, 2.2, 0.12, '#6b4a2b'); p.position.x = x; well.add(p); }
            const bar = cyl(0.04, 0.04, 1.5, '#6b4a2b', 6); bar.rotation.z = Math.PI / 2; bar.position.y = 1.9; well.add(bar);
            const bucket = cyl(0.14, 0.11, 0.24, '#8a8f99', 10); bucket.position.y = 1.35; well.add(bucket);
            const rope = cyl(0.01, 0.01, 0.42, '#d9c39a', 4); rope.position.y = 1.68; well.add(rope);
            for (const sx of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 1.2), tileMaterial()); r.rotation.z = -sx * 0.55; r.position.set(sx * 0.38, 2.45, 0); well.add(r); }
            await ctx.put(well, -8.6, 8.6);
            ctx.reserve(-8.6, 8.6, 1.6);

            // Gallinas picoteando por la era
            for (let i = 0; i < 7; i++) {
                const ch = new THREE.Group();
                const col = i % 3 === 0 ? '#8a4b2a' : '#fbf6ec';
                const body = sphere(0.17, col); body.scale.set(1, 0.85, 1.3); body.position.y = 0.26; ch.add(body);
                const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 6), M(col)); tail.position.set(0, 0.36, -0.2); tail.rotation.x = -0.9; ch.add(tail);
                const head = new THREE.Group(); head.position.set(0, 0.38, 0.17);
                const hd = sphere(0.085, col); head.add(hd);
                const comb = box(0.03, 0.08, 0.1, '#e8173b'); comb.position.set(0, 0.06, 0); head.add(comb);
                const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 5), M('#ffb703')); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0, 0.1); head.add(beak);
                ch.add(head);
                for (const x of [-0.06, 0.06]) { const l = cyl(0.012, 0.012, 0.14, '#ffb703', 4); l.position.set(x, 0.02, 0); ch.add(l); }
                await ctx.put(ch, -5.6 + rnd() * 6, 6.6 + rnd() * 4.5, { dynamic: true, face: false, rot: rnd() * 6 });
                const ph = rnd() * 6, r0 = ch.rotation.y;
                ctx.anim((dt, t) => {
                    if (!ctx.dynamic.visible) return;
                    const peck = Math.max(0, Math.sin(t * 3 + ph)) ** 3;
                    head.position.y = 0.38 - peck * 0.18; head.position.z = 0.17 + peck * 0.08;
                    ch.rotation.y = r0 + Math.sin(t * 0.4 + ph) * 0.8;
                });
            }

            // Campo de trigo que se mece con el viento, con su espantapájaros
            await ground(10, 7.6, '#c9a54e', -16, 9.3);
            for (let a = -20.7; a <= -11.3; a += 0.62) for (let sd = 5.9; sd <= 12.9; sd += 0.62) plant('wheat', a + (rnd() - 0.5) * 0.3, sd + (rnd() - 0.5) * 0.3, 0.9 + rnd() * 0.25);
            const crow = new THREE.Group();
            const pole = box(0.08, 2.1, 0.08, '#6b4a2b'); crow.add(pole);
            const arms = box(1.5, 0.07, 0.07, '#6b4a2b'); arms.position.y = 1.55; crow.add(arms);
            const shirt = box(0.7, 0.75, 0.3, '#c0392b'); shirt.position.y = 1.2; crow.add(shirt);
            const head2 = sphere(0.2, '#e8d2a0'); head2.position.y = 1.85; crow.add(head2);
            const hat = cyl(0.36, 0.36, 0.04, '#d9b45a', 14); hat.position.y = 2.0; crow.add(hat);
            const hatTop = cyl(0.17, 0.2, 0.2, '#d9b45a', 12); hatTop.position.y = 2.05; crow.add(hatTop);
            await ctx.put(crow, -15.5, 10.5);
            ctx.reserve(-16, 9.3, 7);

            // Huerto de tomates (¡con sal, orégano y ricotta!)
            const stake = M('#8a6a44'), leaf = M('#3f8a3a'), tomato = M('#e3302f');
            for (const sd of [4.9, 6.0, 7.1]) for (let a = 8.2; a <= 14.6; a += 1.05) {
                const pl = new THREE.Group();
                const st = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.15, 0.04), stake); st.position.y = 0.57; pl.add(st);
                for (const [y, ox] of [[0.3, 0.08], [0.58, -0.08], [0.85, 0.05]]) { const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.21, 0), leaf); l.position.set(ox, y, 0); l.scale.set(1.1, 0.8, 1); pl.add(l); }
                for (let k = 0; k < 4; k++) { const tm = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), tomato); tm.position.set((rnd() - 0.5) * 0.36, 0.25 + rnd() * 0.55, 0.14 + rnd() * 0.06); pl.add(tm); }
                await ctx.put(pl, a, sd, { rot: rnd() * 0.6 });
            }
            await ground(7.6, 3.2, '#7a5a3c', 11.4, 6.0, 0.04);
            ctx.label('Hort · Tomàquets', 7.0, 4.1, { width: 2.2, height: 1.3, opts: { bg: '#fff3d6', fg: '#c8102e', borderColor: '#6b4a2b' } });

            // Pérgola con parra y la mesa: pa amb tomàquet, platos de tomate y porrón
            const per = new THREE.Group();
            for (const x of [-1.7, 1.7]) for (const z of [-1.25, 1.25]) { const p = box(0.14, 2.5, 0.14, '#7a5a3c'); p.position.set(x, 1.25, z); per.add(p); }
            for (const z of [-1.25, 1.25]) { const b = box(3.7, 0.14, 0.16, '#7a5a3c'); b.position.set(0, 2.5, z); per.add(b); }
            for (let x = -1.6; x <= 1.6; x += 0.4) { const sl = box(0.08, 0.08, 2.8, '#8a6a44'); sl.position.set(x, 2.6, 0); per.add(sl); }
            const vineLeaf = M('#4f8f3a'), grape = M('#5b2a6e');
            for (let i = 0; i < 14; i++) {
                const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42 + rnd() * 0.2, 0), vineLeaf);
                l.position.set(-1.7 + rnd() * 3.4, 2.75 + rnd() * 0.15, -1.3 + rnd() * 2.6); l.scale.y = 0.45; per.add(l);
            }
            for (let i = 0; i < 5; i++) { const gc = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.24, 6), grape); gc.rotation.x = Math.PI; gc.position.set(-1.4 + i * 0.7, 2.35, -1.0 + (i % 2) * 2); per.add(gc); }
            // mesa con mantel de cuadros
            const top = box(2.1, 0.07, 1.0, '#7a5a3c'); top.position.y = 0.6; per.add(top);
            for (const x of [-0.95, 0.95]) for (const z of [-0.42, 0.42]) { const lg = box(0.07, 0.6, 0.07, '#6b4a2b'); lg.position.set(x, 0.3, z); per.add(lg); }
            const cloth = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.95), new THREE.MeshToonMaterial({ map: ginghamTexture() }));
            cloth.rotation.x = -Math.PI / 2; cloth.position.y = 0.64; per.add(cloth);
            const plateMat = M('#ffffff'), slice = M('#e3302f'), ricotta = M('#fffbea'), oregano = M('#5b7f2a');
            for (const [px, pz] of [[-0.6, 0.12], [0.6, 0.12], [0, -0.22]]) {
                const pl = cyl(0.19, 0.16, 0.025, '#ffffff', 18); pl.material = plateMat; pl.position.set(px, 0.65, pz); per.add(pl);
                for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; const sl = cyl(0.055, 0.055, 0.014, '#e3302f', 10); sl.material = slice; sl.position.set(px + Math.cos(a) * 0.1, 0.672, pz + Math.sin(a) * 0.1); per.add(sl); }
                const ric = sphere(0.05, '#fffbea'); ric.material = ricotta; ric.scale.y = 0.5; ric.position.set(px, 0.68, pz); per.add(ric);
                for (let k = 0; k < 6; k++) { const o = box(0.015, 0.008, 0.015, '#5b7f2a'); o.material = oregano; o.position.set(px + (rnd() - 0.5) * 0.2, 0.684, pz + (rnd() - 0.5) * 0.2); per.add(o); }
            }
            const basket = cyl(0.17, 0.13, 0.1, '#b08850', 12); basket.position.set(0, 0.69, 0.3); per.add(basket);
            for (let k = 0; k < 3; k++) { const br = sphere(0.07, '#d9a45a'); br.scale.set(1.7, 0.8, 1); br.position.set(-0.07 + k * 0.07, 0.76, 0.3 + (k - 1) * 0.04); br.rotation.y = k; per.add(br); }
            const oil = cyl(0.045, 0.05, 0.24, '#9bb84a', 10); oil.position.set(0.85, 0.74, -0.3); per.add(oil);
            const salt = cyl(0.03, 0.03, 0.08, '#ffffff', 8); salt.position.set(0.72, 0.68, -0.32); per.add(salt);
            const porro = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.09, 0], [0.11, 0.06], [0.06, 0.16], [0.03, 0.3], [0.04, 0.33]].map(([x, y]) => new THREE.Vector2(x, y)), 12), new THREE.MeshToonMaterial({ color: '#b8e0ff', transparent: true, opacity: 0.6 }));
            porro.position.set(-0.85, 0.64, -0.3); per.add(porro);
            const spout = cyl(0.012, 0.02, 0.25, '#b8e0ff', 6); spout.rotation.z = 0.9; spout.position.set(-0.75, 0.75, -0.3); per.add(spout);
            const wine = cyl(0.08, 0.1, 0.07, '#7a1f3a', 10); wine.position.set(-0.85, 0.675, -0.3); per.add(wine);
            const PA = 18.5, PS = 9.6;
            await ctx.put(per, PA, PS);
            ctx.reserve(PA, PS, 3.2);
            // Sillas y vosotros tres a la mesa
            await ctx.put('furniture/chair', PA + 1.3, PS, { height: 0.8, rot: Math.PI / 2 });
            await ctx.put('furniture/chair', PA - 1.3, PS, { height: 0.8, rot: -Math.PI / 2 });
            await ctx.put('furniture/chair', PA, PS + 0.85, { height: 0.8 });
            await ctx.couple(PA, PS, { anim: 'sit', y: SEAT.chair, lookAtEachOther: true, gap: 2.6 });
            await ctx.character('chars/character-female-e', PA, PS + 0.8, { anim: 'sit', y: SEAT.chair });

            // Lado izquierdo: rastrojo con balas de paja y el tractor, y viñedo en hileras
            await ground(16, 9, '#d8bf72', -9, -10.5);
            const straw = M('#d9b45a'), strawEnd = M('#e8cd7f');
            for (const [a, sd, r] of [[-15, -7.5, 0.3], [-11.5, -12, 1.2], [-7, -8.5, 2.4], [-3.5, -12.5, 0.8], [-13, -14, 2], [-5.5, -15.5, 0.2]]) {
                const b = new THREE.Group();
                const cylb = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.2, 16), straw); cylb.rotation.z = Math.PI / 2; cylb.position.y = 0.62; b.add(cylb);
                for (const sx of [-0.61, 0.61]) { const e = new THREE.Mesh(new THREE.CircleGeometry(0.58, 16), strawEnd); e.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2; e.position.set(sx, 0.62, 0); b.add(e); }
                await ctx.put(b, a, sd, { rot: r });
            }
            await ctx.put(tractor(), 1.5, -8.5, { rot: 0.6 });
            ctx.reserve(-9, -10.5, 8);
            for (let a = 5; a <= 20; a += 1.7) {
                for (let sd = -5.6; sd >= -13.5; sd -= 0.95) plant('vine', a, sd, 1.15);
                const post = box(0.08, 1.0, 0.08, '#7a5a3c');
                await ctx.put(post, a, -5.1);
            }
            ctx.reserve(12.5, -9.5, 8);

            // Olivos y pinos piñoneros alrededor, y el castillo del Montgrí en lo alto
            for (let i = 0; i < 10; i++) plant('olive', -20 + i * 4.4 + rnd() * 2, 24 + rnd() * 9, 1 + rnd() * 0.3);
            for (let i = 0; i < 7; i++) plant('olive', -21 + i * 6 + rnd() * 2, -17 - rnd() * 6, 1 + rnd() * 0.3);
            for (const [a, sd] of [[-22, 15], [22, 18], [-6, 27], [21, -15]]) plant('umbrella', a, sd, 1.1);
            const cas = new THREE.Group();
            const cs = '#cdb48a';
            for (const [w, d, x, z] of [[8, 0.8, 0, 3.6], [8, 0.8, 0, -3.6], [0.8, 8, 3.6, 0], [0.8, 8, -3.6, 0]]) {
                const wl = box(w, 3.4, d, cs); wl.position.set(x, 1.7, z); cas.add(wl);
                const n = Math.round(Math.max(w, d) / 0.9);
                for (let k = 0; k < n; k++) { const mer = box(0.45, 0.5, 0.45, cs); const u = -Math.max(w, d) / 2 + (k + 0.5) * Math.max(w, d) / n; mer.position.set(w > d ? u : x, 3.65, w > d ? z : u); cas.add(mer); }
            }
            for (const [x, z] of [[-3.8, -3.8], [3.8, -3.8], [-3.8, 3.8], [3.8, 3.8]]) {
                const tw = cyl(1.15, 1.25, 4.6, cs, 14); tw.position.set(x, 2.3, z); cas.add(tw);
                for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; const mer = box(0.4, 0.45, 0.4, cs); mer.position.set(x + Math.cos(a) * 1.0, 4.8, z + Math.sin(a) * 1.0); cas.add(mer); }
            }
            await ctx.put(cas, -2, 47, { scale: 1.3 });
        }
    },

    // La torre de control: aquí suena «CARI1 saliendo» y despegamos.
    // Torre con cabina acristalada y baliza, hangar del CARI1, avioneta, panel de salidas,
    // luces de pista y ella esperando con su maleta (la pasajera)
    torre: {
        terrain(ctx) { const c = ctx.pos(0, 14); ctx.track.addFlat(c.x, c.z, 20); },
        async build(ctx) {
            const tw = new THREE.Group();
            const shaft = cyl(1.1, 1.45, 11, '#f4f6fb', 18); tw.add(shaft);
            for (const y of [3, 6.5]) { const b = cyl(1.2, 1.2, 0.3, '#e8173b', 18); b.position.y = y; tw.add(b); }
            const deck = cyl(2.3, 1.4, 0.6, '#e6e9ef', 8); deck.position.y = 11.1; tw.add(deck);
            const cab = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.1, 2.1, 8), M('#5fb3a5')); cab.position.y = 12.5; tw.add(cab);
            for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + Math.PI / 8; const mul = box(0.1, 2.1, 0.1, '#f4f6fb'); mul.position.set(Math.cos(a) * 2.32, 11.45, Math.sin(a) * 2.32); tw.add(mul); }
            const roof = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.6, 0.45, 8), M('#f4f6fb')); roof.position.y = 13.75; tw.add(roof);
            const antn = cyl(0.05, 0.08, 2.6, '#c7ccd8', 6); antn.position.y = 14; tw.add(antn);
            const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff3355', toneMapped: false }));
            const bg = new THREE.Group(); beacon.position.y = 16.7; bg.add(beacon);
            const hpSign = textPlane('', 3.2, { width: 640, height: 200, bg: '#1d5bbf', fg: '#ffffff', lines: ['AEROCLUB', 'Torre de control'], font: 'Fredoka', weight: 700, border: 8, borderColor: '#ffffff' });
            hpSign.position.set(0, 9.4, 1.4); tw.add(hpSign);
            await ctx.put(tw, 4, 16);
            await ctx.put(bg, 4, 16, { dynamic: true });
            ctx.anim((dt, tm) => { beacon.visible = Math.floor(tm * 1.6) % 2 === 0; });
            ctx.reserve(4, 16, 4);
            // Hangar con el CARI1 pintado
            const hg = new THREE.Group();
            const corr = new THREE.MeshToonMaterial({ map: corrugatedTexture() });
            const HW = 9, HD = 7, HH = 3.6;
            for (const [w, h, d, x, y, z] of [[HW, HH, 0.2, 0, HH / 2, -HD / 2], [0.2, HH, HD, -HW / 2, HH / 2, 0], [0.2, HH, HD, HW / 2, HH / 2, 0]]) { const m = new THREE.Mesh(metricUV(new THREE.BoxGeometry(w, h, d), 1.2), corr); m.position.set(x, y, z); hg.add(m); }
            const vault = new THREE.Mesh(new THREE.CylinderGeometry(HW / 2 + 0.2, HW / 2 + 0.2, HD + 0.4, 24, 1, true, Math.PI / 2, Math.PI), new THREE.MeshToonMaterial({ color: '#97a0b3', side: THREE.DoubleSide }));
            vault.rotation.x = Math.PI / 2; vault.scale.z = 0.5; vault.position.y = HH; hg.add(vault);
            const inner = new THREE.Mesh(new THREE.PlaneGeometry(HW - 0.4, HH), M('#3b4152')); inner.position.set(0, HH / 2, -HD / 2 + 0.12); hg.add(inner);
            const name = textPlane('CARI1 ✈', 4.5, { width: 700, height: 180, bg: null, fg: '#e8173b', stroke: '#ffffff', font: 'Bangers', weight: 400, border: 0 });
            name.position.set(0, HH + 1.3, HD / 2 + 0.3); hg.add(name);
            await ctx.put(hg, -11, 16);
            ctx.reserve(-11, 16, 6);
            // Avioneta aparcada delante del hangar
            const pl = new THREE.Group();
            const fus = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 2.8, 6, 14), M('#f4f6fb')); fus.rotation.x = Math.PI / 2; fus.position.y = 1.0; pl.add(fus);
            const wing = box(5.2, 0.1, 0.9, '#e8173b'); wing.position.set(0, 1.25, 0.2); pl.add(wing);
            const tail = box(1.6, 0.08, 0.5, '#e8173b'); tail.position.set(0, 1.15, -1.6); pl.add(tail);
            const fin = box(0.08, 0.8, 0.6, '#e8173b'); fin.position.set(0, 1.6, -1.65); pl.add(fin);
            const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 8), M('#25324f')); cockpit.scale.set(0.9, 0.7, 1.4); cockpit.position.set(0, 1.35, 0.6); pl.add(cockpit);
            for (const x of [-0.6, 0.6]) { const lg = cyl(0.03, 0.03, 0.6, '#5b6377', 6); lg.position.set(x, 0.3, 0.3); pl.add(lg); const wh = cyl(0.14, 0.14, 0.08, '#1e2130', 10); wh.rotation.z = Math.PI / 2; wh.position.set(x, 0.14, 0.3); pl.add(wh); }
            // hélice: las palas centradas en el eje (box() las subía media altura) y morro con buje
            const prop = new THREE.Group(); prop.position.set(0, 1.0, 1.95);
            for (const r of [0, Math.PI / 2]) { const bl = box(0.08, 1.2, 0.04, '#2b2d42'); bl.position.y = 0; bl.rotation.z = r; prop.add(bl); }
            const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.28, 12), M('#e8173b')); spinner.rotation.x = Math.PI / 2; spinner.position.z = 0.12; prop.add(spinner);
            pl.add(prop);
            await ctx.put(pl, -11, 9.5, { rot: 0.5, dynamic: true });
            ctx.anim((dt) => { prop.rotation.z += dt * 18; });
            // Panel de salidas
            const fids = new THREE.Group();
            const ft = textPlane('', 4, { width: 900, height: 360, bg: '#141826', fg: '#ffb347', lines: ['SALIDAS ✈', 'CARI1  Oficina      EMBARQUE ♥', 'CARI1  Montserrat  A TIEMPO', 'CARI1  Marte 🔴    PRÓXIMAMENTE'], font: 'Fredoka', weight: 700, border: 8, borderColor: '#2b2d42', radius: 10 });
            ft.position.y = 2.6; fids.add(ft);
            for (const x of [-1.7, 1.7]) { const p2 = cyl(0.07, 0.07, 1.6, '#5b6377', 6); p2.position.x = x; fids.add(p2); }
            await ctx.put(fids, 10, 5.4, { rot: -0.25 });
            // Ella con su maleta y él a su lado
            await ctx.couple(13.5, 4.6, { anim: 'emote-yes', gap: 0.9 });
            const suit = new THREE.Group();
            const sb = box(0.45, 0.6, 0.25, '#ff4d8d'); sb.position.y = 0.35; suit.add(sb);
            const hdl = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 12, Math.PI), M('#1b1b22')); hdl.position.y = 0.72; suit.add(hdl);
            for (const x of [-0.15, 0.15]) { const w = cyl(0.04, 0.04, 0.05, '#1b1b22', 8); w.rotation.z = Math.PI / 2; w.position.set(x, 0.04, 0); suit.add(w); }
            await ctx.put(suit, 14.6, 4.3);
            // Manga de viento y luces de pista a los dos lados
            const sock = new THREE.Group();
            sock.add(cyl(0.06, 0.06, 3.2, '#c7ccd8', 6));
            const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.2, 10, 1, true), M('#ff7a00', { side: THREE.DoubleSide }));
            cone.rotation.z = Math.PI / 2; cone.position.set(0.6, 3, 0); sock.add(cone);
            await ctx.put(sock, -4, 6, { dynamic: true });
            ctx.anim((dt, tm) => { cone.rotation.x = Math.sin(tm * 2) * 0.2; });
            const lights = [];
            for (let a = -ctx.len / 2; a <= ctx.len / 2; a += 3) for (const sd of [2.9, -2.9]) {
                const l = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: '#7ad7ff', toneMapped: false }));
                await ctx.put(l, a, sd, { y: 0.2, dynamic: true }); lights.push([l, a]);
            }
            ctx.anim((dt, tm) => { if (!ctx.dynamic.visible) return; const head = (tm * 14) % (ctx.len + 6) - ctx.len / 2; lights.forEach(([l, a]) => l.material.color.set(Math.abs(a - head) < 2 ? '#ffffff' : '#3a6f9a')); });
            ctx.label('Oficina → 1 rotonda', 17, 3.6, { width: 3.2, height: 2.4, opts: { bg: '#ffffff', fg: '#1d5bbf', borderColor: '#1d5bbf' } });
            // El campus al fondo
            for (const [a, sd, fl] of [[-2, 27, 3], [9, 28, 4], [18, 25, 3]]) await ctx.put(building({ w: 8, d: 6, floors: fl, style: 'modern', shops: false, seed: 70 + a }), a, sd);
        }
    },

    lanzarote: {
        terrain(ctx) {
            // Volcanes de Timanfaya al fondo
            for (const [al, sd, r, h] of [[-14, 30, 13, 11], [6, 40, 16, 15], [22, 28, 10, 8], [-30, 44, 12, 9]]) ctx.bump(al, sd, r, h);
        },
        async build(ctx) {
            const t = ctx.track;
            // Cráteres en la cima de los volcanes
            for (const [al, sd, r, h] of [[-14, 30, 13, 11], [6, 40, 16, 15], [22, 28, 10, 8], [-30, 44, 12, 9]]) {
                const p = ctx.pos(al, sd);
                const crater = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.22, r * 0.3, 1.2, 16, 1, true), M('#2a1d1a', { side: THREE.DoubleSide }));
                crater.position.set(p.x, t.heightAt(p.x, p.z) - 0.4, p.z);
                ctx.group.add(crater);
                const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.26, 0.5, 6, 18), M('#8a3b24'));
                rim.rotation.x = Math.PI / 2; rim.position.set(p.x, t.heightAt(p.x, p.z) + 0.1, p.z);
                ctx.group.add(rim);
            }
            // Humo suave del volcán
            const smokeMat = new THREE.MeshBasicMaterial({ color: 0xe8e2dc, transparent: true, opacity: 0.4, depthWrite: false });
            const vp = ctx.pos(6, 40);
            const puffs = [];
            for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 1), smokeMat.clone()); ctx.dynamic.add(m); puffs.push(m); }
            ctx.anim((dt, tm) => {
                if (!ctx.dynamic.visible) return;
                puffs.forEach((m, i) => {
                    const k = (tm * 0.08 + i / 6) % 1;
                    m.position.set(vp.x + Math.sin(i) * k * 3, t.heightAt(vp.x, vp.z) + 1 + k * 10, vp.z + Math.cos(i) * k * 2);
                    m.scale.setScalar(0.6 + k * 2.2);
                    m.material.opacity = 0.42 * (1 - k);
                });
            });
            // Base marciana: cúpulas habitables unidas por túneles, invernadero con el Jardín de Cactus,
            // paneles solares, antena y pista de aterrizaje
            const glassDome = new THREE.MeshToonMaterial({ color: '#bfe8ff', transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
            const habitat = (r) => {
                const g = new THREE.Group();
                const d = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M('#f4f6fb')); g.add(d);
                const win = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.93, r * 0.97, 0.35, 24, 1, true), M('#2c3b52')); win.position.y = r * 0.35; g.add(win);
                const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.12, 6, 24), M('#c7ccd8')); ring.rotation.x = Math.PI / 2; g.add(ring);
                const door = box(0.9, 1.3, 0.5, '#e8173b'); door.position.set(0, 0, r - 0.05); g.add(door);
                const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), glow('#7ad7ff')); lamp.position.y = r + 0.1; g.add(lamp);
                return g;
            };
            await ctx.put(habitat(3.2), -7, 11);
            await ctx.put(habitat(2.4), 1, 13);
            const tube = cyl(0.55, 0.55, 5.4, '#e6e9ef', 12); tube.rotation.z = Math.PI / 2; tube.position.y = 0.6;
            await ctx.put(tube, -3, 12);
            const green = new THREE.Group();
            const gd = new THREE.Mesh(new THREE.SphereGeometry(3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), glassDome); green.add(gd);
            for (let k = 0; k < 4; k++) { const mer = new THREE.Mesh(new THREE.TorusGeometry(3, 0.05, 4, 24, Math.PI), M('#c7ccd8')); mer.rotation.y = k * Math.PI / 4; green.add(mer); }
            const soil = new THREE.Mesh(new THREE.CircleGeometry(2.9, 20), M('#5a3a2a')); soil.rotation.x = -Math.PI / 2; soil.position.y = 0.04; green.add(soil);
            await ctx.put(green, 9, 11);
            for (let i = 0; i < 6; i++) await ctx.put(i % 2 ? 'nature/cactus_tall' : 'nature/cactus_short', 9 + Math.cos(i) * 1.6, 11 + Math.sin(i) * 1.6, { height: 1.1 + (i % 3) * 0.4 });
            const glabel = textPlane('Jardín de Cactus 🌵', 2.6, { width: 520, height: 120, bg: '#1b1b2f', fg: '#7bed9f', border: 6, borderColor: '#7bed9f' });
            await ctx.put(glabel, 9, 7.6, { y: 1.1 });
            for (let k = 0; k < 5; k++) {
                const pn = new THREE.Group();
                const post = cyl(0.05, 0.05, 0.8, '#9aa3b5', 6); pn.add(post);
                const panel = box(1.6, 0.05, 1.0, '#2f4f9f'); panel.position.y = 0.85; panel.rotation.x = -0.5; pn.add(panel);
                await ctx.put(pn, -16 + k * 1.9, 13);
            }
            const ant = new THREE.Group();
            const ap = cyl(0.08, 0.1, 3.4, '#c7ccd8', 8); ant.add(ap);
            const dish = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), M('#f4f6fb', { side: THREE.DoubleSide })); dish.rotation.x = -2.2; dish.position.set(0, 3.4, 0.3); ant.add(dish);
            await ctx.put(ant, -12, 17);
            ctx.reserve(-3, 12, 9); ctx.reserve(9, 11, 4);
            // Rover de seis ruedas paseando
            const rover = new THREE.Group();
            const rb = box(1.6, 0.4, 1.0, '#f4f6fb'); rb.position.y = 0.55; rover.add(rb);
            const rp = box(1.8, 0.05, 1.2, '#2f4f9f'); rp.position.y = 0.8; rover.add(rp);
            const mast = cyl(0.04, 0.04, 0.8, '#c7ccd8', 6); mast.position.set(0.55, 1.15, 0); rover.add(mast);
            const camH = box(0.3, 0.18, 0.2, '#1b1b22'); camH.position.set(0.55, 1.6, 0); rover.add(camH);
            for (const x of [-0.6, 0, 0.6]) for (const z of [-0.62, 0.62]) { const w = cyl(0.22, 0.22, 0.18, '#3a3d48', 12); w.rotation.x = Math.PI / 2; w.position.set(x, 0.22, z); rover.add(w); }
            await ctx.put(rover, 0, 7, { dynamic: true });
            const RA = ctx.pos(-6, 7.5), RB = ctx.pos(6, 6.5);
            ctx.anim((dt, tm) => {
                if (!ctx.dynamic.visible) return;
                const k = (tm * 0.03) % 1, u = k < 0.5 ? k * 2 : 2 - k * 2;
                rover.position.lerpVectors(RA, RB, THREE.MathUtils.smoothstep(u, 0, 1)); rover.position.y = t.heightAt(rover.position.x, rover.position.z);
                rover.rotation.y = Math.atan2(RB.z - RA.z, RB.x - RA.x) * -1 + (k < 0.5 ? 0 : Math.PI);
                camH.rotation.y = Math.sin(tm) * 0.8;
            });
            // Bandera con corazón: primera pareja en Marte
            const flagG = new THREE.Group();
            const fp = cyl(0.04, 0.04, 2.8, '#c7ccd8', 6); flagG.add(fp);
            const fl = textPlane(CONFIG.coupleInitials, 1.3, { width: 400, height: 260, bg: '#ff4d8d', fg: '#ffffff', font: 'Bangers', weight: 400, border: 0, radius: 6 });
            fl.geometry = new THREE.PlaneGeometry(1.3, 0.85); fl.position.set(0.68, 2.35, 0); flagG.add(fl);
            await ctx.put(flagG, -1.5, 5.4, { dynamic: true });
            ctx.anim((dt, tm) => { fl.rotation.y = Math.sin(tm * 1.5) * 0.15; });
            // La Tierra en el cielo de Marte
            const earth = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 16), new THREE.MeshBasicMaterial({ color: '#4aa3ff', fog: false }));
            const ep = ctx.pos(10, -260); earth.position.set(ep.x, 95, ep.z);
            const eLand = new THREE.Mesh(new THREE.SphereGeometry(9.1, 16, 12, 0, 1.6, 0.6, 1.2), new THREE.MeshBasicMaterial({ color: '#4caf50', fog: false })); eLand.position.copy(earth.position);
            ctx.dynamic.add(earth, eLand);
            // La Geria: viñas en hoyos con muro de piedra negra en media luna (zocos)
            for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
                const al = -24 + c * 3.2 + (r % 2) * 1.6, sd = -9 - r * 3;
                const g = new THREE.Group();
                const wall = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.22, 5, 10, Math.PI), M('#2b2523'));
                wall.rotation.x = -Math.PI / 2; wall.position.y = 0.12; g.add(wall);
                const pit = new THREE.Mesh(new THREE.CircleGeometry(0.85, 12), M('#1e1817')); pit.rotation.x = -Math.PI / 2; pit.position.y = 0.05; g.add(pit);
                await ctx.put(g, al, sd, { rot: Math.PI });
                const p = ctx.pos(al, sd);
                ctx.world.plantTree('vine', p.x, p.z, 1, al, p.y);
            }
            ctx.label('La Geria 🍇', -16, -5.5, { width: 2.6, height: 2.2, opts: { bg: '#2b2523', fg: '#fff2b0' } });
            // Camellos de Timanfaya
            const camel = () => {
                const g = new THREE.Group();
                const sand = M('#c99a5b');
                const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 4, 10), sand); body.rotation.x = Math.PI / 2; body.position.y = 1.2; g.add(body);
                const hump = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), sand); hump.position.set(0, 1.6, 0.05); g.add(hump);
                const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.8, 8), sand); neck.position.set(0, 1.55, 0.75); neck.rotation.x = 0.5; g.add(neck);
                const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.42), sand); head.position.set(0, 1.95, 1.02); g.add(head);
                const legs = [];
                for (const [x, z] of [[-0.2, 0.45], [0.2, 0.45], [-0.2, -0.45], [0.2, -0.45]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 1, 6), sand); l.position.set(x, 0.5, z); g.add(l); legs.push(l); }
                const saddle = box(0.5, 0.12, 0.5, '#e8173b'); saddle.position.set(0, 1.62, -0.3); g.add(saddle);
                const helm = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), new THREE.MeshToonMaterial({ color: '#bfe8ff', transparent: true, opacity: 0.35, depthWrite: false }));
                helm.position.set(0, 1.97, 1.02); g.add(helm);
                g.userData.legs = legs;
                return g;
            };
            const camels = [];
            for (let i = 0; i < 3; i++) { const c = camel(); await ctx.put(c, -4 + i * 2.4, 20, { dynamic: true }); camels.push(c); }
            const A = ctx.pos(-12, 20), B = ctx.pos(14, 22);
            ctx.anim((dt, tm) => {
                if (!ctx.dynamic.visible) return;
                camels.forEach((c, i) => {
                    const k = ((tm * 0.02 + i * 0.06) % 1);
                    const u = k < 0.5 ? k * 2 : 2 - k * 2;
                    c.position.lerpVectors(A, B, u); c.position.y = t.heightAt(c.position.x, c.position.z);
                    c.rotation.y = Math.atan2(B.x - A.x, B.z - A.z) + (k < 0.5 ? 0 : Math.PI);
                    c.userData.legs.forEach((l, j) => { l.rotation.x = Math.sin(tm * 4 + j * Math.PI / 2 + i) * 0.35; });
                });
            });
            // Arena negra volcánica y vosotros, con casco, mirando la Tierra
            const beach = new THREE.Mesh(new THREE.CircleGeometry(6, 24), M('#2b2523'));
            beach.geometry.rotateX(-Math.PI / 2); beach.scale.set(1.6, 1, 1);
            await ctx.put(beach, 8, -14, { y: 0.05 });
            await ctx.put('furniture/bench', 7, -11, { height: 0.6, rot: Math.PI });
            const pair = await ctx.couple(7, -11, { anim: 'sit', rot: Math.PI, y: SEAT.bench, gap: 0.6 });
            const helmetGlass = new THREE.MeshToonMaterial({ color: '#d6f0ff', transparent: true, opacity: 0.3, depthWrite: false });
            for (const c of pair) {
                let head = null, hm = null;
                c.traverse(o => { if (o.isBone && o.name === 'head') head = o; if (o.isMesh && /head/i.test(o.name)) hm = o; });
                if (!head || !hm) continue;
                c.updateMatrixWorld(true);
                hm.geometry.computeBoundingBox();
                const bb = hm.geometry.boundingBox.clone().applyMatrix4(hm.matrixWorld);
                const ctr = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
                const ws = head.getWorldScale(new THREE.Vector3()).x || 1;
                const hel = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), helmetGlass);
                hel.position.copy(head.worldToLocal(ctr.clone()));
                hel.scale.setScalar(Math.max(sz.x, sz.y, sz.z) * 0.68 / ws);
                head.add(hel);
            }
            const sign = textPlane('', 5, { width: 1000, height: 300, bg: '#1b1b2f', fg: '#ff7a2b', lines: ['LANZAROTE · MARTE', 'Bienvenidos a nuestro planeta 🚀💕'], borderColor: '#ff4d8d', border: 14, radius: 20, font: 'Bangers', weight: 400 });
            const sg = new THREE.Group(); sign.position.y = 3; sg.add(sign);
            for (const x of [-1.8, 1.8]) { const pp = cyl(0.1, 0.1, 1.6, '#2b2523', 8); pp.position.x = x; sg.add(pp); }
            await ctx.put(sg, -ctx.len / 2 + 6, 4.6);
        }
    },

    montserrat: {
        terrain(ctx) { ctx.bump(2, -38, 26, 3.5); const c = ctx.pos(0, -4); ctx.track.addFlat(c.x, c.z, 9); },
        async build(ctx) {
            // Montserrat en su propia isla: la montaña junto a la carretera, a la izquierda
            const far = ctx.pos(2, -38);
            const mount = new THREE.Group();
            const r = (i) => Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
            // Conglomerado: vetas verticales rosadas y grises con cantos rodados
            const cc = document.createElement('canvas'); cc.width = 64; cc.height = 128;
            const cg2 = cc.getContext('2d');
            for (let x = 0; x < 64; x += 4) { cg2.fillStyle = ['#d9ab9c', '#c99487', '#e2bcae', '#b98a80', '#d4a395'][Math.floor(r(x) * 5)]; cg2.fillRect(x, 0, 4, 128); }
            for (let i = 0; i < 90; i++) { cg2.fillStyle = r(i + 300) < 0.5 ? 'rgba(255,240,230,.5)' : 'rgba(120,80,70,.35)'; cg2.beginPath(); cg2.arc(r(i) * 64, r(i + 99) * 128, 1 + r(i + 7) * 2, 0, Math.PI * 2); cg2.fill(); }
            const ctex = new THREE.CanvasTexture(cc); ctex.colorSpace = THREE.SRGBColorSpace; ctex.wrapS = ctex.wrapT = THREE.RepeatWrapping;
            const rockMats = [new THREE.MeshToonMaterial({ map: ctex }), new THREE.MeshToonMaterial({ map: ctex, color: '#efe0da' })];
            const green = [M('#5f8f4a'), M('#4f7f40'), M('#76a35a')];
            // falda verde irregular
            const skirt = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), green[0]);
            skirt.scale.set(26, 7, 16); skirt.position.y = -1.5; mount.add(skirt);
            // agujas: grupos de "dedos" redondeados, más altos en el centro-izquierda (perfil de sierra)
            const profile = x => 10 + 14 * Math.exp(-(((x + 4) / 9) ** 2)) + 6 * Math.exp(-(((x - 10) / 5) ** 2));
            for (let i = 0; i < 46; i++) {
                const x = (r(i + 7) - 0.5) * 40;
                const h = profile(x) * (0.55 + r(i) * 0.5);
                const w = 1.4 + r(i + 50) * 1.6;
                const needle = new THREE.Mesh(new THREE.CapsuleGeometry(w, h, 5, 12), rockMats[i % 2]);
                needle.scale.set(1, 1, 0.8 + r(i + 11) * 0.4);
                needle.position.set(x, h / 2 + 3, (r(i + 3) - 0.5) * 10);
                needle.rotation.z = (r(i + 21) - 0.5) * 0.18; needle.rotation.x = (r(i + 31) - 0.5) * 0.12;
                mount.add(needle);
                // matojos verdes al pie de cada aguja
                const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(w * 1.1, 0), green[i % 3]);
                bush.scale.y = 0.55; bush.position.set(x + (r(i + 41) - 0.5) * 2, 3 + r(i + 61) * 2, needle.position.z + 2.2); mount.add(bush);
            }
            // el monasterio en su repisa, a media altura
            const mon = new THREE.Group();
            const ledge = new THREE.Mesh(new THREE.BoxGeometry(14, 1.2, 6), M('#b98a80')); ledge.position.y = -0.6; mon.add(ledge);
            const wing = building({ w: 9, d: 3, floors: 4, style: 'stone', shops: false, seed: 91 }); wing.position.set(-2, 0, 0); mon.add(wing);
            const basil = new THREE.Group();
            const bf = new THREE.Mesh(new THREE.BoxGeometry(3.4, 6, 3), M('#d9c7a6')); bf.position.y = 3; basil.add(bf);
            const gab = new THREE.Mesh(new THREE.CylinderGeometry(0, 2.1, 1.4, 4), M('#cdb894')); gab.rotation.y = Math.PI / 4; gab.scale.z = 0.7; gab.position.y = 6.7; basil.add(gab);
            const rose = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), M('#3a4660')); rose.position.set(0, 4.4, 1.51); basil.add(rose);
            const portal = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.8), M('#3a2a1c')); portal.position.set(0, 0.9, 1.51); basil.add(portal);
            basil.position.set(4.6, 0, 0.2); mon.add(basil);
            mon.position.set(-6, 9, 7.5);
            mount.add(mon);
            // el tren cremallera subiendo en zigzag
            const railPts = [[-18, 2.5, 9], [-12, 4.5, 10.5], [-16, 6.5, 10], [-10, 8.6, 9.6]].map(([x, y, z]) => new THREE.Vector3(x, y, z));
            mount.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), 40, 0.18, 5), M('#5b4a44')));
            const train = new THREE.Group();
            const tb = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 1.0), M('#d1312a')); train.add(tb);
            const tw = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.35, 1.02), M('#9fd3f0')); tw.position.y = 0.2; train.add(tw);
            mount.add(train);
            const railCurve = new THREE.CatmullRomCurve3(railPts);
            ctx.anim((dt, t) => { const u = (Math.sin(t * 0.12) + 1) / 2; railCurve.getPoint(u, train.position); train.position.y += 0.6; const tg = railCurve.getTangent(u); train.rotation.y = -Math.atan2(tg.z, tg.x); });
            mount.position.set(far.x, far.y - 0.8, far.z);
            mount.scale.setScalar(0.85);
            const lookFrom = ctx.pos(0, 0);
            mount.lookAt(lookFrom.x, 0, lookFrom.z);
            ctx.app.engine.scene.add(mount);

            const cloudMat = toon('#ffffff', { emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.45 });
            const clouds = [];
            for (let i = 0; i < 9; i++) {
                const cg = new THREE.Group();
                for (let j = 0; j < 4; j++) {
                    const p = new THREE.Mesh(new THREE.IcosahedronGeometry(3 + r(i * 4 + j) * 2.5, 1), cloudMat);
                    p.position.set(j * 3.5 - 5, r(j + i) * 2, r(i + j * 3) * 2);
                    p.scale.y = 0.65;
                    cg.add(p);
                }
                const side = i % 2 ? 1 : -1;
                cg.userData.closed = new THREE.Vector3(side * (2 + r(i) * 6), 30 + (i % 3) * 5, 12 + r(i + 1) * 3);
                cg.userData.open = cg.userData.closed.clone().add(new THREE.Vector3(side * 22, 0, 0));
                cg.position.copy(cg.userData.closed);
                mount.add(cg);
                clouds.push(cg);
            }
            const P = ctx.props;
            let tex = P.photo ? await imageTexture(P.photo) : null;
            if (!tex && P.fallbackPhoto) tex = await imageTexture(P.fallbackPhoto);
            const photo = polaroid(tex, 12);
            photo.position.set(0, 36, 11);
            photo.scale.setScalar(0.001);
            const halo = new THREE.Mesh(new THREE.CircleGeometry(12, 40), new THREE.MeshBasicMaterial({ color: 0xfff2c4, transparent: true, opacity: 0, depthWrite: false }));
            halo.position.set(0, 36, 10.5);
            mount.add(halo, photo);
            mount.updateMatrixWorld(true);
            ctx.place.runtime.mountain = mount;
            ctx.place.runtime.target = mount.localToWorld(new THREE.Vector3(0, 30, 0));
            ctx.place.runtime.reveal = async (on = true) => {
                await ctx.fx.tween(on ? 3.5 : 2, e => {
                    const k = on ? e : 1 - e;
                    clouds.forEach(c => c.position.lerpVectors(c.userData.closed, c.userData.open, k));
                    photo.scale.setScalar(Math.max(0.001, k));
                    halo.material.opacity = k * 0.45;
                });
            };
            // El mirador: banco mirando hacia Montserrat, pretil de piedra, prismáticos de moneda y cipreses
            await ctx.put('furniture/bench', 0, -4.2, { height: 0.6, rot: Math.PI });
            await ctx.couple(0, -4.2, { anim: 'sit', rot: Math.PI, y: SEAT.bench, gap: 0.6 });
            for (let a = -7; a <= 7; a += 2) {
                const seg = new THREE.Mesh(metricUV(new THREE.BoxGeometry(2.04, 0.7, 0.45), 1.6), stoneMaterial()); seg.position.y = 0.35;
                await ctx.put(seg, a, -6.2);
            }
            const scope = new THREE.Group();
            const post = cyl(0.08, 0.1, 1.1, '#2f6f5a', 8); scope.add(post);
            const head = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.32, 0.36, 2, 0.08), M('#2f8f6a')); head.position.y = 1.3; scope.add(head);
            for (const x of [-0.11, 0.11]) { const lens = cyl(0.07, 0.07, 0.2, '#1b1b22', 10); lens.rotation.x = Math.PI / 2; lens.position.set(x, 1.32, -0.25); scope.add(lens); }
            await ctx.put(scope, 3.2, -5.4, { rot: Math.PI });
            for (const [a, sd] of [[-6, -3.4], [6.5, -3.6]]) { const p = ctx.pos(a, sd); ctx.world.plantTree('cypress', p.x, p.z, 1.2, 0, p.y - 0.05); }
            for (let i = 0; i < 12; i++) { const p = ctx.pos(-6 + i, -5.2 + (i % 2) * 0.4); ctx.world.plantTree('tulip', p.x, p.z, 1, i, p.y - 0.03); }
            await ctx.trees(['nature/tree_default', 'nature/tree_oak'], 6, 5, 14);
        }
    },

    supercharger: {
        terrain(ctx) {
            const P = ctx.place.park;
            const c = ctx.pos(P.s - P.R - ctx.place.sCenter, 7);
            ctx.track.addFlat(c.x, c.z, 22);
        },
        async build(ctx) {
            const t = ctx.track, P = ctx.place.park;
            const bayA = P.s - P.R - ctx.place.sCenter;       // "along" de nuestra plaza
            const bayL = P.R + P.d;                          // lado del centro del coche aparcado
            const flat = (w, d, color, along, side, y = 0.06) => {
                const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), M(color));
                return ctx.put(m, along, side, { y });
            };
            // Explanada de asfalto, plazas pintadas y topes
            await flat(36, 11, '#4a4f5f', bayA + 1, 7.2);
            for (let k = -4; k <= 4; k++) {
                const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 4.4).rotateX(-Math.PI / 2), glow('#f4f4f4'));
                await ctx.put(line, bayA + (k + 0.5) * 3.2, bayL + 0.2, { y: 0.08 });
                if (k < 4) {
                    const stop = box(1.4, 0.13, 0.22, '#c9c3b6');
                    await ctx.put(stop, bayA + k * 3.2, bayL + 1.75);
                    const bolt = textPlane('⚡', 0.9, { width: 128, height: 128, bg: null, fg: '#2f9e44', size: 110 });
                    bolt.rotation.x = -Math.PI / 2;
                    await ctx.put(bolt, bayA + k * 3.2, bayL - 0.9, { y: 0.09 });
                }
            }
            // Postes de carga (estilo V4): cuerpo blanco redondeado, franja roja, pantalla y cable enrollado
            const stalls = [];
            for (let k = -4; k <= 3; k++) {
                const g = new THREE.Group();
                const base = box(0.8, 0.14, 0.6, '#c9c3b6'); g.add(base);
                const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.55, 6, 14), M('#f4f5f7'));
                body.scale.set(1, 1, 0.62); body.position.y = 1.15; g.add(body);
                const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 1.2), glow('#e31937'));
                strip.position.set(0, 1.2, 0.142); g.add(strip);
                const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.16), glow('#1b2a44'));
                screen.position.set(0, 1.62, 0.141); g.add(screen);
                const holster = box(0.12, 0.2, 0.14, '#2a2d3a'); holster.position.set(0.25, 0.95, 0.06); g.add(holster);
                const cable = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 6, 18, Math.PI * 1.3), M('#1e2130'));
                cable.rotation.y = Math.PI / 2; cable.position.set(0.28, 0.72, 0.05); g.add(cable);
                // el de nuestra plaza no se fusiona: su cable y su luz cambian al cargar
                await ctx.put(g, bayA + k * 3.2 - 0.95, bayL + 2.2, { dynamic: k === 0 });
                g.userData.strip = strip; g.userData.screen = screen; g.userData.holster = holster; g.userData.cable = cable;
                stalls.push({ k, g });
            }
            // Marquesina solar con tira de luz
            const roofLen = 9 * 3.2;
            const roof = box(roofLen, 0.25, 6.6, '#e9ebef');
            await ctx.put(roof, bayA - 0.95, bayL + 0.3, { y: 3.9 });
            const sc = document.createElement('canvas'); sc.width = 256; sc.height = 64;
            const x = sc.getContext('2d');
            x.fillStyle = '#1b2f5e'; x.fillRect(0, 0, 256, 64);
            x.strokeStyle = '#8fb4ff'; x.lineWidth = 1;
            for (let i = 0; i <= 256; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 64); x.stroke(); }
            for (let j = 0; j <= 64; j += 16) { x.beginPath(); x.moveTo(0, j); x.lineTo(256, j); x.stroke(); }
            const tex = new THREE.CanvasTexture(sc); tex.colorSpace = THREE.SRGBColorSpace;
            const panels = new THREE.Mesh(new THREE.PlaneGeometry(roofLen - 0.4, 6.2).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: tex }));
            await ctx.put(panels, bayA - 0.95, bayL + 0.3, { y: 4.04 });
            const led = new THREE.Mesh(new THREE.BoxGeometry(roofLen, 0.08, 0.1), glow('#fff6e0'));
            await ctx.put(led, bayA - 0.95, bayL - 3.0, { y: 3.74, dynamic: true });
            for (let k = -4; k <= 5; k += 3) await ctx.put(cyl(0.12, 0.14, 3.8, '#c7ccd8', 10), bayA + k * 3.2 - 2.55, bayL + 3.4);
            // Otros Teslas cargando (no en modo ligero)
            if (!ctx.app.engine.lite) {
                for (const [k, color] of [[-3, '#d7263d'], [-1, '#2f6fe0'], [2, '#1b1b22']]) {
                    const c = await parkedTesla(color);
                    const p = ctx.pos(bayA + k * 3.2, bayL);
                    c.position.copy(p).y += 0.07;
                    c.rotation.y = ctx.track.headingAt(ctx.s(bayA + k * 3.2)) + Math.PI / 2;
                    ctx.group.add(c);
                    const st = stalls.find(s2 => s2.k === k);
                    if (st) st.g.userData.strip.material = glow('#2f9e44');
                }
            }
            // Tótem a la entrada
            const totem = new THREE.Group();
            totem.add(box(1.2, 5.6, 0.45, '#f4f5f7'));
            const band = box(1.22, 0.5, 0.47, '#e31937'); band.position.y = 5.0; totem.add(band);
            const tt = textPlane('', 1.05, { width: 256, height: 640, bg: '#f4f5f7', fg: '#1b1b2f', lines: ['⚡', 'SUPER', 'CHAR', 'GER'], border: 0, radius: 0, font: 'Bangers', weight: 400 });
            tt.geometry = new THREE.PlaneGeometry(1.05, 2.6); tt.position.set(0, 3.1, 0.23); totem.add(tt);
            await ctx.put(totem, -ctx.len / 2 + 3, 3.4);
            // Lounge con café
            const lounge = new THREE.Group();
            lounge.add(box(7, 3, 4, '#f2efe6'));
            const glass = box(5.6, 1.9, 0.06, '#7fb7d9'); glass.position.set(0, 1.25, 2.02); lounge.add(glass);
            const ls = textPlane('LOUNGE · CAFÉ ☕', 4, { width: 800, height: 150, bg: '#1b1b2f', fg: '#ffffff', border: 0 });
            ls.position.set(0, 2.75, 2.06); lounge.add(ls);
            await ctx.put(lounge, bayA + 17, 9.5);
            await ctx.put('furniture/bench', bayA + 15.5, 6.6, { height: 0.6 });
            await ctx.put('food/cup-coffee', bayA + 15.9, 6.6, { height: 0.14, y: 0.46 });
            for (const a of [-14, 21]) await ctx.put('roads/light-curved', bayA + a, 3.2, { height: 4.2, rot: Math.PI / 2 });
            for (let i = 0; i < 5; i++) await ctx.put(i % 2 ? 'nature/cactus_tall' : 'nature/cactus_short', bayA - 16 + i * 8, 14 + (i % 2) * 3, { height: 1.6 + (i % 3) * 0.4 });
            await ctx.trees('nature/tree_palmTall', 4, 12, 14, { height: 4.5 });
            ctx.label('Parte 2 · El coche 🚗', -ctx.len / 2 + 2, -2.5, { width: 3.2, height: 2.4, opts: { bg: '#ffffff', fg: '#e31937' } });
            ctx.reserve(bayA, 8, 15);

            // --- Carga: cable desde el poste de nuestra plaza hasta el puerto (detrás a la izquierda) ---
            const mine = stalls.find(s2 => s2.k === 0).g;
            let cableMesh = null, portGlow = null, offAnim = null;
            ctx.place.runtime.startCharging = (car) => {
                ctx.place.runtime.stopCharging();
                car.root.updateMatrixWorld(true); mine.updateMatrixWorld(true);
                const A = mine.userData.holster.getWorldPosition(new THREE.Vector3());
                const B = car.body.children[0].localToWorld(new THREE.Vector3(0.55, 0.62, -CONFIG.car.length / 2 + 0.12));
                const mid = A.clone().lerp(B, 0.5); mid.y = Math.min(A.y, B.y) - 0.35;
                const curve = new THREE.CatmullRomCurve3([A, A.clone().lerp(mid, 0.5).setY(A.y - 0.3), mid, B]);
                cableMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.035, 6), M('#1e2130'));
                portGlow = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.9, toneMapped: false }));
                portGlow.position.copy(B);
                ctx.app.engine.scene.add(cableMesh, portGlow);
                mine.userData.cable.visible = false;
                mine.userData.strip.material = glow('#2f9e44');
                offAnim = ctx.app.engine.onUpdate((dt, tm) => { portGlow.material.opacity = 0.55 + 0.4 * Math.sin(tm * 4); });
            };
            ctx.place.runtime.stopCharging = () => {
                if (cableMesh) { ctx.app.engine.scene.remove(cableMesh, portGlow); cableMesh.geometry.dispose(); cableMesh = null; }
                if (offAnim) { offAnim(); offAnim = null; }
                mine.userData.cable.visible = true;
                mine.userData.strip.material = glow('#e31937');
            };
        }
    },

    desierto: {
        async build(ctx) {
            const L = ctx.len;
            // Escudos de ruta, cactus, rocas en arco, un motel y bolas de paja rodando
            for (let a = -L / 2 + 10; a < L / 2 - 5; a += 34) {
                const shield = textPlane('', 1.1, { width: 256, height: 256, bg: '#ffffff', fg: '#1b1b2f', lines: ['RUTA', '♥ 2'], borderColor: '#1b1b2f', border: 14, radius: 60, font: 'Bangers', weight: 400 });
                const sg = new THREE.Group(); shield.position.y = 1.8; sg.add(shield, cyl(0.05, 0.05, 1.3, '#9aa3b5', 6));
                await ctx.put(sg, a, 2.8);
            }
            for (let i = 0; i < 26; i++) {
                const a = -L / 2 + rnd() * L, sd = (rnd() < 0.5 ? -1 : 1) * (5 + rnd() * 18);
                await ctx.put(i % 3 ? 'nature/cactus_tall' : 'nature/cactus_short', a, sd, { height: 1.4 + rnd() * 1.4, rot: rnd() * 6 });
            }
            const arch = (along, side, sc = 1) => {
                const g = new THREE.Group();
                const rock = M('#c8693f');
                const curve = new THREE.Mesh(new THREE.TorusGeometry(3 * sc, 0.9 * sc, 6, 14, Math.PI), rock);
                curve.position.y = 0.2; g.add(curve);
                for (const x of [-3, 3]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(1 * sc, 1.3 * sc, 1.5 * sc, 7), rock); leg.position.set(x * sc, 0.4, 0); g.add(leg); }
                return ctx.put(g, along, side);
            };
            await arch(-L / 2 + 60, 16, 1.2);
            await arch(L / 2 - 80, -20, 1);
            // Motel Corazón
            const motel = new THREE.Group();
            motel.add(box(9, 2.6, 3.6, '#f2d7b0'));
            for (let i = 0; i < 4; i++) { const d = box(0.8, 1.5, 0.06, i % 2 ? '#2f9e44' : '#4cc9f0'); d.position.set(-3.3 + i * 2.2, 0.75, 1.82); motel.add(d); }
            await ctx.put(motel, -L / 2 + 120, 13);
            const msign = new THREE.Group();
            const mt = textPlane('', 2.8, { width: 600, height: 420, bg: '#ff4d8d', fg: '#ffffff', lines: ['MOTEL', 'CORAZÓN', '♥ VACANCY'], border: 12, borderColor: '#fff2b0', font: 'Bangers', weight: 400 });
            mt.geometry = new THREE.PlaneGeometry(2.8, 1.96); mt.position.y = 4.2; msign.add(mt, cyl(0.1, 0.1, 3.2, '#9aa3b5', 8));
            await ctx.put(msign, -L / 2 + 112, 4.2);
            // Avisos simpáticos
            ctx.label('Cari, ojos en la carretera 👀', -L / 2 + 40, 3.4, { width: 3.6, height: 2.4, opts: { bg: '#ffd23f', fg: '#1b1b2f' } });
            ctx.label('Velocidad máxima: la del amor 💕', L / 2 - 50, 3.4, { width: 3.8, height: 2.4, opts: { bg: '#ffffff', fg: '#e8173b' } });
            ctx.label('Próximo Supercharger: ¿para qué? 🔋100%', 10, 3.4, { width: 4, height: 2.4 });
            await ctx.put('town/windmill', -L / 2 + 170, 18, { height: 6 });
            // Bolas de paja (rodadoras) cruzando la carretera
            const tumbles = [];
            for (let i = 0; i < 4; i++) {
                const tb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), new THREE.MeshBasicMaterial({ color: 0xb08850, wireframe: true }));
                ctx.dynamic.add(tb); tumbles.push({ tb, a: -L / 2 + 30 + i * 80, ph: i * 1.7 });
            }
            ctx.anim((dt, tm) => {
                if (!ctx.dynamic.visible) return;
                for (const T of tumbles) {
                    const k = ((tm * 0.07 + T.ph) % 1);
                    const p = ctx.pos(T.a + k * 6, 14 - k * 30);
                    T.tb.position.copy(p).y += 0.45 + Math.abs(Math.sin(tm * 3 + T.ph)) * 0.3;
                    T.tb.rotation.x += dt * 4; T.tb.rotation.z += dt * 2;
                }
            });
            ctx.reserve(-L / 2 + 120, 13, 7);

            // --- Estampas de road trip a lo largo de la ruta ---
            const A = f => -L / 2 + f;
            // Diner retro con neón
            const diner = new THREE.Group();
            const db = new THREE.Mesh(new THREE.CapsuleGeometry(1.6, 6, 4, 16), M('#e9eef5')); db.rotation.z = Math.PI / 2; db.scale.set(1, 1, 0.9); db.position.y = 1.6; diner.add(db);
            const stripe = new THREE.Mesh(new THREE.CapsuleGeometry(1.62, 6, 4, 16, 1), M('#e8173b')); stripe.rotation.z = Math.PI / 2; stripe.scale.set(0.16, 1, 0.92); stripe.position.y = 1.1; diner.add(stripe);
            for (let k = 0; k < 6; k++) { const w = box(0.8, 0.7, 0.05, '#7ad7ff'); w.position.set(-2.6 + k * 1.05, 2.0, 1.45); diner.add(w); }
            const dsign = textPlane('', 3.2, { width: 640, height: 200, bg: '#1b1b2f', fg: '#ff7eb3', lines: ['DINER ♥ 66'], font: 'Bangers', weight: 400, border: 10, borderColor: '#4cc9f0' });
            dsign.position.set(0, 4.0, 0.2); diner.add(dsign);
            for (const x of [-1.2, 1.2]) { const p = cyl(0.06, 0.06, 1.2, '#9aa3b5', 6); p.position.set(x, 3.0, 0); diner.add(p); }
            await ctx.put(diner, A(25), 13);
            await ctx.put('car/sedan', A(31), 9.5, { height: 1.0, rot: 0.6 });
            ctx.reserve(A(25), 13, 6);
            // Depósito de agua con el corazón pintado
            const tower = new THREE.Group();
            for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) { const lg = cyl(0.1, 0.12, 6, '#8a6a44', 6); lg.position.set(x, 0, z); tower.add(lg); }
            const tank = cyl(2, 2, 2.6, '#c7ccd8', 20); tank.position.y = 6; tower.add(tank);
            const troof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.0, 20), M('#9aa3b5')); troof.position.y = 9.1; tower.add(troof);
            const tlab = textPlane(CONFIG.coupleInitials, 2.4, { width: 400, height: 160, bg: null, fg: '#e8173b', font: 'Bangers', weight: 400, border: 0 });
            tlab.position.set(0, 7.3, 2.02); tower.add(tlab);
            await ctx.put(tower, A(85), 17);
            ctx.reserve(A(85), 17, 3.5);
            // Árboles de Josué
            const joshua = (a, sd, sc) => {
                const g = new THREE.Group();
                const trunk = cyl(0.18, 0.26, 2.2, '#8b7d6b', 6); g.add(trunk);
                for (let k = 0; k < 3; k++) {
                    const ang = k / 3 * Math.PI * 2 + rnd();
                    const arm = cyl(0.11, 0.14, 1.3, '#8b7d6b', 5); arm.position.set(Math.cos(ang) * 0.45, 2.3, Math.sin(ang) * 0.45); arm.rotation.set(Math.sin(ang) * 0.6, 0, -Math.cos(ang) * 0.6); g.add(arm);
                    const tuft = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), M('#6f8f4a')); tuft.position.set(Math.cos(ang) * 0.85, 2.95, Math.sin(ang) * 0.85); tuft.scale.y = 0.8; g.add(tuft);
                }
                return ctx.put(g, a, sd, { scale: sc, rot: rnd() * 6 });
            };
            for (let i = 0; i < 16; i++) await joshua(A(15 + i * 21 + rnd() * 8), (i % 2 ? 1 : -1) * (8 + rnd() * 12), 0.9 + rnd() * 0.5);
            // Rocas en equilibrio, valla de rancho y una calavera de vaca
            const hoodoo = new THREE.Group();
            for (const [x, h, r] of [[0, 3.4, 1.0], [1.8, 2.4, 0.8], [-1.6, 2.0, 0.7]]) {
                const col = new THREE.Mesh(new THREE.CapsuleGeometry(r, h, 4, 8), M('#c8693f')); col.position.set(x, h / 2 + r, 0); hoodoo.add(col);
                const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 1.3, 10, 8), M('#8e4a2c')); cap.scale.y = 0.55; cap.position.set(x, h + r * 2 + 0.1, 0); hoodoo.add(cap);
            }
            await ctx.put(hoodoo, A(145), 12);
            for (let k = 0; k < 7; k++) { const post = box(0.12, 1.0, 0.12, '#8a6a44'); await ctx.put(post, A(150) + k * 1.8, 6.8); }
            const frail = box(11, 0.07, 0.07, '#8a6a44'); frail.position.y = 0.8; await ctx.put(frail, A(155.4), 6.8);
            const skull = new THREE.Group();
            const sk = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), M('#f2ead6')); sk.scale.set(1, 0.8, 1.3); skull.add(sk);
            for (const sx of [-1, 1]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.45, 6), M('#f2ead6')); horn.rotation.z = sx * 1.2; horn.position.set(sx * 0.32, 0.12, 0); skull.add(horn); }
            await ctx.put(skull, A(152), 6.4, { y: 0.2 });
            // Gasolinera antigua reconvertida: surtidores retro jubilados y un Supercharger
            const gas = new THREE.Group();
            const canopy = box(8, 0.35, 4, '#ffffff'); canopy.position.y = 3.3; gas.add(canopy);
            const cstripe = box(8.05, 0.12, 4.05, '#e8173b'); cstripe.position.y = 3.25; gas.add(cstripe);
            for (const x of [-3.5, 3.5]) { const p = cyl(0.15, 0.15, 3.3, '#c7ccd8', 8); p.position.set(x, 0, 0); gas.add(p); }
            for (const x of [-2, -0.6]) {
                const pump = box(0.7, 1.5, 0.5, '#d1312a'); pump.position.set(x, 0, 0); gas.add(pump);
                const globe = sphere(0.3, '#fff3d6'); globe.position.set(x, 1.8, 0); gas.add(globe);
                const cob = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.03, 6, 12), M('#1b1b22')); cob.position.set(x, 1.0, 0.3); gas.add(cob);
            }
            const sc2 = new THREE.Group();
            const scb = box(0.5, 1.9, 0.35, '#ffffff'); sc2.add(scb);
            const sct = box(0.5, 0.25, 0.37, '#e8173b'); sct.position.y = 1.7; sc2.add(sct);
            sc2.position.set(1.8, 0, 0); gas.add(sc2);
            const gsign = textPlane('', 3.6, { width: 800, height: 170, bg: '#ffffff', fg: '#1b1b2f', lines: ['¿Gasolina? No, gracias ⚡'], font: 'Fredoka', weight: 700, border: 8, borderColor: '#e8173b' });
            gsign.position.set(0, 4.0, 0); gas.add(gsign);
            await ctx.put(gas, A(205), 11);
            ctx.reserve(A(205), 11, 5.5);
            // Autocine en mitad del desierto
            const screen = new THREE.Group();
            const scr = textPlane('', 9, { width: 900, height: 450, bg: '#ffffff', fg: '#ff4d8d', lines: ['♥', 'Y vivieron', 'felices…'], font: 'Bangers', weight: 400, border: 14, borderColor: '#1b1b2f' });
            scr.geometry = new THREE.PlaneGeometry(9, 4.5); scr.position.y = 5; screen.add(scr);
            const scrBack = box(9.3, 4.8, 0.2, '#1b1b2f'); scrBack.position.set(0, 2.6, -0.15); screen.add(scrBack);
            for (const x of [-3.5, 0, 3.5]) { const p = box(0.3, 2.8, 0.3, '#5b6377'); p.position.set(x, 0, -0.2); screen.add(p); }
            await ctx.put(screen, A(240), 22);
            for (const [da, sd] of [[-3, 14], [0, 13.5], [3, 14]]) await ctx.put('car/suv', A(240) + da, sd, { height: 1.1, rot: Math.PI });
            ctx.reserve(A(240), 18, 7);
            // Globo aerostático con corazón
            const bal = new THREE.Group();
            const env = new THREE.Mesh(new THREE.SphereGeometry(2.6, 18, 14), M('#ff4d8d')); env.scale.y = 1.15; env.position.y = 3.2; bal.add(env);
            for (let k = 0; k < 6; k++) { const band = new THREE.Mesh(new THREE.SphereGeometry(2.62, 18, 14, k * Math.PI / 3, Math.PI / 12), M('#fff2b0')); band.scale.y = 1.15; band.position.y = 3.2; bal.add(band); }
            const skirt = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.6, 14, 1, true), M('#ff4d8d')); skirt.rotation.x = Math.PI; skirt.position.y = 0.5; bal.add(skirt);
            const basket = box(0.9, 0.7, 0.9, '#a0703c'); basket.position.y = -1.0; bal.add(basket);
            for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) { const rp = cyl(0.015, 0.015, 1.5, '#5b4a44', 4); rp.position.set(x, -0.2, z); bal.add(rp); }
            await ctx.put(bal, A(275), 20, { y: 10, dynamic: true });
            const by0 = bal.position.y; ctx.anim((dt, t) => { if (ctx.dynamic.visible) { bal.position.y = by0 + Math.sin(t * 0.5) * 0.8; bal.rotation.y = t * 0.1; } });
            // Valla publicitaria
            const bb = new THREE.Group();
            const bbt = textPlane('', 7, { width: 1000, height: 330, bg: '#1b1b2f', fg: '#ffffff', lines: ['Model 3 ⚡ 0% emisiones', '100% amor 💕'], font: 'Bangers', weight: 400, border: 14, borderColor: '#e8173b' });
            bbt.geometry = new THREE.PlaneGeometry(7, 2.3); bbt.position.y = 4.4; bb.add(bbt);
            for (const x of [-2.5, 2.5]) { const p = cyl(0.12, 0.12, 3.3, '#5b6377', 8); p.position.x = x; bb.add(p); }
            await ctx.put(bb, A(300), 10);
        }
    },

    farolillos: {
        async build(ctx) {
            // Arcos de lucecitas sobre la carretera
            const n = Math.max(3, Math.floor(ctx.len / 6));
            for (let i = 0; i < n; i++) {
                const along = -ctx.len / 2 + 2 + i * (ctx.len - 4) / (n - 1);
                const arch = new THREE.Group();
                const w = CONFIG.road.width + 3;
                arch.position.x = 0;
                for (const x of [-w / 2, w / 2]) { const p = cyl(0.07, 0.08, 3.4, '#6b4a2b', 6); p.position.x = x; arch.add(p); }
                for (let k = 0; k <= 14; k++) {
                    const x = -w / 2 + (k / 14) * w;
                    const y = 3.3 - Math.sin((k / 14) * Math.PI) * 0.6;
                    const b = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), glow(k % 3 === 0 ? '#ff9ec7' : '#fff2b0'));
                    b.position.set(x, y, 0);
                    arch.add(b);
                }
                await ctx.put(arch, along, ctx.track.offset, { rot: Math.PI / 2 });
            }
            // Claro en el bosque: pradera a la derecha (el bosque queda al fondo) y aire a la izquierda
            for (let a = -ctx.len / 2 - 4; a <= ctx.len / 2 + 4; a += 7) { ctx.reserve(a, 13, 11); ctx.reserve(a, -5, 3.6); }
            const W = ctx.world;
            const plant = (kind, a, sd, sc = 1) => { const p = ctx.pos(a, sd); W.plantTree(kind, p.x, p.z, sc, rnd() * 6, p.y - 0.03); };
            for (let i = 0; i < 90; i++) plant('grass', -ctx.len / 2 + rnd() * ctx.len, 4 + rnd() * 18, 0.8 + rnd() * 0.6);
            for (let i = 0; i < 26; i++) plant('tulip', -ctx.len / 2 + rnd() * ctx.len, 4.5 + rnd() * 14, 0.9 + rnd() * 0.3);
            await ctx.trees(['nature/tree_pineRoundA', 'nature/tree_pineTallA'], 26, 25, 34, { height: 5 });
            // Charco de luz cálida en el suelo (sin luces reales: barato en el coche)
            const pool = (a, sd, r, color) => ctx.ground(r * 2, r * 2, new THREE.MeshBasicMaterial({ map: poolTexture(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), a, sd, { y: 0.07, seg: 1 });
            const candle = (g, x, z, h = 0.18) => {
                const c = cyl(0.04, 0.04, h, '#fff6e0', 8); c.position.set(x, h / 2, z); g.add(c);
                const fl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), glow('#ffc861')); fl.scale.y = 1.6; fl.position.set(x, h + 0.04, z); g.add(fl);
            };

            // 1 · Pícnic sobre una manta de cuadros, con velas y una tarta
            const pic = new THREE.Group();
            const blanket = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.7), new THREE.MeshToonMaterial({ map: ginghamTexture() }));
            blanket.rotation.x = -Math.PI / 2; blanket.position.y = 0.04; pic.add(blanket);
            const basket = cyl(0.3, 0.26, 0.32, '#b08850', 12); basket.position.set(-0.75, 0.2, -0.35); pic.add(basket);
            const handle = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.025, 6, 16, Math.PI), M('#8a6a44')); handle.position.set(-0.75, 0.36, -0.35); pic.add(handle);
            for (const [x, z] of [[0.7, 0.45], [0.95, -0.4], [-0.2, 0.55]]) candle(pic, x, z);
            await ctx.put(pic, -19, 6.6, { scale: 1.35 });
            await pool(-19, 6.6, 3.2, '#ffb35c');
            await ctx.put('food/cake', -19.2, 6.5, { height: 0.42, y: 0.05 });
            await ctx.put('food/glass-wine', -18.4, 6.1, { height: 0.34, y: 0.05 });
            await ctx.put('food/glass-wine', -18.2, 6.45, { height: 0.34, y: 0.05 });

            // 2 · La acampada: tienda con lucecitas, hoguera y vosotros en el tronco
            await ctx.put('nature/tent_detailedOpen', 1.5, 10.5, { height: 1.9 });
            await ctx.put('nature/campfire_stones', -2.5, 7.2, { height: 0.35 });
            await pool(-2.5, 7.2, 4.5, '#ff9a4d');
            const flames = new THREE.Group();
            [['#ffb347', 0.35, 0.9], ['#ff6b3d', 0.25, 0.7], ['#fff2b0', 0.14, 0.45]].forEach(([c, r, h]) => {
                const f = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), glow(c));
                f.position.y = h / 2 + 0.1;
                flames.add(f);
            });
            await ctx.put(flames, -2.5, 7.2, { dynamic: true });
            ctx.anim((dt, t) => { if (ctx.dynamic.visible) flames.children.forEach((f, i) => { f.scale.y = 0.85 + Math.sin(t * (9 + i * 3)) * 0.18; f.rotation.y = t * (1 + i); }); });
            await ctx.put('nature/log', -4.1, 7.2, { height: 0.35, rot: Math.PI / 2 });
            await ctx.couple(-4.1, 7.2, { anim: 'sit', y: SEAT.log, rot: -Math.PI / 2, heart: true, gap: 0.7 });
            await ctx.put('nature/log_stack', 3.6, 8, { height: 0.6 });
            // guirnalda de bombillas entre dos postes, por encima de la acampada
            for (const a of [-6.5, 4.5]) await ctx.put(cyl(0.06, 0.07, 3, '#6b4a2b', 6), a, 9.6);
            const garland = bulbRow(18, 11);
            await ctx.put(garland, -1, 9.6, { y: 2.6, dynamic: true });
            ctx.anim((dt, t) => { if (ctx.dynamic.visible) garland.userData.bulbs.forEach((b, j) => b.material.color.set((Math.floor(t * 2) + j) % 3 ? '#fff2b0' : '#ff9ec7')); });
            for (const [a, sd] of [[-7.5, 5], [5.5, 6]]) await ctx.put('holiday/lantern', a, sd, { height: 2 });

            // 3 · Manta y telescopio para mirar las estrellas
            const star = new THREE.Group();
            const bl2 = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.5), M('#5b4b8a')); bl2.rotation.x = -Math.PI / 2; bl2.position.y = 0.04; star.add(bl2);
            for (const x of [-0.6, 0.6]) { const pil = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), M('#ffd6e5')); pil.scale.set(1.2, 0.45, 0.8); pil.position.set(x, 0.12, -0.5); star.add(pil); }
            for (const [x, z] of [[0, 0], [0.4, 0.35], [-0.4, 0.35]]) { const leg = cyl(0.03, 0.03, 1.2, '#2b2d42', 6); leg.position.set(1.5 + x * 0.6, 0.55, 0.3 + z - 0.15); leg.rotation.set(z ? 0.25 : -0.25, 0, x * 0.5); star.add(leg); }
            const tube = cyl(0.11, 0.08, 1.1, '#e8c25a', 14); tube.position.set(1.5, 1.35, 0.35); tube.rotation.set(-0.7, 0, 0.3); star.add(tube);
            await ctx.put(star, 14, 6.6, { scale: 1.35 });
            await pool(14, 6.6, 3, '#9db4ff');

            // 4 · Corazón de velas con pétalos
            const ch = new THREE.Group();
            for (let i = 0; i < 30; i++) {
                const t = i / 30 * Math.PI * 2;
                const x = 16 * Math.sin(t) ** 3, z = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
                candle(ch, x * 0.11, -z * 0.11, 0.14 + (i % 3) * 0.04);
            }
            const petal = M('#d6336c');
            for (let i = 0; i < 40; i++) { const pt = new THREE.Mesh(new THREE.CircleGeometry(0.06, 6), petal); pt.rotation.x = -Math.PI / 2; pt.position.set((rnd() - 0.5) * 2.6, 0.05, (rnd() - 0.5) * 2.4); ch.add(pt); }
            await ctx.put(ch, 26, 6.8, { scale: 1.4 });
            await pool(26, 6.8, 3.6, '#ff7eb3');

            // 5 · Los farolillos: suben despacio desde la pradera y se pierden en el cielo
            const lanterns = [];
            const paper = [glow('#ffb35c'), glow('#ff9ec7'), glow('#ffd27a')];
            for (let i = 0; i < 30; i++) {
                const l = new THREE.Group();
                l.scale.setScalar(1.5);
                const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.42, 10), paper[i % 3]);
                const flame = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), glow('#fff6d0')); flame.position.y = -0.16;
                l.add(body, flame);
                await ctx.put(l, -ctx.len / 2 - 6 + rnd() * (ctx.len + 12), 5 + rnd() * 14, { dynamic: true, face: false, scale: 1.5 });
                l.userData.base = l.position.clone();
                l.userData.phase = rnd();
                lanterns.push(l);
            }
            ctx.anim((dt, t) => {
                if (!ctx.dynamic.visible) return;
                lanterns.forEach((l, i) => {
                    const k = (t / 28 + l.userData.phase) % 1;
                    l.position.set(l.userData.base.x + Math.sin(t * 0.5 + i) * 0.6 * k, l.userData.base.y + 0.6 + k * 17, l.userData.base.z + Math.cos(t * 0.4 + i) * 0.6 * k);
                    l.scale.setScalar(1.5 * (k < 0.06 ? Math.max(0.001, k / 0.06) : k > 0.9 ? Math.max(0.001, (1 - k) / 0.1) : 1));
                    l.rotation.y = t * 0.3 + i;
                });
            });
            ctx.label('Parte 3 · Compromiso 💞', -ctx.len / 2 + 3, 3, { width: 3.4, height: 2.4, opts: { bg: '#2e2a63', fg: '#fff2b0', borderColor: '#ff9ec7' } });
        }
    },

    mirador: {
        terrain(ctx) {
            const c = ctx.track.frame(ctx.track.roadEnd + 4);
            ctx.track.addBump(c.x, c.z, 10, 1.2);
        },
        async build(ctx) {
            const t = ctx.track;
            const cf = t.frame(t.roadEnd + 4);
            const top = new THREE.Vector3(cf.x, t.heightAt(cf.x, cf.z), cf.z);
            const g = new THREE.Group();
            g.position.copy(top);
            g.add(cyl(4.6, 4.8, 0.3, '#efe6d8', 32));
            // Columnas altas: la cornisa y las guirnaldas quedan por encima del anillo (no lo tapan)
            const COL = 4.4, CORN = 0.3 + COL + 0.05;
            for (let i = 0; i < 8; i++) {
                const a = i * Math.PI / 4;
                const c = cyl(0.14, 0.16, COL, '#ffffff', 10);
                c.position.set(Math.cos(a) * 3.2, 0.3 + COL / 2, Math.sin(a) * 3.2);
                g.add(c);
            }
            const ring = new THREE.Mesh(new THREE.TorusGeometry(3.25, 0.18, 8, 32), M('#ffffff'));
            ring.rotation.x = Math.PI / 2; ring.position.y = CORN; g.add(ring);
            // Cúpula abierta de nervios (no tapa el estuche del anillo desde ningún ángulo)
            const DH = 3.6 * 0.4;
            for (let k = 0; k < 8; k++) {
                const a = k * Math.PI / 4, pts = [];
                for (let j = 0; j <= 12; j++) { const tt = j / 12 * Math.PI / 2; pts.push(new THREE.Vector3(Math.cos(a) * 3.25 * Math.cos(tt), CORN + DH * Math.sin(tt), Math.sin(a) * 3.25 * Math.cos(tt))); }
                g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.09, 6), M('#ffffff')));
            }
            const midRing = new THREE.Mesh(new THREE.TorusGeometry(3.25 * Math.cos(Math.PI / 4), 0.06, 6, 32), M('#ffd6e5'));
            midRing.rotation.x = Math.PI / 2; midRing.position.y = CORN + DH * Math.sin(Math.PI / 4); g.add(midRing);
            const finial = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), M('#ffd6e5')); finial.position.y = CORN + DH + 0.1; g.add(finial);
            // Foco de luz cálida sobre el pedestal (charco de luz en el suelo y halo)
            const spot = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), new THREE.MeshBasicMaterial({ map: poolTexture(), color: '#ffe6b0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
            spot.rotation.x = -Math.PI / 2; spot.position.y = 0.32; g.add(spot);
            const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.6, COL - 0.1, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#fff2c4', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
            beam.position.y = 0.3 + (COL - 0.1) / 2; g.add(beam);
            for (let i = 0; i < 8; i++) {
                const a0 = i * Math.PI / 4, a1 = (i + 1) * Math.PI / 4;
                for (let k = 1; k < 6; k++) {
                    const tt = k / 6, a = a0 + (a1 - a0) * tt;
                    const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), glow('#fff2b0'));
                    b.position.set(Math.cos(a) * 3.2, CORN - 0.25 - Math.sin(tt * Math.PI) * 0.2, Math.sin(a) * 3.2);
                    g.add(b);
                }
            }
            const ped = cyl(0.45, 0.55, 1.1, '#ffffff', 16);
            ped.position.y = 0.3 + 0.55;      // del suelo del templete (0,3) hasta 1,4
            const capital = cyl(0.68, 0.5, 0.12, '#ffffff', 20);
            capital.position.y = 1.34;
            g.add(ped, capital);
            ctx.group.add(g);
            // Corazón flotando sobre la cúpula del templete, con aire entre ambos (en la pedida mira a la cámara)
            const heart = new THREE.Mesh(heartGeometry(), M('#ff4d8d', { emissive: new THREE.Color('#ff4d8d'), emissiveIntensity: 0.45 }));
            heart.position.copy(top).y += CORN + 3.6 * 0.4 + 0.75 + 1.0;   // cornisa + cúpula + separación + medio corazón
            ctx.dynamic.add(heart);
            ctx.place.runtime.heart = heart;
            const hy = () => heart.userData.y0 ?? (heart.userData.y0 = heart.position.y);
            ctx.anim((dt, tm) => {
                const face = heart.userData.face;
                heart.rotation.y = face === undefined ? tm * 0.6 : face + Math.sin(tm * 0.7) * 0.18;
                const beat = Math.max(0, Math.sin(tm * 5.2)) ** 6 * 0.06;
                heart.scale.setScalar(0.9 * (1 + beat));
                if (face !== undefined) heart.position.y = hy() + Math.sin(tm * 1.1) * 0.05;
            });
            // Farolas y flores alrededor
            for (let i = 0; i < 6; i++) {
                const a = i * Math.PI / 3 + 0.3;
                const lm = await model('town/lantern');
                const h = new THREE.Box3().setFromObject(lm).getSize(new THREE.Vector3()).y;
                lm.scale.multiplyScalar(2.2 / h);
                const x = top.x + Math.cos(a) * 6.5, z = top.z + Math.sin(a) * 6.5;
                lm.position.set(x, t.heightAt(x, z), z);
                ctx.group.add(lm);
            }
            await ctx.trees(['nature/flower_redA', 'nature/flower_purpleA', 'nature/flower_yellowA'], 30, -10, 14, { height: 0.5 });
            ctx.place.runtime.center = top.clone();
            ctx.place.runtime.pedestalTop = top.clone().add(new THREE.Vector3(0, 1.4, 0));
            ctx.world.reserve(top.x, top.z, 7);
        }
    }
};

export async function buildDioramas(app, places) {
    const ctxs = places.map(p => new DioramaCtx(app, p));
    // 1. Relieve (colinas) antes del terreno
    ctxs.forEach(ctx => {
        const d = DIORAMAS[ctx.place.diorama] || DIORAMAS.generic;
        if (d.terrain) d.terrain(ctx);
    });
    app.engine.onUpdate((dt, t) => updateActors(dt, app.engine.camera.position, t));
    return async () => {
        // 2. Construcción (después del terreno, para apoyar cosas en el suelo)
        for (const ctx of ctxs) {
            const d = DIORAMAS[ctx.place.diorama] || DIORAMAS.generic;
            try {
                await d.build(ctx);
            } catch (e) {
                console.error('Error construyendo la maqueta', ctx.place.id, e);
            }
            if (ctx.place.stage !== 'finale') placeSign(ctx);
            const merged = mergeStatic(ctx.group);
            app.engine.scene.add(merged, ctx.dynamic);
            const c = ctx.pos(0, 8);
            app.world.cull(merged, c, ctx.len / 2 + 30);
            app.world.cull(ctx.dynamic, c, ctx.len / 2 + 30);
        }
    };
}
