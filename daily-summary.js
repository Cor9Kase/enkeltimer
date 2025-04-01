// Google Script URL - Samme URL som i hovedapplikasjonen
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwMri9xb7NBt3KNvOzHo0btwoZdMTAApkRQIRJlUhvFSChhbWrAsef0iFUMcMZrgGFO/exec';

// Globale variabler for å holde styr på valgt måned/år og hentet data
let currentMonth = new Date().getMonth(); // 0 = Januar, 11 = Desember
let currentYear = new Date().getFullYear();
let timeLogDataForMonth = []; // Lagrer dataene for den viste måneden

// Initialiser siden når DOM er klar
document.addEventListener('DOMContentLoaded', function() {
  console.log("Daily Summary DOM lastet.");
  updateCurrentDateHeader(); // Vis dagens dato i headeren

  // Legg til listeners for navigasjonsknapper
  document.getElementById('prev-month')?.addEventListener('click', () => navigateMonth(-1));
  document.getElementById('next-month')?.addEventListener('click', () => navigateMonth(1));
  document.getElementById('refresh-button')?.addEventListener('click', loadDailySummary); // Manuell refresh

  // Last inn data for inneværende måned ved start
  loadDailySummary();

  // Valgfritt: Start auto-refresh (kan fjernes hvis manuell refresh er nok)
  // startAutoRefresh(); // Kommentarert ut foreløpig
});

// Oppdaterer "Dagens dato"-visningen i headeren
function updateCurrentDateHeader() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('current-date').textContent = now.toLocaleDateString('no-NO', options);
}

// Funksjon for å starte automatisk oppdatering (kommentert ut som standard)
/*
function startAutoRefresh() {
  console.log("Starter auto-refresh for daglig sammendrag (hvert 5. minutt).");
  setInterval(() => {
    console.log("Auto-refresh: Henter ferske sammendragsdata...");
    loadDailySummary();
  }, 300000); // 300000 ms = 5 minutter
}
*/

// Funksjon for å bytte måned
function navigateMonth(direction) {
  currentMonth += direction;
  if (currentMonth < 0) {
    currentMonth = 11;
    currentYear--;
  } else if (currentMonth > 11) {
    currentMonth = 0;
    currentYear++;
  }
  console.log(`Navigerer til måned: ${currentMonth + 1}, år: ${currentYear}`);
  loadDailySummary(); // Last data for den nye måneden
}

// Oppdaterer tekstvisningen for valgt måned/år
function updateMonthDisplay() {
  const monthNames = [
    'Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Desember'
  ];
  const displayElement = document.getElementById('month-display');
  if (displayElement) {
      displayElement.textContent = `${monthNames[currentMonth]} ${currentYear}`;
  }
}

// Hovedfunksjon for å laste data fra Google Apps Script
function loadDailySummary() {
  console.log(`Laster sammendrag for ${currentMonth + 1}/${currentYear}`);
  updateMonthDisplay(); // Sørg for at riktig måned vises

  const statusElement = document.getElementById('last-updated');
  if (statusElement) statusElement.textContent = 'Henter data...';

  // Bruker en felles funksjon for å sende forespørsel
  fetchDataFromScript({
      action: 'getTimeLog',
      month: currentMonth + 1, // Send 1-12 til scriptet
      year: currentYear
  })
  .then(data => {
      console.log("Mottatt data fra script:", data);
      if (data && data.success && Array.isArray(data.timeLog)) {
          processTimeLogData(data); // Behandle vellykket respons
      } else {
          // Håndter feilmelding fra scriptet
          throw new Error(data.message || 'Ugyldig responsformat mottatt fra Google Script.');
      }
  })
  .catch(error => {
      console.error('Feil under henting av tidslogg:', error);
      // Vis feilmelding til bruker og vurder fallback til mock data
      if (statusElement) statusElement.textContent = 'Feil ved lasting';
      alert(`Kunne ikke laste data: ${error.message}\n\nPrøver å vise eventuelle gamle data eller testdata.`);
      // Fallback hvis `timeLogDataForMonth` allerede har data fra før, ellers mock
      if (!timeLogDataForMonth || timeLogDataForMonth.length === 0) {
           useMockTimeLogData(); // Bruk mock data hvis ingen data finnes
      } else {
           renderDailySummary(timeLogDataForMonth); // Vis gamle data hvis de finnes
           if (statusElement) statusElement.textContent = 'Viser gamle data (feil ved oppdatering)';
      }
  });
}

