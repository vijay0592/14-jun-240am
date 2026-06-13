import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("foms_token");
    const cachedUser = localStorage.getItem("foms_user");
    if (token && cachedUser) {
      try { setUser(JSON.parse(cachedUser)); } catch (e) { console.warn("Failed to parse cached user", e); }
      api.get("/auth/me").then((r) => {
        setUser(r.data);
        localStorage.setItem("foms_user", JSON.stringify(r.data));
      }).catch(() => {
        localStorage.removeItem("foms_token");
        localStorage.removeItem("foms_user");
        setUser(null);
      }).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("foms_token", data.token);
    localStorage.setItem("foms_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("foms_token");
    localStorage.removeItem("foms_user");
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout, isAdmin: user?.role === "admin" }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
