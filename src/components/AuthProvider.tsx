"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User as SupabaseUser, Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { User, BrandDNA } from "@/lib/types";
import {
  getProfile,
  getCredits,
  getPrimaryBrandDNA,
  getSubscription,
  getBrandDNAPurchase,
} from "@/lib/supabase/db";

interface AuthContextValue {
  session: Session | null;
  supabaseUser: SupabaseUser | null;
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [supabase] = useState(() => createClient());
  const [session, setSession] = useState<Session | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Build the app-level User object from DB data.
  // `prevUser` is the previously-known state — if a DB query times out we
  // preserve critical flags (hasSelectedProgram, hasActiveSubscription) from
  // the previous build so transient slowness doesn't bounce users to
  // /choose-program.
  const buildUser = useCallback(
    async (sbUser: SupabaseUser, prevUser?: User | null): Promise<User> => {
      try {
        // Wrap each query with a 6-second timeout so a single slow query
        // can't hang the entire app load
        const withTimeout = <T,>(promise: Promise<T>, fallback: T): Promise<T> =>
          Promise.race([
            promise,
            new Promise<T>((resolve) => setTimeout(() => resolve(fallback), 6000)),
          ]);

        const [profile, credits, brandDna, subscription, brandDnaPurchase] = await Promise.all([
          withTimeout(getProfile(supabase, sbUser.id), null),
          withTimeout(getCredits(supabase, sbUser.id).catch(() => null), null),
          withTimeout(getPrimaryBrandDNA(supabase, sbUser.id).catch(() => null), null),
          withTimeout(getSubscription(supabase, sbUser.id).catch(() => null), null),
          withTimeout(getBrandDNAPurchase(supabase, sbUser.id).catch(() => null), null),
        ]);

        // If profile query timed out, fall through to the fallback
        if (!profile) throw new Error("Profile query timed out");

        const brandDNA: BrandDNA = brandDna
          ? {
              configured: brandDna.status === "active",
              brandName: brandDna.brand_name,
              status:
                brandDna.status === "active"
                  ? "active"
                  : brandDna.status === "in_progress"
                    ? "inactive"
                    : "not_configured",
              documents: [],
            }
          : {
              configured: false,
              brandName: "",
              status: "not_configured",
              documents: [],
            };

        const hasActiveSubscription = !!subscription;
        const hasBrandDNA = !!brandDna;
        const hasBrandDNAPurchase = !!brandDnaPurchase;

        // If the DB says the user has a program, use that. If the DB came
        // back null (timeout), preserve the previous known-good value so a
        // slow query doesn't bounce an active user to /choose-program.
        const freshHasSelectedProgram = hasActiveSubscription || hasBrandDNA;
        const hasSelectedProgram =
          freshHasSelectedProgram || (prevUser?.hasSelectedProgram ?? false);

        const monthlyCredits = subscription?.plans?.monthly_credits ?? null;
        return {
          id: profile.id,
          name: profile.full_name,
          email: profile.email,
          avatarUrl: profile.avatar_url,
          credits: credits?.balance ?? 0,
          // maxCredits drives the credit bar fill. Prefer the plan's monthly
          // allocation so the bar represents "this month's usage"; fall back
          // to lifetime purchased or current balance for users without a plan.
          maxCredits:
            monthlyCredits ??
            Math.max(
              credits?.lifetime_purchased ?? 0,
              credits?.balance ?? 0,
              100
            ),
          monthlyCredits,
          brandDNA,
          hasActiveSubscription: hasActiveSubscription || (prevUser?.hasActiveSubscription ?? false),
          planName: subscription?.plans?.display_name ?? prevUser?.planName ?? null,
          hasSelectedProgram,
          hasBrandDNAPurchase: hasBrandDNAPurchase || (prevUser?.hasBrandDNAPurchase ?? false),
        };
      } catch (err) {
        console.error("Error building user:", err);
        // Fallback from auth metadata — but preserve critical flags from
        // the previous user state so a timeout doesn't redirect users.
        return {
          id: sbUser.id,
          name:
            prevUser?.name ||
            (sbUser.user_metadata?.full_name as string) ||
            sbUser.email?.split("@")[0] ||
            "User",
          email: sbUser.email || "",
          avatarUrl: prevUser?.avatarUrl ?? null,
          credits: prevUser?.credits ?? 0,
          maxCredits: prevUser?.maxCredits ?? 100,
          monthlyCredits: prevUser?.monthlyCredits ?? null,
          brandDNA: prevUser?.brandDNA ?? {
            configured: false,
            brandName: "",
            status: "not_configured",
            documents: [],
          },
          hasActiveSubscription: prevUser?.hasActiveSubscription ?? false,
          planName: prevUser?.planName ?? null,
          hasSelectedProgram: prevUser?.hasSelectedProgram ?? false,
          hasBrandDNAPurchase: prevUser?.hasBrandDNAPurchase ?? false,
        };
      }
    },
    [supabase]
  );

  // Keep a ref to the latest user so buildUser can read it without being
  // a dependency (avoids circular re-render loops).
  const userRef = useRef<User | null>(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const refreshingRef = useRef(false);

  const refreshUser = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const {
        data: { user: sbUser },
      } = await supabase.auth.getUser();
      if (sbUser) {
        const appUser = await buildUser(sbUser, userRef.current);
        setUser(appUser);
      }
    } finally {
      refreshingRef.current = false;
    }
  }, [supabase, buildUser]);

  // Initialize auth state
  useEffect(() => {
    let didFinish = false;

    // Safety net: if auth init takes more than 8 seconds, stop loading
    // so the user isn't stuck on a blank screen forever
    const safetyTimeout = setTimeout(() => {
      if (!didFinish) {
        console.warn("Auth init timed out — forcing load complete");
        setLoading(false);
      }
    }, 8000);

    const initAuth = async () => {
      try {
        const {
          data: { session: initialSession },
        } = await supabase.auth.getSession();

        setSession(initialSession);
        setSupabaseUser(initialSession?.user ?? null);

        if (initialSession?.user) {
          const appUser = await buildUser(initialSession.user);
          setUser(appUser);
        }
      } catch (err) {
        console.error("Auth init failed:", err);
      } finally {
        didFinish = true;
        clearTimeout(safetyTimeout);
        setLoading(false);
      }
    };

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      setSupabaseUser(newSession?.user ?? null);

      if (newSession?.user) {
        try {
          const appUser = await buildUser(newSession.user, userRef.current);
          setUser(appUser);
        } catch (err) {
          console.error("Failed to build user on auth change:", err);
        }
      } else {
        setUser(null);
      }
    });

    return () => {
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, [supabase, buildUser]);

  // Refresh user data when tab regains focus & periodically every 10 minutes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && session) {
        refreshUser();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    const interval = setInterval(() => {
      if (session) refreshUser();
    }, 10 * 60 * 1000);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(interval);
    };
  }, [session, refreshUser]);

  const signUp = useCallback(
    async (email: string, password: string, fullName: string) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
        },
      });
      return { error: error?.message ?? null };
    },
    [supabase]
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error: error?.message ?? null };
    },
    [supabase]
  );

  const signOutFn = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setSupabaseUser(null);
  }, [supabase]);

  return (
    <AuthContext.Provider
      value={{
        session,
        supabaseUser,
        user,
        loading,
        signUp,
        signIn,
        signOut: signOutFn,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
