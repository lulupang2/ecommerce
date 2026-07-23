'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Activity, AlertTriangle, BarChart3, Bell, Boxes, ChevronDown, ClipboardList, FileClock, LayoutDashboard,
  Menu, Package, PackageCheck, PanelLeftClose, PanelLeftOpen, RotateCcw, Search, Settings,
  ShoppingCart, Star, Truck, UserRound, Users, Warehouse, X, PanelsTopLeft, TicketPercent,
} from 'lucide-react';
import { authHeaders, readSession } from '@/lib/session';

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:18080/api';
const groups = [
  { label: '인사이트', items: [
    { href: '/admin/', label: '대시보드', icon: LayoutDashboard, permission: 'dashboard.read' },
    { href: '/admin/analytics/', label: '운영 분석', icon: BarChart3, permission: 'dashboard.read' },
  ] },
  { label: '판매 운영', items: [
    { href: '/admin/orders/', label: '주문 관리', icon: ShoppingCart, permission: 'orders.read' },
    { href: '/admin/shipping/', label: '배송 관리', icon: Truck, permission: 'orders.read' },
    { href: '/admin/returns/', label: '반품·환불', icon: RotateCcw, permission: 'orders.read' },
  ] },
  { label: '상품·물류', items: [
    { href: '/admin/products/manage/', label: '상품 관리', icon: Package, permission: 'products.read' },
    { href: '/admin/storefront/', label: '스토어 진열 CMS', icon: PanelsTopLeft, permission: 'products.read' },
    { href: '/admin/coupons/', label: '쿠폰 관리', icon: TicketPercent, permission: 'orders.read' },
    { href: '/admin/inventory/', label: '재고 관리', icon: Boxes, permission: 'inventory.read' },
    { href: '/admin/procurement/', label: '공급사·발주', icon: ClipboardList, permission: 'inventory.read' },
  ] },
  { label: '고객 운영', items: [
    { href: '/admin/members/', label: '회원 관리', icon: Users, permission: 'members.read' },
    { href: '/admin/reviews/', label: '리뷰 관리', icon: Star, permission: 'reviews.update' },
  ] },
  { label: '시스템', items: [
    { href: '/admin/system/', label: '시스템 상태', icon: Activity, permission: 'admin.manage' },
    { href: '/admin/audit/', label: '감사 로그', icon: FileClock, permission: 'audit.read' },
    { href: '/admin/settings/', label: '권한 설정', icon: Settings, permission: 'admin.manage' },
  ] },
];

