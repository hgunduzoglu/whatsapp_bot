import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import { CATEGORY_LABELS, formatQuantity, parseMoneyInput, UNIT_LABELS } from '../lib/format';
import type { SeedlingOrder } from '../lib/types';
import { Button, ErrorText, Field, Modal, SelectInput, TextInput } from '../components/ui';

interface BaseModalProps {
  customerId: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const MONEY_HINT = 'Örnek: 1.500 veya 750,25 (nokta binlik, virgül kuruş)';

/** Manual monetary debt or payment entry. */
export function MoneyEntryModal({
  customerId,
  kind,
  open,
  onClose,
  onSaved,
}: BaseModalProps & { kind: 'debt' | 'payment' }) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [businessDate, setBusinessDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (amountKurus: number) =>
      api(`/customers/${customerId}/monetary-${kind === 'debt' ? 'debts' : 'payments'}`, {
        method: 'POST',
        body: {
          amountKurus,
          description: description || null,
          ...(businessDate ? { businessDate } : {}),
        },
      }),
    onSuccess: () => {
      setAmount('');
      setDescription('');
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
      setError(`Geçersiz tutar. ${MONEY_HINT}`);
      return;
    }
    mutation.mutate(amountKurus);
  };

  return (
    <Modal title={kind === 'debt' ? 'Parasal borç ekle' : 'Parasal ödeme al'} open={open} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label={`Tutar (TL) — ${MONEY_HINT}`}>
          <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
        </Field>
        <Field label="Açıklama">
          <TextInput value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Tarih (boş = bugün)">
          <TextInput type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button type="submit" disabled={mutation.isPending}>Kaydet</Button>
        </div>
        <ErrorText message={error} />
      </form>
    </Modal>
  );
}

/** Balance adjustment with a mandatory reason. */
export function AdjustmentModal({ customerId, open, onClose, onSaved }: BaseModalProps) {
  const [direction, setDirection] = useState<'INCREASE' | 'DECREASE'>('INCREASE');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (amountKurus: number) =>
      api(`/customers/${customerId}/monetary-adjustments`, {
        method: 'POST',
        body: { direction, amountKurus, reason },
      }),
    onSuccess: () => {
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
      setError(`Geçersiz tutar. ${MONEY_HINT}`);
      return;
    }
    mutation.mutate(amountKurus);
  };

  return (
    <Modal title="Düzeltme hareketi" open={open} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Düzeltme türü">
          <SelectInput value={direction} onChange={(e) => setDirection(e.target.value as 'INCREASE' | 'DECREASE')}>
            <option value="INCREASE">Borç artır</option>
            <option value="DECREASE">Borç azalt</option>
          </SelectInput>
        </Field>
        <Field label="Tutar (TL)">
          <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </Field>
        <Field label="Sebep *">
          <TextInput value={reason} onChange={(e) => setReason(e.target.value)} required />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button type="submit" disabled={mutation.isPending}>Kaydet</Button>
        </div>
        <ErrorText message={error} />
      </form>
    </Modal>
  );
}

interface DraftItem {
  productName: string;
  category: string;
  quantity: string;
  unit: string;
}

const EMPTY_ITEM: DraftItem = { productName: '', category: 'MEDICINE', quantity: '', unit: 'PIECE' };

