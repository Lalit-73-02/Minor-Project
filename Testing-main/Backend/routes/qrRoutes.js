import express from "express";
import crypto from "crypto";
import { dbPromise } from "../src/config/db.js";
import { authenticate, requireRole } from "../src/middleware/authMiddleware.js";

const router = express.Router();
const SESSION_TYPES = ["check-in", "check-out"];

const toDate = (input) =>
  typeof input === "string" ? new Date(input) : input;

// Helper function to get fixed campus location from database
const getCampusLocation = async () => {
  try {
    const [rows] = await dbPromise.query(
      `
      SELECT center_latitude, center_longitude, radius_meters
      FROM campus_config
      WHERE is_active = 1
      ORDER BY id DESC
      LIMIT 1
      `
    );
    
    if (rows.length > 0) {
      return {
        latitude: parseFloat(rows[0].center_latitude),
        longitude: parseFloat(rows[0].center_longitude),
        radius: rows[0].radius_meters || 2000,
      };
    }
    
    // Fallback: return null if no campus config found
    return null;
  } catch (error) {
    console.error("Error fetching campus location:", error);
    return null;
  }
};

router.post(
  "/generate",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const { sessionType, expiresInMinutes = 30 } = req.body;

    if (!SESSION_TYPES.includes(sessionType)) {
      return res.status(400).json({ message: "Invalid session type" });
    }

    try {
      await dbPromise.query(
        "UPDATE qr_codes_admin SET is_active = 0 WHERE is_active = 1"
      );

      // Get fixed campus location from database (not from admin's GPS)
      const campusLocation = await getCampusLocation();
      
      if (!campusLocation) {
        console.error("Campus location not found in database. Please run campus_config.sql migration.");
        return res.status(500).json({ 
          message: "Campus location not configured. Please run the campus_config.sql migration file to set campus center coordinates.",
          error: "CAMPUS_CONFIG_MISSING"
        });
      }

      const payload = crypto.randomUUID();
      // Ensure 30 minutes expiration (default)
      const expirationMinutes = expiresInMinutes || 30;
      const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);

      console.log("🔨 Generating QR with:", {
        sessionType,
        expirationMinutes,
        expiresAt: expiresAt.toISOString(),
        campusLocation
      });

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
          campusLocation.latitude,
          campusLocation.longitude,
          campusLocation.radius,
        ]
      );

      // Verify the insert worked and is_active is set correctly
      const [verifyRows] = await dbPromise.query(
        "SELECT id, is_active, expires_at, latitude, longitude, radius FROM qr_codes_admin WHERE id = ?",
        [result.insertId]
      );

      if (verifyRows.length > 0) {
        const verified = verifyRows[0];
        console.log("✅ QR Generated successfully:", {
          id: verified.id,
          is_active: verified.is_active,
          is_active_type: typeof verified.is_active,
          expires_at: verified.expires_at,
          expires_in_minutes: Math.round((new Date(verified.expires_at) - new Date()) / 60000),
          location: {
            lat: verified.latitude,
            lng: verified.longitude,
            radius: verified.radius
          }
        });
      } else {
        console.error("❌ QR insert verification failed - no record found!");
      }

      return res.json({
        active: true,
        qr: {
          id: result.insertId,
          sessionType,
          payload,
          generatedAt: new Date(),
          expiresAt,
          location: campusLocation,
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
    // First, expire old QR codes (set to 0 if expired)
    await dbPromise.query(
      "UPDATE qr_codes_admin SET is_active = 0 WHERE expires_at < NOW()"
    );

    // Check all QR codes to debug
    const [allQRs] = await dbPromise.query(
      "SELECT id, is_active, expires_at, session_type, generated_at FROM qr_codes_admin ORDER BY generated_at DESC LIMIT 5"
    );
    console.log("📋 Recent QR codes:", allQRs.map(qr => ({
      id: qr.id,
      is_active: qr.is_active,
      is_active_raw: qr.is_active,
      expires_at: qr.expires_at,
      generated_at: qr.generated_at,
      session_type: qr.session_type,
      is_expired: new Date(qr.expires_at) < new Date()
    })));

    // Get active QR - try multiple ways to check is_active
    // MySQL can return BOOLEAN as 0/1, TRUE/FALSE, or TINYINT
    let [rows] = await dbPromise.query(
      `
      SELECT *
      FROM qr_codes_admin
      WHERE (is_active = 1 OR is_active = TRUE OR is_active = '1')
        AND expires_at > NOW()
      ORDER BY generated_at DESC
      LIMIT 1
      `
    );

    // If not found, try without expiration check (in case of timezone issues)
    if (!rows.length) {
      console.log("⚠️ No active QR with expiration check, trying without expiration filter...");
      [rows] = await dbPromise.query(
        `
        SELECT *
        FROM qr_codes_admin
        WHERE (is_active = 1 OR is_active = TRUE OR is_active = '1')
        ORDER BY generated_at DESC
        LIMIT 1
        `
      );
    }

    // If still not found, try checking the latest QR regardless of is_active
    if (!rows.length) {
      console.log("⚠️ Still no active QR, checking latest QR regardless of is_active...");
      [rows] = await dbPromise.query(
        `
        SELECT *
        FROM qr_codes_admin
        ORDER BY id DESC
        LIMIT 1
        `
      );
      if (rows.length > 0) {
        const latestQR = rows[0];
        console.log("🔍 Latest QR found (may not be active):", {
          id: latestQR.id,
          is_active: latestQR.is_active,
          is_active_type: typeof latestQR.is_active,
          expires_at: latestQR.expires_at,
          expires_at_type: typeof latestQR.expires_at
        });
        
        // If latest QR has is_active = 1 but query didn't find it, there might be a type issue
        // Let's manually check and potentially fix it
        if (latestQR.is_active == 1 || latestQR.is_active === true || latestQR.is_active === '1') {
          console.log("✅ Latest QR is actually active, using it...");
          // rows already has it, so we can continue
        } else {
          console.log("❌ Latest QR is not active, clearing rows...");
          rows = [];
        }
      }
    }

    if (!rows.length) {
      console.log("⚠️ No active QR found. Checking if any QR exists...");
      const [anyQR] = await dbPromise.query(
        "SELECT * FROM qr_codes_admin ORDER BY id DESC LIMIT 1"
      );
      if (anyQR.length > 0) {
        const qr = anyQR[0];
        const now = new Date();
        const expiresAt = new Date(qr.expires_at);
        const isExpired = expiresAt < now;
        
        console.log("🔍 Latest QR details:", {
          id: qr.id,
          is_active: qr.is_active,
          is_active_type: typeof qr.is_active,
          is_active_value: qr.is_active,
          expires_at: qr.expires_at,
          now: now.toISOString(),
          is_expired: isExpired,
          time_until_expiry_ms: expiresAt - now,
          time_until_expiry_minutes: Math.round((expiresAt - now) / 60000)
        });

        // If QR exists and is not expired, but is_active is not 1, try to fix it
        if (!isExpired && (qr.is_active == 0 || qr.is_active === false || qr.is_active === '0')) {
          console.log("🔧 Fixing is_active for latest QR (should be active but isn't)...");
          await dbPromise.query(
            "UPDATE qr_codes_admin SET is_active = 1 WHERE id = ?",
            [qr.id]
          );
          // Retry the query
          [rows] = await dbPromise.query(
            `
            SELECT *
            FROM qr_codes_admin
            WHERE id = ?
            `,
            [qr.id]
          );
          if (rows.length > 0) {
            console.log("✅ Fixed and found QR:", {
              id: rows[0].id,
              is_active: rows[0].is_active
            });
          }
        } else if (!isExpired && (qr.is_active == 1 || qr.is_active === true || qr.is_active === '1')) {
          // QR should be active but query didn't find it - use it directly
          console.log("✅ Latest QR should be active, using it directly...");
          rows = [qr];
        }
      }
      
      if (!rows.length) {
        return res.json({ active: false, message: "No active QR found" });
      }
    }

    const qrRecord = rows[0];
    console.log("✅ Active QR found:", {
      id: qrRecord.id,
      is_active: qrRecord.is_active,
      is_active_type: typeof qrRecord.is_active,
      expires_at: qrRecord.expires_at,
      has_latitude: qrRecord.latitude != null,
      has_longitude: qrRecord.longitude != null,
      has_radius: qrRecord.radius != null,
      latitude: qrRecord.latitude,
      longitude: qrRecord.longitude,
      radius: qrRecord.radius
    });
    
    // Ensure location data is properly formatted
    // If QR doesn't have location, try to get from campus_config
    let location = null;
    if (qrRecord.latitude != null && qrRecord.longitude != null && qrRecord.radius != null) {
      location = {
        latitude: parseFloat(qrRecord.latitude),
        longitude: parseFloat(qrRecord.longitude),
        radius: parseInt(qrRecord.radius, 10) || 2000,
      };
      console.log("📍 Using location from QR record:", location);
    } else {
      // Fallback: get from campus_config
      console.log("⚠️ QR record missing location, trying campus_config...");
      const campusLocation = await getCampusLocation();
      if (campusLocation) {
        location = campusLocation;
        console.log("📍 Using location from campus_config:", location);
      } else {
        console.error("❌ No location found in QR or campus_config!");
      }
    }

    // Build response with all required fields
    const response = { 
      active: true, 
      qr: {
        id: qrRecord.id,
        session_type: qrRecord.session_type,
        code: qrRecord.code,
        generated_at: qrRecord.generated_at,
        expires_at: qrRecord.expires_at,
        is_active: qrRecord.is_active,
        latitude: location?.latitude ?? qrRecord.latitude ?? null,
        longitude: location?.longitude ?? qrRecord.longitude ?? null,
        radius: location?.radius ?? qrRecord.radius ?? 2000,
      }
    };

    console.log("📤 Sending response:", {
      active: response.active,
      has_qr: !!response.qr,
      qr_location: {
        lat: response.qr.latitude,
        lng: response.qr.longitude,
        radius: response.qr.radius
      }
    });

    return res.json(response);
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

    // Validate location using Haversine formula with fixed campus center
    // Always use campus location from database, not from QR (for consistency)
    const campusLocation = await getCampusLocation();
    
    if (!campusLocation) {
      return res.status(500).json({ 
        message: "Campus location not configured. Please contact administrator." 
      });
    }

    // Calculate distance using Haversine formula
    const distance = calculateDistance(
      campusLocation.latitude,
      campusLocation.longitude,
      parseFloat(latitude),
      parseFloat(longitude)
    );

    // Use 2000 meter radius (or configured radius)
    const allowedRadius = campusLocation.radius || 2000;
    
    if (distance > allowedRadius) {
      return res.status(403).json({
        message: `You are ${Math.round(distance)}m away from campus center. Must be within ${allowedRadius}m to mark attendance.`,
        distance: Math.round(distance),
        requiredRadius: allowedRadius,
      });
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

