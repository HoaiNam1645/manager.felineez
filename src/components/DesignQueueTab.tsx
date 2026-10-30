import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import CachedImage from './datatable/CachedImage';
import { Record as OrderRecord } from '../types';
import { getHighResImageUrl } from '../utils/imageUtils';
import { decodeHTMLEntities } from '../utils/htmlDecode';
import { ORDER_STATUS_CLASSES, ORDER_STATUS_LABELS } from '../constants/orderStatus';
import { Product, fetchAllProducts } from '../services/productService';
import { updateOrderFields } from '../services/firebaseService';
import { useDashboard } from '../contexts/DashboardContext';
import { useNotification } from '../contexts/NotificationContext';
import { DesignType, designRequestsOf, designTypeForItem, designTypesOf, hasDesignRequestForItem, makeDesignItemKey, preferredDesignProduct } from '../utils/designItems';
import { captureProductsReturnState } from '../utils/productReturnState';

type DesignView = 'missing' | 'team' | 'outsource';
const DESIGN_OVERDUE_MS = 2 * 24 * 60 * 60 * 1000;
const TERMINAL_STATUSES = new Set(['SHIPPED', 'CANCELLED', 'REFUND']);

type DesignTask = {
  key: string;
  recordId: string;
  orderId: string;
  productName: string;
  variant: string;
  personalization: string;
  quantity: number;
  image?: string;
  account: string;
  status: string;
  dtLocal: string;
  designItemKey: string;
  designType: DesignType | null;
  requested: boolean;
  match?: Product;
};

