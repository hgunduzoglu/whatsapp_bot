import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatDate, formatKurus, formatQuantity, LEDGER_TYPE_LABELS, UNIT_LABELS } from '../lib/format';
import {
  customerLabel,
  type ActivitySummary,
  type OpenProductDebtItem,
  type ReceivableLine,
} from '../lib/types';
import { Card, EmptyState, Table } from '../components/ui';

type ReportKey = 'daily' | 'weekly' | 'receivables' | 'openProducts';

const REPORTS: { key: ReportKey; label: string }[] = [
  { key: 'daily', label: 'Günlük özet' },
  { key: 'weekly', label: 'Haftalık özet' },
  { key: 'receivables', label: 'Toplam alacaklar' },
  { key: 'openProducts', label: 'Açık ürün borçları' },
];

export function ReportsPage() {
  const [report, setReport] = useState<ReportKey>('daily');

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-slate-800">Raporlar</h1>
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {REPORTS.map((item) => (
          <button
            key={item.key}
            onClick={() => setReport(item.key)}
            className={`px-3 py-2 text-sm ${
              report === item.key
                ? 'border-b-2 border-emerald-700 font-medium text-emerald-800'
                : 'text-slate-500'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {(report === 'daily' || report === 'weekly') && <ActivityReport kind={report} />}
      {report === 'receivables' && <ReceivablesReport />}
      {report === 'openProducts' && <OpenProductsReport />}
    </div>
  );
}

function ActivityReport({ kind }: { kind: 'daily' | 'weekly' }) {
  const { data } = useQuery({
    queryKey: ['report', kind],
    queryFn: () => api<ActivitySummary>(`/reports/${kind}`),
  });

  if (!data) {
    return <p className="text-sm text-slate-400">Yükleniyor…</p>;
  }

  const isEmpty =
    data.monetaryEntries.length === 0 &&
    data.productPurchases.length === 0 &&
    data.productPayments.length === 0 &&
    data.seedlingOrders.length === 0 &&
    data.promissoryNotes.length === 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Dönem: {formatDate(data.from)} - {formatDate(data.to)}
      </p>
      {isEmpty && <EmptyState message="Bu dönemde işlem yok." />}

      {data.monetaryEntries.length > 0 && (
        <Card title="Parasal hareketler">
          <Table headers={['Tarih', 'Müşteri', 'Tür', 'Tutar', 'Açıklama']}>
            {data.monetaryEntries.map((entry) => (
              <tr key={entry.id}>
                <td className="px-3 py-2">{formatDate(entry.businessDate)}</td>
                <td className="px-3 py-2 font-medium">{customerLabel(entry.customer)}</td>
                <td className="px-3 py-2">{LEDGER_TYPE_LABELS[entry.type]}</td>
                <td className="px-3 py-2">{formatKurus(entry.amountKurus)}</td>
                <td className="px-3 py-2 text-slate-500">{entry.description ?? '-'}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {data.productPurchases.length > 0 && (
        <Card title="Ürün borçları">
          <Table headers={['Tarih', 'Müşteri', 'Ürünler']}>
            {data.productPurchases.map((purchase) => (
              <tr key={purchase.id}>
                <td className="px-3 py-2">{formatDate(purchase.businessDate)}</td>
                <td className="px-3 py-2 font-medium">{customerLabel(purchase.customer)}</td>
                <td className="px-3 py-2">
                  {purchase.items
                    .map(
                      (item) =>
                        `${item.productName} ${formatQuantity(item.quantity)} ${UNIT_LABELS[item.unit] ?? item.unit}`,
                    )
                    .join(', ')}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {data.productPayments.length > 0 && (
        <Card title="Ürün ödemeleri">
          <Table headers={['Tarih', 'Müşteri', 'Ürünler', 'Değer']}>
            {data.productPayments.map((payment) => (
              <tr key={payment.id}>
                <td className="px-3 py-2">{formatDate(payment.businessDate)}</td>
                <td className="px-3 py-2 font-medium">{customerLabel(payment.customer)}</td>
                <td className="px-3 py-2">
                  {payment.items
                    .map(
                      (item) =>
                        `${item.productPurchaseItem.productName} ${formatQuantity(item.paidQuantity)}`,
                    )
                    .join(', ')}
                </td>
                <td className="px-3 py-2">{formatKurus(payment.totalAmountKurus)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {data.seedlingOrders.length > 0 && (
        <Card title="Fidan siparişleri">
          <Table headers={['Müşteri', 'Bitki', 'Teslim']}>
            {data.seedlingOrders.map((order) => (
              <tr key={order.id}>
                <td className="px-3 py-2 font-medium">
                  {order.customer ? customerLabel(order.customer) : '-'}
                </td>
                <td className="px-3 py-2">{order.plantName}</td>
                <td className="px-3 py-2">{formatDate(order.requestedPickupDate)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {data.promissoryNotes.length > 0 && (
        <Card title="Senet işlemleri">
          <Table headers={['Alacaklı', 'Tutar', 'Ödeme tarihi']}>
            {data.promissoryNotes.map((note) => (
              <tr key={note.id}>
                <td className="px-3 py-2 font-medium">{note.payeeName}</td>
                <td className="px-3 py-2">{formatKurus(note.amountKurus)}</td>
                <td className="px-3 py-2">{formatDate(note.dueDate)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}

function ReceivablesReport() {
  const { data } = useQuery({
    queryKey: ['report', 'receivables'],
    queryFn: () => api<{ total: number; lines: ReceivableLine[] }>('/reports/receivables'),
  });

  if (!data) {
    return <p className="text-sm text-slate-400">Yükleniyor…</p>;
  }

  return (
    <Card title={`Toplam parasal alacak: ${formatKurus(data.total)}`}>
      {data.lines.length === 0 ? (
        <EmptyState message="Parasal alacak yok." />
      ) : (
        <Table headers={['#', 'Müşteri', 'Bakiye']}>
          {data.lines.map((line, index) => (
            <tr key={line.customer.id}>
              <td className="px-3 py-2 text-slate-400">{index + 1}</td>
              <td className="px-3 py-2 font-medium">{customerLabel(line.customer)}</td>
              <td className="px-3 py-2 font-medium text-red-600">{formatKurus(line.balanceKurus)}</td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

function OpenProductsReport() {
  const { data } = useQuery({
    queryKey: ['report', 'openProducts'],
    queryFn: () => api<OpenProductDebtItem[]>('/reports/open-product-debts'),
  });

  if (!data) {
    return <p className="text-sm text-slate-400">Yükleniyor…</p>;
  }

  return (
    <Card title="Açık ilaç/gübre borçları">
      {data.length === 0 ? (
        <EmptyState message="Açık ürün borcu yok." />
      ) : (
        <Table headers={['Müşteri', 'Tarih', 'Ürün', 'Açık miktar']}>
          {data.map((item) => (
            <tr key={item.id}>
              <td className="px-3 py-2 font-medium">
                {customerLabel(item.productPurchase.customer)}
              </td>
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
  );
}
