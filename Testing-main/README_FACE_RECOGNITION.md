# Face Recognition Attendance System

This document describes the face recognition-based attendance system implementation.

## Features

1. **Student Login with Student ID**: Students can now login using their Student ID (roll number) instead of email
2. **First-Time Photo Capture**: On first login, students must capture a reference photo for face recognition
3. **Daily Face Attendance Scan**: Students can mark attendance by scanning their face daily
4. **DeepFace Integration**: Uses DeepFace library for accurate face matching

## Setup Instructions

### 1. Database Setup

Run the SQL migration to add required columns:

```sql
-- Run database/face_recognition_schema.sql
```

This adds:
- `reference_photo` column to `student_details` table
- `photo_today` and `match_score` columns to `attendance` table

### 2. Python Face Recognition API Setup

1. Install Python dependencies:
```bash
cd Backend
pip install -r requirements.txt
```

2. Start the Python API server:
```bash
python face_recognition_api.py
```

The API runs on port 5001 by default. You can change this by setting the `FACE_RECOGNITION_PORT` environment variable.

### 3. Backend Configuration

Add to your `.env` file:
```
FACE_RECOGNITION_API_URL=http://localhost:5001
```

### 4. Create Upload Directories

The backend will automatically create these directories, but you can create them manually:

```bash
mkdir -p Backend/uploads/reference_photos
mkdir -p Backend/uploads/daily_photos
```

## Usage

### Student Login

1. Students can login using either:
   - **Email** (existing method)
   - **Student ID** (roll number) - new method

2. On first login, if a student doesn't have a reference photo:
   - Camera will automatically open
   - Student must capture a clear photo
   - Photo is saved as reference for future face recognition

### Daily Attendance

1. Navigate to "Face Scan" in the student dashboard
2. Click "Scan Face for Attendance"
3. Camera opens - position face clearly
4. Click "Capture Photo"
5. Review photo and click "Submit Attendance"
6. System verifies face match using DeepFace
7. If match is successful, attendance is marked

## API Endpoints

### Backend Routes

- `POST /api/auth/login` - Login with email or student_id
  - Body: `{ email?: string, student_id?: string, password: string }`
  - Returns: `{ user, token, needsReferencePhoto?: boolean }`

- `POST /api/auth/save-reference-photo` - Save reference photo (authenticated)
  - Body: `{ photo: string }` (base64 image)

- `POST /api/face-attendance/scan` - Scan face for attendance (authenticated)
  - Body: `{ student_id: string, today_photo: string }` (base64 image)
  - Returns: `{ message, match, confidence, photoPath }`

### Python API

- `POST /verify` - Verify face match
  - Body: `{ reference_photo: string, today_photo: string }` (base64 images)
  - Returns: `{ match: boolean, confidence: number, distance, threshold }`

- `GET /health` - Health check

## Database Schema Changes

### student_details table
```sql
ALTER TABLE student_details 
ADD COLUMN reference_photo VARCHAR(500) NULL;
```

### attendance table
```sql
ALTER TABLE attendance 
ADD COLUMN photo_today VARCHAR(500) NULL;

ALTER TABLE attendance 
ADD COLUMN match_score DECIMAL(5,4) NULL;
```

## Notes

- The attendance table requires a `qr_id` for face recognition attendance. If no active QR session exists, attendance marking will fail. Consider making `qr_id` nullable or creating a system QR session for face recognition.

- Face recognition uses VGG-Face model with cosine distance metric. Confidence threshold is automatically determined by DeepFace.

- Photos are stored in:
  - Reference photos: `Backend/uploads/reference_photos/`
  - Daily photos: `Backend/uploads/daily_photos/`

## Troubleshooting

1. **Camera not opening**: Check browser permissions for camera access
2. **Face not detected**: Ensure good lighting and clear view of face
3. **Face mismatch**: Try again with better lighting, remove glasses/hat
4. **Python API not responding**: Check if Python server is running on port 5001
5. **No active QR session**: Contact admin to create an active attendance session

## Future Enhancements

- Make `qr_id` nullable in attendance table for face-only attendance
- Add confidence threshold configuration
- Add retry mechanism for failed face matches
- Add photo quality validation before submission

