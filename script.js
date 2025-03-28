// Debounce-funksjon for å unngå doble innsendinger
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

// Google Script URL - Bytt ut med din egen URL fra Google Apps Script
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwqyXgiMfgStUhO0LEjT5v2PfBWQuluMdEcZeHrMrtX7-9l13j3FxT_6PnuFw9Ei4ey/exec';

// Store active timers and their data
const timers = {};
let activeBox = null;
let customers = [];
let newCustomerTimer = null;
let isAutoRefreshPaused = false;
let isSubmitting = false; // Flagg for å unngå doble innsendinger

// Opprett en debounced versjon av submitTime-funksjonen
const debouncedSubmitTime = debounce(submitTime, 500); // 500ms ventetid

// Load customer data when page loads
document.addEventListener('DOMContentLoaded', function() {
  console.log("DOM lastet, initialiserer app");
  
  // Set current date in header
  updateCurrentDate();
  
  // Load customer data
  loadCustomers();
  
  // Start auto-refresh
  startAutoRefresh();
  
  // Legg til globale event listeners
  addGlobalEventListeners();
});

// Legg til globale event listeners
function addGlobalEventListeners() {
  console.log("Legger til event listeners");
  
  // Fikser kommentar-skjema knappen
  const submitButton = document.querySelector('#commentModal .submit-btn');
  if (submitButton) {
    // Bruk den debouncede versjonen av submitTime for å unngå doble innsendinger
    submitButton.addEventListener('click', function() {
      debouncedSubmitTime();
    });
  }
  
  // Fikser ny kunde-skjema knappen
  const createCustomerButton = document.querySelector('#newCustomerModal .submit-btn');
  if (createCustomerButton) {
    createCustomerButton.addEventListener('click', function() {
      createNewCustomer();
    });
  }
  
  // Fikser rediger kunde-skjema knappen
  const updateCustomerButton = document.querySelector('#editCustomerModal .submit-btn');
  if (updateCustomerButton) {
    updateCustomerButton.addEventListener('click', function() {
      updateCustomer();
    });
  }
  
  // Fikser slett kunde-skjema knappen
  const deleteCustomerButton = document.querySelector('#confirmDeleteModal .delete-btn');
  if (deleteCustomerButton) {
    deleteCustomerButton.addEventListener('click', function() {
      deleteCustomer();
    });
  }
  
  // Fikser avbryt-knapper
  document.querySelectorAll('.cancel-btn, .close').forEach(btn => {
    btn.addEventListener('click', function() {
      const modalId = this.closest('.modal').id;
      closeModal(modalId);
    });
  });
  
  // Fikser "Oppdater data"-knappen
  const refreshButton = document.getElementById('refresh-button');
  if (refreshButton) {
    refreshButton.addEventListener('click', function() {
      fetchCustomerData();
    });
  }
}

// Update the current date display
function updateCurrentDate() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('current-date').textContent = now.toLocaleDateString('no-NO', options);
}

// Load customer data from Google Sheets
function loadCustomers() {
  console.log("Laster kundedata");
  fetchCustomerData();
}

// Funksjon for å regelmessig oppdatere kundedata
function startAutoRefresh() {
  console.log("Starter auto-refresh");
  // Oppdater kundedata hvert 30. sekund
  setInterval(() => {
    // Bare oppdater data hvis ingen timer er aktiv
    if (!isAutoRefreshPaused) {
      fetchCustomerData();
    }
  }, 30000); // 30000 ms = 30 sekunder
}

function fetchCustomerData() {
  console.log("Henter kundedata");
  // Gi tilbakemelding til brukeren om at data hentes
  document.getElementById('last-updated').textContent = 'Henter data...';
  
  // Først, prøv direkte fetch siden det er enklere å feilsøke
  fetchCustomersDirect()
    .catch(error => {
      console.warn('Direct fetch failed, trying JSONP:', error);
      return fetchCustomersWithJSONP();
    })
    .catch(error => {
      console.error('All connection attempts failed:', error);
      useMockData();
    });
}

