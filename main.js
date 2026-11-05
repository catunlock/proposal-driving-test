// --- Datos de los tests ---

let test1Questions = [];

const test2Questions = [
    {
        text: "¿Cuál es el mejor viaje que hemos hecho juntos hasta ahora?",
        image: "assets/foto_pendiente.webp",
        options: [
            "Aquel fin de semana en [Lugar].",
            "Nuestras primeras vacaciones en [Lugar].",
            "Cualquier viaje mientras sea contigo."
        ],
        correctIndex: -1,
        isPersonal: true
    },
    {
        text: "Si nuestra relación fuera una señal de tráfico, sería...",
        image: "assets/heart_sign_1776806754826.webp",
        options: [
            "Dirección única hacia la felicidad.",
            "Peligro: exceso de amor.",
            "Estacionamiento permitido para siempre."
        ],
        correctIndex: -1,
        isPersonal: true
    },
];

// --- Variables de Estado ---
let currentQuestions = [];
let currentQuestionIndex = 0;
let currentTest = 1;

// Variables de Estado - Examen Práctico (Parte 2)
let practicalIndex = 0;
// Parte 2 (técnicas) y Parte 3 (compromiso): definidas en data/practical-questions.js
const technicalQuestions = window.PRACTICAL.technical;
const commitmentQuestions = window.PRACTICAL.commitment;

const practicalQuestions = [...technicalQuestions, ...commitmentQuestions];

// --- Elementos del DOM ---
const screens = {
    home: document.getElementById('home-screen'),
    test: document.getElementById('test-screen'),
    result: document.getElementById('result-screen'),
    animation: document.getElementById('animation-screen'),
    preProposal: document.getElementById('pre-proposal-screen'),
    proposal: document.getElementById('proposal-screen'),
    practicalTest: document.getElementById('practical-test-screen'),
    lastQuestionIntro: document.getElementById('last-question-intro-screen'),
    marriageProposal: document.getElementById('marriage-proposal-screen'),
    finalCelebration: document.getElementById('final-celebration-screen'),
    glovebox: document.getElementById('glovebox-screen')
};

const UI = {
    questionText: document.getElementById('question-text'),
    optionsContainer: document.getElementById('options-container'),
    questionCounter: document.getElementById('question-counter'),
    progressBar: document.getElementById('progressBar'),
    btnBackHome: document.getElementById('btn-back-home'),
    btnContinueProposal: document.getElementById('btn-continue-proposal'),
    resultTitle: document.getElementById('result-title'),
    resultMessage: document.getElementById('result-message'),
    canvas: document.getElementById('confetti-canvas'),
    
    // Elementos de la Parte 2
    practicalQuestionText: document.getElementById('practical-question-text'),
    practicalOptionsContainer: document.getElementById('practical-options-container'),
    practicalCounter: document.getElementById('practical-counter'),
    practicalProgressBar: document.getElementById('practical-progress-bar'),
    practicalImageContainer: document.getElementById('practical-image-container')
};

// --- Inicialización ---
let secretCount = 0;
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('questions.json');
        if (response.ok) {
            test1Questions = await response.json();
        }
    } catch (e) {
        console.error("Error cargando preguntas:", e);
    }
    UI.btnBackHome.addEventListener('click', showHome);
    UI.btnContinueProposal.addEventListener('click', () => showScreen('proposal'));

    // Secret trigger para forzar el inicio del examen práctico (propuesta)
    const secretTrigger = document.getElementById('secret-trigger');
    if (secretTrigger) {
        secretTrigger.addEventListener('click', () => {
            secretCount++;
            if (secretCount >= 3) {
                // Al pulsar 3 veces, saltamos directamente a la Fase Final
                startPracticalTest();
                secretCount = 0; // reset
            }
        });
    }

    // Comprobar parámetros de URL para debugging/recarga rápida
    const urlParams = new URLSearchParams(window.location.search);
    const urlTest = urlParams.get('test');
    const urlQ = urlParams.get('q');

    if (urlTest !== null) {
        let testNum = parseInt(urlTest, 10);
        if (testNum === 1 || testNum === 2) {
            currentTest = testNum;
            currentQuestions = testNum === 1 ? [...test1Questions] : [...test2Questions];

            let qNum = urlQ !== null ? parseInt(urlQ, 10) : 0;
            if (qNum >= 0 && qNum < currentQuestions.length) {
                currentQuestionIndex = qNum;
            } else {
                currentQuestionIndex = 0;
            }

            showScreen('test');
            loadQuestion();
        }
    }

    // Detección Especial Tesla o Localhost
    const isTesla = detectCarBrowser();
    const isLocalhost = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1' || 
                        window.location.hostname.includes('192.168.');
    const forceTesla = urlParams.get('tesla') === 'true' || urlParams.get('tesla_fullscreen') === 'true';

    if (isTesla || forceTesla) {
        try { sessionStorage.setItem('isTesla', '1'); } catch (e) { /* ignorar */ }
    }

    if (isTesla || isLocalhost || forceTesla) {
        const teslaBanner = document.getElementById('tesla-banner');
        if (teslaBanner) {
            teslaBanner.classList.remove('d-none');
        }
        
        // Si ya viene del redirect de YouTube para pantalla completa, iniciamos automáticamente
        if (urlParams.get('tesla_fullscreen') === 'true') {
            setTimeout(() => {
                startPracticalTest();
            }, 500);
        }
    }

    // Registrar eventos para la propuesta final
    const btnMarriageYes = document.getElementById('btn-marriage-yes');
    if (btnMarriageYes) {
        btnMarriageYes.addEventListener('click', celebrateProposal);
    }
});

