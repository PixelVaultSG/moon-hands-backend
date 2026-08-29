/**
 * Moon Hands — WhatsApp Interactive Messages
 * 
 * Generates 360dialog-compatible interactive message payloads:
 *   - List Messages: Menu with up to 10 options (for welcome/services)
 *   - Quick Reply Buttons: Up to 3 buttons (for yes/no confirmations)
 * 
 * These reduce ambiguity, eliminate typos, and guide patients through
 * structured choices — key for top 3% SaaS bot UX.
 */

/**
 * Build a List Message payload for 360dialog
 * Used for: Welcome menu, service categories, treatment selection
 */
function buildListMessage({ header, body, footer, buttonText, rows }) {
  return {
    type: 'interactive',
    interactive: {
      type: 'list',
      header: header ? { type: 'text', text: header } : undefined,
      body: { text: body },
      footer: footer ? { text: footer } : undefined,
      action: {
        button: buttonText || 'View Menu',
        sections: [{
          title: 'Menu',
          rows: rows.map(r => ({
            id: r.id,
            title: r.title,
            description: r.description || undefined
          }))
        }]
      }
    }
  };
}

/**
 * Build Quick Reply Buttons payload for 360dialog
 * Used for: Yes/No confirmations, cancel/keep, reschedule options
 */
function buildQuickReplyButtons({ body, footer, buttons }) {
  return {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      footer: footer ? { text: footer } : undefined,
      action: {
        buttons: buttons.map(b => ({
          type: 'reply',
          reply: {
            id: b.id,
            title: b.title
          }
        }))
      }
    }
  };
}

// ─── PRE-BUILT TEMPLATES ──────────────────────────────────────────

function getWelcomeList(clinicName, agentName) {
  return buildListMessage({
    header: `Welcome to ${clinicName}`,
    body: `Hi there! I'm ${agentName}, your virtual assistant. How can I help you today?`,
    footer: 'Tap an option below',
    buttonText: 'Get Started',
    rows: [
      { id: 'services', title: '1. Treatments & Services', description: 'Browse our aesthetic treatments and pricing' },
      { id: 'location', title: '2. Location & Contact', description: 'Address, directions, phone number, hours' },
      { id: 'book', title: '3. Book Appointment', description: 'Schedule your visit with us' },
      { id: 'faq', title: '4. Common Questions', description: 'Answers to frequently asked questions' }
    ]
  });
}

function getBookingConfirmationButtons(date, time, treatment) {
  return buildQuickReplyButtons({
    body: `Confirm your booking:\n📅 ${date} at ${time}\n💆 ${treatment}\n\nShall I proceed?`,
    footer: 'Tap Yes to confirm',
    buttons: [
      { id: 'confirm_yes', title: '✅ Yes, book it' },
      { id: 'confirm_no', title: '❌ No, cancel' },
      { id: 'confirm_change', title: '📝 Change details' }
    ]
  });
}

function getYesNoButtons(question, footer = null) {
  return buildQuickReplyButtons({
    body: question,
    footer: footer || 'Tap an option',
    buttons: [
      { id: 'yes', title: '👍 Yes' },
      { id: 'no', title: '👎 No' }
    ]
  });
}

function getServiceListMessage(services) {
  const rows = services.slice(0, 10).map((s, i) => ({
    id: `service_${i}`,
    title: s.name,
    description: `${s.price || ''} ${s.duration || ''} — ${s.description?.substring(0, 40) || ''}`
  }));
  
  return buildListMessage({
    header: 'Our Treatments',
    body: 'Here are our most popular treatments. Tap one to learn more or book.',
    footer: `${services.length} treatments available`,
    buttonText: 'View Treatments',
    rows
  });
}

// ─── RESPONSE WRAPPER ─────────────────────────────────────────────
// The smart-router returns { text, source, ... } — we extend this to support
// interactive payloads by adding a `whatsappInteractive` field.

function withInteractive(baseResponse, interactivePayload) {
  return {
    ...baseResponse,
    whatsappInteractive: interactivePayload
  };
}

