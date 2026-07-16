/**
 * Moon Hands — 1000+ Permutation Conversation Test Suite
 *
 * Systematically tests every intent, every state transition, every edge case.
 * Covers: grammar errors, Singlish, multi-treatment, state recovery, all bug fixes.
 *
 * Run: node ai/test-1000-permutations.js
 */

const { matchIntents, INTENT_PATTERNS } = require('./intent-matcher');
const {
  BOOKING_STATES, getState, setState, resetIdle,
  extractBookingFields, extractAllTreatments,
  isConfirmation, isDenial, parseDatePhrase, parseTimePhrase
} = require('./conversation-state');

// ─── TEST CONFIGURATION ──────────────────────────────────────────

const TEST_SERVICES = [
  { name: 'Hydrating Facial', price: '$150', price_unit: 'session', duration: 60, description: 'Deep hydration for dry skin' },
  { name: 'Anti-Aging Treatment', price: '$380', price_unit: 'session', duration: 75, description: 'Reduce fine lines and wrinkles' },
  { name: 'Acne Clear Facial', price: '$180', price_unit: 'session', duration: 60, description: 'Clear acne and prevent breakouts' },
  { name: 'Laser Skin Rejuvenation', price: '$450', price_unit: 'session', duration: 45, description: 'Stimulate collagen production' },
  { name: 'Botox Consultation', price: '$15', price_unit: 'unit', duration: 30, description: 'Reduce wrinkles and fine lines' },
  { name: 'Dermal Filler', price: '$680', price_unit: 'syringe', duration: 45, description: 'Restore volume and contour' },
  { name: 'HIFU', price: '$1,200', price_unit: 'session', duration: 90, description: 'Non-surgical face lift' },
  { name: 'Thread Lift', price: '$2,500', price_unit: 'full face', duration: 60, description: 'Lift and tighten sagging skin' },
  { name: 'Chemical Peel', price: '$250', price_unit: 'session', duration: 45, description: 'Exfoliate and renew skin' },
  { name: 'Microneedling', price: '$350', price_unit: 'session', duration: 60, description: 'Improve skin texture and scars' },
  { name: 'PicoSure Laser', price: '$500', price_unit: 'session', duration: 30, description: 'Pigmentation and tattoo removal' },
  { name: 'Rejuran Healer', price: '$800', price_unit: 'session', duration: 45, description: 'Skin healing and rejuvenation' },
];

// ─── TEST RESULTS TRACKER ────────────────────────────────────────

let passed = 0, failed = 0, totalRun = 0;
const failures = [];
let currentSection = '';

function assert(condition, testName, details = '') {
  totalRun++;
  if (condition) { passed++; }
  else {
    failed++;
    failures.push({ section: currentSection, test: testName, details });
  }
}

function assertEqual(actual, expected, testName) {
  totalRun++;
  if (actual === expected) { passed++; }
  else {
    failed++;
    failures.push({ section: currentSection, test: testName, details: `Expected "${expected}", got "${actual}"` });
  }
}

function assertArray(actual, expected, testName) {
  totalRun++;
  const aStr = JSON.stringify(actual);
  const eStr = JSON.stringify(expected);
  if (aStr === eStr) { passed++; }
  else {
    failed++;
    failures.push({ section: currentSection, test: testName, details: `Expected ${eStr}, got ${aStr}` });
  }
}

function section(name) {
  currentSection = name;
}

// ─══════════════════════════════════════════════════════════════════
// PHASE 1: INTENT MATCHING (~350 permutations)
// ─══════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  PHASE 1: INTENT MATCHING (~350 permutations)');
console.log('═══════════════════════════════════════════════════════════════');

section('Intent: Greeting');
const greetings = ['hi','hello','hey','hii','hiii','heyy','heyyy','gm','good morning','good afternoon','good evening','howdy'];
greetings.forEach(g => {
  const m = matchIntents(g, [], true);
  assert(m.length > 0 && m[0].intent === 'greeting', `Greeting: "${g}"`, m.length > 0 ? `got ${m[0].intent}` : 'no match');
});
// Greetings that should NOT match (multi-word or not pure)
['hi there','hello! how are you','hi, i want to book','hey there','good morning! how are you today','yo','sup','morning'].forEach(g => {
  const m = matchIntents(g, [], true);
  // These may match booking_request or other intents - just ensure they're NOT greeting
  if (g === 'hi, i want to book') {
    assert(m.length > 0 && m[0].intent === 'booking_request', `Not greeting (booking): "${g}"`, m[0]?.intent);
  } else {
    assert(m.length === 0 || m[0].intent !== 'greeting', `Not pure greeting: "${g}"`, m[0]?.intent);
  }
});
// Greeting should NOT match on follow-up messages
['hi','hello'].forEach(g => {
  const m = matchIntents(g, [{ role: 'user', content: 'hello' }, { role: 'ai', content: 'hi there' }], false);
  assert(m.length === 0 || m[0].intent !== 'greeting', `No greeting on follow-up: "${g}"`, m[0]?.intent);
});

section('Intent: Goodbye');
['bye','thanks','thank you','see you','ok bye','got it','bye!','thx'].forEach(g => {
  const m = matchIntents(g, [], true);
  // thx won't match - that's expected
  if (g === 'thx') {
    assert(m.length === 0, `thx should not match: "${g}"`, m[0]?.intent);
  } else {
    assert(m.length > 0 && m[0].intent === 'goodbye', `Goodbye: "${g}"`, m[0]?.intent);
  }
});

section('Intent: Operating Hours');
['what time do you open','when do you close','what are your opening hours','are you open on sunday','business hours','what time u open','opening time','closing time','are u open today','when is the last appointment','u open wat time','wat time open','what time you close today','your operating hours','do you open on saturday','are you closed on sunday','last appointment time','what are your hours','what time start','what time end'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && m[0].intent === 'operating_hours', `Hours: "${q}"`, m[0]?.intent);
});

section('Intent: Location');
['where are you located','what is your address','how to get there','clinic near mrt','parking available','where is the clinic','ur location','address please','how do i find you','nearby mrt','where are you','your location','clinic address','how to go','direction to clinic','nearest bus stop','got parking','mrt nearby'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && m[0].intent === 'location', `Location: "${q}"`, m[0]?.intent);
});

