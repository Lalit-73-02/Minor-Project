import express from "express";
import bcrypt from "bcryptjs";
import { body, validationResult } from "express-validator";
import { dbPromise } from "../src/config/db.js";
import { authenticate, requireRole } from "../src/middleware/authMiddleware.js";

const router = express.Router();
const YEAR_VALUES = ["1st year", "2nd year", "3rd year", "4th year"];
const ATTENDANCE_WINDOW_DAYS = 30;

const formatDate = (date) => date.toISOString().slice(0, 10);

const getWindowRange = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (ATTENDANCE_WINDOW_DAYS - 1));

  return {
    start: formatDate(start),
    end: formatDate(end),
  };
};

router.get(
  "/",
  authenticate,
  requireRole("admin"),
  async (_req, res) => {
    try {
      const { start, end } = getWindowRange();

      const [students] = await dbPromise.query(
        `
        SELECT 
          u.id,
          u.name,
          u.email,
          s.roll_no AS rollNo,
          s.department,
          s.year,
          COUNT(
            DISTINCT CASE 
              WHEN DATE(a.marked_at) BETWEEN ? AND ?
              THEN DATE(a.marked_at)
            END
          ) AS presentDays
        FROM student_details s
        JOIN users u ON u.id = s.user_id
        LEFT JOIN attendance a ON a.student_id = s.roll_no
        GROUP BY u.id, u.name, u.email, s.roll_no, s.department, s.year
        ORDER BY u.name ASC
        `,
        [start, end]
      );

      const records = students.map((student) => {
        const percentage = ATTENDANCE_WINDOW_DAYS
          ? Math.round((student.presentDays / ATTENDANCE_WINDOW_DAYS) * 100)
          : 0;
        return {
          ...student,
          attendancePercentage: percentage,
          totalDays: ATTENDANCE_WINDOW_DAYS,
        };
      });

      return res.json({ students: records });
    } catch (error) {
      console.error("Students fetch error", error);
      return res.status(500).json({ message: "Failed to load students" });
    }
  }
);

router.post(
  "/",
  authenticate,
  requireRole("admin"),
  [
    body("name").trim().notEmpty(),
    body("email").isEmail(),
    body("rollNo").trim().notEmpty(),
    body("department").trim().notEmpty(),
    body("year").isIn(YEAR_VALUES),
    body("password")
      .optional()
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const { name, email, rollNo, department, year, password } = req.body;

    try {
      const [existingEmailRows] = await dbPromise.query(
        "SELECT id FROM users WHERE email = ?",
        [email]
      );
      if (existingEmailRows.length) {
        return res.status(409).json({ message: "Email already exists" });
      }

      const [existingRollRows] = await dbPromise.query(
        "SELECT id FROM student_details WHERE roll_no = ?",
        [rollNo]
      );
      if (existingRollRows.length) {
        return res.status(409).json({ message: "Roll number already registered" });
      }

      const hashed = await bcrypt.hash(password || rollNo, 10);

      const connection = await dbPromise.getConnection();
      try {
        await connection.beginTransaction();

        const [userResult] = await connection.query(
          "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'student')",
          [name, email, hashed]
        );

        await connection.query(
          "INSERT INTO student_details (user_id, roll_no, department, year) VALUES (?, ?, ?, ?)",
          [userResult.insertId, rollNo, department, year]
        );

        await connection.commit();

        return res.status(201).json({
          student: {
            id: userResult.insertId,
            name,
            email,
            rollNo,
            department,
            year,
            attendancePercentage: 0,
            totalDays: ATTENDANCE_WINDOW_DAYS,
            presentDays: 0,
          },
          defaultPassword: password ? undefined : rollNo,
        });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error("Create student error", error);
      return res.status(500).json({ message: "Failed to create student" });
    }
  }
);

router.patch(
  "/:userId",
  authenticate,
  requireRole("admin"),
  [
    body("name").optional().trim().notEmpty(),
    body("email").optional().isEmail(),
    body("department").optional().trim().notEmpty(),
    body("year").optional().isIn(YEAR_VALUES),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const { userId } = req.params;
    const { name, email, department, year } = req.body;

    try {
      const connection = await dbPromise.getConnection();
      try {
        await connection.beginTransaction();

        if (name || email) {
          await connection.query(
            `
            UPDATE users
            SET name = COALESCE(?, name),
                email = COALESCE(?, email)
            WHERE id = ?
            `,
            [name ?? null, email ?? null, userId]
          );
        }

        if (department || year) {
          await connection.query(
            `
            UPDATE student_details
            SET department = COALESCE(?, department),
                year = COALESCE(?, year)
            WHERE user_id = ?
            `,
            [department ?? null, year ?? null, userId]
          );
        }

        await connection.commit();
        return res.json({ message: "Student updated" });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error("Update student error", error);
      return res.status(500).json({ message: "Failed to update student" });
    }
  }
);

router.delete(
  "/:userId",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const { userId } = req.params;

    try {
      const [result] = await dbPromise.query("DELETE FROM users WHERE id = ?", [
        userId,
      ]);

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Student not found" });
      }

      return res.json({ message: "Student deleted" });
    } catch (error) {
      console.error("Delete student error", error);
      return res.status(500).json({ message: "Failed to delete student" });
    }
  }
);

export { router as studentAdminRoutes };

