import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Product,
  ProductImage,
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadImages,
  fileToDataUri,
} from '../services/productService';
import { pickFromDrive } from '../services/drivePicker';
import {
  Category,
  listCategories,
  createCategory,
  renameCategory,
  deleteCategory,
} from '../services/categoryService';
import ImagePreviewModal from './ImagePreviewModal';
import TemuExportModal from './TemuExportModal';

const PAGE_SIZE = 20;
const UPLOAD_CHUNK = 4; // images per upload request (keeps payload under server limit)

/* ---------- Icons ---------- */
type IconProps = { className?: string };
const FolderIcon = ({ className = 'h-6 w-6' }: IconProps) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
  </svg>
);
const EditIcon = ({ className = 'h-4 w-4' }: IconProps) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);
const TrashIcon = ({ className = 'h-4 w-4' }: IconProps) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);
const PhotoIcon = ({ className = 'h-4 w-4' }: IconProps) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);
const CloseIcon = ({ className = 'h-6 w-6' }: IconProps) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);
const PlusIcon = ({ className = 'h-4 w-4' }: IconProps) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
);
const UploadIcon = ({ className = 'h-4 w-4' }: IconProps) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h10a4 4 0 004-4M7 10l5-5m0 0l5 5m-5-5v12" />
  </svg>
);
const FolderPlusIcon = ({ className = 'h-4 w-4' }: IconProps) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m3-3H9" />
  </svg>
);
const DriveIcon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg className={className} viewBox="0 0 48 48">
    <path fill="#4285F4" d="M6 38l8-14h28l-8 14z" />
    <path fill="#34A853" d="M30 10H18l-12 21 6 7z" opacity=".75" />
    <path fill="#FBBC04" d="M42 24L30 10H18l14 24z" opacity=".75" />
  </svg>
);
const ExportIcon = ({ className = 'h-4 w-4' }: IconProps) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);

/* ---------- Root: routes to the right level ---------- */
const ProductManager: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const parts = location.pathname.split('/').filter(Boolean); // ['products','c',catId,'f',prodId]
  const isOpen = parts[0] === 'products';
  const catId = parts[1] === 'c' ? parts[2] : undefined;
  const prodId = parts[3] === 'f' ? parts[4] : undefined;
  const level: 1 | 2 | 3 = prodId ? 3 : catId ? 2 : 1;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 dark:bg-gray-900 overflow-y-auto">
      {level === 1 && <CategoriesView navigate={navigate} />}
      {level === 2 && <FoldersView categoryId={catId!} navigate={navigate} />}
      {level === 3 && <MockupsView categoryId={catId!} productId={prodId!} navigate={navigate} />}
    </div>
  );
};

/* ---------- Header / breadcrumb ---------- */
const Header: React.FC<{ crumbs: { label: string; to?: string }[]; navigate: (to: string) => void }> = ({ crumbs, navigate }) => (
  <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
    <div className="flex items-center gap-2 text-sm">
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-gray-400">/</span>}
          {c.to ? (
            <button onClick={() => navigate(c.to!)} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">{c.label}</button>
          ) : (
            <span className="text-gray-900 dark:text-white font-semibold">{c.label}</span>
          )}
        </span>
      ))}
    </div>
    <button onClick={() => navigate('/')} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500">
      <CloseIcon />
    </button>
  </div>
);

