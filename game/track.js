// La carretera: una ruta serpenteante que recorre zonas muy distintas (una por parte
// del juego). Cada lugar es su propio "barrio" separado por un tramo de viaje
// (puente sobre el mar en la Parte 1, carretera en el resto) y entre partes hay una
// autopista larga. Todo se genera a partir del itinerario.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { toon } from './assets.js';

const LEAD = 40;    // carretera antes del primer lugar (para que no se vea el principio)
const STEP = 0.5;   // resolución del trazado
const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
const lerp = THREE.MathUtils.lerp;

// Colores del terreno por bioma: [hierba A, hierba B, orilla]
const BIOMES = {
    island: { a: '#8fd16a', b: '#6fbf5a', shore: '#f6e0a4', width: [13, 26] },
    city: { a: '#9ccf74', b: '#83c164', shore: '#f6e0a4', width: [14, 28], pave: '#cfd2d6' },
    beach: { a: '#f3d79c', b: '#ecca86', shore: '#f6e0a4', width: [13, 28] },
    desert: { a: '#e2c08f', b: '#d3a477', shore: '#ead2a2', width: [40, 44] },
    forest: { a: '#4f9a52', b: '#3c7f45', shore: '#c9b98c', width: [36, 40] },
    cliff: { a: '#7cbf63', b: '#5fa653', shore: '#c9b98c', width: [16, 28] },
    mountain: { a: '#86b862', b: '#5e9a4e', shore: '#c9b98c', width: [34, 34] },
    country: { a: '#a6cf6a', b: '#88bb57', shore: '#e7d49e', width: [40, 40] },
    urban: { a: '#b9b7b0', b: '#aaa8a1', shore: '#cfc8b8', width: [36, 36] },
    volcanic: { a: '#7a5646', b: '#5e4438', shore: '#3a302c', width: [30, 40] },
    mars: { a: '#c4532a', b: '#a8441f', shore: '#6e2a14', width: [40, 48] }
};
const colorCache = new Map();
const col = (hex) => { if (!colorCache.has(hex)) colorCache.set(hex, new THREE.Color(hex)); return colorCache.get(hex); };

