'use client';

import {
  ArrowRight,
  BadgePercent,
  CreditCard,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Truck,
} from 'lucide-react';
import StoreShell, { useStore } from '@/components/store/store-shell';
import { money, optionText } from '@techzone/api-client/store';

export default function Page() {
  return <StoreShell><CartPage /></StoreShell>;
}

function CartPage() {
  const { cart, total, change } = useStore();
  const shipping = total >= 80_000 ? 0 : 3_000;
  const remaining = Math.max(0, 80_000 - total);
  const progress = Math.min(100, Math.round(total / 80_000 * 100));
  const stockIssues = cart.filter(item => item.in_stock === false);

  async function updateQuantity(item, quantity) {
    try {
      await change(item.variant_id, quantity);
    } catch (error: any) {
      if (error.message === 'INSUFFICIENT_STOCK') {
        window.alert(`구매 가능한 재고는 ${item.available_qty}개입니다.`);
      } else {
        window.alert('수량을 변경하지 못했습니다.');
      }
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 md:px-8">
      <p className="text-xs font-black tracking-[.2em] text-cyan-600">CART</p>
      <h1 className="mt-2 text-4xl font-black tracking-[-.06em]">장바구니</h1>
      <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
        <span className="font-bold text-cyan-600">01 장바구니</span>
        <ArrowRight size={14} /><span>02 주문/결제</span>
        <ArrowRight size={14} /><span>03 완료</span>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_380px]">
        <section>
          {cart.length ? cart.map(item => (
            <article key={item.variant_id} className="grid grid-cols-[110px_1fr] gap-5 border-b py-6 first:border-t">
              <img src={item.image} alt="" className="h-28 w-28 rounded-2xl object-cover" />
              <div className="flex flex-col justify-between md:flex-row">
                <div>
                  <p className="text-xs font-black text-cyan-600">{item.brand}</p>
                  <h2 className="mt-1 font-black">{item.name}</h2>
                  <p className="mt-2 text-xs text-slate-500">{optionText(item.option_values)}</p>
                  {item.in_stock === false && (
                    <p className="mt-2 text-xs font-bold text-rose-600">
                      {item.available_qty > 0
                        ? `재고가 ${item.available_qty}개만 남았습니다.`
                        : '현재 품절된 옵션입니다.'}
                    </p>
                  )}
                  <button onClick={() => updateQuantity(item, 0)} className="mt-4 flex items-center gap-1 text-xs text-slate-400">
                    <Trash2 size={13} /> 삭제
                  </button>
                </div>
                <div className="mt-4 text-right md:mt-0">
                  <b>{money(Number(item.price) * item.quantity)}</b>
                  <div className="mt-4 inline-flex rounded-lg border">
                    <button aria-label={`${item.name} 수량 줄이기`} onClick={() => updateQuantity(item, item.quantity - 1)} className="px-3 py-2">−</button>
                    <span className="px-2 py-2 text-sm">{item.quantity}</span>
                    <button
                      aria-label={`${item.name} 수량 늘리기`}
                      disabled={item.available_qty !== null && item.quantity >= item.available_qty}
                      onClick={() => updateQuantity(item, item.quantity + 1)}
                      className="px-3 py-2 disabled:cursor-not-allowed disabled:opacity-30"
                    >+</button>
                  </div>
                </div>
              </div>
            </article>
          )) : (
            <div className="rounded-3xl bg-slate-50 py-24 text-center">
              <ShoppingBag className="mx-auto text-slate-300" size={50} />
              <p className="mt-5 font-bold">장바구니에 담긴 상품이 없습니다.</p>
              <a href="/shop/" className="mt-5 inline-block rounded-xl bg-slate-950 px-6 py-3 text-sm font-bold text-white">쇼핑 계속하기</a>
            </div>
          )}
        </section>

        <aside className="h-fit rounded-3xl border bg-white p-6 shadow-sm lg:sticky lg:top-36">
          <h2 className="text-xl font-black">결제 예정 금액</h2>
          <dl className="mt-6 grid gap-4 text-sm">
            <div className="flex justify-between"><dt>상품 금액</dt><dd>{money(total)}</dd></div>
            <div className="flex justify-between"><dt>배송비</dt><dd>{shipping ? money(shipping) : '무료'}</dd></div>
            <div className="flex justify-between border-t pt-5 text-lg font-black"><dt>총 결제 금액</dt><dd className="text-cyan-700">{money(total + shipping)}</dd></div>
          </dl>
          <div className="mt-5 rounded-xl bg-cyan-50 p-4 text-xs text-cyan-900">
            <div className="flex gap-2"><Truck size={17} /><span>{shipping ? `${money(remaining)} 더 담으면 무료배송` : '무료배송이 적용되었습니다.'}</span></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white"><span className="block h-full rounded-full bg-cyan-500" style={{ width: `${progress}%` }} /></div>
          </div>
          <div className="mt-3 grid gap-2 text-xs text-slate-500">
            <p className="flex items-center gap-2"><BadgePercent size={15} className="text-rose-500" /> 주문서에서 TECHZONE10 쿠폰을 적용할 수 있습니다.</p>
            <p className="flex items-center gap-2"><ShieldCheck size={15} className="text-cyan-600" /> 결제 직전 서버 가격과 재고를 다시 확인합니다.</p>
            <p className="flex items-center gap-2"><CreditCard size={15} className="text-slate-600" /> 옵션별 가용 재고를 초과하면 주문할 수 없습니다.</p>
          </div>
          {stockIssues.length > 0 && (
            <p className="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">
              품절 또는 수량 부족 상품을 조정해야 주문할 수 있습니다.
            </p>
          )}
          <a
            href="/checkout/"
            aria-disabled={!cart.length || stockIssues.length > 0}
            className={`mt-5 grid h-14 place-items-center rounded-xl bg-slate-950 font-black text-white ${!cart.length || stockIssues.length > 0 ? 'pointer-events-none opacity-40' : ''}`}
          >주문하기</a>
        </aside>
      </div>
    </main>
  );
}
