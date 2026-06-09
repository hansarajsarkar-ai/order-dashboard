'use client';

import { useEffect, useRef, useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ResponsiveContainer,
  RadialBarChart, RadialBar, PolarAngleAxis,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area, LabelList, ReferenceLine,
  ComposedChart, Bar, BarChart,
  PieChart, Pie, Cell,
} from 'recharts';
import IndiaStateMap, { type StateRow } from './components/IndiaStateMap';
import MultiSelectFilter from './components/MultiSelectFilter';
import MonthMultiSelect from './components/MonthMultiSelect';
import IndiaDistrictMap, { type DistrictRow } from './components/IndiaDistrictMap';
import RejectionReasonPivotTable from './components/RejectionReasonPivotTable';
import CountdownCalendar from './components/CountdownCalendar';
import { type Scan } from './components/ScanTimeline';
import GroupByModal from './components/GroupByModal';
import GroupByMenu, { type GroupDimension } from './components/GroupByMenu';

interface OrderListRow {
  poNumber: string;
  status: string;
  orderStatus?: string;
  deliveryStatus?: string | null;
  amount: number;
  poAmount?: number | null;
  itemTotal?: number | null;
  grossAmount?: number | null;
  orderMarginDiscount?: number | null;
  paidAmount?: number | null;
  CoupanAmount?: number | null;
  discountBySeller?: number;
  PaymentOptionDiscountByBadho?: number;
  appliedWalletAmount?: number | null;
  PaymentOption?: string | null;
  paymentDate?: string | null;
  paymentEvent?: string | null;
  awbNumber?: string | null;
  courierName?: string | null;
  RefundIntiatedTime?: string | null;
  RefundCompletedTime?: string | null;
  RefundAmount?: number | null;
  codAmountToBeCollected?: number | null;
  pushedStatus?: string;
  MarkedpendingTime?: string | null;
  buyerPhone: string | null;
  buyerBusinessName: string | null;
  sellerPhone: string | null;
  sellerBusinessName: string | null;
  buyerAddress: string;
  buyerFullAddress?: string;
  buyerAddressLine1?: string | null;
  buyerLandmark?: string | null;
  buyerPincode?: string | null;
  buyerCity?: string | null;
  buyerDistrict?: string | null;
  buyerState: string | null;
  sellerAddress?: string;
  rejectReason?: string | null;
  rejectedBy?: string | null;
  reasonAddedByBadhoTeam?: string | null;
  markedPendingTime: string | null;
  createdAt: string;
  statusMarkedTime?: string | null;
  statusDurationSec?: number | null;
}

interface RevenueGoal {
  year: number;
  month: number;
  goal: number;
  achieved: number;
  orders: number;
  remaining: number;
  achievePct: number;
  // Prior month over the same elapsed span (month-to-date vs month-to-date).
  prior?: {
    year: number;
    month: number;
    achieved: number;
    orders: number;
    asOfDay: number | null;
    sameSpan: boolean;
  };
  deltaPct?: number | null;
  ordersDeltaPct?: number | null;
}

interface MonthCell {
  count: number;
  amount: number;
}

interface MonthlyStatusRow {
  status: string;
  months: Record<string, MonthCell>;
  total: MonthCell;
}

interface MonthlyStatusData {
  data: MonthlyStatusRow[];
  totals: {
    byMonth: Record<string, MonthCell>;
    byStatus: Record<string, MonthCell>;
    grand: MonthCell;
  };
  year: number;
}

interface DailyStatusRow {
  status: string;
  days: Record<string, MonthCell>;
  total: MonthCell;
}

interface DailyStatusData {
  data: DailyStatusRow[];
  totals: {
    byDay: Record<string, MonthCell>;
    byStatus: Record<string, MonthCell>;
    grand: MonthCell;
  };
  year: number;
  month: number;
  daysInMonth: number;
}

interface WeeklyStatusRow {
  status: string;
  weeks: Record<string, MonthCell>;
  total: MonthCell;
}

interface WeeklyStatusData {
  data: WeeklyStatusRow[];
  weeks: number[];
  weekStartLabels: Record<string, string>;
  totals: {
    byWeek: Record<string, MonthCell>;
    byStatus: Record<string, MonthCell>;
    grand: MonthCell;
  };
  year: number;
}

interface DeliverySubRow {
  deliveryStatus: string | null;
  months: Record<string, MonthCell>;
  total: MonthCell;
}

interface StatusDeliveryRow {
  status: string;
  months: Record<string, MonthCell>;
  total: MonthCell;
  deliveryStatuses: DeliverySubRow[];
}

interface MonthlyStatusDeliveryData {
  data: StatusDeliveryRow[];
  totals: {
    byMonth: Record<string, MonthCell>;
    grand: MonthCell;
  };
  year: number;
  query?: string;
  queryParams?: (string | number)[];
}

interface DeliveryWeekSubRow {
  deliveryStatus: string | null;
  weeks: Record<string, MonthCell>;
  total: MonthCell;
}
interface StatusDeliveryWeekRow {
  status: string;
  weeks: Record<string, MonthCell>;
  total: MonthCell;
  deliveryStatuses: DeliveryWeekSubRow[];
}
interface WeeklyStatusDeliveryData {
  data: StatusDeliveryWeekRow[];
  weeks: number[];
  weekStartLabels: Record<string, string>;
  totals: { byWeek: Record<string, MonthCell>; grand: MonthCell };
  year: number;
  query?: string;
  queryParams?: (string | number)[];
}

interface DeliveryDaySubRow {
  deliveryStatus: string | null;
  days: Record<string, MonthCell>;
  total: MonthCell;
}
interface StatusDeliveryDayRow {
  status: string;
  days: Record<string, MonthCell>;
  total: MonthCell;
  deliveryStatuses: DeliveryDaySubRow[];
}
interface DailyStatusDeliveryData {
  data: StatusDeliveryDayRow[];
  totals: { byDay: Record<string, MonthCell>; grand: MonthCell };
  year: number;
  month: number;
  daysInMonth: number;
  query?: string;
  queryParams?: (string | number)[];
}

interface SellerRow {
  sellerId: string;
  sellerPhone: string | null;
  sellerBusinessName: string | null;
  statuses: Record<string, MonthCell>;
  total: MonthCell;
}

interface SellerWiseData {
  data: SellerRow[];
  statuses: string[];
  totals: {
    byStatus: Record<string, MonthCell>;
    grand: MonthCell;
  };
  year: number;
}

interface SlabCell {
  s0_500: number;
  s500_1000: number;
  s1000_2000: number;
  s2000_plus: number;
  total: number;
}

interface SellerSlabRow {
  sellerId: string;
  sellerPhone: string | null;
  sellerBusinessName: string | null;
  months: Record<string, SlabCell>;
  total: SlabCell;
}

interface SellerSlabData {
  data: SellerSlabRow[];
  months: number[];
  totals: { byMonth: Record<string, SlabCell>; grand: SlabCell };
  year: number;
}

interface SellerOrderRow {
  poNumber: string;
  status: string;
  amount: number;
  buyerPhone: string | null;
  buyerBusinessName: string | null;
  buyerFullAddress?: string;
  buyerAddressLine1?: string | null;
  buyerLandmark?: string | null;
  buyerPincode?: string | null;
  buyerCity?: string | null;
  buyerDistrict?: string | null;
  buyerState?: string | null;
  markedPendingTime: string | null;
  createdAt: string;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Fixed display order for status breakdown rows (lifecycle, not volume). Unknown statuses fall to the end.
const STATUS_DISPLAY_ORDER = ['PENDING', 'CANCELLED', 'REJECTED', 'INPROGRESS', 'DISPATCHED', 'COMPLETED'];
const byStatusOrder = <T extends { status: string }>(rows: T[]): T[] => {
  const idx = (s: string) => {
    const i = STATUS_DISPLAY_ORDER.indexOf(s);
    return i === -1 ? STATUS_DISPLAY_ORDER.length : i;
  };
  return [...rows].sort((a, b) => idx(a.status) - idx(b.status));
};

const PAGE_SIZE = 50;

type CsvCell = string | number | null | undefined;
function downloadCSV(filename: string, headers: string[], rows: CsvCell[][]) {
  if (typeof window === 'undefined') return;
  const esc = (v: CsvCell) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers, ...rows].map((row) => row.map(esc).join(','));
  // Prepend BOM so Excel opens UTF-8 (incl. ₹) correctly.
  const csv = '﻿' + lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const DOWNLOAD_BTN_CLASS =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap bg-white/10 hover:bg-fuchsia-500/30 border border-white/10 hover:border-fuchsia-400/50 text-purple-200 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed';

const DOWNLOAD_BTN_LIGHT_CLASS =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-fuchsia-100 border border-slate-200 hover:border-fuchsia-300 text-slate-700 hover:text-fuchsia-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed';

// One SQL statement (with its bind params) captured by the backend and surfaced
// through the per-section "View Query" buttons.
type SqlQuery = { sql: string; params?: unknown[] };

const QUERY_BTN_CLASS =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap bg-white/10 hover:bg-fuchsia-500/30 border border-white/10 hover:border-fuchsia-400/50 text-purple-200 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed';

// Shared modal that renders the SQL behind a section. Driven by a single piece of
// page state so every section reuses one overlay instead of inlining its own panel.
function QueryModal({ title, queries, onClose }: { title: string; queries: SqlQuery[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-4xl max-h-[85vh] overflow-y-auto bg-slate-950 border border-white/15 rounded-2xl shadow-[0_0_60px_rgba(168,85,247,0.3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 sticky top-0 bg-slate-950 z-10">
          <div>
            <p className="text-purple-300 text-[11px] uppercase tracking-wider font-semibold">SQL Query</p>
            <h3 className="text-white font-bold text-lg">{title}</h3>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none px-2">×</button>
        </div>
        <div className="p-6 space-y-5">
          {queries.length === 0 ? (
            <p className="text-purple-300 text-sm">Query unavailable — load this section first, then reopen.</p>
          ) : queries.map((q, i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-purple-300 text-xs uppercase tracking-wider font-semibold">
                  {queries.length > 1 ? `Query #${i + 1}` : 'Query'}
                </p>
                <button
                  onClick={() => navigator.clipboard?.writeText(q.sql)}
                  className="px-3 py-1 rounded-lg text-[11px] font-semibold text-purple-200 border border-white/10 bg-white/5 hover:bg-white/10 transition-all"
                >Copy</button>
              </div>
              <pre className="text-[11px] leading-relaxed text-emerald-200/90 font-mono whitespace-pre-wrap overflow-x-auto bg-black/40 rounded-xl p-4 border border-white/10">{q.sql}</pre>
              {q.params && q.params.length > 0 && (
                <p className="text-purple-300/70 text-[11px] mt-2 font-mono break-all">params: [{q.params.map((p) => JSON.stringify(p)).join(', ')}]</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const formatAmount = (n: number): string => {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
};

// Counts a number up from 0 to `target` with an easeOutCubic curve whenever the
// target changes (e.g. on first load or when a reload refetches goal data).
// Returns the in-flight value each animation frame so callers can format/render it.
function useCountUp(target: number, duration = 1200, active = true): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!active) return;
    // Snap straight to the target when motion can't/shouldn't run — a hidden tab
    // pauses requestAnimationFrame (numbers would freeze at 0), and reduced-motion
    // users opt out of the count-up. Either way the final value must still show.
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (document.hidden || prefersReduced) { setValue(target); return; }
    let startTs: number | null = null;
    const step = (ts: number) => {
      if (startTs === null) startTs = ts;
      const t = Math.min((ts - startTs) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    // If the tab gets hidden mid-animation, jump to the final value so it never
    // stalls partway; on becoming visible again we just keep the final value.
    const onHide = () => { if (document.hidden) { if (rafRef.current) cancelAnimationFrame(rafRef.current); setValue(target); } };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [target, duration, active]);
  return value;
}

// Buckets the "days stuck at destination hub" value (daysSinceReachedAtDestination)
// for the Hub Tracking "Stuck time" filter. Returns null when unknown.
const hubStuckBucketOf = (d: number | null | undefined): string | null => {
  if (d == null) return null;
  if (d < 1) return '<1';
  if (d < 2) return '1-2';
  if (d < 3) return '2-3';
  if (d < 4) return '3-4';
  if (d < 5) return '4-5';
  return '5+';
};

// Compact stat shown in the filtered-summary bars above order tables.
const SummaryStat = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline gap-1.5">
    <span className="text-[11px] uppercase tracking-wider text-purple-300/80">{label}</span>
    <span className="font-bold text-white tabular-nums">{value}</span>
  </div>
);

const formatDateShort = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Compact human-readable duration: 1.5h / 3d / 12d 4h
const formatDuration = (seconds: number | null | undefined): string => {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = Math.floor(hours / 24);
  const remHours = Math.round(hours - days * 24);
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
};

const STATUS_COLORS: Record<string, string> = {
  'PENDING': '#f59e0b',
  'CONFIRMED': '#10b981',
  'FAILED': '#ef4444',
  'DELIVERED': '#3b82f6',
  'CANCELLED': '#6b7280',
  'PROCESSING': '#8b5cf6',
  'COMPLETED': '#06b6d4',
  'REJECTED': '#dc2626',
};

const STATUS_ICONS: Record<string, string> = {
  'PENDING': '⏳',
  'CONFIRMED': '✓',
  'FAILED': '✕',
  'DELIVERED': '📦',
  'CANCELLED': '✗',
  'PROCESSING': '⚙️',
  'COMPLETED': '✅',
  'REJECTED': '❌',
};

export default function OrderStatusDashboard() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.toLocaleDateString('en-US', { month: 'long' });
  const currentMonthYear = `${currentMonth} ${currentYear}`;
  const yearStart = `${currentYear}-01-01`;
  const yearEnd = `${currentYear}-12-31`;

  const [monthlyData, setMonthlyData] = useState<MonthlyStatusData | null>(null);
  // Monthly Breakdown view toggle: 'month' (default), 'week', or 'day'
  const [breakdownGranularity, setBreakdownGranularity] = useState<'month' | 'week' | 'day'>('month');
  const [breakdownMonth, setBreakdownMonth] = useState<number>(new Date().getMonth() + 1);
  const [dailyData, setDailyData] = useState<DailyStatusData | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [weeklyData, setWeeklyData] = useState<WeeklyStatusData | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [monthlyLoading, setMonthlyLoading] = useState(true);
  const [pivotData, setPivotData] = useState<MonthlyStatusDeliveryData | null>(null);
  const [pivotLoading, setPivotLoading] = useState(true);
  const [expandedStatuses, setExpandedStatuses] = useState<Set<string>>(new Set());
  // Granularity for the Status × Delivery Status pivot
  const [pivotGranularity, setPivotGranularity] = useState<'month' | 'week' | 'day'>('month');
  // Toggle to reveal the raw SQL query behind the Monthly Breakdown by Order Status pivot
  const [showPivotQuery, setShowPivotQuery] = useState(false);
  const [pivotDayMonth, setPivotDayMonth] = useState<number>(new Date().getMonth() + 1);
  // "Filter to selected months" for the Monthly Breakdown by Order Status pivot
  // (empty = all months). Applies to Month & Week views; Day view keeps its
  // single-month selector.
  const [pivotMonths, setPivotMonths] = useState<number[]>([]);
  // Month-column set for the Monthly Breakdown month view: the selected months
  // (sorted) or all 12 when none are picked.
  const pivotMonthCols = pivotMonths.length ? [...pivotMonths].sort((a, b) => a - b) : MONTH_NAMES.map((_, i) => i + 1);
  const [pivotWeekData, setPivotWeekData] = useState<WeeklyStatusDeliveryData | null>(null);
  const [pivotWeekLoading, setPivotWeekLoading] = useState(false);
  const [pivotDayData, setPivotDayData] = useState<DailyStatusDeliveryData | null>(null);
  const [pivotDayLoading, setPivotDayLoading] = useState(false);
  // Monthly Geo Coverage pivot — rows = pincode/city/district/state, columns = months/weeks/days
  interface GeoCoverageCell { covered: number; count: number; amount: number }
  type GeoKey = 'pincode' | 'city' | 'district' | 'state';
  interface GeoCoverageData {
    granularity: 'month' | 'week' | 'day';
    buckets: number[];
    weekStartLabels: Record<number, string>;
    daysInMonth: number;
    month: number;
    data: { geo: GeoKey; months: Record<number, GeoCoverageCell>; total: GeoCoverageCell }[];
    totals: { byMonth: Record<number, { count: number; amount: number }>; grand: { count: number; amount: number } };
    year: number;
  }
  const GEO_STATUS_OPTIONS = ['REJECTED', 'COMPLETED', 'DISPATCHED', 'CANCELLED', 'INPROGRESS', 'PENDING'] as const;
  const [geoCoverageData, setGeoCoverageData] = useState<GeoCoverageData | null>(null);
  const [geoCoverageLoading, setGeoCoverageLoading] = useState(true);
  const [geoCovGranularity, setGeoCovGranularity] = useState<'month' | 'week' | 'day'>('month');
  const [geoCovMonths, setGeoCovMonths] = useState<number[]>([]);
  const [geoCovDayMonth, setGeoCovDayMonth] = useState<number>(new Date().getMonth() + 1);
  const [geoCovStatuses, setGeoCovStatuses] = useState<string[]>([]);
  const [geoCovStatusOpen, setGeoCovStatusOpen] = useState(false);
  // Geo drill-down modal (opens when clicking any number in the Geo Coverage table).
  // The breakdown level mirrors the clicked row: pincode/city/district/state.
  type GeoLevel = 'pincode' | 'city' | 'district' | 'state';
  interface GeoPinRow { pincode: string | null; city: string | null; district: string | null; state: string | null; count: number; buyers: number; amount: number }
  const [geoPinOpen, setGeoPinOpen] = useState(false);
  const [geoPinGeo, setGeoPinGeo] = useState<GeoLevel>('pincode');
  const [geoPinLabel, setGeoPinLabel] = useState('');
  const [geoPinRows, setGeoPinRows] = useState<GeoPinRow[] | null>(null);
  const [geoPinGrand, setGeoPinGrand] = useState<{ count: number; buyers: number; amount: number }>({ count: 0, buyers: 0, amount: 0 });
  const [geoPinLoading, setGeoPinLoading] = useState(false);
  const [geoPinError, setGeoPinError] = useState<string | null>(null);
  const [geoPinSearch, setGeoPinSearch] = useState('');
  const openGeoPinModal = async (geo: GeoLevel, bucket: number | 'total', label: string) => {
    setGeoPinOpen(true);
    setGeoPinGeo(geo);
    setGeoPinLabel(label);
    setGeoPinRows(null);
    setGeoPinError(null);
    setGeoPinSearch('');
    setGeoPinLoading(true);
    try {
      const qs = new URLSearchParams({
        year: String(currentYear),
        granularity: geoCovGranularity,
        month: String(geoCovDayMonth),
        bucket: String(bucket),
        geo,
      });
      if (geoCovStatuses.length) qs.set('statuses', geoCovStatuses.join(','));
      const res = await fetch(`/api/order-geo-pincode-breakdown?${qs.toString()}`);
      if (!res.ok) throw new Error('Failed to load geo breakdown');
      const json = await res.json();
      setGeoPinRows(json.data);
      captureQuery('geoPin', json);
      setGeoPinGrand(json.grand);
    } catch (e) {
      setGeoPinError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setGeoPinLoading(false);
    }
  };
  // Status × Delivery Status drilldown modal
  const [pivotDrillOpen, setPivotDrillOpen] = useState(false);
  const [pivotDrillStatus, setPivotDrillStatus] = useState<string>('');
  const [pivotDrillDelivery, setPivotDrillDelivery] = useState<string | null | undefined>(undefined); // undefined = no filter, null = NULL filter, string = exact
  const [pivotDrillMonth, setPivotDrillMonth] = useState<number | null>(null);
  const [pivotDrillDay, setPivotDrillDay] = useState<number | null>(null); // when set, drill is scoped to a single day within pivotDrillMonth
  const [pivotDrillWeek, setPivotDrillWeek] = useState<number | null>(null); // when set, drill is scoped to a single ISO week (Postgres EXTRACT(WEEK))
  const [pivotDrillWeekLabel, setPivotDrillWeekLabel] = useState<string | null>(null); // human label for the week (e.g. "05 May")
  const [pivotDrillZone, setPivotDrillZone] = useState<{ zone: string; label: string; seller?: string; zoneStatus?: string } | null>(null); // when set, drill is scoped to a Delhivery zone (+ optional seller / delivery status) + date window
  const [pivotDrillRows, setPivotDrillRows] = useState<OrderListRow[] | null>(null);
  const [pivotDrillLoading, setPivotDrillLoading] = useState(false);
  const [pivotDrillError, setPivotDrillError] = useState<string | null>(null);
  const [pivotDrillSearch, setPivotDrillSearch] = useState('');
  const [pivotDrillPushedFilter, setPivotDrillPushedFilter] = useState<'all' | 'Pushed' | 'Not Pushed'>('all');
  const [pivotDrillRejectReasonFilter, setPivotDrillRejectReasonFilter] = useState<Set<string>>(new Set());
  const [pivotDrillPaymentFilter, setPivotDrillPaymentFilter] = useState<Set<string>>(new Set());
  const [pivotDrillCourierFilter, setPivotDrillCourierFilter] = useState<Set<string>>(new Set());
  const [pivotDrillDeliveryFilter, setPivotDrillDeliveryFilter] = useState<Set<string>>(new Set());
  const [pivotDrillSort, setPivotDrillSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  // State-wise pivot drill context (overrides the drill modal title when set).
  const [pivotDrillStateName, setPivotDrillStateName] = useState<string | null>(null);
  const [pivotDrillBucketLabel, setPivotDrillBucketLabel] = useState<string | null>(null);
  const [pivotDrillMonthLabel, setPivotDrillMonthLabel] = useState<string | null>(null);
  // Last 3 Scan Locations — batch-loaded for all drill rows, rendered as 3 inline columns.
  const [scansByPo, setScansByPo] = useState<Record<string, Scan[]>>({});
  const [scansLoading, setScansLoading] = useState(false);
  // Group By — selected dimensions (multi-select). Non-empty opens the aggregated GroupByModal
  // over the current (filtered) drill rows, grouped by the composite of the chosen angles.
  const [groupByDims, setGroupByDims] = useState<GroupDimension[]>([]);
  const [goalData, setGoalData] = useState<RevenueGoal | null>(null);
  const [goalLoading, setGoalLoading] = useState(true);
  // Count-up animations for the GMV Goal tiles + progress bar — re-run on each reload/refetch.
  const goalAnimActive = !goalLoading && !!goalData;
  const animAchievePct = useCountUp(goalData?.achievePct ?? 0, 1200, goalAnimActive);
  const animAchieved = useCountUp(goalData?.achieved ?? 0, 1200, goalAnimActive);
  const animGoal = useCountUp(goalData?.goal ?? 0, 1200, goalAnimActive);
  const animRemaining = useCountUp(goalData?.remaining ?? 0, 1200, goalAnimActive);
  const animAbove = useCountUp(goalData ? Math.max(goalData.achieved - goalData.goal, 0) : 0, 1200, goalAnimActive);
  const [sellerData, setSellerData] = useState<SellerWiseData | null>(null);
  const [sellerLoading, setSellerLoading] = useState(true);
  const [sellerSearch, setSellerSearch] = useState('');
  const [slabData, setSlabData] = useState<SellerSlabData | null>(null);
  const [slabLoading, setSlabLoading] = useState(true);
  const [slabSearch, setSlabSearch] = useState('');
  const [sellerRange, setSellerRange] = useState<'7d' | '14d' | '15d' | 'custom' | 'all'>('all');
  const [sellerCustomFrom, setSellerCustomFrom] = useState('');
  const [sellerCustomTo, setSellerCustomTo] = useState('');
  const [sellerMonths, setSellerMonths] = useState<number[]>([]);
  // Geography (India map) state
  const [stateData, setStateData] = useState<StateRow[] | null>(null);
  const [stateLoading, setStateLoading] = useState(false);
  const [stateMetric, setStateMetric] = useState<'count' | 'amount'>('count');
  const [stateRange, setStateRange] = useState<'7d' | '14d' | '15d' | 'custom' | 'all'>('all');
  const [stateCustomFrom, setStateCustomFrom] = useState('');
  const [stateCustomTo, setStateCustomTo] = useState('');
  const [stateMonths, setStateMonths] = useState<number[]>([]);
  const [geoMode, setGeoMode] = useState<'state' | 'district'>('state');
  const [districtData, setDistrictData] = useState<DistrictRow[] | null>(null);
  const [districtLoading, setDistrictLoading] = useState(false);
  // selected DB state name for the district view (null = show all districts)
  const [districtSelectedState, setDistrictSelectedState] = useState<string | null>(null);
  // Brand filter for the geography view — one row per brand prefix.
  // A brand may span multiple sellers (e.g. ChukDe GT + ChukDe NonGT).
  interface BrandEntry {
    brandName: string;
    sellerIds: string[];
    sellerBusinessNames: string[];
    brandLabels: string | null;
    lastOrderAt: string | null;
    daysSinceLastOrder: number | null;
    isActive: boolean;  // recency-based (last order ≤ 30 days) — used by Geography
    isLive: boolean;    // eligibility-based (seller_brand canonical query) — used by Live brand tab
    totalOrders: number;
    totalAmount: number;
    deliveredOrders: number;
    deliveredAmount: number;
    statesCovered: number;
    districtsCovered: number;
  }
  const [sellerBrandList, setSellerBrandList] = useState<BrandEntry[] | null>(null);
  const [sellerBrandSearch, setSellerBrandSearch] = useState('');
  const [selectedBrandNames, setSelectedBrandNames] = useState<string[]>([]);
  const [sellerDropdownOpen, setSellerDropdownOpen] = useState(false);
  // Brand × State breakdown table
  interface BrandStateRow { brandName: string; state: string | null; count: number; amount: number; districtsCovered: number; }
  const [brandStateData, setBrandStateData] = useState<BrandStateRow[] | null>(null);
  const [brandStateLoading, setBrandStateLoading] = useState(false);
  const [brandStateSearch, setBrandStateSearch] = useState('');
  const [brandStateSort, setBrandStateSort] = useState<'count' | 'amount' | 'brand' | 'state'>('count');

  // Geography sub-tabs: the map view vs. the per-state status funnel table
  const [geographySubTab, setGeographySubTab] = useState<'geography' | 'statewise'>('geography');
  interface StatusBucket { count: number; amount: number; }
  // State × Month × status pivot (State wise tab)
  interface StateMonthRow {
    state: string | null;
    ym: string;
    punched: StatusBucket;
    delivered: StatusBucket;
    rejected: StatusBucket;
    cancelled: StatusBucket;
    pending: StatusBucket;
    inprogress: StatusBucket;
    dispatched: StatusBucket;
    inflight: StatusBucket;
  }
  const [stateMonthData, setStateMonthData] = useState<StateMonthRow[] | null>(null);
  const [stateMonthMonths, setStateMonthMonths] = useState<string[]>([]);
  const [stateMonthLoading, setStateMonthLoading] = useState(false);
  const [stateMonthSearch, setStateMonthSearch] = useState('');

  // Flatten selected brand names → comma-separated sellerIds for the API
  const resolveSelectedSellerIds = (): string => {
    if (!sellerBrandList || selectedBrandNames.length === 0) return '';
    const set = new Set<string>();
    for (const b of sellerBrandList) {
      if (selectedBrandNames.includes(b.brandName)) {
        for (const sid of b.sellerIds) set.add(sid);
      }
    }
    return Array.from(set).join(',');
  };
  const [sellerDrillId, setSellerDrillId] = useState<string | null>(null);
  const [sellerDrillName, setSellerDrillName] = useState<string>('');
  const [sellerDrillPhone, setSellerDrillPhone] = useState<string>('');
  const [sellerDrillRows, setSellerDrillRows] = useState<SellerOrderRow[] | null>(null);
  const [sellerDrillLoading, setSellerDrillLoading] = useState(false);
  const [sellerDrillError, setSellerDrillError] = useState<string | null>(null);
  const [sellerDrillStartDate, setSellerDrillStartDate] = useState<string>('');
  const [sellerDrillEndDate, setSellerDrillEndDate] = useState<string>('');
  const [sellerDrillStatus, setSellerDrillStatus] = useState<string>('all');
  const [sellerDrillPo, setSellerDrillPo] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'trend' | 'rto' | 'seller' | 'geography' | 'zone' | 'margin' | 'alert'>('dashboard');

  // "View Query" infrastructure — every section's fetch records the SQL the backend
  // ran (response.__queries) keyed by a section id; a single shared modal renders it.
  const [sectionQueries, setSectionQueries] = useState<Record<string, SqlQuery[]>>({});
  const [queryModalState, setQueryModalState] = useState<{ title: string; queries: SqlQuery[] } | null>(null);
  const captureQuery = (key: string, json: unknown) => {
    const q = (json as { __queries?: SqlQuery[] } | null)?.__queries;
    if (Array.isArray(q) && q.length > 0) setSectionQueries((prev) => ({ ...prev, [key]: q }));
  };
  // Renders a "View Query" button for a section; disabled until that section's data loads.
  const queryBtn = (sectionKey: string, title: string) => {
    const queries = sectionQueries[sectionKey];
    const has = !!queries && queries.length > 0;
    return (
      <button
        type="button"
        disabled={!has}
        title={has ? 'Show the SQL behind this section' : 'Load this section first'}
        onClick={() => has && setQueryModalState({ title, queries })}
        className={QUERY_BTN_CLASS}
      >
        View Query
      </button>
    );
  };

  // Margin Overview tab — daily P&L for D2R brand sellers on third-party INTERCITY orders.
  interface MarginDayRow {
    date: string;
    totalOrders: number;
    totalPoAmount: number;
    totalMargin: number;
    totalOperationalCost: number;
    profitAndLossRs: number;
    status: string;
    pnlPercentOfGtv: number | null;
  }
  interface MarginResp {
    days: number | null;
    range?: { days?: number; startDate?: string; endDate?: string };
    data: MarginDayRow[];
    totals: {
      totalOrders: number;
      totalPoAmount: number;
      totalMargin: number;
      totalOperationalCost: number;
      profitAndLossRs: number;
      pnlPercentOfGtv: number | null;
      profitDays: number;
      lossDays: number;
    };
    timestamp: string;
    error?: string;
  }
  const [marginData, setMarginData] = useState<MarginResp | null>(null);
  const [marginLoading, setMarginLoading] = useState(false);
  const [marginError, setMarginError] = useState<string | null>(null);
  const [marginRange, setMarginRange] = useState<'last7' | 'last15' | 'last30' | 'custom'>('last15');
  const [marginCustomFrom, setMarginCustomFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10);
  });
  const [marginCustomTo, setMarginCustomTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [marginSubTab, setMarginSubTab] = useState<'trend' | 'details'>('trend');

  // Active Agent Count — distinct agents making outbound Warm_Lead / Cold Lead
  // calls per day (smartFlo.call_logs). Shares the P&L tab's date window.
  interface ActiveAgentResp {
    days: number | null;
    range?: { days?: number; startDate?: string; endDate?: string };
    data: { date: string; activeAgentCount: number }[];
    totals: { totalDistinctAgents: number; activeDays: number; peak: number; avgPerActiveDay: number };
    timestamp: string;
    error?: string;
  }
  const [activeAgentData, setActiveAgentData] = useState<ActiveAgentResp | null>(null);

  // Per-day drill-down modal (opened by clicking a day's Orders count in the Details table)
  interface MarginDayOrder {
    poId: string;
    poNumber: string | null;
    orderDate: string;
    sellerName: string | null;
    buyerName: string | null;
    poAmount: number;
    marginRs: number;
    badhoCommissionPct: number;
    deliveryStatus: string | null;
    couponRs: number;
    badhoPaymentDiscountRs: number;
    rewardRs: number;
    deliveryChargeRs: number;
    rtoChargeRs: number;
    operationalCostRs: number;
    profitAndLossRs: number;
    status: string;
    // Detailed order-list fields (appended columns mirroring the Monthly
    // Breakdown by Order Status drill-down).
    markedPendingTime: string | null;
    orderStatus: string | null;
    paidAmount: number | null;
    appliedWalletAmount: number | null;
    discountBySeller: number;
    paymentOption: string | null;
    awbNumber: string | null;
    courierName: string | null;
    paymentDate: string | null;
    paymentEvent: string | null;
    buyerPhone: string | null;
    sellerPhone: string | null;
    forwardDeliveryCostToSeller: string | null;
    dbDeliveryChargeRs: number | null;
    codAmountRs: number | null;
    buyerFullAddress: string | null;
    refundInitiatedTime: string | null;
    refundCompletedTime: string | null;
    refundAmount: number | null;
    rejectReason: string | null;
    rejectedBy: string | null;
    reasonAddedByBadhoTeam: string | null;
    statusMarkedTime: string | null;
    statusDurationSec: number | null;
  }
  const [marginDayModal, setMarginDayModal] = useState<string | null>(null); // selected order_date
  const [marginDayData, setMarginDayData] = useState<MarginDayOrder[] | null>(null);
  const [marginDayTotals, setMarginDayTotals] = useState<{ poAmount: number; marginRs: number; couponRs: number; badhoPaymentDiscountRs: number; rewardRs: number; deliveryChargeRs: number; rtoChargeRs: number; operationalCostRs: number; profitAndLossRs: number } | null>(null);
  const [marginDayLoading, setMarginDayLoading] = useState(false);
  const [marginDayError, setMarginDayError] = useState<string | null>(null);

  const openMarginDayModal = async (date: string) => {
    setMarginDayModal(date);
    setMarginDayData(null);
    setMarginDayTotals(null);
    setMarginDayLoading(true);
    setMarginDayError(null);
    const params = new URLSearchParams({ date });
    if (marginRange === 'custom') {
      if (marginCustomFrom) params.set('startDate', marginCustomFrom);
      if (marginCustomTo) params.set('endDate', marginCustomTo);
    } else {
      params.set('days', marginRange === 'last7' ? '7' : marginRange === 'last15' ? '15' : '30');
    }
    try {
      const res = await fetch(`/api/margin-overview/day?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setMarginDayData(json.data);
      captureQuery('marginDay', json);
      setMarginDayTotals(json.totals);
    } catch (err) {
      setMarginDayError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setMarginDayLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'margin') return;
    const params = new URLSearchParams();
    if (marginRange === 'custom') {
      if (!marginCustomFrom || !marginCustomTo) return; // wait until both dates picked
      params.set('startDate', marginCustomFrom);
      params.set('endDate', marginCustomTo);
    } else {
      params.set('days', marginRange === 'last7' ? '7' : marginRange === 'last15' ? '15' : '30');
    }
    let cancelled = false;
    (async () => {
      setMarginLoading(true);
      setMarginError(null);
      try {
        const res = await fetch(`/api/margin-overview?${params.toString()}`, { cache: 'no-store' });
        const json: MarginResp = await res.json();
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        if (!cancelled) setMarginData(json);
        if (!cancelled) captureQuery('margin', json);
      } catch (err) {
        if (!cancelled) {
          setMarginError(err instanceof Error ? err.message : 'Failed to load');
          setMarginData(null);
        }
      } finally {
        if (!cancelled) setMarginLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTab, marginRange, marginCustomFrom, marginCustomTo]);

  // Active Agent Count — loaded alongside the P&L tab, using the same window.
  useEffect(() => {
    if (activeTab !== 'margin') return;
    const params = new URLSearchParams();
    if (marginRange === 'custom') {
      if (!marginCustomFrom || !marginCustomTo) return;
      params.set('startDate', marginCustomFrom);
      params.set('endDate', marginCustomTo);
    } else {
      params.set('days', marginRange === 'last7' ? '7' : marginRange === 'last15' ? '15' : '30');
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/active-agents?${params.toString()}`, { cache: 'no-store' });
        const json: ActiveAgentResp = await res.json();
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        if (!cancelled) setActiveAgentData(json);
        if (!cancelled) captureQuery('activeAgents', json);
      } catch {
        if (!cancelled) setActiveAgentData(null);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTab, marginRange, marginCustomFrom, marginCustomTo]);

  // PO Items modal (opened from any "View Items" button across the dashboard)
  interface PoItemRow {
    id: string;
    brandSKUId: string;
    skuLabel: string | null;
    brandLabel: string | null;
    status: string | null;
    quantity: number | null;
    quantityUnit: string | null;
    unitPrice: number | null;
    discount: number | null;
    amount: number | null;
    total: number | null;
    isAccepted: boolean | null;
    isRejected: boolean | null;
    rejectedComment: string | null;
  }
  const [poItemsModal, setPoItemsModal] = useState<string | null>(null); // PO number
  const [poItemsData, setPoItemsData] = useState<PoItemRow[] | null>(null);
  const [poItemsTotals, setPoItemsTotals] = useState<{ items: number; qty: number; amount: number; total: number } | null>(null);
  const [poItemsLoading, setPoItemsLoading] = useState(false);
  const [poItemsError, setPoItemsError] = useState<string | null>(null);
  const [poItemsSearch, setPoItemsSearch] = useState('');
  const [poItemsSort, setPoItemsSort] = useState<'amount' | 'qty' | 'name'>('amount');
  const [poItemsStatusFilter, setPoItemsStatusFilter] = useState<string>('all');

  // Price Breakup panel — opens alongside the PO Items modal when "View Items" is clicked
  interface PriceBreakup {
    orderAmount: number | null;
    itemTotalAmount?: number | null;
    itemDiscount?: number | null;
    couponAmount: number | null;
    badhoDiscount: number | null;
    appliedWalletAmount: number | null;
    paidAmount?: number | null;
    sellerDiscount?: number | null;
    upiDiscountBySeller?: number | null;
    volumeDiscount?: number | null;
    totalDiscount?: number | null;
    paymentOption?: string | null;
  }
  const [priceBreakup, setPriceBreakup] = useState<PriceBreakup | null>(null);

  const openPoItemsModal = async (poNumber: string, breakup?: PriceBreakup) => {
    setPoItemsModal(poNumber);
    setPoItemsData(null);
    setPoItemsTotals(null);
    setPoItemsError(null);
    setPriceBreakup(breakup ?? null);
    setPoItemsLoading(true);
    // Always fetch the full breakup from the route — inline callers only supply a
    // partial set (no UPI / volume discount), so we use theirs optimistically and
    // overwrite with the complete, aggregated figures once they arrive.
    fetch(`/api/po-financials?poNumber=${encodeURIComponent(poNumber)}`)
      .then((r) => r.json())
      .then((json) => {
        if (json?.data) setPriceBreakup(json.data as PriceBreakup);
      })
      .catch(() => { /* keep optimistic / null breakup; modal still usable */ });
    try {
      const res = await fetch(`/api/po-items?poNumber=${encodeURIComponent(poNumber)}`);
      if (!res.ok) throw new Error('Failed to fetch items');
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setPoItemsData(json.data);
      setPoItemsTotals(json.totals);
    } catch (err) {
      setPoItemsError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setPoItemsLoading(false);
    }
  };
  const closePoItemsModal = () => {
    setPoItemsModal(null);
    setPoItemsData(null);
    setPoItemsTotals(null);
    setPoItemsError(null);
    setPoItemsSearch('');
    setPoItemsSort('amount');
    setPoItemsStatusFilter('all');
    setPriceBreakup(null);
  };
  useEffect(() => {
    if (!poItemsModal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePoItemsModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [poItemsModal]);

  // Alert tab — SLA breach alerts
  interface AlertDetailRow {
    poNumber: string;
    MarkedpendingTime: string | null;
    markedInProgressTime: string | null;
    paymentDate: string | null;
    paymentEvent: string | null;
    sellerPhone: string | null;
    sellerBusinessName: string | null;
    buyerPhone: string | null;
    buyerBusinessName: string | null;
    paidAmount: number | null;
    poAmount: number | null;
    itemTotal?: number | null;
    grossAmount?: number | null;
    orderMarginDiscount?: number | null;
    CoupanAmount: number | null;
    orderStatus: string | null;
    discountBySeller: number;
    PaymentOptionDiscountByBadho: number;
    appliedWalletAmount: number | null;
    PaymentOption: string | null;
    awbNumber: string | null;
    courierName: string | null;
    deliveryStatus: string | null;
    RefundIntiatedTime: string | null;
    RefundCompletedTime: string | null;
    RefundAmount: number | null;
    codAmountToBeCollected: number | null;
    pushedStatus: string;
    rejectReason: string | null;
    rejectedBy: string | null;
    reasonAddedByBadhoTeam: string | null;
    buyerAddressLine1: string | null;
    buyerLandmark: string | null;
    buyerPincode: string | null;
    buyerCity: string | null;
    buyerDistrict: string | null;
    buyerState: string | null;
    buyerFullAddress: string;
    sellerAddressLine1: string | null;
    sellerCity: string | null;
    sellerState: string | null;
    sellerFullAddress: string | null;
    createdAt: string;
    category: string;
    slaBreachAt: string;
    statusMarkedTime: string | null;
    statusDurationSec: number | null;
    orderAgeingSec: number | null;
    markedDispatchedTime: string | null;
    // Brand SLA span = PENDING -> INPROGRESS; Pickup SLA span = INPROGRESS -> DISPATCHED.
    // *Ongoing flags mean the order is still in that phase, so the span is measured to "now".
    brandSpanSec: number | null;
    brandSpanOngoing: boolean;
    pickupSpanSec: number | null;
    pickupSpanOngoing: boolean;
  }
  const [alertModalCategory, setAlertModalCategory] = useState<string | null>(null);
  const [alertModalSeller, setAlertModalSeller] = useState<string | null>(null);
  const [alertModalSource, setAlertModalSource] = useState<'sla' | 'aging'>('sla');
  const [alertModalData, setAlertModalData] = useState<AlertDetailRow[] | null>(null);
  const [alertModalLoading, setAlertModalLoading] = useState(false);
  const [alertModalError, setAlertModalError] = useState<string | null>(null);
  const [alertModalSearch, setAlertModalSearch] = useState('');
  const [alertModalPushedFilter, setAlertModalPushedFilter] = useState<'all' | 'Pushed' | 'Not Pushed'>('all');
  const [alertModalPaymentFilter, setAlertModalPaymentFilter] = useState<Set<string>>(new Set());
  const [alertModalCourierFilter, setAlertModalCourierFilter] = useState<Set<string>>(new Set());
  const [alertModalDeliveryFilter, setAlertModalDeliveryFilter] = useState<Set<string>>(new Set());
  const [alertModalSort, setAlertModalSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [alertGroupByDims, setAlertGroupByDims] = useState<GroupDimension[]>([]);
  const toggleAlertSort = (key: string) => {
    setAlertModalSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'asc' };
      if (prev.direction === 'asc') return { key, direction: 'desc' };
      return null;
    });
  };
  const alertSortValue = (r: AlertDetailRow, key: string): number | string | null => {
    const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
    const dt = (v: unknown) => (v == null || v === '' ? null : new Date(v as string).getTime());
    switch (key) {
      case 'pushed': return r.pushedStatus ?? '';
      case 'poNumber': { const n = Number(r.poNumber); return Number.isFinite(n) ? n : (r.poNumber ?? ''); }
      case 'status': return r.orderStatus ?? '';
      case 'itemTotal': return num(r.itemTotal);
      case 'grossAmount': return num(r.grossAmount);
      case 'orderMarginDiscount': return num(r.orderMarginDiscount);
      case 'paidAmount': return num(r.paidAmount);
      case 'coupon': return num(r.CoupanAmount);
      case 'sellerDiscount': return num(r.discountBySeller);
      case 'badhoDiscount': return num(r.PaymentOptionDiscountByBadho);
      case 'wallet': return num(r.appliedWalletAmount);
      case 'paymentOption': return r.PaymentOption ?? '';
      case 'paymentDate': return dt(r.paymentDate);
      case 'paymentEvent': return r.paymentEvent ?? '';
      case 'awb': return r.awbNumber ?? '';
      case 'courier': return r.courierName ?? '';
      case 'deliveryStatus': return r.deliveryStatus ?? '';
      case 'cod': return num(r.codAmountToBeCollected);
      case 'buyerPhone': return r.buyerPhone ?? '';
      case 'buyerBusiness': return r.buyerBusinessName ?? '';
      case 'sellerPhone': return r.sellerPhone ?? '';
      case 'sellerBusiness': return r.sellerBusinessName ?? '';
      case 'markedPending': return dt(r.MarkedpendingTime);
      case 'refundInit': return dt(r.RefundIntiatedTime);
      case 'refundDone': return dt(r.RefundCompletedTime);
      case 'refundAmount': return r.RefundAmount ?? null;
      case 'category': return r.category ?? '';
      case 'inProgress': return dt(r.markedInProgressTime);
      case 'slaBreach': return dt(r.slaBreachAt);
      case 'statusDuration': return r.statusDurationSec ?? null;
      case 'statusMarkedTime': return dt(r.statusMarkedTime);
      case 'orderAge': return r.orderAgeingSec ?? null;
      case 'brandSla': return r.brandSpanSec ?? null;
      case 'pickupSla': return r.pickupSpanSec ?? null;
      default: return '';
    }
  };

  // Alert tab — Brand-wise pivot (rows = seller, cols = payment category)
  interface AlertBrandCell { count: number; amount: number; }
  interface AlertBrandRow {
    brand: string;
    cells: Record<string, AlertBrandCell>;
    total: AlertBrandCell;
  }
  const [alertBrandData, setAlertBrandData] = useState<{
    data: AlertBrandRow[];
    categories: string[];
    totalsByCategory: Record<string, AlertBrandCell>;
    grandTotal: AlertBrandCell;
  } | null>(null);
  const [alertBrandLoading, setAlertBrandLoading] = useState(false);
  const [alertBrandError, setAlertBrandError] = useState<string | null>(null);
  const [alertBrandSearch, setAlertBrandSearch] = useState('');
  // Alert tab sub-views: 'sla' = SLA breach pivots, 'anomalies' = Order Anomalies chart
  const [alertSubTab, setAlertSubTab] = useState<'sla' | 'anomalies'>('sla');

  // Buyer details modal — opens when clicking a "Buyer Business" cell in any drill modal
  interface BuyerDetailsRow {
    id: string;
    name: string | null;
    businessName: string | null;
    phone: string | null;
    email: string | null;
    gstNumber: string | null;
    businessPanNumber: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    landmark: string | null;
    pincode: string | null;
    city: string | null;
    tehsil: string | null;
    district: string | null;
    state: string | null;
    longitude: string | null;
    lattitude: string | null;
    fullAddress: string;
  }
  interface BuyerHistory {
    buyerId: string;
    summary: {
      totalOrders: number;
      completed: number;
      rejected: number;
      cancelled: number;
      pending: number;
      inprogress: number;
      dispatched: number;
      firstOrder: string | null;
      lastOrder: string | null;
      daysSinceLast: number | null;
      lastMarkedPending: string | null;
      daysSinceLastMarkedPending: number | null;
      completedGmv: number;
      rejectedGmv: number;
      cancelledGmv: number;
      pendingGmv: number;
      inprogressGmv: number;
      dispatchedGmv: number;
      totalGmv: number;
      completionRate: number;
      rejectionRate: number;
      draftCount: number;
      lastDraft: string | null;
      daysSinceLastDraft: number | null;
    };
    topSkus: { brand: string; sku: string; orderCount: number; qty: number; amount: number }[];
    topBrands: { brand: string; orderCount: number; qty: number; amount: number }[];
    monthly: { ym: string; orders: number; gmv: number }[];
  }
  const [buyerModalOpen, setBuyerModalOpen] = useState(false);
  const [buyerModalData, setBuyerModalData] = useState<BuyerDetailsRow | null>(null);
  const [buyerModalLoading, setBuyerModalLoading] = useState(false);
  const [buyerModalError, setBuyerModalError] = useState<string | null>(null);
  const [buyerModalLookup, setBuyerModalLookup] = useState<string>('');
  const [buyerHistory, setBuyerHistory] = useState<BuyerHistory | null>(null);
  const [buyerHistoryLoading, setBuyerHistoryLoading] = useState(false);
  const [buyerHistoryError, setBuyerHistoryError] = useState<string | null>(null);

  const openBuyerModal = async (lookup: { phone?: string | null; businessName?: string | null }) => {
    setBuyerModalOpen(true);
    setBuyerModalData(null);
    setBuyerModalError(null);
    setBuyerModalLoading(true);
    setBuyerHistory(null);
    setBuyerHistoryError(null);
    setBuyerHistoryLoading(true);
    const params = new URLSearchParams();
    if (lookup.phone) params.set('phone', lookup.phone);
    else if (lookup.businessName) params.set('businessName', lookup.businessName);
    setBuyerModalLookup(lookup.phone || lookup.businessName || '');
    try {
      const res = await fetch(`/api/buyer-details?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      const buyer = json.data as BuyerDetailsRow;
      setBuyerModalData(buyer);
      setBuyerModalLoading(false);
      // History keyed off the resolved buyerId — buyer "phone" values can be corrupted
      // (timestamp suffixes), so id is the only reliable join key.
      try {
        const hres = await fetch(`/api/buyer-history?buyerId=${encodeURIComponent(buyer.id)}`);
        const hjson = await hres.json();
        if (!hres.ok) throw new Error(hjson.error || `HTTP ${hres.status}`);
        setBuyerHistory(hjson as BuyerHistory);
      } catch (e) {
        setBuyerHistoryError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setBuyerHistoryLoading(false);
      }
    } catch (err) {
      setBuyerModalError(err instanceof Error ? err.message : 'Unknown error');
      setBuyerModalLoading(false);
      setBuyerHistoryLoading(false);
    }
  };
  const closeBuyerModal = () => {
    setBuyerModalOpen(false);
    setBuyerModalData(null);
    setBuyerModalError(null);
    setBuyerModalLookup('');
    setBuyerHistory(null);
    setBuyerHistoryError(null);
  };
  useEffect(() => {
    if (!buyerModalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeBuyerModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [buyerModalOpen]);

  // Seller details modal — opens when clicking a "Seller Business" or "Seller Phone" cell
  interface SellerDetailsRow {
    id: string;
    name: string | null;
    businessName: string | null;
    phone: string | null;
    whatsappNumber: string | null;
    email: string | null;
    gstNumber: string | null;
    businessPanNumber: string | null;
    fssaiNumber: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    landmark: string | null;
    pincode: string | null;
    city: string | null;
    tehsil: string | null;
    district: string | null;
    state: string | null;
    longitude: string | null;
    lattitude: string | null;
    isD2RBrandSeller: boolean | null;
    isBadhoVerified: boolean | null;
    fullAddress: string;
  }
  const [sellerModalOpen, setSellerModalOpen] = useState(false);
  const [sellerModalData, setSellerModalData] = useState<SellerDetailsRow | null>(null);
  const [sellerModalLoading, setSellerModalLoading] = useState(false);
  const [sellerModalError, setSellerModalError] = useState<string | null>(null);
  const [sellerModalLookup, setSellerModalLookup] = useState<string>('');

  const openSellerModal = async (lookup: { phone?: string | null; businessName?: string | null }) => {
    setSellerModalOpen(true);
    setSellerModalData(null);
    setSellerModalError(null);
    setSellerModalLoading(true);
    const params = new URLSearchParams();
    if (lookup.phone) params.set('phone', lookup.phone);
    else if (lookup.businessName) params.set('businessName', lookup.businessName);
    setSellerModalLookup(lookup.phone || lookup.businessName || '');
    try {
      const res = await fetch(`/api/seller-details?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setSellerModalData(json.data as SellerDetailsRow);
    } catch (err) {
      setSellerModalError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSellerModalLoading(false);
    }
  };
  const closeSellerModal = () => {
    setSellerModalOpen(false);
    setSellerModalData(null);
    setSellerModalError(null);
    setSellerModalLookup('');
  };
  useEffect(() => {
    if (!sellerModalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeSellerModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sellerModalOpen]);

  // Alert tab — InProgress aging by seller (drill-down reuses the SLA Breach modal)
  interface AgingRow {
    sellerBusinessName: string;
    sellerPhone: string | null;
    brand: string;
    sellerState: string | null;
    sellerDistrict: string | null;
    sellerCity: string | null;
    sellerPincode: string | null;
    sellerFullAddress: string | null;
    poCount: number;
    orderAmount: number;
    buckets: Record<'1-2 days' | '2-3 days' | '3+ days', number>;
  }
  const AGING_BUCKETS = ['1-2 days', '2-3 days', '3+ days'] as const;
  // Geographic Group-By for the Delhivery SLA Breach pivot — nests seller rows
  // under their address geography (state → district → city → pincode). Empty = no
  // grouping (flat seller list).
  type AgingGeoDim = 'sellerState' | 'sellerDistrict' | 'sellerCity' | 'sellerPincode';
  const AGING_GEO_OPTIONS: { dim: AgingGeoDim; label: string }[] = [
    { dim: 'sellerState', label: 'State Wise' },
    { dim: 'sellerDistrict', label: 'District Wise' },
    { dim: 'sellerCity', label: 'City Wise' },
    { dim: 'sellerPincode', label: 'Pincode Wise' },
  ];
  const AGING_GEO_ORDER: AgingGeoDim[] = ['sellerState', 'sellerDistrict', 'sellerCity', 'sellerPincode'];
  const [agingGroupDims, setAgingGroupDims] = useState<AgingGeoDim[]>([]);
  const [agingGroupOpen, setAgingGroupOpen] = useState(false);
  const [agingCollapsed, setAgingCollapsed] = useState<Set<string>>(new Set());
  const [agingData, setAgingData] = useState<{
    data: AgingRow[];
    grand: { poCount: number; orderAmount: number; buckets: Record<string, number> };
  } | null>(null);
  const [agingLoading, setAgingLoading] = useState(false);
  const [agingError, setAgingError] = useState<string | null>(null);
  const [agingSearch, setAgingSearch] = useState('');

  // RTO tab
  interface RtoMonth { month: number; count: number; amount: number; }
  interface RtoSeller {
    sellerId: string;
    sellerPhone: string | null;
    sellerBusinessName: string | null;
    isActive: boolean;
    daysSinceLastOrder: number | null;
    pushedCount: number; pushedAmount: number;
    deliveredCount: number; deliveredAmount: number;
    rtoCount: number; rtoAmount: number;
    rtoRate: number;
  }
  interface RtoState {
    state: string | null;
    pushedCount: number; pushedAmount: number;
    deliveredCount: number; deliveredAmount: number;
    rtoCount: number; rtoAmount: number;
    rtoRate: number;
  }
  interface RtoData {
    grand: { count: number; amount: number };
    deliveredCount: number;
    rtoRate: number;
    avgRtoValue: number;
    byMonth: RtoMonth[];
    topSellers: RtoSeller[];
    topStates: RtoState[];
    year: number;
  }
  const [rtoData, setRtoData] = useState<RtoData | null>(null);
  const [rtoLoading, setRtoLoading] = useState(false);
  const RTO_PAGE_SIZE = 10;
  const [rtoSellerPage, setRtoSellerPage] = useState(1);
  const [rtoStatePage, setRtoStatePage] = useState(1);
  // RTO trend chart granularity + data
  interface RtoTrendPoint { bucket: string; label: string; count: number; amount: number; }
  const [rtoTrendGranularity, setRtoTrendGranularity] = useState<'month' | 'week' | 'day' | 'custom'>('month');
  const [rtoTrendMonths, setRtoTrendMonths] = useState<number[]>([]);
  const [rtoTrendCustomFrom, setRtoTrendCustomFrom] = useState('');
  const [rtoTrendCustomTo, setRtoTrendCustomTo] = useState('');
  const [rtoTrendData, setRtoTrendData] = useState<RtoTrendPoint[] | null>(null);
  const [rtoTrendLoading, setRtoTrendLoading] = useState(false);
  // Monthly RTO rate trend (cohort by markedPendingTime month)
  interface RtoRatePoint { month: number; label: string; rtoCount: number; deliveredCount: number; rtoRate: number; }
  const [rtoRateData, setRtoRateData] = useState<RtoRatePoint[] | null>(null);
  const [rtoRateLoading, setRtoRateLoading] = useState(false);
  // KPI tile → orders modal
  type RtoKpiKind = 'count' | 'value' | 'rate' | 'avg';
  const [rtoKpiModal, setRtoKpiModal] = useState<RtoKpiKind | null>(null);
  // When set, the RTO KPI modal is scoped to a single trend bucket (date window) instead of the full year.
  const [rtoKpiWindow, setRtoKpiWindow] = useState<{ startDate: string; endDate: string; label: string } | null>(null);
  const [rtoKpiModalSearch, setRtoKpiModalSearch] = useState('');
  const [rtoKpiModalPushedFilter, setRtoKpiModalPushedFilter] = useState<'all' | 'Pushed' | 'Not Pushed'>('all');
  const [rtoKpiModalPaymentFilter, setRtoKpiModalPaymentFilter] = useState<Set<string>>(new Set());
  const [rtoKpiModalCourierFilter, setRtoKpiModalCourierFilter] = useState<Set<string>>(new Set());
  const [rtoKpiModalDeliveryFilter, setRtoKpiModalDeliveryFilter] = useState<Set<string>>(new Set());
  const [rtoKpiModalReasonFilter, setRtoKpiModalReasonFilter] = useState<Set<string>>(new Set());
  const [rtoKpiModalAttemptFilter, setRtoKpiModalAttemptFilter] = useState<Set<string>>(new Set());
  const [rtoKpiModalSort, setRtoKpiModalSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [rtoGroupByDims, setRtoGroupByDims] = useState<GroupDimension[]>([]);
  const toggleRtoKpiSort = (key: string) => {
    setRtoKpiModalSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'asc' };
      if (prev.direction === 'asc') return { key, direction: 'desc' };
      return null;
    });
  };
  const [rtoKpiModalData, setRtoKpiModalData] = useState<RtoOrderRow[] | null>(null);
  const [rtoKpiModalLoading, setRtoKpiModalLoading] = useState(false);
  // GMV Goal ACHIEVED tile → orders modal
  interface GoalOrderRow {
    poNumber: string;
    status: string;
    deliveryStatus: string | null;
    amount: number;
    markedPendingTime: string | null;
    markedDeliveredTime: string | null;
    buyerPhone: string | null;
    buyerBusinessName: string | null;
    buyerState: string | null;
    buyerCity: string | null;
    buyerFullAddress?: string;
    buyerAddressLine1?: string | null;
    buyerLandmark?: string | null;
    buyerPincode?: string | null;
    buyerDistrict?: string | null;
    sellerPhone: string | null;
    sellerBusinessName: string | null;
    deliveryNetwork: string | null;
    deliveryType: string | null;
  }
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalModalSearch, setGoalModalSearch] = useState('');
  const [goalModalData, setGoalModalData] = useState<GoalOrderRow[] | null>(null);
  const [goalModalLoading, setGoalModalLoading] = useState(false);
  // MonthWiseOrder funnel (created_at month → totals + 5 stages with count|amount|%|buyers|sellers)
  interface FunnelStage { count: number; amount: number; buyers: number; sellers: number; }
  interface FunnelMonth {
    year: number; month: number;
    totalCount: number; totalAmount: number;
    draft: FunnelStage;
    orderPunched: FunnelStage;
    pending: FunnelStage;
    inProgress: FunnelStage;
    fulfilled: FunnelStage;
  }
  interface FunnelData {
    data: FunnelMonth[];
    startDate: string | null;
    endDate: string | null;
  }
  const [funnelData, setFunnelData] = useState<FunnelData | null>(null);
  const [funnelLoading, setFunnelLoading] = useState(false);
  const [funnelRange, setFunnelRange] = useState<'all' | 'year' | '12mo' | '30d' | '7d' | 'today' | 'custom'>('year');
  const [funnelCustomFrom, setFunnelCustomFrom] = useState('');
  const [funnelCustomTo, setFunnelCustomTo] = useState('');

  // MonthWiseOrder cell drill-down (click a stage / totals cell → list those POs)
  interface FunnelDrillRow {
    poNumber: string;
    status: string;
    amount: number;
    buyerBusinessName: string | null;
    buyerPhone: string | null;
    sellerBusinessName: string | null;
    createdAt: string | null;
  }
  const [funnelDrill, setFunnelDrill] = useState<{ title: string; stage: string } | null>(null);
  const [funnelDrillRows, setFunnelDrillRows] = useState<FunnelDrillRow[] | null>(null);
  const [funnelDrillLoading, setFunnelDrillLoading] = useState(false);
  const [funnelDrillError, setFunnelDrillError] = useState<string | null>(null);
  const [funnelDrillSearch, setFunnelDrillSearch] = useState('');
  const [funnelDrillTruncated, setFunnelDrillTruncated] = useState(false);

  const openFunnelDrill = async (year: number, month: number, stage: string, title: string) => {
    setFunnelDrill({ title, stage });
    setFunnelDrillRows(null);
    setFunnelDrillError(null);
    setFunnelDrillSearch('');
    setFunnelDrillTruncated(false);
    setFunnelDrillLoading(true);
    try {
      const res = await fetch(`/api/order-funnel-drill?year=${year}&month=${month}&stage=${stage}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch');
      setFunnelDrillRows(json.data);
      setFunnelDrillTruncated(!!json.truncated);
    } catch (err) {
      setFunnelDrillError(err instanceof Error ? err.message : 'Error loading orders');
    } finally {
      setFunnelDrillLoading(false);
    }
  };

  // RTO sub-tabs (Dashboard / Details / Destination Hub Tracking)
  const [rtoSubTab, setRtoSubTab] = useState<'dashboard' | 'details' | 'hub'>('dashboard');
  interface RtoOrderRow {
    orderDate: string | null;
    itlDate: string | null;
    markedRejectedTime: string | null;
    markedRejectedAt: string | null;
    latestAttemptTime: string | null;
    poNumber: string;
    poStatus: string;
    orderValue: number;
    itemTotal?: number | null;
    grossAmount?: number | null;
    orderMarginDiscount?: number | null;
    couponValue: number;
    paymentMode: string | null;
    brandName: string | null;
    shipmentStatus: string | null;
    finalFailureReason: string | null;
    deliveryAttempt: number;
    attempt1Time: string | null; attempt1Remarks: string | null;
    attempt2Time: string | null; attempt2Remarks: string | null;
    attempt3Time: string | null; attempt3Remarks: string | null;
    attempt4Time: string | null; attempt4Remarks: string | null;
    attempt5Time: string | null; attempt5Remarks: string | null;
    attempt6Time: string | null; attempt6Remarks: string | null;
    awbNumber: string | null;
    logisticName: string | null;
    codCollect: number;
    buyerName: string | null;
    buyerBusinessName: string | null;
    buyerPhone: string | null;
    buyerDistrict: string | null;
    buyerState: string | null;
    buyerFullAddress: string | null;
    buyerLongitude: string | null;
    buyerLatitude: string | null;
    paidAmount: number | null;
    appliedWalletAmount: number | null;
    pushedStatus: string | null;
    sellerBusinessName: string | null;
    sellerPhone: string | null;
    discountBySeller: number;
    PaymentOptionDiscountByBadho: number;
    paymentDate: string | null;
    paymentEvent: string | null;
    RefundIntiatedTime: string | null;
    RefundCompletedTime: string | null;
    RefundAmount: number | null;
    rejectReason: string | null;
    rejectedBy: string | null;
    reasonAddedByBadhoTeam: string | null;
    statusDurationSec: number | null;
  }
  const [rtoListData, setRtoListData] = useState<RtoOrderRow[] | null>(null);
  const [rtoListLoading, setRtoListLoading] = useState(false);
  const [rtoListSearch, setRtoListSearch] = useState('');
  const [rtoListAttemptFilter, setRtoListAttemptFilter] = useState<Set<string>>(new Set());
  const [rtoListPaymentFilter, setRtoListPaymentFilter] = useState<Set<string>>(new Set());
  const [rtoListPage, setRtoListPage] = useState(1);
  const [rtoListRange, setRtoListRange] = useState<'year' | 'today' | '7d' | 'custom'>('year');
  const [rtoListCustomFrom, setRtoListCustomFrom] = useState('');
  const [rtoListCustomTo, setRtoListCustomTo] = useState('');

  // Destination Hub Tracking (RTO sub-tab "hub") — Delhivery shipments that
  // have reached the destination hub but haven't moved (or are stuck on
  // attempts). Filters are entirely client-side for instant facets.
  interface HubAttempt { time: string | null; remarks: string | null; }
  interface HubRow {
    orderDateTime: string | null;
    itlDateTime: string | null;
    reachedAtDestinationTime: string | null;
    reachedAtDestinationPlace: string | null;
    pickedUpTime: string | null;
    pickupToHubDays: number | null;
    daysSinceReachedAtDestination: number | null;
    latestScanTime: string | null;
    latestScanPlace: string | null;
    stillInDestinationHub: string | null;
    poNumber: string;
    poStatus: string;
    orderValue: number;
    itemTotal?: number | null;
    grossAmount?: number | null;
    orderMarginDiscount?: number | null;
    couponValue: number;
    paymentMode: string | null;
    brandName: string | null;
    shipmentStatus: string | null;
    deliveryAttempt: number;
    attempts: HubAttempt[];
    awbNumber: string | null;
    logisticName: string | null;
    codCollect: number;
    buyerName: string | null;
    buyerBusinessName: string | null;
    buyerPhone: string | null;
    buyerFullAddress: string | null;
    buyerLongitude: number | null;
    buyerLatitude: number | null;
    paidAmount: number | null;
    appliedWalletAmount: number | null;
  }
  interface HubData {
    data: HubRow[];
    count: number;
    facets: {
      shipmentStatus: string[];
      brand: string[];
      paymentMode: string[];
      logistic: string[];
    };
    timestamp: string;
  }
  const [hubData, setHubData] = useState<HubData | null>(null);
  const [hubLoading, setHubLoading] = useState(false);
  const [hubSearch, setHubSearch] = useState('');
  const [hubShipmentFilter, setHubShipmentFilter] = useState<Set<string>>(new Set());
  const [hubBrandFilter, setHubBrandFilter] = useState<Set<string>>(new Set());
  const [hubPaymentFilter, setHubPaymentFilter] = useState<Set<string>>(new Set());
  const [hubAttemptFilter, setHubAttemptFilter] = useState<Set<string>>(new Set());
  const [hubStuckOnly, setHubStuckOnly] = useState(false);
  const [hubMinDays, setHubMinDays] = useState<number | ''>('');
  const [hubStuckBucketFilter, setHubStuckBucketFilter] = useState<Set<string>>(new Set());
  const [hubStuckSort, setHubStuckSort] = useState<'none' | 'desc' | 'asc'>('none');
  const [hubPage, setHubPage] = useState(1);
  const [hubSize, setHubSize] = useState(50);
  const [hubExpanded, setHubExpanded] = useState<Set<string>>(new Set());
  // Trend tab — daily order trend chart
  interface DailyTrendPoint { day: string; ordersCount: number; ordersAmount: number; deliveredCount: number; deliveredAmount: number; }
  const [trendData, setTrendData] = useState<DailyTrendPoint[] | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);

  // Trend tab — Daily wise completed Order (last 30 days, by markedCompletedTime · 3PL × INTERCITY · D2R)
  interface DailyCompletedPoint { day: string; ordersCount: number; ordersAmount: number; avgOrderAmount: number; }
  const [dailyCompleted, setDailyCompleted] = useState<DailyCompletedPoint[] | null>(null);
  const [dailyCompletedLoading, setDailyCompletedLoading] = useState(false);
  const [dailyCompletedMetric, setDailyCompletedMetric] = useState<'count' | 'amount'>('count');

  // Trend tab — daily payment-option mix (distinct PO count per option per day)
  interface PaymentTrend {
    data: Array<Record<string, number | string>>;
    options: string[];
    optionTotals: Record<string, number>;
  }
  const [paymentTrend, setPaymentTrend] = useState<PaymentTrend | null>(null);
  const [paymentTrendLoading, setPaymentTrendLoading] = useState(false);
  const [paymentTrendView, setPaymentTrendView] = useState<'count' | 'percent'>('count');

  // Trend tab — RTO insights (COD×Coupon, order-value buckets, city tier)
  interface RtoInsights {
    codCoupon: Array<{ couponStatus: string; paymentMode: string; totalOrders: number; deliveredCount: number; rtoCount: number; rtoPct: number | null }>;
    bucket: Array<{ bucket: string; deliveredCount: number; rtoCount: number; rtoPct: number | null; rtoAmount: number; rtoAmountPct: number | null }>;
    tier: Array<{ cityTier: string; rtoOrders: number; contributionPct: number | null }>;
  }
  const [rtoInsights, setRtoInsights] = useState<RtoInsights | null>(null);
  const [rtoInsightsLoading, setRtoInsightsLoading] = useState(false);

  // Zone Wise tab — Delhivery pivot: seller × zone × status (count + kg)
  interface ZoneCell { count: number; modeKg: number; avgKg?: number; medianKg?: number; }
  interface ZonePivot {
    startDate: string;
    endDate: string;
    sellers: string[];
    zones: string[];
    statuses: string[];
    data: Record<string, Record<string, Record<string, ZoneCell>>>;
    sellerTotals: Record<string, ZoneCell>;
    zoneTotals:   Record<string, ZoneCell>;
    statusTotals: Record<string, ZoneCell>;
    sellerZoneRollup: Record<string, Record<string, ZoneCell>>;
    zoneStatusRollup: Record<string, Record<string, ZoneCell>>;
    sellerAddresses?: Record<string, string>;
    grand: ZoneCell;
  }
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const firstOfMonthStr = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
  const [zonePivot, setZonePivot] = useState<ZonePivot | null>(null);
  const [zonePivotLoading, setZonePivotLoading] = useState(false);
  const [zoneRange, setZoneRange] = useState<'today' | '7d' | '15d' | '30d' | 'custom'>('30d');
  const [zoneFrom, setZoneFrom] = useState(firstOfMonthStr());
  const [zoneTo, setZoneTo] = useState(todayStr());
  const [zoneMonths, setZoneMonths] = useState<number[]>([]);
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set());
  const [zoneSubTab, setZoneSubTab] = useState<'trend' | 'table'>('trend');
  const [commercialOpen, setCommercialOpen] = useState(false);
  useEffect(() => {
    if (!commercialOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCommercialOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commercialOpen]);
  const resolveZoneRange = (): { startDate: string; endDate: string } => {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    if (zoneRange === 'today') return { startDate: fmt(today), endDate: fmt(today) };
    const map: Record<string, number> = { '7d': 7, '15d': 15, '30d': 30 };
    const days = map[zoneRange];
    if (days) {
      const s = new Date(today);
      s.setDate(s.getDate() - (days - 1));
      return { startDate: fmt(s), endDate: fmt(today) };
    }
    return { startDate: zoneFrom, endDate: zoneTo };
  };
  const [trendRange, setTrendRange] = useState<'7d' | '30d' | '90d' | 'all' | 'custom'>('30d');
  const [trendCustomFrom, setTrendCustomFrom] = useState('');
  const [trendCustomTo, setTrendCustomTo] = useState('');
  const [trendMetric, setTrendMetric] = useState<'count' | 'amount'>('count');
  const [trendMonths, setTrendMonths] = useState<number[]>([]);
  // Order Anomalies — stacked bar chart by status
  interface AnomaliesPoint { date: string; [status: string]: string | number; }
  const [anomaliesData, setAnomaliesData] = useState<AnomaliesPoint[] | null>(null);
  const [anomaliesLoading, setAnomaliesLoading] = useState(false);
  const [anomaliesStatuses, setAnomaliesStatuses] = useState<string[]>([]);
  // Order Anomalies — status multiselect. Bars are stacked bottom→top in this
  // order (matching STATUS_DISPLAY_ORDER); ordered meta also drives the legend
  // toggle chips and the tooltip total.
  const ANOMALY_STATUS_META = [
    { key: 'PENDING',    color: '#ef4444', labelFill: '#fff' },
    { key: 'CANCELLED',  color: '#6b7280', labelFill: '#fff' },
    { key: 'REJECTED',   color: '#fb923c', labelFill: '#fff' },
    { key: 'INPROGRESS', color: '#fbcfe8', labelFill: '#831843' },
    { key: 'DISPATCHED', color: '#818cf8', labelFill: '#fff' },
    { key: 'COMPLETED', color: '#84cc16', labelFill: '#fff' },
  ] as const;
  // Default selection shows every status the API returns, including REJECTED &
  // CANCELLED. Listed top→bottom so the legend reads COMPLETED-first.
  const [selectedAnomalyStatuses, setSelectedAnomalyStatuses] = useState<string[]>(
    ['COMPLETED', 'DISPATCHED', 'INPROGRESS', 'REJECTED', 'CANCELLED', 'PENDING']
  );
  const toggleAnomalyStatus = (status: string) =>
    setSelectedAnomalyStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  const [drillStatus, setDrillStatus] = useState<string | null>(null);
  const [drillMonth, setDrillMonth] = useState<number | null>(null);
  const [drillRows, setDrillRows] = useState<OrderListRow[] | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillError, setDrillError] = useState<string | null>(null);
  const [drillSearch, setDrillSearch] = useState('');
  const [drillPage, setDrillPage] = useState(1);
  const [sellerTablePage, setSellerTablePage] = useState(1);
  const [sellerDrillPage, setSellerDrillPage] = useState(1);
  const [mounted, setMounted] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [employeeName, setEmployeeName] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const router = useRouter();

  // Client-side auth gate — JWT lives in localStorage; bounce to /login if missing.
  useEffect(() => {
    setMounted(true);
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('authToken');
    if (!token) {
      router.replace('/login');
      return;
    }
    setEmployeeName(localStorage.getItem('employeeName') || '');
    setAuthChecked(true);
  }, [router]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    localStorage.removeItem('authToken');
    localStorage.removeItem('employeeId');
    localStorage.removeItem('employeeName');
    localStorage.removeItem('employeeEmail');
    router.replace('/login');
  };

  const fetchMonthly = async () => {
    try {
      setMonthlyLoading(true);
      const response = await fetch(`/api/order-monthly-status?year=${currentYear}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch monthly data');
      const result: MonthlyStatusData = await response.json();
      setMonthlyData(result);
      captureQuery('monthly', result);
    } catch (err) {
      console.error('Monthly fetch error:', err);
    } finally {
      setMonthlyLoading(false);
    }
  };

  useEffect(() => {
    fetchMonthly();
  }, []);

  const fetchDaily = async (month: number) => {
    try {
      setDailyLoading(true);
      const response = await fetch(`/api/order-daily-status?year=${currentYear}&month=${month}`);
      if (!response.ok) throw new Error('Failed to fetch daily data');
      const result: DailyStatusData = await response.json();
      setDailyData(result);
      captureQuery('daily', result);
    } catch (err) {
      console.error('Daily fetch error:', err);
    } finally {
      setDailyLoading(false);
    }
  };

  useEffect(() => {
    if (breakdownGranularity === 'day') {
      fetchDaily(breakdownMonth);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakdownGranularity, breakdownMonth]);

  const fetchWeekly = async () => {
    try {
      setWeeklyLoading(true);
      const response = await fetch(`/api/order-weekly-status?year=${currentYear}`);
      if (!response.ok) throw new Error('Failed to fetch weekly data');
      const result: WeeklyStatusData = await response.json();
      setWeeklyData(result);
      captureQuery('weekly', result);
    } catch (err) {
      console.error('Weekly fetch error:', err);
    } finally {
      setWeeklyLoading(false);
    }
  };

  useEffect(() => {
    if (breakdownGranularity === 'week' && !weeklyData) {
      fetchWeekly();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakdownGranularity]);

  const fetchPivot = async () => {
    try {
      setPivotLoading(true);
      const monthsQS = pivotMonths.length ? `&months=${pivotMonths.join(',')}` : '';
      const response = await fetch(`/api/order-monthly-status-delivery?year=${currentYear}${monthsQS}`);
      if (!response.ok) throw new Error('Failed to fetch pivot data');
      const result: MonthlyStatusDeliveryData = await response.json();
      setPivotData(result);
    } catch (err) {
      console.error('Pivot fetch error:', err);
    } finally {
      setPivotLoading(false);
    }
  };

  useEffect(() => {
    fetchPivot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pivotMonths]);

  const fetchGeoCoverage = async () => {
    try {
      setGeoCoverageLoading(true);
      const qs = new URLSearchParams({
        year: String(currentYear),
        granularity: geoCovGranularity,
        month: String(geoCovDayMonth),
      });
      if (geoCovStatuses.length) qs.set('statuses', geoCovStatuses.join(','));
      if (geoCovMonths.length) qs.set('months', geoCovMonths.join(','));
      const response = await fetch(`/api/order-monthly-geo-coverage?${qs.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch geo coverage');
      const result: GeoCoverageData = await response.json();
      setGeoCoverageData(result);
      captureQuery('geoCoverage', result);
    } catch (err) {
      console.error('Geo coverage fetch error:', err);
    } finally {
      setGeoCoverageLoading(false);
    }
  };

  useEffect(() => {
    fetchGeoCoverage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoCovGranularity, geoCovDayMonth, geoCovStatuses, geoCovMonths]);

  const fetchPivotWeekly = async () => {
    try {
      setPivotWeekLoading(true);
      const monthsQS = pivotMonths.length ? `&months=${pivotMonths.join(',')}` : '';
      const response = await fetch(`/api/order-weekly-status-delivery?year=${currentYear}${monthsQS}`);
      if (!response.ok) throw new Error('Failed to fetch weekly pivot');
      const result: WeeklyStatusDeliveryData = await response.json();
      setPivotWeekData(result);
    } catch (err) {
      console.error('Pivot weekly fetch error:', err);
    } finally {
      setPivotWeekLoading(false);
    }
  };

  const fetchPivotDaily = async (month: number) => {
    try {
      setPivotDayLoading(true);
      const response = await fetch(`/api/order-daily-status-delivery?year=${currentYear}&month=${month}`);
      if (!response.ok) throw new Error('Failed to fetch daily pivot');
      const result: DailyStatusDeliveryData = await response.json();
      setPivotDayData(result);
    } catch (err) {
      console.error('Pivot daily fetch error:', err);
    } finally {
      setPivotDayLoading(false);
    }
  };

  useEffect(() => {
    if (pivotGranularity === 'week') fetchPivotWeekly();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pivotGranularity, pivotMonths]);

  useEffect(() => {
    if (pivotGranularity === 'day') fetchPivotDaily(pivotDayMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pivotGranularity, pivotDayMonth]);

  // ── Trend tab — daily trend window ──────────────────────────────
  const resolveTrendRange = (): { startDate: string | null; endDate: string | null } => {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const map: Record<string, number | null> = { '7d': 7, '30d': 30, '90d': 90, all: null, custom: -1 };
    const days = map[trendRange];
    if (typeof days === 'number' && days > 0) {
      const start = new Date(today);
      start.setDate(start.getDate() - days + 1);
      return { startDate: fmt(start), endDate: fmt(today) };
    }
    if (trendRange === 'custom') return { startDate: trendCustomFrom || null, endDate: trendCustomTo || null };
    return { startDate: null, endDate: null };
  };

  const fetchTrend = async () => {
    try {
      setTrendLoading(true);
      const { startDate, endDate } = resolveTrendRange();
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (trendMonths.length) params.append('months', trendMonths.join(','));
      const res = await fetch(`/api/order-daily-trend${params.toString() ? `?${params}` : ''}`);
      if (!res.ok) throw new Error('Failed to fetch trend');
      const json = await res.json();
      setTrendData(json.data);
      captureQuery('trend', json);
    } catch (err) {
      console.error('Trend fetch error:', err);
      setTrendData([]);
    } finally {
      setTrendLoading(false);
    }
  };

  const fetchDailyCompleted = async () => {
    try {
      setDailyCompletedLoading(true);
      const res = await fetch(`/api/order-daily-completed?days=30`);
      if (!res.ok) throw new Error('Failed to fetch daily completed');
      const json = await res.json();
      setDailyCompleted(json.data);
      captureQuery('dailyCompleted', json);
    } catch (err) {
      console.error('Daily completed fetch error:', err);
      setDailyCompleted([]);
    } finally {
      setDailyCompletedLoading(false);
    }
  };

  const fetchZonePivot = async () => {
    try {
      setZonePivotLoading(true);
      const { startDate, endDate } = resolveZoneRange();
      const params = new URLSearchParams({ startDate, endDate });
      if (zoneMonths.length) params.append('months', zoneMonths.join(','));
      const res = await fetch(`/api/order-zone-pivot?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch zone pivot');
      const json = await res.json();
      setZonePivot(json);
      captureQuery('zone', json);
    } catch (err) {
      console.error('Zone pivot fetch error:', err);
      setZonePivot(null);
    } finally {
      setZonePivotLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'zone') return;
    fetchZonePivot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, zoneRange, zoneFrom, zoneTo, zoneMonths]);

  const fetchPaymentTrend = async () => {
    try {
      setPaymentTrendLoading(true);
      const { startDate, endDate } = resolveTrendRange();
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (trendMonths.length) params.append('months', trendMonths.join(','));
      const res = await fetch(`/api/brand-performance/payment-trend${params.toString() ? `?${params}` : ''}`);
      if (!res.ok) throw new Error('Failed to fetch payment-trend');
      const json = await res.json();
      setPaymentTrend(json);
      captureQuery('paymentTrend', json);
    } catch (err) {
      console.error('Payment-trend fetch error:', err);
      setPaymentTrend(null);
    } finally {
      setPaymentTrendLoading(false);
    }
  };

  const fetchRtoInsights = async () => {
    try {
      setRtoInsightsLoading(true);
      const { startDate, endDate } = resolveTrendRange();
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      const res = await fetch(`/api/order-rto-insights${params.toString() ? `?${params}` : ''}`);
      if (!res.ok) throw new Error('Failed to fetch rto-insights');
      const json = await res.json();
      setRtoInsights(json);
      captureQuery('rtoInsights', json);
    } catch (err) {
      console.error('RTO-insights fetch error:', err);
      setRtoInsights(null);
    } finally {
      setRtoInsightsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'trend') return;
    fetchTrend();
    fetchDailyCompleted();
    fetchPaymentTrend();
    fetchRtoInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, trendRange, trendCustomFrom, trendCustomTo, trendMonths]);

  const fetchAnomalies = async () => {
    try {
      setAnomaliesLoading(true);
      const res = await fetch(`/api/order-anomalies`);
      if (!res.ok) throw new Error('Failed to fetch anomalies');
      const json = await res.json();
      setAnomaliesData(json.data);
      captureQuery('anomalies', json);
      setAnomaliesStatuses(json.statuses);
    } catch (err) {
      console.error('Anomalies fetch error:', err);
      setAnomaliesData([]);
      setAnomaliesStatuses([]);
    } finally {
      setAnomaliesLoading(false);
    }
  };

  const fetchRto = async () => {
    try {
      setRtoLoading(true);
      const res = await fetch(`/api/order-rto?year=${currentYear}`);
      if (!res.ok) throw new Error('Failed to fetch RTO');
      const json = await res.json();
      setRtoData(json);
      captureQuery('rto', json);
      setRtoSellerPage(1);
      setRtoStatePage(1);
    } catch (err) {
      console.error('RTO fetch error:', err);
      setRtoData(null);
    } finally {
      setRtoLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'rto' || rtoData) return;
    fetchRto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const fetchRtoTrend = async () => {
    try {
      setRtoTrendLoading(true);
      const params = new URLSearchParams();
      if (rtoTrendGranularity === 'custom') {
        params.set('granularity', 'day');
        if (rtoTrendCustomFrom) params.set('startDate', rtoTrendCustomFrom);
        if (rtoTrendCustomTo) params.set('endDate', rtoTrendCustomTo);
      } else {
        params.set('granularity', rtoTrendGranularity);
        if (rtoTrendMonths.length) params.set('months', rtoTrendMonths.join(','));
      }
      const res = await fetch(`/api/order-rto-trend?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch RTO trend');
      const json = await res.json();
      setRtoTrendData(json.data);
      captureQuery('rtoTrend', json);
    } catch (err) {
      console.error('RTO trend fetch error:', err);
      setRtoTrendData([]);
    } finally {
      setRtoTrendLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'rto') return;
    fetchRtoTrend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, rtoTrendGranularity, rtoTrendCustomFrom, rtoTrendCustomTo, rtoTrendMonths]);

  const fetchRtoRate = async () => {
    try {
      setRtoRateLoading(true);
      const res = await fetch(`/api/order-rto-rate-monthly`);
      if (!res.ok) throw new Error('Failed to fetch monthly RTO rate');
      const json = await res.json();
      setRtoRateData(json.data);
      captureQuery('rtoRate', json);
    } catch (err) {
      console.error('RTO rate fetch error:', err);
      setRtoRateData([]);
    } finally {
      setRtoRateLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'rto' || rtoRateData) return;
    fetchRtoRate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Modal fetcher — current year RTO orders (defaults; no params)
  const fetchRtoKpiModalData = async (win?: { startDate?: string; endDate?: string } | null) => {
    try {
      setRtoKpiModalLoading(true);
      const qs = new URLSearchParams();
      if (win?.startDate) qs.set('startDate', win.startDate);
      if (win?.endDate) qs.set('endDate', win.endDate);
      const res = await fetch(`/api/order-rto-list${qs.toString() ? `?${qs}` : ''}`);
      if (!res.ok) throw new Error('Failed to fetch RTO orders for modal');
      const json = await res.json();
      setRtoKpiModalData(json.data);
      fetchScansBatch((json.data as RtoOrderRow[]).map((r) => r.poNumber).filter(Boolean));
    } catch (err) {
      console.error('RTO KPI modal fetch error:', err);
      setRtoKpiModalData([]);
    } finally {
      setRtoKpiModalLoading(false);
    }
  };

  // Open modal → ensure data loaded once and reset filters
  useEffect(() => {
    if (!rtoKpiModal) return;
    setRtoKpiModalSearch('');
    setRtoKpiModalPushedFilter('all');
    setRtoKpiModalPaymentFilter(new Set());
    setRtoKpiModalCourierFilter(new Set());
    setRtoKpiModalDeliveryFilter(new Set());
    setRtoKpiModalReasonFilter(new Set());
    setRtoKpiModalAttemptFilter(new Set());
    setRtoKpiModalSort(null);
    // Always refetch on open / window change — windowed (bucket) and year-wide share the same cache slot.
    setRtoKpiModalData(null);
    fetchRtoKpiModalData(rtoKpiWindow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rtoKpiModal, rtoKpiWindow]);

  // ESC closes modal
  useEffect(() => {
    if (!rtoKpiModal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setRtoKpiModal(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rtoKpiModal]);

  // Reset RTO Group By selection whenever the RTO KPI modal closes.
  useEffect(() => {
    if (!rtoKpiModal) setRtoGroupByDims([]);
  }, [rtoKpiModal]);

  // ─── Alert tab — SLA breach brand-wise pivot & details ────────────────────
  const fetchAlertBrand = async () => {
    try {
      setAlertBrandLoading(true);
      setAlertBrandError(null);
      const res = await fetch('/api/sla-alerts-by-brand');
      if (!res.ok) throw new Error('Failed to fetch brand-wise alerts');
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setAlertBrandData(json);
      captureQuery('slaAlerts', json);
    } catch (err) {
      setAlertBrandError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setAlertBrandLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'alert') return;
    if (alertBrandData === null) fetchAlertBrand();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Lazy-load the Order Anomalies chart when its Alert sub-tab is opened
  useEffect(() => {
    if (activeTab !== 'alert' || alertSubTab !== 'anomalies') return;
    if (anomaliesData === null) fetchAnomalies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, alertSubTab]);

  // Pre-fetch alert count on mount so the tab badge appears immediately
  useEffect(() => {
    if (alertBrandData === null) fetchAlertBrand();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAlertModal = async (category: string, sellerBusinessName?: string, source: 'sla' | 'aging' = 'sla') => {
    setAlertModalSource(source);
    setAlertModalCategory(category);
    setAlertModalSeller(sellerBusinessName || null);
    setAlertModalSearch('');
    setAlertModalPushedFilter('all');
    setAlertModalPaymentFilter(new Set());
    setAlertModalCourierFilter(new Set());
    setAlertModalDeliveryFilter(new Set());
    setAlertModalSort(null);
    setAlertModalData(null);
    setAlertModalError(null);
    setAlertModalLoading(true);
    try {
      let url: string;
      if (source === 'aging') {
        const params = new URLSearchParams({ bucket: category });
        if (sellerBusinessName) params.set('sellerBusinessName', sellerBusinessName);
        url = `/api/inprogress-aging-details?${params.toString()}`;
      } else {
        // SLA brand pivot drills down by normalized brand (the second arg
        // carries the brand label, not an exact seller businessName).
        const params = new URLSearchParams({ category });
        if (sellerBusinessName) params.set('brand', sellerBusinessName);
        url = `/api/sla-alerts-details?${params.toString()}`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch alert details');
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setAlertModalData(json.data);
      fetchScansBatch((json.data as AlertDetailRow[]).map((r) => r.poNumber).filter(Boolean));
    } catch (err) {
      setAlertModalError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setAlertModalLoading(false);
    }
  };

  const closeAlertModal = () => {
    setAlertGroupByDims([]);
    setAlertModalCategory(null);
    setAlertModalSeller(null);
    setAlertModalSource('sla');
    setAlertModalData(null);
    setAlertModalSearch('');
    setAlertModalPushedFilter('all');
    setAlertModalPaymentFilter(new Set());
    setAlertModalCourierFilter(new Set());
    setAlertModalDeliveryFilter(new Set());
    setAlertModalError(null);
    setAlertModalSort(null);
  };

  useEffect(() => {
    if (!alertModalCategory) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAlertModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [alertModalCategory]);

  // ─── Alert tab — InProgress aging brand-wise pivot & details ──────────────
  const fetchAgingByBrand = async () => {
    try {
      setAgingLoading(true);
      setAgingError(null);
      const res = await fetch('/api/inprogress-aging-by-brand');
      if (!res.ok) throw new Error('Failed to fetch InProgress aging');
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setAgingData(json);
      captureQuery('aging', json);
    } catch (err) {
      setAgingError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setAgingLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'alert') return;
    if (agingData === null) fetchAgingByBrand();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Pre-fetch aging count on mount so the tab badge reflects it immediately
  useEffect(() => {
    if (agingData === null) fetchAgingByBrand();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // GMV Goal ACHIEVED modal — fetch + ESC
  const fetchGoalModalData = async () => {
    try {
      setGoalModalLoading(true);
      const res = await fetch(`/api/order-goal-list`);
      if (!res.ok) throw new Error('Failed to fetch goal orders');
      const json = await res.json();
      setGoalModalData(json.data);
    } catch (err) {
      console.error('Goal modal fetch error:', err);
      setGoalModalData([]);
    } finally {
      setGoalModalLoading(false);
    }
  };
  useEffect(() => {
    if (!goalModalOpen) return;
    setGoalModalSearch('');
    if (!goalModalData) fetchGoalModalData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalModalOpen]);
  useEffect(() => {
    if (!goalModalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setGoalModalOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goalModalOpen]);

  const resolveRtoListRange = (): { startDate: string | null; endDate: string | null } => {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    if (rtoListRange === 'today') return { startDate: fmt(today), endDate: fmt(today) };
    if (rtoListRange === '7d') {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { startDate: fmt(start), endDate: fmt(today) };
    }
    if (rtoListRange === 'custom') {
      return { startDate: rtoListCustomFrom || null, endDate: rtoListCustomTo || null };
    }
    return { startDate: null, endDate: null }; // 'year' → API defaults to current year
  };

  const fetchRtoList = async () => {
    try {
      setRtoListLoading(true);
      const { startDate, endDate } = resolveRtoListRange();
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      const url = `/api/order-rto-list${params.toString() ? `?${params}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch RTO list');
      const json = await res.json();
      setRtoListData(json.data);
      captureQuery('rtoList', json);
    } catch (err) {
      console.error('RTO list fetch error:', err);
      setRtoListData([]);
    } finally {
      setRtoListLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'rto' || rtoSubTab !== 'details') return;
    fetchRtoList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, rtoSubTab, rtoListRange, rtoListCustomFrom, rtoListCustomTo]);

  useEffect(() => { setRtoListPage(1); }, [rtoListSearch, rtoListAttemptFilter, rtoListPaymentFilter, rtoListRange, rtoListCustomFrom, rtoListCustomTo]);

  // ─── Destination Hub Tracking ────────────────────────────────────────
  const fetchHub = async () => {
    try {
      setHubLoading(true);
      const res = await fetch('/api/order-destination-hub');
      if (!res.ok) throw new Error('Failed to fetch hub data');
      const json: HubData = await res.json();
      setHubData(json);
      captureQuery('hub', json);
    } catch (err) {
      console.error('Hub fetch error:', err);
      setHubData({ data: [], count: 0, facets: { shipmentStatus: [], brand: [], paymentMode: [], logistic: [] }, timestamp: new Date().toISOString() });
    } finally {
      setHubLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'rto' || rtoSubTab !== 'hub') return;
    if (hubData) return; // already loaded
    fetchHub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, rtoSubTab]);

  useEffect(() => { setHubPage(1); }, [hubSearch, hubShipmentFilter, hubBrandFilter, hubPaymentFilter, hubAttemptFilter, hubStuckOnly, hubMinDays, hubStuckBucketFilter, hubStuckSort, hubSize]);

  const filteredHubRows = (() => {
    if (!hubData) return null;
    const q = hubSearch.trim().toLowerCase();
    let out = q
      ? hubData.data.filter((r) =>
          (r.poNumber || '').toLowerCase().includes(q) ||
          (r.buyerName || '').toLowerCase().includes(q) ||
          (r.buyerPhone || '').toLowerCase().includes(q) ||
          (r.buyerBusinessName || '').toLowerCase().includes(q) ||
          (r.buyerFullAddress || '').toLowerCase().includes(q) ||
          (r.brandName || '').toLowerCase().includes(q) ||
          (r.shipmentStatus || '').toLowerCase().includes(q) ||
          (r.awbNumber || '').toLowerCase().includes(q) ||
          (r.logisticName || '').toLowerCase().includes(q) ||
          (r.latestScanPlace || '').toLowerCase().includes(q) ||
          (r.reachedAtDestinationPlace || '').toLowerCase().includes(q) ||
          (r.paymentMode || '').toLowerCase().includes(q)
        )
      : [...hubData.data];
    if (hubShipmentFilter.size > 0) {
      out = out.filter((r) => r.shipmentStatus && hubShipmentFilter.has(r.shipmentStatus));
    }
    if (hubBrandFilter.size > 0) {
      out = out.filter((r) => r.brandName && hubBrandFilter.has(r.brandName));
    }
    if (hubPaymentFilter.size > 0) {
      out = out.filter((r) => hubPaymentFilter.has(r.paymentMode || '__NONE__'));
    }
    if (hubAttemptFilter.size > 0) {
      out = out.filter((r) => {
        const a = r.deliveryAttempt || 0;
        for (const opt of hubAttemptFilter) {
          if (opt === '5+' ? a >= 5 : a === Number(opt)) return true;
        }
        return false;
      });
    }
    if (hubStuckOnly) {
      out = out.filter((r) => r.stillInDestinationHub === 'Yes');
    }
    if (hubMinDays !== '' && !Number.isNaN(Number(hubMinDays))) {
      const min = Number(hubMinDays);
      out = out.filter((r) => r.daysSinceReachedAtDestination != null && r.daysSinceReachedAtDestination >= min);
    }
    if (hubStuckBucketFilter.size > 0) {
      out = out.filter((r) => {
        const b = hubStuckBucketOf(r.daysSinceReachedAtDestination);
        return b != null && hubStuckBucketFilter.has(b);
      });
    }
    if (hubStuckSort !== 'none') {
      const dir = hubStuckSort === 'asc' ? 1 : -1;
      out = [...out].sort((a, b) => {
        const av = a.daysSinceReachedAtDestination;
        const bv = b.daysSinceReachedAtDestination;
        if (av == null && bv == null) return 0;
        if (av == null) return 1;   // unknowns always last
        if (bv == null) return -1;
        return (av - bv) * dir;
      });
    }
    return out;
  })();

  const toggleHubExpanded = (poNumber: string) => setHubExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(poNumber)) next.delete(poNumber); else next.add(poNumber);
    return next;
  });

  // Filtered + paged views of the RTO list
  // Always sorted by markedRejectedTime DESC (newest rejection first).
  const filteredRtoListRows = (() => {
    if (!rtoListData) return null;
    const q = rtoListSearch.trim().toLowerCase();
    let filtered = q
      ? rtoListData.filter((r) =>
          String(r.poNumber || '').toLowerCase().includes(q) ||
          (r.buyerPhone || '').toLowerCase().includes(q) ||
          (r.buyerName || '').toLowerCase().includes(q) ||
          (r.buyerBusinessName || '').toLowerCase().includes(q) ||
          (r.brandName || '').toLowerCase().includes(q) ||
          (r.shipmentStatus || '').toLowerCase().includes(q) ||
          (r.awbNumber || '').toLowerCase().includes(q) ||
          (r.logisticName || '').toLowerCase().includes(q) ||
          (r.finalFailureReason || '').toLowerCase().includes(q)
        )
      : [...rtoListData];

    if (rtoListAttemptFilter.size > 0) {
      filtered = filtered.filter((r) => {
        const attempts = r.deliveryAttempt || 0;
        for (const opt of rtoListAttemptFilter) {
          if (opt === '5+' ? attempts > 5 : attempts === Number(opt)) return true;
        }
        return false;
      });
    }

    if (rtoListPaymentFilter.size > 0) {
      filtered = filtered.filter((r) => rtoListPaymentFilter.has(r.paymentMode || '__NONE__'));
    }

    // Stable sort by markedRejectedTime DESC. Falls back to 0 epoch for any nulls.
    return filtered.sort((a, b) => {
      const ta = a.markedRejectedAt ? new Date(a.markedRejectedAt).getTime() : 0;
      const tb = b.markedRejectedAt ? new Date(b.markedRejectedAt).getTime() : 0;
      return tb - ta;
    });
  })();

  const rtoListPaged = (() => {
    if (!filteredRtoListRows) return null;
    const totalPages = Math.max(1, Math.ceil(filteredRtoListRows.length / PAGE_SIZE));
    const safePage = Math.min(Math.max(1, rtoListPage), totalPages);
    const startIdx = (safePage - 1) * PAGE_SIZE;
    const endIdx = Math.min(startIdx + PAGE_SIZE, filteredRtoListRows.length);
    return { totalPages, safePage, startIdx, endIdx, rows: filteredRtoListRows.slice(startIdx, endIdx) };
  })();

  const toggleStatusExpansion = (status: string) => {
    setExpandedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const openPivotDrill = async (
    status: string,
    deliveryStatus: string | null | undefined,
    month: number | null,
    day: number | null = null,
    week: number | null = null,
    weekLabel: string | null = null,
    initialPayment: string[] = [],
    zone: { zone: string; label: string; start: string; end: string; seller?: string; zoneStatus?: string; zoneAny?: boolean } | null = null
  ) => {
    setPivotDrillOpen(true);
    setPivotDrillStatus(status);
    setPivotDrillDelivery(deliveryStatus);
    setPivotDrillMonth(month);
    setPivotDrillDay(day);
    setPivotDrillWeek(week);
    setPivotDrillWeekLabel(weekLabel);
    setPivotDrillZone(zone ? { zone: zone.zone, label: zone.label, seller: zone.seller, zoneStatus: zone.zoneStatus } : null);
    setPivotDrillRows(null);
    setPivotDrillError(null);
    setPivotDrillSearch('');
    setPivotDrillPushedFilter('all');
    setPivotDrillRejectReasonFilter(new Set());
    setPivotDrillCourierFilter(new Set());
    setPivotDrillDeliveryFilter(new Set());
    setPivotDrillPaymentFilter(new Set(initialPayment));
    setPivotDrillSort(null);
    setPivotDrillLoading(true);
    try {
      const params = new URLSearchParams({ status, year: String(currentYear) });
      if (zone) {
        // Zone drill: filter via intercityDelivery, windowed by created_at.
        if (zone.zoneAny) params.append('zoneAny', '1');
        else params.append('zone', zone.zone);
        if (zone.seller) params.append('sellerName', zone.seller);
        if (zone.zoneStatus) params.append('zoneStatus', zone.zoneStatus);
        params.append('startDate', zone.start);
        params.append('endDate', zone.end);
      } else if (week !== null) {
        // Single-week drill: scope to that Postgres EXTRACT(WEEK), matching the weekly pivot.
        params.append('week', String(week));
      } else if (day !== null && month !== null) {
        // Single-day drill: scope to exactly that calendar date.
        const dateStr = `${currentYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        params.append('startDate', dateStr);
        params.append('endDate', dateStr);
      } else if (month !== null) {
        params.append('month', String(month));
      }
      if (deliveryStatus !== undefined) {
        params.append('deliveryStatus', deliveryStatus === null ? '__NULL__' : deliveryStatus);
      }
      const res = await fetch(`/api/order-list?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch');
      setPivotDrillRows(json.data);
      fetchScansBatch((json.data as OrderListRow[]).map((r) => r.poNumber).filter(Boolean));
    } catch (err) {
      setPivotDrillError(err instanceof Error ? err.message : 'Error loading orders');
    } finally {
      setPivotDrillLoading(false);
    }
  };

  // Order Anomalies chart → reuse the pivot drill modal, scoped to the clicked
  // status on the clicked day. Recharts hands the bar's data entry to onClick.
  const openAnomalyDrill = (status: string, entry: unknown) => {
    const payload = (entry && typeof entry === 'object' && 'payload' in entry
      ? (entry as { payload?: Record<string, unknown> }).payload
      : (entry as Record<string, unknown>)) || {};
    const dateStr = typeof payload.date === 'string' ? payload.date : null;
    const count = Number(payload[status] ?? 0);
    if (!dateStr || count <= 0) return;
    const [, mm, dd] = dateStr.split('-').map((n) => parseInt(n, 10));
    if (Number.isNaN(mm) || Number.isNaN(dd)) return;
    openPivotDrill(status, undefined, mm, dd);
  };

  // Generic helper: pull a Recharts bar/area/pie entry's original data row.
  const rechartsPayload = (entry: unknown): Record<string, unknown> =>
    (entry && typeof entry === 'object' && 'payload' in entry
      ? (entry as { payload?: Record<string, unknown> }).payload
      : (entry as Record<string, unknown>)) || {};

  // Payment mix chart → drill that day, pre-filtered to the clicked payment option.
  const openPaymentDrill = (option: string, entry: unknown) => {
    const payload = rechartsPayload(entry);
    const dateStr = typeof payload.date === 'string' ? payload.date : null;
    const raw = Number(payload[`${option}__raw`] ?? payload[option] ?? 0);
    if (!dateStr || raw <= 0) return;
    const [, mm, dd] = dateStr.split('-').map((n) => parseInt(n, 10));
    if (Number.isNaN(mm) || Number.isNaN(dd)) return;
    openPivotDrill('', undefined, mm, dd, null, null, [option]);
  };

  // Daily Order Trend → drill that day. statusFilter '' = all non-DRAFT (Orders sent),
  // 'DELIVERED,COMPLETED' for the delivered+completed series.
  const openTrendDrill = (statusFilter: string, entry: unknown) => {
    const payload = rechartsPayload(entry);
    const dateStr = typeof payload.date === 'string' ? payload.date
      : typeof payload.day === 'string' ? payload.day : null;
    if (!dateStr) return;
    const [, mm, dd] = dateStr.split('-').map((n) => parseInt(n, 10));
    if (Number.isNaN(mm) || Number.isNaN(dd)) return;
    openPivotDrill(statusFilter, undefined, mm, dd);
  };

  // Monthly charts (AOV, Cumulative Revenue, Monthly Revenue & Orders) → drill all orders that month.
  const openMonthDrill = (monthIndexOrName: number | string | null | undefined) => {
    let m: number | null = null;
    if (typeof monthIndexOrName === 'number') m = monthIndexOrName;
    else if (typeof monthIndexOrName === 'string') {
      const idx = MONTH_NAMES.findIndex((n) => n === monthIndexOrName || n.startsWith(monthIndexOrName));
      m = idx >= 0 ? idx + 1 : null;
    }
    if (!m) return;
    openPivotDrill('', undefined, m);
  };

  // RTO trend bar → open the RTO KPI modal scoped to the clicked bucket's date window.
  // RTO buckets on markedRejectedTime, so the window filters the RTO list by rejection date.
  const openRtoTrendDrill = (entry: unknown) => {
    const p = rechartsPayload(entry);
    const bucket = p.bucket != null ? String(p.bucket) : '';
    const label = typeof p.label === 'string' ? p.label : bucket;
    const count = Number(p.count ?? 0);
    if (!bucket || count <= 0) return;
    const pad = (n: number) => String(n).padStart(2, '0');
    let startDate = '';
    let endDate = '';
    if (rtoTrendGranularity === 'day') {
      startDate = bucket;
      endDate = bucket;
    } else if (rtoTrendGranularity === 'week') {
      // label like "W18 · 27 Apr" — derive the Monday start, span 7 days.
      const part = label.includes('·') ? label.split('·')[1].trim() : '';
      const d = part ? new Date(`${part} ${currentYear}`) : null;
      if (!d || isNaN(d.getTime())) return;
      const e = new Date(d.getTime());
      e.setDate(e.getDate() + 6);
      startDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      endDate = `${e.getFullYear()}-${pad(e.getMonth() + 1)}-${pad(e.getDate())}`;
    } else {
      // month (and custom, which the API buckets by month) — bucket is the month number.
      const m = parseInt(bucket, 10);
      if (Number.isNaN(m)) return;
      const last = new Date(currentYear, m, 0).getDate();
      startDate = `${currentYear}-${pad(m)}-01`;
      endDate = `${currentYear}-${pad(m)}-${pad(last)}`;
      if (rtoTrendGranularity === 'custom') {
        if (rtoTrendCustomFrom && rtoTrendCustomFrom > startDate) startDate = rtoTrendCustomFrom;
        if (rtoTrendCustomTo && rtoTrendCustomTo < endDate) endDate = rtoTrendCustomTo;
      }
    }
    setRtoKpiWindow({ startDate, endDate, label });
    setRtoKpiModal('count');
  };

  // Status donuts (Order Mix / Revenue Mix) → drill that status for the whole year.
  const openStatusDrill = (name: unknown) => {
    const status = typeof name === 'string' ? name : '';
    if (!status) return;
    openPivotDrill(status, undefined, null);
  };

  // Zone share charts → drill the POs in that Delhivery zone, within the zone date window.
  const openZoneDrill = (zoneName: unknown) => {
    const z = typeof zoneName === 'string' ? zoneName : '';
    if (!z) return;
    const { startDate, endDate } = resolveZoneRange();
    const label = `Zone ${z} · ${startDate} → ${endDate}`;
    openPivotDrill('', undefined, null, null, null, null, [], { zone: z, label, start: startDate, end: endDate });
  };

  // Zone Wise · Delhivery table → open the same order-list drill modal scoped to
  // the clicked cell. seller = full businessName (null = all sellers / footer),
  // zone = Delhivery zone (null = seller's grand total across all zones),
  // zoneStatus = the delivery-status column when a zone is expanded (null = all).
  const openZoneCellDrill = (
    seller: string | null,
    zone: string | null,
    zoneStatus: string | null,
  ) => {
    const { startDate, endDate } = resolveZoneRange();
    const parts: string[] = [];
    if (seller) parts.push(seller);
    parts.push(zone ? `Zone ${zone}` : 'All zones');
    if (zoneStatus) parts.push(zoneStatus);
    const label = `${parts.join(' · ')} · ${startDate} → ${endDate}`;
    openPivotDrill('', undefined, null, null, null, null, [], {
      zone: zone ?? '',
      label,
      start: startDate,
      end: endDate,
      seller: seller ?? undefined,
      zoneStatus: zoneStatus ?? undefined,
      zoneAny: !zone,
    });
  };

  const closePivotDrill = () => {
    setPivotDrillOpen(false);
    setPivotDrillStatus('');
    setPivotDrillDelivery(undefined);
    setPivotDrillMonth(null);
    setPivotDrillDay(null);
    setPivotDrillWeek(null);
    setPivotDrillWeekLabel(null);
    setPivotDrillZone(null);
    setPivotDrillRows(null);
    setPivotDrillError(null);
    setPivotDrillSearch('');
    setPivotDrillStateName(null);
    setPivotDrillBucketLabel(null);
    setPivotDrillMonthLabel(null);
    setGroupByDims([]);
    setScansByPo({});
  };

  // State-wise pivot drill: click a (state, month, status-bucket) cell → open the
  // same order-list drill modal, filtered to that exact slice. Mirrors the pivot's
  // own bucket definitions so the modal's row count reconciles with the cell.
  const STATEWISE_BUCKETS: Record<string, { status: string; exclude: string; label: string }> = {
    punched:   { status: '',                    exclude: '',                                       label: 'Punched' },
    delivered: { status: 'DELIVERED,COMPLETED', exclude: '',                                       label: 'Delivered' },
    rejected:  { status: 'REJECTED',            exclude: '',                                       label: 'Rejected' },
    cancelled: { status: 'CANCELLED',           exclude: '',                                       label: 'Cancelled' },
    pending:    { status: 'PENDING',            exclude: '',                                       label: 'Pending' },
    inprogress: { status: 'INPROGRESS',         exclude: '',                                       label: 'In-progress' },
    dispatched: { status: 'DISPATCHED',         exclude: '',                                       label: 'Dispatched' },
    inflight:  { status: '',                    exclude: 'DELIVERED,COMPLETED,REJECTED,CANCELLED,PENDING,INPROGRESS,DISPATCHED', label: 'In-flight' },
  };
  const STATEWISE_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const openStateMonthDrill = async (stateName: string | null, ym: string, bucketKey: string) => {
    const bucket = STATEWISE_BUCKETS[bucketKey];
    if (!bucket) return;
    const monthLabel = ym === '__total__'
      ? 'All months'
      : (() => { const [y, m] = ym.split('-'); return `${STATEWISE_MON[parseInt(m, 10) - 1]} '${y.slice(2)}`; })();

    setPivotDrillOpen(true);
    setPivotDrillStatus(bucket.status);
    setPivotDrillDelivery(undefined);
    setPivotDrillMonth(null);
    setPivotDrillDay(null);
    setPivotDrillWeek(null);
    setPivotDrillWeekLabel(null);
    setPivotDrillZone(null);
    setPivotDrillStateName(stateName ?? 'All states');
    setPivotDrillBucketLabel(bucket.label);
    setPivotDrillMonthLabel(monthLabel);
    setPivotDrillRows(null);
    setPivotDrillError(null);
    setPivotDrillSearch('');
    setPivotDrillPushedFilter('all');
    setPivotDrillRejectReasonFilter(new Set());
    setPivotDrillCourierFilter(new Set());
    setPivotDrillDeliveryFilter(new Set());
    setPivotDrillPaymentFilter(new Set());
    setPivotDrillSort(null);
    setPivotDrillLoading(true);
    try {
      const params = new URLSearchParams({ year: String(currentYear) });
      if (bucket.status) params.append('status', bucket.status);
      if (bucket.exclude) params.append('excludeStatus', bucket.exclude);
      if (stateName) params.append('state', stateName);
      if (ym === '__total__') {
        const { startDate, endDate } = resolveStateRange();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
      } else {
        const [y, m] = ym.split('-');
        const lastDay = new Date(parseInt(y, 10), parseInt(m, 10), 0).getDate();
        params.append('startDate', `${ym}-01`);
        params.append('endDate', `${ym}-${String(lastDay).padStart(2, '0')}`);
      }
      const brands = selectedBrandNames.join(',');
      if (brands) params.append('brand', brands);
      const res = await fetch(`/api/order-list?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch');
      setPivotDrillRows(json.data);
      fetchScansBatch((json.data as OrderListRow[]).map((r) => r.poNumber).filter(Boolean));
    } catch (err) {
      setPivotDrillError(err instanceof Error ? err.message : 'Error loading orders');
    } finally {
      setPivotDrillLoading(false);
    }
  };

  // Batch-load the last 3 scan locations for every PO in the drill, in one request,
  // so the table can show them as inline columns (Latest Scan 1/2/3) responsively.
  const fetchScansBatch = (poNumbers: string[]) => {
    setScansByPo({});
    if (!poNumbers.length) return;
    setScansLoading(true);
    fetch('/api/order-scans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poNumbers }),
    })
      .then(async (res) => {
        const json = await res.json();
        if (res.ok) setScansByPo(json.data || {});
      })
      .catch(() => { /* leave empty — cells render a dash */ })
      .finally(() => setScansLoading(false));
  };

  const fetchGoal = async () => {
    try {
      setGoalLoading(true);
      const response = await fetch(`/api/order-revenue-goal?year=${currentYear}`);
      if (!response.ok) throw new Error('Failed to fetch goal data');
      const result: RevenueGoal = await response.json();
      setGoalData(result);
      captureQuery('goal', result);
    } catch (err) {
      console.error('Goal fetch error:', err);
    } finally {
      setGoalLoading(false);
    }
  };

  useEffect(() => {
    fetchGoal();
  }, []);

  // Order funnel (created_at) — resolve range + fetch
  const resolveFunnelRange = (): { startDate: string | null; endDate: string | null } => {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    if (funnelRange === 'today') return { startDate: fmt(today), endDate: fmt(today) };
    if (funnelRange === '7d') {
      const start = new Date(today); start.setDate(start.getDate() - 6);
      return { startDate: fmt(start), endDate: fmt(today) };
    }
    if (funnelRange === '30d') {
      const start = new Date(today); start.setDate(start.getDate() - 29);
      return { startDate: fmt(start), endDate: fmt(today) };
    }
    if (funnelRange === '12mo') {
      const start = new Date(today); start.setMonth(start.getMonth() - 12);
      return { startDate: fmt(start), endDate: fmt(today) };
    }
    if (funnelRange === 'year') {
      return { startDate: `${currentYear}-01-01`, endDate: `${currentYear}-12-31` };
    }
    if (funnelRange === 'custom') {
      return { startDate: funnelCustomFrom || null, endDate: funnelCustomTo || null };
    }
    return { startDate: null, endDate: null }; // 'all' → no filter
  };

  const fetchFunnel = async () => {
    try {
      setFunnelLoading(true);
      const { startDate, endDate } = resolveFunnelRange();
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate)   params.append('endDate',   endDate);
      const url = `/api/order-funnel${params.toString() ? `?${params}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch funnel');
      const json: FunnelData = await res.json();
      setFunnelData(json);
    } catch (err) {
      console.error('Funnel fetch error:', err);
      setFunnelData(null);
    } finally {
      setFunnelLoading(false);
    }
  };

  useEffect(() => {
    fetchFunnel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funnelRange, funnelCustomFrom, funnelCustomTo]);

  // Resolve the active "Last N days / custom / all" preset to concrete YYYY-MM-DD bounds.
  const resolveSellerRange = (): { startDate: string | null; endDate: string | null } => {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const days = sellerRange === '7d' ? 7 : sellerRange === '14d' ? 14 : sellerRange === '15d' ? 15 : null;
    if (days !== null) {
      const start = new Date(today);
      start.setDate(start.getDate() - days + 1); // inclusive of today
      return { startDate: fmt(start), endDate: fmt(today) };
    }
    if (sellerRange === 'custom') {
      return {
        startDate: sellerCustomFrom || null,
        endDate: sellerCustomTo || null,
      };
    }
    return { startDate: null, endDate: null };
  };

  const fetchSeller = async () => {
    try {
      setSellerLoading(true);
      const { startDate, endDate } = resolveSellerRange();
      const params = new URLSearchParams({ year: String(currentYear) });
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (sellerMonths.length) params.append('months', sellerMonths.join(','));
      const response = await fetch(`/api/order-seller-wise?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch seller data');
      const result: SellerWiseData = await response.json();
      setSellerData(result);
      captureQuery('seller', result);
    } catch (err) {
      console.error('Seller fetch error:', err);
    } finally {
      setSellerLoading(false);
    }
  };

  useEffect(() => {
    fetchSeller();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerRange, sellerCustomFrom, sellerCustomTo, sellerMonths]);

  const fetchSlab = async () => {
    try {
      setSlabLoading(true);
      const { startDate, endDate } = resolveSellerRange();
      const params = new URLSearchParams({ year: String(currentYear) });
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (sellerMonths.length) params.append('months', sellerMonths.join(','));
      const response = await fetch(`/api/order-seller-slab-monthly?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch slab data');
      const result: SellerSlabData = await response.json();
      setSlabData(result);
      captureQuery('slab', result);
    } catch (err) {
      console.error('Slab fetch error:', err);
    } finally {
      setSlabLoading(false);
    }
  };

  useEffect(() => {
    fetchSlab();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerRange, sellerCustomFrom, sellerCustomTo, sellerMonths]);

  // Geography (state-wise map) range + fetcher
  const resolveStateRange = (): { startDate: string | null; endDate: string | null } => {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const days = stateRange === '7d' ? 7 : stateRange === '14d' ? 14 : stateRange === '15d' ? 15 : null;
    if (days !== null) {
      const start = new Date(today);
      start.setDate(start.getDate() - days + 1);
      return { startDate: fmt(start), endDate: fmt(today) };
    }
    if (stateRange === 'custom') {
      return { startDate: stateCustomFrom || null, endDate: stateCustomTo || null };
    }
    return { startDate: null, endDate: null };
  };

  const fetchStateData = async () => {
    try {
      setStateLoading(true);
      const { startDate, endDate } = resolveStateRange();
      const params = new URLSearchParams({ year: String(currentYear) });
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      const sids = resolveSelectedSellerIds();
      if (sids) params.append('sellerIds', sids);
      if (stateMonths.length) params.append('months', stateMonths.join(','));
      const res = await fetch(`/api/order-by-state?${params.toString()}`);
      if (!res.ok) throw new Error('failed');
      const json = await res.json();
      setStateData(json.data);
      captureQuery('geoState', json);
    } catch (err) {
      console.error('State fetch error:', err);
      setStateData([]);
    } finally {
      setStateLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'geography') return;
    fetchStateData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, stateRange, stateCustomFrom, stateCustomTo, selectedBrandNames, sellerBrandList, stateMonths]);

  const fetchDistrictData = async () => {
    try {
      setDistrictLoading(true);
      const { startDate, endDate } = resolveStateRange();
      const params = new URLSearchParams({ year: String(currentYear) });
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (districtSelectedState) params.append('state', districtSelectedState);
      const sids = resolveSelectedSellerIds();
      if (sids) params.append('sellerIds', sids);
      if (stateMonths.length) params.append('months', stateMonths.join(','));
      const res = await fetch(`/api/order-by-district?${params.toString()}`);
      if (!res.ok) throw new Error('failed');
      const json = await res.json();
      setDistrictData(json.data);
      captureQuery('geoDistrict', json);
    } catch (err) {
      console.error('District fetch error:', err);
      setDistrictData([]);
    } finally {
      setDistrictLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'geography') return;
    if (geoMode !== 'district') return;
    fetchDistrictData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, geoMode, districtSelectedState, stateRange, stateCustomFrom, stateCustomTo, selectedBrandNames, sellerBrandList, stateMonths]);

  // Seller brand list — fetched once when entering Geography tab
  const fetchSellerBrandList = async () => {
    try {
      const { startDate, endDate } = resolveStateRange();
      const params = new URLSearchParams({ year: String(currentYear) });
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (stateMonths.length) params.append('months', stateMonths.join(','));
      const res = await fetch(`/api/seller-brand-list?${params.toString()}`);
      if (!res.ok) throw new Error('failed');
      const json = await res.json();
      setSellerBrandList(json.data);
    } catch (err) {
      console.error('Seller brand list fetch error:', err);
      setSellerBrandList([]);
    }
  };

  useEffect(() => {
    if (activeTab !== 'geography') return;
    fetchSellerBrandList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, stateRange, stateCustomFrom, stateCustomTo, stateMonths]);



  // Brand × State table
  const fetchBrandStateData = async () => {
    try {
      setBrandStateLoading(true);
      const { startDate, endDate } = resolveStateRange();
      const params = new URLSearchParams({ year: String(currentYear) });
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (districtSelectedState) params.append('state', districtSelectedState);
      const sids = resolveSelectedSellerIds();
      if (sids) params.append('sellerIds', sids);
      if (stateMonths.length) params.append('months', stateMonths.join(','));
      const res = await fetch(`/api/order-by-brand-state?${params.toString()}`);
      if (!res.ok) throw new Error('failed');
      const json = await res.json();
      setBrandStateData(json.data);
      captureQuery('brandState', json);
    } catch (err) {
      console.error('Brand-state fetch error:', err);
      setBrandStateData([]);
    } finally {
      setBrandStateLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'geography') return;
    fetchBrandStateData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, stateRange, stateCustomFrom, stateCustomTo, selectedBrandNames, sellerBrandList, districtSelectedState, stateMonths]);

  // State × Month × status pivot (State wise tab)
  const fetchStateMonthData = async () => {
    try {
      setStateMonthLoading(true);
      const { startDate, endDate } = resolveStateRange();
      const params = new URLSearchParams({ year: String(currentYear) });
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      const sids = resolveSelectedSellerIds();
      if (sids) params.append('sellerIds', sids);
      if (stateMonths.length) params.append('months', stateMonths.join(','));
      const res = await fetch(`/api/order-status-by-state-month?${params.toString()}`);
      if (!res.ok) throw new Error('failed');
      const json = await res.json();
      setStateMonthData(json.data);
      captureQuery('stateMonth', json);
      setStateMonthMonths(json.months || []);
    } catch (err) {
      console.error('State-month fetch error:', err);
      setStateMonthData([]);
      setStateMonthMonths([]);
    } finally {
      setStateMonthLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'geography') return;
    if (geographySubTab !== 'statewise') return;
    fetchStateMonthData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, geographySubTab, stateRange, stateCustomFrom, stateCustomTo, selectedBrandNames, sellerBrandList, stateMonths]);

  // Reverse alias: state-map's ST_NM (e.g. "Andaman & Nicobar") → DB state name.
  const GEO_TO_DB_STATE: Record<string, string> = {
    'Andaman & Nicobar': 'Andaman and Nicobar Islands',
    'Jammu & Kashmir': 'Jammu and Kashmir',
  };

  const handleStateMapClick = (geoStateName: string) => {
    const dbName = GEO_TO_DB_STATE[geoStateName] ?? geoStateName;
    setDistrictSelectedState(dbName);
    setGeoMode('district');
  };

  useEffect(() => { setDrillPage(1); }, [drillStatus, drillMonth, drillSearch]);
  useEffect(() => { setSellerTablePage(1); }, [sellerSearch]);
  useEffect(() => { setSellerDrillPage(1); }, [sellerDrillId, sellerDrillStartDate, sellerDrillEndDate, sellerDrillStatus, sellerDrillPo]);

  const openDrill = async (status: string, month: number | null) => {
    setDrillStatus(status);
    setDrillMonth(month);
    setDrillRows(null);
    setDrillError(null);
    setDrillSearch('');
    setDrillLoading(true);
    try {
      const params = new URLSearchParams({ status, year: String(currentYear) });
      if (month !== null) params.append('month', String(month));
      const res = await fetch(`/api/order-list?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch');
      setDrillRows(json.data);
    } catch (err) {
      setDrillError(err instanceof Error ? err.message : 'Error loading orders');
    } finally {
      setDrillLoading(false);
    }
  };

  const closeDrill = () => {
    setDrillStatus(null);
    setDrillMonth(null);
    setDrillRows(null);
    setDrillError(null);
    setDrillSearch('');
  };

  const filteredDrillRows = (() => {
    if (!drillRows) return null;
    const q = drillSearch.trim().toLowerCase();
    if (!q) return drillRows;
    return drillRows.filter(r =>
      (r.poNumber || '').toLowerCase().includes(q) ||
      (r.buyerPhone || '').toLowerCase().includes(q) ||
      (r.sellerPhone || '').toLowerCase().includes(q)
    );
  })();

  const formatDateTime = (s: string | null) => {
    if (!s) return '—';
    try {
      const d = new Date(s);
      return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } catch {
      return s;
    }
  };

  // Render an AWB number as a link to its Delhivery forward-shipment tracking page.
  const awbLink = (awb: string | null | undefined) =>
    awb ? (
      <a
        href={`https://one.delhivery.com/shipments/forward/${encodeURIComponent(awb)}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-purple-700 hover:text-purple-900 hover:underline cursor-pointer"
        title="Track this shipment on Delhivery"
      >
        {awb}
      </a>
    ) : (
      <span className="text-slate-400">—</span>
    );

  // Render one "Latest Scan N" table cell (idx 0 = most recent) from the batch-loaded scans.
  const renderScanCell = (poNumber: string, idx: number) => {
    const scans = scansByPo[poNumber];
    const s = scans?.[idx];
    const sub = s ? [s.status, s.activity].filter((v) => v && String(v).trim() !== '').join(' · ') : '';
    return (
      <td className="px-2.5 py-2 align-top bg-indigo-50/20 min-w-[180px]">
        {!scans ? (
          <span className="text-slate-400">{scansLoading ? '…' : '—'}</span>
        ) : !s ? (
          <span className="text-slate-400">—</span>
        ) : (
          <div className="max-w-[230px]">
            <div className="flex items-start gap-1.5">
              <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${idx === 0 ? 'bg-purple-500 shadow-[0_0_6px_rgba(168,85,247,0.7)]' : 'bg-slate-300'}`} />
              <div className="min-w-0">
                {sub
                  ? <div className="font-bold text-slate-900 text-[11px] leading-tight break-words">{sub}</div>
                  : <div className="font-bold text-slate-400 text-[11px] leading-tight">—</div>}
                <div className="text-[10px] text-slate-600 break-words">{s.location && s.location.trim() ? s.location : '—'}</div>
                <div className="text-[10px] text-slate-500">{s.date ? formatDateTime(s.date) : '—'}</div>
              </div>
            </div>
          </div>
        )}
      </td>
    );
  };

  // Map an order status to the underlying DB column that backs "statusMarkedTime".
  // Mirrors the CASE in app/api/sla-alerts-details/route.ts and inprogress-aging-details/route.ts.
  const statusMarkedFieldFor = (status: string | null | undefined): string => {
    switch ((status || '').toUpperCase()) {
      case 'REJECTED':    return 'markedRejectedTime';
      case 'CANCELLED':   return 'markedCancelledTime';
      case 'DELIVERED':   return 'markedDeliveredTime';
      case 'COMPLETED':   return 'markedCompletedTime';
      case 'DISPATCHED':  return 'markedDispatchedTime';
      case 'IN_TRANSIT':
      case 'INTRANSIT':   return 'markedInTransitTime';
      case 'IN_PROGRESS':
      case 'INPROGRESS':  return 'markedInProgressTime';
      case 'PARTIAL':     return 'markedPartialTime';
      case 'PENDING':     return 'markedPendingTime';
      default:            return 'statusMarkedTime';
    }
  };

  // Header label for the Status Marked Time column. If every visible row shares
  // one status, use that exact DB column name; otherwise fall back to the
  // generic "Status Marked Time".
  const statusMarkedHeaderFor = (rows: Array<{ orderStatus?: string | null; status?: string | null }> | null | undefined): string => {
    if (!rows || rows.length === 0) return 'Status Marked Time';
    const set = new Set<string>();
    for (const r of rows) {
      const s = (r.orderStatus ?? r.status ?? '').toUpperCase();
      if (s) set.add(s);
      if (set.size > 1) return 'Status Marked Time';
    }
    if (set.size === 1) return statusMarkedFieldFor([...set][0]);
    return 'Status Marked Time';
  };

  const openSellerDrill = async (seller: SellerRow) => {
    setSellerDrillId(seller.sellerId);
    setSellerDrillName(seller.sellerBusinessName || '—');
    setSellerDrillPhone(seller.sellerPhone || '—');
    setSellerDrillRows(null);
    setSellerDrillError(null);
    // Pre-fill the modal's date filters from the Seller-tab range so the drilldown
    // immediately matches the parent table's view.
    const { startDate: rangeStart, endDate: rangeEnd } = resolveSellerRange();
    setSellerDrillStartDate(rangeStart || '');
    setSellerDrillEndDate(rangeEnd || '');
    setSellerDrillStatus('all');
    setSellerDrillPo('');
    setSellerDrillLoading(true);
    try {
      const params = new URLSearchParams({ sellerId: seller.sellerId, year: String(currentYear) });
      if (rangeStart) params.append('startDate', rangeStart);
      if (rangeEnd) params.append('endDate', rangeEnd);
      const res = await fetch(`/api/order-by-seller?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch');
      setSellerDrillRows(json.data);
    } catch (err) {
      setSellerDrillError(err instanceof Error ? err.message : 'Error loading orders');
    } finally {
      setSellerDrillLoading(false);
    }
  };

  const closeSellerDrill = () => {
    setSellerDrillId(null);
    setSellerDrillName('');
    setSellerDrillPhone('');
    setSellerDrillRows(null);
    setSellerDrillError(null);
    setSellerDrillStartDate('');
    setSellerDrillEndDate('');
    setSellerDrillStatus('all');
    setSellerDrillPo('');
  };

  const sellerDrillStatuses = (() => {
    if (!sellerDrillRows) return [] as string[];
    const set = new Set(sellerDrillRows.map(r => r.status));
    return Array.from(set).sort();
  })();

  const filteredSellerDrillRows = (() => {
    if (!sellerDrillRows) return null;
    const po = sellerDrillPo.trim().toLowerCase();
    return sellerDrillRows.filter(r => {
      if (sellerDrillStatus !== 'all' && r.status !== sellerDrillStatus) return false;
      if (po && !(r.poNumber || '').toLowerCase().includes(po)) return false;
      if (sellerDrillStartDate) {
        const d = r.markedPendingTime?.slice(0, 10);
        if (!d || d < sellerDrillStartDate) return false;
      }
      if (sellerDrillEndDate) {
        const d = r.markedPendingTime?.slice(0, 10);
        if (!d || d > sellerDrillEndDate) return false;
      }
      return true;
    });
  })();

  const sellerDrillSummary = (() => {
    if (!filteredSellerDrillRows) return null;
    const total = filteredSellerDrillRows.length;
    const amount = filteredSellerDrillRows.reduce((s, r) => s + (r.amount || 0), 0);
    const avg = total > 0 ? amount / total : 0;
    const byStatus: Record<string, number> = {};
    for (const r of filteredSellerDrillRows) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    }
    return { total, amount, avg, byStatus };
  })();

  const drillPaged = (() => {
    if (!filteredDrillRows) return null;
    const totalPages = Math.max(1, Math.ceil(filteredDrillRows.length / PAGE_SIZE));
    const safePage = Math.min(Math.max(1, drillPage), totalPages);
    const startIdx = (safePage - 1) * PAGE_SIZE;
    const endIdx = Math.min(startIdx + PAGE_SIZE, filteredDrillRows.length);
    return { totalPages, safePage, startIdx, endIdx, rows: filteredDrillRows.slice(startIdx, endIdx) };
  })();

  const sellerDrillPaged = (() => {
    if (!filteredSellerDrillRows) return null;
    const totalPages = Math.max(1, Math.ceil(filteredSellerDrillRows.length / PAGE_SIZE));
    const safePage = Math.min(Math.max(1, sellerDrillPage), totalPages);
    const startIdx = (safePage - 1) * PAGE_SIZE;
    const endIdx = Math.min(startIdx + PAGE_SIZE, filteredSellerDrillRows.length);
    return { totalPages, safePage, startIdx, endIdx, rows: filteredSellerDrillRows.slice(startIdx, endIdx) };
  })();

  const pivotSortValue = (r: OrderListRow, key: string): number | string | null => {
    const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
    const dt = (v: unknown) => (v == null || v === '' ? null : new Date(v as string).getTime());
    switch (key) {
      case 'pushed': return r.pushedStatus ?? '';
      case 'poNumber': { const n = Number(r.poNumber); return Number.isFinite(n) ? n : (r.poNumber ?? ''); }
      case 'status': return r.orderStatus ?? r.status ?? '';
      case 'itemTotal': return num(r.itemTotal);
      case 'grossAmount': return num(r.grossAmount);
      case 'orderMarginDiscount': return num(r.orderMarginDiscount);
      case 'paidAmount': return num(r.paidAmount);
      case 'coupon': return num(r.CoupanAmount);
      case 'sellerDiscount': return num(r.discountBySeller);
      case 'badhoDiscount': return num(r.PaymentOptionDiscountByBadho);
      case 'wallet': return num(r.appliedWalletAmount);
      case 'paymentOption': return r.PaymentOption ?? '';
      case 'paymentDate': return dt(r.paymentDate);
      case 'paymentEvent': return r.paymentEvent ?? '';
      case 'awb': return r.awbNumber ?? '';
      case 'courier': return r.courierName ?? '';
      case 'deliveryStatus': return r.deliveryStatus ?? '';
      case 'cod': return num(r.codAmountToBeCollected);
      case 'buyerPhone': return r.buyerPhone ?? '';
      case 'buyerBusiness': return r.buyerBusinessName ?? '';
      case 'sellerPhone': return r.sellerPhone ?? '';
      case 'sellerBusiness': return r.sellerBusinessName ?? '';
      case 'markedPending': return dt(r.MarkedpendingTime ?? r.markedPendingTime);
      case 'refundInit': return dt(r.RefundIntiatedTime);
      case 'refundDone': return dt(r.RefundCompletedTime);
      case 'refundAmount': return num(r.RefundAmount);
      case 'rejectReason': return r.rejectReason ?? '';
      case 'rejectedBy': return r.rejectedBy ?? '';
      case 'reasonByBadho': return r.reasonAddedByBadhoTeam ?? '';
      case 'buyerFullAddress': return r.buyerFullAddress ?? '';
      case 'statusDuration': return r.statusDurationSec ?? null;
      case 'statusMarkedTime': return dt(r.statusMarkedTime);
      default: return '';
    }
  };

  const togglePivotSort = (key: string) => {
    setPivotDrillSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'asc' };
      if (prev.direction === 'asc') return { key, direction: 'desc' };
      return null;
    });
  };

  const pivotRejectReasonOptions = (() => {
    if (!pivotDrillRows) return [] as Array<{ value: string; label: string; count: number }>;
    const counts = new Map<string, number>();
    for (const r of pivotDrillRows) {
      const v = (r.rejectReason || '').trim();
      if (v) counts.set(v, (counts.get(v) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([value, count]) => ({ value, label: value, count }));
  })();

  const pivotPushedCounts = (() => {
    const total = pivotDrillRows?.length ?? 0;
    let pushed = 0;
    if (pivotDrillRows) {
      for (const r of pivotDrillRows) {
        if ((r.pushedStatus || 'Not Pushed') === 'Pushed') pushed += 1;
      }
    }
    return { all: total, pushed, notPushed: total - pushed };
  })();

  // Build a generic option list (value, label, count) from a row accessor
  const buildOptions = <T,>(rows: T[] | null, accessor: (r: T) => string | null | undefined) => {
    if (!rows) return [] as Array<{ value: string; label: string; count: number }>;
    const counts = new Map<string, number>();
    for (const r of rows) {
      const k = accessor(r) || '__NONE__';
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([value, count]) => ({
        value,
        label: value === '__NONE__' ? 'Unspecified' : value,
        count,
      }));
  };
  const pivotPaymentOptions  = buildOptions(pivotDrillRows, (r) => r.PaymentOption);
  const pivotCourierOptions  = buildOptions(pivotDrillRows, (r) => r.courierName);
  const pivotDeliveryOptions = buildOptions(pivotDrillRows, (r) => r.deliveryStatus);

  const pivotDrillHasActiveFilters =
    pivotDrillSearch.trim() !== '' ||
    pivotDrillPushedFilter !== 'all' ||
    pivotDrillRejectReasonFilter.size > 0 ||
    pivotDrillPaymentFilter.size > 0 ||
    pivotDrillCourierFilter.size > 0 ||
    pivotDrillDeliveryFilter.size > 0;

  const resetPivotDrillFilters = () => {
    setPivotDrillSearch('');
    setPivotDrillPushedFilter('all');
    setPivotDrillRejectReasonFilter(new Set());
    setPivotDrillPaymentFilter(new Set());
    setPivotDrillCourierFilter(new Set());
    setPivotDrillDeliveryFilter(new Set());
    setPivotDrillSort(null);
  };

  const filteredPivotDrillRows = (() => {
    if (!pivotDrillRows) return null;
    let rows: OrderListRow[] = pivotDrillRows;
    const q = pivotDrillSearch.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          (r.poNumber || '').toLowerCase().includes(q) ||
          (r.buyerPhone || '').toLowerCase().includes(q) ||
          (r.sellerPhone || '').toLowerCase().includes(q)
      );
    }
    if (pivotDrillPushedFilter !== 'all') {
      rows = rows.filter((r) => (r.pushedStatus || 'Not Pushed') === pivotDrillPushedFilter);
    }
    if (pivotDrillRejectReasonFilter.size > 0) {
      rows = rows.filter((r) => pivotDrillRejectReasonFilter.has((r.rejectReason || '').trim()));
    }
    if (pivotDrillPaymentFilter.size > 0) {
      rows = rows.filter((r) => pivotDrillPaymentFilter.has(r.PaymentOption || '__NONE__'));
    }
    if (pivotDrillCourierFilter.size > 0) {
      rows = rows.filter((r) => pivotDrillCourierFilter.has(r.courierName || '__NONE__'));
    }
    if (pivotDrillDeliveryFilter.size > 0) {
      rows = rows.filter((r) => pivotDrillDeliveryFilter.has(r.deliveryStatus || '__NONE__'));
    }
    if (pivotDrillSort) {
      const { key, direction } = pivotDrillSort;
      rows = [...rows].sort((a, b) => {
        const av = pivotSortValue(a, key);
        const bv = pivotSortValue(b, key);
        if (av === null && bv === null) return 0;
        if (av === null) return 1; // nulls last
        if (bv === null) return -1;
        let cmp = 0;
        if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
        else cmp = String(av).localeCompare(String(bv));
        return direction === 'asc' ? cmp : -cmp;
      });
    }
    return rows;
  })();

  const rtoSellersPaged = (() => {
    if (!rtoData) return null;
    const total = rtoData.topSellers.length;
    const totalPages = Math.max(1, Math.ceil(total / RTO_PAGE_SIZE));
    const safePage = Math.min(Math.max(1, rtoSellerPage), totalPages);
    const startIdx = (safePage - 1) * RTO_PAGE_SIZE;
    const endIdx = Math.min(startIdx + RTO_PAGE_SIZE, total);
    return { total, totalPages, safePage, startIdx, endIdx, rows: rtoData.topSellers.slice(startIdx, endIdx) };
  })();

  const rtoStatesPaged = (() => {
    if (!rtoData) return null;
    const total = rtoData.topStates.length;
    const totalPages = Math.max(1, Math.ceil(total / RTO_PAGE_SIZE));
    const safePage = Math.min(Math.max(1, rtoStatePage), totalPages);
    const startIdx = (safePage - 1) * RTO_PAGE_SIZE;
    const endIdx = Math.min(startIdx + RTO_PAGE_SIZE, total);
    return { total, totalPages, safePage, startIdx, endIdx, rows: rtoData.topStates.slice(startIdx, endIdx) };
  })();

  const timestamp = mounted ? new Date().toLocaleString() : '';

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="text-purple-200 text-sm">Checking access…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8 relative overflow-hidden">
      {/* Animated background orbs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse animation-delay-2000"></div>

      <div className="w-[95%] mx-auto relative z-10">
        {/* Top bar — back to /badho + signed-in user + logout */}
        <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
          <Link
            href="/badho"
            className="text-xs font-semibold text-purple-200 hover:text-white px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
          >
            ← All dashboards
          </Link>
          <div className="flex items-center gap-3">
          {employeeName && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                {employeeName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <span className="text-purple-100 font-medium">{employeeName}</span>
            </div>
          )}
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-rose-200 text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {isLoggingOut ? 'Signing out…' : 'Logout'}
          </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-5 flex gap-1 p-1 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl w-fit">
          {([
            { key: 'dashboard', label: 'Dashboard' },
            { key: 'trend', label: 'Trend' },
            { key: 'rto', label: 'RTO' },
            { key: 'seller', label: 'Seller wise' },
            { key: 'geography', label: 'Geography' },
            { key: 'zone', label: 'Zone Wise' },
            { key: 'margin', label: 'P&L' },
            { key: 'alert', label: 'Alert' },
          ] as const).map((tab) => {
            const active = activeTab === tab.key;
            const isAlert = tab.key === 'alert';
            const alertCount = (alertBrandData?.grandTotal?.count ?? 0) + (agingData?.grand?.poCount ?? 0);
            const hasAlerts = isAlert && alertCount > 0;

            if (isAlert) {
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative px-4 py-1.5 rounded-lg text-sm font-bold transition-all duration-300 inline-flex items-center gap-1.5 ${
                    active
                      ? 'bg-gradient-to-r from-rose-500 via-red-500 to-orange-500 text-white shadow-[0_0_28px_rgba(244,63,94,0.7),inset_0_0_18px_rgba(251,113,133,0.4)]'
                      : hasAlerts
                      ? 'bg-gradient-to-r from-rose-500/30 via-red-500/30 to-orange-500/30 text-rose-100 hover:from-rose-500/50 hover:via-red-500/50 hover:to-orange-500/50 hover:text-white border border-rose-400/50 shadow-[0_0_18px_rgba(244,63,94,0.4)] animate-pulse-glow'
                      : 'text-purple-200 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={hasAlerts ? 'animate-bell-ring' : ''}
                    aria-hidden="true"
                  >
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                  </svg>
                  <span>{tab.label}</span>
                  {alertCount > 0 && (
                    <span className="relative inline-flex">
                      <span className="absolute inset-0 rounded-full bg-rose-400 animate-ping opacity-75" />
                      <span className="relative inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-extrabold tabular-nums border border-white/40 shadow-lg">
                        {alertCount}
                      </span>
                    </span>
                  )}
                </button>
              );
            }

            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-300 ${
                  active
                    ? 'bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 text-white shadow-[0_0_24px_rgba(217,70,239,0.55),inset_0_0_18px_rgba(168,85,247,0.5)]'
                    : 'text-purple-200 hover:bg-white/10 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === 'dashboard' && (
        <>
        {/* Revenue Goal — radial gauge */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden mb-8 transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25),inset_0_0_30px_rgba(168,85,247,0.12)]">
          <div className="px-8 py-6 border-b border-white/10 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white">GMV Goal — {currentMonthYear}</h2>
              <p className="text-white/60 text-sm mt-1">Sum of order amount where status is DELIVERED or COMPLETED, against the monthly goal</p>
            </div>
            {queryBtn('goal', 'GMV Goal')}
          </div>
          <div className="p-8">
            {goalLoading ? (
              <div className="py-12 text-center text-white/60">Loading...</div>
            ) : !goalData ? (
              <div className="py-12 text-center text-white/60">No data</div>
            ) : (() => {
              const overshoot = goalData.achievePct > 100;
              const chartData = [{ name: 'Achieved', value: Math.min(animAchievePct, 100), fill: overshoot ? '#10b981' : '#a855f7' }];
              const remainingLabel = overshoot
                ? `Exceeded by ${formatAmount(animAbove)}`
                : `${formatAmount(animRemaining)} to go`;
              return (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
                  <div className="lg:col-span-1 relative">
                    <ResponsiveContainer width="100%" height={260}>
                      <RadialBarChart
                        innerRadius="75%"
                        outerRadius="100%"
                        data={chartData}
                        startAngle={90}
                        endAngle={-270}
                      >
                        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                        <RadialBar background={{ fill: 'rgba(255,255,255,0.08)' }} dataKey="value" cornerRadius={12} isAnimationActive={false} />
                      </RadialBarChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <p className="text-white/60 text-xs uppercase tracking-wider">{currentMonth} Achieved</p>
                      <p className="text-5xl font-bold text-white tabular-nums">{animAchievePct.toFixed(2)}%</p>
                      <p className="text-white/60 text-xs mt-1">{remainingLabel}</p>
                    </div>
                  </div>
                  <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <button
                      type="button"
                      onClick={() => openPivotDrill('DELIVERED,COMPLETED', undefined, now.getMonth() + 1)}
                      className="text-left bg-white/5 border border-white/10 rounded-xl p-5 transition-all duration-300 hover:bg-white/15 hover:border-fuchsia-400/50 hover:shadow-[0_0_30px_rgba(217,70,239,0.3)] hover:scale-[1.02] cursor-pointer focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                    >
                      <p className="text-white/60 text-xs uppercase tracking-wider mb-2">{currentMonth} Achieved</p>
                      <p className="text-3xl font-bold text-white tabular-nums">{formatAmount(animAchieved)}</p>
                      <p className="text-white/50 text-xs mt-1">{goalData.orders.toLocaleString()} orders</p>
                      {goalData.prior && (() => {
                        const d = goalData.deltaPct;
                        const hasDelta = d !== null && d !== undefined;
                        const up = (d ?? 0) >= 0;
                        const spanLabel = goalData.prior.sameSpan && goalData.prior.asOfDay
                          ? `${MONTH_NAMES[goalData.prior.month - 1]} 1–${goalData.prior.asOfDay}`
                          : MONTH_NAMES[goalData.prior.month - 1];
                        return (
                          <p className={`text-xs mt-1 tabular-nums ${!hasDelta ? 'text-white/50' : up ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {hasDelta && <span className="font-semibold">{up ? '▲' : '▼'} {Math.abs(d as number).toFixed(1)}% </span>}
                            vs {formatAmount(goalData.prior.achieved)}
                            <span className="text-white/40"> · {spanLabel}</span>
                          </p>
                        );
                      })()}
                      <p className="text-[10px] text-fuchsia-300/70 mt-1">click for details →</p>
                    </button>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-5 transition-all duration-300 hover:bg-white/15 hover:border-fuchsia-400/50 hover:shadow-[0_0_30px_rgba(217,70,239,0.3)] hover:scale-[1.02]">
                      <p className="text-white/60 text-xs uppercase tracking-wider mb-2">{currentMonth} Goal</p>
                      <p className="text-3xl font-bold text-white tabular-nums">{formatAmount(animGoal)}</p>
                      <p className="text-white/50 text-xs mt-1">DELIVERED + COMPLETED</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-5 transition-all duration-300 hover:bg-white/15 hover:border-fuchsia-400/50 hover:shadow-[0_0_30px_rgba(217,70,239,0.3)] hover:scale-[1.02]">
                      <p className="text-white/60 text-xs uppercase tracking-wider mb-2">{overshoot ? 'Above Goal' : 'Remaining'}</p>
                      <p className={`text-3xl font-bold tabular-nums ${overshoot ? 'text-emerald-400' : 'text-white'}`}>
                        {formatAmount(overshoot ? animAbove : animRemaining)}
                      </p>
                      <p className="text-white/50 text-xs mt-1">{overshoot ? `beyond ${formatAmount(goalData.goal)}` : `to hit ${formatAmount(goalData.goal)}`}</p>
                    </div>
                    <div className="sm:col-span-2 bg-white/5 border border-white/10 rounded-xl p-4 transition-all duration-300 hover:bg-white/15 hover:border-fuchsia-400/50 hover:shadow-[0_0_40px_rgba(217,70,239,0.3)]">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-white/70 text-sm font-semibold">Progress to {formatAmount(animGoal)}</p>
                        <p className="text-white/70 text-sm tabular-nums">{animAchievePct.toFixed(2)}%</p>
                      </div>
                      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${overshoot ? 'bg-emerald-500' : 'bg-purple-500'}`}
                          style={{ width: `${Math.min(animAchievePct, 100)}%` }}
                        />
                      </div>
                    </div>
                    <CountdownCalendar compact={true} />
                  </div>
                </div>
              );
            })()}
          </div>
        </div>


        {/* Monthly Breakdown — Status × Delivery Status (expandable pivot) */}
        <div className="mt-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25),inset_0_0_30px_rgba(168,85,247,0.12)]">
          <div className="px-8 py-6 border-b border-white/10 bg-white/5 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white">Monthly Breakdown by Order Status</h2>
              <p className="text-purple-300 text-sm mt-1">
                {pivotGranularity === 'month'
                  ? `Click any status to drill into its delivery sub-statuses — ${currentYear}`
                  : pivotGranularity === 'week'
                  ? `Week-by-week — ${currentYear} (ISO week)`
                  : `Day-by-day — ${MONTH_NAMES[pivotDayMonth - 1]} ${currentYear}`}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex gap-1 p-1 bg-white/5 border border-white/10 rounded-xl">
                {(['month', 'week', 'day'] as const).map((g) => {
                  const active = pivotGranularity === g;
                  return (
                    <button
                      key={g}
                      onClick={() => setPivotGranularity(g)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        active
                          ? 'bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 text-white shadow-[0_0_18px_rgba(217,70,239,0.5)]'
                          : 'text-purple-200 hover:bg-white/10'
                      }`}
                    >
                      {g === 'month' ? 'Month' : g === 'week' ? 'Week' : 'Day'}
                    </button>
                  );
                })}
              </div>
              {pivotGranularity !== 'day' && (
                <MonthMultiSelect selected={pivotMonths} onChange={setPivotMonths} year={currentYear} />
              )}
              {pivotGranularity === 'day' && (
                <select
                  value={pivotDayMonth}
                  onChange={(e) => setPivotDayMonth(parseInt(e.target.value))}
                  className="px-3 py-1.5 text-xs font-semibold bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                >
                  {MONTH_NAMES.map((name, i) => (
                    <option key={i} value={i + 1} className="bg-slate-900">{name} {currentYear}</option>
                  ))}
                </select>
              )}
              <button
                onClick={() => setShowPivotQuery((v) => !v)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                  showPivotQuery
                    ? 'bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 text-white border-transparent shadow-[0_0_18px_rgba(217,70,239,0.5)]'
                    : 'text-purple-200 border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                {showPivotQuery ? 'Hide Query' : 'View Query'}
              </button>
            </div>
            {pivotGranularity === 'month' && pivotData && (
              <div className="flex items-center gap-6 text-sm">
                <div className="text-right">
                  <div className="text-purple-300">Total Orders</div>
                  <div className="text-white font-bold text-lg">{pivotData.totals.grand.count.toLocaleString()}</div>
                </div>
                <div className="text-right">
                  <div className="text-purple-300">Total Order Value</div>
                  <div className="text-white font-bold text-lg">{formatAmount(pivotData.totals.grand.amount)}</div>
                </div>
                <button
                  className={DOWNLOAD_BTN_CLASS}
                  onClick={() => {
                    const headers = ['Status', 'Delivery Status', ...pivotMonthCols.flatMap((m) => [`${MONTH_NAMES[m - 1]} Count`, `${MONTH_NAMES[m - 1]} Amount`]), 'Total Count', 'Total Amount', '% Total'];
                    const rows: CsvCell[][] = [];
                    const grandCount = pivotData.totals.grand.count;
                    const pct = (n: number) => grandCount > 0 ? `${((n / grandCount) * 100).toFixed(1)}%` : '—';
                    byStatusOrder(pivotData.data).forEach((row) => {
                      const parentCells = pivotMonthCols.flatMap((m) => {
                        const c = row.months[m];
                        return [c?.count ?? 0, c?.amount ?? 0];
                      });
                      rows.push([row.status, '(all)', ...parentCells, row.total.count, row.total.amount, pct(row.total.count)]);
                      row.deliveryStatuses.forEach((sub) => {
                        const subCells = pivotMonthCols.flatMap((m) => {
                          const c = sub.months[m];
                          return [c?.count ?? 0, c?.amount ?? 0];
                        });
                        rows.push([row.status, sub.deliveryStatus ?? '(no delivery status)', ...subCells, sub.total.count, sub.total.amount, pct(sub.total.count)]);
                      });
                    });
                    downloadCSV(`status-x-delivery-${currentYear}.csv`, headers, rows);
                  }}
                >
                  ↓ CSV
                </button>
              </div>
            )}
            {pivotGranularity === 'week' && pivotWeekData && (
              <div className="flex items-center gap-6 text-sm">
                <div className="text-right">
                  <div className="text-purple-300">Total Orders</div>
                  <div className="text-white font-bold text-lg">{pivotWeekData.totals.grand.count.toLocaleString()}</div>
                </div>
                <div className="text-right">
                  <div className="text-purple-300">Total Order Value</div>
                  <div className="text-white font-bold text-lg">{formatAmount(pivotWeekData.totals.grand.amount)}</div>
                </div>
                <button
                  className={DOWNLOAD_BTN_CLASS}
                  onClick={() => {
                    const weeks = pivotWeekData.weeks;
                    const headers = ['Status', 'Delivery Status', ...weeks.flatMap((w) => [`W${w} Count`, `W${w} Amount`]), 'Total Count', 'Total Amount'];
                    const rows: CsvCell[][] = [];
                    byStatusOrder(pivotWeekData.data).forEach((row) => {
                      const parentCells = weeks.flatMap((w) => { const c = row.weeks[w]; return [c?.count ?? 0, c?.amount ?? 0]; });
                      rows.push([row.status, '(all)', ...parentCells, row.total.count, row.total.amount]);
                      row.deliveryStatuses.forEach((sub) => {
                        const subCells = weeks.flatMap((w) => { const c = sub.weeks[w]; return [c?.count ?? 0, c?.amount ?? 0]; });
                        rows.push([row.status, sub.deliveryStatus ?? '(no delivery status)', ...subCells, sub.total.count, sub.total.amount]);
                      });
                    });
                    downloadCSV(`status-x-delivery-weekly-${currentYear}.csv`, headers, rows);
                  }}
                >↓ CSV</button>
              </div>
            )}
            {pivotGranularity === 'day' && pivotDayData && (
              <div className="flex items-center gap-6 text-sm">
                <div className="text-right">
                  <div className="text-purple-300">Total Orders</div>
                  <div className="text-white font-bold text-lg">{pivotDayData.totals.grand.count.toLocaleString()}</div>
                </div>
                <div className="text-right">
                  <div className="text-purple-300">Total Order Value</div>
                  <div className="text-white font-bold text-lg">{formatAmount(pivotDayData.totals.grand.amount)}</div>
                </div>
                <button
                  className={DOWNLOAD_BTN_CLASS}
                  onClick={() => {
                    const days = Array.from({ length: pivotDayData.daysInMonth }, (_, i) => i + 1);
                    const headers = ['Status', 'Delivery Status', ...days.flatMap((d) => [`Day ${d} Count`, `Day ${d} Amount`]), 'Total Count', 'Total Amount'];
                    const rows: CsvCell[][] = [];
                    byStatusOrder(pivotDayData.data).forEach((row) => {
                      const parentCells = days.flatMap((d) => { const c = row.days[d]; return [c?.count ?? 0, c?.amount ?? 0]; });
                      rows.push([row.status, '(all)', ...parentCells, row.total.count, row.total.amount]);
                      row.deliveryStatuses.forEach((sub) => {
                        const subCells = days.flatMap((d) => { const c = sub.days[d]; return [c?.count ?? 0, c?.amount ?? 0]; });
                        rows.push([row.status, sub.deliveryStatus ?? '(no delivery status)', ...subCells, sub.total.count, sub.total.amount]);
                      });
                    });
                    downloadCSV(`status-x-delivery-daily-${MONTH_NAMES[pivotDayData.month - 1]}-${currentYear}.csv`, headers, rows);
                  }}
                >↓ CSV</button>
              </div>
            )}
          </div>
          {showPivotQuery && (() => {
            const active =
              pivotGranularity === 'month' ? pivotData
              : pivotGranularity === 'week' ? pivotWeekData
              : pivotDayData;
            const sql = active?.query;
            const sqlParams = active?.queryParams;
            return (
              <div className="px-8 py-5 border-b border-white/10 bg-slate-950/60">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-purple-300 text-xs uppercase tracking-wider font-semibold">
                    SQL Query — {pivotGranularity} view
                  </p>
                  {sql && (
                    <button
                      onClick={() => navigator.clipboard?.writeText(sql)}
                      className="px-3 py-1 rounded-lg text-[11px] font-semibold text-purple-200 border border-white/10 bg-white/5 hover:bg-white/10 transition-all"
                    >
                      Copy
                    </button>
                  )}
                </div>
                {sql ? (
                  <>
                    <pre className="text-[11px] leading-relaxed text-emerald-200/90 font-mono whitespace-pre-wrap overflow-x-auto max-h-[480px] overflow-y-auto bg-black/40 rounded-xl p-4 border border-white/10">
{sql}
                    </pre>
                    {sqlParams && sqlParams.length > 0 && (
                      <p className="text-purple-300/70 text-[11px] mt-2 font-mono">
                        params: [{sqlParams.map((p) => JSON.stringify(p)).join(', ')}]
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-purple-300 text-xs">Query unavailable — load this view first.</p>
                )}
              </div>
            );
          })()}
          <div className="overflow-x-auto">
            {pivotGranularity === 'month' && (
            <>
            {pivotLoading ? (
              <div className="px-8 py-12 text-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-fuchsia-500/30 border-t-fuchsia-500 animate-spin" />
                  <p className="text-purple-300">Loading pivot data...</p>
                </div>
              </div>
            ) : !pivotData || pivotData.data.length === 0 ? (
              <div className="px-8 py-12 text-center text-purple-300">No data available</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10">
                    <th rowSpan={2} className="px-4 py-3 text-left text-xs font-semibold text-purple-200 sticky left-0 bg-slate-900/80 backdrop-blur z-10 border-r border-white/10 min-w-[220px]">
                      Status / Delivery Status
                    </th>
                    {pivotMonthCols.map((m) => (
                      <th key={m} colSpan={2} className="px-2 py-2 text-center text-xs font-semibold text-purple-200 border-r border-white/10">
                        {MONTH_NAMES[m - 1]}
                      </th>
                    ))}
                    <th colSpan={3} className="px-2 py-2 text-center text-xs font-bold text-purple-100 bg-purple-500/20">Total</th>
                  </tr>
                  <tr className="bg-white/5 border-b border-white/10">
                    {[...Array(pivotMonthCols.length + 1)].map((_, i) => {
                      const isTotal = i === pivotMonthCols.length;
                      return (
                      <Fragment key={i}>
                        <th className={`px-2 py-2 text-right text-[10px] font-medium ${isTotal ? 'text-purple-100 bg-purple-500/20' : 'text-purple-300'}`}>Count</th>
                        <th className={`px-2 py-2 text-right text-[10px] font-medium ${isTotal ? 'text-purple-100 bg-purple-500/20' : 'border-r border-white/10 text-purple-300'}`}>Amount</th>
                      </Fragment>
                      );
                    })}
                    <th className="px-2 py-2 text-right text-[10px] font-medium text-purple-100 bg-purple-500/20 border-r border-white/10">% Total</th>
                  </tr>
                </thead>
                <tbody>
                  {byStatusOrder(pivotData.data).map((row) => {
                    const expanded = expandedStatuses.has(row.status);
                    return (
                      <Fragment key={row.status}>
                        {/* Parent status row */}
                        <tr
                          onClick={() => toggleStatusExpansion(row.status)}
                          className="border-b border-white/5 hover:bg-fuchsia-500/15 cursor-pointer transition-colors group"
                        >
                          <td className="px-4 py-3 sticky left-0 bg-slate-900/80 backdrop-blur z-10 border-r border-white/10 group-hover:bg-slate-800/90 text-white text-sm font-semibold">
                            <div className="flex items-center gap-2">
                              <span className={`inline-block w-4 text-purple-300 transition-transform ${expanded ? 'rotate-90' : ''}`}>▸</span>
                              <span>{row.status}</span>
                              <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-purple-200 tabular-nums">
                                {row.deliveryStatuses.length} sub
                              </span>
                            </div>
                          </td>
                          {pivotMonthCols.map((month) => {
                            const cell = row.months[month];
                            const hasData = cell && cell.count > 0;
                            const handleClick = (e: React.MouseEvent) => {
                              e.stopPropagation();
                              if (hasData) openPivotDrill(row.status, undefined, month);
                            };
                            return (
                              <Fragment key={month}>
                                <td
                                  onClick={handleClick}
                                  className={`px-2 py-3 text-right tabular-nums transition-all duration-200 ${hasData ? 'text-white cursor-pointer hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:text-white hover:font-bold hover:shadow-[inset_0_0_20px_rgba(217,70,239,0.6),0_0_18px_rgba(168,85,247,0.55)] hover:scale-110 transform-gpu relative' : 'text-white/30'}`}
                                >
                                  {hasData ? cell.count.toLocaleString() : '—'}
                                </td>
                                <td
                                  onClick={handleClick}
                                  className={`px-2 py-3 text-right tabular-nums border-r border-white/10 transition-all duration-200 ${hasData ? 'text-purple-200 cursor-pointer hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:text-white hover:font-bold hover:shadow-[inset_0_0_20px_rgba(217,70,239,0.6),0_0_18px_rgba(168,85,247,0.55)] hover:scale-110 transform-gpu relative' : 'text-white/30'}`}
                                >
                                  {hasData ? formatAmount(cell.amount) : '—'}
                                </td>
                              </Fragment>
                            );
                          })}
                          <td
                            onClick={(e) => { e.stopPropagation(); openPivotDrill(row.status, undefined, null); }}
                            className="px-2 py-3 text-right tabular-nums font-bold text-white bg-purple-500/10 cursor-pointer transition-all duration-200 hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:shadow-[inset_0_0_20px_rgba(217,70,239,0.7),0_0_22px_rgba(168,85,247,0.6)] hover:scale-110 transform-gpu relative"
                          >
                            {row.total.count.toLocaleString()}
                          </td>
                          <td
                            onClick={(e) => { e.stopPropagation(); openPivotDrill(row.status, undefined, null); }}
                            className="px-2 py-3 text-right tabular-nums font-bold text-purple-100 bg-purple-500/10 cursor-pointer transition-all duration-200 hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:text-white hover:shadow-[inset_0_0_20px_rgba(217,70,239,0.7),0_0_22px_rgba(168,85,247,0.6)] hover:scale-110 transform-gpu relative"
                          >
                            {formatAmount(row.total.amount)}
                          </td>
                          <td className="px-2 py-3 text-right tabular-nums font-bold text-purple-100 bg-purple-500/10 border-r border-white/10">
                            {pivotData.totals.grand.count > 0
                              ? `${((row.total.count / pivotData.totals.grand.count) * 100).toFixed(1)}%`
                              : '—'}
                          </td>
                        </tr>
                        {/* Expanded delivery-status sub-rows */}
                        {expanded && row.deliveryStatuses.map((sub) => (
                          <tr key={`${row.status}-${sub.deliveryStatus ?? 'null'}`} className="border-b border-white/5 bg-white/[0.02] hover:bg-white/5 transition-colors">
                            <td className="px-4 py-2.5 sticky left-0 bg-slate-900/85 backdrop-blur z-10 border-r border-white/10 text-purple-100 text-xs">
                              <div className="flex items-center gap-2 pl-6">
                                <span className="text-purple-400/60">└</span>
                                <span className={sub.deliveryStatus ? '' : 'italic text-purple-300/70'}>
                                  {sub.deliveryStatus ?? '(no delivery status)'}
                                </span>
                              </div>
                            </td>
                            {pivotMonthCols.map((month) => {
                              const cell = sub.months[month];
                              const hasData = cell && cell.count > 0;
                              const handleClick = (e: React.MouseEvent) => {
                                e.stopPropagation();
                                if (hasData) openPivotDrill(row.status, sub.deliveryStatus, month);
                              };
                              return (
                                <Fragment key={month}>
                                  <td
                                    onClick={handleClick}
                                    className={`px-2 py-2.5 text-right text-xs tabular-nums transition-all duration-200 ${hasData ? 'text-purple-100 cursor-pointer hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:text-white hover:font-bold hover:shadow-[inset_0_0_18px_rgba(217,70,239,0.55),0_0_16px_rgba(168,85,247,0.5)] hover:scale-110 transform-gpu relative' : 'text-white/20'}`}
                                  >
                                    {hasData ? cell.count.toLocaleString() : '—'}
                                  </td>
                                  <td
                                    onClick={handleClick}
                                    className={`px-2 py-2.5 text-right text-xs tabular-nums border-r border-white/10 transition-all duration-200 ${hasData ? 'text-purple-200/80 cursor-pointer hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:text-white hover:font-bold hover:shadow-[inset_0_0_18px_rgba(217,70,239,0.55),0_0_16px_rgba(168,85,247,0.5)] hover:scale-110 transform-gpu relative' : 'text-white/20'}`}
                                  >
                                    {hasData ? formatAmount(cell.amount) : '—'}
                                  </td>
                                </Fragment>
                              );
                            })}
                            <td
                              onClick={(e) => { e.stopPropagation(); openPivotDrill(row.status, sub.deliveryStatus, null); }}
                              className="px-2 py-2.5 text-right text-xs tabular-nums text-purple-100 bg-purple-500/5 cursor-pointer transition-all duration-200 hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:text-white hover:font-bold hover:shadow-[inset_0_0_18px_rgba(217,70,239,0.6),0_0_18px_rgba(168,85,247,0.55)] hover:scale-110 transform-gpu relative"
                            >
                              {sub.total.count.toLocaleString()}
                            </td>
                            <td
                              onClick={(e) => { e.stopPropagation(); openPivotDrill(row.status, sub.deliveryStatus, null); }}
                              className="px-2 py-2.5 text-right text-xs tabular-nums text-purple-200/80 bg-purple-500/5 cursor-pointer transition-all duration-200 hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:text-white hover:font-bold hover:shadow-[inset_0_0_18px_rgba(217,70,239,0.6),0_0_18px_rgba(168,85,247,0.55)] hover:scale-110 transform-gpu relative"
                            >
                              {formatAmount(sub.total.amount)}
                            </td>
                            <td className="px-2 py-2.5 text-right text-xs tabular-nums text-purple-200/80 bg-purple-500/5 border-r border-white/10">
                              {pivotData.totals.grand.count > 0
                                ? `${((sub.total.count / pivotData.totals.grand.count) * 100).toFixed(1)}%`
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                  {/* Grand totals row */}
                  <tr className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 border-t-2 border-purple-400/40 font-bold">
                    <td className="px-4 py-3 sticky left-0 bg-slate-900/95 backdrop-blur z-10 border-r border-white/10 text-white">
                      Total
                    </td>
                    {pivotMonthCols.map((month) => {
                      const cell = pivotData.totals.byMonth[month];
                      const hasData = cell && cell.count > 0;
                      return (
                        <Fragment key={month}>
                          <td className={`px-2 py-3 text-right tabular-nums ${hasData ? 'text-white' : 'text-white/30'}`}>
                            {hasData ? cell.count.toLocaleString() : '—'}
                          </td>
                          <td className={`px-2 py-3 text-right tabular-nums border-r border-white/10 ${hasData ? 'text-purple-100' : 'text-white/30'}`}>
                            {hasData ? formatAmount(cell.amount) : '—'}
                          </td>
                        </Fragment>
                      );
                    })}
                    <td className="px-2 py-3 text-right tabular-nums text-white bg-purple-500/30">
                      {pivotData.totals.grand.count.toLocaleString()}
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums text-purple-50 bg-purple-500/30">
                      {formatAmount(pivotData.totals.grand.amount)}
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums text-white bg-purple-500/30 border-r border-white/10">
                      100.0%
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
            </>
            )}

            {pivotGranularity === 'week' && (() => {
              if (pivotWeekLoading) return <div className="px-8 py-12 text-center"><div className="flex flex-col items-center gap-3"><div className="w-8 h-8 rounded-full border-2 border-fuchsia-500/30 border-t-fuchsia-500 animate-spin" /><p className="text-purple-300">Loading weekly pivot…</p></div></div>;
              if (!pivotWeekData || pivotWeekData.data.length === 0) return <div className="px-8 py-12 text-center text-purple-300">No data available</div>;
              const weeks = pivotWeekData.weeks;
              return (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10">
                      <th rowSpan={2} className="px-4 py-3 text-left text-xs font-semibold text-purple-200 sticky left-0 bg-slate-900/80 backdrop-blur z-10 border-r border-white/10 min-w-[220px]">Status / Delivery Status</th>
                      {weeks.map((w) => (
                        <th key={w} colSpan={2} className="px-2 py-2 text-center text-xs font-semibold text-purple-200 border-r border-white/10">
                          <div>W{w}</div>
                          <div className="text-[9px] font-normal text-purple-300/70">{pivotWeekData.weekStartLabels[w] || ''}</div>
                        </th>
                      ))}
                      <th colSpan={2} className="px-2 py-2 text-center text-xs font-bold text-purple-100 bg-purple-500/20">Total</th>
                    </tr>
                    <tr className="bg-white/5 border-b border-white/10">
                      {[...weeks, 'total' as const].map((w, i) => {
                        const isTotal = w === 'total';
                        return (
                          <Fragment key={String(w) + i}>
                            <th className={`px-2 py-2 text-right text-[10px] font-medium ${isTotal ? 'text-purple-100 bg-purple-500/20' : 'text-purple-300'}`}>Count</th>
                            <th className={`px-2 py-2 text-right text-[10px] font-medium border-r border-white/10 ${isTotal ? 'text-purple-100 bg-purple-500/20' : 'text-purple-300'}`}>Amount</th>
                          </Fragment>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {byStatusOrder(pivotWeekData.data).map((row) => {
                      const expanded = expandedStatuses.has(row.status);
                      return (
                        <Fragment key={row.status}>
                          <tr onClick={() => toggleStatusExpansion(row.status)} className="border-b border-white/5 hover:bg-fuchsia-500/15 cursor-pointer transition-colors group">
                            <td className="px-4 py-3 sticky left-0 bg-slate-900/80 backdrop-blur z-10 border-r border-white/10 group-hover:bg-slate-800/90 text-white text-sm font-semibold">
                              <div className="flex items-center gap-2">
                                <span className={`inline-block w-4 text-purple-300 transition-transform ${expanded ? 'rotate-90' : ''}`}>▸</span>
                                <span>{row.status}</span>
                                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-purple-200 tabular-nums">{row.deliveryStatuses.length} sub</span>
                              </div>
                            </td>
                            {weeks.map((w) => {
                              const cell = row.weeks[w];
                              const hasData = cell && cell.count > 0;
                              const handleClick = (e: React.MouseEvent) => {
                                e.stopPropagation();
                                if (hasData) openPivotDrill(row.status, undefined, null, null, w, pivotWeekData.weekStartLabels[w] || null);
                              };
                              return (
                                <Fragment key={w}>
                                  <td onClick={handleClick} className={`px-2 py-3 text-right tabular-nums transition-all duration-200 ${hasData ? 'text-white cursor-pointer hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:text-white hover:font-bold hover:shadow-[inset_0_0_20px_rgba(217,70,239,0.6),0_0_18px_rgba(168,85,247,0.55)] hover:scale-110 transform-gpu relative' : 'text-white/30'}`}>{hasData ? cell.count.toLocaleString() : '—'}</td>
                                  <td onClick={handleClick} className={`px-2 py-3 text-right tabular-nums border-r border-white/10 transition-all duration-200 ${hasData ? 'text-purple-200 cursor-pointer hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:text-white hover:font-bold hover:shadow-[inset_0_0_20px_rgba(217,70,239,0.6),0_0_18px_rgba(168,85,247,0.55)] hover:scale-110 transform-gpu relative' : 'text-white/30'}`}>{hasData ? formatAmount(cell.amount) : '—'}</td>
                                </Fragment>
                              );
                            })}
                            <td onClick={(e) => { e.stopPropagation(); openPivotDrill(row.status, undefined, null); }} className="px-2 py-3 text-right tabular-nums font-bold text-white bg-purple-500/10 cursor-pointer transition-all duration-200 hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:shadow-[inset_0_0_20px_rgba(217,70,239,0.7),0_0_22px_rgba(168,85,247,0.6)] hover:scale-110 transform-gpu relative">{row.total.count.toLocaleString()}</td>
                            <td onClick={(e) => { e.stopPropagation(); openPivotDrill(row.status, undefined, null); }} className="px-2 py-3 text-right tabular-nums font-bold text-purple-100 bg-purple-500/10 border-r border-white/10 cursor-pointer transition-all duration-200 hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:text-white hover:shadow-[inset_0_0_20px_rgba(217,70,239,0.7),0_0_22px_rgba(168,85,247,0.6)] hover:scale-110 transform-gpu relative">{formatAmount(row.total.amount)}</td>
                          </tr>
                          {expanded && row.deliveryStatuses.map((sub) => (
                            <tr key={`${row.status}-${sub.deliveryStatus ?? 'null'}`} className="border-b border-white/5 bg-white/[0.02]">
                              <td className="px-4 py-2.5 sticky left-0 bg-slate-900/85 backdrop-blur z-10 border-r border-white/10 text-purple-100 text-xs">
                                <div className="flex items-center gap-2 pl-6"><span className="text-purple-400/60">└</span><span className={sub.deliveryStatus ? '' : 'italic text-purple-300/70'}>{sub.deliveryStatus ?? '(no delivery status)'}</span></div>
                              </td>
                              {weeks.map((w) => {
                                const cell = sub.weeks[w];
                                const hasData = cell && cell.count > 0;
                                const handleClick = (e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  if (hasData) openPivotDrill(row.status, sub.deliveryStatus, null, null, w, pivotWeekData.weekStartLabels[w] || null);
                                };
                                return (
                                  <Fragment key={w}>
                                    <td onClick={handleClick} className={`px-2 py-2.5 text-right text-xs tabular-nums transition-all duration-200 ${hasData ? 'text-purple-100 cursor-pointer hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:text-white hover:font-bold hover:shadow-[inset_0_0_18px_rgba(217,70,239,0.55),0_0_16px_rgba(168,85,247,0.5)] hover:scale-110 transform-gpu relative' : 'text-white/20'}`}>{hasData ? cell.count.toLocaleString() : '—'}</td>
                                    <td onClick={handleClick} className={`px-2 py-2.5 text-right text-xs tabular-nums border-r border-white/10 transition-all duration-200 ${hasData ? 'text-purple-200/80 cursor-pointer hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:text-white hover:font-bold hover:shadow-[inset_0_0_18px_rgba(217,70,239,0.55),0_0_16px_rgba(168,85,247,0.5)] hover:scale-110 transform-gpu relative' : 'text-white/20'}`}>{hasData ? formatAmount(cell.amount) : '—'}</td>
                                  </Fragment>
                                );
                              })}
                              <td onClick={(e) => { e.stopPropagation(); openPivotDrill(row.status, sub.deliveryStatus, null); }} className="px-2 py-2.5 text-right text-xs tabular-nums text-purple-100 bg-purple-500/5 cursor-pointer transition-all duration-200 hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:text-white hover:font-bold hover:shadow-[inset_0_0_18px_rgba(217,70,239,0.6),0_0_18px_rgba(168,85,247,0.55)] hover:scale-110 transform-gpu relative">{sub.total.count.toLocaleString()}</td>
                              <td onClick={(e) => { e.stopPropagation(); openPivotDrill(row.status, sub.deliveryStatus, null); }} className="px-2 py-2.5 text-right text-xs tabular-nums text-purple-200/80 bg-purple-500/5 border-r border-white/10 cursor-pointer transition-all duration-200 hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:text-white hover:font-bold hover:shadow-[inset_0_0_18px_rgba(217,70,239,0.6),0_0_18px_rgba(168,85,247,0.55)] hover:scale-110 transform-gpu relative">{formatAmount(sub.total.amount)}</td>
                            </tr>
                          ))}
                        </Fragment>
                      );
                    })}
                    <tr className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 border-t-2 border-purple-400/40 font-bold">
                      <td className="px-4 py-3 sticky left-0 bg-slate-900/95 backdrop-blur z-10 border-r border-white/10 text-white">Total</td>
                      {weeks.map((w) => {
                        const c = pivotWeekData.totals.byWeek[w];
                        const hd = c && c.count > 0;
                        return (
                          <Fragment key={w}>
                            <td className={`px-2 py-3 text-right tabular-nums ${hd ? 'text-white' : 'text-white/30'}`}>{hd ? c.count.toLocaleString() : '—'}</td>
                            <td className={`px-2 py-3 text-right tabular-nums border-r border-white/10 ${hd ? 'text-purple-100' : 'text-white/30'}`}>{hd ? formatAmount(c.amount) : '—'}</td>
                          </Fragment>
                        );
                      })}
                      <td className="px-2 py-3 text-right tabular-nums text-white bg-purple-500/30">{pivotWeekData.totals.grand.count.toLocaleString()}</td>
                      <td className="px-2 py-3 text-right tabular-nums text-purple-50 bg-purple-500/30 border-r border-white/10">{formatAmount(pivotWeekData.totals.grand.amount)}</td>
                    </tr>
                  </tbody>
                </table>
              );
            })()}

            {pivotGranularity === 'day' && (() => {
              if (pivotDayLoading) return <div className="px-8 py-12 text-center"><div className="flex flex-col items-center gap-3"><div className="w-8 h-8 rounded-full border-2 border-fuchsia-500/30 border-t-fuchsia-500 animate-spin" /><p className="text-purple-300">Loading daily pivot…</p></div></div>;
              if (!pivotDayData || pivotDayData.data.length === 0) return <div className="px-8 py-12 text-center text-purple-300">No orders in {MONTH_NAMES[pivotDayMonth - 1]} {currentYear}</div>;
              const days = Array.from({ length: pivotDayData.daysInMonth }, (_, i) => i + 1);
              return (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10">
                      <th rowSpan={2} className="px-4 py-3 text-left text-xs font-semibold text-purple-200 sticky left-0 bg-slate-900/80 backdrop-blur z-10 border-r border-white/10 min-w-[220px]">Status / Delivery Status</th>
                      {days.map((d) => <th key={d} colSpan={2} className="px-2 py-2 text-center text-xs font-semibold text-purple-200 border-r border-white/10">{d}</th>)}
                      <th colSpan={2} className="px-2 py-2 text-center text-xs font-bold text-purple-100 bg-purple-500/20">Total</th>
                    </tr>
                    <tr className="bg-white/5 border-b border-white/10">
                      {[...days, 'total' as const].map((d, i) => {
                        const isTotal = d === 'total';
                        return (
                          <Fragment key={String(d) + i}>
                            <th className={`px-2 py-2 text-right text-[10px] font-medium ${isTotal ? 'text-purple-100 bg-purple-500/20' : 'text-purple-300'}`}>Count</th>
                            <th className={`px-2 py-2 text-right text-[10px] font-medium border-r border-white/10 ${isTotal ? 'text-purple-100 bg-purple-500/20' : 'text-purple-300'}`}>Amount</th>
                          </Fragment>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {byStatusOrder(pivotDayData.data).map((row) => {
                      const expanded = expandedStatuses.has(row.status);
                      return (
                        <Fragment key={row.status}>
                          <tr onClick={() => toggleStatusExpansion(row.status)} className="border-b border-white/5 hover:bg-fuchsia-500/15 cursor-pointer transition-colors group">
                            <td className="px-4 py-3 sticky left-0 bg-slate-900/80 backdrop-blur z-10 border-r border-white/10 group-hover:bg-slate-800/90 text-white text-sm font-semibold">
                              <div className="flex items-center gap-2">
                                <span className={`inline-block w-4 text-purple-300 transition-transform ${expanded ? 'rotate-90' : ''}`}>▸</span>
                                <span>{row.status}</span>
                                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-purple-200 tabular-nums">{row.deliveryStatuses.length} sub</span>
                              </div>
                            </td>
                            {days.map((d) => {
                              const cell = row.days[d];
                              const hasData = cell && cell.count > 0;
                              const handleClick = (e: React.MouseEvent) => {
                                e.stopPropagation();
                                if (hasData) openPivotDrill(row.status, undefined, pivotDayMonth, d);
                              };
                              return (
                                <Fragment key={d}>
                                  <td onClick={handleClick} className={`px-2 py-3 text-right tabular-nums transition-all duration-200 ${hasData ? 'text-white cursor-pointer hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:text-white hover:font-bold hover:shadow-[inset_0_0_20px_rgba(217,70,239,0.6),0_0_18px_rgba(168,85,247,0.55)] hover:scale-110 transform-gpu relative' : 'text-white/30'}`}>{hasData ? cell.count.toLocaleString() : '—'}</td>
                                  <td onClick={handleClick} className={`px-2 py-3 text-right tabular-nums border-r border-white/10 transition-all duration-200 ${hasData ? 'text-purple-200 cursor-pointer hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:text-white hover:font-bold hover:shadow-[inset_0_0_20px_rgba(217,70,239,0.6),0_0_18px_rgba(168,85,247,0.55)] hover:scale-110 transform-gpu relative' : 'text-white/30'}`}>{hasData ? formatAmount(cell.amount) : '—'}</td>
                                </Fragment>
                              );
                            })}
                            <td onClick={(e) => { e.stopPropagation(); openPivotDrill(row.status, undefined, pivotDayMonth); }} className="px-2 py-3 text-right tabular-nums font-bold text-white bg-purple-500/10 cursor-pointer transition-all duration-200 hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:shadow-[inset_0_0_20px_rgba(217,70,239,0.7),0_0_22px_rgba(168,85,247,0.6)] hover:scale-110 transform-gpu relative">{row.total.count.toLocaleString()}</td>
                            <td onClick={(e) => { e.stopPropagation(); openPivotDrill(row.status, undefined, pivotDayMonth); }} className="px-2 py-3 text-right tabular-nums font-bold text-purple-100 bg-purple-500/10 border-r border-white/10 cursor-pointer transition-all duration-200 hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:text-white hover:shadow-[inset_0_0_20px_rgba(217,70,239,0.7),0_0_22px_rgba(168,85,247,0.6)] hover:scale-110 transform-gpu relative">{formatAmount(row.total.amount)}</td>
                          </tr>
                          {expanded && row.deliveryStatuses.map((sub) => (
                            <tr key={`${row.status}-${sub.deliveryStatus ?? 'null'}`} className="border-b border-white/5 bg-white/[0.02]">
                              <td className="px-4 py-2.5 sticky left-0 bg-slate-900/85 backdrop-blur z-10 border-r border-white/10 text-purple-100 text-xs">
                                <div className="flex items-center gap-2 pl-6"><span className="text-purple-400/60">└</span><span className={sub.deliveryStatus ? '' : 'italic text-purple-300/70'}>{sub.deliveryStatus ?? '(no delivery status)'}</span></div>
                              </td>
                              {days.map((d) => {
                                const cell = sub.days[d];
                                const hasData = cell && cell.count > 0;
                                const handleClick = (e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  if (hasData) openPivotDrill(row.status, sub.deliveryStatus, pivotDayMonth, d);
                                };
                                return (
                                  <Fragment key={d}>
                                    <td onClick={handleClick} className={`px-2 py-2.5 text-right text-xs tabular-nums transition-all duration-200 ${hasData ? 'text-purple-100 cursor-pointer hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:text-white hover:font-bold hover:shadow-[inset_0_0_18px_rgba(217,70,239,0.55),0_0_16px_rgba(168,85,247,0.5)] hover:scale-110 transform-gpu relative' : 'text-white/20'}`}>{hasData ? cell.count.toLocaleString() : '—'}</td>
                                    <td onClick={handleClick} className={`px-2 py-2.5 text-right text-xs tabular-nums border-r border-white/10 transition-all duration-200 ${hasData ? 'text-purple-200/80 cursor-pointer hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:text-white hover:font-bold hover:shadow-[inset_0_0_18px_rgba(217,70,239,0.55),0_0_16px_rgba(168,85,247,0.5)] hover:scale-110 transform-gpu relative' : 'text-white/20'}`}>{hasData ? formatAmount(cell.amount) : '—'}</td>
                                  </Fragment>
                                );
                              })}
                              <td onClick={(e) => { e.stopPropagation(); openPivotDrill(row.status, sub.deliveryStatus, pivotDayMonth); }} className="px-2 py-2.5 text-right text-xs tabular-nums text-purple-100 bg-purple-500/5 cursor-pointer transition-all duration-200 hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:text-white hover:font-bold hover:shadow-[inset_0_0_18px_rgba(217,70,239,0.6),0_0_18px_rgba(168,85,247,0.55)] hover:scale-110 transform-gpu relative">{sub.total.count.toLocaleString()}</td>
                              <td onClick={(e) => { e.stopPropagation(); openPivotDrill(row.status, sub.deliveryStatus, pivotDayMonth); }} className="px-2 py-2.5 text-right text-xs tabular-nums text-purple-200/80 bg-purple-500/5 border-r border-white/10 cursor-pointer transition-all duration-200 hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:text-white hover:font-bold hover:shadow-[inset_0_0_18px_rgba(217,70,239,0.6),0_0_18px_rgba(168,85,247,0.55)] hover:scale-110 transform-gpu relative">{formatAmount(sub.total.amount)}</td>
                            </tr>
                          ))}
                        </Fragment>
                      );
                    })}
                    <tr className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 border-t-2 border-purple-400/40 font-bold">
                      <td className="px-4 py-3 sticky left-0 bg-slate-900/95 backdrop-blur z-10 border-r border-white/10 text-white">Total</td>
                      {days.map((d) => {
                        const c = pivotDayData.totals.byDay[d];
                        const hd = c && c.count > 0;
                        return (
                          <Fragment key={d}>
                            <td className={`px-2 py-3 text-right tabular-nums ${hd ? 'text-white' : 'text-white/30'}`}>{hd ? c.count.toLocaleString() : '—'}</td>
                            <td className={`px-2 py-3 text-right tabular-nums border-r border-white/10 ${hd ? 'text-purple-100' : 'text-white/30'}`}>{hd ? formatAmount(c.amount) : '—'}</td>
                          </Fragment>
                        );
                      })}
                      <td className="px-2 py-3 text-right tabular-nums text-white bg-purple-500/30">{pivotDayData.totals.grand.count.toLocaleString()}</td>
                      <td className="px-2 py-3 text-right tabular-nums text-purple-50 bg-purple-500/30 border-r border-white/10">{formatAmount(pivotDayData.totals.grand.amount)}</td>
                    </tr>
                  </tbody>
                </table>
              );
            })()}
          </div>
        </div>



        {/* Monthly Geo Coverage — rows = pincode/city/district/state, columns = months */}
        <div className="mt-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25),inset_0_0_30px_rgba(168,85,247,0.12)]">
          <div className="px-8 py-6 border-b border-white/10 bg-white/5 flex items-center justify-between flex-nowrap gap-3">
            <div className="min-w-0 shrink">
              <h2 className="text-2xl font-bold text-white truncate">
                {geoCovGranularity === 'month' ? 'Monthly' : geoCovGranularity === 'week' ? 'Weekly' : 'Daily'} Geo Coverage
              </h2>
              <p className="text-purple-300 text-sm mt-1 truncate">
                {geoCovGranularity === 'day'
                  ? `Unique pincodes / cities / districts / states reached per day — ${MONTH_NAMES[geoCovDayMonth - 1]} ${currentYear}`
                  : geoCovGranularity === 'week'
                  ? `Unique pincodes / cities / districts / states reached per ISO week — ${currentYear}`
                  : `Unique pincodes / cities / districts / states reached per month — ${currentYear}`}
                {geoCovStatuses.length > 0 && ` · ${geoCovStatuses.join(', ')}`}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-nowrap shrink-0">
              {/* Granularity toggle */}
              <div className="flex gap-1 p-1 bg-white/5 border border-white/10 rounded-xl">
                {(['month', 'week', 'day'] as const).map((g) => {
                  const active = geoCovGranularity === g;
                  return (
                    <button
                      key={g}
                      onClick={() => setGeoCovGranularity(g)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        active
                          ? 'bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 text-white shadow-[0_0_18px_rgba(217,70,239,0.5)]'
                          : 'text-purple-200 hover:bg-white/10'
                      }`}
                    >
                      {g === 'month' ? 'Month' : g === 'week' ? 'Week' : 'Day'}
                    </button>
                  );
                })}
              </div>
              {geoCovGranularity !== 'day' && (
                <MonthMultiSelect selected={geoCovMonths} onChange={setGeoCovMonths} year={currentYear} />
              )}
              {geoCovGranularity === 'day' && (
                <select
                  value={geoCovDayMonth}
                  onChange={(e) => setGeoCovDayMonth(parseInt(e.target.value))}
                  className="px-3 py-1.5 text-xs font-semibold bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                >
                  {MONTH_NAMES.map((name, i) => (
                    <option key={i} value={i + 1} className="bg-slate-900">{name} {currentYear}</option>
                  ))}
                </select>
              )}
              {/* Order-status multi-select */}
              <div className="relative">
                <button
                  onClick={() => setGeoCovStatusOpen((o) => !o)}
                  className="px-4 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap bg-white/5 border border-white/10 text-purple-200 hover:bg-white/10 transition-all flex items-center gap-2"
                >
                  {geoCovStatuses.length === 0 ? 'All Statuses' : `${geoCovStatuses.length} Status${geoCovStatuses.length > 1 ? 'es' : ''}`}
                  <span className="text-[10px]">▼</span>
                </button>
                {geoCovStatusOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-slate-900 border border-white/15 rounded-xl shadow-2xl z-20 p-2">
                    <button
                      onClick={() => setGeoCovStatuses([])}
                      className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium text-purple-300 hover:bg-white/10 transition-colors"
                    >
                      Clear (All)
                    </button>
                    {GEO_STATUS_OPTIONS.map((s) => {
                      const checked = geoCovStatuses.includes(s);
                      return (
                        <label
                          key={s}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-white hover:bg-white/10 cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setGeoCovStatuses((prev) =>
                                checked ? prev.filter((x) => x !== s) : [...prev, s]
                              );
                              setGeoCovStatusOpen(false);
                            }}
                            className="accent-fuchsia-500"
                          />
                          {s}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              {queryBtn('geoCoverage', 'Geo Coverage')}
            </div>
            {geoCoverageData && (
              <div className="flex items-center gap-3 text-xs shrink-0">
                <div className="text-right whitespace-nowrap">
                  <div className="text-purple-300">Total Orders</div>
                  <div className="text-white font-bold text-lg">{geoCoverageData.totals.grand.count.toLocaleString()}</div>
                </div>
                <div className="text-right whitespace-nowrap">
                  <div className="text-purple-300">Total Order Value</div>
                  <div className="text-white font-bold text-lg">{formatAmount(geoCoverageData.totals.grand.amount)}</div>
                </div>
                <button
                  className={DOWNLOAD_BTN_CLASS}
                  onClick={() => {
                    const bucketLabel = (b: number) =>
                      geoCovGranularity === 'month' ? MONTH_NAMES[b - 1]
                      : geoCovGranularity === 'week' ? `W${b}${geoCoverageData.weekStartLabels[b] ? ` (${geoCoverageData.weekStartLabels[b]})` : ''}`
                      : `Day ${b}`;
                    const headers = ['Geography', ...geoCoverageData.buckets.flatMap((b) => [`${bucketLabel(b)} Covered`, `${bucketLabel(b)} Orders`, `${bucketLabel(b)} Value`]), 'Total Covered', 'Total Orders', 'Total Value'];
                    const rows: CsvCell[][] = geoCoverageData.data.map((row) => {
                      const label = row.geo.charAt(0).toUpperCase() + row.geo.slice(1);
                      const cells = geoCoverageData.buckets.flatMap((b) => {
                        const c = row.months[b];
                        return [c?.covered ?? 0, c?.count ?? 0, c?.amount ?? 0];
                      });
                      return [label, ...cells, row.total.covered, row.total.count, row.total.amount];
                    });
                    downloadCSV(`geo-coverage-${geoCovGranularity}-${currentYear}.csv`, headers, rows);
                  }}
                >
                  ↓ CSV
                </button>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            {geoCoverageLoading ? (
              <div className="px-8 py-12 text-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-fuchsia-500/30 border-t-fuchsia-500 animate-spin" />
                  <p className="text-purple-300">Loading geo coverage…</p>
                </div>
              </div>
            ) : !geoCoverageData || geoCoverageData.data.length === 0 ? (
              <div className="px-8 py-12 text-center text-purple-300">No data available</div>
            ) : (
              (() => {
                const buckets = geoCoverageData.buckets;
                const bucketTop = (b: number) =>
                  geoCovGranularity === 'month' ? MONTH_NAMES[b - 1]
                  : geoCovGranularity === 'week' ? `W${b}`
                  : `${b}`;
                const bucketSub = (b: number) =>
                  geoCovGranularity === 'week' ? geoCoverageData.weekStartLabels[b]
                  : geoCovGranularity === 'day' ? MONTH_NAMES[geoCoverageData.month - 1]
                  : null;
                const statusSuffix = geoCovStatuses.length ? ` · ${geoCovStatuses.join(', ')}` : '';
                const bucketFullLabel = (b: number) =>
                  (geoCovGranularity === 'month' ? `${MONTH_NAMES[b - 1]} ${currentYear}`
                  : geoCovGranularity === 'week' ? `Week ${b}${geoCoverageData.weekStartLabels[b] ? ` (from ${geoCoverageData.weekStartLabels[b]})` : ''} · ${currentYear}`
                  : `${b} ${MONTH_NAMES[geoCoverageData.month - 1]} ${currentYear}`) + statusSuffix;
                const totalLabel = (geoCovGranularity === 'day'
                  ? `${MONTH_NAMES[geoCoverageData.month - 1]} ${currentYear} (all days)`
                  : `${currentYear} (all ${geoCovGranularity === 'week' ? 'weeks' : 'months'})`) + statusSuffix;
                // Clickable cells use a group so the inner number can saturate + scale up on hover.
                const cellHover = 'group cursor-pointer hover:bg-fuchsia-500/15 transition-colors';
                const numHover = 'inline-block origin-right transition-all duration-150 group-hover:scale-[1.25] group-hover:font-extrabold group-hover:text-cyan-300 group-hover:drop-shadow-[0_0_8px_rgba(34,211,238,0.75)]';
                return (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10">
                      <th rowSpan={2} className="px-4 py-3 text-left text-xs font-semibold text-purple-200 sticky left-0 bg-slate-900/80 backdrop-blur z-10 border-r border-white/10 min-w-[180px]">
                        Geography
                      </th>
                      {buckets.map((b) => {
                        const sub = bucketSub(b);
                        return (
                          <th key={b} colSpan={3} className="px-2 py-2 text-center text-xs font-semibold text-purple-200 border-r border-white/10">
                            {bucketTop(b)}
                            {sub && <span className="block text-[9px] font-normal text-purple-400">{sub}</span>}
                          </th>
                        );
                      })}
                      <th colSpan={3} className="px-2 py-2 text-center text-xs font-bold text-purple-100 bg-purple-500/20">Total</th>
                    </tr>
                    <tr className="bg-white/5 border-b border-white/10">
                      {[...Array(buckets.length + 1)].map((_, i) => {
                        const isTotal = i === buckets.length;
                        return (
                          <Fragment key={i}>
                            <th className={`px-2 py-2 text-right text-[10px] font-medium ${isTotal ? 'text-purple-100 bg-purple-500/20' : 'text-purple-300'}`}>Covered</th>
                            <th className={`px-2 py-2 text-right text-[10px] font-medium ${isTotal ? 'text-purple-100 bg-purple-500/20' : 'text-purple-300'}`}>Orders</th>
                            <th className={`px-2 py-2 text-right text-[10px] font-medium border-r border-white/10 ${isTotal ? 'text-purple-100 bg-purple-500/20' : 'text-purple-300'}`}>Value</th>
                          </Fragment>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {geoCoverageData.data.map((row) => {
                      const label = row.geo.charAt(0).toUpperCase() + row.geo.slice(1);
                      return (
                        <tr key={row.geo} className="border-b border-white/5 hover:bg-fuchsia-500/10 transition-colors">
                          <td className="px-4 py-3 sticky left-0 bg-slate-900/80 backdrop-blur z-10 border-r border-white/10 text-white text-sm font-semibold">
                            {label}
                          </td>
                          {buckets.map((b) => {
                            const cell = row.months[b];
                            const hasData = cell && (cell.covered > 0 || cell.count > 0);
                            const click = hasData ? () => openGeoPinModal(row.geo as GeoLevel, b, bucketFullLabel(b)) : undefined;
                            const clk = hasData ? cellHover : '';
                            return (
                              <Fragment key={b}>
                                <td onClick={click} title={hasData ? 'View pincode breakdown' : undefined} className={`px-2 py-3 text-right tabular-nums ${clk} ${hasData ? 'text-fuchsia-200 font-semibold' : 'text-white/30'}`}>
                                  {hasData ? <span className={numHover}>{cell.covered.toLocaleString()}</span> : '—'}
                                </td>
                                <td onClick={click} title={hasData ? 'View pincode breakdown' : undefined} className={`px-2 py-3 text-right tabular-nums ${clk} ${hasData ? 'text-white' : 'text-white/30'}`}>
                                  {hasData ? <span className={numHover}>{cell.count.toLocaleString()}</span> : '—'}
                                </td>
                                <td onClick={click} title={hasData ? 'View pincode breakdown' : undefined} className={`px-2 py-3 text-right tabular-nums border-r border-white/10 ${clk} ${hasData ? 'text-purple-200' : 'text-white/30'}`}>
                                  {hasData ? <span className={numHover}>{formatAmount(cell.amount)}</span> : '—'}
                                </td>
                              </Fragment>
                            );
                          })}
                          <td onClick={() => openGeoPinModal(row.geo as GeoLevel, 'total', totalLabel)} title="View pincode breakdown" className={`px-2 py-3 text-right tabular-nums font-bold text-fuchsia-100 bg-purple-500/10 ${cellHover}`}>
                            <span className={numHover}>{row.total.covered.toLocaleString()}</span>
                          </td>
                          <td onClick={() => openGeoPinModal(row.geo as GeoLevel, 'total', totalLabel)} title="View pincode breakdown" className={`px-2 py-3 text-right tabular-nums font-bold text-white bg-purple-500/10 ${cellHover}`}>
                            <span className={numHover}>{row.total.count.toLocaleString()}</span>
                          </td>
                          <td onClick={() => openGeoPinModal(row.geo as GeoLevel, 'total', totalLabel)} title="View pincode breakdown" className={`px-2 py-3 text-right tabular-nums font-bold text-purple-100 bg-purple-500/10 border-r border-white/10 ${cellHover}`}>
                            <span className={numHover}>{formatAmount(row.total.amount)}</span>
                          </td>
                        </tr>
                      );
                    })}
                    {/* Grand totals (orders + value only; covered isn't summable across rows) */}
                    <tr className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 border-t-2 border-purple-400/40 font-bold">
                      <td className="px-4 py-3 sticky left-0 bg-slate-900/95 backdrop-blur z-10 border-r border-white/10 text-white">
                        Total Orders
                      </td>
                      {buckets.map((b) => {
                        const cell = geoCoverageData.totals.byMonth[b];
                        const hasData = cell && cell.count > 0;
                        const click = hasData ? () => openGeoPinModal('pincode', b, bucketFullLabel(b)) : undefined;
                        const clk = hasData ? cellHover : '';
                        return (
                          <Fragment key={b}>
                            <td className="px-2 py-3 text-right tabular-nums text-white/40">—</td>
                            <td onClick={click} title={hasData ? 'View pincode breakdown' : undefined} className={`px-2 py-3 text-right tabular-nums ${clk} ${hasData ? 'text-white' : 'text-white/30'}`}>
                              {hasData ? <span className={numHover}>{cell.count.toLocaleString()}</span> : '—'}
                            </td>
                            <td onClick={click} title={hasData ? 'View pincode breakdown' : undefined} className={`px-2 py-3 text-right tabular-nums border-r border-white/10 ${clk} ${hasData ? 'text-purple-100' : 'text-white/30'}`}>
                              {hasData ? <span className={numHover}>{formatAmount(cell.amount)}</span> : '—'}
                            </td>
                          </Fragment>
                        );
                      })}
                      <td className="px-2 py-3 text-right tabular-nums text-white/40 bg-purple-500/30">—</td>
                      <td onClick={() => openGeoPinModal('pincode', 'total', totalLabel)} title="View pincode breakdown" className={`px-2 py-3 text-right tabular-nums text-white bg-purple-500/30 ${cellHover}`}>
                        <span className={numHover}>{geoCoverageData.totals.grand.count.toLocaleString()}</span>
                      </td>
                      <td onClick={() => openGeoPinModal('pincode', 'total', totalLabel)} title="View pincode breakdown" className={`px-2 py-3 text-right tabular-nums text-purple-50 bg-purple-500/30 border-r border-white/10 ${cellHover}`}>
                        <span className={numHover}>{formatAmount(geoCoverageData.totals.grand.amount)}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
                );
              })()
            )}
          </div>
        </div>

        {/* Pincode breakdown drill-down modal (Geo Coverage) */}
        {geoPinOpen && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md"
            onClick={() => setGeoPinOpen(false)}
          >
            <div
              className="relative bg-white text-slate-900 rounded-2xl w-[92vw] max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-[0_30px_80px_-20px_rgba(99,102,241,0.45)] border border-slate-200"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="px-6 py-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 text-white flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/70 font-semibold">{geoPinGeo.charAt(0).toUpperCase() + geoPinGeo.slice(1)} Breakdown</div>
                  <h3 className="text-lg font-extrabold truncate mt-0.5">{geoPinLabel}</h3>
                </div>
                <button
                  onClick={() => setGeoPinOpen(false)}
                  className="shrink-0 w-8 h-8 rounded-lg bg-white/15 hover:bg-white/30 text-white text-lg leading-none transition-all hover:rotate-90"
                  aria-label="Close"
                >
                  ×
                </button>
              </header>
              {!geoPinLoading && !geoPinError && geoPinRows && (
                <div className="px-6 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-5 text-sm">
                    <div><span className="text-slate-500">{({ pincode: 'Pincodes', city: 'Cities', district: 'Districts', state: 'States' } as const)[geoPinGeo]}</span> <span className="font-bold tabular-nums">{geoPinRows.length.toLocaleString()}</span></div>
                    <div><span className="text-slate-500">Buyers</span> <span className="font-bold tabular-nums">{geoPinGrand.buyers.toLocaleString()}</span></div>
                    <div><span className="text-slate-500">Orders</span> <span className="font-bold tabular-nums">{geoPinGrand.count.toLocaleString()}</span></div>
                    <div><span className="text-slate-500">Sale</span> <span className="font-bold tabular-nums">{formatAmount(geoPinGrand.amount)}</span></div>
                  </div>
                  <input
                    type="text"
                    value={geoPinSearch}
                    onChange={(e) => setGeoPinSearch(e.target.value)}
                    placeholder={`Search ${geoPinGeo}…`}
                    className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 w-64 max-w-full"
                  />
                </div>
              )}
              <div className="flex-1 overflow-auto">
                {geoPinLoading ? (
                  <div className="px-6 py-12 text-center text-slate-500">Loading {geoPinGeo} breakdown…</div>
                ) : geoPinError ? (
                  <div className="px-6 py-12 text-center text-rose-600">Error: {geoPinError}</div>
                ) : !geoPinRows || geoPinRows.length === 0 ? (
                  <div className="px-6 py-12 text-center text-slate-500">No orders for this selection.</div>
                ) : (
                  (() => {
                    const q = geoPinSearch.trim().toLowerCase();
                    const filtered = q
                      ? geoPinRows.filter((r) =>
                          [r.pincode, r.city, r.district, r.state].some((v) => (v || '').toLowerCase().includes(q)))
                      : geoPinRows;
                    // Geo columns shown depend on the drilled level (e.g. state view drops pincode/city/district).
                    const geoCols: { key: keyof GeoPinRow; label: string }[] = (
                      geoPinGeo === 'state' ? [{ key: 'state', label: 'State' }]
                      : geoPinGeo === 'district' ? [{ key: 'district', label: 'District' }, { key: 'state', label: 'State' }]
                      : geoPinGeo === 'city' ? [{ key: 'city', label: 'City' }, { key: 'district', label: 'District' }, { key: 'state', label: 'State' }]
                      : [{ key: 'pincode', label: 'Pincode' }, { key: 'city', label: 'City' }, { key: 'district', label: 'District' }, { key: 'state', label: 'State' }]
                    );
                    return (
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-slate-100 z-10">
                          <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                            {geoCols.map((c, ci) => (
                              <th key={c.key} className={`${ci === 0 ? 'px-5' : 'px-3'} py-2.5 font-semibold`}>{c.label}</th>
                            ))}
                            <th className="px-5 py-2.5 font-semibold text-right">Buyers</th>
                            <th className="px-5 py-2.5 font-semibold text-right">Orders</th>
                            <th className="px-5 py-2.5 font-semibold text-right">Order Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filtered.map((r, i) => (
                            <tr key={`${geoCols.map((c) => r[c.key]).join('|')}-${i}`} className="hover:bg-indigo-50/60">
                              {geoCols.map((c, ci) => (
                                <td key={c.key} className={`${ci === 0 ? 'px-5' : 'px-3'} py-2.5 ${c.key === 'pincode' ? 'font-mono font-semibold text-slate-900' : 'text-slate-700'}`}>
                                  {(r[c.key] as string) || '—'}
                                </td>
                              ))}
                              <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-emerald-700">{r.buyers.toLocaleString()}</td>
                              <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-slate-900">{r.count.toLocaleString()}</td>
                              <td className="px-5 py-2.5 text-right tabular-nums text-indigo-700 font-semibold">{formatAmount(r.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()
                )}
              </div>
            </div>
          </div>
        )}

        {/* Rejection Reason Breakdown Pivot Table */}
        <div className="mt-8 mb-8">
          <RejectionReasonPivotTable
            onViewItems={openPoItemsModal}
            onBuyerClick={openBuyerModal}
            onSellerClick={openSellerModal}
          />
        </div>

        {/* MonthWiseOrder funnel — rows = months desc, cols = totals + 5 stages */}
        <div className="mt-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25),inset_0_0_30px_rgba(168,85,247,0.12)] funnel-monthwise-marker">
          <div className="px-8 py-6 border-b border-white/10 bg-white/5 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white">MonthWiseOrder</h2>
              <p className="text-purple-300 text-sm mt-1">
                Months × stages, bucketed by <span className="font-mono text-fuchsia-300">created_at</span>
                {funnelData?.startDate && funnelData?.endDate && ` · ${funnelData.startDate} → ${funnelData.endDate}`}
                {!funnelData?.startDate && !funnelData?.endDate && ' · all time'}
                {' · '}<span className="text-purple-300/70">DRAFT included; no delivery-network filter</span>
                {' · '}<span className="text-fuchsia-300/80">click any cell to drill into orders</span>
              </p>
            </div>
            {funnelData && funnelData.data.length > 0 && (
              <button
                className={DOWNLOAD_BTN_CLASS}
                onClick={() => {
                  const headers = [
                    'Month', 'Total POs', 'Total Amount',
                    'Draft Count', 'Draft Amount', 'Draft %', 'Draft Buyers', 'Draft Sellers',
                    'Order Punched Count', 'Order Punched Amount', 'Order Punched %', 'Order Punched Buyers', 'Order Punched Sellers',
                    'Pending Count', 'Pending Amount', 'Pending %', 'Pending Buyers', 'Pending Sellers',
                    'InProgress Count', 'InProgress Amount', 'InProgress %', 'InProgress Buyers', 'InProgress Sellers',
                    'Fulfilled Count', 'Fulfilled Amount', 'Fulfilled %', 'Fulfilled Buyers', 'Fulfilled Sellers',
                  ];
                  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                  const pct = (n: number, d: number) => d > 0 ? Number(((n / d) * 100).toFixed(1)) : 0;
                  const rows: CsvCell[][] = funnelData.data.map((m) => {
                    const label = `${monthNames[m.month - 1]} ${m.year}`;
                    return [
                      label, m.totalCount, m.totalAmount,
                      m.draft.count,        m.draft.amount,        pct(m.draft.count, m.totalCount),        m.draft.buyers,        m.draft.sellers,
                      m.orderPunched.count, m.orderPunched.amount, pct(m.orderPunched.count, m.totalCount), m.orderPunched.buyers, m.orderPunched.sellers,
                      m.pending.count,      m.pending.amount,      pct(m.pending.count, m.totalCount),      m.pending.buyers,      m.pending.sellers,
                      m.inProgress.count,   m.inProgress.amount,   pct(m.inProgress.count, m.totalCount),   m.inProgress.buyers,   m.inProgress.sellers,
                      m.fulfilled.count,    m.fulfilled.amount,    pct(m.fulfilled.count, m.totalCount),    m.fulfilled.buyers,    m.fulfilled.sellers,
                    ];
                  });
                  const rangeSuffix = funnelData.startDate && funnelData.endDate
                    ? `${funnelData.startDate}_${funnelData.endDate}`
                    : 'all-time';
                  downloadCSV(`month-wise-order-${rangeSuffix}.csv`, headers, rows);
                }}
              >
                ↓ CSV
              </button>
            )}
          </div>
          {/* Range chips */}
          <div className="px-8 py-3 border-b border-white/10 bg-white/5 flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-purple-300 uppercase tracking-wide">created_at</span>
            {([
              { key: 'all',    label: 'All time' },
              { key: 'year',   label: `${currentYear}` },
              { key: '12mo',   label: 'Last 12 months' },
              { key: '30d',    label: 'Last 30 days' },
              { key: '7d',     label: 'Last 7 days' },
              { key: 'today',  label: 'Today' },
              { key: 'custom', label: 'Custom' },
            ] as const).map((opt) => {
              const active = funnelRange === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setFunnelRange(opt.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    active
                      ? 'bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white shadow-[0_0_18px_rgba(217,70,239,0.4)]'
                      : 'bg-white/10 text-purple-200 hover:bg-white/15 border border-white/10'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
            {funnelRange === 'custom' && (
              <div className="flex items-center gap-2 ml-2">
                <input
                  type="date"
                  value={funnelCustomFrom}
                  onChange={(e) => setFunnelCustomFrom(e.target.value)}
                  className="px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                />
                <span className="text-purple-300 text-xs">to</span>
                <input
                  type="date"
                  value={funnelCustomTo}
                  onChange={(e) => setFunnelCustomTo(e.target.value)}
                  className="px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                />
              </div>
            )}
          </div>
          {/* Table — months desc, totals + 5 stages */}
          <div className="overflow-x-auto">
            {funnelLoading || !funnelData ? (
              <div className="px-8 py-12 text-center text-purple-300">Loading…</div>
            ) : funnelData.data.length === 0 ? (
              <div className="px-8 py-12 text-center text-purple-300">No orders in this range</div>
            ) : (() => {
              const months = funnelData.data; // already sorted desc
              const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
              const dayName = (d: Date) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
              const labelFor = (y: number, m: number) => {
                const d = new Date(y, m - 1, 1);
                return `${dayName(d)}, ${monthNames[m - 1]} 1, ${y}`;
              };
              // Heatmap helpers — min/max across both numeric totals columns separately.
              const counts  = months.map((r) => r.totalCount);
              const amounts = months.map((r) => r.totalAmount);
              const cMin = Math.min(...counts),  cMax = Math.max(...counts);
              const aMin = Math.min(...amounts), aMax = Math.max(...amounts);
              const heatColor = (v: number, lo: number, hi: number) => {
                if (hi === lo) return 'rgba(255,255,255,0.04)';
                const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
                // red (0 hue) -> green (140 hue) via olive midpoint
                const hue = Math.round(t * 140);
                const sat = 60;
                const light = 24 + Math.round(t * 6); // 24%..30%
                return `hsl(${hue}, ${sat}%, ${light}%)`;
              };
              const heatText = (v: number, lo: number, hi: number) => {
                if (hi === lo) return 'text-white';
                const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
                if (t > 0.6) return 'text-emerald-100';
                if (t < 0.4) return 'text-rose-100';
                return 'text-amber-100';
              };
              // Stage cell formatter — "count | ₹amount | pct% | buyers | sellers"
              const fmtStage = (s: FunnelStage, total: number) => {
                const pct = total > 0 ? ((s.count / total) * 100).toFixed(1) : '0.0';
                return { pct, count: s.count.toLocaleString('en-IN'), amount: s.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 }), buyers: s.buyers.toLocaleString('en-IN'), sellers: s.sellers.toLocaleString('en-IN') };
              };
              const stageCols: Array<{ label: string; key: 'draft' | 'orderPunched' | 'pending' | 'inProgress' | 'fulfilled'; tone: string }> = [
                { label: 'Draft',          key: 'draft',        tone: 'text-purple-100' },
                { label: 'Order Punched',  key: 'orderPunched', tone: 'text-fuchsia-200' },
                { label: 'Pending',        key: 'pending',      tone: 'text-amber-200' },
                { label: 'InProgress',     key: 'inProgress',   tone: 'text-sky-200' },
                { label: 'Fulfilled',      key: 'fulfilled',    tone: 'text-emerald-200' },
              ];
              return (
                <table className="text-[11px] border-separate border-spacing-0 min-w-full">
                  <thead className="sticky top-0 z-10 bg-slate-900">
                    <tr>
                      <th className="sticky left-0 z-20 bg-slate-900 border-b border-r border-white/10 px-3 py-2 text-left font-semibold text-purple-200 uppercase tracking-wider whitespace-nowrap min-w-[200px]">
                        monthly
                      </th>
                      <th className="bg-slate-900 border-b border-white/10 px-3 py-2 text-right font-semibold text-purple-200 uppercase tracking-wider whitespace-nowrap">
                        totalpo
                      </th>
                      <th className="bg-slate-900 border-b border-r border-white/10 px-3 py-2 text-right font-semibold text-purple-200 uppercase tracking-wider whitespace-nowrap">
                        totalamount
                      </th>
                      {stageCols.map((sc) => (
                        <th
                          key={sc.key}
                          className={`bg-slate-900 border-b border-r border-white/10 px-3 py-2 text-left font-semibold ${sc.tone} whitespace-nowrap`}
                        >
                          {sc.label} <span className="text-purple-300/50 font-normal normal-case">· orders · ₹ · buyers/sellers</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((m) => {
                      const label = labelFor(m.year, m.month);
                      return (
                        <tr key={`${m.year}-${m.month}`} className="hover:bg-white/5">
                          <td className="sticky left-0 z-10 bg-slate-900 border-b border-r border-white/10 px-3 py-2 font-medium text-white whitespace-nowrap">
                            {label}, 00:00
                          </td>
                          <td
                            onClick={() => openFunnelDrill(m.year, m.month, 'total', `All orders — ${label}`)}
                            title={`View all orders for ${label}`}
                            className={`border-b border-white/10 px-3 py-2 text-right tabular-nums font-bold cursor-pointer hover:brightness-125 transition ${heatText(m.totalCount, cMin, cMax)}`}
                            style={{ background: heatColor(m.totalCount, cMin, cMax) }}
                          >
                            {m.totalCount.toLocaleString('en-IN')}
                          </td>
                          <td
                            onClick={() => openFunnelDrill(m.year, m.month, 'total', `All orders — ${label}`)}
                            title={`View all orders for ${label}`}
                            className={`border-b border-r border-white/10 px-3 py-2 text-right tabular-nums font-bold cursor-pointer hover:brightness-125 transition ${heatText(m.totalAmount, aMin, aMax)}`}
                            style={{ background: heatColor(m.totalAmount, aMin, aMax) }}
                          >
                            ₹{m.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </td>
                          {stageCols.map((sc) => {
                            const s = m[sc.key];
                            const f = fmtStage(s, m.totalCount);
                            return (
                              <td
                                key={sc.key}
                                className={`border-b border-r border-white/10 p-1.5 align-top ${sc.tone}`}
                              >
                                <button
                                  type="button"
                                  onClick={() => openFunnelDrill(m.year, m.month, sc.key, `${sc.label} — ${label}`)}
                                  title={`View ${sc.label} orders for ${label}`}
                                  className="w-full min-w-[140px] text-left rounded-md px-2 py-1.5 hover:bg-white/10 transition-colors cursor-pointer"
                                >
                                  <div className="flex items-baseline justify-between gap-2">
                                    <span className="text-[13px] font-bold tabular-nums text-white">{f.count}</span>
                                    <span className="text-[10px] font-semibold tabular-nums opacity-80">{f.pct}%</span>
                                  </div>
                                  <div className="mt-1 h-1 w-full rounded-full bg-white/10 overflow-hidden">
                                    <div className="h-full rounded-full bg-current opacity-70" style={{ width: `${Math.min(100, parseFloat(f.pct))}%` }} />
                                  </div>
                                  <div className="mt-1 text-[11px] tabular-nums opacity-90">₹{f.amount}</div>
                                  <div className="text-[10px] tabular-nums opacity-60">{f.buyers} buyers · {f.sellers} sellers</div>
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              );
            })()}
          </div>
          {funnelData && funnelData.data.length > 0 && (
            <div className="px-8 py-2 border-t border-white/10 bg-white/5 text-right text-xs text-purple-300/70">
              {funnelData.data.length} {funnelData.data.length === 1 ? 'row' : 'rows'}
            </div>
          )}
        </div>

        </>
        )}

        {activeTab === 'trend' && (
        <>
        {/* ── BA Insights: KPI strip · status-mix donuts · revenue & growth trend ── */}
        {monthlyData && monthlyData.data.length > 0 && (() => {
          const STATUS_COLORS: Record<string, string> = {
            COMPLETED: '#22c55e',
            DISPATCHED: '#6366f1',
            INPROGRESS: '#d946ef',
            PENDING: '#f59e0b',
            REJECTED: '#ef4444',
            CANCELLED: '#64748b',
            DRAFT: '#475569',
          };
          const FALLBACK = ['#06b6d4', '#a855f7', '#ec4899', '#14b8a6', '#f97316', '#eab308'];
          const colorFor = (status: string, i: number) => STATUS_COLORS[status] || FALLBACK[i % FALLBACK.length];

          const grand = monthlyData.totals.grand;
          const statusRows = [...monthlyData.data].sort((a, b) => b.total.count - a.total.count);

          const activeMonths: number[] = [];
          for (let m = 1; m <= 12; m++) {
            const c = monthlyData.totals.byMonth[m];
            if (c && c.count > 0) activeMonths.push(m);
          }
          const monthlyTrend = activeMonths.map((m, i) => {
            const cur = monthlyData.totals.byMonth[m];
            const prev = i > 0 ? monthlyData.totals.byMonth[activeMonths[i - 1]] : null;
            const growth = prev && prev.amount > 0 ? ((cur.amount - prev.amount) / prev.amount) * 100 : null;
            const ordGrowth = prev && prev.count > 0 ? ((cur.count - prev.count) / prev.count) * 100 : null;
            return { month: `${MONTH_NAMES[m - 1]}`, revenue: cur.amount, orders: cur.count, growth, ordGrowth };
          });

          const aov = grand.count > 0 ? grand.amount / grand.count : 0;
          const completed = statusRows.find((r) => r.status === 'COMPLETED')?.total.count || 0;
          const completionRate = grand.count > 0 ? (completed / grand.count) * 100 : 0;
          const rejected = statusRows.find((r) => r.status === 'REJECTED')?.total.count || 0;
          const rejectRate = grand.count > 0 ? (rejected / grand.count) * 100 : 0;
          const last = monthlyTrend[monthlyTrend.length - 1];
          const momRev = last?.growth ?? null;
          const momOrders = last?.ordGrowth ?? null;
          const peak = monthlyTrend.length ? [...monthlyTrend].sort((a, b) => b.revenue - a.revenue)[0] : null;

          const countMix = statusRows.map((r) => ({ name: r.status, value: r.total.count }));
          const revMix = [...statusRows].sort((a, b) => b.total.amount - a.total.amount).map((r) => ({ name: r.status, value: r.total.amount }));

          const dispatched = statusRows.find((r) => r.status === 'DISPATCHED')?.total.count || 0;
          const cancelled = statusRows.find((r) => r.status === 'CANCELLED')?.total.count || 0;
          const fulfilledRate = grand.count > 0 ? ((completed + dispatched) / grand.count) * 100 : 0;

          // Per-month series for AOV trajectory + cumulative revenue (running total).
          let runRev = 0;
          let runOrders = 0;
          const monthSeries = activeMonths.map((m) => {
            const c = monthlyData.totals.byMonth[m];
            runRev += c.amount;
            runOrders += c.count;
            return {
              month: MONTH_NAMES[m - 1],
              revenue: c.amount,
              orders: c.count,
              aov: c.count > 0 ? c.amount / c.count : 0,
              cumRevenue: runRev,
              cumOrders: runOrders,
            };
          });
          const peakAov = monthSeries.length ? [...monthSeries].sort((a, b) => b.aov - a.aov)[0] : null;

          const gauges = [
            { label: 'Completion Rate', value: completionRate, color: '#22c55e', sub: `${completed.toLocaleString('en-IN')} completed` },
            { label: 'Fulfilled', value: fulfilledRate, color: '#6366f1', sub: `${(completed + dispatched).toLocaleString('en-IN')} dispatched + completed` },
            { label: 'Rejection Rate', value: rejectRate, color: '#ef4444', sub: `${rejected.toLocaleString('en-IN')} rejected` },
          ];

          const pct = (v: number, t: number) => (t > 0 ? (v / t) * 100 : 0);
          const fmtSignedPct = (n: number | null) => (n === null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`);
          const trendTone = (n: number | null) => (n === null ? 'text-white/40' : n >= 0 ? 'text-emerald-400' : 'text-rose-400');

          const kpis = [
            { label: 'Total Orders', value: grand.count.toLocaleString('en-IN'), sub: `${activeMonths.length} active months`, tone: 'text-white' },
            { label: 'Total Revenue', value: formatAmount(grand.amount), sub: `${currentYear} YTD`, tone: 'text-white' },
            { label: 'Avg Order Value', value: formatAmount(aov), sub: 'revenue ÷ orders', tone: 'text-white' },
            { label: 'Completion Rate', value: `${completionRate.toFixed(1)}%`, sub: `${completed.toLocaleString('en-IN')} completed`, tone: 'text-emerald-300' },
            { label: 'Rejection Rate', value: `${rejectRate.toFixed(1)}%`, sub: `${rejected.toLocaleString('en-IN')} rejected`, tone: 'text-rose-300' },
            { label: 'MoM Revenue', value: fmtSignedPct(momRev), sub: last ? `${last.month} vs prev` : '—', tone: trendTone(momRev) },
          ];

          const renderDonut = (title: string, subtitle: string, data: { name: string; value: number }[], total: number, fmt: (v: number) => string) => (
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.18)]">
              <div className="px-6 py-5 border-b border-white/10 bg-white/5">
                <h3 className="text-lg font-bold text-white">{title}</h3>
                <p className="text-purple-300 text-xs mt-0.5">{subtitle}</p>
              </div>
              <div className="p-5 flex flex-col sm:flex-row items-center gap-4">
                <div className="relative shrink-0" style={{ width: 200, height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={62} outerRadius={92} paddingAngle={2} stroke="none" isAnimationActive={false} cursor="pointer" onClick={(d: any) => openStatusDrill(d?.name ?? d?.payload?.name)}>
                        {data.map((d, i) => <Cell key={d.name} fill={colorFor(d.name, i)} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(217,70,239,0.4)', borderRadius: 10, color: '#fff', fontSize: 12 }}
                        formatter={(value) => { const n = Number(value); return [`${fmt(n)} (${pct(n, total).toFixed(1)}%)`, '']; }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[10px] uppercase tracking-widest text-purple-300/70">Total</span>
                    <span className="text-xl font-extrabold text-white">{fmt(total)}</span>
                  </div>
                </div>
                <div className="flex-1 w-full space-y-1.5">
                  {data.map((d, i) => (
                    <div key={d.name} onClick={() => openStatusDrill(d.name)} className="flex items-center gap-2 text-xs cursor-pointer rounded-md px-1.5 py-1 -mx-1.5 hover:bg-white/10 transition-colors">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colorFor(d.name, i) }} />
                      <span className="text-white/80 font-medium w-24 truncate">{d.name}</span>
                      <span className="text-white/50 tabular-nums ml-auto">{fmt(d.value)}</span>
                      <span className="text-white font-semibold tabular-nums w-14 text-right">{pct(d.value, total).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );

          const renderGauge = (g: { label: string; value: number; color: string; sub: string }) => (
            <div key={g.label} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.18)]">
              <div className="px-6 py-4 border-b border-white/10 bg-white/5">
                <h3 className="text-base font-bold text-white">{g.label}</h3>
              </div>
              <div className="relative" style={{ height: 210 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart innerRadius="72%" outerRadius="100%" data={[{ name: g.label, value: Math.min(g.value, 100), fill: g.color }]} startAngle={90} endAngle={-270}>
                    <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                    <RadialBar background={{ fill: 'rgba(255,255,255,0.06)' }} dataKey="value" cornerRadius={16} isAnimationActive={false} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-4 text-center">
                  <span className="text-4xl font-extrabold tabular-nums" style={{ color: g.color, textShadow: `0 0 18px ${g.color}66` }}>{g.value.toFixed(1)}%</span>
                  <span className="text-[11px] text-white/50 mt-1.5">{g.sub}</span>
                </div>
              </div>
            </div>
          );

          return (
            <div className="mb-8 space-y-6">
              {/* KPI strip */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {kpis.map((k) => (
                  <div key={k.label} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/40">
                    <div className="text-[11px] uppercase tracking-wider text-purple-300/80 font-semibold">{k.label}</div>
                    <div className={`text-2xl font-extrabold mt-1 tabular-nums ${k.tone}`}>{k.value}</div>
                    <div className="text-[11px] text-white/50 mt-0.5">{k.sub}</div>
                  </div>
                ))}
              </div>

              {/* Status-mix donuts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {renderDonut('Order Mix by Status', `Share of ${grand.count.toLocaleString('en-IN')} orders · ${currentYear}`, countMix, grand.count, (v) => Math.round(v).toLocaleString('en-IN'))}
                {renderDonut('Revenue Mix by Status', `Share of ${formatAmount(grand.amount)} revenue · ${currentYear}`, revMix, grand.amount, formatAmount)}
              </div>

              {/* Monthly Revenue & MoM Growth */}
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.18)]">
                <div className="px-8 py-6 border-b border-white/10 bg-white/5 flex items-start justify-between flex-wrap gap-4">
                  <div>
                    <h3 className="text-2xl font-bold text-white">Monthly Revenue & Orders</h3>
                    <p className="text-purple-300 text-sm mt-1">Revenue bars with order-volume trend line — {currentYear}</p>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    {peak && (
                      <div className="px-3 py-2 rounded-xl bg-slate-900/70 border border-white/10">
                        <div className="text-purple-300/70 uppercase tracking-wide text-[10px]">Peak month</div>
                        <div className="text-white font-bold mt-0.5">{peak.month} · {formatAmount(peak.revenue)}</div>
                      </div>
                    )}
                    <div className="px-3 py-2 rounded-xl bg-slate-900/70 border border-white/10">
                      <div className="text-purple-300/70 uppercase tracking-wide text-[10px]">MoM orders</div>
                      <div className={`font-bold mt-0.5 ${trendTone(momOrders)}`}>{fmtSignedPct(momOrders)}</div>
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  <ResponsiveContainer width="100%" height={360}>
                    <ComposedChart data={monthlyTrend} margin={{ top: 28, right: 16, left: 8, bottom: 8 }} style={{ cursor: 'pointer' }} onClick={(s: any) => openMonthDrill(s?.activeLabel)}>
                      <defs>
                        <linearGradient id="gradRevBar" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#a855f7" stopOpacity={0.95} />
                          <stop offset="100%" stopColor="#6366f1" stopOpacity={0.55} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="month" tick={{ fill: 'rgba(216,180,254,0.7)', fontSize: 11 }} />
                      <YAxis
                        yAxisId="left"
                        tick={{ fill: 'rgba(216,180,254,0.7)', fontSize: 11 }}
                        tickFormatter={(v: number) => {
                          if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
                          if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
                          if (v >= 1000) return `₹${(v / 1000).toFixed(0)}K`;
                          return `₹${v}`;
                        }}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fill: 'rgba(103,232,249,0.8)', fontSize: 11 }}
                        tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}K` : `${v}`)}
                        width={50}
                      />
                      <Tooltip
                        contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(217,70,239,0.4)', borderRadius: 10, color: '#fff', fontSize: 12 }}
                        labelStyle={{ color: '#f0abfc', fontWeight: 700 }}
                        formatter={(value, name) => {
                          const n = Number(value);
                          if (name === 'Revenue') return [formatAmount(n), 'Revenue'];
                          if (name === 'Orders') return [n.toLocaleString('en-IN'), 'Orders'];
                          return [String(value), String(name)];
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12, color: '#e9d5ff' }} />
                      <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="url(#gradRevBar)" radius={[6, 6, 0, 0]} maxBarSize={48}>
                        <LabelList
                          dataKey="revenue"
                          position="insideTop"
                          offset={8}
                          formatter={(v: unknown) => formatAmount(Number(v))}
                          style={{ fill: '#fdf4ff', fontSize: 10, fontWeight: 700, paintOrder: 'stroke', stroke: '#1e1b4b', strokeWidth: 3, strokeLinejoin: 'round' }}
                        />
                      </Bar>
                      <Line yAxisId="right" dataKey="orders" name="Orders" stroke="#22d3ee" strokeWidth={2.5} dot={{ r: 3, fill: '#22d3ee' }} activeDot={{ r: 5 }} isAnimationActive={false}>
                        <LabelList
                          dataKey="orders"
                          position="top"
                          offset={14}
                          formatter={(v: unknown) => Number(v).toLocaleString('en-IN')}
                          style={{ fill: '#67e8f9', fontSize: 10, fontWeight: 700, paintOrder: 'stroke', stroke: '#0f172a', strokeWidth: 3, strokeLinejoin: 'round' }}
                        />
                      </Line>
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Health gauges */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {gauges.map(renderGauge)}
              </div>

              {/* AOV trend + cumulative revenue */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Average Order Value trend */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.18)]">
                  <div className="px-6 py-5 border-b border-white/10 bg-white/5 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-white">Average Order Value</h3>
                      <p className="text-purple-300 text-xs mt-0.5">Revenue ÷ orders, per month · {currentYear}</p>
                    </div>
                    {peakAov && (
                      <div className="px-3 py-2 rounded-xl bg-slate-900/70 border border-white/10 text-right shrink-0">
                        <div className="text-purple-300/70 uppercase tracking-wide text-[10px]">Peak AOV</div>
                        <div className="text-fuchsia-300 font-bold mt-0.5">{peakAov.month} · {formatAmount(peakAov.aov)}</div>
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart data={monthSeries} margin={{ top: 10, right: 12, left: 4, bottom: 4 }} style={{ cursor: 'pointer' }} onClick={(s: any) => openMonthDrill(s?.activeLabel)}>
                        <defs>
                          <linearGradient id="gradAov" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#e879f9" stopOpacity={0.55} />
                            <stop offset="100%" stopColor="#a855f7" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="month" tick={{ fill: 'rgba(216,180,254,0.7)', fontSize: 11 }} />
                        <YAxis
                          tick={{ fill: 'rgba(216,180,254,0.7)', fontSize: 11 }}
                          width={52}
                          tickFormatter={(v: number) => (v >= 1000 ? `₹${(v / 1000).toFixed(1)}K` : `₹${Math.round(v)}`)}
                        />
                        <Tooltip
                          contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(217,70,239,0.4)', borderRadius: 10, color: '#fff', fontSize: 12 }}
                          labelStyle={{ color: '#f0abfc', fontWeight: 700 }}
                          formatter={(value) => [formatAmount(Number(value)), 'Avg Order Value']}
                        />
                        <Area dataKey="aov" name="Avg Order Value" stroke="#e879f9" strokeWidth={2.5} fill="url(#gradAov)" dot={{ r: 3, fill: '#e879f9' }} activeDot={{ r: 5 }} isAnimationActive={false}>
                          <LabelList dataKey="aov" position="top" offset={8} formatter={(v: unknown) => formatAmount(Number(v))} style={{ fill: '#f0abfc', fontSize: 10, fontWeight: 700 }} />
                        </Area>
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Cumulative revenue */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.18)]">
                  <div className="px-6 py-5 border-b border-white/10 bg-white/5 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-white">Cumulative Revenue</h3>
                      <p className="text-purple-300 text-xs mt-0.5">Running total across {currentYear}</p>
                    </div>
                    <div className="px-3 py-2 rounded-xl bg-slate-900/70 border border-white/10 text-right shrink-0">
                      <div className="text-purple-300/70 uppercase tracking-wide text-[10px]">YTD total</div>
                      <div className="text-cyan-300 font-bold mt-0.5">{formatAmount(grand.amount)}</div>
                    </div>
                  </div>
                  <div className="p-5">
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart data={monthSeries} margin={{ top: 10, right: 12, left: 4, bottom: 4 }} style={{ cursor: 'pointer' }} onClick={(s: any) => openMonthDrill(s?.activeLabel)}>
                        <defs>
                          <linearGradient id="gradCum" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.55} />
                            <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="month" tick={{ fill: 'rgba(216,180,254,0.7)', fontSize: 11 }} />
                        <YAxis
                          tick={{ fill: 'rgba(216,180,254,0.7)', fontSize: 11 }}
                          width={56}
                          tickFormatter={(v: number) => {
                            if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
                            if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
                            if (v >= 1000) return `₹${(v / 1000).toFixed(0)}K`;
                            return `₹${v}`;
                          }}
                        />
                        <Tooltip
                          contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(217,70,239,0.4)', borderRadius: 10, color: '#fff', fontSize: 12 }}
                          labelStyle={{ color: '#f0abfc', fontWeight: 700 }}
                          formatter={(value) => [formatAmount(Number(value)), 'Cumulative']}
                        />
                        <Area dataKey="cumRevenue" name="Cumulative" stroke="#22d3ee" strokeWidth={2.5} fill="url(#gradCum)" dot={{ r: 3, fill: '#22d3ee' }} activeDot={{ r: 5 }} isAnimationActive={false}>
                          <LabelList dataKey="cumRevenue" position="top" offset={8} formatter={(v: unknown) => formatAmount(Number(v))} style={{ fill: '#67e8f9', fontSize: 10, fontWeight: 700 }} />
                        </Area>
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* === RTO Insights (COD×Coupon · order-value buckets · city tier) === */}
        {rtoInsights && (
          <div className={`mb-8 space-y-6 ${rtoInsightsLoading ? 'opacity-60 transition-opacity' : ''}`}>
            {/* COD vs. Coupon Applied vs. RTO */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.18)]">
              <div className="px-6 py-5 border-b border-white/10 bg-white/5 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white">COD vs. Coupon Applied vs. RTO</h3>
                  <p className="text-purple-300 text-xs mt-0.5">RTO rate by coupon status × payment mode · % of (RTO + Delivered) · D2R third-party INTERCITY</p>
                </div>
                {queryBtn('rtoInsights', 'RTO Insights — COD vs Coupon vs RTO')}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-purple-200 w-8">#</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-purple-200">Coupon Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-purple-200">Payment Mode</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-purple-200">Total Orders</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-purple-200">Delivered Count</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-purple-200">RTO Count</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-purple-200">RTO % (of RTO+Delivered)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rtoInsights.codCoupon.map((r, i) => {
                      const pct = r.rtoPct ?? 0;
                      const pctClass = pct >= 30 ? 'text-rose-300' : pct >= 15 ? 'text-amber-300' : 'text-emerald-300';
                      return (
                        <tr key={`${r.couponStatus}|${r.paymentMode}`} className="border-b border-white/5 hover:bg-fuchsia-500/10 transition-colors">
                          <td className="px-4 py-3 text-purple-300/60 tabular-nums">{i + 1}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold ${r.couponStatus === 'Coupon Applied' ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/30' : 'bg-sky-500/15 text-sky-200 border border-sky-400/30'}`}>{r.couponStatus}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold ${r.paymentMode === 'COD' ? 'bg-amber-500/15 text-amber-200 border border-amber-400/30' : 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/30'}`}>{r.paymentMode}</span>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-white">{r.totalOrders.toLocaleString('en-IN')}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-purple-100">{r.deliveredCount.toLocaleString('en-IN')}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-rose-200 font-semibold">{r.rtoCount.toLocaleString('en-IN')}</td>
                          <td className={`px-4 py-3 text-right tabular-nums font-bold ${pctClass}`}>{r.rtoPct === null ? '—' : `${r.rtoPct}%`}</td>
                        </tr>
                      );
                    })}
                    {rtoInsights.codCoupon.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-purple-300/60">No orders in this range.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Order Amount Bucket wise RTO Count & % */}
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.18)]">
                <div className="px-6 py-5 border-b border-white/10 bg-white/5">
                  <h3 className="text-lg font-bold text-white">Order Amount Bucket wise RTO</h3>
                  <p className="text-purple-300 text-xs mt-0.5">RTO count, rate & ₹ value by order-value band</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-white/5 border-b border-white/10">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-purple-200">Order Value Bucket</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-purple-200">Delivered</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-purple-200">RTO Count</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-purple-200">RTO %</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-purple-200">RTO Amount</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-purple-200">RTO Amt %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rtoInsights.bucket.map((r) => {
                        const pct = r.rtoPct ?? 0;
                        const pctClass = pct >= 30 ? 'text-rose-300' : pct >= 15 ? 'text-amber-300' : 'text-emerald-300';
                        return (
                          <tr key={r.bucket} className="border-b border-white/5 hover:bg-fuchsia-500/10 transition-colors">
                            <td className="px-4 py-3 text-white font-medium">{r.bucket}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-purple-100">{r.deliveredCount.toLocaleString('en-IN')}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-rose-200 font-semibold">{r.rtoCount.toLocaleString('en-IN')}</td>
                            <td className={`px-4 py-3 text-right tabular-nums font-bold ${pctClass}`}>{r.rtoPct === null ? '—' : `${r.rtoPct}%`}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-purple-100">{formatAmount(r.rtoAmount)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-purple-200/80">{r.rtoAmountPct === null ? '—' : `${r.rtoAmountPct}%`}</td>
                          </tr>
                        );
                      })}
                      {rtoInsights.bucket.length === 0 && (
                        <tr><td colSpan={6} className="px-4 py-8 text-center text-purple-300/60">No orders in this range.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* RTO by TIER 1/2/3/4 City */}
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.18)]">
                <div className="px-6 py-5 border-b border-white/10 bg-white/5">
                  <h3 className="text-lg font-bold text-white">RTO by TIER 1/2/3/4 City</h3>
                  <p className="text-purple-300 text-xs mt-0.5">Share of RTO orders by buyer-city tier</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-white/5 border-b border-white/10">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-purple-200">City Tier</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-purple-200">RTO Orders</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-purple-200">Contribution %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rtoInsights.tier.map((r) => {
                        const c = r.contributionPct ?? 0;
                        const cClass = c >= 50 ? 'text-rose-300' : c >= 20 ? 'text-amber-300' : 'text-emerald-300';
                        return (
                          <tr key={r.cityTier} className="border-b border-white/5 hover:bg-fuchsia-500/10 transition-colors">
                            <td className="px-4 py-3 text-white font-medium">{r.cityTier}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-rose-200 font-semibold">{r.rtoOrders.toLocaleString('en-IN')}</td>
                            <td className={`px-4 py-3 text-right tabular-nums font-bold ${cClass}`}>{r.contributionPct === null ? '—' : `${r.contributionPct}%`}</td>
                          </tr>
                        );
                      })}
                      {rtoInsights.tier.length === 0 && (
                        <tr><td colSpan={3} className="px-4 py-8 text-center text-purple-300/60">No RTO orders in this range.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Daily Order Trend — line chart */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden mb-8 transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25),inset_0_0_30px_rgba(168,85,247,0.12)]">
          <div className="px-8 py-6 border-b border-white/10 bg-white/5 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white">Daily Order Trend</h2>
              <p className="text-purple-300 text-sm mt-1">
                Per-day {trendMetric === 'count' ? 'order count' : 'order value'} —
                <span className="text-fuchsia-300"> all non-DRAFT</span> vs <span className="text-emerald-300">delivered + completed</span>
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {queryBtn('trend', 'Daily Order Trend')}
              {/* metric toggle */}
              <div className="flex gap-1 p-1 bg-white/5 border border-white/10 rounded-xl">
                {(['count', 'amount'] as const).map((m) => {
                  const active = trendMetric === m;
                  return (
                    <button
                      key={m}
                      onClick={() => setTrendMetric(m)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        active
                          ? 'bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 text-white shadow-[0_0_18px_rgba(217,70,239,0.5)]'
                          : 'text-purple-200 hover:bg-white/10'
                      }`}
                    >
                      {m === 'count' ? 'Orders' : 'Revenue'}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Date-range chips */}
          <div className="px-8 py-3 border-b border-white/10 bg-white/5 flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-purple-300 uppercase tracking-wide">Date</span>
            {([
              { key: '7d', label: 'Last 7 days' },
              { key: '30d', label: 'Last 30 days' },
              { key: '90d', label: 'Last 90 days' },
              { key: 'all', label: `${currentYear} (full year)` },
              { key: 'custom', label: 'Custom' },
            ] as const).map((opt) => {
              const active = trendRange === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setTrendRange(opt.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    active
                      ? 'bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white shadow-[0_0_18px_rgba(217,70,239,0.4)]'
                      : 'bg-white/10 text-purple-200 hover:bg-white/15 border border-white/10'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
            <MonthMultiSelect selected={trendMonths} onChange={setTrendMonths} year={currentYear} />
            {trendRange === 'custom' && (
              <div className="flex items-center gap-2 ml-2">
                <input
                  type="date"
                  value={trendCustomFrom}
                  onChange={(e) => setTrendCustomFrom(e.target.value)}
                  className="px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
                <span className="text-purple-300 text-xs">to</span>
                <input
                  type="date"
                  value={trendCustomTo}
                  onChange={(e) => setTrendCustomTo(e.target.value)}
                  className="px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>
            )}
            {trendData && trendData.length > 0 && (
              <span className="ml-auto text-xs text-purple-300/80 tabular-nums">
                {trendData.length} days · {trendData.reduce((s, d) => s + (trendMetric === 'count' ? d.ordersCount : d.ordersAmount), 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })} total {trendMetric === 'count' ? 'orders' : '₹'}
              </span>
            )}
          </div>

          {/* Chart */}
          <div className="p-6">
            {trendLoading || !trendData ? (
              <div className="h-[360px] flex items-center justify-center text-purple-300">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-fuchsia-500/30 border-t-fuchsia-500 animate-spin" />
                  Loading trend…
                </div>
              </div>
            ) : trendData.length === 0 ? (
              <div className="h-[360px] flex items-center justify-center text-purple-300">No data in this range</div>
            ) : (
              <ResponsiveContainer width="100%" height={360}>
                <AreaChart data={trendData} margin={{ top: 10, right: 16, left: 8, bottom: 8 }}>
                  <defs>
                    <linearGradient id="gradOrders" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"  stopColor="#d946ef" stopOpacity={0.55} />
                      <stop offset="100%" stopColor="#d946ef" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gradDelivered" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"  stopColor="#10b981" stopOpacity={0.55} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: 'rgba(216,180,254,0.7)', fontSize: 11 }}
                    tickFormatter={(d: string) => {
                      const [, m, dd] = d.split('-');
                      return `${dd}/${m}`;
                    }}
                    minTickGap={20}
                  />
                  <YAxis
                    tick={{ fill: 'rgba(216,180,254,0.7)', fontSize: 11 }}
                    tickFormatter={(v: number) => {
                      if (trendMetric === 'amount') {
                        if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
                        if (v >= 100000)   return `₹${(v / 100000).toFixed(1)}L`;
                        if (v >= 1000)     return `₹${(v / 1000).toFixed(0)}K`;
                        return `₹${v}`;
                      }
                      if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
                      return String(v);
                    }}
                    width={70}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(15,23,42,0.95)',
                      border: '1px solid rgba(217,70,239,0.4)',
                      borderRadius: 10,
                      color: '#fff',
                      fontSize: 12,
                    }}
                    labelStyle={{ color: '#f0abfc', fontWeight: 700 }}
                    formatter={(value, name) => {
                      const n = typeof value === 'number' ? value : Number(value ?? 0);
                      const v = trendMetric === 'amount' ? formatAmount(n) : n.toLocaleString();
                      return [v, String(name)];
                    }}
                    labelFormatter={(d) => `Date: ${d}`}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#e9d5ff' }} />
                  <Area
                    type="monotone"
                    dataKey={trendMetric === 'count' ? 'ordersCount' : 'ordersAmount'}
                    name="Orders sent"
                    stroke="#d946ef"
                    strokeWidth={2}
                    fill="url(#gradOrders)"
                    activeDot={{ r: 5 }}
                    dot={(p: any) => {
                      const { cx, cy, payload, index } = p;
                      if (cx == null || cy == null) return <g key={index} />;
                      return (
                        <g key={index}>
                          <circle cx={cx} cy={cy} r={10} fill="transparent" style={{ cursor: 'pointer' }} onClick={() => openTrendDrill('', payload)} />
                          <circle cx={cx} cy={cy} r={2.5} fill="#d946ef" stroke="#1e1b4b" strokeWidth={1} style={{ pointerEvents: 'none' }} />
                        </g>
                      );
                    }}
                  >
                    <LabelList
                      dataKey={trendMetric === 'count' ? 'ordersCount' : 'ordersAmount'}
                      position="top"
                      offset={10}
                      formatter={(v: unknown) => {
                        const n = typeof v === 'number' ? v : Number(v ?? 0);
                        if (trendMetric === 'amount') {
                          if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
                          if (n >= 100000)   return `₹${(n / 100000).toFixed(1)}L`;
                          if (n >= 1000)     return `₹${(n / 1000).toFixed(0)}K`;
                          return `₹${n}`;
                        }
                        if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
                        return String(n);
                      }}
                      style={{
                        fill: '#fdf4ff',
                        fontSize: 10,
                        fontWeight: 700,
                        paintOrder: 'stroke',
                        stroke: '#000',
                        strokeWidth: 2,
                        strokeLinecap: 'round',
                        strokeLinejoin: 'round',
                      }}
                    />
                  </Area>
                  <Area
                    type="monotone"
                    dataKey={trendMetric === 'count' ? 'deliveredCount' : 'deliveredAmount'}
                    name="Delivered + Completed"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#gradDelivered)"
                    activeDot={{ r: 5 }}
                    dot={(p: any) => {
                      const { cx, cy, payload, index } = p;
                      if (cx == null || cy == null) return <g key={index} />;
                      return (
                        <g key={index}>
                          <circle cx={cx} cy={cy} r={10} fill="transparent" style={{ cursor: 'pointer' }} onClick={() => openTrendDrill('DELIVERED,COMPLETED', payload)} />
                          <circle cx={cx} cy={cy} r={2.5} fill="#10b981" stroke="#1e1b4b" strokeWidth={1} style={{ pointerEvents: 'none' }} />
                        </g>
                      );
                    }}
                  >
                    <LabelList
                      dataKey={trendMetric === 'count' ? 'deliveredCount' : 'deliveredAmount'}
                      position="bottom"
                      offset={10}
                      formatter={(v: unknown) => {
                        const n = typeof v === 'number' ? v : Number(v ?? 0);
                        if (trendMetric === 'amount') {
                          if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
                          if (n >= 100000)   return `₹${(n / 100000).toFixed(1)}L`;
                          if (n >= 1000)     return `₹${(n / 1000).toFixed(0)}K`;
                          return `₹${n}`;
                        }
                        if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
                        return String(n);
                      }}
                      style={{
                        fill: '#d1fae5',
                        fontSize: 10,
                        fontWeight: 700,
                        paintOrder: 'stroke',
                        stroke: '#000',
                        strokeWidth: 2,
                        strokeLinecap: 'round',
                        strokeLinejoin: 'round',
                      }}
                    />
                  </Area>
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Daily wise completed Order — last 30 days, by markedCompletedTime */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden mb-8 transition-all duration-300 hover:bg-white/10 hover:border-emerald-400/50 hover:shadow-[0_0_50px_rgba(16,185,129,0.22),inset_0_0_30px_rgba(16,185,129,0.10)]">
          <div className="px-8 py-6 border-b border-white/10 bg-white/5 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white">Daily wise completed Order</h2>
              <p className="text-purple-300 text-sm mt-1">
                Per-day <span className="text-emerald-300">completed</span> {dailyCompletedMetric === 'count' ? 'order count' : 'order value'} · last 30 days · 3PL × INTERCITY · D2R
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {queryBtn('dailyCompleted', 'Daily wise completed Order')}
              <div className="flex gap-1 p-1 bg-white/5 border border-white/10 rounded-xl">
                {(['count', 'amount'] as const).map((m) => {
                  const active = dailyCompletedMetric === m;
                  return (
                    <button
                      key={m}
                      onClick={() => setDailyCompletedMetric(m)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        active
                          ? 'bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 text-white shadow-[0_0_18px_rgba(16,185,129,0.5)]'
                          : 'text-purple-200 hover:bg-white/10'
                      }`}
                    >
                      {m === 'count' ? 'Orders' : 'Revenue'}
                    </button>
                  );
                })}
              </div>
              {dailyCompleted && dailyCompleted.length > 0 && (
                <span className="text-xs text-purple-300/80 tabular-nums">
                  {dailyCompleted.length} days · {dailyCompletedMetric === 'count'
                    ? `${dailyCompleted.reduce((s, d) => s + d.ordersCount, 0).toLocaleString('en-IN')} orders`
                    : formatAmount(dailyCompleted.reduce((s, d) => s + d.ordersAmount, 0))}
                </span>
              )}
            </div>
          </div>

          <div className="p-6">
            {dailyCompletedLoading || !dailyCompleted ? (
              <div className="h-[360px] flex items-center justify-center text-purple-300">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin" />
                  Loading completed orders…
                </div>
              </div>
            ) : dailyCompleted.length === 0 ? (
              <div className="h-[360px] flex items-center justify-center text-purple-300">No completed orders in the last 30 days</div>
            ) : (
              <ResponsiveContainer width="100%" height={360}>
                <AreaChart data={dailyCompleted} margin={{ top: 10, right: 16, left: 8, bottom: 8 }}>
                  <defs>
                    <linearGradient id="gradDailyCompleted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"  stopColor="#10b981" stopOpacity={0.55} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: 'rgba(216,180,254,0.7)', fontSize: 11 }}
                    tickFormatter={(d: string) => {
                      const [, m, dd] = d.split('-');
                      return `${dd}/${m}`;
                    }}
                    minTickGap={20}
                  />
                  <YAxis
                    tick={{ fill: 'rgba(216,180,254,0.7)', fontSize: 11 }}
                    tickFormatter={(v: number) => {
                      if (dailyCompletedMetric === 'amount') {
                        if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
                        if (v >= 100000)   return `₹${(v / 100000).toFixed(1)}L`;
                        if (v >= 1000)     return `₹${(v / 1000).toFixed(0)}K`;
                        return `₹${v}`;
                      }
                      if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
                      return String(v);
                    }}
                    width={70}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(15,23,42,0.95)',
                      border: '1px solid rgba(16,185,129,0.4)',
                      borderRadius: 10,
                      color: '#fff',
                      fontSize: 12,
                    }}
                    labelStyle={{ color: '#6ee7b7', fontWeight: 700 }}
                    formatter={(value, name, item) => {
                      const n = typeof value === 'number' ? value : Number(value ?? 0);
                      const v = dailyCompletedMetric === 'amount' ? formatAmount(n) : n.toLocaleString();
                      const aov = item?.payload?.avgOrderAmount;
                      return [`${v}${aov != null ? `  ·  AOV ${formatAmount(aov)}` : ''}`, String(name)];
                    }}
                    labelFormatter={(d) => `Date: ${d}`}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#e9d5ff' }} />
                  <Area
                    type="monotone"
                    dataKey={dailyCompletedMetric === 'count' ? 'ordersCount' : 'ordersAmount'}
                    name="Completed orders"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#gradDailyCompleted)"
                    activeDot={{ r: 5 }}
                    dot={{ r: 2.5, fill: '#10b981', stroke: '#1e1b4b', strokeWidth: 1 }}
                  >
                    <LabelList
                      dataKey={dailyCompletedMetric === 'count' ? 'ordersCount' : 'ordersAmount'}
                      position="top"
                      offset={10}
                      formatter={(v: unknown) => {
                        const n = typeof v === 'number' ? v : Number(v ?? 0);
                        if (dailyCompletedMetric === 'amount') {
                          if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
                          if (n >= 100000)   return `₹${(n / 100000).toFixed(1)}L`;
                          if (n >= 1000)     return `₹${(n / 1000).toFixed(0)}K`;
                          return `₹${n}`;
                        }
                        if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
                        return String(n);
                      }}
                      style={{
                        fill: '#d1fae5',
                        fontSize: 10,
                        fontWeight: 700,
                        paintOrder: 'stroke',
                        stroke: '#000',
                        strokeWidth: 2,
                        strokeLinecap: 'round',
                        strokeLinejoin: 'round',
                      }}
                    />
                  </Area>
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Daily payment-option mix · distinct POs per day */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden mb-8 transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25)]">
          <div className="px-8 py-6 border-b border-white/10 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-2xl font-bold text-white">Payment Option Wise Order</h2>
              <p className="text-white/60 text-sm mt-1">Daily distinct purchase orders bucketed by payment option · 3PL × INTERCITY only</p>
            </div>
            <div className="flex items-center gap-3">
              {queryBtn('paymentTrend', 'Payment Option Wise Order')}
              <div className="inline-flex rounded-lg border border-white/15 bg-white/5 p-0.5">
                <button
                  type="button"
                  onClick={() => setPaymentTrendView('count')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${paymentTrendView === 'count' ? 'bg-fuchsia-500/30 text-white border border-fuchsia-400/50' : 'text-white/60 hover:text-white'}`}
                >
                  Number
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentTrendView('percent')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${paymentTrendView === 'percent' ? 'bg-fuchsia-500/30 text-white border border-fuchsia-400/50' : 'text-white/60 hover:text-white'}`}
                >
                  Percentage
                </button>
              </div>
              {paymentTrend && paymentTrend.options.length > 0 && (() => {
                const grand = Object.values(paymentTrend.optionTotals).reduce((s, v) => s + v, 0);
                const top = Object.entries(paymentTrend.optionTotals).sort((a, b) => b[1] - a[1])[0];
                return top ? (
                  <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-400/30">
                    <p className="text-[10px] text-emerald-300/70 uppercase tracking-wider">Top option</p>
                    <p className="text-sm font-bold text-emerald-300 tabular-nums">{top[0]} · {grand > 0 ? ((top[1] / grand) * 100).toFixed(1) : '0'}%</p>
                  </div>
                ) : null;
              })()}
            </div>
          </div>
          <div className="p-6" style={{ height: 380 }}>
            {paymentTrendLoading || !paymentTrend || paymentTrend.data.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-white/50">{paymentTrendLoading ? 'Loading…' : 'No data'}</div>
            ) : (() => {
              const palette = ['#d946ef', '#10b981', '#38bdf8', '#f59e0b', '#a78bfa', '#f43f5e', '#22d3ee', '#84cc16'];
              const colorFor = (i: number) => palette[i % palette.length];
              const fmtDate = (d: string) => {
                const date = new Date(d + 'T00:00:00Z');
                return `${String(date.getUTCDate()).padStart(2, '0')} ${date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })}`;
              };
              const isPct = paymentTrendView === 'percent';
              const chartData = paymentTrend.data.map((r) => {
                const row: Record<string, number | string> = { dateLabel: fmtDate(String(r.date)), date: String(r.date) };
                const total = Number(r.total || 0);
                paymentTrend.options.forEach((opt) => {
                  const v = Number(r[opt] || 0);
                  row[opt] = isPct ? (total > 0 ? (v / total) * 100 : 0) : v;
                  row[`${opt}__raw`] = v;
                });
                row.total = isPct ? 100 : total;
                return row;
              });
              return (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ left: 10, right: 20, top: 10 }}
                  >
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                    <XAxis dataKey="dateLabel" stroke="rgba(255,255,255,0.5)" fontSize={10} tickMargin={6} interval="preserveStartEnd" />
                    <YAxis
                      stroke="rgba(255,255,255,0.5)"
                      fontSize={11}
                      domain={isPct ? [0, 100] : ['auto', 'auto']}
                      tickFormatter={(v: number) => isPct ? `${Math.round(v)}%` : v.toLocaleString('en-IN')}
                    />
                    <Tooltip
                      contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: 12 }}
                      labelStyle={{ color: '#fff', fontWeight: 700 }}
                      formatter={(v: any, n: any, p: any) => {
                        const val = Number(v);
                        if (isPct) {
                          const raw = p && p.payload ? Number(p.payload[`${n}__raw`] || 0) : 0;
                          return [`${val.toFixed(1)}% (${raw.toLocaleString('en-IN')})`, n];
                        }
                        return [val.toLocaleString('en-IN'), n];
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.8)' }} />
                    {paymentTrend.options.map((opt, i) => {
                      const isLast = i === paymentTrend.options.length - 1;
                      return (
                        <Bar key={opt} dataKey={opt} stackId="pm" fill={colorFor(i)} isAnimationActive={false} radius={isLast ? [4, 4, 0, 0] : [0, 0, 0, 0]} cursor="pointer" onClick={(e: unknown) => openPaymentDrill(opt, e)}>
                          <LabelList
                            dataKey={opt}
                            position="center"
                            content={(props: any) => {
                              const { x, y, width, height, value } = props;
                              const val = Number(value || 0);
                              if (val <= 0) return null;
                              let text: string;
                              if (isPct) {
                                if (val < 4) return null;
                                text = `${val.toFixed(0)}%`;
                              } else {
                                text = val.toLocaleString('en-IN');
                              }
                              return (
                                <text
                                  x={x + width / 2}
                                  y={y + height / 2}
                                  textAnchor="middle"
                                  dominantBaseline="central"
                                  style={{ fill: '#ffffff', fontSize: 10, fontWeight: 800, paintOrder: 'stroke', stroke: '#0f172a', strokeWidth: 3, strokeLinejoin: 'round' }}
                                >
                                  {text}
                                </text>
                              );
                            }}
                          />
                          {isLast && !isPct && (
                            <LabelList
                              dataKey="total"
                              position="top"
                              offset={6}
                              formatter={(v: unknown) => Number(v).toLocaleString('en-IN')}
                              style={{ fill: '#fdf4ff', fontSize: 11, fontWeight: 800, paintOrder: 'stroke', stroke: '#0f172a', strokeWidth: 3, strokeLinejoin: 'round' }}
                            />
                          )}
                        </Bar>
                      );
                    })}
                  </BarChart>
                </ResponsiveContainer>
              );
            })()}
          </div>
        </div>

        {/* Monthly Trend & Growth — Status × Month, share-of-mix with pp delta */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25),inset_0_0_30px_rgba(168,85,247,0.12)]">
          <div className="px-8 py-6 border-b border-white/10 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white">Monthly Trend & Growth</h2>
              <p className="text-white/60 text-sm mt-1">Share of monthly orders & revenue per status, with month-over-month change in percentage points — {currentYear}</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
            {queryBtn('monthly', 'Monthly Trend & Growth')}
            {monthlyData && (
              <button
                className={DOWNLOAD_BTN_CLASS}
                onClick={() => {
                  const activeMonths: number[] = [];
                  for (let m = 1; m <= 12; m++) {
                    const c = monthlyData.totals.byMonth[m];
                    if (c && c.count > 0) activeMonths.push(m);
                  }
                  const headers = ['Status'];
                  activeMonths.forEach((m, i) => {
                    const name = `${MONTH_NAMES[m - 1]} ${currentYear}`;
                    headers.push(`${name} Order %`, `${name} Amount %`);
                    if (i > 0) headers.push(`${name} Order Growth pp`, `${name} Amount Growth pp`);
                  });
                  const rows: CsvCell[][] = monthlyData.data.map((row) => {
                    const out: CsvCell[] = [row.status];
                    activeMonths.forEach((m, i) => {
                      const cell = row.months[m];
                      const monthTotal = monthlyData.totals.byMonth[m];
                      const cellCount = cell?.count || 0;
                      const cellAmount = cell?.amount || 0;
                      const countPct = monthTotal?.count ? (cellCount * 100) / monthTotal.count : 0;
                      const amountPct = monthTotal?.amount ? (cellAmount * 100) / monthTotal.amount : 0;
                      out.push(countPct.toFixed(2), amountPct.toFixed(2));
                      if (i > 0) {
                        const prevM = activeMonths[i - 1];
                        const prevCell = row.months[prevM];
                        const prevMonthTotal = monthlyData.totals.byMonth[prevM];
                        const prevCountPct = prevMonthTotal?.count ? ((prevCell?.count || 0) * 100) / prevMonthTotal.count : 0;
                        const prevAmountPct = prevMonthTotal?.amount ? ((prevCell?.amount || 0) * 100) / prevMonthTotal.amount : 0;
                        out.push((countPct - prevCountPct).toFixed(2), (amountPct - prevAmountPct).toFixed(2));
                      }
                    });
                    return out;
                  });
                  downloadCSV(`monthly-trend-growth-${currentYear}.csv`, headers, rows);
                }}
              >
                ↓ CSV
              </button>
            )}
            </div>
          </div>
          <div className="overflow-x-auto">
            {monthlyLoading ? (
              <div className="px-8 py-12 text-center text-white/60">Loading...</div>
            ) : !monthlyData ? (
              <div className="px-8 py-12 text-center text-white/60">No data</div>
            ) : (() => {
              const activeMonths: number[] = [];
              for (let m = 1; m <= 12; m++) {
                const c = monthlyData.totals.byMonth[m];
                if (c && c.count > 0) activeMonths.push(m);
              }

              const fmtPct = (n: number) => `${n.toFixed(2)}%`;
              const fmtDelta = (g: number | null) => {
                if (g === null) return '—';
                if (g === 0) return '0.00%';
                const sign = g > 0 ? '+' : '-';
                return `${sign}${Math.abs(g).toFixed(2)}%`;
              };
              const deltaClass = (g: number | null) => {
                if (g === null) return 'text-white/30';
                if (g > 0) return 'text-emerald-400';
                if (g < 0) return 'text-rose-400';
                return 'text-white/60';
              };

              return (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th rowSpan={2} className="px-4 py-3 text-left text-xs font-semibold text-white/70 sticky left-0 bg-slate-900/80 backdrop-blur z-10 border-r border-white/10 min-w-[160px]">
                        Status
                      </th>
                      {activeMonths.map((m, i) => (
                        <th
                          key={m}
                          colSpan={i === 0 ? 2 : 4}
                          className="px-2 py-2 text-center text-xs font-semibold text-white/80 border-r border-white/10"
                        >
                          {MONTH_NAMES[m - 1]} {currentYear}
                        </th>
                      ))}
                    </tr>
                    <tr className="border-b border-white/10">
                      {activeMonths.map((m, i) => {
                        const isFirst = i === 0;
                        return (
                          <Fragment key={m}>
                            <th className="px-2 py-2 text-right text-[10px] font-medium text-white/50">Order %</th>
                            <th className={`px-2 py-2 text-right text-[10px] font-medium text-white/50 ${isFirst ? 'border-r border-white/10' : ''}`}>Amount %</th>
                            {!isFirst && (
                              <>
                                <th className="px-2 py-2 text-right text-[10px] font-medium text-white/50">Order Growth</th>
                                <th className="px-2 py-2 text-right text-[10px] font-medium text-white/50 border-r border-white/10">Amount Growth</th>
                              </>
                            )}
                          </Fragment>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.data.map((row) => (
                      <tr key={row.status} className="border-b border-white/5 hover:bg-white/5">
                        <td className="px-4 py-3 sticky left-0 bg-slate-900/80 backdrop-blur z-10 border-r border-white/10 text-white">
                          {row.status}
                        </td>
                        {activeMonths.map((m, i) => {
                          const cell = row.months[m];
                          const monthTotal = monthlyData.totals.byMonth[m];
                          const cellCount = cell?.count || 0;
                          const cellAmount = cell?.amount || 0;
                          const countPct = monthTotal?.count ? (cellCount * 100) / monthTotal.count : 0;
                          const amountPct = monthTotal?.amount ? (cellAmount * 100) / monthTotal.amount : 0;

                          let countDelta: number | null = null;
                          let amountDelta: number | null = null;
                          if (i > 0) {
                            const prevMonth = activeMonths[i - 1];
                            const prevCell = row.months[prevMonth];
                            const prevMonthTotal = monthlyData.totals.byMonth[prevMonth];
                            const prevCountPct = prevMonthTotal?.count ? ((prevCell?.count || 0) * 100) / prevMonthTotal.count : 0;
                            const prevAmountPct = prevMonthTotal?.amount ? ((prevCell?.amount || 0) * 100) / prevMonthTotal.amount : 0;
                            countDelta = countPct - prevCountPct;
                            amountDelta = amountPct - prevAmountPct;
                          }

                          const isFirst = i === 0;
                          const dim = !cell || cell.count === 0;

                          return (
                            <Fragment key={m}>
                              <td className={`px-2 py-3 text-right tabular-nums ${dim ? 'text-white/30' : 'text-white'}`}>
                                {dim ? '—' : fmtPct(countPct)}
                              </td>
                              <td className={`px-2 py-3 text-right tabular-nums ${dim ? 'text-white/30' : 'text-white/80'} ${isFirst ? 'border-r border-white/10' : ''}`}>
                                {dim ? '—' : fmtPct(amountPct)}
                              </td>
                              {!isFirst && (
                                <>
                                  <td className={`px-2 py-3 text-right tabular-nums ${deltaClass(countDelta)}`}>
                                    {fmtDelta(countDelta)}
                                  </td>
                                  <td className={`px-2 py-3 text-right tabular-nums border-r border-white/10 ${deltaClass(amountDelta)}`}>
                                    {fmtDelta(amountDelta)}
                                  </td>
                                </>
                              )}
                            </Fragment>
                          );
                        })}
                      </tr>
                    ))}
                    <tr className="border-t-2 border-white/20 bg-white/5 font-semibold">
                      <td className="px-4 py-3 sticky left-0 bg-slate-900/95 backdrop-blur z-10 border-r border-white/10 text-white">
                        Total
                      </td>
                      {activeMonths.map((m, i) => {
                        const isFirst = i === 0;
                        return (
                          <Fragment key={m}>
                            <td className="px-2 py-3 text-right tabular-nums text-white/80">100.00%</td>
                            <td className={`px-2 py-3 text-right tabular-nums text-white/80 ${isFirst ? 'border-r border-white/10' : ''}`}>100.00%</td>
                            {!isFirst && (
                              <>
                                <td className="px-2 py-3 text-right tabular-nums text-white/30">—</td>
                                <td className="px-2 py-3 text-right tabular-nums text-white/30 border-r border-white/10">—</td>
                              </>
                            )}
                          </Fragment>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              );
            })()}
          </div>
        </div>

        </>
        )}

        {activeTab === 'rto' && (
          <div className="space-y-8">
            {/* RTO sub-tab navigation */}
            <div className="flex gap-1 p-1 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl w-fit">
              {(['dashboard', 'details', 'hub'] as const).map((sub) => {
                const active = rtoSubTab === sub;
                const label = sub === 'dashboard' ? 'Dashboard' : sub === 'details' ? 'Details' : 'Destination Hub Tracking';
                return (
                  <button
                    key={sub}
                    onClick={() => setRtoSubTab(sub)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-300 ${
                      active
                        ? 'bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 text-white shadow-[0_0_24px_rgba(217,70,239,0.55),inset_0_0_18px_rgba(168,85,247,0.5)]'
                        : 'text-purple-200 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {rtoSubTab === 'dashboard' && (
            <>
            {/* Header + KPI tiles */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25),inset_0_0_30px_rgba(168,85,247,0.12)]">
              <div className="px-8 py-6 border-b border-white/10 bg-white/5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-white">RTO — Return To Origin</h2>
                  <p className="text-purple-300 text-sm mt-1">
                    Orders marked REJECTED with delivery status containing &ldquo;RTO&rdquo; — bucketed by <span className="font-mono text-fuchsia-300">markedRejectedTime</span>, year {currentYear}
                  </p>
                </div>
                {queryBtn('rto', 'RTO — Return To Origin')}
              </div>
              <div className="p-6">
                {rtoLoading || !rtoData ? (
                  <div className="py-12 text-center text-purple-300">Loading RTO data…</div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <button
                      type="button"
                      onClick={() => { setRtoKpiWindow(null); setRtoKpiModal('count'); }}
                      className="text-left bg-white/5 border border-white/10 rounded-xl p-5 transition-all duration-200 hover:bg-white/10 hover:border-fuchsia-400/60 hover:shadow-[0_0_24px_rgba(217,70,239,0.25)] hover:scale-[1.02] cursor-pointer focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                    >
                      <div className="text-[10px] text-purple-300 uppercase tracking-wider">Total RTO orders</div>
                      <div className="text-3xl font-bold text-white tabular-nums mt-1">{rtoData.grand.count.toLocaleString()}</div>
                      <div className="text-[10px] text-fuchsia-300/70 mt-1">click for details →</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setRtoKpiWindow(null); setRtoKpiModal('value'); }}
                      className="text-left bg-white/5 border border-white/10 rounded-xl p-5 transition-all duration-200 hover:bg-white/10 hover:border-fuchsia-400/60 hover:shadow-[0_0_24px_rgba(217,70,239,0.25)] hover:scale-[1.02] cursor-pointer focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                    >
                      <div className="text-[10px] text-purple-300 uppercase tracking-wider">RTO order value</div>
                      <div className="text-3xl font-bold text-white tabular-nums mt-1">{formatAmount(rtoData.grand.amount)}</div>
                      <div className="text-[10px] text-fuchsia-300/70 mt-1">click for details →</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setRtoKpiWindow(null); setRtoKpiModal('rate'); }}
                      className="text-left bg-white/5 border border-white/10 rounded-xl p-5 transition-all duration-200 hover:bg-white/10 hover:border-fuchsia-400/60 hover:shadow-[0_0_24px_rgba(217,70,239,0.25)] hover:scale-[1.02] cursor-pointer focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                    >
                      <div className="text-[10px] text-purple-300 uppercase tracking-wider">RTO rate</div>
                      <div className="text-3xl font-bold text-rose-300 tabular-nums mt-1">{rtoData.rtoRate.toFixed(2)}%</div>
                      <div className="text-[10px] text-purple-300/60 mt-0.5">vs delivered+completed</div>
                      <div className="text-[10px] text-fuchsia-300/70 mt-1">click for details →</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setRtoKpiWindow(null); setRtoKpiModal('avg'); }}
                      className="text-left bg-white/5 border border-white/10 rounded-xl p-5 transition-all duration-200 hover:bg-white/10 hover:border-fuchsia-400/60 hover:shadow-[0_0_24px_rgba(217,70,239,0.25)] hover:scale-[1.02] cursor-pointer focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                    >
                      <div className="text-[10px] text-purple-300 uppercase tracking-wider">Avg RTO value</div>
                      <div className="text-3xl font-bold text-white tabular-nums mt-1">{formatAmount(rtoData.avgRtoValue)}</div>
                      <div className="text-[10px] text-fuchsia-300/70 mt-1">click for details →</div>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* RTO trend chart with granularity toggle */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25),inset_0_0_30px_rgba(168,85,247,0.12)]">
              <div className="px-8 py-6 border-b border-white/10 bg-white/5 flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white">RTO trend</h3>
                  <p className="text-purple-300 text-xs mt-1">
                    {rtoTrendGranularity === 'month' && `RTO orders by month of rejection — ${currentYear}`}
                    {rtoTrendGranularity === 'week' && `RTO orders by ISO week — ${currentYear}`}
                    {rtoTrendGranularity === 'day' && `RTO orders by day — ${currentYear}`}
                    {rtoTrendGranularity === 'custom' && `RTO orders by day — ${rtoTrendCustomFrom || '…'} to ${rtoTrendCustomTo || '…'}`}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                {queryBtn('rtoTrend', 'RTO trend')}
                {/* Granularity toggle */}
                <div className="flex gap-1 p-1 bg-white/5 border border-white/10 rounded-xl">
                  {(['month', 'week', 'day', 'custom'] as const).map((g) => {
                    const active = rtoTrendGranularity === g;
                    return (
                      <button
                        key={g}
                        onClick={() => setRtoTrendGranularity(g)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          active
                            ? 'bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 text-white shadow-[0_0_18px_rgba(217,70,239,0.5)]'
                            : 'text-purple-200 hover:bg-white/10'
                        }`}
                      >
                        {g === 'month' ? 'Month' : g === 'week' ? 'Week' : g === 'day' ? 'Day' : 'Custom'}
                      </button>
                    );
                  })}
                </div>
                {rtoTrendGranularity !== 'custom' && (
                  <MonthMultiSelect selected={rtoTrendMonths} onChange={setRtoTrendMonths} year={currentYear} />
                )}
                </div>
              </div>
              {/* Custom date pickers row */}
              {rtoTrendGranularity === 'custom' && (
                <div className="px-8 py-3 border-b border-white/10 bg-white/5 flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-semibold text-purple-300 uppercase tracking-wide">Range</span>
                  <input
                    type="date"
                    value={rtoTrendCustomFrom}
                    onChange={(e) => setRtoTrendCustomFrom(e.target.value)}
                    className="px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                  />
                  <span className="text-purple-300 text-xs">to</span>
                  <input
                    type="date"
                    value={rtoTrendCustomTo}
                    onChange={(e) => setRtoTrendCustomTo(e.target.value)}
                    className="px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                  />
                </div>
              )}
              <div className="p-6">
                {rtoTrendLoading || !rtoTrendData ? (
                  <div className="h-[320px] flex items-center justify-center text-purple-300">Loading…</div>
                ) : rtoTrendData.length === 0 ? (
                  <div className="h-[320px] flex items-center justify-center text-purple-300">No RTO data for this range</div>
                ) : (
                  <div className="space-y-3">
                    {/* Top: RTO order count */}
                    <div>
                      <div className="flex items-center gap-2 mb-1 px-1">
                        <span className="w-2 h-2 rounded-full bg-rose-500" />
                        <span className="text-xs font-semibold text-rose-200 uppercase tracking-wide">RTO orders</span>
                        <span className="text-[10px] text-purple-300/70">count per bucket</span>
                      </div>
                      <ResponsiveContainer width="100%" height={180}>
                        <ComposedChart
                          data={rtoTrendData}
                          margin={{ top: 20, right: 16, left: 8, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                          <XAxis
                            dataKey="label"
                            tick={false}
                            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                            height={4}
                          />
                          <YAxis
                            tick={{ fill: 'rgba(253,164,175,0.9)', fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                            width={44}
                            allowDecimals={false}
                          />
                          <Tooltip
                            cursor={{ fill: 'rgba(244,63,94,0.08)' }}
                            contentStyle={{
                              background: 'rgba(15,23,42,0.96)',
                              border: '1px solid rgba(244,63,94,0.35)',
                              borderRadius: 10,
                              color: '#fff',
                              fontSize: 12,
                            }}
                            labelStyle={{ color: '#fda4af', fontWeight: 700, marginBottom: 4 }}
                            formatter={(v) => {
                              const n = typeof v === 'number' ? v : Number(v ?? 0);
                              return [n.toLocaleString(), 'RTO orders'];
                            }}
                          />
                          <Bar
                            dataKey="count"
                            name="RTO orders"
                            fill="#f43f5e"
                            radius={[5, 5, 0, 0]}
                            maxBarSize={42}
                            cursor="pointer"
                            onClick={(e: unknown) => openRtoTrendDrill(e)}
                          >
                            <LabelList
                              dataKey="count"
                              position="top"
                              offset={6}
                              style={{
                                fill: '#fecdd3',
                                fontSize: rtoTrendData.length > 24 ? 9 : 11,
                                fontWeight: 700,
                              }}
                            />
                          </Bar>
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Bottom: order value */}
                    <div>
                      <div className="flex items-center gap-2 mb-1 px-1">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="text-xs font-semibold text-amber-200 uppercase tracking-wide">Order value</span>
                        <span className="text-[10px] text-purple-300/70">₹ per bucket</span>
                      </div>
                      <ResponsiveContainer width="100%" height={180}>
                        <ComposedChart
                          data={rtoTrendData}
                          margin={{ top: 20, right: 16, left: 8, bottom: 24 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                          <XAxis
                            dataKey="label"
                            tick={{ fill: 'rgba(216,180,254,0.75)', fontSize: 11 }}
                            tickLine={false}
                            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                            minTickGap={rtoTrendGranularity === 'day' || rtoTrendGranularity === 'custom' ? 20 : 5}
                          />
                          <YAxis
                            tick={{ fill: 'rgba(252,211,77,0.9)', fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                            width={56}
                            tickFormatter={(v: number) => {
                              if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
                              if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
                              if (v >= 1000) return `₹${(v / 1000).toFixed(0)}k`;
                              return `₹${v}`;
                            }}
                          />
                          <Tooltip
                            cursor={{ fill: 'rgba(245,158,11,0.08)' }}
                            contentStyle={{
                              background: 'rgba(15,23,42,0.96)',
                              border: '1px solid rgba(245,158,11,0.35)',
                              borderRadius: 10,
                              color: '#fff',
                              fontSize: 12,
                            }}
                            labelStyle={{ color: '#fcd34d', fontWeight: 700, marginBottom: 4 }}
                            formatter={(v) => {
                              const n = typeof v === 'number' ? v : Number(v ?? 0);
                              return [formatAmount(n), 'Order value'];
                            }}
                          />
                          <Bar
                            dataKey="amount"
                            name="Order value"
                            fill="#f59e0b"
                            radius={[5, 5, 0, 0]}
                            maxBarSize={42}
                            cursor="pointer"
                            onClick={(e: unknown) => openRtoTrendDrill(e)}
                          >
                            <LabelList
                              dataKey="amount"
                              position="top"
                              offset={6}
                              formatter={(v: string | number | boolean | null | undefined) => {
                                const n = typeof v === 'number' ? v : Number(v ?? 0);
                                if (n >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`;
                                if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
                                if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
                                return String(Math.round(n));
                              }}
                              style={{
                                fill: '#fef3c7',
                                fontSize: rtoTrendData.length > 24 ? 9 : 11,
                                fontWeight: 700,
                              }}
                            />
                          </Bar>
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Monthly RTO rate trend (cohort by markedPendingTime month) */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25),inset_0_0_30px_rgba(168,85,247,0.12)]">
              <div className="px-8 py-6 border-b border-white/10 bg-white/5 flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white">Monthly RTO rate — {currentYear}</h3>
                  <p className="text-purple-300 text-xs mt-1">
                    RTO ÷ (RTO + Delivered + Completed) — bucketed by <span className="font-mono text-fuchsia-300">markedPendingTime</span> month (cohort view)
                  </p>
                </div>
                {queryBtn('rtoRate', 'Monthly RTO rate')}
                {rtoRateData && rtoRateData.length > 0 && (
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-right">
                      <div className="text-purple-300/80 text-[11px]">Avg rate</div>
                      <div className="text-fuchsia-200 font-bold text-lg tabular-nums">
                        {(() => {
                          const totalRto = rtoRateData.reduce((s, r) => s + r.rtoCount, 0);
                          const totalDen = rtoRateData.reduce((s, r) => s + r.rtoCount + r.deliveredCount, 0);
                          return totalDen > 0 ? `${((totalRto / totalDen) * 100).toFixed(2)}%` : '—';
                        })()}
                      </div>
                    </div>
                    <button
                      className={DOWNLOAD_BTN_CLASS}
                      onClick={() => {
                        const headers = ['Month', 'RTO Count', 'Delivered + Completed', 'Denominator', 'RTO Rate %'];
                        const rows: CsvCell[][] = rtoRateData.map((r) => [
                          r.label, r.rtoCount, r.deliveredCount, r.rtoCount + r.deliveredCount, r.rtoRate,
                        ]);
                        downloadCSV(`rto-rate-monthly-${currentYear}.csv`, headers, rows);
                      }}
                    >
                      ↓ CSV
                    </button>
                  </div>
                )}
              </div>
              <div className="p-6">
                {rtoRateLoading || !rtoRateData ? (
                  <div className="h-[300px] flex items-center justify-center text-purple-300">Loading…</div>
                ) : rtoRateData.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center text-purple-300">No data for {currentYear}</div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart
                      data={rtoRateData}
                      margin={{ top: 28, right: 24, left: 8, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: 'rgba(216,180,254,0.75)', fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                      />
                      <YAxis
                        tick={{ fill: 'rgba(232,121,249,0.9)', fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        width={50}
                        tickFormatter={(v: number) => `${v}%`}
                        domain={[0, (dataMax: number) => Math.max(40, Math.ceil(dataMax / 10) * 10 + 5)]}
                      />
                      <Tooltip
                        cursor={{ stroke: 'rgba(217,70,239,0.4)', strokeWidth: 1, strokeDasharray: '3 3' }}
                        contentStyle={{
                          background: 'rgba(15,23,42,0.96)',
                          border: '1px solid rgba(217,70,239,0.4)',
                          borderRadius: 10,
                          color: '#fff',
                          fontSize: 12,
                        }}
                        labelStyle={{ color: '#f0abfc', fontWeight: 700, marginBottom: 4 }}
                        formatter={(v, name, item) => {
                          const p = (item as { payload?: RtoRatePoint } | undefined)?.payload;
                          const rto = p?.rtoCount ?? 0;
                          const del = p?.deliveredCount ?? 0;
                          const n = typeof v === 'number' ? v : Number(v ?? 0);
                          return [`${n.toFixed(2)}%  ·  ${rto.toLocaleString()} RTO / ${(rto + del).toLocaleString()} total`, String(name)];
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="rtoRate"
                        name="RTO rate"
                        stroke="#d946ef"
                        strokeWidth={2.5}
                        dot={{ r: 5, fill: '#d946ef', stroke: '#1e1b4b', strokeWidth: 2 }}
                        activeDot={{ r: 7, fill: '#f0abfc', stroke: '#1e1b4b', strokeWidth: 2 }}
                      >
                        <LabelList
                          dataKey="rtoRate"
                          position="top"
                          offset={10}
                          formatter={(v: string | number | boolean | null | undefined) => {
                            const n = typeof v === 'number' ? v : Number(v ?? 0);
                            return `${n.toFixed(1)}%`;
                          }}
                          style={{
                            fill: '#f5d0fe',
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        />
                      </Line>
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Two-column: top sellers + top states */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25),inset_0_0_30px_rgba(168,85,247,0.12)]">
                <div className="px-6 py-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white">Top sellers by RTO</h3>
                    <p className="text-purple-300/70 text-xs mt-0.5">Punch → Delivered → RTO funnel (cohort: <span className="font-mono text-fuchsia-300">markedPendingTime</span> in {currentYear})</p>
                  </div>
                  {rtoData && rtoData.topSellers.length > 0 && (
                    <button
                      className={DOWNLOAD_BTN_CLASS}
                      onClick={() => {
                        const headers = [
                          'Seller Business', 'Seller Phone',
                          'Pushed Orders', 'Pushed Value',
                          'Delivered+Completed', 'Delivered Value', 'Delivery %',
                          'RTO Orders', 'RTO Value', 'RTO %',
                        ];
                        const rows: CsvCell[][] = rtoData.topSellers.map((s) => [
                          s.sellerBusinessName, s.sellerPhone,
                          s.pushedCount, s.pushedAmount,
                          s.deliveredCount, s.deliveredAmount,
                          s.pushedCount > 0 ? +((s.deliveredCount / s.pushedCount) * 100).toFixed(2) : 0,
                          s.rtoCount, s.rtoAmount, s.rtoRate,
                        ]);
                        downloadCSV(`rto-top-sellers-${currentYear}.csv`, headers, rows);
                      }}
                    >
                      ↓ CSV
                    </button>
                  )}
                </div>
                <div className="overflow-x-auto">
                  {rtoLoading || !rtoData ? (
                    <div className="px-6 py-12 text-center text-purple-300">Loading…</div>
                  ) : rtoData.topSellers.length === 0 ? (
                    <div className="px-6 py-12 text-center text-purple-300">No RTO data</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-white/5 border-b border-white/10">
                        <tr>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-purple-200">#</th>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-purple-200">Seller</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-purple-200">Punch</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-emerald-200">Delivered</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-rose-200">RTO</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-rose-300">RTO %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(rtoSellersPaged?.rows ?? []).map((s, i) => {
                          const deliveryRate = s.pushedCount > 0 ? (s.deliveredCount / s.pushedCount) * 100 : 0;
                          const rank = (rtoSellersPaged?.startIdx ?? 0) + i + 1;
                          return (
                            <tr key={s.sellerId} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                              <td className="px-3 py-2.5 text-purple-300 tabular-nums align-top">{rank}</td>
                              <td className="px-3 py-2.5 align-top">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-white font-medium leading-tight">{s.sellerBusinessName || '—'}</span>
                                  {s.isActive ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
                                      Active
                                    </span>
                                  ) : (
                                    <span
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/40"
                                      title={s.daysSinceLastOrder != null ? `${s.daysSinceLastOrder} day${s.daysSinceLastOrder === 1 ? '' : 's'} since last order` : undefined}
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full bg-rose-300" />
                                      Inactive{s.daysSinceLastOrder != null ? ` · ${s.daysSinceLastOrder}d` : ''}
                                    </span>
                                  )}
                                </div>
                                <div className="text-purple-300/70 text-[10px] tabular-nums leading-tight mt-0.5">{s.sellerPhone || '—'}</div>
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums align-top">
                                <div className="text-white font-bold leading-tight">{s.pushedCount.toLocaleString()}</div>
                                <div className="text-purple-300/70 text-[10px] leading-tight mt-0.5">{formatAmount(s.pushedAmount)}</div>
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums align-top">
                                <div className="text-emerald-200 font-bold leading-tight">{s.deliveredCount.toLocaleString()}</div>
                                <div className="text-emerald-300/70 text-[10px] leading-tight mt-0.5">{formatAmount(s.deliveredAmount)} · {deliveryRate.toFixed(1)}%</div>
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums align-top">
                                <div className="text-rose-200 font-bold leading-tight">{s.rtoCount.toLocaleString()}</div>
                                <div className="text-rose-300/70 text-[10px] leading-tight mt-0.5">{formatAmount(s.rtoAmount)}</div>
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums align-top">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold ${
                                  s.rtoRate >= 30 ? 'bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/40'
                                  : s.rtoRate >= 15 ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40'
                                  : 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40'
                                }`}>{s.rtoRate.toFixed(1)}%</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
                {rtoSellersPaged && rtoSellersPaged.total > RTO_PAGE_SIZE && (
                  <div className="px-6 py-3 border-t border-white/10 bg-white/5 flex items-center justify-between text-xs text-purple-200 flex-wrap gap-2">
                    <div>
                      Showing <span className="font-semibold text-white">{rtoSellersPaged.startIdx + 1}</span>–<span className="font-semibold text-white">{rtoSellersPaged.endIdx}</span> of <span className="font-semibold text-white">{rtoSellersPaged.total.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setRtoSellerPage((p) => Math.max(1, p - 1))}
                        disabled={rtoSellersPaged.safePage <= 1}
                        className="px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-purple-100 font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Prev
                      </button>
                      <span className="px-1 text-purple-300/70">
                        Page <span className="text-white font-semibold">{rtoSellersPaged.safePage}</span> of {rtoSellersPaged.totalPages}
                      </span>
                      <button
                        onClick={() => setRtoSellerPage((p) => Math.min(rtoSellersPaged.totalPages, p + 1))}
                        disabled={rtoSellersPaged.safePage >= rtoSellersPaged.totalPages}
                        className="px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-purple-100 font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25),inset_0_0_30px_rgba(168,85,247,0.12)]">
                <div className="px-6 py-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white">Top states by RTO</h3>
                    <p className="text-purple-300/70 text-xs mt-0.5">Punch → Delivered → RTO funnel (cohort: <span className="font-mono text-fuchsia-300">markedPendingTime</span> in {currentYear})</p>
                  </div>
                  {rtoData && rtoData.topStates.length > 0 && (
                    <button
                      className={DOWNLOAD_BTN_CLASS}
                      onClick={() => {
                        const headers = [
                          'State',
                          'Pushed Orders', 'Pushed Value',
                          'Delivered+Completed', 'Delivered Value', 'Delivery %',
                          'RTO Orders', 'RTO Value', 'RTO %',
                        ];
                        const rows: CsvCell[][] = rtoData.topStates.map((s) => [
                          s.state ?? '(no state)',
                          s.pushedCount, s.pushedAmount,
                          s.deliveredCount, s.deliveredAmount,
                          s.pushedCount > 0 ? +((s.deliveredCount / s.pushedCount) * 100).toFixed(2) : 0,
                          s.rtoCount, s.rtoAmount, s.rtoRate,
                        ]);
                        downloadCSV(`rto-top-states-${currentYear}.csv`, headers, rows);
                      }}
                    >
                      ↓ CSV
                    </button>
                  )}
                </div>
                <div className="overflow-x-auto">
                  {rtoLoading || !rtoData ? (
                    <div className="px-6 py-12 text-center text-purple-300">Loading…</div>
                  ) : rtoData.topStates.length === 0 ? (
                    <div className="px-6 py-12 text-center text-purple-300">No RTO data</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-white/5 border-b border-white/10">
                        <tr>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-purple-200">#</th>
                          <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-purple-200">State</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-purple-200">Punch</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-emerald-200">Delivered</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-rose-200">RTO</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-rose-300">RTO %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(rtoStatesPaged?.rows ?? []).map((st, i) => {
                          const deliveryRate = st.pushedCount > 0 ? (st.deliveredCount / st.pushedCount) * 100 : 0;
                          const rank = (rtoStatesPaged?.startIdx ?? 0) + i + 1;
                          return (
                            <tr key={(st.state ?? 'unknown') + i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                              <td className="px-3 py-2.5 text-purple-300 tabular-nums align-top">{rank}</td>
                              <td className="px-3 py-2.5 text-white align-top">{st.state || <span className="text-purple-300/70 italic">(no state)</span>}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums align-top">
                                <div className="text-white font-bold leading-tight">{st.pushedCount.toLocaleString()}</div>
                                <div className="text-purple-300/70 text-[10px] leading-tight mt-0.5">{formatAmount(st.pushedAmount)}</div>
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums align-top">
                                <div className="text-emerald-200 font-bold leading-tight">{st.deliveredCount.toLocaleString()}</div>
                                <div className="text-emerald-300/70 text-[10px] leading-tight mt-0.5">{formatAmount(st.deliveredAmount)} · {deliveryRate.toFixed(1)}%</div>
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums align-top">
                                <div className="text-rose-200 font-bold leading-tight">{st.rtoCount.toLocaleString()}</div>
                                <div className="text-rose-300/70 text-[10px] leading-tight mt-0.5">{formatAmount(st.rtoAmount)}</div>
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums align-top">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold ${
                                  st.rtoRate >= 30 ? 'bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/40'
                                  : st.rtoRate >= 15 ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40'
                                  : 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40'
                                }`}>{st.rtoRate.toFixed(1)}%</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
                {rtoStatesPaged && rtoStatesPaged.total > RTO_PAGE_SIZE && (
                  <div className="px-6 py-3 border-t border-white/10 bg-white/5 flex items-center justify-between text-xs text-purple-200 flex-wrap gap-2">
                    <div>
                      Showing <span className="font-semibold text-white">{rtoStatesPaged.startIdx + 1}</span>–<span className="font-semibold text-white">{rtoStatesPaged.endIdx}</span> of <span className="font-semibold text-white">{rtoStatesPaged.total.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setRtoStatePage((p) => Math.max(1, p - 1))}
                        disabled={rtoStatesPaged.safePage <= 1}
                        className="px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-purple-100 font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Prev
                      </button>
                      <span className="px-1 text-purple-300/70">
                        Page <span className="text-white font-semibold">{rtoStatesPaged.safePage}</span> of {rtoStatesPaged.totalPages}
                      </span>
                      <button
                        onClick={() => setRtoStatePage((p) => Math.min(rtoStatesPaged.totalPages, p + 1))}
                        disabled={rtoStatesPaged.safePage >= rtoStatesPaged.totalPages}
                        className="px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-purple-100 font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            </>
            )}

            {rtoSubTab === 'details' && (
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25),inset_0_0_30px_rgba(168,85,247,0.12)]">
              <div className="px-8 py-6 border-b border-white/10 bg-white/5 flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-white">RTO Order Details</h2>
                  <p className="text-purple-300 text-sm mt-1">
                    RTO orders bucketed by <span className="font-mono text-fuchsia-300">markedRejectedTime</span> —
                    {' '}
                    {rtoListLoading
                      ? 'Loading…'
                      : rtoListData
                      ? `${filteredRtoListRows?.length ?? 0} of ${rtoListData.length} order${rtoListData.length === 1 ? '' : 's'}`
                      : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {queryBtn('rtoList', 'RTO Order Details')}
                  {rtoListData && rtoListData.length > 0 && (
                    <button
                      className={DOWNLOAD_BTN_CLASS}
                      onClick={() => {
                        const rows = filteredRtoListRows || [];
                        const headers = [
                          'Brand Name', 'PO Number', 'Order Value', 'Paid Amount', 'Applied Wallet Amount',
                          'Marked Rejected Time',
                          'ITL Date & Time', 'Shipment Status', 'Buyer Phone', 'Buyer Business Name',
                          'Order Date & Time', 'Latest Attempt Time',
                          'Coupon Value', 'Payment Mode',
                          'Final Failure Reason', 'Delivery Attempt',
                          'Attempt 1 Time', 'Attempt 1 Remarks',
                          'Attempt 2 Time', 'Attempt 2 Remarks',
                          'Attempt 3 Time', 'Attempt 3 Remarks',
                          'Attempt 4 Time', 'Attempt 4 Remarks',
                          'Attempt 5 Time', 'Attempt 5 Remarks',
                          'Attempt 6 Time', 'Attempt 6 Remarks',
                          'AWB Number', 'Logistic Name', 'COD Collect',
                          'Buyer Name',
                          'Buyer Full Address', 'Buyer Longitude', 'Buyer Latitude',
                          'PO Status',
                        ];
                        const csvRows: CsvCell[][] = rows.map((r) => [
                          r.brandName, r.poNumber, r.orderValue, r.paidAmount, r.appliedWalletAmount,
                          r.markedRejectedTime,
                          r.itlDate, r.shipmentStatus, r.buyerPhone, r.buyerBusinessName,
                          r.orderDate, r.latestAttemptTime,
                          r.couponValue, r.paymentMode,
                          r.finalFailureReason, r.deliveryAttempt,
                          r.attempt1Time, r.attempt1Remarks,
                          r.attempt2Time, r.attempt2Remarks,
                          r.attempt3Time, r.attempt3Remarks,
                          r.attempt4Time, r.attempt4Remarks,
                          r.attempt5Time, r.attempt5Remarks,
                          r.attempt6Time, r.attempt6Remarks,
                          r.awbNumber, r.logisticName, r.codCollect,
                          r.buyerName,
                          r.buyerFullAddress, r.buyerLongitude, r.buyerLatitude,
                          r.poStatus,
                        ]);
                        const { startDate, endDate } = resolveRtoListRange();
                        const suffix = rtoListRange === 'year' ? String(currentYear) : (startDate && endDate ? `${startDate}_${endDate}` : (startDate || endDate || 'all'));
                        downloadCSV(`rto-orders-${suffix}.csv`, headers, csvRows);
                      }}
                    >
                      ↓ CSV
                    </button>
                  )}
                </div>
              </div>
              <div className="px-8 py-3 border-b border-white/10 bg-white/5 flex items-center gap-3 flex-wrap">
                <span className="text-xs font-semibold text-purple-300 uppercase tracking-wide">Rejected</span>
                {([
                  { key: 'year',   label: `${currentYear}` },
                  { key: 'today',  label: 'Today' },
                  { key: '7d',     label: 'Last 7 days' },
                  { key: 'custom', label: 'Custom' },
                ] as const).map((opt) => {
                  const active = rtoListRange === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => setRtoListRange(opt.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        active
                          ? 'bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white shadow-[0_0_18px_rgba(217,70,239,0.4)]'
                          : 'bg-white/10 text-purple-200 hover:bg-white/15 border border-white/10'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
                {rtoListRange === 'custom' && (
                  <div className="flex items-center gap-2 ml-2">
                    <input
                      type="date"
                      value={rtoListCustomFrom}
                      onChange={(e) => setRtoListCustomFrom(e.target.value)}
                      className="px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                    />
                    <span className="text-purple-300 text-xs">to</span>
                    <input
                      type="date"
                      value={rtoListCustomTo}
                      onChange={(e) => setRtoListCustomTo(e.target.value)}
                      className="px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                    />
                  </div>
                )}
                <div className="h-5 w-px bg-white/15 mx-2"></div>
                <span className="text-xs font-semibold text-purple-300 uppercase tracking-wide">Attempts</span>
                {(['1', '2', '3', '4', '5', '5+'] as const).map((opt) => {
                  const active = rtoListAttemptFilter.has(opt);
                  return (
                    <button
                      key={opt}
                      onClick={() => {
                        setRtoListAttemptFilter((prev) => {
                          const next = new Set(prev);
                          if (next.has(opt)) next.delete(opt);
                          else next.add(opt);
                          return next;
                        });
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        active
                          ? 'bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white shadow-[0_0_18px_rgba(217,70,239,0.4)]'
                          : 'bg-white/10 text-purple-200 hover:bg-white/15 border border-white/10'
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
                {rtoListAttemptFilter.size > 0 && (
                  <button
                    onClick={() => setRtoListAttemptFilter(new Set())}
                    className="px-2 py-1 text-[10px] font-semibold text-purple-300 hover:text-white underline underline-offset-2"
                  >
                    clear
                  </button>
                )}
                {rtoListData && rtoListData.length > 0 && (() => {
                  const counts = new Map<string, number>();
                  for (const r of rtoListData) {
                    const k = r.paymentMode || '__NONE__';
                    counts.set(k, (counts.get(k) || 0) + 1);
                  }
                  const opts = Array.from(counts.entries())
                    .sort(([, a], [, b]) => b - a)
                    .map(([value, count]) => ({ value, label: value === '__NONE__' ? 'Unspecified' : value, count }));
                  if (opts.length <= 1) return null;
                  return (
                    <>
                      <div className="h-5 w-px bg-white/15 mx-2"></div>
                      <span className="text-xs font-semibold text-purple-300 uppercase tracking-wide">Payment</span>
                      <MultiSelectFilter
                        label="Payment"
                        allLabel="All payments"
                        options={opts}
                        selected={rtoListPaymentFilter}
                        onChange={setRtoListPaymentFilter}
                        widthClass="w-44"
                      />
                    </>
                  );
                })()}
              </div>
              <div className="px-8 py-3 border-b border-white/10 bg-white/5">
                <input
                  type="text"
                  value={rtoListSearch}
                  onChange={(e) => setRtoListSearch(e.target.value)}
                  placeholder="Search by PO, AWB, courier, buyer name/phone/business, brand, shipment status, failure reason…"
                  className="w-full px-4 py-2 text-sm bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                />
              </div>
              {filteredRtoListRows && filteredRtoListRows.length > 0 && (() => {
                const rows = filteredRtoListRows;
                const sum = (f: (r: RtoOrderRow) => number | null | undefined) =>
                  rows.reduce((s, r) => s + (Number(f(r)) || 0), 0);
                const gmv = sum((r) => r.orderValue);
                const paid = sum((r) => r.paidAmount);
                const cod = sum((r) => r.codCollect);
                const avg = rows.length ? gmv / rows.length : 0;
                const isFiltered = !!rtoListData && rows.length !== rtoListData.length;
                return (
                  <div className="px-8 py-3 border-b border-white/10 bg-fuchsia-500/5 flex items-center gap-6 flex-wrap text-sm">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-fuchsia-300">
                      {isFiltered ? 'Filtered summary' : 'Summary'}
                    </span>
                    <SummaryStat label="Orders" value={rows.length.toLocaleString('en-IN')} />
                    <SummaryStat label="Order value" value={formatAmount(gmv)} />
                    <SummaryStat label="Paid" value={formatAmount(paid)} />
                    <SummaryStat label="COD" value={formatAmount(cod)} />
                    <SummaryStat label="Avg value" value={formatAmount(avg)} />
                  </div>
                );
              })()}
              <div className="overflow-auto max-h-[640px]">
                {rtoListLoading ? (
                  <div className="px-8 py-12 text-center text-purple-300">Loading RTO orders…</div>
                ) : !rtoListData || rtoListData.length === 0 ? (
                  <div className="px-8 py-12 text-center text-purple-300">No RTO orders in this range</div>
                ) : !filteredRtoListRows || filteredRtoListRows.length === 0 ? (
                  <div className="px-8 py-12 text-center text-purple-300">No matches for &ldquo;{rtoListSearch}&rdquo;</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur">
                      <tr className="border-b border-white/10">
                        <th className="px-3 py-3 text-left font-semibold text-purple-200 whitespace-nowrap">Brand</th>
                        <th className="px-3 py-3 text-left font-semibold text-purple-200 whitespace-nowrap">PO Number</th>
                        <th className="px-3 py-3 text-right font-semibold text-purple-200 whitespace-nowrap">Order Value</th>
                        <th className="px-3 py-3 text-right font-semibold text-emerald-200 whitespace-nowrap">Paid Amount</th>
                        <th className="px-3 py-3 text-right font-semibold text-cyan-200 whitespace-nowrap">Applied Wallet Amount</th>
                        <th className="px-3 py-3 text-left font-semibold text-rose-200 whitespace-nowrap" title="Sorted newest first">
                          Marked Rejected <span className="text-rose-300">↓</span>
                        </th>
                        <th className="px-3 py-3 text-left font-semibold text-purple-200 whitespace-nowrap">ITL Date</th>
                        <th className="px-3 py-3 text-left font-semibold text-purple-200 whitespace-nowrap">Shipment Status</th>
                        <th className="px-3 py-3 text-left font-semibold text-purple-200 whitespace-nowrap">Buyer Phone</th>
                        <th className="px-3 py-3 text-left font-semibold text-purple-200 whitespace-nowrap">Buyer Business</th>
                        <th className="px-3 py-3 text-left font-semibold text-purple-200 whitespace-nowrap">Order Date</th>
                        <th className="px-3 py-3 text-left font-semibold text-purple-200 whitespace-nowrap">Latest Attempt</th>
                        <th className="px-3 py-3 text-right font-semibold text-purple-200 whitespace-nowrap">Coupon</th>
                        <th className="px-3 py-3 text-left font-semibold text-purple-200 whitespace-nowrap">Payment</th>
                        <th className="px-3 py-3 text-left font-semibold text-rose-200 bg-rose-500/10 whitespace-nowrap">Final Failure Reason</th>
                        <th className="px-3 py-3 text-right font-semibold text-purple-200 whitespace-nowrap">Attempts</th>
                        <th className="px-3 py-3 text-left font-semibold text-purple-200 whitespace-nowrap">Attempt 1</th>
                        <th className="px-3 py-3 text-left font-semibold text-purple-200 whitespace-nowrap">Attempt 2</th>
                        <th className="px-3 py-3 text-left font-semibold text-purple-200 whitespace-nowrap">Attempt 3</th>
                        <th className="px-3 py-3 text-left font-semibold text-purple-200 whitespace-nowrap">Attempt 4</th>
                        <th className="px-3 py-3 text-left font-semibold text-purple-200 whitespace-nowrap">Attempt 5</th>
                        <th className="px-3 py-3 text-left font-semibold text-purple-200 whitespace-nowrap">Attempt 6</th>
                        <th className="px-3 py-3 text-left font-semibold text-purple-200 whitespace-nowrap">AWB</th>
                        <th className="px-3 py-3 text-left font-semibold text-purple-200 whitespace-nowrap">Courier</th>
                        <th className="px-3 py-3 text-right font-semibold text-purple-200 whitespace-nowrap">COD</th>
                        <th className="px-3 py-3 text-left font-semibold text-purple-200 whitespace-nowrap">Buyer Name</th>
                        <th className="px-3 py-3 text-left font-semibold text-purple-200">Buyer Address</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(rtoListPaged?.rows || filteredRtoListRows).map((r) => {
                        const attemptCell = (t: string | null, remark: string | null) => {
                          if (!t && !remark) return <span className="text-white/30">—</span>;
                          return (
                            <div className="min-w-[140px]">
                              <div className="text-purple-100 whitespace-nowrap">{t || '—'}</div>
                              <div className="text-[10px] text-purple-300/70 leading-tight max-w-[200px] truncate" title={remark || ''}>{remark || ''}</div>
                            </div>
                          );
                        };
                        return (
                          <tr key={r.poNumber} className="border-b border-white/5 hover:bg-white/5 align-top">
                            <td className="px-3 py-2.5 text-purple-100 whitespace-nowrap font-medium">{r.brandName || '—'}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-white tabular-nums font-semibold">{r.poNumber}</span>
                                <a
                                  href={`https://d2r-support-dashboard.vercel.app/?po_number=${encodeURIComponent(r.poNumber)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-fuchsia-200 bg-fuchsia-500/15 hover:bg-fuchsia-500/30 border border-fuchsia-400/40 transition-all"
                                  title="Open in D2R Support Dashboard"
                                >
                                  Details
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M7 17L17 7" />
                                    <polyline points="7 7 17 7 17 17" />
                                  </svg>
                                </a>
                                <button
                                  onClick={() => openPoItemsModal(r.poNumber)}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-emerald-200 bg-emerald-500/15 hover:bg-emerald-500/30 border border-emerald-400/40 transition-all"
                                  title="View items + price breakup"
                                >
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                                    <line x1="12" y1="22.08" x2="12" y2="12" />
                                  </svg>
                                  Items
                                </button>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right text-white tabular-nums whitespace-nowrap">{formatAmount(r.orderValue)}</td>
                            <td className="px-3 py-2.5 text-right text-emerald-200 tabular-nums whitespace-nowrap">{r.paidAmount != null ? formatAmount(r.paidAmount) : '—'}</td>
                            <td className="px-3 py-2.5 text-right text-cyan-200 tabular-nums whitespace-nowrap">{r.appliedWalletAmount != null && r.appliedWalletAmount > 0 ? formatAmount(r.appliedWalletAmount) : '—'}</td>
                            <td className="px-3 py-2.5 text-rose-200 whitespace-nowrap">{r.markedRejectedTime || '—'}</td>
                            <td className="px-3 py-2.5 text-purple-100 whitespace-nowrap">{r.itlDate || '—'}</td>
                            <td className="px-3 py-2.5 text-purple-100 whitespace-nowrap">{r.shipmentStatus || '—'}</td>
                            <td className="px-3 py-2.5 text-purple-100 tabular-nums whitespace-nowrap">{r.buyerPhone || '—'}</td>
                            <td className="px-3 py-2.5 text-purple-100">{r.buyerBusinessName || '—'}</td>
                            <td className="px-3 py-2.5 text-purple-100 whitespace-nowrap">{r.orderDate || '—'}</td>
                            <td className="px-3 py-2.5 text-purple-100 whitespace-nowrap">{r.latestAttemptTime || '—'}</td>
                            <td className="px-3 py-2.5 text-right text-purple-200 tabular-nums whitespace-nowrap">{r.couponValue ? formatAmount(r.couponValue) : '—'}</td>
                            <td className="px-3 py-2.5 text-purple-100 whitespace-nowrap">{r.paymentMode || '—'}</td>
                            <td className="px-3 py-2.5 text-rose-200 bg-rose-500/5 max-w-[260px]" title={r.finalFailureReason || ''}>{r.finalFailureReason || <span className="italic text-purple-300/60">—</span>}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-bold text-rose-200">{r.deliveryAttempt || 0}</td>
                            <td className="px-3 py-2.5">{attemptCell(r.attempt1Time, r.attempt1Remarks)}</td>
                            <td className="px-3 py-2.5">{attemptCell(r.attempt2Time, r.attempt2Remarks)}</td>
                            <td className="px-3 py-2.5">{attemptCell(r.attempt3Time, r.attempt3Remarks)}</td>
                            <td className="px-3 py-2.5">{attemptCell(r.attempt4Time, r.attempt4Remarks)}</td>
                            <td className="px-3 py-2.5">{attemptCell(r.attempt5Time, r.attempt5Remarks)}</td>
                            <td className="px-3 py-2.5">{attemptCell(r.attempt6Time, r.attempt6Remarks)}</td>
                            <td className="px-3 py-2.5 text-purple-100 tabular-nums whitespace-nowrap">{r.awbNumber || '—'}</td>
                            <td className="px-3 py-2.5 text-purple-100 whitespace-nowrap">{r.logisticName || '—'}</td>
                            <td className="px-3 py-2.5 text-right text-purple-200 tabular-nums whitespace-nowrap">{r.codCollect ? formatAmount(r.codCollect) : '—'}</td>
                            <td className="px-3 py-2.5 text-purple-100 whitespace-nowrap">{r.buyerName || '—'}</td>
                            <td className="px-3 py-2.5 text-purple-100 max-w-[320px]" title={r.buyerFullAddress || ''}>{r.buyerFullAddress || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              {rtoListPaged && filteredRtoListRows && filteredRtoListRows.length > 0 && (
                <div className="px-8 py-3 border-t border-white/10 bg-white/5 flex items-center justify-between text-sm text-purple-200 flex-wrap gap-3">
                  <div>
                    Showing <span className="font-semibold text-white">{rtoListPaged.startIdx + 1}</span>–<span className="font-semibold text-white">{rtoListPaged.endIdx}</span> of <span className="font-semibold text-white">{filteredRtoListRows.length}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setRtoListPage((p) => Math.max(1, p - 1))}
                      disabled={rtoListPaged.safePage <= 1}
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Prev
                    </button>
                    <span className="px-3 py-1.5 text-white/70">Page <span className="text-white font-semibold">{rtoListPaged.safePage}</span> of {rtoListPaged.totalPages}</span>
                    <button
                      onClick={() => setRtoListPage((p) => Math.min(rtoListPaged.totalPages, p + 1))}
                      disabled={rtoListPaged.safePage >= rtoListPaged.totalPages}
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
            )}

            {rtoSubTab === 'hub' && (() => {
              const totalRows = hubData?.data.length ?? 0;
              const filtered = filteredHubRows ?? [];
              const pageStart = (hubPage - 1) * hubSize;
              const pageRows = filtered.slice(pageStart, pageStart + hubSize);
              const totalPages = Math.max(1, Math.ceil(filtered.length / hubSize));
              const stuckCount = hubData?.data.filter((r) => r.stillInDestinationHub === 'Yes').length ?? 0;
              const totalCod = filtered.reduce((s, r) => s + (r.codCollect || 0), 0);
              const totalGmv = filtered.reduce((s, r) => s + (r.orderValue || 0), 0);
              const toggleSet = (s: Set<string>, v: string, setter: (n: Set<string>) => void) => {
                const next = new Set(s);
                if (next.has(v)) next.delete(v); else next.add(v);
                setter(next);
              };
              return (
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25),inset_0_0_30px_rgba(168,85,247,0.12)]">
                <div className="px-8 py-6 border-b border-white/10 bg-white/5 flex items-start justify-between flex-wrap gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-white">Destination Hub Order Tracking</h2>
                    <p className="text-purple-300 text-sm mt-1">Delhivery RTO / OFD / Reached-At-Destination shipments — spot orders stuck at the destination hub.</p>
                  </div>
                  {queryBtn('hub', 'Destination Hub Order Tracking')}
                  {hubData && (
                    <div className="flex items-center gap-6 text-sm flex-wrap">
                      <div className="text-right">
                        <div className="text-purple-300 text-xs uppercase tracking-wider">Total</div>
                        <div className="text-white font-bold text-lg">{totalRows.toLocaleString('en-IN')}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-amber-300 text-xs uppercase tracking-wider">Stuck at hub</div>
                        <div className="text-amber-200 font-bold text-lg">{stuckCount.toLocaleString('en-IN')}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-purple-300 text-xs uppercase tracking-wider">Filtered GMV</div>
                        <div className="text-white font-bold text-lg">{formatAmount(totalGmv)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-purple-300 text-xs uppercase tracking-wider">Filtered COD</div>
                        <div className="text-white font-bold text-lg">{formatAmount(totalCod)}</div>
                      </div>
                      <button
                        className={DOWNLOAD_BTN_CLASS}
                        onClick={() => {
                          const headers = [
                            'Order Date & Time', 'ITL Date & Time',
                            'Reached At Destination Time', 'Reached At Destination Place',
                            'Picked Up Time', 'Pickup To Hub Days',
                            'Days Since Reached At Destination',
                            'Latest Scan Time', 'Latest Scan Place', 'Still In Destination Hub',
                            'PO Number', 'PO Status', 'Order Value', 'Paid Amount', 'Applied Wallet Amount', 'Coupon Value', 'Payment Mode',
                            'Brand Name', 'Shipment Status', 'Delivery Attempt',
                            'Attempt 1 Time', 'Attempt 1 Remarks',
                            'Attempt 2 Time', 'Attempt 2 Remarks',
                            'Attempt 3 Time', 'Attempt 3 Remarks',
                            'Attempt 4 Time', 'Attempt 4 Remarks',
                            'Attempt 5 Time', 'Attempt 5 Remarks',
                            'Attempt 6 Time', 'Attempt 6 Remarks',
                            'AWB Number', 'Logistic Name', 'COD Collect',
                            'Buyer Name', 'Buyer Business Name', 'Buyer Phone',
                            'Buyer Full Address', 'Buyer Longitude', 'Buyer Latitude',
                          ];
                          const rows: CsvCell[][] = filtered.map((r) => [
                            r.orderDateTime, r.itlDateTime,
                            r.reachedAtDestinationTime, r.reachedAtDestinationPlace,
                            r.pickedUpTime, r.pickupToHubDays,
                            r.daysSinceReachedAtDestination,
                            r.latestScanTime, r.latestScanPlace, r.stillInDestinationHub,
                            r.poNumber, r.poStatus, r.orderValue, r.paidAmount, r.appliedWalletAmount, r.couponValue, r.paymentMode,
                            r.brandName, r.shipmentStatus, r.deliveryAttempt,
                            r.attempts[0]?.time, r.attempts[0]?.remarks,
                            r.attempts[1]?.time, r.attempts[1]?.remarks,
                            r.attempts[2]?.time, r.attempts[2]?.remarks,
                            r.attempts[3]?.time, r.attempts[3]?.remarks,
                            r.attempts[4]?.time, r.attempts[4]?.remarks,
                            r.attempts[5]?.time, r.attempts[5]?.remarks,
                            r.awbNumber, r.logisticName, r.codCollect,
                            r.buyerName, r.buyerBusinessName, r.buyerPhone,
                            r.buyerFullAddress, r.buyerLongitude, r.buyerLatitude,
                          ]);
                          downloadCSV(`destination-hub-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
                        }}
                      >
                        ↓ CSV
                      </button>
                    </div>
                  )}
                </div>

                {/* Filter bar */}
                <div className="px-6 py-3 border-b border-white/10 bg-white/[0.02] flex flex-col gap-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="relative flex-1 min-w-[300px] max-w-[520px]">
                      <input
                        type="text"
                        value={hubSearch}
                        onChange={(e) => setHubSearch(e.target.value)}
                        placeholder="Search PO #, AWB, buyer / phone, address, hub, brand, courier…"
                        className="w-full pl-9 pr-9 py-2 text-sm rounded-lg bg-white/10 border border-white/15 text-white placeholder-purple-300/50 focus:bg-white/15 focus:border-fuchsia-400/50 focus:outline-none focus:ring-2 focus:ring-fuchsia-400/30"
                      />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-300/60">⌕</span>
                      {hubSearch && (
                        <button type="button" onClick={() => setHubSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 text-xs font-bold rounded text-purple-300/70 hover:text-white hover:bg-white/10">×</button>
                      )}
                    </div>
                    <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold cursor-pointer border ${hubStuckOnly ? 'bg-amber-500/20 text-amber-200 border-amber-400/50' : 'bg-white/5 text-purple-200 border-white/10 hover:bg-white/10'}`}>
                      <input type="checkbox" checked={hubStuckOnly} onChange={(e) => setHubStuckOnly(e.target.checked)} className="accent-amber-400 w-3.5 h-3.5" />
                      Stuck at hub only
                    </label>
                    <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold bg-white/5 border border-white/10 text-purple-200">
                      <span className="text-purple-300/70">Min days at hub</span>
                      <input type="number" min={0} step={0.5} value={hubMinDays} onChange={(e) => setHubMinDays(e.target.value === '' ? '' : Number(e.target.value))} placeholder="—" className="w-16 px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-white text-xs text-right focus:outline-none focus:ring-1 focus:ring-fuchsia-400/40" />
                    </div>
                    <span className="ml-auto text-xs font-semibold text-purple-200/80">
                      <span className="text-fuchsia-300">{filtered.length.toLocaleString('en-IN')}</span> of {totalRows.toLocaleString('en-IN')} matching
                    </span>
                  </div>

                  {hubData && hubData.facets.shipmentStatus.length > 0 && (
                    <div className="flex items-start gap-2 flex-wrap">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-purple-300/70 mt-1.5 w-20 shrink-0">Shipment</span>
                      <div className="flex flex-wrap gap-1.5">
                        {hubData.facets.shipmentStatus.map((s) => {
                          const active = hubShipmentFilter.has(s);
                          return (
                            <button key={s} onClick={() => toggleSet(hubShipmentFilter, s, setHubShipmentFilter)} className={`px-2 py-1 rounded text-[10px] font-bold border transition-all ${active ? 'bg-fuchsia-500/25 text-fuchsia-100 border-fuchsia-400/60 ring-1 ring-fuchsia-400/40' : 'bg-white/5 text-purple-200/80 border-white/10 hover:bg-white/10 hover:text-white'}`}>
                              {s}
                            </button>
                          );
                        })}
                        {hubShipmentFilter.size > 0 && (
                          <button onClick={() => setHubShipmentFilter(new Set())} className="px-2 py-1 rounded text-[10px] font-bold bg-rose-500/15 text-rose-200 border border-rose-400/30 hover:bg-rose-500/25">✕ Clear</button>
                        )}
                      </div>
                    </div>
                  )}
                  {hubData && hubData.facets.brand.length > 0 && (
                    <div className="flex items-start gap-2 flex-wrap">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-purple-300/70 mt-1.5 w-20 shrink-0">Brand</span>
                      <div className="flex flex-wrap gap-1.5">
                        {hubData.facets.brand.map((b) => {
                          const active = hubBrandFilter.has(b);
                          return (
                            <button key={b} onClick={() => toggleSet(hubBrandFilter, b, setHubBrandFilter)} className={`px-2 py-1 rounded text-[10px] font-bold border transition-all ${active ? 'bg-emerald-500/25 text-emerald-100 border-emerald-400/60 ring-1 ring-emerald-400/40' : 'bg-white/5 text-purple-200/80 border-white/10 hover:bg-white/10 hover:text-white'}`}>
                              {b}
                            </button>
                          );
                        })}
                        {hubBrandFilter.size > 0 && (
                          <button onClick={() => setHubBrandFilter(new Set())} className="px-2 py-1 rounded text-[10px] font-bold bg-rose-500/15 text-rose-200 border border-rose-400/30 hover:bg-rose-500/25">✕ Clear</button>
                        )}
                      </div>
                    </div>
                  )}
                  {hubData && hubData.facets.paymentMode.length > 0 && (() => {
                    const counts = new Map<string, number>();
                    for (const r of hubData.data) {
                      const k = r.paymentMode || '__NONE__';
                      counts.set(k, (counts.get(k) || 0) + 1);
                    }
                    const opts = Array.from(counts.entries())
                      .sort(([, a], [, b]) => b - a)
                      .map(([value, count]) => ({ value, label: value === '__NONE__' ? 'Unspecified' : value, count }));
                    return (
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-purple-300/70 mt-1.5 w-20 shrink-0">Payment</span>
                        <MultiSelectFilter
                          label="Payment"
                          allLabel="All payments"
                          options={opts}
                          selected={hubPaymentFilter}
                          onChange={setHubPaymentFilter}
                          widthClass="w-44"
                        />
                      </div>
                    );
                  })()}
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-purple-300/70 mt-1.5 w-20 shrink-0">Attempts</span>
                    <div className="flex flex-wrap gap-1.5">
                      {(['0', '1', '2', '3', '4', '5+'] as const).map((opt) => {
                        const active = hubAttemptFilter.has(opt);
                        const count = hubData?.data.filter((r) => {
                          const a = r.deliveryAttempt || 0;
                          return opt === '5+' ? a >= 5 : a === Number(opt);
                        }).length ?? 0;
                        const accent = opt === '0'
                          ? 'bg-slate-500/15 text-slate-200 border-slate-400/30'
                          : opt === '1' || opt === '2'
                            ? 'bg-amber-500/15 text-amber-200 border-amber-400/30'
                            : 'bg-rose-500/15 text-rose-200 border-rose-400/30';
                        return (
                          <button key={opt} onClick={() => toggleSet(hubAttemptFilter, opt, setHubAttemptFilter)} className={`px-2 py-1 rounded text-[10px] font-bold border transition-all ${active ? `${accent} ring-1 ring-fuchsia-400/40 brightness-125` : 'bg-white/5 text-purple-200/80 border-white/10 hover:bg-white/10 hover:text-white'}`}>
                            {opt} <span className="opacity-60 tabular-nums">({count})</span>
                          </button>
                        );
                      })}
                      {hubAttemptFilter.size > 0 && (
                        <button onClick={() => setHubAttemptFilter(new Set())} className="px-2 py-1 rounded text-[10px] font-bold bg-rose-500/15 text-rose-200 border border-rose-400/30 hover:bg-rose-500/25">✕ Clear</button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-purple-300/70 mt-1.5 w-20 shrink-0">Stuck time</span>
                    <div className="flex flex-wrap gap-1.5 items-center">
                      {([
                        { key: '<1',  label: '< 1 day' },
                        { key: '1-2', label: '1–2 days' },
                        { key: '2-3', label: '2–3 days' },
                        { key: '3-4', label: '3–4 days' },
                        { key: '4-5', label: '4–5 days' },
                        { key: '5+',  label: '> 5 days' },
                      ] as const).map((opt) => {
                        const active = hubStuckBucketFilter.has(opt.key);
                        const count = hubData?.data.filter((r) => hubStuckBucketOf(r.daysSinceReachedAtDestination) === opt.key).length ?? 0;
                        const accent = opt.key === '<1'
                          ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30'
                          : opt.key === '1-2' || opt.key === '2-3'
                            ? 'bg-amber-500/15 text-amber-200 border-amber-400/30'
                            : 'bg-rose-500/15 text-rose-200 border-rose-400/30';
                        return (
                          <button key={opt.key} onClick={() => toggleSet(hubStuckBucketFilter, opt.key, setHubStuckBucketFilter)} className={`px-2 py-1 rounded text-[10px] font-bold border transition-all ${active ? `${accent} ring-1 ring-fuchsia-400/40 brightness-125` : 'bg-white/5 text-purple-200/80 border-white/10 hover:bg-white/10 hover:text-white'}`}>
                            {opt.label} <span className="opacity-60 tabular-nums">({count})</span>
                          </button>
                        );
                      })}
                      {hubStuckBucketFilter.size > 0 && (
                        <button onClick={() => setHubStuckBucketFilter(new Set())} className="px-2 py-1 rounded text-[10px] font-bold bg-rose-500/15 text-rose-200 border border-rose-400/30 hover:bg-rose-500/25">✕ Clear</button>
                      )}
                      <span className="w-px h-5 bg-white/15 mx-1"></span>
                      <span className="text-[10px] uppercase tracking-wider font-bold text-purple-300/50">Sort</span>
                      {([
                        { key: 'desc', label: 'High → Low' },
                        { key: 'asc',  label: 'Low → High' },
                      ] as const).map((opt) => {
                        const active = hubStuckSort === opt.key;
                        return (
                          <button key={opt.key} onClick={() => setHubStuckSort(active ? 'none' : opt.key)} className={`px-2 py-1 rounded text-[10px] font-bold border transition-all ${active ? 'bg-fuchsia-500/25 text-fuchsia-100 border-fuchsia-400/60 ring-1 ring-fuchsia-400/40' : 'bg-white/5 text-purple-200/80 border-white/10 hover:bg-white/10 hover:text-white'}`}>
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
                  {hubLoading || !hubData ? (
                    <div className="px-8 py-16 text-center text-sm text-purple-300">Loading destination-hub shipments…</div>
                  ) : filtered.length === 0 ? (
                    <div className="px-8 py-16 text-center text-sm text-purple-300">
                      No shipments match the current filters.
                    </div>
                  ) : (
                    <table className="w-full text-sm border-separate border-spacing-0" style={{ minWidth: 1700 }}>
                      <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur">
                        <tr>
                          <th className="px-3 py-2 text-center w-6 border-b border-white/10 text-[10px] text-purple-300/70 font-bold uppercase tracking-wider"></th>
                          <th className="px-3 py-2 text-left border-b border-white/10 text-[10px] text-purple-300/70 font-bold uppercase tracking-wider">PO #</th>
                          <th className="px-3 py-2 text-left border-b border-white/10 text-[10px] text-purple-300/70 font-bold uppercase tracking-wider">Status</th>
                          <th className="px-3 py-2 text-left border-b border-white/10 text-[10px] text-purple-300/70 font-bold uppercase tracking-wider">Brand</th>
                          <th className="px-3 py-2 text-left border-b border-white/10 text-[10px] text-purple-300/70 font-bold uppercase tracking-wider">Shipment</th>
                          <th className="px-3 py-2 text-right border-b border-white/10 text-[10px] text-purple-300/70 font-bold uppercase tracking-wider">Order ₹</th>
                          <th className="px-3 py-2 text-right border-b border-white/10 text-[10px] text-emerald-300/80 font-bold uppercase tracking-wider">Paid ₹</th>
                          <th className="px-3 py-2 text-right border-b border-white/10 text-[10px] text-cyan-300/80 font-bold uppercase tracking-wider">Wallet ₹</th>
                          <th className="px-3 py-2 text-right border-b border-white/10 text-[10px] text-purple-300/70 font-bold uppercase tracking-wider">Coupon ₹</th>
                          <th className="px-3 py-2 text-left border-b border-white/10 text-[10px] text-purple-300/70 font-bold uppercase tracking-wider">Payment</th>
                          <th className="px-3 py-2 text-right border-b border-white/10 text-[10px] text-purple-300/70 font-bold uppercase tracking-wider">COD ₹</th>
                          <th className="px-3 py-2 text-left border-b border-white/10 text-[10px] text-purple-300/70 font-bold uppercase tracking-wider">Marked pending</th>
                          <th className="px-3 py-2 text-left border-b border-white/10 text-[10px] text-purple-300/70 font-bold uppercase tracking-wider">Reached hub</th>
                          <th className="px-3 py-2 text-left border-b border-white/10 text-[10px] text-purple-300/70 font-bold uppercase tracking-wider">Latest scan</th>
                          <th className="px-3 py-2 text-right border-b border-white/10 text-[10px] text-purple-300/70 font-bold uppercase tracking-wider">Stuck?</th>
                          <th className="px-3 py-2 text-right border-b border-white/10 text-[10px] text-purple-300/70 font-bold uppercase tracking-wider">Attempts</th>
                          <th className="px-3 py-2 text-left border-b border-white/10 text-[10px] text-purple-300/70 font-bold uppercase tracking-wider">Buyer</th>
                          <th className="px-3 py-2 text-left border-b border-white/10 text-[10px] text-purple-300/70 font-bold uppercase tracking-wider">AWB</th>
                          <th className="px-3 py-2 text-left border-b border-white/10 text-[10px] text-purple-300/70 font-bold uppercase tracking-wider">Logistic</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.map((r, idx) => {
                          const isOpen = hubExpanded.has(r.poNumber);
                          const stuckYes = r.stillInDestinationHub === 'Yes';
                          const daysClass = r.daysSinceReachedAtDestination == null
                            ? 'text-purple-300/40'
                            : r.daysSinceReachedAtDestination >= 5
                              ? 'text-rose-300 font-extrabold'
                              : r.daysSinceReachedAtDestination >= 2
                                ? 'text-amber-200 font-bold'
                                : 'text-emerald-300';
                          return (
                            <Fragment key={r.poNumber}>
                              <tr onClick={() => toggleHubExpanded(r.poNumber)} className={`cursor-pointer ${idx % 2 === 0 ? 'bg-white/[0.02]' : 'bg-transparent'} hover:bg-white/10 transition-colors ${isOpen ? 'bg-fuchsia-500/10' : ''}`}>
                                <td className="px-3 py-1.5 text-center border-b border-white/5">
                                  <span className="text-[11px] text-purple-300">{isOpen ? '▾' : '▸'}</span>
                                </td>
                                <td className="px-3 py-1.5 border-b border-white/5 min-w-[180px]">
                                  <div className="flex flex-col items-start gap-1">
                                    <span className="text-xs font-extrabold tabular-nums text-fuchsia-200">#{r.poNumber}</span>
                                    <div className="flex items-center gap-1.5">
                                      <a
                                        href={`https://d2r-support-dashboard.vercel.app/?po_number=${encodeURIComponent(r.poNumber)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-fuchsia-200 bg-fuchsia-500/20 hover:bg-fuchsia-500/40 border border-fuchsia-400/50 transition-all whitespace-nowrap"
                                        title="Open in D2R Support Dashboard"
                                      >
                                        Details
                                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                          <path d="M7 17L17 7" />
                                          <polyline points="7 7 17 7 17 17" />
                                        </svg>
                                      </a>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); openPoItemsModal(r.poNumber); }}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-emerald-200 bg-emerald-500/20 hover:bg-emerald-500/40 border border-emerald-400/50 transition-all whitespace-nowrap"
                                        title="View items + price breakup"
                                      >
                                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                                          <line x1="12" y1="22.08" x2="12" y2="12" />
                                        </svg>
                                        Items
                                      </button>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-1.5 border-b border-white/5 align-middle"><span className="inline-block whitespace-nowrap text-[10px] font-bold px-1.5 py-0.5 rounded border border-white/15 bg-white/10 text-white">{r.poStatus}</span></td>
                                <td className="px-3 py-1.5 border-b border-white/5 align-middle"><span className="whitespace-nowrap text-xs font-semibold text-purple-100">{r.brandName ?? '—'}</span></td>
                                <td className="px-3 py-1.5 border-b border-white/5 align-middle"><span className="inline-block whitespace-nowrap text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-400/30 bg-amber-500/15 text-amber-200">{r.shipmentStatus ?? '—'}</span></td>
                                <td className="px-3 py-1.5 border-b border-white/5 text-right"><span className="text-xs font-extrabold tabular-nums text-white">{formatAmount(r.orderValue)}</span></td>
                                <td className="px-3 py-1.5 border-b border-white/5 text-right"><span className={`text-xs font-bold tabular-nums ${r.paidAmount != null && r.paidAmount > 0 ? 'text-emerald-200' : 'text-white/40'}`}>{r.paidAmount != null && r.paidAmount > 0 ? formatAmount(r.paidAmount) : '—'}</span></td>
                                <td className="px-3 py-1.5 border-b border-white/5 text-right"><span className={`text-xs font-bold tabular-nums ${r.appliedWalletAmount != null && r.appliedWalletAmount > 0 ? 'text-cyan-200' : 'text-white/40'}`}>{r.appliedWalletAmount != null && r.appliedWalletAmount > 0 ? formatAmount(r.appliedWalletAmount) : '—'}</span></td>
                                <td className="px-3 py-1.5 border-b border-white/5 text-right"><span className={`text-xs font-bold tabular-nums ${r.couponValue > 0 ? 'text-fuchsia-200' : 'text-white/40'}`}>{r.couponValue > 0 ? formatAmount(r.couponValue) : '—'}</span></td>
                                <td className="px-3 py-1.5 border-b border-white/5"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap ${r.paymentMode ? 'bg-sky-500/15 text-sky-200 border-sky-400/30' : 'bg-white/5 text-white/40 border-white/10'}`}>{r.paymentMode ?? '—'}</span></td>
                                <td className="px-3 py-1.5 border-b border-white/5 text-right"><span className={`text-xs font-bold tabular-nums ${r.codCollect > 0 ? 'text-emerald-200' : 'text-white/40'}`}>{r.codCollect > 0 ? formatAmount(r.codCollect) : '—'}</span></td>
                                <td className="px-3 py-1.5 border-b border-white/5">
                                  <div className="text-[11px] font-semibold text-white whitespace-nowrap" title={r.orderDateTime ?? ''}>{r.orderDateTime ?? '—'}</div>
                                </td>
                                <td className="px-3 py-1.5 border-b border-white/5">
                                  <div className="text-[11px] font-semibold text-white truncate max-w-[200px]" title={r.reachedAtDestinationPlace ?? ''}>{r.reachedAtDestinationPlace ?? '—'}</div>
                                  <div className="text-[10px] text-purple-300/70">{r.reachedAtDestinationTime ?? '—'}</div>
                                  {r.pickupToHubDays != null && (
                                    <div className="text-[10px] mt-0.5 text-cyan-300/90 tabular-nums" title={r.pickedUpTime ? `Picked up ${r.pickedUpTime} → reached hub (transit time)` : 'Pickup → reached destination hub (transit time)'}>
                                      🚚 {r.pickupToHubDays.toFixed(2)}d <span className="text-purple-300/50">pickup→hub</span>
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-1.5 border-b border-white/5">
                                  <div className="text-[11px] font-semibold text-white truncate max-w-[200px]" title={r.latestScanPlace ?? ''}>{r.latestScanPlace ?? '—'}</div>
                                  <div className="text-[10px] text-purple-300/70">{r.latestScanTime ?? '—'}</div>
                                </td>
                                <td className="px-3 py-1.5 border-b border-white/5 text-right">
                                  {r.stillInDestinationHub == null ? (
                                    <span className="text-[10px] text-purple-300/40">—</span>
                                  ) : (
                                    <div className="flex flex-col items-end gap-0.5">
                                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${stuckYes ? 'bg-amber-500/20 text-amber-200 border-amber-400/40' : 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30'}`}>{r.stillInDestinationHub}</span>
                                      {r.daysSinceReachedAtDestination != null && (
                                        <span className={`text-[10px] tabular-nums ${daysClass}`}>{r.daysSinceReachedAtDestination.toFixed(2)}d</span>
                                      )}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-1.5 border-b border-white/5 text-right">
                                  <span className={`text-xs font-extrabold tabular-nums ${r.deliveryAttempt >= 3 ? 'text-rose-200' : r.deliveryAttempt >= 1 ? 'text-amber-200' : 'text-purple-200/60'}`}>{r.deliveryAttempt}</span>
                                </td>
                                <td className="px-3 py-1.5 border-b border-white/5">
                                  <div className="text-[11px] font-semibold text-white truncate max-w-[160px]" title={r.buyerBusinessName ?? r.buyerName ?? ''}>{r.buyerBusinessName ?? r.buyerName ?? '—'}</div>
                                  <div className="text-[10px] text-sky-300/80 tabular-nums">{r.buyerPhone ?? '—'}</div>
                                </td>
                                <td className="px-3 py-1.5 border-b border-white/5"><span className="text-[11px] font-semibold tabular-nums text-sky-200">{r.awbNumber ?? '—'}</span></td>
                                <td className="px-3 py-1.5 border-b border-white/5"><span className="text-[10px] text-purple-200/80">{r.logisticName ?? '—'}</span></td>
                              </tr>
                              {isOpen && (
                                <tr className="bg-white/[0.02]">
                                  <td colSpan={17} className="px-6 py-4 border-b border-fuchsia-400/20">
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-3">
                                      <div>
                                        <div className="text-[9px] uppercase tracking-wider font-bold text-purple-300/60 mb-1">Order</div>
                                        <div className="text-[11px] text-white">Marked pending: <span className="text-purple-200">{r.orderDateTime ?? '—'}</span></div>
                                        <div className="text-[11px] text-white">ITL created: <span className="text-purple-200">{r.itlDateTime ?? '—'}</span></div>
                                        <div className="text-[11px] text-white">Payment: <span className="text-purple-200">{r.paymentMode ?? '—'}</span></div>
                                        <div className="text-[11px] text-white">Coupon: <span className="text-purple-200">{r.couponValue > 0 ? formatAmount(r.couponValue) : '—'}</span></div>
                                      </div>
                                      <div className="lg:col-span-2">
                                        <div className="text-[9px] uppercase tracking-wider font-bold text-purple-300/60 mb-1">Buyer</div>
                                        <div className="text-[11px] text-white">{r.buyerName ?? '—'} {r.buyerBusinessName ? <span className="text-purple-200">· {r.buyerBusinessName}</span> : null}</div>
                                        <div className="text-[11px] text-purple-200">{r.buyerFullAddress ?? '—'}</div>
                                        <div className="text-[10px] text-purple-300/70">{r.buyerLatitude != null && r.buyerLongitude != null ? `${r.buyerLatitude}, ${r.buyerLongitude}` : '—'}</div>
                                      </div>
                                    </div>
                                    <div className="text-[9px] uppercase tracking-wider font-bold text-purple-300/60 mb-1">Delivery attempts ({r.deliveryAttempt})</div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                      {r.attempts.map((a, i) => (
                                        a.time || a.remarks ? (
                                          <div key={i} className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5">
                                            <div className="text-[9px] uppercase tracking-wider font-bold text-fuchsia-300/70">Attempt {i + 1}</div>
                                            <div className="text-[10px] text-purple-200">{a.time ?? '—'}</div>
                                            <div className="text-[11px] text-white truncate" title={a.remarks ?? ''}>{a.remarks ?? '—'}</div>
                                          </div>
                                        ) : null
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Pagination */}
                {hubData && filtered.length > 0 && (
                  <div className="px-6 py-3 border-t border-white/10 bg-white/[0.02] flex items-center justify-between flex-wrap gap-3 text-xs">
                    <div className="text-purple-200/80">
                      Showing <span className="text-white font-bold">{Math.min(pageStart + 1, filtered.length)}</span>–<span className="text-white font-bold">{Math.min(pageStart + hubSize, filtered.length)}</span> of <span className="text-white font-bold">{filtered.length.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-purple-300/70">Rows:</label>
                      <select value={hubSize} onChange={(e) => setHubSize(Number(e.target.value))} className="bg-white/10 border border-white/15 text-white text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-fuchsia-400/40">
                        {[25, 50, 100, 200].map((n) => <option key={n} value={n} className="bg-slate-900">{n}</option>)}
                      </select>
                      <button disabled={hubPage <= 1} onClick={() => setHubPage((p) => Math.max(1, p - 1))} className="px-2 py-1 rounded bg-white/5 border border-white/10 text-purple-200 disabled:opacity-30 hover:bg-white/10">‹ Prev</button>
                      <span className="text-purple-200 tabular-nums">Page <span className="text-white font-bold">{hubPage}</span> / {totalPages}</span>
                      <button disabled={hubPage >= totalPages} onClick={() => setHubPage((p) => Math.min(totalPages, p + 1))} className="px-2 py-1 rounded bg-white/5 border border-white/10 text-purple-200 disabled:opacity-30 hover:bg-white/10">Next ›</button>
                    </div>
                  </div>
                )}
              </div>
              );
            })()}
          </div>
        )}

        {activeTab === 'seller' && (
        <Fragment>
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25),inset_0_0_30px_rgba(168,85,247,0.12)]">
            <div className="px-8 py-6 border-b border-white/10 bg-white/5 flex items-center justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-2xl font-bold text-white">Seller wise</h2>
                <p className="text-purple-300 text-sm mt-1">Order count & revenue by status per seller — {currentYear}</p>
              </div>
              {queryBtn('seller', 'Seller wise')}
              {sellerData && (
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-right">
                    <div className="text-purple-300">Sellers</div>
                    <div className="text-white font-bold text-lg">{sellerData.data.length.toLocaleString()}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-purple-300">Total Orders</div>
                    <div className="text-white font-bold text-lg">{sellerData.totals.grand.count.toLocaleString()}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-purple-300">Total Order Value</div>
                    <div className="text-white font-bold text-lg">{formatAmount(sellerData.totals.grand.amount)}</div>
                  </div>
                  <button
                    className={DOWNLOAD_BTN_CLASS}
                    onClick={() => {
                      const statuses = sellerData.statuses;
                      const headers = ['Seller Business', 'Seller Phone', ...statuses.flatMap((st) => [`${st} Count`, `${st} Amount`]), 'Total Count', 'Total Amount'];
                      const rows: CsvCell[][] = sellerData.data.map((s) => {
                        const cells = statuses.flatMap((st) => {
                          const c = s.statuses[st];
                          return [c?.count ?? 0, c?.amount ?? 0];
                        });
                        return [s.sellerBusinessName, s.sellerPhone, ...cells, s.total.count, s.total.amount];
                      });
                      downloadCSV(`seller-wise-status-${currentYear}.csv`, headers, rows);
                    }}
                  >
                    ↓ CSV
                  </button>
                </div>
              )}
            </div>
            <div className="px-8 py-3 border-b border-white/10 bg-white/5 flex items-center gap-3 flex-wrap">
              <span className="text-xs font-semibold text-purple-300 uppercase tracking-wide">Date</span>
              {([
                { key: 'all', label: `${currentYear} (full year)` },
                { key: '7d', label: 'Last 7 days' },
                { key: '14d', label: 'Last 14 days' },
                { key: '15d', label: 'Last 15 days' },
                { key: 'custom', label: 'Custom' },
              ] as const).map((opt) => {
                const active = sellerRange === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setSellerRange(opt.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      active
                        ? 'bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white shadow-[0_0_18px_rgba(217,70,239,0.4)]'
                        : 'bg-white/10 text-purple-200 hover:bg-white/15 border border-white/10'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
              <MonthMultiSelect selected={sellerMonths} onChange={setSellerMonths} year={currentYear} />
              {sellerRange === 'custom' && (
                <div className="flex items-center gap-2 ml-2">
                  <input
                    type="date"
                    value={sellerCustomFrom}
                    onChange={(e) => setSellerCustomFrom(e.target.value)}
                    className="px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                  <span className="text-purple-300 text-xs">to</span>
                  <input
                    type="date"
                    value={sellerCustomTo}
                    onChange={(e) => setSellerCustomTo(e.target.value)}
                    className="px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                </div>
              )}
              {(() => {
                const { startDate, endDate } = resolveSellerRange();
                if (!startDate && !endDate) return null;
                return (
                  <span className="text-xs text-purple-300/80 ml-auto tabular-nums">
                    {startDate || '…'} → {endDate || '…'}
                  </span>
                );
              })()}
              {(sellerRange !== 'all' || sellerSearch) && (
                <button
                  onClick={() => {
                    setSellerRange('all');
                    setSellerCustomFrom('');
                    setSellerCustomTo('');
                    setSellerSearch('');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-rose-500/20 text-purple-200 hover:text-rose-200 border border-white/10 hover:border-rose-400/40 transition-all ${
                    !(() => { const r = resolveSellerRange(); return r.startDate || r.endDate; })() ? 'ml-auto' : ''
                  }`}
                  title="Reset to current year + clear search"
                >
                  ↺ Reset filter
                </button>
              )}
            </div>
            <div className="px-8 py-3 border-b border-white/10 bg-white/5">
              <input
                type="text"
                value={sellerSearch}
                onChange={(e) => setSellerSearch(e.target.value)}
                placeholder="Search by seller phone or business name..."
                className="w-full px-4 py-2 text-sm bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
              />
            </div>
            <div className="overflow-x-auto">
              {sellerLoading ? (
                <div className="px-8 py-12 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 rounded-full border-2 border-purple-500/30 border-t-purple-500 animate-spin"></div>
                    <p className="text-purple-300">Loading seller data...</p>
                  </div>
                </div>
              ) : !sellerData || sellerData.data.length === 0 ? (
                <div className="px-8 py-12 text-center text-purple-300">No seller data available</div>
              ) : (() => {
                const q = sellerSearch.trim().toLowerCase();
                const filtered = q
                  ? sellerData.data.filter(s =>
                      (s.sellerPhone || '').toLowerCase().includes(q) ||
                      (s.sellerBusinessName || '').toLowerCase().includes(q)
                    )
                  : sellerData.data;
                if (filtered.length === 0) {
                  return <div className="px-8 py-12 text-center text-purple-300">No matches for &ldquo;{sellerSearch}&rdquo;</div>;
                }
                const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
                const safePage = Math.min(sellerTablePage, totalPages);
                const startIdx = (safePage - 1) * PAGE_SIZE;
                const endIdx = Math.min(startIdx + PAGE_SIZE, filtered.length);
                const paged = filtered.slice(startIdx, endIdx);
                return (
                  <Fragment>
                  <div className="overflow-auto max-h-[520px]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-20">
                      <tr className="bg-white/5 border-b border-white/10">
                        <th rowSpan={2} className="px-4 py-3 text-left text-xs font-semibold text-purple-200 sticky left-0 bg-slate-900/95 backdrop-blur z-30 border-r border-white/10 min-w-[260px]">
                          Seller
                        </th>
                        {sellerData.statuses.map((st) => (
                          <th key={st} colSpan={2} className="px-2 py-2 text-center text-xs font-semibold text-purple-200 border-r border-white/10">
                            {st}
                          </th>
                        ))}
                        <th colSpan={2} className="px-2 py-2 text-center text-xs font-bold text-purple-100 bg-purple-500/20">
                          Total
                        </th>
                      </tr>
                      <tr className="bg-white/5 border-b border-white/10">
                        {sellerData.statuses.map((st) => (
                          <Fragment key={st}>
                            <th className="px-2 py-2 text-right text-[10px] font-medium text-purple-300">Count</th>
                            <th className="px-2 py-2 text-right text-[10px] font-medium text-purple-300 border-r border-white/10">Amount</th>
                          </Fragment>
                        ))}
                        <th className="px-2 py-2 text-right text-[10px] font-medium text-purple-100 bg-purple-500/20">Count</th>
                        <th className="px-2 py-2 text-right text-[10px] font-medium text-purple-100 bg-purple-500/20">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paged.map((s) => (
                        <tr
                          key={s.sellerId}
                          onClick={() => openSellerDrill(s)}
                          className="border-b border-white/5 hover:bg-fuchsia-500/15 cursor-pointer transition-colors group"
                        >
                          <td className="px-4 py-3 sticky left-0 bg-slate-900/80 backdrop-blur z-10 border-r border-white/10 group-hover:bg-slate-800/90 text-white text-sm">
                            <div className="font-medium leading-tight group-hover:text-fuchsia-200 transition-colors">{s.sellerBusinessName || '—'}</div>
                            <div className="text-purple-300/70 text-xs tabular-nums leading-tight mt-0.5">{s.sellerPhone || '—'}</div>
                          </td>
                          {sellerData.statuses.map((st) => {
                            const cell = s.statuses[st];
                            const hasData = cell && cell.count > 0;
                            return (
                              <Fragment key={st}>
                                <td className={`px-2 py-3 text-right tabular-nums ${hasData ? 'text-white' : 'text-white/30'}`}>
                                  {hasData ? cell.count.toLocaleString() : '—'}
                                </td>
                                <td className={`px-2 py-3 text-right tabular-nums border-r border-white/10 ${hasData ? 'text-purple-200' : 'text-white/30'}`}>
                                  {hasData ? formatAmount(cell.amount) : '—'}
                                </td>
                              </Fragment>
                            );
                          })}
                          <td className="px-2 py-3 text-right tabular-nums font-bold text-white bg-purple-500/10">
                            {s.total.count.toLocaleString()}
                          </td>
                          <td className="px-2 py-3 text-right tabular-nums font-bold text-purple-100 bg-purple-500/10 border-r border-white/10">
                            {formatAmount(s.total.amount)}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 border-t-2 border-purple-400/40 font-bold">
                        <td className="px-4 py-3 sticky left-0 bg-slate-900/95 backdrop-blur z-10 border-r border-white/10 text-white">
                          <div>Total</div>
                          <div className="text-white/60 text-xs font-normal">{filtered.length} seller{filtered.length === 1 ? '' : 's'}</div>
                        </td>
                        {sellerData.statuses.map((st) => {
                          const cell = sellerData.totals.byStatus[st];
                          const hasData = cell && cell.count > 0;
                          return (
                            <Fragment key={st}>
                              <td className={`px-2 py-3 text-right tabular-nums ${hasData ? 'text-white' : 'text-white/30'}`}>
                                {hasData ? cell.count.toLocaleString() : '—'}
                              </td>
                              <td className={`px-2 py-3 text-right tabular-nums border-r border-white/10 ${hasData ? 'text-purple-100' : 'text-white/30'}`}>
                                {hasData ? formatAmount(cell.amount) : '—'}
                              </td>
                            </Fragment>
                          );
                        })}
                        <td className="px-2 py-3 text-right tabular-nums text-white bg-purple-500/30">
                          {sellerData.totals.grand.count.toLocaleString()}
                        </td>
                        <td className="px-2 py-3 text-right tabular-nums text-purple-50 bg-purple-500/30 border-r border-white/10">
                          {formatAmount(sellerData.totals.grand.amount)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  </div>
                  <div className="px-8 py-4 border-t border-white/10 bg-white/5 flex items-center justify-between text-sm text-purple-200 flex-wrap gap-3">
                    <div>
                      Showing <span className="font-semibold text-white">{startIdx + 1}</span>–<span className="font-semibold text-white">{endIdx}</span> of <span className="font-semibold text-white">{filtered.length}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSellerTablePage(p => Math.max(1, p - 1))}
                        disabled={safePage <= 1}
                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Prev
                      </button>
                      <span className="px-3 py-1.5 text-white/70">Page <span className="text-white font-semibold">{safePage}</span> of {totalPages}</span>
                      <button
                        onClick={() => setSellerTablePage(p => Math.min(totalPages, p + 1))}
                        disabled={safePage >= totalPages}
                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                  </Fragment>
                );
              })()}
            </div>
          </div>

          {/* Seller × Month × Amount Slab */}
          <div className="mt-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25),inset_0_0_30px_rgba(168,85,247,0.12)]">
            <div className="px-8 py-6 border-b border-white/10 bg-white/5 flex items-center justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-2xl font-bold text-white">Seller × Month × Amount Slab</h2>
                <p className="text-purple-300 text-sm mt-1">
                  Only <span className="font-mono text-fuchsia-300">DELIVERED + COMPLETED</span> orders, bucketed by order value per month — {currentYear}
                </p>
              </div>
              {queryBtn('slab', 'Seller × Month × Amount Slab')}
              {slabData && (
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-right">
                    <div className="text-purple-300">Sellers</div>
                    <div className="text-white font-bold text-lg">{slabData.data.length.toLocaleString()}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-purple-300">Total Orders</div>
                    <div className="text-white font-bold text-lg">{slabData.totals.grand.total.toLocaleString()}</div>
                  </div>
                  <button
                    className={DOWNLOAD_BTN_CLASS}
                    onClick={() => {
                      const months = slabData.months;
                      const slabCols = ['0-500', '500-1k', '1k-2k', '>2k'];
                      const headers = ['Seller Business', 'Seller Phone', 'Total Orders'];
                      months.forEach((m) => slabCols.forEach((sc) => headers.push(`${MONTH_NAMES[m - 1]} ${sc}`)));
                      slabCols.forEach((sc) => headers.push(`Total ${sc}`));
                      const rows: CsvCell[][] = slabData.data.map((s) => {
                        const row: CsvCell[] = [s.sellerBusinessName, s.sellerPhone, s.total.total];
                        months.forEach((m) => {
                          const c = s.months[m] || { s0_500: 0, s500_1000: 0, s1000_2000: 0, s2000_plus: 0, total: 0 };
                          row.push(c.s0_500, c.s500_1000, c.s1000_2000, c.s2000_plus);
                        });
                        row.push(s.total.s0_500, s.total.s500_1000, s.total.s1000_2000, s.total.s2000_plus);
                        return row;
                      });
                      downloadCSV(`seller-month-slab-${currentYear}.csv`, headers, rows);
                    }}
                  >
                    ↓ CSV
                  </button>
                </div>
              )}
            </div>
            <div className="px-8 py-3 border-b border-white/10 bg-white/5">
              <input
                type="text"
                value={slabSearch}
                onChange={(e) => setSlabSearch(e.target.value)}
                placeholder="Search by seller phone or business name..."
                className="w-full px-4 py-2 text-sm bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
              />
            </div>
            <div className="overflow-x-auto">
              {slabLoading ? (
                <div className="px-8 py-12 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 rounded-full border-2 border-fuchsia-500/30 border-t-fuchsia-500 animate-spin" />
                    <p className="text-purple-300">Loading slab data...</p>
                  </div>
                </div>
              ) : !slabData || slabData.data.length === 0 ? (
                <div className="px-8 py-12 text-center text-purple-300">No slab data available</div>
              ) : (() => {
                const q = slabSearch.trim().toLowerCase();
                const filtered = q
                  ? slabData.data.filter((s) =>
                      (s.sellerPhone || '').toLowerCase().includes(q) ||
                      (s.sellerBusinessName || '').toLowerCase().includes(q)
                    )
                  : slabData.data;
                if (filtered.length === 0) {
                  return <div className="px-8 py-12 text-center text-purple-300">No matches for &ldquo;{slabSearch}&rdquo;</div>;
                }
                const months = slabData.months;
                return (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-white/5 border-b border-white/10">
                        <th rowSpan={2} className="px-4 py-3 text-left text-xs font-semibold text-purple-200 sticky left-0 bg-slate-900/80 backdrop-blur z-10 border-r border-white/10 min-w-[240px]">
                          Seller
                        </th>
                        <th rowSpan={2} className="px-3 py-3 text-right text-xs font-semibold text-purple-100 bg-purple-500/15 sticky left-[240px] backdrop-blur z-10 border-r border-white/10 min-w-[110px]">
                          Total Orders
                        </th>
                        {months.map((m) => (
                          <th key={m} colSpan={4} className="px-2 py-2 text-center text-xs font-semibold text-purple-200 border-r border-white/10">
                            {MONTH_NAMES[m - 1]}
                          </th>
                        ))}
                        <th colSpan={4} className="px-2 py-2 text-center text-xs font-bold text-purple-100 bg-purple-500/20">
                          Total
                        </th>
                      </tr>
                      <tr className="bg-white/5 border-b border-white/10">
                        {[...months, 'total' as const].map((m) => {
                          const isTotal = m === 'total';
                          return (
                            <Fragment key={String(m)}>
                              <th className={`px-2 py-2 text-right text-[10px] font-medium ${isTotal ? 'text-purple-100 bg-purple-500/20' : 'text-purple-300'}`}>0-500</th>
                              <th className={`px-2 py-2 text-right text-[10px] font-medium ${isTotal ? 'text-purple-100 bg-purple-500/20' : 'text-purple-300'}`}>500-1k</th>
                              <th className={`px-2 py-2 text-right text-[10px] font-medium ${isTotal ? 'text-purple-100 bg-purple-500/20' : 'text-purple-300'}`}>1k-2k</th>
                              <th className={`px-2 py-2 text-right text-[10px] font-medium border-r border-white/10 ${isTotal ? 'text-purple-100 bg-purple-500/20' : 'text-purple-300'}`}>&gt;2k</th>
                            </Fragment>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((s) => (
                        <tr key={s.sellerId} className="border-b border-white/5 hover:bg-white/10 transition-colors group">
                          <td className="px-4 py-3 sticky left-0 bg-slate-900/80 backdrop-blur z-10 border-r border-white/10 group-hover:bg-slate-800/90 text-white text-sm">
                            <div className="font-medium leading-tight">{s.sellerBusinessName || '—'}</div>
                            <div className="text-purple-300/70 text-xs tabular-nums leading-tight mt-0.5">{s.sellerPhone || '—'}</div>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums font-bold text-white bg-purple-500/10 sticky left-[240px] backdrop-blur z-10 border-r border-white/10">
                            {s.total.total.toLocaleString()}
                          </td>
                          {months.map((m) => {
                            const c = s.months[m];
                            const has = c && c.total > 0;
                            return (
                              <Fragment key={m}>
                                <td className={`px-2 py-3 text-right tabular-nums ${has && c.s0_500 > 0 ? 'text-white' : 'text-white/25'}`}>
                                  {has && c.s0_500 > 0 ? c.s0_500.toLocaleString() : '—'}
                                </td>
                                <td className={`px-2 py-3 text-right tabular-nums ${has && c.s500_1000 > 0 ? 'text-purple-200' : 'text-white/25'}`}>
                                  {has && c.s500_1000 > 0 ? c.s500_1000.toLocaleString() : '—'}
                                </td>
                                <td className={`px-2 py-3 text-right tabular-nums ${has && c.s1000_2000 > 0 ? 'text-purple-200' : 'text-white/25'}`}>
                                  {has && c.s1000_2000 > 0 ? c.s1000_2000.toLocaleString() : '—'}
                                </td>
                                <td className={`px-2 py-3 text-right tabular-nums border-r border-white/10 ${has && c.s2000_plus > 0 ? 'text-purple-200' : 'text-white/25'}`}>
                                  {has && c.s2000_plus > 0 ? c.s2000_plus.toLocaleString() : '—'}
                                </td>
                              </Fragment>
                            );
                          })}
                          {/* Total slab columns */}
                          <td className="px-2 py-3 text-right tabular-nums font-semibold text-white bg-purple-500/10">
                            {s.total.s0_500 > 0 ? s.total.s0_500.toLocaleString() : '—'}
                          </td>
                          <td className="px-2 py-3 text-right tabular-nums font-semibold text-purple-100 bg-purple-500/10">
                            {s.total.s500_1000 > 0 ? s.total.s500_1000.toLocaleString() : '—'}
                          </td>
                          <td className="px-2 py-3 text-right tabular-nums font-semibold text-purple-100 bg-purple-500/10">
                            {s.total.s1000_2000 > 0 ? s.total.s1000_2000.toLocaleString() : '—'}
                          </td>
                          <td className="px-2 py-3 text-right tabular-nums font-semibold text-purple-100 bg-purple-500/10 border-r border-white/10">
                            {s.total.s2000_plus > 0 ? s.total.s2000_plus.toLocaleString() : '—'}
                          </td>
                        </tr>
                      ))}
                      {/* Grand totals row */}
                      <tr className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 border-t-2 border-purple-400/40 font-bold">
                        <td className="px-4 py-3 sticky left-0 bg-slate-900/95 backdrop-blur z-10 border-r border-white/10 text-white">
                          <div>Total</div>
                          <div className="text-white/60 text-xs font-normal">{filtered.length} seller{filtered.length === 1 ? '' : 's'}</div>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-white bg-purple-500/30 sticky left-[240px] backdrop-blur z-10 border-r border-white/10">
                          {slabData.totals.grand.total.toLocaleString()}
                        </td>
                        {months.map((m) => {
                          const c = slabData.totals.byMonth[m];
                          return (
                            <Fragment key={m}>
                              <td className="px-2 py-3 text-right tabular-nums text-white">{c?.s0_500 ? c.s0_500.toLocaleString() : '—'}</td>
                              <td className="px-2 py-3 text-right tabular-nums text-purple-100">{c?.s500_1000 ? c.s500_1000.toLocaleString() : '—'}</td>
                              <td className="px-2 py-3 text-right tabular-nums text-purple-100">{c?.s1000_2000 ? c.s1000_2000.toLocaleString() : '—'}</td>
                              <td className="px-2 py-3 text-right tabular-nums text-purple-100 border-r border-white/10">{c?.s2000_plus ? c.s2000_plus.toLocaleString() : '—'}</td>
                            </Fragment>
                          );
                        })}
                        <td className="px-2 py-3 text-right tabular-nums text-white bg-purple-500/30">{slabData.totals.grand.s0_500.toLocaleString()}</td>
                        <td className="px-2 py-3 text-right tabular-nums text-purple-50 bg-purple-500/30">{slabData.totals.grand.s500_1000.toLocaleString()}</td>
                        <td className="px-2 py-3 text-right tabular-nums text-purple-50 bg-purple-500/30">{slabData.totals.grand.s1000_2000.toLocaleString()}</td>
                        <td className="px-2 py-3 text-right tabular-nums text-purple-50 bg-purple-500/30 border-r border-white/10">{slabData.totals.grand.s2000_plus.toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
        </Fragment>
        )}

        {activeTab === 'geography' && (
          <div className="space-y-4">
          {/* Global sub-tab bar for the Geography tab */}
          <div className="inline-flex gap-1 p-1 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl">
            {([
              { k: 'geography', l: 'Geography' },
              { k: 'statewise', l: 'State wise' },
            ] as const).map(({ k, l }) => {
              const active = geographySubTab === k;
              return (
                <button
                  key={k}
                  onClick={() => setGeographySubTab(k)}
                  className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${
                    active
                      ? 'bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 text-white shadow-[0_0_24px_rgba(217,70,239,0.55),inset_0_0_18px_rgba(168,85,247,0.5)]'
                      : 'text-purple-200 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {l}
                </button>
              );
            })}
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25),inset_0_0_30px_rgba(168,85,247,0.12)]">
            <div className="px-8 py-6 border-b border-white/10 bg-white/5 flex items-center justify-between flex-wrap gap-4">
              {geographySubTab === 'statewise' ? (
                <div />
              ) : (
                <div>
                  <h2 className="text-2xl font-bold text-white">Geography</h2>
                  <p className="text-purple-300 text-sm mt-1">
                    {geoMode === 'state'
                      ? 'Delivered + Completed orders across Indian states — click any state to drill into its districts'
                      : `Delivered + Completed orders by district${districtSelectedState ? ` in ${districtSelectedState}` : ' across India'}`}
                  </p>
                </div>
              )}
              <div className="flex items-center gap-3 flex-wrap">
                {geographySubTab === 'geography' &&
                  (geoMode === 'state' ? queryBtn('geoState', 'Geography — by State') : queryBtn('geoDistrict', 'Geography — by District'))}
                {geographySubTab === 'geography' && (
                <>
                {/* State / District sub-tabs */}
                <div className="flex gap-1 p-1 bg-white/5 border border-white/10 rounded-xl">
                  {(['state', 'district'] as const).map((m) => {
                    const active = geoMode === m;
                    return (
                      <button
                        key={m}
                        onClick={() => setGeoMode(m)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          active
                            ? 'bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 text-white shadow-[0_0_18px_rgba(217,70,239,0.5)]'
                            : 'text-purple-200 hover:bg-white/10'
                        }`}
                      >
                        {m === 'state' ? 'State' : 'District'}
                      </button>
                    );
                  })}
                </div>
                {/* metric toggle */}
                <div className="flex gap-1 p-1 bg-white/5 border border-white/10 rounded-xl">
                  {(['count', 'amount'] as const).map((m) => {
                    const active = stateMetric === m;
                    return (
                      <button
                        key={m}
                        onClick={() => setStateMetric(m)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          active
                            ? 'bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 text-white shadow-[0_0_18px_rgba(217,70,239,0.5)]'
                            : 'text-purple-200 hover:bg-white/10'
                        }`}
                      >
                        {m === 'count' ? 'By orders' : 'By GMV'}
                      </button>
                    );
                  })}
                </div>
                <button
                  className={DOWNLOAD_BTN_CLASS}
                  disabled={geoMode === 'state' ? !stateData : !districtData}
                  onClick={() => {
                    if (geoMode === 'state') {
                      if (!stateData) return;
                      downloadCSV(
                        `geography-state-${currentYear}.csv`,
                        ['State', 'Order Count', 'GMV'],
                        stateData.map((r) => [r.state ?? '(no state)', r.count, r.amount])
                      );
                    } else {
                      if (!districtData) return;
                      const filename = districtSelectedState
                        ? `geography-district-${districtSelectedState}-${currentYear}.csv`
                        : `geography-district-${currentYear}.csv`;
                      downloadCSV(
                        filename,
                        ['State', 'District', 'Order Count', 'GMV'],
                        districtData.map((r) => [r.state ?? '(no state)', r.district ?? '(no district)', r.count, r.amount])
                      );
                    }
                  }}
                >
                  ↓ CSV
                </button>
                </>
                )}
              </div>
            </div>

            {/* Date filter */}
            <div className="px-8 py-3 border-b border-white/10 bg-white/5 flex items-center gap-3 flex-wrap">
              <span className="text-xs font-semibold text-purple-300 uppercase tracking-wide">Date</span>
              {([
                { key: 'all', label: `${currentYear} (full year)` },
                { key: '7d', label: 'Last 7 days' },
                { key: '14d', label: 'Last 14 days' },
                { key: '15d', label: 'Last 15 days' },
                { key: 'custom', label: 'Custom' },
              ] as const).map((opt) => {
                const active = stateRange === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setStateRange(opt.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      active
                        ? 'bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white shadow-[0_0_18px_rgba(217,70,239,0.4)]'
                        : 'bg-white/10 text-purple-200 hover:bg-white/15 border border-white/10'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
              <MonthMultiSelect selected={stateMonths} onChange={setStateMonths} year={currentYear} />
              {stateRange === 'custom' && (
                <div className="flex items-center gap-2 ml-2">
                  <input
                    type="date"
                    value={stateCustomFrom}
                    onChange={(e) => setStateCustomFrom(e.target.value)}
                    className="px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                  <span className="text-purple-300 text-xs">to</span>
                  <input
                    type="date"
                    value={stateCustomTo}
                    onChange={(e) => setStateCustomTo(e.target.value)}
                    className="px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                </div>
              )}
              {stateRange !== 'all' && (
                <button
                  onClick={() => {
                    setStateRange('all');
                    setStateCustomFrom('');
                    setStateCustomTo('');
                  }}
                  className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-rose-500/20 text-purple-200 hover:text-rose-200 border border-white/10 hover:border-rose-400/40 transition-all"
                >
                  ↺ Reset filter
                </button>
              )}
            </div>

            {/* Brand selector + activity card (multi-select; brands grouped by businessName prefix) */}
            <div className="px-8 py-3 border-b border-white/10 bg-white/5 flex items-center gap-3 flex-wrap relative">
              <span className="text-xs font-semibold text-purple-300 uppercase tracking-wide">Brand</span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setSellerDropdownOpen((v) => !v)}
                  className="min-w-[260px] px-3 py-1.5 text-xs bg-white/10 border border-white/20 rounded-lg text-white text-left flex items-center justify-between gap-2 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-purple-400"
                >
                  {(() => {
                    if (selectedBrandNames.length === 0) return <span className="text-purple-300">All brands (no filter)</span>;
                    if (selectedBrandNames.length === 1) return <span className="truncate">{selectedBrandNames[0]}</span>;
                    return <span className="font-semibold text-fuchsia-200">{selectedBrandNames.length} brands selected</span>;
                  })()}
                  <span className="text-purple-300 text-[10px]">▾</span>
                </button>
                {sellerDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 z-30 w-[460px] max-h-[460px] bg-slate-900 border border-white/15 rounded-lg shadow-2xl flex flex-col overflow-hidden">
                    <div className="p-2 border-b border-white/10 flex items-center gap-2">
                      <input
                        type="text"
                        autoFocus
                        value={sellerBrandSearch}
                        onChange={(e) => setSellerBrandSearch(e.target.value)}
                        placeholder="Search brand…"
                        className="flex-1 px-2 py-1.5 text-xs bg-white/10 border border-white/20 rounded text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400"
                      />
                      {selectedBrandNames.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedBrandNames([])}
                          className="px-2 py-1.5 text-[10px] font-semibold text-rose-200 hover:bg-rose-500/20 rounded border border-rose-400/30 whitespace-nowrap"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                    <div className="overflow-y-auto flex-1">
                      {sellerBrandList === null ? (
                        <div className="px-3 py-4 text-xs text-purple-300/60">Loading brands…</div>
                      ) : (() => {
                        const q = sellerBrandSearch.trim().toLowerCase();
                        const filtered = q
                          ? sellerBrandList.filter((b) =>
                              b.brandName.toLowerCase().includes(q) ||
                              b.sellerBusinessNames.some((n) => (n || '').toLowerCase().includes(q))
                            )
                          : sellerBrandList;
                        if (filtered.length === 0) {
                          return <div className="px-3 py-4 text-xs text-purple-300/60">No matches</div>;
                        }
                        return filtered.map((b) => {
                          const checked = selectedBrandNames.includes(b.brandName);
                          const multiSeller = b.sellerIds.length > 1;
                          return (
                            <label
                              key={b.brandName}
                              className={`flex items-center gap-2 px-3 py-2 border-b border-white/5 hover:bg-white/10 cursor-pointer ${checked ? 'bg-fuchsia-500/15' : ''}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setSelectedBrandNames((prev) =>
                                    prev.includes(b.brandName)
                                      ? prev.filter((n) => n !== b.brandName)
                                      : [...prev, b.brandName]
                                  );
                                }}
                                className="accent-fuchsia-500 w-3.5 h-3.5"
                              />
                              <div className="min-w-0 flex-1">
                                <div className={`text-xs font-semibold truncate ${checked ? 'text-fuchsia-200' : 'text-white'}`}>
                                  {b.brandName}
                                  {multiSeller && <span className="ml-1.5 text-[9px] text-purple-300/70 font-normal">({b.sellerIds.length} sellers)</span>}
                                </div>
                                <div className="text-[10px] text-purple-300/70 tabular-nums">
                                  {b.totalOrders.toLocaleString()} orders · {b.statesCovered} states · {b.districtsCovered} districts
                                </div>
                              </div>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${b.isActive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-500/30 text-slate-300'}`}>
                                {b.isActive ? 'ACTIVE' : 'IDLE'}
                              </span>
                            </label>
                          );
                        });
                      })()}
                    </div>
                    <div className="p-2 border-t border-white/10 flex items-center justify-between">
                      <span className="text-[10px] text-purple-300/70">
                        {selectedBrandNames.length === 0 ? 'none selected' : `${selectedBrandNames.length} selected`}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSellerDropdownOpen(false)}
                        className="px-3 py-1 text-[11px] font-semibold rounded bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {/* Activity card */}
              {sellerBrandList && selectedBrandNames.length > 0 && (() => {
                const selected = sellerBrandList.filter((b) => selectedBrandNames.includes(b.brandName));
                if (selected.length === 0) return null;
                const totalOrders = selected.reduce((s, b) => s + b.totalOrders, 0);
                const totalAmount = selected.reduce((s, b) => s + b.totalAmount, 0);
                const latestTs = selected.reduce<number | null>((acc, b) => {
                  if (!b.lastOrderAt) return acc;
                  const t = new Date(b.lastOrderAt).getTime();
                  return acc === null || t > acc ? t : acc;
                }, null);
                const daysAgo = latestTs !== null ? Math.floor((Date.now() - latestTs) / 86400000) : null;
                const isActive = daysAgo !== null && daysAgo <= 30;
                const lastLabel = latestTs !== null
                  ? new Date(latestTs).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                  : 'never';
                if (selected.length === 1) {
                  const b = selected[0];
                  return (
                    <div className="ml-auto flex items-center gap-3 flex-wrap text-xs">
                      <span className={`px-2 py-1 rounded-md font-bold ${b.isActive ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/30' : 'bg-rose-500/20 text-rose-200 border border-rose-400/30'}`}>
                        {b.isActive ? '● ACTIVE' : '○ INACTIVE'}
                      </span>
                      <div className="text-purple-200">
                        <span className="text-purple-300/70">Last order:</span> <span className="font-semibold text-white">{lastLabel}</span>
                        {b.daysSinceLastOrder !== null && <span className="text-purple-300/70"> ({b.daysSinceLastOrder}d ago)</span>}
                      </div>
                      <div className="text-purple-200">
                        <span className="text-purple-300/70">Orders:</span> <span className="font-semibold text-white tabular-nums">{b.totalOrders.toLocaleString()}</span>
                      </div>
                      <div className="text-purple-200">
                        <span className="text-purple-300/70">GMV:</span> <span className="font-semibold text-white tabular-nums">{formatAmount(b.totalAmount)}</span>
                      </div>
                      <div className="text-purple-200">
                        <span className="text-purple-300/70">Coverage:</span> <span className="font-semibold text-white tabular-nums">{b.statesCovered}</span> states · <span className="font-semibold text-white tabular-nums">{b.districtsCovered}</span> districts
                      </div>
                      {b.sellerIds.length > 1 && (
                        <div className="text-[10px] text-purple-300/70">{b.sellerIds.length} sellers merged</div>
                      )}
                    </div>
                  );
                }
                // Multi-brand aggregate
                return (
                  <div className="ml-auto flex items-center gap-3 flex-wrap text-xs">
                    <span className={`px-2 py-1 rounded-md font-bold ${isActive ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/30' : 'bg-rose-500/20 text-rose-200 border border-rose-400/30'}`}>
                      {isActive ? '● ACTIVE' : '○ INACTIVE'} ({selected.length} brands)
                    </span>
                    <div className="text-purple-200">
                      <span className="text-purple-300/70">Latest order:</span> <span className="font-semibold text-white">{lastLabel}</span>
                      {daysAgo !== null && <span className="text-purple-300/70"> ({daysAgo}d ago)</span>}
                    </div>
                    <div className="text-purple-200">
                      <span className="text-purple-300/70">Orders:</span> <span className="font-semibold text-white tabular-nums">{totalOrders.toLocaleString()}</span>
                    </div>
                    <div className="text-purple-200">
                      <span className="text-purple-300/70">GMV:</span> <span className="font-semibold text-white tabular-nums">{formatAmount(totalAmount)}</span>
                    </div>
                    <div className="text-[10px] text-purple-300/70 truncate max-w-[260px]" title={selected.map((b) => b.brandName).join(', ')}>
                      {selected.map((b) => b.brandName).join(', ')}
                    </div>
                  </div>
                );
              })()}
            </div>

            {geographySubTab === 'geography' && (
            <>
            {geoMode === 'district' && (
              <div className="px-8 py-3 border-b border-white/10 bg-white/5 flex items-center gap-3 flex-wrap">
                <span className="text-xs font-semibold text-purple-300 uppercase tracking-wide">State</span>
                <select
                  value={districtSelectedState || ''}
                  onChange={(e) => setDistrictSelectedState(e.target.value || null)}
                  className="px-3 py-1.5 text-xs bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-400 min-w-[220px]"
                >
                  <option value="">All India</option>
                  {(stateData ?? [])
                    .filter((r) => r.state)
                    .sort((a, b) => (a.state || '').localeCompare(b.state || ''))
                    .map((r) => (
                      <option key={r.state} value={r.state || ''}>
                        {r.state}
                      </option>
                    ))}
                </select>
                {districtSelectedState && (
                  <button
                    onClick={() => {
                      setGeoMode('state');
                      setDistrictSelectedState(null);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/15 text-purple-200 border border-white/10 transition-all"
                  >
                    ← Back to state view
                  </button>
                )}
              </div>
            )}

            <div className="p-6">
              {geoMode === 'state' ? (
                stateLoading || !stateData ? (
                  <div className="h-[640px] flex items-center justify-center text-purple-300">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 rounded-full border-2 border-fuchsia-500/30 border-t-fuchsia-500 animate-spin" />
                      Loading state data…
                    </div>
                  </div>
                ) : (
                  <IndiaStateMap
                    data={stateData}
                    metric={stateMetric}
                    onStateClick={handleStateMapClick}
                  />
                )
              ) : districtLoading || !districtData ? (
                <div className="h-[640px] flex items-center justify-center text-purple-300">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 rounded-full border-2 border-fuchsia-500/30 border-t-fuchsia-500 animate-spin" />
                    Loading district data…
                  </div>
                </div>
              ) : (
                <IndiaDistrictMap
                  data={districtData}
                  metric={stateMetric}
                  selectedState={districtSelectedState}
                />
              )}
            </div>

            {/* Brand × State breakdown table */}
            <div className="border-t border-white/10">
              <div className="px-8 py-4 border-b border-white/10 bg-white/5 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-base font-bold text-white">Brand × State breakdown</h3>
                  <p className="text-purple-300/70 text-xs mt-0.5">
                    Delivered + Completed orders by brand and buyer state
                    {brandStateData && ` · ${brandStateData.length.toLocaleString()} (brand, state) cells`}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {queryBtn('brandState', 'Brand × State breakdown')}
                  <input
                    type="text"
                    value={brandStateSearch}
                    onChange={(e) => setBrandStateSearch(e.target.value)}
                    placeholder="Search brand or state…"
                    className="px-3 py-1.5 text-xs bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400 min-w-[240px]"
                  />
                  {brandStateData && brandStateData.length > 0 && (
                    <button
                      className={DOWNLOAD_BTN_CLASS}
                      onClick={() => {
                        const rows: CsvCell[][] = (brandStateData || []).map((r) => [
                          r.brandName, r.state ?? '(no state)', r.count, r.amount, r.districtsCovered,
                        ]);
                        const suffix = (() => {
                          const { startDate, endDate } = resolveStateRange();
                          if (startDate && endDate) return `${startDate}_${endDate}`;
                          return String(currentYear);
                        })();
                        downloadCSV(
                          `geography-brand-state-${suffix}.csv`,
                          ['Brand', 'State', 'Orders', 'GMV', 'Districts Covered'],
                          rows
                        );
                      }}
                    >
                      ↓ CSV
                    </button>
                  )}
                </div>
              </div>
              <div className="overflow-auto max-h-[560px]">
                {brandStateLoading || !brandStateData ? (
                  <div className="px-8 py-12 text-center text-purple-300">Loading…</div>
                ) : brandStateData.length === 0 ? (
                  <div className="px-8 py-12 text-center text-purple-300">No delivered/completed orders in this slice</div>
                ) : (() => {
                  const q = brandStateSearch.trim().toLowerCase();
                  const filtered = q
                    ? brandStateData.filter((r) =>
                        r.brandName.toLowerCase().includes(q) ||
                        (r.state || '').toLowerCase().includes(q)
                      )
                    : brandStateData;
                  const sorted = [...filtered].sort((a, b) => {
                    if (brandStateSort === 'count')  return b.count  - a.count;
                    if (brandStateSort === 'amount') return b.amount - a.amount;
                    if (brandStateSort === 'brand')  return a.brandName.localeCompare(b.brandName);
                    if (brandStateSort === 'state')  return (a.state || '').localeCompare(b.state || '');
                    return 0;
                  });
                  if (sorted.length === 0) {
                    return <div className="px-8 py-12 text-center text-purple-300">No matches</div>;
                  }
                  const filteredCount  = filtered.reduce((s, r) => s + r.count,  0);
                  const filteredAmount = filtered.reduce((s, r) => s + r.amount, 0);
                  const sortIndicator = (col: typeof brandStateSort) => brandStateSort === col ? ' ↓' : '';
                  return (
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-white/10">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-purple-200 uppercase tracking-wider w-12">#</th>
                          <th
                            onClick={() => setBrandStateSort('brand')}
                            className="px-4 py-2.5 text-left text-[11px] font-semibold text-purple-200 uppercase tracking-wider cursor-pointer hover:text-white"
                          >
                            Brand{sortIndicator('brand')}
                          </th>
                          <th
                            onClick={() => setBrandStateSort('state')}
                            className="px-4 py-2.5 text-left text-[11px] font-semibold text-purple-200 uppercase tracking-wider cursor-pointer hover:text-white"
                          >
                            State{sortIndicator('state')}
                          </th>
                          <th
                            onClick={() => setBrandStateSort('count')}
                            className="px-4 py-2.5 text-right text-[11px] font-semibold text-purple-200 uppercase tracking-wider cursor-pointer hover:text-white"
                          >
                            Orders{sortIndicator('count')}
                          </th>
                          <th
                            onClick={() => setBrandStateSort('amount')}
                            className="px-4 py-2.5 text-right text-[11px] font-semibold text-purple-200 uppercase tracking-wider cursor-pointer hover:text-white"
                          >
                            GMV{sortIndicator('amount')}
                          </th>
                          <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-purple-200 uppercase tracking-wider">Districts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map((r, i) => (
                          <tr key={`${r.brandName}__${r.state ?? '_'}`} className="border-b border-white/5 hover:bg-white/5">
                            <td className="px-4 py-2.5 text-purple-300/60 tabular-nums">{i + 1}</td>
                            <td className="px-4 py-2.5 text-white font-medium whitespace-nowrap">{r.brandName}</td>
                            <td className="px-4 py-2.5 text-purple-100 whitespace-nowrap">{r.state || <span className="italic text-purple-400/60">(no state)</span>}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-white font-semibold">{r.count.toLocaleString('en-IN')}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-emerald-200">{formatAmount(r.amount)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-purple-200">{r.districtsCovered}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="sticky bottom-0 bg-slate-900/95 backdrop-blur border-t border-white/10">
                        <tr>
                          <td className="px-4 py-2.5" />
                          <td className="px-4 py-2.5 text-purple-200 font-bold uppercase text-[11px] tracking-wider">Filtered total</td>
                          <td className="px-4 py-2.5 text-purple-300/70 text-xs">{filtered.length} cells</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-white font-bold">{filteredCount.toLocaleString('en-IN')}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-emerald-300 font-bold">{formatAmount(filteredAmount)}</td>
                          <td className="px-4 py-2.5" />
                        </tr>
                      </tfoot>
                    </table>
                  );
                })()}
              </div>
            </div>
            </>
            )}

            {geographySubTab === 'statewise' && (() => {
              type SKey = 'punched' | 'delivered' | 'rejected' | 'cancelled' | 'pending' | 'inprogress' | 'dispatched' | 'inflight';
              const STATUS_COLS: { key: SKey; label: string; short: string; hex: string; isPunched?: boolean }[] = [
                { key: 'punched',    label: 'Punched',     short: 'Pun', hex: '#e9d5ff', isPunched: true },
                { key: 'pending',    label: 'Pending',     short: 'Pen', hex: '#94a3b8' },
                { key: 'inprogress', label: 'In-progress', short: 'Inp', hex: '#a78bfa' },
                { key: 'dispatched', label: 'Dispatched',  short: 'Dis', hex: '#22d3ee' },
                { key: 'delivered',  label: 'Delivered',   short: 'Del', hex: '#34d399' },
                { key: 'rejected',   label: 'Rejected',    short: 'Rej', hex: '#fb7185' },
                { key: 'cancelled',  label: 'Cancelled',   short: 'Can', hex: '#fbbf24' },
              ];
              const pct = (n: number, base: number) => (base > 0 ? (n / base) * 100 : 0);
              const fmtPct = (p: number) => `${p.toFixed(1)}%`;
              const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
              const monthLabel = (ym: string) => {
                const [y, m] = ym.split('-');
                return `${MON[parseInt(m, 10) - 1]} '${y.slice(2)}`;
              };

              if (stateMonthLoading || !stateMonthData) {
                return (
                  <div className="h-[420px] flex items-center justify-center text-purple-300">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 rounded-full border-2 border-fuchsia-500/30 border-t-fuchsia-500 animate-spin" />
                      Loading state × month breakdown…
                    </div>
                  </div>
                );
              }
              if (stateMonthData.length === 0) {
                return <div className="px-8 py-16 text-center text-purple-300">No orders in this slice</div>;
              }

              const emptyB = (): Record<SKey, StatusBucket> => ({
                punched: { count: 0, amount: 0 }, delivered: { count: 0, amount: 0 },
                rejected: { count: 0, amount: 0 }, cancelled: { count: 0, amount: 0 },
                pending: { count: 0, amount: 0 }, inprogress: { count: 0, amount: 0 },
                dispatched: { count: 0, amount: 0 }, inflight: { count: 0, amount: 0 },
              });
              const addB = (acc: Record<SKey, StatusBucket>, r: Record<SKey, StatusBucket>) => {
                for (const c of STATUS_COLS) { acc[c.key].count += r[c.key].count; acc[c.key].amount += r[c.key].amount; }
              };

              // Pivot rows: one per state, holding a grand total + per-month buckets.
              const sm = new Map<string, { state: string | null; total: Record<SKey, StatusBucket>; byMonth: Record<string, Record<SKey, StatusBucket>> }>();
              for (const r of stateMonthData) {
                const key = r.state ?? '__none__';
                let e = sm.get(key);
                if (!e) { e = { state: r.state, total: emptyB(), byMonth: {} }; sm.set(key, e); }
                addB(e.total, r);
                if (!e.byMonth[r.ym]) e.byMonth[r.ym] = emptyB();
                addB(e.byMonth[r.ym], r);
              }

              const q = stateMonthSearch.trim().toLowerCase();
              let rows = [...sm.values()];
              if (q) rows = rows.filter((e) => (e.state || '').toLowerCase().includes(q));
              rows.sort((a, b) => b.total.punched.count - a.total.punched.count);

              const months = stateMonthMonths;
              const groups: { ym: string; label: string }[] = [
                { ym: '__total__', label: 'Total' },
                ...months.map((m) => ({ ym: m, label: monthLabel(m) })),
              ];

              // Footer + hero totals.
              const grand = emptyB();
              for (const e of rows) addB(grand, e.total);
              const grandByMonth: Record<string, Record<SKey, StatusBucket>> = {};
              for (const m of months) grandByMonth[m] = emptyB();
              for (const e of rows) for (const m of months) if (e.byMonth[m]) addB(grandByMonth[m], e.byMonth[m]);

              const bucketsFor = (e: { total: Record<SKey, StatusBucket>; byMonth: Record<string, Record<SKey, StatusBucket>> }, ym: string) =>
                ym === '__total__' ? e.total : e.byMonth[ym];
              const grandBuckets = (ym: string) => (ym === '__total__' ? grand : grandByMonth[ym]);

              // A compact pivot cell: count (colored) · ₹value · % of that cell's punched.
              // Clickable when it has data — opens the order-list drill for (state, month, bucket).
              const Cell = (b: Record<SKey, StatusBucket> | undefined, col: typeof STATUS_COLS[number], gi: number, ci: number, stateName: string | null, ym: string) => {
                const bucket = b?.[col.key];
                const base = b?.punched.count ?? 0;
                const groupBg = gi === 0 ? 'bg-fuchsia-500/[0.06]' : gi % 2 === 1 ? 'bg-white/[0.022]' : '';
                const leftBorder = ci === 0 ? 'border-l-2 border-white/15' : 'border-l border-white/[0.04]';
                const clickable = !!bucket && bucket.count > 0;
                return (
                  <td
                    className={`px-2.5 py-2 text-right align-middle ${leftBorder} ${groupBg} ${clickable ? 'cursor-pointer hover:bg-fuchsia-500/20 hover:ring-1 hover:ring-inset hover:ring-fuchsia-400/40 transition-colors' : ''}`}
                    style={{ minWidth: 62 }}
                    onClick={clickable ? () => openStateMonthDrill(stateName, ym, col.key) : undefined}
                    title={clickable ? `View ${col.label} orders — ${stateName ?? 'All states'}${ym === '__total__' ? '' : ', ' + ym}` : undefined}
                  >
                    {!bucket || bucket.count === 0 ? (
                      <span className="text-purple-300/20">·</span>
                    ) : (
                      <>
                        <div className="tabular-nums font-bold text-[13px] leading-tight" style={{ color: col.hex }}>
                          {bucket.count.toLocaleString('en-IN')}
                        </div>
                        <div className="text-[10px] text-purple-300/50 tabular-nums leading-tight">{formatAmount(bucket.amount)}</div>
                        {!col.isPunched && (
                          <div className="text-[10px] font-semibold tabular-nums leading-tight" style={{ color: col.hex }}>{fmtPct(pct(bucket.count, base))}</div>
                        )}
                      </>
                    )}
                  </td>
                );
              };

              return (
                <div>
                  {/* Hero funnel strip — overall picture across the whole period */}
                  <div className="px-8 pt-6 pb-2 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <div className="text-[11px] font-semibold text-purple-300/70 uppercase tracking-wider">Punched</div>
                      <div className="mt-1 text-2xl font-extrabold text-white tabular-nums">{grand.punched.count.toLocaleString('en-IN')}</div>
                      <div className="text-[11px] text-purple-300/60 tabular-nums">{formatAmount(grand.punched.amount)}</div>
                    </div>
                    {STATUS_COLS.filter((c) => !c.isPunched).map((m) => {
                      const p = pct(grand[m.key].count, grand.punched.count);
                      return (
                        <div key={m.key} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 relative overflow-hidden">
                          <div className="absolute inset-x-0 bottom-0 h-1" style={{ width: `${Math.min(p, 100)}%`, background: m.hex, opacity: 0.85 }} />
                          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: m.hex }}>{m.label}</div>
                          <div className="mt-1 flex items-baseline gap-2">
                            <span className="text-2xl font-extrabold text-white tabular-nums">{fmtPct(p)}</span>
                            <span className="text-xs text-purple-300/70 tabular-nums">{grand[m.key].count.toLocaleString('en-IN')}</span>
                          </div>
                          <div className="text-[11px] text-purple-300/60 tabular-nums">{formatAmount(grand[m.key].amount)}</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Table header bar */}
                  <div className="px-8 py-4 flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <h3 className="text-base font-bold text-white">State × month × order-status</h3>
                      <p className="text-purple-300/70 text-xs mt-0.5">
                        Each month splits into status sub-columns — count · ₹GMV · % of that month&apos;s punched · {rows.length.toLocaleString('en-IN')} states · {months.length} months
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      {queryBtn('stateMonth', 'State × month × order-status')}
                      <input
                        type="text"
                        value={stateMonthSearch}
                        onChange={(e) => setStateMonthSearch(e.target.value)}
                        placeholder="Search state…"
                        className="px-3 py-1.5 text-xs bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400 min-w-[200px]"
                      />
                      <button
                        className={DOWNLOAD_BTN_CLASS}
                        onClick={() => {
                          const header = ['State', 'Month', ...STATUS_COLS.flatMap((c) => [`${c.label} #`, `${c.label} GMV`, `${c.label} %`])];
                          const csvRows: CsvCell[][] = [];
                          for (const e of rows) {
                            for (const g of groups) {
                              const b = bucketsFor(e, g.ym);
                              if (!b || b.punched.count === 0) continue;
                              csvRows.push([
                                e.state ?? '(no state)', g.label,
                                ...STATUS_COLS.flatMap((c) => [b[c.key].count, b[c.key].amount.toFixed(0), c.isPunched ? '' : pct(b[c.key].count, b.punched.count).toFixed(1)]),
                              ]);
                            }
                          }
                          downloadCSV(`geography-statewise-month-${currentYear}.csv`, header, csvRows);
                        }}
                      >
                        ↓ CSV
                      </button>
                    </div>
                  </div>

                  {/* Pivot table — rows = states, column groups = months, sub-cols = status */}
                  <div className="overflow-auto max-h-[680px] border-t border-white/10">
                    <table className="text-sm border-separate border-spacing-0">
                      <thead>
                        {/* Row 1 — month groups */}
                        <tr>
                          <th
                            rowSpan={2}
                            className="sticky left-0 top-0 z-30 px-4 py-2 text-left text-[11px] font-semibold text-purple-200 uppercase tracking-wider border-b border-r border-white/10 align-bottom"
                            style={{ backgroundColor: '#1b1340' }}
                          >
                            State
                          </th>
                          {groups.map((g, gi) => (
                            <th
                              key={g.ym}
                              colSpan={STATUS_COLS.length}
                              className={`sticky top-0 z-20 h-8 px-2 text-center text-[11px] font-bold uppercase tracking-wider border-b border-l-2 border-white/15 ${gi === 0 ? 'text-fuchsia-200' : 'text-purple-100'}`}
                              style={{ backgroundColor: '#1b1340' }}
                            >
                              {g.label}
                            </th>
                          ))}
                        </tr>
                        {/* Row 2 — status sub-columns under each month */}
                        <tr>
                          {groups.map((g, gi) =>
                            STATUS_COLS.map((c, ci) => (
                              <th
                                key={`${g.ym}_${c.key}`}
                                title={c.label}
                                className={`sticky top-8 z-20 px-2.5 py-2 text-right text-[10px] font-bold uppercase tracking-wide border-b border-white/10 ${ci === 0 ? 'border-l-2 border-white/15' : 'border-l border-white/[0.04]'}`}
                                style={{ color: c.hex, minWidth: 62, backgroundColor: '#1b1340' }}
                              >
                                {c.short}
                              </th>
                            ))
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((e, i) => (
                          <tr key={e.state ?? `_${i}`} className="hover:bg-white/[0.04] transition-colors group/row">
                            <td className="sticky left-0 z-10 bg-[#1b1340] px-4 py-2 text-white font-semibold whitespace-nowrap align-middle border-b border-r border-white/10 group-hover/row:bg-[#2a1d52]">
                              <span className="text-purple-300/40 tabular-nums text-[11px] mr-2">{i + 1}</span>
                              {e.state || <span className="italic text-purple-400/60">(no state)</span>}
                            </td>
                            {groups.map((g, gi) => {
                              const b = bucketsFor(e, g.ym);
                              return STATUS_COLS.map((c, ci) => (
                                <Fragment key={`${g.ym}_${c.key}`}>{Cell(b, c, gi, ci, e.state, g.ym)}</Fragment>
                              ));
                            })}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td className="sticky left-0 bottom-0 z-20 bg-[#1b1340] px-4 py-2.5 text-purple-200 font-bold uppercase text-[11px] tracking-wider whitespace-nowrap border-t border-r border-white/10">
                            All states
                          </td>
                          {groups.map((g, gi) => {
                            const b = grandBuckets(g.ym);
                            return STATUS_COLS.map((c, ci) => {
                              const bucket = b?.[c.key];
                              const base = b?.punched.count ?? 0;
                              const groupBg = 'bg-[#1b1340]';
                              const leftBorder = ci === 0 ? 'border-l-2 border-white/15' : 'border-l border-white/[0.04]';
                              const clickable = !!bucket && bucket.count > 0;
                              return (
                                <td
                                  key={`${g.ym}_${c.key}`}
                                  className={`sticky bottom-0 z-10 px-2.5 py-2.5 text-right align-middle border-t border-white/10 ${leftBorder} ${groupBg} ${clickable ? 'cursor-pointer hover:bg-fuchsia-500/20 hover:ring-1 hover:ring-inset hover:ring-fuchsia-400/40 transition-colors' : ''}`}
                                  onClick={clickable ? () => openStateMonthDrill(null, g.ym, c.key) : undefined}
                                  title={clickable ? `View ${c.label} orders — All states${g.ym === '__total__' ? '' : ', ' + g.ym}` : undefined}
                                >
                                  {!bucket || bucket.count === 0 ? (
                                    <span className="text-purple-300/20">·</span>
                                  ) : (
                                    <>
                                      <div className="tabular-nums font-extrabold text-[13px] leading-tight" style={{ color: c.hex }}>{bucket.count.toLocaleString('en-IN')}</div>
                                      <div className="text-[10px] text-purple-300/55 tabular-nums leading-tight">{formatAmount(bucket.amount)}</div>
                                      {!c.isPunched && <div className="text-[10px] font-bold tabular-nums leading-tight" style={{ color: c.hex }}>{fmtPct(pct(bucket.count, base))}</div>}
                                    </>
                                  )}
                                </td>
                              );
                            });
                          })}
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Legend */}
                  <div className="px-8 py-3 flex items-center gap-4 flex-wrap text-[11px] text-purple-300/70 border-t border-white/10">
                    <span className="font-semibold uppercase tracking-wider text-purple-300/50">Status</span>
                    {STATUS_COLS.map((c) => (
                      <span key={c.key} className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: c.hex }} />
                        <span style={{ color: c.hex }} className="font-semibold">{c.short}</span>
                        <span>{c.label}</span>
                      </span>
                    ))}
                    <span className="ml-auto text-purple-300/45">Each cell: count · ₹GMV · % of month&apos;s punched</span>
                  </div>
                </div>
              );
            })()}
          </div>
          </div>
        )}

        {activeTab === 'zone' && (() => {
          const ZONE_COLOR: Record<string, string> = {
            A: '#10b981', B: '#22d3ee', C1: '#a78bfa', C2: '#8b5cf6',
            D1: '#f59e0b', D2: '#fb923c', E: '#f43f5e', F: '#ec4899',
          };
          const colorOf = (z: string) => ZONE_COLOR[z] || '#a855f7';
          const range = resolveZoneRange();
          return (
          <div className="space-y-6">
          {/* Sub-tab nav + range selector on one horizontal line */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-3 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="inline-flex gap-1 p-1 bg-white/5 border border-white/10 rounded-xl">
                {([
                  { k: 'trend', l: 'Trend' },
                  { k: 'table', l: 'Table' },
                ] as const).map(({ k, l }) => {
                  const active = zoneSubTab === k;
                  return (
                    <button
                      key={k}
                      onClick={() => setZoneSubTab(k)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${active ? 'bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white shadow-[0_0_20px_rgba(217,70,239,0.5)]' : 'text-purple-200 hover:bg-white/10 hover:text-white'}`}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>
              <div className="text-[11px] text-purple-300/80 tabular-nums hidden md:block">
                {range.startDate} → {range.endDate}
                {zonePivot && <span className="ml-2 text-white/80">· {zonePivot.grand.count.toLocaleString('en-IN')} POs</span>}
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {zoneSubTab === 'trend' && queryBtn('zone', 'Zone Wise · Delhivery')}
              <div className="inline-flex gap-1 p-1 bg-white/5 border border-white/10 rounded-xl">
                {([
                  { k: 'today', l: 'Today' },
                  { k: '7d',    l: 'Last 7 days' },
                  { k: '15d',   l: 'Last 15 days' },
                  { k: '30d',   l: 'Last 30 days' },
                  { k: 'custom',l: 'Custom' },
                ] as const).map(({ k, l }) => {
                  const active = zoneRange === k;
                  return (
                    <button
                      key={k}
                      onClick={() => setZoneRange(k)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${active ? 'bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white shadow-[0_0_20px_rgba(217,70,239,0.5)]' : 'text-purple-200 hover:bg-white/10 hover:text-white'}`}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>
              {zoneRange === 'custom' && (
                <div className="flex items-center gap-2 text-xs">
                  <input type="date" value={zoneFrom} onChange={(e) => setZoneFrom(e.target.value)} className="px-2 py-1.5 bg-white/10 border border-white/20 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-purple-400" />
                  <span className="text-purple-300/60">→</span>
                  <input type="date" value={zoneTo} onChange={(e) => setZoneTo(e.target.value)} className="px-2 py-1.5 bg-white/10 border border-white/20 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
              )}
              <MonthMultiSelect selected={zoneMonths} onChange={setZoneMonths} year={currentYear} />
              <button
                onClick={() => setCommercialOpen(true)}
                className="group relative inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-amber-500 via-pink-500 to-fuchsia-500 shadow-[0_0_24px_rgba(236,72,153,0.45)] hover:shadow-[0_0_32px_rgba(236,72,153,0.7)] hover:scale-[1.03] transition-all"
                title="View Badho logistics commercials (PDF)"
              >
                <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-white/20 via-transparent to-white/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="9" y1="13" x2="15" y2="13" />
                  <line x1="9" y1="17" x2="13" y2="17" />
                </svg>
                <span className="tracking-wide">See commercial</span>
              </button>
            </div>
          </div>

          {zoneSubTab === 'trend' && (<>
          {/* Row 1: donut + bar (% share) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 bg-white/5">
              <h2 className="text-base font-bold text-white">Zone share · pie</h2>
              <p className="text-purple-300 text-xs mt-0.5">Share of total Delhivery POs</p>
            </div>
            <div className="p-4" style={{ height: 320 }}>
              {zonePivotLoading || !zonePivot || zonePivot.zones.length === 0 || zonePivot.grand.count === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-purple-300">{zonePivotLoading ? 'Loading…' : 'No data'}</div>
              ) : (() => {
                const data = zonePivot.zones.map((z) => ({ name: z, value: zonePivot.zoneTotals[z]?.count || 0 }));
                return (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={0}
                        outerRadius={100}
                        paddingAngle={1}
                        stroke="rgba(15,23,42,0.6)"
                        strokeWidth={1}
                        isAnimationActive={false}
                        cursor="pointer"
                        onClick={(d: any) => openZoneDrill(d?.name ?? d?.payload?.name)}
                        labelLine={(props: any) => {
                          const pct = (props.value / zonePivot.grand.count) * 100;
                          if (pct < 2) return <g />;
                          const { points, stroke } = props;
                          if (!points || points.length < 2) return <g />;
                          return <polyline points={points.map((p: any) => `${p.x},${p.y}`).join(' ')} stroke={stroke} strokeWidth={1} fill="none" />;
                        }}
                        label={(props: any) => {
                          const pct = (props.value / zonePivot.grand.count) * 100;
                          if (pct < 2) return <g />;
                          const { x, y, textAnchor, name } = props;
                          return (
                            <text x={x} y={y} textAnchor={textAnchor} dominantBaseline="middle" style={{ fill: '#fdf4ff', fontSize: 11, fontWeight: 700, paintOrder: 'stroke', stroke: '#0f172a', strokeWidth: 3, strokeLinejoin: 'round' }}>
                              Zone {name} · {pct.toFixed(1)}%
                            </text>
                          );
                        }}
                      >
                        {data.map((d) => <Cell key={d.name} fill={colorOf(d.name)} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(217,70,239,0.4)', borderRadius: 10, color: '#fff', fontSize: 12 }}
                        formatter={(v: any, _n: any, p: any) => [`${Number(v).toLocaleString('en-IN')} POs · ${((Number(v) / zonePivot.grand.count) * 100).toFixed(1)}%`, `Zone ${p.payload.name}`]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, color: '#e9d5ff' }} formatter={(v) => `Zone ${v}`} />
                    </PieChart>
                  </ResponsiveContainer>
                );
              })()}
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 bg-white/5">
              <h2 className="text-base font-bold text-white">Zone share · bar</h2>
              <p className="text-purple-300 text-xs mt-0.5">% of POs per zone with PO counts inside the bar</p>
            </div>
            <div className="p-4" style={{ height: 320 }}>
              {zonePivotLoading || !zonePivot || zonePivot.zones.length === 0 || zonePivot.grand.count === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-purple-300">{zonePivotLoading ? 'Loading…' : 'No data'}</div>
              ) : (() => {
                const data = zonePivot.zones.map((z) => ({
                  zone: z,
                  count: zonePivot.zoneTotals[z]?.count || 0,
                  pct: ((zonePivot.zoneTotals[z]?.count || 0) / zonePivot.grand.count) * 100,
                }));
                return (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 24, right: 16, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="zone" tick={{ fill: 'rgba(216,180,254,0.8)', fontSize: 12, fontWeight: 600 }} />
                      <YAxis tick={{ fill: 'rgba(216,180,254,0.7)', fontSize: 11 }} tickFormatter={(v: number) => `${Math.round(v)}%`} domain={[0, (dataMax: number) => Math.ceil(dataMax / 10) * 10]} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(217,70,239,0.4)', borderRadius: 10, color: '#fff', fontSize: 12 }}
                        labelStyle={{ color: '#f0abfc', fontWeight: 700 }}
                        formatter={(_v: any, _n: any, p: any) => [`${p.payload.count.toLocaleString('en-IN')} POs · ${p.payload.pct.toFixed(1)}%`, `Zone ${p.payload.zone}`]}
                      />
                      <Bar dataKey="pct" radius={[6, 6, 0, 0]} maxBarSize={64} cursor="pointer" onClick={(e: any) => openZoneDrill(e?.payload?.zone ?? e?.zone)}>
                        {data.map((d) => (
                          <Cell key={d.zone} fill={colorOf(d.zone)} />
                        ))}
                        <LabelList
                          dataKey="pct"
                          position="top"
                          offset={6}
                          formatter={(v: unknown) => `${Number(v).toFixed(1)}%`}
                          style={{ fill: '#fdf4ff', fontSize: 11, fontWeight: 700, paintOrder: 'stroke', stroke: '#0f172a', strokeWidth: 3, strokeLinejoin: 'round' }}
                        />
                        <LabelList
                          dataKey="count"
                          position="center"
                          formatter={(v: unknown) => Number(v).toLocaleString('en-IN')}
                          style={{ fill: '#ffffff', fontSize: 11, fontWeight: 800, paintOrder: 'stroke', stroke: '#0f172a', strokeWidth: 3, strokeLinejoin: 'round' }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                );
              })()}
            </div>
          </div>
          </div>

          {/* Row 2: weight profile per zone (avg / mode / median) */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 bg-white/5">
              <h2 className="text-base font-bold text-white">Weight profile by zone</h2>
              <p className="text-purple-300 text-xs mt-0.5">Average, mode, and median charged weight (kg) per Delhivery zone</p>
            </div>
            <div className="p-4" style={{ height: 340 }}>
              {zonePivotLoading || !zonePivot || zonePivot.zones.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-purple-300">{zonePivotLoading ? 'Loading…' : 'No data'}</div>
              ) : (() => {
                const data = zonePivot.zones.map((z) => {
                  const zt = zonePivot.zoneTotals[z];
                  return {
                    zone: z,
                    avg: zt?.avgKg ?? 0,
                    mode: zt?.modeKg ?? 0,
                    median: zt?.medianKg ?? 0,
                    count: zt?.count ?? 0,
                  };
                });
                const fmt = (v: number) => v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
                return (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 24, right: 16, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="zone" tick={{ fill: 'rgba(216,180,254,0.8)', fontSize: 12, fontWeight: 600 }} />
                      <YAxis tick={{ fill: 'rgba(216,180,254,0.7)', fontSize: 11 }} tickFormatter={(v: number) => `${fmt(v)}`} />
                      <Tooltip
                        contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(217,70,239,0.4)', borderRadius: 10, color: '#fff', fontSize: 12 }}
                        labelFormatter={(label) => `Zone ${label}`}
                        formatter={(v: any, n: any) => [`${fmt(Number(v))} kg`, n]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, color: '#e9d5ff' }} />
                      <Bar dataKey="avg" name="Average" fill="#a78bfa" radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="avg" position="top" offset={4} formatter={(v: unknown) => fmt(Number(v))} style={{ fill: '#ddd6fe', fontSize: 9, fontWeight: 700, paintOrder: 'stroke', stroke: '#0f172a', strokeWidth: 2, strokeLinejoin: 'round' }} />
                      </Bar>
                      <Bar dataKey="mode" name="Mode" fill="#10b981" radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="mode" position="top" offset={4} formatter={(v: unknown) => fmt(Number(v))} style={{ fill: '#a7f3d0', fontSize: 9, fontWeight: 700, paintOrder: 'stroke', stroke: '#0f172a', strokeWidth: 2, strokeLinejoin: 'round' }} />
                      </Bar>
                      <Bar dataKey="median" name="Median" fill="#22d3ee" radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="median" position="top" offset={4} formatter={(v: unknown) => fmt(Number(v))} style={{ fill: '#a5f3fc', fontSize: 9, fontWeight: 700, paintOrder: 'stroke', stroke: '#0f172a', strokeWidth: 2, strokeLinejoin: 'round' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                );
              })()}
            </div>
          </div>
          </>)}

          {zoneSubTab === 'table' && (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-8 py-6 border-b border-white/10 bg-white/5 flex items-center justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-2xl font-bold text-white">Zone Wise · Delhivery</h2>
                <p className="text-purple-300 text-sm mt-1">Seller × zone × delivery status · count and modal charged weight (kg)</p>
              </div>
              {queryBtn('zone', 'Zone Wise · Delhivery')}
              {zonePivot && (
                <div className="px-3 py-2 rounded-xl bg-slate-900/70 border border-white/10">
                  <div className="text-purple-300/70 uppercase tracking-wide text-[10px]">Grand total</div>
                  <div className="text-white font-bold mt-0.5 tabular-nums">{zonePivot.grand.count.toLocaleString('en-IN')} POs · mode {zonePivot.grand.modeKg.toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg</div>
                </div>
              )}
            </div>
            <div className="p-4">
              {zonePivotLoading ? (
                <div className="py-16 text-center text-purple-300">Loading zone pivot…</div>
              ) : !zonePivot || zonePivot.sellers.length === 0 ? (
                <div className="py-16 text-center text-purple-300">No Delhivery orders with zone data in this window.</div>
              ) : (() => {
                const fmtKg = (kg: number) => kg.toLocaleString('en-IN', { maximumFractionDigits: 2 });
                const toggleZone = (z: string) => setExpandedZones((prev) => { const n = new Set(prev); if (n.has(z)) n.delete(z); else n.add(z); return n; });
                const isExpanded = (z: string) => expandedZones.has(z);
                const zoneRollup = (seller: string, zone: string): ZoneCell =>
                  zonePivot.sellerZoneRollup?.[seller]?.[zone] || { count: 0, modeKg: 0 };
                const zoneStatusTotal = (zone: string, st: string): ZoneCell =>
                  zonePivot.zoneStatusRollup?.[zone]?.[st] || { count: 0, modeKg: 0 };
                return (
                  <>
                    <div className="flex items-center gap-3 mb-3 text-[11px] text-purple-300/80">
                      <span>Click any zone header to expand its delivery-status breakdown. Click any count cell to drill into its orders.</span>
                      {expandedZones.size > 0 && (
                        <button
                          onClick={() => setExpandedZones(new Set())}
                          className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white/80 text-[10px] font-semibold transition-colors"
                        >
                          Collapse all
                        </button>
                      )}
                      {expandedZones.size < zonePivot.zones.length && (
                        <button
                          onClick={() => setExpandedZones(new Set(zonePivot.zones))}
                          className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white/80 text-[10px] font-semibold transition-colors"
                        >
                          Expand all
                        </button>
                      )}
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-white/10">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0">
                          <tr className="border-b border-white/15 bg-slate-900/90 backdrop-blur">
                            <th rowSpan={2} className="px-4 py-3 text-left font-semibold text-white/80 sticky left-0 bg-slate-900/95 backdrop-blur z-20 border-r border-white/15 min-w-[220px]">
                              Seller
                            </th>
                            {zonePivot.zones.map((zone) => {
                              const open = isExpanded(zone);
                              const span = open ? zonePivot.statuses.length : 1;
                              const ztot = zonePivot.zoneTotals[zone] || { count: 0, modeKg: 0 };
                              return (
                                <th
                                  key={zone}
                                  colSpan={span}
                                  className={`px-2 py-2 text-center font-bold border-r border-white/15 cursor-pointer select-none transition-colors ${open ? 'bg-fuchsia-500/20 text-white hover:bg-fuchsia-500/30' : 'bg-gradient-to-b from-fuchsia-500/10 to-transparent text-fuchsia-200 hover:bg-fuchsia-500/15'}`}
                                  onClick={() => toggleZone(zone)}
                                  title={open ? 'Click to collapse' : 'Click to expand status breakdown'}
                                >
                                  <div className="flex items-center justify-center gap-1.5">
                                    <span className="text-[10px] opacity-70">{open ? '▼' : '▶'}</span>
                                    <span>{zone}</span>
                                  </div>
                                  <div className="text-[10px] font-normal text-white/50 mt-0.5 tabular-nums">
                                    {ztot.count.toLocaleString('en-IN')} · {fmtKg(ztot.modeKg)} kg
                                  </div>
                                </th>
                              );
                            })}
                            <th rowSpan={2} className="px-3 py-3 text-right font-semibold text-emerald-300 sticky right-0 bg-slate-900/95 backdrop-blur z-20 border-l border-white/15 min-w-[110px]">
                              Total
                            </th>
                          </tr>
                          <tr className="border-b border-white/10 bg-slate-900/80 backdrop-blur">
                            {zonePivot.zones.map((zone) => {
                              if (!isExpanded(zone)) {
                                return (
                                  <th key={`sub|${zone}`} className="px-2 py-2 text-center text-[10px] font-medium text-purple-200/60 border-r border-white/15">
                                    Total
                                  </th>
                                );
                              }
                              return zonePivot.statuses.map((st, si) => (
                                <th
                                  key={`${zone}|${st}`}
                                  className={`px-2 py-2 text-center text-[10px] font-medium text-purple-200/80 ${si === zonePivot.statuses.length - 1 ? 'border-r border-white/15' : ''}`}
                                >
                                  {st}
                                </th>
                              ));
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {zonePivot.sellers.map((seller) => {
                            const sellerRow = zonePivot.data[seller] || {};
                            const sellerTot = zonePivot.sellerTotals[seller] || { count: 0, modeKg: 0 };
                            return (
                              <tr key={seller} className="border-b border-white/5 hover:bg-white/5">
                                <td className="px-4 py-2.5 text-white sticky left-0 bg-slate-900/80 backdrop-blur z-10 border-r border-white/10 align-top min-w-[260px] max-w-[320px]" title={`${seller}${zonePivot.sellerAddresses?.[seller] ? `\n${zonePivot.sellerAddresses[seller]}` : ''}`}>
                                  <div className="truncate">{seller}</div>
                                  {zonePivot.sellerAddresses?.[seller] && (
                                    <div className="text-[10px] text-purple-300/60 mt-0.5 leading-snug break-words">
                                      {zonePivot.sellerAddresses[seller]}
                                    </div>
                                  )}
                                </td>
                                {zonePivot.zones.map((zone) => {
                                  if (!isExpanded(zone)) {
                                    const cell = zoneRollup(seller, zone);
                                    const dim = cell.count === 0;
                                    return (
                                      <td
                                        key={`${seller}|${zone}|rollup`}
                                        className={`px-2 py-2 text-center tabular-nums border-r border-white/10 ${dim ? 'text-white/20' : 'text-white cursor-pointer hover:bg-fuchsia-500/15 transition-colors'}`}
                                        onClick={dim ? undefined : () => openZoneCellDrill(seller, zone, null)}
                                        title={dim ? undefined : `View ${seller} · Zone ${zone} orders`}
                                      >
                                        {dim ? '—' : (
                                          <div className="leading-tight">
                                            <div className="font-bold text-sm">{cell.count.toLocaleString('en-IN')}</div>
                                            <div className="text-[10px] text-purple-300/70">{fmtKg(cell.modeKg)} kg</div>
                                          </div>
                                        )}
                                      </td>
                                    );
                                  }
                                  const zoneRow = sellerRow[zone] || {};
                                  return zonePivot.statuses.map((st, si) => {
                                    const cell = zoneRow[st];
                                    const dim = !cell;
                                    return (
                                      <td
                                        key={`${seller}|${zone}|${st}`}
                                        className={`px-2 py-2 text-center tabular-nums ${si === zonePivot.statuses.length - 1 ? 'border-r border-white/10' : ''} ${dim ? 'text-white/20' : 'text-white cursor-pointer hover:bg-fuchsia-500/15 transition-colors'}`}
                                        onClick={dim ? undefined : () => openZoneCellDrill(seller, zone, st)}
                                        title={dim ? undefined : `View ${seller} · Zone ${zone} · ${st} orders`}
                                      >
                                        {dim ? '—' : (
                                          <div className="leading-tight">
                                            <div className="font-bold text-sm">{cell.count.toLocaleString('en-IN')}</div>
                                            <div className="text-[10px] text-purple-300/70">{fmtKg(cell.modeKg)} kg</div>
                                          </div>
                                        )}
                                      </td>
                                    );
                                  });
                                })}
                                <td
                                  className={`px-3 py-2.5 text-right tabular-nums sticky right-0 bg-slate-900/80 backdrop-blur z-10 border-l border-white/10 ${sellerTot.count === 0 ? '' : 'cursor-pointer hover:bg-fuchsia-500/15 transition-colors'}`}
                                  onClick={sellerTot.count === 0 ? undefined : () => openZoneCellDrill(seller, null, null)}
                                  title={sellerTot.count === 0 ? undefined : `View all ${seller} orders (all zones)`}
                                >
                                  <div className="font-bold text-sm text-emerald-300">{sellerTot.count.toLocaleString('en-IN')}</div>
                                  <div className="text-[10px] text-emerald-300/60">{fmtKg(sellerTot.modeKg)} kg</div>
                                </td>
                              </tr>
                            );
                          })}
                          <tr className="border-t-2 border-white/20 bg-white/10 font-semibold">
                            <td className="px-4 py-3 text-white sticky left-0 bg-slate-900/95 backdrop-blur z-10 border-r border-white/15">Total</td>
                            {zonePivot.zones.map((zone) => {
                              if (!isExpanded(zone)) {
                                const ztot = zonePivot.zoneTotals[zone] || { count: 0, modeKg: 0 };
                                const dim = ztot.count === 0;
                                return (
                                  <td
                                    key={`tot|${zone}|rollup`}
                                    className={`px-2 py-2.5 text-center tabular-nums border-r border-white/15 ${dim ? 'text-white/30' : 'text-white cursor-pointer hover:bg-fuchsia-500/15 transition-colors'}`}
                                    onClick={dim ? undefined : () => openZoneCellDrill(null, zone, null)}
                                    title={dim ? undefined : `View all Zone ${zone} orders`}
                                  >
                                    {dim ? '—' : (
                                      <div className="leading-tight">
                                        <div className="font-bold text-sm">{ztot.count.toLocaleString('en-IN')}</div>
                                        <div className="text-[10px] text-purple-300/70">{fmtKg(ztot.modeKg)} kg</div>
                                      </div>
                                    )}
                                  </td>
                                );
                              }
                              return zonePivot.statuses.map((st, si) => {
                                const stot = zoneStatusTotal(zone, st);
                                const dim = stot.count === 0;
                                return (
                                  <td
                                    key={`tot|${zone}|${st}`}
                                    className={`px-2 py-2.5 text-center tabular-nums ${si === zonePivot.statuses.length - 1 ? 'border-r border-white/15' : ''} ${dim ? 'text-white/30' : 'text-white cursor-pointer hover:bg-fuchsia-500/15 transition-colors'}`}
                                    onClick={dim ? undefined : () => openZoneCellDrill(null, zone, st)}
                                    title={dim ? undefined : `View all Zone ${zone} · ${st} orders`}
                                  >
                                    {dim ? '—' : (
                                      <div className="leading-tight">
                                        <div className="font-bold text-sm">{stot.count.toLocaleString('en-IN')}</div>
                                        <div className="text-[10px] text-purple-300/70">{fmtKg(stot.modeKg)} kg</div>
                                      </div>
                                    )}
                                  </td>
                                );
                              });
                            })}
                            <td
                              className={`px-3 py-3 text-right tabular-nums sticky right-0 bg-slate-900/95 backdrop-blur z-10 border-l border-white/15 ${zonePivot.grand.count === 0 ? '' : 'cursor-pointer hover:bg-fuchsia-500/15 transition-colors'}`}
                              onClick={zonePivot.grand.count === 0 ? undefined : () => openZoneCellDrill(null, null, null)}
                              title={zonePivot.grand.count === 0 ? undefined : 'View all Delhivery zone orders'}
                            >
                              <div className="font-bold text-sm text-emerald-300">{zonePivot.grand.count.toLocaleString('en-IN')}</div>
                              <div className="text-[10px] text-emerald-300/60">{fmtKg(zonePivot.grand.modeKg)} kg</div>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
          )}

          {/* Commercial PDF modal */}
          {commercialOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
              onClick={() => setCommercialOpen(false)}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-slate-950/85 via-purple-950/80 to-fuchsia-950/85 backdrop-blur-2xl" />
              <div
                className="relative w-full max-w-6xl h-[88vh] rounded-3xl overflow-hidden border border-white/15 bg-gradient-to-br from-slate-900/95 via-purple-950/95 to-slate-900/95 shadow-[0_0_80px_rgba(217,70,239,0.45),inset_0_0_40px_rgba(168,85,247,0.15)]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="absolute -top-px left-8 right-8 h-px bg-gradient-to-r from-transparent via-fuchsia-400 to-transparent" />
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-gradient-to-r from-fuchsia-500/10 via-purple-500/10 to-transparent">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center shadow-[0_0_20px_rgba(217,70,239,0.5)]">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="9" y1="13" x2="15" y2="13" />
                        <line x1="9" y1="17" x2="13" y2="17" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-white tracking-tight">Badho Logistics Commercials</h2>
                      <p className="text-[11px] text-purple-300/70 uppercase tracking-wider mt-0.5">Delhivery rate card · zone × weight slab</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href="/badho-logistics-commercials.pdf"
                      download
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-white/10 hover:bg-white/20 border border-white/15 transition-colors"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      Download
                    </a>
                    <a
                      href="/badho-logistics-commercials.pdf"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-white/10 hover:bg-white/20 border border-white/15 transition-colors"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                      Open in tab
                    </a>
                    <button
                      onClick={() => setCommercialOpen(false)}
                      className="w-8 h-8 rounded-lg bg-white/10 hover:bg-rose-500/30 border border-white/15 hover:border-rose-400/50 text-white/80 hover:text-white text-lg leading-none transition-all"
                      aria-label="Close"
                      title="Close (Esc)"
                    >×</button>
                  </div>
                </div>
                <div className="absolute inset-x-6 top-[73px] bottom-6 rounded-2xl overflow-hidden border border-white/10 bg-white">
                  <iframe
                    src="/badho-logistics-commercials.pdf#toolbar=1&navpanes=0&view=FitH"
                    title="Badho Logistics Commercials"
                    className="w-full h-full"
                  />
                </div>
              </div>
            </div>
          )}
          </div>
          );
        })()}

        {activeTab === 'margin' && (() => {
          const fmtINR = (n: number) => {
            const sign = n < 0 ? '-' : '';
            const abs = Math.abs(n);
            if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`;
            if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`;
            if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}K`;
            return `${sign}₹${abs.toFixed(0)}`;
          };
          const fmtFull = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
          const fmtMDay = (iso: string) => {
            const d = new Date(iso);
            if (Number.isNaN(d.getTime())) return iso;
            return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
          };
          const totals = marginData?.totals;
          const chartData = marginData
            ? [...marginData.data].reverse().map((d) => ({ ...d, label: fmtMDay(d.date) }))
            : [];
          const agentChartData = activeAgentData
            ? [...activeAgentData.data].reverse().map((d) => ({ ...d, label: fmtMDay(d.date) }))
            : [];
          const accentRing: Record<string, string> = {
            purple: 'from-purple-500/20 to-fuchsia-500/10 border-purple-400/20',
            indigo: 'from-indigo-500/20 to-blue-500/10 border-indigo-400/20',
            emerald: 'from-emerald-500/20 to-teal-500/10 border-emerald-400/20',
            amber: 'from-amber-500/20 to-orange-500/10 border-amber-400/20',
            rose: 'from-rose-500/20 to-red-500/10 border-rose-400/20',
          };
          const Kpi = ({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) => (
            <div className={`bg-gradient-to-br ${accentRing[accent]} backdrop-blur-xl border rounded-2xl p-4 animate-corner-breath`}>
              <div className="text-[11px] uppercase tracking-wide text-purple-200/70 font-semibold">{label}</div>
              <div className="text-2xl font-bold text-white mt-1 tabular-nums">{value}</div>
              {sub && <div className="text-[11px] text-purple-200/60 mt-0.5">{sub}</div>}
            </div>
          );

          return (
            <div>
              {/* Header + range toggle */}
              <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-2xl font-bold text-white">P&amp;L Overview</h2>
                  <p className="text-white/60 text-sm mt-1">
                    Daily P&amp;L — D2R brand sellers · third-party INTERCITY orders · badho margin vs operational cost
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {queryBtn('margin', 'P&L Overview')}
                  {queryBtn('activeAgents', 'P&L — Active Agents')}
                  <div className="inline-flex gap-1 p-1 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl">
                    {([
                      { key: 'last7', label: 'Last 7 days' },
                      { key: 'last15', label: 'Last 15 days' },
                      { key: 'last30', label: 'Last 30 days' },
                      { key: 'custom', label: 'Custom' },
                    ] as const).map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => setMarginRange(opt.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                          marginRange === opt.key
                            ? 'bg-fuchsia-500/30 text-white border border-fuchsia-400/40'
                            : 'text-purple-200 hover:bg-white/10'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {marginRange === 'custom' && (
                    <div className="inline-flex items-center gap-1.5 p-1 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl">
                      <input
                        type="date"
                        value={marginCustomFrom}
                        max={marginCustomTo || undefined}
                        onChange={(e) => setMarginCustomFrom(e.target.value)}
                        className="bg-slate-900/60 text-purple-100 text-xs px-2 py-1 rounded-lg border border-white/10 focus:border-fuchsia-400/50 focus:outline-none [color-scheme:dark]"
                      />
                      <span className="text-purple-300/60 text-xs">to</span>
                      <input
                        type="date"
                        value={marginCustomTo}
                        min={marginCustomFrom || undefined}
                        onChange={(e) => setMarginCustomTo(e.target.value)}
                        className="bg-slate-900/60 text-purple-100 text-xs px-2 py-1 rounded-lg border border-white/10 focus:border-fuchsia-400/50 focus:outline-none [color-scheme:dark]"
                      />
                    </div>
                  )}
                </div>
              </div>

              {marginError && (
                <div className="mb-6 rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-rose-200 text-sm">
                  Failed to load data: {marginError}
                </div>
              )}

              {marginLoading && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-xl p-12 text-center text-purple-200 text-sm">
                  Loading margin data…
                </div>
              )}

              {!marginLoading && marginData && totals && (
                <>
                  {/* Sub-tab navigation */}
                  <div className="mb-6 flex gap-1 p-1 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl w-fit">
                    {(['trend', 'details'] as const).map((sub) => {
                      const active = marginSubTab === sub;
                      return (
                        <button
                          key={sub}
                          onClick={() => setMarginSubTab(sub)}
                          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-300 ${
                            active
                              ? 'bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 text-white shadow-[0_0_24px_rgba(217,70,239,0.55),inset_0_0_18px_rgba(168,85,247,0.5)]'
                              : 'text-purple-200 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {sub === 'trend' ? 'Trend' : 'Details'}
                        </button>
                      );
                    })}
                  </div>

                  {marginSubTab === 'trend' && (
                  <>
                  {/* KPI cards */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4 mb-6">
                    <Kpi label="Total Orders" value={totals.totalOrders.toLocaleString('en-IN')} accent="purple" />
                    <Kpi label="Total GTV" value={fmtINR(totals.totalPoAmount)} sub={fmtFull(totals.totalPoAmount)} accent="indigo" />
                    <Kpi label="Total Margin" value={fmtINR(totals.totalMargin)} sub={fmtFull(totals.totalMargin)} accent="emerald" />
                    <Kpi label="Operational Cost" value={fmtINR(totals.totalOperationalCost)} sub={fmtFull(totals.totalOperationalCost)} accent="amber" />
                    <Kpi label="Net P&L" value={fmtINR(totals.profitAndLossRs)} sub={totals.profitAndLossRs >= 0 ? 'Profit' : 'Loss'} accent={totals.profitAndLossRs >= 0 ? 'emerald' : 'rose'} />
                    <Kpi label="P&L % of GTV" value={totals.pnlPercentOfGtv === null ? '—' : `${totals.pnlPercentOfGtv}%`} sub={`${totals.profitDays} profit · ${totals.lossDays} loss days`} accent={(totals.pnlPercentOfGtv ?? 0) >= 0 ? 'emerald' : 'rose'} />
                    <Kpi
                      label="Active Agents"
                      value={activeAgentData ? activeAgentData.totals.totalDistinctAgents.toLocaleString('en-IN') : '—'}
                      sub={activeAgentData ? `outbound · ${activeAgentData.totals.activeDays} active days · peak ${activeAgentData.totals.peak}/day` : 'Warm/Cold Lead outbound'}
                      accent="indigo"
                    />
                  </div>

                  {/* Daily P&L % of GTV */}
                  <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 mb-6 animate-corner-breath">
                    <div className="mb-3">
                      <div className="text-base font-semibold text-white">Daily P&amp;L % of GTV</div>
                      <div className="text-xs text-purple-200/70 mt-0.5">Net P&amp;L as a share of that day&apos;s GTV · value shown on each bar</div>
                    </div>
                    <ResponsiveContainer width="100%" height={320}>
                      <ComposedChart data={chartData} margin={{ top: 24, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                        <XAxis dataKey="label" tick={{ fill: '#c4b5fd', fontSize: 11 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fill: '#c4b5fd', fontSize: 11 }} tickFormatter={(v) => `${Math.round(Number(v))}%`} width={48} />
                        <Tooltip
                          cursor={{ fill: 'rgba(217,70,239,0.12)' }}
                          contentStyle={{ background: '#ffffff', border: '1px solid rgba(217,70,239,0.5)', borderRadius: 12, color: '#1e1b4b', fontSize: 13, padding: '10px 14px', boxShadow: '0 8px 24px rgba(30,27,75,0.2)' }}
                          labelStyle={{ color: '#a21caf', fontWeight: 700, marginBottom: 4 }}
                          itemStyle={{ color: '#1e1b4b' }}
                          formatter={(value, _name, item) => {
                            const p = item?.payload || {};
                            return [
                              `${Number(value).toFixed(2)}%  ·  Net P&L ${fmtFull(p.profitAndLossRs || 0)}  ·  GTV ${fmtFull(p.totalPoAmount || 0)}`,
                              p.status || 'P&L % of GTV',
                            ];
                          }}
                        />
                        <ReferenceLine y={0} stroke="rgba(255,255,255,0.35)" />
                        <Bar dataKey="pnlPercentOfGtv" name="P&L % of GTV" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                          {chartData.map((d, i) => (
                            <Cell key={i} fill={(d.pnlPercentOfGtv ?? 0) >= 0 ? '#34d399' : '#fb7185'} />
                          ))}
                          <LabelList
                            dataKey="pnlPercentOfGtv"
                            content={(props: any) => {
                              const { x, y, width, height, value } = props;
                              const val = Number(value);
                              if (!Number.isFinite(val)) return null;
                              const cx = Number(x) + Number(width) / 2;
                              // positive bars grow up from baseline (label above top); negative grow down (label below)
                              const labelY = val >= 0 ? Number(y) - 5 : Number(y) + Number(height) + 12;
                              return (
                                <text
                                  x={cx}
                                  y={labelY}
                                  textAnchor="middle"
                                  style={{ fill: '#ffffff', fontSize: 10, fontWeight: 700, paintOrder: 'stroke', stroke: '#0f172a', strokeWidth: 3, strokeLinejoin: 'round' }}
                                >
                                  {`${val.toFixed(0)}%`}
                                </text>
                              );
                            }}
                          />
                        </Bar>
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Daily Active Agent Count */}
                  <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 mb-6 animate-corner-breath">
                    <div className="mb-3">
                      <div className="text-base font-semibold text-white">Daily Active Agent Count</div>
                      <div className="text-xs text-purple-200/70 mt-0.5">Distinct agents making outbound calls (Warm_Lead &amp; Cold Lead Campaign) · value shown on each bar</div>
                    </div>
                    <ResponsiveContainer width="100%" height={320}>
                      <ComposedChart data={agentChartData} margin={{ top: 24, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                        <XAxis dataKey="label" tick={{ fill: '#c4b5fd', fontSize: 11 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fill: '#c4b5fd', fontSize: 11 }} allowDecimals={false} width={36} />
                        <Tooltip
                          cursor={{ fill: 'rgba(99,102,241,0.12)' }}
                          contentStyle={{ background: '#ffffff', border: '1px solid rgba(99,102,241,0.5)', borderRadius: 12, color: '#1e1b4b', fontSize: 13, padding: '10px 14px', boxShadow: '0 8px 24px rgba(30,27,75,0.2)' }}
                          labelStyle={{ color: '#4338ca', fontWeight: 700, marginBottom: 4 }}
                          itemStyle={{ color: '#1e1b4b' }}
                          formatter={(value) => [`${Number(value).toLocaleString('en-IN')} agents`, 'Active Agents']}
                        />
                        <Bar dataKey="activeAgentCount" name="Active Agents" fill="#818cf8" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                          <LabelList
                            dataKey="activeAgentCount"
                            content={(props: any) => {
                              const { x, y, width, value } = props;
                              const val = Number(value);
                              if (!Number.isFinite(val)) return null;
                              const cx = Number(x) + Number(width) / 2;
                              return (
                                <text
                                  x={cx}
                                  y={Number(y) - 5}
                                  textAnchor="middle"
                                  style={{ fill: '#ffffff', fontSize: 10, fontWeight: 700, paintOrder: 'stroke', stroke: '#0f172a', strokeWidth: 3, strokeLinejoin: 'round' }}
                                >
                                  {val.toFixed(0)}
                                </text>
                              );
                            }}
                          />
                        </Bar>
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Margin vs OpCost + Net P&L line */}
                  <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 mb-6 animate-corner-breath">
                    <div className="mb-3">
                      <div className="text-base font-semibold text-white">Margin vs Operational Cost &amp; Net P&amp;L</div>
                      <div className="text-xs text-purple-200/70 mt-0.5">Bars: daily margin &amp; op-cost (₹) · Line: net P&amp;L (₹)</div>
                    </div>
                    <ResponsiveContainer width="100%" height={360}>
                      <ComposedChart data={chartData} margin={{ top: 24, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                        <XAxis dataKey="label" tick={{ fill: '#c4b5fd', fontSize: 11 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fill: '#c4b5fd', fontSize: 11 }} tickFormatter={(v) => fmtINR(v)} width={60} />
                        <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid rgba(217,70,239,0.5)', borderRadius: 12, color: '#1e1b4b', boxShadow: '0 8px 24px rgba(30,27,75,0.2)' }} labelStyle={{ color: '#a21caf', fontWeight: 700 }} itemStyle={{ color: '#1e1b4b' }} formatter={(value, name) => [fmtFull(Number(value)), String(name)]} />
                        <Legend wrapperStyle={{ fontSize: 12, color: '#c4b5fd' }} />
                        <ReferenceLine y={0} stroke="rgba(255,255,255,0.3)" />
                        <Bar dataKey="totalMargin" name="Margin" fill="#34d399" radius={[3, 3, 0, 0]} barSize={14} />
                        <Bar dataKey="totalOperationalCost" name="Op Cost" fill="#fbbf24" radius={[3, 3, 0, 0]} barSize={14} />
                        <Line
                          type="monotone"
                          dataKey="profitAndLossRs"
                          name="Net P&L"
                          stroke="#f0abfc"
                          strokeWidth={2.5}
                          dot={{ r: 2.5, fill: '#f0abfc', stroke: '#1e1b4b', strokeWidth: 1 }}
                          activeDot={{ r: 5, fill: '#fff', stroke: '#d946ef', strokeWidth: 2 }}
                          isAnimationActive={false}
                        >
                          <LabelList
                            dataKey="profitAndLossRs"
                            content={(props: any) => {
                              const { x, y, value } = props;
                              const val = Number(value);
                              if (!Number.isFinite(val)) return null;
                              return (
                                <text
                                  x={Number(x)}
                                  y={Number(y) - 9}
                                  textAnchor="middle"
                                  style={{ fill: '#f5d0fe', fontSize: 9, fontWeight: 700, paintOrder: 'stroke', stroke: '#0f172a', strokeWidth: 3, strokeLinejoin: 'round' }}
                                >
                                  {fmtINR(val)}
                                </text>
                              );
                            }}
                          />
                        </Line>
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Daily Net P&L bars */}
                  <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 mb-6 animate-corner-breath">
                    <div className="mb-3">
                      <div className="text-base font-semibold text-white">Daily Net P&amp;L</div>
                      <div className="text-xs text-purple-200/70 mt-0.5">Green = profit day · Red = loss day</div>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                      <ComposedChart data={chartData} margin={{ top: 24, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                        <XAxis dataKey="label" tick={{ fill: '#c4b5fd', fontSize: 11 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fill: '#c4b5fd', fontSize: 11 }} tickFormatter={(v) => fmtINR(v)} width={60} />
                        <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid rgba(217,70,239,0.5)', borderRadius: 12, color: '#1e1b4b', boxShadow: '0 8px 24px rgba(30,27,75,0.2)' }} labelStyle={{ color: '#a21caf', fontWeight: 700 }} itemStyle={{ color: '#1e1b4b' }} formatter={(value) => [fmtFull(Number(value)), 'Net P&L']} />
                        <ReferenceLine y={0} stroke="rgba(255,255,255,0.3)" />
                        <Bar dataKey="profitAndLossRs" name="Net P&L" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                          {chartData.map((d, i) => (
                            <Cell key={i} fill={d.profitAndLossRs >= 0 ? '#34d399' : '#fb7185'} />
                          ))}
                          <LabelList
                            dataKey="profitAndLossRs"
                            content={(props: any) => {
                              const { x, y, width, height, value } = props;
                              const val = Number(value);
                              if (!Number.isFinite(val)) return null;
                              const cx = Number(x) + Number(width) / 2;
                              const labelY = val >= 0 ? Number(y) - 5 : Number(y) + Number(height) + 12;
                              return (
                                <text
                                  x={cx}
                                  y={labelY}
                                  textAnchor="middle"
                                  style={{ fill: '#ffffff', fontSize: 9, fontWeight: 700, paintOrder: 'stroke', stroke: '#0f172a', strokeWidth: 3, strokeLinejoin: 'round' }}
                                >
                                  {fmtINR(val)}
                                </text>
                              );
                            }}
                          />
                        </Bar>
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  </>
                  )}

                  {marginSubTab === 'details' && (
                  <>
                  {/* Daily breakdown table */}
                  <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden animate-corner-breath">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-white/5 text-purple-200 text-xs uppercase tracking-wide">
                            <th className="px-4 py-3 text-left font-semibold">Date</th>
                            <th className="px-4 py-3 text-right font-semibold">Orders</th>
                            <th className="px-4 py-3 text-right font-semibold">GTV</th>
                            <th className="px-4 py-3 text-right font-semibold">Margin</th>
                            <th className="px-4 py-3 text-right font-semibold">Op Cost</th>
                            <th className="px-4 py-3 text-right font-semibold">Net P&amp;L</th>
                            <th className="px-4 py-3 text-right font-semibold">P&amp;L % GTV</th>
                            <th className="px-4 py-3 text-center font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {marginData.data.map((d) => (
                            <tr key={d.date} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                              <td className="px-4 py-2.5 text-purple-100 font-medium whitespace-nowrap">{fmtMDay(d.date)}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums">
                                <button
                                  type="button"
                                  onClick={() => openMarginDayModal(d.date)}
                                  disabled={d.totalOrders === 0}
                                  title={d.totalOrders === 0 ? undefined : 'View orders for this day'}
                                  className="text-fuchsia-300 font-semibold underline decoration-dotted underline-offset-4 hover:text-fuchsia-200 hover:decoration-solid transition-colors disabled:text-purple-100 disabled:no-underline disabled:cursor-default"
                                >
                                  {d.totalOrders.toLocaleString('en-IN')}
                                </button>
                              </td>
                              <td className="px-4 py-2.5 text-right text-purple-100 tabular-nums">{fmtFull(d.totalPoAmount)}</td>
                              <td className="px-4 py-2.5 text-right text-emerald-300 tabular-nums">{fmtFull(d.totalMargin)}</td>
                              <td className="px-4 py-2.5 text-right text-amber-300 tabular-nums">{fmtFull(d.totalOperationalCost)}</td>
                              <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${d.profitAndLossRs >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{fmtFull(d.profitAndLossRs)}</td>
                              <td className={`px-4 py-2.5 text-right tabular-nums ${(d.pnlPercentOfGtv ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{d.pnlPercentOfGtv === null ? '—' : `${d.pnlPercentOfGtv}%`}</td>
                              <td className="px-4 py-2.5 text-center">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                  d.status === 'Profit'
                                    ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30'
                                    : d.status === 'Loss'
                                    ? 'bg-rose-500/20 text-rose-200 border border-rose-400/30'
                                    : 'bg-slate-500/20 text-slate-200 border border-slate-400/30'
                                }`}>
                                  {d.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {marginData.data.length === 0 && (
                            <tr><td colSpan={8} className="px-4 py-8 text-center text-purple-300/70">No orders in this window.</td></tr>
                          )}
                        </tbody>
                        {marginData.data.length > 0 && (
                          <tfoot>
                            <tr className="border-t-2 border-fuchsia-400/30 bg-white/5 font-semibold">
                              <td className="px-4 py-3 text-purple-100">Total</td>
                              <td className="px-4 py-3 text-right text-purple-100 tabular-nums">{totals.totalOrders.toLocaleString('en-IN')}</td>
                              <td className="px-4 py-3 text-right text-purple-100 tabular-nums">{fmtFull(totals.totalPoAmount)}</td>
                              <td className="px-4 py-3 text-right text-emerald-300 tabular-nums">{fmtFull(totals.totalMargin)}</td>
                              <td className="px-4 py-3 text-right text-amber-300 tabular-nums">{fmtFull(totals.totalOperationalCost)}</td>
                              <td className={`px-4 py-3 text-right tabular-nums ${totals.profitAndLossRs >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{fmtFull(totals.profitAndLossRs)}</td>
                              <td className={`px-4 py-3 text-right tabular-nums ${(totals.pnlPercentOfGtv ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{totals.pnlPercentOfGtv === null ? '—' : `${totals.pnlPercentOfGtv}%`}</td>
                              <td></td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                  </>
                  )}

                  <div className="mt-4 text-right text-purple-300/40 text-[11px]">
                    Updated {new Date(marginData.timestamp).toLocaleString('en-IN')} · {marginData.days ? `lookback ${marginData.days}d` : `${marginCustomFrom} → ${marginCustomTo}`}
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* Per-day P&L drill-down modal — opened from the Details table Orders count */}
        {marginDayModal && (() => {
          const fmtFull = (n: number) => `${n < 0 ? '-' : ''}₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`;
          const fmtDay = (iso: string) => {
            const dt = new Date(iso);
            if (Number.isNaN(dt.getTime())) return iso;
            return dt.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
          };
          return (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
              onClick={() => setMarginDayModal(null)}
            >
              <div
                className="relative w-[95vw] max-w-[95vw] max-h-[92vh] flex flex-col bg-gradient-to-br from-slate-900 via-purple-950/60 to-slate-900 border border-fuchsia-400/20 rounded-2xl shadow-[0_0_60px_rgba(217,70,239,0.25)] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="px-6 py-4 border-b border-white/10 bg-white/5 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-white">Order-level P&amp;L · {fmtDay(marginDayModal)}</h3>
                    <p className="text-xs text-purple-200/70 mt-0.5">
                      {marginDayData ? `${marginDayData.length} order${marginDayData.length === 1 ? '' : 's'}` : 'Loading…'} · D2R · third-party INTERCITY
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMarginDayModal(null)}
                    className="shrink-0 w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-purple-200 hover:text-white flex items-center justify-center transition-colors"
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-auto">
                  {marginDayError && (
                    <div className="m-6 rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-rose-200 text-sm">
                      Failed to load: {marginDayError}
                    </div>
                  )}
                  {marginDayLoading && (
                    <div className="p-12 text-center text-purple-200 text-sm">Loading orders…</div>
                  )}
                  {!marginDayLoading && marginDayData && (
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-slate-900 text-purple-200 text-xs uppercase tracking-wide">
                          <th className="px-4 py-3 text-left font-semibold">PO #</th>
                          <th className="px-4 py-3 text-right font-semibold">GTV</th>
                          <th className="px-4 py-3 text-right font-semibold">Comm %</th>
                          <th className="px-4 py-3 text-right font-semibold">Margin</th>
                          <th className="px-4 py-3 text-right font-semibold">Op Cost</th>
                          <th className="px-4 py-3 text-right font-semibold">Net P&amp;L</th>
                          <th className="px-4 py-3 text-center font-semibold">Status</th>
                          <th className="px-4 py-3 text-right font-semibold">Coupon</th>
                          <th className="px-4 py-3 text-right font-semibold">Badho Disc</th>
                          <th className="px-4 py-3 text-right font-semibold">Reward</th>
                          <th className="px-4 py-3 text-right font-semibold">Delivery Charge</th>
                          <th className="px-4 py-3 text-right font-semibold">DB Delivery Charge</th>
                          <th className="px-4 py-3 text-right font-semibold">RTO Charge</th>
                          <th className="px-4 py-3 text-center font-semibold">Forward Delivery Cost To Seller</th>
                          <th className="px-4 py-3 text-left font-semibold">Delivery Status</th>
                          <th className="px-4 py-3 text-left font-semibold">Marked Pending</th>
                          <th className="px-4 py-3 text-left font-semibold">Order Status</th>
                          <th className="px-4 py-3 text-right font-semibold">Paid Amount</th>
                          <th className="px-4 py-3 text-left font-semibold">Payment Option</th>
                          <th className="px-4 py-3 text-left font-semibold">AWB Number</th>
                          <th className="px-4 py-3 text-left font-semibold">Courier Name</th>
                          <th className="px-4 py-3 text-left font-semibold">Buyer Business</th>
                          <th className="px-4 py-3 text-left font-semibold">Buyer Phone</th>
                          <th className="px-4 py-3 text-left font-semibold">Buyer Address</th>
                          <th className="px-4 py-3 text-left font-semibold">Seller Business</th>
                          <th className="px-4 py-3 text-left font-semibold">Seller Phone</th>
                          <th className="px-4 py-3 text-left font-semibold">{statusMarkedHeaderFor(marginDayData)}</th>
                          <th className="px-4 py-3 text-left font-semibold">Status Duration</th>
                          <th className="px-4 py-3 text-left font-semibold">Refund Initiated</th>
                          <th className="px-4 py-3 text-left font-semibold">Refund Completed</th>
                          <th className="px-4 py-3 text-right font-semibold">Refund Amount</th>
                          <th className="px-4 py-3 text-left font-semibold">Reject Reason</th>
                          <th className="px-4 py-3 text-left font-semibold">Rejected By</th>
                          <th className="px-4 py-3 text-left font-semibold">Reason Added By Badho Team</th>
                          <th className="px-4 py-3 text-left font-semibold">Payment Date</th>
                          <th className="px-4 py-3 text-left font-semibold">Payment Event</th>
                        </tr>
                      </thead>
                      <tbody>
                        {marginDayData.map((o) => (
                          <tr key={o.poId} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              {o.poNumber ? (
                                <button
                                  type="button"
                                  onClick={() => openPoItemsModal(o.poNumber as string)}
                                  className="text-fuchsia-300 font-semibold hover:text-fuchsia-200 hover:underline transition-colors"
                                  title="View order items"
                                >
                                  {o.poNumber}
                                </button>
                              ) : (
                                <span className="text-purple-300/50">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right text-purple-100 tabular-nums">{fmtFull(o.poAmount)}</td>
                            <td className="px-4 py-2.5 text-right text-purple-200/80 tabular-nums">{o.badhoCommissionPct ? `${o.badhoCommissionPct}%` : '—'}</td>
                            <td className="px-4 py-2.5 text-right text-emerald-300 tabular-nums">{fmtFull(o.marginRs)}</td>
                            <td className="px-4 py-2.5 text-right text-amber-300 tabular-nums">{fmtFull(o.operationalCostRs)}</td>
                            <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${o.profitAndLossRs >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{fmtFull(o.profitAndLossRs)}</td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                o.status === 'Profit'
                                  ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30'
                                  : o.status === 'Loss'
                                  ? 'bg-rose-500/20 text-rose-200 border border-rose-400/30'
                                  : 'bg-slate-500/20 text-slate-200 border border-slate-400/30'
                              }`}>
                                {o.status}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right text-purple-200/80 tabular-nums">{fmtFull(o.couponRs)}</td>
                            <td className="px-4 py-2.5 text-right text-purple-200/80 tabular-nums">{fmtFull(o.badhoPaymentDiscountRs)}</td>
                            <td className="px-4 py-2.5 text-right text-purple-200/80 tabular-nums">{fmtFull(o.rewardRs)}</td>
                            <td className="px-4 py-2.5 text-right text-purple-200/80 tabular-nums">{fmtFull(o.deliveryChargeRs)}</td>
                            <td className="px-4 py-2.5 text-right text-sky-300 tabular-nums">{o.dbDeliveryChargeRs != null ? fmtFull(o.dbDeliveryChargeRs) : '—'}</td>
                            <td className={`px-4 py-2.5 text-right tabular-nums ${o.rtoChargeRs > 0 ? 'text-rose-300 font-semibold' : 'text-purple-300/50'}`}>{o.rtoChargeRs > 0 ? fmtFull(o.rtoChargeRs) : '—'}</td>
                            <td className="px-4 py-2.5 text-center whitespace-nowrap">
                              {o.forwardDeliveryCostToSeller == null ? (
                                <span className="text-purple-300/50">—</span>
                              ) : (
                                <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                  String(o.forwardDeliveryCostToSeller).toLowerCase() === 'true'
                                    ? 'bg-amber-500/20 text-amber-200 border border-amber-400/30'
                                    : 'bg-slate-500/20 text-slate-200 border border-slate-400/30'
                                }`}>
                                  {String(o.forwardDeliveryCostToSeller).toLowerCase() === 'true' ? 'Yes' : 'No'}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-purple-100 text-[11px] whitespace-nowrap">{o.deliveryStatus ?? '—'}</td>
                            <td className="px-4 py-2.5 text-purple-100 text-[11px] whitespace-nowrap">{formatDateTime(o.markedPendingTime)}</td>
                            <td className="px-4 py-2.5 text-purple-100 text-[11px] whitespace-nowrap">{o.orderStatus ?? '—'}</td>
                            <td className="px-4 py-2.5 text-right text-emerald-300 font-semibold tabular-nums">{o.paidAmount != null ? fmtFull(o.paidAmount) : '—'}</td>
                            <td className="px-4 py-2.5 text-purple-100 text-[11px] whitespace-nowrap">{o.paymentOption ?? '—'}</td>
                            <td className="px-4 py-2.5 text-purple-100 text-[11px] tabular-nums whitespace-nowrap">{o.awbNumber ?? '—'}</td>
                            <td className="px-4 py-2.5 text-purple-100 text-[11px] whitespace-nowrap">{o.courierName ?? '—'}</td>
                            <td className="px-4 py-2.5 text-purple-100 max-w-[180px] truncate" title={o.buyerName ?? ''}>{o.buyerName ?? '—'}</td>
                            <td className="px-4 py-2.5 text-purple-100 text-[11px] tabular-nums whitespace-nowrap">{o.buyerPhone ?? '—'}</td>
                            <td className="px-4 py-2.5 text-purple-100/80 text-[11px] max-w-[260px] whitespace-normal">{o.buyerFullAddress ?? '—'}</td>
                            <td className="px-4 py-2.5 text-purple-100 max-w-[180px] truncate" title={o.sellerName ?? ''}>{o.sellerName ?? '—'}</td>
                            <td className="px-4 py-2.5 text-purple-100 text-[11px] tabular-nums whitespace-nowrap">{o.sellerPhone ?? '—'}</td>
                            <td className="px-4 py-2.5 text-purple-100 text-[11px] whitespace-nowrap">{formatDateTime(o.statusMarkedTime)}</td>
                            <td className="px-4 py-2.5 text-purple-100 text-[11px] whitespace-nowrap" title={o.statusDurationSec != null ? `${o.statusDurationSec}s` : ''}>{formatDuration(o.statusDurationSec)}</td>
                            <td className="px-4 py-2.5 text-orange-300 text-[11px] whitespace-nowrap">{formatDateTime(o.refundInitiatedTime)}</td>
                            <td className="px-4 py-2.5 text-emerald-300 text-[11px] whitespace-nowrap">{formatDateTime(o.refundCompletedTime)}</td>
                            <td className="px-4 py-2.5 text-right text-emerald-300 font-semibold tabular-nums">{o.refundAmount != null ? fmtFull(o.refundAmount) : '—'}</td>
                            <td className="px-4 py-2.5 text-rose-300 text-[11px] max-w-[260px] whitespace-normal" title={o.rejectReason ?? ''}>{o.rejectReason ?? '—'}</td>
                            <td className="px-4 py-2.5 text-rose-300 text-[11px] whitespace-nowrap">{o.rejectedBy ?? '—'}</td>
                            <td className="px-4 py-2.5 text-rose-300 text-[11px] max-w-[260px] whitespace-normal" title={o.reasonAddedByBadhoTeam ?? ''}>{o.reasonAddedByBadhoTeam ?? '—'}</td>
                            <td className="px-4 py-2.5 text-purple-100 text-[11px] whitespace-nowrap">{formatDateTime(o.paymentDate)}</td>
                            <td className="px-4 py-2.5 text-purple-100 text-[11px] whitespace-nowrap">{o.paymentEvent ?? '—'}</td>
                          </tr>
                        ))}
                        {marginDayData.length === 0 && (
                          <tr><td colSpan={36} className="px-4 py-8 text-center text-purple-300/70">No orders for this day.</td></tr>
                        )}
                      </tbody>
                      {marginDayData.length > 0 && marginDayTotals && (
                        <tfoot className="sticky bottom-0">
                          <tr className="border-t-2 border-fuchsia-400/30 bg-slate-900 font-semibold">
                            <td className="px-4 py-3 text-purple-100">Total · {marginDayData.length} orders</td>
                            <td className="px-4 py-3 text-right text-purple-100 tabular-nums">{fmtFull(marginDayTotals.poAmount)}</td>
                            <td></td>
                            <td className="px-4 py-3 text-right text-emerald-300 tabular-nums">{fmtFull(marginDayTotals.marginRs)}</td>
                            <td className="px-4 py-3 text-right text-amber-300 tabular-nums">{fmtFull(marginDayTotals.operationalCostRs)}</td>
                            <td className={`px-4 py-3 text-right tabular-nums ${marginDayTotals.profitAndLossRs >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{fmtFull(marginDayTotals.profitAndLossRs)}</td>
                            <td></td>
                            <td className="px-4 py-3 text-right text-purple-200/80 tabular-nums">{fmtFull(marginDayTotals.couponRs)}</td>
                            <td className="px-4 py-3 text-right text-purple-200/80 tabular-nums">{fmtFull(marginDayTotals.badhoPaymentDiscountRs)}</td>
                            <td className="px-4 py-3 text-right text-purple-200/80 tabular-nums">{fmtFull(marginDayTotals.rewardRs)}</td>
                            <td className="px-4 py-3 text-right text-purple-200/80 tabular-nums">{fmtFull(marginDayTotals.deliveryChargeRs)}</td>
                            <td className="px-4 py-3 text-right text-sky-300 tabular-nums">{fmtFull(marginDayData.reduce((s, o) => s + (o.dbDeliveryChargeRs ?? 0), 0))}</td>
                            <td className="px-4 py-3 text-right text-rose-300 tabular-nums">{fmtFull(marginDayTotals.rtoChargeRs)}</td>
                            <td colSpan={23}></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Alert sub-tabs: SLA Breach vs Order Anomalies */}
        {activeTab === 'alert' && (
          <div className="mb-5 flex gap-1 p-1 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl w-fit">
            {([
              { key: 'sla', label: 'SLA Breach' },
              { key: 'anomalies', label: 'Order Anomalies' },
            ] as const).map((st) => {
              const active = alertSubTab === st.key;
              return (
                <button
                  key={st.key}
                  onClick={() => setAlertSubTab(st.key)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-300 ${
                    active
                      ? 'bg-gradient-to-r from-rose-500 via-red-500 to-orange-500 text-white shadow-[0_0_24px_rgba(244,63,94,0.55),inset_0_0_18px_rgba(251,113,133,0.4)]'
                      : 'text-purple-200 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {st.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Brand-wise SLA breach pivot — rows = seller, columns = payment category */}
        {activeTab === 'alert' && alertSubTab === 'sla' && (
          <div className="relative bg-gradient-to-br from-rose-950/40 via-slate-900/30 to-amber-950/30 backdrop-blur-xl border-2 border-rose-500/40 rounded-2xl overflow-hidden shadow-[0_0_60px_rgba(244,63,94,0.25),inset_0_0_30px_rgba(244,63,94,0.05)]">
            {/* Animated alert stripe across the top */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 via-amber-400 to-rose-500 bg-[length:200%_100%] animate-stripe-flow" />

            <div className="px-8 py-6 border-b border-rose-500/30 bg-gradient-to-r from-rose-500/15 via-red-500/10 to-amber-500/10 flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-start gap-4">
                <div className="relative shrink-0 mt-1">
                  <div className="absolute inset-0 rounded-full bg-rose-500/40 animate-ping" />
                  <div className="relative w-11 h-11 rounded-full bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center shadow-[0_0_20px_rgba(244,63,94,0.6)]">
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="animate-bell-ring"
                      aria-hidden="true"
                    >
                      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                    </svg>
                  </div>
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-rose-200 via-amber-200 to-rose-200 flex items-center gap-2">
                    Brand-wise SLA Breach
                    {alertBrandData && alertBrandData.grandTotal.count > 0 && (
                      <span className="px-2.5 py-0.5 rounded-full bg-rose-500/30 border border-rose-400/50 text-rose-100 text-xs font-bold tracking-wide uppercase">
                        ⚠ Action needed
                      </span>
                    )}
                  </h2>
                  <p className="text-rose-200/80 text-sm mt-1">
                    Brands × payment category · click any cell to see those PENDING orders
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {queryBtn('slaAlerts', 'Brand-wise SLA Breach')}
                <input
                  type="text"
                  value={alertBrandSearch}
                  onChange={(e) => setAlertBrandSearch(e.target.value)}
                  placeholder="Search seller…"
                  className="px-3 py-2 text-sm bg-white/10 border border-rose-400/40 text-white placeholder-rose-200/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-400 w-56"
                />
                <button
                  onClick={fetchAlertBrand}
                  disabled={alertBrandLoading}
                  className="px-4 py-2 rounded-lg bg-rose-500/30 hover:bg-rose-500/50 border border-rose-400/60 text-rose-100 hover:text-white text-sm font-semibold disabled:opacity-40 transition-all"
                >
                  {alertBrandLoading ? 'Refreshing…' : '↻ Refresh'}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              {alertBrandLoading && !alertBrandData ? (
                <div className="px-8 py-16 text-center">
                  <div className="inline-block w-8 h-8 rounded-full border-2 border-fuchsia-500/30 border-t-fuchsia-500 animate-spin mb-3" />
                  <p className="text-purple-300">Loading brand-wise breakdown…</p>
                </div>
              ) : alertBrandError ? (
                <div className="px-8 py-12 text-center text-rose-300">Error: {alertBrandError}</div>
              ) : !alertBrandData || alertBrandData.data.length === 0 ? (
                <div className="px-8 py-12 text-center text-purple-300">No brand-wise SLA breaches right now.</div>
              ) : (() => {
                const q = alertBrandSearch.trim().toLowerCase();
                const filteredRows = q
                  ? alertBrandData.data.filter((r) =>
                      r.brand.toLowerCase().includes(q)
                    )
                  : alertBrandData.data;
                const catColorBg: Record<string, string> = {
                  'Fully_Paid':     'bg-emerald-500/10',
                  'Partially_Paid': 'bg-amber-500/10',
                  'COD':            'bg-cyan-500/10',
                  'Other':          'bg-purple-500/10',
                };
                const catColorText: Record<string, string> = {
                  'Fully_Paid':     'text-emerald-200',
                  'Partially_Paid': 'text-amber-200',
                  'COD':            'text-cyan-200',
                  'Other':          'text-purple-200',
                };
                return (
                  <table className="w-full text-sm">
                    <thead className="bg-white/5 border-b border-white/10">
                      <tr>
                        <th
                          rowSpan={2}
                          className="px-4 py-3 text-left text-xs font-semibold text-purple-200 uppercase tracking-wide sticky left-0 bg-slate-900/80 backdrop-blur z-10 border-r border-white/10 min-w-[280px]"
                        >
                          Brand
                        </th>
                        {alertBrandData.categories.map((c) => (
                          <th
                            key={c}
                            colSpan={2}
                            className={`px-2 py-2 text-center text-xs font-semibold border-r border-white/10 ${catColorText[c]} ${catColorBg[c]}`}
                          >
                            {c}
                          </th>
                        ))}
                        <th colSpan={2} className="px-2 py-2 text-center text-xs font-bold text-purple-100 bg-purple-500/20">
                          Total
                        </th>
                      </tr>
                      <tr className="bg-white/5 border-b border-white/10">
                        {alertBrandData.categories.map((c) => (
                          <Fragment key={c}>
                            <th className={`px-2 py-2 text-right text-[10px] font-medium text-purple-300 ${catColorBg[c]}`}>Count</th>
                            <th className={`px-2 py-2 text-right text-[10px] font-medium text-purple-300 border-r border-white/10 ${catColorBg[c]}`}>Amount</th>
                          </Fragment>
                        ))}
                        <th className="px-2 py-2 text-right text-[10px] font-medium text-purple-100 bg-purple-500/20">Count</th>
                        <th className="px-2 py-2 text-right text-[10px] font-medium text-purple-100 bg-purple-500/20 border-r border-white/10">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row) => (
                        <tr key={row.brand} className="border-b border-white/5 hover:bg-fuchsia-500/10 group">
                          <td className="px-4 py-2.5 sticky left-0 bg-slate-900/80 backdrop-blur z-10 border-r border-white/10 group-hover:bg-slate-800/90">
                            <span className="text-white font-semibold text-sm leading-tight">
                              {row.brand}
                            </span>
                          </td>
                          {alertBrandData.categories.map((c) => {
                            const cell = row.cells[c];
                            const has = cell.count > 0;
                            return (
                              <Fragment key={c}>
                                <td
                                  onClick={() => has && openAlertModal(c, row.brand)}
                                  className={`group/cell px-2 py-2.5 text-right text-purple-100 tabular-nums ${catColorBg[c]} ${has ? 'cursor-pointer' : ''}`}
                                >
                                  {has ? (
                                    <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.35] group-hover/cell:font-extrabold group-hover/cell:text-white group-hover/cell:[text-shadow:0_0_14px_rgba(217,70,239,0.95),0_0_28px_rgba(168,85,247,0.6)]">
                                      {cell.count.toLocaleString()}
                                    </span>
                                  ) : (
                                    <span className="text-purple-500/30">—</span>
                                  )}
                                </td>
                                <td className={`group/cell px-2 py-2.5 text-right text-purple-200/90 tabular-nums border-r border-white/10 ${catColorBg[c]}`}>
                                  {has ? (
                                    <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.25] group-hover/cell:font-bold group-hover/cell:text-fuchsia-100">
                                      {formatAmount(cell.amount)}
                                    </span>
                                  ) : (
                                    <span className="text-purple-500/30">—</span>
                                  )}
                                </td>
                              </Fragment>
                            );
                          })}
                          <td
                            onClick={() => row.total.count > 0 && openAlertModal('all', row.brand)}
                            className={`group/cell px-2 py-2.5 text-right font-bold text-white tabular-nums bg-purple-500/15 ${row.total.count > 0 ? 'cursor-pointer' : ''}`}
                          >
                            <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.35] group-hover/cell:[text-shadow:0_0_16px_rgba(217,70,239,1),0_0_32px_rgba(168,85,247,0.7)]">
                              {row.total.count.toLocaleString()}
                            </span>
                          </td>
                          <td className="group/cell px-2 py-2.5 text-right font-bold text-fuchsia-300 tabular-nums bg-purple-500/15 border-r border-white/10">
                            <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.25] group-hover/cell:text-fuchsia-100">
                              {formatAmount(row.total.amount)}
                            </span>
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-gradient-to-r from-fuchsia-500/20 via-purple-500/20 to-indigo-500/20 border-t-2 border-fuchsia-500/50 font-bold">
                        <td className="px-4 py-3 sticky left-0 bg-slate-900/95 z-10 border-r border-white/10 text-white">
                          Grand Total
                        </td>
                        {alertBrandData.categories.map((c) => {
                          const t = alertBrandData.totalsByCategory[c];
                          return (
                            <Fragment key={c}>
                              <td
                                onClick={() => t.count > 0 && openAlertModal(c)}
                                className={`group/cell px-2 py-3 text-right text-white tabular-nums ${catColorBg[c]} ${t.count > 0 ? 'cursor-pointer' : ''}`}
                              >
                                {t.count > 0 ? (
                                  <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.35]">
                                    {t.count.toLocaleString()}
                                  </span>
                                ) : '—'}
                              </td>
                              <td className={`px-2 py-3 text-right text-fuchsia-200 tabular-nums border-r border-white/10 ${catColorBg[c]}`}>
                                {t.count > 0 ? formatAmount(t.amount) : '—'}
                              </td>
                            </Fragment>
                          );
                        })}
                        <td
                          onClick={() => alertBrandData.grandTotal.count > 0 && openAlertModal('all')}
                          className="group/cell px-2 py-3 text-right text-white tabular-nums bg-purple-500/25 cursor-pointer"
                        >
                          <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.35]">
                            {alertBrandData.grandTotal.count.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-right text-fuchsia-200 tabular-nums bg-purple-500/25 border-r border-white/10">
                          {formatAmount(alertBrandData.grandTotal.amount)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                );
              })()}
            </div>
            {alertBrandData && (
              <div className="px-8 py-3 border-t border-white/10 bg-white/5 text-xs text-purple-300/70 flex items-center justify-between">
                <span>
                  {alertBrandData.data.length} brands · {alertBrandData.grandTotal.count.toLocaleString()} total breached orders
                </span>
                <span>Last updated: {new Date(alertBrandData.grandTotal && Date.now()).toLocaleString()}</span>
              </div>
            )}
          </div>
        )}

        {/* Brand-wise InProgress Aging — INPROGRESS orders stuck > 1 day (Sundays excluded) */}
        {activeTab === 'alert' && alertSubTab === 'sla' && (
          <div className="mt-6 relative bg-gradient-to-br from-amber-950/40 via-slate-900/30 to-orange-950/30 backdrop-blur-xl border-2 border-amber-500/40 rounded-2xl overflow-hidden shadow-[0_0_60px_rgba(245,158,11,0.22),inset_0_0_30px_rgba(245,158,11,0.05)]">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-400 to-amber-500 bg-[length:200%_100%] animate-stripe-flow" />
            <div className="px-8 py-6 border-b border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-rose-500/10 flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-start gap-4">
                <div className="relative shrink-0 mt-1">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.6)]">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-orange-200 to-amber-200">
                    Alert Delhivery SLA Breach
                  </h2>
                  <p className="text-amber-200/80 text-sm mt-1">
                    INPROGRESS POs stuck &gt; 1 working day (Sundays excluded) · click any cell to drill down
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {queryBtn('aging', 'InProgress Aging — Delhivery SLA Breach')}
                {/* Geographic Group By (seller address) — nests the breach rows by State/District/City/Pincode */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setAgingGroupOpen((o) => !o)}
                    className={`px-3 py-2 text-sm font-semibold rounded-lg border flex items-center gap-2 transition-all ${
                      agingGroupDims.length
                        ? 'bg-amber-500/30 border-amber-400/60 text-amber-50 ring-1 ring-amber-400/40'
                        : 'bg-white/10 border-amber-400/40 text-amber-100 hover:bg-white/15'
                    }`}
                  >
                    <span>Group By{agingGroupDims.length ? ` · ${AGING_GEO_ORDER.filter((d) => agingGroupDims.includes(d)).map((d) => AGING_GEO_OPTIONS.find((o) => o.dim === d)!.label.replace(' Wise', '')).join(' › ')}` : ''}</span>
                    <span className="text-[10px] opacity-70">▾</span>
                  </button>
                  {agingGroupOpen && (
                    <div className="absolute right-0 z-40 mt-1 w-60 bg-slate-900 border border-amber-400/30 rounded-xl shadow-[0_10px_40px_-5px_rgba(0,0,0,0.6)] overflow-hidden">
                      <div className="px-3 py-2 border-b border-white/10 text-[11px] font-semibold text-amber-200 uppercase tracking-wide">Group By · pick one or more</div>
                      <button
                        type="button"
                        onClick={() => { setAgingGroupDims([]); setAgingCollapsed(new Set()); }}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-white/5 ${agingGroupDims.length === 0 ? 'text-amber-300 font-semibold' : 'text-purple-200'}`}
                      >
                        <span className={`w-3.5 h-3.5 rounded-full border ${agingGroupDims.length === 0 ? 'border-amber-400 bg-amber-400' : 'border-white/30'}`} />
                        Seller Wise <span className="text-purple-400/70 text-xs">(no grouping)</span>
                      </button>
                      <div className="border-t border-white/10 py-1">
                        {AGING_GEO_OPTIONS.map((o) => {
                          const checked = agingGroupDims.includes(o.dim);
                          return (
                            <button
                              key={o.dim}
                              type="button"
                              onClick={() => { setAgingGroupDims((prev) => prev.includes(o.dim) ? prev.filter((x) => x !== o.dim) : [...prev, o.dim]); setAgingCollapsed(new Set()); }}
                              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-white/5 ${checked ? 'text-amber-100' : 'text-purple-200'}`}
                            >
                              <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[9px] ${checked ? 'border-amber-400 bg-amber-400 text-slate-900' : 'border-white/30'}`}>{checked ? '✓' : ''}</span>
                              {o.label}
                            </button>
                          );
                        })}
                      </div>
                      <div className="px-3 py-2 border-t border-white/10 text-[10px] text-purple-400/70">Nests in order: State › District › City › Pincode</div>
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  value={agingSearch}
                  onChange={(e) => setAgingSearch(e.target.value)}
                  placeholder="Search seller…"
                  className="px-3 py-2 text-sm bg-white/10 border border-amber-400/40 text-white placeholder-amber-200/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 w-56"
                />
                <button
                  onClick={fetchAgingByBrand}
                  disabled={agingLoading}
                  className="px-4 py-2 rounded-lg bg-amber-500/30 hover:bg-amber-500/50 border border-amber-400/60 text-amber-100 hover:text-white text-sm font-semibold disabled:opacity-40 transition-all"
                >
                  {agingLoading ? 'Refreshing…' : '↻ Refresh'}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              {agingLoading && !agingData ? (
                <div className="px-8 py-16 text-center">
                  <div className="inline-block w-8 h-8 rounded-full border-2 border-amber-500/30 border-t-amber-500 animate-spin mb-3" />
                  <p className="text-amber-200">Loading InProgress aging…</p>
                </div>
              ) : agingError ? (
                <div className="px-8 py-12 text-center text-rose-300">Error: {agingError}</div>
              ) : !agingData || agingData.data.length === 0 ? (
                <div className="px-8 py-12 text-center text-amber-200/80">No InProgress aging beyond 1 day right now.</div>
              ) : (() => {
                const q = agingSearch.trim().toLowerCase();
                const filtered = q
                  ? agingData.data.filter((r) =>
                      r.sellerBusinessName.toLowerCase().includes(q) ||
                      r.brand.toLowerCase().includes(q) ||
                      (r.sellerPhone || '').toLowerCase().includes(q) ||
                      (r.sellerFullAddress || '').toLowerCase().includes(q)
                    )
                  : agingData.data;
                const bucketBg: Record<string, string> = {
                  '1-2 days': 'bg-amber-500/10',
                  '2-3 days': 'bg-orange-500/10',
                  '3+ days':  'bg-rose-500/15',
                };
                const bucketText: Record<string, string> = {
                  '1-2 days': 'text-amber-200',
                  '2-3 days': 'text-orange-200',
                  '3+ days':  'text-rose-200',
                };
                // Build a flat render list — geo group nodes (collapsible) + seller leaves —
                // by nesting the seller rows under the selected address dimensions in order.
                const geoLabel: Record<AgingGeoDim, string> = { sellerState: 'State', sellerDistrict: 'District', sellerCity: 'City', sellerPincode: 'Pincode' };
                const activeDims = AGING_GEO_ORDER.filter((d) => agingGroupDims.includes(d));
                interface AgingRenderRow { kind: 'group' | 'seller'; key: string; depth: number; label: string; geoTag?: string; poCount: number; orderAmount: number; buckets: Record<string, number>; seller?: AgingRow; collapsed?: boolean }
                const rowsOut: AgingRenderRow[] = [];
                const aggRows = (rs: AgingRow[]) => rs.reduce((a, r) => {
                  a.poCount += r.poCount; a.orderAmount += r.orderAmount;
                  AGING_BUCKETS.forEach((b) => { a.buckets[b] += r.buckets[b]; });
                  return a;
                }, { poCount: 0, orderAmount: 0, buckets: { '1-2 days': 0, '2-3 days': 0, '3+ days': 0 } as Record<string, number> });
                const buildAging = (rs: AgingRow[], di: number, parentKey: string, depth: number): void => {
                  if (di >= activeDims.length) {
                    [...rs].sort((a, b) => b.poCount - a.poCount).forEach((r) => {
                      rowsOut.push({ kind: 'seller', key: `${parentKey}|s:${r.sellerBusinessName}`, depth, label: r.sellerBusinessName, poCount: r.poCount, orderAmount: r.orderAmount, buckets: r.buckets, seller: r });
                    });
                    return;
                  }
                  const dim = activeDims[di];
                  const groups = new Map<string, AgingRow[]>();
                  rs.forEach((r) => { const v = (r[dim] as string | null) || '(unknown)'; if (!groups.has(v)) groups.set(v, []); groups.get(v)!.push(r); });
                  [...groups.entries()].sort((a, b) => b[1].reduce((s, r) => s + r.poCount, 0) - a[1].reduce((s, r) => s + r.poCount, 0)).forEach(([v, sub]) => {
                    const key = `${parentKey}|${dim}:${v}`;
                    const ag = aggRows(sub);
                    const collapsed = agingCollapsed.has(key);
                    rowsOut.push({ kind: 'group', key, depth, label: v, geoTag: geoLabel[dim], poCount: ag.poCount, orderAmount: ag.orderAmount, buckets: ag.buckets, collapsed });
                    if (!collapsed) buildAging(sub, di + 1, key, depth + 1);
                  });
                };
                buildAging(filtered, 0, 'root', 0);
                const toggleCollapse = (key: string) => setAgingCollapsed((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
                return (
                  <table className="w-full text-sm">
                    <thead className="bg-white/5 border-b border-white/10">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-amber-200 uppercase tracking-wide sticky left-0 bg-slate-900/80 backdrop-blur z-10 border-r border-white/10 min-w-[280px]">
                          Seller (Brand)
                        </th>
                        <th className="px-3 py-3 text-right text-xs font-semibold text-amber-200 uppercase tracking-wide bg-white/[0.03]">PO Count</th>
                        <th className="px-3 py-3 text-right text-xs font-semibold text-amber-200 uppercase tracking-wide bg-white/[0.03] border-r border-white/10">Order Amount</th>
                        {AGING_BUCKETS.map((b) => (
                          <th key={b} className={`px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide border-r border-white/10 ${bucketText[b]} ${bucketBg[b]}`}>
                            {b}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rowsOut.map((rr) => rr.kind === 'group' ? (
                        <tr key={rr.key} className="border-b border-white/5 bg-amber-500/[0.06] hover:bg-amber-500/[0.12]">
                          <td
                            onClick={() => toggleCollapse(rr.key)}
                            style={{ paddingLeft: rr.depth * 18 + 16 }}
                            className="py-2.5 pr-4 sticky left-0 bg-slate-900/85 backdrop-blur z-10 border-r border-white/10 cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <span className={`inline-block w-3 text-amber-300 transition-transform ${rr.collapsed ? '' : 'rotate-90'}`}>▸</span>
                              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-300/70 bg-amber-500/15 px-1.5 py-0.5 rounded">{rr.geoTag}</span>
                              <span className="text-white font-semibold text-sm leading-tight">{rr.label}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right text-white font-semibold tabular-nums bg-white/[0.05]">{rr.poCount.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right text-amber-200 font-semibold tabular-nums bg-white/[0.05] border-r border-white/10">{formatAmount(rr.orderAmount)}</td>
                          {AGING_BUCKETS.map((b) => {
                            const v = rr.buckets[b];
                            return (
                              <td key={b} className={`px-3 py-2.5 text-right tabular-nums border-r border-white/10 ${bucketBg[b]}`}>
                                {v > 0 ? <span className={`font-semibold ${bucketText[b]}`}>{v.toLocaleString()}</span> : <span className="text-amber-500/30">—</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ) : (() => {
                        const row = rr.seller!;
                        return (
                        <tr key={rr.key} className="border-b border-white/5 hover:bg-amber-500/10 group">
                          <td
                            onClick={() => row.poCount > 0 && openAlertModal('all', row.sellerBusinessName, 'aging')}
                            style={{ paddingLeft: rr.depth * 18 + 16 }}
                            className="py-2.5 pr-4 sticky left-0 bg-slate-900/80 backdrop-blur z-10 border-r border-white/10 group-hover:bg-slate-800/90 cursor-pointer"
                          >
                            <div className="text-white font-semibold text-sm leading-tight">{row.sellerBusinessName}</div>
                            <div className="text-[10px] text-purple-300 tabular-nums leading-tight">
                              {row.sellerPhone ? (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); openSellerModal({ phone: row.sellerPhone, businessName: row.sellerBusinessName }); }}
                                  className="hover:text-fuchsia-300 hover:underline cursor-pointer"
                                  title="View seller details"
                                >
                                  {row.sellerPhone}
                                </button>
                              ) : '—'}
                              {' · '}
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openSellerModal({ phone: row.sellerPhone, businessName: row.sellerBusinessName }); }}
                                className="text-fuchsia-300 hover:text-fuchsia-200 hover:underline cursor-pointer"
                                title="View seller details"
                              >
                                {row.brand}
                              </button>
                            </div>
                            {row.sellerFullAddress && (
                              <div className="text-[10px] text-amber-200/60 leading-tight mt-0.5 max-w-[420px]" title={row.sellerFullAddress}>📍 {row.sellerFullAddress}</div>
                            )}
                          </td>
                          <td
                            onClick={() => row.poCount > 0 && openAlertModal('all', row.sellerBusinessName, 'aging')}
                            className={`group/cell px-3 py-2.5 text-right text-white tabular-nums bg-white/[0.03] ${row.poCount > 0 ? 'cursor-pointer' : ''}`}
                          >
                            <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.25] group-hover/cell:font-extrabold group-hover/cell:text-white group-hover/cell:[text-shadow:0_0_14px_rgba(251,146,60,0.95),0_0_28px_rgba(245,158,11,0.6)]">
                              {row.poCount.toLocaleString()}
                            </span>
                          </td>
                          <td
                            onClick={() => row.poCount > 0 && openAlertModal('all', row.sellerBusinessName, 'aging')}
                            className={`group/cell px-3 py-2.5 text-right text-amber-200 tabular-nums bg-white/[0.03] border-r border-white/10 ${row.poCount > 0 ? 'cursor-pointer' : ''}`}
                          >
                            <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.25] group-hover/cell:font-bold group-hover/cell:text-amber-100">
                              {formatAmount(row.orderAmount)}
                            </span>
                          </td>
                          {AGING_BUCKETS.map((b) => {
                            const v = row.buckets[b];
                            const has = v > 0;
                            return (
                              <td
                                key={b}
                                onClick={() => has && openAlertModal(b, row.sellerBusinessName, 'aging')}
                                className={`group/cell px-3 py-2.5 text-right tabular-nums border-r border-white/10 ${bucketBg[b]} ${has ? 'cursor-pointer' : ''}`}
                              >
                                {has ? (
                                  <span className={`inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.35] group-hover/cell:font-extrabold ${bucketText[b]} group-hover/cell:text-white group-hover/cell:[text-shadow:0_0_14px_rgba(251,146,60,0.95),0_0_28px_rgba(245,158,11,0.6)]`}>
                                    {v.toLocaleString()}
                                  </span>
                                ) : (
                                  <span className="text-amber-500/30">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                        );
                      })())}
                      <tr className="bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-rose-500/20 border-t-2 border-amber-500/50 font-bold">
                        <td
                          onClick={() => agingData.grand.poCount > 0 && openAlertModal('all', undefined, 'aging')}
                          className={`px-4 py-3 sticky left-0 bg-slate-900/95 z-10 border-r border-white/10 text-white ${agingData.grand.poCount > 0 ? 'cursor-pointer' : ''}`}
                        >
                          Grand Total
                        </td>
                        <td
                          onClick={() => agingData.grand.poCount > 0 && openAlertModal('all', undefined, 'aging')}
                          className={`group/cell px-3 py-3 text-right text-white tabular-nums ${agingData.grand.poCount > 0 ? 'cursor-pointer' : ''}`}
                        >
                          <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.25]">
                            {agingData.grand.poCount.toLocaleString()}
                          </span>
                        </td>
                        <td
                          onClick={() => agingData.grand.poCount > 0 && openAlertModal('all', undefined, 'aging')}
                          className={`group/cell px-3 py-3 text-right text-amber-200 tabular-nums border-r border-white/10 ${agingData.grand.poCount > 0 ? 'cursor-pointer' : ''}`}
                        >
                          <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.25] group-hover/cell:text-amber-100">
                            {formatAmount(agingData.grand.orderAmount)}
                          </span>
                        </td>
                        {AGING_BUCKETS.map((b) => {
                          const t = agingData.grand.buckets[b] || 0;
                          return (
                            <td
                              key={b}
                              onClick={() => t > 0 && openAlertModal(b, undefined, 'aging')}
                              className={`group/cell px-3 py-3 text-right text-white tabular-nums border-r border-white/10 ${bucketBg[b]} ${t > 0 ? 'cursor-pointer' : ''}`}
                            >
                              {t > 0 ? (
                                <span className="inline-block transition-all duration-300 ease-out origin-right group-hover/cell:scale-[1.35]">
                                  {t.toLocaleString()}
                                </span>
                              ) : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                );
              })()}
            </div>
            {agingData && (
              <div className="px-8 py-3 border-t border-white/10 bg-white/5 text-xs text-amber-200/70 flex items-center justify-between">
                <span>
                  {agingData.data.length} sellers · {agingData.grand.poCount.toLocaleString()} stuck orders
                </span>
                <span>Last updated: {new Date().toLocaleString()}</span>
              </div>
            )}
          </div>
        )}


        {/* Order Anomalies — relocated here as the Alert > Order Anomalies sub-tab */}
        {activeTab === 'alert' && alertSubTab === 'anomalies' && (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden mb-8 transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25),inset_0_0_30px_rgba(168,85,247,0.12)]">
          <div className="px-8 py-6 border-b border-white/10 bg-white/5 flex items-start justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white">Order Anomalies</h2>
              <p className="text-purple-300 text-sm mt-1">
                Share of order statuses per day (100% stacked) — last 30 days
              </p>
              <div className="mt-3">{queryBtn('anomalies', 'Order Anomalies')}</div>
            </div>
            {/* Legend = status multiselect. Click a chip to toggle that status in the chart.
                Listed top→bottom (COMPLETED-first) — the reverse of the stack order. */}
            <div className="flex items-center gap-2 flex-wrap">
              {[...ANOMALY_STATUS_META].reverse().map((s) => {
                const selected = selectedAnomalyStatuses.includes(s.key);
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => toggleAnomalyStatus(s.key)}
                    aria-pressed={selected}
                    title={selected ? `Hide ${s.key}` : `Show ${s.key}`}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
                      selected
                        ? 'bg-slate-900/70 border-white/10 hover:border-fuchsia-400/50'
                        : 'bg-slate-900/30 border-white/5 opacity-40 hover:opacity-70'
                    }`}
                  >
                    <span
                      className="inline-block w-3 h-3 rounded-sm"
                      style={{ background: selected ? s.color : 'transparent', border: `1.5px solid ${s.color}` }}
                    />
                    <span className="text-xs font-bold text-white tracking-wide">{s.key}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chart */}
          <div className="p-6">
            {anomaliesLoading || !anomaliesData ? (
              <div className="h-[360px] flex items-center justify-center text-purple-300">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-fuchsia-500/30 border-t-fuchsia-500 animate-spin" />
                  Loading anomalies…
                </div>
              </div>
            ) : anomaliesData.length === 0 ? (
              <div className="h-[360px] flex items-center justify-center text-purple-300">No data in this range</div>
            ) : selectedAnomalyStatuses.length === 0 ? (
              <div className="h-[360px] flex items-center justify-center text-purple-300">Select at least one status to display</div>
            ) : (
              <ResponsiveContainer width="100%" height={420}>
                <BarChart
                  data={anomaliesData}
                  margin={{ top: 16, right: 16, left: 8, bottom: 8 }}
                  stackOffset="expand"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: 'rgba(216,180,254,0.7)', fontSize: 11 }}
                    tickFormatter={(d: string) => {
                      const [, m, dd] = d.split('-');
                      return `${dd}/${m}`;
                    }}
                    minTickGap={4}
                    interval={0}
                  />
                  <YAxis
                    tick={{ fill: 'rgba(216,180,254,0.7)', fontSize: 11 }}
                    tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                    domain={[0, 1]}
                    width={50}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(15,23,42,0.95)',
                      border: '1px solid rgba(217,70,239,0.4)',
                      borderRadius: 10,
                      color: '#fff',
                      fontSize: 12,
                    }}
                    labelStyle={{ color: '#f0abfc', fontWeight: 700 }}
                    labelFormatter={(d) => `Date: ${d}`}
                    formatter={(value, name, props) => {
                      const n = typeof value === 'number' ? value : Number(value ?? 0);
                      const row = props && (props as { payload?: Record<string, number> }).payload;
                      // Total reflects only the currently selected statuses so the
                      // percentage matches what the 100%-stacked bar actually shows.
                      const total = row
                        ? selectedAnomalyStatuses.reduce((sum, st) => sum + Number(row[st] || 0), 0)
                        : 0;
                      const pct = total > 0 ? ((n / total) * 100).toFixed(1) : '0.0';
                      return [`${n} (${pct}%)`, String(name)];
                    }}
                  />
                  {ANOMALY_STATUS_META.filter((s) => selectedAnomalyStatuses.includes(s.key)).map((s) => (
                    <Bar
                      key={s.key}
                      dataKey={s.key}
                      stackId="status"
                      fill={s.color}
                      name={s.key}
                      cursor="pointer"
                      onClick={(e: unknown) => openAnomalyDrill(s.key, e)}
                    >
                      <LabelList
                        dataKey={s.key}
                        position="center"
                        formatter={(v: unknown) => {
                          const n = typeof v === 'number' ? v : Number(v ?? 0);
                          return n > 0 ? String(n) : '';
                        }}
                        style={{ fill: s.labelFill, fontSize: 11, fontWeight: 700, pointerEvents: 'none' }}
                      />
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        )}

        {/* MonthWiseOrder cell drill — list the POs behind a clicked stage / totals cell */}
        {funnelDrill && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md"
            onClick={() => setFunnelDrill(null)}
          >
            <div
              className="relative bg-slate-900 text-purple-50 rounded-2xl w-[96vw] max-w-5xl max-h-[90vh] flex flex-col overflow-hidden shadow-[0_30px_80px_-20px_rgba(168,85,247,0.45)] border border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-white/10">
                <div>
                  <h3 className="text-base font-bold text-white">{funnelDrill.title}</h3>
                  <p className="text-xs text-purple-300/70 mt-0.5">
                    {funnelDrillLoading
                      ? 'Loading orders…'
                      : funnelDrillRows
                      ? `${funnelDrillRows.length.toLocaleString('en-IN')}${funnelDrillTruncated ? '+ (capped at 3,000)' : ''} orders · ₹${funnelDrillRows.reduce((a, r) => a + r.amount, 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                      : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={funnelDrillSearch}
                    onChange={(e) => setFunnelDrillSearch(e.target.value)}
                    placeholder="Search PO / buyer / seller / status…"
                    className="px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-purple-100 placeholder-purple-300/40 focus:outline-none focus:border-fuchsia-400/50 w-64"
                  />
                  <button
                    onClick={() => setFunnelDrill(null)}
                    className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-purple-200 text-lg leading-none"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto">
                {funnelDrillLoading ? (
                  <div className="py-16 text-center text-purple-300 text-sm">Loading…</div>
                ) : funnelDrillError ? (
                  <div className="py-16 text-center text-rose-300 text-sm">Error: {funnelDrillError}</div>
                ) : !funnelDrillRows || funnelDrillRows.length === 0 ? (
                  <div className="py-16 text-center text-purple-300/70 text-sm">No orders.</div>
                ) : (() => {
                  const q = funnelDrillSearch.trim().toLowerCase();
                  const rows = q
                    ? funnelDrillRows.filter((r) =>
                        [r.poNumber, r.buyerBusinessName, r.sellerBusinessName, r.status]
                          .some((v) => (v || '').toString().toLowerCase().includes(q))
                      )
                    : funnelDrillRows;
                  return (
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-900/95 backdrop-blur text-purple-300 z-10">
                        <tr className="text-left">
                          <th className="px-4 py-2.5 font-semibold">Date</th>
                          <th className="px-4 py-2.5 font-semibold">PO #</th>
                          <th className="px-4 py-2.5 font-semibold">Buyer</th>
                          <th className="px-4 py-2.5 font-semibold">Seller</th>
                          <th className="px-4 py-2.5 font-semibold">Status</th>
                          <th className="px-4 py-2.5 font-semibold text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {rows.map((r) => (
                          <tr key={r.poNumber} className="hover:bg-white/5">
                            <td className="px-4 py-2 whitespace-nowrap text-purple-200/80">
                              {r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap">
                              <button
                                onClick={() => openPoItemsModal(r.poNumber)}
                                className="font-mono text-fuchsia-300 hover:text-fuchsia-200 hover:underline"
                              >
                                {r.poNumber}
                              </button>
                            </td>
                            <td className="px-4 py-2 max-w-[220px] truncate">
                              <button
                                onClick={() => openBuyerModal({ phone: r.buyerPhone, businessName: r.buyerBusinessName })}
                                className="text-sky-300 hover:text-sky-200 hover:underline text-left"
                                title={r.buyerBusinessName || ''}
                              >
                                {r.buyerBusinessName || '—'}
                              </button>
                            </td>
                            <td className="px-4 py-2 max-w-[220px] truncate text-purple-100" title={r.sellerBusinessName || ''}>
                              {r.sellerBusinessName || '—'}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/10 text-purple-100">{r.status}</span>
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-purple-50">₹{r.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
              {funnelDrillTruncated && (
                <div className="px-5 py-2 border-t border-white/10 text-[11px] text-amber-300/80">
                  Showing the most recent 3,000 orders — refine by stage/month for the full set.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Shared "View Query" modal — shows the SQL behind any section */}
        {queryModalState && (
          <QueryModal
            title={queryModalState.title}
            queries={queryModalState.queries}
            onClose={() => setQueryModalState(null)}
          />
        )}

        {/* Buyer Details Modal — opens when clicking a Buyer Business cell in any drill modal */}
        {buyerModalOpen && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md"
            onClick={closeBuyerModal}
          >
            <div
              className="relative bg-white text-slate-900 rounded-2xl w-[96vw] max-w-6xl max-h-[92vh] flex flex-col overflow-hidden shadow-[0_30px_80px_-20px_rgba(99,102,241,0.45)] border border-slate-200 animate-modal-scale"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="relative px-6 py-5 bg-gradient-to-br from-indigo-600 via-purple-600 to-fuchsia-600 text-white overflow-hidden">
                <div className="pointer-events-none absolute -top-16 -right-12 w-56 h-56 rounded-full bg-white/10 blur-2xl" />
                <div className="pointer-events-none absolute -bottom-24 left-1/4 w-52 h-52 rounded-full bg-fuchsia-300/20 blur-3xl" />
                <div className="relative flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="shrink-0 w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center text-xl font-black ring-1 ring-white/30">
                      {(buyerModalData?.businessName || buyerModalData?.name || buyerModalLookup || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.25em] text-white/70 font-semibold">Buyer Details</div>
                      <h3 className="text-xl font-extrabold truncate mt-0.5 leading-tight">
                        {buyerModalData?.businessName || buyerModalLookup || 'Loading…'}
                      </h3>
                      {buyerModalData && (buyerModalData.city || buyerModalData.state) && (
                        <div className="text-xs text-white/75 font-medium truncate mt-0.5">
                          {[buyerModalData.city, buyerModalData.state].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={closeBuyerModal}
                    className="shrink-0 w-9 h-9 rounded-xl bg-white/15 hover:bg-white/30 text-white text-xl leading-none transition-all hover:rotate-90"
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
              </header>
              <div className="flex-1 overflow-auto">
                {buyerModalLoading ? (
                  <div className="px-6 py-12 text-center text-slate-500">Loading buyer details…</div>
                ) : buyerModalError ? (
                  <div className="px-6 py-12 text-center text-rose-600">Error: {buyerModalError}</div>
                ) : !buyerModalData ? (
                  <div className="px-6 py-12 text-center text-slate-500">No data.</div>
                ) : (
                  <div className="grid lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
                    {/* LEFT — buyer profile */}
                    <aside className="p-6 space-y-5 bg-white lg:border-r border-slate-100">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-indigo-600 mb-2.5">Contact &amp; Tax</div>
                        <div className="grid grid-cols-2 gap-2.5">
                          {([
                            { label: 'Buyer Name',  value: buyerModalData.name,              wrap: true },
                            { label: 'Buyer ID',    value: buyerModalData.id,                mono: true, wrap: true },
                            { label: 'Phone',       value: buyerModalData.phone,             mono: true },
                            { label: 'Email',       value: buyerModalData.email,             mono: true, wrap: true },
                            { label: 'GST Number',  value: buyerModalData.gstNumber,         mono: true },
                            { label: 'PAN',         value: buyerModalData.businessPanNumber, mono: true },
                          ] as { label: string; value: string | null; mono?: boolean; wrap?: boolean }[]).map((f) => (
                            <div key={f.label} className={`rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 ${f.wrap ? 'col-span-2' : ''}`}>
                              <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">{f.label}</div>
                              <div className={`text-sm font-semibold text-slate-900 mt-0.5 break-words ${f.mono ? 'font-mono tabular-nums' : ''}`}>{f.value || <span className="text-slate-300">—</span>}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-indigo-600 mb-2.5">Location</div>
                        <div className="grid grid-cols-2 gap-2.5">
                          {([
                            { label: 'City',         value: buyerModalData.city },
                            { label: 'District',     value: buyerModalData.district },
                            { label: 'State',        value: buyerModalData.state },
                            { label: 'Pincode',      value: buyerModalData.pincode, mono: true },
                            { label: 'Full Address', value: buyerModalData.fullAddress, wrap: true },
                            { label: 'Landmark',     value: buyerModalData.landmark, wrap: true },
                          ] as { label: string; value: string | null; mono?: boolean; wrap?: boolean }[]).map((f) => (
                            <div key={f.label} className={`rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 ${f.wrap ? 'col-span-2' : ''}`}>
                              <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">{f.label}</div>
                              <div className={`text-sm font-semibold text-slate-900 mt-0.5 break-words ${f.mono ? 'font-mono tabular-nums' : ''}`}>{f.value || <span className="text-slate-300">—</span>}</div>
                            </div>
                          ))}
                        </div>
                        {(buyerModalData.longitude || buyerModalData.lattitude) && (
                          <a
                            href={`https://www.google.com/maps?q=${buyerModalData.lattitude},${buyerModalData.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-bold shadow-sm hover:shadow-md hover:scale-[1.02] transition-all"
                          >
                            📍 Open in Google Maps
                          </a>
                        )}
                      </div>
                    </aside>

                    {/* RIGHT — order history */}
                    <section className="p-6 space-y-5 bg-gradient-to-br from-indigo-50/50 via-white to-fuchsia-50/40">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[11px] uppercase tracking-[0.18em] font-bold text-fuchsia-600">Order Journey</div>
                        {buyerHistory && buyerHistory.summary.daysSinceLast != null && (
                          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                            buyerHistory.summary.daysSinceLast <= 30 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : buyerHistory.summary.daysSinceLast <= 90 ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}>
                            {buyerHistory.summary.daysSinceLast === 0 ? 'Ordered today' : `${buyerHistory.summary.daysSinceLast}d since last order`}
                          </span>
                        )}
                      </div>

                      {buyerHistoryLoading ? (
                        <div className="py-10 text-center text-sm text-slate-400">Loading order history…</div>
                      ) : buyerHistoryError ? (
                        <div className="py-10 text-center text-sm text-rose-500">History unavailable: {buyerHistoryError}</div>
                      ) : !buyerHistory || (buyerHistory.summary.totalOrders === 0 && buyerHistory.summary.draftCount === 0) ? (
                        <div className="py-10 text-center text-sm text-slate-400">No orders on record for this buyer.</div>
                      ) : (
                        <>
                          {buyerHistory.summary.totalOrders > 0 && (
                          <>
                          {/* Total + full status breakdown — every status, so the parts sum to the total */}
                          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
                            <div className="flex items-end justify-between gap-2 mb-3">
                              <div className="flex items-baseline gap-2">
                                <div className="text-4xl font-black tabular-nums leading-none text-slate-900">{buyerHistory.summary.totalOrders.toLocaleString('en-IN')}</div>
                                <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Total Orders Placed</div>
                              </div>
                              <div className="text-right">
                                <div className="text-2xl font-black tabular-nums leading-none text-indigo-600">{formatAmount(buyerHistory.summary.totalGmv)}</div>
                                <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mt-1">Total Value</div>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              {([
                                { label: 'Completed',   value: buyerHistory.summary.completed,   amount: buyerHistory.summary.completedGmv,   cls: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
                                { label: 'Pending',     value: buyerHistory.summary.pending,     amount: buyerHistory.summary.pendingGmv,     cls: 'text-slate-700',   bg: 'bg-slate-50 border-slate-200' },
                                { label: 'In Progress', value: buyerHistory.summary.inprogress,  amount: buyerHistory.summary.inprogressGmv,  cls: 'text-indigo-600',  bg: 'bg-indigo-50 border-indigo-200' },
                                { label: 'Dispatched',  value: buyerHistory.summary.dispatched,  amount: buyerHistory.summary.dispatchedGmv,  cls: 'text-sky-600',     bg: 'bg-sky-50 border-sky-200' },
                                { label: 'Rejected',    value: buyerHistory.summary.rejected,    amount: buyerHistory.summary.rejectedGmv,    cls: 'text-rose-600',    bg: 'bg-rose-50 border-rose-200' },
                                { label: 'Cancelled',   value: buyerHistory.summary.cancelled,   amount: buyerHistory.summary.cancelledGmv,   cls: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200' },
                              ]).map((t) => (
                                <div key={t.label} className={`rounded-xl border ${t.bg} px-2 py-2.5 text-center`}>
                                  <div className={`text-2xl font-extrabold tabular-nums leading-none ${t.cls}`}>{t.value.toLocaleString('en-IN')}</div>
                                  <div className="text-[9px] uppercase tracking-wider font-semibold text-slate-500 mt-1">{t.label}</div>
                                  <div className="text-[11px] font-bold tabular-nums text-slate-600 mt-1">{formatAmount(t.amount)}</div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="relative rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 text-white px-5 py-3.5 flex items-center justify-between overflow-hidden shadow-md">
                            <div className="pointer-events-none absolute -top-8 -right-6 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
                            <div className="relative">
                              <div className="text-[10px] uppercase tracking-wider text-white/70 font-bold">Completed Value</div>
                              <div className="text-2xl font-black tabular-nums mt-0.5">{formatAmount(buyerHistory.summary.completedGmv)}</div>
                            </div>
                            <div className="relative text-right">
                              <div className="text-[10px] uppercase tracking-wider text-white/70 font-bold">Completion</div>
                              <div className="text-2xl font-black tabular-nums mt-0.5">{buyerHistory.summary.completionRate.toFixed(0)}%</div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">First Order</div>
                              <div className="text-sm font-bold text-slate-900 mt-0.5">{formatDateShort(buyerHistory.summary.firstOrder)}</div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Last Order</div>
                              <div className="text-sm font-bold text-slate-900 mt-0.5">{formatDateShort(buyerHistory.summary.lastOrder)}</div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
                              <div className="text-[10px] uppercase tracking-wider font-semibold text-emerald-600">Last Marked Pending</div>
                              <div className="text-sm font-bold text-slate-900 mt-0.5">{formatDateShort(buyerHistory.summary.lastMarkedPending)}</div>
                            </div>
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
                              <div className="text-[10px] uppercase tracking-wider font-semibold text-emerald-600">Days Since Marked Pending</div>
                              <div className="text-sm font-bold text-slate-900 mt-0.5">{buyerHistory.summary.daysSinceLastMarkedPending != null ? `${buyerHistory.summary.daysSinceLastMarkedPending}d ago` : '—'}</div>
                            </div>
                          </div>

                          {buyerHistory.monthly.length > 1 && (
                            <div>
                              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5">Orders · last 12 months</div>
                              <div className="h-20 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={buyerHistory.monthly} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                                    <defs>
                                      <linearGradient id="buyerOrdersGrad" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#818cf8" />
                                        <stop offset="100%" stopColor="#e879f9" />
                                      </linearGradient>
                                    </defs>
                                    <XAxis dataKey="ym" hide />
                                    <Tooltip
                                      cursor={{ fill: 'rgba(99,102,241,0.08)' }}
                                      contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                                      labelFormatter={(l) => String(l)}
                                      formatter={(value) => [Number(value), 'orders']}
                                    />
                                    <Bar dataKey="orders" fill="url(#buyerOrdersGrad)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          )}

                          {buyerHistory.topSkus.length > 0 && (() => {
                            const maxOrd = Math.max(...buyerHistory.topSkus.map((sk) => sk.orderCount), 1);
                            return (
                              <div>
                                <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">Most Purchased Products</div>
                                <div className="space-y-1.5">
                                  {buyerHistory.topSkus.map((sk, i) => (
                                    <div key={i} className="relative rounded-xl bg-white border border-slate-200 px-3 py-2 overflow-hidden">
                                      <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-fuchsia-100/80 to-indigo-50/30" style={{ width: `${(sk.orderCount / maxOrd) * 100}%` }} />
                                      <div className="relative flex items-center gap-2.5">
                                        <span className="shrink-0 w-5 h-5 rounded-md bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white text-[10px] font-black flex items-center justify-center">{i + 1}</span>
                                        <div className="min-w-0 flex-1">
                                          <div className="text-xs font-semibold text-slate-900 truncate">{sk.sku}</div>
                                          <div className="text-[10px] text-slate-500 truncate">{sk.brand}</div>
                                        </div>
                                        <div className="shrink-0 text-right">
                                          <div className="text-xs font-bold text-fuchsia-700 tabular-nums">{sk.orderCount} ord</div>
                                          <div className="text-[10px] text-slate-500 tabular-nums">{sk.qty.toLocaleString('en-IN')} qty</div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                          {buyerHistory.topBrands.length > 0 && (
                            <div>
                              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">Top Brands</div>
                              <div className="flex flex-wrap gap-1.5">
                                {buyerHistory.topBrands.map((br, i) => (
                                  <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-indigo-50 to-fuchsia-50 border border-indigo-200 text-xs font-semibold text-indigo-700">
                                    {br.brand}
                                    <span className="text-[10px] font-bold text-fuchsia-600 tabular-nums">{br.orderCount}</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          </>
                          )}

                          {buyerHistory.summary.draftCount > 0 && (
                            <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50/50 px-4 py-3.5 shadow-sm">
                              <div className="text-[10px] uppercase tracking-[0.16em] font-bold text-violet-600 mb-2.5">Draft Carts · never placed</div>
                              <div className="grid grid-cols-3 gap-3 text-center">
                                <div>
                                  <div className="text-2xl font-black tabular-nums text-violet-700 leading-none">{buyerHistory.summary.draftCount.toLocaleString('en-IN')}</div>
                                  <div className="text-[9px] uppercase tracking-wider font-semibold text-slate-500 mt-1.5">Drafts Created</div>
                                </div>
                                <div>
                                  <div className="text-sm font-bold text-slate-900 leading-tight">{formatDateShort(buyerHistory.summary.lastDraft)}</div>
                                  <div className="text-[9px] uppercase tracking-wider font-semibold text-slate-500 mt-1.5">Last Draft</div>
                                </div>
                                <div>
                                  <div className="text-2xl font-black tabular-nums text-violet-700 leading-none">{buyerHistory.summary.daysSinceLastDraft != null ? buyerHistory.summary.daysSinceLastDraft : '—'}<span className="text-xs font-bold">{buyerHistory.summary.daysSinceLastDraft != null ? 'd' : ''}</span></div>
                                  <div className="text-[9px] uppercase tracking-wider font-semibold text-slate-500 mt-1.5">Since Last Draft</div>
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </section>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Seller Details Modal — opens when clicking a Seller Business or Seller Phone cell */}
        {sellerModalOpen && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md"
            onClick={closeSellerModal}
          >
            <div
              className="relative bg-white text-slate-900 rounded-2xl w-[92vw] max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-[0_30px_80px_-20px_rgba(217,70,239,0.45)] border border-slate-200"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="px-6 py-4 bg-gradient-to-r from-fuchsia-600 via-pink-600 to-rose-600 text-white flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/70 font-semibold">Seller Details</div>
                  <h3 className="text-lg font-extrabold truncate mt-0.5">
                    {sellerModalData?.businessName || sellerModalLookup || 'Loading…'}
                  </h3>
                </div>
                <button
                  onClick={closeSellerModal}
                  className="shrink-0 w-8 h-8 rounded-lg bg-white/15 hover:bg-white/30 text-white text-lg leading-none transition-all hover:rotate-90"
                  aria-label="Close"
                >
                  ×
                </button>
              </header>
              <div className="flex-1 overflow-auto">
                {sellerModalLoading ? (
                  <div className="px-6 py-12 text-center text-slate-500">Loading seller details…</div>
                ) : sellerModalError ? (
                  <div className="px-6 py-12 text-center text-rose-600">Error: {sellerModalError}</div>
                ) : !sellerModalData ? (
                  <div className="px-6 py-12 text-center text-slate-500">No data.</div>
                ) : (
                  <dl className="divide-y divide-slate-100">
                    {([
                      { label: 'Seller Name',     value: sellerModalData.name },
                      { label: 'Business Name',   value: sellerModalData.businessName },
                      { label: 'Phone',           value: sellerModalData.phone, mono: true },
                      { label: 'WhatsApp',        value: sellerModalData.whatsappNumber, mono: true },
                      { label: 'Email',           value: sellerModalData.email, mono: true },
                      { label: 'GST Number',      value: sellerModalData.gstNumber, mono: true },
                      { label: 'PAN',             value: sellerModalData.businessPanNumber, mono: true },
                      { label: 'FSSAI',           value: sellerModalData.fssaiNumber, mono: true },
                      { label: 'City',            value: sellerModalData.city },
                      { label: 'District',        value: sellerModalData.district },
                      { label: 'State',           value: sellerModalData.state },
                      { label: 'Pincode',         value: sellerModalData.pincode, mono: true },
                      { label: 'Full Address',    value: sellerModalData.fullAddress, wrap: true },
                      { label: 'Landmark',        value: sellerModalData.landmark },
                    ] as { label: string; value: string | null; mono?: boolean; wrap?: boolean }[]).map((row) => (
                      <div key={row.label} className="grid grid-cols-3 gap-4 px-6 py-3 hover:bg-slate-50">
                        <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500 self-center">{row.label}</dt>
                        <dd className={`col-span-2 text-sm text-slate-900 ${row.mono ? 'font-mono tabular-nums' : ''} ${row.wrap ? 'whitespace-normal' : 'whitespace-nowrap'} break-words`}>
                          {row.value ? <span>{row.value}</span> : <span className="text-slate-400">—</span>}
                        </dd>
                      </div>
                    ))}
                    <div className="grid grid-cols-3 gap-4 px-6 py-3 hover:bg-slate-50">
                      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500 self-center">Flags</dt>
                      <dd className="col-span-2 text-sm flex flex-wrap gap-1.5">
                        {sellerModalData.isD2RBrandSeller && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-fuchsia-100 text-fuchsia-700 border border-fuchsia-200">D2R Brand</span>
                        )}
                        {sellerModalData.isBadhoVerified && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">Badho Verified</span>
                        )}
                        {!sellerModalData.isD2RBrandSeller && !sellerModalData.isBadhoVerified && (
                          <span className="text-slate-400">—</span>
                        )}
                      </dd>
                    </div>
                    {(sellerModalData.longitude || sellerModalData.lattitude) && (
                      <div className="grid grid-cols-3 gap-4 px-6 py-3 hover:bg-slate-50">
                        <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500 self-center">Map</dt>
                        <dd className="col-span-2 text-sm">
                          <a
                            href={`https://www.google.com/maps?q=${sellerModalData.lattitude},${sellerModalData.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold"
                          >
                            Open in Google Maps
                          </a>
                        </dd>
                      </div>
                    )}
                  </dl>
                )}
              </div>
            </div>
          </div>
        )}

        {/* PO Items Modal — opens from "View Items" button */}
        {poItemsModal && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gradient-to-br from-slate-950/85 via-indigo-950/85 to-purple-950/85 backdrop-blur-lg animate-modal-fade gap-4"
            onClick={closePoItemsModal}
          >
            <div
              className={`relative bg-white text-slate-900 rounded-2xl ${priceBreakup ? 'w-[60vw] max-w-3xl' : 'w-[94vw] max-w-5xl'} max-h-[88vh] flex flex-col overflow-hidden shadow-[0_30px_80px_-20px_rgba(99,102,241,0.45),0_0_60px_-10px_rgba(168,85,247,0.3)] border border-slate-200 animate-modal-scale`}
              onClick={(e) => e.stopPropagation()}
            >

              {/* Hero header — minimal */}
              <header className="relative px-6 py-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 text-white overflow-hidden flex items-center justify-between gap-4">
                <div className="absolute inset-0 bg-[linear-gradient(115deg,transparent_30%,rgba(255,255,255,0.14)_50%,transparent_70%)] bg-[length:200%_100%] animate-shimmer pointer-events-none" />
                <div className="relative flex items-baseline gap-3 min-w-0">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-white/60 font-semibold">PO</span>
                  <h3 className="text-xl font-extrabold tracking-tight truncate">{poItemsModal}</h3>
                  {poItemsTotals && (
                    <span className="hidden sm:flex items-baseline gap-4 ml-4 text-[12px] text-white/85">
                      <span><span className="font-bold tabular-nums">{poItemsTotals.items}</span> <span className="text-white/60">SKUs</span></span>
                      <span><span className="font-bold tabular-nums">{poItemsTotals.qty.toLocaleString('en-IN')}</span> <span className="text-white/60">qty</span></span>
                      <span className="font-bold tabular-nums text-base">₹{poItemsTotals.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                    </span>
                  )}
                </div>
                <button
                  onClick={closePoItemsModal}
                  className="relative shrink-0 w-8 h-8 rounded-lg bg-white/15 hover:bg-white/30 text-white text-lg leading-none transition-all hover:rotate-90"
                  aria-label="Close"
                >
                  ×
                </button>
              </header>

              {/* Toolbar — compact single row */}
              {poItemsData && poItemsData.length > 0 && (() => {
                const statusCounts = poItemsData.reduce<Record<string, number>>((acc, it) => {
                  const s = it.status || '—';
                  acc[s] = (acc[s] || 0) + 1;
                  return acc;
                }, {});
                const statusOrder = ['REJECTED', 'PENDING', 'IN_PROGRESS', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'];
                const sortedStatuses = Object.keys(statusCounts).sort((a, b) => {
                  const ai = statusOrder.indexOf(a); const bi = statusOrder.indexOf(b);
                  return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
                });
                const dotFor: Record<string, string> = {
                  'REJECTED':    'bg-rose-500',
                  'DELIVERED':   'bg-emerald-500',
                  'COMPLETED':   'bg-emerald-500',
                  'DISPATCHED':  'bg-blue-500',
                  'IN_TRANSIT':  'bg-cyan-500',
                  'IN_PROGRESS': 'bg-amber-500',
                  'PENDING':     'bg-slate-400',
                };
                return (
                  <div className="px-6 py-2.5 border-b border-slate-200 bg-slate-50/70 flex items-center gap-2 flex-wrap text-xs">
                    <div className="relative flex-1 min-w-[180px] max-w-xs">
                      <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
                      </svg>
                      <input
                        type="text"
                        value={poItemsSearch}
                        onChange={(e) => setPoItemsSearch(e.target.value)}
                        placeholder="Search SKU…"
                        className="w-full pl-8 pr-2.5 py-1.5 bg-white border border-slate-200 rounded-md text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-indigo-300"
                      />
                    </div>
                    <div className="inline-flex items-center rounded-md border border-slate-200 overflow-hidden bg-white">
                      {(['amount', 'qty', 'name'] as const).map((s) => (
                        <button
                          key={s}
                          onClick={() => setPoItemsSort(s)}
                          className={`px-2.5 py-1.5 text-[11px] font-semibold capitalize transition-colors ${
                            poItemsSort === s ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1 flex-wrap ml-auto">
                      <button
                        onClick={() => setPoItemsStatusFilter('all')}
                        className={`px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                          poItemsStatusFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        All <span className="opacity-70 tabular-nums">{poItemsData.length}</span>
                      </button>
                      {sortedStatuses.map((s) => {
                        const active = poItemsStatusFilter === s;
                        return (
                          <button
                            key={s}
                            onClick={() => setPoItemsStatusFilter(active ? 'all' : s)}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                              active ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${dotFor[s] || 'bg-slate-400'}`} />
                            {s} <span className="opacity-70 tabular-nums">{statusCounts[s]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Body — clean table */}
              <div className="relative flex-1 overflow-auto">
                {poItemsLoading ? (
                  <div className="px-6 py-6 space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className="rounded-md h-10 animate-shimmer-skeleton"
                        style={{ backgroundSize: '400% 100%', animationDelay: `${i * 80}ms` }}
                      />
                    ))}
                  </div>
                ) : poItemsError ? (
                  <div className="px-6 py-16 text-center text-rose-600 text-sm">⚠ {poItemsError}</div>
                ) : !poItemsData || poItemsData.length === 0 ? (
                  <div className="px-6 py-16 text-center text-slate-500 text-sm">No items found for this PO</div>
                ) : (() => {
                  const maxAmount = Math.max(...poItemsData.map((i) => i.amount || 0), 1);
                  const topAmount = maxAmount;
                  const dotFor: Record<string, string> = {
                    'REJECTED':    'bg-rose-500',
                    'DELIVERED':   'bg-emerald-500',
                    'COMPLETED':   'bg-emerald-500',
                    'DISPATCHED':  'bg-blue-500',
                    'IN_TRANSIT':  'bg-cyan-500',
                    'IN_PROGRESS': 'bg-amber-500',
                    'PENDING':     'bg-slate-400',
                  };
                  const textFor: Record<string, string> = {
                    'REJECTED':    'text-rose-700',
                    'DELIVERED':   'text-emerald-700',
                    'COMPLETED':   'text-emerald-700',
                    'DISPATCHED':  'text-blue-700',
                    'IN_TRANSIT':  'text-cyan-700',
                    'IN_PROGRESS': 'text-amber-700',
                    'PENDING':     'text-slate-600',
                  };

                  const q = poItemsSearch.trim().toLowerCase();
                  let rows = poItemsData.filter((it) =>
                    (poItemsStatusFilter === 'all' || it.status === poItemsStatusFilter) &&
                    (q === '' ||
                      (it.skuLabel || '').toLowerCase().includes(q) ||
                      (it.brandLabel || '').toLowerCase().includes(q))
                  );
                  rows = [...rows].sort((a, b) => {
                    if (poItemsSort === 'amount') return (b.amount || 0) - (a.amount || 0);
                    if (poItemsSort === 'qty')    return (b.quantity || 0) - (a.quantity || 0);
                    return (a.skuLabel || '').localeCompare(b.skuLabel || '');
                  });

                  if (rows.length === 0) {
                    return <div className="px-6 py-16 text-center text-slate-500 text-sm">No items match your filters</div>;
                  }

                  return (
                    <table className="w-full text-sm border-separate border-spacing-0">
                      <thead className="sticky top-0 bg-white z-10">
                        <tr className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                          <th className="px-3 py-2 text-left w-8 border-b border-slate-200">#</th>
                          <th className="pl-2 pr-3 py-2 text-left border-b border-slate-200">SKU</th>
                          <th className="px-3 py-2 text-left border-b border-slate-200 w-32">Status</th>
                          <th className="px-3 py-2 text-right border-b border-slate-200 w-24">Qty</th>
                          <th className="px-3 py-2 text-right border-b border-slate-200 w-24">Unit</th>
                          <th className="px-3 py-2 text-right border-b border-slate-200 w-24">Discount</th>
                          <th className="px-3 py-2 text-right border-b border-slate-200 w-40">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((it, idx) => {
                          const barPct = it.amount ? Math.max(2, (it.amount / maxAmount) * 100) : 0;
                          const isTop = it.amount != null && it.amount === topAmount && poItemsData.length > 1;
                          return (
                            <tr
                              key={it.id}
                              className={`group transition-colors hover:bg-indigo-50/50 animate-card-in ${isTop ? 'bg-amber-50/60' : ''}`}
                              style={{ animationDelay: `${idx * 25}ms` }}
                            >
                              <td className={`px-3 py-2.5 text-[11px] tabular-nums border-b border-slate-100 font-semibold ${isTop ? 'text-amber-600' : 'text-slate-400'}`}>
                                {isTop ? '★' : idx + 1}
                              </td>
                              <td className="pl-2 pr-3 py-2.5 border-b border-slate-100 max-w-0">
                                <div className={`font-semibold truncate ${isTop ? 'text-amber-900' : 'text-slate-900'}`}>
                                  {it.skuLabel || <span className="text-slate-400 italic font-normal">Unnamed SKU</span>}
                                </div>
                                {it.brandLabel && (
                                  <div className="text-[10px] text-slate-400 truncate mt-0.5">{it.brandLabel}</div>
                                )}
                              </td>
                              <td className="px-3 py-2.5 border-b border-slate-100">
                                <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${textFor[it.status || ''] || 'text-slate-600'}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${dotFor[it.status || ''] || 'bg-slate-400'}`} />
                                  {it.status || '—'}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums border-b border-slate-100">
                                <span className="font-semibold text-slate-900">{it.quantity != null ? it.quantity.toLocaleString('en-IN') : '—'}</span>
                                {it.quantityUnit ? <span className="text-[10px] text-slate-400 ml-0.5">{it.quantityUnit}</span> : null}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 border-b border-slate-100">
                                {it.unitPrice != null ? `₹${it.unitPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums border-b border-slate-100">
                                {it.discount ? <span className="text-amber-600 font-medium">−₹{it.discount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span> : <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-3 py-2.5 text-right border-b border-slate-100">
                                <div className={`font-bold tabular-nums leading-none ${isTop ? 'text-amber-700' : 'text-slate-900'}`}>
                                  {it.amount != null ? `₹${it.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}
                                </div>
                                <div className="mt-1 h-0.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-700 ${isTop ? 'bg-amber-400' : 'bg-gradient-to-r from-indigo-400 to-fuchsia-500'}`}
                                    style={{ width: `${barPct}%` }}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  );
                })()}
              </div>

              {/* Footer — single clean line */}
              {poItemsTotals && poItemsData && poItemsData.length > 0 && (
                <footer className="px-6 py-3 border-t border-slate-200 bg-slate-50/80 flex items-center justify-between text-xs">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                    {poItemsTotals.items} SKU{poItemsTotals.items === 1 ? '' : 's'} · Order Total
                  </span>
                  <span className="flex items-baseline gap-5">
                    <span className="text-slate-500">
                      <span className="font-bold tabular-nums text-slate-900 text-sm">{poItemsTotals.qty.toLocaleString('en-IN')}</span> qty
                    </span>
                    <span className="text-xl font-extrabold tabular-nums bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 bg-clip-text text-transparent leading-none">
                      ₹{poItemsTotals.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </span>
                  </span>
                </footer>
              )}
            </div>

            {/* Price Breakup — sleek companion panel on the right */}
            {priceBreakup && (() => {
              const gross = priceBreakup.orderAmount ?? 0;            // GrossAmount = amount + platformMarginDiscount
              const itemTotal = priceBreakup.itemTotalAmount ?? 0;    // Item Total Amount = po.amount
              const itemDisc = priceBreakup.itemDiscount ?? 0;        // platformMarginDiscount
              const coupon = priceBreakup.couponAmount ?? 0;
              const sellerDisc = priceBreakup.sellerDiscount ?? 0;
              const badho = priceBreakup.badhoDiscount ?? 0;
              const upiDisc = priceBreakup.upiDiscountBySeller ?? 0;
              const volumeDisc = priceBreakup.volumeDiscount ?? 0;
              const wallet = priceBreakup.appliedWalletAmount ?? 0;
              const anotherDisc = priceBreakup.totalDiscount ?? 0;    // AnotherDiscount = po.totalDiscount
              const paid = priceBreakup.paidAmount ?? 0;
              // Spec: Total Discount = every discount component (incl. item discount).
              const totalDiscount = itemDisc + coupon + sellerDisc + badho + upiDisc + volumeDisc + wallet + anotherDisc;
              // Amount to be paid = Item Total Amount − Total Discount.
              const amountToBePaid = itemTotal - totalDiscount;
              // Net Payable = Amount to be paid − Paid Amount.
              const netPayable = amountToBePaid - paid;
              const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: n % 1 === 0 ? 0 : 2 })}`;

              type DLine = { key: string; label: string; value: number; iconBg: string; icon: React.ReactNode };
              // The eight discount components that sum to Total Discount — every one
              // is shown, ₹0 included, in the same order as the source breakup.
              const discountLines: DLine[] = [
                {
                  key: 'itemDisc', label: 'Item Discount', value: itemDisc, iconBg: 'from-slate-400 to-slate-500',
                  icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>),
                },
                {
                  key: 'coupon', label: 'Coupon Applied', value: coupon, iconBg: 'from-fuchsia-500 to-pink-600',
                  icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 12V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v5a2 2 0 0 1 0 4v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3a2 2 0 0 1 0-4Z" /><line x1="15" y1="9" x2="9" y2="15" /></svg>),
                },
                {
                  key: 'sellerDisc', label: 'Discount by Seller', value: sellerDisc, iconBg: 'from-rose-500 to-red-600',
                  icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></svg>),
                },
                {
                  key: 'badho', label: 'Payment Discount by Badho', value: badho, iconBg: 'from-amber-500 to-orange-600',
                  icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="12 2 15 8.5 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 8.5 12 2" /></svg>),
                },
                {
                  key: 'upiDisc', label: 'UPI Discount by Seller', value: upiDisc, iconBg: 'from-violet-500 to-purple-600',
                  icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>),
                },
                {
                  key: 'volumeDisc', label: 'Applied Volume Discount', value: volumeDisc, iconBg: 'from-sky-500 to-blue-600',
                  icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="12" y="8" width="3" height="10" /><rect x="17" y="4" width="3" height="14" /></svg>),
                },
                {
                  key: 'wallet', label: 'Applied Wallet Amount', value: wallet, iconBg: 'from-cyan-500 to-teal-600',
                  icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4" /><path d="M4 6v12a2 2 0 0 0 2 2h14v-4" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></svg>),
                },
                {
                  key: 'anotherDisc', label: 'Another Discount', value: anotherDisc, iconBg: 'from-slate-400 to-slate-500',
                  icon: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 2h16v20l-3-2-2 2-3-2-3 2-2-2-3 2V2Z" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="16" y2="12" /></svg>),
                },
              ];
              const fullyCovered = netPayable <= 0.005;
              return (
                <div
                  className="relative w-[34vw] max-w-md max-h-[88vh] flex flex-col overflow-hidden rounded-2xl bg-white text-slate-900 border border-slate-200 shadow-[0_30px_80px_-20px_rgba(99,102,241,0.45),0_0_60px_-10px_rgba(168,85,247,0.3)] animate-modal-scale"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="absolute -top-24 -right-24 w-64 h-64 bg-fuchsia-200/40 rounded-full blur-3xl pointer-events-none" />
                  <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-indigo-200/40 rounded-full blur-3xl pointer-events-none" />

                  <header className="relative px-4 py-2.5 border-b border-slate-200 bg-gradient-to-r from-fuchsia-50 via-white to-indigo-50">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center shadow-[0_8px_20px_-6px_rgba(217,70,239,0.55)]">
                          <span className="text-white font-extrabold text-sm leading-none">₹</span>
                        </div>
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-[0.25em] text-purple-600 font-bold">Price Breakup</div>
                          <div className="text-slate-900 font-bold text-sm leading-tight truncate">PO {poItemsModal}</div>
                        </div>
                      </div>
                      {(() => {
                        const opt = priceBreakup.paymentOption ? String(priceBreakup.paymentOption) : 'PENDING';
                        const styles: Record<string, string> = {
                          FULLY_PAID:     'bg-emerald-100 text-emerald-700 border-emerald-300',
                          PARTIALLY_PAID: 'bg-amber-100 text-amber-700 border-amber-300',
                          COD:            'bg-cyan-100 text-cyan-700 border-cyan-300',
                          PENDING:        'bg-rose-100 text-rose-700 border-rose-300',
                        };
                        const cls = styles[opt] || 'bg-slate-100 text-slate-700 border-slate-300';
                        return (
                          <div className="shrink-0 text-right">
                            <div className="text-[9px] uppercase tracking-[0.2em] text-slate-500 font-bold mb-0.5">Payment</div>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${cls}`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                              {opt}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  </header>

                  <div className="relative flex-1 overflow-y-auto px-4 py-2.5 space-y-2">
                    {/* Order value — Gross & Item Total side by side */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-indigo-200 bg-indigo-50/70 px-2.5 py-1.5">
                        <div className="text-[9px] uppercase tracking-wider text-indigo-500 font-bold leading-tight">Gross Amount</div>
                        <div className="tabular-nums font-extrabold text-[15px] text-slate-900 leading-tight">{fmt(gross)}</div>
                        <div className="text-[9px] text-slate-400 leading-tight">items + item discount</div>
                      </div>
                      <div className="rounded-lg border border-violet-200 bg-violet-50/70 px-2.5 py-1.5">
                        <div className="text-[9px] uppercase tracking-wider text-violet-500 font-bold leading-tight">Item Total Amount</div>
                        <div className="tabular-nums font-extrabold text-[15px] text-slate-900 leading-tight">{fmt(itemTotal)}</div>
                        <div className="text-[9px] text-slate-400 leading-tight">base for payable</div>
                      </div>
                    </div>

                    {/* Discount components */}
                    <div>
                      <div className="text-[9px] uppercase tracking-[0.2em] text-slate-400 font-bold mb-1 px-1">Discounts</div>
                      <div className="space-y-1">
                        {discountLines.map((ln) => (
                          <div
                            key={ln.key}
                            className="flex items-center gap-2.5 px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200"
                          >
                            <div className={`shrink-0 w-6 h-6 rounded-md bg-gradient-to-br ${ln.iconBg} flex items-center justify-center`}>
                              {ln.icon}
                            </div>
                            <div className="min-w-0 flex-1 text-[11px] font-semibold text-slate-700 truncate">{ln.label}</div>
                            <div className={`tabular-nums font-bold text-[12px] ${ln.value > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                              {ln.value > 0 ? '− ' : ''}{fmt(ln.value)}
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Total Discount subtotal */}
                      <div className="flex items-center justify-between gap-3 mt-1.5 px-2.5 py-1.5 rounded-md bg-rose-50 border border-rose-200">
                        <span className="text-[11px] font-extrabold uppercase tracking-wide text-rose-700">Total Discount</span>
                        <span className="tabular-nums font-extrabold text-sm text-rose-700">− {fmt(totalDiscount)}</span>
                      </div>
                    </div>
                  </div>

                  <footer className="relative px-4 py-2.5 border-t border-slate-200 bg-gradient-to-r from-emerald-50 via-emerald-100/60 to-emerald-50">
                    <div className="flex items-center justify-between gap-3 text-[13px]">
                      <span className="text-slate-700 font-semibold leading-tight">Amount to be paid<span className="block text-[9px] text-slate-400 font-normal">Item Total − Total Discount</span></span>
                      <span className="tabular-nums font-extrabold text-slate-900">{fmt(amountToBePaid)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 mt-1 text-[11px]">
                      <span className="text-slate-600">{priceBreakup.paymentOption === 'PARTIALLY_PAID' ? 'Partial paid' : 'Paid amount'}</span>
                      <span className="tabular-nums font-bold text-emerald-700">{paid > 0 ? '− ' : ''}{fmt(paid)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 mt-1.5 pt-2 border-t border-emerald-200">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${fullyCovered ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.7)]' : 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.7)]'} animate-pulse`} />
                        <span className={`text-[10px] uppercase tracking-[0.25em] font-bold ${fullyCovered ? 'text-emerald-700' : 'text-amber-700'}`}>Net Payable</span>
                      </div>
                      <span className={`tabular-nums text-xl font-extrabold bg-clip-text text-transparent ${fullyCovered ? 'bg-gradient-to-r from-emerald-700 via-emerald-600 to-emerald-700' : 'bg-gradient-to-r from-amber-700 via-amber-600 to-amber-700'}`}>
                        {netPayable < 0 ? `− ${fmt(Math.abs(netPayable))}` : fmt(netPayable)}
                      </span>
                    </div>
                  </footer>
                </div>
              );
            })()}
          </div>
        )}

        {/* Alert Detail Modal — same layout & columns as pivot drill modal */}
        {alertModalCategory && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-2 bg-slate-950/70 backdrop-blur-md"
            onClick={closeAlertModal}
          >
            <div
              className="relative bg-white text-slate-900 border border-purple-400/50 rounded-2xl w-[98vw] max-w-[98vw] h-[96vh] max-h-[96vh] flex flex-col overflow-hidden animate-corner-breath"
              onClick={(e) => e.stopPropagation()}
            >
              {/* breathing purple corner accents */}
              <div className="pointer-events-none absolute -top-px -left-px w-20 h-20 rounded-tl-2xl border-t-2 border-l-2 border-purple-500 animate-edge-pulse" />
              <div className="pointer-events-none absolute -top-px -right-px w-20 h-20 rounded-tr-2xl border-t-2 border-r-2 border-purple-500 animate-edge-pulse" style={{ animationDelay: '0.6s' }} />
              <div className="pointer-events-none absolute -bottom-px -left-px w-20 h-20 rounded-bl-2xl border-b-2 border-l-2 border-purple-500 animate-edge-pulse" style={{ animationDelay: '1.2s' }} />
              <div className="pointer-events-none absolute -bottom-px -right-px w-20 h-20 rounded-br-2xl border-b-2 border-r-2 border-purple-500 animate-edge-pulse" style={{ animationDelay: '1.8s' }} />

              <div className="relative px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-purple-50 via-white to-fuchsia-50/60">
                <div className="min-w-0">
                  <h3 className="text-lg font-extrabold tracking-tight flex items-center gap-2 text-slate-900 truncate">
                    <span className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.7)] animate-pulse shrink-0" />
                    <span>{alertModalSource === 'aging' ? 'InProgress Aging' : 'SLA Breach Alerts'}</span>
                    <span className="text-slate-400 text-sm font-normal mx-1">·</span>
                    <span className="text-purple-700 text-sm font-bold">
                      {alertModalSource === 'aging'
                        ? (alertModalCategory === 'all' ? 'All buckets' : alertModalCategory)
                        : (alertModalCategory === 'all' ? 'All Categories' : alertModalCategory)}
                    </span>
                    {alertModalSeller && (
                      <>
                        <span className="text-slate-400 text-sm font-normal mx-1">·</span>
                        <span className="text-slate-700 text-sm font-semibold truncate">{alertModalSeller}</span>
                      </>
                    )}
                  </h3>
                  <p className="text-slate-500 text-xs mt-1">
                    {alertModalLoading
                      ? 'Loading…'
                      : alertModalData
                      ? <span className="text-slate-900 font-semibold">{alertModalData.length} order{alertModalData.length === 1 ? '' : 's'} {alertModalSource === 'aging' ? 'stuck in InProgress' : 'past SLA deadline'}</span>
                      : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    className="px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 border border-purple-600 text-white text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_2px_8px_-2px_rgba(168,85,247,0.5)]"
                    disabled={!alertModalData || alertModalData.length === 0}
                    onClick={() => {
                      if (!alertModalData) return;
                      const headers = [
                        'pushedStatus', 'poNumber', 'orderStatus',
                        'itemTotal', 'grossAmount', 'orderMarginDiscount', 'paidAmount', 'CoupanAmount',
                        'discountBySeller', 'appliedWalletAmount',
                        'PaymentOption', 'awbNumber', 'courierName', 'codAmountToBeCollected',
                        'PaymentOptionDiscountByBadho', 'paymentDate', 'paymentEvent',
                        'deliveryStatus', 'buyerBusinessName', 'buyerPhone', 'buyerAddress',
                        'sellerPhone', 'sellerBusinessName',
                        'MarkedpendingTime', 'RefundIntiatedTime', 'RefundCompletedTime',
                        'paymentCategory', 'markedInProgressTime', 'slaBreachAt',
                      ];
                      const rows: CsvCell[][] = alertModalData.map((r) => [
                        r.pushedStatus, r.poNumber, r.orderStatus,
                        r.itemTotal ?? '', r.grossAmount ?? '', r.orderMarginDiscount ?? '', r.paidAmount, r.CoupanAmount,
                        r.discountBySeller, r.appliedWalletAmount,
                        r.PaymentOption, r.awbNumber, r.courierName, r.codAmountToBeCollected,
                        r.PaymentOptionDiscountByBadho, r.paymentDate, r.paymentEvent,
                        r.deliveryStatus, r.buyerBusinessName, r.buyerPhone, r.buyerFullAddress,
                        r.sellerPhone, r.sellerBusinessName,
                        r.MarkedpendingTime, r.RefundIntiatedTime, r.RefundCompletedTime,
                        r.category, r.markedInProgressTime, r.slaBreachAt,
                      ]);
                      downloadCSV(`sla-breach-${alertModalCategory}.csv`, headers, rows);
                    }}
                  >
                    ↓ CSV
                  </button>
                  <GroupByMenu selected={alertGroupByDims} onChange={setAlertGroupByDims} align="right" />
                  <button
                    onClick={closeAlertModal}
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-600 text-base font-semibold transition-all hover:rotate-90"
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
              </div>
              {/* Compact toolbar — matches pivot drill modal */}
              {(() => {
                const rows = alertModalData ?? [];
                const total = rows.length;
                let pushedCount = 0;
                for (const r of rows) if ((r.pushedStatus || 'Not Pushed') === 'Pushed') pushedCount++;
                const buildOpts = (acc: (r: AlertDetailRow) => string | null | undefined) => {
                  const counts = new Map<string, number>();
                  for (const r of rows) {
                    const k = acc(r) || '__NONE__';
                    counts.set(k, (counts.get(k) || 0) + 1);
                  }
                  return Array.from(counts.entries())
                    .sort(([, a], [, b]) => b - a)
                    .map(([value, count]) => ({ value, label: value === '__NONE__' ? 'Unspecified' : value, count }));
                };
                const paymentOpts  = buildOpts((r) => r.PaymentOption);
                const courierOpts  = buildOpts((r) => r.courierName);
                const deliveryOpts = buildOpts((r) => r.deliveryStatus);
                return (
                  <div className="relative px-4 py-2 border-b border-slate-200 bg-slate-50/80">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="relative w-64 max-w-full">
                        <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="11" cy="11" r="7" />
                          <path d="m20 20-3.5-3.5" />
                        </svg>
                        <input
                          type="text"
                          value={alertModalSearch}
                          onChange={(e) => setAlertModalSearch(e.target.value)}
                          placeholder="Search PO, buyer, seller…"
                          className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-400 focus:border-purple-400"
                        />
                        {alertModalSearch && (
                          <button
                            type="button"
                            onClick={() => setAlertModalSearch('')}
                            aria-label="Clear search"
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 h-4 w-4 inline-flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700 text-xs"
                          >
                            ×
                          </button>
                        )}
                      </div>

                      <div role="group" aria-label="Filter by pushed status" className="inline-flex rounded-md border border-slate-300 overflow-hidden text-xs bg-white shrink-0">
                        {([
                          { value: 'all' as const, label: 'All', count: total },
                          { value: 'Pushed' as const, label: 'Pushed', count: pushedCount },
                          { value: 'Not Pushed' as const, label: 'Not Pushed', count: total - pushedCount },
                        ]).map((opt, idx) => {
                          const active = alertModalPushedFilter === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setAlertModalPushedFilter(opt.value)}
                              className={`px-2.5 py-1.5 whitespace-nowrap transition-colors font-medium ${idx > 0 ? 'border-l border-slate-300' : ''} ${active ? 'bg-purple-500 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                            >
                              {opt.label}<span className={`ml-1 text-[10px] tabular-nums ${active ? 'text-white/90' : 'text-slate-500'}`}>{opt.count}</span>
                            </button>
                          );
                        })}
                      </div>

                      {paymentOpts.length > 1 && (
                        <MultiSelectFilter
                          label="Payment"
                          allLabel="All payments"
                          options={paymentOpts}
                          selected={alertModalPaymentFilter}
                          onChange={setAlertModalPaymentFilter}
                          widthClass="w-44"
                        />
                      )}

                      {courierOpts.length > 1 && (
                        <MultiSelectFilter
                          label="Courier"
                          allLabel="All couriers"
                          options={courierOpts}
                          selected={alertModalCourierFilter}
                          onChange={setAlertModalCourierFilter}
                          widthClass="w-44"
                        />
                      )}

                      {deliveryOpts.length > 1 && (
                        <MultiSelectFilter
                          label="Delivery"
                          allLabel="All delivery"
                          options={deliveryOpts}
                          selected={alertModalDeliveryFilter}
                          onChange={setAlertModalDeliveryFilter}
                          widthClass="w-44"
                        />
                      )}
                    </div>
                  </div>
                );
              })()}
              <div className="relative flex-1 overflow-auto">
                {alertModalLoading ? (
                  <div className="px-6 py-12 text-center text-slate-500">Loading orders…</div>
                ) : alertModalError ? (
                  <div className="px-6 py-12 text-center text-rose-600">{alertModalError}</div>
                ) : !alertModalData || alertModalData.length === 0 ? (
                  <div className="px-6 py-12 text-center text-slate-500">No orders found</div>
                ) : (() => {
                  const q = alertModalSearch.trim().toLowerCase();
                  let filtered: AlertDetailRow[] = q
                    ? alertModalData.filter((r) =>
                        (r.poNumber || '').toLowerCase().includes(q) ||
                        (r.buyerPhone || '').toLowerCase().includes(q) ||
                        (r.buyerBusinessName || '').toLowerCase().includes(q) ||
                        (r.sellerPhone || '').toLowerCase().includes(q) ||
                        (r.sellerBusinessName || '').toLowerCase().includes(q) ||
                        (r.buyerFullAddress || '').toLowerCase().includes(q) ||
                        (r.awbNumber || '').toLowerCase().includes(q) ||
                        (r.courierName || '').toLowerCase().includes(q)
                      )
                    : alertModalData;
                  if (alertModalPushedFilter !== 'all') {
                    filtered = filtered.filter((r) => (r.pushedStatus || 'Not Pushed') === alertModalPushedFilter);
                  }
                  if (alertModalPaymentFilter.size > 0) {
                    filtered = filtered.filter((r) => alertModalPaymentFilter.has(r.PaymentOption || '__NONE__'));
                  }
                  if (alertModalCourierFilter.size > 0) {
                    filtered = filtered.filter((r) => alertModalCourierFilter.has(r.courierName || '__NONE__'));
                  }
                  if (alertModalDeliveryFilter.size > 0) {
                    filtered = filtered.filter((r) => alertModalDeliveryFilter.has(r.deliveryStatus || '__NONE__'));
                  }
                  if (alertModalSort) {
                    const { key, direction } = alertModalSort;
                    filtered = [...filtered].sort((a, b) => {
                      const av = alertSortValue(a, key);
                      const bv = alertSortValue(b, key);
                      if (av === null && bv === null) return 0;
                      if (av === null) return 1;
                      if (bv === null) return -1;
                      let cmp = 0;
                      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
                      else cmp = String(av).localeCompare(String(bv));
                      return direction === 'asc' ? cmp : -cmp;
                    });
                  }
                  const paymentCatColor: Record<string, string> = {
                    'Fully_Paid':     'bg-emerald-100 text-emerald-700 border border-emerald-200',
                    'Partially_Paid': 'bg-amber-100 text-amber-700 border border-amber-200',
                    'COD':            'bg-cyan-100 text-cyan-700 border border-cyan-200',
                    'Other':          'bg-purple-100 text-purple-700 border border-purple-200',
                  };
                  const arrowFor = (k: string) => {
                    const active = alertModalSort?.key === k;
                    const dir = active ? alertModalSort?.direction : null;
                    return (
                      <span className={`ml-1 text-[10px] leading-none ${active ? 'text-purple-600' : 'text-slate-300'}`}>
                        {dir === 'asc' ? '▲' : dir === 'desc' ? '▼' : '⇅'}
                      </span>
                    );
                  };
                  const SortTh = ({ k, label, cls = '' }: { k: string; label: string; cls?: string }) => (
                    <th
                      onClick={() => toggleAlertSort(k)}
                      className={`sticky top-0 z-20 bg-slate-100 px-2.5 py-2.5 text-left text-[11px] font-bold cursor-pointer select-none hover:bg-slate-200/80 whitespace-nowrap uppercase tracking-wider ${cls || 'text-slate-700'}`}
                    >
                      <span className="inline-flex items-center">{label}{arrowFor(k)}</span>
                    </th>
                  );
                  return (
                    <table className="w-full text-xs">
                      <thead className="shadow-[0_2px_0_rgba(168,85,247,0.4)]">
                        <tr className="border-b border-slate-200">
                          <th
                            onClick={() => toggleAlertSort('markedPending')}
                            className="sticky top-0 left-0 z-30 bg-amber-50 min-w-[160px] max-w-[160px] w-[160px] px-2.5 py-2.5 text-left text-[11px] font-bold cursor-pointer select-none hover:bg-amber-100 whitespace-nowrap uppercase tracking-wider text-amber-800"
                          >
                            <span className="inline-flex items-center">Marked Pending{arrowFor('markedPending')}</span>
                          </th>
                          <th
                            onClick={() => toggleAlertSort('pushed')}
                            className="sticky top-0 left-[160px] z-30 bg-slate-100 min-w-[120px] max-w-[120px] w-[120px] px-2.5 py-2.5 text-left text-[11px] font-bold cursor-pointer select-none hover:bg-slate-200 whitespace-nowrap uppercase tracking-wider text-slate-700"
                          >
                            <span className="inline-flex items-center">Pushed{arrowFor('pushed')}</span>
                          </th>
                          <th
                            onClick={() => toggleAlertSort('poNumber')}
                            className="sticky top-0 left-[280px] z-30 bg-slate-100 px-2.5 py-2.5 text-left text-[11px] font-bold cursor-pointer select-none hover:bg-slate-200 whitespace-nowrap uppercase tracking-wider text-slate-700 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]"
                          >
                            <span className="inline-flex items-center">PO Number{arrowFor('poNumber')}</span>
                          </th>
                          <th className="sticky top-0 z-20 bg-slate-100 px-2.5 py-2.5 text-left text-[11px] font-bold text-slate-700 whitespace-nowrap uppercase tracking-wider">Items</th>
                          <th className="sticky top-0 z-20 bg-slate-100 px-2.5 py-2.5 text-left text-[11px] font-bold text-slate-700 whitespace-nowrap uppercase tracking-wider">View Ticket</th>
                          <SortTh k="status" label="Order Status" />
                          <SortTh k="itemTotal" label="Item Total" />
                          <SortTh k="grossAmount" label="Gross Amount" />
                          <SortTh k="orderMarginDiscount" label="Item Discount" />
                          <SortTh k="coupon" label="Coupon Amount" />
                          <SortTh k="wallet" label="Applied Wallet Amount" />
                          <SortTh k="sellerDiscount" label="Seller Discount" />
                          <SortTh k="badhoDiscount" label="Payment Option Badho Discount" />
                          <SortTh k="cod" label="COD Amount" />
                          <SortTh k="deliveryStatus" label="Delivery Status" />
                          <SortTh k="paidAmount" label="Paid Amount" />
                          <SortTh k="paymentOption" label="Payment Option" />
                          <SortTh k="awb" label="AWB Number" />
                          <SortTh k="courier" label="Courier Name" />
                          <SortTh k="paymentDate" label="Payment Date" />
                          <SortTh k="paymentEvent" label="Payment Event" />
                          <SortTh k="buyerBusiness" label="Buyer Business" />
                          <SortTh k="buyerPhone" label="Buyer Phone" />
                          <th className="sticky top-0 z-20 bg-slate-100 px-2.5 py-2.5 text-left text-[11px] font-bold text-slate-700 whitespace-nowrap uppercase tracking-wider">Buyer Address</th>
                          <SortTh k="sellerBusiness" label="Seller Business" />
                          <SortTh k="sellerPhone" label="Seller Phone" />
                          <th className="sticky top-0 z-20 bg-slate-100 px-2.5 py-2.5 text-left text-[11px] font-bold text-slate-700 whitespace-nowrap uppercase tracking-wider">Seller Address</th>
                          <SortTh k="statusMarkedTime" label={statusMarkedHeaderFor(alertModalData)} cls="text-slate-700 bg-amber-50/60" />
                          <SortTh k="statusDuration" label="Status Duration" cls="text-slate-700 bg-amber-50/60" />
                          <th onClick={() => toggleAlertSort('orderAge')} className="sticky top-0 z-20 bg-indigo-50 px-2.5 py-2.5 text-left text-[11px] font-bold text-indigo-700 whitespace-nowrap uppercase tracking-wider cursor-pointer select-none hover:bg-indigo-100"><span className="inline-flex items-center">Order Age{arrowFor('orderAge')}</span><div className="text-[8px] font-normal normal-case text-indigo-500/80">placed &rarr; now · incl. Sun</div></th>
                          <th onClick={() => toggleAlertSort('brandSla')} className="sticky top-0 z-20 bg-indigo-50 px-2.5 py-2.5 text-left text-[11px] font-bold text-indigo-700 whitespace-nowrap uppercase tracking-wider cursor-pointer select-none hover:bg-indigo-100"><span className="inline-flex items-center">Brand SLA{arrowFor('brandSla')}</span><div className="text-[8px] font-normal normal-case text-indigo-500/80">PENDING &rarr; INPROGRESS · excl. Sun</div></th>
                          <th onClick={() => toggleAlertSort('pickupSla')} className="sticky top-0 z-20 bg-indigo-50 px-2.5 py-2.5 text-left text-[11px] font-bold text-indigo-700 whitespace-nowrap uppercase tracking-wider cursor-pointer select-none hover:bg-indigo-100"><span className="inline-flex items-center">Pickup SLA{arrowFor('pickupSla')}</span><div className="text-[8px] font-normal normal-case text-indigo-500/80">INPROGRESS &rarr; DISPATCHED · excl. Sun</div></th>
                          <SortTh k="refundInit" label="Refund Initiated" />
                          <SortTh k="refundDone" label="Refund Completed" />
                          <SortTh k="refundAmount" label="Refund Amount" />
                          <SortTh k="rejectReason" label="Reject Reason" cls="text-rose-700 bg-rose-50" />
                          <SortTh k="rejectedBy" label="Rejected By" cls="text-rose-700 bg-rose-50" />
                          <SortTh k="reasonByBadho" label="Reason Added By Badho Team" cls="text-rose-700 bg-rose-50" />
                          <th className="sticky top-0 z-20 bg-indigo-50 px-2.5 py-2.5 text-left text-[11px] font-bold text-indigo-700 whitespace-nowrap uppercase tracking-wider">Latest Scan 1</th>
                          <th className="sticky top-0 z-20 bg-indigo-50 px-2.5 py-2.5 text-left text-[11px] font-bold text-indigo-700 whitespace-nowrap uppercase tracking-wider">Latest Scan 2</th>
                          <th className="sticky top-0 z-20 bg-indigo-50 px-2.5 py-2.5 text-left text-[11px] font-bold text-indigo-700 whitespace-nowrap uppercase tracking-wider">Latest Scan 3</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.slice(0, 2000).map((r, idx) => {
                          const isPushed = r.pushedStatus === 'Pushed';
                          const paid = Number(r.paidAmount ?? 0);
                          const isFullyPaid = r.PaymentOption === 'FULLY_PAID' && paid > 0;
                          const isPartialPaid = r.PaymentOption === 'PARTIALLY_PAID' && paid > 0;
                          const rowBg = isFullyPaid
                            ? 'bg-emerald-50'
                            : isPartialPaid
                            ? 'bg-violet-50'
                            : (idx % 2 === 0 ? 'bg-white' : 'bg-slate-50');
                          return (
                            <tr
                              key={r.poNumber}
                              className={`group border-b border-slate-100 align-top transition-colors ${rowBg} hover:bg-purple-50`}
                            >
                              <td className={`sticky left-0 z-10 ${rowBg} group-hover:bg-purple-50 min-w-[160px] max-w-[160px] w-[160px] px-2.5 py-2 whitespace-nowrap text-amber-800 font-medium`}>
                                {formatDateTime(r.MarkedpendingTime)}
                              </td>
                              <td className={`sticky left-[160px] z-10 ${rowBg} group-hover:bg-purple-50 min-w-[120px] max-w-[120px] w-[120px] px-2.5 py-2 whitespace-nowrap`}>
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${isPushed ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-rose-100 text-rose-700 border border-rose-300'}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${isPushed ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]' : 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.7)]'}`} />
                                  {r.pushedStatus || 'Not Pushed'}
                                </span>
                              </td>
                              <td className={`sticky left-[280px] z-10 ${rowBg} group-hover:bg-purple-50 px-2.5 py-2 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]`}>
                                <div className="inline-flex items-center gap-2">
                                  <span className="text-slate-900 tabular-nums font-bold">{r.poNumber}</span>
                                  <a
                                    href={`https://d2r-support-dashboard.vercel.app/?po_number=${encodeURIComponent(r.poNumber)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 hover:border-purple-300 transition-all"
                                    title="Open in D2R Support Dashboard"
                                  >
                                    Details
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <path d="M7 17L17 7" />
                                      <polyline points="7 7 17 7 17 17" />
                                    </svg>
                                  </a>
                                </div>
                                <div className="text-[10px] text-slate-500 tabular-nums mt-0.5" title="AWB number">
                                  AWB: {awbLink(r.awbNumber)}
                                </div>
                                <div
                                  className="mt-1.5 text-[10px] leading-tight"
                                  title="Ageing — Order age: total time since the order was placed (PENDING), includes Sundays. Brand SLA: time the brand took from PENDING to INPROGRESS (accepting the order), Sundays excluded. Pickup SLA: time from INPROGRESS to DISPATCHED (handed to courier), Sundays excluded. 'ongoing' = the order is still in that phase, so the clock is still running."
                                >
                                  <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">
                                    <span aria-hidden="true">⏱</span> Ageing
                                  </div>
                                  <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 tabular-nums">
                                    <span className="text-slate-500">Order age</span>
                                    <span>
                                      <span className="font-semibold text-slate-700">{formatDuration(r.orderAgeingSec)}</span>
                                      <span className="block text-slate-400">placed &rarr; now · incl. Sun</span>
                                    </span>

                                    <span className="text-slate-500">Brand SLA</span>
                                    <span>
                                      <span className="font-semibold text-indigo-700">{formatDuration(r.brandSpanSec)}</span>
                                      {r.brandSpanOngoing && <span className="ml-1 text-amber-600 font-medium">· ongoing</span>}
                                      <span className="block text-slate-400">PENDING &rarr; {r.brandSpanOngoing ? 'now' : 'INPROGRESS'} · excl. Sun</span>
                                    </span>

                                    <span className="text-slate-500">Pickup SLA</span>
                                    {r.pickupSpanSec != null ? (
                                      <span>
                                        <span className="font-semibold text-fuchsia-700">{formatDuration(r.pickupSpanSec)}</span>
                                        {r.pickupSpanOngoing && <span className="ml-1 text-amber-600 font-medium">· ongoing</span>}
                                        <span className="block text-slate-400">INPROGRESS &rarr; {r.pickupSpanOngoing ? 'now' : 'DISPATCHED'} · excl. Sun</span>
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">not in progress yet</span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-2.5 py-2 whitespace-nowrap">
                                <button
                                  onClick={() => openPoItemsModal(r.poNumber, {
                                    orderAmount: r.poAmount != null ? Number(r.poAmount) : null,
                                    couponAmount: r.CoupanAmount != null ? Number(r.CoupanAmount) : null,
                                    badhoDiscount: r.PaymentOptionDiscountByBadho != null ? Number(r.PaymentOptionDiscountByBadho) : null,
                                    appliedWalletAmount: r.appliedWalletAmount != null ? Number(r.appliedWalletAmount) : null,
                                    paidAmount: r.paidAmount != null ? Number(r.paidAmount) : null,
                                    sellerDiscount: r.discountBySeller != null ? Number(r.discountBySeller) : null,
                                    paymentOption: r.PaymentOption,
                                  })}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 hover:text-emerald-800 text-[11px] font-bold border border-emerald-300 hover:border-emerald-400 transition-all"
                                  title="View items in this PO"
                                >
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                                    <line x1="12" y1="22.08" x2="12" y2="12" />
                                  </svg>
                                  View Items
                                </button>
                              </td>
                              <td className="px-2.5 py-2 whitespace-nowrap">
                                <a
                                  href={`https://badho.freshdesk.com/a/search/tickets?term=${encodeURIComponent(r.poNumber)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-sky-50 hover:bg-sky-100 text-sky-700 hover:text-sky-800 text-[11px] font-bold border border-sky-300 hover:border-sky-400 transition-all"
                                  title={`Search Freshdesk tickets for PO ${r.poNumber}`}
                                >
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <circle cx="11" cy="11" r="8" />
                                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                  </svg>
                                  View Ticket
                                </a>
                              </td>
                              <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.orderStatus || <span className="text-slate-400">—</span>}</td>
                              <td className="px-2.5 py-2 text-right text-slate-900 tabular-nums whitespace-nowrap">{r.itemTotal != null ? `₹${Number(r.itemTotal).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                              <td className="px-2.5 py-2 text-right text-slate-900 tabular-nums font-semibold whitespace-nowrap">{r.grossAmount != null ? `₹${Number(r.grossAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                              <td className="px-2.5 py-2 text-right text-emerald-700 tabular-nums whitespace-nowrap">{r.orderMarginDiscount != null ? `₹${Number(r.orderMarginDiscount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                              <td className="px-2.5 py-2 text-right text-fuchsia-700 tabular-nums whitespace-nowrap">{r.CoupanAmount ? `₹${Number(r.CoupanAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                              <td className="px-2.5 py-2 text-right text-cyan-700 tabular-nums whitespace-nowrap">{r.appliedWalletAmount ? `₹${Number(r.appliedWalletAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                              <td className="px-2.5 py-2 text-right text-amber-700 tabular-nums whitespace-nowrap">{r.discountBySeller ? `₹${Number(r.discountBySeller).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                              <td className="px-2.5 py-2 text-right text-amber-700 tabular-nums whitespace-nowrap">{r.PaymentOptionDiscountByBadho ? `₹${Number(r.PaymentOptionDiscountByBadho).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                              <td className="px-2.5 py-2 text-right text-amber-700 tabular-nums whitespace-nowrap">{r.codAmountToBeCollected != null ? `₹${Number(r.codAmountToBeCollected).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                              <td className="px-2.5 py-2 whitespace-nowrap">
                                {r.deliveryStatus ? <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-100 text-cyan-700 border border-cyan-200">{r.deliveryStatus}</span> : <span className="text-slate-400">—</span>}
                              </td>
                              <td className="px-2.5 py-2 text-right text-emerald-700 tabular-nums font-medium whitespace-nowrap">{r.paidAmount != null ? `₹${Number(r.paidAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                              <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.PaymentOption || <span className="text-slate-400">—</span>}</td>
                              <td className="px-2.5 py-2 tabular-nums whitespace-nowrap">{awbLink(r.awbNumber)}</td>
                              <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.courierName || <span className="text-slate-400">—</span>}</td>
                              <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.paymentDate ? formatDateTime(r.paymentDate) : <span className="text-slate-400">—</span>}</td>
                              <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.paymentEvent || <span className="text-slate-400">—</span>}</td>
                              <td className="px-2.5 py-2 font-medium">
                                {r.buyerBusinessName ? (
                                  <button
                                    type="button"
                                    onClick={() => openBuyerModal({ phone: r.buyerPhone, businessName: r.buyerBusinessName })}
                                    className="text-purple-700 hover:text-purple-900 hover:underline hover:bg-purple-50 px-1 -mx-1 rounded transition-all cursor-pointer text-left"
                                    title="View buyer details"
                                  >
                                    {r.buyerBusinessName}
                                  </button>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="px-2.5 py-2 tabular-nums whitespace-nowrap">
                                {r.buyerPhone ? (
                                  <button
                                    type="button"
                                    onClick={() => openBuyerModal({ phone: r.buyerPhone, businessName: r.buyerBusinessName })}
                                    className="text-purple-700 hover:text-purple-900 hover:underline hover:bg-purple-50 px-1 -mx-1 rounded transition-all cursor-pointer"
                                    title="View buyer details"
                                  >
                                    {r.buyerPhone}
                                  </button>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="px-2.5 py-2 text-slate-600 text-xs max-w-md" title={r.buyerFullAddress}>
                                {r.buyerFullAddress ? <div className="whitespace-normal break-words">{r.buyerFullAddress}</div> : <span className="text-slate-400">—</span>}
                              </td>
                              <td className="px-2.5 py-2 font-medium">
                                {r.sellerBusinessName ? (
                                  <button
                                    type="button"
                                    onClick={() => openSellerModal({ phone: r.sellerPhone, businessName: r.sellerBusinessName })}
                                    className="text-purple-700 hover:text-purple-900 hover:underline hover:bg-purple-50 px-1 -mx-1 rounded transition-all cursor-pointer text-left"
                                    title="View seller details"
                                  >
                                    {r.sellerBusinessName}
                                  </button>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="px-2.5 py-2 tabular-nums whitespace-nowrap">
                                {r.sellerPhone ? (
                                  <button
                                    type="button"
                                    onClick={() => openSellerModal({ phone: r.sellerPhone, businessName: r.sellerBusinessName })}
                                    className="text-purple-700 hover:text-purple-900 hover:underline hover:bg-purple-50 px-1 -mx-1 rounded transition-all cursor-pointer"
                                    title="View seller details"
                                  >
                                    {r.sellerPhone}
                                  </button>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="px-2.5 py-2 text-slate-600 text-xs max-w-md" title={r.sellerFullAddress || ''}>
                                {r.sellerFullAddress ? <div className="whitespace-normal break-words">{r.sellerFullAddress}</div> : <span className="text-slate-400">—</span>}
                              </td>
                              <td className="px-2.5 py-2 whitespace-nowrap bg-amber-50/40">
                                <div className="text-[9px] font-mono text-amber-700/90 leading-tight">{statusMarkedFieldFor(r.orderStatus)}</div>
                                <div className="text-slate-700 mt-0.5">{r.statusMarkedTime ? formatDateTime(r.statusMarkedTime) : <span className="text-slate-400">—</span>}</div>
                              </td>
                              <td className="px-2.5 py-2 text-slate-700 tabular-nums whitespace-nowrap bg-amber-50/40 font-medium" title={r.statusDurationSec != null ? `${r.statusDurationSec.toFixed(0)} seconds` : undefined}>{formatDuration(r.statusDurationSec)}</td>
                              <td className="px-2.5 py-2 text-indigo-700 tabular-nums whitespace-nowrap bg-indigo-50/50 font-medium" title="Time since the order was placed (markedPendingTime), including Sundays">{formatDuration(r.orderAgeingSec)}</td>
                              <td className="px-2.5 py-2 text-indigo-700 tabular-nums whitespace-nowrap bg-indigo-50/50 font-medium" title="Brand SLA — time from PENDING to INPROGRESS (the brand accepting the order). 'ongoing' = still PENDING.">{formatDuration(r.brandSpanSec)}{r.brandSpanOngoing && <span className="ml-1 text-amber-600 text-[10px] font-medium">ongoing</span>}</td>
                              <td className="px-2.5 py-2 text-fuchsia-700 tabular-nums whitespace-nowrap bg-indigo-50/50 font-medium" title="Pickup SLA — time from INPROGRESS to DISPATCHED (handed to courier). 'ongoing' = in progress, not yet dispatched.">{r.pickupSpanSec != null ? (<>{formatDuration(r.pickupSpanSec)}{r.pickupSpanOngoing && <span className="ml-1 text-amber-600 text-[10px] font-medium">ongoing</span>}</>) : <span className="text-slate-400">not in progress</span>}</td>
                              <td className="px-2.5 py-2 text-orange-700 whitespace-nowrap">{r.RefundIntiatedTime ? formatDateTime(r.RefundIntiatedTime) : <span className="text-slate-400">—</span>}</td>
                              <td className="px-2.5 py-2 text-emerald-700 whitespace-nowrap">{r.RefundCompletedTime ? formatDateTime(r.RefundCompletedTime) : <span className="text-slate-400">—</span>}</td>
                              <td className="px-2.5 py-2 text-right text-emerald-700 tabular-nums font-medium whitespace-nowrap">{r.RefundAmount != null ? `₹${Number(r.RefundAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                              <td className="px-2.5 py-2 text-rose-700 text-xs max-w-[260px] bg-rose-50/40" title={r.rejectReason || ''}>{r.rejectReason ? <div className="whitespace-normal break-words">{r.rejectReason}</div> : <span className="text-slate-400">—</span>}</td>
                              <td className="px-2.5 py-2 text-rose-700 whitespace-nowrap bg-rose-50/40">{r.rejectedBy || <span className="text-slate-400">—</span>}</td>
                              <td className="px-2.5 py-2 text-rose-700 text-xs max-w-[260px] bg-rose-50/40" title={r.reasonAddedByBadhoTeam || ''}>{r.reasonAddedByBadhoTeam ? <div className="whitespace-normal break-words">{r.reasonAddedByBadhoTeam}</div> : <span className="text-slate-400">—</span>}</td>
                              {renderScanCell(r.poNumber, 0)}
                              {renderScanCell(r.poNumber, 1)}
                              {renderScanCell(r.poNumber, 2)}
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        {(() => {
                          const t = filtered.reduce((a, r) => {
                            a.itemTotal += Number(r.itemTotal) || 0;
                            a.gross  += Number(r.grossAmount) || 0;
                            a.margin += Number(r.orderMarginDiscount) || 0;
                            a.coupon += Number(r.CoupanAmount) || 0;
                            a.wallet += Number(r.appliedWalletAmount) || 0;
                            a.seller += Number(r.discountBySeller) || 0;
                            a.badho  += Number(r.PaymentOptionDiscountByBadho) || 0;
                            a.cod    += Number(r.codAmountToBeCollected) || 0;
                            a.paid   += Number(r.paidAmount) || 0;
                            a.refund += Number(r.RefundAmount) || 0;
                            return a;
                          }, { itemTotal: 0, gross: 0, margin: 0, coupon: 0, wallet: 0, seller: 0, badho: 0, cod: 0, paid: 0, refund: 0 });
                          const money = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
                          const cell = 'sticky bottom-0 z-20 bg-purple-600 px-2.5 py-3 text-[12px] font-extrabold text-white whitespace-nowrap';
                          const num = `${cell} text-right tabular-nums`;
                          return (
                            <tr className="shadow-[0_-2px_0_rgba(168,85,247,0.6)]">
                              <td className={`${cell} left-0 z-30 min-w-[160px] max-w-[160px] w-[160px] uppercase tracking-wider`}>Total</td>
                              <td className={`${cell} left-[160px] z-30 min-w-[120px] max-w-[120px] w-[120px]`}>{filtered.length.toLocaleString('en-IN')} orders</td>
                              <td className={`${cell} left-[280px] z-30 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.25)]`} />
                              <td className={cell} />
                              <td className={cell} />
                              <td className={cell} />
                              <td className={num}>{money(t.itemTotal)}</td>
                              <td className={num}>{money(t.gross)}</td>
                              <td className={num}>{money(t.margin)}</td>
                              <td className={num}>{money(t.coupon)}</td>
                              <td className={num}>{money(t.wallet)}</td>
                              <td className={num}>{money(t.seller)}</td>
                              <td className={num}>{money(t.badho)}</td>
                              <td className={num}>{money(t.cod)}</td>
                              <td className={cell} />
                              <td className={num}>{money(t.paid)}</td>
                              <td className={cell} />
                              <td className={cell} />
                              <td className={cell} />
                              <td className={cell} />
                              <td className={cell} />
                              <td className={cell} />
                              <td className={cell} />
                              <td className={cell} />
                              <td className={cell} />
                              <td className={cell} />
                              <td className={cell} />
                              <td className={cell} />
                              <td className={cell} />
                              <td className={cell} />
                              <td className={num}>{money(t.refund)}</td>
                              <td className={cell} />
                              <td className={cell} />
                              <td className={cell} />
                              <td className={cell} />
                              <td className={cell} />
                              <td className={cell} />
                            </tr>
                          );
                        })()}
                      </tfoot>
                    </table>
                  );
                })()}
              </div>
              {alertModalData && alertModalData.length > 2000 && (
                <div className="px-4 py-2 border-t border-amber-300 bg-amber-50 text-amber-700 text-xs">
                  Showing first 2,000 of {alertModalData.length.toLocaleString()} rows — CSV includes everything.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Group By aggregation modal for the SLA-breach / aging alert drill */}
        <GroupByModal
          open={!!alertModalCategory && alertGroupByDims.length > 0}
          dimensions={alertGroupByDims}
          rows={alertModalData ?? []}
          contextLabel={`${alertModalSource === 'aging' ? 'InProgress Aging' : 'SLA Breach'}${alertModalCategory ? ` · ${alertModalCategory}` : ''}${alertModalSeller ? ` · ${alertModalSeller}` : ''}`}
          onClose={() => setAlertGroupByDims([])}
          onChangeDimensions={setAlertGroupByDims}
        />

        {/* Status × Delivery Status Drilldown Modal */}
        {pivotDrillOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-2 bg-slate-950/70 backdrop-blur-md"
            onClick={closePivotDrill}
          >
            <div
              className="relative bg-white text-slate-900 border border-purple-400/50 rounded-2xl w-[98vw] max-w-[98vw] h-[96vh] max-h-[96vh] flex flex-col overflow-hidden animate-corner-breath"
              onClick={(e) => e.stopPropagation()}
            >
              {/* breathing purple corner accents */}
              <div className="pointer-events-none absolute -top-px -left-px w-20 h-20 rounded-tl-2xl border-t-2 border-l-2 border-purple-500 animate-edge-pulse" />
              <div className="pointer-events-none absolute -top-px -right-px w-20 h-20 rounded-tr-2xl border-t-2 border-r-2 border-purple-500 animate-edge-pulse" style={{ animationDelay: '0.6s' }} />
              <div className="pointer-events-none absolute -bottom-px -left-px w-20 h-20 rounded-bl-2xl border-b-2 border-l-2 border-purple-500 animate-edge-pulse" style={{ animationDelay: '1.2s' }} />
              <div className="pointer-events-none absolute -bottom-px -right-px w-20 h-20 rounded-br-2xl border-b-2 border-r-2 border-purple-500 animate-edge-pulse" style={{ animationDelay: '1.8s' }} />

              <div className="relative px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-purple-50 via-white to-fuchsia-50/60">
                <div>
                  <h3 className="text-lg font-extrabold tracking-tight flex items-center gap-2 text-slate-900">
                    <span className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.7)] animate-pulse" />
                    <span>{pivotDrillStateName ? `${pivotDrillStateName} · ${pivotDrillBucketLabel}` : pivotDrillZone ? `${pivotDrillZone.seller ? `${pivotDrillZone.seller} · ` : ''}${pivotDrillZone.zone ? `Zone ${pivotDrillZone.zone}` : 'All zones'}${pivotDrillZone.zoneStatus ? ` · ${pivotDrillZone.zoneStatus}` : ''}` : pivotDrillStatus.includes(',') ? `Achieved · ${pivotDrillStatus.split(',').join(' + ')}` : (pivotDrillStatus || (pivotDrillPaymentFilter.size > 0 ? Array.from(pivotDrillPaymentFilter).join(' + ') : 'All orders'))}</span>
                    {pivotDrillDelivery !== undefined && (
                      <span className="text-slate-400 text-sm font-normal mx-1">→</span>
                    )}
                    {pivotDrillDelivery !== undefined && (
                      <span className="text-purple-700 text-sm font-bold">
                        {pivotDrillDelivery ?? '(no delivery status)'}
                      </span>
                    )}
                  </h3>
                  <p className="text-slate-500 text-xs mt-1">
                    {pivotDrillStateName
                      ? pivotDrillMonthLabel
                      : pivotDrillZone
                      ? pivotDrillZone.label
                      : pivotDrillWeek
                      ? `Week ${pivotDrillWeek}${pivotDrillWeekLabel ? ` (w/c ${pivotDrillWeekLabel})` : ''} · ${currentYear}`
                      : pivotDrillDay && pivotDrillMonth
                      ? `${MONTH_NAMES[pivotDrillMonth - 1]} ${pivotDrillDay}, ${currentYear}`
                      : pivotDrillMonth ? `${MONTH_NAMES[pivotDrillMonth - 1]} ${currentYear}` : `${currentYear} (all months)`}
                    {' · '}
                    {pivotDrillLoading
                      ? 'Loading…'
                      : pivotDrillRows
                      ? <span className="text-slate-900 font-semibold">{filteredPivotDrillRows?.length ?? 0} of {pivotDrillRows.length} orders</span>
                      : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Group By — hidden behind this toggle; multi-select angles, top-right corner */}
                  <GroupByMenu selected={groupByDims} onChange={setGroupByDims} align="right" />
                  <button
                    className="px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 border border-purple-600 text-white text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_2px_8px_-2px_rgba(168,85,247,0.5)]"
                    disabled={!filteredPivotDrillRows || filteredPivotDrillRows.length === 0}
                    onClick={() => {
                      if (!filteredPivotDrillRows) return;
                      const isRejected = pivotDrillStatus === 'REJECTED';
                      const headers = [
                        'Pushed', 'PO Number', 'Order Status', 'Buyer Address', 'Item Total', 'Gross Amount', 'Item Discount', 'Paid Amount', 'Coupon Amount',
                        'Seller Discount', 'Applied Wallet Amount', 'Payment Option',
                        'AWB Number', 'Courier Name', 'COD Amount', 'Buyer Phone',
                        'Payment Option Badho Discount', 'Payment Date', 'Payment Event',
                        'Delivery Status', 'Buyer Business', 'Seller Phone', 'Seller Business',
                        'Marked Pending', 'Refund Initiated', 'Refund Completed',
                        ...(isRejected ? ['Reject Reason', 'Rejected By', 'Reason Added By Badho Team'] : []),
                      ];
                      const rows: CsvCell[][] = filteredPivotDrillRows.map((r) => [
                        r.pushedStatus ?? 'Not Pushed', r.poNumber, r.orderStatus ?? r.status, r.buyerFullAddress ?? '',
                        r.itemTotal ?? '', r.grossAmount ?? '', r.orderMarginDiscount ?? '', r.paidAmount ?? '', r.CoupanAmount ?? '',
                        r.discountBySeller ?? '', r.appliedWalletAmount ?? '', r.PaymentOption ?? '',
                        r.awbNumber ?? '', r.courierName ?? '', r.codAmountToBeCollected ?? '', r.buyerPhone ?? '',
                        r.PaymentOptionDiscountByBadho ?? '', r.paymentDate ?? '', r.paymentEvent ?? '',
                        r.deliveryStatus ?? '', r.buyerBusinessName ?? '', r.sellerPhone ?? '', r.sellerBusinessName ?? '',
                        r.MarkedpendingTime ?? r.markedPendingTime ?? '',
                        r.RefundIntiatedTime ?? '', r.RefundCompletedTime ?? '',
                        ...(isRejected ? [r.rejectReason ?? '', r.rejectedBy ?? '', r.reasonAddedByBadhoTeam ?? ''] : []),
                      ]);
                      const monthTag = pivotDrillMonth ? MONTH_NAMES[pivotDrillMonth - 1] : 'all';
                      const deliveryTag = pivotDrillDelivery === undefined ? 'all' : (pivotDrillDelivery ?? 'null');
                      downloadCSV(`status-delivery-${pivotDrillStatus}-${deliveryTag}-${monthTag}-${currentYear}.csv`, headers, rows);
                    }}
                  >
                    ↓ CSV
                  </button>
                  <button
                    onClick={closePivotDrill}
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-600 text-base font-semibold transition-all hover:rotate-90"
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="relative px-4 py-2 border-b border-slate-200 bg-slate-50/80">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Search — compact, fixed width */}
                  <div className="relative w-64 max-w-full">
                    <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-3.5-3.5" />
                    </svg>
                    <input
                      id="pivot-drill-search"
                      type="text"
                      value={pivotDrillSearch}
                      onChange={(e) => setPivotDrillSearch(e.target.value)}
                      placeholder="Search PO, buyer, seller…"
                      className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-400 focus:border-purple-400"
                    />
                    {pivotDrillSearch && (
                      <button
                        type="button"
                        onClick={() => setPivotDrillSearch('')}
                        aria-label="Clear search"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 h-4 w-4 inline-flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700 text-xs"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {/* Pushed — compact segmented pill */}
                  <div role="group" aria-label="Filter by pushed status" className="inline-flex rounded-md border border-slate-300 overflow-hidden text-xs bg-white shrink-0">
                    {([
                      { value: 'all' as const, label: 'All', count: pivotPushedCounts.all },
                      { value: 'Pushed' as const, label: 'Pushed', count: pivotPushedCounts.pushed },
                      { value: 'Not Pushed' as const, label: 'Not Pushed', count: pivotPushedCounts.notPushed },
                    ]).map((opt, idx) => {
                      const active = pivotDrillPushedFilter === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setPivotDrillPushedFilter(opt.value)}
                          aria-pressed={active}
                          className={`px-2.5 py-1.5 whitespace-nowrap transition-colors font-medium ${idx > 0 ? 'border-l border-slate-300' : ''} ${active ? 'bg-purple-500 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                        >
                          {opt.label}
                          <span className={`ml-1 text-[10px] tabular-nums ${active ? 'text-white/90' : 'text-slate-500'}`}>{opt.count}</span>
                        </button>
                      );
                    })}
                  </div>

                  {pivotPaymentOptions.length > 1 && (
                    <MultiSelectFilter
                      label="Payment"
                      allLabel="All payments"
                      options={pivotPaymentOptions}
                      selected={pivotDrillPaymentFilter}
                      onChange={setPivotDrillPaymentFilter}
                      widthClass="w-44"
                    />
                  )}

                  {pivotCourierOptions.length > 1 && (
                    <MultiSelectFilter
                      label="Courier"
                      allLabel="All couriers"
                      options={pivotCourierOptions}
                      selected={pivotDrillCourierFilter}
                      onChange={setPivotDrillCourierFilter}
                      widthClass="w-44"
                    />
                  )}

                  {pivotDeliveryOptions.length > 1 && (
                    <MultiSelectFilter
                      label="Delivery"
                      allLabel="All delivery"
                      options={pivotDeliveryOptions}
                      selected={pivotDrillDeliveryFilter}
                      onChange={setPivotDrillDeliveryFilter}
                      widthClass="w-44"
                    />
                  )}

                  {pivotRejectReasonOptions.length > 0 && (
                    <MultiSelectFilter
                      label="Reason"
                      allLabel="All reasons"
                      options={pivotRejectReasonOptions}
                      selected={pivotDrillRejectReasonFilter}
                      onChange={setPivotDrillRejectReasonFilter}
                      widthClass="w-48"
                    />
                  )}
                </div>

                {pivotDrillHasActiveFilters && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">Active</span>
                    {pivotDrillSearch.trim() !== '' && (
                      <button
                        type="button"
                        onClick={() => setPivotDrillSearch('')}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] border border-slate-300 font-medium"
                      >
                        <span>Search: &ldquo;{pivotDrillSearch.length > 24 ? `${pivotDrillSearch.slice(0, 24)}…` : pivotDrillSearch}&rdquo;</span>
                        <span aria-hidden className="text-slate-500">×</span>
                        <span className="sr-only">Remove search filter</span>
                      </button>
                    )}
                    {pivotDrillPushedFilter !== 'all' && (
                      <button
                        type="button"
                        onClick={() => setPivotDrillPushedFilter('all')}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] border border-slate-300 font-medium"
                      >
                        <span>Pushed: {pivotDrillPushedFilter}</span>
                        <span aria-hidden className="text-slate-500">×</span>
                        <span className="sr-only">Remove pushed filter</span>
                      </button>
                    )}
                    {pivotDrillPaymentFilter.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setPivotDrillPaymentFilter(new Set())}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] border border-slate-300 font-medium"
                      >
                        <span>Payment: {pivotDrillPaymentFilter.size} selected</span>
                        <span aria-hidden className="text-slate-500">×</span>
                      </button>
                    )}
                    {pivotDrillCourierFilter.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setPivotDrillCourierFilter(new Set())}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] border border-slate-300 font-medium"
                      >
                        <span>Courier: {pivotDrillCourierFilter.size} selected</span>
                        <span aria-hidden className="text-slate-500">×</span>
                      </button>
                    )}
                    {pivotDrillDeliveryFilter.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setPivotDrillDeliveryFilter(new Set())}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] border border-slate-300 font-medium"
                      >
                        <span>Delivery: {pivotDrillDeliveryFilter.size} selected</span>
                        <span aria-hidden className="text-slate-500">×</span>
                      </button>
                    )}
                    {pivotDrillRejectReasonFilter.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setPivotDrillRejectReasonFilter(new Set())}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] border border-slate-300 font-medium"
                      >
                        <span>Reason: {pivotDrillRejectReasonFilter.size} selected</span>
                        <span aria-hidden className="text-slate-500">×</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={resetPivotDrillFilters}
                      className="ml-auto text-[11px] font-semibold text-purple-600 hover:text-purple-700 underline underline-offset-2"
                    >
                      Clear all
                    </button>
                  </div>
                )}
              </div>
              <div className="relative flex-1 overflow-auto">
                {pivotDrillLoading ? (
                  <div className="px-6 py-12 text-center text-slate-500">Loading orders…</div>
                ) : pivotDrillError ? (
                  <div className="px-6 py-12 text-center text-rose-600">{pivotDrillError}</div>
                ) : !pivotDrillRows || pivotDrillRows.length === 0 ? (
                  <div className="px-6 py-12 text-center text-slate-500">No orders found</div>
                ) : !filteredPivotDrillRows || filteredPivotDrillRows.length === 0 ? (
                  <div className="px-6 py-12 text-center text-slate-500">No matches for &ldquo;{pivotDrillSearch}&rdquo;</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="shadow-[0_2px_0_rgba(168,85,247,0.4)]">
                      <tr className="border-b border-slate-200">
                        {(() => {
                          const arrowFor = (k: string) => {
                            const active = pivotDrillSort?.key === k;
                            const dir = active ? pivotDrillSort?.direction : null;
                            return (
                              <span className={`ml-1 text-[10px] leading-none ${active ? 'text-purple-600' : 'text-slate-300'}`}>
                                {dir === 'asc' ? '▲' : dir === 'desc' ? '▼' : '⇅'}
                              </span>
                            );
                          };
                          const SortTh = ({ k, label, align = 'left', cls = '' }: { k: string; label: string; align?: 'left' | 'right'; cls?: string }) => (
                            <th
                              onClick={() => togglePivotSort(k)}
                              className={`sticky top-0 z-20 bg-slate-100 px-2.5 py-2.5 text-${align} text-[11px] font-bold cursor-pointer select-none hover:bg-slate-200/80 whitespace-nowrap uppercase tracking-wider ${cls || 'text-slate-700'}`}
                            >
                              <span className={`inline-flex items-center ${align === 'right' ? 'justify-end w-full' : ''}`}>
                                {label}
                                {arrowFor(k)}
                              </span>
                            </th>
                          );
                          return (
                            <>
                              <th
                                onClick={() => togglePivotSort('markedPending')}
                                className="sticky top-0 left-0 z-30 bg-amber-50 min-w-[160px] max-w-[160px] w-[160px] px-2.5 py-2.5 text-left text-[11px] font-bold cursor-pointer select-none hover:bg-amber-100 whitespace-nowrap uppercase tracking-wider text-amber-800"
                              >
                                <span className="inline-flex items-center">Marked Pending{arrowFor('markedPending')}</span>
                              </th>
                              <th
                                onClick={() => togglePivotSort('pushed')}
                                className="sticky top-0 left-[160px] z-30 bg-slate-100 min-w-[120px] max-w-[120px] w-[120px] px-2.5 py-2.5 text-left text-[11px] font-bold cursor-pointer select-none hover:bg-slate-200 whitespace-nowrap uppercase tracking-wider text-slate-700"
                              >
                                <span className="inline-flex items-center">Pushed{arrowFor('pushed')}</span>
                              </th>
                              <th
                                onClick={() => togglePivotSort('poNumber')}
                                className="sticky top-0 left-[280px] z-30 bg-slate-100 px-2.5 py-2.5 text-left text-[11px] font-bold cursor-pointer select-none hover:bg-slate-200 whitespace-nowrap uppercase tracking-wider text-slate-700 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]"
                              >
                                <span className="inline-flex items-center">PO Number{arrowFor('poNumber')}</span>
                              </th>
                              <th className="sticky top-0 z-20 bg-slate-100 px-2.5 py-2.5 text-left text-[11px] font-bold text-slate-700 whitespace-nowrap uppercase tracking-wider">Items</th>
                              <th className="sticky top-0 z-20 bg-slate-100 px-2.5 py-2.5 text-left text-[11px] font-bold text-slate-700 whitespace-nowrap uppercase tracking-wider">View Ticket</th>
                              <SortTh k="status" label="Order Status" />
                              <SortTh k="itemTotal" label="Item Total" align="right" />
                              <SortTh k="grossAmount" label="Gross Amount" align="right" />
                              <SortTh k="orderMarginDiscount" label="Item Discount" align="right" />
                              <SortTh k="coupon" label="Coupon Amount" align="right" />
                              <SortTh k="wallet" label="Applied Wallet Amount" align="right" />
                              <SortTh k="sellerDiscount" label="Seller Discount" align="right" />
                              <SortTh k="badhoDiscount" label="Payment Option Badho Discount" align="right" />
                              <SortTh k="cod" label="COD Amount" align="right" />
                              <SortTh k="deliveryStatus" label="Delivery Status" />
                              <SortTh k="paidAmount" label="Paid Amount" align="right" />
                              <SortTh k="paymentOption" label="Payment Option" />
                              <SortTh k="awb" label="AWB Number" />
                              <SortTh k="courier" label="Courier Name" />
                              <SortTh k="paymentDate" label="Payment Date" />
                              <SortTh k="paymentEvent" label="Payment Event" />
                              <SortTh k="buyerBusiness" label="Buyer Business" />
                              <SortTh k="buyerPhone" label="Buyer Phone" />
                              <th className="sticky top-0 z-20 bg-slate-100 px-2.5 py-2.5 text-left text-[11px] font-bold text-slate-700 whitespace-nowrap uppercase tracking-wider">Buyer Address</th>
                              <SortTh k="sellerBusiness" label="Seller Business" />
                              <SortTh k="sellerPhone" label="Seller Phone" />
                              <SortTh k="statusMarkedTime" label={statusMarkedHeaderFor(filteredPivotDrillRows)} cls="text-slate-700 bg-amber-50/60" />
                              <SortTh k="statusDuration" label="Status Duration" cls="text-slate-700 bg-amber-50/60" />
                              <SortTh k="refundInit" label="Refund Initiated" />
                              <SortTh k="refundDone" label="Refund Completed" />
                              <SortTh k="refundAmount" label="Refund Amount" align="right" />
                              <SortTh k="rejectReason" label="Reject Reason" cls="text-rose-700 bg-rose-50" />
                              <SortTh k="rejectedBy" label="Rejected By" cls="text-rose-700 bg-rose-50" />
                              <SortTh k="reasonByBadho" label="Reason Added By Badho Team" cls="text-rose-700 bg-rose-50" />
                              <th className="sticky top-0 z-20 bg-indigo-50 px-2.5 py-2.5 text-left text-[11px] font-bold text-indigo-700 whitespace-nowrap uppercase tracking-wider">Latest Scan 1</th>
                              <th className="sticky top-0 z-20 bg-indigo-50 px-2.5 py-2.5 text-left text-[11px] font-bold text-indigo-700 whitespace-nowrap uppercase tracking-wider">Latest Scan 2</th>
                              <th className="sticky top-0 z-20 bg-indigo-50 px-2.5 py-2.5 text-left text-[11px] font-bold text-indigo-700 whitespace-nowrap uppercase tracking-wider">Latest Scan 3</th>
                            </>
                          );
                        })()}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPivotDrillRows.map((r, idx) => {
                        const paid = Number(r.paidAmount ?? 0);
                        const isFullyPaid = r.PaymentOption === 'FULLY_PAID' && paid > 0;
                        const isPartialPaid = r.PaymentOption === 'PARTIALLY_PAID' && paid > 0;
                        const rowBg = isFullyPaid
                          ? 'bg-emerald-50'
                          : isPartialPaid
                          ? 'bg-violet-50'
                          : (idx % 2 === 0 ? 'bg-white' : 'bg-slate-50');
                        return (
                        <tr
                          key={r.poNumber}
                          className={`group border-b border-slate-100 align-top transition-colors ${rowBg} hover:bg-purple-50`}
                        >
                          <td className={`sticky left-0 z-10 ${rowBg} group-hover:bg-purple-50 min-w-[160px] max-w-[160px] w-[160px] px-2.5 py-2 whitespace-nowrap text-amber-800 font-medium`}>
                            {formatDateTime(r.MarkedpendingTime ?? r.markedPendingTime)}
                          </td>
                          <td className={`sticky left-[160px] z-10 ${rowBg} group-hover:bg-purple-50 min-w-[120px] max-w-[120px] w-[120px] px-2.5 py-2 whitespace-nowrap`}>
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${r.pushedStatus === 'Pushed' ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-rose-100 text-rose-700 border border-rose-300'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${r.pushedStatus === 'Pushed' ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]' : 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.7)]'}`} />
                              {r.pushedStatus || 'Not Pushed'}
                            </span>
                          </td>
                          <td className={`sticky left-[280px] z-10 ${rowBg} group-hover:bg-purple-50 px-2.5 py-2 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]`}>
                            <div className="inline-flex items-center gap-2">
                              <span className="text-slate-900 tabular-nums font-bold">{r.poNumber}</span>
                              <a
                                href={`https://d2r-support-dashboard.vercel.app/?po_number=${encodeURIComponent(r.poNumber)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 hover:border-purple-300 transition-all"
                                title="Open in D2R Support Dashboard"
                              >
                                Details
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M7 17L17 7" />
                                  <polyline points="7 7 17 7 17 17" />
                                </svg>
                              </a>
                            </div>
                            <div className="text-[10px] text-slate-500 tabular-nums mt-0.5" title="AWB number">
                              AWB: {awbLink(r.awbNumber)}
                            </div>
                          </td>
                          <td className="px-2.5 py-2 whitespace-nowrap">
                            <button
                              onClick={() => openPoItemsModal(r.poNumber, {
                                orderAmount: r.poAmount != null ? Number(r.poAmount) : null,
                                couponAmount: r.CoupanAmount != null ? Number(r.CoupanAmount) : null,
                                badhoDiscount: r.PaymentOptionDiscountByBadho != null ? Number(r.PaymentOptionDiscountByBadho) : null,
                                appliedWalletAmount: r.appliedWalletAmount != null ? Number(r.appliedWalletAmount) : null,
                                paidAmount: r.paidAmount != null ? Number(r.paidAmount) : null,
                                sellerDiscount: r.discountBySeller != null ? Number(r.discountBySeller) : null,
                                paymentOption: r.PaymentOption,
                              })}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 hover:text-emerald-800 text-[11px] font-bold border border-emerald-300 hover:border-emerald-400 transition-all"
                              title="View items in this PO"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                                <line x1="12" y1="22.08" x2="12" y2="12" />
                              </svg>
                              View Items
                            </button>
                          </td>
                          <td className="px-2.5 py-2 whitespace-nowrap">
                            <a
                              href={`https://badho.freshdesk.com/a/search/tickets?term=${encodeURIComponent(r.poNumber)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-sky-50 hover:bg-sky-100 text-sky-700 hover:text-sky-800 text-[11px] font-bold border border-sky-300 hover:border-sky-400 transition-all"
                              title={`Search Freshdesk tickets for PO ${r.poNumber}`}
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                              </svg>
                              View Ticket
                            </a>
                          </td>
                          <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.orderStatus ?? r.status}</td>
                          <td className="px-2.5 py-2 text-right text-slate-900 tabular-nums whitespace-nowrap">{r.itemTotal != null ? `₹${Number(r.itemTotal).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 text-right text-slate-900 tabular-nums font-semibold whitespace-nowrap">{r.grossAmount != null ? `₹${Number(r.grossAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 text-right text-emerald-700 tabular-nums whitespace-nowrap">{r.orderMarginDiscount != null ? `₹${Number(r.orderMarginDiscount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 text-right text-fuchsia-700 tabular-nums whitespace-nowrap">{r.CoupanAmount ? `₹${Number(r.CoupanAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 text-right text-cyan-700 tabular-nums whitespace-nowrap">{r.appliedWalletAmount ? `₹${Number(r.appliedWalletAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 text-right text-amber-700 tabular-nums whitespace-nowrap">{r.discountBySeller ? `₹${Number(r.discountBySeller).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 text-right text-amber-700 tabular-nums whitespace-nowrap">{r.PaymentOptionDiscountByBadho ? `₹${Number(r.PaymentOptionDiscountByBadho).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 text-right text-amber-700 tabular-nums whitespace-nowrap">{r.codAmountToBeCollected != null ? `₹${Number(r.codAmountToBeCollected).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 whitespace-nowrap">
                            {r.deliveryStatus ? <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-100 text-cyan-700 border border-cyan-200">{r.deliveryStatus}</span> : <span className="text-slate-400">—</span>}
                          </td>
                          <td className="px-2.5 py-2 text-right text-emerald-700 tabular-nums font-medium whitespace-nowrap">{r.paidAmount != null ? `₹${Number(r.paidAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.PaymentOption || <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 tabular-nums whitespace-nowrap">{awbLink(r.awbNumber)}</td>
                          <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.courierName || <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.paymentDate ? formatDateTime(r.paymentDate) : <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.paymentEvent || <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 font-medium">
                            {r.buyerBusinessName ? (
                              <button
                                type="button"
                                onClick={() => openBuyerModal({ phone: r.buyerPhone, businessName: r.buyerBusinessName })}
                                className="text-purple-700 hover:text-purple-900 hover:underline hover:bg-purple-50 px-1 -mx-1 rounded transition-all cursor-pointer text-left"
                                title="View buyer details"
                              >
                                {r.buyerBusinessName}
                              </button>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-2.5 py-2 tabular-nums whitespace-nowrap">
                            {r.buyerPhone ? (
                              <button
                                type="button"
                                onClick={() => openBuyerModal({ phone: r.buyerPhone, businessName: r.buyerBusinessName })}
                                className="text-purple-700 hover:text-purple-900 hover:underline hover:bg-purple-50 px-1 -mx-1 rounded transition-all cursor-pointer"
                                title="View buyer details"
                              >
                                {r.buyerPhone}
                              </button>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-2.5 py-2 text-slate-600 text-xs max-w-md" title={[r.buyerAddressLine1, r.buyerLandmark, r.buyerPincode, r.buyerCity, r.buyerDistrict, r.buyerState].filter((v) => v != null && String(v).trim() !== '').join('_')}>
                            {[r.buyerAddressLine1, r.buyerLandmark, r.buyerPincode, r.buyerCity, r.buyerDistrict, r.buyerState].filter((v) => v != null && String(v).trim() !== '').length > 0 ? (
                              <div className="whitespace-normal break-words">
                                {[r.buyerAddressLine1, r.buyerLandmark, r.buyerPincode, r.buyerCity, r.buyerDistrict, r.buyerState].filter((v) => v != null && String(v).trim() !== '').join('_')}
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-2.5 py-2 font-medium">
                            {r.sellerBusinessName ? (
                              <button
                                type="button"
                                onClick={() => openSellerModal({ phone: r.sellerPhone, businessName: r.sellerBusinessName })}
                                className="text-purple-700 hover:text-purple-900 hover:underline hover:bg-purple-50 px-1 -mx-1 rounded transition-all cursor-pointer text-left"
                                title="View seller details"
                              >
                                {r.sellerBusinessName}
                              </button>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-2.5 py-2 tabular-nums whitespace-nowrap">
                            {r.sellerPhone ? (
                              <button
                                type="button"
                                onClick={() => openSellerModal({ phone: r.sellerPhone, businessName: r.sellerBusinessName })}
                                className="text-purple-700 hover:text-purple-900 hover:underline hover:bg-purple-50 px-1 -mx-1 rounded transition-all cursor-pointer"
                                title="View seller details"
                              >
                                {r.sellerPhone}
                              </button>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-2.5 py-2 whitespace-nowrap bg-amber-50/40">
                            <div className="text-[9px] font-mono text-amber-700/90 leading-tight">{statusMarkedFieldFor(r.orderStatus ?? r.status)}</div>
                            <div className="text-slate-700 mt-0.5">{r.statusMarkedTime ? formatDateTime(r.statusMarkedTime) : <span className="text-slate-400">—</span>}</div>
                          </td>
                          <td className="px-2.5 py-2 text-slate-700 tabular-nums whitespace-nowrap bg-amber-50/40 font-medium" title={r.statusDurationSec != null ? `${r.statusDurationSec.toFixed(0)} seconds` : undefined}>{formatDuration(r.statusDurationSec)}</td>
                          <td className="px-2.5 py-2 text-orange-700 whitespace-nowrap">{r.RefundIntiatedTime ? formatDateTime(r.RefundIntiatedTime) : <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 text-emerald-700 whitespace-nowrap">{r.RefundCompletedTime ? formatDateTime(r.RefundCompletedTime) : <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 text-right text-emerald-700 tabular-nums font-medium whitespace-nowrap">{r.RefundAmount != null ? `₹${Number(r.RefundAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 text-rose-700 text-xs max-w-[260px] bg-rose-50/40" title={r.rejectReason || ''}>{r.rejectReason ? <div className="whitespace-normal break-words">{r.rejectReason}</div> : <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 text-rose-700 whitespace-nowrap bg-rose-50/40">{r.rejectedBy || <span className="text-slate-400">—</span>}</td>
                          <td className="px-2.5 py-2 text-rose-700 text-xs max-w-[260px] bg-rose-50/40" title={r.reasonAddedByBadhoTeam || ''}>{r.reasonAddedByBadhoTeam ? <div className="whitespace-normal break-words">{r.reasonAddedByBadhoTeam}</div> : <span className="text-slate-400">—</span>}</td>
                          {renderScanCell(r.poNumber, 0)}
                          {renderScanCell(r.poNumber, 1)}
                          {renderScanCell(r.poNumber, 2)}
                        </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      {(() => {
                        const t = filteredPivotDrillRows.reduce((a, r) => {
                          a.itemTotal += Number(r.itemTotal) || 0;
                          a.gross  += Number(r.grossAmount) || 0;
                          a.margin += Number(r.orderMarginDiscount) || 0;
                          a.coupon += Number(r.CoupanAmount) || 0;
                          a.wallet += Number(r.appliedWalletAmount) || 0;
                          a.seller += Number(r.discountBySeller) || 0;
                          a.badho  += Number(r.PaymentOptionDiscountByBadho) || 0;
                          a.cod    += Number(r.codAmountToBeCollected) || 0;
                          a.paid   += Number(r.paidAmount) || 0;
                          a.refund += Number(r.RefundAmount) || 0;
                          return a;
                        }, { itemTotal: 0, gross: 0, margin: 0, coupon: 0, wallet: 0, seller: 0, badho: 0, cod: 0, paid: 0, refund: 0 });
                        const money = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
                        const cell = 'sticky bottom-0 z-20 bg-purple-600 px-2.5 py-3 text-[12px] font-extrabold text-white whitespace-nowrap';
                        const num = `${cell} text-right tabular-nums`;
                        return (
                          <tr className="shadow-[0_-2px_0_rgba(168,85,247,0.6)]">
                            <td className={`${cell} left-0 z-30 min-w-[160px] max-w-[160px] w-[160px] uppercase tracking-wider`}>Total</td>
                            <td className={`${cell} left-[160px] z-30 min-w-[120px] max-w-[120px] w-[120px]`}>{filteredPivotDrillRows.length.toLocaleString('en-IN')} orders</td>
                            <td className={`${cell} left-[280px] z-30 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.25)]`} />
                            <td className={cell} />
                            <td className={cell} />
                            <td className={cell} />
                            <td className={num}>{money(t.itemTotal)}</td>
                            <td className={num}>{money(t.gross)}</td>
                            <td className={num}>{money(t.margin)}</td>
                            <td className={num}>{money(t.coupon)}</td>
                            <td className={num}>{money(t.wallet)}</td>
                            <td className={num}>{money(t.seller)}</td>
                            <td className={num}>{money(t.badho)}</td>
                            <td className={num}>{money(t.cod)}</td>
                            <td className={cell} />
                            <td className={num}>{money(t.paid)}</td>
                            <td className={cell} />
                            <td className={cell} />
                            <td className={cell} />
                            <td className={cell} />
                            <td className={cell} />
                            <td className={cell} />
                            <td className={cell} />
                            <td className={cell} />
                            <td className={cell} />
                            <td className={cell} />
                            <td className={cell} />
                            <td className={cell} />
                            <td className={cell} />
                            <td className={cell} />
                            <td className={num}>{money(t.refund)}</td>
                            <td className={cell} />
                            <td className={cell} />
                            <td className={cell} />
                            <td className={cell} />
                            <td className={cell} />
                            <td className={cell} />
                          </tr>
                        );
                      })()}
                    </tfoot>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Group By aggregation modal — composite grouping over the current (filtered) drill rows */}
        <GroupByModal
          open={pivotDrillOpen && groupByDims.length > 0}
          dimensions={groupByDims}
          rows={filteredPivotDrillRows ?? []}
          contextLabel={`${pivotDrillStatus.includes(',') ? pivotDrillStatus.split(',').join(' + ') : (pivotDrillStatus || 'All orders')}${pivotDrillMonth ? ` · ${MONTH_NAMES[pivotDrillMonth - 1]} ${currentYear}` : ` · ${currentYear}`}`}
          onClose={() => setGroupByDims([])}
          onChangeDimensions={setGroupByDims}
        />

        {/* Seller Drilldown Modal */}
        {sellerDrillId !== null && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            onClick={closeSellerDrill}
          >
            <div
              className="bg-white text-slate-900 border border-slate-200 rounded-2xl max-w-7xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-slate-50 to-purple-50">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{sellerDrillName}</h3>
                  <p className="text-slate-500 text-sm tabular-nums mt-0.5">{sellerDrillPhone}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className={DOWNLOAD_BTN_LIGHT_CLASS}
                    disabled={!filteredSellerDrillRows || filteredSellerDrillRows.length === 0}
                    onClick={() => {
                      if (!filteredSellerDrillRows) return;
                      const headers = ['PO Number', 'Status', 'Buyer Address', 'Amount', 'Buyer Phone', 'Buyer Business', 'Marked Pending', 'Created At'];
                      const rows: CsvCell[][] = filteredSellerDrillRows.map((r) => [
                        r.poNumber, r.status, r.buyerFullAddress ?? '', r.amount, r.buyerPhone, r.buyerBusinessName, r.markedPendingTime, r.createdAt,
                      ]);
                      const safeName = (sellerDrillName || 'seller').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40);
                      downloadCSV(`seller-orders-${safeName}-${currentYear}.csv`, headers, rows);
                    }}
                  >
                    ↓ CSV
                  </button>
                  <button
                    onClick={closeSellerDrill}
                    className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-medium"
                  >
                    Close
                  </button>
                </div>
              </div>

              {sellerDrillSummary && (
                <div className="px-6 py-4 border-b border-slate-200 bg-white grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                    <div className="text-xs text-slate-500 uppercase tracking-wide">Orders</div>
                    <div className="text-2xl font-bold text-slate-900 tabular-nums">{sellerDrillSummary.total.toLocaleString()}</div>
                    {sellerDrillRows && sellerDrillRows.length !== sellerDrillSummary.total && (
                      <div className="text-xs text-slate-400 mt-0.5">of {sellerDrillRows.length.toLocaleString()}</div>
                    )}
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                    <div className="text-xs text-slate-500 uppercase tracking-wide">Revenue</div>
                    <div className="text-2xl font-bold text-slate-900 tabular-nums">{formatAmount(sellerDrillSummary.amount)}</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                    <div className="text-xs text-slate-500 uppercase tracking-wide">Avg Order</div>
                    <div className="text-2xl font-bold text-slate-900 tabular-nums">{formatAmount(sellerDrillSummary.avg)}</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                    <div className="text-xs text-slate-500 uppercase tracking-wide">Status Mix</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Object.entries(sellerDrillSummary.byStatus)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 3)
                        .map(([st, c]) => (
                          <span
                            key={st}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                            style={{
                              backgroundColor: `${STATUS_COLORS[st] || '#64748b'}20`,
                              color: STATUS_COLORS[st] || '#475569',
                            }}
                          >
                            {st} {c}
                          </span>
                        ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="px-6 py-3 border-b border-slate-200 bg-white grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">From</label>
                  <input
                    type="date"
                    value={sellerDrillStartDate}
                    onChange={(e) => setSellerDrillStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">To</label>
                  <input
                    type="date"
                    value={sellerDrillEndDate}
                    onChange={(e) => setSellerDrillEndDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Status</label>
                  <select
                    value={sellerDrillStatus}
                    onChange={(e) => setSellerDrillStatus(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
                  >
                    <option value="all">All statuses</option>
                    {sellerDrillStatuses.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">PO Number</label>
                  <input
                    type="text"
                    value={sellerDrillPo}
                    onChange={(e) => setSellerDrillPo(e.target.value)}
                    placeholder="Search PO..."
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-auto">
                {sellerDrillLoading ? (
                  <div className="px-6 py-12 text-center text-slate-500">Loading orders...</div>
                ) : sellerDrillError ? (
                  <div className="px-6 py-12 text-center text-rose-600">{sellerDrillError}</div>
                ) : !sellerDrillRows || sellerDrillRows.length === 0 ? (
                  <div className="px-6 py-12 text-center text-slate-500">No orders found</div>
                ) : !filteredSellerDrillRows || filteredSellerDrillRows.length === 0 ? (
                  <div className="px-6 py-12 text-center text-slate-500">No matches for current filters</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-100 z-10">
                      <tr className="border-b border-slate-200">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">PO Number</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">View Ticket</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Status</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">Amount</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Buyer Business</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Buyer Phone</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Buyer Address</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Marked Pending</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Created At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(sellerDrillPaged?.rows || filteredSellerDrillRows).map((r) => (
                        <tr key={r.poNumber} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-900 tabular-nums font-medium">{r.poNumber}</td>
                          <td className="px-4 py-3">
                            <a href={`https://badho.freshdesk.com/a/search/tickets?term=${encodeURIComponent(r.poNumber)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-bold border border-sky-300" title={`Search Freshdesk tickets for PO ${r.poNumber}`}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                              View Ticket
                            </a>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                              style={{
                                backgroundColor: `${STATUS_COLORS[r.status] || '#64748b'}20`,
                                color: STATUS_COLORS[r.status] || '#475569',
                              }}
                            >
                              {r.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-slate-900 tabular-nums">₹{r.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-slate-700">{r.buyerBusinessName || '—'}</td>
                          <td className="px-4 py-3 text-slate-700 tabular-nums">{r.buyerPhone || '—'}</td>
                          <td className="px-4 py-3 text-slate-600 text-xs max-w-md" title={[r.buyerAddressLine1, r.buyerLandmark, r.buyerPincode, r.buyerCity, r.buyerDistrict, r.buyerState].filter((v) => v != null && String(v).trim() !== '').join('_')}>
                            {[r.buyerAddressLine1, r.buyerLandmark, r.buyerPincode, r.buyerCity, r.buyerDistrict, r.buyerState].filter((v) => v != null && String(v).trim() !== '').length > 0 ? (
                              <div className="whitespace-normal break-words">
                                {[r.buyerAddressLine1, r.buyerLandmark, r.buyerPincode, r.buyerCity, r.buyerDistrict, r.buyerState].filter((v) => v != null && String(v).trim() !== '').join('_')}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatDateTime(r.markedPendingTime)}</td>
                          <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              {sellerDrillPaged && filteredSellerDrillRows && filteredSellerDrillRows.length > 0 && (
                <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-sm text-slate-600 flex-wrap gap-2">
                  <div>
                    Showing <span className="font-semibold text-slate-900">{sellerDrillPaged.startIdx + 1}</span>–<span className="font-semibold text-slate-900">{sellerDrillPaged.endIdx}</span> of <span className="font-semibold text-slate-900">{filteredSellerDrillRows.length}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSellerDrillPage(p => Math.max(1, p - 1))}
                      disabled={sellerDrillPaged.safePage <= 1}
                      className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Prev
                    </button>
                    <span className="px-2 text-slate-500">Page <span className="text-slate-900 font-semibold">{sellerDrillPaged.safePage}</span> of {sellerDrillPaged.totalPages}</span>
                    <button
                      onClick={() => setSellerDrillPage(p => Math.min(sellerDrillPaged.totalPages, p + 1))}
                      disabled={sellerDrillPaged.safePage >= sellerDrillPaged.totalPages}
                      className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Drilldown Modal */}
        {drillStatus !== null && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            onClick={closeDrill}
          >
            <div
              className="bg-white text-slate-900 border border-slate-200 rounded-2xl max-w-7xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">
                    {drillStatus} — {drillMonth ? `${MONTH_NAMES[drillMonth - 1]} ${currentYear}` : `${currentYear} (all months)`}
                  </h3>
                  <p className="text-slate-500 text-sm mt-1">
                    {drillLoading
                      ? 'Loading...'
                      : drillRows
                      ? `${filteredDrillRows?.length ?? 0} of ${drillRows.length} order${drillRows.length === 1 ? '' : 's'}`
                      : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className={DOWNLOAD_BTN_LIGHT_CLASS}
                    disabled={!filteredDrillRows || filteredDrillRows.length === 0}
                    onClick={() => {
                      if (!filteredDrillRows) return;
                      const headers = ['PO Number', 'Status', 'Buyer Address', 'Amount', 'Buyer Phone', 'Buyer Business', 'Seller Phone', 'Seller Business', 'Buyer State', 'Marked Pending', 'Created At'];
                      const rows: CsvCell[][] = filteredDrillRows.map((r) => [
                        r.poNumber, r.status, r.buyerFullAddress || r.buyerAddress, r.amount, r.buyerPhone, r.buyerBusinessName, r.sellerPhone, r.sellerBusinessName, r.buyerState, r.markedPendingTime, r.createdAt,
                      ]);
                      const monthTag = drillMonth ? MONTH_NAMES[drillMonth - 1] : 'all';
                      downloadCSV(`orders-${drillStatus}-${monthTag}-${currentYear}.csv`, headers, rows);
                    }}
                  >
                    ↓ CSV
                  </button>
                  <button
                    onClick={closeDrill}
                    className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-medium"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="px-6 py-3 border-b border-slate-200 bg-white">
                <input
                  type="text"
                  value={drillSearch}
                  onChange={(e) => setDrillSearch(e.target.value)}
                  placeholder="Search by PO number, buyer phone, or seller phone..."
                  className="w-full px-4 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent"
                />
              </div>
              <div className="flex-1 overflow-auto">
                {drillLoading ? (
                  <div className="px-6 py-12 text-center text-slate-500">Loading orders...</div>
                ) : drillError ? (
                  <div className="px-6 py-12 text-center text-rose-600">{drillError}</div>
                ) : !drillRows || drillRows.length === 0 ? (
                  <div className="px-6 py-12 text-center text-slate-500">No orders found</div>
                ) : !filteredDrillRows || filteredDrillRows.length === 0 ? (
                  <div className="px-6 py-12 text-center text-slate-500">No matches for &ldquo;{drillSearch}&rdquo;</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-100 z-10">
                      <tr className="border-b border-slate-200">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">PO Number</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">View Ticket</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Buyer Address</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">Amount</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Buyer Business</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Buyer Phone</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Seller Phone</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Seller Business</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Buyer State</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Marked Pending</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Created At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(drillPaged?.rows || filteredDrillRows).map((r) => (
                        <tr key={r.poNumber} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-900 tabular-nums font-medium">{r.poNumber}</td>
                          <td className="px-4 py-3">
                            <a href={`https://badho.freshdesk.com/a/search/tickets?term=${encodeURIComponent(r.poNumber)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-bold border border-sky-300" title={`Search Freshdesk tickets for PO ${r.poNumber}`}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                              View Ticket
                            </a>
                          </td>
                          <td className="px-4 py-3 text-slate-700">{r.status}</td>
                          <td className="px-4 py-3 text-slate-600 max-w-xs truncate" title={r.buyerFullAddress || r.buyerAddress}>{r.buyerFullAddress || r.buyerAddress || '—'}</td>
                          <td className="px-4 py-3 text-right text-slate-900 tabular-nums">₹{r.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-slate-700">{r.buyerBusinessName || '—'}</td>
                          <td className="px-4 py-3 text-slate-700">{r.buyerPhone || '—'}</td>
                          <td className="px-4 py-3 text-slate-700">{r.sellerPhone || '—'}</td>
                          <td className="px-4 py-3 text-slate-700">{r.sellerBusinessName || '—'}</td>
                          <td className="px-4 py-3 text-slate-700">{r.buyerState || '—'}</td>
                          <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatDateTime(r.markedPendingTime)}</td>
                          <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              {drillPaged && filteredDrillRows && filteredDrillRows.length > 0 && (
                <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-sm text-slate-600 flex-wrap gap-2">
                  <div>
                    Showing <span className="font-semibold text-slate-900">{drillPaged.startIdx + 1}</span>–<span className="font-semibold text-slate-900">{drillPaged.endIdx}</span> of <span className="font-semibold text-slate-900">{filteredDrillRows.length}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setDrillPage(p => Math.max(1, p - 1))}
                      disabled={drillPaged.safePage <= 1}
                      className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Prev
                    </button>
                    <span className="px-2 text-slate-500">Page <span className="text-slate-900 font-semibold">{drillPaged.safePage}</span> of {drillPaged.totalPages}</span>
                    <button
                      onClick={() => setDrillPage(p => Math.min(drillPaged.totalPages, p + 1))}
                      disabled={drillPaged.safePage >= drillPaged.totalPages}
                      className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}


        {/* RTO KPI tile → orders modal */}
        {rtoKpiModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-2 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setRtoKpiModal(null)}
          >
            <div
              className="bg-white text-slate-900 border border-slate-200 rounded-2xl w-[97vw] max-w-[97vw] h-[97vh] max-h-[97vh] flex flex-col overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-rose-50 to-fuchsia-50">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    RTO orders
                    {rtoKpiWindow
                      ? <span className="text-slate-500 text-base font-normal"> — {rtoKpiWindow.label}</span>
                      : (<>
                          {rtoKpiModal === 'value' && <span className="text-slate-700 text-base font-normal"> · by value</span>}
                          {rtoKpiModal === 'rate' && <span className="text-slate-700 text-base font-normal"> · rate</span>}
                          {rtoKpiModal === 'avg' && <span className="text-slate-700 text-base font-normal"> · avg value</span>}
                          <span className="text-slate-500 text-base font-normal"> — {currentYear}</span>
                        </>)}
                  </h3>
                  <p className="text-slate-500 text-sm mt-0.5">
                    {rtoKpiWindow
                      ? `${rtoKpiModalLoading ? '…' : (rtoKpiModalData?.length ?? 0).toLocaleString()} RTO orders in this bucket`
                      : <>
                          {rtoKpiModal === 'count' && `All ${rtoData?.grand.count.toLocaleString() ?? '—'} RTO orders this year`}
                          {rtoKpiModal === 'value' && `Total value across all RTO orders — ${formatAmount(rtoData?.grand.amount ?? 0)}`}
                          {rtoKpiModal === 'rate' && (
                            <>
                              {rtoData?.rtoRate.toFixed(2)}% = <span className="font-semibold text-rose-600">{rtoData?.grand.count.toLocaleString()} RTO</span> ÷ (<span className="font-semibold text-emerald-600">{rtoData?.deliveredCount.toLocaleString()} Delivered+Completed</span> + RTO)
                            </>
                          )}
                          {rtoKpiModal === 'avg' && `Avg value per RTO order — ${formatAmount(rtoData?.avgRtoValue ?? 0)} across ${rtoData?.grand.count.toLocaleString()} orders`}
                        </>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <GroupByMenu selected={rtoGroupByDims} onChange={setRtoGroupByDims} align="right" />
                  <button
                    onClick={() => setRtoKpiModal(null)}
                    className="text-slate-400 hover:text-slate-700 text-2xl leading-none p-1"
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Stats strip for rate */}
              {rtoKpiModal === 'rate' && rtoData && (
                <div className="px-6 py-3 border-b border-slate-200 bg-slate-50 grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">RTO (numerator)</div>
                    <div className="text-lg font-bold text-rose-600 tabular-nums">{rtoData.grand.count.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Delivered + Completed</div>
                    <div className="text-lg font-bold text-emerald-600 tabular-nums">{rtoData.deliveredCount.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Rate</div>
                    <div className="text-lg font-bold text-fuchsia-600 tabular-nums">{rtoData.rtoRate.toFixed(2)}%</div>
                  </div>
                </div>
              )}

              {/* Toolbar — search + multi-select filters + sort hints */}
              {(() => {
                const rows = rtoKpiModalData ?? [];
                const total = rows.length;
                let pushedCount = 0;
                for (const r of rows) if ((r.pushedStatus || 'Not Pushed') === 'Pushed') pushedCount++;
                const buildOpts = (acc: (r: RtoOrderRow) => string | null | undefined) => {
                  const counts = new Map<string, number>();
                  for (const r of rows) {
                    const k = acc(r) || '__NONE__';
                    counts.set(k, (counts.get(k) || 0) + 1);
                  }
                  return Array.from(counts.entries())
                    .sort(([, a], [, b]) => b - a)
                    .map(([value, count]) => ({ value, label: value === '__NONE__' ? 'Unspecified' : value, count }));
                };
                const paymentOpts  = buildOpts((r) => r.paymentMode);
                const courierOpts  = buildOpts((r) => r.logisticName);
                const deliveryOpts = buildOpts((r) => r.shipmentStatus);
                const reasonOpts   = buildOpts((r) => r.finalFailureReason);
                const attemptCounts = new Map<string, number>();
                for (const r of rows) {
                  const a = r.deliveryAttempt || 0;
                  const k = a >= 5 ? '5+' : String(a);
                  attemptCounts.set(k, (attemptCounts.get(k) || 0) + 1);
                }
                const filtersActive =
                  rtoKpiModalPushedFilter !== 'all' ||
                  rtoKpiModalPaymentFilter.size > 0 ||
                  rtoKpiModalCourierFilter.size > 0 ||
                  rtoKpiModalDeliveryFilter.size > 0 ||
                  rtoKpiModalReasonFilter.size > 0 ||
                  rtoKpiModalAttemptFilter.size > 0 ||
                  rtoKpiModalSearch.trim() !== '';
                const filteredRows: RtoOrderRow[] = (() => {
                  if (!rtoKpiModalData) return [];
                  const q = rtoKpiModalSearch.trim().toLowerCase();
                  let f: RtoOrderRow[] = q
                    ? rtoKpiModalData.filter((r) =>
                        String(r.poNumber || '').toLowerCase().includes(q) ||
                        (r.brandName || '').toLowerCase().includes(q) ||
                        (r.buyerPhone || '').toLowerCase().includes(q) ||
                        (r.buyerName || '').toLowerCase().includes(q) ||
                        (r.buyerBusinessName || '').toLowerCase().includes(q) ||
                        (r.shipmentStatus || '').toLowerCase().includes(q) ||
                        (r.awbNumber || '').toLowerCase().includes(q) ||
                        (r.logisticName || '').toLowerCase().includes(q) ||
                        (r.finalFailureReason || '').toLowerCase().includes(q)
                      )
                    : rtoKpiModalData;
                  if (rtoKpiModalPushedFilter !== 'all')
                    f = f.filter((r) => (r.pushedStatus || 'Not Pushed') === rtoKpiModalPushedFilter);
                  if (rtoKpiModalPaymentFilter.size > 0)
                    f = f.filter((r) => rtoKpiModalPaymentFilter.has(r.paymentMode || '__NONE__'));
                  if (rtoKpiModalCourierFilter.size > 0)
                    f = f.filter((r) => rtoKpiModalCourierFilter.has(r.logisticName || '__NONE__'));
                  if (rtoKpiModalDeliveryFilter.size > 0)
                    f = f.filter((r) => rtoKpiModalDeliveryFilter.has(r.shipmentStatus || '__NONE__'));
                  if (rtoKpiModalReasonFilter.size > 0)
                    f = f.filter((r) => rtoKpiModalReasonFilter.has(r.finalFailureReason || '__NONE__'));
                  if (rtoKpiModalAttemptFilter.size > 0)
                    f = f.filter((r) => {
                      const a = r.deliveryAttempt || 0;
                      for (const opt of rtoKpiModalAttemptFilter) {
                        if (opt === '5+' ? a >= 5 : a === Number(opt)) return true;
                      }
                      return false;
                    });
                  return f;
                })();
                const filteredCount = filteredRows.length;
                const sumBy = (fn: (r: RtoOrderRow) => number | null | undefined) =>
                  filteredRows.reduce((s, r) => s + (Number(fn(r)) || 0), 0);
                const sumGmv = sumBy((r) => r.orderValue);
                const sumPaid = sumBy((r) => r.paidAmount);
                const sumCod = sumBy((r) => r.codCollect);
                const avgGmv = filteredCount ? sumGmv / filteredCount : 0;
                return (
                  <>
                  <div className="px-6 py-2.5 border-b border-slate-200 bg-slate-50/80 flex items-center gap-2 flex-wrap">
                    <div className="relative w-64 max-w-full">
                      <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="11" cy="11" r="7" />
                        <path d="m20 20-3.5-3.5" />
                      </svg>
                      <input
                        type="text"
                        value={rtoKpiModalSearch}
                        onChange={(e) => setRtoKpiModalSearch(e.target.value)}
                        placeholder="Search PO, brand, buyer, AWB, courier, reason…"
                        className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-400 focus:border-purple-400"
                      />
                      {rtoKpiModalSearch && (
                        <button
                          type="button"
                          onClick={() => setRtoKpiModalSearch('')}
                          aria-label="Clear search"
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 h-4 w-4 inline-flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700 text-xs"
                        >
                          ×
                        </button>
                      )}
                    </div>

                    <div role="group" aria-label="Filter by pushed status" className="inline-flex rounded-md border border-slate-300 overflow-hidden text-xs bg-white shrink-0">
                      {([
                        { value: 'all' as const, label: 'All', count: total },
                        { value: 'Pushed' as const, label: 'Pushed', count: pushedCount },
                        { value: 'Not Pushed' as const, label: 'Not Pushed', count: total - pushedCount },
                      ]).map((opt, idx) => {
                        const active = rtoKpiModalPushedFilter === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setRtoKpiModalPushedFilter(opt.value)}
                            className={`px-2.5 py-1.5 whitespace-nowrap transition-colors font-medium ${idx > 0 ? 'border-l border-slate-300' : ''} ${active ? 'bg-purple-500 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
                          >
                            {opt.label}<span className={`ml-1 text-[10px] tabular-nums ${active ? 'text-white/90' : 'text-slate-500'}`}>{opt.count}</span>
                          </button>
                        );
                      })}
                    </div>

                    {paymentOpts.length > 1 && (
                      <MultiSelectFilter
                        label="Payment"
                        allLabel="All payments"
                        options={paymentOpts}
                        selected={rtoKpiModalPaymentFilter}
                        onChange={setRtoKpiModalPaymentFilter}
                        widthClass="w-44"
                      />
                    )}
                    {courierOpts.length > 1 && (
                      <MultiSelectFilter
                        label="Courier"
                        allLabel="All couriers"
                        options={courierOpts}
                        selected={rtoKpiModalCourierFilter}
                        onChange={setRtoKpiModalCourierFilter}
                        widthClass="w-44"
                      />
                    )}
                    {deliveryOpts.length > 1 && (
                      <MultiSelectFilter
                        label="Delivery"
                        allLabel="All delivery"
                        options={deliveryOpts}
                        selected={rtoKpiModalDeliveryFilter}
                        onChange={setRtoKpiModalDeliveryFilter}
                        widthClass="w-44"
                      />
                    )}
                    {reasonOpts.length > 1 && (
                      <MultiSelectFilter
                        label="Reason"
                        allLabel="All reasons"
                        options={reasonOpts}
                        selected={rtoKpiModalReasonFilter}
                        onChange={setRtoKpiModalReasonFilter}
                        widthClass="w-48"
                      />
                    )}

                    <div className="inline-flex items-center gap-1 pl-1 border-l border-slate-300">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mr-1">Attempts</span>
                      {(['0', '1', '2', '3', '4', '5+'] as const).map((opt) => {
                        const active = rtoKpiModalAttemptFilter.has(opt);
                        const count = attemptCounts.get(opt) || 0;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => {
                              setRtoKpiModalAttemptFilter((prev) => {
                                const next = new Set(prev);
                                if (next.has(opt)) next.delete(opt);
                                else next.add(opt);
                                return next;
                              });
                            }}
                            disabled={count === 0}
                            className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors tabular-nums ${
                              active
                                ? 'bg-purple-500 text-white border border-purple-500'
                                : count === 0
                                ? 'bg-white text-slate-300 border border-slate-200 cursor-not-allowed'
                                : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                            }`}
                          >
                            {opt}<span className={`ml-1 text-[9px] ${active ? 'text-white/80' : 'text-slate-400'}`}>{count}</span>
                          </button>
                        );
                      })}
                    </div>

                    {filtersActive && (
                      <button
                        type="button"
                        onClick={() => {
                          setRtoKpiModalSearch('');
                          setRtoKpiModalPushedFilter('all');
                          setRtoKpiModalPaymentFilter(new Set());
                          setRtoKpiModalCourierFilter(new Set());
                          setRtoKpiModalDeliveryFilter(new Set());
                          setRtoKpiModalReasonFilter(new Set());
                          setRtoKpiModalAttemptFilter(new Set());
                          setRtoKpiModalSort(null);
                        }}
                        className="text-[11px] font-semibold text-purple-600 hover:text-purple-800 underline underline-offset-2 whitespace-nowrap"
                      >
                        Clear all
                      </button>
                    )}

                    <span className="ml-auto text-xs text-slate-500 whitespace-nowrap">
                      {filteredCount.toLocaleString()} of {total.toLocaleString()} orders
                    </span>
                    <button
                      onClick={() => { setRtoKpiModal(null); setRtoSubTab('details'); }}
                      className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white text-xs font-semibold hover:shadow-[0_0_18px_rgba(217,70,239,0.4)]"
                    >
                      Open full Details tab →
                    </button>
                  </div>
                  {filteredCount > 0 && (
                    <div className="px-6 py-2 border-b border-slate-200 bg-fuchsia-50/70 flex items-center gap-5 flex-wrap text-sm">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-fuchsia-600">
                        {filtersActive ? 'Filtered summary' : 'Summary'}
                      </span>
                      {[
                        { label: 'Orders', value: filteredCount.toLocaleString('en-IN') },
                        { label: 'Order value', value: formatAmount(sumGmv) },
                        { label: 'Paid', value: formatAmount(sumPaid) },
                        { label: 'COD', value: formatAmount(sumCod) },
                        { label: 'Avg value', value: formatAmount(avgGmv) },
                      ].map((s) => (
                        <div key={s.label} className="flex items-baseline gap-1.5">
                          <span className="text-[11px] uppercase tracking-wider text-slate-500">{s.label}</span>
                          <span className="font-bold text-slate-900 tabular-nums">{s.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  </>
                );
              })()}

              {/* Table */}
              <div className="flex-1 overflow-auto">
                {rtoKpiModalLoading || !rtoKpiModalData ? (
                  <div className="px-8 py-16 text-center text-slate-500">Loading RTO orders…</div>
                ) : rtoKpiModalData.length === 0 ? (
                  <div className="px-8 py-16 text-center text-slate-500">No RTO orders for {currentYear}</div>
                ) : (() => {
                  const q = rtoKpiModalSearch.trim().toLowerCase();
                  let filtered: RtoOrderRow[] = q
                    ? rtoKpiModalData.filter((r) =>
                        String(r.poNumber || '').toLowerCase().includes(q) ||
                        (r.brandName || '').toLowerCase().includes(q) ||
                        (r.buyerPhone || '').toLowerCase().includes(q) ||
                        (r.buyerName || '').toLowerCase().includes(q) ||
                        (r.buyerBusinessName || '').toLowerCase().includes(q) ||
                        (r.shipmentStatus || '').toLowerCase().includes(q) ||
                        (r.awbNumber || '').toLowerCase().includes(q) ||
                        (r.logisticName || '').toLowerCase().includes(q) ||
                        (r.finalFailureReason || '').toLowerCase().includes(q)
                      )
                    : [...rtoKpiModalData];
                  if (rtoKpiModalPushedFilter !== 'all') {
                    filtered = filtered.filter((r) => (r.pushedStatus || 'Not Pushed') === rtoKpiModalPushedFilter);
                  }
                  if (rtoKpiModalPaymentFilter.size > 0) {
                    filtered = filtered.filter((r) => rtoKpiModalPaymentFilter.has(r.paymentMode || '__NONE__'));
                  }
                  if (rtoKpiModalCourierFilter.size > 0) {
                    filtered = filtered.filter((r) => rtoKpiModalCourierFilter.has(r.logisticName || '__NONE__'));
                  }
                  if (rtoKpiModalDeliveryFilter.size > 0) {
                    filtered = filtered.filter((r) => rtoKpiModalDeliveryFilter.has(r.shipmentStatus || '__NONE__'));
                  }
                  if (rtoKpiModalReasonFilter.size > 0) {
                    filtered = filtered.filter((r) => rtoKpiModalReasonFilter.has(r.finalFailureReason || '__NONE__'));
                  }
                  if (rtoKpiModalAttemptFilter.size > 0) {
                    filtered = filtered.filter((r) => {
                      const a = r.deliveryAttempt || 0;
                      for (const opt of rtoKpiModalAttemptFilter) {
                        if (opt === '5+' ? a >= 5 : a === Number(opt)) return true;
                      }
                      return false;
                    });
                  }
                  // Sort: user-chosen, else fall back to value-DESC for value/avg KPIs, else markedRejectedAt DESC
                  if (rtoKpiModalSort) {
                    const { key, direction } = rtoKpiModalSort;
                    const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
                    const dt = (v: unknown) => (v == null || v === '' ? null : new Date(v as string).getTime());
                    const sortVal = (r: RtoOrderRow): number | string | null => {
                      switch (key) {
                        case 'markedPending': return dt(r.orderDate);
                        case 'pushed': return r.pushedStatus ?? '';
                        case 'poNumber': { const n = Number(r.poNumber); return Number.isFinite(n) ? n : (r.poNumber ?? ''); }
                        case 'status': return r.poStatus ?? '';
                        case 'itemTotal': return num(r.itemTotal);
                        case 'grossAmount': return num(r.grossAmount ?? r.orderValue);
                        case 'orderMarginDiscount': return num(r.orderMarginDiscount);
                        case 'coupon': return num(r.couponValue);
                        case 'wallet': return num(r.appliedWalletAmount);
                        case 'sellerDiscount': return num(r.discountBySeller);
                        case 'badhoDiscount': return num(r.PaymentOptionDiscountByBadho);
                        case 'cod': return num(r.codCollect);
                        case 'deliveryStatus': return r.shipmentStatus ?? '';
                        case 'paidAmount': return num(r.paidAmount);
                        case 'paymentOption': return r.paymentMode ?? '';
                        case 'awb': return r.awbNumber ?? '';
                        case 'courier': return r.logisticName ?? '';
                        case 'paymentDate': return dt(r.paymentDate);
                        case 'paymentEvent': return r.paymentEvent ?? '';
                        case 'buyerBusiness': return r.buyerBusinessName ?? '';
                        case 'buyerPhone': return r.buyerPhone ?? '';
                        case 'sellerBusiness': return r.sellerBusinessName ?? '';
                        case 'sellerPhone': return r.sellerPhone ?? '';
                        case 'markedRejected': return dt(r.markedRejectedAt);
                        case 'statusDuration': return r.statusDurationSec ?? null;
                        case 'refundInit': return dt(r.RefundIntiatedTime);
                        case 'refundDone': return dt(r.RefundCompletedTime);
                        case 'refundAmount': return r.RefundAmount ?? null;
                        case 'rejectReason': return r.rejectReason ?? '';
                        case 'rejectedBy': return r.rejectedBy ?? '';
                        case 'reasonByBadho': return r.reasonAddedByBadhoTeam ?? '';
                        case 'brand': return r.brandName ?? '';
                        case 'latestAttempt': return dt(r.latestAttemptTime);
                        case 'failureReason': return r.finalFailureReason ?? '';
                        case 'attempts': return num(r.deliveryAttempt);
                        default: return '';
                      }
                    };
                    filtered = [...filtered].sort((a, b) => {
                      const av = sortVal(a);
                      const bv = sortVal(b);
                      if (av === null && bv === null) return 0;
                      if (av === null) return 1;
                      if (bv === null) return -1;
                      let cmp = 0;
                      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
                      else cmp = String(av).localeCompare(String(bv));
                      return direction === 'asc' ? cmp : -cmp;
                    });
                  } else {
                    filtered = [...filtered].sort((a, b) => {
                      if (rtoKpiModal === 'value' || rtoKpiModal === 'avg') {
                        return (b.orderValue || 0) - (a.orderValue || 0);
                      }
                      const ta = a.markedRejectedAt ? new Date(a.markedRejectedAt).getTime() : 0;
                      const tb = b.markedRejectedAt ? new Date(b.markedRejectedAt).getTime() : 0;
                      return tb - ta;
                    });
                  }
                  if (filtered.length === 0) {
                    return <div className="px-8 py-16 text-center text-slate-500">No matches for the selected filters</div>;
                  }
                  const fmtAmt = (n: number | null | undefined) => n != null ? `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—';
                  const dash = <span className="text-slate-400">—</span>;
                  const arrowFor = (k: string) => {
                    const active = rtoKpiModalSort?.key === k;
                    const dir = active ? rtoKpiModalSort?.direction : null;
                    return (
                      <span className={`ml-1 text-[10px] leading-none ${active ? 'text-purple-600' : 'text-slate-300'}`}>
                        {dir === 'asc' ? '▲' : dir === 'desc' ? '▼' : '⇅'}
                      </span>
                    );
                  };
                  const SortTh = ({ k, label, cls = '', align = 'left' }: { k: string; label: string; cls?: string; align?: 'left' | 'right' }) => (
                    <th
                      onClick={() => toggleRtoKpiSort(k)}
                      className={`sticky top-0 z-20 bg-slate-100 px-2.5 py-2.5 text-${align} text-[11px] font-bold cursor-pointer select-none hover:bg-slate-200/80 whitespace-nowrap uppercase tracking-wider ${cls || 'text-slate-700'}`}
                    >
                      <span className={`inline-flex items-center ${align === 'right' ? 'justify-end w-full' : ''}`}>{label}{arrowFor(k)}</span>
                    </th>
                  );
                  return (
                    <table className="w-full text-xs">
                      <thead className="shadow-[0_2px_0_rgba(168,85,247,0.4)]">
                        <tr className="border-b border-slate-200">
                          {/* Sticky-left sortable header trio */}
                          <th
                            onClick={() => toggleRtoKpiSort('markedPending')}
                            className="sticky top-0 left-0 z-30 bg-amber-50 min-w-[160px] max-w-[160px] w-[160px] px-2.5 py-2.5 text-left text-[11px] font-bold cursor-pointer select-none hover:bg-amber-100 whitespace-nowrap uppercase tracking-wider text-amber-800"
                          >
                            <span className="inline-flex items-center">Marked Pending{arrowFor('markedPending')}</span>
                          </th>
                          <th
                            onClick={() => toggleRtoKpiSort('pushed')}
                            className="sticky top-0 left-[160px] z-30 bg-slate-100 min-w-[120px] max-w-[120px] w-[120px] px-2.5 py-2.5 text-left text-[11px] font-bold cursor-pointer select-none hover:bg-slate-200 whitespace-nowrap uppercase tracking-wider text-slate-700"
                          >
                            <span className="inline-flex items-center">Pushed{arrowFor('pushed')}</span>
                          </th>
                          <th
                            onClick={() => toggleRtoKpiSort('poNumber')}
                            className="sticky top-0 left-[280px] z-30 bg-slate-100 px-2.5 py-2.5 text-left text-[11px] font-bold cursor-pointer select-none hover:bg-slate-200 whitespace-nowrap uppercase tracking-wider text-slate-700 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]"
                          >
                            <span className="inline-flex items-center">PO Number{arrowFor('poNumber')}</span>
                          </th>
                          <th className="sticky top-0 z-20 bg-slate-100 px-2.5 py-2.5 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Items</th>
                          <th className="sticky top-0 z-20 bg-slate-100 px-2.5 py-2.5 text-left text-[11px] font-bold text-slate-700 whitespace-nowrap uppercase tracking-wider">View Ticket</th>
                          <SortTh k="status" label="Order Status" />
                          <SortTh k="itemTotal" label="Item Total" align="right" />
                          <SortTh k="grossAmount" label="Gross Amount" align="right" />
                          <SortTh k="orderMarginDiscount" label="Item Discount" align="right" />
                          <SortTh k="coupon" label="Coupon Amount" align="right" />
                          <SortTh k="wallet" label="Applied Wallet Amount" align="right" />
                          <SortTh k="sellerDiscount" label="Seller Discount" align="right" />
                          <SortTh k="badhoDiscount" label="Payment Option Badho Discount" align="right" />
                          <SortTh k="cod" label="COD Amount" align="right" />
                          <SortTh k="deliveryStatus" label="Delivery Status" />
                          <SortTh k="paidAmount" label="Paid Amount" align="right" />
                          <SortTh k="paymentOption" label="Payment Option" />
                          <SortTh k="awb" label="AWB Number" />
                          <SortTh k="courier" label="Courier Name" />
                          <SortTh k="paymentDate" label="Payment Date" />
                          <SortTh k="paymentEvent" label="Payment Event" />
                          <SortTh k="buyerBusiness" label="Buyer Business" />
                          <SortTh k="buyerPhone" label="Buyer Phone" />
                          <th className="sticky top-0 z-20 bg-slate-100 px-2.5 py-2.5 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Buyer Address</th>
                          <SortTh k="sellerBusiness" label="Seller Business" />
                          <SortTh k="sellerPhone" label="Seller Phone" />
                          <SortTh k="markedRejected" label="markedRejectedTime" cls="text-amber-800 bg-amber-50/60" />
                          <SortTh k="statusDuration" label="Status Duration" cls="text-amber-800 bg-amber-50/60" />
                          <SortTh k="refundInit" label="Refund Initiated" />
                          <SortTh k="refundDone" label="Refund Completed" />
                          <SortTh k="refundAmount" label="Refund Amount" align="right" />
                          <SortTh k="rejectReason" label="Reject Reason" cls="text-rose-700 bg-rose-50/60" />
                          <SortTh k="rejectedBy" label="Rejected By" cls="text-rose-700 bg-rose-50/60" />
                          <SortTh k="reasonByBadho" label="Reason Added By Badho Team" cls="text-rose-700 bg-rose-50/60" />
                          {/* RTO-specific extras */}
                          <SortTh k="brand" label="Brand" cls="text-fuchsia-700 bg-fuchsia-50/70" />
                          <SortTh k="latestAttempt" label="Latest Attempt" cls="text-fuchsia-700 bg-fuchsia-50/70" />
                          <SortTh k="failureReason" label="Final Failure Reason" cls="text-fuchsia-700 bg-fuchsia-50/70" />
                          <SortTh k="attempts" label="Attempts" cls="text-fuchsia-700 bg-fuchsia-50/70" align="right" />
                          {[1,2,3,4,5,6].map((n) => (
                            <th key={n} className="sticky top-0 z-20 bg-fuchsia-50/70 px-2.5 py-2.5 text-left text-[11px] font-bold text-fuchsia-700 uppercase tracking-wider whitespace-nowrap">Attempt {n}</th>
                          ))}
                          <th className="sticky top-0 z-20 bg-indigo-50 px-2.5 py-2.5 text-left text-[11px] font-bold text-indigo-700 whitespace-nowrap uppercase tracking-wider">Latest Scan 1</th>
                          <th className="sticky top-0 z-20 bg-indigo-50 px-2.5 py-2.5 text-left text-[11px] font-bold text-indigo-700 whitespace-nowrap uppercase tracking-wider">Latest Scan 2</th>
                          <th className="sticky top-0 z-20 bg-indigo-50 px-2.5 py-2.5 text-left text-[11px] font-bold text-indigo-700 whitespace-nowrap uppercase tracking-wider">Latest Scan 3</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((r, idx) => {
                          const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50';
                          const isPushed = r.pushedStatus === 'Pushed';
                          const attemptCell = (t: string | null, remark: string | null) => {
                            if (!t && !remark) return dash;
                            return (
                              <div className="min-w-[140px]">
                                <div className="text-slate-700 whitespace-nowrap">{t || '—'}</div>
                                <div className="text-[10px] text-slate-500 leading-tight max-w-[200px] truncate" title={remark || ''}>{remark || ''}</div>
                              </div>
                            );
                          };
                          return (
                            <tr key={r.poNumber} className={`group border-b border-slate-100 align-top transition-colors ${rowBg} hover:bg-purple-50`}>
                              <td className={`sticky left-0 z-10 ${rowBg} group-hover:bg-purple-50 min-w-[160px] max-w-[160px] w-[160px] px-2.5 py-2 whitespace-nowrap text-amber-800 font-medium`}>{r.orderDate || dash}</td>
                              <td className={`sticky left-[160px] z-10 ${rowBg} group-hover:bg-purple-50 min-w-[120px] max-w-[120px] w-[120px] px-2.5 py-2 whitespace-nowrap`}>
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${isPushed ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-rose-100 text-rose-700 border border-rose-300'}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${isPushed ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                  {r.pushedStatus || 'Not Pushed'}
                                </span>
                              </td>
                              <td className={`sticky left-[280px] z-10 ${rowBg} group-hover:bg-purple-50 px-2.5 py-2 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]`}>
                                <div className="inline-flex items-center gap-2">
                                  <span className="text-slate-900 tabular-nums font-bold">{r.poNumber}</span>
                                  <a
                                    href={`https://d2r-support-dashboard.vercel.app/?po_number=${encodeURIComponent(r.poNumber)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200"
                                    title="Open in D2R Support Dashboard"
                                  >Details ↗</a>
                                </div>
                                <div className="text-[10px] text-slate-500 tabular-nums mt-0.5" title="AWB number">
                                  AWB: {awbLink(r.awbNumber)}
                                </div>
                              </td>
                              <td className="px-2.5 py-2 whitespace-nowrap">
                                <button
                                  onClick={() => openPoItemsModal(r.poNumber)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold border border-emerald-300"
                                  title="View items + price breakup"
                                >Items</button>
                              </td>
                              <td className="px-2.5 py-2 whitespace-nowrap">
                                <a
                                  href={`https://badho.freshdesk.com/a/search/tickets?term=${encodeURIComponent(r.poNumber)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 hover:bg-sky-100 text-sky-700 text-[10px] font-bold border border-sky-300"
                                  title={`Search Freshdesk tickets for PO ${r.poNumber}`}
                                >
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <circle cx="11" cy="11" r="8" />
                                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                  </svg>
                                  Ticket
                                </a>
                              </td>
                              <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.poStatus || dash}</td>
                              <td className="px-2.5 py-2 text-right text-slate-900 tabular-nums whitespace-nowrap">{r.itemTotal != null ? fmtAmt(r.itemTotal) : dash}</td>
                              <td className="px-2.5 py-2 text-right text-slate-900 tabular-nums font-semibold whitespace-nowrap">{fmtAmt(r.grossAmount ?? r.orderValue)}</td>
                              <td className="px-2.5 py-2 text-right text-emerald-700 tabular-nums whitespace-nowrap">{r.orderMarginDiscount ? fmtAmt(r.orderMarginDiscount) : dash}</td>
                              <td className="px-2.5 py-2 text-right text-fuchsia-700 tabular-nums whitespace-nowrap">{r.couponValue ? fmtAmt(r.couponValue) : dash}</td>
                              <td className="px-2.5 py-2 text-right text-cyan-700 tabular-nums whitespace-nowrap">{r.appliedWalletAmount ? fmtAmt(r.appliedWalletAmount) : dash}</td>
                              <td className="px-2.5 py-2 text-right text-amber-700 tabular-nums whitespace-nowrap">{r.discountBySeller ? fmtAmt(r.discountBySeller) : dash}</td>
                              <td className="px-2.5 py-2 text-right text-amber-700 tabular-nums whitespace-nowrap">{r.PaymentOptionDiscountByBadho ? fmtAmt(r.PaymentOptionDiscountByBadho) : dash}</td>
                              <td className="px-2.5 py-2 text-right text-amber-700 tabular-nums whitespace-nowrap">{r.codCollect ? fmtAmt(r.codCollect) : dash}</td>
                              <td className="px-2.5 py-2 whitespace-nowrap">
                                {r.shipmentStatus ? <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-100 text-cyan-700 border border-cyan-200">{r.shipmentStatus}</span> : dash}
                              </td>
                              <td className="px-2.5 py-2 text-right text-emerald-700 tabular-nums font-medium whitespace-nowrap">{r.paidAmount != null ? fmtAmt(r.paidAmount) : dash}</td>
                              <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.paymentMode || dash}</td>
                              <td className="px-2.5 py-2 tabular-nums whitespace-nowrap">{awbLink(r.awbNumber)}</td>
                              <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.logisticName || dash}</td>
                              <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.paymentDate || dash}</td>
                              <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">{r.paymentEvent || dash}</td>
                              <td className="px-2.5 py-2 font-medium">
                                {r.buyerBusinessName ? (
                                  <button type="button" onClick={() => openBuyerModal({ phone: r.buyerPhone, businessName: r.buyerBusinessName })} className="text-purple-700 hover:text-purple-900 hover:underline hover:bg-purple-50 px-1 -mx-1 rounded transition-all cursor-pointer text-left" title="View buyer details">{r.buyerBusinessName}</button>
                                ) : dash}
                              </td>
                              <td className="px-2.5 py-2 tabular-nums whitespace-nowrap">
                                {r.buyerPhone ? (
                                  <button type="button" onClick={() => openBuyerModal({ phone: r.buyerPhone, businessName: r.buyerBusinessName })} className="text-purple-700 hover:text-purple-900 hover:underline hover:bg-purple-50 px-1 -mx-1 rounded transition-all cursor-pointer" title="View buyer details">{r.buyerPhone}</button>
                                ) : dash}
                              </td>
                              <td className="px-2.5 py-2 text-slate-600 text-xs max-w-md" title={r.buyerFullAddress || ''}>
                                {r.buyerFullAddress ? <div className="whitespace-normal break-words">{r.buyerFullAddress}</div> : dash}
                              </td>
                              <td className="px-2.5 py-2 font-medium">
                                {r.sellerBusinessName ? (
                                  <button type="button" onClick={() => openSellerModal({ phone: r.sellerPhone, businessName: r.sellerBusinessName })} className="text-purple-700 hover:text-purple-900 hover:underline hover:bg-purple-50 px-1 -mx-1 rounded transition-all cursor-pointer text-left" title="View seller details">{r.sellerBusinessName}</button>
                                ) : dash}
                              </td>
                              <td className="px-2.5 py-2 tabular-nums whitespace-nowrap">
                                {r.sellerPhone ? (
                                  <button type="button" onClick={() => openSellerModal({ phone: r.sellerPhone, businessName: r.sellerBusinessName })} className="text-purple-700 hover:text-purple-900 hover:underline hover:bg-purple-50 px-1 -mx-1 rounded transition-all cursor-pointer" title="View seller details">{r.sellerPhone}</button>
                                ) : dash}
                              </td>
                              <td className="px-2.5 py-2 text-rose-700 whitespace-nowrap bg-amber-50/40">{r.markedRejectedTime || dash}</td>
                              <td className="px-2.5 py-2 text-slate-700 tabular-nums whitespace-nowrap bg-amber-50/40 font-medium">{formatDuration(r.statusDurationSec)}</td>
                              <td className="px-2.5 py-2 text-orange-700 whitespace-nowrap">{r.RefundIntiatedTime || dash}</td>
                              <td className="px-2.5 py-2 text-emerald-700 whitespace-nowrap">{r.RefundCompletedTime || dash}</td>
                              <td className="px-2.5 py-2 text-right text-emerald-700 tabular-nums font-medium whitespace-nowrap">{r.RefundAmount != null ? fmtAmt(r.RefundAmount) : dash}</td>
                              <td className="px-2.5 py-2 text-rose-700 text-xs max-w-[260px] bg-rose-50/40" title={r.rejectReason || ''}>{r.rejectReason ? <div className="whitespace-normal break-words">{r.rejectReason}</div> : dash}</td>
                              <td className="px-2.5 py-2 text-rose-700 whitespace-nowrap bg-rose-50/40">{r.rejectedBy || dash}</td>
                              <td className="px-2.5 py-2 text-rose-700 text-xs max-w-[260px] bg-rose-50/40" title={r.reasonAddedByBadhoTeam || ''}>{r.reasonAddedByBadhoTeam ? <div className="whitespace-normal break-words">{r.reasonAddedByBadhoTeam}</div> : dash}</td>
                              {/* RTO-specific extras */}
                              <td className="px-2.5 py-2 text-fuchsia-800 whitespace-nowrap font-medium bg-fuchsia-50/20">{r.brandName || dash}</td>
                              <td className="px-2.5 py-2 text-fuchsia-800 whitespace-nowrap bg-fuchsia-50/20">{r.latestAttemptTime || dash}</td>
                              <td className="px-2.5 py-2 text-fuchsia-800 max-w-[280px] bg-fuchsia-50/20" title={r.finalFailureReason || ''}>{r.finalFailureReason || dash}</td>
                              <td className="px-2.5 py-2 text-right tabular-nums font-bold text-rose-700 bg-fuchsia-50/20">{r.deliveryAttempt || 0}</td>
                              <td className="px-2.5 py-2 bg-fuchsia-50/20">{attemptCell(r.attempt1Time, r.attempt1Remarks)}</td>
                              <td className="px-2.5 py-2 bg-fuchsia-50/20">{attemptCell(r.attempt2Time, r.attempt2Remarks)}</td>
                              <td className="px-2.5 py-2 bg-fuchsia-50/20">{attemptCell(r.attempt3Time, r.attempt3Remarks)}</td>
                              <td className="px-2.5 py-2 bg-fuchsia-50/20">{attemptCell(r.attempt4Time, r.attempt4Remarks)}</td>
                              <td className="px-2.5 py-2 bg-fuchsia-50/20">{attemptCell(r.attempt5Time, r.attempt5Remarks)}</td>
                              <td className="px-2.5 py-2 bg-fuchsia-50/20">{attemptCell(r.attempt6Time, r.attempt6Remarks)}</td>
                              {renderScanCell(r.poNumber, 0)}
                              {renderScanCell(r.poNumber, 1)}
                              {renderScanCell(r.poNumber, 2)}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Group By aggregation modal for the RTO trend / KPI drill */}
        <GroupByModal
          open={!!rtoKpiModal && rtoGroupByDims.length > 0}
          dimensions={rtoGroupByDims}
          rows={(rtoKpiModalData ?? []).map((r) => ({
            poNumber: r.poNumber,
            orderStatus: r.poStatus,
            status: r.poStatus,
            deliveryStatus: r.shipmentStatus,
            poAmount: r.orderValue,
            itemTotal: r.itemTotal,
            grossAmount: r.grossAmount ?? r.orderValue,
            orderMarginDiscount: r.orderMarginDiscount,
            paidAmount: r.paidAmount,
            CoupanAmount: r.couponValue,
            appliedWalletAmount: r.appliedWalletAmount,
            discountBySeller: r.discountBySeller,
            PaymentOptionDiscountByBadho: r.PaymentOptionDiscountByBadho,
            codAmountToBeCollected: r.codCollect,
            RefundAmount: r.RefundAmount,
            buyerBusinessName: r.buyerBusinessName,
            buyerPhone: r.buyerPhone,
            buyerState: r.buyerState,
            buyerDistrict: r.buyerDistrict,
            sellerBusinessName: r.sellerBusinessName,
            sellerPhone: r.sellerPhone,
            MarkedpendingTime: r.orderDate,
          }))}
          contextLabel={`RTO${rtoKpiWindow ? ` · ${rtoKpiWindow.label}` : ` · ${currentYear}`}`}
          onClose={() => setRtoGroupByDims([])}
          onChangeDimensions={setRtoGroupByDims}
        />

        {/* GMV Goal ACHIEVED → orders modal */}
        {goalModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setGoalModalOpen(false)}
          >
            <div
              className="bg-white text-slate-900 border border-slate-200 rounded-2xl max-w-7xl w-full max-h-[88vh] flex flex-col overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-fuchsia-50">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    Achieved — DELIVERED + COMPLETED
                    <span className="text-slate-500 text-base font-normal"> · {currentYear}</span>
                  </h3>
                  <p className="text-slate-500 text-sm mt-0.5">
                    {goalData
                      ? <>{formatAmount(goalData.achieved)} across <span className="font-semibold text-emerald-600">{goalData.orders.toLocaleString()}</span> orders · THIRD_PARTY × INTERCITY only</>
                      : 'Shipped revenue toward the monthly goal'}
                  </p>
                </div>
                <button
                  onClick={() => setGoalModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 text-2xl leading-none p-1"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <div className="px-6 py-3 border-b border-slate-200 bg-white flex items-center gap-3 flex-wrap">
                <input
                  type="text"
                  value={goalModalSearch}
                  onChange={(e) => setGoalModalSearch(e.target.value)}
                  placeholder="Search PO, buyer, seller, state, city…"
                  className="flex-1 min-w-[240px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                />
                {goalModalData && (() => {
                  const q = goalModalSearch.trim().toLowerCase();
                  const filtered = q
                    ? goalModalData.filter((r) =>
                        String(r.poNumber || '').toLowerCase().includes(q) ||
                        (r.buyerPhone || '').toLowerCase().includes(q) ||
                        (r.buyerBusinessName || '').toLowerCase().includes(q) ||
                        (r.buyerState || '').toLowerCase().includes(q) ||
                        (r.buyerCity || '').toLowerCase().includes(q) ||
                        (r.sellerPhone || '').toLowerCase().includes(q) ||
                        (r.sellerBusinessName || '').toLowerCase().includes(q) ||
                        (r.status || '').toLowerCase().includes(q)
                      )
                    : goalModalData;
                  const filteredAmount = filtered.reduce((s, r) => s + (r.amount || 0), 0);
                  return (
                    <>
                      <span className="text-xs text-slate-500 whitespace-nowrap">
                        {filtered.length.toLocaleString()} of {goalModalData.length.toLocaleString()} orders · {formatAmount(filteredAmount)}
                      </span>
                      <button
                        className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white text-xs font-semibold hover:shadow-[0_0_18px_rgba(217,70,239,0.4)]"
                        onClick={() => {
                          const headers = [
                            'PO Number', 'Status', 'Buyer Address', 'Delivery Status', 'Amount',
                            'Marked Pending Time', 'Marked Delivered Time',
                            'Seller Business', 'Seller Phone',
                            'Buyer Business', 'Buyer Phone', 'Buyer City', 'Buyer State',
                            'Delivery Network', 'Delivery Type',
                          ];
                          const rows: CsvCell[][] = filtered.map((r) => [
                            r.poNumber, r.status, r.buyerFullAddress ?? '', r.deliveryStatus, r.amount,
                            r.markedPendingTime, r.markedDeliveredTime,
                            r.sellerBusinessName, r.sellerPhone,
                            r.buyerBusinessName, r.buyerPhone, r.buyerCity, r.buyerState,
                            r.deliveryNetwork, r.deliveryType,
                          ]);
                          downloadCSV(`gmv-goal-achieved-${currentYear}.csv`, headers, rows);
                        }}
                      >
                        ↓ Download CSV
                      </button>
                    </>
                  );
                })()}
              </div>

              <div className="flex-1 overflow-auto">
                {goalModalLoading || !goalModalData ? (
                  <div className="px-8 py-16 text-center text-slate-500">Loading orders…</div>
                ) : goalModalData.length === 0 ? (
                  <div className="px-8 py-16 text-center text-slate-500">No orders for {currentYear}</div>
                ) : (() => {
                  const q = goalModalSearch.trim().toLowerCase();
                  const filtered = q
                    ? goalModalData.filter((r) =>
                        String(r.poNumber || '').toLowerCase().includes(q) ||
                        (r.buyerPhone || '').toLowerCase().includes(q) ||
                        (r.buyerBusinessName || '').toLowerCase().includes(q) ||
                        (r.buyerState || '').toLowerCase().includes(q) ||
                        (r.buyerCity || '').toLowerCase().includes(q) ||
                        (r.sellerPhone || '').toLowerCase().includes(q) ||
                        (r.sellerBusinessName || '').toLowerCase().includes(q) ||
                        (r.status || '').toLowerCase().includes(q)
                      )
                    : goalModalData;
                  if (filtered.length === 0) {
                    return <div className="px-8 py-16 text-center text-slate-500">No matches for &ldquo;{goalModalSearch}&rdquo;</div>;
                  }
                  return (
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap">PO Number</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap">View Ticket</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap">Status</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap">Buyer Address</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-slate-600 whitespace-nowrap">Amount</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap">Pending Time</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap">Delivered Time</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap">Seller</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap">Buyer</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap">City / State</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap">Delivery Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.slice(0, 2000).map((r) => (
                          <tr key={r.poNumber} className="border-b border-slate-100 hover:bg-emerald-50/40 align-top">
                            <td className="px-3 py-2 whitespace-nowrap">
                              <div className="inline-flex items-center gap-2">
                                <span className="text-slate-900 tabular-nums font-semibold">{r.poNumber}</span>
                                <button
                                  onClick={() => openPoItemsModal(r.poNumber)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 hover:text-emerald-800 text-[10px] font-bold border border-emerald-300 hover:border-emerald-400 transition-all"
                                  title="View items + price breakup"
                                >
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                                    <line x1="12" y1="22.08" x2="12" y2="12" />
                                  </svg>
                                  Items
                                </button>
                              </div>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <a href={`https://badho.freshdesk.com/a/search/tickets?term=${encodeURIComponent(r.poNumber)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 hover:bg-sky-100 text-sky-700 text-[10px] font-bold border border-sky-300" title={`Search Freshdesk tickets for PO ${r.poNumber}`}>
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                                View Ticket
                              </a>
                            </td>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                r.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                              }`}>{r.status}</span>
                            </td>
                            <td className="px-3 py-2 text-slate-600 text-[11px] max-w-md" title={[r.buyerAddressLine1, r.buyerLandmark, r.buyerPincode, r.buyerCity, r.buyerDistrict, r.buyerState].filter((v) => v != null && String(v).trim() !== '').join('_')}>
                              {[r.buyerAddressLine1, r.buyerLandmark, r.buyerPincode, r.buyerCity, r.buyerDistrict, r.buyerState].filter((v) => v != null && String(v).trim() !== '').length > 0 ? (
                                <div className="whitespace-normal break-words">
                                  {[r.buyerAddressLine1, r.buyerLandmark, r.buyerPincode, r.buyerCity, r.buyerDistrict, r.buyerState].filter((v) => v != null && String(v).trim() !== '').join('_')}
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-900 tabular-nums whitespace-nowrap">{formatAmount(r.amount)}</td>
                            <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.markedPendingTime || '—'}</td>
                            <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.markedDeliveredTime || '—'}</td>
                            <td className="px-3 py-2">
                              {r.sellerBusinessName ? (
                                <button
                                  type="button"
                                  onClick={() => openSellerModal({ phone: r.sellerPhone, businessName: r.sellerBusinessName })}
                                  className="font-medium leading-tight text-slate-800 hover:text-purple-700 hover:underline transition-colors block text-left cursor-pointer"
                                  title="View seller details"
                                >
                                  {r.sellerBusinessName}
                                </button>
                              ) : (
                                <div className="font-medium leading-tight text-slate-400">—</div>
                              )}
                              {r.sellerPhone ? (
                                <button
                                  type="button"
                                  onClick={() => openSellerModal({ phone: r.sellerPhone, businessName: r.sellerBusinessName })}
                                  className="text-[10px] text-slate-500 tabular-nums leading-tight hover:text-purple-700 hover:underline transition-colors block text-left cursor-pointer"
                                  title="View seller details"
                                >
                                  {r.sellerPhone}
                                </button>
                              ) : (
                                <div className="text-[10px] text-slate-400 tabular-nums leading-tight">—</div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {r.buyerBusinessName ? (
                                <button
                                  type="button"
                                  onClick={() => openBuyerModal({ phone: r.buyerPhone, businessName: r.buyerBusinessName })}
                                  className="font-medium leading-tight text-slate-800 hover:text-purple-700 hover:underline transition-colors block text-left cursor-pointer"
                                  title="View buyer details"
                                >
                                  {r.buyerBusinessName}
                                </button>
                              ) : (
                                <div className="font-medium leading-tight text-slate-400">—</div>
                              )}
                              {r.buyerPhone ? (
                                <button
                                  type="button"
                                  onClick={() => openBuyerModal({ phone: r.buyerPhone, businessName: r.buyerBusinessName })}
                                  className="text-[10px] text-slate-500 tabular-nums leading-tight hover:text-purple-700 hover:underline transition-colors block text-left cursor-pointer"
                                  title="View buyer details"
                                >
                                  {r.buyerPhone}
                                </button>
                              ) : (
                                <div className="text-[10px] text-slate-400 tabular-nums leading-tight">—</div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                              {[r.buyerCity, r.buyerState].filter(Boolean).join(', ') || '—'}
                            </td>
                            <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.deliveryStatus || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
              {goalModalData && goalModalData.length > 2000 && (
                <div className="px-6 py-2 border-t border-slate-200 bg-amber-50 text-amber-700 text-xs">
                  Showing first 2,000 of {goalModalData.length.toLocaleString()} rows in the table — CSV includes everything.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 text-center text-purple-300/70 text-sm">
          <p>Last updated: {timestamp}</p>
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.3; }
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
      `}</style>
      <style jsx global>{`
        @keyframes bell-ring {
          0%, 100% { transform: rotate(0deg); }
          10%, 30% { transform: rotate(-14deg); }
          20%, 40% { transform: rotate(14deg); }
          50% { transform: rotate(0deg); }
        }
        .animate-bell-ring {
          transform-origin: top center;
          animation: bell-ring 1.5s ease-in-out infinite;
        }
        @keyframes stripe-flow {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        .animate-stripe-flow {
          animation: stripe-flow 3s linear infinite;
        }
        @keyframes pulse-glow {
          0%, 100% {
            box-shadow: 0 0 14px rgba(244, 63, 94, 0.35),
                        0 0 0 0 rgba(244, 63, 94, 0.55);
          }
          50% {
            box-shadow: 0 0 22px rgba(244, 63, 94, 0.6),
                        0 0 0 6px rgba(244, 63, 94, 0);
          }
        }
        .animate-pulse-glow {
          animation: pulse-glow 1.8s ease-in-out infinite;
        }
        @keyframes modal-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .animate-modal-fade {
          animation: modal-fade 0.22s ease-out;
        }
        @keyframes modal-scale {
          from { opacity: 0; transform: scale(0.94) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
        .animate-modal-scale {
          animation: modal-scale 0.28s cubic-bezier(0.34, 1.4, 0.5, 1);
        }
        @keyframes shimmer {
          0%   { background-position: -150% 50%; }
          100% { background-position:  250% 50%; }
        }
        .animate-shimmer {
          animation: shimmer 4s linear infinite;
        }
        @keyframes card-in {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
        .animate-card-in {
          animation: card-in 0.35s cubic-bezier(0.34, 1.4, 0.5, 1) backwards;
        }
        @keyframes shimmer-skeleton {
          0%   { background-position: -100% 0; }
          100% { background-position:  200% 0; }
        }
        .animate-shimmer-skeleton {
          background-image: linear-gradient(90deg,
            rgba(241, 245, 249, 1) 0%,
            rgba(226, 232, 240, 1) 50%,
            rgba(241, 245, 249, 1) 100%);
          animation: shimmer-skeleton 1.4s ease-in-out infinite;
        }
        @keyframes corner-breath {
          0%, 100% {
            box-shadow:
              0 0 40px -8px rgba(168, 85, 247, 0.28),
              0 0 80px -20px rgba(217, 70, 239, 0.18);
          }
          50% {
            box-shadow:
              0 0 70px -8px rgba(168, 85, 247, 0.5),
              0 0 140px -20px rgba(217, 70, 239, 0.32);
          }
        }
        .animate-corner-breath {
          animation: corner-breath 4s ease-in-out infinite;
        }
        @keyframes edge-pulse {
          0%, 100% {
            opacity: 0.6;
            filter: drop-shadow(0 0 3px rgba(168, 85, 247, 0.5));
          }
          50% {
            opacity: 1;
            filter: drop-shadow(0 0 10px rgba(168, 85, 247, 0.9))
                    drop-shadow(0 0 20px rgba(217, 70, 239, 0.45));
          }
        }
        .animate-edge-pulse {
          animation: edge-pulse 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
