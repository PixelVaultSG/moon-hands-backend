-- Migration 006: End-to-End Test Data for Glow Aesthetics & Pixel Vault Pte Ltd
-- Run AFTER migration 005 in Supabase SQL Editor
-- This creates two fully populated demo clinics with realistic data

-- ============================================================
-- PART 1: CLIENTS (Clinic Profiles)
-- ============================================================

INSERT INTO clients (slug, name, whatsapp_number, telegram_chat_id, status, plan, created_at, updated_at)
VALUES 
  ('glow-aesthetics', 'Glow Aesthetics Clinic', '+6581234567', '123456789', 'active', 'premium', NOW() - INTERVAL '30 days', NOW()),
  ('pixellvault', 'Pixel Vault Pte Ltd', '+6581398272', '123456789', 'active', 'basic', NOW() - INTERVAL '45 days', NOW())
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- PART 2: CLIENT CONFIGS (Services, FAQs, Hours, Brand Voice)
-- ============================================================

-- Glow Aesthetics — Premium tier, full config
INSERT INTO client_configs (
  client_id, agent_name, greeting, tone, enthusiasm, 
  services, faqs, operating_hours, special_notes, created_at, updated_at
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
    {"name": " PicoSure Laser", "price": "$450", "duration": 60, "description": "Pico-second laser for pigmentation and tattoo removal"},
    {"name": "Chemical Peel (Light)", "price": "$180", "duration": 45, "description": "Gentle exfoliation for brighter skin"},
    {"name": "Chemical Peel (Deep)", "price": "$350", "duration": 60, "description": "Intensive peel for acne scars and deep pigmentation"},
    {"name": "HydraFacial", "price": "$250", "duration": 60, "description": "Deep cleansing, exfoliation and hydration"},
    {"name": "Botox (3 areas)", "price": "$680", "duration": 30, "description": "Forehead, frown lines and crow''s feet"},
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
  'Doctor is Dr. Rachel Lim (MBBS, Dip Dermatology). Clinic established 2019. Located at 123 Orchard Road, #05-01 Singapore 238863. Emergency contact: +65 8123 4567.',
  NOW(),
  NOW()
FROM clients WHERE slug = 'glow-aesthetics'
ON CONFLICT (client_id) DO NOTHING;

-- Pixel Vault Pte Ltd — Basic tier
INSERT INTO client_configs (
  client_id, agent_name, greeting, tone, enthusiasm,
  services, faqs, operating_hours, special_notes, created_at, updated_at
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
  'Located at Novena Medical Centre #08-12. Doctor: Dr. Kenneth Thean. Contact: +65 8139 8272.',
  NOW(),
  NOW()
FROM clients WHERE slug = 'pixellvault'
ON CONFLICT (client_id) DO NOTHING;

-- ============================================================
-- PART 3: CONVERSATIONS (Realistic Patient Chats)
-- ============================================================

INSERT INTO conversations (client_id, patient_phone, message, response, intent, created_at)
SELECT 
  c.id,
  msg->>'phone',
  msg->>'message',
  msg->>'response',
  msg->>'intent',
  NOW() - ((msg->>'days_ago')::int || ' days')::interval - ((msg->>'hour')::int || ' hours')::interval
FROM clients c,
jsonb_array_elements('[
  {"phone": "+6591230001", "message": "Hi, what is HIFU?", "response": "Hello! HIFU stands for High-Intensity Focused Ultrasound. It is a non-surgical face lift treatment that uses ultrasound energy to lift and tighten skin. We offer HIFU Face Lift at $580 (90 mins) and HIFU Double Chin at $350 (60 mins). Would you like to book a consultation?", "intent": "service_inquiry", "days_ago": 2, "hour": 10},
  {"phone": "+6591230001", "message": "Does it hurt?", "response": "Most patients describe HIFU as a warm, tingling sensation with mild discomfort. We apply numbing cream beforehand to keep you comfortable. There is no downtime, so you can return to normal activities immediately. Would you like to book?", "intent": "service_inquiry", "days_ago": 2, "hour": 10},
  {"phone": "+6591230001", "message": "Okay book me for Saturday 2pm", "response": "I have booked your HIFU Face Lift consultation for Saturday at 2:00 PM. You will receive a confirmation message shortly. Please arrive 10 minutes early.", "intent": "book_appointment", "days_ago": 2, "hour": 10},
  {"phone": "+6591230002", "message": "How much is Botox?", "response": "Our Botox treatment covers 3 areas (forehead, frown lines, crow''s feet) at $680. The procedure takes about 30 minutes and results last 4-6 months. Would you like to know more or book a consultation?", "intent": "pricing", "days_ago": 3, "hour": 14},
  {"phone": "+6591230003", "message": "What time do you close today?", "response": "We are open until 8:00 PM today. Our last appointment slot is at 6:30 PM. Would you like to check availability?", "intent": "hours", "days_ago": 1, "hour": 16},
  {"phone": "+6591230004", "message": "I want to do something for my acne scars", "response": "For acne scars, we recommend our Acne Scar Subcision at $350 (60 mins) or Chemical Peel (Deep) at $350 (60 mins). The best option depends on your scar type. Would you like to book a complimentary consultation with Dr. Rachel?", "intent": "service_inquiry", "days_ago": 1, "hour": 11},
  {"phone": "+6591230004", "message": "What is the difference between subcision and peel?", "response": "Subcision uses a needle to release tethered scars from underneath, best for deep rolling scars. Chemical peel resurfaces the top layer, better for superficial scars and pigmentation. Many patients do both for best results. Dr. Rachel can advise during your consultation.", "intent": "service_inquiry", "days_ago": 1, "hour": 11},
  {"phone": "+6591230005", "message": "Do you have parking?", "response": "Yes, we have complimentary parking at the rear of the building. Just drive to the back and look for Glow Aesthetics reserved lots.", "intent": "faq", "days_ago": 4, "hour": 9},
  {"phone": "+6591230006", "message": "Is HIFU safe for pregnant women?", "response": "HIFU is not recommended during pregnancy or breastfeeding as a precaution. We would be happy to schedule your treatment for after your pregnancy. Is there anything else I can help with?", "intent": "service_inquiry", "days_ago": 5, "hour": 13},
  {"phone": "+6591230007", "message": "Book HydraFacial tomorrow 3pm", "response": "I have checked our availability and we have a slot for HydraFacial tomorrow at 3:00 PM. May I have your name to confirm the booking?", "intent": "book_appointment", "days_ago": 0, "hour": 18},
  {"phone": "+6591230008", "message": "How long does Thermage last?", "response": "Thermage FLX results typically last 1-2 years as it stimulates collagen production. The treatment is $2,800 for 120 minutes. Many patients pair it with annual maintenance HIFU sessions. Would you like to discuss a treatment plan?", "intent": "service_inquiry", "days_ago": 2, "hour": 15},
  {"phone": "+6591230009", "message": "Do you offer packages?", "response": "Yes! Our Glow package includes 3 HIFU sessions at $1,500 (save $240). Our Bright Skin package includes 6 HydraFacials at $1,200 (save $300). We also offer custom packages. Which treatments are you interested in?", "intent": "pricing", "days_ago": 3, "hour": 12},
  {"phone": "+6591230010", "message": "What are the side effects of chemical peel?", "response": "Light peel: mild redness and peeling for 2-3 days. Deep peel: more noticeable peeling for 5-7 days. You must avoid sun exposure and use SPF 50+ after treatment. We will give you a full aftercare guide.", "intent": "service_inquiry", "days_ago": 6, "hour": 20},
  {"phone": "+6591230011", "message": "Can I cancel my Saturday appointment?", "response": "I can help you cancel. To confirm, you want to cancel your Saturday appointment. Once cancelled, the slot will be released. Would you like me to proceed?", "intent": "cancel", "days_ago": 1, "hour": 9},
  {"phone": "+6591230012", "message": "Are you open on Sunday?", "response": "We are closed on Sundays. Our hours are Monday to Friday 10 AM to 8 PM, Saturday 10 AM to 6 PM. Would you like to book for Saturday or next week?", "intent": "hours", "days_ago": 0, "hour": 19},
  {"phone": "+6591230001", "message": "Thanks for the reminder, see you Saturday", "response": "You are welcome! We look forward to seeing you on Saturday at 2:00 PM for your HIFU consultation. Please arrive 10 minutes early with a clean face. Have a wonderful day!", "intent": "greeting", "days_ago": 0, "hour": 8}
]'::jsonb) AS msg
WHERE c.slug = 'glow-aesthetics';

-- Pixel Vault conversations
INSERT INTO conversations (client_id, patient_phone, message, response, intent, created_at)
SELECT 
  c.id,
  msg->>'phone',
  msg->>'message',
  msg->>'response',
  msg->>'intent',
  NOW() - ((msg->>'days_ago')::int || ' days')::interval - ((msg->>'hour')::int || ' hours')::interval
FROM clients c,
jsonb_array_elements('[
  {"phone": "+6598120001", "message": "Hi, what services do you offer?", "response": "Welcome to Pixel Vault! We offer HIFU, Laser Toning, BB Glow Facial, and Skin Booster Injections. Our most popular is HIFU Full Face at $550. Would you like details on any specific treatment?", "intent": "service_inquiry", "days_ago": 1, "hour": 11},
  {"phone": "+6598120002", "message": "How much is laser toning?", "response": "Laser Toning is $280 for a 45-minute session. It is excellent for brightening and pigmentation. Most patients see results after 3-5 sessions. Would you like to book?", "intent": "pricing", "days_ago": 2, "hour": 14},
  {"phone": "+6598120003", "message": "Where is your clinic?", "response": "We are at Novena Medical Centre, #08-12, 38 Irrawaddy Road, Singapore 329563. Nearest MRT: Novena (NS20). We are on the 8th floor.", "intent": "faq", "days_ago": 3, "hour": 9},
  {"phone": "+6598120004", "message": "Book HIFU for next Tuesday 11am", "response": "I have checked and Tuesday 11:00 AM is available for HIFU. May I have your name to confirm the booking?", "intent": "book_appointment", "days_ago": 0, "hour": 16},
  {"phone": "+6598120005", "message": "What is BB Glow?", "response": "BB Glow is a semi-permanent BB cream infusion treatment at $200 (60 mins). It gives you a natural, glowing complexion that lasts 3-6 months. Great for uneven skin tone. Would you like to try it?", "intent": "service_inquiry", "days_ago": 4, "hour": 13},
  {"phone": "+6598120006", "message": "Is the doctor experienced?", "response": "Yes, Dr. Kenneth Thean is our lead physician. He has over 15 years of experience in aesthetic medicine and is a certified trainer for HIFU and laser treatments.", "intent": "service_inquiry", "days_ago": 5, "hour": 10},
  {"phone": "+6598120007", "message": "Do you have any promotions?", "response": "We currently have a first-timer promotion: 20% off your first HIFU treatment. That brings it down from $550 to $440. Limited time only! Would you like to book?", "intent": "pricing", "days_ago": 1, "hour": 19},
  {"phone": "+6598120008", "message": "What are your opening hours?", "response": "We are open Monday to Saturday, 10:30 AM to 7 PM. Closed on Sundays. Our last appointment is at 5:30 PM.", "intent": "hours", "days_ago": 0, "hour": 8}
]'::jsonb) AS msg
WHERE c.slug = 'pixellvault';

-- ============================================================
-- PART 4: APPOINTMENTS (Mix of statuses for no-show tracking)
-- ============================================================

INSERT INTO appointments (client_id, customer_name, customer_phone, service, appointment_date, appointment_time, status, notes, created_at)
SELECT c.id, a.name, a.phone, a.service, a.date, a.time, a.status, a.notes, NOW() - INTERVAL '1 day'
FROM clients c,
jsonb_to_recordset('[
  {"name": "Sarah Tan", "phone": "+6591230001", "service": "HIFU Face Lift", "date": "' || (NOW() + INTERVAL '1 day')::date || '", "time": "14:00", "status": "confirmed", "notes": ""},
  {"name": "Jessica Lim", "phone": "+6591230002", "service": "Botox Consultation", "date": "' || (NOW() + INTERVAL '1 day')::date || '", "time": "10:30", "status": "confirmed", "notes": ""},
  {"name": "Michelle Wong", "phone": "+6591230004", "service": "Acne Scar Consultation", "date": "' || (NOW() + INTERVAL '1 day')::date || '", "time": "16:00", "status": "confirmed", "notes": ""},
  {"name": "Amanda Lee", "phone": "+6591230010", "service": "Chemical Peel (Deep)", "date": "' || (NOW() - INTERVAL '2 day')::date || '", "time": "11:00", "status": "completed", "notes": "Patient satisfied"},
  {"name": "Karen Ho", "phone": "+6591230005", "service": "HydraFacial", "date": "' || (NOW() - INTERVAL '3 day')::date || '", "time": "15:30", "status": "no_show", "notes": "Did not arrive, no message"},
  {"name": "Rachel Chua", "phone": "+6591230008", "service": "Thermage FLX", "date": "' || (NOW() - INTERVAL '5 day')::date || '", "time": "10:00", "status": "completed", "notes": "Excellent results"},
  {"name": "Stephanie Goh", "phone": "+6591230009", "service": "HIFU Face Lift", "date": "' || (NOW() - INTERVAL '1 day')::date || '", "time": "13:00", "status": "cancelled", "notes": "Patient rescheduled"},
  {"name": "Nicole Tan", "phone": "+6591230007", "service": "HIFU Double Chin", "date": "' || (NOW() - INTERVAL '6 day')::date || '", "time": "14:30", "status": "completed", "notes": ""}
]'::jsonb) AS a(name text, phone text, service text, date date, time text, status text, notes text)
WHERE c.slug = 'glow-aesthetics'
ON CONFLICT DO NOTHING;

-- Pixel Vault appointments
INSERT INTO appointments (client_id, customer_name, customer_phone, service, appointment_date, appointment_time, status, notes, created_at)
SELECT c.id, a.name, a.phone, a.service, a.date, a.time, a.status, a.notes, NOW() - INTERVAL '1 day'
FROM clients c,
jsonb_to_recordset('[
  {"name": "Benjamin Koh", "phone": "+6598120001", "service": "HIFU Full Face", "date": "' || (NOW() + INTERVAL '1 day')::date || '", "time": "11:00", "status": "confirmed", "notes": ""},
  {"name": "Catherine Ong", "phone": "+6598120002", "service": "Laser Toning", "date": "' || (NOW() - INTERVAL '1 day')::date || '", "time": "14:00", "status": "completed", "notes": ""},
  {"name": "Daniel Tan", "phone": "+6598120004", "service": "HIFU Full Face", "date": "' || (NOW() - INTERVAL '4 day')::date || '", "time": "10:30", "status": "no_show", "notes": "Ghosted"},
  {"name": "Emily Lim", "phone": "+6598120005", "service": "BB Glow Facial", "date": "' || (NOW() + INTERVAL '2 day')::date || '", "time": "15:00", "status": "confirmed", "notes": ""}
]'::jsonb) AS a(name text, phone text, service text, date date, time text, status text, notes text)
WHERE c.slug = 'pixellvault'
ON CONFLICT DO NOTHING;

-- ============================================================
-- PART 5: WAITLIST (Active entries for re-engagement testing)
-- ============================================================

INSERT INTO waitlist (client_id, customer_name, customer_phone, preferred_service, preferred_date, preferred_time_range, status, notes, created_at)
SELECT c.id, w.name, w.phone, w.service, w.date, w.time_range, 'active', w.note, NOW() - INTERVAL '2 day'
FROM clients c,
jsonb_to_recordset('[
  {"name": "Linda Chew", "phone": "+6591230015", "service": "HIFU Face Lift", "date": "' || (NOW() + INTERVAL '2 day')::date || '", "time_range": "afternoon", "note": "Willing to take any afternoon slot"},
  {"name": "Patricia Ng", "phone": "+6591230016", "service": "HydraFacial", "date": "' || (NOW() + INTERVAL '3 day')::date || '", "time_range": "morning", "note": "Only available mornings"},
  {"name": "Sharon Lim", "phone": "+6591230017", "service": "Chemical Peel (Light)", "date": "' || (NOW() + INTERVAL '1 day')::date || '", "time_range": "any", "note": "Flexible timing"}
]'::jsonb) AS w(name text, phone text, service text, date date, time_range text, note text)
WHERE c.slug = 'glow-aesthetics'
ON CONFLICT DO NOTHING;

-- ============================================================
-- PART 6: DAILY USAGE (Mock stats)
-- ============================================================

INSERT INTO daily_usage (client_id, date, call_count, message_count, cost_usd, model)
SELECT 
  c.id,
  (NOW() - (g.n || ' days')::interval)::date,
  floor(random() * 30 + 10)::int,
  floor(random() * 50 + 20)::int,
  (random() * 0.5 + 0.1)::decimal(10,4),
  'gpt-4o-mini'
FROM clients c,
  generate_series(1, 14) AS g(n)
WHERE c.slug IN ('glow-aesthetics', 'pixellvault')
ON CONFLICT DO NOTHING;

-- ============================================================
-- PART 7: WEEKLY REPORT (Sample for Glow Aesthetics)
-- ============================================================

INSERT INTO weekly_reports (client_id, period_from, period_to, insights, suggestions, weekly_stats, generated_at)
SELECT 
  c.id,
  (NOW() - INTERVAL '7 days')::date,
  NOW()::date,
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

-- Done