// detectCarBrowser(), enterTeslaTheater(), requestAppFullscreen() y playRomanticMelody() están en shared/car-browser.js

// --- Funciones de Navegación ---
function showScreen(screenName) {
    Object.values(screens).forEach(screen => {
        screen.classList.remove('active');
        screen.classList.add('hidden');
    });
    screens[screenName].classList.remove('hidden');
    // Pequeño delay para que la transición CSS funcione correctamente
    setTimeout(() => {
        screens[screenName].classList.add('active');
    }, 20);
}

function showHome() {
    const url = new URL(window.location);
    url.searchParams.delete('test');
    url.searchParams.delete('q');
    url.searchParams.delete('tesla_fullscreen');
    window.history.replaceState({}, '', url);
    document.body.classList.remove('tesla-mode');
    showScreen('home');
}

// --- Lógica del Test ---
function startTest(testNumber) {
    currentTest = testNumber;
    currentQuestions = testNumber === 1 ? [...test1Questions] : [...test2Questions];
    currentQuestionIndex = 0;

    showScreen('test');
    loadQuestion();
}

function loadQuestion() {
    // Actualizar URL con los parámetros actuales
    const url = new URL(window.location);
    url.searchParams.set('test', currentTest);
    url.searchParams.set('q', currentQuestionIndex);
    window.history.replaceState({}, '', url);

    const q = currentQuestions[currentQuestionIndex];
    UI.questionText.textContent = q.text;
    UI.questionCounter.textContent = `Pregunta ${currentQuestionIndex + 1}/${currentQuestions.length}`;

    sfx.next();

    // Update progress bar
    const progress = ((currentQuestionIndex) / currentQuestions.length) * 100;
    document.getElementById('progress-bar').style.width = `${progress}%`;

    // Render image
    const imageContainer = document.getElementById('image-container');
    if (q.image) {
        imageContainer.innerHTML = `
            <div class="skeleton-image" id="img-skeleton"></div>
            <img src="${q.image}" alt="Imagen de la pregunta" class="question-image d-none" id="q-img" onclick="openImageModal('${q.image}')" style="cursor: pointer;" onload="document.getElementById('img-skeleton').classList.add('d-none'); this.classList.remove('d-none');">
        `;
        imageContainer.classList.remove('d-none');
    } else {
        imageContainer.innerHTML = '';
        imageContainer.classList.add('d-none');
    }

    // Render options
    UI.optionsContainer.innerHTML = '';
    q.options.forEach((optText, index) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.textContent = optText;
        btn.onclick = () => handleAnswer(index, btn);
        UI.optionsContainer.appendChild(btn);
    });
}

function handleAnswer(selectedIndex, btnElement) {
    const q = currentQuestions[currentQuestionIndex];
    const buttons = UI.optionsContainer.querySelectorAll('.option-btn');

    // Deshabilitar botones temporalmente
    buttons.forEach(b => b.disabled = true);

    let isCorrect = false;

    if (q.isPersonal || q.correctIndex === -1) {
        // En preguntas personales, cualquier respuesta es correcta
        isCorrect = true;
    } else {
        isCorrect = (selectedIndex === q.correctIndex);
    }

    setTimeout(() => (isCorrect ? sfx.good() : sfx.bad()), 120);
    if (isCorrect) {
        btnElement.classList.add('correct');
    } else {
        btnElement.classList.add('incorrect');
        // Mostrar la correcta
        if (q.correctIndex !== -1) {
            buttons[q.correctIndex].classList.add('correct');
        }
    }

    // Esperar y pasar a la siguiente
    setTimeout(() => {
        currentQuestionIndex++;
        if (currentQuestionIndex < currentQuestions.length) {
            loadQuestion();
        } else {
            finishTest();
        }
    }, 850); // tiempo breve para ver el resultado
}

