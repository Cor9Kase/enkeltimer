// daily-summary.js (Oppdatert for brukerbytte og fjerning av GOOGLE_SCRIPT_URL deklarasjon)

// --- Konfigurasjon ---
// const GOOGLE_SCRIPT_URL = '...'; // FJERNET: Denne hentes nå globalt fra script.js
// Sørg for at script.js er lastet før denne filen, og at GOOGLE_SCRIPT_URL der er korrekt.


// Overtidsterskel
const WEEKDAY_OVERTIME_THRESHOLD = 8;

// Globale variabler
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
// timeLogDataForMonth vil bli fylt av loadDailySummary

// --- Initialisering ---
document.addEventListener('DOMContentLoaded', function() {
  console.log("Daily Summary DOM lastet.");
  if (typeof currentUserSuffix === 'undefined') {
    console.warn("currentUserSuffix er ikke definert ved DOMContentLoaded i daily-summary.js. Fallback.");
    // eslint-disable-next-line no-global-assign
    currentUserSuffix = localStorage.getItem('currentUserSuffix') || 'C';
  }

  // Sjekk om den GLOBALE GOOGLE_SCRIPT_URL er tilgjengelig
  if (typeof GOOGLE_SCRIPT_URL === 'undefined' || !GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("DIN_NETTAPP_URL_HER")) {
     alert("KRITISK FEIL: GOOGLE_SCRIPT_URL er ikke tilgjengelig eller riktig satt globalt (sjekk script.js)!");
     const statusElement = document.getElementById('last-updated');
     if (statusElement) statusElement.textContent = 'Konfigurasjonsfeil!';
     return; // Stopp videre lasting
  }

  updateCurrentDateHeader_DailySummary();
  setupEventListeners_DailySummary();
  loadDailySummary();
});

// --- Hjelpefunksjoner ---
function updateCurrentDateHeader_DailySummary() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const displayElement = document.getElementById('current-date');
  if(displayElement) displayElement.textContent = now.toLocaleDateString('no-NO', options);
}

function setupEventListeners_DailySummary() {
  document.getElementById('prev-month')?.addEventListener('click', () => navigateMonth(-1));
  document.getElementById('next-month')?.addEventListener('click', () => navigateMonth(1));
  document.getElementById('refresh-button')?.addEventListener('click', loadDailySummary);
  document.querySelector('#dayDetailsModal .close')?.addEventListener('click', () => closeModal('dayDetailsModal')); // Bruker global closeModal

  window.addEventListener('click', function(event) {
    document.querySelectorAll('.modal').forEach(modal => {
        if (modal.style.display === 'block' && event.target === modal) {
            closeModal(modal.id); // Bruker global closeModal
        }
    });
  });
}

function navigateMonth(direction) {
  currentMonth += direction;
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  else if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  loadDailySummary();
}

function updateMonthDisplay() {
  const monthNames = ['Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Desember'];
  const displayElement = document.getElementById('month-display');
  if (displayElement) displayElement.textContent = `${monthNames[currentMonth]} ${currentYear}`;
}

