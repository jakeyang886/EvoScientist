"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────

interface User {
  uid: string;
  username: string;
  email: string;
  avatar_url?: string;
  plan: string;
  email_verified: boolean;
}

interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

interface AuthContextValue {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, remember: boolean) => Promise<void>;
  register: (username: string, email: string, password: string, inviteCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

function getStorage(remember: boolean): Storage {
  return remember ? localStorage : sessionStorage;
}

function getStoredTokens(): AuthTokens | null {
  try {
    const stored = localStorage.getItem("auth_tokens") || sessionStorage.getItem("auth_tokens");
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

// ─── Provider ─────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tokens, setTokens] = useState<AuthTokens | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const stored = getStoredTokens();
    if (stored) {
      setTokens(stored);
      // Validate token
      apiFetch<User>("/api/auth/me")
        .then((data) => setUser(data))
        .catch((err) => {
          // Only clear tokens if the error is explicitly an authentication failure (e.g. 401/403).
          // Do not clear tokens for network errors, timeouts, or temporary server issues.
          if (err?.code && (err.code.startsWith("auth_") || err.status === 401)) {
            localStorage.removeItem("auth_tokens");
            sessionStorage.removeItem("auth_tokens");
            // Force redirect to login — apiFetch may have already tried but
            // we need to ensure it happens even if the promise was caught.
            if (typeof window !== "undefined" && window.location.pathname !== "/login") {
              window.location.href = "/login";
            }
          }
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string, remember: boolean) => {
    try {
      const data = await apiFetch<{ access_token: string; refresh_token: string; user: User }>(
        "/api/auth/login",
        { method: "POST", body: { email, password, remember } }
      );
      const newTokens = { access_token: data.access_token, refresh_token: data.refresh_token };
      setTokens(newTokens);
      setUser(data.user);

      // Save to the selected storage
      getStorage(remember).setItem("auth_tokens", JSON.stringify(newTokens));

      // Clear the OTHER storage to prevent "stale token" conflicts
      // (e.g. old localStorage token overriding a new sessionStorage login)
      if (remember) {
        sessionStorage.removeItem("auth_tokens");
      } else {
        localStorage.removeItem("auth_tokens");
      }
    } catch (err: any) {
      if (err?.code === "auth_email_not_verified") {
        throw { code: "auth_email_not_verified" };
      }
      if (err?.code === "auth_login_failed") {
        throw { code: "auth_login_failed", message: err.message || "Invalid email or password" };
      }
      throw err;
    }
  };

  const register = async (username: string, email: string, password: string, inviteCode?: string) => {
    const data = await apiFetch<{ access_token: string; refresh_token: string; user: User }>(
      "/api/auth/register",
      { method: "POST", body: { username, email, password, invite_code: inviteCode } }
    );
    const newTokens = { access_token: data.access_token, refresh_token: data.refresh_token };
    setTokens(newTokens);
    setUser(data.user);
    localStorage.setItem("auth_tokens", JSON.stringify(newTokens));
  };

  const logout = async () => {
    if (tokens?.refresh_token) {
      try {
        await apiFetch<void>("/api/auth/logout", {
          method: "POST",
          body: { refresh_token: tokens.refresh_token },
        });
      } catch {
        // Ignore logout errors
      }
    }
    localStorage.removeItem("auth_tokens");
    sessionStorage.removeItem("auth_tokens");
    setTokens(null);
    setUser(null);
  };

  const refresh = async () => {
    if (!tokens?.refresh_token) return;
    const data = await apiFetch<{ access_token: string; refresh_token: string }>(
      "/api/auth/refresh",
      { method: "POST", body: { refresh_token: tokens.refresh_token } }
    );
    const newTokens = { access_token: data.access_token, refresh_token: data.refresh_token };
    setTokens(newTokens);
    // Store in both (refresh keeps existing storage)
    localStorage.setItem("auth_tokens", JSON.stringify(newTokens));
    sessionStorage.setItem("auth_tokens", JSON.stringify(newTokens));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        tokens,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
