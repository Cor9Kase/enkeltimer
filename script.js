// script.js (Oppdatert for brukerbytte og redigerbar tid)

// Debounce-funksjon
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

// Google Script URL - ERSTATT MED DIN EGEN!
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyJQHGOOgG3zDYUmCGnP62kTJvX7vqhiXinTGw9Zb5OyDmZVLOt1kFEwnQCamwKItCw/exec';

// Globale variabler
const timers = {}; // Holder styr på aktive timere for hver kunde
let activeBox = null; // Referanse til den kundeboksen som har en aktiv timer
let customers = []; // Array for å lagre kundedata hentet fra backend
let newCustomerTimer = null; // Timer-objekt for "legg til ny kunde"-boksen
let isAutoRefreshPaused = false; // Flagg for å pause automatisk datahenting
let isSubmitting = false; // Flagg for å forhindre doble innsendinger til backend
let debouncedSubmitTime; // Variabel for den debounced versjonen av submitTime

// Initialisering når DOM er fullstendig lastet
document.addEventListener('DOMContentLoaded', function() {
  console.log("DOM lastet, initialiserer app (script.js)");

  // Definer debouncedSubmitTime hvis submitTime og debounce er tilgjengelige
  if (typeof submitTime === 'function' && typeof debounce === 'function') {
       debouncedSubmitTime = debounce(submitTime, 500); // 500ms forsinkelse
  } else {
       console.error("FEIL: Kunne ikke definere debouncedSubmitTime. Mangler submitTime eller debounce?");
       debouncedSubmitTime = submitTime; // Fallback til vanlig submitTime hvis debounce feiler
  }

  updateCurrentDate(); // Oppdater datovisningen i headeren

  // Last kundedata basert på currentUserSuffix fra theme.js
  if (typeof currentUserSuffix !== 'undefined') {
    loadCustomers();
  } else {
    console.warn("currentUserSuffix ikke definert ved DOMContentLoaded i script.js. Venter på theme.js eller laster med default.");
    // Fallback for å sikre at loadCustomers kalles
    setTimeout(() => {
        if (typeof currentUserSuffix === 'undefined') {
            // eslint-disable-next-line no-global-assign
            currentUserSuffix = localStorage.getItem('currentUserSuffix') || 'C'; // Hent fra localStorage eller default til 'C'
        }
        loadCustomers();
    }, 100); // Kort forsinkelse for å la theme.js potensielt initialisere først
  }

  startAutoRefresh(); // Start automatisk oppdatering av data
  addGlobalEventListeners(); // Legg til globale hendelseslyttere

  // Sjekk om GOOGLE_SCRIPT_URL er korrekt satt
  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes('DIN_NETTAPP_URL_HER') || GOOGLE_SCRIPT_URL.length < 60) { // Enkel sjekk på lengde og plassholder
       alert("ADVARSEL: GOOGLE_SCRIPT_URL ser ikke ut til å være korrekt satt i script.js! Appen vil kanskje ikke fungere riktig.");
       const statusElement = document.getElementById('last-updated');
       if(statusElement) statusElement.textContent = 'Konfigurasjonsfeil!';
   }
});

// Legg til globale hendelseslyttere for knapper og modaler
function addGlobalEventListeners() {
  if (typeof debouncedSubmitTime === 'function') {
      document.getElementById('submit-comment-btn')?.addEventListener('click', debouncedSubmitTime);
  }
  document.getElementById('create-customer-btn')?.addEventListener('click', createNewCustomer);
  document.getElementById('update-customer-btn')?.addEventListener('click', updateCustomer);
  document.getElementById('confirm-delete-btn')?.addEventListener('click', deleteCustomer);
  
  // Lukkeknapper for alle modaler
  document.querySelectorAll('.modal .close').forEach(btn => {
    btn.addEventListener('click', function() { closeModal(this.closest('.modal').id); });
  });
  document.querySelectorAll('.modal .cancel-btn').forEach(btn => {
    btn.addEventListener('click', function() { closeModal(this.closest('.modal').id); });
  });

  document.getElementById('refresh-button')?.addEventListener('click', loadCustomers); // Refresh-knapp laster kundedata

  // Lukk modal ved klikk utenfor modal-innholdet
  window.addEventListener('click', function(event) {
      document.querySelectorAll('.modal').forEach(modal => {
          if (modal.style.display === 'block' && event.target === modal) {
              closeModal(modal.id);
          }
      });
  });
}

// Oppdaterer datovisningen i headeren
function updateCurrentDate() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const dateEl = document.getElementById('current-date');
  if(dateEl) dateEl.textContent = now.toLocaleDateString('no-NO', options);
}

