import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { PerfPreset, VmRequest } from '../types';
import { fmtDate } from '../lib/format';
import { StatusBadge } from './StatusBadge';
import { IconCheck, IconDownload, IconServer, IconTrash, IconX, Spinner } from '../ui';
import { api } from '../api';

interface Props {
  rows: VmRequest[];
  presets: Record<string, PerfPreset>;
  admin?: boolean;
  busyId?: number | null;
  onApprove?: (id: number) => void;
  onReject?: (r: VmRequest) => void;
  onTerminate?: (r: VmRequest) => void;
}

const canTerminate = (s: string) => s === 'active' || s === 'provisioning' || s === 'failed';

function IconBtn({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function RequestsTable({ rows, presets, admin, busyId, onApprove, onReject, onTerminate }: Props) {
  const { t } = useTranslation();
  const label = (id: string) => presets[id]?.label ?? id;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-medium">{t('table.id')}</th>
              {admin && <th className="px-4 py-3 font-medium">{t('table.user')}</th>}
              <th className="px-4 py-3 font-medium">{t('table.type')}</th>
              <th className="px-4 py-3 font-medium">{t('table.purpose')}</th>
              <th className="px-4 py-3 font-medium">{t('table.status')}</th>
              {admin ? (
                <th className="px-4 py-3 font-medium">{t('table.created')}</th>
              ) : (
                <th className="px-4 py-3 font-medium">{t('table.access')}</th>
              )}
              <th className="px-4 py-3 text-right font-medium">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const busy = busyId === r.id;
              return (
                <tr key={r.id} className="border-b border-border/70 transition last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <Link to={`/requests/${r.id}`} className="font-mono text-xs text-muted-foreground hover:text-foreground">
                      #{String(r.id).padStart(3, '0')}
                    </Link>
                  </td>
                  {admin && <td className="px-4 py-3 text-muted-foreground">{r.user_email}</td>}
                  <td className="px-4 py-3 font-medium">{label(r.preset)}</td>
                  <td className="max-w-[16rem] truncate px-4 py-3 text-muted-foreground" title={r.purpose}>
                    {r.purpose}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  {admin ? (
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{fmtDate(r.created_at)}</td>
                  ) : (
                    <td className="px-4 py-3">
                      {r.status === 'active' && r.public_ip ? (
                        <a href={api.keyUrl(r.id)} className="inline-flex items-center gap-1.5 font-medium hover:underline">
                          <IconDownload className="h-4 w-4" />
                          {t('access.downloadKey')}
                        </a>
                      ) : r.status === 'provisioning' || r.status === 'approved' ? (
                        <span className="text-muted-foreground">{t('access.provisioning')}</span>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {admin && r.status === 'pending' && (
                        <>
                          <IconBtn disabled={busy} onClick={() => onApprove?.(r.id)} title={t('actions.approve')}>
                            {busy ? <Spinner className="h-4 w-4" /> : <IconCheck className="h-4 w-4 text-emerald-600" />}
                          </IconBtn>
                          <IconBtn disabled={busy} onClick={() => onReject?.(r)} title={t('actions.reject')}>
                            <IconX className="h-4 w-4 text-red-600" />
                          </IconBtn>
                        </>
                      )}
                      {canTerminate(r.status) && (
                        <IconBtn disabled={busy} onClick={() => onTerminate?.(r)} title={t('actions.terminate')}>
                          {busy ? <Spinner className="h-4 w-4" /> : <IconTrash className="h-4 w-4 text-red-600" />}
                        </IconBtn>
                      )}
                      <Link
                        to={`/requests/${r.id}`}
                        title={t('actions.view')}
                        className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      >
                        <IconServer className="h-4 w-4" />
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
