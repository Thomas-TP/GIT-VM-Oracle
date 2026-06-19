import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api';
import { useToast } from '../toast';
import type { OsPreset, PresetCatalog } from '../types';
import { Button, Card, IconBack, IconCheck, Spinner, Textarea } from '../ui';
import { OsIcon } from '../components/OsIcon';
import { DatePicker } from '../components/DatePicker';

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

const DAY = 86400000;
const QUICK = [
  { key: 'newvm.q1d', ms: DAY },
  { key: 'newvm.q3d', ms: 3 * DAY },
  { key: 'newvm.q1w', ms: 7 * DAY },
  { key: 'newvm.q2w', ms: 14 * DAY },
  { key: 'newvm.q1m', ms: 30 * DAY },
];

function Section({ n, title, hint, children }: { n: number; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3.5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
          {n}
        </span>
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Choice({
  selected,
  disabled,
  onClick,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`relative rounded-xl border p-3.5 text-left transition ${
        selected
          ? 'border-primary bg-primary/[0.04] ring-2 ring-primary/20'
          : 'border-border bg-card hover:border-foreground/25'
      } ${disabled ? 'pointer-events-none opacity-40' : ''}`}
    >
      {children}
      {selected && (
        <span className="absolute right-2 top-2 grid h-4 w-4 place-items-center rounded-full bg-primary text-primary-foreground">
          <IconCheck className="h-3 w-3" />
        </span>
      )}
    </button>
  );
}

function Badge({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'primary' | 'blue' }) {
  const cls =
    tone === 'primary'
      ? 'bg-primary/10 text-primary'
      : tone === 'blue'
        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
        : 'bg-muted text-muted-foreground';
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>{children}</span>;
}

export function NewVm() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const catalogQ = useQuery({ queryKey: ['presets'], queryFn: api.presets });

  if (!catalogQ.data)
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner /> {t('common.loading')}
      </div>
    );
  return <NewVmForm catalog={catalogQ.data} nav={nav} qc={qc} toast={toast} />;
}

