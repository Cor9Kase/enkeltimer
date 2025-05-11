// daily-summary.js (Oppdatert for brukerbytte)

// --- Konfigurasjon ---
// Google Script URL - *** VIKTIG: MÅ VÆRE SAMME SOM I ANDRE JS-FILER ***
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx_dXtCW0Tb630y7QxP8aOZBzuox8cVWabX1E6zJEu78VbG0TYdAfzqiWO1wToNV-7R/exec'; // <-- ERSTATT MED DIN FAKTISKE URL HVIS DENNE ER FEIL

// Overtidsterskel
const WEEKDAY_OVERTIME_THRESHOLD = 8; // Timer før overtid starter på hverdager

// Globale variabler
let currentMonth = new Date().getMonth(); // 0 = Januar, 11 = Desember
let currentYear = new Date().getFullYear();
// timeLogDataForMonth vil bli fylt av loadDailySummary

// --- Initialisering ---
document.addEventListener('DOMContentLoaded', function() {
  console.log("Daily Summary DOM lastet.");
  // currentUserSuffix er global og satt av theme.js
  if (typeof currentUserSuffix === 'undefined') {
    console.warn("currentUserSuffix er ikke definert ved DOMContentLoaded i daily-summary.js. Forsøker å hente fra localStorage.");
    // Fallback, men theme.js bør ha initialisert dette.
    // eslint-disable-next-line no-global-assign
    currentUserSuffix = localStorage.getItem('currentUserSuffix') || 'C';
  }

  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL === 'DIN_NETTAPP_URL_HER' || GOOGLE_SCRIPT_URL.includes("SETT_INN_DIN_URL_HER")) {
     alert("FEIL: GOOGLE_SCRIPT_URL ser ikke ut til å være satt riktig i daily-summary.js!");
     const statusElement = document.getElementById('last-updated');
     if (statusElement) statusElement.textContent = 'Konfigurasjonsfeil!';
  }

  updateCurrentDateHeader_DailySummary(); // Eget navn for å unngå konflikt
  setupEventListeners_DailySummary();
  loadDailySummary(); // Start innlasting av data for den initielt valgte brukeren
});

// --- Hjelpefunksjoner (Dato, Måned, Lyttefunksjoner) ---
function updateCurrentDateHeader_DailySummary() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const displayElement = document.getElementById('current-date');
  if(displayElement) displayElement.textContent = now.toLocaleDateString('no-NO', options);
}

function setupEventListeners_DailySummary() {
  document.getElementById('prev-month')?.addEventListener('click', () => navigateMonth(-1));
  document.getElementById('next-month')?.addEventListener('click', () => navigateMonth(1));
  document.getElementById('refresh-button')?.addEventListener('click', loadDailySummary); // Bruker den globale loadDailySummary
  document.querySelector('#dayDetailsModal .close')?.addEventListener('click', () => closeModal('dayDetailsModal'));

  window.addEventListener('click', function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (modal.style.display === 'block' && event.target === modal) {
            closeModal(modal.id);
        }
    });
  });
}

function navigateMonth(direction) {
  currentMonth += direction;
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  else if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  console.log(`Navigerer til måned: ${currentMonth + 1}, år: ${currentYear} for bruker: ${currentUserSuffix}`);
  loadDailySummary();
}

function updateMonthDisplay() {
  const monthNames = ['Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Desember'];
  const displayElement = document.getElementById('month-display');
  if (displayElement) displayElement.textContent = `${monthNames[currentMonth]} ${currentYear}`;
}

