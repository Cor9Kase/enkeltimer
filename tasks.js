// tasks.js (Revidert for dynamisk, ikke-overlappende dagplanlegging med lagring - UTEN LUNSJPAUSE - MED 'MARKER FERDIG'-KNAPP)

// GOOGLE_SCRIPT_URL hentes globalt fra script.js

// --- Globale variabler ---
let allTasks = [];
let allCustomersForTasks = [];
let currentCustomerFilter_Tasks = 'all';
let currentStatusFilter_Tasks = 'open';
let calendarInstance = null;
let currentView_Tasks = 'kanban';
let draggedTaskId = null; // For Kanban drag
let isSubmittingTask = false;
let isDeletingTask = false;
let customTooltip = null;

const DEFAULT_TASK_START_HOUR = 8; 
const DEFAULT_TASK_DURATION_HOURS = 1; 

// --- Konstanter for arbeidsdag ---
const WORKING_DAY_START_HOUR = 8;    
const WORKING_DAY_END_HOUR = 16;     
const MINIMUM_SLOT_MINUTES = 15; 

// --- Initialisering ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Tasks DOM lastet. Revidert for dynamisk planlegging (uten lunsj, med 'marker ferdig').");
    if (typeof currentUserSuffix === 'undefined') {
        console.warn("currentUserSuffix ikke definert i tasks.js. Fallback.");
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
        const dayFullMsg = document.getElementById('day-full-message');
        if (dayFullMsg && dayFullMsg.style.display !== 'none' && !dayFullMsg.contains(event.target)) {
            hideDayFullMessage();
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

    // Event listener for "Marker ferdig"-knapper i kalenderen (bruker event delegation)
    const calendarEl = document.getElementById('calendar');
    if (calendarEl) {
        calendarEl.addEventListener('click', function(event) {
            const completeButton = event.target.closest('.calendar-task-complete-btn');
            if (completeButton) {
                event.preventDefault(); // Forhindre andre klikkhandlinger på eventet
                event.stopPropagation(); // Forhindre at klikket bobler videre
                const taskId = completeButton.dataset.taskId;
                if (taskId) {
                    console.log(`Marker ferdig (kalender) klikket for oppgave: ${taskId}`);
                    updateTaskStatus_Tasks(taskId, 'Ferdig');
                }
            }
        });
    }
}

// --- Melding for full dag ---
function showDayFullMessage(message) {
    const msgElement = document.getElementById('day-full-message');
    if (msgElement) {
        msgElement.textContent = message || "Dagen er full! Flytt oppgaven til en annen dag eller juster andre oppgaver.";
        msgElement.style.display = 'block';
        setTimeout(hideDayFullMessage, 5000); 
    } else {
        alert(message || "Dagen er full! Flytt oppgaven til en annen dag eller juster andre oppgaver.");
    }
}
function hideDayFullMessage() {
    const msgElement = document.getElementById('day-full-message');
    if (msgElement) msgElement.style.display = 'none';
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
    // Hindre tooltip hvis man hoverer over "marker ferdig"-knappen
    if (eventInfo.jsEvent && eventInfo.jsEvent.target && eventInfo.jsEvent.target.closest('.calendar-task-complete-btn')) {
        hideCalendarTooltip();
        return;
    }

    if (!customTooltip) createCustomTooltipElement();
    const task = eventInfo.event.extendedProps.originalTask || eventInfo.event.extendedProps; 
    let title = eventInfo.event.title.replace(/^[CW]:\s*/, '').replace(/^🔄\s*/, '');
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
    
    if (eventInfo.event.start && eventInfo.event.extendedProps.isScheduledExplicitly) { 
        content += `<br><em style="color: var(--accent-secondary); font-size: 0.85em;">Planlagt tid</em>`;
        content += `<br><span style="font-size:0.8em;">${eventInfo.event.start.toLocaleTimeString('no-NO', {hour: '2-digit', minute:'2-digit'})} - ${eventInfo.event.end ? eventInfo.event.end.toLocaleTimeString('no-NO', {hour: '2-digit', minute:'2-digit'}) : ''}</span>`;
    } else if (task.dueDate) {
         content += `<br><span style="font-size:0.8em;">Frist: ${new Date(task.dueDate).toLocaleDateString('no-NO')}</span>`;
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
            initializeOrUpdateCalendar_Tasks(); 
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
            if (data.success && Array.isArray(data.tasks)) {
                allTasks = data.tasks.map(task => ({
                    ...task,
                    scheduledStart: task.scheduledStart && !isNaN(new Date(task.scheduledStart)) ? new Date(task.scheduledStart).toISOString() : null, 
                    scheduledEnd: task.scheduledEnd && !isNaN(new Date(task.scheduledEnd)) ? new Date(task.scheduledEnd).toISOString() : null
                }));
            } else {
                allTasks = [];
                if (!data.success) {
                     throw new Error(data.message || `Kunne ikke hente oppgaveliste for ${currentUserSuffix}`);
                }
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

    filteredTasks.sort((a, b) => {
        const dueDateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const dueDateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        if (dueDateA !== dueDateB) return dueDateA - dueDateB;
        const priorityOrder = { 'Høy': 1, 'Medium': 2, 'Lav': 3, '': 4 };
        const priorityA = priorityOrder[a.priority || ''] || 4;
        const priorityB = priorityOrder[b.priority || ''] || 4;
        return priorityA - priorityB;
    });

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
        dueDateHtml = `<span class="task-due-date ${isOverdue ? 'overdue' : ''}" title="Frist/Dato">📅 ${new Date(task.dueDate).toLocaleDateString('no-NO', { day: 'numeric', month: 'short' })}${isOverdue ? ' (Forfalt)' : (daysUntilDue <= 7 ? ` (${daysUntilDue} d)` : '')}</span>`;
    }
    let estimatedTimeHtml = ''; 
    if (task.estimatedTime) estimatedTimeHtml = `<span class="task-estimated" title="Estimert tid">⏱️ ${parseFloat(String(task.estimatedTime).replace(',', '.')).toFixed(1)} t</span>`;
    let recurrenceHtml = (task.recurrenceRule && task.recurrenceRule !== 'Aldri') ? `<span class="task-recurrence" title="Gjentakende: ${task.recurrenceRule}">🔄</span>` : '';

    // Container for knapper (slett og marker ferdig)
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'task-card-buttons';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'task-delete-btn';
    deleteBtn.innerHTML = '🗑️'; 
    deleteBtn.title = 'Slett oppgave';
    deleteBtn.onclick = (e) => { e.stopPropagation(); confirmDeleteTask_Tasks(task.id, task.name); };
    buttonsContainer.appendChild(deleteBtn);

    // NY KNAPP: Marker som ferdig
    if (task.status?.toLowerCase() !== 'ferdig') { // Vis kun hvis ikke allerede ferdig
        const completeBtn = document.createElement('button');
        completeBtn.className = 'task-complete-btn'; // Bruk samme klasse som i kalenderen for konsistent styling
        completeBtn.innerHTML = '✅'; // Eller et annet ikon
        completeBtn.title = 'Marker som ferdig';
        completeBtn.dataset.taskId = task.id; // Lagre ID for enkel tilgang
        completeBtn.onclick = (e) => {
            e.stopPropagation(); // Forhindre at kortet åpnes for redigering
            console.log(`Marker ferdig (kanban) klikket for oppgave: ${task.id}`);
            updateTaskStatus_Tasks(task.id, 'Ferdig');
        };
        buttonsContainer.appendChild(completeBtn);
    }


    const h4 = document.createElement('h4');
    const titleSpan = document.createElement('span');
    titleSpan.className = 'task-title-text';
    titleSpan.innerHTML = `${recurrenceHtml} ${task.name || 'Ukjent oppgave'}`;
    h4.appendChild(titleSpan);
    h4.appendChild(buttonsContainer); // Legg til knappe-containeren i h4

    const metaDiv = document.createElement('div');
    metaDiv.className = 'task-meta';
    metaDiv.innerHTML = `<span class="task-customer" title="Kunde">👤 ${task.customer || 'Ingen'}</span>${dueDateHtml}${estimatedTimeHtml}${task.priority ? `<span title="Prioritet">${getPriorityIcon_Tasks(task.priority)} ${task.priority}</span>` : ''}`;
    
    card.appendChild(h4);
    card.appendChild(metaDiv);

    card.addEventListener('dragstart', handleDragStart_Tasks);
    card.addEventListener('dragend', handleDragEnd_Tasks);
    card.addEventListener('click', (e) => {
        // Sjekk om klikket var på en av knappene
        if (e.target.closest('.task-delete-btn') || e.target.closest('.task-complete-btn')) {
            return; // Ikke åpne modal hvis en knapp ble trykket
        }
        openEditTaskModal_Tasks(task.id);
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
    else initializeOrUpdateCalendar_Tasks();
}

function handleStatusFilterChange_Tasks(event) {
    const clickedButton = event.target;
    document.querySelectorAll('.status-filter-btn.active').forEach(btn => btn.classList.remove('active'));
    clickedButton.classList.add('active');
    currentStatusFilter_Tasks = clickedButton.getAttribute('data-status');
    if (currentView_Tasks === 'kanban') renderTaskBoard_Tasks();
    else initializeOrUpdateCalendar_Tasks();
}

function filterTasks_Tasks(tasksToFilter) { 
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
    const task = allTasks.find(t => t.id === taskId);
    if (!task) { alert("Feil: Fant ikke oppgaven."); return; }
    
    clearTaskModal_Tasks();
    document.getElementById('task-modal-title').textContent = 'Rediger oppgave';
    populateCustomerDropdown_Modal_Tasks();

    document.getElementById('task-id').value = task.id;
    document.getElementById('task-customer').value = task.customer;
    document.getElementById('task-name').value = task.name;
    document.getElementById('task-description').value = task.description || '';
    document.getElementById('task-status').value = task.status;
    document.getElementById('task-priority').value = task.priority || '';
    document.getElementById('task-due-date').value = task.dueDate || ''; 
    document.getElementById('task-estimated-time').value = (task.estimatedTime !== null && task.estimatedTime !== undefined) ? String(task.estimatedTime).replace(',', '.') : ''; 
    
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
    document.getElementById('task-estimated-time').value = ''; 
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

async function handleSaveTask_Tasks() {
    if (isSubmittingTask) return;
    hideDayFullMessage(); 

    const taskId = document.getElementById('task-id').value;
    const estimatedTimeStr = document.getElementById('task-estimated-time').value.replace(',', '.');
    const dueDateValue = document.getElementById('task-due-date').value; 
    
    let taskData = {
        id: taskId || undefined,
        customer: document.getElementById('task-customer').value,
        name: document.getElementById('task-name').value.trim(),
        description: document.getElementById('task-description').value.trim(),
        status: document.getElementById('task-status').value,
        priority: document.getElementById('task-priority').value || null,
        dueDate: dueDateValue || null, 
        estimatedTime: estimatedTimeStr !== '' ? parseFloat(estimatedTimeStr) : null,
        user: currentUserSuffix,
        recurrenceRule: document.getElementById('task-recurrence-rule').value === 'Aldri' ? null : document.getElementById('task-recurrence-rule').value,
        recurrenceEndDate: (document.getElementById('task-recurrence-rule').value !== 'Aldri' && document.getElementById('task-recurrence-end-date').value) ? document.getElementById('task-recurrence-end-date').value : null,
        scheduledStart: null, 
        scheduledEnd: null
    };

    if (!taskData.customer || !taskData.name) { alert("Kunde og oppgavenavn må fylles ut."); return; }
    if (taskData.estimatedTime !== null && (isNaN(taskData.estimatedTime) || taskData.estimatedTime <= 0) && taskData.dueDate) {
         alert("Estimert tid må være et positivt tall (større enn 0) hvis en dato er satt for planlegging, eller stå tomt."); return;
    }
     if (taskData.estimatedTime === null && taskData.dueDate) {
        console.log("Lagrer oppgave med frist, men uten estimert tid. Ingen spesifikk tid vil bli planlagt.");
    }
    if (taskData.recurrenceRule && !taskData.dueDate) {
        alert("Frist (startdato) må settes for gjentakende oppgaver."); return;
    }

    if (taskData.dueDate && taskData.estimatedTime && taskData.estimatedTime > 0) {
        const taskDurationHours = taskData.estimatedTime;
        const targetDate = new Date(taskData.dueDate); 
        targetDate.setHours(0,0,0,0); 

        const slotInfo = findBestSlotForTask(targetDate, taskDurationHours, taskId || null);

        if (slotInfo.slotFound) {
            taskData.scheduledStart = slotInfo.start.toISOString();
            taskData.scheduledEnd = slotInfo.end.toISOString();
        } else {
            const existingTask = taskId ? allTasks.find(t => t.id === taskId) : null;
            if (existingTask && existingTask.scheduledStart && new Date(existingTask.scheduledStart).toISOString().split('T')[0] !== taskData.dueDate) {
                taskData.scheduledStart = null;
                taskData.scheduledEnd = null;
                showDayFullMessage(slotInfo.message || `Dagen ${targetDate.toLocaleDateString('no-NO')} er full. Oppgaven lagres med fristen, men uten spesifikk planlagt tid.`);
            } else if (!existingTask || !existingTask.scheduledStart) { 
                showDayFullMessage(slotInfo.message || `Dagen ${targetDate.toLocaleDateString('no-NO')} er full. Oppgaven lagres med fristen, men uten spesifikk planlagt tid.`);
                taskData.scheduledStart = null;
                taskData.scheduledEnd = null;
            } else {
                taskData.scheduledStart = null;
                taskData.scheduledEnd = null;
                 showDayFullMessage(slotInfo.message || `Dagen ${targetDate.toLocaleDateString('no-NO')} er full. Oppgaven lagres med fristen, men uten spesifikk planlagt tid.`);
            }
        }
    } else { 
        const existingTask = taskId ? allTasks.find(t => t.id === taskId) : null;
        if (existingTask && (existingTask.scheduledStart || existingTask.scheduledEnd)) {
            taskData.scheduledStart = null;
            taskData.scheduledEnd = null;
        }
    }

    isSubmittingTask = true;
    taskData.action = taskId ? 'updateTask' : 'addTask';
    const saveButton = document.getElementById('save-task-btn');
    if(saveButton) { saveButton.disabled = true; saveButton.textContent = 'Lagrer...';}

    postDataToScript_Tasks(taskData)
        .then(response => {
            if (response.success) {
                closeModal('taskModal');
                return fetchInitialData_Tasks(); 
            } else {
                throw new Error(response.message || 'Ukjent feil ved lagring fra server');
            }
        })
        .catch(error => {
            alert(`Kunne ikke lagre oppgave: ${error.message}`);
            fetchInitialData_Tasks(); 
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
                closeModal('confirmDeleteTaskModal');
                if (currentView_Tasks === 'kanban') {
                    renderTaskBoard_Tasks();
                } else {
                     initializeOrUpdateCalendar_Tasks(); 
                }
            } else { throw new Error(response.message || "Ukjent feil ved sletting på server."); }
        })
        .catch(error => alert(`Kunne ikke slette oppgave: ${error.message}`))
        .finally(() => {
            isDeletingTask = false;
            if (deleteButton) deleteButton.disabled = false;
            if (cancelButton) cancelButton.disabled = false;
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
    
    if (newStatus.toLowerCase() === 'ferdig') {
        const task = allTasks.find(t => t.id === taskId);
        if (task && (task.scheduledStart || task.scheduledEnd)) {
            taskData.scheduledStart = null;
            taskData.scheduledEnd = null;
        }
    }

    const taskIndex = allTasks.findIndex(t => t.id === taskId);
    let originalTaskData = null;
    if (taskIndex > -1) {
        originalTaskData = { ...allTasks[taskIndex] }; 
        allTasks[taskIndex].status = newStatus;
        if (newStatus.toLowerCase() === 'ferdig') {
            allTasks[taskIndex].completedDate = new Date().toISOString().split('T')[0];
            allTasks[taskIndex].scheduledStart = null; 
            allTasks[taskIndex].scheduledEnd = null;
        } else {
            allTasks[taskIndex].completedDate = null;
        }
    }

    postDataToScript_Tasks(taskData) 
        .then(response => {
            if (!response.success) {
                alert(`Kunne ikke oppdatere status: ${response.message || 'Ukjent feil'}. Tilbakestiller.`);
                 if (taskIndex > -1 && originalTaskData) {
                    allTasks[taskIndex] = originalTaskData; 
                 }
                 fetchInitialData_Tasks(); 
            } else {
                 if (currentView_Tasks === 'kanban') renderTaskBoard_Tasks();
                 else initializeOrUpdateCalendar_Tasks();
            }
        })
        .catch(error => {
             alert(`Nettverksfeil ved oppdatering av status: ${error.message}. Tilbakestiller.`);
              if (taskIndex > -1 && originalTaskData) {
                 allTasks[taskIndex] = originalTaskData;
              }
              fetchInitialData_Tasks(); 
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
        initializeOrUpdateCalendar_Tasks(); 
    }
    console.log(`Byttet oppgavevisning til: ${currentView_Tasks} for ${currentUserSuffix}`);
}

// --- Hjelpefunksjoner for Kalenderlogikk ---

/**
 * Finner den beste ledige plassen for en oppgave på en gitt dag.
 * Tar hensyn til arbeidstid og andre allerede planlagte oppgaver. Lunsj er fjernet.
 * @param {Date} targetDate - Dagen oppgaven skal plasseres.
 * @param {number} taskDurationHours - Oppgavens varighet i timer.
 * @param {string|null} ignoreTaskId - ID-en til oppgaven som flyttes/redigeres.
 * @param {Date|null} earliestStartTime - Tidligste starttidspunkt for søket (brukes ved "dytting").
 * @returns {object} { slotFound: boolean, start?: Date, end?: Date, message?: string }
 */
function findBestSlotForTask(targetDate, taskDurationHours, ignoreTaskId = null, earliestStartTime = null) {
    const dayStart = new Date(targetDate);
    dayStart.setHours(WORKING_DAY_START_HOUR, 0, 0, 0);

    const dayEnd = new Date(targetDate);
    dayEnd.setHours(WORKING_DAY_END_HOUR, 0, 0, 0);

    const taskDurationMs = taskDurationHours * 60 * 60 * 1000;

    const otherTasksOnDay = allTasks.filter(task => {
        if (task.id === ignoreTaskId) return false;
        if (!task.scheduledStart || !task.scheduledEnd) return false; 
        const taskScheduledDate = new Date(task.scheduledStart);
        return taskScheduledDate.getFullYear() === targetDate.getFullYear() &&
               taskScheduledDate.getMonth() === targetDate.getMonth() &&
               taskScheduledDate.getDate() === targetDate.getDate();
    }).sort((a, b) => new Date(a.scheduledStart) - new Date(b.scheduledStart));

    let currentTime = earliestStartTime ? new Date(earliestStartTime) : new Date(dayStart);
    // Sørg for at currentTime ikke er før arbeidsdagens start
    if (currentTime < dayStart) currentTime = new Date(dayStart);


    while (currentTime.getTime() < dayEnd.getTime()) {
        let potentialStart = new Date(currentTime);
        let potentialEnd = new Date(potentialStart.getTime() + taskDurationMs);
        
        if (potentialEnd > dayEnd) {
            return { slotFound: false, message: "Ikke nok tid igjen på arbeidsdagen." };
        }

        let collision = false;
        for (const existingTask of otherTasksOnDay) {
            const existingStart = new Date(existingTask.scheduledStart);
            const existingEnd = new Date(existingTask.scheduledEnd);
            if (potentialStart < existingEnd && potentialEnd > existingStart) {
                collision = true;
                currentTime = new Date(existingEnd); 
                break; 
            }
        }

        if (!collision) {
            let totalHoursForDayExcludingCurrent = 0;
            otherTasksOnDay.forEach(ot => {
                totalHoursForDayExcludingCurrent += (new Date(ot.scheduledEnd).getTime() - new Date(ot.scheduledStart).getTime()) / (60 * 60 * 1000);
            });
            const totalHoursWithNewTask = totalHoursForDayExcludingCurrent + taskDurationHours;
            const maxWorkHours = WORKING_DAY_END_HOUR - WORKING_DAY_START_HOUR; 

            if (totalHoursWithNewTask > maxWorkHours + 0.01) { 
                currentTime.setMinutes(currentTime.getMinutes() + MINIMUM_SLOT_MINUTES); 
                continue;
            }
            return { slotFound: true, start: potentialStart, end: potentialEnd };
        }
        
        if (collision && currentTime.getTime() <= potentialStart.getTime()) { 
             currentTime.setMinutes(currentTime.getMinutes() + MINIMUM_SLOT_MINUTES);
        } else if (!collision) { 
            currentTime.setMinutes(currentTime.getMinutes() + MINIMUM_SLOT_MINUTES);
        }
    }
    return { slotFound: false, message: "Ingen passende ledig tid funnet på dagen." };
}


function initializeOrUpdateCalendar_Tasks() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) {
        console.error("Kalenderelement #calendar ikke funnet!");
        return;
    }
    
    const eventsToShow = [];
    const filteredTasks = filterTasks_Tasks(allTasks);

    const tasksForCalendar = [...filteredTasks].sort((a,b) => {
        const startA = a.scheduledStart ? new Date(a.scheduledStart).getTime() : (a.dueDate ? new Date(a.dueDate).setHours(DEFAULT_TASK_START_HOUR,0,0,0) : Infinity);
        const startB = b.scheduledStart ? new Date(b.scheduledStart).getTime() : (b.dueDate ? new Date(b.dueDate).setHours(DEFAULT_TASK_START_HOUR,0,0,0) : Infinity);
        if (startA !== startB) return startA - startB;
        const priorityOrder = { 'Høy': 1, 'Medium': 2, 'Lav': 3, '': 4 };
        return (priorityOrder[a.priority || ''] || 4) - (priorityOrder[b.priority || ''] || 4);
    });


    tasksForCalendar.forEach(task => {
        if (task.scheduledStart && task.scheduledEnd && !isNaN(new Date(task.scheduledStart)) && !isNaN(new Date(task.scheduledEnd))) { 
            const colors = getEventColorsForStatus_Tasks(task.status);
            let title = task.name; 
            if (task.recurrenceRule && task.recurrenceRule !== 'Aldri') title = `🔄 ${title}`;
            
            eventsToShow.push({
                id: task.id, 
                title: title,
                start: task.scheduledStart, 
                end: task.scheduledEnd,     
                extendedProps: { ...task, isScheduledExplicitly: true, originalTask: task }, 
                backgroundColor: colors.backgroundColor,
                borderColor: colors.borderColor,
                textColor: colors.textColor,
                editable: true 
            });
        } else if (task.dueDate) { 
            const fristEvent = formatSingleTaskForDueDateCalendar(task); 
            if (fristEvent) eventsToShow.push(fristEvent);
        }
    });

    if (calendarInstance) { 
        calendarInstance.removeAllEvents(); 
        calendarInstance.addEventSource(eventsToShow); 
    } else {
        try {
            calendarInstance = new FullCalendar.Calendar(calendarEl, {
                initialView: 'timeGridWeek', 
                locale: 'no',
                slotMinTime: '07:00:00', 
                slotMaxTime: '18:00:00', 
                businessHours: {             
                    daysOfWeek: [ 1, 2, 3, 4, 5 ], 
                    startTime: `${String(WORKING_DAY_START_HOUR).padStart(2, '0')}:00`,
                    endTime: `${String(WORKING_DAY_END_HOUR).padStart(2, '0')}:00`,
                },
                allDaySlot: false, 
                headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek' },
                events: eventsToShow, 
                editable: true, 
                eventContent: function(arg) { // For å legge til "Marker ferdig"-knapp
                    let eventEl = document.createElement('div');
                    eventEl.classList.add('fc-event-main-custom'); // Custom class for styling
                
                    let titleEl = document.createElement('div');
                    titleEl.classList.add('fc-event-title-custom');
                    titleEl.innerHTML = arg.event.title; // Bruk FullCalendar's formaterte tittel
                
                    eventEl.appendChild(titleEl);
                
                    // Legg til "Marker ferdig"-knapp hvis oppgaven ikke er ferdig
                    const task = arg.event.extendedProps.originalTask || arg.event.extendedProps;
                    if (task.status?.toLowerCase() !== 'ferdig') {
                        let completeButton = document.createElement('button');
                        completeButton.className = 'calendar-task-complete-btn';
                        completeButton.innerHTML = '✅';
                        completeButton.title = 'Marker som ferdig';
                        completeButton.dataset.taskId = task.id; 
                        // Klikk-håndtering gjøres via event delegation i setupEventListeners_Tasks
                        eventEl.appendChild(completeButton);
                    }
                
                    return { domNodes: [eventEl] };
                },
                eventDrop: async function(info) { 
                    hideDayFullMessage(); 
                    const droppedTaskId = info.event.id;
                    const taskBeingDropped = allTasks.find(t => t.id === droppedTaskId);

                    if (!taskBeingDropped) {
                        console.error("Fant ikke oppgaven som ble flyttet:", droppedTaskId);
                        info.revert();
                        return;
                    }

                    const taskDurationHours = parseFloat(String(taskBeingDropped.estimatedTime).replace(',', '.')) || DEFAULT_TASK_DURATION_HOURS;
                    if (taskDurationHours <= 0) {
                        alert("Kan ikke planlegge oppgave uten gyldig varighet (må være > 0).");
                        info.revert();
                        return;
                    }

                    const targetDate = new Date(info.event.start); 
                    targetDate.setHours(0,0,0,0); 
                    
                    let slotInfo = findBestSlotForTask(targetDate, taskDurationHours, droppedTaskId);
                    let tasksToPotentiallyReArrange = []; // For å holde styr på oppgaver som må dyttes

                    if (!slotInfo.slotFound) {
                        // Enkel "dytt"-logikk: Hvis den droppede oppgaven overlapper med andre,
                        // prøv å flytte de andre *etter* den droppede oppgaven.
                        const tasksOnTargetDay = allTasks.filter(t => 
                            t.id !== droppedTaskId && 
                            t.scheduledStart && 
                            new Date(t.scheduledStart).toDateString() === targetDate.toDateString()
                        ).sort((a,b) => new Date(a.scheduledStart) - new Date(b.scheduledStart));

                        // Forsøk å plassere den droppede oppgaven først på den ønskede starttiden fra drag
                        let proposedStartForDropped = new Date(info.event.start);
                        let proposedEndForDropped = new Date(proposedStartForDropped.getTime() + taskDurationHours * 3600000);
                        
                        // Sjekk om denne initielle plasseringen er innenfor arbeidsdagen
                        const dayWorkEnd = new Date(targetDate);
                        dayWorkEnd.setHours(WORKING_DAY_END_HOUR, 0, 0, 0);
                        if (proposedEndForDropped > dayWorkEnd) {
                            showDayFullMessage("Den foreslåtte tiden for oppgaven er utenfor arbeidsdagen. Flytting tilbakestilt.");
                            info.revert();
                            return;
                        }
                        
                        slotInfo = { slotFound: true, start: proposedStartForDropped, end: proposedEndForDropped };
                        
                        // Nå, sjekk kollisjoner og planlegg re-arrangering
                        let nextAvailableTime = new Date(proposedEndForDropped);

                        for (const otherTask of tasksOnTargetDay) {
                            if (otherTask.id === droppedTaskId) continue; // Hopp over selve oppgaven som flyttes

                            const otherTaskStart = new Date(otherTask.scheduledStart);
                            const otherTaskEnd = new Date(otherTask.scheduledEnd);
                            const otherTaskDuration = (otherTaskEnd.getTime() - otherTaskStart.getTime()) / 3600000;

                            // Hvis den andre oppgaven overlapper med den *nye* plasseringen av den droppede oppgaven,
                            // eller starter før den droppede oppgaven er ferdig
                            if (otherTaskStart < proposedEndForDropped && otherTaskEnd > proposedStartForDropped) {
                                // Denne oppgaven må flyttes
                                const newSlotForOther = findBestSlotForTask(targetDate, otherTaskDuration, otherTask.id, nextAvailableTime);
                                if (newSlotForOther.slotFound) {
                                    tasksToPotentiallyReArrange.push({
                                        id: otherTask.id,
                                        originalStart: otherTask.scheduledStart,
                                        originalEnd: otherTask.scheduledEnd,
                                        newStart: newSlotForOther.start.toISOString(),
                                        newEnd: newSlotForOther.end.toISOString(),
                                        dueDate: newSlotForOther.start.toISOString().split('T')[0]
                                    });
                                    nextAvailableTime = new Date(newSlotForOther.end); // Oppdater neste ledige tid
                                } else {
                                    // Kunne ikke finne plass til en oppgave som måtte dyttes, avbryt hele operasjonen
                                    showDayFullMessage(`Kunne ikke omorganisere oppgaven "${otherTask.name}" for å lage plass. Flytting tilbakestilt.`);
                                    info.revert();
                                    return; // Avbryt
                                }
                            }
                        }
                    }


                    if (slotInfo.slotFound) {
                        const taskDataForBackend = {
                            action: 'updateTask',
                            id: droppedTaskId,
                            user: currentUserSuffix,
                            scheduledStart: slotInfo.start.toISOString(),
                            scheduledEnd: slotInfo.end.toISOString(),
                            dueDate: slotInfo.start.toISOString().split('T')[0] 
                        };

                        const taskIndex = allTasks.findIndex(t => t.id === droppedTaskId);
                        let oldTaskState = null;
                        if(taskIndex > -1) {
                            oldTaskState = {...allTasks[taskIndex]}; 
                            allTasks[taskIndex].scheduledStart = slotInfo.start.toISOString();
                            allTasks[taskIndex].scheduledEnd = slotInfo.end.toISOString();
                            allTasks[taskIndex].dueDate = slotInfo.start.toISOString().split('T')[0];
                        }
                        
                        // Oppdater også de dyttede oppgavene i allTasks
                        tasksToPotentiallyReArrange.forEach(reArranged => {
                            const idx = allTasks.findIndex(t => t.id === reArranged.id);
                            if (idx > -1) {
                                allTasks[idx].scheduledStart = reArranged.newStart;
                                allTasks[idx].scheduledEnd = reArranged.newEnd;
                                allTasks[idx].dueDate = reArranged.dueDate;
                            }
                        });

                        initializeOrUpdateCalendar_Tasks(); // Re-render for å vise alle endringer korrekt

                        // Lagre den droppede oppgaven
                        const mainSavePromise = postDataToScript_Tasks(taskDataForBackend);
                        // Lagre de dyttede oppgavene
                        const rearrangeSavePromises = tasksToPotentiallyReArrange.map(reArranged => {
                            return postDataToScript_Tasks({
                                action: 'updateTask', id: reArranged.id, user: currentUserSuffix,
                                scheduledStart: reArranged.newStart, scheduledEnd: reArranged.newEnd,
                                dueDate: reArranged.dueDate
                            });
                        });

                        try {
                            const results = await Promise.all([mainSavePromise, ...rearrangeSavePromises]);
                            const allSuccessful = results.every(res => res.success);

                            if (allSuccessful) {
                                console.log(`Oppgave ${droppedTaskId} og ${tasksToPotentiallyReArrange.length} andre oppgaver flyttet og lagret.`);
                                // En siste fetch for å være helt sikker på synkronisering etter komplekse operasjoner
                                // fetchInitialData_Tasks(); 
                            } else {
                                showDayFullMessage(`En eller flere lagringer feilet under omorganisering. Noen endringer kan være tilbakestilt.`);
                                console.error("Feil under lagring av omorganiserte oppgaver:", results);
                                // Mer kompleks tilbakestilling kan være nødvendig her
                                fetchInitialData_Tasks(); // Hent alt på nytt for å korrigere
                            }
                        } catch (error) {
                            showDayFullMessage(`Nettverksfeil under lagring av omorganisering. Prøver å gjenopprette.`);
                            console.error("Nettverksfeil ved lagring av omorganiserte oppgaver:", error);
                            fetchInitialData_Tasks();
                        }
                    } else {
                        showDayFullMessage(slotInfo.message || "Ingen passende ledig tid funnet, eller dagen er full. Flytting tilbakestilt.");
                        info.revert(); 
                    }
                },
                eventClick: function(info) { 
                    // Ikke åpne modal hvis "marker ferdig"-knappen ble trykket
                    if (info.jsEvent.target.closest('.calendar-task-complete-btn')) {
                        return;
                    }
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


// Hjelpefunksjon for å formatere ENKELT task-objekt for frist-basert visning (default tid)
function formatSingleTaskForDueDateCalendar(task) {
    if (!task.dueDate) return null;

    const colors = getEventColorsForStatus_Tasks(task.status);
    let title = `${task.name}`; 
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
        id: task.id, 
        title: title,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        extendedProps: { ...task, isScheduledExplicitly: false, originalTask: task }, 
        backgroundColor: colors.backgroundColor,
        borderColor: colors.borderColor,
        textColor: colors.textColor,
        editable: true 
    };
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
        default: 
            backgroundColor = '#9e9e9e'; borderColor = '#757575'; textColor = '#ffffff'; break;
    }
    return { backgroundColor, borderColor, textColor };
}
