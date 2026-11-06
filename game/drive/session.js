// ============================================================================
//  SESIÓN DE CARRERA: contrarreloj, carrera contra la IA y pique a dos
// ============================================================================
//   time    · 1 jugador · vueltas contra el reloj y el fantasma de tu mejor vuelta en el mapa
//   race    · 1 jugador + 3 rivales de la IA · gana quien complete antes las vueltas
//   versus  · 2 jugadores en pantalla partida · a lo Micro Machines: si uno saca más de
//             GAP de ventaja (o el otro se cae), punto para el que va delante y se recolocan
//             los dos juntos. Gana quien llega antes a POINTS.
import * as THREE from 'three';
import { Circuit, Lapper } from './circuit.js';
import { Vehicle, Effects } from './vehicle.js';
import { buildCar, physicsFor, ghostify, CARS, COLORS } from './cars.js';
import { ChaseCam } from './camera.js';
import { AIDriver } from './ai.js';
import { Recorder, loadGhost, saveGhost, playGhost } from './ghost.js';
import { fmt } from './hud.js';

const sfx = (n, ...a) => { if (window.sfx && window.sfx[n]) window.sfx[n](...a); };
export const GAP = 40, POINTS = 5;
const AI_NAMES = ['Lola Turbo', 'Paco Derrapes', 'Nuria Nitro', 'Toni Trompos'];

export class RaceSession {
    // app: { engine, controls, hud }; opts: { map, mode, players: [cfg, cfg?], laps }
    constructor(app, opts) {
        this.app = app;
        this.opts = opts;
        this.mode = opts.mode;
        this.laps = opts.laps ?? opts.map.laps ?? 3;
        this.cars = [];
        this.time = 0;
        this.state = 'loading';
    }

    async load(onProgress) {
        const { engine } = this.app;
        const map = this.opts.map;
        this.C = new Circuit(engine.scene, map);
        await map.build(this.C, engine);
        onProgress && onProgress(0.6);
        this.FX = new Effects(engine.scene);
        const grid = this.C.grid2(this.mode === 'race' ? 4 : this.mode === 'versus' ? 2 : 1);
        // jugadores
        const players = this.mode === 'versus' ? this.opts.players.slice(0, 2) : [this.opts.players[0]];
        const pcol = ['#ff4d8d', '#2f9e44'];
        for (let i = 0; i < players.length; i++) {
            const m = await buildCar(players[i]);
            const v = new Vehicle(m, physicsFor(players[i], m.dims), { name: this.mode === 'versus' ? `J${i + 1}` : 'Tú', color: pcol[i] });
            v.isPlayer = true; v.slot = this.mode === 'versus' ? `p${i + 1}` : 'any'; v.pi = i;
            if (this.opts.autopilot) v.auto = new AIDriver(v, null, { skill: 0.95, lane: i ? 1.5 : -1.5 });
            this.cars.push(v);
        }
        // rivales de la IA: coches distintos al tuyo, con tuneos y colores variados
        if (this.mode === 'race') {
            const pool = CARS.filter(c => c.id !== players[0].id).sort(() => Math.random() - 0.5);
            const skills = [0.97, 0.91, 0.85];
            for (let k = 0; k < 3; k++) {
                const def = pool[k % pool.length];
                const cfg = { id: def.id, color: COLORS[(k * 4 + 3) % COLORS.length], tune: { wheels: 1 + (k === 2 ? 0.4 : 0), track: 1 + k * 0.05, lift: k === 2 ? 0.4 : 0, length: 1 } };
                const m = await buildCar(cfg, { lod: true });
                const v = new Vehicle(m, physicsFor(cfg, m.dims), { name: AI_NAMES[k], color: ['#ffd23f', '#2f6fe0', '#8e5bd8'][k] });
                v.ai = new AIDriver(v, this.C, { skill: skills[k], lane: [-2, 2, 0][k] });
                this.cars.push(v);
            }
        }
        for (const v of this.cars) if (v.auto) v.auto.C = this.C;
        onProgress && onProgress(0.85);
        // fantasma
        if (this.mode === 'time') {
            this.rec = new Recorder();
            this.record = loadGhost(map.id);
            if (this.record) await this._makeGhost(this.record.cfg);
        }
        // parrilla: el jugador sale el primero en contrarreloj; en carrera, desde atrás
        const order = this.mode === 'race' ? [3, 0, 1, 2] : [0, 1];
        this.cars.forEach((v, i) => {
            const g = grid[order[i] ?? i] || grid[i];
            v.reset(g.x, g.z, g.h);
            v.lap = new Lapper(this.C, v, g.along);
            v.done = false;
            engine.scene.add(v.root);
        });
        // cámaras
        this.cams = [];
        const pl = this.cars.filter(v => v.isPlayer);
        pl.forEach((v, i) => {
            const cam = i === 0 ? engine.camera : new THREE.PerspectiveCamera(50, 1, 0.3, 900);
            const cc = new ChaseCam(cam); cc.target(v); cc.update(0.016, this.C);
            this.cams.push(cc);
        });
        if (pl.length > 1) this._split(true);
        this.C.follow(pl[0].root.position);
        this.state = 'ready';
    }

