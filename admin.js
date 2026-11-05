let questions = [];
let editingIndex = -1;

const listScreen = document.getElementById('list-screen');
const editorScreen = document.getElementById('editor-screen');
const questionsList = document.getElementById('questions-list');
const questionForm = document.getElementById('question-form');

const btnAddNew = document.getElementById('btn-add-new');
const btnCancelEdit = document.getElementById('btn-cancel-edit');
const btnSaveAll = document.getElementById('btn-save-all');

const qText = document.getElementById('q-text');
const qImageFile = document.getElementById('q-image-file');
const qImageUrl = document.getElementById('q-image-url');
const qImagePreview = document.getElementById('q-image-preview');
const qOptionInputs = document.querySelectorAll('.q-option');
const qCorrectIndex = document.getElementById('q-correct-index');
const qIsPersonal = document.getElementById('q-is-personal');
const qPlace = document.getElementById('q-place');

// Lugares de la isla (data/places.js): solo los de la parte teórica
const theoryPlaces = (window.PLACES || []).filter(p => p.stage === 'theory');
const placeName = id => (theoryPlaces.find(p => p.id === id) || {}).name;
qPlace.innerHTML = '<option value="">(Sin lugar: va con la pregunta anterior)</option>' +
    theoryPlaces.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('questions.json');
        if (response.ok) {
            questions = await response.json();
            renderList();
        }
    } catch (e) {
        console.error("Error loading questions", e);
    }
});

function renderList() {
    questionsList.innerHTML = '';
    questions.forEach((q, index) => {
        const div = document.createElement('div');
        div.className = 'question-list-item';
        div.style.alignItems = 'flex-start';

        let optionsHtml = '<ul style="list-style-type: none; padding: 0; margin-top: 10px; width: 100%;">';
        if (q.options) {
            q.options.forEach((opt, optIndex) => {
                let isCorrect = q.isPersonal || q.correctIndex === optIndex || q.correctIndex === -1;
                let colorStyle = isCorrect ? 'color: #10b981; font-weight: bold; background: rgba(16, 185, 129, 0.1); border-left: 3px solid #10b981; padding-left: 8px; border-radius: 4px;' : 'color: #666; padding-left: 11px;';
                optionsHtml += `<li style="margin-bottom: 5px; font-size: 0.9rem; padding: 4px; ${colorStyle}">${opt}</li>`;
            });
        }
        optionsHtml += '</ul>';

        let imageHtml = '';
        if (q.image) {
            imageHtml = `<img src="${q.image}" style="max-width: 120px; max-height: 80px; border-radius: 8px; border: 1px solid var(--glass-border); margin-top: 10px; object-fit: contain;">`;
        }

        div.innerHTML = `
            <div style="flex: 1; margin-right: 15px; overflow: hidden;">
                <h4>Pregunta ${index + 1} ${q.place ? `<span style="font-size:.8rem;background:#ffd23f;border-radius:8px;padding:2px 8px;margin-left:6px;">📍 ${placeName(q.place) || q.place + ' (no existe)'}</span>` : ''}</h4>
                <p style="margin:0; font-size: 1rem; font-weight: 600;">${q.text}</p>
                <div style="display: flex; gap: 15px; align-items: flex-start; flex-wrap: wrap;">
                    ${imageHtml ? `<div>${imageHtml}</div>` : ''}
                    <div style="flex: 1; min-width: 200px;">
                        ${optionsHtml}
                    </div>
                </div>
            </div>
            <div class="admin-actions" style="flex-direction: column;">
                ${index > 0 ? `<button onclick="moveQuestionUp(${index})" style="margin-bottom: 5px; background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1;">⬆️ Subir</button>` : ''}
                ${index < questions.length - 1 ? `<button onclick="moveQuestionDown(${index})" style="margin-bottom: 5px; background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1;">⬇️ Bajar</button>` : ''}
                <button class="edit" onclick="editQuestion(${index})" style="margin-bottom: 5px;">Editar</button>
                <button class="delete" onclick="deleteQuestion(${index})">Eliminar</button>
            </div>
        `;
        questionsList.appendChild(div);
    });
}

