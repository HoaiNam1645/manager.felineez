/**
 * Gmail Pub/Sub webhook — Prisma version.
 *
 * Flow:
 *   1. Google Pub/Sub POSTs here whenever a watched Gmail mailbox gets new mail.
 *   2. We look up the matching MailAccount by email and resolve the team.
 *   3. Fetch new messages via Gmail history API since the account's lastKnownHistoryId.
 *   4. Parse each new message with RULES → produce Records.
 *   5. Upsert Records into MySQL (idempotent on emailId).
 *   6. Update the account's lastKnownHistoryId.
 *   7. Insert a Notification row for each detected order/funds event (FCM disabled).
 *
 * Security: the request URL must include ?token=<WEBHOOK_SECRET_TOKEN>.
 */

import { Buffer } from 'buffer';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from './_lib/prisma.js';
import { getAccessTokenFromRefreshToken } from './_lib/googleAuthHelper.js';
import { parseMessage, RULES } from '../src/services/rules.js';
import { getHtmlFromGmailPayload, getPlainTextFromGmailPayload } from './_lib/gmailHelper.js';

type NotificationEvent = { type: 'order' | 'funds'; text: string };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).send('Method Not Allowed');
  }

  const { token } = req.query;
  if (token !== process.env.WEBHOOK_SECRET_TOKEN) {
    console.warn('[gmail-webhook] Unauthorized webhook call attempt');
    return res.status(401).send('Unauthorized');
  }

  try {
    const pubSubMessage = (req.body && (req.body as any).message) || null;
    if (!pubSubMessage || !pubSubMessage.data) {
      console.warn('[gmail-webhook] Invalid Pub/Sub message received:', req.body);
      return res.status(400).send('Invalid Pub/Sub message');
    }

    const data = JSON.parse(Buffer.from(pubSubMessage.data, 'base64').toString('utf-8'));
    const userEmail: string | undefined = data.emailAddress;
    const newHistoryId: string | undefined = data.historyId;

    console.log(`[gmail-webhook] received push for ${userEmail}, historyId=${newHistoryId}`);

    if (!userEmail || !newHistoryId) {
      return res.status(400).send('Missing emailAddress or historyId');
    }

    // 1. Look up MailAccount by email (across all teams, since one email = one account)
    const account = await prisma.mailAccount.findFirst({
      where: { email: userEmail, provider: 'GMAIL' },
    });

    if (!account) {
      console.warn(`[gmail-webhook] no MailAccount registered for ${userEmail}`);
      return res.status(204).send('');
    }

    const teamId = account.teamId;
    const shopName = account.label || userEmail;
    const refreshToken = account.token;
    const lastKnownHistoryId = account.lastKnownHistoryId;

    // First-time webhook: just store the historyId so we have a starting point.
    if (!lastKnownHistoryId) {
      await prisma.mailAccount.update({
        where: { id: account.id },
        data: { lastKnownHistoryId: String(newHistoryId) },
      });
      return res.status(204).send('');
    }

    // 2. Exchange refresh token for short-lived access token
    const accessToken = await getAccessTokenFromRefreshToken(refreshToken);
    const historyUrl = `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${lastKnownHistoryId}&historyTypes=messageAdded`;

    const historyResponse = await fetch(historyUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!historyResponse.ok) {
      const errorText = await historyResponse.text();
      // Any 404 from /history means the stored historyId is too old (or the
      // mailbox was reset). Rebase to the newer id from the Pub/Sub message so
      // future pushes succeed.
      if (historyResponse.status === 404) {
        await prisma.mailAccount.update({
          where: { id: account.id },
          data: { lastKnownHistoryId: String(newHistoryId) },
        });
        console.warn(`[gmail-webhook] history 404 — rebased ${userEmail} to ${newHistoryId}`);
        return res.status(204).send('');
      }
      console.warn('[gmail-webhook] history API non-OK', historyResponse.status, errorText);
      return res.status(204).send('');
    }

    const historyData = await historyResponse.json();

    if (!historyData.history || historyData.history.length === 0) {
      console.log(`[gmail-webhook] no new history items for ${userEmail} (cursor ${lastKnownHistoryId} → ${newHistoryId})`);
      await prisma.mailAccount.update({
        where: { id: account.id },
        data: { lastKnownHistoryId: String(newHistoryId) },
      });
      return res.status(204).send('');
    }

    console.log(`[gmail-webhook] processing ${historyData.history.length} history items for ${userEmail}`);

    // 3. For each new message, fetch + parse
    const newRecords: any[] = [];
    const notificationEvents: NotificationEvent[] = [];

    for (const item of historyData.history as any[]) {
      if (!item.messagesAdded) continue;

      for (const msgHeader of item.messagesAdded) {
        if (!msgHeader.message.labelIds?.includes('INBOX')) continue;

        const msgId = msgHeader.message.id as string;
        const msgUrl = `https://www.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`;

        const msgResponse = await fetch(msgUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!msgResponse.ok) continue;

        const msgData = await msgResponse.json();
        const subject =
          msgData.payload?.headers?.find((h: any) => (h.name || '').toLowerCase() === 'subject')
            ?.value || '';
        const htmlBody = getHtmlFromGmailPayload(msgData.payload);
        const plainBody = getPlainTextFromGmailPayload(msgData.payload);
        const bodyForParsing = htmlBody || plainBody || '';

        console.log(`[gmail-webhook] inspecting msg ${msgId}: subject="${subject.slice(0, 80)}"`);

        let matched = false;
        for (const rule of RULES) {
          const parsedData = parseMessage(rule, subject, msgData.snippet || '', bodyForParsing);
          if (!parsedData) continue;
          matched = true;
          console.log(`[gmail-webhook]   matched rule=${rule.name} orderId=${parsedData.order_id} amount=${parsedData.amount}`);

          const dtLocal = new Date(parseInt(msgData.internalDate, 10));

          newRecords.push({
            emailId: msgData.id,
            dtLocal,
            amount: parsedData.amount ?? 0,
            orderId: parsedData.order_id ?? null,
            currency: parsedData.currency ?? null,
            source: rule.name,
            accountEmail: userEmail,
            kind:
              parsedData.kind === 'order'
                ? 'ORDER'
                : parsedData.kind === 'Funds'
                ? 'FUNDS'
                : parsedData.kind === 'case'
                ? 'CASE'
                : 'HELP',
            caseMsg: parsedData.case_msg ?? null,
            helpKind: parsedData.help_kind ?? null,
            costTotal: parsedData.cost_total ?? null,
            ffCode: parsedData.ff_code ?? null,
            productName: parsedData.product_name ?? null,
            details: (parsedData as any).details ?? null,
          });

          if (parsedData.kind === 'order') {
            notificationEvents.push({
              type: 'order',
              text: `New Order: ${parsedData.order_id || 'Unknown'} - $${parsedData.amount} (${shopName})`,
            });
          } else if (parsedData.kind === 'Funds') {
            notificationEvents.push({
              type: 'funds',
              text: `Funds Received: $${parsedData.amount} ${parsedData.currency || ''} (${shopName})`,
            });
          }
          break;
        }
        if (!matched) {
          console.log(`[gmail-webhook]   no rule matched msg ${msgId}`);
        }
      }
    }

    // 4. Persist records (idempotent on teamId+emailId)
    // Dedupe by emailId first — multiple records with the same emailId in one
    // batch would race each other inside the upsert and trip the
    // Record_teamId_emailId unique constraint. Keep the last occurrence.
    const recordsByEmailId = new Map<string, (typeof newRecords)[number]>();
    for (const r of newRecords) {
      if (!r.emailId) continue; // skip records without an emailId (can't dedupe/upsert on it)
      recordsByEmailId.set(r.emailId, r);
    }
    const dedupedRecords = Array.from(recordsByEmailId.values());

    if (dedupedRecords.length > 0) {
      // Sequential (not Promise.all) so each upsert's SELECT-then-INSERT can't
      // race a sibling inserting the same key.
      for (const r of dedupedRecords) {
        await prisma.record.upsert({
          where: { teamId_emailId: { teamId, emailId: r.emailId } },
          update: {
            dtLocal: r.dtLocal,
            amount: r.amount,
            orderId: r.orderId,
            currency: r.currency,
            source: r.source,
            accountEmail: r.accountEmail,
            accountId: account.id,
            kind: r.kind,
            caseMsg: r.caseMsg,
            helpKind: r.helpKind,
            costTotal: r.costTotal,
            ffCode: r.ffCode,
            productName: r.productName,
            details: r.details,
          },
          create: {
            teamId,
            accountId: account.id,
            ...r,
          },
        });
      }
      console.log(`[gmail-webhook] Persisted ${dedupedRecords.length} records for ${userEmail}`);
    }

    // 5. Advance the history cursor
    await prisma.mailAccount.update({
      where: { id: account.id },
      data: { lastKnownHistoryId: String(newHistoryId) },
    });

    // 6. Notifications (FCM disabled — persist to DB so the bell shows them)
    if (notificationEvents.length > 0) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
      const orders = notificationEvents.filter((e) => e.type === 'order');
      const funds = notificationEvents.filter((e) => e.type === 'funds');

      if (notificationEvents.length === 1) {
        const evt = notificationEvents[0];
        await prisma.notification.create({
          data: {
            teamId,
            type: evt.type === 'order' ? 'NEW_ORDER' : 'FUND',
            title: evt.type === 'order' ? 'New Order!' : 'Funds Received!',
            body: evt.text,
            data: {
              url:
                evt.type === 'order' ? `${appUrl}/?tab=Order+List` : `${appUrl}/?tab=Overview`,
            } as any,
          },
        });
      } else {
        if (orders.length > 0) {
          await prisma.notification.create({
            data: {
              teamId,
              type: 'NEW_ORDER',
              title: 'New Orders Arrived',
              body: `You have ${orders.length} new orders.`,
              data: { url: `${appUrl}/?tab=Order+List`, count: orders.length } as any,
            },
          });
        }
        if (funds.length > 0) {
          await prisma.notification.create({
            data: {
              teamId,
              type: 'FUND',
              title: 'New Funds Received',
              body: `You have ${funds.length} new payout updates.`,
              data: { url: `${appUrl}/?tab=Overview`, count: funds.length } as any,
            },
          });
        }
      }
    }

    return res.status(204).send('');
  } catch (error: any) {
    console.error('[API /gmail-webhook Error]', error);
    return res.status(500).send(error?.message || 'Internal Server Error');
  }
}
