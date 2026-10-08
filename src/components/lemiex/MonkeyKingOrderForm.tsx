// MonkeyKing (Magento) create-order form. Their API has NO variant IDs —
// items are identified by product name + size + color TEXT, so the product
// field is a free-text input with catalog suggestions. No server-side
// idempotency either (our API pre-checks seller_order_id before creating).
import React, { useCallback, useEffect, useState } from 'react';
import { useDashboard } from '../../contexts/DashboardContext';
import { Record } from '../../types';
import FulfillOrderHeader from './FulfillOrderHeader';
import DesignPickerModal from '../DesignPickerModal';
import DesignUrlField from './DesignUrlField';
import Spinner from '../Spinner';
import {
  MonkeyKingProduct,
  getMonkeyKingProducts,
  createFactoryOrder,
} from '../../services/factoryService';

const inputCls = 'w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelCls = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1';
const cardCls = 'bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700';
const sectionTitleCls = 'text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider';

const MK_SIDES = ['Front', 'Back', 'Left', 'Right', 'Mockup'];

interface DesignRow { side: string; url: string }

interface ItemState {
  productName: string; // display (from the Etsy order)
  quantity: number;
  mkProduct: string;   // MonkeyKing product name (their identifier!)
  size: string;
  color: string;
  designs: DesignRow[];
}

