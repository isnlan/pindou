export const AUTH_TOKEN_KEY = "pindou.auth.token";

export type VerifyCodeResult = {
  token: string;
  type: "1day" | "7day" | "permanent";
  expiresAt: string | null;
};

export class AuthApiError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function parseError(res: Response): Promise<AuthApiError> {
  try {
    const body = await res.json();
    return new AuthApiError(body.error ?? "unknown", body.message ?? "请求失败，请稍后重试");
  } catch {
    return new AuthApiError("network", "网络异常，请稍后重试");
  }
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export async function verifyAuthCode(code: string): Promise<VerifyCodeResult> {
  const res = await fetch("/api/auth/verify-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/**
 * 校验本地 JWT 是否仍有效。网络异常时返回 null（视为不确定，交调用方决定）。
 */
export async function checkAuthToken(token: string): Promise<boolean | null> {
  try {
    const res = await fetch("/api/auth/verify", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return null;
  }
}
