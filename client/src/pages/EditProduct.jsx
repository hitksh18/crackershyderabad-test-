import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { doc, getDoc, updateDoc, collection, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { uploadImage } from '../utils/uploadImage';
import { useNavigate, useParams, Link } from 'react-router-dom';
import toast from '../utils/toast';
import {
  ArrowLeft,
  Boxes,
  Image as ImageIcon,
  ImagePlus,
  IndianRupee,
  Layers,
  PackageX,
  Plus,
  Save,
  Star,
  Tag,
} from 'lucide-react';
import FormSection from '../components/admin/FormSection';
import FormField from '../components/admin/FormField';
import CategoryPicker from '../components/admin/CategoryPicker';
import ProductPriceFields from '../components/admin/ProductPriceFields';
import ProductSeoFields from '../components/admin/ProductSeoFields';
import ToggleCard from '../components/admin/ToggleCard';
import StickySaveBar from '../components/admin/StickySaveBar';
import BrandDialog from '../components/admin/BrandDialog';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { revealVariants } from '../lib/motion';
import {
  fetchTradePricing,
  saveTradePricing,
  stripTradeFields,
  TRADE_FIELD_DELETIONS,
} from '../lib/tradePricing';
import { slugify, ensureUniqueSlug } from '../lib/productLinks';

const categories = ['Rockets', 'Sparkles', 'Ground Chakkars', 'Fancy Fireworks', 'Gift Boxes', 'Flower Pots', 'Bombs', 'Garlands', 'Kids Special', 'Guns, Rolls & Pop Pop', 'Threads and Novelties'];

const describedBy = (id, error, hint) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

const EditProduct = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [imageProgress, setImageProgress] = useState(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [touched, setTouched] = useState({});
  const [brands, setBrands] = useState([]);
  const [showAddBrand, setShowAddBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [newBrandLogo, setNewBrandLogo] = useState('');
  const [newBrandDescription, setNewBrandDescription] = useState('');
  const [brandLogoFile, setBrandLogoFile] = useState(null);
  const [uploadingBrandLogo, setUploadingBrandLogo] = useState(false);
  // True when the trade-pricing read failed, so the form holds fallbacks rather
  // than real prices and must not be written back over them.
  const pricingLoadFailed = useRef(false);
  // Current slug history, captured when the product loads, so a rename can
  // retire the old slug into `oldSlugs` instead of breaking its links.
  const currentSlugRef = useRef(null);
  const currentOldSlugsRef = useRef([]);
  const [formData, setFormData] = useState({
    name: '',
    categories: [],
    onlinePrice: '',
    discountPrice: '',
    offlineMRP: '',
    offlineDiscountPrice: '',
    // Carried through so saving does not blank out a legacy offlinePrice that
    // only exists in `productPricing`. No input renders it.
    offlinePrice: '',
    outOfStock: false,
    description: '',
    isFeatured: false,
    sortOrder: '',
    brand: '',
  });
  const [seoData, setSeoData] = useState({
    title: '',
    description: '',
    keywords: '',
    slug: '',
    tags: '',
  });

  const fetchProduct = useCallback(async () => {
    try {
      const docRef = doc(db, 'products', id);
      // The offline prices live in the staff-only `productPricing` collection.
      // Fetch alongside the product so the form is not gated behind two trips.
      const [docSnap, pricing] = await Promise.all([
        getDoc(docRef),
        fetchTradePricing(id).catch((pricingError) => {
          console.error('Error fetching trade pricing:', pricingError);
          toast.error('Could not load the store prices for this product');
          // Remember the failure: saving must not overwrite prices we never read.
          pricingLoadFailed.current = true;
          return null;
        }),
      ]);
      if (docSnap.exists()) {
        const data = { ...docSnap.data(), ...(pricing || {}) };
        currentSlugRef.current = data.slug || null;
        currentOldSlugsRef.current = Array.isArray(data.oldSlugs)
          ? data.oldSlugs.filter((s) => typeof s === 'string')
          : [];
        setFormData({
          name: data.name || '',
          categories: data.categories || (data.category ? [data.category] : []),
          onlinePrice: data.onlinePrice || data.price || '',
          discountPrice: data.discountPrice || '',
          offlineMRP: data.offlineMRP || data.offlinePrice || data.price || '',
          offlineDiscountPrice: data.offlineDiscountPrice || '',
          offlinePrice: data.offlinePrice || '',
          outOfStock: data.outOfStock || false,
          description: data.description || '',
          isFeatured: data.isFeatured || false,
          sortOrder: data.sortOrder != null ? String(data.sortOrder) : '',
          brand: typeof data.brand === 'string' ? data.brand : (data.brand?.name || ''),
        });
        setImagePreview(data.imageURL || '');

        if (data.seo) {
          setSeoData({
            title: data.seo.title || '',
            description: data.seo.description || '',
            keywords: Array.isArray(data.seo.keywords) ? data.seo.keywords.join(', ') : '',
            slug: data.seo.slug || '',
            tags: Array.isArray(data.seo.tags) ? data.seo.tags.join(', ') : '',
          });
        }
      }
    } catch (error) {
      console.error('Error fetching product:', error);
      toast.error('Failed to load product');
    }
  }, [id]);

  const fetchBrands = useCallback(async () => {
    try {
      const snapshot = await getDocs(collection(db, 'brands'));
      const brandsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setBrands(brandsList);
    } catch (error) {
      console.error('Error fetching brands:', error);
    }
  }, []);

  useEffect(() => {
    fetchProduct();
    fetchBrands();
  }, [fetchProduct, fetchBrands]);

  const handleBrandLogoFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setBrandLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewBrandLogo(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddBrand = async () => {
    if (!newBrandName.trim()) {
      toast.error('Please enter a brand name');
      return;
    }

    try {
      setUploadingBrandLogo(true);
      let logoURL = newBrandLogo.trim();

      if (brandLogoFile) {
        try {
          toast.loading('Removing background from logo...', { id: 'brand-logo-upload' });
          logoURL = await uploadImage(brandLogoFile, {
            removeBackground: true,
            watermark: false,
            onProgress: (key, current, total) => {
              if (total > 0) {
                const pct = Math.min(100, Math.round((current / total) * 100));
                toast.loading(`Processing logo... ${pct}%`, { id: 'brand-logo-upload' });
              }
            }
          });
          toast.dismiss('brand-logo-upload');
        } catch (uploadError) {
          toast.dismiss('brand-logo-upload');
          console.error('Logo upload failed:', uploadError);
          toast.error('Logo upload failed. Using URL instead if provided.');
          logoURL = newBrandLogo.startsWith('data:') ? '' : newBrandLogo.trim();
        }
      }

      const brandData = {
        name: newBrandName.trim(),
        logo: logoURL,
        description: newBrandDescription.trim() || '',
        createdAt: new Date()
      };

      const docRef = await addDoc(collection(db, 'brands'), brandData);

      setBrands([...brands, { id: docRef.id, ...brandData }]);
      setFormData({ ...formData, brand: newBrandName.trim() });
      setNewBrandName('');
      setNewBrandLogo('');
      setNewBrandDescription('');
      setBrandLogoFile(null);
      setShowAddBrand(false);
      toast.success('Brand added successfully!');
    } catch (error) {
      console.error('Error adding brand:', error);
      toast.error('Failed to add brand. Please check Firebase permissions.');
    } finally {
      setUploadingBrandLogo(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSeoChange = (e) => {
    setSeoData({ ...seoData, [e.target.name]: e.target.value });
  };

  const handleCategoryToggle = (category) => {
    setFormData(prev => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter(c => c !== category)
        : [...prev.categories, category]
    }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      // Release the previous object URL before making a new one, or every
      // re-selection leaks a blob that lives until the tab closes.
      setImagePreview((prev) => {
        if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
    }
  };

  const markTouched = (e) => {
    const key = e.target.name;
    if (!key) return;
    setTouched(prev => (prev[key] ? prev : { ...prev, [key]: true }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitAttempted(true);
    setLoading(true);

    try {
      let imageURL = imagePreview;

      if (imageFile) {
        toast.loading('Removing background from image...', { id: 'product-img-upload' });
        setImageProgress(0);
        try {
          imageURL = await uploadImage(imageFile, {
            removeBackground: true,
            onProgress: (key, current, total) => {
              if (total > 0) {
                const pct = Math.min(100, Math.round((current / total) * 100));
                setImageProgress(pct);
                toast.loading(`Processing image... ${pct}%`, { id: 'product-img-upload' });
              }
            }
          });
        } catch (uploadError) {
          toast.error(uploadError.message || 'Image upload failed', { id: 'product-img-upload' });
          setImageProgress(null);
          setLoading(false);
          return;
        }
        toast.success('Image uploaded', { id: 'product-img-upload' });
        setImageProgress(100);
      }

      const seoObject = {
        title: seoData.title || formData.name,
        description: seoData.description || formData.description,
        keywords: seoData.keywords ? seoData.keywords.split(',').map(k => k.trim()).filter(k => k) : [],
        slug: seoData.slug || slugify(formData.name),
        tags: seoData.tags ? seoData.tags.split(',').map(t => t.trim()).filter(t => t) : []
      };

      let slug;
      try {
        slug = await ensureUniqueSlug(seoObject.slug || formData.name, id);
      } catch {
        slug = slugify(seoObject.slug || formData.name);
      }
      seoObject.slug = slug;

      // Retire the previous canonical slug so old links keep resolving.
      const retiredSlug = currentSlugRef.current;
      const oldSlugs = [
        ...currentOldSlugsRef.current.filter((s) => s && s !== slug),
        ...(retiredSlug && retiredSlug !== slug ? [retiredSlug] : []),
      ].slice(-25);

      // `products` is world-readable, so the offline (trade) prices never go on
      // this document — they are written to `productPricing` right below.
      const productData = {
        name: formData.name,
        categories: formData.categories,
        category: formData.categories[0] || '',
        onlinePrice: parseFloat(formData.onlinePrice),
        discountPrice: formData.discountPrice ? parseFloat(formData.discountPrice) : null,
        outOfStock: formData.outOfStock,
        description: formData.description,
        imageURL,
        isFeatured: formData.isFeatured,
        ...(formData.sortOrder !== '' ? { sortOrder: parseInt(formData.sortOrder, 10) } : {}),
        brand: formData.brand || null,
        seo: seoObject,
        slug,
        oldSlugs,
        updatedAt: new Date(),
      };

      // Also clear any trade fields still sitting on the public product
      // document. Omitting the keys leaves a pre-migration copy in place, which
      // stays world-readable and then drifts from the authoritative one.
      await updateDoc(doc(db, 'products', id), {
        ...stripTradeFields(productData),
        ...TRADE_FIELD_DELETIONS,
      });

      if (pricingLoadFailed.current) {
        // The form was populated from fallbacks, not from the real pricing
        // document. Writing it back would silently replace genuine trade prices
        // with guesses, so leave that document untouched.
        toast.error(
          'Product updated. Store prices were NOT saved because they could not be loaded — reload the page before editing them.',
          { duration: 8000 }
        );
        navigate('/admin/all-products');
        return;
      }

      try {
        await saveTradePricing(id, formData);
      } catch (pricingError) {
        console.error('Error saving trade pricing:', pricingError);
        toast.error('Product updated, but the store prices did not save — try saving again.');
        return;
      }

      toast.success('Product updated successfully!');
      navigate('/admin/all-products');
    } catch (error) {
      console.error('Error updating product:', error);
      toast.error('Failed to update product');
    } finally {
      setLoading(false);
      setImageProgress(null);
    }
  };

  const revealed = (field) => submitAttempted || !!touched[field];
  const errors = {
    name: revealed('name') && !formData.name ? 'Product name is required.' : '',
    onlinePrice: revealed('onlinePrice') && !formData.onlinePrice ? 'Online price is required.' : '',
    offlineMRP: revealed('offlineMRP') && !formData.offlineMRP ? 'Offline MRP is required.' : '',
    categories: submitAttempted && formData.categories.length === 0 ? 'Select at least one category.' : '',
  };

  return (
    <div className="min-h-screen section-pad-sm" style={{ background: 'var(--surface-page)' }}>
      <div className="shell-narrow">
        <motion.header
          initial="hidden"
          animate="visible"
          variants={revealVariants(reduced, 14)}
          className="mb-6"
        >
          <Link
            to="/admin/dashboard"
            className="mb-5 inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold"
            style={{ color: 'var(--text-muted)' }}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Dashboard
          </Link>

          <p className="label-caps">Catalogue</p>
          <h1 className="section-title mt-1">Edit Product</h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            {formData.name ? `Editing “${formData.name}”.` : 'Loading the current record.'} Changes go live as soon as you save.
          </p>
        </motion.header>

        <motion.form
          onSubmit={handleSubmit}
          initial="hidden"
          animate="visible"
          variants={revealVariants(reduced, 14)}
          className="space-y-4"
        >
          {/* 1 — Identity */}
          <FormSection
            index={1}
            icon={Tag}
            title="Identity"
            description="What the product is called and who makes it."
          >
            <FormField id="product-name" label="Product Name" required error={errors.name}>
              <input
                id="product-name"
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                onBlur={markTouched}
                aria-invalid={errors.name ? 'true' : undefined}
                aria-describedby={describedBy('product-name', errors.name, null)}
                className="input-premium"
                required
              />
            </FormField>

            <FormField id="product-brand" label="Product Brand" hint="Optional. Pick an existing brand or create a new one.">
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  id="product-brand"
                  name="brand"
                  value={formData.brand}
                  onChange={handleChange}
                  aria-describedby="product-brand-hint"
                  className="input-premium sm:flex-1"
                >
                  <option value="">Select Brand (Optional)</option>
                  {brands.map(brand => (
                    <option key={brand.id} value={brand.name}>{brand.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowAddBrand(true)}
                  className="btn-outline shrink-0"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add Brand
                </button>
              </div>
            </FormField>

            <FormField id="product-description" label="Description">
              <textarea
                id="product-description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows="4"
                className="input-premium"
              />
            </FormField>
          </FormSection>

          {/* 2 — Media */}
          <FormSection
            index={2}
            icon={ImagePlus}
            title="Media"
            description="Replace the image by uploading a file, or point at a hosted URL."
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div
                className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-[var(--r-md)] border"
                style={{ background: 'var(--surface-raised)', borderColor: 'var(--hairline)' }}
              >
                {imagePreview ? (
                  <img src={imagePreview} alt="Product image preview" className="h-full w-full object-contain p-1.5" />
                ) : (
                  <ImageIcon className="h-8 w-8" aria-hidden="true" style={{ color: 'var(--text-subtle)' }} />
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-4">
                <FormField
                  id="product-image-file"
                  label="Upload from device"
                  hint="Background removal runs before the file is saved."
                >
                  <input
                    id="product-image-file"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    aria-describedby="product-image-file-hint"
                    className="w-full cursor-pointer text-sm file:mr-3 file:min-h-[44px] file:cursor-pointer file:rounded-[var(--r-sm)] file:border file:border-solid file:border-[color:var(--hairline-strong)] file:bg-[color:var(--surface-sunken)] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[color:var(--text-body)]"
                    style={{ color: 'var(--text-muted)' }}
                  />
                </FormField>

                <FormField id="product-image-url" label="Or enter image URL">
                  <input
                    id="product-image-url"
                    type="url"
                    value={imagePreview}
                    onChange={(e) => setImagePreview(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    className="input-premium"
                  />
                </FormField>

                {imageProgress !== null && (
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
                      <span style={{ color: 'var(--text-body)' }}>Processing image</span>
                      <span className="tabular" style={{ color: 'var(--ember-600)' }}>{imageProgress}%</span>
                    </div>
                    <div
                      role="progressbar"
                      aria-valuenow={imageProgress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Image processing progress"
                      className="h-1.5 w-full overflow-hidden rounded-full"
                      style={{ background: 'var(--surface-sunken)' }}
                    >
                      <span
                        className="block h-full origin-left rounded-full transition-transform duration-300 ease-out-soft"
                        style={{ background: 'var(--grad-ember)', transform: `scaleX(${imageProgress / 100})` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </FormSection>

          {/* 3 — Pricing */}
          <FormSection
            index={3}
            icon={IndianRupee}
            title="Pricing"
            description="Website prices drive the storefront. Store prices drive the billing screen."
          >
            <ProductPriceFields
              formData={formData}
              onChange={handleChange}
              onBlur={markTouched}
              errors={errors}
            />
          </FormSection>

          {/* 4 — Categorisation */}
          <FormSection
            index={4}
            icon={Layers}
            title="Categorisation"
            description="Where the product appears on the storefront and how search engines read it."
          >
            <div>
              <p
                className="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-sm font-semibold"
                style={{ color: 'var(--text-strong)' }}
              >
                Categories
                <span
                  className="text-[0.625rem] font-bold uppercase tracking-[0.16em]"
                  style={{ color: 'var(--crimson-600)' }}
                >
                  Required
                </span>
                <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
                  Select all that apply
                </span>
              </p>

              <CategoryPicker
                options={categories}
                selected={formData.categories}
                onToggle={handleCategoryToggle}
                invalid={!!errors.categories}
                describedBy={errors.categories ? 'categories-error' : 'categories-hint'}
              />

              {errors.categories ? (
                <p
                  id="categories-error"
                  role="alert"
                  className="mt-2 text-xs font-semibold"
                  style={{ color: 'var(--crimson-600)' }}
                >
                  {errors.categories}
                </p>
              ) : (
                <p id="categories-hint" className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Products can belong to multiple categories for better filtering
                </p>
              )}
            </div>

            <ProductSeoFields seoData={seoData} onChange={handleSeoChange} />
          </FormSection>

          {/* 5 — Availability */}
          <FormSection
            index={5}
            icon={Boxes}
            title="Availability"
            description="Stock state, storefront prominence and the position in the product list."
          >
            <div className="grid gap-3 md:grid-cols-2">
              <ToggleCard
                id="isFeatured"
                icon={Star}
                tone="gold"
                label="Mark as Featured Product"
                description="Featured products are pulled into the storefront highlights."
                checked={formData.isFeatured}
                onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
              />
              <ToggleCard
                id="outOfStock"
                icon={PackageX}
                tone="crimson"
                label="Out of Stock"
                description="Hides the buy action and flags the product in the register."
                checked={formData.outOfStock}
                onChange={(e) => setFormData({ ...formData, outOfStock: e.target.checked })}
              />
            </div>

            <FormField id="sortOrder" label="Display Order" hint="lower = shown first">
              <input
                id="sortOrder"
                type="number"
                min="0"
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: e.target.value })}
                placeholder="0"
                aria-describedby="sortOrder-hint"
                className="input-premium tabular max-w-[10rem]"
              />
            </FormField>
          </FormSection>

          <StickySaveBar
            loading={loading}
            icon={Save}
            label="Update Product"
            loadingLabel="Updating Product..."
            hint="Name, online price and offline MRP are required."
          />
        </motion.form>
      </div>

      <BrandDialog
        open={showAddBrand}
        reduced={reduced}
        name={newBrandName}
        onNameChange={(e) => setNewBrandName(e.target.value)}
        logo={newBrandLogo}
        onLogoChange={(e) => {
          setNewBrandLogo(e.target.value);
          setBrandLogoFile(null);
        }}
        logoFile={brandLogoFile}
        onLogoFileChange={handleBrandLogoFileChange}
        description={newBrandDescription}
        onDescriptionChange={(e) => setNewBrandDescription(e.target.value)}
        submitting={uploadingBrandLogo}
        onSubmit={handleAddBrand}
        onClose={() => setShowAddBrand(false)}
        onCancel={() => {
          setShowAddBrand(false);
          setNewBrandName('');
          setNewBrandLogo('');
          setNewBrandDescription('');
          setBrandLogoFile(null);
        }}
      />
    </div>
  );
};

export default EditProduct;
