// manager-dashboard.js

// currentUserSuffix er globalt definert i theme.js
// GOOGLE_SCRIPT_URL er globalt definert i script.js

let managerFocusUser = localStorage.getItem('managerDashboardFocus') || 'all';
let allManagerTasksC = [];
let allManagerTasksW = [];
let allManagerTimeLogsC = [];
let allManagerTimeLogsW = [];
let customersForUserC = [];
let customersForUserW = [];

let loggedHoursChartInstance = null;
let taskStatusChartInstance = null;
let openTasksDistributionChartInstance = null;
let managerCalendarInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    console.log("Manager Dashboard DOM lastet.");

    if (typeof currentUserSuffix === 'undefined') {
        console.warn("currentUserSuffix ikke definert. Fallback til localStorage.");
        // eslint-disable-next-line no-global-assign
        currentUserSuffix = localStorage.getItem('currentUserSuffix') || 'C';
    }
    
    const assigneeDropdown = document.getElementById('new-task-assignee');
    if (assigneeDropdown) {
        assigneeDropdown.value = currentUserSuffix;
    }
    
    setManagerFocus(managerFocusUser, false); 
    setupManagerEventListeners();
    fetchAllDataForDashboard(); 

    const dateEl = document.getElementById('current-date');
    if (dateEl) {
        const now = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateEl.textContent = now.toLocaleDateString('no-NO', options);
    }
});

function setupManagerEventListeners() {
    document.getElementById('user-btn-c')?.addEventListener('click', () => setManagerFocus('C'));
    document.getElementById('user-btn-w')?.addEventListener('click', () => setManagerFocus('W'));
    document.getElementById('user-btn-all')?.addEventListener('click', () => setManagerFocus('all'));

    // ENDRET: Lytter nå til den nye knappen som er flyttet ut
    document.getElementById('open-create-task-modal-btn')?.addEventListener('click', openManagerCreateTaskModal);

    // Knappen inne i modalen har fortsatt samme ID og vil kalle handleSubmitNewTask
    document.getElementById('submit-new-task-btn')?.addEventListener('click', handleSubmitNewTask);
    
    document.getElementById('new-task-assignee')?.addEventListener('change', populateManagerCustomerDropdown);
    document.getElementById('task-overview-status-filter')?.addEventListener('change', renderQuickTaskOverview);
    document.getElementById('refresh-button')?.addEventListener('click', fetchAllDataForDashboard);
    document.getElementById('show-task-admin-btn')?.addEventListener('click', () => showViewManager('task-admin'));
    document.getElementById('show-calendar-view-btn')?.addEventListener('click', () => showViewManager('calendar'));
}

function openManagerCreateTaskModal() {
    const modal = document.getElementById('managerCreateTaskModal');
    if (modal) {
        const assigneeDropdown = document.getElementById('new-task-assignee');
        if (assigneeDropdown) {
            if (managerFocusUser === 'C' || managerFocusUser === 'W') {
                assigneeDropdown.value = managerFocusUser;
            } else {
                assigneeDropdown.value = currentUserSuffix || 'C'; 
            }
            populateManagerCustomerDropdown(); 
        }
        const statusEl = document.getElementById('new-task-status');
        if(statusEl) statusEl.textContent = '';
        document.getElementById('new-task-name').value = '';
        document.getElementById('new-task-estimated-time').value = '';
        document.getElementById('new-task-due-date').value = '';
        document.getElementById('new-task-priority').value = '';
        // La kunde-dropdown være som den er, da den oppdateres av populateManagerCustomerDropdown

        modal.style.display = 'block';
        console.log("ManagerCreateTaskModal åpnet.");
    } else {
        console.error("Modal #managerCreateTaskModal ikke funnet.");
    }
}

// ... (resten av JavaScript-funksjonene forblir som i forrige versjon)
// setManagerFocus, fetchAllDataForDashboard, showLoadingState, fetchDataFromScript_Manager,
// renderDashboard, updateSectionTitles, renderStats, updateProgressBar, renderDueTasksList,
// renderQuickTaskOverview, populateManagerCustomerDropdown, handleSubmitNewTask,
// renderCharts, renderLoggedHoursChart, renderTaskStatusChart, renderOpenTasksDistributionChart,
// showViewManager, initializeManagerCalendar

