'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { Activity, ExternalLink, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authHeaders } from '@/lib/session';
import ServerDataTable from '../_components/server-data-table';

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:18080/api';
const column = createColumnHelper();
const date = value => value ? new Date(value).toLocaleString('ko-KR') : '-';

export default function SystemPage() {
  const [status, setStatus] = useState(null);
  const [result, setResult] = useState({ items: [], total: 0, pageCount: 1 });
  const [query, setQuery] = useState({ page: 1, pageSize: 20, sort: 'created_at', direction: 'desc', status: 'pending' });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)]));
      const headers = authHeaders();
      const [statusResponse, listResponse] = await Promise.all([
        fetch(`${API}/admin/system-status`, { credentials: 'include', headers }),
        fetch(`${API}/admin/dead-letters?${params}`, { credentials: 'include', headers }),
      ]);
      const [statusData, listData] = await Promise.all([statusResponse.json(), listResponse.json()]);
      if (!statusResponse.ok || !listResponse.ok) throw new Error(statusData.code || listData.code || 'SYSTEM_STATUS_FAILED');
      setStatus(statusData);
      setResult({ items: listData.items || [], total: listData.total || 0, pageCount: listData.pageCount || 1 });
      setMessage('');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { load(); }, [load]);

  async function act(id, action) {
    const reason = window.prompt(action === 'reprocess' ? '재처리 사유를 입력해 주세요.' : '폐기 사유를 입력해 주세요.');
    if (!reason) return;
    const response = await fetch(`${API}/admin/dead-letters/${id}/${action}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', ...authHeaders({ mutation: true }), 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ reason }),
    });
    const data = await response.json();
    setMessage(response.ok ? (action === 'reprocess' ? '이벤트 재처리를 요청했습니다.' : 'DLQ 이벤트를 폐기했습니다.') : data.message || data.code);
    if (response.ok) await load();
  }

  const columns = useMemo(() => [
    column.accessor('service', { header: '실패 서비스' }),
    column.accessor('event_type', { header: '이벤트' }),
    column.accessor('error', { header: '실패 원인', cell: info => <span className="block max-w-96 truncate" title={info.getValue()}>{info.getValue()}</span> }),
    column.accessor('retry_count', { header: '재시도' }),
    column.accessor('status', { header: '상태', cell: info => <span className={`rounded-full px-2 py-1 text-xs font-bold ${info.getValue() === 'pending' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{info.getValue() === 'pending' ? '처리 대기' : info.getValue() === 'reprocessed' ? '재처리됨' : '폐기됨'}</span> }),
    column.accessor('created_at', { header: '발생일시', cell: info => <span className="text-xs text-slate-500">{date(info.getValue())}</span> }),
    column.display({ id: 'actions', header: '운영 작업', cell: info => info.row.original.status === 'pending' && <div className="flex gap-1"><button onClick={() => act(info.row.original.id, 'reprocess')} className="rounded-lg border px-2 py-1 text-xs font-bold text-indigo-600"><RotateCcw size={13} className="mr-1 inline"/>재처리</button><button onClick={() => act(info.row.original.id, 'discard')} className="rounded-lg border px-2 py-1 text-xs font-bold text-rose-600"><Trash2 size={13} className="mr-1 inline"/>폐기</button></div> }),
  ], []);

  return (
    <main className="p-4 md:p-7 xl:p-9">
      <div className="mx-auto max-w-[1540px]">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[.16em] text-indigo-600">RELIABILITY OPERATIONS</p>
            <h1 className="mt-2 text-4xl font-black tracking-[-.05em]">시스템 상태</h1>
            <p className="mt-2 text-sm text-slate-500">이벤트 적체, DLQ와 처리량을 확인하고 복구 작업을 수행합니다.</p>
          </div>
          <div className="flex gap-2">
            <a href={status?.traceUrl || 'http://localhost:13000'} target="_blank" rel="noreferrer"><Button variant="outline">Grafana 열기 <ExternalLink size={14} className="ml-2"/></Button></a>
            <Button onClick={load}><RefreshCw size={14} className="mr-2"/>새로고침</Button>
          </div>
        </header>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Admin Query 상태" value={status?.status === 'healthy' ? '정상' : '점검 필요'} warning={status?.status !== 'healthy'} icon={Activity}/>
          <Metric label="처리 대기 DLQ" value={`${status?.pendingDeadLetters || 0}건`} warning={status?.pendingDeadLetters > 0}/>
          <Metric label="미발행 Outbox" value={`${status?.pendingOutbox || 0}건`} warning={status?.oldestOutboxSeconds > 300}/>
          <Metric label="24시간 이벤트 처리" value={`${status?.processedEvents24h || 0}건`}/>
        </section>

        <section className="mt-6 rounded-2xl border bg-white p-4">
          <label className="text-xs font-bold text-slate-500">DLQ 상태
            <select value={query.status} onChange={event => setQuery(current => ({ ...current, status: event.target.value, page: 1 }))} className="ml-3 rounded-xl border px-3 py-2 text-sm text-slate-900">
              <option value="pending">처리 대기</option>
              <option value="reprocessed">재처리됨</option>
              <option value="discarded">폐기됨</option>
              <option value="all">전체</option>
            </select>
          </label>
        </section>
        {message && <p className="mt-4 rounded-xl bg-indigo-50 p-3 text-sm font-semibold text-indigo-700">{message}</p>}
        <section className="mt-4 overflow-hidden rounded-2xl border bg-white">
          <ServerDataTable data={result.items} columns={columns} query={query} onQueryChange={changes => setQuery(current => ({ ...current, ...changes }))} total={result.total} pageCount={result.pageCount} loading={loading} getRowId={row => row.id}/>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value, warning = false, icon: Icon }) {
  return <article className={`rounded-2xl border bg-white p-5 ${warning ? 'border-rose-200' : 'border-slate-200'}`}><div className="flex items-center justify-between"><p className="text-xs font-bold text-slate-500">{label}</p>{Icon && <Icon size={17} className={warning ? 'text-rose-500' : 'text-indigo-500'}/>}</div><strong className={`mt-3 block text-2xl ${warning ? 'text-rose-600' : 'text-slate-950'}`}>{value}</strong></article>;
}
