// tasks.js - Logikk for oppgavesiden

// Google Script URL - *** VIKTIG: MÅ VÆRE SAMME SOM I ANDRE JS-FILER ***
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx41-6kS-KuMnBzSQmXUt9hsF0Q5BKRrzpkfA-3eFZ-5r3glDTMqqb3ZL-244LXi4wN/exec'; // <-- SETT INN DIN URL HER!

// Globale variabler for oppgavehåndtering
let allTasks = []; // Holder alle hentede oppgaver
let allCustomers = []; // Holder kundelisten for filter
let currentCustomerFilter = 'all'; // 'all' eller kundenavn
let currentStatusFilter = 'open'; // 'all', 'Ny', 'Pågår', 'Ferdig', 'Venter', 'open'

// --- Initialisering ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Tasks DOM lastet.");
    updateCurrentDateHeader_Tasks(); // Bruker egen funksjon for å unngå konflikt
    setupEventListeners_Tasks();
    fetchInitialData_Tasks();

    // Sjekk URL her også
    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL === 'DIN_NETTAPP_URL_HER') {
        alert("FEIL: GOOGLE_SCRIPT_URL er ikke satt i tasks.js!");
    }
});

function updateCurrentDateHeader_Tasks() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const displayElement = document.getElementById('current-date');
    if(displayElement) displayElement.textContent = now.toLocaleDateString('no-NO', options);
}

function setupEventListeners_Tasks() {
    // Filterknapper og dropdowns
    document.getElementById('customer-filter')?.addEventListener('change', handleCustomerFilterChange);
    document.querySelectorAll('.status-filter-btn')?.forEach(button => {
        button.addEventListener('click', handleStatusFilterChange);
    });

    // Knapper
    document.getElementById('refresh-tasks-button')?.addEventListener('click', fetchInitialData_Tasks);
    document.getElementById('add-task-btn')?.addEventListener('click', openAddTaskModal);
    document.getElementById('save-task-btn')?.addEventListener('click', handleSaveTask);

    // Lukkeknapper for modal (hvis ikke allerede globalt håndtert)
    document.querySelectorAll('#taskModal .close, #taskModal .cancel-btn').forEach(btn => {
         btn.addEventListener('click', () => closeModal('taskModal'));
    });

    // Drag and Drop Listeners (på kolonnene)
    document.querySelectorAll('.kanban-column .task-list').forEach(list => {
        list.addEventListener('dragover', handleDragOver);
        list.addEventListener('dragleave', handleDragLeave);
        list.addEventListener('drop', handleDrop);
    });
}

// --- Datahenting ---
function fetchInitialData_Tasks() {
    console.log("Henter initiale data for oppgaver...");
    // Vis en lasteindikator?
    showLoadingIndicator(true);

    // Hent både kunder (for filter) og oppgaver
    Promise.all([
        fetchCustomers_Tasks(),
        fetchTasks_Tasks() // Henter alle tasks initialt, filtreres i frontend
    ])
    .then(() => {
        console.log("Kunder og oppgaver hentet.");
        populateCustomerFilter();
        renderTaskBoard(); // Render tavlen med hentede data
    })
    .catch(error => {
        console.error("Feil ved henting av initiale data:", error);
        alert("Kunne ikke hente data for oppgavesiden: " + error.message);
    })
    .finally(() => {
        showLoadingIndicator(false); // Skjul lasteindikator
    });
}

function fetchCustomers_Tasks() {
    return fetchDataFromScript_Tasks({ action: 'getCustomers' })
        .then(data => {
            if (data.success && Array.isArray(data.customers)) {
                allCustomers = data.customers.sort((a, b) => a.name.localeCompare(b.name, 'no'));
                console.log("Kunder hentet:", allCustomers.length);
            } else {
                throw new Error(data.message || "Kunne ikke hente kundeliste");
            }
        });
}

