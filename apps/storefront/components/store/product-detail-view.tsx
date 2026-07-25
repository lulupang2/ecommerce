'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BadgePercent,
  Check,
  ChevronRight,
  Heart,
  MessageCircleQuestion,
  Minus,
  PackageCheck,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Star,
  ThumbsUp,
  Truck,
} from 'lucide-react';
import StoreShell, { useStore } from './store-shell';
import ProductCard from './product-card';
import { api, money, optionText } from '@techzone/api-client/store';
import { readSession } from '@techzone/api-client/session';
import { storeImageUrl } from '@/lib/store-image';
import { saveRecentlyViewed } from '@/lib/recent-products';

export default function ProductDetailView({ slug = null, id = null, initialProduct = null }) {
  return <StoreShell><ProductDetail slug={slug} id={id} initialProduct={initialProduct} /></StoreShell>;
}

function ProductDetail({ slug = null, id = null, initialProduct = null }) {
  const [product, setProduct] = useState<any>(initialProduct);
  const [error, setError] = useState('');
  const [variantId, setVariantId] = useState(initialProduct?.variants?.[0]?.id || '');
  const [image, setImage] = useState(initialProduct?.images?.[0]?.url || initialProduct?.image || '');
  const [quantity, setQuantity] = useState(1);
  const [tab, setTab] = useState('detail');
  const [wish, setWish] = useState(false);
  const [notice, setNotice] = useState('');
  const { add } = useStore();

  useEffect(() => {
    function initialize(data) {
        if (!initialProduct) setProduct(data);
        setVariantId(data.variants?.[0]?.id || '');
        setImage(data.images?.[0]?.url || data.image);
        saveRecentlyViewed(data);
        setWish(JSON.parse(localStorage.getItem('techzone-wishlist') || '[]').includes(data.id));
    }
    if (initialProduct) {
      initialize(initialProduct);
      return;
    }
    api(slug ? `/products/by-slug/${slug}` : `/products/${id}`)
      .then(initialize)
      .catch(() => setError('상품 정보를 불러오지 못했습니다.'));
  }, [slug, id, initialProduct]);

  const variant = useMemo(() => product?.variants?.find(item => item.id === variantId), [product, variantId]);

  function toggleWish() {
    const values = JSON.parse(localStorage.getItem('techzone-wishlist') || '[]');
    const next = wish ? values.filter(value => value !== product.id) : [...new Set([...values, product.id])];
    localStorage.setItem('techzone-wishlist', JSON.stringify(next));
    setWish(!wish);
    setNotice(wish ? '찜 목록에서 제거했습니다.' : '찜 목록에 저장했습니다.');

    const session = readSession();
    if (session) {
      api(`/wishlists/${session.user.id}/${product.id}`, { method: wish ? 'DELETE' : 'POST', headers: { authorization: `Bearer ${session.accessToken || session.token}` } }).catch(() => {});
    }
  }

  async function cart(buy = false) {
    await add(product, variant, quantity);
    setNotice('장바구니에 담았습니다.');
    if (buy) location.href = '/checkout/';
  }

  async function ask(event) {
    event.preventDefault();
    const session = readSession();
    if (!session) {
      location.href = '/login/';
      return;
    }
    const form = new FormData(event.currentTarget);
    await api(`/products/${product.id}/questions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${session.accessToken || session.token}` },
      body: JSON.stringify({ title: form.get('title'), body: form.get('body') }),
    });
    setNotice('상품 문의가 등록되었습니다.');
    event.currentTarget.reset();
  }

  async function review(event) {
    event.preventDefault();
    const session = readSession();
    if (!session) {
      location.href = '/login/';
      return;
    }
    const form = new FormData(event.currentTarget);
    try {
      await api(`/products/${product.id}/reviews`, {
        method: 'POST',
        headers: { authorization: `Bearer ${session.accessToken || session.token}` },
        body: JSON.stringify({ rating: Number(form.get('rating')), body: form.get('body') }),
      });
      setNotice('리뷰가 등록되어 검수 대기 중입니다.');
      event.currentTarget.reset();
    } catch (error: any) {
      setNotice(error.message === 'PURCHASE_REQUIRED' ? '배송 완료된 구매 상품만 리뷰를 작성할 수 있습니다.' : '리뷰를 등록하지 못했습니다.');
    }
  }

  if (error) return <main className="mx-auto max-w-4xl p-10"><p className="rounded-xl bg-red-50 p-6 text-red-700">{error}</p></main>;
  if (!product) return <main className="mx-auto max-w-[1440px] p-8"><div className="h-[600px] animate-pulse rounded-3xl bg-slate-100" /></main>;

  const price = variant?.salePrice || product.price;
  const listPrice = variant?.listPrice || product.listPrice || price;
  const discount = listPrice > price ? Math.round(((listPrice - price) * 100) / listPrice) : 0;
  const couponDiscount = price >= 300000 ? Math.min(Math.floor(price * 0.1), 50000) : 0;
  const finalPrice = price - couponDiscount;
  const shipping = finalPrice >= 80000 ? 0 : 3000;
  const summary = String(product.note || '').replace(/<[^>]+>/g, '').trim();
  const reviews = product.reviews || [];
  const questions = product.questions || [];

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-8 pb-40 md:px-8 md:pb-8">
      <div className="flex items-center gap-2 text-xs text-slate-600">
        홈 <ChevronRight size={12} /> {product.category} <ChevronRight size={12} /> {product.name}
      </div>

      <section className="mt-8 grid gap-10 lg:grid-cols-[1.05fr_.95fr]">
        <ProductGallery product={product} image={image} setImage={setImage} />

        <div className="lg:sticky lg:top-36 lg:self-start">
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-1 text-[11px] font-black text-cyan-300">
            <PackageCheck size={13} /> {product.brand}
          </div>
          <h1 className="mt-4 text-4xl font-black tracking-[-.06em] md:text-5xl">{product.name}</h1>
          <TrustSummary product={product} setTab={setTab} />
          <p className="mt-5 leading-7 text-slate-600">{summary}</p>

          <PriceBox listPrice={listPrice} price={price} discount={discount} couponDiscount={couponDiscount} shipping={shipping} finalPrice={finalPrice} />
          <VariantPicker product={product} variantId={variantId} setVariantId={setVariantId} />
          <TrustCards />
          <PurchaseActions quantity={quantity} setQuantity={setQuantity} wish={wish} toggleWish={toggleWish} cart={cart} />
          {notice && <p className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-700"><Check size={16} />{notice}</p>}
        </div>
      </section>

      <section className="mt-20">
        <nav className="sticky top-30 z-20 grid grid-cols-4 border-y bg-white">
          {[
            ['detail', '상품정보'],
            ['specs', '상세스펙'],
            ['reviews', `리뷰 ${product.reviewSummary.count}`],
            ['questions', `Q&A ${questions.length}`],
          ].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} className={`py-5 text-sm font-black ${tab === key ? 'border-b-2 border-cyan-600 text-cyan-700' : 'text-slate-500'}`}>{label}</button>
          ))}
        </nav>
        <div className="mx-auto max-w-4xl py-12">
          {tab === 'detail' && <DetailTab product={product} />}
          {tab === 'specs' && <SpecsTab product={product} />}
          {tab === 'reviews' && <ReviewsTab product={product} reviews={reviews} onSubmit={review} />}
          {tab === 'questions' && <QuestionsTab questions={questions} onSubmit={ask} />}
        </div>
      </section>

      <section className="border-t py-16">
        <h2 className="text-2xl font-black">함께 보면 좋은 상품</h2>
        <div className="mt-7 grid grid-cols-2 gap-4 md:grid-cols-4">
          {(product.related || []).map(item => <ProductCard key={item.id} product={item} onAdd={p => add(p)} />)}
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-[64px] z-30 border-t bg-white p-3 shadow-2xl md:hidden">
        <div className="mx-auto flex max-w-[520px] gap-2">
          <button onClick={() => cart(false)} className="h-12 flex-1 rounded-xl border-2 border-slate-950 font-black text-slate-950">장바구니</button>
          <button onClick={() => cart(true)} className="h-12 flex-1 rounded-xl bg-slate-950 font-black text-white">바로구매</button>
        </div>
      </div>
    </main>
  );
}

