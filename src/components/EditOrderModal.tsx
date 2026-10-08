import React, { useState } from 'react';
import { Record } from '../types';
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from '../constants/orderStatus';

const VISIBLE_ORDER_STATUSES = ORDER_STATUSES.filter(status => status !== 'READY');
const MANUAL_FF_CODE_OPTIONS = [
    'lem',
    'lem-vn',
    'hgt',
    'mkp',
    'print arrow',
    'tp',
    'lizzy',
    'dragon EMB',
    'vina thêu',
    'pentifine',
    'mango prints',
    'printdoor',
    'ecoprimy',
    'HP',
    'fristify',
    'printify',
    'lenful',
    'zootop',
    'dreamship',
    'vtn',
];

export interface EditOrderFields {
    order_id: string;
    customer_name: string;
    amount: number;
    cost_total: number | null;
    design_cost: number | null;
    ff_code: string;
    order_status: string;
    tracking_code: string;
}

interface EditOrderModalProps {
    record: Record;
    onClose: () => void;
    onSave: (recordId: string, fields: EditOrderFields) => Promise<void>;
}

const inputCls = 'w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelCls = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1';

// Seller-facing order editor: basic info + Revenue / FF Cost / FF Code.
const EditOrderModal: React.FC<EditOrderModalProps> = ({ record, onClose, onSave }) => {
    const [orderId, setOrderId] = useState(record.order_id || '');
    const [customerName, setCustomerName] = useState(record.details?.customerName || '');
    const [amount, setAmount] = useState(String(record.amount ?? ''));
    const [costTotal, setCostTotal] = useState(record.cost_total != null ? String(record.cost_total) : '');
    const [designCost, setDesignCost] = useState(record.design_cost != null ? String(record.design_cost) : '');
    const [ffCode, setFfCode] = useState(record.ff_code || '');
    const [orderStatus, setOrderStatus] = useState(record.order_status === 'READY' ? 'NEW' : record.order_status || 'NEW');
    const [trackingCode, setTrackingCode] = useState(record.tracking_code || '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const showCurrentFfCode = ffCode.trim() && !MANUAL_FF_CODE_OPTIONS.includes(ffCode.trim());

    const handleSave = async () => {
        const amountNum = Number(amount);
        if (!Number.isFinite(amountNum) || amountNum < 0) return setError('Revenue must be a valid number');
        const costNum = costTotal.trim() === '' ? null : Number(costTotal);
        if (costNum !== null && (!Number.isFinite(costNum) || costNum < 0)) return setError('FF Cost must be a valid number');
        const designCostNum = designCost.trim() === '' ? null : Number(designCost);
        if (designCostNum !== null && (!Number.isFinite(designCostNum) || designCostNum < 0)) return setError('Design Cost must be a valid number');
        if (!orderId.trim()) return setError('Order ID is required');

        setError(null);
        setSaving(true);
        try {
            await onSave(record.id!, {
                order_id: orderId.trim(),
                customer_name: customerName.trim(),
                amount: amountNum,
                cost_total: costNum,
                design_cost: designCostNum,
                ff_code: ffCode.trim(),
                order_status: orderStatus,
                tracking_code: trackingCode.trim(),
            });
            onClose();
        } catch {
            setError('Failed to save order');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[80] p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700 p-5" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Edit order</h3>

                <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-6">
                        <label className={labelCls}>Order ID</label>
                        <input value={orderId} onChange={e => setOrderId(e.target.value)} className={inputCls} />
                    </div>
                    <div className="col-span-6">
                        <label className={labelCls}>Customer name</label>
                        <input value={customerName} onChange={e => setCustomerName(e.target.value)} className={inputCls} />
                    </div>
                    <div className="col-span-3">
                        <label className={labelCls}>Revenue ({record.currency || 'USD'})</label>
                        <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} className={inputCls} />
                    </div>
                    <div className="col-span-3">
                        <label className={labelCls}>FF Cost (USD)</label>
                        <input type="number" step="0.01" min="0" value={costTotal} onChange={e => setCostTotal(e.target.value)} placeholder="-" className={inputCls} />
                    </div>
                    <div className="col-span-3">
                        <label className={labelCls}>Design Cost</label>
                        <input type="number" step="0.01" min="0" value={designCost} onChange={e => setDesignCost(e.target.value)} placeholder="-" className={inputCls} />
                    </div>
                    <div className="col-span-3">
                        <label className={labelCls}>FF Code</label>
                        <select value={ffCode} onChange={e => setFfCode(e.target.value)} className={inputCls}>
                            <option value="">Chưa chọn</option>
                            {showCurrentFfCode && <option value={ffCode}>{ffCode}</option>}
                            {MANUAL_FF_CODE_OPTIONS.map(code => (
                                <option key={code} value={code}>{code}</option>
                            ))}
                        </select>
                    </div>
                    <div className="col-span-6">
                        <label className={labelCls}>Status</label>
                        <select value={orderStatus} onChange={e => setOrderStatus(e.target.value)} className={inputCls}>
                            {VISIBLE_ORDER_STATUSES.map(s => (
                                <option key={s} value={s}>{ORDER_STATUS_LABELS[s] || s}</option>
                            ))}
                        </select>
                    </div>
                    <div className="col-span-6">
                        <label className={labelCls}>Tracking</label>
                        <input value={trackingCode} onChange={e => setTrackingCode(e.target.value)} className={inputCls} />
                    </div>
                </div>

                {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

                <div className="flex justify-end gap-2 mt-5">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-500 text-gray-700 dark:text-white rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50"
                    >
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EditOrderModal;
