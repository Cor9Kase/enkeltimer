// theme.js - Håndterer temabytting (kun lyse temaer), brukerbytte, gamification-visning, og aktiv nav-knapp

// Global variabel for gjeldende bruker (C for Cornelius, W for William)
let currentUserSuffix = localStorage.getItem('currentUserSuffix') || 'C';

// Definisjon av temaer (kun lyse temaer beholdt)
const themes = {
  'light-blue': {
    '--bg-dark': '#f4f7f9', // Lys bakgrunn
    '--bg-card': '#ffffff', // Hvite kort
    '--bg-modal': '#ffffff',
    '--text-primary': '#2c3e50', // Mørk tekst for lesbarhet
    '--text-secondary': '#7f8c8d',
    '--accent-primary': '#3498db', // Blå aksent
    '--accent-secondary': '#2980b9',
    '--accent-gradient': 'linear-gradient(135deg, #3498db, #2980b9)',
    '--border-inactive': '#dce4e8',
    '--bar-green': '#2ecc71',
    '--bar-yellow': '#f1c40f',
    '--bar-red': '#e74c3c',
    '--bar-background': '#ecf0f1',
  },
  'ocean-breeze': {
    '--bg-dark': '#e0f7fa', // Veldig lys blå
    '--bg-card': '#ffffff',
    '--bg-modal': '#ffffff',
    '--text-primary': '#01579b', // Mørk blå tekst
    '--text-secondary': '#0288d1', // Medium blå
    '--accent-primary': '#4fc3f7', // Lys himmelblå
    '--accent-secondary': '#29b6f6',
    '--accent-gradient': 'linear-gradient(135deg, #4fc3f7, #29b6f6)',
    '--border-inactive': '#b3e5fc',
    '--bar-green': '#81c784',
    '--bar-yellow': '#ffd54f',
    '--bar-red': '#ef9a9a',
    '--bar-background': '#cfd8dc',
  },
  'minimalist-orange': {
    '--bg-dark': '#ffffff',               // Hvit bakgrunn
    '--bg-card': '#fdf6f0',               // Svak kremhvit til kort
    '--bg-modal': '#fbeee6',              // Litt mørkere krem for modaler
    '--text-primary': '#1a1a1a',          // Mørk grå tekst for god kontrast
    '--text-secondary': '#7a7a7a',        // Lysere grå for sekundær tekst
    '--accent-primary': '#ff6f00',        // Sterk oransje aksent
    '--accent-secondary': '#ffb74d',      // Lysere oransje som sekundær aksent
    '--accent-gradient': 'linear-gradient(135deg, #ffe0b2, #ff6f00)', // Oransje gradient
    '--border-inactive': '#e0e0e0',       // Lys grå for inaktive elementer
    '--bar-green': '#c8e6c9',             // Nøytral grønn til fremdriftsindikator
    '--bar-yellow': '#fff9c4',            // Myk gul
    '--bar-red': '#ffcdd2',               // Mild rød
    '--bar-background': '#f0f0f0'         // Nøytral lys bakgrunn for bars
  }
};

// --- Hjelpefunksjoner for Tema ---
function getStartOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function applyAndSaveTheme(themeName, isAutoChange = false) {
  const themeKeys = Object.keys(themes);
  // Sørg for at themeName er et gyldig, gjenværende tema
  const validThemeName = themes[themeName] ? themeName : themeKeys[0]; // Default til første lyse tema

  const selectedTheme = themes[validThemeName];
  if (!selectedTheme) {
    console.warn(`Tema "${validThemeName}" ikke funnet. Ingen temabytte.`);
    return;
  }
  for (const [key, value] of Object.entries(selectedTheme)) {
    document.documentElement.style.setProperty(key, value);
  }
  const bodyClasses = document.body.className.split(' ').filter(cls => !cls.startsWith('theme-'));
  document.body.className = [...bodyClasses, `theme-${validThemeName}`].join(' ');

  localStorage.setItem('selectedTheme', validThemeName);
  if (!isAutoChange || !localStorage.getItem('themeLastChanged')) {
    localStorage.setItem('themeLastChanged', new Date().toISOString().split('T')[0]);
  }
  console.log(`Tema endret til: ${validThemeName}. Lagret.`);
  setActiveThemeButton(validThemeName);
}

function setActiveThemeButton(themeName) {
  document.querySelectorAll('.theme-btn').forEach(button => {
    // Fjerner 'active-theme' klasse hvis du hadde det for styling av aktiv knapp
    // button.classList.remove('active-theme'); 
    if (button.id === `theme-btn-${themeName}`) {
      // button.classList.add('active-theme');
    }
  });
}

