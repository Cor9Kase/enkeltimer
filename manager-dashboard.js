// manager-dashboard.js

// currentUserSuffix er globalt definert i theme.js (brukes for default 'Tildel til')
// GOOGLE_SCRIPT_URL er globalt definert i script.js

let managerFocusUser = localStorage.getItem('managerDashboardFocus') || 'all'; // 'all', 'C', eller 'W'
let allManagerTasksC = [];
let allManagerTasksW = [];
let allManagerTimeLogsC = [];
let allManagerTimeLogsW = [];
let customersForUserC = [];
let customersForUserW = [];

let loggedHoursChartInstance = null;
let taskStatusChartInstance = null;
let openTasksDistributionChartInstance = null;
let managerCalendarInstance = null; // For FullCalendar

document.addEventListener('DOMContentLoaded', () => {
    console.log("Manager Dashboard DOM lastet.");

    if (typeof currentUserSuffix === 'undefined') {
        console.warn("currentUserSuffix ikke definert i manager-dashboard.js. Fallback til localStorage.");
        // eslint-disable-next-line no-global-assign
        currentUserSuffix = localStorage.getItem('currentUserSuffix') || 'C';
    }
    
    // Sett default for "Tildel til" basert på appens aktive bruker
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

    document.getElementById('submit-new-task-btn')?.addEventListener('click', handleSubmitNewTask);
    document.getElementById('new-task-assignee')?.addEventListener('change', populateManagerCustomerDropdown);

    document.getElementById('task-overview-status-filter')?.addEventListener('change', renderQuickTaskOverview);
    document.getElementById('refresh-button')?.addEventListener('click', fetchAllDataForDashboard);

    // Knapper for å bytte mellom oppgaveadmin og kalender
    document.getElementById('show-task-admin-btn')?.addEventListener('click', () => showViewManager('task-admin'));
    document.getElementById('show-calendar-view-btn')?.addEventListener('click', () => showViewManager('calendar'));
}

function setManagerFocus(focusUser, reloadData = true) {
    managerFocusUser = focusUser;
    localStorage.setItem('managerDashboardFocus', managerFocusUser);
    console.log(`Manager dashboard fokus satt til: ${managerFocusUser}`);

    // Oppdater aktive knapper for fokusvalg
    document.querySelectorAll('.user-selection-actions .user-switch-btn').forEach(btn => btn.classList.remove('active'));
    if (focusUser === 'C') document.getElementById('user-btn-c')?.classList.add('active');
    else if (focusUser === 'W') document.getElementById('user-btn-w')?.classList.add('active');
    else document.getElementById('user-btn-all')?.classList.add('active');
    
    // Oppdater "Tildel til" i skjema hvis fokus er C eller W
    const assigneeDropdown = document.getElementById('new-task-assignee');
    if (assigneeDropdown) {
        if (focusUser === 'C' || focusUser === 'W') {
            assigneeDropdown.value = focusUser;
        }
        // Hvis 'all', behold det som var (eller default til appens currentUserSuffix)
        // Dette kaller også populateManagerCustomerDropdown indirekte hvis det er en 'change' event listener.
        populateManagerCustomerDropdown(); // Sørg for at kundelisten oppdateres for den valgte tildelte
    }
    
    if (reloadData) {
        renderDashboard(); // Re-render alle seksjoner med det nye fokuset
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
        populateManagerCustomerDropdown(); // Populer dropdown basert på default/fokusert bruker
        renderDashboard();
    } catch (error) {
        console.error("Feil ved henting av dashboard data:", error);
        document.getElementById('stats-hours-total').textContent = "Feil";
        // TODO: Vis en mer brukervennlig feilmelding på siden
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
    // ... (som før)
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
    renderQuickTaskOverview(); // Hurtigoversikt oppgaver
    renderCharts();
    // Kalender rendres kun når den er aktiv
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

    // Hjelpefunksjon for å oppdatere et stat-kort
    const updateStatCard = (id, value, subtext = null) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
        if (subtext !== null) {
            const subEl = el?.closest('.stat-card')?.querySelector('small');
            if (subEl) subEl.innerHTML = subtext;
        }
    };
    // Hjelpefunksjon for å sette 'inactive-focus'
    const setFocusClass = (cardId, isActive) => {
        document.getElementById(cardId)?.classList.toggle('inactive-focus', !isActive);
    };

    // Data for Cornelius
    let totalHoursC = 0; allManagerTimeLogsC.forEach(day => totalHoursC += day.totalHours);
    let allocatedC = 0; customersForUserC.forEach(cust => allocatedC += (cust.allocatedHours || 0));
    const openTasksC = allManagerTasksC.filter(t => t.status?.toLowerCase() !== 'ferdig');
    let estimatedHoursOpenC = 0; openTasksC.forEach(t => estimatedHoursOpenC += (t.estimatedTime || 0));
    const completedTasksCMonth = allManagerTasksC.filter(t => t.status?.toLowerCase() === 'ferdig' && new Date(t.completedDate).getMonth() === new Date().getMonth()).length;

    // Data for William
    let totalHoursW = 0; allManagerTimeLogsW.forEach(day => totalHoursW += day.totalHours);
    let allocatedW = 0; customersForUserW.forEach(cust => allocatedW += (cust.allocatedHours || 0));
    const openTasksW = allManagerTasksW.filter(t => t.status?.toLowerCase() !== 'ferdig');
    let estimatedHoursOpenW = 0; openTasksW.forEach(t => estimatedHoursOpenW += (t.estimatedTime || 0));
    const completedTasksWMonth = allManagerTasksW.filter(t => t.status?.toLowerCase() === 'ferdig' && new Date(t.completedDate).getMonth() === new Date().getMonth()).length;

    // Vis/skjul/oppdater basert på fokus
    const showC = managerFocusUser === 'C' || managerFocusUser === 'all';
    const showW = managerFocusUser === 'W' || managerFocusUser === 'all';

    setFocusClass('stat-card-hours-c', showC);
    if (showC) {
        updateStatCard('stats-hours-c', totalHoursC.toFixed(1) + " t", `Av tildelt: ${allocatedC.toFixed(1)} t`);
        updateProgressBar('progress-hours-c', totalHoursC, allocatedC);
    }
    setFocusClass('stat-card-open-tasks-c', showC);
    if (showC) updateStatCard('stats-open-tasks-c', openTasksC.length);
    setFocusClass('stat-card-estimated-c', showC);
    if (showC) updateStatCard('stats-estimated-hours-c', estimatedHoursOpenC.toFixed(1) + " t");


    setFocusClass('stat-card-hours-w', showW);
    if (showW) {
        updateStatCard('stats-hours-w', totalHoursW.toFixed(1) + " t", `Av tildelt: ${allocatedW.toFixed(1)} t`);
        updateProgressBar('progress-hours-w', totalHoursW, allocatedW);
    }
    setFocusClass('stat-card-open-tasks-w', showW);
    if (showW) updateStatCard('stats-open-tasks-w', openTasksW.length);
    setFocusClass('stat-card-estimated-w', showW);
    if (showW) updateStatCard('stats-estimated-hours-w', estimatedHoursOpenW.toFixed(1) + " t");


    // Totalkort
    if (managerFocusUser === 'C') {
        updateStatCard('stats-hours-total', totalHoursC.toFixed(1) + " t");
        updateStatCard('stats-completed-tasks-month', completedTasksCMonth, `C: ${completedTasksCMonth}`);
        setFocusClass('stat-card-hours-total', true);
        setFocusClass('stat-card-completed-tasks', true);
    } else if (managerFocusUser === 'W') {
        updateStatCard('stats-hours-total', totalHoursW.toFixed(1) + " t");
        updateStatCard('stats-completed-tasks-month', completedTasksWMonth, `W: ${completedTasksWMonth}`);
        setFocusClass('stat-card-hours-total', true);
        setFocusClass('stat-card-completed-tasks', true);
    } else { // 'all'
        updateStatCard('stats-hours-total', (totalHoursC + totalHoursW).toFixed(1) + " t");
        updateStatCard('stats-completed-tasks-month', completedTasksCMonth + completedTasksWMonth, `C: ${completedTasksCMonth} / W: ${completedTasksWMonth}`);
        setFocusClass('stat-card-hours-total', true);
        setFocusClass('stat-card-completed-tasks', true);
    }
}

function updateProgressBar(elementId, currentValue, maxValue) {
    // ... (som før)
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
        dueDate.setHours(0,0,0,0); // Normaliser for sammenligning
        return dueDate <= sevenDaysFromNow; // Overdue eller innen 7 dager
    }).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)); // Sorter etter frist

    if (dueAndOverdueTasks.length === 0) {
        dueTasksListDiv.innerHTML = "<p>Ingen oppgaver nær eller over frist.</p>";
        return;
    }

    dueAndOverdueTasks.forEach(task => {
        const taskDiv = document.createElement('div');
        taskDiv.className = 'task-item-manager'; // Gjenbruker stil
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
    // ... (som før, men tittelen oppdateres nå av updateSectionTitles)
    const taskListDiv = document.getElementById('task-list-manager');
    if (!taskListDiv) return;
    taskListDiv.innerHTML = ""; 

    let tasksToDisplay = [];
    if (managerFocusUser === 'C') tasksToDisplay = [...allManagerTasksC];
    else if (managerFocusUser === 'W') tasksToDisplay = [...allManagerTasksW];
    else tasksToDisplay = [...allManagerTasksC, ...allManagerTasksW];
    
    const statusFilter = document.getElementById('task-overview-status-filter').value;
    if (statusFilter !== 'all') {
        if (statusFilter === 'open') { // Inkluderer nå 'Venter' i 'open'
            tasksToDisplay = tasksToDisplay.filter(task => 
                task.status?.toLowerCase() === 'ny' || 
                task.status?.toLowerCase() === 'pågår' ||
                task.status?.toLowerCase() === 'venter'
            );
        } else {
            tasksToDisplay = tasksToDisplay.filter(task => task.status?.toLowerCase() === statusFilter.toLowerCase());
        }
    }

    tasksToDisplay.sort((a, b) => { /* ... (sortering som før) ... */
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

    tasksToDisplay.slice(0, 15).forEach(task => { /* ... (visning som før) ... */
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
    while (customerDropdown.options.length > 1) customerDropdown.remove(1); // Behold placeholder
    
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
    // ... (som før, men bruker sendDataToGoogleScript som nå håndterer 'user')
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
    };

    statusEl.textContent = "Oppretter oppgave..."; statusEl.className = 'status-message';
    document.getElementById('submit-new-task-btn').disabled = true;

    try {
        const response = await sendDataToGoogleScript(taskData); // sendDataToGoogleScript er global
        if (response.success) {
            statusEl.textContent = "Oppgave opprettet!"; statusEl.className = 'status-message success';
            document.getElementById('new-task-name').value = '';
            document.getElementById('new-task-estimated-time').value = '';
            document.getElementById('new-task-due-date').value = '';
            document.getElementById('new-task-priority').value = '';
            fetchAllDataForDashboard(); // Last inn all data på nytt
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

// --- Chart Rendering Functions (Oppdatert for Fokus) ---
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
        openTasksForDistW = 0;
    } else if (managerFocusUser === 'W') {
        tasksForStatusChart = allManagerTasksW.filter(t => t.status?.toLowerCase() !== 'ferdig');
        openTasksForDistW = tasksForStatusChart.length;
        openTasksForDistC = 0;
    } else { // 'all'
        tasksForStatusChart = [...allManagerTasksC, ...allManagerTasksW].filter(t => t.status?.toLowerCase() !== 'ferdig');
        openTasksForDistC = allManagerTasksC.filter(t => t.status?.toLowerCase() !== 'ferdig').length;
        openTasksForDistW = allManagerTasksW.filter(t => t.status?.toLowerCase() !== 'ferdig').length;
    }
    
    renderLoggedHoursChart(hoursC, hoursW); // Denne vil internt håndtere fokus
    renderTaskStatusChart(tasksForStatusChart); // Sender allerede filtrerte oppgaver
    renderOpenTasksDistributionChart(openTasksForDistC, openTasksForDistW); // Sender allerede filtrerte tellinger
}

function renderLoggedHoursChart(hoursC, hoursW) {
    const ctx = document.getElementById('loggedHoursChart')?.getContext('2d');
    const container = document.getElementById('chart-container-logged-hours');
    if (!ctx || !container) return;
    if (loggedHoursChartInstance) loggedHoursChartInstance.destroy();

    let data, labels;
    const accentPrimary = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim();
    const accentSecondary = getComputedStyle(document.documentElement).getPropertyValue('--accent-secondary').trim();

    if (managerFocusUser === 'C') {
        data = [hoursC]; labels = ['Cornelius'];
        container.classList.remove('inactive-focus');
    } else if (managerFocusUser === 'W') {
        data = [hoursW]; labels = ['William'];
        container.classList.remove('inactive-focus');
    } else { // 'all'
        data = [hoursC, hoursW]; labels = ['Cornelius', 'William'];
        container.classList.remove('inactive-focus');
    }
    // Hvis vi vil skjule et diagram helt når det ikke er relevant for fokus:
    // container.style.display = (managerFocusUser === 'W' && type === 'hours-c') ? 'none' : 'flex';

    loggedHoursChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Timer Logget (Denne Måned)', data: data,
                backgroundColor: managerFocusUser === 'C' ? [accentPrimary] : managerFocusUser === 'W' ? [accentSecondary] : [accentPrimary, accentSecondary],
                borderColor: managerFocusUser === 'C' ? [accentPrimary] : managerFocusUser === 'W' ? [accentSecondary] : [accentPrimary, accentSecondary],
                borderWidth: 1
            }]
        },
        options: { /* ... (samme options som før) ... */
            responsive: true, maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() }, grid: { color: getComputedStyle(document.documentElement).getPropertyValue('--border-inactive').trim() } },
                x: { ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() }, grid: { display: false } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function renderTaskStatusChart(openTasksForFocus) { // Mottar allerede filtrerte oppgaver
    const ctx = document.getElementById('taskStatusChart')?.getContext('2d');
    const container = document.getElementById('chart-container-task-status');
    if (!ctx || !container) return;
    if (taskStatusChartInstance) taskStatusChartInstance.destroy();

    container.classList.remove('inactive-focus'); // Dette diagrammet er alltid relevant for fokus

    const statusCounts = { 'Ny': 0, 'Pågår': 0, 'Venter': 0 }; // Inkluder 'Venter'
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
                backgroundColor: ['#64b5f6', 'var(--bar-yellow)', '#ff9800', '#B0BEC5'], // Ny, Pågår, Venter, Annet
                borderColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim(),
                borderWidth: 2
            }]
        },
        options: { /* ... (samme options som før) ... */
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

    let data, labels;
    const accentPrimary = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim();
    const accentSecondary = getComputedStyle(document.documentElement).getPropertyValue('--accent-secondary').trim();
    const textSecondary = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim();

    if (managerFocusUser === 'C') {
        data = [openC]; labels = ['Cornelius'];
        container.classList.remove('inactive-focus');
    } else if (managerFocusUser === 'W') {
        data = [openW]; labels = ['William'];
        container.classList.remove('inactive-focus');
    } else { // 'all'
        data = [openC, openW]; labels = ['Cornelius', 'William'];
        container.classList.remove('inactive-focus');
    }
    
    // Hvis data er tom (f.eks. en bruker har 0 åpne oppgaver og er i fokus), vis en melding istedenfor tomt diagram?
    // For nå, la Chart.js håndtere det.

    openTasksDistributionChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                label: 'Fordeling Åpne Oppgaver', data: data,
                backgroundColor: managerFocusUser === 'C' ? [accentPrimary] : managerFocusUser === 'W' ? [accentSecondary] : [accentPrimary, accentSecondary],
                borderColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim(),
                borderWidth: 2
            }]
        },
        options: { /* ... (samme options som før) ... */
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: textSecondary } } }
        }
    });
}

