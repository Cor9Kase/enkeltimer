// theme.js - Håndtering av fargetemaer med automatisk ukentlig bytte

// Definer de ulike temaene med sine fargeverdier
// Sørg for at nøklene (f.eks. 'dark-purple') er unike
// og at verdiene inneholder alle CSS-variablene du vil styre.
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
    // Farger for status/barer
    '--bar-green': '#4CAF50',
    '--bar-yellow': '#ffc107',
    '--bar-red': '#e53935',
    '--bar-background': '#333' // Bakgrunn for timebar f.eks.
    // Legg til flere fargevariabler du bruker her...
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
    // Farger for status/barer
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
    '--accent-primary': '#2ecc71',
    '--accent-secondary': '#27ae60',
    '--border-inactive': '#3e5a54',
    // Farger for status/barer
    '--bar-green': '#4CAF50',
    '--bar-yellow': '#ffc107',
    '--bar-red': '#e53935',
    '--bar-background': '#44645d'
  }
  // Legg gjerne til flere temaer her for mer variasjon!
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
  // Beregn differansen til mandag. Hvis søndag (0), gå 6 dager tilbake. Ellers (day - 1) dager tilbake.
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0); // Sett tid til midnatt for pålitelig sammenligning
  return monday;
}

// --- Tema-logikk ---

/**
 * Bruker et gitt tema ved å sette CSS-variabler på rot-elementet (<html>).
 * @param {string} themeName Navnet på temaet som skal brukes (må finnes i themes-objektet).
 */
function applyTheme(themeName) {
  const theme = themes[themeName];
  if (!theme) {
    console.warn(`Tema "${themeName}" ble ikke funnet. Bruker ingen endring.`);
    return;
  }

  console.log(`Bruker tema: ${themeName}`);
  // Oppdater CSS-variablene definert i temaet
  for (const variable in theme) {
    // Sjekk for sikkerhets skyld at det er en egenskap i objektet
    if (Object.hasOwnProperty.call(theme, variable)) {
       document.documentElement.style.setProperty(variable, theme[variable]);
    }
  }
   // Legg til en klasse på body for eventuell CSS-spesifikk styling per tema
   document.body.className = `theme-${themeName}`; // Fjerner gamle tema-klasser
}

/**
 * Lagrer det valgte temaet og dagens dato i localStorage.
 * @param {string} themeName Navnet på temaet som skal lagres.
 */
function saveThemeAndDate(themeName) {
  if (themes[themeName]) {
    const today = new Date().toISOString().split('T')[0]; // Lagre dato som YYYY-MM-DD
    localStorage.setItem('selectedTheme', themeName);
    localStorage.setItem('themeLastChanged', today);
    console.log(`Tema "${themeName}" lagret med dato ${today}.`);
  } else {
    console.warn(`Kan ikke lagre ukjent tema: ${themeName}`);
  }
}

/**
 * Hovedfunksjon som kjøres ved sideinnlasting:
 * 1. Henter lagret tema og dato.
 * 2. Sjekker om det er på tide å bytte tema (hvis sist byttet var før denne mandagen).
 * 3. Velger neste tema syklisk hvis det er på tide å bytte.
 * 4. Bruker det valgte temaet.
 * 5. Lagrer det nye temaet og/eller datoen hvis en endring skjedde.
 */
function loadCheckAndApplyTheme() {
  const savedTheme = localStorage.getItem('selectedTheme');
  const lastChangedStr = localStorage.getItem('themeLastChanged');
  const themeKeys = Object.keys(themes); // Få listen over tilgjengelige temanavn

  // Bestem starttema: lagret tema hvis gyldig, ellers det første i listen
  let themeToApply = savedTheme && themes[savedTheme] ? savedTheme : themeKeys[0];
  let needsSave = !savedTheme; // Må lagre hvis det ikke fantes et lagret tema

  const startOfThisWeek = getStartOfWeek(); // Finner mandag denne uken

  if (lastChangedStr) {
    const lastChangedDate = new Date(lastChangedStr);
    lastChangedDate.setHours(0, 0, 0, 0); // Nullstill tid for sammenligning

    // Sjekk om sist lagret dato er FØR starten av denne uken
    if (lastChangedDate < startOfThisWeek) {
      console.log("Ny uke! På tide å bytte tema. Sist byttet:", lastChangedStr);
      // Finn indeksen til det nåværende temaet
      const currentIndex = themeKeys.indexOf(themeToApply);
      // Beregn neste indeks, gå tilbake til 0 hvis vi er på slutten
      const nextIndex = (currentIndex + 1) % themeKeys.length;
      themeToApply = themeKeys[nextIndex]; // Velg neste tema
      console.log("Nytt automatisk tema valgt:", themeToApply);
      needsSave = true; // Marker at vi må lagre det nye temaet og datoen
    } else {
      console.log("Fortsatt samme uke. Beholder tema. Sist byttet:", lastChangedStr);
      // Ikke behov for å lagre på nytt med mindre default ble brukt initielt
    }
  } else {
    // Hvis ingen dato er lagret (f.eks. første besøk)
    console.log("Ingen sist byttet dato funnet. Setter og lagrer default tema:", themeToApply);
    needsSave = true; // Marker at vi må lagre default tema og dato
  }

  // Bruk det bestemte temaet (enten gammelt eller nytt)
  applyTheme(themeToApply);

  // Lagre tema og dato hvis en endring skjedde eller ved første besøk
  if (needsSave) {
    saveThemeAndDate(themeToApply);
  }
}

// --- Kjør logikken når siden er klar ---
// Bruker DOMContentLoaded for å sikre at document.documentElement er tilgjengelig
document.addEventListener('DOMContentLoaded', loadCheckAndApplyTheme);

// MERK: Eventuelle lyttere for manuelle temaknapper er fjernet.
// Hvis du VIL ha manuelle knapper i tillegg, må de legges til
// og kalle applyTheme() og saveThemeAndDate() ved klikk.
