// MangoTee create-order form: production line → product → color/size → SKU,
// print files with Mango's position/print_tech options.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDashboard } from '../../contexts/DashboardContext';
import { Record } from '../../types';
import FulfillOrderHeader from './FulfillOrderHeader';
import DesignPickerModal from '../DesignPickerModal';
import DesignUrlField from './DesignUrlField';
import Spinner from '../Spinner';
import {
  MangoProduct,
  MangoVariation,
  getMangoProducts,
  getMangoVariations,
  createFactoryOrder,
} from '../../services/factoryService';

const inputCls = 'w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelCls = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1';
const cardCls = 'bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700';
const sectionTitleCls = 'text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider';

const MANGO_POSITIONS = [
  'front', 'back', 'right_sleeve', 'left_sleeve', 'neck_label',
  'center_chest', 'right_chest', 'left_chest', 'right_wrist', 'left_wrist',
  'right_cuff', 'left_cuff', 'collar', 'left_slit', 'right_slit',
  'sock_collar', 'center_hat', 'left_hat', 'right_hat', 'back_hat',
];
const MANGO_PRINT_TECH = ['normal', 'pattern', 'glitter', 'puff', 'dtf', 'square', 'die_cut', '3df', 'bleed_mug', 'maxprint', 'emb'];
const MANGO_SHIPPING = ['standard', 'priority', 'express', 'global'];

interface PrintFileRow { key: string; url: string; thumbnail: string; print_tech: string }

interface ItemState {
  productName: string;
  quantity: number;
  itemId: string;
  productId: string;
  color: string;
  size: string;
  sku: string;
  variations: MangoVariation[];
  printFiles: PrintFileRow[];
}

