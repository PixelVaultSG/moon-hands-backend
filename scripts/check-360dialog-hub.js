#!/usr/bin/env node
/**
 * Check 360dialog Hub API configuration
 * The coexistence webhook shows your WABA is active,
 * but the API key may be linked to the wrong endpoint.
 * 360dialog has TWO APIs: waba.* (legacy) and hub.* (new unified)
 */

require('dotenv').config();

const D360_API_KEY = process.env.D360_API_KEY;
const PHONE_ID = '1243486865508077'; // From your coexistence webhook
const PHONE = '+6581398272';

console.log('═══════════════════════════════════════════════════════════════');
console.log('  360dialog Hub API Configuration Check');
console.log('═══════════════════════════════════════════════════════════════\n');

if (!D360_API_KEY) {
  console.error('❌ D360_API_KEY not set');
  process.exit(1);
}

// The coexistence webhook reveals your Phone Number ID is 1243486865508077
// In 360dialog Hub API, you send TO a phone number but need the FROM phone configured

async function testHubAPI() {
  console.log('Testing Hub API (hub.360dialog.io)...');
  
  // Hub API uses Bearer token auth
  const r = await fetch('https://hub.360dialog.io/v1/messages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${D360_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '6591252297', // Your personal phone without +
      type: 'text',
      text: { body: 'Hub API test from Moon Hands' }
    })
  });
  
  const text = await r.text();
  console.log(`HTTP ${r.status}: ${text.substring(0, 200)}`);
}

async function testWabaWithPhoneId() {
  console.log('\nTesting waba API with explicit phone_number_id...');
  
  // Some 360dialog configs require the phone_number_id in the body
  const r = await fetch('https://waba.360dialog.io/v1/messages', {
    method: 'POST',
    headers: {
      'D360-API-KEY': D360_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '6591252297',
      type: 'text',
      text: { body: 'WABA API test with phone_id' },
      // Some configurations need this:
      // from: '1243486865508077'
    })
  });
  
  const text = await r.text();
  console.log(`HTTP ${r.status}: ${text.substring(0, 200)}`);
}

async function checkChannelConfig() {
  console.log('\nChecking channel configuration via Hub API...');
  
  const r = await fetch('https://hub.360dialog.io/v1/channels', {
    headers: {
      'Authorization': `Bearer ${D360_API_KEY}`
    }
  });
  
  const text = await r.text();
  console.log(`HTTP ${r.status}: ${text.substring(0, 500)}`);
}

(async () => {
  await testHubAPI();
  await testWabaWithPhoneId();
  await checkChannelConfig();
})();
