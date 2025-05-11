// manager-dashboard.js

// currentUserSuffix er globalt definert i theme.js
// GOOGLE_SCRIPT_URL er globalt definert i script.js (eller bør være det)

let managerFocusUser = 'all'; // 'all', 'C', eller 'W' for filtrering av visninger
let allManagerTasksC = [];
let allManagerTasksW = [];
let allManagerTimeLogsC = [];
let allManagerTimeLogsW = [];
let customersForUserC = []; // For "Opprett oppgave" dropdown
let customersForUserW = []; // For "Opprett oppgave" dropdown

document.addEventListener('DOMContentLoaded', () => {
    console.log("Manager Dashboard DOM lastet.");

    // Sørg for at currentUserSuffix er tilgjengelig
    if (typeof currentUserSuffix === 'undefined') {
        console.warn("currentUserSuffix ikke definert i manager-dashboard.js. Fallback til localStorage.");
        // eslint-disable-next-line no-global-assign
        currentUserSuffix = localStorage.getItem('currentUserSuffix') || 'C';
    }
     // Sett opp standard fokus og oppdater knapper
    const defaultFocus = localStorage.getItem('managerDashboardFocus') || 'all';
    setManagerFocus(defaultFocus, false); // false for å ikke laste data på nytt umiddelbart, det gjøres av fetchAllDataForDashboard

    setupManagerEventListeners();
    fetchAllDataForDashboard();

    // Oppdater datovisning
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

    // Oppdater knappestatus for fokusknappene
    document.querySelectorAll('.user-selection-actions .user-switch-btn').forEach(btn => btn.classList.remove('active'));
    if (focusUser === 'C') document.getElementById('user-btn-c')?.classList.add('active');
    else if (focusUser === 'W') document.getElementById('user-btn-w')?.classList.add('active');
    else document.getElementById('user-btn-all')?.classList.add('active');
    
    document.getElementById('task-overview-user').textContent = focusUser === 'C' ? 'Cornelius' : focusUser === 'W' ? 'William' : 'Begge';


    populateManagerCustomerDropdown(); // Oppdater kunde-dropdown for "Opprett oppgave"
    if (reloadData) {
        // Her kan vi velge å kun re-render UI basert på eksisterende data,
        // eller hente alt på nytt hvis fokusendring skal trigge full refresh.
        // For nå, re-render basert på eksisterende data. Full refresh gjøres via refresh-knapp.
        renderStats();
        renderQuickTaskOverview();
    }
}


async function fetchAllDataForDashboard() {
    console.log("Henter all data for manager dashboard...");
    // Vis en lasteindikator om ønskelig
    showLoadingState(true);

    try {
        // Hent data for Cornelius
        const dataC = await Promise.all([
            fetchDataFromScript_Manager({ action: 'getTimeLog', user: 'C', month: new Date().getMonth() + 1, year: new Date().getFullYear() }),
            fetchDataFromScript_Manager({ action: 'getTasks', user: 'C' }),
            fetchDataFromScript_Manager({ action: 'getCustomers', user: 'C' }) // For kunde-dropdown
        ]);
        allManagerTimeLogsC = dataC[0].success ? dataC[0].timeLog : [];
        allManagerTasksC = dataC[1].success ? dataC[1].tasks : [];
        customersForUserC = dataC[2].success ? dataC[2].customers : [];

        // Hent data for William
        const dataW = await Promise.all([
            fetchDataFromScript_Manager({ action: 'getTimeLog', user: 'W', month: new Date().getMonth() + 1, year: new Date().getFullYear() }),
            fetchDataFromScript_Manager({ action: 'getTasks', user: 'W' }),
            fetchDataFromScript_Manager({ action: 'getCustomers', user: 'W' }) // For kunde-dropdown
        ]);
        allManagerTimeLogsW = dataW[0].success ? dataW[0].timeLog : [];
        allManagerTasksW = dataW[1].success ? dataW[1].tasks : [];
        customersForUserW = dataW[2].success ? dataW[2].customers : [];

        console.log("All data hentet.");
        populateManagerCustomerDropdown(); // Populer dropdown første gang etter data er hentet
        renderDashboard();

    } catch (error) {
        console.error("Feil ved henting av dashboard data:", error);
        // Vis feilmelding til brukeren
        document.getElementById('stats-hours-total').textContent = "Feil";
        // ... og for andre felter
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
    }
    // Fjerning av "Laster..." håndteres av render-funksjonene
}


function fetchDataFromScript_Manager(params) {
    // Denne funksjonen er lik den i de andre filene, men kanskje med annen feilhåndtering
    // eller logging spesifikt for manager dashboard.
    // Forutsetter at GOOGLE_SCRIPT_URL er tilgjengelig globalt.
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
            return { success: false, message: error.message, data: null }; // Returner et standard feilobjekt
        });
}

