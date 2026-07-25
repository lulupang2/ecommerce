'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, CalendarClock, Eye, LayoutTemplate, Megaphone, PackageCheck, RefreshCw, Search, Sparkles } from 'lucide-react';
import { readSession } from '@techzone/api-client/session';
import { api } from '@techzone/api-client/store';

const statusLabels = { published: '게시 중', draft: '작성 중', hidden: '숨김' };
const typeLabels = { hero: '히어로 배너', category: '카테고리', deal: '오늘의 특가', popular: '인기 상품', new: '신상품', brand: '브랜드관', collection: '기획전', recent: '최근 본 상품' };

export default function Page() {
  const [items, setItems] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('all');
  const session = typeof window === 'undefined' ? null : readSession();
  const token = session?.accessToken || session?.token;

  async function load() {
    if (!token) return;
    const data = await api('/storefront/admin/sections', { headers: { authorization: `Bearer ${token}` } });
    setItems(data.items || []);
  }

  useEffect(() => {
    load().catch(() => setMessage('스토어 진열 정보를 불러오지 못했습니다.'));
  }, [token]);

  async function update(item, changes) {
    await api(`/storefront/admin/sections/${item.id}`, { method: 'PATCH', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(changes) });
    setMessage('진열 설정을 저장했습니다.');
    load();
  }

  const filtered = useMemo(() => items.filter(item => {
    const haystack = `${item.title} ${item.subtitle} ${item.type}`.toLowerCase();
    return (status === 'all' || item.status === status) && haystack.includes(keyword.toLowerCase());
  }), [items, keyword, status]);

  const published = items.filter(item => item.status === 'published').length;
  const products = items.reduce((sum, item) => sum + Number(item.product_count || 0), 0);

  return (
    <main className="p-4 md:p-7 xl:p-9">
      <div className="mx-auto max-w-[1540px]">
        <section className="overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white md:p-9">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-black tracking-[.24em] text-cyan-300">STOREFRONT CMS</p>
              <h1 className="mt-3 text-4xl font-black tracking-[-.06em] md:text-5xl">스토어 진열 관리</h1>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">
                메인 배너, 기획전, 인기 상품, 브랜드관 노출 순서와 게시 상태를 관리합니다. 고객 홈 화면의 전환 구간을 운영자가 직접 조정하는 CMS 콘셉트입니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={load} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-bold ring-1 ring-white/10"><RefreshCw size={16} /> 새로고침</button>
              <a href="/" target="_blank" className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950"><Eye size={16} /> 스토어 미리보기</a>
            </div>
          </div>
          <div className="mt-8 grid gap-3 md:grid-cols-4">
            <Metric icon={<LayoutTemplate />} label="전체 섹션" value={`${items.length}개`} />
            <Metric icon={<Megaphone />} label="게시 중" value={`${published}개`} />
            <Metric icon={<PackageCheck />} label="연결 상품" value={`${products}개`} />
            <Metric icon={<CalendarClock />} label="예약 노출" value="운영 정책" />
          </div>
        </section>

        <section className="mt-6 rounded-3xl border bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
            <label className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input value={keyword} onChange={event => setKeyword(event.target.value)} className="h-12 w-full rounded-2xl border bg-slate-50 pl-11 pr-4 text-sm outline-none focus:border-cyan-400" placeholder="섹션명, 설명, 타입 검색" />
            </label>
            <select value={status} onChange={event => setStatus(event.target.value)} className="h-12 rounded-2xl border bg-white px-4 text-sm">
              <option value="all">전체 상태</option>
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button onClick={() => { setKeyword(''); setStatus('all'); }} className="h-12 rounded-2xl border text-sm font-bold">필터 초기화</button>
          </div>
        </section>

        {message && <p className="mt-5 rounded-xl bg-cyan-50 p-4 text-sm font-bold text-cyan-800">{message}</p>}

        <section className="mt-6 overflow-hidden rounded-3xl border bg-white shadow-sm">
          <div className="grid grid-cols-[76px_140px_1fr_140px_120px_140px] border-b bg-slate-50 px-5 py-3 text-xs font-black text-slate-500">
            <span className="flex items-center gap-1"><ArrowUpDown size={13} /> 순서</span>
            <span>유형</span>
            <span>섹션 콘텐츠</span>
            <span>상태</span>
            <span>상품</span>
            <span>운영 메모</span>
          </div>
          {filtered.map(item => (
            <article key={item.id} className="grid grid-cols-[76px_140px_1fr_140px_120px_140px] items-center border-b px-5 py-4 last:border-0">
              <input type="number" defaultValue={item.display_order} onBlur={event => Number(event.target.value) !== item.display_order && update(item, { displayOrder: Number(event.target.value) })} className="w-16 rounded-xl border p-2 text-sm font-bold" />
              <b className="text-xs text-cyan-700">{typeLabels[item.type] || item.type}</b>
              <div>
                <input defaultValue={item.title} onBlur={event => event.target.value !== item.title && update(item, { title: event.target.value })} className="w-full rounded-xl border border-transparent p-2 font-black hover:border-slate-200 focus:border-cyan-400 focus:outline-none" />
                <p className="px-2 text-xs leading-5 text-slate-400">{item.subtitle || '고객 홈에 노출되는 섹션 설명입니다.'}</p>
              </div>
              <select value={item.status} onChange={event => update(item, { status: event.target.value })} className="rounded-xl border p-2 text-sm">
                {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <span className="text-sm font-bold">{item.product_count}개</span>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500"><Sparkles size={13} /> 홈 전환</span>
            </article>
          ))}
          {!filtered.length && <div className="p-12 text-center text-sm text-slate-400">조건에 맞는 진열 섹션이 없습니다.</div>}
        </section>
      </div>
    </main>
  );
}

function Metric({ icon, label, value }) {
  return <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10"><span className="text-cyan-300">{icon}</span><p className="mt-3 text-xs text-slate-400">{label}</p><b className="mt-1 block text-xl">{value}</b></div>;
}
