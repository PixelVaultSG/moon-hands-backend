-- Migration 006: End-to-End Test Data for Glow Aesthetics & Pixel Vault Pte Ltd
-- Run AFTER migration 005 in Supabase SQL Editor

-- ============================================================
-- PART 1: CLIENTS (Correct columns per actual schema)
-- ============================================================

INSERT INTO clients (
  slug, name, contact_name, contact_email, contact_phone,
  whatsapp_number, plan, status, industry, webhook_token, created_at, updated_at
)
VALUES 
  ('glow-aesthetics', 'Glow Aesthetics Clinic', 'Dr. Rachel Lim', 'hello@glowclinic.sg', '+6581234567', '+6581234567', 'premium', 'active', 'aesthetic', 'glow_test_token_123', NOW() - INTERVAL '30 days', NOW()),
  ('glow-demo', 'Glow Aesthetics Clinic', 'Dr. Rachel Lim', 'hello@glowclinic.sg', '+6581234567', '+6581234567', 'premium', 'active', 'aesthetic', 'glow_test_token_456', NOW() - INTERVAL '30 days', NOW())
ON CONFLICT (slug) DO NOTHING;

-- Note: pixellvault already exists from setup-pixellvault.sql
-- Just ensure it exists
SELECT id FROM clients WHERE slug = 'pixellvault';

-- ============================================================
-- PART 2: CLIENT CONFIGS (Services, FAQs, Hours, Brand Voice)
-- ============================================================

-- Glow Aesthetics — full config
INSERT INTO client_configs (
  client_id, agent_name, greeting, tone, enthusiasm,
  services, faqs, operating_hours, special_notes
)
SELECT
  id,
  'Glow',
  'Hello and welcome to Glow Aesthetics! I am Glow, your AI assistant. How can I help you look and feel your best today?',
  'warm and professional',
  'medium',
  '[
    {"name": "HIFU Face Lift", "price": "$580", "duration": 90, "description": "Non-surgical face lift using High-Intensity Focused Ultrasound"},
    {"name": "HIFU Double Chin", "price": "$350", "duration": 60, "description": "Targeted HIFU for double chin reduction"},
    {"name": "PicoSure Laser", "price": "$450", "duration": 60, "description": "Pico-second laser for pigmentation and tattoo removal"},
    {"name": "Chemical Peel (Light)", "price": "$180", "duration": 45, "description": "Gentle exfoliation for brighter skin"},
    {"name": "Chemical Peel (Deep)", "price": "$350", "duration": 60, "description": "Intensive peel for acne scars and deep pigmentation"},
    {"name": "HydraFacial", "price": "$250", "duration": 60, "description": "Deep cleansing, exfoliation and hydration"},
    {"name": "Botox (3 areas)", "price": "$680", "duration": 30, "description": "Forehead, frown lines and crow feet"},
    {"name": "Dermal Fillers (1ml)", "price": "$850", "duration": 45, "description": "Juvederm or Restylane for lips, cheeks or nasolabial folds"},
    {"name": "Thermage FLX", "price": "$2,800", "duration": 120, "description": "Radiofrequency skin tightening for face and neck"},
    {"name": "Acne Scar Subcision", "price": "$350", "duration": 60, "description": "Needle technique to release tethered scars"}
  ]'::jsonb,
  '[
    {"question": "What are your opening hours?", "answer": "We are open Monday to Friday 10 AM to 8 PM, Saturday 10 AM to 6 PM. Closed on Sundays and public holidays."},
    {"question": "Do you offer free consultation?", "answer": "Yes, we offer a complimentary 15-minute consultation with our doctor. You can book it through WhatsApp or call us."},
    {"question": "Is there parking available?", "answer": "Yes, we have complimentary parking at the rear of the building. Just drive to the back and look for Glow Aesthetics reserved lots."},
    {"question": "How do I prepare for HIFU?", "answer": "Avoid alcohol 24 hours before. Come with a clean face, no makeup. The procedure takes 60-90 minutes and there is no downtime."},
    {"question": "What payment methods do you accept?", "answer": "We accept PayNow, credit cards (Visa, Mastercard, Amex), and instalment plans via Atome or Grab PayLater."},
    {"question": "Is there any downtime after treatment?", "answer": "Most treatments have minimal to no downtime. HIFU may cause slight redness for a few hours. Chemical peels may have 2-3 days of peeling. We will advise you during consultation."},
    {"question": "Do you have package deals?", "answer": "Yes! Our Glow package includes 3 HIFU sessions at $1,500 (save $240). Our Bright Skin package includes 6 HydraFacials at $1,200 (save $300). Ask us for more details."}
  ]'::jsonb,
  '[
    {"day": "Monday", "open_time": "10:00", "close_time": "20:00", "isOpen": true},
    {"day": "Tuesday", "open_time": "10:00", "close_time": "20:00", "isOpen": true},
    {"day": "Wednesday", "open_time": "10:00", "close_time": "20:00", "isOpen": true},
    {"day": "Thursday", "open_time": "10:00", "close_time": "20:00", "isOpen": true},
    {"day": "Friday", "open_time": "10:00", "close_time": "20:00", "isOpen": true},
    {"day": "Saturday", "open_time": "10:00", "close_time": "18:00", "isOpen": true},
    {"day": "Sunday", "open_time": "", "close_time": "", "isOpen": false}
  ]'::jsonb,
  'Doctor is Dr. Rachel Lim (MBBS, Dip Dermatology). Clinic established 2019. Located at 123 Orchard Road, #05-01 Singapore 238863. Emergency contact: +65 8123 4567.'
