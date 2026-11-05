// ============================================================================
//  VIAJE LARGO (approach: 'roadtrip' en data/places.js)
// ============================================================================
// Decorado de los tramos de viaje largo (de la ciudad a Valencia): rotondas, autopista con
// calzada contraria y tráfico, salidas, gasolinera, área de servicio, peaje... y escenas
// románticas a los lados. El plan de tramos está en roadtripPlan() de game/track.js; cada
// tramo lleva una lista de escenas ("scene") que se construyen aquí (SCENES).
//
// Dos fases, como las maquetas:
//   planRoadtrips(track)   ANTES del terreno: zonas llanas (vías de servicio, campos...)
//   buildRoadtrips(app)    después: los objetos 3D
// ============================================================================
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { model, toon, textPlane, textTexture, heartGeometry } from './assets.js';
import { DioramaCtx, mergeStatic } from './dioramas.js';
import { roadTexture, roadTexture3, mergeAll } from './track.js';

const ROAD_W = CONFIG.road.width;
const LX = -(CONFIG.road.width * 0.75 - 1.4);   // desplazamiento extra a la izquierda (carril contrario)
const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
const mats = new Map();
const M = (c, o) => { const k = c + JSON.stringify(o || {}); if (!mats.has(k)) mats.set(k, toon(c, o)); return mats.get(k); };
const box = (w, h, d, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c)); m.position.y = h / 2; return m; };
const cyl = (rt, rb, h, c, seg = 12) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), M(c)); m.position.y = h / 2; return m; };
const glow = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
// Tejado a cuatro aguas de 1 × 1 × 1 alineado con los ejes (se escala al ancho, alto y fondo de la casa)
let hipGeo = null;
const hipRoof = () => hipGeo || (hipGeo = new THREE.CylinderGeometry(0, Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4));
const flatGeo = (w, d) => { const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); return g; };

// Textos de las vallas publicitarias (se usan en orden: billboard:0, billboard:1...)
export const BILLBOARDS = [
    ['¿Ya hemos llegado? 🙄', 'Quedan 300 km… y toda una vida juntos'],
    ['Cuidado:', 'conductor enamorado ⚠️💕'],
    ['Cari, ¿paramos a comer? 🍔', '(la respuesta siempre es sí)'],
    ['Área de servicio del Amor', 'Besos gratis · 2 km 💋'],
    ['València 50 km', '¡Paella a la vista! 🥘'],
    ['Málaga 300 km', '¡Que vayan preparando los espetos! 🐟'],
    ['Atención:', 'copiloto con hambre 🍤'],
    ['Málaga 20 km', '¡Huele a mar y a boquerones! 🌊'],
    ['AP-7 · La Jonquera 60 km', 'Bocatas, fuet y besos 🥪💋'],
    ['¿Tienes hambre, Cari? 🍔', 'Área de servicio en 10 km']
];

// Posición de cada escena dentro de su tramo (fracción 0..1)
const FRAC = { leavingAp7: 0.3, exit3: 0.25, exit4: 0.62, leavingSur: 0.3, olives: 0.45, toro: 0.3, pueblo: 0.35, welcomeSur: 0.8, leaving: 0.3, vineyard: 0.5, exit: 0.2, exit2: 0.72, billboard: 0.9, sunflowers: 0.55, gas: 0.5, balloon: 0.3, picnic: 0.62, area: 0.32, plane: 0.5, 'just-married': 0.5, oranges: 0.45, welcome: 0.85 };

function scenesOf(region) {
    const out = [];
    for (const pc of region.pieces) for (const name of pc.scene || []) {
        const base = name.split(':')[0];
        const f = base === 'billboard' && pc.scene.length === 2 && pc.scene[0].startsWith('billboard') ? 0.4 : FRAC[base] ?? 0.5;
        out.push({ name, base, arg: name.split(':')[1], s: pc.s0 + (pc.s1 - pc.s0) * f, piece: pc, region });
    }
    return out;
}

// Vía de servicio: sale de la carretera, corre en paralelo a "side" y vuelve
function serviceLane(s, side = 12, half = 12, ramp = 22) {
    return {
        s0: s - half - ramp, s1: s + half + ramp,
        side: (ss) => {
            if (ss < s - half) return 2.9 + (side - 2.9) * smooth(s - half - ramp, s - half, ss);
            if (ss > s + half) return 2.9 + (side - 2.9) * (1 - smooth(s + half, s + half + ramp, ss));
            return side;
        }
    };
}
// Salida: se separa hacia la derecha y se aleja
function exitLane(s, len = 46, side = 24) {
    return { s0: s, s1: s + len, side: (ss) => 2.9 + (side - 2.9) * Math.pow((ss - s) / len, 1.7) };
}

// --- Fase 1: terreno ----------------------------------------------------------------
// Dónde mirar al pasar por cada escena: [lado, altura]
const POI = { leavingAp7: [0, 4], leavingSur: [0, 4], olives: [14, 1.5], toro: [-34, 8], pueblo: [40, 6], welcomeSur: [6, 3], leaving: [0, 4], vineyard: [16, 1], exit: [18, 2], exit2: [18, 2], billboard: [-15.5, 3.5], sunflowers: [-26, 1], gas: [15, 2], balloon: [-30, 11], picnic: [12, 1], area: [17, 1.5], oranges: [12, 1.5], welcome: [6, 3] };

export function planRoadtrips(track) {
    for (const r of track.regions) {
        if (r.type !== 'roadtrip') continue;
        r.scenes = scenesOf(r);
        r.pois = r.scenes.filter(sc => POI[sc.base]).map(sc => ({ s: sc.s, side: sc.base === 'billboard' && sc.piece.wide ? -22 : POI[sc.base][0], h: POI[sc.base][1], name: sc.name }));
        for (const pc of r.pieces) if (pc.type === 'toll' || pc.type === 'roundabout') r.pois.push({ s: (pc.s0 + pc.s1) / 2, side: 0, h: 2, name: pc.type });
        r.pois.sort((A, B) => A.s - B.s);
        const flatLane = (lane, rad = 5) => {
            for (let ss = lane.s0; ss <= lane.s1; ss += 3) { const p = track.point(ss, lane.side(ss)); track.addFlat(p.x, p.z, rad); }
        };
        for (const sc of r.scenes) {
            if (sc.base === 'gas' || sc.base === 'area') {
                sc.lane = serviceLane(sc.s);
                flatLane(sc.lane, 6);
                const c = track.point(sc.s, 19); track.addFlat(c.x, c.z, 15);
            } else if (sc.base === 'exit' || sc.base === 'exit2' || sc.base === 'exit3' || sc.base === 'exit4') {
                sc.lane = exitLane(sc.s);
                flatLane(sc.lane, 6);
                const c = track.point(sc.s + 52, 30); track.addFlat(c.x, c.z, 13);
            } else if (sc.base === 'sunflowers') {
                const c = track.point(sc.s, -29); track.addFlat(c.x, c.z, 26);
            } else if (sc.base === 'picnic') {
                const c = track.point(sc.s, 12); track.addFlat(c.x, c.z, 7);
            } else if (sc.base === 'toro') {
                const c = track.point(sc.s, -36); track.addBump(c.x, c.z, 16, 7);
            } else if (sc.base === 'pueblo') {
                const c = track.point(sc.s, 44); track.addBump(c.x, c.z, 22, 9);
            }
        }
        // Brazos de las rotondas
        for (const pc of r.pieces) if (pc.type === 'roundabout') {
            pc.stubs = roundaboutStubs(track, pc);
            for (const a of pc.stubs) for (let d = pc.geo.R + 2; d < pc.geo.R + 28; d += 3) track.addFlat(pc.geo.world.x + Math.sin(a) * d, pc.geo.world.z + Math.cos(a) * d, 5);
        }
    }
}

function roundaboutStubs(track, pc) {
    const G = pc.geo, c = G.world;
    const sIn = pc.s0 + 13, sOut = pc.s1 - 13;
    const E = track.point(sIn, 0), X = track.point(sOut, 0);
    const aIn = Math.atan2(E.x - c.x, E.z - c.z), aOut = Math.atan2(X.x - c.x, X.z - c.z);
    const diff = (u, v) => Math.abs(Math.atan2(Math.sin(u - v), Math.cos(u - v)));
    return [aIn + Math.PI / 2, aIn + Math.PI, aIn - Math.PI / 2].filter(a => diff(a, aOut) > 0.7 && diff(a, aIn) > 0.7);
}

