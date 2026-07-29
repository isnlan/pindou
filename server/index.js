import cors from "cors";
import express from "express";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  activateAuthCode,
  adminCount,
  createAdmin,
  createAuthCode,
  deactivateAuthCode,
  findAdminByUsername,
  findAuthCodeByCode,
  getAuthCodeStatus,
  listAuthCodes,
} from "./db.js";
import {
  requireAdmin,
  requireUser,
  signAdminToken,
  signUserToken,
  verifyToken,
} from "./middleware.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "..");
const DIST_DIR = join(ROOT_DIR, "dist");

const PORT = Number(process.env.PORT ?? 3000);

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const VALID_TYPES = new Set(["1day", "7day", "permanent"]);

function generateAuthCode(length = 12) {
  const bytes = randomBytes(length);
  return Array.from(bytes)
    .map((b) => CODE_CHARS[b % CODE_CHARS.length])
    .join("");
}

export function formatCodeForDisplay(code) {
  return code.replace(/(.{4})(?=.)/g, "$1-");
}

function normalizeCode(raw) {
  return String(raw ?? "")
    .replace(/-/g, "")
    .toUpperCase()
    .trim();
}

function serializeCode(row) {
  return {
    id: row.id,
    code: row.code,
    displayCode: formatCodeForDisplay(row.code),
    type: row.type,
    note: row.note,
    status: getAuthCodeStatus(row),
    createdAt: row.created_at,
    usedAt: row.used_at,
    expiresAt: row.expires_at,
    createdBy: row.created_by_username ?? null,
  };
}

function ensureDefaultAdmin() {
  if (adminCount() > 0) return;

  const username = process.env.ADMIN_USERNAME ?? "admin";
  const configuredPassword = process.env.ADMIN_PASSWORD?.trim();
  const password = configuredPassword && configuredPassword.length > 0 ? configuredPassword : "admin123";
  const hash = bcrypt.hashSync(password, 10);
  createAdmin(username, hash);

  console.log(`[pindou] 已创建默认管理员账号：${username}`);
  if (!configuredPassword) {
    console.warn(
      "[pindou] 警告：正在使用缺省管理员密码 admin123，生产环境请通过 ADMIN_PASSWORD 环境变量配置。",
    );
  }
}

export function createApp() {
  ensureDefaultAdmin();

  const app = express();
  app.use(cors());
  app.use(express.json());

  // ---------- 管理端 ----------

  app.post("/api/admin/login", (req, res) => {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      return res.status(400).json({ error: "bad_request", message: "请输入用户名和密码" });
    }
    const admin = findAdminByUsername(String(username).trim());
    if (!admin || !bcrypt.compareSync(String(password), admin.password_hash)) {
      return res.status(401).json({ error: "invalid_credentials", message: "用户名或密码错误" });
    }
    return res.json({ token: signAdminToken(admin), username: admin.username });
  });

  app.post("/api/admin/codes", requireAdmin, (req, res) => {
    const { type, note } = req.body ?? {};
    if (!VALID_TYPES.has(type)) {
      return res.status(400).json({ error: "bad_request", message: "授权码类型无效" });
    }

    let code = "";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      code = generateAuthCode();
      if (!findAuthCodeByCode(code)) break;
    }

    const row = createAuthCode({
      code,
      type,
      note: String(note ?? "").trim().slice(0, 120),
      createdBy: req.admin.sub,
    });
    return res.status(201).json(serializeCode({ ...row, created_by_username: req.admin.username }));
  });

  app.get("/api/admin/codes", requireAdmin, (_req, res) => {
    return res.json({ codes: listAuthCodes().map(serializeCode) });
  });

  app.post("/api/admin/codes/:id/deactivate", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "bad_request", message: "授权码 ID 无效" });
    }
    const row = deactivateAuthCode(id);
    if (!row) {
      return res.status(404).json({ error: "not_found", message: "授权码不存在" });
    }
    return res.json(serializeCode(row));
  });

  // ---------- 用户端 ----------

  app.post("/api/auth/verify-code", (req, res) => {
    const code = normalizeCode(req.body?.code);
    if (!code) {
      return res.status(400).json({ error: "bad_request", message: "请输入授权码" });
    }

    const row = findAuthCodeByCode(code);
    if (!row) {
      return res.status(404).json({ error: "code_invalid", message: "授权码无效，请检查后重试" });
    }
    if (!row.is_active) {
      return res.status(403).json({ error: "code_deactivated", message: "授权码已被停用" });
    }

    let record = row;
    const status = getAuthCodeStatus(row);
    if (status === "expired") {
      return res.status(403).json({ error: "code_expired", message: "授权码已过期" });
    }
    if (status === "unused") {
      record = activateAuthCode(row.id, row.type);
    }

    const token = signUserToken(record, record.expires_at);
    return res.json({
      token,
      type: record.type,
      expiresAt: record.expires_at,
    });
  });

  app.get("/api/auth/verify", (req, res) => {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    const payload = token ? verifyToken(token) : null;
    if (!payload || payload.role !== "user") {
      return res.status(401).json({ error: "unauthorized", message: "授权已失效" });
    }
    const code = findAuthCodeByCode(payload.code);
    if (!code) {
      return res.status(401).json({ error: "code_missing", message: "授权码不存在" });
    }
    const status = getAuthCodeStatus(code);
    if (status !== "active") {
      return res.status(403).json({ error: `code_${status}`, message: "授权已失效" });
    }
    return res.json({ valid: true, type: code.type, expiresAt: code.expires_at });
  });

  // 探针：受保护的示例路由，验证 requireUser 链路
  app.get("/api/app/ping", requireUser, (_req, res) => {
    return res.json({ ok: true });
  });

  // ---------- 静态资源（生产模式） ----------

  app.use(express.static(DIST_DIR));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(join(DIST_DIR, "index.html"));
  });

  return app;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`[pindou] 服务已启动：http://localhost:${PORT}`);
  });
}
