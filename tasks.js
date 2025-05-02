// tasks.js - Logikk for oppgavesiden

// Google Script URL - *** VIKTIG: MÅ VÆRE SAMME SOM I ANDRE JS-FILER ***
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbygsRX8Xyl_0FzXDIZdPayuNToV7Kq0M6HAtpVw2drqIJg3y7h_nXEpksw-dqXMlHrI/exec'; // <-- SETT INN DIN URL HER!

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
    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL === 'DIN_NETTAPP_URL_HER' || GOOGLE_SCRIPT_URL === 'https://script.google.com/macros/s/AKfycbx41-6kS-KuMnBzSQmXUt9hsF0Q5BKRrzpkfA-3eFZ-5r3glDTMqqb3ZL-244LXi4wN/exec') {
        alert("FEIL: GOOGLE_SCRIPT_URL er ikke satt riktig i tasks.js!");
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

    // Lukkeknapper for modal
    document.querySelectorAll('#taskModal .close, #taskModal .cancel-btn').forEach(btn => {
         btn.addEventListener('click', () => closeModal('taskModal'));
    });

     // Lukk modal ved klikk utenfor
    window.addEventListener('click', function(event) {
        const taskModal = document.getElementById('taskModal');
        if (taskModal && taskModal.style.display === 'block' && event.target === taskModal) {
            closeModal('taskModal');
        }
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
    showLoadingIndicator(true);

    Promise.all([
        fetchCustomers_Tasks(),
        fetchTasks_Tasks()
    ])
    .then(() => {
        console.log("Kunder og oppgaver hentet.");
        populateCustomerFilter();
        renderTaskBoard(); // Render tavlen med hentede data
    })
    .catch(error => {
        console.error("Feil ved henting av initiale data:", error);
        alert("Kunne ikke hente data for oppgavesiden: " + error.message);
        // Vis en feilmelding i stedet for lasteindikator
         const board = document.getElementById('task-board');
         if(board) {
            board.querySelectorAll('.task-list').forEach(list => list.innerHTML = '<div class="task-placeholder">Kunne ikke laste oppgaver.</div>');
         }
    })
    .finally(() => {
        showLoadingIndicator(false);
    });
}

function fetchCustomers_Tasks() {
    return fetchDataFromScript_Tasks({ action: 'getCustomers' })
        .then(data => {
            if (data.success && Array.isArray(data.customers)) {
                allCustomers = data.customers.sort((a, b) => a.name.localeCompare(b.name, 'no'));
                console.log("Kunder hentet:", allCustomers.length);
            } else {
                // Ikke kast feil her, la Promise.all fortsette hvis mulig
                console.error("Kunne ikke hente kundeliste:", data.message);
                allCustomers = []; // Sett til tom liste ved feil
                // throw new Error(data.message || "Kunne ikke hente kundeliste");
            }
            return allCustomers; // Returner uansett for Promise.all
        });
}

function fetchTasks_Tasks() {
    return fetchDataFromScript_Tasks({ action: 'getTasks' }) // Henter alle som standard
        .then(data => {
            if (data.success && Array.isArray(data.tasks)) {
                allTasks = data.tasks;
                console.log("Oppgaver hentet:", allTasks.length);
            } else {
                console.error("Kunne ikke hente oppgaveliste:", data.message);
                allTasks = []; // Sett til tom liste ved feil
                // throw new Error(data.message || "Kunne ikke hente oppgaveliste");
            }
            return allTasks; // Returner uansett for Promise.all
        });
}


function fetchDataFromScript_Tasks(params) {
    const urlParams = new URLSearchParams(params);
    urlParams.append('nocache', Date.now());
    const url = `${GOOGLE_SCRIPT_URL}?${urlParams.toString()}`;
    console.log("Henter data:", url);

    return fetch(url)
        .then(response => {
            if (!response.ok) {
                // Prøv å få tekstlig feilmelding fra responsen
                 return response.text().then(text => {
                    throw new Error(text || `Nettverksfeil: ${response.status}`);
                 });
            }
            return response.json();
        })
        .catch(error => {
             console.error("Feil i fetchDataFromScript_Tasks:", error);
             // Returner et feilobjekt som Promise.all kan håndtere
             return { success: false, message: error.message };
        });
}

// --- Rendering ---
function populateCustomerFilter() {
    const select = document.getElementById('customer-filter');
    if (!select) return;
    while (select.options.length > 1) select.remove(1);
    allCustomers.forEach(customer => {
        const option = document.createElement('option');
        option.value = customer.name; option.textContent = customer.name;
        select.appendChild(option);
    });
}

// ========== START OPPDATERT renderTaskBoard MED SORTERING ==========
function renderTaskBoard() {
    console.log("Rendrer Kanban-tavle...");
    const board = document.getElementById('task-board');
    if (!board) return;

    board.querySelectorAll('.task-list').forEach(list => list.innerHTML = ''); // Tøm kolonner

    let filteredTasks = filterTasks(allTasks);
    console.log(`Viser ${filteredTasks.length} av ${allTasks.length} oppgaver etter filter.`);

    // Sorter etter frist (dueDate), tidligst først, de uten frist sist
    filteredTasks.sort((a, b) => {
        const dateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity; // Bruk getTime() for tall, Infinity for null
        const dateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return dateA - dateB; // Sorter numerisk
    });
    console.log("Oppgaver sortert etter frist.");

    if (filteredTasks.length === 0) {
        const nyKolonne = board.querySelector('.kanban-column[data-status="Ny"] .task-list');
        if(nyKolonne) nyKolonne.innerHTML = '<div class="task-placeholder">Ingen oppgaver funnet.</div>';
        return;
    }

    filteredTasks.forEach(task => {
        const card = createTaskCardElement(task); // Denne lager nå kort med frist-klasser
        const columnList = board.querySelector(`.kanban-column[data-status="${task.status}"] .task-list`);
        if (columnList) {
            columnList.appendChild(card);
        } else {
            console.warn(`Fant ikke kolonne for status: ${task.status}, legger i "Ny".`);
            board.querySelector('.kanban-column[data-status="Ny"] .task-list')?.appendChild(card);
        }
    });
}
// ========== SLUTT OPPDATERT renderTaskBoard ==========


// ========== START OPPDATERT createTaskCardElement MED FRIST-KLASSER ==========
function createTaskCardElement(task) {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.setAttribute('draggable', true);
    card.setAttribute('data-task-id', task.id);

    if (task.priority) card.classList.add(`priority-${task.priority.toLowerCase()}`);

    // Sjekk frist og legg til markeringsklasser
    let dueDateHtml = '';
    let isOverdue = false;

    if (task.dueDate) {
        const dueDate = new Date(task.dueDate);
        const today = new Date();
        dueDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        const timeDiff = dueDate.getTime() - today.getTime();
        const daysUntilDue = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
        isOverdue = daysUntilDue < 0;

        card.classList.remove('due-near', 'due-soon', 'due-overdue'); // Fjern gamle klasser først
        if (isOverdue) card.classList.add('due-overdue');
        else if (daysUntilDue <= 3) card.classList.add('due-soon');
        else if (daysUntilDue <= 7) card.classList.add('due-near');

        dueDateHtml = `
            <span class="task-due-date ${isOverdue ? 'overdue' : ''}" title="Frist">
                📅 ${new Date(task.dueDate).toLocaleDateString('no-NO', { day: 'numeric', month: 'short' })}
                ${isOverdue ? ' (Forfalt)' : (daysUntilDue <= 7 ? ` (${daysUntilDue} d)` : '')}
            </span>`;
        // console.log(`Task ${task.id}: Frist ${task.dueDate}, Dager: ${daysUntilDue}, Overdue: ${isOverdue}, Klasse: ${card.classList}`);
    }

    card.innerHTML = `
        <h4>${task.name || 'Ukjent oppgave'}</h4>
        <div class="task-meta">
            <span class="task-customer" title="Kunde">👤 ${task.customer || 'Ingen'}</span>
            ${dueDateHtml}
            ${task.priority ? `<span title="Prioritet">${getPriorityIcon(task.priority)} ${task.priority}</span>` : ''}
        </div>
    `;

    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
    card.addEventListener('click', () => openEditTaskModal(task.id));
    return card;
}
// ========== SLUTT OPPDATERT createTaskCardElement ==========

function getPriorityIcon(priority) {
    switch (priority?.toLowerCase()) {
        case 'høy': return '🔴'; case 'medium': return '🟡'; case 'lav': return '🔵'; default: return '';
    }
}

function showLoadingIndicator(isLoading) {
    const board = document.getElementById('task-board');
    if(!board) return;
    if (isLoading) {
        // Vis en enkel melding i første kolonne
         const nyKolonne = board.querySelector('.kanban-column[data-status="Ny"] .task-list');
         if(nyKolonne) nyKolonne.innerHTML = '<div class="task-placeholder">Laster oppgaver...</div>';
    } else {
        // Innhold fjernes uansett av renderTaskBoard, så ingen handling nødvendig her
    }
}

// --- Filter Håndtering ---
function handleCustomerFilterChange(event) {
    currentCustomerFilter = event.target.value;
    console.log("Kundefilter endret til:", currentCustomerFilter);
    renderTaskBoard();
}

function handleStatusFilterChange(event) {
    const clickedButton = event.target;
    currentStatusFilter = clickedButton.getAttribute('data-status');
    console.log("Statusfilter endret til:", currentStatusFilter);
    document.querySelectorAll('.status-filter-btn').forEach(btn => btn.classList.remove('active'));
    clickedButton.classList.add('active');
    renderTaskBoard();
}

function filterTasks(tasks) {
    return tasks.filter(task => {
        const customerMatch = currentCustomerFilter === 'all' || task.customer === currentCustomerFilter;
        let statusMatch = false;
        const taskStatusLower = task.status?.toLowerCase();
        if (currentStatusFilter === 'all') statusMatch = true;
        else if (currentStatusFilter === 'open') statusMatch = taskStatusLower === 'ny' || taskStatusLower === 'pågår';
        else statusMatch = taskStatusLower === currentStatusFilter?.toLowerCase();
        return customerMatch && statusMatch;
    });
}

// --- Modal og Lagring ---
function openAddTaskModal() {
    console.log("Åpner Legg til Oppgave-modal");
    clearTaskModal();
    document.getElementById('task-modal-title').textContent = 'Legg til ny oppgave';
    populateCustomerDropdown_Modal();
    document.getElementById('taskModal').style.display = 'block';
}

function openEditTaskModal(taskId) {
    console.log("Åpner Rediger Oppgave-modal for:", taskId);
    const task = allTasks.find(t => t.id === taskId);
    if (!task) { alert("Fant ikke oppgaven."); return; }
    clearTaskModal();
    document.getElementById('task-modal-title').textContent = 'Rediger oppgave';
    populateCustomerDropdown_Modal();

    document.getElementById('task-id').value = task.id;
    document.getElementById('task-customer').value = task.customer;
    document.getElementById('task-name').value = task.name;
    document.getElementById('task-description').value = task.description || '';
    document.getElementById('task-status').value = task.status;
    document.getElementById('task-priority').value = task.priority || '';
    document.getElementById('task-due-date').value = task.dueDate || ''; // Backend sender yyyy-mm-dd

    document.getElementById('taskModal').style.display = 'block';
}

function clearTaskModal() {
    document.getElementById('task-id').value = '';
    document.getElementById('task-customer').value = ''; // Vil bli satt av populate, men greit å nullstille
    document.getElementById('task-name').value = '';
    document.getElementById('task-description').value = '';
    document.getElementById('task-status').value = 'Ny';
    document.getElementById('task-priority').value = '';
    document.getElementById('task-due-date').value = '';
}

function populateCustomerDropdown_Modal() {
     const select = document.getElementById('task-customer');
    if (!select) return;
    const currentValue = select.value; // Ta vare på valgt kunde ved redigering
    while (select.options.length > 1) select.remove(1); // Behold placeholder
    allCustomers.forEach(customer => {
        const option = document.createElement('option');
        option.value = customer.name; option.textContent = customer.name;
        select.appendChild(option);
    });
    if(currentValue) select.value = currentValue; // Sett tilbake valgt kunde
}

function handleSaveTask() {
    const taskId = document.getElementById('task-id').value;
    const taskData = {
        id: taskId || undefined, // Send kun med ID hvis den finnes
        customer: document.getElementById('task-customer').value,
        name: document.getElementById('task-name').value.trim(),
        description: document.getElementById('task-description').value.trim(),
        status: document.getElementById('task-status').value,
        priority: document.getElementById('task-priority').value || null, // Send null hvis tom
        dueDate: document.getElementById('task-due-date').value || null, // Send null hvis tom
    };

    if (!taskData.customer) { alert("Velg en kunde."); return; }
    if (!taskData.name) { alert("Skriv inn et oppgavenavn."); return; }

    console.log("Lagrer oppgave:", taskData);
    const action = taskId ? 'updateTask' : 'addTask';
    taskData.action = action;

    const saveButton = document.getElementById('save-task-btn');
    saveButton.disabled = true; saveButton.textContent = 'Lagrer...';

    postDataToScript_Tasks(taskData, action === 'addTask' ? 'Oppgave lagt til' : 'Oppgave oppdatert')
        .then(response => {
            if (response.success) {
                closeModal('taskModal');
                // Oppdater datalisten lokalt eller hent på nytt
                // Enklest å hente på nytt for å sikre konsistens
                return fetchTasks_Tasks().then(renderTaskBoard);
            } else {
                throw new Error(response.message || 'Ukjent feil ved lagring');
            }
        })
        .catch(error => {
            console.error("Feil ved lagring av oppgave:", error);
            alert(`Kunne ikke lagre oppgave: ${error.message}`);
        })
        .finally(() => {
            saveButton.disabled = false;
            saveButton.textContent = taskId ? 'Lagre Endringer' : 'Lagre Oppgave';
        });
}

// --- Drag and Drop Håndtering ---
let draggedTaskId = null;

function handleDragStart(event) {
    // Sjekk at det er selve kortet som dras, ikke et internt element
    if (!event.target.classList.contains('task-card')) return;
    draggedTaskId = event.target.getAttribute('data-task-id');
    // Sett en liten forsinkelse før 'dragging'-klassen legges til
    setTimeout(() => event.target.classList.add('dragging'), 0);
    console.log(`Starter drag for task: ${draggedTaskId}`);
    // Trenger vanligvis ikke dataTransfer for dette scenarioet
    // event.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(event) {
    // Sjekk at det er kortet som avsluttet drag
    if (event.target.classList.contains('task-card')) {
        event.target.classList.remove('dragging');
    }
    // Fjern 'drag-over' fra alle kolonner for sikkerhets skyld
    document.querySelectorAll('.kanban-column .task-list.drag-over')
            .forEach(list => list.classList.remove('drag-over'));
    console.log(`Avslutter drag for task: ${draggedTaskId}`);
    draggedTaskId = null; // Nullstill alltid
}

function handleDragOver(event) {
    event.preventDefault(); // Må ha denne for at drop skal fungere
    event.currentTarget.classList.add('drag-over');
    event.dataTransfer.dropEffect = 'move';
}

function handleDragLeave(event) {
    // Fjern kun hvis vi forlater selve lista, ikke interne elementer
    if (event.currentTarget.contains(event.relatedTarget)) return;
    event.currentTarget.classList.remove('drag-over');
}

function handleDrop(event) {
    event.preventDefault();
    const targetList = event.currentTarget; // Dette er .task-list
    targetList.classList.remove('drag-over');
    const targetColumn = targetList.closest('.kanban-column');
    const newStatus = targetColumn?.getAttribute('data-status');
    const droppedOnCard = event.target.closest('.task-card'); // Fant vi et kort?

    if (newStatus && draggedTaskId) {
        console.log(`Slipper task ${draggedTaskId} i kolonne ${newStatus}`);
        const taskCard = document.querySelector(`.task-card[data-task-id='${draggedTaskId}']`);
        if (!taskCard) { console.warn("Fant ikke dratt kort?"); return; }

        const currentColumn = taskCard.closest('.kanban-column');
        const currentStatus = currentColumn?.getAttribute('data-status');

        if (newStatus !== currentStatus) {
            // Optimistisk UI-oppdatering: Flytt kortet
            if(droppedOnCard) {
                // Hvis vi slapp på et annet kort, legg det nye før det
                targetList.insertBefore(taskCard, droppedOnCard);
            } else {
                 // Ellers legg til på slutten av listen
                targetList.appendChild(taskCard);
            }
            // Oppdater status i backend
            updateTaskStatus(draggedTaskId, newStatus);
        } else {
            console.log("Ingen statusendring.");
        }
    } else {
         console.warn("Drop feilet: mangler status eller task ID");
    }
    draggedTaskId = null; // Nullstill
}

function updateTaskStatus(taskId, newStatus) {
    console.log(`Oppdaterer status for ${taskId} til ${newStatus}`);
    const taskData = { action: 'updateTask', id: taskId, status: newStatus };

    // Oppdater den lokale datamodellen FØR nettverkskallet (Optimistic UI)
    const taskIndex = allTasks.findIndex(t => t.id === taskId);
    let originalStatus = null;
    if (taskIndex > -1) {
        originalStatus = allTasks[taskIndex].status; // Lagre gammel status for evt. reversering
        allTasks[taskIndex].status = newStatus; // Oppdater lokalt
    } else {
        console.warn("Fant ikke oppgave lokalt for statusoppdatering:", taskId);
    }


    // Kall backend for å lagre endringen
    postDataToScript_Tasks(taskData, `Status oppdatert for ${taskId}`)
        .then(response => {
            if (!response.success) {
                console.error(`Feil ved oppdatering av status for ${taskId} til ${newStatus}:`, response.message);
                alert(`Kunne ikke oppdatere status: ${response.message || 'Ukjent feil'}. Tilbakestiller.`);
                // Reverser UI-endringen ved feil
                 if (taskIndex > -1 && originalStatus) {
                    allTasks[taskIndex].status = originalStatus; // Sett tilbake lokal data
                    renderTaskBoard(); // Re-render for å flytte kortet tilbake
                 } else {
                    fetchTasks_Tasks().then(renderTaskBoard); // Hent alt på nytt hvis vi ikke fant den lokalt
                 }

            } else {
                 console.log(`Status for ${taskId} lagret som ${newStatus}`);
                 // UI er allerede oppdatert, ingen handling nødvendig
                 // Vi kan hente data på nytt for å være 100% sikker, men det gir tregere UI
                 // fetchTasks_Tasks().then(renderTaskBoard);
            }
        })
        .catch(error => {
             console.error(`Nettverksfeil ved oppdatering av status for ${taskId} til ${newStatus}:`, error);
             alert(`Nettverksfeil ved oppdatering av status: ${error.message}. Tilbakestiller.`);
              // Reverser UI-endringen ved feil
              if (taskIndex > -1 && originalStatus) {
                 allTasks[taskIndex].status = originalStatus; // Sett tilbake lokal data
                 renderTaskBoard(); // Re-render for å flytte kortet tilbake
              } else {
                 fetchTasks_Tasks().then(renderTaskBoard); // Hent alt på nytt
              }
        });
}


// --- GENERELL POST-FUNKSJON ---
// Bruker enkel fetch POST. Bør vurderes å byttes ut med
// den mer robuste sendDataToGoogleScript fra script.js hvis nødvendig.
function postDataToScript_Tasks(data, successMessage) {
    console.log("Sender POST-data:", data);
    const formData = new FormData();
    for (const key in data) {
        // Send tom streng for null/undefined
        const value = (data[key] === null || data[key] === undefined) ? '' : data[key];
        formData.append(key, value);
    }

    return fetch(GOOGLE_SCRIPT_URL, { method: 'POST', body: formData })
    .then(response => {
        if (!response.ok) return response.text().then(text => { throw new Error(text || `HTTP ${response.status}`) });
        return response.json();
    })
    .then(jsonData => {
         if (jsonData?.success !== undefined) return jsonData;
         else throw new Error("Ugyldig JSON-format i svar fra POST");
    });
}


// Lukker modalvinduer
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = 'none';
  else console.warn(`Forsøkte å lukke ukjent modal: ${modalId}`);
}
