import { prisma } from './prisma.js';

type AnyRecord = any;
type ShopLabelMap = Map<string, string>;

const botToken = () => process.env.TELEGRAM_BOT_TOKEN || '';
const orderChatIds = () => splitChatIds(process.env.TELEGRAM_NEW_ORDER_CHAT_ID);
const supportChatIds = () => splitChatIds(process.env.TELEGRAM_SUPPORT_CHAT_ID);
const orderThreadId = () => numericEnv(process.env.TELEGRAM_NEW_ORDER_THREAD_ID);
const supportThreadId = () => numericEnv(process.env.TELEGRAM_SUPPORT_THREAD_ID);

const splitChatIds = (value?: string) =>
  String(value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

const numericEnv = (value?: string) => {
  const n = Number(value || 0);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

const appUrl = () =>
  (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://manager.felineez.com').replace(/\/+$/, '');

const money = (amount: unknown, currency?: unknown) => {
  const n = typeof amount === 'number' ? amount : Number(amount || 0);
  const c = String(currency || 'USD');
  return `${Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : amount} ${c}`;
};

const itemLines = (details: any) => {
  const items = Array.isArray(details?.items) ? details.items : [];
  if (items.length === 0) return '';
  const lines = items.slice(0, 3).map((item: any) => {
    const qty = item?.quantity ? ` x${item.quantity}` : '';
    const sku = item?.sku ? ` | SKU: ${item.sku}` : '';
    return `- ${String(item?.name || 'Item').slice(0, 120)}${qty}${sku}`;
  });
  if (items.length > 3) lines.push(`- ...and ${items.length - 3} more item(s)`);
  return lines.join('\n');
};

const shopName = (record: AnyRecord, shopLabels: ShopLabelMap) => {
  const email = record.accountEmail || record.account || '';
  return (email && shopLabels.get(email)) || record.details?.shopName || email || 'N/A';
};

const loadShopLabels = async (records: AnyRecord[]): Promise<ShopLabelMap> => {
  const emails = Array.from(new Set(
    records
      .map((record) => record?.accountEmail || record?.account)
      .filter(Boolean)
      .map(String)
  ));
  if (emails.length === 0) return new Map();

  const accounts = await prisma.mailAccount.findMany({
    where: { email: { in: emails } },
    select: { email: true, label: true },
  });

  return new Map(accounts.map((account) => [account.email, account.label || account.email]));
};

const buildOrderText = (record: AnyRecord, shopLabels: ShopLabelMap) => {
  const details = record.details || {};
  const customer = details.customerName || details.shippingAddress?.name || 'N/A';
  return [
    'New Etsy Order',
    `Order: #${record.orderId || 'N/A'}`,
    `Shop: ${shopName(record, shopLabels)}`,
    `Amount: ${money(record.amount, record.currency)}`,
    `Customer: ${customer}`,
    itemLines(details),
    `${appUrl()}/orders`,
  ].filter(Boolean).join('\n');
};

const buildSupportText = (record: AnyRecord, shopLabels: ShopLabelMap) => {
  const isCase = record.kind === 'CASE' || record.source === 'Etsy_Case';
  const isHelp = record.kind === 'HELP' || record.source === 'Etsy_Help';
  const title = isCase ? 'New Etsy Case' : isHelp ? 'New Etsy Help' : 'New Etsy Message';
  const message = record.caseMsg || record.helpKind || record.details?.buyerMessage || '';
  return [
    title,
    `Order: #${record.orderId || 'N/A'}`,
    `Shop: ${shopName(record, shopLabels)}`,
    message ? `Message: ${String(message).slice(0, 700)}` : '',
    `${appUrl()}/support${isCase ? '?support=Case' : isHelp ? '?support=Help' : '?support=Message'}`,
  ].filter(Boolean).join('\n');
};

async function sendTelegram(text: string, chatIds: string[], messageThreadId?: number) {
  const token = botToken();
  if (!token || chatIds.length === 0) return;

  await Promise.allSettled(chatIds.map(async (chatId) => {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        ...(messageThreadId ? { message_thread_id: messageThreadId } : {}),
        text: text.slice(0, 3900),
        disable_web_page_preview: true,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.warn(`[Telegram] sendMessage failed ${response.status}: ${body.slice(0, 300)}`);
    }
  }));
}

export async function sendTelegramNotifications(records: AnyRecord[]) {
  const list = Array.isArray(records) ? records : [];
  const orders = list.filter((record) => record?.kind === 'ORDER' && record?.source === 'Etsy_Sales');
  const support = list.filter((record) =>
    (record?.kind === 'CASE' && record?.source === 'Etsy_Case') ||
    (record?.kind === 'HELP' && record?.source === 'Etsy_Help') ||
    (record?.kind === 'MESSAGE' && record?.source === 'Etsy_Message')
  );
  const shopLabels = await loadShopLabels([...orders, ...support]);

  for (const record of orders) {
    await sendTelegram(buildOrderText(record, shopLabels), orderChatIds(), orderThreadId());
  }
  for (const record of support) {
    await sendTelegram(buildSupportText(record, shopLabels), supportChatIds(), supportThreadId());
  }
}

export function triggerTelegramNotificationsSafe(records: AnyRecord[]): void {
  try {
    void sendTelegramNotifications(records).catch((error) => {
      console.warn('[Telegram] notification failed:', error?.message || error);
    });
  } catch {
    /* keep record ingestion safe */
  }
}
