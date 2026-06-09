import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import {
  formatDate,
  formatKurus,
  formatQuantity,
  LEDGER_TYPE_LABELS,
  ORDER_STATUS_LABELS,
  UNIT_LABELS,
} from '../lib/format';
import {
  customerLabel,
  type Customer,
  type CustomerStatement,
  type LedgerEntry,
  type ProductPayment,
  type Purchase,
  type SeedlingOrder,
} from '../lib/types';
import { Badge, Button, Card, EmptyState, Table } from '../components/ui';
import { CustomerFormModal } from './CustomersPage';
import {
  AdjustmentModal,
  MoneyEntryModal,
  ProductDebtModal,
  ProductPaymentModal,
  ReasonModal,
  SeedlingDebtModal,
  SeedlingOrderModal,
  type OpenItemOption,
} from './customer-modals';

type TabKey = 'ledger' | 'products' | 'productPayments' | 'seedlings' | 'statement';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'ledger', label: 'Parasal hareketler' },
  { key: 'products', label: 'Ürün borçları' },
  { key: 'productPayments', label: 'Ürün ödemeleri' },
  { key: 'seedlings', label: 'Fidan siparişleri' },
  { key: 'statement', label: 'Ekstre' },
];

type ModalKey =
  | 'debt'
  | 'payment'
  | 'adjustment'
  | 'productDebt'
  | 'productPayment'
  | 'seedlingOrder'
  | 'seedlingDebt'
  | 'edit'
  | null;

interface PendingAction {
  title: string;
  requireReason: boolean;
  run: (reason: string) => Promise<unknown>;
}

