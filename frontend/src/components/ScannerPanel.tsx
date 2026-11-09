// ==========================================
// FILE: frontend/src/components/ScannerPanel.tsx
// PURPOSE: The camera scanner and manual code entry. Checks each code against the server and shows the result.
// ==========================================
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import Alert from "./ui/Alert";
import Button from "./ui/Button";
import Card from "./ui/Card";
import { Field } from "./ui/Field";
import { errorMessage } from "../lib/api";
import { doorApi } from "../lib/doorTypes";
import type { ScanResult, ScanStatus } from "../lib/doorTypes";

interface Props {
  eventId: string;
  gate: string | null; // the gate this phone is working
}

const REGION_ID = "tti-scanner-region";
const REPEAT_WINDOW_MS = 3000; // the camera sees one QR code many times a second

// How each answer looks.
const LOOK: Record<ScanStatus, { title: string; tone: string; Icon: typeof CheckCircle2 }> = {
  valid: { title: "Valid ticket", tone: "border-emerald-500/50 bg-emerald-500/10 text-emerald-400", Icon: CheckCircle2 },
  already_used: { title: "Already scanned", tone: "border-amber-500/50 bg-amber-500/10 text-amber-400", Icon: AlertTriangle },
  wrong_event: { title: "Ticket is for a different event", tone: "border-brand/50 bg-brand/10 text-brand", Icon: XCircle },
  invalid: { title: "Not a valid ticket", tone: "border-brand/50 bg-brand/10 text-brand", Icon: XCircle },
};

export default function ScannerPanel({ eventId, gate }: Props) {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);

  // The camera callback outlives renders, so it reads the latest values through refs.
  const eventIdRef = useRef(eventId);
  const gateRef = useRef(gate);
  const busyRef = useRef(false);
  const lastRef = useRef<{ code: string; at: number } | null>(null);

  useEffect(() => {
    eventIdRef.current = eventId;
    gateRef.current = gate;
  }, [eventId, gate]);

  // Send one code to the server.
  async function check(code: string) {
    const trimmed = code.trim();
    if (!trimmed || busyRef.current) return;

    // Ignore the same code seen again straight away.
    const last = lastRef.current;
    if (last && last.code === trimmed && Date.now() - last.at < REPEAT_WINDOW_MS) return;
    lastRef.current = { code: trimmed, at: Date.now() };

    busyRef.current = true;
    setBusy(true);
    try {
      const res = await doorApi.scan({ code: trimmed, eventId: eventIdRef.current, gate: gateRef.current });
      setResult(res);
      setError(null);
      // A short buzz for a good ticket, a double buzz for a problem.
      if (navigator.vibrate) navigator.vibrate(res.status === "valid" ? 60 : [120, 60, 120]);
    } catch (err) {
      setResult(null);
      setError(errorMessage(err));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  // ---- camera ----
  useEffect(() => {
    let cancelled = false;
    let started = false;
    const scanner = new Html5Qrcode(REGION_ID);

    const stop = () => void scanner.stop().then(() => scanner.clear()).catch(() => {});

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => void check(decoded),
        () => {} // a frame with no code in it is normal
      )
      .then(() => {
        started = true;
        if (cancelled) stop(); // left the page before the camera opened
      })
      .catch(() => {
        if (!cancelled) setError("The camera isn't available. Allow camera access, or type the ticket code below.");
      });

    return () => {
      cancelled = true;
      if (started) stop();
    };
    // The camera starts once. Current values come through the refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onManual(e: FormEvent) {
    e.preventDefault();
    void check(manual);
    setManual("");
  }

  const look = result ? LOOK[result.status] : null;

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div id={REGION_ID} className="min-h-[280px] w-full" />
      </Card>

      {error ? <Alert>{error}</Alert> : null}

      {look && result ? (
        <div className={`rounded-xl border p-4 ${look.tone}`} role="status">
          <div className="flex items-center gap-2 font-semibold">
            <look.Icon className="h-5 w-5" />
            {look.title}
          </div>
          {result.holderName || result.tierName ? (
            <p className="mt-2 text-sm text-fg">
              {result.holderName}
              {result.tierName ? ` - ${result.tierName}` : ""}
            </p>
          ) : null}
          {result.status === "already_used" && result.checkedInAt ? (
            <p className="mt-1 text-xs">
              Checked in at {new Date(result.checkedInAt).toLocaleTimeString()}
              {result.gate ? ` through ${result.gate}` : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* For tickets the camera can't read */}
      <form onSubmit={onManual} className="space-y-3" noValidate>
        <Field label="Ticket code" placeholder="Type the code" value={manual} onChange={(e) => setManual(e.target.value)} />
        <Button type="submit" loading={busy} disabled={!manual.trim()}>
          Check ticket
        </Button>
      </form>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/ScannerPanel.tsx
// ==========================================