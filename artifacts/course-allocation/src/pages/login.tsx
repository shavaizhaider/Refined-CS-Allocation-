import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { GraduationCap, Lock, Mail, User as UserIcon, Shield, ArrowRight, BookOpen } from "lucide-react";

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
    role: "STUDENT" as "STUDENT" | "ADMIN",
    studentId: "FA25-BCS-010",
    programme: "BSCS",
    semester: "1",
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
      login(data.token, data.user);
      if (data.user.role === "STUDENT") {
        setLocation("/student/allocation");
      } else {
        setLocation("/dashboard");
      }
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
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Authentication failed");
        return;
      }

      login(data.token, data.user);
      if (data.user.role === "STUDENT") {
        setLocation("/student/allocation");
      } else {
        setLocation("/dashboard");
      }
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
            COMSATS University Islamabad, Vehari Campus
          </p>
        </div>

        {/* Quick Demo Credentials */}
        <div className="mb-6 p-3 bg-[#eef6f2] border border-[#bcd8cb] rounded-xl">
          <p className="text-[11px] font-bold text-[#28695e] uppercase tracking-wider mb-2">
            Quick Demo Accounts
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleQuickLogin("student@cui.edu.pk", "student123")}
              className="px-3 py-2 bg-white text-[11px] font-bold text-[#28695e] border border-[#bcd8cb] rounded-lg hover:bg-[#dcebe5] flex items-center justify-center gap-1.5 transition-colors"
            >
              <BookOpen size={13} />
              Student Portal
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin("admin@cui.edu.pk", "admin123")}
              className="px-3 py-2 bg-white text-[11px] font-bold text-[#28695e] border border-[#bcd8cb] rounded-lg hover:bg-[#dcebe5] flex items-center justify-center gap-1.5 transition-colors"
            >
              <Shield size={13} />
              Admin Portal
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-[#fff5f3] border border-[#e9beb8] text-xs font-bold text-[#a8493f]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">
                  Full Name
                </label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30">
                  <UserIcon size={16} className="text-[hsl(var(--muted-foreground))]" />
                  <input
                    type="text"
                    required
                    placeholder="Ali Ahmad"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-transparent text-xs outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-1">
                  Account Type
                </label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as any })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] outline-none font-bold"
                >
                  <option value="STUDENT">Student</option>
                  <option value="ADMIN">Administrator / HOD</option>
                </select>
              </div>

              {form.role === "STUDENT" && (
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase mb-1">
                      Student ID
                    </label>
                    <input
                      type="text"
                      placeholder="FA25-BCS-010"
                      value={form.studentId}
                      onChange={(e) => setForm({ ...form, studentId: e.target.value })}
                      className="w-full px-2 py-1.5 text-xs rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase mb-1">
                      Programme
                    </label>
                    <select
                      value={form.programme}
                      onChange={(e) => setForm({ ...form, programme: e.target.value })}
                      className="w-full px-2 py-1.5 text-xs rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]"
                    >
                      <option value="BSCS">BSCS</option>
                      <option value="BSSE">BSSE</option>
                      <option value="MSCS">MSCS</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase mb-1">
                      Semester
                    </label>
                    <select
                      value={form.semester}
                      onChange={(e) => setForm({ ...form, semester: e.target.value })}
                      className="w-full px-2 py-1.5 text-xs rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]"
                    >
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="5">5</option>
                      <option value="7">7</option>
                    </select>
                  </div>
                </div>
              )}
            </>
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
                placeholder="student@cui.edu.pk"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
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
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full bg-transparent text-xs outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-[hsl(var(--primary))] text-white font-extrabold text-xs rounded-lg shadow-sm hover:bg-[#245f58] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? "Processing..." : isRegister ? "Create Account" : "Sign In"}
            <ArrowRight size={14} />
          </button>
        </form>

        <div className="mt-6 text-center border-t border-[hsl(var(--border))] pt-4">
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setError("");
            }}
            className="text-xs font-extrabold text-[hsl(var(--primary))] hover:underline"
          >
            {isRegister ? "Already have an account? Sign In" : "Need a student or admin account? Register"}
          </button>
        </div>
      </div>
    </div>
  );
}
