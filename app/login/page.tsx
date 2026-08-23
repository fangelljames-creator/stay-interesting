"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSignUp = async () => {
    setIsLoading(true);
    setMessage("");
    
    const { error } = await supabase.auth.signUp({ 
      email, 
      password 
    });

    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      setMessage("Account created successfully! You can now log in.");
    }
    setIsLoading(false);
  };

  const handleSignIn = async () => {
    setIsLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({ 
      email, 
      password 
    });

    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      setMessage("Logged in successfully! Redirecting...");
      // Send the user back to the homepage quiz after logging in
      setTimeout(() => router.push("/"), 1500);
    }
    setIsLoading(false);
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-slate-100 space-y-6">
        
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-extrabold text-slate-900">Welcome</h1>
          <p className="text-slate-500">Sign in to save your favorite activities.</p>
        </div>

        {/* Input Fields */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>
        </div>

        {/* Status Message */}
        {message && (
          <div className="p-3 bg-slate-50 text-slate-700 text-sm font-medium rounded-lg text-center">
            {message}
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3 pt-2">
          <button 
            onClick={handleSignIn}
            disabled={isLoading}
            className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-colors disabled:bg-slate-400"
          >
            {isLoading ? "Loading..." : "Log In"}
          </button>
          
          <button 
            onClick={handleSignUp}
            disabled={isLoading}
            className="w-full bg-white text-slate-900 py-3 rounded-xl font-bold border-2 border-slate-200 hover:border-slate-900 transition-colors disabled:text-slate-400"
          >
            Create Account
          </button>
        </div>

      </div>
    </main>
  );
}