// JSONP-metode for å unngå CORS-problemer
function fetchCustomersWithJSONP() {
  console.log("Starter JSONP-forespørsel til:", GOOGLE_SCRIPT_URL);
  
  return new Promise((resolve, reject) => {
    const callbackName = 'googleScriptCallback_' + Math.floor(Math.random() * 1000000);
    const url = `${GOOGLE_SCRIPT_URL}?action=getCustomers&callback=${callbackName}`;
    
    console.log("JSONP URL:", url);
    
    // Sett timeout for å håndtere feiling
    const timeoutId = setTimeout(() => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
      delete window[callbackName];
      reject(new Error('JSONP request timed out after 10 seconds'));
    }, 10000);
    
    // Lag en global callback-funksjon
    window[callbackName] = function(data) {
      console.log("JSONP callback mottatt data:", data);
      clearTimeout(timeoutId);
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
      delete window[callbackName];
      
      if (data && data.success) {
        processCustomerData(data);
        resolve(data);
      } else {
        reject(new Error('Invalid response from Google Script'));
      }
    };
    
    // Opprett script-element
    const script = document.createElement('script');
    script.src = url;
    script.onerror = function(error) {
      console.error("JSONP script feil:", error);
      clearTimeout(timeoutId);
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
      delete window[callbackName];
      reject(new Error('JSONP script loading failed'));
    };
    
    // Legg til script på siden
    document.body.appendChild(script);
    console.log("JSONP script lagt til i DOM");
  });
}

// Direkte fetch-metode
function fetchCustomersDirect() {
  const url = `${GOOGLE_SCRIPT_URL}?action=getCustomers`;
  console.log("Direkte fetch URL:", url);
  
  return fetch(url)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json(); // Bruk json() direkte for å unngå manuell parsing
    })
    .then(data => {
      if (data && data.success && Array.isArray(data.customers)) {
        processCustomerData(data);
        return data;
      } else {
        throw new Error('Ugyldig respons fra Google Script');
      }
    })
    .catch(error => {
      console.error("Feil ved henting av kundedata:", error);
      throw error;
    });
}

// Behandle kundedata etter vellykket henting
function processCustomerData(data) {
  console.log("Behandler kundedata:", data);
  
  // Sjekk om data inneholder customers-array
  if (!data.customers || !Array.isArray(data.customers)) {
    console.error("Ugyldig kundedata-format:", data);
    alert("Feil format på kundedata fra serveren.");
    return;
  }
  
  // Sort customers alphabetically
  customers = data.customers.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
  
  // Render the customer boxes
  renderCustomers();
  
  // Update last updated time
  const now = new Date();
  document.getElementById('last-updated').textContent = now.toLocaleTimeString('nb-NO');
  
  console.log("Kundedata lastet vellykket:", customers.length, "kunder");
}

// Funksjon for å bruke testdata
function useMockData() {
  console.log('Fallback to mock data for testing');
  const mockCustomerData = [
    { name: "Kunde 1 AS", availableHours: 40 },
    { name: "Kunde 3 AS", availableHours: 25 },
    { name: "Kunde 2 AS", availableHours: 60 },
    { name: "Kunde 4 AS", availableHours: 15 }
  ];
  
  // Sort customers alphabetically
  customers = mockCustomerData.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
  
  // Render the customer boxes
  renderCustomers();
  
  // Update last updated time with error indication
  document.getElementById('last-updated').textContent = 'Frakoblet modus';
  
  // Vise en mer brukervennlig feilmelding
  const errorMessage = "Kunne ikke koble til Google Sheets. Bruker testdata i frakoblet modus. Kontroller at:\n" +
                       "1. Google Apps Script URL-en er korrekt\n" +
                       "2. Skriptet er publisert som en webapplikasjon\n" +
                       "3. Skriptet har tilgangsrettighetene 'Alle, inkludert anonyme'";
  
  alert(errorMessage);
}