// Generell funksjon for å hente data (prøver fetch, deretter JSONP)
function fetchDataFromScript(params) {
    const urlParams = new URLSearchParams(params);
    urlParams.append('nocache', Date.now()); // Forhindre aggressiv caching

    const directFetchUrl = `${GOOGLE_SCRIPT_URL}?${urlParams.toString()}`;
    console.log("Forsøker direkte fetch:", directFetchUrl);

    return fetch(directFetchUrl)
        .then(response => {
            if (!response.ok) {
                // Kast en feil som inneholder status, slik at vi kan prøve JSONP
                throw new Error(`HTTP error ${response.status}`);
            }
            return response.json();
        })
        .catch(error => {
             // Hvis direkte fetch feiler (f.eks. CORS, nettverksfeil), prøv JSONP
            console.warn(`Direkte fetch feilet (${error.message}), prøver JSONP.`);
            return fetchTimeLogWithJSONP(params); // Pass på å sende parametere til JSONP også
        });
}


// JSONP metode som fallback
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
      if (scriptElement && scriptElement.parentNode) {
        scriptElement.parentNode.removeChild(scriptElement);
      }
      console.log("JSONP cleanup utført for", callbackName);
    };

    timeoutId = setTimeout(() => {
      console.error("JSONP timed out for", callbackName);
      cleanup();
      reject(new Error('JSONP-forespørsel tidsavbrutt (10 sek).'));
    }, 10000); // 10 sekunders timeout

    window[callbackName] = (data) => {
      console.log("JSONP callback mottatt for", callbackName);
      cleanup();
      // Vi stoler på at dataformatet sjekkes i .then()-blokken i loadDailySummary
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


// Behandler mottatt data og oppdaterer global variabel
function processTimeLogData(data) {
  timeLogDataForMonth = data.timeLog || []; // Lagre dataene globalt
  renderDailySummary(timeLogDataForMonth); // Kall render-funksjonen

  const statusElement = document.getElementById('last-updated');
  if (statusElement) statusElement.textContent = new Date().toLocaleTimeString('nb-NO');
}

// Bruker mock data hvis henting feiler
function useMockTimeLogData() {
  console.warn('Bruker mock data for daglig sammendrag.');
  timeLogDataForMonth = generateMockData(); // Generer mock data
  renderDailySummary(timeLogDataForMonth); // Vis mock data

  const statusElement = document.getElementById('last-updated');
  if (statusElement) statusElement.textContent = 'Frakoblet modus (testdata)';

  // Vurder å bare vise denne meldingen én gang
  // alert("Kunne ikke koble til Google Sheets for dagsoversikt. Viser testdata.");
}

// Genererer mock data i riktig format (gruppert per dag)
function generateMockData() {
  console.log(`Genererer mock data for ${currentMonth + 1}/${currentYear}`);
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const mockSummary = {};
  const today = new Date();
  today.setHours(0,0,0,0); // For sammenligning

  for (let i = 1; i <= daysInMonth; i++) {
    const date = new Date(currentYear, currentMonth, i);
     if (date > today) continue; // Ikke generer for fremtiden

    const dateStr = date.toISOString().split('T')[0];
    const weekDay = date.getDay(); // 0 = Søndag, 6 = Lørdag

    // Generer kun data for ca 70% av arbeidsdager
    if (weekDay > 0 && weekDay < 6 && Math.random() < 0.7) {
        const numEntries = Math.floor(Math.random() * 5) + 1; // 1-5 entries
        let dayTotalHours = 0;
        const dayCustomers = [];

        for(let j=0; j < numEntries; j++) {
            const customerHours = parseFloat((Math.random() * 4 + 0.25).toFixed(2)); // 0.25 to 4.25 hours
            dayTotalHours += customerHours;
            dayCustomers.push({
                name: `Testkunde ${String.fromCharCode(65 + Math.floor(Math.random()*5))}`, // A-E
                hours: customerHours,
                comment: `Diverse arbeid ${i}/${currentMonth+1}`
            });
        }

        mockSummary[dateStr] = {
            date: dateStr,
            totalHours: parseFloat(dayTotalHours.toFixed(2)),
            customers: dayCustomers
        };
    }
  }
   // Returner som array
  const summaryArray = Object.values(mockSummary);
  summaryArray.sort((a, b) => a.date.localeCompare(b.date));
  console.log("Generert mock data:", summaryArray);
  return summaryArray;
}


// Viser sammendraget i HTML-tabellen
function renderDailySummary(summaryData) {
  console.log("Rendrer daglig sammendrag med data:", summaryData);
  const tableBody = document.getElementById('summary-table-body');
  if (!tableBody) {
      console.error("FEIL: Finner ikke summary-table-body!");
      return;
  }
  tableBody.innerHTML = ''; // Tøm tabellen

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const dateMap = {};
  summaryData.forEach(entry => { // Map data for enkel tilgang
    dateMap[entry.date] = entry;
  });

  let totalMonthHours = 0;
  let workDaysWithHours = 0; // Teller kun dager med faktisk logget tid
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Gå gjennom hver dag i den valgte måneden
  for (let i = 1; i <= daysInMonth; i++) {
    const date = new Date(currentYear, currentMonth, i);
    const dateStr = date.toISOString().split('T')[0];
    const weekDay = date.getDay();
    const isFutureDate = date > today; // Ikke vis rader for fremtiden? Eller vis tomme? Viser tomme for nå.

    const row = tableBody.insertRow(); // Bruk insertRow for litt bedre ytelse kanskje

    // Legg til CSS-klasser for helg og dagens dato
    if (weekDay === 0 || weekDay === 6) row.classList.add('weekend');
    const isToday = date.getTime() === today.getTime();
    if (isToday) row.classList.add('current-day');

    // Celler
    const dateCell = row.insertCell();
    const weekDayCell = row.insertCell();
    const hoursCell = row.insertCell();
    const customersCell = row.insertCell();
    const detailsCell = row.insertCell();

    // Formater dato og ukedag
    dateCell.textContent = date.toLocaleDateString('no-NO', { day: '2-digit', month: '2-digit' });
    if (isToday) {
         const todayPill = document.createElement('span');
         todayPill.textContent = 'I DAG';
         todayPill.className = 'today-pill';
         dateCell.appendChild(todayPill);
    }

    const weekDayNames = ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'];
    weekDayCell.textContent = weekDayNames[weekDay];

    // Hent data for dagen hvis den finnes
    const entry = dateMap[dateStr];
    if (entry && !isFutureDate) {
      hoursCell.textContent = entry.totalHours.toFixed(2);
      customersCell.textContent = entry.customers.length;

      // Lag detaljknapp
      const detailBtn = document.createElement('button');
      detailBtn.className = 'detail-btn';
      detailBtn.textContent = 'Vis'; // Kortere tekst
      detailBtn.onclick = () => showDayDetails(entry, date); // Bruk arrow func for riktig scope
      detailsCell.appendChild(detailBtn);

      // Oppdater totaler
      totalMonthHours += entry.totalHours;
      if (weekDay > 0 && weekDay < 6) { // Tell kun arbeidsdager med timer for snitt
          workDaysWithHours++;
      }
    } else {
      // Tomme celler for dager uten data eller fremtidige dager
      hoursCell.textContent = '-';
      customersCell.textContent = '-';
      detailsCell.textContent = '-';
    }
  }

  // Oppdater kortene med totaler
  document.getElementById('month-total').textContent = totalMonthHours.toFixed(2) + ' timer';
  const average = workDaysWithHours > 0 ? (totalMonthHours / workDaysWithHours) : 0;
  document.getElementById('day-average').textContent = average.toFixed(2) + ' timer';
  console.log(`Månedstotal: ${totalMonthHours.toFixed(2)}, Arbeidsdager m/timer: ${workDaysWithHours}, Snitt: ${average.toFixed(2)}`);
}

// Viser detaljmodalen for en valgt dag
function showDayDetails(entry, date) {
  console.log("Viser detaljer for:", entry);
  const modal = document.getElementById('dayDetailsModal');
  if (!modal) {
       console.error("FEIL: Finner ikke dayDetailsModal!");
       return;
  }

  const dateStr = date.toLocaleDateString('no-NO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  document.getElementById('detail-date').textContent = dateStr;
  document.getElementById('detail-total-hours').textContent = entry.totalHours.toFixed(2);
  document.getElementById('detail-customer-count').textContent = entry.customers.length;

  const tableBody = document.getElementById('detail-table-body');
  if (!tableBody) {
       console.error("FEIL: Finner ikke detail-table-body!");
       closeModal('dayDetailsModal'); // Lukk modal hvis innhold mangler
       return;
  }
  tableBody.innerHTML = ''; // Tøm gammelt innhold

  // Sorter kunder etter timer (mest først)
  const sortedCustomers = [...entry.customers].sort((a, b) => b.hours - a.hours);

  sortedCustomers.forEach(customer => {
    const row = tableBody.insertRow();
    const nameCell = row.insertCell();
    const hoursCell = row.insertCell();
    const commentCell = row.insertCell();

    nameCell.textContent = customer.name;
    hoursCell.textContent = customer.hours.toFixed(2);
    commentCell.textContent = customer.comment || '-'; // Vis '-' hvis ingen kommentar
    commentCell.style.whiteSpace = "pre-wrap"; // Bevar linjeskift i kommentarer
    commentCell.style.wordBreak = "break-word"; // Bryt lange ord
  });

  modal.style.display = 'block'; // Vis modalen
}

// Lukker modalvinduer
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = 'none';
    console.log(`Lukket modal: ${modalId}`);
  } else {
     console.warn(`Forsøkte å lukke ukjent modal: ${modalId}`);
  }
}

// Legg til listener for å lukke modal ved klikk utenfor innholdet
window.addEventListener('click', function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target == modal) { // Klikket direkte på bakgrunnen
            closeModal(modal.id);
        }
    });
});

// Lukk modal
function closeModal(modalId) {
  document.getElementById(modalId).style.display = 'none';
}