export default function AdminShell({ children }) {
  const pathname = usePathname();
  const [session, setSession] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [warehouse, setWarehouse] = useState('');
  const permissions = session?.user?.permissions || [];
  const isSuper = session?.user?.role === 'admin' || session?.user?.adminRole === 'super_admin';

  useEffect(() => {
    const current = readSession();
    setSession(current);
    if (!current?.user) return;
    const headers = authHeaders();
    Promise.all([
      fetch(`${API}/admin/alerts`, { credentials: 'include', headers }).then(response => response.ok ? response.json() : { items: [] }),
      fetch(`${API}/admin/warehouses`, { credentials: 'include', headers }).then(response => response.ok ? response.json() : { items: [] }),
    ]).then(([alertData, warehouseData]) => { setAlerts(alertData.items || []); setWarehouses(warehouseData.items || []); }).catch(() => {});
  }, [pathname]);

  const visibleGroups = useMemo(() => groups.map(group => ({ ...group, items: group.items.filter(item => isSuper || permissions.includes(item.permission)) })).filter(group => group.items.length), [isSuper, permissions]);
  const sidebar = <div className="flex h-full flex-col bg-[#101828] text-slate-200">
    <div className="flex h-18 items-center justify-between border-b border-white/10 px-5">
      {!collapsed && <Link href="/admin/" className="text-lg font-black tracking-[-.08em] text-white">TECH<span className="text-indigo-400">ZONE</span><small className="ml-2 text-[9px] tracking-normal text-slate-500">OPS</small></Link>}
      <button onClick={() => setCollapsed(value => !value)} className="hidden rounded-lg p-2 text-slate-400 hover:bg-white/10 lg:block">{collapsed ? <PanelLeftOpen size={18}/> : <PanelLeftClose size={18}/>}</button>
      <button onClick={() => setMobileOpen(false)} className="rounded-lg p-2 lg:hidden"><X size={19}/></button>
    </div>
    <nav className="flex-1 overflow-y-auto px-3 py-5">
      {visibleGroups.map(group => <section className="mb-6" key={group.label}>{!collapsed && <p className="mb-2 px-3 text-[10px] font-bold tracking-[.16em] text-slate-500">{group.label}</p>}<div className="grid gap-1">{group.items.map(item => { const Icon = item.icon; const active = pathname === item.href || (item.href !== '/admin/' && pathname.startsWith(item.href)); return <Link title={collapsed ? item.label : undefined} key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${active ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-950/30' : 'text-slate-400 hover:bg-white/5 hover:text-white'} ${collapsed ? 'justify-center' : ''}`}><Icon size={18}/>{!collapsed && item.label}</Link>; })}</div></section>)}
    </nav>
    {!collapsed && <div className="border-t border-white/10 p-4"><Link href="/" className="flex items-center gap-3 rounded-xl p-3 text-xs text-slate-400 hover:bg-white/5"><PackageCheck size={17}/> 고객 스토어 보기</Link></div>}
  </div>;

  return <div className="min-h-screen bg-[#f5f7fb] text-slate-950">
    <aside className={`fixed inset-y-0 left-0 z-40 hidden transition-all duration-200 lg:block ${collapsed ? 'w-20' : 'w-64'}`}>{sidebar}</aside>
    {mobileOpen && <><button aria-label="메뉴 닫기" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"/><aside className="fixed inset-y-0 left-0 z-50 w-72 lg:hidden">{sidebar}</aside></>}
    <div className={`transition-all duration-200 ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
      <header className="sticky top-0 z-30 flex h-18 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:px-7">
        <button onClick={() => setMobileOpen(true)} className="rounded-xl border border-slate-200 p-2 lg:hidden"><Menu size={19}/></button>
        <form className="relative hidden max-w-md flex-1 md:block" onSubmit={event => { event.preventDefault(); const value = new FormData(event.currentTarget).get('q'); if (value) window.location.href = `/admin/products/manage/?q=${encodeURIComponent(value)}`; }}><Search size={16} className="absolute left-3 top-2.5 text-slate-400"/><input name="q" placeholder="주문번호, 상품명, SKU 통합 검색" className="w-full rounded-xl bg-slate-100 py-2 pl-10 pr-4 text-sm outline-none ring-indigo-500 focus:ring-2"/></form>
        <div className="ml-auto flex items-center gap-2">
          <label className="hidden items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold md:flex"><Warehouse size={15} className="text-slate-400"/><select value={warehouse} onChange={event => { setWarehouse(event.target.value); localStorage.setItem('techzone-admin-warehouse', event.target.value); window.dispatchEvent(new CustomEvent('techzone:warehouse', { detail: event.target.value })); }} className="bg-transparent outline-none"><option value="">전체 창고</option>{warehouses.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select><ChevronDown size={13}/></label>
          <Link href="/admin/alerts/" className="relative rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50"><Bell size={18}/>{alerts.length > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">{Math.min(alerts.length, 99)}</span>}</Link>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 p-1.5 pr-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600"><UserRound size={17}/></span><div className="hidden leading-tight sm:block"><p className="text-xs font-bold">{session?.user?.name || '관리자'}</p><p className="text-[10px] text-slate-400">{roleLabel(session?.user?.adminRole)}</p></div></div>
        </div>
      </header>
      {children}
    </div>
  </div>;
}
function roleLabel(role) { return ({ super_admin: '슈퍼관리자', cs: 'CS 담당자', product_md: '상품 MD', logistics: '물류 담당자', finance: '재무 담당자', viewer: '조회 전용' })[role] || '관리자'; }
