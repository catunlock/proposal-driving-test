// ============================================================================
//  EXAMEN DE CIRCULACIÓN con el coche del garaje
// ============================================================================
// Reutiliza el examen del juego (game/exam.js) tal cual: su barrio, su examinador y sus pruebas.
// Aquí solo se le da un "app" con el coche tuneado (modelo, física y huella para los bordillos),
// la cámara de persecución del modo conducción y una pausa que retiene sus actualizaciones.
import * as THREE from 'three';
import { buildExam, examSummary } from '../exam.js';
import { buildCar, physicsFor } from './cars.js';
import { Vehicle } from './vehicle.js';
import { ChaseCam } from './camera.js';
import { setupEnv } from './maps/common.js';

const sfx = (n, ...a) => { if (window.sfx && window.sfx[n]) window.sfx[n](...a); };

export class ExamSession {
    constructor(app, opts) { this.app = app; this.opts = opts; this.mode = 'exam'; this.paused = false; this.offs = []; }

    async load() {
        const E = this.app.engine;
        // luz de atardecer (el barrio del examen está lejos del resto, en (6000, 0, 6000))
        this.root = new THREE.Group(); E.scene.add(this.root);
        const env = { root: this.root };
        setupEnv(E, env, { bg: '#f4b38c', fog: [90, 260], sky: '#ffe3cc', ground: '#5a4a6a', hemi: 1.25, sun: '#ffd6a8', sunI: 2.2, sunDir: [-0.5, 0.7, 0.4] });
        this.follow = env.follow;

        const cfg = this.opts.players[0];
        const m = await buildCar(cfg);
        const p = physicsFor(cfg, m.dims);
        const v = this.v = new Vehicle(m, p, { name: 'Tú', color: '#ff4d8d' });
        E.scene.add(v.root);
        // física del examen (a escala de ciudad) según el coche
        const phys = { maxV: 11 * p.maxV / 17, maxRev: 3.2, accel: 6.2 * p.accel / 10.5, brake: 11, drag: 0.32, roll: 0.7, steerMax: 0.7 * p.steerMax / 0.62, wheelbase: p.wheelbase };
        const hw = m.dims.wid / 2 * 0.9, hl = m.dims.len / 2 * 0.94;
        const pts = [[hw, hl], [-hw, hl], [hw, -hl], [-hw, -hl], [hw + 0.03, 0], [-hw - 0.03, 0]];
        // el coche que ve el examen
        let last = E.time;
        const car = {
            root: v.root,
            size: new THREE.Vector3(m.dims.wid, m.dims.height, m.dims.len),
            setFree: (pose) => {
                if (!pose) return;
                const dt = Math.max(1 / 240, Math.min(0.1, E.time - last)); last = E.time;
                v.x = pose.pos.x; v.y = pose.pos.y + 0.02; v.z = pose.pos.z; v.h = pose.h;
                v.vf = pose.v; v.acc = pose.acc || 0; v.w = pose.yawRate || 0;
                v.steer = Math.abs(v.vf) > 0.2 ? Math.atan(-v.w * p.wheelbase / v.vf) : v.steer * 0.9;
                v.ground = v.y;
                v.syncVisual(dt);
            },
            honk: () => { sfx('honk'); v.hop = 0.6; },
            shake: () => { v.shakeT = 0.4; }
        };
        // la cámara
        this.cc = new ChaseCam(E.camera); this.cc.target(v);
        this.camMode = 'chase';
        const rig = {
            chase: () => { this.camMode = 'chase'; },
            snap: () => this.cc.snap(),
            orbit: (center, o = {}) => { this.camMode = 'orbit'; this.orbitC = center.clone(); this.orbitO = { radius: 11, height: 4.5, speed: 0.12, angle: 0, lookY: 1, ...o }; }
        };
        // un "engine" que respeta la pausa
        const self = this;
        const eng = {
            scene: E.scene, camera: E.camera, renderer: E.renderer,
            get time() { return E.time; },
            onUpdate(fn) { const off = E.onUpdate((dt, t) => { if (!self.paused) fn(dt, t); }); self.offs.push(off); return off; }
        };
        this.exam = await buildExam({ engine: eng, car, rig }, { phys, pts });
        this.offs.push(E.onUpdate(dt => this._update(dt)));
        this.state = 'ready';
    }

    _update(dt) {
        const E = this.app.engine;
        const inp = this.app.controls.read('any');
        if (inp.pressed.pause && this.onPause && !this.paused) this.onPause();
        this.app.controls.endFrame();
        if (this.camMode === 'orbit') {
            const o = this.orbitO;
            o.angle += o.speed * dt;
            E.camera.position.set(this.orbitC.x + Math.sin(o.angle) * o.radius, this.orbitC.y + o.height, this.orbitC.z + Math.cos(o.angle) * o.radius);
            E.camera.lookAt(this.orbitC.x, this.orbitC.y + o.lookY, this.orbitC.z);
        } else this.cc.update(dt, null);
        this.follow(this.v.root.position);
        if (!this.paused && window.sfx) sfx('engine', Math.min(1, Math.abs(this.v.vf) / 14));
    }

    async run() {
        if (window.sfx) sfx('music', 'sunset');
        const r = await this.exam.run();
        this.exam.leave();
        const n = r.faults.length;
        return {
            mode: 'exam',
            title: r.skipped ? 'Aprobado (por la vía rápida) 😉' : n === 0 && !r.graves ? '¡APTO con matrícula! 🏆' : '¡APTO! 🎉',
            html: `<p class="big">APTO</p><p>${examSummary(r)}</p>${r.faults.length ? `<p style="font-size:.95rem">Faltas leves: ${[...new Set(r.faults)].join(' · ')}</p>` : ''}`
        };
    }

    pause(on) { this.paused = on; if (on) sfx('engine', 0); }

    dispose() {
        const E = this.app.engine;
        this.offs.forEach(off => off());
        const d = E.scene.getObjectByName('exam-district'); if (d) E.scene.remove(d);
        E.scene.remove(this.root); E.scene.remove(this.v.root);
        const hud = document.getElementById('exam-hud'); hud.classList.remove('on'); hud.hidden = true;
        sfx('engine', 0);
    }
}
