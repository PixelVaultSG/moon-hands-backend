/**
 * Moon Hands — Date/Time Helpers (Singapore timezone)
 */

function formatDateSG(dateInput) {
  const d = new Date(dateInput);
  return d.toLocaleDateString('en-SG', {
    timeZone: 'Asia/Singapore',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTimeSG(dateInput) {
  const d = new Date(dateInput);
  return d.toLocaleTimeString('en-SG', {
    timeZone: 'Asia/Singapore',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function getDayName(dateInput) {
  const d = new Date(dateInput);
  return d.toLocaleDateString('en-SG', {
    timeZone: 'Asia/Singapore',
    weekday: 'long',
  });
}

function getTodaySG() {
  return new Date().toLocaleDateString('en-SG', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).split('/').reverse().join('-'); // YYYY-MM-DD
}

function isClinicOpenNow(operatingHours) {
  const now = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[now.getDay()];
  
  const hours = operatingHours?.find(h => h.day === dayName);
  if (!hours || !hours.isOpen) return false;
  
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [openH, openM] = hours.open_time.split(':').map(Number);
  const [closeH, closeM] = hours.close_time.split(':').map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;
  
  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

module.exports = {
  formatDateSG,
  formatTimeSG,
  getDayName,
  getTodaySG,
  isClinicOpenNow,
};
