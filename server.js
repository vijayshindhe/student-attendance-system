require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('./database');
const path = require('path');

// Auto-initialize tables for empty cloud DBs seamlessly
const initDB = async () => {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(100) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            role ENUM('teacher', 'student') NOT NULL DEFAULT 'student',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        await pool.query(`CREATE TABLE IF NOT EXISTS attendance (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            record_date DATE NOT NULL,
            status ENUM('Present', 'Absent') DEFAULT 'Present',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE KEY unique_attendance_per_day (user_id, record_date)
        )`);
        console.log("Database tables verified/created successfully.");
    } catch (err) {
        console.error("Error verifying database tables:", err.message);
    }
};
initDB();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// User Registration
app.post('/api/register', async (req, res) => {
    const { name, email, password, role } = req.body;
    try {
        const [existing] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (existing.length > 0) return res.status(400).json({ error: 'Email already exists' });

        const hash = await bcrypt.hash(password, 10);
        const userRole = role === 'teacher' ? 'teacher' : 'student';
        await pool.query('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [name, email, hash, userRole]);
        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        console.error('REGISTER ERROR:', err.message, err.code);
        res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

// User Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        const user = users[0];
        if (!user) return res.status(400).json({ error: 'Invalid email or password' });

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(400).json({ error: 'Invalid email or password' });

        const token = jwt.sign({ userId: user.id, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ message: 'Login successful', token, name: user.name, role: user.role });
    } catch (err) {
        console.error('LOGIN ERROR:', err.message, err.code);
        res.status(500).json({ error: 'Database error', detail: err.message });
    }
});

// Middleware for JWT Authentication
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

// Mark Attendance (Teacher Only)
app.post('/api/attendance', authenticateToken, async (req, res) => {
    if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Only teachers can mark attendance' });

    const { student_id, status, date } = req.body;
    try {
        await pool.query(
            'INSERT INTO attendance (user_id, status, record_date) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE status = ?',
            [student_id, status || 'Present', date, status || 'Present']
        );
        res.json({ message: 'Attendance marked successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to mark attendance' });
    }
});

// Get Student Roster and Today's Attendance (Teacher Only)
app.get('/api/teacher/dashboard', authenticateToken, async (req, res) => {
    if (req.user.role !== 'teacher') return res.status(403).json({ error: 'Unauthorized role' });
    const { date } = req.query; // Expects YYYY-MM-DD

    try {
        const query = `
            SELECT u.id as student_id, u.name, COALESCE(a.status, 'Unmarked') as status
            FROM users u
            LEFT JOIN attendance a ON u.id = a.user_id AND a.record_date = ?
            WHERE u.role = 'student'
            ORDER BY u.name ASC
        `;
        const [students] = await pool.query(query, [date]);
        res.json(students);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch student roster' });
    }
});

// Fallback: Get Single Student Attendance Records (If student logs in)
app.get('/api/attendance', authenticateToken, async (req, res) => {
    try {
        const [records] = await pool.query(
            'SELECT record_date, status, created_at FROM attendance WHERE user_id = ? ORDER BY record_date DESC',
            [req.user.userId]
        );
        res.json(records);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch records' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
