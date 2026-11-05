// Cámara con varios modos y transiciones suaves.
import * as THREE from 'three';

const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class CameraRig {
    constructor(engine, track, car) {
        this.engine = engine;
        this.cam = engine.camera;
        this.track = track;
        this.car = car;
        this.pos = v().copy(this.cam.position);
        this.look = v();
        this.wantPos = v(); this.wantLook = v();
        this.stiffness = 2.2;
        this.mode = { name: 'overview' };
        this.tilt = { amount: 2.0, focus: 0.45, range: 0.22 };
        // Vista libre: arrastrar para girar, rueda para acercar
        this.user = { yaw: 0, pitch: 0, zoom: 1 };
        this.userT = { yaw: 0, pitch: 0, zoom: 1 };
        this._bindPointer(engine.canvas);
        engine.onUpdate((dt, t) => this._update(dt, t));
    }

    _bindPointer(el) {
        const pts = new Map();
        let lastPinch = 0;
        el.addEventListener('pointerdown', e => {
            pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
            el.setPointerCapture(e.pointerId);
            this.lastInteract = performance.now();
        });
        el.addEventListener('pointermove', e => {
            const p = pts.get(e.pointerId);
            if (!p) return;
            const dx = e.clientX - p.x, dy = e.clientY - p.y;
            p.x = e.clientX; p.y = e.clientY;
            if (pts.size === 1) {
                this.userT.yaw -= dx * 0.006;
                this.userT.pitch = THREE.MathUtils.clamp(this.userT.pitch + dy * 0.004, -0.6, 0.9);
            } else if (pts.size === 2) {
                const [a, b] = [...pts.values()];
                const d = Math.hypot(a.x - b.x, a.y - b.y);
                if (lastPinch) this.userT.zoom = THREE.MathUtils.clamp(this.userT.zoom * (lastPinch / d), 0.45, 2.2);
                lastPinch = d;
            }
            this.lastInteract = performance.now();
        });
        const up = e => { pts.delete(e.pointerId); lastPinch = 0; };
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
        el.addEventListener('wheel', e => {
            e.preventDefault();
            this.userT.zoom = THREE.MathUtils.clamp(this.userT.zoom * (e.deltaY > 0 ? 1.1 : 0.9), 0.45, 2.2);
            this.lastInteract = performance.now();
        }, { passive: false });
    }

    // Al cambiar de plano, la vista libre vuelve suavemente a su sitio
    resetUser() { this.userT.yaw = 0; this.userT.pitch = 0; this.userT.zoom = 1; }

    // Modos ------------------------------------------------------------------
    follow() { this.resetUser(); this.mode = { name: 'follow' }; this.stiffness = 2.4; }
    overview(opts = {}) { this.resetUser(); this.mode = { name: 'overview', ...opts }; this.stiffness = opts.stiffness || 0.9; }
    // Plano de parada: encuadra el coche y la señal (a la izquierda; la tarjeta va a la derecha)
    stop(s, opts = {}) { this.resetUser(); this.mode = { name: 'stop', s, ...opts }; this.stiffness = 1.6; }
    // Mirar hacia un punto lejano (Montserrat) desde detrás del coche
    establish(place, s = null, side = null) { this.resetUser(); this.mode = { name: 'establish', s: s ?? place.sCenter, side: side ?? place.props.establishSide ?? 7 }; this.stiffness = 1.3; }
    // Viaje entre lugares: secuencia de planos cinematográficos
    travel() { if (this.mode.name !== 'travel') { this.resetUser(); this.mode = { name: 'travel', t0: this.time || 0 }; this.stiffness = 1.1; } }
    vista(target, opts = {}) { this.resetUser(); this.mode = { name: 'vista', target: target.clone(), ...opts }; this.stiffness = opts.stiffness || 0.8; }
    orbit(center, opts = {}) { this.resetUser(); this.mode = { name: 'orbit', center: center.clone(), angle: opts.angle ?? 0, radius: 16, height: 7, speed: 0.08, ...opts }; this.stiffness = opts.stiffness || 0.9; }
    // Conducción libre (examen de circulación): detrás del coche, según su rumbo
    chase() { this.resetUser(); this.mode = { name: 'chase' }; this.stiffness = 3.4; }
    fixed(pos, look, stiffness = 1.2, tilt = null) { this.resetUser(); this.mode = { name: 'fixed', p: pos.clone(), l: look.clone(), tilt }; this.stiffness = stiffness; }

    snap() { this._compute(0, 0); this.pos.copy(this.wantPos); this.look.copy(this.wantLook); }

    _compute(dt, time) {
        const m = this.mode, t = this.track, car = this.car;
        void car;
        const portrait = this.engine.camera.aspect < 0.8;
        const carPos = car.root.position;
        switch (m.name) {
            case 'follow': {
                const back = portrait ? 13 : 11;
                // Detrás, siguiendo el trazado (en las horquillas no gira de golpe), un poco hacia el exterior
                const pb = t.point(car.s - back, -2);
                this.wantPos.set(pb.x, carPos.y + (portrait ? 8 : 6.5), pb.z);
                const a = t.point(car.s + 5, 0);
                this.wantLook.copy(a).y += 0.6;
                this.tilt = { amount: 2.0, focus: 0.5, range: 0.2 };
                break;
            }
            case 'stop': {
                // Plano de parada: desde detrás del coche, en diagonal hacia la derecha, encuadrando a la vez
                // la señal de la pregunta (izquierda) y la maqueta del lugar (derecha), sin que se corte nada.
                // La distancia se calcula para que quepan las dos según el ancho de la pantalla.
                const f = t.frame(m.s);
                const T = v(f.tx, 0, f.tz), N = v(f.nx, 0, f.nz);
                const place = t.placeAt(m.s);
                const sign = m.focus ? m.focus.clone() : t.point(m.s + 5, -5.4);
                const scene = t.point(m.s + 5, m.sceneSide ?? place.props.stopSide ?? (place.mountain ? 3 : 9));
                const yaw = place.props.stopYaw ?? (portrait ? 0.12 : 0.3);
                const dir = T.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(N, Math.sin(yaw)).normalize();
                const perp = v(-dir.z, 0, dir.x);
                const C = sign.clone().lerp(scene, 0.5);
                const span = Math.max(Math.abs(v().subVectors(sign, C).dot(perp)), Math.abs(v().subVectors(scene, C).dot(perp))) + 4.2;
                const aspect = this.engine.camera.aspect;
                const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(portrait ? 46 : 32) / 2) * aspect);
                const d = THREE.MathUtils.clamp(span / Math.tan(hfov / 2), place.props.stopMinDist ?? 15, place.props.stopMaxDist ?? (portrait ? 40 : 30));
                // altura de referencia: la base de la señal (en las cuestas puede estar más alta que el coche)
                const ground = Math.max(t.roadY(m.s), sign.y - 0.3);
                this.wantPos.copy(C).addScaledVector(dir, -d); this.wantPos.y = ground + d * (portrait ? 0.42 : 0.34);
                // El centro de la señal (a 2,2 m) queda en el tercio superior, por encima de la tarjeta de la pregunta
                this.wantLook.copy(C); this.wantLook.y = ground + 2.2 + (place.props.stopLookUp ?? 0) - d * (portrait ? 0.2 : 0.11);
                this.tilt = { amount: 1.0, focus: portrait ? 0.66 : 0.58, range: 0.34 };
                break;
            }
            case 'establish': {
                // Presentación de un lugar: de frente a las fachadas de la maqueta
                const f = t.frame(m.s);
                const L = t.point(m.s, m.side);
                L.y += 1.5;
                const dist = portrait ? 32 : 24, up = portrait ? 14 : 10;
                this.wantPos.set(L.x - f.nx * dist - f.tx * 4, L.y + up, L.z - f.nz * dist - f.tz * 4);
                this.wantLook.copy(L);
                this.tilt = { amount: 1.6, focus: 0.5, range: 0.22 };
                break;
            }
            case 'vista': {
                // Por encima de la isla, mirando a lo lejos; el objetivo queda a la izquierda (tarjeta a la derecha)
                const dir = v().subVectors(m.target, carPos).setY(0).normalize();
                const side = v(-dir.z, 0, dir.x);
                this.wantPos.copy(carPos).addScaledVector(dir, -(m.back ?? 10)).y += (m.up ?? 15) + (portrait ? 3 : 0);
                this.wantLook.copy(m.target).addScaledVector(side, portrait ? 0 : (m.shift ?? 17)).y += (m.lookUp ?? 0) - (portrait ? 6 : 0);
                this.tilt = { amount: 0.8, focus: 0.5, range: 0.35 };
                break;
            }
            case 'overview': {
                // Vista aérea alrededor del coche (o de un punto)
                const c = m.center || carPos;
                const a = (m.angle ?? 0.6) + (m.spin ? time * m.spin : 0);
                const d = (m.dist ?? 38) * (portrait ? 1.5 : 1);
                this.wantPos.set(c.x + Math.cos(a) * d, c.y + d * 0.75, c.z + Math.sin(a) * d);
                this.wantLook.copy(c);
                this.tilt = { amount: 2.2, focus: 0.5, range: 0.18 };
                break;
            }
            case 'travel': {
                const f = t.frame(car.s);
                const T = v(f.tx, 0, f.tz), N = v(f.nx, 0, f.nz);
                // Vuelo: planos que lucen las alas, la estela de corazones y el mar
                const fl = t.flightState(car.s);
                if (fl.region && (fl.air > 0.3 || fl.wings || fl.rockets)) {
                    const T2 = v(f.tx, 0, f.tz), N2 = v(f.nx, 0, f.nz);
                    const fshot = Math.floor((time - m.t0) / 5.2) % 4;
                    this._shot = 'f' + fshot;
                    const P = this.wantPos, L = this.wantLook;
                    if (fshot === 0) { P.copy(carPos).addScaledVector(N2, 7.5).addScaledVector(T2, 1.5); P.y += 2.2; L.copy(carPos).addScaledVector(T2, 1.5); L.y += 0.6; }
                    else if (fshot === 1) { P.copy(carPos).addScaledVector(T2, -9).addScaledVector(N2, -2.5); P.y += 3.2; L.copy(carPos).addScaledVector(T2, 6); L.y += 0.4; }
                    else if (fshot === 2) { P.copy(carPos).addScaledVector(T2, -16).addScaledVector(N2, -12); P.y += 9; L.copy(carPos).addScaledVector(T2, 4); }
                    else { P.copy(carPos).addScaledVector(T2, 8).addScaledVector(N2, -5); P.y += 1.4; L.copy(carPos); L.y += 0.7; }
                    // Al bajar hacia la isla: que se vea Lanzarote delante
                    const pc = t.pieceAt(car.s);
                    if (pc && (pc.type === 'descent' || pc.type === 'reentry')) { this._shot = 'land'; P.copy(carPos).addScaledVector(T2, -11).addScaledVector(N2, -3); P.y += 5; L.copy(t.point(fl.region.to.sCenter, 10)); L.y += 2; }
                    // Despegue del cohete: desde abajo, viendo cómo sube
                    if (pc && pc.type === 'launch') { this._shot = 'launch'; P.copy(carPos).addScaledVector(T2, -14).addScaledVector(N2, -7); P.y = Math.max(t.roadY(pc.s0) + 2, carPos.y - 6); L.copy(carPos); L.y += 1; }
                    this.tilt = { amount: 0.8, focus: 0.5, range: 0.35 };
                    break;
                }
                // Viaje largo: si se acerca una escena, encuadrarla junto al coche
                let poi = t.poiAhead(car.s, 40, 5);
                // escenas seguidas: se pasa de una a otra sin volver a la persecución entre medias
                if (!poi && m.poiEnd !== undefined && car.s - m.poiEnd < 30) poi = t.poiAhead(car.s, 85, 5);
                if (poi) {
                    m.poiOn = true; m.poiEnd = car.s;
                    this._shot = 'poi' + poi.s;
                    const C = t.point(poi.s, poi.side); C.y += poi.h;
                    const T2 = v(f.tx, 0, f.tz), N2 = v(f.nx, 0, f.nz);
                    const away = poi.side >= 0 ? -1 : 1;     // la cámara, al otro lado
                    const lat = Math.abs(poi.side) > 4 ? 6 + Math.abs(poi.side) * 0.15 : 3;
                    // por el trazado (en rotondas y curvas cerradas no gira de golpe)
                    const pb = t.point(car.s - 12, away * lat);
                    this.wantPos.set(pb.x, carPos.y + 6.5 + Math.max(0, poi.h - 2) * 0.4, pb.z);
                    this.wantLook.copy(carPos).lerp(C, 0.62);
                    this.tilt = { amount: 1, focus: 0.5, range: 0.3 };
                    break;
                }
                // Plano por tiempo, pero sin cortes seguidos: al acabar una escena se vuelve a la persecución,
                // y no se cambia de plano si va a empezar una escena enseguida
                if (m.poiOn) { m.poiOn = false; m.cur = 0; m.curSince = time; }
                if (m.cur === undefined) { m.cur = 0; m.curSince = time; }
                if (time - m.curSince > 4.8 && !t.poiAhead(car.s, 70, 5)) { m.cur = (m.cur + 1) % 5; m.curSince = time; }
                let shot = m.cur;
                // En la montaña: nada de planos bajos (la ladera y los árboles taparían el coche)
                const mtn = t.placeAt(car.s).mountain && t.regionAt(car.s).type === 'place';
                if (mtn && (shot === 2 || shot === 4)) shot = shot === 2 ? 1 : 0;
                this._shot = shot === 3 ? 0 : shot;
                const P = this.wantPos, L = this.wantLook;
                const sway = Math.sin(time * 0.35) * 3;
                // Todos los planos se colocan por el trazado (puntos de la carretera por delante/detrás),
                // no con la tangente en el coche: en horquillas y rotondas la cámara no da latigazos
                const ahead = (d, side = 0, y = 0) => { const q = t.point(car.s + d, side); q.y = carPos.y + y; return q; };
                if (mtn) {
                    // Montaña: grúa alta que gira despacio alrededor del coche (la carretera da vueltas debajo)
                    const ang = (m.t0 || 0) * 0.37 + (time - (m.t0 || 0)) * 0.06;
                    const R = shot === 1 ? 26 : 18, H = shot === 1 ? 22 : 12;
                    P.set(carPos.x + Math.cos(ang) * R, carPos.y + H, carPos.z + Math.sin(ang) * R);
                    L.copy(carPos); L.y += 0.5;
                    this._shot = 'mtn';
                } else if (shot === 0 || shot === 3) {   // persecución alta
                    P.copy(ahead(-13, sway, 6.5));
                    L.copy(ahead(10, 0, 0.5));
                } else if (shot === 1) {                 // aérea: se ve el paisaje cambiar
                    P.copy(ahead(-8, -6, 26));
                    L.copy(ahead(16));
                } else if (shot === 2) {                 // travelling lateral bajo
                    P.copy(ahead(1.5, 8.5, 2.2));
                    L.copy(ahead(2.5, 0, 0.6));
                } else {                                 // frontal: el coche viene hacia nosotros
                    P.copy(ahead(13, -4.5, 3.5));
                    L.copy(carPos); L.y += 0.7;
                }
                this.tilt = { amount: shot === 1 ? 2.2 : 1.1, focus: 0.5, range: 0.24 };
                break;
            }
            case 'orbit': {
                // sway: balanceo suave alrededor del ángulo inicial (en vez de dar vueltas)
                let ang;
                if (m.sway) { m.t = (m.t || 0) + dt; ang = m.angle + Math.sin(m.t * 0.22) * m.sway; }
                else { m.angle += m.speed * dt; ang = m.angle; }
                const r = portrait ? m.radius * 1.4 : m.radius;
                this.wantPos.set(m.center.x + Math.cos(ang) * r, m.center.y + m.height, m.center.z + Math.sin(ang) * r);
                this.wantLook.copy(m.center).y += m.lookY ?? 2;
                this.tilt = m.tilt || { amount: 1.6, focus: 0.5, range: 0.22 };
                break;
            }
            case 'chase': {
                const h = car.root.rotation.y, fx = Math.sin(h), fz = Math.cos(h);
                const back = portrait ? 12 : 9, up = portrait ? 5.6 : 4.2;
                this.wantPos.set(carPos.x - fx * back, carPos.y + up, carPos.z - fz * back);
                this.wantLook.set(carPos.x + fx * 6, carPos.y + 0.9, carPos.z + fz * 6);
                this.tilt = { amount: 0.45, focus: 0.55, range: 0.4 };
                break;
            }
            case 'fixed':
                this.wantPos.copy(m.p); this.wantLook.copy(m.l);
                this.tilt = m.tilt || { amount: 0.6, focus: 0.5, range: 0.35 };
                break;
        }
    }

    _update(dt, time) {
        this.time = time;
        this._compute(dt, time);
        // Sensación de velocidad: el campo de visión se abre un poco
        const portrait = this.engine.camera.aspect < 0.8;
        const fov = (portrait ? 46 : 32) + Math.min(7, (this.car.speed || 0) * 0.3);
        this.cam.fov += (fov - this.cam.fov) * Math.min(1, dt * 2);
        this.cam.updateProjectionMatrix();
        // Vista libre del usuario (giro alrededor del punto de mira)
        const ku = 1 - Math.exp(-6 * dt);
        for (const key of ['yaw', 'pitch', 'zoom']) this.user[key] += (this.userT[key] - this.user[key]) * ku;
        if (Math.abs(this.user.yaw) > 1e-4 || Math.abs(this.user.pitch) > 1e-4 || Math.abs(this.user.zoom - 1) > 1e-4) {
            const off = v().subVectors(this.wantPos, this.wantLook);
            off.applyAxisAngle(v(0, 1, 0), this.user.yaw);
            const axis = v().crossVectors(off, v(0, 1, 0)).normalize();
            const elev = Math.asin(off.y / off.length());
            const pitch = THREE.MathUtils.clamp(this.user.pitch, 0.08 - elev, 1.35 - elev);
            off.applyAxisAngle(axis, -pitch);
            off.multiplyScalar(this.user.zoom);
            this.wantPos.copy(this.wantLook).add(off);
        }
        // Cambio de plano: si la cámara tendría que dar un giro grande (o viajar lejos), corte limpio
        const shotKey = this.mode.name + (this.mode.name === 'travel' ? ':' + (this._shot ?? '') : '');
        if (shotKey !== this._shotKey) {
            const prev = this._shotKey;
            this._shotKey = shotKey;
            if (prev !== undefined) {
                const a = v().subVectors(this.look, this.pos).setY(0), b = v().subVectors(this.wantLook, this.wantPos).setY(0);
                const ang = a.lengthSq() > 1e-6 && b.lengthSq() > 1e-6 ? a.angleTo(b) : 0;
                if (ang > 1.15 || this.pos.distanceTo(this.wantPos) > 45) { this.pos.copy(this.wantPos); this.look.copy(this.wantLook); }
            }
        }
        const k = 1 - Math.exp(-this.stiffness * dt);
        this.pos.lerp(this.wantPos, k);
        this.look.lerp(this.wantLook, Math.min(1, k * 1.3));
        // Nunca bajo el terreno
        const ground = this.track.heightAt(this.pos.x, this.pos.z) + 1.5;
        if (this.pos.y < ground) this.pos.y = ground;
        this.cam.position.copy(this.pos);
        this.cam.lookAt(this.look);
        if (this.onMove) this.onMove(this.pos, this.look);
        const tl = this.tilt;
        this.engine.setTiltShift(tl.amount, tl.focus, tl.range);
    }
}