function setManagerFocus(focusUser, reloadData = true) {
    managerFocusUser = focusUser;
    localStorage.setItem('managerDashboardFocus', managerFocusUser);
    console.log(`Manager dashboard fokus satt til: ${managerFocusUser}`);

    document.querySelectorAll('.user-selection-actions .user-switch-btn').forEach(btn => btn.classList.remove('active'));
    if (focusUser === 'C') document.getElementById('user-btn-c')?.classList.add('active');
    else if (focusUser === 'W') document.getElementById('user-btn-w')?.classList.add('active');
    else document.getElementById('user-btn-all')?.classList.add('active');
    
    const assigneeDropdown = document.getElementById('new-task-assignee');
    if (assigneeDropdown) {
        if (focusUser === 'C' || focusUser === 'W') {
            assigneeDropdown.value = focusUser;
        }
        populateManagerCustomerDropdown(); 
    }
    
    if (reloadData) {
        renderDashboard();
    }
}

async function fetchAllDataForDashboard() {
    console.log("Henter all data for manager dashboard...");
    showLoadingState(true);
    try {
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        const commonParamsMonth = { month: currentMonth, year: currentYear };

        const [
            timeLogsCRes, tasksCRes, customersCRes,
            timeLogsWRes, tasksWRes, customersWRes
        ] = await Promise.all([
            fetchDataFromScript_Manager({ action: 'getTimeLog', user: 'C', ...commonParamsMonth }),
            fetchDataFromScript_Manager({ action: 'getTasks', user: 'C' }),
            fetchDataFromScript_Manager({ action: 'getCustomers', user: 'C' }),
            fetchDataFromScript_Manager({ action: 'getTimeLog', user: 'W', ...commonParamsMonth }),
            fetchDataFromScript_Manager({ action: 'getTasks', user: 'W' }),
            fetchDataFromScript_Manager({ action: 'getCustomers', user: 'W' })
        ]);

        allManagerTimeLogsC = timeLogsCRes.success ? timeLogsCRes.timeLog : [];
        allManagerTasksC = tasksCRes.success ? tasksCRes.tasks : [];
        customersForUserC = customersCRes.success ? customersCRes.customers : [];

        allManagerTimeLogsW = timeLogsWRes.success ? timeLogsWRes.timeLog : [];
        allManagerTasksW = tasksWRes.success ? tasksWRes.tasks : [];
        customersForUserW = customersWRes.success ? customersWRes.customers : [];

        console.log("All data hentet.");
        populateManagerCustomerDropdown(); 
        renderDashboard();
    } catch (error) {
        console.error("Feil ved henting av dashboard data:", error);
        document.getElementById('stats-hours-total').textContent = "Feil";
    } finally {
        showLoadingState(false);
    }
}

function showLoadingState(isLoading) {
    const elementsToUpdate = [
        'stats-hours-c', 'stats-hours-w', 'stats-hours-total',
        'stats-open-tasks-c', 'stats-open-tasks-w', 'stats-completed-tasks-month',
        'allocated-hours-c', 'allocated-hours-w',
        'completed-tasks-c-month', 'completed-tasks-w-month',
        'stats-estimated-hours-c', 'stats-estimated-hours-w'
    ];
    if (isLoading) {
        elementsToUpdate.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = "Laster...";
        });
        document.getElementById('task-list-manager').innerHTML = "<p>Laster oppgaver...</p>";
        document.getElementById('due-tasks-list').innerHTML = "<p>Laster oppgaver...</p>";
        document.querySelectorAll('.chart-container canvas').forEach(canvas => {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        });
    }
}

function fetchDataFromScript_Manager(params) {
    const urlParams = new URLSearchParams(params);
    urlParams.append('nocache', Date.now());
    const url = `${GOOGLE_SCRIPT_URL}?${urlParams.toString()}`;
    console.log(`Manager Fetch: ${url}`);
    return fetch(url)
        .then(response => {
            if (!response.ok) {
                return response.text().then(text => { throw new Error(`Nettverksfeil (${response.status}): ${text}`); });
            }
            return response.json();
        })
        .catch(error => {
            console.error(`Feil i fetchDataFromScript_Manager for params:`, params, error);
            return { success: false, message: error.message, data: null };
        });
}

function renderDashboard() {
    updateSectionTitles();
    renderStats();
    renderDueTasksList();
    renderQuickTaskOverview(); 
    renderCharts();
    if (document.getElementById('calendar-view-manager')?.style.display !== 'none') {
        initializeManagerCalendar();
    }
}