// --- Geometría de apoyo ----------------------------------------------------------------
// Cinta de asfalto a partir de una lista de puntos (centro de la calzada)
function ribbon(points, width, material, uv = true) {
    const pos = [], uvs = [], idx = [];
    let dist = 0;
    for (let i = 0; i < points.length; i++) {
        const p = points[i], q = points[Math.min(i + 1, points.length - 1)], o = points[Math.max(i - 1, 0)];
        const dx = q.x - o.x, dz = q.z - o.z, l = Math.hypot(dx, dz) || 1;
        const nx = -dz / l, nz = dx / l;
        if (i > 0) dist += p.distanceTo(points[i - 1]);
        for (const k of [-1, 1]) {
            pos.push(p.x + nx * width / 2 * k, p.y, p.z + nz * width / 2 * k);
            uvs.push(k < 0 ? 0 : 1, dist / (width * 2));
        }
        if (i > 0) { const b = i * 2; idx.push(b - 2, b, b - 1, b - 1, b, b + 1); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    if (geo.attributes.normal.getY(0) < 0) {
        const ix = geo.index.array;
        for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
        geo.index.needsUpdate = true;
        geo.computeVertexNormals();
    }
    const m = new THREE.Mesh(geo, material);
    m.receiveShadow = true;
    return m;
}

let asphaltMat = null, curbMat = null;
function roadMats() {
    if (!asphaltMat) {
        asphaltMat = new THREE.MeshToonMaterial({ map: roadTexture(), polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
        curbMat = toon('#efe3c4', { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    }
    return { asphalt: asphaltMat, curb: curbMat };
}

// Calzada que sigue la carretera a una distancia lateral variable
function laneMesh(track, lane, width = 2.6) {
    const pts = [];
    for (let ss = lane.s0; ss <= lane.s1; ss += 0.8) {
        const p = track.point(ss, lane.side(ss));
        p.y = track.roadY(ss);
        pts.push(p);
    }
    const g = new THREE.Group();
    const { asphalt, curb } = roadMats();
    const c = ribbon(pts.map(p => p.clone().setY(p.y + 0.07)), width + 1, curb, false);
    const a = ribbon(pts.map(p => p.clone().setY(p.y + 0.12)), width, asphalt);
    g.add(c, a);
    return g;
}

function guardrail(track, s0, s1, side, color = '#c7ccd8') {
    const pts = [], idx = [];
    const posts = [];
    let n = 0;
    const postGeo = new THREE.BoxGeometry(0.1, 0.6, 0.1);
    for (let ss = s0; ss <= s1; ss += 1) {
        const f = track.frame(ss), y = track.roadY(ss);
        const x = f.x + f.nx * side, z = f.z + f.nz * side;
        pts.push(x, y + 0.42, z, x, y + 0.66, z);
        const b = pts.length / 3 - 2;
        if (n > 0) idx.push(b - 2, b, b - 1, b - 1, b, b + 1);
        n++;
        if (Math.round(ss) % 3 === 0) posts.push(postGeo.clone().translate(x, y + 0.3, z));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, M(color, { side: THREE.DoubleSide })));
    if (posts.length) g.add(new THREE.Mesh(mergeAll(posts), M('#9aa3b5')));
    return g;
}

// Pórtico con cartel azul sobre las dos calzadas
export function gantry(lines, { width = 6.5, bg = '#1d5bbf', fg = '#ffffff', wide = false } = {}) {
    const g = new THREE.Group();
    const board = textPlane('', width, { width: 1000, height: 280, bg, fg, lines, borderColor: '#ffffff', border: 12, radius: 12 });
    // (x local positiva = derecha de la carretera; en la autopista ancha, sólo sobre nuestra calzada)
    board.position.set(wide ? -2.6 : -1.3, 5.6, 0);
    g.add(board);
    const posts = wide ? [-7.6, 2.8] : [-9.8 + LX, 3.4];
    for (const dx of posts) { const p = cyl(0.15, 0.15, 6.4, '#9aa3b5', 8); p.position.x = dx; g.add(p); }
    const beam = box(Math.abs(posts[0] - posts[1]) + 0.4, 0.25, 0.25, '#9aa3b5'); beam.position.set((posts[0] + posts[1]) / 2, 6.3, 0); g.add(beam);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
}

function billboard(lines) {
    const g = new THREE.Group();
    const board = textPlane('', 8, { width: 1100, height: 440, bg: '#fffaf0', fg: '#1b1b2f', lines, borderColor: '#ff4d8d', border: 22, radius: 26, font: 'Fredoka', weight: 700 });
    board.position.y = 3.7;
    g.add(board);
    const back = new THREE.Mesh(new THREE.BoxGeometry(8.3, 3.5, 0.25), M('#3b3f4f')); back.position.set(0, 3.7, -0.15); g.add(back);
    for (const dx of [-2.8, 2.8]) { const p = cyl(0.14, 0.16, 2.1, '#3b3f4f', 8); p.position.x = dx; g.add(p); }
    const walk = box(8, 0.12, 0.6, '#9aa3b5'); walk.position.set(0, 1.95, 0.35); g.add(walk);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
}

// --- Escenas -----------------------------------------------------------------------------
const SCENES = {
    async leaving(ctx, sc) {
        const g = gantry(['↑ AP-7 · València', 'Barcelona · Tarragona · 450 km']);
        await ctx.put(g, sc.s, 0, { rot: Math.PI / 2, face: true });
        ctx.label(`Adéu, ${sc.region.from.id === 'masia' ? 'Empordà' : sc.region.from.name}! 👋`, sc.s + 14, 4.2, { width: 3, height: 2.4 });
    },

    async vineyard(ctx, sc) {
        const t = ctx.track, pc = sc.piece;
        for (const sgn of [1, -1]) for (let row = 0; row < 10; row++) {
            const side = sgn * (6.5 + row * 2.4);
            for (let ss = pc.s0 + 4; ss < pc.s1 - 4; ss += 1.3) {
                const p = t.point(ss, side);
                ctx.world.plantTree('vine', p.x, p.z, 0.9 + ((row * 7 + ss) % 3) * 0.08, t.headingAt(ss), p.y - 0.03);
            }
        }
        for (let ss = pc.s0 + 4; ss < pc.s1 - 4; ss += 8) for (const sd of [-15, 15, -28, 28]) ctx.reserve(ss, sd, 8);
        const masia = await model('suburb/building-type-d');
        masia.traverse(o => { if (o.isMesh) o.material = M('#f1e3c8'); });
        await ctx.put(masia, sc.s + 6, 34, { height: 5 });
        ctx.label('Vins del Penedès 🍇', sc.s - 6, 4, { width: 3.2, height: 2.4, opts: { bg: '#7a2340', fg: '#fff' } });
        await ctx.couple(sc.s - 2, 6.2, { anim: 'walk', heart: true, gap: 0.6, rot: Math.PI / 2 });
    },

    async exit(ctx, sc) {
        await exitScene(ctx, sc, ['Sortida 34 ↗', 'Tarragona · Reus']);
    },
    async exit2(ctx, sc) {
        await exitScene(ctx, sc, ['Salida 45 ↗', 'Castelló de la Plana']);
    },

    async billboard(ctx, sc) {
        const lines = BILLBOARDS[(+sc.arg || 0) % BILLBOARDS.length];
        const side = sc.piece.wide ? -22 : -15.5;     // en la autopista ancha, más allá de la calzada contraria
        await ctx.put(billboard(lines), sc.s, side, { rot: -0.35 });
        ctx.reserve(sc.s, side, 6);
    },

    async sunflowers(ctx, sc) {
        const t = ctx.track;
        // Campo de girasoles con un corazón de tulipanes en el medio (visto desde la carretera)
        for (let a = -30; a <= 30; a += 1.35) for (let sd = -16; sd >= -42; sd -= 1.35) {
            const X = a / 17, Y = (-29 - sd) / 11 * -1 + 0.15;   // Y > 0 lejos de la carretera
            const inHeart = Math.pow(X * X + Y * Y - 1, 3) - X * X * Math.pow(Y, 3) < 0;
            const j = Math.sin(a * 12.9 + sd * 78.2) * 0.35;
            const p = t.point(sc.s + a + j, sd + j);
            ctx.world.plantTree(inHeart ? 'tulip' : 'sunflower', p.x, p.z, inHeart ? 1.6 : 1.05, t.headingAt(sc.s) + Math.PI / 2 + j, p.y - 0.03);
        }
        ctx.reserve(sc.s, -29, 27);
        await ctx.couple(sc.s - 3, -14.6, { anim: 'idle', rot: Math.PI, gap: 0.55 });
    },

    async gas(ctx, sc) {
        const t = ctx.track, s = sc.s;
        ctx.group.add(laneMesh(t, sc.lane));
        // Marquesina, surtidores y tienda
        const canopy = new THREE.Group();
        const roof = box(10, 0.45, 6.5, '#f4f6fb'); roof.position.y = 3.8; canopy.add(roof);
        const band = box(10.1, 0.25, 6.6, '#e8173b'); band.position.y = 3.65; canopy.add(band);
        for (const dx of [-4.5, 4.5]) for (const dz of [-2.6, 2.6]) { const p = cyl(0.15, 0.15, 3.6, '#c7ccd8', 8); p.position.set(dx, 1.8, dz); canopy.add(p); }
        await ctx.put(canopy, s, 12, { rot: Math.PI / 2 });
        for (const da of [-2.6, 2.6]) for (const sd of [10.2, 13.8]) {
            const pump = new THREE.Group();
            pump.add(box(0.6, 1.5, 0.4, '#ffffff'));
            const top = box(0.62, 0.3, 0.42, '#e8173b'); top.position.y = 1.4; pump.add(top);
            const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.25), glow('#7ad7ff')); scr.position.set(0, 1.05, 0.21); pump.add(scr);
            await ctx.put(pump, s + da, sd, { rot: Math.PI / 2 });
        }
        const shop = new THREE.Group();
        shop.add(box(8, 3.2, 4.2, '#f2efe6'));
        const glass = box(6, 1.5, 0.05, '#7fb7d9'); glass.position.set(0, 1.1, 2.12); shop.add(glass);
        const sign = textPlane('BOTIGA 24h ♥', 4.2, { width: 800, height: 160, bg: '#e8173b', fg: '#fff', border: 8 });
        sign.position.set(0, 2.75, 2.15); shop.add(sign);
        await ctx.put(shop, s + 1, 21.5);
        // Tótem de precios
        const totem = new THREE.Group();
        totem.add(box(1.4, 5.5, 0.5, '#f4f6fb'));
        const prices = textPlane('', 1.3, { width: 300, height: 600, bg: '#1b1b2f', fg: '#fff2b0', lines: ['GASOLINERA', '♥ Amor', '∞', '💋 Besos', '0,00 €', '🤗 Abrazos', 'gratis'], border: 0, radius: 6 });
        prices.geometry = new THREE.PlaneGeometry(1.3, 2.6); prices.position.set(0, 3.9, 0.26); totem.add(prices);
        await ctx.put(totem, s - 16, 5.2);
        // Vosotros: él llenando el depósito, ella con un helado
        const car = await model('car/hatchback-sports');
        const h = new THREE.Box3().setFromObject(car).getSize(new THREE.Vector3());
        car.scale.multiplyScalar(2.3 / Math.max(h.x, h.z));
        await ctx.put(car, s + 2.6, 12, { rot: Math.PI / 2, face: true });
        await ctx.character(CONFIG.couple.him, s + 1, 10.9, { anim: 'holding-right', rot: Math.PI / 2 });
        await ctx.put('furniture/bench', s + 3, 18.8, { height: 0.6 });
        const her = await ctx.character(CONFIG.couple.her, s + 3, 18.8, { anim: 'sit', y: 0.33 });
        void her;
        await ctx.put('food/ice-cream-cne', s + 3.2, 18.45, { height: 0.32, y: 0.62, dynamic: true });
        ctx.reserve(s, 15, 16);
    },

    async area(ctx, sc) {
        const t = ctx.track, s = sc.s;
        ctx.group.add(laneMesh(t, sc.lane));
        const cafe = new THREE.Group();
        cafe.add(box(9, 3, 4.5, '#efe6d8'));
        const roof = box(9.6, 0.4, 5.2, '#b5523b'); roof.position.y = 3.1; cafe.add(roof);
        const sign = textPlane('', 5.4, { width: 900, height: 220, bg: '#2f6b3a', fg: '#fff', lines: ["Àrea de servei", "L'Ametlla de Mar · Cafè"], border: 10, borderColor: '#fff' });
        sign.position.set(0, 4.1, 2.3); cafe.add(sign);
        await ctx.put(cafe, s + 2, 22);
        for (const [da, sd] of [[-5, 17], [-1, 17.5], [5, 17]]) {
            await ctx.put('furniture/table', s + da, sd, { height: 0.62 });
            await ctx.put('furniture/bench', s + da, sd + 0.9, { height: 0.5, rot: Math.PI });
            await ctx.put('furniture/bench', s + da, sd - 0.9, { height: 0.5 });
            await ctx.put('food/cup-coffee', s + da, sd, { height: 0.14, y: 0.62 });
        }
        const vend = new THREE.Group();
        vend.add(box(1, 1.9, 0.8, '#e8173b'));
        const front = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.2), glow('#fff6d0')); front.position.set(0, 1.1, 0.41); vend.add(front);
        await ctx.put(vend, s + 7.5, 19.6);
        // Bailando bajo la farola, con notas musicales
        await ctx.put('roads/light-curved', s - 9, 15.2, { height: 4, rot: Math.PI / 2 });
        const her = await ctx.character(CONFIG.couple.her, s - 8, 15, { anim: 'idle', face: false });
        const him = await ctx.character(CONFIG.couple.him, s - 8, 15, { anim: 'idle', face: false });
        const C = ctx.pos(s - 8, 15);
        const notes = [];
        for (let i = 0; i < 4; i++) {
            const n = textPlane(i % 2 ? '♪' : '♫', 0.5, { width: 128, height: 128, bg: null, fg: '#ff4d8d', size: 110 });
            ctx.dynamic.add(n); notes.push(n);
        }
        ctx.anim((dt, tm) => {
            if (!ctx.dynamic.visible) return;
            const a = tm * 0.6;
            her.position.set(C.x + Math.sin(a) * 0.32, C.y + 0.04, C.z + Math.cos(a) * 0.32);
            him.position.set(C.x - Math.sin(a) * 0.32, C.y + 0.04, C.z - Math.cos(a) * 0.32);
            her.rotation.y = a + Math.PI; him.rotation.y = a;
            notes.forEach((n, i) => {
                const k = (tm * 0.35 + i / 4) % 1;
                n.position.set(C.x + Math.sin(i * 2 + k * 3) * 0.7, C.y + 1.6 + k * 2.2, C.z + Math.cos(i * 2) * 0.5);
                n.material.opacity = 1 - k; n.material.transparent = true;
                n.lookAt(ctx.app.engine.camera.position);
            });
        });
        ctx.world.plantTree('umbrella', C.x + 4, C.z + 4, 1.4, 0.5);
        ctx.reserve(s, 16, 16);
    },

    async balloon(ctx, sc) {
        // Globo aerostático con forma de corazón
        const g = new THREE.Group();
        const heart = new THREE.Mesh(heartGeometry(), M('#ff2e63', { emissive: new THREE.Color('#ff2e63'), emissiveIntensity: 0.2 }));
        heart.scale.set(3.4, 3.4, 4.2);
        heart.position.y = 4.8;
        const basket = box(1.4, 1, 1.4, '#a0703c'); basket.position.y = 0.5;
        g.add(heart, basket);
        for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
            const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.4, 4), M('#6b4a2b'));
            rope.position.set(x * 0.8, 2.1, z * 0.8); g.add(rope);
        }
        const tiny = await model(CONFIG.couple.her); tiny.scale.multiplyScalar(0.9); tiny.position.set(-0.25, 0.7, 0); g.add(tiny);
        const tiny2 = await model(CONFIG.couple.him); tiny2.scale.multiplyScalar(0.9); tiny2.position.set(0.25, 0.7, 0); g.add(tiny2);
        await ctx.put(g, sc.s, -30, { y: 9, dynamic: true });
        const y0 = g.position.y;
        ctx.anim((dt, tm) => { if (ctx.dynamic.visible) { g.position.y = y0 + Math.sin(tm * 0.5) * 1.2; g.rotation.y += dt * 0.08; } });
    },

    async picnic(ctx, sc) {
        const c = document.createElement('canvas'); c.width = c.height = 64;
        const x = c.getContext('2d');
        for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { x.fillStyle = (i + j) % 2 ? '#ffffff' : '#e8173b'; x.fillRect(i * 8, j * 8, 8, 8); }
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
        const blanket = new THREE.Mesh(flatGeo(2.6, 2.6), new THREE.MeshToonMaterial({ map: tex }));
        await ctx.put(blanket, sc.s, 12, { y: 0.06 });
        const basket = new THREE.Group();
        basket.add(box(0.6, 0.4, 0.4, '#a0703c'));
        const handle = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 6, 12, Math.PI), M('#7a5230')); handle.position.y = 0.4; basket.add(handle);
        await ctx.put(basket, sc.s + 0.8, 12.7, { y: 0.06 });
        await ctx.put('food/wine-red', sc.s - 0.2, 12.4, { height: 0.4, y: 0.06 });
        await ctx.put('food/glass-wine', sc.s + 0.1, 11.6, { height: 0.22, y: 0.06 });
        await ctx.put('food/glass-wine', sc.s - 0.4, 11.7, { height: 0.22, y: 0.06 });
        await ctx.couple(sc.s, 12, { anim: 'sit', y: 0.2, lookAtEachOther: true, gap: 1.2 });
        const p = ctx.pos(sc.s + 2.5, 14);
        ctx.world.plantTree('umbrella', p.x, p.z, 1.6, 1.2);
        // Globo de corazón atado
        const hb = new THREE.Group();
        const h = new THREE.Mesh(heartGeometry(), M('#ff4d8d', { emissive: new THREE.Color('#ff4d8d'), emissiveIntensity: 0.3 }));
        h.scale.setScalar(0.35); h.position.y = 2.2; hb.add(h);
        const str = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.9, 4), M('#ffffff')); str.position.y = 1; hb.add(str);
        await ctx.put(hb, sc.s + 1.3, 11, { dynamic: true });
        ctx.anim((dt, tm) => { hb.rotation.z = Math.sin(tm * 1.3) * 0.08; h.rotation.y = Math.sin(tm) * 0.4; });
        ctx.reserve(sc.s, 12, 6);
    },

    async plane(ctx, sc) {
        // Avioneta con pancarta, dando vueltas sobre la autopista
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 2.6, 6, 10), M('#f4f6fb'));
        body.rotation.x = Math.PI / 2; g.add(body);
        const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.4, 10), M('#e8173b')); stripe.rotation.x = Math.PI / 2; g.add(stripe);
        const wing = box(5.2, 0.12, 0.9, '#f4f6fb'); wing.position.set(0, 0.2, 0.2); g.add(wing);
        const tail = box(1.6, 0.1, 0.5, '#f4f6fb'); tail.position.set(0, 0.25, -1.6); g.add(tail);
        const fin = box(0.1, 0.8, 0.6, '#e8173b'); fin.position.set(0, 0.6, -1.6); g.add(fin);
        const prop = box(1.4, 0.12, 0.05, '#3b3f4f'); prop.position.set(0, 0, 1.85); g.add(prop);
        const banner = textPlane("T'ESTIMO, CARI 💕", 13, { width: 1400, height: 220, bg: '#fffaf0', fg: '#e8173b', border: 10, borderColor: '#e8173b', font: 'Bangers', weight: 400 });
        banner.material.side = THREE.DoubleSide;
        const bannerG = new THREE.Group(); bannerG.add(banner);
        banner.rotation.y = Math.PI / 2; banner.position.z = -9.5;
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3, 4), M('#ffffff')); rope.rotation.x = Math.PI / 2; rope.position.z = -2.8;
        g.add(bannerG, rope);
        ctx.dynamic.add(g);
        const C = ctx.pos(sc.s, -10);
        const f = ctx.track.frame(sc.s);
        ctx.anim((dt, tm) => {
            if (!ctx.dynamic.visible) return;
            const a = tm * 0.07;
            const u = Math.cos(a) * 110, v = Math.sin(a) * 45;
            g.position.set(C.x + f.tx * u + f.nx * v, C.y + 30 + Math.sin(tm * 0.4) * 2, C.z + f.tz * u + f.nz * v);
            const du = -Math.sin(a) * 110, dv = Math.cos(a) * 45;
            g.rotation.set(0, Math.atan2(f.tx * du + f.nx * dv, f.tz * du + f.nz * dv), -0.25);
            prop.rotation.z = tm * 30;
            banner.position.y = Math.sin(tm * 3) * 0.15;
        });
    },

    async 'just-married'(ctx, sc) { void ctx; void sc; /* va en el tráfico de la calzada contraria */ },

    // --- AP-7 hacia La Jonquera ---
    async leavingAp7(ctx, sc) {
        const g = gantry(['↑ AP-7 · Girona · França', 'La Jonquera · 120 km']);
        await ctx.put(g, sc.s, 0, { rot: Math.PI / 2, face: true });
        ctx.label('Rumbo al Empordà 🌊', sc.s + 14, 4.2, { width: 3, height: 2.4 });
    },
    async exit3(ctx, sc) {
        await exitScene(ctx, sc, ['Sortida 6 ↗', 'Girona · Aeroport']);
    },
    async exit4(ctx, sc) {
        await exitScene(ctx, sc, ['Sortida 4 ↗', 'Figueres · Roses']);
    },

    // --- Ruta del sur (Villena → Málaga) ---
    async leavingSur(ctx, sc) {
        const g = gantry(['↑ A-7 · Málaga', 'Murcia · Granada · 450 km']);
        await ctx.put(g, sc.s, 0, { rot: Math.PI / 2, face: true });
        ctx.label('¡Adiós, Villena! 🏰', sc.s + 14, 4.2, { width: 3, height: 2.4 });
    },

    // Olivares en hileras a los dos lados, con un cortijo blanco
    async olives(ctx, sc) {
        const t = ctx.track, pc = sc.piece;
        for (const sgn of [1, -1]) for (let row = 0; row < 6; row++) {
            const side = sgn * (8 + row * 4.2);
            if (sgn < 0 && -side < t.corridorLeft(sc.s) + 3) continue;
            for (let ss = pc.s0 + 4; ss < pc.s1 - 4; ss += 4.4) {
                const p = t.point(ss, side + ((ss * 7) % 3 - 1) * 0.3);
                ctx.world.plantTree('olive', p.x, p.z, 0.95 + ((row * 5 + ss) % 4) * 0.07, ss, p.y - 0.03);
            }
        }
        for (let ss = pc.s0 + 4; ss < pc.s1 - 4; ss += 8) for (const sd of [-20, 18, 30]) ctx.reserve(ss, sd, 9);
        const cortijo = new THREE.Group();
        const b1 = box(7, 2.6, 4.5, '#fbfaf6'); cortijo.add(b1);
        const r1 = new THREE.Mesh(hipRoof(), M('#b5523b')); r1.scale.set(7 * 1.08, 1.3, 4.5 * 1.08); r1.position.y = 2.6 + 0.65; cortijo.add(r1);
        const tower = box(2, 4.2, 2, '#fbfaf6'); tower.position.set(-2.6, 2.1, 0); cortijo.add(tower);
        const tr = new THREE.Mesh(hipRoof(), M('#b5523b')); tr.scale.set(2.2, 0.9, 2.2); tr.position.set(-2.6, 4.2 + 0.45, 0); cortijo.add(tr);
        for (const x of [-0.8, 1.2, 2.6]) { const w = box(0.6, 0.8, 0.05, '#2f6fc0'); w.position.set(x, 1.0, 2.27); cortijo.add(w); }
        const door = box(1.0, 1.7, 0.05, '#7a4a2a'); door.position.set(0.2, 0.85, 2.27); cortijo.add(door);
        await ctx.put(cortijo, sc.s + 10, 30);
        ctx.label('Aceite de oliva · Jaén 🫒', sc.s - 8, 4.2, { width: 3.4, height: 2.4, opts: { bg: '#4f6b2a', fg: '#fff' } });
    },

    // El toro de Osborne en lo alto de una loma
    async toro(ctx, sc) {
        const bull = new THREE.Group();
        const sh = new THREE.Shape();
        const P = [[-4.2, 0], [-3.9, 1.8], [-4.4, 3.0], [-3.8, 3.7], [-3.2, 3.3], [-2.2, 4.0], [1.6, 4.1], [2.6, 4.9], [3.3, 5.6], [3.2, 5.0], [3.9, 5.4], [3.7, 4.6], [4.4, 4.2], [4.6, 3.6], [3.8, 3.2], [3.0, 2.2], [2.8, 0], [2.2, 0], [2.1, 1.6], [0.6, 1.8], [0.5, 0], [-0.1, 0], [-0.3, 1.6], [-2.4, 1.7], [-2.7, 0], [-3.3, 0], [-3.4, 1.5], [-3.7, 0]];
        sh.moveTo(P[0][0], P[0][1]); for (const [x, y] of P.slice(1)) sh.lineTo(x, y); sh.closePath();
        const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.15, bevelEnabled: false });
        geo.translate(0, 0, -0.075);
        const body = new THREE.Mesh(geo, M('#111114')); body.position.y = 2.2; bull.add(body);
        for (const x of [-2.5, 0, 2.5]) { const leg = box(0.12, 2.4, 0.12, '#5b6377'); leg.position.set(x, 1.2, -0.3); bull.add(leg); }
        await ctx.put(bull, sc.s, -36, { scale: 1.6, rot: 0.15 });
    },

    // Pueblo blanco andaluz en la ladera, con su iglesia
    async pueblo(ctx, sc) {
        const t = ctx.track;
        const c = t.point(sc.s, 44);
        const g = new THREE.Group();
        const R = (i) => Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
        for (let i = 0; i < 26; i++) {
            const a = (i / 26) * Math.PI * 2 + R(i) * 0.4, r = 4 + R(i + 9) * 13;
            const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.7;
            const w = 2 + R(i + 3) * 1.6, h = 1.6 + R(i + 5) * 1.4, d = 2 + R(i + 7) * 1.4;
            // base de la casa un poco hundida en la ladera; el tejado apoyado justo encima
            const y0 = t.heightAt(c.x + x, c.z + z) - c.y - 0.2;
            const hs = box(w, h, d, '#fbfaf6'); hs.position.set(x, y0 + h / 2, z); hs.rotation.y = R(i + 11) * 0.6; g.add(hs);
            const rf = new THREE.Mesh(hipRoof(), M('#c8643f')); rf.rotation.y = hs.rotation.y; rf.scale.set(w * 1.08, 0.7, d * 1.08); rf.position.set(x, y0 + h + 0.35, z); g.add(rf);
        }
        const cy0 = t.heightAt(c.x, c.z) - c.y - 0.2;
        const ch = box(3, 4, 5, '#fbfaf6'); ch.position.y = cy0 + 2; g.add(ch);
        const chRoof = new THREE.Mesh(hipRoof(), M('#c8643f')); chRoof.scale.set(3.3, 0.9, 5.3); chRoof.position.y = cy0 + 4 + 0.45; g.add(chRoof);
        const bell = box(1.5, 7, 1.5, '#fbfaf6'); bell.position.set(0, cy0 + 3.5, 3); g.add(bell);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.4, 4), M('#c8643f')); cap.rotation.y = Math.PI / 4; cap.position.set(0, cy0 + 7 + 0.7, 3); g.add(cap);
        g.position.copy(c);
        g.rotation.y = t.headingAt(sc.s);
        ctx.group.add(g);
        ctx.label('Pueblos blancos ☀️', sc.s - 6, 4.2, { width: 3, height: 2.4, opts: { bg: '#ffffff', fg: '#c8643f', borderColor: '#c8643f' } });
    },

    async welcomeSur(ctx, sc) {
        const g = new THREE.Group();
        const board = textPlane('', 7, { width: 1100, height: 300, bg: '#ffffff', fg: '#1d8fbf', lines: ['Bienvenidos a', 'MÁLAGA'], borderColor: '#1d8fbf', border: 14, radius: 20, font: 'Bangers', weight: 400 });
        board.position.y = 3.4; g.add(board);
        for (const dx of [-2.6, 2.6]) { const p = cyl(0.12, 0.12, 2.3, '#9aa3b5', 8); p.position.x = dx; g.add(p); }
        await ctx.put(g, sc.s, 6, { rot: -0.4 });
        const pts = [-14, -7, 7, 14];
        for (const a of pts) { const q = ctx.track.point(sc.s + a, 5.5); ctx.world.plantTree('palm', q.x, q.z, 1.05, a, q.y - 0.03); }
    },

    async oranges(ctx, sc) {
        const t = ctx.track, pc = sc.piece;
        for (const sgn of [1, -1]) for (let row = 0; row < 7; row++) {
            const side = sgn * (6 + row * 3.6);
            for (let ss = pc.s0 + 3; ss < pc.s1 - 10; ss += 3.2) {
                const p = t.point(ss, side);
                ctx.world.plantTree('orange', p.x, p.z, 1.15 + ((row + ss) % 3) * 0.08, ss, p.y - 0.03);
            }
        }
        for (let ss = pc.s0 + 4; ss < pc.s1 - 4; ss += 8) for (const sd of [-15, 15, -28, 28]) ctx.reserve(ss, sd, 9);
        ctx.label('Taronges de València 🍊', sc.s, 4.4, { width: 3.4, height: 2.5, opts: { bg: '#ff9214', fg: '#fff' } });
        await ctx.couple(sc.s + 6, 5.3, { anim: 'walk', rot: Math.PI / 2, gap: 0.6 });
    },

    async welcome(ctx, sc) {
        const g = new THREE.Group();
        const board = textPlane('', 7, { width: 1100, height: 300, bg: '#ffffff', fg: '#ff7a00', lines: ['Benvinguts a', 'VALÈNCIA'], borderColor: '#ff7a00', border: 14, radius: 20, font: 'Bangers', weight: 400 });
        board.position.y = 3.4; g.add(board);
        for (const dx of [-2.6, 2.6]) { const p = cyl(0.12, 0.12, 2.3, '#9aa3b5', 8); p.position.x = dx; g.add(p); }
        await ctx.put(g, sc.s, 6, { rot: -0.4 });
    }
};

