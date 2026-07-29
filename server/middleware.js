import jwt from "jsonwebtoken";
import { randomBytes } from "node:crypto";

import { findAuthCodeByCode, getAuthCodeStatus } from "./db.js";

const configuredSecret = process.env.JWT_SECRET?.trim();

export const JWT_SECRET =
  configuredSecret && configuredSecret.length > 0
    ? configuredSecret
    : (() => {
        console.warn(
          "[pindou] 警告：未设置 JWT_SECRET 环境变量，已生成随机密钥。重启后所有登录态将失效。",
        );
        return randomBytes(32).toString("hex");
      })();

const ADMIN_TOKEN_TTL = "24h";

export function signAdminToken(admin) {
  return jwt.sign(
    { role: "admin", sub: admin.id, username: admin.username },
    JWT_SECRET,
    { expiresIn: ADMIN_TOKEN_TTL },
  );
}

export function signUserToken(code, expiresAt) {
  const options = {};
  if (expiresAt) {
    const exp = Math.floor(new Date(expiresAt.replace(" ", "T") + "Z").getTime() / 1000);
    options.expiresIn = Math.max(exp - Math.floor(Date.now() / 1000), 1);
  }
  return jwt.sign(
    { role: "user", code: code.code, codeId: code.id, type: code.type },
    JWT_SECRET,
    options,
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function extractToken(req) {
  const header = req.headers.authorization ?? "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  return null;
}

/**
 * 管理员路由保护：必须携带有效 admin JWT。
 */
export function requireAdmin(req, res, next) {
  const token = extractToken(req);
  const payload = token ? verifyToken(token) : null;
  if (!payload || payload.role !== "admin") {
    return res.status(401).json({ error: "unauthorized", message: "管理员登录已失效，请重新登录" });
  }
  req.admin = payload;
  next();
}

/**
 * 用户令牌保护：校验 JWT 有效，且对应授权码在库中仍可用
 * （未被停用、未过期）。每次请求都会回查数据库，停用立即生效。
 */
export function requireUser(req, res, next) {
  const token = extractToken(req);
  const payload = token ? verifyToken(token) : null;
  if (!payload || payload.role !== "user") {
    return res.status(401).json({ error: "unauthorized", message: "授权已失效，请重新输入授权码" });
  }
  const code = findAuthCodeByCode(payload.code);
  if (!code) {
    return res.status(401).json({ error: "code_missing", message: "授权码不存在" });
  }
  const status = getAuthCodeStatus(code);
  if (status !== "active") {
    const messages = {
      deactivated: "授权码已被停用",
      expired: "授权码已过期",
      unused: "授权码尚未激活",
    };
    return res.status(403).json({ error: `code_${status}`, message: messages[status] });
  }
  req.user = payload;
  next();
}
