// Lemiex fulfillment flow (Fulfill tab):
//   1. pick one of our Etsy orders            (/fulfill?section=lemiex)
//   2. per line item resolve the Lemiex variant_id (Style → Color → Size)
//      and attach design files                (/fulfill?section=lemiex&lmx={recordId})
//   3. confirm address/shipping and submit to POST /api/orders/create
//   4. the record is linked (FF Code = LMX-{id}, Status → PRODUCING)
// URL-backed so F5 restores the exact screen.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDashboard } from '../../contexts/DashboardContext';
import { getRecentOrderRecords, getRecordsForDateRange, getRecordById } from '../../services/firebaseService';
import { useUI } from '../../contexts/UIContext';
import { Record } from '../../types';
import FulfillOrderHeader from './FulfillOrderHeader';
import DesignPickerModal from '../DesignPickerModal';
import DesignUrlField from './DesignUrlField';
import { ORDER_STATUS_LABELS, ORDER_STATUS_CLASSES } from '../../constants/orderStatus';
import Spinner from '../Spinner';
import OrderDetailModal from '../OrderDetailModal';
import {
  LemiexLine,
  LemiexSettingsInfo,
  LemiexOrderPayload,
  LemiexPrintFile,
  getLemiexSettings,
  saveLemiexSettings,
  getLemiexStyles,
  getLemiexColors,
  getLemiexSizes,
  getLemiexVariants,
  getLemiexEmbroideryTypes,
  getLemiexPriorities,
  createLemiexOrder,
} from '../../services/lemiexService';
import {
  FactorySettingsInfo,
  getFactorySettings,
  saveFactorySettings,
  prefetchFactoryCatalogs,
} from '../../services/factoryService';
import MangoOrderForm from './MangoOrderForm';
import VinawayOrderForm from './VinawayOrderForm';
import MonkeyKingOrderForm from './MonkeyKingOrderForm';
import DreamshipOrderForm from './DreamshipOrderForm';
import HongPhatOrderForm from './HongPhatOrderForm';
import HogotoOrderForm from './HogotoOrderForm';

const inputCls = 'w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelCls = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1';
const cardCls = 'bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700';
const sectionTitleCls = 'text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider';

const PRINT_POSITIONS = ['front', 'back', 'sleeve_left', 'sleeve_right', 'neck', 'special_design'];

// ==============================
// Owner settings modal
// ==============================