function finishTest() {
    // Limpiar URL al terminar el test
    const url = new URL(window.location);
    url.searchParams.delete('test');
    url.searchParams.delete('q');
    window.history.replaceState({}, '', url);

    // Si es el Test 2, pasamos por la pantalla de pre-propuesta
    if (currentTest === 2) {
        showScreen('preProposal');
    } else {
        // Mostrar animación primero
        showScreen('animation');

        const heartFill = document.getElementById('heart-fill-element');
        const percentageText = document.getElementById('animation-percentage');

        // Reset state just in case
        heartFill.style.transition = 'none';
        heartFill.style.transform = 'translateY(100%)';
        percentageText.textContent = '0%';

        setTimeout(() => {
            heartFill.style.transition = 'transform 3s ease-in-out';
            heartFill.style.transform = 'translateY(0%)';

            // Animating percentage text
            let startTime = null;
            function updatePercentage(timestamp) {
                if (!startTime) startTime = timestamp;
                let progress = timestamp - startTime;
                let percent = Math.min(Math.floor((progress / 3000) * 100), 100);
                percentageText.textContent = percent + '%';
                if (progress < 3000) {
                    requestAnimationFrame(updatePercentage);
                } else {
                    percentageText.textContent = '100%';

                    // Show final result after a small delay
                    setTimeout(() => {
                        UI.resultTitle.textContent = "¡Test Superado!";
                        UI.resultMessage.textContent = "Has completado el simulacro de casa con 0 fallos. ¡Estás preparado/a para el examen práctico en el coche!";
                        showScreen('result');
                    }, 800);
                }
            }
            requestAnimationFrame(updatePercentage);
        }, 100);
    }
}

// --- Animación Final (Confetti) ---
function celebrate() {
    UI.canvas.classList.remove('d-none');

    var duration = 3000;
    var end = Date.now() + duration;

    (function frame() {
        confetti({
            particleCount: 5,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors: getConfettiColors()
        });
        confetti({
            particleCount: 5,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors: getConfettiColors()
        });

        if (Date.now() < end) {
            requestAnimationFrame(frame);
        } else {
            setTimeout(() => {
                UI.canvas.classList.add('d-none');
                // Puedes redirigir o mostrar un mensaje de "¡Dijo que sí!"
                document.querySelector('.proposal-text').textContent = "¡Ha dicho que SÍ! 💍❤️";
                document.querySelector('.proposal-options').style.display = 'none';
            }, 1000);
        }
    }());
}

// --- Lightbox Image Modal ---
window.openImageModal = function (src) {
    const modal = document.getElementById('image-modal');
    const modalImg = document.getElementById('modal-img');
    modalImg.src = src;
    modal.classList.remove('hidden');
    // Small delay to allow CSS transition to trigger
    setTimeout(() => {
        modal.classList.add('active');
    }, 10);
};

window.closeImageModal = function () {
    const modal = document.getElementById('image-modal');
    modal.classList.remove('active');
    setTimeout(() => {
        modal.classList.add('hidden');
        document.getElementById('modal-img').src = '';
    }, 300);
};

// --- FUNCIONES DE LA PARTE 2 (TESLA MODE) ---

// Iniciar el Examen Práctico
function startPracticalTest() {
    practicalIndex = 0;
    
    // Intentar pantalla completa del HTML5 en local/PC
    requestAppFullscreen();
    
    // Activar modo Tesla en el body para quitar headers y footers
    document.body.classList.add('tesla-mode');
    
    sfx.start();
    showScreen('practicalTest');
    loadPracticalQuestion();
}

