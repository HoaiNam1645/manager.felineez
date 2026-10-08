// Hong Phat Embroidery create-order form. Items are identified by
// product_code + color + size text values (catalog selects with text
// fallback), one embroidery position per design (default_position +
// extra_positions). seller_order_code gives idempotency (duplicate: true).
import React, { useCallback, useEffect, useState } from 'react';
import { useDashboard } from '../../contexts/DashboardContext';
import { Record } from '../../types';
import FulfillOrderHeader from './FulfillOrderHeader';
import DesignPickerModal from '../DesignPickerModal';
import DesignUrlField from './DesignUrlField';
import Spinner from '../Spinner';
import {
  HongPhatProduct,
  HongPhatPosition,
  getHongPhatProducts,
  getHongPhatPositions,
  createFactoryOrder,
} from '../../services/factoryService';

const inputCls = 'w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelCls = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1';
const cardCls = 'bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700';
const sectionTitleCls = 'text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider';

const nameOf = (x: any): string => (typeof x === 'string' ? x : x?.name ?? x?.value ?? x?.position ?? String(x ?? ''));
const codeOf = (p: HongPhatProduct): string => String(p.product_code || p.code || p.name || p.id || '');

interface ExtraPosRow { position: string; mockup_url: string; emb_url: string }

interface ItemState {
  productName: string;
  quantity: number;
  productCode: string;
  color: string;
  size: string;
  defaultPosition: string;
  mockupUrl: string;
  pngUrl: string;
  embUrl: string;
  extraPositions: ExtraPosRow[];
}