    async _makeGhost(cfg) {
        if (this.ghost) { this.app.engine.scene.remove(this.ghost.root); this.ghost = null; }
        const m = await buildCar(cfg, { lod: true });
        ghostify(m);
        const g = new Vehicle(m, physicsFor(cfg, m.dims), { name: 'Fantasma', color: '#bfe8ff' });
        g.ghost = true; g.blob.visible = false;
        this.ghost = g;
        this.app.engine.scene.add(g.root);
    }

    // Pantalla partida (dos cámaras, una a cada lado). Sin postproceso para ir fluido.
    _split(on) {
        const E = this.app.engine;
        if (!on) { E.renderHook = null; E._resize(); return; }
        E.renderHook = () => {
            const R = E.renderer, w = innerWidth, h = innerHeight;
            R.setScissorTest(true);
            this.cams.forEach((cc, i) => {
                const x = i * w / 2;
                R.setViewport(x, 0, w / 2, h); R.setScissor(x, 0, w / 2, h);
                cc.cam.aspect = (w / 2) / h; cc.cam.updateProjectionMatrix();
                R.render(E.scene, cc.cam);
            });
            R.setScissorTest(false);
            R.setViewport(0, 0, w, h);
        };
    }

    // ---------------------------------------------------------------- partida
    // Devuelve una promesa con el resultado: { mode, places, laps, best, record, points }
    run() {
        const { engine, hud } = this.app;
        return new Promise(resolve => {
            this.resolve = resolve;
            const nP = this.cars.filter(v => v.isPlayer).length;
            hud.setup(nP, { lap: this.mode !== 'versus', pos: this.mode === 'race', best: this.mode !== 'versus', points: this.mode === 'versus', title: this.opts.map.name });
            hud.miniSetup(this.C);
            this._helpText();
            this.cars.filter(v => v.isPlayer).forEach((v, i) => {
                hud.set(i, 'time', fmt(0));
                if (this.mode !== 'versus') hud.set(i, 'lap', `1/${this.laps}`);
                if (this.mode === 'time') hud.set(i, 'best', this.record ? fmt(this.record.time) : '–');
                if (this.mode === 'versus') hud.set(i, 'points', '0');
            });
            this.points = [0, 0];
            if (window.sfx) { sfx('music', 'road'); sfx('ambience', null); }
            this.state = 'countdown';
            this.off = engine.onUpdate((dt, t) => this.update(dt, t));
            hud.countdown(window.sfx).then(() => { this.state = 'run'; this.t0 = this.time; this.cars.forEach(v => { v.lap.lapStart = 0; }); });
        });
    }

    _helpText() {
        const pad = this.app.controls.pads().length > 0;
        const H = this.app.hud;
        if (this.mode === 'versus') H.setHelp('J1: <b>W A S D</b> · <b>Espacio</b> freno de mano · <b>Mayús izq.</b> turbo &nbsp;|&nbsp; J2: <b>flechas</b> · <b>Ctrl dcho.</b> freno · <b>Mayús dcha.</b> turbo &nbsp;·&nbsp; 🎮 cada uno su mando');
        else H.setHelp(pad ? '🎮 <b>RT</b> acelerar · <b>LT</b> frenar / atrás · <b>B</b> freno de mano · <b>A</b> turbo · <b>Y</b> volver a la pista · <b>Start</b> pausa'
            : '⌨️ <b>W A S D</b> / flechas · <b>Espacio</b> freno de mano · <b>Mayús</b> turbo · <b>R</b> volver a la pista · <b>Esc</b> pausa');
    }

