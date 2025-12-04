import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { body, validationResult } from "express-validator";
import db, { dbPromise } from "../src/config/db.js";
import { authenticate } from "../src/middleware/authMiddleware.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

const issueToken = (res, payload, { setCookie = true } = {}) => {
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: "1d",
  });

  if (setCookie) {
    // Use separate cookie names for admin and student to prevent session overwrite
    const cookieName = payload.role === "admin" ? "attendo_admin_token" : "attendo_student_token";

    // Clear the other role's cookie if it exists
    const otherCookieName = payload.role === "admin" ? "attendo_student_token" : "attendo_admin_token";
    res.clearCookie(otherCookieName);

    res.cookie(cookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000,
    });
  }

  return token;
};

const fetchStudentProfile = async (userId) => {
  const [rows] = await dbPromise.query(
    "SELECT roll_no, department, year, reference_photo FROM student_details WHERE user_id = ?",
    [userId]
  );

  return rows[0] || { roll_no: null, department: null, year: null, reference_photo: null };
};

const formatUserPayload = (user, studentProfile) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  rollNo: studentProfile?.roll_no || null,
  department: studentProfile?.department || null,
  year: studentProfile?.year || null,
  referencePhoto: studentProfile?.reference_photo || null,
  createdAt: user.created_at,
});

