import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { GraduationCap, Lock, Mail, User as UserIcon, Shield, ArrowRight, CheckCircle2, AlertTriangle, KeyRound, RefreshCw } from "lucide-react";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();

  const [mode, setMode] = useState<"LOGIN" | "REGISTER" | "FORGOT" | "RESET">("LOGIN");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetToken, setResetToken] = useState("");

  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    newPassword: "",
  });

  // Read URL search params for resetToken if present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("resetToken") || params.get("token");
    if (token) {
      setResetToken(token);
      setMode("RESET");
    }
  }, []);

  // Validation helpers
  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passHasMinLength = form.password.length >= 8 || form.newPassword.length >= 8;
  const passHasNumber = /\d/.test(form.password || form.newPassword);
  const passHasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(form.password || form.newPassword);
  const isPasswordStrong = passHasMinLength && passHasNumber && passHasSymbol;

  const handleQuickLogin = async (email: string, pass: string) => {
    setError("");
    setSuccessMsg("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password: pass }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid email or password");
        return;
      }
      login(data.token, data.user);
      setLocation("/dashboard");
    } catch (err) {
      setError("Network error connecting to auth service.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (mode === "LOGIN") {
      if (!isValidEmail(form.email)) {
        setError("Invalid email or password");
        return;
      }
      setLoading(true);
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email: form.email, password: form.password }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Invalid email or password");
          return;
        }
        login(data.token, data.user);
        setLocation("/dashboard");
      } catch (err) {
        setError("Network error. Please check server connectivity.");
      } finally {
        setLoading(false);
      }
    } else if (mode === "REGISTER") {
      if (!isValidEmail(form.email)) {
        setError("Please enter a valid email address.");
        return;
      }
      if (!isPasswordStrong) {
        setError("Password does not meet strength requirements (8+ chars, 1 number, 1 special symbol).");
        return;
      }
      setLoading(true);
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            email: form.email,
            password: form.password,
            name: form.name || form.email.split("@")[0].toUpperCase(),
            role: "ADMIN",
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Registration failed");
          return;
        }
        login(data.token, data.user);
        setLocation("/dashboard");
      } catch (err) {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    } else if (mode === "FORGOT") {
      if (!isValidEmail(form.email)) {
        setError("Please enter a valid email address.");
        return;
      }
      setLoading(true);
      try {
        const res = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: form.email }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to process request");
          return;
        }
        setSuccessMsg(data.message || "If an account exists, a password reset link has been logged.");
      } catch (err) {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    } else if (mode === "RESET") {
      if (!isPasswordStrong) {
        setError("New password must be at least 8 characters with a number and special symbol.");
        return;
      }
      setLoading(true);
      try {
        const res = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: resetToken, newPassword: form.newPassword }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Reset failed");
          return;
        }
        setSuccessMsg(data.message || "Password reset successful! Please log in.");
        setTimeout(() => { setMode("LOGIN"); setSuccessMsg(""); }, 3000);
      } catch (err) {
        setError("Network error resetting password.");
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center p-4 transition-colors">
      <div className="w-full max-w-md bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-3xl shadow-2xl p-8 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="h-14 w-14 rounded-2xl bg-[hsl(var(--primary))] text-white flex items-center justify-center mb-3 shadow-lg">
            <GraduationCap size={32} />
          </div>
          <h1 className="text-2xl font-bold font-display tracking-tight text-[hsl(var(--foreground))]">
            CUI CS System
          </h1>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
            COMSATS University Islamabad, Vehari Campus — HOD Portal
          </p>
        </div>

        {/* Quick Admin Access */}
        {mode === "LOGIN" && (
          <div className="mb-6 p-3.5 bg-[#eef6f2] dark:bg-[#1a3832] border border-[#bcd8cb] dark:border-[#28695e] rounded-2xl shadow-sm">
            <p className="text-[10px] font-extrabold text-[#28695e] dark:text-[#bcd8cb] uppercase tracking-wider mb-2 text-center">
              Quick Admin Access
            </p>
            <button
              type="button"
              onClick={() => handleQuickLogin("admin@cui.edu.pk", "admin123")}
              className="w-full px-4 py-2 bg-white dark:bg-gray-900 text-xs font-extrabold text-[#28695e] dark:text-[#bcd8cb] border border-[#bcd8cb] dark:border-[#28695e] rounded-xl hover:bg-[#dcebe5] dark:hover:bg-gray-800 flex items-center justify-center gap-2 transition-all btn-tactile shadow-sm"
            >
              <Shield size={15} />
              Log in as HOD Admin (Dr. M. Rehan Ashraf)
            </button>
          </div>
        )}

        {/* Feedback Alerts */}
        {error && (
          <div className="mb-4 p-3.5 rounded-xl bg-[#fff5f3] dark:bg-[#3d1d1a] border border-[#e9beb8] dark:border-[#a8493f] text-xs font-bold text-[#a8493f] dark:text-[#f7e3df] flex items-center gap-2 animate-shake">
            <AlertTriangle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3.5 rounded-xl bg-[#dcebe5] dark:bg-[#1a3832] border border-[#bcd8cb] dark:border-[#28695e] text-xs font-bold text-[#28695e] dark:text-[#d8efe6] flex items-start gap-2">
            <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span>{successMsg}</span>
              <p className="text-[10px] opacity-80">Check server logs for reset link if testing locally.</p>
            </div>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "REGISTER" && (
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">
                Full Name
              </label>
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 focus-within:border-[hsl(var(--primary))] transition-all">
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

          {mode !== "RESET" && (
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">
                Email Address
              </label>
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 focus-within:border-[hsl(var(--primary))] transition-all">
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
          )}

          {(mode === "LOGIN" || mode === "REGISTER") && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-black uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  Password
                </label>
                {mode === "LOGIN" && (
                  <button
                    type="button"
                    onClick={() => { setMode("FORGOT"); setError(""); setSuccessMsg(""); }}
                    className="text-[11px] font-bold text-[hsl(var(--primary))] hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 focus-within:border-[hsl(var(--primary))] transition-all">
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
          )}

          {mode === "RESET" && (
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">
                Reset Token
              </label>
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 mb-3">
                <KeyRound size={16} className="text-[hsl(var(--muted-foreground))]" />
                <input
                  type="text"
                  required
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  placeholder="Token from log link"
                  className="w-full bg-transparent text-xs outline-none font-mono"
                />
              </div>

              <label className="block text-[11px] font-black uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">
                New Password
              </label>
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 focus-within:border-[hsl(var(--primary))] transition-all">
                <Lock size={16} className="text-[hsl(var(--muted-foreground))]" />
                <input
                  type="password"
                  required
                  value={form.newPassword}
                  onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                  placeholder="Enter strong new password"
                  className="w-full bg-transparent text-xs outline-none"
                />
              </div>
            </div>
          )}

          {/* Password Strength Indicator (for Register & Reset) */}
          {(mode === "REGISTER" || mode === "RESET") && (
            <div className="p-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 space-y-1 text-[11px]">
              <p className="font-bold text-[hsl(var(--muted-foreground))] mb-1">Password Strength Checklist:</p>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={13} className={passHasMinLength ? "text-emerald-600" : "text-gray-400"} />
                <span className={passHasMinLength ? "font-bold text-emerald-600" : "text-[hsl(var(--muted-foreground))]"}>At least 8 characters</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={13} className={passHasNumber ? "text-emerald-600" : "text-gray-400"} />
                <span className={passHasNumber ? "font-bold text-emerald-600" : "text-[hsl(var(--muted-foreground))]"}>Contains at least one number (0-9)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={13} className={passHasSymbol ? "text-emerald-600" : "text-gray-400"} />
                <span className={passHasSymbol ? "font-bold text-emerald-600" : "text-[hsl(var(--muted-foreground))]"}>Contains at least one symbol (!@#$...)</span>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-[hsl(var(--primary))] text-white text-xs font-black flex items-center justify-center gap-2 shadow-md hover:bg-[#205249] transition-all btn-tactile disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw size={15} className="animate-spin" /> Authenticating…
              </>
            ) : mode === "LOGIN" ? (
              <>Sign In to HOD Dashboard <ArrowRight size={15} /></>
            ) : mode === "REGISTER" ? (
              <>Create Admin Account <ArrowRight size={15} /></>
            ) : mode === "FORGOT" ? (
              <>Send Reset Link <ArrowRight size={15} /></>
            ) : (
              <>Set New Password &amp; Login <ArrowRight size={15} /></>
            )}
          </button>
        </form>

        {/* Footer Mode Switchers */}
        <div className="mt-6 text-center space-y-2">
          {mode === "LOGIN" && (
            <button
              type="button"
              onClick={() => { setMode("REGISTER"); setError(""); setSuccessMsg(""); }}
              className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] font-bold transition-colors"
            >
              Need an admin account? Register new admin
            </button>
          )}

          {mode !== "LOGIN" && (
            <button
              type="button"
              onClick={() => { setMode("LOGIN"); setError(""); setSuccessMsg(""); }}
              className="text-xs text-[hsl(var(--primary))] hover:underline font-bold transition-colors"
            >
              ← Back to Admin Login
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
