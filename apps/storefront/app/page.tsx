import HomeView from '@/components/store/home-view';

export default async function Page(){
  const base=process.env.INTERNAL_API_BASE_URL||'http://gateway:8080/api';
  const initialData=await fetch(`${base}/storefront/home`,{cache:'no-store'})
    .then(response=>response.ok?response.json():null)
    .catch(()=>null);
  return <HomeView initialData={initialData}/>;
}
