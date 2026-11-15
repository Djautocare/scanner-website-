'use strict';
const carriers = [
  {id:'royal-mail',name:'Royal Mail',url:'https://www.royalmail.com/track-your-item'},
  {id:'evri',name:'Evri',url:'https://www.evri.com/track-a-parcel'},
  {id:'dpd',name:'DPD',url:'https://tracking.dpd.co.uk/'},
  {id:'inpost',name:'InPost',url:'https://inpost.co.uk/tracking'},
  {id:'other',name:'Other carrier',url:null}
];
const statuses = ['ready','dispatched','in_transit','delivered','exception','returned'];
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const fail = (message,statusCode=400) => Object.assign(new Error(message),{statusCode});
const edit = role => ['owner','admin','member'].includes(role);
const columns = 'version,carrier,tracking_number,status,note,delivery_confirmed,created_at';

function clean(body) {
  if (!body || !uuid(body.request_id)) throw fail('Refresh the order and try again.');
  if (!Number.isInteger(body.expected_version)||body.expected_version<0||body.expected_version>=2147483647) throw fail('Refresh the order before saving.');
  if (!carriers.some(carrier=>carrier.id===body.carrier)) throw fail('Choose a carrier.');
  if (!statuses.includes(body.status)) throw fail('Choose a delivery status.');
  const tracking=typeof body.tracking_number==='string'?body.tracking_number.trim():'';
  if (!/^[A-Za-z0-9][A-Za-z0-9 -]{4,58}[A-Za-z0-9]$/.test(tracking)) throw fail('Enter a valid tracking number.');
  const note=body.note ?? '';
  if (typeof note!=='string'||note.length>240) throw fail('Enter a note of up to 240 characters.');
  const confirmed=body.status==='delivered' && body.delivery_confirmed===true;
  if (body.status==='delivered'&&!confirmed) throw fail('Confirm that you checked the delivery with the carrier.');
  return {carrier:body.carrier,tracking_number:tracking,status:body.status,delivery_confirmed:confirmed,note:note.trim()};
}
function scope(req,write) {
  if (!uuid(req.workspace?.id)) throw fail('Select a workspace.',403);
  if (!uuid(req.params?.id)) throw fail('Order unavailable.',404);
  if (write&&(!edit(req.workspace.role)||!uuid(req.user?.id))) throw fail('This account cannot edit delivery records.',403);
  return [req.params.id,req.workspace.id];
}
function matches(row,input) {
  return Object.keys(input).every(key=>row[key]===input[key]);
}

function create({pool,ensureOrders}) {
  async function get(req) {
    const keys=scope(req,false);
    await ensureOrders();
    const order=(await pool.query('SELECT id FROM workspace_orders WHERE id=$1 AND workspace_id=$2',keys)).rows[0];
    if (!order) throw fail('Order unavailable.',404);
    const {rows}=await pool.query('SELECT '+columns+' FROM workspace_order_delivery_events WHERE order_id=$1 ORDER BY version DESC LIMIT 25',[order.id]);
    return {success:true,delivery:rows[0]||null,events:rows,carriers,can_edit:edit(req.workspace.role)};
  }
  async function save(req) {
    const keys=scope(req,true);
    const change=clean(req.body);
    await ensureOrders();
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const {rows:[order]}=await client.query('SELECT id FROM workspace_orders WHERE id=$1 AND workspace_id=$2 FOR UPDATE',keys);
      if(!order)throw fail('Order unavailable.',404);
      const old=(await client.query('SELECT '+columns+' FROM workspace_order_delivery_events WHERE order_id=$1 AND request_id=$2',[order.id,req.body.request_id])).rows[0];
      if(old) {
        if(!matches(old,change)||old.version!==req.body.expected_version+1)throw fail('That delivery update already used different details.',409);
        await client.query('COMMIT');
        return {success:true,delivery:old,unchanged:true};
      }
      const current=(await client.query('SELECT '+columns+' FROM workspace_order_delivery_events WHERE order_id=$1 ORDER BY version DESC LIMIT 1',[order.id])).rows[0];
      const version=current?.version||0;
      if(version!==req.body.expected_version)throw fail('Delivery details changed. Refresh the order before saving.',409);
      if(current&&matches(current,change)){
        await client.query('COMMIT');
        return {success:true,delivery:current,unchanged:true};
      }
      const result=await client.query('INSERT INTO workspace_order_delivery_events (order_id,version,request_id,actor_id,carrier,tracking_number,status,note,delivery_confirmed) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING '+columns,[order.id,version+1,req.body.request_id,req.user.id,change.carrier,change.tracking_number,change.status,change.note,change.delivery_confirmed]);
      await client.query('COMMIT');
      return {success:true,delivery:result.rows[0]};
    }catch(error){
      await client.query('ROLLBACK');
      throw error;
    }finally{client.release();}
  }
  return {get,save};
}
let singleton;
function service(){
  return singleton??=create({pool:require('../database'),ensureOrders:()=>require('./workspaceOrders').service().schema()});
}
module.exports={create,service,clean};
