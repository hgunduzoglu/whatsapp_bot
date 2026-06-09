import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import type { Backup } from '../lib/types';
import { Badge, Button, Card, EmptyState, Table } from '../components/ui';

const STATUS_TONES: Record<string, string> = {
  SUCCESS: 'green',
  RUNNING: 'amber',
  FAILED: 'red',
};

const STATUS_LABELS: Record<string, string> = {
  SUCCESS: 'Başarılı',
  RUNNING: 'Çalışıyor',
  FAILED: 'Hatalı',
};

function formatSize(bytes: number | null): string {
  if (bytes == null) {
    return '-';
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BackupsPage() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['backups'],
    queryFn: () => api<{ configured: boolean; items: Backup[] }>('/backups'),
    refetchInterval: 10_000,
  });

  const runMutation = useMutation({
    mutationFn: () => api('/backups/run', { method: 'POST' }),
    onSuccess: () => {
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: ['backups'] }), 1500);
    },
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-800">Yedekler</h1>
        <Button onClick={() => runMutation.mutate()} disabled={!data?.configured || runMutation.isPending}>
          Şimdi yedek al
        </Button>
      </div>

      {data && !data.configured && (
        <Card>
          <p className="text-sm text-amber-700">
            Yedekleme yapılandırılmamış. Sunucuda R2 ortam değişkenlerini (R2_ACCESS_KEY_ID,
            R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_ENDPOINT) ayarlayın.
          </p>
        </Card>
      )}

      {data && data.configured && (
        <Card>
          {data.items.length === 0 ? (
            <EmptyState message="Henüz yedek alınmadı." />
          ) : (
            <Table headers={['Zaman', 'Dosya', 'Boyut', 'Tetikleyen', 'Durum']}>
              {data.items.map((backup) => (
                <tr key={backup.id}>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                    {formatDateTime(backup.createdAt)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{backup.fileName}</td>
                  <td className="px-3 py-2">{formatSize(backup.sizeBytes)}</td>
                  <td className="px-3 py-2">{backup.trigger === 'MANUAL' ? 'Manuel' : 'Zamanlı'}</td>
                  <td className="px-3 py-2">
                    <Badge tone={STATUS_TONES[backup.status] ?? 'slate'}>
                      {STATUS_LABELS[backup.status] ?? backup.status}
                    </Badge>
                    {backup.errorMessage && (
                      <p className="mt-1 text-xs text-red-600">{backup.errorMessage}</p>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}
