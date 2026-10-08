// Hogoto POD create-order form (POST /v1/partner/order/store).
// Per item: Product (catalog) → Color → Size (with cost) → Position +
// product type (EMBROIDERY | PRINT_2D | PRINT_3D) + design attachments
// (design / EMB / DST / mockup URLs, outline SATIN|SQUARE).
// No documented idempotency — the server refuses when already HGT-linked.
import React, { useCallback, useEffect, useState } from 'react';
import { useDashboard } from '../../contexts/DashboardContext';
import { Record } from '../../types';
import FulfillOrderHeader from './FulfillOrderHeader';
import DesignPickerModal from '../DesignPickerModal';
import DesignUrlField from './DesignUrlField';
import Spinner from '../Spinner';
import {
  HogotoProduct,
  getHogotoProducts,
  createFactoryOrder,
} from '../../services/factoryService';

const inputCls = 'w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelCls = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1';
const cardCls = 'bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700';
const sectionTitleCls = 'text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider';

const SHIPPING_METHODS = ['HOGOTOFAST', 'HOGOTO_EPACKET', 'NONE', 'SHIPPING_OUTSIDE_US', 'SHIPPING_TIKTOK_UK', 'TIKTOK'];
const PRODUCT_TYPES = ['EMBROIDERY', 'PRINT_2D', 'PRINT_3D'];
const OUTLINES = ['', 'SATIN', 'SQUARE'];

const nameOf = (x: any): string => (typeof x === 'string' ? x : x?.name ?? x?.code ?? String(x ?? ''));
const codeOf = (x: any): string => (typeof x === 'string' ? x : String(x?.code || x?.name || ''));

interface DesignRow { positionCode: string; designUrl: string; designEmbUrl: string; dstFileUrl: string; mockupUrl: string; outline: string }

interface ItemState {
  productName: string;
  quantity: number;
  productCode: string;
  productType: string;
  colorCode: string;
  size: string;
  positionCode: string;
  designs: DesignRow[];
}

