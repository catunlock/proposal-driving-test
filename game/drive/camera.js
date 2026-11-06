// ============================================================================
//  CÁMARA DE PERSECUCIÓN (una por jugador; con dos, pantalla partida)
// ============================================================================
// Detrás y un poco por encima del coche, con muelle: en las curvas se queda algo por fuera y al
// derrapar se ve el coche de lado. Se aleja con la velocidad y con los coches grandes, y en los
// saltos sigue la altura con más calma para no marear.
import * as THREE from 'three';

export class ChaseCam {
    constructor(camera) {
        this.cam = camera;
        this.pos = new THREE.Vector3();
        this.look = new THREE.Vector3();
        this.h = 0;
        this.snapped = false;
        this.shake = 0;
    }
    target(v) { this.v = v; }
    snap() { this.snapped = false; }
    update(dt, W) {
        const v = this.v;
        if (!v) return;
        const d = v.model.dims;
        const sp = Math.abs(v.vf);
        // el rumbo de la cámara persigue al del coche (más rápido cuanto más corre)
        let dh = v.h - this.h;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        if (v.vf < -1.5) dh = 0;                                   // marcha atrás: no darse la vuelta
        this.h += dh * Math.min(1, dt * (2.2 + sp * 0.12));
        const size = Math.max(1, d.len / 2.6);
        const back = (6.6 + sp * 0.08) * size, up = (3.0 + sp * 0.04) * (0.8 + size * 0.2) + (d.clearance - 0.15) * 1.5;
        const fx = Math.sin(this.h), fz = Math.cos(this.h);
        const want = new THREE.Vector3(v.x - fx * back, v.y + up, v.z - fz * back);
        // no meterse bajo el suelo (rampas, desniveles)
        if (W) want.y = Math.max(want.y, W.ground(want.x, want.z, want.y + 2) + 1.2);
        const wantLook = new THREE.Vector3(v.x + fx * 5, v.y + 0.9 + (d.height || 1) * 0.2, v.z + fz * 5);
        if (!this.snapped) { this.pos.copy(want); this.look.copy(wantLook); this.snapped = true; this.h = v.h; }
        const kx = 1 - Math.exp(-dt * 7), ky = 1 - Math.exp(-dt * (v.air ? 2.5 : 6));
        this.pos.x += (want.x - this.pos.x) * kx; this.pos.z += (want.z - this.pos.z) * kx;
        this.pos.y += (want.y - this.pos.y) * ky;
        this.look.lerp(wantLook, 1 - Math.exp(-dt * 10));
        if (v.shakeT > 0.2 && v.lastHit > 5) this.shake = Math.min(0.35, v.lastHit * 0.03);
        this.shake *= Math.max(0, 1 - dt * 6);
        const s = this.shake;
        this.cam.position.set(this.pos.x + (Math.random() - 0.5) * s, this.pos.y + (Math.random() - 0.5) * s, this.pos.z);
        this.cam.lookAt(this.look);
        // sensación de velocidad: el campo de visión se abre
        const fov = 50 + Math.min(14, sp * 0.45) + (v.boostT > 0 ? 6 : 0);
        this.cam.fov += (fov - this.cam.fov) * Math.min(1, dt * 3);
        this.cam.updateProjectionMatrix();
    }
}

// Objetos gigantes que tapan el coche: se vuelven translúcidos (prueba con esferas envolventes)
export class Occlusion {
    constructor() { this.items = []; }
    add(obj, center, radius) {
        const mats = [];
        obj.traverse(o => {
            if (!o.isMesh) return;
            const list = Array.isArray(o.material) ? o.material : [o.material];
            const own = list.map(m => { const c = m.clone(); c.userData.op = m.opacity ?? 1; c.userData.tr = m.transparent; return c; });
            o.material = Array.isArray(o.material) ? own : own[0];
            mats.push(...own);
        });
        this.items.push({ c: center.clone(), r: radius, mats, k: 1 });
    }
    // cams: [{ pos, target }] — si cualquier cámara tiene el objeto delante de su coche, se aclara
    update(dt, cams) {
        const ab = new THREE.Vector3(), ac = new THREE.Vector3();
        for (const it of this.items) {
            let hide = false;
            for (const { pos, target } of cams) {
                ab.subVectors(target, pos);
                const L = ab.length();
                if (L < 1e-3) continue;
                ab.divideScalar(L);
                ac.subVectors(it.c, pos);
                const t = THREE.MathUtils.clamp(ac.dot(ab), 0, L);
                const dist = ac.addScaledVector(ab, -t).length();
                if (dist < it.r && t < L - 0.5) { hide = true; break; }
            }
            const k = hide ? 0.28 : 1;
            if (Math.abs(it.k - k) < 0.01) continue;
            it.k += (k - it.k) * Math.min(1, dt * 8);
            for (const m of it.mats) {
                m.opacity = m.userData.op * it.k;
                m.transparent = it.k < 0.99 || m.userData.tr;
                m.depthWrite = it.k > 0.99;
            }
        }
    }
}
