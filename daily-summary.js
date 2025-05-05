// --- Konfigurasjon ---
// Google Script URL - *** VIKTIG: MÅ VÆRE SAMME SOM I ANDRE JS-FILER ***
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx2ukbDWH_fwz3S1Y4WfYbiL4D1lSQoUdQflmOvxWM4yoMOADF9Lh92lZzirerjC3Ew/exec'; // <-- ERSTATT MED DIN FAKTISKE URL HVIS DENNE ER FEIL

// Overtidsterskel
const WEEKDAY_OVERTIME_THRESHOLD = 8; // Timer før overtid starter på hverdager

// Globale variabler
let currentMonth = new Date().getMonth(); // 0 = Januar, 11 = Desember
let currentYear = new Date().getFullYear();
let timeLogDataForMonth = []; // Lagrer KUN tidsloggdataene for den viste måneden

// --- Initialisering ---
document.addEventListener('DOMContentLoaded', function() {
  console.log("Daily Summary DOM lastet.");
  // Sjekk URL ved oppstart
  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL === 'DIN_NETTAPP_URL_HER' || GOOGLE_SCRIPT_URL.includes("SETT_INN_DIN_URL_HER")) {
     alert("FEIL: GOOGLE_SCRIPT_URL ser ikke ut til å være satt riktig i daily-summary.js!");
     const statusElement = document.getElementById('last-updated');
     if (statusElement) statusElement.textContent = 'Konfigurasjonsfeil!';
     // Vurder å stoppe videre lasting her eller vise en tydeligere feilmelding
  }

  updateCurrentDateHeader();
  setupEventListeners_DailySummary(); // Gi et unikt navn for å unngå konflikter
  loadDailySummary(); // Start innlasting av data

  // Lukk modal ved klikk utenfor
  window.addEventListener('click', function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (modal.style.display === 'block' && event.target === modal) {
            closeModal(modal.id); // Bruker felles closeModal-funksjon
        }
    });
  });
});

// --- Hjelpefunksjoner (Dato, Måned, Lyttefunksjoner) ---
function updateCurrentDateHeader() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const displayElement = document.getElementById('current-date');
  if(displayElement) displayElement.textContent = now.toLocaleDateString('no-NO', options);
}

function setupEventListeners_DailySummary() {
  document.getElementById('prev-month')?.addEventListener('click', () => navigateMonth(-1));
  document.getElementById('next-month')?.addEventListener('click', () => navigateMonth(1));
  document.getElementById('refresh-button')?.addEventListener('click', loadDailySummary);
   // Lukkeknapp for detaljmodal
  document.querySelector('#dayDetailsModal .close')?.addEventListener('click', () => closeModal('dayDetailsModal'));
}

function navigateMonth(direction) {
  currentMonth += direction;
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  else if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  console.log(`Navigerer til måned: ${currentMonth + 1}, år: ${currentYear}`);
  loadDailySummary(); // Last data for den nye måneden
}

function updateMonthDisplay() {
  const monthNames = ['Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Desember'];
  const displayElement = document.getElementById('month-display');
  if (displayElement) displayElement.textContent = `${monthNames[currentMonth]} ${currentYear}`;
}

