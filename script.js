// script.js

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
       // Vurder å legge inn en fallback for å vise en placeholder hvis theme.js ikke lastet?
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
       // console.log("Auto-refresh: Pauset pga aktiv timer eller innsending."); // Kan bli litt mye logging
    }
  }, 30000); // 30 sekunder
}

function fetchCustomerData() {
  if (isSubmitting) {
      console.log("Henting av data avbrutt, innsending pågår.");
      return;
  }
  console.log("Forsøker å hente kundedata...");
  const statusEl = document.getElementById('last-updated');
  if (statusEl) statusEl.textContent = 'Henter data...';

  // Bruker den mer robuste sendDataToGoogleScript for GET også
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
      useMockData(); // Fallback til testdata
      if (statusEl) statusEl.textContent = 'Tilkoblingsfeil';
      alert(`Kunne ikke hente kundedata: ${error.message}. Viser testdata.`);
    });
}

// Merk: Funksjonene fetchCustomersDirect og fetchCustomersWithJSONP er nå overflødige
// hvis sendDataToGoogleScript håndterer GET korrekt. Kan fjernes om ønskelig.

function processCustomerData(data) {
  console.log("Behandler kundedata:", data.customers.length, "kunder funnet.");
  // Sorter basert på navn før lagring
  customers = data.customers.sort((a, b) => a.name.localeCompare(b.name, 'no', { sensitivity: 'base' }));
  renderCustomers(); // Tegn opp UI

  const statusEl = document.getElementById('last-updated');
  if (statusEl) statusEl.textContent = new Date().toLocaleTimeString('nb-NO');
  console.log("Kundedata behandlet og UI oppdatert.");
}

function useMockData() {
  console.warn('Fallback til mock data for testing');
  const mockCustomerData = [
    { name: "Test Kunde A", availableHours: 40.5, allocatedHours: 50 }, // Antar allocated trengs ikke her
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

  // Tøm containeren for eksisterende kundebokser (behold "Legg til")
  const currentBoxes = container.querySelectorAll('.customer-box');
  currentBoxes.forEach(box => container.removeChild(box));

  if (!customers || customers.length === 0) {
    console.log("Ingen kunder å vise.");
    // Vurder å vise en melding til brukeren
    // container.insertAdjacentHTML('beforeend', '<p style="width:100%; text-align:center; color: var(--text-secondary);">Ingen kunder funnet for denne måneden.</p>');
    return;
  }

  // Generer og legg til kort for hver kunde
  customers.forEach((customer, index) => {
    const customerId = index; // Bruk index som intern ID for denne visningen
    const customerBox = createCustomerBoxElement(customer, customerId);
    container.appendChild(customerBox);

    // Gjenopprett aktiv status hvis denne kunden var aktiv
    if (activeCustomerId !== null && parseInt(activeCustomerId) === customerId) {
      activateCustomerBox(customerBox, customerId); // Bruk hjelpefunksjon
    }
  });

  console.log("Kundebokser rendret.");
}

// Hjelpefunksjon for å lage et enkelt kundekort-element
function createCustomerBoxElement(customer, customerId) {
    const customerBox = document.createElement('div');
    customerBox.className = 'customer-box';
    customerBox.setAttribute('data-id', customerId);

    // 1. Handlingsknapper
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'customer-actions';
    actionsDiv.innerHTML = `
      <button class="customer-action-btn edit-btn" title="Rediger kunde">✏️</button>
      <button class="customer-action-btn delete-btn" title="Slett kunde">🗑️</button>
    `;
    actionsDiv.querySelector('.edit-btn').addEventListener('click', (e) => {
      e.stopPropagation(); // Forhindre at timeren starter/stopper
      showEditCustomer(customerId);
    });
    actionsDiv.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDeleteCustomer(customerId);
    });
    customerBox.appendChild(actionsDiv);

    // 2. Kundenavn
    const nameDiv = document.createElement('div');
    nameDiv.className = 'customer-name';
    nameDiv.textContent = customer.name;
    customerBox.appendChild(nameDiv);

    // 3. Time-bar
    const hoursIndicator = document.createElement('div');
    hoursIndicator.className = 'hours-indicator';
    hoursIndicator.innerHTML = `
        <div class="hours-bar-container">
            <div class="hours-bar-fill"></div>
        </div>
        <span class="hours-remaining-text">0.0 t</span>
    `;
    customerBox.appendChild(hoursIndicator);
    // Oppdater baren med en gang
    updateCustomerBar(customerId, customer.availableHours, customerBox); // Send med elementet for effektivitet

    // 4. Timer display
    const timerDiv = document.createElement('div');
    timerDiv.className = 'timer';
    timerDiv.textContent = '00:00:00'; // Startverdi
    customerBox.appendChild(timerDiv);

    // 5. Status display
    const statusDiv = document.createElement('div');
    statusDiv.className = 'status';
    statusDiv.textContent = 'Inaktiv';
    customerBox.appendChild(statusDiv);

    // Legg til hoved-klikk listener for å starte/stoppe timer
    customerBox.addEventListener('click', () => toggleTimer(customerBox));

    return customerBox;
}


