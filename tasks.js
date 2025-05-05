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

    // Drag and Drop Listeners (på kolonnene)
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
        // Stil for placeholder styres nå av CSS og om det finnes kort
        placeholder.style.display = isLoading ? 'block' : 'none'; // Vis kun ved lasting initielt
    }
    document.getElementById('calendar-view-container')?.classList.toggle('loading', isLoading);
}

// --- Datahenting ---
function fetchInitialData_Tasks() {
    console.log("Henter initiale data for oppgaver...");
    showLoadingIndicator(true);

    Promise.all([
        fetchCustomers_Tasks(), // For filter dropdown
        fetchTasks_Tasks()      // Henter alle oppgaver
    ])
    .then(() => {
        console.log("Kunder og oppgaver hentet.");
        populateCustomerFilter();
        // Render den aktive visningen (starter med Kanban)
        if (currentView === 'kanban') {
            renderTaskBoard();
        } else {
            initializeOrUpdateCalendar();
        }
    })
    .catch(error => {
        console.error("Feil ved henting av initiale data:", error);
        alert("Kunne ikke hente data for oppgavesiden: " + error.message);
         const board = document.getElementById('task-board');
         if(board) {
            const placeholder = board.querySelector('.kanban-column[data-status="Ny"] .task-list .task-placeholder');
            if (placeholder) {
                 placeholder.textContent = 'Kunne ikke laste oppgaver.';
                 placeholder.style.display = 'block';
                 placeholder.style.color = 'var(--bar-red)';
            }
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
                console.log("Kunder hentet for filter:", allCustomers.length);
            } else {
                console.error("Kunne ikke hente kundeliste for filter:", data.message);
                allCustomers = [];
            }
            return allCustomers;
        })
        // Ikke kast feil her, la appen fortsette selv om kundefilter feiler
        .catch(error => {
            console.error("FetchCustomers feilet, fortsetter uten:", error);
            allCustomers = [];
            return allCustomers;
        });
}

function fetchTasks_Tasks() {
    return fetchDataFromScript_Tasks({ action: 'getTasks' })
        .then(data => {
            if (data.success && Array.isArray(data.tasks)) {
                allTasks = data.tasks;
                console.log("Oppgaver hentet:", allTasks.length);
            } else {
                console.error("Kunne ikke hente oppgaveliste:", data.message);
                allTasks = [];
                // Kast feilen videre slik at Promise.all vet at noe gikk galt
                throw new Error(data.message || "Kunne ikke hente oppgaveliste");
            }
            return allTasks;
        });
        // Catch håndteres av Promise.all i fetchInitialData_Tasks
}

// Generell funksjon for å hente data
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
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                return response.json();
            } else {
                return response.text().then(text => {
                    console.warn("Mottok ikke JSON, tekst:", text);
                    throw new Error("Mottok uventet svarformat fra server.");
                });
            }
        });
        // Catch håndteres av kallende funksjon (f.eks. Promise.all)
}

// --- Rendering (Kanban) ---
function populateCustomerFilter() {
    const select = document.getElementById('customer-filter');
    if (!select) return;
    const previousValue = select.value;
    while (select.options.length > 1) select.remove(1);
    allCustomers.forEach(customer => {
        const option = document.createElement('option');
        option.value = customer.name; option.textContent = customer.name;
        select.appendChild(option);
    });
    if (Array.from(select.options).some(opt => opt.value === previousValue)) {
        select.value = previousValue;
    } else {
        select.value = 'all';
    }
}

