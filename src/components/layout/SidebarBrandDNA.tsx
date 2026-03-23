"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AlertTriangle, Download, FileText, Loader2, Pencil, Plus } from "lucide-react";
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

export function SidebarBrandDNA({ user }: SidebarBrandDNAProps) {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

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

      // Delete all chat messages
      await supabase
        .from("brand_dna_chat_messages")
        .delete()
        .eq("user_id", user.id);

      // Reset the brand DNA record
      await supabase
        .from("brand_dnas")
        .update({
          status: "not_configured",
          blueprint_content: null,
          brand_name: "",
        })
        .eq("user_id", user.id);

      // Clear localStorage
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
            <Dialog>
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
                    width={80}
                    height={80}
                    className="mb-6 h-auto w-auto"
                  />
                  <h2 className="mb-3 text-xl font-semibold text-foreground">
                    Your Aligned Income Blueprint
                  </h2>
                  <p className="mb-6 max-w-sm text-sm leading-relaxed text-muted-foreground">
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
              </DialogContent>
            </Dialog>
          </div>
        ) : brandDNA.status === "inactive" ? (
          /* In Progress — user has started but not finished */
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
          /* Not started */
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
