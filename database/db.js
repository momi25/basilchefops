const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './database/basilgrape.db';

// Ensure database directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db;
try {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
} catch (err) {
  console.error('Database connection error:', err);
  process.exit(1);
}

const initialize = async () => {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      pin TEXT NOT NULL,
      role TEXT DEFAULT 'staff',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    )
  `);

  // Stock items
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL CHECK(category IN ('out', 'low')),
      item TEXT NOT NULL,
      detail TEXT,
      severity TEXT DEFAULT 'low',
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // Maintenance
  db.exec(`
    CREATE TABLE IF NOT EXISTS maintenance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item TEXT NOT NULL,
      detail TEXT,
      severity TEXT DEFAULT 'maint',
      priority INTEGER DEFAULT 2,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // Notes
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // Shift log
  db.exec(`
    CREATE TABLE IF NOT EXISTS shift_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_type TEXT NOT NULL,
      focus TEXT NOT NULL,
      eta TEXT,
      notes TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // Settings
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Activity log
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stock_active ON stock_items(is_active, category);
    CREATE INDEX IF NOT EXISTS idx_maint_active ON maintenance(is_active);
    CREATE INDEX IF NOT EXISTS idx_notes_active ON notes(is_active);
    CREATE INDEX IF NOT EXISTS idx_shift_created ON shift_log(created_at DESC);
  `);

  // Default admin user
  const adminExists = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('admin');
  if (adminExists.count === 0) {
    const hashedPin = await bcrypt.hash(process.env.ADMIN_PIN || '1234', 10);
    db.prepare('INSERT INTO users (name, pin, role) VALUES (?, ?, ?)').run('Head Chef', hashedPin, 'admin');
    console.log('✓ Default admin created (Name: Head Chef, PIN: 1234)');
  }

  // Default settings
  const defaultSettings = [
    ['restaurant_name', 'Basil & Grape'],
    ['address', '46-48 George Street, Croydon, CR0 1PB'],
    ['phone', '020 8680 1801'],
    ['floor_lead', 'Update name'],
    ['opening_hours', 'Tue-Thu 12-22:00 | Fri-Sat 12-23:00 | Sun 12-21:00'],
    ['website', 'https://basilandgrape.com']
  ];

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of defaultSettings) {
    insertSetting.run(key, value);
  }

  // Sample data for demo
  const stockCount = db.prepare('SELECT COUNT(*) as count FROM stock_items').get().count;
  if (stockCount === 0) {
    const now = Date.now();
    db.prepare('INSERT INTO stock_items (category, item, detail, severity, created_at) VALUES (?, ?, ?, ?, ?)').run('out', 'Buffalo Mozzarella', 'Supplier delivering tomorrow AM', 'none', new Date(now - 3600000).toISOString());
    db.prepare('INSERT INTO stock_items (category, item, detail, severity, created_at) VALUES (?, ?, ?, ?, ?)').run('low', 'House Sourdough', '~15 portions left, check proofing', 'low', new Date(now - 1800000).toISOString());
    db.prepare('INSERT INTO maintenance (item, detail, severity, created_at) VALUES (?, ?, ?, ?)').run('Pizza Oven Left Deck', 'Running slightly cool, rotate pies right', 'maint', new Date(now - 7200000).toISOString());
    db.prepare('INSERT INTO notes (text, created_at) VALUES (?, ?)').run('Prep extra basil garnish for spritz service', new Date(now - 600000).toISOString());
    console.log('✓ Sample data added');
  }

  console.log('✓ Database initialized');
};

// User operations
const createUser = async (name, pin, role = 'staff') => {
  const hashedPin = await bcrypt.hash(pin, 10);
  const result = db.prepare('INSERT INTO users (name, pin, role) VALUES (?, ?, ?)').run(name, hashedPin, role);
  return result.lastInsertRowid;
};

const findUserByName = (name) => {
  return db.prepare('SELECT * FROM users WHERE LOWER(name) = LOWER(?)').get(name);
};

const findUserById = (id) => {
  return db.prepare('SELECT id, name, role, created_at, last_login FROM users WHERE id = ?').get(id);
};

const verifyPin = async (user, pin) => {
  return bcrypt.compare(pin, user.pin);
};

const updateLastLogin = (userId) => {
  db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
};

const getAllUsers = () => {
  return db.prepare('SELECT id, name, role, created_at, last_login FROM users ORDER BY name').all();
};

// Stock operations
const getStockItems = (category, activeOnly = true) => {
  const query = activeOnly 
    ? 'SELECT * FROM stock_items WHERE category = ? AND is_active = 1 ORDER BY created_at DESC'
    : 'SELECT * FROM stock_items WHERE category = ? ORDER BY created_at DESC';
  return db.prepare(query).all(category);
};

const addStockItem = (category, item, detail, severity, userId) => {
  const result = db.prepare(
    'INSERT INTO stock_items (category, item, detail, severity, created_by) VALUES (?, ?, ?, ?, ?)'
  ).run(category, item, detail, severity, userId);
  logActivity(userId, 'add', 'stock', result.lastInsertRowid, `Added ${category}: ${item}`);
  return result.lastInsertRowid;
};