// --- Datahenting ---
function loadDailySummary() {
  if (typeof currentUserSuffix === 'undefined') {
    console.error("loadDailySummary: currentUserSuffix ikke definert.");
    // eslint-disable-next-line no-global-assign
    currentUserSuffix = localStorage.getItem('currentUserSuffix') || 'C';
  }
  console.log(`Laster sammendrag for bruker: ${currentUserSuffix}, måned: ${currentMonth + 1}/${currentYear}`);
  updateMonthDisplay();
  const statusElement = document.getElementById('last-updated');
  if (statusElement) statusElement.textContent = 'Henter data...';

  setCardValue('month-allocated-total', 'Laster...');
  setCardValue('month-remaining-total', 'Laster...');
  setCardValue('month-total', 'Laster...');
  setCardValue('day-average', 'Laster...');
  setCardValue('month-overtime', 'Laster...');
  const tableBody = document.getElementById('summary-table-body');
  if(tableBody) tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">Laster data...</td></tr>';

  const timeLogParams = { action: 'getTimeLog', month: currentMonth + 1, year: currentYear, user: currentUserSuffix };
  const customerTotalsParams = { action: 'getCustomerTotalsForMonth', month: currentMonth + 1, year: currentYear, user: currentUserSuffix };

  Promise.all([
      fetchDataFromScript_DailySummary(timeLogParams),
      fetchDataFromScript_DailySummary(customerTotalsParams)
  ])
  .then(([timeLogResponse, customerTotalsResponse]) => {
      let timeLogDataForMonth = [];
      if (timeLogResponse && timeLogResponse.success && Array.isArray(timeLogResponse.timeLog)) {
        timeLogDataForMonth = timeLogResponse.timeLog || [];
      }
      let customerTotals = { totalAllocated: 0, totalRemaining: 0 };
      if (customerTotalsResponse && customerTotalsResponse.success) {
          customerTotals = {
              totalAllocated: customerTotalsResponse.totalAllocated || 0,
              totalRemaining: customerTotalsResponse.totalRemaining || 0
          };
      }
      renderDailySummary(timeLogDataForMonth, customerTotals);
      if (statusElement) statusElement.textContent = new Date().toLocaleTimeString('nb-NO');
  })
  .catch(error => {
       console.error(`Feil under henting av data for måneden (bruker ${currentUserSuffix}):`, error);
       if (statusElement) statusElement.textContent = 'Feil ved lasting';
       // ... (resten av feilhåndtering)
       setCardValue('month-allocated-total', 'Feil');
       setCardValue('month-remaining-total', 'Feil');
       setCardValue('month-total', 'Feil');
       setCardValue('day-average', 'Feil');
       setCardValue('month-overtime', 'Feil');
       if(tableBody) tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--bar-red);">Kunne ikke laste data.</td></tr>';
  });
}

function fetchDataFromScript_DailySummary(params) {
    const urlParams = new URLSearchParams(params);
    urlParams.append('nocache', Date.now());
    // GOOGLE_SCRIPT_URL er nå global
    const directFetchUrl = `${GOOGLE_SCRIPT_URL}?${urlParams.toString()}`;
    console.log(`Forsøker direkte fetch for ${params.user} (daily-summary):`, directFetchUrl);
    return fetch(directFetchUrl)
        .then(response => {
            if (!response.ok) {
                 return response.text().then(text => { throw new Error(text || `Nettverksfeil: ${response.status}`); });
            }
            return response.json();
        })
        .catch(error => {
            console.warn(`Direkte fetch feilet (${error.message}) for ${params.user} (daily-summary), prøver JSONP.`);
            const callbackType = params.action || 'generic_daily';
            return fetchWithJSONP_DailySummary(params, callbackType);
        });
}

function fetchWithJSONP_DailySummary(params, callbackType = 'generic_daily') {
  return new Promise((resolve, reject) => {
    const callbackName = `googleScriptCallback_${currentUserSuffix}_${callbackType}_${Date.now()}`;
    const urlParams = new URLSearchParams(params);
    urlParams.append('callback', callbackName);
    urlParams.append('nocache', Date.now());
    // GOOGLE_SCRIPT_URL er nå global
    const jsonpUrl = `${GOOGLE_SCRIPT_URL}?${urlParams.toString()}`;
    console.log(`Starter JSONP for ${params.user} (daily-summary):`, jsonpUrl);
    let scriptElement = null;
    let timeoutId = null;
    const cleanup = () => { /* ... (uendret) ... */ 
      clearTimeout(timeoutId);
      delete window[callbackName];
      if (scriptElement && scriptElement.parentNode) scriptElement.parentNode.removeChild(scriptElement);
    };
    timeoutId = setTimeout(() => { cleanup(); reject(new Error('JSONP tidsavbrudd.')); }, 15000);
    window[callbackName] = (data) => { cleanup(); resolve(data); };
    scriptElement = document.createElement('script');
    scriptElement.src = jsonpUrl;
    scriptElement.onerror = (err) => { cleanup(); reject(new Error('JSONP script feil.')); };
    document.body.appendChild(scriptElement);
  });
}

