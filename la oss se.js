// script.js (DEL 1/3 - Starten av filen)

// Debounce-funksjon for å unngå doble innsendinger
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

// Google Script URL - *** VIKTIG: Bytt ut med din egen publiserte URL ***
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzMeOJzFvbl7CzHhD-45LLxK7Bsdy2d2XdH7XE3R_XkNIedztkLVTcYAWCsblQs3q_N/exec'; // <--- SJEKK AT DENNE ER RIKTIG!

// --- Globale variabler for tilstand ---
const timers = {};
let activeBox = null;
let customers = [];
let newCustomerTimer = null;
let isAutoRefreshPaused = false;
let isSubmitting = false; // Forhindre doble innsendinger

// === DEFINISJON AV RANKS (Plassert Globalt) ===
const ranks = [
    // Sortert fra lavest til høyest krav
    { name: "Nybegynner", minDays: 0, minStreak: 0 },
    { name: "Lærling", minDays: 7, minStreak: 3 },      // Minst 1 uke gammel, 3 dager streak
    { name: "Svenn", minDays: 14, minStreak: 5 },     // Minst 2 uker, 5 dager streak
    { name: "Erfaren", minDays: 30, minStreak: 7 },    // Minst 1 måned, 7 dager streak (1 uke+)
    { name: "Mester", minDays: 60, minStreak: 10 },   // Minst 2 måneder, 10 dager streak (2 uker+)
    { name: "Guru", minDays: 90, minStreak: 14 },    // Minst 3 måneder, 14 dager streak (nesten 3 uker)
];
// =============================================


// Opprett en debounced versjon av submitTime-funksjonen for kommentarmodalen
const debouncedSubmitTime = debounce(submitTime, 500);


// --- Initialisering ---
document.addEventListener('DOMContentLoaded', function() {
  console.log("DOM lastet, initialiserer app");
  updateCurrentDate();
  loadCustomers();
  startAutoRefresh();
  addGlobalEventListeners();

  // Sjekk om URL er satt
  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL === 'DIN_NETTAPP_URL_HER' || GOOGLE_SCRIPT_URL.includes('SETT_INN_DIN_URL')) {
       alert("ADVARSEL: GOOGLE_SCRIPT_URL er ikke satt i script.js! Appen vil ikke kunne kommunisere med Google Sheets.");
       const statusElement = document.getElementById('last-updated');
       if(statusElement) statusElement.textContent = 'Konfigurasjonsfeil!';
   }

  // === Kall displayStreakAndRank ved sidelasting (funksjonen ligger i theme.js) ===
  if (typeof displayStreakAndRank === 'function') {
       console.log("DOMContentLoaded: Kaller displayStreakAndRank");
       displayStreakAndRank();
  } else {
       console.warn("DOMContentLoaded: displayStreakAndRank function not found (expected in theme.js, ensures initial display)");
  }
  // ===========================================================================
});

// --- Event Listeners ---
function addGlobalEventListeners() {
  console.log("Legger til globale event listeners");

  document.getElementById('submit-comment-btn')?.addEventListener('click', debouncedSubmitTime);
  document.getElementById('create-customer-btn')?.addEventListener('click', createNewCustomer);
  document.getElementById('update-customer-btn')?.addEventListener('click', updateCustomer);
  document.getElementById('confirm-delete-btn')?.addEventListener('click', deleteCustomer);

  document.querySelectorAll('.modal .close').forEach(btn => {
    btn.addEventListener('click', function() {
      const modalId = this.closest('.modal').id;
      closeModal(modalId);
    });
  });
   document.querySelectorAll('.modal .cancel-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const modalId = this.closest('.modal').id;
      closeModal(modalId);
    });
  });

  document.getElementById('refresh-button')?.addEventListener('click', fetchCustomerData);
  document.getElementById('test-connection-button')?.addEventListener('click', testConnection);

  // Lukk modal ved klikk utenfor
  window.addEventListener('click', function(event) {
      const modals = document.querySelectorAll('.modal');
      modals.forEach(modal => {
          if (modal.style.display === 'block' && event.target === modal) {
              closeModal(modal.id);
          }
      });
  });
}

// --- UI Oppdateringer ---
function updateCurrentDate() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const dateEl = document.getElementById('current-date');
  if(dateEl) dateEl.textContent = now.toLocaleDateString('no-NO', options);
}

// --- Data Henting og Behandling ---
function loadCustomers() {
  console.log("Initierer lasting av kundedata");
  fetchCustomerData();
}

function startAutoRefresh() {
  console.log("Starter auto-refresh (hvert 30. sekund)");
  setInterval(() => {
    const noActiveTimers = !activeBox && !document.getElementById('add-customer-box')?.classList.contains('active');
    if (!isAutoRefreshPaused && !isSubmitting && noActiveTimers) {
      console.log("Auto-refresh: Henter ferske data...");
      fetchCustomerData();
    } else {
       // console.log("Auto-refresh: Pauset pga aktiv timer eller innsending.");
    }
  }, 30000);
}

function fetchCustomerData() {
  if (isSubmitting) {
      console.log("Henting av data avbrutt, innsending pågår.");
      return;
  }
  console.log("Forsøker å hente kundedata...");
  const statusEl = document.getElementById('last-updated');
  if (statusEl) statusEl.textContent = 'Henter data...';

  sendDataToGoogleScript({ action: 'getCustomers' }, "Kunder hentet")
    .then(data => {
        console.log("Mottatt kundedata:", data);
         if (data && data.success && Array.isArray(data.customers)) {
            processCustomerData(data);
         } else {
             throw new Error(data.message || 'Ugyldig format mottatt for kunder.');
         }
    })
    .catch(error => {
      console.error('Feil ved henting av kundedata:', error);
      useMockData();
      if (statusEl) statusEl.textContent = 'Tilkoblingsfeil';
      alert(`Kunne ikke hente kundedata: ${error.message}. Viser testdata.`);
    });
}

