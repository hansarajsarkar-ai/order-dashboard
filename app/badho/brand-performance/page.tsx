'use client';

import { useEffect, useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// ─── CSV utility ─────────────────────────────────────────────────────────
type CsvCell = string | number | null | undefined;
function csvEscape(v: CsvCell): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadCSV(filename: string, headers: string[], rows: CsvCell[][]) {
  const body = [headers.map(csvEscape).join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n');
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function formatAmount(amount: number): string {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)}Cr`;
  if (amount >= 100000)   return `₹${(amount / 100000).toFixed(2)}L`;
  if (amount >= 1000)     return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${Math.round(amount)}`;
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── Types ───────────────────────────────────────────────────────────────
interface Cell { count: number; amount: number; }
interface MonthStatusAgg { total: Cell; byDelivery: Record<string, Cell>; }
interface BrandRow {
  brandName: string;
  total: Cell;
  byMonth: Record<number, { total: Cell; byStatus: Record<string, MonthStatusAgg> }>;
}
interface StatusColumn {
  status: string;
  total: Cell;
  deliveryStatuses: { deliveryStatus: string | null; total: Cell }[];
}
interface PivotData {
  brands: BrandRow[];
  months: number[];
  statusColumns: StatusColumn[];
  monthTotals: Record<number, Cell>;
  monthStatusTotals: Record<string, Cell>;
  monthStatusDeliveryTotals: Record<string, Cell>;
  grand: Cell;
  year: number | null;
  startDate: string | null;
  endDate: string | null;
}

type Theme = 'light' | 'dark';

// ─── Theme-aware class tables ────────────────────────────────────────────
// Status pill tints — different palettes for light / dark backgrounds.
const STATUS_PILL_DARK: Record<string, { bg: string; text: string; border: string }> = {
  DELIVERED: { bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-400/30' },
  COMPLETED: { bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-400/30' },
  REJECTED:  { bg: 'bg-rose-500/15',    text: 'text-rose-300',    border: 'border-rose-400/30' },
  CANCELLED: { bg: 'bg-amber-500/15',   text: 'text-amber-300',   border: 'border-amber-400/30' },
  PENDING:   { bg: 'bg-sky-500/15',     text: 'text-sky-300',     border: 'border-sky-400/30' },
  ACCEPTED:  { bg: 'bg-violet-500/15',  text: 'text-violet-300',  border: 'border-violet-400/30' },
  INVOICED:  { bg: 'bg-fuchsia-500/15', text: 'text-fuchsia-300', border: 'border-fuchsia-400/30' },
};
const STATUS_PILL_LIGHT: Record<string, { bg: string; text: string; border: string }> = {
  DELIVERED: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' },
  COMPLETED: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' },
  REJECTED:  { bg: 'bg-rose-100',    text: 'text-rose-700',    border: 'border-rose-200' },
  CANCELLED: { bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-200' },
  PENDING:   { bg: 'bg-sky-100',     text: 'text-sky-700',     border: 'border-sky-200' },
  ACCEPTED:  { bg: 'bg-violet-100',  text: 'text-violet-700',  border: 'border-violet-200' },
  INVOICED:  { bg: 'bg-fuchsia-100', text: 'text-fuchsia-700', border: 'border-fuchsia-200' },
};
const DEFAULT_PILL_DARK = { bg: 'bg-white/10', text: 'text-white', border: 'border-white/15' };
const DEFAULT_PILL_LIGHT = { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' };

function buildTheme(theme: Theme) {
  const isDark = theme === 'dark';
  const pill = (s: string) => {
    const table = isDark ? STATUS_PILL_DARK : STATUS_PILL_LIGHT;
    return table[s] || (isDark ? DEFAULT_PILL_DARK : DEFAULT_PILL_LIGHT);
  };
  return {
    isDark,
    // Page chrome
    page: isDark
      ? 'bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950'
      : 'bg-slate-50',
    showBlobs: isDark,
    showGrid: isDark,
    // Top bar
    backLink: isDark
      ? 'text-xs font-semibold text-purple-200 hover:text-white px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors'
      : 'text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 transition-colors shadow-sm',
    userChip: isDark
      ? 'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm'
      : 'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm shadow-sm',
    userName: isDark ? 'text-purple-100 font-medium' : 'text-slate-700 font-medium',
    logoutBtn: isDark
      ? 'px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-rose-200 text-sm font-medium disabled:opacity-50 transition-colors'
      : 'px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-sm font-medium disabled:opacity-50 transition-colors',
    // Title
    titleBar: isDark
      ? 'w-1.5 h-9 rounded-full bg-gradient-to-b from-fuchsia-400 via-purple-500 to-indigo-500 shadow-[0_0_24px_rgba(217,70,239,0.6)]'
      : 'w-1.5 h-9 rounded-full bg-gradient-to-b from-purple-500 to-indigo-500',
    titleText: isDark
      ? 'text-3xl md:text-4xl font-bold bg-gradient-to-r from-fuchsia-400 via-purple-300 to-indigo-300 bg-clip-text text-transparent'
      : 'text-3xl md:text-4xl font-bold text-slate-900',
    subtitle: isDark ? 'text-purple-300/70 text-sm ml-4' : 'text-slate-500 text-sm ml-4',
    // KPI tile
    kpiCard: isDark
      ? 'relative rounded-2xl p-6 border border-white/10 backdrop-blur-xl overflow-hidden transition-all duration-300 hover:border-white/30 hover:shadow-[0_0_40px_rgba(217,70,239,0.18)] hover:-translate-y-0.5'
      : 'relative rounded-2xl p-6 bg-white border border-slate-200 shadow-sm overflow-hidden transition-all duration-300 hover:shadow-md hover:-translate-y-0.5',
    kpiLabel: isDark
      ? 'text-[11px] uppercase tracking-[0.18em] text-purple-200/70 font-semibold'
      : 'text-[11px] uppercase tracking-[0.18em] text-slate-500 font-semibold',
    kpiValue: isDark
      ? 'text-5xl font-black text-white tabular-nums tracking-tight leading-none mt-3 truncate'
      : 'text-5xl font-black text-slate-900 tabular-nums tracking-tight leading-none mt-3 truncate',
    kpiSub: isDark
      ? 'text-[11px] text-purple-200/70 mt-1 truncate'
      : 'text-[11px] text-slate-500 mt-1 truncate',
    // KPI tints per tile (4 variants)
    kpiTint: isDark
      ? ['bg-gradient-to-br from-fuchsia-500/25 to-purple-500/10', 'bg-gradient-to-br from-sky-500/25 to-blue-500/10', 'bg-gradient-to-br from-emerald-500/25 to-teal-500/10', 'bg-gradient-to-br from-amber-500/25 to-orange-500/10']
      : ['', '', '', ''],
    kpiIconBar: isDark
      ? ['from-fuchsia-400 to-purple-500', 'from-sky-400 to-blue-500', 'from-emerald-400 to-teal-500', 'from-amber-400 to-orange-500']
      : ['from-fuchsia-500 to-purple-600', 'from-sky-500 to-blue-600', 'from-emerald-500 to-teal-600', 'from-amber-500 to-orange-600'],
    // Sub-tab pill switcher
    tabWrap: isDark
      ? 'inline-flex gap-1 p-1 bg-slate-900/70 backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_4px_24px_-8px_rgba(0,0,0,0.6)]'
      : 'inline-flex gap-1 p-1 bg-white border border-slate-200 rounded-xl shadow-sm',
    tabActive: isDark
      ? 'bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 text-white shadow-[0_0_28px_rgba(217,70,239,0.6),inset_0_1px_0_rgba(255,255,255,0.3)]'
      : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-sm',
    tabInactive: isDark
      ? 'text-purple-200 hover:bg-white/10 hover:text-white'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    // Section card
    sectionCard: isDark
      ? 'relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden transition-all duration-300 hover:border-fuchsia-400/40 hover:shadow-[0_0_60px_rgba(217,70,239,0.18)]'
      : 'relative bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm transition-all duration-300 hover:shadow-md',
    sectionAccent: isDark
      ? 'absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-400/80 to-transparent'
      : 'absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-purple-500 via-fuchsia-500 to-indigo-500',
    sectionHeader: isDark
      ? 'px-8 py-6 border-b border-white/10 bg-white/5 flex items-center justify-between flex-wrap gap-4'
      : 'px-8 py-6 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-wrap gap-4',
    sectionTag: (kind: 'pivot' | 'details') => isDark
      ? (kind === 'pivot'
          ? 'text-[10px] font-bold uppercase tracking-[0.2em] text-fuchsia-300/80 bg-fuchsia-500/15 border border-fuchsia-400/30 rounded-md px-2 py-0.5'
          : 'text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300/80 bg-sky-500/15 border border-sky-400/30 rounded-md px-2 py-0.5')
      : (kind === 'pivot'
          ? 'text-[10px] font-bold uppercase tracking-[0.2em] text-purple-700 bg-purple-100 border border-purple-200 rounded-md px-2 py-0.5'
          : 'text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700 bg-sky-100 border border-sky-200 rounded-md px-2 py-0.5'),
    h2: isDark ? 'text-2xl font-bold text-white' : 'text-2xl font-bold text-slate-900',
    p: isDark ? 'text-purple-300/80 text-sm mt-2' : 'text-slate-500 text-sm mt-2',
    monoAccent: isDark ? 'font-mono text-fuchsia-300' : 'font-mono text-purple-700',
    // Date chip row
    chipRow: isDark
      ? 'px-8 py-3 border-b border-white/10 bg-white/5 flex items-center gap-3 flex-wrap'
      : 'px-8 py-3 border-b border-slate-200 bg-white flex items-center gap-3 flex-wrap',
    chipLabel: isDark
      ? 'text-xs font-semibold text-purple-300 uppercase tracking-wide'
      : 'text-xs font-semibold text-slate-500 uppercase tracking-wide',
    chipActive: isDark
      ? 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white shadow-[0_0_18px_rgba(217,70,239,0.4)]'
      : 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 text-white shadow-sm',
    chipInactive: isDark
      ? 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 text-purple-200 hover:bg-white/15 border border-white/10'
      : 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-600 hover:bg-slate-100 border border-slate-200',
    dateInput: isDark
      ? 'px-2 py-1 text-xs bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-400'
      : 'px-2 py-1 text-xs bg-white border border-slate-300 rounded text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-400',
    dateLabel: isDark ? 'text-purple-300 text-xs' : 'text-slate-500 text-xs',
    searchInput: isDark
      ? 'ml-auto px-3 py-1.5 text-xs bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-400 min-w-[220px]'
      : 'ml-auto px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-400 min-w-[220px]',
    // CSV download button
    csvBtn: isDark
      ? 'group px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 text-white shadow-[0_4px_18px_-4px_rgba(217,70,239,0.5),inset_0_1px_0_rgba(255,255,255,0.25)] hover:shadow-[0_6px_28px_-4px_rgba(217,70,239,0.7),inset_0_1px_0_rgba(255,255,255,0.3)] transition-shadow'
      : 'group px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-purple-600 text-white shadow-sm hover:bg-purple-700 transition-colors',
    // Status legend strip (above table)
    legendStrip: isDark
      ? 'px-8 py-2 border-b border-white/10 bg-white/5 flex items-center gap-3 flex-wrap text-[11px]'
      : 'px-8 py-2 border-b border-slate-200 bg-slate-50 flex items-center gap-3 flex-wrap text-[11px]',
    legendLabel: isDark
      ? 'text-purple-300/70 uppercase tracking-wide font-semibold'
      : 'text-slate-500 uppercase tracking-wide font-semibold',
    collapseAllBtn: isDark
      ? 'ml-2 px-2 py-0.5 rounded-md text-rose-200 hover:bg-rose-500/20 border border-rose-400/30'
      : 'ml-2 px-2 py-0.5 rounded-md text-rose-700 hover:bg-rose-50 border border-rose-200',
    // Table chrome
    tableWrap: isDark ? 'overflow-auto max-h-[720px]' : 'overflow-auto max-h-[720px]',
    loading: isDark ? 'px-8 py-12 text-center text-purple-300' : 'px-8 py-12 text-center text-slate-500',
    monthHeader: isDark
      ? 'bg-slate-800 border-b border-r border-white/10 px-3 py-2.5 text-center font-bold text-white whitespace-nowrap text-sm'
      : 'bg-slate-100 border-b border-r border-slate-200 px-3 py-2.5 text-center font-bold text-slate-900 whitespace-nowrap text-sm',
    monthHeaderSub: isDark
      ? 'ml-2 text-[11px] text-purple-200/70 font-semibold tabular-nums'
      : 'ml-2 text-[11px] text-slate-500 font-semibold tabular-nums',
    headerRow: isDark
      ? 'bg-slate-900 border-b border-r border-white/10 px-3 py-2 text-center cursor-pointer hover:bg-white/10 select-none whitespace-nowrap'
      : 'bg-white border-b border-r border-slate-200 px-3 py-2 text-center cursor-pointer hover:bg-slate-50 select-none whitespace-nowrap',
    deliveryHeader: isDark
      ? 'border-b border-r border-white/10 px-3 py-1.5 text-[10px] text-purple-300/60 font-medium tracking-wide whitespace-nowrap'
      : 'border-b border-r border-slate-200 px-3 py-1.5 text-[10px] text-slate-500 font-medium tracking-wide whitespace-nowrap',
    brandCell: isDark
      ? 'sticky left-0 z-10 bg-slate-900 border-b border-r border-white/10 px-4 py-3 whitespace-nowrap'
      : 'sticky left-0 z-10 bg-white border-b border-r border-slate-200 px-4 py-3 whitespace-nowrap',
    brandRowNum: isDark
      ? 'text-[10px] text-purple-400/60 tabular-nums font-bold w-5 text-right'
      : 'text-[10px] text-slate-400 tabular-nums font-bold w-5 text-right',
    brandAccent: isDark
      ? 'block w-0.5 h-5 rounded-full bg-gradient-to-b from-fuchsia-400/60 to-purple-500/40'
      : 'block w-0.5 h-5 rounded-full bg-gradient-to-b from-purple-500 to-indigo-500',
    brandName: isDark
      ? 'text-white font-bold text-sm tracking-tight'
      : 'text-slate-900 font-bold text-sm tracking-tight',
    dataCell: isDark
      ? 'border-b border-r border-white/10 px-3 py-3 text-right whitespace-nowrap'
      : 'border-b border-r border-slate-200 px-3 py-3 text-right whitespace-nowrap',
    emptyCell: isDark
      ? 'border-b border-r border-white/10 px-3 py-3 text-right text-purple-400/40 text-base tabular-nums'
      : 'border-b border-r border-slate-200 px-3 py-3 text-right text-slate-300 text-base tabular-nums',
    cellCount: isDark
      ? 'text-base font-extrabold tabular-nums leading-tight text-white'
      : 'text-base font-extrabold tabular-nums leading-tight text-slate-900',
    cellAmount: isDark
      ? 'text-xs font-semibold tabular-nums mt-0.5 text-purple-300/80'
      : 'text-xs font-semibold tabular-nums mt-0.5 text-slate-500',
    rowEven: isDark ? 'bg-white/[0.02]' : 'bg-slate-50/60',
    rowOdd: isDark ? 'bg-transparent' : 'bg-white',
    rowHover: isDark ? 'hover:bg-white/10 transition-colors' : 'hover:bg-slate-100 transition-colors',
    // Total column (sticky right)
    totalHeader: isDark
      ? 'sticky right-0 z-30 bg-fuchsia-950 border-b border-l-2 border-fuchsia-400/70 px-4 py-3 text-right font-bold text-fuchsia-100 uppercase tracking-wider min-w-[130px] shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.6)]'
      : 'sticky right-0 z-30 bg-purple-600 border-b border-l-2 border-purple-700 px-4 py-3 text-right font-bold text-white uppercase tracking-wider min-w-[130px] shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.15)]',
    totalBody: isDark
      ? 'sticky right-0 z-10 bg-fuchsia-950 border-b border-l-2 border-fuchsia-400/70 px-4 py-3 text-right whitespace-nowrap shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.6)]'
      : 'sticky right-0 z-10 bg-purple-50 border-b border-l-2 border-purple-200 px-4 py-3 text-right whitespace-nowrap',
    totalBodyCount: isDark
      ? 'text-base font-extrabold tabular-nums leading-tight text-white'
      : 'text-base font-extrabold tabular-nums leading-tight text-purple-900',
    totalBodyAmount: isDark
      ? 'text-xs font-semibold tabular-nums mt-0.5 text-fuchsia-200'
      : 'text-xs font-semibold tabular-nums mt-0.5 text-purple-700',
    totalFoot: isDark
      ? 'sticky right-0 z-30 bg-gradient-to-r from-fuchsia-950 to-purple-950 border-t border-l-2 border-fuchsia-400/70 px-4 py-3 text-right whitespace-nowrap shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.6)]'
      : 'sticky right-0 z-30 bg-purple-700 border-t border-l-2 border-purple-800 px-4 py-3 text-right whitespace-nowrap',
    totalFootCount: isDark
      ? 'text-lg font-extrabold tabular-nums leading-tight text-white'
      : 'text-lg font-extrabold tabular-nums leading-tight text-white',
    totalFootAmount: isDark
      ? 'text-sm font-semibold tabular-nums mt-0.5 text-fuchsia-100'
      : 'text-sm font-semibold tabular-nums mt-0.5 text-purple-100',
    // Footer chrome
    footRow: isDark
      ? 'sticky bottom-0 z-20 bg-slate-900/95 backdrop-blur'
      : 'sticky bottom-0 z-20 bg-slate-100/95 backdrop-blur',
    footLabel: isDark
      ? 'sticky left-0 z-30 bg-slate-900 border-t border-r border-white/10 px-3 py-3 font-bold text-purple-200 uppercase tracking-wider text-[11px]'
      : 'sticky left-0 z-30 bg-slate-100 border-t border-r border-slate-200 px-3 py-3 font-bold text-slate-700 uppercase tracking-wider text-[11px]',
    footnote: isDark
      ? 'px-8 py-2 border-t border-white/10 bg-white/5 text-right text-xs text-purple-300/70'
      : 'px-8 py-2 border-t border-slate-200 bg-slate-50 text-right text-xs text-slate-500',
    // Theme toggle button
    themeToggle: isDark
      ? 'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-purple-100 hover:bg-white/10 transition-colors text-sm font-medium'
      : 'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors text-sm font-medium shadow-sm',
    pillBgFor: (s: string) => `${pill(s).bg} ${pill(s).text} ${pill(s).border}`,
    pillTextFor: (s: string) => pill(s).text,
  };
}

export default function BrandPerformanceDashboard() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [employeeName, setEmployeeName] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('authToken');
    if (!token) { router.replace('/login'); return; }
    setEmployeeName(localStorage.getItem('employeeName') || '');
    const stored = (localStorage.getItem('bpTheme') as Theme | null);
    if (stored === 'light' || stored === 'dark') setTheme(stored);
    setAuthChecked(true);
  }, [router]);

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('bpTheme', theme);
  }, [theme]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    localStorage.removeItem('authToken');
    localStorage.removeItem('employeeId');
    localStorage.removeItem('employeeName');
    localStorage.removeItem('employeeEmail');
    router.replace('/login');
  };

  const t = buildTheme(theme);

  const currentYear = new Date().getFullYear();
  const [pivotData, setPivotData] = useState<PivotData | null>(null);
  const [pivotLoading, setPivotLoading] = useState(false);
  const [range, setRange] = useState<'year' | '30d' | '7d' | 'today' | 'custom'>('year');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [expandedStatuses, setExpandedStatuses] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [bpTab, setBpTab] = useState<'dashboard' | 'details'>('dashboard');
  const [detailsSearch, setDetailsSearch] = useState('');
  const [detailsSort, setDetailsSort] = useState<'orders' | 'gmv' | 'brand' | 'month' | 'status'>('orders');

  // Monthly Breakdown by Order Status (status × month × deliveryStatus, with optional brand filter + buyers)
  interface MbsCell { count: number; amount: number; buyers: number; }
  interface MbsDelivery { deliveryStatus: string | null; months: Record<number, MbsCell>; total: MbsCell; }
  interface MbsStatusRow { status: string; months: Record<number, MbsCell>; total: MbsCell; deliveryStatuses: MbsDelivery[]; }
  interface MbsData {
    data: MbsStatusRow[];
    months: number[];
    totals: { byMonth: Record<number, MbsCell>; grand: MbsCell };
    brand: string | null;
  }
  const [mbsData, setMbsData] = useState<MbsData | null>(null);
  const [mbsLoading, setMbsLoading] = useState(false);
  const [mbsBrand, setMbsBrand] = useState<string>('');           // '' = all brands
  const [mbsBrandSearch, setMbsBrandSearch] = useState('');
  const [mbsBrandDropdownOpen, setMbsBrandDropdownOpen] = useState(false);
  const [mbsExpanded, setMbsExpanded] = useState<Set<string>>(new Set());

  const resolveRange = (): { startDate: string | null; endDate: string | null } => {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    if (range === 'today') return { startDate: fmt(today), endDate: fmt(today) };
    if (range === '7d') { const s = new Date(today); s.setDate(s.getDate() - 6); return { startDate: fmt(s), endDate: fmt(today) }; }
    if (range === '30d') { const s = new Date(today); s.setDate(s.getDate() - 29); return { startDate: fmt(s), endDate: fmt(today) }; }
    if (range === 'custom') return { startDate: customFrom || null, endDate: customTo || null };
    return { startDate: null, endDate: null };
  };

  const fetchPivot = async () => {
    try {
      setPivotLoading(true);
      const params = new URLSearchParams({ year: String(currentYear) });
      const { startDate, endDate } = resolveRange();
      if (startDate) params.append('startDate', startDate);
      if (endDate)   params.append('endDate',   endDate);
      const res = await fetch(`/api/brand-performance/status-pivot?${params.toString()}`);
      if (!res.ok) throw new Error('failed');
      const json = await res.json();
      setPivotData(json);
    } catch (err) {
      console.error('Brand pivot fetch error:', err);
      setPivotData(null);
    } finally {
      setPivotLoading(false);
    }
  };

  useEffect(() => {
    if (!authChecked) return;
    fetchPivot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, range, customFrom, customTo]);

  const fetchMbs = async () => {
    try {
      setMbsLoading(true);
      const params = new URLSearchParams({ year: String(currentYear) });
      const { startDate, endDate } = resolveRange();
      if (startDate) params.append('startDate', startDate);
      if (endDate)   params.append('endDate',   endDate);
      if (mbsBrand)  params.append('brand',     mbsBrand);
      const res = await fetch(`/api/brand-performance/monthly-by-status?${params.toString()}`);
      if (!res.ok) throw new Error('failed');
      const json = await res.json();
      setMbsData(json);
    } catch (err) {
      console.error('MBS fetch error:', err);
      setMbsData(null);
    } finally {
      setMbsLoading(false);
    }
  };

  useEffect(() => {
    if (!authChecked || bpTab !== 'dashboard') return;
    fetchMbs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, bpTab, range, customFrom, customTo, mbsBrand]);

  const toggleStatus = (s: string) => {
    setExpandedStatuses((prev) => { const n = new Set(prev); if (n.has(s)) n.delete(s); else n.add(s); return n; });
  };
  const toggleMbsStatus = (s: string) => {
    setMbsExpanded((prev) => { const n = new Set(prev); if (n.has(s)) n.delete(s); else n.add(s); return n; });
  };

  if (!authChecked) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${theme === 'dark' ? 'bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900' : 'bg-slate-50'}`}>
        <div className={theme === 'dark' ? 'text-purple-200 text-sm' : 'text-slate-500 text-sm'}>Checking access…</div>
      </div>
    );
  }

  const visibleBrands = (() => {
    if (!pivotData) return [];
    const q = search.trim().toLowerCase();
    if (!q) return pivotData.brands;
    return pivotData.brands.filter((b) => b.brandName.toLowerCase().includes(q));
  })();

  const subColsFor = (sc: StatusColumn) => expandedStatuses.has(sc.status) ? sc.deliveryStatuses.length : 1;
  const subColsPerMonth = (statusColumns: StatusColumn[]) =>
    statusColumns.reduce((s, sc) => s + subColsFor(sc), 0);

  const brandMonthStatusCell = (br: BrandRow, month: number, status: string): Cell | null => {
    const m = br.byMonth[month]; if (!m) return null;
    const s = m.byStatus[status]; if (!s) return null;
    return s.total;
  };
  const brandMonthStatusDeliveryCell = (br: BrandRow, month: number, status: string, deliveryKey: string): Cell | null => {
    const m = br.byMonth[month]; if (!m) return null;
    const s = m.byStatus[status]; if (!s) return null;
    return s.byDelivery[deliveryKey] ?? null;
  };

  return (
    <div className={`min-h-screen ${t.page} p-8 relative overflow-hidden`}>
      {t.showBlobs && (
        <>
          <div className="absolute top-0 left-1/4 w-[28rem] h-[28rem] bg-fuchsia-500 rounded-full mix-blend-screen filter blur-[120px] opacity-[0.12] animate-pulse" />
          <div className="absolute bottom-0 right-1/4 w-[28rem] h-[28rem] bg-indigo-500 rounded-full mix-blend-screen filter blur-[120px] opacity-[0.12] animate-pulse animation-delay-2000" />
          <div className="absolute top-1/3 right-0 w-72 h-72 bg-purple-500 rounded-full mix-blend-screen filter blur-[100px] opacity-[0.08]" />
        </>
      )}
      {t.showGrid && (
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.025]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
      )}

      <div className="w-[95%] mx-auto relative z-10">
        {/* Top bar */}
        <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
          <Link href="/badho" className={t.backLink}>
            ← All dashboards
          </Link>
          <div className="flex items-center gap-3">
            {/* Theme toggle */}
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className={t.themeToggle}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>
                  <span>Light</span>
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                  <span>Dark</span>
                </>
              )}
            </button>
            {employeeName && (
              <div className={t.userChip}>
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                  {employeeName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <span className={t.userName}>{employeeName}</span>
              </div>
            )}
            <button onClick={handleLogout} disabled={isLoggingOut} className={t.logoutBtn}>
              {isLoggingOut ? 'Signing out…' : 'Logout'}
            </button>
          </div>
        </div>

        {/* Title */}
        <div className="mb-5 relative">
          <div className="flex items-center gap-3 mb-1">
            <div className={t.titleBar} />
            <h1 className={t.titleText}>Brand Performance</h1>
          </div>
          <p className={t.subtitle}>How every brand stacks up — orders, GMV, and delivery quality across months.</p>
        </div>

        {/* Sub-tab — sits directly beneath the title */}
        <div className={`mb-6 ${t.tabWrap}`}>
          {([
            { key: 'dashboard', label: 'Dashboard', icon: '▤' },
            { key: 'details',   label: 'Pivot',     icon: '▥' },
          ] as const).map((tab) => {
            const active = bpTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setBpTab(tab.key)}
                className={`relative px-5 py-2 rounded-lg text-sm font-bold transition-all duration-300 inline-flex items-center gap-2 ${active ? t.tabActive : t.tabInactive}`}
              >
                <span className={`text-base leading-none ${active ? 'opacity-90' : 'opacity-60'}`}>{tab.icon}</span>
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* KPI strip — Dashboard tab only */}
        {bpTab === 'dashboard' && pivotData && (() => {
          const find = (s: string) => pivotData.statusColumns.find((sc) => sc.status === s);
          const delCol = find('DELIVERED');
          const compCol = find('COMPLETED');
          const rejCol = find('REJECTED');
          const canCol = find('CANCELLED');

          const totalCount  = pivotData.grand.count;
          const totalAmount = pivotData.grand.amount;
          const delCount    = (delCol?.total.count  ?? 0) + (compCol?.total.count  ?? 0);
          const delAmount   = (delCol?.total.amount ?? 0) + (compCol?.total.amount ?? 0);
          const rejCount    = rejCol?.total.count   ?? 0;
          const rejAmount   = rejCol?.total.amount  ?? 0;
          const canCount    = canCol?.total.count   ?? 0;
          const canAmount   = canCol?.total.amount  ?? 0;

          const pct = (n: number) => totalCount > 0 ? ((n / totalCount) * 100).toFixed(1) : '0.0';

          interface TileCls { bg: string; border: string; label: string; count: string; amount: string; caption: string; chip: string; }
          interface Tile {
            label: string;
            count: number;
            amount: number;
            pctLabel: string | null;
            cls: TileCls;
          }
          const tiles: Tile[] = [
            {
              label: 'Total orders',
              count: totalCount, amount: totalAmount, pctLabel: null,
              cls: t.isDark
                ? { bg: 'bg-gradient-to-br from-purple-600/35 via-purple-700/25 to-indigo-700/20', border: 'border-purple-400/40', label: 'text-purple-200',  count: 'text-white',       amount: 'text-purple-50',    caption: 'text-purple-300/70',  chip: '' }
                : { bg: 'bg-gradient-to-br from-purple-100 to-indigo-100',                          border: 'border-purple-300',   label: 'text-purple-700',  count: 'text-purple-900',  amount: 'text-purple-800',   caption: 'text-purple-600',     chip: '' },
            },
            {
              label: 'Delivered + Completed',
              count: delCount, amount: delAmount, pctLabel: `${pct(delCount)}% of total`,
              cls: t.isDark
                ? { bg: 'bg-gradient-to-br from-emerald-500/35 via-emerald-600/25 to-teal-700/20',  border: 'border-emerald-400/40', label: 'text-emerald-200', count: 'text-white',        amount: 'text-emerald-50',   caption: 'text-emerald-300/70', chip: 'bg-emerald-500/25 text-emerald-100 border-emerald-400/50' }
                : { bg: 'bg-gradient-to-br from-emerald-100 to-teal-100',                          border: 'border-emerald-300',    label: 'text-emerald-700', count: 'text-emerald-900',  amount: 'text-emerald-800',  caption: 'text-emerald-600',    chip: 'bg-emerald-200 text-emerald-800 border-emerald-300' },
            },
            {
              label: 'Rejected',
              count: rejCount, amount: rejAmount, pctLabel: `${pct(rejCount)}% of total`,
              cls: t.isDark
                ? { bg: 'bg-gradient-to-br from-rose-500/35 via-rose-600/25 to-red-700/20',         border: 'border-rose-400/40',    label: 'text-rose-200',    count: 'text-white',        amount: 'text-rose-50',      caption: 'text-rose-300/70',    chip: 'bg-rose-500/25 text-rose-100 border-rose-400/50' }
                : { bg: 'bg-gradient-to-br from-rose-100 to-red-100',                              border: 'border-rose-300',       label: 'text-rose-700',    count: 'text-rose-900',     amount: 'text-rose-800',     caption: 'text-rose-600',       chip: 'bg-rose-200 text-rose-800 border-rose-300' },
            },
            {
              label: 'Cancelled',
              count: canCount, amount: canAmount, pctLabel: `${pct(canCount)}% of total`,
              cls: t.isDark
                ? { bg: 'bg-gradient-to-br from-amber-500/35 via-amber-600/25 to-orange-700/20',   border: 'border-amber-400/40',   label: 'text-amber-200',   count: 'text-white',        amount: 'text-amber-50',     caption: 'text-amber-300/70',   chip: 'bg-amber-500/25 text-amber-100 border-amber-400/50' }
                : { bg: 'bg-gradient-to-br from-amber-100 to-orange-100',                          border: 'border-amber-300',      label: 'text-amber-700',   count: 'text-amber-900',    amount: 'text-amber-800',    caption: 'text-amber-600',      chip: 'bg-amber-200 text-amber-800 border-amber-300' },
            },
          ];
          return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {tiles.map((tile, idx) => (
                <div
                  key={idx}
                  className={`relative rounded-2xl p-6 border overflow-hidden transition-all duration-300 hover:-translate-y-0.5 ${tile.cls.bg} ${tile.cls.border} ${t.isDark ? 'backdrop-blur-xl hover:shadow-[0_0_40px_rgba(217,70,239,0.18)]' : 'shadow-sm hover:shadow-md'}`}
                >
                  {t.isDark && <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] via-transparent to-transparent pointer-events-none" />}
                  <div className="relative">
                    <div className="flex items-start justify-between gap-2">
                      <div className={`text-[11px] uppercase tracking-[0.18em] font-bold ${tile.cls.label}`}>{tile.label}</div>
                      {tile.pctLabel && (
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${tile.cls.chip} whitespace-nowrap`}>
                          {tile.pctLabel}
                        </span>
                      )}
                    </div>
                    <div className={`text-5xl font-black tabular-nums tracking-tight leading-none mt-3 truncate ${tile.cls.count}`} title={String(tile.count)}>
                      {tile.count.toLocaleString('en-IN')}
                    </div>
                    <div className={`text-3xl font-black tabular-nums tracking-tight leading-none mt-2 ${tile.cls.amount}`}>
                      {formatAmount(tile.amount)}
                    </div>
                    <div className={`text-[10px] uppercase tracking-[0.18em] mt-3 font-bold ${tile.cls.caption}`}>
                      orders · value
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Monthly Breakdown by Order Status — Dashboard tab only */}
        {bpTab === 'dashboard' && (
        <div className={`${t.sectionCard} mb-6`}>
          <div className={t.sectionAccent} />
          <div className={t.sectionHeader}>
            <div>
              <h2 className={t.h2}>Monthly Breakdown by Order Status</h2>
              <p className={t.p}>
                Rows = status (click to drill into delivery sub-status). Each cell shows orders · ₹value · unique buyers.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Brand picker */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMbsBrandDropdownOpen((v) => !v)}
                  className={`min-w-[220px] px-3 py-1.5 text-xs rounded-lg text-left flex items-center justify-between gap-2 ${t.isDark ? 'bg-white/10 border border-white/20 text-white hover:bg-white/15' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'} focus:outline-none focus:ring-2 focus:ring-purple-400`}
                >
                  <span className="truncate font-semibold">
                    {mbsBrand || <span className={t.isDark ? 'text-purple-300/70' : 'text-slate-400'}>All brands</span>}
                  </span>
                  <span className={t.isDark ? 'text-purple-300 text-[10px]' : 'text-slate-400 text-[10px]'}>▾</span>
                </button>
                {mbsBrandDropdownOpen && (
                  <>
                    {/* Backdrop closes on outside click */}
                    <div className="fixed inset-0 z-[55]" onClick={() => setMbsBrandDropdownOpen(false)} />
                    <div className={`absolute top-full right-0 mt-1 z-[60] w-[320px] max-h-[380px] rounded-lg shadow-2xl flex flex-col overflow-hidden ${t.isDark ? 'bg-slate-950 border border-white/15' : 'bg-white border border-slate-200'}`}>
                      <div className={`p-2 border-b ${t.isDark ? 'bg-slate-950 border-white/10' : 'bg-white border-slate-200'}`}>
                        <input
                          type="text"
                          autoFocus
                          value={mbsBrandSearch}
                          onChange={(e) => setMbsBrandSearch(e.target.value)}
                          placeholder="Search brand…"
                          className={t.searchInput.replace('ml-auto', '').replace('min-w-[220px]', 'w-full')}
                        />
                      </div>
                      <div className={`overflow-y-auto flex-1 ${t.isDark ? 'bg-slate-950' : 'bg-white'}`}>
                        <button
                          type="button"
                          onClick={() => { setMbsBrand(''); setMbsBrandDropdownOpen(false); setMbsBrandSearch(''); }}
                          className={`w-full text-left px-3 py-2 text-xs border-b ${t.isDark ? 'bg-slate-950 border-white/5 hover:bg-white/10' : 'bg-white border-slate-100 hover:bg-slate-100'} ${!mbsBrand ? (t.isDark ? 'bg-fuchsia-500/20 text-fuchsia-200' : 'bg-purple-50 text-purple-700') : (t.isDark ? 'text-purple-200' : 'text-slate-700')}`}
                        >
                          All brands (no filter)
                        </button>
                        {(() => {
                          const allBrands = pivotData?.brands?.map((b) => b.brandName) ?? [];
                          const q = mbsBrandSearch.trim().toLowerCase();
                          const filtered = q ? allBrands.filter((n) => n.toLowerCase().includes(q)) : allBrands;
                          if (filtered.length === 0) {
                            return <div className={`px-3 py-4 text-xs ${t.isDark ? 'bg-slate-950 text-purple-300/60' : 'bg-white text-slate-400'}`}>No matches</div>;
                          }
                          return filtered.map((name) => {
                            const active = name === mbsBrand;
                            return (
                              <button
                                key={name}
                                type="button"
                                onClick={() => { setMbsBrand(name); setMbsBrandDropdownOpen(false); setMbsBrandSearch(''); }}
                                className={`w-full text-left px-3 py-2 text-xs border-b ${t.isDark ? 'bg-slate-950 border-white/5 hover:bg-white/10' : 'bg-white border-slate-100 hover:bg-slate-100'} ${active ? (t.isDark ? 'bg-fuchsia-500/20 text-fuchsia-200 font-semibold' : 'bg-purple-50 text-purple-700 font-semibold') : (t.isDark ? 'text-white' : 'text-slate-800')}`}
                              >
                                {name}
                              </button>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </>
                )}
              </div>
              {mbsBrand && (
                <button
                  onClick={() => setMbsBrand('')}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold ${t.isDark ? 'bg-rose-500/15 text-rose-200 border border-rose-400/30 hover:bg-rose-500/25' : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'}`}
                  title="Clear brand filter"
                >
                  ✕ Clear
                </button>
              )}
              {mbsData && (
                <button
                  className={t.csvBtn}
                  onClick={() => {
                    if (!mbsData) return;
                    const headers = ['Status', 'Delivery Status', 'Month', 'Orders', 'GMV', 'Distinct Buyers'];
                    const rows: CsvCell[][] = [];
                    for (const row of mbsData.data) {
                      for (const ds of row.deliveryStatuses) {
                        for (const m of mbsData.months) {
                          const c = ds.months[m];
                          if (!c || c.count === 0) continue;
                          rows.push([row.status, ds.deliveryStatus ?? '(none)', MONTH_NAMES[m - 1] || m, c.count, c.amount, c.buyers]);
                        }
                      }
                    }
                    const suffix = mbsBrand ? `${mbsBrand.toLowerCase().replace(/\s+/g, '-')}` : 'all-brands';
                    downloadCSV(`monthly-by-status-${suffix}-${currentYear}.csv`, headers, rows);
                  }}
                >
                  ↓ CSV
                </button>
              )}
            </div>
          </div>

          <div className={t.chipRow}>
            <span className={t.chipLabel}>Date (markedPendingTime)</span>
            {([
              { key: 'year',   label: `${currentYear} (full year)` },
              { key: '30d',    label: 'Last 30 days' },
              { key: '7d',     label: 'Last 7 days' },
              { key: 'today',  label: 'Today' },
              { key: 'custom', label: 'Custom' },
            ] as const).map((opt) => {
              const active = range === opt.key;
              return (
                <button key={opt.key} onClick={() => setRange(opt.key)} className={active ? t.chipActive : t.chipInactive}>
                  {opt.label}
                </button>
              );
            })}
            {range === 'custom' && (
              <div className="flex items-center gap-2 ml-2">
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className={t.dateInput} />
                <span className={t.dateLabel}>to</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className={t.dateInput} />
              </div>
            )}
            {mbsData && (
              <span className={`ml-auto text-xs font-semibold ${t.isDark ? 'text-purple-300/70' : 'text-slate-500'}`}>
                {mbsBrand ? <>Filtered to <span className={t.isDark ? 'text-fuchsia-300' : 'text-purple-700'}>{mbsBrand}</span></> : 'All brands'}
                {' · '}
                <span className={t.isDark ? 'text-white' : 'text-slate-900'}>{mbsData.totals.grand.count.toLocaleString('en-IN')} orders</span>
                {' · '}
                <span className={t.isDark ? 'text-white' : 'text-slate-900'}>{formatAmount(mbsData.totals.grand.amount)}</span>
              </span>
            )}
          </div>

          <div className="overflow-auto max-h-[720px]">
            {mbsLoading || !mbsData ? (
              <div className={t.loading}>Loading…</div>
            ) : mbsData.data.length === 0 ? (
              <div className={t.loading}>No orders for this selection</div>
            ) : (() => {
              const months = mbsData.months;
              return (
                <table className="w-full text-sm border-separate border-spacing-0">
                  <thead className={`sticky top-0 z-20 ${t.isDark ? 'bg-slate-900/95 backdrop-blur' : 'bg-white'}`}>
                    <tr>
                      <th rowSpan={2} className={`${t.brandCell} text-left font-semibold uppercase tracking-wider min-w-[220px] ${t.isDark ? 'text-purple-200' : 'text-slate-500'}`}>
                        Status / Delivery Status
                      </th>
                      {months.map((m) => (
                        <th key={`mh_${m}`} colSpan={3} className={t.monthHeader}>
                          {MONTH_NAMES[m - 1] || m}
                        </th>
                      ))}
                      <th rowSpan={2} colSpan={3} className={t.totalHeader}>Total</th>
                    </tr>
                    <tr>
                      {months.flatMap((m) => [
                        <th key={`s_${m}_c`} className={`${t.deliveryHeader} text-right`}>Orders</th>,
                        <th key={`s_${m}_a`} className={`${t.deliveryHeader} text-right`}>₹ Value</th>,
                        <th key={`s_${m}_b`} className={`${t.deliveryHeader} text-right`}>Buyers</th>,
                      ])}
                    </tr>
                  </thead>
                  <tbody>
                    {mbsData.data.map((row, idx) => {
                      const expanded = mbsExpanded.has(row.status);
                      const subCount = row.deliveryStatuses.length;
                      return (
                        <Fragment key={row.status}>
                          <tr
                            onClick={() => toggleMbsStatus(row.status)}
                            className={`cursor-pointer ${idx % 2 === 0 ? t.rowEven : t.rowOdd} ${t.rowHover} select-none`}
                          >
                            <td className={`${t.brandCell}`}>
                              <div className="flex items-center gap-2">
                                <span className={`inline-block w-4 text-center text-[11px] ${t.isDark ? 'text-purple-300' : 'text-slate-400'}`}>{expanded ? '▾' : '▸'}</span>
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${t.pillBgFor(row.status)}`}>
                                  {row.status}
                                </span>
                                <span className={`text-[10px] ${t.isDark ? 'text-purple-300/60' : 'text-slate-400'}`}>
                                  {subCount} sub
                                </span>
                              </div>
                            </td>
                            {months.flatMap((m) => {
                              const c = row.months[m];
                              if (!c || c.count === 0) {
                                return [
                                  <td key={`r_${row.status}_${m}_c`} className={t.emptyCell}>—</td>,
                                  <td key={`r_${row.status}_${m}_a`} className={t.emptyCell}>—</td>,
                                  <td key={`r_${row.status}_${m}_b`} className={t.emptyCell}>—</td>,
                                ];
                              }
                              return [
                                <td key={`r_${row.status}_${m}_c`} className={t.dataCell}>
                                  <div className={t.cellCount}>{c.count.toLocaleString('en-IN')}</div>
                                </td>,
                                <td key={`r_${row.status}_${m}_a`} className={t.dataCell}>
                                  <div className={t.cellAmount.replace('text-xs', 'text-sm').replace('mt-0.5', '').replace('font-semibold', 'font-bold')}>
                                    {formatAmount(c.amount)}
                                  </div>
                                </td>,
                                <td key={`r_${row.status}_${m}_b`} className={t.dataCell}>
                                  <div className={`text-sm font-bold tabular-nums ${t.isDark ? 'text-sky-200' : 'text-sky-700'}`}>{c.buyers.toLocaleString('en-IN')}</div>
                                </td>,
                              ];
                            })}
                            <td className={t.totalBody} colSpan={3}>
                              <div className="flex items-baseline justify-end gap-3 whitespace-nowrap">
                                <div className={t.totalBodyCount}>{row.total.count.toLocaleString('en-IN')}</div>
                                <div className={t.totalBodyAmount}>{formatAmount(row.total.amount)}</div>
                                <div className={`text-xs font-bold tabular-nums ${t.isDark ? 'text-sky-200' : 'text-sky-700'}`}>{row.total.buyers.toLocaleString('en-IN')} buyers</div>
                              </div>
                            </td>
                          </tr>
                          {expanded && row.deliveryStatuses.map((ds, dIdx) => (
                            <tr key={`${row.status}_${ds.deliveryStatus ?? '_'}_${dIdx}`} className={`${t.isDark ? 'bg-white/[0.015]' : 'bg-slate-50/40'} ${t.rowHover}`}>
                              <td className={`${t.brandCell} pl-12 italic`}>
                                <span className={`text-[11px] font-semibold ${t.isDark ? 'text-purple-200' : 'text-slate-600'}`}>
                                  └ {ds.deliveryStatus ?? '(no delivery status)'}
                                </span>
                              </td>
                              {months.flatMap((m) => {
                                const c = ds.months[m];
                                if (!c || c.count === 0) {
                                  return [
                                    <td key={`d_${row.status}_${ds.deliveryStatus ?? '_'}_${m}_c`} className={t.emptyCell}>—</td>,
                                    <td key={`d_${row.status}_${ds.deliveryStatus ?? '_'}_${m}_a`} className={t.emptyCell}>—</td>,
                                    <td key={`d_${row.status}_${ds.deliveryStatus ?? '_'}_${m}_b`} className={t.emptyCell}>—</td>,
                                  ];
                                }
                                return [
                                  <td key={`d_${row.status}_${ds.deliveryStatus ?? '_'}_${m}_c`} className={t.dataCell}>
                                    <div className={`text-sm font-bold tabular-nums ${t.isDark ? 'text-purple-100' : 'text-slate-700'}`}>{c.count.toLocaleString('en-IN')}</div>
                                  </td>,
                                  <td key={`d_${row.status}_${ds.deliveryStatus ?? '_'}_${m}_a`} className={t.dataCell}>
                                    <div className={`text-xs font-semibold tabular-nums ${t.isDark ? 'text-purple-300/80' : 'text-slate-500'}`}>{formatAmount(c.amount)}</div>
                                  </td>,
                                  <td key={`d_${row.status}_${ds.deliveryStatus ?? '_'}_${m}_b`} className={t.dataCell}>
                                    <div className={`text-xs font-semibold tabular-nums ${t.isDark ? 'text-sky-300/80' : 'text-sky-600'}`}>{c.buyers.toLocaleString('en-IN')}</div>
                                  </td>,
                                ];
                              })}
                              <td className={t.totalBody} colSpan={3}>
                                <div className="flex items-baseline justify-end gap-3 whitespace-nowrap">
                                  <div className={`text-sm font-bold tabular-nums ${t.isDark ? 'text-purple-100' : 'text-slate-700'}`}>{ds.total.count.toLocaleString('en-IN')}</div>
                                  <div className={`text-xs font-semibold tabular-nums ${t.isDark ? 'text-purple-300/80' : 'text-slate-500'}`}>{formatAmount(ds.total.amount)}</div>
                                  <div className={`text-xs font-semibold tabular-nums ${t.isDark ? 'text-sky-300/80' : 'text-sky-600'}`}>{ds.total.buyers.toLocaleString('en-IN')}</div>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot className={t.footRow}>
                    <tr>
                      <td className={t.footLabel}>Total</td>
                      {months.flatMap((m) => {
                        const c = mbsData.totals.byMonth[m] ?? { count: 0, amount: 0, buyers: 0 };
                        return [
                          <td key={`tot_${m}_c`} className={`border-t border-r ${t.isDark ? 'border-white/10 bg-slate-900' : 'border-slate-200 bg-slate-100'} px-3 py-3 text-right`}>
                            <div className={t.cellCount}>{c.count.toLocaleString('en-IN')}</div>
                          </td>,
                          <td key={`tot_${m}_a`} className={`border-t border-r ${t.isDark ? 'border-white/10 bg-slate-900' : 'border-slate-200 bg-slate-100'} px-3 py-3 text-right`}>
                            <div className={`text-sm font-bold tabular-nums ${t.isDark ? 'text-white' : 'text-slate-900'}`}>{formatAmount(c.amount)}</div>
                          </td>,
                          <td key={`tot_${m}_b`} className={`border-t border-r ${t.isDark ? 'border-white/10 bg-slate-900' : 'border-slate-200 bg-slate-100'} px-3 py-3 text-right`}>
                            <div className={`text-sm font-bold tabular-nums ${t.isDark ? 'text-sky-200' : 'text-sky-700'}`}>{c.buyers.toLocaleString('en-IN')}</div>
                          </td>,
                        ];
                      })}
                      <td className={t.totalFoot} colSpan={3}>
                        <div className="flex items-baseline justify-end gap-3 whitespace-nowrap">
                          <div className={t.totalFootCount}>{mbsData.totals.grand.count.toLocaleString('en-IN')}</div>
                          <div className={t.totalFootAmount}>{formatAmount(mbsData.totals.grand.amount)}</div>
                          <div className={`text-sm font-bold tabular-nums ${t.isDark ? 'text-sky-100' : 'text-sky-50'}`}>{mbsData.totals.grand.buyers.toLocaleString('en-IN')} buyers</div>
                        </div>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              );
            })()}
          </div>
          <div className={t.footnote}>
            Buyer counts are distinct per cell. Row / column / grand totals are the sum of those per-cell distinct counts — buyers who shop across multiple statuses or months are counted in each bucket they appear in.
          </div>
        </div>
        )}

        {bpTab === 'details' && (
        /* Pivot section */
        <div className={t.sectionCard}>
          <div className={t.sectionAccent} />
          <div className={t.sectionHeader}>
            <div>
              <div className="flex items-center gap-2">
                <span className={t.sectionTag('pivot')}>PIVOT</span>
                <h2 className={t.h2}>Brand × Month × Status</h2>
              </div>
              <p className={t.p}>
                Rows = brand (businessName prefix; ChukDe-GT + ChukDe-NonGT merged). Top columns = month. Sub-columns = status — click any status header to reveal its delivery-status breakdown.
              </p>
            </div>
            {pivotData && (
              <button
                className={t.csvBtn}
                onClick={() => {
                  if (!pivotData) return;
                  const headers = ['Brand', 'Month', 'Status', 'Delivery Status', 'Orders', 'GMV'];
                  const rows: CsvCell[][] = [];
                  for (const br of pivotData.brands) {
                    for (const m of pivotData.months) {
                      const md = br.byMonth[m];
                      if (!md) continue;
                      for (const status of Object.keys(md.byStatus)) {
                        const sd = md.byStatus[status];
                        for (const dKey of Object.keys(sd.byDelivery)) {
                          const ds = sd.byDelivery[dKey];
                          rows.push([br.brandName, MONTH_NAMES[m - 1] || m, status, dKey === '__NULL__' ? '(no delivery status)' : dKey, ds.count, ds.amount]);
                        }
                      }
                    }
                  }
                  const suffix = pivotData.startDate && pivotData.endDate ? `${pivotData.startDate}_${pivotData.endDate}` : String(pivotData.year ?? currentYear);
                  downloadCSV(`brand-month-status-${suffix}.csv`, headers, rows);
                }}
              >
                ↓ CSV
              </button>
            )}
          </div>

          <div className={t.chipRow}>
            <span className={t.chipLabel}>Date (markedPendingTime)</span>
            {([
              { key: 'year',   label: `${currentYear} (full year)` },
              { key: '30d',    label: 'Last 30 days' },
              { key: '7d',     label: 'Last 7 days' },
              { key: 'today',  label: 'Today' },
              { key: 'custom', label: 'Custom' },
            ] as const).map((opt) => {
              const active = range === opt.key;
              return (
                <button key={opt.key} onClick={() => setRange(opt.key)} className={active ? t.chipActive : t.chipInactive}>
                  {opt.label}
                </button>
              );
            })}
            {range === 'custom' && (
              <div className="flex items-center gap-2 ml-2">
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className={t.dateInput} />
                <span className={t.dateLabel}>to</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className={t.dateInput} />
              </div>
            )}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search brand…"
              className={t.searchInput}
            />
          </div>

          {pivotData && pivotData.statusColumns.length > 0 && (
            <div className={t.legendStrip}>
              <span className={t.legendLabel}>Statuses</span>
              {pivotData.statusColumns.map((sc) => {
                const expanded = expandedStatuses.has(sc.status);
                return (
                  <button
                    key={sc.status}
                    onClick={() => toggleStatus(sc.status)}
                    className={`px-2 py-0.5 rounded-md font-semibold border ${expanded ? 'ring-2 ring-purple-400/40' : ''} ${t.pillBgFor(sc.status)} hover:opacity-90`}
                  >
                    {expanded ? '▾' : '▸'} {sc.status} <span className={t.isDark ? 'text-purple-300/60 font-normal' : 'text-slate-500 font-normal'}>({sc.total.count.toLocaleString('en-IN')})</span>
                  </button>
                );
              })}
              {expandedStatuses.size > 0 && (
                <button onClick={() => setExpandedStatuses(new Set())} className={t.collapseAllBtn}>
                  collapse all
                </button>
              )}
            </div>
          )}

          <div className={t.tableWrap}>
            {pivotLoading || !pivotData ? (
              <div className={t.loading}>Loading…</div>
            ) : visibleBrands.length === 0 ? (
              <div className={t.loading}>No brands in this slice</div>
            ) : (
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead className={`sticky top-0 z-20 ${t.isDark ? 'bg-slate-900/95 backdrop-blur' : 'bg-white'}`}>
                  <tr>
                    <th rowSpan={3} className={`${t.brandCell} text-left font-semibold uppercase tracking-wider min-w-[220px] ${t.isDark ? 'text-purple-200' : 'text-slate-500'}`}>
                      Brand
                    </th>
                    {pivotData.months.map((m) => {
                      const totalSubCols = subColsPerMonth(pivotData.statusColumns);
                      return (
                        <th key={`m_${m}`} colSpan={totalSubCols} className={t.monthHeader}>
                          {MONTH_NAMES[m - 1] || m}
                          <span className={t.monthHeaderSub}>
                            {(pivotData.monthTotals[m]?.count ?? 0).toLocaleString('en-IN')} · {formatAmount(pivotData.monthTotals[m]?.amount ?? 0)}
                          </span>
                        </th>
                      );
                    })}
                    <th rowSpan={3} className={t.totalHeader}>Total</th>
                  </tr>
                  <tr>
                    {pivotData.months.flatMap((m) => pivotData.statusColumns.map((sc) => (
                      <th
                        key={`m${m}_${sc.status}`}
                        colSpan={subColsFor(sc)}
                        onClick={() => toggleStatus(sc.status)}
                        className={t.headerRow}
                        title={`Click to ${expandedStatuses.has(sc.status) ? 'collapse' : 'expand'} ${sc.status} delivery-status breakdown`}
                      >
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider border ${t.pillBgFor(sc.status)}`}>
                          <span className="text-[10px] opacity-70">{expandedStatuses.has(sc.status) ? '▾' : '▸'}</span>{sc.status}
                        </span>
                      </th>
                    )))}
                  </tr>
                  <tr>
                    {pivotData.months.flatMap((m) => pivotData.statusColumns.flatMap((sc) => {
                      if (!expandedStatuses.has(sc.status)) {
                        return [<th key={`d_${m}_${sc.status}`} className={t.deliveryHeader}>count · ₹</th>];
                      }
                      return sc.deliveryStatuses.map((ds, idx) => (
                        <th
                          key={`d_${m}_${sc.status}_${ds.deliveryStatus ?? '_'}_${idx}`}
                          className={`${t.deliveryHeader} font-bold ${t.pillTextFor(sc.status)}`}
                          title={ds.deliveryStatus ?? '(no delivery status)'}
                        >
                          {ds.deliveryStatus ?? '∅ none'}
                        </th>
                      ));
                    }))}
                  </tr>
                </thead>
                <tbody>
                  {visibleBrands.map((br, idx) => (
                    <tr key={br.brandName} className={`${idx % 2 === 0 ? t.rowEven : t.rowOdd} ${t.rowHover}`}>
                      <td className={t.brandCell}>
                        <div className="flex items-center gap-3">
                          <span className={t.brandRowNum}>{idx + 1}</span>
                          <span className={t.brandAccent} />
                          <span className={t.brandName}>{br.brandName}</span>
                        </div>
                      </td>
                      {pivotData.months.flatMap((m) => pivotData.statusColumns.flatMap((sc) => {
                        if (!expandedStatuses.has(sc.status)) {
                          const cell = brandMonthStatusCell(br, m, sc.status);
                          if (!cell || cell.count === 0) {
                            return [<td key={`c_${br.brandName}_${m}_${sc.status}`} className={t.emptyCell}>—</td>];
                          }
                          return [
                            <td key={`c_${br.brandName}_${m}_${sc.status}`} className={t.dataCell}>
                              <div className={t.cellCount}>{cell.count.toLocaleString('en-IN')}</div>
                              <div className={t.cellAmount}>{formatAmount(cell.amount)}</div>
                            </td>,
                          ];
                        }
                        return sc.deliveryStatuses.map((ds, dIdx) => {
                          const dKey = ds.deliveryStatus ?? '__NULL__';
                          const cell = brandMonthStatusDeliveryCell(br, m, sc.status, dKey);
                          if (!cell || cell.count === 0) {
                            return (<td key={`c_${br.brandName}_${m}_${sc.status}_${dKey}_${dIdx}`} className={t.emptyCell}>—</td>);
                          }
                          return (
                            <td key={`c_${br.brandName}_${m}_${sc.status}_${dKey}_${dIdx}`} className={t.dataCell}>
                              <div className={t.cellCount}>{cell.count.toLocaleString('en-IN')}</div>
                              <div className={t.cellAmount}>{formatAmount(cell.amount)}</div>
                            </td>
                          );
                        });
                      }))}
                      <td className={t.totalBody}>
                        <div className={t.totalBodyCount}>{br.total.count.toLocaleString('en-IN')}</div>
                        <div className={t.totalBodyAmount}>{formatAmount(br.total.amount)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className={t.footRow}>
                  <tr>
                    <td className={t.footLabel}>Total</td>
                    {pivotData.months.flatMap((m) => pivotData.statusColumns.flatMap((sc) => {
                      if (!expandedStatuses.has(sc.status)) {
                        const v = pivotData.monthStatusTotals[`${m}__${sc.status}`] ?? { count: 0, amount: 0 };
                        return [
                          <td key={`t_${m}_${sc.status}`} className={`border-t border-r ${t.isDark ? 'border-white/10 bg-slate-900' : 'border-slate-200 bg-slate-100'} px-3 py-3 text-right whitespace-nowrap`}>
                            <div className={t.cellCount}>{v.count.toLocaleString('en-IN')}</div>
                            <div className={t.cellAmount}>{formatAmount(v.amount)}</div>
                          </td>,
                        ];
                      }
                      return sc.deliveryStatuses.map((ds, dIdx) => {
                        const dKey = ds.deliveryStatus ?? '__NULL__';
                        const v = pivotData.monthStatusDeliveryTotals[`${m}__${sc.status}__${dKey}`] ?? { count: 0, amount: 0 };
                        return (
                          <td key={`t_${m}_${sc.status}_${dKey}_${dIdx}`} className={`border-t border-r ${t.isDark ? 'border-white/10 bg-slate-900' : 'border-slate-200 bg-slate-100'} px-3 py-3 text-right whitespace-nowrap`}>
                            <div className={t.cellCount}>{v.count.toLocaleString('en-IN')}</div>
                            <div className={t.cellAmount}>{formatAmount(v.amount)}</div>
                          </td>
                        );
                      });
                    }))}
                    <td className={t.totalFoot}>
                      <div className={t.totalFootCount}>{pivotData.grand.count.toLocaleString('en-IN')}</div>
                      <div className={t.totalFootAmount}>{formatAmount(pivotData.grand.amount)}</div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
          {pivotData && visibleBrands.length > 0 && (
            <div className={t.footnote}>
              {visibleBrands.length} brand{visibleBrands.length === 1 ? '' : 's'} · {pivotData.months.length} month{pivotData.months.length === 1 ? '' : 's'}
            </div>
          )}
        </div>
        )}

      </div>

      <style jsx>{`
        .animation-delay-2000 { animation-delay: 2s; }
      `}</style>
    </div>
  );
}