function renderCustomers() {
  console.log("Rendrer kunder:", customers.length);
  
  try {
    const container = document.getElementById('customer-container');
    if (!container) {
      console.error("Kunne ikke finne customer-container element");
      return;
    }
    
    // Find any active timer
    const activeCustomerId = activeBox ? activeBox.getAttribute('data-id') : null;
    
    // Clear existing customer boxes, but keep the "add customer" button
    const addCustomerButton = document.getElementById('add-customer-box');
    if (!addCustomerButton) {
      console.error("Kunne ikke finne add-customer-box element");
      return;
    }
    
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(addCustomerButton);
    
    // Add all customers in alphabetical order
    if (!customers || !Array.isArray(customers) || customers.length === 0) {
      console.warn("Ingen kunder å vise");
      return;
    }
    
    customers.forEach((customer, index) => {
      const customerBox = document.createElement('div');
      customerBox.className = 'customer-box';
      customerBox.setAttribute('data-id', index + 1);
      
      // Create customer content
      const nameDiv = document.createElement('div');
      nameDiv.className = 'customer-name';
      nameDiv.textContent = customer.name;
      
      const hoursDiv = document.createElement('div');
      hoursDiv.className = 'available-hours';
      hoursDiv.textContent = `Timer tilgjengelig: ${customer.availableHours.toFixed(1)}`;
      
      const timerDiv = document.createElement('div');
      timerDiv.className = 'timer';
      
      const statusDiv = document.createElement('div');
      statusDiv.className = 'status';
      
      // If this is the active customer, restore timer state
      if (activeCustomerId && parseInt(activeCustomerId) === index + 1) {
        customerBox.classList.add('active');
        statusDiv.textContent = 'Aktiv';
        
        // Calculate elapsed time for this timer
        if (timers[activeCustomerId] && timers[activeCustomerId].startTime) {
          const elapsedTime = new Date() - timers[activeCustomerId].startTime;
          timerDiv.textContent = formatTime(elapsedTime);
        } else {
          timerDiv.textContent = '00:00:00';
        }
        
        // Update activeBox reference
        activeBox = customerBox;
      } else {
        timerDiv.textContent = '00:00:00';
        statusDiv.textContent = 'Inaktiv';
      }
      
      // Create action buttons container
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'customer-actions';
      
      // Create edit button
      const editBtn = document.createElement('button');
      editBtn.className = 'customer-action-btn';
      editBtn.title = 'Rediger kunde';
      editBtn.innerHTML = '✏️';
      editBtn.onclick = function(e) {
        e.stopPropagation();
        showEditCustomer(index);
      };
      
      // Create delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'customer-action-btn';
      deleteBtn.title = 'Slett kunde';
      deleteBtn.innerHTML = '🗑️';
      deleteBtn.onclick = function(e) {
        e.stopPropagation();
        confirmDeleteCustomer(index);
      };
      
      // Append buttons to actions div
      actionsDiv.appendChild(editBtn);
      actionsDiv.appendChild(deleteBtn);
      
      // Append all elements to customer box
      customerBox.appendChild(nameDiv);
      customerBox.appendChild(hoursDiv);
      customerBox.appendChild(timerDiv);
      customerBox.appendChild(statusDiv);
      customerBox.appendChild(actionsDiv);
      
      // Add click handler for timer
      customerBox.onclick = function(e) {
        if (e.target === editBtn || e.target === deleteBtn || e.target === actionsDiv) {
          return; // Don't toggle timer if clicking on buttons
        }
        toggleTimer(this);
      };
      
      container.appendChild(customerBox);
    });
  } catch (error) {
    console.error("Feil i renderCustomers:", error);
  }
}

