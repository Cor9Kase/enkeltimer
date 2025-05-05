// theme.js - Håndtering av fargetemaer med automatisk ukentlig bytte OG manuell overstyring

// Definer de ulike temaene med sine fargeverdier
const themes = {
  'dark-purple': { // Samsvarer med din opprinnelige stil (ca.)
    '--bg-dark': '#121212',
    '--bg-card': '#1e1e1e',
    '--bg-modal': '#242424',
    '--text-primary': '#ffffff',
    '--text-secondary': '#b0b0b0',
    '--accent-primary': '#9d4edd',
    '--accent-secondary': '#7b2cbf',
    '--border-inactive': '#383838',
    '--bar-green': '#4CAF50',
    '--bar-yellow': '#ffc107',
    '--bar-red': '#e53935',
    '--bar-background': '#333'
  },
  'light-blue': { // Eksempel på et lyst tema
    '--bg-dark': '#f4f7f9',
    '--bg-card': '#ffffff',
    '--bg-modal': '#ffffff',
    '--text-primary': '#2c3e50',
    '--text-secondary': '#7f8c8d',
    '--accent-primary': '#3498db',
    '--accent-secondary': '#2980b9',
    '--border-inactive': '#dce4e8',
    '--bar-green': '#2ecc71',
    '--bar-yellow': '#f1c40f',
    '--bar-red': '#e74c3c',
    '--bar-background': '#ecf0f1'
  },
  'forest-green': { // Eksempel på et annet mørkt tema
    '--bg-dark': '#1a2a27',
    '--bg-card': '#243d38',
    '--bg-modal': '#2a4a43',
    '--text-primary': '#e0e0e0',
    '--text-secondary': '#a0a0a0',
    '--accent-primary': '#2ecc71', // Grønn hovedfarge
    '--accent-secondary': '#27ae60', // Mørkere grønn
    '--border-inactive': '#3e5a54',
    '--bar-green': '#4CAF50',
    '--bar-yellow': '#ffc107',
    '--bar-red': '#e53935',
    '--bar-background': '#44645d'
  }
  // Legg til flere temaer her...
};

// --- Hjelpefunksjoner ---

/**
 * Finner datoen for mandagen i den gitte datoens uke.
 * @param {Date} [date=new Date()] Datoen å basere uken på (standard er i dag).
 * @returns {Date} Et Date-objekt for mandagen kl 00:00:00.
 */
function getStartOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Søndag, 1 = Mandag, ..., 6 = Lørdag
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Juster til mandag
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0); // Sett tid til midnatt for pålitelig sammenligning
  return monday;
}

// --- Tema-logikk ---

/**
 * Bruker et gitt tema ved å sette CSS-variabler på rot-elementet (<html>).
 * Legger også til en klasse på body for spesifikk styling.
 * @param {string} themeName Navnet på temaet som skal brukes.
 */
function applyTheme(themeName) {
  const theme = themes[themeName];
  if (!theme) {
    console.warn(`Tema "${themeName}" ble ikke funnet. Bruker ingen endring.`);
    return;
  }

  console.log(`Bruker tema: ${themeName}`);
  // Oppdater CSS-variablene
  for (const variable in theme) {
    if (Object.hasOwnProperty.call(theme, variable)) {
       document.documentElement.style.setProperty(variable, theme[variable]);
    }
  }
  // Fjern gamle tema-klasser og legg til den nye på body
  // Dette er nyttig hvis du trenger tema-spesifikk CSS utover variabler
  const bodyClasses = document.body.className.split(' ').filter(cls => !cls.startsWith('theme-'));
  document.body.className = [...bodyClasses, `theme-${themeName}`].join(' ');
}

/**
 * Lagrer det valgte temaet og dagens dato i localStorage.
 * @param {string} themeName Navnet på temaet som skal lagres.
 */
function saveThemeAndDate(themeName) {
  if (themes[themeName]) {
    const today = new Date().toISOString().split('T')[0]; // Lagre dato som YYYY-MM-DD
    localStorage.setItem('selectedTheme', themeName);
    localStorage.setItem('themeLastChanged', today); // Lagre datoen da valget ble gjort
    console.log(`Tema "${themeName}" lagret med dato ${today}.`);
  } else {
    console.warn(`Kan ikke lagre ukjent tema: ${themeName}`);
  }
}

/**
 * Hovedfunksjon som kjøres ved sideinnlasting:
 * Sjekker om det er på tide å bytte tema automatisk,
 * og bruker enten det lagrede eller det nye automatiske temaet.
 */
function loadCheckAndApplyTheme() {
  const savedTheme = localStorage.getItem('selectedTheme');
  const lastChangedStr = localStorage.getItem('themeLastChanged');
  const themeKeys = Object.keys(themes);

  let themeToApply = savedTheme && themes[savedTheme] ? savedTheme : themeKeys[0]; // Start med lagret/default
  let needsSave = !savedTheme; // Må lagre hvis ingen tema var lagret fra før

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
      needsSave = true; // Marker at nytt tema og dato må lagres
    } else {
      console.log("Samme uke. Bruker lagret/manuelt tema:", themeToApply, "Sist lagret:", lastChangedStr);
      // Ikke behov for å lagre på nytt hvis temaet er det samme som lagret
    }
  } else {
    console.log("Ingen sist byttet dato. Setter og lagrer default tema:", themeToApply);
    needsSave = true;
  }

  applyTheme(themeToApply); // Bruk det bestemte temaet

  if (needsSave) {
    saveThemeAndDate(themeToApply); // Lagre hvis det var første gang eller automatisk bytte
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
                  applyTheme(themeName);       // Bruk temaet umiddelbart
                  saveThemeAndDate(themeName); // Lagre manuelt valg OG dagens dato
              });
          } else {
               console.warn(`Knapp ${buttonId} funnet, men temaet ${themeName} finnes ikke.`);
          }
      } else {
          // console.warn(`Temaknapp med ID ${buttonId} ble ikke funnet.`);
      }
  };

  // Legg til lyttere for alle definerte temaknapper
  addThemeButtonListener('theme-btn-dark-purple');
  addThemeButtonListener('theme-btn-light-blue');
  addThemeButtonListener('theme-btn-forest-green');
  // Legg til flere her hvis du lager flere temaer/knapper
});