const LemiexSettingsModal: React.FC<{
  info: LemiexSettingsInfo | null;
  onClose: () => void;
  onSaved: (info: LemiexSettingsInfo) => void;
}> = ({ info, onClose, onSaved }) => {
  const [tab, setTab] = useState<'lemiex' | 'mango' | 'vinaway' | 'monkeyking' | 'dreamship' | 'hongphat' | 'hogoto'>('lemiex');

  // Lemiex fields
  const [email, setEmail] = useState(info?.email || '');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  // Other providers
  const [mangoInfo, setMangoInfo] = useState<FactorySettingsInfo | null>(null);
  const [vinawayInfo, setVinawayInfo] = useState<FactorySettingsInfo | null>(null);
  const [mkInfo, setMkInfo] = useState<FactorySettingsInfo | null>(null);
  const [dsInfo, setDsInfo] = useState<FactorySettingsInfo | null>(null);
  const [hpInfo, setHpInfo] = useState<FactorySettingsInfo | null>(null);
  const [hgInfo, setHgInfo] = useState<FactorySettingsInfo | null>(null);
  const [mangoKey, setMangoKey] = useState('');
  const [vwEmail, setVwEmail] = useState('');
  const [vwPassword, setVwPassword] = useState('');
  const [mkUser, setMkUser] = useState('');
  const [mkPassword, setMkPassword] = useState('');
  const [dsKey, setDsKey] = useState('');
  const [hpKey, setHpKey] = useState('');
  const [hgKey, setHgKey] = useState('');
  const [hgTenant, setHgTenant] = useState('');

  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [resultOk, setResultOk] = useState(false);

  useEffect(() => {
    getFactorySettings('mango').then(i => setMangoInfo(i)).catch(() => setMangoInfo(null));
    getFactorySettings('vinaway').then(i => { setVinawayInfo(i); setVwEmail(i.email || ''); }).catch(() => setVinawayInfo(null));
    getFactorySettings('monkeyking').then(i => { setMkInfo(i); setMkUser(i.email || ''); }).catch(() => setMkInfo(null));
    getFactorySettings('dreamship').then(i => setDsInfo(i)).catch(() => setDsInfo(null));
    getFactorySettings('hongphat').then(i => setHpInfo(i)).catch(() => setHpInfo(null));
    getFactorySettings('hogoto').then(i => { setHgInfo(i); setHgTenant(i.email || ''); }).catch(() => setHgInfo(null));
  }, []);

  useEffect(() => { setResult(null); }, [tab]);

  const handleSave = async () => {
    setSaving(true);
    setResult(null);
    try {
      if (tab === 'lemiex') {
        const saved = await saveLemiexSettings({ email, password: password || undefined, apiKey: apiKey || undefined });
        setResultOk(Boolean(saved.loginOk));
        setResult(saved.loginOk ? 'Login OK' : (saved.loginMessage || 'Login failed'));
        onSaved(saved);
      } else if (tab === 'mango') {
        const saved = await saveFactorySettings('mango', { apiKey: mangoKey || undefined });
        setMangoInfo(saved);
        setResultOk(Boolean(saved.testOk));
        setResult(saved.testOk ? 'API key OK' : (saved.testMessage || 'Test failed'));
      } else if (tab === 'vinaway') {
        const saved = await saveFactorySettings('vinaway', { email: vwEmail, password: vwPassword || undefined });
        setVinawayInfo(saved);
        setResultOk(Boolean(saved.testOk));
        setResult(saved.testOk ? 'Login OK' : (saved.testMessage || 'Login failed'));
      } else if (tab === 'monkeyking') {
        const saved = await saveFactorySettings('monkeyking', { username: mkUser, password: mkPassword || undefined });
        setMkInfo(saved);
        setResultOk(Boolean(saved.testOk));
        setResult(saved.testOk ? 'Login OK' : (saved.testMessage || 'Login failed'));
      } else if (tab === 'dreamship') {
        const saved = await saveFactorySettings('dreamship', { apiKey: dsKey || undefined });
        setDsInfo(saved);
        setResultOk(Boolean(saved.testOk));
        setResult(saved.testOk ? 'API key OK' : (saved.testMessage || 'Test failed'));
      } else if (tab === 'hongphat') {
        const saved = await saveFactorySettings('hongphat', { apiKey: hpKey || undefined });
        setHpInfo(saved);
        setResultOk(Boolean(saved.testOk));
        setResult(saved.testOk ? 'API token OK' : (saved.testMessage || 'Test failed'));
      } else {
        const saved = await saveFactorySettings('hogoto', { apiKey: hgKey || undefined, tenant: hgTenant });
        setHgInfo(saved);
        setResultOk(Boolean(saved.testOk));
        setResult(saved.testOk ? 'API key OK' : (saved.testMessage || 'Test failed'));
      }
    } catch (e: any) {
      setResultOk(false);
      setResult(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700 p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Factory Settings</h3>
        <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1 mb-4">
          {([
            { key: 'lemiex', label: 'Lemiex' },
            { key: 'mango', label: 'Mango' },
            { key: 'vinaway', label: 'Vinaway' },
            { key: 'monkeyking', label: 'MonkeyKing' },
            { key: 'dreamship', label: 'Dreamship' },
            { key: 'hongphat', label: 'HongPhat' },
            { key: 'hogoto', label: 'Hogoto' },
          ] as { key: typeof tab; label: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === t.key
                ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-300 shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'lemiex' && (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} placeholder="seller@example.com" />
            </div>
            <div>
              <label className={labelCls}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} className={inputCls} placeholder={info?.configured ? 'Leave blank to keep current' : ''} />
            </div>
            <div>
              <label className={labelCls}>API Key</label>
              <input type="text" value={apiKey} onChange={e => setApiKey(e.target.value)} className={`${inputCls} font-mono`} placeholder={info?.hasApiKey ? 'Leave blank to keep current' : ''} />
            </div>
          </div>
        )}

        {tab === 'mango' && (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>X-API-Key</label>
              <input
                type="text" value={mangoKey} onChange={e => setMangoKey(e.target.value)}
                className={`${inputCls} font-mono`}
                placeholder={mangoInfo?.configured ? 'Leave blank to keep current' : ''}
              />
            </div>
          </div>
        )}

        {tab === 'vinaway' && (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" value={vwEmail} onChange={e => setVwEmail(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Password</label>
              <input type="password" value={vwPassword} onChange={e => setVwPassword(e.target.value)} className={inputCls} placeholder={vinawayInfo?.configured ? 'Leave blank to keep current' : ''} />
            </div>
          </div>
        )}

        {tab === 'monkeyking' && (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Username</label>
              <input type="text" value={mkUser} onChange={e => setMkUser(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Password</label>
              <input type="password" value={mkPassword} onChange={e => setMkPassword(e.target.value)} className={inputCls} placeholder={mkInfo?.configured ? 'Leave blank to keep current' : ''} />
            </div>
          </div>
        )}

        {tab === 'dreamship' && (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>API Key</label>
              <input
                type="text" value={dsKey} onChange={e => setDsKey(e.target.value)}
                className={`${inputCls} font-mono`}
                placeholder={dsInfo?.configured ? 'Leave blank to keep current' : ''}
              />
            </div>
          </div>
        )}

        {tab === 'hongphat' && (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>API Token</label>
              <input
                type="text" value={hpKey} onChange={e => setHpKey(e.target.value)}
                className={`${inputCls} font-mono`}
                placeholder={hpInfo?.configured ? 'Leave blank to keep current' : 'hp_live_…'}
              />
            </div>
          </div>
        )}

        {tab === 'hogoto' && (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>API Key</label>
              <input
                type="text" value={hgKey} onChange={e => setHgKey(e.target.value)}
                className={`${inputCls} font-mono`}
                placeholder={hgInfo?.hasApiKey ? 'Leave blank to keep current' : 'pk_live_…'}
              />
            </div>
            <div>
              <label className={labelCls}>Tenant (X-Tenant)</label>
              <input type="text" value={hgTenant} onChange={e => setHgTenant(e.target.value)} className={`${inputCls} font-mono`} />
            </div>
          </div>
        )}

        {result && (
          <p className={`text-sm mt-3 ${resultOk ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{result}</p>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-500 text-gray-700 dark:text-white rounded-md hover:bg-gray-50 dark:hover:bg-gray-600">
            Close
          </button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 flex items-center gap-2">
            {saving && <Spinner size="sm" color="text-white" />}
            {saving ? 'Saving…' : 'Save & Test'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==============================
// Step 1: order picker
// ==============================

const StatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  const s = status || 'NEW';
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${ORDER_STATUS_CLASSES[s] || ORDER_STATUS_CLASSES.NEW}`}>
      {ORDER_STATUS_LABELS[s] || s}
    </span>
  );
};

const FF_FACTORIES: { key: string; label: string; prefix: string }[] = [
  { key: 'lemiex', label: 'Lemiex', prefix: 'LMX-' },
  { key: 'mango', label: 'MangoTee', prefix: 'MGO-' },
  { key: 'vinaway', label: 'Vinaway', prefix: 'VNW-' },
  { key: 'monkeyking', label: 'MonkeyKing', prefix: 'MKP-' },
  { key: 'dreamship', label: 'Dreamship', prefix: 'DSH-' },
  { key: 'hongphat', label: 'HongPhat', prefix: 'HPE-' },
  { key: 'hogoto', label: 'Hogoto', prefix: 'HGT-' },
];

const isSent = (r: Record) => /^(LMX|MGO|VNW|MKP|DSH|HPE|HGT)-/.test(r.ff_code || '');

const OrderPicker: React.FC<{
  orders: Record[];
  loading: boolean;
  loadError: string | null;
  onSelect: (r: Record) => void;
  onView: (r: Record) => void;
}> = ({ orders: all, loading, loadError, onSelect, onView }) => {
  const [search, setSearch] = useState('');
  const [ffFilter, setFfFilter] = useState<'all' | 'sent' | 'unsent'>('all');
  const [factoryFilter, setFactoryFilter] = useState('all');

  const orders = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = all.filter(r => r.kind === 'order' && r.details);
    if (ffFilter === 'sent') list = list.filter(isSent);
    if (ffFilter === 'unsent') list = list.filter(r => !isSent(r));
    if (factoryFilter !== 'all') {
      const prefix = FF_FACTORIES.find(f => f.key === factoryFilter)?.prefix || '';
      list = list.filter(r => (r.ff_code || '').startsWith(prefix));
    }
    if (q) {
      list = list.filter(r =>
        (r.order_id || '').toLowerCase().includes(q) ||
        (r.details?.items || []).some(i => (i.name || '').toLowerCase().includes(q))
      );
    }
    return [...list]
      .sort((a, b) => new Date(b.dt_local).getTime() - new Date(a.dt_local).getTime())
      .slice(0, 200);
  }, [all, search, ffFilter, factoryFilter]);

  return (
    <div className={cardCls}>
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">Select order to fulfill</h3>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          className={`${inputCls} max-w-xs`}
          placeholder="Order ID or product"
        />
        <select
          value={ffFilter}
          onChange={e => {
            const v = e.target.value as 'all' | 'sent' | 'unsent';
            setFfFilter(v);
            if (v === 'unsent') setFactoryFilter('all');
          }}
          className={`${inputCls} max-w-[160px]`}
        >
          <option value="all">All orders</option>
          <option value="unsent">Not fulfilled</option>
          <option value="sent">Fulfilled</option>
        </select>
        <select
          value={factoryFilter}
          onChange={e => {
            setFactoryFilter(e.target.value);
            if (e.target.value !== 'all' && ffFilter === 'unsent') setFfFilter('all');
          }}
          className={`${inputCls} max-w-[160px]`}
        >
          <option value="all">All factories</option>
          {FF_FACTORIES.map(f => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-700/60 max-h-[560px] overflow-y-auto">
        {orders.map(r => {
          const item = r.details?.items?.[0];
          const sent = /^(LMX|MGO|VNW|MKP|DSH|HPE|HGT)-/.test(r.ff_code || '');
          return (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer" onClick={() => onView(r)}>
              {item?.image ? (
                <img src={item.image} alt="" className="w-10 h-10 rounded object-cover border border-gray-200 dark:border-gray-600" />
              ) : (
                <div className="w-10 h-10 rounded bg-gray-100 dark:bg-gray-700" />
              )}
              <div className="flex-grow min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  #{r.order_id} — {item?.name || r.product_name || ''}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {(r.details?.items || []).length} item{(r.details?.items || []).length !== 1 ? 's' : ''} • {new Date(r.dt_local).toLocaleDateString('en-US')}
                </p>
              </div>
              <StatusBadge status={r.order_status} />
              {sent && <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{r.ff_code}</span>}
              <button
                onClick={(e) => { e.stopPropagation(); onSelect(r); }}
                className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md whitespace-nowrap"
              >
                {sent ? 'Re-open' : 'Fulfill'}
              </button>
            </div>
          );
        })}
        {loading && <p className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">Loading orders…</p>}
        {!loading && loadError && <p className="px-4 py-10 text-center text-sm text-red-600 dark:text-red-400">{loadError}</p>}
        {!loading && !loadError && orders.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">No orders</p>
        )}
      </div>
    </div>
  );
};

// ==============================
// Step 2: create-order form
// ==============================

interface PrintFileRow {
  key: string;
  url: string;
  url_emb: string;
  url_pes: string;
  embroidery_type: string;
  size: string;
  is_no_design: boolean;
}

interface ItemState {
  productName: string;
  quantity: number;
  externalId: string;
  note: string;
  mockup: string;
  mockupBack: string;
  line: LemiexLine;
  style: string;
  color: string;
  size: string;
  variantId: string;
  resolving: boolean;
  resolveError: string;
  printFiles: PrintFileRow[];
}

const newPrintFile = (): PrintFileRow => ({
  key: 'front', url: '', url_emb: '', url_pes: '', embroidery_type: '', size: '', is_no_design: false,
});

const CreateOrderForm: React.FC<{ record: Record; onBack: () => void }> = ({ record, onBack }) => {
  const { setRecords } = useDashboard();
  const addr = record.details?.shippingAddress;

  // ---- catalog caches shared by all items ----
  const cacheRef = useRef(new Map<string, string[]>());
  const cachedFetch = useCallback(async (key: string, fetcher: () => Promise<string[]>): Promise<string[]> => {
    const hit = cacheRef.current.get(key);
    if (hit) return hit;
    const val = await fetcher().catch(() => [] as string[]);
    cacheRef.current.set(key, val);
    return val;
  }, []);

  const [embTypes, setEmbTypes] = useState<string[]>([]);
  const [priorities, setPriorities] = useState<string[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    getLemiexEmbroideryTypes().then(setEmbTypes).catch(() => setEmbTypes([]));
    getLemiexPriorities().then(setPriorities).catch(() => setPriorities([]));
    getLemiexStyles('embroidery').catch((e: any) => setCatalogError(e?.message || 'Cannot reach Lemiex'));
  }, []);

  // ---- shipping / order-level state (Etsy orders are always seller_ship) ----
  const [address, setAddress] = useState({
    name: addr?.name || record.details?.customerName || '',
    phone: '',
    street1: addr?.address1 || '',
    street2: addr?.address2 || '',
    city: addr?.city || '',
    state: addr?.state || '',
    zip: addr?.zip || '',
    country: addr?.country || 'US',
  });
  const [shippingMethod, setShippingMethod] = useState('standard');
  const [shippingService, setShippingService] = useState('USPS');
  const [priority, setPriority] = useState('normal');
  const [productType, setProductType] = useState('Shirt');
  const [note, setNote] = useState('');

  // ---- line items ----
  const [items, setItems] = useState<ItemState[]>(() =>
    (record.details?.items || []).map((i, idx) => ({
      productName: i.name || '',
      quantity: Number((i as any).quantity) || 1,
      externalId: `${record.order_id || record.id}-${idx + 1}`,
      note: (i as any).personalization ? String((i as any).personalization) : '',
      mockup: i.image || '',
      mockupBack: '',
      line: 'embroidery' as LemiexLine,
      style: '', color: '', size: '',
      variantId: '', resolving: false, resolveError: '',
      printFiles: [newPrintFile()],
    }))
  );

  const patchItem = useCallback((idx: number, patch: Partial<ItemState>) => {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }, []);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ order_id: number; existed: boolean } | null>(null);

  const handleSubmit = async () => {
    setSubmitError(null);

    for (const [i, it] of items.entries()) {
      if (!it.variantId.trim()) return setSubmitError(`Item ${i + 1}: variant is not selected`);
      if (!it.quantity || it.quantity < 1) return setSubmitError(`Item ${i + 1}: invalid quantity`);
    }
    for (const k of ['name', 'street1', 'city', 'state', 'zip', 'country'] as const) {
      if (!address[k].trim()) return setSubmitError(`Address: ${k} is required`);
    }
    if (!record.order_id) return setSubmitError('This record has no order id (ref_id)');

    const payload: LemiexOrderPayload = {
      order_type: 'seller_ship',
      ref_id: String(record.order_id),
      seller_ref: String(record.order_id),
      order_status: 'new_order',
      shipping_method: shippingMethod,
      shipping_service: shippingService,
      shipping_label: null,
      fulfillment_priority: priority,
      note: note.trim() || undefined,
      product_type: productType,
      address,
      line_items: items.map((it): any => ({
        variant_id: it.variantId.trim(),
        external_item_id: it.externalId.trim(),
        note: it.note.trim() || undefined,
        product_name: it.productName,
        quantity: it.quantity,
        mockup: it.mockup.trim() || null,
        mockup_back: it.mockupBack.trim() || null,
        print_files: it.printFiles
          .filter(f => f.url || f.url_emb || f.url_pes)
          .map((f): LemiexPrintFile => ({
            key: f.key,
            url: f.url.trim() || null,
            url_emb: f.url_emb.trim() || null,
            url_pes: f.url_pes.trim() || null,
            embroidery_type: f.embroidery_type || null,
            is_no_design: f.is_no_design,
            ...(f.size ? { size: f.size } : {}),
          })),
      })),
    };

    setSubmitting(true);
    try {
      const resp = await createLemiexOrder(record.id!, payload);
      setResult({ order_id: resp.order_id, existed: resp.existed });
      setRecords(prev => prev.map(r => r.id === record.id
        ? { ...r, ff_code: resp.ff_code || `LMX-${resp.order_id}`, order_status: resp.order_status || r.order_status }
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
          {result.existed ? 'Order already exists on Lemiex' : 'Order created on Lemiex'}
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          Lemiex order: <span className="font-mono">LMX-{result.order_id}</span> — record #{record.order_id} set to Producing.
        </p>
        <button onClick={onBack} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold text-sm">
          Back to orders
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <FulfillOrderHeader record={record} onBack={onBack} />

      {catalogError && (
        <div className={`${cardCls} p-4 text-sm text-red-600 dark:text-red-400`}>{catalogError}</div>
      )}

      {/* Items */}
      {items.map((it, idx) => (
        <ItemEditor
          key={idx}
          idx={idx}
          item={it}
          embTypes={embTypes}
          patch={patchItem}
          cachedFetch={cachedFetch}
        />
      ))}

      {/* Shipping */}
      <div className={`${cardCls} p-4 space-y-5`}>
        <div>
          <p className={`${sectionTitleCls} mb-3`}>Shipping</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className={labelCls}>Method</label>
              <input value={shippingMethod} onChange={e => setShippingMethod(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Service</label>
              <input value={shippingService} onChange={e => setShippingService(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)} className={inputCls}>
                {(priorities.length ? priorities : ['normal']).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Product type</label>
              <input value={productType} onChange={e => setProductType(e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>

        <div>
          <p className={`${sectionTitleCls} mb-3`}>Customer address</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              ['name', 'Name'], ['phone', 'Phone'], ['street1', 'Street 1'], ['street2', 'Street 2'],
              ['city', 'City'], ['state', 'State'], ['zip', 'Zip'], ['country', 'Country'],
            ] as [keyof typeof address, string][]).map(([k, label]) => (
              <div key={k}>
                <label className={labelCls}>{label}</label>
                <input
                  value={address[k]}
                  onChange={e => setAddress(prev => ({ ...prev, [k]: e.target.value }))}
                  className={inputCls}
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className={`${sectionTitleCls} mb-3`}>Note</p>
          <input value={note} onChange={e => setNote(e.target.value)} className={inputCls} />
        </div>
      </div>

      {/* Submit */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold text-sm disabled:opacity-50 flex items-center gap-2"
        >
          {submitting && <Spinner size="sm" color="text-white" />}
          {submitting ? 'Sending…' : 'Create Lemiex order'}
        </button>
        {submitError && <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>}
      </div>
    </div>
  );
};

// ==============================
// Per-item editor (variant steps + design files)
// ==============================

const ItemEditor: React.FC<{
  idx: number;
  item: ItemState;
  embTypes: string[];
  patch: (idx: number, p: Partial<ItemState>) => void;
  cachedFetch: (key: string, fetcher: () => Promise<string[]>) => Promise<string[]>;
}> = ({ idx, item, embTypes, patch, cachedFetch }) => {
  // Holds the setter the Products picker should write the chosen URL into.
  const [pickTarget, setPickTarget] = useState<{ apply: (url: string) => void } | null>(null);
  const [styles, setStyles] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);

  useEffect(() => {
    cachedFetch(item.line, () => getLemiexStyles(item.line)).then(setStyles);
  }, [item.line, cachedFetch]);

  useEffect(() => {
    if (!item.style) { setColors([]); return; }
    cachedFetch(`${item.line}|${item.style}`, () => getLemiexColors(item.line, item.style)).then(setColors);
  }, [item.line, item.style, cachedFetch]);

  useEffect(() => {
    if (!item.style || !item.color) { setSizes([]); return; }
    cachedFetch(`${item.line}|${item.style}|${item.color}`, () => getLemiexSizes(item.line, item.style, item.color)).then(setSizes);
  }, [item.line, item.style, item.color, cachedFetch]);

  // Resolve variant_id when the cascade is complete
  useEffect(() => {
    if (!item.style || !item.color || !item.size) return;
    let cancelled = false;
    patch(idx, { resolving: true, resolveError: '' });
    getLemiexVariants(item.line, { style: item.style, color: item.color, size: item.size, per_page: 1 })
      .then(({ variants }) => {
        if (cancelled) return;
        if (variants[0]?.variant_id) {
          patch(idx, { variantId: variants[0].variant_id, resolving: false, resolveError: '' });
        } else {
          patch(idx, { variantId: '', resolving: false, resolveError: 'No variant found for this combination' });
        }
      })
      .catch((e: any) => {
        if (!cancelled) patch(idx, { resolving: false, resolveError: e?.message || 'Variant lookup failed' });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.line, item.style, item.color, item.size]);

  const patchFile = (fi: number, p: Partial<PrintFileRow>) => {
    patch(idx, { printFiles: item.printFiles.map((f, i) => (i === fi ? { ...f, ...p } : f)) });
  };

  const canRemoveFile = item.printFiles.length > 1;

  return (
    <div className={`${cardCls} p-4`}>
      {/* Item header */}
      <div className="flex items-center gap-3 pb-3 border-b border-gray-100 dark:border-gray-700/60">
        {item.mockup ? (
          <img src={item.mockup} alt="" className="w-11 h-11 rounded object-cover border border-gray-200 dark:border-gray-600" />
        ) : (
          <div className="w-11 h-11 rounded bg-gray-100 dark:bg-gray-700" />
        )}
        <div className="flex-grow min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate" title={item.productName}>
            {idx + 1}. {item.productName}
          </p>
          {item.note && <p className="text-xs text-gray-500 dark:text-gray-400 truncate" title={item.note}>{item.note}</p>}
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

      {/* Variant steps */}
      <div className="py-3 border-b border-gray-100 dark:border-gray-700/60">
        <p className={`${sectionTitleCls} mb-2`}>Variant</p>
        <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end">
          <div className="md:col-span-2">
            <label className={labelCls}>Line</label>
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-md p-0.5 h-[38px]">
              {(['embroidery', 'print'] as LemiexLine[]).map(l => (
                <button
                  key={l}
                  onClick={() => patch(idx, { line: l, style: '', color: '', size: '', variantId: '', resolveError: '' })}
                  className={`flex-1 px-1.5 rounded text-xs font-medium transition-colors ${item.line === l
                    ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-300 shadow-sm'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'}`}
                >
                  {l === 'embroidery' ? 'Emb' : 'Print'}
                </button>
              ))}
            </div>
          </div>
          <div className="md:col-span-4">
            <label className={labelCls}>Style</label>
            <select value={item.style} onChange={e => patch(idx, { style: e.target.value, color: '', size: '', variantId: '', resolveError: '' })} className={inputCls}>
              <option value="">Select</option>
              {styles.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Color</label>
            <select value={item.color} onChange={e => patch(idx, { color: e.target.value, size: '', variantId: '', resolveError: '' })} className={inputCls} disabled={!item.style}>
              <option value="">Select</option>
              {colors.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Size</label>
            <select value={item.size} onChange={e => patch(idx, { size: e.target.value, variantId: '', resolveError: '' })} className={inputCls} disabled={!item.color}>
              <option value="">Select</option>
              {sizes.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Variant ID</label>
            <div className="relative">
              <input
                value={item.variantId}
                onChange={e => patch(idx, { variantId: e.target.value })}
                className={`${inputCls} font-mono ${item.variantId ? 'border-green-400 dark:border-green-600' : ''}`}
              />
              {item.resolving && <div className="absolute right-2 top-2.5"><Spinner size="xs" /></div>}
            </div>
          </div>
        </div>
        {item.resolveError && <p className="text-xs text-red-600 dark:text-red-400 mt-2">{item.resolveError}</p>}
      </div>

      {/* Mockups */}
      <div className="py-3 border-b border-gray-100 dark:border-gray-700/60">
        <p className={`${sectionTitleCls} mb-2`}>Mockups</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <DesignUrlField
            label="Front"
            value={item.mockup}
            onChange={v => patch(idx, { mockup: v })}
            onPick={() => setPickTarget({ apply: (url: string) => patch(idx, { mockup: url }) })}
            placeholder="https://…"
          />
          <DesignUrlField
            label="Back"
            value={item.mockupBack}
            onChange={v => patch(idx, { mockupBack: v })}
            onPick={() => setPickTarget({ apply: (url: string) => patch(idx, { mockupBack: url }) })}
            placeholder="https://…"
          />
        </div>
      </div>

      {/* Design files */}
      <div className="pt-3">
        <div className="flex items-center justify-between mb-2">
          <p className={sectionTitleCls}>Design files</p>
          <button
            onClick={() => patch(idx, { printFiles: [...item.printFiles, { ...newPrintFile(), key: 'back' }] })}
            className="px-2.5 py-1 text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Add position
          </button>
        </div>
        <div className="space-y-2">
          {item.printFiles.map((f, fi) => (
            <div key={fi} className="bg-gray-50 dark:bg-gray-700/40 rounded-md p-2 space-y-2">
              {/* Attributes first, then the three design URLs on their own row so
                  each input keeps a third of the width next to its Pick button. */}
              <div className="grid grid-cols-2 md:grid-cols-[130px_1fr_110px_auto] gap-2 items-end">
                <div>
                  <label className={labelCls}>Position</label>
                  <select value={f.key} onChange={e => patchFile(fi, { key: e.target.value })} className={inputCls}>
                    {PRINT_POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Thread</label>
                  <select value={f.embroidery_type} onChange={e => patchFile(fi, { embroidery_type: e.target.value })} className={inputCls}>
                    <option value="">—</option>
                    {embTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Size</label>
                  <input value={f.size} onChange={e => patchFile(fi, { size: e.target.value })} className={inputCls} placeholder="7x7" />
                </div>
                {canRemoveFile && (
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <DesignUrlField
                  label="DST URL"
                  value={f.url}
                  onChange={v => patchFile(fi, { url: v })}
                  onPick={() => setPickTarget({ apply: (url: string) => patchFile(fi, { url }) })}
                />
                <DesignUrlField
                  label="EMB URL"
                  value={f.url_emb}
                  onChange={v => patchFile(fi, { url_emb: v })}
                  onPick={() => setPickTarget({ apply: (url: string) => patchFile(fi, { url_emb: url }) })}
                />
                <DesignUrlField
                  label="PES URL"
                  value={f.url_pes}
                  onChange={v => patchFile(fi, { url_pes: v })}
                  onPick={() => setPickTarget({ apply: (url: string) => patchFile(fi, { url_pes: url }) })}
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

// ==============================
// Panel root (URL-backed: ?lmx={recordId})
// ==============================

const LemiexPanel: React.FC = () => {
  const { role } = useDashboard();
  const isOwner = role === 'owner';
  const [searchParams, setSearchParams] = useSearchParams();
  const lmxId = searchParams.get('lmx');

  const [settings, setSettings] = useState<LemiexSettingsInfo | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [orders, setOrders] = useState<Record[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<Record | null>(null);
  const [detailRecord, setDetailRecord] = useState<Record | null>(null);

  useEffect(() => {
    if (!isOwner) { setSettingsLoaded(true); return; }
    getLemiexSettings()
      .then(setSettings)
      .catch(() => setSettings(null))
      .finally(() => setSettingsLoaded(true));
  }, [isOwner]);

  useEffect(() => {
    // Warm slow factory catalogs (Mango /products ≈ 6s) while the user is
    // still picking an order.
    prefetchFactoryCatalogs();
  }, []);

  // Order list follows the global date filter; falls back to latest 100 when
  // no range is set.
  const { filterDateRange, timeZone } = useUI();
  useEffect(() => {
    let cancelled = false;
    setOrdersLoading(true);
    setOrdersError(null);
    const load = filterDateRange?.from && filterDateRange?.to
      ? getRecordsForDateRange('', filterDateRange.from, filterDateRange.to, timeZone)
      : getRecentOrderRecords(100);
    load
      .then(rs => { if (!cancelled) setOrders(rs); })
      .catch((e: any) => { if (!cancelled) setOrdersError(e?.message || 'Failed to load orders'); })
      .finally(() => { if (!cancelled) setOrdersLoading(false); });
    return () => { cancelled = true; };
  }, [filterDateRange?.from, filterDateRange?.to, timeZone]);

  // Resolve the ?lmx= record — from the fetched list, else fetch by id (F5 deep link)
  useEffect(() => {
    if (!lmxId) { setSelectedRecord(null); return; }
    if (selectedRecord?.id === lmxId) return;
    const inList = orders.find(r => r.id === lmxId);
    if (inList) { setSelectedRecord(inList); return; }
    if (!ordersLoading) {
      getRecordById(lmxId).then(r => setSelectedRecord(r));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lmxId, orders, ordersLoading]);

  const openOrder = useCallback((r: Record) => {
    const next = new URLSearchParams(searchParams);
    next.set('lmx', r.id!);
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const goBack = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('lmx');
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  // Factory provider for the open form — URL-backed (?fp=..., default lemiex)
  type Fp = 'lemiex' | 'mango' | 'vinaway' | 'monkeyking' | 'dreamship' | 'hongphat' | 'hogoto';
  const fpRaw = searchParams.get('fp');
  const fp: Fp = fpRaw === 'mango' || fpRaw === 'vinaway' || fpRaw === 'monkeyking' || fpRaw === 'dreamship' || fpRaw === 'hongphat' || fpRaw === 'hogoto' ? fpRaw : 'lemiex';
  const setFp = useCallback((v: Fp) => {
    const next = new URLSearchParams(searchParams);
    if (v === 'lemiex') next.delete('fp'); else next.set('fp', v);
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  if (!settingsLoaded) {
    return <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading…</div>;
  }

  return (
    <div className="space-y-4">
      {isOwner && !lmxId && (
        <div className="flex justify-end">
          <button onClick={() => setShowSettings(true)} className="px-3 py-1.5 text-sm font-medium bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-500 text-gray-700 dark:text-white rounded-md hover:bg-gray-50 dark:hover:bg-gray-600">
            Settings
          </button>
        </div>
      )}

      {lmxId ? (
        selectedRecord ? (
          <>
            {/* Factory selector */}
            <div className="inline-flex flex-wrap bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
              {([
                { key: 'lemiex', label: 'Lemiex' },
                { key: 'mango', label: 'MangoTee' },
                { key: 'vinaway', label: 'Vinaway' },
                { key: 'monkeyking', label: 'MonkeyKing' },
                { key: 'dreamship', label: 'Dreamship' },
                { key: 'hongphat', label: 'HongPhat' },
                { key: 'hogoto', label: 'Hogoto' },
              ] as { key: Fp; label: string }[]).map(t => (
                <button
                  key={t.key}
                  onClick={() => setFp(t.key)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${fp === t.key
                    ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-300 shadow-sm'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {fp === 'mango' ? (
              <MangoOrderForm key={`m-${selectedRecord.id}`} record={selectedRecord} onBack={goBack} />
            ) : fp === 'vinaway' ? (
              <VinawayOrderForm key={`v-${selectedRecord.id}`} record={selectedRecord} onBack={goBack} />
            ) : fp === 'monkeyking' ? (
              <MonkeyKingOrderForm key={`k-${selectedRecord.id}`} record={selectedRecord} onBack={goBack} />
            ) : fp === 'dreamship' ? (
              <DreamshipOrderForm key={`d-${selectedRecord.id}`} record={selectedRecord} onBack={goBack} />
            ) : fp === 'hongphat' ? (
              <HongPhatOrderForm key={`h-${selectedRecord.id}`} record={selectedRecord} onBack={goBack} />
            ) : fp === 'hogoto' ? (
              <HogotoOrderForm key={`g-${selectedRecord.id}`} record={selectedRecord} onBack={goBack} />
            ) : (
              <CreateOrderForm key={`l-${selectedRecord.id}`} record={selectedRecord} onBack={goBack} />
            )}
          </>
        ) : (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading order…</div>
        )
      ) : (
        <OrderPicker orders={orders} loading={ordersLoading} loadError={ordersError} onSelect={openOrder} onView={setDetailRecord} />
      )}

      {showSettings && (
        <LemiexSettingsModal info={settings} onClose={() => setShowSettings(false)} onSaved={setSettings} />
      )}

      {detailRecord && (
        <OrderDetailModal record={detailRecord} onClose={() => setDetailRecord(null)} hideFinancials={role === 'design'} />
      )}
    </div>
  );
};

export default LemiexPanel;