const fmtTime = (iso: string, timeZone: string) => {
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

const formatOverdueTime = (milliseconds: number): string => {
  const hours = Math.max(1, Math.floor(milliseconds / (60 * 60 * 1000)));
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (days === 0) return `${hours} giờ`;
  return remainingHours > 0 ? `${days} ngày ${remainingHours} giờ` : `${days} ngày`;
};

const DesignQueueTab: React.FC<{
  records: OrderRecord[];
  timeZone: string;
  onViewOrderDetails: (recordId: string) => void;
}> = ({ records, timeZone, onViewOrderDetails }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setRecords } = useDashboard();
  const { addNotification } = useNotification();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [activeView, setActiveView] = useState<DesignView>('missing');
  const [search, setSearch] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [pendingTask, setPendingTask] = useState<DesignTask | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [designClock, setDesignClock] = useState(() => Date.now());

  const tasks = useMemo<DesignTask[]>(() => records
    .filter((record) => record.kind === 'order' && record.id && record.order_id)
    .flatMap((record) => {
      const items = record.details?.items?.length
        ? record.details.items
        : [{ name: record.product_name || 'Untitled product', variant: '', personalization: '', quantity: 1, image: undefined }];

      return items.map((item, index) => {
        const designItemKey = makeDesignItemKey(record.id, index);
        return {
          key: `${record.id}-${index}`,
          recordId: record.id!,
          orderId: record.order_id || 'N/A',
          productName: decodeHTMLEntities(item.name || record.product_name || 'Untitled product'),
          variant: decodeHTMLEntities(item.variant || ''),
          personalization: item.personalization || '',
          quantity: item.quantity || 1,
          image: getHighResImageUrl(item.image),
          account: record.account,
          status: record.order_status || 'NEW',
          dtLocal: record.dt_local,
          designItemKey,
          designType: designTypeForItem(record.details, designItemKey),
          requested: hasDesignRequestForItem(record.details, designItemKey),
        };
      });
    }), [records]);

  useEffect(() => {
    let cancelled = false;
    fetchAllProducts(1000)
      .then((items) => { if (!cancelled) setProducts(items); })
      .catch(() => { if (!cancelled) setProducts([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setDesignClock(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const tasksWithFolders = useMemo(() => tasks.map((task) => {
    const match = preferredDesignProduct(products || [], task.designItemKey);
    const createdAt = match?.createdAt ? new Date(match.createdAt).getTime() : NaN;
    const overdueMs = match && (match.images?.length || 0) === 0 && !TERMINAL_STATUSES.has(task.status) && Number.isFinite(createdAt)
      ? Math.max(0, designClock - createdAt - DESIGN_OVERDUE_MS)
      : 0;
    return { ...task, match, overdueMs };
  }), [tasks, products, designClock]);

  const missingTasks = useMemo(() => tasksWithFolders.filter((task) => task.status === 'NEW' && !task.match), [tasksWithFolders]);
  const teamTasks = useMemo(() => tasksWithFolders.filter((task) => task.designType === 'TEAM'), [tasksWithFolders]);
  const outsourceTasks = useMemo(() => tasksWithFolders.filter((task) => task.designType === 'OUTSOURCE'), [tasksWithFolders]);

  const activeTasks = activeView === 'missing' ? missingTasks : activeView === 'team' ? teamTasks : outsourceTasks;
  const visibleTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return activeTasks
      .filter((task) => !query || task.orderId.toLowerCase().includes(query) || task.productName.toLowerCase().includes(query) || task.account.toLowerCase().includes(query))
      .sort((a, b) => new Date(b.dtLocal).getTime() - new Date(a.dtLocal).getTime());
  }, [activeTasks, search]);

  const openDesign = (task: DesignTask) => {
    const returnPath = `${location.pathname}${location.search}${location.hash}`;
    captureProductsReturnState(returnPath);
    const params = new URLSearchParams({ designOrder: task.recordId, designItem: task.designItemKey });
    if (task.match) {
      navigate(`/products/c/${task.match.categoryId || 'uncategorized'}/f/${task.match.id}?${params.toString()}`, { state: { from: returnPath } });
      return;
    }
    navigate(`/products?design=${encodeURIComponent(task.productName)}&${params.toString()}`, { state: { from: returnPath } });
  };

  const assignDesign = async (task: DesignTask, designType: DesignType) => {
    const record = records.find((item) => item.id === task.recordId);
    if (!record) return;
    setAssigning(true);
    try {
      const previousRequests = designRequestsOf(record.details);
      const previousTypes = designTypesOf(record.details);
      const previousOrderNote = String((record.details as any)?.orderNote || '').trim();
      const outsourceOrderNote = previousOrderNote.toLocaleLowerCase('vi').includes('des làm ngoài')
        ? previousOrderNote
        : [previousOrderNote, 'des làm ngoài'].filter(Boolean).join('\n');
      const now = new Date().toISOString();
      const details = {
        ...((record.details || {}) as any),
        designRequestedAt: now,
        designRequests: { ...previousRequests, [task.designItemKey]: now },
        designTypes: { ...previousTypes, [task.designItemKey]: designType },
        ...(designType === 'OUTSOURCE' ? { orderNote: outsourceOrderNote } : {}),
      };
      await updateOrderFields(task.recordId, { details });
      setRecords((current) => current.map((item) => item.id === task.recordId ? { ...item, details } : item));
      setPendingTask(null);
      openDesign({ ...task, designType });
    } catch (error) {
      console.error('Failed to assign design:', error);
      addNotification('Không thể phân loại Design. Vui lòng thử lại.', 'error');
    } finally {
      setAssigning(false);
    }
  };

  const views: { key: DesignView; label: string; description: string; count: number; tone: string; activeTone: string }[] = [
    { key: 'missing', label: 'New chưa có Design', description: 'Đơn New chưa tạo folder', count: missingTasks.length, tone: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200', activeTone: 'ring-2 ring-rose-500' },
    { key: 'team', label: 'Team làm', description: 'Design do team phụ trách', count: teamTasks.length, tone: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200', activeTone: 'ring-2 ring-blue-500' },
    { key: 'outsource', label: 'Làm ngoài', description: 'Design giao bên ngoài', count: outsourceTasks.length, tone: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200', activeTone: 'ring-2 ring-amber-500' },
  ];

  return (
    <div className="min-h-full bg-slate-50 p-4 dark:bg-gray-900 md:p-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-sky-100 bg-gradient-to-r from-sky-50 via-white to-cyan-50 px-5 py-6 text-slate-900 dark:border-gray-700 dark:from-gray-800 dark:via-gray-800 dark:to-cyan-950/40 dark:text-white md:px-7">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-700 dark:text-cyan-300">Design workspace</p>
            <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="text-2xl font-black tracking-tight md:text-3xl">Quản lý Design</h1>
                <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">Theo dõi đơn New chưa có Design và phân loại khối lượng Team làm / Làm ngoài trên cùng một màn hình.</p>
              </div>
              <div className="relative w-full lg:w-80">
                <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm order, sản phẩm, shop..." className="h-10 w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:ring-blue-900/40" />
              </div>
            </div>
          </div>

          <div className="grid gap-3 p-4 md:grid-cols-3 md:p-6">
            {views.map((view) => (
              <button key={view.key} type="button" onClick={() => setActiveView(view.key)} className={`rounded-md border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${view.tone} ${activeView === view.key ? view.activeTone : ''}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold">{view.label}</p>
                    <p className="mt-1 text-xs opacity-70">{view.description}</p>
                  </div>
                  <span className="text-3xl font-black tabular-nums">{view.count}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">{views.find((view) => view.key === activeView)?.label}</h2>
            <p className="text-sm text-slate-500 dark:text-gray-400">Đang hiển thị {visibleTasks.length} item</p>
          </div>
          {search && <button type="button" onClick={() => setSearch('')} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">Xóa tìm kiếm</button>}
        </div>

        {products === null ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="h-56 animate-pulse rounded-md bg-slate-200 dark:bg-gray-800" />)}
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 bg-white px-6 py-16 text-center dark:border-gray-700 dark:bg-gray-800">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl dark:bg-emerald-900/30">✓</div>
            <p className="mt-4 font-bold text-slate-900 dark:text-white">Không có item trong nhóm này</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">Thử đổi nhóm hoặc xóa nội dung tìm kiếm.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleTasks.map((task) => {
              const statusClass = ORDER_STATUS_CLASSES[task.status] || ORDER_STATUS_CLASSES.NEW;
              return (
                <article key={task.key} className={`group overflow-hidden rounded-md border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:bg-gray-800 ${task.overdueMs > 0 ? 'border-red-400 ring-1 ring-red-200 hover:border-red-500 dark:border-red-700 dark:ring-red-900/60' : 'border-slate-200 hover:border-slate-300 dark:border-gray-700'}`}>
                  <div className="flex gap-4 p-4">
                    {task.image ? (
                      <CachedImage src={task.image} alt={task.productName} onClick={() => setPreviewImage(task.image || null)} className="h-24 w-24 shrink-0 cursor-zoom-in rounded-md border border-slate-200 object-cover dark:border-gray-600" />
                    ) : (
                      <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-400 dark:bg-gray-700">NO IMAGE</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <button type="button" onClick={() => onViewOrderDetails(task.recordId)} className="font-mono text-xs font-bold text-blue-600 hover:underline dark:text-blue-400">#{task.orderId}</button>
                        <div className="flex flex-wrap justify-end gap-1">
                          {task.overdueMs > 0 && <span className="rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-700 dark:bg-red-900/60 dark:text-red-300">TRỄ DES</span>}
                          <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${statusClass}`}>{ORDER_STATUS_LABELS[task.status] || task.status}</span>
                        </div>
                      </div>
                      <h3 className="mt-2 line-clamp-2 text-sm font-bold leading-5 text-slate-900 dark:text-white" title={task.productName}>{task.productName}</h3>
                      <p className="mt-1 truncate text-xs text-slate-500 dark:text-gray-400">{task.account} · SL {task.quantity}</p>
                    </div>
                  </div>
                  <div className="space-y-1 border-t border-slate-100 px-4 py-3 text-xs dark:border-gray-700">
                    {task.overdueMs > 0 && (
                      <div className="mb-2 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 font-bold text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300">
                        <span>⚠ Design đang làm trễ</span>
                        <span className="shrink-0">{formatOverdueTime(task.overdueMs)}</span>
                      </div>
                    )}
                    {task.variant && <p className="line-clamp-2 text-slate-500 dark:text-gray-400">{task.variant}</p>}
                    {task.personalization && <p className="line-clamp-2 font-semibold text-amber-700 dark:text-amber-300">{task.personalization}</p>}
                    <div className="flex items-center justify-between gap-3 pt-1 text-slate-400">
                      <span>{fmtTime(task.dtLocal, timeZone)}</span>
                      <span className={`rounded-full px-2 py-0.5 font-bold ${task.match ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'}`}>{task.match ? 'Đã có folder' : 'Chưa có folder'}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 border-t border-slate-100 p-3 dark:border-gray-700">
                    <button type="button" onClick={() => onViewOrderDetails(task.recordId)} className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">Xem đơn</button>
                    <button type="button" onClick={() => task.designType ? openDesign(task) : setPendingTask(task)} className="flex-1 rounded-md bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500">{task.designType ? (task.match ? 'Mở Design' : 'Tạo Design') : 'Phân loại Des'}</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {pendingTask && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={() => !assigning && setPendingTask(null)}>
          <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-800" onClick={(event) => event.stopPropagation()}>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Phân loại Design</p>
            <h3 className="mt-2 text-lg font-black text-slate-900 dark:text-white">Ai sẽ làm Design này?</h3>
            <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-gray-400">#{pendingTask.orderId} · {pendingTask.productName}</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" disabled={assigning} onClick={() => void assignDesign(pendingTask, 'TEAM')} className="rounded-md border border-blue-200 bg-blue-50 px-4 py-4 text-sm font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">Team làm</button>
              <button type="button" disabled={assigning} onClick={() => void assignDesign(pendingTask, 'OUTSOURCE')} className="rounded-md border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Làm ngoài</button>
            </div>
            <button type="button" disabled={assigning} onClick={() => setPendingTask(null)} className="mt-3 w-full rounded-md px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700">Hủy</button>
          </div>
        </div>
      )}

      {previewImage && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-4" onClick={() => setPreviewImage(null)}>
          <img src={previewImage} alt="" className="max-h-full max-w-full rounded-md object-contain" />
        </div>
      )}
    </div>
  );
};

export default DesignQueueTab;
