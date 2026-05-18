'use client';

import { useEffect, useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ResponsiveContainer,
  RadialBarChart, RadialBar, PolarAngleAxis,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area, LabelList,
  ComposedChart, Bar,
} from 'recharts';
import IndiaStateMap, { type StateRow } from './components/IndiaStateMap';
import IndiaDistrictMap, { type DistrictRow } from './components/IndiaDistrictMap';

interface OrderListRow {
  poNumber: string;
  status: string;
  deliveryStatus?: string | null;
  amount: number;
  buyerPhone: string | null;
  buyerBusinessName: string | null;
  sellerPhone: string | null;
  sellerBusinessName: string | null;
  buyerAddress: string;
  buyerState: string | null;
  sellerAddress?: string;
  rejectReason?: string | null;
  rejectedBy?: string | null;
  reasonAddedByBadhoTeam?: string | null;
  markedPendingTime: string | null;
  createdAt: string;
}

interface RevenueGoal {
  year: number;
  goal: number;
  achieved: number;
  orders: number;
  remaining: number;
  achievePct: number;
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
  markedPendingTime: string | null;
  createdAt: string;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-fuchsia-500/30 border border-white/10 hover:border-fuchsia-400/50 text-purple-200 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed';

const DOWNLOAD_BTN_LIGHT_CLASS =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-fuchsia-100 border border-slate-200 hover:border-fuchsia-300 text-slate-700 hover:text-fuchsia-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed';

const formatAmount = (n: number): string => {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
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
  const currentYear = new Date().getFullYear();
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
  const [pivotDayMonth, setPivotDayMonth] = useState<number>(new Date().getMonth() + 1);
  const [pivotWeekData, setPivotWeekData] = useState<WeeklyStatusDeliveryData | null>(null);
  const [pivotWeekLoading, setPivotWeekLoading] = useState(false);
  const [pivotDayData, setPivotDayData] = useState<DailyStatusDeliveryData | null>(null);
  const [pivotDayLoading, setPivotDayLoading] = useState(false);
  // Status × Delivery Status drilldown modal
  const [pivotDrillOpen, setPivotDrillOpen] = useState(false);
  const [pivotDrillStatus, setPivotDrillStatus] = useState<string>('');
  const [pivotDrillDelivery, setPivotDrillDelivery] = useState<string | null | undefined>(undefined); // undefined = no filter, null = NULL filter, string = exact
  const [pivotDrillMonth, setPivotDrillMonth] = useState<number | null>(null);
  const [pivotDrillRows, setPivotDrillRows] = useState<OrderListRow[] | null>(null);
  const [pivotDrillLoading, setPivotDrillLoading] = useState(false);
  const [pivotDrillError, setPivotDrillError] = useState<string | null>(null);
  const [pivotDrillSearch, setPivotDrillSearch] = useState('');
  const [pivotDrillPage, setPivotDrillPage] = useState(1);
  const [goalData, setGoalData] = useState<RevenueGoal | null>(null);
  const [goalLoading, setGoalLoading] = useState(true);
  const [sellerData, setSellerData] = useState<SellerWiseData | null>(null);
  const [sellerLoading, setSellerLoading] = useState(true);
  const [sellerSearch, setSellerSearch] = useState('');
  const [slabData, setSlabData] = useState<SellerSlabData | null>(null);
  const [slabLoading, setSlabLoading] = useState(true);
  const [slabSearch, setSlabSearch] = useState('');
  const [sellerRange, setSellerRange] = useState<'7d' | '14d' | '15d' | 'custom' | 'all'>('all');
  const [sellerCustomFrom, setSellerCustomFrom] = useState('');
  const [sellerCustomTo, setSellerCustomTo] = useState('');
  // Demography (India map) state
  const [stateData, setStateData] = useState<StateRow[] | null>(null);
  const [stateLoading, setStateLoading] = useState(false);
  const [stateMetric, setStateMetric] = useState<'count' | 'amount'>('count');
  const [stateRange, setStateRange] = useState<'7d' | '14d' | '15d' | 'custom' | 'all'>('all');
  const [stateCustomFrom, setStateCustomFrom] = useState('');
  const [stateCustomTo, setStateCustomTo] = useState('');
  const [geoMode, setGeoMode] = useState<'state' | 'district'>('state');
  const [districtData, setDistrictData] = useState<DistrictRow[] | null>(null);
  const [districtLoading, setDistrictLoading] = useState(false);
  // selected DB state name for the district view (null = show all districts)
  const [districtSelectedState, setDistrictSelectedState] = useState<string | null>(null);
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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'trend' | 'rto' | 'seller' | 'demography'>('dashboard');
  // RTO tab
  interface RtoMonth { month: number; count: number; amount: number; }
  interface RtoSeller { sellerId: string; sellerPhone: string | null; sellerBusinessName: string | null; count: number; amount: number; }
  interface RtoState { state: string | null; count: number; amount: number; }
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
  // RTO trend chart granularity + data
  interface RtoTrendPoint { bucket: string; label: string; count: number; amount: number; }
  const [rtoTrendGranularity, setRtoTrendGranularity] = useState<'month' | 'week' | 'day' | 'custom'>('month');
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
  const [rtoKpiModalSearch, setRtoKpiModalSearch] = useState('');
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
    sellerPhone: string | null;
    sellerBusinessName: string | null;
    deliveryNetwork: string | null;
    deliveryType: string | null;
  }
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalModalSearch, setGoalModalSearch] = useState('');
  const [goalModalData, setGoalModalData] = useState<GoalOrderRow[] | null>(null);
  const [goalModalLoading, setGoalModalLoading] = useState(false);
  // Order funnel table (bucketed by created_at)
  interface FunnelData {
    totalCount: number; totalAmount: number;
    deliveredCount: number; deliveredAmount: number;
    rejectedCount: number; rejectedAmount: number;
    cancelledCount: number; cancelledAmount: number;
    inFlightCount: number; inFlightAmount: number;
    year: number | null;
    startDate: string | null;
    endDate: string | null;
  }
  const [funnelData, setFunnelData] = useState<FunnelData | null>(null);
  const [funnelLoading, setFunnelLoading] = useState(false);
  const [funnelRange, setFunnelRange] = useState<'year' | 'today' | '7d' | '30d' | 'custom'>('year');
  const [funnelCustomFrom, setFunnelCustomFrom] = useState('');
  const [funnelCustomTo, setFunnelCustomTo] = useState('');
  // RTO sub-tabs (Dashboard / Details)
  const [rtoSubTab, setRtoSubTab] = useState<'dashboard' | 'details'>('dashboard');
  interface RtoOrderRow {
    orderDate: string | null;
    itlDate: string | null;
    markedRejectedTime: string | null;
    markedRejectedAt: string | null;
    latestAttemptTime: string | null;
    poNumber: string;
    poStatus: string;
    orderValue: number;
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
    buyerFullAddress: string | null;
    buyerLongitude: string | null;
    buyerLatitude: string | null;
  }
  const [rtoListData, setRtoListData] = useState<RtoOrderRow[] | null>(null);
  const [rtoListLoading, setRtoListLoading] = useState(false);
  const [rtoListSearch, setRtoListSearch] = useState('');
  const [rtoListPage, setRtoListPage] = useState(1);
  const [rtoListRange, setRtoListRange] = useState<'year' | 'today' | '7d' | 'custom'>('year');
  const [rtoListCustomFrom, setRtoListCustomFrom] = useState('');
  const [rtoListCustomTo, setRtoListCustomTo] = useState('');
  // Trend tab — daily order trend chart
  interface DailyTrendPoint { day: string; ordersCount: number; ordersAmount: number; deliveredCount: number; deliveredAmount: number; }
  const [trendData, setTrendData] = useState<DailyTrendPoint[] | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendRange, setTrendRange] = useState<'7d' | '30d' | '90d' | 'all' | 'custom'>('30d');
  const [trendCustomFrom, setTrendCustomFrom] = useState('');
  const [trendCustomTo, setTrendCustomTo] = useState('');
  const [trendMetric, setTrendMetric] = useState<'count' | 'amount'>('count');
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
      const response = await fetch(`/api/order-monthly-status?year=${currentYear}`);
      if (!response.ok) throw new Error('Failed to fetch monthly data');
      const result: MonthlyStatusData = await response.json();
      setMonthlyData(result);
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
      const response = await fetch(`/api/order-monthly-status-delivery?year=${currentYear}`);
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
  }, []);

  const fetchPivotWeekly = async () => {
    try {
      setPivotWeekLoading(true);
      const response = await fetch(`/api/order-weekly-status-delivery?year=${currentYear}`);
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
    if (pivotGranularity === 'week' && !pivotWeekData) fetchPivotWeekly();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pivotGranularity]);

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
      const res = await fetch(`/api/order-daily-trend${params.toString() ? `?${params}` : ''}`);
      if (!res.ok) throw new Error('Failed to fetch trend');
      const json = await res.json();
      setTrendData(json.data);
    } catch (err) {
      console.error('Trend fetch error:', err);
      setTrendData([]);
    } finally {
      setTrendLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'trend') return;
    fetchTrend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, trendRange, trendCustomFrom, trendCustomTo]);

  const fetchRto = async () => {
    try {
      setRtoLoading(true);
      const res = await fetch(`/api/order-rto?year=${currentYear}`);
      if (!res.ok) throw new Error('Failed to fetch RTO');
      const json = await res.json();
      setRtoData(json);
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
      }
      const res = await fetch(`/api/order-rto-trend?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch RTO trend');
      const json = await res.json();
      setRtoTrendData(json.data);
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
  }, [activeTab, rtoTrendGranularity, rtoTrendCustomFrom, rtoTrendCustomTo]);

  const fetchRtoRate = async () => {
    try {
      setRtoRateLoading(true);
      const res = await fetch(`/api/order-rto-rate-monthly`);
      if (!res.ok) throw new Error('Failed to fetch monthly RTO rate');
      const json = await res.json();
      setRtoRateData(json.data);
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
  const fetchRtoKpiModalData = async () => {
    try {
      setRtoKpiModalLoading(true);
      const res = await fetch(`/api/order-rto-list`);
      if (!res.ok) throw new Error('Failed to fetch RTO orders for modal');
      const json = await res.json();
      setRtoKpiModalData(json.data);
    } catch (err) {
      console.error('RTO KPI modal fetch error:', err);
      setRtoKpiModalData([]);
    } finally {
      setRtoKpiModalLoading(false);
    }
  };

  // Open modal → ensure data loaded once
  useEffect(() => {
    if (!rtoKpiModal) return;
    setRtoKpiModalSearch('');
    if (!rtoKpiModalData) fetchRtoKpiModalData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rtoKpiModal]);

  // ESC closes modal
  useEffect(() => {
    if (!rtoKpiModal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setRtoKpiModal(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rtoKpiModal]);

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

  useEffect(() => { setRtoListPage(1); }, [rtoListSearch, rtoListRange, rtoListCustomFrom, rtoListCustomTo]);

  // Filtered + paged views of the RTO list
  // Always sorted by markedRejectedTime DESC (newest rejection first).
  const filteredRtoListRows = (() => {
    if (!rtoListData) return null;
    const q = rtoListSearch.trim().toLowerCase();
    const filtered = q
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
    month: number | null
  ) => {
    setPivotDrillOpen(true);
    setPivotDrillStatus(status);
    setPivotDrillDelivery(deliveryStatus);
    setPivotDrillMonth(month);
    setPivotDrillRows(null);
    setPivotDrillError(null);
    setPivotDrillSearch('');
    setPivotDrillPage(1);
    setPivotDrillLoading(true);
    try {
      const params = new URLSearchParams({ status, year: String(currentYear) });
      if (month !== null) params.append('month', String(month));
      if (deliveryStatus !== undefined) {
        params.append('deliveryStatus', deliveryStatus === null ? '__NULL__' : deliveryStatus);
      }
      const res = await fetch(`/api/order-list?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch');
      setPivotDrillRows(json.data);
    } catch (err) {
      setPivotDrillError(err instanceof Error ? err.message : 'Error loading orders');
    } finally {
      setPivotDrillLoading(false);
    }
  };

  const closePivotDrill = () => {
    setPivotDrillOpen(false);
    setPivotDrillStatus('');
    setPivotDrillDelivery(undefined);
    setPivotDrillMonth(null);
    setPivotDrillRows(null);
    setPivotDrillError(null);
    setPivotDrillSearch('');
    setPivotDrillPage(1);
  };

  const fetchGoal = async () => {
    try {
      setGoalLoading(true);
      const response = await fetch(`/api/order-revenue-goal?year=${currentYear}`);
      if (!response.ok) throw new Error('Failed to fetch goal data');
      const result: RevenueGoal = await response.json();
      setGoalData(result);
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
    if (funnelRange === 'custom') {
      return { startDate: funnelCustomFrom || null, endDate: funnelCustomTo || null };
    }
    return { startDate: null, endDate: null };
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
      const response = await fetch(`/api/order-seller-wise?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch seller data');
      const result: SellerWiseData = await response.json();
      setSellerData(result);
    } catch (err) {
      console.error('Seller fetch error:', err);
    } finally {
      setSellerLoading(false);
    }
  };

  useEffect(() => {
    fetchSeller();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerRange, sellerCustomFrom, sellerCustomTo]);

  const fetchSlab = async () => {
    try {
      setSlabLoading(true);
      const { startDate, endDate } = resolveSellerRange();
      const params = new URLSearchParams({ year: String(currentYear) });
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      const response = await fetch(`/api/order-seller-slab-monthly?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch slab data');
      const result: SellerSlabData = await response.json();
      setSlabData(result);
    } catch (err) {
      console.error('Slab fetch error:', err);
    } finally {
      setSlabLoading(false);
    }
  };

  useEffect(() => {
    fetchSlab();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerRange, sellerCustomFrom, sellerCustomTo]);

  // Demography (state-wise map) range + fetcher
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
      const res = await fetch(`/api/order-by-state?${params.toString()}`);
      if (!res.ok) throw new Error('failed');
      const json = await res.json();
      setStateData(json.data);
    } catch (err) {
      console.error('State fetch error:', err);
      setStateData([]);
    } finally {
      setStateLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'demography') return;
    fetchStateData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, stateRange, stateCustomFrom, stateCustomTo]);

  const fetchDistrictData = async () => {
    try {
      setDistrictLoading(true);
      const { startDate, endDate } = resolveStateRange();
      const params = new URLSearchParams({ year: String(currentYear) });
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (districtSelectedState) params.append('state', districtSelectedState);
      const res = await fetch(`/api/order-by-district?${params.toString()}`);
      if (!res.ok) throw new Error('failed');
      const json = await res.json();
      setDistrictData(json.data);
    } catch (err) {
      console.error('District fetch error:', err);
      setDistrictData([]);
    } finally {
      setDistrictLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'demography') return;
    if (geoMode !== 'district') return;
    fetchDistrictData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, geoMode, districtSelectedState, stateRange, stateCustomFrom, stateCustomTo]);

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
  useEffect(() => { setPivotDrillPage(1); }, [pivotDrillStatus, pivotDrillDelivery, pivotDrillMonth, pivotDrillSearch]);
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
      return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return s;
    }
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

  const filteredPivotDrillRows = (() => {
    if (!pivotDrillRows) return null;
    const q = pivotDrillSearch.trim().toLowerCase();
    if (!q) return pivotDrillRows;
    return pivotDrillRows.filter(
      (r) =>
        (r.poNumber || '').toLowerCase().includes(q) ||
        (r.buyerPhone || '').toLowerCase().includes(q) ||
        (r.sellerPhone || '').toLowerCase().includes(q)
    );
  })();

  const pivotDrillPaged = (() => {
    if (!filteredPivotDrillRows) return null;
    const totalPages = Math.max(1, Math.ceil(filteredPivotDrillRows.length / PAGE_SIZE));
    const safePage = Math.min(Math.max(1, pivotDrillPage), totalPages);
    const startIdx = (safePage - 1) * PAGE_SIZE;
    const endIdx = Math.min(startIdx + PAGE_SIZE, filteredPivotDrillRows.length);
    return { totalPages, safePage, startIdx, endIdx, rows: filteredPivotDrillRows.slice(startIdx, endIdx) };
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
            { key: 'demography', label: 'Demography' },
          ] as const).map((tab) => {
            const active = activeTab === tab.key;
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
          <div className="px-8 py-6 border-b border-white/10">
            <h2 className="text-2xl font-bold text-white">GMV Goal — {currentYear}</h2>
            <p className="text-white/60 text-sm mt-1">Sum of order amount where status is DELIVERED or COMPLETED, against a ₹1 Cr goal</p>
          </div>
          <div className="p-8">
            {goalLoading ? (
              <div className="py-12 text-center text-white/60">Loading...</div>
            ) : !goalData ? (
              <div className="py-12 text-center text-white/60">No data</div>
            ) : (() => {
              const pct = Math.min(goalData.achievePct, 100);
              const overshoot = goalData.achievePct > 100;
              const chartData = [{ name: 'Achieved', value: pct, fill: overshoot ? '#10b981' : '#a855f7' }];
              const remainingLabel = overshoot
                ? `Exceeded by ${formatAmount(goalData.achieved - goalData.goal)}`
                : `${formatAmount(goalData.remaining)} to go`;
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
                        <RadialBar background={{ fill: 'rgba(255,255,255,0.08)' }} dataKey="value" cornerRadius={12} />
                      </RadialBarChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <p className="text-white/60 text-xs uppercase tracking-wider">Achieved</p>
                      <p className="text-5xl font-bold text-white tabular-nums">{goalData.achievePct.toFixed(2)}%</p>
                      <p className="text-white/60 text-xs mt-1">{remainingLabel}</p>
                    </div>
                  </div>
                  <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <button
                      type="button"
                      onClick={() => setGoalModalOpen(true)}
                      className="text-left bg-white/5 border border-white/10 rounded-xl p-5 transition-all duration-300 hover:bg-white/15 hover:border-fuchsia-400/50 hover:shadow-[0_0_30px_rgba(217,70,239,0.3)] hover:scale-[1.02] cursor-pointer focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                    >
                      <p className="text-white/60 text-xs uppercase tracking-wider mb-2">Achieved</p>
                      <p className="text-3xl font-bold text-white tabular-nums">{formatAmount(goalData.achieved)}</p>
                      <p className="text-white/50 text-xs mt-1">{goalData.orders.toLocaleString()} orders</p>
                      <p className="text-[10px] text-fuchsia-300/70 mt-1">click for details →</p>
                    </button>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-5 transition-all duration-300 hover:bg-white/15 hover:border-fuchsia-400/50 hover:shadow-[0_0_30px_rgba(217,70,239,0.3)] hover:scale-[1.02]">
                      <p className="text-white/60 text-xs uppercase tracking-wider mb-2">Goal</p>
                      <p className="text-3xl font-bold text-white tabular-nums">{formatAmount(goalData.goal)}</p>
                      <p className="text-white/50 text-xs mt-1">DELIVERED + COMPLETED</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-5 transition-all duration-300 hover:bg-white/15 hover:border-fuchsia-400/50 hover:shadow-[0_0_30px_rgba(217,70,239,0.3)] hover:scale-[1.02]">
                      <p className="text-white/60 text-xs uppercase tracking-wider mb-2">{overshoot ? 'Above Goal' : 'Remaining'}</p>
                      <p className={`text-3xl font-bold tabular-nums ${overshoot ? 'text-emerald-400' : 'text-white'}`}>
                        {formatAmount(overshoot ? goalData.achieved - goalData.goal : goalData.remaining)}
                      </p>
                      <p className="text-white/50 text-xs mt-1">{overshoot ? 'beyond ₹1 Cr' : 'to hit ₹1 Cr'}</p>
                    </div>
                    <div className="sm:col-span-3 bg-white/5 border border-white/10 rounded-xl p-5 transition-all duration-300 hover:bg-white/15 hover:border-fuchsia-400/50 hover:shadow-[0_0_40px_rgba(217,70,239,0.3)]">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-white/70 text-sm font-semibold">Progress to ₹1 Cr</p>
                        <p className="text-white/70 text-sm tabular-nums">{goalData.achievePct.toFixed(2)}%</p>
                      </div>
                      <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${overshoot ? 'bg-emerald-500' : 'bg-purple-500'}`}
                          style={{ width: `${Math.min(goalData.achievePct, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>


        {/* Order Funnel — Created → Delivered / Rejected / Cancelled (by created_at) */}
        <div className="mt-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25),inset_0_0_30px_rgba(168,85,247,0.12)]">
          <div className="px-8 py-6 border-b border-white/10 bg-white/5 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white">Order Funnel</h2>
              <p className="text-purple-300 text-sm mt-1">
                Created → Delivered / Rejected / Cancelled — bucketed by <span className="font-mono text-fuchsia-300">created_at</span>
                {funnelData?.year && ` · ${funnelData.year}`}
                {funnelData?.startDate && funnelData?.endDate && ` · ${funnelData.startDate} → ${funnelData.endDate}`}
              </p>
            </div>
            {funnelData && (
              <button
                className={DOWNLOAD_BTN_CLASS}
                onClick={() => {
                  const total = funnelData.totalCount || 1;
                  const totalAmt = funnelData.totalAmount || 1;
                  const headers = ['Stage', 'Orders', '% of Created', 'Value', '% of Value'];
                  const pct = (n: number, d: number) => d > 0 ? `${((n / d) * 100).toFixed(2)}%` : '0%';
                  const rows: CsvCell[][] = [
                    ['Total Created',          funnelData.totalCount,     '100%',                                  funnelData.totalAmount,     '100%'],
                    ['Delivered + Completed',  funnelData.deliveredCount, pct(funnelData.deliveredCount, total),   funnelData.deliveredAmount, pct(funnelData.deliveredAmount, totalAmt)],
                    ['Rejected',               funnelData.rejectedCount,  pct(funnelData.rejectedCount,  total),   funnelData.rejectedAmount,  pct(funnelData.rejectedAmount,  totalAmt)],
                    ['Cancelled',              funnelData.cancelledCount, pct(funnelData.cancelledCount, total),   funnelData.cancelledAmount, pct(funnelData.cancelledAmount, totalAmt)],
                    ['In-flight (other)',      funnelData.inFlightCount,  pct(funnelData.inFlightCount,  total),   funnelData.inFlightAmount,  pct(funnelData.inFlightAmount,  totalAmt)],
                  ];
                  const rangeSuffix = funnelData.year ? String(funnelData.year)
                    : funnelData.startDate && funnelData.endDate ? `${funnelData.startDate}_${funnelData.endDate}`
                    : 'all';
                  downloadCSV(`order-funnel-${rangeSuffix}.csv`, headers, rows);
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
              { key: 'year',   label: `${currentYear} (full year)` },
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
          {/* Table */}
          <div className="overflow-x-auto">
            {funnelLoading || !funnelData ? (
              <div className="px-8 py-12 text-center text-purple-300">Loading funnel…</div>
            ) : (() => {
              const total = funnelData.totalCount || 1;
              const totalAmt = funnelData.totalAmount || 1;
              const pct = (n: number, d: number) => d > 0 ? (n / d) * 100 : 0;
              const stages: Array<{ label: string; count: number; amount: number; tone: string; bg: string; pillBg: string; pillText: string }> = [
                { label: 'Total Created',         count: funnelData.totalCount,     amount: funnelData.totalAmount,     tone: 'text-white',         bg: 'bg-white/10',         pillBg: 'bg-fuchsia-500/20',  pillText: 'text-fuchsia-200' },
                { label: 'Delivered + Completed', count: funnelData.deliveredCount, amount: funnelData.deliveredAmount, tone: 'text-emerald-200',   bg: 'bg-emerald-500/5',    pillBg: 'bg-emerald-500/20',  pillText: 'text-emerald-200' },
                { label: 'Rejected',              count: funnelData.rejectedCount,  amount: funnelData.rejectedAmount,  tone: 'text-rose-200',      bg: 'bg-rose-500/5',       pillBg: 'bg-rose-500/20',     pillText: 'text-rose-200' },
                { label: 'Cancelled',             count: funnelData.cancelledCount, amount: funnelData.cancelledAmount, tone: 'text-amber-200',     bg: 'bg-amber-500/5',       pillBg: 'bg-amber-500/20',    pillText: 'text-amber-200' },
                { label: 'In-flight (other)',     count: funnelData.inFlightCount,  amount: funnelData.inFlightAmount,  tone: 'text-purple-200',    bg: 'bg-purple-500/5',     pillBg: 'bg-purple-500/20',   pillText: 'text-purple-200' },
              ];
              return (
                <table className="w-full text-sm">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-purple-200 uppercase tracking-wider">Stage</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-purple-200 uppercase tracking-wider">Orders</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-purple-200 uppercase tracking-wider">% of Created</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-purple-200 uppercase tracking-wider">Value</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-purple-200 uppercase tracking-wider">% of Value</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-purple-200 uppercase tracking-wider w-[260px]">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stages.map((s, i) => {
                      const countPct = i === 0 ? 100 : pct(s.count, total);
                      const amtPct   = i === 0 ? 100 : pct(s.amount, totalAmt);
                      return (
                        <tr key={s.label} className={`border-b border-white/5 ${s.bg} hover:bg-white/5 transition-colors`}>
                          <td className="px-6 py-4">
                            <div className={`font-semibold ${s.tone}`}>{s.label}</div>
                            {i === 0 && <div className="text-[10px] text-purple-300/70 leading-tight mt-0.5">excluding DRAFT, test orders</div>}
                          </td>
                          <td className={`px-4 py-4 text-right tabular-nums font-bold ${s.tone}`}>{s.count.toLocaleString()}</td>
                          <td className="px-4 py-4 text-right tabular-nums text-purple-200">
                            <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold ${s.pillBg} ${s.pillText}`}>
                              {countPct.toFixed(2)}%
                            </span>
                          </td>
                          <td className={`px-4 py-4 text-right tabular-nums font-bold ${s.tone}`}>{formatAmount(s.amount)}</td>
                          <td className="px-4 py-4 text-right tabular-nums text-purple-200">
                            <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold ${s.pillBg} ${s.pillText}`}>
                              {amtPct.toFixed(2)}%
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${
                                  i === 0 ? 'bg-gradient-to-r from-fuchsia-500 to-purple-500'
                                  : i === 1 ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                                  : i === 2 ? 'bg-gradient-to-r from-rose-500 to-red-500'
                                  : i === 3 ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                                  : 'bg-gradient-to-r from-purple-500 to-indigo-500'
                                }`}
                                style={{ width: `${Math.min(countPct, 100)}%` }}
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
                    const headers = ['Status', 'Delivery Status', ...MONTH_NAMES.flatMap((m) => [`${m} Count`, `${m} Amount`]), 'Total Count', 'Total Amount'];
                    const rows: CsvCell[][] = [];
                    pivotData.data.forEach((row) => {
                      const parentCells = MONTH_NAMES.flatMap((_, i) => {
                        const c = row.months[i + 1];
                        return [c?.count ?? 0, c?.amount ?? 0];
                      });
                      rows.push([row.status, '(all)', ...parentCells, row.total.count, row.total.amount]);
                      row.deliveryStatuses.forEach((sub) => {
                        const subCells = MONTH_NAMES.flatMap((_, i) => {
                          const c = sub.months[i + 1];
                          return [c?.count ?? 0, c?.amount ?? 0];
                        });
                        rows.push([row.status, sub.deliveryStatus ?? '(no delivery status)', ...subCells, sub.total.count, sub.total.amount]);
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
                    pivotWeekData.data.forEach((row) => {
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
                    pivotDayData.data.forEach((row) => {
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
                    {MONTH_NAMES.map((m) => (
                      <th key={m} colSpan={2} className="px-2 py-2 text-center text-xs font-semibold text-purple-200 border-r border-white/10">
                        {m}
                      </th>
                    ))}
                    <th colSpan={2} className="px-2 py-2 text-center text-xs font-bold text-purple-100 bg-purple-500/20">Total</th>
                  </tr>
                  <tr className="bg-white/5 border-b border-white/10">
                    {[...Array(13)].map((_, i) => (
                      <Fragment key={i}>
                        <th className={`px-2 py-2 text-right text-[10px] font-medium ${i === 12 ? 'text-purple-100 bg-purple-500/20' : 'text-purple-300'}`}>Count</th>
                        <th className={`px-2 py-2 text-right text-[10px] font-medium border-r border-white/10 ${i === 12 ? 'text-purple-100 bg-purple-500/20' : 'text-purple-300'}`}>Amount</th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pivotData.data.map((row) => {
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
                          {MONTH_NAMES.map((_, idx) => {
                            const month = idx + 1;
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
                            className="px-2 py-3 text-right tabular-nums font-bold text-purple-100 bg-purple-500/10 border-r border-white/10 cursor-pointer transition-all duration-200 hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:text-white hover:shadow-[inset_0_0_20px_rgba(217,70,239,0.7),0_0_22px_rgba(168,85,247,0.6)] hover:scale-110 transform-gpu relative"
                          >
                            {formatAmount(row.total.amount)}
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
                            {MONTH_NAMES.map((_, idx) => {
                              const month = idx + 1;
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
                              className="px-2 py-2.5 text-right text-xs tabular-nums text-purple-200/80 bg-purple-500/5 border-r border-white/10 cursor-pointer transition-all duration-200 hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:text-white hover:font-bold hover:shadow-[inset_0_0_18px_rgba(217,70,239,0.6),0_0_18px_rgba(168,85,247,0.55)] hover:scale-110 transform-gpu relative"
                            >
                              {formatAmount(sub.total.amount)}
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
                    {MONTH_NAMES.map((_, idx) => {
                      const month = idx + 1;
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
                    <td className="px-2 py-3 text-right tabular-nums text-purple-50 bg-purple-500/30 border-r border-white/10">
                      {formatAmount(pivotData.totals.grand.amount)}
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
                    {pivotWeekData.data.map((row) => {
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
                              return (
                                <Fragment key={w}>
                                  <td className={`px-2 py-3 text-right tabular-nums ${hasData ? 'text-white' : 'text-white/30'}`}>{hasData ? cell.count.toLocaleString() : '—'}</td>
                                  <td className={`px-2 py-3 text-right tabular-nums border-r border-white/10 ${hasData ? 'text-purple-200' : 'text-white/30'}`}>{hasData ? formatAmount(cell.amount) : '—'}</td>
                                </Fragment>
                              );
                            })}
                            <td className="px-2 py-3 text-right tabular-nums font-bold text-white bg-purple-500/10">{row.total.count.toLocaleString()}</td>
                            <td className="px-2 py-3 text-right tabular-nums font-bold text-purple-100 bg-purple-500/10 border-r border-white/10">{formatAmount(row.total.amount)}</td>
                          </tr>
                          {expanded && row.deliveryStatuses.map((sub) => (
                            <tr key={`${row.status}-${sub.deliveryStatus ?? 'null'}`} className="border-b border-white/5 bg-white/[0.02]">
                              <td className="px-4 py-2.5 sticky left-0 bg-slate-900/85 backdrop-blur z-10 border-r border-white/10 text-purple-100 text-xs">
                                <div className="flex items-center gap-2 pl-6"><span className="text-purple-400/60">└</span><span className={sub.deliveryStatus ? '' : 'italic text-purple-300/70'}>{sub.deliveryStatus ?? '(no delivery status)'}</span></div>
                              </td>
                              {weeks.map((w) => {
                                const cell = sub.weeks[w];
                                const hasData = cell && cell.count > 0;
                                return (
                                  <Fragment key={w}>
                                    <td className={`px-2 py-2.5 text-right text-xs tabular-nums ${hasData ? 'text-purple-100' : 'text-white/20'}`}>{hasData ? cell.count.toLocaleString() : '—'}</td>
                                    <td className={`px-2 py-2.5 text-right text-xs tabular-nums border-r border-white/10 ${hasData ? 'text-purple-200/80' : 'text-white/20'}`}>{hasData ? formatAmount(cell.amount) : '—'}</td>
                                  </Fragment>
                                );
                              })}
                              <td className="px-2 py-2.5 text-right text-xs tabular-nums text-purple-100 bg-purple-500/5">{sub.total.count.toLocaleString()}</td>
                              <td className="px-2 py-2.5 text-right text-xs tabular-nums text-purple-200/80 bg-purple-500/5 border-r border-white/10">{formatAmount(sub.total.amount)}</td>
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
                    {pivotDayData.data.map((row) => {
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
                              return (
                                <Fragment key={d}>
                                  <td className={`px-2 py-3 text-right tabular-nums ${hasData ? 'text-white' : 'text-white/30'}`}>{hasData ? cell.count.toLocaleString() : '—'}</td>
                                  <td className={`px-2 py-3 text-right tabular-nums border-r border-white/10 ${hasData ? 'text-purple-200' : 'text-white/30'}`}>{hasData ? formatAmount(cell.amount) : '—'}</td>
                                </Fragment>
                              );
                            })}
                            <td className="px-2 py-3 text-right tabular-nums font-bold text-white bg-purple-500/10">{row.total.count.toLocaleString()}</td>
                            <td className="px-2 py-3 text-right tabular-nums font-bold text-purple-100 bg-purple-500/10 border-r border-white/10">{formatAmount(row.total.amount)}</td>
                          </tr>
                          {expanded && row.deliveryStatuses.map((sub) => (
                            <tr key={`${row.status}-${sub.deliveryStatus ?? 'null'}`} className="border-b border-white/5 bg-white/[0.02]">
                              <td className="px-4 py-2.5 sticky left-0 bg-slate-900/85 backdrop-blur z-10 border-r border-white/10 text-purple-100 text-xs">
                                <div className="flex items-center gap-2 pl-6"><span className="text-purple-400/60">└</span><span className={sub.deliveryStatus ? '' : 'italic text-purple-300/70'}>{sub.deliveryStatus ?? '(no delivery status)'}</span></div>
                              </td>
                              {days.map((d) => {
                                const cell = sub.days[d];
                                const hasData = cell && cell.count > 0;
                                return (
                                  <Fragment key={d}>
                                    <td className={`px-2 py-2.5 text-right text-xs tabular-nums ${hasData ? 'text-purple-100' : 'text-white/20'}`}>{hasData ? cell.count.toLocaleString() : '—'}</td>
                                    <td className={`px-2 py-2.5 text-right text-xs tabular-nums border-r border-white/10 ${hasData ? 'text-purple-200/80' : 'text-white/20'}`}>{hasData ? formatAmount(cell.amount) : '—'}</td>
                                  </Fragment>
                                );
                              })}
                              <td className="px-2 py-2.5 text-right text-xs tabular-nums text-purple-100 bg-purple-500/5">{sub.total.count.toLocaleString()}</td>
                              <td className="px-2 py-2.5 text-right text-xs tabular-nums text-purple-200/80 bg-purple-500/5 border-r border-white/10">{formatAmount(sub.total.amount)}</td>
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
        </>
        )}

        {activeTab === 'trend' && (
        <>
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
                    dot={{ r: 2.5, fill: '#d946ef', stroke: '#1e1b4b', strokeWidth: 1 }}
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
                    dot={{ r: 2.5, fill: '#10b981', stroke: '#1e1b4b', strokeWidth: 1 }}
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

        {/* Monthly Trend & Growth — Status × Month, share-of-mix with pp delta */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25),inset_0_0_30px_rgba(168,85,247,0.12)]">
          <div className="px-8 py-6 border-b border-white/10 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white">Monthly Trend & Growth</h2>
              <p className="text-white/60 text-sm mt-1">Share of monthly orders & revenue per status, with month-over-month change in percentage points — {currentYear}</p>
            </div>
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
              {(['dashboard', 'details'] as const).map((sub) => {
                const active = rtoSubTab === sub;
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
                    {sub === 'dashboard' ? 'Dashboard' : 'Details'}
                  </button>
                );
              })}
            </div>

            {rtoSubTab === 'dashboard' && (
            <>
            {/* Header + KPI tiles */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25),inset_0_0_30px_rgba(168,85,247,0.12)]">
              <div className="px-8 py-6 border-b border-white/10 bg-white/5">
                <h2 className="text-2xl font-bold text-white">RTO — Return To Origin</h2>
                <p className="text-purple-300 text-sm mt-1">
                  Orders marked REJECTED with delivery status containing &ldquo;RTO&rdquo; — bucketed by <span className="font-mono text-fuchsia-300">markedRejectedTime</span>, year {currentYear}
                </p>
              </div>
              <div className="p-6">
                {rtoLoading || !rtoData ? (
                  <div className="py-12 text-center text-purple-300">Loading RTO data…</div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <button
                      type="button"
                      onClick={() => setRtoKpiModal('count')}
                      className="text-left bg-white/5 border border-white/10 rounded-xl p-5 transition-all duration-200 hover:bg-white/10 hover:border-fuchsia-400/60 hover:shadow-[0_0_24px_rgba(217,70,239,0.25)] hover:scale-[1.02] cursor-pointer focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                    >
                      <div className="text-[10px] text-purple-300 uppercase tracking-wider">Total RTO orders</div>
                      <div className="text-3xl font-bold text-white tabular-nums mt-1">{rtoData.grand.count.toLocaleString()}</div>
                      <div className="text-[10px] text-fuchsia-300/70 mt-1">click for details →</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRtoKpiModal('value')}
                      className="text-left bg-white/5 border border-white/10 rounded-xl p-5 transition-all duration-200 hover:bg-white/10 hover:border-fuchsia-400/60 hover:shadow-[0_0_24px_rgba(217,70,239,0.25)] hover:scale-[1.02] cursor-pointer focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                    >
                      <div className="text-[10px] text-purple-300 uppercase tracking-wider">RTO order value</div>
                      <div className="text-3xl font-bold text-white tabular-nums mt-1">{formatAmount(rtoData.grand.amount)}</div>
                      <div className="text-[10px] text-fuchsia-300/70 mt-1">click for details →</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRtoKpiModal('rate')}
                      className="text-left bg-white/5 border border-white/10 rounded-xl p-5 transition-all duration-200 hover:bg-white/10 hover:border-fuchsia-400/60 hover:shadow-[0_0_24px_rgba(217,70,239,0.25)] hover:scale-[1.02] cursor-pointer focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                    >
                      <div className="text-[10px] text-purple-300 uppercase tracking-wider">RTO rate</div>
                      <div className="text-3xl font-bold text-rose-300 tabular-nums mt-1">{rtoData.rtoRate.toFixed(2)}%</div>
                      <div className="text-[10px] text-purple-300/60 mt-0.5">vs delivered+completed</div>
                      <div className="text-[10px] text-fuchsia-300/70 mt-1">click for details →</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRtoKpiModal('avg')}
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
                    <p className="text-purple-300/70 text-xs mt-0.5">Highest RTO order count this year</p>
                  </div>
                  {rtoData && rtoData.topSellers.length > 0 && (
                    <button
                      className={DOWNLOAD_BTN_CLASS}
                      onClick={() => {
                        const headers = ['Seller Business', 'Seller Phone', 'RTO Count', 'RTO Amount'];
                        const rows: CsvCell[][] = rtoData.topSellers.map((s) => [
                          s.sellerBusinessName, s.sellerPhone, s.count, s.amount,
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
                          <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-purple-200">#</th>
                          <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-purple-200">Seller</th>
                          <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-purple-200">RTO</th>
                          <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-purple-200">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rtoData.topSellers.slice(0, 10).map((s, i) => (
                          <tr key={s.sellerId} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                            <td className="px-4 py-2.5 text-purple-300 tabular-nums">{i + 1}</td>
                            <td className="px-4 py-2.5">
                              <div className="text-white font-medium leading-tight">{s.sellerBusinessName || '—'}</div>
                              <div className="text-purple-300/70 text-[10px] tabular-nums leading-tight mt-0.5">{s.sellerPhone || '—'}</div>
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-bold text-rose-200">{s.count.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-purple-100">{formatAmount(s.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25),inset_0_0_30px_rgba(168,85,247,0.12)]">
                <div className="px-6 py-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white">Top states by RTO</h3>
                    <p className="text-purple-300/70 text-xs mt-0.5">Highest RTO order count this year</p>
                  </div>
                  {rtoData && rtoData.topStates.length > 0 && (
                    <button
                      className={DOWNLOAD_BTN_CLASS}
                      onClick={() => {
                        const headers = ['State', 'RTO Count', 'RTO Amount'];
                        const rows: CsvCell[][] = rtoData.topStates.map((s) => [s.state ?? '(no state)', s.count, s.amount]);
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
                          <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-purple-200">#</th>
                          <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-purple-200">State</th>
                          <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-purple-200">RTO</th>
                          <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-purple-200">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rtoData.topStates.slice(0, 10).map((st, i) => (
                          <tr key={(st.state ?? 'unknown') + i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                            <td className="px-4 py-2.5 text-purple-300 tabular-nums">{i + 1}</td>
                            <td className="px-4 py-2.5 text-white">{st.state || <span className="text-purple-300/70 italic">(no state)</span>}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-bold text-rose-200">{st.count.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-purple-100">{formatAmount(st.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
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
                  {rtoListData && rtoListData.length > 0 && (
                    <button
                      className={DOWNLOAD_BTN_CLASS}
                      onClick={() => {
                        const rows = filteredRtoListRows || [];
                        const headers = [
                          'Brand Name', 'PO Number', 'Order Value', 'Marked Rejected Time',
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
                          r.brandName, r.poNumber, r.orderValue, r.markedRejectedTime,
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
                            <td className="px-3 py-2.5 text-white tabular-nums font-semibold whitespace-nowrap">{r.poNumber}</td>
                            <td className="px-3 py-2.5 text-right text-white tabular-nums whitespace-nowrap">{formatAmount(r.orderValue)}</td>
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

        {activeTab === 'demography' && (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25),inset_0_0_30px_rgba(168,85,247,0.12)]">
            <div className="px-8 py-6 border-b border-white/10 bg-white/5 flex items-center justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-2xl font-bold text-white">Demography</h2>
                <p className="text-purple-300 text-sm mt-1">
                  {geoMode === 'state'
                    ? 'Order distribution across Indian states — click any state to drill into its districts'
                    : `District-level order distribution${districtSelectedState ? ` in ${districtSelectedState}` : ' across India'}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
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
                        {m === 'count' ? 'By orders' : 'By revenue'}
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
                        `demography-state-${currentYear}.csv`,
                        ['State', 'Order Count', 'Order Amount'],
                        stateData.map((r) => [r.state ?? '(no state)', r.count, r.amount])
                      );
                    } else {
                      if (!districtData) return;
                      const filename = districtSelectedState
                        ? `demography-district-${districtSelectedState}-${currentYear}.csv`
                        : `demography-district-${currentYear}.csv`;
                      downloadCSV(
                        filename,
                        ['State', 'District', 'Order Count', 'Order Amount'],
                        districtData.map((r) => [r.state ?? '(no state)', r.district ?? '(no district)', r.count, r.amount])
                      );
                    }
                  }}
                >
                  ↓ CSV
                </button>
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
          </div>
        )}

        {/* Status × Delivery Status Drilldown Modal */}
        {pivotDrillOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            onClick={closePivotDrill}
          >
            <div
              className="bg-white text-slate-900 border border-slate-200 rounded-2xl max-w-7xl w-full max-h-[88vh] flex flex-col overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-slate-50 to-purple-50">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    {pivotDrillStatus}
                    {pivotDrillDelivery !== undefined && (
                      <span className="text-slate-500 text-base font-normal"> → </span>
                    )}
                    {pivotDrillDelivery !== undefined && (
                      <span className="text-fuchsia-600 text-base font-semibold">
                        {pivotDrillDelivery ?? '(no delivery status)'}
                      </span>
                    )}
                  </h3>
                  <p className="text-slate-500 text-sm mt-0.5">
                    {pivotDrillMonth ? `${MONTH_NAMES[pivotDrillMonth - 1]} ${currentYear}` : `${currentYear} (all months)`}
                    {' · '}
                    {pivotDrillLoading
                      ? 'Loading…'
                      : pivotDrillRows
                      ? `${filteredPivotDrillRows?.length ?? 0} of ${pivotDrillRows.length} order${pivotDrillRows.length === 1 ? '' : 's'}`
                      : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className={DOWNLOAD_BTN_LIGHT_CLASS}
                    disabled={!filteredPivotDrillRows || filteredPivotDrillRows.length === 0}
                    onClick={() => {
                      if (!filteredPivotDrillRows) return;
                      const isRejected = pivotDrillStatus === 'REJECTED';
                      const headers = [
                        'PO Number', 'Amount', 'Marked Pending', 'Seller Phone', 'Seller Business',
                        'Buyer Phone', 'Buyer Business', 'Seller Address', 'Buyer Address',
                        ...(isRejected ? ['Reject Reason', 'Rejected By', 'Reason Added By Badho Team'] : []),
                      ];
                      const rows: CsvCell[][] = filteredPivotDrillRows.map((r) => [
                        r.poNumber, r.amount, r.markedPendingTime, r.sellerPhone, r.sellerBusinessName,
                        r.buyerPhone, r.buyerBusinessName, r.sellerAddress ?? '', r.buyerAddress,
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
                    className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-medium"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="px-6 py-3 border-b border-slate-200 bg-white">
                <input
                  type="text"
                  value={pivotDrillSearch}
                  onChange={(e) => setPivotDrillSearch(e.target.value)}
                  placeholder="Search by PO number, buyer phone, or seller phone..."
                  className="w-full px-4 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent"
                />
              </div>
              <div className="flex-1 overflow-auto">
                {pivotDrillLoading ? (
                  <div className="px-6 py-12 text-center text-slate-500">Loading orders…</div>
                ) : pivotDrillError ? (
                  <div className="px-6 py-12 text-center text-rose-600">{pivotDrillError}</div>
                ) : !pivotDrillRows || pivotDrillRows.length === 0 ? (
                  <div className="px-6 py-12 text-center text-slate-500">No orders found</div>
                ) : !filteredPivotDrillRows || filteredPivotDrillRows.length === 0 ? (
                  <div className="px-6 py-12 text-center text-slate-500">No matches for &ldquo;{pivotDrillSearch}&rdquo;</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-100 z-10">
                      <tr className="border-b border-slate-200">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">PO Number</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">Amount</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Marked Pending</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Seller Phone</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Seller Business</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Buyer Phone</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Buyer Business</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Seller Address</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Buyer Address</th>
                        {pivotDrillStatus === 'REJECTED' && (
                          <>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-rose-700 bg-rose-50">Reject Reason</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-rose-700 bg-rose-50">Rejected By</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-rose-700 bg-rose-50">Reason Added By Badho Team</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {(pivotDrillPaged?.rows || filteredPivotDrillRows).map((r) => (
                        <tr key={r.poNumber} className="border-b border-slate-100 hover:bg-slate-50 align-top">
                          <td className="px-4 py-3 text-slate-900 tabular-nums font-medium whitespace-nowrap">{r.poNumber}</td>
                          <td className="px-4 py-3 text-right text-slate-900 tabular-nums whitespace-nowrap">₹{r.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatDateTime(r.markedPendingTime)}</td>
                          <td className="px-4 py-3 text-slate-700 tabular-nums whitespace-nowrap">{r.sellerPhone || '—'}</td>
                          <td className="px-4 py-3 text-slate-700">{r.sellerBusinessName || <span className="text-slate-400 italic">—</span>}</td>
                          <td className="px-4 py-3 text-slate-700 tabular-nums whitespace-nowrap">{r.buyerPhone || '—'}</td>
                          <td className="px-4 py-3 text-slate-700">{r.buyerBusinessName || <span className="text-slate-400 italic">—</span>}</td>
                          <td className="px-4 py-3 text-slate-600 max-w-xs" title={r.sellerAddress || ''}>{r.sellerAddress || <span className="text-slate-400 italic">—</span>}</td>
                          <td className="px-4 py-3 text-slate-600 max-w-xs" title={r.buyerAddress || ''}>{r.buyerAddress || <span className="text-slate-400 italic">—</span>}</td>
                          {pivotDrillStatus === 'REJECTED' && (
                            <>
                              <td className="px-4 py-3 text-slate-700 max-w-xs bg-rose-50/40" title={r.rejectReason || ''}>{r.rejectReason || <span className="text-slate-400 italic">—</span>}</td>
                              <td className="px-4 py-3 text-slate-700 bg-rose-50/40">{r.rejectedBy || <span className="text-slate-400 italic">—</span>}</td>
                              <td className="px-4 py-3 text-slate-700 max-w-xs bg-rose-50/40" title={r.reasonAddedByBadhoTeam || ''}>{r.reasonAddedByBadhoTeam || <span className="text-slate-400 italic">—</span>}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              {pivotDrillPaged && filteredPivotDrillRows && filteredPivotDrillRows.length > 0 && (
                <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-sm text-slate-600 flex-wrap gap-2">
                  <div>
                    Showing <span className="font-semibold text-slate-900">{pivotDrillPaged.startIdx + 1}</span>–<span className="font-semibold text-slate-900">{pivotDrillPaged.endIdx}</span> of <span className="font-semibold text-slate-900">{filteredPivotDrillRows.length}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPivotDrillPage((p) => Math.max(1, p - 1))}
                      disabled={pivotDrillPaged.safePage <= 1}
                      className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Prev
                    </button>
                    <span className="px-2 text-slate-500">
                      Page <span className="text-slate-900 font-semibold">{pivotDrillPaged.safePage}</span> of {pivotDrillPaged.totalPages}
                    </span>
                    <button
                      onClick={() => setPivotDrillPage((p) => Math.min(pivotDrillPaged.totalPages, p + 1))}
                      disabled={pivotDrillPaged.safePage >= pivotDrillPaged.totalPages}
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
                      const headers = ['PO Number', 'Status', 'Amount', 'Buyer Phone', 'Buyer Business', 'Marked Pending', 'Created At'];
                      const rows: CsvCell[][] = filteredSellerDrillRows.map((r) => [
                        r.poNumber, r.status, r.amount, r.buyerPhone, r.buyerBusinessName, r.markedPendingTime, r.createdAt,
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
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Status</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">Amount</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Buyer Phone</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Buyer Business</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Marked Pending</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Created At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(sellerDrillPaged?.rows || filteredSellerDrillRows).map((r) => (
                        <tr key={r.poNumber} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-900 tabular-nums font-medium">{r.poNumber}</td>
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
                          <td className="px-4 py-3 text-slate-700 tabular-nums">{r.buyerPhone || '—'}</td>
                          <td className="px-4 py-3 text-slate-700">{r.buyerBusinessName || '—'}</td>
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
                      const headers = ['PO Number', 'Status', 'Amount', 'Buyer Phone', 'Buyer Business', 'Seller Phone', 'Seller Business', 'Buyer Address', 'Buyer State', 'Marked Pending', 'Created At'];
                      const rows: CsvCell[][] = filteredDrillRows.map((r) => [
                        r.poNumber, r.status, r.amount, r.buyerPhone, r.buyerBusinessName, r.sellerPhone, r.sellerBusinessName, r.buyerAddress, r.buyerState, r.markedPendingTime, r.createdAt,
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
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Status</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">Amount</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Buyer Phone</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Buyer Business</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Seller Phone</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Seller Business</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Buyer Address</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Buyer State</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Marked Pending</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Created At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(drillPaged?.rows || filteredDrillRows).map((r) => (
                        <tr key={r.poNumber} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-900 tabular-nums font-medium">{r.poNumber}</td>
                          <td className="px-4 py-3 text-slate-700">{r.status}</td>
                          <td className="px-4 py-3 text-right text-slate-900 tabular-nums">₹{r.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-slate-700">{r.buyerPhone || '—'}</td>
                          <td className="px-4 py-3 text-slate-700">{r.buyerBusinessName || '—'}</td>
                          <td className="px-4 py-3 text-slate-700">{r.sellerPhone || '—'}</td>
                          <td className="px-4 py-3 text-slate-700">{r.sellerBusinessName || '—'}</td>
                          <td className="px-4 py-3 text-slate-600 max-w-xs truncate" title={r.buyerAddress}>{r.buyerAddress || '—'}</td>
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setRtoKpiModal(null)}
          >
            <div
              className="bg-white text-slate-900 border border-slate-200 rounded-2xl max-w-7xl w-full max-h-[88vh] flex flex-col overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-rose-50 to-fuchsia-50">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    {rtoKpiModal === 'count' && 'Total RTO orders'}
                    {rtoKpiModal === 'value' && 'RTO order value'}
                    {rtoKpiModal === 'rate' && 'RTO rate'}
                    {rtoKpiModal === 'avg' && 'Avg RTO value'}
                    <span className="text-slate-500 text-base font-normal"> — {currentYear}</span>
                  </h3>
                  <p className="text-slate-500 text-sm mt-0.5">
                    {rtoKpiModal === 'count' && `All ${rtoData?.grand.count.toLocaleString() ?? '—'} RTO orders this year`}
                    {rtoKpiModal === 'value' && `Total value across all RTO orders — ${formatAmount(rtoData?.grand.amount ?? 0)}`}
                    {rtoKpiModal === 'rate' && (
                      <>
                        {rtoData?.rtoRate.toFixed(2)}% = <span className="font-semibold text-rose-600">{rtoData?.grand.count.toLocaleString()} RTO</span> ÷ (<span className="font-semibold text-emerald-600">{rtoData?.deliveredCount.toLocaleString()} Delivered+Completed</span> + RTO)
                      </>
                    )}
                    {rtoKpiModal === 'avg' && `Avg value per RTO order — ${formatAmount(rtoData?.avgRtoValue ?? 0)} across ${rtoData?.grand.count.toLocaleString()} orders`}
                  </p>
                </div>
                <button
                  onClick={() => setRtoKpiModal(null)}
                  className="text-slate-400 hover:text-slate-700 text-2xl leading-none p-1"
                  aria-label="Close"
                >
                  ×
                </button>
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

              {/* Search + count + go-to-Details */}
              <div className="px-6 py-3 border-b border-slate-200 bg-white flex items-center gap-3 flex-wrap">
                <input
                  type="text"
                  value={rtoKpiModalSearch}
                  onChange={(e) => setRtoKpiModalSearch(e.target.value)}
                  placeholder="Search PO, brand, buyer, AWB, shipment status…"
                  className="flex-1 min-w-[240px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                />
                {rtoKpiModalData && (() => {
                  const q = rtoKpiModalSearch.trim().toLowerCase();
                  const filtered = q
                    ? rtoKpiModalData.filter((r) =>
                        String(r.poNumber || '').toLowerCase().includes(q) ||
                        (r.brandName || '').toLowerCase().includes(q) ||
                        (r.buyerPhone || '').toLowerCase().includes(q) ||
                        (r.buyerName || '').toLowerCase().includes(q) ||
                        (r.buyerBusinessName || '').toLowerCase().includes(q) ||
                        (r.shipmentStatus || '').toLowerCase().includes(q) ||
                        (r.awbNumber || '').toLowerCase().includes(q)
                      )
                    : rtoKpiModalData;
                  return (
                    <span className="text-xs text-slate-500 whitespace-nowrap">
                      {filtered.length.toLocaleString()} of {rtoKpiModalData.length.toLocaleString()} orders
                    </span>
                  );
                })()}
                <button
                  onClick={() => { setRtoKpiModal(null); setRtoSubTab('details'); }}
                  className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white text-xs font-semibold hover:shadow-[0_0_18px_rgba(217,70,239,0.4)]"
                >
                  Open full Details tab →
                </button>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-auto">
                {rtoKpiModalLoading || !rtoKpiModalData ? (
                  <div className="px-8 py-16 text-center text-slate-500">Loading RTO orders…</div>
                ) : rtoKpiModalData.length === 0 ? (
                  <div className="px-8 py-16 text-center text-slate-500">No RTO orders for {currentYear}</div>
                ) : (() => {
                  const q = rtoKpiModalSearch.trim().toLowerCase();
                  const sorted = [...rtoKpiModalData].sort((a, b) => {
                    if (rtoKpiModal === 'value' || rtoKpiModal === 'avg') {
                      return (b.orderValue || 0) - (a.orderValue || 0);
                    }
                    const ta = a.markedRejectedAt ? new Date(a.markedRejectedAt).getTime() : 0;
                    const tb = b.markedRejectedAt ? new Date(b.markedRejectedAt).getTime() : 0;
                    return tb - ta;
                  });
                  const filtered = q
                    ? sorted.filter((r) =>
                        String(r.poNumber || '').toLowerCase().includes(q) ||
                        (r.brandName || '').toLowerCase().includes(q) ||
                        (r.buyerPhone || '').toLowerCase().includes(q) ||
                        (r.buyerName || '').toLowerCase().includes(q) ||
                        (r.buyerBusinessName || '').toLowerCase().includes(q) ||
                        (r.shipmentStatus || '').toLowerCase().includes(q) ||
                        (r.awbNumber || '').toLowerCase().includes(q)
                      )
                    : sorted;
                  if (filtered.length === 0) {
                    return <div className="px-8 py-16 text-center text-slate-500">No matches for &ldquo;{rtoKpiModalSearch}&rdquo;</div>;
                  }
                  return (
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap">Brand</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap">PO Number</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-slate-600 whitespace-nowrap">Order Value</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-rose-600 whitespace-nowrap">Marked Rejected</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap">Shipment Status</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap">Buyer Phone</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap">Buyer Business</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-slate-600 whitespace-nowrap">Attempts</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-rose-600 whitespace-nowrap">Final Failure Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((r) => (
                          <tr key={r.poNumber} className="border-b border-slate-100 hover:bg-rose-50/40 align-top">
                            <td className="px-3 py-2 text-slate-800 whitespace-nowrap font-medium">{r.brandName || '—'}</td>
                            <td className="px-3 py-2 text-slate-900 tabular-nums font-semibold whitespace-nowrap">{r.poNumber}</td>
                            <td className="px-3 py-2 text-right text-slate-900 tabular-nums whitespace-nowrap">{formatAmount(r.orderValue)}</td>
                            <td className="px-3 py-2 text-rose-700 whitespace-nowrap">{r.markedRejectedTime || '—'}</td>
                            <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.shipmentStatus || '—'}</td>
                            <td className="px-3 py-2 text-slate-700 tabular-nums whitespace-nowrap">{r.buyerPhone || '—'}</td>
                            <td className="px-3 py-2 text-slate-700">{r.buyerBusinessName || '—'}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-bold text-rose-700">{r.deliveryAttempt || 0}</td>
                            <td className="px-3 py-2 text-rose-700 max-w-[280px]" title={r.finalFailureReason || ''}>{r.finalFailureReason || <span className="italic text-slate-400">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

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
                      : 'Shipped revenue toward the ₹1 Cr goal'}
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
                            'PO Number', 'Status', 'Delivery Status', 'Amount',
                            'Marked Pending Time', 'Marked Delivered Time',
                            'Seller Business', 'Seller Phone',
                            'Buyer Business', 'Buyer Phone', 'Buyer City', 'Buyer State',
                            'Delivery Network', 'Delivery Type',
                          ];
                          const rows: CsvCell[][] = filtered.map((r) => [
                            r.poNumber, r.status, r.deliveryStatus, r.amount,
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
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap">Status</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-slate-600 whitespace-nowrap">Amount</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap">Pending Time</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap">Delivered Time</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap">Seller</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap">Buyer</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap">Buyer Phone</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap">City / State</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap">Delivery Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.slice(0, 2000).map((r) => (
                          <tr key={r.poNumber} className="border-b border-slate-100 hover:bg-emerald-50/40 align-top">
                            <td className="px-3 py-2 text-slate-900 tabular-nums font-semibold whitespace-nowrap">{r.poNumber}</td>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                r.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                              }`}>{r.status}</span>
                            </td>
                            <td className="px-3 py-2 text-right text-slate-900 tabular-nums whitespace-nowrap">{formatAmount(r.amount)}</td>
                            <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.markedPendingTime || '—'}</td>
                            <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.markedDeliveredTime || '—'}</td>
                            <td className="px-3 py-2 text-slate-800">
                              <div className="font-medium leading-tight">{r.sellerBusinessName || '—'}</div>
                              <div className="text-[10px] text-slate-500 tabular-nums leading-tight">{r.sellerPhone || '—'}</div>
                            </td>
                            <td className="px-3 py-2 text-slate-800">
                              <div className="font-medium leading-tight">{r.buyerBusinessName || '—'}</div>
                            </td>
                            <td className="px-3 py-2 text-slate-700 tabular-nums whitespace-nowrap">{r.buyerPhone || '—'}</td>
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
    </div>
  );
}
