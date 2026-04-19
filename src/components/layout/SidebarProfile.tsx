"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { ChevronDown, Settings, CreditCard, Sparkles, LogOut, Check, Minus, Plus, Camera, Loader2, Eye, EyeOff } from "lucide-react";
import type { User } from "@/lib/types";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const plans = [
  {
    name: "Starter",
    price: "$15",
    period: "/month",
    description: "Perfect for getting started with brand insights",
    monthlyCredits: 1500,
    features: [
      "1,500 AI credits per month (~1.5M characters)",
      "Personalized, context-aware brand analysis",
      "1 Brand DNA profile",
      "Email support",
    ],
    cta: "Get Started",
    highlighted: false,
  },
  {
    name: "Growth",
    price: "$25",
    period: "/month",
    description: "For brands ready to go deeper",
    monthlyCredits: 2500,
    features: [
      "2,500 AI credits per month (~2.5M characters)",
      "Longer, more detailed responses",
      "Voice-to-text input for hands-free use",
      "3 Brand DNA profiles",
      "Priority support",
    ],
    cta: "Upgrade to Growth",
    highlighted: true,
  },
  {
    name: "Pro",
    price: "$35",
    period: "/month",
    description: "Built for serious brand builders",
    monthlyCredits: 3500,
    features: [
      "3,500 AI credits per month (~3.5M characters)",
      "Fastest response times",
      "Unlimited Brand DNA profiles",
      "Manage multiple brands in one account",
      "Dedicated priority support",
    ],
    cta: "Go Pro",
    highlighted: false,
  },
];

const CREDIT_PRICE = 0.10;
const CREDIT_STEP = 50;
const MIN_CREDITS = 50;
const MAX_CREDITS = 5000;

interface SidebarProfileProps {
  user: User;
}

