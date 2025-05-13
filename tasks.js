// tasks.js (Oppdatert for brukerbytte, gjentakende oppgaver, sletting, interaktiv kalender med tidsestimat OG automatisk planlegging)

// GOOGLE_SCRIPT_URL hentes globalt fra script.js

// --- Globale variabler ---
let allTasks = [];
let allCustomersForTasks = [];
let currentCustomerFilter_Tasks = 'all';
let currentStatusFilter_Tasks = 'open'; // Standard er å vise åpne oppgaver
let calendarInstance = null;
let currentView_Tasks = 'kanban';
let draggedTaskId = null;
let isSubmittingTask = false;
let isDeletingTask = false;
let customTooltip = null;
const DEFAULT_TASK_START_HOUR = 8; // Starter arbeidsdagen kl. 08:00 for frist-baserte kalenderhendelser
const DEFAULT_TASK_DURATION_HOURS = 1; // Hvis estimert tid mangler

// --- NYE KONSTANTER FOR AUTOMATISK PLANLEGGING ---
const WORKING_DAY_START_HOUR = 8;    // Arbeidsdagen starter kl. 08:00
const WORKING_DAY_END_HOUR = 16;     // Arbeidsdagen slutter kl. 16:00 (dvs. siste arbeid er 15:00-16:00)
const LUNCH_BREAK_START_HOUR = 12;   // Lunsjpause starter kl. 12:00
const LUNCH_BREAK_DURATION_HOURS = 0.5; // Lunsjpause varer 30 minutter

// --- Initialisering ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Tasks DOM lastet.");
    if (typeof currentUserSuffix === 'undefined') {
        console.warn("currentUserSuffix ikke definert i tasks.js. Fallback.");
        // eslint-disable-next-line no-global-assign
        currentUserSuffix = localStorage.getItem('currentUserSuffix') || 'C';
    }
    if (typeof GOOGLE_SCRIPT_URL === 'undefined' || !GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("DIN_NETTAPP_URL_HER")) {
       alert("KRITISK FEIL: GOOGLE_SCRIPT_URL er ikke tilgjengelig eller riktig satt globalt (sjekk script.js)! Oppgavesiden vil ikke fungere.");
       return;
    }
    updateCurrentDateHeader_Tasks();
    setupEventListeners_Tasks(); 
    fetchInitialData_Tasks();
    createCustomTooltipElement();
});

function setupEventListeners_Tasks() {
    document.getElementById('customer-filter')?.addEventListener('change', handleCustomerFilterChange_Tasks);
    document.querySelectorAll('.status-filter-btn')?.forEach(button => {
        button.addEventListener('click', handleStatusFilterChange_Tasks);
    });
    document.getElementById('refresh-button')?.addEventListener('click', fetchInitialData_Tasks);
    document.getElementById('add-task-btn')?.addEventListener('click', openAddTaskModal_Tasks);
    document.getElementById('save-task-btn')?.addEventListener('click', handleSaveTask_Tasks);
    document.getElementById('kanban-view-btn')?.addEventListener('click', () => switchView_Tasks('kanban'));
    document.getElementById('calendar-view-btn')?.addEventListener('click', () => switchView_Tasks('calendar'));
    
    // NY EVENT LISTENER FOR PLANLEGGINGSKNAPP
    document.getElementById('schedule-today-btn')?.addEventListener('click', () => {
        const today = new Date(); // Planlegg for i dag
        scheduleDailyTasks(today);
        // Bytt til kalendervisning hvis den ikke allerede er aktiv for å se resultatet
        if (currentView_Tasks !== 'calendar') {
            switchView_Tasks('calendar');
        }
        // Sørg for at kalenderen viser dagsvisning for den planlagte dagen
        if (calendarInstance) {
            calendarInstance.changeView('timeGridDay', today.toISOString().slice(0,10));
        }
    });
    
    document.querySelectorAll('#taskModal .close, #taskModal .cancel-btn').forEach(btn => {
         btn.addEventListener('click', () => closeModal('taskModal'));
    });
    document.getElementById('confirm-delete-task-btn')?.addEventListener('click', deleteTask_Tasks);
    document.querySelectorAll('#confirmDeleteTaskModal .close, #confirmDeleteTaskModal .cancel-btn').forEach(btn => {
        btn.addEventListener('click', () => closeModal('confirmDeleteTaskModal'));
    });

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
    document.querySelectorAll('.kanban-column .task-list').forEach(list => {
        list.addEventListener('dragover', handleDragOver_Tasks);
        list.addEventListener('dragleave', handleDragLeave_Tasks);
        list.addEventListener('drop', handleDrop_Tasks);
    });

    const recurrenceRuleDropdown = document.getElementById('task-recurrence-rule');
    const recurrenceEndDateGroup = document.getElementById('task-recurrence-end-date-group');
    if (recurrenceRuleDropdown && recurrenceEndDateGroup) {
        recurrenceRuleDropdown.addEventListener('change', function() {
            recurrenceEndDateGroup.style.display = (this.value && this.value !== 'Aldri') ? 'block' : 'none';
            if (this.value === 'Aldri') document.getElementById('task-recurrence-end-date').value = '';
        });
    }
}

// --- Tooltip funksjoner for Kalender ---
function createCustomTooltipElement() {
    if (document.getElementById('calendar-task-tooltip')) return;
    customTooltip = document.createElement('div');
    customTooltip.id = 'calendar-task-tooltip';
    customTooltip.style.position = 'absolute';
    customTooltip.style.display = 'none';
    customTooltip.style.backgroundColor = 'var(--bg-modal, #2f2f2f)';
    customTooltip.style.color = 'var(--text-primary, #ffffff)';
    customTooltip.style.border = '1px solid var(--border-inactive, #444)';
    customTooltip.style.padding = '10px 15px';
    customTooltip.style.borderRadius = '8px';
    customTooltip.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
    customTooltip.style.zIndex = '1005';
    customTooltip.style.fontSize = '0.9rem';
    customTooltip.style.lineHeight = '1.4';
    customTooltip.style.maxWidth = '280px';
    customTooltip.style.pointerEvents = 'none';
    document.body.appendChild(customTooltip);
}

