// El Tesla: carga, materiales cartoon, conducción a lo largo de la carretera y humito.
import * as THREE from 'three';
import { CONFIG, URLP } from './config.js';
import { loadModel, toon, heartGeometry } from './assets.js';

// Colores cartoon según el nombre del material del modelo original
const PAINT = [
    [/^primary|putih|door_lf/i, { color: '#f4f6fb', body: true }],
    [/glass/i, { color: '#25324f', transparent: true, opacity: 0.82 }],
    [/black|hitam|front_black|chassis|suspensi|plastic|carpet|belt/i, { color: '#1e2130' }],
    [/wheels\.(0|2)|hub/i, { color: '#2a2d3a' }],
    [/wheels|aluminium|chrome|mirror/i, { color: '#c7ccd8' }],
    [/rear_light|breaklight|revlight|tembus_red|satin_red|indicator_.r/i, { color: '#ff3355', emissive: '#c0103a' }],
    [/front_light|foglight|light_night|indicator_.f|pantulan/i, { color: '#ffffff', emissive: '#fff4c8' }],
    [/seat_leather/i, { color: '#f4efe8' }],
    [/lcd/i, { color: '#7ad7ff', emissive: '#2a6c9a' }]
];

// En el modelo, los pilotos rojos comparten malla con los faros delanteros (salían dos manchas rojas
// en el morro): los triángulos del frontal se separan en otra malla. La tulipa (tembus = translúcido)
// pasa a cristal ahumado y lo de dentro a LED blanco, como los faros de un Model 3.
const RED_LIGHT = /rear_light|breaklight|revlight|tembus_red|satin_red|indicator_.r/i;
function fixFrontLights(holder, glow = 0.8) {
    const lens = toon('#2d3a52', { transparent: true, opacity: 0.58, depthWrite: false });
    const led = toon('#ffffff', { emissive: new THREE.Color('#fff6e0'), emissiveIntensity: glow });
    holder.updateMatrixWorld(true);
    const inv = holder.matrixWorld.clone().invert();
    const reds = [];
    holder.traverse(o => { if (o.isMesh && RED_LIGHT.test(o.material.name)) reds.push(o); });
    const v = new THREE.Vector3(), m = new THREE.Matrix4(), edge = CONFIG.car.length * 0.25;
    for (const o of reds) {
        const g = o.geometry, pos = g.attributes.position;
        m.multiplyMatrices(inv, o.matrixWorld);
        const z = new Float32Array(pos.count);
        for (let i = 0; i < pos.count; i++) z[i] = v.fromBufferAttribute(pos, i).applyMatrix4(m).z;
        const idx = g.index ? g.index.array : Array.from({ length: pos.count }, (_, i) => i);
        const front = [], rest = [];
        for (let i = 0; i < idx.length; i += 3) (z[idx[i]] + z[idx[i + 1]] + z[idx[i + 2]] > 3 * edge ? front : rest).push(idx[i], idx[i + 1], idx[i + 2]);
        if (!front.length) continue;
        // geometrías nuevas que comparten los atributos (el modelo original se clona en otros sitios)
        const part = tris => { const ng = new THREE.BufferGeometry(); for (const k in g.attributes) ng.setAttribute(k, g.attributes[k]); ng.setIndex(tris); return ng; };
        o.geometry = part(rest);
        const isLens = /tembus/i.test(o.material.name);
        const f = new THREE.Mesh(part(front), isLens ? lens : led);
        f.castShadow = !isLens;
        if (isLens) f.renderOrder = 2;
        o.add(f);
    }
}

