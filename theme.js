// theme.js - Håndterer temabytting, brukerbytte, gamification-visning, og aktiv nav-knapp

// Global variabel for gjeldende bruker (C for Cornelius, W for William)
// Hentes fra localStorage, med 'C' som default.
let currentUserSuffix = localStorage.getItem('currentUserSuffix') || 'C';

// Definisjon av temaer
const themes = {
  'dark-purple': {
    '--bg-dark': '#121212',
    '--bg-card': '#1e1e1e',
    '--bg-modal': '#242424',
    '--text-primary': '#ffffff',
    '--text-secondary': '#b0b0b0',
    '--accent-primary': '#9d4edd',
    '--accent-secondary': '#7b2cbf',
    '--accent-gradient': 'linear-gradient(135deg, #9d4edd, #7b2cbf)',
    '--border-inactive': '#383838',
    '--bar-green': '#4CAF50', // Standardisert bar-farger
    '--bar-yellow': '#ffc107',
    '--bar-red': '#e53935',
    '--bar-background': '#333', // Standardisert bar-bakgrunn
  },
  'light-blue': {
    '--bg-dark': '#f4f7f9',
    '--bg-card': '#ffffff',
    '--bg-modal': '#ffffff', // Endret fra f1f1f1 for konsistens
    '--text-primary': '#2c3e50',
    '--text-secondary': '#7f8c8d',
    '--accent-primary': '#3498db',
    '--accent-secondary': '#2980b9',
    '--accent-gradient': 'linear-gradient(135deg, #3498db, #2980b9)',
    '--border-inactive': '#dce4e8',
    '--bar-green': '#2ecc71',
    '--bar-yellow': '#f1c40f',
    '--bar-red': '#e74c3c',
    '--bar-background': '#ecf0f1',
  },
  'forest-green': {
    '--bg-dark': '#1a2a27', // Mørkere enn før for bedre kontrast
    '--bg-card': '#243d38',
    '--bg-modal': '#2a4a43',
    '--text-primary': '#e0e0e0',
    '--text-secondary': '#a0a0a0', // Lysere for lesbarhet
    '--accent-primary': '#2ecc71',
    '--accent-secondary': '#27ae60',
    '--accent-gradient': 'linear-gradient(135deg, #2ecc71, #27ae60)',
    '--border-inactive': '#3e5a54', // Mørkere border
    '--bar-green': '#4CAF50',
    '--bar-yellow': '#ffc107',
    '--bar-red': '#e53935',
    '--bar-background': '#44645d', // Mørkere bar-bakgrunn
  },
  'ocean-breeze': {
    '--bg-dark': '#e0f7fa',
    '--bg-card': '#ffffff',
    '--bg-modal': '#ffffff', // Konsistent med kort
    '--text-primary': '#004d40',
    '--text-secondary': '#4db6ac',
    '--accent-primary': '#00acc1', // Fra light-blue theme
    '--accent-secondary': '#00838f', // Fra light-blue theme
    '--accent-gradient': 'linear-gradient(135deg, #4dd0e1, #00acc1)',
    '--border-inactive': '#b2ebf2', // Lysere border
    '--bar-green': '#81c784',
    '--bar-yellow': '#ffd54f',
    '--bar-red': '#ef9a9a',
    '--bar-background': '#cfd8dc', // Lysere bar-bakgrunn
  },
  'sunset-glow': {
    '--bg-dark': '#212121', // Mørkere for kontrast
    '--bg-card': '#313131', // Mørkere
    '--bg-modal': '#3a3a3a', // Mørkere
    '--text-primary': '#f5f5f5',
    '--text-secondary': '#bdbdbd',
    '--accent-primary': '#ff8a65',
    '--accent-secondary': '#ff7043',
    '--accent-gradient': 'linear-gradient(135deg, #ffb74d, #ff8a65, #e57373)',
    '--border-inactive': '#424242', // Mørkere border
    '--bar-green': '#a5d6a7',
    '--bar-yellow': '#fff176',
    '--bar-red': '#ef9a9a',
    '--bar-background': '#454545', // Mørkere bar-bakgrunn
  },
  'monochrome-mint': {
    '--bg-dark': '#263238', // Mørk blågrå
    '--bg-card': '#37474f',
    '--bg-modal': '#455a64',
    '--text-primary': '#eceff1', // Lys grå/hvit
    '--text-secondary': '#90a4ae', // Medium gråblå
    '--accent-primary': '#80cbc4', // Mint
    '--accent-secondary': '#4db6ac', // Mørkere mint
    '--accent-gradient': 'linear-gradient(135deg, #a7ffeb, #80cbc4)',
    '--border-inactive': '#546e7a',
    '--bar-green': '#a5d6a7',
    '--bar-yellow': '#fff59d',
    '--bar-red': '#ef9a9a',
    '--bar-background': '#546e7a',
  },
   'minimalist-orange': {
    '--bg-dark': '#ffffff',
    '--bg-card': '#fdf6f0',
    '--bg-modal': '#fbeee6',
    '--text-primary': '#1a1a1a',
    '--text-secondary': '#7a7a7a',
    '--accent-primary': '#ff6f00',
    '--accent-secondary': '#ffb74d',
    '--accent-gradient': 'linear-gradient(135deg, #ffe0b2, #ff6f00)',
    '--border-inactive': '#e0e0e0',
    '--bar-green': '#c8e6c9',
    '--bar-yellow': '#fff9c4',
    '--bar-red': '#ffcdd2',
    '--bar-background': '#f0f0f0',
  }
};

