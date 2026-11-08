// ==========================================
// FILE: frontend/src/pages/user/Settings.tsx
// PURPOSE: A person's own settings: profile, password and deleting the account.
// ==========================================
import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { Field, PasswordField } from "../../components/ui/Field";
import { api, errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/authStore";
import { session } from "../../lib/session";
import { useTitle } from "../../lib/useTitle";
import type { AuthResult } from "../../lib/types";

const passwordProblem = (p: string): string | null => {
  if (p.length < 8) return "Use at least 8 characters";
  if (!/[A-Z]/.test(p)) return "Add an uppercase letter";
  if (!/[a-z]/.test(p)) return "Add a lowercase letter";
  if (!/[0-9]/.test(p)) return "Add a number";
  if (new TextEncoder().encode(p).length > 72) return "Use at most 72 bytes";
  return null;
};

export default function Settings() {
  useTitle("Settings");

  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const reloadUser = useAuth((s) => s.reloadUser);

  // ---- profile ----
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  const saveProfile = useMutation({
    mutationFn: () => api.patch("/users/me", { fullName: fullName.trim(), phone: phone.trim() || null }),
    onSuccess: async () => {
      await reloadUser();
      setProfileError(null);
      setProfileSaved(true);
    },
    onError: (err) => {
      setProfileSaved(false);
      setProfileError(errorMessage(err));
    },
  });

  // ---- password ----
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  const changePassword = useMutation({
    mutationFn: () => api.post<AuthResult>("/auth/change-password", { currentPassword: current, newPassword: next }),
    onSuccess: (data) => {
      // Every other device is signed out. This one gets fresh tokens.
      session.setTokens(data.accessToken, data.refreshToken);
      setCurrent("");
      setNext("");
      setConfirm("");
      setPasswordError(null);
      setPasswordSaved(true);
    },
    onError: (err) => {
      setPasswordSaved(false);
      setPasswordError(errorMessage(err));
    },
  });

  // ---- delete the account ----
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteAccount = useMutation({
    mutationFn: () => api.post<{ deleted: boolean }>("/users/me/delete", { password: deletePassword }),
    onSuccess: () => {
      session.clear(); // signs out here and in every other tab
      navigate("/", { replace: true });
    },
    onError: (err) => setDeleteError(errorMessage(err)),
  });

  if (!user) return null;

  const trimmedPhone = phone.trim();
  const phoneOk = !trimmedPhone || /^\+?[0-9\s-]{6,20}$/.test(trimmedPhone);
  const nameOk = fullName.trim().length >= 2;
  const profileDirty = fullName.trim() !== user.fullName || trimmedPhone !== (user.phone ?? "");

  const newProblem = next ? passwordProblem(next) : null;
  const mismatch = confirm.length > 0 && confirm !== next;
  const canChange = current.length > 0 && next.length > 0 && !newProblem && confirm === next && next !== current;

  function onProfile(e: FormEvent) {
    e.preventDefault();
    if (!nameOk || !phoneOk || !profileDirty) return;
    setProfileSaved(false);
    setProfileError(null);
    saveProfile.mutate();
  }

  function onPassword(e: FormEvent) {
    e.preventDefault();
    if (!canChange) return;
    setPasswordSaved(false);
    setPasswordError(null);
    changePassword.mutate();
  }

  return (
    <div className="max-w-2xl space-y-8">
      <Card className="p-6">
        <h2 className="text-lg font-bold text-fg">Your details</h2>
        <p className="mt-1 text-sm text-muted">Your email is {user.email}. To use a different email, create a new account.</p>

        <form onSubmit={onProfile} className="mt-5 space-y-5" noValidate>
          {profileError ? <Alert>{profileError}</Alert> : null}
          {profileSaved ? <Alert variant="success">Saved.</Alert> : null}

          <Field
            label="Full name"
            autoComplete="name"
            value={fullName}
            maxLength={120}
            onChange={(e) => {
              setFullName(e.target.value);
              setProfileSaved(false);
            }}
            error={fullName && !nameOk ? "Use at least 2 characters" : undefined}
          />
          <Field
            label="Phone (optional)"
            type="tel"
            autoComplete="tel"
            placeholder="0712 345 678"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setProfileSaved(false);
            }}
            error={!phoneOk ? "Use digits, spaces, dashes and an optional leading +" : undefined}
          />

          <Button type="submit" loading={saveProfile.isPending} disabled={!nameOk || !phoneOk || !profileDirty}>
            Save changes
          </Button>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-bold text-fg">Change your password</h2>
        <p className="mt-1 text-sm text-muted">You stay signed in here. Every other device is signed out.</p>

        <form onSubmit={onPassword} className="mt-5 space-y-5" noValidate>
          {passwordError ? <Alert>{passwordError}</Alert> : null}
          {passwordSaved ? <Alert variant="success">Password changed. Other devices were signed out.</Alert> : null}

          <PasswordField label="Current password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          <PasswordField
            label="New password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            error={newProblem ?? undefined}
            hint="At least 8 characters with an uppercase letter, a lowercase letter and a number."
          />
          <PasswordField
            label="Confirm new password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={mismatch ? "The passwords don't match" : undefined}
          />

          <Button type="submit" loading={changePassword.isPending} disabled={!canChange}>
            Change password
          </Button>
        </form>
      </Card>

      <Card className="border-brand/40 p-6">
        <h2 className="text-lg font-bold text-fg">Delete your account</h2>
        <p className="mt-1 text-sm text-muted">
          This erases your name, email, phone and password, and signs you out everywhere. It can't be undone. Records of orders and
          payments stay, because money records have to be kept, but they no longer show who you are.
        </p>
        <p className="mt-2 text-sm text-muted">
          You can't delete the account while you hold tickets for upcoming events, have an order waiting for payment or, as an
          organiser, have live events or a balance.
        </p>
        <Button
          variant="danger"
          className="mt-5"
          onClick={() => {
            setDeletePassword("");
            setDeleteError(null);
            setDeleting(true);
          }}
        >
          Delete my account
        </Button>
      </Card>

      <ConfirmDialog
        open={deleting}
        title="Delete your account for good?"
        confirmLabel="Delete my account"
        cancelLabel="Keep my account"
        danger
        loading={deleteAccount.isPending}
        onConfirm={() => {
          if (!deletePassword) return setDeleteError("Enter your password to confirm.");
          setDeleteError(null);
          deleteAccount.mutate();
        }}
        onCancel={() => setDeleting(false)}
      >
        <p>There is no way to get the account back.</p>
        <div className="space-y-4 pt-2">
          {deleteError ? <Alert>{deleteError}</Alert> : null}
          <PasswordField label="Your password" autoComplete="current-password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
        </div>
      </ConfirmDialog>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/user/Settings.tsx
// ==========================================