export class Track {
    constructor(itinerary) {
        const R = CONFIG.road;
        this.width = R.width;
        // El trazado es el centro del carril derecho: el asfalto se extiende más hacia la izquierda
        this.offset = -R.width / 4;                 // centro de la calzada respecto al trazado
        this.leftEdge = R.width * 0.75;             // borde izquierdo (distancia)
        this.rightEdge = R.width * 0.25;            // borde derecho
        this.leftExtra = this.leftEdge - 1.4;       // cuánto más ancha es ahora por la izquierda
        this.bumps = [];
        this.flats = [];        // zonas llanas (aparcamientos, circuitos...)
        this.places = itinerary.places;
        this.regions = [];

        // 1. Reparto: lugar, tramo de viaje, lugar...
        let s = LEAD;
        this.regions.push({ type: 'lead', s0: 0, s1: LEAD, to: this.places[0] });
        let prev = null;
        for (const p of this.places) {
            p.props = p.props || {};
            p.zone = CONFIG.zones[p.stage] || CONFIG.zones.theory;
            p.biome = p.props.biome || p.zone.biome;
            if (prev) {
                const highway = prev.stage !== p.stage;
                const approach = p.props.approach || null;      // 'ronda' (Barcelona) o 'roadtrip' (viaje largo)
                if (approach === 'roadtrip' || approach === 'flight' || approach === 'space') {
                    const reg = { type: approach, approach, s0: s, from: prev, to: p, pieces: [] };
                    if (approach === 'space') reg.altitude = 140;
                    const plan = approach === 'flight' ? flightPlan(p.props.flight || {}) : approach === 'space' ? spacePlan(p.props.space || {}) : roadtripPlan(p.props.roadtrip || {});
                    for (const piece of plan) {
                        piece.s0 = s;
                        if (piece.geo) piece.len = piece.geo.length;
                        s += piece.len;
                        piece.s1 = s;
                        reg.pieces.push(piece);
                    }
                    reg.s1 = s;
                    this.regions.push(reg);
                } else {
                    const len = highway ? R.stageGap : approach ? R.placeGap * 1.6 : R.placeGap;
                    const type = highway ? 'highway' : approach ? 'land' : (p.zone.gap === 'bridge' && prev.zone.gap === 'bridge' ? 'bridge' : 'land');
                    this.regions.push({ type, approach, s0: s, s1: s + len, from: prev, to: p });
                    s += len;
                }
            }
            const n = p.stops.length;
            if (p.props.mountain) {
                // Carretera de montaña con horquillas: subida, rotonda en la cima y bajada por el mismo camino
                p.mountain = buildMountain(p.props.mountain);
                p.length = p.mountain.length;
                p.s0 = s;
                p.s1 = s + p.length;
                p.sCenter = s + p.mountain.summitS;                 // entrada a la plaza de la cima
                p.stops.forEach((st, k) => { st.s = p.sCenter - 3 - (n - 1 - k) * R.stopSpacing; });
            } else {
                const sp = p.props.stopSpacing ?? R.stopSpacing;
                p.length = p.props.length ?? (R.placeBase + sp * n);
                p.s0 = s;
                p.s1 = s + p.length;
                p.sCenter = s + p.length / 2;
                p.stops.forEach((st, k) => { st.s = p.sCenter + (k - (n - 1) / 2) * sp; });
                // La primera parada, un poco más atrás para ver la maqueta por delante
                if (p.stops.length && p.stage !== 'finale') {
                    const back = p.props.firstStopBack ?? R.firstStopBack ?? 0;
                    p.stops[0].s = Math.max(p.s0 + 5, p.stops[0].s - back);
                }
            }
            // Aparcamiento: la plaza queda a la derecha; el coche llega a park.s y entra marcha atrás
            if (p.props.parking) p.park = { s: p.s0 + p.length * 0.55, R: 5, d: 1.6 };
            if (p.stage === 'finale') p.stops.forEach(st => { st.s = p.s1 - 3; });   // justo antes de la plaza del mirador
            this.regions.push({ type: 'place', s0: p.s0, s1: p.s1, place: p });
            s = p.s1;
            prev = p;
        }
        const last = this.places[this.places.length - 1];
        this.roadEnd = last.s1 + 4;           // la carretera termina en la plaza del mirador
        this.length = this.roadEnd + 40;
        this.regions.push({ type: 'end', s0: last.s1, s1: this.length, from: last });
        this.startS = LEAD - 10;

        // 2. Trazado: curvatura suave (más recto en los lugares, más curvas en las zonas de tierra);
        //    las montañas se insertan como polilínea explícita.
        // Tramos con geometría propia (polilínea local a = adelante, b = derecha)
        this.inserts = [];
        for (const p of this.places) if (p.mountain) this.inserts.push({ s0: p.s0, s1: p.s1, geo: p.mountain, height: true });
        for (const r of this.regions) for (const pc of r.pieces || []) if (pc.geo) this.inserts.push({ s0: pc.s0, s1: pc.s1, geo: pc.geo });
        this.inserts.sort((A, B) => A.s0 - B.s0);
        const xs = [], zs = [], ss = [], ry = [], rib = [];
        let x = 0, z = 0, heading = 0;
        let t = 0, nextIns = 0;
        const push = (rY = NaN, ribbon = true) => { xs.push(x); zs.push(z); ss.push(t); ry.push(rY); rib.push(ribbon); };
        while (t <= this.length) {
            const reg = this.regionAt(t);
            const ins = this.inserts[nextIns];
            if (ins && t >= ins.s0 - STEP / 2 - 1e-6) {
                nextIns++;
                const G = ins.geo;
                const fx = Math.sin(heading), fz = Math.cos(heading), rx = -Math.cos(heading), rz = Math.sin(heading);
                const ox = x, oz = z, h0 = heading;
                G.origin = { x: ox, z: oz, heading: h0 };
                let lastT = t;
                for (let i = 0; i < G.pts.length; i++) {
                    const pt = G.pts[i];
                    x = ox + fx * pt.a + rx * pt.b;
                    z = oz + fz * pt.a + rz * pt.b;
                    t = ins.s0 + pt.s;
                    if (t > ins.s1 + 1e-6) break;
                    xs.push(x); zs.push(z); ss.push(t);
                    ry.push(ins.height ? pt.u : NaN);   // montañas: fracción de altura (0..1)
                    rib.push(pt.ribbon);
                    lastT = t;
                }
                heading = h0 - G.endHeading;   // (a, b) → mundo: rumbo = h0 - th
                // seguir un paso por delante del último punto (sin puntos duplicados)
                x += Math.sin(heading) * STEP; z += Math.cos(heading) * STEP;
                t = lastT + STEP;
                continue;
            }
            push();
            const inPlace = reg.type === 'place' ? 1 : 0;
            const wiggle = reg.type === 'land' ? 1.35 : reg.type === 'highway' ? 0.8 : reg.type === 'roadtrip' ? 0.7 : (reg.type === 'flight' || reg.type === 'space') ? 0.45 : 1;
            const k = (0.017 * Math.sin(t / 47 + 0.4) + 0.009 * Math.sin(t / 21 + 1.7)) * wiggle * (1 - 0.6 * this._soft(t, inPlace));
            heading += k * STEP;
            x += Math.sin(heading) * STEP;
            z += Math.cos(heading) * STEP;
            t += STEP;
        }
        this.xs = xs; this.zs = zs; this.ss = ss; this.ry = ry; this.rib = rib;
        // Curvatura a partir de la geometría real (incluye las horquillas)
        const ks = new Float32Array(xs.length);
        for (let i = 1; i < xs.length - 1; i++) {
            const h1 = Math.atan2(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
            const h2 = Math.atan2(xs[i + 1] - xs[i], zs[i + 1] - zs[i]);
            let dh = h2 - h1;
            while (dh > Math.PI) dh -= 2 * Math.PI;
            while (dh < -Math.PI) dh += 2 * Math.PI;
            const ds = Math.max(1e-3, ss[i + 1] - ss[i - 1]) / 2;
            ks[i] = dh / ds;
        }
        this.ks = ks;
        // Rotondas: centro en el mundo y terreno llano alrededor
        for (const ins of this.inserts) {
            const G = ins.geo;
            if (!G.center) continue;
            const O = G.origin;
            const fx = Math.sin(O.heading), fz = Math.cos(O.heading), rx = -Math.cos(O.heading), rz = Math.sin(O.heading);
            G.world = { x: O.x + fx * G.center.a + rx * G.center.b, z: O.z + fz * G.center.a + rz * G.center.b };
            this.addFlat(G.world.x, G.world.z, G.R + 12);
        }
        // Relieve de las montañas (cresta) y altura de su carretera
        for (const p of this.places) {
            if (!p.mountain) continue;
            const M = p.mountain, O = M.origin;
            this.bumps.push({ type: 'ridge', ...M.ridge, ox: O.x, oz: O.z, heading: O.heading, H: M.height });
        }

        // 3. Índice espacial para buscar el punto de carretera más cercano
        this.cell = 12;
        this.grid = new Map();
        for (let i = 0; i < xs.length; i += 2) {
            const key = this._key(Math.floor(xs[i] / this.cell), Math.floor(zs[i] / this.cell));
            if (!this.grid.has(key)) this.grid.set(key, []);
            this.grid.get(key).push(i);
        }
    }

    _key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }

    // Suaviza la transición de "estar en un lugar" para la curvatura
    _soft(t, inPlace) {
        for (const p of this.places) {
            if (t > p.s0 - 10 && t < p.s1 + 10) return smooth(p.s0 - 10, p.s0, t) * (1 - smooth(p.s1, p.s1 + 10, t));
        }
        return inPlace;
    }

    // Tramo del viaje largo en s (o null)
    pieceAt(s) {
        const r = this.regionAt(s);
        if (!r.pieces) return null;
        for (const pc of r.pieces) if (s >= pc.s0 && s < pc.s1) return pc;
        return null;
    }

