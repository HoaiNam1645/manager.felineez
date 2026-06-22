/**
 * Seed script — create a Team + Owner user for first login.
 *
 * Run:
 *   npm run db:seed
 *
 * Safe to re-run (uses upsert).
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const OWNER_EMAIL = 'owner@nhmedia.local';
const OWNER_PASSWORD = 'password123';

async function main() {
  console.log('🌱 Seeding...');

  const team = await prisma.team.upsert({
    where: { id: 'seed-team' },
    update: { name: 'NH Media' },
    create: { id: 'seed-team', name: 'NH Media' },
  });

  const owner = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: { teamId: team.id, role: 'OWNER' },
    create: {
      email: OWNER_EMAIL,
      password: await bcrypt.hash(OWNER_PASSWORD, 10),
      role: 'OWNER',
      teamId: team.id,
      permissions: {
        viewSales: true,
        viewFunds: true,
        viewFulfill: true,
        canManageSettings: true,
      },
    },
  });

  console.log('✅ Done.');
  console.log(`   Email:    ${owner.email}`);
  console.log(`   Password: ${OWNER_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
