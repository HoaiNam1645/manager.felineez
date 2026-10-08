import React, { useEffect, useState } from 'react';
import { Product, fetchAllProducts, searchProducts, isImageFile, ProductImage } from '../services/productService';

interface DesignPickerModalProps {
  onPick: (url: string, file: ProductImage) => void;
  onClose: () => void;
}

// Reopening the picker lands back on the folder used last — filling three URL
// fields for one item is then three clicks instead of three searches.
let lastProductId: string | null = null;

/**
 * Pick a design file URL out of the Products library, for the factory forms'
 * mockup/PNG/EMB/DST fields.
 */
const DesignPickerModal: React.FC<DesignPickerModalProps> = ({ onPick, onClose }) => {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAllProducts()
      .then(all => {
        setProducts(all);
        if (lastProductId) setSelected(all.find(p => p.id === lastProductId) || null);
      })
      .catch(e => setError(e?.message || 'Could not load products'));
  }, []);

  const list = products
    ? (query.trim() ? searchProducts(query, products, 30) : products.slice(0, 30))
    : [];

  const choose = (p: Product) => { lastProductId = p.id; setSelected(p); };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[90] p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col border border-gray-200 dark:border-gray-700"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              {selected ? selected.title || 'Folder' : 'Pick a design file'}
            </h3>
            {selected && (
              <button
                onClick={() => setSelected(null)}
                className="px-2.5 py-1 text-xs font-medium bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-500 text-gray-700 dark:text-white rounded-md hover:bg-gray-50 dark:hover:bg-gray-600"
              >
                Back to folders
              </button>
            )}
          </div>
          {!selected && (
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search folders — paste the product name…"
              autoFocus
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {!error && products === null && <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>}

          {!selected && products !== null && (
            list.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">No folder matches.</p>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {list.map(p => (
                  <button
                    key={p.id}
                    onClick={() => choose(p)}
                    className="w-full flex items-center gap-3 px-2 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 rounded"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900 dark:text-white truncate">{p.title || 'Untitled'}</span>
                      {p.description && <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">{p.description}</span>}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {p.images.length} file{p.images.length !== 1 ? 's' : ''}
                    </span>
                  </button>
                ))}
              </div>
            )
          )}

          {selected && (
            selected.images.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">This folder has no files yet.</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {selected.images.map(im => (
                  <button
                    key={im.publicId}
                    onClick={() => { onPick(im.url, im); onClose(); }}
                    className="border border-gray-200 dark:border-gray-600 rounded-lg p-2 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-left"
                    title={im.name || im.url}
                  >
                    <span className="block aspect-square mb-1.5 flex items-center justify-center overflow-hidden rounded bg-gray-50 dark:bg-gray-700/40">
                      {isImageFile(im) ? (
                        <img src={im.url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-gray-700 dark:bg-gray-600 text-white text-[10px] font-bold uppercase">
                          {im.format || 'file'}
                        </span>
                      )}
                    </span>
                    <span className="block text-[11px] leading-4 text-gray-600 dark:text-gray-300 break-all line-clamp-2">
                      {im.name || im.publicId.split('/').pop()}
                    </span>
                  </button>
                ))}
              </div>
            )
          )}
        </div>

        <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-500 text-gray-700 dark:text-white rounded-md hover:bg-gray-50 dark:hover:bg-gray-600"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default DesignPickerModal;