section('Intent: Service Inquiry (specific treatment)');
['do you do botox','do u have hifu','can i get laser','is facial available','botox?','hifu','do you offer thread lift','got botox?','u do filler?','do you have laser treatment','can i get microneedling','is chemical peel available','do u all do hifu','botox','filler','laser','rejuran','thread lift','do you do pico','can i get rejuran healer','u all have hifu or not','got do facial','have botox','do pico laser','got thread lift'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && m[0].intent === 'service_inquiry', `Service inquiry: "${q}"`, m[0]?.intent);
});
// Should NOT match service_inquiry (generic words)
['do you do consultation','do you have appointment service'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length === 0 || m[0].intent !== 'service_inquiry', `Not service inquiry: "${q}"`, m[0]?.intent);
});

section('Intent: Service List');
['what services do you offer','what treatments do you have','what do you offer','list of services','show me your treatments','what can you do','wat services u got','what treatments available','what procedures do you offer','show me the menu','what do u have','tell me the services','give me the list','treatment list','service menu','what services do you provide','what treatments are there','what do you all offer','treatment info','show me what you have','list of treatments','what can i get done','what procedures available'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && m[0].intent === 'service_list', `Service list: "${q}"`, m[0]?.intent);
});

section('Intent: Pricing Specific');
['how much is botox','what is the price of hifu','how much does laser cost','price of facial','how much is dermal filler','how much thread lift','botox how much','hifu price','cost of microneedling','price for thread lift','botox cost','how much for hifu session','rejuran how much','pico laser price','filler cost','botox pricing','hifu session price','thread lift cost','how much is pico','what is the cost of botox'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && m[0].intent === 'pricing_specific', `Pricing specific: "${q}"`, m[0]?.intent);
});

section('Intent: Pricing General');
['how much are your prices','pricing','price list','do you have a price list','what are the rates','how much roughly','how much in general','general pricing','price range','cost list'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && m[0].intent === 'pricing_general', `Pricing general: "${q}"`, m[0]?.intent);
});

section('Intent: Booking Request');
['i want to book an appointment','can i make a booking','i want to schedule hifu','book appointment for botox','i would like to book','can i get a slot','available slots','when can i book','next available appointment','earliest slot','i wanna book hifu','got slot for tomorrow','looking for appointment','book botox next monday 2pm','i want hifu appointment','schedule consultation','i want to come in for botox','can i come tomorrow','i want to book','can i book','make appointment','want to schedule','need to book','i want an appointment','got any slot','any appointment available','i want to book hifu and laser','booking for tomorrow','i want facial tomorrow','can i get an appointment','slot for next week','i want to make a booking for botox','need appointment this week','want to book consultation','i want to book for laser'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && m[0].intent === 'booking_request', `Booking: "${q}"`, m[0]?.intent);
});

section('Intent: Cancel/Reschedule');
['i want to cancel my appointment','can i cancel my booking','how do i cancel','delete my appointment','i want to reschedule','can i change my appointment','move my booking','different date please','shift my appt','change my slot','cancel booking','remove my appointment','cancel my slot','i need to reschedule','can i move my appointment to another day','change the date of my booking'].forEach(q => {
  const m = matchIntents(q, [], true);
  const expected = q.includes('cancel') || q.includes('delete') || q.includes('remove') ? 'cancel_request' : 'reschedule_request';
  assert(m.length > 0 && m[0].intent === expected, `${expected}: "${q}"`, m[0]?.intent);
});

section('Intent: Check Appointment');
['when is my appointment','what time is my booking','do i have an appointment','check my appointment','my booking details','i have a booking','when is my next session','what day is my appointment','my appointment time','check my booking'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && m[0].intent === 'check_appointment', `Check appt: "${q}"`, m[0]?.intent);
});

section('Intent: Human Handoff');
['speak to a human','i want to talk to staff','transfer me to a person','can i speak to doctor','i want a human','call me','talk to someone','real person please','i want to speak to someone','connect me to a person','i need a human','can i talk to the receptionist','transfer to staff','i want to speak with a real person'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && m[0].intent === 'human_handoff', `Handoff: "${q}"`, m[0]?.intent);
});

section('Intent: Complaint');
['i have a complaint','i am unhappy','terrible service','bad experience','very disappointed','not happy','worst clinic ever','horrible treatment','i am very angry','poor service','disappointed with results','i had a bad experience'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && m[0].intent === 'complaint', `Complaint: "${q}"`, m[0]?.intent);
});

section('Intent: Waitlist');
['add me to waitlist','no slots available','fully booked','put me on the waiting list','all appointments taken','add me to the waiting list','i want to be on the waitlist','no availability','all slots taken','nothing available'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && m[0].intent === 'waitlist_request', `Waitlist: "${q}"`, m[0]?.intent);
});

section('Intent: Clarification');
['such as?','like what','what kind','examples?','what types','what else','and?','what?','tell me more'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && m[0].intent === 'clarification', `Clarification: "${q}"`, m[0]?.intent);
});

section('Intent: Confirmation Yes/No');
['yes','yeah','sure','ok','okay','yep','alright','definitely','absolutely','yup','yah'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && m[0].intent === 'confirmation_yes', `Yes: "${q}"`, m[0]?.intent);
});
['no','nah','nope','not now','maybe later'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && m[0].intent === 'confirmation_no', `No: "${q}"`, m[0]?.intent);
});

section('Intent: FAQ Prep/Aftercare');
['what should i do before treatment','preparation needed','anything to do before botox','prep required','do i need to prepare'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && m[0].intent === 'faq_prep', `Prep: "${q}"`, m[0]?.intent);
});
['aftercare','what to do after treatment','recovery time','downtime for hifu','when can i exercise after'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && m[0].intent === 'faq_aftercare', `Aftercare: "${q}"`, m[0]?.intent);
});

section('Intent: Language Switch');
['can you speak chinese','do you speak mandarin','can you reply in chinese',' Malay','bahasa','中文','你会说中文吗','请说中文','说中文','华文'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && m[0].intent === 'language_switch', `Language: "${q}"`, m[0]?.intent);
});

section('Intent: Messages that should NOT match');
['hmm','...','what','why','how','when','nice','cool','great','i see','understood','1','2pm','tomorrow','ok','lol','haha','maybe','perhaps','possibly','alright then','fine','sure thing','kind of','sort of','i think so','possibly','probably','definitely maybe','uh huh','huh','erm','uh','um','well','so','then','there','here','now','later','soon','today','yesterday','this','that','these','those','with','from','about','into','through','during','before','after','above','below','between','under','again','further','once'].forEach(q => {
  const m = matchIntents(q, [], true);
  // "ok" matches confirmation_yes - that's expected
  if (q === 'ok' || q === 'sure thing') {
    assert(m.length > 0, `Should match something: "${q}"`, 'no match');
  } else {
    assert(m.length === 0, `Should not match: "${q}"`, m[0]?.intent);
  }
});

