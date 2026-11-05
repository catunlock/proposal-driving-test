// Animaciones (tweens), partículas: corazones, fuegos artificiales, flashes.
import * as THREE from 'three';
import { URLP } from './config.js';
import { heartGeometry, toon } from './assets.js';

export const ease = {
    linear: t => t,
    inOut: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
    out: t => 1 - Math.pow(1 - t, 3),
    back: t => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    elastic: t => t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1
};

export class FX {
    constructor(engine) {
        this.engine = engine;
        this.scene = engine.scene;
        this.items = [];
        engine.onUpdate((dt, t) => this._update(dt, t));
        this.heartMats = ['#ff4d8d', '#ff7eb3', '#ff2e63', '#ffb3c7'].map(c => toon(c, { emissive: new THREE.Color(c), emissiveIntensity: 0.25 }));
    }

    // Llama a fn(e) durante "duration" segundos; devuelve promesa
    tween(duration, fn, easing = ease.inOut) {
        if (URLP.fast) duration *= 0.25;
        return new Promise(resolve => {
            this.items.push({ t: 0, d: Math.max(duration, 0.001), fn, easing, resolve });
        });
    }

    // Función que se ejecuta cada frame hasta que devuelva false
    every(fn) { this.items.push({ loop: fn }); }

    wait(seconds) { return this.tween(seconds, () => { }); }

    heart(color = 0) {
        const m = new THREE.Mesh(heartGeometry(), this.heartMats[color % this.heartMats.length]);
        m.castShadow = true;
        const g = new THREE.Group();
        g.add(m);
        return g;
    }

    // Estallido de corazoncitos
    heartBurst(pos, count = 14, power = 1) {
        for (let i = 0; i < count; i++) {
            const h = this.heart(i);
            h.scale.setScalar(0.18 + Math.random() * 0.14);
            h.position.copy(pos);
            const a = Math.random() * Math.PI * 2;
            const vel = new THREE.Vector3(Math.cos(a) * (1 + Math.random() * 2.5), 4 + Math.random() * 4, Math.sin(a) * (1 + Math.random() * 2.5)).multiplyScalar(power);
            const spin = (Math.random() - 0.5) * 6;
            this.scene.add(h);
            let life = 0;
            this.every(dt => {
                life += dt;
                vel.y -= 9 * dt;
                h.position.addScaledVector(vel, dt);
                h.rotation.y += spin * dt;
                const k = life / 1.6;
                if (k > 0.7) h.scale.multiplyScalar(0.9);
                if (k >= 1) { this.scene.remove(h); return false; }
                return true;
            });
        }
    }

    // Fuegos artificiales sobre un punto
    firework(center, color) {
        const n = 90;
        const pos = new Float32Array(n * 3), vel = [];
        for (let i = 0; i < n; i++) {
            pos.set([center.x, center.y, center.z], i * 3);
            const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
            vel.push(new THREE.Vector3(r * Math.cos(th), u, r * Math.sin(th)).multiplyScalar(7 + Math.random() * 3));
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const mat = new THREE.PointsMaterial({ color: color || new THREE.Color().setHSL(Math.random(), 0.9, 0.65), size: 0.55, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
        const pts = new THREE.Points(geo, mat);
        this.scene.add(pts);
        let life = 0;
        this.every(dt => {
            life += dt;
            const p = geo.attributes.position;
            for (let i = 0; i < n; i++) {
                vel[i].multiplyScalar(1 - 1.6 * dt);
                vel[i].y -= 3 * dt;
                p.setXYZ(i, p.getX(i) + vel[i].x * dt, p.getY(i) + vel[i].y * dt, p.getZ(i) + vel[i].z * dt);
            }
            p.needsUpdate = true;
            mat.opacity = Math.max(0, 1 - life / 2.2);
            if (life > 2.2) { this.scene.remove(pts); geo.dispose(); mat.dispose(); return false; }
            return true;
        });
        if (window.sfx && Math.random() < 0.5) window.sfx.tap();
    }

    // Cohete que sube y explota
    rocket(from, height = 22) {
        const trail = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
        trail.position.copy(from);
        this.scene.add(trail);
        const color = new THREE.Color().setHSL(Math.random(), 0.9, 0.65);
        return this.tween(1.1, e => { trail.position.y = from.y + e * height; }, ease.out).then(() => {
            this.scene.remove(trail);
            this.firework(trail.position, color);
        });
    }

    _update(dt, time) {
        for (let i = this.items.length - 1; i >= 0; i--) {
            const it = this.items[i];
            if (it.loop) {
                if (it.loop(dt, time) === false) this.items.splice(i, 1);
                continue;
            }
            it.t = Math.min(it.d, it.t + dt);
            it.fn(it.easing(it.t / it.d));
            if (it.t >= it.d) { this.items.splice(i, 1); it.resolve(); }
        }
    }
}
