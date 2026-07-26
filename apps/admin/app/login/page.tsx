'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@techzone/ui/button';
import { saveSession } from '@techzone/api-client/session';

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:18080/api';

export default function AdminLoginPage() {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { setHydrated(true); }, []);

  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${API}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      const session = await response.json();
      if (!response.ok) throw new Error(session.message || '로그인에 실패했습니다.');
      if (session.user?.role !== 'admin') throw new Error('관리자 계정만 접근할 수 있습니다.');
      saveSession(session);
      router.replace('/');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <main className="fixed inset-0 z-50 grid place-items-center bg-slate-950 p-5">
    <form onSubmit={login} className="grid w-full max-w-md gap-5 rounded-3xl bg-white p-8 shadow-2xl">
      <div><p className="text-xs font-black tracking-[.2em] text-indigo-600">TECHZONE OPS</p><h1 className="mt-3 text-3xl font-black">관리자 로그인</h1></div>
      <label className="grid gap-2 text-sm font-bold">이메일<input name="email" type="email" required className="rounded-xl border p-3 font-normal"/></label>
      <label className="grid gap-2 text-sm font-bold">비밀번호<input name="password" type="password" required className="rounded-xl border p-3 font-normal"/></label>
      {message && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{message}</p>}
      <Button disabled={busy || !hydrated}>{busy ? '로그인 중…' : '로그인'}</Button>
    </form>
  </main>;
}
