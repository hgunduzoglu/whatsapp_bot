export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface LoginResponse {
  accessToken: string;
  user: AdminUser;
}

export interface Customer {
  id: string;
  baseName: string;
  identifier: string | null;
  phone: string | null;
  note: string | null;
  status: string;
  createdAt: string;
  balanceKurus: number;
}

export function customerLabel(customer: Pick<Customer, 'baseName' | 'identifier'>): string {
  return customer.identifier ? `${customer.baseName} - ${customer.identifier}` : customer.baseName;
}

export interface LedgerEntry {
  id: string;
  type: 'DEBT' | 'PAYMENT' | 'ADJUSTMENT_INCREASE' | 'ADJUSTMENT_DECREASE';
  source: string;
  amountKurus: number;
  description: string | null;
  businessDate: string;
  createdAt: string;
}

export interface PurchaseItem {
  id: string;
  productName: string;
  category: string;
  quantity: string;
  remainingQuantity: string;
  unit: string;
}

export interface Purchase {
  id: string;
  businessDate: string;
  note: string | null;
  estimatedAmountKurus: number | null;
  status: string;
  items: PurchaseItem[];
}

export interface PaymentItem {
  id: string;
  paidQuantity: string;
  amountKurus: number | null;
  productPurchaseItem: PurchaseItem;
}

export interface ProductPayment {
  id: string;
  businessDate: string;
  totalAmountKurus: number;
  note: string | null;
  items: PaymentItem[];
}

export interface SeedlingOrder {
  id: string;
  plantName: string;
  seedGiven: boolean;
  seedPlantName: string | null;
  seedAmount: string | null;
  seedUnit: string | null;
  requestedPickupDate: string;
  status: string;
  note: string | null;
  customer?: { baseName: string; identifier: string | null };
}

export interface PromissoryNote {
  id: string;
  payeeName: string;
  amountKurus: number;
  dueDate: string;
  status: string;
  note: string | null;
  paidAt: string | null;
}

export interface AuditLog {
  id: string;
  actorPhone: string | null;
  action: string;
  entityType: string;
  entityId: string;
  reason: string | null;
  createdAt: string;
}

export interface Backup {
  id: string;
  fileName: string;
  trigger: string;
  sizeBytes: number | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

export interface DashboardData {
  totalReceivablesKurus: number;
  receivableCustomerCount: number;
  openProductDebtCustomerCount: number;
  upcomingSeedlingCount: number;
  upcomingNoteCount: number;
  todayDebtsKurus: number;
  todayPaymentsKurus: number;
}

export interface ReceivableLine {
  customer: Customer;
  balanceKurus: number;
}

export interface OpenProductDebtItem extends PurchaseItem {
  productPurchase: {
    id: string;
    businessDate: string;
    customer: { baseName: string; identifier: string | null };
  };
}

export interface ActivitySummary {
  from: string;
  to: string;
  monetaryEntries: (LedgerEntry & { customer: { baseName: string; identifier: string | null } })[];
  productPurchases: (Purchase & { customer: { baseName: string; identifier: string | null } })[];
  productPayments: (ProductPayment & { customer: { baseName: string; identifier: string | null } })[];
  seedlingOrders: SeedlingOrder[];
  promissoryNotes: PromissoryNote[];
}

export interface CustomerStatement {
  customer: Customer;
  balanceKurus: number;
  monetaryEntries: LedgerEntry[];
  productPurchases: Purchase[];
  productPayments: ProductPayment[];
  seedlingOrders: SeedlingOrder[];
  openItems: (PurchaseItem & { productPurchase: { businessDate: string } })[];
}
