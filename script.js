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
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxpfYJg1haeFXvPxGbZaKB_9VEizTelyA5Qb5lW0knZEhiU5FQENxX0i0oc3jZEb_V9/exec'; // <--- SETT INN DIN URL HER!

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

// Oppdaterer datovisningen i headeren
function updateCurrentDate() {
  try {
      const now = new Date();
      const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      const dateEl = document.getElementById('current-date');
      if(dateEl) {
          dateEl.textContent = now.toLocaleDateString('no-NO', options);
          console.log("Dato oppdatert i header.");
      } else {
          console.error("FEIL: Fant IKKE element med ID 'current-date' for dato-oppdatering!");
      }
  } catch (error) {
       console.error("Feil i updateCurrentDate:", error);
       const dateEl = document.getElementById('current-date');
       if(dateEl) dateEl.textContent = "Feil ved lasting av dato";
  }
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

function showCommentModal(customerId) {
    const timerData = timers[customerId];
    if (!timerData?.customerName) { /* ... (feilsjekk som før) ... */ return; }
    console.log(`Viser kommentarmodal for: ${timerData.customerName}, Tid: ${timerData.timeSpentFormatted}`);

    const modal = document.getElementById('commentModal');
    const nameEl = document.getElementById('modal-customer-name');
    const timeEl = document.getElementById('modal-time-spent');
    const commentEl = document.getElementById('comment-text');
    // --- Hent elementer for oppgavevalg ---
    const taskSelectGroup = document.querySelector('#commentModal .task-link-group');
    const taskCheckboxList = document.getElementById('task-checkbox-list'); // NY ID
    const taskStatusUpdateOptions = document.getElementById('task-status-update-options'); // NY ID
    const updateTaskStatusSelect = document.getElementById('update-task-status-select'); // NY ID

    if (!modal || !nameEl || !timeEl || !commentEl || !taskSelectGroup || !taskCheckboxList || !taskStatusUpdateOptions || !updateTaskStatusSelect) {
        console.error("FEIL: Mangler elementer i kommentarmodalen (inkl. oppgave-checkboxes/status)!");
        return;
    }

    nameEl.textContent = timerData.customerName;
    timeEl.textContent = `Tid brukt: ${timerData.timeSpentFormatted}`;
    commentEl.value = '';
    modal.setAttribute('data-current-customer-id', customerId);

    // Nullstill og skjul oppgave-seksjonen
    taskCheckboxList.innerHTML = '<span style="color: var(--text-secondary); font-style: italic;">Laster oppgaver...</span>';
    taskSelectGroup.style.display = 'none';
    taskStatusUpdateOptions.style.display = 'none';
    updateTaskStatusSelect.value = ""; // Nullstill statusvalg

    // Kall backend for å hente åpne oppgaver
    sendDataToGoogleScript({ action: 'getTasks', customer: timerData.customerName, status: 'open' }, "Hentet oppgaver")
        .then(taskData => {
            taskCheckboxList.innerHTML = ''; // Tøm lasteindikator
            if (taskData.success && taskData.tasks && taskData.tasks.length > 0) {
                taskData.tasks.forEach(task => {
                    const div = document.createElement('div');
                    div.style.marginBottom = '5px';
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.id = `task-check-${task.id}`;
                    checkbox.value = task.id; // Lagre OppgaveID
                    checkbox.style.marginRight = '8px';

                    const label = document.createElement('label');
                    label.htmlFor = checkbox.id;
                    label.textContent = task.name;
                    label.style.fontSize = '14px';
                    label.style.cursor = 'pointer';

                    div.appendChild(checkbox);
                    div.appendChild(label);
                    taskCheckboxList.appendChild(div);
                });
                taskSelectGroup.style.display = 'block'; // Vis hele gruppen
                taskStatusUpdateOptions.style.display = 'block'; // Vis status-oppdateringsvalg
                console.log(`Lastet ${taskData.tasks.length} åpne oppgaver for ${timerData.customerName}`);
            } else if (!taskData.success) {
                console.warn("Kunne ikke laste oppgaver for modal:", taskData.message);
                taskCheckboxList.innerHTML = '<span style="color: var(--text-secondary); font-style: italic;">Feil ved lasting av oppgaver.</span>';
                taskSelectGroup.style.display = 'block'; // Vis gruppen for å vise feilmelding
                taskStatusUpdateOptions.style.display = 'none'; // Skjul statusvalg ved feil
            } else {
                console.log(`Ingen åpne oppgaver funnet for ${timerData.customerName}`);
                taskCheckboxList.innerHTML = '<span style="color: var(--text-secondary); font-style: italic;">Ingen åpne oppgaver for denne kunden.</span>';
                taskSelectGroup.style.display = 'block'; // Vis gruppen for å vise melding
                taskStatusUpdateOptions.style.display = 'none'; // Skjul statusvalg
            }
        })
        .catch(error => {
             console.error("Feil ved henting av oppgaver for modal:", error);
             taskCheckboxList.innerHTML = '<span style="color: var(--text-secondary); font-style: italic;">Feil ved lasting av oppgaver.</span>';
             taskSelectGroup.style.display = 'block';
             taskStatusUpdateOptions.style.display = 'none';
        });

    modal.style.display = 'block';
}
// ========== SLUTT OPPDATERT showCommentModal ==========

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

// Lukker en modal og utfører spesifikk opprydding
function closeModal(modalId) {
   // 1. Hent modal-elementet basert på ID
   const modal = document.getElementById(modalId);

   // 2. Sjekk om elementet faktisk ble funnet
   if (modal) {
       // 3. Skjul modalen
       modal.style.display = 'none';
       console.log(`Lukket modal: ${modalId}`);

       // 4. Utfør spesifikk opprydding basert på modalens ID
       if (modalId === 'commentModal') {
            // --- Opprydding spesifikt for commentModal ---

            // a) Tøm kommentarfeltet
            const commentEl = document.getElementById('comment-text');
            if (commentEl) commentEl.value = '';

            // b) Nullstill oppgave-seksjonen
            const taskCheckboxList = document.getElementById('task-checkbox-list');
            const taskSelectGroup = document.querySelector('#commentModal .task-link-group'); // Finner gruppen via klasse
            const taskStatusUpdateOptions = document.getElementById('task-status-update-options');
            const updateTaskStatusSelect = document.getElementById('update-task-status-select');

            // Tøm listen og vis "Laster..." igjen (eller bare tøm: '')
            if (taskCheckboxList) taskCheckboxList.innerHTML = '<span style="color: var(--text-secondary); font-style: italic;">Laster oppgaver...</span>';
            // Skjul hele oppgave-seksjonen
            if (taskSelectGroup) taskSelectGroup.style.display = 'none';
            // Skjul statusvalg-seksjonen
            if (taskStatusUpdateOptions) taskStatusUpdateOptions.style.display = 'none';
            // Nullstill valgt status i dropdown
            if (updateTaskStatusSelect) updateTaskStatusSelect.value = '';

            // c) Fjern midlertidig timer-data og kunde-ID-attributt
            const closedCustomerId = modal.getAttribute('data-current-customer-id');
            if (closedCustomerId && timers[closedCustomerId]) {
                 delete timers[closedCustomerId]; // Slett midlertidig data
                 console.log(`Slettet midlertidig timerdata for kunde ID ${closedCustomerId}`);
            }
            modal.removeAttribute('data-current-customer-id');
            // --- Slutt på commentModal-opprydding ---

       } else if (modalId === 'newCustomerModal') {
            // --- Opprydding for newCustomerModal ---
            // Sikrer opprydding hvis modalen lukkes manuelt uten å lagre/avbryte
             if (newCustomerTimer && !document.getElementById('add-customer-box')?.classList.contains('active')) {
                cancelNewCustomer(); // Bruk den dedikerte avbryt-funksjonen for full opprydding
            }
            // Tøm feltene uansett
            const nameEl = document.getElementById('new-customer-name');
            const hoursEl = document.getElementById('new-customer-hours');
            const commentElNc = document.getElementById('new-customer-comment'); // Unikt navn
            if(nameEl) nameEl.value = '';
            if(hoursEl) hoursEl.value = '';
            if(commentElNc) commentElNc.value = '';

       } else if (modalId === 'editCustomerModal') {
            // --- Opprydding for editCustomerModal ---
            // Tøm feltene når modalen lukkes
            const editIdEl = document.getElementById('edit-customer-id');
            const editNameEl = document.getElementById('edit-customer-name');
            const editHoursEl = document.getElementById('edit-customer-hours');
            if(editIdEl) editIdEl.value = '';
            if(editNameEl) editNameEl.value = '';
            if(editHoursEl) editHoursEl.value = '';

       } else if (modalId === 'confirmDeleteModal') {
            // --- Opprydding for confirmDeleteModal ---
            // Tøm ID-feltet og navnevisningen
            const deleteIdEl = document.getElementById('delete-customer-id');
            const deleteNameStrongEl = document.getElementById('delete-customer-name');
            if(deleteIdEl) deleteIdEl.value = '';
            if(deleteNameStrongEl) deleteNameStrongEl.textContent = ''; // Tøm navnet som vises
       }
       // --- Slutt på spesifikk opprydding ---

   } else {
       // Hvis modalen ikke ble funnet (f.eks. pga. skrivefeil i ID)
       console.warn(`Forsøkte å lukke ukjent eller ikke-funnet modal: ${modalId}`);
   }
} // Slutt på closeModal-funksjonen

// Konverterer millisekunder til desimaltimer, avrundet til nærmeste kvarter
function calculateHoursFromMs(ms) {
  if (isNaN(ms) || ms <= 0) return 0;
  const rawHours = ms / (1000 * 60 * 60);
  const quarterHours = Math.round(rawHours * 4) / 4;
  return quarterHours;
}

// ========== START OPPDATERT submitTime ==========
function submitTime() {
  if (isSubmitting) { console.warn("Innsending pågår..."); return; }
  isSubmitting = true;

  const modal = document.getElementById('commentModal');
  const currentCustomerId = modal?.getAttribute('data-current-customer-id');
  const timerData = currentCustomerId !== null ? timers[currentCustomerId] : null;

  if (!timerData?.customerName) { /* ... (feilsjekk som før) ... */ return; }

  const comment = document.getElementById('comment-text')?.value.trim() || "";
  const customerName = timerData.customerName;
  const timeSpentMs = timerData.timeSpentMs;
  const decimalHours = calculateHoursFromMs(timeSpentMs);

  // --- Hent valgte oppgave-IDer ---
  const selectedTaskCheckboxes = document.querySelectorAll('#task-checkbox-list input[type="checkbox"]:checked');
  const selectedTaskIds = Array.from(selectedTaskCheckboxes).map(cb => cb.value);
  // --- Hent valgt status ---
  const newStatusForTasks = document.getElementById('update-task-status-select')?.value || null;


  console.log(`Sender tid for: ${customerName}, Timer: ${decimalHours}, Oppgave(r): ${selectedTaskIds.join(', ') || 'Ingen'}, Ny status: ${newStatusForTasks || 'Endres ikke'}, Kommentar: "${comment}"`);

  const submitButton = document.getElementById('submit-comment-btn');
  if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Sender...'; }

  const customerIndex = customers.findIndex(c => c.name === customerName);

  const dataToSend = {
    action: "logTime", // Backend håndterer både tidslogg og statusoppdatering
    customerName: customerName,
    timeSpent: decimalHours,
    comment: comment,
    date: new Date().toISOString().split('T')[0],
    // Send IDene som en kommaseparert streng (eller JSON-streng)
    oppgaveIds: selectedTaskIds.join(','), // <-- Endret navn til flertall
    newStatus: newStatusForTasks // <-- Send med ny status
  };

  sendDataToGoogleScript(dataToSend, `Tid registrert for ${customerName}`)
    .then(response => {
      console.log("Tidsregistrering (og evt. statusoppd.) vellykket:", response);
      const actualRemainingHours = response.updatedAvailableHours;
      if (customerIndex !== -1 && actualRemainingHours !== undefined) {
          updateCustomerBar(customerIndex, actualRemainingHours);
          customers[customerIndex].availableHours = actualRemainingHours;
      } else {
           console.warn("Kunne ikke oppdatere UI lokalt etter tidslogging.");
           fetchCustomerData(); // Hent alt på nytt som fallback
      }
      // Hvis status ble oppdatert, bør oppgavelisten på tasks.html også oppdateres
      // Dette kan løses ved å hente tasks på nytt neste gang den siden besøkes,
      // eller ved mer avansert state management hvis begge sider er åpne samtidig.
      closeModal('commentModal');
    })
    .catch(error => {
      console.error('Feil ved logging/statusoppdatering:', error);
      alert('Kunne ikke lagre tid/status: ' + error.message);
      closeModal('commentModal');
    })
    .finally(() => {
      isSubmitting = false;
      if (timers[currentCustomerId]) delete timers[currentCustomerId];
      if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Lagre og avslutt'; }
      activeBox = null;
    });
}
// ========== SLUTT OPPDATERT submitTime ==========

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
// --- START OPPDATERT Generisk Data Sender (med fallbacks) ---
function sendDataToGoogleScript(data, successMessage) {
  console.log("sendDataToGoogleScript kalt med data:", data);
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    for (const key in data) {
        // Send tom streng for null eller undefined
        const value = (data[key] === null || data[key] === undefined) ? '' : data[key];
        formData.append(key, value);
    }

    // Metode 1: POST (no-cors - antar suksess, returnerer ikke data fra backend)
    console.log("Metode 1: Forsøker POST (no-cors)");
    fetch(GOOGLE_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: formData })
    .then(() => {
      console.log("POST (no-cors) OK (antar suksess). Svaret kan ikke leses.");
      resolve({ success: true, message: successMessage || "Handlingen ble utført (POST/no-cors)." });
    })
    .catch(err1 => {
      console.warn("POST (no-cors) feilet:", err1, "- Prøver GET.");
      tryGetMethod(); // Fallback til GET
    });

    // Metode 2: GET (prøver å få JSON-svar)
    function tryGetMethod() {
        const params = new URLSearchParams();
         for (const key in data) {
             const value = (data[key] === null || data[key] === undefined) ? '' : data[key];
             params.append(key, value);
         }
        params.append('nocache', Date.now());
        const getUrl = `${GOOGLE_SCRIPT_URL}?${params.toString()}`;
        console.log("Metode 2: Forsøker GET:", getUrl.substring(0, 200) + "...");

        fetch(getUrl)
            .then(response => {
                if (!response.ok) return response.text().then(text => { throw new Error(text || `HTTP ${response.status}`) });
                // Prøv alltid å parse som JSON
                return response.json();
            })
            .then(jsonData => {
                 // Sjekk om svaret er et objekt og har en 'success'-egenskap
                 if (typeof jsonData === 'object' && jsonData !== null && jsonData.success !== undefined) {
                     console.log("GET OK:", jsonData);
                     resolve(jsonData); // Bruk svaret fra serveren
                 } else {
                     throw new Error("Ugyldig JSON-format mottatt (GET)");
                 }
            })
            .catch(err2 => {
                console.warn("GET feilet:", err2, "- Prøver iframe POST.");
                tryIframeMethod(); // Fallback til iframe
            });
    }

    // Metode 3: iframe POST (antar suksess, returnerer ikke data)
    function tryIframeMethod() {
        const iframeId = 'hidden-comm-iframe-' + Date.now(), formId = 'hidden-comm-form-' + Date.now();
        console.log("Metode 3: Forsøker iframe POST");
        let iframe = document.getElementById(iframeId); if(iframe) iframe.remove();
        iframe = document.createElement('iframe'); iframe.id = iframeId; iframe.name = iframeId; iframe.style.display = 'none'; document.body.appendChild(iframe);
        let form = document.getElementById(formId); if(form) form.remove();
        form = document.createElement('form'); form.id = formId; form.method = 'POST'; form.action = GOOGLE_SCRIPT_URL; form.target = iframeId;
        for (const key in data) {
             const input = document.createElement('input'); input.type = 'hidden'; input.name = key;
             // Send tom streng for null/undefined også her
             input.value = (data[key] === null || data[key] === undefined) ? '' : data[key];
             form.appendChild(input);
         }
        document.body.appendChild(form);
        let cleanupPerformed = false; const cleanup = () => { if(cleanupPerformed) return; clearTimeout(timeoutId); iframe?.remove(); form?.remove(); cleanupPerformed = true; };
        const timeoutId = setTimeout(() => { cleanup(); reject(new Error('Timeout (iframe)')); }, 20000);
        iframe.onload = () => { cleanup(); resolve({ success: true, message: successMessage || "Handlingen utført (iframe)." }); };
        iframe.onerror = (err3) => { cleanup(); reject(new Error('Iframe feil:' + err3)); };
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
