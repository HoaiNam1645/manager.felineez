import 'dotenv/config';
import { prisma } from '../api/_lib/prisma.js';
import { getAccessTokenFromRefreshToken } from '../api/_lib/googleAuthHelper.js';
import { getHtmlFromGmailPayload, getPlainTextFromGmailPayload } from '../api/_lib/gmailHelper.js';
import { parseMessage, RULES } from '../src/services/rules.js';
import { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET } from '../api/_lib/microsoftConfig.js';

const rule = RULES.find((r) => r.name === 'Etsy_Cancelled');
if (!rule) throw new Error('Missing Etsy_Cancelled rule');

const from = new Date(process.env.CANCEL_SYNC_FROM || '2026-01-01T00:00:00.000Z');
const to = new Date(process.env.CANCEL_SYNC_TO || Date.now() + 24 * 60 * 60 * 1000);

type SyncRecord = {
  emailId: string;
  dtLocal: Date;
  amount: number;
  orderId: string | null;
  currency: string | null;
  source: string;
  accountEmail: string;
  accountId: string;
  kind: 'HELP';
  helpKind: string | null;
  productName: string | null;
  details: any;
};

function platformAllowsEtsy(platforms: any): boolean {
  if (!Array.isArray(platforms) || platforms.length === 0) return true;
  return platforms.includes('etsy');
}

function getCancellationTransactionId(record: any): string | null {
  const value = record?.details?.cancellation?.transactionId ?? record?.orderId;
  return value ? String(value).trim() : null;
}

function hasTransactionId(details: any, transactionId: string): boolean {
  const items = Array.isArray(details?.items) ? details.items : [];
  return items.some((item: any) => String(item?.transactionId || '').trim() === transactionId);
}

async function findOrderIdByTransactionId(teamId: string, transactionId: string, accountId: string, accountEmail: string) {
  const findMatch = async (where: any) => {
    const candidates = await prisma.record.findMany({
      where,
      orderBy: { dtLocal: 'desc' },
      take: 10000,
      select: { orderId: true, details: true },
    });
    return candidates.find((record: any) => hasTransactionId(record.details, transactionId))?.orderId || null;
  };

  return await findMatch({
    teamId,
    kind: 'ORDER',
    source: 'Etsy_Sales',
    deletedAt: null,
    OR: [{ accountId }, { accountEmail }],
  }) || await findMatch({
    teamId,
    kind: 'ORDER',
    source: 'Etsy_Sales',
    deletedAt: null,
  });
}

async function mapAndUpsert(teamId: string, record: SyncRecord) {
  const transactionId = getCancellationTransactionId(record);
  if (transactionId) {
    const matchedOrderId = await findOrderIdByTransactionId(teamId, transactionId, record.accountId, record.accountEmail);
    if (matchedOrderId) {
      record.orderId = matchedOrderId;
      record.details = {
        ...(record.details || {}),
        cancellation: {
          ...(record.details?.cancellation || {}),
          transactionId,
          matchedOrderId,
        },
      };
    }
  }

  await prisma.record.upsert({
    where: { teamId_emailId: { teamId, emailId: record.emailId } },
    update: record,
    create: { teamId, ...record },
  });

  return { transactionId, matchedOrderId: record.details?.cancellation?.matchedOrderId || null };
}

async function fetchGmailCancelRecords(account: any): Promise<SyncRecord[]> {
  const accessToken = await getAccessTokenFromRefreshToken(account.token);
  const query = `${rule!.query} after:${Math.floor(from.getTime() / 1000)} before:${Math.floor(to.getTime() / 1000)}`;
  const records: SyncRecord[] = [];
  let pageToken: string | undefined;

  do {
    const listUrl = new URL('https://www.googleapis.com/gmail/v1/users/me/messages');
    listUrl.searchParams.set('q', query);
    listUrl.searchParams.set('maxResults', '100');
    if (pageToken) listUrl.searchParams.set('pageToken', pageToken);

    const listResponse = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!listResponse.ok) throw new Error(`Gmail list failed ${listResponse.status}: ${await listResponse.text()}`);
    const listData: any = await listResponse.json();

    for (const message of listData.messages || []) {
      const msgUrl = `https://www.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=full`;
      const msgResponse = await fetch(msgUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!msgResponse.ok) continue;
      const msgData: any = await msgResponse.json();
      const subject = msgData.payload?.headers?.find((h: any) => String(h.name || '').toLowerCase() === 'subject')?.value || '';
      const body = getHtmlFromGmailPayload(msgData.payload) || getPlainTextFromGmailPayload(msgData.payload) || '';
      const parsed = parseMessage(rule!, subject, msgData.snippet || '', body);
      if (!parsed) continue;
      records.push({
        emailId: msgData.id,
        dtLocal: new Date(Number(msgData.internalDate)),
        amount: parsed.amount ?? 0,
        orderId: parsed.order_id ?? null,
        currency: parsed.currency ?? null,
        source: rule!.name,
        accountEmail: account.email,
        accountId: account.id,
        kind: 'HELP',
        helpKind: parsed.help_kind ?? null,
        productName: parsed.product_name ?? null,
        details: (parsed as any).details ?? null,
      });
    }

    pageToken = listData.nextPageToken;
  } while (pageToken);

  return records;
}