function fetchTasks_Tasks() {
    // Henter *alle* tasks her for enklere frontend-filtrering initialt.
    // Kan endres til å sende filter med til backend for store datamengder.
    return fetchDataFromScript_Tasks({ action: 'getTasks' })
        .then(data => {
            if (data.success && Array.isArray(data.tasks)) {
                allTasks = data.tasks;
                console.log("Oppgaver hentet:", allTasks.length);
            } else {
                throw new Error(data.message || "Kunne ikke hente oppgaveliste");
            }
        });
}

// Generisk funksjon for API-kall (kan gjenbrukes fra andre filer hvis strukturert)
function fetchDataFromScript_Tasks(params) {
    // Forenklet fetch for denne filen (ingen JSONP fallback her som standard)
    const urlParams = new URLSearchParams(params);
    urlParams.append('nocache', Date.now());
    const url = `${GOOGLE_SCRIPT_URL}?${urlParams.toString()}`;
    console.log("Henter data:", url);

    return fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Nettverksfeil: ${response.status} ${response.statusText}`);
            }
            return response.json();
        })
        .catch(error => {
             console.error("Feil i fetchDataFromScript_Tasks:", error);
             // Returner et standard feilobjekt slik at Promise.all ikke stopper helt opp?
             return { success: false, message: error.message };
        });
}

// --- Rendering ---
function populateCustomerFilter() {
    const select = document.getElementById('customer-filter');
    if (!select) return;
    // Tøm eksisterende options (unntatt "Alle kunder")
    while (select.options.length > 1) {
        select.remove(1);
    }
    // Legg til kunder
    allCustomers.forEach(customer => {
        const option = document.createElement('option');
        option.value = customer.name;
        option.textContent = customer.name;
        select.appendChild(option);
    });
}

function renderTaskBoard() {
    console.log("Rendrer Kanban-tavle...");
    const board = document.getElementById('task-board');
    if (!board) return;

    // Tøm alle kolonner først
    board.querySelectorAll('.task-list').forEach(list => list.innerHTML = '');

    // Filtrer tasks basert på valgte filtere
    const filteredTasks = filterTasks(allTasks);
    console.log(`Viser ${filteredTasks.length} av ${allTasks.length} oppgaver.`);

    if (filteredTasks.length === 0) {
        // Vis melding hvis ingen oppgaver matcher filter
        const nyKolonne = board.querySelector('.kanban-column[data-status="Ny"] .task-list');
        if(nyKolonne) nyKolonne.innerHTML = '<div class="task-placeholder">Ingen oppgaver funnet for valgte filtre.</div>';
        return;
    }

    // Legg til oppgavekort i riktig kolonne
    filteredTasks.forEach(task => {
        const card = createTaskCardElement(task);
        const column = board.querySelector(`.kanban-column[data-status="${task.status}"] .task-list`);
        if (column) {
            column.appendChild(card);
        } else {
            console.warn(`Fant ikke kolonne for status: ${task.status}`);
            // Legg til i "Ny"-kolonnen som fallback?
            board.querySelector('.kanban-column[data-status="Ny"] .task-list')?.appendChild(card);
        }
    });
}

function createTaskCardElement(task) {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.setAttribute('draggable', true);
    card.setAttribute('data-task-id', task.id);

    // Legg til prioritetklasse
    if (task.priority) {
        card.classList.add(`priority-${task.priority.toLowerCase()}`);
    }

    // Beregn om frist er forfalt
    let dueDateHtml = '';
    if (task.dueDate) {
        const dueDate = new Date(task.dueDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        dueDate.setHours(0, 0, 0, 0); // Sammenlign kun dato
        const isOverdue = dueDate < today;
        dueDateHtml = `
            <span class="task-due-date ${isOverdue ? 'overdue' : ''}" title="Frist">
                📅 ${new Date(task.dueDate).toLocaleDateString('no-NO', { day: 'numeric', month: 'short' })} ${isOverdue ? '(Forfalt)' : ''}
            </span>`;
    }

    card.innerHTML = `
        <h4>${task.name || 'Ukjent oppgave'}</h4>
        <div class="task-meta">
            <span class="task-customer" title="Kunde">👤 ${task.customer || 'Ingen'}</span>
            ${dueDateHtml}
            ${task.priority ? `<span title="Prioritet">${getPriorityIcon(task.priority)} ${task.priority}</span>` : ''}
        </div>
    `;

    // Legg til event listeners for drag og klikk (for redigering)
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
    card.addEventListener('click', () => openEditTaskModal(task.id));

    return card;
}

function getPriorityIcon(priority) {
    switch (priority?.toLowerCase()) {
        case 'høy': return '🔴';
        case 'medium': return '🟡';
        case 'lav': return '🔵';
        default: return '';
    }
}

function showLoadingIndicator(isLoading) {
    // Implementer visning/skjuling av en lasteindikator, f.eks.:
    const boardContainer = document.getElementById('task-board-container');
    if (isLoading) {
        boardContainer?.classList.add('loading'); // CSS må definere .loading
        console.log("Viser lasteindikator");
    } else {
        boardContainer?.classList.remove('loading');
        console.log("Skjuler lasteindikator");
    }
}

// --- Filter Håndtering ---
function handleCustomerFilterChange(event) {
    currentCustomerFilter = event.target.value;
    console.log("Kundefilter endret til:", currentCustomerFilter);
    renderTaskBoard(); // Render på nytt med nytt filter
}

function handleStatusFilterChange(event) {
    const clickedButton = event.target;
    currentStatusFilter = clickedButton.getAttribute('data-status');
    console.log("Statusfilter endret til:", currentStatusFilter);

    // Oppdater aktiv knapp
    document.querySelectorAll('.status-filter-btn').forEach(btn => btn.classList.remove('active'));
    clickedButton.classList.add('active');

    renderTaskBoard(); // Render på nytt
}

function filterTasks(tasks) {
    return tasks.filter(task => {
        const customerMatch = currentCustomerFilter === 'all' || task.customer === currentCustomerFilter;

        let statusMatch = false;
        const taskStatusLower = task.status?.toLowerCase();
        if (currentStatusFilter === 'all') {
            statusMatch = true;
        } else if (currentStatusFilter === 'open') {
            statusMatch = taskStatusLower === 'ny' || taskStatusLower === 'pågår';
        } else {
            statusMatch = taskStatusLower === currentStatusFilter?.toLowerCase();
        }

        return customerMatch && statusMatch;
    });
}


// --- Modal og Lagring ---
function openAddTaskModal() {
    console.log("Åpner Legg til Oppgave-modal");
    clearTaskModal();
    document.getElementById('task-modal-title').textContent = 'Legg til ny oppgave';
    populateCustomerDropdown_Modal(); // Fyll kunde-dropdown
    document.getElementById('taskModal').style.display = 'block';
}

function openEditTaskModal(taskId) {
    console.log("Åpner Rediger Oppgave-modal for:", taskId);
    const task = allTasks.find(t => t.id === taskId);
    if (!task) {
        alert("Fant ikke oppgaven som skulle redigeres.");
        return;
    }
    clearTaskModal();
    document.getElementById('task-modal-title').textContent = 'Rediger oppgave';
    populateCustomerDropdown_Modal(); // Fyll kunde-dropdown

    // Fyll ut skjema
    document.getElementById('task-id').value = task.id;
    document.getElementById('task-customer').value = task.customer;
    document.getElementById('task-name').value = task.name;
    document.getElementById('task-description').value = task.description || '';
    document.getElementById('task-status').value = task.status;
    document.getElementById('task-priority').value = task.priority || '';
    document.getElementById('task-due-date').value = task.dueDate || '';

    document.getElementById('taskModal').style.display = 'block';
}

function clearTaskModal() {
    document.getElementById('task-id').value = '';
    document.getElementById('task-customer').value = '';
    document.getElementById('task-name').value = '';
    document.getElementById('task-description').value = '';
    document.getElementById('task-status').value = 'Ny'; // Default
    document.getElementById('task-priority').value = ''; // Default
    document.getElementById('task-due-date').value = '';
}

function populateCustomerDropdown_Modal() {
     const select = document.getElementById('task-customer');
    if (!select) return;
    // Tøm eksisterende options (unntatt placeholder)
    while (select.options.length > 1) {
        select.remove(1);
    }
    // Legg til kunder
    allCustomers.forEach(customer => {
        const option = document.createElement('option');
        option.value = customer.name;
        option.textContent = customer.name;
        select.appendChild(option);
    });
}

function handleSaveTask() {
    const taskId = document.getElementById('task-id').value;
    const taskData = {
        // Samle data fra skjemaet
        id: taskId || null, // Inkluder ID hvis den finnes (for oppdatering)
        customer: document.getElementById('task-customer').value,
        name: document.getElementById('task-name').value.trim(),
        description: document.getElementById('task-description').value.trim(),
        status: document.getElementById('task-status').value,
        priority: document.getElementById('task-priority').value || null,
        dueDate: document.getElementById('task-due-date').value || null,
    };

    // Validering (enkel)
    if (!taskData.customer) {
        alert("Vennligst velg en kunde.");
        return;
    }
    if (!taskData.name) {
        alert("Vennligst skriv inn et oppgavenavn.");
        return;
    }

    console.log("Lagrer oppgave:", taskData);
    const action = taskId ? 'updateTask' : 'addTask'; // Bestem backend-handling
    taskData.action = action; // Legg til action for GAS

    // Deaktiver knapp
    const saveButton = document.getElementById('save-task-btn');
    saveButton.disabled = true;
    saveButton.textContent = 'Lagrer...';

    // Kall backend
    // Bruk en POST-versjon av sendData... hvis du har en, ellers må 'sendDataToScript_Tasks' tilpasses
    // Her antar vi en POST-funksjon `postDataToScript_Tasks` eksisterer (lignende sendDataToGoogleScript)
    postDataToScript_Tasks(taskData, action === 'addTask' ? 'Oppgave lagt til' : 'Oppgave oppdatert')
        .then(response => {
            if (response.success) {
                closeModal('taskModal');
                fetchTasks_Tasks().then(renderTaskBoard); // Hent oppgaver på nytt og re-render
                // Vis en liten bekreftelse?
            } else {
                alert(`Kunne ikke lagre oppgave: ${response.message || 'Ukjent feil'}`);
            }
        })
        .catch(error => {
            console.error("Feil ved lagring av oppgave:", error);
            alert(`Feil ved lagring av oppgave: ${error.message}`);
        })
        .finally(() => {
            saveButton.disabled = false;
            saveButton.textContent = taskId ? 'Lagre Endringer' : 'Lagre Oppgave';
        });
}

// --- Drag and Drop Håndtering ---
let draggedTaskId = null;

function handleDragStart(event) {
    draggedTaskId = event.target.getAttribute('data-task-id');
    event.target.classList.add('dragging');
    console.log(`Starter drag for task: ${draggedTaskId}`);
    // event.dataTransfer.setData('text/plain', draggedTaskId); // Trengs ofte ikke hvis vi bruker global var
}

function handleDragEnd(event) {
    event.target.classList.remove('dragging');
    console.log(`Avslutter drag for task: ${draggedTaskId}`);
    draggedTaskId = null; // Nullstill
}

function handleDragOver(event) {
    event.preventDefault(); // Nødvendig for å tillate drop
    event.currentTarget.classList.add('drag-over');
    // console.log("Drag over:", event.currentTarget.closest('.kanban-column').getAttribute('data-status'));
}

function handleDragLeave(event) {
    event.currentTarget.classList.remove('drag-over');
}

function handleDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    const targetColumn = event.currentTarget.closest('.kanban-column');
    const newStatus = targetColumn?.getAttribute('data-status');

    if (newStatus && draggedTaskId) {
        console.log(`Slipper task ${draggedTaskId} i kolonne ${newStatus}`);
        const taskCard = document.querySelector(`.task-card[data-task-id='${draggedTaskId}']`);
        const currentColumn = taskCard?.closest('.kanban-column');
        const currentStatus = currentColumn?.getAttribute('data-status');

        // Bare oppdater hvis status faktisk er endret
        if (newStatus !== currentStatus) {
             // Flytt kortet i UI umiddelbart (optimistisk)
            event.currentTarget.appendChild(taskCard); // 'currentTarget' er .task-list
            // Oppdater status i backend
            updateTaskStatus(draggedTaskId, newStatus);
        } else {
             console.log("Ingen statusendring.");
        }

    } else {
         console.warn("Drop feilet: mangler status eller task ID", newStatus, draggedTaskId);
    }
    // Nullstill uansett
    draggedTaskId = null;
}

function updateTaskStatus(taskId, newStatus) {
    console.log(`Oppdaterer status for ${taskId} til ${newStatus}`);
    const taskData = {
        action: 'updateTask',
        id: taskId,
        status: newStatus
    };

    // Kall backend (uten å vente på svar for UI-oppdateringen, men logg feil)
    postDataToScript_Tasks(taskData, `Status oppdatert for ${taskId}`)
        .then(response => {
            if (!response.success) {
                console.error(`Feil ved oppdatering av status for ${taskId} til ${newStatus}:`, response.message);
                alert(`Kunne ikke oppdatere status for oppgaven: ${response.message || 'Ukjent feil'}. Last siden på nytt.`);
                // Vurder å reversere UI-endringen ved feil?
                fetchTasks_Tasks().then(renderTaskBoard); // Hent alt på nytt for å korrigere
            } else {
                 console.log(`Status for ${taskId} lagret som ${newStatus}`);
                 // Oppdater den lokale 'allTasks' arrayen også
                 const taskIndex = allTasks.findIndex(t => t.id === taskId);
                 if(taskIndex > -1) {
                     allTasks[taskIndex].status = newStatus;
                 }
            }
        })
        .catch(error => {
             console.error(`Nettverksfeil ved oppdatering av status for ${taskId} til ${newStatus}:`, error);
             alert(`Nettverksfeil ved oppdatering av status: ${error.message}. Last siden på nytt.`);
             fetchTasks_Tasks().then(renderTaskBoard); // Hent alt på nytt for å korrigere
        });
}


// --- GENERELL POST-FUNKSJON (LIGNER sendDataToGoogleScript) ---
// Denne MÅ tilpasses/erstattes med en robust funksjon som håndterer POST
// og gjerne fallbacks, lik den i script.js.
// For enkelhets skyld bruker vi en naiv fetch POST her.
function postDataToScript_Tasks(data, successMessage) {
    console.log("Sender POST-data:", data);
    const formData = new FormData();
    for (const key in data) {
        formData.append(key, data[key]);
    }

    return fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        body: formData,
        // mode: 'no-cors' // Kan brukes, men da får vi ikke svar
    })
    .then(response => {
        if (!response.ok) {
             // Prøv å få tak i feilmelding fra body hvis mulig
             return response.text().then(text => {
                 try {
                     const errorData = JSON.parse(text);
                     throw new Error(errorData.message || `HTTP error ${response.status}`);
                 } catch(e) {
                      throw new Error(`HTTP error ${response.status} - Ugyldig feilrespons`);
                 }
             });
        }
        return response.json(); // Anta JSON-svar ved suksess
    })
    .then(jsonData => {
         if (jsonData.success !== undefined) { // Sjekk om success finnes
             console.log("POST vellykket:", jsonData);
             return jsonData; // Returner hele svaret
         } else {
             throw new Error("Ugyldig JSON-format i svar fra POST");
         }
    });
}


// Lukker modalvinduer
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = 'none';
  else console.warn(`Forsøkte å lukke ukjent modal: ${modalId}`);
}
