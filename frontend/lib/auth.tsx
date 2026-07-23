"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, store, User } from "./api";

interface AuthState {
  user: User | null;
  loading: boolean;
  setToken: (token: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = store.getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api.auth
      .me()
      .then(setUser)
      .catch(() => {
        store.clearToken();
        store.clearOrg();
      })
      .finally(() => setLoading(false));
  }, []);

  const setToken = async (token: string) => {
    store.setToken(token);
    const me = await api.auth.me();
    setUser(me);
  };

  const logout = async () => {
    try {
      await api.auth.logout();
    } catch {
      /* ignore */
    }
    store.clearToken();
    store.clearOrg();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, setToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