// --- Datahenting ---
// Denne funksjonen er nå global slik at theme.js kan kalle den ved brukerbytte.
function loadDailySummary() {
  // Sikre at currentUserSuffix er tilgjengelig
  if (typeof currentUserSuffix === 'undefined') {
    console.error("loadDailySummary kalt, men currentUserSuffix er ikke definert. Laster ikke data.");
    // eslint-disable-next-line no-global-assign
    currentUserSuffix = localStorage.getItem('currentUserSuffix') || 'C'; // Fallback
    // return; // Kan velge å avbryte her
  }

  console.log(`Laster sammendrag for bruker: ${currentUserSuffix}, måned: ${currentMonth + 1}/${currentYear}`);
  updateMonthDisplay();
  const statusElement = document.getElementById('last-updated');
  if (statusElement) statusElement.textContent = 'Henter data...';

  // Nullstill UI-elementer
  setCardValue('month-allocated-total', 'Laster...');
  setCardValue('month-remaining-total', 'Laster...');
  setCardValue('month-total', 'Laster...');
  setCardValue('day-average', 'Laster...');
  setCardValue('month-overtime', 'Laster...');
  const tableBody = document.getElementById('summary-table-body');
  if(tableBody) tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">Laster data...</td></tr>';

  // Bygg parametere for API-kall, inkludert bruker
  const timeLogParams = { action: 'getTimeLog', month: currentMonth + 1, year: currentYear, user: currentUserSuffix };
  const customerTotalsParams = { action: 'getCustomerTotalsForMonth', month: currentMonth + 1, year: currentYear, user: currentUserSuffix };

  Promise.all([
      fetchDataFromScript_DailySummary(timeLogParams),
      fetchDataFromScript_DailySummary(customerTotalsParams)
  ])
  .then(([timeLogResponse, customerTotalsResponse]) => {
      console.log(`Mottatt tidslogg data for ${currentUserSuffix}:`, timeLogResponse);
      console.log(`Mottatt kundetotaler data for ${currentUserSuffix}:`, customerTotalsResponse);

      let timeLogDataForMonth = [];
      if (timeLogResponse && timeLogResponse.success && Array.isArray(timeLogResponse.timeLog)) {
        timeLogDataForMonth = timeLogResponse.timeLog || [];
      } else {
         console.error('Ugyldig responsformat for tidslogg mottatt.');
      }

      let customerTotals = { totalAllocated: 0, totalRemaining: 0 };
      if (customerTotalsResponse && customerTotalsResponse.success) {
          customerTotals = {
              totalAllocated: customerTotalsResponse.totalAllocated || 0,
              totalRemaining: customerTotalsResponse.totalRemaining || 0
          };
      } else {
           console.error('Ugyldig responsformat for kundetotaler mottatt.');
           setCardValue('month-allocated-total', 'Feil');
           setCardValue('month-remaining-total', 'Feil');
      }

      renderDailySummary(timeLogDataForMonth, customerTotals);
      if (statusElement) statusElement.textContent = new Date().toLocaleTimeString('nb-NO');
  })
  .catch(error => {
       console.error(`Feil under henting av data for måneden (bruker ${currentUserSuffix}):`, error);
       if (statusElement) statusElement.textContent = 'Feil ved lasting';
       alert(`Kunne ikke laste data: ${error.message}`);
       setCardValue('month-allocated-total', 'Feil');
       setCardValue('month-remaining-total', 'Feil');
       setCardValue('month-total', 'Feil');
       setCardValue('day-average', 'Feil');
       setCardValue('month-overtime', 'Feil');
       if(tableBody) tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--bar-red);">Kunne ikke laste data.</td></tr>';
  });
}

// Hent data (Fetch med JSONP fallback) - Oppdatert for å inkludere 'user' i params
function fetchDataFromScript_DailySummary(params) { // Gi unikt navn
    // params inkluderer allerede 'user: currentUserSuffix' fra loadDailySummary
    const urlParams = new URLSearchParams(params);
    urlParams.append('nocache', Date.now());
    const directFetchUrl = `${GOOGLE_SCRIPT_URL}?${urlParams.toString()}`;
    console.log(`Forsøker direkte fetch for ${params.user}:`, directFetchUrl);

    return fetch(directFetchUrl)
        .then(response => {
            if (!response.ok) {
                 return response.text().then(text => {
                    throw new Error(text || `Nettverksfeil: ${response.status}`);
                 });
            }
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                return response.json();
            } else {
                 return response.text().then(text => {
                     console.warn("Mottok ikke JSON, tekst:", text);
                     if (text.includes("googleScript")) {
                         throw new Error("Mottok uventet svar (mulig JSONP-feil). Sjekk backend-logger.");
                     }
                     throw new Error("Mottok uventet svarformat fra server.");
                 });
            }
        })
        .catch(error => {
            console.warn(`Direkte fetch feilet (${error.message}) for ${params.user}, prøver JSONP.`);
            const callbackType = params.action || 'generic_daily';
            return fetchWithJSONP_DailySummary(params, callbackType); // Gi unikt navn
        });
}

