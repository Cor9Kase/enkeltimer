// Google Script URL - Samme URL som i hovedapplikasjonen
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzg1Q8HY5R26M128-y6NTswN1GflPgSjF9rV9inBTmos6BJwVc2-04UoJiFlGC9aDUK/exec';

// Variabler for datoer og data
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let timeLogData = [];

// Initialiser siden når den er lastet
document.addEventListener('DOMContentLoaded', function() {
  // Oppdater nåværende dato i header
  updateCurrentDate();
  
  // Legg til event listeners for månedsnavigering
  document.getElementById('prev-month').addEventListener('click', () => navigateMonth(-1));
  document.getElementById('next-month').addEventListener('click', () => navigateMonth(1));
  
  // Last inn daglig sammendrag for gjeldende måned
  loadDailySummary();
  
  // Start auto-refresh
  startAutoRefresh();
});

// Oppdater dato som vises i header
function updateCurrentDate() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('current-date').textContent = now.toLocaleDateString('no-NO', options);
}

// Funksjon for regelmessig oppdatering
function startAutoRefresh() {
  setInterval(() => {
    loadDailySummary();
  }, 60000); // Oppdater hvert minutt
}

// Naviger til forrige eller neste måned
function navigateMonth(direction) {
  // Oppdater måned (legg til eller trekk fra 1)
  currentMonth += direction;
  
  // Håndter årsskifte
  if (currentMonth < 0) {
    currentMonth = 11;
    currentYear--;
  } else if (currentMonth > 11) {
    currentMonth = 0;
    currentYear++;
  }
  
  // Oppdater visningen
  updateMonthDisplay();
  loadDailySummary();
}

// Oppdater månedsdisplayet
function updateMonthDisplay() {
  const monthNames = [
    'Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Desember'
  ];
  
  document.getElementById('month-display').textContent = `${monthNames[currentMonth]} ${currentYear}`;
}

// Last inn daglig sammendrag fra Google Sheets
function loadDailySummary() {
  // Vis måneden i displayet
  updateMonthDisplay();
  
  // Vis laste-indikator
  document.getElementById('last-updated').textContent = 'Henter data...';
  
  // Prøv å hente data med JSONP først, deretter fall tilbake til direkte fetch
  fetchTimeLogWithJSONP()
    .catch(error => {
      console.warn('JSONP request failed, trying direct fetch:', error);
      return fetchTimeLogDirect();
    })
    .catch(error => {
      console.error('All connection attempts failed:', error);
      useMockTimeLogData();
    });
}

// JSONP metode for å unngå CORS-problemer
function fetchTimeLogWithJSONP() {
  return new Promise((resolve, reject) => {
    const callbackName = 'googleScriptTimeLogCallback_' + Math.floor(Math.random() * 1000000);
    const url = `${GOOGLE_SCRIPT_URL}?action=getTimeLog&month=${currentMonth + 1}&year=${currentYear}&nocache=${Date.now()}&callback=${callbackName}`;
    
    // Sett timeout for å håndtere feiling
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('JSONP request timed out after 5 seconds'));
    }, 5000);
    
    // Lag en global callback-funksjon som vil håndtere responsen
    window[callbackName] = function(data) {
      cleanup();
      
      if (data && data.success) {
        processTimeLogData(data);
        resolve(data);
      } else {
        reject(new Error('Invalid response from Google Script'));
      }
    };
    
    // Funksjon for å rydde opp etter forespørselen
    function cleanup() {
      clearTimeout(timeoutId);
      document.body.removeChild(script);
      delete window[callbackName];
    }
    
    // Opprett et script-element for å laste JSONP
    const script = document.createElement('script');
    script.src = url;
    script.onerror = function() {
      cleanup();
      reject(new Error('JSONP script loading failed'));
    };
    
    // Legg til script på siden for å utføre forespørselen
    document.body.appendChild(script);
  });
}

