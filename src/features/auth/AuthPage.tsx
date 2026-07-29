import { FormEvent, useState } from "react";

import { BrandMark } from "../../components/ui/BrandMark";
import { Button } from "../../components/ui/Button";
import { AuthApiError, setAuthToken, verifyAuthCode } from "./authApi";

type AuthPageProps = {
  onAuthed: () => void;
  onEnterAdmin: () => void;
};

const CODE_GROUP = 4;
const CODE_GROUPS = 3;
const CODE_LENGTH = CODE_GROUP * CODE_GROUPS;

function formatInput(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, CODE_LENGTH);
  return cleaned.replace(new RegExp(`(.{${CODE_GROUP}})(?=.)`, "g"), "$1-");
}

export function AuthPage({ onAuthed, onEnterAdmin }: AuthPageProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const complete = code.replace(/-/g, "").length === CODE_LENGTH;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!complete || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const result = await verifyAuthCode(code);
      setAuthToken(result.token);
      onAuthed();
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "验证失败，请稍后重试");
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

          <h1 className="auth-card__title">输入授权码开始使用</h1>
          <p className="auth-card__subtitle">向管理员获取授权码，验证通过后即可进入工作台</p>

          <form className="auth-card__form" onSubmit={handleSubmit}>
            <label className="auth-card__label" htmlFor="auth-code-input">
              授权码
            </label>
            <input
              autoComplete="off"
              autoFocus
              className="auth-card__input"
              id="auth-code-input"
              maxLength={CODE_LENGTH + CODE_GROUPS - 1}
              onChange={(event) => {
                setCode(formatInput(event.target.value));
                setError(null);
              }}
              placeholder="XXXX-XXXX-XXXX"
              spellCheck={false}
              value={code}
            />

            {error ? <p className="auth-card__error">{error}</p> : null}

            <Button
              className="auth-card__submit"
              disabled={!complete || submitting}
              type="submit"
              variant="primary"
            >
              {submitting ? "验证中…" : "进入工作台"}
            </Button>
          </form>

          <button className="auth-card__admin-link" onClick={onEnterAdmin} type="button">
            管理员登录
          </button>
        </section>
      </main>
    </div>
  );
}
