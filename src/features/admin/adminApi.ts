import { AuthApiError } from "../auth/authApi";

export const ADMIN_TOKEN_KEY = "pindou.admin.token";

export type AuthCodeType = "1day" | "7day" | "permanent";

export type AuthCodeStatus = "unused" | "active" | "expired" | "deactivated";

export type AuthCodeRecord = {
  id: number;
  code: string;
  displayCode: string;
  type: AuthCodeType;
  note: string;
  status: AuthCodeStatus;
  createdAt: string;
  usedAt: string | null;
  expiresAt: string | null;
  createdBy: string | null;
};

async function parseError(res: Response): Promise<AuthApiError> {
  try {
    const body = await res.json();
    return new AuthApiError(body.error ?? "unknown", body.message ?? "请求失败，请稍后重试");
  } catch {
    return new AuthApiError("network", "网络异常，请稍后重试");
  }
}

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export async function adminLogin(username: string, password: string) {
  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw await parseError(res);
  return res.json() as Promise<{ token: string; username: string }>;
}

function adminHeaders() {
  const token = getAdminToken();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchAuthCodes(): Promise<AuthCodeRecord[]> {
  const res = await fetch("/api/admin/codes", { headers: adminHeaders() });
  if (!res.ok) throw await parseError(res);
  const body = await res.json();
  return body.codes;
}

export async function createAuthCode(
  type: AuthCodeType,
  note: string,
): Promise<AuthCodeRecord> {
  const res = await fetch("/api/admin/codes", {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ type, note }),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export async function deactivateAuthCode(id: number): Promise<AuthCodeRecord> {
  const res = await fetch(`/api/admin/codes/${id}/deactivate`, {
    method: "POST",
    headers: adminHeaders(),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}
