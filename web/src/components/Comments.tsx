import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useToast } from '../toast';
import { fmtDate } from '../lib/format';
import { Button, Card, Spinner, Textarea } from '../ui';

export function Comments({ requestId }: { requestId: number }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [body, setBody] = useState('');

  const q = useQuery({ queryKey: ['comments', requestId], queryFn: () => api.comments(requestId) });
  const m = useMutation({
    mutationFn: () => api.addComment(requestId, body.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comments', requestId] });
      setBody('');
      toast.success(t('toast.commentAdded'));
    },
    onError: () => toast.error(t('toast.error')),
  });

  const comments = q.data ?? [];

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t('comments.title')}
      </h2>

      <div className="space-y-3">
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('comments.empty')}</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{c.author}</span>
                <span>{fmtDate(c.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{c.body}</p>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 space-y-2">
        <Textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('comments.placeholder')}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{t('comments.note')}</span>
          <Button onClick={() => m.mutate()} disabled={!body.trim() || m.isPending}>
            {m.isPending ? <Spinner className="h-4 w-4" /> : null}
            {t('comments.send')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
