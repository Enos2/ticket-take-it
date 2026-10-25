// ==========================================
// FILE: frontend/src/components/ui/EmptyState.tsx
// PURPOSE: Friendly placeholder when there is nothing to show.
// ==========================================
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  text?: string;
  action?: ReactNode;
}

export default function EmptyState({ icon, title, text, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-16 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-panel text-gold">{icon}</div>
      <h2 className="text-lg font-semibold text-fg">{title}</h2>
      {text ? <p className="mt-1.5 max-w-md text-sm text-muted">{text}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/ui/EmptyState.tsx
// ==========================================