function renderTaskBoard() {
    console.log("Rendrer Kanban-tavle...");
    const board = document.getElementById('task-board');
    if (!board) return;

    // Tøm kolonner, men behold placeholder i "Ny"-kolonnen initielt
    board.querySelectorAll('.task-list').forEach(list => {
        const placeholderHTML = list.closest('.kanban-column[data-status="Ny"]')
                             ? '<div class="task-placeholder">Laster...</div>'
                             : '';
        list.innerHTML = placeholderHTML;
    });

    let filteredTasks = filterTasks(allTasks); // Bruk globalt filter
    console.log(`Viser ${filteredTasks.length} av ${allTasks.length} oppgaver etter filter.`);

    // Sorter etter frist
    filteredTasks.sort((a, b) => {
        const dateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const dateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return dateA - dateB;
    });

    // Oppdater placeholder basert på om det faktisk er oppgaver
    const nyPlaceholder = board.querySelector('.kanban-column[data-status="Ny"] .task-list .task-placeholder');
    if (nyPlaceholder) {
        nyPlaceholder.textContent = "Ingen oppgaver funnet.";
        nyPlaceholder.style.display = filteredTasks.length === 0 ? 'block' : 'none';
    }

    // Fordel oppgavene i riktige kolonner
    filteredTasks.forEach(task => {
        const card = createTaskCardElement(task); // Lager kortet
        const columnList = board.querySelector(`.kanban-column[data-status="${task.status}"] .task-list`);
        if (columnList) {
             // Hvis dette er "Ny"-kolonnen, fjern placeholder før kort legges til
             if (task.status === "Ny") {
                 const placeholder = columnList.querySelector('.task-placeholder');
                 if (placeholder) placeholder.style.display = 'none';
             }
            columnList.appendChild(card);
        } else {
            console.warn(`Fant ikke kolonne for status: ${task.status}, legger i "Ny".`);
            const nyKolonneList = board.querySelector('.kanban-column[data-status="Ny"] .task-list');
            const placeholder = nyKolonneList?.querySelector('.task-placeholder');
            if (placeholder) placeholder.style.display = 'none'; // Skjul placeholder
            nyKolonneList?.appendChild(card);
        }
    });
}

// Lager HTML for et enkelt oppgavekort
function createTaskCardElement(task) {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.setAttribute('draggable', true); // For drag-and-drop
    card.setAttribute('data-task-id', task.id); // Lagre ID for referanse

    // Legg til klasse for prioritet (for CSS ::before styling)
    if (task.priority) card.classList.add(`priority-${task.priority.toLowerCase()}`);

    // Sjekk frist og legg til klasser + HTML for visning
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

        card.classList.remove('due-near', 'due-soon', 'due-overdue'); // Nullstill
        if (isOverdue) card.classList.add('due-overdue');
        else if (daysUntilDue <= 3) card.classList.add('due-soon');
        else if (daysUntilDue <= 7) card.classList.add('due-near');

        dueDateHtml = `
            <span class="task-due-date ${isOverdue ? 'overdue' : ''}" title="Frist">
                📅 ${new Date(task.dueDate).toLocaleDateString('no-NO', { day: 'numeric', month: 'short' })}
                ${isOverdue ? ' (Forfalt)' : (daysUntilDue <= 7 ? ` (${daysUntilDue} d)` : '')}
            </span>`;
    }

    // Bygg kortets innhold
    card.innerHTML = `
        <h4>${task.name || 'Ukjent oppgave'}</h4>
        <div class="task-meta">
            <span class="task-customer" title="Kunde">👤 ${task.customer || 'Ingen'}</span>
            ${dueDateHtml}
            ${task.priority ? `<span title="Prioritet">${getPriorityIcon(task.priority)} ${task.priority}</span>` : ''}
            <!-- Nødknapp er fjernet -->
        </div>
    `;

    // Legg til lyttefunksjoner ETTER at innerHTML er satt
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
    card.addEventListener('click', () => openEditTaskModal(task.id)); // Klikk på kortet åpner redigering

    return card;
}

// Hjelpefunksjon for prioritet-ikon
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
    // Deaktiver andre knapper, aktiver den klikkede
    document.querySelectorAll('.status-filter-btn.active').forEach(btn => btn.classList.remove('active'));
    clickedButton.classList.add('active');
    currentStatusFilter = clickedButton.getAttribute('data-status');
    console.log("Statusfilter endret til:", currentStatusFilter);
    // Oppdater den aktive visningen
    if (currentView === 'kanban') renderTaskBoard();
    else initializeOrUpdateCalendar();
}

