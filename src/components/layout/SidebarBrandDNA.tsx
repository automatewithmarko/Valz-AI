"use client";

import { useRef } from "react";
import { FileText, Upload, CheckCircle } from "lucide-react";
import type { BrandDNA } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

interface SidebarBrandDNAProps {
  brandDNA: BrandDNA;
  onUploadDocument: (index: number, fileName: string) => void;
}

function UploadSlot({
  label,
  fileName,
  onUpload,
}: {
  label: string;
  fileName: string | null;
  onUpload: (fileName: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#e0d6d0] bg-white/40 p-4 text-center transition-all hover:border-[#c08967]/60 hover:bg-[#f2dacb]/20"
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file.name);
        }}
      />
      {fileName ? (
        <>
          <CheckCircle className="h-6 w-6 text-green-500" />
          <span className="text-xs font-medium text-foreground">{label}</span>
          <span className="max-w-full truncate text-[10px] text-muted-foreground">
            {fileName}
          </span>
        </>
      ) : (
        <>
          <Upload className="h-6 w-6 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">{label}</span>
          <span className="text-[10px] text-muted-foreground">Upload PDF</span>
        </>
      )}
    </button>
  );
}

export function SidebarBrandDNA({ brandDNA, onUploadDocument }: SidebarBrandDNAProps) {
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
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Build your Brand DNA</DialogTitle>
                <DialogDescription>
                  Upload the following documents to build your brand profile. Each slot accepts a PDF file.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {brandDNA.documents.map((doc, i) => (
                  <UploadSlot
                    key={doc.label}
                    label={doc.label}
                    fileName={doc.fileName}
                    onUpload={(fileName) => onUploadDocument(i, fileName)}
                  />
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}
