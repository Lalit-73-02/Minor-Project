import express from "express";
import db from "../src/config/db.js";   // ✅ FIXED PATH

const router = express.Router();

// GET student by user_id
router.get("/by-user/:userId", (req, res) => {
  const userId = req.params.userId;

  if (!userId) {
    return res.status(400).json({ message: "User ID missing" });
  }

  const query = `
    SELECT 
      u.id AS user_id,
      u.name,
      u.email,
      s.roll_no,
      s.department,
      s.year
    FROM users u
    LEFT JOIN student_details s ON u.id = s.user_id
    WHERE u.id = ?
  `;

  db.query(query, [userId], (err, rows) => {
    if (err) {
      console.error("SQL Error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (rows.length === 0) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.json(rows[0]);
  });
});

export default router;
