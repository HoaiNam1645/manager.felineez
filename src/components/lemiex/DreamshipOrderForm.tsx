// Dreamship create-order form: Item → Color → Variant (with live cost) →
// print areas from the item's template keys. reference_id (order + per line)
// gives real idempotency; test_order lets us trial without being charged.
// Our webhook receiver is attached server-side to every order.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDashboard } from '../../contexts/DashboardContext';
import { Record } from '../../types';
import FulfillOrderHeader from './FulfillOrderHeader';
import DesignPickerModal from '../DesignPickerModal';
import DesignUrlField from './DesignUrlField';
import Spinner from '../Spinner';
import {
  DreamshipItemSummary,
  DreamshipItemDetail,
  getDreamshipItems,
  getDreamshipItem,
  createFactoryOrder,
} from '../../services/factoryService';

const inputCls = 'w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelCls = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1';
const cardCls = 'bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700';
const sectionTitleCls = 'text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider';

const nameOf = (x: any): string => (typeof x === 'string' ? x : x?.name ?? x?.value ?? String(x ?? ''));

interface PrintAreaRow { key: string; url: string }

interface ItemState {
  productName: string;
  quantity: number;
  refId: string;
  itemId: string;          // Dreamship item id
  color: string;
  variantId: string;       // item_variant id
  printAreas: PrintAreaRow[];
}

const DreamshipOrderForm: React.FC<{ record: Record; onBack: () => void }> = ({ record, onBack }) => {
  const { setRecords } = useDashboard();
  const addr = record.details?.shippingAddress;
  const customerName = addr?.name || record.details?.customerName || '';
  const nameParts = customerName.trim().split(/\s+/);

  const [itemsCatalog, setItemsCatalog] = useState<DreamshipItemSummary[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    getDreamshipItems()
      .then(setItemsCatalog)
      .catch((e: any) => setCatalogError(e?.message || 'Cannot reach Dreamship'))
      .finally(() => setCatalogLoading(false));
  }, []);

  const [items, setItems] = useState<ItemState[]>(() =>
    (record.details?.items || []).map((i, idx) => ({
      productName: i.name || '',
      quantity: Number((i as any).quantity) || 1,
      refId: `${record.order_id || record.id}-${idx + 1}`,
      itemId: '',
      color: '',
      variantId: '',
      printAreas: [],
    }))
  );

  const patchItem = useCallback((idx: number, patch: Partial<ItemState>) => {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }, []);

  const [address, setAddress] = useState({
    first_name: nameParts[0] || '',
    last_name: nameParts.slice(1).join(' '),
    phone: '',
    street1: addr?.address1 || '',
    street2: addr?.address2 || '',
    city: addr?.city || '',
    state: addr?.state || '',
    zip: addr?.zip || '',
    country: (addr?.country || 'US').length === 2 ? (addr?.country || 'US') : 'US',
  });
  const [shippingMethod, setShippingMethod] = useState('economy');
  const [testOrder, setTestOrder] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ order_id: string } | null>(null);

  const handleSubmit = async () => {
    setSubmitError(null);
    for (const [i, it] of items.entries()) {
      if (!it.variantId) return setSubmitError(`Item ${i + 1}: variant is not selected`);
      if (it.printAreas.every(p => !p.url.trim())) return setSubmitError(`Item ${i + 1}: at least one print area URL is required`);
    }
    for (const k of ['first_name', 'last_name', 'street1', 'city', 'state', 'zip', 'country'] as const) {
      if (!address[k].trim()) return setSubmitError(`Address: ${k} is required`);
    }
    if (!record.order_id) return setSubmitError('This record has no order id');

    const payload: any = {
      reference_id: String(record.order_id),
      shipping_method: shippingMethod,
      ...(testOrder ? { test_order: true } : {}),
      // force_verified_delivery is deprecated but listed as REQUIRED in their
      // address schema — send false so validation passes.
      address: { ...address, force_verified_delivery: false },
      line_items: items.map(it => ({
        item_variant: Number(it.variantId),
        quantity: it.quantity,
        reference_id: it.refId,
        print_areas: it.printAreas
          .filter(p => p.url.trim())
          .map(p => ({ key: p.key, url: p.url.trim() })),
      })),
    };

    setSubmitting(true);
    try {
      const resp = await createFactoryOrder('dreamship', record.id!, payload);
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
        <p className="text-base font-semibold text-gray-900 dark:text-white mb-1">Order created on Dreamship</p>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          Dreamship order: <span className="font-mono">DSH-{result.order_id}</span> — record #{record.order_id} set to Producing.
          Tracking and cost will update automatically via webhook.
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
        <DreamshipItemEditor
          key={idx}
          idx={idx}
          item={it}
          itemsCatalog={itemsCatalog}
          catalogLoading={catalogLoading}
          patch={patchItem}
        />
      ))}

      <div className={`${cardCls} p-4 space-y-5`}>
        <div>
          <p className={`${sectionTitleCls} mb-3`}>Shipping</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className={labelCls}>Method</label>
              <select value={shippingMethod} onChange={e => setShippingMethod(e.target.value)} className={inputCls}>
                {['economy', 'economy_untracked', 'ground', 'ground_advantage', 'express', 'two_day', 'prepaid'].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Test order</label>
              <label className="flex items-center gap-2 h-[38px] px-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-md text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                <input type="checkbox" checked={testOrder} onChange={e => setTestOrder(e.target.checked)} className="rounded" />
                <span>Not charged</span>
              </label>
            </div>
          </div>
        </div>
        <div>
          <p className={`${sectionTitleCls} mb-3`}>Customer address</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              ['first_name', 'First name'], ['last_name', 'Last name'], ['phone', 'Phone'], ['street1', 'Street 1'],
              ['street2', 'Street 2'], ['city', 'City'], ['state', 'State'], ['zip', 'Zip'],
              ['country', 'Country (2 letters)'],
            ] as [keyof typeof address, string][]).map(([k, label]) => (
              <div key={k}>
                <label className={labelCls}>{label}</label>
                <input value={address[k]} onChange={e => setAddress(prev => ({ ...prev, [k]: e.target.value }))} className={inputCls} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold text-sm disabled:opacity-50 flex items-center gap-2"
        >
          {submitting && <Spinner size="sm" color="text-white" />}
          {submitting ? 'Sending…' : 'Create Dreamship order'}
        </button>
        {submitError && <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>}
      </div>

    </div>
  );
};

