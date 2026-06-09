import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatDate, ORDER_STATUS_LABELS } from '../lib/format';
import { customerLabel, type SeedlingOrder } from '../lib/types';
import { Badge, Card, EmptyState, Table } from '../components/ui';
import { ReasonModal } from './customer-modals';

export function SeedlingOrdersPage() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<{ title: string; run: (reason: string) => Promise<unknown> } | null>(null);

  const { data: orders } = useQuery({
    queryKey: ['upcomingOrders'],
    queryFn: () => api<SeedlingOrder[]>('/seedling-orders?days=60'),
  });

  const mutation = useMutation({
    mutationFn: ({ run, reason }: { run: (reason: string) => Promise<unknown>; reason: string }) =>
      run(reason),
    onSuccess: () => {
      setPending(null);
      void queryClient.invalidateQueries({ queryKey: ['upcomingOrders'] });
    },
  });

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-slate-800">
        Fidan Siparişleri
        <span className="ml-2 text-sm font-normal text-slate-400">(önümüzdeki 60 gün)</span>
      </h1>
      <Card>
        {!orders || orders.length === 0 ? (
          <EmptyState message="Yaklaşan fidan siparişi yok." />
        ) : (
          <Table headers={['Teslim tarihi', 'Müşteri', 'Bitki', 'Durum', '']}>
            {orders.map((order) => (
              <tr key={order.id}>
                <td className="px-3 py-2">{formatDate(order.requestedPickupDate)}</td>
                <td className="px-3 py-2 font-medium">
                  {order.customer ? customerLabel(order.customer) : '-'}
                </td>
                <td className="px-3 py-2">{order.plantName}</td>
                <td className="px-3 py-2">
                  <Badge tone={order.status === 'REMINDED' ? 'amber' : 'slate'}>
                    {ORDER_STATUS_LABELS[order.status] ?? order.status}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    className="mr-3 text-xs text-emerald-700 hover:underline"
                    onClick={() =>
                      setPending({
                        title: 'Teslim edildi olarak işaretle',
                        run: () => api(`/seedling-orders/${order.id}/mark-delivered`, { method: 'POST' }),
                      })
                    }
                  >
                    Teslim edildi
                  </button>
                  <button
                    className="text-xs text-red-600 hover:underline"
                    onClick={() =>
                      setPending({
                        title: 'Siparişi geri al',
                        run: (reason) =>
                          api(`/seedling-orders/${order.id}/void`, {
                            method: 'POST',
                            body: { reason: reason || null },
                          }),
                      })
                    }
                  >
                    Geri al
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <ReasonModal
        title={pending?.title ?? ''}
        requireReason={false}
        open={pending !== null}
        onClose={() => setPending(null)}
        busy={mutation.isPending}
        onConfirm={(reason) => pending && mutation.mutate({ run: pending.run, reason })}
      />
    </div>
  );
}
