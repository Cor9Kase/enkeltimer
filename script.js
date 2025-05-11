// script.js (Oppdatert for brukerbytte)

// Debounce-funksjon
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

// Google Script URL
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxmaYK_wr1ObTzqfqEAQSxcGlX_axiKJpLkcU-4CY89fe5Ahaxjz_UP8drygvOpqyvn/exec'; // <--- SJEKK DENNE!

// Globale variabler
const timers = {};
let activeBox = null;
let customers = [];
let newCustomerTimer = null;
let isAutoRefreshPaused = false;
let isSubmitting = false;
let debouncedSubmitTime;

// Initialisering
document.addEventListener('DOMContentLoaded', function() {
  console.log("DOM lastet, initialiserer app (script.js)");

  if (typeof submitTime === 'function' && typeof debounce === 'function') {
       debouncedSubmitTime = debounce(submitTime, 500);
  } else {
       console.error("FEIL: Kunne ikke definere debouncedSubmitTime.");
       debouncedSubmitTime = submitTime; // Fallback
  }

  updateCurrentDate();
  // loadCustomers vil bli kalt av theme.js etter at currentUserSuffix er satt,
  // eller her hvis theme.js ikke er fullt lastet/initialisert enda (mindre sannsynlig med riktig rekkefølge).
  // For sikkerhets skyld, og for å håndtere første lasting før theme.js kanskje bytter bruker:
  if (typeof currentUserSuffix !== 'undefined') { // currentUserSuffix er global fra theme.js
    loadCustomers();
  } else {
    console.warn("currentUserSuffix ikke definert ved DOMContentLoaded i script.js. Venter på theme.js eller laster med default.");
    // Vurder en liten timeout eller la theme.js alltid kalle loadCustomers etter init.
    // For nå, la oss anta at theme.js sin DOMContentLoaded kjører og setter opp bruker før dette blir kritisk.
    // Hvis ikke, vil loadCustomers() nedenfor feile eller bruke feil bruker.
    // En bedre løsning er at theme.js eksplisitt kaller loadCustomers() etter bruker er satt.
  }

  startAutoRefresh();
  addGlobalEventListeners();

  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL === 'DIN_NETTAPP_URL_HER' || GOOGLE_SCRIPT_URL.includes('SETT_INN_DIN_URL')) {
       alert("ADVARSEL: GOOGLE_SCRIPT_URL er ikke satt i script.js!");
       const statusElement = document.getElementById('last-updated');
       if(statusElement) statusElement.textContent = 'Konfigurasjonsfeil!';
   }
});

function addGlobalEventListeners() {
  if (typeof debouncedSubmitTime === 'function') {
      document.getElementById('submit-comment-btn')?.addEventListener('click', debouncedSubmitTime);
  }
  document.getElementById('create-customer-btn')?.addEventListener('click', createNewCustomer);
  document.getElementById('update-customer-btn')?.addEventListener('click', updateCustomer);
  document.getElementById('confirm-delete-btn')?.addEventListener('click', deleteCustomer);
  document.querySelectorAll('.modal .close').forEach(btn => {
    btn.addEventListener('click', function() { closeModal(this.closest('.modal').id); });
  });
  document.querySelectorAll('.modal .cancel-btn').forEach(btn => {
    btn.addEventListener('click', function() { closeModal(this.closest('.modal').id); });
  });
  document.getElementById('refresh-button')?.addEventListener('click', loadCustomers); // Endret til loadCustomers
  // document.getElementById('test-connection-button')?.addEventListener('click', testConnection); // Kommentert ut hvis ikke i HTML

  window.addEventListener('click', function(event) {
      document.querySelectorAll('.modal').forEach(modal => {
          if (modal.style.display === 'block' && event.target === modal) {
              closeModal(modal.id);
          }
      });
  });
}

function updateCurrentDate() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const dateEl = document.getElementById('current-date');
  if(dateEl) dateEl.textContent = now.toLocaleDateString('no-NO', options);
}

