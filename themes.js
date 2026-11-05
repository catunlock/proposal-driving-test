// Selector de estilos: aplica data-theme al <html>, recuerda la elección y adapta textos/confeti.
(function () {
    const THEMES = {
        classic: {
            title: 'Dirección General de Tráfico - Sede Electrónica',
            footer: '© 2026 Ministerio del Interior. Todos los derechos reservados.',
            confetti: ['#ff7eb3', '#ff758c', '#ffffff', '#ffd700']
        },
        toon: {
            title: '¡Autoescuela Cari! 🚗💨',
            footer: '© 2026 Autoescuela Cari · Prohibido no quererse',
            confetti: ['#ffd23f', '#ff5d8f', '#4cc9f0', '#7bed9f', '#ffffff']
        },
        synthwave: {
            title: 'D.G.T. // Sistema de Tráfico 1985',
            footer: '© 1985–2026 Neo Madrid Highway Authority',
            confetti: ['#ff2e93', '#00f0ff', '#b967ff', '#ffe66d']
        },
        noir: {
            title: 'DGT · Edición Privada',
            footer: '© 2026 Reserva Especial · Barcelona',
            confetti: ['#d4af37', '#f5e6b3', '#ffffff', '#b8860b']
        }
    };

    function apply(name) {
        if (!THEMES[name]) name = 'classic';
        const root = document.documentElement;
        if (name === 'classic') root.removeAttribute('data-theme');
        else root.setAttribute('data-theme', name);

        try { localStorage.setItem('theme', name); } catch (e) {}

        const t = THEMES[name];
        const title = document.querySelector('.header-title');
        const footer = document.querySelector('.footer-content p');
        if (title) title.textContent = t.title;
        if (footer) footer.innerHTML = '&copy; ' + t.footer.replace(/^©\s*/, '');

        document.querySelectorAll('#theme-switcher .ts-options button').forEach(b => {
            b.setAttribute('aria-pressed', String(b.dataset.theme === name));
        });
    }

    // Decorado del fondo del tema cartoon (solo visible con data-theme="toon")
    const TOON_SCENE = [
        // [emoji, animación, top|bottom, tamaño px, duración s, retardo s]
        ['☁️', 'right', 'top:30%', 90, 55, -20],
        ['☁️', 'right', 'top:8%', 70, 70, -50],
        ['☁️', 'left', 'top:50%', 110, 80, -10],
        ['✈️', 'right toon-plane', 'top:20%', 46, 28, -6],
        ['🎈', 'bob', 'top:38%;left:8%', 60, 6, 0],
        ['🎈', 'bob', 'top:22%;right:10%', 48, 7, -3],
        ['🐦', 'left', 'top:14%', 28, 22, -4],
        ['🐦', 'left', 'top:17%', 22, 22, -2],
        ['🦋', 'bob', 'bottom:30%;left:24%', 28, 4, -1],
        ['💗', 'up', 'bottom:12%;left:15%', 30, 9, -2],
        ['💗', 'up', 'bottom:12%;left:55%', 24, 12, -7],
        ['💞', 'up', 'bottom:12%;left:82%', 34, 10, -4],
        ['🌳', 'still', 'bottom:50px;left:3%', 70, 0, 0],
        ['🌲', 'still', 'bottom:50px;left:10%', 56, 0, 0],
        ['🌳', 'still', 'bottom:50px;right:4%', 80, 0, 0],
        ['🏡', 'still', 'bottom:50px;right:13%', 64, 0, 0],
        ['🚦', 'still', 'bottom:50px;left:19%', 44, 0, 0],
        ['🚧', 'still', 'bottom:50px;right:24%', 36, 0, 0],
        ['🚙', 'right-car', 'bottom:52px', 44, 14, -3],
        ['🚌', 'left-car', 'bottom:52px', 48, 20, -12],
        ['🚕', 'right-car', 'bottom:52px', 40, 11, -9]
    ];
    function buildToonScene() {
        const bg = document.getElementById('background-elements');
        if (!bg) return;
        const ground = document.createElement('div');
        ground.className = 'toon-deco toon-ground';
        bg.appendChild(ground);
        TOON_SCENE.forEach(([emoji, anim, pos, size, dur, delay]) => {
            const el = document.createElement('span');
            el.className = 'toon-deco ' + anim.split(' ').map(a => a.startsWith('toon-') ? a : 'toon-' + a).join(' ');
            el.textContent = emoji;
            el.style.cssText = pos + ';font-size:' + size + 'px;animation-duration:' + dur + 's;animation-delay:' + delay + 's';
            bg.appendChild(el);
        });
    }

    window.getConfettiColors = function () {
        const name = document.documentElement.getAttribute('data-theme') || 'classic';
        return THEMES[name].confetti;
    };

    // Cursor-coche para el tema cartoon: sigue al puntero, mira hacia donde va y deja humito
    function initToonCursor() {
        if (!window.matchMedia || !window.matchMedia('(pointer: fine)').matches) return;
        const cur = document.createElement('div');
        cur.id = 'toon-cursor';
        cur.setAttribute('aria-hidden', 'true');
        cur.innerHTML = '<span class="tc-car">🚗</span>';
        document.body.appendChild(cur);
        const car = cur.firstChild;

        let lastX = 0, lastPuff = 0, dir = 1;
        document.addEventListener('mousemove', e => {
            document.body.classList.add('toon-cursor-on');
            cur.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)';
            const dx = e.clientX - lastX;
            if (Math.abs(dx) > 2) dir = dx > 0 ? -1 : 1; // el emoji 🚗 mira a la izquierda
            lastX = e.clientX;
            car.style.transform = 'scaleX(' + dir + ') rotate(' + Math.max(-8, Math.min(8, dx * -dir * 0.4)) + 'deg)';

            const now = performance.now();
            if (document.documentElement.getAttribute('data-theme') === 'toon' && now - lastPuff > 90) {
                lastPuff = now;
                const p = document.createElement('span');
                p.className = 'toon-puff';
                p.textContent = '💨';
                p.style.left = (e.clientX + dir * 22) + 'px';
                p.style.top = (e.clientY + 8) + 'px';
                document.body.appendChild(p);
                setTimeout(() => p.remove(), 500);
            }
        });
        document.addEventListener('mousedown', () => cur.classList.add('down'));
        document.addEventListener('mouseup', () => cur.classList.remove('down'));
        document.addEventListener('mouseleave', () => document.body.classList.remove('toon-cursor-on'));
    }

    document.addEventListener('DOMContentLoaded', () => {
        buildToonScene();
        initToonCursor();
        const toggle = document.querySelector('#theme-switcher .ts-toggle');
        const menu = document.querySelector('#theme-switcher .ts-options');
        const setOpen = open => {
            menu.hidden = !open;
            toggle.setAttribute('aria-expanded', String(open));
        };
        toggle.addEventListener('click', e => { e.stopPropagation(); setOpen(menu.hidden); });
        menu.querySelectorAll('button').forEach(b => {
            b.addEventListener('click', () => { apply(b.dataset.theme); setOpen(false); });
        });
        document.addEventListener('click', e => { if (!e.target.closest('#theme-switcher')) setOpen(false); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
        apply(document.documentElement.getAttribute('data-theme') || 'classic');
    });
})();
