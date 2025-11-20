import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import db from "./src/config/db.js";
import { qrRoutes } from "./routes/qrRoutes.js";
import studentRoutes from "./routes/student.js";
import { authRoutes } from "./routes/authroute.js";
import { attendanceRoutes } from "./routes/attendance.js";
import { studentAdminRoutes } from "./routes/students.js";
import { leaveRoutes } from "./routes/leave.js";

dotenv.config();

const app = express();

const clientOriginEnv = process.env.CLIENT_URL || "http://localhost:5173,http://localhost:8080";
const allowedOrigins = clientOriginEnv.split(",").map((origin) => origin.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"), false);
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

const port = process.env.PORT || 5000;

app.get("/", (_req, res) => {
  res.json({ message: "Attendo API running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/qrcode", qrRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/admin/students", studentAdminRoutes);
app.use("/api/leave", leaveRoutes);

app.get("/test-db", (_req, res) => {
  db.query("SELECT DATABASE() AS db", (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "DB Connected!", database: result[0].db });
  });
});

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
