-- ============================================================================
-- MOON HANDS — FULL DATABASE CLEANUP + PIXEL VAULT MIGRATION
-- Date: 2026-07-03
-- Purpose:
--   1. Delete Demo Aesthetic Clinic and Glow Aesthetics
--   2. Copy their rich config (services, FAQs, hours, tone) into Pixel Vault
--   3. Fix Pixel Vault slug: pixellvault → pixelvault
--   4. Update Pixel Vault with full demo data (appointments, conversations)
--   5. Result: ONE clean demo clinic (Pixel Vault) ready for go-live testing
--
-- BEFORE RUNNING: This is destructive. It DELETES clinics and their data.
-- The script is idempotent — safe to run multiple times.
-- ============================================================================

-- ─── STEP 0: FIX SCHEMA (add missing unique constraint) ─────────────────────
-- client_configs.client_id should be unique (one config per clinic).
-- Adding this constraint allows ON CONFLICT (client_id) to work.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'client_configs'::regclass 
    AND conname = 'client_configs_client_id_key'
  ) THEN
    ALTER TABLE client_configs ADD CONSTRAINT client_configs_client_id_key UNIQUE (client_id);
    RAISE NOTICE '✅ Added UNIQUE constraint on client_configs(client_id)';
  ELSE
    RAISE NOTICE 'ℹ️ UNIQUE constraint already exists on client_configs(client_id)';
  END IF;
END $$;

-- ─── STEP 0b: VERIFY CURRENT STATE ──────────────────────────────────────────
SELECT '=== BEFORE CLEANUP ===' as section;
SELECT id, slug, name, status FROM clients ORDER BY slug;

-- ─── STEP 1: IDENTIFY CLINICS TO CLEAN UP ──────────────────────────────────
DO $$
DECLARE
  demo_id UUID;
  glow_id UUID;
  pixel_id UUID;
BEGIN
  -- Find IDs
  SELECT id INTO demo_id FROM clients WHERE slug = 'demo-clinic';
  SELECT id INTO glow_id FROM clients WHERE slug IN ('glow-aesthetics', 'glow-demo');
  SELECT id INTO pixel_id FROM clients WHERE slug = 'pixellvault';

  RAISE NOTICE 'demo-clinic ID: %', demo_id;
  RAISE NOTICE 'glow-aesthetics ID: %', glow_id;
  RAISE NOTICE 'pixellvault ID: %', pixel_id;
END $$;

-- ─── STEP 2: DELETE DEMO AESTHETIC CLINIC + ALL DATA ───────────────────────
DO $$
DECLARE
  demo_ids UUID[];
BEGIN
  -- Find all demo clinic IDs (there might be multiple)
  SELECT ARRAY_AGG(id) INTO demo_ids FROM clients WHERE slug = 'demo-clinic';
  
  IF demo_ids IS NOT NULL THEN
    RAISE NOTICE 'Deleting demo-clinic (IDs: %) and all related data...', demo_ids;
    
    -- Delete related data (cascade should handle most, but be explicit)
    DELETE FROM appointments WHERE client_id = ANY(demo_ids);
    DELETE FROM conversations WHERE client_id = ANY(demo_ids);
    DELETE FROM waitlist WHERE client_id = ANY(demo_ids);
    DELETE FROM daily_usage WHERE client_id = ANY(demo_ids);
    DELETE FROM monthly_usage WHERE client_id = ANY(demo_ids);
    DELETE FROM pending_changes WHERE client_id = ANY(demo_ids);
    DELETE FROM client_configs WHERE client_id = ANY(demo_ids);
    DELETE FROM clients WHERE id = ANY(demo_ids);
    
    RAISE NOTICE '✅ demo-clinic deleted';
  ELSE
    RAISE NOTICE 'ℹ️ demo-clinic not found (already deleted)';
  END IF;
END $$;

-- ─── STEP 3: DELETE GLOW AESTHETICS + ALL DATA ─────────────────────────────
DO $$
DECLARE
  glow_ids UUID[];
