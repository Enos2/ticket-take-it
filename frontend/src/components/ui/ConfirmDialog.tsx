// ==========================================
// FILE: frontend/src/components/ui/ConfirmDialog.tsx
// PURPOSE: A pop-up that asks "are you sure?" before something that can't be undone.
// ==========================================
import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import Button from "./Button";
import { buttonClasses } from "./styles";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Go back",
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Keeps the latest onCancel without restarting the effect below on every render.
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  });

  useEffect(() => {
    if (!open) return;

    cancelRef.current?.focus(); // the safe choice is focused first

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loading) onCancelRef.current();
    };
    document.addEventListener("keydown", onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // the page behind doesn't scroll

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, loading]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-2xl border border-line bg-panel p-6 shadow-2xl"
      >
        <h2 id={titleId} className="text-lg font-bold text-fg">
          {title}
        </h2>
        <div className="mt-3 space-y-2 text-sm text-muted">{children}</div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" disabled={loading} onClick={onCancel} className={buttonClasses("secondary")}>
            {cancelLabel}
          </button>
          <Button variant={danger ? "danger" : "primary"} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/ui/ConfirmDialog.tsx
// ==========================================