function updateSectionTitles() {
    const focusText = managerFocusUser === 'C' ? 'Cornelius' : managerFocusUser === 'W' ? 'William' : 'Begge';
    document.getElementById('stats-section-title').innerHTML = `Nøkkeltall (Denne Måned) - <span>${focusText}</span>`;
    document.getElementById('charts-section-title').innerHTML = `Visuell Oversikt - <span>${focusText}</span>`;
    document.getElementById('due-tasks-section-title').innerHTML = `Oppgaver Nær/Over Frist - <span>${focusText}</span>`;
    document.getElementById('quick-task-overview-title').innerHTML = `Hurtigoversikt Oppgaver (<span id="task-overview-user">${focusText}</span>)`;
    document.getElementById('calendar-view-title').innerHTML = `Oppgavekalender - <span>${focusText}</span>`;
}

function renderStats() {
    console.log(`Rendrer statistikk for fokus: ${managerFocusUser}`);
    const updateStatCard = (id, value, subtext = null) => { 
        const el = document.getElementById(id);
        if (el) el.textContent = value;
        if (subtext !== null) {
            const subEl = el?.closest('.stat-card')?.querySelector('small');
            if (subEl) subEl.innerHTML = subtext;
        }
    };
    const setFocusClass = (cardId, isActive) => { 
        document.getElementById(cardId)?.classList.toggle('inactive-focus', !isActive);
    };

    let totalHoursC = 0; allManagerTimeLogsC.forEach(day => totalHoursC += day.totalHours);
    let allocatedC = 0; customersForUserC.forEach(cust => allocatedC += (cust.allocatedHours || 0));
    const openTasksC = allManagerTasksC.filter(t => t.status?.toLowerCase() !== 'ferdig');
    let estimatedHoursOpenC = 0; openTasksC.forEach(t => estimatedHoursOpenC += (t.estimatedTime || 0));
    const completedTasksCMonth = allManagerTasksC.filter(t => t.status?.toLowerCase() === 'ferdig' && new Date(t.completedDate).getMonth() === new Date().getMonth()).length;

    let totalHoursW = 0; allManagerTimeLogsW.forEach(day => totalHoursW += day.totalHours);
    let allocatedW = 0; customersForUserW.forEach(cust => allocatedW += (cust.allocatedHours || 0));
    const openTasksW = allManagerTasksW.filter(t => t.status?.toLowerCase() !== 'ferdig');
    let estimatedHoursOpenW = 0; openTasksW.forEach(t => estimatedHoursOpenW += (t.estimatedTime || 0));
    const completedTasksWMonth = allManagerTasksW.filter(t => t.status?.toLowerCase() === 'ferdig' && new Date(t.completedDate).getMonth() === new Date().getMonth()).length;

    const showC = managerFocusUser === 'C' || managerFocusUser === 'all';
    const showW = managerFocusUser === 'W' || managerFocusUser === 'all';

    setFocusClass('stat-card-hours-c', showC);
    if (showC) {
        updateStatCard('stats-hours-c', totalHoursC.toFixed(1) + " t", `Av tildelt: ${allocatedC.toFixed(1)} t`);
        updateProgressBar('progress-hours-c', totalHoursC, allocatedC);
    } else { updateStatCard('stats-hours-c', "- t", `Av tildelt: - t`); updateProgressBar('progress-hours-c', 0,0); }

    setFocusClass('stat-card-open-tasks-c', showC);
    if (showC) updateStatCard('stats-open-tasks-c', openTasksC.length); else updateStatCard('stats-open-tasks-c', "-");
    
    setFocusClass('stat-card-estimated-c', showC);
    if (showC) updateStatCard('stats-estimated-hours-c', estimatedHoursOpenC.toFixed(1) + " t"); else updateStatCard('stats-estimated-hours-c', "- t");

    setFocusClass('stat-card-hours-w', showW);
    if (showW) {
        updateStatCard('stats-hours-w', totalHoursW.toFixed(1) + " t", `Av tildelt: ${allocatedW.toFixed(1)} t`);
        updateProgressBar('progress-hours-w', totalHoursW, allocatedW);
    } else { updateStatCard('stats-hours-w', "- t", `Av tildelt: - t`); updateProgressBar('progress-hours-w', 0,0); }

    setFocusClass('stat-card-open-tasks-w', showW);
    if (showW) updateStatCard('stats-open-tasks-w', openTasksW.length); else updateStatCard('stats-open-tasks-w', "-");

    setFocusClass('stat-card-estimated-w', showW);
    if (showW) updateStatCard('stats-estimated-hours-w', estimatedHoursOpenW.toFixed(1) + " t"); else updateStatCard('stats-estimated-hours-w', "- t");

    if (managerFocusUser === 'C') {
        updateStatCard('stats-hours-total', totalHoursC.toFixed(1) + " t");
        updateStatCard('stats-completed-tasks-month', completedTasksCMonth, `C: ${completedTasksCMonth}`);
    } else if (managerFocusUser === 'W') {
        updateStatCard('stats-hours-total', totalHoursW.toFixed(1) + " t");
        updateStatCard('stats-completed-tasks-month', completedTasksWMonth, `W: ${completedTasksWMonth}`);
    } else { 
        updateStatCard('stats-hours-total', (totalHoursC + totalHoursW).toFixed(1) + " t");
        updateStatCard('stats-completed-tasks-month', completedTasksCMonth + completedTasksWMonth, `C: ${completedTasksCMonth} / W: ${completedTasksWMonth}`);
    }
    setFocusClass('stat-card-hours-total', true); 
    setFocusClass('stat-card-completed-tasks', true);
}

