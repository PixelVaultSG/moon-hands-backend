/**
 * Moon Hands Scenario Maker
 * Generates 100,000+ labeled conversation scenarios for triage system training
 * Covers all past bugs, edge cases, and conversation breakdowns
 *
 * Usage: node ai/scenario-maker.js --count 100000 --output ai/scenarios.jsonl
 */

const fs = require('fs');
const path = require('path');

// ──────────────────────────────────────────────────────────
// CONFIGURATION
// ──────────────────────────────────────────────────────────
const DEFAULT_COUNT = 100000;
const OUTPUT_FILE = process.argv.includes('--output')
  ? process.argv[process.argv.indexOf('--output') + 1]
  : 'ai/scenarios.jsonl';
const REQUESTED_COUNT = process.argv.includes('--count')
  ? parseInt(process.argv[process.argv.indexOf('--count') + 1], 10)
  : DEFAULT_COUNT;

// ──────────────────────────────────────────────────────────
// VARIABLE DICTIONARIES (combinatorial building blocks)
// ──────────────────────────────────────────────────────────

const TREATMENTS = {
  single: [
    'Botox', 'HIFU', 'Thread Lift', 'Microneedling', 'Chemical Peel',
    'PicoSure Laser', 'Rejuran Healer', 'Laser Skin Rejuvenation',
    'Hydrating Facial', 'Anti-Aging Treatment', 'Acne Clear Facial',
    'Pico Laser', 'Dermal Fillers', 'Ultherapy', 'RF Skin Tightening',
    'PRP Treatment', 'CoolSculpting', 'LED Light Therapy', 'Oxygen Facial'
  ],
  multi_pairs: [
    ['Botox', 'HIFU'],
    ['Botox', 'Thread Lift'],
    ['HIFU', 'Microneedling'],
    ['Chemical Peel', 'Microneedling'],
    ['PicoSure Laser', 'HIFU'],
    ['Thread Lift', 'Dermal Fillers'],
    ['Rejuran Healer', 'HIFU'],
    ['Botox', 'Chemical Peel', 'HIFU'],
    ['PicoSure Laser', 'Microneedling', 'Thread Lift'],
    ['HIFU', 'Botox', 'Chemical Peel', 'Microneedling']
  ],
  // Variants with spaces (normalization testing)
  spaced: [
    'micro needling', 'pico sure laser', 'thread lift', 'laser skin rejuvenation',
    'bot ox', 'chemical peel', 'rejuran healer', 'dermal fillers'
  ],
  typos: [
    'Botoz', 'HIFUU', 'Therad Lift', 'Microneedeling', 'Chemicle Peel',
    'PicoSure Lazer', 'Rejurann', 'HIFU treatment', 'botox injections'
  ]
};

const DATE_EXPRESSIONS = {
  absolute: ['August 15', 'August 15th', '15 August', '2026-08-15', 'Aug 15', '15/08/2026', '08/15/2026'],
  relative: ['tomorrow', 'today', 'next Monday', 'next Tuesday', 'next Wednesday', 'this Friday', 'coming Saturday', 'in 3 days', 'in a week', 'next week', 'the day after tomorrow', 'this weekend'],
  ambiguous: ['Monday', 'Tuesday', 'Wednesday', 'the 15th', 'first of next month', 'end of the month', 'beginning of September'],
  invalid: ['yesterday', 'last Monday', 'February 30', '2025-01-01', 'December 32', 'tomorrow yesterday', 'no date']
};

const TIME_EXPRESSIONS = {
  standard: ['2pm', '2:00 PM', '14:00', '10am', '10:00 AM', '5:30pm', '17:30', '3:45pm', '9:00 AM', '11am', '1pm', '4:30pm', '6pm', '7:30pm', '8:00 AM', '12:00 PM', '12:30pm'],
  relative: ['morning', 'afternoon', 'evening', 'noon', 'midday', 'early morning', 'late afternoon', 'after work', 'before lunch', 'lunch time'],
  invalid: ['midnight', '3am', '1am', '11pm', '5am', '6:30 AM', '7:00 AM', '10pm', 'now', 'ASAP', 'whenever']
};

const CONFIRMATIONS = {
  simple: ['Yes', 'yeah', 'sure', 'ok', 'okay', 'yes please', 'definitely', 'absolutely', 'of course', 'yup', 'yes!', 'YES', 'yesss', 'yes i do', 'yes please do', 'mhm', 'alright', 'fine', 'go ahead', 'proceed', 'confirm'],
  confirm_add_treatment: [
    'Yes and also add {treatment}', 'Sure, I also want {treatment}', 'Yes please add {treatment} too',
    'Yup and {treatment} as well', 'Yes, can you add {treatment}', 'Sure, include {treatment}',
    'Yes I want {treatment} too', 'Okay, and also {treatment}', 'Yes and {treatment}',
    'Sure, I also need {treatment}', 'Yes plus {treatment}', 'Okay, add {treatment} as well'
  ],
  confirm_add_name: [
    'Yes and my name is {name}', 'Sure, I am {name}', 'Yes, call me {name}',
    'Yup, it is {name}', 'Yes, name is {name}', 'Sure, I am {name}'
  ],
  correction_treatment: [
    'Actually make it {treatment}', 'Change to {treatment}', 'Instead, I want {treatment}',
    'Switch to {treatment}', 'Make it {treatment} instead', 'I meant {treatment}',
    'No, I want {treatment}', 'Actually {treatment}', 'Let me change to {treatment}',
    'Forget that, I want {treatment}'
  ],
  correction_name: [
    'My name is {name}', 'It is {name}', 'Call me {name}',
    'Name is {name}', 'I am {name}', 'I am {name}', 'Actually my name is {name}',
    'It is actually {name}', 'Please use {name}', 'Change my name to {name}'
  ],
  addition_treatment: [
    'Also add {treatment}', 'Add {treatment} too', 'And {treatment}',
    'I also want {treatment}', 'Can I also add {treatment}', 'Include {treatment}',
    'Plus {treatment}', 'And also {treatment}', 'I want {treatment} as well',
    'Dont forget {treatment}'
  ],
  rejection: [
    'No', 'nope', 'nah', 'no thanks', 'not really', 'not now', 'no way',
    'I dont think so', 'Not that', 'No I want something else', 'Different one',
    'No, change it', 'Not correct', 'Wrong', 'Cancel', 'Stop', 'Never mind'
  ]
};

const NAMES = {
  simple: ['Steven', 'Sarah', 'Alex', 'John', 'Jane', 'Emily', 'David', 'Michelle', 'Jessica', 'Daniel', 'Rachel', 'Michael', 'Amanda', 'Christopher', 'Linda', 'Kevin', 'Rebecca', 'Andrew', 'Nicole', 'Brian'],
  with_title: ['Dr. Lim', 'Dr. Tan', 'Mr. Tan', 'Ms. Lee', 'Mrs. Wong', 'Mdm. Koh', 'Dr. Sarah', 'Mr. David', 'Ms. Michelle'],
  two_word: ['Steven Tan', 'Sarah Lee', 'Alex Lim', 'John Wong', 'Jane Koh', 'Emily Tan', 'David Lee', 'Michelle Lim', 'Jessica Wong', 'Daniel Tan', 'Rachel Lee', 'Michael Koh', 'Amanda Lim', 'Christopher Tan', 'Linda Lee', 'Kevin Wong', 'Rebecca Tan', 'Andrew Lim', 'Nicole Koh', 'Brian Lee'],
  three_word: ['Steven Tan Wei', 'Sarah Lee Mei', 'Alex Lim Jun', 'John Wong Hao', 'Jane Koh Li', 'Emily Tan Yi', 'David Lee Kang', 'Michelle Lim Xin', 'Jessica Wong Yi', 'Daniel Tan Jun'],
  with_phone: ['Steven 90123456', 'Sarah 91234567', 'Alex 92345678', 'John 93456789', 'Jane 94567890', 'Steven +6590123456', 'Sarah +6591234567'],
  invalid: ['And Botox', 'Also add HIFU', 'Chemical Peel please', 'I want thread lift', 'Can I get microneedling', 'What about Botox', 'How much is HIFU', 'Where is your clinic', 'Do you have parking', 'Both treatments', 'Yes and no', '12345678', 'asdfgh', 'test name', 'Admin Override', 'I will take over', 'Book appointment', 'Next Monday', '2pm', 'Botox and HIFU', 'My name is']
};

const SERVICE_INQUIRIES = {
  list_all: [
    'What treatments do you offer?', 'What services do you have?', 'Tell me about your treatments',
    'What can I get done?', 'What do you guys do?', 'List your treatments', 'Show me all services',
    'What are your treatments?', 'What treatments available?', 'What aesthetic treatments do you have?'
  ],
  single_pricing: [
    'How much is {treatment}?', 'What is the price of {treatment}?', '{treatment} price?',
    'Cost of {treatment}?', 'How much does {treatment} cost?', 'Price for {treatment}?',
    'Is {treatment} expensive?', 'What do you charge for {treatment}?', 'How much for {treatment}?',
    'Pricing for {treatment}'
  ],
  single_description: [
    'What is {treatment}?', 'Tell me about {treatment}', 'What does {treatment} do?',
    'How does {treatment} work?', 'Explain {treatment}', 'What is {treatment} for?',
    'Details about {treatment}', 'What happens during {treatment}?', 'Is {treatment} painful?',
    'What are the side effects of {treatment}?'
  ],
  compare: [
    'What is the difference between {treatment} and {treatment2}?',
    'Compare {treatment} and {treatment2}',
    'Which is better: {treatment} or {treatment2}?',
    'Should I get {treatment} or {treatment2}?',
    'What is the difference between {treatment} and {treatment2}?',
    'Can you compare {treatment} vs {treatment2}?'
  ],
  multi_treatment_inquiry: [
    'Tell me about {treatment} and {treatment2}',
    'What do you know about {treatment} and {treatment2}?',
    'Information on {treatment} and {treatment2}',
    'How much are {treatment} and {treatment2}?',
    'What is {treatment} and {treatment2}?'
  ],
  duration: [
    'How long does {treatment} take?', 'Duration of {treatment}?', 'How many minutes for {treatment}?',
    'Time needed for {treatment}?', 'How long is {treatment}?', 'What is the duration of {treatment}?',
    'How much time does {treatment} take?'
  ]
};

const LOCATION_INQUIRIES = {
  address: [
    'Where are you located?', 'What is your address?', 'Where is the clinic?',
    'Your address please', 'Where is Pixel Vault?', 'Where is your clinic located?',
    'What is your location?', 'Address?', 'Where do I go?', 'Clinic address?'
  ],
  directions: [
    'How do I get there?', 'Directions please', 'How to get to your clinic?',
    'What is the nearest MRT?', 'How do I come?', 'Transport options?',
    'Where is the nearest bus stop?', 'Can you give me directions?'
  ],
  both: [
    'Both', 'Both address and directions', 'Address and directions', 'Both please',
    'Give me both', 'Both your address and directions', 'I want both',
    'Address and how to get there', 'Location and directions', 'Both of them'
  ],
  parking: [
    'Is there parking?', 'Where do I park?', 'Parking available?',
    'Do you have parking?', 'Can I park there?', 'Parking nearby?'
  ]
};

