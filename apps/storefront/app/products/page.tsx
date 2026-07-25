'use client';
import { useEffect, useState } from 'react';
import ProductDetailView from '@/components/store/product-detail-view';
export default function MobileProductPage(){const[id,setId]=useState('');useEffect(()=>setId(new URLSearchParams(location.search).get('id')||''),[]);return id?<ProductDetailView id={id}/>:<main className="p-10">상품을 찾을 수 없습니다.</main>;}
