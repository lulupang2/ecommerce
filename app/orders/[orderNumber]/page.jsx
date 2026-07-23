import OrderDetailView from '@/components/store/order-detail-view';
export function generateStaticParams(){return [{orderNumber:'sample'}];}
export default async function Page({params}){const{orderNumber}=await params;return <OrderDetailView orderNumber={orderNumber}/>;}
