import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DATABASE_PATH = resolve(process.env.DATABASE_PATH ?? "./data/pindou.db");

mkdirSync(dirname(DATABASE_PATH), { recursive: true });

export const db = new Database(DATABASE_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS auth_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK (type IN ('1day', '7day', 'permanent')),
    note TEXT NOT NULL DEFAULT '',
    created_by INTEGER NOT NULL REFERENCES admin(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    used_at TEXT,
    expires_at TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
  );

  CREATE INDEX IF NOT EXISTS idx_auth_codes_code ON auth_codes(code);
`);

const CODE_TYPE_DURATION_MS = {
  "1day": 24 * 60 * 60 * 1000,
  "7day": 7 * 24 * 60 * 60 * 1000,
  permanent: null,
};

export function findAdminByUsername(username) {
  return db.prepare("SELECT * FROM admin WHERE username = ?").get(username);
}

export function adminCount() {
  return db.prepare("SELECT COUNT(*) AS count FROM admin").get().count;
}

export function createAdmin(username, passwordHash) {
  const result = db
    .prepare("INSERT INTO admin (username, password_hash) VALUES (?, ?)")
    .run(username, passwordHash);
  return result.lastInsertRowid;
}

function toIso(date) {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

export function createAuthCode({ code, type, note, createdBy }) {
  const result = db
    .prepare(
      "INSERT INTO auth_codes (code, type, note, created_by) VALUES (?, ?, ?, ?)",
    )
    .run(code, type, note ?? "", createdBy);
  return db.prepare("SELECT * FROM auth_codes WHERE id = ?").get(result.lastInsertRowid);
}

export function findAuthCodeByCode(code) {
  return db.prepare("SELECT * FROM auth_codes WHERE code = ?").get(code);
}

export function findAuthCodeById(id) {
  return db.prepare("SELECT * FROM auth_codes WHERE id = ?").get(id);
}

export function listAuthCodes() {
  return db
    .prepare(
      `SELECT auth_codes.*, admin.username AS created_by_username
       FROM auth_codes
       LEFT JOIN admin ON admin.id = auth_codes.created_by
       ORDER BY auth_codes.id DESC`,
    )
    .all();
}

export function deactivateAuthCode(id) {
  db.prepare("UPDATE auth_codes SET is_active = 0 WHERE id = ?").run(id);
  return db
    .prepare(
      `SELECT auth_codes.*, admin.username AS created_by_username
       FROM auth_codes
       LEFT JOIN admin ON admin.id = auth_codes.created_by
       WHERE auth_codes.id = ?`,
    )
    .get(id);
}

/**
 * 激活授权码：写入 used_at，并按类型计算 expires_at。
 * 有效期从首次使用时刻起算，permanent 类型 expires_at 保持 NULL。
 */
export function activateAuthCode(id, type) {
  const usedAt = new Date();
  const duration = CODE_TYPE_DURATION_MS[type];
  const expiresAt = duration === null ? null : new Date(usedAt.getTime() + duration);

  db.prepare("UPDATE auth_codes SET used_at = ?, expires_at = ? WHERE id = ?").run(
    toIso(usedAt),
    expiresAt ? toIso(expiresAt) : null,
    id,
  );
  return findAuthCodeById(id);
}

/**
 * 计算授权码当前状态：unused / active / expired / deactivated
 */
export function getAuthCodeStatus(row, now = new Date()) {
  if (!row.is_active) return "deactivated";
  if (!row.used_at) return "unused";
  if (row.expires_at && new Date(row.expires_at.replace(" ", "T") + "Z") <= now) {
    return "expired";
  }
  return "active";
}