function ProductGallery({ product, image, setImage }) {
  return (
    <div>
      <div className="overflow-hidden rounded-3xl bg-slate-100">
        <img src={storeImageUrl(image,900,80)} alt={product.name} width="900" height="900" fetchPriority="high" className="aspect-square w-full object-cover" />
      </div>
      <div className="mt-3 grid grid-cols-5 gap-2">
        {(product.images || []).map(item => (
          <button key={item.id} onClick={() => setImage(item.url)} className={`overflow-hidden rounded-xl border-2 ${image === item.url ? 'border-cyan-500' : 'border-transparent'}`}>
            <img src={storeImageUrl(item.url,160,72)} alt={item.alt || product.name} width="96" height="96" loading="lazy" className="aspect-square object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}

function TrustSummary({ product, setTab }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
      <Star size={16} className="fill-amber-400 text-amber-400" />
      <b>{product.reviewSummary.average || 0}</b>
      <button onClick={() => setTab('reviews')} className="text-slate-500 underline-offset-4 hover:underline">구매 리뷰 {product.reviewSummary.count}개</button>
      <span className="text-slate-300">·</span>
      <span className="font-bold text-emerald-700">빠른 배송 가능</span>
      <span className="text-slate-300">·</span>
      <span className="font-bold text-cyan-700">정품 보증</span>
    </div>
  );
}

function PriceBox({ listPrice, price, discount, couponDiscount, shipping, finalPrice }) {
  return (
    <div className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <del className="text-sm text-slate-600">{money(listPrice)}</del>
      <div className="mt-1 flex items-baseline gap-3">
        {discount > 0 && <b className="text-2xl text-rose-500">{discount}%</b>}
        <strong className="text-3xl">{money(price)}</strong>
      </div>
      <div className="mt-4 grid gap-2 rounded-xl bg-cyan-50 p-4 text-sm">
        <p className="flex items-center justify-between"><span className="flex items-center gap-2 font-bold text-cyan-800"><BadgePercent size={16} /> TECHZONE10 예상 할인</span><b className="text-cyan-900">-{money(couponDiscount)}</b></p>
        <p className="flex items-center justify-between text-slate-500"><span>배송비</span><b>{shipping ? money(shipping) : '무료'}</b></p>
        <p className="flex items-center justify-between border-t border-cyan-100 pt-3 text-base font-black"><span>쿠폰 적용 예상가</span><span>{money(finalPrice + shipping)}</span></p>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-600">부가세 포함 · 실제 결제 금액은 주문서에서 서버 가격과 쿠폰 정책으로 다시 검증됩니다.</p>
    </div>
  );
}

function VariantPicker({ product, variantId, setVariantId }) {
  return (
    <div className="mt-6">
      <b className="text-sm">옵션 선택</b>
      <div className="mt-3 grid gap-2">
        {(product.variants || []).map(item => (
          <button key={item.id} onClick={() => setVariantId(item.id)} className={`flex items-center justify-between rounded-xl border p-4 text-left ${variantId === item.id ? 'border-cyan-500 bg-cyan-50 ring-1 ring-cyan-500' : 'border-slate-200'}`}>
            <span><b className="text-sm">{optionText(item.optionValues)}</b><small className="mt-1 block text-slate-600">{item.sku}</small></span>
            <strong>{money(item.salePrice)}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

function TrustCards() {
  return (
    <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-5 text-sm md:grid-cols-2">
      <p className="flex gap-3"><Truck className="text-cyan-600" size={19} /><span><b>내일 출고 예정</b><small className="block text-slate-600">평일 오후 2시 이전 결제 기준</small></span></p>
      <p className="flex gap-3"><ShieldCheck className="text-cyan-600" size={19} /><span><b>정품 보증 · 안전 포장</b><small className="block text-slate-600">TECHZONE 공식 유통 상품</small></span></p>
    </div>
  );
}

function PurchaseActions({ quantity, setQuantity, wish, toggleWish, cart }) {
  return (
    <div className="mt-6 hidden gap-3 md:flex">
      <div className="flex items-center rounded-xl border">
        <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="p-4"><Minus size={15} /></button>
        <b className="w-8 text-center">{quantity}</b>
        <button onClick={() => setQuantity(Math.min(20, quantity + 1))} className="p-4"><Plus size={15} /></button>
      </div>
      <button onClick={toggleWish} className={`grid w-14 place-items-center rounded-xl border ${wish ? 'border-rose-300 bg-rose-50 text-rose-500' : ''}`}><Heart className={wish ? 'fill-current' : ''} /></button>
      <button onClick={() => cart(false)} className="flex-1 rounded-xl border-2 border-slate-950 font-black text-slate-950"><ShoppingBag className="mr-2 inline" size={17} />장바구니</button>
      <button onClick={() => cart(true)} className="flex-1 rounded-xl bg-slate-950 font-black text-white">바로구매</button>
    </div>
  );
}

function DetailTab({ product }) {
  return (
    <div className="prose max-w-none">
      <h2 className="text-center text-4xl font-black">{product.name}</h2>
      <div className="mt-8 rounded-3xl bg-slate-50 p-8 text-center leading-8" dangerouslySetInnerHTML={{ __html: product.note }} />
    </div>
  );
}

function SpecsTab({ product }) {
  return (
    <dl className="divide-y rounded-2xl border">
      {(product.specs || []).map(item => <div key={item.key} className="grid grid-cols-[140px_1fr] p-5 text-sm md:grid-cols-[180px_1fr]"><dt className="font-bold text-slate-500">{item.key}</dt><dd>{item.value}</dd></div>)}
    </dl>
  );
}

function ReviewsTab({ product, reviews, onSubmit }) {
  return (
    <div>
      <div className="grid gap-4 rounded-3xl bg-slate-950 p-6 text-white md:grid-cols-[220px_1fr]">
        <div className="text-center">
          <b className="text-6xl text-cyan-300">{product.reviewSummary.average || 0}</b>
          <p className="mt-2 text-sm text-slate-300">구매 고객 리뷰 {product.reviewSummary.count}개</p>
        </div>
        <div className="grid gap-3 text-sm">
          <TrustRow icon={<ThumbsUp size={16} />} title="구매 검증" text="배송 완료된 로그인 구매자만 리뷰를 작성할 수 있습니다." />
          <TrustRow icon={<ShieldCheck size={16} />} title="검수 후 공개" text="스팸·욕설·개인정보가 포함된 리뷰는 공개 전 검수됩니다." />
          <TrustRow icon={<Star size={16} />} title="실사용 후기" text="평점과 본문을 함께 노출해 구매 판단을 돕습니다." />
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-6 grid gap-3 rounded-2xl border p-5">
        <b>구매 리뷰 작성</b>
        <select name="rating" className="rounded-lg border p-3 text-sm">
          <option value="5">★★★★★ 5점</option>
          <option value="4">★★★★☆ 4점</option>
          <option value="3">★★★☆☆ 3점</option>
          <option value="2">★★☆☆☆ 2점</option>
          <option value="1">★☆☆☆☆ 1점</option>
        </select>
        <textarea required name="body" className="min-h-24 rounded-lg border p-3 text-sm" placeholder="배송, 포장, 성능, 사용감 중심으로 후기를 남겨주세요." />
        <button className="justify-self-end rounded-lg bg-slate-950 px-5 py-2 text-sm font-bold text-white">리뷰 등록</button>
      </form>

      <div className="mt-6 divide-y">
        {reviews.length ? reviews.map(review => (
          <article key={review.id} className="py-6">
            <div className="flex justify-between gap-4">
              <b>{review.userName}</b>
              <span className="text-amber-500">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span>
            </div>
            <p className="mt-3 text-sm leading-7 text-slate-700">{review.body}</p>
          </article>
        )) : <p className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">아직 공개된 리뷰가 없습니다.</p>}
      </div>
    </div>
  );
}

function QuestionsTab({ questions, onSubmit }) {
  return (
    <div>
      <form onSubmit={onSubmit} className="grid gap-3 rounded-2xl bg-slate-50 p-5">
        <b>상품 문의하기</b>
        <p className="text-xs leading-5 text-slate-500">상품 구성, 호환성, 배송 일정처럼 구매 전 확인이 필요한 내용을 남겨주세요. 로그인 사용자만 작성할 수 있습니다.</p>
        <input name="title" required placeholder="문의 제목" className="rounded-lg border p-3 text-sm" />
        <textarea name="body" required placeholder="궁금한 내용을 입력하세요." className="min-h-24 rounded-lg border p-3 text-sm" />
        <button className="justify-self-end rounded-lg bg-slate-950 px-5 py-2 text-sm font-bold text-white">문의 등록</button>
      </form>
      <div className="mt-6 divide-y">
        {questions.length ? questions.map(q => (
          <article key={q.id} className="py-5">
            <div className="flex items-center justify-between gap-3">
              <b className="text-sm">Q. {q.title}</b>
              <span className={`rounded-full px-3 py-1 text-[11px] font-black ${q.answer ? 'bg-cyan-50 text-cyan-700' : 'bg-slate-100 text-slate-500'}`}>{q.answer ? '답변 완료' : '답변 대기'}</span>
            </div>
            <p className="mt-2 text-sm leading-7 text-slate-600">{q.body}</p>
            {q.answer && <p className="mt-3 rounded-lg bg-cyan-50 p-4 text-sm leading-7 text-cyan-900"><b>A.</b> {q.answer}</p>}
          </article>
        )) : <p className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">등록된 상품 문의가 없습니다.</p>}
      </div>
    </div>
  );
}

function TrustRow({ icon, title, text }) {
  return <p className="flex gap-3 rounded-2xl bg-white/10 p-4"><span className="text-cyan-300">{icon}</span><span><b className="block">{title}</b><small className="mt-1 block leading-5 text-slate-400">{text}</small></span></p>;
}