function processCustomerData(data) {
  console.log("Behandler kundedata:", data.customers.length, "kunder funnet.");
  customers = data.customers.sort((a, b) => a.name.localeCompare(b.name, 'no', { sensitivity: 'base' }));
  renderCustomers();
  const statusEl = document.getElementById('last-updated');
  if (statusEl) statusEl.textContent = new Date().toLocaleTimeString('nb-NO');
  console.log("Kundedata behandlet og UI oppdatert.");
}

function useMockData() {
  console.warn('Fallback til mock data for testing');
  const mockCustomerData = [
    { name: "Test Kunde A", availableHours: 40.5, allocatedHours: 50 },
    { name: "Eksempel B", availableHours: 8.2, allocatedHours: 10 },
    { name: "Demo C", availableHours: 1.5, allocatedHours: 5 },
    { name: "Annen AS", availableHours: 0, allocatedHours: 0 },
  ];
  customers = mockCustomerData.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
  renderCustomers();
  const statusEl = document.getElementById('last-updated');
  if(statusEl) statusEl.textContent = 'Frakoblet modus (testdata)';
}

// --- Rendering av Kundekort ---
function renderCustomers() {
  console.log("Rendrer kundebokser...");
  const container = document.getElementById('customer-container');
  if (!container) { console.error("FEIL: Finner ikke 'customer-container'"); return; }
  const activeCustomerId = activeBox ? activeBox.getAttribute('data-id') : null;
  const addCustomerButton = document.getElementById('add-customer-box');
  if (!addCustomerButton) { console.error("FEIL: Finner ikke 'add-customer-box'"); return; }

  const currentBoxes = container.querySelectorAll('.customer-box');
  currentBoxes.forEach(box => container.removeChild(box));

  if (!customers || customers.length === 0) {
    console.log("Ingen kunder å vise.");
    return;
  }

  customers.forEach((customer, index) => {
    const customerId = index;
    const customerBox = createCustomerBoxElement(customer, customerId);
    container.appendChild(customerBox);
    if (activeCustomerId !== null && parseInt(activeCustomerId) === customerId) {
      activateCustomerBox(customerBox, customerId);
    }
  });
  console.log("Kundebokser rendret.");
}

function createCustomerBoxElement(customer, customerId) {
    const customerBox = document.createElement('div');
    customerBox.className = 'customer-box';
    customerBox.setAttribute('data-id', customerId);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'customer-actions';
    actionsDiv.innerHTML = `
      <button class="customer-action-btn edit-btn" title="Rediger kunde">✏️</button>
      <button class="customer-action-btn delete-btn" title="Slett kunde">🗑️</button>
    `;
    actionsDiv.querySelector('.edit-btn').addEventListener('click', (e) => { e.stopPropagation(); showEditCustomer(customerId); });
    actionsDiv.querySelector('.delete-btn').addEventListener('click', (e) => { e.stopPropagation(); confirmDeleteCustomer(customerId); });
    customerBox.appendChild(actionsDiv);

    const nameDiv = document.createElement('div');
    nameDiv.className = 'customer-name';
    nameDiv.textContent = customer.name;
    customerBox.appendChild(nameDiv);

    const hoursIndicator = document.createElement('div');
    hoursIndicator.className = 'hours-indicator';
    hoursIndicator.innerHTML = `
        <div class="hours-bar-container">
            <div class="hours-bar-fill"></div>
        </div>
        <span class="hours-remaining-text">0.0 t</span>
    `;
    customerBox.appendChild(hoursIndicator);
    updateCustomerBar(customerId, customer.availableHours, customerBox);

    const timerDiv = document.createElement('div');
    timerDiv.className = 'timer';
    timerDiv.textContent = '00:00:00';
    customerBox.appendChild(timerDiv);

    const statusDiv = document.createElement('div');
    statusDiv.className = 'status';
    statusDiv.textContent = 'Inaktiv';
    customerBox.appendChild(statusDiv);

    customerBox.addEventListener('click', () => toggleTimer(customerBox));
    return customerBox;
}

function updateCustomerBar(customerId, availableHours, customerBoxElement = null) {
  const box = customerBoxElement || document.querySelector(`.customer-box[data-id='${customerId}']`);
  if (!box) return;
  const barFill = box.querySelector('.hours-bar-fill');
  const barText = box.querySelector('.hours-remaining-text');
  if (!barFill || !barText) return;

  const redThreshold = 3;
  const yellowThreshold = 10;
  const allocatedHours = customers[customerId]?.allocatedHours;
  const maxVisualHours = allocatedHours > 0 ? allocatedHours : 40;
  const hoursForPercentage = Math.max(0, availableHours);
  const percentage = maxVisualHours > 0 ? Math.min(100, (hoursForPercentage / maxVisualHours) * 100) : 0;

  let barClass = '';
  if (availableHours < 0) barClass = 'bar-red';
  else if (availableHours < redThreshold) barClass = 'bar-red';
  else if (availableHours < yellowThreshold) barClass = 'bar-yellow';
  else barClass = 'bar-green';

  barText.textContent = `${availableHours.toFixed(1)} t`;
  barFill.style.width = `${percentage}%`;
  barFill.classList.remove('bar-red', 'bar-yellow', 'bar-green');
  if(barClass) barFill.classList.add(barClass);
}

// --- Timer Logikk ---

