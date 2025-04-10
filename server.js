require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());

// Database connection
const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'salon_booking',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test database connection
db.getConnection()
  .then((connection) => {
    console.log('✅ Connected to MySQL database');
    connection.release();
  })
  .catch((err) => {
    console.error('❌ Database connection failed:', err);
    process.exit(1);
  });

// Services endpoint
app.get('/api/services', async (req, res) => {
  try {
    const [services] = await db.query('SELECT * FROM services');
    res.json(services);
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

// Staff endpoint
app.get('/api/staff', async (req, res) => {
  try {
    const [staff] = await db.query('SELECT * FROM staff');
    res.json(staff);
  } catch (error) {
    console.error('Error fetching staff:', error);
    res.status(500).json({ error: 'Failed to fetch staff' });
  }
});

// Available slots endpoint
app.get('/api/available-slots', async (req, res) => {
  const { staffId, date } = req.query;
  
  if (!staffId || !date) {
    return res.status(400).json({ 
      success: false,
      error: 'Both staffId and date are required' 
    });
  }

  try {
    // Get all available slots for this staff member on this date
    const [availableSlots] = await db.query(
      'SELECT time_slot FROM available_slots WHERE staff_id = ? AND date = ?',
      [staffId, date]
    );

    // Get already booked slots
    const [bookedSlots] = await db.query(
      'SELECT start_time FROM bookings WHERE staff_id = ? AND booking_date = ?',
      [staffId, date]
    );

    // Filter out booked slots
    const bookedTimes = bookedSlots.map(slot => slot.start_time);
    const availableTimes = availableSlots
      .filter(slot => !bookedTimes.includes(slot.time_slot))
      .map(slot => slot.time_slot);

    res.json({
      success: true,
      slots: availableTimes
    });
  } catch (error) {
    console.error('Error fetching slots:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch available slots' 
    });
  }
});

// Create booking endpoint
app.post('/api/bookings', async (req, res) => {
  const { customer_id, service_id, staff_id, booking_date, start_time, end_time, notes } = req.body;

  if (!customer_id || !service_id || !staff_id || !booking_date || !start_time || !end_time) {
    return res.status(400).json({ 
      success: false,
      error: 'All required fields must be provided' 
    });
  }

  try {
    // Check for overlapping bookings
    const [existing] = await db.query(
      `SELECT id FROM bookings 
       WHERE staff_id = ? AND booking_date = ? 
       AND ((start_time < ? AND end_time > ?) OR (start_time = ?))`,
      [staff_id, booking_date, end_time, start_time, start_time]
    );

    if (existing.length > 0) {
      return res.status(409).json({ 
        success: false,
        error: 'This time slot is already booked' 
      });
    }

    // Create new booking
    await db.query(
      `INSERT INTO bookings 
       (customer_id, service_id, staff_id, booking_date, start_time, end_time, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [customer_id, service_id, staff_id, booking_date, start_time, end_time, notes || null]
    );

    res.json({ 
      success: true,
      message: 'Booking created successfully' 
    });
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create booking' 
    });
  }
});

// User registration
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const [existing] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (username, password) VALUES (?, ?)',
      [username, hashedPassword]
    );

    const token = jwt.sign({ id: result.insertId, username }, JWT_SECRET, { expiresIn: '1h' });
    
    res.status(201).json({ 
      success: true,
      message: 'Registration successful',
      token,
      user: { id: result.insertId, username }
    });
  } catch (error) {
    console.error('Registration failed:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// User login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1h' });
    
    res.json({ 
      success: true,
      message: 'Login successful',
      token,
      user: { id: user.id, username: user.username }
    });
  } catch (error) {
    console.error('Login failed:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});