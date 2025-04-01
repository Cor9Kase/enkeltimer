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
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbybdhOLvN_8_8glQwqwDCaF4Hn7-1pa9xWrD-N0N5H3W6EWhE6u3lAnj8W5ZouhlqzI/exec';

// Globale variabler for tilstand
const timers = {}; // Holder styr på aktive timere for eksisterende kunder { customerId: { startTime, interval, ... } }
let activeBox = null; // Referanse til den aktive kundeboksen (HTML element)
let customers = []; // Array med kundeobjekter { name, availableHours }
let newCustomerTimer = null; // Holder styr på timer for ny kunde { startTime, interval, ... }
let isAutoRefreshPaused = false; // Pauser auto-refresh når en timer er aktiv
let isSubmitting = false; // Flagg for å unngå doble innsendinger under nettverkskall

// Opprett en debounced versjon av submitTime-funksjonen for kommentarmodalen
const debouncedSubmitTime = debounce(submitTime, 500); // 500ms ventetid

// Initialisering når siden er lastet
document.addEventListener('DOMContentLoaded', function() {
  console.log("DOM lastet, initialiserer app");
  updateCurrentDate(); // Sett dagens dato i header
  loadCustomers(); // Last kundedata fra Google Sheet
  startAutoRefresh(); // Start automatisk oppdatering av data
  addGlobalEventListeners(); // Legg til event listeners for knapper etc.
});

// Legg til globale event listeners for elementer som alltid er til stede
function addGlobalEventListeners() {
  console.log("Legger til globale event listeners");

  // Knapper i modaler (de finnes alltid i HTML, selv om de er skjult)
  document.getElementById('submit-comment-btn')?.addEventListener('click', debouncedSubmitTime);
  document.getElementById('create-customer-btn')?.addEventListener('click', createNewCustomer);
  document.getElementById('update-customer-btn')?.addEventListener('click', updateCustomer);
  document.getElementById('confirm-delete-btn')?.addEventListener('click', deleteCustomer);

  // Felles lukkeknapper for modaler
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


  // Oppdater data-knapp
  document.getElementById('refresh-button')?.addEventListener('click', fetchCustomerData);

  // Nødtest-knapp
  document.getElementById('test-connection-button')?.addEventListener('click', testConnection);
}

// Oppdaterer datovisningen i headeren
function updateCurrentDate() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('current-date').textContent = now.toLocaleDateString('no-NO', options);
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
    if (!isAutoRefreshPaused && !Object.keys(timers).length && !newCustomerTimer) { // Oppdater kun hvis ingen timere er aktive
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
  document.getElementById('last-updated').textContent = 'Henter data...';

  // Forsøk direkte fetch først
  fetchCustomersDirect()
    .catch(error => {
      console.warn('Direkte fetch feilet, prøver JSONP:', error);
      // Fallback til JSONP hvis direkte fetch feiler (f.eks. pga CORS)
      return fetchCustomersWithJSONP();
    })
    .catch(error => {
      console.error('Alle tilkoblingsforsøk feilet:', error);
      // Fallback til testdata hvis alt annet feiler
      useMockData();
    });
}

