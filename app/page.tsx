'use client';

import { useEffect, useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';
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
  const [monthlyLoading, setMonthlyLoading] = useState(true);
  const [pivotData, setPivotData] = useState<MonthlyStatusDeliveryData | null>(null);
  const [pivotLoading, setPivotLoading] = useState(true);
  const [expandedStatuses, setExpandedStatuses] = useState<Set<string>>(new Set());
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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'seller' | 'demography'>('dashboard');
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

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Top bar — signed-in user + logout */}
        <div className="mb-6 flex items-center justify-end gap-3">
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

        {/* Tabs */}
        <div className="mb-8 flex gap-2 p-1.5 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl w-fit">
          {([
            { key: 'dashboard', label: 'Dashboard' },
            { key: 'seller', label: 'Seller wise' },
            { key: 'demography', label: 'Demography' },
          ] as const).map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
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
                    <div className="bg-white/5 border border-white/10 rounded-xl p-5 transition-all duration-300 hover:bg-white/15 hover:border-fuchsia-400/50 hover:shadow-[0_0_30px_rgba(217,70,239,0.3)] hover:scale-[1.02]">
                      <p className="text-white/60 text-xs uppercase tracking-wider mb-2">Achieved</p>
                      <p className="text-3xl font-bold text-white tabular-nums">{formatAmount(goalData.achieved)}</p>
                      <p className="text-white/50 text-xs mt-1">{goalData.orders.toLocaleString()} orders</p>
                    </div>
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

        {/* Monthly Status Breakdown Table */}
        <div className="mt-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25),inset_0_0_30px_rgba(168,85,247,0.12)]">
          <div className="px-8 py-6 border-b border-white/10 bg-white/5 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white">Monthly Breakdown by Status</h2>
              <p className="text-purple-300 text-sm mt-1">Order count & revenue by status across {currentYear}</p>
            </div>
            {monthlyData && (
              <div className="flex items-center gap-6 text-sm">
                <div className="text-right">
                  <div className="text-purple-300">Total Orders</div>
                  <div className="text-white font-bold text-lg">{monthlyData.totals.grand.count.toLocaleString()}</div>
                </div>
                <div className="text-right">
                  <div className="text-purple-300">Total Order Value</div>
                  <div className="text-white font-bold text-lg">{formatAmount(monthlyData.totals.grand.amount)}</div>
                </div>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            {monthlyLoading ? (
              <div className="px-8 py-12 text-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-purple-500/30 border-t-purple-500 animate-spin"></div>
                  <p className="text-purple-300">Loading monthly data...</p>
                </div>
              </div>
            ) : !monthlyData || monthlyData.data.length === 0 ? (
              <div className="px-8 py-12 text-center text-purple-300">No monthly data available</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10">
                    <th rowSpan={2} className="px-4 py-3 text-left text-xs font-semibold text-purple-200 sticky left-0 bg-slate-900/80 backdrop-blur z-10 border-r border-white/10 min-w-[160px]">
                      Status
                    </th>
                    {MONTH_NAMES.map((m) => (
                      <th key={m} colSpan={2} className="px-2 py-2 text-center text-xs font-semibold text-purple-200 border-r border-white/10">
                        {m}
                      </th>
                    ))}
                    <th colSpan={2} className="px-2 py-2 text-center text-xs font-bold text-purple-100 bg-purple-500/20">
                      Total
                    </th>
                  </tr>
                  <tr className="bg-white/5 border-b border-white/10">
                    {[...Array(13)].map((_, i) => (
                      <Fragment key={i}>
                        <th className={`px-2 py-2 text-right text-[10px] font-medium ${i === 12 ? 'text-purple-100 bg-purple-500/20' : 'text-purple-300'}`}>
                          Count
                        </th>
                        <th className={`px-2 py-2 text-right text-[10px] font-medium border-r border-white/10 ${i === 12 ? 'text-purple-100 bg-purple-500/20' : 'text-purple-300'}`}>
                          Amount
                        </th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthlyData.data.map((row) => (
                    <tr key={row.status} className="border-b border-white/5 hover:bg-white/10 transition-colors group">
                      <td className="px-4 py-3 sticky left-0 bg-slate-900/80 backdrop-blur z-10 border-r border-white/10 group-hover:bg-slate-800/90 text-white text-sm font-medium">
                        {row.status}
                      </td>
                      {MONTH_NAMES.map((_, idx) => {
                        const month = idx + 1;
                        const cell = row.months[month];
                        const hasData = cell && cell.count > 0;
                        return (
                          <Fragment key={month}>
                            <td
                              onClick={hasData ? () => openDrill(row.status, month) : undefined}
                              className={`px-2 py-3 text-right tabular-nums transition-all duration-200 ${hasData ? 'text-white cursor-pointer hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:text-white hover:font-bold hover:shadow-[inset_0_0_20px_rgba(217,70,239,0.6),0_0_18px_rgba(168,85,247,0.55)] hover:scale-110 transform-gpu relative' : 'text-white/30'}`}
                            >
                              {hasData ? cell.count.toLocaleString() : '—'}
                            </td>
                            <td
                              onClick={hasData ? () => openDrill(row.status, month) : undefined}
                              className={`px-2 py-3 text-right tabular-nums border-r border-white/10 transition-all duration-200 ${hasData ? 'text-purple-200 cursor-pointer hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:text-white hover:font-bold hover:shadow-[inset_0_0_20px_rgba(217,70,239,0.6),0_0_18px_rgba(168,85,247,0.55)] hover:scale-110 transform-gpu relative' : 'text-white/30'}`}
                            >
                              {hasData ? formatAmount(cell.amount) : '—'}
                            </td>
                          </Fragment>
                        );
                      })}
                      <td
                        onClick={() => openDrill(row.status, null)}
                        className="px-2 py-3 text-right tabular-nums font-bold text-white bg-purple-500/10 cursor-pointer transition-all duration-200 hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:shadow-[inset_0_0_20px_rgba(217,70,239,0.7),0_0_22px_rgba(168,85,247,0.6)] hover:scale-110 transform-gpu relative"
                      >
                        {row.total.count.toLocaleString()}
                      </td>
                      <td
                        onClick={() => openDrill(row.status, null)}
                        className="px-2 py-3 text-right tabular-nums font-bold text-purple-100 bg-purple-500/10 cursor-pointer border-r border-white/10 transition-all duration-200 hover:bg-gradient-to-br hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 hover:text-white hover:shadow-[inset_0_0_20px_rgba(217,70,239,0.7),0_0_22px_rgba(168,85,247,0.6)] hover:scale-110 transform-gpu relative"
                      >
                        {formatAmount(row.total.amount)}
                      </td>
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 border-t-2 border-purple-400/40 font-bold">
                    <td className="px-4 py-3 sticky left-0 bg-slate-900/95 backdrop-blur z-10 border-r border-white/10 text-white">
                      Total
                    </td>
                    {MONTH_NAMES.map((_, idx) => {
                      const month = idx + 1;
                      const cell = monthlyData.totals.byMonth[month];
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
                      {monthlyData.totals.grand.count.toLocaleString()}
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums text-purple-50 bg-purple-500/30 border-r border-white/10">
                      {formatAmount(monthlyData.totals.grand.amount)}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Monthly Breakdown — Status × Delivery Status (expandable pivot) */}
        <div className="mt-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25),inset_0_0_30px_rgba(168,85,247,0.12)]">
          <div className="px-8 py-6 border-b border-white/10 bg-white/5 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white">Status × Delivery Status</h2>
              <p className="text-purple-300 text-sm mt-1">Click any status to drill into its delivery sub-statuses — {currentYear}</p>
            </div>
            {pivotData && (
              <div className="flex items-center gap-6 text-sm">
                <div className="text-right">
                  <div className="text-purple-300">Total Orders</div>
                  <div className="text-white font-bold text-lg">{pivotData.totals.grand.count.toLocaleString()}</div>
                </div>
                <div className="text-right">
                  <div className="text-purple-300">Total Order Value</div>
                  <div className="text-white font-bold text-lg">{formatAmount(pivotData.totals.grand.amount)}</div>
                </div>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
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
          </div>
        </div>

        {/* Monthly Trend & Growth — Status × Month, share-of-mix with pp delta */}
        <div className="mt-8 bg-white/5 border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:bg-white/10 hover:border-fuchsia-400/50 hover:shadow-[0_0_50px_rgba(217,70,239,0.25),inset_0_0_30px_rgba(168,85,247,0.12)]">
          <div className="px-8 py-6 border-b border-white/10">
            <h2 className="text-2xl font-bold text-white">Monthly Trend & Growth</h2>
            <p className="text-white/60 text-sm mt-1">Share of monthly orders & revenue per status, with month-over-month change in percentage points — {currentYear}</p>
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

        {activeTab === 'seller' && (
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
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-white/5 border-b border-white/10">
                        <th rowSpan={2} className="px-4 py-3 text-left text-xs font-semibold text-purple-200 sticky left-0 bg-slate-900/80 backdrop-blur z-10 border-r border-white/10 min-w-[260px]">
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
                <button
                  onClick={closePivotDrill}
                  className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-medium"
                >
                  Close
                </button>
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
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Buyer Phone</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Seller Address</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Buyer Address</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(pivotDrillPaged?.rows || filteredPivotDrillRows).map((r) => (
                        <tr key={r.poNumber} className="border-b border-slate-100 hover:bg-slate-50 align-top">
                          <td className="px-4 py-3 text-slate-900 tabular-nums font-medium whitespace-nowrap">{r.poNumber}</td>
                          <td className="px-4 py-3 text-right text-slate-900 tabular-nums whitespace-nowrap">₹{r.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatDateTime(r.markedPendingTime)}</td>
                          <td className="px-4 py-3 text-slate-700 tabular-nums whitespace-nowrap">{r.sellerPhone || '—'}</td>
                          <td className="px-4 py-3 text-slate-700 tabular-nums whitespace-nowrap">{r.buyerPhone || '—'}</td>
                          <td className="px-4 py-3 text-slate-600 max-w-xs" title={r.sellerAddress || ''}>{r.sellerAddress || <span className="text-slate-400 italic">—</span>}</td>
                          <td className="px-4 py-3 text-slate-600 max-w-xs" title={r.buyerAddress || ''}>{r.buyerAddress || <span className="text-slate-400 italic">—</span>}</td>
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
                <button
                  onClick={closeSellerDrill}
                  className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-medium"
                >
                  Close
                </button>
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
                <button
                  onClick={closeDrill}
                  className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-medium"
                >
                  Close
                </button>
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
