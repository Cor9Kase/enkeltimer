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
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzMeOJzFvbl7CzHhD-45LLxK7Bsdy2d2XdH7XE3R_XkNIedztkLVTcYAWCsblQs3q_N/exec'; // <--- SETT INN DIN URL HER!

// Globale variabler for tilstand
const timers = {};
let activeBox = null;
let customers = [];
let newCustomerTimer = null;
let isAutoRefreshPaused = false;
let isSubmitting = false; // Forhindre doble innsendinger

// Opprett en debounced versjon av submitTime-funksjonen for kommentarmodalen
const debouncedSubmitTime = debounce(submitTime, 500);

// Initialisering når siden er lastet
document.addEventListener('DOMContentLoaded', function() {
  console.log("DOM lastet, initialiserer app");
  updateCurrentDate();
  loadCustomers();
  startAutoRefresh();
  addGlobalEventListeners();

  // Sjekk om URL er satt
   if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL === 'DIN_NETTAPP_URL_HER') {
       alert("ADVARSEL: GOOGLE_SCRIPT_URL er ikke satt i script.js! Appen vil ikke kunne kommunisere med Google Sheets.");
       const statusElement = document.getElementById('last-updated');
       if(statusElement) statusElement.textContent = 'Konfigurasjonsfeil!';
   }
});

// Legg til globale event listeners
function addGlobalEventListeners() {
  console.log("Legger til globale event listeners");

  document.getElementById('submit-comment-btn')?.addEventListener('click', debounced);
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

// Oppdaterer datovisningen i headeren
function updateCurrentDate() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const dateEl = document.getElementById('current-date');
  if(dateEl) dateEl.textContent = now.toLocaleDateString('no-NO', options);
}

// Starter prosessen med å laste kundedata
function loadCustomers() {
  console.log("Initierer lasting av kundedata");
  fetchCustomerData();
}

// Setter opp intervall for automatisk oppdatering
function startAutoRefresh() {
  console.log("Starter auto-refresh (hvert 30. sekund)");
  setInterval(() => {
    // Oppdater kun hvis ingen timer er aktiv og ingen innsending pågår
    const noActiveTimers = !activeBox && !document.getElementById('add-customer-box')?.classList.contains('active');
    if (!isAutoRefreshPaused && !isSubmitting && noActiveTimers) {
      console.log("Auto-refresh: Henter ferske data...");
      fetchCustomerData();
    } else {
       console.log("Auto-refresh: Pauset pga aktiv timer eller innsending.");
    }
  }, 30000); // 30 sekunder
}

// Henter kundedata fra Google Script
function fetchCustomerData() {
  if (isSubmitting) {
      console.log("Henting av data avbrutt, innsending pågår.");
      return;
  }
  console.log("Forsøker å hente kundedata...");
  const statusEl = document.getElementById('last-updated');
  if (statusEl) statusEl.textContent = 'Henter data...';

  fetchCustomersDirect()
    .catch(error => {
      console.warn('Direkte fetch feilet, prøver JSONP:', error);
      return fetchCustomersWithJSONP();
    })
    .catch(error => {
      console.error('Alle tilkoblingsforsøk feilet:', error);
      useMockData(); // Fallback til testdata
      if (statusEl) statusEl.textContent = 'Tilkoblingsfeil';
    });
}

// Henting med direkte fetch
function fetchCustomersDirect() {
  const url = `${GOOGLE_SCRIPT_URL}?action=getCustomers&nocache=${Date.now()}`;
  console.log("Direkte fetch URL:", url);

  return fetch(url)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status} ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => {
      console.log("Mottatt data (direkte fetch):", data);
      if (data && data.success && Array.isArray(data.customers)) {
        processCustomerData(data);
        return data;
      } else {
        throw new Error('Ugyldig responsformat fra Google Script: ' + JSON.stringify(data));
      }
    })
    .catch(error => {
      console.error("Feil under direkte fetch:", error);
      throw error;
    });
}

// Henting med JSONP
function fetchCustomersWithJSONP() {
  console.log("Starter JSONP-forespørsel");
  return new Promise((resolve, reject) => {
    const callbackName = 'googleScriptCallback_' + Date.now();
    const url = `${GOOGLE_SCRIPT_URL}?action=getCustomers&callback=${callbackName}&nocache=${Date.now()}`;
    console.log("JSONP URL:", url);

    let script = null;
    let timeoutId = null;

    const cleanupJsonp = () => {
        clearTimeout(timeoutId);
        if (script && script.parentNode) {
            script.parentNode.removeChild(script);
        }
        delete window[callbackName];
        console.log("JSONP cleanup for", callbackName);
    };

    timeoutId = setTimeout(() => {
      console.error('JSONP request timed out');
      cleanupJsonp();
      reject(new Error('JSONP request timed out after 10 seconds'));
    }, 10000);

    window[callbackName] = function(data) {
      console.log("JSONP callback mottatt data:", data);
      cleanupJsonp();
      if (data && data.success && Array.isArray(data.customers)) {
        processCustomerData(data);
        resolve(data);
      } else {
        reject(new Error('Invalid response format from Google Script via JSONP: ' + JSON.stringify(data)));
      }
    };

    script = document.createElement('script');
    script.src = url;
    script.onerror = function(error) {
      console.error("JSONP script feil:", error);
      cleanupJsonp();
      reject(new Error('JSONP script loading failed'));
    };

    document.body.appendChild(script);
    console.log("JSONP script lagt til i DOM");
  });
}

