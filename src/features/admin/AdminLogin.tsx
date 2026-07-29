import { FormEvent, useState } from "react";

import { BrandMark } from "../../components/ui/BrandMark";
import { Button } from "../../components/ui/Button";
import { AuthApiError } from "../auth/authApi";
import { adminLogin, setAdminToken } from "./adminApi";

type AdminLoginProps = {
  onLoggedIn: () => void;
  onBack: () => void;
};

export function AdminLogin({ onLoggedIn, onBack }: AdminLoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!username.trim() || !password || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const result = await adminLogin(username.trim(), password);
      setAdminToken(result.token);
      onLoggedIn();
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "登录失败，请稍后重试");
      setSubmitting(false);
    }
  }

  return (
    <div className="app-shell app-shell--auth">
      <main className="auth-page">
        <section className="auth-card">
          <div className="auth-card__brand">
            <BrandMark className="auth-card__mark" />
            <span className="auth-card__name">拼豆工坊</span>
          </div>

          <h1 className="auth-card__title">管理员登录</h1>
          <p className="auth-card__subtitle">登录后可创建和管理授权码</p>

          <form className="auth-card__form" onSubmit={handleSubmit}>
            <label className="auth-card__label" htmlFor="admin-username-input">
              用户名
            </label>
            <input
              autoComplete="username"
              autoFocus
              className="auth-card__input auth-card__input--text"
              id="admin-username-input"
              onChange={(event) => {
                setUsername(event.target.value);
                setError(null);
              }}
              value={username}
            />

            <label className="auth-card__label" htmlFor="admin-password-input">
              密码
            </label>
            <input
              autoComplete="current-password"
              className="auth-card__input auth-card__input--text"
              id="admin-password-input"
              onChange={(event) => {
                setPassword(event.target.value);
                setError(null);
              }}
              type="password"
              value={password}
            />

            {error ? <p className="auth-card__error">{error}</p> : null}

            <Button
              className="auth-card__submit"
              disabled={!username.trim() || !password || submitting}
              type="submit"
              variant="primary"
            >
              {submitting ? "登录中…" : "登录"}
            </Button>
          </form>

          <button className="auth-card__admin-link" onClick={onBack} type="button">
            返回授权码验证
          </button>
        </section>
      </main>
    </div>
  );
}