function showCalendarTooltip(eventInfo) {
    if (!customTooltip) createCustomTooltipElement();
    const task = eventInfo.event.extendedProps;
    let title = eventInfo.event.title.replace(/^(Autom\.:\s*)/, '').replace(/^[CW]:\s*/, '').replace(/^🔄\s*/, ''); // Fjerner "Autom.: " prefiks for tooltip
    let content = `<strong>${title}</strong><hr style="border-color: var(--border-inactive); margin: 5px 0;">`;
    content += `Kunde: ${task.customer || 'N/A'}<br>`;
    content += `Status: ${task.status || 'N/A'}`;
    if (task.priority) content += ` | Prioritet: ${task.priority}`;
    content += `<br>`;
    if (task.estimatedTime) content += `Estimert: ${task.estimatedTime}t<br>`;
    
    if (task.description && typeof task.description === 'string') {
        content += `Beskrivelse: ${task.description.substring(0, 70)}${task.description.length > 70 ? '...' : ''}<br>`;
    } else if (task.description) { 
        content += `Beskrivelse: ${String(task.description).substring(0, 70)}${String(task.description).length > 70 ? '...' : ''}<br>`;
    }

    if (task.recurrenceRule && task.recurrenceRule !== 'Aldri') {
        content += `<span style="color: var(--accent-primary);">Gjentar: ${task.recurrenceRule}`;
        if (task.recurrenceEndDate) content += ` til ${new Date(task.recurrenceEndDate).toLocaleDateString('no-NO')}`;
        content += `</span>`;
    }
    if (task.scheduled) { // Indikerer om det er en automatisk planlagt oppgave
        content += `<br><em style="color: var(--accent-secondary); font-size: 0.85em;">Automatisk planlagt</em>`;
    }
    customTooltip.innerHTML = content;
    customTooltip.style.display = 'block';
    let x = eventInfo.jsEvent.pageX + 10;
    let y = eventInfo.jsEvent.pageY + 10;
    customTooltip.style.left = x + 'px';
    customTooltip.style.top = y + 'px';
    const tooltipRect = customTooltip.getBoundingClientRect();
    if (tooltipRect.right > window.innerWidth - 10) {
        customTooltip.style.left = (eventInfo.jsEvent.pageX - tooltipRect.width - 10) + 'px';
    }
    if (tooltipRect.bottom > window.innerHeight - 10) {
        customTooltip.style.top = (eventInfo.jsEvent.pageY - tooltipRect.height - 10) + 'px';
    }
}

function hideCalendarTooltip() {
    if (customTooltip) customTooltip.style.display = 'none';
}

// --- Datahenting og UI-oppdatering ---
function updateCurrentDateHeader_Tasks() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const displayElement = document.getElementById('current-date');
    if(displayElement) displayElement.textContent = now.toLocaleDateString('no-NO', options);
}

function showLoadingIndicator_Tasks(isLoading) {
    const board = document.getElementById('task-board');
    const placeholder = board?.querySelector('.kanban-column[data-status="Ny"] .task-list .task-placeholder');
    if (placeholder) {
        placeholder.textContent = isLoading ? "Laster oppgaver..." : "Ingen oppgaver funnet.";
        placeholder.style.display = isLoading || allTasks.length === 0 ? 'block' : 'none';
    }
    document.getElementById('calendar-view-container')?.classList.toggle('loading', isLoading);
}

function fetchInitialData_Tasks() {
    if (typeof currentUserSuffix === 'undefined') {
        currentUserSuffix = localStorage.getItem('currentUserSuffix') || 'C';
    }
    console.log(`Henter initiale data for oppgaver (bruker: ${currentUserSuffix})...`);
    showLoadingIndicator_Tasks(true);
    Promise.all([
        fetchCustomersForTasks_Tasks(),
        fetchTasks_Tasks()
    ])
    .then(() => {
        populateCustomerFilter_Tasks();
        if (currentView_Tasks === 'kanban') {
            renderTaskBoard_Tasks();
        } else {
            initializeOrUpdateCalendar_Tasks(); // Dette vil vise frist-baserte hendelser
        }
    })
    .catch(error => {
        console.error(`Feil ved henting av initiale data for oppgaver (${currentUserSuffix}):`, error);
        alert("Kunne ikke hente data for oppgavesiden: " + error.message);
    })
    .finally(() => {
        showLoadingIndicator_Tasks(false);
    });
}

function fetchCustomersForTasks_Tasks() {
    return fetchDataFromScript_Tasks({ action: 'getCustomers', user: currentUserSuffix })
        .then(data => {
            allCustomersForTasks = (data.success && Array.isArray(data.customers)) ? 
                data.customers.sort((a, b) => a.name.localeCompare(b.name, 'no')) : [];
            return allCustomersForTasks;
        })
        .catch(() => { 
            allCustomersForTasks = []; 
            return allCustomersForTasks;
        });
}

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

function fetchDataFromScript_Tasks(params) {
    const urlParams = new URLSearchParams(params);
    urlParams.append('nocache', Date.now());
    const url = `${GOOGLE_SCRIPT_URL}?${urlParams.toString()}`;
    return fetch(url).then(response => {
        if (!response.ok) return response.text().then(text => { throw new Error(text || `Nettverksfeil: ${response.status}`); });
        return response.json();
    });
}

function postDataToScript_Tasks(data) {
    const formData = new FormData();
    for (const key in data) {
        formData.append(key, (data[key] === null || data[key] === undefined) ? '' : data[key]);
    }
    return fetch(GOOGLE_SCRIPT_URL, { method: 'POST', body: formData })
        .then(response => response.json());
}