const OPENING_HOURS = {
  general: [
    'What are your opening hours?', 'When are you open?', 'What time do you open?',
    'What time do you close?', 'Operating hours?', 'Business hours?',
    'Are you open on weekends?', 'Are you open on Sunday?', 'Saturday hours?',
    'What days are you closed?', 'Holiday hours?'
  ],
  specific_day: [
    'Are you open on Monday?', 'Are you open Tuesday?', 'Wednesday hours?',
    'What time Thursday?', 'Friday closing time?', 'Saturday opening time?',
    'Sunday available?', 'Weekend hours?', 'Public holiday open?'
  ],
  booking_time_check: [
    'Can I book at 9am?', 'Is 8pm available?', 'Can I come at 7am?',
    'Is 10pm too late?', 'Can I book at noon?', 'What is the earliest time?',
    'What is the latest time I can book?', 'Can I come before opening?',
    'Can I book after closing?'
  ]
};

const CONTEXT_REPLIES = {
  after_address: [
    'Both', 'Directions too', 'How do I get there?', 'MRT?', 'Nearest station?',
    'Can I park there?', 'Is there parking?', 'Bus?', 'Taxi?', 'How to come?'
  ],
  after_directions: [
    'Both', 'Address too', 'What is the address?', 'Street address?',
    'Unit number?', 'Postal code?', 'Building name?', 'Full address?'
  ],
  duration_questions: [
    'How long does it take?', 'How many minutes?', 'Duration?', 'How long?',
    'Time needed?', 'Will it take long?', 'What time will I finish?',
    'How long will I be there?', 'What time do you close?', 'Will it extend past closing?'
  ]
};

const CANCELLATIONS = {
  words: ['cancel', 'never mind', 'nevermind', 'stop', 'forget it', 'go back', 'start over', 'restart', 'abort', 'quit', 'end', 'exit', 'back', 'return', 'undo'],
  sentences: [
    'I want to cancel', 'Cancel the booking', 'Never mind', 'Forget it',
    'Stop the booking', 'Go back', 'Start over please', 'I changed my mind',
    'Abort this', 'Let me start again', 'I want to restart', 'Cancel everything',
    'Undo that', 'Back to the beginning', 'I want to go back', 'Reset',
    'Let me cancel', 'Please cancel', 'Cancel appointment', 'Cancel booking'
  ]
};

const MIXED_INTENTS = {
  booking_plus_inquiry: [
    'I want to book {treatment} and how much is it?',
    'Book {treatment} and tell me the price',
    'What is {treatment} and can I book it for {date}?',
    'How much is {treatment} and can I book it?',
    'Tell me about {treatment} and book for {date} at {time}',
    'Where is your clinic and can I book {treatment}?',
    'What are your opening hours and can I book {treatment}?',
    'I want to book {treatment} and also ask about {treatment2}'
  ],
  greeting_plus_intent: [
    'Hi, I want to book {treatment}', 'Hello, how much is {treatment}?',
    'Hey, where are you located?', 'Hi there, what treatments do you offer?',
    'Good morning, I want to book', 'Hi, can I get {treatment}?',
    'Hello, book {treatment} for {date}', 'Hey, what is {treatment}?'
  ],
  multiple_inquiries: [
    'What is {treatment} and how much is it and where are you?',
    'Tell me about {treatment} and {treatment2} and your address',
    'How much is {treatment} and what time do you close?',
    'What treatments do you offer and where are you located?',
    'What is your address and what are your hours?',
    'How much is {treatment} and how long does it take?'
  ]
};

const OUT_OF_SCOPE = {
  products: [
    'Do you sell skincare?', 'What products do you recommend?', 'Can I buy sunscreen?',
    'Do you have retinol?', 'What skincare should I use?', 'Product recommendations?'
  ],
  careers: [
    'Can I work here?', 'Are you hiring?', 'Job openings?', 'Apply for position',
    'Career opportunities', 'Internship available?', 'I want to be a doctor there'
  ],
  reviews: [
    'What are your reviews?', 'Do you have testimonials?', 'Before and after photos?',
    'Are you good?', 'Is the clinic reputable?', 'Patient reviews?',
    'Before/after pictures?', 'Results photos?'
  ],
  competitors: [
    'How do you compare to XYZ clinic?', 'Is this better than ABC?',
    'What makes you different?', 'Why choose you?', 'Are you cheaper than others?'
  ],
  medical: [
    'I have a rash', 'Can you diagnose my skin?', 'Is this mole cancerous?',
    'I need a prescription', 'Can you see my pimple?', 'Is this infected?',
    'What is wrong with my skin?', 'I need medical advice'
  ],
  gibberish: [
    'asdfgh', 'qwerty', '12345678', '!!!???', 'hahahaha', 'lol',
    '???', '...', '!!!!!!!!', 'random text', 'test test test',
    'Bla bla bla', 'Lorem ipsum', 'Placeholder', 'Dummy message',
    'XxXxXxXx', '11111111', '00000000', '!!!!!!!!!!', '????????'
  ],
  empty_or_emoji: [
    '', '👍', '👋', '😊', '❤️', '👀', '✅', '✨', '👌', '🙏',
    '👍👍', 'hi 👋', 'ok ✅', 'sure 👍', 'thanks 🙏', 'done ✨'
  ]
};

const ADMIN_OVERRIDES = {
  pause: [
    'I WILL TAKE OVER', 'I will take over', 'I WILL TAKEOVER', 'PAUSE BOT',
    'Pause bot', 'Stop bot', 'Halt bot', 'Disable bot', 'Bot pause',
    'Take over now', 'I am taking over', 'Admin override', 'Manual mode'
  ],
  resume: [
    'RESUME BOT', 'Resume bot', 'Start bot', 'Enable bot', 'Bot resume',
    'Back to bot', 'Auto mode', 'Let bot handle', 'Release control'
  ]
};

const GREETINGS = {
  simple: ['Hi', 'Hello', 'Hey', 'Good morning', 'Good afternoon', 'Good evening', 'Hola', 'Hey there', 'Hi there', 'Greetings'],
  with_name: ['Hi Moon Hands', 'Hello bot', 'Hey there', 'Hi Pixel Vault', 'Hello there', 'Hey assistant'],
  casual: ['Yo', 'Sup', 'Wassup', 'Howdy', 'Hiya', 'Ello', 'Oi', 'Ayo']
};

const BOOKING_REQUESTS = {
  direct: [
    'I want to book {treatment}',
    'Book me in for {treatment}',
    'Can I book {treatment}?',
    'I would like to book {treatment}',
    'Make an appointment for {treatment}',
    'Schedule {treatment}',
    'I want {treatment}',
    'Can I get {treatment}?',
    'I need {treatment}',
    'Appointment for {treatment}',
    'Book {treatment}',
    'I want to book an appointment for {treatment}',
    'Can I schedule {treatment}?',
    'I would like to make a booking for {treatment}',
    'Please book {treatment} for me'
  ],
  with_date: [
    'I want to book {treatment} for {date}',
    'Book {treatment} on {date}',
    'Can I get {treatment} on {date}?',
    '{treatment} on {date} please',
    'Schedule {treatment} for {date}',
    'I want {treatment} on {date}',
    'Book me {treatment} {date}',
    'Appointment for {treatment} on {date}'
  ],
  with_date_time: [
    'I want to book {treatment} for {date} at {time}',
    'Book {treatment} on {date} at {time}',
    'Can I get {treatment} on {date} at {time}?',
    '{treatment} on {date} at {time} please',
    'Schedule {treatment} for {date} at {time}',
    'I want {treatment} on {date} at {time}',
    'Book me {treatment} {date} {time}',
    'Appointment for {treatment} on {date} at {time}',
    'I want to book {treatment} on {date} at {time}',
    'Can I book {treatment} for {date} at {time}?'
  ],
  with_multi_treatment: [
    'I want to book {treatment} and {treatment2}',
    'Book {treatment} and {treatment2}',
    'Can I get {treatment} and {treatment2}?',
    '{treatment} and {treatment2} please',
    'I want {treatment} and {treatment2}',
    'Schedule {treatment} and {treatment2}',
    'Book me {treatment} and {treatment2}',
    'I want to book {treatment} and {treatment2} for {date}',
    'Can I book {treatment} and {treatment2} on {date} at {time}?',
    'Book {treatment} and {treatment2} on {date} at {time}'
  ]
};

// ──────────────────────────────────────────────────────────
// EXPECTED BEHAVIOR TEMPLATES
// ──────────────────────────────────────────────────────────

