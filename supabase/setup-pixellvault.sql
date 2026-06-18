-- Add Pixel Vault as the first clinic for testing
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
    webhook_token,
    industry
) VALUES (
    'Pixel Vault Pte Ltd',
    'pixellvault',
    'Ash',
    'pixelvaultsg@gmail.com',
    '+6581398272',
    '+6581398272',
    'professional',
    'active',
    'pk_live_9f8e7d6c5b4a3210',
    'aesthetic'
)
ON CONFLICT (slug) DO UPDATE SET
    contact_name = EXCLUDED.contact_name,
    contact_email = EXCLUDED.contact_email,
    contact_phone = EXCLUDED.contact_phone,
    whatsapp_number = EXCLUDED.whatsapp_number,
    plan = EXCLUDED.plan,
    status = EXCLUDED.status,
    webhook_token = EXCLUDED.webhook_token,
    updated_at = NOW();

-- Verify
SELECT id, name, slug, whatsapp_number, plan, status, webhook_token 
FROM clients 
WHERE slug = 'pixellvault';
