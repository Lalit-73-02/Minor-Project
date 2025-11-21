-- Add reference_photo column to student_details table
USE attendo;

ALTER TABLE student_details 
ADD COLUMN reference_photo VARCHAR(500) NULL 
AFTER year;

-- Add photo_today and match_score columns to attendance table
ALTER TABLE attendance 
ADD COLUMN photo_today VARCHAR(500) NULL 
AFTER marked_at;

ALTER TABLE attendance 
ADD COLUMN match_score DECIMAL(5,4) NULL 
AFTER photo_today;

-- Create uploads directory structure (this is a note, actual directory creation happens in Node.js)
-- /uploads/reference_photos/ - for reference photos
-- /uploads/daily_photos/ - for daily attendance photos

