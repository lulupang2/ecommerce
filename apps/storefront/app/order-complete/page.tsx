'use client';
import { useEffect, useState } from 'react';
import OrderCompleteView from '@/components/store/order-complete-view';
export default function Page(){const[number,setNumber]=useState('');useEffect(()=>setNumber(new URLSearchParams(location.search).get('number')||''),[]);return <OrderCompleteView orderNumber={number}/>;}
