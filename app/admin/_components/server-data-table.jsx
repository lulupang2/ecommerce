'use client';

import { useMemo, useState } from 'react';
import {
  flexRender, getCoreRowModel, useReactTable,
} from '@tanstack/react-table';
import { Check, ChevronLeft, ChevronRight, Columns3, Download, Search } from 'lucide-react';

export default function ServerDataTable({ data, columns, query, onQueryChange, total, pageCount, loading, getRowId, onSelectionChange }) {
  const [rowSelection, setRowSelection] = useState({});
  const [columnVisibility, setColumnVisibility] = useState({});
  const table = useReactTable({
    data, columns, getRowId, state: { rowSelection, columnVisibility },
    onRowSelectionChange: updater => {
      const next = typeof updater === 'function' ? updater(rowSelection) : updater;
      setRowSelection(next);
      onSelectionChange?.(Object.keys(next).filter(key => next[key]));
    },
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true, manualSorting: true, pageCount, enableRowSelection: true,
  });
  const visibleRows = table.getRowModel().rows;
  const selectedCount = Object.keys(rowSelection).filter(key => rowSelection[key]).length;
  function toggleSort(column) {
    if (!column.getCanSort()) return;
    const key = column.id;
    const direction = query.sort === key && query.direction === 'desc' ? 'asc' : 'desc';
    onQueryChange({ sort: key, direction, page: 1 });
  }
  function exportCsv() {
    const headers = table.getVisibleLeafColumns().filter(column => column.id !== 'select' && column.id !== 'actions');
    const rows = data.map(item => headers.map(column => JSON.stringify(item[column.id] ?? '')).join(','));
    const csv = `\ufeff${headers.map(column => JSON.stringify(String(column.columnDef.header || column.id))).join(',')}\n${rows.join('\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `techzone-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  }
  return <div>
    <div className="flex flex-col justify-between gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center">
      <label className="relative block min-w-0 flex-1 md:max-w-md"><Search size={16} className="absolute left-3 top-2.5 text-slate-400"/><input value={query.q || ''} onChange={event => onQueryChange({ q: event.target.value, page: 1 })} placeholder="검색어를 입력하세요" className="w-full rounded-xl border border-slate-200 py-2 pl-10 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"/></label>
      <div className="flex items-center gap-2">
        {selectedCount > 0 && <span className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700">{selectedCount}개 선택</span>}
        <details className="relative"><summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"><Columns3 size={15}/> 열 설정</summary><div className="absolute right-0 z-20 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">{table.getAllLeafColumns().filter(column => column.getCanHide()).map(column => <label key={column.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs hover:bg-slate-50"><input type="checkbox" checked={column.getIsVisible()} onChange={column.getToggleVisibilityHandler()}/>{String(column.columnDef.header || column.id)}</label>)}</div></details>
        <button onClick={exportCsv} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold hover:bg-slate-50"><Download size={15}/> CSV</button>
      </div>
    </div>
    <div className="overflow-x-auto"><table className="w-full min-w-[880px] text-left text-sm"><thead className="bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">{table.getHeaderGroups().map(group => <tr key={group.id}>{group.headers.map(header => <th key={header.id} onClick={() => toggleSort(header.column)} className={`whitespace-nowrap px-4 py-3 ${header.column.getCanSort() ? 'cursor-pointer select-none hover:text-indigo-600' : ''}`}>{flexRender(header.column.columnDef.header, header.getContext())}{query.sort === header.column.id && <span className="ml-1 text-indigo-600">{query.direction === 'asc' ? '↑' : '↓'}</span>}</th>)}</tr>)}</thead><tbody className="divide-y divide-slate-100">{loading ? Array.from({ length: 8 }, (_, index) => <tr key={index}>{table.getVisibleLeafColumns().map(column => <td className="px-4 py-4" key={column.id}><div className="h-4 animate-pulse rounded bg-slate-100"/></td>)}</tr>) : visibleRows.length ? visibleRows.map(row => <tr key={row.id} className={`transition hover:bg-indigo-50/30 ${row.getIsSelected() ? 'bg-indigo-50/50' : ''}`}>{row.getVisibleCells().map(cell => <td key={cell.id} className="whitespace-nowrap px-4 py-3.5">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>) : <tr><td colSpan={columns.length} className="py-20 text-center text-sm text-slate-400">조건에 맞는 데이터가 없습니다.</td></tr>}</tbody></table></div>
    <div className="flex flex-col gap-3 border-t border-slate-200 p-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between"><span>총 <b className="text-slate-950">{new Intl.NumberFormat('ko-KR').format(total)}</b>개 · {query.page}/{pageCount || 1} 페이지</span><div className="flex items-center gap-2"><select value={query.pageSize} onChange={event => onQueryChange({ pageSize: Number(event.target.value), page: 1 })} className="rounded-lg border border-slate-200 px-2 py-2"><option value="10">10개</option><option value="20">20개</option><option value="50">50개</option><option value="100">100개</option></select><button disabled={query.page <= 1} onClick={() => onQueryChange({ page: query.page - 1 })} className="rounded-lg border border-slate-200 p-2 disabled:opacity-30"><ChevronLeft size={15}/></button><button disabled={query.page >= pageCount} onClick={() => onQueryChange({ page: query.page + 1 })} className="rounded-lg border border-slate-200 p-2 disabled:opacity-30"><ChevronRight size={15}/></button></div></div>
  </div>;
}

export function SelectColumn() {
  return { id: 'select', header: ({ table }) => <button onClick={table.getToggleAllRowsSelectedHandler()} className={`grid h-5 w-5 place-items-center rounded border ${table.getIsAllRowsSelected() ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white'}`}>{table.getIsAllRowsSelected() && <Check size={13}/>}</button>, cell: ({ row }) => <button onClick={row.getToggleSelectedHandler()} className={`grid h-5 w-5 place-items-center rounded border ${row.getIsSelected() ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white'}`}>{row.getIsSelected() && <Check size={13}/>}</button>, enableSorting: false, enableHiding: false };
}