    // Altura extra sobre el terreno (vuelo); 0 fuera de las regiones de vuelo
    airAt(s) {
        const r = this.regionAt(s);
        if (r.type !== 'flight' && r.type !== 'space') return 0;
        const pc = this.pieceAt(s);
        if (!pc) return 0;
        const H = r.altitude ?? 26;
        const u = (s - pc.s0) / (pc.s1 - pc.s0);
        if (pc.type === 'climb') return H * smooth(0, 1, u);
        if (pc.type === 'cruise') return H + 3 * Math.sin(u * Math.PI * 6);
        if (pc.type === 'descent') return H * (1 - smooth(0, 1, u));
        // espacio: despegue casi vertical, órbita entre estrellas y reentrada
        if (pc.type === 'launch') return H * Math.pow(smooth(0, 1, u), 1.15);
        if (pc.type === 'orbit') return H + 5 * Math.sin(u * Math.PI * 4);
        if (pc.type === 'reentry') return H * (1 - smooth(0, 1, u));
        return 0;
    }

    // Estado del vuelo en s: alas desplegadas (0..1) y en el aire
    flightState(s) {
        const fly = x => x.type === 'flight' || x.type === 'space';
        const r = this.regionAt(s), nxt = this.regionAt(s + 14), prv = this.regionAt(s - 14);
        const reg = fly(r) ? r : fly(nxt) ? nxt : fly(prv) ? prv : null;
        if (!reg) return { wings: 0, rockets: 0, air: 0, region: null };
        const run = reg.pieces[0], last = reg.pieces[reg.pieces.length - 1];
        const on = s > run.s0 + 28 && s < last.s1 + 10 ? 1 : 0;
        // espacio: segunda transformación (cohetes); cuánto "espacio" hay (para el cielo)
        if (reg.type === 'space') return { wings: 0, rockets: on, air: this.airAt(s), region: reg, space: THREE.MathUtils.smoothstep(this.airAt(s) / reg.altitude, 0.15, 0.8) };
        return { wings: on, rockets: 0, air: this.airAt(s), region: reg, space: 0 };
    }

    // Escena del viaje que se está acercando (para encuadrarla)
    poiAhead(s, before = 40, after = 5) {
        const r = this.regionAt(s);
        if (!r.pois) return null;
        for (const p of r.pois) if (s > p.s - before && s < p.s + after) return p;
        return null;
    }

    // Velocidad recomendada por el tramo (null = la normal). Más despacio junto a las escenas.
    speedHint(s) {
        const pc = this.pieceAt(s);
        if (!pc) return null;
        const C = CONFIG.car;
        const fly = this.regionAt(s).type === 'flight' || this.regionAt(s).type === 'space';
        const base = { highway: fly ? C.highwaySpeed * 1.1 : C.highwaySpeed * 0.75, road: C.travelSpeed, toll: 5, roundabout: 7, climb: C.highwaySpeed * 1.1, cruise: C.highwaySpeed, descent: C.highwaySpeed * 0.75, launch: C.highwaySpeed * 1.3, orbit: C.highwaySpeed * 1.7, reentry: C.highwaySpeed * 0.85 }[pc.type] ?? null;
        if (base && pc.type !== 'toll' && this.poiAhead(s, 26, 6)) return Math.min(base, 10);
        return base;
    }

    // Anchura a la izquierda que debe quedar llana (calzada en sentido contrario, mediana...)
    corridorLeft(s) {
        const r = this.regionAt(s);
        if (r.approach === 'ronda') return 13;
        if (r.place && r.place.props.wideRoad) return 19;          // autopista de 3+3 carriles
        const pc = this.pieceAt(s);
        if (pc && pc.wide) return 19;
        if (pc && (pc.type === 'highway' || pc.type === 'toll')) return 13;
        return 0;
    }

    regionAt(s) {
        for (const r of this.regions) if (s >= r.s0 && s < r.s1) return r;
        return this.regions[s < 0 ? 0 : this.regions.length - 1];
    }

    // Progreso (0..1) dentro de un tramo de viaje
    gapProgress(s) {
        const r = this.regionAt(s);
        return r.type === 'place' ? null : THREE.MathUtils.clamp((s - r.s0) / (r.s1 - r.s0), 0, 1);
    }

    placeAt(s) {
        const r = this.regionAt(s);
        if (r.place) return r.place;
        if (r.type === 'lead') return r.to;
        if (r.type === 'end') return r.from;
        return (s - r.s0) / (r.s1 - r.s0) < 0.5 ? r.from : r.to;
    }

    // ¿Hay tierra? 0 en mitad de un puente, 1 en tierra firme
    islandWeight(s) {
        const r = this.regionAt(s);
        if (r.type === 'flight' || r.type === 'space') {
            const pc = this.pieceAt(s);
            if (!pc || pc.type === 'highway') return 1;
            if (pc.type === 'climb' || pc.type === 'launch') return 1 - smooth(pc.s0 + 12, pc.s0 + 34, s);
            if (pc.type === 'descent' || pc.type === 'reentry') return smooth(pc.s1 - 34, pc.s1 - 8, s);
            return 0;
        }
        if (r.type === 'end') return 1 - smooth(this.roadEnd + 4, this.roadEnd + 13, s);
        if (r.type !== 'bridge') return 1;
        const pad = 7;
        return Math.max(1 - smooth(r.s0 + pad - 4, r.s0 + pad + 6, s), smooth(r.s1 - pad - 6, r.s1 - pad + 4, s));
    }

    // Bioma (colores + anchura de tierra) mezclado en los tramos entre zonas
    biomeAt(s) {
        const r = this.regionAt(s);
        const pick = p => BIOMES[p.biome] || BIOMES.island;
        if (r.type === 'place' || r.type === 'lead' || r.type === 'end') {
            const pl = r.place || r.to || r.from;
            const b = pick(pl);
            return { a: col(b.a), b: col(b.b), shore: col(b.shore), wl: pl.props.islandLeft ?? b.width[0], wr: pl.props.islandRight ?? b.width[1], pave: b.pave ? col(b.pave) : null };
        }
        if (r.type === 'flight' || r.type === 'space') {
            const A0 = pick(r.from), B0 = pick(r.to), t = (s - r.s0) / (r.s1 - r.s0);
            const E = t < 0.5 ? A0 : B0;
            return { a: col(E.a), b: col(E.b), shore: col(E.shore), wl: E.width[0], wr: E.width[1], pave: null };
        }
        if (r.approach === 'ronda') {
            const U = BIOMES.urban, t = (s - r.s0) / (r.s1 - r.s0);
            const k = Math.min(smooth(0, 0.12, t), 1 - smooth(0.92, 1, t));
            const A0 = pick(r.from), B0 = pick(r.to), E = t < 0.5 ? A0 : B0;
            const mix = (h1, h2) => col(h1).clone().lerp(col(h2), k);
            return { a: mix(E.a, U.a), b: mix(E.b, U.b), shore: col(U.shore), wl: lerp(E.width[0], U.width[0], k), wr: lerp(E.width[1], U.width[1], k), pave: null };
        }
        const A = pick(r.from), B = (r.type === 'highway' || r.type === 'roadtrip') ? BIOMES.country : pick(r.to), C = pick(r.to);
        const t = (s - r.s0) / (r.s1 - r.s0);
        // Autopista: zona de origen → campo → zona de destino
        let x, y, k;
        if (r.type === 'highway' || r.type === 'roadtrip') { const e = r.type === 'roadtrip' ? 0.06 : 0.45; if (t < 0.5) { x = A; y = B; k = smooth(0.0, e, t); } else { x = B; y = C; k = smooth(1 - e, 1, t); } }
        else { x = A; y = C; k = smooth(0.2, 0.8, t); }
        const mix = (h1, h2) => col(h1).clone().lerp(col(h2), k);
        return { a: mix(x.a, y.a), b: mix(x.b, y.b), shore: mix(x.shore, y.shore), wl: lerp(x.width[0], y.width[0], k), wr: lerp(x.width[1], y.width[1], k), pave: null };
    }

