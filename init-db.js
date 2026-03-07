require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function initializeDatabase() {
    try {
        // Connect without a specific database to create it if it doesn't exist
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || ''
        });

        console.log('Connected to MySQL server.');

        // Read and execute schema
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        console.log('Executing schema.sql...');
        const statements = schema.split(';').filter(stmt => stmt.trim() !== '');

        for (let stmt of statements) {
            await connection.query(stmt);
        }

        console.log('Database and tables initialized successfully!');
        await connection.end();
    } catch (err) {
        console.error('Error initializing database:', err.message);
    }
}

initializeDatabase();