function updateProgressBar(elementId, currentValue, maxValue) {
    const progressBar = document.getElementById(elementId);
    if (!progressBar) return;
    let percentage = 0;
    if (maxValue > 0) {
        percentage = Math.min(100, (currentValue / maxValue) * 100);
    } else if (currentValue > 0) {
        percentage = 100;
    }
    progressBar.style.width = percentage + '%';
    progressBar.classList.remove('green', 'yellow', 'red');
    if (maxValue === 0 && currentValue > 0) {
        progressBar.style.backgroundColor = 'var(--bar-red)';
    } else if (percentage >= 95) {
        progressBar.classList.add('red');
    } else if (percentage >= 70) {
        progressBar.classList.add('yellow');
    } else {
        progressBar.classList.add('green');
    }
}

function renderDueTasksList() {
    const dueTasksListDiv = document.getElementById('due-tasks-list');
    if (!dueTasksListDiv) return;
    dueTasksListDiv.innerHTML = "";

    let tasksForFocus = [];
    if (managerFocusUser === 'C') tasksForFocus = [...allManagerTasksC];
    else if (managerFocusUser === 'W') tasksForFocus = [...allManagerTasksW];
    else tasksForFocus = [...allManagerTasksC, ...allManagerTasksW];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(today.getDate() + 7);

    const dueAndOverdueTasks = tasksForFocus.filter(task => {
        if (task.status?.toLowerCase() === 'ferdig' || !task.dueDate) return false;
        const dueDate = new Date(task.dueDate);
        dueDate.setHours(0,0,0,0); 
        return dueDate <= sevenDaysFromNow; 
    }).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)); 

    if (dueAndOverdueTasks.length === 0) {
        dueTasksListDiv.innerHTML = "<p>Ingen oppgaver nær eller over frist.</p>";
        return;
    }

    dueAndOverdueTasks.forEach(task => {
        const taskDiv = document.createElement('div');
        taskDiv.className = 'task-item-manager'; 
        const dueDate = new Date(task.dueDate);
        dueDate.setHours(0,0,0,0);
        let dueDateTextClass = '';
        if (dueDate < today) {
            taskDiv.classList.add('overdue');
            dueDateTextClass = 'overdue-text';
        } else {
            taskDiv.classList.add('due-soon');
            dueDateTextClass = 'due-soon-text';
        }
        
        let assigneeInitial = '?';
        if (allManagerTasksC.some(t => t.id === task.id)) assigneeInitial = 'C';
        else if (allManagerTasksW.some(t => t.id === task.id)) assigneeInitial = 'W';

        taskDiv.innerHTML = `
            <strong>${task.name}</strong>
            <span>Kunde: ${task.customer || 'N/A'}</span>
            <span class="due-date-text ${dueDateTextClass}">Frist: ${dueDate.toLocaleDateString('no-NO')}</span>
            <span>Tildelt: <span class="assignee-${assigneeInitial}">${assigneeInitial === 'C' ? 'Cornelius' : 'William'}</span></span>
        `;
        taskDiv.addEventListener('click', () => {
            if (typeof openEditTaskModal_Tasks === 'function') openEditTaskModal_Tasks(task.id);
        });
        dueTasksListDiv.appendChild(taskDiv);
    });
}