router.post(
  "/register",
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email required"),
    body("password").isLength({ min: 6 }).withMessage("Password too short"),
    body("role").isIn(["admin", "student"]).withMessage("Invalid role"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const { name, email, password, role, rollNo, department, year } = req.body;

    try {
      const [existing] = await dbPromise.query(
        "SELECT id FROM users WHERE email = ?",
        [email]
      );

      if (existing.length) {
        return res.status(409).json({ message: "Email already registered" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const connection = await dbPromise.getConnection();
      try {
        await connection.beginTransaction();

        const [userResult] = await connection.query(
          "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
          [name, email, hashedPassword, role]
        );

        const userId = userResult.insertId;

        if (role === "student") {
          if (!rollNo || !department || !year) {
            await connection.rollback();
            return res
              .status(400)
              .json({ message: "Student details are required" });
          }

          let referencePhotoPath = null;
          if (req.body.referencePhoto) {
            try {
              const uploadsDir = path.join(__dirname, "../uploads/reference_photos");
              if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
              }

              let imageData = req.body.referencePhoto;
              if (imageData.startsWith("data:")) {
                imageData = imageData.split(",")[1];
              }

              const buffer = Buffer.from(imageData, "base64");
              const filename = `ref_${rollNo}_${Date.now()}.jpg`;
              const filepath = path.join(uploadsDir, filename);
              referencePhotoPath = `/uploads/reference_photos/${filename}`;

              fs.writeFileSync(filepath, buffer);
            } catch (err) {
              console.error("Error saving reference photo:", err);
              // Continue without photo if save fails, or you could rollback
            }
          }

          await connection.query(
            `INSERT INTO student_details (user_id, roll_no, department, year, reference_photo)
             VALUES (?, ?, ?, ?, ?)`,
            [userId, rollNo, department, year, referencePhotoPath]
          );
        }

        await connection.commit();

        const studentProfile =
          role === "student" ? await fetchStudentProfile(userId) : null;

        const payload = formatUserPayload(
          {
            id: userId,
            name,
            email,
            role,
            created_at: new Date(),
          },
          studentProfile
        );

        const token = issueToken(res, { id: userId, role });
        return res.status(201).json({ user: payload, token });
      } catch (err) {
        await connection.rollback();
        throw err;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error("Register error", error);
      return res.status(500).json({ message: "Registration failed" });
    }
  }
);

router.post(
  "/login",
  [
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const { email, student_id, password } = req.body;

    // Support both email and student_id login
    if (!email && !student_id) {
      return res.status(400).json({ message: "Email or Student ID is required" });
    }

    try {
      let user;

      if (student_id) {
        // Login with student_id (roll_no)
        const [studentRows] = await dbPromise.query(
          `SELECT u.*, s.roll_no 
           FROM users u 
           JOIN student_details s ON u.id = s.user_id 
           WHERE s.roll_no = ? AND u.role = 'student'`,
          [student_id]
        );

        if (!studentRows.length) {
          return res.status(401).json({ message: "Invalid credentials" });
        }

        user = studentRows[0];
      } else {
        // Login with email
        const [rows] = await dbPromise.query("SELECT * FROM users WHERE email = ?", [
          email,
        ]);

        if (!rows.length) {
          return res.status(401).json({ message: "Invalid credentials" });
        }

        user = rows[0];
      }

      const match = await bcrypt.compare(password, user.password);

      if (!match) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const studentProfile =
        user.role === "student" ? await fetchStudentProfile(user.id) : null;
      const payload = formatUserPayload(user, studentProfile);

      // Check if student needs to set reference photo
      const needsReferencePhoto = user.role === "student" && !studentProfile?.reference_photo;

      const token = issueToken(res, { id: user.id, role: user.role });
      return res.json({
        user: payload,
        token,
        needsReferencePhoto: needsReferencePhoto || false
      });
    } catch (error) {
      console.error("Login error", error);
      return res.status(500).json({ message: "Login failed" });
    }
  }
);

router.post("/logout", (req, res) => {
  // Clear both admin and student cookies
  res.clearCookie("attendo_admin_token");
  res.clearCookie("attendo_student_token");
  return res.json({ message: "Logged out" });
});

router.get("/me", authenticate, async (req, res) => {
  try {
    const [rows] = await dbPromise.query("SELECT * FROM users WHERE id = ?", [
      req.user.id,
    ]);

    if (!rows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = rows[0];
    const studentProfile =
      user.role === "student" ? await fetchStudentProfile(user.id) : null;
    const payload = formatUserPayload(user, studentProfile);
    const token = issueToken(res, { id: user.id, role: user.role }, { setCookie: false });
    return res.json({ user: payload, token });
  } catch (error) {
    console.error("Me error", error);
    return res.status(500).json({ message: "Unable to fetch profile" });
  }
});

// Legacy endpoint retained for QR scanner compatibility
router.get("/current-user/:id", async (req, res) => {
  const userId = req.params.id;
  if (!userId) return res.status(400).json({ message: "User ID missing" });

  try {
    const [rows] = await dbPromise.query("SELECT * FROM users WHERE id = ?", [
      userId,
    ]);
    if (!rows.length) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = rows[0];
    const studentProfile =
      user.role === "student" ? await fetchStudentProfile(user.id) : null;

    return res.json(formatUserPayload(user, studentProfile));
  } catch (error) {
    return res.status(500).json({ message: "Database error" });
  }
});

// Save reference photo on first login
router.post(
  "/save-reference-photo",
  authenticate,
  [
    body("photo").notEmpty().withMessage("Photo is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Only students can save reference photos" });
    }

    try {
      const { photo } = req.body;

      // Get student roll_no
      const [studentRows] = await dbPromise.query(
        "SELECT roll_no FROM student_details WHERE user_id = ?",
        [req.user.id]
      );

      if (!studentRows.length) {
        return res.status(404).json({ message: "Student not found" });
      }

      const rollNo = studentRows[0].roll_no;

      // Create uploads directory if it doesn't exist
      const uploadsDir = path.join(__dirname, "../uploads/reference_photos");
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      // Decode base64 image
      let imageData = photo;
      if (photo.startsWith("data:")) {
        imageData = photo.split(",")[1];
      }

      const buffer = Buffer.from(imageData, "base64");
      const filename = `ref_${rollNo}_${Date.now()}.jpg`;
      const filepath = path.join(uploadsDir, filename);
      const relativePath = `/uploads/reference_photos/${filename}`;

      // Save file
      fs.writeFileSync(filepath, buffer);

      // Update database
      await dbPromise.query(
        "UPDATE student_details SET reference_photo = ? WHERE user_id = ?",
        [relativePath, req.user.id]
      );

      return res.json({
        message: "Reference photo saved successfully",
        photoPath: relativePath
      });
    } catch (error) {
      console.error("Save reference photo error", error);
      return res.status(500).json({ message: "Failed to save reference photo" });
    }
  }
);

export { router as authRoutes };
