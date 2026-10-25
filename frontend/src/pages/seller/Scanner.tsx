// ==========================================
// FILE: frontend/src/pages/seller/Scanner.tsx
// PURPOSE: Door check-in. Scans ticket QR codes with the camera, or takes a code typed in by hand.
// ==========================================
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import QrScanner from "qr-scanner";
import { Camera, CameraOff, CheckCircle2, XCircle } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import { Field } from "../../components/ui/Field";
import { api, errorMessage } from "../../lib/api";
import { cx } from "../../lib/cx";
import { formatDateTime, formatTime } from "../../lib/format";
import { useTitle } from "../../lib/useTitle";
import type { CheckInResult } from "../../lib/types";

type Outcome =
  | { kind: "ok"; holder: string; ticketType: string; event: string; at: string }
  | { kind: "error"; message: string };

interface HistoryItem {
  id: number;
  at: string;
  ok: boolean;
  text: string;
}

const MIN_CODE = 10; // the same limits the server applies
const MAX_CODE = 64;
const SAME_CODE_PAUSE_MS = 4_000;

// The server reports times as ISO text. Show them the way people read them.
const readable = (message: string) =>
  message.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, (iso) => formatDateTime(iso));

function cameraProblem(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  const text = typeof err === "string" ? err : err instanceof Error ? err.message : "";

  if (name === "NotAllowedError" || /denied|permission/i.test(text)) {
    return "Camera access is blocked. Allow it in your browser settings, or type the code by hand.";
  }
  if (name === "NotFoundError" || /not found|no camera/i.test(text)) return "No camera was found on this device.";
  if (name === "NotReadableError") return "The camera is being used by another app.";
  return "The camera could not be started. You can still type the code by hand.";
}

