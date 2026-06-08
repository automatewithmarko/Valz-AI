"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  Download,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import type { BrandDNARow, User } from "@/lib/types";
import { downloadBrandDNA } from "@/lib/brand-pdf";
import { createClient } from "@/lib/supabase/client";
import {
  createAndSelectBrandDNA,
  getBrandDNAs,
  getBrandDnaSlots,
  getPrimaryBrandDNA,
  selectBrandDNA,
  updateBrandDNA,
} from "@/lib/supabase/db";
import { useAuth } from "@/components/AuthProvider";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SidebarBrandDNAProps {
  user: User;
  onUploadDocument: (index: number, fileName: string) => void;
}

type KbDocument = {
  id: string;
  label: string;
  when_to_use: string | null;
  file_name: string | null;
  file_path: string | null;
  created_at: string;
};

const ACCEPTED_EXTENSIONS = [".txt", ".md", ".docx"];
const ACCEPTED_MIMES = [
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

function hasSupportedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// Render a status dot + label for a brand profile. Colour AND text so it
// reads without relying on hue alone (a11y: color-not-only).
function statusMeta(status: string): { label: string; dot: string; pulse: boolean } {
  if (status === "active") return { label: "Active", dot: "bg-green-500", pulse: true };
  if (status === "in_progress" || status === "inactive")
    return { label: "In progress", dot: "bg-yellow-500", pulse: true };
  return { label: "Not started", dot: "bg-gray-400", pulse: false };
}

export function SidebarBrandDNA({ user }: SidebarBrandDNAProps) {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Multi-brand state
  const [brands, setBrands] = useState<BrandDNARow[]>([]);
  const [slots, setSlots] = useState(0);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  // Rename
  const [renameTarget, setRenameTarget] = useState<BrandDNARow | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  const loadBrands = useCallback(async () => {
    const supabase = createClient();
    try {
      const [rows, slotCount] = await Promise.all([
        getBrandDNAs(supabase, user.id),
        getBrandDnaSlots(supabase, user.id),
      ]);
      setBrands(rows ?? []);
      setSlots(slotCount);
    } catch (err) {
      console.error("Failed to load brand profiles:", err);
    }
  }, [user.id]);

  useEffect(() => {
    void loadBrands();
  }, [loadBrands]);

  // The currently-selected profile is the single is_primary row. Fall back
  // to the first if (transiently) none is flagged.
  const selected = brands.find((b) => b.is_primary) ?? brands[0] ?? null;
  const selectedStatus = selected?.status ?? "not_configured";
  const selectedConfigured = selectedStatus === "active";
  const selectedName = selected?.brand_name?.trim() || "Untitled";
  // Each completed A$97 purchase grants one profile slot; brands.length is
  // how many are already in use.
  const hasFreeSlot = brands.length < slots;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const supabase = createClient();
      const dna = selected ?? (await getPrimaryBrandDNA(supabase, user.id));
      const content = dna?.blueprint_content || localStorage.getItem("brandDNAContent");
      if (content) {
        await downloadBrandDNA(content);
      }
    } finally {
      setDownloading(false);
    }
  };

  const handleBuildNow = () => {
    // First-ever profile: subscribers without the one-time Blueprint
    // purchase go to checkout; everyone else goes straight to the builder.
    if (!user.hasBrandDNAPurchase && !selectedConfigured) {
      router.push("/checkout/brand-dna");
    } else {
      router.push("/brand-building-dna-ai");
    }
  };

  // Switch the selected brand profile. The Back Pocket chat reads the
  // selected (primary) brand server-side on every message, so switching
  // here is enough for all downstream context to follow.
  const handleSwitch = async (id: string) => {
    if (id === selected?.id) {
      setSwitcherOpen(false);
      return;
    }
    setSwitchingId(id);
    try {
      const supabase = createClient();
      await selectBrandDNA(supabase, id);
      await Promise.all([loadBrands(), refreshUser()]);
      setSwitcherOpen(false);
    } catch (err) {
      console.error("Failed to switch brand profile:", err);
    } finally {
      setSwitchingId(null);
    }
  };

  // "Add another brand profile": if the user has a paid-but-unused slot,
  // create + select a fresh profile and go build it. Otherwise prompt them
  // to purchase another Aligned Income Blueprint.
  const handleAddProfile = async () => {
    setSwitcherOpen(false);
    if (!hasFreeSlot) {
      setPurchaseOpen(true);
      return;
    }
    setCreating(true);
    try {
      const supabase = createClient();
      await createAndSelectBrandDNA(supabase, user.id);
      await Promise.all([loadBrands(), refreshUser()]);
      router.push("/brand-building-dna-ai");
    } catch (err) {
      console.error("Failed to create brand profile:", err);
      setCreating(false);
    }
  };

  const openRename = (b: BrandDNARow) => {
    setSwitcherOpen(false);
    setRenameTarget(b);
    setRenameValue(b.brand_name?.trim() || "");
  };

  const handleRenameSave = async () => {
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (!name || name === renameTarget.brand_name) {
      setRenameTarget(null);
      return;
    }
    setRenameSaving(true);
    try {
      const supabase = createClient();
      await updateBrandDNA(supabase, renameTarget.id, { brand_name: name });
      await Promise.all([loadBrands(), refreshUser()]);
      setRenameTarget(null);
    } catch (err) {
      console.error("Failed to rename brand profile:", err);
    } finally {
      setRenameSaving(false);
    }
  };

  const handleCreateNew = async () => {
    if (!selected) return;
    setResetting(true);
    try {
      const supabase = createClient();

      // Scope the reset to the SELECTED brand only — never wipe the user's
      // other profiles.
      await supabase
        .from("brand_dna_chat_messages")
        .delete()
        .eq("brand_dna_id", selected.id);

      await supabase
        .from("brand_dnas")
        .update({
          status: "not_configured",
          blueprint_content: null,
          brand_name: "",
        })
        .eq("id", selected.id);

      localStorage.removeItem("brandDNAContent");

      await Promise.all([loadBrands(), refreshUser()]);
      setShowConfirm(false);
      setDialogOpen(false);
      router.push("/brand-building-dna-ai");
    } catch (err) {
      console.error("Failed to reset brand DNA:", err);
      setResetting(false);
    }
  };

  const sel = statusMeta(selectedStatus);

  return (
    <>
      <div className="mx-3 rounded-lg border border-border bg-[#f2dacb]/20 p-3">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          Aligned Income Blueprint
        </p>

        {/* Brand profile switcher — the card header is the trigger. Shows
            the selected profile (status dot + name) and opens a menu to
            switch or add another. */}
        {brands.length > 0 ? (
          <DropdownMenu open={switcherOpen} onOpenChange={setSwitcherOpen}>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Switch brand profile"
                className="mb-2 flex w-full items-center gap-2 rounded-lg border border-border bg-background/60 px-2.5 py-2 text-left transition-colors hover:border-[#c08967]/40 hover:bg-[#f2dacb]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06264e]/30"
              >
                <span className="relative flex h-2 w-2 shrink-0">
                  {sel.pulse && (
                    <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${sel.dot}`} />
                  )}
                  <span className={`relative inline-flex h-2 w-2 rounded-full ${sel.dot}`} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {selectedName}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">{sel.label}</span>
                </span>
                {switchingId ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[248px]">
              {brands.map((b) => {
                const m = statusMeta(b.status);
                const isSel = b.id === selected?.id;
                return (
                  <DropdownMenuItem
                    key={b.id}
                    onSelect={(e) => {
                      e.preventDefault();
                      void handleSwitch(b.id);
                    }}
                    className="group/item gap-2"
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${m.dot}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">
                        {b.brand_name?.trim() || "Untitled"}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">{m.label}</span>
                    </span>
                    {/* Rename — stop the pointer/click from triggering the row's
                        switch select, then open the rename dialog. */}
                    <button
                      type="button"
                      aria-label={`Rename ${b.brand_name?.trim() || "Untitled"}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        openRename(b);
                      }}
                      className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-colors hover:bg-[#06264e]/10 hover:text-[#06264e] focus-visible:opacity-100 group-hover/item:opacity-100"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    {isSel && <Check className="h-3.5 w-3.5 shrink-0 text-[#06264e]" />}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  void handleAddProfile();
                }}
                className="gap-2 text-[#06264e]"
              >
                {creating ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="text-sm font-medium">Add another brand profile</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {/* Action area — reflects the SELECTED profile's status. */}
        {selectedConfigured ? (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-[#c08967]/40 hover:bg-[#f2dacb]/30">
                <FileText className="h-3.5 w-3.5" />
                View Aligned Income Blueprint
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <div className="flex flex-col items-center px-4 py-6 text-center">
                <Image
                  src="/logo.png"
                  alt="Valzacchi.ai"
                  width={72}
                  height={72}
                  className="mb-5 h-auto w-auto"
                />
                <h2 className="mb-2 text-xl font-semibold text-foreground">
                  {selectedName}
                </h2>
                <p className="mb-6 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  Download this blueprint as a styled PDF, edit it, or start fresh with a new one.
                </p>
                <div className="flex w-full flex-col gap-2.5">
                  <button
                    onClick={handleDownload}
                    disabled={downloading}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#06264e] px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-[#06264e]/90 disabled:opacity-70"
                  >
                    {downloading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    {downloading ? "Generating PDF..." : "Download blueprint"}
                  </button>
                  <button
                    onClick={() => router.push("/brand-building-dna-ai?mode=edit")}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#e0d6d0] px-6 py-3 text-sm font-medium text-foreground transition-colors hover:border-[#c08967]/40 hover:bg-[#f2dacb]/30"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit blueprint
                  </button>
                  <button
                    onClick={() => setShowConfirm(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#e0d6d0] px-6 py-3 text-sm font-medium text-foreground transition-colors hover:border-[#c08967]/40 hover:bg-[#f2dacb]/30"
                  >
                    <Plus className="h-4 w-4" />
                    Rebuild this blueprint
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        ) : selectedStatus === "in_progress" || selectedStatus === "inactive" ? (
          <button
            onClick={() => router.push("/brand-building-dna-ai")}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#06264e] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#06264e]/90"
          >
            <FileText className="h-3.5 w-3.5" />
            Continue building
          </button>
        ) : (
          <button
            onClick={handleBuildNow}
            disabled={creating}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#06264e] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#06264e]/90 disabled:opacity-70"
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            Build now
          </button>
        )}
      </div>

      {/* Knowledge bases live on the sidebar separately from the blueprint
          card. They're a subscriber feature, not gated on the one-time
          Aligned Income Blueprint purchase, so we render this tile for any
          user who can see the sidebar. */}
      <KnowledgeBaseTile />

      {/* Confirmation dialog for creating new blueprint */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="sm:max-w-sm">
          <div className="flex flex-col items-center px-2 py-4 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
            <h2 className="mb-2 text-lg font-semibold text-foreground">
              Rebuild this blueprint?
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">
              This deletes <span className="font-medium text-foreground">{selectedName}</span>&rsquo;s
              blueprint and its chat history, then starts that profile from scratch. Your other brand
              profiles are not affected.
            </p>
            <div className="flex w-full flex-col gap-3">
              <button
                onClick={handleCreateNew}
                disabled={resetting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-500 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-70"
              >
                {resetting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {resetting ? "Deleting..." : "Yes, continue"}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                disabled={resetting}
                className="w-full rounded-lg border border-[#e0d6d0] px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-[#f2dacb]/30 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Purchase-required modal — shown when the user wants another brand
          profile but has no paid slot left. Each profile is its own A$97
          Aligned Income Blueprint. */}
      <Dialog open={purchaseOpen} onOpenChange={setPurchaseOpen}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center px-4 py-6 text-center">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#06264e]/[0.06]">
              <Sparkles className="h-6 w-6 text-[#06264e]" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-foreground">
              Add another brand profile
            </h2>
            <p className="mb-6 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Each brand gets its own Aligned Income Blueprint, a complete strategy built around that
              brand&rsquo;s story, audience, and Human Design. Unlock another profile for{" "}
              <span className="font-semibold text-foreground">A$97</span> one-time.
            </p>
            <div className="flex w-full flex-col gap-2.5">
              <button
                onClick={() => {
                  setPurchaseOpen(false);
                  router.push("/checkout/brand-dna?additional=1");
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#06264e] px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-[#06264e]/90"
              >
                <Sparkles className="h-4 w-4" />
                Unlock another profile · A$97
              </button>
              <button
                onClick={() => setPurchaseOpen(false)}
                className="w-full rounded-lg border border-[#e0d6d0] px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-[#f2dacb]/30"
              >
                Maybe later
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename a brand profile. */}
      <Dialog
        open={renameTarget !== null}
        onOpenChange={(o) => {
          if (!o && !renameSaving) setRenameTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <div className="px-1 py-1">
            <h2 className="mb-1 text-base font-semibold text-foreground">Rename brand profile</h2>
            <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
              Give this profile a name you&rsquo;ll recognise in the switcher.
            </p>
            <label htmlFor="brand-rename" className="mb-1 block text-[11px] font-medium text-foreground">
              Profile name
            </label>
            <input
              id="brand-rename"
              type="text"
              value={renameValue}
              autoFocus
              maxLength={60}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleRenameSave();
                }
              }}
              placeholder="e.g. The Return Edit"
              disabled={renameSaving}
              className="mb-4 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[#06264e] focus:outline-none disabled:opacity-60"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRenameTarget(null)}
                disabled={renameSaving}
                className="rounded-md border border-border px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-[#f2dacb]/30 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameSave}
                disabled={renameSaving || !renameValue.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-[#06264e] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#06264e]/90 disabled:opacity-60"
              >
                {renameSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {renameSaving ? "Saving…" : "Save name"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Compact knowledge-base tile that lives on the sidebar so users see their
// uploaded reference docs at a glance. Owns the docs list; the upload form
// is delegated to a focused dialog (KbUploadDialog) so the sidebar stays
// compact. Same API endpoints (/api/brand-dna-docs) as before — only the
// presentation has moved out of the blueprint dialog.
function KnowledgeBaseTile() {
  const [docs, setDocs] = useState<KbDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<KbDocument | null>(null);
  const [expanded, setExpanded] = useState(false);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/brand-dna-docs", { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load");
      const json = (await res.json()) as { documents: KbDocument[] };
      setDocs(json.documents);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  const visible = expanded ? docs : docs.slice(0, 3);
  const overflow = docs.length - visible.length;

  return (
    <>
      <div className="mx-3 mt-2 rounded-lg border border-border bg-[#f2dacb]/10 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Knowledge bases
          </p>
          {docs.length > 0 && (
            <span className="rounded-full bg-[#06264e]/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[#06264e]">
              {docs.length}
            </span>
          )}
        </div>

        {error && (
          <div className="mb-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[10px] leading-snug text-red-700">
            {error}
          </div>
        )}

        {loading && docs.length === 0 ? (
          <div className="flex items-center gap-1.5 py-1 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading…
          </div>
        ) : docs.length === 0 ? (
          <p className="mb-1 text-[11px] leading-snug text-muted-foreground">
            Add reference docs the AI should consult alongside your blueprint.
          </p>
        ) : (
          <>
            <ul className="space-y-1">
              {visible.map((doc) => (
                <li
                  key={doc.id}
                  className="group flex items-start gap-1.5 rounded-md border border-transparent px-1.5 py-1 transition-colors hover:border-[#e0d6d0] hover:bg-background"
                >
                  <FileText className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium leading-tight text-foreground">
                      {doc.label}
                    </p>
                    {doc.when_to_use && (
                      <p className="line-clamp-1 text-[10px] leading-tight text-muted-foreground">
                        {doc.when_to_use}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setEditingDoc(doc)}
                    aria-label={`Edit ${doc.label}`}
                    className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-all hover:bg-[#f2dacb]/50 hover:text-[#06264e] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06264e]/30 group-hover:opacity-100"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
            {overflow > 0 && !expanded && (
              <button
                onClick={() => setExpanded(true)}
                className="mt-1 px-1.5 text-[10px] font-medium text-[#06264e] hover:underline focus-visible:outline-none"
              >
                Show {overflow} more
              </button>
            )}
            {expanded && docs.length > 3 && (
              <button
                onClick={() => setExpanded(false)}
                className="mt-1 px-1.5 text-[10px] font-medium text-[#06264e] hover:underline focus-visible:outline-none"
              >
                Show less
              </button>
            )}
          </>
        )}

        <button
          onClick={() => setUploadOpen(true)}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-2 py-2 text-[11px] font-medium text-foreground transition-colors hover:border-[#c08967]/50 hover:bg-[#f2dacb]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06264e]/30"
        >
          <Plus className="h-3.5 w-3.5" />
          Add knowledge base
        </button>
      </div>

      <KbUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={(doc) => setDocs((prev) => [doc, ...prev])}
      />

      <KbEditDialog
        doc={editingDoc}
        onClose={() => setEditingDoc(null)}
        onUpdated={(updated) =>
          setDocs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
        }
        onDeleted={(id) => setDocs((prev) => prev.filter((d) => d.id !== id))}
      />
    </>
  );
}

// Focused upload form. Renders in a centered dialog so the user has room
// for the file drop zone + name + "when to use" hint without cramping the
// sidebar. Calls back with the created document so the sidebar tile can
// optimistically prepend it without a refetch.
function KbUploadDialog({
  open,
  onOpenChange,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: (doc: KbDocument) => void;
}) {
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [whenToUse, setWhenToUse] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setPendingFile(null);
      setLabel("");
      setWhenToUse("");
      setError(null);
    }
  }, [open]);

  const handleFile = (file: File) => {
    setError(null);
    if (!hasSupportedExtension(file.name)) {
      setError(`Unsupported file type. Use ${ACCEPTED_EXTENSIONS.join(", ")}.`);
      return;
    }
    setPendingFile(file);
    setLabel(file.name.replace(/\.[^.]+$/, ""));
    setWhenToUse("");
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleUpload = async () => {
    if (!pendingFile || !label.trim() || !whenToUse.trim()) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", pendingFile);
      form.append("label", label.trim());
      form.append("when_to_use", whenToUse.trim());
      const res = await fetch("/api/brand-dna-docs", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      onUploaded(json.document);
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <div className="px-1 py-1">
          <h2 className="mb-1 text-base font-semibold text-foreground">
            Add knowledge base
          </h2>
          <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
            Upload a .txt, .md, or .docx file (max 5 MB). The &quot;When should
            this be used&quot; hint tells the AI when to consult this doc.
          </p>

          {error && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          {pendingFile ? (
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="mb-3 flex items-center gap-2 text-xs text-foreground">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate font-medium">{pendingFile.name}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {(pendingFile.size / 1024).toFixed(1)} KB
                </span>
              </div>
              <label className="mb-1 block text-[11px] font-medium text-foreground">
                Name
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Launch playbook"
                disabled={uploading}
                className="mb-3 w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-[#06264e] focus:outline-none disabled:opacity-60"
              />
              <label className="mb-1 block text-[11px] font-medium text-foreground">
                When should this be used?
              </label>
              <textarea
                value={whenToUse}
                onChange={(e) => setWhenToUse(e.target.value)}
                placeholder="e.g. When the user asks about launching a new offer or building a launch funnel."
                disabled={uploading}
                rows={3}
                className="mb-3 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-[#06264e] focus:outline-none disabled:opacity-60"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleUpload}
                  disabled={uploading || !label.trim() || !whenToUse.trim()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-md bg-[#06264e] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#06264e]/90 disabled:opacity-60"
                >
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  {uploading ? "Uploading…" : "Add knowledge base"}
                </button>
                <button
                  onClick={() => {
                    setPendingFile(null);
                    setLabel("");
                    setWhenToUse("");
                  }}
                  disabled={uploading}
                  className="rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-[#f2dacb]/30 disabled:opacity-60"
                >
                  Replace
                </button>
              </div>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06264e]/30 ${
                dragOver
                  ? "border-[#06264e] bg-[#f2dacb]/30"
                  : "border-border bg-background hover:border-[#c08967]/50 hover:bg-[#f2dacb]/20"
              }`}
            >
              <Upload className="mb-1 h-5 w-5 text-muted-foreground" />
              <p className="text-xs font-medium text-foreground">
                Click or drop a file to upload
              </p>
              <p className="text-[10px] text-muted-foreground">
                {ACCEPTED_EXTENSIONS.join(", ")} · max 5 MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept={[...ACCEPTED_EXTENSIONS, ...ACCEPTED_MIMES].join(",")}
                className="hidden"
                onChange={handleFileInputChange}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Edit dialog for an existing knowledge base. Only when_to_use is mutable
// — that's the field that drives retrieval, so editing it is what users
// will reach for most. Label and file are locked (the user can delete +
// re-upload if they want to change those). Includes an in-dialog delete
// behind a confirmation step so the destructive action lives near the
// other doc actions instead of on the sidebar surface.
function KbEditDialog({
  doc,
  onClose,
  onUpdated,
  onDeleted,
}: {
  doc: KbDocument | null;
  onClose: () => void;
  onUpdated: (doc: KbDocument) => void;
  onDeleted: (id: string) => void;
}) {
  const [whenToUse, setWhenToUse] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset local state every time we open with a different doc so a
  // previous edit's draft / error doesn't leak into a fresh session.
  useEffect(() => {
    if (doc) {
      setWhenToUse(doc.when_to_use ?? "");
      setError(null);
      setConfirmDelete(false);
      setSaving(false);
      setDeleting(false);
    }
  }, [doc]);

  const open = doc !== null;
  const trimmed = whenToUse.trim();
  const unchanged = trimmed === (doc?.when_to_use ?? "").trim();

  const handleSave = async () => {
    if (!doc || !trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/brand-dna-docs/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ when_to_use: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      onUpdated(json.document);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!doc) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/brand-dna-docs/${doc.id}`, {
        method: "DELETE",
      });
      if (!res.ok)
        throw new Error((await res.json()).error ?? "Delete failed");
      onDeleted(doc.id);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setDeleting(false);
    }
  };

  const busy = saving || deleting;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <div className="px-1 py-1">
          <h2 className="mb-1 text-base font-semibold text-foreground">
            Edit knowledge base
          </h2>
          <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
            Update when this doc should be used. To swap the file itself,
            delete it below and upload a new one.
          </p>

          {/* Locked file/label preview. min-w-0 lets the truncate take
              effect inside the flex parent — without it the long span
              forces the row (and the dialog) wider than max-w-md. */}
          <div className="mb-4 flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs">
            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">
                {doc?.label}
              </p>
              {doc?.file_name && doc.file_name !== doc.label && (
                <p className="truncate text-[10px] text-muted-foreground">
                  {doc.file_name}
                </p>
              )}
            </div>
          </div>

          {error && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <label className="mb-1 block text-[11px] font-medium text-foreground">
            When should this be used?
          </label>
          <textarea
            value={whenToUse}
            onChange={(e) => setWhenToUse(e.target.value)}
            placeholder="e.g. When the user asks about launching a new offer or building a launch funnel."
            disabled={busy}
            rows={4}
            className="mb-4 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-[#06264e] focus:outline-none disabled:opacity-60"
          />

          {/* Cancel left (secondary), Save right (primary) — primary on
              the right is the standard pattern and avoids needing flex-1
              that previously pushed Cancel off the dialog. */}
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              disabled={busy}
              className="rounded-md border border-border px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-[#f2dacb]/30 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={busy || !trimmed || unchanged}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-[#06264e] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#06264e]/90 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>

          {/* Danger zone: two-step delete so an accidental click doesn't
              destroy the doc. The first click reveals a confirmation
              line; the second click actually deletes. */}
          <div className="mt-5 border-t border-border pt-4">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-red-600 transition-colors hover:text-red-700 disabled:opacity-60"
              >
                <Trash2 className="h-3 w-3" />
                Delete knowledge base
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] leading-snug text-foreground">
                  Delete <span className="font-medium">{doc?.label}</span>?
                  This removes the file and the AI will no longer reference it.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={busy}
                    className="flex items-center gap-1.5 rounded-md bg-red-500 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-60"
                  >
                    {deleting ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    {deleting ? "Deleting…" : "Yes, delete"}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    disabled={busy}
                    className="rounded-md border border-border px-3 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-[#f2dacb]/30 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
