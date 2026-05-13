"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Download,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import type { User } from "@/lib/types";
import { downloadBrandDNA } from "@/lib/brand-pdf";
import { createClient } from "@/lib/supabase/client";
import { getPrimaryBrandDNA } from "@/lib/supabase/db";
import { useAuth } from "@/components/AuthProvider";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";

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

export function SidebarBrandDNA({ user }: SidebarBrandDNAProps) {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { brandDNA } = user;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const supabase = createClient();
      const dna = await getPrimaryBrandDNA(supabase, user.id);
      const content = dna?.blueprint_content || localStorage.getItem("brandDNAContent");
      if (content) {
        await downloadBrandDNA(content);
      }
    } finally {
      setDownloading(false);
    }
  };

  const handleBuildNow = () => {
    if (!user.hasBrandDNAPurchase && !brandDNA.configured) {
      router.push("/choose-program");
    } else {
      router.push("/brand-building-dna-ai");
    }
  };

  const handleCreateNew = async () => {
    setResetting(true);
    try {
      const supabase = createClient();

      await supabase
        .from("brand_dna_chat_messages")
        .delete()
        .eq("user_id", user.id);

      await supabase
        .from("brand_dnas")
        .update({
          status: "not_configured",
          blueprint_content: null,
          brand_name: "",
        })
        .eq("user_id", user.id);

      localStorage.removeItem("brandDNAContent");

      await refreshUser();
      setShowConfirm(false);
      router.push("/brand-building-dna-ai");
    } catch (err) {
      console.error("Failed to reset brand DNA:", err);
      setResetting(false);
    }
  };

  return (
    <>
      <div className="mx-3 rounded-lg border border-border bg-[#f2dacb]/20 p-3">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          Aligned Income Blueprint
        </p>
        {brandDNA.configured ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              <span className="text-sm text-foreground">Active</span>
              <span className="ml-auto truncate text-xs text-muted-foreground">
                {brandDNA.brandName}
              </span>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-[#c08967]/40 hover:bg-[#f2dacb]/30">
                  <FileText className="h-3.5 w-3.5" />
                  View Aligned Income Blueprint
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
                <div className="flex flex-col px-1 py-2">
                  <div className="flex flex-col items-center px-4 py-4 text-center">
                    <Image
                      src="/logo.png"
                      alt="Valzacchi.ai"
                      width={64}
                      height={64}
                      className="mb-4 h-auto w-auto"
                    />
                    <h2 className="mb-2 text-xl font-semibold text-foreground">
                      Your Aligned Income Blueprint
                    </h2>
                    <p className="mb-5 max-w-sm text-sm leading-relaxed text-muted-foreground">
                      Your Aligned Income Blueprint is ready. Download it as a styled PDF, edit it, or start fresh with a new one.
                    </p>
                    <div className="flex w-full flex-col gap-3">
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
                        {downloading ? "Generating PDF..." : "Download Aligned Income Blueprint"}
                      </button>
                      <button
                        onClick={() => router.push("/brand-building-dna-ai?mode=edit")}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#e0d6d0] px-6 py-3 text-sm font-medium text-foreground transition-colors hover:border-[#c08967]/40 hover:bg-[#f2dacb]/30"
                      >
                        <Pencil className="h-4 w-4" />
                        Edit Aligned Income Blueprint
                      </button>
                      <button
                        onClick={() => setShowConfirm(true)}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#e0d6d0] px-6 py-3 text-sm font-medium text-foreground transition-colors hover:border-[#c08967]/40 hover:bg-[#f2dacb]/30"
                      >
                        <Plus className="h-4 w-4" />
                        Create New Aligned Income Blueprint
                      </button>
                    </div>
                  </div>

                  <KnowledgeBaseSection open={dialogOpen} />
                </div>
              </DialogContent>
            </Dialog>
          </div>
        ) : brandDNA.status === "inactive" ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-yellow-500" />
              </span>
              <span className="text-sm text-muted-foreground">In Progress</span>
            </div>
            <button
              onClick={() => router.push("/brand-building-dna-ai")}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#06264e] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#06264e]/90"
            >
              <FileText className="h-3.5 w-3.5" />
              Continue Building
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-gray-400" />
              <span className="text-sm text-muted-foreground">Not started</span>
            </div>
            <button
              onClick={handleBuildNow}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#06264e] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#06264e]/90"
            >
              <FileText className="h-3.5 w-3.5" />
              Build now
            </button>
          </div>
        )}
      </div>

      {/* Confirmation dialog for creating new blueprint */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="sm:max-w-sm">
          <div className="flex flex-col items-center px-2 py-4 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
            <h2 className="mb-2 text-lg font-semibold text-foreground">
              Are you sure you want to start?
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">
              This will delete your old income blueprint and entire chat history. You will start the building process from scratch.
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
    </>
  );
}

function KnowledgeBaseSection({ open }: { open: boolean }) {
  const [docs, setDocs] = useState<KbDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [whenToUse, setWhenToUse] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (open) {
      void loadDocs();
    } else {
      setPendingFile(null);
      setLabel("");
      setWhenToUse("");
      setError(null);
    }
  }, [open, loadDocs]);

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
      setDocs((prev) => [json.document, ...prev]);
      setPendingFile(null);
      setLabel("");
      setWhenToUse("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/brand-dna-docs/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Delete failed");
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mt-4 border-t border-border px-4 pt-5">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Knowledge bases</h3>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {docs.length}
        </span>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
        Upload extra reference docs (.txt, .md, .docx). The chat AI will use them alongside your blueprint based on the &quot;When should this be used&quot; description.
      </p>

      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {docs.length > 0 && (
        <ul className="mb-4 space-y-2">
          {docs.map((doc) => (
            <li
              key={doc.id}
              className="rounded-lg border border-border bg-background px-3 py-2"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">
                    {doc.label}
                  </p>
                  {doc.when_to_use && (
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                      {doc.when_to_use}
                    </p>
                  )}
                  {doc.file_name && (
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground/70">
                      {doc.file_name}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(doc.id)}
                  disabled={deletingId === doc.id}
                  className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  aria-label="Delete knowledge base"
                >
                  {deletingId === doc.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {loading && docs.length === 0 && (
        <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading...
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
              {uploading ? "Uploading..." : "Add knowledge base"}
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
              Cancel
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
          className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
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
  );
}