async function exitScene(ctx, sc, lines) {
    const t = ctx.track;
    ctx.group.add(laneMesh(t, sc.lane));
    // Cartel en pórtico antes de la salida y cartel pequeño en la bifurcación
    await ctx.put(gantry(lines, { wide: !!sc.piece.wide }), sc.s - 26, 0, { rot: Math.PI / 2 });
    const gore = textPlane(lines[0].split(' ')[1] || 'Sortida', 1, { width: 256, height: 160, bg: '#1d5bbf', fg: '#fff', border: 8, borderColor: '#fff' });
    const gg = new THREE.Group(); gore.position.y = 1.4; gg.add(gore, cyl(0.05, 0.05, 1, '#9aa3b5', 6));
    await ctx.put(gg, sc.s + 10, 4.6);
    // Pueblecito al final de la salida
    const keys = ['suburb/building-type-a', 'suburb/building-type-c', 'suburb/building-type-f'];
    for (let i = 0; i < 4; i++) {
        const h = await model(keys[i % 3]);
        h.traverse(o => { if (o.isMesh) o.material = M(i % 2 ? '#fff3e0' : '#ffffff'); });
        await ctx.put(h, sc.s + 46 + i * 4.5, 30 + (i % 2) * 6, { height: 3.4 });
    }
    const bell = new THREE.Group();
    bell.add(box(1.6, 6, 1.6, '#d8c3a0'));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.4, 4), M('#b5523b')); roof.position.y = 6.7; roof.rotation.y = Math.PI / 4; bell.add(roof);
    await ctx.put(bell, sc.s + 54, 40);
    ctx.reserve(sc.s + 52, 33, 12);
    for (let ss = sc.lane.s0; ss <= sc.lane.s1; ss += 4) ctx.reserve(ss, sc.lane.side(ss), 3.5);
}

