const { database } = require('../../shared/db');
const { server, listen } = require('../../shared/http');

const db = database('cart');
const app = server('cart');

async function init() {
  await db.wait();
  await db.query(`CREATE TABLE IF NOT EXISTS cart_items(user_id UUID NOT NULL,product_id UUID NOT NULL,variant_id UUID NOT NULL,sku TEXT,name TEXT NOT NULL,brand TEXT NOT NULL,option_values JSONB NOT NULL DEFAULT '{}',image TEXT,unit_price INTEGER NOT NULL CHECK(unit_price>=0),quantity INTEGER NOT NULL CHECK(quantity>0),updated_at TIMESTAMPTZ DEFAULT now(),PRIMARY KEY(user_id,variant_id))`);
}
app.get('/carts/:userId',async(req,res)=>{const rows=await db.query(`SELECT user_id,product_id,variant_id,sku,name,brand,option_values,image,unit_price price,quantity,updated_at FROM cart_items WHERE user_id=$1 ORDER BY updated_at DESC`,[req.params.userId]);res.json({items:rows.rows});});
app.post('/carts/:userId/items',async(req,res)=>{
  const x=req.body; const variantId=x.variantId||x.productId;
  if(!x.productId||!variantId||!x.name||!Number.isInteger(Number(x.price))||Number(x.price)<0||!Number.isInteger(Number(x.quantity||1))||Number(x.quantity||1)<1)return res.status(400).json({code:'INVALID_ITEM'});
  await db.query(`INSERT INTO cart_items(user_id,product_id,variant_id,sku,name,brand,option_values,image,unit_price,quantity) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(user_id,variant_id) DO UPDATE SET quantity=EXCLUDED.quantity,unit_price=EXCLUDED.unit_price,option_values=EXCLUDED.option_values,updated_at=now()`,[req.params.userId,x.productId,variantId,x.sku||null,x.name,x.brand||'',JSON.stringify(x.optionValues||{}),x.image||null,Number(x.price),Number(x.quantity||1)]);
  res.status(201).json({variantId,quantity:Number(x.quantity||1)});
});
app.patch('/carts/:userId/items/:variantId',async(req,res)=>{const quantity=Number(req.body.quantity);if(!Number.isInteger(quantity))return res.status(400).json({code:'INVALID_QUANTITY'});if(quantity<1)await db.query(`DELETE FROM cart_items WHERE user_id=$1 AND variant_id=$2`,[req.params.userId,req.params.variantId]);else await db.query(`UPDATE cart_items SET quantity=$3,updated_at=now() WHERE user_id=$1 AND variant_id=$2`,[req.params.userId,req.params.variantId,quantity]);res.status(204).end();});
app.delete('/carts/:userId',async(req,res)=>{await db.query(`DELETE FROM cart_items WHERE user_id=$1`,[req.params.userId]);res.status(204).end();});

init().then(()=>listen(app,'cart')).catch(error=>{console.error(error);process.exitCode=1;});
