-- Fix is_active column issue in qr_codes_admin table
-- This ensures is_active column works correctly with BOOLEAN/TINYINT

USE attendo;

-- Check current state
SELECT id, is_active, expires_at, session_type 
FROM qr_codes_admin 
ORDER BY id DESC 
LIMIT 5;

-- Fix: Ensure is_active column is properly set as TINYINT(1) with default TRUE
-- If column exists, this will modify it; if not, it will create it
ALTER TABLE qr_codes_admin 
MODIFY COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1;

-- Update any NULL values to 1 (active)
UPDATE qr_codes_admin 
SET is_active = 1 
WHERE is_active IS NULL;

-- Set expired QR codes to inactive
UPDATE qr_codes_admin 
SET is_active = 0 
WHERE expires_at < NOW();

-- Verify the fix
SELECT 
    id, 
    is_active, 
    CASE 
        WHEN is_active = 1 THEN 'ACTIVE' 
        WHEN is_active = 0 THEN 'INACTIVE' 
        ELSE 'UNKNOWN' 
    END AS status,
    expires_at,
    session_type
FROM qr_codes_admin 
ORDER BY id DESC 
LIMIT 10;

SELECT 'is_active column fixed successfully!' AS message;

