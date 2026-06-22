import React, { useState, useEffect } from 'react';
import { Product, listProducts } from '../services/productService';
import { getToken } from '../services/apiClient';

interface TemuExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  categoryId: string;
  categoryName: string;
}

interface TemuCategory {
  categoryId: string;
  productName: string;
  configs: string[];
}

const DownloadIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

const CheckIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

// Temu categories list (loaded from templates/index.json via API)
const TEMU_CATEGORIES: TemuCategory[] = [
  { categoryId: '9519', productName: 'Egg-Cups', configs: ['PACK_CUSTOM'] },
  { categoryId: '10334', productName: 'Tumblers', configs: ['CUSTOM', 'PACK_CUSTOM'] },
  { categoryId: '10585', productName: 'Mugs', configs: ['NORMAL', 'CUSTOM', 'PACK', 'PACK_CUSTOM'] },
  { categoryId: '10601', productName: 'Wiskey Glass', configs: ['PACK_CUSTOM'] },
  { categoryId: '11459', productName: 'Table Runner', configs: ['CUSTOM'] },
  { categoryId: '11666', productName: 'Banners', configs: ['NORMAL'] },
  { categoryId: '11899', productName: 'Blanket', configs: ['NORMAL', 'CUSTOM'] },
  { categoryId: '12042', productName: 'Pillow', configs: ['CUSTOM'] },
  { categoryId: '12141', productName: 'Ornament', configs: ['NORMAL', 'CUSTOM'] },
  { categoryId: '12193', productName: 'Acrylic Blocks', configs: ['CUSTOM'] },
  { categoryId: '12253', productName: 'Doormat', configs: ['NORMAL', 'CUSTOM', 'PACK_CUSTOM'] },
  { categoryId: '12869', productName: 'Poster', configs: ['CUSTOM'] },
  { categoryId: '13018', productName: 'Wooden Block', configs: ['NORMAL'] },
  { categoryId: '17332', productName: 'Wrapping Paper', configs: ['NORMAL'] },
  { categoryId: '22120', productName: 'Car Visor Clip', configs: ['PACK', 'PACK_CUSTOM'] },
  { categoryId: '24376', productName: 'Phone Case', configs: ['CUSTOM'] },
  { categoryId: '24675', productName: 'Flag', configs: ['NORMAL', 'CUSTOM'] },
  { categoryId: '28924', productName: 'Graduation Stole', configs: ['CUSTOM'] },
  { categoryId: '29007', productName: 'Bikini', configs: ['CUSTOM'] },
  { categoryId: '30152', productName: 'Cap', configs: ['CUSTOM'] },
  { categoryId: '30471', productName: 'Hawaiian Shirt', configs: ['CUSTOM'] },
  { categoryId: '40381', productName: 'Booktracker', configs: ['CUSTOM'] },
  { categoryId: '12217', productName: 'Tapestry', configs: ['CUSTOM'] },
];

interface Variant {
  option1: string;
  option2: string;
  price: number;
}

