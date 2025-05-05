// --- Konfigurasjon ---
// Google Script URL - *** VIKTIG: MÅ VÆRE SAMME SOM I ANDRE JS-FILER ***
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx2ukbDWH_fwz3S1Y4WfYbiL4D1lSQoUdQflmOvxWM4yoMOADF9Lh92lZzirerjC3Ew/exec'; // <-- ERSTATT MED DIN FAKTISKE URL HVIS DENNE ER FEIL

// --- Globale variabler ---
let allTasks = []; // Holder alle hentede oppgaver
let allCustomers = []; // Holder kundelisten for filter
let currentCustomerFilter = 'all'; // 'all' eller kundenavn
let currentStatusFilter = 'open'; // 'all', 'Ny', 'Pågår', 'Ferdig', 'Venter', 'open'
let calendarInstance = null; // Holder FullCalendar-objektet
let currentView = 'kanban'; // 'kanban' or 'calendar'
let draggedTaskId = null; // Holder ID på oppgave som dras
let isSubmitting = false; // Forhindre doble innsendinger

// --- Initialisering ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Tasks DOM lastet.");
    // Sjekk URL ved oppstart
    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL === 'DIN_NETTAPP_URL_HER' || GOOGLE_SCRIPT_URL.includes("SETT_INN_DIN_URL_HER")) {
       alert("ADVARSEL: GOOGLE_SCRIPT_URL ser ikke ut til å være satt riktig i tasks.js! Funksjonalitet vil feile.");
       // Kan legge til mer brukerinfo her, f.eks. disable knapper
    }

    updateCurrentDateHeader_Tasks();
    setupEventListeners_Tasks();
    fetchInitialData_Tasks(); // Hent data og render Kanban som standard
});

// --- Hjelpefunksjoner ---
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
    document.getElementById('kanban-view-btn')?.addEventListener('click', () => switchView('kanban'));
    document.getElementById('calendar-view-btn')?.addEventListener('click', () => switchView('calendar'));

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

    // Drag and Drop Listeners (må legges til dynamisk på kort, men basis på kolonner)
    document.querySelectorAll('.kanban-column .task-list').forEach(list => {
        list.addEventListener('dragover', handleDragOver);
        list.addEventListener('dragleave', handleDragLeave);
        list.addEventListener('drop', handleDrop);
    });
}

// Lukker modalvinduer
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = 'none';
  else console.warn(`Forsøkte å lukke ukjent modal: ${modalId}`);
}

// Viser/skjuler lasteindikator (forenklet)
function showLoadingIndicator(isLoading) {
    const board = document.getElementById('task-board');
    const placeholder = board?.querySelector('.kanban-column[data-status="Ny"] .task-list .task-placeholder');
    if (placeholder) {
        placeholder.textContent = isLoading ? "Laster oppgaver..." : "Ingen oppgaver funnet.";
        placeholder.style.display = isLoading ? 'block' : 'none'; // Skjul kun hvis ikke loading
    }
    // For kalender, kan vi legge til en loading-klasse på containeren
    document.getElementById('calendar-view-container')?.classList.toggle('loading', isLoading);
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
        // Render den aktive visningen
        if (currentView === 'kanban') {
            renderTaskBoard();
        } else {
            initializeOrUpdateCalendar();
        }
    })
    .catch(error => {
        console.error("Feil ved henting av initiale data:", error);
        alert("Kunne ikke hente data for oppgavesiden: " + error.message);
        // Vis feilmelding i stedet for lasteindikator
         const board = document.getElementById('task-board');
         if(board) {
            board.querySelectorAll('.task-list').forEach(list => list.innerHTML = '<div class="task-placeholder" style="display:block; color:var(--bar-red);">Kunne ikke laste oppgaver.</div>');
         }
    })
    .finally(() => {
        showLoadingIndicator(false);
    });
}

function fetchCustomers_Tasks() {
    // Henter kunder for dropdown (bruker samme endepunkt som index.html)
    return fetchDataFromScript_Tasks({ action: 'getCustomers' })
        .then(data => {
            if (data.success && Array.isArray(data.customers)) {
                allCustomers = data.customers.sort((a, b) => a.name.localeCompare(b.name, 'no'));
                console.log("Kunder hentet for filter:", allCustomers.length);
            } else {
                console.error("Kunne ikke hente kundeliste for filter:", data.message);
                allCustomers = [];
            }
            return allCustomers; // Returner uansett
        });
}