// Filtrerer den globale 'allTasks' listen basert på aktive filtre
function filterTasks(tasks) {
    return tasks.filter(task => {
        // Sjekk kundefilter
        const customerMatch = currentCustomerFilter === 'all' || task.customer === currentCustomerFilter;

        // Sjekk statusfilter
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
    populateCustomerDropdown_Modal(); // Fyll kundeliste
    document.getElementById('taskModal').style.display = 'block';
}

function openEditTaskModal(taskId) {
    console.log("Åpner Rediger Oppgave-modal for:", taskId);
    const task = allTasks.find(t => t.id === taskId);
    if (!task) {
        console.error("Fant ikke oppgave med ID:", taskId);
        alert("Feil: Fant ikke oppgaven som skulle redigeres.");
        return;
    }

    clearTaskModal();
    document.getElementById('task-modal-title').textContent = 'Rediger oppgave';
    populateCustomerDropdown_Modal(); // Fyll kundeliste

    // Fyll inn eksisterende data
    document.getElementById('task-id').value = task.id;
    document.getElementById('task-customer').value = task.customer;
    document.getElementById('task-name').value = task.name;
    document.getElementById('task-description').value = task.description || '';
    document.getElementById('task-status').value = task.status;
    document.getElementById('task-priority').value = task.priority || '';
    document.getElementById('task-due-date').value = task.dueDate || ''; // Frist

    document.getElementById('taskModal').style.display = 'block';
}

// Nullstiller feltene i modalen
function clearTaskModal() {
    document.getElementById('task-id').value = '';
    document.getElementById('task-customer').value = '';
    document.getElementById('task-name').value = '';
    document.getElementById('task-description').value = '';
    document.getElementById('task-status').value = 'Ny'; // Standard status
    document.getElementById('task-priority').value = '';
    document.getElementById('task-due-date').value = '';
}

// Fyller kundelisten i modalen
function populateCustomerDropdown_Modal() {
     const select = document.getElementById('task-customer');
    if (!select) return;
    const currentValue = select.value; // Ta vare på evt. valgt verdi
    while (select.options.length > 1) select.remove(1); // Fjern gamle, behold placeholder
    allCustomers.forEach(customer => {
        const option = document.createElement('option');
        option.value = customer.name; option.textContent = customer.name;
        select.appendChild(option);
    });
    // Sett tilbake valgt kunde hvis det var redigering og kunden finnes
    if(currentValue && Array.from(select.options).some(opt => opt.value === currentValue)) {
        select.value = currentValue;
    }
}

// Håndterer lagring (både ny og rediger)
function handleSaveTask() {
    if (isSubmitting) return; // Unngå doble innsendinger

    const taskId = document.getElementById('task-id').value;
    const taskData = {
        id: taskId || undefined, // Send kun med ID hvis den finnes (for update)
        customer: document.getElementById('task-customer').value,
        name: document.getElementById('task-name').value.trim(),
        description: document.getElementById('task-description').value.trim(),
        status: document.getElementById('task-status').value,
        priority: document.getElementById('task-priority').value || null, // Send null hvis tom
        dueDate: document.getElementById('task-due-date').value || null, // Send null hvis tom
    };

    // Validering
    if (!taskData.customer) { alert("Velg en kunde."); return; }
    if (!taskData.name) { alert("Skriv inn et oppgavenavn."); return; }

    isSubmitting = true;
    console.log("Lagrer oppgave:", taskData);
    const action = taskId ? 'updateTask' : 'addTask';
    taskData.action = action; // Legg til action for backend

    const saveButton = document.getElementById('save-task-btn');
    saveButton.disabled = true; saveButton.textContent = 'Lagrer...';

    // Bruk POST-funksjonen til å sende data
    postDataToScript_Tasks(taskData)
        .then(response => {
            if (response.success) {
                console.log("Lagring vellykket:", response);
                closeModal('taskModal');
                // Hent alle oppgaver på nytt for å sikre konsistens etter lagring
                return fetchTasks_Tasks().then(() => {
                    // Oppdater den aktive visningen (Kanban eller Kalender)
                    if (currentView === 'kanban') {
                        renderTaskBoard();
                    } else {
                        initializeOrUpdateCalendar();
                    }
                });
            } else {
                // Hvis backend rapporterer feil
                throw new Error(response.message || 'Ukjent feil ved lagring fra server');
            }
        })
        .catch(error => {
            // Håndterer både nettverksfeil og feil rapportert av backend
            console.error("Feil ved lagring av oppgave:", error);
            alert(`Kunne ikke lagre oppgave: ${error.message}`);
        })
        .finally(() => {
            isSubmitting = false;
            // Tilbakestill knappen uansett utfall
            if (saveButton){
                 saveButton.disabled = false;
                 saveButton.textContent = taskId ? 'Lagre Endringer' : 'Lagre Oppgave';
            }
        });
}

// --- Nødknapp E-post er fjernet ---


// --- Drag and Drop Håndtering (Kanban) ---
function handleDragStart(event) {
    // Sørg for at vi drar selve kortet
    if (!event.target.classList.contains('task-card')) return;
    draggedTaskId = event.target.getAttribute('data-task-id');
    // Legg til visuell feedback (liten forsinkelse for å unngå flimring)
    setTimeout(() => event.target.classList.add('dragging'), 0);
    console.log(`Starter drag for task: ${draggedTaskId}`);
}

function handleDragEnd(event) {
    // Fjern visuell feedback når drag avsluttes
    if (event.target.classList.contains('task-card')) {
        event.target.classList.remove('dragging');
    }
    // Fjern highlight fra alle kolonner
    document.querySelectorAll('.kanban-column .task-list.drag-over')
            .forEach(list => list.classList.remove('drag-over'));
    draggedTaskId = null; // Nullstill ID
}

function handleDragOver(event) {
    event.preventDefault(); // Nødvendig for at drop skal virke
    const targetList = event.currentTarget;
    // Sjekk at vi er over en gyldig dropzone (.task-list)
    if(targetList.classList.contains('task-list')){
        targetList.classList.add('drag-over'); // Visuell feedback
        event.dataTransfer.dropEffect = 'move'; // Indiker at flytting er mulig
    }
}

function handleDragLeave(event) {
    const targetList = event.currentTarget;
    // Fjern highlight kun hvis musen forlater selve liste-elementet
    // (contains sjekker om det nye elementet musen er over, er inne i det gamle)
    if (targetList.classList.contains('task-list') && !targetList.contains(event.relatedTarget)) {
        targetList.classList.remove('drag-over');
    }
}

function handleDrop(event) {
    event.preventDefault(); // Forhindre standard handling
    const targetList = event.currentTarget;
    if (!targetList.classList.contains('task-list')) return; // Avbryt hvis ikke en liste

    targetList.classList.remove('drag-over'); // Fjern highlight
    const targetColumn = targetList.closest('.kanban-column');
    const newStatus = targetColumn?.getAttribute('data-status'); // Hent ny status fra kolonnen
    const droppedOnCard = event.target.closest('.task-card'); // Fant vi et kort å slippe på/ved?

    if (newStatus && draggedTaskId) {
        console.log(`Slipper task ${draggedTaskId} i kolonne ${newStatus}`);
        const taskCard = document.querySelector(`.task-card[data-task-id='${draggedTaskId}']`);
        if (!taskCard) {
            console.error("Fant ikke kortet som ble dratt!");
            draggedTaskId = null; // Nullstill for sikkerhets skyld
            return;
        }

        const currentColumn = taskCard.closest('.kanban-column');
        const currentStatus = currentColumn?.getAttribute('data-status');

        // Bare gjør noe hvis statusen faktisk endres
        if (newStatus !== currentStatus) {
            // Optimistisk UI-oppdatering: Flytt kortet i DOM
            if(droppedOnCard && droppedOnCard !== taskCard) {
                // Hvis vi slapp på/ved et annet kort, legg det nye FØR det kortet
                targetList.insertBefore(taskCard, droppedOnCard);
            } else {
                 // Ellers legg til på slutten av den nye listen
                targetList.appendChild(taskCard);
            }
            // Kall backend for å lagre statusendringen
            updateTaskStatus(draggedTaskId, newStatus);
        } else {
            console.log("Ingen statusendring, slipper kortet tilbake.");
            // Trenger ikke gjøre noe, nettleseren håndterer vanligvis dette
        }
    } else {
         console.warn("Drop feilet: mangler status eller task ID", {newStatus, draggedTaskId});
    }
    draggedTaskId = null; // Nullstill alltid etter drop
}

// Sender statusoppdatering til backend
function updateTaskStatus(taskId, newStatus) {
    console.log(`Oppdaterer status for ${taskId} til ${newStatus}`);
    const taskData = { action: 'updateTask', id: taskId, status: newStatus };

    // Finn oppgaven lokalt for å kunne reversere ved feil
    const taskIndex = allTasks.findIndex(t => t.id === taskId);
    let originalStatus = null;
    if (taskIndex > -1) {
        originalStatus = allTasks[taskIndex].status;
        allTasks[taskIndex].status = newStatus; // Optimistisk oppdatering av lokal data
    }

    // Kall backend
    postDataToScript_Tasks(taskData)
        .then(response => {
            if (!response.success) {
                // Hvis backend feiler, reverser endringen
                console.error(`Feil ved oppdatering av status for ${taskId} til ${newStatus}:`, response.message);
                alert(`Kunne ikke oppdatere status: ${response.message || 'Ukjent feil'}. Tilbakestiller.`);
                 if (taskIndex > -1 && originalStatus) {
                    allTasks[taskIndex].status = originalStatus; // Sett tilbake lokal data
                    renderTaskBoard(); // Tegn Kanban på nytt for å flytte kortet tilbake
                 } else {
                    // Hvis vi ikke fant den lokalt, hent alt på nytt for sikkerhets skyld
                    fetchTasks_Tasks().then(renderTaskBoard);
                 }
            } else {
                 console.log(`Status for ${taskId} lagret som ${newStatus} av backend.`);
                 // UI er allerede optimistisk oppdatert. Ingen handling nødvendig.
            }
        })
        .catch(error => {
             // Håndterer nettverksfeil
             console.error(`Nettverksfeil ved oppdatering av status for ${taskId} til ${newStatus}:`, error);
             alert(`Nettverksfeil ved oppdatering av status: ${error.message}. Tilbakestiller.`);
              if (taskIndex > -1 && originalStatus) {
                 allTasks[taskIndex].status = originalStatus;
                 renderTaskBoard();
              } else {
                 fetchTasks_Tasks().then(renderTaskBoard);
              }
        });
}

// --- Kalendervisning ---
// Bytter mellom Kanban og Kalender
function switchView(viewToShow) {
    if (viewToShow === currentView) return; // Ingen endring

    const kanbanContainer = document.getElementById('task-board-container');
    const calendarContainer = document.getElementById('calendar-view-container');
    const kanbanBtn = document.getElementById('kanban-view-btn');
    const calendarBtn = document.getElementById('calendar-view-btn');

    if (!kanbanContainer || !calendarContainer || !kanbanBtn || !calendarBtn) {
        console.error("Finner ikke nødvendige elementer for visningsbytte.");
        return;
    }

    currentView = viewToShow; // Oppdater global variabel

    if (viewToShow === 'kanban') {
        kanbanContainer.style.display = 'block'; // Vis Kanban
        calendarContainer.style.display = 'none'; // Skjul Kalender
        kanbanBtn.classList.add('active');
        calendarBtn.classList.remove('active');
        renderTaskBoard(); // Sørg for at Kanban er oppdatert
    } else { // viewToShow === 'calendar'
        kanbanContainer.style.display = 'none'; // Skjul Kanban
        calendarContainer.style.display = 'block'; // Vis Kalender
        kanbanBtn.classList.remove('active');
        calendarBtn.classList.add('active');
        initializeOrUpdateCalendar(); // Sett opp eller oppdater kalenderen
    }
    console.log("Byttet visning til:", currentView);
}

// Initialiserer eller oppdaterer FullCalendar-instansen
function initializeOrUpdateCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) {
         console.error("FEIL: Finner ikke #calendar elementet!");
         return;
    }

    // Filtrer oppgaver basert på globale filtre FØR sending til kalender
    const filteredTasks = filterTasks(allTasks);
    const formattedTasks = formatTasksForCalendar_Simple(filteredTasks); // Formater for kalender

    if (!calendarInstance) { // Hvis kalenderen ikke er laget ennå
        console.log("Initialiserer FullCalendar...");
        try {
            calendarInstance = new FullCalendar.Calendar(calendarEl, {
                initialView: 'dayGridMonth', // Startvisning
                locale: 'no', // Norsk språk
                headerToolbar: { // Knapper øverst
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,timeGridWeek,listWeek' // Visningsvalg
                },
                events: formattedTasks, // Legg inn oppgavene
                editable: false, // Ikke tillat dra-og-slipp i kalenderen
                eventClick: function(info) { // Hva skjer ved klikk på en oppgave
                    console.log('Kalender Event Klikket:', info.event);
                    const taskId = info.event.id; // Hent ID fra hendelsen
                    if (taskId) {
                        openEditTaskModal(taskId); // Åpne redigeringsmodal
                    }
                },
                height: 'auto', // Juster høyde automatisk
                // eventDidMount: function(info) {
                //     // Kan brukes til å legge til tooltips etc.
                // }
            });
            calendarInstance.render(); // Tegn kalenderen
            console.log("FullCalendar rendret.");
        } catch (e) {
            console.error("FEIL ved initialisering av FullCalendar:", e);
            alert("Kunne ikke initialisere kalenderen. Sjekk konsollen for feil.");
        }
    } else { // Hvis kalenderen allerede finnes
         console.log("Oppdaterer FullCalendar events...");
         try {
            calendarInstance.removeAllEvents(); // Fjern gamle hendelser
            calendarInstance.addEventSource(formattedTasks); // Legg til de nye (filtrerte)
            // calendarInstance.refetchEvents(); // Trengs vanligvis ikke etter addEventSource
            console.log("FullCalendar events oppdatert.");
         } catch (e) {
             console.error("FEIL ved oppdatering av FullCalendar events:", e);
         }
    }
}