// Behandler mottatt kundedata
function processCustomerData(data) {
  console.log("Behandler kundedata:", data.customers.length, "kunder funnet.");
  customers = data.customers.sort((a, b) => a.name.localeCompare(b.name, 'no'));
  renderCustomers();

  const statusEl = document.getElementById('last-updated');
  if (statusEl) statusEl.textContent = new Date().toLocaleTimeString('nb-NO');
  console.log("Kundedata behandlet og UI oppdatert.");
}

// Bruker innebygde testdata ved feil
function useMockData() {
  console.warn('Fallback til mock data for testing');
  const mockCustomerData = [
    { name: "Test Kunde A", availableHours: 40.5 },
    { name: "Eksempel B", availableHours: 8.2 },
    { name: "Demo C", availableHours: 1.5 },
    { name: "Annen AS", availableHours: 0 },
  ];

  customers = mockCustomerData.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
  renderCustomers();

  const statusEl = document.getElementById('last-updated');
  if(statusEl) statusEl.textContent = 'Frakoblet modus (testdata)';
  // alert("Kunne ikke koble til Google Sheets. Viser testdata."); // Kan være irriterende
}


// ------- START OPPDATERT renderCustomers med Bar -------
function renderCustomers() {
  console.log("Rendrer kundebokser...");
  const container = document.getElementById('customer-container');
  if (!container) {
    console.error("FEIL: Finner ikke 'customer-container'");
    return;
  }

  const activeCustomerId = activeBox ? activeBox.getAttribute('data-id') : null;
  const addCustomerButton = document.getElementById('add-customer-box');
  if (!addCustomerButton) {
    console.error("FEIL: Finner ikke 'add-customer-box'");
    return;
  }

  // Tøm containeren for eksisterende kundebokser (behold "Legg til")
  const currentBoxes = container.querySelectorAll('.customer-box');
  currentBoxes.forEach(box => container.removeChild(box));


  if (!customers || customers.length === 0) {
    console.log("Ingen kunder å vise.");
    // Optional: Add a message like container.insertAdjacentHTML('beforeend', '<p>Ingen kunder funnet.</p>');
    return;
  }

  customers.forEach((customer, index) => {
    const customerId = index; // Bruk 0-basert index som ID internt
    const availableHours = customer.availableHours; // Hent timer

    const customerBox = document.createElement('div');
    customerBox.className = 'customer-box';
    customerBox.setAttribute('data-id', customerId);

    // --- Lag innhold dynamisk ---

    // 1. Handlingsknapper
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'customer-actions';
    actionsDiv.innerHTML = `
      <button class="customer-action-btn edit-btn" title="Rediger kunde">✏️</button>
      <button class="customer-action-btn delete-btn" title="Slett kunde">🗑️</button>
    `;
    actionsDiv.querySelector('.edit-btn').addEventListener('click', (e) => {
      e.stopPropagation();
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

    // 3. NY Time-bar
    const hoursIndicator = document.createElement('div');
    hoursIndicator.className = 'hours-indicator';
    hoursIndicator.innerHTML = `
        <div class="hours-bar-container">
            <div class="hours-bar-fill"></div>
        </div>
        <span class="hours-remaining-text">0.0 t</span>
    `;
    customerBox.appendChild(hoursIndicator);

    // 4. Timer display
    const timerDiv = document.createElement('div');
    timerDiv.className = 'timer';
    timerDiv.textContent = '00:00:00';
    customerBox.appendChild(timerDiv);

    // 5. Status display
    const statusDiv = document.createElement('div');
    statusDiv.className = 'status';
    statusDiv.textContent = 'Inaktiv';
    customerBox.appendChild(statusDiv);

    // Legg til hoved-klikk listener
    customerBox.addEventListener('click', () => toggleTimer(customerBox));

    // Legg boksen til containeren
    container.appendChild(customerBox);

    // --- Oppdater bar og aktiv status ---
    updateCustomerBar(customerId, availableHours); // Kall for å sette initiell bar-status

    if (activeCustomerId !== null && parseInt(activeCustomerId) === customerId) {
        customerBox.classList.add('active');
        statusDiv.textContent = 'Aktiv';
        statusDiv.style.fontWeight = 'bold';
        statusDiv.style.color = 'var(--active)';

        if (timers[customerId] && timers[customerId].startTime) {
          const elapsedTime = Date.now() - timers[customerId].startTime;
          timerDiv.textContent = formatTime(elapsedTime);
        }
        activeBox = customerBox;
    }
  }); // Slutt på forEach

  console.log("Kundebokser rendret med time-barer.");
}
// ------- SLUTT OPPDATERT renderCustomers -------


// ------- START NY HJELPEFUNKSJON updateCustomerBar -------
/**
 * Oppdaterer time-baren for en spesifikk kunde i UI.
 * @param {number|string} customerId Kundens ID (indeks).
 * @param {number} availableHours Antall tilgjengelige timer.
 */
function updateCustomerBar(customerId, availableHours) {
  const customerBox = document.querySelector(`.customer-box[data-id='${customerId}']`);
  if (!customerBox) return; // Sikkerhetssjekk

  const barFill = customerBox.querySelector('.hours-bar-fill');
  const barText = customerBox.querySelector('.hours-remaining-text');

  if (!barFill || !barText) {
       console.warn(`Kunne ikke finne bar-elementer for kunde ID ${customerId}`);
       return;
  }

  // Definer terskler og maks visuell bredde
  const redThreshold = 3;
  const yellowThreshold = 10;
  const maxVisualHours = 40; // Timer som representerer 100% bredde

  // Korriger for negative timer ved beregning av prosent
  const hoursForPercentage = Math.max(0, availableHours);
  const percentage = Math.min(100, (hoursForPercentage / maxVisualHours) * 100);


  // Bestem fargeklasse basert på faktiske availableHours (kan være negativ)
  let barClass = 'bar-red';
  if (availableHours >= yellowThreshold) {
    barClass = 'bar-green';
  } else if (availableHours >= redThreshold) {
    barClass = 'bar-yellow';
  }

  // Oppdater UI
  barText.textContent = `${availableHours.toFixed(1)} t`; // Vis faktiske timer, inkl. negativ
  barFill.style.width = `${percentage}%`;

  // Sett riktig fargeklasse (fjern gamle først)
  barFill.classList.remove('bar-red', 'bar-yellow', 'bar-green');
  if (availableHours >= redThreshold) { // Vis farge kun hvis >= redThreshold
     barFill.classList.add(barClass);
     barFill.style.backgroundColor = ''; // La CSS-klassen styre fargen
  } else {
       // Hvis under redThreshold (inkludert negativ), bruk rød farge direkte?
       // Eller grå? Vi prøver grå for < 0, rød for 0 til redThreshold
       if(availableHours < 0) {
            barFill.style.backgroundColor = 'var(--inactive)';
       } else {
            barFill.style.backgroundColor = 'var(--bar-red)'; // Bruk rød farge direkte
       }
  }

  // console.log(`Oppdaterte bar for kunde ${customerId}: ${availableHours.toFixed(1)}t, ${percentage.toFixed(0)}%, Klasse/Farge satt`);
}
// ------- SLUTT NY HJELPEFUNKSJON updateCustomerBar -------

// Legg denne et sted i script.js (f.eks. nær andre hjelpefunksjoner)
function isWeekend(date) {
    const day = date.getDay(); // 0 = Søndag, 6 = Lørdag
    return day === 0 || day === 6;
}

// Ny hjelpefunksjon for å få datoen i YYYY-MM-DD format
function getISODateString(date) {
    return date.toISOString().split('T')[0];
}

// Veksler timer for en gitt kundeboks
function toggleTimer(box) {
  if (!box) {
      console.error("toggleTimer kalt med ugyldig 'box'");
      return;
  }
  const customerId = box.getAttribute('data-id');
  if (customerId === null) {
       console.error("toggleTimer kalt på boks uten 'data-id'");
      return;
  }
   // Hent kundeindeks for å få tilgang til data
  const customerIndex = parseInt(customerId);
   if (isNaN(customerIndex) || customerIndex < 0 || customerIndex >= customers.length) {
        console.error(`toggleTimer: Fant ikke kunde med indeks ${customerId}`);
        return;
   }
   const customer = customers[customerIndex];

  const timerDisplay = box.querySelector('.timer');
  const statusDisplay = box.querySelector('.status');

  // Stopper aktiv timer
  if (box.classList.contains('active')) {
    console.log(`Stopper timer for kunde: ${customer.name} (Indeks: ${customerId})`);
    isAutoRefreshPaused = false;

    if (timers[customerId] && timers[customerId].interval) {
      clearInterval(timers[customerId].interval);
    }

    box.classList.remove('active');
    statusDisplay.textContent = 'Inaktiv';
    statusDisplay.style.fontWeight = 'normal';
    statusDisplay.style.color = 'var(--inactive)';

    const endTime = new Date();
    let timeSpentMs = 0;
    if (timers[customerId] && timers[customerId].startTime) {
        timeSpentMs = endTime - timers[customerId].startTime;
    }
    const timeSpentFormatted = formatTime(timeSpentMs);
    timerDisplay.textContent = timeSpentFormatted;

    if (!timers[customerId]) timers[customerId] = {};
    timers[customerId].endTime = endTime;
    timers[customerId].timeSpentMs = timeSpentMs;
    timers[customerId].timeSpentFormatted = timeSpentFormatted;
    timers[customerId].customerName = customer.name; // Viktig for modalen

    showCommentModal(customerId);
    activeBox = null;

  // Starter ny timer
  } else {
    console.log(`Starter timer for kunde: ${customer.name} (Indeks: ${customerId})`);

    if (activeBox) {
      console.log("Stopper tidligere aktiv timer (annen kunde)");
      toggleTimer(activeBox);
    }
    const addCustomerBox = document.getElementById('add-customer-box');
    if (addCustomerBox && addCustomerBox.classList.contains('active')) {
      console.log("Stopper tidligere aktiv timer (ny kunde)");
      stopNewCustomerTimer(false); // Stopp uten å vise modal
    }

    isAutoRefreshPaused = true;

    box.classList.add('active');
    statusDisplay.textContent = 'Aktiv';
    statusDisplay.style.fontWeight = 'bold';
    statusDisplay.style.color = 'var(--active)';
    timerDisplay.textContent = '00:00:00'; // Nullstill ved start

    const startTime = new Date();
    timers[customerId] = {
      startTime: startTime,
      customerName: customer.name,
      interval: setInterval(() => {
        const now = new Date();
        const elapsedTime = now - startTime;
        const currentBox = document.querySelector(`.customer-box[data-id='${customerId}']`);
        if (currentBox && currentBox.classList.contains('active')) {
             currentBox.querySelector('.timer').textContent = formatTime(elapsedTime);
        } else {
            console.warn(`Interval for kunde ${customerId} stoppet (boks ikke aktiv/funnet).`);
             if (timers[customerId] && timers[customerId].interval) {
                 clearInterval(timers[customerId].interval);
             }
        }
      }, 1000)
    };
    activeBox = box;
  }
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
        console.error("FEIL: Mangler elementer i kommentarmodalen!");
        return;
    }

    nameEl.textContent = customerData.customerName;
    timeEl.textContent = `Tid brukt: ${customerData.timeSpentFormatted}`;
    commentEl.value = '';
    modal.style.display = 'block';
    modal.setAttribute('data-current-customer-id', customerId); // Lagre ID
}


// Starter timer for "Legg til ny kunde"
function startNewCustomerTimer() {
    const addCustomerBox = document.getElementById('add-customer-box');
    if (!addCustomerBox) return;

    if (activeBox) {
        console.log("Stopper aktiv kunde-timer før 'ny kunde'-timer startes.");
        toggleTimer(activeBox);
        return;
    }

    if (addCustomerBox.classList.contains('active')) {
        console.log("Stopper 'ny kunde'-timer (klikket igjen).");
        stopNewCustomerTimer(true);
        return;
    }

    console.log("Starter 'ny kunde'-timer.");
    isAutoRefreshPaused = true;
    addCustomerBox.classList.add('active');
    const timerDisplay = document.getElementById('new-customer-timer');
    if(timerDisplay) timerDisplay.textContent = '00:00:00';

    const startTime = new Date();
    newCustomerTimer = {
        startTime: startTime,
        interval: setInterval(() => {
            const now = new Date();
            const elapsedTime = now - startTime;
            const currentAddBox = document.getElementById('add-customer-box');
            const currentTimerDisp = document.getElementById('new-customer-timer');
            if (currentAddBox && currentAddBox.classList.contains('active') && currentTimerDisp) {
                 currentTimerDisp.textContent = formatTime(elapsedTime);
            } else {
                console.warn("Interval for 'ny kunde' stoppet (boks ikke aktiv lenger).");
                if (newCustomerTimer && newCustomerTimer.interval) {
                    clearInterval(newCustomerTimer.interval);
                    // Sett newCustomerTimer til null? Kanskje best å la stopNewCustomerTimer håndtere det.
                }
            }
        }, 1000)
    };
}

// Stopper timer for "Legg til ny kunde"
function stopNewCustomerTimer(showModal = true) {
  if (!newCustomerTimer || !newCustomerTimer.interval) {
      console.log("stopNewCustomerTimer kalt, men ingen aktiv timer funnet.");
      return;
  }
  console.log(`Stopper 'ny kunde'-timer. Skal modal vises? ${showModal}`);
  clearInterval(newCustomerTimer.interval);
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

  if (showModal) {
    const modal = document.getElementById('newCustomerModal');
    const timeSpentEl = document.getElementById('new-customer-time-spent');
    const nameEl = document.getElementById('new-customer-name');
    const hoursEl = document.getElementById('new-customer-hours');
    const commentEl = document.getElementById('new-customer-comment');

    if (!modal || !timeSpentEl || !nameEl || !hoursEl || !commentEl) {
        console.error("FEIL: Mangler elementer i ny-kunde-modalen!");
        // Nullstill timer manuelt her siden modal ikke kan vises
        newCustomerTimer = null;
        if(timerDisp) timerDisp.textContent = '00:00:00';
        return;
    }

    timeSpentEl.textContent = `Tid brukt: ${timeSpentFormatted}`;
    nameEl.value = '';
    hoursEl.value = '';
    commentEl.value = '';
    modal.style.display = 'block';
  } else {
       // Nullstill timeren hvis modal ikke skal vises
       newCustomerTimer = null;
       if(timerDisp) timerDisp.textContent = '00:00:00';
  }
}

// Avbryter opprettelse av ny kunde
function cancelNewCustomer() {
  console.log("Avbryter ny kunde.");
  if (newCustomerTimer) {
     if(newCustomerTimer.interval) clearInterval(newCustomerTimer.interval);
     newCustomerTimer = null; // Nullstill timerdata
     const addBox = document.getElementById('add-customer-box');
     const timerDisp = document.getElementById('new-customer-timer');
     if(addBox) addBox.classList.remove('active');
     if(timerDisp) timerDisp.textContent = '00:00:00';
     isAutoRefreshPaused = false;
  }
  closeModal('newCustomerModal');
}


// Formaterer millisekunder til HH:MM:SS
function formatTime(ms) {
  if (isNaN(ms) || ms < 0) ms = 0;
  let totalSeconds = Math.floor(ms / 1000);
  let hours = Math.floor(totalSeconds / 3600);
  let minutes = Math.floor((totalSeconds % 3600) / 60);
  let seconds = totalSeconds % 60;
  return `${padZero(hours)}:${padZero(minutes)}:${padZero(seconds)}`;
}

// Hjelpefunksjon for formatering
function padZero(num) {
  return num.toString().padStart(2, '0');
}

// Lukker en modal
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
                 delete timers[closedCustomerId]; // Slett midlertidig data
                 console.log(`Slettet midlertidig timerdata for kunde ID ${closedCustomerId}`);
             }
            modal.removeAttribute('data-current-customer-id');
       } else if (modalId === 'newCustomerModal') {
            // Håndter eventuell opprydding hvis cancelNewCustomer ikke ble kalt
            if (newCustomerTimer && !document.getElementById('add-customer-box')?.classList.contains('active')) {
                cancelNewCustomer(); // Kall cancel for å rydde helt opp
            }
       } else if (modalId === 'editCustomerModal') {
            document.getElementById('edit-customer-id').value = ''; // Tøm skjult felt
       } else if (modalId === 'confirmDeleteModal') {
            document.getElementById('delete-customer-id').value = ''; // Tøm skjult felt
       }
   } else {
       console.warn(`Forsøkte å lukke ukjent modal: ${modalId}`);
   }
}

