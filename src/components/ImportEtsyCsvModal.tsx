import React, { useState, useRef, useCallback } from 'react';
import { api } from '../services/apiClient';
import { EtsyFees } from '../types';
import Spinner from './Spinner';

export interface EtsyCsvImportResult {
  total: number;
  matched: number;
  unmatched: string[];
  feesByOrderId: { [orderId: string]: EtsyFees };
}

interface ImportEtsyCsvModalProps {
  onClose: () => void;
  /** Called with the fees of MATCHED orders so the caller can patch loaded records. */
  onImported: (matchedFees: { [orderId: string]: EtsyFees }, result: EtsyCsvImportResult) => void;
}

type Phase = 'select' | 'importing' | 'done';

const money = (v: unknown): string =>
  (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0).toFixed(2);

const displayNet = (fees: EtsyFees): number =>
  Number(fees.estActualNet ?? fees.orderNetUsd ?? fees.orderNet ?? 0) || 0;

const ImportEtsyCsvModal: React.FC<ImportEtsyCsvModalProps> = ({ onClose, onImported }) => {
  const [phase, setPhase] = useState<Phase>('select');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EtsyCsvImportResult | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pickFile = (f: File | undefined | null) => {
    setError(null);
    if (!f) return;
    if (!/\.csv$/i.test(f.name) && f.type !== 'text/csv') {
      setError('Please choose a .csv file (Etsy Sold Orders export).');
      return;
    }
    setFile(f);
  };

  const handleImport = useCallback(async () => {
    if (!file) return;
    setPhase('importing');
    setError(null);
    try {
      const csv = await file.text();
      const res = await api.post<EtsyCsvImportResult>('/api/import/etsy-csv', { csv });
      setResult(res);
      setPhase('done');
      // Hand only the matched fees to the caller for state patching.
      const unmatchedSet = new Set(res.unmatched);
      const matchedFees: { [orderId: string]: EtsyFees } = {};
      Object.entries(res.feesByOrderId || {}).forEach(([id, fees]) => {
        if (!unmatchedSet.has(id)) matchedFees[id] = fees;
      });
      onImported(matchedFees, res);
    } catch (err: any) {
      setPhase('select');
      setError(err?.message || 'Import failed. Please try again.');
    }
  }, [file, onImported]);

  const reset = () => {
    setPhase('select');
    setFile(null);
    setResult(null);
    setError(null);
  };

  // Result rows: unmatched first so problems are visible immediately.
  const resultRows = result
    ? (() => {
        const unmatchedSet = new Set(result.unmatched);
        return Object.keys(result.feesByOrderId || {})
          .map((orderId) => ({ orderId, fees: result.feesByOrderId[orderId], mapped: !unmatchedSet.has(orderId) }))
          .sort((a, b) => Number(a.mapped) - Number(b.mapped));
      })()
    : [];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[70] p-4 animate-modal-backdrop" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700 animate-modal-scale"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Import Etsy Sold Orders CSV</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Shop Manager → Settings → Options → Download Data → Orders
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto">
          {phase === 'select' && (
            <>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }}
              />
              <div
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragOver(false); pickFile(e.dataTransfer.files?.[0]); }}
                className={`cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
                  isDragOver
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700/40'
                }`}
              >
                <svg className="mx-auto h-10 w-10 text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                {file ? (
                  <>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{file.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{(file.size / 1024).toFixed(1)} KB — click to choose a different file</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Click to choose a CSV file, or drag &amp; drop it here</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">EtsySoldOrders*.csv</p>
                  </>
                )}
              </div>
              {error && (
                <div className="mt-4 p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
                  {error}
                </div>
              )}
            </>
          )}

          {phase === 'importing' && (
            <div className="py-12 flex flex-col items-center gap-3">
              <Spinner size="lg" />
              <p className="text-sm text-gray-600 dark:text-gray-300">Importing &amp; matching orders…</p>
            </div>
          )}

          {phase === 'done' && result && (
            <>
              {/* Summary chips */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 p-3 text-center">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{result.total}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">Orders in CSV</p>
                </div>
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/20 p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{result.matched}</p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Mapped</p>
                </div>
                <div className={`rounded-lg border p-3 text-center ${result.unmatched.length > 0 ? 'border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50'}`}>
                  <p className={`text-2xl font-bold ${result.unmatched.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}`}>{result.unmatched.length}</p>
                  <p className={`text-xs uppercase tracking-wider ${result.unmatched.length > 0 ? 'text-red-700 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>Not found</p>
                </div>
              </div>

              {result.unmatched.length > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  "Not found" = the order isn't in the dashboard yet (its sale email wasn't parsed, or it belongs to a shop that isn't connected). Unmatched orders are listed first.
                </p>
              )}

              {/* Per-order result table */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="max-h-[40vh] overflow-y-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Order ID</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Sale Date</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Total</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Net</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700/60">
                      {resultRows.map(({ orderId, fees, mapped }) => (
                        <tr key={orderId} className={mapped ? '' : 'bg-red-50/60 dark:bg-red-900/10'}>
                          <td className="px-3 py-2 font-mono text-xs text-gray-900 dark:text-gray-100 whitespace-nowrap">{orderId}</td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">{fees.saleDate || '--'}</td>
                          <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300 tabular-nums">${money(fees.orderTotal)}</td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-white tabular-nums">${money(displayNet(fees))}</td>
                          <td className="px-3 py-2 text-center">
                            {mapped ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                                ✓ Mapped
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
                                ✗ Not found
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-lg flex justify-end gap-3">
          {phase === 'select' && (
            <>
              <button onClick={onClose} className="px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-500 text-gray-700 dark:text-white rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors font-medium text-sm">
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!file}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Import
              </button>
            </>
          )}
          {phase === 'done' && (
            <>
              <button onClick={reset} className="px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-500 text-gray-700 dark:text-white rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors font-medium text-sm">
                Import another file
              </button>
              <button onClick={onClose} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium text-sm">
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportEtsyCsvModal;
