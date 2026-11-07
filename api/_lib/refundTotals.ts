import { prisma } from './prisma.js';

interface RefundScope {
  teamId: string;
  orderId: string;
  accountId?: string | null;
  accountEmail?: string | null;
}

const positiveNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const refundSignature = (record: any): string => {
  const refund = record.details?.refund || {};
  const amount = positiveNumber(record.refundAmount || refund.amount);
  const currency = String(refund.currency || record.currency || '').trim().toUpperCase();
  const reason = String(refund.reason || '').trim().toLowerCase().replace(/\s+/g, ' ');

  // Etsy can send the same refund notification more than once. The parsed
  // amount/currency/reason tuple identifies those repeated emails.
  return reason
    ? `${amount.toFixed(4)}|${currency}|${reason}`
    : `${amount.toFixed(4)}|${currency}|${record.emailId || record.id}`;
};

export async function syncEmailRefundTotal(scope: RefundScope): Promise<number> {
  const accountMatches = [
    ...(scope.accountId ? [{ accountId: scope.accountId }] : []),
    ...(scope.accountEmail ? [{ accountEmail: scope.accountEmail }] : []),
  ];
  const accountScope = accountMatches.length > 0 ? { OR: accountMatches } : {};

  const refunds = await prisma.record.findMany({
    where: {
      teamId: scope.teamId,
      source: 'Etsy_Refund',
      orderId: scope.orderId,
      deletedAt: null,
      ...accountScope,
    },
    select: {
      id: true,
      emailId: true,
      refundAmount: true,
      currency: true,
      details: true,
    },
  });

  const uniqueRefunds = new Map<string, number>();
  refunds.forEach((record) => {
    const amount = positiveNumber(record.refundAmount || (record.details as any)?.refund?.amount);
    if (amount > 0) uniqueRefunds.set(refundSignature(record), amount);
  });
  const emailRefundTotal = Array.from(uniqueRefunds.values()).reduce((sum, amount) => sum + amount, 0);

  const orders = await prisma.record.findMany({
    where: {
      teamId: scope.teamId,
      kind: 'ORDER',
      source: 'Etsy_Sales',
      orderId: scope.orderId,
      deletedAt: null,
      ...accountScope,
    },
    select: {
      id: true,
      amount: true,
      orderStatus: true,
      details: true,
      etsyFees: true,
    },
  });

  for (const order of orders) {
    const fees = order.etsyFees as any;
    const details = order.details as any;
    const orderTotal = positiveNumber(fees?.orderTotal)
      || positiveNumber(details?.financials?.orderTotal)
      || positiveNumber(order.amount);
    const cappedTotal = orderTotal > 0
      ? Math.min(emailRefundTotal, orderTotal)
      : emailRefundTotal;

    await prisma.record.update({
      where: { id: order.id },
      data: {
        refundAmount: Math.round(cappedTotal * 100) / 100,
        orderStatus: order.orderStatus === 'CANCELLED' ? 'CANCELLED' : 'REFUND',
      },
    });
  }

  return Math.round(emailRefundTotal * 100) / 100;
}