// Konverterer millisekunder til desimaltimer, avrundet til nærmeste kvarter
function calculateHoursFromMs(ms) {
  if (isNaN(ms) || ms <= 0) return 0;
  const rawHours = ms / (1000 * 60 * 60);
  const quarterHours = Math.round(rawHours * 4) / 4;
  return quarterHours;
}

// Sender inn logget tid for en eksisterende kunde
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

  // Data som sendes til backend (forenklet, siden backend kun logger)
  const dataToSend = {
    action: "logTime",
    customerName: customerName,
    timeSpent: decimalHours,
    comment: comment,
    date: new Date().toISOString().split('T')[0]
  };

  // Debugging log (kan fjernes senere)
  console.log("--- DEBUG submitTime --- Data som sendes:", dataToSend);

  // Kall backend (bruk din send-funksjon, f.eks. sendDataToGoogleScript)
  sendDataToGoogleScript(dataToSend, `Tid (${decimalHours}t) registrert for ${customerName}`)
    .then(response => {
      console.log("Tidsregistrering (Backend):", response); // Logg svaret fra backend

      if (response.success) { // Sjekk om backend bekreftet suksess
          try {
              // === KALL FUNKSJONEN FRA gamification.js ===
              // Sjekk om funksjonen finnes globalt før kall
              if (typeof updateStreakAndRank === 'function') {
                  updateStreakAndRank(); // Oppdater streak og rank
              } else {
                   console.error("updateStreakAndRank function not found (expected in gamification.js)");
              }
              // ===========================================
          } catch (e) {
              // Fang opp eventuelle feil under streak/rank oppdatering,
              // men ikke la det stoppe resten av flyten.
              console.error("Feil under oppdatering av streak/rank:", e);
          }
          // Hent ferske kundedata for å oppdatere UI (timebarer etc.)
          // Siden forenklet handleLogTime ikke endrer Kunder-arket,
          // er dette strengt tatt ikke nødvendig for timebalanse,
          // men kan være greit for generell synkronisering.
          console.log("Henter ferske kundedata etter tidslogging...");
          fetchCustomerData();

      } else {
           // Hvis backend rapporterer en feil (response.success er false)
           console.warn("Backend rapporterte feil, oppdaterer ikke streak/rank eller henter data.");
           // Vis feilmeldingen fra backend til brukeren
           alert(`Lagring feilet hos backend: ${response.message || 'Ukjent feil'}`);
      }

      // Lukk modalen KUN hvis kallet til backend var vellykket
      // (eller hvis backend returnerte success: false men vi håndterte det)
      // Hvis kallet kastet en feil (i .catch), forblir modalen åpen.
      closeModal('commentModal');

    })
    .catch(error => {
      // Håndterer nettverksfeil eller andre feil under fetch/backend-kallet
      console.error('Feil ved logging av tid (nettverk/backend):', error);
      alert('Kunne ikke lagre tid: ' + error.message + "\n\nPrøv igjen senere.");
      // Ikke lukk modalen her, slik at brukeren ser feilen og kan prøve igjen.
    })
    .finally(() => {
      // Denne koden kjøres ALLTID etter .then() eller .catch()

      isSubmitting = false; // Tillat nye innsendinger

      // Rydd opp midlertidig timerdata for den aktuelle kunden uansett utfall,
      // siden timeren er stoppet og økten er over.
      if (timers[currentCustomerId]) {
          delete timers[currentCustomerId];
          console.log(`Slettet midlertidig timerdata for kunde ID ${currentCustomerId} etter submit forsøk.`);
      }

      // Tilbakestill knappen
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Lagre og avslutt';
      }

      activeBox = null; // Ingen kundeboks er aktiv lenger
    });
}
// --- SLUTT submitTime ---

