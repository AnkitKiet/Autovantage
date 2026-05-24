"use client";

import React, { createContext, useState, useEffect, ReactNode } from "react";

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  username: string | null;
  login: (username: string) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    const hasSession = document.cookie.includes("session=authenticated");
    const usernameMatch = document.cookie.match(/(?:^|; )username=([^;]*)/);

    if (hasSession) {
      setIsAuthenticated(true);
      if (usernameMatch) {
        setUsername(decodeURIComponent(usernameMatch[1]));
      }
    }
    setIsLoading(false);
  }, []);

  const login = (loggedInUser: string) => {
    document.cookie = "session=authenticated; path=/; max-age=86400"; // 1 day
    document.cookie = `username=${encodeURIComponent(loggedInUser)}; path=/; max-age=86400`;
    setIsAuthenticated(true);
    setUsername(loggedInUser);
  };
  
  const logout = () => {
    document.cookie = "session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = "username=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    setIsAuthenticated(false);
    setUsername(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, username, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}