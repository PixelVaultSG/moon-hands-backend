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
        button: buttonText || 'View Options',
        sections: [{
          title: 'Options',
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
      { id: 'pricing', title: '4. Pricing', description: 'View treatment prices and packages' },
      { id: 'faq', title: '5. Common Questions', description: 'Answers to frequently asked questions' }
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

module.exports = {
  buildListMessage,
  buildQuickReplyButtons,
  getWelcomeList,
  getBookingConfirmationButtons,
  getYesNoButtons,
  getServiceListMessage,
  withInteractive
};
