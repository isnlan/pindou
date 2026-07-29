import { FormEvent, useCallback, useEffect, useState } from "react";

import { BrandMark } from "../../components/ui/BrandMark";
import { Button } from "../../components/ui/Button";
import { AuthApiError } from "../auth/authApi";
import {
  AuthCodeRecord,
  AuthCodeStatus,
  AuthCodeType,
  clearAdminToken,
  createAuthCode,
  deactivateAuthCode,
  fetchAuthCodes,
} from "./adminApi";

type AdminDashboardProps = {
  onLogout: () => void;
  onSessionExpired: () => void;
};

const TYPE_LABELS: Record<AuthCodeType, string> = {
  "1day": "1 天使用权",
  "7day": "7 天使用权",
  permanent: "永久使用",
};

const STATUS_LABELS: Record<AuthCodeStatus, string> = {
  unused: "未使用",
  active: "使用中",
  expired: "已过期",
  deactivated: "已停用",
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function AdminDashboard({ onLogout, onSessionExpired }: AdminDashboardProps) {
  const [codes, setCodes] = useState<AuthCodeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newType, setNewType] = useState<AuthCodeType>("7day");
  const [newNote, setNewNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdCode, setCreatedCode] = useState<AuthCodeRecord | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadCodes = useCallback(async () => {
    try {
      const list = await fetchAuthCodes();
      setCodes(list);
      setLoadError(null);
    } catch (err) {
      if (err instanceof AuthApiError && err.code === "unauthorized") {
        clearAdminToken();
        onSessionExpired();
        return;
      }
      setLoadError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [onSessionExpired]);

  useEffect(() => {
    void loadCodes();
  }, [loadCodes]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    setCreatedCode(null);
    setCopied(false);
    try {
      const record = await createAuthCode(newType, newNote.trim());
      setCreatedCode(record);
      setNewNote("");
      setCodes((prev) => [record, ...prev]);
    } catch (err) {
      if (err instanceof AuthApiError && err.code === "unauthorized") {
        clearAdminToken();
        onSessionExpired();
        return;
      }
      setCreateError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy() {
    if (!createdCode) return;
    try {
      await navigator.clipboard.writeText(createdCode.displayCode);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function handleDeactivate(record: AuthCodeRecord) {
    if (busyId !== null) return;
    if (!window.confirm(`确定停用授权码 ${record.displayCode} 吗？停用后使用该码的用户将立即失去访问权限。`)) {
      return;
    }
    setBusyId(record.id);
    setActionError(null);
    try {
      const updated = await deactivateAuthCode(record.id);
      setCodes((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      if (err instanceof AuthApiError && err.code === "unauthorized") {
        clearAdminToken();
        onSessionExpired();
        return;
      }
      setActionError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusyId(null);
    }
  }

  function handleLogout() {
    clearAdminToken();
    onLogout();
  }

  return (
    <div className="app-shell app-shell--admin">
      <header className="admin-topbar">
        <div className="admin-topbar__brand">
          <BrandMark className="admin-topbar__mark" />
          <span className="admin-topbar__name">拼豆工坊 · 授权码管理</span>
        </div>
        <Button onClick={handleLogout} size="compact" variant="ghost">
          退出登录
        </Button>
      </header>

      <main className="admin-main">
        <section className="admin-panel">
          <h2 className="admin-panel__title">创建授权码</h2>
          <form className="admin-create" onSubmit={handleCreate}>
            <label className="field">
              <span>使用权限</span>
              <select
                className="field__input admin-create__select"
                onChange={(event) => setNewType(event.target.value as AuthCodeType)}
                value={newType}
              >
                <option value="1day">1 天使用权</option>
                <option value="7day">7 天使用权</option>
                <option value="permanent">永久使用</option>
              </select>
            </label>
            <label className="field admin-create__note">
              <span>备注（可选）</span>
              <input
                className="field__input"
                maxLength={120}
                onChange={(event) => setNewNote(event.target.value)}
                placeholder="例如：发给小红的 7 天码"
                value={newNote}
              />
            </label>
            <Button disabled={creating} type="submit" variant="primary">
              {creating ? "生成中…" : "生成授权码"}
            </Button>
          </form>

          {createError ? <p className="admin-message admin-message--error">{createError}</p> : null}

          {createdCode ? (
            <div className="admin-created">
              <div className="admin-created__info">
                <span className="admin-created__label">新授权码</span>
                <code className="admin-created__code">{createdCode.displayCode}</code>
                <span className="admin-created__meta">{TYPE_LABELS[createdCode.type]}</span>
              </div>
              <Button onClick={handleCopy} size="compact">
                {copied ? "已复制" : "复制"}
              </Button>
            </div>
          ) : null}
        </section>

        <section className="admin-panel">
          <div className="admin-panel__head">
            <h2 className="admin-panel__title">授权码列表</h2>
            <Button onClick={() => void loadCodes()} size="compact" variant="ghost">
              刷新
            </Button>
          </div>

          {actionError ? <p className="admin-message admin-message--error">{actionError}</p> : null}
          {loadError ? <p className="admin-message admin-message--error">{loadError}</p> : null}

          {loading ? (
            <p className="admin-empty">加载中…</p>
          ) : codes.length === 0 ? (
            <p className="admin-empty">还没有授权码，先在上方创建一个。</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>授权码</th>
                    <th>类型</th>
                    <th>状态</th>
                    <th>创建时间</th>
                    <th>首次使用</th>
                    <th>到期时间</th>
                    <th>备注</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.map((record) => (
                    <tr key={record.id}>
                      <td>
                        <code className="admin-table__code">{record.displayCode}</code>
                      </td>
                      <td>{TYPE_LABELS[record.type]}</td>
                      <td>
                        <span className={`admin-status admin-status--${record.status}`}>
                          {STATUS_LABELS[record.status]}
                        </span>
                      </td>
                      <td>{formatDateTime(record.createdAt)}</td>
                      <td>{formatDateTime(record.usedAt)}</td>
                      <td>{record.type === "permanent" ? "永不过期" : formatDateTime(record.expiresAt)}</td>
                      <td className="admin-table__note">{record.note || "—"}</td>
                      <td>
                        {record.status !== "deactivated" ? (
                          <Button
                            disabled={busyId === record.id}
                            onClick={() => void handleDeactivate(record)}
                            size="compact"
                            variant="danger"
                          >
                            停用
                          </Button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