// Direkte fetch-metode (fungerer bare hvis CORS er konfigurert)
function fetchTimeLogDirect() {
  return fetch(`${GOOGLE_SCRIPT_URL}?action=getTimeLog&month=${currentMonth + 1}&year=${currentYear}&nocache=${Date.now()}`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (data && data.success) {
        processTimeLogData(data);
        return data;
      } else {
        throw new Error('Invalid response from Google Script');
      }
    });
}

// Behandle tidslogg-data etter vellykket henting
function processTimeLogData(data) {
  timeLogData = data.timeLog || [];
  renderDailySummary(timeLogData);
  
  // Oppdater "sist oppdatert" tidspunkt
  const now = new Date();
  document.getElementById('last-updated').textContent = now.toLocaleTimeString();
}

// Generer testdata for offline testing
function useMockTimeLogData() {
  console.log('Fallback to mock time log data for testing');
  const mockData = generateMockData();
  renderDailySummary(mockData);
  
  // Oppdater "sist oppdatert" tidspunkt med feilindikasjon
  document.getElementById('last-updated').textContent = 'Frakoblet modus';
  
  // Vise en mer brukervennlig feilmelding
  const errorMessage = "Kunne ikke koble til Google Sheets. Bruker testdata i frakoblet modus. Kontroller at:\n" +
                      "1. Google Apps Script URL-en er korrekt\n" +
                      "2. Skriptet er publisert som en webapplikasjon\n" +
                      "3. Skriptet har tilgangsrettighetene 'Alle, inkludert anonyme'";
  
  alert(errorMessage);
}

// Generer testdata for offline testing
function generateMockData() {
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const mockData = [];
  
  // Generer data for hver dag i måneden
  for (let i = 1; i <= daysInMonth; i++) {
    const date = new Date(currentYear, currentMonth, i);
    const weekDay = date.getDay(); // 0 = søndag, 6 = lørdag
    
    // Kun lag data for arbeidsdager og ikke fremtidige dager
    const today = new Date();
    if (date > today) continue;
    
    if (weekDay > 0 && weekDay < 6) {
      // Generer bare data for cirka 70% av arbeidsdagene (mer realistisk)
      if (Math.random() > 0.3) {
        // Tilfeldig antall timer mellom 4 og 8
        const totalHours = (4 + Math.random() * 4).toFixed(2);
        
        // Tilfeldig antall kunder mellom 1 og 4
        const customerCount = Math.floor(1 + Math.random() * 4);
        
        // Lag kundedata
        const customers = [];
        let remainingHours = parseFloat(totalHours);
        
        for (let j = 0; j < customerCount; j++) {
          let customerHours;
          
          if (j === customerCount - 1) {
            // Siste kunde får resterende timer
            customerHours = remainingHours;
          } else {
            // Tilfeldig fordeling av timer
            customerHours = (remainingHours / (customerCount - j) * Math.random()).toFixed(2);
            remainingHours -= customerHours;
          }
          
          customers.push({
            name: `Kunde ${j + 1}`,
            hours: parseFloat(customerHours),
            comment: `Arbeid utført ${date.toLocaleDateString('no-NO')}`
          });
        }
        
        mockData.push({
          date: date.toISOString().split('T')[0],
          totalHours: parseFloat(totalHours),
          customers: customers
        });
      }
    }
  }
  
  return mockData;
}