// Global funksjon som kan kalles fra theme.js
function loadCustomers() {
  console.log(`Initierer lasting av kundedata for bruker: ${currentUserSuffix}`);
  if (typeof currentUserSuffix === 'undefined') {
    console.error("loadCustomers kalt før currentUserSuffix er definert. Prøver å hente fra localStorage.");
    // Dette er en fallback, theme.js bør ha satt currentUserSuffix globalt.
    // eslint-disable-next-line no-global-assign
    currentUserSuffix = localStorage.getItem('currentUserSuffix') || 'C';
  }
  fetchCustomerData();
}

function startAutoRefresh() {
  setInterval(() => {
    const noActiveTimers = !activeBox && !document.getElementById('add-customer-box')?.classList.contains('active');
    if (!isAutoRefreshPaused && !isSubmitting && noActiveTimers) {
      console.log(`Auto-refresh: Henter ferske data for bruker: ${currentUserSuffix}...`);
      fetchCustomerData();
    }
  }, 30000);
}

function fetchCustomerData() {
  if (isSubmitting) return;
  console.log(`Forsøker å hente kundedata for bruker: ${currentUserSuffix}...`);
  const statusEl = document.getElementById('last-updated');
  if (statusEl) statusEl.textContent = 'Henter data...';

  // Bruk currentUserSuffix som er globalt definert i theme.js
  if (typeof currentUserSuffix === 'undefined') {
     console.error("currentUserSuffix er ikke definert i fetchCustomerData. Kan ikke fortsette.");
     if (statusEl) statusEl.textContent = 'Brukerfeil!';
     // eslint-disable-next-line no-global-assign
     currentUserSuffix = localStorage.getItem('currentUserSuffix') || 'C'; // Fallback
     // return; // Vurder å stoppe her hvis kritisk
  }

  fetchCustomersDirect()
    .catch(error => {
      console.warn(`Direkte fetch feilet for bruker ${currentUserSuffix}, prøver JSONP:`, error);
      return fetchCustomersWithJSONP();
    })
    .catch(error => {
      console.error(`Alle tilkoblingsforsøk feilet for bruker ${currentUserSuffix}:`, error);
      useMockData();
      if (statusEl) statusEl.textContent = 'Tilkoblingsfeil';
    });
}

function fetchCustomersDirect() {
  // currentUserSuffix er global fra theme.js
  const url = `${GOOGLE_SCRIPT_URL}?action=getCustomers&user=${currentUserSuffix}&nocache=${Date.now()}`;
  console.log(`Direkte fetch URL for ${currentUserSuffix}:`, url);
  return fetch(url)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      return response.json();
    })
    .then(data => {
      if (data && data.success && Array.isArray(data.customers)) {
        processCustomerData(data);
        return data;
      }
      throw new Error('Ugyldig responsformat (direkte fetch): ' + JSON.stringify(data));
    })
    .catch(error => {
      console.error("Feil under direkte fetch:", error);
      throw error;
    });
}