// --- Rendering av Kanban-brett og oppgavekort ---
function populateCustomerFilter_Tasks() {
    const select = document.getElementById('customer-filter');
    if (!select) return;
    const previousValue = select.value;
    while (select.options.length > 1) select.remove(1);
    allCustomersForTasks.forEach(customer => {
        const option = document.createElement('option');
        option.value = customer.name; option.textContent = customer.name;
        select.appendChild(option);
    });
    select.value = Array.from(select.options).some(opt => opt.value === previousValue) ? previousValue : 'all';
}

function renderTaskBoard_Tasks() {
    console.log(`Rendrer Kanban-tavle for ${currentUserSuffix}...`);
    const board = document.getElementById('task-board');
    if (!board) return;

    board.querySelectorAll('.task-list').forEach(list => {
        const placeholderHTML = list.closest('.kanban-column[data-status="Ny"]') ? '<div class="task-placeholder">Laster...</div>' : '';
        list.innerHTML = placeholderHTML;
    });

    let filteredTasks = filterTasks_Tasks(allTasks); 
    const nyPlaceholder = board.querySelector('.kanban-column[data-status="Ny"] .task-list .task-placeholder');
    if (nyPlaceholder) {
        nyPlaceholder.textContent = "Ingen oppgaver funnet.";
        nyPlaceholder.style.display = filteredTasks.length === 0 ? 'block' : 'none';
    }

    filteredTasks.sort((a, b) => (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity));

    filteredTasks.forEach(task => {
        const card = createTaskCardElement_Tasks(task); 
        const columnList = board.querySelector(`.kanban-column[data-status="${task.status}"] .task-list`);
        if (columnList) {
             if (task.status === "Ny" && columnList.querySelector('.task-placeholder')) {
                 columnList.querySelector('.task-placeholder').style.display = 'none';
             }
            columnList.appendChild(card);
        } else { 
            const nyKolonneList = board.querySelector('.kanban-column[data-status="Ny"] .task-list');
            if (nyKolonneList?.querySelector('.task-placeholder')) nyKolonneList.querySelector('.task-placeholder').style.display = 'none';
            nyKolonneList?.appendChild(card);
        }
    });
}

function createTaskCardElement_Tasks(task) {
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
        dueDateHtml = `<span class="task-due-date ${isOverdue ? 'overdue' : ''}" title="Frist">📅 ${new Date(task.dueDate).toLocaleDateString('no-NO', { day: 'numeric', month: 'short' })}${isOverdue ? ' (Forfalt)' : (daysUntilDue <= 7 ? ` (${daysUntilDue} d)` : '')}</span>`;
    }
    let estimatedTimeHtml = ''; 
    if (task.estimatedTime) estimatedTimeHtml = `<span class="task-estimated" title="Estimert tid">⏱️ ${parseFloat(String(task.estimatedTime).replace(',', '.')).toFixed(1)} t</span>`;
    let recurrenceHtml = (task.recurrenceRule && task.recurrenceRule !== 'Aldri') ? `<span class="task-recurrence" title="Gjentakende: ${task.recurrenceRule}">🔄</span>` : '';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'task-delete-btn';
    deleteBtn.innerHTML = '🗑️'; 
    deleteBtn.title = 'Slett oppgave';
    deleteBtn.onclick = (e) => { e.stopPropagation(); confirmDeleteTask_Tasks(task.id, task.name); };

    const h4 = document.createElement('h4');
    const titleSpan = document.createElement('span');
    titleSpan.className = 'task-title-text';
    titleSpan.innerHTML = `${recurrenceHtml} ${task.name || 'Ukjent oppgave'}`;
    h4.appendChild(titleSpan);
    h4.appendChild(deleteBtn);

    const metaDiv = document.createElement('div');
    metaDiv.className = 'task-meta';
    metaDiv.innerHTML = `<span class="task-customer" title="Kunde">👤 ${task.customer || 'Ingen'}</span>${dueDateHtml}${estimatedTimeHtml}${task.priority ? `<span title="Prioritet">${getPriorityIcon_Tasks(task.priority)} ${task.priority}</span>` : ''}`;
    
    card.appendChild(h4);
    card.appendChild(metaDiv);

    card.addEventListener('dragstart', handleDragStart_Tasks);
    card.addEventListener('dragend', handleDragEnd_Tasks);
    card.addEventListener('click', (e) => {
        if (e.target !== deleteBtn && !deleteBtn.contains(e.target)) { 
            openEditTaskModal_Tasks(task.id);
        }
    });
    return card;
}

function getPriorityIcon_Tasks(priority) {
    switch (priority?.toLowerCase()) {
        case 'høy': return '🔴'; case 'medium': return '🟡'; case 'lav': return '🔵'; default: return '';
    }
}

function handleCustomerFilterChange_Tasks(event) {
    currentCustomerFilter_Tasks = event.target.value;
    if (currentView_Tasks === 'kanban') renderTaskBoard_Tasks();
    else initializeOrUpdateCalendar_Tasks(); // Oppdaterer kalender med frist-baserte hendelser
}

function handleStatusFilterChange_Tasks(event) {
    const clickedButton = event.target;
    document.querySelectorAll('.status-filter-btn.active').forEach(btn => btn.classList.remove('active'));
    clickedButton.classList.add('active');
    currentStatusFilter_Tasks = clickedButton.getAttribute('data-status');
    if (currentView_Tasks === 'kanban') renderTaskBoard_Tasks();
    else initializeOrUpdateCalendar_Tasks(); // Oppdaterer kalender med frist-baserte hendelser
}

function filterTasks_Tasks(tasksToFilter) { // Denne brukes både for Kanban og Kalender (frist-basert)
    return tasksToFilter.filter(task => {
        const customerMatch = currentCustomerFilter_Tasks === 'all' || task.customer === currentCustomerFilter_Tasks;
        let statusMatch = false;
        const taskStatusLower = task.status?.toLowerCase();

        if (currentStatusFilter_Tasks === 'all') {
            statusMatch = true;
        } else if (currentStatusFilter_Tasks === 'open') {
            statusMatch = taskStatusLower === 'ny' || taskStatusLower === 'pågår' || taskStatusLower === 'venter';
        } else {
            statusMatch = taskStatusLower === currentStatusFilter_Tasks?.toLowerCase();
        }
        return customerMatch && statusMatch;
    });
}