/** Product (pesticide/fertilizer) debt entry with multiple line items. */
export function ProductDebtModal({ customerId, open, onClose, onSaved }: BaseModalProps) {
  const [items, setItems] = useState<DraftItem[]>([{ ...EMPTY_ITEM }]);
  const [note, setNote] = useState('');
  const [estimate, setEstimate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (body: unknown) =>
      api(`/customers/${customerId}/product-debts`, { method: 'POST', body }),
    onSuccess: () => {
      setItems([{ ...EMPTY_ITEM }]);
      setNote('');
      setEstimate('');
      onClose();
      onSaved();
    },
    onError: () => setError('Kaydetme başarısız oldu.'),
  });

  const updateItem = (index: number, patch: Partial<DraftItem>) => {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const parsedItems = [];
    for (const item of items) {
      const quantity = Number(item.quantity.replace(',', '.'));
      if (!item.productName.trim() || !Number.isFinite(quantity) || quantity <= 0) {
        setError('Her ürün için ad ve geçerli bir miktar giriniz.');
        return;
      }
      parsedItems.push({
        productName: item.productName.trim(),
        category: item.category,
        quantity,
        unit: item.unit,
      });
    }

    let estimatedAmountKurus: number | null = null;
    if (estimate.trim()) {
      estimatedAmountKurus = parseMoneyInput(estimate);
      if (estimatedAmountKurus === null) {
        setError(`Geçersiz tahmini değer. ${MONEY_HINT}`);
        return;
      }
    }

    mutation.mutate({ items: parsedItems, note: note || null, estimatedAmountKurus });
  };

  return (
    <Modal title="İlaç/Gübre borcu ekle" open={open} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="rounded-md border border-slate-200 p-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Ürün adı *">
                <TextInput
                  value={item.productName}
                  onChange={(e) => updateItem(index, { productName: e.target.value })}
                />
              </Field>
              <Field label="Tür">
                <SelectInput
                  value={item.category}
                  onChange={(e) => updateItem(index, { category: e.target.value })}
                >
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Miktar *">
                <TextInput
                  value={item.quantity}
                  onChange={(e) => updateItem(index, { quantity: e.target.value })}
                />
              </Field>
              <Field label="Birim">
                <SelectInput
                  value={item.unit}
                  onChange={(e) => updateItem(index, { unit: e.target.value })}
                >
                  {Object.entries(UNIT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </SelectInput>
              </Field>
            </div>
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                className="mt-2 text-xs text-red-600 hover:underline"
              >
                Bu ürünü kaldır
              </button>
            )}
          </div>
        ))}
        <Button variant="secondary" onClick={() => setItems((current) => [...current, { ...EMPTY_ITEM }])}>
          + Ürün ekle
        </Button>
        <Field label="Not">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Field label="Tahmini TL değeri (raporlama için, bakiyeyi etkilemez)">
          <TextInput value={estimate} onChange={(e) => setEstimate(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button type="submit" disabled={mutation.isPending}>Kaydet</Button>
        </div>
        <ErrorText message={error} />
      </form>
    </Modal>
  );
}

export interface OpenItemOption {
  id: string;
  label: string;
  unit: string;
  remaining: number;
  dateLabel: string;
}

/** Settles one open product debt item (partially or fully). */
export function ProductPaymentModal({
  customerId,
  openItems,
  open,
  onClose,
  onSaved,
}: BaseModalProps & { openItems: OpenItemOption[] }) {
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const selected = openItems.find((item) => item.id === itemId);

  const mutation = useMutation({
    mutationFn: (body: unknown) =>
      api(`/customers/${customerId}/product-payments`, { method: 'POST', body }),
    onSuccess: () => {
      setItemId('');
      setQuantity('');
      setAmount('');
      onClose();
      onSaved();
    },
    onError: () => setError('Kaydetme başarısız oldu. Açık miktardan fazla kapatılamaz.'),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!selected) {
      setError('Kapatılacak ürünü seçiniz.');
      return;
    }
    const paidQuantity = Number(quantity.replace(',', '.'));
    if (!Number.isFinite(paidQuantity) || paidQuantity <= 0) {
      setError('Geçerli bir miktar giriniz.');
      return;
    }
    if (paidQuantity > selected.remaining) {
      setError('Açık miktardan fazla ürün kapatılamaz.');
      return;
    }
    let amountKurus: number | null = null;
    if (amount.trim()) {
      amountKurus = parseMoneyInput(amount);
      if (amountKurus === null) {
        setError(`Geçersiz TL değeri. ${MONEY_HINT}`);
        return;
      }
    }
    mutation.mutate({
      allocations: [{ productPurchaseItemId: selected.id, paidQuantity, amountKurus }],
    });
  };

  return (
    <Modal title="Ürün ödemesi gir" open={open} onClose={onClose}>
      <p className="mb-3 text-xs text-amber-700">
        Ürün ödemesi parasal bakiyeden düşmez; yalnızca açık ürün miktarını kapatır.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Açık ürün *">
          <SelectInput value={itemId} onChange={(e) => setItemId(e.target.value)} required>
            <option value="">Seçiniz…</option>
            {openItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.dateLabel} - {item.label} ({formatQuantity(item.remaining)}{' '}
                {UNIT_LABELS[item.unit] ?? item.unit} açık)
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Kapatılacak miktar *">
          <TextInput value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
        </Field>
        <Field label="Muhasebe değeri (TL, opsiyonel)">
          <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button type="submit" disabled={mutation.isPending}>Kaydet</Button>
        </div>
        <ErrorText message={error} />
      </form>
    </Modal>
  );
}

