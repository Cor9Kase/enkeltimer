function parseHHMMSSToDecimalHours(timeString) {
  if (!timeString || typeof timeString !== 'string') return null;
  const parts = timeString.split(':');
  if (parts.length !== 3) return null;

  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parseInt(parts[2], 10);

  if (
    isNaN(hours) ||
    isNaN(minutes) ||
    isNaN(seconds) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }

  const totalSecondsValue = hours * 3600 + minutes * 60 + seconds;
  const decimalHours = totalSecondsValue / 3600;
  return Math.round(decimalHours * 4) / 4;
}

if (typeof module !== 'undefined') {
  module.exports = { parseHHMMSSToDecimalHours };
} else if (typeof window !== 'undefined') {
  window.parseHHMMSSToDecimalHours = parseHHMMSSToDecimalHours;
}
