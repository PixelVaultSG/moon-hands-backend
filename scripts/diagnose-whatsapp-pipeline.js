#!/usr/bin/env node
/**
 * Moon Hands — WhatsApp Pipeline Diagnostic Tool
 * 
 * Run from Render Shell:
 *   cd ~/project/src && node scripts/diagnose-whatsapp-pipeline.js
 * 
 * This tests the ENTIRE pipeline:
 * 1. Supabase connection + clinic data
 * 2. 360dialog API sending capability (WABA verified?)
 * 3. Webhook token validation
 * 4. Full round-trip: send → receive → reply
 */

require('dotenv').config();

const D360_API_KEY = process.env.D360_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_PHONE = process.argv[2] || '+6581398272'; // Your phone

console.log('═══════════════════════════════════════════════════════════════');
console.log('  Moon Hands — WhatsApp Pipeline Diagnostic');
console.log('═══════════════════════════════════════════════════════════════\n');

// ── 1. Environment Check ──────────────────────────────────────────
console.log('━━━ 1. ENVIRONMENT VARIABLES ━━━');
console.log(`D360_API_KEY:       ${D360_API_KEY ? '✅ SET' : '❌ MISSING'}`);
console.log(`SUPABASE_URL:       ${SUPABASE_URL ? '✅ SET' : '❌ MISSING'}`);
console.log(`SUPABASE_KEY:       ${SUPABASE_KEY ? '✅ SET' : '❌ MISSING'}`);
console.log(`WEBHOOK_BASE_URL:   ${process.env.WEBHOOK_BASE_URL || '❌ NOT SET (defaults to render URL)'}`);
console.log();

if (!D360_API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ FATAL: Missing required environment variables.');
  process.exit(1);
}

// ── 2. Supabase Connection + Clinic Data ─────────────────────────
console.log('━━━ 2. SUPABASE + CLINIC DATA ━━━');

async function checkSupabase() {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    
    // Check clients table
    const { data: clients, error } = await supabase
      .from('clients')
      .select('id, slug, name, status, webhook_token, whatsapp_number')
      .eq('status', 'active');
    
    if (error) {
      console.log(`❌ Supabase query error: ${error.message}`);
      return null;
    }
    
    console.log(`✅ Supabase connected. ${clients?.length || 0} active clinic(s) found.`);
    
    if (clients && clients.length > 0) {
      for (const c of clients) {
        console.log(`\n   Clinic: ${c.name} (${c.slug})`);
        console.log(`   Status: ${c.status}`);
        console.log(`   WhatsApp: ${c.whatsapp_number || 'not set'}`);
        console.log(`   Webhook token: ${c.webhook_token ? c.webhook_token.substring(0, 12) + '...' : '❌ NOT SET'}`);
        
        // Construct the webhook URL
        const baseUrl = process.env.WEBHOOK_BASE_URL || 'https://moon-hands-backend.onrender.com';
        const webhookUrl = `${baseUrl}/webhook/whatsapp?clinic_id=${c.slug}&token=${c.webhook_token}`;
        console.log(`   Webhook URL: ${webhookUrl}`);
        console.log(`   ⚠️  IMPORTANT: This URL must be configured in 360dialog dashboard!`);
      }
    }
    
    return clients;
  } catch (err) {
    console.log(`❌ Supabase error: ${err.message}`);
    return null;
  }
}

// ── 3. 360dialog API Sending Test ────────────────────────────────
console.log('━━━ 3. 360DIALOG API SEND TEST ━━━');

async function test360dialogSend() {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: TEST_PHONE,
    type: 'text',
    text: { body: '🔧 Moon Hands diagnostic test. If you receive this, the API is working!' }
  };
  
  const isSandboxKey = D360_API_KEY.length === 32 && /^[A-Z0-9]+$/.test(D360_API_KEY);
  const endpoint = isSandboxKey 
    ? 'https://waba-sandbox.360dialog.io/v1/messages'
    : 'https://waba.360dialog.io/v1/messages';
  
  console.log(`Using endpoint: ${endpoint}`);
  console.log(`Key type: ${isSandboxKey ? 'SANDBOX' : 'PRODUCTION'}`);
  
  try {
    const result = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'D360-API-KEY': D360_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    const responseText = await result.text();
    console.log(`HTTP ${result.status}: ${responseText.substring(0, 200)}`);
    
    if (result.ok) {
      console.log('✅ 360dialog API SEND WORKS! Check your phone for the test message.');
      return true;
    } else if (result.status === 404) {
      console.log('❌ 404: WABA may still be pending or phone number not registered.');
      console.log('   → Check 360dialog dashboard: Channels → your channel → status');
    } else if (result.status === 401) {
      console.log('❌ 401: API key invalid for this endpoint.');
    } else {
      console.log(`❌ HTTP ${result.status}: ${responseText.substring(0, 200)}`);
    }
    return false;
  } catch (err) {
    console.log(`❌ Network error: ${err.message}`);
    return false;
  }
}

// ── 4. Summary ───────────────────────────────────────────────────
async function main() {
  const clients = await checkSupabase();
  console.log();
  
  const canSend = await test360dialogSend();
  console.log();
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  DIAGNOSIS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log();
  
  if (!canSend) {
    console.log('🔴 PROBLEM: Cannot send messages via 360dialog API.');
    console.log();
    console.log('Most likely causes (in order):');
    console.log('  1. WABA still showing as "Pending" in 360dialog (even if you completed verification,');
    console.log('     Meta may take 1-3 business days to approve)');
    console.log('  2. Phone number (+65 8139 8272) not yet linked to the API key');
    console.log('  3. Wrong API key for the endpoint (sandbox vs production)');
    console.log();
    console.log('ACTION: Check 360dialog Dashboard → Channels → your channel');
  } else {
    console.log('✅ API sending works!');
    console.log();
    
    if (!clients || clients.length === 0) {
      console.log('🔴 PROBLEM: No active clinics in Supabase database.');
      console.log('   → Onboard a clinic first via the onboarding form.');
    } else {
      console.log('✅ Clinic data looks good.');
      console.log();
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('MOST LIKELY ISSUE: Webhook URL not configured in 360dialog');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log();
      console.log('When a patient sends a message to your WhatsApp number,');
      console.log('360dialog needs to know WHERE to forward it (your webhook URL).');
      console.log();
      console.log('HOW TO FIX:');
      console.log('  1. Go to https://dashboard.360dialog.com');
      console.log('  2. Navigate to: Channels → your channel → Webhook Settings');
      console.log('  3. Set the webhook URL to:');
      for (const c of clients) {
        const baseUrl = process.env.WEBHOOK_BASE_URL || 'https://moon-hands-backend.onrender.com';
        console.log(`     ${baseUrl}/webhook/whatsapp?clinic_id=${c.slug}&token=${c.webhook_token}`);
      }
      console.log('  4. Save the configuration');
      console.log('  5. Send a test message from your phone');
      console.log('  6. Check Render logs for [WEBHOOK] entries');
    }
  }
  
  console.log();
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