// --- Autopista: calzada contraria, mediana, carteles de distancia y tráfico ---------
async function buildHighway(app, region) {
    const t = app.track;
    const ranges = [];
    for (const pc of region.pieces) {
        if (pc.type !== 'highway' && pc.type !== 'toll') continue;
        const last = ranges[ranges.length - 1];
        if (last && Math.abs(last[1] - pc.s0) < 1) last[1] = pc.s1; else ranges.push([pc.s0, pc.s1]);
    }
    const { asphalt, curb } = roadMats();
    const wideRanges = [];
    for (const pc of region.pieces) {
        if (!pc.wide) continue;
        const last = wideRanges[wideRanges.length - 1];
        if (last && Math.abs(last[1] - pc.s0) < 1) last[1] = pc.s1; else wideRanges.push([pc.s0, pc.s1]);
    }
    for (const [sA, sB] of wideRanges) buildWideRoad(app, sA, sB);
    for (const [sA, sB] of ranges) {
        if (wideRanges.some(([a, b]) => sA >= a - 1 && sB <= b + 1)) continue;   // ya es autopista ancha
        const g = new THREE.Group();
        const pts = (side, lift) => { const P = []; for (let ss = sA; ss <= sB; ss += 1) { const p = t.point(ss, side); p.y = t.roadY(ss) + lift; P.push(p); } return P; };
        g.add(ribbon(pts(-6.6 + LX, 0.07), 6.6, curb, false));
        g.add(ribbon(pts(-6.6 + LX, 0.12), 5.6, asphalt));
        g.add(guardrail(t, sA, sB, -2.5 + LX));
        g.add(guardrail(t, sA, sB, -2.85 + LX));
        g.add(guardrail(t, sA, sB, -10.2 + LX));
        // Mojones kilométricos
        const posts = [];
        for (let ss = sA + 10; ss < sB; ss += 25) {
            const p = t.point(ss, 3.1); p.y = t.roadY(ss);
            posts.push(new THREE.BoxGeometry(0.22, 0.7, 0.12).translate(p.x, p.y + 0.35, p.z));
        }
        if (posts.length) g.add(new THREE.Mesh(mergeAll(posts), M('#ffffff')));
        app.engine.scene.add(g);
        app.world.cull(g, t.point((sA + sB) / 2, 0), (sB - sA) / 2 + 40);
    }
    // Carteles de distancia al principio de cada tramo de autopista
    const ctx = makeCtx(app, 'highway-signs');
    for (const pc of region.pieces) {
        if (pc.type !== 'highway') continue;
        const km = Math.max(5, Math.round((region.s1 - pc.s0) / 2.4 / 5) * 5);
        const toMars = region.to.props && region.to.props.mars;
        const lines = region.type === 'flight' ? ['✈️ PISTA DE DESPEGUE', `${region.to.name} · 2.000 km`]
            : region.type === 'space' ? ['🚀 PLATAFORMA DE LANZAMIENTO', toMars ? 'Marte · 225 millones de km' : 'Tierra · vuelta a casa 🌍'] : [`↑ ${region.to.name}`, `${km} km`];
        await ctx.put(gantry(lines, region.type === 'flight' ? { bg: '#ff4d8d' } : region.type === 'space' ? { bg: '#3a2a7a' } : { wide: !!pc.wide }), pc.s0 + 6, 0, { rot: Math.PI / 2 });
    }
    finish(app, ctx, t.point((region.s0 + region.s1) / 2, 0), (region.s1 - region.s0) / 2 + 60);
    // Tráfico en sentido contrario (con un coche de recién casados)
    if (!ranges.length) return;
    const [sA, sB] = [ranges[0][0], ranges[ranges.length - 1][1]];
    const tg = new THREE.Group();
    const keys = ['car/taxi', 'car/sedan', 'car/van', 'car/suv', 'car/delivery', 'car/sedan', 'car/hatchback-sports', 'car/van'];
    const movers = [];
    for (let i = 0; i < keys.length + 1; i++) {
        const married = i === keys.length;
        const c = await model(married ? 'car/sedan' : keys[i]);
        const h = new THREE.Box3().setFromObject(c).getSize(new THREE.Vector3());
        c.scale.multiplyScalar(2.4 / Math.max(h.x, h.z));
        if (married) {
            c.traverse(o => { if (o.isMesh) o.material = M('#ffffff'); });
            const sign = textPlane('Recién casados ♥', 1.4, { width: 640, height: 160, bg: '#ffffff', fg: '#e8173b', border: 6, borderColor: '#e8173b' });
            sign.position.set(0, 0.7 / c.scale.y, -1.25 / c.scale.y); sign.rotation.y = Math.PI; sign.scale.setScalar(1 / c.scale.y);
            c.add(sign);
            for (let k = 0; k < 3; k++) {
                const can = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 8), M('#c7ccd8'));
                can.rotation.x = Math.PI / 2; can.position.set((k - 1) * 0.25 / c.scale.x, 0.1 / c.scale.y, (-1.8 - k * 0.3) / c.scale.z);
                can.scale.setScalar(1 / c.scale.y);
                c.add(can);
            }
        }
        tg.add(c);
        const wideHere = wideRanges.length > 0;
        movers.push({ c, u: i / (keys.length + 1), lane: wideHere ? [-10.6, -13.2, -15.8][i % 3] : (i % 2 ? -5.2 : -8) + LX, v: 0.022 + (i % 3) * 0.004 });
    }
    // Autopista ancha: también coches en nuestro sentido, por los carriles de la izquierda (adelantan)
    const same = [];
    if (wideRanges.length) for (let i = 0; i < 6; i++) {
        const c = await model(['car/suv', 'car/taxi', 'car/sedan', 'car/van', 'car/hatchback-sports', 'car/delivery'][i]);
        const h = new THREE.Box3().setFromObject(c).getSize(new THREE.Vector3());
        c.scale.multiplyScalar(2.4 / Math.max(h.x, h.z));
        tg.add(c);
        same.push({ c, u: i / 6, lane: i % 2 ? -2.6 : -5.2, speed: 27 + (i % 3) * 3 });
    }
    app.engine.scene.add(tg);
    app.engine.onUpdate(dt => {
        const car = app.car;
        if (!car || car.s < sA - 150 || car.s > sB + 150) { tg.visible = false; return; }
        tg.visible = true;
        for (const m of movers) {
            m.u = (m.u + dt * m.v) % 1;
            const ss = sB - m.u * (sB - sA);
            const p = t.point(ss, m.lane); p.y = t.roadY(ss) + 0.15;
            m.c.position.copy(p);
            m.c.rotation.y = t.headingAt(ss) + Math.PI;
        }
        for (const m of same) {
            m.u = (m.u + dt * m.speed / (sB - sA)) % 1;
            const ss = sA + m.u * (sB - sA);
            // no atravesar nuestro coche: si coincide en el mismo tramo y carril cercano, se aparta
            const p = t.point(ss, m.lane); p.y = t.roadY(ss) + 0.15;
            m.c.position.copy(p);
            m.c.rotation.y = t.headingAt(ss);
        }
    });
}

