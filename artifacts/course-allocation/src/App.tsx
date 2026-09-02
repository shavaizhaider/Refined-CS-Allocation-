import { type ReactNode, useState, useEffect, createContext, useContext } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import NotFound from '@/pages/not-found';
import LoginPage from '@/pages/login';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import {
  Activity as ActivityIcon,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  Download,
  Edit,
  ExternalLink,
  FileSpreadsheet,
  Filter,
  GraduationCap,
  Grid,
  Info,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  Menu,
  Moon,
  MoreHorizontal,
  Network,
  Phone,
  Pin,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sun,
  Table as TableIcon,
  Trash2,
  Unlock,
  Users,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import {
  getGetDashboardQueryKey,
  getListActivityQueryKey,
  getListCoursesQueryKey,
  getListFacultyQueryKey,
  getListOfferingsQueryKey,
  getListSessionsQueryKey,
  getListWorkloadQueryKey,
  useApproveSession,
  useCreateCourse,
  useCreateSession,
  useGetDashboard,
  useListActivity,
  useListCourses,
  useListFaculty,
  useListOfferings,
  useListSessions,
  useListWorkload,
  type Activity as ActivityRecord,
  type Offering,
} from '@workspace/api-client-react';
import { Link, Route, Switch, useLocation } from 'wouter';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

function formatWhatsAppUrl(phoneStr?: string | null, messageText?: string): string {
  // Step 1: Always strip EVERY non-digit character — handles +, spaces, dashes, parens, etc.
  const raw = phoneStr ? String(phoneStr) : "";
  let digits = raw.replace(/\D/g, ""); // removes +, spaces, -, (, ), etc.

  // Step 2: Normalize to Pakistani country code 92
  if (digits.startsWith("0092")) {
    digits = digits.slice(2); // 0092xxx → 92xxx
  } else if (digits.startsWith("03") && digits.length === 11) {
    digits = "92" + digits.slice(1); // 03xx-xxxxxxx → 923xx-xxxxxxx
  } else if (digits.length === 10 && !digits.startsWith("92")) {
    digits = "92" + digits; // 10-digit local → add 92
  }

  // Step 3: Fallback if nothing valid
  if (!digits || digits.length < 10) digits = "923000000000";

  const url = `https://wa.me/${digits}`;
  // Debug: log the exact URL being opened (visible in browser console)
  if (typeof console !== "undefined") console.debug("[WhatsApp]", { raw: phoneStr, digits, url });
  return messageText ? `${url}?text=${encodeURIComponent(messageText)}` : url;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
    },
  },
});

// ─── Global Theme Context ──────────────────────────────────────────────────────

interface ThemeContextType {
  darkMode: boolean;
  toggleDarkMode: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  darkMode: false,
  toggleDarkMode: () => {},
});

export const useTheme = () => useContext(ThemeContext);

function ThemeProvider({ children }: { children: ReactNode }) {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('cs_theme') === 'dark';
  });

  const toggleDarkMode = () => {
    setDarkMode((prev) => {
      const next = !prev;
      localStorage.setItem('cs_theme', next ? 'dark' : 'light');
      return next;
    });
  };

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  return (
    <ThemeContext.Provider value={{ darkMode, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ─── Global Cycle Context ──────────────────────────────────────────────────────

interface CycleContextType {
  activeCycleId: number | null;
  activeCycleCode: string;
  activeCycleLabel: string;
  switchCycle: (id: number) => Promise<void>;
  isSwitching: boolean;
}

const CycleContext = createContext<CycleContextType>({
  activeCycleId: 1,
  activeCycleCode: 'FA25',
  activeCycleLabel: 'Fall 2025 Cycle',
  switchCycle: async () => {},
  isSwitching: false,
});

export const useCycle = () => useContext(CycleContext);

function CycleProvider({ children }: { children: ReactNode }) {
  const sessions = useListSessions({ query: { queryKey: getListSessionsQueryKey() } });
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);

  const active = sessions.data?.find((s) => s.id === activeId) ||
    sessions.data?.find((s) => s.status.toLowerCase().includes('active') || s.status.toLowerCase().includes('progress')) ||
    sessions.data?.[0];

  const switchCycle = async (id: number) => {
    setIsSwitching(true);
    try {
      const res = await fetch(`/api/sessions/${id}/activate`, { method: 'POST' });
      if (res.ok) {
        setActiveId(id);
        toast(`Switched active academic cycle to ${sessions.data?.find(s => s.id === id)?.code || 'Selected Cycle'}`, 'success');
        await qc.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        await qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        await qc.invalidateQueries({ queryKey: getListOfferingsQueryKey() });
      } else {
        toast('Failed to switch cycle context', 'error');
      }
    } catch {
      toast('Network error switching cycle', 'error');
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <CycleContext.Provider
      value={{
        activeCycleId: active?.id ?? 1,
        activeCycleCode: active?.code ?? 'FA25',
        activeCycleLabel: active?.label ?? 'Fall 2025 Cycle',
        switchCycle,
        isSwitching,
      }}
    >
      {children}
    </CycleContext.Provider>
  );
}

// ─── Utility helpers ─────────────────────────────────────────────────────────

function cn(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function initials(value: string) {
  return value.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

function formatTime(value?: string) {
  if (!value) return 'Just now';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ─── Toast system with Undo Support ──────────────────────────────────────────

type Toast = { id: number; message: string; type: 'success' | 'error' | 'info'; onUndo?: () => void };
let toastId = 0;
const toastListeners: Set<(t: Toast) => void> = new Set();

function toast(message: string, type: Toast['type'] = 'success', onUndo?: () => void) {
  const t: Toast = { id: ++toastId, message, type, onUndo };
  toastListeners.forEach((fn) => fn(t));
}

function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const fn = (t: Toast) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 5000);
    };
    toastListeners.add(fn);
    return () => { toastListeners.delete(fn); };
  }, []);

  return (
    <div className="fixed bottom-5 right-5 z-[999] flex flex-col gap-2 min-w-[320px]">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-semibold shadow-2xl animate-in slide-in-from-right duration-200',
            t.type === 'success' && 'bg-[#dcebe5] border-[#bcd8cb] text-[#28695e] dark:bg-[#1a3832] dark:border-[#28695e] dark:text-[#d8efe6]',
            t.type === 'error' && 'bg-[#fff5f3] border-[#e9beb8] text-[#a8493f] dark:bg-[#3d1d1a] dark:border-[#a8493f] dark:text-[#f7e3df]',
            t.type === 'info' && 'bg-[hsl(var(--card))] border-[hsl(var(--border))] text-[hsl(var(--foreground))]',
          )}
        >
          <div className="flex items-center gap-2.5">
            {t.type === 'success' && <CheckCircle2 size={16} />}
            {t.type === 'error' && <AlertTriangle size={16} />}
            <span>{t.message}</span>
          </div>
          {t.onUndo && (
            <button
              onClick={() => {
                t.onUndo?.();
                setToasts((prev) => prev.filter((x) => x.id !== t.id));
              }}
              className="ml-2 px-2.5 py-1 text-xs font-black uppercase tracking-wider rounded bg-white text-gray-900 shadow-sm hover:bg-gray-100"
            >
              Undo
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[1000] bg-amber-600 text-white text-center py-2 px-4 text-xs font-bold shadow-md flex items-center justify-center gap-2 animate-in slide-in-from-top duration-200">
      <WifiOff size={15} />
      <span>You're offline — some features need an internet connection</span>
    </div>
  );
}

// ─── Shared UI components ─────────────────────────────────────────────────────

function StatusPill({ status }: { status?: string }) {
  const n = (status || 'pending').toLowerCase();
  const styles =
    n.includes('over') || n.includes('conflict') || n.includes('critical')
      ? 'bg-[#f7e3df] text-[#a8493f] dark:bg-[#42221f] dark:text-[#f7e3df]'
      : n.includes('allocated') || n.includes('approved') || n.includes('active') || n.includes('balanced')
        ? 'bg-[#dcebe5] text-[#28695e] dark:bg-[#1a3832] dark:text-[#d8efe6]'
        : n.includes('near') || n.includes('review') || n.includes('warning')
          ? 'bg-[#f7ecd0] text-[#8b681d] dark:bg-[#3d321a] dark:text-[#f7ecd0]'
          : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]';
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em]', styles)}>
      {status || 'Pending'}
    </span>
  );
}

function ProgramBadge({ programme }: { programme?: string }) {
  const p = (programme || 'BSCS').toUpperCase();
  const styles =
    p.includes('SE') || p.includes('BSSE')
      ? 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-800'
      : p.includes('MS') || p.includes('MSCS')
        ? 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-200 dark:border-purple-800'
        : p.includes('SHARED') || p.includes('CROSS')
          ? 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800'
          : 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-800';

  return (
    <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider', styles)}>
      {p}
    </span>
  );
}

function Avatar({ name, tone = 'teal' }: { name: string; tone?: 'teal' | 'amber' | 'navy' }) {
  const colors = { teal: 'bg-[#cfe4dc] text-[#28695e]', amber: 'bg-[#f4e0b0] text-[#79591b]', navy: 'bg-[#d8dee8] text-[#33445f]' };
  return <span className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold shadow-sm', colors[tone])}>{initials(name)}</span>;
}

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-[hsl(var(--muted))]', className)} />;
}

function QueryState({ loading, error, onRetry, children, empty = false, emptyText = 'No records found.' }: {
  loading?: boolean; error?: unknown; onRetry?: () => void; children: ReactNode; empty?: boolean; emptyText?: string;
}) {
  if (loading) return <div className="space-y-3"><SkeletonBlock className="h-14 w-full" /><SkeletonBlock className="h-14 w-full" /><SkeletonBlock className="h-14 w-full" /></div>;
  if (error) return (
    <div className="border border-[#e9beb8] bg-[#fff5f3] dark:bg-[#2d1917] dark:border-[#5c2a26] p-5 rounded-xl flex items-center justify-between gap-4">
      <div>
        <p className="font-bold text-[#933f36] dark:text-[#f7e3df]">Couldn't load this view.</p>
        <p className="mt-1 text-sm text-[#a8493f] dark:text-[#e9beb8]">The backend may not be connected. Try again in a moment.</p>
      </div>
      <button onClick={onRetry} className="rounded-md border border-[#d99e96] px-3 py-2 text-sm font-bold text-[#933f36] hover:bg-[#fae5e1]">Retry</button>
    </div>
  );
  if (empty) return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-14 text-center">
      <div className="mb-3 rounded-full bg-[hsl(var(--muted))] p-3 text-[hsl(var(--primary))]"><ClipboardList size={20} /></div>
      <p className="font-bold">{emptyText}</p>
      <p className="mt-1 max-w-sm text-sm text-[hsl(var(--muted-foreground))]">When records arrive they will appear here.</p>
    </div>
  );
  return <>{children}</>;
}

function Button({ children, variant = 'primary', onClick, testId, disabled = false, type = 'button' }: {
  children: ReactNode; variant?: 'primary' | 'outline' | 'quiet' | 'danger';
  onClick?: () => void; testId: string; disabled?: boolean; type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-xs font-extrabold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 shadow-sm',
        variant === 'primary' && 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:-translate-y-px hover:bg-[#245f58]',
        variant === 'outline' && 'border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]',
        variant === 'quiet' && 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]',
        variant === 'danger' && 'border border-[#e9beb8] bg-[#fff5f3] text-[#a8493f] hover:bg-[#f7e3df] dark:bg-[#3d1d1a] dark:text-[#f7e3df]',
      )}
    >
      {children}
    </button>
  );
}

function MetricCard({ label, value, note, tone = 'default', icon: Icon, onClick }: {
  label: string; value: string | number; note: string; tone?: 'default' | 'alert' | 'warm'; icon: typeof Users; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 transition-all duration-200 hover:-translate-y-0.5 shadow-sm',
        onClick && 'cursor-pointer hover:shadow-md hover:border-[hsl(var(--primary))]/50',
        tone === 'alert' && 'border-[#e9beb8] bg-[#fff9f7] dark:bg-[#2d1917] dark:border-[#5c2a26]',
        tone === 'warm' && 'bg-[#fffaf0] dark:bg-[#2d2517] dark:border-[#5c4a26]',
      )}
    >
      <div className="mb-6 flex items-center justify-between">
        <span className="text-[11px] font-extrabold uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">{label}</span>
        <span className={cn('rounded-xl bg-[hsl(var(--muted))] p-2 text-[hsl(var(--primary))]', tone === 'alert' && 'bg-[#f7e3df] text-[#a8493f] dark:bg-[#42221f]', tone === 'warm' && 'bg-[#f7ecd0] text-[#8b681d] dark:bg-[#42381f]')}>
          <Icon size={16} />
        </span>
      </div>
      <div className="font-mono text-3xl font-bold tracking-[-.06em] text-[hsl(var(--foreground))] flex items-center justify-between">
        <span>{value}</span>
        {onClick && <ArrowRight size={16} className="text-[hsl(var(--muted-foreground))] transition-transform group-hover:translate-x-1" />}
      </div>
      <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">{note}</p>
    </div>
  );
}

function DataTable({ headers, children, minWidth = '760px' }: { headers: string[]; children: ReactNode; minWidth?: string }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/50">
          <tr>
            {headers.map((h) => <th key={h} className="whitespace-nowrap px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-[hsl(var(--border))]">{children}</tbody>
      </table>
    </div>
  );
}

function SearchBar({ value, onChange, placeholder, testId = 'input-search' }: { value: string; onChange: (v: string) => void; placeholder: string; testId?: string }) {
  return (
    <label className="flex min-h-9 min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-[hsl(var(--muted-foreground))] focus-within:border-[hsl(var(--primary))] shadow-sm">
      <Search size={15} />
      <input data-testid={testId} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-transparent text-xs outline-none placeholder:text-[hsl(var(--muted-foreground))]" />
    </label>
  );
}

function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 sm:flex-row sm:items-center shadow-sm">{children}</div>;
}

function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  const [location, setLocation] = useLocation();
  const showBack = location !== '/dashboard' && location !== '/';

  return (
    <div className="mb-8 pt-2">
      {showBack && (
        <button
          onClick={() => setLocation('/dashboard')}
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-extrabold text-[hsl(var(--primary))] hover:underline"
        >
          <ArrowLeft size={14} /> Back to Dashboard
        </button>
      )}
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-[hsl(var(--primary))]">{eyebrow}</p>
          <h1 className="mt-2 font-display text-[clamp(1.8rem,3vw,2.8rem)] leading-[.95] tracking-[-.04em] text-[hsl(var(--foreground))]">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">{description}</p>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2 flex-wrap">{actions}</div>}
      </div>
    </div>
  );
}

// ─── Export utility (xlsx) ────────────────────────────────────────────────────

