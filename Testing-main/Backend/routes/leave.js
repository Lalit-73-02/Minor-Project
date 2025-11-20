import express from "express";
import { body, validationResult } from "express-validator";
import { dbPromise } from "../src/config/db.js";
import { authenticate, requireRole } from "../src/middleware/authMiddleware.js";

const router = express.Router();
const STATUS_VALUES = ["pending", "approved", "rejected"];

const getStudentMeta = async (userId) => {
  const [rows] = await dbPromise.query(
    `
    SELECT s.roll_no AS rollNo, u.name, u.email
    FROM student_details s
    JOIN users u ON u.id = s.user_id
    WHERE s.user_id = ?
    `,
    [userId]
  );
  return rows[0];
};

router.post(
  "/",
  authenticate,
  requireRole("student"),
  [
    body("startDate").isISO8601().toDate(),
    body("endDate").isISO8601().toDate(),
    body("reason").trim().isLength({ min: 5 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    try {
      const student = await getStudentMeta(req.user.id);
      if (!student) {
        return res.status(404).json({ message: "Student profile missing" });
      }

      const { startDate, endDate, reason } = req.body;

      const [result] = await dbPromise.query(
        `
        INSERT INTO leave_applications (user_id, roll_no, start_date, end_date, reason, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
        `,
        [
          req.user.id,
          student.rollNo,
          startDate,
          endDate,
          reason,
        ]
      );

      return res.status(201).json({
        application: {
          id: result.insertId,
          userId: req.user.id,
          rollNo: student.rollNo,
          startDate,
          endDate,
          reason,
          status: "pending",
        },
      });
    } catch (error) {
      console.error("Leave create error", error);
      return res.status(500).json({ message: "Failed to submit leave" });
    }
  }
);

router.get(
  "/mine",
  authenticate,
  requireRole("student"),
  async (req, res) => {
    try {
      const student = await getStudentMeta(req.user.id);
      if (!student) {
        return res.status(404).json({ message: "Student profile missing" });
      }

      const [rows] = await dbPromise.query(
        `
        SELECT 
          id,
          start_date AS startDate,
          end_date AS endDate,
          reason,
          status,
          created_at AS appliedAt,
          updated_at AS updatedAt
        FROM leave_applications
        WHERE user_id = ?
        ORDER BY created_at DESC
        `,
        [req.user.id]
      );

      return res.json({ applications: rows });
    } catch (error) {
      console.error("Leave mine error", error);
      return res.status(500).json({ message: "Failed to load leave history" });
    }
  }
);

router.get(
  "/",
  authenticate,
  requireRole("admin"),
  async (_req, res) => {
    try {
      const [rows] = await dbPromise.query(`
        SELECT 
          l.id,
          l.roll_no AS rollNo,
          u.name,
          u.email,
          l.start_date AS startDate,
          l.end_date AS endDate,
          l.reason,
          l.status,
          l.created_at AS appliedAt,
          l.updated_at AS updatedAt
        FROM leave_applications l
        JOIN users u ON u.id = l.user_id
        ORDER BY l.created_at DESC
      `);

      return res.json({ applications: rows });
    } catch (error) {
      console.error("Leave list error", error);
      return res.status(500).json({ message: "Failed to load leave applications" });
    }
  }
);

router.patch(
  "/:id",
  authenticate,
  requireRole("admin"),
  [body("status").isIn(STATUS_VALUES)],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const { id } = req.params;
    const { status } = req.body;

    try {
      const [result] = await dbPromise.query(
        `
        UPDATE leave_applications
        SET status = ?, updated_at = NOW()
        WHERE id = ?
        `,
        [status, id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Application not found" });
      }

      return res.json({ message: "Status updated" });
    } catch (error) {
      console.error("Leave status error", error);
      return res.status(500).json({ message: "Failed to update status" });
    }
  }
);

export { router as leaveRoutes };