// Tesla aparcado (versión ligera del modelo) del color que se quiera
export async function parkedTesla(color = '#d7263d', { full = false } = {}) {
    const src = await loadModel(full ? 'tesla' : 'tesla-lod');
    const car = src.clone(true);
    const body = toon(color, {});
    const cache = new Map();
    car.traverse(o => {
        if (!o.isMesh) return;
        const name = o.material.name || '';
        if (!cache.has(name)) {
            const rule = PAINT.find(([re]) => re.test(name));
            let m = o.material;
            if (rule) {
                const r = rule[1];
                m = r.body ? body : toon(r.color, { transparent: !!r.transparent, opacity: r.opacity ?? 1 });
                if (r.emissive) { m.emissive = new THREE.Color(r.emissive); m.emissiveIntensity = 0.5; }
            } else if (/^primary/i.test(name) || !name) m = body;
            cache.set(name, m);
        }
        o.material = cache.get(name);
        o.castShadow = true;
    });
    car.scale.setScalar(1);
    car.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(car, true);
    const size = box.getSize(new THREE.Vector3());
    car.scale.setScalar(CONFIG.car.length / Math.max(size.z, size.x));
    car.updateMatrixWorld(true);
    box.setFromObject(car, true);
    const c = box.getCenter(new THREE.Vector3());
    car.position.set(-c.x, -box.min.y, -c.z);
    const holder = new THREE.Group();
    const flip = new THREE.Group(); flip.add(car);
    if (CONFIG.car.forwardSign < 0) flip.rotation.y = Math.PI;
    holder.add(flip);
    fixFrontLights(holder, 0.6);
    return holder;
}

export class Car {
    constructor(engine, track) {
        this.engine = engine;
        this.track = track;
        this.root = new THREE.Group();     // posición y rumbo en la carretera
        this.body = new THREE.Group();     // botes, cabeceos
        this.root.add(this.body);
        engine.scene.add(this.root);
        this.s = track.startS;
        this.v = 0;
        this.speed = 0;
        this.moving = false;
        this.pitch = 0; this.pitchV = 0; this.roll = 0; this.rollV = 0; this.slip = 0;
        this.lateral = 0;   // desplazamiento lateral respecto al carril (maniobras de aparcamiento)
        this.yaw = 0;       // giro extra respecto a la carretera
        this.man = null;
        this.puffs = [];
        this.puffGeo = new THREE.IcosahedronGeometry(0.16, 1);
        this.puffMat = new THREE.MeshBasicMaterial({ color: 0xfffaf0, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
        engine.onUpdate((dt, t) => this._update(dt, t));
    }

    async load() {
        const src = await loadModel('tesla');
        const car = src.clone(true);
        // Materiales cartoon por nombre
        const cache = new Map();
        car.traverse(o => {
            if (!o.isMesh) return;
            const name = o.material.name || '';
            if (!cache.has(name)) {
                const rule = PAINT.find(([re]) => re.test(name));
                let m;
                if (rule) {
                    const r = rule[1];
                    m = toon(r.color, { transparent: !!r.transparent, opacity: r.opacity ?? 1 });
                    if (r.emissive) { m.emissive = new THREE.Color(r.emissive); m.emissiveIntensity = 0.8; }
                    // Carrocería: blanco limpio (la malla simplificada da sombreados irregulares)
                    if (r.body) { m.emissive = new THREE.Color('#ffffff'); m.emissiveIntensity = 0.32; }
                } else {
                    m = o.material; // conserva textura (botones, matrícula...)
                }
                m.name = name;
                cache.set(name, m);
            }
            o.material = cache.get(name);
            o.castShadow = true;
            o.receiveShadow = false;
        });
        // Normalizar tamaño y apoyarlo en el suelo
        // Caja PRECISA (vértice a vértice): con la geometría cuantizada del modelo optimizado,
        // la caja aproximada es mucho mayor que el coche y lo dejaba flotando.
        car.scale.setScalar(1);
        car.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(car, true);
        const size = box.getSize(new THREE.Vector3());
        const s = CONFIG.car.length / Math.max(size.z, size.x);
        car.scale.setScalar(s);
        car.updateMatrixWorld(true);
        box.setFromObject(car, true);
        const center = box.getCenter(new THREE.Vector3());
        car.position.set(-center.x, -box.min.y, -center.z);
        // holder: botes y suspensión · flip: corrige hacia dónde mira el modelo
        const flip = new THREE.Group();
        flip.add(car);
        if (CONFIG.car.forwardSign < 0) flip.rotation.y = Math.PI;
        const holder = new THREE.Group();
        holder.add(flip);
        this.body.add(holder);
        fixFrontLights(holder);
        this.model = car;
        this.size = new THREE.Box3().setFromObject(holder, true).getSize(new THREE.Vector3());

        // Sombra de contacto suave bajo el coche (también en modo ligero)
        const blob = new THREE.Mesh(
            new THREE.CircleGeometry(1, 24),
            new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false })
        );
        blob.rotation.x = -Math.PI / 2;
        blob.scale.set(this.size.x * 0.58, this.size.z * 0.52, 1);
        blob.position.y = 0.035;
        this.root.add(blob);
        this._buildWings(holder);
        this.blob = blob;
        this.place(this.s);
    }