const EXPECTED_BEHAVIOR = {
  // When bot is in IDLE state and user sends a booking request
  'idle_booking_single': {
    expected_intents: ['booking'],
    expected_next_state: 'awaiting_date',
    expected_state_data: ['treatment', 'treatments'],
    response_must_contain_any: ['Which date', 'date works', 'What date', 'When would you like'],
    response_must_not_contain: ['Booking request received', 'subject to clinic confirmation', 'Can I confirm'],
    priority: 'critical',
    bug_category: 'booking_flow'
  },
  'idle_booking_multi': {
    expected_intents: ['booking'],
    expected_next_state: 'awaiting_date',
    expected_state_data: ['treatment', 'treatments'],
    response_must_contain_any: ['Which date', 'date works', 'What date'],
    response_must_contain: ['+'], // Should show treatments joined with +
    response_must_not_contain: ['Booking request received', 'lovely choice'], // Should not single out one treatment
    priority: 'critical',
    bug_category: 'multi_treatment'
  },
  'idle_booking_all_fields': {
    expected_intents: ['booking'],
    expected_next_state: 'confirming_treatment',
    expected_state_data: ['date', 'time', 'treatment', 'treatments'],
    response_must_contain: ['Can I confirm'],
    response_must_not_contain: ['Booking request received', 'subject to clinic confirmation'],
    priority: 'critical',
    bug_category: 'no_auto_booking'
  },
  'awaiting_date_treatment_addition': {
    expected_next_state: 'awaiting_date', // still waiting for date
    expected_state_data: ['treatments'],
    response_must_contain_any: ['adding', 'Got it', 'Noted'],
    response_must_not_contain: ['did not catch the date'],
    priority: 'critical',
    bug_category: 'treatment_addition_in_date_step'
  },
  'awaiting_date_with_time_treatment': {
    expected_next_state: 'confirming_treatment',
    expected_state_data: ['date', 'time', 'treatment', 'treatments'],
    response_must_contain: ['Can I confirm'],
    response_must_not_contain: ['Booking request received', 'subject to clinic confirmation', 'May I have your name'],
    priority: 'critical',
    bug_category: 'no_auto_booking'
  },
  'confirming_treatment_yes': {
    expected_next_state: 'awaiting_name',
    response_must_contain_any: ['May I have your name', 'your name', 'What is your name'],
    priority: 'critical',
    bug_category: 'smart_confirmation'
  },
  'confirming_treatment_yes_add': {
    expected_next_state: 'confirming_treatment', // re-confirm with added treatment
    response_must_contain: ['Can I confirm'],
    priority: 'critical',
    bug_category: 'smart_confirmation'
  },
  'confirming_treatment_correct': {
    expected_next_state: 'confirming_treatment',
    response_must_contain: ['Can I confirm'],
    priority: 'critical',
    bug_category: 'smart_confirmation'
  },
  'confirming_treatment_reject': {
    expected_next_state: 'awaiting_treatment',
    response_must_contain_any: ['Which treatment', 'What treatment', 'What would you like'],
    priority: 'critical',
    bug_category: 'smart_confirmation'
  },
  'awaiting_name_treatment_add': {
    expected_next_state: 'awaiting_name', // still asking for name
    response_must_contain_any: ['great choices', 'Noted'],
    response_must_not_contain: ['May I have your name'], // Should not repeat the name prompt immediately
    priority: 'critical',
    bug_category: 'name_treatment_addition'
  },
  'awaiting_name_valid': {
    expected_next_state: 'confirming_name',
    expected_state_data: ['name'],
    response_must_contain: ['Can I confirm your name'],
    priority: 'critical',
    bug_category: 'name_collection'
  },
  'awaiting_name_invalid': {
    expected_next_state: 'awaiting_name', // still asking for name
    response_must_contain_any: ['does not look like a name', 'Could you share your name'],
    priority: 'critical',
    bug_category: 'name_validation'
  },
  'confirming_name_yes': {
    expected_next_state: 'awaiting_phone',
    response_must_contain_any: ['contact number', 'phone number', 'mobile number'],
    priority: 'critical',
    bug_category: 'smart_confirmation'
  },
  'confirming_name_yes_add': {
    expected_next_state: 'confirming_name', // re-confirm name with added treatments
    response_must_contain: ['Can I confirm'],
    priority: 'critical',
    bug_category: 'smart_confirmation'
  },
  'confirming_name_correct': {
    expected_next_state: 'confirming_name',
    response_must_contain: ['Can I confirm'],
    priority: 'critical',
    bug_category: 'smart_confirmation'
  },
  'awaiting_phone_yes': {
    expected_next_state: 'awaiting_confirmation',
    expected_state_data: ['name', 'phone', 'date', 'time', 'treatments'],
    response_must_contain_any: ['summary', 'confirm', 'Booking Summary', 'Name', 'Date', 'Time', 'Treatment'],
    priority: 'critical',
    bug_category: 'booking_summary'
  },
  'awaiting_confirmation_yes': {
    expected_handler: 'attempt_booking',
    response_must_contain_any: ['Booking request received', 'confirmed', 'subject to clinic confirmation'],
    priority: 'critical',
    bug_category: 'final_booking'
  },
  'awaiting_confirmation_change': {
    expected_next_state: 'awaiting_confirmation', // stays in confirmation but with updated data
    response_must_contain_any: ['updated', 'Here is your updated', 'Got it'],
    priority: 'high',
    bug_category: 'booking_modification'
  },
  'service_inquiry': {
    expected_intents: ['service_inquiry'],
    response_must_contain_any: ['treatment', 'service', 'price', 'cost', 'duration', 'exfoliates', 'collagen', 'Pigmentation'],
    response_must_not_contain: ['Booking request received', 'Can I confirm', 'Which date'],
    priority: 'high',
    bug_category: 'service_inquiry'
  },
  'location_inquiry': {
    expected_intents: ['location_inquiry'],
    response_must_contain_any: ['address', 'MRT', 'MRT station', 'building', 'parking', 'Google Maps', 'Directions'],
    response_must_not_contain: ['contact us directly', 'reach out', 'call us', 'Booking request received'],
    priority: 'high',
    bug_category: 'location_inquiry'
  },
  'context_reply_both': {
    expected_intents: ['location_inquiry'],
    response_must_contain_any: ['address', 'MRT', 'Directions', 'building', 'parking', 'Google Maps'],
    response_must_not_contain: ['contact us directly', 'did not catch'],
    priority: 'high',
    bug_category: 'context_reply'
  },
  'cancellation': {
    expected_next_state: 'idle',
    response_must_contain_any: ['No problem', 'Let me know', 'feel free', 'anything else'],
    priority: 'high',
    bug_category: 'cancellation'
  },
  'admin_override': {
    expected_action: 'pause_bot',
    response_must_contain_any: ['I will take over', 'Human mode', 'pause', 'take over', '30 minutes'],
    priority: 'critical',
    bug_category: 'admin_override'
  },
  'out_of_scope': {
    expected_handler: 'openai_fallback',
    response_must_contain_any: ['I apologize', 'I am not sure', 'I can help you with', 'booking', 'treatment', 'clinic'],
    priority: 'medium',
    bug_category: 'out_of_scope'
  },
  'greeting': {
    expected_intents: ['greeting'],
    response_must_contain_any: ['Hello', 'Hi there', 'Welcome', 'How can I help', 'What can I do', 'Welcome to Pixel Vault'],
    priority: 'medium',
    bug_category: 'greeting'
  },
  'opening_hours': {
    expected_intents: ['operating_hours', 'service_inquiry'],
    response_must_contain_any: ['open', 'hour', 'close', 'operating', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    priority: 'medium',
    bug_category: 'opening_hours'
  }
};

// ──────────────────────────────────────────────────────────
// SCENARIO GENERATORS
// ──────────────────────────────────────────────────────────

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickUnique(arr, n) {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, n);
}
function pickDifferent(arr, exclude) {
  const excludeLower = exclude.toLowerCase();
  const filtered = arr.filter(x => {
    const xl = x.toLowerCase();
    // Reject exact matches AND abbreviations (e.g., "Pico Laser" vs "PicoSure Laser")
    if (xl === excludeLower) return false;
    if (xl.includes(excludeLower) || excludeLower.includes(xl)) return false;
    // Reject shared significant words for multi-word treatments (e.g., "RF Skin Tightening" vs "Laser Skin Rejuvenation")
    const excludeWords = excludeLower.split(' ').filter(w => w.length > 3);
    const xWords = xl.split(' ').filter(w => w.length > 3);
    const sharedWords = excludeWords.filter(w => xWords.includes(w));
    if (sharedWords.length > 0 && excludeWords.length > 1 && xWords.length > 1) return false;
    return true;
  });
  return filtered.length > 0 ? pick(filtered) : pick(arr.filter(x => x !== exclude));
}
function formatTemplate(template, vars) {
  let result = template;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
  }
  return result;
}

let scenarioId = 0;
const scenarios = [];

function addScenario(input, currentState, context, expectedBehavior, category, bugReference, description, notes = '') {
  scenarioId++;
  scenarios.push({
    id: scenarioId,
    input,
    current_state: currentState,
    context,
    expected: expectedBehavior,
    category,
    bug_reference: bugReference,
    description,
    notes,
    generated_at: new Date().toISOString()
  });
}

// ──────────────────────────────────────────────────────────
// GENERATOR 1: IDLE → BOOKING REQUESTS (Single Treatment)
// ──────────────────────────────────────────────────────────

