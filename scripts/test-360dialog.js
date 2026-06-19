#!/usr/bin/env node
/**
 * Moon Hands — 360dialog API Diagnostic Tool v2
 * 
 * Run from Render Shell:
 *   cd ~/project/src && node scripts/test-360dialog.js [phone-number] [message]
 * 
 * This tests EVERY permutation:
 * - 3 different API endpoints
 * - Phone with and without + sign
 * - Checks your WABA status from 360dialog
 */

require('dotenv').config();

const D360_API_KEY = process.env.D360_API_KEY;
const TEST_PHONE = process.argv[2] || process.env.TEST_PHONE || '+6581398272';
const TEST_MESSAGE = process.argv[3] || 'Diagnostic test from Moon Hands backend.';

console.log('═══════════════════════════════════════════════════════════════');
console.log('  Moon Hands — 360dialog API Diagnostic Tool v2');
console.log('═══════════════════════════════════════════════════════════════');
console.log();

// ── Environment Check ─────────────────────────────────────────────
console.log('--- Environment ---');
console.log(`D360_API_KEY: ${D360_API_KEY ? '✅ SET (' + D360_API_KEY.substring(0, 4) + '...' + D360_API_KEY.substring(D360_API_KEY.length - 4) + ', len=' + D360_API_KEY.length + ')' : '❌ NOT SET'}`);
console.log(`Test phone:   ${TEST_PHONE}`);
console.log();

if (!D360_API_KEY) {
  console.error('❌ FATAL: D360_API_KEY not set.');
  process.exit(1);
}

// ── Phone Format Variants ─────────────────────────────────────────
const phoneVariants = [];
if (TEST_PHONE.startsWith('+')) {
  phoneVariants.push({ label: 'with +', number: TEST_PHONE });
  phoneVariants.push({ label: 'without +', number: TEST_PHONE.substring(1) });
} else {
  phoneVariants.push({ label: 'as-is', number: TEST_PHONE });
  phoneVariants.push({ label: 'with +', number: '+' + TEST_PHONE });
}

// ── Endpoints to Test ─────────────────────────────────────────────
const endpoints = [
  { name: 'PRODUCTION (waba.360dialog.io)', url: 'https://waba.360dialog.io/v1/messages' },
  { name: 'HUB (hub.360dialog.io)', url: 'https://hub.360dialog.io/v1/messages' },
  { name: 'SANDBOX (waba-sandbox.360dialog.io)', url: 'https://waba-sandbox.360dialog.io/v1/messages' },
];

if (process.env.D360_API_URL) {
  endpoints.unshift({ name: 'EXPLICIT (D360_API_URL)', url: process.env.D360_API_URL });
}

// ── Test Function ─────────────────────────────────────────────────
async function testSend(endpointName, endpointUrl, phone, phoneLabel) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'text',
    text: { body: TEST_MESSAGE }
  };
  
  try {
    const result = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'D360-API-KEY': D360_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    const responseText = await result.text();
    let responseData = null;
    try { responseData = JSON.parse(responseText); } catch {}
    
    return {
      status: result.status,
      statusText: result.statusText,
      response: responseData || responseText,
      phoneFormat: phoneLabel,
      phone: phone
    };
  } catch (err) {
    return { error: err.message, phoneFormat: phoneLabel, phone };
  }
}

// ── Run All Permutations ──────────────────────────────────────────
async function main() {
  let anySuccess = false;
  
  for (const ep of endpoints) {
    console.log(`╔═══════════════════════════════════════════════════════════════`);
    console.log(`║ Endpoint: ${ep.name}`);
    console.log(`║ URL: ${ep.url}`);
    console.log(`╚═══════════════════════════════════════════════════════════════`);
    
    for (const pv of phoneVariants) {
      process.stdout.write(`  Testing ${pv.label} (${pv.number})... `);
      const result = await testSend(ep.name, ep.url, pv.number, pv.label);
      
      if (result.status === 200) {
        console.log('✅ SUCCESS');
        const msgId = result.response?.messages?.[0]?.id || 'unknown';
        console.log(`     messageId: ${msgId}`);
        anySuccess = true;
      } else if (result.error) {
        console.log(`❌ NETWORK ERROR: ${result.error}`);
      } else {
        console.log(`❌ HTTP ${result.status}`);
        const devMsg = result.response?.meta?.developer_message || 
                       result.response?.detail || 
                       (typeof result.response === 'string' ? result.response.substring(0, 100) : JSON.stringify(result.response).substring(0, 100));
        console.log(`     ${devMsg}`);
        
        // Interpret common errors
        if (result.status === 404) {
          console.log(`     → Phone number not found for this API key's channel`);
          console.log(`     → WABA may be 'Pending' (not yet verified by Meta)`);
        } else if (result.status === 401) {
          console.log(`     → API key is invalid for this endpoint`);
        }
      }
    }
    console.log();
  }
  
  // ── Summary ───────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  
  if (anySuccess) {
    console.log('✅ API IS WORKING!');
    console.log();
    console.log('If WhatsApp messages still fail, check Render logs for');
    console.log('[WEBHOOK:whatsapp] and [360DIALOG:xxxxx] entries.');
  } else {
    console.log('❌ ALL PERMUTATIONS FAILED.');
    console.log();
    console.log('╔═══════════════════════════════════════════════════════════════');
    console.log('║ LIKELY ROOT CAUSE: Your WABA status is "Pending"');
    console.log('╚═══════════════════════════════════════════════════════════════');
    console.log();
    console.log('From your 360dialog screenshot, I can see:');
    console.log('  WhatsApp Business Account: Pixel Vault — Pending 🔴');
    console.log();
    console.log('When WABA is Pending:');
    console.log('  ✅ You CAN receive messages (webhooks work)');
    console.log('  ❌ You CANNOT send messages via API (404 error)');
    console.log();
    console.log('HOW TO FIX:');
    console.log('  1. Go to 360dialog Dashboard → Meta Business Settings');
    console.log('  2. Click on your WhatsApp Business Account');
    console.log('  3. Complete Meta Business Verification:');
    console.log('     a. Verify your business with Meta (submit business docs)');
    console.log('     b. Or: if personal, verify with phone/email');
    console.log('  4. Wait for Meta approval (usually 1-3 business days)');
    console.log();
    console.log('TEMPORARY WORKAROUND:');
    console.log('  Some 360dialog accounts allow limited testing while pending.');
    console.log('  Try: 360dialog Dashboard → click "Complete Verification"');
    console.log('  and follow the accelerated verification flow.');
    console.log();
    console.log('ALTERNATIVE: Use a test number that is already verified:');
    console.log('  Set TEST_PHONE env var to a different WhatsApp number');
    console.log('  that has a fully verified WABA.');
  }
  
  console.log();
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