function renderDashboard() {
    renderStats();
    renderQuickTaskOverview();
}

function renderStats() {
    console.log("Rendrer statistikk...");

    // --- Timer Denne Måneden ---
    let totalHoursC = 0;
    allManagerTimeLogsC.forEach(day => totalHoursC += day.totalHours);
    document.getElementById('stats-hours-c').textContent = totalHoursC.toFixed(1) + " t";

    let totalHoursW = 0;
    allManagerTimeLogsW.forEach(day => totalHoursW += day.totalHours);
    document.getElementById('stats-hours-w').textContent = totalHoursW.toFixed(1) + " t";

    document.getElementById('stats-hours-total').textContent = (totalHoursC + totalHoursW).toFixed(1) + " t";
    
    // For allocated hours, må vi summere fra customer-data
    let allocatedC = 0;
    customersForUserC.forEach(cust => allocatedC += (cust.allocatedHours || 0));
    document.getElementById('allocated-hours-c').textContent = allocatedC.toFixed(1) + " t";
    updateProgressBar('progress-hours-c', totalHoursC, allocatedC);

    let allocatedW = 0;
    customersForUserW.forEach(cust => allocatedW += (cust.allocatedHours || 0));
    document.getElementById('allocated-hours-w').textContent = allocatedW.toFixed(1) + " t";
    updateProgressBar('progress-hours-w', totalHoursW, allocatedW);


    // --- Oppgavestatistikk ---
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
    } else if (currentValue > 0) { // Har logget timer, men ingen tildelt
        percentage = 100; // Vis full bar, kanskje i en advarselsfarge
    }
    
    progressBar.style.width = percentage + '%';

    progressBar.classList.remove('green', 'yellow', 'red');
    if (percentage >= 95) { // Nær eller over
        progressBar.classList.add('red');
    } else if (percentage >= 70) {
        progressBar.classList.add('yellow');
    } else {
        progressBar.classList.add('green');
    }
     if (maxValue === 0 && currentValue > 0) { // Logget uten tildeling
        progressBar.style.backgroundColor = 'var(--bar-red)'; // Spesiell farge
    }
}