// Viser modal for å redigere kunde
function showEditCustomer(customerId) {
    const customerIndex = parseInt(customerId);
     if (isNaN(customerIndex) || customerIndex < 0 || customerIndex >= customers.length) {
        console.error(`Ugyldig kundeindeks for redigering: ${customerId}`);
        return;
     }
    const customer = customers[customerIndex];
    console.log(`Åpner redigeringsmodal for: ${customer.name}`);

    const modal = document.getElementById('editCustomerModal');
    const nameEl = document.getElementById('edit-customer-name');
    const hoursEl = document.getElementById('edit-customer-hours');
    const idEl = document.getElementById('edit-customer-id');

     if (!modal || !nameEl || !hoursEl || !idEl) {
        console.error("FEIL: Mangler elementer i rediger-kunde-modalen!");
        return;
    }

    nameEl.value = customer.name;
    hoursEl.value = customer.availableHours.toFixed(1); // Vis med en desimal
    idEl.value = customerId;

    modal.style.display = 'block';
}

// Sender inn data for å opprette en ny kunde
function createNewCustomer() {
  console.log("Forsøker å opprette ny kunde...");
  if (isSubmitting) {
      console.warn("Innsending pågår, avventer...");
      return;
  }

  const nameEl = document.getElementById('new-customer-name');
  const hoursEl = document.getElementById('new-customer-hours');
  const commentEl = document.getElementById('new-customer-comment');

  if(!nameEl || !hoursEl || !commentEl) {
      console.error("FEIL: Finner ikke skjemaelementer for ny kunde.");
      return;
  }

  const customerName = nameEl.value.trim();
  const availableHoursInput = hoursEl.value;
  const comment = commentEl.value.trim();

  if (!customerName) {
    alert('Kundenavn må fylles ut.');
    return;
  }
   if (customers.some(c => c.name.toLowerCase() === customerName.toLowerCase())) {
     alert('En kunde med dette navnet finnes allerede.');
     return;
   }
  if (!availableHoursInput || isNaN(parseFloat(availableHoursInput)) || parseFloat(availableHoursInput) < 0) {
    alert('Antall tilgjengelige timer må være et gyldig positivt tall.');
    return;
  }
  const initialAvailableHours = parseFloat(availableHoursInput);

  let timeSpentMs = 0;
  let decimalHoursSpent = 0;
  if (newCustomerTimer && newCustomerTimer.timeSpentMs) {
      timeSpentMs = newCustomerTimer.timeSpentMs;
      decimalHoursSpent = calculateHoursFromMs(timeSpentMs);
      console.log(`Registrerer ${decimalHoursSpent} timer brukt under opprettelse.`);
  }

  isSubmitting = true;
  const createButton = document.getElementById('create-customer-btn');
   if (createButton) {
        createButton.disabled = true;
        createButton.textContent = 'Lagrer...';
   }

  const dataToSend = {
    action: "addCustomer",
    customerName: customerName,
    initialAvailableHours: initialAvailableHours,
    timeSpent: decimalHoursSpent,
    comment: comment,
    date: new Date().toISOString().split('T')[0]
  };

  console.log("Sender data for ny kunde:", dataToSend);

  sendDataToGoogleScript(dataToSend, `Ny kunde '${customerName}' opprettet`)
    .then(response => {
      console.log("Ny kunde opprettet vellykket:", response);

      // Backend returnerer den nye kunden med korrekt gjenstående timer
      if(response.customer) {
          customers.push(response.customer);
          customers.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
          renderCustomers(); // Oppdater UI
          // Ikke nødvendig å fetche på nytt umiddelbart
      } else {
          fetchCustomerData(); // Hent alt på nytt hvis backend ikke ga spesifikk kundeinfo
      }

      closeModal('newCustomerModal');
      // alert(`Ny kunde '${customerName}' ble opprettet!`); // Valgfritt

    })
    .catch(error => {
      console.error('Feil ved opprettelse av kunde:', error);
      alert('Kunne ikke opprette kunde: ' + error.message + "\n\nPrøv igjen senere.");
    })
    .finally(() => {
       isSubmitting = false;
       if (createButton) {
            createButton.disabled = false;
            createButton.textContent = 'Lagre kunde og tid';
       }
       // Nullstill newCustomerTimer helt
       if (newCustomerTimer) {
            if(newCustomerTimer.interval) clearInterval(newCustomerTimer.interval);
            newCustomerTimer = null;
            const timerDisp = document.getElementById('new-customer-timer');
            if(timerDisp) timerDisp.textContent = '00:00:00';
            const addBox = document.getElementById('add-customer-box');
            if(addBox) addBox.classList.remove('active');
            console.log("newCustomerTimer nullstilt etter opprettelsesforsøk.");
       }
    });
}

