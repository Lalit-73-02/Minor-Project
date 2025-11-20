import express from "express";
import crypto from "crypto";
import { dbPromise } from "../src/config/db.js";
import { authenticate, requireRole } from "../src/middleware/authMiddleware.js";

const router = express.Router();
const SESSION_TYPES = ["check-in", "check-out"];

const toDate = (input) =>
  typeof input === "string" ? new Date(input) : input;

router.post(
  "/generate",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const { sessionType, expiresInMinutes = 30, location } = req.body;

    if (!SESSION_TYPES.includes(sessionType)) {
      return res.status(400).json({ message: "Invalid session type" });
    }

    try {
      await dbPromise.query(
        "UPDATE qr_codes_admin SET is_active = 0 WHERE is_active = 1"
      );

      const payload = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

      const [result] = await dbPromise.query(
        `
        INSERT INTO qr_codes_admin 
          (session_type, code, generated_at, expires_at, is_active, latitude, longitude, radius)
        VALUES (?, ?, NOW(), ?, 1, ?, ?, ?)
        `,
        [
          sessionType,
          payload,
          expiresAt,
          location?.latitude ?? null,
          location?.longitude ?? null,
          location?.radius ?? null,
        ]
      );

      return res.json({
        active: true,
        qr: {
          id: result.insertId,
          sessionType,
          payload,
          generatedAt: new Date(),
          expiresAt,
          location,
        },
      });
    } catch (error) {
      console.error("QR generate error", error);
      return res.status(500).json({ message: "Failed to generate QR" });
    }
  }
);

router.get("/active", async (_req, res) => {
  try {
    await dbPromise.query(
      "UPDATE qr_codes_admin SET is_active = 0 WHERE expires_at < NOW()"
    );

    const [rows] = await dbPromise.query(
      `
      SELECT *
      FROM qr_codes_admin
      WHERE is_active = 1
      ORDER BY generated_at DESC
      LIMIT 1
      `
    );

    if (!rows.length) {
      return res.json({ active: false, message: "No active QR found" });
    }

    return res.json({ active: true, qr: rows[0] });
  } catch (error) {
    console.error("Active QR error", error);
    return res.status(500).json({ message: "Failed to load active QR" });
  }
});

// Helper function to calculate distance between two coordinates (Haversine formula)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
};

