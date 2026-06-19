import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { PerfPreset, Status, VmRequest } from '../types';
import { Button, Card, Field, Modal, Select, Spinner, Textarea } from '../ui';
import { RequestsTable } from '../components/RequestsTable';

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

export function Admin() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Status | ''>('');
  const [actingId, setActingId] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<VmRequest | null>(null);
  const [termTarget, setTermTarget] = useState<VmRequest | null>(null);
  const [note, setNote] = useState('');

  const presetsQ = useQuery({ queryKey: ['presets'], queryFn: api.presets });
  const statsQ = useQuery({ queryKey: ['admin-stats'], queryFn: api.adminStats, refetchInterval: 10000 });
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
  };
  const done = () => {
    setActingId(null);
    setRejectTarget(null);
    setTermTarget(null);
    setNote('');
    invalidate();
  };

  const approveM = useMutation({ mutationFn: (id: number) => api.approve(id), onSuccess: done, onError: () => setActingId(null) });
  const rejectM = useMutation({ mutationFn: (v: { id: number; note: string }) => api.reject(v.id, v.note), onSuccess: done, onError: () => setActingId(null) });
  const termM = useMutation({ mutationFn: (id: number) => api.terminate(id), onSuccess: done, onError: () => setActingId(null) });

  const rows = listQ.data ?? [];
  const stats = statsQ.data ?? {};

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

      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">{t('admin.all')}</h2>
        <div className="w-56">
          <Field label={t('admin.filter')}>
            <Select value={filter} onChange={(e) => setFilter(e.target.value as Status | '')}>
              <option value="">{t('admin.allStatuses')}</option>
              {(['pending', 'provisioning', 'active', 'approved', 'rejected', 'failed', 'terminated'] as Status[]).map(
                (s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                )
              )}
            </Select>
          </Field>
        </div>
      </div>

      {listQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> {t('common.loading')}
        </div>
      ) : (
        <RequestsTable
          rows={rows}
          presets={presetMap}
          admin
          busyId={actingId}
          onApprove={(id) => {
            setActingId(id);
            approveM.mutate(id);
          }}
          onReject={(r) => setRejectTarget(r)}
          onTerminate={(r) => setTermTarget(r)}
        />
      )}

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
              onClick={() => {
                if (!rejectTarget) return;
                setActingId(rejectTarget.id);
                rejectM.mutate({ id: rejectTarget.id, note });
              }}
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
              onClick={() => {
                if (!termTarget) return;
                setActingId(termTarget.id);
                termM.mutate(termTarget.id);
              }}
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
