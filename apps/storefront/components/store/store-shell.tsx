'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { ChevronDown, Heart, Home, Menu, Package, Search, ShoppingBag, UserRound, X } from 'lucide-react';
import { categories, money, optionText } from '@techzone/api-client/store';
import { useCartState, useSearchSuggestions, useWishlistState } from '@/lib/storefront-queries';
import { useStorefrontUiStore } from '@/stores/storefront-ui-store';

const mobileNavigation: any[] = [[Home,'홈','/'],[Menu,'카테고리','/shop/'],[Search,'검색','/shop/?focus=search'],[Heart,'찜','/mypage/?tab=wishlist'],[UserRound,'MY','/orders/']];

const StoreContext=createContext<any>(null);

export function useStore(){
  const store=useContext(StoreContext);
  if(!store)throw new Error('useStore must be used inside StoreShell');
  return store;
}

function useStoreValue(){
  const cartState=useCartState();
  const wishlistState=useWishlistState();
  const setCartOpen=useStorefrontUiStore(state=>state.setCartOpen);
  const cart=cartState.cart;
  const count=cart.reduce((sum,item)=>sum+item.quantity,0);
  const total=cart.reduce((sum,item)=>sum+Number(item.price)*item.quantity,0);

  async function add(product,variant=null,quantity=1){
    await cartState.add(product,variant,quantity);
    setCartOpen(true);
  }

  return {
    cart,
    count,
    total,
    cartLoading:cartState.cartLoading,
    wishlistIds:wishlistState.wishlistIds,
    wishlistProducts:wishlistState.wishlistProducts,
    wishlistLoading:wishlistState.wishlistLoading,
    wishlistSession:wishlistState.session,
    add,
    change:cartState.change,
    clear:cartState.clear,
    toggleWishlist:wishlistState.toggleWishlist,
    mergeGuestWishlist:wishlistState.mergeGuestWishlist,
    setCartOpen,
  };
}

