// Fantasma de la contrarreloj: graba la vuelta (20 muestras/s) y reproduce la mejor de cada mapa.
// Se guarda en el navegador con el coche con el que se hizo, para que el fantasma sea ese mismo coche.
const KEY = 'drive.ghost.v1.';
const HZ = 20;

export function loadGhost(mapId) {
    try { const g = JSON.parse(localStorage.getItem(KEY + mapId) || 'null'); return g && g.time && g.s ? g : null; } catch (e) { return null; }
}
export function saveGhost(mapId, rec) {
    try { localStorage.setItem(KEY + mapId, JSON.stringify(rec)); } catch (e) { /* lleno o sin almacenamiento */ }
}

export class Recorder {
    constructor() { this.s = []; this.t = 0; this.next = 0; }
    restart() { this.s = []; this.t = 0; this.next = 0; }
    step(dt, v) {
        this.t += dt;
        while (this.next <= this.t) {
            this.s.push(+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2), +v.h.toFixed(3));
            this.next += 1 / HZ;
        }
    }
}

// Coloca el vehículo fantasma en el instante t de la grabación
export function playGhost(rec, t, v) {
    const s = rec.s, n = s.length / 4;
    if (!n) return false;
    const f = Math.min(n - 1, t * HZ), i = Math.floor(f), j = Math.min(n - 1, i + 1), k = f - i;
    const L = (a, b) => a + (b - a) * k;
    let dh = s[j * 4 + 3] - s[i * 4 + 3];
    while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
    v.x = L(s[i * 4], s[j * 4]); v.y = L(s[i * 4 + 1], s[j * 4 + 1]); v.z = L(s[i * 4 + 2], s[j * 4 + 2]);
    v.h = s[i * 4 + 3] + dh * k;
    v.syncVisual();
    v.root.visible = t * HZ <= n;
    return true;
}
