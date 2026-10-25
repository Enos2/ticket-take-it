// ==========================================
// FILE: frontend/src/pages/public/VerifyEmail.tsx
// PURPOSE: Opened from the link in the verification email.
// ==========================================
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle } from "lucide-react";
import Card from "../../components/ui/Card";
import { Spinner } from "../../components/ui/Spinner";
import { buttonClasses } from "../../components/ui/styles";
import { api, errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/authStore";
import { useTitle } from "../../lib/useTitle";

type State = "verifying" | "success" | "error";

export default function VerifyEmail() {
  useTitle("Verify email");

  const [params] = useSearchParams();
  const token = params.get("token");
  const reloadUser = useAuth((s) => s.reloadUser);

  const [state, setState] = useState<State>(token ? "verifying" : "error");
  const [message, setMessage] = useState(token ? "" : "This link is missing its token. Open the link from your email again.");

  // A link works once. In development React runs effects twice, and the second call would wrongly fail.
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;

    api
      .post("/auth/verify-email", { token }, { auth: false })
      .then(() => {
        setState("success");
        void reloadUser();
      })
      .catch((err: unknown) => {
        setMessage(errorMessage(err));
        setState("error");
      });
  }, [token, reloadUser]);

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-20">
      <Card className="flex flex-col items-center p-8 text-center">
        {state === "verifying" ? (
          <>
            <Spinner className="size-9" />
            <h1 className="mt-5 text-xl font-bold text-fg">Verifying your email...</h1>
          </>
        ) : state === "success" ? (
          <>
            <CheckCircle2 className="size-12 text-ok" aria-hidden="true" />
            <h1 className="mt-5 text-xl font-bold text-fg">Email verified</h1>
            <p className="mt-2 text-sm text-muted">Thank you. Your account is ready to go.</p>
            <Link to="/events" className={`${buttonClasses("primary")} mt-6`}>
              Browse events
            </Link>
          </>
        ) : (
          <>
            <XCircle className="size-12 text-brand" aria-hidden="true" />
            <h1 className="mt-5 text-xl font-bold text-fg">We couldn't verify your email</h1>
            <p className="mt-2 text-sm text-muted">{message}</p>
            <p className="mt-2 text-sm text-muted">Sign in and use "Resend link" at the top of the page to get a new one.</p>
            <Link to="/login" className={`${buttonClasses("secondary")} mt-6`}>
              Sign in
            </Link>
          </>
        )}
      </Card>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/public/VerifyEmail.tsx
// ==========================================