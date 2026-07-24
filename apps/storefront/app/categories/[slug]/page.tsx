import ShopView from '@/components/store/shop-view';
export async function generateStaticParams(){return ['laptop','smartphone','audio','gaming','smart-home','wearable','accessory'].map(slug=>({slug}));}
export default async function Page({params}){const {slug}=await params;return <ShopView initialCategory={slug}/>;}
