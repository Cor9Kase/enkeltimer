// theme.js - Håndterer et dynamisk dag-tema, brukerbytte, gamification-visning, og aktiv nav-knapp

// Global variabel for gjeldende bruker (C for Cornelius, W for William)
let currentUserSuffix = localStorage.getItem('currentUserSuffix') || 'C';

// Definer fargesett for morgen (start) og kveld (slutt)
const morningColors = {
  '--bg-dark': '#f4f7f9',         // Lys blå/grå
  '--bg-card': '#ffffff',         // Hvit
  '--bg-modal': '#f8f9fa',        // Nesten hvit
  '--text-primary': '#2c3e50',    // Mørk blågrå
  '--text-secondary': '#7f8c8d',  // Medium grå
  '--accent-primary': '#3498db',  // Klar blå
  '--accent-secondary': '#2980b9',// Mørkere klar blå
  '--border-inactive': '#dce4e8',
  '--bar-background': '#ecf0f1',
  // Farger for statusbarer beholdes som de er, eller kan også interpoleres hvis ønskelig
  '--bar-green': '#2ecc71',
  '--bar-yellow': '#f1c40f',
  '--bar-red': '#e74c3c',
};

const eveningColors = {
  '--bg-dark': '#d0d8e0',         // Dusere, mørkere blågrå
  '--bg-card': '#e8edf0',         // Litt mørkere off-white
  '--bg-modal': '#dde2e5',        // Dusere modalbakgrunn
  '--text-primary': '#34495e',    // Litt mykere mørk tekst
  '--text-secondary': '#6b7d8b',  // Dusere sekundærtekst
  '--accent-primary': '#5d8aab',  // Duset, desaturert blå
  '--accent-secondary': '#466d87',// Mørkere duset blå
  '--border-inactive': '#a8b6bf',
  '--bar-background': '#cad3d9',
  // Statusbarfarger kan også justeres for kvelden om ønskelig
  '--bar-green': '#5cb85c', // Litt dusere grønn
  '--bar-yellow': '#f0ad4e',// Litt dusere gul
  '--bar-red': '#d9534f',  // Litt dusere rød
};

// Hjelpefunksjon for å parse hex-farge til RGB-objekt
function hexToRgb(hex) {
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) { // #RGB format
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) { // #RRGGBB format
    r = parseInt(hex[1] + hex[2], 16);
    g = parseInt(hex[3] + hex[4], 16);
    b = parseInt(hex[5] + hex[6], 16);
  }
  return { r, g, b };
}

// Hjelpefunksjon for å interpolere en enkelt fargekomponent
function interpolateColorComponent(startComp, endComp, factor) {
  return Math.round(startComp + (endComp - startComp) * factor);
}