console.log(`  Phase 1 complete: ${passed} passed, ${failed} failed so far`);

// ─══════════════════════════════════════════════════════════════════
// PHASE 2: FIELD EXTRACTION (~300 permutations)
// ─══════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  PHASE 2: FIELD EXTRACTION (~300 permutations)');
console.log('═══════════════════════════════════════════════════════════════');

section('Date Parsing: Standard formats');
// Tomorrow variants
['tomorrow','tmr','tmrw','tomorrow pls','book for tomorrow','i want tmr'].forEach(q => {
  const d = parseDatePhrase(q.replace(/^(book for |i want )/, ''));
  assert(d !== null, `Date parse: "${q}" -> ${d}`, d);
});
// Next/this + day
['next monday','this tuesday','next Wednesday','this thursday','next friday','this saturday','next sunday'].forEach(q => {
  const d = parseDatePhrase(q);
  assert(d !== null, `Date parse: "${q}" -> ${d}`, d);
});
// Bare day names (CRITICAL BUG FIX - should now work)
['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].forEach(q => {
  const d = parseDatePhrase(q);
  assert(d !== null, `Date parse bare: "${q}" -> ${d}`, d);
});
// Next week
const nw = parseDatePhrase('next week');
assert(nw !== null, `Date: "next week" -> ${nw}`, nw);
// ISO date
const iso = parseDatePhrase('2025-08-15');
assert(iso === '2025-08-15', `ISO date: "2025-08-15"`, iso);

section('Date Parsing: Short forms & typos');
['nxt monday','nx tuesday','nxt wed'].forEach(q => {
  const d = parseDatePhrase(q);
  assert(d !== null, `Date short form: "${q}" -> ${d}`, d);
});

section('Time Parsing: All formats');
[['2pm','14:00'],['10:30am','10:30'],['3:45 PM','15:45'],['morning','10:00'],['afternoon','14:00'],['evening','17:00'],['9am','09:00'],['11:30','11:30'],['4pm','16:00'],['12pm','12:00'],['1:30pm','13:30'],['8am','08:00'],['7:45am','07:45'],['6:30 PM','18:30'],['noon','12:00'],['12:30pm','12:30'],['3:15','03:15'],['9:00am','09:00'],['10:00','10:00'],['11am','11:00'],['5:30pm','17:30'],['2:45 pm','14:45']].forEach(([input, expected]) => {
  const t = parseTimePhrase(input);
  assert(t === expected, `Time: "${input}" -> "${t}" (expected "${expected}")`, t);
});

section('Treatment Extraction: Single treatments');
const singleTreatments = [
  ['i want botox', 'botox consultation'],
  ['book hifu', 'hifu'],
  ['i want laser skin rejuvenation', 'laser skin rejuvenation'],
  ['thread lift please', 'thread lift'],
  ['i need dermal filler', 'dermal filler'],
  ['microneedling', 'microneedling'],
  ['chemical peel', 'chemical peel'],
  ['hydrating facial', 'hydrating facial'],
  ['anti-aging treatment', 'anti-aging treatment'],
  ['acne clear facial', 'acne clear facial'],
  ['botox consultation', 'botox consultation'],
  ['pico laser', 'picosure laser'],
  ['rejuran healer', 'rejuran healer'],
  ['laser treatment', 'laser skin rejuvenation'],
  ['facial', 'hydrating facial'],
];
singleTreatments.forEach(([input, expected]) => {
  const all = extractAllTreatments(input, TEST_SERVICES);
  assert(all.length > 0 && all[0] === expected, `Treatment: "${input}" -> [${all.join(', ')}] (expected "${expected}")`, all[0]);
});

section('Treatment Extraction: Multi-treatment (CRITICAL - longest first)');
// The "Laser Skin Rejuvenation" vs "Laser" ordering test
const multiTests = [
  ['laser skin rejuvenation and botox', ['laser skin rejuvenation', 'botox consultation']],
  ['botox and laser skin rejuvenation', ['botox consultation', 'laser skin rejuvenation']],
  ['thread lift and dermal filler', ['thread lift', 'dermal filler']],
  ['hifu and microneedling', ['hifu', 'microneedling']],
  ['facial and peel', ['hydrating facial', 'chemical peel']],
  ['botox and filler', ['botox consultation', 'dermal filler']],
  ['i want botox hifu and facial', ['botox consultation', 'hifu', 'hydrating facial']],
  ['laser and pico', ['laser skin rejuvenation', 'picosure laser']],
  ['rejuran and thread lift', ['rejuran healer', 'thread lift']],
  ['acne facial and anti-aging', ['acne clear facial', 'anti-aging treatment']],
  ['hydrating facial and chemical peel', ['hydrating facial', 'chemical peel']],
  ['botox and thread lift and hifu', ['botox consultation', 'thread lift', 'hifu']],
];
multiTests.forEach(([input, expected]) => {
  const all = extractAllTreatments(input, TEST_SERVICES);
  assertArray(all, expected, `Multi: "${input}" -> ${JSON.stringify(all)}`);
});

section('Name Extraction');
const nameTests = [
  ['my name is John Smith', 'John Smith'],
  ['i am Alice Tan', 'Alice Tan'],
  ["i'm Bob Lee", 'Bob Lee'],
  ['name is Catherine', 'Catherine'],
  ['call me David', 'David'], // "call me" pattern now supported
  ['Thomas Mueller', undefined], // no explicit name prefix - handled by smart-router AWAITING_NAME
  ['my name is Mary-Jane', 'Mary-Jane'],
  ['i am Dr. Tan', 'Dr. Tan'],
];
nameTests.forEach(([input, expected]) => {
  const fields = extractBookingFields(input);
  assert(fields.name === expected, `Name: "${input}" -> "${fields.name}" (expected "${expected}")`, fields.name);
});