// Oppdaterer time-baren for en kunde
function updateCustomerBar(customerId, availableHours, customerBoxElement = null) {
  // Finn elementet hvis det ikke ble sendt med
  const box = customerBoxElement || document.querySelector(`.customer-box[data-id='${customerId}']`);
  if (!box) return;

  const barFill = box.querySelector('.hours-bar-fill');
  const barText = box.querySelector('.hours-remaining-text');

  if (!barFill || !barText) {
       // console.warn(`Kunne ikke finne bar-elementer for kunde ID ${customerId}`); // Kan bli mye logging
       return;
  }

  // Definer terskler og maks visuell bredde
  const redThreshold = 3;
  const yellowThreshold = 10;
  // Hent tildelte timer hvis tilgjengelig for prosentberegning, ellers bruk en default maks
  const allocatedHours = customers[customerId]?.allocatedHours; // Les fra den globale customer-listen
  const maxVisualHours = allocatedHours > 0 ? allocatedHours : 40; // Bruk tildelte timer som 100% hvis > 0

  // Beregn prosentandel (basert på gjenstående vs tildelt/maks)
  const hoursForPercentage = Math.max(0, availableHours); // Ikke vis negativ prosent
  const percentage = maxVisualHours > 0 ? Math.min(100, (hoursForPercentage / maxVisualHours) * 100) : 0;

  // Bestem fargeklasse basert på Gjenstående timer
  let barClass = '';
  if (availableHours < 0) {
      barClass = 'bar-red'; // Alltid rød hvis negativ
  } else if (availableHours < redThreshold) {
      barClass = 'bar-red';
  } else if (availableHours < yellowThreshold) {
      barClass = 'bar-yellow';
  } else {
      barClass = 'bar-green';
  }

  // Oppdater UI
  barText.textContent = `${availableHours.toFixed(1)} t`;
  barFill.style.width = `${percentage}%`;

  // Sett riktig fargeklasse (CSS styrer fargen)
  barFill.classList.remove('bar-red', 'bar-yellow', 'bar-green');
  if(barClass) barFill.classList.add(barClass);
  // Trenger ikke sette backgroundColor direkte hvis klassene har farge i CSS

}


// --- Timer Logikk ---

// Veksler timer for en gitt kundeboks
function toggleTimer(box) {
  if (!box || !box.classList.contains('customer-box')) {
      console.error("toggleTimer kalt med ugyldig element:", box);
      return;
  }
  const customerId = box.getAttribute('data-id');
  if (customerId === null) {
       console.error("toggleTimer kalt på boks uten 'data-id'");
      return;
  }
  const customerIndex = parseInt(customerId);
   if (isNaN(customerIndex) || customerIndex < 0 || customerIndex >= customers.length) {
        console.error(`toggleTimer: Fant ikke kunde med indeks ${customerId}`);
        return;
   }
   const customer = customers[customerIndex];

  // Sjekk om denne boksen er den aktive
  const isActive = box.classList.contains('active');

  // Hvis en annen timer er aktiv (enten kunde eller ny-kunde), stopp den først
  if (!isActive) {
      stopAnyActiveTimer(false); // Stopp andre uten å vise modal
  }

  // Nå, håndter klikket på DENNE boksen
  if (isActive) {
    // Stopper denne timeren
    console.log(`Stopper timer for kunde: ${customer.name} (Indeks: ${customerId})`);
    deactivateCustomerBox(box, customerId);
    isAutoRefreshPaused = false; // Tillat auto-refresh igjen
    // Vis kommentarmodal
    showCommentModal(customerId);
  } else {
    // Starter denne timeren
    console.log(`Starter timer for kunde: ${customer.name} (Indeks: ${customerId})`);
    activateCustomerBox(box, customerId);
    isAutoRefreshPaused = true; // Pause auto-refresh
  }
}

// Aktiverer en kundeboks (starter timer, setter UI)
function activateCustomerBox(box, customerId){
    if (!box || customerId === null) return;
    const customer = customers[parseInt(customerId)];
    if (!customer) return;

    box.classList.add('active');
    const statusDisplay = box.querySelector('.status');
    const timerDisplay = box.querySelector('.timer');
    if(statusDisplay) {
        statusDisplay.textContent = 'Aktiv';
        statusDisplay.style.fontWeight = 'bold';
        statusDisplay.style.color = 'var(--active)';
    }
    if(timerDisplay) timerDisplay.textContent = '00:00:00'; // Nullstill

    const startTime = new Date();
    // Slett evt. gammel timerdata før ny startes
    if (timers[customerId]?.interval) clearInterval(timers[customerId].interval);

    timers[customerId] = {
      startTime: startTime,
      customerName: customer.name, // Lagre navnet for modal/submit
      interval: setInterval(() => {
        const elapsedTime = Date.now() - startTime;
        // Sjekk om boksen fortsatt finnes og er aktiv før oppdatering
        const currentBox = document.querySelector(`.customer-box[data-id='${customerId}'].active`);
        if (currentBox) {
             currentBox.querySelector('.timer').textContent = formatTime(elapsedTime);
        } else {
             console.warn(`Interval for kunde ${customerId} kjører, men boksen er ikke aktiv/funnet. Stopper interval.`);
             if (timers[customerId]?.interval) clearInterval(timers[customerId].interval);
             delete timers[customerId]; // Rydd opp
        }
      }, 1000)
    };
    activeBox = box; // Sett denne boksen som den globalt aktive
}