function renderQuickTaskOverview() {
    const taskListDiv = document.getElementById('task-list-manager');
    if (!taskListDiv) return;
    taskListDiv.innerHTML = ""; 

    let tasksToDisplay = [];
    if (managerFocusUser === 'C') tasksToDisplay = [...allManagerTasksC];
    else if (managerFocusUser === 'W') tasksToDisplay = [...allManagerTasksW];
    else tasksToDisplay = [...allManagerTasksC, ...allManagerTasksW];
    
    const statusFilter = document.getElementById('task-overview-status-filter').value;
    if (statusFilter !== 'all') {
        if (statusFilter === 'open') { 
            tasksToDisplay = tasksToDisplay.filter(task => 
                task.status?.toLowerCase() === 'ny' || 
                task.status?.toLowerCase() === 'pågår' ||
                task.status?.toLowerCase() === 'venter'
            );
        } else {
            tasksToDisplay = tasksToDisplay.filter(task => task.status?.toLowerCase() === statusFilter.toLowerCase());
        }
    }

    tasksToDisplay.sort((a, b) => { 
        const dueDateA = a.dueDate ? new Date(a.dueDate) : new Date('2999-12-31');
        const dueDateB = b.dueDate ? new Date(b.dueDate) : new Date('2999-12-31');
        if (dueDateA < dueDateB) return -1;
        if (dueDateA > dueDateB) return 1;
        const prioOrder = { "Høy": 1, "Medium": 2, "Lav": 3, "": 4, null: 4 };
        const prioA = prioOrder[a.priority] || 4;
        const prioB = prioOrder[b.priority] || 4;
        if (prioA < prioB) return -1;
        if (prioA > prioB) return 1;
        return (a.name || "").localeCompare(b.name || "");
    });

    if (tasksToDisplay.length === 0) {
        taskListDiv.innerHTML = "<p>Ingen oppgaver å vise for valgt filter.</p>";
        return;
    }

    tasksToDisplay.slice(0, 15).forEach(task => { 
        const taskDiv = document.createElement('div');
        taskDiv.className = 'task-item-manager';
        if (task.priority) taskDiv.classList.add(`priority-${task.priority}`);
        if (task.status?.toLowerCase() === 'ferdig') taskDiv.classList.add('status-ferdig');
        
        let assigneeInitial = '?';
        if (allManagerTasksC.some(t => t.id === task.id) && allManagerTasksW.some(t => t.id === task.id)) {
             assigneeInitial = 'C+W'; 
        } else if (allManagerTasksC.some(t => t.id === task.id)) {
            assigneeInitial = 'C';
        } else if (allManagerTasksW.some(t => t.id === task.id)) {
            assigneeInitial = 'W';
        }
        
        taskDiv.innerHTML = `
            <strong>${task.name}</strong>
            <span>Kunde: ${task.customer || 'N/A'}</span>
            <span>Status: ${task.status || 'N/A'}</span>
            ${task.dueDate ? `<span>Frist: ${new Date(task.dueDate).toLocaleDateString('no-NO')}</span>` : ''}
            <span>Tildelt: <span class="assignee-${assigneeInitial}">${assigneeInitial === 'C' ? 'Cornelius' : (assigneeInitial === 'W' ? 'William' : (assigneeInitial === 'C+W' ? 'Begge?' : 'Ukjent'))}</span></span>
        `;
        taskDiv.addEventListener('click', () => {
            if (typeof openEditTaskModal_Tasks === 'function') {
                openEditTaskModal_Tasks(task.id);
            } else {
                console.warn("openEditTaskModal_Tasks er ikke definert.");
                alert(`Detaljer for oppgave: ${task.name}`);
            }
        });
        taskListDiv.appendChild(taskDiv);
    });
}

