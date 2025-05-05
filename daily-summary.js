// Google Script URL - *** VIKTIG: MÅ VÆRE SAMME SOM I script.js ***
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxmCUCFoYzj9e4ys_lslz_bHRCWnzxwTwCzTRQeXH0qtsn4nVtfC_ZBHGh7YZs-6oY-/exec'; // <-- ERSTATT MED DIN FAKTISKE URL HVIS DENNE ER FEIL

// --- NY KONSTANT for overtidsterskel ---
const WEEKDAY_OVERTIME_THRESHOLD = 8; // Timer før overtid starter på hverdager

// Globale variabler
let currentMonth = new Date().getMonth(); // 0 = Januar, 11 = Desember
let currentYear = new Date().getFullYear();
let timeLogDataForMonth = []; // Lagrer dataene for den viste måneden

// Initialiser siden
document.addEventListener('DOMContentLoaded', function() {
  console.log("Daily Summary DOM lastet.");
  updateCurrentDateHeader();
  document.getElementById('prev-month')?.addEventListener('click', () => navigateMonth(-1));
  document.getElementById('next-month')?.addEventListener('click', () => navigateMonth(1));
  document.getElementById('refresh-button')?.addEventListener('click', loadDailySummary);
  loadDailySummary();

  // Lukk modal ved klikk utenfor
  window.addEventListener('click', function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (modal.style.display === 'block' && event.target === modal) {
            closeModal(modal.id);
        }
    });
  });
});

// Oppdaterer header-dato
function updateCurrentDateHeader() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const displayElement = document.getElementById('current-date');
  if(displayElement) displayElement.textContent = now.toLocaleDateString('no-NO', options);
}

// Bytt måned
function navigateMonth(direction) {
  currentMonth += direction;
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  else if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  console.log(`Navigerer til måned: ${currentMonth + 1}, år: ${currentYear}`);
  loadDailySummary();
}

// Oppdater månedsdisplay
function updateMonthDisplay() {
  const monthNames = ['Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Desember'];
  const displayElement = document.getElementById('month-display');
  if (displayElement) displayElement.textContent = `${monthNames[currentMonth]} ${currentYear}`;
}

// Last data fra script
function loadDailySummary() {
  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL === 'DIN_NETTAPP_URL_HER') {
       alert("FEIL: GOOGLE_SCRIPT_URL er ikke satt i daily-summary.js!");
       const statusElement = document.getElementById('last-updated');
       if (statusElement) statusElement.textContent = 'Konfigurasjonsfeil!';
       return;
  }
  console.log(`Laster sammendrag for ${currentMonth + 1}/${currentYear}`);
  updateMonthDisplay();
  const statusElement = document.getElementById('last-updated');
  if (statusElement) statusElement.textContent = 'Henter data...';

  fetchDataFromScript({ action: 'getTimeLog', month: currentMonth + 1, year: currentYear })
    .then(data => {
      console.log("Mottatt data fra script:", data);
      if (data && data.success && Array.isArray(data.timeLog)) {
        processTimeLogData(data);
      } else {
        throw new Error(data.message || 'Ugyldig responsformat mottatt.');
      }
    })
    .catch(error => {
      console.error('Feil under henting av tidslogg:', error);
      if (statusElement) statusElement.textContent = 'Feil ved lasting';
      alert(`Kunne ikke laste data: ${error.message}\nPrøver å vise eventuelle gamle data eller testdata.`);
      if (!timeLogDataForMonth || timeLogDataForMonth.length === 0) useMockTimeLogData();
      else {
           renderDailySummary(timeLogDataForMonth);
           if (statusElement) statusElement.textContent = 'Viser gamle data (feil ved oppdatering)';
      }
    });
}

