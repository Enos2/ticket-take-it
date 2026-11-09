// ==========================================
// FILE: frontend/src/components/ShareButton.tsx
// PURPOSE: Share an event: the phone's share sheet where there is one, otherwise WhatsApp, X, Facebook and copy link.
// ==========================================
import { useEffect, useRef, useState } from "react";
import { Check, Link2, Share2 } from "lucide-react";

interface ShareButtonProps {
  title: string;
  path: string; // for example /events/jazz-night-1a2b3c
}

const itemClass =
  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-fg transition-colors hover:bg-panel-2";

export default function ShareButton({ title, path }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const url = `${window.location.origin}${path}`;
  const text = encodeURIComponent(`${title} ${url}`);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function share() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return; // they closed the sheet
      }
    }
    setOpen((v) => !v);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => void share()}
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-panel px-3 text-sm font-semibold text-fg transition-colors hover:border-gold"
      >
        <Share2 className="size-4" aria-hidden="true" />
        Share
      </button>

      {open ? (
        <div className="absolute top-11 left-0 z-20 w-52 rounded-xl border border-line bg-panel p-1.5 shadow-2xl">
          <a className={itemClass} href={`https://wa.me/?text=${text}`} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
          <a
            className={itemClass}
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            X
          </a>
          <a
            className={itemClass}
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Facebook
          </a>
          <button type="button" className={itemClass} onClick={() => void copy()}>
            {copied ? <Check className="size-4 text-ok" aria-hidden="true" /> : <Link2 className="size-4 text-gold" aria-hidden="true" />}
            {copied ? "Link copied" : "Copy link"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/ShareButton.tsx
// ==========================================