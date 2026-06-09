import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { formatKurus } from '../lib/format';
import { customerLabel, type Customer } from '../lib/types';
import {
  Button,
  Card,
  EmptyState,
  ErrorText,
  Field,
  Modal,
  Table,
  TextInput,
} from '../components/ui';

export function CustomersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['customers', search],
    queryFn: () =>
      api<{ items: Customer[]; total: number }>(
        `/customers?take=100${search ? `&q=${encodeURIComponent(search)}` : ''}`,
      ),
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-800">Müşteriler</h1>
        <Button onClick={() => setCreateOpen(true)}>Yeni müşteri</Button>
      </div>

      <Card>
        <div className="mb-3">
          <TextInput
            placeholder="Müşteri ara…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {data && data.items.length === 0 ? (
          <EmptyState message="Müşteri bulunamadı." />
        ) : (
          <Table headers={['Müşteri', 'Telefon', 'Parasal bakiye', '']}>
            {data?.items.map((customer) => (
              <tr
                key={customer.id}
                className="cursor-pointer hover:bg-slate-50"
                onClick={() => navigate(`/customers/${customer.id}`)}
              >
                <td className="px-3 py-2 font-medium text-slate-800">
                  {customerLabel(customer)}
                </td>
                <td className="px-3 py-2 text-slate-500">{customer.phone ?? '-'}</td>
                <td
                  className={`px-3 py-2 font-medium ${
                    customer.balanceKurus > 0 ? 'text-red-600' : 'text-emerald-700'
                  }`}
                >
                  {formatKurus(customer.balanceKurus)}
                </td>
                <td className="px-3 py-2 text-right text-slate-300">›</td>
              </tr>
            ))}
          </Table>
        )}
        {data && (
          <p className="mt-3 text-xs text-slate-400">Toplam {data.total} müşteri</p>
        )}
      </Card>

      <CustomerFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={(customer) => {
          void queryClient.invalidateQueries({ queryKey: ['customers'] });
          navigate(`/customers/${customer.id}`);
        }}
      />
    </div>
  );
}

export function CustomerFormModal({
  open,
  onClose,
  onSaved,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (customer: Customer) => void;
  initial?: Customer;
}) {
  const [baseName, setBaseName] = useState(initial?.baseName ?? '');
  const [identifier, setIdentifier] = useState(initial?.identifier ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        baseName,
        identifier: identifier || null,
        phone: phone || null,
        note: note || null,
      };
      return initial
        ? api<Customer>(`/customers/${initial.id}`, { method: 'PATCH', body })
        : api<Customer>('/customers', { method: 'POST', body });
    },
    onSuccess: (customer) => {
      onClose();
      onSaved(customer);
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof ApiError && mutationError.status === 409
          ? 'Bu isimde bir müşteri zaten var. Ayırt edici bilgi ekleyin.'
          : 'Kaydetme başarısız oldu.',
      );
    },
  });

  return (
    <Modal title={initial ? 'Müşteriyi düzenle' : 'Yeni müşteri'} open={open} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          mutation.mutate();
        }}
        className="space-y-3"
      >
        <Field label="İsim *">
          <TextInput value={baseName} onChange={(e) => setBaseName(e.target.value)} required />
        </Field>
        <Field label="Ayırt edici bilgi (köy, mahalle…)">
          <TextInput value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
        </Field>
        <Field label="Telefon">
          <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Not">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            Kaydet
          </Button>
        </div>
        <ErrorText message={error} />
      </form>
    </Modal>
  );
}
