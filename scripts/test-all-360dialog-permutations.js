#!/usr/bin/env node
/**
 * Moon Hands — 360dialog Brute-Force Permutation Test
 * Tests EVERY possible combination of endpoint, phone format, and header.
 * One of these WILL work.
 */

require('dotenv').config();

const D360_API_KEY = process.env.D360_API_KEY;
const BASE_PHONE = process.argv[2] || '+6581398272';

console.log('═══════════════════════════════════════════════════════════════');
console.log('  360dialog — Brute Force Permutation Test');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`API Key: ${D360_API_KEY ? D360_API_KEY.substring(0, 8) + '...' : 'MISSING'}`);
console.log(`Base Phone: ${BASE_PHONE}`);
console.log(`Key Length: ${D360_API_KEY?.length}`);
console.log(`Key Pattern: ${/^[A-Z0-9]+$/.test(D360_API_KEY || '') ? 'ALL UPPERCASE' : 'MIXED'}`);
console.log();

if (!D360_API_KEY) {
  console.error('❌ D360_API_KEY not set');
  process.exit(1);
}

// Phone number variants
const phoneVariants = [
  { label: 'with +', number: BASE_PHONE.startsWith('+') ? BASE_PHONE : '+' + BASE_PHONE },
  { label: 'no +', number: BASE_PHONE.replace(/^\+/, '') },
  { label: 'no +, no 65', number: BASE_PHONE.replace(/^\+?65/, '') },
];

// All possible endpoints
const endpoints = [
  { name: 'waba.360dialog.io', url: 'https://waba.360dialog.io/v1/messages' },
  { name: 'waba-sandbox.360dialog.io', url: 'https://waba-sandbox.360dialog.io/v1/messages' },
  { name: 'hub.360dialog.io', url: 'https://hub.360dialog.io/v1/messages' },
  { name: 'api.360dialog.io', url: 'https://api.360dialog.io/v1/messages' },
];

// All possible header formats
const headerVariants = [
  { label: 'D360-API-KEY', headers: { 'D360-API-KEY': D360_API_KEY, 'Content-Type': 'application/json' } },
  { label: 'D360-Api-Key', headers: { 'D360-Api-Key': D360_API_KEY, 'Content-Type': 'application/json' } },
  { label: 'Authorization: Bearer', headers: { 'Authorization': `Bearer ${D360_API_KEY}`, 'Content-Type': 'application/json' } },
  { label: 'Authorization: Basic', headers: { 'Authorization': `Basic ${Buffer.from(D360_API_KEY).toString('base64')}`, 'Content-Type': 'application/json' } },
  { label: 'api-key', headers: { 'api-key': D360_API_KEY, 'Content-Type': 'application/json' } },
];

async function testCombo(endpoint, phone, headerVariant) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone.number,
    type: 'text',
    text: { body: 'Moon Hands permutation test' }
  };

  try {
    const result = await fetch(endpoint.url, {
      method: 'POST',
      headers: headerVariant.headers,
      body: JSON.stringify(payload)
    });

    const responseText = await result.text();
    let responseData = null;
    try { responseData = JSON.parse(responseText); } catch {}

    return {
      status: result.status,
      response: responseData || responseText,
      success: result.status === 200
    };
  } catch (err) {
    return { error: err.message, success: false };
  }
}

async function main() {
  let anySuccess = false;
  const results = [];

  for (const ep of endpoints) {
    for (const phone of phoneVariants) {
      for (const header of headerVariants) {
        process.stdout.write(`${ep.name} | ${phone.label} | ${header.label}... `);
        const result = await testCombo(ep, phone, header);

        if (result.success) {
          console.log('✅ SUCCESS');
          results.push({ endpoint: ep.name, phone: phone.label, header: header.label, status: 200 });
          anySuccess = true;
        } else if (result.error) {
          console.log(`❌ NETWORK: ${result.error.substring(0, 40)}`);
        } else {
          const msg = result.response?.meta?.developer_message ||
                      result.response?.detail ||
                      JSON.stringify(result.response).substring(0, 60);
          console.log(`❌ HTTP ${result.status}: ${msg}`);
        }
      }
    }
  }

  console.log();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  RESULTS');
  console.log('═══════════════════════════════════════════════════════════════');

  if (anySuccess) {
    console.log('✅ WORKING COMBINATIONS:');
    for (const r of results) {
      console.log(`   Endpoint: ${r.endpoint}`);
      console.log(`   Phone:    ${r.phone}`);
      console.log(`   Header:   ${r.header}`);
      console.log();
    }
  } else {
    console.log('❌ ALL COMBINATIONS FAILED.');
    console.log();
    console.log('This means one of the following:');
    console.log('  1. The phone number is not yet registered with 360dialog');
    console.log('     → Check: Channels → click channel → Phone Numbers tab');
    console.log('  2. The API key is not linked to the channel');
    console.log('     → Check: API Settings → look for "Linked Channel"');
    console.log('  3. 360dialog backend has not synced your WABA yet');
    console.log('     → This can take 24-48 hours after WABA shows "Live"');
    console.log('  4. You need to add credit/funds to 360dialog');
    console.log('     → Check: Billing section, ensure balance > €0');
    console.log();
    console.log('NEXT STEP: Contact 360dialog support with trace IDs');
    console.log('  URL: https://support.360dialog.com or support@360dialog.com');
    console.log('  Include: your API key prefix, phone number, WABA ID');
  }

  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
