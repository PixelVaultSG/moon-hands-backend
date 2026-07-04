-- Moon Hands — Test Clinic Mock Dataset
-- Run this in Supabase SQL Editor to seed Pixel Vault Aesthetics test data
-- IMPORTANT: If clinic already exists, this updates it. If not, it creates it.
-- Run the SELECT at the bottom to verify data was inserted.

-- ─── 0. CLEAN UP EXISTING TEST DATA (optional — comment out if you want to keep old data) ───
-- DELETE FROM waitlist WHERE client_id = '2fddc796-6ea3-4030-824f-77cf2cadb4a2';
-- DELETE FROM conversations WHERE client_id = '2fddc796-6ea3-4030-824f-77cf2cadb4a2';
-- DELETE FROM appointments WHERE client_id = '2fddc796-6ea3-4030-824f-77cf2cadb4a2';
-- DELETE FROM client_configs WHERE client_id = '2fddc796-6ea3-4030-824f-77cf2cadb4a2';
-- DELETE FROM clients WHERE id = '2fddc796-6ea3-4030-824f-77cf2cadb4a2';

-- ─── 1. INSERT/UPDATE CLIENT ───
-- First check if the clinic already exists
DO $$
BEGIN
  -- Try to update existing clinic
  UPDATE clients SET
    name = 'Pixel Vault Aesthetics',
    slug = 'pixelvault',
    phone = '+65 6123 4567',
    whatsapp_number = '+65 8139 8272',
    email = 'hello@pixelvault.sg',
    website = 'https://pixelvault.sg',
    address = '123 Orchard Road, #05-01 Orchard Tower, Singapore 238863',
    nearest_mrt = 'Orchard MRT (NS22/TE14) — 3 min walk',
    landmarks = 'ION Orchard, Wisma Atria, Ngee Ann City',
    parking_info = 'Complimentary parking at ION Orchard (validate at reception)',
    google_calendar_id = 'pixelvaultsg@gmail.com',
    status = 'active'
  WHERE id = '2fddc796-6ea3-4030-824f-77cf2cadb4a2';

  -- If no rows updated, insert new clinic
  IF NOT FOUND THEN
    INSERT INTO clients (
      id, name, slug, phone, whatsapp_number, email, website,
      address, nearest_mrt, landmarks, parking_info,
      google_calendar_id, status, webhook_token, created_at
    ) VALUES (
      '2fddc796-6ea3-4030-824f-77cf2cadb4a2',
      'Pixel Vault Aesthetics',
      'pixelvault',
      '+65 6123 4567',
      '+65 8139 8272',
      'hello@pixelvault.sg',
      'https://pixelvault.sg',
      '123 Orchard Road, #05-01 Orchard Tower, Singapore 238863',
      'Orchard MRT (NS22/TE14) — 3 min walk',
      'ION Orchard, Wisma Atria, Ngee Ann City',
      'Complimentary parking at ION Orchard (validate at reception)',
      'pixelvaultsg@gmail.com',
      'active',
      encode(gen_random_bytes(24), 'hex'),
      NOW()
    );
  END IF;
END $$;

