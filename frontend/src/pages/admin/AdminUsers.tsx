// ==========================================
// FILE: frontend/src/pages/admin/AdminUsers.tsx
// PURPOSE: Find people and switch their accounts on or off.
// ==========================================
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import EmptyState from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import SearchInput from "../../components/ui/SearchInput";
import { ROLE_LABEL } from "../../lib/admin";
import type { AdminUser } from "../../lib/adminTypes";
import { api, errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/authStore";
import { formatDate } from "../../lib/format";
import { useAdminList } from "../../lib/useAdminList";
import { useDebouncedValue } from "../../lib/useDebounce";
import { useTitle } from "../../lib/useTitle";

export default function AdminUsers() {
  useTitle("Users");
  const queryClient = useQueryClient();
  const me = useAuth((s) => s.user);

  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim());
  const [disabling, setDisabling] = useState<AdminUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { query, items, total } = useAdminList<AdminUser>("admin-users", "/admin/users", { q });

  const change = useMutation({
    mutationFn: ({ user, isActive }: { user: AdminUser; isActive: boolean }) =>
      api.patch(`/admin/users/${user.id}/status`, { isActive }),
    onSuccess: (_data, { user, isActive }) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setDisabling(null);
      setError(null);
      setNotice(isActive ? `${user.fullName}'s account is enabled again.` : `${user.fullName}'s account is disabled and they were signed out everywhere.`);
    },
    onError: (err) => {
      setDisabling(null);
      setNotice(null);
      setError(errorMessage(err));
    },
  });

  return (
    <div>
      <div className="mb-6 max-w-md">
        <SearchInput label="Search" value={search} onChange={setSearch} placeholder="Name or email" />
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
          icon={<Users className="size-6" aria-hidden="true" />}
          title="No accounts found"
          text={q ? "Try a different search." : undefined}
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">
            {total} {total === 1 ? "account" : "accounts"}
          </p>

          <ul className="space-y-3">
            {items.map((user) => {
              const isMe = user.id === me?.id;
              return (
                <li key={user.id}>
                  <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-fg">{user.fullName}</h2>
                        <Badge tone={user.role === "ADMIN" ? "gold" : "neutral"}>{ROLE_LABEL[user.role]}</Badge>
                        {!user.isActive ? <Badge tone="brand">Disabled</Badge> : null}
                        {isMe ? <Badge tone="ok">You</Badge> : null}
                      </div>
                      <p className="mt-1 truncate text-sm text-muted">{user.email}</p>
                      <p className="mt-0.5 text-xs text-muted">Joined {formatDate(user.createdAt)}</p>
                    </div>

                    {!isMe ? (
                      user.isActive ? (
                        <Button
                          size="sm"
                          variant="danger"
                          className="shrink-0"
                          disabled={change.isPending}
                          onClick={() => {
                            setNotice(null);
                            setError(null);
                            setDisabling(user);
                          }}
                        >
                          Disable
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="shrink-0"
                          loading={change.isPending && change.variables?.user.id === user.id}
                          disabled={change.isPending}
                          onClick={() => {
                            setNotice(null);
                            setError(null);
                            change.mutate({ user, isActive: true });
                          }}
                        >
                          Enable
                        </Button>
                      )
                    ) : null}
                  </Card>
                </li>
              );
            })}
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
        open={disabling !== null}
        title={`Disable ${disabling?.fullName ?? "this account"}?`}
        confirmLabel="Disable account"
        danger
        loading={change.isPending}
        onConfirm={() => disabling && change.mutate({ user: disabling, isActive: false })}
        onCancel={() => setDisabling(null)}
      >
        <p>They are signed out everywhere straight away and can't sign in until you enable the account again.</p>
        <p>Tickets they already hold stay valid.</p>
      </ConfirmDialog>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/admin/AdminUsers.tsx
// ==========================================