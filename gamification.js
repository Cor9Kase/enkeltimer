// gamification.js - Logikk for Streak og Rank

// === DEFINISJON AV RANKS ===
const ranks = [
    // Sortert fra lavest til høyest krav
    { name: "Nybegynner", minDays: 0, minStreak: 0 },
    { name: "Lærling", minDays: 7, minStreak: 3 },
    { name: "Svenn", minDays: 14, minStreak: 5 },
    { name: "Erfaren", minDays: 30, minStreak: 7 },
    { name: "Mester", minDays: 60, minStreak: 10 },
    { name: "Guru", minDays: 90, minStreak: 14 },
];
// ==========================

// --- HJELPEFUNKSJONER ---
function isWeekend(date) {
    const day = date.getDay(); // 0 = Søndag, 6 = Lørdag
    return day === 0 || day === 6;
}

function getISODateString(date) {
    // Sikrer at Date-objektet er gyldig før kall til toISOString
    if (date instanceof Date && !isNaN(date)) {
        return date.toISOString().split('T')[0];
    }
    console.warn("getISODateString mottok ugyldig dato:", date);
    return null; // Returner null hvis datoen er ugyldig
}
// --- SLUTT HJELPEFUNKSJONER ---


// --- FUNKSJON for å beregne og lagre Rank ---
function calculateAndSaveRank(firstDateStr, streak) {
    // 'ranks'-arrayet er definert globalt over
    if (!firstDateStr) {
         localStorage.setItem('user_rank', ranks[0].name);
         console.log("Rank (gamification.js): Mangler første logg-dato, setter rank til Nybegynner.");
         return;
    }
    const firstDate = new Date(firstDateStr);
    if (isNaN(firstDate)) { // Sjekk om datoen er gyldig
         localStorage.setItem('user_rank', ranks[0].name);
         console.warn("Rank (gamification.js): Ugyldig første logg-dato lagret:", firstDateStr);
         return;
    }
    const today = new Date();
    firstDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    // Beregn antall hele dager siden start
    const daysSinceStart = Math.floor((today.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));

    let currentRank = ranks[0].name; // Start som default rank

    // Gå gjennom ranks baklengs for å finne den høyeste oppnådde
    for (let i = ranks.length - 1; i >= 0; i--) {
        if (daysSinceStart >= ranks[i].minDays && streak >= ranks[i].minStreak) {
            currentRank = ranks[i].name;
            break; // Fant høyeste rank, trenger ikke sjekke lavere
        }
    }
    console.log(`Rank Beregning (gamification.js): Dager=${daysSinceStart}, Streak=${streak} => Rank=${currentRank}`);
    localStorage.setItem('user_rank', currentRank); // Lagre den beregnede ranken
}
// --- SLUTT calculateAndSaveRank ---


// --- FUNKSJON for å oppdatere Streak og Rank (kalles fra script.js) ---
function updateStreakAndRank() {
    console.log("updateStreakAndRank (gamification.js) kjører...");
    const today = new Date();
    const todayStr = getISODateString(today);
    if (!todayStr) return; // Stopp hvis dato er ugyldig

    // Ikke tell streak for helgedager, men lagre datoen
    if (isWeekend(today)) {
        console.log("Streak (gamification.js): Hopper over helgedag.");
        localStorage.setItem('streak_lastLogDate', todayStr);
        // Vis eksisterende rank/streak selv om ingenting ble økt
        if (typeof displayStreakAndRank === 'function') { displayStreakAndRank(); }
        return;
    }

    const lastLogStr = localStorage.getItem('streak_lastLogDate');
    let currentStreak = parseInt(localStorage.getItem('streak_count') || '0');
    let firstLogStr = localStorage.getItem('streak_firstLogDate');

    // Sett første logg-dato hvis den ikke finnes
    if (!firstLogStr) {
        firstLogStr = todayStr;
        localStorage.setItem('streak_firstLogDate', firstLogStr);
        console.log("Streak (gamification.js): Setter første logg-dato:", firstLogStr);
    }

    let streakContinued = false;
    if (lastLogStr) {
        const lastLogDate = new Date(lastLogStr);
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);

        if (!isNaN(lastLogDate)) { // Sjekk om gyldig dato
            const lastLogDateStrComp = getISODateString(lastLogDate);
            const yesterdayStrComp = getISODateString(yesterday);

            if (lastLogDateStrComp === yesterdayStrComp) {
                // Logget i går (og i går var ikke helg, siden vi sjekket 'today' øverst)
                streakContinued = true;
            } else if (today.getDay() === 1) { // Hvis i dag er mandag
                const lastFriday = new Date(today);
                lastFriday.setDate(today.getDate() - 3);
                const lastFridayStrComp = getISODateString(lastFriday);
                // Sjekk om sist logget var på fredag, lørdag eller søndag
                if (lastLogDateStrComp && lastFridayStrComp && lastLogDateStrComp >= lastFridayStrComp) {
                    streakContinued = true;
                    console.log("Streak (gamification.js): Fortsetter fra helgen.");
                }
            }
        } else {
            console.warn("Ugyldig lastLogDate funnet i localStorage:", lastLogStr);
            // Behandle som brutt streak hvis datoen er ugyldig?
            streakContinued = false;
        }
    }

    // Oppdater streak-teller basert på sjekken over
    if (lastLogStr === todayStr) {
         // Hvis det allerede er logget i dag (på denne arbeidsdagen), ikke øk streaken
         console.log("Streak (gamification.js): Allerede logget i dag, streak uendret:", currentStreak);
    } else if (streakContinued) {
        // Hvis streaken fortsatte fra forrige arbeidsdag
        currentStreak++;
        console.log("Streak (gamification.js): Fortsatt! Ny streak:", currentStreak);
    } else {
        // Hvis streaken ble brutt eller dette er første logging
        currentStreak = 1;
        console.log("Streak (gamification.js): Ny streak startet:", currentStreak);
    }

    // Lagre oppdatert streak og siste logg-dato
    localStorage.setItem('streak_count', currentStreak.toString());
    localStorage.setItem('streak_lastLogDate', todayStr);

    // Beregn og lagre rank basert på oppdatert streak og første logg-dato
    calculateAndSaveRank(firstLogStr, currentStreak);

    // Kall display-funksjonen fra theme.js for å oppdatere UI umiddelbart
    if (typeof displayStreakAndRank === 'function') {
         displayStreakAndRank();
    } else {
         console.error("displayStreakAndRank (gamification.js) function not found (expected in theme.js)");
    }
}
// --- SLUTT updateStreakAndRank ---

console.log("gamification.js lastet og klar."); // Bekreftelse på at filen er lastet