function toggleTimer(box) {
  if (!box || !box.classList.contains('customer-box')) { console.error("toggleTimer kalt med ugyldig element:", box); return; }
  const customerId = box.getAttribute('data-id');
  if (customerId === null) { console.error("toggleTimer kalt på boks uten 'data-id'"); return; }
  const customerIndex = parseInt(customerId);
   if (isNaN(customerIndex) || customerIndex < 0 || customerIndex >= customers.length) { console.error(`toggleTimer: Fant ikke kunde med indeks ${customerId}`); return; }
   const customer = customers[customerIndex];
   const isActive = box.classList.contains('active');

  if (!isActive) { stopAnyActiveTimer(false); }

  if (isActive) {
    console.log(`Stopper timer for kunde: ${customer.name} (Indeks: ${customerId})`);
    deactivateCustomerBox(box, customerId);
    isAutoRefreshPaused = false;
    showCommentModal(customerId);
  } else {
    console.log(`Starter timer for kunde: ${customer.name} (Indeks: ${customerId})`);
    activateCustomerBox(box, customerId);
    isAutoRefreshPaused = true;
  }
}

function activateCustomerBox(box, customerId){
    if (!box || customerId === null) return;
    const customer = customers[parseInt(customerId)];
    if (!customer) return;

    box.classList.add('active');
    const statusDisplay = box.querySelector('.status');
    const timerDisplay = box.querySelector('.timer');
    if(statusDisplay) { statusDisplay.textContent = 'Aktiv'; statusDisplay.style.fontWeight = 'bold'; statusDisplay.style.color = 'var(--active)'; }
    if(timerDisplay) timerDisplay.textContent = '00:00:00';

    const startTime = new Date();
    if (timers[customerId]?.interval) clearInterval(timers[customerId].interval);

    timers[customerId] = {
      startTime: startTime,
      customerName: customer.name,
      interval: setInterval(() => {
        const elapsedTime = Date.now() - startTime;
        const currentBox = document.querySelector(`.customer-box[data-id='${customerId}'].active`);
        if (currentBox) {
             currentBox.querySelector('.timer').textContent = formatTime(elapsedTime);
        } else {
             if (timers[customerId]?.interval) clearInterval(timers[customerId].interval);
             delete timers[customerId];
        }
      }, 1000)
    };
    activeBox = box;
}

function deactivateCustomerBox(box, customerId){
     if (!box || customerId === null || !timers[customerId]) return;
     if (timers[customerId].interval) clearInterval(timers[customerId].interval);

     const endTime = new Date();
     const timeSpentMs = endTime - timers[customerId].startTime;
     const timeSpentFormatted = formatTime(timeSpentMs);
     timers[customerId].endTime = endTime;
     timers[customerId].timeSpentMs = timeSpentMs;
     timers[customerId].timeSpentFormatted = timeSpentFormatted;

     box.classList.remove('active');
     const statusDisplay = box.querySelector('.status');
     const timerDisplay = box.querySelector('.timer');
     if(statusDisplay) { statusDisplay.textContent = 'Inaktiv'; statusDisplay.style.fontWeight = 'normal'; statusDisplay.style.color = 'var(--inactive)'; }
     if(timerDisplay) timerDisplay.textContent = timeSpentFormatted;

     activeBox = null;
}

function stopAnyActiveTimer(showCommentModalForCustomer = true) {
    let stoppedSomething = false;
    if (activeBox) {
        const customerId = activeBox.getAttribute('data-id');
        console.log("Stopper aktiv KUNDE timer:", customerId);
        deactivateCustomerBox(activeBox, customerId);
        if (showCommentModalForCustomer && timers[customerId]) { // Sjekk om timer data finnes
            showCommentModal(customerId);
        } else if (timers[customerId]) {
            delete timers[customerId]; // Rydd opp hvis modal ikke vises
        }
        stoppedSomething = true;
    }
    const addCustomerBox = document.getElementById('add-customer-box');
    if (addCustomerBox?.classList.contains('active')) {
        console.log("Stopper aktiv NY-KUNDE timer.");
        stopNewCustomerTimer(false);
        stoppedSomething = true;
    }
    return stoppedSomething;
}

function showCommentModal(customerId) {
    const customerData = timers[customerId];
    if (!customerData) { console.error(`showCommentModal: Fant ikke timer data for kunde ID ${customerId}`); alert("Feil: Kunne ikke hente data for kommentarmodal."); return; }
    console.log(`Viser kommentarmodal for: ${customerData.customerName}, Tid: ${customerData.timeSpentFormatted}`);
    const modal = document.getElementById('commentModal');
    const nameEl = document.getElementById('modal-customer-name');
    const timeEl = document.getElementById('modal-time-spent');
    const commentEl = document.getElementById('comment-text');
    if (!modal || !nameEl || !timeEl || !commentEl) { console.error("FEIL: Mangler elementer i kommentarmodalen!"); return; }
    nameEl.textContent = customerData.customerName;
    timeEl.textContent = `Tid brukt: ${customerData.timeSpentFormatted}`;
    commentEl.value = '';
    modal.style.display = 'block';
    modal.setAttribute('data-current-customer-id', customerId);
}