function fetchTasks_Tasks() {
    // Henter alle oppgaver som standard
    return fetchDataFromScript_Tasks({ action: 'getTasks' })
        .then(data => {
            if (data.success && Array.isArray(data.tasks)) {
                allTasks = data.tasks;
                console.log("Oppgaver hentet:", allTasks.length);
            } else {
                console.error("Kunne ikke hente oppgaveliste:", data.message);
                allTasks = [];
            }
            return allTasks; // Returner uansett
        });
}

// Generell funksjon for å hente data (lik den i daily-summary)
function fetchDataFromScript_Tasks(params) {
    const urlParams = new URLSearchParams(params);
    urlParams.append('nocache', Date.now());
    const url = `${GOOGLE_SCRIPT_URL}?${urlParams.toString()}`;
    console.log("Henter data:", url);

    return fetch(url)
        .then(response => {
            if (!response.ok) {
                 return response.text().then(text => {
                    console.error("Fetch feilet - Status:", response.status, "Tekst:", text);
                    throw new Error(text || `Nettverksfeil: ${response.status}`);
                 });
            }
            // Sjekk content type før parsing
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                return response.json();
            } else {
                return response.text().then(text => {
                    console.warn("Mottok ikke JSON, tekst:", text);
                    throw new Error("Mottok uventet svarformat fra server.");
                });
            }
        })
        .catch(error => {
             console.error("Feil i fetchDataFromScript_Tasks:", error);
             // Viktig å kaste feilen videre slik at Promise.all fanger den
             throw error; // Kast feilen slik at .catch i Promise.all aktiveres
        });
}

// --- Rendering (Kanban) ---
function populateCustomerFilter() {
    const select = document.getElementById('customer-filter');
    if (!select) return;
    // Lagre valgt verdi hvis den finnes
    const previousValue = select.value;
    // Tøm eksisterende (behold "Alle kunder")
    while (select.options.length > 1) select.remove(1);
    // Legg til nye
    allCustomers.forEach(customer => {
        const option = document.createElement('option');
        option.value = customer.name; option.textContent = customer.name;
        select.appendChild(option);
    });
    // Sett tilbake valgt verdi hvis den fortsatt finnes
    if (Array.from(select.options).some(opt => opt.value === previousValue)) {
        select.value = previousValue;
    } else {
        select.value = 'all'; // Tilbakestill til 'all' hvis valget ikke finnes lenger
    }
}