// Peaje: marquesina sobre las dos calzadas y barrera que se levanta al llegar el coche
async function buildToll(app, pc) {
    const ctx = makeCtx(app, 'toll');
    const s = (pc.s0 + pc.s1) / 2;
    // Grupo orientado con la marcha: x local positivo = IZQUIERDA. Abarca nuestra calzada y la contraria.
    const g = new THREE.Group();
    const span0 = -2.8, span1 = 13 - LX - 2.35;           // de nuestro arcén derecho al arcén contrario
    const cx = (span0 + span1) / 2, wd = span1 - span0;
    const roof = box(wd, 0.6, 4.5, '#f4f6fb'); roof.position.set(cx, 4.4, 0); g.add(roof);
    const band = box(wd + 0.1, 0.35, 4.6, '#1d5bbf'); band.position.set(cx, 4.2, 0); g.add(band);
    for (const x of [-2.3, 2.35 - LX + 0.15, span1 - 0.6]) {
        const isle = box(1.2, 0.3, 6, '#d9d2c3'); isle.position.x = x; g.add(isle);
        const booth = box(1, 2.1, 1.6, '#ffffff'); booth.position.set(x, 1.05 + 0.3, 0.6); g.add(booth);
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.7), glow('#bfe6ff')); win.position.set(x + 0.51, 1.8, 0.6); win.rotation.y = Math.PI / 2; g.add(win);
        const p = cyl(0.18, 0.18, 4.2, '#c7ccd8', 8); p.position.set(x, 0, -1.6); g.add(p);
    }
    const sign = textPlane('PEATGE · AP-7', 6, { width: 1000, height: 180, bg: '#1d5bbf', fg: '#fff', border: 0, font: 'Bangers', weight: 400 });
    sign.position.set(cx, 4.4, -2.32); sign.rotation.y = Math.PI; g.add(sign);
    const tele = textPlane('✓ TELEPEATGE', 2.4, { width: 600, height: 160, bg: '#2f9e44', fg: '#fff', border: 6, borderColor: '#fff' });
    tele.position.set(0, 3.7, -2.4); tele.rotation.y = Math.PI; g.add(tele);
    await ctx.put(g, s, 0, { face: false, rot: ctx.track.headingAt(s) });
    // Barrera (franjas rojas y blancas) en nuestro carril
    const c = document.createElement('canvas'); c.width = 128; c.height = 16;
    const x = c.getContext('2d');
    for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#ffffff' : '#e8173b'; x.fillRect(i * 16, 0, 16, 16); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const pivot = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 0.12), new THREE.MeshToonMaterial({ map: tex }));
    arm.position.x = 1.7; pivot.add(arm);     // desde la cabina derecha, cruzando nuestro carril
    const holder = new THREE.Group(); holder.add(pivot); pivot.position.set(-2.0, 1.1, -1.2);
    await ctx.put(holder, s, 0, { face: false, rot: ctx.track.headingAt(s), dynamic: true });
    let ang = 0;
    ctx.anim((dt) => {
        const car = app.car;
        const want = car && car.s > s - 16 && car.s < s + 6 ? 1.35 : 0;
        ang += (want - ang) * Math.min(1, dt * 4);
        pivot.rotation.z = ang;
    });
    ctx.label('Bon viatge! 💕', s + 8, 4.2, { width: 2.8, height: 2.2 });
    finish(app, ctx, ctx.pos(s, -4), 30);
}