// Sender inn data for å oppdatere en eksisterende kunde
// --- START OPPDATERT updateCustomer ---
function updateCustomer() {
  console.log("Forsøker å oppdatere kunde...");
   if (isSubmitting) {
      console.warn("Innsending pågår, avventer...");
      return;
  }

  const idEl = document.getElementById('edit-customer-id');
  const nameEl = document.getElementById('edit-customer-name');
  const hoursEl = document.getElementById('edit-customer-hours');

   if (!idEl || !nameEl || !hoursEl) {
        console.error("FEIL: Mangler elementer i rediger-kunde-modalen!");
        return;
    }

  const customerId = idEl.value;
  const originalCustomerIndex = parseInt(customerId);

  if (isNaN(originalCustomerIndex) || originalCustomerIndex < 0 || originalCustomerIndex >= customers.length) {
      console.error(`Ugyldig kundeindeks for oppdatering: ${customerId}`);
       alert("Feil: Kunne ikke finne kunden som skal oppdateres.");
      return;
  }

  const originalName = customers[originalCustomerIndex].name;
  const originalHours = customers[originalCustomerIndex].availableHours;
  const newName = nameEl.value.trim();
  const newHoursInput = hoursEl.value;

  if (!newName) {
    alert('Kundenavn må fylles ut.');
    return;
  }
   if (customers.some((c, index) => index !== originalCustomerIndex && c.name.toLowerCase() === newName.toLowerCase())) {
     alert('En annen kunde med dette navnet finnes allerede.');
     return;
   }
  if (newHoursInput === '' || isNaN(parseFloat(newHoursInput))) { // Tillat 0, men ikke tom/ugyldig
    alert('Antall tilgjengelige timer må være et gyldig tall (kan være 0 eller negativt).');
    return;
  }
   const newAvailableHours = parseFloat(newHoursInput);

    if (newName === originalName && newAvailableHours === originalHours) {
        console.log("Ingen endringer å lagre.");
        closeModal('editCustomerModal');
        return;
    }

  isSubmitting = true;
  const updateButton = document.getElementById('update-customer-btn');
  if (updateButton) {
       updateButton.disabled = true;
       updateButton.textContent = 'Lagrer...';
  }

  const dataToSend = {
    action: "updateCustomer",
    originalName: originalName,
    newName: newName,
    newAvailableHours: newAvailableHours
  };

  console.log("Sender kundeoppdatering:", dataToSend);

  sendDataToGoogleScript(dataToSend, `Kunde '${newName}' oppdatert`)
    .then(response => {
      console.log("Kundeoppdatering vellykket:", response);

      // Backend returnerer den oppdaterte kunden
      if(response.customer) {
          // Oppdater lokalt
          customers[originalCustomerIndex].name = response.customer.name;
          customers[originalCustomerIndex].availableHours = response.customer.availableHours;
          // Sorter på nytt hvis navnet KAN ha endret seg (selv om det ikke gjorde det her)
          customers.sort((a, b) => a.name.localeCompare(b.name, 'nb'));

          // Oppdater baren umiddelbart
          updateCustomerBar(originalCustomerIndex, response.customer.availableHours);

          // Full render for å håndtere potensiell sortering og navneendring
          renderCustomers();

      } else {
           fetchCustomerData(); // Hent alt på nytt hvis backend ikke ga spesifikk info
      }

      closeModal('editCustomerModal');
      // alert(`Kunde '${newName}' ble oppdatert.`); // Valgfritt

    })
    .catch(error => {
      console.error('Feil ved oppdatering av kunde:', error);
      alert('Kunne ikke oppdatere kunde: ' + error.message + "\n\nPrøv igjen senere.");
    })
    .finally(() => {
      isSubmitting = false;
       if (updateButton) {
           updateButton.disabled = false;
           updateButton.textContent = 'Lagre endringer';
       }
    });
}
// --- SLUTT OPPDATERT updateCustomer ---


