// tasks.js (Oppdatert for brukerbytte og gjentakende oppgaver)

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

// --- Initialisering ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("Tasks DOM lastet.");
    if (typeof currentUserSuffix === 'undefined') {
        console.warn("currentUserSuffix ikke definert i tasks.js. Fallback.");
        // eslint-disable-next-line no-global-assign
        currentUserSuffix = localStorage.getItem('currentUserSuffix') || 'C';
    }
    if (typeof GOOGLE_SCRIPT_URL === 'undefined' || !GOOGLE_SCRIPT_URL) {
       alert("KRITISK FEIL: GOOGLE_SCRIPT_URL er ikke tilgjengelig (sjekk script.js)!");
       return;
    }
    updateCurrentDateHeader_Tasks();
    setupEventListeners_Tasks(); // Inkluderer nå lytter for recurrence dropdown
    fetchInitialData_Tasks();
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
    window.addEventListener('click', function(event) {
        const taskModal = document.getElementById('taskModal');
        if (taskModal && taskModal.style.display === 'block' && event.target === taskModal) {
            closeModal('taskModal');
        }
    });
    document.querySelectorAll('.kanban-column .task-list').forEach(list => {
        list.addEventListener('dragover', handleDragOver_Tasks);
        list.addEventListener('dragleave', handleDragLeave_Tasks);
        list.addEventListener('drop', handleDrop_Tasks);
    });

    // Event listener for recurrence rule dropdown i #taskModal
    const recurrenceRuleDropdown = document.getElementById('task-recurrence-rule');
    const recurrenceEndDateGroup = document.getElementById('task-recurrence-end-date-group');
    if (recurrenceRuleDropdown && recurrenceEndDateGroup) {
        recurrenceRuleDropdown.addEventListener('change', function() {
            if (this.value && this.value !== 'Aldri') {
                recurrenceEndDateGroup.style.display = 'block';
            } else {
                recurrenceEndDateGroup.style.display = 'none';
                document.getElementById('task-recurrence-end-date').value = '';
            }
        });
    }
}

// --- Datahenting og UI-oppdatering (mye er som før, men med brukerkontekst) ---
function updateCurrentDateHeader_Tasks() { /* ... (som før) ... */ 
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const displayElement = document.getElementById('current-date');
    if(displayElement) displayElement.textContent = now.toLocaleDateString('no-NO', options);
}
function showLoadingIndicator_Tasks(isLoading) { /* ... (som før) ... */ 
    const board = document.getElementById('task-board');
    const placeholder = board?.querySelector('.kanban-column[data-status="Ny"] .task-list .task-placeholder');
    if (placeholder) {
        placeholder.textContent = isLoading ? "Laster oppgaver..." : "Ingen oppgaver funnet.";
        placeholder.style.display = isLoading || allTasks.length === 0 ? 'block' : 'none';
    }
    document.getElementById('calendar-view-container')?.classList.toggle('loading', isLoading);
}

