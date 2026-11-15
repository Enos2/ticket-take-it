// ==========================================
// FILE: frontend/src/components/DownloadTicketButton.tsx
// PURPOSE: A button that downloads one ticket, or every ticket of an order, as a PDF.
// ==========================================
import { useMutation } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { saveBlob } from "../lib/download";
import Button from "./ui/Button";

interface DownloadTicketButtonProps {
  path: string; // for example /tickets/<ticketId>/pdf
  fileName: string;
  label: string;
  variant?: "primary" | "secondary" | "ghost";
}

export default function DownloadTicketButton({ path, fileName, label, variant = "ghost" }: DownloadTicketButtonProps) {
  const download = useMutation({
    mutationFn: async () => saveBlob(await api.blob(path), fileName),
  });

  return (
    <div className="flex flex-col items-center gap-1">
      <Button size="sm" variant={variant} icon={<Download className="size-4" aria-hidden="true" />} loading={download.isPending} onClick={() => download.mutate()}>
        {label}
      </Button>
      {download.isError ? (
        <p className="max-w-48 text-center text-xs text-brand" role="alert">
          {errorMessage(download.error)}
        </p>
      ) : null}
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/DownloadTicketButton.tsx
// ==========================================