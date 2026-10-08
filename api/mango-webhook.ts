import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from './_lib/prisma.js';

// MangoTee webhook receiver (register this URL at Mango: /api/mango-webhook).
// Events (docs.mangoteeprints.com → Webhooks):
//   order.status   { order_id, previous_status, current_status, ... }
//   order.shipment { order_id, tracking_number, tracking_status, carrier, ... }
// `order_id` is OUR id (we send the Etsy order id when creating), so match on
// Record.orderId + ffCode LIKE 'MGO-%'. Manual ON_HOLD/CANCELLED never overridden.
const STATUS_MAP: Record<string, string> = {
  new_order: 'PRODUCING',
  in_production: 'PRODUCING',
  producing: 'PRODUCING',
  shipped: 'SHIPPED',
  delivered: 'SHIPPED',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const b = req.body || {};
    const event = String(b.event || '');
    const orderId = String(b.order_id || '');
    if (!event || !orderId) return res.status(200).json({ ok: true, skipped: 'missing event/order_id' });

    const records = await prisma.record.findMany({
      where: { orderId, kind: 'ORDER', deletedAt: null, ffCode: { startsWith: 'MGO-' } },
      select: { id: true, orderStatus: true },
    });
    if (records.length === 0) return res.status(200).json({ ok: true, matched: 0 });

    const data: any = {};
    if (event === 'order.shipment') {
      if (b.tracking_number) data.trackingCode = String(b.tracking_number).slice(0, 64);
      data.orderStatus = 'SHIPPED';
    } else if (event === 'order.status') {
      const mapped = STATUS_MAP[String(b.current_status || '').toLowerCase()];
      if (mapped) data.orderStatus = mapped;
    }
    if (Object.keys(data).length === 0) return res.status(200).json({ ok: true, matched: records.length, skipped: 'no-op event' });

    let updated = 0;
    for (const r of records) {
      const patch = { ...data };
      // Never override a manual hold/cancel
      if (patch.orderStatus && ['ON_HOLD', 'CANCELLED', 'REFUND'].includes(r.orderStatus ?? '')) {
        delete patch.orderStatus;
      }
      if (Object.keys(patch).length > 0) {
        await prisma.record.update({ where: { id: r.id }, data: patch });
        updated++;
      }
    }
    console.log(`[mango-webhook] ${event} order=${orderId} matched=${records.length} updated=${updated}`);
    return res.status(200).json({ ok: true, matched: records.length, updated });
  } catch (err: any) {
    console.error('[mango-webhook]', err);
    return res.status(500).json({ message: err?.message || 'error' });
  }
}