// --- Modal og Lagring ---
function openAddTaskModal_Tasks() {
    clearTaskModal_Tasks();
    document.getElementById('task-modal-title').textContent = 'Legg til ny oppgave';
    populateCustomerDropdown_Modal_Tasks();
    document.getElementById('taskModal').style.display = 'block';
}

function openEditTaskModal_Tasks(taskId) {
    // Sjekk om det er en automatisk planlagt hendelse (de har ofte et prefiks eller spesiell ID)
    const actualTaskId = String(taskId).startsWith('scheduled-') ? taskId.split('-')[1] : taskId;

    const task = allTasks.find(t => t.id === actualTaskId);
    if (!task) { alert("Feil: Fant ikke oppgaven."); return; }
    
    clearTaskModal_Tasks();
    document.getElementById('task-modal-title').textContent = 'Rediger oppgave';
    populateCustomerDropdown_Modal_Tasks();

    document.getElementById('task-id').value = task.id; // Bruk alltid den faktiske task.id
    document.getElementById('task-customer').value = task.customer;
    document.getElementById('task-name').value = task.name;
    document.getElementById('task-description').value = task.description || '';
    document.getElementById('task-status').value = task.status;
    document.getElementById('task-priority').value = task.priority || '';
    document.getElementById('task-due-date').value = task.dueDate || '';
    document.getElementById('task-estimated-time').value = (task.estimatedTime !== null && task.estimatedTime !== undefined) ? String(task.estimatedTime).replace(',', '.') : '1.5';
    
    const recurrenceRuleDropdown = document.getElementById('task-recurrence-rule');
    const recurrenceEndDateInput = document.getElementById('task-recurrence-end-date');
    const recurrenceEndDateGroup = document.getElementById('task-recurrence-end-date-group');

    recurrenceRuleDropdown.value = task.recurrenceRule || 'Aldri';
    if (task.recurrenceRule && task.recurrenceRule !== 'Aldri') {
        recurrenceEndDateGroup.style.display = 'block';
        recurrenceEndDateInput.value = task.recurrenceEndDate || '';
    } else {
        recurrenceEndDateGroup.style.display = 'none';
        recurrenceEndDateInput.value = '';
    }
    
    document.getElementById('taskModal').style.display = 'block';
}

function clearTaskModal_Tasks() {
    document.getElementById('task-id').value = '';
    document.getElementById('task-customer').value = '';
    document.getElementById('task-name').value = '';
    document.getElementById('task-description').value = '';
    document.getElementById('task-status').value = 'Ny';
    document.getElementById('task-priority').value = '';
    document.getElementById('task-due-date').value = '';
    document.getElementById('task-estimated-time').value = '1.5';
    document.getElementById('task-recurrence-rule').value = 'Aldri';
    document.getElementById('task-recurrence-end-date').value = '';
    document.getElementById('task-recurrence-end-date-group').style.display = 'none';
}

function populateCustomerDropdown_Modal_Tasks() {
     const select = document.getElementById('task-customer');
    if (!select) return;
    const currentValue = select.value;
    while (select.options.length > 1) select.remove(1);
    allCustomersForTasks.forEach(customer => { 
        const option = document.createElement('option');
        option.value = customer.name; option.textContent = customer.name;
        select.appendChild(option);
    });
    if(currentValue && Array.from(select.options).some(opt => opt.value === currentValue)) {
        select.value = currentValue;
    }
}

function handleSaveTask_Tasks() {
    if (isSubmittingTask) return;
    const taskId = document.getElementById('task-id').value;
    const estimatedTimeValue = document.getElementById('task-estimated-time').value.replace(',', '.');
    const recurrenceRule = document.getElementById('task-recurrence-rule').value;
    const recurrenceEndDate = document.getElementById('task-recurrence-end-date').value;
    const dueDateValue = document.getElementById('task-due-date').value;

    const taskData = {
        id: taskId || undefined,
        customer: document.getElementById('task-customer').value,
        name: document.getElementById('task-name').value.trim(),
        description: document.getElementById('task-description').value.trim(),
        status: document.getElementById('task-status').value,
        priority: document.getElementById('task-priority').value || null,
        dueDate: dueDateValue || null,
        estimatedTime: estimatedTimeValue !== '' ? parseFloat(estimatedTimeValue) : null,
        user: currentUserSuffix,
        recurrenceRule: recurrenceRule === 'Aldri' ? null : recurrenceRule,
        recurrenceEndDate: (recurrenceRule !== 'Aldri' && recurrenceEndDate) ? recurrenceEndDate : null
    };

    if (!taskData.customer || !taskData.name) { alert("Kunde og oppgavenavn må fylles ut."); return; }
    if (taskData.estimatedTime !== null && (isNaN(taskData.estimatedTime) || taskData.estimatedTime < 0)) {
         alert("Estimert tid må være et positivt tall eller stå tomt."); return;
    }
    if (taskData.recurrenceRule && !taskData.dueDate) {
        alert("Frist (startdato) må settes for gjentakende oppgaver."); return;
    }

    isSubmittingTask = true;
    taskData.action = taskId ? 'updateTask' : 'addTask';
    const saveButton = document.getElementById('save-task-btn');
    if(saveButton) { saveButton.disabled = true; saveButton.textContent = 'Lagrer...';}

    postDataToScript_Tasks(taskData)
        .then(response => {
            if (response.success) {
                closeModal('taskModal');
                return fetchTasks_Tasks().then(() => { 
                    if (currentView_Tasks === 'kanban') {
                        renderTaskBoard_Tasks();
                    } else {
                        initializeOrUpdateCalendar_Tasks(); // Oppdater kalender med nye frist-baserte data
                        // Vurder om du også vil kjøre scheduleDailyTasks() her hvis en oppgave som påvirker dagen ble endret.
                    }
                });
            } else {
                throw new Error(response.message || 'Ukjent feil ved lagring fra server');
            }
        })
        .catch(error => {
            alert(`Kunne ikke lagre oppgave: ${error.message}`);
        })
        .finally(() => {
            isSubmittingTask = false;
            if (saveButton){
                 saveButton.disabled = false;
                 saveButton.textContent = taskId ? 'Lagre Endringer' : 'Lagre Oppgave';
            }
        });
}

