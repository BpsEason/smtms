import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { api, ApiError, clearToken, readToken, saveToken } from "./api/client";
import { AppLayout } from "./components/AppLayout";
import {
  buttonClass,
  EmptyState,
  FormField,
  inputClass,
  LoadingState,
  PageHeader,
} from "./components/ui";
import { DashboardPage } from "./pages/DashboardPage";
import { RolesPermissionsPage } from "./pages/AdminPage";
import { CatalogPages } from "./pages/CatalogPages";
import { IQCPage, InternalLotsPage, ReceiptsPage } from "./pages/WorkflowPages";
import { LoginPage } from "./pages/LoginPage";
import type { UserProfile } from "./types";

function normalizePermissions(
  permissions: string[] | undefined | null,
): string[] {
  const unique = new Set<string>();
  for (const permission of permissions ?? []) {
    const normalized = permission.startsWith("seed:")
      ? permission.slice("seed:".length)
      : permission;
    if (normalized) unique.add(normalized);
  }
  return [...unique];
}

function normalizeProfile(profile: UserProfile): UserProfile {
  return {
    ...profile,
    permissions: normalizePermissions(profile.permissions),
  };
}

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

function AppShell() {
  const [token, setToken] = useState<string | null>(() => readToken());
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [checkingSession, setCheckingSession] = useState(Boolean(readToken()));
  const expireSession = useCallback(() => {
    clearToken();
    setToken(null);
    setProfile(null);
    setCheckingSession(false);
  }, []);
  const refreshProfile = useCallback(async () => {
    setProfile(normalizeProfile(await api.getProfile()));
  }, []);

  useEffect(() => {
    const onUnauthorized = () => expireSession();
    window.addEventListener("smtms:unauthorized", onUnauthorized);
    return () =>
      window.removeEventListener("smtms:unauthorized", onUnauthorized);
  }, [expireSession]);

  useEffect(() => {
    if (!token || profile) return;
    let active = true;
    api
      .getProfile()
      .then((me) => {
        if (active) setProfile(normalizeProfile(me));
      })
      .catch(() => {
        if (active) expireSession();
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });
    return () => {
      active = false;
    };
  }, [token, profile, expireSession]);

  const handleLogin = async (username: string, password: string) => {
    const auth = await api.login(username, password);
    saveToken(auth.access_token);
    try {
      const me = await api.getProfile();
      setProfile(normalizeProfile(me));
      setToken(auth.access_token);
    } catch (error) {
      clearToken();
      setProfile(null);
      setToken(null);
      throw error;
    }
  };

  const handleLogout = async () => {
    try {
      if (readToken()) await api.logout();
    } catch {
      /* Always clear the local session. */
    }
    expireSession();
  };

  return (
    <Routes>
      <Route
        path="/login"
        element={
          token && profile ? (
            <Navigate to="/" replace />
          ) : (
            <LoginPage onLogin={handleLogin} loading={checkingSession} />
          )
        }
      />
      <Route
        path="/"
        element={
          token ? (
            checkingSession || !profile ? (
              <div className="grid min-h-screen place-items-center bg-slate-50">
                <LoadingState label="正在驗證登入狀態…" />
              </div>
            ) : profile.must_change_password ? (
              <ChangePasswordScreen
                onChanged={refreshProfile}
                onLogout={handleLogout}
              />
            ) : (
              <AppLayout profile={profile} onLogout={handleLogout} />
            )
          ) : (
            <Navigate to="/login" replace />
          )
        }
      >
        <Route index element={<DashboardPage profile={profile} />} />
        <Route
          path="suppliers"
          element={
            <PermissionPage profile={profile} permission="suppliers:read">
              <CatalogPages kind="suppliers" profile={profile} />
            </PermissionPage>
          }
        />
        <Route
          path="materials"
          element={
            <PermissionPage profile={profile} permission="materials:read">
              <CatalogPages kind="materials" profile={profile} />
            </PermissionPage>
          }
        />
        <Route
          path="receipts"
          element={
            <PermissionPage profile={profile} permission="receipts:read">
              <ReceiptsPage profile={profile} />
            </PermissionPage>
          }
        />
        <Route
          path="internal-lots"
          element={
            <PermissionPage profile={profile} permission="materials:read">
              <InternalLotsPage />
            </PermissionPage>
          }
        />
        <Route
          path="iqc"
          element={
            <PermissionPage profile={profile} permission="iqc:read">
              <IQCPage profile={profile} />
            </PermissionPage>
          }
        />
        <Route
          path="admin/roles"
          element={
            <PermissionPage profile={profile} permission="users:manage">
              <RolesPermissionsPage profile={profile} />
            </PermissionPage>
          }
        />
      </Route>
      <Route
        path="*"
        element={<Navigate to={token ? "/" : "/login"} replace />}
      />
    </Routes>
  );
}

function ChangePasswordScreen({
  onChanged,
  onLogout,
}: {
  onChanged: () => Promise<void>;
  onLogout: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("新密碼與確認密碼不一致。");
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      await onChanged();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `變更失敗：${err.details}`
          : "變更失敗，請確認網路連線後再試一次。",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-5 py-12">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          首次登入
        </p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
          請先變更初始密碼
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          基於安全考量，首次登入必須設定新的密碼後才能使用系統。
        </p>
        <form onSubmit={submit} className="mt-6 space-y-5">
          <FormField label="目前（初始）密碼">
            <input
              className={inputClass}
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </FormField>
          <FormField label="新密碼" hint="長度 8–72 個字元。">
            <input
              className={inputClass}
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </FormField>
          <FormField label="確認新密碼">
            <input
              className={inputClass}
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </FormField>
          {error && (
            <p
              role="alert"
              className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
            >
              {error}
            </p>
          )}
          <button className={`${buttonClass} w-full`} disabled={busy}>
            {busy ? "正在變更密碼…" : "變更密碼並繼續"}
          </button>
        </form>
        <button
          type="button"
          className="mt-4 w-full text-xs text-slate-500 underline underline-offset-2"
          onClick={onLogout}
        >
          登出
        </button>
      </section>
    </main>
  );
}

function PermissionPage({
  profile,
  permission,
  children,
}: {
  profile: UserProfile | null;
  permission: string;
  children: ReactNode;
}) {
  if (!profile?.permissions.includes(permission))
    return (
      <section>
        <PageHeader
          eyebrow="權限控管"
          title="需要存取權限"
          description="目前帳號沒有檢視此作業功能的權限。"
        />
        <EmptyState
          title="無法存取此功能"
          description={`所需權限：${permission}。請洽系統管理員確認角色設定。`}
        />
      </section>
    );
  return children;
}

export default App;
