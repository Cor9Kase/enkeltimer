// theme.js - Håndtering av fargetemaer med automatisk ukentlig bytte OG manuell overstyring

const themes = {
  'dark-purple': { // Eksisterende
    '--bg-dark': '#121212',
    '--bg-card': '#1e1e1e',
    '--bg-modal': '#242424',
    '--text-primary': '#ffffff',
    '--text-secondary': '#b0b0b0',
    '--accent-primary': '#9d4edd',
    '--accent-secondary': '#7b2cbf',
    '--accent-gradient': 'linear-gradient(135deg, #9d4edd, #7b2cbf)', // Behold gradient for header
    '--border-inactive': '#383838',
    '--bar-green': '#4CAF50',
    '--bar-yellow': '#ffc107',
    '--bar-red': '#e53935',
    '--bar-background': '#333'
  },
  'light-blue': { // Eksisterende
    '--bg-dark': '#f4f7f9',
    '--bg-card': '#ffffff',
    '--bg-modal': '#ffffff',
    '--text-primary': '#2c3e50',
    '--text-secondary': '#7f8c8d',
    '--accent-primary': '#3498db',
    '--accent-secondary': '#2980b9',
    '--accent-gradient': 'linear-gradient(135deg, #3498db, #2980b9)',
    '--border-inactive': '#dce4e8',
    '--bar-green': '#2ecc71',
    '--bar-yellow': '#f1c40f',
    '--bar-red': '#e74c3c',
    '--bar-background': '#ecf0f1'
  },
  'forest-green': { // Eksisterende
    '--bg-dark': '#1a2a27',
    '--bg-card': '#243d38',
    '--bg-modal': '#2a4a43',
    '--text-primary': '#e0e0e0',
    '--text-secondary': '#a0a0a0',
    '--accent-primary': '#2ecc71',
    '--accent-secondary': '#27ae60',
    '--accent-gradient': 'linear-gradient(135deg, #2ecc71, #27ae60)',
    '--border-inactive': '#3e5a54',
    '--bar-green': '#4CAF50',
    '--bar-yellow': '#ffc107',
    '--bar-red': '#e53935',
    '--bar-background': '#44645d'
  },
  // === NYE TEMAER ===
  'ocean-breeze': { // Nytt lyst tema med blå/turkis
    '--bg-dark': '#e0f7fa', // Veldig lys cyan
    '--bg-card': '#ffffff',
    '--bg-modal': '#ffffff',
    '--text-primary': '#004d40', // Mørk teal tekst
    '--text-secondary': '#4db6ac', // Lysere teal
    '--accent-primary': '#00acc1', // Cyan hovedfarge
    '--accent-secondary': '#00838f', // Mørkere cyan
    '--accent-gradient': 'linear-gradient(135deg, #4dd0e1, #00acc1)', // Lysere gradient
    '--border-inactive': '#b2ebf2', // Veldig lys cyan kant
    '--bar-green': '#81c784', // Dusere grønn
    '--bar-yellow': '#ffd54f', // Dusere gul
    '--bar-red': '#ef9a9a',   // Dusere rød
    '--bar-background': '#cfd8dc' // Lys grå bakgrunn
  },
  'sunset-glow': { // Nytt varmt, mørkt tema
    '--bg-dark': '#212121', // Mørk grå base
    '--bg-card': '#313131', // Litt lysere grå
    '--bg-modal': '#3a3a3a',
    '--text-primary': '#f5f5f5', // Off-white
    '--text-secondary': '#bdbdbd', // Lys grå
    '--accent-primary': '#ff8a65', // Varm oransje
    '--accent-secondary': '#ff7043', // Litt sterkere oransje
    '--accent-gradient': 'linear-gradient(135deg, #ffb74d, #ff8a65, #e57373)', // Oransje -> Rødlig gradient
    '--border-inactive': '#424242', // Mørk grå kant
    '--bar-green': '#a5d6a7', // Lys grønn
    '--bar-yellow': '#fff176', // Lys gul
    '--bar-red': '#ef9a9a',   // Lys rød
    '--bar-background': '#454545'
  },
   'monochrome-mint': { // Nytt dus, mørkt tema
    '--bg-dark': '#263238', // Mørk blågrå
    '--bg-card': '#37474f', // Litt lysere blågrå
    '--bg-modal': '#455a64',
    '--text-primary': '#eceff1', // Lys gråblå
    '--text-secondary': '#90a4ae', // Medium gråblå
    '--accent-primary': '#80cbc4', // Dus mintgrønn
    '--accent-secondary': '#4db6ac', // Litt mørkere mint
    '--accent-gradient': 'linear-gradient(135deg, #a7ffeb, #80cbc4)', // Mint gradient
    '--border-inactive': '#546e7a',
    '--bar-green': '#a5d6a7',
    '--bar-yellow': '#fff59d',
    '--bar-red': '#ef9a9a',
    '--bar-background': '#546e7a' // Samme som kant
  }
  // ==================
};