// Global funksjon for å initiere lasting av kundedata (kan kalles fra theme.js)
function loadCustomers() {
  if (typeof currentUserSuffix === 'undefined') {
    console.error("loadCustomers kalt før currentUserSuffix er definert. Bruker fallback.");
    // eslint-disable-next-line no-global-assign
    currentUserSuffix = localStorage.getItem('currentUserSuffix') || 'C';
  }
  console.log(`Initierer lasting av kundedata for bruker: ${currentUserSuffix}`);
  fetchCustomerData(); // Hovedfunksjon for å hente data
}

// Starter intervallet for automatisk dataoppdatering
function startAutoRefresh() {
  setInterval(() => {
    const noActiveTimers = !activeBox && !document.getElementById('add-customer-box')?.classList.contains('active');
    // Oppdater kun hvis ingen timere er aktive, ingen innsending pågår, og bruker er definert
    if (!isAutoRefreshPaused && !isSubmitting && noActiveTimers && typeof currentUserSuffix !== 'undefined') {
      console.log(`Auto-refresh: Henter ferske data for bruker: ${currentUserSuffix}...`);
      fetchCustomerData();
    }
  }, 30000); // Hvert 30. sekund
}

// Henter kundedata, prøver direkte fetch først, deretter JSONP som fallback
function fetchCustomerData() {
  if (isSubmitting) {
    console.log("Henting av data avbrutt, innsending pågår.");
    return;
  }
  if (typeof currentUserSuffix === 'undefined') {
     console.error("currentUserSuffix er ikke definert i fetchCustomerData. Kan ikke fortsette.");
     // eslint-disable-next-line no-global-assign
     currentUserSuffix = localStorage.getItem('currentUserSuffix') || 'C'; // Fallback
  }
  console.log(`Forsøker å hente kundedata for bruker: ${currentUserSuffix}...`);
  const statusEl = document.getElementById('last-updated');
  if (statusEl) statusEl.textContent = 'Henter data...';

  fetchCustomersDirect()
    .catch(error => {
      console.warn(`Direkte fetch feilet for bruker ${currentUserSuffix}, prøver JSONP:`, error);
      return fetchCustomersWithJSONP();
    })
    .catch(error => {
      console.error(`Alle tilkoblingsforsøk feilet for bruker ${currentUserSuffix}:`, error);
      useMockData(); // Fallback til mock-data ved total feil
      if (statusEl) statusEl.textContent = 'Tilkoblingsfeil';
    });
}

