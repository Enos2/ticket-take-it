// ==========================================
// FILE: frontend/src/components/seller/PayoutDetailsForm.tsx
// PURPOSE: Where a seller's money is sent. Changing it needs the account password.
// ==========================================
import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "../../lib/api";
import { METHOD_LABEL } from "../../lib/finance";
import { formatDateTime } from "../../lib/format";
import type { Earnings } from "../../lib/financeTypes";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Card from "../ui/Card";
import { Field, PasswordField, SelectField, TextAreaField } from "../ui/Field";

type Method = "MPESA" | "BANK";

const looksLikeKenyanPhone = (value: string) => /^(?:\+?254|0)?[17]\d{8}$/.test(value.replace(/[\s-]/g, ""));

export default function PayoutDetailsForm({ earnings }: { earnings: Earnings }) {
  const queryClient = useQueryClient();

  const [method, setMethod] = useState<Method>(earnings.payoutMethod === "BANK" ? "BANK" : "MPESA");
  const [details, setDetails] = useState(earnings.payoutDetails ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () => api.patch("/finance/payout-details", { method, details: details.trim(), password }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["seller-earnings"] });
      setPassword("");
      setError(null);
      setSaved(true);
    },
    onError: (err) => {
      setSaved(false);
      setError(errorMessage(err));
    },
  });

  const detailsOk = method === "MPESA" ? looksLikeKenyanPhone(details) : details.trim().length >= 5;
  const canSave = detailsOk && password.length > 0;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setError(null);
    setSaved(false);
    save.mutate();
  }

  const current = earnings.payoutDetails
    ? `${METHOD_LABEL[earnings.payoutMethod === "BANK" ? "BANK" : "MPESA"]}: ${earnings.payoutDetails}`
    : null;

  return (
    <Card className="p-6">
      <h3 className="text-lg font-bold text-fg">Where to send your money</h3>
      <p className="mt-1 text-sm text-muted">
        {current ? (
          <>
            Currently <span className="font-semibold text-fg">{current}</span>
            {earnings.payoutUpdatedAt ? `, saved ${formatDateTime(earnings.payoutUpdatedAt)}` : ""}.
          </>
        ) : (
          "Add this before your first payout. Without it we can't pay you."
        )}
      </p>

      <form onSubmit={onSubmit} className="mt-5 space-y-5" noValidate>
        {error ? <Alert>{error}</Alert> : null}
        {saved ? <Alert variant="success">Saved. We emailed you to confirm the change.</Alert> : null}

        <SelectField
          label="Payout method"
          value={method}
          onChange={(e) => {
            setMethod(e.target.value as Method);
            setSaved(false);
          }}
        >
          <option value="MPESA">M-Pesa</option>
          <option value="BANK">Bank transfer</option>
        </SelectField>

        {method === "MPESA" ? (
          <Field
            label="M-Pesa phone number"
            type="tel"
            inputMode="tel"
            placeholder="0712 345 678"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            error={details && !detailsOk ? "Enter a valid Safaricom number, for example 0712345678" : undefined}
          />
        ) : (
          <TextAreaField
            label="Bank details"
            rows={3}
            maxLength={300}
            placeholder="Bank name, account name, account number, branch"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
          />
        )}

        <PasswordField
          label="Your password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="Needed to change where your money goes. It protects you if someone else gets into your account."
        />

        <Button type="submit" loading={save.isPending} disabled={!canSave}>
          Save payout details
        </Button>
      </form>
    </Card>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/seller/PayoutDetailsForm.tsx
// ==========================================