const HogotoOrderForm: React.FC<{ record: Record; onBack: () => void }> = ({ record, onBack }) => {
  const { setRecords } = useDashboard();
  const addr = record.details?.shippingAddress;
  const customerName = addr?.name || record.details?.customerName || '';
  const nameParts = customerName.trim().split(/\s+/);

  const [products, setProducts] = useState<HogotoProduct[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    getHogotoProducts()
      .then(setProducts)
      .catch((e: any) => setCatalogError(e?.message || 'Cannot reach Hogoto'));
  }, []);

  const productOf = (code: string) => products.find(p => codeOf(p) === code);
  const colorsOf = (code: string) => (productOf(code)?.colors || []) as any[];
  const sizesOf = (code: string) => (productOf(code)?.sizeCosts || []) as any[];
  const positionsOf = (code: string) => (productOf(code)?.positions || []) as any[];
  const sizeLabel = (sz: any): string => String(sz?.size ?? sz?.code ?? sz?.name ?? sz ?? '');
  const sizeCost = (sz: any): string => (sz?.cost !== undefined ? String(sz.cost) : (sz?.price !== undefined ? String(sz.price) : ''));

  const [items, setItems] = useState<ItemState[]>(() =>
    (record.details?.items || []).map(i => ({
      productName: i.name || '',
      quantity: Number((i as any).quantity) || 1,
      productCode: '',
      productType: 'EMBROIDERY',
      colorCode: '',
      size: '',
      positionCode: '',
      designs: [{ positionCode: '', designUrl: '', designEmbUrl: '', dstFileUrl: '', mockupUrl: i.image || '', outline: '' }],
    }))
  );

  const patchItem = useCallback((idx: number, patch: Partial<ItemState>) => {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }, []);

  const [recipient, setRecipient] = useState({
    firstName: nameParts[0] || '',
    lastName: nameParts.slice(1).join(' '),
    email: record.details?.customerEmail || '',
    phone: '',
  });
  const [address, setAddress] = useState({
    details: addr?.address1 || '',
    addressText2: addr?.address2 || '',
    city: addr?.city || '',
    state: addr?.state || '',
    zip: addr?.zip || '',
    country: (addr?.country || 'US').length === 2 ? (addr?.country || 'US') : 'US',
  });
  const [shippingMethod, setShippingMethod] = useState('HOGOTOFAST');
  const [customerNote, setCustomerNote] = useState('');

  // Holds the setter the Products picker should write the chosen URL into.
  const [pickTarget, setPickTarget] = useState<{ apply: (url: string) => void } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ order_id: string } | null>(null);

  const alreadySent = (record.ff_code || '').startsWith('HGT-');

  const handleSubmit = async () => {
    setSubmitError(null);
    for (const [i, it] of items.entries()) {
      if (!it.productCode) return setSubmitError(`Item ${i + 1}: product is required`);
      if (it.designs.every(d => !d.designUrl.trim() && !d.designEmbUrl.trim() && !d.dstFileUrl.trim())) {
        return setSubmitError(`Item ${i + 1}: at least one design file URL is required`);
      }
    }
    for (const k of ['details', 'city', 'state', 'zip', 'country'] as const) {
      if (!address[k].trim()) return setSubmitError(`Address: ${k} is required`);
    }
    if (!record.order_id) return setSubmitError('This record has no order id');

    const payload = {
      referenceCode: String(record.order_id),
      shippingMethod,
      ...(customerNote.trim() ? { customerNote: customerNote.trim() } : {}),
      recipient,
      // addressText2 is required by their schema — send '' when empty
      address: { ...address, addressText2: address.addressText2 || '' },
      products: items.map(it => ({
        productCode: it.productCode,
        productType: it.productType,
        quantity: it.quantity,
        ...(it.colorCode ? { colorCode: it.colorCode } : {}),
        ...(it.size ? { size: it.size } : {}),
        ...(it.positionCode ? { positionCode: it.positionCode } : {}),
        designAttachments: it.designs
          .filter(d => d.designUrl.trim() || d.designEmbUrl.trim() || d.dstFileUrl.trim() || d.mockupUrl.trim())
          .map(d => ({
            ...(d.positionCode ? { positionCode: d.positionCode } : {}),
            ...(d.designUrl.trim() ? { designUrl: d.designUrl.trim() } : {}),
            ...(d.designEmbUrl.trim() ? { designEmbUrl: d.designEmbUrl.trim() } : {}),
            ...(d.dstFileUrl.trim() ? { dstFileUrl: d.dstFileUrl.trim() } : {}),
            ...(d.mockupUrl.trim() ? { mockupUrl: d.mockupUrl.trim() } : {}),
            ...(d.outline ? { outline: d.outline } : {}),
          })),
      })),
    };

    setSubmitting(true);
    try {
      const resp = await createFactoryOrder('hogoto', record.id!, payload);
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
        <p className="text-base font-semibold text-gray-900 dark:text-white mb-1">Order created on Hogoto</p>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          Hogoto order: <span className="font-mono">HGT-{result.order_id}</span> — record #{record.order_id} set to Producing.
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
          This order is already linked to {record.ff_code}. Hogoto has no duplicate protection — creating again is blocked.
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
              <div className="md:col-span-4">
                <label className={labelCls}>Product</label>
                <select
                  value={it.productCode}
                  onChange={e => patchItem(idx, { productCode: e.target.value, colorCode: '', size: '', positionCode: '' })}
                  className={inputCls}
                >
                  <option value="">Select</option>
                  {products.map(p => {
                    const code = codeOf(p);
                    return <option key={code || p.id} value={code}>{p.name || code}</option>;
                  })}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Type</label>
                <select value={it.productType} onChange={e => patchItem(idx, { productType: e.target.value })} className={inputCls}>
                  {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Color</label>
                <select value={it.colorCode} onChange={e => patchItem(idx, { colorCode: e.target.value })} className={inputCls} disabled={!it.productCode}>
                  <option value="">—</option>
                  {colorsOf(it.productCode).map((c, ci) => (
                    <option key={ci} value={codeOf(c)}>{nameOf(c)}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Size</label>
                <select value={it.size} onChange={e => patchItem(idx, { size: e.target.value })} className={inputCls} disabled={!it.productCode}>
                  <option value="">—</option>
                  {sizesOf(it.productCode).map((sz, si) => (
                    <option key={si} value={sizeLabel(sz)}>
                      {sizeLabel(sz)}{sizeCost(sz) ? ` ($${sizeCost(sz)})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Position</label>
                <select value={it.positionCode} onChange={e => patchItem(idx, { positionCode: e.target.value })} className={inputCls} disabled={!it.productCode}>
                  <option value="">—</option>
                  {positionsOf(it.productCode).map((p, pi) => (
                    <option key={pi} value={codeOf(p)}>{nameOf(p)}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className={sectionTitleCls}>Design files</p>
              <button
                onClick={() => patchItem(idx, { designs: [...it.designs, { positionCode: '', designUrl: '', designEmbUrl: '', dstFileUrl: '', mockupUrl: '', outline: '' }] })}
                className="px-2.5 py-1 text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Add design
              </button>
            </div>
            <div className="space-y-2">
              {it.designs.map((d, di) => (
                <div key={di} className="bg-gray-50 dark:bg-gray-700/40 rounded-md p-2 space-y-2">
                  {/* Position/outline first, then the four design URLs two-up so
                      each input keeps usable width beside its Pick button. */}
                  <div className="grid grid-cols-2 md:grid-cols-[1fr_160px_auto] gap-2 items-end">
                    <div>
                      <label className={labelCls}>Position</label>
                      <select
                        value={d.positionCode}
                        onChange={e => patchItem(idx, { designs: it.designs.map((x, i) => i === di ? { ...x, positionCode: e.target.value } : x) })}
                        className={inputCls}
                      >
                        <option value="">—</option>
                        {(productOf(it.productCode)?.positions || []).map((p: any, pi: number) => (
                          <option key={pi} value={codeOf(p)}>{nameOf(p)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Outline</label>
                      <select
                        value={d.outline}
                        onChange={e => patchItem(idx, { designs: it.designs.map((x, i) => i === di ? { ...x, outline: e.target.value } : x) })}
                        className={inputCls}
                      >
                        {OUTLINES.map(o => <option key={o} value={o}>{o || '—'}</option>)}
                      </select>
                    </div>
                    {it.designs.length > 1 && (
                      <div>
                        <button
                          onClick={() => patchItem(idx, { designs: it.designs.filter((_, i) => i !== di) })}
                          className="px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded whitespace-nowrap"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {([
                      ['designUrl', 'Design URL'], ['designEmbUrl', 'EMB URL'], ['dstFileUrl', 'DST URL'], ['mockupUrl', 'Mockup URL'],
                    ] as [keyof DesignRow, string][]).map(([k, label]) => (
                      <DesignUrlField
                        key={k}
                        label={label}
                        value={d[k] as string}
                        onChange={v => patchItem(idx, { designs: it.designs.map((x, i) => i === di ? { ...x, [k]: v } : x) })}
                        onPick={() => setPickTarget({
                          apply: (url: string) => patchItem(idx, { designs: it.designs.map((x, i) => i === di ? { ...x, [k]: url } : x) }),
                        })}
                      />
                    ))}
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
              <label className={labelCls}>Method</label>
              <select value={shippingMethod} onChange={e => setShippingMethod(e.target.value)} className={inputCls}>
                {SHIPPING_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div>
          <p className={`${sectionTitleCls} mb-3`}>Recipient</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              ['firstName', 'First name'], ['lastName', 'Last name'], ['email', 'Email'], ['phone', 'Phone'],
            ] as [keyof typeof recipient, string][]).map(([k, label]) => (
              <div key={k}>
                <label className={labelCls}>{label}</label>
                <input value={recipient[k]} onChange={e => setRecipient(prev => ({ ...prev, [k]: e.target.value }))} className={inputCls} />
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className={`${sectionTitleCls} mb-3`}>Customer address</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {([
              ['details', 'Street 1'], ['addressText2', 'Street 2'], ['city', 'City'],
              ['state', 'State'], ['zip', 'Zip'], ['country', 'Country (2 letters)'],
            ] as [keyof typeof address, string][]).map(([k, label]) => (
              <div key={k}>
                <label className={labelCls}>{label}</label>
                <input value={address[k]} onChange={e => setAddress(prev => ({ ...prev, [k]: e.target.value }))} className={inputCls} />
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className={`${sectionTitleCls} mb-3`}>Note</p>
          <input value={customerNote} onChange={e => setCustomerNote(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={submitting || alreadySent}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold text-sm disabled:opacity-50 flex items-center gap-2"
        >
          {submitting && <Spinner size="sm" color="text-white" />}
          {submitting ? 'Sending…' : 'Create Hogoto order'}
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

export default HogotoOrderForm;