export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>('ledger');
  const [modal, setModal] = useState<ModalKey>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const { data: customer } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api<Customer>(`/customers/${id}`),
  });
  const { data: ledger } = useQuery({
    queryKey: ['ledger', id],
    queryFn: () => api<LedgerEntry[]>(`/customers/${id}/monetary-ledger`),
  });
  const { data: purchases } = useQuery({
    queryKey: ['purchases', id],
    queryFn: () => api<Purchase[]>(`/customers/${id}/product-debts`),
  });
  const { data: productPayments } = useQuery({
    queryKey: ['productPayments', id],
    queryFn: () => api<ProductPayment[]>(`/customers/${id}/product-payments`),
  });
  const { data: orders } = useQuery({
    queryKey: ['orders', id],
    queryFn: () => api<SeedlingOrder[]>(`/customers/${id}/seedling-orders`),
  });

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['customer', id] });
    void queryClient.invalidateQueries({ queryKey: ['ledger', id] });
    void queryClient.invalidateQueries({ queryKey: ['purchases', id] });
    void queryClient.invalidateQueries({ queryKey: ['productPayments', id] });
    void queryClient.invalidateQueries({ queryKey: ['orders', id] });
    void queryClient.invalidateQueries({ queryKey: ['customers'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const actionMutation = useMutation({
    mutationFn: async ({ action, reason }: { action: PendingAction; reason: string }) =>
      action.run(reason),
    onSuccess: () => {
      setPendingAction(null);
      refreshAll();
    },
  });

  const openItems: OpenItemOption[] = useMemo(() => {
    if (!purchases) {
      return [];
    }
    return purchases.flatMap((purchase) =>
      purchase.items
        .filter((item) => Number(item.remainingQuantity) > 0)
        .map((item) => ({
          id: item.id,
          label: item.productName,
          unit: item.unit,
          remaining: Number(item.remainingQuantity),
          dateLabel: formatDate(purchase.businessDate),
        })),
    );
  }, [purchases]);

  if (!customer) {
    return <p className="text-sm text-slate-400">Yükleniyor…</p>;
  }

  return (
    <div>
      <button onClick={() => navigate('/customers')} className="mb-3 text-sm text-slate-500 hover:underline">
        ← Müşteriler
      </button>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">{customerLabel(customer)}</h1>
          <p className="text-sm text-slate-500">
            {customer.phone ?? 'Telefon yok'}
            {customer.note ? ` • ${customer.note}` : ''}
          </p>
          <p className={`mt-1 text-xl font-bold ${customer.balanceKurus > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
            {formatKurus(customer.balanceKurus)}
            <span className="ml-2 text-xs font-normal text-slate-400">parasal bakiye</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setModal('debt')}>Borç ekle</Button>
          <Button onClick={() => setModal('payment')}>Ödeme al</Button>
          <Button variant="secondary" onClick={() => setModal('productDebt')}>Ürün borcu</Button>
          <Button variant="secondary" onClick={() => setModal('productPayment')} disabled={openItems.length === 0}>
            Ürün ödemesi
          </Button>
          <Button variant="secondary" onClick={() => setModal('seedlingOrder')}>Fidan siparişi</Button>
          <Button variant="secondary" onClick={() => setModal('seedlingDebt')}>Fidan borcu</Button>
          <Button variant="secondary" onClick={() => setModal('adjustment')}>Düzeltme</Button>
          <Button variant="ghost" onClick={() => setModal('edit')}>Düzenle</Button>
          <Button
            variant="danger"
            onClick={() =>
              setPendingAction({
                title: 'Müşteriyi sil',
                requireReason: true,
                run: (reason) =>
                  api(`/customers/${id}`, { method: 'DELETE', body: { reason } }).then(() =>
                    navigate('/customers'),
                  ),
              })
            }
          >
            Sil
          </Button>
        </div>
      </div>

      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`px-3 py-2 text-sm ${
              tab === item.key
                ? 'border-b-2 border-emerald-700 font-medium text-emerald-800'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'ledger' && (
        <LedgerTab ledger={ledger ?? []} onAction={setPendingAction} customerId={id} />
      )}
      {tab === 'products' && (
        <PurchasesTab purchases={purchases ?? []} onAction={setPendingAction} />
      )}
      {tab === 'productPayments' && (
        <ProductPaymentsTab payments={productPayments ?? []} onAction={setPendingAction} />
      )}
      {tab === 'seedlings' && <SeedlingsTab orders={orders ?? []} onAction={setPendingAction} />}
      {tab === 'statement' && <StatementTab customerId={id} />}

      <MoneyEntryModal customerId={id} kind="debt" open={modal === 'debt'} onClose={() => setModal(null)} onSaved={refreshAll} />
      <MoneyEntryModal customerId={id} kind="payment" open={modal === 'payment'} onClose={() => setModal(null)} onSaved={refreshAll} />
      <AdjustmentModal customerId={id} open={modal === 'adjustment'} onClose={() => setModal(null)} onSaved={refreshAll} />
      <ProductDebtModal customerId={id} open={modal === 'productDebt'} onClose={() => setModal(null)} onSaved={refreshAll} />
      <ProductPaymentModal customerId={id} openItems={openItems} open={modal === 'productPayment'} onClose={() => setModal(null)} onSaved={refreshAll} />
      <SeedlingOrderModal customerId={id} open={modal === 'seedlingOrder'} onClose={() => setModal(null)} onSaved={refreshAll} />
      <SeedlingDebtModal customerId={id} orders={orders ?? []} open={modal === 'seedlingDebt'} onClose={() => setModal(null)} onSaved={refreshAll} />
      {modal === 'edit' && (
        <CustomerFormModal open initial={customer} onClose={() => setModal(null)} onSaved={refreshAll} />
      )}

      <ReasonModal
        title={pendingAction?.title ?? ''}
        requireReason={pendingAction?.requireReason ?? false}
        open={pendingAction !== null}
        onClose={() => setPendingAction(null)}
        busy={actionMutation.isPending}
        onConfirm={(reason) =>
          pendingAction && actionMutation.mutate({ action: pendingAction, reason })
        }
      />
    </div>
  );
}

function LedgerTab({
  ledger,
  customerId,
  onAction,
}: {
  ledger: LedgerEntry[];
  customerId: string;
  onAction: (action: PendingAction) => void;
}) {
  void customerId;
  if (ledger.length === 0) {
    return <EmptyState message="Parasal hareket yok." />;
  }
  return (
    <Card>
      <Table headers={['Tarih', 'Tür', 'Tutar', 'Açıklama', 'Kaynak', '']}>
        {ledger.map((entry) => (
          <tr key={entry.id}>
            <td className="px-3 py-2">{formatDate(entry.businessDate)}</td>
            <td className="px-3 py-2">
              <Badge tone={entry.type === 'DEBT' ? 'red' : entry.type === 'PAYMENT' ? 'green' : 'amber'}>
                {LEDGER_TYPE_LABELS[entry.type]}
              </Badge>
            </td>
            <td className="px-3 py-2 font-medium">{formatKurus(entry.amountKurus)}</td>
            <td className="px-3 py-2 text-slate-500">{entry.description ?? '-'}</td>
            <td className="px-3 py-2 text-xs text-slate-400">{entry.source}</td>
            <td className="px-3 py-2 text-right">
              <button
                className="text-xs text-red-600 hover:underline"
                onClick={() =>
                  onAction({
                    title: 'İşlemi geri al',
                    requireReason: false,
                    run: (reason) =>
                      api(`/monetary-ledger/${entry.id}/void`, {
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
    </Card>
  );
}

function PurchasesTab({
  purchases,
  onAction,
}: {
  purchases: Purchase[];
  onAction: (action: PendingAction) => void;
}) {
  if (purchases.length === 0) {
    return <EmptyState message="Ürün borcu yok." />;
  }
  return (
    <div className="space-y-4">
      {purchases.map((purchase) => (
        <Card key={purchase.id}>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium text-slate-700">
              {formatDate(purchase.businessDate)}
              {purchase.note && <span className="ml-2 font-normal text-slate-400">{purchase.note}</span>}
            </div>
            <div className="flex items-center gap-3">
              {purchase.estimatedAmountKurus != null && (
                <span className="text-xs text-slate-400">
                  Tahmini: {formatKurus(purchase.estimatedAmountKurus)}
                </span>
              )}
              <Badge tone={purchase.status === 'PAID' ? 'green' : purchase.status === 'OPEN' ? 'red' : 'amber'}>
                {purchase.status === 'PAID' ? 'Kapandı' : purchase.status === 'OPEN' ? 'Açık' : 'Kısmi'}
              </Badge>
              <button
                className="text-xs text-red-600 hover:underline"
                onClick={() =>
                  onAction({
                    title: 'Ürün borcunu geri al',
                    requireReason: false,
                    run: (reason) =>
                      api(`/product-debts/${purchase.id}/void`, {
                        method: 'POST',
                        body: { reason: reason || null },
                      }),
                  })
                }
              >
                Geri al
              </button>
            </div>
          </div>
          <Table headers={['Ürün', 'Alınan', 'Açık']}>
            {purchase.items.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-2">{item.productName}</td>
                <td className="px-3 py-2">
                  {formatQuantity(item.quantity)} {UNIT_LABELS[item.unit] ?? item.unit}
                </td>
                <td className="px-3 py-2">
                  {Number(item.remainingQuantity) === 0 ? (
                    <Badge tone="green">kapandı</Badge>
                  ) : (
                    `${formatQuantity(item.remainingQuantity)} ${UNIT_LABELS[item.unit] ?? item.unit}`
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      ))}
    </div>
  );
}

function ProductPaymentsTab({
  payments,
  onAction,
}: {
  payments: ProductPayment[];
  onAction: (action: PendingAction) => void;
}) {
  if (payments.length === 0) {
    return <EmptyState message="Ürün ödemesi yok." />;
  }
  return (
    <Card>
      <Table headers={['Tarih', 'Ürünler', 'Muhasebe değeri', '']}>
        {payments.map((payment) => (
          <tr key={payment.id}>
            <td className="px-3 py-2">{formatDate(payment.businessDate)}</td>
            <td className="px-3 py-2">
              {payment.items
                .map(
                  (item) =>
                    `${item.productPurchaseItem.productName} ${formatQuantity(item.paidQuantity)} ${
                      UNIT_LABELS[item.productPurchaseItem.unit] ?? item.productPurchaseItem.unit
                    }`,
                )
                .join(', ')}
            </td>
            <td className="px-3 py-2">{formatKurus(payment.totalAmountKurus)}</td>
            <td className="px-3 py-2 text-right">
              <button
                className="text-xs text-red-600 hover:underline"
                onClick={() =>
                  onAction({
                    title: 'Ürün ödemesini geri al (açık miktarlar geri yüklenir)',
                    requireReason: false,
                    run: (reason) =>
                      api(`/product-payments/${payment.id}/void`, {
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
    </Card>
  );
}

function SeedlingsTab({
  orders,
  onAction,
}: {
  orders: SeedlingOrder[];
  onAction: (action: PendingAction) => void;
}) {
  if (orders.length === 0) {
    return <EmptyState message="Fidan siparişi yok." />;
  }
  return (
    <Card>
      <Table headers={['Teslim tarihi', 'Bitki', 'Tohum', 'Durum', '']}>
        {orders.map((order) => (
          <tr key={order.id}>
            <td className="px-3 py-2">{formatDate(order.requestedPickupDate)}</td>
            <td className="px-3 py-2 font-medium">{order.plantName}</td>
            <td className="px-3 py-2 text-slate-500">
              {order.seedGiven
                ? `${order.seedPlantName ?? ''} ${order.seedAmount ? formatQuantity(order.seedAmount) : ''} ${
                    order.seedUnit === 'GRAM' ? 'gram' : 'zarf'
                  }`
                : 'Vermedi'}
            </td>
            <td className="px-3 py-2">
              <Badge tone={order.status === 'DELIVERED' ? 'green' : 'amber'}>
                {ORDER_STATUS_LABELS[order.status] ?? order.status}
              </Badge>
            </td>
            <td className="px-3 py-2 text-right">
              {(order.status === 'PENDING' || order.status === 'REMINDED') && (
                <button
                  className="mr-3 text-xs text-emerald-700 hover:underline"
                  onClick={() =>
                    onAction({
                      title: 'Teslim edildi olarak işaretle',
                      requireReason: false,
                      run: () => api(`/seedling-orders/${order.id}/mark-delivered`, { method: 'POST' }),
                    })
                  }
                >
                  Teslim edildi
                </button>
              )}
              <button
                className="text-xs text-red-600 hover:underline"
                onClick={() =>
                  onAction({
                    title: 'Siparişi geri al',
                    requireReason: false,
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
    </Card>
  );
}

function StatementTab({ customerId }: { customerId: string }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data } = useQuery({
    queryKey: ['statement', customerId, from, to],
    queryFn: () => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return api<CustomerStatement>(`/reports/customers/${customerId}/statement${suffix}`);
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Başlangıç</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Bitiş</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1" />
          </label>
          <span className="text-xs text-slate-400">Boş bırakılırsa tüm geçmiş gösterilir.</span>
        </div>
      </Card>

      {data && (
        <>
          <Card title="Parasal hareketler">
            {data.monetaryEntries.length === 0 ? (
              <EmptyState message="Hareket yok." />
            ) : (
              <Table headers={['Tarih', 'Tür', 'Tutar', 'Açıklama']}>
                {data.monetaryEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-3 py-2">{formatDate(entry.businessDate)}</td>
                    <td className="px-3 py-2">{LEDGER_TYPE_LABELS[entry.type]}</td>
                    <td className="px-3 py-2">{formatKurus(entry.amountKurus)}</td>
                    <td className="px-3 py-2 text-slate-500">{entry.description ?? '-'}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
          <Card title="Açık ürün borçları">
            {data.openItems.length === 0 ? (
              <EmptyState message="Açık ürün borcu yok." />
            ) : (
              <Table headers={['Tarih', 'Ürün', 'Açık miktar']}>
                {data.openItems.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2">{formatDate(item.productPurchase.businessDate)}</td>
                    <td className="px-3 py-2">{item.productName}</td>
                    <td className="px-3 py-2">
                      {formatQuantity(item.remainingQuantity)} {UNIT_LABELS[item.unit] ?? item.unit}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
          <Card>
            <p className="text-sm text-slate-600">
              Güncel parasal bakiye:{' '}
              <span className="font-semibold">{formatKurus(data.balanceKurus)}</span>
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