// Rotonda: anillo completo, isleta con flores y brazos hacia otras salidas
async function buildRoundabout(app, pc) {
    const t = app.track, G = pc.geo, c = G.world;
    const ctx = makeCtx(app, 'roundabout');
    const y = t.roadY((pc.s0 + pc.s1) / 2);
    const g = new THREE.Group();
    const ring = (r0, r1, mat, lift) => { const geo = new THREE.RingGeometry(r0, r1, 64, 1); geo.rotateX(-Math.PI / 2); const m = new THREE.Mesh(geo, mat); m.position.set(c.x, y + lift, c.z); m.receiveShadow = true; return m; };
    const { curb } = roadMats();
    g.add(ring(G.R - 2.1, G.R + 2.1, curb, 0.07));
    g.add(ring(G.R - 1.5, G.R + 1.5, M('#5d6275', { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), 0.12));
    g.add(ring(G.R + 1.32, G.R + 1.45, glow('#ffffff'), 0.13));
    g.add(ring(G.R - 1.45, G.R - 1.32, glow('#ffffff'), 0.13));
    const island = new THREE.Mesh(new THREE.CylinderGeometry(G.R - 1.6, G.R - 1.5, 0.45, 40), M('#7cbf63'));
    island.position.set(c.x, y + 0.22, c.z);
    const curbIsland = new THREE.Mesh(new THREE.CylinderGeometry(G.R - 1.45, G.R - 1.45, 0.3, 40, 1, true), M('#efe3c4', { side: THREE.DoubleSide }));
    curbIsland.position.set(c.x, y + 0.2, c.z);
    g.add(island, curbIsland);
    // Brazos (otras salidas)
    const { asphalt } = roadMats();
    for (const a of pc.stubs || []) {
        const P = [], P2 = [];
        for (let d = G.R + 1.4; d <= G.R + 28; d += 1) {
            const p = new THREE.Vector3(c.x + Math.sin(a) * d, y + 0.12, c.z + Math.cos(a) * d);
            P.push(p); P2.push(p.clone().setY(y + 0.07));
        }
        g.add(ribbon(P2, ROAD_W + 1.1, curb, false), ribbon(P, ROAD_W, asphalt));
        // Ceda el paso
        const sgn = textPlane('', 0.9, { width: 256, height: 256, bg: '#ffffff', fg: '#e8173b', lines: ['▽'], border: 0, size: 230 });
        const sg = new THREE.Group(); sgn.position.y = 1.6; sg.add(sgn, cyl(0.04, 0.04, 1.2, '#9aa3b5', 6));
        const off = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)).multiplyScalar(2.2);
        sg.position.set(c.x + Math.sin(a) * (G.R + 4) + off.x, y, c.z + Math.cos(a) * (G.R + 4) + off.z);
        sg.rotation.y = a;
        g.add(sg);
    }
    app.engine.scene.add(g);
    app.world.cull(g, new THREE.Vector3(c.x, y, c.z), 40);
    // Isleta: flores en forma de corazón y un cartel
    for (let i = 0; i < 60; i++) {
        const u = (i / 60) * Math.PI * 2;
        const hx = 16 * Math.pow(Math.sin(u), 3) / 17, hz = (13 * Math.cos(u) - 5 * Math.cos(2 * u) - 2 * Math.cos(3 * u) - Math.cos(4 * u)) / 17;
        app.world.plantTree('tulip', c.x + hx * (G.R - 2.8), c.z + hz * (G.R - 2.8), 1.5, u, y + 0.44);
    }
    app.world.plantTree(pc.label === 'València' ? 'orange' : 'cypress', c.x, c.z, 1.3, 0, y + 0.44);
    const LINES = {
        'València': ['← València centre', 'Ciutat de les Arts'],
        'AP-7': ['↑ AP-7 València', '← Barcelona · Tarragona →'],
        'A-31': ['↑ A-31 · A-7 Málaga', '← Villena · Alicante →'],
        'Málaga': ['← Málaga centro', 'Playa de la Malagueta']
    };
    const lbl = textPlane('', 3.2, { width: 640, height: 200, bg: '#1d5bbf', fg: '#ffffff', lines: LINES[pc.label] || [`↑ ${pc.label}`, ''], borderColor: '#fff', border: 10, radius: 12 });
    const lg = new THREE.Group(); lbl.position.y = 2.2; lg.add(lbl, cyl(0.07, 0.07, 1.6, '#9aa3b5', 8));
    await ctx.put(lg, pc.s0 - 6, 3.6, {});
    const rsign = textPlane('⟳', 0.9, { width: 256, height: 256, bg: '#1d5bbf', fg: '#ffffff', borderColor: '#ffffff', border: 12, radius: 128, size: 190 });
    const rg = new THREE.Group(); rsign.position.y = 1.7; rg.add(rsign, cyl(0.04, 0.04, 1.3, '#9aa3b5', 6));
    await ctx.put(rg, pc.s0 + 2, 2.7, {});
    app.world.reserve(c.x, c.z, G.R + 3);
    finish(app, ctx, new THREE.Vector3(c.x, y, c.z), 40);
}

function makeCtx(app, id) {
    return new DioramaCtx(app, { id: 'roadtrip-' + id, sCenter: 0, length: 0, props: {}, runtime: {}, stage: 'theory' });
}

function finish(app, ctx, center, radius) {
    const merged = mergeStatic(ctx.group);
    app.engine.scene.add(merged, ctx.dynamic);
    app.world.cull(merged, center, radius);
    app.world.cull(ctx.dynamic, center, radius);
}