// --- Visningsbytte for Oppgaveadmin/Kalender ---
function showViewManager(viewName) {
    const taskAdminView = document.getElementById('task-admin-view');
    const calendarViewManager = document.getElementById('calendar-view-manager');
    const btnTaskAdmin = document.getElementById('show-task-admin-btn');
    const btnCalendar = document.getElementById('show-calendar-view-btn');

    if (!taskAdminView || !calendarViewManager || !btnTaskAdmin || !btnCalendar) return;

    if (viewName === 'calendar') {
        taskAdminView.style.display = 'none';
        calendarViewManager.style.display = 'block'; // Eller 'flex' hvis det er en flex container
        btnTaskAdmin.classList.remove('active');
        btnCalendar.classList.add('active');
        initializeManagerCalendar(); // Initialiser/render kalenderen
    } else { // 'task-admin'
        taskAdminView.style.display = 'block'; // Eller 'grid'/'flex' avhengig av din CSS
        calendarViewManager.style.display = 'none';
        btnTaskAdmin.classList.add('active');
        btnCalendar.classList.remove('active');
        if (managerCalendarInstance) { // Ødelegg kalenderinstansen for å spare ressurser
            managerCalendarInstance.destroy();
            managerCalendarInstance = null;
        }
    }
}

function initializeManagerCalendar() {
    if (managerCalendarInstance) { // Hvis den allerede finnes, bare re-render events
        managerCalendarInstance.refetchEvents(); // Eller removeAllEvents + addEventSource
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
        let color = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim(); // Default
        if (task.priority === 'Høy') color = getComputedStyle(document.documentElement).getPropertyValue('--bar-red').trim();
        else if (task.priority === 'Medium') color = getComputedStyle(document.documentElement).getPropertyValue('--bar-yellow').trim();
        else if (task.priority === 'Lav') color = '#64b5f6'; // Blå for lav
        
        let assigneePrefix = '';
        if (managerFocusUser === 'all') { // Vis kun initial hvis begge vises
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
        editable: false, // Kan settes til true hvis du vil ha dra-og-slipp
        eventClick: function(info) {
            console.log('Kalender Event Klikket:', info.event);
            if (typeof openEditTaskModal_Tasks === 'function') {
                 openEditTaskModal_Tasks(info.event.id); // Bruk funksjonen fra tasks.js
            } else {
                alert(`Oppgave: ${info.event.title}\nFrist: ${info.event.startStr}`);
            }
        },
        height: 'auto', // Eller en fast høyde
        eventDidMount: function(info) {
            // Tooltip kan legges til her hvis ønskelig
        }
    });
    managerCalendarInstance.render();
    console.log("Managerkalender initialisert/rendret.");
}
