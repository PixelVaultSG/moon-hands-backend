-- ============================================================================
-- MOON HANDS — Go-Live Cleanup (Simplified Bulletproof Version)
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Step 1: Add unique constraint (required for ON CONFLICT to work)
ALTER TABLE client_configs DROP CONSTRAINT IF EXISTS client_configs_client_id_key;
ALTER TABLE client_configs ADD CONSTRAINT client_configs_client_id_key UNIQUE (client_id);

-- Step 2: Delete demo clinics and all their data
DELETE FROM appointments WHERE client_id IN (SELECT id FROM clients WHERE slug IN ('demo-clinic', 'glow-aesthetics', 'glow-demo'));
DELETE FROM conversations WHERE client_id IN (SELECT id FROM clients WHERE slug IN ('demo-clinic', 'glow-aesthetics', 'glow-demo'));
DELETE FROM waitlist WHERE client_id IN (SELECT id FROM clients WHERE slug IN ('demo-clinic', 'glow-aesthetics', 'glow-demo'));
DELETE FROM daily_usage WHERE client_id IN (SELECT id FROM clients WHERE slug IN ('demo-clinic', 'glow-aesthetics', 'glow-demo'));
DELETE FROM client_configs WHERE client_id IN (SELECT id FROM clients WHERE slug IN ('demo-clinic', 'glow-aesthetics', 'glow-demo'));
DELETE FROM clients WHERE slug IN ('demo-clinic', 'glow-aesthetics', 'glow-demo');

-- Step 3: Fix Pixel Vault slug (pixellvault -> pixelvault)
UPDATE clients SET slug = 'pixelvault' WHERE slug = 'pixellvault';
UPDATE clients SET name = 'Pixel Vault Aesthetics', contact_name = 'Ash (Demo)', contact_email = 'pixelvaultsg@gmail.com', contact_phone = '+65 8139 8272', whatsapp_number = '+65 8139 8272', google_calendar_id = 'pixelvaultsg@gmail.com', status = 'active', plan = 'professional' WHERE slug = 'pixelvault';

-- Step 4: Delete old Pixel Vault test data
DELETE FROM appointments WHERE client_id = (SELECT id FROM clients WHERE slug = 'pixelvault');
DELETE FROM conversations WHERE client_id = (SELECT id FROM clients WHERE slug = 'pixelvault');
DELETE FROM waitlist WHERE client_id = (SELECT id FROM clients WHERE slug = 'pixelvault');

