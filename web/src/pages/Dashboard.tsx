import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { PerfPreset, VmRequest } from '../types';
import { Button, IconPlus, IconServer, Modal, Spinner } from '../ui';
import { RequestsTable } from '../components/RequestsTable';
import { NewRequestDialog } from '../components/NewRequestDialog';

export function Dashboard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [openNew, setOpenNew] = useState(false);
  const [termTarget, setTermTarget] = useState<VmRequest | null>(null);

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

  const termM = useMutation({
    mutationFn: (id: number) => api.terminate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requests'] });
      setTermTarget(null);
    },
  });

  const rows = reqQ.data ?? [];
  const active = rows.filter((r) => r.status === 'active').length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">GIT Cloud</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('dashboard.title')}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {t('dashboard.subtitle')}
            {active > 0 && <span className="ml-1 text-foreground"> · {active} active{active > 1 ? 's' : ''}</span>}
          </p>
        </div>
        <Button onClick={() => setOpenNew(true)} disabled={!presetsQ.data}>
          <IconPlus className="h-4 w-4" />
          {t('dashboard.new')}
        </Button>
      </div>

      {reqQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> {t('common.loading')}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 p-16 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-xl border border-border bg-muted text-muted-foreground">
            <IconServer />
          </div>
          <div>
            <p className="font-medium">{t('dashboard.empty')}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('dashboard.emptyHint')}</p>
          </div>
          <Button className="mt-1" onClick={() => setOpenNew(true)} disabled={!presetsQ.data}>
            <IconPlus className="h-4 w-4" />
            {t('dashboard.new')}
          </Button>
        </div>
      ) : (
        <RequestsTable
          rows={rows}
          presets={presetMap}
          busyId={termM.isPending ? termTarget?.id : null}
          onTerminate={setTermTarget}
        />
      )}

      {presetsQ.data && (
        <NewRequestDialog open={openNew} onClose={() => setOpenNew(false)} catalog={presetsQ.data} />
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
