// tasks.js (Oppdatert for interaktiv kalender: dra-og-slipp dato, hover-info)

// GOOGLE_SCRIPT_URL hentes globalt fra script.js

// --- Globale variabler ---
let allTasks = []; // Holder alle oppgaver for den valgte brukeren
let allCustomersForTasks = []; // Holder kundeliste for filter, spesifikk for den valgte brukeren
let currentCustomerFilter_Tasks = 'all'; // Aktivt kundefilter
let currentStatusFilter_Tasks = 'open'; // Aktivt statusfilter (f.eks. 'open', 'Ny', 'Ferdig')
let calendarInstance = null; // Holder FullCalendar-instansen
let currentView_Tasks = 'kanban'; // Hvilken visning som er aktiv ('kanban' eller 'calendar')
let draggedTaskId = null; // ID på oppgave som dras i Kanban-visning
let isSubmittingTask = false; // Forhindrer doble innsendinger ved lagring/oppdatering av oppgave
let isDeletingTask = false; // Forhindrer doble slettinger av oppgave
let customTooltip = null; // DOM-element for egendefinert tooltip i kalenderen

// --- Initialisering ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Tasks DOM lastet.");
    // Hent aktiv bruker fra localStorage (satt av theme.js), default til 'C'
    if (typeof currentUserSuffix === 'undefined') {
        // eslint-disable-next-line no-global-assign
        currentUserSuffix = localStorage.getItem('currentUserSuffix') || 'C';
        console.warn(`currentUserSuffix var undefined i tasks.js, satt til: ${currentUserSuffix}`);
    }
    // Sjekk om backend-URL er tilgjengelig
    if (typeof GOOGLE_SCRIPT_URL === 'undefined' || !GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("DIN_NETTAPP_URL_HER")) {
       alert("KRITISK FEIL: GOOGLE_SCRIPT_URL er ikke tilgjengelig eller riktig satt globalt (sjekk script.js)! Oppgavesiden vil ikke fungere.");
       return; // Stopp videre kjøring hvis URL mangler
    }

    updateCurrentDateHeader_Tasks(); // Oppdater datovisning
    setupEventListeners_Tasks();     // Sett opp alle hendelseslyttere
    fetchInitialData_Tasks();        // Hent initiale data (oppgaver og kunder)

    createCustomTooltipElement();    // Forbered tooltip-elementet for kalenderen
});

// Sett opp alle hendelseslyttere for siden
function setupEventListeners_Tasks() {
    document.getElementById('customer-filter')?.addEventListener('change', handleCustomerFilterChange_Tasks);
    document.querySelectorAll('.status-filter-btn')?.forEach(button => {
        button.addEventListener('click', handleStatusFilterChange_Tasks);
    });
    document.getElementById('refresh-button')?.addEventListener('click', fetchInitialData_Tasks);
    document.getElementById('add-task-btn')?.addEventListener('click', openAddTaskModal_Tasks);
    document.getElementById('save-task-btn')?.addEventListener('click', handleSaveTask_Tasks); // Knappen inne i modalen
    document.getElementById('kanban-view-btn')?.addEventListener('click', () => switchView_Tasks('kanban'));
    document.getElementById('calendar-view-btn')?.addEventListener('click', () => switchView_Tasks('calendar'));
    
    // Lukkeknapper for oppgavemodal og slettemodal
    document.querySelectorAll('#taskModal .close, #taskModal .cancel-btn').forEach(btn => {
         btn.addEventListener('click', () => closeModal('taskModal')); // Bruker global closeModal
    });
    document.getElementById('confirm-delete-task-btn')?.addEventListener('click', deleteTask_Tasks);
    document.querySelectorAll('#confirmDeleteTaskModal .close, #confirmDeleteTaskModal .cancel-btn').forEach(btn => {
        btn.addEventListener('click', () => closeModal('confirmDeleteTaskModal')); // Bruker global closeModal
    });

    // Lukk modaler ved klikk utenfor
    window.addEventListener('click', function(event) {
        const taskModal = document.getElementById('taskModal');
        if (taskModal && taskModal.style.display === 'block' && event.target === taskModal) {
            closeModal('taskModal');
        }
        const confirmDeleteModal = document.getElementById('confirmDeleteTaskModal');
        if (confirmDeleteModal && confirmDeleteModal.style.display === 'block' && event.target === confirmDeleteModal) {
            closeModal('confirmDeleteTaskModal');
        }
    });

    // Drag-and-drop for Kanban-kolonner
    document.querySelectorAll('.kanban-column .task-list').forEach(list => {
        list.addEventListener('dragover', handleDragOver_Tasks);
        list.addEventListener('dragleave', handleDragLeave_Tasks);
        list.addEventListener('drop', handleDrop_Tasks);
    });

    // Vis/skjul sluttdato for gjentakelse i modalen
    const recurrenceRuleDropdown = document.getElementById('task-recurrence-rule');
    const recurrenceEndDateGroup = document.getElementById('task-recurrence-end-date-group');
    if (recurrenceRuleDropdown && recurrenceEndDateGroup) {
        recurrenceRuleDropdown.addEventListener('change', function() {
            recurrenceEndDateGroup.style.display = (this.value && this.value !== 'Aldri') ? 'block' : 'none';
            if (this.value === 'Aldri') {
                document.getElementById('task-recurrence-end-date').value = ''; // Tøm dato hvis "Aldri"
            }
        });
    }
}