// Formaterer oppgavelisten for FullCalendar (bruker KUN dueDate)
function formatTasksForCalendar_Simple(tasks) {
    console.log("Formaterer oppgaver for kalender (m/farger):", tasks.length);
    return tasks
        .filter(task => task.dueDate) // Inkluder KUN oppgaver som har en frist
        .map(task => {
            const colors = getEventColorsForStatus(task.status); // Hent farge basert på status

            return {
                id: task.id, // Viktig for eventClick
                title: `${task.name} (${task.customer || '?'})`, // Vis oppgavenavn og kunde
                start: task.dueDate, // Fristen er startdatoen for visning
                allDay: true, // Anta at fristen gjelder hele dagen
                extendedProps: { // Ekstra data tilgjengelig i eventClick
                    customer: task.customer,
                    status: task.status,
                    priority: task.priority,
                    description: task.description
                },
                // Sett farger basert på status
                backgroundColor: colors.backgroundColor,
                borderColor: colors.borderColor,
                textColor: colors.textColor
            };
        });
}

// Returnerer farger basert på oppgavestatus
function getEventColorsForStatus(status) {
    let backgroundColor = '#7b2cbf'; // Default: Lilla (accent-secondary)
    let borderColor = '#9d4edd';   // Default: Lysere lilla (accent-primary)
    let textColor = '#ffffff';     // Default: Hvit tekst

    switch (status?.toLowerCase()) {
        case 'ny':
            backgroundColor = '#64b5f6'; borderColor = '#42a5f5'; break;
        case 'pågår':
            backgroundColor = '#ffc107'; borderColor = '#ffa000'; textColor = '#121212'; break;
        case 'venter':
            backgroundColor = '#ff9800'; borderColor = '#fb8c00'; textColor = '#121212'; break;
        case 'ferdig':
            backgroundColor = '#4CAF50'; borderColor = '#388E3C'; break;
    }
    return { backgroundColor, borderColor, textColor };
}


