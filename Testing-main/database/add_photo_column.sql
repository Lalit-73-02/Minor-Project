-- Add verification_photo column to attendance table for camera verification
-- Run this migration to enable photo storage for attendance verification

USE attendo;

-- Add photo column to store base64 encoded verification photos
ALTER TABLE attendance 
ADD COLUMN verification_photo LONGTEXT NULL 
COMMENT 'Base64 encoded photo for attendance verification' 
AFTER marked_at;

-- Optional: Add index for better query performance
-- CREATE INDEX idx_attendance_marked_at ON attendance(marked_at);
-- CREATE INDEX idx_attendance_student_qr ON attendance(student_id, qr_id);

SELECT 'Photo column added successfully!' AS message;