// --- Tooltip funksjoner for Kalender ---
function createCustomTooltipElement() {
    if (document.getElementById('calendar-task-tooltip')) return;
    customTooltip = document.createElement('div');
    customTooltip.id = 'calendar-task-tooltip';
    // Styling for tooltipen
    customTooltip.style.position = 'absolute';
    customTooltip.style.display = 'none';
    customTooltip.style.backgroundColor = 'var(--bg-modal, #2f2f2f)'; // Litt lysere enn kort for synlighet
    customTooltip.style.color = 'var(--text-primary, #ffffff)';
    customTooltip.style.border = '1px solid var(--border-inactive, #444)';
    customTooltip.style.padding = '10px 15px';
    customTooltip.style.borderRadius = '8px';
    customTooltip.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
    customTooltip.style.zIndex = '1005';
    customTooltip.style.fontSize = '0.9rem';
    customTooltip.style.lineHeight = '1.4';
    customTooltip.style.maxWidth = '280px';
    customTooltip.style.pointerEvents = 'none'; // Viktig!
    document.body.appendChild(customTooltip);
}

function showCalendarTooltip(eventInfo) {
    if (!customTooltip) createCustomTooltipElement(); // Sikkerhetssjekk
    
    const task = eventInfo.event.extendedProps; // Hent all oppgavedata
    let title = eventInfo.event.title;
    // Fjern brukerprefix (C: / W: ) og gjentakelsesikon fra tittelen i tooltipen for renere visning
    title = title.replace(/^[CW]:\s*/, '').replace(/^🔄\s*/, '');

    let content = `<strong>${title}</strong><hr style="border-color: var(--border-inactive); margin: 5px 0;">`;
    content += `Kunde: ${task.customer || 'N/A'}<br>`;
    content += `Status: ${task.status || 'N/A'}`;
    if (task.priority) content += ` | Prioritet: ${task.priority}`;
    content += `<br>`;
    if (task.estimatedTime) content += `Estimert: ${task.estimatedTime}t<br>`;
    if (task.description) {
        content += `Beskrivelse: ${task.description.substring(0, 70)}${task.description.length > 70 ? '...' : ''}<br>`;
    }
    if (task.recurrenceRule && task.recurrenceRule !== 'Aldri') {
        content += `<span style="color: var(--accent-primary);">Gjentar: ${task.recurrenceRule}`;
        if (task.recurrenceEndDate) content += ` til ${new Date(task.recurrenceEndDate).toLocaleDateString('no-NO')}`;
        content += `</span>`;
    }

    customTooltip.innerHTML = content;
    customTooltip.style.display = 'block';
    
    // Posisjoner tooltip
    let x = eventInfo.jsEvent.pageX + 10;
    let y = eventInfo.jsEvent.pageY + 10;
    
    customTooltip.style.left = x + 'px';
    customTooltip.style.top = y + 'px';

    const tooltipRect = customTooltip.getBoundingClientRect();
    if (tooltipRect.right > window.innerWidth - 10) { // 10px margin
        customTooltip.style.left = (eventInfo.jsEvent.pageX - tooltipRect.width - 10) + 'px';
    }
    if (tooltipRect.bottom > window.innerHeight - 10) {
        customTooltip.style.top = (eventInfo.jsEvent.pageY - tooltipRect.height - 10) + 'px';
    }
}

function hideCalendarTooltip() {
    if (customTooltip) {
        customTooltip.style.display = 'none';
    }
}

// --- Datahenting og UI-oppdatering ---
function updateCurrentDateHeader_Tasks() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('current-date').textContent = now.toLocaleDateString('no-NO', options);
}

