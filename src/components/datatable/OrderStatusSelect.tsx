import React from 'react';
import { ORDER_STATUSES, ORDER_STATUS_LABELS, ORDER_STATUS_CLASSES } from '../../constants/orderStatus';

const VISIBLE_ORDER_STATUSES = ORDER_STATUSES.filter(status => status !== 'READY');

interface OrderStatusSelectProps {
    id: string;
    value: string;
    disabled?: boolean;
    onChange?: (id: string, status: string) => void;
}

const OrderStatusSelect: React.FC<OrderStatusSelectProps> = ({ id, value, disabled, onChange }) => {
    const status = value === 'READY' ? 'NEW' : ((ORDER_STATUSES as readonly string[]).includes(value) ? value : 'NEW');
    return (
        <select
            value={status}
            disabled={disabled || !onChange}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onChange && onChange(id, e.target.value)}
            className={`text-xs font-semibold rounded px-2 py-1 border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-400 ${ORDER_STATUS_CLASSES[status] || ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
            {VISIBLE_ORDER_STATUSES.map((s) => (
                <option key={s} value={s} className="bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100">
                    {ORDER_STATUS_LABELS[s]}
                </option>
            ))}
        </select>
    );
};

export default OrderStatusSelect;
