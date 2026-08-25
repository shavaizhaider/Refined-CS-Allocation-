import { type ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import NotFound from '@/pages/not-found';
import LoginPage from '@/pages/login';
import StudentAllocationPage from '@/pages/student-allocation';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import {
  Activity as ActivityIcon,
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  Clock3,
  Download,
  FileSpreadsheet,
  Filter,
  GraduationCap,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreHorizontal,
  Network,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Upload,
  Users,
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
  useUpdateAllocation,
  type Activity as ActivityRecord,
  type Offering,
} from '@workspace/api-client-react';
import { Link, Route, Switch, useLocation } from 'wouter';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

const queryClient = new QueryClient();

function cn(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function initials(value: string) {
  return value.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function formatTime(value?: string) {
  if (!value) return 'Just now';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function StatusPill({ status }: { status?: string }) {
  const normalized = (status || 'pending').toLowerCase();
  const styles = normalized.includes('over') || normalized.includes('conflict')
    ? 'bg-[#f7e3df] text-[#a8493f]'
    : normalized.includes('allocated') || normalized.includes('approved') || normalized.includes('active') || normalized.includes('balanced')
      ? 'bg-[#dcebe5] text-[#28695e]'
      : normalized.includes('near') || normalized.includes('review')
        ? 'bg-[#f7ecd0] text-[#8b681d]'
        : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]';
  return <span data-testid={`status-${normalized}`} className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em]', styles)}>{status || 'Pending'}</span>;
}

function Avatar({ name, tone = 'teal' }: { name: string; tone?: 'teal' | 'amber' | 'navy' }) {
  const colors = { teal: 'bg-[#cfe4dc] text-[#28695e]', amber: 'bg-[#f4e0b0] text-[#79591b]', navy: 'bg-[#d8dee8] text-[#33445f]' };
  return <span data-testid={`avatar-${name.replaceAll(' ', '-').toLowerCase()}`} className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold', colors[tone])}>{initials(name)}</span>;
}

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={cn('skeleton rounded-lg', className)} aria-label="Loading content" data-testid="loading-skeleton" />;
}

function QueryState({ loading, error, onRetry, children, empty = false, emptyText = 'No records found.' }: { loading?: boolean; error?: unknown; onRetry?: () => void; children: ReactNode; empty?: boolean; emptyText?: string }) {
  if (loading) return <div className="space-y-3"><SkeletonBlock className="h-14 w-full" /><SkeletonBlock className="h-14 w-full" /><SkeletonBlock className="h-14 w-full" /></div>;
  if (error) return <div className="border border-[#e9beb8] bg-[#fff5f3] p-5 rounded-xl flex items-center justify-between gap-4" data-testid="state-error"><div><p className="font-bold text-[#933f36]">We couldn't load this view.</p><p className="mt-1 text-sm text-[#a8493f]">The decision record is safe. Try again in a moment.</p></div><button data-testid="button-retry" onClick={onRetry} className="rounded-md border border-[#d99e96] px-3 py-2 text-sm font-bold text-[#933f36] hover:bg-[#fae5e1]">Retry</button></div>;
  if (empty) return <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-14 text-center" data-testid="state-empty"><div className="mb-3 rounded-full bg-[hsl(var(--muted))] p-3 text-[hsl(var(--primary))]"><ClipboardList size={20} /></div><p className="font-bold">{emptyText}</p><p className="mt-1 max-w-sm text-sm text-[hsl(var(--muted-foreground))]">When records arrive, they will appear here.</p></div>;
  return <>{children}</>;
}

function Shell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const sessions = useListSessions({ query: { queryKey: getListSessionsQueryKey() } });
  const current = sessions.data?.find((session) => session.status.toLowerCase().includes('active')) || sessions.data?.[0];

  const adminNavGroups = [
    {
      label: 'Workspace',
      items: [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/planning', label: 'Planning', icon: SlidersHorizontal },
        { href: '/allocation', label: 'Allocation workspace', icon: Network },
      ],
    },
    {
      label: 'Directory',
      items: [
        { href: '/courses', label: 'Courses', icon: BookOpen },
        { href: '/faculty', label: 'Faculty', icon: Users },
        { href: '/workload', label: 'Workload matrix', icon: ClipboardList },
      ],
    },
    {
      label: 'Record',
      items: [
        { href: '/activity', label: 'Activity log', icon: ActivityIcon },
      ],
    },
  ];

  const studentNavGroups = [
    {
      label: 'Student Portal',
      items: [
        { href: '/student/allocation', label: 'Course Allocation', icon: BookOpen },
      ],
    },
  ];

  const navGroups = user?.role === 'STUDENT' ? studentNavGroups : adminNavGroups;

  return (
    <div className="noise min-h-[100dvh] bg-[hsl(var(--background))]">
      <aside className={cn('fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col border-r border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] px-4 py-5 text-[hsl(var(--sidebar-foreground))] transition-transform duration-200 lg:translate-x-0', mobileOpen ? 'translate-x-0' : '-translate-x-full')} data-testid="sidebar">
        <div className="flex items-center justify-between px-3 pb-8">
          <Link href={user?.role === 'STUDENT' ? '/student/allocation' : '/dashboard'} data-testid="link-brand" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))]">
              <GraduationCap size={21} />
            </span>
            <span>
              <span className="block text-[15px] font-extrabold tracking-[-.03em] text-[#f5f1e9]">CUI CS System</span>
              <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[.16em] text-[#aeb7bd]">Vehari Campus</span>
            </span>
          </Link>
          <button data-testid="button-close-menu" onClick={() => setMobileOpen(false)} className="rounded-md p-2 text-[#aeb7bd] hover:bg-[hsl(var(--sidebar-accent))] lg:hidden">
            <X size={17} />
          </button>
        </div>

        <div className="mb-6 rounded-xl border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-accent))] p-3">
          <p className="font-mono text-[9px] uppercase tracking-[.16em] text-[#aeb7bd]">Active Cycle</p>
          <div className="mt-2 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-[#f5f1e9]">{current?.code || 'Fall 2025'}</p>
              <p className="mt-0.5 text-[11px] text-[#aeb7bd]">{current?.label || 'Course Allocation'}</p>
            </div>
            <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-[#244c47] text-[#d8efe6] uppercase">
              {user?.role || 'GUEST'}
            </span>
          </div>
        </div>

        <nav className="flex-1 space-y-7 overflow-y-auto scrollbar-thin" aria-label="Primary navigation">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-2 px-3 font-mono text-[9px] font-medium uppercase tracking-[.2em] text-[#82909a]">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = location === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'group flex items-center justify-between rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-colors',
                        active ? 'bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))]' : 'text-[#b7c0c4] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[#f5f1e9]'
                      )}
                    >
                      <span className="flex items-center gap-3">
                        <Icon size={16} strokeWidth={active ? 2.5 : 1.8} />
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-[hsl(var(--sidebar-border))] pt-4">
          <div className="flex items-center gap-3 rounded-xl bg-[#172630] p-3 mb-2">
            <Avatar name={user?.name || 'User'} tone={user?.role === 'ADMIN' ? 'amber' : 'teal'} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-[#f5f1e9]">{user?.name || 'User'}</p>
              <p className="truncate text-[10px] text-[#aeb7bd]">{user?.email || 'Logged in'}</p>
            </div>
          </div>
          <button
            onClick={() => {
              logout();
              setLocation('/login');
            }}
            className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-extrabold text-[#e9beb8] bg-[#2a1d1c] hover:bg-[#3d2624] transition-colors"
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-[#13212b]/45 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <div className="lg:pl-[272px]">
        <header className="sticky top-0 z-20 flex h-[70px] items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/95 px-5 backdrop-blur lg:px-9">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="rounded-md p-2 hover:bg-[hsl(var(--muted))] lg:hidden">
              <Menu size={20} />
            </button>
            <div className="hidden items-center gap-2 text-xs text-[hsl(var(--muted-foreground))] sm:flex">
              <span>Computer Science</span>
              <span className="text-[hsl(var(--border))]">/</span>
              <span className="font-semibold text-[hsl(var(--foreground))]">
                {user?.role === 'STUDENT' ? 'Student Allocation Workspace' : 'HOD Allocation Dashboard'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-[#eef6f2] text-[#28695e] border border-[#bcd8cb]">
              {user?.name} ({user?.role})
            </span>
          </div>
        </header>

        <main className="mx-auto max-w-[1600px] px-5 py-8 lg:px-9">{children}</main>
      </div>
    </div>
  );
}

function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
      <div>
        <p className="font-mono text-[10px] font-medium uppercase tracking-[.2em] text-[hsl(var(--primary))]">{eyebrow}</p>
        <h1 data-testid={`heading-${title.toLowerCase().replaceAll(' ', '-')}`} className="mt-2 font-display text-[clamp(2rem,3vw,3.2rem)] leading-[.95] tracking-[-.045em] text-[hsl(var(--foreground))]">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

function Button({ children, variant = 'primary', onClick, testId, disabled = false }: { children: ReactNode; variant?: 'primary' | 'outline' | 'quiet' | 'danger'; onClick?: () => void; testId: string; disabled?: boolean }) {
  return (
    <button
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-9 items-center justify-center gap-2 rounded-md px-3.5 text-xs font-extrabold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm hover:-translate-y-px hover:bg-[#245f58]',
        variant === 'outline' && 'border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]',
        variant === 'quiet' && 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]',
        variant === 'danger' && 'border border-[#e9beb8] bg-[#fff5f3] text-[#a8493f] hover:bg-[#f7e3df]'
      )}
    >
      {children}
    </button>
  );
}

function MetricCard({ label, value, note, tone = 'default', icon: Icon }: { label: string; value: string | number; note: string; tone?: 'default' | 'alert' | 'warm'; icon: typeof Users }) {
  return (
    <div className={cn('group relative overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 transition-transform duration-200 hover:-translate-y-0.5', tone === 'alert' && 'border-[#e9beb8] bg-[#fff9f7]', tone === 'warm' && 'bg-[#fffaf0]')}>
      <div className="mb-7 flex items-center justify-between">
        <span className="text-[11px] font-extrabold uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">{label}</span>
        <span className={cn('rounded-md bg-[hsl(var(--muted))] p-2 text-[hsl(var(--primary))]', tone === 'alert' && 'bg-[#f7e3df] text-[#a8493f]', tone === 'warm' && 'bg-[#f7ecd0] text-[#8b681d]')}>
          <Icon size={16} />
        </span>
      </div>
      <div className="font-mono text-3xl font-medium tracking-[-.06em] text-[hsl(var(--foreground))]">{value}</div>
      <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">{note}</p>
    </div>
  );
}

function DashboardPage() {
  const dashboard = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey() } });
  const sessions = useListSessions({ query: { queryKey: getListSessionsQueryKey() } });
  const approve = useApproveSession();
  const [, setLocation] = useLocation();

  return (
    <PageHeader
      eyebrow="Department operations / Fall 2025"
      title="HOD Course Allocation Dashboard"
      description="Real CS Department course offerings and faculty assignments imported from FA25 master schedule."
      actions={
        <>
          <Button variant="outline" testId="button-refresh-dashboard" onClick={() => dashboard.refetch()}>
            <RefreshCw size={14} />Refresh
          </Button>
          <Button testId="button-open-allocation" onClick={() => setLocation('/allocation')}>
            <Zap size={14} />Open workspace
          </Button>
          {sessions.data?.[0] && (
            <Button variant="quiet" testId="button-approve-session" disabled={approve.isPending} onClick={() => approve.mutate({ id: sessions.data[0].id })}>
              {approve.isPending ? 'Approving…' : 'Approve cycle'}
            </Button>
          )}
        </>
      }
    />
  );
}