BEGIN
  -- Find all Glow clinic IDs
  SELECT ARRAY_AGG(id) INTO glow_ids FROM clients WHERE slug IN ('glow-aesthetics', 'glow-demo');
  
  IF glow_ids IS NOT NULL THEN
    RAISE NOTICE 'Deleting Glow Aesthetics (IDs: %) and all related data...', glow_ids;
    
    DELETE FROM appointments WHERE client_id = ANY(glow_ids);
    DELETE FROM conversations WHERE client_id = ANY(glow_ids);
    DELETE FROM waitlist WHERE client_id = ANY(glow_ids);
    DELETE FROM daily_usage WHERE client_id = ANY(glow_ids);
    DELETE FROM monthly_usage WHERE client_id = ANY(glow_ids);
    DELETE FROM pending_changes WHERE client_id = ANY(glow_ids);
    DELETE FROM client_configs WHERE client_id = ANY(glow_ids);
    DELETE FROM clients WHERE id = ANY(glow_ids);
    
    RAISE NOTICE '✅ Glow Aesthetics deleted';
  ELSE
    RAISE NOTICE 'ℹ️ Glow Aesthetics not found (already deleted)';
  END IF;
END $$;

-- ─── STEP 4: UPDATE PIXEL VAULT WITH RICH DEMO CONFIG ──────────────────────
DO $$
DECLARE
  pixel_id UUID;