-- ─── 2. INSERT/UPDATE CLIENT CONFIG ───
DO $$
BEGIN
  UPDATE client_configs SET config = '{
    "agent_name": "Sophia",
    "tone": "Warm, friendly, and professional",
    "greeting": "Hey there! Welcome to Pixel Vault Aesthetics ✨ I'm Sophia, your virtual receptionist. I can help you with bookings, treatment info, or pricing. What can I do for you?",
    "special_notes": "All injectable treatments are performed by MOH-certified doctors. We use only FDA/HSA-approved products. Consultations are complimentary for first-time patients.",
    "operating_hours": [
      {"day": "Monday", "open_time": "10:00", "close_time": "20:00", "isOpen": true},
      {"day": "Tuesday", "open_time": "10:00", "close_time": "20:00", "isOpen": true},
      {"day": "Wednesday", "open_time": "10:00", "close_time": "20:00", "isOpen": true},
      {"day": "Thursday", "open_time": "10:00", "close_time": "20:00", "isOpen": true},
      {"day": "Friday", "open_time": "10:00", "close_time": "20:00", "isOpen": true},
      {"day": "Saturday", "open_time": "10:00", "close_time": "18:00", "isOpen": true},
      {"day": "Sunday", "open_time": null, "close_time": null, "isOpen": false},
      {"day": "Public Holidays", "open_time": "11:00", "close_time": "16:00", "isOpen": true}
    ],
    "services": [
      {"name": "Botox", "price": "380", "price_unit": "area", "duration": "30min", "description": "Reduces fine lines and wrinkles. Results last 3-4 months.", "category": "Injectables"},
      {"name": "Dermal Filler", "price": "680", "price_unit": "syringe", "duration": "45min", "description": "Restores volume and contours. Results last 6-12 months.", "category": "Injectables"},
      {"name": "HydraFacial", "price": "280", "price_unit": "session", "duration": "60min", "description": "Deep cleansing, exfoliation and hydration. Instant glow.", "category": "Facials"},
      {"name": "HIFU Face Lift", "price": "1280", "price_unit": "session", "duration": "90min", "description": "Non-surgical facelift using ultrasound. Results develop over 2-3 months.", "category": "Lifting"},
      {"name": "Laser Skin Rejuvenation", "price": "450", "price_unit": "session", "duration": "45min", "description": "Improves skin texture, pores and pigmentation.", "category": "Laser"},
      {"name": "Chemical Peel", "price": "180", "price_unit": "session", "duration": "30min", "description": "Exfoliates dead skin cells for brighter, smoother skin.", "category": "Facials"},
      {"name": "Rejuran Healer", "price": "880", "price_unit": "session", "duration": "45min", "description": "Skin healing and regeneration with salmon DNA. 3 sessions recommended.", "category": "Injectables"},
      {"name": "Thread Lift", "price": "2500", "price_unit": "full face", "duration": "60min", "description": "Dissolvable threads lift and tighten sagging skin.", "category": "Lifting"},
      {"name": "Microneedling", "price": "350", "price_unit": "session", "duration": "60min", "description": "Collagen induction therapy for acne scars and skin texture.", "category": "Facials"},
      {"name": "PicoSure Laser", "price": "500", "price_unit": "session", "duration": "45min", "description": "Pigmentation removal and skin revitalization.", "category": "Laser"}
    ],
    "service_categories": [
      {"id": "Injectables", "name": "Injectables"},
      {"id": "Facials", "name": "Facials & Peels"},
      {"id": "Lifting", "name": "Lifting & Tightening"},
      {"id": "Laser", "name": "Laser Treatments"}
    ],
    "faqs": [
      {"question": "Do I need a consultation before treatment?", "answer": "A complimentary consultation is required for all injectable treatments. Facials, peels, and laser treatments can be booked directly."},
      {"question": "Is there downtime?", "answer": "Most facials have zero downtime. Injectables may have mild redness or swelling for 24-48 hours. Your doctor will advise during consultation."},
      {"question": "How do I prepare for my appointment?", "answer": "Avoid alcohol 24 hours before injectables. Come with clean skin (no makeup). Inform us of any medications or allergies. Arrive 10 minutes early."},
      {"question": "What payment methods do you accept?", "answer": "We accept PayNow, credit/debit cards, and cash. Installment plans available for treatments above $1,000 via Atome or Grab PayLater."},
      {"question": "Can I cancel or reschedule?", "answer": "Yes! Reschedule or cancel up to 24 hours before at no charge. Late cancellations (within 24 hours) may incur a $50 fee."},
      {"question": "Are your doctors certified?", "answer": "Yes, all doctors are MOH-certified aesthetic physicians with minimum 5 years of experience."}
    ],
    "doctors": [
      {"name": "Dr. Amanda Chen", "role": "Medical Director", "qualifications": "MBBS (Singapore), MRCP (UK)", "experience": "15+ years", "specialties": "Injectables, thread lifts, laser treatments", "languages": "English, Mandarin"},
      {"name": "Dr. James Lim", "role": "Aesthetic Physician", "qualifications": "MBBS (Singapore)", "experience": "8 years", "specialties": "HIFU, skin rejuvenation, acne treatments", "languages": "English, Malay"}
    ],
    "booking_auto_confirm": false,
    "booking_after_hours_action": "hold_for_approval",
    "booking_waitlist_enabled": true,
    "booking_max_advance_days": 30,
    "booking_min_notice_hours": 4,
    "booking_allow_same_day": true,
    "booking_require_phone": true,
    "booking_buffer_minutes": 15,
    "booking_reminder_24h": true,
    "booking_reminder_1h": true,
    "booking_followup_48h": true
  }'::jsonb
  WHERE client_id = '2fddc796-6ea3-4030-824f-77cf2cadb4a2';

  IF NOT FOUND THEN
    INSERT INTO client_configs (client_id, config) VALUES (
      '2fddc796-6ea3-4030-824f-77cf2cadb4a2',
      '{
        "agent_name": "Sophia",
        "tone": "Warm, friendly, and professional",
        "greeting": "Hey there! Welcome to Pixel Vault Aesthetics ✨ I'm Sophia, your virtual receptionist. I can help you with bookings, treatment info, or pricing. What can I do for you?",
        "special_notes": "All injectable treatments are performed by MOH-certified doctors. We use only FDA/HSA-approved products. Consultations are complimentary for first-time patients.",
        "operating_hours": [
          {"day": "Monday", "open_time": "10:00", "close_time": "20:00", "isOpen": true},
          {"day": "Tuesday", "open_time": "10:00", "close_time": "20:00", "isOpen": true},
          {"day": "Wednesday", "open_time": "10:00", "close_time": "20:00", "isOpen": true},
          {"day": "Thursday", "open_time": "10:00", "close_time": "20:00", "isOpen": true},
          {"day": "Friday", "open_time": "10:00", "close_time": "20:00", "isOpen": true},
          {"day": "Saturday", "open_time": "10:00", "close_time": "18:00", "isOpen": true},
          {"day": "Sunday", "open_time": null, "close_time": null, "isOpen": false},
          {"day": "Public Holidays", "open_time": "11:00", "close_time": "16:00", "isOpen": true}
        ],
        "services": [
          {"name": "Botox", "price": "380", "price_unit": "area", "duration": "30min", "description": "Reduces fine lines and wrinkles. Results last 3-4 months.", "category": "Injectables"},
          {"name": "Dermal Filler", "price": "680", "price_unit": "syringe", "duration": "45min", "description": "Restores volume and contours. Results last 6-12 months.", "category": "Injectables"},
          {"name": "HydraFacial", "price": "280", "price_unit": "session", "duration": "60min", "description": "Deep cleansing, exfoliation and hydration. Instant glow.", "category": "Facials"},
          {"name": "HIFU Face Lift", "price": "1280", "price_unit": "session", "duration": "90min", "description": "Non-surgical facelift using ultrasound. Results develop over 2-3 months.", "category": "Lifting"},
          {"name": "Laser Skin Rejuvenation", "price": "450", "price_unit": "session", "duration": "45min", "description": "Improves skin texture, pores and pigmentation.", "category": "Laser"},
          {"name": "Chemical Peel", "price": "180", "price_unit": "session", "duration": "30min", "description": "Exfoliates dead skin cells for brighter, smoother skin.", "category": "Facials"},
          {"name": "Rejuran Healer", "price": "880", "price_unit": "session", "duration": "45min", "description": "Skin healing and regeneration with salmon DNA. 3 sessions recommended.", "category": "Injectables"},
          {"name": "Thread Lift", "price": "2500", "price_unit": "full face", "duration": "60min", "description": "Dissolvable threads lift and tighten sagging skin.", "category": "Lifting"},
          {"name": "Microneedling", "price": "350", "price_unit": "session", "duration": "60min", "description": "Collagen induction therapy for acne scars and skin texture.", "category": "Facials"},
          {"name": "PicoSure Laser", "price": "500", "price_unit": "session", "duration": "45min", "description": "Pigmentation removal and skin revitalization.", "category": "Laser"}
        ],
        "service_categories": [
          {"id": "Injectables", "name": "Injectables"},
          {"id": "Facials", "name": "Facials & Peels"},
          {"id": "Lifting", "name": "Lifting & Tightening"},
          {"id": "Laser", "name": "Laser Treatments"}
        ],
        "faqs": [
          {"question": "Do I need a consultation before treatment?", "answer": "A complimentary consultation is required for all injectable treatments. Facials, peels, and laser treatments can be booked directly."},
          {"question": "Is there downtime?", "answer": "Most facials have zero downtime. Injectables may have mild redness or swelling for 24-48 hours. Your doctor will advise during consultation."},
          {"question": "How do I prepare for my appointment?", "answer": "Avoid alcohol 24 hours before injectables. Come with clean skin (no makeup). Inform us of any medications or allergies. Arrive 10 minutes early."},
          {"question": "What payment methods do you accept?", "answer": "We accept PayNow, credit/debit cards, and cash. Installment plans available for treatments above $1,000 via Atome or Grab PayLater."},
          {"question": "Can I cancel or reschedule?", "answer": "Yes! Reschedule or cancel up to 24 hours before at no charge. Late cancellations (within 24 hours) may incur a $50 fee."},
          {"question": "Are your doctors certified?", "answer": "Yes, all doctors are MOH-certified aesthetic physicians with minimum 5 years of experience."}
        ],
        "doctors": [
          {"name": "Dr. Amanda Chen", "role": "Medical Director", "qualifications": "MBBS (Singapore), MRCP (UK)", "experience": "15+ years", "specialties": "Injectables, thread lifts, laser treatments", "languages": "English, Mandarin"},
          {"name": "Dr. James Lim", "role": "Aesthetic Physician", "qualifications": "MBBS (Singapore)", "experience": "8 years", "specialties": "HIFU, skin rejuvenation, acne treatments", "languages": "English, Malay"}
        ],
        "booking_auto_confirm": false,
        "booking_after_hours_action": "hold_for_approval",
        "booking_waitlist_enabled": true,
        "booking_max_advance_days": 30,
        "booking_min_notice_hours": 4,
        "booking_allow_same_day": true,
        "booking_require_phone": true,
        "booking_buffer_minutes": 15,
        "booking_reminder_24h": true,
        "booking_reminder_1h": true,
        "booking_followup_48h": true
      }'::jsonb
    );
  END IF;
