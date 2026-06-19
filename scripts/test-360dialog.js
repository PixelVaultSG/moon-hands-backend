#!/usr/bin/env node
/**
 * Moon Hands — 360dialog API Diagnostic Tool
 * 
 * Run this from Render Shell (or locally with correct env vars):
 *   cd /var/opt/moon-hands-backend && node scripts/test-360dialog.js
 * 
 * This script tests the 360dialog API connectivity DIRECTLY, bypassing
 * the webhook server entirely. If this fails, the problem is your
 * D360_API_KEY or the API endpoint. If this succeeds but WhatsApp
 * messages still don't get replies, the problem is in the webhook server.
 */

require('dotenv').config();

const D360_API_KEY = process.env.D360_API_KEY;
const TEST_PHONE = process.argv[2] || process.env.TEST_PHONE || '+6581398272';
const TEST_MESSAGE = process.argv[3] || 'Diagnostic test from Moon Hands backend. If you receive this, the 360dialog API is working correctly.';

console.log('═══════════════════════════════════════════════════════');
console.log('  Moon Hands — 360dialog API Diagnostic Tool');
console.log('═══════════════════════════════════════════════════════');
console.log();

// ── Environment Check ─────────────────────────────────────────────
console.log('--- Environment Variables ---');
console.log(`D360_API_KEY: ${D360_API_KEY ? '✅ SET (' + D360_API_KEY.substring(0, 4) + '...' + D360_API_KEY.substring(D360_API_KEY.length - 4) + ', len=' + D360_API_KEY.length + ')' : '❌ NOT SET'}`);
console.log(`D360_API_URL: ${process.env.D360_API_URL || '(not set — using defaults)'}`);
console.log(`Test phone:   ${TEST_PHONE}`);
console.log();

if (!D360_API_KEY) {
  console.error('❌ FATAL: D360_API_KEY is not set.');
  console.error('   Fix: Render Dashboard → Environment → Add D360_API_KEY');
  console.error('   Get the key from: 360dialog Dashboard → API Keys');
  process.exit(1);
}

// ── Key Format Detection ──────────────────────────────────────────
const isSandbox = D360_API_KEY.length === 32 && /^[A-Z0-9]+$/.test(D360_API_KEY);
console.log(`Key format detected: ${isSandbox ? 'SANDBOX (32 uppercase chars)' : 'PRODUCTION or CUSTOM'}`);
console.log();

// ── Endpoints to Test ─────────────────────────────────────────────
const endpoints = [];
if (process.env.D360_API_URL) endpoints.push({ name: 'EXPLICIT (D360_API_URL)', url: process.env.D360_API_URL });
endpoints.push({ name: 'PRODUCTION', url: 'https://waba.360dialog.io/v1/messages' });
endpoints.push({ name: 'SANDBOX', url: 'https://waba-sandbox.360dialog.io/v1/messages' });

// ── Test Each Endpoint ────────────────────────────────────────────
async function testEndpoint(name, url) {
  console.log(`--- Testing: ${name} ---`);
  console.log(`URL: ${url}`);
  
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: TEST_PHONE,
    type: 'text',
    text: { body: TEST_MESSAGE }
  };
  
  try {
    const start = Date.now();
    const result = await fetch(url, {
      method: 'POST',
      headers: {
        'D360-API-KEY': D360_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const latency = Date.now() - start;
    
    const responseText = await result.text();
    
    console.log(`HTTP Status: ${result.status} ${result.statusText} (${latency}ms)`);
    console.log(`Response: ${responseText.substring(0, 300)}`);
    
    if (result.ok) {
      try {
        const data = JSON.parse(responseText);
        const msgId = data.messages?.[0]?.id;
        console.log(`✅ SUCCESS! Message ID: ${msgId}`);
        return { success: true, messageId: msgId, latency };
      } catch {
        console.log('✅ SUCCESS! (response not JSON, but HTTP 200)');
        return { success: true, latency };
      }
    } else {
      console.log(`❌ FAILED: HTTP ${result.status}`);
      if (result.status === 401) {
        console.log('   → Authentication failed. Your API key is invalid or expired.');
        console.log('   → Go to 360dialog Dashboard → API Keys → copy the correct key.');
      } else if (result.status === 404) {
        console.log('   → Phone number not found. The test number may not have WhatsApp.');
      } else if (result.status === 429) {
        console.log('   → Rate limited. Wait a minute and try again.');
      }
      return { success: false, status: result.status, latency };
    }
  } catch (err) {
    console.log(`❌ NETWORK ERROR: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function main() {
  const results = [];
  
  for (const endpoint of endpoints) {
    const result = await testEndpoint(endpoint.name, endpoint.url);
    results.push({ ...result, name: endpoint.name, url: endpoint.url });
    console.log();
  }
  
  // ── Summary ───────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════');
  
  const anySuccess = results.some(r => r.success);
  
  if (anySuccess) {
    const working = results.filter(r => r.success);
    console.log(`✅ API is WORKING! ${working.length}/${results.length} endpoints succeeded.`);
    console.log();
    console.log('Working endpoint(s):');
    working.forEach(r => console.log(`  • ${r.name}: ${r.url}`));
    console.log();
    console.log('Next steps:');
    console.log('  1. Set D360_API_URL in Render to the working endpoint URL (optional)');
    console.log('  2. Send a WhatsApp message to your clinic number');
    console.log('  3. Check Render logs: [360DIALOG:xxxx] ✅ SUCCESS!');
    console.log('  4. If WhatsApp still fails, the issue is in the webhook server, not the API.');
  } else {
    console.log('❌ ALL ENDPOINTS FAILED.');
    console.log();
    console.log('Most likely causes (in order):');
    console.log('  1. D360_API_KEY is wrong or expired');
    console.log('     → 360dialog Dashboard → API Keys → regenerate/copy');
    console.log('  2. Your 360dialog account is on a different endpoint');
    console.log('     → Check your 360dialog welcome email for the correct API URL');
    console.log('  3. Your 360dialog subscription is expired');
    console.log('     → Check billing status in 360dialog Dashboard');
    console.log('  4. Network issue between Render and 360dialog');
    console.log('     → Rare; try again in a few minutes');
  }
  
  console.log();
  console.log('═══════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