// Deaktiverer en kundeboks (stopper timer, lagrer tid, resetter UI)
function deactivateCustomerBox(box, customerId){
     if (!box || customerId === null || !timers[customerId]) return;

     // Stopp intervallet
     if (timers[customerId].interval) {
        clearInterval(timers[customerId].interval);
     }

     // Beregn og lagre tid brukt
     const endTime = new Date();
     const timeSpentMs = endTime - timers[customerId].startTime;
     const timeSpentFormatted = formatTime(timeSpentMs);

     timers[customerId].endTime = endTime;
     timers[customerId].timeSpentMs = timeSpentMs;
     timers[customerId].timeSpentFormatted = timeSpentFormatted;
     // customerName er allerede lagret i timers[customerId] ved start

     // Oppdater UI
     box.classList.remove('active');
     const statusDisplay = box.querySelector('.status');
     const timerDisplay = box.querySelector('.timer');
     if(statusDisplay) {
         statusDisplay.textContent = 'Inaktiv';
         statusDisplay.style.fontWeight = 'normal';
         statusDisplay.style.color = 'var(--inactive)';
     }
      if(timerDisplay) timerDisplay.textContent = timeSpentFormatted; // Vis slutt-tiden

     activeBox = null; // Ingen boks er aktiv lenger
     // IKKE slett timers[customerId] her, trengs av showCommentModal/submitTime
}


// Stopper ALLE aktive timere (både kunde og ny-kunde)
// showCommentModalForCustomer: Hvis true OG det var en kunde-timer, vis modal. Ellers ikke.
function stopAnyActiveTimer(showCommentModalForCustomer = true) {
    let stoppedSomething = false;
    // Stopp aktiv kunde-timer
    if (activeBox) {
        const customerId = activeBox.getAttribute('data-id');
        console.log("Stopper aktiv KUNDE timer:", customerId);
        deactivateCustomerBox(activeBox, customerId);
        if (showCommentModalForCustomer) {
            showCommentModal(customerId);
        } else {
            // Hvis modal ikke skal vises, må vi rydde opp timer-data nå
             if (timers[customerId]) delete timers[customerId];
        }
        stoppedSomething = true;
    }
    // Stopp aktiv ny-kunde timer
    const addCustomerBox = document.getElementById('add-customer-box');
    if (addCustomerBox && addCustomerBox.classList.contains('active')) {
        console.log("Stopper aktiv NY-KUNDE timer.");
        // showModal=false fordi vi ikke vil ha ny-kunde modal når en annen timer startes
        stopNewCustomerTimer(false);
        stoppedSomething = true;
    }
    return stoppedSomething;
}


// Viser kommentarmodalen
function showCommentModal(customerId) {
    const customerData = timers[customerId];
    if (!customerData) {
        console.error(`showCommentModal: Fant ikke timer data for kunde ID ${customerId}`);
        alert("Feil: Kunne ikke hente data for kommentarmodal.");
        return;
    }
    console.log(`Viser kommentarmodal for: ${customerData.customerName}, Tid: ${customerData.timeSpentFormatted}`);

    const modal = document.getElementById('commentModal');
    const nameEl = document.getElementById('modal-customer-name');
    const timeEl = document.getElementById('modal-time-spent');
    const commentEl = document.getElementById('comment-text');

    if (!modal || !nameEl || !timeEl || !commentEl) {
        console.error("FEIL: Mangler elementer i kommentarmodalen!"); return;
    }

    nameEl.textContent = customerData.customerName;
    timeEl.textContent = `Tid brukt: ${customerData.timeSpentFormatted}`;
    commentEl.value = '';
    modal.style.display = 'block';
    modal.setAttribute('data-current-customer-id', customerId); // Lagre ID for submit
}


// --- Ny Kunde Timer Logikk ---
function startNewCustomerTimer() {
    // Stopp evt. annen aktiv timer FØRST
    if (stopAnyActiveTimer(true)) { // Viser modal for evt. aktiv kunde
       console.log("Stoppet annen aktiv timer før ny-kunde start.");
       // La brukeren fullføre den forrige økten før ny startes?
       // For nå, la oss bare stoppe og så starte ny her.
    }

    const addCustomerBox = document.getElementById('add-customer-box');
    if (!addCustomerBox || addCustomerBox.classList.contains('active')) {
        // Hvis man klikker igjen på aktiv ny-kunde, stopp den og vis modal
        if (addCustomerBox?.classList.contains('active')) {
             console.log("Stopper 'ny kunde'-timer (klikket igjen).");
             stopNewCustomerTimer(true); // Vis modal for å legge inn data
        }
        return;
    }

    console.log("Starter 'ny kunde'-timer.");
    isAutoRefreshPaused = true;
    addCustomerBox.classList.add('active');
    const timerDisplay = document.getElementById('new-customer-timer');
    if(timerDisplay) timerDisplay.textContent = '00:00:00';

    const startTime = new Date();
    // Slett evt. gammel data
    if(newCustomerTimer?.interval) clearInterval(newCustomerTimer.interval);

    newCustomerTimer = {
        startTime: startTime,
        interval: setInterval(() => {
            const elapsedTime = Date.now() - startTime;
            const currentAddBox = document.getElementById('add-customer-box'); // Sjekk på nytt
            if (currentAddBox?.classList.contains('active')) {
                 document.getElementById('new-customer-timer').textContent = formatTime(elapsedTime);
            } else {
                console.warn("Interval for 'ny kunde' stoppet (boks ikke aktiv lenger).");
                if (newCustomerTimer?.interval) clearInterval(newCustomerTimer.interval);
                // Ikke nullstill newCustomerTimer her, la stopNewCustomerTimer håndtere det
            }
        }, 1000)
    };
    activeBox = null; // Sikre at ingen KUNDE-boks er aktiv
}

