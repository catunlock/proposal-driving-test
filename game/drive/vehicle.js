// ============================================================================
//  VEHÍCULO: física arcade + lo que se ve (ruedas, suspensión, derrapes, turbo)
// ============================================================================
// Física en el plano (x, z) con altura aparte para los saltos:
//   · La velocidad vive en el mundo; cada fotograma el agarre lateral le quita la parte de lado
//     (si el agarre no da para tanto, el coche derrapa). El freno de mano baja mucho el agarre trasero.
//   · El giro sigue el modelo de bicicleta (yaw = v / batalla · tan(dirección)), más suave a mucha velocidad.
//   · En el aire no hay tracción; al caer, pequeño rebote. La gravedad la pone el mapa (Marte: baja).
//   · Choques contra círculos, cajas y muros del mapa (y entre coches): se empuja hacia fuera y se
//     refleja la velocidad con poco rebote. Lo que es más bajo que la altura libre se pisa sin chocar.
// Rumbo h: el coche mira a (sin h, cos h); su derecha es (−cos h, sin h). Dirección > 0 = derecha.
import * as THREE from 'three';

export const KMH = 6.5;                 // unidades/s → km/h
const TAU = Math.PI * 2;
const wrapA = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

// ----------------------------------------------------------------------------
//  Efectos compartidos: marcas de neumático y humo/polvo (con un búfer circular)
// ----------------------------------------------------------------------------
export class Effects {
    constructor(scene) {
        this.scene = scene;
        const N = 600;
        this.skidN = N; this.skidI = 0;
        const g = new THREE.PlaneGeometry(0.22, 0.5); g.rotateX(-Math.PI / 2);
        this.skids = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0x1b1b22, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), N);
        this.skids.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        const zero = new THREE.Matrix4().makeScale(0, 0, 0);
        for (let i = 0; i < N; i++) this.skids.setMatrixAt(i, zero);
        this.skids.frustumCulled = false;
        this.skids.renderOrder = 1;
        scene.add(this.skids);
        this.puffGeo = new THREE.IcosahedronGeometry(0.22, 1);
        this.puffs = [];
        this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3(1, 1, 1); this.p = new THREE.Vector3();
    }
    skid(x, y, z, h) {
        this.p.set(x, y + 0.015, z); this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), h);
        this.m.compose(this.p, this.q, this.s);
        this.skids.setMatrixAt(this.skidI, this.m);
        this.skidI = (this.skidI + 1) % this.skidN;
        this.skids.instanceMatrix.needsUpdate = true;
    }
    puff(x, y, z, color = 0xfffaf0, size = 1, rise = 0.6) {
        if (this.puffs.length > 140) return;
        const p = new THREE.Mesh(this.puffGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false }));
        p.position.set(x, y, z);
        p.userData = { life: 0, size, rise, vx: (Math.random() - 0.5) * 0.8, vz: (Math.random() - 0.5) * 0.8 };
        this.scene.add(p);
        this.puffs.push(p);
    }
    update(dt) {
        for (let i = this.puffs.length - 1; i >= 0; i--) {
            const p = this.puffs[i], u = p.userData;
            u.life += dt;
            const l = u.life / 0.8;
            p.scale.setScalar((0.5 + l * 1.6) * u.size);
            p.position.y += dt * u.rise; p.position.x += u.vx * dt; p.position.z += u.vz * dt;
            p.material.opacity = 0.55 * (1 - l);
            if (l >= 1) { this.scene.remove(p); p.material.dispose(); this.puffs.splice(i, 1); }
        }
    }
    clear() {
        const zero = new THREE.Matrix4().makeScale(0, 0, 0);
        for (let i = 0; i < this.skidN; i++) this.skids.setMatrixAt(i, zero);
        this.skids.instanceMatrix.needsUpdate = true;
        for (const p of this.puffs) { this.scene.remove(p); p.material.dispose(); }
        this.puffs = [];
    }
    dispose() { this.clear(); this.scene.remove(this.skids); }
}