// --- Datahenting ---
function loadDailySummary() {
  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("SETT_INN_DIN_URL_HER")) { // Ekstra sjekk
     console.error("loadDailySummary avbrutt: GOOGLE_SCRIPT_URL mangler.");
     return;
  }
  console.log(`Laster sammendrag og kundetotaler for ${currentMonth + 1}/${currentYear}`);
  updateMonthDisplay();
  const statusElement = document.getElementById('last-updated');
  if (statusElement) statusElement.textContent = 'Henter data...';

  // Nullstill visning mens vi laster
  setCardValue('month-allocated-total', 'Laster...');
  setCardValue('month-remaining-total', 'Laster...');
  setCardValue('month-total', 'Laster...');
  setCardValue('day-average', 'Laster...');
  setCardValue('month-overtime', 'Laster...');
  const tableBody = document.getElementById('summary-table-body');
  if(tableBody) tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">Laster data...</td></tr>';


  // Bruk Promise.all for å hente begge deler samtidig
  Promise.all([
      fetchDataFromScript({ action: 'getTimeLog', month: currentMonth + 1, year: currentYear }),
      fetchDataFromScript({ action: 'getCustomerTotalsForMonth', month: currentMonth + 1, year: currentYear })
  ])
  .then(([timeLogResponse, customerTotalsResponse]) => { // Får et array med svar
      console.log("Mottatt tidslogg data:", timeLogResponse);
      console.log("Mottatt kundetotaler data:", customerTotalsResponse);

      // Håndter Tidslogg-data
      if (timeLogResponse && timeLogResponse.success && Array.isArray(timeLogResponse.timeLog)) {
        timeLogDataForMonth = timeLogResponse.timeLog || [];
      } else {
         console.error('Ugyldig responsformat for tidslogg mottatt.');
         timeLogDataForMonth = []; // Sett til tom ved feil
         // Du kan velge å kaste en feil her hvis tidslogg er kritisk
         // throw new Error(timeLogResponse.message || 'Kunne ikke laste tidsloggdata.');
      }

      // Håndter Kundetotaler-data
      let customerTotals = { totalAllocated: 0, totalRemaining: 0 }; // Default ved feil
      if (customerTotalsResponse && customerTotalsResponse.success) {
          customerTotals = {
              totalAllocated: customerTotalsResponse.totalAllocated || 0,
              totalRemaining: customerTotalsResponse.totalRemaining || 0
          };
      } else {
           console.error('Ugyldig responsformat for kundetotaler mottatt.');
           // Ikke kast feil nødvendigvis, men vis feil i UI
           setCardValue('month-allocated-total', 'Feil');
           setCardValue('month-remaining-total', 'Feil');
      }

      // Send BEGGE datasett (eller default/tomme lister) til render-funksjonen
      renderDailySummary(timeLogDataForMonth, customerTotals);
      if (statusElement) statusElement.textContent = new Date().toLocaleTimeString('nb-NO');

  })
  .catch(error => {
       console.error('Feil under henting av data for måneden (Promise.all):', error);
       if (statusElement) statusElement.textContent = 'Feil ved lasting';
       alert(`Kunne ikke laste data: ${error.message}\nPrøver å vise eventuelle gamle data eller testdata.`);
       // Vis feil i UI
       setCardValue('month-allocated-total', 'Feil');
       setCardValue('month-remaining-total', 'Feil');
       setCardValue('month-total', 'Feil');
       setCardValue('day-average', 'Feil');
       setCardValue('month-overtime', 'Feil');
       if(tableBody) tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--bar-red);">Kunne ikke laste data.</td></tr>';
       // Vurder fallback til mock-data hvis ønskelig
       // useMockTimeLogData(); // Kan kalles her hvis du vil
  });
}

// Hent data (Fetch med JSONP fallback - Gjenbrukt fra tidligere, bør være ok)
function fetchDataFromScript(params) {
    const urlParams = new URLSearchParams(params);
    urlParams.append('nocache', Date.now());
    const directFetchUrl = `${GOOGLE_SCRIPT_URL}?${urlParams.toString()}`;
    console.log("Forsøker direkte fetch:", directFetchUrl);
    return fetch(directFetchUrl)
        .then(response => {
            if (!response.ok) {
                 // Prøv å få tekstlig feilmelding fra responsen
                 return response.text().then(text => {
                    throw new Error(text || `Nettverksfeil: ${response.status}`);
                 });
            }
            // Sjekk content-type før parsing
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                return response.json();
            } else {
                 return response.text().then(text => {
                     console.warn("Mottok ikke JSON, tekst:", text);
                     // Prøv å se om det er en JSONP-feilmelding?
                     if (text.includes("googleScript")) {
                         throw new Error("Mottok uventet svar (mulig JSONP-feil). Sjekk backend-logger.");
                     }
                     throw new Error("Mottok uventet svarformat fra server.");
                 });
            }
        })
        .catch(error => {
            console.warn(`Direkte fetch feilet (${error.message}), prøver JSONP.`);
            // JSONP er mer sårbar, bruk kun som fallback
            // Sikre at callback-navn er unikt per forespørselstype hvis nødvendig
            const callbackType = params.action || 'generic';
            return fetchWithJSONP(params, callbackType);
        });
}