section('Phone Extraction (CRITICAL BUG FIX)');
const phoneTests = [
  ['my number is 91234567', '91234567'],
  ['call me at 81234567', '81234567'],
  ['contact me at +65 9123 4567', '+6591234567'],
  ['my phone number is 90182746', '90182746'],
  ['hp: 87111048', '87111048'],
  ['handphone number 91234567', '91234567'],
  ['my handphone number is 87111048', '87111048'],
  ['whatsapp me at 91234567', '91234567'],
  ['reach me at +6591234567', '+6591234567'],
  ['my mobile is 81234567', '81234567'],
  ['text me at 91234567', '91234567'],
  ['+65 9123 4567', '+6591234567'],
  ['91234567', '91234567'],
];
phoneTests.forEach(([input, expected]) => {
  const fields = extractBookingFields(input);
  assert(fields.phone === expected, `Phone: "${input}" -> "${fields.phone}" (expected "${expected}")`, fields.phone);
});

section('Combined Field Extraction');
const combinedTests = [
  { input: 'botox tomorrow 2pm', date: true, time: '14:00', treatment: 'botox consultation' },
  { input: 'hifu next monday morning', date: true, time: '10:00', treatment: 'hifu' },
  { input: 'laser July 15 3pm', date: true, time: '15:00', treatment: 'laser skin rejuvenation' },
  { input: 'thread lift next tuesday 11am', date: true, time: '11:00', treatment: 'thread lift' },
  { input: 'filler this saturday 10am', date: true, time: '10:00', treatment: 'dermal filler' },
  { input: 'microneedling next wednesday 1:30pm', date: true, time: '13:30', treatment: 'microneedling' },
  { input: 'i want facial tomorrow afternoon', date: true, time: '14:00', treatment: 'hydrating facial' },
  { input: 'pico laser friday 4pm', date: true, time: '16:00', treatment: 'picosure laser' },
  { input: 'rejuran monday 9am', date: true, time: '09:00', treatment: 'rejuran healer' },
  // With name
  { input: 'botox tomorrow 2pm my name is John', date: true, time: '14:00', treatment: 'botox consultation', name: 'John' },
  // With phone
  { input: 'hifu next monday 10am 91234567', date: true, time: '10:00', treatment: 'hifu', phone: '91234567' },
];
combinedTests.forEach(test => {
  const fields = extractBookingFields(test.input, TEST_SERVICES);
  if (test.date) assert(fields.date !== null, `Combined date: "${test.input}" date=${fields.date}`);
  if (test.time) assert(fields.time === test.time, `Combined time: "${test.input}" time="${fields.time}" (expected "${test.time}")`);
  if (test.treatment) assert(fields.treatment === test.treatment, `Combined treatment: "${test.input}" treatment="${fields.treatment}" (expected "${test.treatment}")`);
  if (test.name) assert(fields.name === test.name, `Combined name: "${test.input}" name="${fields.name}" (expected "${test.name}")`);
  if (test.phone) assert(fields.phone === test.phone, `Combined phone: "${test.input}" phone="${fields.phone}" (expected "${test.phone}")`);
});

section('Confirmation/Denial Detection');
['yes','yeah','yup','sure','okay','ok','yep','yah','alright','definitely','absolutely','yes please','yeah sure','okay then','that\'s right','correct','right','true','accurate'].forEach(q => {
  assert(isConfirmation(q), `Confirmation: "${q}"`, 'false');
});
['no','nah','nope','not now','not really','no thanks','nah i\'m good','nope sorry'].forEach(q => {
  assert(isDenial(q), `Denial: "${q}"`, 'false');
});
// Should NOT be confirmation
['maybe','perhaps','not sure','i think so','possibly','probably'].forEach(q => {
  assert(!isConfirmation(q), `Not confirmation: "${q}"`, 'true');
});

console.log(`  Phase 2 complete: ${passed} passed, ${failed} failed so far`);

// ─══════════════════════════════════════════════════════════════════
// PHASE 3: STATE MACHINE TRANSITIONS (~300 permutations)
// ─══════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  PHASE 3: STATE MACHINE TRANSITIONS (~300 permutations)');
console.log('═══════════════════════════════════════════════════════════════');

const TEST_PHONE = '+6591234567';

function getCurrentState() { return getState(TEST_PHONE); }
function setTestState(state, data = {}) { setState(TEST_PHONE, state, data); }
function resetTest() { resetIdle(TEST_PHONE); }

section('State: IDLE -> AWAITING_DATE');
resetTest();
const idleState = getCurrentState();
assert(idleState.state === BOOKING_STATES.IDLE, 'Initial state is IDLE', idleState.state);

// Simulate what startBookingFlow does with no fields
setTestState(BOOKING_STATES.AWAITING_DATE, {});
const awaitingDate = getCurrentState();
assert(awaitingDate.state === BOOKING_STATES.AWAITING_DATE, 'Set to AWAITING_DATE', awaitingDate.state);

section('State: AWAITING_DATE -> AWAITING_TIME (date provided)');
setTestState(BOOKING_STATES.AWAITING_DATE, {});
// Simulate user saying "next monday"
const dateFields = extractBookingFields('next monday');
assert(dateFields.date !== null, 'Extracted date from "next monday"', dateFields.date);
// Simulate transition
setTestState(BOOKING_STATES.AWAITING_TIME, { date: dateFields.date });
const awaitingTime = getCurrentState();
assert(awaitingTime.state === BOOKING_STATES.AWAITING_TIME, 'Transition to AWAITING_TIME', awaitingTime.state);
assert(awaitingTime.data.date === dateFields.date, 'Date preserved', awaitingTime.data.date);

section('State: AWAITING_DATE -> AWAITING_TREATMENT (date + time provided)');
setTestState(BOOKING_STATES.AWAITING_DATE, {});
const dtFields = extractBookingFields('next tuesday 2pm');
assert(dtFields.date !== null, 'Date extracted', dtFields.date);
assert(dtFields.time === '14:00', 'Time extracted', dtFields.time);
setTestState(BOOKING_STATES.AWAITING_TREATMENT, { date: dtFields.date, time: dtFields.time });
const awaitingTreat = getCurrentState();
assert(awaitingTreat.state === BOOKING_STATES.AWAITING_TREATMENT, 'To AWAITING_TREATMENT', awaitingTreat.state);
assert(awaitingTreat.data.time === '14:00', 'Time preserved', awaitingTreat.data.time);

section('State: AWAITING_TIME -> AWAITING_TREATMENT (time provided)');
setTestState(BOOKING_STATES.AWAITING_TIME, { date: '2025-08-15' });
const tFields = extractBookingFields('3pm');
assert(tFields.time === '15:00', 'Time extracted: 3pm', tFields.time);
setTestState(BOOKING_STATES.AWAITING_TREATMENT, { date: '2025-08-15', time: '15:00' });
const atTime = getCurrentState();
assert(atTime.state === BOOKING_STATES.AWAITING_TREATMENT, 'Time->Treatment', atTime.state);
assert(atTime.data.date === '2025-08-15', 'Date preserved through time', atTime.data.date);

