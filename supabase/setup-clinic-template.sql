-- ============================================================
-- Moon Hands — NEW CLINIC TEMPLATE
-- Copy this file, replace every {{placeholder}}, run in Supabase SQL Editor.
-- This is the mould cloned from the Pixel Vault reference clinic.
-- Safe to re-run (ON CONFLICT updates).
-- ============================================================

-- ─── 1. CLINIC ROW ───────────────────────────────────────────
INSERT INTO clients (
    name, slug, contact_name, contact_email, contact_phone,
    whatsapp_number, plan, status, industry
) VALUES (
    '{{Clinic Name}}',          -- e.g. 'Glow Aesthetics'
    '{{slug}}',                 -- e.g. 'glow' — lowercase, one word, unique
    '{{Owner Name}}',
    '{{owner@email.com}}',
    '{{+65 XXXX XXXX}}',
    '{{+65 XXXX XXXX}}',        -- WhatsApp business number (360dialog)
    'basic',                      -- basic (S$347) | premium (S$547) — billing tier
    'setup',                    -- setup → active after go-live checks
    'aesthetic'
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    contact_name = EXCLUDED.contact_name,
    contact_email = EXCLUDED.contact_email,
    contact_phone = EXCLUDED.contact_phone,
    whatsapp_number = EXCLUDED.whatsapp_number,
    updated_at = NOW();

-- ─── 2. CONFIG ROW (all defaults = the template mould) ───────
INSERT INTO client_configs (
    client_id,
    agent_name,
    greeting,
    tone,
    enthusiasm,
    services,          -- start empty; add via /addservice (Telegram admin)
    operating_hours,   -- template: Mon–Fri 9–6, Sat 9–2, Sun closed
    faqs,
    appointment_duration,
    buffer_time,
    max_per_day,
    cancellation_policy,
    languages,
    automations
)
SELECT
    id,
    'Sophia',
    'Hello! Welcome to {businessName}. How can I help you today?',
    'friendly',
    'medium',
    '[]'::jsonb,
    '[
      {"day":"Monday","isOpen":true,"open_time":"09:00","close_time":"18:00"},
      {"day":"Tuesday","isOpen":true,"open_time":"09:00","close_time":"18:00"},
      {"day":"Wednesday","isOpen":true,"open_time":"09:00","close_time":"18:00"},
      {"day":"Thursday","isOpen":true,"open_time":"09:00","close_time":"18:00"},
      {"day":"Friday","isOpen":true,"open_time":"09:00","close_time":"18:00"},
      {"day":"Saturday","isOpen":true,"open_time":"09:00","close_time":"14:00"},
      {"day":"Sunday","isOpen":false,"open_time":"","close_time":""}
    ]'::jsonb,
    '[]'::jsonb,
    60,   -- appointment_duration (min)
    15,   -- buffer_time (min)
    12,   -- max_per_day
    '24 hours notice required',
    ARRAY['en'],
    '{"bookingConfirmation": true, "reminder24h": true, "reminder1h": false, "followup48h": true}'::jsonb
FROM clients
WHERE slug = '{{slug}}'
ON CONFLICT (client_id) DO NOTHING;

-- ─── 3. VERIFY ───────────────────────────────────────────────
SELECT c.slug, c.name, c.status, cfg.agent_name,
       jsonb_array_length(cfg.services) AS services,
       jsonb_array_length(cfg.faqs) AS faqs
FROM clients c
JOIN client_configs cfg ON cfg.client_id = c.id
WHERE c.slug = '{{slug}}';

-- ─── NEXT STEPS ──────────────────────────────────────────────
-- 1. Telegram admin bot: /addservice {{slug}} "Service" "$price" durationMin
--    (ranges OK: "$50-$100" — stored exactly as typed)
-- 2. /updatehours {{slug}} <day> <HH:MM-HH:MM|closed> if hours differ
-- 3. /addfaq {{slug}} "Question" "Answer"
-- 4. Point clinic's 360dialog webhook to /webhook/whatsapp
-- 5. Go-live checks (docs/NEW_CLINIC_TEMPLATE.md §5) → status = 'active'
