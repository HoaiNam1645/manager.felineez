// notificationHelper.ts — Prisma version (replaces Firestore implementation).

import { prisma } from './prisma.js';

export interface CreateNotificationParams {
  teamId: string;
  type: 'NEW_ORDER' | 'FUND' | 'SUMMARY' | 'LOGIN' | 'CASE_HELP';
  title: string;
  content: string;
  metadata: Record<string, any>;
}

export async function createNotificationDocument(params: CreateNotificationParams): Promise<string> {
  const created = await prisma.notification.create({
    data: {
      teamId: params.teamId,
      type: params.type,
      title: params.title,
      body: params.content,
      data: params.metadata as any,
    },
  });
  console.log(`[Notification] Created notification: ${created.id}`);
  return created.id;
}
