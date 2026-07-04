-- Add Pixel Vault as the demo clinic (corrected slug: pixelvault with 1 L)
-- Run this in Supabase SQL Editor

INSERT INTO clients (
    name,
    slug,
    contact_name,
    contact_email,
    contact_phone,
    whatsapp_number,
    plan,
    status,
    industry
) VALUES (
    'Pixel Vault Aesthetics',
    'pixelvault',
    'Ash',
    'pixelvaultsg@gmail.com',
    '+65 8139 8272',
    '+65 8139 8272',
    'professional',
    'active',
    'aesthetic'
)
ON CONFLICT (slug) DO UPDATE SET
    contact_name = EXCLUDED.contact_name,
    contact_email = EXCLUDED.contact_email,
    contact_phone = EXCLUDED.contact_phone,
    whatsapp_number = EXCLUDED.whatsapp_number,
    plan = EXCLUDED.plan,
    status = EXCLUDED.status,
    updated_at = NOW();

-- Verify
SELECT id, name, slug, whatsapp_number, plan, status 
FROM clients 
WHERE slug = 'pixelvault';