// Hovedfunksjon for å oppdatere det dynamiske temaet
function updateDynamicDayTheme() {
  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60; // Time med desimaler for jevnere overgang

  const startHour = 8; // 08:00
  const endHour = 20;  // 20:00 (8 PM) - temaet er fullt "kveldsfarget" her

  let factor = 0; // 0 = full morgen, 1 = full kveld

  if (currentHour <= startHour) {
    factor = 0;
  } else if (currentHour >= endHour) {
    factor = 1;
  } else {
    factor = (currentHour - startHour) / (endHour - startHour);
  }

  // CSS-variabler som skal interpoleres
  const varsToInterpolate = [
    '--bg-dark', '--bg-card', '--bg-modal',
    '--text-primary', '--text-secondary',
    '--accent-primary', '--accent-secondary',
    '--border-inactive', '--bar-background',
    '--bar-green', '--bar-yellow', '--bar-red' // Valgfritt å interpolere disse også
  ];

  varsToInterpolate.forEach(varName => {
    const morningHex = morningColors[varName];
    const eveningHex = eveningColors[varName];

    if (morningHex && eveningHex) {
      const rgbMorning = hexToRgb(morningHex);
      const rgbEvening = hexToRgb(eveningHex);

      const r = interpolateColorComponent(rgbMorning.r, rgbEvening.r, factor);
      const g = interpolateColorComponent(rgbMorning.g, rgbEvening.g, factor);
      const b = interpolateColorComponent(rgbMorning.b, rgbEvening.b, factor);

      document.documentElement.style.setProperty(varName, `rgb(${r},${g},${b})`);
    }
  });

  // For gradienten, kan vi bruke de interpolerte primær- og sekundæraksentfargene
  const currentAccentPrimary = document.documentElement.style.getPropertyValue('--accent-primary');
  const currentAccentSecondary = document.documentElement.style.getPropertyValue('--accent-secondary');
  if (currentAccentPrimary && currentAccentSecondary) {
    document.documentElement.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${currentAccentPrimary}, ${currentAccentSecondary})`);
  }

  // console.log(`Dynamic theme updated. Factor: ${factor.toFixed(2)}`);
}


// --- Gamification Display ---
function displayGamificationStatus() {
  // ... (som før)
  console.log("--- Kjører displayGamificationStatus (i theme.js) ---");
  const totalPointsStr = localStorage.getItem('user_totalPoints');
  const streakCountStr = localStorage.getItem('streak_count');
  const rankStr = localStorage.getItem('user_rank');
  
  const totalPoints = parseInt(totalPointsStr || '0');
  const streakCount = parseInt(streakCountStr || '0');
  const rank = rankStr || "Nybegynner"; 

  const pointsElement = document.getElementById('points-display');
  const streakElement = document.getElementById('streak-display');
  const rankElement = document.getElementById('rank-display');

  if (pointsElement) {
    pointsElement.innerHTML = `✨ ${totalPoints} Poeng`;
    pointsElement.style.display = 'inline-block';
  }
  if (streakElement) {
    if (streakCount > 0) {
      streakElement.innerHTML = `🔥 ${streakCount} dager på rad!`;
      streakElement.style.display = 'inline-block';
    } else {
      streakElement.style.display = 'none';
    }
  }
  if (rankElement) {
    rankElement.innerHTML = `🏆 Rank: ${rank}`;
    rankElement.style.display = 'inline-block';
  }
}

// --- Aktiv Navigasjonsknapp ---
function highlightActiveNavButton() {
    // ... (som før)
    const currentPath = window.location.pathname.split("/").pop();
    const navButtons = document.querySelectorAll('.header-main-actions .nav-btn'); 

    navButtons.forEach(button => {
        button.classList.remove('active');
        const onclickAttr = button.getAttribute('onclick');
        const match = onclickAttr?.match(/'([^']+)'/); 

        if (match && match[1]) {
            const buttonPath = match[1].split("/").pop();
            if (buttonPath === currentPath || (currentPath === '' && buttonPath === 'index.html')) {
                button.classList.add('active');
            }
        }
    });
}

// --- Brukerbytte Logikk ---
function updateUserButtonStates() {
    // ... (som før)
  const userBtnC = document.getElementById('user-btn-c');
  const userBtnW = document.getElementById('user-btn-w');

  if (userBtnC && userBtnW) {
    userBtnC.classList.remove('active');
    userBtnW.classList.remove('active');
    if (currentUserSuffix === 'C') {
      userBtnC.classList.add('active');
    } else if (currentUserSuffix === 'W') {
      userBtnW.classList.add('active');
    }
  }
}

function switchUser(newUserSuffix) {
    // ... (som før)
  if (currentUserSuffix === newUserSuffix) return;
  
  currentUserSuffix = newUserSuffix;
  localStorage.setItem('currentUserSuffix', currentUserSuffix);
  updateUserButtonStates();

  const lastUpdatedSpan = document.getElementById('last-updated');
  if (lastUpdatedSpan) lastUpdatedSpan.textContent = "Laster...";

  const currentPage = window.location.pathname.split("/").pop();
  if (currentPage === 'index.html' || currentPage === '') {
    if (typeof loadCustomers === 'function') loadCustomers();
  } else if (currentPage === 'daily-summary.html') {
    if (typeof loadDailySummary === 'function') loadDailySummary();
  } else if (currentPage === 'tasks.html') {
    if (typeof fetchInitialData_Tasks === 'function') fetchInitialData_Tasks();
  } else if (currentPage === 'manager-dashboard.html') {
    if (typeof fetchAllDataForDashboard === 'function') fetchAllDataForDashboard();
  }
  displayGamificationStatus();
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
  console.log("theme.js DOMContentLoaded kjører for dynamisk tema.");

  // Initialiser og start dynamisk tema
  updateDynamicDayTheme(); // Kall en gang for å sette farger umiddelbart
  setInterval(updateDynamicDayTheme, 5 * 60 * 1000); // Oppdater hvert 5. minutt

  // Fjern lyttere for manuelle temaknapper, da de ikke lenger er i bruk
  // document.getElementById('theme-btn-light-blue')?.removeEventListener(...) etc.
  // HTML-knappene for tema bør også fjernes fra HTML-filene.

  updateUserButtonStates();
  document.getElementById('user-btn-c')?.addEventListener('click', () => switchUser('C'));
  document.getElementById('user-btn-w')?.addEventListener('click', () => switchUser('W'));

  displayGamificationStatus();
  highlightActiveNavButton();
});

console.log("theme.js lastet (med dynamisk dag-tema). Aktiv bruker:", currentUserSuffix);