BEGIN
  SELECT id INTO pixel_id FROM clients WHERE slug = 'pixellvault';
  
  IF pixel_id IS NULL THEN
    RAISE NOTICE '❌ pixellvault not found! Cannot update config.';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Updating Pixel Vault (ID: %) with full demo config...', pixel_id;

  -- Update client record
  UPDATE clients SET
    name = 'Pixel Vault Aesthetics',
    contact_name = 'Ash (Demo)',
    contact_email = 'pixelvaultsg@gmail.com',
    contact_phone = '+65 8139 8272',
    whatsapp_number = '+65 8139 8272',
    plan = 'professional',
    status = 'active',
    industry = 'aesthetic',
    google_calendar_id = 'pixelvaultsg@gmail.com',
    updated_at = NOW()
  WHERE id = pixel_id;
  
  -- Upsert client_configs with rich demo data
  INSERT INTO client_configs (
    client_id,
    agent_name, greeting, tone, enthusiasm, special_notes,
    services, faqs, operating_hours,
    appointment_duration, buffer_time, max_per_day, cancellation_policy,
    booking_auto_confirm, booking_after_hours_action, booking_waitlist_enabled,
    booking_max_advance_days, booking_min_notice_hours, booking_allow_same_day,
    booking_require_phone, booking_reminder_24h, booking_reminder_1h, booking_followup_48h,
    automations, languages
  )
  VALUES (
    pixel_id,
    'Sophia',
    'Hey there! Welcome to Pixel Vault Aesthetics ✨ I''m Sophia, your virtual receptionist. I can help you with bookings, treatment info, or pricing. What can I do for you?',
    'warm and friendly',
    'medium',
    'All injectable treatments are performed by MOH-certified doctors. We use only FDA/HSA-approved products. Consultations are complimentary for first-time patients. Located at 123 Orchard Road, #05-01 Orchard Tower, Singapore 238863. Nearest MRT: Orchard (NS22/TE14) — 3 min walk. Parking: Complimentary at ION Orchard (validate at reception).',
    
    -- Services (10 treatments)
    '[
      {"name": "Botox", "price": "$380", "duration": 30, "description": "Reduces fine lines and wrinkles. Results last 3-4 months."},
      {"name": "Dermal Filler", "price": "$680", "duration": 45, "description": "Restores volume and contours. Results last 6-12 months."},
      {"name": "HydraFacial", "price": "$280", "duration": 60, "description": "Deep cleansing, exfoliation and hydration. Instant glow."},
      {"name": "HIFU Face Lift", "price": "$1,280", "duration": 90, "description": "Non-surgical facelift using ultrasound. Results develop over 2-3 months."},
      {"name": "Laser Skin Rejuvenation", "price": "$450", "duration": 45, "description": "Improves skin texture, pores and pigmentation."},
      {"name": "Chemical Peel", "price": "$180", "duration": 30, "description": "Exfoliates dead skin cells for brighter, smoother skin."},
      {"name": "Rejuran Healer", "price": "$880", "duration": 45, "description": "Skin healing and regeneration with salmon DNA. 3 sessions recommended."},
      {"name": "Thread Lift", "price": "$2,500", "duration": 60, "description": "Dissolvable threads lift and tighten sagging skin."},
      {"name": "Microneedling", "price": "$350", "duration": 60, "description": "Collagen induction therapy for acne scars and skin texture."},
      {"name": "PicoSure Laser", "price": "$500", "duration": 45, "description": "Pigmentation removal and skin revitalization."}
    ]'::jsonb,
    
    -- FAQs
    '[
      {"question": "What are your opening hours?", "answer": "Mon–Fri 10am–8pm, Sat 10am–6pm. Closed Sun. Public holidays 11am–4pm."},
      {"question": "Do I need a consultation before treatment?", "answer": "A complimentary consultation is required for all injectable treatments (Botox, fillers, Rejuran, thread lift). Facials, peels, and laser treatments can be booked directly."},
      {"question": "Is there downtime?", "answer": "Most facials have zero downtime. Injectables may have mild redness or swelling for 24-48 hours. Your doctor will advise during consultation."},
      {"question": "How do I prepare for my appointment?", "answer": "Avoid alcohol 24 hours before injectables. Come with clean skin (no makeup). Inform us of any medications or allergies. Arrive 10 minutes early."},
      {"question": "What payment methods do you accept?", "answer": "PayNow, credit/debit cards (Visa, Mastercard, Amex), and cash. Installment plans available for treatments above $1,000 via Atome or Grab PayLater."},
      {"question": "Can I cancel or reschedule?", "answer": "Yes! Reschedule or cancel up to 24 hours before at no charge. Late cancellations (within 24 hours) may incur a $50 fee."},
      {"question": "Are your doctors certified?", "answer": "Yes, all doctors are MOH-certified aesthetic physicians with minimum 5 years of experience. Dr. Amanda Chen (Medical Director) has 15+ years."},
      {"question": "Where are you located?", "answer": "123 Orchard Road, #05-01 Orchard Tower, Singapore 238863. Nearest MRT: Orchard (NS22/TE14) — 3 min walk."}
    ]'::jsonb,
    
    -- Operating Hours
    '[
      {"day": "Monday", "open_time": "10:00", "close_time": "20:00", "isOpen": true},
      {"day": "Tuesday", "open_time": "10:00", "close_time": "20:00", "isOpen": true},
      {"day": "Wednesday", "open_time": "10:00", "close_time": "20:00", "isOpen": true},
      {"day": "Thursday", "open_time": "10:00", "close_time": "20:00", "isOpen": true},
      {"day": "Friday", "open_time": "10:00", "close_time": "20:00", "isOpen": true},
      {"day": "Saturday", "open_time": "10:00", "close_time": "18:00", "isOpen": true},
      {"day": "Sunday", "open_time": "", "close_time": "", "isOpen": false},
      {"day": "Public Holidays", "open_time": "11:00", "close_time": "16:00", "isOpen": true}
    ]'::jsonb,
    
    -- Booking settings
    60,    -- appointment_duration
    15,    -- buffer_time
    12,    -- max_per_day
    '24 hours notice required. Late cancellation (within 24h) incurs $50 fee.',
    false, -- booking_auto_confirm
    'hold_for_approval',
    true,  -- booking_waitlist_enabled
    30,    -- booking_max_advance_days
    4,     -- booking_min_notice_hours
    true,  -- booking_allow_same_day
    true,  -- booking_require_phone
    true,  -- booking_reminder_24h
    true,  -- booking_reminder_1h
    true,  -- booking_followup_48h
    
    -- Automations & languages
    '{"bookingConfirmation": true, "reminder24h": true, "reminder1h": true, "followup48h": true}'::jsonb,
    ARRAY['en']
  )
  ON CONFLICT (client_id) DO UPDATE SET
    agent_name = EXCLUDED.agent_name,
    greeting = EXCLUDED.greeting,
    tone = EXCLUDED.tone,
    enthusiasm = EXCLUDED.enthusiasm,
    special_notes = EXCLUDED.special_notes,
    services = EXCLUDED.services,
    faqs = EXCLUDED.faqs,
    operating_hours = EXCLUDED.operating_hours,
    appointment_duration = EXCLUDED.appointment_duration,
    buffer_time = EXCLUDED.buffer_time,
    max_per_day = EXCLUDED.max_per_day,
    cancellation_policy = EXCLUDED.cancellation_policy,
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
    languages = EXCLUDED.languages,
    updated_at = NOW();

  RAISE NOTICE '✅ Pixel Vault config updated with full demo data';
END $$;

-- ─── STEP 5: SEED DEMO APPOINTMENTS FOR PIXEL VAULT ────────────────────────
DO $$
DECLARE
  pixel_id UUID;