function loadCheckAndApplyTheme() {
  const savedTheme = localStorage.getItem('selectedTheme');
  const lastChangedStr = localStorage.getItem('themeLastChanged');
  const themeKeys = Object.keys(themes); // Nå kun de lyse temaene
  let themeToApply = (savedTheme && themes[savedTheme]) ? savedTheme : themeKeys[0]; // Default til første lyse tema
  let needsSaveOfDate = !savedTheme;

  const startOfThisWeek = getStartOfWeek();

  if (lastChangedStr) {
    const lastChangedDate = new Date(lastChangedStr);
    lastChangedDate.setHours(0, 0, 0, 0);

    if (lastChangedDate < startOfThisWeek) {
      console.log("Ny uke! Velger neste lyse tema automatisk.");
      const currentIndex = themeKeys.indexOf(themeToApply);
      const nextIndex = (currentIndex + 1) % themeKeys.length;
      themeToApply = themeKeys[nextIndex];
      applyAndSaveTheme(themeToApply, true); // true for isAutoChange
      return;
    }
  } else {
    needsSaveOfDate = true;
  }
  applyAndSaveTheme(themeToApply, !needsSaveOfDate);
}

// --- Gamification Display ---
function displayGamificationStatus() {
  // ... (som før)
  console.log("--- Kjører displayGamificationStatus (i theme.js) ---");
  const totalPointsStr = localStorage.getItem('user_totalPoints');
  const streakCountStr = localStorage.getItem('streak_count');
  const rankStr = localStorage.getItem('user_rank');
  console.log(`Lest fra localStorage: points='${totalPointsStr}', streak='${streakCountStr}', rank='${rankStr}'`);

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
  console.log(`Gamification UI oppdatert: Poeng=${totalPoints}, Streak=${streakCount}, Rank=${rank}`);
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
  console.log(`Brukerknapper oppdatert. Aktiv bruker: ${currentUserSuffix}`);
}

function switchUser(newUserSuffix) {
    // ... (som før)
  if (currentUserSuffix === newUserSuffix) {
    console.log(`Bruker er allerede ${newUserSuffix}. Ingen bytte nødvendig.`);
    return;
  }
  
  console.log(`Bytter bruker til: ${newUserSuffix}`);
  currentUserSuffix = newUserSuffix;
  localStorage.setItem('currentUserSuffix', currentUserSuffix);
  updateUserButtonStates();

  const lastUpdatedSpan = document.getElementById('last-updated');
  if (lastUpdatedSpan) lastUpdatedSpan.textContent = "Laster...";

  const currentPage = window.location.pathname.split("/").pop();
  if (currentPage === 'index.html' || currentPage === '') {
    if (typeof loadCustomers === 'function') loadCustomers(); else console.warn("loadCustomers function not found on index page.");
  } else if (currentPage === 'daily-summary.html') {
    if (typeof loadDailySummary === 'function') loadDailySummary(); else console.warn("loadDailySummary function not found on daily summary page.");
  } else if (currentPage === 'tasks.html') {
    if (typeof fetchInitialData_Tasks === 'function') fetchInitialData_Tasks(); else console.warn("fetchInitialData_Tasks function not found on tasks page.");
  } else if (currentPage === 'manager-dashboard.html') {
    if (typeof fetchAllDataForDashboard === 'function') fetchAllDataForDashboard(); else console.warn("fetchAllDataForDashboard function not found on manager page.");
  }else {
    console.warn("Ingen spesifikk datalastingsfunksjon funnet for denne siden etter brukerbytte:", currentPage);
  }
  displayGamificationStatus();
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
  console.log("theme.js DOMContentLoaded kjører.");

  loadCheckAndApplyTheme(); // Håndterer lagret/automatisk tema

  // Lyttere for de GJENVÆRENDE lyse temaknappene
  document.getElementById('theme-btn-light-blue')?.addEventListener('click', () => applyAndSaveTheme('light-blue', false));
  document.getElementById('theme-btn-ocean-breeze')?.addEventListener('click', () => applyAndSaveTheme('ocean-breeze', false));
  document.getElementById('theme-btn-minimalist-orange')?.addEventListener('click', () => applyAndSaveTheme('minimalist-orange', false));
  
  // Fjern lyttere for de mørke temaene som ikke lenger finnes i `themes`-objektet
  // (Knappene i HTML bør også fjernes for et rent UI, men JS vil ikke feile hvis de er der uten lytter)

  updateUserButtonStates();
  document.getElementById('user-btn-c')?.addEventListener('click', () => switchUser('C'));
  document.getElementById('user-btn-w')?.addEventListener('click', () => switchUser('W'));
  // 'user-btn-all' for manager dashboard håndteres av manager-dashboard.js sin setManagerFocus

  displayGamificationStatus();
  highlightActiveNavButton();
});

console.log("theme.js lastet (kun lyse temaer). Aktiv bruker:", currentUserSuffix);