// --- Hjelpefunksjoner for Tema ---
/**
 * Finner datoen for mandagen i den gitte datoens uke.
 * @param {Date} [date=new Date()] Datoen å basere uken på.
 * @returns {Date} Et Date-objekt for mandagen kl 00:00:00.
 */
function getStartOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Søndag, 1 = Mandag, ..., 6 = Lørdag
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Juster til mandag
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/**
 * Applierer et valgt tema til :root elementet og lagrer det.
 * @param {string} themeName - Navnet på temaet som skal aktiveres.
 * @param {boolean} [isAutoChange=false] - Om endringen var automatisk (ukentlig).
 */
function applyAndSaveTheme(themeName, isAutoChange = false) {
  const selectedTheme = themes[themeName];
  if (!selectedTheme) {
    console.warn(`Tema "${themeName}" ikke funnet. Bruker standard tema.`);
    return;
  }
  // Apply CSS variables
  for (const [key, value] of Object.entries(selectedTheme)) {
    document.documentElement.style.setProperty(key, value);
  }

  // Update body class for theme-specific CSS if needed (optional)
  const bodyClasses = document.body.className.split(' ').filter(cls => !cls.startsWith('theme-'));
  document.body.className = [...bodyClasses, `theme-${themeName}`].join(' ');

  localStorage.setItem('selectedTheme', themeName);
  // Only update lastChangedDate if it's a manual change or first-time auto change
  if (!isAutoChange || !localStorage.getItem('themeLastChanged')) {
    localStorage.setItem('themeLastChanged', new Date().toISOString().split('T')[0]);
  }
  console.log(`Tema endret til: ${themeName}. Lagret.`);
  setActiveThemeButton(themeName);
}


/**
 * Markerer den aktive temaknappen (visuell feedback).
 * @param {string} themeName - Navnet på det aktive temaet.
 */
function setActiveThemeButton(themeName) {
  document.querySelectorAll('.theme-btn').forEach(button => {
    // Fjern en 'active-theme' klasse hvis du bruker det for styling
    // button.classList.remove('active-theme');
    if (button.id === `theme-btn-${themeName}`) {
      // button.classList.add('active-theme');
      // For nå, ingen spesiell visuell endring på selve knappen, men logger det.
      // console.log(`Temaknapp for ${themeName} er aktiv (ingen visuell endring implementert).`);
    }
  });
}

/**
 * Laster tema ved sideinnlasting, sjekker for automatisk ukentlig bytte.
 */
function loadCheckAndApplyTheme() {
  const savedTheme = localStorage.getItem('selectedTheme');
  const lastChangedStr = localStorage.getItem('themeLastChanged');
  const themeKeys = Object.keys(themes);
  let themeToApply = savedTheme && themes[savedTheme] ? savedTheme : themeKeys[0]; // Default til første tema
  let needsSaveOfDate = !savedTheme; // Trenger å lagre dato hvis det er første gang

  const startOfThisWeek = getStartOfWeek();

  if (lastChangedStr) {
    const lastChangedDate = new Date(lastChangedStr);
    lastChangedDate.setHours(0, 0, 0, 0); // Normaliser for sammenligning

    if (lastChangedDate < startOfThisWeek) {
      console.log("Ny uke! Velger neste tema automatisk. Sist lagret:", lastChangedStr);
      const currentIndex = themeKeys.indexOf(themeToApply);
      const nextIndex = (currentIndex + 1) % themeKeys.length;
      themeToApply = themeKeys[nextIndex];
      console.log("Nytt automatisk tema:", themeToApply);
      applyAndSaveTheme(themeToApply, true); // true for isAutoChange
      return; // Ferdig etter automatisk bytte
    } else {
      console.log("Samme uke. Bruker lagret/manuelt tema:", themeToApply, "Sist lagret:", lastChangedStr);
    }
  } else {
    console.log("Ingen sist byttet dato. Setter og lagrer default tema:", themeToApply);
    needsSaveOfDate = true; // Skal lagre datoen
  }

  applyAndSaveTheme(themeToApply, !needsSaveOfDate); // isAutoChange er false hvis needsSaveOfDate er true
                                                 // (dvs. det er ikke et auto-ukentlig bytte, men første gangs lasting eller manuelt)
}