export function SidebarProfile({ user }: SidebarProfileProps) {
  const { signOut, refreshUser } = useAuth();
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [creditAmount, setCreditAmount] = useState(100);

  // Settings form state
  const [editName, setEditName] = useState(user.name);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const totalPrice = (creditAmount * CREDIT_PRICE).toFixed(2);

  const handleOpenSettings = useCallback(() => {
    setEditName(user.name);
    setNewPassword("");
    setShowPassword(false);
    setSettingsMessage(null);
    setSettingsOpen(true);
  }, [user.name]);

  const handleSaveName = useCallback(async () => {
    if (!editName.trim() || editName.trim() === user.name) return;
    setSavingName(true);
    setSettingsMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: editName.trim() })
        .eq("id", user.id);
      if (error) throw error;
      await refreshUser();
      setSettingsMessage({ type: "success", text: "Name updated." });
    } catch {
      setSettingsMessage({ type: "error", text: "Failed to update name." });
    } finally {
      setSavingName(false);
    }
  }, [editName, user.name, user.id, refreshUser]);

  const handleChangePassword = useCallback(async () => {
    if (newPassword.length < 6) {
      setSettingsMessage({ type: "error", text: "Password must be at least 6 characters." });
      return;
    }
    setSavingPassword(true);
    setSettingsMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setSettingsMessage({ type: "success", text: "Password changed." });
    } catch {
      setSettingsMessage({ type: "error", text: "Failed to change password." });
    } finally {
      setSavingPassword(false);
    }
  }, [newPassword]);

  const handleAvatarUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type and size
    if (!file.type.startsWith("image/")) {
      setSettingsMessage({ type: "error", text: "Please select an image file." });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setSettingsMessage({ type: "error", text: "Image must be under 2MB." });
      return;
    }

    setUploadingAvatar(true);
    setSettingsMessage(null);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "png";
      const filePath = `${user.id}/avatar.${ext}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      // Add cache-buster to force refresh
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      // Update profile
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.id);
      if (profileError) throw profileError;

      await refreshUser();
      setSettingsMessage({ type: "success", text: "Photo updated." });
    } catch {
      setSettingsMessage({ type: "error", text: "Failed to upload photo." });
    } finally {
      setUploadingAvatar(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [user.id, refreshUser]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[#f2dacb]/30">
            {user.avatarUrl ? (
              <Image
                src={user.avatarUrl}
                alt={user.name}
                width={32}
                height={32}
                className="h-8 w-8 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#06264e] text-xs font-semibold text-white">
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-semibold text-foreground">
                {user.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={8} className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={handleOpenSettings}>
              <Settings className="h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setSubscriptionOpen(true)}>
              <CreditCard className="h-4 w-4" />
              Subscription
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setCreditsOpen(true)}>
              <Sparkles className="h-4 w-4" />
              Buy more credits
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => signOut()}>
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Settings modal */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>
              Update your profile and account settings.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-6 py-2">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                {user.avatarUrl ? (
                  <Image
                    src={user.avatarUrl}
                    alt={user.name}
                    width={80}
                    height={80}
                    className="h-20 w-20 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#06264e] text-xl font-semibold text-white">
                    {initials}
                  </div>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[#06264e] text-white transition-colors hover:bg-[#06264e]/80 disabled:opacity-50"
                >
                  {uploadingAvatar ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Camera className="h-3.5 w-3.5" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
              </div>
            </div>

            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 rounded-lg border border-[#e0d6d0] bg-white px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-[#c08967]/50"
                />
                <button
                  onClick={handleSaveName}
                  disabled={savingName || !editName.trim() || editName.trim() === user.name}
                  className="rounded-lg bg-[#06264e] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#06264e]/90 disabled:opacity-50"
                >
                  {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </button>
              </div>
            </div>

            {/* Email (read-only) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <input
                type="email"
                value={user.email}
                readOnly
                className="rounded-lg border border-[#e0d6d0] bg-[#f9f7f5] px-3 py-2 text-sm text-muted-foreground outline-none"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Change password</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password"
                    className="w-full rounded-lg border border-[#e0d6d0] bg-white px-3 py-2 pr-10 text-sm text-foreground outline-none transition-colors focus:border-[#c08967]/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <button
                  onClick={handleChangePassword}
                  disabled={savingPassword || !newPassword}
                  className="rounded-lg bg-[#06264e] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#06264e]/90 disabled:opacity-50"
                >
                  {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : "Change"}
                </button>
              </div>
            </div>

            {/* Status message */}
            {settingsMessage && (
              <p className={`text-center text-sm ${settingsMessage.type === "success" ? "text-green-600" : "text-red-500"}`}>
                {settingsMessage.text}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Subscription modal */}
      <Dialog open={subscriptionOpen} onOpenChange={setSubscriptionOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Choose your plan</DialogTitle>
            <DialogDescription>
              Select the plan that best fits your brand valuation needs.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {plans.map((plan, idx) => {
              const currentPlanIdx = user.planName
                ? plans.findIndex((p) => p.name.toLowerCase() === user.planName!.toLowerCase())
                : -1;
              const isCurrent = currentPlanIdx >= 0 && idx === currentPlanIdx;
              const isUpgrade = currentPlanIdx >= 0 && idx > currentPlanIdx;
              const isDowngrade = currentPlanIdx >= 0 && idx < currentPlanIdx;

              let ctaText = plan.cta;
              if (isCurrent) ctaText = "Current Plan";
              else if (isUpgrade) ctaText = "Upgrade";
              else if (isDowngrade) ctaText = "Downgrade";

              return (
                <div
                  key={plan.name}
                  className={`relative flex flex-col rounded-xl border p-5 transition-all ${
                    isCurrent
                      ? "border-[#06264e] bg-[#06264e]/[0.03] shadow-lg shadow-[#06264e]/10 ring-2 ring-[#06264e]/20"
                      : plan.highlighted && !user.planName
                        ? "border-[#06264e] bg-[#06264e]/[0.03] shadow-lg shadow-[#06264e]/10"
                        : "border-[#e0d6d0] bg-white/40"
                  }`}
                >
                  {isCurrent ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#06264e] px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                      Current Plan
                    </span>
                  ) : plan.highlighted && !user.planName ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#06264e] px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                      Most Popular
                    </span>
                  ) : null}
                  <h3 className="text-sm font-semibold text-foreground">{plan.name}</h3>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-foreground">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">{plan.period}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{plan.description}</p>
                  <div className="mt-3 rounded-lg border border-[#06264e]/15 bg-[#06264e]/[0.04] px-3 py-2">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-lg font-bold text-[#06264e] tabular-nums">
                        {plan.monthlyCredits.toLocaleString()}
                      </span>
                      <span className="text-[11px] font-medium uppercase tracking-wider text-[#06264e]/70">
                        credits / mo
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      ~{(plan.monthlyCredits * 1000).toLocaleString()} characters of AI chat
                    </p>
                  </div>
                  <ul className="mt-4 flex-1 space-y-2">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-xs text-foreground">
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-green-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <button
                    disabled={isCurrent}
                    className={`mt-5 w-full rounded-lg py-2 text-sm font-medium transition-all ${
                      isCurrent
                        ? "cursor-default border border-[#06264e]/30 bg-[#06264e]/5 text-[#06264e] opacity-80"
                        : isUpgrade || (plan.highlighted && !user.planName)
                          ? "bg-[#06264e] text-white hover:bg-[#06264e]/90"
                          : "border border-[#e0d6d0] text-foreground hover:border-[#c08967]/40 hover:bg-[#f2dacb]/30"
                    }`}
                  >
                    {ctaText}
                  </button>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Buy credits modal */}
      <Dialog open={creditsOpen} onOpenChange={(open) => { setCreditsOpen(open); if (!open) setCreditAmount(100); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Buy credits</DialogTitle>
            <DialogDescription>
              Select the number of credits you&apos;d like to purchase.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-6 py-4">
            {/* Counter */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => setCreditAmount((prev) => Math.max(MIN_CREDITS, prev - CREDIT_STEP))}
                disabled={creditAmount <= MIN_CREDITS}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e0d6d0] text-foreground transition-colors hover:bg-[#f2dacb]/30 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Minus className="h-4 w-4" />
              </button>
              <div className="flex w-28 flex-col items-center">
                <span className="text-4xl font-bold tabular-nums text-foreground">
                  {creditAmount}
                </span>
                <span className="text-xs text-muted-foreground">credits</span>
              </div>
              <button
                onClick={() => setCreditAmount((prev) => Math.min(MAX_CREDITS, prev + CREDIT_STEP))}
                disabled={creditAmount >= MAX_CREDITS}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e0d6d0] text-foreground transition-colors hover:bg-[#f2dacb]/30 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {/* Price */}
            <p className="text-sm text-muted-foreground">
              Total: <span className="font-semibold text-foreground">${totalPrice}</span>
            </p>
            {/* Purchase button */}
            <button className="w-full rounded-lg bg-[#06264e] py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#06264e]/90">
              Purchase Credits
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
