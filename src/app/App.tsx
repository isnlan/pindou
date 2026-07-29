import { useCallback, useEffect, useState } from "react";

import { NotificationViewport } from "../components/ui/NotificationViewport";
import { AdminDashboard } from "../features/admin/AdminDashboard";
import { AdminLogin } from "../features/admin/AdminLogin";
import { getAdminToken } from "../features/admin/adminApi";
import { AuthPage } from "../features/auth/AuthPage";
import { checkAuthToken, clearAuthToken, getAuthToken } from "../features/auth/authApi";
import { EditorPage } from "../features/editor/EditorPage";
import { hasStoredEditorProject, useEditorStore } from "../features/editor/editorStore";
import { CreateCanvasModal } from "../features/home/CreateCanvasModal";
import { HomePage } from "../features/home/HomePage";

type GateView = "checking" | "auth" | "admin-login" | "admin" | "app";

const ADMIN_PATH = "/admin";

function isAdminPath() {
  return window.location.pathname.startsWith(ADMIN_PATH);
}

export function App() {
  const [gate, setGate] = useState<GateView>(() =>
    isAdminPath() ? (getAdminToken() ? "admin" : "admin-login") : "checking",
  );
  const [view, setView] = useState<"home" | "editor">("home");
  const [createCanvasOpen, setCreateCanvasOpen] = useState(false);
  const createNewProject = useEditorStore((state) => state.createNewProject);

  const runUserAuthCheck = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setGate("auth");
      return;
    }
    const valid = await checkAuthToken(token);
    if (valid === false) {
      clearAuthToken();
      setGate("auth");
      return;
    }
    // valid === true 正常放行；null 表示网络异常，也先放行避免误锁
    setGate("app");
  }, []);

  const resolveGateForPath = useCallback(() => {
    if (isAdminPath()) {
      setGate(getAdminToken() ? "admin" : "admin-login");
      return;
    }
    void runUserAuthCheck();
  }, [runUserAuthCheck]);

  useEffect(() => {
    resolveGateForPath();
    window.addEventListener("popstate", resolveGateForPath);
    return () => window.removeEventListener("popstate", resolveGateForPath);
  }, [resolveGateForPath]);

  useEffect(() => {
    if (gate === "auth") {
      document.title = "拼豆工坊 - 授权验证";
    } else if (gate === "admin-login" || gate === "admin") {
      document.title = "拼豆工坊 - 授权码管理";
    } else if (gate === "app") {
      document.title =
        view === "home"
          ? "拼豆工坊 - 拼豆图纸生成与编辑工具"
          : "拼豆工坊工作台 - 图片转拼豆图纸编辑器";
    }
  }, [gate, view]);

  function navigate(path: string) {
    window.history.pushState(null, "", path);
  }

  function handleEnterEditor() {
    if (hasStoredEditorProject()) {
      setView("editor");
      return;
    }

    setCreateCanvasOpen(true);
  }

  function handleCreateCanvas(width: number, height: number) {
    createNewProject({
      canvas: { width, height },
    });
    setCreateCanvasOpen(false);
    setView("editor");
  }

  if (gate === "checking") {
    return (
      <div className="app-shell app-shell--auth">
        <main className="auth-page">
          <p className="auth-checking">正在验证访问权限…</p>
        </main>
      </div>
    );
  }

  if (gate === "auth") {
    return (
      <>
        <AuthPage
          onAuthed={() => setGate("app")}
          onEnterAdmin={() => {
            navigate(ADMIN_PATH);
            setGate("admin-login");
          }}
        />
        <NotificationViewport />
      </>
    );
  }

  if (gate === "admin-login") {
    return (
      <>
        <AdminLogin
          onLoggedIn={() => setGate("admin")}
          onBack={() => {
            navigate("/");
            void runUserAuthCheck();
          }}
        />
        <NotificationViewport />
      </>
    );
  }

  if (gate === "admin") {
    return (
      <>
        <AdminDashboard
          onLogout={() => {
            navigate("/");
            void runUserAuthCheck();
          }}
          onSessionExpired={() => setGate("admin-login")}
        />
        <NotificationViewport />
      </>
    );
  }

  return (
    <>
      {view === "home" ? (
        <HomePage onEnterEditor={handleEnterEditor} />
      ) : (
        <EditorPage onBackHome={() => setView("home")} />
      )}
      <CreateCanvasModal
        onClose={() => setCreateCanvasOpen(false)}
        onCreate={({ width, height }) => handleCreateCanvas(width, height)}
        open={createCanvasOpen}
      />
      <NotificationViewport />
    </>
  );
}