function NewVmForm({
  catalog,
  nav,
  qc,
  toast,
}: {
  catalog: PresetCatalog;
  nav: ReturnType<typeof useNavigate>;
  qc: ReturnType<typeof useQueryClient>;
  toast: ReturnType<typeof useToast>;
}) {
  const { t } = useTranslation();
  const osList = useMemo(() => catalog.os.filter((o) => !o.hidden), [catalog.os]);
  const defaultPerf = catalog.perf.find((p) => p.recommended)?.id ?? catalog.perf[0]?.id ?? '';
  const defaultStorage = catalog.storage.find((s) => s.sizeGb >= 50)?.id ?? catalog.storage[0]?.id ?? '';
  const defaultOs = osList.find((o) => o.recommended)?.id ?? osList[0]?.id ?? '';

  const [perf, setPerf] = useState(defaultPerf);
  const [storage, setStorage] = useState(defaultStorage);
  const [os, setOs] = useState(defaultOs);
  const [purpose, setPurpose] = useState('');
  const [start, setStart] = useState(() => toLocalInput(new Date()));
  const [end, setEnd] = useState(() => toLocalInput(new Date(Date.now() + 7 * 86400000)));

  const osDef = catalog.os.find((o) => o.id === os);
  const minGb = osDef?.minStorageGb ?? 0;

  // When OS requires a bigger disk than the current pick, bump to the first valid size.
  useEffect(() => {
    if (!minGb) return;
    const cur = catalog.storage.find((s) => s.id === storage);
    if (cur && cur.sizeGb < minGb) {
      const first = catalog.storage.find((s) => s.sizeGb >= minGb);
      if (first) setStorage(first.id);
    }
  }, [minGb, storage, catalog.storage]);

  const perfDef = catalog.perf.find((p) => p.id === perf);
  const storageDef = catalog.storage.find((s) => s.id === storage);
  const monthly = useMemo(() => {
    if (!perfDef || !storageDef) return 0;
    return perfDef.hourlyUsd * 730 + storageDef.sizeGb * catalog.storageUsdGbMonth;
  }, [perfDef, storageDef, catalog.storageUsdGbMonth]);
  const hourly = perfDef?.hourlyUsd ?? 0;

  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;
  const datesValid =
    !!endDate &&
    !isNaN(endDate.getTime()) &&
    endDate.getTime() > Date.now() &&
    (!startDate || (!isNaN(startDate.getTime()) && startDate.getTime() < endDate.getTime()));

  const durationLabel = useMemo(() => {
    if (!datesValid || !endDate) return '—';
    const from = startDate && startDate.getTime() > Date.now() ? startDate.getTime() : Date.now();
    let s = Math.max(0, Math.floor((endDate.getTime() - from) / 1000));
    const d = Math.floor(s / 86400);
    s -= d * 86400;
    const h = Math.floor(s / 3600);
    return d > 0 ? `${d}${t('newvm.days')} ${h}${t('newvm.hours')}` : `${h}${t('newvm.hours')}`;
  }, [datesValid, startDate, endDate, t]);

  const valid = !!perf && !!storage && !!os && !!purpose.trim() && datesValid;

  const m = useMutation({
    mutationFn: () =>
      api.createRequest(
        perf,
        storage,
        os,
        purpose.trim(),
        start ? new Date(start).toISOString() : null,
        new Date(end).toISOString()
      ),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['requests'] });
      toast.success(t('toast.requestCreated'));
      nav(`/requests/${res.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.message === 'rate_limited') toast.error(t('toast.rateLimited'));
      else if (e instanceof ApiError && e.message === 'storage_too_small') toast.error(t('toast.storageTooSmall'));
      else toast.error(t('toast.error'));
    },
  });

  return (
    <div className="space-y-7">
      <div>
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground">
          <IconBack className="h-4 w-4" /> {t('nav.dashboard')}
        </Link>
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('newvm.eyebrow')}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('newvm.title')}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{t('newvm.subtitle')}</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        {/* config */}
        <div className="space-y-8">
          <Section n={1} title={t('newvm.perf')} hint={t('newvm.perfHint')}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {catalog.perf.map((p) => (
                <Choice key={p.id} selected={perf === p.id} onClick={() => setPerf(p.id)}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{p.label}</span>
                    {p.recommended && <Badge tone="primary">{t('newvm.recommended')}</Badge>}
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-muted-foreground">{p.instanceType}</div>
                  <div className="mt-1.5 text-sm">
                    {p.vcpu} vCPU · {p.ramGb} {t('newvm.ram')}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground tabular-nums">${p.hourlyUsd.toFixed(3)}/h</div>
                </Choice>
              ))}
            </div>
          </Section>

          <Section n={2} title={t('newvm.storage')} hint={t('newvm.storageHint')}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {catalog.storage.map((s) => {
                const tooSmall = minGb > 0 && s.sizeGb < minGb;
                return (
                  <Choice key={s.id} selected={storage === s.id} disabled={tooSmall} onClick={() => setStorage(s.id)}>
                    <div className="font-medium">{s.label}</div>
                    {s.description && <div className="mt-0.5 text-xs text-muted-foreground">{s.description}</div>}
                  </Choice>
                );
              })}
            </div>
            {minGb > 0 && <p className="text-xs text-muted-foreground">{t('newvm.minStorage', { gb: minGb })}</p>}
          </Section>

          <Section n={3} title={t('newvm.os')} hint={t('newvm.osHint')}>
            <div className="grid gap-3 sm:grid-cols-2">
              {osList.map((o: OsPreset) => (
                <Choice key={o.id} selected={os === o.id} onClick={() => setOs(o.id)}>
                  <div className="flex gap-3">
                    <OsIcon family={o.family} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium">{o.label}</span>
                        {o.recommended && <Badge tone="primary">{t('newvm.recommended')}</Badge>}
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{o.description}</div>
                      <div className="mt-1.5">
                        <Badge tone={o.connect === 'rdp' ? 'blue' : 'muted'}>
                          {o.connect === 'rdp' ? 'RDP' : 'SSH'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </Choice>
              ))}
            </div>
          </Section>

          <Section n={4} title={t('newvm.schedule')} hint={t('newvm.scheduleHint')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('newvm.start')}</span>
                <DatePicker value={start} onChange={setStart} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('newvm.end')}</span>
                <DatePicker value={end} min={start} onChange={setEnd} />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{t('newvm.quickPick')} :</span>
              {QUICK.map((q) => (
                <button
                  key={q.key}
                  type="button"
                  onClick={() => {
                    const base = startDate && startDate.getTime() > Date.now() ? startDate : new Date();
                    setEnd(toLocalInput(new Date(base.getTime() + q.ms)));
                  }}
                  className="rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  {t(q.key)}
                </button>
              ))}
            </div>
            {!datesValid && <p className="text-xs text-amber-500">{t('newvm.endRequired')}</p>}
          </Section>

          <Section n={5} title={t('newvm.purpose')} hint={t('newvm.purposeHint')}>
            <Textarea
              rows={3}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder={t('newvm.purposePlaceholder')}
            />
          </Section>
        </div>

        {/* summary (sticky) */}
        <aside className="lg:sticky lg:top-20 lg:h-fit">
          <Card className="p-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('newvm.summary')}</h2>
            <div className="mt-3 divide-y divide-border">
              <SumRow label={t('newvm.perf')} value={perfDef ? `${perfDef.label} · ${perfDef.vcpu}/${perfDef.ramGb}` : '—'} />
              <SumRow label={t('newvm.storage')} value={storageDef?.label ?? '—'} />
              <SumRow
                label={t('newvm.os')}
                value={
                  osDef ? (
                    <span className="inline-flex items-center gap-1.5">
                      <OsIcon family={osDef.family} className="h-4 w-4" />
                      {osDef.label}
                    </span>
                  ) : (
                    '—'
                  )
                }
              />
              <SumRow label={t('newvm.connection')} value={osDef?.connect === 'rdp' ? 'RDP' : 'SSH'} />
              <SumRow label={t('newvm.duration')} value={durationLabel} />
            </div>

            <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-muted-foreground">{t('newvm.estCost')}</span>
                <span className="text-lg font-semibold tabular-nums">≈ ${monthly.toFixed(2)}</span>
              </div>
              <div className="mt-0.5 text-right text-xs text-muted-foreground">
                /{t('newvm.month')} · ${hourly.toFixed(3)}/h
              </div>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t('newvm.costNote')}</p>

            <Button className="mt-4 w-full" disabled={!valid || m.isPending} onClick={() => m.mutate()}>
              {m.isPending ? <Spinner className="h-4 w-4" /> : null}
              {m.isPending ? t('newvm.submitting') : t('newvm.submit')}
            </Button>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function SumRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