// --- Ny Kunde Timer Logikk ---
function startNewCustomerTimer() {
    if (stopAnyActiveTimer(true)) { console.log("Stoppet annen aktiv timer før ny-kunde start."); }
    const addCustomerBox = document.getElementById('add-customer-box');
    if (!addCustomerBox || addCustomerBox.classList.contains('active')) {
        if (addCustomerBox?.classList.contains('active')) { stopNewCustomerTimer(true); }
        return;
    }
    console.log("Starter 'ny kunde'-timer.");
    isAutoRefreshPaused = true;
    addCustomerBox.classList.add('active');
    const timerDisplay = document.getElementById('new-customer-timer');
    if(timerDisplay) timerDisplay.textContent = '00:00:00';
    const startTime = new Date();
    if(newCustomerTimer?.interval) clearInterval(newCustomerTimer.interval);
    newCustomerTimer = {
        startTime: startTime,
        interval: setInterval(() => {
            const elapsedTime = Date.now() - startTime;
            const currentAddBox = document.getElementById('add-customer-box');
            if (currentAddBox?.classList.contains('active')) {
                 document.getElementById('new-customer-timer').textContent = formatTime(elapsedTime);
            } else {
                if (newCustomerTimer?.interval) clearInterval(newCustomerTimer.interval);
            }
        }, 1000)
    };
    activeBox = null;
}

function stopNewCustomerTimer(showModal = true) {
  if (!newCustomerTimer) return;
  if (newCustomerTimer.interval) clearInterval(newCustomerTimer.interval);
  console.log(`Stopper 'ny kunde'-timer. Skal modal vises? ${showModal}`);
  isAutoRefreshPaused = false;
  const addCustomerBox = document.getElementById('add-customer-box');
  if(addCustomerBox) addCustomerBox.classList.remove('active');
  const endTime = new Date();
  const timeSpentMs = endTime - newCustomerTimer.startTime;
  const timeSpentFormatted = formatTime(timeSpentMs);
  const timerDisp = document.getElementById('new-customer-timer');
  if(timerDisp) timerDisp.textContent = timeSpentFormatted;
  newCustomerTimer.endTime = endTime;
  newCustomerTimer.timeSpentMs = timeSpentMs;
  newCustomerTimer.timeSpentFormatted = timeSpentFormatted;
  newCustomerTimer.interval = null;
  if (showModal) {
    const modal = document.getElementById('newCustomerModal');
    const timeSpentEl = document.getElementById('new-customer-time-spent');
    const nameEl = document.getElementById('new-customer-name');
    const hoursEl = document.getElementById('new-customer-hours');
    const commentEl = document.getElementById('new-customer-comment');
    if (!modal || !timeSpentEl || !nameEl || !hoursEl || !commentEl) {
        console.error("FEIL: Mangler elementer i ny-kunde-modalen!");
        newCustomerTimer = null; if(timerDisp) timerDisp.textContent = '00:00:00'; return;
    }
    timeSpentEl.textContent = `Tid brukt: ${timeSpentFormatted}`;
    nameEl.value = ''; nameEl.focus();
    hoursEl.value = ''; commentEl.value = '';
    modal.style.display = 'block';
  } else {
       console.log("Nullstiller newCustomerTimer uten å vise modal.");
       newCustomerTimer = null; if(timerDisp) timerDisp.textContent = '00:00:00';
  }
}
// --- SLUTTEN PÅ DEL 1/3 ---
// script.js (DEL 2/3 - Fortsettelse)

function cancelNewCustomer() {
  console.log("Avbryter ny kunde.");
  if (newCustomerTimer) {
     if(newCustomerTimer.interval) clearInterval(newCustomerTimer.interval);
     newCustomerTimer = null;
     const addBox = document.getElementById('add-customer-box');
     const timerDisp = document.getElementById('new-customer-timer');
     if(addBox) addBox.classList.remove('active');
     if(timerDisp) timerDisp.textContent = '00:00:00';
     isAutoRefreshPaused = false;
  }
  closeModal('newCustomerModal');
}


// --- HJELPEFUNKSJONER FOR STREAK (Plassert her for organisering) ---
function isWeekend(date) {
    const day = date.getDay(); // 0 = Søndag, 6 = Lørdag
    return day === 0 || day === 6;
}

function getISODateString(date) {
    // Sikrer at Date-objektet er gyldig før kall til toISOString
    if (date instanceof Date && !isNaN(date)) {
        return date.toISOString().split('T')[0];
    }
    console.warn("getISODateString mottok ugyldig dato:", date);
    return null; // Returner null hvis datoen er ugyldig
}
// --- SLUTT HJELPEFUNKSJONER FOR STREAK ---


// --- FUNKSJON for å beregne og lagre Rank (Plassert her) ---
function calculateAndSaveRank(firstDateStr, streak) {
    // 'ranks'-arrayet er definert globalt øverst
    if (!firstDateStr) {
         localStorage.setItem('user_rank', ranks[0].name);
         console.log("Rank: Mangler første logg-dato, setter rank til Nybegynner.");
         return;
    }
    const firstDate = new Date(firstDateStr);
    if (isNaN(firstDate)) { // Sjekk om datoen er gyldig
         localStorage.setItem('user_rank', ranks[0].name);
         console.warn("Rank: Ugyldig første logg-dato lagret:", firstDateStr);
         return;
    }
    const today = new Date();
    firstDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const daysSinceStart = Math.floor((today - firstDate) / (1000 * 60 * 60 * 24));
    let currentRank = ranks[0].name;
    for (let i = ranks.length - 1; i >= 0; i--) {
        if (daysSinceStart >= ranks[i].minDays && streak >= ranks[i].minStreak) {
            currentRank = ranks[i].name;
            break;
        }
    }
    console.log(`Rank Beregning: Dager=${daysSinceStart}, Streak=${streak} => Rank=${currentRank}`);
    localStorage.setItem('user_rank', currentRank);
}
// --- SLUTT calculateAndSaveRank ---