function populateManagerCustomerDropdown() {
    const assignee = document.getElementById('new-task-assignee').value;
    const customerDropdown = document.getElementById('new-task-customer');
    if (!customerDropdown) return;
    while (customerDropdown.options.length > 1) customerDropdown.remove(1); 
    
    const customersToList = (assignee === 'C') ? customersForUserC : customersForUserW;

    if (customersToList && customersToList.length > 0) {
        customersToList.forEach(customer => {
            const option = document.createElement('option');
            option.value = customer.name;
            option.textContent = customer.name;
            customerDropdown.appendChild(option);
        });
    }
}

async function handleSubmitNewTask() {
    const assignee = document.getElementById('new-task-assignee').value;
    const customer = document.getElementById('new-task-customer').value;
    const name = document.getElementById('new-task-name').value.trim();
    const estimatedTime = document.getElementById('new-task-estimated-time').value;
    const dueDate = document.getElementById('new-task-due-date').value;
    const priority = document.getElementById('new-task-priority').value;
    const statusEl = document.getElementById('new-task-status'); 

    if (!customer || !name) {
        statusEl.textContent = "Kunde og oppgavenavn må fylles ut.";
        statusEl.className = 'status-message error';
        return;
    }
    if (estimatedTime !== '' && (isNaN(parseFloat(estimatedTime)) || parseFloat(estimatedTime) < 0)) {
        statusEl.textContent = "Estimert tid må være et gyldig positivt tall eller stå tomt.";
        statusEl.className = 'status-message error';
        return;
    }

    const taskData = {
        action: 'addTask', user: assignee, customer: customer, name: name, status: 'Ny',
        priority: priority || null, dueDate: dueDate || null,
        estimatedTime: estimatedTime !== '' ? parseFloat(estimatedTime) : null,
        source: 'manager' 
    };

    statusEl.textContent = "Oppretter oppgave..."; statusEl.className = 'status-message';
    document.getElementById('submit-new-task-btn').disabled = true;

    try {
        const response = await sendDataToGoogleScript(taskData); 
        if (response.success) {
            statusEl.textContent = "Oppgave opprettet og varsel sendt!"; statusEl.className = 'status-message success';
            document.getElementById('new-task-name').value = '';
            document.getElementById('new-task-estimated-time').value = '';
            document.getElementById('new-task-due-date').value = '';
            document.getElementById('new-task-priority').value = '';
            
            setTimeout(() => {
                closeModal('managerCreateTaskModal');
                statusEl.textContent = ''; 
            }, 2000); 
            
            fetchAllDataForDashboard(); 
        } else {
            throw new Error(response.message || "Ukjent feil ved oppretting av oppgave.");
        }
    } catch (error) {
        console.error("Feil ved innsending av ny oppgave:", error);
        statusEl.textContent = `Feil: ${error.message}`; statusEl.className = 'status-message error';
    } finally {
        document.getElementById('submit-new-task-btn').disabled = false;
    }
}

function renderCharts() {
    console.log(`Rendrer diagrammer for fokus: ${managerFocusUser}`);
    let hoursC = 0; allManagerTimeLogsC.forEach(day => hoursC += day.totalHours);
    let hoursW = 0; allManagerTimeLogsW.forEach(day => hoursW += day.totalHours);

    let tasksForStatusChart = [];
    let openTasksForDistC = 0;
    let openTasksForDistW = 0;

    if (managerFocusUser === 'C') {
        tasksForStatusChart = allManagerTasksC.filter(t => t.status?.toLowerCase() !== 'ferdig');
        openTasksForDistC = tasksForStatusChart.length;
    } else if (managerFocusUser === 'W') {
        tasksForStatusChart = allManagerTasksW.filter(t => t.status?.toLowerCase() !== 'ferdig');
        openTasksForDistW = tasksForStatusChart.length;
    } else { 
        tasksForStatusChart = [...allManagerTasksC, ...allManagerTasksW].filter(t => t.status?.toLowerCase() !== 'ferdig');
        openTasksForDistC = allManagerTasksC.filter(t => t.status?.toLowerCase() !== 'ferdig').length;
        openTasksForDistW = allManagerTasksW.filter(t => t.status?.toLowerCase() !== 'ferdig').length;
    }
    
    renderLoggedHoursChart(hoursC, hoursW); 
    renderTaskStatusChart(tasksForStatusChart); 
    renderOpenTasksDistributionChart(openTasksForDistC, openTasksForDistW);
}