-- Step 5: Insert/update Pixel Vault config
INSERT INTO client_configs (client_id, agent_name, greeting, tone, enthusiasm, special_notes, services, faqs, operating_hours, booking_auto_confirm, booking_after_hours_action, booking_waitlist_enabled, booking_max_advance_days, booking_min_notice_hours, booking_allow_same_day, booking_require_phone, booking_reminder_24h, booking_reminder_1h, booking_followup_48h, automations, languages)
SELECT
  id,
  'Sophia',
  'Hey there! Welcome to Pixel Vault Aesthetics ✨ I''m Sophia, your virtual receptionist. I can help you with bookings, treatment info, or pricing. What can I do for you?',
  'warm and friendly',
  'medium',
  'All injectable treatments are performed by MOH-certified doctors. We use only FDA/HSA-approved products. Consultations are complimentary for first-time patients. Located at 123 Orchard Road, #05-01 Orchard Tower, Singapore 238863. Nearest MRT: Orchard (NS22/TE14). Parking: Complimentary at ION Orchard.',
  '[{"name":"Botox","price":"$380","duration":30,"description":"Reduces fine lines and wrinkles. Results last 3-4 months."},{"name":"Dermal Filler","price":"$680","duration":45,"description":"Restores volume and contours. Results last 6-12 months."},{"name":"HydraFacial","price":"$280","duration":60,"description":"Deep cleansing, exfoliation and hydration. Instant glow."},{"name":"HIFU Face Lift","price":"$1,280","duration":90,"description":"Non-surgical facelift using ultrasound. Results develop over 2-3 months."},{"name":"Laser Skin Rejuvenation","price":"$450","duration":45,"description":"Improves skin texture, pores and pigmentation."},{"name":"Chemical Peel","price":"$180","duration":30,"description":"Exfoliates dead skin cells for brighter, smoother skin."},{"name":"Rejuran Healer","price":"$880","duration":45,"description":"Skin healing and regeneration with salmon DNA. 3 sessions recommended."},{"name":"Thread Lift","price":"$2,500","duration":60,"description":"Dissolvable threads lift and tighten sagging skin."},{"name":"Microneedling","price":"$350","duration":60,"description":"Collagen induction therapy for acne scars and skin texture."},{"name":"PicoSure Laser","price":"$500","duration":45,"description":"Pigmentation removal and skin revitalization."}]'::jsonb,
  '[{"question":"What are your opening hours?","answer":"Mon-Fri 10am-8pm, Sat 10am-6pm. Closed Sun. Public holidays 11am-4pm."},{"question":"Do I need a consultation before treatment?","answer":"A complimentary consultation is required for all injectable treatments. Facials, peels, and laser treatments can be booked directly."},{"question":"Is there downtime?","answer":"Most facials have zero downtime. Injectables may have mild redness or swelling for 24-48 hours."},{"question":"How do I prepare for my appointment?","answer":"Avoid alcohol 24 hours before injectables. Come with clean skin. Inform us of any medications or allergies. Arrive 10 minutes early."},{"question":"What payment methods do you accept?","answer":"PayNow, credit/debit cards, and cash. Installment plans available via Atome or Grab PayLater."},{"question":"Can I cancel or reschedule?","answer":"Yes! Reschedule or cancel up to 24 hours before at no charge. Late cancellations (within 24 hours) may incur a $50 fee."},{"question":"Are your doctors certified?","answer":"Yes, all doctors are MOH-certified aesthetic physicians with minimum 5 years of experience. Dr. Amanda Chen (Medical Director) has 15+ years."},{"question":"Where are you located?","answer":"123 Orchard Road, #05-01 Orchard Tower, Singapore 238863. Nearest MRT: Orchard (NS22/TE14) - 3 min walk."}]'::jsonb,
  '[{"day":"Monday","open_time":"10:00","close_time":"20:00","isOpen":true},{"day":"Tuesday","open_time":"10:00","close_time":"20:00","isOpen":true},{"day":"Wednesday","open_time":"10:00","close_time":"20:00","isOpen":true},{"day":"Thursday","open_time":"10:00","close_time":"20:00","isOpen":true},{"day":"Friday","open_time":"10:00","close_time":"20:00","isOpen":true},{"day":"Saturday","open_time":"10:00","close_time":"18:00","isOpen":true},{"day":"Sunday","open_time":"","close_time":"","isOpen":false},{"day":"Public Holidays","open_time":"11:00","close_time":"16:00","isOpen":true}]'::jsonb,
  false, 'hold_for_approval', true, 30, 4, true, true, true, true, true,
  '{"bookingConfirmation":true,"reminder24h":true,"reminder1h":true,"followup48h":true}'::jsonb,
  ARRAY['en']
FROM clients WHERE slug = 'pixelvault'
ON CONFLICT ON CONSTRAINT client_configs_client_id_key DO UPDATE SET
  agent_name = EXCLUDED.agent_name,
  greeting = EXCLUDED.greeting,
  tone = EXCLUDED.tone,
  enthusiasm = EXCLUDED.enthusiasm,
  special_notes = EXCLUDED.special_notes,
  services = EXCLUDED.services,
  faqs = EXCLUDED.faqs,
  operating_hours = EXCLUDED.operating_hours,
  booking_auto_confirm = EXCLUDED.booking_auto_confirm,
  booking_after_hours_action = EXCLUDED.booking_after_hours_action,
  booking_waitlist_enabled = EXCLUDED.booking_waitlist_enabled,
  booking_max_advance_days = EXCLUDED.booking_max_advance_days,
  booking_min_notice_hours = EXCLUDED.booking_min_notice_hours,
  booking_allow_same_day = EXCLUDED.booking_allow_same_day,
  booking_require_phone = EXCLUDED.booking_require_phone,
  booking_reminder_24h = EXCLUDED.booking_reminder_24h,
  booking_reminder_1h = EXCLUDED.booking_reminder_1h,
  booking_followup_48h = EXCLUDED.booking_followup_48h,
  automations = EXCLUDED.automations,
  languages = EXCLUDED.languages;

