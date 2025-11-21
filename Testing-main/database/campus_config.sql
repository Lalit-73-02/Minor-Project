-- Campus configuration table for fixed campus center coordinates
-- This ensures attendance validation uses a fixed location, not admin's GPS

USE attendo;

CREATE TABLE IF NOT EXISTS campus_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    campus_name VARCHAR(255) NOT NULL DEFAULT 'Main Campus',
    center_latitude DECIMAL(10, 8) NOT NULL,
    center_longitude DECIMAL(10, 8) NOT NULL,
    radius_meters INT NOT NULL DEFAULT 2000,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert default campus location (update with your actual campus coordinates)
-- Example coordinates (replace with your actual campus center):
-- IMPORTANT: Update the latitude and longitude below with your actual campus center coordinates
INSERT INTO campus_config (campus_name, center_latitude, center_longitude, radius_meters, is_active)
SELECT 'Main Campus', 28.7041, 77.1025, 2000, TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM campus_config WHERE is_active = 1
);

SELECT 'Campus config table created successfully!' AS message;