function renderLoggedHoursChart(hoursC, hoursW) {
    const ctx = document.getElementById('loggedHoursChart')?.getContext('2d');
    const container = document.getElementById('chart-container-logged-hours');
    if (!ctx || !container) return;
    if (loggedHoursChartInstance) loggedHoursChartInstance.destroy();

    let data, labels, bgColors, borderColors;
    const accentPrimary = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim();
    const accentSecondary = getComputedStyle(document.documentElement).getPropertyValue('--accent-secondary').trim();

    if (managerFocusUser === 'C') {
        data = [hoursC]; labels = ['Cornelius']; bgColors = [accentPrimary]; borderColors = [accentPrimary];
    } else if (managerFocusUser === 'W') {
        data = [hoursW]; labels = ['William']; bgColors = [accentSecondary]; borderColors = [accentSecondary];
    } else { 
        data = [hoursC, hoursW]; labels = ['Cornelius', 'William']; bgColors = [accentPrimary, accentSecondary]; borderColors = [accentPrimary, accentSecondary];
    }
    container.classList.toggle('inactive-focus', data.every(d => d === 0) && managerFocusUser !== 'all');


    loggedHoursChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Timer Logget (Denne Måned)', data: data,
                backgroundColor: bgColors, borderColor: borderColors, borderWidth: 1
            }]
        },
        options: { 
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() }, grid: { color: getComputedStyle(document.documentElement).getPropertyValue('--border-inactive').trim() } },
                x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() }, grid: { display: false } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function renderTaskStatusChart(openTasksForFocus) {
    const ctx = document.getElementById('taskStatusChart')?.getContext('2d');
    const container = document.getElementById('chart-container-task-status');
    if (!ctx || !container) return;
    if (taskStatusChartInstance) taskStatusChartInstance.destroy();

    container.classList.remove('inactive-focus'); 

    const statusCounts = { 'Ny': 0, 'Pågår': 0, 'Venter': 0 }; 
    openTasksForFocus.forEach(task => {
        if (task.status && statusCounts.hasOwnProperty(task.status)) {
            statusCounts[task.status]++;
        } else if (task.status && task.status.toLowerCase() !== 'ferdig') { 
            statusCounts[task.status] = (statusCounts[task.status] || 0) + 1;
        }
    });
    const labels = Object.keys(statusCounts);
    const data = Object.values(statusCounts);
    const textSecondary = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim();

    taskStatusChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                label: 'Oppgavestatus (Åpne)', data: data,
                backgroundColor: ['#64b5f6', 'var(--bar-yellow)', '#ff9800', '#B0BEC5'], 
                borderColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim(),
                borderWidth: 2
            }]
        },
        options: { 
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: textSecondary } } }
        }
    });
}

function renderOpenTasksDistributionChart(openC, openW) {
    const ctx = document.getElementById('openTasksDistributionChart')?.getContext('2d');
    const container = document.getElementById('chart-container-open-tasks-dist');
    if (!ctx || !container) return;
    if (openTasksDistributionChartInstance) openTasksDistributionChartInstance.destroy();

    let data, labels, bgColors;
    const accentPrimary = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim();
    const accentSecondary = getComputedStyle(document.documentElement).getPropertyValue('--accent-secondary').trim();
    const textSecondary = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim();

    if (managerFocusUser === 'C') {
        data = [openC]; labels = ['Cornelius']; bgColors = [accentPrimary];
    } else if (managerFocusUser === 'W') {
        data = [openW]; labels = ['William']; bgColors = [accentSecondary];
    } else { 
        data = [openC, openW]; labels = ['Cornelius', 'William']; bgColors = [accentPrimary, accentSecondary];
    }
    container.classList.toggle('inactive-focus', data.every(d => d === 0) && managerFocusUser !== 'all');
    
    openTasksDistributionChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                label: 'Fordeling Åpne Oppgaver', data: data,
                backgroundColor: bgColors,
                borderColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim(),
                borderWidth: 2
            }]
        },
        options: { 
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: textSecondary } } }
        }
    });
}

