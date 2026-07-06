-- WhatsApp integration (OpenWA gateway): one session per business, created via
-- QR login from Business settings. Only server functions read/write this —
-- the gateway API key never reaches the client.
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS wa_session_id TEXT;
