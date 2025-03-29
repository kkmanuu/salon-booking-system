require("dotenv").config();
const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key";

app.use(cors({ origin: "http://localhost:3000", credentials: true }));
app.use(express.json());

// Database connection
const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "salon_booking",
});

// Test database connection
db.getConnection()
  .then((connection) => {
    console.log("✅ Connected to MySQL database");
    connection.release();
  })
  .catch((err) => {
    console.error("❌ Database connection failed:", err);
    process.exit(1);
  });

/**
 * 📌 Login User
 */
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const [users] = await db.query("SELECT * FROM users WHERE username = ?", [username]);
    if (users.length === 0) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "1h" });

    res.json({ message: "✅ Login successful", token, user: { id: user.id, username: user.username } });
  } catch (error) {
    res.status(500).json({ error: "Login failed" });
  }
});

/**
 * 📌 Create Booking
 */
app.post("/api/bookings", async (req, res) => {
  try {
    console.log("📩 Received booking request:", req.body);

    const { customer_id, service_id, staff_id, booking_date, start_time, notes } = req.body;
    
    if (!customer_id || !service_id || !staff_id || !booking_date || !start_time) {
      console.error("❌ Missing fields:", { customer_id, service_id, staff_id, booking_date, start_time });
      return res.status(400).json({ error: "Missing required fields", missingFields: { customer_id, service_id, staff_id, booking_date, start_time } });
    }

    // Insert booking
    await db.query(
      `INSERT INTO bookings (customer_id, service_id, staff_id, booking_date, start_time, notes) VALUES (?, ?, ?, ?, ?, ?)`,
      [customer_id, service_id, staff_id, booking_date, start_time, notes || null]
    );

    console.log("✅ Booking successful");
    res.json({ message: "Booking created successfully" });
  } catch (error) {
    console.error("❌ Error creating booking:", error);
    res.status(500).json({ error: "Failed to create booking" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
