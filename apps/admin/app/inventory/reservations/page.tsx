'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createColumnHelper } from '@tanstack/react-table';
import { Clock3, RefreshCw } from 'lucide-react';
import { Button } from '@techzone/ui/button';
import { authHeaders } from '@techzone/api-client/session';
import ServerDataTable from '../../_components/server-data-table';

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:18080/api';
const column = createColumnHelper<any>();
const date = value => value ? new Date(value).toLocaleString('ko-KR') : '-';
const statusLabels = {
  reserved: ['예약 대기', 'bg-amber-50 text-amber-700'],
  confirmed: ['주문 확정', 'bg-blue-50 text-blue-700'],
  committed: ['출고 차감', 'bg-emerald-50 text-emerald-700'],
  released: ['예약 해제', 'bg-slate-100 text-slate-600'],
};
const releaseReasons = {
  RESERVATION_EXPIRED: '예약 시간 만료',
  ORDER_CANCELLED: '주문 취소',
  PAYMENT_FAILED: '결제 실패',
};

export default function InventoryReservationsPage() {
  return (
    <Suspense fallback={<ReservationPageFallback />}>
      <InventoryReservationsContent />
    </Suspense>
  );
}

function InventoryReservationsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => ({
    page: Math.max(1, Number(searchParams.get('page') || 1)),
    pageSize: Math.min(100, Math.max(10, Number(searchParams.get('pageSize') || 20))),
    q: searchParams.get('q') || '',
    status: searchParams.get('status') || 'all',
    warehouseId: searchParams.get('warehouseId') || '',
    from: searchParams.get('from') || '',
    to: searchParams.get('to') || '',
    sort: searchParams.get('sort') || 'created_at',
    direction: searchParams.get('direction') === 'asc' ? 'asc' : 'desc',
  }));
  const [result, setResult] = useState<any>({ items: [], total: 0, pageCount: 1 });
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== '' && value !== 'all' && value !== undefined) {
        params.set(key, String(value));
      }
    });
    router.replace(`/inventory/reservations/?${params}`, { scroll: false });
  }, [query, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(
        Object.entries(query)
          .filter(([, value]) => value !== '' && value !== 'all')
          .map(([key, value]) => [key, String(value)]),
      );
      const headers = authHeaders();
      const [reservationResponse, warehouseResponse] = await Promise.all([
        fetch(`${API}/admin/reservations?${params}`, { credentials: 'include', headers }),
        fetch(`${API}/admin/warehouses`, { credentials: 'include', headers }),
      ]);
      const [reservationData, warehouseData] = await Promise.all([
        reservationResponse.json(), warehouseResponse.json(),
      ]);
      if (!reservationResponse.ok || !warehouseResponse.ok) {
        throw new Error(
          reservationData.message || warehouseData.message
          || reservationData.code || warehouseData.code
          || 'RESERVATION_LIST_FAILED',
        );
      }
      setResult({
        items: reservationData.items || [],
        total: reservationData.total || 0,
        pageCount: reservationData.pageCount || 1,
      });
      setWarehouses(warehouseData.items || []);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '재고 예약 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { load(); }, [load]);

  const columns = useMemo(() => [
    column.accessor('order_id', {
      header: '주문 ID',
      cell: info => (
        <span className="font-mono text-xs" title={info.getValue()}>
          {String(info.getValue()).slice(0, 8)}…
        </span>
      ),
    }),
    column.accessor('sku', {
      header: '상품·SKU',
      cell: info => (
        <div>
          <strong className="block max-w-56 truncate">{info.row.original.name || '상품 정보 동기화 중'}</strong>
          <span className="text-xs text-slate-500">{info.getValue() || info.row.original.variant_id}</span>
        </div>
      ),
    }),
    column.accessor('warehouse_name', {
      header: '창고',
      cell: info => (
        <div>
          <strong>{info.getValue()}</strong>
          <span className="ml-2 text-xs text-slate-400">{info.row.original.warehouse_code}</span>
        </div>
      ),
    }),
    column.accessor('quantity', { header: '수량' }),
    column.accessor('status', {
      header: '예약 상태',
      cell: info => <ReservationStatus value={info.getValue()} />,
    }),
    column.accessor('expires_at', {
      header: '예약 만료',
      cell: info => (
        <span className={info.getValue() && new Date(info.getValue()) < new Date() ? 'text-rose-600' : 'text-slate-500'}>
          {date(info.getValue())}
        </span>
      ),
    }),
    column.accessor('release_reason', {
      header: '해제 사유',
      cell: info => releaseReasons[info.getValue()] || info.getValue() || '-',
    }),
    column.accessor('created_at', {
      header: '생성 일시',
      cell: info => <span className="text-xs text-slate-500">{date(info.getValue())}</span>,
    }),
    column.accessor('updated_at', {
      header: '최근 변경',
      cell: info => <span className="text-xs text-slate-500">{date(info.getValue())}</span>,
    }),
  ], []);

  const activeCount = result.items.filter(item =>
    item.status === 'reserved' || item.status === 'confirmed').length;

  return (
    <main className="p-4 md:p-7 xl:p-9">
      <div className="mx-auto max-w-[1540px]">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[.16em] text-cyan-600">
              INVENTORY RESERVATIONS
            </p>
            <h1 className="mt-2 text-4xl font-black tracking-[-.05em]">재고 예약 원장</h1>
            <p className="mt-2 text-sm text-slate-500">
              주문별 재고 예약부터 확정, 출고 차감, 해제까지 전체 수명주기를 추적합니다.
            </p>
          </div>
          <Button onClick={load}><RefreshCw size={14} className="mr-2" />새로고침</Button>
        </header>

        <section className="mt-6 grid gap-3 sm:grid-cols-3">
          <Summary label="검색 결과" value={`${new Intl.NumberFormat('ko-KR').format(result.total)}건`} />
          <Summary label="현재 페이지 활성 예약" value={`${activeCount}건`} warning={activeCount > 0} />
          <Summary label="자동 해제 기준" value="30분" icon={Clock3} />
        </section>

        <section className="mt-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-2 xl:grid-cols-4">
          <Filter label="상태" htmlFor="reservation-status">
            <select
              id="reservation-status"
              value={query.status}
              onChange={event => setQuery(current => ({ ...current, status: event.target.value, page: 1 }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="all">전체 상태</option>
              <option value="reserved">예약 대기</option>
              <option value="confirmed">주문 확정</option>
              <option value="committed">출고 차감</option>
              <option value="released">예약 해제</option>
            </select>
          </Filter>
          <Filter label="창고" htmlFor="reservation-warehouse">
            <select
              id="reservation-warehouse"
              value={query.warehouseId}
              onChange={event => setQuery(current => ({ ...current, warehouseId: event.target.value, page: 1 }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">전체 창고</option>
              {warehouses.map(warehouse => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
              ))}
            </select>
          </Filter>
          <Filter label="등록일 시작" htmlFor="reservation-from">
            <input
              id="reservation-from"
              type="date"
              value={query.from}
              onChange={event => setQuery(current => ({ ...current, from: event.target.value, page: 1 }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </Filter>
          <Filter label="등록일 종료" htmlFor="reservation-to">
            <input
              id="reservation-to"
              type="date"
              value={query.to}
              onChange={event => setQuery(current => ({ ...current, to: event.target.value, page: 1 }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </Filter>
        </section>

        {message && (
          <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">
            {message}
          </p>
        )}

        <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <ServerDataTable
            data={result.items}
            columns={columns}
            query={query}
            onQueryChange={changes => setQuery(current => ({ ...current, ...changes }))}
            total={result.total}
            pageCount={result.pageCount}
            loading={loading}
            getRowId={row => row.id}
          />
        </section>
      </div>
    </main>
  );
}

function ReservationStatus({ value }) {
  const [label, style] = statusLabels[value] || [value, 'bg-slate-100 text-slate-600'];
  return <span className={`rounded-full px-2 py-1 text-xs font-bold ${style}`}>{label}</span>;
}

function Filter({ label, htmlFor, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-xs font-bold text-slate-500">{label}</label>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Summary({ label, value, warning = false, icon: Icon = null }) {
  return (
    <article className={`rounded-2xl border bg-white p-5 ${warning ? 'border-amber-200' : 'border-slate-200'}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-500">{label}</p>
        {Icon && <Icon size={16} className="text-cyan-600" />}
      </div>
      <strong className={`mt-2 block text-2xl ${warning ? 'text-amber-700' : ''}`}>{value}</strong>
    </article>
  );
}

function ReservationPageFallback() {
  return (
    <main className="p-4 md:p-7 xl:p-9">
      <div className="mx-auto max-w-[1540px] animate-pulse">
        <div className="h-10 w-64 rounded-xl bg-slate-200" />
        <div className="mt-6 h-96 rounded-2xl border border-slate-200 bg-white" />
      </div>
    </main>
  );
}
