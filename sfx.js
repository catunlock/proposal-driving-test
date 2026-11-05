// ============================================================================
//  AUDIO: música de fondo generativa, ambiente y efectos. Todo sintetizado con
//  Web Audio (sin ficheros) y afinado en Fa mayor para que los efectos "encajen"
//  con la música. Compartido por index.html (3D) y classic.html (2D).
//
//  API:
//    sfx.click() sfx.tap() sfx.good() sfx.bad() sfx.next() sfx.start()
//    sfx.pop() sfx.bloom() sfx.arrive() sfx.fanfare() sfx.firework() sfx.shimmer() sfx.honk()
//    sfx.music('day' | 'sunset' | 'road' | 'night' | 'romance' | 'wedding' | 'waltz' | 'space' | 'suspense' | 'love' | 'celebrate' | null)
//    sfx.ambience('day' | 'night' | null)
//    sfx.engine(0..1)      zumbido eléctrico + rodadura según la velocidad
//    sfx.isMuted() sfx.setMuted(bool)
// ============================================================================
(function () {
    let ctx = null;
    let muted = false;
    try { muted = localStorage.getItem('sfx-muted') === '1'; } catch (e) { /* ignorar */ }

    let master, comp, sfxBus, musicBus, ambBus, reverb, reverbSend, noiseBuffer;

    const midi = n => 440 * Math.pow(2, (n - 69) / 12);
    const MASTER = 1.6;

    function init() {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
        master = ctx.createGain();
        master.gain.value = muted ? 0 : MASTER;
        master.connect(comp).connect(ctx.destination);

        reverb = ctx.createConvolver();
        reverb.buffer = impulse(2.8, 2.6);
        reverbSend = ctx.createGain();
        reverbSend.gain.value = 0.9;
        reverbSend.connect(reverb).connect(master);

        sfxBus = bus(0.8, 0.35);
        musicBus = bus(0.0, 0.5);
        ambBus = bus(0.55, 0.1);

        noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = noiseBuffer.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        return ctx;
    }

    // Bus con envío a la reverb
    function bus(vol, send) {
        const g = ctx.createGain();
        g.gain.value = vol;
        g.connect(master);
        const s = ctx.createGain();
        s.gain.value = send;
        g.connect(s).connect(reverbSend);
        return g;
    }

    // Respuesta al impulso sintética: ruido estéreo que se apaga (sala cálida)
    function impulse(seconds, decay) {
        const len = Math.floor(ctx.sampleRate * seconds);
        const buf = ctx.createBuffer(2, len, ctx.sampleRate);
        for (let c = 0; c < 2; c++) {
            const d = buf.getChannelData(c);
            let lp = 0;
            for (let i = 0; i < len; i++) {
                const t = i / len;
                lp += 0.25 * ((Math.random() * 2 - 1) - lp); // cola más oscura
                d[i] = lp * Math.pow(1 - t, decay) * (i < 200 ? i / 200 : 1);
            }
        }
        return buf;
    }

    function ac() {
        if (!ctx && !init()) return null;
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    function env(g, t, vol, attack, dur) {
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }

    function pan(node, p) {
        if (!p || !ctx.createStereoPanner) return node;
        const sp = ctx.createStereoPanner();
        sp.pan.value = p;
        node.connect(sp);
        return sp;
    }

    // --- Instrumentos -----------------------------------------------------------

    // Caja de música / celesta: parciales armónicos con caída rápida
    function musicBox(t, freq, { vol = 0.12, dur = 1.6, out = musicBus, p = 0 } = {}) {
        const parts = [[1, 1], [2, 0.32], [3.01, 0.1], [4.2, 0.05]];
        const g = ctx.createGain();
        env(g, t, vol, 0.004, dur);
        pan(g, p).connect(out);
        parts.forEach(([mul, a], i) => {
            const o = ctx.createOscillator();
            o.type = 'sine';
            o.frequency.value = freq * mul;
            const pg = ctx.createGain();
            pg.gain.setValueAtTime(a, t);
            pg.gain.exponentialRampToValueAtTime(0.0001, t + dur / (1 + i * 1.5));
            o.connect(pg).connect(g);
            o.start(t); o.stop(t + dur + 0.05);
        });
    }

    // Campana FM (brillante, para aciertos y destellos)
    function bell(t, freq, { vol = 0.1, dur = 1.8, out = sfxBus, bright = 1, p = 0 } = {}) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
        const m = ctx.createOscillator(); m.type = 'sine'; m.frequency.value = freq * 3.5;
        const mg = ctx.createGain();
        mg.gain.setValueAtTime(freq * 0.9 * bright, t);
        mg.gain.exponentialRampToValueAtTime(1, t + dur * 0.7);
        m.connect(mg).connect(o.frequency);
        const g = ctx.createGain();
        env(g, t, vol, 0.003, dur);
        o.connect(g);
        pan(g, p).connect(out);
        o.start(t); m.start(t); o.stop(t + dur + 0.05); m.stop(t + dur + 0.05);
    }

    // Marimba suave (grave, redonda)
    function marimba(t, freq, { vol = 0.12, dur = 0.6, out = sfxBus } = {}) {
        [[1, 1], [4, 0.12], [9.9, 0.03]].forEach(([mul, a], i) => {
            const o = ctx.createOscillator();
            o.type = 'sine';
            o.frequency.value = freq * mul;
            const g = ctx.createGain();
            env(g, t, vol * a, 0.003, dur / (1 + i * 2));
            o.connect(g).connect(out);
            o.start(t); o.stop(t + dur + 0.05);
        });
    }

    // Colchón de cuerdas/sintetizador muy suave
    function pad(t, notes, dur, { vol = 0.035, out = musicBus, cutoff = 1100 } = {}) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 0.4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + Math.min(1.4, dur * 0.4));
        g.gain.setValueAtTime(vol, t + dur * 0.75);
        g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.8);
        f.connect(g).connect(out);
        notes.forEach(n => {
            [-7, 7].forEach(cents => {
                const o = ctx.createOscillator();
                o.type = 'sawtooth';
                o.frequency.value = midi(n);
                o.detune.value = cents;
                o.connect(f);
                o.start(t); o.stop(t + dur + 0.9);
            });
        });
    }

    function bassNote(t, n, dur, vol = 0.09) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = midi(n);
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
        g.gain.exponentialRampToValueAtTime(vol * 0.5, t + dur * 0.6);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(f).connect(g).connect(musicBus);
        o.start(t); o.stop(t + dur + 0.05);
    }

    function noise(t, dur, { vol = 0.05, type = 'bandpass', f0 = 800, f1 = null, q = 0.8, out = sfxBus, attack = 0.01 } = {}) {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer;
        const f = ctx.createBiquadFilter();
        f.type = type; f.Q.value = q;
        f.frequency.setValueAtTime(f0, t);
        if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
        const g = ctx.createGain();
        env(g, t, vol, attack, dur);
        src.connect(f).connect(g).connect(out);
        src.start(t, Math.random()); src.stop(t + dur + 0.05);
    }

    function shaker(t, vol = 0.018) { noise(t, 0.07, { vol, type: 'highpass', f0: 7000, out: musicBus, attack: 0.005 }); }

    function heartbeat(t, vol = 0.22) {
        [0, 0.28].forEach((dt, i) => {
            const o = ctx.createOscillator();
            o.type = 'sine';
            o.frequency.setValueAtTime(70, t + dt);
            o.frequency.exponentialRampToValueAtTime(38, t + dt + 0.18);
            const g = ctx.createGain();
            env(g, t + dt, vol * (i ? 0.7 : 1), 0.01, 0.25);
            o.connect(g).connect(musicBus);
            o.start(t + dt); o.stop(t + dt + 0.3);
        });
    }

    // Eco con realimentación (corcheas con puntillo) para la música de carretera
    let echoIn = null, echoDelay = null;
    function echo() {
        if (echoIn) return echoIn;
        echoIn = ctx.createGain();
        echoDelay = ctx.createDelay(1.5); echoDelay.delayTime.value = 0.43;
        const fb = ctx.createGain(); fb.gain.value = 0.33;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
        const wet = ctx.createGain(); wet.gain.value = 0.4;
        echoIn.connect(echoDelay); echoDelay.connect(lp).connect(fb).connect(echoDelay);
        lp.connect(wet).connect(musicBus);
        return echoIn;
    }
    function sendEcho(node, amount) { if (!amount) return; const s = ctx.createGain(); s.gain.value = amount; node.connect(s).connect(echo()); }

    // Sintetizador "pluck" (arpegios de synthwave)
    function pluck(t, freq, { vol = 0.03, dur = 0.22, cutoff = 2400, type = 'square', p = 0, send = 0 } = {}) {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 3;
        f.frequency.setValueAtTime(cutoff, t); f.frequency.exponentialRampToValueAtTime(Math.max(180, cutoff * 0.12), t + dur);
        const g = ctx.createGain(); env(g, t, vol, 0.003, dur);
        o.connect(f).connect(g);
        const out = pan(g, p); out.connect(musicBus); sendEcho(out, send);
        o.start(t); o.stop(t + dur + 0.05);
    }

    // Bajo de sintetizador con filtro que se cierra (pulso de corcheas)
    function synthBass(t, n, dur, vol = 0.07) {
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 4;
        f.frequency.setValueAtTime(1100, t); f.frequency.exponentialRampToValueAtTime(170, t + dur);
        const g = ctx.createGain(); env(g, t, vol, 0.004, dur + 0.05);
        f.connect(g).connect(musicBus);
        [['sawtooth', 0, 1], ['sine', 0, 1.4]].forEach(([type, det, a]) => {
            const o = ctx.createOscillator(); o.type = type; o.frequency.value = midi(n); o.detune.value = det;
            const og = ctx.createGain(); og.gain.value = a;
            o.connect(og).connect(f); o.start(t); o.stop(t + dur + 0.1);
        });
    }

    // Batería electrónica suave
    function kick(t, vol = 0.3) {
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
        const g = ctx.createGain(); env(g, t, vol, 0.003, 0.32);
        o.connect(g).connect(musicBus); o.start(t); o.stop(t + 0.35);
    }
    function snare(t, vol = 0.06) {
        noise(t, 0.18, { vol, type: 'bandpass', f0: 1800, q: 0.6, out: musicBus, attack: 0.002 });
        const o = ctx.createOscillator(); o.type = 'triangle';
        o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
        const g = ctx.createGain(); env(g, t, vol * 0.9, 0.002, 0.1);
        o.connect(g).connect(musicBus); o.start(t); o.stop(t + 0.12);
    }

    // Voz solista de sintetizador con vibrato tardío y eco
    function lead(t, n, dur, vol = 0.045) {
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2000; f.Q.value = 1;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.04);
        g.gain.setValueAtTime(vol * 0.85, t + Math.max(0.05, dur - 0.05));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
        const lfo = ctx.createOscillator(); lfo.frequency.value = 5.3;
        const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(9, t + Math.min(0.5, dur));
        lfo.connect(lg);
        f.connect(g);
        const out = pan(g, 0.08); out.connect(musicBus); sendEcho(out, 0.45);
        [['sawtooth', -6, 0.6], ['sawtooth', 6, 0.6], ['triangle', 1200, 0.5]].forEach(([type, det, a]) => {
            const o = ctx.createOscillator(); o.type = type; o.frequency.value = midi(n); o.detune.value = det;
            lg.connect(o.detune);
            const og = ctx.createGain(); og.gain.value = a;
            o.connect(og).connect(f); o.start(t); o.stop(t + dur + 0.35);
        });
        lfo.start(t); lfo.stop(t + dur + 0.35);
    }

    // Piano: parciales casi armónicos, ataque rápido y brillo que se apaga
    function piano(t, n, { vol = 0.08, dur = 2.4, p = 0 } = {}) {
        const freq = midi(n);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
        g.gain.exponentialRampToValueAtTime(vol * 0.38, t + 0.4);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        const f = ctx.createBiquadFilter(); f.type = 'lowpass';
        f.frequency.setValueAtTime(Math.min(9000, freq * 9), t);
        f.frequency.exponentialRampToValueAtTime(Math.max(500, freq * 2.2), t + Math.min(1.4, dur));
        f.connect(g); pan(g, p).connect(musicBus);
        [[1, 1], [2, 0.42], [3, 0.18], [4, 0.09], [6, 0.035]].forEach(([k, a]) => {
            const o = ctx.createOscillator(); o.type = 'sine';
            o.frequency.value = freq * k * (1 + 0.0004 * k * k);
            const pg = ctx.createGain(); pg.gain.value = a;
            o.connect(pg).connect(f); o.start(t); o.stop(t + dur + 0.05);
        });
    }

    // Cuerdas: sierras desafinadas, filtro suave, entrada lenta y vibrato
    function strings(t, notes, dur, vol = 0.018) {
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1500; f.Q.value = 0.5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + Math.min(1.6, dur * 0.45));
        g.gain.setValueAtTime(vol, t + dur * 0.8);
        g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.4);
        f.connect(g).connect(musicBus);
        const lfo = ctx.createOscillator(); lfo.frequency.value = 4.8;
        const lg = ctx.createGain(); lg.gain.value = 7; lfo.connect(lg);
        notes.forEach(n => [-9, 0, 9].forEach(c => {
            const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = c;
            lg.connect(o.detune);
            o.connect(f); o.start(t); o.stop(t + dur + 1.5);
        }));
        lfo.start(t); lfo.stop(t + dur + 1.5);
    }

    // --- Música generativa -----------------------------------------------------

    // Acordes (MIDI). Fa mayor: cálido y romántico.
    const C = {
        Fmaj7: [53, 57, 60, 64], Dm7: [50, 53, 57, 60], Bbmaj7: [46, 50, 53, 57], C: [48, 52, 55, 60], Csus: [48, 53, 55, 60],
        Am7: [45, 52, 55, 60], Gm7: [43, 50, 53, 58], FA: [45, 53, 57, 60], Bbm6: [46, 49, 53, 55], Dm: [50, 53, 57, 62],
        Am: [45, 52, 57, 60], Bb: [46, 53, 58, 62], Gm: [43, 50, 55, 58], F: [41, 53, 57, 60], CE: [40, 52, 55, 60]
    };

    // Melodías: [tiempo en el compás, nota MIDI, duración en tiempos]
    const MEL_DAY = [
        [[0, 72, 1], [1, 76, 1], [2, 77, 2]],
        [[0, 74, 1], [1, 72, 1], [2, 69, 2]],
        [[0, 70, 1], [1, 74, 1], [2, 77, 1.5], [3.5, 76, 0.5]],
        [[0, 72, 3]]
    ];
    const MEL_LOVE = [
        [[0, 69, 1.5], [1.5, 72, 0.5], [2, 77, 2]],
        [[0, 76, 1.5], [1.5, 72, 0.5], [2, 69, 2]],
        [[0, 74, 1], [1, 77, 1], [2, 81, 1.5], [3.5, 79, 0.5]],
        [[0, 77, 2], [2, 76, 2]],
        [[0, 74, 2], [2, 77, 2]],
        [[0, 74, 1], [1, 72, 1], [2, 70, 2]],
        [[0, 70, 1], [1, 74, 1], [2, 72, 2]],
        [[0, 72, 4]]
    ];

    // Parte 2 · "Carretera al atardecer": synthwave suave en Re menor (relativo de Fa)
    const ROAD = [
        { root: 38, arp: [62, 65, 69, 74], pad: [50, 53, 57] },   // Dm
        { root: 34, arp: [58, 62, 65, 70], pad: [46, 50, 53] },   // Bb
        { root: 41, arp: [60, 65, 69, 72], pad: [53, 57, 60] },   // F
        { root: 36, arp: [60, 64, 67, 72], pad: [48, 52, 55] }    // C
    ];
    const ROAD_MEL = [
        [[0, 69, 1], [1, 72, 0.5], [1.5, 74, 1.5], [3, 77, 1]],
        [[0, 74, 2], [2, 72, 1], [3, 70, 1]],
        [[0, 72, 1], [1, 69, 0.5], [1.5, 72, 1], [2.5, 77, 1.5]],
        [[0, 76, 3], [3, 72, 1]],
        [[0, 69, 1], [1, 72, 0.5], [1.5, 74, 1.5], [3, 77, 1]],
        [[0, 79, 1.5], [1.5, 77, 0.5], [2, 74, 2]],
        [[0, 77, 1], [1, 76, 1], [2, 72, 1], [3, 69, 1]],
        [[0, 72, 2], [2, 76, 2]]
    ];
    function roadBeat(t, spb, bar, beat) {
        const ch = ROAD[bar % 4];
        const sec = Math.floor(bar / 4);          // cada vuelta de 4 acordes
        const intro = sec === 0;
        if (echoDelay) echoDelay.delayTime.setValueAtTime(spb * 0.75, t);
        if (beat === 0) {
            pad(t, ch.pad, spb * 4, { vol: 0.02, cutoff: 900 });
            // melodía en las vueltas 2-3, 6-7...
            if (Math.floor(sec / 2) % 2 === 1) ROAD_MEL[bar % 8].forEach(([b, n, d]) => lead(t + b * spb, n, d * spb * 0.92));
        }
        // bajo en corcheas (salta a la octava en la última)
        for (const k of [0, 0.5]) synthBass(t + k * spb, ch.root + (beat === 3 && k ? 12 : 0), spb * 0.42, 0.06);
        // arpegio en semicorcheas que se abre poco a poco en la intro
        const cutoff = intro ? 700 + bar * 450 : 2600;
        const order = [0, 1, 2, 3, 2, 1, 2, 3];
        for (let k = 0; k < 4; k++) {
            const n = ch.arp[order[(beat * 4 + k) % 8]];
            pluck(t + k * spb / 4, midi(n), { vol: 0.02, dur: 0.2, cutoff, p: k % 2 ? 0.35 : -0.35, send: 0.18 });
        }
        if (!intro) {
            if (beat % 2 === 0) kick(t, 0.28);
            if (beat === 3 && bar % 2 === 1) kick(t + spb * 0.5, 0.16);
            if (beat % 2 === 1) snare(t, 0.05);
            shaker(t + spb / 2, 0.02);
            shaker(t + spb * 0.25, 0.006); shaker(t + spb * 0.75, 0.006);
        } else if (bar >= 2) shaker(t + spb / 2, 0.012);
    }

    // Parte 3 · Balada romántica de piano y cuerdas en Fa (bajo descendente tipo Canon)
    const ROMANCE = [
        { lh: [41, 48, 53, 57], st: [53, 57, 60], mel: [[0, 72, 1.5], [1.5, 69, 0.5], [2, 72, 1], [3, 77, 1]] },   // F
        { lh: [40, 48, 52, 55], st: [52, 55, 60], mel: [[0, 76, 3], [3, 72, 1]] },                                 // C/E
        { lh: [38, 45, 50, 53], st: [50, 53, 57], mel: [[0, 74, 1.5], [1.5, 72, 0.5], [2, 74, 1], [3, 77, 1]] },   // Dm
        { lh: [36, 45, 48, 52], st: [48, 52, 57], mel: [[0, 76, 2], [2, 72, 1], [3, 69, 1]] },                     // Am/C
        { lh: [34, 41, 46, 50], st: [46, 50, 53], mel: [[0, 70, 1.5], [1.5, 74, 0.5], [2, 77, 1], [3, 81, 1]] },   // Bb
        { lh: [33, 41, 45, 48], st: [45, 48, 53], mel: [[0, 79, 1], [1, 77, 1], [2, 72, 2]] },                     // F/A
        { lh: [31, 38, 46, 50], st: [46, 50, 53], mel: [[0, 74, 1], [1, 77, 1], [2, 76, 1], [3, 74, 1]] },         // Gm7
        { lh: [36, 43, 46, 52], st: [46, 52, 55], mel: [[0, 74, 1], [1, 76, 1], [2, 79, 2]] }                      // C7
    ];
    function romanceBeat(t, spb, bar, beat) {
        const ch = ROMANCE[bar % 8];
        const sec = Math.floor(bar / 8) % 4;     // 0: piano · 1: + cuerdas · 2: melodía en octava · 3: respiro
        const hum = () => (Math.random() - 0.5) * 0.016;
        // mano izquierda en corcheas
        const order = [0, 1, 2, 3, 2, 1, 2, 3];
        for (const k of [0, 1]) {
            const i = order[beat * 2 + k];
            const v = (i === 0 ? 0.075 : 0.04) * (0.85 + Math.random() * 0.3);
            piano(t + k * spb / 2 + hum(), ch.lh[i], { vol: v, dur: i === 0 ? spb * 4 : spb * 2.2, p: -0.2 });
        }
        if (beat !== 0) return;
        if (sec >= 1) strings(t, ch.st, spb * 4, sec === 3 ? 0.012 : 0.016);
        if (sec === 3) {
            if (bar % 2 === 0) bell(t + spb * 2, midi(ch.mel[0][1] + 12), { vol: 0.02, dur: 2.5, out: musicBus, p: 0.3 });
            return;
        }
        ch.mel.forEach(([b, n, d]) => {
            const tt = t + b * spb + hum();
            piano(tt, n, { vol: 0.085, dur: Math.max(1.6, d * spb * 1.8), p: 0.15 });
            if (sec === 2) piano(tt + 0.01, n + 12, { vol: 0.035, dur: Math.max(1.4, d * spb * 1.5), p: 0.3 });
        });
    }

    // "Y ahora la última pregunta…" · Marcha nupcial (Coro nupcial de Lohengrin, dominio público)
    // en Fa: órgano suave, celesta y campanas; la segunda vuelta, una octava arriba y más llena
    function organ(t, notes, dur, vol = 0.03) {
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.25);
        g.gain.setValueAtTime(vol, t + Math.max(0.3, dur - 0.15));
        g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.5);
        const trem = ctx.createOscillator(); trem.frequency.value = 5.5;
        const tg = ctx.createGain(); tg.gain.value = vol * 0.12; trem.connect(tg).connect(g.gain);
        g.connect(musicBus);
        notes.forEach(n => [[1, 1], [2, 0.5], [3, 0.18], [4, 0.22], [8, 0.05]].forEach(([k, a]) => {
            const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = midi(n) * k;
            const og = ctx.createGain(); og.gain.value = a / notes.length;
            o.connect(og).connect(g); o.start(t); o.stop(t + dur + 0.6);
        }));
        trem.start(t); trem.stop(t + dur + 0.6);
    }
    const BRIDE = [
        [[0, 72, 1], [1, 77, 0.75], [1.75, 77, 0.25], [2, 77, 2]],     // Here comes the bride
        [[0, 72, 1], [1, 79, 0.75], [1.75, 76, 0.25], [2, 77, 2]]      // all dressed in white
    ];
    const BRIDE_CH = [
        [[0, [53, 57, 60], 4, 41]],
        [[0, [52, 55, 58, 60], 2, 36], [2, [53, 57, 60], 2, 41]]
    ];
    function weddingBeat(t, spb, bar, beat) {
        if (beat !== 0) return;
        const i = bar % 2, up = Math.floor(bar / 2) % 2;     // segunda vuelta: octava arriba
        // arpa: glissando de Fa mayor al empezar cada vuelta
        if (i === 0) [53, 57, 60, 65, 69, 72, 77, 81, 84].forEach((n, k) => musicBox(t - 0.5 + k * 0.055, midi(n), { vol: 0.035, dur: 1.4, p: -0.4 + k * 0.1 }));
        BRIDE_CH[i].forEach(([b, notes, d, bass]) => {
            organ(t + b * spb, notes.map(n => n + (up ? 12 : 0)), d * spb, up ? 0.045 : 0.035);
            organ(t + b * spb, [bass - 12, bass], d * spb, 0.03);
        });
        BRIDE[i].forEach(([b, n, d]) => {
            const tt = t + b * spb, nn = n + (up ? 12 : 0);
            organ(tt, [nn], d * spb * 0.95, 0.05);
            musicBox(tt, midi(nn + 12), { vol: 0.05, dur: Math.max(1.2, d * spb * 1.4), p: 0.15 });
            if (up) bell(tt, midi(nn + 12), { vol: 0.03, dur: 2, out: musicBus, p: 0.3 });
        });
        // campanas de boda al cerrar la segunda vuelta
        if (up && i === 1) [[2, 77], [2.5, 72], [3, 77], [3.5, 72]].forEach(([b, n]) => bell(t + b * spb, midi(n), { vol: 0.05, dur: 3, out: musicBus, bright: 0.6, p: b % 1 ? 0.4 : -0.4 }));
        strings(t, [53, 57, 60].map(n => n + (i ? -1 : 0) * 0 + (up ? 12 : 0)), spb * 4, up ? 0.014 : 0.009);
    }

    // La pedida y la guantera · Vals romántico en Si bemol (3/4): piano, celesta y violín
    function violin(t, n, dur, vol = 0.03) {
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2300; f.Q.value = 0.7;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.14);
        g.gain.setValueAtTime(vol * 0.9, t + Math.max(0.16, dur - 0.1));
        g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.45);
        const lfo = ctx.createOscillator(); lfo.frequency.value = 5.6;
        const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(14, t + Math.min(0.6, dur)); lfo.connect(lg);
        f.connect(g); pan(g, 0.12).connect(musicBus);
        [-5, 5].forEach(c => {
            const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = c;
            lg.connect(o.detune); o.connect(f); o.start(t); o.stop(t + dur + 0.5);
        });
        lfo.start(t); lfo.stop(t + dur + 0.5);
    }
    const WALTZ = [
        { bass: 46, ch: [62, 65, 70], mel: [[0, 65, 1], [1, 74, 2]] },                 // Sib
        { bass: 43, ch: [62, 67, 70], mel: [[0, 72, 1], [1, 70, 1], [2, 67, 1]] },     // Solm
        { bass: 39, ch: [63, 67, 70], mel: [[0, 67, 1], [1, 75, 2]] },                 // Mib
        { bass: 41, ch: [60, 65, 69], mel: [[0, 74, 2], [2, 72, 1]] },                 // Fa
        { bass: 38, ch: [62, 65, 70], mel: [[0, 70, 1], [1, 77, 2]] },                 // Sib/Re
        { bass: 39, ch: [63, 67, 70], mel: [[0, 75, 1], [1, 74, 1], [2, 72, 1]] },     // Mib
        { bass: 36, ch: [63, 67, 70], mel: [[0, 74, 1.5], [1.5, 72, 0.5], [2, 70, 1]] }, // Dom7
        { bass: 41, ch: [63, 65, 69], mel: [[0, 69, 2], [2, 72, 1]] }                  // Fa7
    ];
    function waltzBeat(t, spb, bar, beat) {
        const total = bar * 4 + beat, wb = Math.floor(total / 3), b = total % 3;   // compases de 3
        const ch = WALTZ[wb % 8], pass = Math.floor(wb / 8) % 3;                    // 0 piano · 1 violín · 2 celesta
        const hum = () => (Math.random() - 0.5) * 0.012;
        if (b === 0) {
            piano(t + hum(), ch.bass, { vol: 0.08, dur: spb * 3.2, p: -0.25 });
            piano(t + 0.01, ch.bass + 12, { vol: 0.035, dur: spb * 2.5, p: -0.2 });
            strings(t, ch.ch.map(n => n - 12), spb * 3, pass === 1 ? 0.016 : 0.01);
            ch.mel.forEach(([mb, n, d]) => {
                const tt = t + mb * spb + hum();
                if (pass === 1) { violin(tt, n + 12, d * spb, 0.032); piano(tt, n, { vol: 0.04, dur: d * spb * 1.6, p: 0.1 }); }
                else if (pass === 2) { musicBox(tt, midi(n + 12), { vol: 0.07, dur: Math.max(1.4, d * spb * 1.6), p: 0.2 }); piano(tt, n, { vol: 0.05, dur: d * spb * 1.6, p: 0.1 }); }
                else piano(tt, n + 12, { vol: 0.08, dur: Math.max(1.4, d * spb * 1.8), p: 0.15 });
            });
        } else {
            // "chum-chum" del vals: acorde suave en los tiempos 2 y 3
            ch.ch.forEach((n, k) => piano(t + k * 0.012 + hum(), n, { vol: 0.03, dur: spb * 0.9, p: -0.05 + k * 0.08 }));
        }
    }

    const MOODS = {
        day: { bpm: 84, vol: 0.5, chords: ['Fmaj7', 'Dm7', 'Bbmaj7', 'Csus'], arp: 8, shaker: true, bass: true, melody: MEL_DAY, melodyEvery: 2, padVol: 0.026 },
        sunset: { bpm: 72, vol: 0.5, chords: ['Bbmaj7', 'FA', 'Gm7', 'Csus'], arp: 4, bass: true, melody: MEL_DAY, melodyEvery: 3, padVol: 0.034 },
        night: { bpm: 64, vol: 0.5, chords: ['Fmaj7', 'Am7', 'Bbmaj7', 'Bbm6'], sparse: true, padVol: 0.03 },
        suspense: { bpm: 60, vol: 0.55, chords: ['Dm', 'Dm', 'Bbmaj7', 'Csus'], heartbeat: true, padVol: 0.028, low: true },
        love: { bpm: 70, vol: 0.6, chords: ['F', 'Am', 'Bb', 'C', 'Dm', 'Bb', 'Gm', 'C'], arp: 4, bass: true, melody: MEL_LOVE, melodyEvery: 1, padVol: 0.03 },
        road: { bpm: 104, vol: 0.5, beat: roadBeat },
        romance: { bpm: 66, vol: 0.8, beat: romanceBeat },
        wedding: { bpm: 64, vol: 0.5, beat: weddingBeat },
        space: { bpm: 58, vol: 0.55, chords: ['Fmaj7', 'Dm7', 'Bbmaj7', 'Csus'], sparse: true, sparkle: true, padVol: 0.04 },
        waltz: { bpm: 84, vol: 0.75, beat: waltzBeat },
        celebrate: { bpm: 112, vol: 0.55, chords: ['F', 'CE', 'Dm', 'Bb', 'F', 'C', 'Bb', 'C'], arp: 16, shaker: true, bass: true, sparkle: true, padVol: 0.022 }
    };

    let mood = null, moodName = null, bar = 0, beat = 0, nextTime = 0, timer = null, cycle = 0;

    function scheduleBeat(t) {
        const m = mood;
        const spb = 60 / m.bpm;
        if (m.beat) {
            m.beat(t, spb, bar, beat);
            beat++;
            if (beat >= 4) { beat = 0; bar++; }
            return spb;
        }
        const chordName = m.chords[bar % m.chords.length];
        const chord = C[chordName];

        if (beat === 0) {
            const dur = spb * 4;
            const padNotes = m.low ? chord.map(n => n - 12) : chord.slice(1);
            pad(t, padNotes, dur, { vol: m.padVol, cutoff: m.low ? 700 : 1100 });
            if (m.bass) bassNote(t, chord[0] - 12 < 28 ? chord[0] : chord[0] - 12, spb * 1.8);
            // Melodía
            if (m.melody) {
                const loopLen = m.chords.length;
                const loopIdx = Math.floor(bar / loopLen);
                if (loopIdx % (m.melodyEvery || 1) === 0 || m.melodyEvery === 1) {
                    const phrase = m.melody[bar % m.melody.length];
                    phrase.forEach(([b, n, d]) => musicBox(t + b * spb, midi(n), { vol: 0.1, dur: Math.max(1.2, d * spb * 1.5), p: 0 }));
                }
            }
        }
        if (beat === 2 && m.bass) bassNote(t, chord[0] - 12 < 28 ? chord[0] + 7 : chord[0] - 5, spb * 1.5, 0.06);

        // Arpegios de caja de música
        const tones = chord.map(n => n + 12).concat(chord.slice(1, 3).map(n => n + 24));
        if (m.arp) {
            const per = m.arp / 4;
            for (let k = 0; k < per; k++) {
                const idx = (beat * per + k) % tones.length;
                const order = [0, 2, 1, 3, 4, 2, 3, 1];
                const n = tones[order[idx % order.length] % tones.length];
                musicBox(t + k * spb / per, midi(n), { vol: m.arp >= 16 ? 0.035 : 0.045, dur: 1.1, p: (k % 2 ? 0.3 : -0.3) });
            }
        }
        if (m.sparse && Math.random() < 0.7) {
            const n = tones[Math.floor(Math.random() * tones.length)];
            musicBox(t + (Math.random() < 0.5 ? 0 : spb / 2), midi(n), { vol: 0.06, dur: 2.2, p: Math.random() - 0.5 });
        }
        if (m.shaker) { shaker(t + spb / 2); if (m.arp >= 16) shaker(t + spb * 0.75, 0.01); }
        if (m.heartbeat && beat % 2 === 0) heartbeat(t, 0.2);
        if (m.heartbeat && beat === 3 && bar % 2 === 1) musicBox(t, midi(81), { vol: 0.03, dur: 3 });
        if (m.sparkle && beat === 0 && bar % 2 === 0) [84, 88, 91, 96].forEach((n, i) => bell(t + i * 0.06, midi(n), { vol: 0.025, dur: 1.2, out: musicBus }));

        beat++;
        if (beat >= 4) { beat = 0; bar++; if (bar % m.chords.length === 0) cycle++; }
        return spb;
    }

    function tick() {
        if (!ctx || !mood) return;
        while (nextTime < ctx.currentTime + 0.25) {
            nextTime += scheduleBeat(nextTime);
        }
    }

    function setMusic(name) {
        if (!ac()) return;
        if (name === moodName) return;
        const t = ctx.currentTime;
        musicBus.gain.cancelScheduledValues(t);
        musicBus.gain.setValueAtTime(musicBus.gain.value, t);
        if (!name) {
            musicBus.gain.linearRampToValueAtTime(0, t + 1.5);
            moodName = null;
            setTimeout(() => { if (!moodName) mood = null; }, 1600);
            return;
        }
        const was = !!mood;
        moodName = name;
        const switchIt = () => {
            mood = MOODS[name];
            bar = 0; beat = 0; cycle = 0;
            nextTime = ctx.currentTime + 0.1;
            musicBus.gain.cancelScheduledValues(ctx.currentTime);
            musicBus.gain.setValueAtTime(was ? 0 : musicBus.gain.value, ctx.currentTime);
            musicBus.gain.linearRampToValueAtTime(mood.vol, ctx.currentTime + 1.2);
        };
        if (was) {
            musicBus.gain.linearRampToValueAtTime(0, t + 0.9);
            setTimeout(() => { if (moodName === name) switchIt(); }, 950);
        } else switchIt();
        if (!timer) timer = setInterval(tick, 50);
    }

    // --- Ambiente: olas, pájaros, grillos ---------------------------------------

    let amb = null, ambKind = null, ambTimer = null;
    function startAmbienceLayers() {
        if (amb) return;
        amb = {};
        // Olas: ruido grave con vaivén lento
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer; src.loop = true;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
        const g = ctx.createGain(); g.gain.value = 0.13;
        const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
        const lfoG = ctx.createGain(); lfoG.gain.value = 0.1;
        lfo.connect(lfoG).connect(g.gain);
        const waves = ctx.createGain(); waves.gain.value = 0;
        src.connect(lp).connect(g).connect(waves).connect(ambBus);
        src.start(); lfo.start();
        amb.waves = waves;
        amb.birds = ctx.createGain(); amb.birds.gain.value = 0; amb.birds.connect(ambBus);
        amb.crickets = ctx.createGain(); amb.crickets.gain.value = 0; amb.crickets.connect(ambBus);
        ambTimer = setInterval(ambienceTick, 250);
    }

    function chirp(t, out) {
        const n = 2 + Math.floor(Math.random() * 3);
        const base = 2600 + Math.random() * 1600;
        const p = Math.random() * 1.6 - 0.8;
        for (let i = 0; i < n; i++) {
            const tt = t + i * (0.09 + Math.random() * 0.05);
            const o = ctx.createOscillator(); o.type = 'sine';
            o.frequency.setValueAtTime(base, tt);
            o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.3), tt + 0.04);
            o.frequency.exponentialRampToValueAtTime(base * 0.9, tt + 0.08);
            const g = ctx.createGain();
            env(g, tt, 0.035, 0.008, 0.09);
            o.connect(g);
            pan(g, p).connect(out);
            o.start(tt); o.stop(tt + 0.12);
        }
    }

    function cricket(t, out) {
        const p = Math.random() * 1.4 - 0.7;
        const f = 4300 + Math.random() * 500;
        for (let k = 0; k < 3; k++) {
            const tt = t + k * 0.11;
            const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
            // Trémolo: la ganancia oscila entre 0 y 1 (0.5 + 0.5·cuadrada)
            const am = ctx.createOscillator(); am.type = 'square'; am.frequency.value = 32;
            const amg = ctx.createGain(); amg.gain.value = 0.5;
            const trem = ctx.createGain(); trem.gain.value = 0.5;
            am.connect(amg).connect(trem.gain);
            const g = ctx.createGain();
            env(g, tt, 0.01, 0.01, 0.08);
            o.connect(trem).connect(g);
            pan(g, p).connect(out);
            o.start(tt); am.start(tt); o.stop(tt + 0.1); am.stop(tt + 0.1);
        }
    }

    function ambienceTick() {
        if (!ctx || !amb) return;
        const t = ctx.currentTime + 0.05;
        if (ambKind === 'day' && Math.random() < 0.12) chirp(t, amb.birds);
        if (ambKind === 'night' && Math.random() < 0.45) cricket(t, amb.crickets);
    }

    function setAmbience(kind) {
        if (!ac()) return;
        startAmbienceLayers();
        ambKind = kind;
        const t = ctx.currentTime;
        const to = (g, v) => { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(v, t, 0.8); };
        to(amb.waves, kind ? (kind === 'night' ? 0.6 : 1) : 0);
        to(amb.birds, kind === 'day' ? 1 : 0);
        to(amb.crickets, kind === 'night' ? 1 : 0);
    }

    // --- Motor eléctrico del Tesla --------------------------------------------------

    let eng = null;
    function setEngine(v) {
        if (!ctx || muted) return;
        if (!eng) {
            eng = {};
            const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 140;
            const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 280;
            const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 0.7;
            const g = ctx.createGain(); g.gain.value = 0;
            o.connect(bp); o2.connect(bp); bp.connect(g).connect(sfxBus);
            const src = ctx.createBufferSource(); src.buffer = noiseBuffer; src.loop = true;
            const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
            const ng = ctx.createGain(); ng.gain.value = 0;
            src.connect(lp).connect(ng).connect(sfxBus);
            o.start(); o2.start(); src.start();
            Object.assign(eng, { o, o2, g, lp, ng });
        }
        const t = ctx.currentTime;
        v = Math.max(0, Math.min(1, v));
        eng.o.frequency.setTargetAtTime(140 + v * 420, t, 0.15);
        eng.o2.frequency.setTargetAtTime(280 + v * 840, t, 0.15);
        eng.g.gain.setTargetAtTime(v * 0.022, t, 0.2);
        eng.lp.frequency.setTargetAtTime(300 + v * 900, t, 0.2);
        eng.ng.gain.setTargetAtTime(v * 0.05, t, 0.2);
    }

    // --- Efectos ---------------------------------------------------------------------

    const F5 = 698.46, A5 = 880, C6 = 1046.5, F6 = 1396.9;
    const sfx = {
        // Tocar una opción: "pop" de burbuja
        click() {
            if (!ac()) return;
            const t = ctx.currentTime;
            const o = ctx.createOscillator(); o.type = 'sine';
            o.frequency.setValueAtTime(420, t);
            o.frequency.exponentialRampToValueAtTime(980, t + 0.06);
            const g = ctx.createGain(); env(g, t, 0.16, 0.004, 0.11);
            o.connect(g).connect(sfxBus); o.start(t); o.stop(t + 0.15);
        },
        // Botones normales: clic más suave
        tap() {
            if (!ac()) return;
            marimba(ctx.currentTime, midi(84), { vol: 0.08, dur: 0.25 });
        },
        // Arranque hacia la siguiente parada: suspiro de aire
        next() {
            if (!ac()) return;
            noise(ctx.currentTime, 0.7, { vol: 0.12, f0: 300, f1: 1400, q: 0.6 });
        },
        // Acierto: arpegio de campanas Fa-La-Do-Fa
        good() {
            if (!ac()) return;
            const t = ctx.currentTime + 0.02;
            [F5, A5, C6, F6].forEach((f, i) => bell(t + i * 0.075, f, { vol: 0.07 - i * 0.008, dur: 1.4, p: -0.3 + i * 0.2 }));
        },
        // Fallo: "wa-wah" suave de dibujos
        bad() {
            if (!ac()) return;
            const t = ctx.currentTime + 0.02;
            [[midi(57), midi(56)], [midi(55), midi(53)]].forEach(([a, b], i) => {
                const tt = t + i * 0.26;
                const o = ctx.createOscillator(); o.type = 'triangle';
                o.frequency.setValueAtTime(a, tt);
                o.frequency.linearRampToValueAtTime(b, tt + 0.24);
                const vib = ctx.createOscillator(); vib.frequency.value = 7;
                const vg = ctx.createGain(); vg.gain.value = 4;
                vib.connect(vg).connect(o.frequency);
                const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
                const g = ctx.createGain(); env(g, tt, 0.12, 0.03, i ? 0.42 : 0.26);
                o.connect(f).connect(g).connect(sfxBus);
                o.start(tt); vib.start(tt); o.stop(tt + 0.5); vib.stop(tt + 0.5);
            });
        },
        // Arranque del coche (parte 2): campanilla de bienvenida
        start() {
            if (!ac()) return;
            const t = ctx.currentTime + 0.05;
            [F5, C6, A5 * 2].forEach((f, i) => bell(t + i * 0.18, f, { vol: 0.06, dur: 1.8, bright: 0.6 }));
            noise(t + 0.3, 1.2, { vol: 0.025, f0: 200, f1: 1200 });
        },
        // Señal que brota del suelo
        pop() {
            if (!ac()) return;
            const t = ctx.currentTime;
            const o = ctx.createOscillator(); o.type = 'sine';
            o.frequency.setValueAtTime(220, t);
            o.frequency.exponentialRampToValueAtTime(660, t + 0.12);
            o.frequency.exponentialRampToValueAtTime(520, t + 0.22);
            const g = ctx.createGain(); env(g, t, 0.1, 0.01, 0.28);
            o.connect(g).connect(sfxBus); o.start(t); o.stop(t + 0.3);
        },
        // Las flores brotan: glissando mágico
        bloom() {
            if (!ac()) return;
            const t = ctx.currentTime + 0.05;
            [77, 79, 81, 84, 86, 89, 91, 96].forEach((n, i) => musicBox(t + i * 0.045, midi(n), { vol: 0.06, dur: 1.2, out: sfxBus, p: -0.5 + i * 0.14 }));
        },
        // Llegada a un lugar
        arrive() {
            if (!ac()) return;
            const t = ctx.currentTime + 0.02;
            bell(t, C6, { vol: 0.05, dur: 1.6, bright: 0.5 });
            bell(t + 0.16, F6, { vol: 0.05, dur: 2, bright: 0.5 });
        },
        // ¡Teórico aprobado!
        fanfare() {
            if (!ac()) return;
            const t = ctx.currentTime + 0.05;
            [[0, 65], [0.15, 69], [0.3, 72], [0.45, 77]].forEach(([dt, n]) => musicBox(t + dt, midi(n + 12), { vol: 0.09, dur: 1.4, out: sfxBus }));
            [77, 81, 84, 89].forEach(n => bell(t + 0.7, midi(n), { vol: 0.035, dur: 2.5, bright: 0.4 }));
            marimba(t + 0.7, midi(41), { vol: 0.25, dur: 1.2 });
        },
        // Cohete de fuegos artificiales
        firework() {
            if (!ac()) return;
            const t = ctx.currentTime;
            noise(t, 0.35, { vol: 0.14, type: 'lowpass', f0: 900, f1: 200, q: 0.5 });
            for (let i = 0; i < 6; i++) noise(t + 0.15 + Math.random() * 0.5, 0.03, { vol: 0.06, type: 'highpass', f0: 3000 });
        },
        // Destello del anillo
        shimmer() {
            if (!ac()) return;
            const t = ctx.currentTime + 0.05;
            [84, 88, 91, 96, 100, 103].forEach((n, i) => bell(t + i * 0.09, midi(n), { vol: 0.03, dur: 2.4, bright: 0.3, p: Math.sin(i) * 0.6 }));
        },
        // Despegue: soplido que sube + campanitas mágicas
        takeoff() {
            if (!ac()) return;
            const t = ctx.currentTime + 0.02;
            noise(t, 2.2, { vol: 0.18, f0: 200, f1: 2600, q: 0.7, attack: 0.6 });
            const o = ctx.createOscillator(); o.type = 'triangle';
            o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(880, t + 2);
            const g = ctx.createGain(); env(g, t, 0.05, 0.5, 2.2);
            o.connect(g).connect(sfxBus); o.start(t); o.stop(t + 2.3);
            [77, 81, 84, 89, 93, 96].forEach((n, i) => bell(t + 0.8 + i * 0.12, midi(n), { vol: 0.04, dur: 2, bright: 0.4 }));
        },
        // Despegue del cohete: rugido grave + barrido de ruido + destellos al llegar arriba
        launch() {
            if (!ac()) return;
            const t = ctx.currentTime + 0.02;
            noise(t, 3.2, { vol: 0.26, type: 'lowpass', f0: 300, f1: 1400, q: 0.5, attack: 0.25 });
            noise(t + 0.4, 2.6, { vol: 0.12, f0: 400, f1: 4000, q: 0.6, attack: 0.8 });
            const o = ctx.createOscillator(); o.type = 'sawtooth';
            o.frequency.setValueAtTime(48, t); o.frequency.exponentialRampToValueAtTime(110, t + 3);
            const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
            const g = ctx.createGain(); env(g, t, 0.14, 0.3, 3.3);
            o.connect(f).connect(g).connect(sfxBus); o.start(t); o.stop(t + 3.4);
            [72, 77, 81, 84, 89, 93, 96, 101].forEach((n, i) => bell(t + 2.2 + i * 0.1, midi(n), { vol: 0.035, dur: 2.2, bright: 0.5 }));
        },
        // Claxon del Tesla (suave)
        honk() {
            if (!ac()) return;
            const t = ctx.currentTime;
            [0, 0.18].forEach(dt => [392, 494].forEach(f => {
                const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
                const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
                const g = ctx.createGain(); env(g, t + dt, 0.025, 0.01, 0.14);
                o.connect(lp).connect(g).connect(sfxBus); o.start(t + dt); o.stop(t + dt + 0.16);
            }));
        },
        _debug: () => ({ ctx, comp }),
        music: setMusic,
        ambience: setAmbience,
        engine: setEngine,
        isMuted: () => muted,
        setMuted(m) {
            muted = !!m;
            try { localStorage.setItem('sfx-muted', muted ? '1' : '0'); } catch (e) { /* ignorar */ }
            if (ctx) master.gain.setTargetAtTime(muted ? 0 : MASTER, ctx.currentTime, 0.05);
        }
    };
    window.sfx = sfx;

    // El navegador sólo deja sonar audio tras un gesto: desbloqueamos en el primer toque
    const unlock = () => { ac(); window.removeEventListener('pointerdown', unlock, true); };
    window.addEventListener('pointerdown', unlock, true);

    document.addEventListener('DOMContentLoaded', () => {
        // Sonido global de clic: "pop" en las opciones, clic suave en el resto de botones
        document.addEventListener('click', e => {
            const btn = e.target.closest('button');
            if (!btn || btn.disabled || btn.id === 'sfx-toggle') return;
            if (btn.classList.contains('option-btn')) sfx.click();
            else sfx.tap();
        }, true);

        const toggle = document.getElementById('sfx-toggle');
        if (toggle) {
            const paint = () => {
                toggle.textContent = muted ? '🔇' : '🔊';
                toggle.setAttribute('aria-pressed', String(!muted));
            };
            paint();
            toggle.addEventListener('click', () => {
                sfx.setMuted(!muted);
                paint();
                if (!muted) sfx.arrive();
            });
        }
    });
})();