// --- FUNKSJON for å oppdatere Streak og Rank (Plassert her) ---
function updateStreakAndRank() {
    const today = new Date();
    const todayStr = getISODateString(today);
    if (!todayStr) return; // Ikke gjør noe hvis dagens dato er ugyldig

    if (isWeekend(today)) {
        console.log("Streak: Hopper over helgedag.");
        localStorage.setItem('streak_lastLogDate', todayStr); // Lagre dato likevel
        // Kall display for å vise evt. eksisterende data
        if (typeof displayStreakAndRank === 'function') { displayStreakAndRank(); }
        return;
    }

    const lastLogStr = localStorage.getItem('streak_lastLogDate');
    let currentStreak = parseInt(localStorage.getItem('streak_count') || '0');
    let firstLogStr = localStorage.getItem('streak_firstLogDate'); // Endret til let

    if (!firstLogStr) {
        firstLogStr = todayStr; // Sett første logg-dato NÅ
        localStorage.setItem('streak_firstLogDate', firstLogStr);
        console.log("Streak: Setter første logg-dato:", firstLogStr);
    }

    let streakContinued = false;
    if (lastLogStr) {
        const lastLogDate = new Date(lastLogStr);
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);

        // Sjekk om lastLogDate er gyldig før bruk
        if (!isNaN(lastLogDate)) {
            const lastLogDateStrComp = getISODateString(lastLogDate);
            const yesterdayStrComp = getISODateString(yesterday);

            if (lastLogDateStrComp === yesterdayStrComp) {
                streakContinued = true;
            } else if (today.getDay() === 1) { // Mandag
                const lastFriday = new Date(today);
                lastFriday.setDate(today.getDate() - 3);
                const lastFridayStrComp = getISODateString(lastFriday);
                // Sjekk om sist logget var på fredag, lørdag eller søndag
                if (lastLogDateStrComp && lastFridayStrComp && lastLogDateStrComp >= lastFridayStrComp) {
                    streakContinued = true;
                    console.log("Streak: Fortsetter fra helgen.");
                }
            }
        } else {
             console.warn("Ugyldig lastLogDate funnet i localStorage:", lastLogStr);
        }
    }

    if (lastLogStr === todayStr) {
         console.log("Streak: Allerede logget i dag, streak uendret:", currentStreak);
    } else if (streakContinued) {
        currentStreak++;
        console.log("Streak: Fortsatt! Ny streak:", currentStreak);
    } else {
        currentStreak = 1;
        console.log("Streak: Ny streak startet:", currentStreak);
    }

    localStorage.setItem('streak_count', currentStreak.toString());
    localStorage.setItem('streak_lastLogDate', todayStr);

    // Kall calculateAndSaveRank etter at streak er oppdatert
    calculateAndSaveRank(firstLogStr, currentStreak); // Send med den potensielt nylig satte firstLogStr

    // Kall displayStreakAndRank (som ligger i theme.js) for å oppdatere UI
    if (typeof displayStreakAndRank === 'function') {
         displayStreakAndRank();
    } else {
         console.error("displayStreakAndRank function not found (expected in theme.js)");
    }
}
// --- SLUTT updateStreakAndRank ---


// --- Hjelpefunksjoner for Tid og Dato ---
function formatTime(ms) {
  if (isNaN(ms) || ms < 0) ms = 0;
  let totalSeconds = Math.floor(ms / 1000);
  let hours = Math.floor(totalSeconds / 3600);
  let minutes = Math.floor((totalSeconds % 3600) / 60);
  let seconds = totalSeconds % 60;
  return `${padZero(hours)}:${padZero(minutes)}:${padZero(seconds)}`;
}

function padZero(num) {
  return num.toString().padStart(2, '0');
}

// Konverterer millisekunder til desimaltimer, avrundet til nærmeste kvarter
function calculateHoursFromMs(ms) {
  if (isNaN(ms) || ms <= 0) return 0;
  const rawHours = ms / (1000 * 60 * 60);
  const quarterHours = Math.round(rawHours * 4) / 4;
  // Logg hvis resultatet er 0 selv om ms > 0
  if (ms > 0 && quarterHours === 0) {
      console.log(`calculateHoursFromMs: Rundet ned ${ms}ms (${rawHours.toFixed(3)}t) til 0 kvarter.`);
  }
  return quarterHours;
}


// --- Modal Håndtering ---
function closeModal(modalId) {
   const modal = document.getElementById(modalId);
   if (modal) {
       modal.style.display = 'none';
       console.log(`Lukket modal: ${modalId}`);
       if (modalId === 'commentModal') {
            const commentEl = document.getElementById('comment-text');
            if(commentEl) commentEl.value = '';
            const closedCustomerId = modal.getAttribute('data-current-customer-id');
             if (closedCustomerId && timers[closedCustomerId]) {
                 if (!isSubmitting) { // Slett kun hvis submit ikke kjører
                      delete timers[closedCustomerId];
                      console.log(`Slettet timerdata for kunde ID ${closedCustomerId} (lukket modal).`);
                 }
             }
            modal.removeAttribute('data-current-customer-id');
       } else if (modalId === 'newCustomerModal') {
            if (newCustomerTimer && !document.getElementById('add-customer-box')?.classList.contains('active')) {
                 cancelNewCustomer();
            }
       } else if (modalId === 'editCustomerModal') {
            document.getElementById('edit-customer-id').value = '';
       } else if (modalId === 'confirmDeleteModal') {
            document.getElementById('delete-customer-id').value = '';
       }
   } else {
       console.warn(`Forsøkte å lukke ukjent modal: ${modalId}`);
   }
}


// --- Logikk for å Sende Data ---

