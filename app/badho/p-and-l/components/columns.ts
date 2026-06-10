// Shared column configuration for the P&L "Orders Pushed" table + detail modal.
// Both the main table and the modal render through buildColumns()/formatValue()/
// cellToneClass()/rowToneClass() so they stay perfectly in sync.

export type Tone = 'green' | 'red' | null;

export interface ColumnDef {
  key: string;
  label: string;
  percent?: boolean;
  // Optional per-cell tone based on the numeric value.
  cellTone?: (n: number) => Tone;
}

// Explicit, user-defined ordering. Anything not listed here is appended
// afterwards ("rest column") in the order the API returns it.
const ORDERED: ColumnDef[] = [
  { key: 'poNumber', label: 'poNumber' },
  { key: 'MarkedpendingTime', label: 'markedPendingTime' },
  { key: 'GrossAmount', label: 'Gross Amount' },
  { key: 'ItemTotal', label: 'Item Total' },
  { key: 'ItemDiscount', label: 'Item Discount' },
  { key: 'CoupanApplied', label: 'Coupon Applied' },
  { key: 'discountBySeller', label: 'Discount By Seller' },
  { key: 'discountByBadho', label: 'Discount by badho on payment' },
  { key: 'appliedWalletAmount', label: 'Applied Wallet Amount' },
  { key: 'appliedVolumeDiscountAmount', label: 'Applied Volume Discount' },
  { key: 'deliveryCHargeWithWDC', label: 'DelhiveryChargeWithWDC' },
  { key: 'OperationalCost', label: 'Operational Cost' },
  { key: 'expectedCommission', label: 'Expected Commission' },
  { key: 'P&LAmount', label: 'P&L Amount' },
  { key: 'p&l%', label: 'P&L %', percent: true },
  { key: 'ItemDiscount%', label: 'Item Discount %', percent: true, cellTone: (n) => (n < 10 ? 'green' : 'red') },
  { key: 'CouponApplied%', label: 'Coupon Applied %', percent: true, cellTone: (n) => (n < 10 ? 'green' : 'red') },
  { key: 'PaymentDiscount%', label: 'Payment Discount %', percent: true, cellTone: (n) => (n <= 5 ? 'green' : 'red') },
  { key: 'ExpectedDeliveryLoss%', label: 'Expected Delivery Loss %', percent: true, cellTone: (n) => (n <= 20 ? 'green' : 'red') },
  { key: 'OperationalCost%', label: 'Operational Cost %', percent: true },
];

// Pretty labels for the trailing "rest" columns.
const REST_LABELS: Record<string, string> = {
  purchaseOrderId: 'Purchase Order Id',
  orderStatus: 'Order Status',
  deliveryCharge: 'Delivery Charge',
  deliverystatus: 'Delivery Status',
  AWBNumber: 'AWB Number',
  CourierName: 'Courier Name',
  paymentoption: 'Payment Option',
  sellerphone: 'Seller Phone',
  sellerbusinessname: 'Seller Business Name',
  UpiDiscountBySeller: 'UPI Discount By Seller',
  SellerPaysDelivery: 'Seller Pays Delivery',
  badhoCharge_Percent: 'Badho Charge %',
  refundAmount: 'Refund Amount',
  amountTobePaidSeller: 'Amount To Be Paid Seller',
  SRewardCredited: 'Reward Credited',
  SPayoutRefundCredited: 'Payout Refund Credited',
  SCommissionDeducted: 'Commission Deducted',
  SDeliveryChargeDeducted: 'Delivery Charge Deducted',
  poDeliveryStatus: 'PO Delivery Status',
  totalDiscount: 'Total Discount',
};

// Build the final ordered column list for whatever keys the API returned.
export function buildColumns(allKeys: string[]): ColumnDef[] {
  const used = new Set(ORDERED.map((c) => c.key));
  const present = new Set(allKeys);
  const head = ORDERED.filter((c) => present.has(c.key));
  const rest = allKeys
    .filter((k) => !used.has(k))
    .map<ColumnDef>((k) => ({
      key: k,
      label: REST_LABELS[k] || k,
      // badhoCharge_Percent is a stored % too.
      percent: k === 'badhoCharge_Percent',
    }));
  return [...head, ...rest];
}

function isNumericLike(v: unknown): boolean {
  if (typeof v === 'number') return true;
  if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return true;
  return false;
}

export function formatValue(col: ColumnDef, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (col.key === 'MarkedpendingTime') return String(v).slice(0, 10);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (isNumericLike(v)) {
    const n = Number(v);
    const num = Number.isInteger(n)
      ? n.toLocaleString('en-IN')
      : n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    return col.percent ? num + '%' : num;
  }
  return String(v);
}

export function isNumericCol(v: unknown): boolean {
  return isNumericLike(v);
}

// Cell-level tone (green/red text) for the conditional % columns.
export function cellToneClass(col: ColumnDef, v: unknown): string {
  if (!col.cellTone || !isNumericLike(v)) return '';
  const t = col.cellTone(Number(v));
  if (t === 'green') return 'text-emerald-300 font-semibold';
  if (t === 'red') return 'text-rose-300 font-semibold';
  return '';
}

// Row-level tint driven by P&L %: >0 → light green, <0 → light red.
export function rowToneClass(row: Record<string, unknown>): string {
  const v = row['p&l%'];
  if (!isNumericLike(v)) return 'even:bg-white/[0.015] hover:bg-white/[0.05]';
  const n = Number(v);
  if (n > 0) return 'bg-emerald-500/[0.08] hover:bg-emerald-500/[0.16]';
  if (n < 0) return 'bg-rose-500/[0.08] hover:bg-rose-500/[0.16]';
  return 'even:bg-white/[0.015] hover:bg-white/[0.05]';
}
