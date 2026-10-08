import React, { useState } from 'react';

interface NoteModalProps {
    recordId: string;
    initialValue: string;
    onClose: () => void;
    onSave: (recordId: string, note: string) => Promise<void>;
    title?: string;
    placeholder?: string;
}

// Free-text fulfillment note editor (FF Note column) — mirrors TrackingModal.
const NoteModal: React.FC<NoteModalProps> = ({ recordId, initialValue, onClose, onSave, title = 'FF Note', placeholder = "Note about this order's fulfillment" }) => {
    const [value, setValue] = useState(initialValue);
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(recordId, value);
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[80] p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700 p-5" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{title}</h3>
                <textarea
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    placeholder={placeholder}
                    autoFocus
                    rows={4}
                    maxLength={500}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
                <div className="flex items-center justify-between mt-4">
                    <span className="text-xs text-gray-400 dark:text-gray-500">{value.length}/500</span>
                    <div className="flex gap-2">
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
        </div>
    );
};

export default NoteModal;
