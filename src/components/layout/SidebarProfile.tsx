"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronDown, Settings, CreditCard, Sparkles, LogOut, Check, Minus, Plus, Camera, Loader2, Eye, EyeOff } from "lucide-react";
import type { Plan, User } from "@/lib/types";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { getPlans } from "@/lib/supabase/db";
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

// CTA + highlight metadata mirrors the sign-up onboarding (PricingScreen.tsx)
// so the in-app subscription modal stays in sync with what new users see.
// Plan name/price/credits/features all come from the `plans` table.
const planMeta: Record<string, { cta: string; highlighted: boolean }> = {
  starter: { cta: "Get Started", highlighted: false },
  growth: { cta: "Upgrade to Growth", highlighted: true },
  pro: { cta: "Go Pro", highlighted: false },
};

const CREDIT_PRICE = 0.10;
const CREDIT_STEP = 50;
const MIN_CREDITS = 50;
const MAX_CREDITS = 5000;

interface SidebarProfileProps {
  user: User;
}

export function SidebarProfile({ user }: SidebarProfileProps) {
  const router = useRouter();
  const { signOut, refreshUser } = useAuth();
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [creditAmount, setCreditAmount] = useState(100);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);

  // Fetch plans the first time the subscription modal opens so the data
  // matches what new users see on the sign-up onboarding screen.
  useEffect(() => {
    if (!subscriptionOpen || plans.length > 0 || loadingPlans) return;
    const supabase = createClient();
    setLoadingPlans(true);
    getPlans(supabase)
      .then((data) => setPlans(data ?? []))
      .catch((err) => console.error("Failed to load plans:", err))
      .finally(() => setLoadingPlans(false));
  }, [subscriptionOpen, plans.length, loadingPlans]);

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(0)}`;

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
  const [checkoutBusy, setCheckoutBusy] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Plan-change state. When the user clicks a plan they don't already
  // have, we open a confirmation dialog (instead of bouncing them to
  // Stripe's portal) so they can review the change and optionally enter
  // a promo code. The actual switch goes through
  // /api/stripe/subscription/change which handles upgrade-now vs.
  // downgrade-at-period-end internally.
  const [planChange, setPlanChange] = useState<{ plan: Plan; isUpgrade: boolean } | null>(null);
  const [planChangePromo, setPlanChangePromo] = useState("");
  const [planChangeBusy, setPlanChangeBusy] = useState(false);
  const [planChangeError, setPlanChangeError] = useState<string | null>(null);
  const [planChangeSuccess, setPlanChangeSuccess] = useState<{
    mode: "upgrade" | "downgrade";
    newPlanDisplayName: string;
    scheduledFor: string | null;
  } | null>(null);

  const closePlanChange = useCallback(() => {
    if (planChangeBusy) return;
    setPlanChange(null);
    setPlanChangePromo("");
    setPlanChangeError(null);
    setPlanChangeSuccess(null);
  }, [planChangeBusy]);

  // Subscribe (no current plan) → embedded checkout page in our theme.
  // Change existing plan → confirm dialog → /api/stripe/subscription/change.
  const handlePlanCta = useCallback(
    (plan: Plan, isCurrent: boolean, hasActivePlan: boolean, isUpgrade: boolean) => {
      if (isCurrent) return;
      setCheckoutError(null);

      if (!hasActivePlan) {
        setCheckoutBusy(plan.id);
        router.push(`/checkout/subscription?planId=${encodeURIComponent(plan.id)}`);
        return;
      }

      setPlanChange({ plan, isUpgrade });
      setPlanChangePromo("");
      setPlanChangeError(null);
      setPlanChangeSuccess(null);
    },
    [router]
  );

  const handleConfirmPlanChange = useCallback(async () => {
    if (!planChange) return;
    setPlanChangeBusy(true);
    setPlanChangeError(null);
    try {
      const res = await fetch("/api/stripe/subscription/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: planChange.plan.id,
          promoCode: planChangePromo.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Plan change failed");
      setPlanChangeSuccess({
        mode: data.mode,
        newPlanDisplayName: data.newPlanDisplayName,
        scheduledFor: data.scheduledFor ?? null,
      });
      await refreshUser();
    } catch (err) {
      setPlanChangeError(err instanceof Error ? err.message : "Plan change failed");
    } finally {
      setPlanChangeBusy(false);
    }
  }, [planChange, planChangePromo, refreshUser]);

  const handlePurchaseCredits = useCallback(() => {
    setCheckoutBusy("credits");
    setCheckoutError(null);
    router.push(`/checkout/credits?credits=${creditAmount}`);
  }, [creditAmount, router]);

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
              Select the plan that best fits your brand needs.
            </DialogDescription>
          </DialogHeader>
          {checkoutError && (
            <p className="text-center text-xs text-red-500">{checkoutError}</p>
          )}
          {loadingPlans ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-[#06264e]" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {plans.map((plan, idx) => {
                const meta = planMeta[plan.name] ?? { cta: "Select", highlighted: false };
                const features = (plan.features as string[]) ?? [];
                // user.planName stores the plan's display_name, so match on that.
                const currentPlanIdx = user.planName
                  ? plans.findIndex((p) => p.display_name === user.planName)
                  : -1;
                const isCurrent = currentPlanIdx >= 0 && idx === currentPlanIdx;
                const isUpgrade = currentPlanIdx >= 0 && idx > currentPlanIdx;
                const isDowngrade = currentPlanIdx >= 0 && idx < currentPlanIdx;

                let ctaText = meta.cta;
                if (isCurrent) ctaText = "Current Plan";
                else if (isUpgrade) ctaText = "Upgrade";
                else if (isDowngrade) ctaText = "Downgrade";

                return (
                  <div
                    key={plan.id}
                    className={`relative flex flex-col rounded-xl border p-5 transition-all ${
                      isCurrent
                        ? "border-[#06264e] bg-[#06264e]/[0.03] shadow-lg shadow-[#06264e]/10 ring-2 ring-[#06264e]/20"
                        : meta.highlighted && !user.planName
                          ? "border-[#06264e] bg-[#06264e]/[0.03] shadow-lg shadow-[#06264e]/10"
                          : "border-[#e0d6d0] bg-white/40"
                    }`}
                  >
                    {isCurrent ? (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#06264e] px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                        Current Plan
                      </span>
                    ) : meta.highlighted && !user.planName ? (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#06264e] px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                        Most Popular
                      </span>
                    ) : null}
                    <h3 className="text-sm font-semibold text-foreground">{plan.display_name}</h3>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-foreground">{formatPrice(plan.price_cents)}</span>
                      <span className="text-sm text-muted-foreground">/month</span>
                    </div>
                    {plan.monthly_credits != null && (
                      <div className="mt-3 rounded-lg border border-[#06264e]/15 bg-[#06264e]/[0.04] px-3 py-2">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-lg font-bold text-[#06264e] tabular-nums">
                            {plan.monthly_credits.toLocaleString()}
                          </span>
                          <span className="text-[11px] font-medium uppercase tracking-wider text-[#06264e]/70">
                            credits / mo
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          ~{(plan.monthly_credits * 1000).toLocaleString()} characters of AI chat
                        </p>
                      </div>
                    )}
                    <ul className="mt-4 flex-1 space-y-2">
                      {features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2 text-xs text-foreground">
                          <Check className="mt-0.5 h-3 w-3 shrink-0 text-green-500" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <button
                      disabled={isCurrent || !!checkoutBusy}
                      onClick={() => handlePlanCta(plan, isCurrent, !!user.planName, isUpgrade)}
                      className={`mt-5 flex w-full items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all disabled:opacity-70 ${
                        isCurrent
                          ? "cursor-default border border-[#06264e]/30 bg-[#06264e]/5 text-[#06264e] opacity-80"
                          : isUpgrade || (meta.highlighted && !user.planName)
                            ? "bg-[#06264e] text-white hover:bg-[#06264e]/90"
                            : "border border-[#e0d6d0] text-foreground hover:border-[#c08967]/40 hover:bg-[#f2dacb]/30"
                      }`}
                    >
                      {checkoutBusy === plan.id && <Loader2 className="h-4 w-4 animate-spin" />}
                      {ctaText}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Plan change confirmation */}
      <Dialog open={!!planChange} onOpenChange={(open) => { if (!open) closePlanChange(); }}>
        <DialogContent className="sm:max-w-md">
          {planChangeSuccess ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {planChangeSuccess.mode === "upgrade"
                    ? `Upgraded to ${planChangeSuccess.newPlanDisplayName}`
                    : `Downgrade scheduled`}
                </DialogTitle>
                <DialogDescription>
                  {planChangeSuccess.mode === "upgrade"
                    ? "Your new plan is active. Prorated charges (if any) were processed on your saved card."
                    : `You'll keep your current plan until ${
                        planChangeSuccess.scheduledFor
                          ? new Date(planChangeSuccess.scheduledFor).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
                          : "the end of this billing cycle"
                      }, then switch to ${planChangeSuccess.newPlanDisplayName}.`}
                </DialogDescription>
              </DialogHeader>
              <button
                onClick={closePlanChange}
                className="mt-2 w-full rounded-lg bg-[#06264e] py-2 text-sm font-medium text-white transition-colors hover:bg-[#06264e]/90"
              >
                Done
              </button>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>
                  {planChange?.isUpgrade ? "Upgrade plan" : "Downgrade plan"}
                </DialogTitle>
                <DialogDescription>
                  {planChange?.isUpgrade
                    ? `Switch to ${planChange?.plan.display_name} now. We'll charge the prorated difference on your saved card today.`
                    : `Switch to ${planChange?.plan.display_name} at the end of your current billing cycle. No charge today — you keep your current plan until then.`}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 py-2">
                <div className="rounded-lg border border-[#06264e]/15 bg-[#06264e]/[0.04] p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium text-foreground">{planChange?.plan.display_name}</span>
                    <span className="text-lg font-bold text-[#06264e]">
                      {planChange ? formatPrice(planChange.plan.price_cents) : ""}
                      <span className="text-xs font-normal text-muted-foreground">/mo</span>
                    </span>
                  </div>
                  {planChange?.plan.monthly_credits != null && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {planChange.plan.monthly_credits.toLocaleString()} credits / month
                    </p>
                  )}
                </div>

                <label className="block">
                  <span className="text-xs font-medium text-foreground">Promo code (optional)</span>
                  <input
                    type="text"
                    value={planChangePromo}
                    onChange={(e) => setPlanChangePromo(e.target.value)}
                    placeholder="e.g. MYAEO100"
                    disabled={planChangeBusy}
                    className="mt-1 w-full rounded-lg border border-[#e0d6d0] bg-white/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-[#c08967]/50 focus:outline-none disabled:opacity-60"
                  />
                </label>

                {planChangeError && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                    {planChangeError}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={closePlanChange}
                  disabled={planChangeBusy}
                  className="flex-1 rounded-lg border border-[#e0d6d0] py-2 text-sm font-medium text-foreground transition-colors hover:bg-[#f2dacb]/30 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmPlanChange}
                  disabled={planChangeBusy}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#06264e] py-2 text-sm font-medium text-white transition-colors hover:bg-[#06264e]/90 disabled:opacity-70"
                >
                  {planChangeBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {planChange?.isUpgrade ? "Upgrade now" : "Schedule downgrade"}
                </button>
              </div>
            </>
          )}
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
            <button
              onClick={handlePurchaseCredits}
              disabled={!!checkoutBusy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#06264e] py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#06264e]/90 disabled:opacity-70"
            >
              {checkoutBusy === "credits" && <Loader2 className="h-4 w-4 animate-spin" />}
              Purchase Credits
            </button>
            {checkoutError && (
              <p className="text-center text-xs text-red-500">{checkoutError}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
