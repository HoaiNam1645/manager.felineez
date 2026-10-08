import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { requireAuth } from '../_lib/auth.js';
import { badRequest, methodNotAllowed, notFound, serverError } from '../_lib/helpers.js';
import { LEMIEX_BASE, getLemiexConfig, lemiexGet, LemiexError } from '../_lib/lemiex.js';

// Lemiex order proxy.
//   POST /api/lemiex/orders { recordId, payload }
//     payload = Lemiex create-order body WITHOUT api_key (injected server-side).
//     On success (or 409 = already created) the dashboard record is linked:
//     ffCode = LMX-{lemiex order id}, orderStatus → PRODUCING.
//   GET /api/lemiex/orders?id={lemiexOrderId}  → order detail (tracking/status/cost)
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = requireAuth(req, res);
  if (!auth) return;

  try {
    if (req.method === 'GET') {
      const id = String(req.query.id || '').replace(/^LMX-/, '');
      if (!id) return badRequest(res, 'id is required');
      try {
        const data = await lemiexGet(auth.teamId, `/api/orders/${encodeURIComponent(id)}`);
        return res.status(200).json(data);
      } catch (e) {
        if (e instanceof LemiexError) return res.status(e.status === 401 ? 502 : e.status).json({ message: e.message });
        throw e;
      }
    }

    if (req.method === 'POST') {
      const { recordId, payload } = req.body || {};
      if (!recordId || !payload || typeof payload !== 'object') {
        return badRequest(res, 'recordId and payload are required');
      }

      const record = await prisma.record.findUnique({ where: { id: String(recordId) } });
      if (!record || record.teamId !== auth.teamId) return notFound(res);

      const cfg = await getLemiexConfig(auth.teamId);
      if (!cfg.apiKey) return badRequest(res, 'Lemiex API key is not configured');

      const resp = await fetch(`${LEMIEX_BASE}/api/orders/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, api_key: cfg.apiKey }),
      });
      const json: any = await resp.json().catch(() => ({}));

      const lemiexOrderId = json?.data?.order_id;
      const existed = resp.status === 409;

      if ((resp.ok || existed) && lemiexOrderId) {
        const updated = await prisma.record.update({
          where: { id: record.id },
          data: {
            ffCode: `LMX-${lemiexOrderId}`,
            // Sent to production — but never off a manual ON_HOLD/CANCELLED.
            ...(!['ON_HOLD', 'CANCELLED', 'REFUND'].includes(record.orderStatus ?? '')
              ? { orderStatus: 'PRODUCING' }
              : {}),
          },
        });
        return res.status(200).json({
          order_id: lemiexOrderId,
          existed,
          ff_code: updated.ffCode,
          order_status: updated.orderStatus,
        });
      }

      return res.status(resp.status >= 400 && resp.status < 500 ? resp.status : 502).json({
        message: json?.message || `Lemiex create failed (${resp.status})`,
        errors: json?.errors || undefined,
      });
    }

    return methodNotAllowed(res, ['GET', 'POST']);
  } catch (err) {
    return serverError(res, err);
  }
}