function fetchInitialData_Tasks() {
    // ... (som før, bruker global currentUserSuffix)
    if (typeof currentUserSuffix === 'undefined') {
        console.error("fetchInitialData_Tasks: currentUserSuffix ikke definert.");
        // eslint-disable-next-line no-global-assign
        currentUserSuffix = localStorage.getItem('currentUserSuffix') || 'C';
    }
    console.log(`Henter initiale data for oppgaver (bruker: ${currentUserSuffix})...`);
    showLoadingIndicator_Tasks(true);

    Promise.all([
        fetchCustomersForTasks_Tasks(),
        fetchTasks_Tasks()
    ])
    .then(() => {
        console.log(`Kunder og oppgaver hentet for ${currentUserSuffix}.`);
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
function fetchCustomersForTasks_Tasks() { /* ... (som før, sender user) ... */ 
    return fetchDataFromScript_Tasks({ action: 'getCustomers', user: currentUserSuffix })
        .then(data => {
            if (data.success && Array.isArray(data.customers)) {
                allCustomersForTasks = data.customers.sort((a, b) => a.name.localeCompare(b.name, 'no'));
            } else {
                allCustomersForTasks = [];
            }
            return allCustomersForTasks;
        })
        .catch(error => {
            allCustomersForTasks = []; return allCustomersForTasks;
        });
}
function fetchTasks_Tasks() { /* ... (som før, sender user) ... */ 
    return fetchDataFromScript_Tasks({ action: 'getTasks', user: currentUserSuffix })
        .then(data => {
            if (data.success && Array.isArray(data.tasks)) {
                allTasks = data.tasks; // Inkluderer nå recurrenceRule og recurrenceEndDate fra backend
            } else {
                allTasks = [];
                throw new Error(data.message || `Kunne ikke hente oppgaveliste for ${currentUserSuffix}`);
            }
            return allTasks;
        });
}
function fetchDataFromScript_Tasks(params) { /* ... (som før) ... */ 
    const urlParams = new URLSearchParams(params);
    urlParams.append('nocache', Date.now());
    const url = `${GOOGLE_SCRIPT_URL}?${urlParams.toString()}`;
    console.log(`Henter data for ${params.user} (tasks):`, url);
    return fetch(url)
        .then(response => {
            if (!response.ok) {
                 return response.text().then(text => { throw new Error(text || `Nettverksfeil: ${response.status}`); });
            }
            return response.json();
        });
}
function postDataToScript_Tasks(data) { /* ... (som før) ... */ 
    console.log(`Sender POST-data for ${data.user} (tasks):`, data);
    const formData = new FormData();
    for (const key in data) {
        formData.append(key, (data[key] === null || data[key] === undefined) ? '' : data[key]);
    }
    return fetch(GOOGLE_SCRIPT_URL, { method: 'POST', body: formData })
    .then(response => response.json());
}

function populateCustomerFilter_Tasks() { /* ... (som før) ... */ 
    const select = document.getElementById('customer-filter');
    if (!select) return;
    const previousValue = select.value;
    while (select.options.length > 1) select.remove(1);
    allCustomersForTasks.forEach(customer => {
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
function renderTaskBoard_Tasks() { /* ... (som før) ... */ 
    console.log(`Rendrer Kanban-tavle for ${currentUserSuffix}...`);
    const board = document.getElementById('task-board');
    if (!board) return;

    board.querySelectorAll('.task-list').forEach(list => {
        const placeholderHTML = list.closest('.kanban-column[data-status="Ny"]')
                             ? '<div class="task-placeholder">Laster...</div>' : '';
        list.innerHTML = placeholderHTML;
    });

    let filteredTasks = filterTasks_Tasks(allTasks); 
    console.log(`Viser ${filteredTasks.length} av ${allTasks.length} oppgaver for ${currentUserSuffix} etter filter.`);

    filteredTasks.sort((a, b) => { 
        const dateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const dateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return dateA - dateB;
    });

    const nyPlaceholder = board.querySelector('.kanban-column[data-status="Ny"] .task-list .task-placeholder');
    if (nyPlaceholder) {
        nyPlaceholder.textContent = "Ingen oppgaver funnet.";
        nyPlaceholder.style.display = filteredTasks.length === 0 ? 'block' : 'none';
    }

    filteredTasks.forEach(task => {
        const card = createTaskCardElement_Tasks(task); 
        const columnList = board.querySelector(`.kanban-column[data-status="${task.status}"] .task-list`);
        if (columnList) {
             if (task.status === "Ny") {
                 const placeholder = columnList.querySelector('.task-placeholder');
                 if (placeholder) placeholder.style.display = 'none';
             }
            columnList.appendChild(card);
        } else {
            const nyKolonneList = board.querySelector('.kanban-column[data-status="Ny"] .task-list');
            const placeholder = nyKolonneList?.querySelector('.task-placeholder');
            if (placeholder) placeholder.style.display = 'none';
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

    let dueDateHtml = ''; /* ... (som før) ... */
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
    let estimatedTimeHtml = ''; /* ... (som før) ... */
    if (task.estimatedTime !== null && task.estimatedTime !== undefined && task.estimatedTime > 0) {
         estimatedTimeHtml = `
            <span class="task-estimated" title="Estimert tid">
                ⏱️ ${parseFloat(task.estimatedTime).toFixed(1)} t
            </span>`;
    }
    // NYTT: Visuell indikator for gjentakende oppgave
    let recurrenceHtml = '';
    if (task.recurrenceRule && task.recurrenceRule !== 'Aldri') {
        recurrenceHtml = `<span class="task-recurrence" title="Gjentakende: ${task.recurrenceRule}">🔄</span>`;
    }

    card.innerHTML = `
        <h4>${recurrenceHtml} ${task.name || 'Ukjent oppgave'}</h4>
        <div class="task-meta">
            <span class="task-customer" title="Kunde">👤 ${task.customer || 'Ingen'}</span>
            ${dueDateHtml}
            ${estimatedTimeHtml}
            ${task.priority ? `<span title="Prioritet">${getPriorityIcon_Tasks(task.priority)} ${task.priority}</span>` : ''}
        </div>
    `;
    card.addEventListener('dragstart', handleDragStart_Tasks);
    card.addEventListener('dragend', handleDragEnd_Tasks);
    card.addEventListener('click', () => openEditTaskModal_Tasks(task.id));
    return card;
}
function getPriorityIcon_Tasks(priority) { /* ... (som før) ... */ 
    switch (priority?.toLowerCase()) {
        case 'høy': return '🔴'; case 'medium': return '🟡'; case 'lav': return '🔵'; default: return '';
    }
}
function handleCustomerFilterChange_Tasks(event) { /* ... (som før) ... */ 
    currentCustomerFilter_Tasks = event.target.value;
    if (currentView_Tasks === 'kanban') renderTaskBoard_Tasks();
    else initializeOrUpdateCalendar_Tasks();
}
function handleStatusFilterChange_Tasks(event) { /* ... (som før) ... */ 
    const clickedButton = event.target;
    document.querySelectorAll('.status-filter-btn.active').forEach(btn => btn.classList.remove('active'));
    clickedButton.classList.add('active');
    currentStatusFilter_Tasks = clickedButton.getAttribute('data-status');
    if (currentView_Tasks === 'kanban') renderTaskBoard_Tasks();
    else initializeOrUpdateCalendar_Tasks();
}
function filterTasks_Tasks(tasksToFilter) { /* ... (som før) ... */ 
    return tasksToFilter.filter(task => {
        const customerMatch = currentCustomerFilter_Tasks === 'all' || task.customer === currentCustomerFilter_Tasks;
        let statusMatch = false;
        const taskStatusLower = task.status?.toLowerCase();
        if (currentStatusFilter_Tasks === 'all') {
            statusMatch = true;
        } else if (currentStatusFilter_Tasks === 'open') {
            statusMatch = taskStatusLower === 'ny' || taskStatusLower === 'pågår' || taskStatusLower === 'venter'; // Inkluder 'venter'
        } else {
            statusMatch = taskStatusLower === currentStatusFilter_Tasks?.toLowerCase();
        }
        return customerMatch && statusMatch;
    });
}

// --- Modal og Lagring (Oppdatert for gjentakelse) ---
function openAddTaskModal_Tasks() {
    clearTaskModal_Tasks(); // Sørger for at gjentakelsesfelter også nullstilles
    document.getElementById('task-modal-title').textContent = 'Legg til ny oppgave';
    populateCustomerDropdown_Modal_Tasks();
    document.getElementById('taskModal').style.display = 'block';
}

function openEditTaskModal_Tasks(taskId) {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) { alert("Feil: Fant ikke oppgaven."); return; }
    
    clearTaskModal_Tasks(); // Nullstill først
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
    
    // Sett gjentakelsesfelter
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
    // Nullstill gjentakelsesfelter
    document.getElementById('task-recurrence-rule').value = 'Aldri';
    document.getElementById('task-recurrence-end-date').value = '';
    document.getElementById('task-recurrence-end-date-group').style.display = 'none';
}

function populateCustomerDropdown_Modal_Tasks() { /* ... (som før) ... */ 
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
        user: currentUserSuffix, // Bruker som eier oppgaven
        // source: 'user', // Implisitt at det er brukeren selv, ikke manager
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
                return fetchTasks_Tasks().then(() => {
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

// --- Drag and Drop & Kalender (som før) ---
function handleDragStart_Tasks(event) { /* ... (som før) ... */ 
    if (!event.target.classList.contains('task-card')) return;
    draggedTaskId = event.target.getAttribute('data-task-id');
    setTimeout(() => event.target.classList.add('dragging'), 0);
}
function handleDragEnd_Tasks(event) { /* ... (som før) ... */ 
    if (event.target.classList.contains('task-card')) {
        event.target.classList.remove('dragging');
    }
    document.querySelectorAll('.kanban-column .task-list.drag-over')
            .forEach(list => list.classList.remove('drag-over'));
    draggedTaskId = null;
}
function handleDragOver_Tasks(event) { /* ... (som før) ... */ 
    event.preventDefault();
    const targetList = event.currentTarget;
    if(targetList.classList.contains('task-list')){
        targetList.classList.add('drag-over');
        event.dataTransfer.dropEffect = 'move';
    }
}
function handleDragLeave_Tasks(event) { /* ... (som før) ... */ 
    const targetList = event.currentTarget;
    if (targetList.classList.contains('task-list') && !targetList.contains(event.relatedTarget)) {
        targetList.classList.remove('drag-over');
    }
}
function handleDrop_Tasks(event) { /* ... (som før) ... */ 
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
function updateTaskStatus_Tasks(taskId, newStatus) { /* ... (som før, sender user) ... */ 
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
                    renderTaskBoard_Tasks();
                 } else {
                    fetchTasks_Tasks().then(renderTaskBoard_Tasks);
                 }
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
function switchView_Tasks(viewToShow) { /* ... (som før) ... */ 
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
    } else {
        kanbanContainer.style.display = 'none';
        calendarContainer.style.display = 'block';
        kanbanBtn.classList.remove('active');
        calendarBtn.classList.add('active');
        initializeOrUpdateCalendar_Tasks();
    }
    console.log(`Byttet oppgavevisning til: ${currentView_Tasks} for ${currentUserSuffix}`);
}
function initializeOrUpdateCalendar_Tasks() { /* ... (som før) ... */ 
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;
    const filteredTasks = filterTasks_Tasks(allTasks); 
    const formattedTasks = formatTasksForCalendar_Simple_Tasks(filteredTasks); 

    if (!calendarInstance) {
        try {
            calendarInstance = new FullCalendar.Calendar(calendarEl, {
                initialView: 'dayGridMonth', locale: 'no',
                headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listWeek' },
                events: formattedTasks, editable: false,
                eventClick: function(info) {
                    if (info.event.id) openEditTaskModal_Tasks(info.event.id);
                },
                height: 'auto',
            });
            calendarInstance.render();
        } catch (e) {
            console.error("FEIL ved initialisering av FullCalendar (tasks):", e);
        }
    } else {
         try {
            calendarInstance.removeAllEvents();
            calendarInstance.addEventSource(formattedTasks);
         } catch (e) {
             console.error("FEIL ved oppdatering av FullCalendar events (tasks):", e);
         }
    }
}
function formatTasksForCalendar_Simple_Tasks(tasks) { /* ... (som før) ... */ 
    console.log(`Formaterer ${tasks.length} oppgaver for kalender (bruker: ${currentUserSuffix})`);
    return tasks
        .filter(task => task.dueDate)
        .map(task => {
            const colors = getEventColorsForStatus_Tasks(task.status); 
            let title = `${task.name} (${task.customer || '?'})`;
            if (task.recurrenceRule && task.recurrenceRule !== 'Aldri') {
                title = `🔄 ${title}`; // Legg til ikon for gjentakende
            }
            return {
                id: task.id, title: title, start: task.dueDate, allDay: true,
                extendedProps: task, // Inkluderer nå recurrenceRule og recurrenceEndDate
                backgroundColor: colors.backgroundColor, borderColor: colors.borderColor, textColor: colors.textColor
            };
        });
}
function getEventColorsForStatus_Tasks(status) { /* ... (som før) ... */ 
    let backgroundColor = '#7b2cbf'; let borderColor = '#9d4edd'; let textColor = '#ffffff';
    switch (status?.toLowerCase()) {
        case 'ny': backgroundColor = '#64b5f6'; borderColor = '#42a5f5'; break;
        case 'pågår': backgroundColor = '#ffc107'; borderColor = '#ffa000'; textColor = '#121212'; break;
        case 'venter': backgroundColor = '#ff9800'; borderColor = '#fb8c00'; textColor = '#121212'; break;
        case 'ferdig': backgroundColor = '#4CAF50'; borderColor = '#388E3C'; break;
    }
    return { backgroundColor, borderColor, textColor };
}