function generateIdleBookingSingle(count) {
  let generated = 0;
  const templates = BOOKING_REQUESTS.direct;
  while (generated < count) {
    const treatment = pick(TREATMENTS.single);
    const template = pick(templates);
    const input = formatTemplate(template, { treatment });
    addScenario(
      input,
      { state: 'idle', data: {} },
      'What can I help you with today?',
      EXPECTED_BEHAVIOR.idle_booking_single,
      'booking',
      'PAST-001',
      'Initial booking request with single treatment',
      'Must extract treatment and ask for date. Must NOT auto-book.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 2: IDLE → BOOKING REQUESTS (Multi Treatment)
// ──────────────────────────────────────────────────────────

function generateIdleBookingMulti(count) {
  let generated = 0;
  const templates = BOOKING_REQUESTS.with_multi_treatment;
  while (generated < count) {
    const pair = pick(TREATMENTS.multi_pairs);
    const [t1, t2] = [pair[0], pair[1]];
    const template = pick(templates);
    const input = formatTemplate(template, { treatment: t1, treatment2: t2 });
    addScenario(
      input,
      { state: 'idle', data: {} },
      'What can I help you with today?',
      EXPECTED_BEHAVIOR.idle_booking_multi,
      'booking',
      'PAST-002',
      'Initial booking request with multiple treatments',
      'Must extract BOTH treatments and show them joined with +. Must NOT mention only one.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 3: IDLE → ALL FIELDS (No Auto-Booking)
// ──────────────────────────────────────────────────────────

function generateIdleBookingAllFields(count) {
  let generated = 0;
  const templates = BOOKING_REQUESTS.with_date_time;
  while (generated < count) {
    const treatment = pick(TREATMENTS.single);
    const date = pick(DATE_EXPRESSIONS.absolute);
    const time = pick(TIME_EXPRESSIONS.standard);
    const template = pick(templates);
    const input = formatTemplate(template, { treatment, date, time });
    addScenario(
      input,
      { state: 'idle', data: {} },
      'What can I help you with today?',
      EXPECTED_BEHAVIOR.idle_booking_all_fields,
      'booking',
      'PAST-003',
      'All booking fields provided in first message',
      'CRITICAL: Must go to CONFIRMING_TREATMENT, NOT attemptBooking. Must NOT skip name/phone.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 4: AWAITING_DATE → TREATMENT ADDITION
// ──────────────────────────────────────────────────────────

function generateAwaitingDateTreatmentAddition(count) {
  let generated = 0;
  const additionTemplates = CONFIRMATIONS.addition_treatment;
  while (generated < count) {
    const existingTreatment = pick(TREATMENTS.single);
    const newTreatment = pickDifferent(TREATMENTS.single, existingTreatment);
    const template = pick(additionTemplates);
    const input = formatTemplate(template, { treatment: newTreatment });
    addScenario(
      input,
      { state: 'awaiting_date', data: { treatment: existingTreatment, treatments: [existingTreatment] } },
      `${existingTreatment} — lovely choice! Which date works for you?`,
      EXPECTED_BEHAVIOR.awaiting_date_treatment_addition,
      'booking',
      'PAST-004',
      'User adds treatment while bot is asking for date',
      'CRITICAL: Must detect new treatment, add to state, and continue asking for date. Must NOT say "did not catch the date".'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 5: AWAITING_DATE → DATE + TIME + TREATMENT
// ──────────────────────────────────────────────────────────

function generateAwaitingDateWithTimeTreatment(count) {
  let generated = 0;
  while (generated < count) {
    const existingTreatment = pick(TREATMENTS.single);
    const date = pick(DATE_EXPRESSIONS.absolute);
    const time = pick(TIME_EXPRESSIONS.standard);
    const input = `${date} at ${time}`;
    addScenario(
      input,
      { state: 'awaiting_date', data: { treatment: existingTreatment, treatments: [existingTreatment] } },
      `${existingTreatment} — lovely choice! Which date works for you?`,
      EXPECTED_BEHAVIOR.awaiting_date_with_time_treatment,
      'booking',
      'PAST-005',
      'User provides date and time when bot was asking for date only',
      'CRITICAL: Must go to CONFIRMING_TREATMENT, NOT attemptBooking. Must ask for confirmation before name/phone.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 6: CONFIRMING_TREATMENT → YES
// ──────────────────────────────────────────────────────────

function generateConfirmingTreatmentYes(count) {
  let generated = 0;
  while (generated < count) {
    const treatments = pick(TREATMENTS.multi_pairs);
    const input = pick(CONFIRMATIONS.simple);
    addScenario(
      input,
      { state: 'confirming_treatment', data: { treatment: treatments[0], treatments, date: '2026-08-15', time: '14:00' } },
      `Can I confirm you want ${treatments.join(' + ')}?\n\nReply YES to proceed, or tell me if you'd like to add or change anything.`,
      EXPECTED_BEHAVIOR.confirming_treatment_yes,
      'booking',
      'PAST-006',
      'User confirms treatment selection',
      'Must proceed to AWAITING_NAME. Must NOT skip to phone or booking.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 7: CONFIRMING_TREATMENT → YES + ADD TREATMENT
// ──────────────────────────────────────────────────────────

function generateConfirmingTreatmentYesAdd(count) {
  let generated = 0;
  const templates = CONFIRMATIONS.confirm_add_treatment;
  while (generated < count) {
    const existing = pick(TREATMENTS.multi_pairs);
    const newTreatment = pickDifferent(TREATMENTS.single, existing[0]);
    const template = pick(templates);
    const input = formatTemplate(template, { treatment: newTreatment });
    addScenario(
      input,
      { state: 'confirming_treatment', data: { treatment: existing[0], treatments: existing, date: '2026-08-15', time: '14:00' } },
      `Can I confirm you want ${existing.join(' + ')}?\n\nReply YES to proceed, or tell me if you'd like to add or change anything.`,
      EXPECTED_BEHAVIOR.confirming_treatment_yes_add,
      'booking',
      'PAST-007',
      'User confirms AND adds another treatment',
      'Must add new treatment to list and re-confirm. Must NOT proceed to name step.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 8: CONFIRMING_TREATMENT → CORRECTION
// ──────────────────────────────────────────────────────────

function generateConfirmingTreatmentCorrect(count) {
  let generated = 0;
  const templates = CONFIRMATIONS.correction_treatment;
  while (generated < count) {
    const existing = pick(TREATMENTS.single);
    const newTreatment = pickDifferent(TREATMENTS.single, existing);
    const template = pick(templates);
    const input = formatTemplate(template, { treatment: newTreatment });
    addScenario(
      input,
      { state: 'confirming_treatment', data: { treatment: existing, treatments: [existing], date: '2026-08-15', time: '14:00' } },
      `Can I confirm you want ${existing}?\n\nReply YES to proceed, or tell me if you'd like to add or change anything.`,
      EXPECTED_BEHAVIOR.confirming_treatment_correct,
      'booking',
      'PAST-008',
      'User corrects treatment during confirmation',
      'Must update treatment and re-confirm. Must NOT proceed to name with wrong treatment.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 9: CONFIRMING_TREATMENT → REJECTION
// ──────────────────────────────────────────────────────────

function generateConfirmingTreatmentReject(count) {
  let generated = 0;
  while (generated < count) {
    const existing = pick(TREATMENTS.single);
    const input = pick(CONFIRMATIONS.rejection);
    addScenario(
      input,
      { state: 'confirming_treatment', data: { treatment: existing, treatments: [existing], date: '2026-08-15', time: '14:00' } },
      `Can I confirm you want ${existing}?\n\nReply YES to proceed, or tell me if you'd like to add or change anything.`,
      EXPECTED_BEHAVIOR.confirming_treatment_reject,
      'booking',
      'PAST-009',
      'User rejects treatment during confirmation',
      'Must go back to AWAITING_TREATMENT. Must NOT proceed with rejected treatment.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 10: AWAITING_NAME → VALID NAME
// ──────────────────────────────────────────────────────────

function generateAwaitingNameValid(count) {
  let generated = 0;
  while (generated < count) {
    const name = pick(NAMES.simple);
    const treatments = pick(TREATMENTS.multi_pairs);
    addScenario(
      name,
      { state: 'awaiting_name', data: { treatment: treatments[0], treatments, date: '2026-08-15', time: '14:00' } },
      `Great! ${treatments.join(' + ')} it is. ✓\n\nMay I have your name for the booking?`,
      EXPECTED_BEHAVIOR.awaiting_name_valid,
      'booking',
      'PAST-010',
      'User provides valid name',
      'Must accept name and go to CONFIRMING_NAME. Must NOT proceed directly to phone.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 11: AWAITING_NAME → INVALID (Treatment as Name)
// ──────────────────────────────────────────────────────────

function generateAwaitingNameInvalid(count) {
  let generated = 0;
  while (generated < count) {
    const invalidName = pick(NAMES.invalid);
    const treatments = pick(TREATMENTS.multi_pairs);
    addScenario(
      invalidName,
      { state: 'awaiting_name', data: { treatment: treatments[0], treatments, date: '2026-08-15', time: '14:00' } },
      `Great! ${treatments.join(' + ')} it is. ✓\n\nMay I have your name for the booking?`,
      EXPECTED_BEHAVIOR.awaiting_name_invalid,
      'booking',
      'PAST-011',
      'User provides invalid input that looks like treatment request when bot asks for name',
      'CRITICAL: Must detect this is NOT a name and reject it. Must NOT treat "And Botox" as a name.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 12: AWAITING_NAME → NAME WITH PHONE
// ──────────────────────────────────────────────────────────

function generateAwaitingNameWithPhone(count) {
  let generated = 0;
  while (generated < count) {
    const namePhone = pick(NAMES.with_phone);
    const treatments = pick(TREATMENTS.single);
    addScenario(
      namePhone,
      { state: 'awaiting_name', data: { treatment: treatments, treatments: [treatments], date: '2026-08-15', time: '14:00' } },
      `Great! ${treatments} it is. ✓\n\nMay I have your name for the booking?`,
      EXPECTED_BEHAVIOR.awaiting_name_valid,
      'booking',
      'PAST-012',
      'User provides name and phone together',
      'Must extract name and phone. Should go to CONFIRMING_NAME (not skip to phone).'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 13: CONFIRMING_NAME → YES
// ──────────────────────────────────────────────────────────

function generateConfirmingNameYes(count) {
  let generated = 0;
  while (generated < count) {
    const name = pick(NAMES.two_word);
    const treatments = pick(TREATMENTS.single);
    const input = pick(CONFIRMATIONS.simple);
    addScenario(
      input,
      { state: 'confirming_name', data: { name, treatment: treatments, treatments: [treatments], date: '2026-08-15', time: '14:00', phone: '+6590123456' } },
      `Can I confirm your name is ${name}?\n\nReply YES to proceed, or let me know if I got it wrong.`,
      EXPECTED_BEHAVIOR.confirming_name_yes,
      'booking',
      'PAST-013',
      'User confirms name',
      'Must proceed to AWAITING_PHONE. Must NOT skip to booking summary.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 14: CONFIRMING_NAME → NAME CORRECTION
// ──────────────────────────────────────────────────────────

function generateConfirmingNameCorrect(count) {
  let generated = 0;
  const templates = CONFIRMATIONS.correction_name;
  while (generated < count) {
    const wrongName = 'Steven';
    const correctName = pick(NAMES.two_word);
    const treatments = pick(TREATMENTS.single);
    const template = pick(templates);
    const input = formatTemplate(template, { name: correctName });
    addScenario(
      input,
      { state: 'confirming_name', data: { name: wrongName, treatment: treatments, treatments: [treatments], date: '2026-08-15', time: '14:00', phone: '+6590123456' } },
      `Can I confirm your name is ${wrongName}?\n\nReply YES to proceed, or let me know if I got it wrong.`,
      EXPECTED_BEHAVIOR.confirming_name_correct,
      'booking',
      'PAST-014',
      'User corrects name during confirmation',
      'Must update name and re-confirm. Must NOT proceed with wrong name.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 15: AWAITING_PHONE → YES
// ──────────────────────────────────────────────────────────

function generateAwaitingPhoneYes(count) {
  let generated = 0;
  while (generated < count) {
    const name = pick(NAMES.two_word);
    const treatments = pick(TREATMENTS.multi_pairs);
    const input = pick(CONFIRMATIONS.simple);
    addScenario(
      input,
      { state: 'awaiting_phone', data: { name, treatment: treatments[0], treatments, date: '2026-08-15', time: '14:00', phone: '+6590123456' } },
      `Thanks, ${name}! Just to confirm — your contact number is +6590123456? (reply YES to confirm or provide a different number)`,
      EXPECTED_BEHAVIOR.awaiting_phone_yes,
      'booking',
      'PAST-015',
      'User confirms phone number',
      'Must show booking summary with all fields. Must NOT skip to booking creation.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 16: AWAITING_CONFIRMATION → YES
// ──────────────────────────────────────────────────────────

function generateAwaitingConfirmationYes(count) {
  let generated = 0;
  while (generated < count) {
    const name = pick(NAMES.two_word);
    const treatments = pick(TREATMENTS.multi_pairs);
    const input = pick(CONFIRMATIONS.simple);
    addScenario(
      input,
      { state: 'awaiting_confirmation', data: { name, treatment: treatments[0], treatments, date: '2026-08-15', time: '14:00', phone: '+6590123456' } },
      'Booking Summary: Name: ..., Date: ..., Time: ..., Treatments: ..., Phone: ...\n\nReply YES to confirm or let me know what to change.',
      EXPECTED_BEHAVIOR.awaiting_confirmation_yes,
      'booking',
      'PAST-016',
      'User confirms final booking summary',
      'Must call attemptBooking and create appointment. Must NOT fail with "Booking system error".'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 17: AWAITING_CONFIRMATION → CHANGE REQUEST
// ──────────────────────────────────────────────────────────

function generateAwaitingConfirmationChange(count) {
  let generated = 0;
  while (generated < count) {
    const name = pick(NAMES.two_word);
    const treatments = pick(TREATMENTS.single);
    const changeRequests = ['Change date to next Monday', 'Make it Tuesday instead', 'Change time to 3pm', 'Add Botox too', 'Remove Thread Lift', 'My name is actually Sarah', 'Use 91234567 instead'];
    const input = pick(changeRequests);
    addScenario(
      input,
      { state: 'awaiting_confirmation', data: { name, treatment: treatments, treatments: [treatments], date: '2026-08-15', time: '14:00', phone: '+6590123456' } },
      'Booking Summary: Name: ..., Date: ..., Time: ..., Treatments: ..., Phone: ...\n\nReply YES to confirm or let me know what to change.',
      EXPECTED_BEHAVIOR.awaiting_confirmation_change,
      'booking',
      'PAST-017',
      'User requests change during final confirmation',
      'Must update specific field and show updated summary. Must NOT restart the whole flow.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 18: SERVICE INQUIRIES
// ──────────────────────────────────────────────────────────

function generateServiceInquiries(count) {
  let generated = 0;
  const allTemplates = [
    ...SERVICE_INQUIRIES.list_all,
    ...SERVICE_INQUIRIES.single_pricing,
    ...SERVICE_INQUIRIES.single_description,
    ...SERVICE_INQUIRIES.duration,
    ...SERVICE_INQUIRIES.multi_treatment_inquiry
  ];
  while (generated < count) {
    const template = pick(allTemplates);
    const treatment = pick(TREATMENTS.single);
    const treatment2 = pickDifferent(TREATMENTS.single, treatment);
    const input = formatTemplate(template, { treatment, treatment2 });
    addScenario(
      input,
      { state: 'idle', data: {} },
      'What can I help you with today?',
      EXPECTED_BEHAVIOR.service_inquiry,
      'service_inquiry',
      'PAST-018',
      'User asks about services/pricing/duration',
      'Must provide service information. Must NOT ask for booking date or show booking summary.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 19: LOCATION INQUIRIES
// ──────────────────────────────────────────────────────────

function generateLocationInquiries(count) {
  let generated = 0;
  const allTemplates = [
    ...LOCATION_INQUIRIES.address,
    ...LOCATION_INQUIRIES.directions,
    ...LOCATION_INQUIRIES.both,
    ...LOCATION_INQUIRIES.parking
  ];
  while (generated < count) {
    const template = pick(allTemplates);
    const input = formatTemplate(template, {});
    addScenario(
      input,
      { state: 'idle', data: {} },
      'What can I help you with today?',
      EXPECTED_BEHAVIOR.location_inquiry,
      'location_inquiry',
      'PAST-019',
      'User asks about clinic location/directions',
      'Must provide address, MRT, landmarks, parking, Google Maps. Must NOT say "contact us directly".'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 20: CONTEXT REPLIES ("Both", "Address", "Directions")
// ──────────────────────────────────────────────────────────

function generateContextReplies(count) {
  let generated = 0;
  const allTemplates = [
    ...CONTEXT_REPLIES.after_address,
    ...CONTEXT_REPLIES.after_directions,
    ...CONTEXT_REPLIES.duration_questions
  ];
  while (generated < count) {
    const template = pick(allTemplates);
    const input = formatTemplate(template, {});
    const contextType = Math.random() < 0.5 ? 'address' : 'directions';
    const context = contextType === 'address'
      ? 'Our address is: 123 Orchard Road, #01-01, Singapore 238888. Would you also like directions?'
      : 'We are near Somerset MRT. Would you also like the full address?';
    addScenario(
      input,
      { state: 'idle', data: {} },
      context,
      EXPECTED_BEHAVIOR.context_reply_both,
      'context_reply',
      'PAST-020',
      'User replies to context question (Both/address/directions/duration)',
      'Must understand "Both" and provide everything. Must NOT say "contact us directly" or "did not catch".'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 21: CANCELLATIONS
// ──────────────────────────────────────────────────────────

function generateCancellations(count) {
  let generated = 0;
  const allTemplates = [...CANCELLATIONS.words, ...CANCELLATIONS.sentences];
  while (generated < count) {
    const input = pick(allTemplates);
    const state = pick(['idle', 'awaiting_date', 'awaiting_time', 'awaiting_treatment', 'confirming_treatment', 'awaiting_name', 'confirming_name', 'awaiting_phone', 'awaiting_confirmation']);
    addScenario(
      input,
      { state, data: { treatment: 'Botox', date: '2026-08-15' } },
      'Previous bot message depending on state',
      EXPECTED_BEHAVIOR.cancellation,
      'cancellation',
      'PAST-021',
      'User cancels at any point in the flow',
      'Must reset state to idle and acknowledge cancellation. Must NOT continue with booking flow.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 22: ADMIN OVERRIDES
// ──────────────────────────────────────────────────────────

function generateAdminOverrides(count) {
  let generated = 0;
  const allTemplates = [...ADMIN_OVERRIDES.pause, ...ADMIN_OVERRIDES.resume];
  while (generated < count) {
    const input = pick(allTemplates);
    addScenario(
      input,
      { state: 'idle', data: {} },
      'What can I help you with today?',
      EXPECTED_BEHAVIOR.admin_override,
      'admin_override',
      'PAST-022',
      'Admin triggers manual takeover',
      'Must pause bot for 30 minutes. Must be case-sensitive for "I WILL TAKE OVER".'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 23: OUT-OF-SCOPE / FALLBACK
// ──────────────────────────────────────────────────────────

function generateOutOfScope(count) {
  let generated = 0;
  const allTemplates = [
    ...OUT_OF_SCOPE.products,
    ...OUT_OF_SCOPE.careers,
    ...OUT_OF_SCOPE.reviews,
    ...OUT_OF_SCOPE.competitors,
    ...OUT_OF_SCOPE.medical,
    ...OUT_OF_SCOPE.gibberish,
    ...OUT_OF_SCOPE.empty_or_emoji
  ];
  while (generated < count) {
    const template = pick(allTemplates);
    const input = formatTemplate(template, {});
    addScenario(
      input,
      { state: 'idle', data: {} },
      'What can I help you with today?',
      EXPECTED_BEHAVIOR.out_of_scope,
      'out_of_scope',
      'PAST-023',
      'User asks something outside bot scope',
      'Must fall back to OpenAI gracefully. Must NOT hallucinate booking or service details.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 24: GREETINGS
// ──────────────────────────────────────────────────────────

function generateGreetings(count) {
  let generated = 0;
  const allTemplates = [...GREETINGS.simple, ...GREETINGS.with_name, ...GREETINGS.casual];
  while (generated < count) {
    const input = pick(allTemplates);
    addScenario(
      input,
      { state: 'idle', data: {} },
      null,
      EXPECTED_BEHAVIOR.greeting,
      'greeting',
      'PAST-024',
      'User sends greeting',
      'Must greet and ask how to help. Must NOT start booking flow.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 25: OPENING HOURS
// ──────────────────────────────────────────────────────────

function generateOpeningHours(count) {
  let generated = 0;
  const allTemplates = [...OPENING_HOURS.general, ...OPENING_HOURS.specific_day, ...OPENING_HOURS.booking_time_check];
  while (generated < count) {
    const template = pick(allTemplates);
    const input = formatTemplate(template, {});
    addScenario(
      input,
      { state: 'idle', data: {} },
      'What can I help you with today?',
      EXPECTED_BEHAVIOR.opening_hours,
      'opening_hours',
      'PAST-025',
      'User asks about opening hours',
      'Must provide operating hours. Must validate booking times against hours.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 26: MIXED INTENTS
// ──────────────────────────────────────────────────────────

function generateMixedIntents(count) {
  let generated = 0;
  const allTemplates = [
    ...MIXED_INTENTS.booking_plus_inquiry,
    ...MIXED_INTENTS.greeting_plus_intent,
    ...MIXED_INTENTS.multiple_inquiries
  ];
  while (generated < count) {
    const template = pick(allTemplates);
    const treatment = pick(TREATMENTS.single);
    const treatment2 = pickDifferent(TREATMENTS.single, treatment);
    const date = pick(DATE_EXPRESSIONS.relative);
    const time = pick(TIME_EXPRESSIONS.standard);
    const input = formatTemplate(template, { treatment, treatment2, date, time });
    addScenario(
      input,
      { state: 'idle', data: {} },
      'What can I help you with today?',
      {
        expected_intents: ['booking', 'service_inquiry', 'location_inquiry'],
        response_must_contain_any: ['treatment', 'price', 'address', 'Which date', 'How can I help'],
        priority: 'medium',
        bug_category: 'mixed_intents'
      },
      'mixed_intents',
      'PAST-026',
      'User sends multiple intents in one message',
      'Must handle multiple intents or fall back to OpenAI. Must NOT ignore parts of the message.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 27: TYPO / NORMALIZATION
// ──────────────────────────────────────────────────────────

function generateTypos(count) {
  let generated = 0;
  while (generated < count) {
    const typo = pick(TREATMENTS.typos);
    const templates = ['I want {treatment}', 'Book {treatment}', 'What is {treatment}?', 'How much is {treatment}?'];
    const template = pick(templates);
    const input = formatTemplate(template, { treatment: typo });
    addScenario(
      input,
      { state: 'idle', data: {} },
      'What can I help you with today?',
      {
        expected_intents: ['booking', 'service_inquiry'],
        response_must_contain_any: ['treatment', 'Which date', 'price', 'cost'],
        priority: 'high',
        bug_category: 'typo_normalization'
      },
      'typo_normalization',
      'PAST-027',
      'User makes typos in treatment names',
      'Must use fuzzy matching to normalize typos. Must NOT fail to recognize treatment.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 28: SPACED TREATMENT NAMES
// ──────────────────────────────────────────────────────────

function generateSpacedNames(count) {
  let generated = 0;
  while (generated < count) {
    const spaced = pick(TREATMENTS.spaced);
    const templates = ['I want {treatment}', 'Book {treatment}', 'What is {treatment}?', 'Tell me about {treatment}'];
    const template = pick(templates);
    const input = formatTemplate(template, { treatment: spaced });
    addScenario(
      input,
      { state: 'idle', data: {} },
      'What can I help you with today?',
      {
        expected_intents: ['booking', 'service_inquiry'],
        response_must_contain_any: ['treatment', 'Which date', 'price', 'cost'],
        priority: 'high',
        bug_category: 'spaced_normalization'
      },
      'spaced_normalization',
      'PAST-028',
      'User uses spaced variants (e.g., "micro needling")',
      'Must normalize spaced variants to match service names. Must NOT fail to recognize.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 29: DATE PARSING EDGE CASES
// ──────────────────────────────────────────────────────────

function generateDateEdgeCases(count) {
  let generated = 0;
  const allDates = [...DATE_EXPRESSIONS.ambiguous, ...DATE_EXPRESSIONS.invalid];
  while (generated < count) {
    const dateExpr = pick(allDates);
    const input = `I want to book Botox for ${dateExpr}`;
    const isInvalid = DATE_EXPRESSIONS.invalid.includes(dateExpr);
    addScenario(
      input,
      { state: 'idle', data: {} },
      'What can I help you with today?',
      {
        expected_intents: ['booking'],
        expected_next_state: isInvalid ? 'awaiting_date' : 'awaiting_time',
        response_must_contain_any: isInvalid
          ? ['Which date', 'date works', 'say it again', 'did not catch']
          : ['time', 'What time', 'Which time'],
        priority: 'high',
        bug_category: 'date_parsing'
      },
      'date_parsing',
      'PAST-029',
      `Date parsing test: "${dateExpr}"`,
      'Must handle ambiguous dates (next Monday) and reject invalid dates (yesterday).'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 30: TIME VALIDATION
// ──────────────────────────────────────────────────────────

function generateTimeValidation(count) {
  let generated = 0;
  const allTimes = [...TIME_EXPRESSIONS.invalid, ...TIME_EXPRESSIONS.relative];
  while (generated < count) {
    const timeExpr = pick(allTimes);
    const input = `${timeExpr}`;
    const isInvalid = TIME_EXPRESSIONS.invalid.includes(timeExpr);
    addScenario(
      input,
      { state: 'awaiting_time', data: { treatment: 'Botox', date: '2026-08-15' } },
      'What time would you prefer?',
      {
        expected_next_state: isInvalid ? 'awaiting_time' : 'awaiting_treatment',
        response_must_contain_any: isInvalid
          ? ['not open', 'closed', 'opening hours', 'between']
          : ['treatment', 'Which treatment', 'What treatment'],
        priority: 'high',
        bug_category: 'time_validation'
      },
      'time_validation',
      'PAST-030',
      `Time validation test: "${timeExpr}"`,
      'Must validate time against opening hours. Must reject times before open or after close.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 31: NAME WITH TITLES
// ──────────────────────────────────────────────────────────

function generateNameWithTitles(count) {
  let generated = 0;
  while (generated < count) {
    const name = pick(NAMES.with_title);
    const treatments = pick(TREATMENTS.single);
    addScenario(
      name,
      { state: 'awaiting_name', data: { treatment: treatments, treatments: [treatments], date: '2026-08-15', time: '14:00' } },
      `Great! ${treatments} it is. ✓\n\nMay I have your name for the booking?`,
      EXPECTED_BEHAVIOR.awaiting_name_valid,
      'booking',
      'PAST-031',
      'User provides name with title (Dr., Mr., Ms., Mrs., Mdm.)',
      'Must accept and preserve titles in name. Must NOT strip titles incorrectly.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 32: THREE-WORD NAMES
// ──────────────────────────────────────────────────────────

function generateThreeWordNames(count) {
  let generated = 0;
  while (generated < count) {
    const name = pick(NAMES.three_word);
    const treatments = pick(TREATMENTS.single);
    addScenario(
      name,
      { state: 'awaiting_name', data: { treatment: treatments, treatments: [treatments], date: '2026-08-15', time: '14:00' } },
      `Great! ${treatments} it is. ✓\n\nMay I have your name for the booking?`,
      EXPECTED_BEHAVIOR.awaiting_name_valid,
      'booking',
      'PAST-032',
      'User provides three-word name (e.g., "Steven Tan Wei")',
      'Must accept multi-word names. Must NOT reject names with >4 words.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 33: AWAITING_NAME → ADDITIONAL TREATMENT
// ──────────────────────────────────────────────────────────

function generateAwaitingNameTreatmentAdd(count) {
  let generated = 0;
  while (generated < count) {
    const existing = pick(TREATMENTS.single);
    const newTreatment = pickDifferent(TREATMENTS.single, existing);
    const templates = ['Also {treatment}', 'Add {treatment} too', 'And {treatment}', 'I also want {treatment}'];
    const input = formatTemplate(pick(templates), { treatment: newTreatment });
    addScenario(
      input,
      { state: 'awaiting_name', data: { treatment: existing, treatments: [existing], date: '2026-08-15', time: '14:00' } },
      `Great! ${existing} it is. ✓\n\nMay I have your name for the booking?`,
      EXPECTED_BEHAVIOR.awaiting_name_treatment_add,
      'booking',
      'PAST-033',
      'User adds treatment when bot is asking for name',
      'Must add treatment to list and still ask for name. Must NOT treat as name or proceed without name.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 34: COMPARE TREATMENTS
// ──────────────────────────────────────────────────────────

function generateCompareTreatments(count) {
  let generated = 0;
  while (generated < count) {
    const t1 = pick(TREATMENTS.single);
    const t2 = pickDifferent(TREATMENTS.single, t1);
    const template = pick(SERVICE_INQUIRIES.compare);
    const input = formatTemplate(template, { treatment: t1, treatment2: t2 });
    addScenario(
      input,
      { state: 'idle', data: {} },
      'What can I help you with today?',
      EXPECTED_BEHAVIOR.service_inquiry,
      'service_inquiry',
      'PAST-034',
      'User asks to compare two treatments',
      'Must provide comparison information. Must NOT start booking flow.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 35: BOOKING WITH RELATIVE DATE
// ──────────────────────────────────────────────────────────

function generateBookingRelativeDate(count) {
  let generated = 0;
  while (generated < count) {
    const treatment = pick(TREATMENTS.single);
    const date = pick(DATE_EXPRESSIONS.relative);
    const input = `I want to book ${treatment} for ${date}`;
    addScenario(
      input,
      { state: 'idle', data: {} },
      'What can I help you with today?',
      {
        expected_intents: ['booking'],
        expected_next_state: 'awaiting_time',
        response_must_contain_any: ['time', 'What time', 'Which time', 'works'],
        priority: 'high',
        bug_category: 'relative_date_parsing'
      },
      'booking',
      'PAST-035',
      'Booking with relative date (tomorrow, next Monday)',
      'Must correctly parse relative dates to absolute dates. Must use SGT timezone (UTC+8).'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 36: INVALID PHONE NUMBERS
// ──────────────────────────────────────────────────────────

function generateInvalidPhone(count) {
  let generated = 0;
  const invalidPhones = ['123', 'abc', '0000000', '999999999999', 'phone', 'my number', 'call me', 'same'];
  while (generated < count) {
    const phone = pick(invalidPhones);
    const name = pick(NAMES.two_word);
    const treatments = pick(TREATMENTS.single);
    addScenario(
      phone,
      { state: 'awaiting_phone', data: { name, treatment: treatments, treatments: [treatments], date: '2026-08-15', time: '14:00', phone: '+6590123456' } },
      `Thanks, ${name}! Just to confirm — your contact number is +6590123456? (reply YES to confirm or provide a different number)`,
      {
        expected_next_state: 'awaiting_phone',
        response_must_contain_any: ['number', 'contact', 'valid', 'phone', 'different number'],
        priority: 'high',
        bug_category: 'phone_validation'
      },
      'booking',
      'PAST-036',
      'User provides invalid phone number',
      'Must ask for a valid phone number. Must NOT accept invalid formats.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 37: BOOKING WITH INVALID TIME
// ──────────────────────────────────────────────────────────

function generateBookingInvalidTime(count) {
  let generated = 0;
  while (generated < count) {
    const treatment = pick(TREATMENTS.single);
    const date = pick(DATE_EXPRESSIONS.absolute);
    const time = pick(TIME_EXPRESSIONS.invalid);
    const input = `I want to book ${treatment} for ${date} at ${time}`;
    addScenario(
      input,
      { state: 'idle', data: {} },
      'What can I help you with today?',
      {
        expected_intents: ['booking'],
        expected_next_state: 'awaiting_time',
        response_must_contain_any: ['not open', 'closed', 'opening hours', 'between', 'time'],
        priority: 'high',
        bug_category: 'invalid_time_rejection'
      },
      'booking',
      'PAST-037',
      'Booking request with invalid time (before open or after close)',
      'Must reject time and suggest valid times. Must NOT proceed with invalid time.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 38: REPEATED MESSAGES
// ──────────────────────────────────────────────────────────

function generateRepeatedMessages(count) {
  let generated = 0;
  while (generated < count) {
    const treatment = pick(TREATMENTS.single);
    const input = `${treatment} ${treatment} ${treatment}`;
    addScenario(
      input,
      { state: 'idle', data: {} },
      'What can I help you with today?',
      {
        expected_intents: ['booking'],
        expected_next_state: 'awaiting_date',
        response_must_contain_any: ['Which date', 'date works', 'When would you like'],
        priority: 'medium',
        bug_category: 'repeated_input'
      },
      'booking',
      'PAST-038',
      'User sends repeated treatment name',
      'Must handle gracefully and deduplicate. Must NOT crash or show repeated treatments.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 39: CODE INJECTION / MALICIOUS INPUT
// ──────────────────────────────────────────────────────────

function generateMaliciousInput(count) {
  let generated = 0;
  const malicious = [
    'DROP TABLE users;', 'SELECT * FROM passwords;', '<script>alert("xss")</script>',
    '"; DELETE FROM appointments; --', "' OR '1'='1", '$(rm -rf /)', '<?php echo shell_exec("ls"); ?>',
    '{"$ne": null}', 'NaN', 'undefined', 'null', 'true', 'false', '[object Object]',
    'constructor', '__proto__', 'prototype', 'eval(', 'Function(', 'setTimeout(',
    'process.exit()', 'require("fs")', 'fs.readFile', 'child_process', 'os.system'
  ];
  while (generated < count) {
    const input = pick(malicious);
    addScenario(
      input,
      { state: 'idle', data: {} },
      'What can I help you with today?',
      {
        expected_handler: 'openai_fallback',
        response_must_contain_any: ['I apologize', 'not sure', 'help you with', 'booking', 'treatment'],
        priority: 'critical',
        bug_category: 'security'
      },
      'security',
      'PAST-039',
      'Malicious input / code injection attempt',
      'CRITICAL: Must NOT execute code or access filesystem. Must fall back to OpenAI safely.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 40: EMPTY / WHITESPACE / EMOJI ONLY
// ──────────────────────────────────────────────────────────

function generateEmptyInput(count) {
  let generated = 0;
  const inputs = ['', '   ', '\n\n', '👍', '👋', '😊', '❤️', '👀', '✅', '✨', '👌', '🙏', '👍👍', 'hi 👋', 'ok ✅', 'sure 👍'];
  while (generated < count) {
    const input = pick(inputs);
    addScenario(
      input,
      { state: 'idle', data: {} },
      'What can I help you with today?',
      {
        expected_handler: 'openai_fallback',
        response_must_contain_any: ['How can I help', 'What can I do', 'Hello', 'Hi there'],
        priority: 'medium',
        bug_category: 'empty_input'
      },
      'fallback',
      'PAST-040',
      'Empty or emoji-only input',
      'Must handle gracefully. Must NOT crash or produce error.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 41: MULTI-TREATMENT WITH SPACED NAMES
// ──────────────────────────────────────────────────────────

function generateMultiTreatmentSpaced(count) {
  let generated = 0;
  while (generated < count) {
    const t1 = pick(TREATMENTS.spaced);
    const t2 = pickDifferent(TREATMENTS.spaced, t1);
    const input = `I want to book ${t1} and ${t2}`;
    addScenario(
      input,
      { state: 'idle', data: {} },
      'What can I help you with today?',
      {
        expected_intents: ['booking'],
        expected_next_state: 'awaiting_date',
        expected_state_data: ['treatments'],
        response_must_contain_any: ['Which date', 'date works'],
        priority: 'high',
        bug_category: 'spaced_multi_treatment'
      },
      'booking',
      'PAST-041',
      'Booking with spaced treatment names (e.g., "micro needling and pico sure laser")',
      'Must normalize both spaced names. Must extract both treatments.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 42: CONFIRMING_NAME WITH TREATMENT ADDITION
// ──────────────────────────────────────────────────────────

function generateConfirmingNameYesAdd(count) {
  let generated = 0;
  while (generated < count) {
    const name = pick(NAMES.two_word);
    const existing = pick(TREATMENTS.single);
    const newTreatment = pickDifferent(TREATMENTS.single, existing);
    const templates = ['Yes and also add {treatment}', 'Sure, I want {treatment} too', 'Yes and {treatment}'];
    const input = formatTemplate(pick(templates), { treatment: newTreatment });
    addScenario(
      input,
      { state: 'confirming_name', data: { name, treatment: existing, treatments: [existing], date: '2026-08-15', time: '14:00', phone: '+6590123456' } },
      `Can I confirm your name is ${name}?\n\nReply YES to proceed, or let me know if I got it wrong.`,
      EXPECTED_BEHAVIOR.confirming_name_yes_add,
      'booking',
      'PAST-042',
      'User confirms name AND adds treatment during name confirmation',
      'Must add treatment and re-confirm name. Must NOT proceed to phone with new treatment unconfirmed.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 43: BOOKING WITH ALL FIELDS + MULTI TREATMENT
// ──────────────────────────────────────────────────────────

function generateAllFieldsMultiTreatment(count) {
  let generated = 0;
  while (generated < count) {
    const pair = pick(TREATMENTS.multi_pairs);
    const date = pick(DATE_EXPRESSIONS.absolute);
    const time = pick(TIME_EXPRESSIONS.standard);
    const templates = [
      'I want to book {treatment} and {treatment2} for {date} at {time}',
      'Book {treatment} and {treatment2} on {date} at {time}',
      'Can I get {treatment} and {treatment2} on {date} at {time}?'
    ];
    const input = formatTemplate(pick(templates), { treatment: pair[0], treatment2: pair[1], date, time });
    addScenario(
      input,
      { state: 'idle', data: {} },
      'What can I help you with today?',
      EXPECTED_BEHAVIOR.idle_booking_all_fields,
      'booking',
      'PAST-043',
      'All booking fields provided with multiple treatments in first message',
      'CRITICAL: Must go to CONFIRMING_TREATMENT with both treatments. Must NOT auto-book or skip.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 44: NAME CORRECTION DURING CONFIRMING_TREATMENT
// ──────────────────────────────────────────────────────────

function generateNameInTreatmentConfirm(count) {
  let generated = 0;
  while (generated < count) {
    const treatments = pick(TREATMENTS.single);
    const name = pick(NAMES.two_word);
    const templates = ['My name is {name}', 'I am {name}', 'Call me {name}'];
    const input = formatTemplate(pick(templates), { name });
    addScenario(
      input,
      { state: 'confirming_treatment', data: { treatment: treatments, treatments: [treatments], date: '2026-08-15', time: '14:00' } },
      `Can I confirm you want ${treatments}?\n\nReply YES to proceed, or tell me if you'd like to add or change anything.`,
      {
        expected_next_state: 'confirming_name',
        expected_state_data: ['name'],
        response_must_contain: ['Can I confirm your name'],
        priority: 'critical',
        bug_category: 'name_correction_early'
      },
      'booking',
      'PAST-044',
      'User provides name when bot is confirming treatment',
      'Must detect name and skip to CONFIRMING_NAME. Must NOT ignore name or ask for it again.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 45: DURATION QUESTION DURING CONFIRMING_TREATMENT
// ──────────────────────────────────────────────────────────

function generateDurationQuestion(count) {
  let generated = 0;
  while (generated < count) {
    const treatments = pick(TREATMENTS.single);
    const templates = ['How long does it take?', 'How many minutes?', 'What time will I finish?', 'Will it extend past closing?', 'Duration?'];
    const input = pick(templates);
    addScenario(
      input,
      { state: 'confirming_treatment', data: { treatment: treatments, treatments: [treatments], date: '2026-08-15', time: '14:00' } },
      `Can I confirm you want ${treatments}?\n\nReply YES to proceed, or tell me if you'd like to add or change anything.`,
      {
        response_must_contain_any: ['minutes', 'hour', 'duration', 'closing', 'done by', 'within'],
        priority: 'medium',
        bug_category: 'duration_inquiry'
      },
      'booking',
      'PAST-045',
      'User asks about duration during treatment confirmation',
      'Must answer duration question. Must NOT lose treatment confirmation state.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 46: "HOW MUCH" AS FIRST MESSAGE (Pricing Inquiry)
// ──────────────────────────────────────────────────────────

function generatePricingFirstMessage(count) {
  let generated = 0;
  while (generated < count) {
    const treatment = pick(TREATMENTS.single);
    const templates = ['How much is {treatment}?', '{treatment} price?', 'Cost of {treatment}?', 'Is {treatment} expensive?'];
    const input = formatTemplate(pick(templates), { treatment });
    addScenario(
      input,
      { state: 'idle', data: {} },
      'What can I help you with today?',
      EXPECTED_BEHAVIOR.service_inquiry,
      'service_inquiry',
      'PAST-046',
      'User asks about pricing as first message',
      'Must provide pricing info. Must NOT ask for date or start booking flow.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 47: BOOKING WITH TYPO DATE
// ──────────────────────────────────────────────────────────

function generateBookingTypoDate(count) {
  let generated = 0;
  const typoDates = ['Auguest 15', 'Agust 15', 'Agu 15', '15ht August', 'Augost 15', 'Setember 15', 'Octber 15'];
  while (generated < count) {
    const treatment = pick(TREATMENTS.single);
    const date = pick(typoDates);
    const input = `I want to book ${treatment} for ${date}`;
    addScenario(
      input,
      { state: 'idle', data: {} },
      'What can I help you with today?',
      {
        expected_intents: ['booking'],
        expected_next_state: 'awaiting_time',
        response_must_contain_any: ['time', 'What time', 'Which time', 'works', 'noted'],
        priority: 'medium',
        bug_category: 'typo_date_parsing'
      },
      'booking',
      'PAST-047',
      'Booking with typo in date (e.g., "Auguest 15")',
      'Must handle minor typos in month names. Must NOT fail to parse date.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 48: CONFIRMING_TREATMENT WITH "BOTH" RESPONSE
// ──────────────────────────────────────────────────────────

function generateBothInTreatmentConfirm(count) {
  let generated = 0;
  while (generated < count) {
    const treatments = pick(TREATMENTS.multi_pairs);
    const input = 'Both';
    addScenario(
      input,
      { state: 'confirming_treatment', data: { treatment: treatments[0], treatments, date: '2026-08-15', time: '14:00' } },
      `Can I confirm you want ${treatments.join(' + ')}?\n\nReply YES to proceed, or tell me if you'd like to add or change anything.`,
      {
        expected_next_state: 'awaiting_name',
        response_must_contain_any: ['May I have your name', 'your name', 'What is your name'],
        priority: 'high',
        bug_category: 'both_confirmation'
      },
      'booking',
      'PAST-048',
      'User replies "Both" when confirming treatments',
      'Must interpret "Both" as confirmation of all listed treatments. Must NOT treat as ambiguous.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 49: AWAITING_DATE WITH DATE + TREATMENT (no time)
// ──────────────────────────────────────────────────────────

function generateAwaitingDateWithTreatment(count) {
  let generated = 0;
  while (generated < count) {
    const existing = pick(TREATMENTS.single);
    const newTreatment = pickDifferent(TREATMENTS.single, existing);
    const date = pick(DATE_EXPRESSIONS.relative);
    const input = `${date} and also ${newTreatment}`;
    addScenario(
      input,
      { state: 'awaiting_date', data: { treatment: existing, treatments: [existing] } },
      `${existing} — lovely choice! Which date works for you?`,
      {
        expected_next_state: 'awaiting_time',
        expected_state_data: ['treatments', 'date'],
        response_must_contain_any: ['time', 'What time', 'Which time', 'works', 'Noted'],
        priority: 'critical',
        bug_category: 'date_plus_treatment_addition'
      },
      'booking',
      'PAST-049',
      'User provides date AND adds new treatment when bot is asking for date',
      'Must capture date AND add new treatment. Must NOT lose either piece of information.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// GENERATOR 50: AWAITING_TIME WITH TIME + TREATMENT (no date)
// ──────────────────────────────────────────────────────────

function generateAwaitingTimeWithTreatment(count) {
  let generated = 0;
  while (generated < count) {
    const existingDate = '2026-08-15';
    const existingTreatment = pick(TREATMENTS.single);
    const newTreatment = pickDifferent(TREATMENTS.single, existingTreatment);
    const time = pick(TIME_EXPRESSIONS.standard);
    const input = `${time} and also ${newTreatment}`;
    addScenario(
      input,
      { state: 'awaiting_time', data: { treatment: existingTreatment, treatments: [existingTreatment], date: existingDate } },
      `${existingDate} works. What time would you prefer?`,
      {
        expected_next_state: 'confirming_treatment',
        expected_state_data: ['treatments', 'time'],
        response_must_contain: ['Can I confirm'],
        priority: 'critical',
        bug_category: 'time_plus_treatment_addition'
      },
      'booking',
      'PAST-050',
      'User provides time AND adds new treatment when bot is asking for time',
      'Must capture time AND add new treatment. Must go to CONFIRMING_TREATMENT.'
    );
    generated++;
  }
}

// ──────────────────────────────────────────────────────────
// MAIN GENERATION
// ──────────────────────────────────────────────────────────

function generateScenarios(targetCount) {
  console.log(`[Scenario Maker] Generating ${targetCount} scenarios...`);

  // Weighted distribution across categories
  // Critical bugs get more coverage
  const weights = {
    idleBookingSingle: 0.04,        // 4,000
    idleBookingMulti: 0.04,         // 4,000
    idleBookingAllFields: 0.05,     // 5,000 - CRITICAL: no auto-booking
    awaitingDateTreatmentAdd: 0.04, // 4,000 - CRITICAL
    awaitingDateWithTimeTreatment: 0.04, // 4,000 - CRITICAL
    confirmingTreatmentYes: 0.04,   // 4,000
    confirmingTreatmentYesAdd: 0.04, // 4,000
    confirmingTreatmentCorrect: 0.03, // 3,000
    confirmingTreatmentReject: 0.03, // 3,000
    awaitingNameValid: 0.03,        // 3,000
    awaitingNameInvalid: 0.04,      // 4,000 - CRITICAL: name validation
    awaitingNameWithPhone: 0.02,    // 2,000
    confirmingNameYes: 0.03,        // 3,000
    confirmingNameCorrect: 0.02,    // 2,000
    awaitingPhoneYes: 0.03,         // 3,000
    awaitingConfirmationYes: 0.03, // 3,000
    awaitingConfirmationChange: 0.02, // 2,000
    serviceInquiries: 0.04,         // 4,000
    locationInquiries: 0.03,        // 3,000
    contextReplies: 0.03,           // 3,000
    cancellations: 0.02,            // 2,000
    adminOverrides: 0.01,           // 1,000
    outOfScope: 0.03,             // 3,000
    greetings: 0.02,              // 2,000
    openingHours: 0.02,           // 2,000
    mixedIntents: 0.02,           // 2,000
    typos: 0.03,                  // 3,000
    spacedNames: 0.03,            // 3,000
    dateEdgeCases: 0.02,          // 2,000
    timeValidation: 0.02,         // 2,000
    nameWithTitles: 0.01,         // 1,000
    threeWordNames: 0.01,         // 1,000
    awaitingNameTreatmentAdd: 0.03, // 3,000
    compareTreatments: 0.01,      // 1,000
    bookingRelativeDate: 0.02,    // 2,000
    invalidPhone: 0.01,           // 1,000
    bookingInvalidTime: 0.02,     // 2,000
    repeatedMessages: 0.01,       // 1,000
    maliciousInput: 0.01,        // 1,000
    emptyInput: 0.01,            // 1,000
    multiTreatmentSpaced: 0.02,   // 2,000
    confirmingNameYesAdd: 0.02,   // 2,000
    allFieldsMultiTreatment: 0.03, // 3,000
    nameInTreatmentConfirm: 0.02, // 2,000
    durationQuestion: 0.01,       // 1,000
    pricingFirstMessage: 0.02,    // 2,000
    bookingTypoDate: 0.01,      // 1,000
    bothInTreatmentConfirm: 0.01, // 1,000
    awaitingDateWithTreatment: 0.03, // 3,000
    awaitingTimeWithTreatment: 0.03  // 3,000
  };

  // Generate each category
  for (const [key, weight] of Object.entries(weights)) {
    const count = Math.max(1, Math.floor(targetCount * weight));
    switch (key) {
      case 'idleBookingSingle': generateIdleBookingSingle(count); break;
      case 'idleBookingMulti': generateIdleBookingMulti(count); break;
      case 'idleBookingAllFields': generateIdleBookingAllFields(count); break;
      case 'awaitingDateTreatmentAdd': generateAwaitingDateTreatmentAddition(count); break;
      case 'awaitingDateWithTimeTreatment': generateAwaitingDateWithTimeTreatment(count); break;
      case 'confirmingTreatmentYes': generateConfirmingTreatmentYes(count); break;
      case 'confirmingTreatmentYesAdd': generateConfirmingTreatmentYesAdd(count); break;
      case 'confirmingTreatmentCorrect': generateConfirmingTreatmentCorrect(count); break;
      case 'confirmingTreatmentReject': generateConfirmingTreatmentReject(count); break;
      case 'awaitingNameValid': generateAwaitingNameValid(count); break;
      case 'awaitingNameInvalid': generateAwaitingNameInvalid(count); break;
      case 'awaitingNameWithPhone': generateAwaitingNameWithPhone(count); break;
      case 'confirmingNameYes': generateConfirmingNameYes(count); break;
      case 'confirmingNameCorrect': generateConfirmingNameCorrect(count); break;
      case 'awaitingPhoneYes': generateAwaitingPhoneYes(count); break;
      case 'awaitingConfirmationYes': generateAwaitingConfirmationYes(count); break;
      case 'awaitingConfirmationChange': generateAwaitingConfirmationChange(count); break;
      case 'serviceInquiries': generateServiceInquiries(count); break;
      case 'locationInquiries': generateLocationInquiries(count); break;
      case 'contextReplies': generateContextReplies(count); break;
      case 'cancellations': generateCancellations(count); break;
      case 'adminOverrides': generateAdminOverrides(count); break;
      case 'outOfScope': generateOutOfScope(count); break;
      case 'greetings': generateGreetings(count); break;
      case 'openingHours': generateOpeningHours(count); break;
      case 'mixedIntents': generateMixedIntents(count); break;
      case 'typos': generateTypos(count); break;
      case 'spacedNames': generateSpacedNames(count); break;
      case 'dateEdgeCases': generateDateEdgeCases(count); break;
      case 'timeValidation': generateTimeValidation(count); break;
      case 'nameWithTitles': generateNameWithTitles(count); break;
      case 'threeWordNames': generateThreeWordNames(count); break;
      case 'awaitingNameTreatmentAdd': generateAwaitingNameTreatmentAdd(count); break;
      case 'compareTreatments': generateCompareTreatments(count); break;
      case 'bookingRelativeDate': generateBookingRelativeDate(count); break;
      case 'invalidPhone': generateInvalidPhone(count); break;
      case 'bookingInvalidTime': generateBookingInvalidTime(count); break;
      case 'repeatedMessages': generateRepeatedMessages(count); break;
      case 'maliciousInput': generateMaliciousInput(count); break;
      case 'emptyInput': generateEmptyInput(count); break;
      case 'multiTreatmentSpaced': generateMultiTreatmentSpaced(count); break;
      case 'confirmingNameYesAdd': generateConfirmingNameYesAdd(count); break;
      case 'allFieldsMultiTreatment': generateAllFieldsMultiTreatment(count); break;
      case 'nameInTreatmentConfirm': generateNameInTreatmentConfirm(count); break;
      case 'durationQuestion': generateDurationQuestion(count); break;
      case 'pricingFirstMessage': generatePricingFirstMessage(count); break;
      case 'bookingTypoDate': generateBookingTypoDate(count); break;
      case 'bothInTreatmentConfirm': generateBothInTreatmentConfirm(count); break;
      case 'awaitingDateWithTreatment': generateAwaitingDateWithTreatment(count); break;
      case 'awaitingTimeWithTreatment': generateAwaitingTimeWithTreatment(count); break;
    }
  }

  // Fill remaining if we didn't hit exactly targetCount
  const remaining = targetCount - scenarios.length;
  if (remaining > 0) {
    console.log(`[Scenario Maker] Filling ${remaining} additional scenarios...`);
    generateIdleBookingSingle(remaining);
  }

  // Shuffle scenarios
  for (let i = scenarios.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [scenarios[i], scenarios[j]] = [scenarios[j], scenarios[i]];
  }

  // Truncate to exact count
  while (scenarios.length > targetCount) scenarios.pop();
  while (scenarios.length < targetCount) {
    generateIdleBookingSingle(1);
  }

  return scenarios;
}

// ──────────────────────────────────────────────────────────
// COVERAGE REPORT
// ──────────────────────────────────────────────────────────

function generateCoverageReport() {
  const categories = {};
  const bugRefs = {};
  const priorities = {};

  for (const s of scenarios) {
    categories[s.category] = (categories[s.category] || 0) + 1;
    bugRefs[s.bug_reference] = (bugRefs[s.bug_reference] || 0) + 1;
    priorities[s.expected.priority || 'medium'] = (priorities[s.expected.priority || 'medium'] || 0) + 1;
  }

  const report = {
    total_scenarios: scenarios.length,
    generated_at: new Date().toISOString(),
    by_category: categories,
    by_priority: priorities,
    by_bug_reference: bugRefs,
    critical_bugs_covered: Object.keys(bugRefs).length,
    categories_covered: Object.keys(categories).length
  };

  return report;
}

// ──────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────

const targetCount = REQUESTED_COUNT;
console.log(`[Scenario Maker] Starting generation of ${targetCount} scenarios...`);

const startTime = Date.now();
generateScenarios(targetCount);
const generationTime = Date.now() - startTime;

console.log(`[Scenario Maker] Generated ${scenarios.length} scenarios in ${generationTime}ms`);

// Write JSONL
const outputDir = path.dirname(OUTPUT_FILE);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const stream = fs.createWriteStream(OUTPUT_FILE);
for (const s of scenarios) {
  stream.write(JSON.stringify(s) + '\n');
}
stream.end();

console.log(`[Scenario Maker] Written to ${OUTPUT_FILE}`);

// Write coverage report
const report = generateCoverageReport();
const reportPath = OUTPUT_FILE.replace('.jsonl', '-coverage-report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`[Scenario Maker] Coverage report written to ${reportPath}`);

// Write human-readable summary
const summaryPath = OUTPUT_FILE.replace('.jsonl', '-summary.md');
let summary = `# Moon Hands Scenario Maker — Coverage Report

Generated: ${new Date().toISOString()}\nTotal Scenarios: ${report.total_scenarios}\nGeneration Time: ${generationTime}ms\n
## By Category\n\n`;
for (const [cat, count] of Object.entries(report.by_category).sort((a, b) => b[1] - a[1])) {
  summary += `- **${cat}**: ${count} scenarios (${((count / report.total_scenarios) * 100).toFixed(1)}%)\n`;
}
summary += `\n## By Priority\n\n`;
for (const [pri, count] of Object.entries(report.by_priority).sort((a, b) => b[1] - a[1])) {
  summary += `- **${pri}**: ${count} scenarios\n`;
}
summary += `\n## Bug References Covered (${report.critical_bugs_covered} unique bugs)\n\n`;
for (const [ref, count] of Object.entries(report.by_bug_reference).sort((a, b) => a[0].localeCompare(b[0]))) {
  summary += `- **${ref}**: ${count} scenarios\n`;
}
summary += `\n## Critical Scenarios for Past Bugs\n\n`;
summary += `| Bug ID | Description | Count | Priority |\n`;
summary += `|--------|-------------|-------|----------|\n`;
const criticalScenarios = scenarios.filter(s => s.expected.priority === 'critical');
const criticalByBug = {};
for (const s of criticalScenarios) {
  if (!criticalByBug[s.bug_reference]) {
    criticalByBug[s.bug_reference] = { description: s.description, count: 0, priority: s.expected.priority };
  }
  criticalByBug[s.bug_reference].count++;
}
for (const [ref, info] of Object.entries(criticalByBug).sort((a, b) => b[1].count - a[1].count)) {
  summary += `| ${ref} | ${info.description} | ${info.count} | ${info.priority} |\n`;
}

fs.writeFileSync(summaryPath, summary);
console.log(`[Scenario Maker] Summary written to ${summaryPath}`);
console.log(`[Scenario Maker] Done!`);