function getTreatmentInfoButtons(treatmentName) {
  return buildQuickReplyButtons({
    body: `Would you like to book ${treatmentName}?`,
    footer: 'Tap an option',
    buttons: [
      { id: 'book_this', title: '📅 Book Now' },
      { id: 'ask_more', title: '❓ Ask More' },
      { id: 'back_menu', title: '🏠 Main Menu' }
    ]
  });
}

/**
 * Rich treatment info card with description, price, duration
 * Buttons: Book This | Add Another | Back to List
 */
function getTreatmentInfoCard(service, selectedCount = 0) {
  const priceText = service.price ? `💰 ${service.price}` : '';
  const durationText = service.duration ? `⏱️ ${service.duration}min` : '';
  const descText = service.description || '';
  const header = `*${service.name}*`;
  const meta = [priceText, durationText].filter(Boolean).join('  ');
  const selectedBanner = selectedCount > 0 ? `\n\n🛒 You have ${selectedCount} treatment(s) selected` : '';
  
  const buttons = [
    { id: 'book_this', title: '📅 Book This' },
    { id: 'add_another', title: '➕ Add Another' },
    { id: 'back_list', title: '🔙 Back to List' }
  ];
  
  return buildQuickReplyButtons({
    body: `${header}\n${meta}\n\n${descText}${selectedBanner}`,
    footer: 'Tap to proceed',
    buttons
  });
}

/**
 * Edit menu — shown when user taps Edit on confirmation card
 */
function getEditMenuButtons() {
  return buildQuickReplyButtons({
    body: 'What would you like to change?',
    footer: 'Tap an option',
    buttons: [
      { id: 'edit_date', title: '📅 Change Date' },
      { id: 'edit_time', title: '🕐 Change Time' },
      { id: 'edit_treatment', title: '💆 Change Treatment' }
    ]
  });
}

/**
 * Multi-treatment selection buttons
 * Shows after user picks a treatment — lets them book immediately or add more.
 */
function getMultiTreatmentButtons(selectedTreatments, totalDuration, totalPrice) {
  const treatmentText = selectedTreatments.join(' + ');
  const durText = totalDuration ? ` (${totalDuration}min)` : '';
  const priceText = totalPrice ? ` • ${totalPrice}` : '';
  const isPlural = selectedTreatments.length > 1;

  return buildQuickReplyButtons({
    body: `Selected: ${treatmentText}${durText}${priceText}\n\nWould you like to book ${isPlural ? 'these treatments' : 'this treatment'}, or add more?`,
    footer: 'Tap an option',
    buttons: [
      { id: 'book_selected', title: `📅 Book ${isPlural ? 'These' : 'This'}` },
      { id: 'add_treatment', title: '➕ Add More' },
      { id: 'cancel', title: '❌ Cancel' }
    ]
  });
}

/**
 * Build date selection buttons (Quick Reply)
 * Shows up to 3 date options + "Other" as quick reply buttons.
 * Each button ID encodes the actual date: `date_YYYY-MM-DD`
 */
function getDateButtonOptions(dateOptions) {
  const buttons = dateOptions.map(d => ({
    id: `date_${d.date}`,
    title: d.label.length > 20 ? d.label.substring(0, 20) : d.label
  }));
  if (buttons.length < 3) {
    buttons.push({ id: 'date_other', title: '📅 Other Date' });
  }
  return buildQuickReplyButtons({
    body: 'When would you like to come in?',
    footer: 'Tap a date to see available times',
    buttons: buttons.slice(0, 3)
  });
}

/**
 * Build time slot buttons (Quick Reply)
 * Shows up to 3 time slots + "Other" as quick reply buttons.
 * Each button ID encodes the actual time: `time_HH:MM`
 */
function getTimeSlotButtons(timeSlots, operatingHours) {
  const buttons = timeSlots.map(t => ({
    id: `time_${t.replace(/:/g, '-')}`,
    title: formatDisplayTime(t)
  }));
  if (buttons.length < 3) {
    buttons.push({ id: 'time_other', title: '⏰ Other Time' });
  }
  return buildQuickReplyButtons({
    body: `Here are available time slots:\n🕐 ${operatingHours || 'During operating hours'}`,
    footer: 'Tap a time to select it',
    buttons: buttons.slice(0, 3)
  });
}

function formatDisplayTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const dh = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return `${dh}:${String(m).padStart(2,'0')} ${ampm}`;
}

/**
 * Build category selection list
 * Groups services by their category field.
 */
function getCategoryListMessage(categories) {
  const rows = categories.map((c, i) => ({
    id: `cat_${c.id}`,
    title: c.name,
    description: c.description || `${c.count || 0} treatment(s)`
  }));
  return buildListMessage({
    header: 'Treatment Categories',
    body: 'What type of treatment are you looking for?',
    footer: 'Tap a category to browse',
    buttonText: 'Browse Categories',
    rows
  });
}

/**
 * Build treatment list for a specific category
 */
function getTreatmentsByCategoryMessage(categoryName, services) {
  const rows = services.slice(0, 10).map((s, i) => ({
    id: `svc_${s.name.toLowerCase().replace(/\s+/g, '_')}`,
    title: s.name,
    description: `${s.price || ''} ${s.duration ? '— ' + s.duration + 'min' : ''}`.trim()
  }));
  return buildListMessage({
    header: categoryName,
    body: `Here are our ${categoryName.toLowerCase()} treatments. Tap one to learn more or book.`,
    footer: `${services.length} option(s)`,
    buttonText: 'View Treatments',
    rows
  });
}

/**
 * Rich booking confirmation card with summary details
 */
function getConfirmationCard({ date, time, treatments, totalDuration, totalPrice, priceIsRange, customerName, customerPhone, clinicName }) {
  const treatmentText = Array.isArray(treatments) ? treatments.join(' + ') : (treatments || 'Not selected');
  const durText = totalDuration ? `⏱️ ${totalDuration} mins` : '';
  const priceText = totalPrice ? `💰 ${totalPrice}${priceIsRange ? ' (final price confirmed at the clinic)' : ''}` : '';
  // Name & phone the clinic will use to schedule / call back.
  // Phone always comes from WhatsApp; name from profile or asked later.
  const nameText = customerName ? `👤 ${customerName}` : '';
  const phoneText = customerPhone ? `📱 +${String(customerPhone).replace(/^\+/, '')}` : '';
  const details = [nameText, phoneText, `📅 ${date || 'TBD'}`, `🕐 ${time || 'TBD'}`, `💆 ${treatmentText}`, durText, priceText]
    .filter(Boolean)
    .join('\n');

  return buildQuickReplyButtons({
    body: `✅ *Booking Summary*\n\n${details}\n\nEverything look correct?`,
    footer: clinicName ? `${clinicName}` : 'Tap to confirm',
    buttons: [
      { id: 'confirm_yes', title: '✅ Confirm' },
      { id: 'confirm_change', title: '📝 Edit' },
      { id: 'confirm_cancel', title: '❌ Cancel' }
    ]
  });
}

/**
 * Calendar CTA buttons — links to .ics endpoint for both Android & iPhone
 */
function getCalendarCTAButtons(bookingRef, icsUrl) {
  return {
    type: 'interactive',
    interactive: {
      type: 'cta_url',
      body: { text: 'Add this appointment to your calendar so you don\'t forget!' },
      footer: { text: 'Works with Apple, Google & Outlook calendars' },
      action: {
        name: 'cta_url',
        parameters: {
          display_text: '📅 Add to Calendar',
          url: icsUrl
        }
      }
    }
  };
}

module.exports = {
  buildListMessage,
  buildQuickReplyButtons,
  getWelcomeList,
  getBookingConfirmationButtons,
  getYesNoButtons,
  getServiceListMessage,
  getTreatmentInfoButtons,
  getTreatmentInfoCard,
  getEditMenuButtons,
  getDateButtonOptions,
  getTimeSlotButtons,
  getCategoryListMessage,
  getTreatmentsByCategoryMessage,
  getConfirmationCard,
  getCalendarCTAButtons,
  getMultiTreatmentButtons,
  withInteractive
};