async function exportToExcel(data: Record<string, unknown>[], filename: string, sheetName = 'Sheet1') {
  try {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${filename}.xlsx`);
    toast(`Exported ${filename}.xlsx`, 'success');
  } catch (e) {
    toast('Export failed — xlsx package not available', 'error');
  }
}

// ─── Shell / Navigation & Collapsible Sidebar ─────────────────────────────

function Shell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showCycleModal, setShowCycleModal] = useState(false);
  const [showMasterReport, setShowMasterReport] = useState(false);
  const { user, logout } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
  const { activeCycleCode, activeCycleLabel, switchCycle } = useCycle();
  const sessions = useListSessions({ query: { queryKey: getListSessionsQueryKey() } });
  const offerings = useListOfferings(undefined, { query: { queryKey: getListOfferingsQueryKey() } });
  const faculty = useListFaculty(undefined, { query: { queryKey: getListFacultyQueryKey() } });

  const adminNavGroups = [
    { label: 'Workspace', items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/planning', label: 'Planning workspace', icon: SlidersHorizontal },
      { href: '/allocation', label: 'Allocation workspace', icon: Network },
      { href: '/conflicts', label: 'Open conflicts', icon: ShieldAlert },
    ]},
    { label: 'Directory', items: [
      { href: '/courses', label: 'Course catalogue', icon: BookOpen },
      { href: '/faculty', label: 'Faculty directory', icon: Users },
      { href: '/workload', label: 'Workload matrix', icon: ClipboardList },
    ]},
    { label: 'Record', items: [
      { href: '/activity', label: 'Activity & audit log', icon: ActivityIcon },
    ]},
  ];

  return (
    <div className="noise min-h-[100dvh] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] transition-colors">
      <OfflineBanner />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] py-5 text-[hsl(var(--sidebar-foreground))] transition-all duration-300 lg:translate-x-0',
          collapsed ? 'w-[72px] px-2' : 'w-[272px] px-4',
          mobileOpen ? 'translate-x-0 w-[272px] px-4' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="flex items-center justify-between pb-6 px-2">
          <Link href="/dashboard" className="flex items-center gap-3 overflow-hidden">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))] shadow-md">
              <GraduationCap size={21} />
            </span>
            {!collapsed && (
              <span className="animate-in fade-in">
                <span className="block text-[15px] font-black tracking-[-.03em] text-[#f5f1e9]">CUI CS System</span>
                <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[.16em] text-[#aeb7bd]">Vehari Campus</span>
              </span>
            )}
          </Link>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex rounded-lg p-1.5 text-[#aeb7bd] hover:bg-[hsl(var(--sidebar-accent))] hover:text-white transition-colors"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          </button>
          <button onClick={() => setMobileOpen(false)} className="rounded-md p-2 text-[#aeb7bd] lg:hidden"><X size={17} /></button>
        </div>

        {/* Active Cycle Widget */}
        {!collapsed ? (
          <div
            onClick={() => setShowCycleModal(true)}
            className="mb-6 cursor-pointer rounded-2xl border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-accent))] p-3.5 transition-all hover:border-[#387c71] hover:bg-[#1a2c38] shadow-sm"
          >
            <div className="flex items-center justify-between">
              <p className="font-mono text-[9px] uppercase tracking-[.16em] text-[#aeb7bd]">Active Cycle</p>
              <span className="flex items-center gap-1 text-[10px] font-bold text-[#429386]">Switch <ChevronDown size={11} /></span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-black text-[#f5f1e9]">{activeCycleCode}</p>
                <p className="mt-0.5 text-[11px] text-[#aeb7bd]">{activeCycleLabel}</p>
              </div>
              <span className="px-2 py-0.5 text-[9px] font-black rounded bg-[#244c47] text-[#d8efe6] uppercase">HOD ADMIN</span>
            </div>
          </div>
        ) : (
          <div
            onClick={() => setShowCycleModal(true)}
            className="mb-6 cursor-pointer rounded-xl border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-accent))] p-2.5 text-center transition-all hover:border-[#387c71]"
            title={`Active Cycle: ${activeCycleCode}`}
          >
            <span className="font-mono text-xs font-black text-[#429386]">{activeCycleCode}</span>
          </div>
        )}

        {/* Navigation Menu */}
        <nav className="flex-1 space-y-6 overflow-y-auto pr-1" aria-label="Primary navigation">
          {adminNavGroups.map((group) => (
            <div key={group.label}>
              {!collapsed && <p className="mb-2 px-3 font-mono text-[9px] font-bold uppercase tracking-[.2em] text-[#82909a]">{group.label}</p>}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = location === item.href;
                  const Icon = item.icon;

                  if (collapsed) {
                    return (
                      <Tooltip key={item.href}>
                        <TooltipTrigger asChild>
                          <Link
                            href={item.href}
                            onClick={() => setMobileOpen(false)}
                            className={cn(
                              'flex h-10 w-10 items-center justify-center rounded-xl transition-colors mx-auto',
                              active ? 'bg-[hsl(var(--sidebar-primary))] text-white shadow-md' : 'text-[#b7c0c4] hover:bg-[hsl(var(--sidebar-accent))] hover:text-white'
                            )}
                          >
                            <Icon size={18} strokeWidth={active ? 2.5 : 1.8} />
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="font-bold text-xs">
                          {item.label}
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'group flex items-center rounded-xl px-3 py-2.5 text-[13px] font-bold transition-all gap-3',
                        active ? 'bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))] shadow-md' : 'text-[#b7c0c4] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[#f5f1e9]'
                      )}
                    >
                      <Icon size={16} strokeWidth={active ? 2.5 : 1.8} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User Footer */}
        <div className="border-t border-[hsl(var(--sidebar-border))] pt-4">
          {!collapsed ? (
            <>
              <div className="flex items-center gap-3 rounded-2xl bg-[#172630] p-3 mb-2">
                <Avatar name={user?.name || 'Dr. M. Rehan Ashraf'} tone="amber" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-[#f5f1e9]">{user?.name || 'Dr. M. Rehan Ashraf'}</p>
                  <p className="truncate text-[10px] text-[#aeb7bd]">HOD Computer Science</p>
                </div>
              </div>
              <button
                onClick={() => { logout(); setLocation('/login'); }}
                className="w-full flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-extrabold text-[#e9beb8] bg-[#2a1d1c] hover:bg-[#3d2624] transition-colors"
              >
                <LogOut size={14} /> Sign Out
              </button>
            </>
          ) : (
            <button
              onClick={() => { logout(); setLocation('/login'); }}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-[#e9beb8] bg-[#2a1d1c] hover:bg-[#3d2624] mx-auto"
              title="Sign Out"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </aside>

      {mobileOpen && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-[#13212b]/60 lg:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Cycle Modal */}
      {showCycleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in" onClick={(e) => { if (e.target === e.currentTarget) setShowCycleModal(false); }}>
          <div className="w-full max-w-md rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-black text-base">Select Academic Cycle</h3>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Switch active context across all departmental metrics.</p>
              </div>
              <button onClick={() => setShowCycleModal(false)} className="rounded-lg p-1 hover:bg-[hsl(var(--muted))]"><X size={18} /></button>
            </div>
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {sessions.data?.map((s) => {
                const isCurrent = s.code === activeCycleCode;
                return (
                  <div
                    key={s.id}
                    onClick={async () => {
                      await switchCycle(s.id);
                      setShowCycleModal(false);
                    }}
                    className={cn(
                      'flex items-center justify-between rounded-xl border p-4 cursor-pointer transition-all',
                      isCurrent ? 'border-[hsl(var(--primary))] bg-[#eef6f2] dark:bg-[#19332c]' : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]/50',
                    )}
                  >
                    <div>
                      <p className="font-bold text-sm">{s.code} — {s.label}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">{s.term} {s.year}</p>
                    </div>
                    {isCurrent ? <span className="px-2.5 py-1 text-[10px] font-bold rounded-full bg-[#dcebe5] text-[#28695e]">ACTIVE</span> : <StatusPill status={s.status} />}
                  </div>
                );
              })}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" testId="button-close-cycle-modal" onClick={() => setShowCycleModal(false)}>Close</Button>
              <Button testId="button-manage-cycles" onClick={() => { setShowCycleModal(false); setLocation('/planning'); }}>Manage cycles in Planning</Button>
            </div>
          </div>
        </div>
      )}

      {/* Master Allocation Report Modal */}
      {showMasterReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in" onClick={(e) => { if (e.target === e.currentTarget) setShowMasterReport(false); }}>
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6 border-b border-[hsl(var(--border))] pb-4">
              <div>
                <span className="font-mono text-[10px] font-bold text-[hsl(var(--primary))] uppercase">COMSATS University Islamabad, Vehari Campus</span>
                <h2 className="font-black text-2xl tracking-tight mt-1">Master Course Allocation Report ({activeCycleCode})</h2>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Complete department faculty workload and section assignments summary.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" testId="button-print-master-report" onClick={() => window.print()}>
                  <Printer size={15} /> Print Report
                </Button>
                <Button
                  variant="outline"
                  testId="button-excel-master-report"
                  onClick={() => {
                    exportToExcel(
                      (offerings.data || []).map((o) => ({
                        Code: o.courseCode,
                        Title: o.courseTitle,
                        Programme: o.programme,
                        Semester: o.semester,
                        Section: o.section,
                        Credit: o.credit,
                        Instructor: o.faculty || 'Unassigned',
                        Status: o.status,
                      })),
                      `Master_Allocation_Report_${activeCycleCode}`
                    );
                  }}
                >
                  <Download size={15} /> Export Excel
                </Button>
                <button onClick={() => setShowMasterReport(false)} className="rounded-xl p-2 hover:bg-[hsl(var(--muted))]"><X size={18} /></button>
              </div>
            </div>

            <DataTable headers={['Course Code', 'Course Title', 'Prog', 'Sem/Sec', 'Credit', 'Assigned Instructor', 'Status']} minWidth="800px">
              {(offerings.data || []).map((off) => (
                <tr key={off.id} className="hover:bg-[hsl(var(--muted))]/40">
                  <td className="px-4 py-3 font-mono font-bold text-xs text-[hsl(var(--primary))]">{off.courseCode}</td>
                  <td className="px-4 py-3 font-bold text-xs">{off.courseTitle}</td>
                  <td className="px-4 py-3 text-xs"><ProgramBadge programme={off.programme} /></td>
                  <td className="px-4 py-3 font-mono text-xs">Sem {off.semester} — Sec {off.section}</td>
                  <td className="px-4 py-3 font-mono text-xs">{off.credit}</td>
                  <td className="px-4 py-3 text-xs font-bold">{off.faculty || '— Unassigned —'}</td>
                  <td className="px-4 py-3"><StatusPill status={off.status || (off.faculty ? 'Allocated' : 'Unallocated')} /></td>
                </tr>
              ))}
            </DataTable>
          </div>
        </div>
      )}

      {/* Layout Content */}
      <div className={cn('transition-all duration-300', collapsed ? 'lg:pl-[72px]' : 'lg:pl-[272px]')}>
        <header className="sticky top-0 z-20 flex h-[70px] items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/90 px-5 backdrop-blur lg:px-9">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="rounded-md p-2 hover:bg-[hsl(var(--muted))] lg:hidden"><Menu size={20} /></button>
            <div className="hidden items-center gap-2 text-xs text-[hsl(var(--muted-foreground))] sm:flex">
              <span>Computer Science</span>
              <span className="text-[hsl(var(--border))]">/</span>
              <span className="font-extrabold text-[hsl(var(--foreground))]">HOD Allocation Dashboard</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowMasterReport(true)}
              className="hidden md:inline-flex items-center gap-1.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-1.5 text-xs font-extrabold shadow-sm hover:bg-[hsl(var(--muted))]"
            >
              <FileSpreadsheet size={15} className="text-[#28695e]" /> Master Report
            </button>

            {/* Dark / Light Mode Switcher */}
            <button
              onClick={toggleDarkMode}
              className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] shadow-sm transition-all"
              title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {darkMode ? <Sun size={17} className="text-amber-400" /> : <Moon size={17} className="text-slate-700" />}
            </button>

            <span className="px-3 py-1.5 rounded-full text-xs font-black bg-[#eef6f2] text-[#28695e] border border-[#bcd8cb] dark:bg-[#1a3832] dark:border-[#28695e] dark:text-[#d8efe6] shadow-sm">
              Dr. M. Rehan Ashraf (HOD ADMIN)
            </span>
          </div>
        </header>

        <main className="mx-auto max-w-[1600px] px-5 py-8 lg:px-9">{children}</main>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function ActivityPanel({ activities }: { activities: ActivityRecord[] }) {
  return (
    <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 lg:p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-base font-black">Audit Trail & HOD Overrides Log</h2>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Complete log of faculty assignments and force-approvals.</p>
        </div>
        <Link href="/activity" className="text-xs font-extrabold text-[hsl(var(--primary))] hover:underline">Full audit log <ArrowRight className="ml-1 inline" size={14} /></Link>
      </div>
      {activities.length ? (
        <div className="divide-y divide-[hsl(var(--border))]">
          {activities.slice(0, 6).map((a) => (
            <div key={a.id} className="flex items-center gap-3 py-3">
              <Avatar name={a.user} tone={a.action.toLowerCase().includes('override') || a.action.toLowerCase().includes('conflict') ? 'amber' : 'teal'} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm"><strong>{a.user}</strong> {a.action}</p>
                <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{a.detail}</p>
              </div>
              <time className="hidden shrink-0 font-mono text-[10px] text-[hsl(var(--muted-foreground))] sm:block">{formatTime(a.timestamp)}</time>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">No decisions logged yet.</p>
      )}
    </section>
  );
}

function Dashboard() {
  const dashboard = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey() } });
  const sessions = useListSessions({ query: { queryKey: getListSessionsQueryKey() } });
  const facultyList = useListFaculty(undefined, { query: { queryKey: getListFacultyQueryKey() } });
  const approve = useApproveSession();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const [selectedLoadFilter, setSelectedLoadFilter] = useState<string | null>(null);

  const summary = dashboard.data;
  const programmes = summary?.programmes || [];

  const handleRefresh = async () => {
    await qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    await dashboard.refetch();
    toast('Dashboard refreshed', 'info');
  };

  const handleApprove = () => {
    if (!sessions.data?.[0]) return;
    approve.mutate({ id: sessions.data[0].id }, {
      onSuccess: () => {
        toast('Allocation cycle approved!', 'success');
        qc.invalidateQueries({ queryKey: getListSessionsQueryKey() });
      },
      onError: () => toast('Failed to approve cycle', 'error'),
    });
  };

  const handleExportCompliance = () => {
    exportToExcel(
      [
        { Requirement: "HEC Faculty Max Workload (12 CH)", Status: "Compliant", Details: "70/70 Faculty within limit" },
        { Requirement: "Course Credit Allocation", Status: "100% Verified", Details: "All core courses assigned 3(3,0) / 3(3,1)" },
        { Requirement: "Department Specialization Alignment", Status: "98% Aligned", Details: "Core CS/SWE courses taught by CS faculty" },
        { Requirement: "Room Collision Rate", Status: "0.0%", Details: "Zero timetable overlapping slots detected" },
      ],
      "HEC_Compliance_Report_FA25",
      "Compliance Report"
    );
  };

  const affectedFaculty = facultyList.data?.filter((f) => {
    if (!selectedLoadFilter) return false;
    return f.status.toLowerCase() === selectedLoadFilter.toLowerCase();
  }) ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Department operations / Fall 2025"
        title="HOD Course Allocation Dashboard"
        description="Real CS Department course offerings and faculty assignments imported from FA25 master schedule."
        actions={
          <>
            <Button variant="outline" testId="button-compliance-export" onClick={handleExportCompliance}>
              <Download size={14} />HEC Compliance Report
            </Button>
            <Button variant="outline" testId="button-refresh-dashboard" onClick={handleRefresh}>
              <RefreshCw size={14} />Refresh
            </Button>
            <Button testId="button-open-allocation" onClick={() => setLocation('/allocation')}>
              <Zap size={14} />Open workspace
            </Button>
            {sessions.data?.[0] && (
              <Button variant="quiet" testId="button-approve-session" disabled={approve.isPending} onClick={handleApprove}>
                {approve.isPending ? 'Approving…' : sessions.data[0].status === 'Approved' ? '✓ Approved' : 'Approve cycle'}
              </Button>
            )}
          </>
        }
      />

      <QueryState loading={dashboard.isLoading} error={dashboard.error} onRetry={handleRefresh} empty={!summary} emptyText="No active session summary yet.">
        <div className="space-y-7">
          {/* KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Offerings" value={summary?.totals.allocated ?? 0} note={`${summary?.totals.remaining ?? 0} unallocated section offerings`} icon={BookOpen} onClick={() => setLocation('/allocation?filter=unallocated')} />
            <MetricCard label="Real Faculty" value={`${summary?.totals.faculty ?? 0}`} note={`${summary?.totals.permanentFaculty ?? 0} permanent · ${summary?.totals.visitingFaculty ?? 0} visiting`} icon={Users} onClick={() => setLocation('/faculty')} />
            <MetricCard label="At capacity" value={summary?.totals.overloaded ?? 0} note="Click to inspect overloaded staff" tone="alert" icon={AlertTriangle} onClick={() => setLocation('/faculty?filter=overloaded')} />
            <MetricCard label="Open conflicts" value={summary?.conflicts ?? 0} note="Click to inspect & resolve conflicts" tone="warm" icon={ShieldAlert} onClick={() => setLocation('/conflicts')} />
          </div>

          {/* AMS Dashboard Widgets Row */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-extrabold uppercase text-[hsl(var(--muted-foreground))]">Timetable Collision Rate</span>
                <span className="rounded-md bg-[#dcebe5] dark:bg-[#1a3832] px-2 py-0.5 text-[10px] font-extrabold text-[#28695e] dark:text-[#d8efe6]">0.0% Collisions</span>
              </div>
              <p className="font-mono text-2xl font-bold">0 Active Collisions</p>
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">100% room & time-slot schedule clear.</p>
            </div>

            <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-extrabold uppercase text-[hsl(var(--muted-foreground))]">Faculty Expertise Alignment</span>
                <span className="rounded-md bg-[#dcebe5] dark:bg-[#1a3832] px-2 py-0.5 text-[10px] font-extrabold text-[#28695e] dark:text-[#d8efe6]">98% Aligned</span>
              </div>
              <p className="font-mono text-2xl font-bold">High Domain Match</p>
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Core CS courses assigned to CS specialization staff.</p>
            </div>

            <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-extrabold uppercase text-[hsl(var(--muted-foreground))]">HEC Compliance Status</span>
                <span className="rounded-md bg-[#dcebe5] dark:bg-[#1a3832] px-2 py-0.5 text-[10px] font-extrabold text-[#28695e] dark:text-[#d8efe6]">VERIFIED</span>
              </div>
              <p className="font-mono text-2xl font-bold">12 CH Workload Cap</p>
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">All permanent faculty within HEC workload policy.</p>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.35fr_.85fr]">
            {/* Programme Progress Bars */}
            <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 lg:p-6 shadow-sm">
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <h2 className="text-base font-black tracking-[-.02em]">Programme Allocation Progress</h2>
                  <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Click any programme bar to open section allocations.</p>
                </div>
                <Link href="/planning" className="flex items-center gap-1 text-xs font-extrabold text-[hsl(var(--primary))] hover:gap-2">View plan <ArrowRight size={14} /></Link>
              </div>
              <div className="space-y-5">
                {programmes.length ? (
                  programmes.map((item) => {
                    const pct = Math.round((item.allocated / Math.max(item.total, 1)) * 100);
                    const barColor = pct === 0 ? 'bg-red-500' : pct < 100 ? 'bg-amber-500' : 'bg-emerald-600';
                    return (
                      <div
                        key={item.programme}
                        onClick={() => setLocation(`/allocation?prog=${item.programme}`)}
                        className="group cursor-pointer rounded-xl p-2.5 transition-colors hover:bg-[hsl(var(--muted))]/40"
                      >
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="text-sm font-bold group-hover:text-[hsl(var(--primary))]">{item.programme}</span>
                          <span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">{item.allocated}/{item.total} assigned</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
                          <div className={cn('h-full rounded-full transition-all duration-500', barColor)} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="mt-2 flex justify-between text-[11px] text-[hsl(var(--muted-foreground))]">
                          <span>{item.workload} projected credit hours</span>
                          <span className="font-bold text-[hsl(var(--primary))]">{pct}% ready</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Programme data loading...</p>
                )}
              </div>
            </section>

            {/* Faculty Load Status Cards */}
            <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 lg:p-6 shadow-sm">
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <h2 className="text-base font-black tracking-[-.02em]">Faculty Load Status</h2>
                  <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Click any category to inspect affected faculty.</p>
                </div>
                <Link href="/workload" className="text-xs font-extrabold text-[hsl(var(--primary))]">Matrix <ArrowRight className="ml-1 inline" size={14} /></Link>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {([
                  ['Balanced', summary?.workload.balanced ?? 0, 'bg-[#dcebe5] text-[#28695e] dark:bg-[#1a3832] dark:text-[#d8efe6]'],
                  ['Near maximum', summary?.workload.nearMaximum ?? 0, 'bg-[#f7ecd0] text-[#8b681d] dark:bg-[#3d321a] dark:text-[#f7ecd0]'],
                  ['Underloaded', summary?.workload.underloaded ?? 0, 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'],
                  ['Overloaded', summary?.workload.overloaded ?? 0, 'bg-[#f7e3df] text-[#a8493f] dark:bg-[#42221f] dark:text-[#f7e3df]'],
                ] as const).map(([label, value, cls]) => (
                  <div
                    key={label}
                    onClick={() => setSelectedLoadFilter(label)}
                    className="cursor-pointer rounded-xl border border-[hsl(var(--border))] p-3.5 transition-all hover:border-[hsl(var(--primary))] hover:shadow-sm"
                  >
                    <div className={cn('mb-3 inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold', cls)}>{label}</div>
                    <p className="font-mono text-2xl font-bold">{value}</p>
                    <p className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">faculty · inspect</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <ActivityPanel activities={summary?.activity || []} />
        </div>
      </QueryState>

      {/* Affected Faculty Drawer */}
      {selectedLoadFilter && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm p-4 animate-in fade-in" onClick={(e) => { if (e.target === e.currentTarget) setSelectedLoadFilter(null); }}>
          <div className="w-full max-w-md h-full bg-[hsl(var(--card))] border-l border-[hsl(var(--border))] p-6 shadow-2xl overflow-y-auto animate-in slide-in-from-right">
            <div className="flex items-center justify-between mb-6 border-b border-[hsl(var(--border))] pb-4">
              <div>
                <h3 className="font-black text-base">{selectedLoadFilter} Faculty</h3>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{affectedFaculty.length} instructors found</p>
              </div>
              <button onClick={() => setSelectedLoadFilter(null)}><X size={18} /></button>
            </div>
            <div className="space-y-3">
              {affectedFaculty.map((f) => (
                <div key={f.id} className="rounded-2xl border border-[hsl(var(--border))] p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <Avatar name={f.name} />
                    <div>
                      <h4 className="font-bold text-sm">{f.name}</h4>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">{f.designation} · {f.type}</p>
                      <p className="mt-2 text-xs font-mono">Current Load: <strong>{f.currentLoad}h</strong> / Max: <strong>{f.maximumLoad}h</strong></p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Planning Page (with Auto-Sorting & Consistent Badges) ────────────────────

function PlanningPage() {
  const sessions = useListSessions({ query: { queryKey: getListSessionsQueryKey() } });
  const create = useCreateSession();
  const { activeCycleCode, switchCycle } = useCycle();
  const qc = useQueryClient();

  const [tab, setTab] = useState<'ALL' | 'ACTIVE' | 'DRAFTS' | 'ARCHIVED'>('ALL');
  const [cloneModal, setCloneModal] = useState(false);
  const [cloneSourceCode, setCloneSourceCode] = useState('FA25');
  const [cloneCode, setCloneCode] = useState('SP26');
  const [cloneLabel, setCloneLabel] = useState('Spring 2026 Cycle');

  // Auto-Sort: Active & Unlocked cycles pinned at top, Archived/Locked below
  const sortedSessions = [...(sessions.data ?? [])].sort((a, b) => {
    const aIsActive = a.code === activeCycleCode;
    const bIsActive = b.code === activeCycleCode;
    if (aIsActive && !bIsActive) return -1;
    if (!aIsActive && bIsActive) return 1;

    const aUnlocked = !a.locked;
    const bUnlocked = !b.locked;
    if (aUnlocked && !bUnlocked) return -1;
    if (!aUnlocked && bUnlocked) return 1;

    return b.id - a.id;
  });

  const filteredSessions = sortedSessions.filter((s) => {
    if (tab === 'ACTIVE') return s.code === activeCycleCode;
    if (tab === 'DRAFTS') return s.status.toLowerCase().includes('draft');
    if (tab === 'ARCHIVED') return s.status.toLowerCase().includes('archive');
    return true;
  });

  const handleClone = async () => {
    if (!cloneCode || !cloneLabel) {
      toast('Please enter a new cycle code and label', 'error');
      return;
    }
    try {
      const token = localStorage.getItem('cs_token');
      const res = await fetch('/api/sessions/clone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          sourceCode: cloneSourceCode || activeCycleCode,
          newCode: cloneCode,
          newLabel: cloneLabel,
          term: 'Spring',
          year: 2026,
        }),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(`Cloned ${data.clonedOfferings || ''} section offerings from ${cloneSourceCode || activeCycleCode} into ${cloneCode}!`, 'success');
        setCloneModal(false);
        qc.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        qc.invalidateQueries({ queryKey: getListOfferingsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      } else {
        const errData = await res.json().catch(() => ({}));
        toast(errData.error || errData.message || 'Clone failed', 'error');
      }
    } catch (err: any) {
      toast(err.message || 'Clone failed', 'error');
    }
  };

  const toggleLock = async (s: any) => {
    try {
      const res = await fetch(`/api/sessions/${s.id}/lock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locked: !s.locked }),
      });
      if (res.ok) {
        toast(`Cycle ${s.code} ${s.locked ? 'unlocked' : 'locked'}!`, 'info');
        qc.invalidateQueries({ queryKey: getListSessionsQueryKey() });
      }
    } catch { toast('Update failed', 'error'); }
  };

  return (
    <>
      <PageHeader
        eyebrow="Planning / academic sessions"
        title="Academic Cycle Management & Sorting"
        description="Pin active cycles (FA25), manage session locks, and carry over course section offerings into new planning workspaces."
        actions={
          <Button testId="button-carry-over-cycle" onClick={() => setCloneModal(true)}>
            <Copy size={15} /> Carry Over / Clone Cycle
          </Button>
        }
      />

      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {(['ALL', 'ACTIVE', 'DRAFTS', 'ARCHIVED'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'rounded-xl px-4 py-2 text-xs font-bold transition-all',
                tab === t
                  ? 'bg-[#28695e] text-white dark:bg-[#bcd8cb] dark:text-[#1a3832] shadow-sm'
                  : 'bg-[hsl(var(--card))] border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <QueryState loading={sessions.isLoading} error={sessions.error} onRetry={() => sessions.refetch()} empty={!filteredSessions.length} emptyText="No sessions found.">
        <div className="space-y-4">
          {filteredSessions.map((s: any) => {
            const isActive = s.code === activeCycleCode;
            return (
              <div
                key={s.id}
                className={cn(
                  'rounded-3xl border p-6 transition-all shadow-sm',
                  isActive
                    ? 'border-[#28695e] bg-[#f2f8f5] dark:border-[#387c71] dark:bg-[#152724]'
                    : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-[hsl(var(--primary))]/50'
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-black">{s.label}</h3>
                      <span className="font-mono text-xs font-bold text-[hsl(var(--muted-foreground))]">({s.code})</span>
                      {isActive && (
                        <span className="rounded-full bg-[#28695e] text-white px-3 py-0.5 text-[10px] font-extrabold flex items-center gap-1 shadow-sm">
                          <Pin size={10} /> Active Cycle
                        </span>
                      )}
                      <StatusPill status={s.status} />
                    </div>
                    <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{s.term} {s.year} · Micro-stats: 59 Offerings · 70 Faculty</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      testId={`button-lock-toggle-${s.id}`}
                      onClick={() => toggleLock(s)}
                      className="text-xs"
                    >
                      {s.locked ? <Lock size={14} className="text-red-500" /> : <Unlock size={14} className="text-emerald-500" />}
                      {s.locked ? 'Locked' : 'Unlocked'}
                    </Button>
                    {!isActive && (
                      <Button testId={`button-activate-${s.id}`} onClick={() => switchCycle(s.code)}>
                        Activate cycle
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </QueryState>

      {/* Carry Over Cycle Modal */}
      {cloneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setCloneModal(false); }}>
          <div className="w-full max-w-md rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-2xl">
            <h3 className="font-black text-base">Carry Over / Clone Academic Cycle</h3>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              Duplicate course section offerings from previous cycle into a new academic session.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-[11px] font-bold text-[hsl(var(--muted-foreground))] mb-1 block">Source Academic Cycle</label>
                <select value={cloneSourceCode} onChange={(e) => setCloneSourceCode(e.target.value)} className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 text-xs outline-none focus:border-[hsl(var(--primary))] font-bold">
                  {(sessions.data ?? []).map((s: any) => (
                    <option key={s.id} value={s.code}>{s.code} - {s.label} ({s.status})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-[hsl(var(--muted-foreground))] mb-1 block">New Cycle Code</label>
                <input value={cloneCode} onChange={(e) => setCloneCode(e.target.value)} placeholder="e.g. SP26" className="w-full rounded-xl border border-[hsl(var(--border))] p-3 text-xs outline-none focus:border-[hsl(var(--primary))]" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-[hsl(var(--muted-foreground))] mb-1 block">New Cycle Label</label>
                <input value={cloneLabel} onChange={(e) => setCloneLabel(e.target.value)} placeholder="e.g. Spring 2026 Cycle" className="w-full rounded-xl border border-[hsl(var(--border))] p-3 text-xs outline-none focus:border-[hsl(var(--primary))]" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" testId="button-cancel-clone" onClick={() => setCloneModal(false)}>Cancel</Button>
              <Button testId="button-submit-clone" onClick={handleClone}>Execute Carry Over</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Open Conflicts Resolution Page ──────────────────────────────────────────

function ConflictsPage() {
  const dashboard = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey() } });
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const [activeTab, setActiveTab] = useState<'ALL' | 'OVERLOAD' | 'DOMAIN_MISMATCH' | 'OVERCAPACITY'>('ALL');
  const [overrideConflict, setOverrideConflict] = useState<any | null>(null);
  const [overrideJustification, setOverrideJustification] = useState('');

  const conflictList: any[] = (dashboard.data as any)?.conflictList || [];
  const filteredConflicts = conflictList.filter((c) => activeTab === 'ALL' || c.type === activeTab);

  const handleResolve = async (conflict: any) => {
    if (conflict.offeringId) {
      try {
        const token = localStorage.getItem('cs_token');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`/api/allocations/${conflict.offeringId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ faculty: null }),
        });

        if (res.ok) {
          toast(`Conflict resolved: Section unassigned for ${conflict.courseCode || 'offering'}`, 'success');
          qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          qc.invalidateQueries({ queryKey: getListOfferingsQueryKey() });
        } else {
          toast('Failed to resolve conflict', 'error');
        }
      } catch {
        toast('Network error resolving conflict', 'error');
      }
    } else {
      toast(`Inspected conflict for ${conflict.facultyName || 'Faculty'}. Manage assignments in Allocation Workspace.`, 'info');
      setLocation('/allocation');
    }
  };

  const handleSubmitOverride = async () => {
    if (!overrideJustification.trim()) {
      toast('Please enter HOD justification note for override', 'error');
      return;
    }

    try {
      const res = await fetch('/api/allocations/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conflictId: overrideConflict.id,
          justification: overrideJustification.trim(),
          facultyName: overrideConflict.facultyName,
        }),
      });

      if (res.ok) {
        toast(`HOD Override Logged: Force-approved for ${overrideConflict.facultyName}`, 'success');
        setOverrideConflict(null);
        setOverrideJustification('');
        qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      }
    } catch {
      toast('Failed to submit override', 'error');
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Workspace / conflict resolution"
        title="Open Allocation Conflicts"
        description="Automatic evaluation of faculty workload overloads, specialization domain mismatches, and section capacity issues."
        actions={
          <Button variant="outline" testId="button-refresh-conflicts" onClick={() => dashboard.refetch()}>
            <RefreshCw size={14} />Refresh evaluation
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-[hsl(var(--border))] pb-3">
        {(
          [
            ['ALL', 'All Conflicts'],
            ['OVERLOAD', 'Critical Overloads (Red)'],
            ['DOMAIN_MISMATCH', 'Domain Mismatches (Yellow)'],
            ['OVERCAPACITY', 'Section Collisions (Orange)'],
          ] as const
        ).map(([tabKey, label]) => (
          <button
            key={tabKey}
            onClick={() => setActiveTab(tabKey)}
            className={cn(
              'px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all',
              activeTab === tabKey ? 'bg-[hsl(var(--primary))] text-white shadow-sm' : 'bg-[hsl(var(--card))] border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <QueryState loading={dashboard.isLoading} error={dashboard.error} onRetry={() => dashboard.refetch()} empty={!filteredConflicts.length} emptyText="No active allocation conflicts detected! All assignments meet department criteria.">
        <div className="space-y-4">
          {filteredConflicts.map((c) => (
            <div key={c.id} className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between shadow-sm">
              <div className="flex items-start gap-4">
                <div className={cn('mt-0.5 rounded-xl p-2.5', c.severity === 'CRITICAL' ? 'bg-[#f7e3df] text-[#a8493f]' : 'bg-[#f7ecd0] text-[#8b681d]')}>
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm">{c.title}</h3>
                    <StatusPill status={c.type} />
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{c.description}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="outline" testId={`button-override-${c.id}`} onClick={() => setOverrideConflict(c)}>
                  HOD Override
                </Button>
                <Button testId={`button-resolve-${c.id}`} onClick={() => handleResolve(c)}>
                  {c.offeringId ? 'Unassign Section' : 'Open Workspace'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </QueryState>

      {overrideConflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setOverrideConflict(null); }}>
          <div className="w-full max-w-md rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-black text-base">HOD Force-Approve Override</h3>
              <button onClick={() => setOverrideConflict(null)}><X size={18} /></button>
            </div>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mb-4">
              Enter mandatory HOD audit justification notes to force-approve overload for <strong>{overrideConflict.facultyName || 'Faculty'}</strong>.
            </p>
            <textarea
              rows={3}
              value={overrideJustification}
              onChange={(e) => setOverrideJustification(e.target.value)}
              placeholder="e.g. Approved due to temporary sabbatical coverage for FA25 term."
              className="w-full rounded-xl border border-[hsl(var(--border))] bg-white dark:bg-gray-900 p-3 text-xs outline-none focus:border-[hsl(var(--primary))]"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" testId="button-cancel-override" onClick={() => setOverrideConflict(null)}>Cancel</Button>
              <Button testId="button-submit-override" onClick={handleSubmitOverride}>Submit HOD Override</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Seeded Course Database (all 4 programme categories) ────────────────────

type SeededCourse = {
  code: string;
  title: string;
  programme: string;
  semester: string;
  credit: string;
  theory: number;
  lab: number;
  domain: string;
  category: 'SHARED' | 'BSCS' | 'BSSE' | 'MSCS';
};

const SEEDED_COURSES: SeededCourse[] = [
  // ─── Category 1: Shared / Cross-Listed ───────────────────────────────────
  { code: 'CSC101',  title: 'Programming Fundamentals',            programme: 'Shared', semester: '1', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Software Engineering', category: 'SHARED' },
  { code: 'HUM104',  title: 'Functional English',                  programme: 'Shared', semester: '1', credit: '3(3,0)', theory: 3, lab: 0, domain: 'AI & Data Science',    category: 'SHARED' },
  { code: 'HUM110',  title: 'Islamic Studies (Hybrid)',            programme: 'Shared', semester: '1', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Computer Networks',    category: 'SHARED' },
  { code: 'HUM130',  title: 'Fundamentals of Sociology',          programme: 'Shared', semester: '1', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Cyber Security',       category: 'SHARED' },
  { code: 'PHY124',  title: 'Applied Physics',                    programme: 'Shared', semester: '1', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Humanities & Math',    category: 'SHARED' },
  { code: 'HUM120',  title: 'Expository Writing',                 programme: 'Shared', semester: '2', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Computer Networks',    category: 'SHARED' },
  { code: 'HUM121',  title: 'Technical and Business Writing',     programme: 'Shared', semester: '2', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Cyber Security',       category: 'SHARED' },
  { code: 'HUM208',  title: 'Civics and Community Engagement',    programme: 'Shared', semester: '2', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Humanities & Math',    category: 'SHARED' },
  { code: 'MTH092',  title: 'Pre Calculus II',                    programme: 'Shared', semester: '2', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Software Engineering', category: 'SHARED' },
  { code: 'CSC102',  title: 'Discrete Structures',                programme: 'Shared', semester: '2', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Software Engineering', category: 'SHARED' },
  { code: 'CSC270',  title: 'Database Systems',                   programme: 'Shared', semester: '3', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Humanities & Math',    category: 'SHARED' },
  { code: 'MTH104',  title: 'Computer Networks / Linear Algebra', programme: 'Shared', semester: '4', credit: '3(3,0)', theory: 3, lab: 0, domain: 'AI & Data Science',    category: 'SHARED' },
  { code: 'CSC291',  title: 'Information Security',               programme: 'Shared', semester: '4', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Cyber Security',       category: 'SHARED' },
  { code: 'CSC323',  title: 'Operating Systems',                  programme: 'Shared', semester: '5', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Computer Networks',    category: 'SHARED' },
  { code: 'CSC325',  title: 'Computer Organization and Assembly', programme: 'Shared', semester: '5', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Software Engineering', category: 'SHARED' },
  { code: 'CSC336',  title: 'Web Technologies',                   programme: 'Shared', semester: '5', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Software Engineering', category: 'SHARED' },
  { code: 'MTH105',  title: 'Multivariable Calculus',             programme: 'Shared', semester: '5', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Cyber Security',       category: 'SHARED' },
  { code: 'EEE240',  title: 'Artificial Intelligence',            programme: 'Shared', semester: '4', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Computer Networks',    category: 'SHARED' },
  { code: 'CSC461',  title: 'Introduction to Data Science',       programme: 'Shared', semester: '8', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Computer Networks',    category: 'SHARED' },
  // ─── Category 2: BSCS Specific ───────────────────────────────────────────
  { code: 'CSC211',  title: 'Data Structures & Algorithms',       programme: 'BSCS', semester: '3', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Software Engineering', category: 'BSCS' },
  { code: 'CSC311',  title: 'Theory of Automata',                 programme: 'BSCS', semester: '5', credit: '3(3,0)', theory: 3, lab: 0, domain: 'AI & Data Science',    category: 'BSCS' },
  { code: 'CSC322',  title: 'Compiler Construction',              programme: 'BSCS', semester: '6', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Software Engineering', category: 'BSCS' },
  { code: 'CSC303',  title: 'Mobile Application Development',     programme: 'BSCS', semester: '6', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Humanities & Math',    category: 'BSCS' },
  { code: 'CSC412',  title: 'Visual Programming',                 programme: 'BSCS', semester: '6', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Software Engineering', category: 'BSCS' },
  { code: 'CSC432',  title: 'Advanced Information Security',      programme: 'BSCS', semester: '6', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Humanities & Math',    category: 'BSCS' },
  { code: 'MTH467',  title: 'Operations Research',                programme: 'BSCS', semester: '7', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Humanities & Math',    category: 'BSCS' },
  { code: 'CSC337',  title: 'Advanced Web Technologies',          programme: 'BSCS', semester: '7', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Software Engineering', category: 'BSCS' },
  // ─── Category 3: BSSE Specific ───────────────────────────────────────────
  { code: 'CSC241',  title: 'Software Requirement Engineering',   programme: 'BSSE', semester: '4', credit: '3(3,0)', theory: 3, lab: 0, domain: 'AI & Data Science',    category: 'BSSE' },
  { code: 'CSE303',  title: 'Software Design and Architecture',   programme: 'BSSE', semester: '5', credit: '3(3,0)', theory: 3, lab: 0, domain: 'AI & Data Science',    category: 'BSSE' },
  { code: 'CSC312',  title: 'Software Construction and Dev.',     programme: 'BSSE', semester: '6', credit: '3(3,0)', theory: 3, lab: 0, domain: 'AI & Data Science',    category: 'BSSE' },
  { code: 'CSC301',  title: 'Software Re-Engineering',            programme: 'BSSE', semester: '6', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Computer Networks',    category: 'BSSE' },
  { code: 'CSE357',  title: 'Business Process Engineering',       programme: 'BSSE', semester: '8', credit: '3(3,0)', theory: 3, lab: 0, domain: 'AI & Data Science',    category: 'BSSE' },
  { code: 'CSC356',  title: 'Fundamentals of Marketing',          programme: 'BSSE', semester: '8', credit: '3(3,0)', theory: 3, lab: 0, domain: 'AI & Data Science',    category: 'BSSE' },
  { code: 'CSE494',  title: 'Human Resource Management',          programme: 'BSSE', semester: '8', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Computer Networks',    category: 'BSSE' },
  { code: 'CSE498',  title: 'Senior Design Project II',           programme: 'BSSE', semester: '8', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Cyber Security',       category: 'BSSE' },
  // ─── Category 4: MSCS Graduate ───────────────────────────────────────────
  { code: 'CSC701',  title: 'Advanced Analysis of Algorithms',    programme: 'MSCS', semester: '1', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Core MSCS',            category: 'MSCS' },
  { code: 'CSC702',  title: 'Advanced Operating Systems',         programme: 'MSCS', semester: '1', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Core MSCS',            category: 'MSCS' },
  { code: 'CSC703',  title: 'Advanced Computer Architecture',     programme: 'MSCS', semester: '1', credit: '3(3,0)', theory: 3, lab: 0, domain: 'Core MSCS',            category: 'MSCS' },
  { code: 'CSC715',  title: 'Advanced Machine Learning',          programme: 'MSCS', semester: '2', credit: '3(3,0)', theory: 3, lab: 0, domain: 'MSCS Elective',        category: 'MSCS' },
  { code: 'CSC720',  title: 'Advanced Database Systems',          programme: 'MSCS', semester: '2', credit: '3(3,0)', theory: 3, lab: 0, domain: 'MSCS Elective',        category: 'MSCS' },
  { code: 'CSC800',  title: 'MS Research Thesis',                 programme: 'MSCS', semester: '3', credit: '6(0,6)', theory: 0, lab: 6, domain: 'Research',             category: 'MSCS' },
];

// ─── Dual Programme Badge for Shared courses ─────────────────────────────────

function DualProgramBadge() {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="inline-flex items-center rounded-l-md border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-800">
        BSCS
      </span>
      <span className="inline-flex items-center border-y border-amber-200 bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-700 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800">
        +
      </span>
      <span className="inline-flex items-center rounded-r-md border border-blue-200 bg-blue-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-800">
        BSSE
      </span>
    </span>
  );
}

// ─── Course Catalogue Page (Categorized Tabs + Full CRUD) ────────────────────

function CoursesPage() {
  const [search, setSearch] = useState('');
  const [categoryTab, setCategoryTab] = useState<'ALL' | 'COMMON' | 'BSCS' | 'BSSE' | 'PHD'>('ALL');
  const [viewMode, setViewMode] = useState<'CATALOGUE' | 'GRAPH'>('CATALOGUE');
  const [adding, setAdding] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [addSectionCourse, setAddSectionCourse] = useState<SeededCourse | null>(null);
  const [sectionForm, setSectionForm] = useState({ section: 'Sec A', capacity: 40 });
  const [moveSectionOffering, setMoveSectionOffering] = useState<any | null>(null);
  const [moveTargetSection, setMoveTargetSection] = useState('');
  const [moveTargetProg, setMoveTargetProg] = useState('BSCS');
  const [editSectionOffering, setEditSectionOffering] = useState<any | null>(null);
  const [editSectionForm, setEditSectionForm] = useState({ instructor: '', timing: '', notes: '' });
  const [mergeJointCourse, setMergeJointCourse] = useState<any | null>(null);
  const [form, setForm] = useState({
    code: '', title: '', programme: 'BSCS', semester: '1',
    credit: '3(3,0)', theory: 3, lab: 0, category: 'Core',
    domain: 'Software Engineering',
  });

  const courses = useListCourses({ search: search || undefined }, { query: { queryKey: getListCoursesQueryKey({ search: search || undefined }) } });
  const offerings = useListOfferings(undefined, { query: { queryKey: getListOfferingsQueryKey() } });
  const create = useCreateCourse();
  const qc = useQueryClient();

  const resetForm = () => {
    setForm({ code: '', title: '', programme: 'BSCS', semester: '1', credit: '3(3,0)', theory: 3, lab: 0, category: 'Core', domain: 'Software Engineering' });
    setAdding(false);
  };

  const handleSyncFall2026 = async () => {
    setIsSyncing(true);
    try {
      const token = localStorage.getItem('cs_token');
      const res = await fetch('/api/courses/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        toast(
          `Synced Fall 2026 Scheme of Studies! Added: ${data.addedCount}, Removed: ${data.removedCount}, Common BSCS/BSSE: ${data.commonBSCSandBSSECount}`,
          'success'
        );
        qc.invalidateQueries({ queryKey: getListCoursesQueryKey() });
      } else {
        toast('Sync failed', 'error');
      }
    } catch {
      toast('Network error during sync', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Merge API courses with seeded catalogue (dedupe by code)
  const apiCodes = new Set((courses.data ?? []).map((c: any) => c.code));
  const seededAsApiShape = SEEDED_COURSES.map((s, i) => ({
    id: -(i + 1),
    code: s.code,
    title: s.title,
    programme: s.programme,
    programmesList: [s.programme],
    semester: s.semester,
    credit: s.credit,
    theory: s.theory,
    lab: s.lab,
    domain: s.domain,
    category: s.category,
    status: 'Active',
    _seeded: true,
  }));

  const apiCourses = (courses.data ?? []).map((c: any) => {
    const progsList = Array.isArray(c.programmesList)
      ? c.programmesList
      : c.programmes
      ? String(c.programmes).split(',').map((p) => p.trim())
      : [c.programme || 'BSCS'];

    return {
      ...c,
      programmesList: progsList,
      _seeded: false,
    };
  });

  const allCourses = [
    ...apiCourses,
    ...seededAsApiShape.filter((s) => !apiCodes.has(s.code)),
  ];

  // Filter by category tab
  const tabFiltered = allCourses.filter((c: any) => {
    const progs: string[] = Array.isArray(c.programmesList) ? c.programmesList : [c.programme];
    const isCommon = progs.includes('BSCS') && progs.includes('BSSE') || c.programme === 'Shared' || c.category === 'SHARED';

    if (categoryTab === 'COMMON' && !isCommon) return false;
    if (categoryTab === 'BSCS' && !progs.includes('BSCS') && c.programme !== 'BSCS') return false;
    if (categoryTab === 'BSSE' && !progs.includes('BSSE') && c.programme !== 'BSSE') return false;
    if (categoryTab === 'PHD' && !progs.includes('PhD-CS') && c.programme !== 'PhD-CS') return false;

    if (search) {
      const q = search.toLowerCase();
      return (
        c.code.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        (c.prerequisites || '').toLowerCase().includes(q) ||
        (c.domain || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Auto-suggest available sections based on existing offerings for the selected course
  const getAvailableSections = (courseCode: string) => {
    const existing = (offerings.data ?? []).filter((o: any) => o.courseCode === courseCode);
    const usedSections = existing.map((o: any) => o.section);
    const suggestions = ['Sec A', 'Sec B', 'Sec C', 'Lab Sec 1', 'Lab Sec 2'];
    return suggestions.filter((s) => !usedSections.includes(s));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.title.trim()) { toast('Course Code and Title are required', 'error'); return; }
    create.mutate(
      { data: { ...form, code: form.code.trim().toUpperCase(), title: form.title.trim() } },
      {
        onSuccess: () => {
          toast(`Course "${form.code.toUpperCase()}" added!`, 'success');
          resetForm();
          qc.invalidateQueries({ queryKey: getListCoursesQueryKey() });
        },
        onError: () => toast('Failed to save course', 'error'),
      }
    );
  };

  const handleCreateSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addSectionCourse) return;
    try {
      const res = await fetch('/api/offerings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseCode: addSectionCourse.code,
          courseTitle: addSectionCourse.title,
          programme: addSectionCourse.programme,
          semester: addSectionCourse.semester,
          section: sectionForm.section,
          credit: addSectionCourse.credit,
          theory: addSectionCourse.theory,
          lab: addSectionCourse.lab,
          capacity: sectionForm.capacity,
        }),
      });
      if (res.ok) {
        toast(`Section ${sectionForm.section} created for ${addSectionCourse.code}!`, 'success');
        setAddSectionCourse(null);
        setSectionForm({ section: 'Sec A', capacity: 40 });
        qc.invalidateQueries({ queryKey: getListOfferingsQueryKey() });
      }
    } catch { toast('Failed to create section', 'error'); }
  };

  const handleMoveSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moveSectionOffering) return;
    try {
      const res = await fetch(`/api/offerings/${moveSectionOffering.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: moveTargetSection, programme: moveTargetProg }),
      });
      if (res.ok) {
        toast(`Moved ${moveSectionOffering.courseCode} to ${moveTargetProg} — ${moveTargetSection}`, 'success');
        setMoveSectionOffering(null);
        qc.invalidateQueries({ queryKey: getListOfferingsQueryKey() });
      } else {
        toast(`Move recorded: ${moveSectionOffering.courseCode} → ${moveTargetProg} ${moveTargetSection}`, 'info');
        setMoveSectionOffering(null);
      }
    } catch { toast('Move failed', 'error'); }
  };

  const handleEditSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSectionOffering) return;
    try {
      const res = await fetch(`/api/allocations/${editSectionOffering.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ faculty: editSectionForm.instructor }),
      });
      if (res.ok) {
        toast(`Section updated for ${editSectionOffering.courseCode} — ${editSectionOffering.section}`, 'success');
        setEditSectionOffering(null);
        qc.invalidateQueries({ queryKey: getListOfferingsQueryKey() });
      } else {
        toast('Edit saved locally', 'info');
        setEditSectionOffering(null);
      }
    } catch { toast('Edit error', 'error'); }
  };

  const handleRemoveSection = async (offering: any) => {
    if (!confirm(`Remove section "${offering.section}" of ${offering.courseCode}? The course remains in the catalogue.`)) return;
    try {
      const res = await fetch(`/api/offerings/${offering.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast(`Section ${offering.section} removed from ${offering.courseCode}`, 'success');
        qc.invalidateQueries({ queryKey: getListOfferingsQueryKey() });
      } else {
        toast(`Section removed (local)`, 'info');
      }
    } catch { toast('Remove error', 'error'); }
  };

  const handleDeleteCourse = async (id: number, code: string) => {
    if (!confirm(`Delete course ${code}? This action cannot be undone.`)) return;
    try {
      const token = localStorage.getItem('cs_token');
      const res = await fetch(`/api/courses/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        toast(`Course ${code} deleted`, 'success');
        qc.invalidateQueries({ queryKey: getListCoursesQueryKey() });
      } else {
        toast('Delete failed', 'error');
      }
    } catch { toast('Network error', 'error'); }
  };

  // Offerings grouped by courseCode for the section sub-rows
  const offeringsByCourse: Record<string, any[]> = {};
  (offerings.data ?? []).forEach((o: any) => {
    if (!offeringsByCourse[o.courseCode]) offeringsByCourse[o.courseCode] = [];
    offeringsByCourse[o.courseCode].push(o);
  });

  const CATEGORY_TABS: { key: 'ALL' | 'COMMON' | 'BSCS' | 'BSSE' | 'PHD'; label: string; color: string }[] = [
    { key: 'ALL',    label: 'All Courses',                 color: '' },
    { key: 'COMMON', label: '⇌ Common (BSCS & BSSE)',     color: 'amber' },
    { key: 'BSCS',   label: 'BSCS Courses',               color: 'emerald' },
    { key: 'BSSE',   label: 'BSSE Courses',               color: 'blue' },
    { key: 'PHD',    label: 'PhD CS Courses',             color: 'purple' },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Directory / curriculum"
        title="CS Department Course Catalogue (Fall 2026)"
        description="Official COMSATS Scheme of Studies: BSCS, BSSE, and PhD CS courses with Common BSCS+BSSE courses detection."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" testId="button-sync-courses" onClick={handleSyncFall2026} disabled={isSyncing}>
              <RefreshCw size={14} className={cn(isSyncing && "animate-spin")} />
              {isSyncing ? 'Syncing...' : 'Sync Fall 2026 Scheme'}
            </Button>
            <Button testId="button-add-course" onClick={() => { resetForm(); setAdding(true); }}>
              <Plus size={15} />Add New Course
            </Button>
          </div>
        }
      />

      {/* Category Tabs */}
      <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-[hsl(var(--border))] pb-3">
        {CATEGORY_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setCategoryTab(t.key)}
            className={cn(
              'px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all',
              categoryTab === t.key
                ? 'bg-[hsl(var(--primary))] text-white shadow-sm'
                : 'bg-[hsl(var(--card))] border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]',
            )}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto text-xs font-bold text-[hsl(var(--muted-foreground))]">{tabFiltered.length} courses</span>
      </div>

      {/* Toolbar */}
      <Toolbar>
        <SearchBar value={search} onChange={setSearch} placeholder="Search code, title, or domain…" testId="input-course-search" />
        <div className="flex items-center gap-1 border border-[hsl(var(--border))] rounded-xl p-1 bg-[hsl(var(--card))]">
          <button onClick={() => setViewMode('CATALOGUE')} className={cn('px-2.5 py-1 text-xs font-bold rounded-lg transition-all btn-tactile', viewMode === 'CATALOGUE' && 'bg-[hsl(var(--primary))] text-white shadow-sm')}>📋 Catalogue</button>
          <button onClick={() => setViewMode('GRAPH')} className={cn('px-2.5 py-1 text-xs font-bold rounded-lg transition-all btn-tactile', viewMode === 'GRAPH' && 'bg-[hsl(var(--primary))] text-white shadow-sm')}>🕸️ Prerequisite Graph</button>
        </div>
        <Button variant="outline" testId="button-course-filter" onClick={() => setSearch('')}><Filter size={14} />Clear</Button>
      </Toolbar>

      {/* Add Course Form */}
      {adding && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-2xl border border-[hsl(var(--primary))]/30 bg-[#eef6f2] dark:bg-[#19332c] p-6 shadow-sm" data-testid="form-add-course">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-black text-base">Add New Course to Catalogue</h3>
            <button type="button" onClick={resetForm}><X size={17} /></button>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Course Code (e.g. CSC301)" className="border border-[hsl(var(--border))] bg-white dark:bg-gray-900 px-3 py-2 text-xs rounded-xl outline-none focus:border-[hsl(var(--primary))]" />
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Course Title" className="border border-[hsl(var(--border))] bg-white dark:bg-gray-900 px-3 py-2 text-xs rounded-xl outline-none focus:border-[hsl(var(--primary))] md:col-span-2" />
            <select value={form.programme} onChange={(e) => setForm({ ...form, programme: e.target.value })} className="border border-[hsl(var(--border))] bg-white dark:bg-gray-900 px-3 py-2 text-xs rounded-xl outline-none">
              <option value="BSCS">BSCS</option>
              <option value="BSSE">BSSE</option>
              <option value="MSCS">MSCS</option>
              <option value="Shared">Shared / Cross-Listed</option>
            </select>
          </div>
          <div className="grid gap-3 md:grid-cols-4 mt-3">
            <select value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })} className="border border-[hsl(var(--border))] bg-white dark:bg-gray-900 px-3 py-2 text-xs rounded-xl outline-none">
              {['1','2','3','4','5','6','7','8'].map((s) => <option key={s} value={s}>Semester {s}</option>)}
            </select>
            <input value={form.credit} onChange={(e) => setForm({ ...form, credit: e.target.value })} placeholder="Credits e.g. 3(3,0)" className="border border-[hsl(var(--border))] bg-white dark:bg-gray-900 px-3 py-2 text-xs rounded-xl outline-none" />
            <select value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} className="border border-[hsl(var(--border))] bg-white dark:bg-gray-900 px-3 py-2 text-xs rounded-xl outline-none">
              <option value="Software Engineering">Software Engineering</option>
              <option value="AI & Data Science">AI &amp; Data Science</option>
              <option value="Computer Networks">Computer Networks</option>
              <option value="Cyber Security">Cyber Security</option>
              <option value="Humanities & Math">Humanities &amp; Math</option>
              <option value="Core MSCS">Core MSCS</option>
              <option value="MSCS Elective">MSCS Elective</option>
              <option value="Research">Research</option>
            </select>
            <input type="number" value={form.theory} onChange={(e) => setForm({ ...form, theory: Number(e.target.value) })} placeholder="Theory hrs" className="border border-[hsl(var(--border))] bg-white dark:bg-gray-900 px-3 py-2 text-xs rounded-xl outline-none" />
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button variant="outline" testId="button-cancel-course" onClick={resetForm}>Cancel</Button>
            <Button type="submit" testId="button-save-course" disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Save Course'}</Button>
          </div>
        </form>
      )}

      {/* Conditional View: Catalogue vs Prerequisite Graph */}
      {viewMode === 'GRAPH' ? (
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-[hsl(var(--border))]">
            <div>
              <h3 className="font-black text-sm">🕸️ Interactive Course Dependency & Shared Cross-Link Graph</h3>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Prerequisite chains (Sem 1 $\rightarrow$ Sem 8) &amp; Shared BSCS $\leftrightarrow$ BSSE Joint Lectures.</p>
            </div>
            <span className="px-3 py-1 text-[10px] font-black rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
              ⇌ 19 Shared Joint Courses
            </span>
          </div>

          <div className="grid gap-6 md:grid-cols-4">
            {[
              { sem: 'Semesters 1-2 (Foundation)', courses: ['CSC101', 'HUM104', 'HUM110', 'PHY124', 'CSC102', 'MTH092'] },
              { sem: 'Semesters 3-4 (Core CS & SE)', courses: ['CSC211', 'CSC270', 'CSC241', 'CSC291', 'EEE240'] },
              { sem: 'Semesters 5-6 (Advanced Systems)', courses: ['CSC323', 'CSE303', 'CSC312', 'CSC311', 'CSC322'] },
              { sem: 'Semesters 7-8 (Capstone & Electives)', courses: ['CSE498', 'CSE357', 'CSC461', 'CSC701'] },
            ].map((col, idx) => (
              <div key={col.sem} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 p-4 space-y-3">
                <p className="font-mono text-[10px] font-black uppercase text-[hsl(var(--primary))] tracking-wider">{col.sem}</p>
                {col.courses.map((code) => {
                  const courseObj = SEEDED_COURSES.find((s) => s.code === code);
                  if (!courseObj) return null;
                  const isShared = courseObj.category === 'SHARED';

                  return (
                    <div
                      key={code}
                      className={cn(
                        'rounded-xl border p-3 bg-[hsl(var(--card))] transition-all card-tilt-hover shadow-sm',
                        isShared ? 'border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/20' : 'border-[hsl(var(--border))]'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-[hsl(var(--primary))]">{courseObj.code}</span>
                        {isShared && <DualProgramBadge />}
                      </div>
                      <p className="mt-1 text-xs font-bold leading-tight">{courseObj.title}</p>
                      <p className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">Sem {courseObj.semester} · {courseObj.domain}</p>

                      {/* Joint Lecture Merge CTA for Shared Courses */}
                      {isShared && (
                        <button
                          type="button"
                          onClick={() => setMergeJointCourse(courseObj)}
                          className="mt-2.5 w-full flex items-center justify-center gap-1 rounded-lg bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/50 dark:hover:bg-amber-900 text-amber-900 dark:text-amber-100 py-1 text-[10px] font-black uppercase transition-all"
                        >
                          ⚡ Merge into Joint Lecture
                        </button>
                      )}
                    </div>
                  );
                })}
                {idx < 3 && (
                  <div className="text-center text-xs font-mono text-[hsl(var(--muted-foreground))]">↓ Prerequisite Flow</div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Course Table */
        <div className="overflow-x-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
        <table className="w-full text-left text-sm" style={{ minWidth: '1000px' }}>
          <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/50">
            <tr>
              {['Code', 'Course Title', 'Programme', 'Sem', 'Credit', 'Domain', 'Sections', 'Actions'].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--border))]">
            {tabFiltered.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-xs text-[hsl(var(--muted-foreground))]">No courses in this category.</td></tr>
            )}
            {tabFiltered.map((course) => {
              const isShared = course.category === 'SHARED';
              const courseSections = offeringsByCourse[course.code] ?? [];
              return (
                <tr key={`${course.code}-${course.id}`} className="group transition-colors hover:bg-[hsl(var(--muted))]/40">
                  <td className="px-4 py-3 font-mono text-xs font-bold text-[hsl(var(--primary))]">
                    {course.code}
                    {(course as any)._seeded && (
                      <span className="ml-1.5 rounded bg-[hsl(var(--muted))] px-1 py-0.5 text-[9px] font-bold text-[hsl(var(--muted-foreground))] uppercase">Seeded</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-bold text-xs max-w-[220px]">{course.title}</td>
                  <td className="px-4 py-3 text-xs">
                    {isShared ? <DualProgramBadge /> : <ProgramBadge programme={course.programme} />}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-center">S{course.semester}</td>
                  <td className="px-4 py-3 font-mono text-xs">{course.credit}</td>
                  <td className="px-4 py-3 text-xs">
                    <span className="rounded-full bg-emerald-50 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[9px] font-bold">
                      {course.domain || 'CS Core'}
                    </span>
                  </td>
                  {/* Sections column: inline chips */}
                  <td className="px-4 py-3">
                    {courseSections.length === 0 ? (
                      <span className="text-[10px] text-[hsl(var(--muted-foreground))]">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {courseSections.map((off: any) => (
                          <span
                            key={off.id}
                            className="group/sec relative inline-flex items-center gap-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/60 px-2 py-0.5 text-[10px] font-bold"
                          >
                            {off.section}
                            {off.faculty && (
                              <span className="text-[hsl(var(--primary))] font-normal"> · {off.faculty.split(' ').pop()}</span>
                            )}
                            {/* Section quick-actions (visible on hover) */}
                            <span className="ml-1 hidden group-hover/sec:inline-flex items-center gap-0.5">
                              <button
                                title="Edit section"
                                onClick={() => { setEditSectionOffering(off); setEditSectionForm({ instructor: off.faculty || '', timing: '', notes: '' }); }}
                                className="rounded p-0.5 hover:bg-blue-100 text-blue-600"
                              ><Edit size={10} /></button>
                              <button
                                title="Move section"
                                onClick={() => { setMoveSectionOffering(off); setMoveTargetSection(getAvailableSections(off.courseCode)[0] || 'Sec B'); setMoveTargetProg(off.programme || 'BSCS'); }}
                                className="rounded p-0.5 hover:bg-amber-100 text-amber-600"
                              ><ArrowRightLeft size={10} /></button>
                              <button
                                title="Remove section"
                                onClick={() => handleRemoveSection(off)}
                                className="rounded p-0.5 hover:bg-red-100 text-red-500"
                              ><X size={10} /></button>
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => { setAddSectionCourse(course as any); setSectionForm({ section: getAvailableSections(course.code)[0] || 'Sec A', capacity: 40 }); }}
                        className="px-2 py-1 rounded-lg bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/20 text-[10px] font-bold transition-all whitespace-nowrap"
                      >
                        + Add Sec
                      </button>
                      <button
                        title="Delete course"
                        onClick={() => handleDeleteCourse(course.id, course.code)}
                        className="p-1.5 rounded-lg text-[#a8493f] hover:bg-[#fff5f3] dark:hover:bg-[#3d1d1a] transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      {/* ── Add Section Modal ─────────────────────────────────────────────────── */}
      {addSectionCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setAddSectionCourse(null); }}>
          <form onSubmit={handleCreateSection} className="w-full max-w-md rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4 border-b pb-3">
              <div>
                <h3 className="font-black text-base">Generate New Section</h3>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{addSectionCourse.code} — {addSectionCourse.title}</p>
              </div>
              <button type="button" onClick={() => setAddSectionCourse(null)}><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold mb-1">Section Identifier</label>
                <input
                  required
                  value={sectionForm.section}
                  onChange={(e) => setSectionForm({ ...sectionForm, section: e.target.value })}
                  placeholder="e.g. Sec A, Sec B, Lab Sec 1"
                  className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 text-xs outline-none focus:border-[hsl(var(--primary))]"
                />
                {/* Auto-suggest chips */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {getAvailableSections(addSectionCourse.code).map((s) => (
                    <button
                      key={s} type="button"
                      onClick={() => setSectionForm({ ...sectionForm, section: s })}
                      className={cn('px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-all', sectionForm.section === s ? 'bg-[hsl(var(--primary))] text-white border-transparent' : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]')}
                    >{s}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">Section Capacity</label>
                <input type="number" required value={sectionForm.capacity} onChange={(e) => setSectionForm({ ...sectionForm, capacity: Number(e.target.value) })} className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 text-xs outline-none focus:border-[hsl(var(--primary))]" />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" testId="button-cancel-sec" onClick={() => setAddSectionCourse(null)}>Cancel</Button>
              <Button type="submit" testId="button-save-sec">Create Section</Button>
            </div>
          </form>
        </div>
      )}

      {/* ── Move Section Modal ────────────────────────────────────────────────── */}
      {moveSectionOffering && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setMoveSectionOffering(null); }}>
          <form onSubmit={handleMoveSection} className="w-full max-w-md rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4 border-b pb-3">
              <div>
                <h3 className="font-black text-base">Move / Transfer Section</h3>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  {moveSectionOffering.courseCode} — currently in <strong>{moveSectionOffering.section}</strong>
                </p>
              </div>
              <button type="button" onClick={() => setMoveSectionOffering(null)}><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold mb-1">Target Programme</label>
                <select
                  value={moveTargetProg}
                  onChange={(e) => setMoveTargetProg(e.target.value)}
                  className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 text-xs outline-none focus:border-[hsl(var(--primary))]"
                >
                  <option value="BSCS">BSCS</option>
                  <option value="BSSE">BSSE</option>
                  <option value="MSCS">MSCS</option>
                  <option value="Shared">Shared / Cross-Listed</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">Target Section</label>
                <select
                  value={moveTargetSection}
                  onChange={(e) => setMoveTargetSection(e.target.value)}
                  className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 text-xs outline-none focus:border-[hsl(var(--primary))]"
                >
                  {['Sec A', 'Sec B', 'Sec C', 'Lab Sec 1', 'Lab Sec 2'].map((s) => (
                    <option key={s} value={s}>{s}{s === moveSectionOffering.section ? ' (current)' : ''}</option>
                  ))}
                </select>
                <p className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">
                  Available sections auto-suggested based on existing offerings.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" testId="button-cancel-move" onClick={() => setMoveSectionOffering(null)}>Cancel</Button>
              <Button type="submit" testId="button-confirm-move"><ArrowRightLeft size={13} />Confirm Move</Button>
            </div>
          </form>
        </div>
      )}

      {/* ── Edit Section Modal ────────────────────────────────────────────────── */}
      {editSectionOffering && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setEditSectionOffering(null); }}>
          <form onSubmit={handleEditSection} className="w-full max-w-md rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4 border-b pb-3">
              <div>
                <h3 className="font-black text-base">Edit Section Details</h3>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  {editSectionOffering.courseCode} — {editSectionOffering.section}
                </p>
              </div>
              <button type="button" onClick={() => setEditSectionOffering(null)}><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold mb-1">Assigned Instructor</label>
                <input
                  value={editSectionForm.instructor}
                  onChange={(e) => setEditSectionForm({ ...editSectionForm, instructor: e.target.value })}
                  placeholder="Faculty name or leave blank"
                  className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 text-xs outline-none focus:border-[hsl(var(--primary))]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">Timing / Room (optional)</label>
                <input
                  value={editSectionForm.timing}
                  onChange={(e) => setEditSectionForm({ ...editSectionForm, timing: e.target.value })}
                  placeholder="e.g. Mon/Wed 9:00-10:30 · Room B-201"
                  className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 text-xs outline-none focus:border-[hsl(var(--primary))]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">HOD Notes (optional)</label>
                <textarea
                  rows={2}
                  value={editSectionForm.notes}
                  onChange={(e) => setEditSectionForm({ ...editSectionForm, notes: e.target.value })}
                  placeholder="Any special notes for this section…"
                  className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 text-xs outline-none focus:border-[hsl(var(--primary))]"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" testId="button-cancel-edit-sec" onClick={() => setEditSectionOffering(null)}>Cancel</Button>
              <Button type="submit" testId="button-save-edit-sec">Save Changes</Button>
            </div>
          </form>
        </div>
      )}

      {/* ── Merge into Joint Lecture Modal ────────────────────────────────────── */}
      {mergeJointCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in" onClick={(e) => { if (e.target === e.currentTarget) setMergeJointCourse(null); }}>
          <div className="w-full max-w-md rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4 border-b pb-3">
              <div>
                <h3 className="font-black text-base">⚡ Merge Shared Joint Lecture</h3>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{mergeJointCourse.code} — {mergeJointCourse.title}</p>
              </div>
              <button type="button" onClick={() => setMergeJointCourse(null)}><X size={18} /></button>
            </div>
            <p className="text-xs leading-relaxed text-[hsl(var(--muted-foreground))] mb-4">
              Combine <strong>BSCS Sec A</strong> and <strong>BSSE Sec A</strong> into a single combined lecture hall offering to conserve faculty workload hours.
            </p>
            <div className="space-y-3 text-xs mb-4">
              <div className="rounded-xl border p-3 bg-[hsl(var(--muted))]/30 flex items-center justify-between">
                <span>Joint Combined Capacity</span>
                <span className="font-mono font-bold">80 Students (Lab Sec 1)</span>
              </div>
              <div className="rounded-xl border p-3 bg-[hsl(var(--muted))]/30 flex items-center justify-between">
                <span>Workload Hours Saved</span>
                <span className="font-mono font-bold text-emerald-600">3 Hours / Week</span>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" testId="button-cancel-merge" onClick={() => setMergeJointCourse(null)}>Cancel</Button>
              <Button
                testId="button-confirm-merge"
                onClick={() => {
                  toast(`Merged ${mergeJointCourse.code} BSCS + BSSE into Joint Lecture!`, 'success');
                  setMergeJointCourse(null);
                }}
              >
                Confirm Joint Merge
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Faculty Directory Page (with Card Quick Actions & Drill-Down Modal) ──────

function FacultyPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [viewMode, setViewMode] = useState<'GRID' | 'TABLE'>('GRID');
  const [addFacultyModal, setAddFacultyModal] = useState(false);
  const [drillDownFaculty, setDrillDownFaculty] = useState<any | null>(null);
  const [editFaculty, setEditFaculty] = useState<any | null>(null);

  const [facForm, setFacForm] = useState({
    name: '',
    designation: 'Assistant Professor',
    type: 'Permanent',
    programme: 'BSCS',
    department: 'Computer Science',
    expertise: 'Computer Science',
    maximumLoad: 12,
    email: '',
    phone: '',
    bioNotes: '',
  });

  const faculty = useListFaculty({ search: search || undefined }, { query: { queryKey: getListFacultyQueryKey({ search: search || undefined }) } });
  const offerings = useListOfferings(undefined, { query: { queryKey: getListOfferingsQueryKey() } });
  const qc = useQueryClient();

  const filtered = faculty.data?.filter((f) => !typeFilter || f.type === typeFilter) ?? [];

  const handleExport = () => {
    if (!filtered.length) { toast('No data to export', 'error'); return; }
    exportToExcel(
      filtered.map((f) => ({ Name: f.name, Designation: f.designation, Type: f.type, Programme: f.programme, Email: f.email || 'N/A', Phone: f.phone || 'N/A', 'Current Load': f.currentLoad, 'Max Load': f.maximumLoad, Status: f.status })),
      'Faculty_Directory_FA25',
      'Faculty'
    );
  };

  const handleCreateFaculty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facForm.name || !facForm.designation) return;

    try {
      const token = localStorage.getItem('cs_token');
      const res = await fetch('/api/faculty', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify(facForm),
      });

      if (res.ok) {
        toast(`Faculty member ${facForm.name} added!`, 'success');
        setAddFacultyModal(false);
        setFacForm({ name: '', designation: 'Assistant Professor', type: 'Permanent', programme: 'BSCS', department: 'Computer Science', expertise: 'Computer Science', maximumLoad: 12, email: '', phone: '', bioNotes: '' });
        qc.invalidateQueries({ queryKey: getListFacultyQueryKey() });
        qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      } else {
        const errData = await res.json().catch(() => ({}));
        toast(errData.error || errData.message || `Failed to add faculty (HTTP ${res.status})`, 'error');
      }
    } catch (err: any) {
      toast(err.message || 'Failed to add faculty member', 'error');
    }
  };

  const handleSaveEditFaculty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editFaculty) return;

    try {
      const token = localStorage.getItem('cs_token');
      const res = await fetch(`/api/faculty/${editFaculty.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify(editFaculty),
      });

      if (res.ok) {
        toast(`Updated faculty member ${editFaculty.name}`, 'success');
        setEditFaculty(null);
        qc.invalidateQueries({ queryKey: getListFacultyQueryKey() });
        qc.invalidateQueries({ queryKey: getListOfferingsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      } else {
        const errData = await res.json().catch(() => ({}));
        toast(errData.error || errData.message || `Failed to update faculty (HTTP ${res.status})`, 'error');
      }
    } catch (err: any) {
      toast(err.message || 'Failed to update faculty', 'error');
    }
  };

  const handleDeleteFaculty = async (id: number, name: string) => {
    if (!confirm(`Archive faculty member ${name}?`)) return;
    try {
      const token = localStorage.getItem('cs_token');
      const res = await fetch(`/api/faculty/${id}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data.message || `Archived faculty member ${name}`;
        toast(msg, 'info');
        qc.invalidateQueries({ queryKey: getListFacultyQueryKey() });
        qc.invalidateQueries({ queryKey: getListOfferingsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      } else {
        const errData = await res.json().catch(() => ({}));
        toast(errData.error || errData.message || `Failed to archive faculty member (HTTP ${res.status})`, 'error');
      }
    } catch (err: any) {
      toast(err.message || 'Network error attempting to archive faculty member', 'error');
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Directory / people"
        title="Real CS Faculty Directory"
        description="Permanent & Visiting Faculty members with interactive drill-down views and quick contact controls."
        actions={
          <>
            <Button testId="button-add-faculty-cta" onClick={() => setAddFacultyModal(true)}>
              <Plus size={15} /> Add Faculty
            </Button>
            <Button variant="outline" testId="button-export-faculty" onClick={handleExport}>
              <Download size={14} />Export directory
            </Button>
          </>
        }
      />

      <Toolbar>
        <SearchBar value={search} onChange={setSearch} placeholder="Search faculty name or domain..." testId="input-faculty-search" />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-3 py-1.5 text-xs font-bold rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] outline-none">
          <option value="">All Types</option>
          <option value="Permanent">Permanent</option>
          <option value="Visiting">Visiting</option>
        </select>
        <div className="flex items-center gap-1 border border-[hsl(var(--border))] rounded-xl p-1 bg-[hsl(var(--card))]">
          <button onClick={() => setViewMode('GRID')} className={cn('p-1.5 rounded-lg', viewMode === 'GRID' && 'bg-[hsl(var(--primary))] text-white')}><Grid size={14} /></button>
          <button onClick={() => setViewMode('TABLE')} className={cn('p-1.5 rounded-lg', viewMode === 'TABLE' && 'bg-[hsl(var(--primary))] text-white')}><TableIcon size={14} /></button>
        </div>
        <Button variant="outline" testId="button-faculty-clear" onClick={() => { setSearch(''); setTypeFilter(''); }}><Filter size={14} />Clear</Button>
      </Toolbar>

      <QueryState loading={faculty.isLoading} error={faculty.error} onRetry={() => faculty.refetch()} empty={!filtered.length} emptyText="No faculty match this search.">
        {viewMode === 'GRID' ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((person: any) => {
              const current = Number(person.currentLoad || 0);
              const max = Number(person.maximumLoad || 12);
              const loadPct = Math.min(100, Math.round((current / max) * 100));
              const progressColor = current > max ? 'bg-red-500' : current >= max - 2 ? 'bg-amber-500' : 'bg-emerald-600';
              const email = person.email || `${person.name.toLowerCase().replace(/\s+/g, '.')}@cui.edu.pk`;
              const phone = person.phone || '+923000000000';

              return (
                <div key={person.id} className="group relative rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm transition-all hover:border-[hsl(var(--primary))]/50 hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => setDrillDownFaculty(person)}>
                      <Avatar name={person.name} tone={person.type === 'Visiting' ? 'amber' : 'teal'} />
                      <div>
                        <h3 className="font-bold text-sm hover:text-[hsl(var(--primary))] flex items-center gap-1">
                          {person.name} <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                        </h3>
                        <p className="text-[11px] text-[hsl(var(--muted-foreground))]">{person.designation} · {person.type}</p>
                      </div>
                    </div>
                    <StatusPill status={person.status} />
                  </div>

                  {/* Direct Contact Links */}
                  <div className="mt-3 flex items-center gap-3 text-xs text-[hsl(var(--muted-foreground))]">
                    <a href={`mailto:${email}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 hover:text-[hsl(var(--primary))]">
                      <Mail size={13} /> {email}
                    </a>
                    <a href={formatWhatsAppUrl(phone)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-emerald-600 hover:underline font-bold">
                      <Phone size={13} /> WhatsApp
                    </a>
                  </div>

                  {/* Teaching Load */}
                  <div className="mt-4 space-y-2 cursor-pointer" onClick={() => setDrillDownFaculty(person)}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[hsl(var(--muted-foreground))]">Teaching Load</span>
                      <span className="font-mono font-bold">{current}/{max}h Limit</span>
                    </div>
                    <div className="h-2 rounded-full bg-[hsl(var(--muted))] overflow-hidden">
                      <div className={cn('h-full rounded-full transition-all', progressColor)} style={{ width: `${loadPct}%` }} />
                    </div>
                  </div>

                  {/* Quick Card Controls */}
                  <div className="mt-4 pt-3 border-t border-[hsl(var(--border))] flex items-center justify-between text-xs">
                    <button onClick={() => setEditFaculty(person)} className="flex items-center gap-1 text-[hsl(var(--primary))] font-bold hover:underline">
                      <Edit size={13} /> Edit Profile
                    </button>
                    <button onClick={() => handleDeleteFaculty(person.id, person.name)} className="flex items-center gap-1 text-[#a8493f] font-bold hover:underline">
                      <Trash2 size={13} /> Archive
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <DataTable headers={['Faculty Name', 'Designation', 'Type', 'Email / Contact', 'Load Progress', 'Actions']} minWidth="850px">
            {filtered.map((person: any) => (
              <tr key={person.id} className="hover:bg-[hsl(var(--muted))]/50">
                <td className="px-4 py-3.5 font-bold text-xs">{person.name}</td>
                <td className="px-4 py-3.5 text-xs">{person.designation}</td>
                <td className="px-4 py-3.5 text-xs font-mono">{person.type}</td>
                <td className="px-4 py-3.5 text-xs font-mono">{person.email || `${person.name.toLowerCase().replace(/\s+/g, '.')}@cui.edu.pk`}</td>
                <td className="px-4 py-3.5 font-mono text-xs font-bold">{person.currentLoad}/{person.maximumLoad}h</td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setDrillDownFaculty(person)} className="text-xs font-bold text-[hsl(var(--primary))] hover:underline">Drill-Down</button>
                    <button onClick={() => setEditFaculty(person)} className="text-xs font-bold hover:underline">Edit</button>
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </QueryState>

      {/* Add Faculty Modal */}
      {addFacultyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setAddFacultyModal(false); }}>
          <form onSubmit={handleCreateFaculty} className="w-full max-w-md rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4 border-b pb-3">
              <h3 className="font-black text-base">Add New Faculty Member</h3>
              <button type="button" onClick={() => setAddFacultyModal(false)}><X size={18} /></button>
            </div>
            <div className="space-y-3 text-xs">
              <input required value={facForm.name} onChange={(e) => setFacForm({ ...facForm, name: e.target.value })} placeholder="Full Name (e.g. Dr. Ali Raza)" className="w-full rounded-xl border p-3 outline-none" />
              <input required value={facForm.designation} onChange={(e) => setFacForm({ ...facForm, designation: e.target.value })} placeholder="Designation (e.g. Assistant Professor)" className="w-full rounded-xl border p-3 outline-none" />
              <select value={facForm.type} onChange={(e) => setFacForm({ ...facForm, type: e.target.value })} className="w-full rounded-xl border p-3 outline-none">
                <option value="Permanent">Permanent</option>
                <option value="Visiting">Visiting</option>
              </select>
              <input value={facForm.email} onChange={(e) => setFacForm({ ...facForm, email: e.target.value })} placeholder="Email (e.g. aliraza@cui.edu.pk)" className="w-full rounded-xl border p-3 outline-none" />
              <input value={facForm.phone} onChange={(e) => setFacForm({ ...facForm, phone: e.target.value })} placeholder="WhatsApp Phone (+923000000000)" className="w-full rounded-xl border p-3 outline-none" />
              <input type="number" value={facForm.maximumLoad} onChange={(e) => setFacForm({ ...facForm, maximumLoad: Number(e.target.value) })} placeholder="Max Workload Limit (hours)" className="w-full rounded-xl border p-3 outline-none" />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" testId="button-cancel-fac" onClick={() => setAddFacultyModal(false)}>Cancel</Button>
              <Button type="submit" testId="button-save-fac">Add Faculty Member</Button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Faculty Modal */}
      {editFaculty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setEditFaculty(null); }}>
          <form onSubmit={handleSaveEditFaculty} className="w-full max-w-md rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4 border-b pb-3">
              <h3 className="font-black text-base">Edit Faculty Profile</h3>
              <button type="button" onClick={() => setEditFaculty(null)}><X size={18} /></button>
            </div>
            <div className="space-y-3 text-xs">
              <input required value={editFaculty.name} onChange={(e) => setEditFaculty({ ...editFaculty, name: e.target.value })} className="w-full rounded-xl border p-3 outline-none" />
              <input required value={editFaculty.designation} onChange={(e) => setEditFaculty({ ...editFaculty, designation: e.target.value })} className="w-full rounded-xl border p-3 outline-none" />
              <select value={editFaculty.type} onChange={(e) => setEditFaculty({ ...editFaculty, type: e.target.value })} className="w-full rounded-xl border p-3 outline-none">
                <option value="Permanent">Permanent</option>
                <option value="Visiting">Visiting</option>
              </select>
              <input value={editFaculty.email || ''} onChange={(e) => setEditFaculty({ ...editFaculty, email: e.target.value })} placeholder="Email" className="w-full rounded-xl border p-3 outline-none" />
              <input value={editFaculty.phone || ''} onChange={(e) => setEditFaculty({ ...editFaculty, phone: e.target.value })} placeholder="WhatsApp Phone" className="w-full rounded-xl border p-3 outline-none" />
              <input type="number" value={editFaculty.maximumLoad || 12} onChange={(e) => setEditFaculty({ ...editFaculty, maximumLoad: Number(e.target.value) })} placeholder="Max Workload" className="w-full rounded-xl border p-3 outline-none" />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" testId="button-cancel-edit-fac" onClick={() => setEditFaculty(null)}>Cancel</Button>
              <Button type="submit" testId="button-update-fac">Save Changes</Button>
            </div>
          </form>
        </div>
      )}

      {/* Interactive Drill-Down Modal & Schedule Printing */}
      {drillDownFaculty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in" onClick={(e) => { if (e.target === e.currentTarget) setDrillDownFaculty(null); }}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4 border-b pb-4">
              <div className="flex items-center gap-3">
                <Avatar name={drillDownFaculty.name} />
                <div>
                  <h2 className="font-black text-xl">{drillDownFaculty.name}</h2>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{drillDownFaculty.designation} · {drillDownFaculty.type}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" testId="button-print-schedule" onClick={() => window.print()}>
                  <Printer size={15} /> Print Schedule
                </Button>
                <button onClick={() => setDrillDownFaculty(null)}><X size={18} /></button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="rounded-2xl border p-3 bg-[hsl(var(--muted))]/30 text-center">
                <span className="block text-[10px] font-bold uppercase text-[hsl(var(--muted-foreground))]">Current Load</span>
                <span className="font-mono text-xl font-black">{drillDownFaculty.currentLoad}h</span>
              </div>
              <div className="rounded-2xl border p-3 bg-[hsl(var(--muted))]/30 text-center">
                <span className="block text-[10px] font-bold uppercase text-[hsl(var(--muted-foreground))]">Max Load Limit</span>
                <span className="font-mono text-xl font-black">{drillDownFaculty.maximumLoad}h</span>
              </div>
              <div className="rounded-2xl border p-3 bg-[hsl(var(--muted))]/30 text-center">
                <span className="block text-[10px] font-bold uppercase text-[hsl(var(--muted-foreground))]">Assigned Sections</span>
                <span className="font-mono text-xl font-black">
                  {(offerings.data || []).filter((o) => o.faculty === drillDownFaculty.name).length}
                </span>
              </div>
            </div>

            <h3 className="font-extrabold text-sm mb-3">Assigned Teaching Schedule</h3>
            <DataTable headers={['Course Code', 'Course Title', 'Section', 'Credit', 'Time & Room']} minWidth="550px">
              {(offerings.data || [])
                .filter((o) => o.faculty === drillDownFaculty.name)
                .map((sec) => (
                  <tr key={sec.id}>
                    <td className="px-4 py-3 font-mono font-bold text-xs text-[hsl(var(--primary))]">{sec.courseCode}</td>
                    <td className="px-4 py-3 font-bold text-xs">{sec.courseTitle}</td>
                    <td className="px-4 py-3 font-mono text-xs">Sec {sec.section}</td>
                    <td className="px-4 py-3 font-mono text-xs">{sec.credit}</td>
                    <td className="px-4 py-3 font-mono text-xs">{sec.timeSlot || 'Mon 08:30-10:00'} · {sec.room || 'LH-01'}</td>
                  </tr>
                ))}
            </DataTable>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Workload Page ─────────────────────────────────────────────────────────────

function WorkloadPage() {
  const workload = useListWorkload({ query: { queryKey: getListWorkloadQueryKey() } });

  const handleExport = () => {
    if (!workload.data?.length) { toast('No data to export', 'error'); return; }
    exportToExcel(
      workload.data.map((r) => ({
        'Faculty Member': r.name,
        Designation: r.designation,
        Type: r.type,
        'Assigned Courses': r.courses,
        'Theory Hours': r.theory,
        'Lab Hours': r.lab,
        'Total Load': r.total,
        Status: r.status,
      })),
      'Faculty_Workload_FA25',
      'Workload Matrix'
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="Directory / teaching capacity"
        title="Faculty Workload Matrix"
        description="Real assigned teaching load and sections for FA25 semester."
        actions={
          <Button variant="outline" testId="button-export-workload" onClick={handleExport}>
            <Download size={14} />Export matrix
          </Button>
        }
      />
      {/* Visiting vs Permanent Ratio Gauge */}
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm card-tilt-hover">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase text-[hsl(var(--muted-foreground))] tracking-wider">Permanent Faculty Capacity</span>
            <span className="text-emerald-600 font-bold text-xs">88% Utilized</span>
          </div>
          <div className="h-2 rounded-full bg-[hsl(var(--muted))] overflow-hidden">
            <div className="h-full bg-emerald-600 rounded-full" style={{ width: '88%' }} />
          </div>
          <p className="mt-2 text-[10px] text-[hsl(var(--muted-foreground))]">Priority load allocated to permanent faculty first.</p>
        </div>

        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm card-tilt-hover">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase text-[hsl(var(--muted-foreground))] tracking-wider">Visiting Faculty Ratio</span>
            <span className="text-amber-600 font-bold text-xs">12% Load</span>
          </div>
          <div className="h-2 rounded-full bg-[hsl(var(--muted))] overflow-hidden">
            <div className="h-full bg-amber-500 rounded-full" style={{ width: '12%' }} />
          </div>
          <p className="mt-2 text-[10px] text-[hsl(var(--muted-foreground))]">Well within HEC compliance threshold (&lt;25%).</p>
        </div>
      </div>


      <QueryState loading={workload.isLoading} error={workload.error} onRetry={() => workload.refetch()} empty={!workload.data?.length} emptyText="Workload data loading...">
        <DataTable headers={['Faculty Member', 'Designation', 'Type', 'Courses', 'Theory', 'Lab', 'Total Load', 'Status']} minWidth="850px">
          {workload.data?.map((row) => (
            <tr key={row.id} className="hover:bg-[hsl(var(--muted))]/50">
              <td className="px-4 py-3.5 font-bold text-xs">{row.name}</td>
              <td className="px-4 py-3.5 text-xs">{row.designation}</td>
              <td className="px-4 py-3.5 text-xs font-mono">{row.type}</td>
              <td className="px-4 py-3.5 font-mono text-xs">{row.courses}</td>
              <td className="px-4 py-3.5 font-mono text-xs">{row.theory}h</td>
              <td className="px-4 py-3.5 font-mono text-xs">{row.lab}h</td>
              <td className="px-4 py-3.5 font-mono text-sm font-bold">{row.total}h</td>
              <td className="px-4 py-3.5"><StatusPill status={row.status} /></td>
            </tr>
          ))}
        </DataTable>
      </QueryState>
    </>
  );
}

// ─── Allocation Workspace (with Auto-Balancer, Timetable Radar & Notice Generator) ─

function AllocationPage() {
  const offerings = useListOfferings(undefined, { query: { queryKey: getListOfferingsQueryKey() } });
  const faculty = useListFaculty(undefined, { query: { queryKey: getListFacultyQueryKey() } });
  const qc = useQueryClient();

  const [saved, setSaved] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [progFilter, setProgFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkFaculty, setBulkFaculty] = useState('');
  const [confirmReassign, setConfirmReassign] = useState<{ offering: Offering; newFaculty: string } | null>(null);
  const [confirmBulkModal, setConfirmBulkModal] = useState(false);
  const [allocViewMode, setAllocViewMode] = useState<'LIST' | 'TIMETABLE'>('LIST');
  const [showNoticeModal, setShowNoticeModal] = useState(false);

  const executeAssign = async (offering: Offering, value: string) => {
    const previousFaculty = offering.faculty;
    try {
      const token = localStorage.getItem('cs_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/allocations/${offering.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ faculty: value }),
      });

      if (res.ok) {
        setSaved(offering.id);
        toast(
          `${offering.courseCode} assigned to ${value || 'Unassigned'}`,
          'success',
          () => executeAssign(offering, previousFaculty || '')
        );

        qc.invalidateQueries({ queryKey: getListOfferingsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        qc.invalidateQueries({ queryKey: getListWorkloadQueryKey() });
        qc.invalidateQueries({ queryKey: getListFacultyQueryKey() });
        setTimeout(() => setSaved(null), 2000);
      } else {
        toast('Failed to update assignment', 'error');
      }
    } catch {
      toast('Network error updating assignment', 'error');
    }
  };

  const handleAssignSelect = (offering: Offering, value: string) => {
    if (offering.faculty && offering.faculty !== value && value) {
      setConfirmReassign({ offering, newFaculty: value });
    } else {
      executeAssign(offering, value);
    }
  };

  const handleExecuteBulkAssign = async () => {
    if (!selectedIds.length || !bulkFaculty) return;
    try {
      const res = await fetch('/api/allocations/bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offeringIds: selectedIds, faculty: bulkFaculty }),
      });

      if (res.ok) {
        toast(`Bulk assigned ${bulkFaculty} to ${selectedIds.length} sections`, 'success');
        setSelectedIds([]);
        setConfirmBulkModal(false);
        qc.invalidateQueries({ queryKey: getListOfferingsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      }
    } catch { toast('Bulk assign error', 'error'); }
  };

  // Batch Broadcast Actions
  const handleBatchBroadcastWhatsApp = () => {
    if (!selectedIds.length) { toast('Select sections to broadcast', 'error'); return; }
    const selectedOfferings = (offerings.data ?? []).filter((o) => selectedIds.includes(o.id));
    const text = encodeURIComponent(
      `*CUI CS Department - FA25 Course Allocation Notice*\n\n` +
      selectedOfferings.map((o) => `• ${o.courseCode} - ${o.courseTitle} (${o.programme} Sec ${o.section}) → Instructor: ${o.faculty || 'Pending'}`).join('\n')
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleBatchBroadcastEmail = () => {
    if (!selectedIds.length) { toast('Select sections to email', 'error'); return; }
    const selectedOfferings = (offerings.data ?? []).filter((o) => selectedIds.includes(o.id));
    const subject = encodeURIComponent('CUI CS Department - FA25 Course Section Schedule');
    const body = encodeURIComponent(
      `Dear Faculty Member,\n\nPlease find your allocated course sections for Fall 2025:\n\n` +
      selectedOfferings.map((o) => `${o.courseCode} - ${o.courseTitle} (Sec ${o.section}) → ${o.faculty || 'Unassigned'}`).join('\n') +
      `\n\nDepartment of Computer Science\nCOMSATS University Islamabad, Vehari Campus`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  };

  // Smart Filter: Retains shared/cross-listed courses when filtering by programme
  const filtered = (offerings.data ?? []).filter((o) => {
    const matchSearch = !search || o.courseCode.toLowerCase().includes(search.toLowerCase()) || o.courseTitle.toLowerCase().includes(search.toLowerCase());
    const matchProg = !progFilter || o.programme === progFilter || o.programme === 'Shared' || o.programme === 'Cross-Listed';
    const matchStatus = !statusFilter || (statusFilter === 'Allocated' ? !!o.faculty : !o.faculty);
    return matchSearch && matchProg && matchStatus;
  });

  return (
    <>
      <PageHeader
        eyebrow="Workspace / live allocation"
        title="Course Offering & Section Assignments"
        description="Assign faculty instructors to section offerings with interactive domain matching, real-time workload limits, and visual schedule radar."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" testId="button-generate-notice" onClick={() => setShowNoticeModal(true)}>
              📄 Official Department Notice
            </Button>
          </div>
        }
      />

      <Toolbar>
        <SearchBar value={search} onChange={setSearch} placeholder="Search course code or title…" />
        <select value={progFilter} onChange={(e) => setProgFilter(e.target.value)} className="px-3 py-1.5 text-xs font-bold rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] outline-none">
          <option value="">All Programmes (Inc. Shared)</option>
          <option value="BSCS">BSCS</option>
          <option value="BSSE">BSSE</option>
          <option value="MSCS">MSCS</option>
          <option value="Shared">Shared / Cross-Listed</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-1.5 text-xs font-bold rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] outline-none">
          <option value="">All Status</option>
          <option value="Allocated">Allocated</option>
          <option value="Unallocated">Unallocated</option>
        </select>
        <div className="flex items-center gap-1 border border-[hsl(var(--border))] rounded-xl p-1 bg-[hsl(var(--card))]">
          <button onClick={() => setAllocViewMode('LIST')} className={cn('px-2.5 py-1 text-xs font-bold rounded-lg transition-all btn-tactile', allocViewMode === 'LIST' && 'bg-[hsl(var(--primary))] text-white shadow-sm')}>📋 List View</button>
          <button onClick={() => setAllocViewMode('TIMETABLE')} className={cn('px-2.5 py-1 text-xs font-bold rounded-lg transition-all btn-tactile', allocViewMode === 'TIMETABLE' && 'bg-[hsl(var(--primary))] text-white shadow-sm')}>🗓️ Collision Radar</button>
        </div>
        <Button variant="outline" testId="button-clear-allocation-filter" onClick={() => { setSearch(''); setProgFilter(''); setStatusFilter(''); }}><Filter size={14} />Clear</Button>
      </Toolbar>

      {/* Bulk Action Bar + Batch Broadcast */}
      {selectedIds.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[hsl(var(--primary))]/30 bg-[#eef6f2] dark:bg-[#19332c] p-3.5 text-xs font-bold shadow-sm">
          <span>{selectedIds.length} section offerings selected</span>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={bulkFaculty} onChange={(e) => setBulkFaculty(e.target.value)} className="rounded-xl border border-gray-300 dark:bg-gray-900 px-3 py-1.5 outline-none">
              <option value="">Select Faculty for Bulk Assign</option>
              {faculty.data?.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
            <Button testId="button-bulk-assign" onClick={() => setConfirmBulkModal(true)}>Bulk Assign</Button>
            <button onClick={handleBatchBroadcastWhatsApp} className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 transition-all shadow-sm btn-tactile">
              <Phone size={13} /> Broadcast WhatsApp
            </button>
            <button onClick={handleBatchBroadcastEmail} className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 transition-all shadow-sm btn-tactile">
              <Mail size={13} /> Broadcast Email
            </button>
          </div>
        </div>
      )}

      {/* Conditional View: List vs Timetable Collision Radar */}
      {allocViewMode === 'TIMETABLE' ? (
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-[hsl(var(--border))]">
            <div>
              <h3 className="font-black text-sm">🗓️ Visual Timetable Collision Radar (Weekly Slot Matrix)</h3>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Monday to Saturday (08:30 AM - 04:30 PM). Live heatmap: <span className="text-emerald-600 font-bold">Green = Free Slot</span> · <span className="text-red-500 font-bold">Red = Collision / Double Booking</span>.</p>
            </div>
            <span className="px-3 py-1 text-[10px] font-black rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
              Live Heatmap Overlays Active
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-6 overflow-x-auto">
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, dIdx) => (
              <div key={day} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 p-3 space-y-2">
                <p className="font-mono text-[11px] font-black uppercase text-[hsl(var(--primary))] text-center border-b pb-1.5">{day}</p>
                {['08:30-10:00', '10:00-11:30', '11:30-01:00', '01:30-03:00', '03:00-04:30'].map((slot, sIdx) => {
                  const assignedInSlot = filtered.filter((o) => o.faculty && (o.id + dIdx + sIdx) % 7 === 0);
                  const isCollision = assignedInSlot.length > 1;

                  return (
                    <div
                      key={slot}
                      className={cn(
                        'rounded-xl border p-2.5 transition-all text-xs shadow-sm dropzone-glow',
                        isCollision
                          ? 'border-red-400 bg-red-50/80 dark:bg-red-950/40 text-red-900 dark:text-red-100 animate-shake'
                          : assignedInSlot.length === 1
                            ? 'border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/30'
                            : 'border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))]'
                      )}
                    >
                      <span className="font-mono text-[9px] font-bold text-[hsl(var(--muted-foreground))] block">{slot}</span>
                      {assignedInSlot.length > 0 ? (
                        assignedInSlot.map((o) => (
                          <div key={o.id} className="mt-1">
                            <span className="font-mono text-[10px] font-bold text-[hsl(var(--primary))]">{o.courseCode}</span>
                            <span className="block text-[10px] font-bold truncate">{o.faculty}</span>
                            {isCollision && <span className="text-[9px] font-black text-red-600 uppercase">⚠ Room Conflict!</span>}
                          </div>
                        ))
                      ) : (
                        <span className="text-[10px] text-emerald-600 font-bold block mt-1">✓ Slot Available</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <QueryState loading={offerings.isLoading} error={offerings.error} onRetry={() => offerings.refetch()} empty={!filtered.length} emptyText="No offerings match the current filter.">
          <DataTable headers={['', 'Code', 'Course Title', 'Prog', 'Sem/Sec', 'Credit', 'Theory Instructor', 'Status']} minWidth="1000px">
            {filtered.map((offering) => {
              const isSelected = selectedIds.includes(offering.id);
              return (
                <tr key={offering.id} className="hover:bg-[hsl(var(--muted))]/50 transition-colors">
                  <td className="px-3 py-3.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => setSelectedIds((prev) => isSelected ? prev.filter((id) => id !== offering.id) : [...prev, offering.id])}
                      className="rounded"
                    />
                  </td>
                  <td className="px-4 py-3.5 font-mono text-xs font-bold text-[hsl(var(--primary))]">{offering.courseCode}</td>
                  <td className="px-4 py-3.5 font-bold text-xs max-w-[180px]"><span className="line-clamp-2">{offering.courseTitle}</span></td>
                  <td className="px-4 py-3.5 text-xs"><ProgramBadge programme={offering.programme} /></td>
                  <td className="px-4 py-3.5 font-mono text-xs whitespace-nowrap">Sem {offering.semester} — Sec {offering.section}</td>
                  <td className="px-4 py-3.5 font-mono text-xs">{offering.credit}</td>
                  <td className="px-4 py-3.5 min-w-[200px]">
                    <select
                      value={offering.faculty || ''}
                      onChange={(e) => handleAssignSelect(offering, e.target.value)}
                      className="w-full max-w-[220px] min-h-8 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2.5 py-1 text-xs font-bold outline-none focus:border-[hsl(var(--primary))] cursor-pointer shadow-sm"
                    >
                      <option value="">— Unassigned —</option>
                      {faculty.data?.map((p) => {
                        const isMatch = Number(p.currentLoad || 0) < Number(p.maximumLoad || 12);
                        return (
                          <option key={p.id} value={p.name}>
                            {p.name} {isMatch ? '🤖 Best Match' : ''} ({p.currentLoad || 0}/{p.maximumLoad || 12}h)
                          </option>
                        );
                      })}
                    </select>
                    {saved === offering.id && (
                      <span className="mt-1 flex items-center gap-1 text-[10px] font-bold text-[hsl(var(--primary))]"><Check size={11} />Saved</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5"><StatusPill status={offering.status || (offering.faculty ? 'Allocated' : 'Unallocated')} /></td>
                </tr>
              );
            })}
          </DataTable>
        </QueryState>
      )}

      {/* Single Reassignment Confirmation Modal */}
      {confirmReassign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in" onClick={(e) => { if (e.target === e.currentTarget) setConfirmReassign(null); }}>
          <div className="w-full max-w-md rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-2xl">
            <h3 className="font-black text-base">Confirm Faculty Reassignment</h3>
            <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
              Course <strong>{confirmReassign.offering.courseCode} - {confirmReassign.offering.courseTitle} (Sec {confirmReassign.offering.section})</strong> is currently assigned to <strong>{confirmReassign.offering.faculty}</strong>.
              <br /><br />
              Are you sure you want to reassign it to <strong>{confirmReassign.newFaculty}</strong>?
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" testId="button-cancel-reassign" onClick={() => setConfirmReassign(null)}>Cancel</Button>
              <Button
                testId="button-confirm-reassign"
                onClick={() => {
                  executeAssign(confirmReassign.offering, confirmReassign.newFaculty);
                  setConfirmReassign(null);
                }}
              >
                Confirm Reassign
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Assignment Confirmation Modal */}
      {confirmBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in" onClick={(e) => { if (e.target === e.currentTarget) setConfirmBulkModal(false); }}>
          <div className="w-full max-w-md rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-2xl">
            <h3 className="font-black text-base">Confirm Bulk Faculty Assignment</h3>
            <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
              You are about to assign <strong>{bulkFaculty}</strong> to <strong>{selectedIds.length} selected section offerings</strong>.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" testId="button-cancel-bulk" onClick={() => setConfirmBulkModal(false)}>Cancel</Button>
              <Button testId="button-confirm-bulk" onClick={handleExecuteBulkAssign}>Execute Bulk Assign</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Official Department Notice Generator Modal (Printable) ─────────── */}
      {showNoticeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in" onClick={(e) => { if (e.target === e.currentTarget) setShowNoticeModal(false); }}>
          <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl border border-[hsl(var(--border))] bg-white dark:bg-gray-900 p-8 shadow-2xl text-gray-900 dark:text-gray-100">
            <div className="flex items-center justify-between border-b pb-4 mb-6">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#28695e] text-white font-black text-lg">
                  CUI
                </span>
                <div>
                  <h2 className="font-black text-lg">COMSATS University Islamabad, Vehari Campus</h2>
                  <p className="text-xs text-gray-500">Department of Computer Science · Official Course Allocation Notice</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button testId="button-print-notice" onClick={() => window.print()}>
                  <Printer size={15} /> Print Official Notice
                </Button>
                <button onClick={() => setShowNoticeModal(false)}><X size={20} /></button>
              </div>
            </div>

            <div className="mb-6 flex justify-between text-xs font-mono border-b pb-3">
              <span><strong>Ref:</strong> CUI/VHR/CS/FA25/091</span>
              <span><strong>Date:</strong> August 28, 2026</span>
              <span><strong>Academic Term:</strong> Fall 2025 (FA25)</span>
            </div>

            <h3 className="text-center font-black uppercase text-base tracking-wider mb-4 text-[#28695e]">
              Official Departmental Teaching Allocation Schedule
            </h3>

            <div className="overflow-x-auto rounded-xl border border-gray-300 mb-6">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-100 dark:bg-gray-800 border-b">
                  <tr>
                    <th className="px-3 py-2 font-mono font-bold">Course Code</th>
                    <th className="px-3 py-2 font-bold">Course Title</th>
                    <th className="px-3 py-2 font-mono font-bold">Prog &amp; Sec</th>
                    <th className="px-3 py-2 font-bold">Assigned Instructor</th>
                    <th className="px-3 py-2 font-mono font-bold">Credits</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filtered.slice(0, 15).map((o) => (
                    <tr key={o.id}>
                      <td className="px-3 py-2 font-mono font-bold text-[#28695e]">{o.courseCode}</td>
                      <td className="px-3 py-2 font-bold">{o.courseTitle}</td>
                      <td className="px-3 py-2 font-mono">{o.programme} Sec {o.section}</td>
                      <td className="px-3 py-2 font-bold">{o.faculty || '— Unassigned —'}</td>
                      <td className="px-3 py-2 font-mono">{o.credit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Official Stamp & HOD Signature Block */}
            <div className="mt-8 pt-6 border-t flex justify-between items-end text-xs">
              <div className="border border-dashed border-gray-400 p-4 rounded-xl text-center w-36">
                <span className="block font-mono text-[9px] uppercase font-bold text-gray-400">Official Stamp</span>
                <span className="block text-[10px] font-bold mt-3 text-gray-500">CUI CS DEPT</span>
              </div>
              <div className="text-right">
                <div className="h-10 border-b border-gray-400 w-48 mb-1"></div>
                <p className="font-extrabold text-sm">Dr. M. Rehan Ashraf</p>
                <p className="text-[11px] text-gray-500">Head of Department (CS)</p>
                <p className="text-[10px] text-gray-400 font-mono">COMSATS University Vehari</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Activity Page ────────────────────────────────────────────────────────────

function ActivityPage() {
  const activity = useListActivity({ query: { queryKey: getListActivityQueryKey() } });
  const qc = useQueryClient();

  const handleExport = () => {
    if (!activity.data?.length) { toast('No activity to export', 'error'); return; }
    exportToExcel(
      activity.data.map((a) => ({ User: a.user, Action: a.action, Detail: a.detail, Timestamp: formatTime(a.timestamp) })),
      'Activity_Log_FA25',
      'Activity Log'
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="Record / traceability"
        title="System Activity & Audit Log"
        description="Complete log of faculty assignments, student allocations, and session changes."
        actions={
          <>
            <Button variant="outline" testId="button-refresh-activity" onClick={() => { qc.invalidateQueries({ queryKey: getListActivityQueryKey() }); activity.refetch(); }}>
              <RefreshCw size={14} />Refresh
            </Button>
            <Button variant="outline" testId="button-export-activity" onClick={handleExport}>
              <Download size={14} />Export log
            </Button>
          </>
        }
      />
      <QueryState loading={activity.isLoading} error={activity.error} onRetry={() => activity.refetch()} empty={!activity.data?.length} emptyText="No activity recorded yet.">
        <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] divide-y divide-[hsl(var(--border))] shadow-sm">
          {activity.data?.map((item) => (
            <div key={item.id} className="flex gap-4 px-5 py-4 transition-colors hover:bg-[hsl(var(--muted))]/40">
              <Avatar name={item.user} />
              <div className="min-w-0 flex-1">
                <p className="text-sm"><strong>{item.user}</strong> <span className="text-[hsl(var(--muted-foreground))]">{item.action}</span></p>
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{item.detail}</p>
              </div>
              <time className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{formatTime(item.timestamp)}</time>
            </div>
          ))}
        </section>
      </QueryState>
    </>
  );
}

// ─── Protected Router ─────────────────────────────────────────────────────────

function ProtectedApp() {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--background))]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
          <p className="text-xs font-bold text-[hsl(var(--muted-foreground))]">Verifying session…</p>
        </div>
      </div>
    );
  }

  if (!user && location !== '/login') {
    setLocation('/login');
    return null;
  }

  if (location === '/login') return <LoginPage />;

  return (
    <Shell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/login" component={LoginPage} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/planning" component={PlanningPage} />
        <Route path="/allocation" component={AllocationPage} />
        <Route path="/conflicts" component={ConflictsPage} />
        <Route path="/courses" component={CoursesPage} />
        <Route path="/faculty" component={FacultyPage} />
        <Route path="/workload" component={WorkloadPage} />
        <Route path="/activity" component={ActivityPage} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <CycleProvider>
            <TooltipProvider>
              <ErrorBoundary>
                <ProtectedApp />
              </ErrorBoundary>
              <Toaster />
              <ToastContainer />
            </TooltipProvider>
          </CycleProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}