// --- Slettefunksjoner ---
function confirmDeleteTask_Tasks(taskId, taskName) {
    if (!taskId || !taskName) return;
    const modal = document.getElementById('confirmDeleteTaskModal');
    const nameEl = document.getElementById('delete-task-name-modal');
    const idEl = document.getElementById('delete-task-id-modal');

    if (modal && nameEl && idEl) {
        nameEl.textContent = taskName;
        idEl.value = taskId;
        modal.style.display = 'block';
    } else {
        if (confirm(`Er du sikker på at du vil slette oppgaven "${taskName}"?`)) {
            const tempIdEl = document.getElementById('delete-task-id-modal');
            if (tempIdEl) tempIdEl.value = taskId;
            deleteTask_Tasks();
        }
    }
}

function deleteTask_Tasks() {
    if (isDeletingTask) return;
    const taskIdEl = document.getElementById('delete-task-id-modal');
    const taskId = taskIdEl ? taskIdEl.value : null;
    if (!taskId) { closeModal('confirmDeleteTaskModal'); return; }

    isDeletingTask = true;
    const deleteButton = document.getElementById('confirm-delete-task-btn');
    const cancelButton = document.querySelector('#confirmDeleteTaskModal .cancel-btn');
    if (deleteButton) deleteButton.disabled = true;
    if (cancelButton) cancelButton.disabled = true;

    const dataToSend = { action: 'deleteTask', taskId: taskId, user: currentUserSuffix };
    postDataToScript_Tasks(dataToSend)
        .then(response => {
            if (response.success) {
                allTasks = allTasks.filter(task => task.id !== taskId);
                if (currentView_Tasks === 'kanban') {
                    renderTaskBoard_Tasks();
                } else {
                     initializeOrUpdateCalendar_Tasks(); // Oppdaterer kalender (fjerner frist-basert)
                     // Fjern også eventuelle automatisk planlagte hendelser for denne slettede oppgaven
                     if(calendarInstance) {
                        const events = calendarInstance.getEvents();
                        events.forEach(event => {
                            if (String(event.id).includes(`scheduled-${taskId}-`)) {
                                event.remove();
                            }
                        });
                     }
                }
            } else { throw new Error(response.message || "Ukjent feil ved sletting på server."); }
        })
        .catch(error => alert(`Kunne ikke slette oppgave: ${error.message}`))
        .finally(() => {
            isDeletingTask = false;
            if (deleteButton) deleteButton.disabled = false;
            if (cancelButton) cancelButton.disabled = false;
            closeModal('confirmDeleteTaskModal');
            if(taskIdEl) taskIdEl.value = '';
        });
}

// --- Drag and Drop (Kanban) & Kalender ---
function handleDragStart_Tasks(event) {
    if (!event.target.classList.contains('task-card')) return;
    draggedTaskId = event.target.getAttribute('data-task-id');
    setTimeout(() => event.target.classList.add('dragging'), 0);
}

function handleDragEnd_Tasks(event) {
    if (event.target.classList.contains('task-card')) {
        event.target.classList.remove('dragging');
    }
    document.querySelectorAll('.kanban-column .task-list.drag-over')
            .forEach(list => list.classList.remove('drag-over'));
    draggedTaskId = null;
}

function handleDragOver_Tasks(event) {
    event.preventDefault();
    const targetList = event.currentTarget;
    if(targetList.classList.contains('task-list')){
        targetList.classList.add('drag-over');
        event.dataTransfer.dropEffect = 'move';
    }
}

function handleDragLeave_Tasks(event) {
    const targetList = event.currentTarget;
    if (targetList.classList.contains('task-list') && !targetList.contains(event.relatedTarget)) {
        targetList.classList.remove('drag-over');
    }
}

function handleDrop_Tasks(event) {
    event.preventDefault();
    const targetList = event.currentTarget;
    if (!targetList.classList.contains('task-list')) return;
    targetList.classList.remove('drag-over');
    const targetColumn = targetList.closest('.kanban-column');
    const newStatus = targetColumn?.getAttribute('data-status');
    const droppedOnCard = event.target.closest('.task-card');

    if (newStatus && draggedTaskId) {
        const taskCard = document.querySelector(`.task-card[data-task-id='${draggedTaskId}']`);
        if (!taskCard) { draggedTaskId = null; return; }
        const currentStatus = taskCard.closest('.kanban-column')?.getAttribute('data-status');
        if (newStatus !== currentStatus) {
            if(droppedOnCard && droppedOnCard !== taskCard) {
                targetList.insertBefore(taskCard, droppedOnCard);
            } else {
                targetList.appendChild(taskCard);
            }
            updateTaskStatus_Tasks(draggedTaskId, newStatus); 
        }
    }
    draggedTaskId = null;
}