// --- Rendering ---
function setCardValue(elementId, value) {
    // ... (uendret) ...
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = value;
        if (elementId === 'month-remaining-total' && value !== 'Laster...' && value !== 'Feil') {
             const numericValue = parseFloat(String(value).replace(' timer', '')) || 0;
             element.style.color = numericValue < 0 ? 'var(--bar-red)' : 'var(--accent-primary)';
        }
    }
}

function renderDailySummary(summaryData, customerTotals) {
    // ... (resten av funksjonen er uendret, men bruker nå globale variabler som er korrekt fylt) ...
    console.log(`Rendrer daglig sammendrag for ${currentUserSuffix} med tidslogg:`, summaryData.length, "dager");
    console.log(`Rendrer med kundetotaler for ${currentUserSuffix}:`, customerTotals);

    const tableBody = document.getElementById('summary-table-body');
    const tableHeadRow = document.querySelector('#daily-summary-table thead tr');

    setCardValue('month-allocated-total', (customerTotals?.totalAllocated || 0).toFixed(2) + ' timer');
    setCardValue('month-remaining-total', (customerTotals?.totalRemaining || 0).toFixed(2) + ' timer');

    if (!tableBody || !tableHeadRow) return;
    tableBody.innerHTML = '';

    if (!tableHeadRow.querySelector('th.overtime-header')) {
        const th = document.createElement('th');
        th.textContent = 'Overtid';
        th.classList.add('overtime-header');
        if (tableHeadRow.cells[3]) { 
            tableHeadRow.insertBefore(th, tableHeadRow.cells[3]);
        } else {
            tableHeadRow.appendChild(th); 
        }
    }

    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const dateMap = {};
    summaryData.forEach(entry => { dateMap[entry.date] = entry; });

    let totalMonthHours = 0;
    let totalMonthOvertime = 0;
    let workDaysWithHours = 0;
    const todayComp = new Date();
    todayComp.setHours(0, 0, 0, 0);

    for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(currentYear, currentMonth, i);
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        const weekDay = date.getDay();
        const isFutureDate = date > todayComp;
        const isToday = date.getTime() === todayComp.getTime();

        const row = tableBody.insertRow();
        if (weekDay === 0 || weekDay === 6) row.classList.add('weekend');
        if (isToday) row.classList.add('current-day');

        const dateCell = row.insertCell();
        const weekDayCell = row.insertCell();
        const hoursCell = row.insertCell();
        const overtimeCell = row.insertCell();
        const customersCell = row.insertCell();
        const detailsCell = row.insertCell();

        dateCell.textContent = date.toLocaleDateString('no-NO', { day: 'numeric', month: 'numeric' });
        if (isToday) {
            const todayPill = document.createElement('span');
            todayPill.textContent = 'I DAG'; todayPill.className = 'today-pill';
            dateCell.appendChild(todayPill);
        }
        const weekDayNames = ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'];
        weekDayCell.textContent = weekDayNames[weekDay];

        const entry = dateMap[dateStr];
        let dailyOvertime = 0;

        if (entry) {
            const dailyTotalHours = entry.totalHours;
            hoursCell.textContent = dailyTotalHours.toFixed(2);
            customersCell.textContent = entry.customers.length;
            if (weekDay === 0 || weekDay === 6) {
                dailyOvertime = dailyTotalHours;
            } else if (dailyTotalHours > WEEKDAY_OVERTIME_THRESHOLD) {
                dailyOvertime = dailyTotalHours - WEEKDAY_OVERTIME_THRESHOLD;
            }
            overtimeCell.textContent = dailyOvertime > 0 ? dailyOvertime.toFixed(2) : '-';
            if (dailyOvertime > 0) overtimeCell.style.color = 'var(--bar-yellow)';
            else overtimeCell.style.color = '';

            const detailBtn = document.createElement('button');
            detailBtn.className = 'detail-btn'; detailBtn.textContent = 'Vis';
            detailBtn.onclick = () => showDayDetails(entry, date);
            detailsCell.appendChild(detailBtn);

            if (!isFutureDate) {
                totalMonthHours += dailyTotalHours;
                totalMonthOvertime += dailyOvertime;
                if (weekDay > 0 && weekDay < 6 && dailyTotalHours > 0) {
                    workDaysWithHours++;
                }
            }
        } else if (!isFutureDate) {
            hoursCell.textContent = '-';
            overtimeCell.textContent = '-';
            customersCell.textContent = '-';
            detailsCell.textContent = '-';
        } else {
            hoursCell.textContent = '';
            overtimeCell.textContent = '';
            customersCell.textContent = '';
            detailsCell.textContent = '';
        }
    }

    setCardValue('month-total', totalMonthHours.toFixed(2) + ' timer');
    const average = workDaysWithHours > 0 ? (totalMonthHours / workDaysWithHours) : 0;
    setCardValue('day-average', average.toFixed(2) + ' timer');
    setCardValue('month-overtime', totalMonthOvertime.toFixed(2) + ' timer');
    console.log(`Månedstotal (${currentUserSuffix}): Logget=${totalMonthHours.toFixed(2)}, Overtid=${totalMonthOvertime.toFixed(2)}, Dager m/timer=${workDaysWithHours}, Snitt=${average.toFixed(2)}`);
}