    // Alas de ángel (plegadas) y dos toberas traseras que echan corazones
    _buildWings(holder) {
        const W = new THREE.Group();
        const shape = new THREE.Shape();
        // silueta de ala: de la raíz hacia fuera, con plumas redondeadas en el borde
        shape.moveTo(0, 0);
        shape.bezierCurveTo(0.5, 0.35, 1.2, 0.55, 1.9, 0.5);
        shape.bezierCurveTo(1.75, 0.3, 1.8, 0.15, 1.6, 0.05);
        shape.bezierCurveTo(1.55, -0.12, 1.3, -0.15, 1.15, -0.25);
        shape.bezierCurveTo(1.0, -0.38, 0.75, -0.35, 0.6, -0.42);
        shape.bezierCurveTo(0.4, -0.48, 0.2, -0.3, 0, -0.18);
        shape.closePath();
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 10 });
        geo.rotateX(Math.PI / 2);    // en horizontal (x = envergadura, z = cuerda; borde liso delante)
        const wingMat = toon('#ffffff', { emissive: new THREE.Color('#ffe6f0'), emissiveIntensity: 0.35, side: THREE.DoubleSide });
        const tipMat = toon('#ff7eb3', { emissive: new THREE.Color('#ff7eb3'), emissiveIntensity: 0.3 });
        this.wings = [];
        for (const side of [1, -1]) {
            const pivot = new THREE.Group();
            pivot.position.set(side * 0.48, 0.62, 0.05);
            const w = new THREE.Mesh(geo, wingMat);
            w.scale.set(side, 1, 1);
            pivot.add(w);
            // plumas de color en la punta
            const tip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), tipMat);
            tip.scale.set(1.6, 0.35, 1);
            tip.position.set(side * 1.75, 0.03, -0.05);
            pivot.add(tip);
            pivot.scale.setScalar(0.001);
            W.add(pivot);
            this.wings.push({ pivot, side });
        }
        // Toberas
        this.nozzles = [];
        for (const x of [-0.32, 0.32]) {
            const n = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 0.36, 12, 1, true), toon('#c7ccd8', { side: THREE.DoubleSide }));
            n.rotation.x = Math.PI / 2;
            n.position.set(x, 0.42, -CONFIG.car.length / 2 - 0.05);
            const glowM = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), new THREE.MeshBasicMaterial({ color: 0xff7eb3, toneMapped: false }));
            glowM.position.set(x, 0.42, -CONFIG.car.length / 2 - 0.22);
            glowM.rotation.y = Math.PI;
            n.scale.setScalar(0.001); glowM.scale.setScalar(0.001);
            W.add(n, glowM);
            this.nozzles.push(n, glowM);
        }
        holder.add(W);
        this._buildRockets(holder);
        this.wingK = 0;
        this.hearts = [];
        this.heartMats = ['#ff4d8d', '#ff7eb3', '#ff2e63', '#ffb3c7'].map(c => new THREE.MeshBasicMaterial({ color: c, transparent: true, toneMapped: false }));
    }

    // Segunda transformación: dos cohetes laterales con llamas (para el viaje espacial)
    _buildRockets(holder) {
        const R = new THREE.Group();
        const white = toon('#f4f6fb', { emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.2 });
        const red = toon('#e8173b', { emissive: new THREE.Color('#e8173b'), emissiveIntensity: 0.2 });
        const metal = toon('#9aa3b5');
        const flameO = new THREE.MeshBasicMaterial({ color: 0xff7a2b, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false });
        const flameY = new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.95, toneMapped: false, depthWrite: false });
        this.rockets = [];
        for (const sx of [-1, 1]) {
            const g = new THREE.Group();
            g.position.set(sx * 0.66, 0.5, -0.2);
            const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.2, 14), white); body.rotation.x = Math.PI / 2; g.add(body);
            const band = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.12, 14), red); band.rotation.x = Math.PI / 2; band.position.z = 0.25; g.add(band);
            const nose = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.38, 14), red); nose.rotation.x = Math.PI / 2; nose.position.z = 0.79; g.add(nose);
            for (let k = 0; k < 3; k++) {
                const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.3), red);
                const a = k / 3 * Math.PI * 2 + (sx > 0 ? 0 : Math.PI / 3);
                fin.position.set(Math.cos(a) * 0.17, Math.sin(a) * 0.17, -0.5); fin.rotation.z = a - Math.PI / 2; g.add(fin);
            }
            const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.18, 14, 1, true), metal); nozzle.rotation.x = Math.PI / 2; nozzle.position.z = -0.68; nozzle.material.side = THREE.DoubleSide; g.add(nozzle);
            const fo = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.9, 12), flameO); fo.rotation.x = -Math.PI / 2; fo.position.z = -1.2; g.add(fo);
            const fy = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.55, 10), flameY); fy.rotation.x = -Math.PI / 2; fy.position.z = -1.02; g.add(fy);
            const strut = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.4), metal); strut.position.x = -sx * 0.16; g.add(strut);
            g.scale.setScalar(0.001);
            R.add(g);
            this.rockets.push({ g, fo, fy, sx });
        }
        holder.add(R);
        this.rocketK = 0;
        this.fireMats = ['#ff7a2b', '#ffd23f', '#fff1a8', '#ff4d8d'].map(c => new THREE.MeshBasicMaterial({ color: c, transparent: true, toneMapped: false, depthWrite: false }));
        this.fireGeo = new THREE.IcosahedronGeometry(1, 0);
    }

    _updateWings(dt, time) {
        const st = this.track.flightState(this.s);
        const was = this.wingK;
        this.wingK += ((st.wings ? 1 : 0) - this.wingK) * Math.min(1, dt * 3);
        if (was < 0.05 && this.wingK >= 0.05 && st.wings && window.sfx && window.sfx.takeoff) window.sfx.takeoff();
        const k = this.wingK;
        const airborne = st.air > 0.4;
        for (const { pivot, side } of this.wings) {
            pivot.scale.setScalar(Math.max(0.001, k));
            // aleteo suave en el aire, alas un poco levantadas en tierra
            const flap = airborne ? Math.sin(time * 5.5) * 0.28 : 0.15;
            pivot.rotation.z = side * (flap + (1 - k) * 1.2);
        }
        for (const n of this.nozzles) n.scale.setScalar(Math.max(0.001, k));
        if (this.blob) this.blob.visible = st.air < 0.3;
        // Cohetes
        const wasR = this.rocketK;
        this.rocketK += ((st.rockets ? 1 : 0) - this.rocketK) * Math.min(1, dt * 2.5);
        if (wasR < 0.05 && this.rocketK >= 0.05 && st.rockets && window.sfx) (window.sfx.launch || window.sfx.takeoff)();
        const rk = this.rocketK, thrust = Math.min(1, this.v / 12);
        for (const r of this.rockets) {
            r.g.scale.setScalar(Math.max(0.001, rk));
            const fl = (0.55 + thrust * 0.9) * (0.85 + Math.random() * 0.3);
            r.fo.scale.set(1, fl, 1); r.fy.scale.set(1, fl * (0.9 + Math.random() * 0.2), 1);
            r.fo.position.z = -0.68 - 0.45 * fl; r.fy.position.z = -0.68 - 0.3 * fl;
        }
        this._fireT = (this._fireT || 0) - dt;
        if (rk > 0.6 && this.v > 3 && this._fireT <= 0) {
            this._fireT = 0.035;
            for (const r of this.rockets) {
                const isHeart = Math.random() < 0.25;
                const m = isHeart ? new THREE.Mesh(heartGeometry(), this.heartMats[Math.floor(Math.random() * 4)].clone()) : new THREE.Mesh(this.fireGeo, this.fireMats[Math.floor(Math.random() * 4)].clone());
                const sc = isHeart ? 0.08 + Math.random() * 0.05 : 0.07 + Math.random() * 0.07;
                m.scale.setScalar(sc);
                const local = new THREE.Vector3(r.sx * 0.66, 0.5, -0.2 - 1.3);
                this.body.children[0].localToWorld(local);
                m.position.copy(local);
                m.userData = { life: 0, sc, vel: new THREE.Vector3((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2) };
                this.engine.scene.add(m);
                this.hearts.push(m);
            }
        }
        // Corazones por las toberas
        this._heartT = (this._heartT || 0) - dt;
        if (k > 0.6 && this.v > 4 && this._heartT <= 0) {
            this._heartT = airborne ? 0.045 : 0.09;
            for (const x of [-0.32, 0.32]) {
                const h = new THREE.Mesh(heartGeometry(), this.heartMats[Math.floor(Math.random() * 4)]);
                h.material = h.material.clone();
                const sc = 0.07 + Math.random() * 0.06;
                h.scale.setScalar(sc);
                const local = new THREE.Vector3(x, 0.42, -CONFIG.car.length / 2 - 0.3);
                this.body.children[0].localToWorld(local);
                h.position.copy(local);
                h.lookAt(this.engine.camera.position);
                h.userData = { life: 0, sc, vel: new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8) };
                this.engine.scene.add(h);
                this.hearts.push(h);
            }
        }
        for (let i = this.hearts.length - 1; i >= 0; i--) {
            const h = this.hearts[i];
            h.userData.life += dt;
            const l = h.userData.life / 1.6;
            h.position.addScaledVector(h.userData.vel, dt);
            h.scale.setScalar(h.userData.sc * (1 + l * 1.5));
            h.material.opacity = 1 - l;
            h.lookAt(this.engine.camera.position);
            if (l >= 1) { this.engine.scene.remove(h); h.material.dispose(); this.hearts.splice(i, 1); }
        }
    }

    // Coloca el coche directamente en s (sin animar)
    place(s) {
        this.s = s;
        this.v = 0;
        this.drive = null;
        this.man = null;
        this.lateral = 0; this.yaw = 0;
        this._pose(0);
    }

    // --- Aparcamiento en una plaza perpendicular a la derecha (P = { s, R, d }) ---------
    // Marcha atrás girando (la trasera entra en la plaza) y luego recto hasta el fondo.
    async park(P) {
        const { s, R, d } = P;
        if (window.sfx) window.sfx.tap();
        await this._maneuver(u => { const th = u * Math.PI / 2; return { s: s - R * Math.sin(th), lateral: R * (1 - Math.cos(th)), yaw: th }; }, 3.6);
        await this._maneuver(u => ({ s: s - R, lateral: R + d * u, yaw: Math.PI / 2 }), 1.4);
    }
    placeParked(P) {
        this.place(P.s - P.R);
        this.lateral = P.R + P.d; this.yaw = Math.PI / 2;
        this._pose(0);
    }
    // Salida: recto hacia la carretera y giro a la derecha hasta el carril
    // (arco con centro en (s, R): sale de la plaza mirando a la carretera y acaba alineado en s)
    async unpark(P) {
        const { s, R, d } = P;
        await this._maneuver(u => ({ s: s - R, lateral: R + d * (1 - u), yaw: Math.PI / 2 }), 1.2);
        await this._maneuver(u => { const ph = u * Math.PI / 2; return { s: s - R * Math.cos(ph), lateral: R * (1 - Math.sin(ph)), yaw: Math.PI / 2 - ph }; }, 3.2);
        this.lateral = 0; this.yaw = 0;
    }
    _maneuver(fn, dur) {
        if (URLP.fast) dur *= 0.3;
        return new Promise(res => { this.man = { fn, t: 0, dur, res }; this.drive = null; });
    }

    // Conducción libre (examen de circulación, final de la Parte 2): posición, rumbo y velocidad los pone
    // game/exam.js cada fotograma → { pos: Vector3, h, v, acc, yawRate, dist }. null = volver a la carretera.
    setFree(pose) {
        this.free = pose;
        this.drive = null; this.man = null;
        if (!pose) { this.v = 0; this.slip = 0; this.place(this.s); }
    }

    // Rumbo, pendiente y suspensión
    _pose(dt) {
        if (this.free) {
            this.root.position.copy(this.free.pos);
            this.root.rotation.set(0, this.free.h + this.slip, 0);
            this.body.rotation.x = 0;
            return;
        }
        const t = this.track;
        const p = t.point(this.s, this.lateral);
        if (this.lateral) {
            // fuera del carril (aparcamiento): sobre el terreno llano del aparcamiento
            const k = THREE.MathUtils.smoothstep(Math.abs(this.lateral), 1, 3);
            p.y = THREE.MathUtils.lerp(t.roadY(this.s) + 0.1, t.heightAt(p.x, p.z) + 0.07, k);
        } else p.y = t.roadY(this.s) + 0.1;   // el asfalto está a +0.12: los neumáticos se asientan un poco
        this.root.position.copy(p);
        const ahead = t.point(this.s + 1.2, 0), behind = t.point(this.s - 1.2, 0);
        // Pequeño derrape de dibujos animados: el morro se abre un poco en las curvas
        this.root.rotation.set(0, t.headingAt(this.s) + this.slip + this.yaw, 0);
        this.body.rotation.x = THREE.MathUtils.clamp(-Math.atan2(ahead.y - behind.y, 2.4), -0.45, 0.45);
    }

    // Conduce hasta s con física: acelera, respeta las curvas y frena justo a tiempo.
    // Devuelve una promesa que se resuelve al detenerse.
    // speed puede ser un número o una función de s (más rápido en los tramos de viaje)
    driveTo(targetS, { speed = CONFIG.car.speed } = {}) {
        return new Promise(resolve => {
            if (targetS - this.s < 0.02) { resolve(); return; }
            this.drive = { to: targetS, vmax: speed, resolve };
            this.moving = true;
            if (window.sfx) window.sfx.next();
        });
    }

    honk() { if (window.sfx) window.sfx.honk(); this.hop = 1; }
    jump() { this.hop = 1; }
    shake() { this.shakeT = 0.5; }

    // Velocidad máxima por las curvas que vienen
    _curveLimit() {
        const C = CONFIG.car;
        let k = 0;
        for (let d = 0; d <= 14; d += 2) k = Math.max(k, Math.abs(this.track.curvature(this.s + d)));
        return Math.sqrt(C.lateralGrip / Math.max(k, 1e-4));
    }

    _update(dt, time) {
        if (!this.model) return;
        const C = CONFIG.car;
        const fast = URLP.fast ? 3 : 1;
        let acc = 0;
        if (this.free) {
            acc = this.free.acc || 0;
            this.v = Math.abs(this.free.v || 0);
        } else if (this.man) {
            const m = this.man;
            m.t = Math.min(m.dur, m.t + dt);
            const k = m.t / m.dur, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
            const prevS = this.s, prevL = this.lateral;
            const pose = m.fn(e);
            this.s = pose.s; this.lateral = pose.lateral; this.yaw = pose.yaw;
            this.v = Math.hypot(this.s - prevS, this.lateral - prevL) / Math.max(dt, 1e-4);
            this.slip = 0;
            if (m.t >= m.dur) { this.man = null; this.v = 0; m.res(); }
        } else if (this.drive) {
            const d = this.drive;
            const rem = d.to - this.s;
            const vBrake = Math.sqrt(2 * C.brake * fast * Math.max(rem - 0.05, 0));
            // Zonas de velocidad: mirar por delante para frenar a tiempo (peajes, rotondas, llegadas)
            let vmax;
            if (typeof d.vmax === 'function') {
                vmax = Infinity;
                for (let ahead = 0; ahead <= 48; ahead += 4) {
                    const vz = d.vmax(this.s + ahead) * fast;
                    vmax = Math.min(vmax, Math.sqrt(vz * vz + 2 * C.brake * fast * ahead));
                }
            } else vmax = d.vmax * fast;
            const vT = Math.min(vmax, vBrake, this._curveLimit() * fast);
            acc = THREE.MathUtils.clamp((vT - this.v) * 3, -C.brake * 1.5 * fast, C.accel * fast);
            this.v = Math.max(0, this.v + acc * dt);
            this.s = Math.min(d.to, this.s + this.v * dt);
            if (d.to - this.s < 0.03 && this.v < 0.6) {
                this.s = d.to; this.v = 0;
                this.drive = null;
                this.moving = false;
                d.resolve();
            }
        } else {
            acc = -this.v * 4;
            this.v = Math.max(0, this.v + acc * dt);
        }
        this.acc = acc;
        this.speed = this.v;

        // Suspensión: muelle amortiguado para cabeceo (aceleración) y balanceo (curvas)
        const k = 70, c = 8.5;
        const lat = this.free ? -this.v * (this.free.yawRate || 0) : this.v * this.v * this.track.curvature(this.s);   // + derecha
        // Sutil: ruedas y carrocería son una sola malla, así que cabecear mucho levantaría un eje del suelo
        const pitchT = THREE.MathUtils.clamp(-acc * 0.006, -0.03, 0.03);
        const rollT = THREE.MathUtils.clamp(lat * 0.006, -0.035, 0.035);
        this.pitchV += (k * (pitchT - this.pitch) - c * this.pitchV) * dt;
        this.rollV += (k * (rollT - this.roll) - c * this.rollV) * dt;
        this.pitch += this.pitchV * dt;
        this.roll += this.rollV * dt;
        this.slip += (THREE.MathUtils.clamp(lat * 0.01, -0.12, 0.12) - this.slip) * Math.min(1, dt * 4);
        this._pose(dt);

        // Pequeños baches de la carretera y salto de alegría
        const bs = this.free ? this.free.dist || 0 : this.s;
        const bump = -Math.abs(Math.sin(bs * 2.3) * Math.sin(bs * 0.71)) * 0.012 * Math.min(this.v / 8, 1);
        if (this.hop > 0) this.hop = Math.max(0, this.hop - dt * 2.2);
        const hop = this.hop > 0 ? Math.sin((1 - this.hop) * Math.PI) * 0.22 : 0;
        let shake = 0;
        if (this.shakeT > 0) { this.shakeT -= dt; shake = Math.sin(time * 50) * 0.05 * (this.shakeT / 0.5); }
        const holder = this.body.children[0];
        holder.position.y = bump + hop;
        holder.rotation.set(this.pitch, 0, this.roll + shake);

        if (window.sfx) window.sfx.engine(Math.min(1, this.v / CONFIG.car.highwaySpeed));
        if (this.wings) this._updateWings(dt, time);

        // Polvo al acelerar fuerte 💨
        this._puffTimer = (this._puffTimer || 0) - dt;
        if (!this.free && acc > 2.5 && this.v > 0.5 && this.v < 6 && this._puffTimer <= 0) {
            this._puffTimer = 0.09;
            for (const side of [-0.45, 0.45]) {
                const p = new THREE.Mesh(this.puffGeo, this.puffMat.clone());
                const back = this.track.point(this.s - CONFIG.car.length * 0.45, side);
                p.position.copy(back).y += 0.15;
                p.userData.life = 0;
                this.engine.scene.add(p);
                this.puffs.push(p);
            }
        }
        for (let i = this.puffs.length - 1; i >= 0; i--) {
            const p = this.puffs[i];
            p.userData.life += dt;
            const l = p.userData.life / 0.7;
            p.scale.setScalar(0.5 + l * 1.4);
            p.position.y += dt * 0.5;
            p.material.opacity = 0.55 * (1 - l);
            if (l >= 1) { this.engine.scene.remove(p); p.material.dispose(); this.puffs.splice(i, 1); }
        }
    }
}