// Sender inn logget tid for en eksisterende kunde
function submitTime() {
  console.log("Forsøker å sende inn tid...");
  if (isSubmitting) { console.warn("Innsending pågår..."); return; }
  isSubmitting = true;

  const modal = document.getElementById('commentModal');
  const currentCustomerId = modal?.getAttribute('data-current-customer-id');
  if (currentCustomerId === null || currentCustomerId === undefined) {
       console.error("FEIL: Kunne ikke finne kunde-ID for innsending fra modal.");
       alert("Kritisk feil: Kunne ikke identifisere kunden.");
       closeModal('commentModal'); isSubmitting = false; return;
  }
  const timerData = timers[currentCustomerId];
  if (!timerData) {
       console.error(`FEIL: Ingen timerdata funnet for kunde ID ${currentCustomerId}.`);
       alert("Kritisk feil: Mangler data for tidsregistrering.");
       closeModal('commentModal'); isSubmitting = false; return;
  }

  const comment = document.getElementById('comment-text')?.value.trim() || "";
  const customerName = timerData.customerName;
  const timeSpentMs = timerData.timeSpentMs;
  const decimalHours = calculateHoursFromMs(timeSpentMs);
  console.log(`Sender tid for: ${customerName}, Timer: ${decimalHours}, Kommentar: "${comment}"`);

  const submitButton = document.getElementById('submit-comment-btn');
  if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Sender...'; }

  const dataToSend = {
    action: "logTime", customerName: customerName, timeSpent: decimalHours,
    comment: comment, date: new Date().toISOString().split('T')[0]
  };

  console.log("--- DEBUG submitTime --- Data som sendes:", dataToSend);

  // ===== VIKTIG: Kallet til updateStreakAndRank er HER inne i .then() =====
  sendDataToGoogleScript(dataToSend, `Tid (${decimalHours}t) registrert for ${customerName}`)
    .then(response => {
      console.log("Tidsregistrering (Backend):", response);

      if (response.success) {
          try {
              // === HER OPPPDATERES STREAK/RANK ETTER VELLYKKET LAGRING ===
              updateStreakAndRank();
              // =========================================================
          } catch (e) { console.error("Feil under oppdatering av streak/rank:", e); }
          // Hent ferske data for å oppdatere UI
          fetchCustomerData();
      } else {
           console.warn("Backend rapporterte feil, oppdaterer ikke streak/rank.");
           alert(`Lagring feilet hos backend: ${response.message || 'Ukjent feil'}`);
      }
      closeModal('commentModal'); // Lukk modal ved suksess eller håndtert feil fra backend
    })
    .catch(error => {
      console.error('Feil ved logging av tid (nettverk e.l.):', error);
      alert('Kunne ikke lagre tid: ' + error.message + "\n\nPrøv igjen senere.");
      // IKKE lukk modalen her, la brukeren prøve igjen
    })
    .finally(() => {
      isSubmitting = false;
      if (timers[currentCustomerId]) { // Rydd opp timerdata uansett
          delete timers[currentCustomerId];
          console.log(`Slettet timerdata for kunde ID ${currentCustomerId} etter submit forsøk.`);
      }
      if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Lagre og avslutt'; }
      activeBox = null;
    });
}
// --- SLUTT submitTime ---


// --- Kunde CRUD Funksjoner ---

function showEditCustomer(customerId) {
    const customerIndex = parseInt(customerId);
     if (isNaN(customerIndex) || customerIndex < 0 || customerIndex >= customers.length) { console.error(`Ugyldig kundeindeks for redigering: ${customerId}`); alert("Feil: Fant ikke kunden."); return; }
    const customer = customers[customerIndex];
    console.log(`Åpner redigeringsmodal for: ${customer.name}`);
    const modal = document.getElementById('editCustomerModal');
    const nameEl = document.getElementById('edit-customer-name');
    const hoursEl = document.getElementById('edit-customer-hours');
    const idEl = document.getElementById('edit-customer-id');
     if (!modal || !nameEl || !hoursEl || !idEl) { console.error("FEIL: Mangler elementer i rediger-modal!"); return; }
    nameEl.value = customer.name;
    hoursEl.value = customer.availableHours.toFixed(1);
    idEl.value = customerId;
    modal.style.display = 'block';
}

function createNewCustomer() {
  console.log("Forsøker å opprette ny kunde...");
  if (isSubmitting || !newCustomerTimer) { console.warn("Opptatt eller mangler timer data."); if (!newCustomerTimer) alert("Feil: Mangler tidsdata."); return; }
  const nameEl = document.getElementById('new-customer-name');
  const hoursEl = document.getElementById('new-customer-hours');
  const commentEl = document.getElementById('new-customer-comment');
  if(!nameEl || !hoursEl || !commentEl) { console.error("FEIL: Finner ikke skjemaelementer."); return; }
  const customerName = nameEl.value.trim();
  const availableHoursInput = hoursEl.value;
  const comment = commentEl.value.trim();
  if (!customerName) { alert('Kundenavn må fylles ut.'); return; }
  if (customers.some(c => c.name.toLowerCase() === customerName.toLowerCase())) { alert('En kunde med dette navnet finnes allerede.'); return; }
  if (!availableHoursInput || isNaN(parseFloat(availableHoursInput)) || parseFloat(availableHoursInput) < 0) { alert('Tildelte timer må være et gyldig positivt tall.'); return; }
  const initialAvailableHours = parseFloat(availableHoursInput);
  const timeSpentMs = newCustomerTimer.timeSpentMs || 0;
  const decimalHoursSpent = calculateHoursFromMs(timeSpentMs);

  isSubmitting = true;
  const createButton = document.getElementById('create-customer-btn');
  if (createButton) { createButton.disabled = true; createButton.textContent = 'Lagrer...'; }

  const dataToSend = {
    action: "addCustomer", customerName: customerName, initialAvailableHours: initialAvailableHours,
    timeSpent: decimalHoursSpent, comment: comment, date: new Date().toISOString().split('T')[0]
  };
  console.log("Sender data for ny kunde:", dataToSend);

  sendDataToGoogleScript(dataToSend, `Ny kunde '${customerName}' opprettet`)
    .then(response => {
      console.log("Ny kunde opprettet:", response);
      if (response.success) {
          closeModal('newCustomerModal');
          fetchCustomerData(); // Oppdater listen
      } else { throw new Error(response.message || "Ukjent feil ved opprettelse."); }
    })
    .catch(error => { console.error('Feil ved opprettelse:', error); alert('Kunne ikke opprette kunde: ' + error.message); })
    .finally(() => {
       isSubmitting = false;
       if (createButton) { createButton.disabled = false; createButton.textContent = 'Lagre kunde og tid'; }
       if (newCustomerTimer) { // Nullstill timer uansett
            if(newCustomerTimer.interval) clearInterval(newCustomerTimer.interval);
            newCustomerTimer = null;
            const timerDisp = document.getElementById('new-customer-timer');
            if(timerDisp) timerDisp.textContent = '00:00:00';
            document.getElementById('add-customer-box')?.classList.remove('active');
       }
    });
}

