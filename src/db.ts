import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '../platform.db');
const db = new Database(dbPath);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT,
    username TEXT UNIQUE,
    role TEXT DEFAULT 'user',
    subscription_status TEXT DEFAULT 'trial',
    is_verified BOOLEAN DEFAULT 0,
    otp_code TEXT,
    otp_expiry DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sites (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    title TEXT,
    subdomain TEXT UNIQUE,
    custom_domain TEXT UNIQUE,
    dns_verified BOOLEAN DEFAULT 0,
    status TEXT DEFAULT 'draft',
    theme_config TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT,
    receiver_id TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_read BOOLEAN DEFAULT 0,
    notified BOOLEAN DEFAULT 0,
    file_url TEXT,
    file_name TEXT,
    file_type TEXT,
    file_size INTEGER
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    subscription TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS active_calls (
    id TEXT PRIMARY KEY,
    caller_id TEXT,
    receiver_id TEXT,
    type TEXT,
    status TEXT DEFAULT 'calling',
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    duration INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Migration: Add notified column to messages if it doesn't exist
const messageColumns = [
  { name: 'notified', type: 'BOOLEAN DEFAULT 0' },
  { name: 'file_url', type: 'TEXT' },
  { name: 'file_name', type: 'TEXT' },
  { name: 'file_type', type: 'TEXT' },
  { name: 'file_size', type: 'INTEGER' }
];

messageColumns.forEach(col => {
  try {
    db.prepare(`SELECT ${col.name} FROM messages LIMIT 1`).get();
  } catch (e) {
    console.log(`Adding '${col.name}' column to 'messages' table...`);
    try {
      db.exec(`ALTER TABLE messages ADD COLUMN ${col.name} ${col.type}`);
    } catch (err) {
      console.error(`Failed to add '${col.name}' column:`, err);
    }
  }
});

// Migration: Add verification columns to users if they don't exist
const userColumns = [
  { name: 'is_verified', type: 'BOOLEAN DEFAULT 0' },
  { name: 'otp_code', type: 'TEXT' },
  { name: 'otp_expiry', type: 'DATETIME' },
  { name: 'subscription_status', type: "TEXT DEFAULT 'trial'" },
  { name: 'calls_enabled', type: 'BOOLEAN DEFAULT 1' },
  { name: 'blocked_features', type: "TEXT DEFAULT '[]'" }
];

userColumns.forEach(col => {
  try {
    db.prepare(`SELECT ${col.name} FROM users LIMIT 1`).get();
  } catch (e) {
    console.log(`Adding '${col.name}' column to 'users' table...`);
    try {
      db.exec(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`);
    } catch (err) {
      console.error(`Failed to add '${col.name}' column:`, err);
    }
  }
});

export default db;
