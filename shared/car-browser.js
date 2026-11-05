// Utilidades del navegador del coche (Tesla), compartidas por index.html (3D) y classic.html (2D).

// --- Detección del navegador del coche (Tesla) ---
// El UA de Tesla varía según versión: "Tesla/2023.x", "QtCarBrowser" (antiguo),
// o sin marca (Chromium genérico sobre Linux). Combinamos señales explícitas y heurísticas.
function detectCarBrowser() {
    const ua = navigator.userAgent || '';
    const uaLower = ua.toLowerCase();

    // 1. Señales explícitas en el user agent
    if (/tesla|qtcarbrowser|teslabrowser/.test(uaLower)) return true;

    // 2. Client Hints (Chromium): marcas y plataforma
    const uaData = navigator.userAgentData;
    if (uaData) {
        const brands = (uaData.brands || []).map(b => b.brand.toLowerCase()).join(' ');
        if (/tesla/.test(brands)) return true;
    }

    // 3. Otros indicios en el entorno (algunas versiones exponen window.tesla o similar)
    if (typeof window.tesla !== 'undefined' || typeof window.Tesla !== 'undefined') return true;
    if (/tesla/i.test(document.referrer || '')) return true;

    // 4. Heurística: Linux de escritorio (no Android) + pantalla táctil grande + sin ratón fino
    //    y sin ser un navegador de escritorio normal (los Tesla no tienen puntero preciso).
    const isLinuxDesktop = /x11|linux/.test(uaLower) && !/android|cros/.test(uaLower);
    const isTouch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
    const noFinePointer = window.matchMedia && !window.matchMedia('(any-pointer: fine)').matches;
    const bigScreen = Math.max(screen.width, screen.height) >= 1000;
    if (isLinuxDesktop && isTouch && noFinePointer && bigScreen) return true;

    // 5. Recordar detección previa durante la sesión (p. ej. tras redirecciones)
    try {
        if (sessionStorage.getItem('isTesla') === '1') return true;
    } catch (e) { /* ignorar */ }

    return false;
}

// Redireccionar al truco de YouTube para forzar pantalla completa en el coche.
// Al volver, la URL lleva tesla_fullscreen=true y la app arranca directamente la parte 2.
function enterTeslaTheater() {
    const targetUrl = new URL(window.location.href);
    targetUrl.searchParams.set('tesla_fullscreen', 'true');
    ['test', 'q', 'stage'].forEach(p => targetUrl.searchParams.delete(p));
    window.location.href = `https://www.youtube.com/redirect?q=${encodeURIComponent(targetUrl.toString())}`;
}

// Pantalla completa HTML5 (en PC/móvil; en el Tesla se usa el modo teatro)
function requestAppFullscreen() {
    const el = document.documentElement;
    if (el.requestFullscreen) {
        el.requestFullscreen().catch(err => console.log('Fullscreen error:', err));
    } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
    }
}

// Sintetizar una melodía mágica ascendente usando la API Web Audio
function playRomanticMelody() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();

        const chords = [
            [261.63, 329.63, 392.00, 523.25], // C Major
            [349.23, 440.00, 523.25, 698.46], // F Major
            [392.00, 493.88, 587.33, 783.99], // G Major
            [523.25, 659.25, 783.99, 1046.50] // C Major Octava Alta
        ];

        let time = ctx.currentTime + 0.1;

        chords.forEach(chord => {
            chord.forEach((freq, noteIdx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, time + noteIdx * 0.08);

                gain.gain.setValueAtTime(0, time + noteIdx * 0.08);
                gain.gain.linearRampToValueAtTime(0.08, time + noteIdx * 0.08 + 0.04);
                gain.gain.exponentialRampToValueAtTime(0.0001, time + noteIdx * 0.08 + 0.8);

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.start(time + noteIdx * 0.08);
                osc.stop(time + noteIdx * 0.08 + 0.8);
            });
            time += 0.55;
        });
    } catch (e) {
        console.log("Web Audio no iniciado o bloqueado:", e);
    }
}