// Henter kundedata med direkte fetch
function fetchCustomersDirect() {
  const url = `${GOOGLE_SCRIPT_URL}?action=getCustomers&user=${currentUserSuffix}&nocache=${Date.now()}`;
  console.log(`Direkte fetch URL for ${currentUserSuffix}: ${url}`);
  return fetch(url)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status} ${response.statusText}`);
      return response.json();
    })
    .then(data => {
      if (data && data.success && Array.isArray(data.customers)) {
        processCustomerData(data); // Behandle gyldig data
        return data;
      }
      throw new Error('Ugyldig responsformat (direkte fetch): ' + JSON.stringify(data));
    });
    // Feil håndteres av kallende funksjon (fetchCustomerData)
}

// Henter kundedata med JSONP (fallback)
function fetchCustomersWithJSONP() {
  return new Promise((resolve, reject) => {
    const callbackName = `googleScriptCallback_${currentUserSuffix}_${Date.now()}`; // Unikt callback-navn
    const url = `${GOOGLE_SCRIPT_URL}?action=getCustomers&user=${currentUserSuffix}&callback=${callbackName}&nocache=${Date.now()}`;
    console.log(`JSONP URL for ${currentUserSuffix}: ${url}`);
    let script = null;
    let timeoutId = null;

    const cleanupJsonp = () => {
        clearTimeout(timeoutId);
        if (script && script.parentNode) {
            script.parentNode.removeChild(script);
        }
        delete window[callbackName];
    };

    timeoutId = setTimeout(() => {
      cleanupJsonp();
      reject(new Error('JSONP request timed out etter 10 sekunder'));
    }, 10000);

    window[callbackName] = function(data) {
      cleanupJsonp();
      if (data && data.success && Array.isArray(data.customers)) {
        processCustomerData(data);
        resolve(data);
      } else {
        reject(new Error('Ugyldig responsformat (JSONP): ' + JSON.stringify(data)));
      }
    };

    script = document.createElement('script');
    script.src = url;
    script.onerror = () => {
      cleanupJsonp();
      reject(new Error('JSONP script loading failed'));
    };
    document.body.appendChild(script);
  });
}

// Behandler og viser kundedata
function processCustomerData(data) {
  console.log(`Behandler kundedata for ${currentUserSuffix}: ${data.customers.length} kunder funnet.`);
  customers = data.customers.sort((a, b) => a.name.localeCompare(b.name, 'no')); // Sorter kunder alfabetisk
  renderCustomers(); // Tegn kundeboksene på nytt
  const statusEl = document.getElementById('last-updated');
  if (statusEl) statusEl.textContent = new Date().toLocaleTimeString('nb-NO');
}

// Fallback til mock-data hvis API-kall feiler
function useMockData() {
  console.warn(`Fallback til mock data for testing (bruker: ${currentUserSuffix})`);
  const mockCustomerData = [
    { name: `Test Kunde A (${currentUserSuffix})`, availableHours: 40.5 },
    { name: `Eksempel B (${currentUserSuffix})`, availableHours: 8.2 },
    { name: "William (Mock)", availableHours: 10.0 },
    { name: "Cornelius (Mock)", availableHours: 20.0 }
  ];
  customers = mockCustomerData.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
  renderCustomers();
  const statusEl = document.getElementById('last-updated');
  if(statusEl) statusEl.textContent = 'Frakoblet modus (testdata)';
}

// Tegner kundeboksene i HTML
function renderCustomers() {
  console.log(`Rendrer kundebokser for ${currentUserSuffix}...`);
  const container = document.getElementById('customer-container');
  if (!container) return;
  const activeCustomerId = activeBox ? activeBox.getAttribute('data-id') : null;
  
  // Tøm eksisterende kundebokser, men behold "Legg til ny kunde"-boksen
  container.querySelectorAll('.customer-box').forEach(box => container.removeChild(box));

  if (!customers || customers.length === 0) {
    // Vis en melding hvis ingen kunder finnes for den valgte brukeren
    const noCustomersMsg = document.createElement('p');
    noCustomersMsg.textContent = `Ingen kunder funnet for ${currentUserSuffix === 'C' ? 'Cornelius' : 'William'}.`;
    noCustomersMsg.style.textAlign = 'center';
    noCustomersMsg.style.width = '100%';
    noCustomersMsg.style.color = 'var(--text-secondary)';
    container.appendChild(noCustomersMsg); // Legg til meldingen etter "Legg til"-boksen
    return;
  }

  customers.forEach((customer, index) => {
    const customerId = index.toString(); // Bruk streng for data-id for konsistens
    const customerBox = document.createElement('div');
    customerBox.className = 'customer-box';
    customerBox.setAttribute('data-id', customerId);

    // Handlingsknapper (rediger, slett)
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'customer-actions';
    actionsDiv.innerHTML = `
      <button class="customer-action-btn edit-btn" title="Rediger kunde">✏️</button>
      <button class="customer-action-btn delete-btn" title="Slett kunde">🗑️</button>
    `;
    actionsDiv.querySelector('.edit-btn').addEventListener('click', (e) => { e.stopPropagation(); showEditCustomer(customerId); });
    actionsDiv.querySelector('.delete-btn').addEventListener('click', (e) => { e.stopPropagation(); confirmDeleteCustomer(customerId); });
    customerBox.appendChild(actionsDiv);

    // Kundenavn
    const nameDiv = document.createElement('div');
    nameDiv.className = 'customer-name';
    nameDiv.textContent = customer.name;
    customerBox.appendChild(nameDiv);

    // Timeindikator (bar)
    const hoursIndicator = document.createElement('div');
    hoursIndicator.className = 'hours-indicator';
    hoursIndicator.innerHTML = `
        <div class="hours-bar-container"><div class="hours-bar-fill"></div></div>
        <span class="hours-remaining-text">0.0 t</span>`;
    customerBox.appendChild(hoursIndicator);

    // Timerdisplay
    const timerDiv = document.createElement('div');
    timerDiv.className = 'timer';
    timerDiv.textContent = '00:00:00';
    customerBox.appendChild(timerDiv);

    // Statusdisplay
    const statusDiv = document.createElement('div');
    statusDiv.className = 'status';
    statusDiv.textContent = 'Inaktiv';
    customerBox.appendChild(statusDiv);

    customerBox.addEventListener('click', () => toggleTimer(customerBox));
    container.appendChild(customerBox);
    updateCustomerBar(customerId, customer.availableHours); // Oppdater bar initiellt

    // Gjenopprett aktiv status hvis denne boksen var aktiv
    if (activeCustomerId === customerId) {
        customerBox.classList.add('active');
        statusDiv.textContent = 'Aktiv';
        statusDiv.style.fontWeight = 'bold';
        statusDiv.style.color = 'var(--active)';
        if (timers[customerId]?.startTime) {
          timerDiv.textContent = formatTime(Date.now() - timers[customerId].startTime);
        }
        activeBox = customerBox;
    }
  });
}

// Oppdaterer den visuelle timebaren for en kunde
function updateCustomerBar(customerId, availableHours) {
  const customerBox = document.querySelector(`.customer-box[data-id='${customerId}']`);
  if (!customerBox) return;
  const barFill = customerBox.querySelector('.hours-bar-fill');
  const barText = customerBox.querySelector('.hours-remaining-text');
  if (!barFill || !barText) return;

  const redThreshold = 3;
  const yellowThreshold = 10;
  const maxVisualHours = Math.max(40, availableHours); // Sørg for at baren kan vise mer enn 40t hvis nødvendig

  const hoursForPercentage = Math.max(0, availableHours); // Prosent kan ikke være negativ
  const percentage = maxVisualHours > 0 ? Math.min(100, (hoursForPercentage / maxVisualHours) * 100) : 0;
  
  let barClass = 'bar-red';
  if (availableHours >= yellowThreshold) barClass = 'bar-green';
  else if (availableHours >= redThreshold) barClass = 'bar-yellow';

  barText.textContent = `${availableHours.toFixed(1)} t`;
  barFill.style.width = `${percentage}%`;
  barFill.classList.remove('bar-red', 'bar-yellow', 'bar-green');

  if (availableHours < 0) {
    barFill.style.backgroundColor = 'var(--inactive)'; // Grå for negativ
  } else if (availableHours < redThreshold) {
    barFill.style.backgroundColor = 'var(--bar-red)'; // Direkte rød
  } else {
    barFill.classList.add(barClass);
    barFill.style.backgroundColor = ''; // La CSS-klassen styre
  }
}

function isWeekend(date) { return date.getDay() === 0 || date.getDay() === 6; }
function getISODateString(date) { return date.toISOString().split('T')[0]; }

// Veksler timer for en gitt kundeboks
function toggleTimer(box) {
  if (!box) return;
  const customerId = box.getAttribute('data-id');
  if (customerId === null) return;
  const customerIndex = parseInt(customerId);
  if (isNaN(customerIndex) || customerIndex < 0 || customerIndex >= customers.length) return;
  
  const customer = customers[customerIndex];
  const timerDisplay = box.querySelector('.timer');
  const statusDisplay = box.querySelector('.status');

  if (box.classList.contains('active')) { // Stopper timer
    isAutoRefreshPaused = false;
    if (timers[customerId]?.interval) clearInterval(timers[customerId].interval);
    box.classList.remove('active');
    statusDisplay.textContent = 'Inaktiv';
    statusDisplay.style.fontWeight = 'normal';
    statusDisplay.style.color = 'var(--inactive)';
    
    const endTime = new Date();
    const timeSpentMs = timers[customerId]?.startTime ? (endTime - timers[customerId].startTime) : 0;
    
    timers[customerId] = { 
        ...timers[customerId], // Behold evt. tidligere data
        endTime, 
        timeSpentMs, 
        timeSpentFormatted: formatTime(timeSpentMs), 
        customerName: customer.name 
    };
    timerDisplay.textContent = timers[customerId].timeSpentFormatted;
    showCommentModal(customerId);
    activeBox = null;
  } else { // Starter timer
    if (activeBox) toggleTimer(activeBox); // Stopp annen aktiv timer først
    const addCustomerBox = document.getElementById('add-customer-box');
    if (addCustomerBox?.classList.contains('active')) stopNewCustomerTimer(false); // Stopp "ny kunde"-timer
    
    isAutoRefreshPaused = true;
    box.classList.add('active');
    statusDisplay.textContent = 'Aktiv';
    statusDisplay.style.fontWeight = 'bold';
    statusDisplay.style.color = 'var(--active)';
    timerDisplay.textContent = '00:00:00';
    
    const startTime = new Date();
    timers[customerId] = {
      startTime,
      customerName: customer.name,
      interval: setInterval(() => {
        const currentBoxTimer = document.querySelector(`.customer-box[data-id='${customerId}'].active .timer`);
        if (currentBoxTimer) {
            currentBoxTimer.textContent = formatTime(Date.now() - startTime);
        } else {
            // Hvis boksen ikke lenger er aktiv (f.eks. bruker byttet side), stopp intervallet
            if(timers[customerId]?.interval) clearInterval(timers[customerId].interval);
        }
      }, 1000)
    };
    activeBox = box;
  }
}

// Viser modal for kommentar og tidsjustering
function showCommentModal(customerId) {
    const timerData = timers[customerId];
    if (!timerData || typeof timerData.timeSpentFormatted === 'undefined') { // Sjekk om timeSpentFormatted er definert
        console.error(`showCommentModal: Ugyldig timer data for kunde ID ${customerId}. Tid kan ha blitt nullstilt.`);
        // Vurder å hente siste tid fra timerDisplay hvis mulig, eller vis feil.
        // For nå, ikke vis modalen hvis data er ufullstendig.
        return;
    }

    const modal = document.getElementById('commentModal');
    const nameEl = document.getElementById('modal-customer-name');
    const timeOriginalEl = document.getElementById('modal-time-spent-original');
    const timeEditableEl = document.getElementById('modal-time-spent-editable');
    const commentEl = document.getElementById('comment-text');

    if (!modal || !nameEl || !timeOriginalEl || !timeEditableEl || !commentEl) return;

    nameEl.textContent = timerData.customerName;
    timeOriginalEl.textContent = timerData.timeSpentFormatted;
    timeEditableEl.value = timerData.timeSpentFormatted;
    commentEl.value = '';
    modal.style.display = 'block';
    modal.setAttribute('data-current-customer-id', customerId);
}

// Starter timer for "Legg til ny kunde"-boksen
function startNewCustomerTimer() {
    const addCustomerBox = document.getElementById('add-customer-box');
    if (!addCustomerBox) return;
    if (activeBox) { toggleTimer(activeBox); return; } // Stopp annen aktiv timer
    if (addCustomerBox.classList.contains('active')) { stopNewCustomerTimer(true); return; } // Stopp hvis allerede aktiv

    isAutoRefreshPaused = true;
    addCustomerBox.classList.add('active');
    const timerDisplay = document.getElementById('new-customer-timer');
    if(timerDisplay) timerDisplay.textContent = '00:00:00';
    
    const startTime = new Date();
    newCustomerTimer = {
        startTime,
        interval: setInterval(() => {
            const currentAddBox = document.getElementById('add-customer-box');
            const currentTimerDisp = document.getElementById('new-customer-timer');
            if (currentAddBox?.classList.contains('active') && currentTimerDisp) {
                 currentTimerDisp.textContent = formatTime(Date.now() - startTime);
            } else if (newCustomerTimer?.interval) {
                clearInterval(newCustomerTimer.interval);
            }
        }, 1000)
    };
}

// Stopper timer for "Legg til ny kunde"
function stopNewCustomerTimer(showModal = true) {
  if (!newCustomerTimer?.startTime) { // Sjekk om startTime er satt, ikke bare interval
      console.log("stopNewCustomerTimer kalt, men ingen gyldig 'ny kunde'-timer funnet.");
      // Sørg for at UI er nullstilt hvis noe er rart
      document.getElementById('add-customer-box')?.classList.remove('active');
      const timerDisp = document.getElementById('new-customer-timer');
      if(timerDisp) timerDisp.textContent = '00:00:00';
      isAutoRefreshPaused = false;
      return;
  }
  if(newCustomerTimer.interval) clearInterval(newCustomerTimer.interval);
  isAutoRefreshPaused = false;
  document.getElementById('add-customer-box')?.classList.remove('active');
  
  const timeSpentMs = Date.now() - newCustomerTimer.startTime;
  const timeSpentFormatted = formatTime(timeSpentMs);
  
  newCustomerTimer.endTime = new Date();
  newCustomerTimer.timeSpentMs = timeSpentMs;
  newCustomerTimer.timeSpentFormatted = timeSpentFormatted;

  const timerDisp = document.getElementById('new-customer-timer');
  if(timerDisp) timerDisp.textContent = timeSpentFormatted;

  if (showModal) {
    const modal = document.getElementById('newCustomerModal');
    const timeOriginalEl = document.getElementById('new-customer-time-spent-original');
    const timeEditableEl = document.getElementById('new-customer-time-spent-editable');
    
    if (modal && timeOriginalEl && timeEditableEl) {
        timeOriginalEl.textContent = timeSpentFormatted;
        timeEditableEl.value = timeSpentFormatted;
        ['new-customer-name', 'new-customer-hours', 'new-customer-comment'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
        modal.style.display = 'block';
    } else {
        newCustomerTimer = null; 
        if(timerDisp) timerDisp.textContent = '00:00:00';
    }
  } else {
       if (!showModal) {
           newCustomerTimer = null;
           if(timerDisp) timerDisp.textContent = '00:00:00';
       }
  }
}

function cancelNewCustomer() {
  if (newCustomerTimer) {
     if(newCustomerTimer.interval) clearInterval(newCustomerTimer.interval);
     newCustomerTimer = null;
     document.getElementById('add-customer-box')?.classList.remove('active');
     const timerDisp = document.getElementById('new-customer-timer');
     if(timerDisp) timerDisp.textContent = '00:00:00';
     isAutoRefreshPaused = false;
  }
  closeModal('newCustomerModal');
}

function formatTime(ms) {
  if (isNaN(ms) || ms < 0) ms = 0;
  let totalSeconds = Math.floor(ms / 1000);
  let hours = Math.floor(totalSeconds / 3600);
  let minutes = Math.floor((totalSeconds % 3600) / 60);
  let seconds = totalSeconds % 60;
  return `${padZero(hours)}:${padZero(minutes)}:${padZero(seconds)}`;
}
function padZero(num) { return num.toString().padStart(2, '0'); }

function closeModal(modalId) {
   const modal = document.getElementById(modalId);
   if (modal) {
       modal.style.display = 'none';
       if (modalId === 'commentModal') {
            document.getElementById('comment-text').value = ''; // Tøm alltid kommentarfeltet
            const closedCustomerId = modal.getAttribute('data-current-customer-id');
            if (closedCustomerId && timers[closedCustomerId]) {
                 // Vurder å ikke slette timerData her hvis brukeren bare lukket modalen uten å lagre,
                 // men for nå sletter vi for å unngå gammel data ved neste åpning.
                 delete timers[closedCustomerId]; 
            }
            modal.removeAttribute('data-current-customer-id');
       } else if (modalId === 'newCustomerModal') {
            // Hvis "Legg til ny kunde"-timeren fortsatt er aktiv i UI (men intervallet er stoppet), nullstill den.
            if (document.getElementById('add-customer-box')?.classList.contains('active') && newCustomerTimer) {
                 // Dette er mer en safety-sjekk, cancelNewCustomer bør ha håndtert det.
            } else if (newCustomerTimer) { // Hvis timeren var stoppet, men modalen bare lukkes
                newCustomerTimer = null; // Sørg for at data er borte
                const timerDisp = document.getElementById('new-customer-timer');
                if(timerDisp) timerDisp.textContent = '00:00:00';
            }
       } else if (modalId === 'editCustomerModal') {
            document.getElementById('edit-customer-id').value = '';
       } else if (modalId === 'confirmDeleteModal') {
            document.getElementById('delete-customer-id').value = '';
       }
   }
}

// Konverterer HH:MM:SS til desimaltimer, avrundet til nærmeste kvarter
function parseHHMMSSToDecimalHours(timeString) {
    if (!timeString || typeof timeString !== 'string') return null;
    const parts = timeString.split(':');
    if (parts.length !== 3) return null;

    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseInt(parts[2], 10);

    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds) ||
        hours < 0 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
        return null;
    }
    const totalSecondsValue = (hours * 3600) + (minutes * 60) + seconds;
    const decimalHours = totalSecondsValue / 3600;
    return Math.round(decimalHours * 4) / 4; // Avrund til nærmeste 0.25
}


// Sender inn logget tid (potensielt redigert)
function submitTime() {
  if (isSubmitting) return;
  isSubmitting = true;

  const modal = document.getElementById('commentModal');
  const currentCustomerId = modal?.getAttribute('data-current-customer-id');
  if (currentCustomerId === null || currentCustomerId === undefined) {
       console.error("submitTime: Kunde-ID mangler fra modal.");
       isSubmitting = false; return;
  }
  const timerData = timers[currentCustomerId]; // Hent den lagrede timer-dataen
  if (!timerData) {
       console.error(`submitTime: Ingen timerdata funnet for kunde ID ${currentCustomerId}.`);
       alert("Feil: Kunne ikke finne data for tidsregistrering. Prøv å starte timeren på nytt.");
       isSubmitting = false; closeModal('commentModal'); return;
  }

  const comment = document.getElementById('comment-text')?.value.trim() || "";
  const customerName = timerData.customerName;
  
  const editedTimeStr = document.getElementById('modal-time-spent-editable')?.value;
  const decimalHours = parseHHMMSSToDecimalHours(editedTimeStr);

  if (decimalHours === null) {
      alert("Ugyldig tidsformat. Bruk HH:MM:SS (f.eks. 01:30:00). Tiden ble ikke lagret.");
      isSubmitting = false;
      // Ikke lukk modalen, la brukeren korrigere
      const submitButton = document.getElementById('submit-comment-btn');
      if (submitButton) submitButton.disabled = false; // Aktiver knappen igjen
      return;
  }
   if (decimalHours === 0 && !confirm("Du er i ferd med å lagre 0 timer. Er du sikker?")) {
      isSubmitting = false;
      const submitButton = document.getElementById('submit-comment-btn');
      if (submitButton) submitButton.disabled = false;
      return;
  }


  console.log(`Sender tid for: ${customerName}, Redigert Tid (desimal): ${decimalHours}, Kommentar: "${comment}"`);
  const submitButton = document.getElementById('submit-comment-btn');
  if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Sender...'; }

  const dataToSend = {
    action: "logTime", customerName, timeSpent: decimalHours, comment,
    date: getISODateString(new Date()), user: currentUserSuffix // Send med bruker
  };

  sendDataToGoogleScript(dataToSend, `Tid (${decimalHours}t) registrert for ${customerName}`)
    .then(response => {
      if (response.success) {
          if (typeof updateStreakAndRank === 'function') updateStreakAndRank();
          loadCustomers(); // Oppdater UI
      } else {
           alert(`Lagring feilet hos backend: ${response.message || 'Ukjent feil'}`);
      }
      closeModal('commentModal');
    })
    .catch(error => {
      alert('Kunne ikke lagre tid: ' + error.message);
      // La modalen være åpen for nytt forsøk eller manuell lukking
      if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Lagre og avslutt';}
    })
    .finally(() => {
      isSubmitting = false;
      if (timers[currentCustomerId]) delete timers[currentCustomerId]; // Rydd opp uansett
      // Knappen tilbakestilles i .catch eller .then -> closeModal
      activeBox = null;
    });
}

function showEditCustomer(customerId) { /* ... (som før) ... */ }

// Oppretter ny kunde, bruker potensielt redigert tid
function createNewCustomer() {
  if (isSubmitting) return;

  const nameEl = document.getElementById('new-customer-name');
  const hoursEl = document.getElementById('new-customer-hours');
  const commentEl = document.getElementById('new-customer-comment');
  const editedTimeStr = document.getElementById('new-customer-time-spent-editable')?.value;

  if(!nameEl || !hoursEl || !commentEl || !editedTimeStr) return;

  const customerName = nameEl.value.trim();
  const availableHoursInput = hoursEl.value;
  const comment = commentEl.value.trim();
  const decimalHoursSpent = parseHHMMSSToDecimalHours(editedTimeStr);

  if (decimalHoursSpent === null) {
      alert("Ugyldig tidsformat for 'Tid brukt'. Bruk HH:MM:SS."); return;
  }
  if (!customerName) { alert('Kundenavn må fylles ut.'); return; }
  if (customers.some(c => c.name.toLowerCase() === customerName.toLowerCase())) {
     alert('En kunde med dette navnet finnes allerede.'); return;
  }
  if (!availableHoursInput || isNaN(parseFloat(availableHoursInput)) || parseFloat(availableHoursInput) < 0) {
    alert('Timer må være et gyldig positivt tall.'); return;
  }
  const initialAvailableHours = parseFloat(availableHoursInput);
  
  isSubmitting = true;
  const createButton = document.getElementById('create-customer-btn');
  if (createButton) { createButton.disabled = true; createButton.textContent = 'Lagrer...'; }
  
  const dataToSend = {
    action: "addCustomer", customerName, initialAvailableHours, 
    timeSpent: decimalHoursSpent, comment,
    date: getISODateString(new Date()), user: currentUserSuffix // Send med bruker
  };

  sendDataToGoogleScript(dataToSend, `Ny kunde '${customerName}' opprettet`)
    .then(response => {
      if(response.customer) {
          customers.push(response.customer);
          customers.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
          renderCustomers();
      } else {
          loadCustomers();
      }
      closeModal('newCustomerModal');
    })
    .catch(error => alert('Kunne ikke opprette kunde: ' + error.message))
    .finally(() => {
       isSubmitting = false;
       if (createButton) { createButton.disabled = false; createButton.textContent = 'Lagre kunde og tid'; }
       if (newCustomerTimer) {
            if(newCustomerTimer.interval) clearInterval(newCustomerTimer.interval);
            newCustomerTimer = null;
            const timerDisp = document.getElementById('new-customer-timer');
            if(timerDisp) timerDisp.textContent = '00:00:00';
            document.getElementById('add-customer-box')?.classList.remove('active');
       }
    });
}

function updateCustomer() { /* ... (som før, men husk å sende user i dataToSend) ... */ 
   if (isSubmitting) return;
  const idEl = document.getElementById('edit-customer-id');
  const nameEl = document.getElementById('edit-customer-name');
  const hoursEl = document.getElementById('edit-customer-hours');
  if (!idEl || !nameEl || !hoursEl) return;
  const customerId = idEl.value;
  const originalCustomerIndex = parseInt(customerId);
  if (isNaN(originalCustomerIndex) || originalCustomerIndex < 0 || originalCustomerIndex >= customers.length) return;
  const originalName = customers[originalCustomerIndex].name;
  const originalHours = customers[originalCustomerIndex].availableHours;
  const newName = nameEl.value.trim();
  const newHoursInput = hoursEl.value;
  if (!newName) { alert('Kundenavn må fylles ut.'); return; }
  if (customers.some((c, index) => index !== originalCustomerIndex && c.name.toLowerCase() === newName.toLowerCase())) {
     alert('En annen kunde med navnet finnes allerede.'); return;
  }
  if (newHoursInput === '' || isNaN(parseFloat(newHoursInput))) {
    alert('Timer må være et gyldig tall.'); return;
  }
  const newAvailableHours = parseFloat(newHoursInput);
  if (newName === originalName && newAvailableHours === originalHours) {
    closeModal('editCustomerModal'); return;
  }
  isSubmitting = true;
  const updateButton = document.getElementById('update-customer-btn');
  if (updateButton) { updateButton.disabled = true; updateButton.textContent = 'Lagrer...'; }
  const dataToSend = { 
      action: "updateCustomer", originalName, newName, newAvailableHours, 
      user: currentUserSuffix // Send med bruker
    };
  sendDataToGoogleScript(dataToSend, `Kunde '${newName}' oppdatert`)
    .then(response => {
      if(response.customer) {
          customers[originalCustomerIndex].name = response.customer.name;
          customers[originalCustomerIndex].availableHours = response.customer.availableHours;
          customers.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
          renderCustomers(); 
      } else {
           loadCustomers();
      }
      closeModal('editCustomerModal');
    })
    .catch(error => alert('Kunne ikke oppdatere kunde: ' + error.message))
    .finally(() => {
      isSubmitting = false;
      if (updateButton) { updateButton.disabled = false; updateButton.textContent = 'Lagre endringer';}
    });
}
function confirmDeleteCustomer(customerId) { /* ... (som før) ... */ }
function deleteCustomer() { /* ... (som før, men husk å sende user i dataToSend) ... */ 
  if (isSubmitting) return;
  const idEl = document.getElementById('delete-customer-id');
  if(!idEl) return;
  const customerId = idEl.value;
  const customerIndex = parseInt(customerId);
  if (isNaN(customerIndex) || customerIndex < 0 || customerIndex >= customers.length) {
    closeModal('confirmDeleteModal'); return;
  }
  const customerName = customers[customerIndex].name;
  isSubmitting = true;
  const deleteButton = document.getElementById('confirm-delete-btn');
  const cancelButton = document.querySelector('#confirmDeleteModal .cancel-btn');
  if (deleteButton) deleteButton.disabled = true;
  if (cancelButton) cancelButton.disabled = true;
  const dataToSend = { 
      action: "deleteCustomer", customerName,
      user: currentUserSuffix // Send med bruker
    };
  sendDataToGoogleScript(dataToSend, `Kunde '${customerName}' slettet`)
    .then(() => {
      customers.splice(customerIndex, 1);
      renderCustomers();
      closeModal('confirmDeleteModal');
    })
    .catch(error => alert('Kunne ikke slette kunde: ' + error.message))
    .finally(() => {
      isSubmitting = false;
      if (deleteButton) deleteButton.disabled = false;
      if (cancelButton) cancelButton.disabled = false;
      if (idEl) idEl.value = '';
    });
}

// Robust sending til Google Apps Script (inkluderer 'user' automatisk)
function sendDataToGoogleScript(data, successMessage) {
  console.log("sendDataToGoogleScript kalt med data:", data, `for bruker: ${data.user || currentUserSuffix}`); // Bruk data.user hvis satt, ellers global
  
  // Sørg for at 'user' alltid er med, bruk global currentUserSuffix hvis ikke spesifisert i data-objektet
  const dataWithUser = { ...data, user: data.user || currentUserSuffix };

  return new Promise((resolve, reject) => {
    const formData = new FormData();
    for (const key in dataWithUser) {
      formData.append(key, dataWithUser[key]);
    }

    fetch(GOOGLE_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: formData })
    .then(() => { 
      console.log(`POST (no-cors) for ${dataWithUser.user} fullført (antar suksess).`);
      resolve({ success: true, message: successMessage || `Handlingen ble utført for ${dataWithUser.user} (POST).` });
    })
    .catch(error1 => {
      console.warn(`POST (no-cors) for ${dataWithUser.user} feilet:`, error1, "- Prøver GET.");
      const params = new URLSearchParams();
      for (const key in dataWithUser) { params.append(key, dataWithUser[key]); }
      params.append('nocache', Date.now());
      const getUrl = `${GOOGLE_SCRIPT_URL}?${params.toString()}`;
      
      fetch(getUrl)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error ${response.status} (${response.statusText})`);
            return response.text();
        })
        .then(text => {
            try {
                const jsonData = JSON.parse(text);
                if (jsonData && jsonData.success !== undefined) {
                     resolve(jsonData);
                } else {
                    throw new Error(jsonData.message || `Server rapporterte feil (GET for ${dataWithUser.user}).`);
                }
            } catch (e) {
                if (text.toLowerCase().includes("<html")) {
                    throw new Error(`Uventet HTML-svar (GET for ${dataWithUser.user}). Sjekk publisering.`);
                }
                throw new Error(`Uventet svarformat (GET for ${dataWithUser.user}): ${text.substring(0,100)}`);
            }
        })
        .catch(error2 => {
            console.error(`Alle sendingsmetoder feilet for ${dataWithUser.user}:`, error1, error2);
            reject(error2);
        });
    });
  });
}

function testConnection() { /* ... (som før, sendDataToGoogleScript håndterer 'user') ... */ 
  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL === 'DIN_NETTAPP_URL_HER') {
       alert("FEIL: GOOGLE_SCRIPT_URL er ikke satt i script.js!"); return;
  }
  alert(`Tester tilkobling til Google Script for bruker: ${currentUserSuffix}...\nSe konsollen (F12).`);
  sendDataToGoogleScript({ action: 'ping' }, `Tilkobling OK for ${currentUserSuffix}!`) 
      .then(response => {
          console.log("Test Suksess:", response);
           let message = `Tilkobling vellykket for ${currentUserSuffix}!\n\n`;
           message += (response && response.message) ? `Melding: ${response.message}` : "(Ingen detaljert respons)";
           if (response?.timestamp) message += `\nServer tid: ${response.timestamp}`;
           alert(message);
      })
      .catch(error => {
          console.error("Test Tilkoblingsfeil:", error);
          alert(`Tilkoblingstest FEIL for ${currentUserSuffix}:\n\n${error.message}`);
      });
}

