// IA de los rivales: siguen el trazado mirando por delante, frenan antes de las curvas cerradas
// y cada uno lleva su carril y su nivel. Si se atascan, marcha atrás y vuelta a intentarlo.
// Un poco de "goma": aprietan si el jugador se escapa y aflojan si van muy por delante.
const TAU = Math.PI * 2;
const wrap = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

export class AIDriver {
    constructor(v, C, { skill = 0.9, lane = 0, seed = 0 } = {}) {
        this.v = v; this.C = C;
        this.skill = skill; this.lane = lane; this.seed = seed;
        this.stuckT = 0; this.revT = 0; this.wob = Math.random() * 10;
    }
    // lead: cuánto va por delante del jugador (en distancia de pista; negativo = por detrás)
    control(dt, lead = 0) {
        const v = this.v, C = this.C;
        const pr = v.prog || C.project(v.x, v.z, v.ti ?? -1);
        const sp = Math.abs(v.vf);
        if (this.revT > 0) {
            this.revT -= dt;
            return { thr: 0, brk: 1, steer: this.revSteer, hb: false, turbo: false };
        }
        // carril: oscila un poco para que no vayan en fila india
        const lane = this.lane + Math.sin(this.wob + performance.now() * 0.0004) * C.width * 0.12;
        const look = 4.5 + sp * 0.55;
        const T = C.at(pr.along + look, THREE_clamp(lane, -C.width * 0.35, C.width * 0.35));
        const want = Math.atan2(T.x - v.x, T.z - v.z);
        const dh = wrap(want - v.h);
        let steer = THREE_clamp(-dh * 2.4, -1, 1);
        // velocidad para la curva más cerrada de lo que viene
        let k = 0;
        for (let d = 2; d <= 10 + sp * 1.4; d += 2) k = Math.max(k, Math.abs(C.curvatureAt(pr.along + d)));
        const band = THREE_clamp(1 - lead / 120, 0.85, 1.12);
        const vmax = v.P.maxV * (v.surface ? v.surface.cap : 1) * this.skill * band;
        const vT = Math.min(vmax, Math.sqrt((15 * v.P.grip * this.skill) / Math.max(k, 1e-3)));
        let thr = sp < vT ? 1 : 0.15, brk = sp > vT + 2.5 ? 0.8 : 0;
        // fuera de la pista: volver hacia el centro
        if (Math.abs(pr.off) > C.width / 2) steer = THREE_clamp(steer + Math.sign(pr.off) * 0.4, -1, 1);
        // atascado contra algo
        if (sp < 0.8 && thr > 0.5) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
        if (this.stuckT > 1.4) { this.stuckT = 0; this.revT = 1.1; this.revSteer = steer > 0 ? -1 : 1; }
        const turbo = this.skill > 0.85 && v.turbo > 0.6 && k < 0.012 && sp > v.P.maxV * 0.6 && Math.random() < 0.02;
        return { thr, brk, steer, hb: false, turbo };
    }
}
function THREE_clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