BEGIN
  SELECT id INTO pixel_id FROM clients WHERE slug = 'pixellvault';
  IF pixel_id IS NULL THEN RETURN; END IF;

  -- Clear old test appointments for this clinic
  DELETE FROM appointments WHERE client_id = pixel_id;
  
  INSERT INTO appointments (client_id, customer_name, customer_phone, service, appointment_date, appointment_time, duration, status, notes, created_at)
  VALUES
    (pixel_id, 'Sarah Tan', '+6591234567', 'HydraFacial', (NOW() + INTERVAL '2 days')::date, '14:00', 60, 'confirmed', 'First-time customer, prefers gentle setting', NOW() - INTERVAL '2 days'),
    (pixel_id, 'Michelle Lee', '+6587654321', 'Botox', (NOW() + INTERVAL '5 days')::date, '11:00', 30, 'confirmed', 'Forehead and crow''s feet', NOW() - INTERVAL '3 days'),
    (pixel_id, 'Jennifer Wong', '+6598765432', 'HIFU Face Lift', (NOW() + INTERVAL '7 days')::date, '16:00', 90, 'pending_approval', 'Requested Dr. Amanda', NOW() - INTERVAL '1 day'),
    (pixel_id, 'Karen Lim', '+6512345678', 'Chemical Peel', (NOW() - INTERVAL '1 day')::date, '10:00', 30, 'completed', 'Follow-up in 4 weeks', NOW() - INTERVAL '5 days'),
    (pixel_id, 'Rachel Ng', '+6578901234', 'Dermal Filler', (NOW() + INTERVAL '9 days')::date, '15:00', 45, 'confirmed', 'Lip enhancement', NOW() - INTERVAL '1 day');

  RAISE NOTICE '✅ 5 demo appointments seeded for Pixel Vault';
END $$;

-- ─── STEP 6: SEED DEMO CONVERSATIONS FOR PIXEL VAULT ───────────────────────
DO $$
DECLARE
  pixel_id UUID;
BEGIN
  SELECT id INTO pixel_id FROM clients WHERE slug = 'pixellvault';
  IF pixel_id IS NULL THEN RETURN; END IF;

  -- Clear old test conversations for this clinic
  DELETE FROM conversations WHERE client_id = pixel_id;

  INSERT INTO conversations (client_id, channel, customer_phone, customer_name, message, ai_response, intent, created_at)
  VALUES
    (pixel_id, 'whatsapp', '6591234567', 'Sarah Tan', 'Hi, what are your opening hours?', 'We''re open Mon–Fri 10am–8pm, Sat 10am–6pm, Sun closed. Public holidays 11am–4pm. How can I help?', 'hardcoded:operating_hours', NOW() - INTERVAL '2 days'),
    (pixel_id, 'whatsapp', '6591234567', 'Sarah Tan', 'Can I book a HydraFacial for Tuesday at 2pm?', 'Perfect! Your HydraFacial is booked for Tuesday at 2pm. The clinic will confirm within 30 minutes. See you then!', 'booking', NOW() - INTERVAL '2 days'),
    (pixel_id, 'whatsapp', '6587654321', 'Michelle Lee', 'How much is Botox?', 'Botox is $380 per area. Results last 3-4 months. Would you like to book a consultation or appointment?', 'hardcoded:pricing_specific', NOW() - INTERVAL '3 days'),
    (pixel_id, 'whatsapp', '6598765432', 'Jennifer Wong', 'Do you do HIFU?', 'Yes! HIFU Face Lift is $1,280 per session (90 min). It''s a non-surgical facelift using ultrasound. Results develop over 2-3 months. Would you like to book?', 'hardcoded:service_inquiry', NOW() - INTERVAL '1 day'),
    (pixel_id, 'whatsapp', '6512345678', 'Karen Lim', 'What should I avoid after my peel?', 'Avoid sun exposure, swimming, and heavy exercise for 48 hours. Use SPF 50+ daily. Your skin may peel for 2-3 days — this is normal!', 'hardcoded:faq_aftercare', NOW() - INTERVAL '4 days'),
    (pixel_id, 'whatsapp', '6578901234', 'Rachel Ng', 'Can I reschedule my Saturday appointment to next week?', 'No problem! I can help you reschedule. What day and time works for you next week?', 'hardcoded:reschedule', NOW() - INTERVAL '1 day');

  RAISE NOTICE '✅ 6 demo conversations seeded for Pixel Vault';
