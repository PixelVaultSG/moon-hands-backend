/**
 * Check if webhooks are reaching the backend
 * Run on Render Shell:
 *   cd ~/project/src && node scripts/check-render-logs.js
 */

const fs = require('fs');
const path = require('path');

console.log('=== Webhook Receipt Check ===\n');

// Check if we can access any log files
const logPaths = [
  '/var/log/render',
  '/opt/render/log',
  process.env.RENDER_LOG_PATH,
].filter(Boolean);

for (const p of logPaths) {
  console.log(`Checking: ${p} — ${fs.existsSync(p) ? 'EXISTS' : 'NOT FOUND'}`);
}

// Check if webhook handler module loads correctly
console.log('\n--- Testing webhook module load ---');
try {
  // Just check the file exists and is readable
  const webhookPath = path.join(__dirname, '..', 'server', 'webhook.js');
  const stats = fs.statSync(webhookPath);
  console.log(`webhook.js: ${stats.size} bytes, last modified: ${stats.mtime}`);
  
  // Check for required env vars
  console.log('\n--- Environment Check ---');
  console.log('API_KEY:', process.env.API_KEY ? 'SET' : 'NOT SET');
  console.log('D360_API_KEY:', process.env.D360_API_KEY ? 'SET' : 'NOT SET');
  console.log('WEBHOOK_BASE_URL:', process.env.WEBHOOK_BASE_URL || '(uses request URL)');
  
  // Check if the clinic token matches what we expect
  console.log('\n--- pixellvault webhook token check ---');
  const token = process.env.PIXELLVAULT_WEBHOOK_TOKEN || '(from Supabase)';
  console.log('Token source:', token === '(from Supabase)' ? 'Supabase DB' : 'Environment');
  
} catch (err) {
  console.error('Error:', err.message);
}

console.log('\n=== IMPORTANT ===');
console.log('If you sent a message from your personal phone to +65 8139 8272,');
console.log('and our AI did NOT reply, then:');
console.log('');
console.log('Theory A: 360dialog webhook not reaching our backend');
console.log('  → Check: Render Dashboard → Logs → search for "[WEBHOOK]"');
console.log('  → If NO [WEBHOOK] entries appear, the webhook URL is wrong');
console.log('');
console.log('Theory B: Webhook reaches backend but processing fails');
console.log('  → Check: Render Dashboard → Logs → search for "error" or "catch"');
console.log('  → If errors appear, the code needs fixing');
console.log('');
console.log('Theory C: 360dialog coexistence mode (not sending webhooks)');
console.log('  → The coexistence webhook file suggests history sync mode');
console.log('  → Real-time webhooks may not be active yet');
console.log('');
console.log('NEXT STEP: Go to Render Dashboard → Logs → copy last 50 lines');
console.log('           after sending a test message from your phone.');
