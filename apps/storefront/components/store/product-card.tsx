'use client';
import { Heart, ShoppingCart } from 'lucide-react';
import { money } from '@techzone/api-client/store';
import { storeImageUrl } from '@/lib/store-image';
import { useStore } from './store-shell';

export default function ProductCard({ product, onAdd = null, compact = false, priority = false }) {
  const {wishlistIds,toggleWishlist}=useStore();
  const wish=wishlistIds.includes(product.id);
  const href = `/products/${product.slug || product.id}/`;
  return <article className="group min-w-0">
    <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-[#f4f6f8]">
      {product.discountRate > 0 && <span className="absolute left-3 top-3 z-10 rounded-md bg-rose-700 px-2 py-1 text-[11px] font-black text-white">{product.discountRate}%</span>}
      <button onClick={()=>toggleWishlist(product.id)} aria-label={wish?'찜 해제':'찜하기'} aria-pressed={wish} className={`absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-white shadow-sm ${wish?'text-rose-500':''}`}><Heart size={17} className={wish?'fill-current':''}/></button>
      <a href={href}><img src={storeImageUrl(product.image,600)} alt={product.name} width="600" height={compact?600:667} loading={priority?'eager':'lazy'} fetchPriority={priority?'high':undefined} className={`w-full object-cover transition duration-500 group-hover:scale-105 ${compact?'aspect-square':'aspect-[.9]'}`}/></a>
      {onAdd&&<button onClick={() => onAdd(product)} className="absolute bottom-3 right-3 grid h-10 w-10 translate-y-2 place-items-center rounded-full bg-slate-950 text-white opacity-0 shadow-lg transition group-hover:translate-y-0 group-hover:opacity-100" aria-label="장바구니 담기"><ShoppingCart size={17}/></button>}
    </div>
    <div className="pt-4"><p className="text-[10px] font-black tracking-[.16em] text-indigo-600">{product.brand}</p><a href={href} className="mt-1 block truncate text-sm font-bold hover:text-indigo-600">{product.name}</a>
      <div className="mt-2 flex flex-wrap items-baseline gap-2">{product.discountRate > 0 && <b className="text-rose-700">{product.discountRate}%</b>}<strong>{money(product.price)}</strong>{product.listPrice>product.price&&<del className="text-xs text-slate-600">{money(product.listPrice)}</del>}</div>
      <div className="mt-2 flex gap-1 text-[10px]"><span className="rounded bg-indigo-50 px-2 py-1 font-bold text-indigo-700">무료배송</span>{product.stock<=5&&<span className="rounded bg-amber-50 px-2 py-1 font-bold text-amber-700">재고임박</span>}</div>
    </div>
  </article>;
}