    // Altura base de la carretera: interpolada entre lugares + arco de los puentes
    baseY(s) {
        const ps = this.places;
        let lo = ps[0], hi = ps[ps.length - 1];
        for (let i = 0; i < ps.length; i++) {
            if (ps[i].sCenter <= s) lo = ps[i];
            if (ps[i].sCenter >= s) { hi = ps[i]; break; }
        }
        const e0 = lo.props.elevation ?? 1.2, e1 = hi.props.elevation ?? 1.2;
        if (s > this.roadEnd) return e1;
        const y = lo === hi ? e0 : lerp(e0, e1, smooth(lo.s1, hi.s0, s));
        return y + (1 - this.islandWeight(s)) * 1.3;
    }

    bumpsAt(x, z) {
        let h = 0;
        for (const b of this.bumps) {
            if (b.type === 'ridge') {
                // coordenadas locales de la montaña (a adelante, b derecha)
                const dx = x - b.ox, dz = z - b.oz;
                const fa = dx * Math.sin(b.heading) + dz * Math.cos(b.heading);
                const fb = dx * -Math.cos(b.heading) + dz * Math.sin(b.heading);
                const along = smooth(b.a0, b.a1, fa) * (1 - smooth(b.a2, b.a3, fa));
                const across = 1 - smooth(b.halfW, b.halfW + b.fall, Math.abs(fb - b.bc));
                const n = 1 + 0.06 * Math.sin(fa * 0.3) * Math.cos(fb * 0.25);
                h += b.H * Math.pow(along, 1.15) * across * n;
                continue;
            }
            const bd = Math.hypot(x - b.x, z - b.z) / b.radius;
            if (bd < 1) h += b.height * (0.5 + 0.5 * Math.cos(bd * Math.PI));
        }
        return h;
    }

    roadY(s) {
        const i = this._index(s);
        const u = this.ry[i];
        if (!Number.isNaN(u)) {
            const u2 = this.ry[i + 1];
            const k = (s - this.ss[i]) / Math.max(1e-6, this.ss[i + 1] - this.ss[i]);
            const uu = Number.isNaN(u2) ? u : u + (u2 - u) * k;
            const p = this.placeAt(s);
            return this.baseY(s) + uu * (p.mountain ? p.mountain.height : 0);
        }
        const f = this.frame(s);
        return this.baseY(s) + this.bumpsAt(f.x, f.z) + this.airAt(s);
    }

    // Convierte coordenadas locales de una montaña (a adelante, b derecha) a mundo
    mountainPoint(place, a, b) {
        const O = place.mountain.origin;
        const fx = Math.sin(O.heading), fz = Math.cos(O.heading), rx = -Math.cos(O.heading), rz = Math.sin(O.heading);
        const x = O.x + fx * a + rx * b, z = O.z + fz * a + rz * b;
        return new THREE.Vector3(x, this.heightAt(x, z), z);
    }

