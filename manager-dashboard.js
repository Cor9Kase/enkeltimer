// manager-dashboard.js

// currentUserSuffix er globalt definert i theme.js
// GOOGLE_SCRIPT_URL er globalt definert i script.js

let managerFocusUser = localStorage.getItem('managerDashboardFocus') || 'all'; // 'all', 'C', eller 'W'
let allManagerTasksC = [];
let allManagerTasksW = [];
let allManagerTimeLogsC = [];
let allManagerTimeLogsW = [];
let customersForUserC = [];
let customersForUserW = [];

// Globale variabler for Chart-instanser, slik at de kan ødelegges før de tegnes på nytt
let loggedHoursChartInstance = null;
let taskStatusChartInstance = null;
let openTasksDistributionChartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    console.log("Manager Dashboard DOM lastet.");

    if (typeof currentUserSuffix === 'undefined') {
        console.warn("currentUserSuffix ikke definert i manager-dashboard.js. Fallback til localStorage.");
        // eslint-disable-next-line no-global-assign
        currentUserSuffix = localStorage.getItem('currentUserSuffix') || 'C';
    }
    
    setManagerFocus(managerFocusUser, false); // Sett initielt fokus uten å laste data, det gjøres under

    setupManagerEventListeners();
    fetchAllDataForDashboard(); // Hent data og render alt, inkludert diagrammer

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
}

function setManagerFocus(focusUser, reloadData = true) {
    managerFocusUser = focusUser;
    localStorage.setItem('managerDashboardFocus', managerFocusUser);
    console.log(`Manager dashboard fokus satt til: ${managerFocusUser}`);

    document.querySelectorAll('.user-selection-actions .user-switch-btn').forEach(btn => btn.classList.remove('active'));
    if (focusUser === 'C') document.getElementById('user-btn-c')?.classList.add('active');
    else if (focusUser === 'W') document.getElementById('user-btn-w')?.classList.add('active');
    else document.getElementById('user-btn-all')?.classList.add('active');
    
    const overviewUserSpan = document.getElementById('task-overview-user');
    if(overviewUserSpan) {
        overviewUserSpan.textContent = focusUser === 'C' ? 'Cornelius' : focusUser === 'W' ? 'William' : 'Begge';
    }

    populateManagerCustomerDropdown();
    if (reloadData) {
        // Render UI basert på eksisterende data, ikke full refresh
        renderDashboard();
    }
}

async function fetchAllDataForDashboard() {
    console.log("Henter all data for manager dashboard...");
    showLoadingState(true);

    try {
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();

        const dataC = await Promise.all([
            fetchDataFromScript_Manager({ action: 'getTimeLog', user: 'C', month: currentMonth, year: currentYear }),
            fetchDataFromScript_Manager({ action: 'getTasks', user: 'C' }),
            fetchDataFromScript_Manager({ action: 'getCustomers', user: 'C' })
        ]);
        allManagerTimeLogsC = dataC[0].success ? dataC[0].timeLog : [];
        allManagerTasksC = dataC[1].success ? dataC[1].tasks : [];
        customersForUserC = dataC[2].success ? dataC[2].customers : [];

        const dataW = await Promise.all([
            fetchDataFromScript_Manager({ action: 'getTimeLog', user: 'W', month: currentMonth, year: currentYear }),
            fetchDataFromScript_Manager({ action: 'getTasks', user: 'W' }),
            fetchDataFromScript_Manager({ action: 'getCustomers', user: 'W' })
        ]);
        allManagerTimeLogsW = dataW[0].success ? dataW[0].timeLog : [];
        allManagerTasksW = dataW[1].success ? dataW[1].tasks : [];
        customersForUserW = dataW[2].success ? dataW[2].customers : [];

        console.log("All data hentet.");
        populateManagerCustomerDropdown();
        renderDashboard(); // Dette vil nå også rendre diagrammene

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
        'completed-tasks-c-month', 'completed-tasks-w-month'
    ];
    if (isLoading) {
        elementsToUpdate.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = "Laster...";
        });
        document.getElementById('task-list-manager').innerHTML = "<p>Laster oppgaver...</p>";
        // Skjul diagrammer eller vis lasteindikator for dem også
        document.querySelectorAll('.chart-container canvas').forEach(canvas => {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height); // Tøm canvas
            // Du kan tegne "Laster..." på canvas her hvis ønskelig
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
    renderStats();
    renderQuickTaskOverview();
    renderCharts(); // Ny funksjon for å rendre alle diagrammer
}