// --- Gamification Display ---
/**
 * Viser poeng, streak og rank fra localStorage.
 */
function displayGamificationStatus() {
  console.log("--- Kjører displayGamificationStatus (i theme.js) ---");
  // Anta at gamification.js lagrer med generiske nøkler.
  // Hvis gamification-data blir brukerspesifikk, må nøklene her justeres,
  // f.eks. `localStorage.getItem('user_totalPoints_' + currentUserSuffix)`
  const totalPointsStr = localStorage.getItem('user_totalPoints');
  const streakCountStr = localStorage.getItem('streak_count');
  const rankStr = localStorage.getItem('user_rank');
  console.log(`Lest fra localStorage: points='${totalPointsStr}', streak='${streakCountStr}', rank='${rankStr}'`);

  const totalPoints = parseInt(totalPointsStr || '0');
  const streakCount = parseInt(streakCountStr || '0');
  const rank = rankStr || "Nybegynner"; // Default rank

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
/**
 * Markerer den aktive hovednavigasjonsknappen.
 */
function highlightActiveNavButton() {
    const currentPath = window.location.pathname.split("/").pop();
    const navButtons = document.querySelectorAll('.header-main-actions .nav-btn'); // Antar at dette er containeren

    navButtons.forEach(button => {
        button.classList.remove('active');
        const onclickAttr = button.getAttribute('onclick');
        const match = onclickAttr?.match(/'([^']+)'/); // Finner filnavnet i onclick

        if (match && match[1]) {
            const buttonPath = match[1].split("/").pop();
            if (buttonPath === currentPath || (currentPath === '' && buttonPath === 'index.html')) {
                button.classList.add('active');
            }
        }
    });
}

// --- Brukerbytte Logikk ---
/**
 * Oppdaterer hvilken brukerknapp som er markert som aktiv.
 */
function updateUserButtonStates() {
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

/**
 * Bytter den aktive brukeren og laster inn data på nytt.
 * @param {string} newUserSuffix - 'C' for Cornelius, 'W' for William.
 */
function switchUser(newUserSuffix) {
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

  // Kall relevant datalastingsfunksjon basert på gjeldende side
  const currentPage = window.location.pathname.split("/").pop();
  if (currentPage === 'index.html' || currentPage === '') {
    if (typeof loadCustomers === 'function') loadCustomers(); else console.warn("loadCustomers function not found on index page.");
  } else if (currentPage === 'daily-summary.html') {
    if (typeof loadDailySummary === 'function') loadDailySummary(); else console.warn("loadDailySummary function not found on daily summary page.");
  } else if (currentPage === 'tasks.html') {
    if (typeof fetchInitialData_Tasks === 'function') fetchInitialData_Tasks(); else console.warn("fetchInitialData_Tasks function not found on tasks page.");
  } else {
    console.warn("Ingen spesifikk datalastingsfunksjon funnet for denne siden etter brukerbytte:", currentPage);
  }

  // Oppdater gamification display, da dette kan være brukerspesifikt
  // (forutsatt at gamification.js lagrer/henter brukerspesifikt)
  displayGamificationStatus();
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
  console.log("theme.js DOMContentLoaded kjører.");

  // 1. Tema håndtering (automatisk ukentlig og lagret)
  loadCheckAndApplyTheme();

  // 2. Manuelle temaknapp-lyttere
  Object.keys(themes).forEach(themeKey => {
    const buttonId = `theme-btn-${themeKey}`;
    const button = document.getElementById(buttonId);
    if (button) {
      button.addEventListener('click', () => {
        console.log(`Manuell temavalg: ${themeKey}`);
        applyAndSaveTheme(themeKey, false); // false for isAutoChange
      });
    }
  });

  // 3. Brukerbytte initialisering og lyttere
  updateUserButtonStates(); // Sett initiell knappestatus for bruker
  document.getElementById('user-btn-c')?.addEventListener('click', () => switchUser('C'));
  document.getElementById('user-btn-w')?.addEventListener('click', () => switchUser('W'));

  // 4. Vis gamification status
  displayGamificationStatus();

  // 5. Marker aktiv navigasjonsknapp
  highlightActiveNavButton();

});

console.log("theme.js lastet og klar. Aktiv bruker ved start:", currentUserSuffix);