function showViewManager(viewName) {
    const taskAdminView = document.getElementById('task-admin-view');
    const calendarViewManager = document.getElementById('calendar-view-manager');
    const btnTaskAdmin = document.getElementById('show-task-admin-btn');
    const btnCalendar = document.getElementById('show-calendar-view-btn');

    if (!taskAdminView || !calendarViewManager || !btnTaskAdmin || !btnCalendar) return;

    if (viewName === 'calendar') {
        taskAdminView.style.display = 'none';
        calendarViewManager.style.display = 'block'; 
        btnTaskAdmin.classList.remove('active');
        btnCalendar.classList.add('active');
        initializeManagerCalendar(); 
    } else { 
        taskAdminView.style.display = 'block'; 
        calendarViewManager.style.display = 'none';
        btnTaskAdmin.classList.add('active');
        btnCalendar.classList.remove('active');
        if (managerCalendarInstance) { 
            managerCalendarInstance.destroy();
            managerCalendarInstance = null;
        }
    }
}

function initializeManagerCalendar() {
    if (managerCalendarInstance) { 
        // Kalenderen finnes, oppdater events
        let tasksForCalendar = [];
        if (managerFocusUser === 'C') tasksForCalendar = [...allManagerTasksC];
        else if (managerFocusUser === 'W') tasksForCalendar = [...allManagerTasksW];
        else tasksForCalendar = [...allManagerTasksC, ...allManagerTasksW];

        const calendarEvents = tasksForCalendar.filter(task => task.dueDate).map(task => {
            // ... (samme event-mapping som under)
            let color = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim(); 
            if (task.priority === 'Høy') color = getComputedStyle(document.documentElement).getPropertyValue('--bar-red').trim();
            else if (task.priority === 'Medium') color = getComputedStyle(document.documentElement).getPropertyValue('--bar-yellow').trim();
            else if (task.priority === 'Lav') color = '#64b5f6'; 
            
            let assigneePrefix = '';
            if (managerFocusUser === 'all') { 
                if (allManagerTasksC.some(t => t.id === task.id)) assigneePrefix = 'C: ';
                else if (allManagerTasksW.some(t => t.id === task.id)) assigneePrefix = 'W: ';
            }
            return { id: task.id, title: `${assigneePrefix}${task.name} (${task.customer || 'N/A'})`, start: task.dueDate, allDay: true, extendedProps: task, backgroundColor: color, borderColor: color };
        });
        managerCalendarInstance.removeAllEvents();
        managerCalendarInstance.addEventSource(calendarEvents);
        managerCalendarInstance.render(); // Re-render for å vise endringer
        console.log("Managerkalender oppdatert med nye events.");
        return;
    }

    const calendarEl = document.getElementById('managerCalendar');
    if (!calendarEl) {
        console.error("Kalenderelement #managerCalendar ikke funnet.");
        return;
    }

    let tasksForCalendar = [];
    if (managerFocusUser === 'C') tasksForCalendar = [...allManagerTasksC];
    else if (managerFocusUser === 'W') tasksForCalendar = [...allManagerTasksW];
    else tasksForCalendar = [...allManagerTasksC, ...allManagerTasksW];

    const calendarEvents = tasksForCalendar.filter(task => task.dueDate).map(task => {
        let color = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim(); 
        if (task.priority === 'Høy') color = getComputedStyle(document.documentElement).getPropertyValue('--bar-red').trim();
        else if (task.priority === 'Medium') color = getComputedStyle(document.documentElement).getPropertyValue('--bar-yellow').trim();
        else if (task.priority === 'Lav') color = '#64b5f6'; 
        
        let assigneePrefix = '';
        if (managerFocusUser === 'all') { 
            if (allManagerTasksC.some(t => t.id === task.id)) assigneePrefix = 'C: ';
            else if (allManagerTasksW.some(t => t.id === task.id)) assigneePrefix = 'W: ';
        }

        return {
            id: task.id,
            title: `${assigneePrefix}${task.name} (${task.customer || 'N/A'})`,
            start: task.dueDate,
            allDay: true,
            extendedProps: task,
            backgroundColor: color,
            borderColor: color
        };
    });

    managerCalendarInstance = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'no',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,listWeek'
        },
        events: calendarEvents,
        editable: false, 
        eventClick: function(info) {
            console.log('Kalender Event Klikket:', info.event);
            if (typeof openEditTaskModal_Tasks === 'function') {
                 openEditTaskModal_Tasks(info.event.id); 
            } else {
                alert(`Oppgave: ${info.event.title}\nFrist: ${info.event.startStr}`);
            }
        },
        height: 650, // Satt en fast høyde for bedre visning
        eventDidMount: function(info) {
            // Kan legge til tooltips her
        }
    });
    managerCalendarInstance.render();
    console.log("Managerkalender initialisert/rendret.");
}

