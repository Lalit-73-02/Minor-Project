import express from "express";
import { dbPromise } from "../src/config/db.js";
import { authenticate, requireRole } from "../src/middleware/authMiddleware.js";

const router = express.Router();
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
  async (req, res) => {
    const { startDate, endDate, department } = req.query;

    try {
      const conditions = [];
      const params = [];

      if (startDate) {
        conditions.push("DATE(a.marked_at) >= ?");
        params.push(startDate);
      }

      if (endDate) {
        conditions.push("DATE(a.marked_at) <= ?");
        params.push(endDate);
      }

      if (department) {
        conditions.push("s.department = ?");
        params.push(department);
      }

      const whereClause = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

      const [rows] = await dbPromise.query(
        `
        SELECT 
          a.id,
          a.student_id AS rollNo,
          u.name AS studentName,
          u.email AS studentEmail,
          s.department,
          s.year,
          a.session_type AS sessionType,
          a.marked_at AS markedAt,
          qr.generated_at AS qrGeneratedAt
        FROM attendance a
        JOIN student_details s ON s.roll_no = a.student_id
        JOIN users u ON u.id = s.user_id
        JOIN qr_codes_admin qr ON qr.id = a.qr_id
        ${whereClause}
        ORDER BY a.marked_at DESC
        LIMIT 1000
        `,
        params
      );

      return res.json({ records: rows });
    } catch (error) {
      console.error("Attendance fetch error", error);
      return res.status(500).json({ message: "Failed to load attendance" });
    }
  }
);

router.get(
  "/student/:rollNo",
  authenticate,
  async (req, res) => {
    const { rollNo } = req.params;

    try {
      if (req.user.role === "student") {
        const [studentRows] = await dbPromise.query(
          "SELECT roll_no FROM student_details WHERE user_id = ?",
          [req.user.id]
        );

        const ownRoll = studentRows[0]?.roll_no;
        if (!ownRoll || ownRoll !== rollNo) {
          return res.status(403).json({ message: "Forbidden" });
        }
      }

      const { start, end } = getWindowRange();

      const [records] = await dbPromise.query(
        `
        SELECT 
          a.id,
          a.session_type AS sessionType,
          a.marked_at AS markedAt,
          DATE(a.marked_at) AS attendanceDate
        FROM attendance a
        WHERE a.student_id = ?
        ORDER BY a.marked_at DESC
        LIMIT 200
        `,
        [rollNo]
      );

      const uniqueDays = new Set(
        records
          .filter((record) => record.attendanceDate >= start && record.attendanceDate <= end)
          .map((record) => record.attendanceDate)
      );

      const presentDays = uniqueDays.size;
      const totalDays = ATTENDANCE_WINDOW_DAYS;
      const percentage = totalDays
        ? Math.round((presentDays / totalDays) * 100)
        : 0;

      return res.json({
        records,
        stats: {
          presentDays,
          totalDays,
          percentage,
        },
      });
    } catch (error) {
      console.error("Student attendance error", error);
      return res.status(500).json({ message: "Unable to load student data" });
    }
  }
);

router.get(
  "/stats/overview",
  authenticate,
  requireRole("admin"),
  async (_req, res) => {
    try {
      const { start, end } = getWindowRange();

      const [[aggregates]] = await dbPromise.query(`
        SELECT 
          (SELECT COUNT(*) FROM student_details) AS totalStudents,
          (
            SELECT COUNT(DISTINCT student_id)
            FROM attendance
            WHERE DATE(marked_at) = CURDATE()
          ) AS presentToday
      `);

      const [dailyCounts] = await dbPromise.query(
        `
        SELECT DATE(marked_at) AS date, COUNT(DISTINCT student_id) AS presents
        FROM attendance
        WHERE DATE(marked_at) BETWEEN DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND CURDATE()
        GROUP BY DATE(marked_at)
        ORDER BY date
        `
      );

      const [studentWindows] = await dbPromise.query(
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
        ORDER BY u.name
        `,
        [start, end]
      );

      const totalStudents = aggregates?.totalStudents || 0;
      const percentages = studentWindows.map((s) =>
        ATTENDANCE_WINDOW_DAYS
          ? Math.round((s.presentDays / ATTENDANCE_WINDOW_DAYS) * 100)
          : 0
      );

      const avgAttendance =
        percentages.length > 0
          ? Math.round(
              percentages.reduce((sum, value) => sum + value, 0) /
                percentages.length
            )
          : 0;

      const lowAttendance = percentages.filter((value) => value < 75).length;

      return res.json({
        totals: {
          totalStudents,
          presentToday: aggregates?.presentToday || 0,
          absentToday: Math.max(
            totalStudents - (aggregates?.presentToday || 0),
            0
          ),
          avgAttendance,
          lowAttendance,
        },
        last7Days: dailyCounts.map((day) => ({
          date: day.date,
          attendance: day.presents,
        })),
        students: studentWindows.map((student, index) => ({
          ...student,
          attendancePercentage: percentages[index],
        })),
      });
    } catch (error) {
      console.error("Attendance overview error", error);
      return res.status(500).json({ message: "Unable to load analytics" });
    }
  }
);

export { router as attendanceRoutes };