// Autopista de 3 carriles por sentido entre sA y sB: nuestra calzada (de -6,5 a +1,3), mediana con
// barrera de hormigón y calzada contraria (de -8,7 a -16,5), con arcén y biondas a los dos lados
let wideMat = null;
export function buildWideRoad(app, sA, sB, { rightRail = true } = {}) {
    const t = app.track;
    const { curb } = roadMats();
    wideMat = wideMat || new THREE.MeshToonMaterial({ map: roadTexture3(), polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    const g = new THREE.Group();
    const pts = (side, lift, step = 1) => { const P = []; for (let ss = sA; ss <= sB; ss += step) { const p = t.point(ss, side); p.y = t.roadY(ss) + lift; P.push(p); } return P; };
    g.add(ribbon(pts(-2.6, 0.065), 9.0, curb, false));
    g.add(ribbon(pts(-2.6, 0.12), 7.8, wideMat));
    g.add(ribbon(pts(-12.6, 0.065), 9.0, curb, false));
    g.add(ribbon(pts(-12.6, 0.12), 7.8, wideMat));
    g.add(ribbon(pts(-7.6, 0.08), 2.4, M('#9aa59a'), false));          // mediana
    // barrera New Jersey en la mediana
    const jersey = new THREE.Mesh(new THREE.BufferGeometry(), M('#d6d3cc'));
    { const P = [], I = []; let n = 0;
      for (let ss = sA; ss <= sB; ss += 1) { const f = t.frame(ss), y = t.roadY(ss);
        for (const [dx, dy] of [[-0.35, 0.1], [-0.12, 0.85], [0.12, 0.85], [0.35, 0.1]]) P.push(f.x + f.nx * (-7.6 + dx), y + dy, f.z + f.nz * (-7.6 + dx));
        if (n > 0) { const b = n * 4, a = b - 4; for (let k = 0; k < 3; k++) I.push(a + k, b + k, a + k + 1, a + k + 1, b + k, b + k + 1); }
        n++; }
      jersey.geometry.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); jersey.geometry.setIndex(I); jersey.geometry.computeVertexNormals();
      jersey.material = M('#d6d3cc', { side: THREE.DoubleSide }); }
    g.add(jersey);
    if (rightRail) g.add(guardrail(t, sA, sB, 2.1));
    g.add(guardrail(t, sA, sB, -17.2));
    const posts = [];
    for (let ss = sA + 10; ss < sB; ss += 25) { const p = t.point(ss, 2.6); p.y = t.roadY(ss); posts.push(new THREE.BoxGeometry(0.22, 0.7, 0.12).translate(p.x, p.y + 0.35, p.z)); }
    if (posts.length) g.add(new THREE.Mesh(mergeAll(posts), M('#ffffff')));
    g.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
    app.engine.scene.add(g);
    app.world.cull(g, t.point((sA + sB) / 2, 0), (sB - sA) / 2 + 40);
    return g;
}

// --- Fase 2: construcción ------------------------------------------------------------------
// Decorado del vuelo: pista, nubes con forma de corazón, barcos y delfines en el mar
async function buildFlight(app, r) {
    const t = app.track;
    await buildHighway(app, r);
    const run = r.pieces[0], cruise = r.pieces.find(p => p.type === 'cruise');
    const ctx = makeCtx(app, 'flight');
    // Pista: marcas blancas de despegue sobre el asfalto y mangas de viento
    for (let ss = run.s0 + 20; ss < run.s1 - 2; ss += 7) {
        const mk = new THREE.Mesh(flatGeo(0.35, 2.4), glow('#ffffff'));
        const p = t.point(ss, 0); mk.position.copy(p).y = t.roadY(ss) + 0.15; mk.rotation.y = t.headingAt(ss);
        ctx.group.add(mk);
    }
    const sock = new THREE.Group();
    sock.add(cyl(0.06, 0.06, 3.2, '#c7ccd8', 6));
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.2, 10, 1, true), M('#ff7a00', { side: THREE.DoubleSide }));
    cone.rotation.z = Math.PI / 2; cone.position.set(0.6, 3, 0); sock.add(cone);
    await ctx.put(sock, run.s0 + 50, 4.5, { dynamic: true });
    ctx.anim((dt, tm) => { cone.rotation.x = Math.sin(tm * 2) * 0.2; });
    ctx.label('¡Abróchate el cinturón, Cari! ✈️', run.s0 + 30, 4.6, { width: 3.8, height: 2.6 });
    // Nubes con forma de corazón a la altura del vuelo
    const cloudMat = M('#ffffff', { emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.5 });
    for (let i = 0; i < 9; i++) {
        const ss = cruise.s0 + 20 + i * (cruise.s1 - cruise.s0 - 40) / 8;
        const h = new THREE.Mesh(heartGeometry(), cloudMat);
        const sc = 2 + (i % 3);
        h.scale.set(sc, sc, sc * 1.3);
        const p = t.point(ss, (i % 2 ? 1 : -1) * (14 + (i % 4) * 5));
        h.position.set(p.x, t.roadY(ss) + (i % 3 - 1) * 4 + 2, p.z);
        h.rotation.y = t.headingAt(ss) + (i % 2 ? -1 : 1) * 1.2;
        ctx.dynamic.add(h);
        const y0 = h.position.y, ph = i;
        ctx.anim((dt, tm) => { h.position.y = y0 + Math.sin(tm * 0.5 + ph) * 0.6; });
    }
    // Barcos de vela en el mar
    for (let i = 0; i < 6; i++) {
        const ss = cruise.s0 + 15 + i * (cruise.s1 - cruise.s0 - 30) / 5;
        const b = await model(i % 2 ? 'water/boat-sail-a' : 'water/boat-sail-b');
        const hb = new THREE.Box3().setFromObject(b).getSize(new THREE.Vector3()).y || 1;
        b.scale.multiplyScalar(4 / hb);
        const p = t.point(ss, (i % 2 ? -1 : 1) * (18 + i * 3));
        b.position.set(p.x, -0.1, p.z);
        b.rotation.y = i;
        ctx.dynamic.add(b);
        ctx.anim((dt, tm) => { b.rotation.z = Math.sin(tm + i) * 0.06; });
    }
    // Delfines saltando
    const dolMat = M('#7d8fa8');
    for (let i = 0; i < 5; i++) {
        const d = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.1, 4, 10), dolMat); body.rotation.x = Math.PI / 2; d.add(body);
        const fin = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 4), dolMat); fin.position.set(0, 0.3, 0.05); d.add(fin);
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.25), dolMat); tail.position.z = -0.85; d.add(tail);
        const ss = cruise.s0 + 30 + i * 40;
        const base = t.point(ss, (i % 2 ? 1 : -1) * 9); base.y = 0;
        const dir = new THREE.Vector3(Math.sin(i * 2.1), 0, Math.cos(i * 2.1));
        ctx.dynamic.add(d);
        ctx.anim((dt, tm) => {
            const k = ((tm * 0.4 + i * 0.37) % 1);
            const ph = k * Math.PI;
            d.position.copy(base).addScaledVector(dir, (k - 0.5) * 6);
            d.position.y = Math.sin(ph) * 2.2 - 0.6;
            d.rotation.set(-Math.cos(ph) * 0.9, Math.atan2(dir.x, dir.z), 0);
            d.visible = d.position.y > -0.4;
        });
    }
    finish(app, ctx, t.point((r.s0 + r.s1) / 2, 0), (r.s1 - r.s0) / 2 + 40);
}