/** New seedling order (creates no debt by itself). */
export function SeedlingOrderModal({ customerId, open, onClose, onSaved }: BaseModalProps) {
  const [plantName, setPlantName] = useState('');
  const [seedGiven, setSeedGiven] = useState(false);
  const [seedPlantName, setSeedPlantName] = useState('');
  const [seedAmount, setSeedAmount] = useState('');
  const [seedUnit, setSeedUnit] = useState('ENVELOPE');
  const [pickupDate, setPickupDate] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (body: unknown) =>
      api(`/customers/${customerId}/seedling-orders`, { method: 'POST', body }),
    onSuccess: () => {
      onClose();
      onSaved();
    },
    onError: () => setError('Kaydetme başarısız oldu.'),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    mutation.mutate({
      plantName,
      seedGiven,
      seedPlantName: seedGiven ? seedPlantName || null : null,
      seedAmount: seedGiven && seedAmount ? Number(seedAmount.replace(',', '.')) : null,
      seedUnit: seedGiven ? seedUnit : null,
      requestedPickupDate: pickupDate,
      note: note || null,
    });
  };

  return (
    <Modal title="Fidan siparişi oluştur" open={open} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Bitki adı *">
          <TextInput value={plantName} onChange={(e) => setPlantName(e.target.value)} required />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={seedGiven}
            onChange={(e) => setSeedGiven(e.target.checked)}
          />
          Müşteri tohum verdi
        </label>
        {seedGiven && (
          <div className="grid grid-cols-3 gap-2">
            <Field label="Tohum bitkisi">
              <TextInput value={seedPlantName} onChange={(e) => setSeedPlantName(e.target.value)} />
            </Field>
            <Field label="Miktar">
              <TextInput value={seedAmount} onChange={(e) => setSeedAmount(e.target.value)} />
            </Field>
            <Field label="Birim">
              <SelectInput value={seedUnit} onChange={(e) => setSeedUnit(e.target.value)}>
                <option value="ENVELOPE">zarf</option>
                <option value="GRAM">gram</option>
              </SelectInput>
            </Field>
          </div>
        )}
        <Field label="Teslim tarihi *">
          <TextInput type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} required />
        </Field>
        <Field label="Not">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button type="submit" disabled={mutation.isPending}>Kaydet</Button>
        </div>
        <ErrorText message={error} />
      </form>
    </Modal>
  );
}

/** Seedling debt: recorded as MONETARY debt (unit price x count). */
export function SeedlingDebtModal({
  customerId,
  orders,
  open,
  onClose,
  onSaved,
}: BaseModalProps & { orders: SeedlingOrder[] }) {
  const [plantName, setPlantName] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [count, setCount] = useState('');
  const [orderId, setOrderId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (body: unknown) =>
      api(`/customers/${customerId}/seedling-debts`, { method: 'POST', body }),
    onSuccess: () => {
      onClose();
      onSaved();
    },
    onError: () => setError('Kaydetme başarısız oldu.'),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const unitPriceKurus = parseMoneyInput(unitPrice);
    if (unitPriceKurus === null) {
      setError(`Geçersiz adet ücreti. ${MONEY_HINT}`);
      return;
    }
    const seedlingCount = Number(count);
    if (!Number.isInteger(seedlingCount) || seedlingCount <= 0) {
      setError('Geçerli bir fide adedi giriniz.');
      return;
    }
    mutation.mutate({
      plantName,
      unitPriceKurus,
      seedlingCount,
      relatedOrderId: orderId || null,
    });
  };

  return (
    <Modal title="Fidan borcu ekle" open={open} onClose={onClose}>
      <p className="mb-3 text-xs text-slate-500">
        Fidan borcu parasal borç olarak kaydedilir: adet ücreti × fide sayısı.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <Field label="İlgili sipariş (opsiyonel)">
          <SelectInput value={orderId} onChange={(e) => setOrderId(e.target.value)}>
            <option value="">Siparişsiz</option>
            {orders.map((order) => (
              <option key={order.id} value={order.id}>{order.plantName}</option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Bitki adı *">
          <TextInput value={plantName} onChange={(e) => setPlantName(e.target.value)} required />
        </Field>
        <Field label="Fide adet ücreti (TL) *">
          <TextInput value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} required />
        </Field>
        <Field label="Alınan fide sayısı *">
          <TextInput value={count} onChange={(e) => setCount(e.target.value)} required />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button type="submit" disabled={mutation.isPending}>Kaydet</Button>
        </div>
        <ErrorText message={error} />
      </form>
    </Modal>
  );
}

/** Generic confirmation modal that collects a reason (void/delete actions). */
export function ReasonModal({
  title,
  description,
  requireReason,
  open,
  onClose,
  onConfirm,
  busy,
}: {
  title: string;
  description?: string;
  requireReason: boolean;
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  busy?: boolean;
}) {
  const [reason, setReason] = useState('');

  return (
    <Modal title={title} open={open} onClose={onClose}>
      {description && <p className="mb-3 text-sm text-slate-600">{description}</p>}
      <Field label={requireReason ? 'Sebep *' : 'Sebep (opsiyonel)'}>
        <TextInput value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
        <Button
          variant="danger"
          disabled={busy || (requireReason && reason.trim().length === 0)}
          onClick={() => onConfirm(reason.trim())}
        >
          Onayla
        </Button>
      </div>
    </Modal>
  );
}