    _index(s) {
        const ss = this.ss;
        let lo = 0, hi = ss.length - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ss[m] <= s) lo = m; else hi = m; }
        return Math.min(lo, ss.length - 2);
    }

    // Curvatura con signo en s
    curvature(s) {
        return this.ks[this._index(s)];
    }

    // Posición, tangente y normal (a la DERECHA de la marcha, donde van las maquetas)
    frame(s, out = {}) {
        const ss = this.ss;
        s = THREE.MathUtils.clamp(s, 0, ss[ss.length - 1]);
        const i = this._index(s);
        const t = (s - ss[i]) / Math.max(1e-6, ss[i + 1] - ss[i]);
        const x = this.xs[i] + (this.xs[i + 1] - this.xs[i]) * t;
        const z = this.zs[i] + (this.zs[i + 1] - this.zs[i]) * t;
        let tx = this.xs[i + 1] - this.xs[i], tz = this.zs[i + 1] - this.zs[i];
        const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
        out.x = x; out.z = z; out.tx = tx; out.tz = tz; out.nx = -tz; out.nz = tx;
        return out;
    }

    point(s, side = 0, out = new THREE.Vector3()) {
        const f = this.frame(s);
        const x = f.x + f.nx * side, z = f.z + f.nz * side;
        const y = side > -this.leftEdge - 0.3 && side < this.rightEdge + 0.3 ? this.roadY(s) : this.heightAt(x, z);
        return out.set(x, y, z);
    }

    headingAt(s) {
        const f = this.frame(s);
        return Math.atan2(f.tx, f.tz);
    }

    addBump(x, z, radius, height) { this.bumps.push({ x, z, radius, height }); }
    addFlat(x, z, radius) { this.flats.push({ x, z, radius }); }
    _flatness(x, z) {
        let f = 0;
        for (const fl of this.flats) f = Math.max(f, 1 - smooth(fl.radius - 5, fl.radius, Math.hypot(x - fl.x, z - fl.z)));
        return f;
    }

    // Punto de carretera más cercano: { s, d (con signo: + derecha), dist }
    nearest(x, z, maxDist = 52, cands = null) {
        let best = -1, bd = maxDist * maxDist;
        const test = i => {
            const d = (this.xs[i] - x) ** 2 + (this.zs[i] - z) ** 2;
            if (d < bd) { bd = d; best = i; }
        };
        if (cands) for (const i of cands) test(i);
        else {
            const r = Math.ceil(maxDist / this.cell);
            const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
            for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
                const list = this.grid.get(this._key(cx + a, cz + b));
                if (list) for (const i of list) test(i);
            }
        }
        if (best < 0) return null;
        let bs = this.ss[best], bdist = Math.sqrt(bd), bside = 0;
        for (const j of [best - 2, best]) {
            if (j < 0 || j + 2 >= this.xs.length) continue;
            const ax = this.xs[j], az = this.zs[j], vx = this.xs[j + 2] - ax, vz = this.zs[j + 2] - az;
            const len2 = vx * vx + vz * vz;
            const u = THREE.MathUtils.clamp(((x - ax) * vx + (z - az) * vz) / len2, 0, 1);
            const px = ax + vx * u, pz = az + vz * u;
            const dd = Math.hypot(x - px, z - pz);
            if (dd <= bdist + 1e-6) {
                bdist = dd; bs = this.ss[j] + u * (this.ss[j + 2] - this.ss[j]);
                const l = Math.sqrt(len2);
                bside = (x - px) * (-vz / l) + (z - pz) * (vx / l);
            }
        }
        return { s: bs, d: bside, dist: bdist };
    }

    candidates(minX, minZ, maxX, maxZ, margin = 52) {
        const out = [];
        const c0x = Math.floor((minX - margin) / this.cell), c1x = Math.floor((maxX + margin) / this.cell);
        const c0z = Math.floor((minZ - margin) / this.cell), c1z = Math.floor((maxZ + margin) / this.cell);
        for (let a = c0x; a <= c1x; a++) for (let b = c0z; b <= c1z; b++) {
            const list = this.grid.get(this._key(a, b));
            if (list) out.push(...list);
        }
        return out;
    }

    // Altura del terreno; si se pasa "info" devuelve también el color del suelo
    heightAt(x, z, cands = null, info = null) {
        const q = this.nearest(x, z, 52, cands);
        if (!q) { if (info) info.color = null; return -3.2; }
        const w = this.islandWeight(q.s);
        const bio = this.biomeAt(q.s);
        const n = Math.sin(x * 0.13 + 1.1) * Math.cos(z * 0.11 - 0.4) + 0.5 * Math.sin(x * 0.31 - z * 0.27);
        const W = (q.d >= 0 ? bio.wr : bio.wl) * w * (1 + 0.16 * n);
        const a = Math.abs(q.d);
        const base = this.baseY(q.s) - (1 - w) * 1.3;
        let h;
        let land = 0;
        if (W <= 0.5) h = -3.2;
        else {
            land = 1 - smooth(W - 6, W + 2.5, a);
            // Relieve: ondulación suave cerca de la carretera y colinas tierra adentro (varias capas)
            const hills = 0.55 * Math.sin(x * 0.043 + z * 0.031 + 0.7) * Math.cos(x * 0.022 - z * 0.037)
                + 0.3 * Math.sin(x * 0.09 - z * 0.11 + 1.3) + 0.15 * Math.sin(x * 0.23 + z * 0.19);
            const amp = 0.35 + 2.4 * smooth(9, 38, a);
            const cl = q.d < 0 ? Math.max(this.corridorLeft(q.s), this.leftExtra) : 0;
            const und = (0.6 * n * 0.35 + hills * amp) * smooth(4 + cl, 10 + cl, a) * (1 - this._flatness(x, z));
            h = lerp(-3.2, base + Math.max(und, -0.6), land);
        }
        h += this.bumpsAt(x, z);
        // Carreteras de montaña: el terreno se talla en terrazas alrededor de la calzada
        const qi = this._index(q.s);
        if (!Number.isNaN(this.ry[qi]) && W > 0.5) {
            const rY = this.roadY(q.s) - 0.04;
            const dd = q.d < 0 ? q.dist - this.leftExtra : q.dist;
            h = THREE.MathUtils.lerp(rY, h, smooth(2.2, 6.5, dd));
        }
        if (info) {
            const c = info.color || (info.color = new THREE.Color());
            c.copy(bio.a).lerp(bio.b, 0.5 + 0.5 * Math.sin(x * 0.21) * Math.cos(z * 0.17 + x * 0.05));
            if (bio.pave && a < 6.5) c.copy(bio.pave);
            if (land < 0.85) c.lerp(bio.shore, smooth(0.85, 0.4, land));
            if (h < 0) c.copy(bio.shore).multiplyScalar(0.85);
        }
        return h;
    }

    distanceToRoad(x, z) {
        const q = this.nearest(x, z, 20);
        return q ? q.dist : Infinity;
    }

    buildMesh() {
        const group = new THREE.Group();
        const curb = toon('#efe3c4', { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        const asphalt = new THREE.MeshToonMaterial({ map: roadTexture(), polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
        group.add(this._ribbon(this.width + 1.1, 0.06, curb, false, this.offset));
        group.add(this._ribbon(this.width, 0.12, asphalt, true, this.offset));
        // Bajo los tramos que no se pintan por pisar otro ya dibujado (cruces, vuelta de la rotonda de
        // La Mola), bordillo y asfalto liso algo más bajos: tapan los huecos donde el solape es parcial
        const curbFill = toon('#efe3c4', { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
        const asphaltFill = toon('#5d6275', { polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
        group.add(this._ribbon(this.width + 1.1, 0.04, curbFill, false, this.offset, true));
        group.add(this._ribbon(this.width, 0.09, asphaltFill, false, this.offset, true));
        group.add(this._bridges());
        group.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
        return group;
    }

    // ¿Este trozo de carretera cae encima de otro ya dibujado antes (cruces, rotondas de vuelta)?
    // Si es así no se pinta: dos asfaltos a la misma altura producen parpadeo (z-fighting).
    _overlaps(s) {
        if (!this._overlapCache) this._overlapCache = new Map();
        const key = Math.round(s / 0.6);
        if (this._overlapCache.has(key)) return this._overlapCache.get(key);
        const f = this.frame(s);
        const cx = f.x + f.nx * this.offset, cz = f.z + f.nz * this.offset;   // centro de la calzada
        const y = this.roadY(s);
        const R = this.width * 0.95;
        let hit = false;
        const gx = Math.floor(cx / this.cell), gz = Math.floor(cz / this.cell);
        for (let a = -1; a <= 1 && !hit; a++) for (let b = -1; b <= 1 && !hit; b++) {
            const list = this.grid.get(this._key(gx + a, gz + b));
            if (!list) continue;
            for (const i of list) {
                const si = this.ss[i];
                if (si >= s - this.width * 3) continue;               // sólo tramos ANTERIORES y lejanos en recorrido
                if (!this.rib[i] || si > this.roadEnd) continue;
                const fi = this.frame(si);
                const ox = fi.x + fi.nx * this.offset, oz = fi.z + fi.nz * this.offset;
                if ((ox - cx) ** 2 + (oz - cz) ** 2 > R * R) continue;
                if (Math.abs(this.roadY(si) - y) > 1.2) continue;     // a otra altura (p. ej. horquilla superior)
                if (this.airAt(si) > 0.35) continue;
                hit = true; break;
            }
        }
        this._overlapCache.set(key, hit);
        return hit;
    }

    // onlyOverlaps: dibuja justo los trozos que se saltan por solaparse con otro tramo
    _ribbon(width, lift, material, uv, offset = 0, onlyOverlaps = false) {
        const step = 0.6;
        const n = Math.ceil(this.roadEnd / step) + 1;
        const pos = new Float32Array(n * 2 * 3), uvs = new Float32Array(n * 2 * 2);
        const idx = [];
        const f = {};
        for (let i = 0; i < n; i++) {
            const s = Math.min(i * step, this.roadEnd);
            this.frame(s, f);
            const y = this.roadY(s) + lift;
            for (let j = 0; j < 2; j++) {
                const side = offset + (j === 0 ? -1 : 1) * width / 2;
                const o = (i * 2 + j) * 3;
                pos[o] = f.x + f.nx * side; pos[o + 1] = y; pos[o + 2] = f.z + f.nz * side;
                uvs[(i * 2 + j) * 2] = j;
                uvs[(i * 2 + j) * 2 + 1] = s / (width * 2);
            }
            const flying = this.airAt(s) > 0.35 || this.airAt(Math.max(0, s - step)) > 0.35;
            if (i > 0 && !flying && this._overlaps(s) === onlyOverlaps && this.rib[this._index(s)] && this.rib[this._index(Math.max(0, s - step))]) {
                const a = (i - 1) * 2, b = i * 2;
                idx.push(a, a + 1, b, a + 1, b + 1, b);
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        if (idx.length && geo.attributes.normal.getY(idx[0]) < 0) {
            for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
            geo.setIndex(idx);
            geo.computeVertexNormals();
        }
        return new THREE.Mesh(geo, material);
    }

    // Puentes: barandillas, canto del tablero y pilares donde la carretera va sobre el mar
    _bridges() {
        const g = new THREE.Group();
        const posts = [], pillars = [];
        const f = {};
        const halfL = this.leftEdge + 0.55, halfR = this.rightEdge + 0.55;
        const postGeo = new THREE.BoxGeometry(0.14, 0.6, 0.14);
        const pillarGeo = new THREE.CylinderGeometry(0.45, 0.6, 1, 10);
        const m4 = new THREE.Matrix4();
        let lastPillar = -99;
        const onBridge = s => this.islandWeight(s) < 0.6 && this.regionAt(s).type !== 'flight' && this.regionAt(s).type !== 'space';
        for (let s = 0; s < this.roadEnd; s += 1.6) {
            if (!onBridge(s)) continue;
            this.frame(s, f);
            const y = this.roadY(s);
            for (const side of [-halfL, halfR]) {
                m4.makeTranslation(f.x + f.nx * side, y + 0.4, f.z + f.nz * side);
                posts.push(postGeo.clone().applyMatrix4(m4));
            }
            if (s - lastPillar > 8) {
                lastPillar = s;
                const hgt = y + 3.5;
                m4.compose(new THREE.Vector3(f.x + f.nx * this.offset, y - hgt / 2, f.z + f.nz * this.offset), new THREE.Quaternion(), new THREE.Vector3(1, hgt, 1));
                pillars.push(pillarGeo.clone().applyMatrix4(m4));
            }
        }
        const rail = (side, y0, y1, color) => {
            const pts = [], idx = [];
            let n = 0;
            for (let s = 0; s < this.roadEnd; s += 0.8) {
                if (!onBridge(s)) { n = 0; continue; }
                this.frame(s, f);
                const y = this.roadY(s);
                const x = f.x + f.nx * side, z = f.z + f.nz * side;
                pts.push(x, y + y0, z, x, y + y1, z);
                const b = pts.length / 3 - 2;
                if (n > 0) idx.push(b - 2, b, b - 1, b - 1, b, b + 1);
                n++;
            }
            if (!pts.length) return;
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
            geo.setIndex(idx);
            geo.computeVertexNormals();
            g.add(new THREE.Mesh(geo, toon(color, { side: THREE.DoubleSide })));
        };
        rail(halfR, 0.55, 0.75, '#ffffff');
        rail(-halfL, 0.55, 0.75, '#ffffff');
        rail(this.rightEdge + 0.6, -0.6, 0.06, '#d9d2c3');
        rail(-this.leftEdge - 0.6, -0.6, 0.06, '#d9d2c3');
        if (posts.length) g.add(new THREE.Mesh(mergeAll(posts), toon('#ffffff')));
        if (pillars.length) g.add(new THREE.Mesh(mergeAll(pillars), toon('#d9d2c3')));
        g.traverse(o => { if (o.isMesh) o.castShadow = true; });
        return g;
    }
}

// ---------------------------------------------------------------------------------
// Rotonda (se circula en sentido antihorario, como en España): entrada girando a la derecha,
// vuelta alrededor de la isleta y salida. exit = giro neto (0 recto, -π/2 izquierda).
function buildRoundabout({ R = 7, exit = 0, al = 0.75, approach = 10 } = {}) {
    const pts = [];
    let a = 0, b = 0, th = 0, s = 0;
    pts.push({ a, b, s, ribbon: true });
    const straight = (len, ribbon = true) => {
        const n = Math.max(1, Math.round(len / STEP));
        for (let i = 0; i < n; i++) { a += Math.cos(th) * len / n; b += Math.sin(th) * len / n; s += len / n; pts.push({ a, b, s, ribbon }); }
    };
    const arc = (radius, angle, ribbon = true) => {
        const len = Math.abs(angle) * radius;
        const n = Math.max(2, Math.round(len / STEP));
        for (let i = 0; i < n; i++) { th += angle / n; a += Math.cos(th) * len / n; b += Math.sin(th) * len / n; s += len / n; pts.push({ a, b, s, ribbon }); }
    };
    straight(approach);
    arc(4, al);
    const center = { a: a + R * Math.sin(th), b: b - R * Math.cos(th) };   // a la izquierda
    const enterAngle = Math.atan2(a - center.a, b - center.b);
    arc(R, exit - 2 * al, false);          // por el anillo (se dibuja el anillo entero aparte)
    arc(4, al);
    straight(approach);
    return { pts, length: s, endHeading: th, center, R, enterAngle, exit };
}

// Plan del vuelo: pista de despegue (autopista), subida, crucero sobre el mar y aterrizaje
function flightPlan(opt = {}) {
    const k = opt.scale ?? 1;
    return [
        { type: 'highway', len: 80, runway: true },
        { type: 'climb', len: 60 },
        { type: 'cruise', len: 240 * k },
        { type: 'descent', len: 80 }
    ];
}

// Plan del viaje espacial: plataforma de lanzamiento, despegue con cohetes, órbita y reentrada
function spacePlan(opt = {}) {
    const k = opt.scale ?? 1;
    return [
        { type: 'highway', len: 80, launchpad: true },
        { type: 'launch', len: 90 },
        { type: 'orbit', len: 320 * k },
        { type: 'reentry', len: 120 }
    ];
}

// Plan del viaje largo (de la ciudad a Valencia): carreteras, rotondas, autopista, peaje...
// opt.plan = 'sur': Villena → Málaga por la A-7 (olivares, toro de Osborne, pueblo blanco...)
function roadtripPlan(opt = {}) {
    const k = opt.scale ?? 1;
    // AP-7 hacia La Jonquera: autopista ancha (3 carriles por sentido) y larga
    if (opt.plan === 'ap7') return [
        { type: 'road', len: 40 * k, scene: ['leavingAp7'] },
        { type: 'highway', len: 150 * k, wide: true, scene: ['billboard:8', 'exit3'] },
        { type: 'highway', len: 140 * k, wide: true, scene: ['billboard:2'] },
        { type: 'highway', len: 150 * k, wide: true, scene: ['billboard:9', 'exit4'] },
        { type: 'highway', len: 90 * k, wide: true, scene: [] }
    ];
    if (opt.plan === 'sur') return [
        { type: 'road', len: 45 * k, scene: ['leavingSur'] },
        { type: 'roundabout', geo: buildRoundabout({ exit: Math.PI / 2 }), label: 'A-31' },
        { type: 'road', len: 40 * k, scene: [] },
        { type: 'highway', len: 120 * k, scene: ['olives', 'billboard:5'] },
        { type: 'highway', len: 105 * k, scene: ['toro', 'gas'] },
        { type: 'highway', len: 110 * k, scene: ['pueblo', 'billboard:6'] },
        { type: 'highway', len: 95 * k, scene: ['sunflowers', 'area'] },
        { type: 'highway', len: 80 * k, scene: ['billboard:7', 'just-married'] },
        { type: 'road', len: 30 * k, scene: [] },
        { type: 'roundabout', geo: buildRoundabout({ exit: -Math.PI / 2 }), label: 'Málaga' },
        { type: 'road', len: 55 * k, scene: ['welcomeSur'] }
    ];
    return [
        { type: 'road', len: 50 * k, scene: ['leaving'] },
        { type: 'roundabout', geo: buildRoundabout({ exit: 0 }), label: 'AP-7' },
        { type: 'road', len: 45 * k, scene: ['vineyard'] },
        { type: 'highway', len: 110 * k, scene: ['exit', 'billboard:0', 'sunflowers'] },
        { type: 'highway', len: 100 * k, scene: ['gas', 'billboard:1'] },
        { type: 'highway', len: 95 * k, scene: ['balloon', 'picnic', 'billboard:2'] },
        { type: 'toll', len: 34 },
        { type: 'highway', len: 120 * k, scene: ['area', 'plane', 'exit2', 'billboard:3'] },
        { type: 'highway', len: 80 * k, scene: ['billboard:4', 'just-married'] },
        { type: 'road', len: 30 * k, scene: [] },
        { type: 'roundabout', geo: buildRoundabout({ exit: -Math.PI / 2 }), label: 'València' },
        { type: 'road', len: 60 * k, scene: ['oranges', 'welcome'] }
    ];
}

// ---------------------------------------------------------------------------------
// Carretera de montaña: subida en zigzag (horquillas), rotonda en la cima alrededor del
// monasterio y bajada por el mismo camino (por el otro carril); al llegar abajo sale en T hacia la derecha.
// Coordenadas locales: a = adelante, b = derecha. Devuelve puntos cada STEP con
// u (fracción de altura 0..1) y ribbon (si hay que dibujar asfalto ahí).
function buildMountain({ legs = 7, legLength = 34, spacing = 10.5, height = 38 } = {}) {
    const pts = [];
    let a = 0, b = 0, th = 0, s = 0;   // dirección = (cos th, sin th) en (a, b)
    const seg = [];                     // tramos para poder recorrerlos al revés
    const add = (u, ribbon) => pts.push({ a, b, s, u, ribbon });
    const straight = (len, uFn, ribbon = true, rec = true) => {
        const n = Math.max(1, Math.round(len / STEP));
        const start = pts.length;
        for (let i = 0; i < n; i++) {
            a += Math.cos(th) * len / n; b += Math.sin(th) * len / n; s += len / n;
            add(uFn(), ribbon);
        }
        if (rec) seg.push([start, pts.length]);
    };
    const arc = (radius, angle, uFn, ribbon = true, rec = true) => {
        const len = Math.abs(angle) * radius;
        const n = Math.max(2, Math.round(len / STEP));
        const start = pts.length;
        for (let i = 0; i < n; i++) {
            th += angle / n;
            a += Math.cos(th) * len / n; b += Math.sin(th) * len / n; s += len / n;
            add(uFn(), ribbon);
        }
        if (rec) seg.push([start, pts.length]);
    };
    const zero = () => 0;
    pts.push({ a: 0, b: 0, s: 0, u: 0, ribbon: true });
    // Aproximación y giro a la izquierda hacia el primer tramo
    straight(6, zero, true, false);
    arc(5, -Math.PI / 2, zero, true, false);
    const climbStart = s;
    // Longitud total de la subida para repartir la altura
    const climbLen = legs * legLength + (legs - 1) * Math.PI * spacing / 2 + Math.PI / 2 * 5 + 5;
    const up = () => THREE.MathUtils.smoothstep((s - climbStart) / climbLen, 0, 1);
    const upStart = pts.length;
    for (let k = 0; k < legs; k++) {
        straight(legLength, up);
        if (k < legs - 1) arc(spacing / 2, (k % 2 === 0 ? 1 : -1) * Math.PI, up);
    }
    // Último giro hacia la cima y entrada a la plaza
    arc(5, (legs - 1) % 2 === 0 ? Math.PI / 2 : -Math.PI / 2, up);
    straight(5, () => 1);
    const upEnd = pts.length;
    const summitS = s;
    const T = { a, b };
    // Rotonda de vuelta alrededor del monasterio: derecha α, izquierda 180+2α, derecha α. Acaba un
    // carril a la izquierda de donde empezó (lateral = 2r(1-cos α) - 2R cos α = -carril), para que la
    // bajada vaya por su carril derecho (antes repetía el trazado de la subida: bajaba por el izquierdo)
    const lane = CONFIG.road.lane, r1 = 4, R = 7;
    const al = Math.acos((2 * r1 + lane) / (2 * r1 + 2 * R));
    const one = () => 1;
    const loopStart = pts.length, sLoop = s, thT = th;
    arc(r1, al, one, true, false);
    // Centro del círculo grande (a la izquierda de la marcha): ahí va el monasterio
    const plaza = { a: a + R * Math.sin(th), b: b - R * Math.cos(th) };
    arc(R, -(Math.PI + 2 * al), one, true, false);
    arc(r1, al, one, true, false);
    // corrige el pequeño error de la discretización para acabar justo en el carril de bajada
    const ea = T.a + lane * Math.sin(thT) - a, eb = T.b - lane * Math.cos(thT) - b;
    for (let i = loopStart; i < pts.length; i++) {
        const k = THREE.MathUtils.smoothstep((pts[i].s - sLoop) / (s - sLoop), 0, 1);
        pts[i].a += ea * k; pts[i].b += eb * k;
    }
    // Bajada: el trazado de la subida al revés, desplazado un carril a su izquierda (el carril derecho
    // de quien baja), sin volver a dibujar el asfalto
    for (let i = upEnd - 2; i >= upStart; i--) {
        const p = pts[i], n0 = pts[Math.max(upStart, i - 1)], n1 = pts[i + 1];
        const ta = n1.a - n0.a, tb = n1.b - n0.b, tl = Math.hypot(ta, tb) || 1;
        const qa = p.a + lane * tb / tl, qb = p.b - lane * ta / tl;     // izquierda de (ta, tb)
        const prev = pts[pts.length - 1];
        s += Math.hypot(qa - prev.a, qb - prev.b);
        pts.push({ a: qa, b: qb, s, u: p.u, ribbon: false });
    }
    a = pts[pts.length - 1].a; b = pts[pts.length - 1].b;
    // Abajo, en vez de volver por la aproximación, seguimos recto (cruce en T) y giramos
    const last = pts[pts.length - 1], prev = pts[pts.length - 2];
    th = Math.atan2(last.b - prev.b, last.a - prev.a);
    straight(16, zero, true, false);
    arc(6, -Math.PI / 2 * Math.sign(Math.sin(th)), zero, true, false);
    straight(10, zero, true, false);
    // alejarse de la montaña (que queda a la izquierda)
    arc(30, 0.6, zero, true, false);
    straight(20, zero, true, false);
    // Datos de la cresta: la montaña ocupa la zona del zigzag (a la izquierda)
    let amin = 1e9, amax = -1e9, bmin = 1e9, bmax = -1e9;
    for (let i = upStart; i < upEnd; i++) { const p = pts[i]; amin = Math.min(amin, p.a); amax = Math.max(amax, p.a); bmin = Math.min(bmin, p.b); bmax = Math.max(bmax, p.b); }
    const ridge = { a0: amin - 14, a1: amax + 2, a2: amax + 24, a3: amax + 40, bc: (bmin + bmax) / 2, halfW: (bmax - bmin) / 2 + 2, fall: 12 };
    // La cima debe cubrir la rotonda
    ridge.halfW = Math.max(ridge.halfW, Math.abs(plaza.b - ridge.bc) + 10);
    return { pts, length: s, summitS, height, ridge, endHeading: th, summit: T, plaza };
}

// Fusión simple de geometrías indexadas (posición + normal)
export { roadTexture, roadTexture3 };
export function mergeAll(geos) {
    let vCount = 0, iCount = 0;
    for (const g of geos) { vCount += g.attributes.position.count; iCount += g.index.count; }
    const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), idx = new Uint32Array(iCount);
    let vo = 0, io = 0;
    for (const g of geos) {
        pos.set(g.attributes.position.array, vo * 3);
        nor.set(g.attributes.normal.array, vo * 3);
        const ia = g.index.array;
        for (let i = 0; i < ia.length; i++) idx[io + i] = ia[i] + vo;
        vo += g.attributes.position.count; io += ia.length;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
}

// Calzada de 3 carriles (autopista): bordes blancos continuos y separadores blancos discontinuos
function roadTexture3() {
    const c = document.createElement('canvas');
    c.width = 192; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#5d6275'; g.fillRect(0, 0, 192, 256);
    g.fillStyle = '#ffffff'; g.fillRect(6, 0, 7, 256); g.fillRect(179, 0, 7, 256);
    g.fillRect(61, 20, 6, 120); g.fillRect(125, 20, 6, 120);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
}

function roadTexture() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#5d6275'; g.fillRect(0, 0, 128, 256);
    g.fillStyle = '#ffffff'; g.fillRect(6, 0, 7, 256); g.fillRect(115, 0, 7, 256);
    g.fillStyle = '#ffd23f'; g.fillRect(60, 30, 8, 110);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
}