/* ---------- LEVEL 1: Categories ---------- */
const CategoriesView: React.FC<{ navigate: (to: string) => void }> = ({ navigate }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [uncategorized, setUncategorized] = useState(0);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const cats = await listCategories();
      setCategories(cats);
      const res = await listProducts({ categoryId: 'none', pageSize: 1 });
      setUncategorized(res.total);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    try { await createCategory(name); setNewName(''); load(); }
    catch (e: any) { setError(e?.message || 'Failed'); }
  };
  const rename = async (c: Category) => {
    const name = prompt('Rename category:', c.name);
    if (!name || !name.trim() || name === c.name) return;
    try { await renameCategory(c.id, name.trim()); load(); }
    catch (e: any) { setError(e?.message || 'Failed'); }
  };
  const remove = async (c: Category) => {
    if (!confirm(`Delete category "${c.name}"? (folders inside move to Uncategorized)`)) return;
    try { await deleteCategory(c.id); load(); }
    catch (e: any) { setError(e?.message || 'Failed'); }
  };

  return (
    <>
      <Header crumbs={[{ label: 'Products' }]} navigate={navigate} />
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {error && <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg">{error}</div>}

        <div className="flex items-center gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="New category name…"
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white flex-1 max-w-sm" />
          <button onClick={add} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700">
            <PlusIcon /> New Category
          </button>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">Categories</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {categories.map((c) => (
              <div key={c.id} className="group relative border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 hover:shadow-md transition">
                <button onClick={() => navigate(`/products/c/${c.id}`)} className="flex items-center gap-3 p-4 w-full text-left">
                  <FolderIcon className="h-6 w-6 text-amber-500 flex-shrink-0" />
                  <span className="text-sm text-gray-900 dark:text-white truncate">{c.name}</span>
                </button>
                <span className="absolute top-1.5 right-2 text-[11px] text-gray-400">{c.productCount ?? 0}</span>
                <div className="absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button onClick={() => rename(c)} className="p-1 text-gray-400 hover:text-blue-500" title="Rename"><EditIcon className="h-3.5 w-3.5" /></button>
                  <button onClick={() => remove(c)} className="p-1 text-gray-400 hover:text-red-500" title="Delete"><TrashIcon className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
            <button onClick={() => navigate('/products/c/uncategorized')}
              className="flex items-center gap-3 p-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 hover:shadow-md transition text-left">
              <FolderIcon className="h-6 w-6 text-gray-400 flex-shrink-0" />
              <span className="text-sm text-gray-500 dark:text-gray-400 truncate">Uncategorized ({uncategorized})</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

/* ---------- LEVEL 2: Folders in a category ---------- */
const FoldersView: React.FC<{ categoryId: string; navigate: (to: string) => void }> = ({ categoryId, navigate }) => {
  const [categoryName, setCategoryName] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [newFolder, setNewFolder] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  const apiCategoryId = categoryId === 'uncategorized' ? 'none' : categoryId;

  const load = useCallback(async (toPage = 1) => {
    setLoading(true);
    try {
      const res = await listProducts({ categoryId: apiCategoryId, page: toPage, pageSize: PAGE_SIZE });
      setProducts(res.products); setTotal(res.total); setTotalPages(res.totalPages || 1); setPage(res.page);
    } catch (e: any) { setError(e?.message || 'Failed to load'); }
    finally { setLoading(false); }
  }, [apiCategoryId]);

  useEffect(() => {
    load(1);
    if (categoryId === 'uncategorized') { setCategoryName('Uncategorized'); return; }
    listCategories().then((cats) => setCategoryName(cats.find((c) => c.id === categoryId)?.name || 'Category'));
  }, [categoryId, load]);

  const create = async () => {
    const name = newFolder.trim();
    if (!name) return;
    setCreating(true);
    try {
      const p = await createProduct({ title: name, images: [], status: 'DRAFT', categoryId: categoryId === 'uncategorized' ? null : categoryId });
      setNewFolder('');
      navigate(`/products/c/${categoryId}/f/${p.id}`);
    } catch (e: any) { setError(e?.message || 'Failed'); }
    finally { setCreating(false); }
  };

  const remove = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Delete this folder (and all its mockups)?')) return;
    try { await deleteProduct(id); load(page); }
    catch (e: any) { setError(e?.message || 'Failed'); }
  };

  return (
    <>
      <Header crumbs={[{ label: 'Products', to: '/products' }, { label: categoryName }]} navigate={navigate} />
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {error && <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg">{error}</div>}

        <div className="flex items-center gap-2">
          <input value={newFolder} onChange={(e) => setNewFolder(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()}
            placeholder="New product (folder) name…"
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white flex-1 max-w-sm" />
          <button onClick={create} disabled={creating || !newFolder.trim()} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
            <FolderPlusIcon /> {creating ? 'Creating…' : 'New Folder'}
          </button>
          <button
            onClick={() => setShowExportModal(true)}
            disabled={total === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            title="Export to Temu"
          >
            <ExportIcon /> Export Temu
          </button>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">Folders {total > 0 && `(${total})`}</h2>
          {loading ? <p className="text-gray-500">Loading…</p>
            : products.length === 0 ? <p className="text-gray-500">No folders yet. Create one above.</p>
            : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {products.map((p) => (
                  <div key={p.id} className="group relative border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 hover:shadow-md transition">
                    <button onClick={() => navigate(`/products/c/${categoryId}/f/${p.id}`)} className="flex items-center gap-3 p-4 w-full text-left">
                      <FolderIcon className="h-6 w-6 text-amber-500 flex-shrink-0" />
                      <span className="text-sm text-gray-900 dark:text-white truncate">{p.title || 'Untitled'}</span>
                    </button>
                    <span className="absolute top-1.5 right-2 inline-flex items-center gap-0.5 text-[11px] text-gray-400">
                      <PhotoIcon className="h-3 w-3" /> {p.images.length}
                    </span>
                    <button onClick={(e) => remove(e, p.id)} className="absolute bottom-1.5 right-1.5 p-1 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500" title="Delete">
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-6">
                  <button onClick={() => load(page - 1)} disabled={page <= 1 || loading} className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-40">← Prev</button>
                  <span className="text-sm text-gray-600 dark:text-gray-400 px-2">Page {page} / {totalPages}</span>
                  <button onClick={() => load(page + 1)} disabled={page >= totalPages || loading} className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-40">Next →</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <TemuExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        categoryId={categoryId}
        categoryName={categoryName}
      />
    </>
  );
};

/* ---------- LEVEL 3: Mockups in a folder ---------- */
const MockupsView: React.FC<{ categoryId: string; productId: string; navigate: (to: string) => void }> = ({ categoryId, productId, navigate }) => {
  const [product, setProduct] = useState<Product | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [images, setImages] = useState<ProductImage[]>([]);
  const [title, setTitle] = useState('');
  const [listingTitle, setListingTitle] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<Product['status']>('DRAFT');
  const [uploading, setUploading] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const categorySlugRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    getProduct(productId).then((p) => {
      setProduct(p); setImages(p.images);
      setTitle(p.title || ''); setListingTitle(p.listingTitle || '');
      setPrice(p.price != null ? String(p.price) : '');
      setCurrency(p.currency || 'USD'); setDescription(p.description || ''); setStatus(p.status);
    }).catch((e) => setError(e?.message || 'Failed to load'));

    if (categoryId === 'uncategorized') { setCategoryName('Uncategorized'); return; }
    listCategories().then((cats) => {
      const c = cats.find((x) => x.id === categoryId);
      setCategoryName(c?.name || 'Category');
      categorySlugRef.current = c?.slug;
    });
  }, [productId, categoryId]);

  const persistImages = async (next: ProductImage[]) => {
    setImages(next);
    await updateProduct(productId, { images: next } as any);
  };

  const addFiles = async (rawFiles: File[]) => {
    const files = rawFiles.filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    setUploading(true); setError(null);
    try {
      let next = [...images];
      // Small chunks keep each request body well under the server limit.
      for (let i = 0; i < files.length; i += UPLOAD_CHUNK) {
        const dataUris = await Promise.all(files.slice(i, i + UPLOAD_CHUNK).map(fileToDataUri));
        const uploaded = await uploadImages(dataUris, categorySlugRef.current);
        next = [...next, ...uploaded];
        await persistImages(next); // save incrementally so progress isn't lost on error
      }
    } catch (e: any) { setError(e?.message || 'Upload failed'); }
    finally { setUploading(false); }
  };

  const addFromDrive = async () => {
    setUploading(true); setError(null);
    try {
      const dataUris = await pickFromDrive();
      if (dataUris.length === 0) return;
      let next = [...images];
      for (let i = 0; i < dataUris.length; i += UPLOAD_CHUNK) {
        const uploaded = await uploadImages(dataUris.slice(i, i + UPLOAD_CHUNK), categorySlugRef.current);
        next = [...next, ...uploaded];
        await persistImages(next);
      }
    } catch (e: any) { setError(e?.message || 'Drive failed'); }
    finally { setUploading(false); }
  };

  const removeMockup = (publicId: string) => persistImages(images.filter((im) => im.publicId !== publicId));

  const saveInfo = async () => {
    setSavingInfo(true); setError(null);
    try {
      await updateProduct(productId, {
        title: title.trim() || undefined,
        listingTitle: listingTitle.trim() || null,
        price: price.trim() === '' ? undefined : (price as any),
        currency, status,
        description: description.trim() || undefined,
      } as any);
      // After saving, go back to the folder list (previous level).
      navigate(`/products/c/${categoryId}`);
    } catch (e: any) { setError(e?.message || 'Save failed'); }
    finally { setSavingInfo(false); }
  };

  if (!product) {
    return (
      <>
        <Header crumbs={[{ label: 'Products', to: '/products' }]} navigate={navigate} />
        <p className="text-gray-500 p-6">{error || 'Loading…'}</p>
      </>
    );
  }

  return (
    <>
      <Header
        crumbs={[
          { label: 'Products', to: '/products' },
          { label: categoryName, to: `/products/c/${categoryId}` },
          { label: title || 'Product' },
        ]}
        navigate={navigate}
      />
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {error && <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg">{error}</div>}

        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Product Info</h2>
          <div className="mb-3">
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Folder name (internal)</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
          </div>
          <div className="mb-3">
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Listing Title</label>
            <input
              value={listingTitle}
              onChange={(e) => setListingTitle(e.target.value)}
              placeholder="Tiêu đề đăng bán (marketplace)…"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div className="mb-3">
            <div className="grid grid-cols-3 gap-2 max-w-md">
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Price</label>
                <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Currency</label>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full px-2 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                  <option>USD</option><option>EUR</option><option>AUD</option><option>VND</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as Product['status'])} className="w-full px-2 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                  <option value="DRAFT">DRAFT</option><option value="ACTIVE">ACTIVE</option><option value="ARCHIVED">ARCHIVED</option>
                </select>
              </div>
            </div>
          </div>
          <div className="mb-3">
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
          </div>
          <button onClick={saveInfo} disabled={savingInfo} className="px-5 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {savingInfo ? 'Saving…' : 'Save Info'}
          </button>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Mockups ({images.length})</h2>
            <div className="flex gap-2">
              <button onClick={() => fileRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"><UploadIcon className="h-4 w-4" /> Images</button>
              <button onClick={() => folderRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-50"><FolderIcon className="h-4 w-4" /> Folder</button>
              <button onClick={addFromDrive} disabled={uploading} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-50"><DriveIcon className="h-4 w-4" /> Drive</button>
            </div>
          </div>
          {uploading && <p className="text-sm text-blue-500 animate-pulse mb-2">Uploading…</p>}
          {images.length === 0 ? (
            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-10 text-center text-gray-400 text-sm">No mockups yet. Click "Images" to add.</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {images.map((im) => (
                <div key={im.publicId} className="relative group aspect-square">
                  <button
                    type="button"
                    onClick={() => setPreviewUrl(im.url)}
                    className="block w-full h-full cursor-zoom-in"
                    title="Click to preview"
                  >
                    <img src={im.url} alt="" className="w-full h-full object-cover rounded-lg" />
                  </button>
                  <button onClick={() => removeMockup(im.publicId)} className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-red-600">
                    <CloseIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(Array.from(e.target.files || [])); if (fileRef.current) fileRef.current.value = ''; }} />
          <input ref={folderRef} type="file" webkitdirectory="" directory="" multiple className="hidden" onChange={(e) => { addFiles(Array.from(e.target.files || [])); if (folderRef.current) folderRef.current.value = ''; }} />
        </section>
      </div>

      <ImagePreviewModal imageUrl={previewUrl} productName={title} onClose={() => setPreviewUrl(null)} />
    </>
  );
};

export default ProductManager;
