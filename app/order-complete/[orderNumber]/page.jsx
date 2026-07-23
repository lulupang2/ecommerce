import OrderCompleteView from '@/components/store/order-complete-view';
export function generateStaticParams(){return [{orderNumber:'sample'}];}
export default async function Page({params}){const{orderNumber}=await params;return <OrderCompleteView orderNumber={orderNumber}/>;}
