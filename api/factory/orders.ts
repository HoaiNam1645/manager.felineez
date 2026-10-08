import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { requireAuth } from '../_lib/auth.js';
import { badRequest, methodNotAllowed, notFound, serverError } from '../_lib/helpers.js';
import { mangoFetch, vinawayFetch, monkeyKingFetch, dreamshipFetch, hongPhatFetch, hogotoFetch, FactoryError, FactoryProvider } from '../_lib/factory.js';
import { lemiexGet, LemiexError } from '../_lib/lemiex.js';

// Create / track factory orders (MangoTee, Vinaway, MonkeyKing, Dreamship).
// Mirrors api/lemiex/orders.
//   POST /api/factory/orders { provider, recordId, payload }
//     → creates at the factory, links record: ffCode = {PREFIX}-{id}, Status → PRODUCING
//   GET  /api/factory/orders?provider=...&id={PREFIX}-xxx → order detail
//     (monkeyking: id = our seller_order_id, looked up via searchCriteria)
const FF_PREFIX: Record<FactoryProvider, string> = {
  mango: 'MGO',
  vinaway: 'VNW',
  monkeyking: 'MKP',
  dreamship: 'DSH',
  hongphat: 'HPE',
  hogoto: 'HGT',
};
const PROVIDERS: FactoryProvider[] = ['mango', 'vinaway', 'monkeyking', 'dreamship', 'hongphat', 'hogoto'];