// Viser bekreftelsesmodal før sletting
function confirmDeleteCustomer(customerId) {
     const customerIndex = parseInt(customerId);
     if (isNaN(customerIndex) || customerIndex < 0 || customerIndex >= customers.length) {
        console.error(`Ugyldig kundeindeks for sletting: ${customerId}`);
        return;
     }
    const customer = customers[customerIndex];
    console.log(`Åpner slettebekreftelse for: ${customer.name}`);

    const modal = document.getElementById('confirmDeleteModal');
    const nameEl = document.getElementById('delete-customer-name');
    const idEl = document.getElementById('delete-customer-id');

     if (!modal || !nameEl || !idEl) {
        console.error("FEIL: Mangler elementer i slette-modalen!");
        return;
    }

    nameEl.textContent = customer.name; // Vis navnet
    idEl.value = customerId;

    modal.style.display = 'block';
}

// Sender forespørsel om å slette en kunde
function deleteCustomer() {
   console.log("Forsøker å slette kunde...");
    if (isSubmitting) {
      console.warn("Innsending pågår, avventer...");
      return;
  }

  const idEl = document.getElementById('delete-customer-id');
  if(!idEl) { console.error("FEIL: Finner ikke delete-customer-id element."); return; }

  const customerId = idEl.value;
  const customerIndex = parseInt(customerId);

   if (isNaN(customerIndex) || customerIndex < 0 || customerIndex >= customers.length) {
      console.error(`Ugyldig kundeindeks for sletting: ${customerId}`);
      alert("Feil: Kunne ikke finne kunden som skal slettes.");
      closeModal('confirmDeleteModal');
      return;
  }

  const customerName = customers[customerIndex].name;
  isSubmitting = true;

  const deleteButton = document.getElementById('confirm-delete-btn');
  const cancelButton = document.querySelector('#confirmDeleteModal .cancel-btn');
  if (deleteButton) deleteButton.disabled = true;
  if (cancelButton) cancelButton.disabled = true;


  const dataToSend = {
    action: "deleteCustomer",
    customerName: customerName
  };
  console.log("Sender kundesletting:", dataToSend);

  sendDataToGoogleScript(dataToSend, `Kunde '${customerName}' slettet`)
    .then(response => {
      console.log("Kundesletting vellykket:", response);

      // Fjern lokalt
      customers.splice(customerIndex, 1);
      renderCustomers(); // Oppdater UI

      closeModal('confirmDeleteModal');
      // alert(`Kunde '${customerName}' ble slettet.`); // Valgfritt

    })
    .catch(error => {
      console.error('Feil ved sletting av kunde:', error);
      alert('Kunne ikke slette kunde: ' + error.message + "\n\nPrøv igjen senere.");
    })
    .finally(() => {
      isSubmitting = false;
      if (deleteButton) deleteButton.disabled = false;
      if (cancelButton) cancelButton.disabled = false;
      // Tøm ID-feltet uansett
      idEl.value = '';
    });
}