function renderQuickTaskOverview() {
    const taskListDiv = document.getElementById('task-list-manager');
    if (!taskListDiv) return;
    taskListDiv.innerHTML = ""; // Tøm tidligere liste

    let tasksToDisplay = [];
    if (managerFocusUser === 'C') {
        tasksToDisplay = [...allManagerTasksC];
    } else if (managerFocusUser === 'W') {
        tasksToDisplay = [...allManagerTasksW];
    } else { // 'all'
        tasksToDisplay = [...allManagerTasksC, ...allManagerTasksW];
    }
    
    // Filtrer på status
    const statusFilter = document.getElementById('task-overview-status-filter').value;
    if (statusFilter !== 'all') {
        if (statusFilter === 'open') {
            tasksToDisplay = tasksToDisplay.filter(task => task.status?.toLowerCase() !== 'ferdig');
        } else {
            tasksToDisplay = tasksToDisplay.filter(task => task.status?.toLowerCase() === statusFilter.toLowerCase());
        }
    }


    // Sorter (f.eks. etter frist, deretter prioritet, deretter navn)
    tasksToDisplay.sort((a, b) => {
        // Sortering logikk her (kan være mer avansert)
        const dueDateA = a.dueDate ? new Date(a.dueDate) : new Date('2999-12-31'); // Fremtidig dato for null
        const dueDateB = b.dueDate ? new Date(b.dueDate) : new Date('2999-12-31');
        if (dueDateA < dueDateB) return -1;
        if (dueDateA > dueDateB) return 1;
        // Deretter etter prioritet (Høy > Medium > Lav > Ingen)
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

    tasksToDisplay.slice(0, 15).forEach(task => { // Vis f.eks. de 15 første
        const taskDiv = document.createElement('div');
        taskDiv.className = 'task-item-manager';
        if (task.priority) {
            taskDiv.classList.add(`priority-${task.priority}`);
        }
        if (task.status?.toLowerCase() === 'ferdig') {
            taskDiv.classList.add('status-ferdig');
        }

        // Finn ut hvem oppgaven tilhører basert på om den finnes i C eller W sin liste
        // Dette er en forenkling; en bedre måte er å ha 'assignee' direkte på task-objektet fra backend.
        let assigneeInitial = '?';
        if (allManagerTasksC.find(t => t.id === task.id)) assigneeInitial = 'C';
        else if (allManagerTasksW.find(t => t.id === task.id)) assigneeInitial = 'W';


        taskDiv.innerHTML = `
            <strong>${task.name}</strong>
            <span>Kunde: ${task.customer || 'N/A'}</span>
            <span>Status: ${task.status || 'N/A'}</span>
            ${task.dueDate ? `<span>Frist: ${new Date(task.dueDate).toLocaleDateString('no-NO')}</span>` : ''}
            <span>Tildelt: <span class="assignee-${assigneeInitial}">${assigneeInitial === 'C' ? 'Cornelius' : (assigneeInitial === 'W' ? 'William' : 'Ukjent')}</span></span>
        `;
        // Gjør oppgaven klikkbar for å åpne redigeringsmodal (fra tasks.js)
        taskDiv.addEventListener('click', () => {
            if (typeof openEditTaskModal_Tasks === 'function') { // Sjekk om funksjonen finnes
                openEditTaskModal_Tasks(task.id);
            } else {
                console.warn("openEditTaskModal_Tasks er ikke definert. Kan ikke åpne modal.");
            }
        });
        taskListDiv.appendChild(taskDiv);
    });
}

function populateManagerCustomerDropdown() {
    const assignee = document.getElementById('new-task-assignee').value;
    const customerDropdown = document.getElementById('new-task-customer');
    if (!customerDropdown) return;

    // Tøm eksisterende options (behold placeholder)
    while (customerDropdown.options.length > 1) {
        customerDropdown.remove(1);
    }

    const customersToList = assignee === 'C' ? customersForUserC : customersForUserW;

    if (customersToList.length > 0) {
        customersToList.forEach(customer => {
            const option = document.createElement('option');
            option.value = customer.name;
            option.textContent = customer.name;
            customerDropdown.appendChild(option);
        });
    } else {
        // Ingen kunder for valgt bruker, kan legge til en deaktivert option
        // const option = document.createElement('option');
        // option.textContent = `Ingen kunder funnet for ${assignee === 'C' ? 'Cornelius' : 'William'}`;
        // option.disabled = true;
        // customerDropdown.appendChild(option);
    }
}


async function handleSubmitNewTask() {
    const assignee = document.getElementById('new-task-assignee').value; // 'C' eller 'W'
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
        action: 'addTask',
        user: assignee, // Viktig: send med hvem oppgaven er for
        customer: customer,
        name: name,
        status: 'Ny', // Standard status for nye oppgaver
        priority: priority || null,
        dueDate: dueDate || null,
        estimatedTime: estimatedTime !== '' ? parseFloat(estimatedTime) : null,
        // description, createdDate blir satt av backend om nødvendig
    };

    statusEl.textContent = "Oppretter oppgave...";
    statusEl.className = 'status-message';
    document.getElementById('submit-new-task-btn').disabled = true;

    try {
        // Bruk den globale sendDataToGoogleScript hvis den håndterer 'user' korrekt,
        // ellers må vi bruke en lokal postDataToScript_Tasks eller lignende.
        // Siden sendDataToGoogleScript i script.js nå tar 'user' fra data-objektet,
        // kan vi bruke den.
        const response = await sendDataToGoogleScript(taskData); // sendDataToGoogleScript er global fra script.js

        if (response.success) {
            statusEl.textContent = "Oppgave opprettet!";
            statusEl.className = 'status-message success';
            // Tøm skjema
            document.getElementById('new-task-name').value = '';
            document.getElementById('new-task-estimated-time').value = '';
            document.getElementById('new-task-due-date').value = '';
            document.getElementById('new-task-priority').value = '';
            // document.getElementById('new-task-customer').selectedIndex = 0; // Tilbake til placeholder

            // Oppdater dashboard data
            fetchAllDataForDashboard(); // Eller mer målrettet oppdatering
        } else {
            throw new Error(response.message || "Ukjent feil ved oppretting av oppgave.");
        }
    } catch (error) {
        console.error("Feil ved innsending av ny oppgave:", error);
        statusEl.textContent = `Feil: ${error.message}`;
        statusEl.className = 'status-message error';
    } finally {
        document.getElementById('submit-new-task-btn').disabled = false;
    }
}