END $$;

-- ─── 3. MOCK APPOINTMENTS ───
INSERT INTO appointments (client_id, customer_name, customer_phone, service, appointment_date, appointment_time, status, notes, created_at) VALUES
  ('2fddc796-6ea3-4030-824f-77cf2cadb4a2', 'Sarah Tan', '6591234567', 'HydraFacial', '2026-07-05', '14:00', 'confirmed', 'First-time customer, prefers gentle setting', NOW() - INTERVAL '2 days'),
  ('2fddc796-6ea3-4030-824f-77cf2cadb4a2', 'Michelle Lee', '6587654321', 'Botox', '2026-07-08', '11:00', 'confirmed', 'Forehead and crow''s feet', NOW() - INTERVAL '3 days'),
  ('2fddc796-6ea3-4030-824f-77cf2cadb4a2', 'Jennifer Wong', '6598765432', 'HIFU Face Lift', '2026-07-10', '16:00', 'pending_approval', 'Requested Dr. Amanda', NOW() - INTERVAL '1 day'),
  ('2fddc796-6ea3-4030-824f-77cf2cadb4a2', 'Karen Lim', '6512345678', 'Chemical Peel', '2026-07-03', '10:00', 'completed', 'Follow-up in 4 weeks', NOW() - INTERVAL '5 days'),
  ('2fddc796-6ea3-4030-824f-77cf2cadb4a2', 'Rachel Ng', '6578901234', 'Dermal Filler', '2026-07-12', '15:00', 'confirmed', 'Lip enhancement', NOW() - INTERVAL '1 day')
