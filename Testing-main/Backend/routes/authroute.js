import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { body, validationResult } from "express-validator";
import db, { dbPromise } from "../src/config/db.js";
import { authenticate } from "../src/middleware/authMiddleware.js";

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
    "SELECT roll_no, department, year FROM student_details WHERE user_id = ?",
    [userId]
  );

  return rows[0] || { roll_no: null, department: null, year: null };
};

const formatUserPayload = (user, studentProfile) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  rollNo: studentProfile?.roll_no || null,
  department: studentProfile?.department || null,
  year: studentProfile?.year || null,
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

          await connection.query(
            `INSERT INTO student_details (user_id, roll_no, department, year)
             VALUES (?, ?, ?, ?)`,
            [userId, rollNo, department, year]
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
    body("email").isEmail().withMessage("Valid email required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const { email, password } = req.body;

    try {
      const [rows] = await dbPromise.query("SELECT * FROM users WHERE email = ?", [
        email,
      ]);

      if (!rows.length) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const user = rows[0];
      const match = await bcrypt.compare(password, user.password);

      if (!match) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const studentProfile =
        user.role === "student" ? await fetchStudentProfile(user.id) : null;
      const payload = formatUserPayload(user, studentProfile);

      const token = issueToken(res, { id: user.id, role: user.role });
      return res.json({ user: payload, token });
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

export { router as authRoutes };
