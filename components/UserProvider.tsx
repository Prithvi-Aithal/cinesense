"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";

type Ctx = {
  user: User | null;
  loading: boolean;
  login: (name: string, password: string) => Promise<void>;
  register: (name: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const UserContext = createContext<Ctx | null>(null);

// The session lives in an httpOnly cookie that only the server can read, so the client
// asks /api/auth/me who is signed in.
export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      setUser((await api<{ user: User | null }>("/api/auth/me")).user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api<{ user: User | null }>("/api/auth/me")
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(
    async (name: string, password: string) => {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ name, password }) });
      await refreshUser();
    },
    [refreshUser]
  );

  const register = useCallback(
    async (name: string, password: string) => {
      await api("/api/auth/register", { method: "POST", body: JSON.stringify({ name, password }) });
      await refreshUser();
    },
    [refreshUser]
  );

  const logout = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

  return (
    <UserContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>{children}</UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used inside <UserProvider>");
  return ctx;
}
