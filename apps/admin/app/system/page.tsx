'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import {
  Activity, ExternalLink, RefreshCw, RotateCcw, ServerCog, Trash2,
} from 'lucide-react';
import { Button } from '@techzone/ui/button';
import { authHeaders } from '@techzone/api-client/session';
import ServerDataTable from '../_components/server-data-table';

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:18080/api';
const column = createColumnHelper<any>();
const date = value => value ? new Date(value).toLocaleString('ko-KR') : '-';
const number = value => new Intl.NumberFormat('ko-KR').format(Number(value || 0));
const serviceNames = {
  gateway: 'API Gateway',
  auth: '인증',
  catalog: '상품',
  cart: '장바구니',
  order: '주문',
  payment: '결제',
  inventory: '재고',
  notification: '알림',
  search: '검색',
  media: '미디어',
  fulfillment: '배송·반품',
  procurement: '공급·발주',
  admin: '관리자 조회',
  'admin-query': '관리자 조회',
};

function params(query) {
  return new URLSearchParams(
    Object.entries(query)
      .filter(([, value]) => value !== '' && value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  );
}

export default function SystemPage() {
  const [status, setStatus] = useState<any>(null);
  const [deadLetters, setDeadLetters] = useState<any>({ items: [], total: 0, pageCount: 1 });
  const [outbox, setOutbox] = useState<any>({ items: [], total: 0, pageCount: 1 });
  const [deadLetterQuery, setDeadLetterQuery] = useState({
    page: 1, pageSize: 20, sort: 'created_at', direction: 'desc', status: 'pending', q: '',
  });
  const [outboxQuery, setOutboxQuery] = useState({
    page: 1, pageSize: 20, sort: 'occurred_at', direction: 'desc', service: 'all', q: '',
  });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = authHeaders();
      const [statusResponse, deadLetterResponse, outboxResponse] = await Promise.all([
        fetch(`${API}/admin/system-status`, { credentials: 'include', headers }),
        fetch(`${API}/admin/dead-letters?${params(deadLetterQuery)}`, {
          credentials: 'include', headers,
        }),
        fetch(`${API}/admin/outbox?${params(outboxQuery)}`, {
          credentials: 'include', headers,
        }),
      ]);
      const [statusData, deadLetterData, outboxData] = await Promise.all([
        statusResponse.json(), deadLetterResponse.json(), outboxResponse.json(),
      ]);
      if (!statusResponse.ok || !deadLetterResponse.ok || !outboxResponse.ok) {
        throw new Error(
          statusData.message || deadLetterData.message || outboxData.message
          || statusData.code || deadLetterData.code || outboxData.code
          || 'SYSTEM_STATUS_FAILED',
        );
      }
      setStatus(statusData);
      setDeadLetters({
        items: deadLetterData.items || [],
        total: deadLetterData.total || 0,
        pageCount: deadLetterData.pageCount || 1,
      });
      setOutbox({
        items: outboxData.items || [],
        total: outboxData.total || 0,
        pageCount: outboxData.pageCount || 1,
      });
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '시스템 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [deadLetterQuery, outboxQuery]);

  useEffect(() => { load(); }, [load]);

  async function act(id, action) {
    const reason = window.prompt(
      action === 'reprocess' ? '재처리 사유를 입력해 주세요.' : '폐기 사유를 입력해 주세요.',
    );
    if (!reason) return;
    const response = await fetch(`${API}/admin/dead-letters/${id}/${action}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...authHeaders({ mutation: true }),
        'idempotency-key': crypto.randomUUID(),
      },
      body: JSON.stringify({ reason }),
    });
    const data = await response.json();
    setMessage(
      response.ok
        ? action === 'reprocess' ? 'DLQ 이벤트 재처리를 요청했습니다.' : 'DLQ 이벤트를 폐기했습니다.'
        : data.message || data.code,
    );
    if (response.ok) await load();
  }

  const deadLetterColumns = useMemo(() => [
    column.accessor('service', {
      header: '실패 서비스',
      cell: info => serviceNames[info.getValue()] || info.getValue(),
    }),
    column.accessor('event_type', { header: '이벤트' }),
    column.accessor('error', {
      header: '실패 원인',
      cell: info => (
        <span className="block max-w-96 truncate" title={info.getValue()}>
          {info.getValue()}
        </span>
      ),
    }),
    column.accessor('retry_count', { header: '재시도' }),
    column.accessor('status', {
      header: '상태',
      cell: info => (
        <StatusBadge value={info.getValue()} />
      ),
    }),
    column.accessor('created_at', {
      header: '발생 일시',
      cell: info => <span className="text-xs text-slate-500">{date(info.getValue())}</span>,
    }),
    column.display({
      id: 'actions',
      header: '운영 작업',
      cell: info => info.row.original.status === 'pending' && (
        <div className="flex gap-1">
          <button
            onClick={() => act(info.row.original.id, 'reprocess')}
            className="rounded-lg border px-2 py-1 text-xs font-bold text-indigo-600"
          >
            <RotateCcw size={13} className="mr-1 inline" />재처리
          </button>
          <button
            onClick={() => act(info.row.original.id, 'discard')}
            className="rounded-lg border px-2 py-1 text-xs font-bold text-rose-600"
          >
            <Trash2 size={13} className="mr-1 inline" />폐기
          </button>
        </div>
      ),
    }),
  ], []);

  const outboxColumns = useMemo(() => [
    column.accessor('service', {
      header: '서비스',
      cell: info => serviceNames[info.getValue()] || info.getValue(),
    }),
    column.accessor('event_type', { header: '이벤트' }),
    column.accessor('attempts', { header: '발행 시도' }),
    column.accessor('last_error', {
      header: '최근 오류',
      cell: info => (
        <span className="block max-w-96 truncate text-rose-600" title={info.getValue()}>
          {info.getValue() || '-'}
        </span>
      ),
    }),
    column.accessor('occurred_at', {
      header: '생성 일시',
      cell: info => <span className="text-xs text-slate-500">{date(info.getValue())}</span>,
    }),
  ], []);

  return (
    <main className="p-4 md:p-7 xl:p-9">
      <div className="mx-auto max-w-[1540px]">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[.16em] text-cyan-600">
              RELIABILITY OPERATIONS
            </p>
            <h1 className="mt-2 text-4xl font-black tracking-[-.05em]">시스템 운영 상태</h1>
            <p className="mt-2 text-sm text-slate-500">
              전체 서비스의 이벤트 적체, DLQ, 처리량을 확인하고 장애 이벤트를 복구합니다.
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href={status?.traceUrl || 'http://localhost:13000'}
              target="_blank"
              rel="noreferrer"
            >
              <Button variant="outline">
                Grafana 열기 <ExternalLink size={14} className="ml-2" />
              </Button>
            </a>
            <Button onClick={load}><RefreshCw size={14} className="mr-2" />새로고침</Button>
          </div>
        </header>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="플랫폼 상태"
            value={status?.status === 'healthy' ? '정상' : '점검 필요'}
            warning={status?.status !== 'healthy'}
            icon={Activity}
          />
          <Metric
            label="처리 대기 DLQ"
            value={`${number(status?.pendingDeadLetters)}건`}
            warning={status?.pendingDeadLetters > 0}
          />
          <Metric
            label="미발행 Outbox"
            value={`${number(status?.pendingOutbox)}건`}
            warning={status?.oldestOutboxSeconds > 300}
          />
          <Metric
            label="24시간 이벤트 처리"
            value={`${number(status?.processedEvents24h)}건`}
          />
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <ServerCog size={18} className="text-cyan-600" />
            <h2 className="font-black">서비스별 신뢰성 상태</h2>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(status?.services || []).map(service => (
              <article
                key={service.service}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="flex items-center justify-between">
                  <strong>{serviceNames[service.service] || service.service}</strong>
                  <HealthBadge status={service.status} />
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div><dt className="text-slate-400">Outbox</dt><dd className="mt-1 font-bold">{number(service.pendingOutbox)}</dd></div>
                  <div><dt className="text-slate-400">DLQ</dt><dd className="mt-1 font-bold">{number(service.pendingDeadLetters)}</dd></div>
                  <div><dt className="text-slate-400">24시간 처리</dt><dd className="mt-1 font-bold">{number(service.processedEvents24h)}</dd></div>
                </dl>
                {service.error && <p className="mt-3 truncate text-xs text-rose-600" title={service.error}>{service.error}</p>}
              </article>
            ))}
          </div>
        </section>

        {message && (
          <p className="mt-4 rounded-xl bg-indigo-50 p-3 text-sm font-semibold text-indigo-700">
            {message}
          </p>
        )}

        <section className="mt-6">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">미발행 Outbox</h2>
              <p className="mt-1 text-xs text-slate-500">서비스 DB에 남아 아직 브로커로 발행되지 않은 이벤트입니다.</p>
            </div>
            <label className="text-xs font-bold text-slate-500">
              서비스
              <select
                value={outboxQuery.service}
                onChange={event => setOutboxQuery(current => ({
                  ...current, service: event.target.value, page: 1,
                }))}
                className="ml-3 rounded-xl border px-3 py-2 text-sm text-slate-900"
              >
                <option value="all">전체</option>
                {Object.entries(serviceNames).filter(([key]) => key !== 'admin').map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="overflow-hidden rounded-2xl border bg-white">
            <ServerDataTable
              data={outbox.items}
              columns={outboxColumns}
              query={outboxQuery}
              onQueryChange={changes => setOutboxQuery(current => ({ ...current, ...changes }))}
              total={outbox.total}
              pageCount={outbox.pageCount}
              loading={loading}
              getRowId={row => row.id}
            />
          </div>
        </section>

        <section className="mt-6">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">실패 이벤트 DLQ</h2>
              <p className="mt-1 text-xs text-slate-500">재시도 한도를 초과한 이벤트를 검토하고 재처리하거나 폐기합니다.</p>
            </div>
            <label className="text-xs font-bold text-slate-500">
              상태
              <select
                value={deadLetterQuery.status}
                onChange={event => setDeadLetterQuery(current => ({
                  ...current, status: event.target.value, page: 1,
                }))}
                className="ml-3 rounded-xl border px-3 py-2 text-sm text-slate-900"
              >
                <option value="pending">처리 대기</option>
                <option value="reprocessed">재처리됨</option>
                <option value="discarded">폐기됨</option>
                <option value="all">전체</option>
              </select>
            </label>
          </div>
          <div className="overflow-hidden rounded-2xl border bg-white">
            <ServerDataTable
              data={deadLetters.items}
              columns={deadLetterColumns}
              query={deadLetterQuery}
              onQueryChange={changes => setDeadLetterQuery(current => ({ ...current, ...changes }))}
              total={deadLetters.total}
              pageCount={deadLetters.pageCount}
              loading={loading}
              getRowId={row => row.id}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value, warning = false, icon: Icon = null }) {
  return (
    <article className={`rounded-2xl border bg-white p-5 ${warning ? 'border-rose-200' : 'border-slate-200'}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-500">{label}</p>
        {Icon && <Icon size={17} className={warning ? 'text-rose-500' : 'text-cyan-600'} />}
      </div>
      <strong className={`mt-3 block text-2xl ${warning ? 'text-rose-600' : 'text-slate-950'}`}>
        {value}
      </strong>
    </article>
  );
}

function HealthBadge({ status }) {
  const labels = {
    healthy: ['정상', 'bg-emerald-50 text-emerald-700'],
    degraded: ['점검 필요', 'bg-amber-50 text-amber-700'],
    unreachable: ['연결 실패', 'bg-rose-50 text-rose-700'],
    not_configured: ['미설정', 'bg-slate-100 text-slate-600'],
  };
  const [label, style] = labels[status] || [status || '확인 중', 'bg-slate-100 text-slate-600'];
  return <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${style}`}>{label}</span>;
}

function StatusBadge({ value }) {
  const labels = {
    pending: ['처리 대기', 'bg-rose-50 text-rose-700'],
    reprocessed: ['재처리됨', 'bg-emerald-50 text-emerald-700'],
    discarded: ['폐기됨', 'bg-slate-100 text-slate-600'],
  };
  const [label, style] = labels[value] || [value, 'bg-slate-100 text-slate-600'];
  return <span className={`rounded-full px-2 py-1 text-xs font-bold ${style}`}>{label}</span>;
}