// --- Hjelpefunksjoner (uendret) ---
function getStartOfWeek(date = new Date()) {
  // ... (som før) ...
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// --- Tema-logikk (uendret) ---
function applyTheme(themeName) {
  // ... (som før) ...
  const theme = themes[themeName];
  if (!theme) {
    console.warn(`Tema "${themeName}" ble ikke funnet.`);
    return;
  }
  console.log(`Bruker tema: ${themeName}`);
  for (const variable in theme) {
    if (Object.hasOwnProperty.call(theme, variable)) {
       document.documentElement.style.setProperty(variable, theme[variable]);
    }
  }
  const bodyClasses = document.body.className.split(' ').filter(cls => !cls.startsWith('theme-'));
  document.body.className = [...bodyClasses, `theme-${themeName}`].join(' ');
}

function saveThemeAndDate(themeName) {
  // ... (som før) ...
   if (themes[themeName]) {
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem('selectedTheme', themeName);
    localStorage.setItem('themeLastChanged', today);
    console.log(`Tema "${themeName}" lagret med dato ${today}.`);
  } else {
    console.warn(`Kan ikke lagre ukjent tema: ${themeName}`);
  }
}

function loadCheckAndApplyTheme() {
  // ... (som før) ...
   const savedTheme = localStorage.getItem('selectedTheme');
  const lastChangedStr = localStorage.getItem('themeLastChanged');
  const themeKeys = Object.keys(themes);
  let themeToApply = savedTheme && themes[savedTheme] ? savedTheme : themeKeys[0];
  let needsSave = !savedTheme;
  const startOfThisWeek = getStartOfWeek();
  if (lastChangedStr) {
    const lastChangedDate = new Date(lastChangedStr);
    lastChangedDate.setHours(0, 0, 0, 0);
    if (lastChangedDate < startOfThisWeek) {
      console.log("Ny uke! Velger neste tema automatisk. Sist lagret:", lastChangedStr);
      const currentIndex = themeKeys.indexOf(themeToApply);
      const nextIndex = (currentIndex + 1) % themeKeys.length;
      themeToApply = themeKeys[nextIndex];
      console.log("Nytt automatisk tema:", themeToApply);
      needsSave = true;
    } else {
      console.log("Samme uke. Bruker lagret/manuelt tema:", themeToApply, "Sist lagret:", lastChangedStr);
    }
  } else {
    console.log("Ingen sist byttet dato. Setter og lagrer default tema:", themeToApply);
    needsSave = true;
  }
  applyTheme(themeToApply);
  if (needsSave) {
    saveThemeAndDate(themeToApply);
  }
}

// --- Kjør logikken når siden er klar ---
document.addEventListener('DOMContentLoaded', () => {
  // 1. Sjekk og bruk tema (automatisk bytte eller lagret)
  loadCheckAndApplyTheme();

  // 2. Legg til lyttere for MANUELLE temaknapper
  const addThemeButtonListener = (buttonId) => {
      const button = document.getElementById(buttonId);
      if (button) {
          const themeName = buttonId.replace('theme-btn-', '');
          if (themes[themeName]) {
              button.addEventListener('click', () => {
                  console.log(`Manuell valg: ${themeName}`);
                  applyTheme(themeName);
                  saveThemeAndDate(themeName);
              });
          } else {
               console.warn(`Knapp ${buttonId} funnet, men temaet ${themeName} finnes ikke.`);
          }
      }
  };

  // Legg til lyttere for ALLE definerte temaknapper
  addThemeButtonListener('theme-btn-dark-purple');
  addThemeButtonListener('theme-btn-light-blue');
  addThemeButtonListener('theme-btn-forest-green');
  addThemeButtonListener('theme-btn-ocean-breeze'); // <-- Ny
  addThemeButtonListener('theme-btn-sunset-glow');  // <-- Ny
  addThemeButtonListener('theme-btn-monochrome-mint'); // <-- Ny
});
