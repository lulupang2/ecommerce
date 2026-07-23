const { server, listen } = require('../../shared/http');
const app = server('gateway');
const targets = {
  auth: process.env.AUTH_URL || 'http://localhost:3001', catalog: process.env.CATALOG_URL || 'http://localhost:3002', cart: process.env.CART_URL || 'http://localhost:3003', order: process.env.ORDER_URL || 'http://localhost:3004', payment: process.env.PAYMENT_URL || 'http://localhost:3005', inventory: process.env.INVENTORY_URL || 'http://localhost:3006', notification: process.env.NOTIFICATION_URL || 'http://localhost:3007', search: process.env.SEARCH_URL || 'http://localhost:3008', media: process.env.MEDIA_URL || 'http://localhost:3009', fulfillment: process.env.FULFILLMENT_URL || 'http://localhost:3010', procurement: process.env.PROCUREMENT_URL || 'http://localhost:3011', admin: process.env.ADMIN_URL || 'http://localhost:3012',
};
const routes = [{prefix:'/api/auth',service:'auth'}, {prefix:'/api/admin',service:'admin'}, {prefix:'/api/products',service:'catalog'}, {prefix:'/api/reviews',service:'catalog'}, {prefix:'/api/carts',service:'cart'}, {prefix:'/api/orders',service:'order'}, {prefix:'/api/payments',service:'payment'}, {prefix:'/api/inventory',service:'inventory'}, {prefix:'/api/fulfillment',service:'fulfillment'}, {prefix:'/api/procurement',service:'procurement'}, {prefix:'/api/notifications',service:'notification'}, {prefix:'/api/search',service:'search'}, {prefix:'/api/media',service:'media'}];
app.get('/api/health/:service', async (req, res) => {
  const target = targets[req.params.service];
  if (!target) return res.status(404).json({ code: 'UNKNOWN_SERVICE' });
  try {
    const response = await fetch(`${target}/health`);
    res.status(response.status).send(await response.text());
  } catch { res.status(503).json({ code: 'SERVICE_UNAVAILABLE', service: req.params.service }); }
});
for (const route of routes) app.use(route.prefix, async (req,res) => { try { const url = targets[route.service] + req.originalUrl.replace('/api',''); const response = await fetch(url,{method:req.method,headers:{'content-type':'application/json',authorization:req.headers.authorization||''},body:['GET','HEAD'].includes(req.method)?undefined:JSON.stringify(req.body)}); const text=await response.text(); res.status(response.status); if(text)res.type(response.headers.get('content-type')||'application/json').send(text); else res.end(); } catch(error) { res.status(503).json({code:'SERVICE_UNAVAILABLE',service:route.service,message:error.message}); } });
listen(app,'gateway');