function updateTaskStatus_Tasks(taskId, newStatus) {
    console.log(`Oppdaterer status for ${taskId} til ${newStatus} (bruker: ${currentUserSuffix})`);
    const taskData = { action: 'updateTask', id: taskId, status: newStatus, user: currentUserSuffix }; 
    const taskIndex = allTasks.findIndex(t => t.id === taskId);
    let originalStatus = null;
    if (taskIndex > -1) {
        originalStatus = allTasks[taskIndex].status;
        allTasks[taskIndex].status = newStatus;
    }
    postDataToScript_Tasks(taskData) 
        .then(response => {
            if (!response.success) {
                alert(`Kunne ikke oppdatere status: ${response.message || 'Ukjent feil'}. Tilbakestiller.`);
                 if (taskIndex > -1 && originalStatus) {
                    allTasks[taskIndex].status = originalStatus;
                    if (currentView_Tasks === 'kanban') renderTaskBoard_Tasks(); 
                    else initializeOrUpdateCalendar_Tasks(); // Oppdater kalender
                 } else { 
                    fetchTasks_Tasks().then(() => {
                        if (currentView_Tasks === 'kanban') renderTaskBoard_Tasks();
                        else initializeOrUpdateCalendar_Tasks();
                    });
                 }
            } else {
                 // Suksess. Hvis i kalendervisning, oppdater farger etc.
                 if (currentView_Tasks === 'calendar') initializeOrUpdateCalendar_Tasks();
            }
        })
        .catch(error => {
             alert(`Nettverksfeil ved oppdatering av status: ${error.message}. Tilbakestiller.`);
              if (taskIndex > -1 && originalStatus) {
                 allTasks[taskIndex].status = originalStatus;
                 if (currentView_Tasks === 'kanban') renderTaskBoard_Tasks();
                 else initializeOrUpdateCalendar_Tasks();
              } else {
                 fetchTasks_Tasks().then(() => {
                    if (currentView_Tasks === 'kanban') renderTaskBoard_Tasks();
                    else initializeOrUpdateCalendar_Tasks();
                 });
              }
        });
}

function switchView_Tasks(viewToShow) {
    if (viewToShow === currentView_Tasks) return;
    const kanbanContainer = document.getElementById('task-board-container');
    const calendarContainer = document.getElementById('calendar-view-container');
    const kanbanBtn = document.getElementById('kanban-view-btn');
    const calendarBtn = document.getElementById('calendar-view-btn');
    if (!kanbanContainer || !calendarContainer || !kanbanBtn || !calendarBtn) return;
    currentView_Tasks = viewToShow;
    if (viewToShow === 'kanban') {
        kanbanContainer.style.display = 'block';
        calendarContainer.style.display = 'none';
        kanbanBtn.classList.add('active');
        calendarBtn.classList.remove('active');
        renderTaskBoard_Tasks();
    } else { // calendar
        kanbanContainer.style.display = 'none';
        calendarContainer.style.display = 'block';
        kanbanBtn.classList.remove('active');
        calendarBtn.classList.add('active');
        initializeOrUpdateCalendar_Tasks(); // Viser frist-baserte hendelser som standard
    }
    console.log(`Byttet oppgavevisning til: ${currentView_Tasks} for ${currentUserSuffix}`);
}

function initializeOrUpdateCalendar_Tasks() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) {
        console.error("Kalenderelement #calendar ikke funnet!");
        return;
    }
    
    // Denne funksjonen viser nå KUN de frist-baserte oppgavene.
    // scheduleDailyTasks() vil legge til sine egne hendelser.
    const filteredTasks = filterTasks_Tasks(allTasks);
    const formattedTasks = formatTasksForCalendar_DueDateBased_Tasks(filteredTasks);

    if (calendarInstance) { 
        calendarInstance.removeAllEvents(); // Fjern alle gamle hendelser (både frist-baserte og auto-planlagte)
        calendarInstance.addEventSource(formattedTasks); // Legg til de frist-baserte på nytt
        // Merk: Automatisk planlagte hendelser legges til separat av scheduleDailyTasks()
        // Hvis du vil at de skal vises umiddelbart etter en endring som kaller initializeOrUpdateCalendar,
        // må du kanskje kalle scheduleDailyTasks() på nytt her, eller ha en annen logikk.
        // For nå er det enklest at "Planlegg Dag" er en eksplisitt handling.
    } else {
        // Initialiser kalenderen for første gang
        try {
            calendarInstance = new FullCalendar.Calendar(calendarEl, {
                initialView: 'timeGridWeek', 
                locale: 'no',
                slotMinTime: '07:00:00', // Utvidet litt for å se marginer
                slotMaxTime: '18:00:00', 
                businessHours: {             
                    daysOfWeek: [ 1, 2, 3, 4, 5 ], 
                    startTime: `${String(WORKING_DAY_START_HOUR).padStart(2, '0')}:00`,
                    endTime: `${String(WORKING_DAY_END_HOUR).padStart(2, '0')}:00`,
                },
                allDaySlot: false, 
                headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek' },
                events: formattedTasks, // Starter med frist-baserte hendelser
                editable: true, 
                eventDrop: function(info) { // Håndterer flytting av frist-baserte hendelser
                    const taskId = info.event.id;
                    // Ignorer drag&drop for automatisk planlagte hendelser her, de bør ikke endre *frist* på denne måten
                    if (String(taskId).startsWith('scheduled-')) {
                        console.log("Automatisk planlagt hendelse flyttet, men frist endres ikke via dette drag&drop.");
                        info.revert(); // Forhindre endring av automatisk planlagte hendelser her
                        return;
                    }

                    const newStartDateTime = info.event.start; 
                    const newDueDate = newStartDateTime.toISOString().split('T')[0]; 
                    
                    console.log(`Oppgave ${taskId} ("${info.event.title}") flyttet i kalenderen til ${newDueDate}.`);

                    const taskToUpdateLocally = allTasks.find(t => t.id === taskId);
                    const oldDueDate = taskToUpdateLocally ? taskToUpdateLocally.dueDate : null;

                    if (taskToUpdateLocally && taskToUpdateLocally.dueDate === newDueDate) {
                        console.log("Dato er den samme, ingen backend-oppdatering nødvendig.");
                        return; 
                    }
                    
                    if (taskToUpdateLocally) {
                        taskToUpdateLocally.dueDate = newDueDate; 
                    }

                    const taskDataForBackend = { 
                        action: 'updateTask', 
                        id: taskId, 
                        dueDate: newDueDate, 
                        user: currentUserSuffix 
                    };
                    
                    postDataToScript_Tasks(taskDataForBackend)
                        .then(response => {
                            if (response.success) {
                                 console.log(`Frist for oppgave ${taskId} lagret i backend som ${newDueDate}.`);
                                 if (currentView_Tasks === 'kanban') renderTaskBoard_Tasks();
                                 // Kalenderen er allerede optimistisk oppdatert av FullCalendar
                            } else { 
                                console.error("Feil ved oppdatering av frist via kalender (backend):", response.message);
                                alert(`Kunne ikke lagre ny frist for oppgave "${info.event.title.replace(/^[CW]:\s*/, '').replace(/^🔄\s*/, '')}": ${response.message || 'Ukjent serverfeil'}. Endringen er tilbakestilt.`);
                                info.revert(); 
                                if(taskToUpdateLocally && oldDueDate) taskToUpdateLocally.dueDate = oldDueDate; 
                            }
                        })
                        .catch(error => { 
                            console.error("Nettverksfeil ved oppdatering av frist via kalender:", error);
                            alert(`Nettverksfeil. Kunne ikke lagre ny frist for "${info.event.title.replace(/^[CW]:\s*/, '').replace(/^🔄\s*/, '')}". Endringen er tilbakestilt.`);
                            info.revert();
                            if(taskToUpdateLocally && oldDueDate) taskToUpdateLocally.dueDate = oldDueDate; 
                        });
                },
                eventClick: function(info) { 
                    // Bruk openEditTaskModal_Tasks som nå håndterer 'scheduled-' prefiks
                    if (info.event.id) openEditTaskModal_Tasks(info.event.id); 
                },
                eventMouseEnter: showCalendarTooltip,
                eventMouseLeave: hideCalendarTooltip,
                height: 'auto', 
                contentHeight: 600, 
                nowIndicator: true, 
            });
            calendarInstance.render();
        } catch (e) { console.error("FEIL ved initialisering av FullCalendar (tasks):", e); }
    }
}

