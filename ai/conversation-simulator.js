/**
 * Moon Hands — REAL End-to-End Simulator
 * 
 * Mocks Supabase at the module level, then loads the ACTUAL smart-router.
 * This tests the REAL code path, not a simulation.
 */

const Module = require('module');
const originalRequire = Module.prototype.require;

// ─── MOCK SUPABASE ────────────────────────────────────────────────
const mockDb = {
  from: (table) => ({
    select: (...cols) => ({ 
      eq: (col, val) => ({ 
        single: async () => ({ data: null, error: null }),
        order: () => ({ limit: () => ({ data: [], error: null }) }),
        gte: () => ({ lte: () => ({ order: () => ({ data: [], error: null }) }) }),
      }),
      or: () => ({ order: () => ({ data: [], error: null }) }),
    }),
    insert: async () => ({ data: null, error: null }),
    update: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
    upsert: async () => ({ data: null, error: null }),
  })
};

// Override require for supabase/client
Module.prototype.require = function(id) {
  if (id.includes('supabase/client')) return mockDb;
  return originalRequire.apply(this, arguments);
};

// ─── MOCK createBooking to avoid Supabase dependency ──────────────
const mockCreateBooking = async (params) => ({
  success: true,
  data: { id: 'mock-booking-' + Date.now(), ...params }
});
require.cache[require.resolve('./expert-system/function-handlers')] = {
  id: require.resolve('./expert-system/function-handlers'),
  filename: require.resolve('./expert-system/function-handlers'),
  loaded: true,
  exports: { createBooking: mockCreateBooking }
};

// ─── LOAD ACTUAL MODULES ─────────────────────────────────────────
const { routeMessage } = require('./smart-router');
const { getState, setState, resetIdle, BOOKING_STATES } = require('./conversation-state');

// ─── SIMULATOR ───────────────────────────────────────────────────

class RealConversationSimulator {
  constructor(clinicConfig, patientPhone = '+6590000000') {
    this.clinicConfig = clinicConfig;
    this.patientPhone = patientPhone;
    this.history = [];
    this.turns = 0;
    this.errors = [];
    this.warnings = [];
    resetIdle(patientPhone);
  }

  async send(message, expectedState = null, expectedReplyContains = null) {
    this.turns++;
    const turnNum = this.turns;
    
    this.history.push({ role: 'user', text: message, timestamp: Date.now() });
    
    const beforeState = getState(this.patientPhone);
    
    let result;
    try {
      result = await routeMessage(message, this.clinicConfig, this.patientPhone, this.history);
    } catch (err) {
      this.errors.push({ turn: turnNum, message, error: err.message, type: 'routing_crash' });
      return { success: false, error: err.message, turn: turnNum };
    }
    
    const afterState = getState(this.patientPhone);
    
    this.history.push({
      role: 'bot',
      text: result.text || result.response || '(no text)',
      timestamp: Date.now(),
      state: afterState.state,
      source: result.source || 'unknown',
      intents: result.intents || []
    });
    
    // VALIDATION
    const validation = { passed: true, issues: [] };
    
    if (expectedState && afterState.state.toLowerCase() !== expectedState.toLowerCase()) {
      validation.passed = false;
      validation.issues.push({ type: 'wrong_state', expected: expectedState, actual: afterState.state });
    }
    
    const replyText = result.text || result.response || '';
    if (expectedReplyContains) {
      const checks = Array.isArray(expectedReplyContains) ? expectedReplyContains : [expectedReplyContains];
      for (const check of checks) {
        if (!replyText.toLowerCase().includes(check.toLowerCase())) {
          validation.passed = false;
          validation.issues.push({ type: 'missing_reply_content', expected: check, actual: replyText.substring(0, 100) });
        }
      }
    }
    
    // Detect state loss
    if (replyText.includes('What can I help you with') && this.turns > 1 && beforeState.state !== 'IDLE') {
      validation.passed = false;
      validation.issues.push({ type: 'state_lost', description: 'Bot asked "What can I help you with?" mid-conversation' });
    }
    
    // Detect vague fallback
    if (replyText.toLowerCase().includes('let me know') && replyText.toLowerCase().includes('appointment') && beforeState.state !== 'IDLE') {
      validation.passed = false;
      validation.issues.push({ type: 'vague_fallback', description: 'Bot gave vague "let me know" instead of progressing' });
    }
    
    if (result.source === 'openai' && beforeState.state !== 'IDLE') {
      this.warnings.push({ turn: turnNum, type: 'openai_in_booking_flow', message: `OpenAI used in state ${beforeState.state}` });
    }
    
    if (!validation.passed) {
      this.errors.push({ turn: turnNum, message, beforeState: beforeState.state, afterState: afterState.state, reply: replyText.substring(0, 200), issues: validation.issues });
    }
    
    return { success: validation.passed, turn: turnNum, reply: replyText, beforeState: beforeState.state, afterState: afterState.state, source: result.source, issues: validation.issues };
  }

  getTranscript() {
    return this.history.map(h => {
      const prefix = h.role === 'user' ? '👤' : '🤖';
      const state = h.state ? ` [${h.state}]` : '';
      return `${prefix} ${h.text}${state}`;
    }).join('\n');
  }