// Decorado del viaje espacial: plataforma de lanzamiento, planetas, asteroides, nebulosa
// con forma de corazón y el Roadster rojo flotando con su astronauta (DON'T PANIC)
async function buildSpace(app, r) {
    const t = app.track;
    await buildHighway(app, r);
    const run = r.pieces[0], orbit = r.pieces.find(p => p.type === 'orbit'), reentry = r.pieces.find(p => p.type === 'reentry');
    const H = r.altitude;
    const toMars = !!(r.to.props && r.to.props.mars);
    const ctx = makeCtx(app, 'space');
    // --- Plataforma de lanzamiento al final de la pista ---
    const padS = run.s1 - 10;
    const tower = new THREE.Group();
    for (let k = 0; k < 8; k++) {
        const seg = new THREE.Group();
        for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) { const p = cyl(0.07, 0.07, 1.6, k % 2 ? '#e8173b' : '#f4f6fb', 6); p.position.set(x, 0, z); seg.add(p); }
        for (const z of [-0.6, 0.6]) { const d = box(1.7, 0.06, 0.06, '#5b6377'); d.position.set(0, 0.8, z); d.rotation.z = 0.75; seg.add(d); }
        seg.position.y = k * 1.6; tower.add(seg);
    }
    const arm = box(3.2, 0.25, 0.4, '#5b6377'); arm.position.set(-1.6, 9.5, 0); tower.add(arm);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), glow('#ff3355')); beacon.position.y = 13.1; tower.add(beacon);
    await ctx.put(tower, padS - run.s0 - (run.s1 - run.s0) / 2 + (run.s0 + run.s1) / 2 - ctx.place.sCenter, 6.5);
    for (let k = 0; k < 8; k++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), glow(k % 2 ? '#7ad7ff' : '#ffffff')); const p = t.point(run.s0 + 10 + k * 8, k % 2 ? 2.4 : -3.8); l.position.copy(p).y = t.roadY(run.s0 + 10 + k * 8) + 0.25; ctx.group.add(l); }
    ctx.label('3 · 2 · 1 · ¡Despegue! 🚀', padS - 30 - ctx.place.sCenter, 4.6, { width: 3.8, height: 2.6, opts: { bg: '#1b1b2f', fg: '#ffd23f', borderColor: '#ff4d8d' } });
    // --- Planetas (sin niebla, grandes y lejanos) ---
    // (los polos van de lado: bajo el lugar queda el ecuador, sin el casquete blanco)
    const planet = (color, radius, tex = null) => { const g = new THREE.SphereGeometry(radius, 64, 40); g.rotateZ(Math.PI / 2); return new THREE.Mesh(g, new THREE.MeshToonMaterial({ color, map: tex, fog: false })); };
    const earthTex = (() => {
        const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
        g.fillStyle = '#2f7fd6'; g.fillRect(0, 0, 512, 256);
        const rr = (i) => Math.abs(Math.sin(i * 91.7) * 4375.5) % 1;
        g.fillStyle = '#4caf50';
        for (let i = 0; i < 22; i++) { g.beginPath(); g.ellipse(rr(i) * 512, 40 + rr(i + 9) * 176, 20 + rr(i + 3) * 50, 12 + rr(i + 5) * 30, rr(i + 7) * 3, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = 'rgba(255,255,255,.75)';
        for (let i = 0; i < 30; i++) { g.beginPath(); g.ellipse(rr(i + 40) * 512, rr(i + 60) * 256, 25 + rr(i + 80) * 40, 5 + rr(i + 90) * 8, 0, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, 512, 14); g.fillRect(0, 242, 512, 14);
        const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
    })();
    const marsTex = (() => {
        const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
        g.fillStyle = '#c4532a'; g.fillRect(0, 0, 256, 128);
        const rr = (i) => Math.abs(Math.sin(i * 37.3) * 2817.1) % 1;
        for (let i = 0; i < 40; i++) { g.fillStyle = rr(i) < 0.5 ? 'rgba(120,40,20,.5)' : 'rgba(240,150,90,.4)'; g.beginPath(); g.arc(rr(i + 3) * 256, rr(i + 6) * 128, 3 + rr(i + 9) * 18, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#fff4ec'; g.fillRect(0, 0, 256, 8);
        const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
    })();
    // cada planeta, justo debajo de su lugar: al bajar parece que aterrizas sobre él
    const RE = 230, RM = 200;
    const under = (pl, R) => { const p = t.point(pl.sCenter, 0); return new THREE.Vector3(p.x, -R - 4, p.z); };
    const earth = planet('#ffffff', RE, earthTex), mars = planet('#ffffff', RM, marsTex);
    earth.position.copy(toMars ? under(r.from, RE) : under(r.to, RE));
    mars.position.copy(toMars ? under(r.to, RM) : under(r.from, RM));
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(RE * 1.05, 40, 24), new THREE.MeshBasicMaterial({ color: '#7ec8ff', transparent: true, opacity: 0.18, depthWrite: false, fog: false, side: THREE.BackSide }));
    const planets = new THREE.Group(); planets.add(earth, mars, atmo);
    app.engine.scene.add(planets);
    // El terreno del lugar es plano y pequeño: si el planeta tuviera siempre el mismo tamaño, al acercarse
    // se vería una "isla" plana flotando sobre una bola. Por eso el planeta cercano crece al bajar
    // (su superficie se aplana bajo el coche) y vuelve a ser una bola al subir.
    const earthIsFrom = toMars;           // a Marte se sale de la Tierra; de vuelta, se sale de Marte
    const fit = (mesh, R0, k, extra = null) => {
        const R = R0 * (1 + 25 * k + 35 * k * k);
        mesh.scale.setScalar(R / R0);
        mesh.position.y = -R + 0.15;         // a ras de la orilla del lugar (lo de debajo se recorta)
        if (extra) { extra.scale.setScalar(R / R0); extra.position.copy(mesh.position); }
    };
    app.engine.onUpdate((dt, tm) => {
        const cs = app.car.s;
        const inRegion = cs > run.s0 && cs < reentry.s1 + 5;
        planets.visible = inRegion && app.world.spaceK > 0.04;
        if (!planets.visible) return;
        const alt = THREE.MathUtils.clamp(t.airAt(cs) / H, 0, 1);
        const second = cs > (orbit.s0 + orbit.s1) / 2;
        const kNear = 1 - alt;                 // 1 en el suelo, 0 en órbita
        // planeta de origen: cercano en la primera mitad; de destino: en la segunda
        fit(earth, RE, (second ? !earthIsFrom : earthIsFrom) ? kNear : 0, atmo);
        fit(mars, RM, (second ? earthIsFrom : !earthIsFrom) ? kNear : 0);
    });
    // --- Asteroides, satélite, nebulosa de corazón y el Roadster con su astronauta ---
    const rockM = M('#8a7d72'), rockM2 = M('#6e625a');
    for (let i = 0; i < 22; i++) {
        const ss = orbit.s0 + 15 + i * (orbit.s1 - orbit.s0 - 30) / 21;
        const a = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8 + (i % 4) * 0.7, 0), i % 2 ? rockM : rockM2);
        const p = t.point(ss, (i % 2 ? 1 : -1) * (10 + (i * 7) % 26)); p.y = t.roadY(ss) + ((i * 13) % 20) - 10;
        a.position.copy(p); a.scale.set(1, 0.8 + (i % 3) * 0.2, 1.1);
        ctx.dynamic.add(a);
        const sp = 0.2 + (i % 5) * 0.1;
        ctx.anim((dt) => { a.rotation.x += dt * sp; a.rotation.y += dt * sp * 0.7; });
    }
    const sat = new THREE.Group();
    sat.add(box(0.9, 0.9, 1.4, '#d4af37'));
    for (const sx of [-1, 1]) { const pnl = box(2.6, 0.04, 1.0, '#2f4f9f'); pnl.position.set(sx * 1.8, 0.45, 0); sat.add(pnl); }
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 3), M('#f4f6fb', { side: THREE.DoubleSide })); dish.position.y = 1.1; sat.add(dish);
    await ctx.put(sat, orbit.s0 + 70 - ctx.place.sCenter, -16, { y: H + 6, dynamic: true });
    ctx.anim((dt, tm) => { sat.rotation.y = tm * 0.3; });
    // nebulosa en forma de corazón, muy lejos (sprite suave)
    const nc = document.createElement('canvas'); nc.width = nc.height = 256;
    const ng = nc.getContext('2d');
    const grd = ng.createRadialGradient(128, 128, 10, 128, 128, 128); grd.addColorStop(0, 'rgba(255,140,200,.9)'); grd.addColorStop(1, 'rgba(255,140,200,0)');
    ng.fillStyle = grd; ng.beginPath();
    ng.moveTo(128, 222); ng.bezierCurveTo(30, 160, 10, 90, 60, 55); ng.bezierCurveTo(95, 30, 125, 50, 128, 80); ng.bezierCurveTo(131, 50, 161, 30, 196, 55); ng.bezierCurveTo(246, 90, 226, 160, 128, 222); ng.fill();
    const neb = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(nc), transparent: true, opacity: 0.55, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    const mid = t.frame((orbit.s0 + orbit.s1) / 2);
    neb.position.set(mid.x + mid.nx * 320 + mid.tx * 120, t.roadY(orbit.s0) + 140, mid.z + mid.nz * 320 + mid.tz * 120);
    neb.scale.setScalar(260);
    planets.add(neb);
    // el Roadster rojo con su astronauta, dando vueltas lentamente
    const rs = new THREE.Group();
    const car = await model('car/hatchback-sports');
    car.traverse(o => { if (o.isMesh) o.material = M(/window|glass/i.test(o.material.name) ? '#25324f' : /wheel|tire|black/i.test(o.material.name) ? '#1e2130' : '#e8173b'); });
    const hb = new THREE.Box3().setFromObject(car).getSize(new THREE.Vector3()).z || 1;
    car.scale.multiplyScalar(2.4 / hb); rs.add(car);
    const astro = new THREE.Group();
    const suit = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.4, 4, 10), M('#f4f6fb')); suit.position.y = 0.95; astro.add(suit);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), M('#f4f6fb')); helmet.position.y = 1.45; astro.add(helmet);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI), M('#d4af37')); visor.position.set(0, 1.47, 0.08); astro.add(visor);
    rs.add(astro);
    const dp = textPlane("DON'T PANIC", 1.6, { width: 512, height: 120, bg: null, fg: '#ffd23f', stroke: '#1b1b2f', font: 'Bangers', weight: 400, border: 0 });
    dp.position.y = 2.3; rs.add(dp);
    await ctx.put(rs, (orbit.s0 + orbit.s1) / 2 - ctx.place.sCenter, 13, { y: H + 2, dynamic: true });
    ctx.anim((dt, tm) => { rs.rotation.y = tm * 0.25; rs.rotation.z = Math.sin(tm * 0.3) * 0.3; });
    finish(app, ctx, t.point((r.s0 + r.s1) / 2, 0), (r.s1 - r.s0) / 2 + 80);
}

export async function buildRoadtrips(app) {
    for (const r of app.track.regions) {
        if (r.type === 'flight') { await buildFlight(app, r); continue; }
        if (r.type === 'space') { await buildSpace(app, r); continue; }
        if (r.type !== 'roadtrip') continue;
        await buildHighway(app, r);
        for (const pc of r.pieces) {
            if (pc.type === 'toll') await buildToll(app, pc);
            if (pc.type === 'roundabout') await buildRoundabout(app, pc);
        }
        for (const sc of r.scenes || []) {
            const fn = SCENES[sc.base];
            if (!fn) { console.warn('Escena desconocida en el viaje:', sc.name); continue; }
            const ctx = makeCtx(app, sc.name);
            try { await fn(ctx, sc); } catch (e) { console.error('Error en la escena', sc.name, e); }
            finish(app, ctx, ctx.pos(sc.s, 0), 70);
        }
    }
}