export default function StoreShell({children}){
  const store=useStoreValue();
  const {cart,count,total,change,mergeGuestWishlist}=store;
  const cartOpen=useStorefrontUiStore(state=>state.cartOpen);
  const menu=useStorefrontUiStore(state=>state.menuOpen);
  const query=useStorefrontUiStore(state=>state.searchQuery);
  const setCartOpen=useStorefrontUiStore(state=>state.setCartOpen);
  const setMenu=useStorefrontUiStore(state=>state.setMenuOpen);
  const setQuery=useStorefrontUiStore(state=>state.setSearchQuery);
  const [debouncedQuery,setDebouncedQuery]=useState('');
  const suggestionsQuery=useSearchSuggestions(debouncedQuery);
  const suggestions=suggestionsQuery.data?.items||[];

  useEffect(()=>{
    const timer=setTimeout(()=>setDebouncedQuery(query),200);
    return()=>clearTimeout(timer);
  },[query]);
  useEffect(()=>{mergeGuestWishlist().catch(()=>{});},[mergeGuestWishlist]);

  return <StoreContext.Provider value={store}><div className="min-h-screen bg-white pb-16 text-slate-950 md:pb-0">
    <a href="#storefront-main" className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white transition focus:translate-y-0">본문 바로가기</a>
    <div className="bg-indigo-700 px-4 py-2 text-center text-[11px] font-bold text-white">TECHZONE10 쿠폰 · 30만원 이상 구매 시 최대 5만원 할인</div>
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur"><div className="mx-auto flex h-18 max-w-[1440px] items-center gap-6 px-4 md:px-8">
      <button aria-label="카테고리 메뉴" aria-expanded={menu} className="md:hidden" onClick={()=>setMenu(!menu)}><Menu/></button><a href="/" className="shrink-0 text-xl font-black tracking-[-.1em]">TECH<span className="text-indigo-600">ZONE</span></a>
      <form action="/shop/" role="search" className="relative hidden max-w-2xl flex-1 md:block"><Search aria-hidden="true" className="absolute left-4 top-3.5 text-indigo-600" size={19}/><input aria-label="통합 상품 검색" name="q" value={query} onChange={e=>setQuery(e.target.value)} placeholder="상품, 브랜드, 카테고리를 검색하세요" className="h-12 w-full rounded-xl border-2 border-indigo-600 pl-12 pr-4 outline-none"/>
        {suggestions.length>0&&<div className="absolute left-0 right-0 top-14 rounded-xl border bg-white p-2 shadow-2xl">{suggestions.map(item=><a key={item.id} href={`/products/${item.slug}/`} className="flex items-center gap-3 rounded-lg p-2 hover:bg-slate-50"><img src={item.image} className="h-12 w-12 rounded object-cover" alt=""/><span className="text-sm font-bold">{item.name}</span><b className="ml-auto text-sm">{money(item.price)}</b></a>)}</div>}
      </form>
      <nav aria-label="고객 메뉴" className="ml-auto flex items-center gap-1"><a href="/guest-orders/" className="hidden rounded-lg p-2 text-xs font-bold hover:bg-slate-50 lg:block">비회원 주문조회</a><a href="/orders/" className="grid h-10 w-10 place-items-center rounded-lg hover:bg-slate-50" aria-label="주문 내역"><Package size={20}/></a><a href="/login/" className="grid h-10 w-10 place-items-center rounded-lg hover:bg-slate-50" aria-label="계정"><UserRound size={20}/></a><button aria-label={`장바구니, 상품 ${count}개`} aria-expanded={cartOpen} aria-controls="store-cart-panel" onClick={()=>setCartOpen(true)} className="relative grid h-10 w-10 place-items-center rounded-lg hover:bg-slate-50"><ShoppingBag size={20}/><span aria-hidden="true" className="absolute right-0 top-0 rounded-full bg-rose-500 px-1.5 text-[10px] font-black text-white">{count}</span></button></nav>
    </div><div className={`border-t bg-white ${menu?'block':'hidden'} md:block`}><nav aria-label="상품 카테고리" className="mx-auto flex max-w-[1440px] gap-6 overflow-auto px-4 py-3 text-sm font-bold md:px-8"><a href="/shop/" className="flex items-center gap-1 text-indigo-600">전체 카테고리 <ChevronDown size={14}/></a>{categories.map(item=><a key={item.slug} href={`/categories/${item.slug}/`} className="whitespace-nowrap hover:text-indigo-600">{item.name}</a>)}<a href="/shop/?sort=discount" className="whitespace-nowrap text-rose-700">오늘의 특가</a></nav></div></header>
    <div id="storefront-main" tabIndex={-1}>{children}</div>
    <nav aria-label="모바일 주요 메뉴" className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-5 border-t bg-white py-2 md:hidden">{mobileNavigation.map(([Icon,label,href])=><a key={label} href={href} className="grid place-items-center gap-1 text-[10px] font-bold"><Icon size={19}/>{label}</a>)}</nav>
    {cartOpen&&<button aria-label="장바구니 닫기" className="fixed inset-0 z-50 bg-slate-950/40" onClick={()=>setCartOpen(false)}/>}<aside id="store-cart-panel" role="dialog" aria-modal="true" aria-labelledby="store-cart-title" aria-hidden={!cartOpen} inert={!cartOpen ? true : undefined} className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white transition ${cartOpen?'translate-x-0':'translate-x-full'}`}>
      <div className="flex items-center justify-between border-b p-6"><div><h2 id="store-cart-title" className="text-xl font-black">장바구니</h2><p className="text-xs text-slate-400">총 {count}개 상품</p></div><button aria-label="장바구니 닫기" onClick={()=>setCartOpen(false)}><X/></button></div>
      <div className="flex-1 overflow-auto p-6">{cart.length?cart.map(item=><article key={item.variant_id} className="mb-5 grid grid-cols-[88px_1fr] gap-4"><img src={item.image} alt="" className="h-24 w-22 rounded-xl object-cover"/><div><b className="text-sm">{item.name}</b><p className="mt-1 text-xs text-slate-500">{optionText(item.option_values)}</p><p className="mt-1 text-sm font-black">{money(item.price)}</p>{item.in_stock===false&&<p className="mt-1 text-xs font-bold text-rose-600">{item.available_qty>0?`재고 ${item.available_qty}개 남음`:'품절'}</p>}<div className="mt-2 inline-flex items-center rounded-lg border"><button aria-label={`${item.name} 수량 줄이기`} className="px-3 py-1" onClick={()=>change(item.variant_id,item.quantity-1)}>−</button><span aria-live="polite" className="px-2 text-xs">{item.quantity}</span><button disabled={item.available_qty!==null&&item.quantity>=item.available_qty} aria-label={`${item.name} 수량 늘리기`} className="px-3 py-1 disabled:opacity-30" onClick={()=>change(item.variant_id,item.quantity+1)}>+</button></div></div></article>):<div className="py-20 text-center"><ShoppingBag className="mx-auto text-slate-300" size={44}/><p className="mt-4 text-sm text-slate-500">장바구니가 비어 있습니다.</p></div>}</div>
      <div className="border-t p-6"><div className="mb-2 flex justify-between font-black"><span>상품 금액</span><span>{money(total)}</span></div><p className="mb-5 text-xs text-slate-400">{total>=80000?'무료배송이 적용됩니다.':`${money(80000-total)} 더 담으면 무료배송`}</p><a href="/cart/" className={`grid h-13 place-items-center rounded-xl bg-indigo-600 font-bold text-white ${!cart.length?'pointer-events-none opacity-40':''}`}>장바구니 확인</a></div>
    </aside>
  </div></StoreContext.Provider>;
}