function showLoadingIndicator_Tasks(isLoading) {
    const placeholder = document.querySelector('#task-board .kanban-column[data-status="Ny"] .task-placeholder');
    if (placeholder) {
        placeholder.textContent = isLoading ? "Laster oppgaver..." : "Ingen oppgaver funnet.";
        placeholder.style.display = isLoading || allTasks.length === 0 ? 'block' : 'none';
    }
    document.getElementById('calendar-view-container')?.classList.toggle('loading', isLoading);
}

// Hovedfunksjon for å laste inn all data for oppgavesiden
function fetchInitialData_Tasks() {
    if (typeof currentUserSuffix === 'undefined') {
        currentUserSuffix = localStorage.getItem('currentUserSuffix') || 'C';
    }
    console.log(`Henter initiale data for oppgaver (bruker: ${currentUserSuffix})...`);
    showLoadingIndicator_Tasks(true);

    Promise.all([
        fetchCustomersForTasks_Tasks(), // Henter kundeliste for filter
        fetchTasks_Tasks()              // Henter selve oppgavene
    ])
    .then(() => {
        populateCustomerFilter_Tasks();
        if (currentView_Tasks === 'kanban') {
            renderTaskBoard_Tasks();
        } else {
            initializeOrUpdateCalendar_Tasks();
        }
    })
    .catch(error => {
        console.error(`Feil ved henting av initiale data for oppgaver (${currentUserSuffix}):`, error);
        alert("Kunne ikke hente data for oppgavesiden: " + error.message);
        showLoadingIndicator_Tasks(false); // Skjul lasteindikator ved feil
    })
    .finally(() => {
        if (!document.querySelector('#task-board .kanban-column[data-status="Ny"] .task-placeholder')?.style.display === 'block') {
             showLoadingIndicator_Tasks(false); // Sørg for at lasteindikator skjules hvis ingen oppgaver ble funnet
        }
    });
}

// Henter kundeliste spesifikt for oppgavefilteret
function fetchCustomersForTasks_Tasks() {
    return fetchDataFromScript_Tasks({ action: 'getCustomers', user: currentUserSuffix })
        .then(data => {
            allCustomersForTasks = (data.success && Array.isArray(data.customers)) ? 
                data.customers.sort((a, b) => a.name.localeCompare(b.name, 'no')) : [];
            return allCustomersForTasks;
        })
        .catch(() => { // Håndter feil her også
            allCustomersForTasks = []; 
            return allCustomersForTasks;
        });
}

// Henter oppgaver for den valgte brukeren
function fetchTasks_Tasks() {
    return fetchDataFromScript_Tasks({ action: 'getTasks', user: currentUserSuffix })
        .then(data => {
            allTasks = (data.success && Array.isArray(data.tasks)) ? data.tasks : [];
            if (!data.success) {
                throw new Error(data.message || `Kunne ikke hente oppgaveliste for ${currentUserSuffix}`);
            }
            return allTasks;
        });
}

// Generell funksjon for GET-forespørsler til backend
function fetchDataFromScript_Tasks(params) {
    const urlParams = new URLSearchParams(params);
    urlParams.append('nocache', Date.now());
    const url = `${GOOGLE_SCRIPT_URL}?${urlParams.toString()}`;
    return fetch(url).then(response => {
        if (!response.ok) return response.text().then(text => { throw new Error(text || `Nettverksfeil: ${response.status}`); });
        return response.json();
    });
}

// Generell funksjon for POST-forespørsler til backend
function postDataToScript_Tasks(data) {
    const formData = new FormData();
    for (const key in data) {
        formData.append(key, (data[key] === null || data[key] === undefined) ? '' : data[key]);
    }
    return fetch(GOOGLE_SCRIPT_URL, { method: 'POST', body: formData })
        .then(response => response.json());
}

