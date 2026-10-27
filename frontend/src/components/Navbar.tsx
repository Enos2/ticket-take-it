// ==========================================
// FILE: frontend/src/components/Navbar.tsx
// PURPOSE: Slim top navigation, led by the TTI icon + Ticket Take It wordmark.
// ==========================================
import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { LogOut, Menu, X } from "lucide-react";
import { cx } from "../lib/cx";
import { useAuth } from "../lib/authStore";
import Button from "./ui/Button";
import { buttonClasses } from "./ui/styles";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cx("rounded-md px-3 py-1.5 text-sm font-medium transition-colors", isActive ? "text-gold" : "text-muted hover:text-fg");

export default function Navbar() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);
  const firstName = user?.fullName.split(" ")[0];

  // Buyers see "Sell tickets", sellers see their dashboard and admins see the admin area.
  const roleLink =
    user?.role === "ADMIN"
      ? { to: "/admin", label: "Admin" }
      : user?.role === "SELLER"
        ? { to: "/seller", label: "Seller dashboard" }
        : user?.role === "USER"
          ? { to: "/seller/apply", label: "Sell tickets" }
          : null;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        {/*
          Logo: icon on the left, wordmark to its right.
          Both PNGs are transparent. The icon file has empty space around the
          artwork, so it sits in a small clipped box and is scaled up slightly
          so only the artwork takes up room. That keeps the navbar slim.
        */}
        <Link to="/" onClick={close} className="flex shrink-0 items-center gap-2.5" aria-label="Ticket Take It, home">
          <span className="relative block h-8 w-16 shrink-0 overflow-hidden" aria-hidden="true">
            <img
              src="/logo-icon.png"
              alt=""
              width={512}
              height={512}
              className="absolute left-1/2 top-1/2 h-auto w-[108%] max-w-none -translate-x-1/2 -translate-y-1/2"
            />
          </span>
          <img
            src="/logo-wordmark.png"
            alt="Ticket Take It"
            width={720}
            height={75}
            className="h-4 w-auto sm:h-5"
          />
        </Link>

        {/* desktop */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          <NavLink to="/events" className={linkClass}>
            Events
          </NavLink>
          {user ? (
            <NavLink to="/account/tickets" className={linkClass}>
              My tickets
            </NavLink>
          ) : null}
          {roleLink ? (
            <NavLink to={roleLink.to} className={linkClass}>
              {roleLink.label}
            </NavLink>
          ) : null}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <>
              <span className="text-sm text-muted">
                Hi, <span className="font-semibold text-fg">{firstName}</span>
              </span>
              <Button variant="ghost" size="sm" icon={<LogOut className="size-4" aria-hidden="true" />} onClick={() => void logout()}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Link to="/login" className={buttonClasses("ghost", "sm")}>
                Sign in
              </Link>
              <Link to="/register" className={buttonClasses("primary", "sm")}>
                Create account
              </Link>
            </>
          )}
        </div>

        {/* mobile toggle */}
        <button
          type="button"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-panel hover:text-fg md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
        </button>
      </div>

      {/* mobile panel */}
      {open ? (
        <div className="border-t border-line bg-ink px-4 pb-4 md:hidden">
          <nav className="flex flex-col py-2" aria-label="Main">
            <NavLink to="/events" className={linkClass} onClick={close}>
              Events
            </NavLink>
            {user ? (
              <>
                <NavLink to="/account/tickets" className={linkClass} onClick={close}>
                  My tickets
                </NavLink>
                <NavLink to="/account/orders" className={linkClass} onClick={close}>
                  My orders
                </NavLink>
              </>
            ) : null}
            {roleLink ? (
              <NavLink to={roleLink.to} className={linkClass} onClick={close}>
                {roleLink.label}
              </NavLink>
            ) : null}
          </nav>
          <div className="flex flex-col gap-2 pt-2">
            {user ? (
              <Button
                variant="secondary"
                icon={<LogOut className="size-4" aria-hidden="true" />}
                onClick={() => {
                  close();
                  void logout();
                }}
              >
                Sign out ({firstName})
              </Button>
            ) : (
              <>
                <Link to="/login" onClick={close} className={buttonClasses("secondary")}>
                  Sign in
                </Link>
                <Link to="/register" onClick={close} className={buttonClasses("primary")}>
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/Navbar.tsx
// ==========================================