function renderTaskBoard() {
    console.log("Rendrer Kanban-tavle...");
    const board = document.getElementById('task-board');
    if (!board) return;

    // Tøm kolonner, men behold placeholder i "Ny"-kolonnen
    board.querySelectorAll('.task-list').forEach(list => {
        if (!list.closest('.kanban-column[data-status="Ny"]')) {
            list.innerHTML = '';
        } else {
            list.innerHTML = '<div class="task-placeholder">Ingen oppgaver funnet.</div>';
        }
    });

    let filteredTasks = filterTasks(allTasks);
    console.log(`Viser ${filteredTasks.length} av ${allTasks.length} oppgaver etter filter.`);

    // Sorter etter frist (dueDate), tidligst først, de uten frist sist
    filteredTasks.sort((a, b) => {
        const dateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const dateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return dateA - dateB;
    });

    const nyPlaceholder = board.querySelector('.kanban-column[data-status="Ny"] .task-list .task-placeholder');

    if (filteredTasks.length > 0 && nyPlaceholder) {
        nyPlaceholder.style.display = 'none'; // Skjul placeholder hvis det er oppgaver
    } else if (nyPlaceholder) {
         nyPlaceholder.style.display = 'block'; // Vis hvis ingen oppgaver
    }


    filteredTasks.forEach(task => {
        const card = createTaskCardElement(task);
        const columnList = board.querySelector(`.kanban-column[data-status="${task.status}"] .task-list`);
        if (columnList) {
            columnList.appendChild(card);
        } else {
            // Fallback til "Ny"-kolonnen hvis status er ukjent
            console.warn(`Fant ikke kolonne for status: ${task.status}, legger i "Ny".`);
            const nyKolonneList = board.querySelector('.kanban-column[data-status="Ny"] .task-list');
            nyKolonneList?.appendChild(card);
        }
    });
}

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

        card.classList.remove('due-near', 'due-soon', 'due-overdue');
        if (isOverdue) card.classList.add('due-overdue');
        else if (daysUntilDue <= 3) card.classList.add('due-soon');
        else if (daysUntilDue <= 7) card.classList.add('due-near');

        dueDateHtml = `
            <span class="task-due-date ${isOverdue ? 'overdue' : ''}" title="Frist">
                📅 ${new Date(task.dueDate).toLocaleDateString('no-NO', { day: 'numeric', month: 'short' })}
                ${isOverdue ? ' (Forfalt)' : (daysUntilDue <= 7 ? ` (${daysUntilDue} d)` : '')}
            </span>`;
    }

    card.innerHTML = `
        <h4>${task.name || 'Ukjent oppgave'}</h4>
        <div class="task-meta">
            <span class="task-customer" title="Kunde">👤 ${task.customer || 'Ingen'}</span>
            ${dueDateHtml}
            ${task.priority ? `<span title="Prioritet">${getPriorityIcon(task.priority)} ${task.priority}</span>` : ''}
            <button class="emergency-help-btn" title="Be om hjelp med denne oppgaven">🆘</button>
        </div>
    `;

    // Legg til listeners etter at innerHTML er satt
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
    card.addEventListener('click', (event) => {
        if (!event.target.classList.contains('emergency-help-btn')) {
            openEditTaskModal(task.id);
        }
    });
    const helpButton = card.querySelector('.emergency-help-btn');
    if(helpButton) {
        helpButton.addEventListener('click', (event) => {
            event.stopPropagation();
            sendEmergencyEmail(task);
        });
    }

    return card;
}

function getPriorityIcon(priority) {
    switch (priority?.toLowerCase()) {
        case 'høy': return '🔴'; case 'medium': return '🟡'; case 'lav': return '🔵'; default: return '';
    }
}

// --- Filter Håndtering ---
function handleCustomerFilterChange(event) {
    currentCustomerFilter = event.target.value;
    console.log("Kundefilter endret til:", currentCustomerFilter);
    // Oppdater den aktive visningen
    if (currentView === 'kanban') renderTaskBoard();
    else initializeOrUpdateCalendar();
}

function handleStatusFilterChange(event) {
    const clickedButton = event.target;
    currentStatusFilter = clickedButton.getAttribute('data-status');
    console.log("Statusfilter endret til:", currentStatusFilter);
    document.querySelectorAll('.status-filter-btn').forEach(btn => btn.classList.remove('active'));
    clickedButton.classList.add('active');
    // Oppdater den aktive visningen
    if (currentView === 'kanban') renderTaskBoard();
    else initializeOrUpdateCalendar();
}

// Filterfunksjon brukt av både Kanban og Kalender før formatering
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
    populateCustomerDropdown_Modal(); // Sørg for at kundelisten er oppdatert
    document.getElementById('taskModal').style.display = 'block';
}

function openEditTaskModal(taskId) {
    console.log("Åpner Rediger Oppgave-modal for:", taskId);
    const task = allTasks.find(t => t.id === taskId);
    if (!task) { alert("Fant ikke oppgaven."); return; }

    clearTaskModal();
    document.getElementById('task-modal-title').textContent = 'Rediger oppgave';
    populateCustomerDropdown_Modal(); // Sørg for at kundelisten er oppdatert

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
    document.getElementById('task-status').value = 'Ny'; // Standard status
    document.getElementById('task-priority').value = '';
    document.getElementById('task-due-date').value = '';
}

function populateCustomerDropdown_Modal() {
     const select = document.getElementById('task-customer');
    if (!select) return;
    const currentValue = select.value;
    while (select.options.length > 1) select.remove(1);
    allCustomers.forEach(customer => {
        const option = document.createElement('option');
        option.value = customer.name; option.textContent = customer.name;
        select.appendChild(option);
    });
    // Sett tilbake valgt kunde hvis det var redigering
    if(currentValue) select.value = currentValue;
}