FROM clients c
WHERE c.slug = 'glow-aesthetics'
AND NOT EXISTS (SELECT 1 FROM client_configs cc WHERE cc.client_id = c.id);

-- Update pixellvault config if not exists
INSERT INTO client_configs (
  client_id, agent_name, greeting, tone, enthusiasm,
  services, faqs, operating_hours, special_notes
)
SELECT
  id,
  'Pixel',
  'Welcome to Pixel Vault! I am Pixel, your AI assistant. How may I help you today?',
  'professional and friendly',
  'medium',
  '[
    {"name": "HIFU Full Face", "price": "$550", "duration": 90, "description": "Full face HIFU treatment"},
    {"name": "HIFU Half Face", "price": "$350", "duration": 60, "description": "Upper or lower face only"},
    {"name": "Laser Toning", "price": "$280", "duration": 45, "description": "Laser for brightening and pigmentation"},
    {"name": "BB Glow Facial", "price": "$200", "duration": 60, "description": "Semi-permanent BB cream infusion"},
    {"name": "Skin Booster Injection", "price": "$500", "duration": 45, "description": "Rejuran or Volite for skin hydration"}
  ]'::jsonb,
  '[
    {"question": "What are your operating hours?", "answer": "Monday to Saturday, 10:30 AM to 7 PM. Closed on Sundays."},
    {"question": "Do you have free consultation?", "answer": "Yes, complimentary consultation available. Book via WhatsApp."},
    {"question": "Where are you located?", "answer": "We are at Novena Medical Centre, #08-12, 38 Irrawaddy Road, Singapore 329563. Nearest MRT: Novena (NS20)."}
  ]'::jsonb,
  '[
    {"day": "Monday", "open_time": "10:30", "close_time": "19:00", "isOpen": true},
    {"day": "Tuesday", "open_time": "10:30", "close_time": "19:00", "isOpen": true},
    {"day": "Wednesday", "open_time": "10:30", "close_time": "19:00", "isOpen": true},
    {"day": "Thursday", "open_time": "10:30", "close_time": "19:00", "isOpen": true},
    {"day": "Friday", "open_time": "10:30", "close_time": "19:00", "isOpen": true},
    {"day": "Saturday", "open_time": "10:30", "close_time": "17:00", "isOpen": true},
    {"day": "Sunday", "open_time": "", "close_time": "", "isOpen": false}
  ]'::jsonb,
  'Located at Novena Medical Centre #08-12. Doctor: Dr. Kenneth Thean. Contact: +65 8139 8272.'
FROM clients c
WHERE c.slug = 'pixellvault'
AND NOT EXISTS (SELECT 1 FROM client_configs cc WHERE cc.client_id = c.id);

-- ============================================================
-- PART 3: CONVERSATIONS
-- ============================================================

INSERT INTO conversations (client_id, channel, customer_phone, customer_name, message, ai_response, intent, created_at)
SELECT c.id, 'whatsapp', msg.p, msg.n, msg.m, msg.r, msg.i,
  NOW() - make_interval(days => msg.d::int, hours => msg.h::int)