function fetchCustomersWithJSONP() {
  // currentUserSuffix er global fra theme.js
  return new Promise((resolve, reject) => {
    const callbackName = `googleScriptCallback_${currentUserSuffix}_${Date.now()}`;
    const url = `${GOOGLE_SCRIPT_URL}?action=getCustomers&user=${currentUserSuffix}&callback=${callbackName}&nocache=${Date.now()}`;
    console.log(`JSONP URL for ${currentUserSuffix}:`, url);
    let script = null;
    let timeoutId = null;
    const cleanupJsonp = () => {
        clearTimeout(timeoutId);
        if (script && script.parentNode) script.parentNode.removeChild(script);
        delete window[callbackName];
    };
    timeoutId = setTimeout(() => {
      cleanupJsonp();
      reject(new Error('JSONP request timed out'));
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

function processCustomerData(data) {
  console.log(`Behandler kundedata for ${currentUserSuffix}:`, data.customers.length, "kunder funnet.");
  customers = data.customers.sort((a, b) => a.name.localeCompare(b.name, 'no'));
  renderCustomers();
  const statusEl = document.getElementById('last-updated');
  if (statusEl) statusEl.textContent = new Date().toLocaleTimeString('nb-NO');
}

function useMockData() {
  console.warn(`Fallback til mock data for testing (bruker: ${currentUserSuffix})`);
  // MERK: Denne mock-dataen er ikke brukerspesifikk.
  // Hvis du trenger ulik mock-data for C og W, må du legge til logikk her.
  const mockCustomerData = [
    { name: "Test Kunde A (Mock)", availableHours: 40.5 },
    { name: "Eksempel B (Mock)", availableHours: 8.2 },
    { name: "William (Mock)", availableHours: 10.0 }, // La til William her også
    { name: "Cornelius (Mock)", availableHours: 20.0 }
  ];
  customers = mockCustomerData.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
  renderCustomers();
  const statusEl = document.getElementById('last-updated');
  if(statusEl) statusEl.textContent = 'Frakoblet modus (testdata)';
}

function renderCustomers() {
  console.log(`Rendrer kundebokser for ${currentUserSuffix}...`);
  const container = document.getElementById('customer-container');
  if (!container) return;
  const activeCustomerId = activeBox ? activeBox.getAttribute('data-id') : null;
  const addCustomerButton = document.getElementById('add-customer-box');
  if (!addCustomerButton) return;

  container.querySelectorAll('.customer-box').forEach(box => container.removeChild(box));

  if (!customers || customers.length === 0) {
    container.insertAdjacentHTML('beforeend', `<p style="color: var(--text-secondary); width: 100%; text-align: center;">Ingen kunder funnet for ${currentUserSuffix === 'C' ? 'Cornelius' : 'William'}.</p>`);
    return;
  }

  customers.forEach((customer, index) => {
    const customerId = index;
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
        <div class="hours-bar-container"><div class="hours-bar-fill"></div></div>
        <span class="hours-remaining-text">0.0 t</span>`;
    customerBox.appendChild(hoursIndicator);
    const timerDiv = document.createElement('div');
    timerDiv.className = 'timer';
    timerDiv.textContent = '00:00:00';
    customerBox.appendChild(timerDiv);
    const statusDiv = document.createElement('div');
    statusDiv.className = 'status';
    statusDiv.textContent = 'Inaktiv';
    customerBox.appendChild(statusDiv);
    customerBox.addEventListener('click', () => toggleTimer(customerBox));
    container.appendChild(customerBox);
    updateCustomerBar(customerId, customer.availableHours);
    if (activeCustomerId !== null && parseInt(activeCustomerId) === customerId) {
        customerBox.classList.add('active');
        statusDiv.textContent = 'Aktiv';
        statusDiv.style.fontWeight = 'bold';
        statusDiv.style.color = 'var(--active)';
        if (timers[customerId] && timers[customerId].startTime) {
          timerDiv.textContent = formatTime(Date.now() - timers[customerId].startTime);
        }
        activeBox = customerBox;
    }
  });
}

function updateCustomerBar(customerId, availableHours) {
  const customerBox = document.querySelector(`.customer-box[data-id='${customerId}']`);
  if (!customerBox) return;
  const barFill = customerBox.querySelector('.hours-bar-fill');
  const barText = customerBox.querySelector('.hours-remaining-text');
  if (!barFill || !barText) return;
  const redThreshold = 3;
  const yellowThreshold = 10;
  const maxVisualHours = 40;
  const hoursForPercentage = Math.max(0, availableHours);
  const percentage = Math.min(100, (hoursForPercentage / maxVisualHours) * 100);
  let barClass = 'bar-red';
  if (availableHours >= yellowThreshold) barClass = 'bar-green';
  else if (availableHours >= redThreshold) barClass = 'bar-yellow';
  barText.textContent = `${availableHours.toFixed(1)} t`;
  barFill.style.width = `${percentage}%`;
  barFill.classList.remove('bar-red', 'bar-yellow', 'bar-green');
  if (availableHours >= redThreshold) {
     barFill.classList.add(barClass);
     barFill.style.backgroundColor = '';
  } else {
     barFill.style.backgroundColor = (availableHours < 0) ? 'var(--inactive)' : 'var(--bar-red)';
  }
}

function isWeekend(date) { return date.getDay() === 0 || date.getDay() === 6; }
function getISODateString(date) { return date.toISOString().split('T')[0]; }

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
    timers[customerId] = { ...timers[customerId], endTime, timeSpentMs, timeSpentFormatted: formatTime(timeSpentMs), customerName: customer.name };
    timerDisplay.textContent = timers[customerId].timeSpentFormatted;
    showCommentModal(customerId);
    activeBox = null;
  } else { // Starter timer
    if (activeBox) toggleTimer(activeBox);
    const addCustomerBox = document.getElementById('add-customer-box');
    if (addCustomerBox?.classList.contains('active')) stopNewCustomerTimer(false);
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
        const currentBox = document.querySelector(`.customer-box[data-id='${customerId}'].active .timer`);
        if (currentBox) currentBox.textContent = formatTime(Date.now() - startTime);
        else clearInterval(timers[customerId]?.interval);
      }, 1000)
    };
    activeBox = box;
  }
}

function showCommentModal(customerId) {
    const customerData = timers[customerId];
    if (!customerData) return;
    const modal = document.getElementById('commentModal');
    const nameEl = document.getElementById('modal-customer-name');
    const timeEl = document.getElementById('modal-time-spent');
    const commentEl = document.getElementById('comment-text');
    if (!modal || !nameEl || !timeEl || !commentEl) return;
    nameEl.textContent = customerData.customerName;
    timeEl.textContent = `Tid brukt: ${customerData.timeSpentFormatted}`;
    commentEl.value = '';
    modal.style.display = 'block';
    modal.setAttribute('data-current-customer-id', customerId);
}

function startNewCustomerTimer() {
    const addCustomerBox = document.getElementById('add-customer-box');
    if (!addCustomerBox) return;
    if (activeBox) { toggleTimer(activeBox); return; }
    if (addCustomerBox.classList.contains('active')) { stopNewCustomerTimer(true); return; }
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

function stopNewCustomerTimer(showModal = true) {
  if (!newCustomerTimer?.interval) return;
  clearInterval(newCustomerTimer.interval);
  isAutoRefreshPaused = false;
  document.getElementById('add-customer-box')?.classList.remove('active');
  const timeSpentMs = Date.now() - newCustomerTimer.startTime;
  newCustomerTimer = { ...newCustomerTimer, endTime: new Date(), timeSpentMs, timeSpentFormatted: formatTime(timeSpentMs) };
  const timerDisp = document.getElementById('new-customer-timer');
  if(timerDisp) timerDisp.textContent = newCustomerTimer.timeSpentFormatted;

  if (showModal) {
    const modal = document.getElementById('newCustomerModal');
    const timeSpentEl = document.getElementById('new-customer-time-spent');
    if (modal && timeSpentEl) {
        timeSpentEl.textContent = `Tid brukt: ${newCustomerTimer.timeSpentFormatted}`;
        ['new-customer-name', 'new-customer-hours', 'new-customer-comment'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        modal.style.display = 'block';
    }
  } else {
       newCustomerTimer = null; // Nullstill hvis modal ikke vises
       if(timerDisp) timerDisp.textContent = '00:00:00';
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
            document.getElementById('comment-text')?.value === '';
            const closedCustomerId = modal.getAttribute('data-current-customer-id');
            if (closedCustomerId && timers[closedCustomerId]) delete timers[closedCustomerId];
            modal.removeAttribute('data-current-customer-id');
       } else if (modalId === 'newCustomerModal' && newCustomerTimer && !document.getElementById('add-customer-box')?.classList.contains('active')) {
            cancelNewCustomer();
       } else if (modalId === 'editCustomerModal') {
            document.getElementById('edit-customer-id').value = '';
       } else if (modalId === 'confirmDeleteModal') {
            document.getElementById('delete-customer-id').value = '';
       }
   }
}

function calculateHoursFromMs(ms) {
  if (isNaN(ms) || ms <= 0) return 0;
  return Math.round((ms / (1000 * 60 * 60)) * 4) / 4;
}

function submitTime() {
  if (isSubmitting) return;
  isSubmitting = true;
  const modal = document.getElementById('commentModal');
  const currentCustomerId = modal?.getAttribute('data-current-customer-id');
  if (currentCustomerId === null || currentCustomerId === undefined) {
       isSubmitting = false; return;
  }
  const timerData = timers[currentCustomerId];
  if (!timerData) {
       isSubmitting = false; return;
  }
  const comment = document.getElementById('comment-text')?.value.trim() || "";
  const customerName = timerData.customerName;
  const decimalHours = calculateHoursFromMs(timerData.timeSpentMs);
  const dataToSend = {
    action: "logTime",
    customerName: customerName,
    timeSpent: decimalHours,
    comment: comment,
    date: getISODateString(new Date()) // Bruker getISODateString
    // user: currentUserSuffix vil bli lagt til av sendDataToGoogleScript
  };
  const submitButton = document.getElementById('submit-comment-btn');
  if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Sender...'; }

  sendDataToGoogleScript(dataToSend, `Tid (${decimalHours}t) registrert for ${customerName}`)
    .then(response => {
      if (response.success) {
          if (typeof updateStreakAndRank === 'function') updateStreakAndRank();
          loadCustomers(); // Oppdater kundelisten (og dermed barene)
      } else {
           alert(`Lagring feilet hos backend: ${response.message || 'Ukjent feil'}`);
      }
      closeModal('commentModal');
    })
    .catch(error => {
      alert('Kunne ikke lagre tid: ' + error.message);
    })
    .finally(() => {
      isSubmitting = false;
      if (timers[currentCustomerId]) delete timers[currentCustomerId];
      if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Lagre og avslutt'; }
      activeBox = null;
    });
}

function showEditCustomer(customerId) {
    const customerIndex = parseInt(customerId);
    if (isNaN(customerIndex) || customerIndex < 0 || customerIndex >= customers.length) return;
    const customer = customers[customerIndex];
    const modal = document.getElementById('editCustomerModal');
    const nameEl = document.getElementById('edit-customer-name');
    const hoursEl = document.getElementById('edit-customer-hours');
    const idEl = document.getElementById('edit-customer-id');
    if (!modal || !nameEl || !hoursEl || !idEl) return;
    nameEl.value = customer.name;
    hoursEl.value = customer.availableHours.toFixed(1);
    idEl.value = customerId;
    modal.style.display = 'block';
}

function createNewCustomer() {
  if (isSubmitting) return;
  const nameEl = document.getElementById('new-customer-name');
  const hoursEl = document.getElementById('new-customer-hours');
  const commentEl = document.getElementById('new-customer-comment');
  if(!nameEl || !hoursEl || !commentEl) return;
  const customerName = nameEl.value.trim();
  const availableHoursInput = hoursEl.value;
  const comment = commentEl.value.trim();
  if (!customerName) { alert('Kundenavn må fylles ut.'); return; }
  if (customers.some(c => c.name.toLowerCase() === customerName.toLowerCase())) {
     alert('En kunde med dette navnet finnes allerede.'); return;
  }
  if (!availableHoursInput || isNaN(parseFloat(availableHoursInput)) || parseFloat(availableHoursInput) < 0) {
    alert('Timer må være et gyldig positivt tall.'); return;
  }
  const initialAvailableHours = parseFloat(availableHoursInput);
  const decimalHoursSpent = newCustomerTimer?.timeSpentMs ? calculateHoursFromMs(newCustomerTimer.timeSpentMs) : 0;
  isSubmitting = true;
  const createButton = document.getElementById('create-customer-btn');
  if (createButton) { createButton.disabled = true; createButton.textContent = 'Lagrer...'; }
  const dataToSend = {
    action: "addCustomer",
    customerName, initialAvailableHours, timeSpent: decimalHoursSpent, comment,
    date: getISODateString(new Date()) // Bruker getISODateString
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

function updateCustomer() {
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
  const dataToSend = { action: "updateCustomer", originalName, newName, newAvailableHours };
  sendDataToGoogleScript(dataToSend, `Kunde '${newName}' oppdatert`)
    .then(response => {
      if(response.customer) {
          customers[originalCustomerIndex].name = response.customer.name;
          customers[originalCustomerIndex].availableHours = response.customer.availableHours;
          customers.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
          renderCustomers(); // For å reflektere endringer og sortering
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

function confirmDeleteCustomer(customerId) {
    const customerIndex = parseInt(customerId);
    if (isNaN(customerIndex) || customerIndex < 0 || customerIndex >= customers.length) return;
    const customer = customers[customerIndex];
    const modal = document.getElementById('confirmDeleteModal');
    const nameEl = document.getElementById('delete-customer-name');
    const idEl = document.getElementById('delete-customer-id');
    if (!modal || !nameEl || !idEl) return;
    nameEl.textContent = customer.name;
    idEl.value = customerId;
    modal.style.display = 'block';
}

function deleteCustomer() {
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
  const dataToSend = { action: "deleteCustomer", customerName };
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
      idEl.value = '';
    });
}

// Robust sending til Google Apps Script
// Denne funksjonen vil nå automatisk legge til 'user' parameteren.
function sendDataToGoogleScript(data, successMessage) {
  console.log("sendDataToGoogleScript kalt med data:", data, `for bruker: ${currentUserSuffix}`);
  // Legg til brukeridentifikator i data som sendes
  const dataWithUser = { ...data, user: currentUserSuffix };

  return new Promise((resolve, reject) => {
    const formData = new FormData();
    for (const key in dataWithUser) { // Bruk dataWithUser her
      formData.append(key, dataWithUser[key]);
    }

    // Metode 1: POST (no-cors) - foretrukket for enkelhet hvis serveren er satt opp for det
    fetch(GOOGLE_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: formData })
    .then(() => { // Siden 'no-cors' ikke gir detaljert respons, antar vi suksess
      console.log(`POST (no-cors) for ${currentUserSuffix} fullført (antar suksess).`);
      resolve({ success: true, message: successMessage || `Handlingen ble utført for ${currentUserSuffix} (POST).` });
    })
    .catch(error1 => {
      console.warn(`POST (no-cors) for ${currentUserSuffix} feilet:`, error1, "- Prøver GET.");
      // Metode 2: GET med parametere (fallback)
      const params = new URLSearchParams();
      for (const key in dataWithUser) { params.append(key, dataWithUser[key]); } // Bruk dataWithUser
      params.append('nocache', Date.now());
      const getUrl = `${GOOGLE_SCRIPT_URL}?${params.toString()}`;
      console.log(`Metode 2 GET for ${currentUserSuffix}:`, getUrl.substring(0, 200) + "...");

      fetch(getUrl)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error ${response.status} (${response.statusText})`);
            return response.text(); // Prøv alltid å få tekst først for bedre feilsøking
        })
        .then(text => {
            try {
                const jsonData = JSON.parse(text);
                if (jsonData && jsonData.success !== undefined) {
                     console.log(`GET for ${currentUserSuffix} vellykket med JSON:`, jsonData);
                     resolve(jsonData);
                } else {
                    throw new Error(jsonData.message || `Server rapporterte feil (GET for ${currentUserSuffix}).`);
                }
            } catch (e) { // Hvis parsing feiler, er teksten sannsynligvis en feilmelding
                console.warn(`Kunne ikke parse GET-svar som JSON for ${currentUserSuffix}:`, text, e);
                // Hvis teksten ser ut som en HTML-feilside fra Google, gi en mer generell feil.
                if (text.toLowerCase().includes("<html") || text.toLowerCase().includes("<!doctype html")) {
                    throw new Error(`Uventet HTML-svar fra server (GET for ${currentUserSuffix}). Sjekk publiseringsinnstillinger for scriptet.`);
                }
                throw new Error(`Uventet svarformat fra server (GET for ${currentUserSuffix}): ${text.substring(0,100)}`);
            }
        })
        .catch(error2 => {
            console.error(`Alle sendingsmetoder feilet for ${currentUserSuffix}:`, error1, error2);
            reject(error2); // Avvis med den siste feilen
        });
    });
  });
}

// Testfunksjon for tilkobling
function testConnection() {
  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL === 'DIN_NETTAPP_URL_HER') {
       alert("FEIL: GOOGLE_SCRIPT_URL er ikke satt i script.js!"); return;
  }
  // Bruk currentUserSuffix som er global fra theme.js
  alert(`Tester tilkobling til Google Script for bruker: ${currentUserSuffix}...\nSe konsollen (F12).`);
  sendDataToGoogleScript({ action: 'ping' }, `Tilkobling OK for ${currentUserSuffix}!`) // sendDataToGoogleScript legger til user
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