const HongPhatOrderForm: React.FC<{ record: Record; onBack: () => void }> = ({ record, onBack }) => {
  const { setRecords } = useDashboard();
  const addr = record.details?.shippingAddress;

  const [products, setProducts] = useState<HongPhatProduct[]>([]);
  const [positions, setPositions] = useState<HongPhatPosition[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    getHongPhatProducts()
      .then(setProducts)
      .catch((e: any) => setCatalogError(e?.message || 'Cannot reach Hong Phat'));
    getHongPhatPositions().then(setPositions).catch(() => setPositions([]));
  }, []);

  // Live position names are Vietnamese ("Ngực trái"), not the docs' "Left Chest".
  // A position outside the catalog gets rejected with invalid_reference, so once
  // the catalog arrives re-seed any item still holding a non-catalog position.
  useEffect(() => {
    if (positions.length === 0) return;
    const names = positions.map(nameOf).filter(Boolean);
    const preferred = nameOf(
      positions.find((p: any) => p?.code === 'chest_left') ||
      positions.find((p: any) => p?.is_default) ||
      positions[0]
    );
    setItems(prev => prev.map(it => (names.includes(it.defaultPosition) ? it : { ...it, defaultPosition: preferred })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions]);

  const hasCatalog = products.length > 0;
  const positionNames = positions.map(nameOf).filter(Boolean);
  const productOf = (code: string) => products.find(p => codeOf(p) === code);
  const colorsOf = (code: string) => ((productOf(code)?.colors || []) as any[]).map(nameOf).filter(Boolean);
  const sizesOf = (code: string) => ((productOf(code)?.sizes || []) as any[]).map(nameOf).filter(Boolean);

  const [items, setItems] = useState<ItemState[]>(() =>
    (record.details?.items || []).map(i => ({
      productName: i.name || '',
      quantity: Number((i as any).quantity) || 1,
      productCode: '',
      color: '',
      size: '',
      defaultPosition: 'Left Chest',
      mockupUrl: i.image || '',
      pngUrl: '',
      embUrl: '',
      extraPositions: [],
    }))
  );

  const patchItem = useCallback((idx: number, patch: Partial<ItemState>) => {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }, []);

  const [shipping, setShipping] = useState({
    recipient_name: addr?.name || record.details?.customerName || '',
    phone: '',
    email: record.details?.customerEmail || '',
    address_line1: addr?.address1 || '',
    address_line2: addr?.address2 || '',
    city: addr?.city || '',
    state: addr?.state || '',
    country: (addr?.country || 'US').length === 2 ? (addr?.country || 'US') : 'US',
    postal_code: addr?.zip || '',
    shipping_note: '',
  });
  const [shippingService, setShippingService] = useState('US');

  // Holds the setter the Products picker should write the chosen URL into.
  const [pickTarget, setPickTarget] = useState<{ apply: (url: string) => void } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ order_id: string; existed: boolean } | null>(null);

  const handleSubmit = async () => {
    setSubmitError(null);
    for (const [i, it] of items.entries()) {
      if (!it.productCode.trim()) return setSubmitError(`Item ${i + 1}: product is required`);
      if (!it.color.trim() || !it.size.trim()) return setSubmitError(`Item ${i + 1}: color and size are required`);
      if (!it.pngUrl.trim() && !it.embUrl.trim()) return setSubmitError(`Item ${i + 1}: png_url or emb_url is required`);
    }
    for (const k of ['recipient_name', 'address_line1', 'city', 'state', 'country', 'postal_code'] as const) {
      if (!shipping[k].trim()) return setSubmitError(`Address: ${k} is required`);
    }
    if (!record.order_id) return setSubmitError('This record has no order id');

    const payload = {
      seller_order_code: String(record.order_id),
      submit: true,
      shipping_service: shippingService,
      shipping,
      items: items.map(it => {
        const prod = productOf(it.productCode);
        const colorObj = ((prod?.colors || []) as any[]).find(c => nameOf(c) === it.color);
        const sizeObj = ((prod?.sizes || []) as any[]).find(sz => nameOf(sz) === it.size);
        const posObj = positions.find(pp => nameOf(pp) === it.defaultPosition);
        return {
        product_code: it.productCode.trim(),
        ...(prod?.id !== undefined ? { product_id: prod.id } : {}),
        color: it.color.trim(),
        ...(colorObj?.id !== undefined ? { product_color_id: colorObj.id } : {}),
        size: it.size.trim(),
        ...(sizeObj?.id !== undefined ? { product_size_id: sizeObj.id } : {}),
        quantity: it.quantity,
        // HP resolves the position by code ("chest_left"); names like "Left Chest" 404.
        default_position: (posObj as any)?.code || it.defaultPosition,
        ...(posObj?.id !== undefined ? { default_position_id: posObj.id } : {}),
        ...(it.mockupUrl.trim() ? { mockup_url: it.mockupUrl.trim() } : {}),
        ...(it.pngUrl.trim() ? { png_url: it.pngUrl.trim() } : {}),
        ...(it.embUrl.trim() ? { emb_url: it.embUrl.trim() } : {}),
        ...(it.extraPositions.some(p => p.emb_url.trim() || p.mockup_url.trim())
          ? {
              extra_positions: it.extraPositions
                .filter(p => p.emb_url.trim() || p.mockup_url.trim())
                .map(p => {
                  const epObj = positions.find(pp => nameOf(pp) === p.position);
                  return {
                    position: (epObj as any)?.code || p.position,
                    ...(epObj?.id !== undefined ? { position_id: epObj.id } : {}),
                    ...(p.mockup_url.trim() ? { mockup_url: p.mockup_url.trim() } : {}),
                    ...(p.emb_url.trim() ? { emb_url: p.emb_url.trim() } : {}),
                  };
                }),
            }
          : {}),
        };
      }),
    };

    setSubmitting(true);
    try {
      const resp = await createFactoryOrder('hongphat', record.id!, payload);
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
          {result.existed ? 'Order already exists on Hong Phat' : 'Order created on Hong Phat'}
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          Hong Phat order: <span className="font-mono">HPE-{result.order_id}</span> — record #{record.order_id} set to Producing.
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
                    value={it.productCode}
                    onChange={e => patchItem(idx, { productCode: e.target.value, color: '', size: '' })}
                    className={inputCls}
                  >
                    <option value="">Select</option>
                    {products.map(p => {
                      const code = codeOf(p);
                      return <option key={code} value={code}>{p.name || code}{p.name && code !== p.name ? ` (${code})` : ''}</option>;
                    })}
                  </select>
                ) : (
                  <input value={it.productCode} onChange={e => patchItem(idx, { productCode: e.target.value })} className={inputCls} placeholder="TSHIRT" />
                )}
              </div>
              <div className="md:col-span-3">
                <label className={labelCls}>Color</label>
                {hasCatalog && colorsOf(it.productCode).length > 0 ? (
                  <select value={it.color} onChange={e => patchItem(idx, { color: e.target.value })} className={inputCls} disabled={!it.productCode}>
                    <option value="">Select</option>
                    {colorsOf(it.productCode).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : (
                  <input value={it.color} onChange={e => patchItem(idx, { color: e.target.value })} className={inputCls} placeholder="Black" />
                )}
              </div>
              <div className="md:col-span-3">
                <label className={labelCls}>Size</label>
                {hasCatalog && sizesOf(it.productCode).length > 0 ? (
                  <select value={it.size} onChange={e => patchItem(idx, { size: e.target.value })} className={inputCls} disabled={!it.productCode}>
                    <option value="">Select</option>
                    {sizesOf(it.productCode).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <input value={it.size} onChange={e => patchItem(idx, { size: e.target.value })} className={inputCls} placeholder="L" />
                )}
              </div>
            </div>
          </div>

          <div className="py-3 border-b border-gray-100 dark:border-gray-700/60">
            <p className={`${sectionTitleCls} mb-2`}>Design</p>
            <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end">
              <div className="md:col-span-12">
                <label className={labelCls}>Position</label>
                {positionNames.length > 0 ? (
                  <select value={it.defaultPosition} onChange={e => patchItem(idx, { defaultPosition: e.target.value })} className={inputCls}>
                    {(positionNames.includes(it.defaultPosition) ? positionNames : [it.defaultPosition, ...positionNames]).map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                ) : (
                  <input value={it.defaultPosition} onChange={e => patchItem(idx, { defaultPosition: e.target.value })} className={inputCls} />
                )}
              </div>
              {([['mockupUrl', 'Mockup URL'], ['pngUrl', 'PNG URL'], ['embUrl', 'EMB URL']] as [keyof ItemState, string][]).map(([k, label]) => (
                <DesignUrlField
                  key={k}
                  className="md:col-span-4"
                  label={label}
                  value={it[k] as string}
                  onChange={v => patchItem(idx, { [k]: v } as any)}
                  onPick={() => setPickTarget({ apply: (url: string) => patchItem(idx, { [k]: url } as any) })}
                />
              ))}
            </div>
          </div>

          <div className="pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className={sectionTitleCls}>Extra positions</p>
              <button
                onClick={() => patchItem(idx, { extraPositions: [...it.extraPositions, { position: positionNames[0] || 'Right Sleeve', mockup_url: '', emb_url: '' }] })}
                className="px-2.5 py-1 text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Add position
              </button>
            </div>
            <div className="space-y-2">
              {it.extraPositions.map((p, pi) => (
                <div key={pi} className="grid grid-cols-2 md:grid-cols-[180px_1fr_1fr_68px] gap-2 items-end bg-gray-50 dark:bg-gray-700/40 rounded-md p-2">
                  <div>
                    <label className={labelCls}>Position</label>
                    {positionNames.length > 0 ? (
                      <select
                        value={p.position}
                        onChange={e => patchItem(idx, { extraPositions: it.extraPositions.map((x, i) => i === pi ? { ...x, position: e.target.value } : x) })}
                        className={inputCls}
                      >
                        {(positionNames.includes(p.position) ? positionNames : [p.position, ...positionNames]).map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={p.position}
                        onChange={e => patchItem(idx, { extraPositions: it.extraPositions.map((x, i) => i === pi ? { ...x, position: e.target.value } : x) })}
                        className={inputCls}
                      />
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>Mockup URL</label>
                    <input
                      value={p.mockup_url}
                      onChange={e => patchItem(idx, { extraPositions: it.extraPositions.map((x, i) => i === pi ? { ...x, mockup_url: e.target.value } : x) })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>EMB URL</label>
                    <input
                      value={p.emb_url}
                      onChange={e => patchItem(idx, { extraPositions: it.extraPositions.map((x, i) => i === pi ? { ...x, emb_url: e.target.value } : x) })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <button
                      onClick={() => patchItem(idx, { extraPositions: it.extraPositions.filter((_, i) => i !== pi) })}
                      className="w-full px-2 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                    >
                      Remove
                    </button>
                  </div>
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
              <label className={labelCls}>Service</label>
              <input value={shippingService} onChange={e => setShippingService(e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>
        <div>
          <p className={`${sectionTitleCls} mb-3`}>Customer address</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              ['recipient_name', 'Name'], ['phone', 'Phone'], ['email', 'Email'], ['address_line1', 'Street 1'],
              ['address_line2', 'Street 2'], ['city', 'City'], ['state', 'State'], ['postal_code', 'Zip'],
              ['country', 'Country (2 letters)'], ['shipping_note', 'Shipping note'],
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
          disabled={submitting}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold text-sm disabled:opacity-50 flex items-center gap-2"
        >
          {submitting && <Spinner size="sm" color="text-white" />}
          {submitting ? 'Sending…' : 'Create Hong Phat order'}
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

export default HongPhatOrderForm;
