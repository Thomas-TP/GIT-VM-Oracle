import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { PerfPreset, VmRequest } from '../types';
import { Button, Card, IconPlus, IconServer, Modal, Spinner, TableSkeleton } from '../ui';
import { useToast } from '../toast';
import { RequestsTable } from '../components/RequestsTable';

function Stat({ label, value, dot }: { label: string; value: number; dot: string }) {
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

export function MyVms() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [termTarget, setTermTarget] = useState<VmRequest | null>(null);
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem('gitvm_onboarded') === '1');
  const dismissOnboarding = () => {
    localStorage.setItem('gitvm_onboarded', '1');
    setOnboarded(true);
  };

  const presetsQ = useQuery({ queryKey: ['presets'], queryFn: api.presets });
  const reqQ = useQuery({
    queryKey: ['requests'],
    queryFn: api.listRequests,
    refetchInterval: (q) =>
      (q.state.data ?? []).some((r) => r.status === 'provisioning' || r.status === 'approved') ? 5000 : false,
  });

  const presetMap = useMemo(() => {
    const m: Record<string, PerfPreset> = {};
    presetsQ.data?.perf.forEach((p) => (m[p.id] = p));
    return m;
  }, [presetsQ.data]);
  const osLabel = useMemo(() => {
    const m: Record<string, string> = {};
    presetsQ.data?.os.forEach((o) => (m[o.id] = o.label));
    return m;
  }, [presetsQ.data]);

  const termM = useMutation({
    mutationFn: (id: number) => api.terminate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requests'] });
      setTermTarget(null);
      toast.success(t('toast.terminated'));
    },
    onError: () => toast.error(t('toast.error')),
  });

  const rows = reqQ.data ?? [];
  const now = Date.now();
  const isExpired = (r: VmRequest) => !!r.expired_at;
  const stats = {
    total: rows.length,
    active: rows.filter((r) => r.status === 'active' && !isExpired(r)).length,
    provisioning: rows.filter((r) => r.status === 'provisioning').length,
    expiring: rows.filter((r) => {
      if (r.status !== 'active' || isExpired(r) || !r.end_date) return false;
      const e = new Date(r.end_date).getTime();
      return e > now && e - now <= 24 * 3600 * 1000;
    }).length,
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.purpose.toLowerCase().includes(q) ||
        (r.os ? (osLabel[r.os] ?? r.os).toLowerCase().includes(q) : false) ||
        (r.public_ip ?? '').toLowerCase().includes(q)
    );
  }, [rows, search, osLabel]);

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('myvms.eyebrow')}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('myvms.title')}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{t('myvms.subtitle')}</p>
        </div>
        <Link to="/new">
          <Button>
            <IconPlus className="h-4 w-4" />
            {t('myvms.new')}
          </Button>
        </Link>
      </div>

      {!onboarded && (
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
          <div className="min-w-0">
            <p className="font-medium">{t('myvms.welcomeTitle')}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('myvms.welcomeBody')}</p>
          </div>
          <button
            onClick={dismissOnboarding}
            className="shrink-0 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium transition hover:bg-muted"
          >
            {t('myvms.welcomeDismiss')}
          </button>
        </div>
      )}

      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t('myvms.statTotal')} value={stats.total} dot="bg-foreground/40" />
          <Stat label={t('myvms.statActive')} value={stats.active} dot="bg-emerald-500" />
          <Stat label={t('myvms.statProvisioning')} value={stats.provisioning} dot="bg-blue-500" />
          <Stat label={t('myvms.statExpiring')} value={stats.expiring} dot="bg-orange-500" />
        </div>
      )}

      {reqQ.isLoading ? (
        <TableSkeleton rows={4} />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 p-16 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-xl border border-border bg-muted text-muted-foreground">
            <IconServer />
          </div>
          <div>
            <p className="font-medium">{t('myvms.empty')}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('myvms.emptyHint')}</p>
          </div>
          <Link to="/new" className="mt-1">
            <Button>
              <IconPlus className="h-4 w-4" />
              {t('myvms.new')}
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('myvms.search')}
              className="h-9 w-full max-w-xs rounded-lg border border-border bg-background px-3 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/15"
            />
          </div>
          {filtered.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
              {t('myvms.noMatch')}
            </p>
          ) : (
            <RequestsTable
              rows={filtered}
              presets={presetMap}
              busyId={termM.isPending ? termTarget?.id : null}
              onTerminate={setTermTarget}
            />
          )}
        </div>
      )}

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
            <Button variant="danger" onClick={() => termTarget && termM.mutate(termTarget.id)} disabled={termM.isPending}>
              {termM.isPending ? <Spinner className="h-4 w-4" /> : null}
              {t('actions.terminate')}
            </Button>
          </>
        }
      />
    </div>
  );
}
