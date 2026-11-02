const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'ndt_api.db');
const db = new sqlite3.Database(dbPath);

// Helper functions to run queries with promises
const dbRun = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const dbAll = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const dbGet = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

// Initialize Database Tables
async function initDb() {
  try {
    // Create Alumni Table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS alumni (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        batch INTEGER NOT NULL,
        serial_number TEXT NOT NULL UNIQUE,
        card_number TEXT,
        field_of_study TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        current_job TEXT,
        company TEXT,
        linkedin TEXT,
        profile_pic TEXT,
        password_hash TEXT NOT NULL,
        status TEXT DEFAULT 'approved',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Notices Table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS notices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT DEFAULT 'notice',
        image_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Admin Table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL
      )
    `);

    // Insert default admin if not exists (username: admin, password: admin123)
    const adminExists = await dbGet(`SELECT id FROM admins WHERE username = ?`, ['admin']);
    if (!adminExists) {
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync('admin123', salt);
      await dbRun(`INSERT INTO admins (username, password_hash) VALUES (?, ?)`, ['admin', hash]);
      console.log('Default admin account created: username=admin, password=admin123');
    }
    console.log('SQLite Database initialized successfully.');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

module.exports = {
  db,
  initDb,
  dbRun,
  dbAll,
  dbGet
};