// Vis daglig sammendrag i tabellen
function renderDailySummary(data) {
  const tableBody = document.getElementById('summary-table-body');
  tableBody.innerHTML = '';
  
  // Hent antall dager i måneden
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  
  // Opprett mapping av dato til data for rask tilgang
  const dateMap = {};
  data.forEach(entry => {
    dateMap[entry.date] = entry;
  });
  
  let totalMonthHours = 0;
  let workDaysCount = 0;
  
  // For hver dag i måneden
  for (let i = 1; i <= daysInMonth; i++) {
    const date = new Date(currentYear, currentMonth, i);
    const dateStr = date.toISOString().split('T')[0];
    const weekDay = date.getDay(); // 0 = søndag, 6 = lørdag
    
    // Ikke inkluder fremtidige dager
    const today = new Date();
    if (date > today) continue;
    
    const row = document.createElement('tr');
    
    // Legg til klasse for helg
    if (weekDay === 0 || weekDay === 6) {
      row.classList.add('weekend');
    }
    
    // Legg til klasse for dagens dato
    const isToday = date.setHours(0, 0, 0, 0) === today.setHours(0, 0, 0, 0);
    if (isToday) {
      row.classList.add('current-day');
    }
    
    // Dato
    const dateTd = document.createElement('td');
    dateTd.textContent = date.toLocaleDateString('no-NO');
    if (isToday) {
      const todayPill = document.createElement('span');
      todayPill.textContent = 'I DAG';
      todayPill.className = 'today-pill';
      dateTd.appendChild(todayPill);
    }
    row.appendChild(dateTd);
    
    // Ukedag
    const weekDayNames = ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'];
    const weekDayTd = document.createElement('td');
    weekDayTd.textContent = weekDayNames[weekDay];
    row.appendChild(weekDayTd);
    
    // Timeinformasjon
    const entry = dateMap[dateStr];
    
    // Totale timer
    const hoursTd = document.createElement('td');
    if (entry) {
      hoursTd.textContent = entry.totalHours.toFixed(2);
      totalMonthHours += entry.totalHours;
      if (weekDay > 0 && weekDay < 6) {
        workDaysCount++;
      }
    } else {
      hoursTd.textContent = '-';
    }
    row.appendChild(hoursTd);
    
    // Antall kunder
    const customersTd = document.createElement('td');
    if (entry && entry.customers) {
      customersTd.textContent = entry.customers.length;
    } else {
      customersTd.textContent = '-';
    }
    row.appendChild(customersTd);
    
    // Detalj-knapp
    const detailsTd = document.createElement('td');
    if (entry && entry.customers && entry.customers.length > 0) {
      const detailBtn = document.createElement('button');
      detailBtn.className = 'detail-btn';
      detailBtn.textContent = 'Vis detaljer';
      detailBtn.addEventListener('click', () => showDayDetails(entry, date));
      detailsTd.appendChild(detailBtn);
    } else {
      detailsTd.textContent = '-';
    }
    row.appendChild(detailsTd);
    
    tableBody.appendChild(row);
  }
  
  // Oppdater totaler
  document.getElementById('month-total').textContent = totalMonthHours.toFixed(2) + ' timer';
  
  // Beregn gjennomsnitt per arbeidsdag
  const average = workDaysCount > 0 ? totalMonthHours / workDaysCount : 0;
  document.getElementById('day-average').textContent = average.toFixed(2) + ' timer';
}

// Vis detaljer for en enkelt dag
function showDayDetails(entry, date) {
  const modal = document.getElementById('dayDetailsModal');
  const dateStr = date.toLocaleDateString('no-NO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  
  document.getElementById('detail-date').textContent = dateStr;
  document.getElementById('detail-total-hours').textContent = entry.totalHours.toFixed(2);
  document.getElementById('detail-customer-count').textContent = entry.customers.length;
  
  const tableBody = document.getElementById('detail-table-body');
  tableBody.innerHTML = '';
  
  // Sorter kundene etter antall timer (høyest først)
  const sortedCustomers = [...entry.customers].sort((a, b) => b.hours - a.hours);
  
  sortedCustomers.forEach(customer => {
    const row = document.createElement('tr');
    
    // Kundenavn
    const nameTd = document.createElement('td');
    nameTd.textContent = customer.name;
    row.appendChild(nameTd);
    
    // Timer brukt
    const hoursTd = document.createElement('td');
    hoursTd.textContent = customer.hours.toFixed(2);
    row.appendChild(hoursTd);
    
    // Kommentar
    const commentTd = document.createElement('td');
    commentTd.textContent = customer.comment || '-';
    row.appendChild(commentTd);
    
    tableBody.appendChild(row);
  });
  
  modal.style.display = 'block';
}

// Lukk modal
function closeModal(modalId) {
  document.getElementById(modalId).style.display = 'none';
}
