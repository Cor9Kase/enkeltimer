// Google Script URL - Erstatt denne med din egen URL fra Google Apps Script
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxuA6snPxVx5pTrbE1SaONIc6jAnroH5FpAEvDsUADxYNg1veipInqRWbEMkenNWPPe/exec';

// Store active timers and their data
const timers = {};
let activeBox = null;
let customers = [];
let newCustomerTimer = null;

// Load customer data when page loads
document.addEventListener('DOMContentLoaded', function() {
  // Set current date in header
  updateCurrentDate();
  
  // Load customer data
  loadCustomers();
  
  // Start auto-refresh
  startAutoRefresh();
});

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
    fetchCustomerData();
  }, 30000); // 30000 ms = 30 sekunder
}

// Separate function to fetch customer data
function fetchCustomerData() {
  fetch(`${GOOGLE_SCRIPT_URL}?action=getCustomers`)
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        // Sort customers alphabetically
        customers = data.customers.sort((a, b) => a.name.localeCompare(b.name));
        
        // Render the customer boxes
        renderCustomers();
        
        // Update last updated time
        const now = new Date();
        document.getElementById('last-updated').textContent = now.toLocaleTimeString();
      }
    })
    .catch(error => {
      console.error('Error fetching customer data:', error);
      
      // For offline testing, use mock data
      if (customers.length === 0) {
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
        
        alert('Kunne ikke koble til Google Sheets. Bruker testdata.');
      }
    });
}

function renderCustomers() {
  const container = document.getElementById('customer-container');
  
  // Clear existing customer boxes, but keep the "add customer" button
  const addCustomerButton = document.querySelector('.add-customer');
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
    timerDiv.textContent = '00:00:00';
    
    const statusDiv = document.createElement('div');
    statusDiv.className = 'status';
    statusDiv.textContent = 'Inaktiv';
    
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
    
    // Calculate time spent
    const endTime = new Date();
    const timeSpent = endTime - timers[customerId].startTime;
    const timeSpentFormatted = formatTime(timeSpent);
    
    // Show comment modal
    const modal = document.getElementById('commentModal');
    document.getElementById('modal-customer-name').textContent = customerName;
    document.getElementById('modal-time-spent').textContent = 'Tid brukt: ' + timeSpentFormatted;
    modal.style.display = 'block';
    
    // Save data for submission
    timers[customerId].endTime = endTime;
    timers[customerId].timeSpentFormatted = timeSpentFormatted;
    timers[customerId].timeSpentMs = timeSpent;
    activeBox = box;
  } else {
    // If another box is active (including new customer), deactivate it first
    if (activeBox) {
      toggleTimer(activeBox);
    } else if (document.getElementById('add-customer-box').classList.contains('active')) {
      stopNewCustomerTimer();
    }
    
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
  
  // Calculate time spent
  const endTime = new Date();
  const timeSpent = endTime - newCustomerTimer.startTime;
  const timeSpentFormatted = formatTime(timeSpent);
  
  // Show the new customer modal
  const modal = document.getElementById('newCustomerModal');
  document.getElementById('new-customer-time-spent').textContent = 'Tid brukt: ' + timeSpentFormatted;
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
  const customerId = activeBox.getAttribute('data-id');
  const comment = document.getElementById('comment-text').value;
  
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
  
  // Send data to Google Sheets
  fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify(data)
  })
  .then(response => response.json())
  .then(result => {
    if (result.success) {
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
    } else {
      alert('Kunne ikke lagre tid: ' + (result.message || 'Ukjent feil'));
    }
  })
  .catch(error => {
    console.error('Error logging time:', error);
    alert('Kunne ikke lagre tid: ' + error);
  });
}

function cancelNewCustomer() {
  // Stop the timer if it's running
  if (newCustomerTimer && newCustomerTimer.interval) {
    clearInterval(newCustomerTimer.interval);
  }
  
  // Reset the timer display
  document.getElementById('new-customer-timer').textContent = '00:00:00';
  
  // Clear the form
  document.getElementById('new-customer-name').value = '';
  document.getElementById('new-customer-hours').value = '';
  document.getElementById('new-customer-comment').value = '';
  
  // Close the modal
  closeModal('newCustomerModal');
  
  // Reset the add customer box
  document.getElementById('add-customer-box').classList.remove('active');
  
  // Reset the newCustomerTimer
  newCustomerTimer = null;
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
  
  // Calculate decimal hours (rounded to quarter hours)
  const decimalHours = calculateHoursFromMs(newCustomerTimer.timeSpentMs);
  
  // Prepare data for the new customer
  const data = {
    action: "createCustomer",
    customerName: customerName,
    availableHours: availableHours,
    timeSpent: decimalHours,
    comment: comment,
    date: new Date().toISOString().slice(0, 10)
  };
  
  // Send data to Google Sheets
  fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify(data)
  })
  .then(response => response.json())
  .then(result => {
    if (result.success) {
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
    } else {
      alert('Kunne ikke opprette kunde: ' + (result.message || 'Ukjent feil'));
    }
  })
  .catch(error => {
    console.error('Error creating customer:', error);
    alert('Kunne ikke opprette kunde: ' + error);
  });
}

function showEditCustomer(index) {
  const customer = customers[index];
  
  // Fill the form with customer data
  document.getElementById('edit-customer-name').value = customer.name;
  document.getElementById('edit-customer-hours').value = customer.availableHours;
  document.getElementById('edit-customer-id').value = index;
  
  // Show the modal
  document.getElementById('editCustomerModal').style.display = 'block';
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
    customerName: customers[index].name, // Original name for finding the customer
    newName: customerName,
    availableHours: availableHours
  };
  
  // Send data to Google Sheets
  fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify(data)
  })
  .then(response => response.json())
  .then(result => {
    if (result.success) {
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
    } else {
      alert('Kunne ikke oppdatere kunde: ' + (result.message || 'Ukjent feil'));
    }
  })
  .catch(error => {
    console.error('Error updating customer:', error);
    alert('Kunne ikke oppdatere kunde: ' + error);
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
  
  // Send data to Google Sheets
  fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify(data)
  })
  .then(response => response.json())
  .then(result => {
    if (result.success) {
      // Remove from local array
      customers.splice(index, 1);
      
      // Close the modal
      closeModal('confirmDeleteModal');
      
      // Re-render the customers
      renderCustomers();
      
      // Show confirmation
      alert('Kunde slettet: ' + customerName);
    } else {
      alert('Kunne ikke slette kunde: ' + (result.message || 'Ukjent feil'));
    }
  })
  .catch(error => {
    console.error('Error deleting customer:', error);
    alert('Kunne ikke slette kunde: ' + error);
  });
}
