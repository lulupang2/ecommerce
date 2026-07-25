import HomeView from '@/components/store/home-view';
import { catalogEndpoint } from '@/lib/server-catalog';

export default async function Page(){
  const initialData=await fetch(catalogEndpoint('/storefront/home'),{cache:'no-store'})
    .then(response=>response.ok?response.json():null)
    .catch(()=>null);
  return <HomeView initialData={initialData}/>;
}