function fetchWithJSONP_DailySummary(params, callbackType = 'generic_daily') { // Gi unikt navn
  // params inkluderer allerede 'user: currentUserSuffix'
  return new Promise((resolve, reject) => {
    const callbackName = `googleScriptCallback_${currentUserSuffix}_${callbackType}_${Date.now()}`; // Inkluderer bruker i callback
    const urlParams = new URLSearchParams(params);
    urlParams.append('callback', callbackName);
    urlParams.append('nocache', Date.now());
    const jsonpUrl = `${GOOGLE_SCRIPT_URL}?${urlParams.toString()}`;
    console.log(`Starter JSONP for ${params.user}:`, jsonpUrl);
    let scriptElement = null;
    let timeoutId = null;

    const cleanup = () => {
      clearTimeout(timeoutId);
      delete window[callbackName];
      if (scriptElement && scriptElement.parentNode) scriptElement.parentNode.removeChild(scriptElement);
    };

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('JSONP-forespørsel tidsavbrutt (15 sek).'));
    }, 15000);

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    scriptElement = document.createElement('script');
    scriptElement.src = jsonpUrl;
    scriptElement.onerror = (err) => {
      cleanup();
      reject(new Error('Kunne ikke laste JSONP script.'));
    };
    document.body.appendChild(scriptElement);
  });
}

// --- Rendering ---
function setCardValue(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = value;
        if (elementId === 'month-remaining-total' && value !== 'Laster...' && value !== 'Feil') {
             const numericValue = parseFloat(String(value).replace(' timer', '')) || 0;
             element.style.color = numericValue < 0 ? 'var(--bar-red)' : 'var(--accent-primary)';
        }
    } else {
        // console.warn(`Element med ID ${elementId} ble ikke funnet for oppdatering.`);
    }
}

function renderDailySummary(summaryData, customerTotals) {
  console.log(`Rendrer daglig sammendrag for ${currentUserSuffix} med tidslogg:`, summaryData.length, "dager");
  console.log(`Rendrer med kundetotaler for ${currentUserSuffix}:`, customerTotals);

  const tableBody = document.getElementById('summary-table-body');
  const tableHeadRow = document.querySelector('#daily-summary-table thead tr');

  setCardValue('month-allocated-total', (customerTotals?.totalAllocated || 0).toFixed(2) + ' timer');
  setCardValue('month-remaining-total', (customerTotals?.totalRemaining || 0).toFixed(2) + ' timer');

  if (!tableBody || !tableHeadRow) {
      console.error("FEIL: Finner ikke tabell-body eller header-rad!");
      return;
  }
  tableBody.innerHTML = '';

  if (!tableHeadRow.querySelector('th.overtime-header')) {
      const th = document.createElement('th');
      th.textContent = 'Overtid';
      th.classList.add('overtime-header');
      if (tableHeadRow.cells[3]) { // Sjekk om cellen finnes
        tableHeadRow.insertBefore(th, tableHeadRow.cells[3]);
      } else {
        tableHeadRow.appendChild(th); // Fallback hvis det er færre celler
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

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = 'none';
}

// Mock data-funksjon (kan brukes for testing hvis API feiler)
function useMockTimeLogData_DailySummary() { // Gi unikt navn
  console.warn(`Bruker mock data for daglig sammendrag (bruker: ${currentUserSuffix}).`);
  // Denne mock-dataen er ikke brukerspesifikk.
  const mockTimeLog = generateMockData_DailySummary(); // Gi unikt navn
  const mockCustomerTotals = { totalAllocated: 160, totalRemaining: 85.5 };
  renderDailySummary(mockTimeLog, mockCustomerTotals);
  const statusElement = document.getElementById('last-updated');
  if (statusElement) statusElement.textContent = `Frakoblet modus (testdata for ${currentUserSuffix})`;
}

function generateMockData_DailySummary() { // Gi unikt navn
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
        const numEntries = Math.floor(Math.random() * 3) + 1; // Litt færre mock-kunder per dag
        let dayTotalHours = 0;
        const dayCustomers = [];
        for(let j=0; j < numEntries; j++) {
            const customerHours = parseFloat((Math.random() * (weekDay === 0 || weekDay === 6 ? 3 : 7) + 0.5).toFixed(2));
            dayTotalHours += customerHours;
            dayCustomers.push({
                name: `Mock Kunde ${currentUserSuffix}-${String.fromCharCode(65 + j)}`, // Inkluder bruker i mock-navn
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
