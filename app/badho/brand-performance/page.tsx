'use client';

import { useEffect, useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ResponsiveContainer, ComposedChart, LineChart, BarChart, PieChart, AreaChart,
  Line, Bar, Pie, Area, Cell, LabelList,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import IndiaStateMap, { type StateRow, type SellerPoint } from '../order-dashboard/components/IndiaStateMap';
import MapErrorBoundary from '../order-dashboard/components/MapErrorBoundary';
import DeliveryFlowMap, { type FlowOrigin, type FlowDest } from '../order-dashboard/components/DeliveryFlowMap';
import MbsRichDrillModal, { type MbsOrderRow } from '../order-dashboard/components/MbsRichDrillModal';

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

// ─── View Query infra ────────────────────────────────────────────────────
// Each brand-performance API route is wrapped with withQueryCapture(), so its
// JSON response carries a `__queries` array. captureQuery() stashes it per
// section; queryBtn() renders a button that opens this modal with the SQL.
type SqlQuery = { sql: string; params?: unknown[] };

const QUERY_BTN_CLASS =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap bg-white/10 hover:bg-fuchsia-500/30 border border-white/10 hover:border-fuchsia-400/50 text-purple-200 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed';

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

  // ── View Query state ──────────────────────────────────────────────────
  const [sectionQueries, setSectionQueries] = useState<Record<string, SqlQuery[]>>({});
  const [queryModalState, setQueryModalState] = useState<{ title: string; queries: SqlQuery[] } | null>(null);
  // Pull __queries out of a fetch response and stash them under a section key.
  const captureQuery = (key: string, json: unknown) => {
    const q = (json as { __queries?: SqlQuery[] } | null)?.__queries;
    if (Array.isArray(q) && q.length > 0) setSectionQueries((prev) => ({ ...prev, [key]: q }));
  };
  // Render a "View Query" button. Pass one key or several (combined into one modal).
  const queryBtn = (keys: string | string[], title: string) => {
    const arr = Array.isArray(keys) ? keys : [keys];
    const queries = arr.flatMap((k) => sectionQueries[k] ?? []);
    const has = queries.length > 0;
    return (
      <button
        type="button"
        disabled={!has}
        title={has ? 'Show the SQL behind this section' : 'Load this section first'}
        onClick={() => has && setQueryModalState({ title, queries })}
        className={QUERY_BTN_CLASS}
      >
        {'</>'} View Query
      </button>
    );
  };

  const [pivotData, setPivotData] = useState<PivotData | null>(null);
  const [pivotLoading, setPivotLoading] = useState(false);
  const [range, setRange] = useState<'year' | '30d' | '7d' | 'today' | 'custom'>('year');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [expandedStatuses, setExpandedStatuses] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [bpTab, setBpTab] = useState<'dashboard' | 'details' | 'product' | 'topsellers' | 'trends' | 'priceset' | 'alerts'>('trends');
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
  const [mbsBrands, setMbsBrands] = useState<Set<string>>(new Set()); // empty = all brands
  const [mbsBrandSearch, setMbsBrandSearch] = useState('');
  const [mbsBrandDropdownOpen, setMbsBrandDropdownOpen] = useState(false);
  const [mbsExpanded, setMbsExpanded] = useState<Set<string>>(new Set());

  // India state map — shares the brand multi-select with the MBS table
  const [mapData, setMapData] = useState<StateRow[] | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapMetric, setMapMetric] = useState<'count' | 'amount'>('count');
  const [selectedMapState, setSelectedMapState] = useState<string | null>(null);
  // Seller operating-location overlay (lat/long pins) for the map
  const [showSellerPins, setShowSellerPins] = useState(false);
  const [sellerLocData, setSellerLocData] = useState<SellerPoint[] | null>(null);
  const [sellerLocLoading, setSellerLocLoading] = useState(false);
  // Delivery-flow map (warehouse → delivery cities), shown when a brand is selected
  const [flowData, setFlowData] = useState<{ origins: FlowOrigin[]; destinations: FlowDest[] } | null>(null);
  const [flowLoading, setFlowLoading] = useState(false);
  interface CityRow { city: string | null; district: string | null; count: number; amount: number; buyers: number; }
  const [cityData, setCityData] = useState<{ data: CityRow[]; grand: { count: number; amount: number; buyers: number } } | null>(null);
  const [cityLoading, setCityLoading] = useState(false);
  const [citySearch, setCitySearch] = useState('');

  // Product tab — rows = SKU, cols = month, shares brand multi-select & date filters
  interface ProdCell { count: number; amount: number; buyers: number; quantity: number; }
  interface ProductRow {
    skuId: string;
    skuLabel: string;
    brandName: string | null;
    size: string | null;
    months: Record<number, ProdCell>;
    total: ProdCell;
  }
  interface ProductData {
    data: ProductRow[];
    months: number[];
    totals: { byMonth: Record<number, ProdCell>; grand: ProdCell };
    productCount: number;
    returned: number;
    truncated: boolean;
    limit: number;
  }
  const [productData, setProductData] = useState<ProductData | null>(null);
  const [productLoading, setProductLoading] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  // Top Sellers tab — brand-grouped, each brand expandable to its top SKUs
  interface TsCell { count: number; amount: number; buyers: number; quantity: number; }
  interface TsSku { skuId: string; skuLabel: string; size: string | null; total: TsCell; }
  interface TsBrand { brandId: string | null; brandLabel: string; total: TsCell; products: TsSku[]; }
  interface TopSellersData {
    brands: TsBrand[];
    grand: TsCell;
    // Order-level distinct totals — match Chart & Trend (one row per
    // purchaseOrder, GMV uses po."amount"). Use these in the footer so the
    // dashboard's two tabs reconcile cleanly.
    distinct: { orders: number; buyers: number; amount: number };
    brandCount: number;
    productCount: number;
    sort: 'orders' | 'amount' | 'quantity';
    direction: 'asc' | 'desc';
  }
  const [topData, setTopData] = useState<TopSellersData | null>(null);
  const [topLoading, setTopLoading] = useState(false);
  const [topSort, setTopSort] = useState<'orders' | 'amount' | 'quantity'>('amount');
  const [topDir, setTopDir] = useState<'asc' | 'desc'>('desc');
  const [topSearch, setTopSearch] = useState('');
  const [topExpanded, setTopExpanded] = useState<Set<string>>(new Set());

  // Drill-down modal — fires when user clicks a metric cell on Brand × Product
  // Drill-down modal for Brand × Product table (Brand Summary tab). Fires on
  // any numeric cell click (orders / ₹ value / buyers / qty) at brand or
  // brand+SKU level. Backed by /api/order-list with brand+sku filters so it
  // shares the rich pivot drill UI with the other brand-performance drills.
  interface DrillState {
    brand: string;
    sku?: { id: string; label: string };
    metric: 'orders' | 'amount' | 'buyers' | 'qty';
  }
  const [drill, setDrill] = useState<DrillState | null>(null);
  const [drillRows, setDrillRows] = useState<MbsOrderRow[] | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillError, setDrillError] = useState<string | null>(null);

  // Drill-down modal for Monthly Breakdown by Order Status — fires on any
  // numeric cell click (orders / ₹ value / buyers) anywhere in the table.
  // Mirrors the order-dashboard pivot drill modal (rich PO-level columns,
  // Pushed/Payment/Courier/Delivery/Reason filters, sortable headers, CSV)
  // so the experience stays consistent across dashboards.
  interface MbsDrillState {
    status: string | null;                      // null = all statuses (footer-total drill)
    deliveryStatus: string | null | undefined; // undefined = no filter, null = literal NULL, string = exact match
    month: number | null;                       // null = all months
    metric: 'orders' | 'amount' | 'buyers';
    // When set, overrides the global mbsBrands filter (used by Pivot row clicks to scope to a single brand).
    // undefined = inherit global filter, '' = explicit all-brands (clears global filter for this drill).
    brandOverride?: string;
  }
  const [mbsDrill, setMbsDrill] = useState<MbsDrillState | null>(null);
  const [mbsDrillRows, setMbsDrillRows] = useState<MbsOrderRow[] | null>(null);
  const [mbsDrillLoading, setMbsDrillLoading] = useState(false);
  const [mbsDrillError, setMbsDrillError] = useState<string | null>(null);

  // Drill-down modal for Product × Month table (Product wise tab). Fires on any
  // cell click (orders / ₹ value / buyers). Reuses /brand-product-drill API.
  interface ProductDrillState {
    skuId: string;
    skuLabel: string;
    brandName: string | null;
    size: string | null;
    month: number | null;
    metric: 'orders' | 'amount' | 'buyers';
  }
  const [productDrill, setProductDrill] = useState<ProductDrillState | null>(null);
  const [productDrillRows, setProductDrillRows] = useState<MbsOrderRow[] | null>(null);
  const [productDrillLoading, setProductDrillLoading] = useState(false);
  const [productDrillError, setProductDrillError] = useState<string | null>(null);

  // Chart & Trend tab
  interface TrendPoint {
    bucket: string;
    totalOrders: number;
    deliveredOrders: number;
    rejectedOrders: number;
    cancelledOrders: number;
    deliveredAmount: number;
    totalAmount: number;
    buyers: number;
    successPct: number;
    aov: number;
  }
  interface TrendData {
    data: TrendPoint[];
    totals: Omit<TrendPoint, 'bucket'>;
    granularity: 'day' | 'week' | 'month';
  }
  const [trendData, setTrendData] = useState<TrendData | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendGranularity, setTrendGranularity] = useState<'day' | 'week' | 'month'>('month');
  const [trendMetric, setTrendMetric] = useState<'gmv' | 'orders' | 'buyers' | 'success'>('gmv');

  // Additive trends — brand share over months, DOW pattern, cohort, KPI delta vs prior period
  interface TrendsExtra {
    brandShare: Array<Record<string, number>>;
    topBrands: string[];
    dow: Array<{ dow: string; orders: number; amount: number }>;
    cohort: Array<{ month: number; new: number; returning: number; orders: number; amount: number }>;
    funnel: Array<{ status: string; bucket: 'success' | 'inflight' | 'failed'; orders: number; amount: number; sharePct: number }>;
    funnelBuckets: Array<{ bucket: 'success' | 'inflight' | 'failed'; orders: number; amount: number; sharePct: number }>;
    topStates: Array<{ state: string; orders: number; amount: number; buyers: number }>;
    orderSize: Array<{ bucket: string; sortKey: number; orders: number; amount: number }>;
    monthlyAov: Array<{ month: number; orders: number; amount: number; aov: number; deliveredOrders: number; deliveredAmount: number; deliveredAov: number }>;
    kpi: {
      current: { orders: number; amount: number; buyers: number; deliveredOrders: number; deliveredAmount: number; deliveredBuyers: number; aov: number; deliveryRate: number; delAov: number; };
      prior:   { orders: number; amount: number; buyers: number; deliveredOrders: number; deliveredAmount: number; aov: number; deliveryRate: number; delAov: number; };
      deltaPct: { orders: number | null; amount: number | null; buyers: number | null; aov: number | null; deliveredOrders: number | null; deliveredAmount: number | null; delAov: number | null; deliveryRate: number | null; };
    };
    window: { curStart: string; curEnd: string; prevStart: string; prevEnd: string };
  }
  const [trendsExtra, setTrendsExtra] = useState<TrendsExtra | null>(null);
  const [trendsExtraLoading, setTrendsExtraLoading] = useState(false);

  // MOV Not Meet Cart Trend — DRAFT carts whose amount stayed below the seller's
  // effectiveMinimumOrderValue, bucketed over time. Respects the brand filter.
  interface MovTrendData {
    data: Array<{ bucket: string; carts: number; buyers: number }>;
    total: number;
    totalCarts: number;
    totalBuyers: number;
    granularity: 'day' | 'week' | 'month';
  }
  const [movTrendData, setMovTrendData] = useState<MovTrendData | null>(null);
  const [movTrendLoading, setMovTrendLoading] = useState(false);
  const [movMetric, setMovMetric] = useState<'cart' | 'buyers'>('cart'); // default: Cart

  // Price Set tab — flat catalog of seller × SKU × unit price × margin × MRP
  interface PriceRow {
    sellerId: string; sellerName: string | null; businessName: string | null; phone: string | null;
    sellerState: string | null; sellerDistrict: string | null; sellerCity: string | null; pincode: string | null;
    brandName: string | null; skuId: string | null; productName: string | null; size: string | null;
    unitPrice: number | null; margin: number | null; mrp: number | null;
  }
  interface PriceData {
    data: PriceRow[];
    brands: string[]; states: string[]; sellers: string[];
    summary: { rows: number; withPrice: number; withoutPrice: number; sellers: number; brands: number; products: number; states: number; minUnitPrice: number | null; maxUnitPrice: number | null; avgMargin: number | null; };
  }
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceSearch, setPriceSearch] = useState('');
  const [priceBrandFilter, setPriceBrandFilter] = useState<Set<string>>(new Set());
  const [priceStateFilter, setPriceStateFilter] = useState<Set<string>>(new Set());
  const [priceStatus, setPriceStatus] = useState<'all' | 'priced' | 'unpriced'>('priced');
  const [priceSort, setPriceSort] = useState<'price-asc' | 'price-desc' | 'margin-asc' | 'margin-desc' | 'mrp-desc' | 'brand'>('price-asc');
  const [priceBrandOpen, setPriceBrandOpen] = useState(false);
  const [priceStateOpen, setPriceStateOpen] = useState(false);

  // Alerts tab — data-quality flags on the same price-set catalog
  type AlertKind = 'margin100' | 'mrpMissing' | 'priceMissing';
  const [alertFilter, setAlertFilter] = useState<'all' | AlertKind>('all');
  const [alertSearch, setAlertSearch] = useState('');
  const [alertBrandFilter, setAlertBrandFilter] = useState<Set<string>>(new Set());
  const [alertBrandOpen, setAlertBrandOpen] = useState(false);

  // Pagination state (per-table)
  const [pricePage, setPricePage] = useState(1);
  const [priceSize, setPriceSize] = useState(50);
  const [alertPage, setAlertPage] = useState(1);
  const [alertSize, setAlertSize] = useState(50);
  const [cityPage,  setCityPage]  = useState(1);
  const [citySize,  setCitySize]  = useState(50);

  // Reset page when filters change
  useEffect(() => { setPricePage(1); }, [priceSearch, priceBrandFilter, priceStateFilter, priceStatus, priceSort, priceSize]);
  useEffect(() => { setAlertPage(1); }, [alertSearch, alertBrandFilter, alertFilter, alertSize]);
  useEffect(() => { setCityPage(1);  }, [citySearch, selectedMapState, citySize]);

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
      captureQuery('pivot', json);
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
      if (mbsBrands.size > 0) params.append('brand', Array.from(mbsBrands).join(','));
      const res = await fetch(`/api/brand-performance/monthly-by-status?${params.toString()}`);
      if (!res.ok) throw new Error('failed');
      const json = await res.json();
      captureQuery('mbs', json);
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
  }, [authChecked, bpTab, range, customFrom, customTo, mbsBrands]);

  const fetchMap = async () => {
    try {
      setMapLoading(true);
      const params = new URLSearchParams({ year: String(currentYear) });
      const { startDate, endDate } = resolveRange();
      if (startDate) params.append('startDate', startDate);
      if (endDate)   params.append('endDate',   endDate);
      if (mbsBrands.size > 0) params.append('brand', Array.from(mbsBrands).join(','));
      const res = await fetch(`/api/brand-performance/by-state?${params.toString()}`);
      if (!res.ok) throw new Error('failed');
      const json = await res.json();
      captureQuery('map', json);
      setMapData(json.data);
    } catch (err) {
      console.error('Map fetch error:', err);
      setMapData(null);
    } finally {
      setMapLoading(false);
    }
  };

  useEffect(() => {
    if (!authChecked || bpTab !== 'dashboard') return;
    fetchMap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, bpTab, range, customFrom, customTo, mbsBrands]);

  const fetchSellerLocations = async () => {
    try {
      setSellerLocLoading(true);
      const params = new URLSearchParams({ year: String(currentYear) });
      const { startDate, endDate } = resolveRange();
      if (startDate) params.append('startDate', startDate);
      if (endDate)   params.append('endDate',   endDate);
      if (mbsBrands.size > 0) params.append('brand', Array.from(mbsBrands).join(','));
      const res = await fetch(`/api/brand-performance/seller-locations?${params.toString()}`);
      if (!res.ok) throw new Error('failed');
      const json = await res.json();
      captureQuery('sellerLocs', json);
      setSellerLocData(json.data);
    } catch (err) {
      console.error('Seller locations fetch error:', err);
      setSellerLocData(null);
    } finally {
      setSellerLocLoading(false);
    }
  };

  // Lazy-load seller pins the first time the overlay is switched on (or when
  // filters change while it's already on). Avoids the extra query otherwise.
  useEffect(() => {
    if (!authChecked || bpTab !== 'dashboard' || !showSellerPins) return;
    fetchSellerLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, bpTab, showSellerPins, range, customFrom, customTo, mbsBrands]);

  const fetchDeliveryFlows = async () => {
    try {
      setFlowLoading(true);
      const params = new URLSearchParams({ year: String(currentYear) });
      const { startDate, endDate } = resolveRange();
      if (startDate) params.append('startDate', startDate);
      if (endDate)   params.append('endDate',   endDate);
      params.append('brand', Array.from(mbsBrands).join(','));
      const res = await fetch(`/api/brand-performance/delivery-flows?${params.toString()}`);
      if (!res.ok) throw new Error('failed');
      const json = await res.json();
      captureQuery('flows', json);
      setFlowData({ origins: json.origins ?? [], destinations: json.destinations ?? [] });
    } catch (err) {
      console.error('Delivery flows fetch error:', err);
      setFlowData(null);
    } finally {
      setFlowLoading(false);
    }
  };

  // The delivery-flow map only makes sense per-brand — fetch when ≥1 brand is
  // selected, clear otherwise.
  useEffect(() => {
    if (!authChecked || bpTab !== 'dashboard') return;
    if (mbsBrands.size === 0) { setFlowData(null); return; }
    fetchDeliveryFlows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, bpTab, mbsBrands, range, customFrom, customTo]);

  const fetchCity = async (stateName: string) => {
    try {
      setCityLoading(true);
      const params = new URLSearchParams({ year: String(currentYear), state: stateName });
      const { startDate, endDate } = resolveRange();
      if (startDate) params.append('startDate', startDate);
      if (endDate)   params.append('endDate',   endDate);
      if (mbsBrands.size > 0) params.append('brand', Array.from(mbsBrands).join(','));
      const res = await fetch(`/api/brand-performance/by-city?${params.toString()}`);
      if (!res.ok) throw new Error('failed');
      const json = await res.json();
      captureQuery('city', json);
      setCityData(json);
    } catch (err) {
      console.error('City fetch error:', err);
      setCityData(null);
    } finally {
      setCityLoading(false);
    }
  };

  // Re-fetch cities whenever the selected state, date range or brand filter changes.
  useEffect(() => {
    if (!authChecked || bpTab !== 'dashboard' || !selectedMapState) return;
    fetchCity(selectedMapState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, bpTab, selectedMapState, range, customFrom, customTo, mbsBrands]);

  const fetchPriceSet = async () => {
    try {
      setPriceLoading(true);
      const res = await fetch(`/api/brand-performance/product-price-set`);
      if (!res.ok) throw new Error('failed');
      const json = await res.json();
      captureQuery('priceset', json);
      setPriceData(json);
    } catch (err) {
      console.error('Price set fetch error:', err);
      setPriceData(null);
    } finally {
      setPriceLoading(false);
    }
  };
  useEffect(() => {
    if (!authChecked || (bpTab !== 'priceset' && bpTab !== 'alerts') || priceData) return;
    fetchPriceSet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, bpTab]);

  // Reset selected state when filters change (avoid showing stale city data for the wrong state)
  useEffect(() => { setSelectedMapState(null); setCityData(null); }, [range, customFrom, customTo, mbsBrands]);

  const fetchProducts = async () => {
    try {
      setProductLoading(true);
      const params = new URLSearchParams({ year: String(currentYear) });
      const { startDate, endDate } = resolveRange();
      if (startDate) params.append('startDate', startDate);
      if (endDate)   params.append('endDate',   endDate);
      if (mbsBrands.size > 0) params.append('brand', Array.from(mbsBrands).join(','));
      const res = await fetch(`/api/brand-performance/monthly-by-product?${params.toString()}`);
      if (!res.ok) throw new Error('failed');
      const json = await res.json();
      captureQuery('products', json);
      setProductData(json);
    } catch (err) {
      console.error('Product fetch error:', err);
      setProductData(null);
    } finally {
      setProductLoading(false);
    }
  };

  useEffect(() => {
    if (!authChecked || bpTab !== 'product') return;
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, bpTab, range, customFrom, customTo, mbsBrands]);

  const fetchTopSellers = async () => {
    try {
      setTopLoading(true);
      const params = new URLSearchParams({ year: String(currentYear), sort: topSort, direction: topDir });
      const { startDate, endDate } = resolveRange();
      if (startDate) params.append('startDate', startDate);
      if (endDate)   params.append('endDate',   endDate);
      if (mbsBrands.size > 0) params.append('brand', Array.from(mbsBrands).join(','));
      const res = await fetch(`/api/brand-performance/brand-product-summary?${params.toString()}`);
      if (!res.ok) throw new Error('failed');
      const json = await res.json();
      captureQuery('topsellers', json);
      setTopData(json);
    } catch (err) {
      console.error('Top sellers fetch error:', err);
      setTopData(null);
    } finally {
      setTopLoading(false);
    }
  };

  useEffect(() => {
    if (!authChecked || bpTab !== 'topsellers') return;
    fetchTopSellers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, bpTab, range, customFrom, customTo, mbsBrands, topSort, topDir]);

  const toggleTopBrand = (key: string) => {
    setTopExpanded((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  };

  const openDrill = (state: DrillState) => {
    setDrill(state);
    setDrillRows(null);
    setDrillError(null);
  };
  const closeDrill = () => {
    setDrill(null);
    setDrillRows(null);
    setDrillError(null);
  };

  const openMbsDrill = (state: MbsDrillState) => {
    setMbsDrill(state);
    setMbsDrillRows(null);
    setMbsDrillError(null);
  };
  const closeMbsDrill = () => {
    setMbsDrill(null);
    setMbsDrillRows(null);
    setMbsDrillError(null);
  };

  const openProductDrill = (state: ProductDrillState) => {
    setProductDrill(state);
    setProductDrillRows(null);
    setProductDrillError(null);
  };
  const closeProductDrill = () => {
    setProductDrill(null);
    setProductDrillRows(null);
    setProductDrillError(null);
  };

  useEffect(() => {
    if (!drill) return;
    let cancelled = false;
    (async () => {
      try {
        setDrillLoading(true);
        setDrillError(null);
        const params = new URLSearchParams({ year: String(currentYear) });
        const { startDate, endDate } = resolveRange();
        if (startDate) params.append('startDate', startDate);
        if (endDate)   params.append('endDate',   endDate);
        // Brand × Product drill is always scoped to the row's brand. The
        // Brand × Product table groups by brands.brand.label (e.g.
        // "HOPPIN CANDY") which doesn't match the seller-businessName prefix
        // used by the MBS drill, so use brandLabel instead of brand here.
        params.append('brandLabel', drill.brand);
        if (drill.sku) params.append('sku', drill.sku.id);
        const res = await fetch(`/api/order-list?${params.toString()}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Failed to fetch orders');
        if (cancelled) return;
        setDrillRows(json.data || []);
      } catch (err) {
        if (cancelled) return;
        console.error('Drill fetch error:', err);
        setDrillRows([]);
        setDrillError(err instanceof Error ? err.message : 'Error loading orders');
      } finally {
        if (!cancelled) setDrillLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drill]);

  useEffect(() => {
    if (!mbsDrill) return;
    let cancelled = false;
    (async () => {
      try {
        setMbsDrillLoading(true);
        setMbsDrillError(null);
        const params = new URLSearchParams({ year: String(currentYear) });
        if (mbsDrill.status) params.append('status', mbsDrill.status);
        const { startDate, endDate } = resolveRange();
        if (startDate) params.append('startDate', startDate);
        if (endDate)   params.append('endDate',   endDate);
        // brandOverride wins over global filter; empty string explicitly means "all brands"
        if (mbsDrill.brandOverride !== undefined) {
          if (mbsDrill.brandOverride !== '') params.append('brand', mbsDrill.brandOverride);
        } else if (mbsBrands.size > 0) {
          params.append('brand', Array.from(mbsBrands).join(','));
        }
        if (mbsDrill.deliveryStatus !== undefined) {
          params.append('deliveryStatus', mbsDrill.deliveryStatus ?? '__NULL__');
        }
        if (mbsDrill.month != null) params.append('month', String(mbsDrill.month));
        // Reuse /api/order-list — same endpoint that backs the order-dashboard
        // pivot drill, so columns and behaviour stay aligned between dashboards.
        const res = await fetch(`/api/order-list?${params.toString()}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Failed to fetch orders');
        if (cancelled) return;
        setMbsDrillRows(json.data || []);
      } catch (err) {
        if (cancelled) return;
        console.error('MBS drill fetch error:', err);
        setMbsDrillRows([]);
        setMbsDrillError(err instanceof Error ? err.message : 'Error loading orders');
      } finally {
        if (!cancelled) setMbsDrillLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mbsDrill]);


  useEffect(() => {
    if (!productDrill) return;
    let cancelled = false;
    (async () => {
      try {
        setProductDrillLoading(true);
        setProductDrillError(null);
        const params = new URLSearchParams({ year: String(currentYear) });
        const { startDate, endDate } = resolveRange();
        if (startDate) params.append('startDate', startDate);
        if (endDate)   params.append('endDate',   endDate);
        // Product wise table groups by brands.brand.label so use brandLabel
        // (parity with the Brand × Product drill above).
        if (productDrill.brandName) params.append('brandLabel', productDrill.brandName);
        params.append('sku', productDrill.skuId);
        if (productDrill.month != null) params.append('month', String(productDrill.month));
        const res = await fetch(`/api/order-list?${params.toString()}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Failed to fetch orders');
        if (cancelled) return;
        setProductDrillRows(json.data || []);
      } catch (err) {
        if (cancelled) return;
        console.error('Product drill fetch error:', err);
        setProductDrillRows([]);
        setProductDrillError(err instanceof Error ? err.message : 'Error loading orders');
      } finally {
        if (!cancelled) setProductDrillLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productDrill]);

  const fetchTrend = async () => {
    try {
      setTrendLoading(true);
      const params = new URLSearchParams({ year: String(currentYear), granularity: trendGranularity });
      const { startDate, endDate } = resolveRange();
      if (startDate) params.append('startDate', startDate);
      if (endDate)   params.append('endDate',   endDate);
      if (mbsBrands.size > 0) params.append('brand', Array.from(mbsBrands).join(','));
      const res = await fetch(`/api/brand-performance/trend?${params.toString()}`);
      if (!res.ok) throw new Error('failed');
      const json = await res.json();
      captureQuery('trend', json);
      setTrendData(json);
    } catch (err) {
      console.error('Trend fetch error:', err);
      setTrendData(null);
    } finally {
      setTrendLoading(false);
    }
  };

  const fetchTrendsExtra = async () => {
    try {
      setTrendsExtraLoading(true);
      const params = new URLSearchParams({ year: String(currentYear) });
      const { startDate, endDate } = resolveRange();
      if (startDate) params.append('startDate', startDate);
      if (endDate)   params.append('endDate',   endDate);
      if (mbsBrands.size > 0) params.append('brand', Array.from(mbsBrands).join(','));
      const res = await fetch(`/api/brand-performance/trends?${params.toString()}`);
      if (!res.ok) throw new Error('failed');
      const json = await res.json();
      captureQuery('trendsExtra', json);
      setTrendsExtra(json);
    } catch (err) {
      console.error('Trends-extra fetch error:', err);
      setTrendsExtra(null);
    } finally {
      setTrendsExtraLoading(false);
    }
  };

  const fetchMovTrend = async () => {
    try {
      setMovTrendLoading(true);
      const params = new URLSearchParams({ year: String(currentYear), granularity: trendGranularity });
      const { startDate, endDate } = resolveRange();
      if (startDate) params.append('startDate', startDate);
      if (endDate)   params.append('endDate',   endDate);
      if (mbsBrands.size > 0) params.append('brand', Array.from(mbsBrands).join(','));
      const res = await fetch(`/api/brand-performance/mov-not-met-trend?${params.toString()}`);
      if (!res.ok) throw new Error('failed');
      const json = await res.json();
      captureQuery('movTrend', json);
      setMovTrendData(json);
    } catch (err) {
      console.error('MOV-not-met trend fetch error:', err);
      setMovTrendData(null);
    } finally {
      setMovTrendLoading(false);
    }
  };

  useEffect(() => {
    if (!authChecked || bpTab !== 'trends') return;
    fetchTrend();
    fetchMbs();          // status mix uses mbsData
    fetchTopSellers();   // top brands + top SKUs + pareto use topData
    fetchTrendsExtra();  // brand share area, DOW, cohort, KPI deltas
    fetchMovTrend();     // DRAFT carts that never met the seller MOV
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, bpTab, range, customFrom, customTo, mbsBrands, trendGranularity]);

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

      <div className="w-full relative z-10">
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

        {/* Vertical nav + content — sidebar keeps tabs in view, content swaps in place */}
        <div className="flex gap-6 items-start">
          {/* Vertical sidebar nav — icon rail, labels reveal on hover */}
          <aside className="w-14 shrink-0 sticky top-4 self-start z-[60]">
            <nav className={`flex flex-col gap-1.5 p-2 rounded-2xl ${t.isDark ? 'bg-slate-900/70 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.7)]' : 'bg-white border border-slate-200 shadow-md'}`}>
              {([
                { key: 'trends',     label: 'Chart & Trend',   icon: '∿' },
                { key: 'dashboard',  label: 'Dashboard',       icon: '▤' },
                { key: 'details',    label: 'Pivot',           icon: '▥' },
                { key: 'product',    label: 'Product wise',    icon: '◫' },
                { key: 'topsellers', label: 'Brand × Product', icon: '★' },
                { key: 'priceset',   label: 'Price Set',       icon: '₹' },
                { key: 'alerts',     label: 'Alerts',          icon: '⚠' },
              ] as const).map((tab) => {
                const active = bpTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setBpTab(tab.key)}
                    aria-label={tab.label}
                    className={`group relative h-10 w-10 mx-auto rounded-xl flex items-center justify-center transition-all duration-300 ${active ? t.tabActive : t.tabInactive}`}
                  >
                    {/* Active accent bar on the left edge */}
                    {active && (
                      <span className="absolute -left-2 top-1/2 -translate-y-1/2 h-5 w-1 rounded-full bg-gradient-to-b from-fuchsia-400 to-indigo-400 shadow-[0_0_10px_rgba(217,70,239,0.8)]" />
                    )}
                    <span className={`text-lg leading-none transition-transform duration-300 group-hover:scale-110 ${active ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}`}>{tab.icon}</span>

                    {/* Flyout label — slides in on hover */}
                    <span
                      className={`pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 -translate-x-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 ease-out whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide z-50 ${t.isDark ? 'bg-slate-800 text-white border border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.55)]' : 'bg-slate-900 text-white shadow-[0_8px_24px_rgba(0,0,0,0.25)]'}`}
                    >
                      {tab.label}
                      {/* Arrow pointing back to the icon */}
                      <span className={`absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rotate-45 ${t.isDark ? 'bg-slate-800 border-l border-b border-white/10' : 'bg-slate-900'}`} />
                    </span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Tab content — only the active tab renders here */}
          <div className="flex-1 min-w-0">

        {/* KPI strip — Dashboard tab only */}
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
              {queryBtn('mbs', 'Monthly Breakdown by Order Status')}
              {/* Brand multi-select picker */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMbsBrandDropdownOpen((v) => !v)}
                  className={`min-w-[240px] px-3 py-1.5 text-xs rounded-lg text-left flex items-center justify-between gap-2 ${t.isDark ? 'bg-white/10 border border-white/20 text-white hover:bg-white/15' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'} focus:outline-none focus:ring-2 focus:ring-purple-400`}
                >
                  <span className="truncate font-semibold">
                    {mbsBrands.size === 0 && <span className={t.isDark ? 'text-purple-300/70' : 'text-slate-400'}>All brands</span>}
                    {mbsBrands.size === 1 && Array.from(mbsBrands)[0]}
                    {mbsBrands.size > 1 && <span className={t.isDark ? 'text-fuchsia-200' : 'text-purple-700'}>{mbsBrands.size} brands selected</span>}
                  </span>
                  <span className={t.isDark ? 'text-purple-300 text-[10px]' : 'text-slate-400 text-[10px]'}>▾</span>
                </button>
                {mbsBrandDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-[55]" onClick={() => setMbsBrandDropdownOpen(false)} />
                    <div className={`absolute top-full right-0 mt-1 z-[60] w-[340px] max-h-[420px] rounded-lg shadow-2xl flex flex-col overflow-hidden ${t.isDark ? 'bg-slate-950 border border-white/15' : 'bg-white border border-slate-200'}`}>
                      <div className={`p-2 border-b flex items-center gap-2 ${t.isDark ? 'bg-slate-950 border-white/10' : 'bg-white border-slate-200'}`}>
                        <input
                          type="text"
                          autoFocus
                          value={mbsBrandSearch}
                          onChange={(e) => setMbsBrandSearch(e.target.value)}
                          placeholder="Search brand…"
                          className={t.searchInput.replace('ml-auto', '').replace('min-w-[220px]', 'flex-1 min-w-0')}
                        />
                        {mbsBrands.size > 0 && (
                          <button
                            type="button"
                            onClick={() => setMbsBrands(new Set())}
                            className={`px-2 py-1.5 text-[10px] font-bold rounded border whitespace-nowrap ${t.isDark ? 'bg-rose-500/20 text-rose-200 border-rose-400/40 hover:bg-rose-500/30' : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'}`}
                          >
                            Clear all
                          </button>
                        )}
                      </div>
                      <div className={`overflow-y-auto flex-1 ${t.isDark ? 'bg-slate-950' : 'bg-white'}`}>
                        {(() => {
                          const allBrands = pivotData?.brands?.map((b) => b.brandName) ?? [];
                          const q = mbsBrandSearch.trim().toLowerCase();
                          const filtered = q ? allBrands.filter((n) => n.toLowerCase().includes(q)) : allBrands;
                          if (filtered.length === 0) {
                            return <div className={`px-3 py-4 text-xs ${t.isDark ? 'bg-slate-950 text-purple-300/60' : 'bg-white text-slate-400'}`}>No matches</div>;
                          }
                          const toggle = (name: string) => {
                            setMbsBrands((prev) => {
                              const next = new Set(prev);
                              if (next.has(name)) next.delete(name); else next.add(name);
                              return next;
                            });
                          };
                          return filtered.map((name) => {
                            const checked = mbsBrands.has(name);
                            return (
                              <label
                                key={name}
                                className={`flex items-center gap-2 px-3 py-2 text-xs border-b cursor-pointer ${t.isDark ? 'bg-slate-950 border-white/5 hover:bg-white/10' : 'bg-white border-slate-100 hover:bg-slate-100'} ${checked ? (t.isDark ? 'bg-fuchsia-500/15' : 'bg-purple-50') : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggle(name)}
                                  className="accent-fuchsia-500 w-3.5 h-3.5"
                                />
                                <span className={checked ? (t.isDark ? 'text-fuchsia-200 font-semibold' : 'text-purple-700 font-semibold') : (t.isDark ? 'text-white' : 'text-slate-800')}>
                                  {name}
                                </span>
                              </label>
                            );
                          });
                        })()}
                      </div>
                      <div className={`p-2 border-t flex items-center justify-between gap-2 ${t.isDark ? 'bg-slate-950 border-white/10' : 'bg-white border-slate-200'}`}>
                        <span className={`text-[10px] ${t.isDark ? 'text-purple-300/70' : 'text-slate-500'}`}>
                          {mbsBrands.size === 0 ? 'no filter — showing all brands' : `${mbsBrands.size} selected`}
                        </span>
                        <button
                          type="button"
                          onClick={() => setMbsBrandDropdownOpen(false)}
                          className="px-3 py-1 text-[11px] font-semibold rounded bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white shadow-sm"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
              {mbsBrands.size > 0 && (
                <button
                  onClick={() => setMbsBrands(new Set())}
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
                    const suffix = mbsBrands.size === 0
                      ? 'all-brands'
                      : mbsBrands.size === 1
                        ? Array.from(mbsBrands)[0].toLowerCase().replace(/\s+/g, '-')
                        : `${mbsBrands.size}-brands`;
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
            {(range !== 'year' || customFrom || customTo) && (
              <button
                onClick={() => { setRange('year'); setCustomFrom(''); setCustomTo(''); }}
                className={`px-2 py-1 rounded-md text-[10px] font-bold ${t.isDark ? 'bg-rose-500/15 text-rose-200 border border-rose-400/30 hover:bg-rose-500/25' : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'}`}
                title="Reset to full year"
              >
                ✕ Clear date
              </button>
            )}
            {mbsData && (
              <span className={`ml-auto text-xs font-semibold ${t.isDark ? 'text-purple-300/70' : 'text-slate-500'}`}>
                {mbsBrands.size === 0 ? 'All brands' : (
                  <>
                    Filtered to{' '}
                    <span className={t.isDark ? 'text-fuchsia-300' : 'text-purple-700'} title={Array.from(mbsBrands).join(', ')}>
                      {mbsBrands.size === 1 ? Array.from(mbsBrands)[0] : `${mbsBrands.size} brands`}
                    </span>
                  </>
                )}
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
                              const openCell = (metric: 'orders' | 'amount' | 'buyers') => (e: React.MouseEvent) => {
                                e.stopPropagation();
                                openMbsDrill({ status: row.status, deliveryStatus: undefined, month: m, metric });
                              };
                              return [
                                <td key={`r_${row.status}_${m}_c`} className={t.dataCell}>
                                  <button type="button" onClick={openCell('orders')} title={`Click to see ${MONTH_NAMES[m - 1] || m} orders for ${row.status}`} className={`${t.cellCount} transition-all duration-150 hover:scale-110 origin-right ${t.isDark ? 'hover:text-fuchsia-300 hover:drop-shadow-[0_0_8px_rgba(232,121,249,0.7)]' : 'hover:text-purple-600'} cursor-pointer`}>
                                    {c.count.toLocaleString('en-IN')}
                                  </button>
                                </td>,
                                <td key={`r_${row.status}_${m}_a`} className={t.dataCell}>
                                  <button type="button" onClick={openCell('amount')} title={`Click to see ${MONTH_NAMES[m - 1] || m} orders for ${row.status}`} className={`${t.cellAmount.replace('text-xs', 'text-sm').replace('mt-0.5', '').replace('font-semibold', 'font-bold')} transition-all duration-150 hover:scale-110 origin-right ${t.isDark ? 'hover:text-fuchsia-300 hover:drop-shadow-[0_0_8px_rgba(232,121,249,0.7)]' : 'hover:text-purple-600'} cursor-pointer`}>
                                    {formatAmount(c.amount)}
                                  </button>
                                </td>,
                                <td key={`r_${row.status}_${m}_b`} className={t.dataCell}>
                                  <button type="button" onClick={openCell('buyers')} title={`Click to see ${MONTH_NAMES[m - 1] || m} buyers for ${row.status}`} className={`text-sm font-bold tabular-nums transition-all duration-150 hover:scale-110 origin-right cursor-pointer ${t.isDark ? 'text-sky-200 hover:text-sky-100 hover:drop-shadow-[0_0_8px_rgba(56,189,248,0.7)]' : 'text-sky-700 hover:text-sky-500'}`}>
                                    {c.buyers.toLocaleString('en-IN')}
                                  </button>
                                </td>,
                              ];
                            })}
                            <td className={t.totalBody} colSpan={3}>
                              <div className="flex items-baseline justify-end gap-3 whitespace-nowrap">
                                <button type="button" onClick={(e) => { e.stopPropagation(); openMbsDrill({ status: row.status, deliveryStatus: undefined, month: null, metric: 'orders' }); }} title={`Click to see all ${row.status} orders`} className={`${t.totalBodyCount} transition-all duration-150 hover:scale-110 origin-right cursor-pointer ${t.isDark ? 'hover:text-fuchsia-300 hover:drop-shadow-[0_0_8px_rgba(232,121,249,0.7)]' : 'hover:text-purple-600'}`}>
                                  {row.total.count.toLocaleString('en-IN')}
                                </button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); openMbsDrill({ status: row.status, deliveryStatus: undefined, month: null, metric: 'amount' }); }} title={`Click to see all ${row.status} orders`} className={`${t.totalBodyAmount} transition-all duration-150 hover:scale-110 origin-right cursor-pointer ${t.isDark ? 'hover:text-fuchsia-300 hover:drop-shadow-[0_0_8px_rgba(232,121,249,0.7)]' : 'hover:text-purple-600'}`}>
                                  {formatAmount(row.total.amount)}
                                </button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); openMbsDrill({ status: row.status, deliveryStatus: undefined, month: null, metric: 'buyers' }); }} title={`Click to see all ${row.status} buyers`} className={`text-xs font-bold tabular-nums transition-all duration-150 hover:scale-110 origin-right cursor-pointer ${t.isDark ? 'text-sky-200 hover:text-sky-100 hover:drop-shadow-[0_0_8px_rgba(56,189,248,0.7)]' : 'text-sky-700 hover:text-sky-500'}`}>
                                  {row.total.buyers.toLocaleString('en-IN')} buyers
                                </button>
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
                                const openCell = (metric: 'orders' | 'amount' | 'buyers') => (e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  openMbsDrill({ status: row.status, deliveryStatus: ds.deliveryStatus, month: m, metric });
                                };
                                const dsLabel = ds.deliveryStatus ?? '(no delivery status)';
                                return [
                                  <td key={`d_${row.status}_${ds.deliveryStatus ?? '_'}_${m}_c`} className={t.dataCell}>
                                    <button type="button" onClick={openCell('orders')} title={`${row.status} · ${dsLabel} · ${MONTH_NAMES[m - 1] || m}`} className={`text-sm font-bold tabular-nums transition-all duration-150 hover:scale-110 origin-right cursor-pointer ${t.isDark ? 'text-purple-100 hover:text-fuchsia-300 hover:drop-shadow-[0_0_6px_rgba(232,121,249,0.6)]' : 'text-slate-700 hover:text-purple-600'}`}>
                                      {c.count.toLocaleString('en-IN')}
                                    </button>
                                  </td>,
                                  <td key={`d_${row.status}_${ds.deliveryStatus ?? '_'}_${m}_a`} className={t.dataCell}>
                                    <button type="button" onClick={openCell('amount')} title={`${row.status} · ${dsLabel} · ${MONTH_NAMES[m - 1] || m}`} className={`text-xs font-semibold tabular-nums transition-all duration-150 hover:scale-110 origin-right cursor-pointer ${t.isDark ? 'text-purple-300/80 hover:text-fuchsia-300 hover:drop-shadow-[0_0_6px_rgba(232,121,249,0.6)]' : 'text-slate-500 hover:text-purple-600'}`}>
                                      {formatAmount(c.amount)}
                                    </button>
                                  </td>,
                                  <td key={`d_${row.status}_${ds.deliveryStatus ?? '_'}_${m}_b`} className={t.dataCell}>
                                    <button type="button" onClick={openCell('buyers')} title={`${row.status} · ${dsLabel} · ${MONTH_NAMES[m - 1] || m}`} className={`text-xs font-semibold tabular-nums transition-all duration-150 hover:scale-110 origin-right cursor-pointer ${t.isDark ? 'text-sky-300/80 hover:text-sky-200 hover:drop-shadow-[0_0_6px_rgba(56,189,248,0.6)]' : 'text-sky-600 hover:text-sky-500'}`}>
                                      {c.buyers.toLocaleString('en-IN')}
                                    </button>
                                  </td>,
                                ];
                              })}
                              <td className={t.totalBody} colSpan={3}>
                                <div className="flex items-baseline justify-end gap-3 whitespace-nowrap">
                                  <button type="button" onClick={(e) => { e.stopPropagation(); openMbsDrill({ status: row.status, deliveryStatus: ds.deliveryStatus, month: null, metric: 'orders' }); }} title={`${row.status} · ${ds.deliveryStatus ?? '(no delivery status)'} · all months`} className={`text-sm font-bold tabular-nums transition-all duration-150 hover:scale-110 origin-right cursor-pointer ${t.isDark ? 'text-purple-100 hover:text-fuchsia-300 hover:drop-shadow-[0_0_6px_rgba(232,121,249,0.6)]' : 'text-slate-700 hover:text-purple-600'}`}>
                                    {ds.total.count.toLocaleString('en-IN')}
                                  </button>
                                  <button type="button" onClick={(e) => { e.stopPropagation(); openMbsDrill({ status: row.status, deliveryStatus: ds.deliveryStatus, month: null, metric: 'amount' }); }} title={`${row.status} · ${ds.deliveryStatus ?? '(no delivery status)'} · all months`} className={`text-xs font-semibold tabular-nums transition-all duration-150 hover:scale-110 origin-right cursor-pointer ${t.isDark ? 'text-purple-300/80 hover:text-fuchsia-300 hover:drop-shadow-[0_0_6px_rgba(232,121,249,0.6)]' : 'text-slate-500 hover:text-purple-600'}`}>
                                    {formatAmount(ds.total.amount)}
                                  </button>
                                  <button type="button" onClick={(e) => { e.stopPropagation(); openMbsDrill({ status: row.status, deliveryStatus: ds.deliveryStatus, month: null, metric: 'buyers' }); }} title={`${row.status} · ${ds.deliveryStatus ?? '(no delivery status)'} · buyers`} className={`text-xs font-semibold tabular-nums transition-all duration-150 hover:scale-110 origin-right cursor-pointer ${t.isDark ? 'text-sky-300/80 hover:text-sky-200 hover:drop-shadow-[0_0_6px_rgba(56,189,248,0.6)]' : 'text-sky-600 hover:text-sky-500'}`}>
                                    {ds.total.buyers.toLocaleString('en-IN')}
                                  </button>
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
                        const monthName = MONTH_NAMES[m - 1] || m;
                        const cellWrap = `border-t border-r ${t.isDark ? 'border-white/10 bg-slate-900' : 'border-slate-200 bg-slate-100'} px-3 py-3 text-right`;
                        return [
                          <td key={`tot_${m}_c`} className={cellWrap}>
                            <button type="button" onClick={() => openMbsDrill({ status: null, deliveryStatus: undefined, month: m, metric: 'orders' })} title={`All statuses · ${monthName} · orders`} className={`${t.cellCount} transition-all duration-150 hover:scale-110 origin-right cursor-pointer ${t.isDark ? 'hover:text-fuchsia-300 hover:drop-shadow-[0_0_8px_rgba(232,121,249,0.7)]' : 'hover:text-purple-600'}`}>{c.count.toLocaleString('en-IN')}</button>
                          </td>,
                          <td key={`tot_${m}_a`} className={cellWrap}>
                            <button type="button" onClick={() => openMbsDrill({ status: null, deliveryStatus: undefined, month: m, metric: 'amount' })} title={`All statuses · ${monthName} · ₹ value`} className={`text-sm font-bold tabular-nums transition-all duration-150 hover:scale-110 origin-right cursor-pointer ${t.isDark ? 'text-white hover:text-fuchsia-300 hover:drop-shadow-[0_0_8px_rgba(232,121,249,0.7)]' : 'text-slate-900 hover:text-purple-600'}`}>{formatAmount(c.amount)}</button>
                          </td>,
                          <td key={`tot_${m}_b`} className={cellWrap}>
                            <button type="button" onClick={() => openMbsDrill({ status: null, deliveryStatus: undefined, month: m, metric: 'buyers' })} title={`All statuses · ${monthName} · buyers`} className={`text-sm font-bold tabular-nums transition-all duration-150 hover:scale-110 origin-right cursor-pointer ${t.isDark ? 'text-sky-200 hover:text-sky-100 hover:drop-shadow-[0_0_8px_rgba(56,189,248,0.7)]' : 'text-sky-700 hover:text-sky-500'}`}>{c.buyers.toLocaleString('en-IN')}</button>
                          </td>,
                        ];
                      })}
                      <td className={t.totalFoot} colSpan={3}>
                        <div className="flex items-baseline justify-end gap-3 whitespace-nowrap">
                          <button type="button" onClick={() => openMbsDrill({ status: null, deliveryStatus: undefined, month: null, metric: 'orders' })} title="All statuses · all months · orders" className={`${t.totalFootCount} transition-all duration-150 hover:scale-110 origin-right cursor-pointer ${t.isDark ? 'hover:text-fuchsia-200 hover:drop-shadow-[0_0_8px_rgba(232,121,249,0.7)]' : 'hover:text-purple-200'}`}>{mbsData.totals.grand.count.toLocaleString('en-IN')}</button>
                          <button type="button" onClick={() => openMbsDrill({ status: null, deliveryStatus: undefined, month: null, metric: 'amount' })} title="All statuses · all months · ₹ value" className={`${t.totalFootAmount} transition-all duration-150 hover:scale-110 origin-right cursor-pointer ${t.isDark ? 'hover:text-fuchsia-200 hover:drop-shadow-[0_0_8px_rgba(232,121,249,0.7)]' : 'hover:text-purple-200'}`}>{formatAmount(mbsData.totals.grand.amount)}</button>
                          <button type="button" onClick={() => openMbsDrill({ status: null, deliveryStatus: undefined, month: null, metric: 'buyers' })} title="All statuses · all months · buyers" className={`text-sm font-bold tabular-nums transition-all duration-150 hover:scale-110 origin-right cursor-pointer ${t.isDark ? 'text-sky-100 hover:text-sky-50 hover:drop-shadow-[0_0_8px_rgba(56,189,248,0.7)]' : 'text-sky-50 hover:text-white'}`}>{mbsData.totals.grand.buyers.toLocaleString('en-IN')} buyers</button>
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
            <div className="flex flex-col gap-4 mb-6">
              {/* KPI strip — slim row across the top */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {tiles.map((tile, idx) => (
                  <div
                    key={idx}
                    className={`relative rounded-xl p-3 border overflow-hidden transition-all duration-300 hover:-translate-y-0.5 ${tile.cls.bg} ${tile.cls.border} ${t.isDark ? 'backdrop-blur-xl hover:shadow-[0_0_40px_rgba(217,70,239,0.18)]' : 'shadow-sm hover:shadow-md'}`}
                  >
                    {t.isDark && <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] via-transparent to-transparent pointer-events-none" />}
                    <div className="relative">
                      <div className="flex items-center justify-between gap-2">
                        <div className={`text-[10px] uppercase tracking-[0.15em] font-bold ${tile.cls.label}`}>{tile.label}</div>
                        {tile.pctLabel && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${tile.cls.chip} whitespace-nowrap`}>
                            {tile.pctLabel}
                          </span>
                        )}
                      </div>
                      <div className="flex items-baseline gap-2 mt-1">
                        <div className={`text-2xl font-black tabular-nums tracking-tight leading-none ${tile.cls.count}`} title={String(tile.count)}>
                          {tile.count.toLocaleString('en-IN')}
                        </div>
                        <div className={`text-sm font-bold tabular-nums tracking-tight leading-none ${tile.cls.amount}`}>
                          {formatAmount(tile.amount)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Map + scrollable states list (full width, taller) */}
              <div className={t.sectionCard}>
                <div className={t.sectionAccent} />
                <div className={t.sectionHeader}>
                  <div>
                    <h2 className={`${t.h2} text-lg`}>Where they sell</h2>
                    <p className={`${t.p} mt-1`}>
                      State-wise delivered orders. Click any state on the map (or a row in the list) to drill into city-level breakdown.
                      {mbsBrands.size === 0
                        ? ' Showing all brands.'
                        : mbsBrands.size === 1
                          ? <> Filtered to <span className={t.isDark ? 'text-fuchsia-300 font-semibold' : 'text-purple-700 font-semibold'}>{Array.from(mbsBrands)[0]}</span>.</>
                          : <> Filtered to <span className={t.isDark ? 'text-fuchsia-300 font-semibold' : 'text-purple-700 font-semibold'}>{mbsBrands.size} brands</span>.</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                  {queryBtn(showSellerPins ? ['map', 'sellerLocs'] : 'map', 'Where they sell — state-wise')}
                  {/* Seller hubs overlay toggle */}
                  <button
                    onClick={() => setShowSellerPins((v) => !v)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border ${
                      showSellerPins
                        ? (t.isDark ? 'bg-amber-400/20 text-amber-200 border-amber-300/40 shadow-sm' : 'bg-amber-100 text-amber-700 border-amber-300')
                        : (t.isDark ? 'bg-white/5 text-purple-200 border-white/10 hover:bg-white/10' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-white')
                    }`}
                    title="Plot each seller at their operating location (lat/long)"
                  >
                    <span className={`w-2 h-2 rounded-full ${showSellerPins ? 'bg-amber-300' : 'bg-amber-400/50'}`} />
                    Seller hubs
                    {showSellerPins && sellerLocData && (
                      <span className="opacity-80">({sellerLocData.length})</span>
                    )}
                  </button>
                  <div className={`inline-flex gap-1 p-1 rounded-lg ${t.isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-100 border border-slate-200'}`}>
                    {(['count', 'amount'] as const).map((m) => {
                      const active = mapMetric === m;
                      return (
                        <button
                          key={m}
                          onClick={() => setMapMetric(m)}
                          className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all ${active ? (t.isDark ? 'bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white shadow-sm' : 'bg-purple-600 text-white shadow-sm') : (t.isDark ? 'text-purple-200 hover:bg-white/10' : 'text-slate-600 hover:bg-white')}`}
                        >
                          {m === 'count' ? 'By orders' : 'By GMV'}
                        </button>
                      );
                    })}
                  </div>
                  </div>
                </div>
                <div className="p-4">
                  {mapLoading || !mapData ? (
                    <div className={`h-[640px] flex items-center justify-center ${t.isDark ? 'text-purple-300' : 'text-slate-500'}`}>
                      <div className="flex flex-col items-center gap-3">
                        <div className={`w-8 h-8 rounded-full border-2 ${t.isDark ? 'border-fuchsia-500/30 border-t-fuchsia-500' : 'border-purple-300 border-t-purple-600'} animate-spin`} />
                        <span className="text-xs">Loading map…</span>
                      </div>
                    </div>
                  ) : mapData.length === 0 ? (
                    <div className={`h-[640px] flex items-center justify-center text-sm ${t.isDark ? 'text-purple-300' : 'text-slate-500'}`}>
                      No delivered orders for this selection
                    </div>
                  ) : (
                    <MapErrorBoundary label="Where they sell">
                      <IndiaStateMap
                        data={mapData}
                        metric={mapMetric}
                        showAllStatesScrollable
                        selectedState={selectedMapState}
                        onStateClick={(name) => { setSelectedMapState(name === selectedMapState ? null : name); setCitySearch(''); }}
                        sellerPoints={showSellerPins ? (sellerLocData ?? undefined) : undefined}
                      />
                    </MapErrorBoundary>
                  )}
                  {showSellerPins && (
                    <div className={`mt-3 flex items-center gap-2 text-[11px] ${t.isDark ? 'text-amber-200/80' : 'text-amber-700'}`}>
                      <span className="inline-block w-3 h-3 rounded-full bg-amber-400/55 border border-amber-300" />
                      {sellerLocLoading
                        ? 'Loading seller locations…'
                        : sellerLocData
                          ? <>Each pin is a seller plotted at their operating location · sized by {mapMetric === 'count' ? 'order count' : 'GMV'} · {sellerLocData.length.toLocaleString('en-IN')} sellers with coordinates.</>
                          : 'No seller coordinates available for this selection.'}
                    </div>
                  )}
                </div>
              </div>

              {/* Delivery flow — animated warehouse → delivery-city routes for the selected brand */}
              <div className={t.sectionCard}>
                <div className={t.sectionAccent} />
                <div className={t.sectionHeader}>
                  <div>
                    <h2 className={`${t.h2} text-lg`}>Delivery flow</h2>
                    <p className={`${t.p} mt-1`}>
                      Animated shipment routes from a brand’s warehouse to every city it delivered to.
                      {mbsBrands.size === 0
                        ? ' Select a brand above to play it.'
                        : mbsBrands.size === 1
                          ? <> Showing <span className={t.isDark ? 'text-amber-300 font-semibold' : 'text-amber-700 font-semibold'}>{Array.from(mbsBrands)[0]}</span>.</>
                          : <> Showing <span className={t.isDark ? 'text-amber-300 font-semibold' : 'text-amber-700 font-semibold'}>{mbsBrands.size} brands</span>.</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {mbsBrands.size > 0 && queryBtn('flows', 'Delivery flow — warehouse → cities')}
                  </div>
                </div>
                <div className="p-4">
                  {mbsBrands.size === 0 ? (
                    <div className={`h-[420px] flex flex-col items-center justify-center gap-3 text-center ${t.isDark ? 'text-purple-300' : 'text-slate-500'}`}>
                      <span className="text-4xl">🚚</span>
                      <div className="text-sm font-semibold">Pick a brand to see its delivery network</div>
                      <div className="text-xs max-w-sm opacity-80">Use the brand selector on the “Where they sell” card above. Routes animate from the brand’s warehouse to each delivery city, thicker where more orders landed.</div>
                    </div>
                  ) : flowLoading || !flowData ? (
                    <div className={`h-[640px] flex items-center justify-center ${t.isDark ? 'text-purple-300' : 'text-slate-500'}`}>
                      <div className="flex flex-col items-center gap-3">
                        <div className={`w-8 h-8 rounded-full border-2 ${t.isDark ? 'border-amber-500/30 border-t-amber-400' : 'border-amber-300 border-t-amber-600'} animate-spin`} />
                        <span className="text-xs">Plotting delivery routes…</span>
                      </div>
                    </div>
                  ) : flowData.origins.length === 0 || flowData.destinations.length === 0 ? (
                    <div className={`h-[420px] flex items-center justify-center text-sm ${t.isDark ? 'text-purple-300' : 'text-slate-500'}`}>
                      No warehouse coordinates or delivered orders for this selection.
                    </div>
                  ) : (
                    <MapErrorBoundary label="Delivery flow">
                      <DeliveryFlowMap
                        origins={flowData.origins}
                        destinations={flowData.destinations}
                        metric={mapMetric}
                        brandLabel={mbsBrands.size === 1 ? Array.from(mbsBrands)[0] : `${mbsBrands.size} brands`}
                      />
                    </MapErrorBoundary>
                  )}
                </div>
              </div>

              {/* City drill-down panel — shown when a state is selected */}
              {selectedMapState && (
                <div className={t.sectionCard}>
                  <div className={t.sectionAccent} />
                  <div className={t.sectionHeader}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={t.sectionTag('details')}>CITIES</span>
                        <h2 className={`${t.h2} text-lg`}>{selectedMapState}</h2>
                        {cityData && (
                          <span className={`text-[11px] ${t.isDark ? 'text-purple-300/70' : 'text-slate-500'}`}>
                            {cityData.data.length} cities · {cityData.grand.count.toLocaleString('en-IN')} orders · {formatAmount(cityData.grand.amount)} · {cityData.grand.buyers.toLocaleString('en-IN')} buyers
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {queryBtn('city', 'City drill-down')}
                      <input
                        type="text"
                        value={citySearch}
                        onChange={(e) => setCitySearch(e.target.value)}
                        placeholder="Search city or district…"
                        className={t.searchInput.replace('ml-auto', '').replace('min-w-[220px]', 'min-w-[200px]')}
                      />
                      {cityData && cityData.data.length > 0 && (
                        <button
                          className={t.csvBtn}
                          onClick={() => {
                            if (!cityData) return;
                            downloadCSV(
                              `cities-${selectedMapState.toLowerCase().replace(/\s+/g, '-')}-${currentYear}.csv`,
                              ['City', 'District', 'Orders', 'GMV', 'Buyers'],
                              cityData.data.map((r) => [r.city ?? '', r.district ?? '', r.count, r.amount, r.buyers]),
                            );
                          }}
                        >
                          ↓ CSV
                        </button>
                      )}
                      <button
                        onClick={() => { setSelectedMapState(null); setCityData(null); }}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold ${t.isDark ? 'bg-rose-500/15 text-rose-200 border border-rose-400/30 hover:bg-rose-500/25' : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'}`}
                      >
                        ✕ Close
                      </button>
                    </div>
                  </div>
                  <div className="overflow-auto" style={{ maxHeight: 520 }}>
                    {cityLoading ? (
                      <div className={`px-8 py-12 text-center text-sm ${t.isDark ? 'text-purple-300' : 'text-slate-500'}`}>Loading cities…</div>
                    ) : !cityData || cityData.data.length === 0 ? (
                      <div className={`px-8 py-12 text-center text-sm ${t.isDark ? 'text-purple-300' : 'text-slate-500'}`}>No delivered orders in {selectedMapState}</div>
                    ) : (() => {
                      const q = citySearch.trim().toLowerCase();
                      const visible = q
                        ? cityData.data.filter((r) => (r.city ?? '').toLowerCase().includes(q) || (r.district ?? '').toLowerCase().includes(q))
                        : cityData.data;
                      const max = cityData.data[0]?.count || 1;
                      const total = visible.length;
                      const pages = Math.max(1, Math.ceil(total / citySize));
                      const page  = Math.min(cityPage, pages);
                      const paged = visible.slice((page - 1) * citySize, page * citySize);
                      return (
                        <>
                        <table className="w-full text-sm border-separate border-spacing-0">
                          <thead className={`sticky top-0 z-10 ${t.isDark ? 'bg-slate-900/95 backdrop-blur' : 'bg-white'}`}>
                            <tr>
                              <th className={`${t.brandCell} text-left text-[10px] font-semibold uppercase tracking-wider ${t.isDark ? 'text-purple-200' : 'text-slate-500'}`}>City · District</th>
                              <th className={`${t.deliveryHeader} text-right`}>Orders</th>
                              <th className={`${t.deliveryHeader} text-right`}>₹ Value</th>
                              <th className={`${t.deliveryHeader} text-right`}>Buyers</th>
                              <th className={`${t.deliveryHeader} text-right min-w-[140px]`}>Share</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paged.map((r, idx) => {
                              const absIdx = (page - 1) * citySize + idx;
                              const pct = max > 0 ? (r.count / max) * 100 : 0;
                              return (
                                <tr key={`${r.city ?? ''}_${r.district ?? ''}_${idx}`} className={`${absIdx % 2 === 0 ? t.rowEven : t.rowOdd} ${t.rowHover}`}>
                                  <td className={t.brandCell.replace('py-3', 'py-1.5')}>
                                    <div className="flex items-center gap-2">
                                      <span className={t.brandRowNum}>{absIdx + 1}</span>
                                      <div className="flex flex-col">
                                        <span className={`${t.brandName} text-xs`}>{r.city || '—'}</span>
                                        <span className={`text-[10px] ${t.isDark ? 'text-purple-300/60' : 'text-slate-400'}`}>{r.district || '—'}</span>
                                      </div>
                                    </div>
                                  </td>
                                  <td className={t.dataCell.replace('py-3', 'py-1.5')}>
                                    <div className={`text-sm font-extrabold tabular-nums ${t.isDark ? 'text-white' : 'text-slate-900'}`}>{r.count.toLocaleString('en-IN')}</div>
                                  </td>
                                  <td className={t.dataCell.replace('py-3', 'py-1.5')}>
                                    <div className={`text-xs font-bold tabular-nums ${t.isDark ? 'text-purple-200' : 'text-slate-700'}`}>{formatAmount(r.amount)}</div>
                                  </td>
                                  <td className={t.dataCell.replace('py-3', 'py-1.5')}>
                                    <div className={`text-xs font-bold tabular-nums ${t.isDark ? 'text-sky-200' : 'text-sky-700'}`}>{r.buyers.toLocaleString('en-IN')}</div>
                                  </td>
                                  <td className={t.dataCell.replace('py-3', 'py-1.5')}>
                                    <div className="flex items-center justify-end gap-2">
                                      <div className={`relative h-1.5 w-20 rounded-full overflow-hidden ${t.isDark ? 'bg-white/10' : 'bg-slate-200'}`}>
                                        <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500" style={{ width: `${pct}%` }} />
                                      </div>
                                      <span className={`text-[10px] font-bold tabular-nums ${t.isDark ? 'text-fuchsia-200' : 'text-purple-700'}`}>{pct.toFixed(1)}%</span>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {total > 0 && (
                          <div className={`px-6 py-2 border-t flex items-center justify-between gap-3 text-xs flex-wrap ${t.isDark ? 'border-white/10 bg-white/5 text-purple-200' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                            <div>Showing <span className={t.isDark ? 'text-white font-bold' : 'text-slate-900 font-bold'}>{((page - 1) * citySize + 1).toLocaleString('en-IN')}–{Math.min(page * citySize, total).toLocaleString('en-IN')}</span> of {total.toLocaleString('en-IN')} cities</div>
                            <div className="flex items-center gap-2">
                              <span>Rows / page</span>
                              <select value={citySize} onChange={(e) => setCitySize(parseInt(e.target.value))} className={`px-2 py-1 rounded ${t.isDark ? 'bg-white/10 border border-white/20 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}>
                                {[25, 50, 100, 250].map((s) => <option key={s} value={s}>{s}</option>)}
                              </select>
                              <button onClick={() => setCityPage(1)} disabled={page === 1} className={`px-2 py-1 rounded font-bold ${page === 1 ? 'opacity-40' : ''} ${t.isDark ? 'bg-white/10 border border-white/20 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}>«</button>
                              <button onClick={() => setCityPage((p) => Math.max(1, p - 1))} disabled={page === 1} className={`px-2 py-1 rounded font-bold ${page === 1 ? 'opacity-40' : ''} ${t.isDark ? 'bg-white/10 border border-white/20 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}>‹</button>
                              <span className={t.isDark ? 'text-white font-bold' : 'text-slate-900 font-bold'}>{page} / {pages}</span>
                              <button onClick={() => setCityPage((p) => Math.min(pages, p + 1))} disabled={page === pages} className={`px-2 py-1 rounded font-bold ${page === pages ? 'opacity-40' : ''} ${t.isDark ? 'bg-white/10 border border-white/20 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}>›</button>
                              <button onClick={() => setCityPage(pages)} disabled={page === pages} className={`px-2 py-1 rounded font-bold ${page === pages ? 'opacity-40' : ''} ${t.isDark ? 'bg-white/10 border border-white/20 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}>»</button>
                            </div>
                          </div>
                        )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

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
            <div className="flex items-center gap-3">
            {queryBtn('pivot', 'Brand × Month × Status')}
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
            {(range !== 'year' || customFrom || customTo) && (
              <button
                onClick={() => { setRange('year'); setCustomFrom(''); setCustomTo(''); }}
                className={`px-2 py-1 rounded-md text-[10px] font-bold ${t.isDark ? 'bg-rose-500/15 text-rose-200 border border-rose-400/30 hover:bg-rose-500/25' : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'}`}
                title="Reset to full year"
              >
                ✕ Clear date
              </button>
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
                  {visibleBrands.map((br, idx) => {
                    const brandCellCompact = t.brandCell.replace('py-3', 'py-1');
                    const dataCellCompact = t.dataCell.replace('py-3', 'py-1');
                    const emptyCellCompact = t.emptyCell.replace('py-3', 'py-1').replace('text-base', 'text-xs');
                    const totalBodyCompact = t.totalBody.replace('py-3', 'py-1');
                    const cellCountCompact = t.cellCount.replace('text-base', 'text-xs');
                    const totalBodyCountCompact = t.totalBodyCount.replace('text-base', 'text-xs');
                    const totalBodyAmountCompact = t.totalBodyAmount.replace('text-xs', 'text-[10px]');
                    const cellAmountCompact = t.cellAmount.replace('text-xs', 'text-[10px]').replace('mt-0.5', '');
                    const openCell = (status: string, dStatus: string | null | undefined, month: number | null, metric: 'orders' | 'amount') =>
                      openMbsDrill({ status, deliveryStatus: dStatus, month, metric, brandOverride: br.brandName });
                    return (
                      <tr key={br.brandName} className={`${idx % 2 === 0 ? t.rowEven : t.rowOdd} ${t.rowHover}`}>
                        <td className={brandCellCompact}>
                          <div className="flex items-center gap-2">
                            <span className={t.brandRowNum}>{idx + 1}</span>
                            <span className={t.brandAccent} />
                            <span className={`${t.brandName} text-xs`}>{br.brandName}</span>
                          </div>
                        </td>
                        {pivotData.months.flatMap((m) => pivotData.statusColumns.flatMap((sc) => {
                          if (!expandedStatuses.has(sc.status)) {
                            const cell = brandMonthStatusCell(br, m, sc.status);
                            if (!cell || cell.count === 0) {
                              return [<td key={`c_${br.brandName}_${m}_${sc.status}`} className={emptyCellCompact}>—</td>];
                            }
                            const tip = `${br.brandName} · ${MONTH_NAMES[m - 1] || m} · ${sc.status}`;
                            return [
                              <td key={`c_${br.brandName}_${m}_${sc.status}`} className={dataCellCompact}>
                                <button type="button" onClick={() => openCell(sc.status, undefined, m, 'orders')} title={`${tip} · orders`} className={`${cellCountCompact} transition-all duration-150 hover:scale-110 origin-right cursor-pointer ${t.isDark ? 'hover:text-fuchsia-300 hover:drop-shadow-[0_0_6px_rgba(232,121,249,0.6)]' : 'hover:text-purple-600'}`}>
                                  {cell.count.toLocaleString('en-IN')}
                                </button>
                                <button type="button" onClick={() => openCell(sc.status, undefined, m, 'amount')} title={`${tip} · ₹ value`} className={`block w-full text-right ${cellAmountCompact} transition-all duration-150 hover:scale-110 origin-right cursor-pointer ${t.isDark ? 'hover:text-fuchsia-300 hover:drop-shadow-[0_0_6px_rgba(232,121,249,0.6)]' : 'hover:text-purple-600'}`}>
                                  {formatAmount(cell.amount)}
                                </button>
                              </td>,
                            ];
                          }
                          return sc.deliveryStatuses.map((ds, dIdx) => {
                            const dKey = ds.deliveryStatus ?? '__NULL__';
                            const cell = brandMonthStatusDeliveryCell(br, m, sc.status, dKey);
                            if (!cell || cell.count === 0) {
                              return (<td key={`c_${br.brandName}_${m}_${sc.status}_${dKey}_${dIdx}`} className={emptyCellCompact}>—</td>);
                            }
                            const dsLabel = ds.deliveryStatus ?? '(no delivery status)';
                            const tip = `${br.brandName} · ${MONTH_NAMES[m - 1] || m} · ${sc.status} · ${dsLabel}`;
                            return (
                              <td key={`c_${br.brandName}_${m}_${sc.status}_${dKey}_${dIdx}`} className={dataCellCompact}>
                                <button type="button" onClick={() => openCell(sc.status, ds.deliveryStatus, m, 'orders')} title={`${tip} · orders`} className={`${cellCountCompact} transition-all duration-150 hover:scale-110 origin-right cursor-pointer ${t.isDark ? 'hover:text-fuchsia-300 hover:drop-shadow-[0_0_6px_rgba(232,121,249,0.6)]' : 'hover:text-purple-600'}`}>
                                  {cell.count.toLocaleString('en-IN')}
                                </button>
                                <button type="button" onClick={() => openCell(sc.status, ds.deliveryStatus, m, 'amount')} title={`${tip} · ₹ value`} className={`block w-full text-right ${cellAmountCompact} transition-all duration-150 hover:scale-110 origin-right cursor-pointer ${t.isDark ? 'hover:text-fuchsia-300 hover:drop-shadow-[0_0_6px_rgba(232,121,249,0.6)]' : 'hover:text-purple-600'}`}>
                                  {formatAmount(cell.amount)}
                                </button>
                              </td>
                            );
                          });
                        }))}
                        <td className={totalBodyCompact}>
                          {/* Brand totals span all statuses — drill on Total picks REJECTED as a starting status (most common); user can switch via the in-modal Status switcher. */}
                          <button type="button" onClick={() => openMbsDrill({ status: (pivotData.statusColumns[0]?.status ?? 'REJECTED'), deliveryStatus: undefined, month: null, metric: 'orders', brandOverride: br.brandName })} title={`${br.brandName} · all months · drill`} className={`${totalBodyCountCompact} transition-all duration-150 hover:scale-110 origin-right cursor-pointer ${t.isDark ? 'hover:text-fuchsia-300 hover:drop-shadow-[0_0_6px_rgba(232,121,249,0.6)]' : 'hover:text-purple-600'}`}>
                            {br.total.count.toLocaleString('en-IN')}
                          </button>
                          <div className={totalBodyAmountCompact}>{formatAmount(br.total.amount)}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className={t.footRow}>
                  <tr>
                    <td className={t.footLabel.replace('py-3', 'py-1')}>Total</td>
                    {pivotData.months.flatMap((m) => pivotData.statusColumns.flatMap((sc) => {
                      if (!expandedStatuses.has(sc.status)) {
                        const v = pivotData.monthStatusTotals[`${m}__${sc.status}`] ?? { count: 0, amount: 0 };
                        return [
                          <td key={`t_${m}_${sc.status}`} className={`border-t border-r ${t.isDark ? 'border-white/10 bg-slate-900' : 'border-slate-200 bg-slate-100'} px-3 py-1 text-right whitespace-nowrap`}>
                            <div className={t.cellCount.replace('text-base', 'text-xs')}>{v.count.toLocaleString('en-IN')}</div>
                            <div className={t.cellAmount.replace('text-xs', 'text-[10px]').replace('mt-0.5', '')}>{formatAmount(v.amount)}</div>
                          </td>,
                        ];
                      }
                      return sc.deliveryStatuses.map((ds, dIdx) => {
                        const dKey = ds.deliveryStatus ?? '__NULL__';
                        const v = pivotData.monthStatusDeliveryTotals[`${m}__${sc.status}__${dKey}`] ?? { count: 0, amount: 0 };
                        return (
                          <td key={`t_${m}_${sc.status}_${dKey}_${dIdx}`} className={`border-t border-r ${t.isDark ? 'border-white/10 bg-slate-900' : 'border-slate-200 bg-slate-100'} px-3 py-1 text-right whitespace-nowrap`}>
                            <div className={t.cellCount.replace('text-base', 'text-xs')}>{v.count.toLocaleString('en-IN')}</div>
                            <div className={t.cellAmount.replace('text-xs', 'text-[10px]').replace('mt-0.5', '')}>{formatAmount(v.amount)}</div>
                          </td>
                        );
                      });
                    }))}
                    <td className={t.totalFoot.replace('py-3', 'py-1')}>
                      <div className={t.totalFootCount.replace('text-lg', 'text-sm')}>{pivotData.grand.count.toLocaleString('en-IN')}</div>
                      <div className={t.totalFootAmount.replace('text-sm', 'text-[11px]').replace('mt-0.5', '')}>{formatAmount(pivotData.grand.amount)}</div>
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

        {bpTab === 'product' && (() => {
          const visibleProducts = (() => {
            if (!productData) return [];
            const q = productSearch.trim().toLowerCase();
            if (!q) return productData.data;
            return productData.data.filter(
              (p) =>
                p.skuLabel.toLowerCase().includes(q) ||
                (p.brandName ?? '').toLowerCase().includes(q) ||
                (p.size ?? '').toLowerCase().includes(q),
            );
          })();
          return (
        <div className={t.sectionCard}>
          <div className={t.sectionAccent} />
          <div className={`px-6 py-2 flex items-center gap-2 ${t.isDark ? 'bg-white/5 border-b border-white/10' : 'bg-slate-50 border-b border-slate-200'}`}>
            <span className={t.sectionTag('details')}>PRODUCT</span>
            <h2 className={`text-base font-bold ${t.isDark ? 'text-white' : 'text-slate-900'}`}>Product × Month</h2>
            <span className={`text-[11px] ${t.isDark ? 'text-purple-300/70' : 'text-slate-500'}`}>delivered + completed orders · top {productData?.limit ?? 300} SKUs by ₹ value</span>
            <div className="ml-auto">{queryBtn('products', 'Product × Month')}</div>
          </div>

          <div className={`px-6 py-2 border-b flex items-center gap-2 flex-wrap ${t.isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}>
            <span className={t.chipLabel}>Date</span>
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
            {(range !== 'year' || customFrom || customTo) && (
              <button
                onClick={() => { setRange('year'); setCustomFrom(''); setCustomTo(''); }}
                className={`px-2 py-1 rounded-md text-[10px] font-bold ${t.isDark ? 'bg-rose-500/15 text-rose-200 border border-rose-400/30 hover:bg-rose-500/25' : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'}`}
                title="Reset to full year"
              >
                ✕ Clear date
              </button>
            )}
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMbsBrandDropdownOpen((v) => !v)}
                  className={`min-w-[180px] px-3 py-1.5 text-xs rounded-lg text-left flex items-center justify-between gap-2 ${t.isDark ? 'bg-white/10 border border-white/20 text-white hover:bg-white/15' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'} focus:outline-none focus:ring-2 focus:ring-purple-400`}
                >
                  <span className="truncate font-semibold">
                    {mbsBrands.size === 0 && <span className={t.isDark ? 'text-purple-300/70' : 'text-slate-400'}>All brands</span>}
                    {mbsBrands.size === 1 && Array.from(mbsBrands)[0]}
                    {mbsBrands.size > 1 && <span className={t.isDark ? 'text-fuchsia-200' : 'text-purple-700'}>{mbsBrands.size} brands</span>}
                  </span>
                  <span className={t.isDark ? 'text-purple-300 text-[10px]' : 'text-slate-400 text-[10px]'}>▾</span>
                </button>
                {mbsBrandDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-[55]" onClick={() => setMbsBrandDropdownOpen(false)} />
                    <div className={`absolute top-full right-0 mt-1 z-[60] w-[340px] max-h-[420px] rounded-lg shadow-2xl flex flex-col overflow-hidden ${t.isDark ? 'bg-slate-950 border border-white/15' : 'bg-white border border-slate-200'}`}>
                      <div className={`p-2 border-b flex items-center gap-2 ${t.isDark ? 'bg-slate-950 border-white/10' : 'bg-white border-slate-200'}`}>
                        <input
                          type="text"
                          autoFocus
                          value={mbsBrandSearch}
                          onChange={(e) => setMbsBrandSearch(e.target.value)}
                          placeholder="Search brand…"
                          className={t.searchInput.replace('ml-auto', '').replace('min-w-[220px]', 'flex-1 min-w-0')}
                        />
                        {mbsBrands.size > 0 && (
                          <button
                            type="button"
                            onClick={() => setMbsBrands(new Set())}
                            className={`px-2 py-1.5 text-[10px] font-bold rounded border whitespace-nowrap ${t.isDark ? 'bg-rose-500/20 text-rose-200 border-rose-400/40 hover:bg-rose-500/30' : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'}`}
                          >
                            Clear all
                          </button>
                        )}
                      </div>
                      <div className={`overflow-y-auto flex-1 ${t.isDark ? 'bg-slate-950' : 'bg-white'}`}>
                        {(() => {
                          const allBrands = pivotData?.brands?.map((b) => b.brandName) ?? [];
                          const q = mbsBrandSearch.trim().toLowerCase();
                          const filtered = q ? allBrands.filter((n) => n.toLowerCase().includes(q)) : allBrands;
                          if (filtered.length === 0) {
                            return <div className={`px-3 py-4 text-xs ${t.isDark ? 'bg-slate-950 text-purple-300/60' : 'bg-white text-slate-400'}`}>No matches</div>;
                          }
                          const toggle = (name: string) => {
                            setMbsBrands((prev) => {
                              const next = new Set(prev);
                              if (next.has(name)) next.delete(name); else next.add(name);
                              return next;
                            });
                          };
                          return filtered.map((name) => {
                            const checked = mbsBrands.has(name);
                            return (
                              <label
                                key={name}
                                className={`flex items-center gap-2 px-3 py-2 text-xs border-b cursor-pointer ${t.isDark ? 'bg-slate-950 border-white/5 hover:bg-white/10' : 'bg-white border-slate-100 hover:bg-slate-100'} ${checked ? (t.isDark ? 'bg-fuchsia-500/15' : 'bg-purple-50') : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggle(name)}
                                  className="accent-fuchsia-500 w-3.5 h-3.5"
                                />
                                <span className={checked ? (t.isDark ? 'text-fuchsia-200 font-semibold' : 'text-purple-700 font-semibold') : (t.isDark ? 'text-white' : 'text-slate-800')}>
                                  {name}
                                </span>
                              </label>
                            );
                          });
                        })()}
                      </div>
                      <div className={`p-2 border-t flex items-center justify-between gap-2 ${t.isDark ? 'bg-slate-950 border-white/10' : 'bg-white border-slate-200'}`}>
                        <span className={`text-[10px] ${t.isDark ? 'text-purple-300/70' : 'text-slate-500'}`}>
                          {mbsBrands.size === 0 ? 'no filter — showing all brands' : `${mbsBrands.size} selected`}
                        </span>
                        <button
                          type="button"
                          onClick={() => setMbsBrandDropdownOpen(false)}
                          className="px-3 py-1 text-[11px] font-semibold rounded bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white shadow-sm"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
              {mbsBrands.size > 0 && (
                <button
                  onClick={() => setMbsBrands(new Set())}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold ${t.isDark ? 'bg-rose-500/15 text-rose-200 border border-rose-400/30 hover:bg-rose-500/25' : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'}`}
                  title="Clear brand filter"
                >
                  ✕
                </button>
              )}
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search product / brand / size…"
                className={t.searchInput.replace('ml-auto', '').replace('min-w-[220px]', 'min-w-[180px]')}
              />
              {productData && (
                <button
                  className={t.csvBtn}
                  onClick={() => {
                    if (!productData) return;
                    const headers = ['Brand', 'Product', 'Size', 'Month', 'Orders', 'GMV', 'Distinct Buyers', 'Quantity'];
                    const rows: CsvCell[][] = [];
                    for (const p of productData.data) {
                      for (const m of productData.months) {
                        const c = p.months[m];
                        if (!c || c.count === 0) continue;
                        rows.push([p.brandName ?? '', p.skuLabel, p.size ?? '', MONTH_NAMES[m - 1] || m, c.count, c.amount, c.buyers, c.quantity]);
                      }
                    }
                    const suffix = mbsBrands.size === 0
                      ? 'all-brands'
                      : mbsBrands.size === 1
                        ? Array.from(mbsBrands)[0].toLowerCase().replace(/\s+/g, '-')
                        : `${mbsBrands.size}-brands`;
                    downloadCSV(`product-by-month-${suffix}-${currentYear}.csv`, headers, rows);
                  }}
                >
                  ↓ CSV
                </button>
              )}
            </div>
          </div>

          <div className={t.tableWrap}>
            {productLoading || !productData ? (
              <div className={t.loading}>Loading…</div>
            ) : visibleProducts.length === 0 ? (
              <div className={t.loading}>No products for this selection</div>
            ) : (() => {
              const months = productData.months;
              return (
                <table className="w-full text-sm border-separate border-spacing-0">
                  <thead className={`sticky top-0 z-20 ${t.isDark ? 'bg-slate-900/95 backdrop-blur' : 'bg-white'}`}>
                    <tr>
                      <th rowSpan={2} className={`${t.brandCell} text-left font-semibold uppercase tracking-wider min-w-[280px] ${t.isDark ? 'text-purple-200' : 'text-slate-500'}`}>
                        Product
                      </th>
                      {months.map((m) => (
                        <th key={`pmh_${m}`} colSpan={3} className={t.monthHeader}>
                          {MONTH_NAMES[m - 1] || m}
                        </th>
                      ))}
                      <th rowSpan={2} colSpan={3} className={t.totalHeader}>Total</th>
                    </tr>
                    <tr>
                      {months.flatMap((m) => [
                        <th key={`ps_${m}_c`} className={`${t.deliveryHeader} text-right`}>Orders</th>,
                        <th key={`ps_${m}_a`} className={`${t.deliveryHeader} text-right`}>₹ Value</th>,
                        <th key={`ps_${m}_b`} className={`${t.deliveryHeader} text-right`}>Buyers</th>,
                      ])}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleProducts.map((p, idx) => {
                      const brandCellCompact = t.brandCell.replace('py-3', 'py-1.5');
                      const dataCellCompact = t.dataCell.replace('py-3', 'py-1.5');
                      const emptyCellCompact = t.emptyCell.replace('py-3', 'py-1.5').replace('text-base', 'text-xs');
                      const totalBodyCompact = t.totalBody.replace('py-3', 'py-1.5');
                      return (
                      <tr key={p.skuId} className={`${idx % 2 === 0 ? t.rowEven : t.rowOdd} ${t.rowHover}`}>
                        <td className={brandCellCompact}>
                          <div className="flex items-center gap-2">
                            <span className={t.brandRowNum}>{idx + 1}</span>
                            <span className={t.brandAccent} />
                            <span className={`${t.brandName} text-xs`}>{p.skuLabel}</span>
                            <span className={`text-[10px] ${t.isDark ? 'text-purple-300/60' : 'text-slate-400'} truncate`}>
                              · {p.brandName ?? '—'}{p.size ? ` · ${p.size}` : ''}
                            </span>
                          </div>
                        </td>
                        {months.flatMap((m) => {
                          const c = p.months[m];
                          if (!c || c.count === 0) {
                            return [
                              <td key={`pr_${p.skuId}_${m}_c`} className={emptyCellCompact}>—</td>,
                              <td key={`pr_${p.skuId}_${m}_a`} className={emptyCellCompact}>—</td>,
                              <td key={`pr_${p.skuId}_${m}_b`} className={emptyCellCompact}>—</td>,
                            ];
                          }
                          const openCell = (metric: 'orders' | 'amount' | 'buyers') => () =>
                            openProductDrill({ skuId: p.skuId, skuLabel: p.skuLabel, brandName: p.brandName, size: p.size, month: m, metric });
                          const tip = `${p.skuLabel}${p.brandName ? ` · ${p.brandName}` : ''} · ${MONTH_NAMES[m - 1] || m}`;
                          return [
                            <td key={`pr_${p.skuId}_${m}_c`} className={dataCellCompact}>
                              <button type="button" onClick={openCell('orders')} title={`${tip} · orders`} className={`text-sm font-extrabold tabular-nums leading-tight transition-all duration-150 hover:scale-110 origin-right cursor-pointer ${t.isDark ? 'text-white hover:text-fuchsia-300 hover:drop-shadow-[0_0_6px_rgba(232,121,249,0.6)]' : 'text-slate-900 hover:text-purple-600'}`}>
                                {c.count.toLocaleString('en-IN')}
                              </button>
                            </td>,
                            <td key={`pr_${p.skuId}_${m}_a`} className={dataCellCompact}>
                              <button type="button" onClick={openCell('amount')} title={`${tip} · ₹ value`} className={`text-xs font-bold tabular-nums transition-all duration-150 hover:scale-110 origin-right cursor-pointer ${t.isDark ? 'text-purple-200 hover:text-fuchsia-300 hover:drop-shadow-[0_0_6px_rgba(232,121,249,0.6)]' : 'text-slate-700 hover:text-purple-600'}`}>
                                {formatAmount(c.amount)}
                              </button>
                            </td>,
                            <td key={`pr_${p.skuId}_${m}_b`} className={dataCellCompact}>
                              <button type="button" onClick={openCell('buyers')} title={`${tip} · buyers`} className={`text-xs font-bold tabular-nums transition-all duration-150 hover:scale-110 origin-right cursor-pointer ${t.isDark ? 'text-sky-200 hover:text-sky-100 hover:drop-shadow-[0_0_6px_rgba(56,189,248,0.6)]' : 'text-sky-700 hover:text-sky-500'}`}>
                                {c.buyers.toLocaleString('en-IN')}
                              </button>
                            </td>,
                          ];
                        })}
                        <td className={totalBodyCompact} colSpan={3}>
                          <div className="flex items-baseline justify-end gap-2 whitespace-nowrap">
                            <button type="button" onClick={() => openProductDrill({ skuId: p.skuId, skuLabel: p.skuLabel, brandName: p.brandName, size: p.size, month: null, metric: 'orders' })} title={`${p.skuLabel} · all months · orders`} className={`text-sm font-extrabold tabular-nums transition-all duration-150 hover:scale-110 origin-right cursor-pointer ${t.isDark ? 'text-white hover:text-fuchsia-300 hover:drop-shadow-[0_0_6px_rgba(232,121,249,0.6)]' : 'text-purple-900 hover:text-purple-600'}`}>
                              {p.total.count.toLocaleString('en-IN')}
                            </button>
                            <button type="button" onClick={() => openProductDrill({ skuId: p.skuId, skuLabel: p.skuLabel, brandName: p.brandName, size: p.size, month: null, metric: 'amount' })} title={`${p.skuLabel} · all months · ₹ value`} className={`text-[11px] font-semibold tabular-nums transition-all duration-150 hover:scale-110 origin-right cursor-pointer ${t.isDark ? 'text-fuchsia-200 hover:text-fuchsia-100 hover:drop-shadow-[0_0_6px_rgba(232,121,249,0.6)]' : 'text-purple-700 hover:text-purple-500'}`}>
                              {formatAmount(p.total.amount)}
                            </button>
                            <button type="button" onClick={() => openProductDrill({ skuId: p.skuId, skuLabel: p.skuLabel, brandName: p.brandName, size: p.size, month: null, metric: 'buyers' })} title={`${p.skuLabel} · all months · buyers`} className={`text-[11px] font-bold tabular-nums transition-all duration-150 hover:scale-110 origin-right cursor-pointer ${t.isDark ? 'text-sky-200 hover:text-sky-100 hover:drop-shadow-[0_0_6px_rgba(56,189,248,0.6)]' : 'text-sky-700 hover:text-sky-500'}`}>
                              {p.total.buyers.toLocaleString('en-IN')}b
                            </button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className={t.footRow}>
                    <tr>
                      <td className={t.footLabel}>Total</td>
                      {months.flatMap((m) => {
                        const c = productData.totals.byMonth[m] ?? { count: 0, amount: 0, buyers: 0, quantity: 0 };
                        return [
                          <td key={`ptot_${m}_c`} className={`border-t border-r ${t.isDark ? 'border-white/10 bg-slate-900' : 'border-slate-200 bg-slate-100'} px-3 py-1.5 text-right`}>
                            <div className={`text-sm font-extrabold tabular-nums ${t.isDark ? 'text-white' : 'text-slate-900'}`}>{c.count.toLocaleString('en-IN')}</div>
                          </td>,
                          <td key={`ptot_${m}_a`} className={`border-t border-r ${t.isDark ? 'border-white/10 bg-slate-900' : 'border-slate-200 bg-slate-100'} px-3 py-1.5 text-right`}>
                            <div className={`text-xs font-bold tabular-nums ${t.isDark ? 'text-white' : 'text-slate-900'}`}>{formatAmount(c.amount)}</div>
                          </td>,
                          <td key={`ptot_${m}_b`} className={`border-t border-r ${t.isDark ? 'border-white/10 bg-slate-900' : 'border-slate-200 bg-slate-100'} px-3 py-1.5 text-right`}>
                            <div className={`text-xs font-bold tabular-nums ${t.isDark ? 'text-sky-200' : 'text-sky-700'}`}>{c.buyers.toLocaleString('en-IN')}</div>
                          </td>,
                        ];
                      })}
                      <td className={t.totalFoot.replace('py-3', 'py-1.5')} colSpan={3}>
                        <div className="flex items-baseline justify-end gap-2 whitespace-nowrap">
                          <div className={`text-sm font-extrabold tabular-nums text-white`}>{productData.totals.grand.count.toLocaleString('en-IN')}</div>
                          <div className={`text-[11px] font-semibold tabular-nums ${t.isDark ? 'text-fuchsia-100' : 'text-purple-100'}`}>{formatAmount(productData.totals.grand.amount)}</div>
                          <div className={`text-[11px] font-bold tabular-nums ${t.isDark ? 'text-sky-100' : 'text-sky-50'}`}>{productData.totals.grand.buyers.toLocaleString('en-IN')}b</div>
                        </div>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              );
            })()}
          </div>
          {productData && (
            <div className={t.footnote}>
              {visibleProducts.length} of {productData.productCount} product{productData.productCount === 1 ? '' : 's'}
              {productData.truncated && <> · showing top {productData.limit} by ₹ value</>}
              {' · '}buyer counts are distinct per cell — row / column totals sum those per-cell distinct counts.
            </div>
          )}
        </div>
          );
        })()}

        {bpTab === 'topsellers' && (() => {
          const sortKey = (c: TsCell) => topSort === 'quantity' ? c.quantity : topSort === 'orders' ? c.count : c.amount;
          const sortLabelShort = topSort === 'quantity' ? 'qty' : topSort === 'orders' ? 'orders' : '₹ value';
          const sortLabelFull = topSort === 'quantity' ? 'quantity' : topSort === 'orders' ? 'orders' : '₹ value';
          const visibleBrandsTs = (() => {
            if (!topData) return [];
            const q = topSearch.trim().toLowerCase();
            if (!q) return topData.brands;
            return topData.brands
              .map((br) => {
                const brMatch = br.brandLabel.toLowerCase().includes(q);
                const filteredProducts = brMatch
                  ? br.products
                  : br.products.filter((p) => p.skuLabel.toLowerCase().includes(q) || (p.size ?? '').toLowerCase().includes(q));
                if (!brMatch && filteredProducts.length === 0) return null;
                return { ...br, products: filteredProducts };
              })
              .filter((b): b is TsBrand => b !== null);
          })();
          const fmtQty = (n: number) => {
            if (n >= 100000) return `${(n / 100000).toFixed(2)}L`;
            if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
            return n.toLocaleString('en-IN');
          };
          return (
        <div className={t.sectionCard}>
          <div className={t.sectionAccent} />
          <div className={`px-6 py-2 flex items-center gap-2 ${t.isDark ? 'bg-white/5 border-b border-white/10' : 'bg-slate-50 border-b border-slate-200'}`}>
            <span className={t.sectionTag('pivot')}>TOP SELLERS</span>
            <h2 className={`text-base font-bold ${t.isDark ? 'text-white' : 'text-slate-900'}`}>Brand × Product</h2>
            <span className={`text-[11px] ${t.isDark ? 'text-purple-300/70' : 'text-slate-500'}`}>delivered + completed orders · click any brand to expand top SKUs</span>
            <div className="ml-auto">{queryBtn('topsellers', 'Brand × Product')}</div>
          </div>

          <div className={`px-6 py-2 border-b flex items-center gap-2 flex-wrap ${t.isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}>
            <span className={t.chipLabel}>Date</span>
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
            {(range !== 'year' || customFrom || customTo) && (
              <button
                onClick={() => { setRange('year'); setCustomFrom(''); setCustomTo(''); }}
                className={`px-2 py-1 rounded-md text-[10px] font-bold ${t.isDark ? 'bg-rose-500/15 text-rose-200 border border-rose-400/30 hover:bg-rose-500/25' : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'}`}
                title="Reset to full year"
              >
                ✕ Clear date
              </button>
            )}
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <div className={`inline-flex gap-1 p-0.5 rounded-lg ${t.isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-100 border border-slate-200'}`}>
                {(['orders', 'amount', 'quantity'] as const).map((m) => {
                  const active = topSort === m;
                  const label = m === 'amount' ? '₹ value' : m === 'quantity' ? 'Qty' : 'Orders';
                  return (
                    <button
                      key={m}
                      onClick={() => setTopSort(m)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all whitespace-nowrap ${active ? (t.isDark ? 'bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white shadow-sm' : 'bg-purple-600 text-white shadow-sm') : (t.isDark ? 'text-purple-200 hover:bg-white/10' : 'text-slate-600 hover:bg-white')}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setTopDir((d) => d === 'desc' ? 'asc' : 'desc')}
                className={`px-2 py-1 rounded-md text-[11px] font-bold whitespace-nowrap ${t.isDark ? 'bg-white/10 border border-white/15 text-purple-100 hover:bg-white/15' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                title={`Sort direction (currently ${topDir === 'desc' ? 'highest first' : 'lowest first'})`}
              >
                {topDir === 'desc' ? '↓ Desc' : '↑ Asc'}
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMbsBrandDropdownOpen((v) => !v)}
                  className={`min-w-[160px] px-3 py-1.5 text-xs rounded-lg text-left flex items-center justify-between gap-2 ${t.isDark ? 'bg-white/10 border border-white/20 text-white hover:bg-white/15' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'} focus:outline-none focus:ring-2 focus:ring-purple-400`}
                >
                  <span className="truncate font-semibold">
                    {mbsBrands.size === 0 && <span className={t.isDark ? 'text-purple-300/70' : 'text-slate-400'}>All brands</span>}
                    {mbsBrands.size === 1 && Array.from(mbsBrands)[0]}
                    {mbsBrands.size > 1 && <span className={t.isDark ? 'text-fuchsia-200' : 'text-purple-700'}>{mbsBrands.size} brands</span>}
                  </span>
                  <span className={t.isDark ? 'text-purple-300 text-[10px]' : 'text-slate-400 text-[10px]'}>▾</span>
                </button>
                {mbsBrandDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-[55]" onClick={() => setMbsBrandDropdownOpen(false)} />
                    <div className={`absolute top-full right-0 mt-1 z-[60] w-[340px] max-h-[420px] rounded-lg shadow-2xl flex flex-col overflow-hidden ${t.isDark ? 'bg-slate-950 border border-white/15' : 'bg-white border border-slate-200'}`}>
                      <div className={`p-2 border-b flex items-center gap-2 ${t.isDark ? 'bg-slate-950 border-white/10' : 'bg-white border-slate-200'}`}>
                        <input
                          type="text"
                          autoFocus
                          value={mbsBrandSearch}
                          onChange={(e) => setMbsBrandSearch(e.target.value)}
                          placeholder="Search brand…"
                          className={t.searchInput.replace('ml-auto', '').replace('min-w-[220px]', 'flex-1 min-w-0')}
                        />
                        {mbsBrands.size > 0 && (
                          <button
                            type="button"
                            onClick={() => setMbsBrands(new Set())}
                            className={`px-2 py-1.5 text-[10px] font-bold rounded border whitespace-nowrap ${t.isDark ? 'bg-rose-500/20 text-rose-200 border-rose-400/40 hover:bg-rose-500/30' : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'}`}
                          >
                            Clear all
                          </button>
                        )}
                      </div>
                      <div className={`overflow-y-auto flex-1 ${t.isDark ? 'bg-slate-950' : 'bg-white'}`}>
                        {(() => {
                          const allBrands = pivotData?.brands?.map((b) => b.brandName) ?? [];
                          const q = mbsBrandSearch.trim().toLowerCase();
                          const filtered = q ? allBrands.filter((n) => n.toLowerCase().includes(q)) : allBrands;
                          if (filtered.length === 0) {
                            return <div className={`px-3 py-4 text-xs ${t.isDark ? 'bg-slate-950 text-purple-300/60' : 'bg-white text-slate-400'}`}>No matches</div>;
                          }
                          const toggle = (name: string) => {
                            setMbsBrands((prev) => {
                              const next = new Set(prev);
                              if (next.has(name)) next.delete(name); else next.add(name);
                              return next;
                            });
                          };
                          return filtered.map((name) => {
                            const checked = mbsBrands.has(name);
                            return (
                              <label
                                key={name}
                                className={`flex items-center gap-2 px-3 py-2 text-xs border-b cursor-pointer ${t.isDark ? 'bg-slate-950 border-white/5 hover:bg-white/10' : 'bg-white border-slate-100 hover:bg-slate-100'} ${checked ? (t.isDark ? 'bg-fuchsia-500/15' : 'bg-purple-50') : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggle(name)}
                                  className="accent-fuchsia-500 w-3.5 h-3.5"
                                />
                                <span className={checked ? (t.isDark ? 'text-fuchsia-200 font-semibold' : 'text-purple-700 font-semibold') : (t.isDark ? 'text-white' : 'text-slate-800')}>
                                  {name}
                                </span>
                              </label>
                            );
                          });
                        })()}
                      </div>
                      <div className={`p-2 border-t flex items-center justify-between gap-2 ${t.isDark ? 'bg-slate-950 border-white/10' : 'bg-white border-slate-200'}`}>
                        <span className={`text-[10px] ${t.isDark ? 'text-purple-300/70' : 'text-slate-500'}`}>
                          {mbsBrands.size === 0 ? 'no filter — showing all brands' : `${mbsBrands.size} selected`}
                        </span>
                        <button
                          type="button"
                          onClick={() => setMbsBrandDropdownOpen(false)}
                          className="px-3 py-1 text-[11px] font-semibold rounded bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white shadow-sm"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
              {mbsBrands.size > 0 && (
                <button
                  onClick={() => setMbsBrands(new Set())}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold ${t.isDark ? 'bg-rose-500/15 text-rose-200 border border-rose-400/30 hover:bg-rose-500/25' : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'}`}
                  title="Clear brand filter"
                >
                  ✕
                </button>
              )}
              <input
                type="text"
                value={topSearch}
                onChange={(e) => setTopSearch(e.target.value)}
                placeholder="Search brand / product…"
                className={t.searchInput.replace('ml-auto', '').replace('min-w-[220px]', 'min-w-[180px]')}
              />
              {topData && (
                <button
                  className={t.csvBtn}
                  onClick={() => {
                    if (!topData) return;
                    const headers = ['Rank in brand', 'Brand', 'Product', 'Size', 'Orders', 'GMV', 'Distinct Buyers', 'Quantity'];
                    const rows: CsvCell[][] = [];
                    for (const br of topData.brands) {
                      br.products.forEach((p, i) => {
                        rows.push([i + 1, br.brandLabel, p.skuLabel, p.size ?? '', p.total.count, p.total.amount, p.total.buyers, p.total.quantity]);
                      });
                    }
                    const suffix = mbsBrands.size === 0
                      ? 'all-brands'
                      : mbsBrands.size === 1
                        ? Array.from(mbsBrands)[0].toLowerCase().replace(/\s+/g, '-')
                        : `${mbsBrands.size}-brands`;
                    downloadCSV(`top-sellers-${suffix}-${topSort}-${topDir}-${currentYear}.csv`, headers, rows);
                  }}
                >
                  ↓ CSV
                </button>
              )}
            </div>
          </div>

          <div className={t.tableWrap}>
            {topLoading || !topData ? (
              <div className={t.loading}>Loading…</div>
            ) : visibleBrandsTs.length === 0 ? (
              <div className={t.loading}>No brands match this selection</div>
            ) : (
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead className={`sticky top-0 z-20 ${t.isDark ? 'bg-slate-900/95 backdrop-blur' : 'bg-white'}`}>
                  <tr>
                    <th className={`${t.brandCell} text-left font-semibold uppercase tracking-wider min-w-[320px] ${t.isDark ? 'text-purple-200' : 'text-slate-500'}`}>
                      Brand · Product
                    </th>
                    <th className={`${t.deliveryHeader} text-right`}>SKUs</th>
                    <th className={`${t.deliveryHeader} text-right`}>Orders</th>
                    <th className={`${t.deliveryHeader} text-right`}>₹ Value</th>
                    <th className={`${t.deliveryHeader} text-right`}>Buyers</th>
                    <th className={`${t.deliveryHeader} text-right`}>Qty sold</th>
                    <th className={`${t.deliveryHeader} text-right min-w-[110px]`}>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleBrandsTs.map((br, brIdx) => {
                    const key = (br.brandId ?? '') + '::' + br.brandLabel;
                    const expanded = topExpanded.has(key);
                    const grandRef = sortKey(topData!.grand);
                    const sharePct = grandRef > 0 ? (sortKey(br.total) / grandRef) * 100 : 0;
                    const topProduct = br.products[0];
                    const brandCellCompact = t.brandCell.replace('py-3', 'py-1.5');
                    const dataCellCompact = t.dataCell.replace('py-3', 'py-1.5');
                    return (
                      <Fragment key={key}>
                        <tr
                          onClick={() => toggleTopBrand(key)}
                          className={`cursor-pointer ${brIdx % 2 === 0 ? t.rowEven : t.rowOdd} ${t.rowHover} select-none`}
                        >
                          <td className={brandCellCompact}>
                            <div className="flex items-center gap-2">
                              <span className={`inline-block w-3 text-center text-[11px] ${t.isDark ? 'text-purple-300' : 'text-slate-400'}`}>{expanded ? '▾' : '▸'}</span>
                              <span className={t.brandRowNum}>{brIdx + 1}</span>
                              <span className={t.brandAccent} />
                              <span className={`${t.brandName} text-xs`}>{br.brandLabel}</span>
                              {topProduct && (
                                <span className={`text-[10px] truncate ${t.isDark ? 'text-fuchsia-300/80' : 'text-purple-600'}`} title={`Top SKU by ${sortLabelFull}`}>
                                  · ★ {topProduct.skuLabel}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className={dataCellCompact}>
                            <div className={`text-xs font-bold tabular-nums ${t.isDark ? 'text-purple-100' : 'text-slate-700'}`}>{br.products.length}</div>
                          </td>
                          <td className={dataCellCompact}>
                            <button onClick={(e) => { e.stopPropagation(); openDrill({ brand: br.brandLabel, metric: 'orders' }); }} className={`text-sm font-extrabold tabular-nums transition-all duration-150 hover:scale-125 origin-right inline-block ${t.isDark ? 'text-white hover:text-fuchsia-300 hover:drop-shadow-[0_0_8px_rgba(232,121,249,0.7)]' : 'text-slate-900 hover:text-purple-600'}`} title="Click to see orders">{br.total.count.toLocaleString('en-IN')}</button>
                          </td>
                          <td className={dataCellCompact}>
                            <button onClick={(e) => { e.stopPropagation(); openDrill({ brand: br.brandLabel, metric: 'amount' }); }} className={`text-xs font-bold tabular-nums transition-all duration-150 hover:scale-125 origin-right inline-block ${t.isDark ? 'text-white hover:text-fuchsia-300 hover:drop-shadow-[0_0_8px_rgba(232,121,249,0.7)]' : 'text-slate-900 hover:text-purple-600'}`} title="Click to see orders">{formatAmount(br.total.amount)}</button>
                          </td>
                          <td className={dataCellCompact}>
                            <button onClick={(e) => { e.stopPropagation(); openDrill({ brand: br.brandLabel, metric: 'buyers' }); }} className={`text-xs font-bold tabular-nums transition-all duration-150 hover:scale-125 origin-right inline-block ${t.isDark ? 'text-sky-200 hover:text-sky-100 hover:drop-shadow-[0_0_8px_rgba(56,189,248,0.7)]' : 'text-sky-700 hover:text-sky-500'}`} title="Click to see buyers">{br.total.buyers.toLocaleString('en-IN')}</button>
                          </td>
                          <td className={dataCellCompact}>
                            <button onClick={(e) => { e.stopPropagation(); openDrill({ brand: br.brandLabel, metric: 'qty' }); }} className={`text-xs font-bold tabular-nums transition-all duration-150 hover:scale-125 origin-right inline-block ${t.isDark ? 'text-emerald-200 hover:text-emerald-100 hover:drop-shadow-[0_0_8px_rgba(16,185,129,0.7)]' : 'text-emerald-700 hover:text-emerald-500'}`} title="Click to see orders">{fmtQty(br.total.quantity)}</button>
                          </td>
                          <td className={dataCellCompact}>
                            <div className="flex items-center justify-end gap-2">
                              <div className={`relative h-1 w-14 rounded-full overflow-hidden ${t.isDark ? 'bg-white/10' : 'bg-slate-200'}`}>
                                <div
                                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-fuchsia-500 to-purple-500"
                                  style={{ width: `${Math.min(100, sharePct).toFixed(1)}%` }}
                                />
                              </div>
                              <span className={`text-[10px] font-bold tabular-nums ${t.isDark ? 'text-fuchsia-200' : 'text-purple-700'}`}>{sharePct.toFixed(1)}%</span>
                            </div>
                          </td>
                        </tr>
                        {expanded && br.products.map((p, pIdx) => (
                          <tr key={`${key}_${p.skuId}`} className={`${t.isDark ? 'bg-white/[0.015]' : 'bg-slate-50/40'} ${t.rowHover}`}>
                            <td className={`${brandCellCompact} pl-10`}>
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] tabular-nums font-bold w-5 text-right ${pIdx === 0 ? (t.isDark ? 'text-fuchsia-300' : 'text-purple-600') : (t.isDark ? 'text-purple-400/60' : 'text-slate-400')}`}>
                                  {pIdx === 0 ? '★' : pIdx + 1}
                                </span>
                                <span className={`text-xs font-semibold ${t.isDark ? 'text-white' : 'text-slate-800'}`}>{p.skuLabel}</span>
                                {p.size && (
                                  <span className={`text-[10px] ${t.isDark ? 'text-purple-300/60' : 'text-slate-400'} truncate`}>· {p.size}</span>
                                )}
                              </div>
                            </td>
                            <td className={dataCellCompact}>—</td>
                            <td className={dataCellCompact}>
                              <button onClick={(e) => { e.stopPropagation(); openDrill({ brand: br.brandLabel, sku: { id: p.skuId, label: p.skuLabel }, metric: 'orders' }); }} className={`text-xs font-bold tabular-nums transition-all duration-150 hover:scale-125 origin-right inline-block ${t.isDark ? 'text-purple-100 hover:text-fuchsia-300 hover:drop-shadow-[0_0_6px_rgba(232,121,249,0.6)]' : 'text-slate-700 hover:text-purple-600'}`} title="Click to see orders">{p.total.count.toLocaleString('en-IN')}</button>
                            </td>
                            <td className={dataCellCompact}>
                              <button onClick={(e) => { e.stopPropagation(); openDrill({ brand: br.brandLabel, sku: { id: p.skuId, label: p.skuLabel }, metric: 'amount' }); }} className={`text-xs font-semibold tabular-nums transition-all duration-150 hover:scale-125 origin-right inline-block ${t.isDark ? 'text-purple-200 hover:text-fuchsia-300 hover:drop-shadow-[0_0_6px_rgba(232,121,249,0.6)]' : 'text-slate-700 hover:text-purple-600'}`} title="Click to see orders">{formatAmount(p.total.amount)}</button>
                            </td>
                            <td className={dataCellCompact}>
                              <button onClick={(e) => { e.stopPropagation(); openDrill({ brand: br.brandLabel, sku: { id: p.skuId, label: p.skuLabel }, metric: 'buyers' }); }} className={`text-xs font-semibold tabular-nums transition-all duration-150 hover:scale-125 origin-right inline-block ${t.isDark ? 'text-sky-300/80 hover:text-sky-200 hover:drop-shadow-[0_0_6px_rgba(56,189,248,0.6)]' : 'text-sky-600 hover:text-sky-500'}`} title="Click to see buyers">{p.total.buyers.toLocaleString('en-IN')}</button>
                            </td>
                            <td className={dataCellCompact}>
                              <button onClick={(e) => { e.stopPropagation(); openDrill({ brand: br.brandLabel, sku: { id: p.skuId, label: p.skuLabel }, metric: 'qty' }); }} className={`text-xs font-semibold tabular-nums transition-all duration-150 hover:scale-125 origin-right inline-block ${t.isDark ? 'text-emerald-300/80 hover:text-emerald-200 hover:drop-shadow-[0_0_6px_rgba(16,185,129,0.6)]' : 'text-emerald-600 hover:text-emerald-500'}`} title="Click to see orders">{fmtQty(p.total.quantity)}</button>
                            </td>
                            <td className={dataCellCompact}>
                              {(() => {
                                const denom = sortKey(br.total);
                                const pct = denom > 0 ? (sortKey(p.total) / denom) * 100 : 0;
                                return (
                                  <div className="flex items-center justify-end gap-2">
                                    <div className={`relative h-1 w-12 rounded-full overflow-hidden ${t.isDark ? 'bg-white/10' : 'bg-slate-200'}`}>
                                      <div
                                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-400 to-teal-500"
                                        style={{ width: `${Math.min(100, pct).toFixed(1)}%` }}
                                      />
                                    </div>
                                    <span className={`text-[10px] font-semibold tabular-nums ${t.isDark ? 'text-emerald-200/80' : 'text-emerald-700'}`}>{pct.toFixed(1)}%</span>
                                  </div>
                                );
                              })()}
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
                    <td className={`border-t border-r ${t.isDark ? 'border-white/10 bg-slate-900' : 'border-slate-200 bg-slate-100'} px-3 py-1.5 text-right`}>
                      <div className={`text-xs font-bold tabular-nums ${t.isDark ? 'text-purple-100' : 'text-slate-700'}`}>{topData.productCount.toLocaleString('en-IN')}</div>
                    </td>
                    <td className={`border-t border-r ${t.isDark ? 'border-white/10 bg-slate-900' : 'border-slate-200 bg-slate-100'} px-3 py-1.5 text-right`} title="Distinct purchase orders — matches Chart & Trend">
                      <div className={`text-sm font-extrabold tabular-nums ${t.isDark ? 'text-white' : 'text-slate-900'}`}>{topData.distinct.orders.toLocaleString('en-IN')}</div>
                    </td>
                    <td className={`border-t border-r ${t.isDark ? 'border-white/10 bg-slate-900' : 'border-slate-200 bg-slate-100'} px-3 py-1.5 text-right`} title="Sum of purchaseOrder.amount (order-header total) — matches Chart & Trend">
                      <div className={`text-xs font-bold tabular-nums ${t.isDark ? 'text-white' : 'text-slate-900'}`}>{formatAmount(topData.distinct.amount)}</div>
                    </td>
                    <td className={`border-t border-r ${t.isDark ? 'border-white/10 bg-slate-900' : 'border-slate-200 bg-slate-100'} px-3 py-1.5 text-right`} title="Distinct buyers — matches Chart & Trend">
                      <div className={`text-xs font-bold tabular-nums ${t.isDark ? 'text-sky-200' : 'text-sky-700'}`}>{topData.distinct.buyers.toLocaleString('en-IN')}</div>
                    </td>
                    <td className={`border-t border-r ${t.isDark ? 'border-white/10 bg-slate-900' : 'border-slate-200 bg-slate-100'} px-3 py-1.5 text-right`}>
                      <div className={`text-xs font-bold tabular-nums ${t.isDark ? 'text-emerald-200' : 'text-emerald-700'}`}>{fmtQty(topData.grand.quantity)}</div>
                    </td>
                    <td className={`border-t ${t.isDark ? 'border-white/10 bg-slate-900' : 'border-slate-200 bg-slate-100'} px-3 py-1.5 text-right`}>
                      <span className={`text-[10px] uppercase tracking-wider ${t.isDark ? 'text-purple-300/70' : 'text-slate-500'}`}>sorted by {sortLabelShort} {topDir === 'desc' ? '↓' : '↑'}</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
          {topData && (
            <div className={t.footnote}>
              {visibleBrandsTs.length} of {topData.brandCount} brand{topData.brandCount === 1 ? '' : 's'} · {topData.productCount.toLocaleString('en-IN')} SKUs · ★ marks the top SKU within each brand. Per-row Orders / Buyers / ₹ Value are per-SKU attribution (an order with N SKUs from one brand contributes N to that brand). Footer TOTAL shows distinct orders / buyers and order-header GMV (sum of po.amount) — these tie back to the Chart & Trend cards.
            </div>
          )}
        </div>
          );
        })()}

        {bpTab === 'trends' && (() => {
          // Theme-aware chart palette
          const ax = t.isDark ? '#a78bfa' : '#64748b';          // axis labels
          const grid = t.isDark ? '#ffffff15' : '#e2e8f0';      // grid lines
          const tipBg = t.isDark ? '#0f0721' : '#ffffff';
          const tipBorder = t.isDark ? '#7c3aed55' : '#e2e8f0';
          const tipText = t.isDark ? '#ede9fe' : '#0f172a';
          // Status colors — match the pill table
          const statusColor: Record<string, string> = {
            DELIVERED: '#34d399', COMPLETED: '#10b981',
            REJECTED:  '#f43f5e', CANCELLED: '#f59e0b',
            PENDING:   '#38bdf8', ACCEPTED:  '#a78bfa',
            INVOICED:  '#e879f9', DISPATCHED:'#22d3ee',
            INPROGRESS:'#818cf8',
          };
          const palette = ['#d946ef', '#a78bfa', '#22d3ee', '#34d399', '#f59e0b', '#f43f5e', '#38bdf8', '#fb7185', '#e879f9', '#facc15'];

          const fmtBucket = (s: string) => {
            const d = new Date(s);
            if (trendGranularity === 'month') return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
            if (trendGranularity === 'week')  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
            return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
          };
          const fmtMetricValue = (v: number) => {
            if (trendMetric === 'gmv')     return formatAmount(v);
            if (trendMetric === 'success') return `${v.toFixed(1)}%`;
            return v.toLocaleString('en-IN');
          };
          const metricKey =
            trendMetric === 'gmv'     ? 'deliveredAmount' :
            trendMetric === 'orders'  ? 'totalOrders'     :
            trendMetric === 'buyers'  ? 'buyers'          :
                                        'successPct';
          const metricLabel =
            trendMetric === 'gmv'     ? 'GMV (delivered)' :
            trendMetric === 'orders'  ? 'Orders'          :
            trendMetric === 'buyers'  ? 'Distinct buyers' :
                                        'Delivery success %';
          const metricColor =
            trendMetric === 'gmv'     ? '#10b981' :
            trendMetric === 'orders'  ? '#d946ef' :
            trendMetric === 'buyers'  ? '#38bdf8' :
                                        '#facc15';

          // ── Derived datasets ───────────────────────────────────────────
          const topBrandsChart = topData?.brands?.slice(0, 10).map((br) => ({
            name: br.brandLabel.length > 18 ? br.brandLabel.slice(0, 17) + '…' : br.brandLabel,
            fullName: br.brandLabel,
            gmv: br.total.amount,
            orders: br.total.count,
            buyers: br.total.buyers,
          })) ?? [];

          const topSkusChart = (() => {
            if (!topData) return [];
            const all: { name: string; fullName: string; brand: string; gmv: number; orders: number }[] = [];
            for (const br of topData.brands) {
              for (const p of br.products) {
                all.push({
                  name: p.skuLabel.length > 28 ? p.skuLabel.slice(0, 27) + '…' : p.skuLabel,
                  fullName: p.skuLabel,
                  brand: br.brandLabel,
                  gmv: p.total.amount,
                  orders: p.total.count,
                });
              }
            }
            return all.sort((a, b) => b.gmv - a.gmv).slice(0, 15);
          })();

          const statusMix = mbsData?.data?.map((row) => ({
            name: row.status,
            value: row.total.count,
            amount: row.total.amount,
          })).sort((a, b) => b.value - a.value) ?? [];

          const paretoData = (() => {
            if (!topData) return [];
            const all: { name: string; gmv: number }[] = [];
            for (const br of topData.brands) for (const p of br.products) all.push({ name: p.skuLabel, gmv: p.total.amount });
            all.sort((a, b) => b.gmv - a.gmv);
            const total = all.reduce((s, x) => s + x.gmv, 0);
            let cum = 0;
            return all.slice(0, 50).map((p, i) => {
              cum += p.gmv;
              return { rank: i + 1, name: p.name, gmv: p.gmv, cumulativePct: total > 0 ? (cum / total) * 100 : 0 };
            });
          })();
          const skusFor80Pct = (() => {
            if (!topData) return null;
            const all: number[] = [];
            for (const br of topData.brands) for (const p of br.products) all.push(p.total.amount);
            all.sort((a, b) => b - a);
            const total = all.reduce((s, x) => s + x, 0);
            if (total === 0) return null;
            let cum = 0;
            for (let i = 0; i < all.length; i++) {
              cum += all[i];
              if (cum / total >= 0.8) return { count: i + 1, totalSkus: all.length };
            }
            return { count: all.length, totalSkus: all.length };
          })();

          const grandSuccessPct = trendData?.totals.successPct ?? 0;
          const grandAov = trendData?.totals.aov ?? 0;

          return (
            <div className="flex flex-col gap-6">
              {/* Compact filter bar — date + granularity + brand picker */}
              {/* overflow-visible + high z so the brand-picker dropdown can escape
                  this short card and paint above the KPI tiles + chart cards that
                  follow (each of which builds its own backdrop-blur stacking context). */}
              <div className={`${t.sectionCard.replace('overflow-hidden', 'overflow-visible')} relative z-50`}>
                <div className={t.sectionAccent} />
                <div className={`px-6 py-2 flex items-center gap-2 ${t.isDark ? 'bg-white/5 border-b border-white/10' : 'bg-slate-50 border-b border-slate-200'}`}>
                  <span className={t.sectionTag('pivot')}>CHART &amp; TREND</span>
                  <h2 className={`text-base font-bold ${t.isDark ? 'text-white' : 'text-slate-900'}`}>Business view</h2>
                  <span className={`text-[11px] ${t.isDark ? 'text-purple-300/70' : 'text-slate-500'}`}>trend · top brands · status mix · top SKUs · Pareto</span>
                  <div className="ml-auto">{queryBtn(['trend', 'trendsExtra', 'mbs', 'topsellers'], 'Chart & Trend — all queries')}</div>
                </div>
                <div className={`px-6 py-2 border-b flex items-center gap-2 flex-wrap ${t.isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}>
                  <span className={t.chipLabel}>Date</span>
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
                  {(range !== 'year' || customFrom || customTo) && (
                    <button
                      onClick={() => { setRange('year'); setCustomFrom(''); setCustomTo(''); }}
                      className={`px-2 py-1 rounded-md text-[10px] font-bold ${t.isDark ? 'bg-rose-500/15 text-rose-200 border border-rose-400/30 hover:bg-rose-500/25' : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'}`}
                    >
                      ✕ Clear date
                    </button>
                  )}
                  <div className="ml-auto flex items-center gap-2 flex-wrap">
                    <span className={t.chipLabel}>Granularity</span>
                    <div className={`inline-flex gap-1 p-0.5 rounded-lg ${t.isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-100 border border-slate-200'}`}>
                      {(['day', 'week', 'month'] as const).map((g) => {
                        const active = trendGranularity === g;
                        return (
                          <button
                            key={g}
                            onClick={() => setTrendGranularity(g)}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold capitalize transition-all ${active ? (t.isDark ? 'bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white shadow-sm' : 'bg-purple-600 text-white shadow-sm') : (t.isDark ? 'text-purple-200 hover:bg-white/10' : 'text-slate-600 hover:bg-white')}`}
                          >
                            {g}
                          </button>
                        );
                      })}
                    </div>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setMbsBrandDropdownOpen((v) => !v)}
                        className={`min-w-[160px] px-3 py-1.5 text-xs rounded-lg text-left flex items-center justify-between gap-2 ${t.isDark ? 'bg-white/10 border border-white/20 text-white hover:bg-white/15' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'} focus:outline-none focus:ring-2 focus:ring-purple-400`}
                      >
                        <span className="truncate font-semibold">
                          {mbsBrands.size === 0 && <span className={t.isDark ? 'text-purple-300/70' : 'text-slate-400'}>All brands</span>}
                          {mbsBrands.size === 1 && Array.from(mbsBrands)[0]}
                          {mbsBrands.size > 1 && <span className={t.isDark ? 'text-fuchsia-200' : 'text-purple-700'}>{mbsBrands.size} brands</span>}
                        </span>
                        <span className={t.isDark ? 'text-purple-300 text-[10px]' : 'text-slate-400 text-[10px]'}>▾</span>
                      </button>
                      {mbsBrandDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-[55]" onClick={() => setMbsBrandDropdownOpen(false)} />
                          <div className={`absolute top-full right-0 mt-1 z-[60] w-[340px] max-h-[420px] rounded-lg shadow-2xl flex flex-col overflow-hidden ${t.isDark ? 'bg-slate-950 border border-white/15' : 'bg-white border border-slate-200'}`}>
                            <div className={`p-2 border-b flex items-center gap-2 ${t.isDark ? 'bg-slate-950 border-white/10' : 'bg-white border-slate-200'}`}>
                              <input
                                type="text"
                                autoFocus
                                value={mbsBrandSearch}
                                onChange={(e) => setMbsBrandSearch(e.target.value)}
                                placeholder="Search brand…"
                                className={t.searchInput.replace('ml-auto', '').replace('min-w-[220px]', 'flex-1 min-w-0')}
                              />
                              {mbsBrands.size > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setMbsBrands(new Set())}
                                  className={`px-2 py-1.5 text-[10px] font-bold rounded border whitespace-nowrap ${t.isDark ? 'bg-rose-500/20 text-rose-200 border-rose-400/40' : 'bg-rose-50 text-rose-700 border-rose-200'}`}
                                >
                                  Clear all
                                </button>
                              )}
                            </div>
                            <div className={`overflow-y-auto flex-1 ${t.isDark ? 'bg-slate-950' : 'bg-white'}`}>
                              {(() => {
                                const allBrands = pivotData?.brands?.map((b) => b.brandName) ?? [];
                                const q = mbsBrandSearch.trim().toLowerCase();
                                const filtered = q ? allBrands.filter((n) => n.toLowerCase().includes(q)) : allBrands;
                                if (filtered.length === 0) return <div className={`px-3 py-4 text-xs ${t.isDark ? 'text-purple-300/60' : 'text-slate-400'}`}>No matches</div>;
                                const toggle = (name: string) => setMbsBrands((prev) => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; });
                                return filtered.map((name) => {
                                  const checked = mbsBrands.has(name);
                                  return (
                                    <label key={name} className={`flex items-center gap-2 px-3 py-2 text-xs border-b cursor-pointer ${t.isDark ? 'bg-slate-950 border-white/5 hover:bg-white/10' : 'bg-white border-slate-100 hover:bg-slate-100'} ${checked ? (t.isDark ? 'bg-fuchsia-500/15' : 'bg-purple-50') : ''}`}>
                                      <input type="checkbox" checked={checked} onChange={() => toggle(name)} className="accent-fuchsia-500 w-3.5 h-3.5" />
                                      <span className={checked ? (t.isDark ? 'text-fuchsia-200 font-semibold' : 'text-purple-700 font-semibold') : (t.isDark ? 'text-white' : 'text-slate-800')}>{name}</span>
                                    </label>
                                  );
                                });
                              })()}
                            </div>
                            <div className={`p-2 border-t flex items-center justify-between gap-2 ${t.isDark ? 'bg-slate-950 border-white/10' : 'bg-white border-slate-200'}`}>
                              <span className={`text-[10px] ${t.isDark ? 'text-purple-300/70' : 'text-slate-500'}`}>
                                {mbsBrands.size === 0 ? 'no filter — showing all brands' : `${mbsBrands.size} selected`}
                              </span>
                              <button
                                type="button"
                                onClick={() => setMbsBrandDropdownOpen(false)}
                                className="px-3 py-1 text-[11px] font-semibold rounded bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white shadow-sm"
                              >
                                Done
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* KPI strip — with delta vs prior comparable window */}
              {trendData && (() => {
                const delta = trendsExtra?.kpi?.deltaPct;
                const win   = trendsExtra?.kpi ? `vs ${trendsExtra.window.prevStart} → ${trendsExtra.window.prevEnd}` : '';
                const fmtDeltaPct = (v: number | null | undefined) => v == null ? null : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
                const fmtDeltaPp  = (v: number | null | undefined) => v == null ? null : `${v >= 0 ? '+' : ''}${v.toFixed(1)} pp`;
                const tiles = [
                  { label: 'Total orders',     value: trendData.totals.totalOrders.toLocaleString('en-IN'),     delta: fmtDeltaPct(delta?.orders),          deltaSign: delta?.orders,          color: 'from-fuchsia-500/30 to-purple-500/10',  text: 'text-fuchsia-200' },
                  { label: 'Delivered orders', value: trendData.totals.deliveredOrders.toLocaleString('en-IN'), delta: fmtDeltaPct(delta?.deliveredOrders), deltaSign: delta?.deliveredOrders, color: 'from-emerald-500/30 to-teal-500/10',    text: 'text-emerald-200' },
                  { label: 'Delivered GMV',    value: formatAmount(trendData.totals.deliveredAmount),           delta: fmtDeltaPct(delta?.deliveredAmount), deltaSign: delta?.deliveredAmount, color: 'from-amber-500/30 to-orange-500/10',    text: 'text-amber-200' },
                  { label: 'Delivery success', value: `${grandSuccessPct.toFixed(1)}%`,                         delta: fmtDeltaPp(delta?.deliveryRate),     deltaSign: delta?.deliveryRate,    color: 'from-sky-500/30 to-blue-500/10',        text: 'text-sky-200' },
                  { label: 'AOV (delivered)',  value: formatAmount(grandAov),                                   delta: fmtDeltaPct(delta?.delAov),          deltaSign: delta?.delAov,          color: 'from-rose-500/30 to-pink-500/10',       text: 'text-rose-200' },
                ];
                return (
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    {tiles.map((kpi, i) => {
                      const pos  = kpi.deltaSign != null && kpi.deltaSign >= 0;
                      const neg  = kpi.deltaSign != null && kpi.deltaSign < 0;
                      const chip = pos
                        ? (t.isDark ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40' : 'bg-emerald-100 text-emerald-700 border border-emerald-200')
                        : neg
                          ? (t.isDark ? 'bg-rose-500/20 text-rose-200 border border-rose-400/40' : 'bg-rose-100 text-rose-700 border border-rose-200')
                          : (t.isDark ? 'bg-white/5 text-purple-300/70 border border-white/10' : 'bg-slate-100 text-slate-500 border border-slate-200');
                      return (
                        <div key={i} className={`relative rounded-xl p-3 border overflow-hidden ${t.isDark ? `bg-gradient-to-br ${kpi.color} border-white/10 backdrop-blur-xl` : 'bg-white border-slate-200 shadow-sm'}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className={`text-[10px] uppercase tracking-wider font-bold ${t.isDark ? kpi.text : 'text-slate-500'}`}>{kpi.label}</div>
                            {kpi.delta && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${chip}`} title={win}>
                                {pos ? '▲ ' : neg ? '▼ ' : ''}{kpi.delta}
                              </span>
                            )}
                          </div>
                          <div className={`text-2xl font-black tabular-nums mt-1 ${t.isDark ? 'text-white' : 'text-slate-900'}`}>{kpi.value}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Trend chart — full width */}
              <div className={t.sectionCard}>
                <div className={t.sectionAccent} />
                <div className={`px-6 py-2 flex items-center justify-between gap-2 ${t.isDark ? 'bg-white/5 border-b border-white/10' : 'bg-slate-50 border-b border-slate-200'}`}>
                  <h3 className={`text-sm font-bold ${t.isDark ? 'text-white' : 'text-slate-900'}`}>Trend over time</h3>
                  <div className={`inline-flex gap-1 p-0.5 rounded-lg ${t.isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-100 border border-slate-200'}`}>
                    {([
                      { k: 'gmv',     l: 'GMV' },
                      { k: 'orders',  l: 'Orders' },
                      { k: 'buyers',  l: 'Buyers' },
                      { k: 'success', l: 'Success %' },
                    ] as const).map(({ k, l }) => {
                      const active = trendMetric === k;
                      return (
                        <button
                          key={k}
                          onClick={() => setTrendMetric(k)}
                          className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${active ? (t.isDark ? 'bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white shadow-sm' : 'bg-purple-600 text-white shadow-sm') : (t.isDark ? 'text-purple-200 hover:bg-white/10' : 'text-slate-600 hover:bg-white')}`}
                        >
                          {l}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="p-4" style={{ height: 360 }}>
                  {trendLoading || !trendData ? (
                    <div className={`h-full flex items-center justify-center text-sm ${t.isDark ? 'text-purple-300' : 'text-slate-500'}`}>Loading trend…</div>
                  ) : trendData.data.length === 0 ? (
                    <div className={`h-full flex items-center justify-center text-sm ${t.isDark ? 'text-purple-300' : 'text-slate-500'}`}>No data for this selection</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData.data.map((p) => ({ ...p, bucketLabel: fmtBucket(p.bucket) }))}>
                        <CartesianGrid stroke={grid} strokeDasharray="3 3" />
                        <XAxis dataKey="bucketLabel" stroke={ax} fontSize={11} tickMargin={6} />
                        <YAxis stroke={ax} fontSize={11} tickFormatter={fmtMetricValue} width={75} />
                        <Tooltip
                          contentStyle={{ background: tipBg, border: `1px solid ${tipBorder}`, borderRadius: 8, color: tipText, fontSize: 12 }}
                          labelStyle={{ color: tipText, fontWeight: 700 }}
                          formatter={(v: any) => fmtMetricValue(v)}
                        />
                        <Line type="monotone" dataKey={metricKey} stroke={metricColor} strokeWidth={2.5} dot={{ r: 4, fill: metricColor }} activeDot={{ r: 6 }} name={metricLabel}>
                          <LabelList dataKey={metricKey} position="top" offset={10} formatter={(v: unknown) => fmtMetricValue(Number(v))} style={{ fill: metricColor, fontSize: 11, fontWeight: 700 }} />
                        </Line>
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* MOV Not Meet Cart Trend — DRAFT carts below seller MOV, full width */}
              <div className={t.sectionCard}>
                <div className={t.sectionAccent} />
                <div className={`px-6 py-2 flex items-center justify-between gap-2 ${t.isDark ? 'bg-white/5 border-b border-white/10' : 'bg-slate-50 border-b border-slate-200'}`}>
                  <h3 className={`text-sm font-bold ${t.isDark ? 'text-white' : 'text-slate-900'}`}>MOV Not Meet Cart Trend</h3>
                  <div className="flex items-center gap-2">
                    <div className={`inline-flex gap-1 p-0.5 rounded-lg ${t.isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-100 border border-slate-200'}`}>
                      {([
                        { k: 'cart',   l: 'Cart' },
                        { k: 'buyers', l: 'Buyer Count' },
                      ] as const).map(({ k, l }) => {
                        const active = movMetric === k;
                        return (
                          <button
                            key={k}
                            onClick={() => setMovMetric(k)}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${active ? (t.isDark ? 'bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white shadow-sm' : 'bg-purple-600 text-white shadow-sm') : (t.isDark ? 'text-purple-200 hover:bg-white/10' : 'text-slate-600 hover:bg-white')}`}
                          >
                            {l}
                          </button>
                        );
                      })}
                    </div>
                    <span className={`text-[11px] ${t.isDark ? 'text-purple-300/70' : 'text-slate-500'}`}>
                      {mbsBrands.size === 0
                        ? 'all brands'
                        : mbsBrands.size === 1
                          ? Array.from(mbsBrands)[0]
                          : `${mbsBrands.size} brands`}
                      {movTrendData ? ` · ${(movMetric === 'cart' ? movTrendData.totalCarts : movTrendData.totalBuyers).toLocaleString('en-IN')} ${movMetric === 'cart' ? 'carts' : 'buyers'}` : ''}
                    </span>
                    {queryBtn('movTrend', 'MOV Not Meet Cart Trend — DRAFT carts below seller MOV')}
                  </div>
                </div>
                <div className="p-4" style={{ height: 360 }}>
                  {movTrendLoading || !movTrendData ? (
                    <div className={`h-full flex items-center justify-center text-sm ${t.isDark ? 'text-purple-300' : 'text-slate-500'}`}>Loading trend…</div>
                  ) : movTrendData.data.length === 0 ? (
                    <div className={`h-full flex items-center justify-center text-sm ${t.isDark ? 'text-purple-300' : 'text-slate-500'}`}>No data for this selection</div>
                  ) : (() => {
                    const movKey   = movMetric === 'cart' ? 'carts' : 'buyers';
                    const movColor = movMetric === 'cart' ? '#f59e0b' : '#38bdf8';
                    const movName  = movMetric === 'cart' ? 'Carts below MOV' : 'Buyers who placed cart';
                    return (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={movTrendData.data.map((p) => ({ ...p, bucketLabel: fmtBucket(p.bucket) }))} margin={{ top: 24, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke={grid} strokeDasharray="3 3" />
                        <XAxis dataKey="bucketLabel" stroke={ax} fontSize={11} tickMargin={6} />
                        <YAxis stroke={ax} fontSize={11} tickFormatter={(v: number) => v.toLocaleString('en-IN')} width={55} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{ background: tipBg, border: `1px solid ${tipBorder}`, borderRadius: 8, color: tipText, fontSize: 12 }}
                          labelStyle={{ color: tipText, fontWeight: 700 }}
                          formatter={(v: any) => [Number(v).toLocaleString('en-IN'), movName]}
                        />
                        <Line key={movKey} type="monotone" dataKey={movKey} stroke={movColor} strokeWidth={2.5} dot={{ r: 4, fill: movColor }} activeDot={{ r: 6 }} name={movName} isAnimationActive={false}>
                          <LabelList dataKey={movKey} position="top" offset={10} formatter={(v: unknown) => Number(v).toLocaleString('en-IN')} style={{ fill: movColor, fontSize: 11, fontWeight: 700 }} />
                        </Line>
                      </LineChart>
                    </ResponsiveContainer>
                    );
                  })()}
                </div>
              </div>

              {/* Row: Top brands bar + Status mix donut */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className={t.sectionCard}>
                  <div className={t.sectionAccent} />
                  <div className={`px-6 py-2 ${t.isDark ? 'bg-white/5 border-b border-white/10' : 'bg-slate-50 border-b border-slate-200'}`}>
                    <h3 className={`text-sm font-bold ${t.isDark ? 'text-white' : 'text-slate-900'}`}>Top 10 brands · delivered GMV</h3>
                  </div>
                  <div className="p-4" style={{ height: 380 }}>
                    {topLoading || topBrandsChart.length === 0 ? (
                      <div className={`h-full flex items-center justify-center text-sm ${t.isDark ? 'text-purple-300' : 'text-slate-500'}`}>Loading…</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={topBrandsChart} layout="vertical" margin={{ left: 10, right: 30 }}>
                          <CartesianGrid stroke={grid} strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" stroke={ax} fontSize={11} tickFormatter={(v: number) => formatAmount(v)} />
                          <YAxis type="category" dataKey="name" stroke={ax} fontSize={11} width={130} interval={0} />
                          <Tooltip
                            contentStyle={{ background: tipBg, border: `1px solid ${tipBorder}`, borderRadius: 8, color: tipText, fontSize: 12 }}
                            formatter={(v: any, _n, p) => [formatAmount(v), p.payload.fullName]}
                          />
                          <Bar dataKey="gmv" radius={[0, 4, 4, 0]}>
                            {topBrandsChart.map((_, idx) => (<Cell key={idx} fill={palette[idx % palette.length]} />))}
                            <LabelList dataKey="gmv" position="right" formatter={(v: unknown) => formatAmount(Number(v))} style={{ fill: tipText, fontSize: 11, fontWeight: 700 }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                <div className={t.sectionCard}>
                  <div className={t.sectionAccent} />
                  <div className={`px-6 py-2 ${t.isDark ? 'bg-white/5 border-b border-white/10' : 'bg-slate-50 border-b border-slate-200'}`}>
                    <h3 className={`text-sm font-bold ${t.isDark ? 'text-white' : 'text-slate-900'}`}>Status mix · all orders</h3>
                  </div>
                  <div className="p-4" style={{ height: 380 }}>
                    {mbsLoading || statusMix.length === 0 ? (
                      <div className={`h-full flex items-center justify-center text-sm ${t.isDark ? 'text-purple-300' : 'text-slate-500'}`}>Loading…</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Tooltip
                            contentStyle={{ background: tipBg, border: `1px solid ${tipBorder}`, borderRadius: 8, color: tipText, fontSize: 12 }}
                            formatter={(v: any, n, p) => [`${v.toLocaleString('en-IN')} orders · ${formatAmount(p.payload.amount)}`, n]}
                          />
                          <Legend
                            verticalAlign="middle"
                            align="right"
                            layout="vertical"
                            wrapperStyle={{ fontSize: 11, color: tipText }}
                          />
                          <Pie data={statusMix} dataKey="value" nameKey="name" cx="40%" cy="50%" innerRadius={60} outerRadius={110} paddingAngle={2} label={(p: any) => `${p.payload.value.toLocaleString('en-IN')} (${((p.payload.value / statusMix.reduce((s, x) => s + x.value, 0)) * 100).toFixed(1)}%)`} labelLine={{ stroke: tipText, strokeWidth: 0.5 }} style={{ fontSize: 11, fontWeight: 600 }}>
                            {statusMix.map((s, idx) => (<Cell key={idx} fill={statusColor[s.name] || palette[idx % palette.length]} />))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>

              {/* Row: Top SKUs bar + Pareto */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className={t.sectionCard}>
                  <div className={t.sectionAccent} />
                  <div className={`px-6 py-2 ${t.isDark ? 'bg-white/5 border-b border-white/10' : 'bg-slate-50 border-b border-slate-200'}`}>
                    <h3 className={`text-sm font-bold ${t.isDark ? 'text-white' : 'text-slate-900'}`}>Top 15 SKUs · delivered GMV</h3>
                  </div>
                  <div className="p-4" style={{ height: 480 }}>
                    {topLoading || topSkusChart.length === 0 ? (
                      <div className={`h-full flex items-center justify-center text-sm ${t.isDark ? 'text-purple-300' : 'text-slate-500'}`}>Loading…</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={topSkusChart} layout="vertical" margin={{ left: 10, right: 30 }}>
                          <CartesianGrid stroke={grid} strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" stroke={ax} fontSize={11} tickFormatter={(v: number) => formatAmount(v)} />
                          <YAxis type="category" dataKey="name" stroke={ax} fontSize={10} width={180} interval={0} />
                          <Tooltip
                            contentStyle={{ background: tipBg, border: `1px solid ${tipBorder}`, borderRadius: 8, color: tipText, fontSize: 12 }}
                            formatter={(v: any, _n, p) => [formatAmount(v), `${p.payload.fullName} (${p.payload.brand})`]}
                          />
                          <Bar dataKey="gmv" radius={[0, 4, 4, 0]}>
                            {topSkusChart.map((_, idx) => (<Cell key={idx} fill={palette[idx % palette.length]} />))}
                            <LabelList dataKey="gmv" position="right" formatter={(v: unknown) => formatAmount(Number(v))} style={{ fill: tipText, fontSize: 10, fontWeight: 700 }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                <div className={t.sectionCard}>
                  <div className={t.sectionAccent} />
                  <div className={`px-6 py-2 flex items-center justify-between ${t.isDark ? 'bg-white/5 border-b border-white/10' : 'bg-slate-50 border-b border-slate-200'}`}>
                    <h3 className={`text-sm font-bold ${t.isDark ? 'text-white' : 'text-slate-900'}`}>Pareto · how concentrated is GMV?</h3>
                    {skusFor80Pct && (
                      <span className={`text-[11px] font-semibold ${t.isDark ? 'text-amber-300' : 'text-amber-700'}`}>
                        {skusFor80Pct.count} of {skusFor80Pct.totalSkus.toLocaleString('en-IN')} SKUs drive 80% of GMV
                      </span>
                    )}
                  </div>
                  <div className="p-4" style={{ height: 480 }}>
                    {topLoading || paretoData.length === 0 ? (
                      <div className={`h-full flex items-center justify-center text-sm ${t.isDark ? 'text-purple-300' : 'text-slate-500'}`}>Loading…</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={paretoData}>
                          <CartesianGrid stroke={grid} strokeDasharray="3 3" />
                          <XAxis dataKey="rank" stroke={ax} fontSize={11} label={{ value: 'SKU rank', position: 'insideBottom', offset: -2, fontSize: 10, fill: ax }} />
                          <YAxis yAxisId="left"  stroke={ax} fontSize={11} tickFormatter={(v: number) => formatAmount(v)} width={70} />
                          <YAxis yAxisId="right" orientation="right" stroke={ax} fontSize={11} tickFormatter={(v: number) => `${Math.round(v)}%`} width={40} domain={[0, 100]} />
                          <Tooltip
                            contentStyle={{ background: tipBg, border: `1px solid ${tipBorder}`, borderRadius: 8, color: tipText, fontSize: 12 }}
                            formatter={(v: any, n) => n === 'cumulativePct' ? [`${v.toFixed(1)}%`, 'Cumulative GMV %'] : [formatAmount(v), 'SKU GMV']}
                            labelFormatter={(rank, items) => `#${rank} · ${items?.[0]?.payload?.name ?? ''}`}
                          />
                          <Bar yAxisId="left"  dataKey="gmv"           fill="#a78bfa" />
                          <Line yAxisId="right" type="monotone" dataKey="cumulativePct" stroke="#fbbf24" strokeWidth={2.5} dot={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>

              {/* Brand-mix evolution — stacked area, top 5 brands + Others */}
              <div className={t.sectionCard}>
                <div className={t.sectionAccent} />
                <div className={`px-6 py-2 flex items-center justify-between ${t.isDark ? 'bg-white/5 border-b border-white/10' : 'bg-slate-50 border-b border-slate-200'}`}>
                  <h3 className={`text-sm font-bold ${t.isDark ? 'text-white' : 'text-slate-900'}`}>Brand-mix evolution · delivered GMV by month</h3>
                  <span className={`text-[11px] ${t.isDark ? 'text-purple-300/70' : 'text-slate-500'}`}>top 5 brands + Others</span>
                </div>
                <div className="p-4" style={{ height: 340 }}>
                  {trendsExtraLoading || !trendsExtra || trendsExtra.brandShare.length === 0 ? (
                    <div className={`h-full flex items-center justify-center text-sm ${t.isDark ? 'text-purple-300' : 'text-slate-500'}`}>{trendsExtraLoading ? 'Loading…' : 'No data'}</div>
                  ) : (() => {
                    const monthLabel = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                    const data = trendsExtra.brandShare.map((r) => ({ ...r, monthLabel: monthLabel[(r.month as number) - 1] || r.month }));
                    const seriesKeys = [...trendsExtra.topBrands, 'Others'];
                    const seriesColors: Record<string, string> = {};
                    trendsExtra.topBrands.forEach((b, i) => { seriesColors[b] = palette[i % palette.length]; });
                    seriesColors['Others'] = t.isDark ? '#475569' : '#94a3b8';
                    return (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data} margin={{ top: 5, right: 20, bottom: 0, left: 0 }}>
                          <CartesianGrid stroke={grid} strokeDasharray="3 3" />
                          <XAxis dataKey="monthLabel" stroke={ax} fontSize={11} />
                          <YAxis stroke={ax} fontSize={11} tickFormatter={(v: number) => formatAmount(v)} width={75} />
                          <Tooltip
                            contentStyle={{ background: tipBg, border: `1px solid ${tipBorder}`, borderRadius: 8, color: tipText, fontSize: 12 }}
                            formatter={(v: any, n) => [formatAmount(v), n]}
                          />
                          <Legend wrapperStyle={{ fontSize: 11, color: tipText }} />
                          {seriesKeys.map((k) => (
                            <Area key={k} type="monotone" dataKey={k} stackId="1" stroke={seriesColors[k]} fill={seriesColors[k]} fillOpacity={0.55} />
                          ))}
                        </AreaChart>
                      </ResponsiveContainer>
                    );
                  })()}
                </div>
              </div>

              {/* Row: Day-of-week pattern + Buyer cohort (new vs returning) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className={t.sectionCard}>
                  <div className={t.sectionAccent} />
                  <div className={`px-6 py-2 flex items-center justify-between ${t.isDark ? 'bg-white/5 border-b border-white/10' : 'bg-slate-50 border-b border-slate-200'}`}>
                    <h3 className={`text-sm font-bold ${t.isDark ? 'text-white' : 'text-slate-900'}`}>Day-of-week rhythm</h3>
                    {trendsExtra && (() => {
                      const top = [...trendsExtra.dow].sort((a, b) => b.orders - a.orders)[0];
                      return top ? <span className={`text-[11px] font-semibold ${t.isDark ? 'text-fuchsia-300' : 'text-purple-700'}`}>Peak: {top.dow} ({top.orders.toLocaleString('en-IN')})</span> : null;
                    })()}
                  </div>
                  <div className="p-4" style={{ height: 320 }}>
                    {trendsExtraLoading || !trendsExtra ? (
                      <div className={`h-full flex items-center justify-center text-sm ${t.isDark ? 'text-purple-300' : 'text-slate-500'}`}>Loading…</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={trendsExtra.dow}>
                          <CartesianGrid stroke={grid} strokeDasharray="3 3" />
                          <XAxis dataKey="dow" stroke={ax} fontSize={11} />
                          <YAxis yAxisId="left"  stroke={ax} fontSize={11} tickFormatter={(v: number) => v.toLocaleString('en-IN')} />
                          <YAxis yAxisId="right" orientation="right" stroke={ax} fontSize={11} tickFormatter={(v: number) => formatAmount(v)} width={70} />
                          <Tooltip
                            contentStyle={{ background: tipBg, border: `1px solid ${tipBorder}`, borderRadius: 8, color: tipText, fontSize: 12 }}
                            formatter={(v: any, n) => n === 'amount' ? [formatAmount(v), 'GMV'] : [v.toLocaleString('en-IN'), 'Orders']}
                          />
                          <Legend wrapperStyle={{ fontSize: 11, color: tipText }} />
                          <Bar yAxisId="left"  dataKey="orders" fill="#a78bfa" radius={[4,4,0,0]} name="Orders">
                            <LabelList dataKey="orders" position="top" formatter={(v: unknown) => Number(v).toLocaleString('en-IN')} style={{ fill: tipText, fontSize: 11, fontWeight: 700 }} />
                          </Bar>
                          <Line yAxisId="right" type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: '#10b981' }} name="GMV">
                            <LabelList dataKey="amount" position="top" formatter={(v: unknown) => formatAmount(Number(v))} style={{ fill: '#10b981', fontSize: 10, fontWeight: 600 }} />
                          </Line>
                        </ComposedChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                <div className={t.sectionCard} id="cohort-section">
                  <div className={t.sectionAccent} />
                  <div className={`px-6 py-2 flex items-center justify-between ${t.isDark ? 'bg-white/5 border-b border-white/10' : 'bg-slate-50 border-b border-slate-200'}`}>
                    <h3 className={`text-sm font-bold ${t.isDark ? 'text-white' : 'text-slate-900'}`}>Buyer cohort · new vs returning</h3>
                    {trendsExtra && (() => {
                      const tot = trendsExtra.cohort.reduce((s, r) => ({ n: s.n + r.new, r: s.r + r.returning }), { n: 0, r: 0 });
                      const sum = tot.n + tot.r;
                      const pct = sum > 0 ? (tot.r / sum) * 100 : 0;
                      return <span className={`text-[11px] font-semibold ${t.isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>Repeat rate: {pct.toFixed(1)}%</span>;
                    })()}
                  </div>
                  <div className="p-4" style={{ height: 320 }}>
                    {trendsExtraLoading || !trendsExtra || trendsExtra.cohort.length === 0 ? (
                      <div className={`h-full flex items-center justify-center text-sm ${t.isDark ? 'text-purple-300' : 'text-slate-500'}`}>{trendsExtraLoading ? 'Loading…' : 'No data'}</div>
                    ) : (() => {
                      const monthLabel = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                      const data = trendsExtra.cohort.map((r) => ({ ...r, monthLabel: monthLabel[r.month - 1] || r.month, totalBuyers: r.new + r.returning }));
                      return (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={data}>
                            <CartesianGrid stroke={grid} strokeDasharray="3 3" />
                            <XAxis dataKey="monthLabel" stroke={ax} fontSize={11} />
                            <YAxis stroke={ax} fontSize={11} tickFormatter={(v: number) => v.toLocaleString('en-IN')} />
                            <Tooltip
                              contentStyle={{ background: tipBg, border: `1px solid ${tipBorder}`, borderRadius: 8, color: tipText, fontSize: 12 }}
                              formatter={(v: any, n) => [v.toLocaleString('en-IN'), n === 'new' ? 'New buyers' : 'Returning buyers']}
                            />
                            <Legend wrapperStyle={{ fontSize: 11, color: tipText }} formatter={(v) => v === 'new' ? 'New buyers' : 'Returning buyers'} />
                            <Bar dataKey="new"       stackId="b" fill="#d946ef" radius={[0,0,0,0]}>
                              <LabelList dataKey="new" position="center" formatter={(v: unknown) => { const n = Number(v); return n > 0 ? n.toLocaleString('en-IN') : ''; }} style={{ fill: '#ffffff', fontSize: 10, fontWeight: 700 }} />
                            </Bar>
                            <Bar dataKey="returning" stackId="b" fill="#10b981" radius={[4,4,0,0]}>
                              <LabelList dataKey="returning" position="center" formatter={(v: unknown) => { const n = Number(v); return n > 0 ? n.toLocaleString('en-IN') : ''; }} style={{ fill: '#ffffff', fontSize: 10, fontWeight: 700 }} />
                              <LabelList dataKey="totalBuyers" position="top" formatter={(v: unknown) => Number(v).toLocaleString('en-IN')} style={{ fill: tipText, fontSize: 11, fontWeight: 700 }} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Row: Order-funnel snapshot + AOV trend */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className={t.sectionCard}>
                  <div className={t.sectionAccent} />
                  <div className={`px-6 py-2 flex items-center justify-between ${t.isDark ? 'bg-white/5 border-b border-white/10' : 'bg-slate-50 border-b border-slate-200'}`}>
                    <h3 className={`text-sm font-bold ${t.isDark ? 'text-white' : 'text-slate-900'}`}>Order outcome · success / in-flight / failed</h3>
                    {trendsExtra && (() => {
                      const succ = trendsExtra.funnelBuckets.find(b => b.bucket === 'success');
                      return succ ? <span className={`text-[11px] font-semibold ${t.isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>Success: {succ.sharePct.toFixed(1)}%</span> : null;
                    })()}
                  </div>
                  <div className="p-4" style={{ height: 320 }}>
                    {trendsExtraLoading || !trendsExtra || trendsExtra.funnel.length === 0 ? (
                      <div className={`h-full flex items-center justify-center text-sm ${t.isDark ? 'text-purple-300' : 'text-slate-500'}`}>{trendsExtraLoading ? 'Loading…' : 'No data'}</div>
                    ) : (() => {
                      const bucketColor: Record<string, string> = { success: '#10b981', inflight: '#38bdf8', failed: '#f43f5e' };
                      return (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart layout="vertical" data={trendsExtra.funnel} margin={{ left: 10, right: 70 }}>
                            <CartesianGrid stroke={grid} strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" stroke={ax} fontSize={11} tickFormatter={(v: any) => Number(v).toLocaleString('en-IN')} />
                            <YAxis type="category" dataKey="status" stroke={ax} fontSize={11} width={100} />
                            <Tooltip
                              contentStyle={{ background: tipBg, border: `1px solid ${tipBorder}`, borderRadius: 8, color: tipText, fontSize: 12 }}
                              formatter={(v: any, _n: any, p: any) => [`${Number(v).toLocaleString('en-IN')} orders · ${formatAmount(p.payload.amount)} · ${p.payload.sharePct.toFixed(1)}%`, p.payload.status]}
                            />
                            <Bar dataKey="orders" radius={[0, 4, 4, 0]}>
                              {trendsExtra.funnel.map((r, idx) => (<Cell key={idx} fill={bucketColor[r.bucket] || '#a78bfa'} />))}
                              <LabelList dataKey="orders" position="right" formatter={(v: unknown) => `${Number(v).toLocaleString('en-IN')}`} style={{ fill: tipText, fontSize: 11, fontWeight: 700 }} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      );
                    })()}
                  </div>
                </div>

                <div className={t.sectionCard}>
                  <div className={t.sectionAccent} />
                  <div className={`px-6 py-2 flex items-center justify-between ${t.isDark ? 'bg-white/5 border-b border-white/10' : 'bg-slate-50 border-b border-slate-200'}`}>
                    <h3 className={`text-sm font-bold ${t.isDark ? 'text-white' : 'text-slate-900'}`}>Average order value · monthly</h3>
                    {trendsExtra && trendsExtra.monthlyAov.length > 1 && (() => {
                      const f = trendsExtra.monthlyAov[0].deliveredAov;
                      const l = trendsExtra.monthlyAov[trendsExtra.monthlyAov.length - 1].deliveredAov;
                      const ch = f > 0 ? ((l - f) / f) * 100 : 0;
                      const pos = ch >= 0;
                      return <span className={`text-[11px] font-semibold ${pos ? (t.isDark ? 'text-emerald-300' : 'text-emerald-700') : (t.isDark ? 'text-rose-300' : 'text-rose-700')}`}>{pos ? '▲' : '▼'} {ch >= 0 ? '+' : ''}{ch.toFixed(1)}% delivered AOV</span>;
                    })()}
                  </div>
                  <div className="p-4" style={{ height: 320 }}>
                    {trendsExtraLoading || !trendsExtra || trendsExtra.monthlyAov.length === 0 ? (
                      <div className={`h-full flex items-center justify-center text-sm ${t.isDark ? 'text-purple-300' : 'text-slate-500'}`}>{trendsExtraLoading ? 'Loading…' : 'No data'}</div>
                    ) : (() => {
                      const monthLabel = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                      const data = trendsExtra.monthlyAov.map(r => ({ ...r, monthLabel: monthLabel[r.month - 1] || r.month }));
                      return (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={data} margin={{ top: 20, right: 20, bottom: 0, left: 0 }}>
                            <CartesianGrid stroke={grid} strokeDasharray="3 3" />
                            <XAxis dataKey="monthLabel" stroke={ax} fontSize={11} />
                            <YAxis stroke={ax} fontSize={11} tickFormatter={(v: any) => formatAmount(Number(v))} width={70} />
                            <Tooltip
                              contentStyle={{ background: tipBg, border: `1px solid ${tipBorder}`, borderRadius: 8, color: tipText, fontSize: 12 }}
                              formatter={(v: any, n: any) => [formatAmount(Number(v)), n === 'aov' ? 'AOV (all)' : 'AOV (delivered)']}
                            />
                            <Legend wrapperStyle={{ fontSize: 11, color: tipText }} formatter={(n: any) => n === 'aov' ? 'AOV (all)' : 'AOV (delivered)'} />
                            <Line type="monotone" dataKey="aov" stroke="#a78bfa" strokeWidth={2.5} dot={{ r: 4, fill: '#a78bfa' }}>
                              <LabelList dataKey="aov" position="top" formatter={(v: unknown) => formatAmount(Number(v))} style={{ fill: '#a78bfa', fontSize: 10, fontWeight: 600 }} />
                            </Line>
                            <Line type="monotone" dataKey="deliveredAov" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: '#10b981' }}>
                              <LabelList dataKey="deliveredAov" position="bottom" formatter={(v: unknown) => formatAmount(Number(v))} style={{ fill: '#10b981', fontSize: 10, fontWeight: 600 }} />
                            </Line>
                          </LineChart>
                        </ResponsiveContainer>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Row: Top 10 buyer states + Order-size distribution */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className={t.sectionCard}>
                  <div className={t.sectionAccent} />
                  <div className={`px-6 py-2 flex items-center justify-between ${t.isDark ? 'bg-white/5 border-b border-white/10' : 'bg-slate-50 border-b border-slate-200'}`}>
                    <h3 className={`text-sm font-bold ${t.isDark ? 'text-white' : 'text-slate-900'}`}>Top 10 buyer states · delivered GMV</h3>
                    {trendsExtra && trendsExtra.topStates[0] && <span className={`text-[11px] font-semibold ${t.isDark ? 'text-fuchsia-300' : 'text-purple-700'}`}>#1 {trendsExtra.topStates[0].state}: {formatAmount(trendsExtra.topStates[0].amount)}</span>}
                  </div>
                  <div className="p-4" style={{ height: 380 }}>
                    {trendsExtraLoading || !trendsExtra || trendsExtra.topStates.length === 0 ? (
                      <div className={`h-full flex items-center justify-center text-sm ${t.isDark ? 'text-purple-300' : 'text-slate-500'}`}>{trendsExtraLoading ? 'Loading…' : 'No data'}</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart layout="vertical" data={trendsExtra.topStates} margin={{ left: 10, right: 70 }}>
                          <CartesianGrid stroke={grid} strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" stroke={ax} fontSize={11} tickFormatter={(v: any) => formatAmount(Number(v))} />
                          <YAxis type="category" dataKey="state" stroke={ax} fontSize={11} width={120} interval={0} />
                          <Tooltip
                            contentStyle={{ background: tipBg, border: `1px solid ${tipBorder}`, borderRadius: 8, color: tipText, fontSize: 12 }}
                            formatter={(v: any, _n: any, p: any) => [`${formatAmount(Number(v))} · ${p.payload.orders.toLocaleString('en-IN')} orders · ${p.payload.buyers.toLocaleString('en-IN')} buyers`, p.payload.state]}
                          />
                          <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                            {trendsExtra.topStates.map((_, idx) => (<Cell key={idx} fill={palette[idx % palette.length]} />))}
                            <LabelList dataKey="amount" position="right" formatter={(v: unknown) => formatAmount(Number(v))} style={{ fill: tipText, fontSize: 11, fontWeight: 700 }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                <div className={t.sectionCard}>
                  <div className={t.sectionAccent} />
                  <div className={`px-6 py-2 flex items-center justify-between ${t.isDark ? 'bg-white/5 border-b border-white/10' : 'bg-slate-50 border-b border-slate-200'}`}>
                    <h3 className={`text-sm font-bold ${t.isDark ? 'text-white' : 'text-slate-900'}`}>Order-size distribution · delivered orders</h3>
                    {trendsExtra && trendsExtra.orderSize.length > 0 && (() => {
                      const tot = trendsExtra.orderSize.reduce((s, r) => s + r.orders, 0);
                      const top = trendsExtra.orderSize.reduce((m, r) => r.orders > m.orders ? r : m, trendsExtra.orderSize[0]);
                      return <span className={`text-[11px] font-semibold ${t.isDark ? 'text-sky-300' : 'text-sky-700'}`}>Most common: {top.bucket} ({tot > 0 ? ((top.orders / tot) * 100).toFixed(0) : 0}%)</span>;
                    })()}
                  </div>
                  <div className="p-4" style={{ height: 380 }}>
                    {trendsExtraLoading || !trendsExtra || trendsExtra.orderSize.length === 0 ? (
                      <div className={`h-full flex items-center justify-center text-sm ${t.isDark ? 'text-purple-300' : 'text-slate-500'}`}>{trendsExtraLoading ? 'Loading…' : 'No data'}</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={trendsExtra.orderSize} margin={{ top: 20, right: 20, bottom: 0, left: 0 }}>
                          <CartesianGrid stroke={grid} strokeDasharray="3 3" />
                          <XAxis dataKey="bucket" stroke={ax} fontSize={11} angle={-15} textAnchor="end" height={50} />
                          <YAxis stroke={ax} fontSize={11} tickFormatter={(v: any) => Number(v).toLocaleString('en-IN')} />
                          <Tooltip
                            contentStyle={{ background: tipBg, border: `1px solid ${tipBorder}`, borderRadius: 8, color: tipText, fontSize: 12 }}
                            formatter={(v: any, _n: any, p: any) => [`${Number(v).toLocaleString('en-IN')} orders · ${formatAmount(p.payload.amount)}`, p.payload.bucket]}
                          />
                          <Bar dataKey="orders" fill="#38bdf8" radius={[4,4,0,0]}>
                            {trendsExtra.orderSize.map((_, idx) => (<Cell key={idx} fill={['#38bdf8','#a78bfa','#d946ef','#f59e0b','#10b981','#f43f5e'][idx % 6]} />))}
                            <LabelList dataKey="orders" position="top" formatter={(v: unknown) => Number(v).toLocaleString('en-IN')} style={{ fill: tipText, fontSize: 11, fontWeight: 700 }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {bpTab === 'priceset' && (() => {
          const all = priceData?.data ?? [];
          const q = priceSearch.trim().toLowerCase();
          const filtered = all.filter((r) => {
            if (priceStatus === 'priced'   && r.unitPrice == null) return false;
            if (priceStatus === 'unpriced' && r.unitPrice != null) return false;
            if (priceBrandFilter.size > 0 && !priceBrandFilter.has(r.brandName ?? '')) return false;
            if (priceStateFilter.size > 0 && !priceStateFilter.has(r.sellerState ?? '')) return false;
            if (!q) return true;
            return [r.businessName, r.sellerName, r.productName, r.brandName, r.sellerCity, r.sellerDistrict, r.sellerState, r.pincode, r.phone]
              .filter(Boolean).some((v) => v!.toLowerCase().includes(q));
          });
          const sorted = [...filtered].sort((a, b) => {
            const cmpNum = (x: number | null, y: number | null, asc: boolean) => {
              if (x == null && y == null) return 0;
              if (x == null) return 1;
              if (y == null) return -1;
              return asc ? x - y : y - x;
            };
            switch (priceSort) {
              case 'price-asc':  return cmpNum(a.unitPrice, b.unitPrice, true);
              case 'price-desc': return cmpNum(a.unitPrice, b.unitPrice, false);
              case 'margin-asc': return cmpNum(a.margin, b.margin, true);
              case 'margin-desc':return cmpNum(a.margin, b.margin, false);
              case 'mrp-desc':   return cmpNum(a.mrp, b.mrp, false);
              case 'brand':      return (a.brandName ?? '').localeCompare(b.brandName ?? '');
            }
          });

          // Live aggregates on the filtered view
          const visPriced = sorted.filter((r) => r.unitPrice != null);
          const visAvgPrice = visPriced.length ? visPriced.reduce((s, r) => s + r.unitPrice!, 0) / visPriced.length : 0;
          const visMargins = sorted.filter((r) => r.margin != null).map((r) => r.margin!);
          const visAvgMargin = visMargins.length ? visMargins.reduce((s, v) => s + v, 0) / visMargins.length : 0;

          const marginPill = (m: number | null) => {
            if (m == null) return t.isDark ? 'text-slate-400' : 'text-slate-400';
            if (m >= 50)   return t.isDark ? 'text-emerald-300' : 'text-emerald-700';
            if (m >= 30)   return t.isDark ? 'text-amber-300'   : 'text-amber-700';
            return            t.isDark ? 'text-rose-300'    : 'text-rose-700';
          };

          return (
        <div className="flex flex-col gap-4">
          {/* Compact header */}
          <div className={t.sectionCard.replace('overflow-hidden', 'overflow-visible')}>
            <div className={t.sectionAccent} />
            <div className={`px-6 py-2 flex items-center gap-2 flex-wrap ${t.isDark ? 'bg-white/5 border-b border-white/10' : 'bg-slate-50 border-b border-slate-200'}`}>
              <span className={t.sectionTag('pivot')}>PRICE SET</span>
              <h2 className={`text-base font-bold ${t.isDark ? 'text-white' : 'text-slate-900'}`}>Seller × Product unit price</h2>
              <span className={`text-[11px] ${t.isDark ? 'text-purple-300/70' : 'text-slate-500'}`}>
                {priceData ? <>{sorted.length.toLocaleString('en-IN')} of {priceData.summary.rows.toLocaleString('en-IN')} rows · {priceData.summary.sellers} sellers · {priceData.summary.brands} brands · {priceData.summary.products.toLocaleString('en-IN')} SKUs</> : 'loading…'}
              </span>
              <div className="ml-auto">{queryBtn('priceset', 'Seller × Product unit price')}</div>
            </div>

            {/* Stat strip */}
            {priceData && (
              <div className={`px-6 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b ${t.isDark ? 'border-white/10 bg-white/[0.02]' : 'border-slate-200 bg-white'}`}>
                {[
                  { label: 'Rows in view',     value: sorted.length.toLocaleString('en-IN'),                                   tint: 'text-fuchsia-200' },
                  { label: 'Priced / unpriced',value: `${visPriced.length.toLocaleString('en-IN')} / ${(sorted.length - visPriced.length).toLocaleString('en-IN')}`, tint: 'text-emerald-200' },
                  { label: 'Avg unit price',   value: visPriced.length ? `₹${visAvgPrice.toFixed(0)}` : '—',                   tint: 'text-amber-200' },
                  { label: 'Avg margin',       value: visMargins.length ? `${visAvgMargin.toFixed(1)}%` : '—',                 tint: 'text-sky-200' },
                ].map((s, i) => (
                  <div key={i} className={`rounded-lg p-2 border ${t.isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                    <div className={`text-[10px] uppercase tracking-wider font-bold ${t.isDark ? s.tint : 'text-slate-500'}`}>{s.label}</div>
                    <div className={`text-lg font-black tabular-nums mt-0.5 ${t.isDark ? 'text-white' : 'text-slate-900'}`}>{s.value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Filter bar */}
            <div className={`px-6 py-2 flex items-center gap-2 flex-wrap ${t.isDark ? 'bg-white/5' : 'bg-white'}`}>
              <span className={t.chipLabel}>Status</span>
              <div className={`inline-flex gap-1 p-0.5 rounded-lg ${t.isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-100 border border-slate-200'}`}>
                {(['priced', 'unpriced', 'all'] as const).map((s) => {
                  const active = priceStatus === s;
                  return (
                    <button key={s} onClick={() => setPriceStatus(s)} className={`px-2.5 py-1 rounded-md text-[10px] font-bold capitalize whitespace-nowrap ${active ? (t.isDark ? 'bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white shadow-sm' : 'bg-purple-600 text-white shadow-sm') : (t.isDark ? 'text-purple-200 hover:bg-white/10' : 'text-slate-600 hover:bg-white')}`}>
                      {s === 'all' ? 'All' : s}
                    </button>
                  );
                })}
              </div>

              {/* Brand picker */}
              <div className="relative">
                <button type="button" onClick={() => { setPriceBrandOpen((v) => !v); setPriceStateOpen(false); }} className={`min-w-[160px] px-3 py-1.5 text-xs rounded-lg text-left flex items-center justify-between gap-2 ${t.isDark ? 'bg-white/10 border border-white/20 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}>
                  <span className="truncate font-semibold">
                    {priceBrandFilter.size === 0 ? <span className={t.isDark ? 'text-purple-300/70' : 'text-slate-400'}>All brands</span> : priceBrandFilter.size === 1 ? Array.from(priceBrandFilter)[0] : `${priceBrandFilter.size} brands`}
                  </span>
                  <span className={t.isDark ? 'text-purple-300 text-[10px]' : 'text-slate-400 text-[10px]'}>▾</span>
                </button>
                {priceBrandOpen && priceData && (
                  <>
                    <div className="fixed inset-0 z-[55]" onClick={() => setPriceBrandOpen(false)} />
                    <div className={`absolute top-full left-0 mt-1 z-[60] w-[280px] max-h-[420px] rounded-lg shadow-2xl flex flex-col overflow-hidden ${t.isDark ? 'bg-slate-950 border border-white/15' : 'bg-white border border-slate-200'}`}>
                      <div className={`overflow-y-auto flex-1 ${t.isDark ? 'bg-slate-950' : 'bg-white'}`}>
                        {priceData.brands.map((name) => {
                          const checked = priceBrandFilter.has(name);
                          return (
                            <label key={name} className={`flex items-center gap-2 px-3 py-2 text-xs border-b cursor-pointer ${t.isDark ? 'border-white/5 hover:bg-white/10' : 'border-slate-100 hover:bg-slate-100'} ${checked ? (t.isDark ? 'bg-fuchsia-500/15' : 'bg-purple-50') : ''}`}>
                              <input type="checkbox" checked={checked} onChange={() => setPriceBrandFilter((prev) => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; })} className="accent-fuchsia-500 w-3.5 h-3.5" />
                              <span className={t.isDark ? 'text-white' : 'text-slate-800'}>{name}</span>
                            </label>
                          );
                        })}
                      </div>
                      <div className={`p-2 border-t flex items-center justify-between gap-2 ${t.isDark ? 'border-white/10' : 'border-slate-200'}`}>
                        <button onClick={() => setPriceBrandFilter(new Set())} className={`text-[10px] ${t.isDark ? 'text-rose-300' : 'text-rose-700'}`}>Clear</button>
                        <button onClick={() => setPriceBrandOpen(false)} className="px-3 py-1 text-[11px] font-semibold rounded bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white">Done</button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* State picker */}
              <div className="relative">
                <button type="button" onClick={() => { setPriceStateOpen((v) => !v); setPriceBrandOpen(false); }} className={`min-w-[160px] px-3 py-1.5 text-xs rounded-lg text-left flex items-center justify-between gap-2 ${t.isDark ? 'bg-white/10 border border-white/20 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}>
                  <span className="truncate font-semibold">
                    {priceStateFilter.size === 0 ? <span className={t.isDark ? 'text-purple-300/70' : 'text-slate-400'}>All states</span> : priceStateFilter.size === 1 ? Array.from(priceStateFilter)[0] : `${priceStateFilter.size} states`}
                  </span>
                  <span className={t.isDark ? 'text-purple-300 text-[10px]' : 'text-slate-400 text-[10px]'}>▾</span>
                </button>
                {priceStateOpen && priceData && (
                  <>
                    <div className="fixed inset-0 z-[55]" onClick={() => setPriceStateOpen(false)} />
                    <div className={`absolute top-full left-0 mt-1 z-[60] w-[260px] max-h-[420px] rounded-lg shadow-2xl flex flex-col overflow-hidden ${t.isDark ? 'bg-slate-950 border border-white/15' : 'bg-white border border-slate-200'}`}>
                      <div className={`overflow-y-auto flex-1 ${t.isDark ? 'bg-slate-950' : 'bg-white'}`}>
                        {priceData.states.map((name) => {
                          const checked = priceStateFilter.has(name);
                          return (
                            <label key={name} className={`flex items-center gap-2 px-3 py-2 text-xs border-b cursor-pointer ${t.isDark ? 'border-white/5 hover:bg-white/10' : 'border-slate-100 hover:bg-slate-100'} ${checked ? (t.isDark ? 'bg-fuchsia-500/15' : 'bg-purple-50') : ''}`}>
                              <input type="checkbox" checked={checked} onChange={() => setPriceStateFilter((prev) => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; })} className="accent-fuchsia-500 w-3.5 h-3.5" />
                              <span className={t.isDark ? 'text-white' : 'text-slate-800'}>{name}</span>
                            </label>
                          );
                        })}
                      </div>
                      <div className={`p-2 border-t flex items-center justify-between gap-2 ${t.isDark ? 'border-white/10' : 'border-slate-200'}`}>
                        <button onClick={() => setPriceStateFilter(new Set())} className={`text-[10px] ${t.isDark ? 'text-rose-300' : 'text-rose-700'}`}>Clear</button>
                        <button onClick={() => setPriceStateOpen(false)} className="px-3 py-1 text-[11px] font-semibold rounded bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white">Done</button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <select
                value={priceSort}
                onChange={(e) => setPriceSort(e.target.value as typeof priceSort)}
                className={`px-2 py-1.5 text-xs rounded-lg ${t.isDark ? 'bg-white/10 border border-white/20 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}
              >
                <option value="price-asc">Price ↑</option>
                <option value="price-desc">Price ↓</option>
                <option value="margin-desc">Margin ↓</option>
                <option value="margin-asc">Margin ↑</option>
                <option value="mrp-desc">MRP ↓</option>
                <option value="brand">Brand A→Z</option>
              </select>

              <input
                type="text"
                value={priceSearch}
                onChange={(e) => setPriceSearch(e.target.value)}
                placeholder="Search seller / product / city / pin / phone…"
                className={t.searchInput.replace('ml-auto', '').replace('min-w-[220px]', 'flex-1 min-w-[260px]')}
              />

              {(priceBrandFilter.size > 0 || priceStateFilter.size > 0 || priceSearch || priceStatus !== 'priced') && (
                <button
                  onClick={() => { setPriceBrandFilter(new Set()); setPriceStateFilter(new Set()); setPriceSearch(''); setPriceStatus('priced'); }}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold ${t.isDark ? 'bg-rose-500/15 text-rose-200 border border-rose-400/30' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}
                >
                  ✕ Reset
                </button>
              )}

              {priceData && (
                <button
                  className={t.csvBtn}
                  onClick={() => {
                    downloadCSV(
                      `price-set-${new Date().toISOString().slice(0,10)}.csv`,
                      ['Business', 'Seller', 'Phone', 'State', 'District', 'City', 'Pin', 'Brand', 'Product', 'Size', 'Unit Price', 'Margin %', 'MRP'],
                      sorted.map((r) => [r.businessName ?? '', r.sellerName ?? '', r.phone ?? '', r.sellerState ?? '', r.sellerDistrict ?? '', r.sellerCity ?? '', r.pincode ?? '', r.brandName ?? '', r.productName ?? '', r.size ?? '', r.unitPrice ?? '', r.margin ?? '', r.mrp ?? '']),
                    );
                  }}
                >
                  ↓ CSV
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className={t.sectionCard}>
            <div className={t.sectionAccent} />
            <div className="overflow-auto" style={{ maxHeight: 720 }}>
              {priceLoading || !priceData ? (
                <div className={t.loading}>Loading price catalog…</div>
              ) : sorted.length === 0 ? (
                <div className={t.loading}>No rows match this filter</div>
              ) : (
                <table className="w-full text-sm border-separate border-spacing-0">
                  <thead className={`sticky top-0 z-20 ${t.isDark ? 'bg-slate-900/95 backdrop-blur' : 'bg-white'}`}>
                    <tr>
                      <th className={`${t.brandCell} text-left text-[10px] font-semibold uppercase tracking-wider ${t.isDark ? 'text-purple-200' : 'text-slate-500'}`}>Seller</th>
                      <th className={`${t.deliveryHeader} text-left`}>Location</th>
                      <th className={`${t.deliveryHeader} text-left`}>Brand</th>
                      <th className={`${t.deliveryHeader} text-left`}>Product</th>
                      <th className={`${t.deliveryHeader} text-right`}>MRP</th>
                      <th className={`${t.deliveryHeader} text-right`}>Unit price</th>
                      <th className={`${t.deliveryHeader} text-right`}>Margin %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.slice((pricePage - 1) * priceSize, pricePage * priceSize).map((r, idx) => (
                      <tr key={`${r.sellerId}_${r.skuId}_${idx}`} className={`${idx % 2 === 0 ? t.rowEven : t.rowOdd} ${t.rowHover}`}>
                        <td className={t.brandCell.replace('py-3', 'py-1.5')}>
                          <div className="flex items-center gap-2">
                            <span className={t.brandRowNum}>{idx + 1}</span>
                            <div className="flex flex-col min-w-0">
                              <span className={`${t.brandName} text-xs truncate`} title={r.businessName ?? ''}>{r.businessName ?? '—'}</span>
                              <span className={`text-[10px] truncate ${t.isDark ? 'text-purple-300/60' : 'text-slate-400'}`}>{r.sellerName ?? '—'}{r.phone ? ` · ${r.phone}` : ''}</span>
                            </div>
                          </div>
                        </td>
                        <td className={t.dataCell.replace('text-right', 'text-left').replace('py-3', 'py-1.5')}>
                          <div className={`text-xs ${t.isDark ? 'text-white' : 'text-slate-800'}`}>{r.sellerCity || '—'}{r.sellerState ? `, ${r.sellerState}` : ''}</div>
                          <div className={`text-[10px] ${t.isDark ? 'text-purple-300/60' : 'text-slate-400'}`}>{[r.sellerDistrict, r.pincode].filter(Boolean).join(' · ') || '—'}</div>
                        </td>
                        <td className={t.dataCell.replace('text-right', 'text-left').replace('py-3', 'py-1.5')}>
                          <span className={`text-xs font-semibold ${t.isDark ? 'text-fuchsia-200' : 'text-purple-700'}`}>{r.brandName ?? '—'}</span>
                        </td>
                        <td className={t.dataCell.replace('text-right', 'text-left').replace('py-3', 'py-1.5')}>
                          <div className={`text-xs ${t.isDark ? 'text-white' : 'text-slate-800'} max-w-[260px] truncate`} title={r.productName ?? ''}>{r.productName ?? '—'}</div>
                          {r.size && <div className={`text-[10px] ${t.isDark ? 'text-purple-300/60' : 'text-slate-400'}`}>{r.size}</div>}
                        </td>
                        <td className={t.dataCell.replace('py-3', 'py-1.5')}>
                          <span className={`text-xs font-bold tabular-nums ${t.isDark ? 'text-purple-100' : 'text-slate-700'}`}>{r.mrp != null ? `₹${r.mrp.toLocaleString('en-IN')}` : '—'}</span>
                        </td>
                        <td className={t.dataCell.replace('py-3', 'py-1.5')}>
                          {r.unitPrice != null ? (
                            <span className={`text-sm font-extrabold tabular-nums ${t.isDark ? 'text-white' : 'text-slate-900'}`}>₹{r.unitPrice.toLocaleString('en-IN')}</span>
                          ) : (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${t.isDark ? 'bg-rose-500/20 text-rose-200 border border-rose-400/40' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>not set</span>
                          )}
                        </td>
                        <td className={t.dataCell.replace('py-3', 'py-1.5')}>
                          <span className={`text-sm font-extrabold tabular-nums ${marginPill(r.margin)}`}>{r.margin != null ? `${r.margin.toFixed(1)}%` : '—'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {sorted.length > 0 && (() => {
              const total = sorted.length;
              const pages = Math.max(1, Math.ceil(total / priceSize));
              const page  = Math.min(pricePage, pages);
              const from  = (page - 1) * priceSize + 1;
              const to    = Math.min(page * priceSize, total);
              return (
                <div className={`px-6 py-2 border-t flex items-center justify-between gap-3 text-xs flex-wrap ${t.isDark ? 'border-white/10 bg-white/5 text-purple-200' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                  <div>Showing <span className={t.isDark ? 'text-white font-bold' : 'text-slate-900 font-bold'}>{from.toLocaleString('en-IN')}–{to.toLocaleString('en-IN')}</span> of {total.toLocaleString('en-IN')}</div>
                  <div className="flex items-center gap-2">
                    <span>Rows / page</span>
                    <select value={priceSize} onChange={(e) => setPriceSize(parseInt(e.target.value))} className={`px-2 py-1 rounded ${t.isDark ? 'bg-white/10 border border-white/20 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}>
                      {[25, 50, 100, 250, 500].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button onClick={() => setPricePage(1)} disabled={page === 1} className={`px-2 py-1 rounded font-bold ${page === 1 ? 'opacity-40' : ''} ${t.isDark ? 'bg-white/10 border border-white/20 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}>«</button>
                    <button onClick={() => setPricePage((p) => Math.max(1, p - 1))} disabled={page === 1} className={`px-2 py-1 rounded font-bold ${page === 1 ? 'opacity-40' : ''} ${t.isDark ? 'bg-white/10 border border-white/20 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}>‹</button>
                    <span className={t.isDark ? 'text-white font-bold' : 'text-slate-900 font-bold'}>{page} / {pages}</span>
                    <button onClick={() => setPricePage((p) => Math.min(pages, p + 1))} disabled={page === pages} className={`px-2 py-1 rounded font-bold ${page === pages ? 'opacity-40' : ''} ${t.isDark ? 'bg-white/10 border border-white/20 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}>›</button>
                    <button onClick={() => setPricePage(pages)} disabled={page === pages} className={`px-2 py-1 rounded font-bold ${page === pages ? 'opacity-40' : ''} ${t.isDark ? 'bg-white/10 border border-white/20 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}>»</button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
          );
        })()}

        {bpTab === 'alerts' && (() => {
          const all = priceData?.data ?? [];
          const flagsFor = (r: PriceRow): AlertKind[] => {
            const out: AlertKind[] = [];
            if (r.margin != null && r.margin >= 100) out.push('margin100');
            if (r.mrp == null || r.mrp === 0)         out.push('mrpMissing');
            if (r.unitPrice == null || r.unitPrice === 0) out.push('priceMissing');
            return out;
          };
          const flagged = all
            .map((r) => ({ row: r, flags: flagsFor(r) }))
            .filter((x) => x.flags.length > 0);

          const counts = {
            margin100:    flagged.filter((x) => x.flags.includes('margin100')).length,
            mrpMissing:   flagged.filter((x) => x.flags.includes('mrpMissing')).length,
            priceMissing: flagged.filter((x) => x.flags.includes('priceMissing')).length,
          };

          const q = alertSearch.trim().toLowerCase();
          const visible = flagged.filter(({ row: r, flags }) => {
            if (alertFilter !== 'all' && !flags.includes(alertFilter)) return false;
            if (alertBrandFilter.size > 0 && !alertBrandFilter.has(r.brandName ?? '')) return false;
            if (!q) return true;
            return [r.businessName, r.sellerName, r.productName, r.brandName, r.sellerCity, r.sellerDistrict, r.sellerState, r.pincode, r.phone]
              .filter(Boolean).some((v) => v!.toLowerCase().includes(q));
          });

          const alertCards: Array<{ key: 'all' | AlertKind; label: string; sub: string; count: number; tint: string; ring: string; }> = [
            { key: 'all',          label: 'All alerts',         sub: 'rows with ≥1 issue', count: flagged.length, tint: t.isDark ? 'from-fuchsia-500/30 to-purple-500/10 text-fuchsia-200' : 'from-purple-100 to-indigo-100 text-purple-700', ring: 'ring-fuchsia-400/60' },
            { key: 'margin100',    label: 'Margin 100 %',       sub: 'looks too good to be true', count: counts.margin100, tint: t.isDark ? 'from-amber-500/30 to-orange-500/10 text-amber-200' : 'from-amber-100 to-orange-100 text-amber-700', ring: 'ring-amber-400/60' },
            { key: 'mrpMissing',   label: 'MRP missing / 0',    sub: 'consumerSellingPrice is null or zero', count: counts.mrpMissing, tint: t.isDark ? 'from-rose-500/30 to-red-500/10 text-rose-200' : 'from-rose-100 to-red-100 text-rose-700', ring: 'ring-rose-400/60' },
            { key: 'priceMissing', label: 'Unit price missing', sub: 'no slab price set', count: counts.priceMissing, tint: t.isDark ? 'from-sky-500/30 to-blue-500/10 text-sky-200' : 'from-sky-100 to-blue-100 text-sky-700', ring: 'ring-sky-400/60' },
          ];

          const flagChip = (k: AlertKind) => {
            const map: Record<AlertKind, { label: string; cls: string }> = {
              margin100:    { label: 'margin 100%',    cls: t.isDark ? 'bg-amber-500/20 text-amber-200 border-amber-400/40' : 'bg-amber-100 text-amber-700 border-amber-200' },
              mrpMissing:   { label: 'MRP 0/null',     cls: t.isDark ? 'bg-rose-500/20 text-rose-200 border-rose-400/40'    : 'bg-rose-50 text-rose-700 border-rose-200' },
              priceMissing: { label: 'price not set',  cls: t.isDark ? 'bg-sky-500/20 text-sky-200 border-sky-400/40'       : 'bg-sky-50 text-sky-700 border-sky-200' },
            };
            const m = map[k];
            return <span key={k} className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${m.cls}`}>{m.label}</span>;
          };

          return (
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className={t.sectionCard.replace('overflow-hidden', 'overflow-visible')}>
            <div className={t.sectionAccent} />
            <div className={`px-6 py-2 flex items-center gap-2 flex-wrap ${t.isDark ? 'bg-white/5 border-b border-white/10' : 'bg-slate-50 border-b border-slate-200'}`}>
              <span className={t.sectionTag('pivot')}>ALERTS</span>
              <h2 className={`text-base font-bold ${t.isDark ? 'text-white' : 'text-slate-900'}`}>Data-quality flags on the price catalog</h2>
              <span className={`text-[11px] ${t.isDark ? 'text-purple-300/70' : 'text-slate-500'}`}>
                {priceData ? <>{flagged.length.toLocaleString('en-IN')} of {priceData.summary.rows.toLocaleString('en-IN')} catalog rows have ≥1 issue</> : 'loading…'}
              </span>
              <div className="ml-auto">{queryBtn('priceset', 'Alerts — price catalog query')}</div>
            </div>

            {/* Alert cards */}
            <div className={`px-6 py-3 grid grid-cols-2 lg:grid-cols-4 gap-3 border-b ${t.isDark ? 'border-white/10 bg-white/[0.02]' : 'border-slate-200 bg-white'}`}>
              {alertCards.map((c) => {
                const active = alertFilter === c.key;
                return (
                  <button
                    key={c.key}
                    onClick={() => setAlertFilter(c.key)}
                    className={`text-left rounded-xl p-3 border overflow-hidden transition-all ${t.isDark ? `bg-gradient-to-br ${c.tint} backdrop-blur-xl` : `bg-gradient-to-br ${c.tint} shadow-sm`} ${active ? `ring-2 ${c.ring}` : 'border-white/10 hover:-translate-y-0.5'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] uppercase tracking-wider font-bold">{c.label}</div>
                      <span className={`text-[9px] font-bold ${t.isDark ? 'text-white/60' : 'text-slate-500'}`}>{active ? 'filtering ↓' : ''}</span>
                    </div>
                    <div className={`text-2xl font-black tabular-nums mt-0.5 ${t.isDark ? 'text-white' : 'text-slate-900'}`}>{c.count.toLocaleString('en-IN')}</div>
                    <div className={`text-[10px] mt-0.5 ${t.isDark ? 'text-white/60' : 'text-slate-500'}`}>{c.sub}</div>
                  </button>
                );
              })}
            </div>

            {/* Filter bar */}
            <div className={`px-6 py-2 flex items-center gap-2 flex-wrap ${t.isDark ? 'bg-white/5' : 'bg-white'}`}>
              <span className={t.chipLabel}>Filter</span>

              {/* Brand picker */}
              <div className="relative">
                <button type="button" onClick={() => setAlertBrandOpen((v) => !v)} className={`min-w-[160px] px-3 py-1.5 text-xs rounded-lg text-left flex items-center justify-between gap-2 ${t.isDark ? 'bg-white/10 border border-white/20 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}>
                  <span className="truncate font-semibold">
                    {alertBrandFilter.size === 0 ? <span className={t.isDark ? 'text-purple-300/70' : 'text-slate-400'}>All brands</span> : alertBrandFilter.size === 1 ? Array.from(alertBrandFilter)[0] : `${alertBrandFilter.size} brands`}
                  </span>
                  <span className={t.isDark ? 'text-purple-300 text-[10px]' : 'text-slate-400 text-[10px]'}>▾</span>
                </button>
                {alertBrandOpen && priceData && (
                  <>
                    <div className="fixed inset-0 z-[55]" onClick={() => setAlertBrandOpen(false)} />
                    <div className={`absolute top-full left-0 mt-1 z-[60] w-[280px] max-h-[420px] rounded-lg shadow-2xl flex flex-col overflow-hidden ${t.isDark ? 'bg-slate-950 border border-white/15' : 'bg-white border border-slate-200'}`}>
                      <div className={`overflow-y-auto flex-1 ${t.isDark ? 'bg-slate-950' : 'bg-white'}`}>
                        {priceData.brands.map((name) => {
                          const checked = alertBrandFilter.has(name);
                          return (
                            <label key={name} className={`flex items-center gap-2 px-3 py-2 text-xs border-b cursor-pointer ${t.isDark ? 'border-white/5 hover:bg-white/10' : 'border-slate-100 hover:bg-slate-100'} ${checked ? (t.isDark ? 'bg-fuchsia-500/15' : 'bg-purple-50') : ''}`}>
                              <input type="checkbox" checked={checked} onChange={() => setAlertBrandFilter((prev) => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; })} className="accent-fuchsia-500 w-3.5 h-3.5" />
                              <span className={t.isDark ? 'text-white' : 'text-slate-800'}>{name}</span>
                            </label>
                          );
                        })}
                      </div>
                      <div className={`p-2 border-t flex items-center justify-between gap-2 ${t.isDark ? 'border-white/10' : 'border-slate-200'}`}>
                        <button onClick={() => setAlertBrandFilter(new Set())} className={`text-[10px] ${t.isDark ? 'text-rose-300' : 'text-rose-700'}`}>Clear</button>
                        <button onClick={() => setAlertBrandOpen(false)} className="px-3 py-1 text-[11px] font-semibold rounded bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white">Done</button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <input
                type="text"
                value={alertSearch}
                onChange={(e) => setAlertSearch(e.target.value)}
                placeholder="Search seller / product / city / phone…"
                className={t.searchInput.replace('ml-auto', '').replace('min-w-[220px]', 'flex-1 min-w-[260px]')}
              />

              {(alertFilter !== 'all' || alertBrandFilter.size > 0 || alertSearch) && (
                <button
                  onClick={() => { setAlertFilter('all'); setAlertBrandFilter(new Set()); setAlertSearch(''); }}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold ${t.isDark ? 'bg-rose-500/15 text-rose-200 border border-rose-400/30' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}
                >
                  ✕ Reset
                </button>
              )}

              {priceData && (
                <button
                  className={t.csvBtn}
                  onClick={() => {
                    downloadCSV(
                      `price-alerts-${new Date().toISOString().slice(0,10)}.csv`,
                      ['Alerts', 'Business', 'Seller', 'Phone', 'State', 'City', 'Brand', 'Product', 'MRP', 'Unit Price', 'Margin %'],
                      visible.map(({ row: r, flags }) => [flags.join('|'), r.businessName ?? '', r.sellerName ?? '', r.phone ?? '', r.sellerState ?? '', r.sellerCity ?? '', r.brandName ?? '', r.productName ?? '', r.mrp ?? '', r.unitPrice ?? '', r.margin ?? '']),
                    );
                  }}
                >
                  ↓ CSV
                </button>
              )}
            </div>
          </div>

          {/* Flagged-row table */}
          <div className={t.sectionCard}>
            <div className={t.sectionAccent} />
            <div className="overflow-auto" style={{ maxHeight: 720 }}>
              {priceLoading || !priceData ? (
                <div className={t.loading}>Loading catalog…</div>
              ) : visible.length === 0 ? (
                <div className={`px-8 py-12 text-center text-sm ${t.isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>✓ No data-quality alerts for this filter</div>
              ) : (
                <table className="w-full text-sm border-separate border-spacing-0">
                  <thead className={`sticky top-0 z-20 ${t.isDark ? 'bg-slate-900/95 backdrop-blur' : 'bg-white'}`}>
                    <tr>
                      <th className={`${t.brandCell} text-left text-[10px] font-semibold uppercase tracking-wider ${t.isDark ? 'text-purple-200' : 'text-slate-500'}`}>Seller</th>
                      <th className={`${t.deliveryHeader} text-left`}>Brand</th>
                      <th className={`${t.deliveryHeader} text-left`}>Product</th>
                      <th className={`${t.deliveryHeader} text-right`}>MRP</th>
                      <th className={`${t.deliveryHeader} text-right`}>Unit price</th>
                      <th className={`${t.deliveryHeader} text-right`}>Margin</th>
                      <th className={`${t.deliveryHeader} text-left min-w-[200px]`}>Alerts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.slice((alertPage - 1) * alertSize, alertPage * alertSize).map(({ row: r, flags }, idx) => {
                      const bad = (k: AlertKind) => flags.includes(k);
                      const cellRed = t.isDark ? 'bg-rose-500/10 text-rose-200 font-extrabold' : 'bg-rose-50 text-rose-700 font-extrabold';
                      const cellAmber = t.isDark ? 'bg-amber-500/10 text-amber-200 font-extrabold' : 'bg-amber-50 text-amber-700 font-extrabold';
                      return (
                        <tr key={`${r.sellerId}_${r.skuId}_${idx}`} className={`${idx % 2 === 0 ? t.rowEven : t.rowOdd} ${t.rowHover}`}>
                          <td className={t.brandCell.replace('py-3', 'py-1.5')}>
                            <div className="flex items-center gap-2">
                              <span className={t.brandRowNum}>{idx + 1}</span>
                              <div className="flex flex-col min-w-0">
                                <span className={`${t.brandName} text-xs truncate`} title={r.businessName ?? ''}>{r.businessName ?? '—'}</span>
                                <span className={`text-[10px] truncate ${t.isDark ? 'text-purple-300/60' : 'text-slate-400'}`}>{[r.sellerName, r.phone, r.sellerCity].filter(Boolean).join(' · ') || '—'}</span>
                              </div>
                            </div>
                          </td>
                          <td className={t.dataCell.replace('text-right', 'text-left').replace('py-3', 'py-1.5')}>
                            <span className={`text-xs font-semibold ${t.isDark ? 'text-fuchsia-200' : 'text-purple-700'}`}>{r.brandName ?? '—'}</span>
                          </td>
                          <td className={t.dataCell.replace('text-right', 'text-left').replace('py-3', 'py-1.5')}>
                            <div className={`text-xs ${t.isDark ? 'text-white' : 'text-slate-800'} max-w-[280px] truncate`} title={r.productName ?? ''}>{r.productName ?? '—'}</div>
                            {r.size && <div className={`text-[10px] ${t.isDark ? 'text-purple-300/60' : 'text-slate-400'}`}>{r.size}</div>}
                          </td>
                          <td className={`${t.dataCell.replace('py-3', 'py-1.5')} ${bad('mrpMissing') ? cellRed : ''}`}>
                            <span className="text-xs tabular-nums">{r.mrp == null ? 'NULL' : r.mrp === 0 ? '0' : `₹${r.mrp.toLocaleString('en-IN')}`}</span>
                          </td>
                          <td className={`${t.dataCell.replace('py-3', 'py-1.5')} ${bad('priceMissing') ? cellRed : ''}`}>
                            <span className="text-xs tabular-nums">{r.unitPrice == null ? 'NULL' : r.unitPrice === 0 ? '0' : `₹${r.unitPrice.toLocaleString('en-IN')}`}</span>
                          </td>
                          <td className={`${t.dataCell.replace('py-3', 'py-1.5')} ${bad('margin100') ? cellAmber : ''}`}>
                            <span className="text-xs tabular-nums">{r.margin == null ? '—' : `${r.margin.toFixed(1)}%`}</span>
                          </td>
                          <td className={t.dataCell.replace('text-right', 'text-left').replace('py-3', 'py-1.5')}>
                            <div className="flex items-center gap-1 flex-wrap">{flags.map((k) => flagChip(k))}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {visible.length > 0 && (() => {
              const total = visible.length;
              const pages = Math.max(1, Math.ceil(total / alertSize));
              const page  = Math.min(alertPage, pages);
              const from  = (page - 1) * alertSize + 1;
              const to    = Math.min(page * alertSize, total);
              return (
                <div className={`px-6 py-2 border-t flex items-center justify-between gap-3 text-xs flex-wrap ${t.isDark ? 'border-white/10 bg-white/5 text-purple-200' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                  <div>Showing <span className={t.isDark ? 'text-white font-bold' : 'text-slate-900 font-bold'}>{from.toLocaleString('en-IN')}–{to.toLocaleString('en-IN')}</span> of {total.toLocaleString('en-IN')} alerts</div>
                  <div className="flex items-center gap-2">
                    <span>Rows / page</span>
                    <select value={alertSize} onChange={(e) => setAlertSize(parseInt(e.target.value))} className={`px-2 py-1 rounded ${t.isDark ? 'bg-white/10 border border-white/20 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}>
                      {[25, 50, 100, 250].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button onClick={() => setAlertPage(1)} disabled={page === 1} className={`px-2 py-1 rounded font-bold ${page === 1 ? 'opacity-40' : ''} ${t.isDark ? 'bg-white/10 border border-white/20 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}>«</button>
                    <button onClick={() => setAlertPage((p) => Math.max(1, p - 1))} disabled={page === 1} className={`px-2 py-1 rounded font-bold ${page === 1 ? 'opacity-40' : ''} ${t.isDark ? 'bg-white/10 border border-white/20 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}>‹</button>
                    <span className={t.isDark ? 'text-white font-bold' : 'text-slate-900 font-bold'}>{page} / {pages}</span>
                    <button onClick={() => setAlertPage((p) => Math.min(pages, p + 1))} disabled={page === pages} className={`px-2 py-1 rounded font-bold ${page === pages ? 'opacity-40' : ''} ${t.isDark ? 'bg-white/10 border border-white/20 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}>›</button>
                    <button onClick={() => setAlertPage(pages)} disabled={page === pages} className={`px-2 py-1 rounded font-bold ${page === pages ? 'opacity-40' : ''} ${t.isDark ? 'bg-white/10 border border-white/20 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}>»</button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
          );
        })()}

          </div>
          {/* /Tab content */}
        </div>
        {/* /Vertical nav + content */}

      </div>

      <MbsRichDrillModal
        open={!!drill}
        onClose={closeDrill}
        rows={drillRows}
        loading={drillLoading}
        error={drillError}
        titleMain={drill ? (
          <>
            {drill.brand}
            {drill.sku && (
              <span className="text-slate-500 text-base font-normal"> · {drill.sku.label}</span>
            )}
          </>
        ) : ''}
        titleSub={drill ? [
          drill.brand,
          drill.sku?.label,
          'drill',
          drill.metric === 'amount' ? '₹ Value' : drill.metric === 'buyers' ? 'Buyers' : drill.metric === 'qty' ? 'Units' : 'Orders',
        ].filter(Boolean).join(' · ') : ''}
        csvFilename={drill ? `brand-${drill.brand}${drill.sku ? `-sku-${drill.sku.id}` : ''}-${currentYear}.csv` : 'brand-drill.csv'}
        resetKey={drill ? `${drill.brand}|${drill.sku?.id ?? ''}` : ''}
      />

      <MbsRichDrillModal
        open={!!mbsDrill}
        onClose={closeMbsDrill}
        rows={mbsDrillRows}
        loading={mbsDrillLoading}
        error={mbsDrillError}
        titleMain={mbsDrill ? (
          <>
            {mbsDrill.status ?? 'All statuses'}
            {mbsDrill.deliveryStatus !== undefined && (
              <span className="text-slate-500 text-base font-normal"> · {mbsDrill.deliveryStatus ?? 'NULL delivery'}</span>
            )}
            <span className="text-slate-500 text-base font-normal"> — {mbsDrill.month != null ? `${MONTH_NAMES[mbsDrill.month - 1]} ${currentYear}` : `${currentYear} (all months)`}</span>
          </>
        ) : ''}
        titleSub={mbsDrill ? [
          mbsDrill.status ?? 'All statuses',
          mbsDrill.deliveryStatus !== undefined ? (mbsDrill.deliveryStatus ?? 'NULL delivery') : null,
          mbsDrill.month != null ? `${MONTH_NAMES[mbsDrill.month - 1]} ${currentYear}` : `${currentYear}`,
          mbsDrill.brandOverride ? `Brand: ${mbsDrill.brandOverride}` : (mbsBrands.size > 0 ? `${mbsBrands.size} brand${mbsBrands.size === 1 ? '' : 's'}` : null),
          'drill',
          mbsDrill.metric === 'amount' ? '₹ Value' : mbsDrill.metric === 'buyers' ? 'Buyers' : 'Orders',
        ].filter(Boolean).join(' · ') : ''}
        isRejectedContext={(mbsDrill?.status ?? '').toUpperCase() === 'REJECTED'}
        csvFilename={mbsDrill ? `mbs-drill-${mbsDrill.status ?? 'all'}-${mbsDrill.deliveryStatus === undefined ? 'all' : (mbsDrill.deliveryStatus ?? 'null')}-${mbsDrill.month ? MONTH_NAMES[mbsDrill.month - 1] : 'all'}-${mbsDrill.brandOverride || (mbsBrands.size > 0 ? Array.from(mbsBrands).join('+') : 'all-brands')}-${currentYear}.csv` : 'mbs-drill.csv'}
        resetKey={mbsDrill ? `${mbsDrill.status}|${mbsDrill.deliveryStatus}|${mbsDrill.month}|${mbsDrill.brandOverride}` : ''}
      />

      <MbsRichDrillModal
        open={!!productDrill}
        onClose={closeProductDrill}
        rows={productDrillRows}
        loading={productDrillLoading}
        error={productDrillError}
        titleMain={productDrill ? (
          <>
            {productDrill.skuLabel}
            {productDrill.brandName && (
              <span className="text-slate-500 text-base font-normal"> · {productDrill.brandName}</span>
            )}
            <span className="text-slate-500 text-base font-normal"> — {productDrill.month != null ? `${MONTH_NAMES[productDrill.month - 1]} ${currentYear}` : `${currentYear} (all months)`}</span>
          </>
        ) : ''}
        titleSub={productDrill ? [
          productDrill.skuLabel,
          productDrill.brandName,
          productDrill.size,
          productDrill.month != null ? `${MONTH_NAMES[productDrill.month - 1]} ${currentYear}` : `${currentYear}`,
          'drill',
          productDrill.metric === 'amount' ? '₹ Value' : productDrill.metric === 'buyers' ? 'Buyers' : 'Orders',
        ].filter(Boolean).join(' · ') : ''}
        csvFilename={productDrill ? `product-${productDrill.skuId}-${productDrill.month ? MONTH_NAMES[productDrill.month - 1] : 'all'}-${currentYear}.csv` : 'product-drill.csv'}
        resetKey={productDrill ? `${productDrill.skuId}|${productDrill.month}` : ''}
      />

      {queryModalState && (
        <QueryModal
          title={queryModalState.title}
          queries={queryModalState.queries}
          onClose={() => setQueryModalState(null)}
        />
      )}

      <style jsx>{`
        .animation-delay-2000 { animation-delay: 2s; }
      `}</style>
    </div>
  );
}