// Hent data (Fetch med JSONP fallback)
function fetchDataFromScript(params) {
    const urlParams = new URLSearchParams(params);
    urlParams.append('nocache', Date.now());
    const directFetchUrl = `${GOOGLE_SCRIPT_URL}?${urlParams.toString()}`;
    console.log("Forsøker direkte fetch:", directFetchUrl);
    return fetch(directFetchUrl)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error ${response.status}`);
            return response.json();
        })
        .catch(error => {
            console.warn(`Direkte fetch feilet (${error.message}), prøver JSONP.`);
            return fetchTimeLogWithJSONP(params);
        });
}
function fetchTimeLogWithJSONP(params) {
  return new Promise((resolve, reject) => {
    const callbackName = 'googleScriptTimeLogCallback_' + Date.now();
    const urlParams = new URLSearchParams(params);
    urlParams.append('callback', callbackName);
    urlParams.append('nocache', Date.now());
    const jsonpUrl = `${GOOGLE_SCRIPT_URL}?${urlParams.toString()}`;
    console.log("Starter JSONP:", jsonpUrl);
    let scriptElement = null;
    let timeoutId = null;
    const cleanup = () => {
      clearTimeout(timeoutId);
      delete window[callbackName];
      if (scriptElement && scriptElement.parentNode) scriptElement.parentNode.removeChild(scriptElement);
      console.log("JSONP cleanup utført for", callbackName);
    };
    timeoutId = setTimeout(() => {
      console.error("JSONP timed out for", callbackName);
      cleanup();
      reject(new Error('JSONP-forespørsel tidsavbrutt (10 sek).'));
    }, 10000);
    window[callbackName] = (data) => {
      console.log("JSONP callback mottatt for", callbackName);
      cleanup();
      resolve(data);
    };
    scriptElement = document.createElement('script');
    scriptElement.src = jsonpUrl;
    scriptElement.onerror = (err) => {
      console.error("Feil ved lasting av JSONP script:", err);
      cleanup();
      reject(new Error('Kunne ikke laste JSONP script.'));
    };
    document.body.appendChild(scriptElement);
  });
}

// Behandle mottatt data
function processTimeLogData(data) {
  timeLogDataForMonth = data.timeLog || [];
  renderDailySummary(timeLogDataForMonth);
  const statusElement = document.getElementById('last-updated');
  if (statusElement) statusElement.textContent = new Date().toLocaleTimeString('nb-NO');
}

// Bruk mock data
function useMockTimeLogData() {
  console.warn('Bruker mock data for daglig sammendrag.');
  timeLogDataForMonth = generateMockData();
  renderDailySummary(timeLogDataForMonth);
  const statusElement = document.getElementById('last-updated');
  if (statusElement) statusElement.textContent = 'Frakoblet modus (testdata)';
}

// Generer mock data
function generateMockData() {
  console.log(`Genererer mock data for ${currentMonth + 1}/${currentYear}`);
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

    if (Math.random() < 0.7) { // Ikke data for alle dager
        const numEntries = Math.floor(Math.random() * 5) + 1;
        let dayTotalHours = 0;
        const dayCustomers = [];
        for(let j=0; j < numEntries; j++) {
            const customerHours = parseFloat((Math.random() * (weekDay === 0 || weekDay === 6 ? 4 : 10) + 0.25).toFixed(2)); // Mer tid mulig på hverdager
            dayTotalHours += customerHours;
            dayCustomers.push({
                name: `Testkunde ${String.fromCharCode(65 + j)}`,
                hours: customerHours,
                comment: `Mock arbeid ${i}/${currentMonth+1}`
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
  console.log("Generert mock data:", summaryArray);
  return summaryArray;
}


// ----- START OPPDATERT renderDailySummary med Overtid -----
function renderDailySummary(summaryData) {
  console.log("Rendrer daglig sammendrag med data:", summaryData);
  const tableBody = document.getElementById('summary-table-body');
  const tableHeadRow = document.querySelector('#daily-summary-table thead tr'); // Hent header-rad

  if (!tableBody || !tableHeadRow) {
      console.error("FEIL: Finner ikke tabell-body eller header-rad!");
      return;
  }
  tableBody.innerHTML = ''; // Tøm tabellen

  // --- Legg til Overtid-kolonne i header hvis den ikke finnes ---
  if (tableHeadRow.cells.length === 5) { // Sjekk antall celler (originalt 5)
      const th = document.createElement('th');
      th.textContent = 'Overtid';
      // Sett inn FØR "Antall kunder" (index 3)
      tableHeadRow.insertBefore(th, tableHeadRow.cells[3]);
      console.log("La til Overtid-kolonne i header.");
  }

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const dateMap = {};
  summaryData.forEach(entry => { dateMap[entry.date] = entry; });

  let totalMonthHours = 0;
  let totalMonthOvertime = 0; // <-- Ny variabel for total overtid
  let workDaysWithHours = 0;
  const todayComp = new Date();
  todayComp.setHours(0, 0, 0, 0);

  // Gå gjennom hver dag i den valgte måneden
  for (let i = 1; i <= daysInMonth; i++) {
    const date = new Date(currentYear, currentMonth, i);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const weekDay = date.getDay(); // 0=Søndag, 6=Lørdag
    const isFutureDate = date > todayComp;
    const isToday = date.getTime() === todayComp.getTime();

    const row = tableBody.insertRow();
    if (weekDay === 0 || weekDay === 6) row.classList.add('weekend');
    if (isToday) row.classList.add('current-day');

    // Celler (nå 6 totalt hvis header er oppdatert)
    const dateCell = row.insertCell();
    const weekDayCell = row.insertCell();
    const hoursCell = row.insertCell();
    const overtimeCell = row.insertCell(); // <-- Ny celle for daglig overtid
    const customersCell = row.insertCell();
    const detailsCell = row.insertCell();

    // Formater dato og ukedag
    dateCell.textContent = date.toLocaleDateString('no-NO', { day: 'numeric', month: 'numeric' });
    if (isToday) {
         const todayPill = document.createElement('span');
         todayPill.textContent = 'I DAG'; todayPill.className = 'today-pill';
         dateCell.appendChild(todayPill);
    }
    const weekDayNames = ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'];
    weekDayCell.textContent = weekDayNames[weekDay];

    // Hent data for dagen
    const entry = dateMap[dateStr];
    let dailyOvertime = 0; // Initialiser daglig overtid

    if (entry) {
      const dailyTotalHours = entry.totalHours;
      hoursCell.textContent = dailyTotalHours.toFixed(2);
      customersCell.textContent = entry.customers.length;

      // Beregn daglig overtid
      if (weekDay === 0 || weekDay === 6) { // Helg
          dailyOvertime = dailyTotalHours;
      } else if (dailyTotalHours > WEEKDAY_OVERTIME_THRESHOLD) { // Hverdag over grense
          dailyOvertime = dailyTotalHours - WEEKDAY_OVERTIME_THRESHOLD;
      }
      // Vis daglig overtid (eller '-')
      overtimeCell.textContent = dailyOvertime > 0 ? dailyOvertime.toFixed(2) : '-';
      if (dailyOvertime > 0) overtimeCell.style.color = 'var(--bar-yellow)'; // Gult for overtid

      // Lag detaljknapp
      const detailBtn = document.createElement('button');
      detailBtn.className = 'detail-btn'; detailBtn.textContent = 'Vis';
      detailBtn.onclick = () => showDayDetails(entry, date);
      detailsCell.appendChild(detailBtn);

      // Oppdater totaler KUN hvis ikke fremtid
      if (!isFutureDate) {
           totalMonthHours += dailyTotalHours;
           totalMonthOvertime += dailyOvertime; // <-- Summer månedlig overtid
           if (weekDay > 0 && weekDay < 6 && dailyTotalHours > 0) { // Tell arbeidsdager med timer
               workDaysWithHours++;
           }
      }

    } else if (!isFutureDate) { // Vis '-' for fortid/nåtid uten data
      hoursCell.textContent = '-';
      overtimeCell.textContent = '-'; // <-- Overtid er også '-'
      customersCell.textContent = '-';
      detailsCell.textContent = '-';
    } else { // La celler for fremtiden være tomme
        hoursCell.textContent = '';
        overtimeCell.textContent = ''; // <-- Overtid er også tom
        customersCell.textContent = '';
        detailsCell.textContent = '';
    }
  } // Slutt på dag-loop

  // Oppdater kortene med totaler
  const monthTotalElement = document.getElementById('month-total');
  const dayAverageElement = document.getElementById('day-average');
  const monthOvertimeElement = document.getElementById('month-overtime'); // Hent nytt element

  if(monthTotalElement) monthTotalElement.textContent = totalMonthHours.toFixed(2) + ' timer';
  const average = workDaysWithHours > 0 ? (totalMonthHours / workDaysWithHours) : 0;
  if(dayAverageElement) dayAverageElement.textContent = average.toFixed(2) + ' timer';
  // --- Oppdater Overtid display ---
  if(monthOvertimeElement) monthOvertimeElement.textContent = totalMonthOvertime.toFixed(2) + ' timer';

  console.log(`Månedstotal: ${totalMonthHours.toFixed(2)}, Overtid: ${totalMonthOvertime.toFixed(2)}, Arbeidsdager m/timer: ${workDaysWithHours}, Snitt: ${average.toFixed(2)}`);
}
// ----- SLUTT OPPDATERT renderDailySummary -----


// Viser detaljmodalen
function showDayDetails(entry, date) {
  console.log("Viser detaljer for:", entry);
  const modal = document.getElementById('dayDetailsModal');
  if (!modal) return;

  const dateStr = date.toLocaleDateString('no-NO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const detailDateEl = document.getElementById('detail-date');
  const detailTotalHoursEl = document.getElementById('detail-total-hours');
  const detailCustomerCountEl = document.getElementById('detail-customer-count');
  const tableBody = document.getElementById('detail-table-body');

  if (!detailDateEl || !detailTotalHoursEl || !detailCustomerCountEl || !tableBody) {
      console.error("FEIL: Mangler elementer i detalj-modalen!");
      return;
  }

  detailDateEl.textContent = dateStr;
  detailTotalHoursEl.textContent = entry.totalHours.toFixed(2);
  detailCustomerCountEl.textContent = entry.customers.length;
  tableBody.innerHTML = '';

  const sortedCustomers = [...entry.customers].sort((a, b) => b.hours - a.hours);
  sortedCustomers.forEach(customer => {
    const row = tableBody.insertRow();
    row.insertCell().textContent = customer.name;
    row.insertCell().textContent = customer.hours.toFixed(2);
    const commentCell = row.insertCell();
    commentCell.textContent = customer.comment || '-';
    commentCell.style.whiteSpace = "pre-wrap";
    commentCell.style.wordBreak = "break-word";
  });

  modal.style.display = 'block';
}

// Lukker modalvinduer
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = 'none';
  else console.warn(`Forsøkte å lukke ukjent modal: ${modalId}`);
}