function toggleTimer(box) {
  try {
    if (!box) {
      console.error("box er null i toggleTimer");
      return;
    }
    
    const customerId = box.getAttribute('data-id');
    if (!customerId) {
      console.error("Manglende data-id attributt på box");
      return;
    }
    
    const timerDisplay = box.querySelector('.timer');
    const statusDisplay = box.querySelector('.status');
    const nameElement = box.querySelector('.customer-name');
    
    if (!timerDisplay || !statusDisplay || !nameElement) {
      console.error("Manglende elementer i customer-box");
      return;
    }
    
    const customerName = nameElement.textContent;
    
    // If this box is already active, stop the timer and show comment modal
    if (box.classList.contains('active')) {
      if (timers[customerId] && timers[customerId].interval) {
        clearInterval(timers[customerId].interval);
      }
      
      box.classList.remove('active');
      statusDisplay.textContent = 'Inaktiv';
      isAutoRefreshPaused = false; // Resume auto-refresh
      
      // Calculate time spent
      const endTime = new Date();
      let timeSpent = 0;
      let timeSpentFormatted = '00:00:00';
      
      if (timers[customerId] && timers[customerId].startTime) {
        timeSpent = endTime - timers[customerId].startTime;
        timeSpentFormatted = formatTime(timeSpent);
      }
      
      // Show comment modal
      const modal = document.getElementById('commentModal');
      if (!modal) {
        console.error("Kunne ikke finne commentModal");
        return;
      }
      
      const modalCustomerName = document.getElementById('modal-customer-name');
      const modalTimeSpent = document.getElementById('modal-time-spent');
      const commentText = document.getElementById('comment-text');
      
      if (!modalCustomerName || !modalTimeSpent || !commentText) {
        console.error("Manglende elementer i commentModal");
        return;
      }
      
      modalCustomerName.textContent = customerName;
      modalTimeSpent.textContent = 'Tid brukt: ' + timeSpentFormatted;
      
      // Clear any previous comment
      commentText.value = '';
      
      modal.style.display = 'block';
      
      // Save data for submission
      if (!timers[customerId]) {
        timers[customerId] = {};
      }
      
      timers[customerId].endTime = endTime;
      timers[customerId].timeSpentFormatted = timeSpentFormatted;
      timers[customerId].timeSpentMs = timeSpent;
      activeBox = null;
    } else {
      // If another box is active (including new customer), deactivate it first
      if (activeBox) {
        toggleTimer(activeBox);
      } else {
        const addCustomerBox = document.getElementById('add-customer-box');
        if (addCustomerBox && addCustomerBox.classList.contains('active')) {
          stopNewCustomerTimer();
        }
      }
      
      // Pause auto-refresh when a timer is active
      isAutoRefreshPaused = true;
      
      // Start a new timer
      box.classList.add('active');
      statusDisplay.textContent = 'Aktiv';
      
      const startTime = new Date();
      timers[customerId] = {
        startTime: startTime,
        customerName: customerName,
        interval: setInterval(() => {
          const currentTime = new Date();
          const elapsedTime = currentTime - startTime;
          timerDisplay.textContent = formatTime(elapsedTime);
        }, 1000)
      };
      
      activeBox = box;
    }
  } catch (error) {
    console.error("Feil i toggleTimer:", error);
  }
}

function startNewCustomerTimer() {
  // If there's an active timer for an existing customer, stop it
  if (activeBox) {
    toggleTimer(activeBox);
    return;
  }
  
  // If the new customer timer is already active, stop it
  const addCustomerBox = document.getElementById('add-customer-box');
  if (addCustomerBox.classList.contains('active')) {
    stopNewCustomerTimer();
    return;
  }
  
  // Pause auto-refresh when a timer is active
  isAutoRefreshPaused = true;
  
  // Start the new customer timer
  addCustomerBox.classList.add('active');
  const timerDisplay = document.getElementById('new-customer-timer');
  
  const startTime = new Date();
  newCustomerTimer = {
    startTime: startTime,
    interval: setInterval(() => {
      const currentTime = new Date();
      const elapsedTime = currentTime - startTime;
      timerDisplay.textContent = formatTime(elapsedTime);
    }, 1000)
  };
}

function stopNewCustomerTimer() {
  if (!newCustomerTimer) return;
  
  clearInterval(newCustomerTimer.interval);
  const addCustomerBox = document.getElementById('add-customer-box');
  addCustomerBox.classList.remove('active');
  isAutoRefreshPaused = false; // Resume auto-refresh
  
  // Calculate time spent
  const endTime = new Date();
  const timeSpent = endTime - newCustomerTimer.startTime;
  const timeSpentFormatted = formatTime(timeSpent);
  
  // Show the new customer modal
  const modal = document.getElementById('newCustomerModal');
  document.getElementById('new-customer-time-spent').textContent = 'Tid brukt: ' + timeSpentFormatted;
  
  // Clear any previous values
  document.getElementById('new-customer-name').value = '';
  document.getElementById('new-customer-hours').value = '';
  document.getElementById('new-customer-comment').value = '';
  
  modal.style.display = 'block';
  
  // Save time data for later use
  newCustomerTimer.endTime = endTime;
  newCustomerTimer.timeSpentFormatted = timeSpentFormatted;
  newCustomerTimer.timeSpentMs = timeSpent;
}

function formatTime(ms) {
  let seconds = Math.floor(ms / 1000);
  let minutes = Math.floor(seconds / 60);
  let hours = Math.floor(minutes / 60);
  
  seconds = seconds % 60;
  minutes = minutes % 60;
  
  return `${padZero(hours)}:${padZero(minutes)}:${padZero(seconds)}`;
}