function handleSaveTask() {
    if (isSubmitting) return; // Unngå doble innsendinger

    const taskId = document.getElementById('task-id').value;
    const taskData = {
        id: taskId || undefined,
        customer: document.getElementById('task-customer').value,
        name: document.getElementById('task-name').value.trim(),
        description: document.getElementById('task-description').value.trim(),
        status: document.getElementById('task-status').value,
        priority: document.getElementById('task-priority').value || null,
        dueDate: document.getElementById('task-due-date').value || null,
    };

    if (!taskData.customer) { alert("Velg en kunde."); return; }
    if (!taskData.name) { alert("Skriv inn et oppgavenavn."); return; }

    isSubmitting = true;
    console.log("Lagrer oppgave:", taskData);
    const action = taskId ? 'updateTask' : 'addTask';
    taskData.action = action;

    const saveButton = document.getElementById('save-task-btn');
    saveButton.disabled = true; saveButton.textContent = 'Lagrer...';

    postDataToScript_Tasks(taskData) // Fjernet unødvendig successMessage
        .then(response => {
            if (response.success) {
                closeModal('taskModal');
                // Hent data på nytt for å sikre konsistens
                return fetchTasks_Tasks().then(() => {
                    // Oppdater den aktive visningen
                    if (currentView === 'kanban') {
                        renderTaskBoard();
                    } else {
                        initializeOrUpdateCalendar();
                    }
                });
            } else {
                throw new Error(response.message || 'Ukjent feil ved lagring');
            }
        })
        .catch(error => {
            console.error("Feil ved lagring av oppgave:", error);
            alert(`Kunne ikke lagre oppgave: ${error.message}`);
        })
        .finally(() => {
            isSubmitting = false;
            saveButton.disabled = false;
            saveButton.textContent = taskId ? 'Lagre Endringer' : 'Lagre Oppgave';
        });
}

// --- Nødknapp E-post ---
function sendEmergencyEmail(task) {
    console.log(`Sender hjelpeforespørsel til backend for oppgave: ${task.id} - ${task.name}`);

    const dataToSend = {
        action: 'sendHelpEmail',
        taskId: task.id,
        taskName: task.name,
        taskCustomer: task.customer,
        taskStatus: task.status,
        taskDueDate: task.dueDate,
        taskPriority: task.priority,
        taskDescription: task.description
    };

    const helpButton = document.querySelector(`.task-card[data-task-id='${task.id}'] .emergency-help-btn`);
    const originalButtonContent = helpButton ? helpButton.innerHTML : '🆘';
    if(helpButton) {
         helpButton.innerHTML = '⏳'; // Viser at noe skjer
         helpButton.disabled = true;
    }

    postDataToScript_Tasks(dataToSend)
        .then(response => {
            if (response.success) {
                console.log("Backend bekreftet e-post sendt:", response.message);
                alert("Hjelpeforespørsel sendt!");
            } else {
                console.error("Backend rapporterte feil ved sending av e-post:", response.message);
                alert(`Kunne ikke sende hjelpeforespørsel: ${response.message || 'Ukjent feil fra server'}`);
            }
        })
        .catch(error => {
            console.error("Nettverksfeil ved sending av hjelpeforespørsel:", error);
            alert(`Nettverksfeil: Kunne ikke sende hjelpeforespørsel. (${error.message})`);
        })
        .finally(() => {
             if(helpButton) {
                 helpButton.innerHTML = originalButtonContent;
                 helpButton.disabled = false;
             }
        });
}


// --- Drag and Drop Håndtering (Kanban) ---
function handleDragStart(event) {
    if (!event.target.classList.contains('task-card')) return;
    draggedTaskId = event.target.getAttribute('data-task-id');
    setTimeout(() => event.target.classList.add('dragging'), 0);
    console.log(`Starter drag for task: ${draggedTaskId}`);
}

function handleDragEnd(event) {
    if (event.target.classList.contains('task-card')) {
        event.target.classList.remove('dragging');
    }
    document.querySelectorAll('.kanban-column .task-list.drag-over')
            .forEach(list => list.classList.remove('drag-over'));
    // console.log(`Avslutter drag for task: ${draggedTaskId}`); // Litt mye logging?
    draggedTaskId = null;
}

