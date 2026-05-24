"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (
      (username === "Ankit" && password === "Ankit") ||
      (username === "Sugandha" && password === "Sugandha")
    ) {
      login(username);
      router.push("/dashboard");
    } else {
      setError("Invalid credentials. Please try again.");
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-900">
      {/* Flowing Colorful Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500"></div>
      <div className="absolute inset-0 opacity-50">
        <div className="absolute -top-[25%] -left-[10%] w-[50%] h-[50%] bg-blue-400 rounded-full mix-blend-screen filter blur-[100px] animate-pulse"></div>
        <div className="absolute top-[20%] -right-[10%] w-[60%] h-[60%] bg-rose-400 rounded-full mix-blend-screen filter blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute -bottom-[20%] left-[20%] w-[70%] h-[70%] bg-purple-400 rounded-full mix-blend-screen filter blur-[150px] animate-pulse" style={{ animationDelay: '4s' }}></div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-md bg-white/90 backdrop-blur-xl p-10 rounded-3xl shadow-2xl border border-white/50 mx-4"
      >
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-pink-600 tracking-tight mb-2">
            AutoVantage
          </h1>
          <h2 className="text-lg font-medium text-slate-600">
            Welcome
          </h2>
        </div>
        
        {error && (
          <div className="mb-6 p-4 bg-red-50/90 border border-red-200 text-red-600 rounded-xl text-sm font-medium text-center shadow-sm backdrop-blur-sm">
            {error}
          </div>
        )}
        
        <div className="mb-5">
          <label
            htmlFor="username"
            className="block text-sm font-bold text-slate-700 mb-2 ml-1"
          >
            Username
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-5 py-3.5 bg-white/50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:bg-white transition-all duration-200 shadow-sm"
            placeholder="Enter your username"
            required
          />
        </div>
        
        <div className="mb-8">
          <label
            htmlFor="password"
            className="block text-sm font-bold text-slate-700 mb-2 ml-1"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-5 py-3.5 bg-white/50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:bg-white transition-all duration-200 shadow-sm"
            placeholder="••••••••"
            required
          />
        </div>
        
        <button
          type="submit"
          className="w-full bg-gradient-to-r from-indigo-600 to-pink-600 hover:from-indigo-700 hover:to-pink-700 text-white font-bold py-3.5 px-4 rounded-2xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
        >
          Sign In
        </button>
      </form>
    </div>
  );
}
