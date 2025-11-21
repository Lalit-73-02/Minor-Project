# Quick Setup Guide - Face Recognition Attendance

## Step 1: Database Migration

Run the SQL script to update your database:

```bash
mysql -u your_username -p your_database < database/face_recognition_schema.sql
```

Or manually run in MySQL:
```sql
USE attendo;

ALTER TABLE student_details 
ADD COLUMN reference_photo VARCHAR(500) NULL 
AFTER year;

ALTER TABLE attendance 
ADD COLUMN photo_today VARCHAR(500) NULL 
AFTER marked_at;

ALTER TABLE attendance 
ADD COLUMN match_score DECIMAL(5,4) NULL 
AFTER photo_today;
```

## Step 2: Install Python Dependencies

```bash
cd Backend
pip install -r requirements.txt
```

**Note**: DeepFace installation may take some time as it downloads models on first use.

## Step 3: Start Python Face Recognition API

```bash
cd Backend
python face_recognition_api.py
```

The API will run on `http://localhost:5001` by default.

## Step 4: Configure Backend

Add to `Backend/.env`:
```
FACE_RECOGNITION_API_URL=http://localhost:5001
```

## Step 5: Create Upload Directories

The backend will auto-create these, but you can create manually:

```bash
mkdir -p Backend/uploads/reference_photos
mkdir -p Backend/uploads/daily_photos
```

## Step 6: Start Backend Server

```bash
cd Backend
npm start
# or
npm run dev
```

## Step 7: Start Frontend

```bash
cd Frontend
npm run dev
```

## Testing

1. **Login as Student**:
   - Use Student ID (roll number) instead of email
   - On first login, camera will open to capture reference photo

2. **Mark Attendance**:
   - Navigate to "Face Scan" in student dashboard
   - Click "Scan Face for Attendance"
   - Capture and submit photo

## Troubleshooting

- **Python API not starting**: Make sure port 5001 is available
- **Face not detected**: Ensure good lighting and clear face view
- **Attendance not saving**: Check if there's an active QR session (required by current schema)

## Important Note

The current attendance table schema requires a `qr_id`. For face-only attendance to work without QR sessions, you may want to:

1. Make `qr_id` nullable in attendance table, OR
2. Create a system/default QR session for face recognition attendance