END $$;

-- ─── STEP 7: SEED DEMO WAITLIST FOR PIXEL VAULT ────────────────────────────
DO $$
DECLARE
  pixel_id UUID;
BEGIN
  SELECT id INTO pixel_id FROM clients WHERE slug = 'pixellvault';
  IF pixel_id IS NULL THEN RETURN; END IF;

  DELETE FROM waitlist WHERE client_id = pixel_id;

  INSERT INTO waitlist (client_id, customer_name, customer_phone, preferred_service, preferred_date, preferred_time_range, status, notes, created_at)
  VALUES
    (pixel_id, 'Angela Goh', '+6511122233', 'Thread Lift', (NOW() + INTERVAL '12 days')::date, 'afternoon', 'active', 'Flexible on date', NOW() - INTERVAL '1 day'),
    (pixel_id, 'Cindy Ong', '+6522233344', 'PicoSure Laser', (NOW() + INTERVAL '5 days')::date, 'morning', 'notified', 'Called back, awaiting confirmation', NOW() - INTERVAL '2 days');

  RAISE NOTICE '✅ 2 waitlist entries seeded for Pixel Vault';
END $$;

-- ─── STEP 8: FIX SLUG — pixellvault → pixelvault ───────────────────────────
-- ⚠️  IMPACT: This changes the webhook URL from ?clinic_id=pixellvault to ?clinic_id=pixelvault
--     You must update the 360dialog webhook configuration after this!
DO $$
DECLARE
  old_slug TEXT := 'pixellvault';
  new_slug TEXT := 'pixelvault';
  pixel_id UUID;
BEGIN
  SELECT id INTO pixel_id FROM clients WHERE slug = old_slug;
  
  IF pixel_id IS NULL THEN
    RAISE NOTICE 'ℹ️ pixellvault not found — checking if already pixelvault';
    SELECT id INTO pixel_id FROM clients WHERE slug = new_slug;
    IF pixel_id IS NOT NULL THEN
      RAISE NOTICE '✅ Slug already fixed: pixelvault';
    END IF;
    RETURN;
  END IF;

  -- Check if pixelvault slug already exists (would cause conflict)
  IF EXISTS (SELECT 1 FROM clients WHERE slug = new_slug AND id != pixel_id) THEN
    RAISE NOTICE '❌ Cannot rename: slug "pixelvault" already exists on another clinic';
    RETURN;
  END IF;

  -- Update the slug
  UPDATE clients SET slug = new_slug, updated_at = NOW() WHERE id = pixel_id;
  
  RAISE NOTICE '✅ Slug updated: pixellvault → pixelvault';
  RAISE NOTICE '⚠️  ACTION REQUIRED: Update 360dialog webhook URL from ?clinic_id=pixellvault to ?clinic_id=pixelvault';
END $$;

-- ─── STEP 9: VERIFY FINAL STATE ────────────────────────────────────────────
SELECT '=== AFTER CLEANUP ===' as section;
SELECT id, slug, name, status, whatsapp_number, contact_email, google_calendar_id 
FROM clients ORDER BY slug;

SELECT '=== PIXEL VAULT CONFIG ===' as section;
SELECT 
  c.slug,
  c.name,
  cc.agent_name,
  cc.tone,
  jsonb_array_length(cc.services) as num_services,
  jsonb_array_length(cc.faqs) as num_faqs,
  jsonb_array_length(cc.operating_hours) as num_hours_entries,
  cc.booking_auto_confirm,
  cc.booking_waitlist_enabled
FROM clients c
JOIN client_configs cc ON cc.client_id = c.id
WHERE c.slug = 'pixelvault';

SELECT '=== PIXEL VAULT DATA COUNTS ===' as section;
SELECT 
  (SELECT COUNT(*) FROM appointments WHERE client_id = (SELECT id FROM clients WHERE slug = 'pixelvault')) as appointments,
  (SELECT COUNT(*) FROM conversations WHERE client_id = (SELECT id FROM clients WHERE slug = 'pixelvault')) as conversations,
  (SELECT COUNT(*) FROM waitlist WHERE client_id = (SELECT id FROM clients WHERE slug = 'pixelvault')) as waitlist;

-- ─── STEP 10: SUMMARY ──────────────────────────────────────────────────────
SELECT '=== MIGRATION COMPLETE ===' as section;