function fetchWithJSONP(params, callbackType = 'generic') {
  return new Promise((resolve, reject) => {
    const callbackName = `googleScriptCallback_${callbackType}_${Date.now()}`;
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
      reject(new Error('JSONP-forespørsel tidsavbrutt (15 sek).'));
    }, 15000); // Økt timeout litt

    window[callbackName] = (data) => {
      console.log("JSONP callback mottatt for", callbackName);
      cleanup();
      resolve(data); // Anta at data er gyldig og la neste steg håndtere det
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


// --- Rendering ---

// Hjelpefunksjon for å sette verdien i kortene
function setCardValue(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = value;
        // Reset farge hvis vi setter en vanlig verdi
        if (elementId === 'month-remaining-total' && value !== 'Laster...' && value !== 'Feil') {
             const numericValue = parseFloat(String(value).replace(' timer', '')) || 0;
             element.style.color = numericValue < 0 ? 'var(--bar-red)' : 'var(--accent-primary)';
        }
    } else {
        console.warn(`Element med ID ${elementId} ble ikke funnet for oppdatering.`);
    }
}

// ----- START OPPDATERT renderDailySummary med Overtid OG Kundetotaler -----
function renderDailySummary(summaryData, customerTotals) { // Mottar nå customerTotals
  console.log("Rendrer daglig sammendrag med tidslogg:", summaryData);
  console.log("Rendrer med kundetotaler:", customerTotals);

  const tableBody = document.getElementById('summary-table-body');
  const tableHeadRow = document.querySelector('#daily-summary-table thead tr');

  // --- Oppdater nye header-kort ---
  // Bruker hjelpefunksjon for å sette verdien
  setCardValue('month-allocated-total', (customerTotals?.totalAllocated || 0).toFixed(2) + ' timer');
  setCardValue('month-remaining-total', (customerTotals?.totalRemaining || 0).toFixed(2) + ' timer');
  // --- Slutt oppdatering nye kort ---

  if (!tableBody || !tableHeadRow) {
      console.error("FEIL: Finner ikke tabell-body eller header-rad!");
      return;
  }
  tableBody.innerHTML = ''; // Tøm tabellen

  // --- Legg til Overtid-kolonne i header hvis den ikke finnes ---
  // Sjekker nå for 6 kolonner (Dato, Ukedag, Timer, Overtid, Kunder, Detaljer)
  if (!tableHeadRow.querySelector('th.overtime-header')) { // Mer robust sjekk med klasse
      const th = document.createElement('th');
      th.textContent = 'Overtid';
      th.classList.add('overtime-header'); // Legg til klasse for å unngå å legge til flere ganger
      // Sett inn ETTER "Totale timer" (index 2)
      tableHeadRow.insertBefore(th, tableHeadRow.cells[3]);
      console.log("La til Overtid-kolonne i header.");
  }

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const dateMap = {};
  summaryData.forEach(entry => { dateMap[entry.date] = entry; });

  let totalMonthHours = 0;
  let totalMonthOvertime = 0;
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

    // Celler (nå 6 totalt)
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
       else overtimeCell.style.color = ''; // Reset farge hvis ingen overtid

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

  // Oppdater de eksisterende kortene med totaler (bruker hjelpefunksjon)
  setCardValue('month-total', totalMonthHours.toFixed(2) + ' timer');
  const average = workDaysWithHours > 0 ? (totalMonthHours / workDaysWithHours) : 0;
  setCardValue('day-average', average.toFixed(2) + ' timer');
  setCardValue('month-overtime', totalMonthOvertime.toFixed(2) + ' timer');

  console.log(`Månedstotal (Logget): ${totalMonthHours.toFixed(2)}, Overtid: ${totalMonthOvertime.toFixed(2)}, Arbeidsdager m/timer: ${workDaysWithHours}, Snitt: ${average.toFixed(2)}`);
}
// ----- SLUTT OPPDATERT renderDailySummary -----


// Viser detaljmodalen (uendret fra før)
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

// Lukker modalvinduer (uendret)
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = 'none';
  else console.warn(`Forsøkte å lukke ukjent modal: ${modalId}`);
}

// Mock data-funksjon (uendret, kan brukes for testing)
function useMockTimeLogData() {
  console.warn('Bruker mock data for daglig sammendrag.');
  timeLogDataForMonth = generateMockData(); // Genererer kun timelogg-data
  // For mock, trenger vi også mock kundetotaler
  const mockCustomerTotals = { totalAllocated: 160, totalRemaining: 85.5 };
  renderDailySummary(timeLogDataForMonth, mockCustomerTotals);
  const statusElement = document.getElementById('last-updated');
  if (statusElement) statusElement.textContent = 'Frakoblet modus (testdata)';
}

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
  console.log("Generert mock data (tidslogg):", summaryArray);
  return summaryArray;
}