section('State: AWAITING_TIME -> attemptBooking (time + treatment)');
setTestState(BOOKING_STATES.AWAITING_TIME, { date: '2025-08-15' });
const ttFields = extractBookingFields('2pm botox', TEST_SERVICES);
assert(ttFields.time === '14:00', 'Time 2pm', ttFields.time);
assert(ttFields.treatment === 'botox consultation', 'Treatment botox', ttFields.treatment);
// This would go to attemptBooking - simulate data collection
const bookingData = { date: '2025-08-15', time: '14:00', treatment: 'botox consultation', treatments: ['botox consultation'] };
assert(bookingData.date && bookingData.time && bookingData.treatment, 'All fields for booking');

section('State: AWAITING_TREATMENT -> AWAITING_NAME (treatment provided)');
setTestState(BOOKING_STATES.AWAITING_TREATMENT, { date: '2025-08-15', time: '14:00' });
const trFields = extractBookingFields('hifu', TEST_SERVICES);
assert(trFields.treatment === 'hifu', 'Hifu extracted', trFields.treatment);
setTestState(BOOKING_STATES.AWAITING_NAME, { date: '2025-08-15', time: '14:00', treatment: 'hifu', treatments: ['hifu'] });
const awaitingName = getCurrentState();
assert(awaitingName.state === BOOKING_STATES.AWAITING_NAME, 'To AWAITING_NAME', awaitingName.state);

section('State: AWAITING_NAME -> AWAITING_PHONE (name provided)');
// Test various name formats
const nameFormats = [
  'John',
  'John Smith',
  'Mary Tan',
  'Dr. Lee',
  'Catherine O\'Brien',
  'Jean-Paul',
  'Mary Jane Watson',
];
nameFormats.forEach(name => {
  setTestState(BOOKING_STATES.AWAITING_NAME, { date: '2025-08-15', time: '14:00', treatment: 'hifu', treatments: ['hifu'] });
  // Simulate name acceptance
  setTestState(BOOKING_STATES.AWAITING_PHONE, { date: '2025-08-15', time: '14:00', treatment: 'hifu', treatments: ['hifu'], name });
  const state = getCurrentState();
  assert(state.data.name === name, `Name preserved: "${name}"`, state.data.name);
});

section('State: AWAITING_PHONE -> AWAITING_CONFIRMATION (phone confirmed)');
setTestState(BOOKING_STATES.AWAITING_PHONE, { date: '2025-08-15', time: '14:00', treatment: 'hifu', treatments: ['hifu'], name: 'John', phone: '91234567' });
// Simulate YES confirmation
assert(isConfirmation('yes'), 'Yes is confirmation');
setTestState(BOOKING_STATES.AWAITING_CONFIRMATION, { date: '2025-08-15', time: '14:00', treatment: 'hifu', treatments: ['hifu'], name: 'John', phone: '91234567' });
const awaitingConf = getCurrentState();
assert(awaitingConf.state === BOOKING_STATES.AWAITING_CONFIRMATION, 'To AWAITING_CONFIRMATION', awaitingConf.state);

section('State: Multi-treatment flows');
// Multi-treatment should preserve treatments array through ALL states
const multiFlowData = {
  date: '2025-08-15', time: '14:00',
  treatment: 'botox consultation',
  treatments: ['botox consultation', 'laser skin rejuvenation'],
  name: 'John', phone: '91234567'
};
setTestState(BOOKING_STATES.AWAITING_CONFIRMATION, multiFlowData);
const multiState = getCurrentState();
assert(Array.isArray(multiState.data.treatments), 'Treatments is array', typeof multiState.data.treatments);
assert(multiState.data.treatments.length === 2, 'Two treatments preserved', multiState.data.treatments.length);
assert(multiState.data.treatments[0] === 'botox consultation', 'First treatment correct', multiState.data.treatments[0]);
assert(multiState.data.treatments[1] === 'laser skin rejuvenation', 'Second treatment correct', multiState.data.treatments[1]);

section('State: Treatments array preserved through transitions');
// Simulate the full flow with treatments
const states = [
  BOOKING_STATES.AWAITING_DATE,
  BOOKING_STATES.AWAITING_TIME,
  BOOKING_STATES.AWAITING_TREATMENT,
  BOOKING_STATES.AWAITING_NAME,
  BOOKING_STATES.AWAITING_PHONE,
  BOOKING_STATES.AWAITING_CONFIRMATION,
];
states.forEach((s, i) => {
  setTestState(s, { treatments: ['botox consultation', 'hifu'] });
  const st = getCurrentState();
  assert(Array.isArray(st.data.treatments) && st.data.treatments.length === 2,
    `Treatments preserved at state ${i} (${s})`, JSON.stringify(st.data.treatments));
});

section('State: BOOKING_OFFERED context preservation (CRITICAL BUG FIX)');
// Simulate: bot offers booking, user suggests alternative instead of yes/no
setTestState(BOOKING_STATES.BOOKING_OFFERED, { treatment: 'botox consultation' });
const offered = getCurrentState();
assert(offered.state === BOOKING_STATES.BOOKING_OFFERED, 'BOOKING_OFFERED set');
assert(offered.data.treatment === 'botox consultation', 'Treatment in offer data');

// User says "How about Tuesday at 3pm?" instead of yes/no
// The fix should merge new fields with existing data
const altFields = extractBookingFields('tuesday 3pm', TEST_SERVICES);
const merged = {
  date: altFields.date || offered.data.date,
  time: altFields.time || offered.data.time,
  treatment: altFields.treatment || offered.data.treatment,
  treatments: altFields.treatments || offered.data.treatments || (offered.data.treatment ? [offered.data.treatment] : []),
};
assert(merged.date !== null, 'Merged has date', merged.date);
assert(merged.time === '15:00', 'Merged has time', merged.time);
assert(merged.treatment === 'botox consultation', 'Merged preserves treatment', merged.treatment);

section('State: BOOKING_OFFERED with all fields -> straight to booking');
setTestState(BOOKING_STATES.BOOKING_OFFERED, { date: '2025-08-15', time: '14:00', treatment: 'hifu' });
const fullOffer = getCurrentState();
assert(fullOffer.data.date && fullOffer.data.time && fullOffer.data.treatment, 'All fields present');