const DreamshipItemEditor: React.FC<{
  idx: number;
  item: ItemState;
  itemsCatalog: DreamshipItemSummary[];
  catalogLoading: boolean;
  patch: (idx: number, p: Partial<ItemState>) => void;
}> = ({ idx, item, itemsCatalog, catalogLoading, patch }) => {
  const [detail, setDetail] = useState<DreamshipItemDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    if (!item.itemId) { setDetail(null); patch(idx, { color: '', variantId: '', printAreas: [] }); return; }
    let cancelled = false;
    setLoadingDetail(true);
    setDetailError(null);
    getDreamshipItem(item.itemId)
      .then(d => {
        if (cancelled) return;
        setDetail(d);
        // Seed one row per REQUIRED print area (fall back to the first key)
        const keys = (d.print_areas || []).map(pa => String(pa.key || '')).filter(Boolean);
        const required = (d.print_areas || []).filter(pa => pa.required).map(pa => String(pa.key || '')).filter(Boolean);
        const seed = (required.length ? required : keys.slice(0, 1)).map(k => ({ key: k, url: '' }));
        patch(idx, { color: '', variantId: '', printAreas: seed });
      })
      .catch((e: any) => { if (!cancelled) setDetailError(e?.message || 'Failed to load item'); })
      .finally(() => { if (!cancelled) setLoadingDetail(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.itemId]);

  const variants = detail?.item_variants || [];
  const colors = useMemo(
    () => Array.from(new Set(variants.map(v => nameOf(v.color)).filter(Boolean))),
    [variants]
  );
  const variantChoices = useMemo(
    () => variants.filter(v => !item.color || nameOf(v.color) === item.color),
    [variants, item.color]
  );
  const areaKeys = (detail?.print_areas || []).map(pa => String(pa.key || '')).filter(Boolean);
  const selectedVariant = variants.find(v => String(v.id) === item.variantId);

  // Holds the setter the Products picker should write the chosen URL into.
  const [pickTarget, setPickTarget] = useState<{ apply: (url: string) => void } | null>(null);
  const patchArea = (ai: number, p: Partial<PrintAreaRow>) => {
    patch(idx, { printAreas: item.printAreas.map((a, i) => (i === ai ? { ...a, ...p } : a)) });
  };

  return (
    <div className={`${cardCls} p-4`}>
      <div className="flex items-center gap-3 pb-3 border-b border-gray-100 dark:border-gray-700/60">
        <div className="flex-grow min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate" title={item.productName}>
            {idx + 1}. {item.productName}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={sectionTitleCls}>Qty</span>
          <input
            type="number" min={1} value={item.quantity}
            onChange={e => patch(idx, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
            className={`${inputCls} w-16 text-center`}
          />
        </div>
      </div>

      <div className="py-3 border-b border-gray-100 dark:border-gray-700/60">
        <p className={`${sectionTitleCls} mb-2`}>Variant</p>
        <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end">
          <div className="md:col-span-5">
            <label className={labelCls}>Item</label>
            <select
              value={item.itemId}
              onChange={e => patch(idx, { itemId: e.target.value })}
              className={inputCls}
              disabled={catalogLoading}
            >
              <option value="">{catalogLoading ? 'Loading items…' : 'Select'}</option>
              {itemsCatalog.map(i => <option key={i.id} value={String(i.id)}>{i.name}</option>)}
            </select>
          </div>
          <div className="md:col-span-3">
            <label className={labelCls}>Color</label>
            <select
              value={item.color}
              onChange={e => patch(idx, { color: e.target.value, variantId: '' })}
              className={inputCls}
              disabled={!detail || loadingDetail}
            >
              <option value="">All</option>
              {colors.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="md:col-span-4">
            <label className={labelCls}>Variant{selectedVariant?.basic_cost ? ` — $${selectedVariant.basic_cost}` : ''}</label>
            <div className="relative">
              <select
                value={item.variantId}
                onChange={e => patch(idx, { variantId: e.target.value })}
                className={`${inputCls} ${item.variantId ? 'border-green-400 dark:border-green-600' : ''}`}
                disabled={!detail || loadingDetail}
              >
                <option value="">Select</option>
                {variantChoices.map(v => (
                  <option key={v.id} value={String(v.id)}>
                    {nameOf(v.color)} {v.name ? `— ${v.name}` : ''} {v.basic_cost ? `($${v.basic_cost})` : ''}
                  </option>
                ))}
              </select>
              {loadingDetail && <div className="absolute right-2 top-2.5"><Spinner size="xs" /></div>}
            </div>
          </div>
        </div>
        {detailError && <p className="text-xs text-red-600 dark:text-red-400 mt-2">{detailError}</p>}
      </div>

      <div className="pt-3">
        <div className="flex items-center justify-between mb-2">
          <p className={sectionTitleCls}>Print areas</p>
          <button
            onClick={() => patch(idx, { printAreas: [...item.printAreas, { key: areaKeys[0] || 'front', url: '' }] })}
            className="px-2.5 py-1 text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            disabled={!detail}
          >
            Add area
          </button>
        </div>
        <div className="space-y-2">
          {item.printAreas.length === 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">Select an item first</p>
          )}
          {item.printAreas.map((a, ai) => (
            <div key={ai} className={`grid grid-cols-2 gap-2 items-end bg-gray-50 dark:bg-gray-700/40 rounded-md p-2 ${item.printAreas.length > 1 ? 'md:grid-cols-[160px_minmax(260px,1fr)_68px]' : 'md:grid-cols-[160px_minmax(260px,1fr)]'}`}>
              <div>
                <label className={labelCls}>Area</label>
                <select value={a.key} onChange={e => patchArea(ai, { key: e.target.value })} className={inputCls}>
                  {(areaKeys.length ? areaKeys : [a.key]).map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <DesignUrlField
                label="Design URL"
                value={a.url}
                onChange={v => patchArea(ai, { url: v })}
                onPick={() => setPickTarget({ apply: (url: string) => patchArea(ai, { url }) })}
              />
              {item.printAreas.length > 1 && (
                <div>
                  <button
                    onClick={() => patch(idx, { printAreas: item.printAreas.filter((_, i) => i !== ai) })}
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
      {pickTarget && (
        <DesignPickerModal
          onPick={url => pickTarget.apply(url)}
          onClose={() => setPickTarget(null)}
        />
      )}
    </div>
  );
};

export default DreamshipOrderForm;