// Stopper timer for "Legg til ny kunde"
function stopNewCustomerTimer(showModal = true) {
  if (!newCustomerTimer) { /* console.log("stopNewCustomerTimer kalt, men ingen data."); */ return; }
  if (newCustomerTimer.interval) clearInterval(newCustomerTimer.interval);

  console.log(`Stopper 'ny kunde'-timer. Skal modal vises? ${showModal}`);
  isAutoRefreshPaused = false;

  const addCustomerBox = document.getElementById('add-customer-box');
  if(addCustomerBox) addCustomerBox.classList.remove('active');

  // Beregn tid selv om intervallet kanskje stoppet før
  const endTime = new Date();
  const timeSpentMs = endTime - newCustomerTimer.startTime;
  const timeSpentFormatted = formatTime(timeSpentMs);
  const timerDisp = document.getElementById('new-customer-timer');
  if(timerDisp) timerDisp.textContent = timeSpentFormatted; // Vis sluttid

  // Lagre dataene midlertidig
  newCustomerTimer.endTime = endTime;
  newCustomerTimer.timeSpentMs = timeSpentMs;
  newCustomerTimer.timeSpentFormatted = timeSpentFormatted;
  newCustomerTimer.interval = null; // Marker intervallet som stoppet

  if (showModal) {
    // Vis modal for å legge inn kundedetaljer
    const modal = document.getElementById('newCustomerModal');
    const timeSpentEl = document.getElementById('new-customer-time-spent');
    const nameEl = document.getElementById('new-customer-name');
    const hoursEl = document.getElementById('new-customer-hours');
    const commentEl = document.getElementById('new-customer-comment');

    if (!modal || !timeSpentEl || !nameEl || !hoursEl || !commentEl) {
        console.error("FEIL: Mangler elementer i ny-kunde-modalen!");
        newCustomerTimer = null; // Nullstill hvis modal feiler
        if(timerDisp) timerDisp.textContent = '00:00:00';
        return;
    }

    timeSpentEl.textContent = `Tid brukt: ${timeSpentFormatted}`;
    nameEl.value = ''; nameEl.focus(); // Sett fokus på navnefeltet
    hoursEl.value = '';
    commentEl.value = '';
    modal.style.display = 'block';
  } else {
       // Hvis modal ikke skal vises (f.eks. stoppet av annen timer),
       // nullstill timeren helt
       console.log("Nullstiller newCustomerTimer uten å vise modal.");
       newCustomerTimer = null;
       if(timerDisp) timerDisp.textContent = '00:00:00';
  }
}
// Avbryter opprettelse av ny kunde (fra modal)
function cancelNewCustomer() {
  console.log("Avbryter ny kunde.");
  // Stopp og nullstill data selv om intervallet kanskje er stoppet
  if (newCustomerTimer) {
     if(newCustomerTimer.interval) clearInterval(newCustomerTimer.interval);
     newCustomerTimer = null;
     const addBox = document.getElementById('add-customer-box');
     const timerDisp = document.getElementById('new-customer-timer');
     if(addBox) addBox.classList.remove('active'); // Sørg for at den ikke er aktiv
     if(timerDisp) timerDisp.textContent = '00:00:00'; // Reset display
     isAutoRefreshPaused = false;
  }
  closeModal('newCustomerModal');
}


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
  // Vurder annen avrunding? Math.round(X * 10) / 10 for nærmeste 0.1 time?
  const quarterHours = Math.round(rawHours * 4) / 4;
  return quarterHours;
}