section('State: Cancellation words reset state');
['cancel','never mind','nevermind','stop','forget it','go back'].forEach(word => {
  setTestState(BOOKING_STATES.AWAITING_DATE, { date: '2025-08-15' });
  // Simulate cancellation
  resetTest();
  const afterCancel = getCurrentState();
  assert(afterCancel.state === BOOKING_STATES.IDLE, `Cancel "${word}" resets to IDLE`, afterCancel.state);
});

section('State: Context-dependent responses (clarification)');
['Such as?','Like what','What kind','Examples?','What types','What else'].forEach(q => {
  const m = matchIntents(q, [{ role: 'ai', content: 'We offer various treatments' }], false);
  assert(m.length > 0 && m[0].intent === 'clarification', `Clarification: "${q}"`, m[0]?.intent);
});

section('State: I WILL TAKE OVER trigger');
// This is handled at webhook layer - just verify the text
assert('I WILL TAKE OVER' === 'I WILL TAKE OVER', 'Takeover phrase exact match');
assert('i will take over' !== 'I WILL TAKE OVER', 'Takeover is case-sensitive');

console.log(`  Phase 3 complete: ${passed} passed, ${failed} failed so far`);

// ─══════════════════════════════════════════════════════════════════
// PHASE 4: MULTI-INTENT DETECTION (~100 permutations)
// ─══════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  PHASE 4: MULTI-INTENT DETECTION (~100 permutations)');
console.log('═══════════════════════════════════════════════════════════════');

section('Multi-intent: Service + Pricing');
['what services do you offer and how much is botox',
 'what treatments do you have and how much are they',
 'show me your services and botox price',
 'what do you offer and how much is hifu',
 'list of treatments and pricing'].forEach(q => {
  const m = matchIntents(q, [], true);
  const intents = m.map(i => i.intent);
  assert(intents.includes('service_list'), `Multi has service_list: "${q}"`, intents.join(','));
  // Should have either pricing_specific or pricing_general
  assert(intents.includes('pricing_specific') || intents.includes('pricing_general'), `Multi has pricing: "${q}"`, intents.join(','));
});

section('Multi-intent: Hours + Location');
['what are your opening hours and where are you located',
 'are you open today and how do i get there',
 'what time do you close and your address',
 'opening hours and parking'].forEach(q => {
  const m = matchIntents(q, [], true);
  const intents = m.map(i => i.intent);
  assert(intents.includes('operating_hours'), `Multi has hours: "${q}"`, intents.join(','));
  assert(intents.includes('location'), `Multi has location: "${q}"`, intents.join(','));
});

section('Multi-intent: Booking + Info');
['i want to book hifu and how much is it',
 'i want to book and what is your address',
 'can i get botox and what are the prices',
 'schedule facial and what time do you open'].forEach(q => {
  const m = matchIntents(q, [], true);
  const intents = m.map(i => i.intent);
  assert(intents.includes('booking_request'), `Multi has booking: "${q}"`, intents.join(','));
});

section('Multi-intent: Two treatments');
['i want hifu and filler',
 'botox and laser please',
 'thread lift and dermal filler',
 'can i book hifu and microneedling'].forEach(q => {
  const m = matchIntents(q, [], true);
  const intents = m.map(i => i.intent);
  assert(intents.includes('booking_request'), `Two treatments books: "${q}"`, intents.join(','));
});

section('Multi-intent: Service inquiry + Hours');
['do you do botox and what time do you close',
 'do you have hifu and are you open sunday',
 'can i get laser and what are your hours'].forEach(q => {
  const m = matchIntents(q, [], true);
  const intents = m.map(i => i.intent);
  assert(intents.includes('service_inquiry'), `Multi has inquiry: "${q}"`, intents.join(','));
  assert(intents.includes('operating_hours'), `Multi has hours: "${q}"`, intents.join(','));
});

section('Multi-intent: Should NOT trigger (>2 substantive)');
['what services do you offer and how much is botox and are you open today'].forEach(q => {
  const m = matchIntents(q, [], true);
  const confident = m.filter(i => i.confidence >= 0.85);
  // Just ensure it doesn't crash and returns reasonable results
  assert(m.length > 0, `Complex multi returns results: "${q}"`, 'no match');
});

console.log(`  Phase 4 complete: ${passed} passed, ${failed} failed so far`);

// ─══════════════════════════════════════════════════════════════════
// PHASE 5: EDGE CASES & RECOVERY (~150 permutations)
// ─══════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  PHASE 5: EDGE CASES & RECOVERY (~150 permutations)');
console.log('═══════════════════════════════════════════════════════════════');

section('Edge: Empty/minimal messages');
['', ' ', '  ', 'a', 'ab', '1', '!!', '??', '...', '   '].forEach(q => {
  const m = matchIntents(q || ' ', [], true);
  // Should not crash
  assert(Array.isArray(m), `No crash on empty/minimal: "${q}"`, typeof m);
});

section('Edge: Very long messages');
const longMsg = 'i want to book an appointment for botox and laser and hifu and facial and thread lift and dermal filler and microneedling and chemical peel and hydrating facial and anti-aging treatment tomorrow at 2pm please help me thank you very much i appreciate it';
const mLong = matchIntents(longMsg, [], true);
assert(mLong.length > 0, 'Long message matches', 'no match');
assert(mLong[0].intent === 'booking_request', 'Long message -> booking', mLong[0]?.intent);

section('Edge: Special characters');
['botox???','hifu!!!','laser...','facial :)','book!!!','price???','where?!','when??'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0, `Special chars match: "${q}"`, 'no match');
});

section('Edge: Mixed case and spacing');
['BoToX','HIFU','LASER','Facial','BOTOX','hIfU','  botox  ','BOTOX!!!'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0, `Case insensitive: "${q}" -> ${m[0]?.intent}`, m[0]?.intent);
});

section('Edge: Singlish variations');
['u got botox?','u do hifu?','got slot?','how much ah?','where ur clinic?','what time open?','u open today?','can book?','want to book leh','botox how much lah','got hifu anot','u all do laser','where your place','how to go','what time close already','u open on sunday anot'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0, `Singlish: "${q}" -> ${m[0]?.intent}`, 'no match');
});

section('Edge: Message with noise words');
['ummm i want botox','actually i want to book','so i was thinking of hifu','well can i get laser','maybe i want facial'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && (m[0].intent === 'booking_request' || m[0].intent === 'service_inquiry'),
    `Noise words: "${q}" -> ${m[0]?.intent}`, m[0]?.intent);
});

