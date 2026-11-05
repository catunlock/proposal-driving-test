// Lo que pasa en cada parada: la señal 3D que brota, y la "floración" al acertar.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { imageTexture, textTexture, toon, model } from './assets.js';
import { ease } from './effects.js';
import { buildProp } from './props.js';

export const SIGN_AHEAD = 5;

const ICONS = {
    technical: { emoji: '⚡', label: 'PARTE 2', bg: '#e8f4ff' },
    commitment: { emoji: '💞', label: 'PARTE 3', bg: '#ffe8f1' },
    arrive: { emoji: '🚗', label: '', bg: '#fff6d6' }
};

// Extras opcionales por pregunta (campo "extra" en questions.json): algo especial en la carretera
const EXTRAS = {
    // Agente de tráfico con la paleta de STOP, plantado delante del coche
    async agente(stops, stop) {
        const t = stops.track;
        const g = new THREE.Group();
        const agent = await model('chars/character-male-c');
        const mixer = new THREE.AnimationMixer(agent);
        const clips = agent.userData.animations || [];
        const clip = THREE.AnimationClip.findByName(clips, 'holding-right') || THREE.AnimationClip.findByName(clips, 'idle');
        if (clip) mixer.clipAction(clip).play();
        agent.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
        g.add(agent);
        // Paleta: disco rojo con STOP en un mango, en la mano derecha
        const paddle = new THREE.Group();
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 8), toon('#3b3f4f'));
        stick.position.y = 0.22;
        const face = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.04, 24), new THREE.MeshBasicMaterial({ map: textTexture('STOP', { width: 256, height: 256, bg: '#e8173b', fg: '#ffffff', borderColor: '#ffffff', border: 14, radius: 128, font: 'Fredoka', weight: 700, size: 78 }), toneMapped: false }));
        face.rotation.x = Math.PI / 2;
        face.position.y = 0.6;
        paddle.add(stick, face);
        paddle.position.set(-0.42, 0.62, 0.08);
        paddle.rotation.z = 0.25;
        g.add(paddle);
        const s = stop.s + 6.5;
        const p = t.point(s, 0.5);
        g.position.copy(p).y += 0.12;
        g.rotation.y = t.headingAt(s) + Math.PI;   // mirando al coche
        g.scale.setScalar(0.001);
        stops.scene.add(g);
        const off = stops.engine.onUpdate(dt => mixer.update(dt));
        await stops.fx.tween(0.6, e => g.scale.setScalar(Math.max(0.001, e)), ease.back);
        if (window.sfx) window.sfx.honk();
        return { remove: async () => { await stops.fx.tween(0.3, e => g.scale.setScalar(Math.max(0.001, 1 - e))); off(); stops.scene.remove(g); } };
    }
};

export class Stops {
    constructor(engine, track, fx) {
        this.engine = engine;
        this.track = track;
        this.fx = fx;
        this.scene = engine.scene;
        this.postMat = toon('#9aa3b5');
        this.frameMat = toon('#1b1b2f');
        this.boardMat = toon('#ffffff');
        engine.onUpdate((dt, t) => {
            for (const h of this.floaters || []) {
                h.position.y = h.userData.baseY + Math.sin(t * 1.6 + h.userData.phase) * 0.25;
                h.rotation.y = t * 0.8 + h.userData.phase;
            }
        });
        this.floaters = [];
    }

    signPosition(stop) {
        return this.track.point(stop.s + SIGN_AHEAD, CONFIG.road.signSide);
    }

