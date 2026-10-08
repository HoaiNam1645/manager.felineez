import React, { useEffect, useMemo, useState } from 'react';
import { Account, Record } from '../types';

type ManualOrderItem = {
  name: string;
  variant: string;
  personalization: string;
  quantity: string;
  price: string;
  sku: string;
  image: string;
};

interface ManualOrderModalProps {
  isOpen: boolean;
  accounts: Account[];
  onClose: () => void;
  onCreate: (record: Partial<Record> & { accountId?: string }) => Promise<void>;
}

const inputCls = 'w-full h-9 px-3 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';
const textareaCls = 'w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelCls = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1';

const blankItem = (): ManualOrderItem => ({
  name: '',
  variant: '',
  personalization: '',
  quantity: '1',
  price: '',
  sku: '',
  image: '',
});

const localDateTimeValue = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const toNumber = (value: string, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const ManualOrderModal: React.FC<ManualOrderModalProps> = ({ isOpen, accounts, onClose, onCreate }) => {
  const [accountEmail, setAccountEmail] = useState(accounts[0]?.email || '');
  const [orderId, setOrderId] = useState('');
  const [source, setSource] = useState('Etsy_Sales');
  const [currency, setCurrency] = useState('USD');
  const [dateTime, setDateTime] = useState(localDateTimeValue());
  const [amount, setAmount] = useState('');
  const [shipping, setShipping] = useState('');
  const [tax, setTax] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [country, setCountry] = useState('');
  const [buyerMessage, setBuyerMessage] = useState('');
  const [items, setItems] = useState<ManualOrderItem[]>([blankItem()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedAccount = useMemo(
    () => accounts.find(account => account.email === accountEmail) || accounts[0],
    [accounts, accountEmail]
  );

  useEffect(() => {
    if (!accountEmail && accounts[0]?.email) setAccountEmail(accounts[0].email);
  }, [accountEmail, accounts]);

  const itemTotal = useMemo(() => items.reduce((sum, item) => {
    return sum + Math.max(0, toNumber(item.quantity, 1)) * Math.max(0, toNumber(item.price));
  }, 0), [items]);

  if (!isOpen) return null;

  const updateItem = (index: number, field: keyof ManualOrderItem, value: string) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    const cleanItems = items
      .map(item => ({
        ...item,
        name: item.name.trim(),
        variant: item.variant.trim(),
        personalization: item.personalization.trim(),
        sku: item.sku.trim(),
        image: item.image.trim(),
        quantityNum: Math.max(1, Math.floor(toNumber(item.quantity, 1))),
        priceNum: Math.max(0, toNumber(item.price)),
      }))
      .filter(item => item.name);

    if (!selectedAccount) return setError('Chọn shop trước khi tạo đơn');
    if (!orderId.trim()) return setError('Nhập Order ID');
    if (cleanItems.length === 0) return setError('Nhập ít nhất 1 item');

    const shippingNum = Math.max(0, toNumber(shipping));
    const taxNum = Math.max(0, toNumber(tax));
    const orderTotal = amount.trim() === ''
      ? Math.round((itemTotal + shippingNum + taxNum) * 100) / 100
      : Math.max(0, toNumber(amount));

    const dt = new Date(dateTime);
    if (Number.isNaN(dt.getTime())) return setError('Ngày giờ không hợp lệ');

    setError(null);
    setSaving(true);
    try {
      const details = {
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        shippingAddress: {
          name: customerName.trim(),
          address1: address1.trim(),
          address2: address2.trim(),
          city: city.trim(),
          state: state.trim(),
          zip: zip.trim(),
          country: country.trim(),
        },
        items: cleanItems.map(item => ({
          name: item.name,
          variant: item.variant,
          personalization: item.personalization,
          quantity: item.quantityNum,
          price: item.priceNum,
          image: item.image || undefined,
          sku: item.sku || undefined,
        })),
        financials: {
          itemTotal: Math.round(itemTotal * 100) / 100,
          discount: 0,
          shipping: shippingNum,
          tax: taxNum,
          orderTotal,
        },
        detectedCurrency: currency,
        shopName: selectedAccount.label || selectedAccount.email,
        buyerMessage: buyerMessage.trim(),
      };

      await onCreate({
        dt_local: dt.toISOString(),
        amount: orderTotal,
        order_id: orderId.trim(),
        currency,
        source,
        account: selectedAccount.email,
        accountId: selectedAccount.id,
        kind: 'order',
        product_name: cleanItems.map(item => item.name).join(', '),
        details,
      });
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Tạo đơn thất bại');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-lg border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Create order</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Manual order</p>
          </div>
          <button onClick={onClose} className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-4">
              <label className={labelCls}>Shop</label>
              <select value={accountEmail} onChange={e => setAccountEmail(e.target.value)} className={inputCls}>
                {accounts.map(account => (
                  <option key={account.email} value={account.email}>{account.label || account.email}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-3">
              <label className={labelCls}>Order ID</label>
              <input value={orderId} onChange={e => setOrderId(e.target.value)} className={inputCls} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Source</label>
              <select value={source} onChange={e => setSource(e.target.value)} className={inputCls}>
                <option value="Etsy_Sales">Etsy</option>
                <option value="Ebay_Sales">eBay</option>
                <option value="Manual">Manual</option>
              </select>
            </div>
            <div className="md:col-span-3">
              <label className={labelCls}>Date</label>
              <input type="datetime-local" value={dateTime} onChange={e => setDateTime(e.target.value)} className={inputCls} />
            </div>

            <div className="md:col-span-3">
              <label className={labelCls}>Currency</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} className={inputCls}>
                {['USD', 'AUD', 'GBP', 'EUR', 'CAD', 'VND'].map(code => <option key={code} value={code}>{code}</option>)}
              </select>
            </div>
            <div className="md:col-span-3">
              <label className={labelCls}>Order total</label>
              <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder={itemTotal.toFixed(2)} className={inputCls} />
            </div>
            <div className="md:col-span-3">
              <label className={labelCls}>Shipping</label>
              <input type="number" min="0" step="0.01" value={shipping} onChange={e => setShipping(e.target.value)} className={inputCls} />
            </div>
            <div className="md:col-span-3">
              <label className={labelCls}>Tax</label>
              <input type="number" min="0" step="0.01" value={tax} onChange={e => setTax(e.target.value)} className={inputCls} />
            </div>

            <div className="md:col-span-4">
              <label className={labelCls}>Customer</label>
              <input value={customerName} onChange={e => setCustomerName(e.target.value)} className={inputCls} />
            </div>
            <div className="md:col-span-4">
              <label className={labelCls}>Customer email</label>
              <input value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} className={inputCls} />
            </div>
            <div className="md:col-span-4">
              <label className={labelCls}>Country</label>
              <input value={country} onChange={e => setCountry(e.target.value)} className={inputCls} />
            </div>
            <div className="md:col-span-5">
              <label className={labelCls}>Address 1</label>
              <input value={address1} onChange={e => setAddress1(e.target.value)} className={inputCls} />
            </div>
            <div className="md:col-span-3">
              <label className={labelCls}>Address 2</label>
              <input value={address2} onChange={e => setAddress2(e.target.value)} className={inputCls} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>City</label>
              <input value={city} onChange={e => setCity(e.target.value)} className={inputCls} />
            </div>
            <div className="md:col-span-1">
              <label className={labelCls}>State</label>
              <input value={state} onChange={e => setState(e.target.value)} className={inputCls} />
            </div>
            <div className="md:col-span-1">
              <label className={labelCls}>Zip</label>
              <input value={zip} onChange={e => setZip(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Items</h4>
              <button
                type="button"
                onClick={() => setItems(prev => [...prev, blankItem()])}
                className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/25 dark:text-blue-300"
              >
                <span className="text-sm leading-none">+</span>
                <span>Item</span>
              </button>
            </div>

            {items.map((item, index) => (
              <div key={index} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                  <div className="md:col-span-5">
                    <label className={labelCls}>Product name</label>
                    <input value={item.name} onChange={e => updateItem(index, 'name', e.target.value)} className={inputCls} />
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelCls}>SKU</label>
                    <input value={item.sku} onChange={e => updateItem(index, 'sku', e.target.value)} className={inputCls} />
                  </div>
                  <div className="md:col-span-1">
                    <label className={labelCls}>Qty</label>
                    <input type="number" min="1" value={item.quantity} onChange={e => updateItem(index, 'quantity', e.target.value)} className={inputCls} />
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelCls}>Price</label>
                    <input type="number" min="0" step="0.01" value={item.price} onChange={e => updateItem(index, 'price', e.target.value)} className={inputCls} />
                  </div>
                  <div className="flex items-end md:col-span-2">
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      disabled={items.length <= 1}
                      className="h-9 w-full rounded-md border border-red-200 bg-red-50 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-900/70 dark:bg-red-900/20 dark:text-red-300"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="md:col-span-4">
                    <label className={labelCls}>Variant</label>
                    <input value={item.variant} onChange={e => updateItem(index, 'variant', e.target.value)} className={inputCls} />
                  </div>
                  <div className="md:col-span-4">
                    <label className={labelCls}>Personalization</label>
                    <input value={item.personalization} onChange={e => updateItem(index, 'personalization', e.target.value)} className={inputCls} />
                  </div>
                  <div className="md:col-span-4">
                    <label className={labelCls}>Image URL</label>
                    <input value={item.image} onChange={e => updateItem(index, 'image', e.target.value)} className={inputCls} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <label className={labelCls}>Note</label>
            <textarea value={buyerMessage} onChange={e => setBuyerMessage(e.target.value)} rows={3} className={textareaCls} />
          </div>

          {error && <p className="mt-3 text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4 dark:border-gray-700">
          <button onClick={onClose} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-500 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600">
            Cancel
          </button>
          <button onClick={handleCreate} disabled={saving} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? 'Creating...' : 'Create order'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManualOrderModal;