// --- Generell POST-funksjon (enkel versjon) ---
function postDataToScript_Tasks(data) {
    console.log("Sender POST-data:", data);
    const formData = new FormData();
    for (const key in data) {
        // Håndter null/undefined -> tom streng
        const value = (data[key] === null || data[key] === undefined) ? '' : data[key];
        formData.append(key, value);
    }

    return fetch(GOOGLE_SCRIPT_URL, { method: 'POST', body: formData })
    .then(response => {
        // Få tak i teksten for å gi bedre feilmeldinger
        return response.text().then(text => {
             if (!response.ok) {
                 console.error("POST feilet - Status:", response.status, "Tekst:", text);
                 // Prøv å gi en litt mer brukervennlig feilmelding hvis mulig
                 let errorMsg = `HTTP ${response.status}`;
                 try { // Hvis svaret er JSON med en 'message'
                     const jsonError = JSON.parse(text);
                     if (jsonError && jsonError.message) {
                         errorMsg = jsonError.message;
                     } else {
                         errorMsg = text.substring(0, 100) + (text.length > 100 ? '...' : ''); // Vis starten av teksten
                     }
                 } catch (e) {
                      errorMsg = text.substring(0, 100) + (text.length > 100 ? '...' : ''); // Vis starten av teksten hvis ikke JSON
                 }
                 throw new Error(errorMsg);
             }
             // Hvis OK, prøv å parse JSON
             try {
                  const jsonData = JSON.parse(text);
                  // Sjekk om backend returnerte et 'success'-flagg
                  if (jsonData?.success !== undefined) return jsonData;
                  else {
                      console.warn("Ugyldig JSON-format i vellykket svar:", text);
                      // Returner et standard suksessobjekt hvis formatet er rart, men status var OK
                      return { success: true, message: "Handlingen ser ut til å være utført, men svaret var uventet."};
                      // Alternativt: throw new Error("Ugyldig svarformat fra server (JSON).");
                  }
             } catch (e) {
                  console.error("Kunne ikke parse JSON fra vellykket svar:", text, e);
                  throw new Error("Kunne ikke tolke svar fra server (JSON parse error).");
             }
        });
    });
}
