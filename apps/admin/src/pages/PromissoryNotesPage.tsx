import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatDate, formatKurus, parseMoneyInput } from '../lib/format';
import type { PromissoryNote } from '../lib/types';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorText,
  Field,
  Modal,
  Table,
  TextInput,
} from '../components/ui';
import { ReasonModal } from './customer-modals';

export function PromissoryNotesPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'pending' | 'paid'>('pending');
  const [addOpen, setAddOpen] = useState(false);
  const [pending, setPending] = useState<{ title: string; requireReason: boolean; run: (reason: string) => Promise<unknown> } | null>(null);

  const { data: notes } = useQuery({
    queryKey: ['notes', view],
    queryFn: () => api<PromissoryNote[]>(`/promissory-notes?view=${view}`),
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['notes'] });

  const mutation = useMutation({
    mutationFn: ({ run, reason }: { run: (reason: string) => Promise<unknown>; reason: string }) =>
      run(reason),
    onSuccess: () => {
      setPending(null);
      refresh();
    },
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-800">
          Senetlerim
          <span className="ml-2 text-sm font-normal text-slate-400">(işletmenin ödeyeceği senetler)</span>
        </h1>
        <Button onClick={() => setAddOpen(true)}>Senet ekle</Button>
      </div>

      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {(['pending', 'paid'] as const).map((key) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`px-3 py-2 text-sm ${
              view === key
                ? 'border-b-2 border-emerald-700 font-medium text-emerald-800'
                : 'text-slate-500'
            }`}
          >
            {key === 'pending' ? 'Bekleyen' : 'Ödenmiş'}
          </button>
        ))}
      </div>

      <Card>
        {!notes || notes.length === 0 ? (
          <EmptyState message={view === 'pending' ? 'Bekleyen senet yok.' : 'Ödenmiş senet yok.'} />
        ) : (
          <Table headers={['Ödeme tarihi', 'Alacaklı', 'Tutar', 'Açıklama', '']}>
            {notes.map((note) => (
              <tr key={note.id}>
                <td className="px-3 py-2">{formatDate(note.dueDate)}</td>
                <td className="px-3 py-2 font-medium">{note.payeeName}</td>
                <td className="px-3 py-2">{formatKurus(note.amountKurus)}</td>
                <td className="px-3 py-2 text-slate-500">{note.note ?? '-'}</td>
                <td className="px-3 py-2 text-right">
                  {view === 'pending' ? (
                    <>
                      <button
                        className="mr-3 text-xs text-emerald-700 hover:underline"
                        onClick={() =>
                          setPending({
                            title: `"${note.payeeName}" senedi ödendi olarak işaretlenecek`,
                            requireReason: false,
                            run: () => api(`/promissory-notes/${note.id}/mark-paid`, { method: 'POST' }),
                          })
                        }
                      >
                        Ödendi
                      </button>
                      <button
                        className="text-xs text-red-600 hover:underline"
                        onClick={() =>
                          setPending({
                            title: 'Senedi geri al',
                            requireReason: false,
                            run: (reason) =>
                              api(`/promissory-notes/${note.id}/void`, {
                                method: 'POST',
                                body: { reason: reason || null },
                              }),
                          })
                        }
                      >
                        Geri al
                      </button>
                    </>
                  ) : (
                    <Badge tone="green">Ödendi</Badge>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <AddNoteModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={refresh} />
      <ReasonModal
        title={pending?.title ?? ''}
        requireReason={pending?.requireReason ?? false}
        open={pending !== null}
        onClose={() => setPending(null)}
        busy={mutation.isPending}
        onConfirm={(reason) => pending && mutation.mutate({ run: pending.run, reason })}
      />
    </div>
  );
}

function AddNoteModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [payeeName, setPayeeName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (amountKurus: number) =>
      api('/promissory-notes', {
        method: 'POST',
        body: { payeeName, amountKurus, dueDate, note: note || null },
      }),
    onSuccess: () => {
      setPayeeName('');
      setAmount('');
      setDueDate('');
      setNote('');
      onClose();
      onSaved();
    },
    onError: () => setError('Kaydetme başarısız oldu.'),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const amountKurus = parseMoneyInput(amount);
    if (amountKurus === null) {
      setError('Geçersiz tutar. Örnek: 25.000 veya 1.250,50');
      return;
    }
    mutation.mutate(amountKurus);
  };

  return (
    <Modal title="Senet ekle" open={open} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Alacaklı (kime ödenecek) *">
          <TextInput value={payeeName} onChange={(e) => setPayeeName(e.target.value)} required />
        </Field>
        <Field label="Tutar (TL) *">
          <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </Field>
        <Field label="Ödeme tarihi *">
          <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
        </Field>
        <Field label="Açıklama">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <p className="text-xs text-slate-400">3 gün ve 1 gün kala WhatsApp hatırlatması yapılır.</p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button type="submit" disabled={mutation.isPending}>Kaydet</Button>
        </div>
        <ErrorText message={error} />
      </form>
    </Modal>
  );
}