// Omdøpt for klarhet: denne formaterer basert på DUE DATE (frist)
function formatTasksForCalendar_DueDateBased_Tasks(tasks) {
    console.log(`Formaterer ${tasks.length} oppgaver for kalender (frist-basert, bruker: ${currentUserSuffix})`);
    return tasks
        .filter(task => task.dueDate) 
        .map(task => {
            const colors = getEventColorsForStatus_Tasks(task.status);
            let title = `${task.name} (${task.customer || '?'})`;
            if (task.recurrenceRule && task.recurrenceRule !== 'Aldri') {
                title = `🔄 ${title}`;
            }

            const startDate = new Date(task.dueDate); 
            startDate.setHours(DEFAULT_TASK_START_HOUR, 0, 0, 0); 

            let endDate = new Date(startDate);
            const estimatedTimeString = String(task.estimatedTime).replace(',', '.');
            const estimatedHours = parseFloat(estimatedTimeString) || DEFAULT_TASK_DURATION_HOURS; 
            
            if (!isNaN(estimatedHours) && estimatedHours > 0) {
                const durationMinutes = estimatedHours * 60;
                endDate.setMinutes(startDate.getMinutes() + durationMinutes);
            } else {
                endDate.setHours(startDate.getHours() + DEFAULT_TASK_DURATION_HOURS);
            }
            
            return {
                id: task.id, // Original task ID
                title: title,
                start: startDate.toISOString(),
                end: endDate.toISOString(),
                extendedProps: task, // Hele task objektet
                backgroundColor: colors.backgroundColor,
                borderColor: colors.borderColor,
                textColor: colors.textColor
            };
        });
}

function getEventColorsForStatus_Tasks(status) {
    let backgroundColor = 'var(--accent-primary)'; 
    let borderColor = 'var(--accent-secondary)';
    let textColor = '#ffffff'; 
    switch (status?.toLowerCase()) {
        case 'ny':      backgroundColor = '#64b5f6'; borderColor = '#42a5f5'; textColor = '#000000'; break;
        case 'pågår':   backgroundColor = 'var(--bar-yellow)'; borderColor = '#ffa000'; textColor = '#000000'; break;
        case 'venter':  backgroundColor = '#ff9800'; borderColor = '#fb8c00'; textColor = '#000000'; break;
        case 'ferdig':  backgroundColor = 'var(--bar-green)'; borderColor = '#388E3C'; textColor = '#ffffff'; break;
    }
    return { backgroundColor, borderColor, textColor };
}

