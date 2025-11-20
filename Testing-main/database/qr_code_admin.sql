use attendo;
CREATE TABLE qr_codes_admin (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_type ENUM('check-in', 'check-out') NOT NULL,
    code TEXT NOT NULL,                -- QR image base64 or URL
    generated_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    latitude DECIMAL(10,6) NULL,
    longitude DECIMAL(10,6) NULL,
    radius INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
select * from qr_codes_admin;



