"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Download, FileText, Loader2, Pencil } from "lucide-react";
import type { User } from "@/lib/types";
import { downloadBrandDNA } from "@/lib/brand-pdf";
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
  const [downloading, setDownloading] = useState(false);

  const { brandDNA } = user;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const content = localStorage.getItem("brandDNAContent");
      if (content) {
        await downloadBrandDNA(content);
      }
    } finally {
      setDownloading(false);
    }
  };

  const handleBuildNow = () => {
    // If user hasn't purchased the Brand DNA plan, show them the program selection page
    if (!user.hasBrandDNAPurchase && !brandDNA.configured) {
      router.push("/choose-program");
    } else {
      router.push("/brand-building-dna-ai");
    }
  };

  return (
    <div className="mx-3 rounded-lg border border-border bg-[#f2dacb]/20 p-3">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        Brand DNA
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
                View Brand DNA
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <div className="flex flex-col items-center px-4 py-6 text-center">
                <Image
                  src="/logo.png"
                  alt="Valz.AI"
                  width={80}
                  height={80}
                  className="mb-6 h-auto w-auto"
                />
                <h2 className="mb-3 text-xl font-semibold text-foreground">
                  Your Brand DNA
                </h2>
                <p className="mb-6 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  Your Brand DNA Blueprint is ready. Download it as a styled PDF or edit it by going through the process again.
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
                    {downloading ? "Generating PDF..." : "Download Brand DNA"}
                  </button>
                  <button
                    onClick={() => router.push("/brand-building-dna-ai?mode=edit")}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#e0d6d0] px-6 py-3 text-sm font-medium text-foreground transition-colors hover:border-[#c08967]/40 hover:bg-[#f2dacb]/30"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit Brand DNA
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
  );
}