// ----------------------------------------------------------------------------
export class Vehicle {
    // model: de buildCar(); phys: de physicsFor()
    constructor(model, phys, { name = '', color = '#ff4d8d' } = {}) {
        this.model = model;
        this.P = phys;
        this.name = name;
        this.color = color;
        this.root = new THREE.Group();         // posición y rumbo
        this.tilt = new THREE.Group();         // cabeceo, balanceo, botes
        this.root.add(this.tilt);
        this.tilt.add(model.group);
        // sombra de contacto (también en modo ligero)
        const d = model.dims;
        this.blob = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
        this.blob.rotation.x = -Math.PI / 2;
        this.blob.scale.set(d.wid * 0.6, d.len * 0.56, 1);
        this.blob.renderOrder = 1;
        this.root.add(this.blob);
        // turbo: dos llamitas detrás
        this.flames = [];
        const fm = new THREE.MeshBasicMaterial({ color: 0x7ad7ff, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false });
        for (const sx of [-0.28, 0.28]) {
            const f = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 10), fm);
            f.rotation.x = -Math.PI / 2;
            f.position.set(sx * Math.min(1.4, d.wid), 0.35 + (d.clearance - 0.15) * 0.8, -d.len / 2 - 0.3);
            f.visible = false;
            this.tilt.add(f); this.flames.push(f);
        }
        // Huella para los choques: círculos a lo largo del coche
        const r = Math.min(d.wid / 2, d.len / 2) * 0.92;
        const n = Math.max(2, Math.round(d.len / (r * 1.4)));
        this.circles = [];
        for (let i = 0; i < n; i++) this.circles.push({ lz: -d.len / 2 + r + (d.len - 2 * r) * i / (n - 1), r });
        this.radius = Math.hypot(d.len / 2, d.wid / 2);
        this.reset(0, 0, 0);
    }

    reset(x, z, h, y = 0) {
        Object.assign(this, { x, z, h, y, vx: 0, vz: 0, vy: 0, w: 0, steer: 0, revT: 0, air: false, airT: 0, ground: y });
        this.vf = 0; this.vr = 0; this.acc = 0;
        this.spin = 0; this.pitch = 0; this.pitchV = 0; this.roll = 0; this.rollV = 0; this.hop = 0; this.shakeT = 0;
        this.turbo = 1;            // depósito de turbo (0..1)
        this.boostT = 0;           // segundos de turbo activo (botón o placa)
        this.surface = null;
        this.drifting = 0;
        this.lastHit = 0;
        // objetos (game/drive/items.js)
        this.spinT = 0; this.slipT = 0; this.starT = 0; this.shrinkT = 0;
        this.syncVisual();
    }
    // Trompo (plátano, pelota, cohete, choque con una estrella). Con estrella no pasa nada.
    spinOut(dur = 1) {
        if (this.starT > 0 || this.spinT > 0 || this.ghost) return false;
        this.spinT = dur; this.spinDir = Math.random() < 0.5 ? -1 : 1; this.boostT = 0;
        if (this.onSpin) this.onSpin();
        return true;
    }
    get speed() { return Math.hypot(this.vx, this.vz); }
    get kmh() { return Math.abs(this.vf) * KMH; }
    forward() { return [Math.sin(this.h), Math.cos(this.h)]; }

    // inp: { thr, brk, steer, hb, turbo } · W: el circuito (ground, surface, colliders, gravity)
    step(dt, inp, W, others = []) {
        const P = this.P;
        const fx = Math.sin(this.h), fz = Math.cos(this.h), rx = -fz, rz = fx;
        let vf = this.vx * fx + this.vz * fz, vr = this.vx * rx + this.vz * rz;
        const S = this.surface = W.surface(this.x, this.z, this);
        const onGround = !this.air;
        const boosting = this.boostT > 0;
        // objetos: estrella (más rápido, no frena fuera de la pista), rayo (pequeño y lento), aceite (sin agarre)
        const star = this.starT > 0, small = this.shrinkT > 0, spinning = this.spinT > 0;
        if (star) this.starT -= dt;
        if (small) this.shrinkT -= dt;
        if (this.slipT > 0) this.slipT -= dt;
        const fxV = (star ? 1.18 : 1) * (small ? 0.62 : 1), fxA = (star ? 1.3 : 1) * (small ? 0.7 : 1);
        if (inp.turbo && this.turbo > 0.02 && onGround && !boosting && vf > -0.5) { this.boostT = 0.25; }
        if (inp.turbo && boosting && this.turbo > 0) { this.turbo = Math.max(0, this.turbo - dt * 0.55); this.boostT = Math.max(this.boostT, 0.12); }
        else if (!boosting) this.turbo = Math.min(1, this.turbo + dt * 0.07);
        if (boosting) this.boostT -= dt;
        const boost = boosting ? 1.55 : 1;
        const maxV = P.maxV * (star ? Math.max(1, S.cap) : S.cap) * (boosting ? 1.3 : 1) * fxV;
        let acc = 0;
        if (onGround && spinning) {
            // trompo: gira sin control y se va frenando
            this.spinT -= dt;
            const k = Math.max(0, 1 - dt * 2.4); vf *= k; vr *= k;
            this.w = this.spinDir * 12 * Math.min(1, 0.35 + this.spinT * 1.5);
            this.steer *= 0.8; this.drifting = 1;
        } else if (onGround) {
            // Motor y frenos (mismo esquema que el examen: frenar del todo y luego marcha atrás)
            if (vf >= -0.05) {
                if (inp.thr > 0.03) acc += inp.thr * P.accel * fxA * boost * (star ? 1 : S.grip ** 0.5) * (1 - Math.max(0, vf) / maxV * 0.7);
                if (inp.brk > 0.03) {
                    if (vf > 0.25) acc -= inp.brk * P.brake;
                    else { this.revT += dt; if (this.revT > 0.25) acc -= inp.brk * P.accel * 0.6; else vf = Math.min(vf, 0); }
                } else this.revT = 0;
            } else {
                if (inp.thr > 0.03) acc += inp.thr * P.brake;
                if (inp.brk > 0.03) acc -= inp.brk * P.accel * 0.6;
            }
            const coast = inp.thr < 0.03 && inp.brk < 0.03;
            acc -= vf * (0.16 + S.drag) + Math.sign(vf) * (coast ? 1.1 : 0.25);
            let nvf = vf + acc * dt;
            if (coast && Math.sign(nvf) !== Math.sign(vf) && vf !== 0) nvf = 0;
            if (vf < 0 && inp.thr > 0.03 && nvf > 0) nvf = 0;
            // por encima de la punta (p. ej. al salir del asfalto) se frena poco a poco
            if (nvf > maxV) nvf = Math.max(maxV, nvf - (nvf - maxV) * Math.min(1, dt * 2.5));
            vf = Math.max(nvf, -P.maxV * 0.32);
            // Agarre lateral: cuánto "de lado" se puede corregir por segundo
            const hb = inp.hb ? 1 : 0;
            const latMax = 30 * P.grip * (star ? Math.max(1, S.grip) : S.grip) * (hb ? 0.22 : 1) * (this.slipT > 0 ? 0.15 : 1);
            const dvr = THREE.MathUtils.clamp(-vr, -latMax * dt, latMax * dt);
            vr += dvr;
            this.drifting = Math.abs(vr) > 1.6 ? Math.min(1, Math.abs(vr) / 5) : 0;
            // Dirección
            const target = inp.steer * P.steerMax / (1 + Math.abs(vf) * 0.05);
            this.steer += (target - this.steer) * Math.min(1, dt * 8);
            let yaw = -vf / P.wheelbase * Math.tan(this.steer);
            if (hb && Math.abs(vf) > 3) yaw *= 1.6;                          // freno de mano: el culo sale
            const resp = Math.min(1, dt * 10 * Math.min(1.2, P.grip * S.grip + 0.25));
            this.w += (yaw - this.w) * resp;
        } else {
            // En el aire: un poco de control (para no ir totalmente vendido) y sin tracción
            this.steer += (inp.steer * P.steerMax * 0.5 - this.steer) * Math.min(1, dt * 4);
            this.w *= Math.max(0, 1 - dt * 1.5);
            this.w += -this.steer * 0.6 * dt;
            vf *= Math.max(0, 1 - dt * 0.05);
            this.drifting = 0;
        }
        this.acc = acc;
        this.h = wrapA(this.h + this.w * dt);
        const nfx = Math.sin(this.h), nfz = Math.cos(this.h), nrx = -nfz, nrz = nfx;
        // la velocidad sigue en el mundo: lo de lado que quede es derrape
        this.vx = vf * fx + vr * rx; this.vz = vf * fz + vr * rz;
        // reproyectar en los ejes nuevos (con agarre, se alinea con el morro)
        this.vf = this.vx * nfx + this.vz * nfz; this.vr = this.vx * nrx + this.vz * nrz;

        // Avance y choques
        let nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
        const hit = W.collide(this, nx, nz);
        if (hit) { nx = hit.x; nz = hit.z; this._bounce(hit, onGround); }
        for (const o of others) if (o !== this && !o.ghost) this._carHit(o, nx, nz, (x, z) => { nx = x; nz = z; });
        this.x = nx; this.z = nz;

        // Altura: rampas, plataformas y el vacío (caerse de la mesa)
        const gy = W.ground(this.x, this.z, this.y, P.clearance);
        const g = W.gravity;
        if (this.air) {
            this.vy -= g * dt;
            this.y += this.vy * dt;
            this.airT += dt;
            if (this.y <= gy) {
                const impact = -this.vy;
                this.y = gy; this.vy = 0; this.air = false;
                if (impact > 4) { this.hop = Math.min(1, impact / 14); this.landed = impact; }
            }
        } else {
            const rise = (gy - this.y) / Math.max(dt, 1e-4);
            if (gy < this.y - 0.25) {              // el suelo se acaba (borde de rampa o de la mesa): a volar
                this.air = true; this.airT = 0;
                this.vy = Math.max(0, this.lastRise || 0);
            } else {
                this.y = gy;
                this.lastRise = THREE.MathUtils.lerp(this.lastRise || 0, Math.max(0, rise), 0.6);
            }
        }
        this.ground = gy;
        this.syncVisual(dt);
    }

    _bounce(hit, onGround) {
        const nx = hit.nx, nz = hit.nz;
        const vn = this.vx * nx + this.vz * nz;
        if (vn < 0) {
            if (-vn > 0.6) { this.hits = (this.hits || 0) + 1; this.hitV = -vn; }      // toques (gymkhana)
            const e = 0.25;
            this.vx -= (1 + e) * vn * nx; this.vz -= (1 + e) * vn * nz;
            // roce: pierde algo de velocidad tangencial
            const k = Math.max(0.55, 1 - Math.abs(vn) * 0.04);
            this.vx *= k; this.vz *= k;
            // y gira un poco hacia el lado del choque
            const fx = Math.sin(this.h), fz = Math.cos(this.h);
            const side = fx * nz - fz * nx;
            this.w += side * Math.min(2.5, Math.abs(vn) * 0.25);
            if (Math.abs(vn) > 3) { this.shakeT = 0.4; this.lastHit = Math.abs(vn); }
        }
        void onGround;
    }

    _carHit(o, nx, nz, set) {
        // círculo a círculo entre los dos coches
        const fx = Math.sin(this.h), fz = Math.cos(this.h), ofx = Math.sin(o.h), ofz = Math.cos(o.h);
        if (Math.abs(this.y - o.y) > 1.2) return;
        if (Math.hypot(nx - o.x, nz - o.z) > this.radius + o.radius) return;
        for (const a of this.circles) for (const b of o.circles) {
            const ax = nx + fx * a.lz, az = nz + fz * a.lz, bx = o.x + ofx * b.lz, bz = o.z + ofz * b.lz;
            const dx = ax - bx, dz = az - bz, d = Math.hypot(dx, dz), min = a.r + b.r;
            if (d < min && d > 1e-4) {
                const ux = dx / d, uz = dz / d, pen = min - d;
                const m1 = this.P.mass, m2 = o.P.mass, k1 = m2 / (m1 + m2), k2 = m1 / (m1 + m2);
                nx += ux * pen * k1; nz += uz * pen * k1;
                o.x -= ux * pen * k2; o.z -= uz * pen * k2;
                const rv = (this.vx - o.vx) * ux + (this.vz - o.vz) * uz;
                if (this.starT > 0 && !(o.starT > 0)) o.spinOut(0.9);
                else if (o.starT > 0 && !(this.starT > 0)) this.spinOut(0.9);
                if (rv < 0) {
                    const j = -(1.3) * rv / (1 / m1 + 1 / m2);
                    this.vx += j / m1 * ux; this.vz += j / m1 * uz;
                    o.vx -= j / m2 * ux; o.vz -= j / m2 * uz;
                    if (-rv > 3) { this.shakeT = o.shakeT = 0.3; this.lastHit = o.lastHit = -rv; }
                }
                set(nx, nz);
                return;
            }
        }
    }

    // Empujón externo (placa de turbo, rebote de una goma…)
    kick(boostT = 1.2) { this.boostT = Math.max(this.boostT, boostT); }

    syncVisual(dt = 0) {
        this.root.position.set(this.x, this.y, this.z);
        this.root.rotation.y = this.h;
        if (!dt) return;
        const M = this.model;
        // ruedas: giran con la velocidad; las delanteras, con la dirección
        this.spin += this.vf * dt / (M.dims.wheelR || 0.3);
        for (const wh of M.wheels) {
            wh.node.rotation.x = this.spin;
            wh.spin.rotation.y = wh.front ? -this.steer * 0.9 : 0;
        }
        // suspensión (muelle amortiguado): cabeceo por aceleración, balanceo por la curva
        const k = 60, c = 8;
        const lat = this.vf * this.w;                       // aceleración lateral
        const soft = 1 + (M.dims.clearance - 0.15) * 1.4;   // las altas se balancean más
        const pitchT = this.air ? THREE.MathUtils.clamp(-this.vy * 0.02, -0.25, 0.25) : THREE.MathUtils.clamp(-this.acc * 0.006 * soft, -0.06, 0.06);
        const rollT = this.air ? 0 : THREE.MathUtils.clamp(-lat * 0.006 * soft, -0.08 * soft, 0.08 * soft);
        this.pitchV += (k * (pitchT - this.pitch) - c * this.pitchV) * dt;
        this.rollV += (k * (rollT - this.roll) - c * this.rollV) * dt;
        this.pitch += this.pitchV * dt; this.roll += this.rollV * dt;
        if (this.hop > 0) this.hop = Math.max(0, this.hop - dt * 2.5);
        let shake = 0;
        if (this.shakeT > 0) { this.shakeT -= dt; shake = Math.sin(performance.now() * 0.05) * 0.05 * (this.shakeT / 0.4); }
        this.tilt.position.y = -Math.sin(this.hop * Math.PI) * 0.12;
        this.tilt.rotation.set(this.pitch, 0, this.roll + shake);
        // sombra: se queda en el suelo y se hace pequeña al saltar
        this.blob.position.y = this.ground - this.y + 0.03;
        const sh = Math.max(0.35, 1 - (this.y - this.ground) * 0.12);
        this.blob.scale.set(M.dims.wid * 0.6 * sh, M.dims.len * 0.56 * sh, 1);
        this.blob.visible = this.ground > -20;
        // rayo: el coche encoge; estrella: aura arcoíris
        const tk = this.shrinkT > 0 ? 0.55 : 1;
        this._scale = (this._scale ?? 1) + (tk - (this._scale ?? 1)) * Math.min(1, dt * 6);
        M.group.scale.setScalar(this._scale);
        if (this.starT > 0) {
            if (!this.aura) {
                this.aura = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
                this.aura.scale.set(M.dims.wid * 0.85, (M.dims.height || 1.2) * 0.75, M.dims.len * 0.68);
                this.aura.position.y = (M.dims.height || 1.2) * 0.45;
                this.tilt.add(this.aura);
            }
            this.aura.visible = true;
            this.aura.material.color.setHSL((performance.now() * 0.0012) % 1, 1, 0.55);
            this.aura.material.opacity = this.starT < 1.2 ? 0.4 * (Math.sin(performance.now() * 0.03) > 0 ? 1 : 0.2) : 0.4;
        } else if (this.aura) this.aura.visible = false;
        const boosting = this.boostT > 0;
        for (const f of this.flames) {
            f.visible = boosting;
            if (boosting) f.scale.set(1, 0.8 + Math.random() * 0.6, 1);
        }
    }

    // Marcas de derrape, polvo y humo del turbo
    emit(dt, FX) {
        this._fxT = (this._fxT || 0) - dt;
        if (this._fxT > 0 || this.air) return;
        this._fxT = 0.035;
        const d = this.model.dims, fx = Math.sin(this.h), fz = Math.cos(this.h), rx = -fz, rz = fx;
        const back = -d.len * 0.36;
        const S = this.surface || {};
        if (this.drifting > 0.2 || (this.acc > 6 && Math.abs(this.vf) < 4)) {
            for (const s of [-1, 1]) {
                const x = this.x + fx * back + rx * s * d.wid * 0.4, z = this.z + fz * back + rz * s * d.wid * 0.4;
                if (S.marks !== false) FX.skid(x, this.ground, z, this.h);
                if (Math.random() < 0.5) FX.puff(x, this.ground + 0.15, z, S.dust || 0xfffaf0, 0.7);
            }
        } else if (S.dust && Math.abs(this.vf) > 4 && Math.random() < 0.4) {
            FX.puff(this.x + fx * back, this.ground + 0.1, this.z + fz * back, S.dust, 0.6, 0.3);
        }
        if (this.boostT > 0 && Math.random() < 0.6) FX.puff(this.x + fx * (back - 0.6), this.y + 0.4, this.z + fz * (back - 0.6), 0x9fe4ff, 0.5, 0.2);
    }
}
