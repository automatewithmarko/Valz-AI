export interface User {
  id: string;
  name: string;
  email: string;
  credits: number;
  maxCredits: number;
  brandDNA: BrandDNA;
}

export interface BrandDNADocument {
  label: string;
  fileName: string | null;
}

export interface BrandDNA {
  configured: boolean;
  brandName: string;
  status: "active" | "inactive" | "not_configured";
  documents: BrandDNADocument[];
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}
