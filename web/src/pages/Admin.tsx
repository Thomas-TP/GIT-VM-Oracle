import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useToast } from '../toast';
import type { AuditEntry, Metrics, OsPreset, PerfPreset, PresetCatalog, Status, VmRequest } from '../types';
import { Button, Card, IconDownload, IconPlay, IconReboot, IconStop, IconTrash, Select, Spinner, TableSkeleton } from '../ui';
import { fmtDate } from '../lib/format';
import { OsIcon } from '../components/OsIcon';
import { RequestsTable } from '../components/RequestsTable';
import { UsersPanel } from '../components/UsersPanel';

type Tab = 'overview' | 'requests' | 'machines' | 'users' | 'monitoring';
const PER_PAGE = 10;

/* ---------- shared bits ---------- */
function StatCard({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
    </Card>
  );
}
function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
    </Card>
  );
}
function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

/* ---------- nav ---------- */
const TabIcon = ({ d }: { d: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const ICONS: Record<Tab, string> = {
  overview: 'M4 13h6V4H4zM14 20h6v-9h-6zM14 4v4h6V4zM4 20h6v-4H4z',
  requests: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  machines: 'M5 4h14a2 2 0 0 1 2 2v3H3V6a2 2 0 0 1 2-2zM3 15h18v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM7 7h.01M7 18h.01',
  users: 'M16 21v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  monitoring: 'M22 12h-4l-3 9L9 3l-3 9H2',
};

export function Admin() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('overview');

  // Shared queries (fetched once, passed down).
  const presetsQ = useQuery({ queryKey: ['presets'], queryFn: api.presets });
  const statsQ = useQuery({ queryKey: ['admin-stats'], queryFn: api.adminStats, refetchInterval: 10000 });
  const metricsQ = useQuery({ queryKey: ['admin-metrics'], queryFn: api.adminMetrics, refetchInterval: 15000 });
  const allQ = useQuery({
    queryKey: ['admin-all'],
    queryFn: () => api.adminList(''),
    refetchInterval: (q) => ((q.state.data ?? []).some((r) => r.status === 'provisioning') ? 5000 : 15000),
  });

  const catalog = presetsQ.data;
  const rows = allQ.data ?? [];
  const stats = statsQ.data ?? {};
  const pending = stats.pending ?? 0;

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'overview', label: t('admin.navOverview') },
    { id: 'requests', label: t('admin.navRequests'), badge: pending },
    { id: 'machines', label: t('admin.navMachines') },
    { id: 'users', label: t('admin.navUsers') },
    { id: 'monitoring', label: t('admin.navMonitoring') },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">GIT Cloud</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('admin.title')}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{t('admin.subtitle')}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[210px_1fr]">
        <aside className="lg:sticky lg:top-20 lg:h-fit">
          <nav className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {tabs.map((tb) => (
              <button
                key={tb.id}
                onClick={() => setTab(tb.id)}
                className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  tab === tb.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                }`}
              >
                <TabIcon d={ICONS[tb.id]} />
                <span>{tb.label}</span>
                {tb.badge ? (
                  <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-amber-500/15 px-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                    {tb.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
        </aside>

        <div className="min-w-0">
          {tab === 'overview' && <OverviewSection stats={stats} metrics={metricsQ.data} />}
          {tab === 'requests' && <RequestsSection rows={rows} loading={allQ.isLoading} catalog={catalog} />}
          {tab === 'machines' && <MachinesSection rows={rows} loading={allQ.isLoading} catalog={catalog} />}
          {tab === 'users' && <UsersSection rows={rows} />}
          {tab === 'monitoring' && <MonitoringSection grafanaUrl={catalog?.grafanaUrl} />}
        </div>
      </div>
    </div>
  );
}

/* ---------- Overview ---------- */
function OverviewSection({ stats, metrics }: { stats: Record<string, number>; metrics?: Metrics }) {
  const { t } = useTranslation();
  const auditQ = useQuery({ queryKey: ['admin-audit', 8], queryFn: () => api.adminAudit(8), refetchInterval: 15000 });
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t('status.pending')} value={stats.pending ?? 0} dot="bg-amber-500" />
        <StatCard label={t('status.provisioning')} value={stats.provisioning ?? 0} dot="bg-blue-500" />
        <StatCard label={t('status.active')} value={stats.active ?? 0} dot="bg-emerald-500" />
        <StatCard label={t('status.failed')} value={stats.failed ?? 0} dot="bg-red-500" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t('status.expired')} value={stats.expired ?? 0} dot="bg-orange-500" />
        <StatCard label={t('status.terminated')} value={stats.terminated ?? 0} dot="bg-zinc-400" />
        <StatCard label={t('status.rejected')} value={stats.rejected ?? 0} dot="bg-red-500" />
        <MetricCard label={t('metric.total')} value={String(metrics?.total ?? 0)} />
      </div>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('admin.recent')}</h3>
        </div>
        <AuditList entries={auditQ.data ?? []} compact />
      </Card>
    </div>
  );
}

/* ---------- Requests ---------- */
function RequestsSection({ rows, loading, catalog }: { rows: VmRequest[]; loading: boolean; catalog?: PresetCatalog }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Status | ''>('');
  const [search, setSearch] = useState('');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);

  const presetMap = useMemo(() => {
    const m: Record<string, PerfPreset> = {};
    catalog?.perf.forEach((p) => (m[p.id] = p));
    return m;
  }, [catalog]);

  const eff = (r: VmRequest): Status => (r.expired_at ? 'expired' : r.status);
  const display = useMemo(() => {
    const q = search.trim().toLowerCase();
    let r = rows;
    if (filter) r = r.filter((x) => eff(x) === filter);
    if (q) r = r.filter((x) => x.user_email.toLowerCase().includes(q) || x.purpose.toLowerCase().includes(q));
    return [...r].sort((a, b) => (sortAsc ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at)));
  }, [rows, filter, search, sortAsc]);

  const pageCount = Math.max(1, Math.ceil(display.length / PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = display.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionTitle title={t('admin.all')} hint={t('admin.requestsHint')} />
        <div className="flex flex-wrap items-end gap-2">
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder={t('admin.search')}
            className="h-9 w-44 rounded-lg border border-border bg-background px-3 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/15"
          />
          <a href={api.csvUrl} download className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium transition hover:bg-muted">
            <IconDownload className="h-4 w-4" /> {t('admin.exportCsv')}
          </a>
          <Select value={filter} onChange={(e) => { setFilter(e.target.value as Status | ''); setPage(0); }} className="w-40">
            <option value="">{t('admin.allStatuses')}</option>
            {(['pending', 'provisioning', 'active', 'approved', 'rejected', 'failed', 'terminated', 'expired'] as Status[]).map((s) => (
              <option key={s} value={s}>{t(`status.${s}`)}</option>
            ))}
          </Select>
          <Button variant="secondary" onClick={() => setSortAsc((v) => !v)}>{sortAsc ? t('admin.oldest') : t('admin.newest')}</Button>
        </div>
      </div>

      {rows.some((r) => r.ext_requested_end) && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-sm">
          <span className="font-medium text-amber-700 dark:text-amber-400">
            {t('admin.pendingExt', { count: rows.filter((r) => r.ext_requested_end).length })}
          </span>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            {rows.filter((r) => r.ext_requested_end).map((r) => (
              <Link key={r.id} to={`/requests/${r.id}`} className="font-mono text-xs text-amber-700 underline-offset-2 hover:underline dark:text-amber-400">
                #{String(r.id).padStart(3, '0')} → {fmtDate(r.ext_requested_end)}
              </Link>
            ))}
          </div>
        </div>
      )}
      {loading ? (
        <TableSkeleton rows={6} />
      ) : (
        <>
          <RequestsTable rows={slice} presets={presetMap} admin />
          {pageCount > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{safePage + 1} / {pageCount}</span>
              <div className="flex gap-2">
                <Button variant="secondary" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>←</Button>
                <Button variant="secondary" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>→</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- Machines ---------- */
function MachinesSection({ rows, loading, catalog }: { rows: VmRequest[]; loading: boolean; catalog?: PresetCatalog }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [busyId, setBusyId] = useState<number | null>(null);
  const osMap = useMemo(() => {
    const m: Record<string, OsPreset> = {};
    catalog?.os.forEach((o) => (m[o.id] = o));
    return m;
  }, [catalog]);

  const machines = rows.filter((r) => r.aws_instance_id || r.status === 'provisioning' || r.status === 'active');
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['admin-all'] }); setBusyId(null); };
  const run = (fn: Promise<unknown>, ok: string) => { fn.then(() => { invalidate(); toast.success(t(ok)); }).catch(() => { setBusyId(null); toast.error(t('toast.error')); }); };

  if (loading) return <TableSkeleton rows={5} />;

  return (
    <div className="space-y-4">
      <SectionTitle title={t('admin.machines')} hint={t('admin.machinesHint')} />
      {machines.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">{t('admin.noMachines')}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-medium">{t('table.id')}</th>
                  <th className="px-4 py-3 font-medium">{t('admin.colOs')}</th>
                  <th className="px-4 py-3 font-medium">{t('admin.colOwner')}</th>
                  <th className="px-4 py-3 font-medium">{t('admin.colIp')}</th>
                  <th className="px-4 py-3 font-medium">{t('admin.colState')}</th>
                  <th className="px-4 py-3 font-medium">{t('admin.colInstance')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {machines.map((r) => {
                  const os = r.os ? osMap[r.os] : undefined;
                  const st = r.vm_state ?? 'none';
                  const busy = busyId === r.id;
                  return (
                    <tr key={r.id} className="border-b border-border/70 transition last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <Link to={`/requests/${r.id}`} className="font-mono text-xs text-muted-foreground hover:text-foreground">#{String(r.id).padStart(3, '0')}</Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2">
                          {os && <OsIcon family={os.family} className="h-6 w-6" />}
                          <span className="truncate">{os?.label ?? r.os ?? '—'}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.user_email}</td>
                      <td className="px-4 py-3 font-mono text-xs">{r.public_ip ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${st === 'running' ? 'bg-emerald-500' : st === 'stopped' ? 'bg-zinc-400' : 'bg-amber-500'}`} />
                          {t(`vmState.${st}`, st)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.aws_instance_id ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {r.status === 'active' && st === 'stopped' && !r.expired_at && (
                            <MIcon title={t('actions.start')} disabled={busy} onClick={() => { setBusyId(r.id); run(api.start(r.id), 'toast.started'); }}><IconPlay className="h-4 w-4 text-emerald-600" /></MIcon>
                          )}
                          {r.status === 'active' && st === 'running' && (
                            <>
                              <MIcon title={t('actions.stop')} disabled={busy} onClick={() => { setBusyId(r.id); run(api.stop(r.id), 'toast.stopped'); }}><IconStop className="h-4 w-4 text-amber-600" /></MIcon>
                              <MIcon title={t('actions.reboot')} disabled={busy} onClick={() => { setBusyId(r.id); run(api.reboot(r.id), 'toast.rebooted'); }}><IconReboot className="h-4 w-4" /></MIcon>
                            </>
                          )}
                          {(r.status === 'active' || r.status === 'provisioning' || r.status === 'failed') && (
                            <MIcon title={t('actions.terminate')} disabled={busy} onClick={() => { setBusyId(r.id); run(api.terminate(r.id), 'toast.terminated'); }}>
                              {busy ? <Spinner className="h-4 w-4" /> : <IconTrash className="h-4 w-4 text-red-600" />}
                            </MIcon>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
function MIcon({ children, onClick, disabled, title }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; title: string }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50">
      {children}
    </button>
  );
}

/* ---------- Users ---------- */
function UsersSection({ rows }: { rows: VmRequest[] }) {
  const { t } = useTranslation();
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    rows.forEach((r) => { m[r.user_email] = (m[r.user_email] ?? 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [rows]);
  return (
    <div className="space-y-6">
      <SectionTitle title={t('admin.users')} />
      <UsersPanel />
      {counts.length > 0 && (
        <Card className="p-5">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('admin.perUser')}</h3>
          <div className="space-y-2">
            {counts.map(([email, n]) => (
              <div key={email} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-muted-foreground">{email}</span>
                <span className="shrink-0 font-semibold tabular-nums">{n}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ---------- Audit ---------- */
const actionTone = (a: string) => {
  if (a.includes('fail') || a.includes('reject') || a.includes('terminate') || a.includes('expired')) return 'text-red-600 dark:text-red-400';
  if (a.includes('approve') || a.includes('active') || a.includes('ready') || a.includes('launch')) return 'text-emerald-600 dark:text-emerald-400';
  if (a.includes('login') || a.includes('create')) return 'text-blue-600 dark:text-blue-400';
  return 'text-muted-foreground';
};
function AuditList({ entries, compact }: { entries: AuditEntry[]; compact?: boolean }) {
  const { t } = useTranslation();
  if (entries.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{t('admin.noAudit')}</p>;
  return (
    <div className="space-y-1.5">
      {entries.map((e) => (
        <div key={e.id} className="flex items-center gap-3 text-sm">
          <span className={`w-40 shrink-0 truncate font-mono text-xs font-medium ${actionTone(e.action)}`}>{e.action}</span>
          <span className="shrink-0 truncate text-xs text-muted-foreground">{e.actor}</span>
          {!compact && e.target && <span className="shrink-0 font-mono text-xs text-muted-foreground">{e.target}</span>}
          {!compact && e.detail && <span className="truncate text-xs text-muted-foreground/80">{e.detail}</span>}
          <span className="ml-auto shrink-0 text-xs text-muted-foreground/70">{fmtDate(e.created_at)}</span>
        </div>
      ))}
    </div>
  );
}
/* ---------- Monitoring (Grafana Cloud) ---------- */
function MonitoringSection({ grafanaUrl }: { grafanaUrl?: string }) {
  const { t } = useTranslation();
  let base = '';
  try {
    if (grafanaUrl) base = new URL(grafanaUrl).origin;
  } catch {
    /* ignore */
  }
  const dashboards = [
    { uid: 'gitvm-portal', label: t('admin.dashComplete') },
    { uid: 'gitvm-cost', label: t('admin.dashCost') },
    { uid: 'gitvm-vms', label: t('admin.dashVms') },
    { uid: 'gitvm-logs', label: t('admin.dashLogs') },
  ];
  return (
    <div className="space-y-4">
      <SectionTitle title={t('admin.navMonitoring')} hint={t('admin.monHint')} />
      {base ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {dashboards.map((d) => (
            <a
              key={d.uid}
              href={`${base}/d/${d.uid}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-xl border border-border bg-card p-4 font-medium transition hover:border-foreground/25 hover:bg-muted/40"
            >
              {d.label}
              <span className="text-muted-foreground">↗</span>
            </a>
          ))}
        </div>
      ) : (
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">{t('admin.monIntro')}</p>
          <a
            href="https://grafana.com/auth/sign-up/create-user"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3.5 text-sm font-medium transition hover:bg-muted"
          >
            {t('admin.monOpen')} ↗
          </a>
        </Card>
      )}
      <Card className="p-5">
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('admin.monEndpoints')}</h3>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {['summary', 'daily', 'os', 'users', 'cost', 'metrics', 'audit'].map((e) => (
            <li key={e}><code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">/api/monitoring/{e}</code></li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
