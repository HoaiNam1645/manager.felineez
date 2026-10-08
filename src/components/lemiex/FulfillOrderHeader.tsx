// Shared header for all factory fulfill forms: order id + everything the
// fulfiller needs to double-check while filling the form — full shipping
// address, buyer note, and each item's variant/personalization.
import React from 'react';
import { Record } from '../../types';

const FulfillOrderHeader: React.FC<{ record: Record; onBack: () => void }> = ({ record, onBack }) => {
  const d = record.details;
  const addr = d?.shippingAddress;
  const addressLine = addr
    ? [
        addr.address1,
        addr.address2,
        addr.city,
        `${addr.state || ''} ${addr.zip || ''}`.trim(),
        addr.country,
      ].filter(Boolean).join(', ')
    : '';
  const buyerMessage = d?.buyerMessage || '';
  const items = d?.items || [];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
          Fulfill order #{record.order_id}
        </p>
        <button
          onClick={onBack}
          className="px-3 py-1.5 text-sm font-medium bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-500 text-gray-700 dark:text-white rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 whitespace-nowrap flex-shrink-0"
        >
          Back
        </button>
      </div>

      <div className="mt-1 text-xs text-gray-600 dark:text-gray-300 space-y-0.5">
        <p>
          <span className="font-medium text-gray-900 dark:text-white">{addr?.name || d?.customerName || ''}</span>
          {addressLine ? ` — ${addressLine}` : ''}
        </p>
        {d?.customerEmail && <p className="text-gray-500 dark:text-gray-400 break-all">{d.customerEmail}</p>}
      </div>

      {buyerMessage && (
        <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded text-xs text-gray-700 dark:text-gray-300 border border-yellow-100 dark:border-yellow-900/30">
          <span className="font-semibold">Note:</span> {buyerMessage}
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/60 space-y-2">
          {items.map((it, i) => (
            <div key={i} className="text-xs">
              <p className="font-medium text-gray-900 dark:text-white">
                {i + 1}. {it.name}{it.quantity ? ` ×${it.quantity}` : ''}
              </p>
              {it.variant && (
                <p className="text-gray-500 dark:text-gray-400 whitespace-pre-wrap">{it.variant}</p>
              )}
              {it.personalization && (
                <div className="mt-1 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded text-gray-700 dark:text-gray-300 border border-yellow-100 dark:border-yellow-900/30">
                  <span className="font-semibold">Personalization:</span> {it.personalization}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FulfillOrderHeader;
