// tasks.js (Oppdatert for brukerbytte, gjentakende oppgaver, sletting og interaktiv kalender med tidsestimat)

// GOOGLE_SCRIPT_URL hentes globalt fra script.js

// --- Globale variabler ---
let allTasks = [];
let allCustomersForTasks = [];
let currentCustomerFilter_Tasks = 'all';
let currentStatusFilter_Tasks = 'open';
let calendarInstance = null;
let currentView_Tasks = 'kanban';
let draggedTaskId = null;
let isSubmittingTask = false;
let isDeletingTask = false;
let customTooltip = null;
const DEFAULT_TASK_START_HOUR = 8; // Starter arbeidsdagen kl. 08:00
const DEFAULT_TASK_DURATION_HOURS = 1; // Hvis estimert tid mangler

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
        } else { // Fallback til "Ny"-kolonnen
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
    if (task.estimatedTime) estimatedTimeHtml = `<span class="task-estimated" title="Estimert tid">⏱️ ${parseFloat(task.estimatedTime).toFixed(1)} t</span>`;
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
    document.getElementById('task-estimated-time').value = (task.estimatedTime !== null && task.estimatedTime !== undefined) ? task.estimatedTime : '1.5';
    
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
    const estimatedTimeValue = document.getElementById('task-estimated-time').value;
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
        estimatedTime: estimatedTimeValue !== '' ? estimatedTimeValue : null,
        user: currentUserSuffix,
        recurrenceRule: recurrenceRule === 'Aldri' ? null : recurrenceRule,
        recurrenceEndDate: (recurrenceRule !== 'Aldri' && recurrenceEndDate) ? recurrenceEndDate : null
    };

    if (!taskData.customer || !taskData.name) { alert("Kunde og oppgavenavn må fylles ut."); return; }
    if (estimatedTimeValue !== '' && (isNaN(parseFloat(estimatedTimeValue)) || parseFloat(estimatedTimeValue) < 0)) {
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
                return fetchTasks_Tasks().then(() => { // Hent oppdatert liste
                    if (currentView_Tasks === 'kanban') renderTaskBoard_Tasks();
                    else initializeOrUpdateCalendar_Tasks();
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
                if (currentView_Tasks === 'kanban') renderTaskBoard_Tasks();
                else initializeOrUpdateCalendar_Tasks();
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

// --- Drag and Drop (Kanban) & Kalender (Oppdatert for interaktivitet) ---
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
                    renderTaskBoard_Tasks(); // Re-render for å vise korrekt status
                 } else { // Hvis vi ikke fant den lokalt, hent alt på nytt
                    fetchTasks_Tasks().then(renderTaskBoard_Tasks);
                 }
            } else {
                // Suksess, den optimistiske oppdateringen er korrekt.
            }
        })
        .catch(error => {
             alert(`Nettverksfeil ved oppdatering av status: ${error.message}. Tilbakestiller.`);
              if (taskIndex > -1 && originalStatus) {
                 allTasks[taskIndex].status = originalStatus;
                 renderTaskBoard_Tasks();
              } else {
                 fetchTasks_Tasks().then(renderTaskBoard_Tasks);
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
        initializeOrUpdateCalendar_Tasks();
    }
    console.log(`Byttet oppgavevisning til: ${currentView_Tasks} for ${currentUserSuffix}`);
}

function initializeOrUpdateCalendar_Tasks() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) {
        console.error("Kalenderelement #calendar ikke funnet!");
        return;
    }
    
    const filteredTasks = filterTasks_Tasks(allTasks);
    const formattedTasks = formatTasksForCalendar_Simple_Tasks(filteredTasks);

    if (calendarInstance) { // Hvis kalenderen allerede er initialisert, bare oppdater hendelsene
        calendarInstance.removeAllEvents();
        calendarInstance.addEventSource(formattedTasks);
        return;
    }

    // Initialiser kalenderen for første gang
    try {
        calendarInstance = new FullCalendar.Calendar(calendarEl, {
            initialView: 'timeGridWeek', // Standardvisning er nå uke med tid
            locale: 'no',
            slotMinTime: '08:00:00',     // Vis tidslinje fra kl. 08:00
            slotMaxTime: '17:00:00',     // Vis tidslinje til kl. 17:00 (dekker 08-16 arbeidsdag)
            businessHours: {             // Definerer typisk arbeidstid (valgfritt, for visuell indikasjon)
                daysOfWeek: [ 1, 2, 3, 4, 5 ], // Mandag - Fredag
                startTime: '08:00',
                endTime: '16:00',
            },
            allDaySlot: false, // Skjul "hele dagen"-raden
            headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek' },
            events: formattedTasks,
            editable: true, // Tillat dra-og-slipp
            eventDrop: function(info) {
                const taskId = info.event.id;
                const newStartDateTime = info.event.start; 
                const newDueDate = newStartDateTime.toISOString().split('T')[0]; 
                
                console.log(`Oppgave ${taskId} ("${info.event.title}") flyttet i kalenderen til ${newDueDate}.`);

                const taskToUpdateLocally = allTasks.find(t => t.id === taskId);
                const oldDueDate = taskToUpdateLocally ? taskToUpdateLocally.dueDate : null;

                if (taskToUpdateLocally && taskToUpdateLocally.dueDate === newDueDate) {
                    console.log("Dato er den samme, ingen backend-oppdatering nødvendig (tid ikke sjekket).");
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
                             // Siden den lokale 'allTasks' er oppdatert, vil neste render av Kanban
                             // eller kalender (hvis den hentes på nytt) reflektere dette.
                             if (currentView_Tasks === 'kanban') {
                                 renderTaskBoard_Tasks();
                             }
                             // For å være helt sikker på at kalenderen har den nyeste dataen fra server
                             // (hvis backend gjør andre justeringer enn bare dato), kan man kalle fetchTasks_Tasks() her.
                             // Men for nå, antar vi at backend kun oppdaterer datoen.
                        } else { 
                            console.error("Feil ved oppdatering av frist via kalender (backend):", response.message);
                            alert(`Kunne ikke lagre ny frist for oppgave "${info.event.title.replace(/^[CW]:\s*/, '').replace(/^🔄\s*/, '')}": ${response.message || 'Ukjent serverfeil'}. Endringen er tilbakestilt.`);
                            info.revert(); 
                            if(taskToUpdateLocally && oldDueDate) {
                                taskToUpdateLocally.dueDate = oldDueDate; 
                            }
                        }
                    })
                    .catch(error => { 
                        console.error("Nettverksfeil ved oppdatering av frist via kalender:", error);
                        alert(`Nettverksfeil. Kunne ikke lagre ny frist for "${info.event.title.replace(/^[CW]:\s*/, '').replace(/^🔄\s*/, '')}". Endringen er tilbakestilt.`);
                        info.revert();
                        if(taskToUpdateLocally && oldDueDate) {
                            taskToUpdateLocally.dueDate = oldDueDate; 
                        }
                    });
            },
            eventClick: function(info) { 
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

function formatTasksForCalendar_Simple_Tasks(tasks) {
    console.log(`Formaterer ${tasks.length} oppgaver for kalender (bruker: ${currentUserSuffix})`);
    return tasks
        .filter(task => task.dueDate) // Krever en startdato
        .map(task => {
            const colors = getEventColorsForStatus_Tasks(task.status);
            let title = `${task.name} (${task.customer || '?'})`;
            if (task.recurrenceRule && task.recurrenceRule !== 'Aldri') {
                title = `🔄 ${title}`;
            }

            const startDate = new Date(task.dueDate); 
            startDate.setHours(DEFAULT_TASK_START_HOUR, 0, 0, 0); 

            let endDate = new Date(startDate);
            // Håndter komma i estimert tid
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
                extendedProps: task,
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
