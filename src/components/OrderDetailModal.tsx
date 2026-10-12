import React, { useState } from 'react';
import { Record } from '../types';
import { useDashboard } from '../contexts/DashboardContext';
import { useUI } from '../contexts/UIContext';
import ImagePreviewModal from './ImagePreviewModal';
import OrderStatusSelect from './datatable/OrderStatusSelect';

interface OrderDetailModalProps {
  record: Record;
  onClose: () => void;
  onChangeOrderStatus?: (recordId: string, status: string) => Promise<void>;
  // Supplier screen / fulfillment staff: show everything except money
  hideFinancials?: boolean;
}

const OrderDetailModal: React.FC<OrderDetailModalProps> = ({ record, onClose, onChangeOrderStatus, hideFinancials = false }) => {
  const { accounts } = useDashboard();
  const { timeZone } = useUI();
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);

  if (!record.details) return null;

  const handleStatusChange = async (id: string, status: string) => {
    if (!onChangeOrderStatus) return;
    setStatusUpdating(true);
    try {
      await onChangeOrderStatus(id, status);
    } finally {
      setStatusUpdating(false);
    }
  };

  // Safe money formatter: parsed Etsy emails can have null/missing numeric
  // fields (e.g. financials.shipping when the email has no shipping line).
  // null.toFixed() would throw and trip the app's error boundary.
  const money = (v: unknown): string =>
    (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0).toFixed(2);

  const { details, order_id, dt_local, account } = record;
  const { customerName, customerEmail } = details;
  const shippingAddress = details.shippingAddress ?? ({} as NonNullable<typeof details.shippingAddress>);
  const items = details.items ?? [];
  const financials = details.financials;
  const etsyFees = record.etsy_fees; // imported from the Etsy Sold Orders CSV
  const orderTotalForFeeEstimate = Number(etsyFees?.orderTotal || financials?.orderTotal || record.amount || 0);
  const hasDetailedEtsyFees = !!etsyFees?.estBreakdown;
  const hasLegacyEtsyNet = !!etsyFees && (Number(etsyFees.orderNet) > 0 || Number(etsyFees.cardFees) > 0);
  const useFallbackFee = record.source === 'Etsy_Sales'
    && orderTotalForFeeEstimate > 0
    && !hasDetailedEtsyFees
    && !hasLegacyEtsyNet;
  const fallbackFee = useFallbackFee
    ? Math.round(orderTotalForFeeEstimate * 0.145 * 100) / 100
    : 0;
  const fallbackNet = fallbackFee > 0
    ? Math.round((orderTotalForFeeEstimate - fallbackFee) * 100) / 100
    : 0;
  const showEtsyFeesPanel = !!etsyFees || useFallbackFee;

  const matchedAccount = accounts.find(acc => acc.email === account);
  const shopName = matchedAccount?.label || account;

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(new Date(dt_local));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[70] p-4 animate-modal-backdrop" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700 animate-modal-scale" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Order #{order_id}</h2>
              {record.id && onChangeOrderStatus && (
                <OrderStatusSelect
                  id={record.id}
                  value={record.order_status || 'NEW'}
                  disabled={statusUpdating}
                  onChange={handleStatusChange}
                />
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {formattedDate} • Shop: {shopName}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto p-6 space-y-8">

          {/* Customer & Address Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Customer</h3>
              <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-md border border-gray-100 dark:border-gray-600">
                <p className="text-lg font-medium text-gray-900 dark:text-white">{customerName}</p>
                {customerEmail && (
                  <a href={`mailto:${customerEmail}`} className="text-blue-600 dark:text-blue-400 hover:underline text-sm block mt-1 break-all">
                    {customerEmail}
                  </a>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Shipping Address</h3>
              <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-md border border-gray-100 dark:border-gray-600 text-gray-800 dark:text-gray-200">
                <p className="font-medium">{shippingAddress.name}</p>
                <p>{shippingAddress.address1}</p>
                {shippingAddress.address2 && <p>{shippingAddress.address2}</p>}
                <p>{shippingAddress.city}, {shippingAddress.state} {shippingAddress.zip}</p>
                <p className="font-medium mt-1">{shippingAddress.country}</p>
              </div>
            </div>
          </div>

          {/* Items Section */}
          <div>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Items ({items.length})</h3>

            {/* Mobile Card Layout */}
            <div className="md:hidden space-y-3">
              {items.map((item, idx) => (
                <div key={idx} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 p-4">
                  <div className="flex gap-4">
                    {item.image && (
                      <img
                        src={item.image}
                        alt=""
                        className="w-28 h-28 object-cover rounded-lg border border-gray-200 dark:border-gray-600 flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setPreviewImage(item.image)}
                        title="Click to view full size"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-bold leading-6 text-gray-900 dark:text-white break-words">{item.name}</p>
                      {item.variant && (
                        <p className="text-sm leading-5 text-gray-500 dark:text-gray-400 mt-2 whitespace-pre-wrap">{item.variant}</p>
                      )}
                      {item.transactionId && <p className="text-sm text-gray-400 mt-2">ID: {item.transactionId}</p>}
                    </div>
                  </div>

                  {item.personalization && (
                    <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded text-sm text-gray-700 dark:text-gray-300 border border-yellow-100 dark:border-yellow-900/30">
                      <span className="font-semibold">Personalization:</span> {item.personalization}
                    </div>
                  )}

                  <div className={`mt-3 pt-3 border-t border-gray-200 dark:border-gray-600 grid ${hideFinancials ? 'grid-cols-1' : 'grid-cols-3'} gap-2 text-sm`}>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400 text-xs block">Qty</span>
                      <span className={Number(item.quantity || 0) > 1 ? 'inline-flex min-w-8 justify-center rounded-md bg-red-100 px-2 py-0.5 text-lg font-extrabold text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'font-semibold text-gray-900 dark:text-white'}>
                        {item.quantity}
                      </span>
                    </div>
                    {!hideFinancials && (
                      <div className="text-center">
                        <span className="text-gray-500 dark:text-gray-400 text-xs block">Price</span>
                        <span className="font-medium text-gray-900 dark:text-white">${money(item.price)}</span>
                      </div>
                    )}
                    {!hideFinancials && (
                      <div className="text-right">
                        <span className="text-gray-500 dark:text-gray-400 text-xs block">Total</span>
                        <span className="font-semibold text-blue-600 dark:text-blue-400">${money((item.quantity || 0) * (item.price || 0))}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table Layout */}
            <div className="hidden md:block border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Product</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Qty</th>
                    {!hideFinancials && <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Price</th>}
                    {!hideFinancials && <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Total</th>}
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="px-6 py-5">
                        <div className="flex items-start space-x-5">
                          {item.image && (
                            <img
                              src={item.image}
                              alt=""
                              className="w-24 h-24 object-cover rounded-lg border border-gray-200 dark:border-gray-600 flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => setPreviewImage(item.image)}
                              title="Click to view full size"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-lg font-bold leading-7 text-gray-900 dark:text-white break-words">{item.name}</p>
                            {item.variant && (
                              <p className="text-sm leading-5 text-gray-500 dark:text-gray-400 mt-2 whitespace-pre-wrap">{item.variant}</p>
                            )}
                            {item.personalization && (
                              <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded text-sm text-gray-700 dark:text-gray-300 border border-yellow-100 dark:border-yellow-900/30">
                                <span className="font-semibold">Personalization:</span> {item.personalization}
                              </div>
                            )}
                            {item.transactionId && <p className="text-sm text-gray-400 mt-2">ID: {item.transactionId}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-5 text-right align-top">
                        <span className={Number(item.quantity || 0) > 1 ? 'inline-flex min-w-10 justify-center rounded-md bg-red-100 px-3 py-1 text-xl font-extrabold text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'text-base font-semibold text-gray-900 dark:text-white'}>
                          {item.quantity}
                        </span>
                      </td>
                      {!hideFinancials && (
                        <td className="px-4 py-4 text-right text-sm text-gray-900 dark:text-white align-top">
                          ${money(item.price)}
                        </td>
                      )}
                      {!hideFinancials && (
                        <td className="px-4 py-4 text-right text-sm font-medium text-gray-900 dark:text-white align-top">
                          ${money((item.quantity || 0) * (item.price || 0))}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Financial Summary (+ Etsy Fees & Net when a CSV import matched this order) */}
          {!hideFinancials && (financials || showEtsyFeesPanel) && (
            <div className={showEtsyFeesPanel ? 'grid grid-cols-1 md:grid-cols-2 gap-6 items-start' : 'flex justify-end'}>
              {financials && (
                <div className={`bg-gray-50 dark:bg-gray-700/50 p-4 rounded-md border border-gray-100 dark:border-gray-600 ${showEtsyFeesPanel ? 'w-full' : 'w-full md:w-1/2 lg:w-1/3'}`}>
                  {showEtsyFeesPanel && (
                    <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Order Payment</h4>
                  )}
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>Item Total</span>
                      <span>${money(financials.itemTotal)}</span>
                    </div>
                    {!!Number(financials.discount) && (
                      <div className="flex justify-between text-green-600 dark:text-green-400">
                        <span>Discount</span>
                        <span>-${money(Math.abs(Number(financials.discount) || 0))}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>Shipping</span>
                      <span>${money(financials.shipping)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>Tax</span>
                      <span>${money(financials.tax)}</span>
                    </div>
                    <div className="border-t border-gray-200 dark:border-gray-600 pt-2 mt-2 flex justify-between text-base font-bold text-gray-900 dark:text-white">
                      <span>Order Total</span>
                      <span>${money(financials.orderTotal)}</span>
                    </div>
                  </div>
                </div>
              )}

              {showEtsyFeesPanel && (
                <div className="w-full bg-amber-50/70 dark:bg-amber-900/10 p-4 rounded-md border border-amber-200 dark:border-amber-900/40">
                  <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-3 flex items-center justify-between">
                    <span>Etsy Fees &amp; Net</span>
                    <span className="font-normal normal-case text-gray-400 dark:text-gray-500">
                      {useFallbackFee ? 'USD · 14.5% fallback' : (etsyFees?.estBreakdown ? 'USD · estimated' : `${etsyFees?.currency || 'USD'} · from CSV`)}
                    </span>
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>Order Total</span>
                      <span>${money(etsyFees?.orderTotal ?? orderTotalForFeeEstimate)}</span>
                    </div>

                    {useFallbackFee ? (
                      <>
                        <div className="flex justify-between text-red-600 dark:text-red-400">
                          <span>Estimated Etsy Fee (14.5%)</span>
                          <span>-${money(fallbackFee)}</span>
                        </div>
                        <div className="border-t border-amber-200 dark:border-amber-900/40 pt-2 mt-2 flex justify-between text-base font-bold text-emerald-600 dark:text-emerald-400">
                          <span>Actual Net (est.)</span>
                          <span>${money(fallbackNet)}</span>
                        </div>
                      </>
                    ) : etsyFees.estBreakdown ? (
                      <>
                        {/* Full fee breakdown mirroring Etsy's Earnings panel */}
                        {!!Number(etsyFees.estBreakdown.taxWithheld) && (
                          <div className="flex justify-between text-gray-600 dark:text-gray-400">
                            <span>Tax (withheld by Etsy)</span>
                            <span>-${money(etsyFees.estBreakdown.taxWithheld)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-red-600 dark:text-red-400">
                          <span>Transaction Fee (6.5%)</span>
                          <span>-${money(etsyFees.estBreakdown.transactionFee)}</span>
                        </div>
                        <div className="flex justify-between text-red-600 dark:text-red-400">
                          <span>Processing Fee</span>
                          <span>-${money(etsyFees.estBreakdown.processingFee)}</span>
                        </div>
                        {!!Number(etsyFees.estBreakdown.regulatoryFee) && (
                          <div className="flex justify-between text-red-600 dark:text-red-400">
                            <span>Regulatory Fee (1.25%)</span>
                            <span>-${money(etsyFees.estBreakdown.regulatoryFee)}</span>
                          </div>
                        )}
                        {!!Number(etsyFees.estBreakdown.vat) && (
                          <div className="flex justify-between text-red-600 dark:text-red-400">
                            <span>VAT (10% on fees)</span>
                            <span>-${money(etsyFees.estBreakdown.vat)}</span>
                          </div>
                        )}
                        <div className="border-t border-amber-200 dark:border-amber-900/40 pt-2 mt-2 flex justify-between text-base font-bold text-emerald-600 dark:text-emerald-400">
                          <span>Actual Net (est.)</span>
                          <span>${money(etsyFees.estActualNet)}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Legacy display (rows not yet enriched) */}
                        <div className="flex justify-between text-red-600 dark:text-red-400">
                          <span>Card Processing Fees</span>
                          <span>-${money(etsyFees.cardFees)}</span>
                        </div>
                        <div className="border-t border-amber-200 dark:border-amber-900/40 pt-2 mt-2 flex justify-between text-base font-bold text-emerald-600 dark:text-emerald-400">
                          <span>Order Net</span>
                          <span>${money(etsyFees.orderNet)}</span>
                        </div>
                      </>
                    )}

                    {etsyFees && (
                      <div className="pt-2 text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
                        {!!Number(etsyFees.discount) && (
                          <span>Discount: -${money(etsyFees.discount)}{etsyFees.couponCode ? ` (${etsyFees.couponCode})` : ''}</span>
                        )}
                        {etsyFees.sku && <span>SKU: {etsyFees.sku}</span>}
                        {etsyFees.dateShipped && <span>Shipped: {etsyFees.dateShipped}</span>}
                        {etsyFees.shopCurrency === 'VND' && etsyFees.exchangeRate && (
                          <span>Shop currency: VND (~{Number(etsyFees.exchangeRate).toLocaleString()}₫/$)</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-lg flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-500 text-gray-700 dark:text-white rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors font-medium">
            Close
          </button>
        </div>
      </div>

      {/* Image Preview Modal */}
      <ImagePreviewModal
        imageUrl={previewImage}
        onClose={() => setPreviewImage(null)}
      />
    </div>
  );
};

// Memoize to prevent unnecessary re-renders
export default React.memo(OrderDetailModal);