// Robust sending til Google Apps Script
function sendDataToGoogleScript(data, successMessage) {
  console.log("sendDataToGoogleScript kalt med data:", data);
  let statusMessage = null;

  function showStatus(message, isError = false) { /* ... (som før) ... */ }
  function hideStatus() { /* ... (som før) ... */ }

  return new Promise((resolve, reject) => {
    // Vis status (kan kommenteres ut hvis irriterende)
    // showStatus("Sender data...");

    const formData = new FormData();
    for (const key in data) {
      formData.append(key, data[key]);
    }

    // --- 1. Forsøk: POST med 'no-cors' ---
    console.log("Metode 1: Forsøker POST (no-cors)");
    fetch(GOOGLE_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: formData })
    .then(response => {
      console.log("POST (no-cors) fullført (antar suksess).");
      hideStatus();
      // VIKTIG: Siden vi ikke får svar, kan vi ikke returnere spesifikk data fra backend her.
      // Vi må stole på at backend gjorde det den skulle.
      resolve({ success: true, message: successMessage || "Handlingen ble utført (POST)." });
    })
    .catch(error => {
      console.warn("POST (no-cors) feilet:", error, "- Prøver GET.");
      tryGetMethod();
    });

    // --- 2. Forsøk: GET med parametere ---
    function tryGetMethod() {
        // showStatus("Sender data (Metode 2)...");
        const params = new URLSearchParams();
        for (const key in data) { params.append(key, data[key]); }
        params.append('nocache', Date.now()); // Legg til nocache for GET
        const getUrl = `${GOOGLE_SCRIPT_URL}?${params.toString()}`;
        console.log("Metode 2: Forsøker GET:", getUrl.substring(0, 200) + "...");

        fetch(getUrl)
            .then(response => {
                console.log("GET respons status:", response.status);
                if (!response.ok) throw new Error(`HTTP error ${response.status} (${response.statusText})`);
                return response.text();
            })
            .then(text => {
                 console.log("GET respons tekst:", text);
                try {
                    const jsonData = JSON.parse(text);
                    if (jsonData && jsonData.success !== undefined) { // Sjekk at success er definert
                         console.log("GET vellykket med JSON-svar:", jsonData);
                         hideStatus();
                         resolve(jsonData); // Bruk svaret fra serveren (kan inneholde data)
                    } else {
                        throw new Error(jsonData.message || "Server rapporterte feil eller ukjent format (GET).");
                    }
                } catch (e) {
                    console.warn("Kunne ikke parse GET-svar som JSON:", e);
                    throw new Error("Uventet svarformat fra server (GET).");
                }
            })
            .catch(error => {
                console.warn("GET feilet:", error, "- Prøver iframe POST.");
                tryIframeMethod();
            });
    }

    // --- 3. Forsøk: Skjult iframe med POST ---
    function tryIframeMethod() {
        // showStatus("Sender data (Metode 3)...");
        const iframeId = 'hidden-comm-iframe-' + Date.now();
        const formId = 'hidden-comm-form-' + Date.now();
        console.log("Metode 3: Forsøker iframe POST");

        let iframe = document.getElementById(iframeId);
        if (iframe) iframe.parentNode.removeChild(iframe);

        iframe = document.createElement('iframe');
        iframe.id = iframeId; iframe.name = iframeId; iframe.style.display = 'none';
        document.body.appendChild(iframe);

        let form = document.getElementById(formId);
        if (form) form.parentNode.removeChild(form);

        form = document.createElement('form');
        form.id = formId; form.method = 'POST'; form.action = GOOGLE_SCRIPT_URL; form.target = iframeId;
        for (const key in data) {
            const input = document.createElement('input');
            input.type = 'hidden'; input.name = key; input.value = data[key];
            form.appendChild(input);
        }
        document.body.appendChild(form);

        let cleanupPerformed = false;
        const cleanup = () => {
            if (cleanupPerformed) return;
            cleanupPerformed = true;
            clearTimeout(timeoutId);
            if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
            if (form && form.parentNode) form.parentNode.removeChild(form);
            console.log("iframe/form ryddet opp.");
        };

        const timeoutId = setTimeout(() => {
            console.error("Iframe POST timed out.");
            cleanup();
            // showStatus("Tidsavbrudd. Handlingen kan ha feilet.", true); // Valgfri brukerfeedback
            reject(new Error('Forespørselen via iframe tok for lang tid.'));
        }, 20000);

        iframe.onload = () => {
             console.log("Iframe 'load' event mottatt (antar suksess).");
             cleanup();
             hideStatus();
             // Returner bare generell suksess, vi får ikke data tilbake
             resolve({ success: true, message: successMessage || "Handlingen ble utført (iframe)." });
        };
        iframe.onerror = (err) => {
            console.error("Iframe 'error' event mottatt:", err);
            cleanup();
            // showStatus("Feil under sending (Metode 3).", true); // Valgfri
            reject(new Error('Kommunikasjonsfeil via iframe.'));
        };

        console.log("Sender skjult form til iframe...");
        form.submit();
    }
  }); // End Promise
} // End sendDataToGoogleScript


// Testfunksjon for tilkobling
function testConnection() {
  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL === 'DIN_NETTAPP_URL_HER') {
       alert("FEIL: GOOGLE_SCRIPT_URL er ikke satt i script.js!");
       return;
  }
  const url = GOOGLE_SCRIPT_URL + '?action=ping';
  console.log("Tester URL:", url);
  alert("Tester tilkobling til Google Script...\nSe konsollen (F12) for detaljer.");

  sendDataToGoogleScript({ action: 'ping' }, "Tilkobling OK!")
      .then(response => {
          console.log("Test Suksess:", response);
           let message = "Tilkobling vellykket!\n\n";
           if (response && response.message) {
               message += "Melding fra server: " + response.message;
               if (response.timestamp) {
                   message += "\nServer tid: " + response.timestamp;
               }
           } else {
               message += "(Ingen detaljert respons mottatt, men kallet ser ut til å ha gått gjennom)";
           }
           alert(message);
      })
      .catch(error => {
          console.error("Test Tilkoblingsfeil:", error);
          alert("Tilkoblingstest FEIL:\n\n" + error.message + "\n\nSjekk konsollen (F12) og verifiser URL/publisering.");
      });
}
