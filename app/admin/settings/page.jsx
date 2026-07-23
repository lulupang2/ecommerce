'use client';

import { useEffect, useState } from 'react';
import { KeyRound, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authHeaders, readSession } from '@/lib/session';

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:18080/api';

export default function AdminSettingsPage() {
  const [data, setData] = useState({ roles: [], users: [] });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  async function load() {
    readSession(); const headers = authHeaders();
    setLoading(true);
    try {
      const [rolesResponse, usersResponse] = await Promise.all([fetch(`${API}/admin/roles`, { credentials: 'include', headers }), fetch(`${API}/auth/users`, { credentials: 'include', headers })]);
      if (!rolesResponse.ok || !usersResponse.ok) throw new Error('권한 정보를 불러오지 못했습니다.');
      setData({ roles: (await rolesResponse.json()).items || [], users: (await usersResponse.json()).items || [] });
      setMessage('');
    } catch (error) { setMessage(error.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  async function changeRole(userId, role) {
    const response = await fetch(`${API}/auth/users/${userId}/role`, { method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json', ...authHeaders({ mutation: true }) }, body: JSON.stringify({ role }) });
    const payload = await response.json();
    if (!response.ok) return setMessage(payload.code || '역할 변경에 실패했습니다.');
    setMessage('관리자 역할을 변경했습니다. 다음 로그인부터 새 권한이 적용됩니다.');
    load();
  }
  return <main className="p-4 md:p-7 xl:p-9"><div className="mx-auto max-w-[1540px]"><header className="flex items-end justify-between"><div><p className="text-xs font-bold tracking-[.16em] text-indigo-600">ACCESS CONTROL</p><h1 className="mt-2 text-3xl font-black tracking-[-.05em] md:text-4xl">관리자 권한 설정</h1><p className="mt-2 text-sm text-slate-500">업무별 역할과 행위 단위 권한을 관리합니다.</p></div><Button variant="outline" onClick={load}><RefreshCw size={15} className="mr-2"/>새로고침</Button></header>{message && <p className="mt-5 rounded-xl bg-indigo-50 p-3 text-sm font-semibold text-indigo-700">{message}</p>}
    <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.roles.map(role => <article key={role.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><ShieldCheck size={20}/></span><h2 className="mt-4 text-lg font-black">{role.name}</h2><p className="mt-1 text-xs text-slate-400">{role.description}</p><div className="mt-4 flex flex-wrap gap-1.5">{(role.permissions || []).map(permission => <span key={permission} className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{permission}</span>)}</div></article>)}</section>
    <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 p-5"><h2 className="flex items-center gap-2 font-black"><Users size={18} className="text-indigo-600"/>관리자 계정</h2><p className="mt-1 text-xs text-slate-400">역할 변경은 감사로그에 기록됩니다.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-5 py-3">이름</th><th>이메일</th><th>계정 유형</th><th>현재 역할</th><th className="px-5">역할 변경</th></tr></thead><tbody className="divide-y">{data.users.filter(user => user.role !== 'customer' || user.adminRole).map(user => <tr key={user.id}><td className="px-5 py-4 font-bold">{user.name}</td><td>{user.email}</td><td>{user.role}</td><td>{user.adminRoleName || user.adminRole || '-'}</td><td className="px-5"><select value={user.adminRole || 'super_admin'} onChange={event => changeRole(user.id, event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">{data.roles.map(role => <option value={role.code} key={role.code}>{role.name}</option>)}</select></td></tr>)}</tbody></table></div>{loading && <p className="p-8 text-center text-sm text-slate-400">불러오는 중...</p>}</section></div></main>;
}