// --- SLUTTEN PÅ DEL 2/3 ---
// script.js (DEL 3/3 - Fortsettelse og slutt)

function updateCustomer() {
  console.log("Forsøker å oppdatere kunde...");
   if (isSubmitting) { console.warn("Opptatt..."); return; }
  const idEl = document.getElementById('edit-customer-id');
  const nameEl = document.getElementById('edit-customer-name');
  const hoursEl = document.getElementById('edit-customer-hours');
   if (!idEl || !nameEl || !hoursEl) { console.error("FEIL: Mangler elementer i rediger-modal!"); return; }
  const customerId = idEl.value;
  const originalCustomerIndex = parseInt(customerId);
  if (isNaN(originalCustomerIndex) || originalCustomerIndex < 0 || originalCustomerIndex >= customers.length) { console.error(`Ugyldig indeks: ${customerId}`); alert("Feil: Fant ikke kunden (intern feil)."); return; }
  const originalName = customers[originalCustomerIndex].name;
  const originalHours = customers[originalCustomerIndex].availableHours;
  const newName = nameEl.value.trim();
  const newHoursInput = hoursEl.value;
  if (!newName) { alert('Kundenavn må fylles ut.'); return; }
  if (customers.some((c, index) => index !== originalCustomerIndex && c.name.toLowerCase() === newName.toLowerCase())) { alert('Navnet finnes allerede.'); return; }
  if (newHoursInput === '' || isNaN(parseFloat(newHoursInput))) { alert('Gjenstående timer må være et gyldig tall.'); return; }
  const newAvailableHours = parseFloat(newHoursInput);
  if (newName === originalName && newAvailableHours === originalHours) { closeModal('editCustomerModal'); return; }

  isSubmitting = true;
  const updateButton = document.getElementById('update-customer-btn');
  if (updateButton) { updateButton.disabled = true; updateButton.textContent = 'Lagrer...'; }

  const dataToSend = { action: "updateCustomer", originalName: originalName, newName: newName, newAvailableHours: newAvailableHours };
  console.log("Sender kundeoppdatering:", dataToSend);

  sendDataToGoogleScript(dataToSend, `Kunde '${newName}' oppdatert`)
    .then(response => {
      console.log("Kundeoppdatering resultat:", response);
       if (response.success) {
            closeModal('editCustomerModal');
            fetchCustomerData(); // Oppdater listen
       } else { throw new Error(response.message || "Ukjent feil ved oppdatering."); }
    })
    .catch(error => { console.error('Feil ved oppdatering:', error); alert('Kunne ikke oppdatere kunde: ' + error.message); })
    .finally(() => {
      isSubmitting = false;
       if (updateButton) { updateButton.disabled = false; updateButton.textContent = 'Lagre endringer'; }
    });
}

function confirmDeleteCustomer(customerId) {
     const customerIndex = parseInt(customerId);
     if (isNaN(customerIndex) || customerIndex < 0 || customerIndex >= customers.length) { console.error(`Ugyldig indeks: ${customerId}`); return; }
    const customer = customers[customerIndex];
    console.log(`Åpner slettebekreftelse for: ${customer.name}`);
    const modal = document.getElementById('confirmDeleteModal');
    const nameEl = document.getElementById('delete-customer-name');
    const idEl = document.getElementById('delete-customer-id');
     if (!modal || !nameEl || !idEl) { console.error("FEIL: Mangler elementer i slette-modal!"); return; }
    nameEl.textContent = customer.name;
    idEl.value = customerId;
    modal.style.display = 'block';
}

function deleteCustomer() {
   console.log("Forsøker å slette kunde...");
    if (isSubmitting) { console.warn("Opptatt..."); return; }
  const idEl = document.getElementById('delete-customer-id');
  if(!idEl) { console.error("FEIL: Finner ikke delete-customer-id."); return; }
  const customerId = idEl.value;
  const customerIndex = parseInt(customerId);
   if (isNaN(customerIndex) || customerIndex < 0 || customerIndex >= customers.length) { console.error(`Ugyldig indeks: ${customerId}`); alert("Feil: Fant ikke kunden (intern feil)."); closeModal('confirmDeleteModal'); return; }
  const customerName = customers[customerIndex].name;
  isSubmitting = true;
  const deleteButton = document.getElementById('confirm-delete-btn');
  const cancelButton = document.querySelector('#confirmDeleteModal .cancel-btn');
  if (deleteButton) deleteButton.disabled = true;
  if (cancelButton) cancelButton.disabled = true;

  const dataToSend = { action: "deleteCustomer", customerName: customerName };
  console.log("Sender kundesletting:", dataToSend);

  sendDataToGoogleScript(dataToSend, `Kunde '${customerName}' slettet`)
    .then(response => {
      console.log("Kundesletting resultat:", response);
       if (response.success) {
           closeModal('confirmDeleteModal');
           fetchCustomerData(); // Oppdater listen
       } else { throw new Error(response.message || "Ukjent feil ved sletting."); }
    })
    .catch(error => { console.error('Feil ved sletting:', error); alert('Kunne ikke slette kunde: ' + error.message); })
    .finally(() => {
      isSubmitting = false;
      if (deleteButton) deleteButton.disabled = false;
      if (cancelButton) cancelButton.disabled = false;
      idEl.value = '';
    });
}