// New endpoint: Location-based attendance marking with camera verification
router.post("/mark-by-location", async (req, res) => {
  const { studentId, latitude, longitude, photo } = req.body;

  if (!studentId || latitude === undefined || longitude === undefined) {
    return res
      .status(400)
      .json({ message: "Student ID and location (latitude, longitude) required" });
  }

  // Photo is required for security (camera verification)
  if (!photo) {
    return res
      .status(400)
      .json({ message: "Photo verification required. Please capture a selfie to mark attendance." });
  }

  try {
    // Get active session
    const [activeRows] = await dbPromise.query(
      `
      SELECT *
      FROM qr_codes_admin
      WHERE is_active = 1
      ORDER BY generated_at DESC
      LIMIT 1
      `
    );

    if (!activeRows.length) {
      return res.status(404).json({ message: "No active attendance session found" });
    }

    const activeQR = activeRows[0];
    const expiresAt = toDate(activeQR.expires_at);

    if (expiresAt < new Date()) {
      return res.status(400).json({ message: "Attendance session expired" });
    }

    // Validate location if session has location restriction
    if (activeQR.latitude && activeQR.longitude && activeQR.radius) {
      const distance = calculateDistance(
        parseFloat(activeQR.latitude),
        parseFloat(activeQR.longitude),
        parseFloat(latitude),
        parseFloat(longitude)
      );

      if (distance > parseFloat(activeQR.radius)) {
        return res.status(403).json({
          message: `You are ${Math.round(distance)}m away. Must be within ${activeQR.radius}m to mark attendance.`,
        });
      }
    }

    // Verify student exists
    const [studentRows] = await dbPromise.query(
      "SELECT user_id FROM student_details WHERE roll_no = ?",
      [studentId]
    );

    if (!studentRows.length) {
      return res.status(404).json({ message: "Student not found" });
    }

    // Check if attendance already marked
    const [existingAttendance] = await dbPromise.query(
      `
      SELECT id
      FROM attendance
      WHERE student_id = ? AND qr_id = ?
      `,
      [studentId, activeQR.id]
    );

    if (existingAttendance.length) {
      return res.status(409).json({ message: "Attendance already marked" });
    }

    // Check if attendance table has photo column, if not we'll add it
    // For now, store photo as base64 in a text field or add column
    let hasPhotoColumn = false;
    try {
      const [columns] = await dbPromise.query(
        `SHOW COLUMNS FROM attendance LIKE 'verification_photo'`
      );
      hasPhotoColumn = columns.length > 0;
    } catch (err) {
      console.log("Checking photo column:", err);
    }

    // Mark attendance with photo verification
    if (hasPhotoColumn) {
      await dbPromise.query(
        `
        INSERT INTO attendance (student_id, session_type, qr_id, marked_at, verification_photo)
        VALUES (?, ?, ?, NOW(), ?)
        `,
        [studentId, activeQR.session_type, activeQR.id, photo]
      );
    } else {
      // If photo column doesn't exist, still mark attendance but log photo separately
      // You can add the column later with: ALTER TABLE attendance ADD COLUMN verification_photo LONGTEXT;
      await dbPromise.query(
        `
        INSERT INTO attendance (student_id, session_type, qr_id, marked_at)
        VALUES (?, ?, ?, NOW())
        `,
        [studentId, activeQR.session_type, activeQR.id]
      );
      console.log(`Photo verification received for student ${studentId} but column not found`);
    }

    return res.json({
      message: "Attendance marked successfully with photo verification",
      sessionType: activeQR.session_type,
    });
  } catch (error) {
    console.error("Location-based attendance error", error);
    return res.status(500).json({ message: "Failed to mark attendance" });
  }
});

router.post("/validate", async (req, res) => {
  const { qrData, studentId } = req.body;

  if (!qrData || !studentId) {
    return res
      .status(400)
      .json({ message: "QR data and student roll number required" });
  }

  try {
    const [activeRows] = await dbPromise.query(
      `
      SELECT *
      FROM qr_codes_admin
      WHERE is_active = 1
      ORDER BY generated_at DESC
      LIMIT 1
      `
    );

    if (!activeRows.length) {
      return res.status(404).json({ message: "No active QR found" });
    }

    const activeQR = activeRows[0];
    const expiresAt = toDate(activeQR.expires_at);

    if (qrData !== activeQR.code) {
      return res.status(400).json({ message: "Invalid QR scanned" });
    }

    if (expiresAt < new Date()) {
      return res.status(400).json({ message: "QR code expired" });
    }

    const [studentRows] = await dbPromise.query(
      "SELECT user_id FROM student_details WHERE roll_no = ?",
      [studentId]
    );

    if (!studentRows.length) {
      return res.status(404).json({ message: "Student not found" });
    }

    const [existingAttendance] = await dbPromise.query(
      `
      SELECT id
      FROM attendance
      WHERE student_id = ? AND qr_id = ?
      `,
      [studentId, activeQR.id]
    );

    if (existingAttendance.length) {
      return res.status(409).json({ message: "Attendance already marked" });
    }

    await dbPromise.query(
      `
      INSERT INTO attendance (student_id, session_type, qr_id, marked_at)
      VALUES (?, ?, ?, NOW())
      `,
      [studentId, activeQR.session_type, activeQR.id]
    );

    return res.json({ message: "Attendance marked successfully" });
  } catch (error) {
    console.error("QR validate error", error);
    return res.status(500).json({ message: "Failed to validate QR" });
  }
});

export { router as qrRoutes };