    update(dt, t) {
        const { controls, hud } = this.app;
        if (this.state === 'paused' || this.state === 'over') { controls.endFrame(); return; }
        const running = this.state === 'run';
        if (running) this.time += dt;
        const raceT = this.time - (this.t0 || 0);
        const live = this.cars.filter(v => !v.ghost);
        // controles
        for (const v of live) {
            let inp;
            if (v.isPlayer) {
                inp = controls.read(v.slot);
                if (v.auto) { const a = v.auto.control(dt, 0); inp = { ...inp, ...a, pressed: inp.pressed }; }
                if (inp.pressed.pause && this.onPause) { this.onPause(); controls.endFrame(); return; }
                if (inp.pressed.horn) sfx('honk');
                if (inp.pressed.reset && running) this._respawn(v, '↩️ ¡De vuelta a la pista!');
            } else {
                const lead = v.lap.total - this.cars[0].lap.total;
                inp = v.ai.control(dt, lead);
            }
            if (!running || v.done) inp = { thr: 0, brk: v.done ? 0.4 : 1, steer: 0, hb: false, turbo: false };
            if (v.respawnT > 0) { v.respawnT -= dt; inp = { thr: 0, brk: 1, steer: 0 }; }
            v.inp = inp;
        }
        // física en subpasos de 1/60 s como mucho (que nada atraviese nada aunque vaya a pocos fps)
        const n = Math.min(6, Math.ceil(dt / (1 / 60)));
        for (let k = 0; k < n; k++) for (const v of live) v.step(dt / n, v.inp, this.C, live);
        for (const v of live) {
            v.emit(dt, this.FX);
            if (v.landed && v.isPlayer) { sfx('pop'); controls.rumble(v.slot, Math.min(1, v.landed / 20), 140); v.landed = 0; }
            if (v.lastHit > 6 && v.isPlayer && !v._hitT) { controls.rumble(v.slot, Math.min(1, v.lastHit / 14), 120); sfx('tap'); v._hitT = 0.3; }
            if (v._hitT) { v._hitT -= dt; if (v._hitT <= 0) { v._hitT = 0; v.lastHit = 0; } }
            // vueltas
            if (running && !v.done) {
                const ev = v.lap.update(raceT);
                if (ev === 'lap') this._onLap(v, raceT);
            }
            // caídas y extravíos
            if (v.y < -8) this._respawn(v, v.isPlayer ? '🫠 ¡Al suelo! Vuelta a la mesa…' : null, true);
            else if (v.prog && v.prog.dist > this.C.width * 2.5) { v.lostT = (v.lostT || 0) + dt; if (v.lostT > (v.isPlayer ? 6 : 3)) this._respawn(v, v.isPlayer ? '🧭 Te has perdido… ¡de vuelta a la pista!' : null); }
            else v.lostT = 0;
        }
        // fantasma
        if (this.mode === 'time' && this.ghost && this.record && running) playGhost(this.record, raceT - this.cars[0].lap.lapStart, this.ghost);
        if (this.mode === 'time' && running) this.rec.step(dt, this.cars[0]);
        // pique a dos
        if (this.mode === 'versus' && running) this._versus(dt);
        // cámaras, HUD, decorado
        const camInfo = [];
        this.cams.forEach(cc => { cc.update(dt, this.C); camInfo.push({ pos: cc.cam.position, target: cc.v.root.position }); });
        this.C.follow(this.cams[0].v.root.position);
        this.C.update(dt, t, camInfo);
        this.FX.update(dt);
        const players = this.cars.filter(v => v.isPlayer);
        players.forEach((v, i) => {
            hud.dash(i, v);
            if (running && !v.done) hud.set(i, 'time', fmt(raceT - (this.mode === 'versus' ? 0 : v.lap.lapStart)));
        });
        if (this.mode === 'race') {
            const order = this._order();
            hud.set(0, 'pos', `${order.indexOf(players[0]) + 1}/${this.cars.length}`);
        }
        hud.miniDraw(live);
        if (window.sfx) sfx('engine', Math.min(1, Math.abs(players[0].vf) / 20));
        controls.endFrame();
    }

    _order() {
        return [...this.cars.filter(v => !v.ghost)].sort((a, b) => (a.done && b.done) ? a.finishT - b.finishT : a.done ? -1 : b.done ? 1 : b.lap.total - a.lap.total);
    }

    _respawn(v, msg, fell = false) {
        if (v.respawnT > 0) return;
        const along = v.lap.lastGood - 3;
        const p = this.C.at(along);
        v.reset(p.x, p.z, p.h);
        v.ti = -1;
        v.lap.teleport(along);
        v.respawnT = 0.6;
        if (v.isPlayer) {
            const cc = this.cams.find(c => c.v === v); if (cc) cc.snap();
            if (msg) this.app.hud.msg(v.pi, msg, fell ? 'bad' : 'info', 2200);
            if (fell) sfx('bad');
        }
    }

