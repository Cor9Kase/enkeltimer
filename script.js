// Google Script URL - Erstatt denne med din egen URL fra Google Apps Script
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxdjRu9XuC1SRaLxSRGh8DW0_0r46Gj5zU4GjHSk3-dWKI01auXlV0_AR9qdjjno/exec';

// Store active timers and their data
const timers = {};
let activeBox = null;
let customers = [];
let newCustomerTimer = null;
let isAutoRefreshPaused = false;

// Load customer data when page loads
document.addEventListener('DOMContentLoaded', function() {
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
  // Fikser kommentar-skjema knappen
  const submitButton = document.querySelector('#commentModal .submit-btn');
  if (submitButton) {
    submitButton.addEventListener('click', function() {
      submitTime();
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
  fetchCustomerData();
}

// Funksjon for å regelmessig oppdatere kundedata
function startAutoRefresh() {
  // Oppdater kundedata hvert 30. sekund
  setInterval(() => {
    // Bare oppdater data hvis ingen timer er aktiv
    if (!isAutoRefreshPaused) {
      fetchCustomerData();
    }
  }, 30000); // 30000 ms = 30 sekunder
}

function fetchCustomerData() {
  // Gi tilbakemelding til brukeren om at data hentes
  document.getElementById('last-updated').textContent = 'Henter data...';
  
  // Bruk en kombinasjon av metoder for å håndtere tilkoblingsproblemer
  fetchCustomersWithJSONP()
    .catch(error => {
      console.warn('JSONP request failed, trying direct fetch:', error);
      return fetchCustomersDirect();
    })
    .catch(error => {
      console.error('All connection attempts failed:', error);
      useMockData();
    });
}

// JSONP metode for å unngå CORS-problemer
function fetchCustomersWithJSONP() {
  return new Promise((resolve, reject) => {
    const callbackName = 'googleScriptCallback_' + Math.floor(Math.random() * 1000000);
    const url = `${GOOGLE_SCRIPT_URL}?action=getCustomers&callback=${callbackName}`;
    
    // Sett timeout for å håndtere feiling
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('JSONP request timed out after 5 seconds'));
    }, 5000);
    
    // Lag en global callback-funksjon som vil håndtere responsen
    window[callbackName] = function(data) {
      cleanup();
      
      if (data && data.success) {
        processCustomerData(data);
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
function fetchCustomersDirect() {
  return fetch(`${GOOGLE_SCRIPT_URL}?action=getCustomers`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (data && data.success) {
        processCustomerData(data);
        return data;
      } else {
        throw new Error('Invalid response from Google Script');
      }
    });
}

// Behandle kundedata etter vellykket henting
function processCustomerData(data) {
  // Sort customers alphabetically
  customers = data.customers.sort((a, b) => a.name.localeCompare(b.name));
  
  // Render the customer boxes
  renderCustomers();
  
  // Update last updated time
  const now = new Date();
  document.getElementById('last-updated').textContent = now.toLocaleTimeString();
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
  customers = mockCustomerData.sort((a, b) => a.name.localeCompare(b.name));
  
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
  const container = document.getElementById('customer-container');
  
  // Find any active timer
  const activeCustomerId = activeBox ? activeBox.getAttribute('data-id') : null;
  
  // Clear existing customer boxes, but keep the "add customer" button
  const addCustomerButton = document.getElementById('add-customer-box');
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  container.appendChild(addCustomerButton);
  
  // Add all customers in alphabetical order
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
      const elapsedTime = new Date() - timers[activeCustomerId].startTime;
      timerDiv.textContent = formatTime(elapsedTime);
      
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
}

function toggleTimer(box) {
  const customerId = box.getAttribute('data-id');
  const timerDisplay = box.querySelector('.timer');
  const statusDisplay = box.querySelector('.status');
  const customerName = box.querySelector('.customer-name').textContent;
  
  // If this box is already active, stop the timer and show comment modal
  if (box.classList.contains('active')) {
    clearInterval(timers[customerId].interval);
    box.classList.remove('active');
    statusDisplay.textContent = 'Inaktiv';
    isAutoRefreshPaused = false; // Resume auto-refresh
    
    // Calculate time spent
    const endTime = new Date();
    const timeSpent = endTime - timers[customerId].startTime;
    const timeSpentFormatted = formatTime(timeSpent);
    
    // Show comment modal
    const modal = document.getElementById('commentModal');
    document.getElementById('modal-customer-name').textContent = customerName;
    document.getElementById('modal-time-spent').textContent = 'Tid brukt: ' + timeSpentFormatted;
    
    // Clear any previous comment
    document.getElementById('comment-text').value = '';
    
    modal.style.display = 'block';
    
    // Save data for submission
    timers[customerId].endTime = endTime;
    timers[customerId].timeSpentFormatted = timeSpentFormatted;
    timers[customerId].timeSpentMs = timeSpent;
    activeBox = null;
  } else {
    // If another box is active (including new customer), deactivate it first
    if (activeBox) {
      toggleTimer(activeBox);
    } else if (document.getElementById('add-customer-box').classList.contains('active')) {
      stopNewCustomerTimer();
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
  // Hent data fra modal-elementer
  const customerName = document.getElementById('modal-customer-name').textContent;
  const timeSpentText = document.getElementById('modal-time-spent').textContent;
  
  // Sjekk om activeBox finnes
  if (!activeBox) {
    // Finn kunden basert på navn
    const customerIndex = customers.findIndex(c => c.name === customerName);
    
    if (customerIndex === -1) {
      console.error('Kunne ikke finne kunde:', customerName);
      alert('Kunne ikke finne kunden. Prøv å starte timeren på nytt.');
      closeModal('commentModal');
      return;
    }
    
    // Finn customerId (indeks + 1)
    const customerId = customerIndex + 1;
    
    // Finn boks eller rekonstruer timer-data
    activeBox = document.querySelector(`.customer-box[data-id="${customerId}"]`);
    
    // Hvis timer-data mangler, rekonstruer det basert på tidsteksten
    if (!timers[customerId]) {
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
        return;
      }
    }
  }

  const customerId = activeBox.getAttribute('data-id');
  const comment = document.getElementById('comment-text').value;
  
  // Sjekk om timers[customerId] finnes
  if (!timers[customerId]) {
    console.error('Timer data mangler for kunde', customerId);
    alert('Det oppstod en feil. Timer-data mangler. Prøv å starte timeren på nytt.');
    closeModal('commentModal');
    return;
  }
  
  // Get current date
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${padZero(now.getMonth() + 1)}-${padZero(now.getDate())}`;
  
  // Calculate decimal hours (rounded to quarter hours)
  const decimalHours = calculateHoursFromMs(timers[customerId].timeSpentMs);
  
  // Get customer's total sold hours and remaining hours
  let soldHours = 0;
  let remainingHours = 0;
  
  const customerIndex = parseInt(customerId) - 1;
  if (customerIndex >= 0 && customerIndex < customers.length) {
    // Calculate total and remaining hours
    soldHours = customers[customerIndex].availableHours + decimalHours; // Original hours before this session
    remainingHours = customers[customerIndex].availableHours - decimalHours; // Remaining after this session
    
    // Update local data
    customers[customerIndex].availableHours = remainingHours;
    if (customers[customerIndex].availableHours < 0) {
      customers[customerIndex].availableHours = 0;
      remainingHours = 0;
    }
  }
  
  // Prepare the data to be sent to Google Sheets
  const data = {
    action: "logTime",
    customerName: timers[customerId].customerName,
    timeSpent: decimalHours,
    soldHours: soldHours,
    remainingHours: remainingHours,
    comment: comment,
    date: dateStr
  };
  
  // Forbedret metode for å sende data til Google Apps Script
  sendDataToGoogleScript(data, 'Tid registrert')
    .then(() => {
      // Reset the timer display
      activeBox.querySelector('.timer').textContent = '00:00:00';
      
      // Close the modal
      closeModal('commentModal');
      
      // Clear the active box reference
      activeBox = null;
      
      // Re-render the customers to show updated available hours
      renderCustomers();
      
      // Show confirmation
      alert('Timer lagret for ' + data.customerName + '!');
    })
    .catch(error => {
      console.error('Error logging time:', error);
      alert('Kunne ikke lagre tid: ' + error.message);
    });
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
  
  // Send data to Google Sheets with improved method
  sendDataToGoogleScript(data, 'Ny kunde opprettet')
    .then(() => {
      // Add the new customer to the local array
      customers.push({
        name: customerName,
        availableHours: availableHours - decimalHours // Subtract the time already spent
      });
      
      // Sort customers alphabetically
      customers.sort((a, b) => a.name.localeCompare(b.name));
      
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
    oldName: customers[index].name, // Endre fra customerName til oldName for å matche Google Apps Script
    customerName: customerName, // Legg til nytt navn
    availableHours: availableHours
  };
  
  // Send data to Google Sheets with improved method
  sendDataToGoogleScript(data, 'Kunde oppdatert')
    .then(() => {
      // Update the local data
      customers[index].name = customerName;
      customers[index].availableHours = availableHours;
      
      // Sort customers alphabetically
      customers.sort((a, b) => a.name.localeCompare(b.name));
      
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
  const index = document.getElementById('delete-customer-id').value;
  const customerName = customers[index].name;
  
  // Prepare data for the delete
  const data = {
    action: "deleteCustomer",
    customerName: customerName
  };
  
  // Send data to Google Sheets with improved method
  sendDataToGoogleScript(data, 'Kunde slettet')
    .then(() => {
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
    // Indiker til brukeren at data sendes
    const statusMessage = document.createElement('div');
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
    
    // Bruk form-submission approach
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = GOOGLE_SCRIPT_URL;
    
    // Opprett et skjult iframe for å unngå side-reload
    const iframe = document.createElement('iframe');
    iframe.name = 'hidden-iframe';
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    form.target = 'hidden-iframe';
    
    // Legg til data som skjulte inputfelt
    const jsonInput = document.createElement('input');
    jsonInput.type = 'hidden';
    jsonInput.name = 'json';
    jsonInput.value = JSON.stringify(data);
    form.appendChild(jsonInput);
    
    // Legg til skjemaet i DOM
    document.body.appendChild(form);
    
    // Sett timeout for å håndtere manglende svar
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Forespørselen tok for lang tid. Sjekk nettverksforbindelsen din.'));
    }, 10000);
    
    // Lytt på iframe last for å fange respons
    iframe.addEventListener('load', function() {
      try {
        clearTimeout(timeoutId);
        
        // Prøv å lese responsen fra iframe
        let response = null;
        try {
          const iframeContent = iframe.contentWindow.document.body.innerText;
          if (iframeContent) {
            response = JSON.parse(iframeContent);
          }
        } catch (err) {
          console.warn('Kunne ikke lese respons fra iframe', err);
          // Fortsett selv om vi ikke kan lese responsen
          response = { success: true };
        }
        
        if (response && response.success) {
          resolve(response);
        } else {
          reject(new Error(response && response.message ? response.message : 'Ukjent feil'));
        }
      } finally {
        cleanup();
      }
    });
    
    // Håndter feil ved lasting av iframe
    iframe.addEventListener('error', function() {
      clearTimeout(timeoutId);
      cleanup();
      reject(new Error('Kunne ikke sende data til Google Sheets'));
    });
    
    // Funksjon for å rydde opp
    function cleanup() {
      if (document.body.contains(statusMessage)) {
        document.body.removeChild(statusMessage);
      }
      if (document.body.contains(form)) {
        document.body.removeChild(form);
      }
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }
    
    // Send skjemaet
    form.submit();
  });