    async showSign(stop) {
        const q = stop.q;
        // Sin foto: maqueta 3D del contenido de la pregunta (o nada)
        if (!q || !q.image) return this._showProp(stop);
        let tex = null;
        if (q && q.image) tex = await imageTexture(q.image);
        let ownTexture = false;
        if (!tex) {
            ownTexture = true;
            const ic = ICONS[stop.kind] || ICONS.arrive;
            tex = textTexture('', { width: 512, height: 512, bg: ic.bg, lines: [ic.emoji, ic.label], size: 150, radius: 40, border: 0 });
        }
        const img = tex.image;
        const aspect = img && img.width ? img.height / img.width : 1;
        const w = 2.8, h = Math.min(w * aspect, 3.2);
        const bw = h / aspect;

        const g = new THREE.Group();
        const postH = 1.6;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, postH + h / 2, 10), this.postMat);
        post.position.y = (postH + h / 2) / 2;
        const frame = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.36, h + 0.36, 0.16), this.frameMat);
        frame.position.y = postH + h / 2;
        const board = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.2, h + 0.2, 0.18), this.boardMat);
        board.position.y = postH + h / 2;
        const face = new THREE.Mesh(new THREE.PlaneGeometry(bw, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
        face.position.set(0, postH + h / 2, 0.1);
        g.add(post, frame, board, face);
        g.traverse(o => { if (o.isMesh) o.castShadow = true; });
        g.userData.face = face;
        g.userData.ownTexture = ownTexture;
        g.userData.center = new THREE.Vector3(0, postH + h / 2, 0);

        const p = this.signPosition(stop);
        g.position.copy(p);
        const f = this.track.frame(stop.s + SIGN_AHEAD);
        // Mirando hacia atrás (hacia el coche y la cámara) y un poco hacia fuera
        g.rotation.y = Math.atan2(-f.tx - f.nx * 0.45, -f.tz - f.nz * 0.45);
        g.scale.set(1, 0.001, 1);
        this.scene.add(g);
        this.sign = g;
        const pop = this.fx.tween(0.7, e => g.scale.set(0.6 + 0.4 * e, Math.max(0.001, e), 1), ease.back);
        if (q && q.extra && EXTRAS[q.extra]) {
            try { this.extra = await EXTRAS[q.extra](this, stop); } catch (e) { console.warn('Extra', q.extra, e); }
        }
        await pop;
        return g;
    }

    async _showProp(stop) {
        const name = (stop.q && stop.q.prop) || (stop.kind === 'commitment' ? 'heart' : null);
        if (!name) { this.sign = null; return null; }
        const p = await buildProp(name);
        if (!p) { this.sign = null; return null; }
        const g = p.group;
        const pos = this.track.point(stop.s + SIGN_AHEAD, CONFIG.road.signSide - 0.6);
        g.position.copy(pos);
        const f = this.track.frame(stop.s + SIGN_AHEAD);
        g.rotation.y = Math.atan2(-f.tx - f.nx * 0.45, -f.tz - f.nz * 0.45);
        g.scale.setScalar(0.001);
        this.scene.add(g);
        g.userData.off = p.update ? this.engine.onUpdate(p.update) : null;
        g.userData.isProp = true;
        this.sign = g;
        await this.fx.tween(0.7, e => g.scale.setScalar(Math.max(0.001, e)), ease.back);
        return g;
    }

    // Punto de la señal en el mundo (para anclar la tarjeta o el lightbox)
    signWorldCenter() {
        if (!this.sign) return null;
        return this.sign.localToWorld(this.sign.userData.center.clone());
    }

    wobble() {
        const g = this.sign;
        if (!g) return;
        const base = g.rotation.y;
        this.fx.tween(0.5, e => { g.rotation.z = Math.sin(e * Math.PI * 6) * 0.12 * (1 - e); }, ease.linear)
            .then(() => { g.rotation.z = 0; g.rotation.y = base; });
    }

    async hideSign() {
        if (this.extra) { const ex = this.extra; this.extra = null; ex.remove(); }
        const g = this.sign;
        if (!g) return;
        this.sign = null;
        if (g.userData.isProp) {
            await this.fx.tween(0.35, e => g.scale.setScalar(Math.max(0.001, 1 - e)), ease.inOut);
            this.scene.remove(g);
            if (g.userData.off) g.userData.off();
            return;   // (la geometría se comparte con los modelos en caché: no se libera)
        }
        await this.fx.tween(0.35, e => g.scale.set(1 - e * 0.4, Math.max(0.001, 1 - e), 1), ease.inOut);
        this.scene.remove(g);
        // Liberar memoria de la señal (los materiales compartidos y las imágenes en caché se conservan)
        g.traverse(o => {
            if (!o.isMesh) return;
            o.geometry.dispose();
            if (o === g.userData.face) {
                if (g.userData.ownTexture && o.material.map) o.material.map.dispose();
                o.material.dispose();
            }
        });
    }

    // La parada superada florece: flores y un corazón flotante (o farolillo de noche)
    async bloom(stop, { lantern = false, silent = false } = {}) {
        // En el arcén interior, para no tapar la cámara que va por fuera
        const pos = this.track.point(stop.s + SIGN_AHEAD, 2.3);
        if (!silent) this.fx.heartBurst(pos.clone().add(new THREE.Vector3(0, 2.5, 0)), 16);
        const flowers = ['nature/flower_redA', 'nature/flower_yellowA', 'nature/flower_purpleA'];
        const items = [];
        for (let i = 0; i < 7; i++) {
            const m = await model(flowers[i % 3]);
            const a = (i / 7) * Math.PI * 2 + Math.random() * 0.4, d = 0.6 + Math.random() * 1.1;
            const x = pos.x + Math.cos(a) * d, z = pos.z + Math.sin(a) * d;
            m.position.set(x, this.track.heightAt(x, z), z);
            const s0 = m.scale.x * (1 + Math.random() * 0.5);
            m.scale.setScalar(0.001);
            this.scene.add(m);
            items.push([m, s0]);
        }
        if (silent) items.forEach(([m, s0]) => m.scale.setScalar(s0));
        else this.fx.tween(0.8, e => items.forEach(([m, s0]) => m.scale.setScalar(Math.max(0.001, s0 * e))), ease.back);

        const floater = lantern ? this.lantern() : this.fx.heart(stop.index);
        if (!lantern) floater.scale.setScalar(0.45);
        floater.userData.baseY = pos.y + 3.0;
        floater.userData.phase = Math.random() * 6;
        floater.position.set(pos.x, pos.y, pos.z);
        this.scene.add(floater);
        this.floaters.push(floater);
        return floater;
    }

    // Farolillo de papel que brilla (parte 3)
    lantern() {
        const g = new THREE.Group();
        const body = new THREE.Mesh(
            new THREE.CylinderGeometry(0.35, 0.28, 0.75, 12),
            new THREE.MeshBasicMaterial({ color: 0xffb347, toneMapped: false })
        );
        const glow = new THREE.Mesh(
            new THREE.SphereGeometry(0.9, 16, 12),
            new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.36, 0.1, 12), toon('#7a3b1d'));
        top.position.y = 0.42;
        g.add(body, glow, top);
        // Sin PointLight: añadir luces en tiempo real obliga a recompilar todos los shaders
        return g;
    }

    // Todos los corazones/farolillos suben al cielo (celebración)
    releaseFloaters() {
        this.floaters.forEach((f, i) => {
            const delay = i * 0.08;
            let t = -delay;
            this.fx.every(dt => {
                t += dt;
                if (t < 0) return true;
                f.userData.baseY += dt * (2 + i % 3);
                return f.userData.baseY < 80;
            });
        });
    }
}