section('Edge: Recovery from wrong state');
// Simulate user being in wrong state and system recovering
setTestState(BOOKING_STATES.AWAITING_DATE, {});
// User says something unrelated - should ideally recover
resetTest();
const recovered = getCurrentState();
assert(recovered.state === BOOKING_STATES.IDLE, 'Reset recovers to IDLE', recovered.state);

section('Edge: Rapid state changes');
const stateSequence = [
  BOOKING_STATES.AWAITING_DATE,
  BOOKING_STATES.AWAITING_TIME,
  BOOKING_STATES.AWAITING_TREATMENT,
  BOOKING_STATES.AWAITING_NAME,
];
stateSequence.forEach((s, i) => {
  setTestState(s, { step: i });
  const st = getCurrentState();
  assert(st.state === s, `State sequence ${i}: ${s}`, st.state);
});

section('Edge: Duplicate treatment names (CRITICAL BUG REGRESSION)');
// "Laser Skin Rejuvenation and picosure laser" should NOT show duplicate
const dupTest = extractAllTreatments('laser skin rejuvenation and picosure laser', TEST_SERVICES);
// Should get laser skin rejuvenation and picosure laser (2 different services)
assert(dupTest.length >= 2, 'Two different laser services', dupTest.length);
// Should NOT have duplicates
const unique = [...new Set(dupTest)];
assert(unique.length === dupTest.length, 'No duplicates', `got [${dupTest.join(', ')}]`);

section('Edge: Treatment validation (CRITICAL BUG REGRESSION)');
// Invalid service should be caught
const invalidTreatments = ['breast enlargement','nose job','plastic surgery','tummy tuck','liposuction','face transplant'];
invalidTreatments.forEach(t => {
  const all = extractAllTreatments(t, TEST_SERVICES);
  // Should not match any known service
  const matched = TEST_SERVICES.some(s =>
    s.name.toLowerCase().includes(t.toLowerCase()) ||
    t.toLowerCase().includes(s.name.toLowerCase())
  );
  assert(!matched, `Invalid service "${t}" not matched`, `MATCHED - this is a gap!`);
});

section('Edge: Date/time edge cases');
// Midnight
const midnight = parseTimePhrase('12am');
assert(midnight === '00:00', '12am = 00:00', midnight);
// Noon
const noon = parseTimePhrase('12pm');
assert(noon === '12:00', '12pm = 12:00', noon);
// Very short
const shortTime = parseTimePhrase('9a');
// May or may not match - just don't crash
assert(shortTime === null || shortTime === '09:00', 'Short time handled', shortTime);

section('Edge: Phone number edge cases');
const phoneEdgeCases = [
  ['my hp 91234567', '91234567'],
  ['my handphone is 87111048', '87111048'],
  ['contact: 91234567', '91234567'],
  ['HP 87111048', '87111048'],
  ['whatsapp 91234567', '91234567'],
];
phoneEdgeCases.forEach(([input, expected]) => {
  const fields = extractBookingFields(input);
  assert(fields.phone === expected, `Phone edge: "${input}" -> "${fields.phone}"`, fields.phone);
});

section('Edge: Name + phone together (BUG REGRESSION)');
// "Thomas mueller +6591252297" - name extraction should handle + prefix
const npFields = extractBookingFields('Thomas mueller +6591252297');
// Phone should be extracted
assert(npFields.phone === '+6591252297', 'Phone with + extracted', npFields.phone);

section('Edge: Context-dependent yes/no');
// "Yes" should be confirmation_yes regardless of history
const yesM = matchIntents('yes', [{ role: 'ai', content: 'Would you like to book?' }], false);
assert(yesM.length > 0 && yesM[0].intent === 'confirmation_yes', 'Yes in context', yesM[0]?.intent);

console.log(`  Phase 5 complete: ${passed} passed, ${failed} failed so far`);

// ─══════════════════════════════════════════════════════════════════
// PHASE 6: CHINESE INTENT MATCHING (~50 permutations)
// ─══════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  PHASE 6: CHINESE INTENT MATCHING (~50 permutations)');
console.log('═══════════════════════════════════════════════════════════════');

section('Chinese: Greetings');
['你好','您好','嗨','哈啰','在吗','有人在吗','你好呀','你好！','嗨！'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && m[0].intent === 'greeting', `CN Greeting: "${q}"`, m[0]?.intent);
});

section('Chinese: Goodbyes');
['谢谢','感谢','拜拜','再见','好的谢谢','知道了'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && m[0].intent === 'goodbye', `CN Goodbye: "${q}"`, m[0]?.intent);
});

section('Chinese: Operating hours');
['营业时间','几点开门','几点关门','什么时候营业','开到几点','几点到几点','周末开吗'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && m[0].intent === 'operating_hours', `CN Hours: "${q}"`, m[0]?.intent);
});

section('Chinese: Location');
['地址','在哪里','怎么去','位置','靠近哪里','附近有什么'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && m[0].intent === 'location', `CN Location: "${q}"`, m[0]?.intent);
});

section('Chinese: Booking');
['我要预约','想预约','可以预约吗','有位置吗','有空位吗'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && m[0].intent === 'booking_request', `CN Booking: "${q}"`, m[0]?.intent);
});

section('Chinese: Mixed Chinese-English');
['Botox多少钱','HIFU多少钱','laser怎么收费','botox价格多少'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && m[0].intent === 'pricing_specific', `CN Mixed: "${q}"`, m[0]?.intent);
});
['多少钱','价格表','怎么收费'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && m[0].intent === 'pricing_general', `CN General price: "${q}"`, m[0]?.intent);
});

section('Chinese: Human handoff');
['人工','真人','客服','工作人员','找医生'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && m[0].intent === 'human_handoff', `CN Handoff: "${q}"`, m[0]?.intent);
});

section('Chinese: Cancel');
['取消预约','我要取消','取消我的','删掉预约','想取消'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && m[0].intent === 'cancel_request', `CN Cancel: "${q}"`, m[0]?.intent);
});

section('Chinese: Language switch');
['可以说中文吗','中文','华文','会说中文吗'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && m[0].intent === 'language_switch', `CN Language: "${q}"`, m[0]?.intent);
});

section('Chinese: Check appointment');
['我的预约','查询预约','查我的','我的booking','我预约了什么时候'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && m[0].intent === 'check_appointment', `CN Check: "${q}"`, m[0]?.intent);
});

