import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { GraduationCap, Lock, Mail, User as UserIcon, Shield, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    role: "ADMIN" as const,
    studentId: null,
    programme: "BSCS",
    semester: null,
  });

  const handleQuickLogin = async (email: string, pass: string) => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pass }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }
      login(data.token, { ...data.user, role: "ADMIN" });
      setLocation("/dashboard");
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, role: "ADMIN" }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Authentication failed");
        return;
      }

      login(data.token, { ...data.user, role: "ADMIN" });
      setLocation("/dashboard");
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl shadow-xl p-8">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="h-12 w-12 rounded-xl bg-[hsl(var(--primary))] text-white flex items-center justify-center mb-3">
            <GraduationCap size={28} />
          </div>
          <h1 className="text-2xl font-bold font-display tracking-tight text-[hsl(var(--foreground))]">
            CS Course Allocation System
          </h1>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
            COMSATS University Islamabad, Vehari Campus — HOD Portal
          </p>
        </div>

        {/* Quick Demo Credentials */}
        <div className="mb-6 p-3 bg-[#eef6f2] border border-[#bcd8cb] rounded-xl">
          <p className="text-[11px] font-bold text-[#28695e] uppercase tracking-wider mb-2 text-center">
            Quick Admin Access
          </p>
          <button
            type="button"
            onClick={() => handleQuickLogin("admin@cui.edu.pk", "admin123")}
            className="w-full px-4 py-2.5 bg-white text-xs font-bold text-[#28695e] border border-[#bcd8cb] rounded-lg hover:bg-[#dcebe5] flex items-center justify-center gap-2 transition-colors shadow-sm"
          >
            <Shield size={15} />
            Log in as HOD Admin (Dr. M. Rehan Ashraf)
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-[#fff5f3] border border-[#e9beb8] text-xs font-bold text-[#a8493f]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">
                Full Name
              </label>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30">
                <UserIcon size={16} className="text-[hsl(var(--muted-foreground))]" />
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Dr. M. Rehan Ashraf"
                  className="w-full bg-transparent text-xs outline-none"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">
              Email Address
            </label>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30">
              <Mail size={16} className="text-[hsl(var(--muted-foreground))]" />
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="admin@cui.edu.pk"
                className="w-full bg-transparent text-xs outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">
              Password
            </label>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30">
              <Lock size={16} className="text-[hsl(var(--muted-foreground))]" />
              <input
                type="password"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                className="w-full bg-transparent text-xs outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-[hsl(var(--primary))] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md hover:bg-[#205249] transition-colors disabled:opacity-50"
          >
            {loading ? "Authenticating…" : isRegister ? "Create Admin Account" : "Sign In to HOD Dashboard"}
            <ArrowRight size={15} />
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setIsRegister(!isRegister)}
            className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] font-bold transition-colors"
          >
            {isRegister ? "Already have an admin account? Sign in" : "Need an admin account? Register"}
          </button>
        </div>
      </div>
    </div>
  );
}
