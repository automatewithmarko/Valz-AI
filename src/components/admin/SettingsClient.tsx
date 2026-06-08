"use client";

import { useState } from "react";
import {
  Check,
  Loader2,
  Mail,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react";
import type { AdminListRow } from "@/lib/admin/types";
import { formatDate } from "@/lib/admin/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Msg = { type: "success" | "error"; text: string } | null;

function Alert({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p
      role={msg.type === "error" ? "alert" : "status"}
      className={
        msg.type === "error"
          ? "rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          : "flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400"
      }
    >
      {msg.type === "success" && <Check className="size-4" />}
      {msg.text}
    </p>
  );
}

export function SettingsClient({
  currentAdminId,
  initialAdmins,
}: {
  currentAdminId: string;
  initialAdmins: AdminListRow[];
}) {
  const [admins, setAdmins] = useState(initialAdmins);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [adminMsg, setAdminMsg] = useState<Msg>(null);
  const [toRemove, setToRemove] = useState<AdminListRow | null>(null);
  const [removing, setRemoving] = useState(false);

  async function addAdmin(e: React.FormEvent) {
    e.preventDefault();
    setAdminMsg(null);
    setAdding(true);
    try {
      const res = await fetch("/api/admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newAdminEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAdminMsg({ type: "error", text: data.error ?? "Couldn't add admin." });
      } else {
        setAdmins((prev) => [...prev, data.admin]);
        setNewAdminEmail("");
        setAdminMsg({
          type: "success",
          text: `${data.admin.email} can now access the admin panel.`,
        });
      }
    } catch {
      setAdminMsg({ type: "error", text: "Network error. Please try again." });
    } finally {
      setAdding(false);
    }
  }

  async function confirmRemove() {
    if (!toRemove) return;
    setRemoving(true);
    setAdminMsg(null);
    try {
      const res = await fetch(`/api/admin/admins?id=${toRemove.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setAdminMsg({ type: "error", text: data.error ?? "Couldn't remove admin." });
      } else {
        setAdmins((prev) => prev.filter((a) => a.id !== toRemove.id));
        setAdminMsg({ type: "success", text: `${toRemove.email} removed.` });
      }
    } catch {
      setAdminMsg({ type: "error", text: "Network error. Please try again." });
    } finally {
      setRemoving(false);
      setToRemove(null);
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4.5 text-[#a96f47] dark:text-[#d6a07c]" />
            Admin Accounts
          </CardTitle>
          <CardDescription>
            Admins sign in to the app with their own account and get an{" "}
            <span className="font-medium text-foreground">Admin Panel</span> button
            in the sidebar. Add one by email; the primary admin can&apos;t be
            removed.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {/* List */}
          <ul className="divide-y divide-border rounded-lg border border-border">
            {admins.map((a) => {
              const isSelf = a.id === currentAdminId;
              const removable = !a.is_super && !isSelf;
              return (
                <li key={a.id} className="flex items-center gap-3 px-3.5 py-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#06264e]/10 text-sm font-semibold text-[#06264e] dark:bg-[#87a8d3]/15 dark:text-[#9fc0e8]">
                    {a.email.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-foreground">
                        {a.email}
                      </span>
                      {a.is_super && (
                        <Badge className="bg-[#06264e] text-white dark:bg-[#c08967] dark:text-[#1a1510]">
                          Primary
                        </Badge>
                      )}
                      {isSelf && (
                        <Badge variant="outline" className="text-muted-foreground">
                          You
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Added {formatDate(a.created_at)}
                    </p>
                  </div>
                  <button
                    onClick={() => setToRemove(a)}
                    disabled={!removable}
                    title={
                      a.is_super
                        ? "The primary admin can't be removed"
                        : isSelf
                          ? "You can't remove your own access"
                          : "Remove admin"
                    }
                    className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors enabled:cursor-pointer enabled:hover:bg-destructive/10 enabled:hover:text-destructive disabled:opacity-30"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Add admin */}
          <form
            onSubmit={addAdmin}
            className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4"
          >
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <UserPlus className="size-4" /> Invite a new admin
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-email" className="text-xs">
                Email address
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="add-email"
                    type="email"
                    placeholder="teammate@example.com"
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    required
                    className="pl-9"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={adding}
                  className="bg-[#06264e] text-white hover:bg-[#06264e]/90 sm:w-auto dark:bg-[#c08967] dark:text-[#1a1510]"
                >
                  {adding ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <UserPlus className="size-4" />
                  )}
                  Add admin
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              They&apos;ll see the Admin Panel button the next time they sign in
              with this email. No password needed — they use their own login.
            </p>

            <Alert msg={adminMsg} />
          </form>
        </CardContent>
      </Card>

      {/* Remove confirmation */}
      <Dialog open={!!toRemove} onOpenChange={(o) => !o && setToRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove admin?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{toRemove?.email}</span>{" "}
              will lose access to the admin panel immediately. This can&apos;t be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setToRemove(null)}
              disabled={removing}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmRemove} disabled={removing}>
              {removing && <Loader2 className="size-4 animate-spin" />}
              Remove admin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
