'use client';

import { useEffect, useId, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { Button } from '@techzone/ui/button';

export default function ActionDialog({ open, title, description, fields = [], confirmLabel = '처리하기', danger = false, loading = false, onClose, onConfirm }) {
  const [values, setValues] = useState({});
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => { if (open) setValues(Object.fromEntries(fields.map(field => [field.key, field.defaultValue ?? '']))); }, [open]);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open, onClose]);
  if (!open) return null;
  return <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/50 p-4"><button aria-label="대화상자 닫기" className="absolute inset-0" onClick={onClose}/><section role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><button aria-label="대화상자 닫기" onClick={onClose} className="absolute right-4 top-4 rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18}/></button><span aria-hidden="true" className={`grid h-10 w-10 place-items-center rounded-xl ${danger ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'}`}><AlertCircle size={20}/></span><h2 id={titleId} className="mt-4 text-xl font-black">{title}</h2><p id={descriptionId} className="mt-2 text-sm leading-6 text-slate-500">{description}</p><div className="mt-5 grid gap-4">{fields.map(field => <label className="grid gap-2 text-xs font-bold" key={field.key}>{field.label}{field.type === 'select' ? <select value={values[field.key] ?? ''} onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))} className="rounded-xl border border-slate-200 bg-white p-3 text-sm font-normal">{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === 'textarea' ? <textarea required={field.required} value={values[field.key] ?? ''} onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))} className="min-h-24 rounded-xl border border-slate-200 p-3 text-sm font-normal"/> : <input required={field.required} type={field.type || 'text'} min={field.min} value={values[field.key] ?? ''} onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))} className="rounded-xl border border-slate-200 p-3 text-sm font-normal"/>}</label>)}</div><div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>취소</Button><Button disabled={loading || fields.some(field => field.required && !values[field.key])} onClick={() => onConfirm(values)} className={danger ? 'bg-rose-600 hover:bg-rose-700' : ''}>{loading ? '처리 중...' : confirmLabel}</Button></div></section></div>;
}
