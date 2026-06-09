import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatKurus } from '../lib/format';
import type { DashboardData } from '../lib/types';
import { Card } from '../components/ui';

export function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<DashboardData>('/dashboard'),
  });

  if (isLoading || !data) {
    return <p className="text-sm text-slate-400">Yükleniyor…</p>;
  }

  const stats = [
    { label: 'Toplam parasal alacak', value: formatKurus(data.totalReceivablesKurus) },
    { label: 'Alacaklı müşteri', value: String(data.receivableCustomerCount) },
    { label: 'Açık ürün borçlu müşteri', value: String(data.openProductDebtCustomerCount) },
    { label: 'Yaklaşan fidan teslimi (30 gün)', value: String(data.upcomingSeedlingCount) },
    { label: 'Yaklaşan senet (30 gün)', value: String(data.upcomingNoteCount) },
    { label: 'Bugünkü borç girişleri', value: formatKurus(data.todayDebtsKurus) },
    { label: 'Bugünkü ödemeler', value: formatKurus(data.todayPaymentsKurus) },
  ];

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-slate-800">Panel</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <p className="text-xs text-slate-500">{stat.label}</p>
            <p className="mt-1 text-xl font-semibold text-slate-800">{stat.value}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
