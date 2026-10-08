import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import CachedImage from './datatable/CachedImage';
import { Record as OrderRecord } from '../types';
import { getHighResImageUrl } from '../utils/imageUtils';
import { decodeHTMLEntities } from '../utils/htmlDecode';
import { ORDER_STATUS_CLASSES, ORDER_STATUS_LABELS } from '../constants/orderStatus';
import { Product, fetchAllProducts } from '../services/productService';
import { useNotification } from '../contexts/NotificationContext';
import { hasDesignRequestForItem, makeDesignItemKey, productMatchesDesignItem } from '../utils/designItems';
import { captureProductsReturnState } from '../utils/productReturnState';

type DesignTask = {
  key: string;
  recordId: string;
  orderId: string;
  productName: string;
  variant: string;
  personalization: string;
  quantity: number;
  image?: string;
  fullImage?: string;
  account: string;
  status: string;
  dtLocal: string;
  designItemKey: string;
};

const ACTIVE_STATUSES = new Set(['DESIGN_REQUESTED', 'DESIGNING']);
const statusLabel = (status: string) => status === 'DESIGN_REQUESTED' ? 'Design' : ORDER_STATUS_LABELS[status] || status;

const fmtTime = (iso: string, timeZone: string) => {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

const DesignQueueTab: React.FC<{
  records: OrderRecord[];
  timeZone: string;
  onViewOrderDetails: (recordId: string) => void;
}> = ({ records, timeZone, onViewOrderDetails }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { addNotification } = useNotification();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'active' | 'designing' | 'all'>('active');
  const [folderFilter, setFolderFilter] = useState<'all' | 'missing' | 'matched'>('all');

  const tasks = useMemo<DesignTask[]>(() => {
    return records
      .filter((r) => r.kind === 'order' && r.id && r.order_id && ((r.details as any)?.designRequestedAt || (r.order_status || 'NEW') === 'DESIGNING'))
      .flatMap((r) => {
        const items = r.details?.items?.length
          ? r.details.items
          : [{
              name: r.product_name || 'Untitled product',
              variant: '',
              personalization: '',
              quantity: 1,
              image: undefined,
            }];
        return items.map((item, index) => {
          const productName = decodeHTMLEntities(item.name || r.product_name || 'Untitled product');
          const image = getHighResImageUrl(item.image);
          const designItemKey = makeDesignItemKey(r.id, index);
          const itemRequested = hasDesignRequestForItem(r.details, designItemKey);
          if (!itemRequested && (r.order_status || 'NEW') !== 'DESIGNING') return null;
          return {
            key: `${r.id}-${index}`,
            recordId: r.id!,
            orderId: r.order_id || 'N/A',
            productName,
            variant: decodeHTMLEntities(item.variant || ''),
            personalization: item.personalization || '',
            quantity: item.quantity || 1,
            image,
            fullImage: image,
            account: r.account,
            status: itemRequested ? 'DESIGN_REQUESTED' : r.order_status || 'NEW',
            dtLocal: r.dt_local,
            designItemKey,
          };
        }).filter(Boolean) as DesignTask[];
      })
      .sort((a, b) => {
        const aActive = ACTIVE_STATUSES.has(a.status) ? 0 : 1;
        const bActive = ACTIVE_STATUSES.has(b.status) ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        return new Date(b.dtLocal).getTime() - new Date(a.dtLocal).getTime();
      });
  }, [records]);

  useEffect(() => {
    fetchAllProducts(1000).then(setProducts).catch(() => setProducts([]));
  }, []);

  const taskWithMatches = useMemo(() => {
    return tasks.map((task) => {
      const match = products
        ?.filter((product) => productMatchesDesignItem(product, task.designItemKey))[0];
      return { ...task, match };
    });
  }, [tasks, products]);

  const activeCount = taskWithMatches.filter((t) => ACTIVE_STATUSES.has(t.status)).length;
  const missingCount = taskWithMatches.filter((t) => ACTIVE_STATUSES.has(t.status) && !t.match).length;
  const matchedCount = taskWithMatches.filter((t) => ACTIVE_STATUSES.has(t.status) && !!t.match).length;

  const visibleTasks = taskWithMatches.filter((task) => {
    if (statusFilter === 'active' && !ACTIVE_STATUSES.has(task.status)) return false;
    if (statusFilter === 'designing' && task.status !== 'DESIGNING') return false;
    if (folderFilter === 'missing' && task.match) return false;
    if (folderFilter === 'matched' && !task.match) return false;
    return true;
  });

  useEffect(() => {
    if (products === null || activeCount === 0) return;
    const key = `designQueueNotice:${activeCount}:${missingCount}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    addNotification(`${activeCount} design item(s) need review. ${missingCount} missing folder.`, 'info');
  }, [activeCount, missingCount, products, addNotification]);

  const openDesign = (task: DesignTask, match?: Product) => {
    const returnPath = `${location.pathname}${location.search}${location.hash}`;
    captureProductsReturnState(returnPath);
    const params = new URLSearchParams({ designOrder: task.recordId, designItem: task.designItemKey });
    const qs = `?${params.toString()}`;
    if (match) {
      navigate(`/products/c/${match.categoryId || 'uncategorized'}/f/${match.id}${qs}`, { state: { from: returnPath } });
      return;
    }
    navigate(`/products?design=${encodeURIComponent(task.productName)}&${params.toString()}`, { state: { from: returnPath } });
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Design Queue</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Assigned design items, grouped by order item.</p>
        </div>
        <div className="grid grid-cols-3 gap-3 min-w-0 lg:min-w-[420px]">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Active</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{activeCount}</p>
          </div>
          <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20 p-3">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Missing Folder</p>
            <p className="mt-1 text-2xl font-bold text-amber-800 dark:text-amber-200">{missingCount}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/20 p-3">
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Matched</p>
            <p className="mt-1 text-2xl font-bold text-emerald-800 dark:text-emerald-200">{matchedCount}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="inline-flex w-fit rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-1">
          {[
            ['active', 'Active'],
            ['designing', 'Designing'],
            ['all', 'All'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key as typeof statusFilter)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${statusFilter === key ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="inline-flex w-fit rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-1">
          {[
            ['all', 'All folders'],
            ['missing', 'Missing'],
            ['matched', 'Matched'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFolderFilter(key as typeof folderFilter)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${folderFilter === key ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {visibleTasks.length === 0 ? (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-12 text-center">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">No design items in this date range.</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Try changing the date filter or opening Order List.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {visibleTasks.map((task) => {
              const statusClass = ORDER_STATUS_CLASSES[task.status] || ORDER_STATUS_CLASSES.NEW;
              return (
                <div key={task.key} className="grid gap-3 p-4 md:grid-cols-[72px_minmax(0,1fr)_180px] md:items-center hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <div className="flex items-start gap-3 md:block">
                    {task.image ? (
                      <CachedImage
                        src={task.image}
                        alt={task.productName}
                        onClick={() => task.fullImage && setPreviewImage(task.fullImage)}
                        className="h-16 w-16 rounded-md border border-gray-200 dark:border-gray-600 object-cover cursor-pointer"
                      />
                    ) : (
                      <div className="h-16 w-16 rounded-md bg-gray-100 dark:bg-gray-700" />
                    )}
                    <div className="md:hidden min-w-0">
                      <p className="font-mono text-xs text-gray-500 dark:text-gray-400">#{task.orderId}</p>
                      <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white line-clamp-2">{task.productName}</p>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="hidden md:flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onViewOrderDetails(task.recordId)}
                        className="font-mono text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                      >
                        #{task.orderId}
                      </button>
                      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${statusClass}`}>
                        {statusLabel(task.status)}
                      </span>
                      <span className="text-xs text-gray-400">{fmtTime(task.dtLocal, timeZone)}</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white line-clamp-2" title={task.productName}>{task.productName}</p>
                    <div className="mt-1 space-y-0.5">
                      {task.variant && <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{task.variant}</p>}
                      {task.personalization && <p className="text-xs font-medium text-amber-700 dark:text-amber-300 line-clamp-2">{task.personalization}</p>}
                      <p className="text-xs text-gray-400">{task.account} - Qty {task.quantity}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 md:justify-end">
                    <span className={`rounded-md px-2 py-1 text-xs font-medium ${task.match ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                      {task.match ? 'Folder found' : 'Needs folder'}
                    </span>
                    <button
                      type="button"
                      onClick={() => openDesign(task, task.match)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M4 20h4.586a1 1 0 00.707-.293l10-10a2.5 2.5 0 00-3.536-3.536l-10 10A1 1 0 005.464 16.879L4 20z" />
                      </svg>
                      Design
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {previewImage && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
          <img src={previewImage} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  );
};

export default DesignQueueTab;
