# Enkeltimer

This project contains a small time and task tracking web app. All files are static
HTML/JS/CSS and can be opened directly in a browser.

## Setup
1. Open `script.js` and set the `GOOGLE_SCRIPT_URL` constant near the top of the file to
your deployed Google Apps Script endpoint.
2. Open `index.html` in a browser to track time for customers. Use `tasks.html` for
task management and `daily-summary.html` for summaries.

The application adjusts the visual theme automatically based on the time of day,
so manual theme buttons have been removed from the HTML.

## Development
No build step is required. Simply edit the files and refresh your browser. If you
change the Google script URL or user suffix you may need to clear localStorage.
