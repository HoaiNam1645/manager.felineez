// One-off backfill: enrich existing Record.etsyFees rows with normalized
// VND→USD values + estimated actual net (Etsy "You earned").
//
//   npx tsx scripts/backfill-est-net.ts
//
// Idempotent — re-running just recomputes the derived fields.

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { enrichEtsyFees, emailTaxOf } from '../api/_lib/etsyNet.js';

const prisma = new PrismaClient();

async function main() {
  const records = await prisma.record.findMany({
    where: { etsyFees: { not: null as any } },
    select: { id: true, orderId: true, details: true, etsyFees: true },
  });
  console.log(`Found ${records.length} records with etsyFees`);

  let updated = 0;
  for (const rec of records) {
    const fees: any = rec.etsyFees;
    if (!fees || typeof fees !== 'object') continue;
    const enriched = enrichEtsyFees(fees, emailTaxOf(rec.details));
    await prisma.record.update({ where: { id: rec.id }, data: { etsyFees: enriched } });
    updated++;
  }
  console.log(`Backfilled ${updated} records.`);

  // Show the two verification orders if present
  for (const oid of ['4099339775']) {
    const r = await prisma.record.findFirst({ where: { orderId: oid }, select: { etsyFees: true } });
    if (r) {
      const f: any = r.etsyFees;
      console.log(`Order ${oid}: shopCurrency=${f.shopCurrency} rate=${f.exchangeRate} estActualNet=$${f.estActualNet}`);
      console.log('  breakdown:', JSON.stringify(f.estBreakdown));
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
