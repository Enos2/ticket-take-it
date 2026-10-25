// ==========================================
// FILE: frontend/src/pages/admin/AdminSellers.tsx
// PURPOSE: Review seller applications, and approve, reject, suspend or reinstate sellers.
// ==========================================
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, Phone, Store, User } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Chips from "../../components/ui/Chips";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import EmptyState from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { api, errorMessage } from "../../lib/api";
import { sellerStatusTone } from "../../lib/admin";
import type { AdminSeller } from "../../lib/adminTypes";
import { formatDateTime } from "../../lib/format";
import { SELLER_STATUS_LABEL } from "../../lib/seller";
import { useAdminList } from "../../lib/useAdminList";
import { useTitle } from "../../lib/useTitle";
import type { SellerStatus } from "../../lib/types";

type Filter = "" | SellerStatus;
type Decision = "APPROVED" | "REJECTED" | "SUSPENDED";

const FILTERS: { label: string; value: Filter }[] = [
  { label: "Waiting for review", value: "PENDING" },
  { label: "Approved", value: "APPROVED" },
  { label: "Suspended", value: "SUSPENDED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "All", value: "" },
];

interface Action {
  label: string;
  decision: Decision;
  variant: "primary" | "secondary" | "danger";
  confirm: boolean;
}

function actionsFor(status: SellerStatus): Action[] {
  switch (status) {
    case "PENDING":
      return [
        { label: "Approve", decision: "APPROVED", variant: "primary", confirm: false },
        { label: "Reject", decision: "REJECTED", variant: "danger", confirm: true },
      ];
    case "APPROVED":
      return [{ label: "Suspend", decision: "SUSPENDED", variant: "danger", confirm: true }];
    case "REJECTED":
      return [{ label: "Approve instead", decision: "APPROVED", variant: "secondary", confirm: false }];
    case "SUSPENDED":
      return [{ label: "Reinstate", decision: "APPROVED", variant: "primary", confirm: false }];
  }
}

export default function AdminSellers() {
  useTitle("Sellers");
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<Filter>("PENDING");
  const [pending, setPending] = useState<{ seller: AdminSeller; decision: Decision } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { query, items, total } = useAdminList<AdminSeller>("admin-sellers", "/admin/sellers", { status: filter });

  const change = useMutation({
    mutationFn: ({ seller, decision }: { seller: AdminSeller; decision: Decision }) =>
      api.patch(`/admin/sellers/${seller.id}/status`, { status: decision }),
    onSuccess: (_data, { seller, decision }) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-sellers"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      setPending(null);
      setError(null);
      setNotice(
        decision === "APPROVED"
          ? `${seller.businessName} is approved and can now publish events. They were emailed.`
          : decision === "REJECTED"
            ? `${seller.businessName} was not approved. They were emailed.`
            : `${seller.businessName} is suspended. They were emailed.`
      );
    },
    onError: (err) => {
      setPending(null);
      setNotice(null);
      setError(errorMessage(err));
    },
  });

  function choose(seller: AdminSeller, action: Action) {
    setNotice(null);
    setError(null);
    if (action.confirm) setPending({ seller, decision: action.decision });
    else change.mutate({ seller, decision: action.decision });
  }

  return (
    <div>
      <div className="mb-6">
        <Chips label="Filter sellers" options={FILTERS} value={filter} onChange={setFilter} />
      </div>

      <div className="mb-6 space-y-3 empty:hidden">
        {error ? <Alert>{error}</Alert> : null}
        {notice ? <Alert variant="success">{notice}</Alert> : null}
      </div>

      {query.isPending ? (
        <PageSpinner />
      ) : query.isError ? (
        <div className="space-y-4">
          <Alert>{errorMessage(query.error)}</Alert>
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Store className="size-6" aria-hidden="true" />}
          title={filter === "PENDING" ? "No applications waiting" : "No sellers here"}
          text={filter === "PENDING" ? "New applications appear here. Choose All to see every seller." : undefined}
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">
            {total} {total === 1 ? "seller" : "sellers"}
          </p>

          <ul className="space-y-3">
            {items.map((seller) => (
              <li key={seller.id}>
                <Card className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-fg">{seller.businessName}</h2>
                      <Badge tone={sellerStatusTone(seller.status)}>{SELLER_STATUS_LABEL[seller.status]}</Badge>
                    </div>

                    <ul className="mt-2 space-y-1 text-sm text-muted">
                      <li className="flex items-center gap-2">
                        <User className="size-4 shrink-0 text-gold" aria-hidden="true" />
                        {seller.user.fullName} ({seller.user.email})
                      </li>
                      <li className="flex items-center gap-2">
                        <Mail className="size-4 shrink-0 text-gold" aria-hidden="true" />
                        {seller.businessEmail}
                      </li>
                      {seller.businessPhone ? (
                        <li className="flex items-center gap-2">
                          <Phone className="size-4 shrink-0 text-gold" aria-hidden="true" />
                          {seller.businessPhone}
                        </li>
                      ) : null}
                    </ul>

                    <p className="mt-2 text-xs text-muted">
                      Applied {formatDateTime(seller.createdAt)}
                      {seller.approvedAt ? ` · approved ${formatDateTime(seller.approvedAt)}` : ""}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {actionsFor(seller.status).map((action) => (
                      <Button
                        key={action.label}
                        size="sm"
                        variant={action.variant}
                        loading={change.isPending && change.variables?.seller.id === seller.id && change.variables.decision === action.decision}
                        disabled={change.isPending}
                        onClick={() => choose(seller, action)}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                </Card>
              </li>
            ))}
          </ul>

          {query.hasNextPage ? (
            <div className="mt-8 flex justify-center">
              <Button variant="secondary" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                Load more
              </Button>
            </div>
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={pending?.decision === "REJECTED" ? `Reject ${pending.seller.businessName}?` : `Suspend ${pending?.seller.businessName ?? "this seller"}?`}
        confirmLabel={pending?.decision === "REJECTED" ? "Reject application" : "Suspend seller"}
        danger
        loading={change.isPending}
        onConfirm={() => pending && change.mutate(pending)}
        onCancel={() => setPending(null)}
      >
        {pending?.decision === "REJECTED" ? (
          <p>The applicant is emailed that their application was not approved, and they can't create events.</p>
        ) : (
          <>
            <p>New ticket sales for their events stop straight away, and they can't manage events or scan tickets.</p>
            <p>Tickets people already bought stay valid. The seller is emailed. You can reinstate them later.</p>
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/admin/AdminSellers.tsx
// ==========================================