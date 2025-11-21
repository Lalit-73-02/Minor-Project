import express from "express";
import { body, validationResult } from "express-validator";
import { dbPromise } from "../src/config/db.js";
import { authenticate } from "../src/middleware/authMiddleware.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

const FACE_RECOGNITION_API_URL = process.env.FACE_RECOGNITION_API_URL || "http://localhost:5001";

// Face recognition attendance scan
router.post(
  "/scan",
  authenticate,
  [
    body("student_id").notEmpty().withMessage("Student ID is required"),
    body("today_photo").notEmpty().withMessage("Photo is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    try {
      const { student_id, today_photo } = req.body;

      // Verify student_id matches authenticated user
      if (req.user.role === "student") {
        const [studentRows] = await dbPromise.query(
          "SELECT roll_no FROM student_details WHERE user_id = ?",
          [req.user.id]
        );

        if (!studentRows.length || studentRows[0].roll_no !== student_id) {
          return res.status(403).json({ message: "Forbidden: Student ID mismatch" });
        }
      }

      // Fetch student's reference photo
      const [studentRows] = await dbPromise.query(
        "SELECT reference_photo FROM student_details WHERE roll_no = ?",
        [student_id]
      );

      if (!studentRows.length) {
        return res.status(404).json({ message: "Student not found" });
      }

      const referencePhotoPath = studentRows[0].reference_photo;

      if (!referencePhotoPath) {
        return res.status(400).json({ 
          message: "Reference photo not set. Please set your reference photo first." 
        });
      }

      // Read reference photo from file system
      const fullReferencePath = path.join(__dirname, "..", referencePhotoPath);
      if (!fs.existsSync(fullReferencePath)) {
        return res.status(404).json({ message: "Reference photo file not found" });
      }

      const referencePhotoBuffer = fs.readFileSync(fullReferencePath);
      const referencePhotoBase64 = referencePhotoBuffer.toString("base64");

      // Send both images to Python face recognition API
      const faceRecognitionResponse = await fetch(`${FACE_RECOGNITION_API_URL}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reference_photo: referencePhotoBase64,
          today_photo: today_photo,
        }),
      });

      if (!faceRecognitionResponse.ok) {
        const errorData = await faceRecognitionResponse.json();
        return res.status(faceRecognitionResponse.status).json({
          message: errorData.error || "Face recognition service error",
          match: false,
        });
      }

      const faceResult = await faceRecognitionResponse.json();

      if (!faceResult.match) {
        return res.status(400).json({
          message: "Face mismatch — try again",
          match: false,
          confidence: faceResult.confidence,
        });
      }

      // Face match successful - save attendance
      // Save today's photo
      const uploadsDir = path.join(__dirname, "../uploads/daily_photos");
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      let imageData = today_photo;
      if (today_photo.startsWith("data:")) {
        imageData = today_photo.split(",")[1];
      }

      const buffer = Buffer.from(imageData, "base64");
      const filename = `daily_${student_id}_${Date.now()}.jpg`;
      const filepath = path.join(uploadsDir, filename);
      const relativePath = `/uploads/daily_photos/${filename}`;

      fs.writeFileSync(filepath, buffer);

      // Insert attendance record
      // For face recognition, we use 'check-in' session_type
      // Check if qr_id is required (nullable) - if required, we'll need to handle it
      try {
        // Try to insert with qr_id as NULL first (if column allows NULL)
        await dbPromise.query(
          `INSERT INTO attendance (student_id, session_type, qr_id, photo_today, match_score, marked_at) 
           VALUES (?, 'check-in', NULL, ?, ?, NOW())`,
          [student_id, relativePath, faceResult.confidence]
        );
      } catch (err) {
        // If qr_id is required, get or create a default QR session for face recognition
        // For now, we'll try to get the most recent active QR or create a system one
        const [qrRows] = await dbPromise.query(
          `SELECT id FROM qr_codes_admin WHERE is_active = 1 ORDER BY generated_at DESC LIMIT 1`
        );
        
        const qrId = qrRows.length > 0 ? qrRows[0].id : null;
        
        if (!qrId) {
          // If no active QR, we can't mark attendance with current schema
          // You may want to modify the schema to make qr_id nullable or create a system QR
          return res.status(400).json({
            message: "No active attendance session. Please contact admin.",
            match: true,
          });
        }
        
        await dbPromise.query(
          `INSERT INTO attendance (student_id, session_type, qr_id, photo_today, match_score, marked_at) 
           VALUES (?, 'check-in', ?, ?, ?, NOW())`,
          [student_id, qrId, relativePath, faceResult.confidence]
        );
      }

      return res.json({
        message: "Attendance marked successfully",
        match: true,
        confidence: faceResult.confidence,
        photoPath: relativePath,
      });
    } catch (error) {
      console.error("Face attendance scan error", error);
      return res.status(500).json({ 
        message: "Failed to process attendance",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  }
);

export { router as faceAttendanceRoutes };