FROM clients c,
(VALUES
  ('+6591230001', 'Sarah', 'Hi, what is HIFU?', 'Hello! HIFU stands for High-Intensity Focused Ultrasound. It is a non-surgical face lift treatment that uses ultrasound energy to lift and tighten skin. We offer HIFU Face Lift at $580 (90 mins) and HIFU Double Chin at $350 (60 mins). Would you like to book a consultation?', 'service_inquiry', '2', '10'),
  ('+6591230001', 'Sarah', 'Does it hurt?', 'Most patients describe HIFU as a warm, tingling sensation with mild discomfort. We apply numbing cream beforehand to keep you comfortable. There is no downtime, so you can return to normal activities immediately. Would you like to book?', 'service_inquiry', '2', '10'),
  ('+6591230001', 'Sarah', 'Okay book me for Saturday 2pm', 'I have booked your HIFU Face Lift consultation for Saturday at 2:00 PM. You will receive a confirmation message shortly. Please arrive 10 minutes early.', 'book_appointment', '2', '10'),
  ('+6591230002', 'Jessica', 'How much is Botox?', 'Our Botox treatment covers 3 areas (forehead, frown lines, crow feet) at $680. The procedure takes about 30 minutes and results last 4-6 months. Would you like to know more or book a consultation?', 'pricing', '3', '14'),
  ('+6591230003', 'Michelle', 'What time do you close today?', 'We are open until 8:00 PM today. Our last appointment slot is at 6:30 PM. Would you like to check availability?', 'hours', '1', '16'),
  ('+6591230004', 'Amanda', 'I want to do something for my acne scars', 'For acne scars, we recommend our Acne Scar Subcision at $350 (60 mins) or Chemical Peel (Deep) at $350 (60 mins). The best option depends on your scar type. Would you like to book a complimentary consultation with Dr. Rachel?', 'service_inquiry', '1', '11'),
  ('+6591230005', 'Karen', 'Do you have parking?', 'Yes, we have complimentary parking at the rear of the building. Just drive to the back and look for Glow Aesthetics reserved lots.', 'faq', '4', '9'),
  ('+6591230006', 'Rachel', 'Is HIFU safe for pregnant women?', 'HIFU is not recommended during pregnancy or breastfeeding as a precaution. We would be happy to schedule your treatment for after your pregnancy. Is there anything else I can help with?', 'service_inquiry', '5', '13'),
  ('+6591230007', 'Nicole', 'Book HydraFacial tomorrow 3pm', 'I have checked our availability and we have a slot for HydraFacial tomorrow at 3:00 PM. May I have your name to confirm the booking?', 'book_appointment', '0', '18'),
  ('+6591230008', 'Stephanie', 'How long does Thermage last?', 'Thermage FLX results typically last 1-2 years as it stimulates collagen production. The treatment is $2,800 for 120 minutes. Many patients pair it with annual maintenance HIFU sessions. Would you like to discuss a treatment plan?', 'service_inquiry', '2', '15'),
  ('+6591230009', 'Patricia', 'Do you offer packages?', 'Yes! Our Glow package includes 3 HIFU sessions at $1,500 (save $240). Our Bright Skin package includes 6 HydraFacials at $1,200 (save $300). We also offer custom packages. Which treatments are you interested in?', 'pricing', '3', '12'),
  ('+6591230010', 'Linda', 'What are the side effects of chemical peel?', 'Light peel: mild redness and peeling for 2-3 days. Deep peel: more noticeable peeling for 5-7 days. You must avoid sun exposure and use SPF 50+ after treatment. We will give you a full aftercare guide.', 'service_inquiry', '6', '20'),
  ('+6591230011', 'Sharon', 'Can I cancel my Saturday appointment?', 'I can help you cancel. To confirm, you want to cancel your Saturday appointment. Once cancelled, the slot will be released. Would you like me to proceed?', 'cancel', '1', '9'),
  ('+6591230012', 'Emily', 'Are you open on Sunday?', 'We are closed on Sundays. Our hours are Monday to Friday 10 AM to 8 PM, Saturday 10 AM to 6 PM. Would you like to book for Saturday or next week?', 'hours', '0', '19')
) AS msg(p, n, m, r, i, d, h)
WHERE c.slug = 'glow-aesthetics';

-- Pixel Vault conversations
INSERT INTO conversations (client_id, channel, customer_phone, customer_name, message, ai_response, intent, created_at)
SELECT c.id, 'whatsapp', msg.p, msg.n, msg.m, msg.r, msg.i,
  NOW() - make_interval(days => msg.d::int, hours => msg.h::int)
