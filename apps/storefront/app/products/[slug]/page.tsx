import ProductDetailView from '@/components/store/product-detail-view';
import { cache } from 'react';

const slugs=['nova-book-air-14','orbit-pro-x','sonic-max-anc','arc-mechanical-75','home-mini-beam','pixel-watch-s','dock-one','frame-4k'];
export function generateStaticParams(){return slugs.map(slug=>({slug}));}

const getProduct = cache(async slug => {
  const base = process.env.INTERNAL_API_BASE_URL || 'http://gateway:8080/api';
  const response = await fetch(`${base}/products/by-slug/${slug}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Product request failed with ${response.status}`);
  return response.json();
});

function plainText(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function generateMetadata({params}){
  const {slug}=await params;
  try {
    const product=await getProduct(slug);
    const description=plainText(product.note)||`${product.name}의 가격, 옵션, 재고와 배송 정보를 확인하세요.`;
    return {
      title:product.name,
      description,
      alternates:{canonical:`/products/${slug}/`},
      openGraph:{title:product.name,description,images:[{url:product.image,alt:product.name}]},
    };
  } catch {
    return {
      title:'상품 상세',
      description:'TECHZONE 상품의 가격, 옵션, 재고와 배송 정보를 확인하세요.',
      alternates:{canonical:`/products/${slug}/`},
    };
  }
}

export default async function Page({params}){
  const {slug}=await params;
  const product=await getProduct(slug).catch(()=>null);
  const siteUrl=process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:15173';
  const jsonLd=product?{
    '@context':'https://schema.org',
    '@type':'Product',
    name:product.name,
    description:plainText(product.note),
    image:(product.images||[]).map(image=>image.url),
    sku:product.sku,
    brand:{'@type':'Brand',name:product.brand},
    offers:{
      '@type':'Offer',
      url:new URL(`/products/${slug}/`,siteUrl).toString(),
      priceCurrency:'KRW',
      price:product.price,
      availability:product.stock>0?'https://schema.org/InStock':'https://schema.org/OutOfStock',
      itemCondition:'https://schema.org/NewCondition',
    },
  }:null;
  return <>
    <ProductDetailView slug={slug} initialProduct={product}/>
    {jsonLd&&<script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(jsonLd).replace(/</g,'\\u003c')}}/>}
  </>;
}