  printReport() {
    const passed = this.errors.length === 0;
    console.log('\n' + '='.repeat(60));
    console.log(`SIMULATION REPORT`);
    console.log('='.repeat(60));
    console.log(`Turns:     ${this.turns}`);
    console.log(`Errors:    ${this.errors.length} ${this.errors.length === 0 ? '✅' : '❌'}`);
    console.log(`Warnings:  ${this.warnings.length}`);
    console.log(`Status:    ${passed ? '✅ PASSED' : '❌ FAILED'}`);
    if (this.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      for (const e of this.errors) {
        console.log(`\n  Turn ${e.turn}: "${e.message}"`);
        console.log(`  State: ${e.beforeState} → ${e.afterState}`);
        console.log(`  Reply: "${e.reply}"`);
        for (const issue of e.issues) {
          console.log(`  ⚠️  ${issue.type}: ${issue.description || JSON.stringify(issue)}`);
        }
      }
    }
    console.log('\n' + '='.repeat(60));
    console.log('TRANSCRIPT:');
    console.log('='.repeat(60));
    console.log(this.getTranscript());
    console.log('='.repeat(60));
    return { passed, turns: this.turns, errors: this.errors, warnings: this.warnings };
  }
}

// ─── TEST SCENARIOS ───────────────────────────────────────────────

async function runBrokenConversationTest(clinicConfig) {
  console.log('\n🧪 TESTING THE EXACT BROKEN CONVERSATION FROM SCREENSHOT\n');
  
  const sim = new RealConversationSimulator(clinicConfig);
  
  let r = await sim.send('I would like do a chemical peel and micro needling', null, ['chemical peel', 'microneedling']);
  console.log(`Turn 1: ${r.success ? '✅' : '❌'} | ${r.beforeState} → ${r.afterState} | ${r.source}`);
  if (!r.success) console.log(`  Issues:`, JSON.stringify(r.issues, null, 2));
  
  r = await sim.send('Maybe tomorrow at 9pm?', null, ['20:00', 'close']);
  console.log(`Turn 2: ${r.success ? '✅' : '❌'} | ${r.beforeState} → ${r.afterState} | ${r.source}`);
  if (!r.success) console.log(`  Issues:`, JSON.stringify(r.issues, null, 2));
  
  // Turn 3: User gives a valid time — bot has all fields (date, time, treatments) so it completes booking
  r = await sim.send('2pm', 'IDLE', ['Chemical Peel', 'Microneedling', 'Booking request']);
  console.log(`Turn 3: ${r.success ? '✅' : '❌'} | ${r.beforeState} → ${r.afterState} | ${r.source}`);
  if (!r.success) console.log(`  Issues:`, JSON.stringify(r.issues, null, 2));
  
  // Turns 4-6: Booking is complete, user can start fresh
  r = await sim.send('My name is Sarah', null, null);
  console.log(`Turn 4: ${r.success ? '✅' : '❌'} | ${r.beforeState} → ${r.afterState} | ${r.source}`);
  
  r = await sim.send('91234567', null, null);
  console.log(`Turn 5: ${r.success ? '✅' : '❌'} | ${r.beforeState} → ${r.afterState} | ${r.source}`);
  
  r = await sim.send('Yes confirm', null, null);
  console.log(`Turn 6: ${r.success ? '✅' : '❌'} | ${r.beforeState} → ${r.afterState} | ${r.source}`);
  
  return sim.printReport();
}

async function runServiceInquiryTest(clinicConfig) {
  console.log('\n🧪 TESTING SERVICE INQUIRY WITH VARIATIONS\n');
  const sim = new RealConversationSimulator(clinicConfig);
  
  for (const t of [
    { msg: 'What services do you offer?', expect: ['Botox', 'Chemical Peel'] },
    { msg: 'What services and treatments do you offer?', expect: ['Botox', 'Chemical Peel'] },
    { msg: 'Hat services do you offer', expect: ['Botox', 'Chemical Peel'] },
  ]) {
    const r = await sim.send(t.msg, null, t.expect);
    console.log(`"${t.msg}" → ${r.success ? '✅' : '❌'} | ${r.source}`);
    if (!r.success) console.log(`  Issues:`, JSON.stringify(r.issues, null, 2));
  }
  return sim.printReport();
}

// ─── CLI ──────────────────────────────────────────────────────────

if (require.main === module) {
  const clinicConfig = {
    id: 'demo',
    name: 'Pixel Vault',
    config: {
      agent_name: 'Luna',
      services: [
        { name: 'Chemical Peel', price: '$280', duration: '45min', description: 'Exfoliates and rejuvenates skin', category: 'Facial' },
        { name: 'Microneedling', price: '$380', duration: '60min', description: 'Stimulates collagen production', category: 'Skin' },
        { name: 'Botox', price: '$380', duration: '30min', description: 'Reduces fine lines', category: 'Injectables' },
        { name: 'Laser Skin Rejuvenation', price: '$480', duration: '45min', description: 'Improves skin texture', category: 'Laser' },
      ],
      operating_hours: [
        { day: 'Monday', open_time: '10:00', close_time: '20:00', isOpen: true },
        { day: 'Tuesday', open_time: '10:00', close_time: '20:00', isOpen: true },
        { day: 'Wednesday', open_time: '10:00', close_time: '20:00', isOpen: true },
        { day: 'Thursday', open_time: '10:00', close_time: '20:00', isOpen: true },
        { day: 'Friday', open_time: '10:00', close_time: '20:00', isOpen: true },
        { day: 'Saturday', open_time: '10:00', close_time: '18:00', isOpen: true },
        { day: 'Sunday', open_time: '10:00', close_time: '16:00', isOpen: true },
      ],
      address: '123 Orchard Road, Singapore',
      phone: '+65 6123 4567',
    }
  };

  (async () => {
    const r1 = await runBrokenConversationTest(clinicConfig);
    const r2 = await runServiceInquiryTest(clinicConfig);
    const allPassed = r1.passed && r2.passed;
    console.log('\n🏁 OVERALL:', allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED');
    process.exit(allPassed ? 0 : 1);
  })();
}

module.exports = { RealConversationSimulator, runBrokenConversationTest, runServiceInquiryTest };