// --- Modal Håndtering ---
function closeModal(modalId) {
   const modal = document.getElementById(modalId);
   if (modal) {
       modal.style.display = 'none';
       console.log(`Lukket modal: ${modalId}`);
       if (modalId === 'commentModal') {
            // Rydd opp kommentarfelt og midlertidig timerdata
            const commentEl = document.getElementById('comment-text');
            if(commentEl) commentEl.value = '';
            const closedCustomerId = modal.getAttribute('data-current-customer-id');
             if (closedCustomerId && timers[closedCustomerId]) {
                 // Kun slett hvis submit IKKE pågår (finally i submit håndterer det ellers)
                 if (!isSubmitting) {
                      delete timers[closedCustomerId];
                      console.log(`Slettet midlertidig timerdata for kunde ID ${closedCustomerId} (lukket modal uten submit).`);
                 }
             }
            modal.removeAttribute('data-current-customer-id');
       } else if (modalId === 'newCustomerModal') {
            // Hvis ny-kunde modal lukkes uten submit/cancel, rydd opp timer
            if (newCustomerTimer && !document.getElementById('add-customer-box')?.classList.contains('active')) {
                 // Dette skjer typisk hvis man klikker utenfor modalen
                 console.log("Lukket ny-kunde modal uten submit, rydder opp timer.");
                 cancelNewCustomer(); // Bruk cancel for å rydde helt opp
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
  // -- HER STARTER FUNKSJONEN submitTime --// --- FUNKSJON for å sende inn tid (submitTime) --- FORTSETTELSE ---
function submitTime() {
  console.log("Forsøker å sende inn tid...");
  if (isSubmitting) {
    console.warn("Innsending pågår, avventer...");
    return;
  }
  isSubmitting = true;

  const modal = document.getElementById('commentModal');
  const currentCustomerId = modal?.getAttribute('data-current-customer-id'); // Hent ID fra modal

  if (currentCustomerId === null || currentCustomerId === undefined) {
       console.error("FEIL: Kunne ikke finne kunde-ID for innsending fra modal.");
       alert("Kritisk feil: Kunne ikke identifisere kunden for tidsregistrering.");
       closeModal('commentModal'); // Lukk modalen selv om det feilet
       isSubmitting = false;
       return;
  }

  const timerData = timers[currentCustomerId]; // Hent lagret timerdata
  if (!timerData) {
       console.error(`FEIL: Ingen timerdata funnet for kunde ID ${currentCustomerId} ved innsending.`);
       alert("Kritisk feil: Mangler data for tidsregistrering. Prøv igjen.");
       closeModal('commentModal'); // Lukk modalen selv om det feilet
       isSubmitting = false;
       return;
  }

  const comment = document.getElementById('comment-text')?.value.trim() || "";
  const customerName = timerData.customerName;
  const timeSpentMs = timerData.timeSpentMs;
  const decimalHours = calculateHoursFromMs(timeSpentMs); // Bruker avrundet tid

  console.log(`Sender tid for: ${customerName}, Timer: ${decimalHours}, Kommentar: "${comment}"`);

  const submitButton = document.getElementById('submit-comment-btn');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Sender...';
  }

  // Data som sendes til backend (forenklet, uten timer FØR/ETTER)
  const dataToSend = {
    action: "logTime",
    customerName: customerName,
    timeSpent: decimalHours, // Send avrundet desimaltid
    comment: comment,
    date: new Date().toISOString().split('T')[0]
  };

  // Debugging log
  console.log("--- DEBUG submitTime ---");
  console.log("Customer ID (fra modal):", currentCustomerId);
  console.log("Timer Data:", timerData);
  console.log("Data som sendes:", dataToSend);
  console.log("-----------------------");

  // Kall backend (bruk din send-funksjon)
  sendDataToGoogleScript(dataToSend, `Tid (${decimalHours}t) registrert for ${customerName}`)
    .then(response => {
      console.log("Tidsregistrering (Backend):", response);

      // --- START STREAK & RANK LOGIKK ---
      if (response.success) { // Oppdater kun hvis backend sa OK
          try {
              updateStreakAndRank(); // Oppdater streak og rank
          } catch (e) {
              console.error("Feil under oppdatering av streak/rank:", e);
          }
          // Oppdater UI umiddelbart KUN hvis backend *ikke* ga oss nye timer
          // Siden forenklet handleLogTime IKKE returnerer timer, henter vi alltid på nytt for sikkerhets skyld
          console.log("Henter ferske kundedata etter tidslogging...");
          fetchCustomerData(); // Henter ny kundeliste for å få oppdatert timebar etc.

      } else {
           console.warn("Backend rapporterte feil, oppdaterer ikke streak/rank eller kundedata.");
           // Vis feilmelding til brukeren
           alert(`Lagring feilet hos backend: ${response.message || 'Ukjent feil'}`);
           // Ikke hent data på nytt ved feil
      }
      // --- SLUTT STREAK & RANK LOGIKK ---

      // Lukk modal uansett om streak/rank oppdatering feilet internt
      // (men ikke hvis selve backend-kallet feilet, da håndteres det i catch)
      closeModal('commentModal');

    })
    .catch(error => {
      console.error('Feil ved logging av tid (nettverk/backend):', error);
      alert('Kunne ikke lagre tid: ' + error.message + "\n\nPrøv igjen senere.");
      // Ikke lukk modalen ved feil, slik at brukeren kan prøve igjen?
      // closeModal('commentModal'); // Vurder om denne skal være her
    })
    .finally(() => {
      // Denne kjøres ALLTID etter .then() eller .catch()
      isSubmitting = false; // Tillat nye innsendinger

      // Slett timer data uansett utfall, da økten er over
      if (timers[currentCustomerId]) {
          delete timers[currentCustomerId];
          console.log(`Slettet midlertidig timerdata for kunde ID ${currentCustomerId} etter innsendingsforsøk.`);
      }

      // Reset knappen
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Lagre og avslutt';
      }
      // activeBox ble satt til null i deactivateCustomerBox
    });
}
// --- SLUTT OPPDATERT submitTime ---


// --- Kunde CRUD Funksjoner ---

// Viser modal for å redigere kunde
function showEditCustomer(customerId) {
    const customerIndex = parseInt(customerId);
     if (isNaN(customerIndex) || customerIndex < 0 || customerIndex >= customers.length) {
        console.error(`Ugyldig kundeindeks for redigering: ${customerId}`);
        alert("Feil: Fant ikke kunden som skal redigeres.");
        return;
     }
    const customer = customers[customerIndex];
    console.log(`Åpner redigeringsmodal for: ${customer.name}`);

    const modal = document.getElementById('editCustomerModal');
    const nameEl = document.getElementById('edit-customer-name');
    const hoursEl = document.getElementById('edit-customer-hours'); // Dette feltet viser/endrer 'availableHours'
    const idEl = document.getElementById('edit-customer-id');

     if (!modal || !nameEl || !hoursEl || !idEl) {
        console.error("FEIL: Mangler elementer i rediger-kunde-modalen!");
        return;
    }

    nameEl.value = customer.name;
    // Viser 'availableHours' (gjenstående) for redigering
    hoursEl.value = customer.availableHours.toFixed(1);
    idEl.value = customerId; // Lagre intern index for oppdatering

    modal.style.display = 'block';
}

// Sender inn data for å opprette en ny kunde
function createNewCustomer() {
  console.log("Forsøker å opprette ny kunde...");
  if (isSubmitting || !newCustomerTimer) { // Sjekk også at timer-data finnes
      console.warn("Innsending pågår, avventer, eller mangler timer data...");
      if (!newCustomerTimer) alert("Feil: Mangler tidsdata for ny kunde.");
      return;
  }

  const nameEl = document.getElementById('new-customer-name');
  const hoursEl = document.getElementById('new-customer-hours'); // Tildelte timer
  const commentEl = document.getElementById('new-customer-comment');

  if(!nameEl || !hoursEl || !commentEl) {
      console.error("FEIL: Finner ikke skjemaelementer for ny kunde.");
      return;
  }

  const customerName = nameEl.value.trim();
  const availableHoursInput = hoursEl.value; // Dette er 'initialAvailableHours'
  const comment = commentEl.value.trim();

  // Validering
  if (!customerName) { alert('Kundenavn må fylles ut.'); return; }
  if (customers.some(c => c.name.toLowerCase() === customerName.toLowerCase())) {
     alert('En kunde med dette navnet finnes allerede for denne måneden.'); return;
   }
  if (!availableHoursInput || isNaN(parseFloat(availableHoursInput)) || parseFloat(availableHoursInput) < 0) {
    alert('Antall tildelte timer må være et gyldig positivt tall.'); return;
  }
  const initialAvailableHours = parseFloat(availableHoursInput);

  // Hent tid brukt fra den globale newCustomerTimer
  const timeSpentMs = newCustomerTimer.timeSpentMs || 0;
  const decimalHoursSpent = calculateHoursFromMs(timeSpentMs);
  console.log(`Registrerer ${decimalHoursSpent} timer brukt under opprettelse.`);

  isSubmitting = true;
  const createButton = document.getElementById('create-customer-btn');
   if (createButton) {
        createButton.disabled = true; createButton.textContent = 'Lagrer...';
   }

  const dataToSend = {
    action: "addCustomer",
    customerName: customerName,
    initialAvailableHours: initialAvailableHours, // Send tildelte timer
    timeSpent: decimalHoursSpent, // Send tid brukt under opprettelse
    comment: comment,
    date: new Date().toISOString().split('T')[0]
  };

  console.log("Sender data for ny kunde:", dataToSend);

  sendDataToGoogleScript(dataToSend, `Ny kunde '${customerName}' opprettet`)
    .then(response => {
      console.log("Ny kunde opprettet:", response);
      if (response.success) {
          // Lukk modal først
          closeModal('newCustomerModal');
          // Hent oppdatert kundeliste fra backend
          fetchCustomerData();
          // alert(`Ny kunde '${customerName}' ble opprettet!`); // Valgfritt
      } else {
          // Vis feilmelding fra backend
          throw new Error(response.message || "Ukjent feil ved opprettelse hos backend.");
      }
    })
    .catch(error => {
      console.error('Feil ved opprettelse av kunde:', error);
      alert('Kunne ikke opprette kunde: ' + error.message);
    })
    .finally(() => {
       isSubmitting = false;
       if (createButton) {
            createButton.disabled = false; createButton.textContent = 'Lagre kunde og tid';
       }
       // Nullstill newCustomerTimer helt uansett utfall
       if (newCustomerTimer) {
            if(newCustomerTimer.interval) clearInterval(newCustomerTimer.interval);
            newCustomerTimer = null;
            const timerDisp = document.getElementById('new-customer-timer');
            if(timerDisp) timerDisp.textContent = '00:00:00';
            const addBox = document.getElementById('add-customer-box');
            if(addBox) addBox.classList.remove('active');
            console.log("newCustomerTimer nullstilt etter opprettelsesforsøk.");
       }
       // Siden modalen lukkes i .then(), trenger vi ikke lukke den her.
       // closeModal('newCustomerModal'); // Flyttet til .then()
    });
}


// Sender inn data for å oppdatere en eksisterende kunde
function updateCustomer() {
  console.log("Forsøker å oppdatere kunde...");
   if (isSubmitting) { console.warn("Innsending pågår..."); return; }

  const idEl = document.getElementById('edit-customer-id');
  const nameEl = document.getElementById('edit-customer-name');
  const hoursEl = document.getElementById('edit-customer-hours'); // Dette er 'newAvailableHours'

   if (!idEl || !nameEl || !hoursEl) { console.error("FEIL: Mangler elementer i rediger-modal!"); return; }

  const customerId = idEl.value; // Dette er index i vår lokale 'customers'-array
  const originalCustomerIndex = parseInt(customerId);

  if (isNaN(originalCustomerIndex) || originalCustomerIndex < 0 || originalCustomerIndex >= customers.length) {
      console.error(`Ugyldig kundeindeks for oppdatering: ${customerId}`);
       alert("Feil: Kunne ikke finne kunden som skal oppdateres (intern feil).");
      return;
  }

  const originalName = customers[originalCustomerIndex].name;
  const originalHours = customers[originalCustomerIndex].availableHours; // Gammel gjenstående tid
  const newName = nameEl.value.trim();
  const newHoursInput = hoursEl.value; // Ny gjenstående tid

  // Validering
  if (!newName) { alert('Kundenavn må fylles ut.'); return; }
  if (customers.some((c, index) => index !== originalCustomerIndex && c.name.toLowerCase() === newName.toLowerCase())) {
     alert('En annen kunde med dette navnet finnes allerede for denne måneden.'); return;
   }
  if (newHoursInput === '' || isNaN(parseFloat(newHoursInput))) {
    alert('Antall gjenstående timer må være et gyldig tall (kan være 0 eller negativt).'); return;
  }
  const newAvailableHours = parseFloat(newHoursInput); // Den nye Gjenstående verdien

  // Sjekk om noe faktisk er endret
  if (newName === originalName && newAvailableHours === originalHours) {
      console.log("Ingen endringer å lagre.");
      closeModal('editCustomerModal');
      return;
  }

  isSubmitting = true;
  const updateButton = document.getElementById('update-customer-btn');
  if (updateButton) {
       updateButton.disabled = true; updateButton.textContent = 'Lagrer...';
  }

  // Data som sendes til backend
  const dataToSend = {
    action: "updateCustomer",
    originalName: originalName, // Send med originalt navn for å finne riktig rad
    newName: newName, // Send med nytt navn (kan være likt originalt)
    newAvailableHours: newAvailableHours // Send med NY Gjenstående tid
  };

  console.log("Sender kundeoppdatering:", dataToSend);

  sendDataToGoogleScript(dataToSend, `Kunde '${newName}' oppdatert`)
    .then(response => {
      console.log("Kundeoppdatering resultat:", response);
       if (response.success) {
            // Lukk modal FØR data hentes på nytt
            closeModal('editCustomerModal');
            // Hent oppdatert kundeliste for å reflektere endringer
            fetchCustomerData();
            // alert(`Kunde '${newName}' ble oppdatert.`); // Valgfritt
       } else {
           throw new Error(response.message || "Ukjent feil ved oppdatering hos backend.");
       }
    })
    .catch(error => {
      console.error('Feil ved oppdatering av kunde:', error);
      alert('Kunne ikke oppdatere kunde: ' + error.message);
    })
    .finally(() => {
      isSubmitting = false;
       if (updateButton) {
           updateButton.disabled = false; updateButton.textContent = 'Lagre endringer';
       }
       // Ikke lukk modal her, den lukkes i .then() ved suksess
       // closeModal('editCustomerModal');
    });
}


// Viser bekreftelsesmodal før sletting
function confirmDeleteCustomer(customerId) {
     const customerIndex = parseInt(customerId);
     if (isNaN(customerIndex) || customerIndex < 0 || customerIndex >= customers.length) {
        console.error(`Ugyldig kundeindeks for sletting: ${customerId}`); return;
     }
    const customer = customers[customerIndex];
    console.log(`Åpner slettebekreftelse for: ${customer.name}`);

    const modal = document.getElementById('confirmDeleteModal');
    const nameEl = document.getElementById('delete-customer-name');
    const idEl = document.getElementById('delete-customer-id');

     if (!modal || !nameEl || !idEl) { console.error("FEIL: Mangler elementer i slette-modal!"); return; }

    nameEl.textContent = customer.name;
    idEl.value = customerId; // Lagre intern index

    modal.style.display = 'block';
}

// Sender forespørsel om å slette en kunde
function deleteCustomer() {
   console.log("Forsøker å slette kunde...");
    if (isSubmitting) { console.warn("Innsending pågår..."); return; }

  const idEl = document.getElementById('delete-customer-id');
  if(!idEl) { console.error("FEIL: Finner ikke delete-customer-id element."); return; }

  const customerId = idEl.value; // Hent intern index
  const customerIndex = parseInt(customerId);

   if (isNaN(customerIndex) || customerIndex < 0 || customerIndex >= customers.length) {
      console.error(`Ugyldig kundeindeks for sletting: ${customerId}`);
      alert("Feil: Kunne ikke finne kunden som skal slettes (intern feil).");
      closeModal('confirmDeleteModal');
      return;
  }

  const customerName = customers[customerIndex].name; // Få navnet fra lokal data
  isSubmitting = true;

  const deleteButton = document.getElementById('confirm-delete-btn');
  const cancelButton = document.querySelector('#confirmDeleteModal .cancel-btn');
  if (deleteButton) deleteButton.disabled = true;
  if (cancelButton) cancelButton.disabled = true;

  // Send KUN navnet til backend (backend håndterer logikk for måned)
  const dataToSend = {
    action: "deleteCustomer",
    customerName: customerName
  };
  console.log("Sender kundesletting:", dataToSend);

  sendDataToGoogleScript(dataToSend, `Kunde '${customerName}' slettet`)
    .then(response => {
      console.log("Kundesletting resultat:", response);
       if (response.success) {
           closeModal('confirmDeleteModal');
           // Hent oppdatert liste for å fjerne kunden fra UI
           fetchCustomerData();
           // alert(`Kunde '${customerName}' ble slettet.`); // Valgfritt
       } else {
           throw new Error(response.message || "Ukjent feil ved sletting hos backend.");
       }
    })
    .catch(error => {
      console.error('Feil ved sletting av kunde:', error);
      alert('Kunne ikke slette kunde: ' + error.message);
    })
    .finally(() => {
      isSubmitting = false;
      if (deleteButton) deleteButton.disabled = false;
      if (cancelButton) cancelButton.disabled = false;
      idEl.value = ''; // Tøm ID-feltet uansett
      // Ikke lukk modal her, lukkes i .then() ved suksess
    });
}


// === Robust Sending til Google Apps Script ===
// Denne funksjonen prøver flere metoder for å sikre kommunikasjon
function sendDataToGoogleScript(data, successMessage) {
  console.log("sendDataToGoogleScript kalt med data:", data);
  const statusEl = document.getElementById('last-updated'); // For å vise status
  let originalStatusText = statusEl ? statusEl.textContent : '';

  function showStatusUpdate(message, isError = false) {
      if (statusEl) {
         statusEl.textContent = message;
         statusEl.style.color = isError ? 'var(--bar-red)' : 'var(--text-secondary)';
         console.log("Status satt:", message);
      }
  }
  function hideStatusUpdate() {
     if(statusEl && originalStatusText) {
          // Sett tilbake til siste oppdateringstidspunkt e.l.
          statusEl.textContent = originalStatusText;
          statusEl.style.color = ''; // Tilbakestill farge
          console.log("Status tilbakestilt til:", originalStatusText);
     }
  }

  return new Promise((resolve, reject) => {
    showStatusUpdate("Sender data..."); // Vis at noe skjer

    // --- 1. Forsøk: POST med FormData (standard og best hvis det fungerer) ---
    const formData = new FormData();
    for (const key in data) { formData.append(key, data[key]); }
    console.log("Metode 1: Forsøker standard POST");
    fetch(GOOGLE_SCRIPT_URL, { method: 'POST', body: formData })
    .then(response => {
        console.log("POST respons status:", response.status);
        // Få tak i teksten for bedre feilmelding
        return response.text().then(text => {
             if (!response.ok) {
                 console.error("POST feilet - Status:", response.status, "Tekst:", text);
                 throw new Error(text || `HTTP ${response.status}`); // Kast feil for å gå til catch
             }
             // Hvis OK, prøv å parse JSON
             try {
                  const jsonData = JSON.parse(text);
                  // Sjekk om backend returnerte et 'success'-flagg
                  if (jsonData?.success !== undefined) {
                      console.log("POST vellykket med JSON:", jsonData);
                      hideStatusUpdate();
                      resolve(jsonData); // Returner hele svaret fra backend
                  } else {
                      console.warn("Ugyldig JSON-format i vellykket svar:", text);
                      throw new Error("Ugyldig svarformat fra server (JSON).");
                  }
             } catch (e) {
                  console.error("Kunne ikke parse JSON fra vellykket svar:", text, e);
                  throw new Error("Kunne ikke tolke svar fra server (JSON parse error).");
             }
        });
    })
    .catch(error => {
      console.warn("Standard POST feilet:", error, "- Prøver GET.");
      showStatusUpdate("Sender data (Metode 2)...");
      tryGetMethod(); // Gå til neste metode
    });


    // --- 2. Forsøk: GET med parametere ---
    function tryGetMethod() {
        const params = new URLSearchParams();
        for (const key in data) { params.append(key, data[key]); }
        params.append('nocache', Date.now()); // Nocache for GET
        const getUrl = `${GOOGLE_SCRIPT_URL}?${params.toString()}`;
        console.log("Metode 2: Forsøker GET:", getUrl.substring(0, 200) + "...");

        fetch(getUrl)
            .then(response => {
                console.log("GET respons status:", response.status);
                 return response.text().then(text => {
                     if (!response.ok) {
                         console.error("GET feilet - Status:", response.status, "Tekst:", text);
                         throw new Error(text || `HTTP ${response.status}`);
                     }
                     try {
                         const jsonData = JSON.parse(text);
                         if (jsonData?.success !== undefined) {
                             console.log("GET vellykket med JSON:", jsonData);
                             hideStatusUpdate();
                             resolve(jsonData);
                         } else {
                            throw new Error(jsonData.message || "Server rapporterte feil eller ukjent format (GET).");
                         }
                     } catch (e) {
                         console.warn("Kunne ikke parse GET-svar som JSON:", text, e);
                         throw new Error("Uventet svarformat fra server (GET).");
                     }
                 });
            })
            .catch(error => {
                console.warn("GET feilet:", error, "- Prøver POST (no-cors).");
                showStatusUpdate("Sender data (Metode 3)...");
                tryPostNoCors(); // Gå til neste metode
            });
    }

    // --- 3. Forsøk: POST med 'no-cors' (Fallback - får ikke svar) ---
    function tryPostNoCors() {
        console.log("Metode 3: Forsøker POST (no-cors)");
        // Må bruke FormData på nytt for no-cors
        const formDataNC = new FormData();
        for (const key in data) { formDataNC.append(key, data[key]); }

        fetch(GOOGLE_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: formDataNC })
        .then(response => {
          // Ingen feil betyr sannsynligvis at forespørselen ble sendt
          console.log("POST (no-cors) fullført (antar suksess, ingen respons mottatt).");
          hideStatusUpdate();
          // Returner generell suksess, men ingen data fra backend
          resolve({ success: true, message: successMessage || "Handlingen ble sendt (ingen respons)." });
        })
        .catch(error => {
          console.error("Alle sendingsmetoder feilet:", error);
          showStatusUpdate("Feil ved sending!", true);
          // La status stå som feil
          reject(new Error('Alle forsøk på å sende data feilet. Sjekk nettverk og backend. ' + error.message));
        });
    }

    // Merk: Iframe-metoden er fjernet for enkelhet, da de tre over dekker de fleste scenarioer.
    // Hvis du har store CORS-problemer, kan iframe vurderes igjen.

  }); // End Promise
} // End sendDataToGoogleScript


// --- Testfunksjon ---
function testConnection() {
  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL === 'DIN_NETTAPP_URL_HER') {
       alert("FEIL: GOOGLE_SCRIPT_URL er ikke satt i script.js!"); return;
  }
  console.log("Tester tilkobling...");
  alert("Tester tilkobling til Google Script...\nSe konsollen (F12) for detaljer.");

  sendDataToGoogleScript({ action: 'ping' }, "Tilkobling OK!")
      .then(response => {
          console.log("Test Suksess:", response);
           let message = "Tilkobling vellykket!\n\n";
           if (response && response.message) {
               message += "Melding fra server: " + response.message;
               if (response.timestamp) message += "\nServer tid: " + response.timestamp;
               if (response.success === undefined) message += "\n(Merk: Manglet 'success'-flagg i respons)";
           } else {
               message += "(Ingen detaljert respons mottatt, men kallet ser ut til å ha gått gjennom)";
           }
           alert(message);
      })
      .catch(error => {
          console.error("Test Tilkoblingsfeil:", error);
          alert("Tilkoblingstest FEIL:\n\n" + error.message + "\n\nSjekk konsollen (F12) og verifiser URL/publisering/tillatelser.");
      });
}
