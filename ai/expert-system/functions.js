/**
 * Moon Hands — Function Definitions + Implementations
 * Each expert only receives the functions it is authorized to call.
 */

const handlers = require('./function-handlers');

const ALL_FUNCTIONS = [
  {
    name: 'check_availability',
    description: 'Check available appointment slots for a specific date and service. Returns available time slots, operating hours, and booked count.',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format (e.g., 2026-04-30)' },
        service: { type: 'string', description: 'Service/treatment name (e.g., Botox, HydraFacial)' },
        preferred_time: { type: 'string', description: 'Preferred time range: morning/afternoon/evening or specific HH:MM' }
      },
      required: ['date', 'service']
    },
    handler: handlers.checkAvailability,
  },
  {
    name: 'create_booking',
    description: 'Create a new appointment booking. Must have confirmed name, phone, service, date, and time. Returns booking status (confirmed or pending based on clinic settings).',
    parameters: {
      type: 'object',
      properties: {
        customer_name: { type: 'string', description: 'Patient full name' },
        customer_phone: { type: 'string', description: 'Patient phone number with country code (+65...)' },
        service_name: { type: 'string', description: 'Treatment/service name' },
        appointment_date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        appointment_time: { type: 'string', description: 'Time in HH:MM format (24-hour)' },
        notes: { type: 'string', description: 'Optional notes or special requests' }
      },
      required: ['customer_name', 'customer_phone', 'service_name', 'appointment_date', 'appointment_time']
    },
    handler: handlers.createBooking,
  },
  {
    name: 'cancel_booking',
    description: 'Cancel an existing appointment. Must verify identity with phone number first. Cancels the soonest upcoming appointment for that phone number.',
    parameters: {
      type: 'object',
      properties: {
        customer_phone: { type: 'string', description: 'Patient phone number for identity verification' },
        appointment_id: { type: 'string', description: 'Optional: specific appointment ID if multiple exist' }
      },
      required: ['customer_phone']
    },
    handler: handlers.cancelBooking,
  },
  {
    name: 'reschedule_booking',
    description: 'Reschedule an existing appointment. Cancels old booking and creates new one. Checks new slot availability first. Must provide phone number for identity verification.',
    parameters: {
      type: 'object',
      properties: {
        customer_phone: { type: 'string', description: 'Patient phone number' },
        new_date: { type: 'string', description: 'New date in YYYY-MM-DD format' },
        new_time: { type: 'string', description: 'New time in HH:MM format' }
      },
      required: ['customer_phone', 'new_date', 'new_time']
    },
    handler: handlers.rescheduleBooking,
  },
  {
    name: 'check_existing_booking',
    description: 'Look up a patient\'s existing upcoming appointments by phone number. Returns up to 5 confirmed or pending appointments.',
    parameters: {
      type: 'object',
      properties: {
        customer_phone: { type: 'string', description: 'Patient phone number' }
      },
      required: ['customer_phone']
    },
    handler: handlers.checkExistingBooking,
  },
  {
    name: 'add_to_waitlist',
    description: 'Add patient to waitlist when no slots are available. Requires name, phone, and preferred service. Optionally preferred date.',
    parameters: {
      type: 'object',
      properties: {
        customer_name: { type: 'string', description: 'Patient name' },
        customer_phone: { type: 'string', description: 'Patient phone number' },
        preferred_service: { type: 'string', description: 'Desired treatment/service' },
        preferred_date: { type: 'string', description: 'Optional preferred date (YYYY-MM-DD)' }
      },
      required: ['customer_name', 'customer_phone', 'preferred_service']
    },
    handler: handlers.addToWaitlist,
  },
  {
    name: 'get_treatment_info',
    description: 'Get details about a specific treatment. Use when patient asks "Do you do [treatment]?", "What is [treatment]?", "Tell me about [treatment]". Handles partial matches (e.g. "BOTOX" will match "Botox Consultation").',
    parameters: {
      type: 'object',
      properties: {
        treatment_name: { type: 'string', description: 'Treatment name or keyword. Can be partial (e.g. "botox", "facial", "laser")' }
      },
      required: ['treatment_name']
    },
    handler: handlers.getTreatmentInfo,
  },
  {
    name: 'get_pricing',
    description: 'Get pricing for a specific treatment OR the full list of all services with prices. Use when patient asks: "What services do you offer?", "What treatments do you have?", "Show me your services", "What do you do?", or any pricing question. Call with NO treatment_name to get the complete list.',
    parameters: {
      type: 'object',
      properties: {
        treatment_name: { type: 'string', description: 'Specific treatment name. OMIT this to get the full service list with all prices.' },
        include_packages: { type: 'boolean', description: 'Whether to include package deals and promotions' }
      }
    },
    handler: handlers.getPricing,
  },
];

/**
 * Get function definitions for OpenAI (no handler references — just schema).
 */
function getFunctionDefinitions(allowedNames) {
  const filtered = allowedNames 
    ? ALL_FUNCTIONS.filter(fn => allowedNames.includes(fn.name))
    : ALL_FUNCTIONS;
  
  // Return only name, description, parameters (OpenAI format)
  return filtered.map(({ name, description, parameters }) => ({
    name, description, parameters
  }));
}

/**
 * Execute a function by name with the given arguments.
 */
async function executeFunction(name, args) {
  const fn = ALL_FUNCTIONS.find(f => f.name === name);
  if (!fn || !fn.handler) {
    throw new Error(`Function ${name} not found or has no handler`);
  }
  return await fn.handler(args);
}

module.exports = {
  ALL_FUNCTIONS,
  getFunctionDefinitions,
  getFunctionsForExpert: getFunctionDefinitions,
  executeFunction,
};
