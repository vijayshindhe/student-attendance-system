require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('./database');
const path = require('path');

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
        res.status(500).json({ error: 'Database error' });
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
        res.status(500).json({ error: 'Database error' });
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