-- Step 6: Seed appointments
INSERT INTO appointments (client_id, customer_name, customer_phone, service, appointment_date, appointment_time, duration, status, notes, created_at)
SELECT c.id, a.n, a.p, a.s, a.d::date, a.t::time, a.dur, a.st, a.note, NOW() - INTERVAL '1 day'
FROM clients c,
(VALUES
  ('Sarah Tan', '+6591234567', 'HydraFacial', (NOW() + INTERVAL '2 days')::date::text, '14:00', 60, 'confirmed', 'First-time customer'),
  ('Michelle Lee', '+6587654321', 'Botox', (NOW() + INTERVAL '5 days')::date::text, '11:00', 30, 'confirmed', 'Forehead and crows feet'),
  ('Jennifer Wong', '+6598765432', 'HIFU Face Lift', (NOW() + INTERVAL '7 days')::date::text, '16:00', 90, 'pending_approval', 'Requested Dr. Amanda'),
  ('Karen Lim', '+6512345678', 'Chemical Peel', (NOW() - INTERVAL '1 day')::date::text, '10:00', 30, 'completed', 'Follow-up in 4 weeks'),
  ('Rachel Ng', '+6578901234', 'Dermal Filler', (NOW() + INTERVAL '9 days')::date::text, '15:00', 45, 'confirmed', 'Lip enhancement')
) AS a(n, p, s, d, t, dur, st, note)
WHERE c.slug = 'pixelvault';

-- Step 7: Seed conversations
INSERT INTO conversations (client_id, channel, customer_phone, customer_name, message, ai_response, intent, created_at)
SELECT c.id, 'whatsapp', m.p, m.n, m.msg, m.r, m.i, NOW() - INTERVAL '2 days'
FROM clients c,
(VALUES
  ('6591234567', 'Sarah Tan', 'Hi, what are your opening hours?', 'We''re open Mon-Fri 10am-8pm, Sat 10am-6pm. Closed Sun. Public holidays 11am-4pm.', 'operating_hours'),
  ('6587654321', 'Michelle Lee', 'How much is Botox?', 'Botox is $380 per area. Results last 3-4 months. Would you like to book?', 'pricing'),
  ('6598765432', 'Jennifer Wong', 'Do you do HIFU?', 'Yes! HIFU Face Lift is $1,280 per session (90 min). Would you like to book?', 'service_inquiry'),
  ('6512345678', 'Karen Lim', 'What should I avoid after my peel?', 'Avoid sun exposure and heavy exercise for 48 hours. Use SPF 50+ daily.', 'faq'),
  ('6578901234', 'Rachel Ng', 'Can I reschedule my Saturday appointment?', 'No problem! What day and time works for you next week?', 'reschedule'),
  ('6591112222', 'Angela Goh', 'I want to book a Thread Lift', 'Sure! Thread Lift is $2,500. When would you like to come in?', 'booking')
) AS m(p, n, msg, r, i)
WHERE c.slug = 'pixelvault';

-- Step 8: Seed waitlist
INSERT INTO waitlist (client_id, customer_name, customer_phone, preferred_service, preferred_date, preferred_time_range, status, notes, created_at)
SELECT c.id, 'Angela Goh', '+6511122233', 'Thread Lift', (NOW() + INTERVAL '12 days')::date, 'afternoon', 'active', 'Flexible on date', NOW() - INTERVAL '1 day'
FROM clients c WHERE c.slug = 'pixelvault';

-- Step 9: Verify
SELECT '=== RESULTS ===' as status;
SELECT slug, name, status, whatsapp_number FROM clients WHERE slug = 'pixelvault';
SELECT jsonb_array_length(services) as services_count, jsonb_array_length(faqs) as faqs_count FROM client_configs WHERE client_id = (SELECT id FROM clients WHERE slug = 'pixelvault');
SELECT (SELECT COUNT(*) FROM appointments WHERE client_id = (SELECT id FROM clients WHERE slug = 'pixelvault')) as appointments,
       (SELECT COUNT(*) FROM conversations WHERE client_id = (SELECT id FROM clients WHERE slug = 'pixelvault')) as conversations,
       (SELECT COUNT(*) FROM waitlist WHERE client_id = (SELECT id FROM clients WHERE slug = 'pixelvault')) as waitlist;