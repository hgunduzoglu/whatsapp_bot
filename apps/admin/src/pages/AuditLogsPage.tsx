import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import type { AuditLog } from '../lib/types';
import { Button, Card, EmptyState, Table } from '../components/ui';

const PAGE_SIZE = 50;

export function AuditLogsPage() {
  const [page, setPage] = useState(0);

  const { data } = useQuery({
    queryKey: ['auditLogs', page],
    queryFn: () =>
      api<{ items: AuditLog[]; total: number }>(
        `/audit-logs?take=${PAGE_SIZE}&skip=${page * PAGE_SIZE}`,
      ),
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-slate-800">İşlem Kayıtları</h1>
      <Card>
        {!data || data.items.length === 0 ? (
          <EmptyState message="Kayıt yok." />
        ) : (
          <>
            <Table headers={['Zaman', 'İşlem', 'Kayıt türü', 'Kim', 'Sebep']}>
              {data.items.map((log) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{log.action}</td>
                  <td className="px-3 py-2">{log.entityType}</td>
                  <td className="px-3 py-2 text-slate-500">{log.actorPhone ?? '-'}</td>
                  <td className="px-3 py-2 text-slate-500">{log.reason ?? '-'}</td>
                </tr>
              ))}
            </Table>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-slate-400">
                Toplam {data.total} kayıt — sayfa {page + 1}/{Math.max(totalPages, 1)}
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  ‹ Önceki
                </Button>
                <Button
                  variant="secondary"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Sonraki ›
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