function padZero(num) {
  return num.toString().padStart(2, '0');
}

function closeModal(modalId) {
  document.getElementById(modalId).style.display = 'none';
  if (modalId === 'commentModal') {
    document.getElementById('comment-text').value = '';
  }
}

function calculateHoursFromMs(ms) {
  // Convert milliseconds to decimal hours
  const rawHours = ms / (1000 * 60 * 60);
  
  // For logging in Google Sheets, round to quarter hours (0.25)
  // e.g., 15 min = 0.25, 30 min = 0.5, 45 min = 0.75
  return Math.round(rawHours * 4) / 4;
}

function submitTime() {
  console.log("Starter innsending av tid");
  
  // Unngå doble innsendinger med en enkel lås
  if (isSubmitting) {
    console.log("Innsending pågår allerede, ignorerer duplikat klikk");
    return;
  }
  
  // Sett låseflagg
  isSubmitting = true;
  
  // Deaktiver knappen for å hindre flere klikk
  const submitButton = document.querySelector('#commentModal .submit-btn');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Sender...';
  }
  
  try {
    // Hent data fra modal-elementer
    const customerName = document.getElementById('modal-customer-name').textContent;
    const timeSpentText = document.getElementById('modal-time-spent').textContent;
    
    console.log("Kunde:", customerName, "Tid brukt:", timeSpentText);
    
    // Finn kunden basert på navn (uavhengig av activeBox)
    const customerIndex = customers.findIndex(c => c.name === customerName);
    
    if (customerIndex === -1) {
      console.error('Kunne ikke finne kunde:', customerName);
      alert('Kunne ikke finne kunden. Prøv å starte timeren på nytt.');
      closeModal('commentModal');
      isSubmitting = false; // Frigjør låsen
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Lagre og avslutt';
      }
      return;
    }
    
    // Finn customerId (indeks + 1)
    const customerId = customerIndex + 1;
    console.log("Customer ID:", customerId);
    
    // Finn timer-data eller opprett det hvis det mangler
    if (!timers[customerId]) {
      console.log("Oppretter timer-data for kunde");
      // Hent tid fra tekst (f.eks. "Tid brukt: 00:10:30")
      const timeMatch = timeSpentText.match(/(\d{2}):(\d{2}):(\d{2})$/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const seconds = parseInt(timeMatch[3]);
        const totalMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
        
        // Lager dummy timer-data
        timers[customerId] = {
          customerName: customerName,
          timeSpentMs: totalMs,
          timeSpentFormatted: `${padZero(hours)}:${padZero(minutes)}:${padZero(seconds)}`,
          startTime: new Date(new Date().getTime() - totalMs),
          endTime: new Date()
        };
      } else {
        console.error('Kunne ikke parse tidstekst:', timeSpentText);
        alert('Kunne ikke lese tidsinformasjon. Prøv å starte timeren på nytt.');
        closeModal('commentModal');
        isSubmitting = false; // Frigjør låsen
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'Lagre og avslutt';
        }
        return;
      }
    }
    
    const comment = document.getElementById('comment-text').value;
    
    // Get current date
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${padZero(now.getMonth() + 1)}-${padZero(now.getDate())}`;
    
    // Calculate decimal hours (rounded to quarter hours)
    const decimalHours = calculateHoursFromMs(timers[customerId].timeSpentMs);
    
    // Get customer's total sold hours and remaining hours
    let soldHours = 0;
    let remainingHours = 0;
    
    if (customerIndex >= 0 && customerIndex < customers.length) {
      // Calculate total and remaining hours
      soldHours = customers[customerIndex].availableHours + decimalHours; // Original hours before this session
      remainingHours = Math.max(0, customers[customerIndex].availableHours - decimalHours); // Remaining after this session
      
      // Update local data immediately
      customers[customerIndex].availableHours = remainingHours;
    }
    
    // Prepare the data to be sent to Google Sheets
    const data = {
      action: "logTime",
      customerName: customerName,
      timeSpent: decimalHours,
      soldHours: soldHours,
      remainingHours: remainingHours,
      comment: comment,
      date: dateStr
    };
    
    console.log("Sender tidsdata til server:", data);
    
    // Forbedret metode for å sende data til Google Apps Script
    sendDataToGoogleScript(data, 'Tid registrert')
      .then((response) => {
        console.log("Tidsregistrering vellykket:", response);
        
        // Lukk modalvinduet først
        closeModal('commentModal');
        
        // Fjern referansen til aktiv boks
        activeBox = null;
        
        // Hent oppdaterte data fra serveren
        fetchCustomerData();

        // Oppdater tilgjengelige timer lokalt med det nye antallet
        customers = customers.map(customer => {
          if (customer.name === customerName) {
            customer.availableHours = Math.max(0, customer.availableHours - decimalHours);
          }
          return customer;
        });

        // Re-render kundeboksene med oppdaterte timer
        renderCustomers();

        // Vis bekreftelse
        alert('Timer lagret for ' + data.customerName + '!');
      })
      .catch(error => {
        console.error('Error logging time:', error);
        alert('Kunne ikke lagre tid: ' + error.message);
      })
      .finally(() => {
        // Frigjør låsen og reaktiver knappen uansett resultat
        isSubmitting = false;
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'Lagre og avslutt';
        }
      });
  } catch (error) {
    console.error("Feil i submitTime:", error);
    alert('En feil oppstod: ' + error.message);
    closeModal('commentModal');
    
    // Frigjør låsen og reaktiver knappen ved feil
    isSubmitting = false;
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Lagre og avslutt';
    }
  }
}

function cancelNewCustomer() {
  // Stopp timeren først
  if (newCustomerTimer) {
    clearInterval(newCustomerTimer.interval);
    newCustomerTimer = null;
    document.getElementById('add-customer-box').classList.remove('active');
    document.getElementById('new-customer-timer').textContent = '00:00:00';
  }
  
  // Lukk modalvinduet
  closeModal('newCustomerModal');
}

function showEditCustomer(index) {
  const customer = customers[index];
  
  // Fill the edit form with current values
  document.getElementById('edit-customer-name').value = customer.name;
  document.getElementById('edit-customer-hours').value = customer.availableHours.toFixed(1);
  document.getElementById('edit-customer-id').value = index;
  
  // Show the modal
  document.getElementById('editCustomerModal').style.display = 'block';
}

function createNewCustomer() {
  console.log("Starter opprettelse av ny kunde");
  
  const customerName = document.getElementById('new-customer-name').value.trim();
  const availableHours = parseFloat(document.getElementById('new-customer-hours').value);
  const comment = document.getElementById('new-customer-comment').value.trim();
  
  // Validate input
  if (!customerName) {
    alert('Vennligst skriv inn et kundenavn');
    return;
  }
  
  if (isNaN(availableHours) || availableHours <= 0) {
    alert('Vennligst skriv inn et gyldig antall timer');
    return;
  }
  
  // Sjekk om newCustomerTimer finnes
  if (!newCustomerTimer) {
    console.warn('newCustomerTimer mangler, oppretter ny kunde uten timer');
    // Fortsett uten timer-data
    newCustomerTimer = {
      timeSpentMs: 0,
      timeSpentFormatted: '00:00:00'
    };
  }
  
  // Calculate decimal hours (rounded to quarter hours)
  const decimalHours = calculateHoursFromMs(newCustomerTimer.timeSpentMs);
  
  // Prepare data for the new customer
  const data = {
    action: "addCustomer", // Endre fra "createCustomer" til "addCustomer" for å matche Google Apps Script
    customerName: customerName,
    availableHours: availableHours,
    timeSpent: decimalHours,
    comment: comment,
    date: new Date().toISOString().slice(0, 10)
  };
  
  console.log("Sender ny kunde-data til server:", data);
  
  // Send data to Google Sheets with improved method
  sendDataToGoogleScript(data, 'Ny kunde opprettet')
    .then((response) => {
      console.log("Ny kunde opprettet vellykket:", response);
      
      // Add the new customer to the local array
      customers.push({
        name: customerName,
        availableHours: availableHours - decimalHours // Subtract the time already spent
      });
      
      // Sort customers alphabetically
      customers.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
      
      // Reset the timer display
      document.getElementById('new-customer-timer').textContent = '00:00:00';
      
      // Close the modal
      closeModal('newCustomerModal');
      
      // Reset the add customer box
      document.getElementById('add-customer-box').classList.remove('active');
      
      // Clear the form
      document.getElementById('new-customer-name').value = '';
      document.getElementById('new-customer-hours').value = '';
      document.getElementById('new-customer-comment').value = '';
      
      // Reset the newCustomerTimer
      newCustomerTimer = null;
      
      // Re-render the customers
      renderCustomers();
      
      // Show confirmation
      alert('Ny kunde opprettet: ' + customerName);
    })
    .catch(error => {
      console.error('Error creating customer:', error);
      alert('Kunne ikke opprette kunde: ' + error.message);
    });
}

function updateCustomer() {
  console.log("Starter oppdatering av kunde");
  
  const index = document.getElementById('edit-customer-id').value;
  const customerName = document.getElementById('edit-customer-name').value.trim();
  const availableHours = parseFloat(document.getElementById('edit-customer-hours').value);
  
  // Validate input
  if (!customerName) {
    alert('Vennligst skriv inn et kundenavn');
    return;
  }
  
  if (isNaN(availableHours) || availableHours < 0) {
    alert('Vennligst skriv inn et gyldig antall timer');
    return;
  }
  
  // Prepare data for the update
  const data = {
    action: "updateCustomer",
    oldName: customers[index].name,
    customerName: customerName,
    availableHours: availableHours
  };
  
  console.log("Sender kundeoppdatering til server:", data);
  
  // Send data to Google Sheets with improved method
  sendDataToGoogleScript(data, 'Kunde oppdatert')
    .then((response) => {
      console.log("Kunde oppdatert vellykket:", response);
      
      // Update the local data
      customers[index].name = customerName;
      customers[index].availableHours = availableHours;
      
      // Sort customers alphabetically
      customers.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
      
      // Close the modal
      closeModal('editCustomerModal');
      
      // Re-render the customers
      renderCustomers();
      
      // Show confirmation
      alert('Kunde oppdatert: ' + customerName);
    })
    .catch(error => {
      console.error('Error updating customer:', error);
      alert('Kunne ikke oppdatere kunde: ' + error.message);
    });
}

function confirmDeleteCustomer(index) {
  const customer = customers[index];
  
  // Fill the confirmation modal
  document.getElementById('delete-customer-name').textContent = customer.name;
  document.getElementById('delete-customer-id').value = index;
  
  // Show the modal
  document.getElementById('confirmDeleteModal').style.display = 'block';
}

function deleteCustomer() {
  console.log("Starter sletting av kunde");
  
  const index = document.getElementById('delete-customer-id').value;
  const customerName = customers[index].name;
  
  // Prepare data for the delete
  const data = {
    action: "deleteCustomer",
    customerName: customerName
  };
  
  console.log("Sender kundesletting til server:", data);
  
  // Send data to Google Sheets with improved method
  sendDataToGoogleScript(data, 'Kunde slettet')
    .then((response) => {
      console.log("Kunde slettet vellykket:", response);
      
      // Remove from local array
      customers.splice(index, 1);
      
      // Close the modal
      closeModal('confirmDeleteModal');
      
      // Re-render the customers
      renderCustomers();
      
      // Show confirmation
      alert('Kunde slettet: ' + customerName);
    })
    .catch(error => {
      console.error('Error deleting customer:', error);
      alert('Kunne ikke slette kunde: ' + error.message);
    });
}

// Forbedret metode for å sende data til Google Apps Script
function sendDataToGoogleScript(data, successMessage) {
  return new Promise((resolve, reject) => {
    // Variabler som skal være tilgjengelige for cleanup-funksjonen
    let formId = null;
    let iframeId = null;
    let statusMessage = null;
    
    // Vis status til brukeren
    statusMessage = document.createElement('div');
    statusMessage.textContent = 'Sender data...';
    statusMessage.style.position = 'fixed';
    statusMessage.style.top = '10px';
    statusMessage.style.right = '10px';
    statusMessage.style.padding = '10px';
    statusMessage.style.background = 'rgba(0, 0, 0, 0.7)';
    statusMessage.style.color = '#fff';
    statusMessage.style.borderRadius = '5px';
    statusMessage.style.zIndex = '9999';
    document.body.appendChild(statusMessage);
    
    // Konvertere alle objekter til JSON-strenger
    const processedData = {};
    for (const key in data) {
      processedData[key] = typeof data[key] === 'object' ? JSON.stringify(data[key]) : data[key];
    }
    
    // Opprett formdata
    const formData = new FormData();
    for (const key in processedData) {
      formData.append(key, processedData[key]);
    }
    
    // Bruk POST-metode først (mest pålitelig)
    console.log("Forsøker å sende data med POST-metode:", GOOGLE_SCRIPT_URL);
    
    fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      body: formData,
      mode: 'no-cors' // Viktig for cross-origin requests
    })
    .then(response => {
      // Med no-cors kan vi ikke lese responsen, så vi antar suksess
      console.log("POST respons mottatt (no-cors, kan ikke verifisere innhold)");
      cleanup();
      resolve({ success: true, message: successMessage });
    })
    .catch(error => {
      console.error("POST-metode feilet, fallback til GET:", error);
      tryGetMethod();
    });
    
    // Fallback-metode med GET
    function tryGetMethod() {
      // Forbered URL med parametere
      const params = new URLSearchParams();
      for (const key in processedData) {
        params.append(key, processedData[key]);
      }
      const getUrl = `${GOOGLE_SCRIPT_URL}?${params.toString()}`;
      
      console.log("Forsøker å sende data med GET-metode:", getUrl);
      
      fetch(getUrl)
        .then(response => {
          console.log("GET-respons mottatt:", response);
          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
          return response.text();
        })
        .then(text => {
          try {
            console.log("Responstekst:", text);
            let data;
            try {
              data = JSON.parse(text);
            } catch (e) {
              // Hvis teksten ikke er gyldig JSON, prøv å ekstrahere JSON fra teksten
              const jsonMatch = text.match(/(\{.*\})/);
              if (jsonMatch) {
                data = JSON.parse(jsonMatch[1]);
              } else {
                throw new Error('Kunne ikke tolke respons fra serveren');
              }
            }
            
            if (data && data.success) {
              cleanup();
              resolve(data);
            } else {
              throw new Error(data.message || 'Ukjent feil');
            }
          } catch (e) {
            console.error("Feil ved parsing av respons:", e);
            tryIframeMethod();
          }
        })
        .catch(error => {
          console.error("GET-metode feilet, fallback til iframe:", error);
          tryIframeMethod();
        });
    }
    
    // Fallback-metode med iframe
    function tryIframeMethod() {
      formId = 'hidden-form-' + Math.random().toString(36).substring(2);
      iframeId = 'hidden-iframe-' + Math.random().toString(36).substring(2);
      
      console.log("Forsøker å sende data med iframe-metode");
      
      // Opprett iframe
      const iframe = document.createElement('iframe');
      iframe.id = iframeId;
      iframe.name = iframeId;
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      
      // Opprett form
      const form = document.createElement('form');
      form.id = formId;
      form.method = 'POST';
      form.action = GOOGLE_SCRIPT_URL;
      form.target = iframeId;
      
      // Legg til data i form
      for (const key in processedData) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = processedData[key];
        form.appendChild(input);
      }
      
      document.body.appendChild(form);
      
      // Håndter timeout
      const timeoutId = setTimeout(() => {
        console.error("Iframe-metode tidsavbrutt");
        cleanup();
        reject(new Error('Forespørselen tok for lang tid. Sjekk nettverksforbindelsen din.'));
      }, 20000); // 20 sekunder timeout
      
      // Håndter suksess
      iframe.onload = function() {
        clearTimeout(timeoutId);
        console.log("Iframe lastet");
        // Anta suksess siden vi faktisk ikke kan lese responsen
        cleanup();
        resolve({ success: true, message: successMessage });
      };
      
      console.log("Sender form med iframe-metode");
      form.submit();
    }
    
    // Rydde opp etter både suksess og feil
    function cleanup() {
      if (statusMessage && document.body.contains(statusMessage)) {
        document.body.removeChild(statusMessage);
      }
      
      // Rydd opp iframe og form hvis de finnes
      if (formId) {
        const form = document.getElementById(formId);
        if (form && document.body.contains(form)) {
          document.body.removeChild(form);
        }
      }
      
      if (iframeId) {
        const iframe = document.getElementById(iframeId);
        if (iframe && document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }
    }
  });
}
