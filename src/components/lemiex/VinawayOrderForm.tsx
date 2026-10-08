// Vinaway create-order form: production line + per-item SKU picker
// (GET /product-skus) + design surfaces.
import React, { useCallback, useEffect, useState } from 'react';
import { useDashboard } from '../../contexts/DashboardContext';
import { Record } from '../../types';
import FulfillOrderHeader from './FulfillOrderHeader';
import DesignPickerModal from '../DesignPickerModal';
import DesignUrlField from './DesignUrlField';
import Spinner from '../Spinner';
import {
  VinawayProductionLine,
  VinawaySku,
  getVinawayProductionLines,
  getVinawaySkus,
  createFactoryOrder,
} from '../../services/factoryService';

const inputCls = 'w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelCls = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1';
const cardCls = 'bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700';
const sectionTitleCls = 'text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider';

interface SurfaceRow { product_surface_id: string; design_png: string }

interface ItemState {
  productName: string;
  quantity: number;
  skuId: string;      // product_sku_id
  productId: string;  // product_id (comes directly on the SKU row, editable)
  skuSearch: string;  // client-side filter for the 1700+ SKU list
  mockup1: string;
  surfaces: SurfaceRow[];
}

const VinawayOrderForm: React.FC<{ record: Record; onBack: () => void }> = ({ record, onBack }) => {
  const { setRecords } = useDashboard();
  const addr = record.details?.shippingAddress;

  const [lines, setLines] = useState<VinawayProductionLine[]>([]);
  const [skus, setSkus] = useState<VinawaySku[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [lineId, setLineId] = useState('1');

  useEffect(() => {
    getVinawayProductionLines()
      .then(ls => { setLines(ls); if (ls[0]) setLineId(String(ls[0].id)); })
      .catch((e: any) => setCatalogError(e?.message || 'Cannot reach Vinaway'));
    getVinawaySkus().then(setSkus).catch(() => setSkus([]));
  }, []);

  const [items, setItems] = useState<ItemState[]>(() =>
    (record.details?.items || []).map((i) => ({
      productName: i.name || '',
      quantity: Number((i as any).quantity) || 1,
      skuId: '',
      productId: '',
      skuSearch: '',
      mockup1: i.image || '',
      surfaces: [{ product_surface_id: '', design_png: '' }],
    }))
  );

  const patchItem = useCallback((idx: number, patch: Partial<ItemState>) => {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }, []);

  const [address, setAddress] = useState({
    customer_name: addr?.name || record.details?.customerName || '',
    address1: addr?.address1 || '',
    city: addr?.city || '',
    state: addr?.state || '',
    zip: addr?.zip || '',
    country: addr?.country || 'US',
  });

  // Holds the setter the Products picker should write the chosen URL into.
  const [pickTarget, setPickTarget] = useState<{ apply: (url: string) => void } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ order_id: string } | null>(null);

  const handleSubmit = async () => {
    setSubmitError(null);
    for (const [i, it] of items.entries()) {
      if (!it.skuId) return setSubmitError(`Item ${i + 1}: SKU is not selected`);
      if (!it.productId) return setSubmitError(`Item ${i + 1}: product id is missing`);
    }
    for (const k of ['customer_name', 'address1', 'city', 'zip', 'country', 'state'] as const) {
      if (!address[k].trim()) return setSubmitError(`Address: ${k} is required`);
    }
    if (!record.order_id) return setSubmitError('This record has no order id');

    const payload: any = {
      type: 1,
      external_order_id: String(record.order_id),
      production_line_id: Number(lineId) || 1,
      ...address,
      items: items.map(it => ({
        product_id: Number(it.productId),
        product_sku_id: Number(it.skuId),
        quantity: it.quantity,
        ...(it.mockup1.trim() ? { mockup1: it.mockup1.trim() } : {}),
        productSurfaces: it.surfaces
          .filter(s => s.design_png.trim())
          .map(s => ({
            product_surface_id: Number(s.product_surface_id) || undefined,
            design_png: s.design_png.trim(),
          })),
      })),
    };

    setSubmitting(true);
    try {
      const resp = await createFactoryOrder('vinaway', record.id!, payload);
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
        <p className="text-base font-semibold text-gray-900 dark:text-white mb-1">Order created on Vinaway</p>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          Vinaway order: <span className="font-mono">VNW-{result.order_id}</span> — record #{record.order_id} set to Producing.
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

      <div className={`${cardCls} p-4`}>
        <p className={`${sectionTitleCls} mb-3`}>Production line</p>
        <select value={lineId} onChange={e => setLineId(e.target.value)} className={`${inputCls} max-w-xs`}>
          {(lines.length ? lines : [{ id: 1, name: 'Standard' }, { id: 2, name: 'Express' }]).map(l => (
            <option key={String(l.id)} value={String(l.id)}>{l.name}</option>
          ))}
        </select>
      </div>

      {items.map((it, idx) => (
        <div key={idx} className={`${cardCls} p-4 space-y-5`}>
          <div className="flex items-start gap-3">
            <div className="flex-grow min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate" title={it.productName}>
                {idx + 1}. {it.productName}
              </p>
            </div>
            <div className="w-24 flex-shrink-0">
              <label className={labelCls}>Qty</label>
              <input
                type="number" min={1} value={it.quantity}
                onChange={e => patchItem(idx, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <p className={`${sectionTitleCls} mb-3`}>Variant</p>
            <div className="grid grid-cols-2 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-3">
                <label className={labelCls}>Search SKU</label>
                <input
                  value={it.skuSearch}
                  onChange={e => patchItem(idx, { skuSearch: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div className="md:col-span-7">
                <label className={labelCls}>SKU</label>
                <select
                  value={it.skuId}
                  onChange={e => {
                    const skuId = e.target.value;
                    const sku = skus.find(s => String(s.product_sku_id ?? s.id) === skuId);
                    const pid = sku?.product_id ?? sku?.product?.id;
                    patchItem(idx, { skuId, productId: pid !== undefined && pid !== null ? String(pid) : '' });
                  }}
                  className={inputCls}
                >
                  <option value="">Select</option>
                  {skus
                    .filter(s => {
                      const q = it.skuSearch.trim().toLowerCase();
                      return !q || (s.name || '').toLowerCase().includes(q);
                    })
                    .slice(0, 300)
                    .map(s => (
                      <option key={s.product_sku_id ?? s.id} value={String(s.product_sku_id ?? s.id)}>
                        {s.name}{s.price !== undefined ? ` — ${s.price}` : ''}
                      </option>
                    ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Product ID</label>
                <input
                  value={it.productId}
                  onChange={e => patchItem(idx, { productId: e.target.value })}
                  className={`${inputCls} font-mono ${it.productId ? 'border-green-400 dark:border-green-600' : ''}`}
                />
              </div>
            </div>
          </div>

          <div>
            <p className={`${sectionTitleCls} mb-3`}>Mockup</p>
            <input value={it.mockup1} onChange={e => patchItem(idx, { mockup1: e.target.value })} className={inputCls} placeholder="https://…" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <p className={sectionTitleCls}>Design surfaces</p>
              <button
                onClick={() => patchItem(idx, { surfaces: [...it.surfaces, { product_surface_id: '', design_png: '' }] })}
                className="px-2.5 py-1 text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Add surface
              </button>
            </div>
            <div className="space-y-2">
              {it.surfaces.map((s, si) => (
                <div key={si} className="grid grid-cols-2 md:grid-cols-[150px_minmax(260px,1fr)_76px] gap-2 items-end bg-gray-50 dark:bg-gray-700/40 rounded-md p-2">
                  <div>
                    <label className={labelCls}>Surface ID</label>
                    <input
                      value={s.product_surface_id}
                      onChange={e => patchItem(idx, { surfaces: it.surfaces.map((x, i) => i === si ? { ...x, product_surface_id: e.target.value } : x) })}
                      className={`${inputCls} font-mono`}
                    />
                  </div>
                  <DesignUrlField
                    label="Design PNG URL"
                    value={s.design_png}
                    onChange={v => patchItem(idx, { surfaces: it.surfaces.map((x, i) => i === si ? { ...x, design_png: v } : x) })}
                    onPick={() => setPickTarget({ apply: (url: string) => patchItem(idx, { surfaces: it.surfaces.map((x, i) => i === si ? { ...x, design_png: url } : x) }) })}
                  />
                  <div>
                    {it.surfaces.length > 1 && (
                      <button
                        onClick={() => patchItem(idx, { surfaces: it.surfaces.filter((_, i) => i !== si) })}
                        className="w-full px-2 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      <div className={`${cardCls} p-4`}>
        <p className={`${sectionTitleCls} mb-3`}>Customer address</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {([
            ['customer_name', 'Name'], ['address1', 'Street 1'], ['city', 'City'],
            ['state', 'State'], ['zip', 'Zip'], ['country', 'Country'],
          ] as [keyof typeof address, string][]).map(([k, label]) => (
            <div key={k}>
              <label className={labelCls}>{label}</label>
              <input value={address[k]} onChange={e => setAddress(prev => ({ ...prev, [k]: e.target.value }))} className={inputCls} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold text-sm disabled:opacity-50 flex items-center gap-2"
        >
          {submitting && <Spinner size="sm" color="text-white" />}
          {submitting ? 'Sending…' : 'Create Vinaway order'}
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

export default VinawayOrderForm;