function handleDragOver(event) {
    event.preventDefault();
    const targetList = event.currentTarget;
    if(targetList.classList.contains('task-list')){ // Sørg for at vi er over en liste
        targetList.classList.add('drag-over');
        event.dataTransfer.dropEffect = 'move';
    }
}

function handleDragLeave(event) {
    const targetList = event.currentTarget;
    // Fjern kun hvis musen forlater selve liste-elementet
    if (targetList.classList.contains('task-list') && !targetList.contains(event.relatedTarget)) {
        targetList.classList.remove('drag-over');
    }
}

function handleDrop(event) {
    event.preventDefault();
    const targetList = event.currentTarget;
    if (!targetList.classList.contains('task-list')) return; // Ignorer drop utenfor listene

    targetList.classList.remove('drag-over');
    const targetColumn = targetList.closest('.kanban-column');
    const newStatus = targetColumn?.getAttribute('data-status');
    const droppedOnCard = event.target.closest('.task-card');

    if (newStatus && draggedTaskId) {
        console.log(`Slipper task ${draggedTaskId} i kolonne ${newStatus}`);
        const taskCard = document.querySelector(`.task-card[data-task-id='${draggedTaskId}']`);
        if (!taskCard) return;

        const currentColumn = taskCard.closest('.kanban-column');
        const currentStatus = currentColumn?.getAttribute('data-status');

        if (newStatus !== currentStatus) {
            // Optimistisk UI-oppdatering
            if(droppedOnCard && droppedOnCard !== taskCard) {
                targetList.insertBefore(taskCard, droppedOnCard);
            } else {
                targetList.appendChild(taskCard);
            }
            // Oppdater status i backend
            updateTaskStatus(draggedTaskId, newStatus);
        }
    }
    draggedTaskId = null;
}

function updateTaskStatus(taskId, newStatus) {
    console.log(`Oppdaterer status for ${taskId} til ${newStatus}`);
    const taskData = { action: 'updateTask', id: taskId, status: newStatus };

    // Finn oppgaven lokalt for å kunne reversere
    const taskIndex = allTasks.findIndex(t => t.id === taskId);
    let originalStatus = null;
    if (taskIndex > -1) {
        originalStatus = allTasks[taskIndex].status;
        allTasks[taskIndex].status = newStatus; // Optimistisk oppdatering lokalt
    }

    postDataToScript_Tasks(taskData)
        .then(response => {
            if (!response.success) {
                console.error(`Feil ved oppdatering av status for ${taskId} til ${newStatus}:`, response.message);
                alert(`Kunne ikke oppdatere status: ${response.message || 'Ukjent feil'}. Tilbakestiller.`);
                // Reverser UI hvis mulig
                 if (taskIndex > -1 && originalStatus) {
                    allTasks[taskIndex].status = originalStatus;
                    renderTaskBoard(); // Re-render for å flytte kortet tilbake
                 } else {
                    fetchTasks_Tasks().then(renderTaskBoard); // Hent alt på nytt som fallback
                 }
            } else {
                 console.log(`Status for ${taskId} lagret som ${newStatus}`);
                 // UI er allerede oppdatert. Trenger ikke gjøre noe mer her.
            }
        })
        .catch(error => {
             console.error(`Nettverksfeil ved oppdatering av status for ${taskId} til ${newStatus}:`, error);
             alert(`Nettverksfeil ved oppdatering av status: ${error.message}. Tilbakestiller.`);
              // Reverser UI hvis mulig
              if (taskIndex > -1 && originalStatus) {
                 allTasks[taskIndex].status = originalStatus;
                 renderTaskBoard();
              } else {
                 fetchTasks_Tasks().then(renderTaskBoard);
              }
        });
}

// --- Kalendervisning ---
function switchView(viewToShow) {
    if (viewToShow === currentView) return;

    const kanbanContainer = document.getElementById('task-board-container');
    const calendarContainer = document.getElementById('calendar-view-container');
    const kanbanBtn = document.getElementById('kanban-view-btn');
    const calendarBtn = document.getElementById('calendar-view-btn');

    if (!kanbanContainer || !calendarContainer || !kanbanBtn || !calendarBtn) return;

    currentView = viewToShow;

    if (viewToShow === 'kanban') {
        kanbanContainer.style.display = 'block';
        calendarContainer.style.display = 'none';
        kanbanBtn.classList.add('active');
        calendarBtn.classList.remove('active');
        renderTaskBoard(); // Render Kanban når vi bytter til den
    } else { // viewToShow === 'calendar'
        kanbanContainer.style.display = 'none';
        calendarContainer.style.display = 'block';
        kanbanBtn.classList.remove('active');
        calendarBtn.classList.add('active');
        initializeOrUpdateCalendar(); // Sett opp eller oppdater kalender
    }
    console.log("Byttet visning til:", currentView);
}

function initializeOrUpdateCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;

    // Filtrer oppgaver BASERT PÅ GLOBALE FILTRE før formatering
    const filteredTasks = filterTasks(allTasks);
    const formattedTasks = formatTasksForCalendar_Simple(filteredTasks);

    if (!calendarInstance) {
        console.log("Initialiserer FullCalendar");
        calendarInstance = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            locale: 'no',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,listWeek' // Ulike visningsmoduser
            },
            events: formattedTasks,
            editable: false, // Ikke dra-og-slipp i kalender
            eventClick: function(info) {
                console.log('Event Clicked:', info.event);
                const taskId = info.event.id;
                if (taskId) {
                    openEditTaskModal(taskId); // Åpne redigering ved klikk
                }
            },
            height: 'auto' // La høyden justere seg etter innhold/container
        });
        calendarInstance.render();
    } else {
        console.log("Oppdaterer kalenderhendelser");
        calendarInstance.removeAllEvents(); // Fjern gamle hendelser
        calendarInstance.addEventSource(formattedTasks); // Legg til nye (filtrerte)
        calendarInstance.refetchEvents(); // Be kalenderen om å tegne på nytt
    }
}

// Formater oppgaver KUN basert på dueDate
function formatTasksForCalendar_Simple(tasks) {
    console.log("Formaterer oppgaver for kalender (kun Frist):", tasks.length);
    return tasks
        .filter(task => task.dueDate) // KUN de med frist
        .map(task => {
            return {
                id: task.id,
                title: `${task.name} (${task.customer || '?'})`, // Vis navn og kunde
                start: task.dueDate, // Fristen er startdato for hendelsen
                allDay: true, // Anta heldagshendelse for frist
                extendedProps: { // For bruk i eventClick
                    customer: task.customer,
                    status: task.status,
                    priority: task.priority,
                    description: task.description
                },
                 // Eksempel: Fargelegg basert på prioritet
                color: getPriorityColor(task.priority) // Bruk en hjelpefunksjon for farge
            };
        });
}

// Hjelpefunksjon for farge i kalender (eksempel)
function getPriorityColor(priority){
    switch (priority?.toLowerCase()) {
        case 'høy': return 'var(--bar-red)';
        case 'medium': return 'var(--bar-yellow)';
        case 'lav': return '#42a5f5'; // Blå
        default: return 'var(--accent-secondary)'; // Standard lilla
    }
}


// --- Generell POST-funksjon (enkel versjon) ---
// Vurder å bruke den mer robuste fra script.js hvis du opplever nettverksproblemer
function postDataToScript_Tasks(data) {
    console.log("Sender POST-data:", data);
    const formData = new FormData();
    for (const key in data) {
        const value = (data[key] === null || data[key] === undefined) ? '' : data[key];
        formData.append(key, value);
    }

    return fetch(GOOGLE_SCRIPT_URL, { method: 'POST', body: formData })
    .then(response => {
        // Prøv alltid å få tekst for bedre feilmelding
        return response.text().then(text => {
             if (!response.ok) {
                 console.error("POST feilet - Status:", response.status, "Tekst:", text);
                 throw new Error(text || `HTTP ${response.status}`);
             }
             // Prøv å parse som JSON, men håndter feil
             try {
                  const jsonData = JSON.parse(text);
                  if (jsonData?.success !== undefined) return jsonData;
                  else {
                      console.warn("Ugyldig JSON-format i svar:", text);
                      throw new Error("Ugyldig svarformat fra server (JSON).");
                  }
             } catch (e) {
                  console.error("Kunne ikke parse JSON:", text, e);
                  throw new Error("Kunne ikke tolke svar fra server.");
             }
        });
    });
}