// Henting med direkte fetch (foretrukket metode)
function fetchCustomersDirect() {
  const url = `${GOOGLE_SCRIPT_URL}?action=getCustomers`;
  console.log("Direkte fetch URL:", url);

  return fetch(url)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status} ${response.statusText}`);
      }
      return response.json(); // Forventer JSON fra scriptet
    })
    .then(data => {
      console.log("Mottatt data (direkte fetch):", data);
      if (data && data.success && Array.isArray(data.customers)) {
        processCustomerData(data);
        return data; // Returner data for videre chaining om nødvendig
      } else {
        // Kast en mer spesifikk feil hvis dataformatet er feil
        throw new Error('Ugyldig responsformat fra Google Script: ' + JSON.stringify(data));
      }
    })
    .catch(error => {
      console.error("Feil under direkte fetch:", error);
      throw error; // Kast feilen videre for fallback-mekanismen
    });
}

// Henting med JSONP (fallback for CORS-problemer ved GET-deployments)
function fetchCustomersWithJSONP() {
  console.log("Starter JSONP-forespørsel");

  return new Promise((resolve, reject) => {
    const callbackName = 'googleScriptCallback_' + Date.now(); // Unikt callback navn
    const url = `${GOOGLE_SCRIPT_URL}?action=getCustomers&callback=${callbackName}`;
    console.log("JSONP URL:", url);

    let script = null; // Definer script her for tilgang i timeout/onerror

    // Timeout hvis scriptet ikke svarer innen 10 sekunder
    const timeoutId = setTimeout(() => {
      console.error('JSONP request timed out');
      cleanupJsonp();
      reject(new Error('JSONP request timed out after 10 seconds'));
    }, 10000);

    // Funksjon for å rydde opp etter JSONP
    function cleanupJsonp() {
        clearTimeout(timeoutId);
        if (script && script.parentNode) {
            script.parentNode.removeChild(script);
        }
        delete window[callbackName]; // Fjern global callback
    }

    // Definer den globale callback-funksjonen som scriptet vil kalle
    window[callbackName] = function(data) {
      console.log("JSONP callback mottatt data:", data);
      cleanupJsonp(); // Rydd opp

      if (data && data.success && Array.isArray(data.customers)) {
        processCustomerData(data);
        resolve(data); // Fullfør Promise med suksess
      } else {
        reject(new Error('Invalid response format from Google Script via JSONP: ' + JSON.stringify(data)));
      }
    };

    // Opprett og legg til script-elementet for å trigge JSONP-kallet
    script = document.createElement('script');
    script.src = url;
    script.onerror = function(error) {
      console.error("JSONP script feil:", error);
      cleanupJsonp(); // Rydd opp
      reject(new Error('JSONP script loading failed'));
    };

    document.body.appendChild(script);
    console.log("JSONP script lagt til i DOM");
  });
}

// Behandler mottatt kundedata og oppdaterer UI
function processCustomerData(data) {
  console.log("Behandler kundedata:", data.customers.length, "kunder funnet.");

  // Sorter kunder alfabetisk basert på navn
  customers = data.customers.sort((a, b) => a.name.localeCompare(b.name, 'no'));

  // Gjengi kundeboksene på siden
  renderCustomers();

  // Oppdater "Sist oppdatert"-teksten
  const now = new Date();
  document.getElementById('last-updated').textContent = now.toLocaleTimeString('nb-NO');
  console.log("Kundedata behandlet og UI oppdatert.");
}

// Bruker innebygde testdata hvis tilkobling feiler
function useMockData() {
  console.warn('Fallback til mock data for testing');
  const mockCustomerData = [
    { name: "Test Kunde A", availableHours: 40.5 },
    { name: "Eksempel B", availableHours: 25.0 },
    { name: "Demo C", availableHours: 60.8 },
  ];

  customers = mockCustomerData.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
  renderCustomers();

  document.getElementById('last-updated').textContent = 'Frakoblet modus (testdata)';

  // Vis en brukervennlig feilmelding
  const errorMessage = "Kunne ikke koble til Google Sheets. Viser testdata.\n\nMulige årsaker:\n" +
                       "1. Ingen internettforbindelse.\n" +
                       "2. Google Apps Script URL-en er feil.\n" +
                       "3. Skriptet er ikke publisert korrekt (som webapp, med tilgang for 'Alle').\n" +
                       "4. Google-tjenester er midlertidig utilgjengelige.";
  alert(errorMessage);
}

// Gjengir kundeboksene i containeren
function renderCustomers() {
  console.log("Rendrer kundebokser...");
  const container = document.getElementById('customer-container');
  if (!container) {
    console.error("FEIL: Finner ikke 'customer-container'");
    return;
  }

  // Ta vare på den aktive kundens ID hvis det finnes en
  const activeCustomerId = activeBox ? activeBox.getAttribute('data-id') : null;

  // Behold "Legg til kunde"-knappen
  const addCustomerButton = document.getElementById('add-customer-box');
  if (!addCustomerButton) {
    console.error("FEIL: Finner ikke 'add-customer-box'");
    return; // Kritisk feil hvis denne mangler
  }

  // Tøm containeren for eksisterende kundebokser
  while (container.children.length > 1) { // Behold addCustomerButton som er første barn
      if (container.lastChild !== addCustomerButton) {
         container.removeChild(container.lastChild);
      } else {
          break; // Skal ikke skje, men sikkerhet
      }
  }


  // Opprett og legg til boks for hver kunde
  if (!customers || customers.length === 0) {
    console.log("Ingen kunder å vise.");
    // Kanskje legge inn en melding i containeren her?
    // f.eks. container.innerHTML += '<p>Ingen kunder funnet.</p>';
    return;
  }

  customers.forEach((customer, index) => {
    const customerId = index; // Bruk 0-basert index som ID internt
    const customerBox = document.createElement('div');
    customerBox.className = 'customer-box';
    customerBox.setAttribute('data-id', customerId); // Lagre intern ID

    // Innhold i boksen
    customerBox.innerHTML = `
      <div class="customer-actions">
        <button class="customer-action-btn edit-btn" title="Rediger kunde">✏️</button>
        <button class="customer-action-btn delete-btn" title="Slett kunde">🗑️</button>
      </div>
      <div class="customer-name">${customer.name}</div>
      <div class="available-hours">Timer igjen: ${customer.availableHours.toFixed(1)}</div>
      <div class="timer">00:00:00</div>
      <div class="status">Inaktiv</div>
    `;

    // Legg til event listeners for knapper og boks
    customerBox.querySelector('.edit-btn').addEventListener('click', (e) => {
      e.stopPropagation(); // Forhindre at klikket også starter timeren
      showEditCustomer(customerId);
    });

    customerBox.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDeleteCustomer(customerId);
    });

    customerBox.addEventListener('click', () => toggleTimer(customerBox));

    // Gjenopprett aktiv tilstand hvis denne boksen var aktiv
     if (activeCustomerId !== null && parseInt(activeCustomerId) === customerId) {
        customerBox.classList.add('active');
        customerBox.querySelector('.status').textContent = 'Aktiv';
        customerBox.querySelector('.status').style.fontWeight = 'bold'; // Gjør status fet
        customerBox.querySelector('.status').style.color = 'var(--active)'; // Sett aktiv farge


        // Gjenopprett timer-visning basert på lagret starttid
        if (timers[customerId] && timers[customerId].startTime) {
          const elapsedTime = Date.now() - timers[customerId].startTime;
          customerBox.querySelector('.timer').textContent = formatTime(elapsedTime);
          // Fortsett intervallet (håndteres i toggleTimer hvis den ikke allerede kjører)
        }
        activeBox = customerBox; // Oppdater referansen til den aktive boksen
    }


    container.appendChild(customerBox);
  });
  console.log("Kundebokser rendret.");
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
  const customer = customers[parseInt(customerId)];
  if (!customer) {
       console.error(`toggleTimer: Fant ikke kunde med id ${customerId}`);
      return;
  }

  const timerDisplay = box.querySelector('.timer');
  const statusDisplay = box.querySelector('.status');

  // --- Scenario 1: Stopper den aktive timeren ---
  if (box.classList.contains('active')) {
    console.log(`Stopper timer for kunde: ${customer.name} (ID: ${customerId})`);
    isAutoRefreshPaused = false; // Gjenoppta auto-refresh

    // Stopp intervallet hvis det finnes
    if (timers[customerId] && timers[customerId].interval) {
      clearInterval(timers[customerId].interval);
    }

    box.classList.remove('active');
    statusDisplay.textContent = 'Inaktiv';
    statusDisplay.style.fontWeight = 'normal';
    statusDisplay.style.color = 'var(--inactive)';


    // Beregn brukt tid
    const endTime = new Date();
    let timeSpentMs = 0;
    if (timers[customerId] && timers[customerId].startTime) {
        timeSpentMs = endTime - timers[customerId].startTime;
    } else {
        console.warn(`Kunne ikke finne starttid for kunde ${customerId}. Setter tid til 0.`);
    }
    const timeSpentFormatted = formatTime(timeSpentMs);
    timerDisplay.textContent = timeSpentFormatted; // Vis endelig tid

    // Forbered data for kommentarmodal/innsending
     if (!timers[customerId]) timers[customerId] = {}; // Sikkerhet
    timers[customerId].endTime = endTime;
    timers[customerId].timeSpentMs = timeSpentMs;
    timers[customerId].timeSpentFormatted = timeSpentFormatted;
    timers[customerId].customerName = customer.name; // Lagre navnet for modalen

    // Vis kommentarmodalen
    showCommentModal(customerId);

    activeBox = null; // Ingen boks er aktiv nå

  // --- Scenario 2: Starter en ny timer ---
  } else {
    console.log(`Starter timer for kunde: ${customer.name} (ID: ${customerId})`);

    // Stopp eventuell annen aktiv timer først (enten annen kunde eller ny kunde)
    if (activeBox) {
      console.log("Stopper tidligere aktiv timer (annen kunde)");
      toggleTimer(activeBox); // Rekursivt kall for å stoppe den andre
    }
    const addCustomerBox = document.getElementById('add-customer-box');
    if (addCustomerBox.classList.contains('active')) {
      console.log("Stopper tidligere aktiv timer (ny kunde)");
      stopNewCustomerTimer(false); // Stopp uten å vise modal ennå
    }

    isAutoRefreshPaused = true; // Pause auto-refresh

    // Start ny timer
    box.classList.add('active');
    statusDisplay.textContent = 'Aktiv';
    statusDisplay.style.fontWeight = 'bold';
    statusDisplay.style.color = 'var(--active)';

    const startTime = new Date();
    timers[customerId] = {
      startTime: startTime,
      customerName: customer.name, // Lagre for sikkerhets skyld
      interval: setInterval(() => {
        const now = new Date();
        const elapsedTime = now - startTime;
        // Sjekk om boksen fortsatt eksisterer før oppdatering (viktig ved re-rendering)
        const currentBox = document.querySelector(`.customer-box[data-id='${customerId}']`);
        if (currentBox && currentBox.classList.contains('active')) {
             currentBox.querySelector('.timer').textContent = formatTime(elapsedTime);
        } else {
            // Hvis boksen er borte eller ikke aktiv lenger, stopp intervallet
             console.warn(`Interval for kunde ${customerId} stoppet fordi boksen ikke er aktiv/funnet.`);
             if (timers[customerId] && timers[customerId].interval) {
                 clearInterval(timers[customerId].interval);
             }
        }

      }, 1000)
    };

    activeBox = box; // Sett denne boksen som aktiv
  }
}

// Viser kommentarmodalen etter at en timer er stoppet
function showCommentModal(customerId) {
    const customerData = timers[customerId];
    if (!customerData) {
        console.error(`showCommentModal: Fant ikke timer data for kunde ID ${customerId}`);
        return;
    }

    console.log(`Viser kommentarmodal for: ${customerData.customerName}, Tid: ${customerData.timeSpentFormatted}`);

    document.getElementById('modal-customer-name').textContent = customerData.customerName;
    document.getElementById('modal-time-spent').textContent = `Tid brukt: ${customerData.timeSpentFormatted}`;
    document.getElementById('comment-text').value = ''; // Tøm kommentarfeltet
    document.getElementById('commentModal').style.display = 'block';

    // Lagre ID-en slik at submitTime vet hvilken timer det gjelder
     document.getElementById('commentModal').setAttribute('data-current-customer-id', customerId);
}


// Starter timer for "Legg til ny kunde"-boksen
function startNewCustomerTimer() {
    const addCustomerBox = document.getElementById('add-customer-box');
    // Hvis en annen kunde-timer er aktiv, stopp den først
    if (activeBox) {
        console.log("Stopper aktiv kunde-timer før 'ny kunde'-timer startes.");
        toggleTimer(activeBox); // Stopper den andre og viser dens modal
        return; // Ikke start ny kunde-timer nå
    }

    // Hvis ny-kunde-timer allerede er aktiv, stopp den
    if (addCustomerBox.classList.contains('active')) {
        console.log("Stopper 'ny kunde'-timer (klikket igjen).");
        stopNewCustomerTimer(true); // Stopp og vis modal
        return;
    }

    console.log("Starter 'ny kunde'-timer.");
    isAutoRefreshPaused = true; // Pause auto-refresh

    addCustomerBox.classList.add('active');
    const timerDisplay = document.getElementById('new-customer-timer');
    timerDisplay.textContent = '00:00:00'; // Nullstill

    const startTime = new Date();
    newCustomerTimer = {
        startTime: startTime,
        interval: setInterval(() => {
            const now = new Date();
            const elapsedTime = now - startTime;
             // Sjekk om boksen fortsatt er aktiv
            if (document.getElementById('add-customer-box').classList.contains('active')) {
                 timerDisplay.textContent = formatTime(elapsedTime);
            } else {
                console.warn("Interval for 'ny kunde' stoppet fordi boksen ikke er aktiv lenger.");
                if (newCustomerTimer && newCustomerTimer.interval) {
                    clearInterval(newCustomerTimer.interval);
                }
            }
        }, 1000)
    };
}

// Stopper timer for "Legg til ny kunde"
// showModal: boolean - om modalen skal vises (true), eller om den bare skal stoppes internt (false)
function stopNewCustomerTimer(showModal = true) {
  if (!newCustomerTimer || !newCustomerTimer.interval) {
      console.log("stopNewCustomerTimer kalt, men ingen aktiv timer funnet.");
      return; // Ingen aktiv timer
  }

  console.log(`Stopper 'ny kunde'-timer. Skal modal vises? ${showModal}`);
  clearInterval(newCustomerTimer.interval);
  isAutoRefreshPaused = false; // Gjenoppta auto-refresh

  const addCustomerBox = document.getElementById('add-customer-box');
  addCustomerBox.classList.remove('active');

  const endTime = new Date();
  const timeSpentMs = endTime - newCustomerTimer.startTime;
  const timeSpentFormatted = formatTime(timeSpentMs);
  document.getElementById('new-customer-timer').textContent = timeSpentFormatted; // Vis endelig tid

   // Lagre data før intervallet nullstilles
  newCustomerTimer.endTime = endTime;
  newCustomerTimer.timeSpentMs = timeSpentMs;
  newCustomerTimer.timeSpentFormatted = timeSpentFormatted;


  if (showModal) {
    // Vis modalen for å legge inn kundeinfo
    const modal = document.getElementById('newCustomerModal');
    document.getElementById('new-customer-time-spent').textContent = `Tid brukt: ${timeSpentFormatted}`;
    // Tøm feltene
    document.getElementById('new-customer-name').value = '';
    document.getElementById('new-customer-hours').value = '';
    document.getElementById('new-customer-comment').value = '';
    modal.style.display = 'block';
  } else {
      // Nullstill timeren uten å vise modal (f.eks. når en annen timer startes)
       newCustomerTimer = null;
       document.getElementById('new-customer-timer').textContent = '00:00:00';
  }

}

// Avbryter opprettelse av ny kunde fra modalen
function cancelNewCustomer() {
  console.log("Avbryter ny kunde.");
  // Hvis timeren fortsatt har data (f.eks. hvis modalen ble lukket på X), nullstill den
  if (newCustomerTimer) {
     if(newCustomerTimer.interval) clearInterval(newCustomerTimer.interval);
     newCustomerTimer = null;
     document.getElementById('add-customer-box').classList.remove('active');
     document.getElementById('new-customer-timer').textContent = '00:00:00';
     isAutoRefreshPaused = false;
  }
  closeModal('newCustomerModal');
}


// Formaterer millisekunder til HH:MM:SS
function formatTime(ms) {
  if (isNaN(ms) || ms < 0) ms = 0;
  let seconds = Math.floor(ms / 1000);
  let minutes = Math.floor(seconds / 60);
  let hours = Math.floor(minutes / 60);

  seconds = seconds % 60;
  minutes = minutes % 60;

  return `${padZero(hours)}:${padZero(minutes)}:${padZero(seconds)}`;
}

// Hjelpefunksjon for formatering (legger til ledende null)
function padZero(num) {
  return num.toString().padStart(2, '0');
}

// Lukker en modal
function closeModal(modalId) {
   const modal = document.getElementById(modalId);
   if (modal) {
       modal.style.display = 'none';
       console.log(`Lukket modal: ${modalId}`);
        // Spesifikk opprydding for kommentarmodal
       if (modalId === 'commentModal') {
            document.getElementById('comment-text').value = '';
             // Viktig: fjern IDen så ikke neste submit bruker feil data
             modal.removeAttribute('data-current-customer-id');
             // Slett timerdata for denne kunden nå som modalen er lukket (enten lagret eller avbrutt)
            const closedCustomerId = modal.getAttribute('data-current-customer-id');
             if (closedCustomerId && timers[closedCustomerId]) {
                 delete timers[closedCustomerId];
                 console.log(`Slettet midlertidig timerdata for kunde ID ${closedCustomerId}`);
             }

       } else if (modalId === 'newCustomerModal') {
            // Hvis ny-kunde-modal lukkes uten å lagre, må vi rydde opp timer-objektet
            // cancelNewCustomer() håndterer dette hvis X eller Avbryt brukes.
            // Men hvis man lukker på annen måte (f.eks. Esc), kan dette være nødvendig.
            if (newCustomerTimer && !document.getElementById('add-customer-box').classList.contains('active')) {
                console.log("Rydder opp newCustomerTimer etter lukking av modal.");
                 if(newCustomerTimer.interval) clearInterval(newCustomerTimer.interval);
                 newCustomerTimer = null;
                 document.getElementById('new-customer-timer').textContent = '00:00:00';
                 isAutoRefreshPaused = false;
            }
       }


   } else {
       console.warn(`Forsøkte å lukke ukjent modal: ${modalId}`);
   }

}

// Konverterer millisekunder til desimaltimer, avrundet til nærmeste kvarter
function calculateHoursFromMs(ms) {
  if (isNaN(ms) || ms <= 0) return 0;
  const rawHours = ms / (1000 * 60 * 60); // Timer som desimaltall
  // Avrund til nærmeste 0.25 (kvart time)
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
  isSubmitting = true; // Sett lås

  // Finn hvilken kunde modalen gjaldt for
  const currentCustomerId = document.getElementById('commentModal').getAttribute('data-current-customer-id');
  if (currentCustomerId === null) {
       console.error("FEIL: Kunne ikke finne kunde-ID for innsending.");
       alert("Kritisk feil: Kunne ikke identifisere kunden for tidsregistrering.");
       closeModal('commentModal');
       isSubmitting = false;
       return;
  }


  const timerData = timers[currentCustomerId];
  if (!timerData) {
       console.error(`FEIL: Ingen timerdata funnet for kunde ID ${currentCustomerId} ved innsending.`);
       alert("Kritisk feil: Mangler data for tidsregistrering. Prøv igjen.");
       closeModal('commentModal');
       isSubmitting = false;
       return;
  }


  const comment = document.getElementById('comment-text').value.trim();
  const customerName = timerData.customerName;
  const timeSpentMs = timerData.timeSpentMs;
  const decimalHours = calculateHoursFromMs(timeSpentMs);

  console.log(`Sender tid for: ${customerName}, Timer: ${decimalHours}, Kommentar: "${comment}"`);

  // Deaktiver knapp under sending
  const submitButton = document.getElementById('submit-comment-btn');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Sender...';
  }

  // Finn kundens data i den globale listen for å få originalt timeantall
   const customerIndex = customers.findIndex(c => c.name === customerName);
   let originalAvailableHours = 0;
   if(customerIndex !== -1) {
       originalAvailableHours = customers[customerIndex].availableHours;
   } else {
       console.warn(`Fant ikke kunden ${customerName} i listen for å hente originalt timeantall.`);
       // Kan velge å fortsette eller feile her. Fortsetter med 0.
   }

   const remainingHours = Math.max(0, originalAvailableHours - decimalHours);

  const dataToSend = {
    action: "logTime",
    customerName: customerName,
    timeSpent: decimalHours, // Send avrundet desimaltid
    originalHours: originalAvailableHours, // Send timer FØR denne økten
    remainingHours: remainingHours, // Send timer ETTER denne økten
    comment: comment,
    date: new Date().toISOString().split('T')[0] // YYYY-MM-DD format
  };

  sendDataToGoogleScript(dataToSend, `Tid (${decimalHours}t) registrert for ${customerName}`)
    .then(response => {
      console.log("Tidsregistrering vellykket:", response);
      // Oppdater lokalt FØR henting for raskere UI-respons
      if (customerIndex !== -1) {
        customers[customerIndex].availableHours = remainingHours;
        renderCustomers(); // Oppdater UI umiddelbart med ny timebalanse
      }
      fetchCustomerData(); // Hent fersk data i bakgrunnen for å bekrefte
      closeModal('commentModal');
      alert(`Timer lagret for ${customerName}!`);
    })
    .catch(error => {
      console.error('Feil ved logging av tid:', error);
      alert('Kunne ikke lagre tid: ' + error.message + "\n\nPrøv igjen senere.");
    })
    .finally(() => {
      isSubmitting = false; // Frigi lås
      // Slett timer data uansett utfall, siden forsøket er gjort
       if (timers[currentCustomerId]) {
           delete timers[currentCustomerId];
           console.log(`Slettet midlertidig timerdata for kunde ID ${currentCustomerId} etter innsendingsforsøk.`);
       }
      // Reaktiver knapp
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Lagre og avslutt';
      }
       activeBox = null; // Sikre at ingen boks er aktiv
    });
}

// Viser modal for å redigere kunde
function showEditCustomer(customerId) {
    const customerIndex = parseInt(customerId);
     if (isNaN(customerIndex) || customerIndex < 0 || customerIndex >= customers.length) {
        console.error(`Ugyldig kundeindeks for redigering: ${customerId}`);
        return;
     }
    const customer = customers[customerIndex];
    console.log(`Åpner redigeringsmodal for: ${customer.name}`);

    document.getElementById('edit-customer-name').value = customer.name;
    document.getElementById('edit-customer-hours').value = customer.availableHours.toFixed(1); // Vis med en desimal
    document.getElementById('edit-customer-id').value = customerId; // Lagre IDen

    document.getElementById('editCustomerModal').style.display = 'block';
}

// Sender inn data for å opprette en ny kunde
function createNewCustomer() {
  console.log("Forsøker å opprette ny kunde...");
  if (isSubmitting) {
      console.warn("Innsending pågår, avventer...");
      return;
  }


  const customerName = document.getElementById('new-customer-name').value.trim();
  const availableHoursInput = document.getElementById('new-customer-hours').value;
  const comment = document.getElementById('new-customer-comment').value.trim();

  // Validering
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
  const availableHours = parseFloat(availableHoursInput);


  // Hent tid brukt fra den (forhåpentligvis) stoppede newCustomerTimer
  let timeSpentMs = 0;
  let decimalHoursSpent = 0;
  if (newCustomerTimer && newCustomerTimer.timeSpentMs) {
      timeSpentMs = newCustomerTimer.timeSpentMs;
      decimalHoursSpent = calculateHoursFromMs(timeSpentMs);
      console.log(`Registrerer ${decimalHoursSpent} timer brukt under opprettelse.`);
  } else {
      console.log("Ingen tid registrert under opprettelse av ny kunde.");
  }

  // Beregn gjenstående timer
  const remainingHours = Math.max(0, availableHours - decimalHoursSpent);

  isSubmitting = true; // Sett lås

  // Deaktiver knapp
  const createButton = document.getElementById('create-customer-btn');
   if (createButton) {
        createButton.disabled = true;
        createButton.textContent = 'Lagrer...';
   }


  const dataToSend = {
    action: "addCustomer",
    customerName: customerName,
    initialAvailableHours: availableHours, // Timer kunden *starter* med
    timeSpent: decimalHoursSpent, // Timer brukt *under* opprettelsen
    remainingHours: remainingHours, // Faktisk gjenstående timer etter opprettelse
    comment: comment, // Kommentar for den første tidsloggføringen
    date: new Date().toISOString().split('T')[0] // Dagens dato
  };

  console.log("Sender data for ny kunde:", dataToSend);

  sendDataToGoogleScript(dataToSend, `Ny kunde '${customerName}' opprettet`)
    .then(response => {
      console.log("Ny kunde opprettet vellykket:", response);

      // Legg til lokalt for umiddelbar visning (med korrekte gjenstående timer)
      customers.push({ name: customerName, availableHours: remainingHours });
      customers.sort((a, b) => a.name.localeCompare(b.name, 'nb')); // Hold sortert

      renderCustomers(); // Oppdater UI
      fetchCustomerData(); // Verifiser med server i bakgrunnen
      closeModal('newCustomerModal');
      alert(`Ny kunde '${customerName}' ble opprettet!`);

    })
    .catch(error => {
      console.error('Feil ved opprettelse av kunde:', error);
      alert('Kunne ikke opprette kunde: ' + error.message + "\n\nPrøv igjen senere.");
    })
    .finally(() => {
       isSubmitting = false; // Frigi lås
        // Reaktiver knapp
       if (createButton) {
            createButton.disabled = false;
            createButton.textContent = 'Lagre kunde og tid';
       }
       // Nullstill newCustomerTimer helt nå som prosessen er ferdig (vellykket eller ei)
       if (newCustomerTimer) {
            if(newCustomerTimer.interval) clearInterval(newCustomerTimer.interval);
            newCustomerTimer = null;
            document.getElementById('new-customer-timer').textContent = '00:00:00';
            document.getElementById('add-customer-box').classList.remove('active');
            console.log("newCustomerTimer nullstilt etter opprettelsesforsøk.");
       }

    });
}

// Sender inn data for å oppdatere en eksisterende kunde
function updateCustomer() {
  console.log("Forsøker å oppdatere kunde...");
   if (isSubmitting) {
      console.warn("Innsending pågår, avventer...");
      return;
  }

  const customerId = document.getElementById('edit-customer-id').value;
  const originalCustomerIndex = parseInt(customerId);

  if (isNaN(originalCustomerIndex) || originalCustomerIndex < 0 || originalCustomerIndex >= customers.length) {
      console.error(`Ugyldig kundeindeks for oppdatering: ${customerId}`);
       alert("Feil: Kunne ikke finne kunden som skal oppdateres.");
      return;
  }

  const originalName = customers[originalCustomerIndex].name;
  const newName = document.getElementById('edit-customer-name').value.trim();
  const newHoursInput = document.getElementById('edit-customer-hours').value;

  // Validering
  if (!newName) {
    alert('Kundenavn må fylles ut.');
    return;
  }
  // Sjekk om det nye navnet allerede eksisterer (og ikke er den samme kunden)
   if (customers.some((c, index) => index !== originalCustomerIndex && c.name.toLowerCase() === newName.toLowerCase())) {
     alert('En annen kunde med dette navnet finnes allerede.');
     return;
   }
  if (!newHoursInput || isNaN(parseFloat(newHoursInput)) || parseFloat(newHoursInput) < 0) {
    alert('Antall tilgjengelige timer må være et gyldig positivt tall.');
    return;
  }
   const newAvailableHours = parseFloat(newHoursInput);

   // Sjekk om noe faktisk er endret
    if (newName === originalName && newAvailableHours === customers[originalCustomerIndex].availableHours) {
        console.log("Ingen endringer å lagre.");
        closeModal('editCustomerModal');
        return;
    }


  isSubmitting = true; // Sett lås

  // Deaktiver knapp
  const updateButton = document.getElementById('update-customer-btn');
  if (updateButton) {
       updateButton.disabled = true;
       updateButton.textContent = 'Lagrer...';
  }

  const dataToSend = {
    action: "updateCustomer",
    originalName: originalName, // Viktig for å finne riktig rad i arket
    newName: newName,
    newAvailableHours: newAvailableHours
  };

  console.log("Sender kundeoppdatering:", dataToSend);

  sendDataToGoogleScript(dataToSend, `Kunde '${newName}' oppdatert`)
    .then(response => {
      console.log("Kundeoppdatering vellykket:", response);

      // Oppdater lokalt
      customers[originalCustomerIndex].name = newName;
      customers[originalCustomerIndex].availableHours = newAvailableHours;
      customers.sort((a, b) => a.name.localeCompare(b.name, 'nb')); // Sorter på nytt hvis navn endret

      renderCustomers(); // Oppdater UI
      fetchCustomerData(); // Verifiser med server
      closeModal('editCustomerModal');
      alert(`Kunde '${newName}' ble oppdatert.`);

    })
    .catch(error => {
      console.error('Feil ved oppdatering av kunde:', error);
      alert('Kunne ikke oppdatere kunde: ' + error.message + "\n\nPrøv igjen senere.");
    })
    .finally(() => {
      isSubmitting = false; // Frigi lås
       // Reaktiver knapp
        if (updateButton) {
           updateButton.disabled = false;
           updateButton.textContent = 'Lagre endringer';
       }
    });
}

// Viser bekreftelsesmodal før sletting
function confirmDeleteCustomer(customerId) {
     const customerIndex = parseInt(customerId);
     if (isNaN(customerIndex) || customerIndex < 0 || customerIndex >= customers.length) {
        console.error(`Ugyldig kundeindeks for sletting: ${customerId}`);
        return;
     }
    const customer = customers[customerIndex];
    console.log(`Åpner slettebekreftelse for: ${customer.name}`);

    document.getElementById('delete-customer-name').textContent = customer.name;
    document.getElementById('delete-customer-id').value = customerId; // Lagre ID

    document.getElementById('confirmDeleteModal').style.display = 'block';
}

// Sender forespørsel om å slette en kunde
function deleteCustomer() {
   console.log("Forsøker å slette kunde...");
    if (isSubmitting) {
      console.warn("Innsending pågår, avventer...");
      return;
  }

  const customerId = document.getElementById('delete-customer-id').value;
  const customerIndex = parseInt(customerId);

   if (isNaN(customerIndex) || customerIndex < 0 || customerIndex >= customers.length) {
      console.error(`Ugyldig kundeindeks for sletting: ${customerId}`);
      alert("Feil: Kunne ikke finne kunden som skal slettes.");
      closeModal('confirmDeleteModal');
      return;
  }

  const customerName = customers[customerIndex].name;

  isSubmitting = true; // Sett lås

   // Deaktiver knapp
    const deleteButton = document.getElementById('confirm-delete-btn');
    if (deleteButton) {
        deleteButton.disabled = true;
        deleteButton.textContent = 'Sletter...';
    }
     const cancelButton = document.querySelector('#confirmDeleteModal .cancel-btn');
    if (cancelButton) cancelButton.disabled = true;


  const dataToSend = {
    action: "deleteCustomer",
    customerName: customerName // Send navnet for å identifisere kunden i arket
  };

  console.log("Sender kundesletting:", dataToSend);

  sendDataToGoogleScript(dataToSend, `Kunde '${customerName}' slettet`)
    .then(response => {
      console.log("Kundesletting vellykket:", response);

      // Fjern lokalt
      customers.splice(customerIndex, 1);
      // Ikke nødvendig å sortere på nytt

      renderCustomers(); // Oppdater UI
      // Ikke nødvendig å fetche data på nytt, den er borte
      closeModal('confirmDeleteModal');
      alert(`Kunde '${customerName}' ble slettet.`);

    })
    .catch(error => {
      console.error('Feil ved sletting av kunde:', error);
      alert('Kunne ikke slette kunde: ' + error.message + "\n\nPrøv igjen senere.");
    })
    .finally(() => {
      isSubmitting = false; // Frigi lås
      // Reaktiver knapper
       if (deleteButton) {
            deleteButton.disabled = false;
            deleteButton.textContent = 'Slett kunde';
       }
       if (cancelButton) cancelButton.disabled = false;
    });
}


// --- Robust sending til Google Apps Script ---
// Forsøker POST (no-cors), deretter GET (med JSON-respons), deretter iframe POST.
function sendDataToGoogleScript(data, successMessage) {
  console.log("sendDataToGoogleScript kalt med data:", data);
  let statusMessage = null; // For UI-feedback

  // Funksjon for å vise statusmelding
  function showStatus(message, isError = false) {
    if (statusMessage && statusMessage.parentNode) {
      statusMessage.parentNode.removeChild(statusMessage);
    }
    statusMessage = document.createElement('div');
    statusMessage.textContent = message;
    statusMessage.style.position = 'fixed';
    statusMessage.style.bottom = '20px'; // Endret fra top til bottom
    statusMessage.style.left = '20px';  // Endret fra right til left
    statusMessage.style.padding = '12px 20px';
    statusMessage.style.background = isError ? 'rgba(229, 57, 53, 0.9)' : 'rgba(67, 160, 71, 0.9)'; // Rød for feil, grønn for suksess/info
    statusMessage.style.color = '#fff';
    statusMessage.style.borderRadius = '8px';
    statusMessage.style.zIndex = '9999';
    statusMessage.style.fontSize = '14px';
    document.body.appendChild(statusMessage);
    // Fjern meldingen etter noen sekunder (ikke for feil)
    if (!isError) {
        setTimeout(() => {
            if (statusMessage && statusMessage.parentNode) {
                statusMessage.parentNode.removeChild(statusMessage);
            }
        }, 4000); // Vis i 4 sekunder
    }
  }

  // Funksjon for å fjerne statusmelding
  function hideStatus() {
      if (statusMessage && statusMessage.parentNode) {
          statusMessage.parentNode.removeChild(statusMessage);
      }
  }


  return new Promise((resolve, reject) => {
    showStatus("Sender data...");

    const formData = new FormData();
    for (const key in data) {
      // Google Apps Script håndterer vanligvis ikke FormData-objekter direkte som JSON,
      // så vi sender som strenger. Scriptet må parse tall etc.
      formData.append(key, data[key]);
    }

    // --- 1. Forsøk: POST med 'no-cors' ---
    // Raskeste hvis scriptet er satt opp for POST og vi ikke trenger svar.
    console.log("Metode 1: Forsøker POST (no-cors)");
    fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors', // Viktig: Vi får ikke lest svaret, men kallet går gjennom hvis scriptet tillater det.
      body: formData
    })
    .then(response => {
      // Med no-cors er response.ok etc. alltid false/tom. Vi *antar* suksess hvis kallet ikke kastet feil.
      console.log("POST (no-cors) fullført (antar suksess).");
      hideStatus();
      resolve({ success: true, message: successMessage || "Handlingen ble utført (POST)." });
    })
    .catch(error => {
      console.warn("POST (no-cors) feilet:", error, "- Prøver GET.");
      // Gå videre til neste metode ved feil (f.eks. nettverksfeil, eller hvis scriptet krever CORS-headers)
      tryGetMethod();
    });

    // --- 2. Forsøk: GET med parametere ---
    // Fungerer hvis scriptet håndterer GET og returnerer JSONP eller standard JSON med riktige CORS-headers.
    function tryGetMethod() {
        showStatus("Sender data (Metode 2)...");
        const params = new URLSearchParams();
        for (const key in data) {
            params.append(key, data[key]);
        }
        const getUrl = `${GOOGLE_SCRIPT_URL}?${params.toString()}`;
        console.log("Metode 2: Forsøker GET:", getUrl.substring(0, 200) + "..."); // Logg forkortet URL

        fetch(getUrl) // Standard GET
            .then(response => {
                console.log("GET respons status:", response.status);
                if (!response.ok) {
                    // Kast feil hvis status ikke er 2xx
                    throw new Error(`HTTP error ${response.status} (${response.statusText})`);
                }
                // Prøv å parse som JSON. Google Apps Script returnerer ofte Content-Type 'text/plain'
                // selv om innholdet er JSON, så vi må kanskje parse manuelt.
                return response.text(); // Les som tekst først
            })
            .then(text => {
                 console.log("GET respons tekst:", text);
                try {
                    const jsonData = JSON.parse(text);
                    if (jsonData && jsonData.success) {
                         console.log("GET vellykket med JSON-svar:", jsonData);
                         hideStatus();
                         resolve(jsonData); // Bruk svaret fra serveren
                    } else {
                         // Svaret var JSON, men indikerte ikke suksess
                        throw new Error(jsonData.message || "Server rapporterte feil (GET).");
                    }
                } catch (e) {
                    // Hvis parsing feiler, var det kanskje ikke JSON.
                    console.warn("Kunne ikke parse GET-svar som JSON:", e);
                    // Google Scripts returnerer noen ganger HTML ved feil, eller enkel tekst.
                    // Vi kan ikke bekrefte suksess, så vi går videre.
                    throw new Error("Uventet svarformat fra server (GET).");
                }
            })
            .catch(error => {
                console.warn("GET feilet:", error, "- Prøver iframe POST.");
                tryIframeMethod(); // Gå til siste fallback
            });
    }


    // --- 3. Forsøk: Skjult iframe med POST ---
    // En "gammeldags" metode for cross-domain POST som ofte fungerer når annet feiler.
    function tryIframeMethod() {
        showStatus("Sender data (Metode 3)...");
        const iframeId = 'hidden-comm-iframe-' + Date.now();
        const formId = 'hidden-comm-form-' + Date.now();
        console.log("Metode 3: Forsøker iframe POST");

        let iframe = document.getElementById(iframeId);
        if (iframe) iframe.parentNode.removeChild(iframe); // Fjern gammel hvis den finnes

        iframe = document.createElement('iframe');
        iframe.id = iframeId;
        iframe.name = iframeId;
        iframe.style.display = 'none';
        document.body.appendChild(iframe);

        let form = document.getElementById(formId);
         if (form) form.parentNode.removeChild(form); // Fjern gammel

        form = document.createElement('form');
        form.id = formId;
        form.method = 'POST';
        form.action = GOOGLE_SCRIPT_URL;
        form.target = iframeId; // Send til iframen

        for (const key in data) {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = key;
            input.value = data[key];
            form.appendChild(input);
        }
        document.body.appendChild(form);

        let cleanupPerformed = false;
        const cleanup = () => {
            if (cleanupPerformed) return;
            cleanupPerformed = true;
            clearTimeout(timeoutId); // Stopp timeout
            if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
            if (form && form.parentNode) form.parentNode.removeChild(form);
             console.log("iframe/form ryddet opp.");
        };

        // Timeout hvis iframen ikke laster innen 20 sekunder
        const timeoutId = setTimeout(() => {
            console.error("Iframe POST timed out.");
            cleanup();
            showStatus("Tidsavbrudd. Handlingen kan ha feilet.", true);
            reject(new Error('Forespørselen via iframe tok for lang tid.'));
        }, 20000);

        // 'load'-eventet på iframen indikerer at serveren har svart (men vi kan ikke lese svaret).
        iframe.onload = () => {
             console.log("Iframe 'load' event mottatt (antar suksess).");
             cleanup();
             hideStatus();
             resolve({ success: true, message: successMessage || "Handlingen ble utført (iframe)." });
        };

         iframe.onerror = (err) => {
            console.error("Iframe 'error' event mottatt:", err);
            cleanup();
            showStatus("Feil under sending (Metode 3).", true);
            reject(new Error('Kommunikasjonsfeil via iframe.'));
        };


        console.log("Sender skjult form til iframe...");
        form.submit();
    }

  }); // End Promise
}


// --- Testfunksjon for tilkobling ---
function testConnection() {
  const url = GOOGLE_SCRIPT_URL + '?action=ping'; // Bruk en enkel action
  console.log("Tester URL:", url);
  alert("Tester tilkobling til Google Script...\nSe konsollen (F12) for detaljer.");

   // Bruk sendDataToGoogleScript for å teste alle metoder om nødvendig
  sendDataToGoogleScript({ action: 'ping' }, "Tilkobling OK!")
      .then(response => {
          console.log("Test Suksess:", response);
           let message = "Tilkobling vellykket!\n\n";
           if (response && response.message) {
               message += "Melding fra server: " + response.message;
               if (response.details) { // Hvis scriptet sender ekstra info
                   message += "\nDetaljer: " + JSON.stringify(response.details);
               }
           } else {
               message += "(Ingen detaljert respons mottatt, men kallet ser ut til å ha gått gjennom)";
           }
           alert(message);
      })
      .catch(error => {
          console.error("Test Tilkoblingsfeil:", error);
          alert("Tilkoblingstest FEIL:\n\n" + error.message + "\n\nSjekk konsollen (F12) for mer info og se mulige årsaker i tidligere feilmeldinger.");
      });

}