const TemuExportModal: React.FC<TemuExportModalProps> = ({
  isOpen,
  onClose,
  categoryId,
  categoryName,
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [temuCategoryId, setTemuCategoryId] = useState('10585');
  const [configType, setConfigType] = useState('CUSTOM');
  const [skuPrefix, setSkuPrefix] = useState('CG');

  // Description field - shows default from template, can be edited
  const [description, setDescription] = useState('');
  const [defaultDescription, setDefaultDescription] = useState('');
  const [loadingDescription, setLoadingDescription] = useState(false);

  // Variants - default from template or custom
  const [defaultVariants, setDefaultVariants] = useState<Variant[]>([]);
  const [customVariants, setCustomVariants] = useState<Variant[] | null>(null);
  const [variantsFileName, setVariantsFileName] = useState<string | null>(null);
  const [variantsText, setVariantsText] = useState('');
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  const selectedTemuCategory = TEMU_CATEGORIES.find(c => c.categoryId === temuCategoryId);

  // Update configType when temuCategory changes
  useEffect(() => {
    if (selectedTemuCategory && !selectedTemuCategory.configs.includes(configType)) {
      setConfigType(selectedTemuCategory.configs[0]);
    }
  }, [temuCategoryId]);

  // Fetch default description and variants from template when category changes
  useEffect(() => {
    if (!temuCategoryId) return;

    setLoadingTemplate(true);
    setLoadingDescription(true);
    fetch(`/api/templates?categoryId=${temuCategoryId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        // Load description
        const desc = data?.description || '';
        setDefaultDescription(desc);
        setDescription(desc);

        // Load variants
        const variants = data?.variants || [];
        const formattedVariants: Variant[] = variants.map((v: any) => ({
          option1: v.option1 || '',
          option2: v.option2 || '',
          price: v.price || 100
        }));
        setDefaultVariants(formattedVariants);

        // Clear custom variants when category changes
        setCustomVariants(null);
        setVariantsFileName(null);
        setVariantsText('');
      })
      .catch(() => {
        setDefaultDescription('');
        setDescription('');
        setDefaultVariants([]);
      })
      .finally(() => {
        setLoadingTemplate(false);
        setLoadingDescription(false);
      });
  }, [temuCategoryId]);

  // Load products
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    const apiCategoryId = categoryId === 'uncategorized' ? 'none' : categoryId;
    listProducts({ categoryId: apiCategoryId, pageSize: 200 })
      .then((res) => {
        setProducts(res.products);
        setSelectedIds(new Set(res.products.map((p) => p.id)));
      })
      .catch((e) => setError(e?.message || 'Failed to load products'))
      .finally(() => setLoading(false));
  }, [isOpen, categoryId]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === products.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(products.map((p) => p.id)));
  };

  // Handle JSON file upload for variants
  const handleVariantsUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);

        // Support both formats: { variants: [...] } or direct array [...]
        const variants = Array.isArray(json) ? json : json.variants;

        if (!Array.isArray(variants) || variants.length === 0) {
          setError('JSON must contain variants array with option1, option2, price');
          return;
        }

        // Validate variant structure
        const valid = variants.every((v: any) =>
          typeof v.option1 === 'string' &&
          typeof v.option2 === 'string' &&
          typeof v.price === 'number'
        );

        if (!valid) {
          setError('Each variant must have: option1 (string), option2 (string), price (number)');
          return;
        }

        setCustomVariants(variants);
        setVariantsFileName(file.name);
        setError(null);
      } catch (err) {
        setError('Invalid JSON file');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  const clearCustomVariants = () => {
    setCustomVariants(null);
    setVariantsFileName(null);
  };

  const handleExport = async () => {
    if (selectedIds.size === 0) {
      setError('Please select at least one product');
      return;
    }
    setExporting(true);
    setError(null);
    try {
      const token = getToken();
      const response = await fetch('/api/export/temu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          productIds: Array.from(selectedIds),
          temuCategoryId,
          configType,
          skuPrefix,
          customVariants: customVariants || undefined,
          customDescription: description || undefined,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || err.error || 'Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `temu-${selectedTemuCategory?.productName || temuCategoryId}-${configType.toLowerCase()}-${Date.now()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Export to Temu</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Category: <span className="font-medium">{categoryName}</span>
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Temu Category */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Temu Category
              </label>
              <select
                value={temuCategoryId}
                onChange={(e) => setTemuCategoryId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              >
                {TEMU_CATEGORIES.map((cat) => (
                  <option key={cat.categoryId} value={cat.categoryId}>
                    [{cat.categoryId}] {cat.productName}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                SKU Prefix (CG)
              </label>
              <input
                type="text"
                value={skuPrefix}
                onChange={(e) => setSkuPrefix(e.target.value)}
                placeholder="e.g., CG or 100"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
            </div>
          </div>

          {/* Config Type */}
          {selectedTemuCategory && selectedTemuCategory.configs.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Template Type
              </label>
              <div className="flex gap-2 flex-wrap">
                {selectedTemuCategory.configs.map((type) => (
                  <button
                    key={type}
                    onClick={() => setConfigType(type)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium border transition ${
                      configType === type
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Product Description */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Product Description
              </label>
              {description !== defaultDescription && defaultDescription && (
                <button
                  type="button"
                  onClick={() => setDescription(defaultDescription)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Reset to default
                </button>
              )}
            </div>

            {loadingDescription ? (
              <div className="text-sm text-gray-500 py-2">Loading default description...</div>
            ) : (
              <>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter product description..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  rows={4}
                />
                {defaultDescription && description === defaultDescription && (
                  <p className="text-xs text-green-600 dark:text-green-400">
                    ✓ Using default description for {selectedTemuCategory?.productName}
                  </p>
                )}
                {description && description !== defaultDescription && (
                  <p className="text-xs text-orange-600 dark:text-orange-400">
                    ⚠ Description has been modified
                  </p>
                )}
              </>
            )}
          </div>

          {/* Variants */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Variants (Size × Price)
              </label>
              {customVariants && (
                <button
                  type="button"
                  onClick={clearCustomVariants}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Reset to default
                </button>
              )}
            </div>

            {loadingTemplate ? (
              <div className="text-sm text-gray-500 py-2">Loading default variants...</div>
            ) : customVariants ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                  <CheckIcon className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-orange-700 dark:text-orange-300">
                      {variantsFileName || 'Custom variants'}
                    </div>
                    <div className="text-xs text-orange-600 dark:text-orange-400">
                      {customVariants.length} variants (modified)
                    </div>
                  </div>
                </div>
                {/* Show custom variants */}
                <div className="max-h-32 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg p-2 text-xs bg-gray-50 dark:bg-gray-800">
                  {customVariants.map((v, i) => (
                    <div key={i} className="flex justify-between py-0.5">
                      <span>{v.option1 || v.option2 || `Variant ${i+1}`}</span>
                      <span className="text-gray-500">${v.price}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : defaultVariants.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <CheckIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-green-700 dark:text-green-300">
                      Default variants for {selectedTemuCategory?.productName}
                    </div>
                    <div className="text-xs text-green-600 dark:text-green-400">
                      {defaultVariants.length} variants
                    </div>
                  </div>
                </div>
                {/* Show default variants */}
                <div className="max-h-32 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg p-2 text-xs bg-gray-50 dark:bg-gray-800">
                  {defaultVariants.map((v, i) => (
                    <div key={i} className="flex justify-between py-0.5">
                      <span>{v.option1 || v.option2 || `Variant ${i+1}`}</span>
                      <span className="text-gray-500">${v.price}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500">Want to change? Enter new variants below:</p>
              </div>
            ) : (
              <div className="text-sm text-yellow-600 dark:text-yellow-400 py-2">
                ⚠ No default variants available. Please enter variants:
              </div>
            )}

            {/* Input area - always show if no custom variants */}
            {!customVariants && (
              <div className="space-y-2">
                {/* Paste JSON textarea */}
                <div className="flex gap-2">
                  <textarea
                    value={variantsText}
                    onChange={(e) => setVariantsText(e.target.value)}
                    placeholder="Color x Size x Price (e.g., White x 4 inch x 100)"
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 font-sans"
                    rows={4}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const text = variantsText.trim();
                      if (!text) {
                        setError('Please enter variants list');
                        return;
                      }
                      
                      try {
                        // Check if it's already JSON (for backward compatibility)
                        if (text.startsWith('[') || text.startsWith('{')) {
                          const json = JSON.parse(text);
                          const variants = Array.isArray(json) ? json : json.variants;
                          if (Array.isArray(variants) && variants.length > 0) {
                            setCustomVariants(variants);
                            setVariantsFileName(`${variants.length} variants (JSON)`);
                            setVariantsText('');
                            setError(null);
                            return;
                          }
                        }

                        // Otherwise, parse as "Color x Size x Price"
                        const lines = text.split('\n').filter(l => l.trim() !== '');
                        const parsedVariants: Variant[] = lines.map(line => {
                          const parts = line.split(/[x*|]/i).map(p => p.trim());

                          let color = '';
                          let size = '';
                          let price = 100;

                          if (parts.length >= 3) {
                            color = parts[0];
                            size = parts[1];
                            price = parseFloat(parts[2].replace(/[^0-9.]/g, '')) || 100;
                          } else if (parts.length === 2) {
                            // If 2 parts, check if the second part looks like a price
                            const p2 = parts[1].replace(/[^0-9.]/g, '');
                            const hasPriceIndicator = p2 !== '' && !parts[1].toLowerCase().includes('inch') && !parts[1].toLowerCase().includes('oz');
                            
                            if (hasPriceIndicator) {
                              size = parts[0];
                              price = parseFloat(p2) || 100;
                            } else {
                              color = parts[0];
                              size = parts[1];
                            }
                          } else {
                            size = parts[0];
                          }

                          return {
                            option1: color,
                            option2: size,
                            price
                          };
                        });

                        if (parsedVariants.length === 0) {
                          setError('Cannot parse data. Use format: Color x Size x Price');
                          return;
                        }

                        setCustomVariants(parsedVariants);
                        setVariantsFileName(`${parsedVariants.length} variants`);
                        setVariantsText('');
                        setError(null);
                        // Add a small success indicator or log
                        console.log('Parsed Variants:', parsedVariants);
                      } catch (err) {
                        setError('Error processing data. Please check the format.');
                      }
                    }}
                    className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 h-fit self-end mb-1"
                  >
                    Apply
                  </button>
                </div>
                {/* Or upload file */}
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <label className="cursor-pointer text-blue-600 dark:text-blue-400 hover:underline">
                    Upload .json
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleVariantsUpload}
                      className="sr-only"
                    />
                  </label>
                  <span>• Format: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-blue-600">Color x Size x Price</code> (one variant per line)</span>
                </div>
              </div>
            )}
          </div>

          {/* Product Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Products ({selectedIds.size}/{products.length})
              </label>
              <button
                onClick={toggleAll}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                {selectedIds.size === products.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            {loading ? (
              <div className="text-gray-500 py-4 text-center text-sm">Loading products...</div>
            ) : products.length === 0 ? (
              <div className="text-gray-500 py-4 text-center text-sm">No products in this category</div>
            ) : (
              <div className="border border-gray-200 dark:border-gray-600 rounded-lg max-h-56 overflow-y-auto">
                {products.map((p) => (
                  <label
                    key={p.id}
                    className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0 ${
                      selectedIds.has(p.id) ? 'bg-blue-50 dark:bg-blue-900/10' : ''
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        selectedIds.has(p.id) ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-500'
                      }`}
                    >
                      {selectedIds.has(p.id) && <CheckIcon className="h-3 w-3 text-white" />}
                    </div>
                    <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} className="sr-only" />
                    {p.images[0] && (
                      <img src={p.images[0].url} alt="" className="w-10 h-10 object-cover rounded flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {p.title || 'Untitled'}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {p.images.length} images
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md hover:bg-gray-50 dark:hover:bg-gray-500"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || selectedIds.size === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
          >
            <DownloadIcon className="h-4 w-4" />
            {exporting ? 'Exporting...' : `Export ${selectedIds.size} Products`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(TemuExportModal);