ON CONFLICT DO NOTHING;

-- ─── 4. MOCK CONVERSATIONS ───
INSERT INTO conversations (client_id, channel, customer_phone, customer_name, message, ai_response, intent, created_at) VALUES
  ('2fddc796-6ea3-4030-824f-77cf2cadb4a2', 'whatsapp', '6591234567', 'Sarah Tan', 'Hi, what are your opening hours?', 'We''re open Mon-Fri 10am-8pm, Sat 10am-6pm, Sun closed. Public holidays 11am-4pm. Would you like to check availability?', 'hardcoded:operating_hours', NOW() - INTERVAL '2 days'),
  ('2fddc796-6ea3-4030-824f-77cf2cadb4a2', 'whatsapp', '6591234567', 'Sarah Tan', 'Can I book a HydraFacial for next Tuesday at 2pm?', 'Perfect! I''ve booked your HydraFacial for Tuesday at 2pm. The clinic will confirm within 30 minutes. See you then!', 'booking', NOW() - INTERVAL '2 days'),
  ('2fddc796-6ea3-4030-824f-77cf2cadb4a2', 'whatsapp', '6587654321', 'Michelle Lee', 'How much is Botox?', 'Botox is $380 per area. Results last 3-4 months. Would you like to book a consultation or appointment?', 'hardcoded:pricing_specific', NOW() - INTERVAL '3 days'),
  ('2fddc796-6ea3-4030-824f-77cf2cadb4a2', 'whatsapp', '6598765432', 'Jennifer Wong', 'Do you do HIFU?', 'Yes! HIFU Face Lift is $1,280 per session (90 min). It''s a non-surgical facelift using ultrasound. Results develop over 2-3 months. Would you like to book?', 'hardcoded:service_inquiry', NOW() - INTERVAL '1 day');