export default function Scanner() {
  useTitle("Scan tickets");

  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const busyRef = useRef(false);
  const lastRef = useRef({ code: "", at: 0 });
  const historyId = useRef(0);

  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [manual, setManual] = useState("");

  const remember = useCallback((ok: boolean, text: string) => {
    historyId.current += 1;
    const item: HistoryItem = { id: historyId.current, at: new Date().toISOString(), ok, text };
    setHistory((prev) => [item, ...prev].slice(0, 8));
  }, []);

  // Sends one code to the server. Only uses refs and setters, so it never goes stale inside the camera callback.
  const checkCode = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code) return;

      const last = lastRef.current;
      if (last.code === code && Date.now() - last.at < SAME_CODE_PAUSE_MS) return; // the camera sees the same code many times
      if (busyRef.current) return;

      lastRef.current = { code, at: Date.now() };

      if (code.length < MIN_CODE || code.length > MAX_CODE) {
        setOutcome({ kind: "error", message: "That is not a Ticket Take It code." });
        remember(false, "Not a ticket code");
        return;
      }

      busyRef.current = true;
      setChecking(true);
      try {
        const result = await api.post<CheckInResult>("/checkin", { code });
        setOutcome({
          kind: "ok",
          holder: result.holder,
          ticketType: result.ticketType,
          event: result.event,
          at: result.checkedInAt,
        });
        remember(true, `${result.holder}, ${result.ticketType}`);
        if ("vibrate" in navigator) navigator.vibrate(60);
      } catch (err) {
        const message = readable(errorMessage(err));
        setOutcome({ kind: "error", message });
        remember(false, message);
        if ("vibrate" in navigator) navigator.vibrate([120, 60, 120]);
      } finally {
        busyRef.current = false;
        setChecking(false);
      }
    },
    [remember]
  );

  function stopCamera() {
    scannerRef.current?.stop();
    scannerRef.current?.destroy();
    scannerRef.current = null;
    setActive(false);
  }

  async function startCamera() {
    const video = videoRef.current;
    if (!video || scannerRef.current) return;

    setCameraError(null);
    setStarting(true);

    try {
      if (!(await QrScanner.hasCamera())) {
        setCameraError("No camera was found on this device.");
        return;
      }

      const scanner = new QrScanner(video, (result) => void checkCode(result.data), {
        preferredCamera: "environment",
        returnDetailedScanResult: true,
        highlightScanRegion: true,
        highlightCodeOutline: true,
        maxScansPerSecond: 5,
      });

      try {
        await scanner.start();
        scannerRef.current = scanner;
        setActive(true);
      } catch (err) {
        scanner.destroy();
        setCameraError(cameraProblem(err));
      }
    } finally {
      setStarting(false);
    }
  }

  // Release the camera when leaving the page.
  useEffect(() => {
    return () => {
      scannerRef.current?.stop();
      scannerRef.current?.destroy();
      scannerRef.current = null;
    };
  }, []);

  function submitManual(e: FormEvent) {
    e.preventDefault();
    lastRef.current = { code: "", at: 0 }; // typing the same code again is deliberate
    void checkCode(manual);
    setManual("");
  }

  return (
    <div className="grid gap-8 lg:grid-cols-5">
      {/* camera and manual entry */}
      <div className="space-y-6 lg:col-span-3">
        <Card className="overflow-hidden">
          <div className="relative aspect-square bg-black sm:aspect-video">
            <video ref={videoRef} className={cx("size-full object-cover", !active && "invisible")} muted playsInline />
            {!active ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <CameraOff className="size-10 text-muted" aria-hidden="true" />
                <p className="max-w-xs text-sm text-muted">Start the camera, then hold a ticket's QR code in front of it.</p>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3 p-4">
            {active ? (
              <Button variant="secondary" onClick={stopCamera}>
                Stop camera
              </Button>
            ) : (
              <Button icon={<Camera className="size-4" aria-hidden="true" />} loading={starting} onClick={() => void startCamera()}>
                Start camera
              </Button>
            )}
            {checking ? <span className="text-sm text-gold">Checking...</span> : null}
          </div>
        </Card>

        {cameraError ? <Alert>{cameraError}</Alert> : null}

        <p className="text-xs text-muted">
          Browsers only allow the camera on secure pages. It works on this computer at localhost and on your live site, but not on a
          plain http address on your network.
        </p>

        <Card className="p-5">
          <form onSubmit={submitManual} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Field
                label="Or type the ticket code"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                maxLength={MAX_CODE}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </div>
            <Button type="submit" variant="secondary" disabled={manual.trim().length === 0} loading={checking}>
              Check ticket
            </Button>
          </form>
        </Card>
      </div>

      {/* result and history */}
      <div className="space-y-6 lg:col-span-2">
        {outcome ? (
          <div
            role="status"
            aria-live="assertive"
            className={cx(
              "rounded-2xl border p-6",
              outcome.kind === "ok" ? "border-ok bg-ok/10" : "border-brand bg-brand/10"
            )}
          >
            {outcome.kind === "ok" ? (
              <>
                <CheckCircle2 className="size-10 text-ok" aria-hidden="true" />
                <h2 className="mt-3 text-2xl font-extrabold text-fg">Let them in</h2>
                <p className="mt-2 text-lg font-semibold text-fg">{outcome.holder}</p>
                <p className="text-sm text-muted">{outcome.ticketType}</p>
                <p className="text-sm text-muted">{outcome.event}</p>
                <p className="mt-2 text-xs text-muted">Checked in at {formatTime(outcome.at)}</p>
              </>
            ) : (
              <>
                <XCircle className="size-10 text-brand" aria-hidden="true" />
                <h2 className="mt-3 text-2xl font-extrabold text-fg">Do not admit</h2>
                <p className="mt-2 text-sm text-fg">{outcome.message}</p>
              </>
            )}
            <Button
              variant="secondary"
              size="sm"
              className="mt-5"
              onClick={() => {
                setOutcome(null);
                lastRef.current = { code: "", at: 0 };
              }}
            >
              Scan next
            </Button>
          </div>
        ) : (
          <Card className="p-6 text-sm text-muted">Results appear here. Green means the person can enter.</Card>
        )}

        {history.length > 0 ? (
          <section>
            <h3 className="mb-3 text-sm font-semibold tracking-widest text-gold uppercase">Recent scans</h3>
            <ul className="space-y-2">
              {history.map((item) => (
                <li key={item.id} className="flex items-start gap-3 rounded-lg border border-line bg-panel px-4 py-3 text-sm">
                  {item.ok ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-label="Admitted" />
                  ) : (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-brand" aria-label="Refused" />
                  )}
                  <span className="min-w-0 flex-1 text-fg">{item.text}</span>
                  <span className="shrink-0 text-xs text-muted tabular-nums">{formatTime(item.at)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/seller/Scanner.tsx
// ==========================================