function DashboardContent() {
  const dashboard = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey() } });
  const summary = dashboard.data;
  const programmes = summary?.programmes || [];
  return (
    <QueryState loading={dashboard.isLoading} error={dashboard.error} onRetry={() => dashboard.refetch()} empty={!summary} emptyText="No active session summary yet.">
      <div className="space-y-7 animate-rise-in">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Offerings" value={summary?.totals.allocated ?? 0} note={`${summary?.totals.remaining ?? 0} unallocated section offerings`} icon={BookOpen} />
          <MetricCard label="Real Faculty" value={`${summary?.totals.faculty ?? 0}`} note={`${summary?.totals.permanentFaculty ?? 0} permanent · ${summary?.totals.visitingFaculty ?? 0} visiting`} icon={Users} />
          <MetricCard label="At capacity" value={summary?.totals.overloaded ?? 0} note="Faculty members at max workload" tone="alert" icon={AlertTriangle} />
          <MetricCard label="Open conflicts" value={summary?.conflicts ?? 0} note="Review before final approval" tone="warm" icon={CircleHelp} />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.35fr_.85fr]">
          <section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 lg:p-6">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2 className="text-base font-extrabold tracking-[-.02em]">Programme Allocation Progress</h2>
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Allocated section offerings by academic programme.</p>
              </div>
              <Link href="/planning" className="flex items-center gap-1 text-xs font-extrabold text-[hsl(var(--primary))] hover:gap-2">
                View plan <ArrowRight size={14} />
              </Link>
            </div>
            <div className="space-y-5">
              {programmes.length ? (
                programmes.map((item) => {
                  const percent = Math.round((item.allocated / Math.max(item.total, 1)) * 100);
                  return (
                    <div key={item.programme}>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-sm font-bold">{item.programme}</span>
                        <span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">
                          {item.allocated}/{item.total} offerings assigned
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
                        <div className="h-full rounded-full bg-[hsl(var(--primary))] transition-all duration-500" style={{ width: `${percent}%` }} />
                      </div>
                      <div className="mt-2 flex justify-between text-[11px] text-[hsl(var(--muted-foreground))]">
                        <span>{item.workload} projected credit hours</span>
                        <span className="font-bold text-[hsl(var(--primary))]">{percent}% ready</span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">Programme data will appear after loading.</p>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 lg:p-6">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2 className="text-base font-extrabold tracking-[-.02em]">Faculty Load Status</h2>
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Teaching load status for department faculty.</p>
              </div>
              <Link href="/workload" className="text-xs font-extrabold text-[hsl(var(--primary))]">
                Matrix <ArrowRight className="ml-1 inline" size={14} />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['Balanced', summary?.workload.balanced ?? 0, 'bg-[#dcebe5] text-[#28695e]'],
                ['Near maximum', summary?.workload.nearMaximum ?? 0, 'bg-[#f7ecd0] text-[#8b681d]'],
                ['Underloaded', summary?.workload.underloaded ?? 0, 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'],
                ['Overloaded', summary?.workload.overloaded ?? 0, 'bg-[#f7e3df] text-[#a8493f]'],
              ].map(([label, value, cls]) => (
                <div key={String(label)} className="rounded-lg border border-[hsl(var(--border))] p-3">
                  <div className={cn('mb-4 inline-flex rounded-md px-2 py-1 text-[10px] font-bold', cls as string)}>{label}</div>
                  <p className="font-mono text-2xl">{value}</p>
                  <p className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">faculty</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <ActivityPanel activities={summary?.activity || []} />
      </div>
    </QueryState>
  );
}

function ActivityPanel({ activities }: { activities: ActivityRecord[] }) {
  return (
    <section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 lg:p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-base font-extrabold">Recent Allocation Activity</h2>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Audit log of system actions and student allocations.</p>
        </div>
        <Link href="/activity" className="text-xs font-extrabold text-[hsl(var(--primary))]">
          Full log <ArrowRight className="ml-1 inline" size={14} />
        </Link>
      </div>
      {activities.length ? (
        <div className="divide-y divide-[hsl(var(--border))]">
          {activities.slice(0, 5).map((activity) => (
            <div key={activity.id} className="flex items-center gap-3 py-3">
              <Avatar name={activity.user} tone={activity.action.toLowerCase().includes('conflict') ? 'amber' : 'teal'} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  <strong>{activity.user}</strong> {activity.action.toLowerCase()}
                </p>
                <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{activity.detail}</p>
              </div>
              <time className="hidden shrink-0 font-mono text-[10px] text-[hsl(var(--muted-foreground))] sm:block">
                {formatTime(activity.timestamp)}
              </time>
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
  return (
    <>
      <DashboardPage />
      <DashboardContent />
    </>
  );
}

function DataTable({ headers, children, minWidth = '760px' }: { headers: string[]; children: ReactNode; minWidth?: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/50">
          <tr>
            {headers.map((header) => (
              <th key={header} className="whitespace-nowrap px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[hsl(var(--border))]">{children}</tbody>
      </table>
    </div>
  );
}

function SearchBar({ value, onChange, placeholder, testId = 'input-search' }: { value: string; onChange: (value: string) => void; placeholder: string; testId?: string }) {
  return (
    <label className="flex min-h-9 min-w-[220px] flex-1 items-center gap-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-[hsl(var(--muted-foreground))] focus-within:border-[hsl(var(--primary))]">
      <Search size={15} />
      <input data-testid={testId} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full bg-transparent text-xs outline-none placeholder:text-[hsl(var(--muted-foreground))]" />
    </label>
  );
}

function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-col gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 sm:flex-row sm:items-center">{children}</div>;
}

function CoursesPage() {
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ code: '', title: '', programme: 'BSCS', semester: '1', credit: '3(3,0)', theory: 3, lab: 0, category: 'Core' });
  const courses = useListCourses({ search: search || undefined }, { query: { queryKey: getListCoursesQueryKey({ search: search || undefined }) } });
  const create = useCreateCourse();
  const qc = useQueryClient();
  const submit = () => {
    if (!form.code || !form.title) return;
    create.mutate({ data: form }, { onSuccess: () => { setAdding(false); setForm({ ...form, code: '', title: '' }); qc.invalidateQueries({ queryKey: getListCoursesQueryKey() }); } });
  };
  return (
    <>
      <PageHeader eyebrow="Directory / curriculum" title="Real CS Course Catalogue" description="Official computer science department courses from FA25 master schedule." actions={<Button testId="button-add-course" onClick={() => setAdding(true)}><Plus size={15} />Add course</Button>} />
      <Toolbar>
        <SearchBar value={search} onChange={setSearch} placeholder="Search course code or title…" testId="input-course-search" />
        <Button variant="outline" testId="button-course-filter" onClick={() => setSearch('')}><Filter size={14} />Clear search</Button>
        <span className="hidden text-xs text-[hsl(var(--muted-foreground))] sm:block">{courses.data?.length ?? 0} courses</span>
      </Toolbar>
      {adding && (
        <div className="mb-4 rounded-xl border border-[hsl(var(--primary))]/30 bg-[#eef6f2] p-4" data-testid="form-add-course">
          <div className="mb-3 flex items-center justify-between"><h3 className="font-extrabold">Add New Course</h3><button onClick={() => setAdding(false)}><X size={17} /></button></div>
          <div className="grid gap-2 md:grid-cols-4">
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CSC301" className="field border px-3 py-2 text-xs rounded" />
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Operating Systems" className="field md:col-span-2 border px-3 py-2 text-xs rounded" />
            <select value={form.programme} onChange={(e) => setForm({ ...form, programme: e.target.value })} className="field border px-3 py-2 text-xs rounded">
              <option value="BSCS">BSCS</option>
              <option value="BSSE">BSSE</option>
              <option value="MSCS">MSCS</option>
            </select>
          </div>
          <div className="mt-3 flex justify-end">
            <Button testId="button-save-course" onClick={submit} disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Save course'}</Button>
          </div>
        </div>
      )}
      <QueryState loading={courses.isLoading} error={courses.error} onRetry={() => courses.refetch()} empty={!courses.data?.length} emptyText={search ? 'No courses match that search.' : 'No courses found.'}>
        <DataTable headers={['Course Code', 'Course Title', 'Programme', 'Semester', 'Credit', 'Theory/Lab', 'Category', 'Status']} minWidth="820px">
          {courses.data?.map((course) => (
            <tr key={course.id} className="group transition-colors hover:bg-[hsl(var(--muted))]/50">
              <td className="px-4 py-3.5"><p className="font-mono text-xs font-bold text-[hsl(var(--primary))]">{course.code}</p></td>
              <td className="px-4 py-3.5 font-bold text-xs">{course.title}</td>
              <td className="px-4 py-3.5 text-xs">{course.programme}</td>
              <td className="px-4 py-3.5 font-mono text-xs">Sem {course.semester}</td>
              <td className="px-4 py-3.5 font-mono text-xs">{course.credit}</td>
              <td className="px-4 py-3.5 text-xs">{course.theory} th {course.lab ? `· ${course.lab} lab` : ''}</td>
              <td className="px-4 py-3.5 text-xs">{course.category}</td>
              <td className="px-4 py-3.5"><StatusPill status={course.status} /></td>
            </tr>
          ))}
        </DataTable>
      </QueryState>
    </>
  );
}

function FacultyPage() {
  const [search, setSearch] = useState('');
  const faculty = useListFaculty({ search: search || undefined }, { query: { queryKey: getListFacultyQueryKey({ search: search || undefined }) } });
  return (
    <>
      <PageHeader eyebrow="Directory / people" title="Real CS Faculty Directory" description="Permanent & Visiting Faculty imported from CUI CS FA25 schedule." actions={<Button variant="outline" testId="button-export-faculty"><Download size={14} />Export directory</Button>} />
      <Toolbar>
        <SearchBar value={search} onChange={setSearch} placeholder="Search faculty name..." testId="input-faculty-search" />
        <Button variant="outline" testId="button-faculty-type" onClick={() => setSearch('')}><Filter size={14} />Clear search</Button>
      </Toolbar>
      <QueryState loading={faculty.isLoading} error={faculty.error} onRetry={() => faculty.refetch()} empty={!faculty.data?.length} emptyText="No faculty match this search.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {faculty.data?.map((person) => (
            <div key={person.id} className="group rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 transition-all hover:-translate-y-0.5 hover:border-[hsl(var(--primary))]/45">
              <div className="flex items-start gap-3">
                <Avatar name={person.name} tone={person.type === 'Visiting' ? 'amber' : 'teal'} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="truncate text-sm font-extrabold">{person.name}</h3>
                      <p className="mt-0.5 text-[11px] text-[hsl(var(--muted-foreground))]">{person.designation} · {person.type}</p>
                    </div>
                    <StatusPill status={person.status} />
                  </div>
                  <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">
                    <span className="font-bold text-[hsl(var(--foreground))]">{person.programme || "BSCS"}</span>
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </QueryState>
    </>
  );
}

function WorkloadPage() {
  const workload = useListWorkload({ query: { queryKey: getListWorkloadQueryKey() } });
  return (
    <>
      <PageHeader eyebrow="Directory / teaching capacity" title="Faculty Workload Matrix" description="Real assigned teaching load and sections for FA25." actions={<Button variant="outline" testId="button-export-workload"><Download size={14} />Export matrix</Button>} />
      <QueryState loading={workload.isLoading} error={workload.error} onRetry={() => workload.refetch()} empty={!workload.data?.length} emptyText="Workload data loading...">
        <DataTable headers={['Faculty Member', 'Designation', 'Type', 'Assigned Courses', 'Theory Hours', 'Lab Hours', 'Total Load', 'Status']} minWidth="850px">
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

function AllocationPage() {
  const offerings = useListOfferings(undefined, { query: { queryKey: getListOfferingsQueryKey() } });
  const faculty = useListFaculty(undefined, { query: { queryKey: getListFacultyQueryKey() } });
  const update = useUpdateAllocation();
  const [saved, setSaved] = useState<number | null>(null);

  const assign = (offering: Offering, value: string) => {
    update.mutate(
      { id: offering.id, data: { faculty: value } },
      {
        onSuccess: () => {
          setSaved(offering.id);
          offerings.refetch();
          setTimeout(() => setSaved(null), 1800);
        },
      }
    );
  };

  return (
    <>
      <PageHeader eyebrow="Workspace / live allocation" title="Course Offering & Section Assignments" description="Assign faculty owners to real FA25 section offerings." />
      <QueryState loading={offerings.isLoading} error={offerings.error} onRetry={() => offerings.refetch()} empty={!offerings.data?.length} emptyText="No offerings available.">
        <DataTable headers={['Course Code', 'Course Title', 'Prog', 'Sem & Sec', 'Credit', 'Theory Instructor', 'Projected Workload', 'Status']} minWidth="960px">
          {offerings.data?.map((offering) => (
            <tr key={offering.id} className="hover:bg-[hsl(var(--muted))]/50">
              <td className="px-4 py-3.5 font-mono text-xs font-bold text-[hsl(var(--primary))]">{offering.courseCode}</td>
              <td className="px-4 py-3.5 font-bold text-xs">{offering.courseTitle}</td>
              <td className="px-4 py-3.5 text-xs">{offering.programme}</td>
              <td className="px-4 py-3.5 font-mono text-xs">Sem {offering.semester} — Sec {offering.section}</td>
              <td className="px-4 py-3.5 font-mono text-xs">{offering.credit}</td>
              <td className="px-4 py-3.5">
                <select
                  disabled={update.isPending}
                  value={offering.faculty || ''}
                  onChange={(e) => assign(offering, e.target.value)}
                  className="min-h-9 max-w-[210px] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 text-xs font-bold outline-none"
                >
                  <option value="">Unassigned</option>
                  {faculty.data?.map((person) => (
                    <option key={person.id} value={person.name}>{person.name}</option>
                  ))}
                </select>
                {saved === offering.id && <span className="ml-2 text-[10px] font-bold text-[hsl(var(--primary))]"><Check size={12} className="mr-1 inline" />Saved</span>}
              </td>
              <td className="px-4 py-3.5 font-mono text-xs">{offering.projectedWorkload}h</td>
              <td className="px-4 py-3.5"><StatusPill status={offering.status || (offering.faculty ? 'Allocated' : 'Unallocated')} /></td>
            </tr>
          ))}
        </DataTable>
      </QueryState>
    </>
  );
}

function PlanningPage() {
  const sessions = useListSessions({ query: { queryKey: getListSessionsQueryKey() } });
  const active = sessions.data?.find((session) => session.status.toLowerCase().includes('active')) || sessions.data?.[0];
  return (
    <>
      <PageHeader eyebrow="Workspace / planning" title="Semester Planning Workspace" description="Fall 2025 allocation cycle planning and session management." />
      <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <h2 className="font-display text-2xl font-bold">{active?.code || 'FA25'} — {active?.label || 'Fall 2025'}</h2>
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Status: {active?.status || 'Allocation in Progress'}</p>
      </div>
    </>
  );
}

function ActivityPage() {
  const activity = useListActivity({ query: { queryKey: getListActivityQueryKey() } });
  return (
    <>
      <PageHeader eyebrow="Record / traceability" title="System Activity & Audit Log" description="Complete log of faculty assignments, student allocations, and session changes." />
      <QueryState loading={activity.isLoading} error={activity.error} onRetry={() => activity.refetch()} empty={!activity.data?.length} emptyText="No activity recorded.">
        <section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] divide-y divide-[hsl(var(--border))]">
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

function ProtectedApp() {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--background))]">
        <div className="text-xs font-bold text-[hsl(var(--muted-foreground))]">Verifying authentication...</div>
      </div>
    );
  }

  if (!user && location !== '/login') {
    setLocation('/login');
    return null;
  }

  if (location === '/login') {
    return <LoginPage />;
  }

  return (
    <Shell>
      <Switch>
        <Route path="/" component={user?.role === 'STUDENT' ? StudentAllocationPage : Dashboard} />
        <Route path="/login" component={LoginPage} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/student/allocation" component={StudentAllocationPage} />
        <Route path="/planning" component={PlanningPage} />
        <Route path="/allocation" component={AllocationPage} />
        <Route path="/courses" component={CoursesPage} />
        <Route path="/faculty" component={FacultyPage} />
        <Route path="/workload" component={WorkloadPage} />
        <Route path="/activity" component={ActivityPage} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <ErrorBoundary>
            <ProtectedApp />
          </ErrorBoundary>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}