// theme.js - Håndtering av fargetemaer, visning av gamification, og aktiv nav-knapp

// Definer de ulike temaene med sine fargeverdier
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
    '--bar-green': '#4CAF50',
    '--bar-yellow': '#ffc107',
    '--bar-red': '#e53935',
    '--bar-background': '#333'
  },
  'light-blue': {
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
  'forest-green': {
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
  'ocean-breeze': {
    '--bg-dark': '#e0f7fa',
    '--bg-card': '#ffffff',
    '--bg-modal': '#ffffff',
    '--text-primary': '#004d40',
    '--text-secondary': '#4db6ac',
    '--accent-primary': '#00acc1',
    '--accent-secondary': '#00838f',
    '--accent-gradient': 'linear-gradient(135deg, #4dd0e1, #00acc1)',
    '--border-inactive': '#b2ebf2',
    '--bar-green': '#81c784',
    '--bar-yellow': '#ffd54f',
    '--bar-red': '#ef9a9a',
    '--bar-background': '#cfd8dc'
  },
  'sunset-glow': {
    '--bg-dark': '#212121',
    '--bg-card': '#313131',
    '--bg-modal': '#3a3a3a',
    '--text-primary': '#f5f5f5',
    '--text-secondary': '#bdbdbd',
    '--accent-primary': '#ff8a65',
    '--accent-secondary': '#ff7043',
    '--accent-gradient': 'linear-gradient(135deg, #ffb74d, #ff8a65, #e57373)',
    '--border-inactive': '#424242',
    '--bar-green': '#a5d6a7',
    '--bar-yellow': '#fff176',
    '--bar-red': '#ef9a9a',
    '--bar-background': '#454545'
  },
   'monochrome-mint': {
    '--bg-dark': '#263238',
    '--bg-card': '#37474f',
    '--bg-modal': '#455a64',
    '--text-primary': '#eceff1',
    '--text-secondary': '#90a4ae',
    '--accent-primary': '#80cbc4',
    '--accent-secondary': '#4db6ac',
    '--accent-gradient': 'linear-gradient(135deg, #a7ffeb, #80cbc4)',
    '--border-inactive': '#546e7a',
    '--bar-green': '#a5d6a7',
    '--bar-yellow': '#fff59d',
    '--bar-red': '#ef9a9a',
    '--bar-background': '#546e7a'
  }
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
  // Oppdater body-klasse for evt. tema-spesifikk CSS
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
 * Hovedfunksjon som kjøres ved sideinnlasting for tema:
 * Sjekker om det er på tide å bytte tema automatisk,
 * og bruker enten det lagrede eller det nye automatiske temaet.
 */
function loadCheckAndApplyTheme() {
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

  applyTheme(themeToApply); // Bruk det bestemte temaet

  if (needsSave) {
    saveThemeAndDate(themeToApply); // Lagre hvis det var første gang eller automatisk bytte
  }
}

// --- Gamification Display ---

/**
 * Leser poeng, streak og rank fra localStorage og oppdaterer HTML-elementene.
 */
function displayGamificationStatus() {
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

    if (!pointsElement) console.warn("#points-display elementet ble IKKE funnet i HTML!");
    if (!streakElement) console.warn("#streak-display elementet ble IKKE funnet i HTML!");
    if (!rankElement) console.warn("#rank-display elementet ble IKKE funnet i HTML!");

    if (pointsElement) {
        pointsElement.innerHTML = `✨ ${totalPoints} Poeng`;
        pointsElement.style.display = 'inline-block';
        console.log("Oppdaterte #points-display.");
    }

    if (streakElement) {
        if (streakCount > 0) {
            streakElement.innerHTML = `🔥 ${streakCount} dager på rad!`;
            streakElement.style.display = 'inline-block';
            console.log("Oppdaterte #streak-display.");
        } else {
            streakElement.style.display = 'none';
            console.log("Skjulte #streak-display (streak = 0).");
        }
    }

    if (rankElement) {
        rankElement.innerHTML = `🏆 Rank: ${rank}`;
         rankElement.style.display = 'inline-block';
         console.log("Oppdaterte #rank-display.");
    }

    console.log("--- Ferdig med displayGamificationStatus ---");
}

// === NY FUNKSJON for å markere aktiv navigeringsknapp ===
function highlightActiveNavButton() {
    // window.location.pathname gir hele stien, f.eks. "/mappe/index.html"
    // Vi henter bare filnavnet for enkel sammenligning
    const currentPath = window.location.pathname.split("/").pop();
    // Finn knapper innenfor BEGGE mulige header-strukturer
    const navButtons = document.querySelectorAll('.header-main-actions .nav-btn, .nav-buttons .nav-btn');

    console.log("HighlightNav: Current path:", currentPath);

    navButtons.forEach(button => {
        button.classList.remove('active'); // Fjern 'active' fra alle først

        // Trekk ut filnavnet fra knappens onclick-attributt
        const onclickAttr = button.getAttribute('onclick');
        // Bruker regulært uttrykk for å finne strengen mellom enkle anførselstegn
        const match = onclickAttr?.match(/'([^']+)'/);

        if (match && match[1]) {
            const buttonPath = match[1].split("/").pop(); // Hent filnavnet fra href
            console.log("HighlightNav: Checking button:", buttonPath);
            // Marker som aktiv hvis knappens sti matcher nåværende sti
            // Spesialhåndtering for rot ("/" eller tom streng) som skal matche index.html
            if (buttonPath === currentPath || (currentPath === '' && buttonPath === 'index.html')) {
                console.log("HighlightNav: Setting active:", buttonPath);
                button.classList.add('active');
            }
        } else {
             console.warn("HighlightNav: Kunne ikke finne URL i onclick for knappen:", button);
        }
    });
}
// === SLUTT NY FUNKSJON ===


// --- Kjør logikken når siden er klar ---
document.addEventListener('DOMContentLoaded', () => {
  console.log("theme.js DOMContentLoaded kjører.");
  // 1. Sjekk og bruk tema (automatisk bytte eller lagret)
  loadCheckAndApplyTheme();

  // 2. Vis lagret gamification-status
  displayGamificationStatus();

  // === NYTT: Marker aktiv nav-knapp ===
  highlightActiveNavButton();
  // ====================================

  // 4. Legg til lyttere for MANUELLE temaknapper
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
      }
  };

  // Legg til lyttere for alle definerte temaknapper
  addThemeButtonListener('theme-btn-dark-purple');
  addThemeButtonListener('theme-btn-light-blue');
  addThemeButtonListener('theme-btn-forest-green');
  addThemeButtonListener('theme-btn-ocean-breeze');
  addThemeButtonListener('theme-btn-sunset-glow');
  addThemeButtonListener('theme-btn-monochrome-mint');
});

console.log("theme.js lastet og klar (med poeng-visning og aktiv nav-knapp)."); // Bekreftelse