const resolveStockItem = (id, userId) => {
  db.prepare('UPDATE stock_items SET is_active = 0, resolved_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  logActivity(userId, 'resolve', 'stock', id, 'Resolved stock item');
};

// Maintenance operations
const getMaintenanceItems = (activeOnly = true) => {
  const query = activeOnly
    ? 'SELECT * FROM maintenance WHERE is_active = 1 ORDER BY priority ASC, created_at DESC'
    : 'SELECT * FROM maintenance ORDER BY created_at DESC';
  return db.prepare(query).all();
};

const addMaintenanceItem = (item, detail, severity, userId) => {
  const result = db.prepare(
    'INSERT INTO maintenance (item, detail, severity, created_by) VALUES (?, ?, ?, ?)'
  ).run(item, detail, severity, userId);
  logActivity(userId, 'add', 'maintenance', result.lastInsertRowid, `Added maintenance: ${item}`);
  return result.lastInsertRowid;
};

const resolveMaintenanceItem = (id, userId) => {
  db.prepare('UPDATE maintenance SET is_active = 0, resolved_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  logActivity(userId, 'resolve', 'maintenance', id, 'Resolved maintenance item');
};

// Notes operations
const getNotes = (activeOnly = true) => {
  const query = activeOnly
    ? 'SELECT * FROM notes WHERE is_active = 1 ORDER BY created_at DESC'
    : 'SELECT * FROM notes ORDER BY created_at DESC';
  return db.prepare(query).all();
};

const addNote = (text, userId, expiresAt = null) => {
  const result = db.prepare(
    'INSERT INTO notes (text, created_by, expires_at) VALUES (?, ?, ?)'
  ).run(text, userId, expiresAt);
  return result.lastInsertRowid;
};

const resolveNote = (id, userId) => {
  db.prepare('UPDATE notes SET is_active = 0 WHERE id = ?').run(id);
};

// Shift log operations
const getShiftLog = (limit = 20) => {
  return db.prepare(`
    SELECT s.*, u.name as created_by_name 
    FROM shift_log s 
    LEFT JOIN users u ON s.created_by = u.id 
    ORDER BY s.created_at DESC 
    LIMIT ?
  `).all(limit);
};

const addShiftEntry = (shiftType, focus, eta, notes, userId) => {
  const result = db.prepare(
    'INSERT INTO shift_log (shift_type, focus, eta, notes, created_by) VALUES (?, ?, ?, ?, ?)'
  ).run(shiftType, focus, eta, notes, userId);
  logActivity(userId, 'add', 'shift', result.lastInsertRowid, `Shift handover: ${shiftType}`);
  return result.lastInsertRowid;
};

const deleteShiftEntry = (id, userId) => {
  db.prepare('DELETE FROM shift_log WHERE id = ?').run(id);
  logActivity(userId, 'delete', 'shift', id, 'Deleted shift entry');
};

// Settings operations
const getSetting = (key) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
};

const getAllSettings = () => {
  return db.prepare('SELECT * FROM settings').all();
};

const setSetting = (key, value) => {
  db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)').run(key, value);
};

// Activity logging
const logActivity = (userId, action, entityType, entityId, details) => {
  try {
    db.prepare('INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)').run(userId || null, action, entityType, entityId, details);
  } catch (err) {
    console.error('Activity log error:', err);
  }
};

const getActivityLog = (limit = 50) => {
  return db.prepare(`
    SELECT a.*, u.name as user_name 
    FROM activity_log a 
    LEFT JOIN users u ON a.user_id = u.id 
    ORDER BY a.created_at DESC 
    LIMIT ?
  `).all(limit);
};

// Stats
const getStats = () => {
  const outCount = db.prepare('SELECT COUNT(*) as count FROM stock_items WHERE category = ? AND is_active = 1').get('out').count;
  const lowCount = db.prepare('SELECT COUNT(*) as count FROM stock_items WHERE category = ? AND is_active = 1').get('low').count;
  const maintCount = db.prepare('SELECT COUNT(*) as count FROM maintenance WHERE is_active = 1').get().count;
  const notesCount = db.prepare('SELECT COUNT(*) as count FROM notes WHERE is_active = 1').get().count;
  
  return { outCount, lowCount, maintCount, notesCount };
};

// Get all board data
const getBoardData = () => {
  return {
    out: getStockItems('out'),
    low: getStockItems('low'),
    maint: getMaintenanceItems(),
    notes: getNotes(),
    shiftLog: getShiftLog(),
    settings: getAllSettings().reduce((acc, { key, value }) => ({ ...acc, [key]: value }), {}),
    stats: getStats()
  };
};

module.exports = {
  db,
  initialize,
  createUser,
  findUserByName,
  findUserById,
  verifyPin,
  updateLastLogin,
  getAllUsers,
  getStockItems,
  addStockItem,
  resolveStockItem,
  getMaintenanceItems,
  addMaintenanceItem,
  resolveMaintenanceItem,
  getNotes,
  addNote,
  resolveNote,
  getShiftLog,
  addShiftEntry,
  deleteShiftEntry,
  getSetting,
  getAllSettings,
  setSetting,
  logActivity,
  getActivityLog,
  getStats,
  getBoardData
};