const MangoOrderForm: React.FC<{ record: Record; onBack: () => void }> = ({ record, onBack }) => {
  const { setRecords } = useDashboard();
  const addr = record.details?.shippingAddress;
  const customerName = addr?.name || record.details?.customerName || '';
  const nameParts = customerName.trim().split(/\s+/);

  // Note: Mango's create-order API has NO production_line field — the line is
  // derived from the SKU, so there is no line selector here. Filtering
  // variations by production_line_id also returns 0 items and must be avoided.
  const [products, setProducts] = useState<MangoProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    getMangoProducts()
      .then(setProducts)
      .catch((e: any) => setCatalogError(e?.message || 'Cannot reach MangoTee'))
      .finally(() => setProductsLoading(false));
  }, []);

  const [items, setItems] = useState<ItemState[]>(() =>
    (record.details?.items || []).map((i, idx) => ({
      productName: i.name || '',
      quantity: Number((i as any).quantity) || 1,
      itemId: `${record.order_id || record.id}-${idx + 1}`,
      productId: '',
      color: '', size: '', sku: '',
      variations: [],
      printFiles: [{ key: 'front', url: '', thumbnail: '', print_tech: '' }],
    }))
  );

  const patchItem = useCallback((idx: number, patch: Partial<ItemState>) => {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }, []);

  const [shipping, setShipping] = useState({
    first_name: nameParts[0] || '',
    last_name: nameParts.slice(1).join(' '),
    email: record.details?.customerEmail || '',
    phone: '',
    address1: addr?.address1 || '',
    address2: addr?.address2 || '',
    city: addr?.city || '',
    state: addr?.state || '',
    zip: addr?.zip || '',
    country: addr?.country || 'US',
  });
  const [shippingMethod, setShippingMethod] = useState('standard');
  const [note, setNote] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ order_id: string } | null>(null);

  const handleSubmit = async () => {
    setSubmitError(null);
    for (const [i, it] of items.entries()) {
      if (!it.sku.trim()) return setSubmitError(`Item ${i + 1}: SKU is not selected`);
      if (it.printFiles.every(f => !f.url.trim())) return setSubmitError(`Item ${i + 1}: at least one print file URL is required`);
    }
    for (const k of ['first_name', 'city', 'state', 'zip', 'country'] as const) {
      if (!shipping[k].trim()) return setSubmitError(`Address: ${k} is required`);
    }
    if (!record.order_id) return setSubmitError('This record has no order id');

    // Mango's address fields are address_line_1/2 (not address1/2)
    const { address1, address2, ...restShipping } = shipping;
    const payload: any = {
      order_id: String(record.order_id),
      items: items.map(it => ({
        sku: it.sku.trim(),
        quantity: it.quantity,
        item_id: it.itemId,
        print_files: it.printFiles
          .filter(f => f.url.trim())
          .map(f => ({
            key: f.key,
            url: f.url.trim(),
            ...(f.thumbnail.trim() ? { thumbnail: f.thumbnail.trim() } : {}),
            ...(f.print_tech ? { print_tech: f.print_tech } : {}),
          })),
      })),
      ...restShipping,
      address_line_1: address1,
      address_line_2: address2,
      shipping_method: shippingMethod,
      ...(note.trim() ? { note: note.trim() } : {}),
    };

    setSubmitting(true);
    try {
      const resp = await createFactoryOrder('mango', record.id!, payload);
      setResult({ order_id: resp.order_id });
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
        <p className="text-base font-semibold text-gray-900 dark:text-white mb-1">Order created on MangoTee</p>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          MangoTee order: <span className="font-mono">MGO-{result.order_id}</span> — record #{record.order_id} set to Producing.
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

      {items.map((it, idx) => (
        <MangoItemEditor key={idx} idx={idx} item={it} products={products} productsLoading={productsLoading} patch={patchItem} />
      ))}

      <div className={`${cardCls} p-4 space-y-5`}>
        <div>
          <p className={`${sectionTitleCls} mb-3`}>Shipping</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className={labelCls}>Method</label>
              <select value={shippingMethod} onChange={e => setShippingMethod(e.target.value)} className={inputCls}>
                {MANGO_SHIPPING.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div>
          <p className={`${sectionTitleCls} mb-3`}>Customer address</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              ['first_name', 'First name'], ['last_name', 'Last name'], ['email', 'Email'], ['phone', 'Phone'],
              ['address1', 'Street 1'], ['address2', 'Street 2'], ['city', 'City'], ['state', 'State'],
              ['zip', 'Zip'], ['country', 'Country'],
            ] as [keyof typeof shipping, string][]).map(([k, label]) => (
              <div key={k}>
                <label className={labelCls}>{label}</label>
                <input value={shipping[k]} onChange={e => setShipping(prev => ({ ...prev, [k]: e.target.value }))} className={inputCls} />
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className={`${sectionTitleCls} mb-3`}>Note</p>
          <input value={note} onChange={e => setNote(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold text-sm disabled:opacity-50 flex items-center gap-2"
        >
          {submitting && <Spinner size="sm" color="text-white" />}
          {submitting ? 'Sending…' : 'Create MangoTee order'}
        </button>
        {submitError && <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>}
      </div>

    </div>
  );
};

const MangoItemEditor: React.FC<{
  idx: number;
  item: ItemState;
  products: MangoProduct[];
  productsLoading: boolean;
  patch: (idx: number, p: Partial<ItemState>) => void;
}> = ({ idx, item, products, productsLoading, patch }) => {
  const [loadingVars, setLoadingVars] = useState(false);
  const [varsError, setVarsError] = useState<string | null>(null);

  useEffect(() => {
    if (!item.productId) { patch(idx, { variations: [], color: '', size: '', sku: '' }); return; }
    let cancelled = false;
    setLoadingVars(true);
    setVarsError(null);
    getMangoVariations(item.productId)
      .then(vs => {
        if (cancelled) return;
        patch(idx, { variations: vs, color: '', size: '', sku: '' });
        if (vs.length === 0) setVarsError('No variations returned for this product');
      })
      .catch((e: any) => {
        if (cancelled) return;
        patch(idx, { variations: [] });
        setVarsError(e?.message || 'Failed to load variations');
      })
      .finally(() => { if (!cancelled) setLoadingVars(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.productId]);

  const colors = useMemo(() => Array.from(new Set(item.variations.map(v => v.color).filter(Boolean))) as string[], [item.variations]);
  const sizes = useMemo(
    () => Array.from(new Set(item.variations.filter(v => !item.color || v.color === item.color).map(v => v.size).filter(Boolean))) as string[],
    [item.variations, item.color]
  );

  // Resolve SKU when color+size chosen
  useEffect(() => {
    if (!item.color || !item.size) return;
    const match = item.variations.find(v => v.color === item.color && v.size === item.size);
    patch(idx, { sku: match?.sku ? String(match.sku) : '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.color, item.size, item.variations]);

  // Holds the setter the Products picker should write the chosen URL into.
  const [pickTarget, setPickTarget] = useState<{ apply: (url: string) => void } | null>(null);
  const patchFile = (fi: number, p: Partial<PrintFileRow>) => {
    patch(idx, { printFiles: item.printFiles.map((f, i) => (i === fi ? { ...f, ...p } : f)) });
  };

  return (
    <div className={`${cardCls} p-4 space-y-5`}>
      <div className="flex items-start gap-3">
        <div className="flex-grow min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate" title={item.productName}>
            {idx + 1}. {item.productName}
          </p>
        </div>
        <div className="w-24 flex-shrink-0">
          <label className={labelCls}>Qty</label>
          <input
            type="number" min={1} value={item.quantity}
            onChange={e => patch(idx, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <p className={`${sectionTitleCls} mb-3`}>Variant</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className={labelCls}>Product</label>
            <select value={item.productId} onChange={e => patch(idx, { productId: e.target.value })} className={inputCls} disabled={productsLoading}>
              <option value="">{productsLoading ? 'Loading products…' : 'Select'}</option>
              {products.map(p => <option key={String(p.id)} value={String(p.id)}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Color</label>
            <select value={item.color} onChange={e => patch(idx, { color: e.target.value, size: '', sku: '' })} className={inputCls} disabled={!item.productId || loadingVars}>
              <option value="">Select</option>
              {colors.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Size</label>
            <select value={item.size} onChange={e => patch(idx, { size: e.target.value, sku: '' })} className={inputCls} disabled={!item.color}>
              <option value="">Select</option>
              {sizes.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>SKU</label>
            <div className="relative">
              <input
                value={item.sku}
                onChange={e => patch(idx, { sku: e.target.value })}
                className={`${inputCls} font-mono ${item.sku ? 'border-green-400 dark:border-green-600' : ''}`}
              />
              {loadingVars && <div className="absolute right-2 top-2.5"><Spinner size="xs" /></div>}
            </div>
          </div>
        </div>
        {varsError && <p className="text-xs text-red-600 dark:text-red-400 mt-2">{varsError}</p>}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <p className={sectionTitleCls}>Print files</p>
          <button
            onClick={() => patch(idx, { printFiles: [...item.printFiles, { key: 'back', url: '', thumbnail: '', print_tech: '' }] })}
            className="px-2.5 py-1 text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Add position
          </button>
        </div>
        <div className="space-y-2">
          {item.printFiles.map((f, fi) => (
            <div key={fi} className="bg-gray-50 dark:bg-gray-700/40 rounded-md p-2 space-y-2">
              {/* Attributes first, then the URL pair on its own full-width row so
                  the inputs stay readable next to their Pick buttons. */}
              <div className="grid grid-cols-2 md:grid-cols-[150px_150px_1fr_auto] gap-2 items-end">
                <div>
                  <label className={labelCls}>Position</label>
                  <select value={f.key} onChange={e => patchFile(fi, { key: e.target.value })} className={inputCls}>
                    {MANGO_POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Print tech</label>
                  <select value={f.print_tech} onChange={e => patchFile(fi, { print_tech: e.target.value })} className={inputCls}>
                    <option value="">—</option>
                    {MANGO_PRINT_TECH.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div />
                {item.printFiles.length > 1 && (
                  <div>
                    <button
                      onClick={() => patch(idx, { printFiles: item.printFiles.filter((_, i) => i !== fi) })}
                      className="px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded whitespace-nowrap"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <DesignUrlField
                  label="File URL"
                  value={f.url}
                  onChange={v => patchFile(fi, { url: v })}
                  onPick={() => setPickTarget({ apply: (url: string) => patchFile(fi, { url }) })}
                />
                <DesignUrlField
                  label="Thumbnail URL"
                  value={f.thumbnail}
                  onChange={v => patchFile(fi, { thumbnail: v })}
                  onPick={() => setPickTarget({ apply: (url: string) => patchFile(fi, { thumbnail: url }) })}
                />
              </div>
            </div>
          ))}
        </div>
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

export default MangoOrderForm;