function showScreen(screen) {
    if (screen === 'list') {
        editorScreen.classList.remove('active');
        editorScreen.classList.add('hidden');
        setTimeout(() => {
            listScreen.classList.remove('hidden');
            listScreen.classList.add('active');
        }, 50);
    } else {
        listScreen.classList.remove('active');
        listScreen.classList.add('hidden');
        setTimeout(() => {
            editorScreen.classList.remove('hidden');
            editorScreen.classList.add('active');
        }, 50);
    }
}

btnAddNew.addEventListener('click', () => {
    editingIndex = -1;
    document.getElementById('editor-title').textContent = 'Nueva Pregunta';
    questionForm.reset();
    qImageUrl.value = '';
    qImagePreview.style.display = 'none';
    qImagePreview.src = '';
    qPlace.value = '';
    showScreen('editor');
});

btnCancelEdit.addEventListener('click', () => {
    showScreen('list');
});

window.editQuestion = (index) => {
    editingIndex = index;
    const q = questions[index];
    document.getElementById('editor-title').textContent = 'Editar Pregunta';

    qText.value = q.text;
    qImageUrl.value = q.image || '';
    if (q.image) {
        qImagePreview.src = q.image;
        qImagePreview.style.display = 'block';
    } else {
        qImagePreview.style.display = 'none';
        qImagePreview.src = '';
    }

    qOptionInputs[0].value = q.options[0] || '';
    qOptionInputs[1].value = q.options[1] || '';
    qOptionInputs[2].value = q.options[2] || '';

    qCorrectIndex.value = q.correctIndex.toString();
    qIsPersonal.checked = q.isPersonal;
    qPlace.value = q.place || '';

    showScreen('editor');
};

window.deleteQuestion = (index) => {
    if (confirm('¿Estás seguro de que quieres eliminar esta pregunta?')) {
        questions.splice(index, 1);
        renderList();
    }
};

window.moveQuestionUp = (index) => {
    if (index > 0) {
        const temp = questions[index];
        questions[index] = questions[index - 1];
        questions[index - 1] = temp;
        renderList();
    }
};

window.moveQuestionDown = (index) => {
    if (index < questions.length - 1) {
        const temp = questions[index];
        questions[index] = questions[index + 1];
        questions[index + 1] = temp;
        renderList();
    }
};

qImageFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (event) {
            const base64Str = event.target.result;
            qImagePreview.src = base64Str;
            qImagePreview.style.display = 'block';

            // Upload immediately
            fetch('/api/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: file.name,
                    image_base64: base64Str
                })
            })
                .then(res => res.json())
                .then(data => {
                    if (data.url) {
                        qImageUrl.value = data.url;
                    }
                })
                .catch(err => console.error("Error uploading image:", err));
        };
        reader.readAsDataURL(file);
    }
});

questionForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const prev = editingIndex === -1 ? {} : questions[editingIndex];
    const newQ = {
        ...prev,
        text: qText.value,
        image: qImageUrl.value,
        options: [
            qOptionInputs[0].value,
            qOptionInputs[1].value,
            qOptionInputs[2].value
        ],
        correctIndex: parseInt(qCorrectIndex.value),
        isPersonal: qIsPersonal.checked
    };
    if (qPlace.value) newQ.place = qPlace.value; else delete newQ.place;

    if (editingIndex === -1) {
        questions.push(newQ);
    } else {
        questions[editingIndex] = newQ;
    }

    renderList();
    showScreen('list');
});

btnSaveAll.addEventListener('click', async () => {
    try {
        const btn = btnSaveAll;
        btn.textContent = 'Guardando...';
        const res = await fetch('/api/questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(questions)
        });
        if (res.ok) {
            alert('¡Cambios guardados en el servidor!');
        } else {
            alert('Error al guardar.');
        }
        btn.textContent = 'Guardar Cambios en Servidor';
    } catch (e) {
        console.error(e);
        alert('Error de conexión.');
        btnSaveAll.textContent = 'Guardar Cambios en Servidor';
    }
});