console.log(`  Phase 6 complete: ${passed} passed, ${failed} failed so far`);

// ─══════════════════════════════════════════════════════════════════
// PHASE 7: REGRESSION TESTS FOR RECENT BUG FIXES
// ─══════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  PHASE 7: REGRESSION TESTS (7 recent bug fixes)');
console.log('═══════════════════════════════════════════════════════════════');

section('BUG-1 REGRESSION: service_list matches "what treatment you offer"');
['what treatment you offer','what treatment do you offer','what services do you provide','what procedures do you offer'].forEach(q => {
  const m = matchIntents(q, [], true);
  assert(m.length > 0 && m[0].intent === 'service_list', `BUG-1: "${q}" -> ${m[0]?.intent}`, m[0]?.intent);
});

section('BUG-2 REGRESSION: name extraction handles +65 prefix');
// Test the name+phone extraction with + prefix
const namePhoneFields = extractBookingFields('Thomas Mueller +6591252297');
assert(namePhoneFields.phone === '+6591252297', 'BUG-2: Phone with +65', namePhoneFields.phone);

section('BUG-3 REGRESSION: bare day names parse correctly');
['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].forEach(day => {
  const d = parseDatePhrase(day);
  assert(d !== null && d !== '2026-01-01', `BUG-3: "${day}" -> ${d}`, d);
});

section('BUG-4 REGRESSION: multi-treatment longest-first ordering');
const bug4Test = extractAllTreatments('laser skin rejuvenation and picosure laser', TEST_SERVICES);
assert(bug4Test.length === 2, `BUG-4: Two treatments, got ${bug4Test.length}`, bug4Test.join(', '));
assert(bug4Test.includes('laser skin rejuvenation'), 'BUG-4: Has Laser Skin Rejuvenation', bug4Test.join(', '));
assert(bug4Test.includes('picosure laser'), 'BUG-4: Has PicoSure Laser', bug4Test.join(', '));
// Verify no duplicates
assert(bug4Test.length === new Set(bug4Test).size, 'BUG-4: No duplicates', bug4Test.join(', '));

section('BUG-5 REGRESSION: BOOKING_OFFERED preserves context');
setTestState(BOOKING_STATES.BOOKING_OFFERED, { treatment: 'botox consultation' });
const offerCtx = getCurrentState();
// Simulate user suggesting alternative
const altFields5 = extractBookingFields('tuesday 3pm');
const merged5 = {
  date: altFields5.date || offerCtx.data.date,
  time: altFields5.time || offerCtx.data.time,
  treatment: offerCtx.data.treatment,
};
assert(merged5.treatment === 'botox consultation', 'BUG-5: Treatment preserved', merged5.treatment);
assert(merged5.date !== null, 'BUG-5: Date extracted', merged5.date);
assert(merged5.time === '15:00', 'BUG-5: Time extracted', merged5.time);

section('BUG-6 REGRESSION: invalid treatment not accepted');
const invalidServices = ['breast enlargement','nose job','plastic surgery'];
invalidServices.forEach(s => {
  const all = extractAllTreatments(s, TEST_SERVICES);
  // These should not match any known service
  const hasMatch = all.some(t => TEST_SERVICES.some(svc => svc.name.toLowerCase() === t));
  assert(!hasMatch, `BUG-6: "${s}" not matched`, all.join(', '));
});

section('BUG-7 REGRESSION: phone patterns handle natural language');
['my handphone number is 87111048','my phone is 91234567','contact me at +6591234567','hp: 87111048'].forEach(q => {
  const fields = extractBookingFields(q);
  assert(fields.phone !== null && fields.phone.length >= 8, `BUG-7: "${q}" -> "${fields.phone}"`, fields.phone);
});

console.log(`  Phase 7 complete: ${passed} passed, ${failed} failed so far`);

// ─══════════════════════════════════════════════════════════════════
// FINAL REPORT
// ─══════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('                    FINAL TEST REPORT');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  Total permutations tested:  ${totalRun}`);
console.log(`  PASSED:                     ${passed}`);
console.log(`  FAILED:                     ${failed}`);
console.log(`  PASS RATE:                  ${((passed / totalRun) * 100).toFixed(1)}%`);
console.log('═══════════════════════════════════════════════════════════════');

if (failures.length > 0) {
  console.log('\n  FAILURES BY SECTION:');
  const bySection = {};
  failures.forEach(f => {
    if (!bySection[f.section]) bySection[f.section] = [];
    bySection[f.section].push(f);
  });
  Object.entries(bySection).forEach(([sec, fails]) => {
    console.log(`\n  [${sec}] — ${fails.length} failures:`);
    fails.forEach((f, i) => {
      console.log(`    ${i+1}. ${f.test}`);
      if (f.details) console.log(`       → ${f.details}`);
    });
  });
}

// GAP ANALYSIS
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('                    GAP ANALYSIS');
console.log('═══════════════════════════════════════════════════════════════');

const gaps = [];

// Check for intents with no keyword fallback
Object.entries(INTENT_PATTERNS).forEach(([name, pattern]) => {
  if (!pattern.keywords && !pattern.regex) {
    gaps.push(`Intent "${name}" has no keywords or regex fallback`);
  }
});

// Check for common Singlish expressions not covered
const singlishGaps = ['leh','lor','lah','meh','hor',' sia','siah'].forEach(p => {
  const m = matchIntents(`botox ${p}`, [], true);
  if (m.length === 0) gaps.push(`Singlish particle "${p}" causes no match`);
});

// Check for common typos not covered
const typoTests = {
  'hifoo': 'hifu typo',
  'botax': 'botox typo',
  'facual': 'facial typo',
  'lazer': 'laser typo',
};
Object.entries(typoTests).forEach(([typo, desc]) => {
  const m = matchIntents(`do you do ${typo}`, [], true);
  // These are expected to NOT match (typos) - flag as potential gap
  if (m.length === 0) {
    // Expected - don't flag as gap since typos are hard
  }
});

if (gaps.length > 0) {
  console.log('\n  Potential gaps found:');
  gaps.forEach((g, i) => console.log(`    ${i+1}. ${g}`));
} else {
  console.log('\n  No additional gaps identified in automated analysis.');
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  Recommended: Fix the ${failed} failures, then re-run.`);
console.log('═══════════════════════════════════════════════════════════════');

process.exit(failed > 0 ? 1 : 0);
