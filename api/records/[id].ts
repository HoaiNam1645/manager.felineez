import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { requireAuth } from '../_lib/auth.js';
import { badRequest, methodNotAllowed, notFound, parseDate, parseId, serverError } from '../_lib/helpers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = requireAuth(req, res);
  if (!auth) return;

  const id = parseId(req.query.id);
  if (!id) return badRequest(res, 'id is required');

  try {
    const record = await prisma.record.findUnique({ where: { id } });
    if (!record || record.teamId !== auth.teamId) return notFound(res);

    if (req.method === 'GET') {
      return res.status(200).json({ record });
    }

    if (req.method === 'PATCH') {
      const b = req.body || {};
      const data: any = {};
      if (b.dt_local !== undefined || b.dtLocal !== undefined)
        data.dtLocal = parseDate(b.dt_local || b.dtLocal);
      if (b.amount !== undefined) data.amount = b.amount;
      if (b.order_id !== undefined || b.orderId !== undefined) data.orderId = b.order_id ?? b.orderId;
      if (b.currency !== undefined) data.currency = b.currency;
      if (b.source !== undefined) data.source = b.source;
      if (b.cost_total !== undefined || b.costTotal !== undefined) data.costTotal = b.cost_total ?? b.costTotal;
      if (b.ff_code !== undefined || b.ffCode !== undefined) data.ffCode = b.ff_code ?? b.ffCode;
      if (b.product_name !== undefined || b.productName !== undefined) data.productName = b.product_name ?? b.productName;
      if (b.details !== undefined) data.details = b.details;
      if (b.case_msg !== undefined || b.caseMsg !== undefined) data.caseMsg = b.case_msg ?? b.caseMsg;
      if (b.help_kind !== undefined || b.helpKind !== undefined) data.helpKind = b.help_kind ?? b.helpKind;

      const updated = await prisma.record.update({ where: { id }, data });
      return res.status(200).json({ record: updated });
    }

    if (req.method === 'DELETE') {
      await prisma.record.delete({ where: { id } });
      return res.status(204).end();
    }

    return methodNotAllowed(res, ['GET', 'PATCH', 'DELETE']);
  } catch (err) {
    return serverError(res, err);
  }
}