const MonkeyKingOrderForm: React.FC<{ record: Record; onBack: () => void }> = ({ record, onBack }) => {
  const { setRecords } = useDashboard();
  const addr = record.details?.shippingAddress;
  const customerName = addr?.name || record.details?.customerName || '';
  const nameParts = customerName.trim().split(/\s+/);

  const [products, setProducts] = useState<MonkeyKingProduct[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    getMonkeyKingProducts()
      .then(setProducts)
      .catch((e: any) => setCatalogError(e?.message || 'Cannot reach MonkeyKing'));
  }, []);

  // Their products come with varriants[{color,size}] — use real selects when
  // the catalog loaded; fall back to free text when it didn't.
  const hasCatalog = products.length > 0;
  const productOf = (sku: string) => products.find(p => (p.sku || p.name) === sku);
  const colorsOf = (sku: string) =>
    Array.from(new Set((productOf(sku)?.varriants || []).map(v => v.color).filter(Boolean))) as string[];
  const sizesOf = (sku: string, color: string) =>
    Array.from(new Set(
      (productOf(sku)?.varriants || [])
        .filter(v => !color || v.color === color)
        .map(v => v.size)
        .filter(Boolean)
    )) as string[];

  const [items, setItems] = useState<ItemState[]>(() =>
    (record.details?.items || []).map(i => ({
      productName: i.name || '',
      quantity: Number((i as any).quantity) || 1,
      mkProduct: '',
      size: '',
      color: '',
      designs: [
        { side: 'Front', url: '' },
        { side: 'Mockup', url: i.image || '' },
      ],
    }))
  );

  const patchItem = useCallback((idx: number, patch: Partial<ItemState>) => {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }, []);

  const [shipping, setShipping] = useState({
    firstname: nameParts[0] || '',
    lastname: nameParts.slice(1).join(' '),
    telephone: '',
    address1: addr?.address1 || '',
    address2: addr?.address2 || '',
    city: addr?.city || '',
    region: addr?.state || '',
    postcode: addr?.zip || '',
    country_id: (addr?.country || 'US').length === 2 ? (addr?.country || 'US') : 'US',
  });
  const [shippingMethod, setShippingMethod] = useState('standard');
  const [prepaidLabel, setPrepaidLabel] = useState('');

  // Holds the setter the Products picker should write the chosen URL into.
  const [pickTarget, setPickTarget] = useState<{ apply: (url: string) => void } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ order_id: string; existed: boolean } | null>(null);

  const alreadySent = (record.ff_code || '').startsWith('MKP-');

  const handleSubmit = async () => {
    setSubmitError(null);
    for (const [i, it] of items.entries()) {
      if (!it.mkProduct.trim()) return setSubmitError(`Item ${i + 1}: product is required`);
      if (!it.size.trim() || !it.color.trim()) return setSubmitError(`Item ${i + 1}: size and color are required`);
    }
    for (const k of ['firstname', 'address1', 'city', 'region', 'postcode', 'country_id'] as const) {
      if (!shipping[k].trim()) return setSubmitError(`Address: ${k} is required`);
    }
    if (!record.order_id) return setSubmitError('This record has no order id');

    const payload = {
      orderData: {
        ...shipping,
        seller_order_id: String(record.order_id),
        shipping_method: shippingMethod,
        ...(prepaidLabel.trim() ? { prepaid_label: prepaidLabel.trim() } : {}),
        items: items.map(it => {
          // merge design rows by side → { side_name, images: [...] }
          const bySide = new Map<string, string[]>();
          it.designs.forEach(d => {
            if (!d.url.trim()) return;
            bySide.set(d.side, [...(bySide.get(d.side) || []), d.url.trim()]);
          });
          return {
            product_id: it.mkProduct.trim(),
            qty: String(it.quantity),
            size: it.size.trim(),
            color: it.color.trim(),
            designs: Array.from(bySide.entries()).map(([side_name, images]) => ({ side_name, images })),
          };
        }),
      },
    };

    setSubmitting(true);
    try {
      const resp = await createFactoryOrder('monkeyking', record.id!, payload);
      setResult({ order_id: resp.order_id, existed: (resp as any).existed || false });
      setRecords(prev => prev.map(r => r.id === record.id
        ? { ...r, ff_code: resp.ff_code, order_status: resp.order_status || r.order_status }
        : r));
    } catch (e: any) {
      setSubmitError(e?.message || 'Create order failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className={`${cardCls} p-6 max-w-lg`}>
        <p className="text-base font-semibold text-gray-900 dark:text-white mb-1">
          {result.existed ? 'Order already exists on MonkeyKing' : 'Order created on MonkeyKing'}
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          MonkeyKing order: <span className="font-mono">MKP-{result.order_id}</span> — record #{record.order_id} set to Producing.
        </p>
        <button onClick={onBack} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold text-sm">
          Back to orders
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FulfillOrderHeader record={record} onBack={onBack} />

      {catalogError && <div className={`${cardCls} p-4 text-sm text-red-600 dark:text-red-400`}>{catalogError}</div>}
      {alreadySent && (
        <div className={`${cardCls} p-4 text-sm text-orange-600 dark:text-orange-400`}>
          This order is already linked to {record.ff_code}. MonkeyKing has no duplicate protection — creating again is blocked.
        </div>
      )}

      {items.map((it, idx) => (
        <div key={idx} className={`${cardCls} p-4`}>
          <div className="flex items-center gap-3 pb-3 border-b border-gray-100 dark:border-gray-700/60">
            <div className="flex-grow min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate" title={it.productName}>
                {idx + 1}. {it.productName}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={sectionTitleCls}>Qty</span>
              <input
                type="number" min={1} value={it.quantity}
                onChange={e => patchItem(idx, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                className={`${inputCls} w-16 text-center`}
              />
            </div>
          </div>

          <div className="py-3 border-b border-gray-100 dark:border-gray-700/60">
            <p className={`${sectionTitleCls} mb-2`}>Variant</p>
            <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end">
              <div className="md:col-span-6">
                <label className={labelCls}>Product</label>
                {hasCatalog ? (
                  <select
                    value={it.mkProduct}
                    onChange={e => patchItem(idx, { mkProduct: e.target.value, color: '', size: '' })}
                    className={inputCls}
                  >
                    <option value="">Select</option>
                    {products.map(p => {
                      const sku = p.sku || p.name || '';
                      return (
                        <option key={sku} value={sku}>
                          {p.name}{p.sku && p.sku !== p.name ? ` (${p.sku})` : ''}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <input
                    value={it.mkProduct}
                    onChange={e => patchItem(idx, { mkProduct: e.target.value })}
                    className={inputCls}
                    placeholder="Classic T-Shirt"
                  />
                )}
              </div>
              <div className="md:col-span-3">
                <label className={labelCls}>Color</label>
                {hasCatalog ? (
                  <select
                    value={it.color}
                    onChange={e => patchItem(idx, { color: e.target.value, size: '' })}
                    className={inputCls}
                    disabled={!it.mkProduct}
                  >
                    <option value="">Select</option>
                    {colorsOf(it.mkProduct).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : (
                  <input value={it.color} onChange={e => patchItem(idx, { color: e.target.value })} className={inputCls} placeholder="Black" />
                )}
              </div>
              <div className="md:col-span-3">
                <label className={labelCls}>Size</label>
                {hasCatalog ? (
                  <select
                    value={it.size}
                    onChange={e => patchItem(idx, { size: e.target.value })}
                    className={inputCls}
                    disabled={!it.color}
                  >
                    <option value="">Select</option>
                    {sizesOf(it.mkProduct, it.color).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <input value={it.size} onChange={e => patchItem(idx, { size: e.target.value })} className={inputCls} placeholder="2XL" />
                )}
              </div>
            </div>
          </div>

          <div className="pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className={sectionTitleCls}>Designs</p>
              <button
                onClick={() => patchItem(idx, { designs: [...it.designs, { side: 'Back', url: '' }] })}
                className="px-2.5 py-1 text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Add side
              </button>
            </div>
            <div className="space-y-2">
              {it.designs.map((d, di) => (
                <div key={di} className={`grid grid-cols-2 gap-2 items-end bg-gray-50 dark:bg-gray-700/40 rounded-md p-2 ${it.designs.length > 1 ? 'md:grid-cols-[140px_minmax(260px,1fr)_68px]' : 'md:grid-cols-[140px_minmax(260px,1fr)]'}`}>
                  <div>
                    <label className={labelCls}>Side</label>
                    <select
                      value={d.side}
                      onChange={e => patchItem(idx, { designs: it.designs.map((x, i) => i === di ? { ...x, side: e.target.value } : x) })}
                      className={inputCls}
                    >
                      {MK_SIDES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <DesignUrlField
                    label="Image URL"
                    value={d.url}
                    onChange={v => patchItem(idx, { designs: it.designs.map((x, i) => i === di ? { ...x, url: v } : x) })}
                    onPick={() => setPickTarget({ apply: (url: string) => patchItem(idx, { designs: it.designs.map((x, i) => i === di ? { ...x, url } : x) }) })}
                  />
                  {it.designs.length > 1 && (
                    <div>
                      <button
                        onClick={() => patchItem(idx, { designs: it.designs.filter((_, i) => i !== di) })}
                        className="w-full px-2 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      <div className={`${cardCls} p-4 space-y-5`}>
        <div>
          <p className={`${sectionTitleCls} mb-3`}>Shipping</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className={labelCls}>Method</label>
              <input value={shippingMethod} onChange={e => setShippingMethod(e.target.value)} className={inputCls} />
            </div>
            <div className="md:col-span-3">
              <label className={labelCls}>Prepaid label URL</label>
              <input value={prepaidLabel} onChange={e => setPrepaidLabel(e.target.value)} className={inputCls} placeholder="https://… (leave empty if they ship)" />
            </div>
          </div>
        </div>
        <div>
          <p className={`${sectionTitleCls} mb-3`}>Customer address</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              ['firstname', 'First name'], ['lastname', 'Last name'], ['telephone', 'Phone'], ['address1', 'Street 1'],
              ['address2', 'Street 2'], ['city', 'City'], ['region', 'State'], ['postcode', 'Zip'],
              ['country_id', 'Country (2 letters)'],
            ] as [keyof typeof shipping, string][]).map(([k, label]) => (
              <div key={k}>
                <label className={labelCls}>{label}</label>
                <input value={shipping[k]} onChange={e => setShipping(prev => ({ ...prev, [k]: e.target.value }))} className={inputCls} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={submitting || alreadySent}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold text-sm disabled:opacity-50 flex items-center gap-2"
        >
          {submitting && <Spinner size="sm" color="text-white" />}
          {submitting ? 'Sending…' : 'Create MonkeyKing order'}
        </button>
        {submitError && <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>}
      </div>

      {pickTarget && (
        <DesignPickerModal
          onPick={url => pickTarget.apply(url)}
          onClose={() => setPickTarget(null)}
        />
      )}
    </div>
  );
};

export default MonkeyKingOrderForm;