// --- Rendering av Kanban-brett og oppgavekort ---
function populateCustomerFilter_Tasks() { /* ... (uendret) ... */ }
function renderTaskBoard_Tasks() { /* ... (uendret) ... */ }
function createTaskCardElement_Tasks(task) { /* ... (uendret, men sjekk at sletteknapp og klikk fungerer) ... */ 
    const card = document.createElement('div');
    card.className = 'task-card';
    card.setAttribute('draggable', true);
    card.setAttribute('data-task-id', task.id);
    if (task.priority) card.classList.add(`priority-${task.priority.toLowerCase()}`);

    let dueDateHtml = ''; 
    if (task.dueDate) {
        const dueDate = new Date(task.dueDate); const today = new Date();
        dueDate.setHours(0, 0, 0, 0); today.setHours(0, 0, 0, 0);
        const timeDiff = dueDate.getTime() - today.getTime();
        const daysUntilDue = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
        let isOverdue = daysUntilDue < 0;
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
    let estimatedTimeHtml = ''; 
    if (task.estimatedTime !== null && task.estimatedTime !== undefined && task.estimatedTime > 0) {
         estimatedTimeHtml = `
            <span class="task-estimated" title="Estimert tid">
                ⏱️ ${parseFloat(task.estimatedTime).toFixed(1)} t
            </span>`;
    }
    let recurrenceHtml = '';
    if (task.recurrenceRule && task.recurrenceRule !== 'Aldri') {
        recurrenceHtml = `<span class="task-recurrence" title="Gjentakende: ${task.recurrenceRule}">🔄</span>`;
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'task-delete-btn';
    deleteBtn.innerHTML = '🗑️'; 
    deleteBtn.title = 'Slett oppgave';
    deleteBtn.onclick = (e) => {
        e.stopPropagation(); 
        confirmDeleteTask_Tasks(task.id, task.name);
    };

    card.innerHTML = `
        <h4>
            <span class="task-title-text">${recurrenceHtml} ${task.name || 'Ukjent oppgave'}</span>
            </h4>
        <div class="task-meta">
            <span class="task-customer" title="Kunde">👤 ${task.customer || 'Ingen'}</span>
            ${dueDateHtml}
            ${estimatedTimeHtml}
            ${task.priority ? `<span title="Prioritet">${getPriorityIcon_Tasks(task.priority)} ${task.priority}</span>` : ''}
        </div>
    `;
    card.querySelector('h4').appendChild(deleteBtn);

    card.addEventListener('dragstart', handleDragStart_Tasks);
    card.addEventListener('dragend', handleDragEnd_Tasks);
    card.addEventListener('click', (e) => {
        if (e.target !== deleteBtn && !deleteBtn.contains(e.target)) { 
            openEditTaskModal_Tasks(task.id);
        }
    });
    return card;
}
function getPriorityIcon_Tasks(priority) { /* ... (uendret) ... */ }

// --- Filter Håndtering ---
function handleCustomerFilterChange_Tasks(event) { /* ... (uendret) ... */ }
function handleStatusFilterChange_Tasks(event) { /* ... (uendret) ... */ }
function filterTasks_Tasks(tasksToFilter) { /* ... (uendret) ... */ }

// --- Modal og Lagring (inkludert gjentakelse) ---
function openAddTaskModal_Tasks() { /* ... (uendret) ... */ }
function openEditTaskModal_Tasks(taskId) { /* ... (uendret) ... */ }
function clearTaskModal_Tasks() { /* ... (uendret) ... */ }
function populateCustomerDropdown_Modal_Tasks() { /* ... (uendret) ... */ }
function handleSaveTask_Tasks() { /* ... (uendret) ... */ }

// --- Slettefunksjoner ---
function confirmDeleteTask_Tasks(taskId, taskName) { /* ... (uendret) ... */ }
function deleteTask_Tasks() { /* ... (uendret) ... */ }

// --- Drag and Drop (Kanban) & Kalender (Oppdatert for interaktivitet) ---
function handleDragStart_Tasks(event) { /* ... (uendret) ... */ }
function handleDragEnd_Tasks(event) { /* ... (uendret) ... */ }
function handleDragOver_Tasks(event) { /* ... (uendret) ... */ }
function handleDragLeave_Tasks(event) { /* ... (uendret) ... */ }
function handleDrop_Tasks(event) { /* ... (uendret) ... */ }
function updateTaskStatus_Tasks(taskId, newStatus) { /* ... (uendret) ... */ } // For Kanban statusendring
function switchView_Tasks(viewToShow) { /* ... (uendret) ... */ }

function initializeOrUpdateCalendar_Tasks() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) {
        console.error("Kalenderelement #calendar ikke funnet!");
        return;
    }
    
    const filteredTasks = filterTasks_Tasks(allTasks);
    const formattedTasks = formatTasksForCalendar_Simple_Tasks(filteredTasks);

    if (calendarInstance) { // Hvis instansen finnes, oppdater events
        calendarInstance.removeAllEvents();
        calendarInstance.addEventSource(formattedTasks);
        return;
    }

    // Initialiser kalenderen hvis den ikke finnes
    try {
        calendarInstance = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            locale: 'no',
            headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listWeek' },
            events: formattedTasks,
            editable: true, // Tillat dra-og-slipp
            eventDrop: function(info) {
                console.log('Oppgave flyttet:', info.event.id, 'til ny dato:', info.event.start);
                const taskId = info.event.id;
                const newDueDate = info.event.start.toISOString().split('T')[0];

                const taskToUpdate = allTasks.find(t => t.id === taskId);
                if (taskToUpdate && taskToUpdate.dueDate === newDueDate) {
                    console.log("Dato ikke endret, ingen oppdatering nødvendig.");
                    return;
                }
                
                // Optimistisk oppdatering av lokal data
                if (taskToUpdate) taskToUpdate.dueDate = newDueDate;

                const taskData = {
                    action: 'updateTask',
                    id: taskId,
                    dueDate: newDueDate,
                    user: currentUserSuffix // Viktig for backend
                };
                
                postDataToScript_Tasks(taskData)
                    .then(response => {
                        if (!response.success) {
                            console.error("Feil ved oppdatering av frist via kalender:", response.message);
                            alert("Kunne ikke lagre ny frist. Endringen er tilbakestilt.");
                            info.revert(); // Tilbakestill flyttingen i kalenderen
                            // Gjenopprett gammel dato i allTasks hvis nødvendig
                            if(taskToUpdate && info.oldEvent) taskToUpdate.dueDate = info.oldEvent.start.toISOString().split('T')[0];
                        } else {
                            console.log(`Frist for oppgave ${taskId} oppdatert til ${newDueDate}.`);
                            // Ikke nødvendig å kalle fetchTasks_Tasks() her hvis den lokale oppdateringen er nok for UI
                        }
                    })
                    .catch(error => {
                        console.error("Nettverksfeil ved oppdatering av frist:", error);
                        alert("Nettverksfeil. Kunne ikke lagre ny frist. Endringen er tilbakestilt.");
                        info.revert();
                        if(taskToUpdate && info.oldEvent) taskToUpdate.dueDate = info.oldEvent.start.toISOString().split('T')[0];
                    });
            },
            eventClick: function(info) {
                if (info.event.id) openEditTaskModal_Tasks(info.event.id);
            },
            eventMouseEnter: function(info) {
                showCalendarTooltip(info);
            },
            eventMouseLeave: function(info) {
                hideCalendarTooltip();
            },
            height: 'auto', // Eller en fast høyde som f.eks. 650
        });
        calendarInstance.render();
    } catch (e) {
        console.error("FEIL ved initialisering av FullCalendar (tasks):", e);
    }
}

