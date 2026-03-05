"use client";

import Image from "next/image";
import { FileText } from "lucide-react";
import type { BrandDNA } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";

interface SidebarBrandDNAProps {
  brandDNA: BrandDNA;
  onUploadDocument: (index: number, fileName: string) => void;
}

export function SidebarBrandDNA({ brandDNA }: SidebarBrandDNAProps) {
  return (
    <div className="mx-3 rounded-lg border border-border bg-[#f2dacb]/20 p-3">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        Brand DNA
      </p>
      {brandDNA.configured ? (
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
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-gray-400" />
            <span className="text-sm text-muted-foreground">Not started</span>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#06264e] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#06264e]/90">
                <FileText className="h-3.5 w-3.5" />
                Build now
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
                  Build your Brand DNA
                </h2>
                <p className="mb-6 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  Talk to an AI coach that will help you figure out your brand DNA messaging, ideal audience, and so much more using Cass Valzacchi Human Design Framework
                </p>
                <button className="w-full rounded-lg bg-[#06264e] px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-[#06264e]/90">
                  Build the Brand DNA &mdash; $97
                </button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}
