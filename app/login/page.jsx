'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { clearSession, readSession, saveSession } from '@/lib/session';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:18080/api';

export default function LoginPage() {
  const [mode, setMode] = useState('login');
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState({ loading: false, message: '' });
  useEffect(() => setSession(readSession()), []);

  async function submit(event) {
    event.preventDefault();
    setStatus({ loading: true, message: '' });
    const form = new FormData(event.currentTarget);
    const body = { email: form.get('email'), password: form.get('password') };
    if (mode === 'register') body.name = form.get('name');
    try {
      const response = await fetch(`${apiBase}/auth/${mode}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.code === 'EMAIL_EXISTS' ? '이미 가입된 이메일입니다.' : '이메일과 비밀번호를 확인해주세요.');
      saveSession(data);
      setSession(data);
      setStatus({ loading: false, message: '로그인되었습니다.' });
    } catch (error) { setStatus({ loading: false, message: error.message }); }
  }

  function logout() { clearSession(); setSession(null); setStatus({ loading: false, message: '로그아웃되었습니다.' }); }

  return <main className="min-h-screen bg-[#f6f8fc] px-5 py-8 text-slate-950">
    <div className="mx-auto max-w-6xl"><a href="/" className="inline-flex items-center gap-2 text-sm font-bold"><ArrowLeft size={16}/> 스토어로 돌아가기</a></div>
    <section className="mx-auto mt-10 grid max-w-5xl overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-200/60 md:grid-cols-2">
      <div className="bg-slate-950 p-9 text-white md:p-14"><p className="text-[10px] font-bold tracking-[.24em] text-blue-300">TECHZONE ACCOUNT</p><h1 className="mt-8 text-5xl font-black leading-none tracking-[-.08em]">기술을 고르는<br/><span className="font-serif font-normal italic">나만의 공간.</span></h1><p className="mt-7 max-w-sm text-sm leading-7 text-slate-300">로그인하면 주문 현황과 구매 기록을 한곳에서 확인할 수 있습니다.</p></div>
      <div className="p-8 md:p-14">{session ? <div className="flex h-full flex-col justify-center"><p className="text-sm text-blue-600">로그인 중</p><h2 className="mt-2 text-3xl font-black">{session.user.name}님,<br/>반갑습니다.</h2><p className="mt-3 text-sm text-slate-500">{session.user.email}</p><a href="/orders/" className="mt-9"><Button className="w-full">주문 내역 보기 <ArrowRight className="ml-2" size={16}/></Button></a><Button variant="outline" className="mt-3 w-full" onClick={logout}><LogOut className="mr-2" size={16}/> 로그아웃</Button></div> : <><div className="mb-8 flex gap-2"><Button variant={mode === 'login' ? 'default' : 'outline'} onClick={() => setMode('login')}>로그인</Button><Button variant={mode === 'register' ? 'default' : 'outline'} onClick={() => setMode('register')}>회원가입</Button></div><form className="grid gap-5" onSubmit={submit}>{mode === 'register' && <label className="grid gap-2 text-xs font-bold">이름<input required name="name" autoComplete="name" className="rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-blue-500" placeholder="홍길동"/></label>}<label className="grid gap-2 text-xs font-bold">이메일<input required type="email" name="email" autoComplete="email" className="rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-blue-500" placeholder="hello@techzone.kr"/></label><label className="grid gap-2 text-xs font-bold">비밀번호<input required minLength={8} type="password" name="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className="rounded-xl border border-slate-200 p-3 font-normal outline-none focus:border-blue-500" placeholder="8자 이상 입력"/></label><Button type="submit" disabled={status.loading} className="mt-2">{status.loading ? '처리 중...' : mode === 'login' ? '로그인' : '계정 만들기'} <ArrowRight className="ml-2" size={16}/></Button></form></>}{status.message && <p role="status" className="mt-5 rounded-xl bg-blue-50 p-3 text-sm text-blue-700">{status.message}</p>}</div>
    </section>
  </main>;
}
