-- ─── MOCK TEST CLINIC FOR SANDBOX TESTING ──────────────────────
-- Run this in Supabase SQL Editor to create a fully configured
-- test clinic for WhatsApp sandbox testing.
--
-- IMPORTANT: After testing with a real clinic, DELETE this row
-- or set status = 'archived' to prevent confusion.

-- Insert the clinic
INSERT INTO clients (id, name, slug, whatsapp_number, status, google_calendar_id)
VALUES (
  'test-clinic-001',
  'Glow Aesthetics Clinic',
  'glow-aesthetics',
  '+65 6123 4567',
  'active',
  NULL  -- no Google Calendar in sandbox
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  whatsapp_number = EXCLUDED.whatsapp_number,
  status = 'active';

-- Insert the full configuration
INSERT INTO client_configs (
  client_id,
  operating_hours,
  services,
  faqs,
  special_notes,
  booking_auto_confirm,
  booking_after_hours_action,
  booking_waitlist_enabled,
  booking_max_advance_days,
  booking_min_notice_hours,
  booking_allow_same_day,
  booking_require_phone,
  buffer_time
)
VALUES (
  'test-clinic-001',
  -- Operating hours
  '[
    {"day": "Monday", "open_time": "09:00", "close_time": "18:00", "isOpen": true},
    {"day": "Tuesday", "open_time": "09:00", "close_time": "18:00", "isOpen": true},
    {"day": "Wednesday", "open_time": "09:00", "close_time": "18:00", "isOpen": true},
    {"day": "Thursday", "open_time": "09:00", "close_time": "18:00", "isOpen": true},
    {"day": "Friday", "open_time": "09:00", "close_time": "18:00", "isOpen": true},
    {"day": "Saturday", "open_time": "10:00", "close_time": "16:00", "isOpen": true},
    {"day": "Sunday", "open_time": null, "close_time": null, "isOpen": false}
  ]'::jsonb,
  -- Services
  '[
    {"name": "Hydrating Facial", "duration": 60, "price": "From S$150"},
    {"name": "Anti-Aging Treatment", "duration": 90, "price": "From S$280"},
    {"name": "Acne Clear Facial", "duration": 75, "price": "From S$180"},
    {"name": "Laser Skin Rejuvenation", "duration": 45, "price": "From S$350"},
    {"name": "Botox Consultation", "duration": 30, "price": "Complimentary"},
    {"name": "Dermal Filler", "duration": 60, "price": "From S$600"}
  ]'::jsonb,
  -- FAQs
  '[
    {"question": "Do I need a consultation before treatment?", "answer": "Yes, a complimentary consultation is required for all injectable treatments. Facials and peels can be booked directly."},
    {"question": "Is there downtime?", "answer": "Most facials have zero downtime. Injectables may have mild redness or swelling for 24-48 hours. Your doctor will advise during consultation."},
    {"question": "How do I prepare for my appointment?", "answer": "Avoid alcohol 24 hours before injectables. Come with clean skin (no makeup). Arrive 10 minutes early to complete registration."},
    {"question": "What is your cancellation policy?", "answer": "We appreciate at least 24 hours notice for cancellations. Late cancellations may incur a fee."}
  ]'::jsonb,
  -- Special notes
  'All injectable treatments are performed by MOH-certified doctors. We use only FDA/HSA-approved products. First-time patients receive a complimentary skin analysis.',
  -- Booking settings
  false,        -- booking_auto_confirm (clinic must approve)
  'hold_for_approval',
  true,         -- booking_waitlist_enabled
  30,           -- booking_max_advance_days
  2,            -- booking_min_notice_hours
  true,         -- booking_allow_same_day
  true,         -- booking_require_phone
  15            -- buffer_time (minutes between appointments)
)
ON CONFLICT (client_id) DO UPDATE SET
  operating_hours = EXCLUDED.operating_hours,
  services = EXCLUDED.services,
  faqs = EXCLUDED.faqs,
  special_notes = EXCLUDED.special_notes,
  booking_auto_confirm = EXCLUDED.booking_auto_confirm,
  booking_after_hours_action = EXCLUDED.booking_after_hours_action,
  booking_waitlist_enabled = EXCLUDED.booking_waitlist_enabled,
  booking_max_advance_days = EXCLUDED.booking_max_advance_days,
  booking_min_notice_hours = EXCLUDED.booking_min_notice_hours,
  booking_allow_same_day = EXCLUDED.booking_allow_same_day,
  booking_require_phone = EXCLUDED.booking_require_phone,
  buffer_time = EXCLUDED.buffer_time;

-- Insert a test patient (yourself) for booking tests
INSERT INTO patients (id, client_id, name, phone, email)
VALUES (
  'test-patient-001',
  'test-clinic-001',
  'Test Patient',
  '+6591234567',
  'test@example.com'
)
ON CONFLICT (id) DO NOTHING;

-- Verify: show the configured clinic
SELECT c.id, c.name, c.whatsapp_number, c.status, cc.booking_auto_confirm, jsonb_array_length(cc.services) as num_services
FROM clients c
LEFT JOIN client_configs cc ON c.id = cc.client_id
WHERE c.id = 'test-clinic-001';
