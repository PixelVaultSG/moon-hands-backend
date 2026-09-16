/**
 * Moon Hands — Date/Time Helpers (Singapore timezone)
 */

function formatDateSG(dateInput) {
  // Handle date strings by appending Singapore timezone to avoid UTC shift
  let d;
  if (typeof dateInput === 'string' && dateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
    d = new Date(dateInput + 'T00:00:00+08:00');
  } else {
    d = new Date(dateInput);
  }
  if (isNaN(d.getTime())) return 'TBD';
  return d.toLocaleDateString('en-SG', {
    timeZone: 'Asia/Singapore',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTimeSG(dateInput) {
  // Handle time-only strings like "11:30" or "11:30:00"
  if (typeof dateInput === 'string' && !dateInput.match(/^\d{4}-\d{2}-\d{2}/)) {
    const timeMatch = dateInput.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM|am|pm)?$/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10);
      const minutes = timeMatch[2];
      const ampm = timeMatch[3]?.toUpperCase();
      if (ampm === 'PM' && hours !== 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
      const period = hours >= 12 ? 'PM' : 'AM';
      const displayH = hours % 12 || 12;
      return `${displayH}:${minutes} ${period}`;
    }
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return 'TBD';
  return d.toLocaleTimeString('en-SG', {
    timeZone: 'Asia/Singapore',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function getDayName(dateInput) {
  let d;
  if (typeof dateInput === 'string' && dateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
    d = new Date(dateInput + 'T00:00:00+08:00');
  } else {
    d = new Date(dateInput);
  }
  if (isNaN(d.getTime())) return '';
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
