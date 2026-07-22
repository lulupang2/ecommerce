import './style.css';

const fallbackProducts = [
  { id: 'f1', name: 'NOVA Book Air 14', brand: 'NOVA', category: '노트북', price: 1499000, note: '하루 종일 이어지는 배터리와 선명한 2.8K 디스플레이.', color: '스페이스 그레이', image: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=1100&q=85' },
  { id: 'f2', name: 'Orbit Pro X', brand: 'ORBIT', category: '스마트폰', price: 1199000, note: '손 안의 강력한 퍼포먼스. 50MP 트리플 카메라.', color: '미드나이트', image: 'https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?auto=format&fit=crop&w=1100&q=85' },
  { id: 'f3', name: 'Sonic Max ANC', brand: 'SONIC', category: '오디오', price: 329000, note: '몰입을 방해하는 소음을 지우는 프리미엄 헤드폰.', color: '크림', image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1100&q=85' },
  { id: 'f4', name: 'Arc Mechanical 75', brand: 'ARC', category: '게이밍', price: 219000, note: '정교한 타건감과 자유로운 커스텀을 위한 키보드.', color: '오프화이트', image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=1100&q=85' },
  { id: 'f5', name: 'Home Mini Beam', brand: 'LUMEN', category: '스마트홈', price: 549000, note: '작은 공간도 영화관으로 만드는 포터블 프로젝터.', color: '오프화이트', image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1100&q=85' },
  { id: 'f6', name: 'Pixel Watch S', brand: 'PIXEL', category: '웨어러블', price: 399000, note: '오늘의 컨디션을 가장 정확히 읽는 스마트 워치.', color: '실버', image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1100&q=85' },
  { id: 'f7', name: 'Dock One', brand: 'NEXA', category: '액세서리', price: 89000, note: '모든 작업 공간을 하나로 연결하는 멀티 허브.', color: '스페이스 블랙', image: 'https://images.unsplash.com/photo-1625842268584-8f3296236761?auto=format&fit=crop&w=1100&q=85' },
  { id: 'f8', name: 'Frame 4K', brand: 'FRAME', category: '게이밍', price: 679000, note: '144Hz 주사율로 더 빠르고 부드러운 플레이를.', color: '블랙', image: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=1100&q=85' },
];

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:18080/api';
const categories = ['스마트폰', '노트북', '오디오', '게이밍', '스마트홈', '웨어러블', '액세서리'];
let products = fallbackProducts;
let apiOnline = false;
let category = 'All';
let cart = JSON.parse(localStorage.getItem('techzone-cart') || '[]');
let favorites = new Set(JSON.parse(localStorage.getItem('techzone-favorites') || '[]'));
const guestId = localStorage.getItem('techzone-guest-id') || crypto.randomUUID();
localStorage.setItem('techzone-guest-id', guestId);
const app = document.querySelector('#app');
const won = number => `${new Intl.NumberFormat('ko-KR').format(number)}원`;
const save = () => { localStorage.setItem('techzone-cart', JSON.stringify(cart)); localStorage.setItem('techzone-favorites', JSON.stringify([...favorites])); };

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, { headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(body?.code || 'API_REQUEST_FAILED');
  return body;
}
async function loadProducts() { try { const result = await api('/products'); products = result.items; apiOnline = true; render(); } catch { apiOnline = false; } }
function cartCount() { return cart.reduce((total, item) => total + item.quantity, 0); }
function cartTotal() { return cart.reduce((total, item) => total + item.price * item.quantity, 0); }

function productCard(product) {
  return `<article class="product-card" data-category="${product.category}" ${category !== 'All' && category !== product.category ? 'hidden' : ''}>
    <button class="favorite ${favorites.has(product.id) ? 'liked' : ''}" data-favorite="${product.id}" aria-label="찜하기">${favorites.has(product.id) ? '♥' : '♡'}</button>
    <button class="product-image" data-product="${product.id}" aria-label="${product.name} 상세 보기"><img src="${product.image}" alt="${product.name}" loading="lazy"><span>빠른 보기</span></button>
    <div class="product-meta"><p>${product.brand}</p><h3>${product.name}</h3><strong>${won(product.price)}</strong></div>
  </article>`;
}
function cartMarkup() {
  if (!cart.length) return `<div class="empty"><p>장바구니가 비어 있습니다.</p><button class="continue-shopping">쇼핑 계속하기</button></div>`;
  return cart.map(item => `<div class="cart-item"><img src="${item.image}" alt="${item.name}"><div><p>${item.brand}</p><h3>${item.name}</h3><strong>${won(item.price)}</strong><div class="quantity"><button data-quantity="${item.id}" data-change="-1">−</button><span>${item.quantity}</span><button data-quantity="${item.id}" data-change="1">+</button><button class="remove" data-remove="${item.id}">삭제</button></div></div></div>`).join('');
}

function render() {
  app.innerHTML = `<div class="announcement">${apiOnline ? 'TECHZONE · 실시간 카탈로그 연결됨' : '오늘 주문하면 무료 배송 · 80,000원 이상'}<button aria-label="공지 닫기">×</button></div>
  <header class="header"><button class="mobile-menu" aria-label="메뉴">☰</button><a class="logo" href="#top">TECH<span>ZONE</span></a><nav><a href="#shop">스토어</a><a href="#story">테크 매거진</a><a href="#brands">브랜드</a><a href="#about">고객지원</a></nav><div class="header-actions"><button class="icon-btn search-open" aria-label="검색">⌕</button><button class="account" aria-label="계정">로그인</button><button class="bag-button" aria-label="장바구니">장바구니 <b>${cartCount()}</b></button></div></header>
  <main id="top"><section class="hero"><div class="hero-copy"><p class="kicker">NEXT GENERATION TECHNOLOGY</p><h1>일상을 더<br><em>선명하게.</em></h1><p>지금 가장 주목받는 테크 브랜드와 새로운 디지털 경험을 한곳에서 만나보세요.</p><a class="round-link" href="#shop">신제품 보기 <i>↓</i></a></div><div class="hero-image"><img src="https://images.unsplash.com/photo-1550009158-9ebf69173e03?auto=format&fit=crop&w=1500&q=90" alt="최신 IT 기기"><span class="image-caption">01 / FUTURE IS NOW</span></div></section>
  <section class="categories" id="brands"><p class="kicker">SHOP BY CATEGORY</p><div>${categories.slice(0, 6).map((item, index) => `<button data-category-link="${item}"><b>0${index + 1}</b>${item}<i>↗</i></button>`).join('')}</div></section>
  <section class="shop" id="shop"><div class="section-heading"><div><p class="kicker">NEW ARRIVALS</p><h2>가장 먼저,<br>새로운 기술.</h2></div><p>성능과 디자인, 사용 경험까지 엄격한 기준으로 고른 IT 기기를 소개합니다.</p></div><div class="filters"><button class="filter ${category === 'All' ? 'active' : ''}" data-filter="All">전체</button>${categories.map(item => `<button class="filter ${category === item ? 'active' : ''}" data-filter="${item}">${item}</button>`).join('')}<button class="sort">신상품순 <span>⌄</span></button></div><div class="products">${products.map(productCard).join('')}</div><button class="load-more">더 많은 제품 보기 <span>↓</span></button></section>
  <section class="story" id="story"><div class="story-image"><img src="https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1300&q=85" alt="반도체와 전자 기판"></div><div class="story-copy"><p class="kicker">TECH STORY / 08</p><h2>좋은 기술은<br><em>조용히 앞서갑니다.</em></h2><p>복잡한 스펙보다 중요한 것은 매일의 경험입니다. 더 오래 쓰고, 더 편하게 연결되는 기술을 발견해 보세요.</p><a href="#" class="text-link">테크 스토리 읽기 <span>→</span></a></div></section>
  <section class="newsletter" id="about"><p class="kicker">TECHZONE NEWS</p><h2>새로운 기술을<br>가장 먼저.</h2><form id="newsletter-form"><label class="sr-only" for="email">이메일</label><input id="email" type="email" placeholder="이메일 주소를 입력하세요" required><button>뉴스레터 구독 <span>→</span></button></form><p class="fine-print">신제품 소식과 테크 트렌드만 담아 보내드립니다.</p></section></main>
  <footer><a class="logo" href="#top">TECH<span>ZONE</span></a><div><a href="#">인스타그램</a><a href="#">고객센터</a><a href="#">이용약관</a></div><p>© 2026 TECHZONE</p></footer>
  <dialog id="product-dialog" class="product-dialog"><button class="dialog-close" aria-label="닫기">×</button><div id="product-content"></div></dialog>
  <aside class="cart-panel" aria-label="장바구니"><div class="cart-head"><h2>장바구니 <span>${cartCount()}</span></h2><button class="cart-close" aria-label="닫기">×</button></div><div id="cart-items">${cartMarkup()}</div><div class="cart-footer"><div><span>상품 금액</span><strong>${won(cartTotal())}</strong></div><p>배송비는 주문서에서 계산됩니다.</p><button class="checkout">주문하기 <span>→</span></button></div></aside><div class="cart-backdrop"></div>
  <dialog id="checkout-dialog" class="checkout-dialog"><button class="dialog-close" aria-label="닫기">×</button><div id="checkout-content"></div></dialog><div class="toast" role="status"></div>`;
  bindEvents();
}

function bindEvents() {
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => { category = button.dataset.filter; render(); document.querySelector('#shop').scrollIntoView({ behavior: 'smooth' }); }));
  document.querySelectorAll('[data-category-link]').forEach(button => button.addEventListener('click', () => { category = button.dataset.categoryLink; render(); document.querySelector('#shop').scrollIntoView({ behavior: 'smooth' }); }));
  document.querySelectorAll('[data-product]').forEach(button => button.addEventListener('click', () => openProduct(button.dataset.product)));
  document.querySelectorAll('[data-favorite]').forEach(button => button.addEventListener('click', () => { const id = button.dataset.favorite; favorites.has(id) ? favorites.delete(id) : favorites.add(id); save(); render(); toast(favorites.has(id) ? '찜 목록에 추가했습니다.' : '찜 목록에서 삭제했습니다.'); }));
  document.querySelector('.bag-button').addEventListener('click', openCart); document.querySelector('.cart-close').addEventListener('click', closeCart); document.querySelector('.cart-backdrop').addEventListener('click', closeCart);
  document.querySelectorAll('[data-change]').forEach(button => button.addEventListener('click', () => changeQuantity(button.dataset.quantity, Number(button.dataset.change))));
  document.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => { cart = cart.filter(item => item.id !== button.dataset.remove); save(); render(); openCart(); }));
  document.querySelectorAll('.dialog-close').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  document.querySelector('.checkout').addEventListener('click', checkout); document.querySelector('.search-open').addEventListener('click', searchProducts);
  document.querySelector('#newsletter-form').addEventListener('submit', event => { event.preventDefault(); event.target.reset(); toast('뉴스레터 구독이 완료되었습니다.'); });
  document.querySelector('.announcement button').addEventListener('click', event => event.currentTarget.parentElement.remove());
}

function openProduct(id) { const product = products.find(item => item.id === id); document.querySelector('#product-content').innerHTML = `<img src="${product.image}" alt="${product.name}"><div class="dialog-info"><p class="kicker">${product.brand} · ${product.category}</p><h2>${product.name}</h2><strong>${won(product.price)}</strong><p>${product.note}</p><div class="option"><span>색상 / 옵션</span><b>${product.color}</b></div><button class="add-to-cart" data-add="${product.id}">장바구니 담기 <span>→</span></button><p class="shipping">80,000원 이상 구매 시 무료 배송</p></div>`; const dialog = document.querySelector('#product-dialog'); dialog.showModal(); document.querySelector('[data-add]').addEventListener('click', () => addToCart(product)); }
function addToCart(product) { const current = cart.find(item => item.id === product.id); current ? current.quantity += 1 : cart.push({ ...product, quantity: 1 }); save(); if (apiOnline) api(`/carts/${guestId}/items`, { method: 'POST', body: JSON.stringify({ productId: product.id, name: product.name, brand: product.brand, image: product.image, price: product.price, quantity: 1 }) }).catch(() => {}); document.querySelector('#product-dialog').close(); render(); openCart(); toast('장바구니에 담았습니다.'); }
function openCart() { document.querySelector('.cart-panel').classList.add('open'); document.querySelector('.cart-backdrop').classList.add('open'); }
function closeCart() { document.querySelector('.cart-panel').classList.remove('open'); document.querySelector('.cart-backdrop').classList.remove('open'); }
function changeQuantity(id, change) { const item = cart.find(entry => entry.id === id); item.quantity += change; if (item.quantity < 1) cart = cart.filter(entry => entry.id !== id); save(); if (apiOnline) api(`/carts/${guestId}/items/${id}`, { method: 'PATCH', body: JSON.stringify({ quantity: item?.quantity || 0 }) }).catch(() => {}); render(); openCart(); }
function checkout() { if (!cart.length) return toast('장바구니에 제품을 담아주세요.'); closeCart(); document.querySelector('#checkout-content').innerHTML = `<p class="kicker">SECURE CHECKOUT</p><h2>거의 다 왔어요.</h2><p>총 ${cartCount()}개 상품 · <strong>${won(cartTotal())}</strong></p><form id="order-form"><label>받는 분<input required placeholder="홍길동"></label><label>연락처<input required type="tel" placeholder="010-0000-0000"></label><label>배송 주소<input required placeholder="서울시 ..."></label><button>${won(cartTotal())} 결제하기 <span>→</span></button></form>`; const dialog = document.querySelector('#checkout-dialog'); dialog.showModal(); document.querySelector('#order-form').addEventListener('submit', async event => { event.preventDefault(); const form = event.target; const payload = { userId: guestId, items: cart.map(item => ({ productId: item.id, name: item.name, brand: item.brand, image: item.image, price: item.price, quantity: item.quantity })), shipping: { recipient: form.elements[0].value, phone: form.elements[1].value, address: form.elements[2].value } }; try { const result = apiOnline ? await api('/orders', { method: 'POST', body: JSON.stringify(payload) }) : { orderNumber: `TZ-${Date.now().toString().slice(-7)}` }; cart = []; save(); if (apiOnline) api(`/carts/${guestId}`, { method: 'DELETE' }).catch(() => {}); dialog.close(); render(); toast(`주문 ${result.orderNumber}이 접수되었습니다.`); } catch { toast('주문 처리에 실패했습니다. 다시 시도해주세요.'); } }); }
async function searchProducts() { const query = prompt('찾고 싶은 IT 기기를 입력하세요'); if (query === null) return; if (apiOnline) { try { const result = await api(`/search?q=${encodeURIComponent(query)}`); products = result.items; category = 'All'; render(); document.querySelector('#shop').scrollIntoView({ behavior: 'smooth' }); return; } catch { toast('검색 서버에 연결할 수 없습니다.'); } } products = fallbackProducts.filter(item => `${item.name} ${item.brand} ${item.category}`.toLowerCase().includes(query.toLowerCase())); category = 'All'; render(); }
function toast(message) { setTimeout(() => { const element = document.querySelector('.toast'); if (!element) return; element.textContent = message; element.classList.add('show'); setTimeout(() => element.classList.remove('show'), 2200); }, 10); }
render();
loadProducts();