// === Robust Sending til Google Apps Script ===
function sendDataToGoogleScript(data, successMessage) {
  console.log("sendDataToGoogleScript kalt med data:", data);
  const statusEl = document.getElementById('last-updated');
  let originalStatusText = statusEl ? statusEl.textContent : '';
  function showStatusUpdate(message, isError = false) { if (statusEl) { statusEl.textContent = message; statusEl.style.color = isError ? 'var(--bar-red)' : 'var(--text-secondary)'; } }
  function hideStatusUpdate() { if(statusEl && originalStatusText) { statusEl.textContent = originalStatusText; statusEl.style.color = ''; } }

  return new Promise((resolve, reject) => {
    showStatusUpdate("Sender data...");
    const formData = new FormData(); for (const key in data) { formData.append(key, data[key]); }
    console.log("Metode 1: Forsøker standard POST");
    fetch(GOOGLE_SCRIPT_URL, { method: 'POST', body: formData })
    .then(response => response.text().then(text => ({ ok: response.ok, status: response.status, text })))
    .then(({ ok, status, text }) => {
      if (!ok) { console.error(`POST feilet - Status: ${status}, Tekst: ${text}`); throw new Error(text || `HTTP ${status}`); }
      try { const jsonData = JSON.parse(text); if (jsonData?.success !== undefined) { console.log("POST vellykket med JSON:", jsonData); hideStatusUpdate(); resolve(jsonData); } else { throw new Error("Ugyldig JSON-format."); } }
      catch (e) { console.error("Kunne ikke parse JSON:", text, e); throw new Error("Kunne ikke tolke svar."); }
    })
    .catch(error => { console.warn("Standard POST feilet:", error, "- Prøver GET."); showStatusUpdate("Sender data (Metode 2)..."); tryGetMethod(); });

    function tryGetMethod() {
        const params = new URLSearchParams(); for (const key in data) { params.append(key, data[key]); } params.append('nocache', Date.now());
        const getUrl = `${GOOGLE_SCRIPT_URL}?${params.toString()}`; console.log("Metode 2: Forsøker GET:", getUrl.substring(0, 200) + "...");
        fetch(getUrl)
        .then(response => response.text().then(text => ({ ok: response.ok, status: response.status, text })))
        .then(({ ok, status, text }) => {
          if (!ok) { console.error(`GET feilet - Status: ${status}, Tekst: ${text}`); throw new Error(text || `HTTP ${status}`); }
          try { const jsonData = JSON.parse(text); if (jsonData?.success !== undefined) { console.log("GET vellykket med JSON:", jsonData); hideStatusUpdate(); resolve(jsonData); } else { throw new Error(jsonData.message || "Ukjent format (GET)."); } }
          catch (e) { console.warn("Kunne ikke parse GET JSON:", text, e); throw new Error("Uventet svar (GET)."); }
        })
        .catch(error => { console.warn("GET feilet:", error, "- Prøver POST (no-cors)."); showStatusUpdate("Sender data (Metode 3)..."); tryPostNoCors(); });
    }

    function tryPostNoCors() {
        console.log("Metode 3: Forsøker POST (no-cors)");
        const formDataNC = new FormData(); for (const key in data) { formDataNC.append(key, data[key]); }
        fetch(GOOGLE_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: formDataNC })
        .then(response => { console.log("POST (no-cors) fullført (antar suksess)."); hideStatusUpdate(); resolve({ success: true, message: successMessage || "Handlingen ble sendt." }); })
        .catch(error => { console.error("Alle sendingsmetoder feilet:", error); showStatusUpdate("Feil ved sending!", true); reject(new Error('Alle sendingsmetoder feilet. ' + error.message)); });
    }
  }); // End Promise
} // End sendDataToGoogleScript


// --- Testfunksjon ---
function testConnection() {
  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL === 'DIN_NETTAPP_URL_HER') { alert("FEIL: GOOGLE_SCRIPT_URL er ikke satt!"); return; }
  console.log("Tester tilkobling..."); alert("Tester tilkobling... Se konsollen (F12).");
  sendDataToGoogleScript({ action: 'ping' }, "Tilkobling OK!")
      .then(response => {
          console.log("Test Suksess:", response);
           let message = "Tilkobling vellykket!\n\n";
           if (response?.message) message += `Melding: ${response.message}`;
           if (response?.timestamp) message += `\nServer tid: ${response.timestamp}`;
           if (response?.success === undefined) message += "\n(Merk: Manglet 'success'-flagg)";
           alert(message);
      })
      .catch(error => {
          console.error("Test Tilkoblingsfeil:", error);
          alert(`Tilkoblingstest FEIL:\n\n${error.message}\n\nSjekk konsoll, URL, publisering/tillatelser.`);
      });
}

// --- SLUTTEN PÅ script.js ---