-- ─── 5. MOCK WAITLIST ───
INSERT INTO waitlist (client_id, customer_name, customer_phone, preferred_service, preferred_date, preferred_time_range, status, notes, created_at) VALUES
  ('2fddc796-6ea3-4030-824f-77cf2cadb4a2', 'Angela Goh', '6511122233', 'Thread Lift', '2026-07-15', 'afternoon', 'active', 'Flexible on date', NOW() - INTERVAL '1 day'),
  ('2fddc796-6ea3-4030-824f-77cf2cadb4a2', 'Cindy Ong', '6522233344', 'PicoSure Laser', '2026-07-08', 'morning', 'notified', 'Called back, awaiting confirmation', NOW() - INTERVAL '2 days');

-- ─── 6. VERIFY SEED ───
SELECT 'Clients seeded: ' || COUNT(*)::text as result FROM clients WHERE slug = 'pixelvault'
UNION ALL
SELECT 'Configs seeded: ' || COUNT(*)::text FROM client_configs WHERE client_id = '2fddc796-6ea3-4030-824f-77cf2cadb4a2'
UNION ALL
SELECT 'Appointments seeded: ' || COUNT(*)::text FROM appointments WHERE client_id = '2fddc796-6ea3-4030-824f-77cf2cadb4a2'
UNION ALL
SELECT 'Conversations seeded: ' || COUNT(*)::text FROM conversations WHERE client_id = '2fddc796-6ea3-4030-824f-77cf2cadb4a2'
UNION ALL
SELECT 'Waitlist seeded: ' || COUNT(*)::text FROM waitlist WHERE client_id = '2fddc796-6ea3-4030-824f-77cf2cadb4a2';