function showDayDetails(entry, date) {
    // ... (uendret, bruker global closeModal) ...
    const modal = document.getElementById('dayDetailsModal');
    if (!modal) return;
    const dateStr = date.toLocaleDateString('no-NO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('detail-date').textContent = dateStr;
    document.getElementById('detail-total-hours').textContent = entry.totalHours.toFixed(2);
    document.getElementById('detail-customer-count').textContent = entry.customers.length;
    const tableBody = document.getElementById('detail-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    const sortedCustomers = [...entry.customers].sort((a, b) => b.hours - a.hours);
    sortedCustomers.forEach(customer => {
        const row = tableBody.insertRow();
        row.insertCell().textContent = customer.name;
        row.insertCell().textContent = customer.hours.toFixed(2);
        const commentCell = row.insertCell();
        commentCell.textContent = customer.comment || '-';
    });
    modal.style.display = 'block';
}

// closeModal er nå global i script.js

// Mock data-funksjon (uendret i logikk, men bruker nå global currentUserSuffix)
function useMockTimeLogData_DailySummary() {
  console.warn(`Bruker mock data for daglig sammendrag (bruker: ${currentUserSuffix}).`);
  const mockTimeLog = generateMockData_DailySummary();
  const mockCustomerTotals = { totalAllocated: 160, totalRemaining: 85.5 };
  renderDailySummary(mockTimeLog, mockCustomerTotals);
  const statusElement = document.getElementById('last-updated');
  if (statusElement) statusElement.textContent = `Frakoblet modus (testdata for ${currentUserSuffix})`;
}

function generateMockData_DailySummary() {
    // ... (uendret, men logger nå med currentUserSuffix) ...
    console.log(`Genererer mock data for ${currentMonth + 1}/${currentYear} (bruker: ${currentUserSuffix})`);
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const mockSummary = {};
    const today = new Date();
    today.setHours(0,0,0,0);

    for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(currentYear, currentMonth, i);
        if (date > today) continue;
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        const weekDay = date.getDay();

        if (Math.random() < 0.7) {
            const numEntries = Math.floor(Math.random() * 3) + 1;
            let dayTotalHours = 0;
            const dayCustomers = [];
            for(let j=0; j < numEntries; j++) {
                const customerHours = parseFloat((Math.random() * (weekDay === 0 || weekDay === 6 ? 3 : 7) + 0.5).toFixed(2));
                dayTotalHours += customerHours;
                dayCustomers.push({
                    name: `Mock Kunde ${currentUserSuffix}-${String.fromCharCode(65 + j)}`, 
                    hours: customerHours,
                    comment: `Mock arbeid ${i}/${currentMonth+1} (${currentUserSuffix})`
                });
            }
            mockSummary[dateStr] = {
                date: dateStr,
                totalHours: parseFloat(dayTotalHours.toFixed(2)),
                customers: dayCustomers
            };
        }
    }
    const summaryArray = Object.values(mockSummary);
    summaryArray.sort((a, b) => a.date.localeCompare(b.date));
    console.log("Generert mock data (tidslogg):", summaryArray);
    return summaryArray;
}
