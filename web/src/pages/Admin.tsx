import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useToast } from '../toast';
import type { PerfPreset, Status, VmRequest } from '../types';
import { Button, Card, Field, IconDownload, Modal, Select, Spinner, TableSkeleton, Textarea } from '../ui';
import { RequestsTable } from '../components/RequestsTable';
import { UsersPanel } from '../components/UsersPanel';

const PER_PAGE = 10;

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
function fmtSeconds(s: number): string {
  if (!s) return '—';
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function Admin() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = useState<Status | ''>('');
  const [search, setSearch] = useState('');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const [actingId, setActingId] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<VmRequest | null>(null);
  const [termTarget, setTermTarget] = useState<VmRequest | null>(null);
  const [note, setNote] = useState('');

  const presetsQ = useQuery({ queryKey: ['presets'], queryFn: api.presets });
  const statsQ = useQuery({ queryKey: ['admin-stats'], queryFn: api.adminStats, refetchInterval: 10000 });
  const metricsQ = useQuery({ queryKey: ['admin-metrics'], queryFn: api.adminMetrics, refetchInterval: 15000 });
  const listQ = useQuery({
    queryKey: ['admin-requests', filter],
    queryFn: () => api.adminList(filter),
    refetchInterval: (q) => ((q.state.data ?? []).some((r) => r.status === 'provisioning') ? 5000 : false),
  });

  const presetMap = useMemo(() => {
    const m: Record<string, PerfPreset> = {};
    presetsQ.data?.perf.forEach((p) => (m[p.id] = p));
    return m;
  }, [presetsQ.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-requests'] });
    qc.invalidateQueries({ queryKey: ['admin-stats'] });
    qc.invalidateQueries({ queryKey: ['admin-metrics'] });
  };
  const reset = () => {
    setActingId(null);
    setRejectTarget(null);
    setTermTarget(null);
    setNote('');
    invalidate();
  };
  const onErr = () => {
    setActingId(null);
    toast.error(t('toast.error'));
  };

  const approveM = useMutation({
    mutationFn: (id: number) => api.approve(id),
    onSuccess: () => { reset(); toast.success(t('toast.approved')); },
    onError: onErr,
  });
  const rejectM = useMutation({
    mutationFn: (v: { id: number; note: string }) => api.reject(v.id, v.note),
    onSuccess: () => { reset(); toast.success(t('toast.rejected')); },
    onError: onErr,
  });
  const termM = useMutation({
    mutationFn: (id: number) => api.terminate(id),
    onSuccess: () => { reset(); toast.success(t('toast.terminated')); },
    onError: onErr,
  });

  const stats = statsQ.data ?? {};
  const m = metricsQ.data;

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let r = listQ.data ?? [];
    if (q) r = r.filter((x) => x.user_email.toLowerCase().includes(q) || x.purpose.toLowerCase().includes(q));
    r = [...r].sort((a, b) => (sortAsc ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at)));
    return r;
  }, [listQ.data, search, sortAsc]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const display = rows.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('admin.stats')}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('admin.title')}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{t('admin.subtitle')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t('status.pending')} value={stats.pending ?? 0} dot="bg-amber-500" />
        <StatCard label={t('status.provisioning')} value={stats.provisioning ?? 0} dot="bg-blue-500" />
        <StatCard label={t('status.active')} value={stats.active ?? 0} dot="bg-emerald-500" />
        <StatCard label={t('status.failed')} value={stats.failed ?? 0} dot="bg-red-500" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard label={t('metric.successRate')} value={`${Math.round((m?.successRate ?? 1) * 100)}%`} />
        <MetricCard label={t('metric.avgProvision')} value={fmtSeconds(m?.avgProvisionSeconds ?? 0)} />
        <MetricCard label={t('metric.total')} value={String(m?.total ?? 0)} />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{t('admin.all')}</h2>
        <div className="flex flex-wrap items-end gap-3">
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder={t('admin.search')}
            className="h-9 w-48 rounded-lg border border-border bg-background px-3 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/15"
          />
          <a
            href={api.csvUrl}
            download
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3.5 text-sm font-medium transition hover:bg-muted"
          >
            <IconDownload className="h-4 w-4" /> {t('admin.exportCsv')}
          </a>
          <Select value={filter} onChange={(e) => { setFilter(e.target.value as Status | ''); setPage(0); }} className="w-44">
            <option value="">{t('admin.allStatuses')}</option>
            {(['pending', 'provisioning', 'active', 'approved', 'rejected', 'failed', 'terminated'] as Status[]).map((s) => (
              <option key={s} value={s}>{t(`status.${s}`)}</option>
            ))}
          </Select>
          <Button variant="secondary" onClick={() => setSortAsc((v) => !v)}>
            {sortAsc ? t('admin.oldest') : t('admin.newest')}
          </Button>
        </div>
      </div>

      {listQ.isLoading ? (
        <TableSkeleton rows={6} />
      ) : (
        <>
          <RequestsTable
            rows={display}
            presets={presetMap}
            admin
            busyId={actingId}
            onApprove={(id) => { setActingId(id); approveM.mutate(id); }}
            onReject={(r) => setRejectTarget(r)}
            onTerminate={(r) => setTermTarget(r)}
          />
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

      <div className="pt-2">
        <h2 className="mb-3 text-lg font-semibold tracking-tight">{t('admin.users')}</h2>
        <UsersPanel />
      </div>

      <Modal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title={t('confirm.rejectTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectTarget(null)} disabled={rejectM.isPending}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={rejectM.isPending}
              onClick={() => { if (!rejectTarget) return; setActingId(rejectTarget.id); rejectM.mutate({ id: rejectTarget.id, note }); }}
            >
              {rejectM.isPending ? <Spinner className="h-4 w-4" /> : null}
              {t('actions.reject')}
            </Button>
          </>
        }
      >
        <Field label={t('confirm.rejectNote')}>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Modal>

      <Modal
        open={!!termTarget}
        onClose={() => setTermTarget(null)}
        title={t('confirm.terminateTitle')}
        description={t('confirm.terminateBody')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTermTarget(null)} disabled={termM.isPending}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={termM.isPending}
              onClick={() => { if (!termTarget) return; setActingId(termTarget.id); termM.mutate(termTarget.id); }}
            >
              {termM.isPending ? <Spinner className="h-4 w-4" /> : null}
              {t('actions.terminate')}
            </Button>
          </>
        }
      />
    </div>
  );
}
