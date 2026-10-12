"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";

type Ctx = {
  users: User[];
  user: User | null;
  setUserId: (id: number) => void;
  createUser: (name: string) => Promise<void>;
  refreshUsers: () => Promise<void>;
};

const UserContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "cinesense:userId";

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserIdState] = useState<number | null>(null);

  const applyUsers = useCallback(({ items }: { items: User[] }) => {
    setUsers(items);
    setUserIdState((current) => {
      if (current && items.some((u) => u.id === current)) return current;
      let saved: number | null = null;
      try {
        saved = Number(localStorage.getItem(STORAGE_KEY)) || null;
      } catch {}
      return items.find((u) => u.id === saved)?.id ?? items[0]?.id ?? null;
    });
  }, []);

  const refreshUsers = useCallback(async () => {
    applyUsers(await api<{ items: User[] }>("/api/users"));
  }, [applyUsers]);

  useEffect(() => {
    api<{ items: User[] }>("/api/users").then(applyUsers).catch(console.error);
  }, [applyUsers]);

  const setUserId = useCallback((id: number) => {
    setUserIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, String(id));
    } catch {}
  }, []);

  const createUser = useCallback(
    async (name: string) => {
      const created = await api<User>("/api/users", { method: "POST", body: JSON.stringify({ name }) });
      await refreshUsers();
      setUserId(created.id);
    },
    [refreshUsers, setUserId]
  );

  const user = users.find((u) => u.id === userId) ?? null;
  return (
    <UserContext.Provider value={{ users, user, setUserId, createUser, refreshUsers }}>{children}</UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used inside <UserProvider>");
  return ctx;
}