FROM clients c,
(VALUES
  ('+6598120001', 'Benjamin', 'Hi, what services do you offer?', 'Welcome to Pixel Vault! We offer HIFU, Laser Toning, BB Glow Facial, and Skin Booster Injections. Our most popular is HIFU Full Face at $550. Would you like details on any specific treatment?', 'service_inquiry', '1', '11'),
  ('+6598120002', 'Catherine', 'How much is laser toning?', 'Laser Toning is $280 for a 45-minute session. It is excellent for brightening and pigmentation. Most patients see results after 3-5 sessions. Would you like to book?', 'pricing', '2', '14'),
  ('+6598120003', 'Daniel', 'Where is your clinic?', 'We are at Novena Medical Centre, #08-12, 38 Irrawaddy Road, Singapore 329563. Nearest MRT: Novena (NS20). We are on the 8th floor.', 'faq', '3', '9'),
  ('+6598120004', 'Emily', 'Book HIFU for next Tuesday 11am', 'I have checked and Tuesday 11:00 AM is available for HIFU. May I have your name to confirm the booking?', 'book_appointment', '0', '16'),
  ('+6598120005', 'Fiona', 'What is BB Glow?', 'BB Glow is a semi-permanent BB cream infusion treatment at $200 (60 mins). It gives you a natural, glowing complexion that lasts 3-6 months. Great for uneven skin tone. Would you like to try it?', 'service_inquiry', '4', '13'),
  ('+6598120006', 'George', 'Is the doctor experienced?', 'Yes, Dr. Kenneth Thean is our lead physician. He has over 15 years of experience in aesthetic medicine and is a certified trainer for HIFU and laser treatments.', 'service_inquiry', '5', '10'),
  ('+6598120007', 'Hannah', 'Do you have any promotions?', 'We currently have a first-timer promotion: 20% off your first HIFU treatment. That brings it down from $550 to $440. Limited time only! Would you like to book?', 'pricing', '1', '19'),
  ('+6598120008', 'Ian', 'What are your opening hours?', 'We are open Monday to Saturday, 10:30 AM to 7 PM. Closed on Sundays. Our last appointment is at 5:30 PM.', 'hours', '0', '8')
) AS msg(p, n, m, r, i, d, h)
WHERE c.slug = 'pixellvault';

-- ============================================================
-- PART 4: APPOINTMENTS
-- ============================================================

INSERT INTO appointments (client_id, customer_name, customer_phone, service, appointment_date, appointment_time, status, notes, created_at)
SELECT c.id, a.n, a.p, a.s, a.d::date, a.t::time, a.st, a.note, NOW() - INTERVAL '1 day'
FROM clients c,
(VALUES
  ('Sarah Tan', '+6591230001', 'HIFU Face Lift', (NOW() + INTERVAL '1 day')::date::text, '14:00', 'confirmed', ''),
  ('Jessica Lim', '+6591230002', 'Botox Consultation', (NOW() + INTERVAL '1 day')::date::text, '10:30', 'confirmed', ''),
  ('Michelle Wong', '+6591230004', 'Acne Scar Consultation', (NOW() + INTERVAL '1 day')::date::text, '16:00', 'confirmed', ''),
  ('Amanda Lee', '+6591230010', 'Chemical Peel (Deep)', (NOW() - INTERVAL '2 day')::date::text, '11:00', 'completed', 'Patient satisfied'),
  ('Karen Ho', '+6591230005', 'HydraFacial', (NOW() - INTERVAL '3 day')::date::text, '15:30', 'no_show', 'Did not arrive, no message'),
  ('Rachel Chua', '+6591230008', 'Thermage FLX', (NOW() - INTERVAL '5 day')::date::text, '10:00', 'completed', 'Excellent results'),
  ('Stephanie Goh', '+6591230009', 'HIFU Face Lift', (NOW() - INTERVAL '1 day')::date::text, '13:00', 'cancelled', 'Patient rescheduled'),
  ('Nicole Tan', '+6591230007', 'HIFU Double Chin', (NOW() - INTERVAL '6 day')::date::text, '14:30', 'completed', '')
) AS a(n, p, s, d, t, st, note)
WHERE c.slug = 'glow-aesthetics';

