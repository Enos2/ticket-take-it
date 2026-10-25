// ==========================================
// FILE: frontend/src/components/ui/Field.tsx
// PURPOSE: Labelled form controls: text input, password input, text area and select.
// ==========================================
import { useId, useState } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cx } from "../../lib/cx";

const controlClasses =
  "w-full rounded-lg border bg-ink px-3.5 text-sm text-fg placeholder:text-muted/70 transition-colors focus:border-gold focus:outline-none disabled:opacity-60";
const inputClasses = `h-11 ${controlClasses}`;

interface BaseProps {
  label: string;
  error?: string;
  hint?: string;
}

function Message({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (error) {
    return (
      <p id={id} className="mt-1.5 text-xs text-brand">
        {error}
      </p>
    );
  }
  if (hint) {
    return (
      <p id={id} className="mt-1.5 text-xs text-muted">
        {hint}
      </p>
    );
  }
  return null;
}

function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-fg">
      {children}
    </label>
  );
}

export function Field({ label, error, hint, className, id, ...rest }: BaseProps & InputHTMLAttributes<HTMLInputElement>) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-message`;

  return (
    <div>
      <Label htmlFor={inputId}>{label}</Label>
      <input
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? messageId : undefined}
        className={cx(inputClasses, error ? "border-brand" : "border-line", className)}
        {...rest}
      />
      <Message id={messageId} error={error} hint={hint} />
    </div>
  );
}

export function PasswordField({ label, error, hint, className, id, ...rest }: BaseProps & InputHTMLAttributes<HTMLInputElement>) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-message`;
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <Label htmlFor={inputId}>{label}</Label>
      <div className="relative">
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          aria-invalid={Boolean(error)}
          aria-describedby={error || hint ? messageId : undefined}
          className={cx(inputClasses, "pr-11", error ? "border-brand" : "border-line", className)}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted transition-colors hover:text-fg"
        >
          {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      </div>
      <Message id={messageId} error={error} hint={hint} />
    </div>
  );
}

export function TextAreaField({
  label,
  error,
  hint,
  className,
  id,
  rows = 5,
  ...rest
}: BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-message`;

  return (
    <div>
      <Label htmlFor={inputId}>{label}</Label>
      <textarea
        id={inputId}
        rows={rows}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? messageId : undefined}
        className={cx(controlClasses, "resize-y py-3", error ? "border-brand" : "border-line", className)}
        {...rest}
      />
      <Message id={messageId} error={error} hint={hint} />
    </div>
  );
}

export function SelectField({
  label,
  error,
  hint,
  className,
  id,
  children,
  ...rest
}: BaseProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-message`;

  return (
    <div>
      <Label htmlFor={inputId}>{label}</Label>
      <select
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? messageId : undefined}
        className={cx(inputClasses, error ? "border-brand" : "border-line", className)}
        {...rest}
      >
        {children}
      </select>
      <Message id={messageId} error={error} hint={hint} />
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/ui/Field.tsx
// ==========================================