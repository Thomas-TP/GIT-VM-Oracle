import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useToast } from '../toast';
import type { ExportTarget, Snapshot, VmRequest } from '../types';
import { fmtDate } from '../lib/format';
import { Button, IconDownload, Spinner } from '../ui';

type Sub = 'ebs' | 'vmware' | 'virtualbox';

function SnapStatus({ s }: { s: Snapshot }) {
  const { t } = useTranslation();
  if (s.status === 'completed')
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">✓ {t('snapshot.statusCompleted')}</span>;
  if (s.status === 'error')
    return <span className="text-xs font-medium text-red-600 dark:text-red-400">{t('snapshot.statusError')}</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
      <Spinner className="h-3.5 w-3.5" /> {t('snapshot.statusPending')}
    </span>
  );
}

function SnapRow({ s, right }: { s: Snapshot; right: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
      <div className="min-w-0">
        <div className="font-mono text-xs text-muted-foreground">{s.aws_snapshot_id ?? `#${s.id}`}</div>
        <div className="text-xs text-muted-foreground">{fmtDate(s.created_at)}{s.size_gb ? ` · ${s.size_gb} Go` : ''}</div>
      </div>
      <div className="flex items-center gap-3">{right}</div>
    </div>
  );
}

export function SnapshotPanel({ request }: { request: VmRequest }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [sub, setSub] = useState<Sub>('ebs');

  const q = useQuery({
    queryKey: ['snapshots', request.id],
    queryFn: () => api.listSnapshots(request.id),
    refetchInterval: (qq) =>
      (qq.state.data ?? []).some((s) => s.status === 'pending' || (s.exports ?? []).some((e) => e.status === 'running')) ? 8000 : false,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['snapshots', request.id] });
  const createM = useMutation({
    mutationFn: () => api.createSnapshot(request.id),
    onSuccess: () => { invalidate(); toast.success(t('snapshot.created')); },
    onError: () => toast.error(t('toast.error')),
  });
  const toggleM = useMutation({
    mutationFn: (en: boolean) => api.setSnapshotOnDelete(request.id, en),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['request', request.id] }),
    onError: () => toast.error(t('toast.error')),
  });
  const exportM = useMutation({
    mutationFn: (v: { sid: number; target: ExportTarget }) => api.exportSnapshot(request.id, v.sid, v.target),
    onSuccess: () => { invalidate(); toast.success(t('snapshot.exportStarted')); },
    onError: (e: unknown) => toast.error(e instanceof Error && e.message === 'export_not_configured' ? t('snapshot.exportNotConfigured') : t('toast.error')),
  });

  const snaps = q.data ?? [];
  const completed = snaps.filter((s) => s.status === 'completed' && s.aws_snapshot_id);

  const subs: { id: Sub; label: string }[] = [
    { id: 'ebs', label: t('snapshot.tabEbs') },
    { id: 'vmware', label: t('snapshot.tabVmware') },
    { id: 'virtualbox', label: t('snapshot.tabVbox') },
  ];

  const exportControls = (s: Snapshot, target: ExportTarget) => {
    const exp = (s.exports ?? []).find((e) => e.target === target);
    if (exp?.status === 'running')
      return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400"><Spinner className="h-3.5 w-3.5" /> {t('snapshot.exportRunning')}</span>;
    if (exp?.status === 'ready' && exp.url)
      return (
        <a href={exp.url} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 transition hover:underline dark:text-emerald-400">
          <IconDownload className="h-3.5 w-3.5" /> {t('snapshot.download')}
        </a>
      );
    return (
      <span className="inline-flex items-center gap-2">
        {exp?.status === 'error' && <span className="text-xs font-medium text-red-600 dark:text-red-400">{t('snapshot.exportError')}</span>}
        <Button variant="secondary" disabled={exportM.isPending} onClick={() => exportM.mutate({ sid: s.id, target })}>
          {t('snapshot.generate')}
        </Button>
      </span>
    );
  };

  const exportSection = (target: ExportTarget) => (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t(target === 'vmware' ? 'snapshot.vmwareHint' : 'snapshot.vboxHint')}</p>
      {completed.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-card/50 py-6 text-center text-sm text-muted-foreground">{t('snapshot.needSnapshot')}</p>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {completed.map((s) => <SnapRow key={s.id} s={s} right={exportControls(s, target)} />)}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t('snapshot.bundleNote')}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-muted/40 p-1">
        {subs.map((sb) => (
          <button
            key={sb.id}
            onClick={() => setSub(sb.id)}
            className={`flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              sub === sb.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {sb.label}
          </button>
        ))}
      </div>

      {sub === 'ebs' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{t('snapshot.hint')}</p>
            <Button variant="secondary" disabled={createM.isPending} onClick={() => createM.mutate()}>
              {createM.isPending ? <Spinner className="h-4 w-4" /> : null}
              {t('snapshot.create')}
            </Button>
          </div>
          <label className="flex items-center gap-2.5">
            <input type="checkbox" checked={!!request.snapshot_on_delete} onChange={(e) => toggleM.mutate(e.target.checked)} className="h-4 w-4 rounded border-border" />
            <span className="text-sm">{t('snapshot.autoLabel')}</span>
          </label>
          {snaps.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t('snapshot.empty')}</p>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {snaps.map((s) => <SnapRow key={s.id} s={s} right={<SnapStatus s={s} />} />)}
            </div>
          )}
        </div>
      )}

      {sub === 'vmware' && exportSection('vmware')}
      {sub === 'virtualbox' && exportSection('virtualbox')}
    </div>
  );
}