function formatTasksForCalendar_Simple_Tasks(tasks) {
    console.log(`Formaterer ${tasks.length} oppgaver for kalender (bruker: ${currentUserSuffix})`);
    return tasks
        .filter(task => task.dueDate) // Kun oppgaver med frist
        .map(task => {
            const colors = getEventColorsForStatus_Tasks(task.status);
            let title = `${task.name} (${task.customer || '?'})`;
            if (task.recurrenceRule && task.recurrenceRule !== 'Aldri') {
                title = `🔄 ${title}`;
            }
            return {
                id: task.id,
                title: title,
                start: task.dueDate, // FullCalendar håndterer tidssoner basert på input
                allDay: true, // Anta at alle oppgaver er heldagsoppgaver i kalenderen
                extendedProps: task, // Legg hele task-objektet her for tooltip og eventClick
                backgroundColor: colors.backgroundColor,
                borderColor: colors.borderColor,
                textColor: colors.textColor
            };
        });
}

function getEventColorsForStatus_Tasks(status) {
    let backgroundColor = 'var(--accent-primary)'; // Default
    let borderColor = 'var(--accent-secondary)';
    let textColor = '#ffffff'; // Default for mørke bakgrunner

    switch (status?.toLowerCase()) {
        case 'ny':      backgroundColor = '#64b5f6'; borderColor = '#42a5f5'; textColor = '#000000'; break;
        case 'pågår':   backgroundColor = 'var(--bar-yellow)'; borderColor = '#ffa000'; textColor = '#000000'; break;
        case 'venter':  backgroundColor = '#ff9800'; borderColor = '#fb8c00'; textColor = '#000000'; break;
        case 'ferdig':  backgroundColor = 'var(--bar-green)'; borderColor = '#388E3C'; textColor = '#ffffff'; break;
    }
    return { backgroundColor, borderColor, textColor };
}
