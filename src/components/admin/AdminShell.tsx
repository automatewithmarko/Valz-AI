"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  LifeBuoy,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/tickets", label: "Support Tickets", icon: LifeBuoy },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
}

function pageTitle(pathname: string): string {
  const match = [...NAV]
    .sort((a, b) => b.href.length - a.href.length)
    .find((n) => isActive(pathname, n.href, n.exact));
  return match?.label ?? "Admin";
}

function SidebarContent({
  email,
  isSuper,
  pathname,
  loggingOut,
  onLogout,
  onNavigate,
}: {
  email: string;
  isSuper: boolean;
  pathname: string;
  loggingOut: boolean;
  onLogout: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
        <Image src="/logo.png" alt="Valzacchi" width={32} height={32} className="rounded-md" />
        <div className="leading-tight">
          <p className="text-sm font-semibold text-foreground">Valzacchi</p>
          <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-[#a96f47] dark:text-[#d6a07c]">
            <ShieldCheck className="size-3" /> Admin
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-[#06264e] text-white shadow-sm dark:bg-[#c08967] dark:text-[#1a1510]"
                  : "text-foreground/70 hover:bg-[#f2dacb]/40 hover:text-foreground dark:hover:bg-sidebar-accent"
              )}
            >
              <item.icon className="size-4.5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3">
        <Link
          href="/"
          onClick={onNavigate}
          className="mb-1 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-[#f2dacb]/40 hover:text-foreground dark:hover:bg-sidebar-accent"
        >
          <ExternalLink className="size-3.5" /> View main app
        </Link>
        <div className="flex items-center gap-2 rounded-lg px-3 py-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#06264e] text-xs font-semibold text-white dark:bg-[#c08967] dark:text-[#1a1510]">
            {email.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">{email}</p>
            <p className="text-[11px] text-muted-foreground">
              {isSuper ? "Primary admin" : "Admin"}
            </p>
          </div>
          <button
            onClick={onLogout}
            disabled={loggingOut}
            aria-label="Sign out"
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminShell({
  email,
  isSuper,
  children,
}: {
  email: string;
  isSuper: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <div className="min-h-dvh bg-background">
      {/* ── Desktop layout ── */}
      <div className="lg:grid lg:h-dvh lg:grid-cols-[260px_1fr]">
        <aside className="hidden border-r border-sidebar-border bg-sidebar lg:block">
          <SidebarContent
            email={email}
            isSuper={isSuper}
            pathname={pathname}
            loggingOut={loggingOut}
            onLogout={handleLogout}
          />
        </aside>

        <div className="flex min-w-0 flex-col lg:h-dvh lg:overflow-hidden">
          {/* Top bar */}
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-sm lg:px-6">
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              className="flex size-9 cursor-pointer items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted lg:hidden"
            >
              <Menu className="size-5" />
            </button>
            <h1 className="text-base font-semibold text-foreground">{pageTitle(pathname)}</h1>
            <div className="ml-auto hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 sm:flex">
              <div className="size-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-medium text-muted-foreground">{email}</span>
            </div>
          </header>

          <main className="flex-1 lg:overflow-y-auto">
            <div className="mx-auto w-full max-w-7xl p-4 sm:p-6">{children}</div>
          </main>
        </div>
      </div>

      {/* ── Mobile drawer ── */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/50"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
              className="fixed inset-y-0 left-0 z-50 w-[270px] border-r border-sidebar-border bg-sidebar"
            >
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="absolute right-3 top-4 flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
              >
                <X className="size-4" />
              </button>
              <SidebarContent
                email={email}
                isSuper={isSuper}
                pathname={pathname}
                loggingOut={loggingOut}
                onLogout={handleLogout}
                onNavigate={() => setMobileOpen(false)}
              />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