async function getMicrosoftAccessToken(refreshToken: string) {
  if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
    throw new Error('Missing Microsoft OAuth config');
  }

  const tokenParams = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID,
    scope: 'openid profile email Mail.Read User.Read offline_access',
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    client_secret: MICROSOFT_CLIENT_SECRET,
  });

  const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenParams.toString(),
  });
  const data: any = await response.json();
  if (!response.ok || data.error) throw new Error(data.error_description || 'Failed to refresh Microsoft token');
  return data.access_token as string;
}

async function fetchOutlookCancelRecords(account: any): Promise<SyncRecord[]> {
  const accessToken = await getMicrosoftAccessToken(account.token);
  const subjectQuery = rule!.query.match(/subject:"([^"]+)"/i)?.[1] || 'Your transaction has been canceled';
  const filter = [
    `receivedDateTime ge ${from.toISOString()}`,
    `receivedDateTime lt ${to.toISOString()}`,
    `contains(subject, '${subjectQuery.replace(/'/g, "''")}')`,
  ].join(' and ');
  let url: string | undefined = `https://graph.microsoft.com/v1.0/me/messages?$filter=${encodeURIComponent(filter)}&$select=id,receivedDateTime,subject,bodyPreview,body&$orderby=receivedDateTime desc&$top=100`;
  const records: SyncRecord[] = [];

  while (url) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(`Outlook list failed ${response.status}: ${await response.text()}`);
    const data: any = await response.json();

    for (const message of data.value || []) {
      const parsed = parseMessage(rule!, message.subject || '', message.bodyPreview || '', message.body?.content || '');
      if (!parsed) continue;
      records.push({
        emailId: message.id,
        dtLocal: new Date(message.receivedDateTime),
        amount: parsed.amount ?? 0,
        orderId: parsed.order_id ?? null,
        currency: parsed.currency ?? null,
        source: rule!.name,
        accountEmail: account.email,
        accountId: account.id,
        kind: 'HELP',
        helpKind: parsed.help_kind ?? null,
        productName: parsed.product_name ?? null,
        details: (parsed as any).details ?? null,
      });
    }

    url = data['@odata.nextLink'];
  }

  return records;
}

async function main() {
  console.log(`Sync Etsy cancel emails from ${from.toISOString()} to ${to.toISOString()}`);
  const accounts = await prisma.mailAccount.findMany({
    where: { provider: { in: ['GMAIL', 'OUTLOOK'] } },
    orderBy: [{ teamId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  const etsyAccounts = accounts.filter((account: any) => platformAllowsEtsy(account.platforms));
  console.log(`Accounts: ${etsyAccounts.length}/${accounts.length} Etsy-enabled`);

  let totalFetched = 0;
  let totalUpserted = 0;
  let totalMapped = 0;
  const errors: string[] = [];

  for (const account of etsyAccounts) {
    try {
      const records = account.provider === 'GMAIL'
        ? await fetchGmailCancelRecords(account)
        : await fetchOutlookCancelRecords(account);

      let mapped = 0;
      for (const record of records) {
        const result = await mapAndUpsert(account.teamId, record);
        if (result.matchedOrderId) mapped++;
      }

      totalFetched += records.length;
      totalUpserted += records.length;
      totalMapped += mapped;
      console.log(`${account.email}: fetched=${records.length}, upserted=${records.length}, mapped=${mapped}`);
    } catch (error: any) {
      const message = `${account.email}: ${error?.message || error}`;
      errors.push(message);
      console.error(`ERROR ${message}`);
    }
  }

  console.log(`Done. fetched=${totalFetched}, upserted=${totalUpserted}, mapped=${totalMapped}, errors=${errors.length}`);
  if (errors.length) {
    console.log('Errors:');
    for (const error of errors) console.log(`- ${error}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
