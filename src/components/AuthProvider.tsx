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

  // Build the app-level User object from DB data
  const buildUser = useCallback(
    async (sbUser: SupabaseUser): Promise<User> => {
      try {
        const [profile, credits, brandDna, subscription, brandDnaPurchase] = await Promise.all([
          getProfile(supabase, sbUser.id),
          getCredits(supabase, sbUser.id).catch(() => null),
          getPrimaryBrandDNA(supabase, sbUser.id).catch(() => null),
          getSubscription(supabase, sbUser.id).catch(() => null),
          getBrandDNAPurchase(supabase, sbUser.id).catch(() => null),
        ]);

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

        return {
          id: profile.id,
          name: profile.full_name,
          email: profile.email,
          avatarUrl: profile.avatar_url,
          credits: credits?.balance ?? 0,
          maxCredits: Math.max(credits?.lifetime_purchased ?? 0, credits?.balance ?? 0, 100),
          brandDNA,
          hasActiveSubscription,
          planName: subscription?.plans?.display_name ?? null,
          hasSelectedProgram: hasActiveSubscription || hasBrandDNA,
          hasBrandDNAPurchase,
        };
      } catch (err) {
        console.error("Error building user:", err);
        // Fallback from auth metadata
        return {
          id: sbUser.id,
          name:
            (sbUser.user_metadata?.full_name as string) ||
            sbUser.email?.split("@")[0] ||
            "User",
          email: sbUser.email || "",
          avatarUrl: null,
          credits: 0,
          maxCredits: 100,
          brandDNA: {
            configured: false,
            brandName: "",
            status: "not_configured",
            documents: [],
          },
          hasActiveSubscription: false,
          planName: null,
          hasSelectedProgram: false,
          hasBrandDNAPurchase: false,
        };
      }
    },
    [supabase]
  );

  const refreshingRef = useRef(false);

  const refreshUser = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const {
        data: { user: sbUser },
      } = await supabase.auth.getUser();
      if (sbUser) {
        const appUser = await buildUser(sbUser);
        setUser(appUser);
      }
    } finally {
      refreshingRef.current = false;
    }
  }, [supabase, buildUser]);

  // Initialize auth state
  useEffect(() => {
    const initAuth = async () => {
      const {
        data: { session: initialSession },
      } = await supabase.auth.getSession();

      setSession(initialSession);
      setSupabaseUser(initialSession?.user ?? null);

      if (initialSession?.user) {
        const appUser = await buildUser(initialSession.user);
        setUser(appUser);
      }

      setLoading(false);
    };

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      setSupabaseUser(newSession?.user ?? null);

      if (newSession?.user) {
        const appUser = await buildUser(newSession.user);
        setUser(appUser);
      } else {
        setUser(null);
      }
    });

    return () => {
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