// --- NY FUNKSJON FOR AUTOMATISK PLANLEGGING ---
function scheduleDailyTasks(targetDate = new Date()) {
    if (!calendarInstance) {
        alert("Kalenderen er ikke initialisert. Prøv å bytte til kalendervisning først.");
        return;
    }
    console.log("Starter automatisk planlegging for dato:", targetDate.toLocaleDateString('no-NO'));

    // 1. Filtrer oppgaver som er relevante for planlegging (ikke 'Ferdig')
    //    Bruker gjeldende kunde- og statusfilter, men overstyrer status til å inkludere alt som ikke er ferdig
    let tasksToSchedule = allTasks.filter(task => {
        const status = task.status?.toLowerCase();
        if (status === 'ferdig') return false;

        const customerMatch = currentCustomerFilter_Tasks === 'all' || task.customer === currentCustomerFilter_Tasks;
        // For planlegging, ignorer det aktive statusfilteret og ta med alle som ikke er ferdige
        // (Ny, Pågår, Venter) hvis de matcher kundefilteret.
        const relevantStatus = status === 'ny' || status === 'pågår' || status === 'venter';
        return customerMatch && relevantStatus;
    });

    // 2. Sorter oppgavene: Prioritet (Høy > Medium > Lav > Ingen), deretter Frist (tidligst først)
    tasksToSchedule.sort((a, b) => {
        const priorityOrder = { 'Høy': 1, 'Medium': 2, 'Lav': 3, '': 4 }; // Tom streng for 'Ingen' prioritet
        const priorityA = priorityOrder[a.priority || ''] || 4;
        const priorityB = priorityOrder[b.priority || ''] || 4;
        if (priorityA !== priorityB) return priorityA - priorityB;

        const dueDateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const dueDateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        if (dueDateA !== dueDateB) return dueDateA - dueDateB;
        
        // Eventuelt: Sorter på estimert tid (kortest først) som et tredje kriterium
        const estimatedTimeA = parseFloat(String(a.estimatedTime).replace(',', '.')) || Infinity;
        const estimatedTimeB = parseFloat(String(b.estimatedTime).replace(',', '.')) || Infinity;
        return estimatedTimeA - estimatedTimeB;
    });

    console.log("Oppgaver som skal planlegges (etter filtrering og sortering):", tasksToSchedule.map(t => `${t.name} (Prio: ${t.priority || 'N/A'}, Frist: ${t.dueDate || 'N/A'}, Varighet: ${t.estimatedTime || DEFAULT_TASK_DURATION_HOURS}t)`));

    // 3. Planlegg oppgavene innenfor arbeidstiden
    let currentTime = new Date(targetDate);
    currentTime.setHours(WORKING_DAY_START_HOUR, 0, 0, 0);

    const endOfWorkDay = new Date(targetDate);
    endOfWorkDay.setHours(WORKING_DAY_END_HOUR, 0, 0, 0);

    const lunchStart = new Date(targetDate);
    lunchStart.setHours(LUNCH_BREAK_START_HOUR, 0, 0, 0);
    const lunchEnd = new Date(lunchStart.getTime() + LUNCH_BREAK_DURATION_HOURS * 60 * 60000);

    let scheduledEventsForCalendar = [];

    // Fjern tidligere *automatisk planlagte* hendelser for DENNE dagen før vi legger til nye
    const currentEvents = calendarInstance.getEvents();
    const targetDateString = targetDate.toISOString().slice(0,10);
    currentEvents.forEach(event => {
        if (event.extendedProps.scheduled && event.start.toISOString().slice(0,10) === targetDateString) {
            event.remove();
        }
    });

    for (const task of tasksToSchedule) {
        const estimatedTimeString = String(task.estimatedTime).replace(',', '.');
        let taskDurationHours = parseFloat(estimatedTimeString);
        if (isNaN(taskDurationHours) || taskDurationHours <= 0) {
            taskDurationHours = DEFAULT_TASK_DURATION_HOURS; 
        }
        const taskDurationMinutes = taskDurationHours * 60;

        // Juster currentTime hvis det er inne i lunsjpausen
        if (currentTime >= lunchStart && currentTime < lunchEnd) {
            currentTime = new Date(lunchEnd);
        }
        
        let taskStartTimeCandidate = new Date(currentTime);
        let taskEndTimeCandidate = new Date(taskStartTimeCandidate.getTime() + taskDurationMinutes * 60000);

        // Håndter lunsjpause: Hvis oppgaven krysser lunsjpausen
        if (taskStartTimeCandidate < lunchEnd && taskEndTimeCandidate > lunchStart) {
            // Hvis oppgaven starter før lunsj og slutter etter lunsjstart, flytt den til etter lunsj
            currentTime = new Date(lunchEnd); // Start oppgaven etter lunsj
            taskStartTimeCandidate = new Date(currentTime);
            taskEndTimeCandidate = new Date(taskStartTimeCandidate.getTime() + taskDurationMinutes * 60000);
        }

        // Sjekk om oppgaven passer innenfor arbeidsdagen
        if (taskEndTimeCandidate <= endOfWorkDay) {
            const colors = getEventColorsForStatus_Tasks(task.status);
            let title = `Autom: ${task.name} (${task.customer || '?'})`;
            if (task.recurrenceRule && task.recurrenceRule !== 'Aldri') {
                title = `🔄 ${title}`;
            }

            scheduledEventsForCalendar.push({
                id: `scheduled-${task.id}-${targetDateString}-${taskStartTimeCandidate.getTime()}`, // Mer unik ID
                title: title,
                start: taskStartTimeCandidate.toISOString(),
                end: taskEndTimeCandidate.toISOString(),
                extendedProps: { ...task, scheduled: true, originalId: task.id }, // Legg til flagg og original ID
                backgroundColor: colors.backgroundColor,
                borderColor: colors.borderColor,
                textColor: colors.textColor,
                editable: false // Gjør automatisk planlagte hendelser ikke-flyttbare som standard
            });
            currentTime = new Date(taskEndTimeCandidate); // Oppdater for neste oppgave
        } else {
            console.log(`Oppgave "${task.name}" (${taskDurationHours}t) kunne ikke planlegges fullstendig i dag (etter kl. ${currentTime.toLocaleTimeString()}). Resterende tid: ${(endOfWorkDay - currentTime)/(1000*60*60)}t`);
            // Vurder å bryte løkken hvis det ikke er mer tid, eller logge de som ikke fikk plass.
        }
    }

    // 4. Visualiser de planlagte oppgavene i kalenderen
    if (calendarInstance && scheduledEventsForCalendar.length > 0) {
        calendarInstance.addEventSource(scheduledEventsForCalendar);
        console.log(`${scheduledEventsForCalendar.length} oppgaver ble automatisk planlagt og lagt til i kalenderen for ${targetDateString}.`);
        alert(`${scheduledEventsForCalendar.length} oppgaver ble forsøkt planlagt for i dag. Sjekk kalenderen for resultatet.`);
    } else if (scheduledEventsForCalendar.length === 0 && tasksToSchedule.length > 0) {
        console.log("Ingen oppgaver kunne planlegges innenfor tidsrammen for", targetDateString);
        alert("Ingen av de aktuelle oppgavene kunne planlegges innenfor den gjenværende arbeidstiden i dag.");
    } else {
        console.log("Ingen oppgaver å planlegge eller kalender ikke klar.");
        alert("Ingen oppgaver funnet for planlegging, eller kalenderen er ikke klar.");
    }
    return scheduledEventsForCalendar;
}