// Cargar pregunta práctica
function loadPracticalQuestion() {
    const q = practicalQuestions[practicalIndex];
    UI.practicalQuestionText.textContent = q.text;
    if (practicalIndex > 0) sfx.next();
    const isTechnical = practicalIndex < technicalQuestions.length;
    const partStart = isTechnical ? 0 : technicalQuestions.length;
    const partTotal = isTechnical ? technicalQuestions.length : commitmentQuestions.length;
    const partIndex = practicalIndex - partStart;
    const partName = isTechnical ? 'Parte 2: El coche' : 'Parte 3: Compromiso';
    UI.practicalCounter.textContent = `${partName} · Pregunta ${partIndex + 1}/${partTotal}`;
    
    // Actualizar barra de progreso (por parte)
    const progress = (partIndex / partTotal) * 100;
    UI.practicalProgressBar.style.width = `${progress}%`;
    
    // Renderizar imagen de la pregunta práctica
    if (q.image) {
        UI.practicalImageContainer.innerHTML = `
            <div class="skeleton-image" id="img-practical-skeleton"></div>
            <img src="${q.image}" alt="Imagen Práctica" class="question-image d-none" id="practical-q-img" onclick="openImageModal('${q.image}')" style="cursor: pointer;" onload="document.getElementById('img-practical-skeleton').classList.add('d-none'); this.classList.remove('d-none');">
        `;
        UI.practicalImageContainer.classList.remove('d-none');
    } else {
        UI.practicalImageContainer.innerHTML = '';
        UI.practicalImageContainer.classList.add('d-none');
    }
    
    // Renderizar opciones (dos opciones afirmativas/románticas)
    UI.practicalOptionsContainer.innerHTML = '';
    
    q.options.forEach((optText, index) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn btn-primary';
        // Alternamos estilo para diferenciar visualmente los botones
        if (index === 1) {
            btn.className = 'option-btn btn-secondary';
        }
        btn.innerHTML = optText;
        btn.onclick = () => handlePracticalAnswer(
            q.correctIndex === undefined || index === q.correctIndex, btn);
        UI.practicalOptionsContainer.appendChild(btn);
    });
}

// Procesar respuesta práctica
function handlePracticalAnswer(accepted, btnElement) {
    const buttons = UI.practicalOptionsContainer.querySelectorAll('.option-btn');

    setTimeout(() => (accepted ? sfx.good() : sfx.bad()), 120);
    if (!accepted) {
        // Respuesta técnica incorrecta: marcar y dejar reintentar
        btnElement.classList.add('incorrect');
        btnElement.disabled = true;
        return;
    }
    buttons.forEach(b => b.disabled = true);
    
    if (accepted) {
        btnElement.classList.add('correct');
        
        // Esperar 1.2 segundos y pasar a la siguiente pregunta
        setTimeout(() => {
            practicalIndex++;
            if (practicalIndex < practicalQuestions.length) {
                loadPracticalQuestion();
            } else {
                startLastQuestionIntro();
            }
        }, 700);
    }
}

// Hacer que un botón huya del puntero o del dedo
function makeButtonRunaway(btn) {
    const moveButton = (e) => {
        const btnWidth = btn.offsetWidth || 150;
        const btnHeight = btn.offsetHeight || 50;
        
        // Calcular posiciones aleatorias dentro del viewport con márgenes de seguridad
        const padding = 30;
        const screenWidth = window.innerWidth - btnWidth - padding * 2;
        const screenHeight = window.innerHeight - btnHeight - padding * 2;
        
        const randomX = Math.max(padding, Math.floor(Math.random() * screenWidth));
        const randomY = Math.max(padding, Math.floor(Math.random() * screenHeight));
        
        btn.style.position = 'fixed';
        btn.style.left = `${randomX}px`;
        btn.style.top = `${randomY}px`;
        
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
    };
    
    // Para escritorio
    btn.addEventListener('mouseenter', moveButton);
    // Para pantallas táctiles (Tesla/Móvil)
    btn.addEventListener('touchstart', moveButton, { passive: false });
}

// Iniciar introducción a la última pregunta
function startLastQuestionIntro() {
    showScreen('lastQuestionIntro');
    
    // Reproducir música de suspense romántico
    const suspenseMusic = document.getElementById('suspense-music');
    if (suspenseMusic) {
        suspenseMusic.volume = 0.5; // Volumen al 50% para que sea suave y de fondo
        suspenseMusic.play().catch(e => console.log("No se pudo reproducir el audio:", e));
    }
    
    // Cambiar a la propuesta final después de 14.5 segundos
    // (11.5s inicio de la ultima palabra + 3s de su animacion)
    // Esto da MUCHISIMO tiempo para sacar el anillo
    setTimeout(() => {
        startMarriageProposal();
    }, 14500);
}

