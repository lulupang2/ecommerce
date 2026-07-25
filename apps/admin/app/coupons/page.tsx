'use client';

import { useEffect, useMemo, useState } from 'react';
import { BadgePercent, CalendarDays, Plus, Search, TicketPercent, TrendingUp, Users } from 'lucide-react';
import { readSession } from '@techzone/api-client/session';
import { api, money } from '@techzone/api-client/store';

const statusLabels = { active: '활성', inactive: '비활성', expired: '만료' };

export default function Page() {
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('all');
  const session = typeof window === 'undefined' ? null : readSession();
  const token = session?.accessToken || session?.token;

  async function load() {
    if (!token) return;
    setItems((await api('/coupons/admin', { headers: { authorization: `Bearer ${token}` } })).items || []);
  }

  useEffect(() => {
    load().catch(() => setMessage('쿠폰 정보를 불러오지 못했습니다.'));
  }, [token]);

  async function create(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api('/coupons/admin', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({
        code: form.get('code'),
        type: 'percent',
        value: Number(form.get('value')),
        minOrderAmount: Number(form.get('min')),
        maxDiscountAmount: Number(form.get('max')),
        status: 'active',
      }),
    });
    setOpen(false);
    setMessage('쿠폰을 등록했습니다.');
    load();
  }

  const filtered = useMemo(() => items.filter(item => {
    return (status === 'all' || item.status === status) && String(item.code || '').toLowerCase().includes(keyword.toLowerCase());
  }), [items, keyword, status]);

  const active = items.filter(item => item.status === 'active').length;
  const redeemed = items.reduce((sum, item) => sum + Number(item.redemption_count || 0), 0);
  const maxBenefit = Math.max(0, ...items.map(item => Number(item.max_discount_amount || 0)));

  return (
    <main className="p-4 md:p-7 xl:p-9">
      <div className="mx-auto max-w-[1540px]">
        <section className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-6 text-white md:p-9">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-black tracking-[.24em] text-cyan-300">PROMOTION OPS</p>
              <h1 className="mt-3 text-4xl font-black tracking-[-.06em] md:text-5xl">쿠폰 관리</h1>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">
                TECHZONE10 같은 전환 쿠폰을 운영하고, 최소 주문금액·할인 한도·사용량을 한 화면에서 확인합니다.
              </p>
            </div>
            <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950"><Plus size={16} /> 쿠폰 등록</button>
          </div>
          <div className="mt-8 grid gap-3 md:grid-cols-4">
            <Metric icon={<TicketPercent />} label="전체 쿠폰" value={`${items.length}개`} />
            <Metric icon={<BadgePercent />} label="활성 쿠폰" value={`${active}개`} />
            <Metric icon={<Users />} label="총 사용" value={`${redeemed}건`} />
            <Metric icon={<TrendingUp />} label="최대 혜택" value={money(maxBenefit)} />
          </div>
        </section>

        <section className="mt-6 rounded-3xl border bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
            <label className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input value={keyword} onChange={event => setKeyword(event.target.value)} className="h-12 w-full rounded-2xl border bg-slate-50 pl-11 pr-4 text-sm outline-none focus:border-cyan-400" placeholder="쿠폰 코드 검색" />
            </label>
            <select value={status} onChange={event => setStatus(event.target.value)} className="h-12 rounded-2xl border bg-white px-4 text-sm">
              <option value="all">전체 상태</option>
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button onClick={() => { setKeyword(''); setStatus('all'); }} className="h-12 rounded-2xl border text-sm font-bold">필터 초기화</button>
          </div>
        </section>

        {message && <p className="mt-5 rounded-xl bg-cyan-50 p-4 text-sm font-bold text-cyan-800">{message}</p>}

        <div className="mt-6 grid gap-4">
          {filtered.map(item => <CouponCard key={item.id} item={item} />)}
          {!filtered.length && <div className="rounded-3xl bg-white p-14 text-center text-sm text-slate-400">조건에 맞는 쿠폰이 없습니다.</div>}
        </div>

        {open && <CreateCouponDialog onClose={() => setOpen(false)} onSubmit={create} />}
      </div>
    </main>
  );
}

function CouponCard({ item }) {
  const statusTone = item.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500';
  return (
    <article className="grid items-center gap-5 rounded-3xl border bg-white p-5 shadow-sm md:grid-cols-[72px_1fr_repeat(4,150px)]">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-cyan-50 text-cyan-700"><TicketPercent /></span>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-xl">{item.code}</b>
          <span className={`rounded-full px-3 py-1 text-[11px] font-black ${statusTone}`}>{statusLabels[item.status] || item.status}</span>
        </div>
        <p className="mt-2 flex items-center gap-1 text-xs text-slate-400"><CalendarDays size={13} /> 주문서에서 서버 가격 기준으로 할인 한도를 다시 검증합니다.</p>
      </div>
      <Stat label="할인율" value={`${item.value}%`} />
      <Stat label="최소 주문" value={money(item.min_order_amount)} />
      <Stat label="최대 할인" value={money(item.max_discount_amount)} />
      <Stat label="사용량" value={`${item.redemption_count}건`} />
    </article>
  );
}

function CreateCouponDialog({ onClose, onSubmit }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
      <form onSubmit={onSubmit} className="grid w-full max-w-lg gap-4 rounded-3xl bg-white p-7 shadow-2xl">
        <div>
          <p className="text-xs font-black tracking-[.2em] text-cyan-700">NEW COUPON</p>
          <h2 className="mt-2 text-2xl font-black">쿠폰 등록</h2>
          <p className="mt-2 text-sm text-slate-500">포트폴리오 데모에서는 퍼센트 할인 쿠폰을 Mock 정책으로 생성합니다.</p>
        </div>
        {[
          ['쿠폰 코드', 'code', 'TECHZONE10'],
          ['할인율(%)', 'value', '10'],
          ['최소 주문금액', 'min', '300000'],
          ['최대 할인금액', 'max', '50000'],
        ].map(([label, name, placeholder]) => (
          <label key={name} className="grid gap-2 text-xs font-bold">
            {label}
            <input required name={name} type={name === 'code' ? 'text' : 'number'} placeholder={placeholder} className="rounded-xl border p-3 text-sm outline-none focus:border-cyan-400" />
          </label>
        ))}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border px-5 py-3 text-sm font-bold">취소</button>
          <button className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white">등록</button>
        </div>
      </form>
    </div>
  );
}

function Metric({ icon, label, value }) {
  return <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10"><span className="text-cyan-300">{icon}</span><p className="mt-3 text-xs text-slate-400">{label}</p><b className="mt-1 block text-xl">{value}</b></div>;
}

function Stat({ label, value }) {
  return <div><p className="text-xs text-slate-400">{label}</p><b className="mt-1 block">{value}</b></div>;
}
