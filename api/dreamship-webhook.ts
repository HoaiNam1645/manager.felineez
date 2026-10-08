import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from './_lib/prisma.js';

// Dreamship webhook receiver. We pass this URL as `webhook_url` on every order
// we create, so no manual setup is needed on their dashboard.
// Payload (docs.dreamship.com/reference/webhooks):
//   { id, object: 'order', event: { action, ... }, data: { ...same as GET /orders/{id} } }
// Match our record by data.reference_id (= Etsy order id) + ffCode LIKE 'DSH-%'.
// Status mapping; manual ON_HOLD/CANCELLED is never overridden.
const STATUS_MAP: Record<string, string> = {
  submitted: 'PRODUCING',
  accepted: 'PRODUCING',
  partially_fulfilled: 'PRODUCING',
  fulfilled: 'SHIPPED',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const b = req.body || {};
    if (b.object !== 'order' || !b.data) {
      return res.status(200).json({ ok: true, skipped: 'not an order event' });
    }
    const data = b.data;
    const referenceId = String(data.reference_id || '');
    const dreamshipId = String(b.id || data.id || '');
    if (!referenceId && !dreamshipId) return res.status(200).json({ ok: true, skipped: 'no ids' });

    // Prefer exact ffCode match (DSH-{id}), fall back to reference_id.
    const records = await prisma.record.findMany({
      where: dreamshipId
        ? { kind: 'ORDER', deletedAt: null, ffCode: `DSH-${dreamshipId}` }
        : { kind: 'ORDER', deletedAt: null, orderId: referenceId, ffCode: { startsWith: 'DSH-' } },
      select: { id: true, orderStatus: true, costTotal: true },
    });
    if (records.length === 0) return res.status(200).json({ ok: true, matched: 0 });

    const patchBase: any = {};

    // Tracking lives at fulfillments[].trackings[].tracking_number (per the
    // order schema) — keep a direct-field fallback just in case.
    const fulfillments = Array.isArray(data.fulfillments) ? data.fulfillments : [];
    let trackingNumber = '';
    for (const f of fulfillments) {
      const trackings = Array.isArray(f?.trackings) ? f.trackings : [];
      const t = trackings.find((x: any) => x?.tracking_number);
      if (t?.tracking_number) { trackingNumber = String(t.tracking_number); break; }
      if (f?.tracking_number) { trackingNumber = String(f.tracking_number); break; }
    }
    if (trackingNumber) patchBase.trackingCode = trackingNumber.slice(0, 64);

    const mapped = STATUS_MAP[String(data.status || '').toLowerCase()];
    if (mapped) patchBase.orderStatus = mapped;

    // Their charge for the order → Base Cost
    const totalCost = Number(data.total_cost);
    if (Number.isFinite(totalCost) && totalCost > 0) patchBase.costTotal = totalCost;

    if (Object.keys(patchBase).length === 0) {
      return res.status(200).json({ ok: true, matched: records.length, skipped: 'no-op event' });
    }

    let updated = 0;
    for (const r of records) {
      const patch = { ...patchBase };
      if (patch.orderStatus && ['ON_HOLD', 'CANCELLED', 'REFUND'].includes(r.orderStatus ?? '')) {
        delete patch.orderStatus;
      }
      if (Object.keys(patch).length > 0) {
        await prisma.record.update({ where: { id: r.id }, data: patch });
        updated++;
      }
    }
    console.log(`[dreamship-webhook] ${b?.event?.action || '?'} ref=${referenceId} ds=${dreamshipId} matched=${records.length} updated=${updated}`);
    return res.status(200).json({ ok: true, matched: records.length, updated });
  } catch (err: any) {
    console.error('[dreamship-webhook]', err);
    return res.status(500).json({ message: err?.message || 'error' });
  }
}
