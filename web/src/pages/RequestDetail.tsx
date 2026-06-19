import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { fmtDate } from '../lib/format';
import { Button, Card, IconBack, IconCopy, IconDownload, IconTrash, Modal, Spinner } from '../ui';
import { StatusBadge } from '../components/StatusBadge';

function Row({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-6 py-2.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={`text-right ${mono ? 'font-mono text-xs' : 'font-medium'}`}>{children}</span>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</h2>;
}

function CopyCmd({ cmd }: { cmd: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-1 pl-3">
      <code className="flex-1 overflow-x-auto whitespace-nowrap py-1.5 font-mono text-xs text-foreground">{cmd}</code>
      <button
        onClick={() => {
          navigator.clipboard.writeText(cmd);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
      >
        <IconCopy className="h-3.5 w-3.5" />
        {copied ? t('common.copied') : t('common.copy')}
      </button>
    </div>
  );
}

export function RequestDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const rid = Number(id);
  const qc = useQueryClient();
  const [confirmTerm, setConfirmTerm] = useState(false);

  const q = useQuery({
    queryKey: ['request', rid],
    queryFn: () => api.getRequest(rid),
    refetchInterval: (query) => (query.state.data?.status === 'provisioning' ? 5000 : false),
  });
  const presetsQ = useQuery({ queryKey: ['presets'], queryFn: api.presets });

  const termM = useMutation({
    mutationFn: () => api.terminate(rid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['request', rid] });
      qc.invalidateQueries({ queryKey: ['requests'] });
      setConfirmTerm(false);
    },
  });

  if (q.isLoading)
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner /> {t('common.loading')}
      </div>
    );
  if (q.isError || !q.data)
    return (
      <div className="space-y-4">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <IconBack className="h-4 w-4" /> {t('common.back')}
        </Link>
        <p className="text-sm text-red-500">{t('common.error')}</p>
      </div>
    );

  const r = q.data;
  const cat = presetsQ.data;
  const perfLabel = cat?.perf.find((p) => p.id === r.preset)?.label ?? r.preset;
  const storageLabel = cat?.storage.find((s) => s.id === r.storage)?.label ?? r.storage ?? '—';
  const osLabel = cat?.os.find((o) => o.id === r.os)?.label ?? r.os ?? '—';
  const sshUser = r.ssh_user ?? 'ubuntu';
  const canTerm = r.status === 'active' || r.status === 'provisioning' || r.status === 'failed';
  const cmd = r.public_ip ? `ssh -i ${r.ssh_key_name ?? `vm-portal-req-${r.id}`}.pem ${sshUser}@${r.public_ip}` : '';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground">
        <IconBack className="h-4 w-4" /> {t('common.back')}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{t('detail.title', { id: r.id })}</h1>
          <StatusBadge status={r.status} />
        </div>
        {canTerm && (
          <Button variant="danger" onClick={() => setConfirmTerm(true)}>
            <IconTrash className="h-4 w-4" /> {t('actions.terminate')}
          </Button>
        )}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card className="p-5">
          <Eyebrow>{t('detail.overview')}</Eyebrow>
          <div className="divide-y divide-border">
            <Row label={t('table.type')}>{perfLabel}</Row>
            <Row label={t('form.storage')}>{storageLabel}</Row>
            <Row label={t('form.os')}>{osLabel}</Row>
            <Row label={t('common.region')} mono>{r.region}</Row>
            <Row label={t('table.purpose')}>{r.purpose}</Row>
            <Row label={t('detail.requestedBy')}>{r.user_email}</Row>
            <Row label={t('detail.createdAt')}>{fmtDate(r.created_at)}</Row>
            {r.decided_by && <Row label={t('detail.decidedBy')}>{r.decided_by}</Row>}
            {r.decided_at && <Row label={t('detail.decidedAt')}>{fmtDate(r.decided_at)}</Row>}
            {r.admin_note && <Row label={t('detail.adminNote')}>{r.admin_note}</Row>}
          </div>
        </Card>

        <Card className="p-5">
          <Eyebrow>{t('detail.connection')}</Eyebrow>
          {r.status === 'active' && r.public_ip ? (
            <div className="space-y-4">
              <div className="divide-y divide-border">
                <Row label={t('detail.ip')} mono>{r.public_ip}</Row>
                {r.aws_instance_id && <Row label={t('detail.instance')} mono>{r.aws_instance_id}</Row>}
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('detail.sshCommand')}</p>
                <CopyCmd cmd={cmd} />
              </div>
              <a href={api.keyUrl(r.id)} className="inline-flex">
                <Button variant="secondary">
                  <IconDownload className="h-4 w-4" /> {t('access.downloadKey')}
                </Button>
              </a>
              <p className="text-xs leading-relaxed text-muted-foreground">{t('detail.keyHint')}</p>
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('detail.notReady')}</p>
          )}
        </Card>
      </div>

      <Modal
        open={confirmTerm}
        onClose={() => setConfirmTerm(false)}
        title={t('confirm.terminateTitle')}
        description={t('confirm.terminateBody')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmTerm(false)} disabled={termM.isPending}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={() => termM.mutate()} disabled={termM.isPending}>
              {termM.isPending ? <Spinner className="h-4 w-4" /> : null}
              {t('actions.terminate')}
            </Button>
          </>
        }
      />
    </div>
  );
}