function renderStats() {
    console.log("Rendrer statistikk...");
    let totalHoursC = 0;
    allManagerTimeLogsC.forEach(day => totalHoursC += day.totalHours);
    document.getElementById('stats-hours-c').textContent = totalHoursC.toFixed(1) + " t";

    let totalHoursW = 0;
    allManagerTimeLogsW.forEach(day => totalHoursW += day.totalHours);
    document.getElementById('stats-hours-w').textContent = totalHoursW.toFixed(1) + " t";

    document.getElementById('stats-hours-total').textContent = (totalHoursC + totalHoursW).toFixed(1) + " t";
    
    let allocatedC = 0;
    customersForUserC.forEach(cust => allocatedC += (cust.allocatedHours || 0));
    document.getElementById('allocated-hours-c').textContent = allocatedC.toFixed(1) + " t";
    updateProgressBar('progress-hours-c', totalHoursC, allocatedC);

    let allocatedW = 0;
    customersForUserW.forEach(cust => allocatedW += (cust.allocatedHours || 0));
    document.getElementById('allocated-hours-w').textContent = allocatedW.toFixed(1) + " t";
    updateProgressBar('progress-hours-w', totalHoursW, allocatedW);

    const openTasksC = allManagerTasksC.filter(t => t.status?.toLowerCase() !== 'ferdig').length;
    const openTasksW = allManagerTasksW.filter(t => t.status?.toLowerCase() !== 'ferdig').length;
    document.getElementById('stats-open-tasks-c').textContent = openTasksC;
    document.getElementById('stats-open-tasks-w').textContent = openTasksW;

    const completedThisMonthPredicate = (task) => {
        if (task.status?.toLowerCase() !== 'ferdig' || !task.completedDate) return false;
        const completedDate = new Date(task.completedDate);
        const today = new Date();
        return completedDate.getFullYear() === today.getFullYear() && completedDate.getMonth() === today.getMonth();
    };
    const completedTasksCMonth = allManagerTasksC.filter(completedThisMonthPredicate).length;
    const completedTasksWMonth = allManagerTasksW.filter(completedThisMonthPredicate).length;
    document.getElementById('completed-tasks-c-month').textContent = completedTasksCMonth;
    document.getElementById('completed-tasks-w-month').textContent = completedTasksWMonth;
    document.getElementById('stats-completed-tasks-month').textContent = completedTasksCMonth + completedTasksWMonth;
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
            tasksToDisplay = tasksToDisplay.filter(task => task.status?.toLowerCase() !== 'ferdig');
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
        // Bestem hvem som er tildelt basert på hvilken liste oppgaven kom fra
        // Dette er en forenkling. Ideelt sett har task-objektet en 'assignee' property.
        if (allManagerTasksC.some(t => t.id === task.id) && allManagerTasksW.some(t => t.id === task.id)) {
             assigneeInitial = 'C+W'; // Hvis oppgaven er i begge lister (kan skje hvis ikke filtrert riktig)
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
            // Forutsetter at tasks.js og openEditTaskModal_Tasks er lastet og globalt tilgjengelig
            if (typeof openEditTaskModal_Tasks === 'function') {
                openEditTaskModal_Tasks(task.id);
            } else {
                console.warn("openEditTaskModal_Tasks er ikke definert. Kan ikke åpne modal fra manager dashboard.");
                alert(`Detaljer for oppgave: ${task.name}\nID: ${task.id}\nStatus: ${task.status}\n(Redigering ikke tilgjengelig herfra akkurat nå)`);
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
    const customersToList = assignee === 'C' ? customersForUserC : customersForUserW;
    if (customersToList.length > 0) {
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
    };

    statusEl.textContent = "Oppretter oppgave..."; statusEl.className = 'status-message';
    document.getElementById('submit-new-task-btn').disabled = true;

    try {
        // Bruker den globale sendDataToGoogleScript fra script.js
        const response = await sendDataToGoogleScript(taskData);
        if (response.success) {
            statusEl.textContent = "Oppgave opprettet!"; statusEl.className = 'status-message success';
            document.getElementById('new-task-name').value = '';
            document.getElementById('new-task-estimated-time').value = '';
            document.getElementById('new-task-due-date').value = '';
            document.getElementById('new-task-priority').value = '';
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

// --- Chart Rendering Functions ---
function renderCharts() {
    console.log("Rendrer diagrammer...");
    let totalHoursC = 0;
    allManagerTimeLogsC.forEach(day => totalHoursC += day.totalHours);
    let totalHoursW = 0;
    allManagerTimeLogsW.forEach(day => totalHoursW += day.totalHours);

    renderLoggedHoursChart(totalHoursC, totalHoursW);

    const allOpenTasks = [...allManagerTasksC, ...allManagerTasksW].filter(t => t.status?.toLowerCase() !== 'ferdig');
    renderTaskStatusChart(allOpenTasks);

    const openTasksCountC = allManagerTasksC.filter(t => t.status?.toLowerCase() !== 'ferdig').length;
    const openTasksCountW = allManagerTasksW.filter(t => t.status?.toLowerCase() !== 'ferdig').length;
    renderOpenTasksDistributionChart(openTasksCountC, openTasksCountW);
}

function renderLoggedHoursChart(hoursC, hoursW) {
    const ctx = document.getElementById('loggedHoursChart')?.getContext('2d');
    if (!ctx) return;

    if (loggedHoursChartInstance) {
        loggedHoursChartInstance.destroy(); // Ødelegg gammel instans
    }

    const accentPrimary = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim();
    const accentSecondary = getComputedStyle(document.documentElement).getPropertyValue('--accent-secondary').trim();

    loggedHoursChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Cornelius', 'William'],
            datasets: [{
                label: 'Timer Logget (Denne Måned)',
                data: [hoursC, hoursW],
                backgroundColor: [accentPrimary, accentSecondary],
                borderColor: [accentPrimary, accentSecondary],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() },
                    grid: { color: getComputedStyle(document.documentElement).getPropertyValue('--border-inactive').trim() }
                },
                x: {
                    ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() },
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function renderTaskStatusChart(openTasks) {
    const ctx = document.getElementById('taskStatusChart')?.getContext('2d');
    if (!ctx) return;

    if (taskStatusChartInstance) {
        taskStatusChartInstance.destroy();
    }

    const statusCounts = { 'Ny': 0, 'Pågår': 0, 'Venter': 0 };
    openTasks.forEach(task => {
        if (task.status && statusCounts.hasOwnProperty(task.status)) {
            statusCounts[task.status]++;
        } else if (task.status) { // For uventede statuser
            statusCounts[task.status] = (statusCounts[task.status] || 0) + 1;
        }
    });

    const labels = Object.keys(statusCounts);
    const data = Object.values(statusCounts);

    const barGreen = getComputedStyle(document.documentElement).getPropertyValue('--bar-green').trim();
    const barYellow = getComputedStyle(document.documentElement).getPropertyValue('--bar-yellow').trim();
    const accentPrimary = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim();
    const textSecondary = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim();


    taskStatusChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                label: 'Oppgavestatus',
                data: data,
                backgroundColor: [
                    '#64b5f6', // Ny (Blå)
                    barYellow, // Pågår
                    '#ff9800', // Venter (Oransje)
                    // Legg til flere farger hvis du har flere statuser
                ],
                borderColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim(),
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: textSecondary }
                }
            }
        }
    });
}

function renderOpenTasksDistributionChart(openC, openW) {
    const ctx = document.getElementById('openTasksDistributionChart')?.getContext('2d');
    if (!ctx) return;

    if (openTasksDistributionChartInstance) {
        openTasksDistributionChartInstance.destroy();
    }
    
    const accentPrimary = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim();
    const accentSecondary = getComputedStyle(document.documentElement).getPropertyValue('--accent-secondary').trim();
    const textSecondary = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim();


    openTasksDistributionChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Cornelius', 'William'],
            datasets: [{
                label: 'Fordeling Åpne Oppgaver',
                data: [openC, openW],
                backgroundColor: [accentPrimary, accentSecondary],
                borderColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim(),
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: textSecondary }
                }
            }
        }
    });
}
