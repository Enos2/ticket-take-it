// ==========================================
// FILE: frontend/src/components/TransferControls.tsx
// PURPOSE: Under a ticket: send it to someone, or see and cancel a transfer that is waiting.
// ==========================================
import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { MAX_TRANSFERS_PER_TICKET, canTransfer } from "../lib/transfers";
import type { CreateTransferPayload, TransferView, TransferableTicket } from "../lib/transfers";
import Alert from "./ui/Alert";
import Button from "./ui/Button";
import { Field } from "./ui/Field";

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

interface TransferControlsProps {
  ticket: TransferableTicket;
  pending: TransferView | undefined; // a transfer of this ticket that is still waiting
}

export default function TransferControls({ ticket, pending }: TransferControlsProps) {
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["transfers"] });
    void queryClient.invalidateQueries({ queryKey: ["my-tickets"] });
  }

  const send = useMutation({
    mutationFn: (payload: CreateTransferPayload) => api.post<TransferView>("/transfers", payload),
    onSuccess: () => {
      refresh();
      setOpen(false);
      setEmail("");
      setMessage("");
      setShowErrors(false);
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const cancel = useMutation({
    mutationFn: (transferId: string) => api.post(`/transfers/${transferId}/cancel`),
    onSuccess: () => {
      refresh();
      setError(null);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const emailError = EMAIL_PATTERN.test(email.trim()) ? undefined : "Enter the email address of the person you are sending it to";

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (emailError) {
      setShowErrors(true);
      return;
    }
    setError(null);
    send.mutate({ ticketId: ticket.id, toEmail: email.trim().toLowerCase(), message: message.trim() || undefined });
  }

  // A transfer is waiting
  if (pending) {
    return (
      <div className="space-y-3">
        {error ? <Alert>{error}</Alert> : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            Waiting for <span className="font-semibold text-fg">{pending.toEmail}</span> to accept, until {formatDateTime(pending.expiresAt)}. Until then the
            ticket is still yours.
          </p>
          <Button size="sm" variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate(pending.id)}>
            Cancel transfer
          </Button>
        </div>
      </div>
    );
  }

  if (!canTransfer(ticket)) {
    return ticket.status === "VALID" && ticket.transferCount >= MAX_TRANSFERS_PER_TICKET ? (
      <p className="text-sm text-muted">This ticket has been transferred {MAX_TRANSFERS_PER_TICKET} times, the most allowed.</p>
    ) : null;
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Can't make it? Send this ticket to someone else.</p>
        <Button size="sm" variant="secondary" icon={<Send className="size-4" aria-hidden="true" />} onClick={() => setOpen(true)}>
          Transfer
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error ? <Alert>{error}</Alert> : null}

      <Field
        label="Send to (email address)"
        type="email"
        placeholder="friend@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={showErrors ? emailError : undefined}
        hint="They need a Ticket Take It account with this email address. When they accept, a new QR code is created and yours stops working."
        autoFocus
      />

      <Field label="Message (optional)" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} />

      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="sm" loading={send.isPending}>
          Send ticket
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={send.isPending}
          onClick={() => {
            setOpen(false);
            setError(null);
            setShowErrors(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/TransferControls.tsx
// ==========================================