-- Pixel Vault appointments
INSERT INTO appointments (client_id, customer_name, customer_phone, service, appointment_date, appointment_time, status, notes, created_at)
SELECT c.id, a.n, a.p, a.s, a.d::date, a.t::time, a.st, a.note, NOW() - INTERVAL '1 day'
FROM clients c,
(VALUES
  ('Benjamin Koh', '+6598120001', 'HIFU Full Face', (NOW() + INTERVAL '1 day')::date::text, '11:00', 'confirmed', ''),
  ('Catherine Ong', '+6598120002', 'Laser Toning', (NOW() - INTERVAL '1 day')::date::text, '14:00', 'completed', ''),
  ('Daniel Tan', '+6598120004', 'HIFU Full Face', (NOW() - INTERVAL '4 day')::date::text, '10:30', 'no_show', 'Ghosted'),
  ('Emily Lim', '+6598120005', 'BB Glow Facial', (NOW() + INTERVAL '2 day')::date::text, '15:00', 'confirmed', '')
) AS a(n, p, s, d, t, st, note)
WHERE c.slug = 'pixellvault';

-- ============================================================
-- PART 5: WAITLIST
-- ============================================================

INSERT INTO waitlist (client_id, customer_name, customer_phone, preferred_service, preferred_date, preferred_time_range, status, notes, created_at)
SELECT c.id, w.n, w.p, w.s, w.d::date, w.t, 'active', w.note, NOW() - INTERVAL '2 day'
FROM clients c,
(VALUES
  ('Linda Chew', '+6591230015', 'HIFU Face Lift', (NOW() + INTERVAL '2 day')::date::text, 'afternoon', 'Willing to take any afternoon slot'),
  ('Patricia Ng', '+6591230016', 'HydraFacial', (NOW() + INTERVAL '3 day')::date::text, 'morning', 'Only available mornings'),
  ('Sharon Lim', '+6591230017', 'Chemical Peel (Light)', (NOW() + INTERVAL '1 day')::date::text, 'any', 'Flexible timing')
) AS w(n, p, s, d, t, note)
WHERE c.slug = 'glow-aesthetics'
ON CONFLICT DO NOTHING;

-- ============================================================
-- PART 6: DAILY USAGE
-- ============================================================

INSERT INTO daily_usage (client_id, date, call_count, message_count, cost_usd, model)
SELECT c.id, (NOW() - (g.n || ' days')::interval)::date, (10 + floor(random()*20)::int), (20 + floor(random()*30)::int), (0.1 + (random()*0.4))::decimal(10,4), 'gpt-4o-mini'
FROM clients c, generate_series(1, 14) AS g(n)
WHERE c.slug IN ('glow-aesthetics', 'pixellvault')
ON CONFLICT DO NOTHING;

-- ============================================================
-- PART 7: WEEKLY REPORT (Sample)
-- ============================================================

INSERT INTO weekly_reports (client_id, period_from, period_to, insights, suggestions, weekly_stats, generated_at)
SELECT c.id, (NOW() - INTERVAL '7 days')::date, NOW()::date,
  '[
    {"type": "faq_gap", "severity": "high", "title": "HIFU side effects not in FAQ", "detail": "5 patients asked about HIFU side effects and downtime in the past week, but this is not covered in the current FAQ. This is a barrier to booking."},
    {"type": "no_show", "severity": "medium", "title": "Saturday afternoon no-shows", "detail": "2 out of 4 Saturday afternoon appointments were no-shows (50% rate). Consider requiring deposit or confirmation for Saturday slots."},
    {"type": "conversion", "severity": "medium", "title": "Pricing questions not converting", "detail": "3 patients asked about package pricing but did not book. Consider offering a limited-time first-timer discount."}
  ]'::jsonb,
  '[
    {"action": "add_faq", "priority": 9, "description": "Add FAQ entry: What are the side effects of HIFU? Expected answer: Mild redness for a few hours, possible slight swelling for 1-2 days. No downtime.", "expected_impact": "+2-3 bookings/week from patients currently dropping off at this question"},
    {"action": "clarify_pricing", "priority": 7, "description": "Add a first-timer promotion: 15% off first HIFU session ($580 → $493). Promote actively in responses.", "expected_impact": "+1-2 new patient conversions/week"},
    {"action": "adjust_hours", "priority": 6, "description": "Require SMS confirmation 24h before for Saturday appointments. Consider a $50 deposit for Saturday bookings.", "expected_impact": "-30% Saturday no-show rate"}
  ]'::jsonb,
  '{"total_conversations": 47, "booking_conversion_rate": "18.3%", "no_show_rate": "12.5%", "top_service_inquired": "HIFU Face Lift", "avg_response_quality": "good"}'::jsonb,
  NOW() - INTERVAL '1 day'
FROM clients c
WHERE c.slug = 'glow-aesthetics'
ON CONFLICT DO NOTHING;