    _onLap(v, raceT) {
        const { hud } = this.app;
        const lt = v.lap.lapTimes[v.lap.lapTimes.length - 1];
        const n = v.lap.lapTimes.length;
        if (this.mode === 'versus') return;
        if (this.mode === 'time' && v.isPlayer) this._checkRecord(lt);
        if (n >= this.laps) {
            v.done = true; v.finishT = raceT;
            if (v.isPlayer) return this._finish(v, raceT);
            return;
        }
        if (v.isPlayer) {
            hud.set(v.pi, 'lap', `${n + 1}/${this.laps}`);
            const best = Math.min(...v.lap.lapTimes);
            hud.set(v.pi, 'best', fmt(this.mode === 'time' && this.record ? Math.min(best, this.record.time) : best));
            if (n === this.laps - 1) hud.msg(v.pi, '🏁 ¡Última vuelta!', 'ok', 2200); else hud.msg(v.pi, `Vuelta ${n}: ${fmt(lt)}`, 'info');
            sfx('good');
        }
    }

    _checkRecord(lt) {
        const rec = this.rec;
        if (!this.record || lt < this.record.time) {
            const first = !this.record;
            this.record = { time: lt, cfg: this.opts.players[0], s: rec.s.slice(), date: Date.now() };
            saveGhost(this.opts.map.id, this.record);
            this.app.hud.say(first ? `⏱️ Primer récord: ${fmt(lt)} · ¡ahora a por tu fantasma!` : `🏆 ¡Nuevo récord! ${fmt(lt)}`, 3000);
            sfx('fanfare');
            this.newRecord = true;
            if (first) this._makeGhost(this.record.cfg);
        }
        rec.restart();
    }

    _versus(dt) {
        const [a, b] = this.cars.filter(v => v.isPlayer);
        if (this.finishing) return;
        if (this.roundT > 0) { this.roundT -= dt; return; }
        let winner = -1, why = '';
        const gap = a.lap.total - b.lap.total;
        if (a.y < -6 && b.y >= -6) { winner = 1; why = 'J1 se ha caído'; }
        else if (b.y < -6 && a.y >= -6) { winner = 0; why = 'J2 se ha caído'; }
        else if (Math.abs(gap) > GAP) { winner = gap > 0 ? 0 : 1; why = `J${winner + 1} se ha escapado`; }
        if (winner < 0) return;
        this.points[winner]++;
        const H = this.app.hud;
        H.set(winner, 'points', String(this.points[winner]));
        sfx('fanfare');
        if (this.points[winner] >= POINTS) {
            H.say(`🏆 ¡Gana el Jugador ${winner + 1}! ${this.points[0]} – ${this.points[1]}`, 4000);
            return this._finish(this.cars[winner], this.time);
        }
        H.say(`⭐ Punto para J${winner + 1} (${why}) · ${this.points[0]} – ${this.points[1]}`, 2400);
        // recolocar a los dos juntos donde está el que va delante
        const lead = winner === 0 ? a : b;
        const along = lead.lap.lastGood - 2;
        [a, b].forEach((v, i) => {
            const p = this.C.at(along, (i ? 1 : -1) * this.C.width * 0.22);
            v.reset(p.x, p.z, p.h); v.ti = -1;
            v.lap.teleport(along, lead.lap.laps);
            v.respawnT = 1.4;
        });
        this.cams.forEach(c => c.snap());
        this.roundT = 1.4;
    }

    _finish(v, raceT) {
        if (this.finishing) return;
        this.finishing = true;
        const players = this.cars.filter(c => c.isPlayer);
        const res = { mode: this.mode, map: this.opts.map, laps: v.lap.lapTimes.slice(), total: raceT, best: v.lap.best, record: this.record ? this.record.time : null, newRecord: !!this.newRecord };
        if (this.mode === 'race') res.places = this._order().map(c => ({ name: c.name, color: c.color, player: !!c.isPlayer, time: c.done ? c.finishT : null }));
        if (this.mode === 'versus') { res.points = this.points.slice(); res.winner = players.indexOf(v); }
        sfx('fanfare');
        if (window.confetti) window.confetti({ particleCount: 120, spread: 90, origin: { y: 0.6 }, colors: ['#ff4d8d', '#ffd23f', '#ffffff', '#7ad7ff'] });
        // unos segundos de vuelta de honor (frenando) antes de la tarjeta
        players.forEach(p => { p.done = true; });
        setTimeout(() => { this.state = 'over'; this.resolve(res); }, 2200);
    }

    pause(on) {
        if (on && this.state === 'run') { this._prev = 'run'; this.state = 'paused'; sfx('engine', 0); }
        else if (!on && this.state === 'paused') this.state = this._prev || 'run';
    }

    dispose() {
        const { engine, hud } = this.app;
        if (this.off) this.off();
        this._split(false);
        for (const v of this.cars) engine.scene.remove(v.root);
        if (this.ghost) engine.scene.remove(this.ghost.root);
        this.FX && this.FX.dispose();
        this.C && this.C.dispose();
        hud.hide();
        sfx('engine', 0);
    }
}