// Iniciar la propuesta de matrimonio final
function startMarriageProposal() {
    showScreen('marriageProposal');
    
    // Detener la música de suspense
    const suspenseMusic = document.getElementById('suspense-music');
    if (suspenseMusic) {
        suspenseMusic.pause();
        suspenseMusic.currentTime = 0;
    }
    
    // Iniciar la música alegre y mágica
    const happyMusic = document.getElementById('happy-music');
    if (happyMusic) {
        happyMusic.volume = 0.5; // Volumen suave
        happyMusic.play().catch(e => console.log("No se pudo reproducir el audio alegre:", e));
    }
    
    // Asegurar que las animaciones de las palabras se re-inicialicen
    const words = document.querySelectorAll('.slow-word');
    words.forEach(word => {
        word.style.animation = 'none';
        word.offsetHeight; // forzar reflow para reiniciar la animación
        word.style.animation = '';
    });
    
    const options = document.getElementById('marriage-options');
    options.classList.add('hidden');
    options.classList.remove('fade-in');
    
    // Hacer aparecer los botones después de que terminen las animaciones de las palabras (6 segundos)
    setTimeout(() => {
        options.classList.remove('hidden');
        options.classList.add('fade-in');
    }, 6000);
}

// Celebración final romántica (Al pulsar SI en propuesta final)
function celebrateProposal() {
    showScreen('finalCelebration');
    
    // Detener la música alegre de la pantalla anterior
    const happyMusic = document.getElementById('happy-music');
    if (happyMusic) {
        happyMusic.pause();
    }
    
    // Reproducir melodía sintetizada
    playRomanticMelody();
    
    // Iniciar lluvia de corazones flotantes
    spawnFloatingHearts();
    
    // Lanzar confeti continuo por 4 segundos
    UI.canvas.classList.remove('d-none');
    var duration = 4000;
    var end = Date.now() + duration;
    
    // Definir la forma de corazón para el confeti
    var heartShape = confetti.shapeFromPath({ 
        path: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' 
    });
    
    (function frame() {
        confetti({
            particleCount: 4,
            angle: 60,
            spread: 55,
            origin: { x: 0, y: 0.8 },
            colors: getConfettiColors(),
            shapes: [heartShape, 'circle']
        });
        confetti({
            particleCount: 4,
            angle: 120,
            spread: 55,
            origin: { x: 1, y: 0.8 },
            colors: getConfettiColors(),
            shapes: [heartShape, 'circle']
        });
        
        if (Date.now() < end) {
            requestAnimationFrame(frame);
        } else {
            setTimeout(() => {
                UI.canvas.classList.add('d-none');
            }, 1000);
        }
    }());
}

// Crear lluvia de corazones y anillos flotantes por toda la pantalla
function spawnFloatingHearts() {
    const heartContainer = document.body;
    const items = ['❤️', '💖', '💝', '💕', '💍', '🌸', '✨'];
    
    let count = 0;
    const interval = setInterval(() => {
        if (count > 45) {
            clearInterval(interval);
            return;
        }
        
        const el = document.createElement('div');
        el.className = 'floating-heart';
        el.textContent = items[Math.floor(Math.random() * items.length)];
        
        const startX = Math.random() * window.innerWidth;
        const duration = 3.5 + Math.random() * 2.5;
        const size = 16 + Math.random() * 24;
        const driftX = (Math.random() - 0.5) * 200;
        const scale = 0.5 + Math.random() * 1.0;
        
        el.style.left = `${startX}px`;
        el.style.fontSize = `${size}px`;
        el.style.animationDuration = `${duration}s`;
        el.style.setProperty('--random-x', `${driftX}px`);
        el.style.setProperty('--random-scale', `${scale}`);
        
        heartContainer.appendChild(el);
        
        setTimeout(() => {
            el.remove();
        }, duration * 1000);
        
        count++;
    }, 120);
}


// --- Regalo: pluma, tinta y libreta (cajita de corazón debajo del mueble de la tele) ---
// Cambia aquí las iniciales grabadas en la pluma
const COUPLE_INITIALS = 'C ♥ C';

function openGlovebox() {
    document.getElementById('glovebox-step-1').classList.remove('d-none');
    document.getElementById('glovebox-step-2').classList.add('d-none');
    document.getElementById('couple-initials').textContent = COUPLE_INITIALS;
    showScreen('glovebox');
}

function revealGift() {
    document.getElementById('glovebox-step-1').classList.add('d-none');
    document.getElementById('glovebox-step-2').classList.remove('d-none');
    if (typeof confetti === 'function') {
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors: getConfettiColors() });
    }
}