const mkOrdersByCustomId = (customOrderId: string) =>
  '/vendors/order/?' +
  'searchCriteria[filterGroups][0][filters][0][field]=custom_order_id' +
  `&searchCriteria[filterGroups][0][filters][0][value]=${encodeURIComponent(customOrderId)}` +
  '&searchCriteria[filterGroups][0][filters][0][conditionType]=eq';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = requireAuth(req, res);
  if (!auth) return;

  try {
    if (req.method === 'GET') {
      // GET also serves lemiex (detail via their API; list from our linked records
      // because their seller API has no list endpoint).
      const provider = String(req.query.provider || '') as FactoryProvider | 'lemiex';
      const ALL = [...PROVIDERS, 'lemiex'];
      if (!ALL.includes(provider)) return badRequest(res, 'provider must be mango|vinaway|monkeyking|dreamship|lemiex');

      try {
        // ---- LIST: GET ?provider=...&list=1&page=&limit= ----
        if (String(req.query.list || '') === '1') {
          const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
          const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));

          if (provider === 'lemiex' || provider === 'hogoto') {
            const prefix = provider === 'lemiex' ? 'LMX-' : 'HGT-';
            const rows = await prisma.record.findMany({
              where: { teamId: auth.teamId, ffCode: { startsWith: prefix } },
              orderBy: { updatedAt: 'desc' },
              skip: (page - 1) * limit,
              take: limit,
              select: {
                id: true, orderId: true, ffCode: true, orderStatus: true,
                trackingCode: true, costTotal: true, dtLocal: true, productName: true,
              },
            });
            return res.status(200).json({ data: rows });
          }
          if (provider === 'mango') {
            const data = await mangoFetch(auth.teamId, `/orders?page=${page}&limit=${limit}`);
            return res.status(200).json(data);
          }
          if (provider === 'vinaway') {
            const data = await vinawayFetch(auth.teamId, `/orders?page=${page}&limit=${limit}`);
            return res.status(200).json(data);
          }
          if (provider === 'monkeyking') {
            const data = await monkeyKingFetch(
              auth.teamId,
              `/vendors/order/?searchCriteria[pageSize]=${limit}&searchCriteria[currentPage]=${page}`
            );
            return res.status(200).json(data);
          }
          if (provider === 'hongphat') {
            const data = await hongPhatFetch(auth.teamId, `/orders?page=${page}&limit=${limit}`);
            return res.status(200).json(data);
          }
          const data = await dreamshipFetch(auth.teamId, `/orders/?page=${page}&limit=${limit}`);
          return res.status(200).json(data);
        }

        // ---- DETAIL: GET ?provider=...&id= ----
        const rawId = String(req.query.id || '');
        const id = rawId.replace(/^(LMX|MGO|VNW|MKP|DSH|HPE|HGT)-/, '');
        if (!id) return badRequest(res, 'id is required');

        if (provider === 'lemiex') {
          const data = await lemiexGet(auth.teamId, `/api/orders/${encodeURIComponent(id)}`);
          return res.status(200).json(data);
        }
        if (provider === 'mango') {
          const data = await mangoFetch(auth.teamId, `/orders/${encodeURIComponent(id)}`);
          return res.status(200).json(data);
        }
        if (provider === 'vinaway') {
          const data = await vinawayFetch(auth.teamId, `/orders/${encodeURIComponent(id)}`);
          return res.status(200).json(data);
        }
        if (provider === 'monkeyking') {
          // Their docs only expose lookup by custom_order_id (our seller_order_id)
          const data = await monkeyKingFetch(auth.teamId, mkOrdersByCustomId(id));
          return res.status(200).json(data);
        }
        if (provider === 'hongphat') {
          // {code} accepts both their order code and our partner order code
          const data = await hongPhatFetch(auth.teamId, `/orders/${encodeURIComponent(id)}`);
          return res.status(200).json(data);
        }
        if (provider === 'hogoto') {
          const data = await hogotoFetch(auth.teamId, `/v1/partner/order/detail?orderCode=${encodeURIComponent(id)}`);
          return res.status(200).json(data);
        }
        const data = await dreamshipFetch(auth.teamId, `/orders/${encodeURIComponent(id)}/`);
        return res.status(200).json(data);
      } catch (e) {
        if (e instanceof FactoryError) return res.status(e.status).json({ message: e.message, errors: e.data });
        if (e instanceof LemiexError) return res.status(e.status === 401 ? 502 : e.status).json({ message: e.message });
        throw e;
      }
    }

    if (req.method === 'POST') {
      const { provider, recordId, payload } = req.body || {};
      if (!PROVIDERS.includes(provider)) return badRequest(res, 'provider must be mango|vinaway|monkeyking|dreamship');
      if (!recordId || !payload || typeof payload !== 'object') {
        return badRequest(res, 'recordId and payload are required');
      }

      const record = await prisma.record.findUnique({ where: { id: String(recordId) } });
      if (!record || record.teamId !== auth.teamId) return notFound(res);

      let factoryOrderId: string | null = null;
      let existed = false;
      try {
        if (provider === 'mango') {
          const json = await mangoFetch(auth.teamId, '/orders', { method: 'POST', body: JSON.stringify(payload) });
          factoryOrderId = String(json?.data?.order_id ?? json?.data?.id ?? payload.order_id ?? '');
        } else if (provider === 'vinaway') {
          const json = await vinawayFetch(auth.teamId, '/orders', { method: 'POST', body: JSON.stringify(payload) });
          if (json?.success === false) throw new FactoryError(400, json?.message || 'Vinaway create failed', json?.errors);
          factoryOrderId = String(json?.internal_order_id ?? json?.id ?? '');
        } else if (provider === 'monkeyking') {
          // MonkeyKing has NO server-side idempotency (their own docs show 3
          // orders sharing one custom_order_id) — guard ourselves:
          // 1) refuse when the record is already linked to an MKP order
          if ((record.ffCode || '').startsWith('MKP-')) {
            return res.status(409).json({ message: `Already sent to MonkeyKing (${record.ffCode})` });
          }
          // 2) ask them whether this seller_order_id already exists
          const sellerOrderId = String(payload?.orderData?.seller_order_id || '');
          if (sellerOrderId) {
            try {
              const found = await monkeyKingFetch(auth.teamId, mkOrdersByCustomId(sellerOrderId));
              const items = Array.isArray(found?.items) ? found.items : [];
              if (items.length > 0) {
                factoryOrderId = String(items[0].increment_id || sellerOrderId);
                existed = true;
              }
            } catch { /* lookup failure must not block creating */ }
          }
          if (!existed) {
            const json = await monkeyKingFetch(auth.teamId, '/vendors/order/import', {
              method: 'POST',
              body: JSON.stringify(payload),
            });
            if (json?.success === false) throw new FactoryError(400, json?.message || 'MonkeyKing create failed');
            factoryOrderId = String(json?.order?.increment_id ?? json?.order?.entity_id ?? '');
          }
        } else if (provider === 'hogoto') {
          // No documented idempotency — refuse when already linked.
          if ((record.ffCode || '').startsWith('HGT-')) {
            return res.status(409).json({ message: `Already sent to Hogoto (${record.ffCode})` });
          }
          const json = await hogotoFetch(auth.teamId, '/v1/partner/order/store', { method: 'POST', body: JSON.stringify(payload) });
          // ApiResult envelope: { code, error, message, result }
          const order = json?.result ?? json?.data ?? json;
          factoryOrderId = String(order?.code ?? order?.id ?? '');
        } else if (provider === 'hongphat') {
          // Idempotent by seller_order_code: an existing code returns the
          // existing order with duplicate: true.
          const json = await hongPhatFetch(auth.teamId, '/orders', { method: 'POST', body: JSON.stringify(payload) });
          const order = json?.data ?? json?.order ?? json;
          factoryOrderId = String(order?.code ?? order?.order_code ?? order?.hp_order_code ?? order?.id ?? payload?.seller_order_code ?? '');
          existed = Boolean(json?.duplicate ?? order?.duplicate);
        } else {
          // Dreamship: attach our webhook receiver per order (takes priority
          // over their global webhook URL — no manual setup needed).
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://manager.felineez.com';
          const body = { ...payload, webhook_url: `${appUrl}/api/dreamship-webhook` };
          const json = await dreamshipFetch(auth.teamId, '/orders/', { method: 'POST', body: JSON.stringify(body) });
          factoryOrderId = String(json?.id ?? '');
          // The documented 201 schema has no `id` — if the live response also
          // omits it, resolve via the reference_id filter on the list endpoint.
          if (!factoryOrderId && payload.reference_id) {
            try {
              const found = await dreamshipFetch(
                auth.teamId,
                `/orders/?reference_id=${encodeURIComponent(String(payload.reference_id))}&limit=1`
              );
              const arr = Array.isArray(found?.data) ? found.data : [];
              if (arr[0]?.id) factoryOrderId = String(arr[0].id);
            } catch { /* fall through to the 502 below */ }
          }
        }
      } catch (e) {
        if (e instanceof FactoryError) return res.status(e.status).json({ message: e.message, errors: e.data });
        throw e;
      }

      if (!factoryOrderId) return res.status(502).json({ message: 'Factory did not return an order id' });

      const ffCode = `${FF_PREFIX[provider as FactoryProvider]}-${factoryOrderId}`;
      const updated = await prisma.record.update({
        where: { id: record.id },
        data: {
          ffCode,
          ...(!['ON_HOLD', 'CANCELLED', 'REFUND'].includes(record.orderStatus ?? '')
            ? { orderStatus: 'PRODUCING' }
            : {}),
        },
      });
      return res.status(200).json({ order_id: factoryOrderId, existed, ff_code: updated.ffCode, order_status: updated.orderStatus });
    }

    return methodNotAllowed(res, ['GET', 'POST']);
  } catch (err) {
    return serverError(res, err);
  }
}
