import ShopView from '@/components/store/shop-view';
export const metadata={title:'전체 상품',description:'노트북, 스마트폰, 오디오와 게이밍 기기를 비교하고 구매하세요.'};
export default async function Page(){
  const base=process.env.INTERNAL_API_BASE_URL||'http://gateway:8080/api';
  const [initialData,home]=await Promise.all([
    fetch(`${base}/products?page=1&pageSize=20&sort=popular`,{cache:'no-store'}).then(response=>response.ok?response.json():null).catch(()=>null),
    fetch(`${base}/storefront/home`,{cache:'no-store'}).then(response=>response.ok?response.json():null).catch(()=>null),
  ]);
  return <ShopView initialData={initialData} initialBrands={home?.brands||[]}/>;
}
