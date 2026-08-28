import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import toast from '../utils/toast';
import { Banknote, Smartphone, CheckCircle2, AlertTriangle, ShoppingBag, ShieldCheck, MapPin } from 'lucide-react';
import { sendOrderSMS } from '../utils/sms';
import CheckoutSteps from '../components/checkout/CheckoutSteps';
import CheckoutField from '../components/checkout/CheckoutField';
import ConfirmOrderModal from '../components/checkout/ConfirmOrderModal';
import DeliveryLocationPicker from '../components/checkout/DeliveryLocationPicker';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { revealVariants } from '../lib/motion';
import { inr } from '../lib/currency';
import { normaliseCoords } from '../utils/deliveryLocation';
import Seo from '../components/Seo';

const unitPriceOf = (item) => item.discountPrice || item.onlinePrice || item.price || 0;

const Checkout = () => {
  const { cart, hydrated, getCartTotal, clearCart, updateQuantity, removeFromCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [loading, setLoading] = useState(false);
  const [adminSettings, setAdminSettings] = useState({
    minimumOrderValue: 500,
    minimumOrderValueEnabled: true,
    deliveryPinEnabled: true
  });
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    pincode: '',
  });
  const [sameAsBilling, setSameAsBilling] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState({
    flatNo: '',
    streetNo: '',
    area: '',
    city: '',
    state: '',
    pincode: '',
    altPhone: '',
  });
  /* The pinned doorstep, as { lat, lng } or null. Kept beside the typed address
     rather than derived from it: the two answer different questions, and in the
     unaddressed layouts around Hyderabad the pin is the more reliable one. */
  const [pin, setPin] = useState(null);
  /* Which fields the map filled in. Re-pinning may overwrite these, but never a
     field the customer typed themselves — see applyResolvedAddress. */
  const autoFilledRef = useRef(new Set());
  const orderPlacedRef = useRef(false);
  const formRef = useRef(null);
  const [showConfirm, setShowConfirm] = useState(false);
  // Presentation-only: which fields the visitor has left, so inline errors
  // never shout at an untouched form. Submission validation is unchanged.
  const [touched, setTouched] = useState({});
  const STORAGE_KEY = 'checkout_details';

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.formData) setFormData((prev) => ({ ...prev, ...parsed.formData }));
        if (parsed.deliveryAddress) setDeliveryAddress((prev) => ({ ...prev, ...parsed.deliveryAddress }));
        if (typeof parsed.sameAsBilling === 'boolean') setSameAsBilling(parsed.sameAsBilling);
        /* Re-validated on the way in: this came from storage the page does not
           exclusively own, and a bad pin must not survive a reload. */
        if (parsed.pin) setPin(normaliseCoords(parsed.pin.lat, parsed.pin.lng));
        if (Array.isArray(parsed.autoFilled)) autoFilledRef.current = new Set(parsed.autoFilled);
      }
    } catch (error) {
      console.error('Error restoring checkout details:', error);
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          formData,
          deliveryAddress,
          sameAsBilling,
          pin,
          /* Persisted so that after a reload, re-pinning still knows which
             fields are its own to overwrite and which the customer typed. */
          autoFilled: [...autoFilledRef.current],
        })
      );
    } catch (error) {
      console.error('Error saving checkout details:', error);
    }
  }, [formData, deliveryAddress, sameAsBilling, pin]);

  useEffect(() => {
    const fetchAdminSettings = async () => {
      try {
        const adminDoc = await getDoc(doc(db, 'adminSettings', 'main'));
        if (adminDoc.exists()) {
          const data = adminDoc.data();
          const migratedData = { ...data };

          if ('minimumOrderValueLocked' in data && !('minimumOrderValueEnabled' in data)) {
            migratedData.minimumOrderValueEnabled = data.minimumOrderValueLocked !== false;
          }

          setAdminSettings(prev => ({ ...prev, ...migratedData }));
        }
      } catch (error) {
        console.error('Error fetching admin settings:', error);
      }
    };
    fetchAdminSettings();
  }, []);

  const handleChange = (e) => {
    /* Typing into a field claims it: a later re-pin will leave it alone. */
    autoFilledRef.current.delete(e.target.name);
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const changeDelivery = (key, value) => {
    autoFilledRef.current.delete(`delivery.${key}`);
    setDeliveryAddress((prev) => ({ ...prev, [key]: value }));
  };

  /**
   * Write the reverse-geocoded address into the form.
   *
   * The rule is that the map may fill a blank field, and may correct a field it
   * filled itself, but never touches something the customer typed. Without that
   * last part, nudging the pin by ten metres would silently wipe a flat number
   * only the customer could know — the map has no idea which floor anyone is on.
   */
  const applyResolvedAddress = useCallback((resolved) => {
    if (!resolved) return;

    const filled = autoFilledRef.current;

    const merge = (current, updates, prefix) => {
      const next = { ...current };
      let changed = false;

      for (const [key, incoming] of Object.entries(updates)) {
        if (!incoming) continue;
        const tag = prefix ? `${prefix}.${key}` : key;
        const isMine = filled.has(tag);
        if (current[key] && !isMine) continue; // The customer's own words. Leave them.
        if (current[key] === incoming) continue;

        next[key] = incoming;
        filled.add(tag);
        changed = true;
      }

      return changed ? next : current;
    };

    /* The two blocks take different shapes of the same answer: billing keeps the
       street address in one free-text field, delivery splits it across flat,
       street and area. */
    const streetLine = [resolved.house, resolved.street].filter(Boolean).join(', ');

    setDeliveryAddress((prev) =>
      merge(
        prev,
        {
          flatNo: resolved.house,
          streetNo: resolved.street,
          area: resolved.area,
          city: resolved.city,
          state: resolved.state,
          pincode: resolved.pincode,
        },
        'delivery'
      )
    );

    setFormData((prev) =>
      merge(
        prev,
        {
          address: [streetLine, resolved.area].filter(Boolean).join(', '),
          city: resolved.city,
          pincode: resolved.pincode,
        },
        ''
      )
    );
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!formData.name || !formData.phone || !formData.address || !formData.city || !formData.pincode) {
      toast.error('Please fill all required fields');
      return;
    }

    if (!sameAsBilling && (!deliveryAddress.flatNo || !deliveryAddress.streetNo || !deliveryAddress.area || !deliveryAddress.city || !deliveryAddress.pincode)) {
      toast.error('Please fill the delivery address');
      return;
    }

    const cartTotal = getCartTotal();
    if (adminSettings.minimumOrderValueEnabled && cartTotal < adminSettings.minimumOrderValue) {
      toast.error(`Minimum order value is ₹${adminSettings.minimumOrderValue}. Your cart total is ₹${cartTotal}. Please add more items.`, {
        duration: 5000
      });
      return;
    }

    setShowConfirm(true);
  };

  const confirmPlaceOrder = async () => {
    setLoading(true);

    try {
      // The cart can still be edited inside the review modal, so re-check the
      // floor against the live total rather than trusting the check that ran
      // before the modal opened. The server enforces it again regardless.
      const liveTotal = getCartTotal();
      if (adminSettings.minimumOrderValueEnabled && liveTotal < adminSettings.minimumOrderValue) {
        toast.error(
          `Minimum order value is ₹${adminSettings.minimumOrderValue}. Your cart total is ₹${liveTotal}.`,
          { duration: 5000 }
        );
        setShowConfirm(false);
        return;
      }

      // Only ids and quantities are sent. The server prices the cart from the
      // products collection, enforces the minimum, assigns the status and order
      // code, and writes the document — the browser cannot choose what it pays.
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(user ? { Authorization: `Bearer ${await user.getIdToken()}` } : {}),
        },
        body: JSON.stringify({
          customer: formData,
          sameAsBilling,
          delivery: sameAsBilling ? null : deliveryAddress,
          /* Sent alongside the typed address, not instead of it. The server
             re-validates the coordinates and stores both, so the driver gets the
             doorstep and the invoice still reads as an address. */
          deliveryLocation: pin,
          items: cart.map((item) => ({ id: item.id, quantity: item.quantity })),
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(result.error || 'Could not place your order. Please try again.', {
          duration: 5000,
        });
        return;
      }

      const { orderId, shortCode, total, itemCount, notifyToken } = result;

      orderPlacedRef.current = true;
      clearCart();
      sessionStorage.removeItem(STORAGE_KEY);

      // The notify token is a single-use capability proving we are the party
      // that placed this order; without it the server will not send anything.
      if (formData.email) {
        sendOrderEmail(orderId, notifyToken).catch(() => {});
      }

      if (formData.phone) {
        sendOrderSMS({ orderId, notifyToken, type: 'placed' });
      }

      navigate('/order-success', {
        // The last four digits ride along so the "Track Order" button works in
        // one tap — tracking checks them against the order, and asking the
        // customer to retype the number they just entered would be absurd.
        state: {
          orderId,
          shortCode,
          total,
          itemCount,
          phoneLast4: String(formData.phone || '').replace(/\D/g, '').slice(-4),
        },
      });
    } catch (error) {
      console.error('Error placing order:', error);
      toast.error('Failed to place order. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Only the id and the single-use notify token go over the wire. The server
  // reads the order it wrote and mails it to the address stored on it, so
  // nothing here can redirect the message or inject content into it.
  const sendOrderEmail = async (orderId, notifyToken) => {
    try {
      const response = await fetch('/api/orders/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, notifyToken }),
      });
      const data = await response.json();

      if (data.success) {
        toast.success('Invoice emailed to ' + formData.email);
      } else if (data.setupRequired) {
        console.warn('Email service not configured on server:', data.error);
      } else {
        console.warn('Email sending failed:', data.error);
      }
    } catch (error) {
      console.warn('Email service unreachable:', error.message);
    }
  };

  /* Only genuinely empty once the cart has been read from storage. Acting on
     `cart.length === 0` before then bounced customers straight back to /cart on
     any direct load or refresh of this page, because hydration waits on auth. */
  const cartEmpty = hydrated && cart.length === 0 && !orderPlacedRef.current;

  useEffect(() => {
    if (cartEmpty) {
      /* Replace, not push: this page is not a destination anyone chose, and
         leaving it in the history makes Back bounce straight back here. */
      navigate('/cart', { replace: true });
    }
  }, [cartEmpty, navigate]);

  if (cartEmpty || !hydrated) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div
          className="h-14 w-14 animate-spin rounded-full"
          style={{ border: '3px solid var(--hairline-strong)', borderTopColor: 'var(--ember-600)' }}
        />
        <span className="sr-only">Loading checkout</span>
      </div>
    );
  }

  /* ---- Presentation-only derived state (no effect on submission) ---- */
  const markTouched = (key) => setTouched((prev) => ({ ...prev, [key]: true }));

  const billingMessages = {
    name: 'Full name is required.',
    phone: 'Phone number is required.',
    address: 'Billing address is required.',
    city: 'City is required.',
    pincode: 'Pincode is required.',
  };
  const deliveryMessages = {
    flatNo: 'Flat / house number is required.',
    streetNo: 'Street or road name is required.',
    area: 'Area or locality is required.',
    city: 'Delivery city is required.',
    pincode: 'Delivery pincode is required.',
  };

  const billingError = (key) =>
    touched[key] && !formData[key] ? billingMessages[key] : '';
  const deliveryError = (key) =>
    !sameAsBilling && touched[`delivery.${key}`] && !deliveryAddress[key] ? deliveryMessages[key] : '';

  const detailsComplete = Boolean(
    formData.name && formData.phone && formData.address && formData.city && formData.pincode
  );
  const deliveryComplete =
    sameAsBilling ||
    Boolean(
      deliveryAddress.flatNo &&
        deliveryAddress.streetNo &&
        deliveryAddress.area &&
        deliveryAddress.city &&
        deliveryAddress.pincode
    );

  const completedCount = showConfirm ? 3 : detailsComplete ? (deliveryComplete ? 2 : 1) : 0;
  const activeIndex = showConfirm ? 2 : !detailsComplete ? 0 : !deliveryComplete ? 1 : 2;

  const total = getCartTotal();
  const minimumMet = total >= adminSettings.minimumOrderValue;

  return (
    <div className="min-h-screen section-pad-sm pb-28 lg:pb-0">
      <Seo title="Checkout | Crackers Hyderabad" noindex />
      <div className="shell">
        <motion.header
          initial="hidden"
          animate="visible"
          variants={revealVariants(reduced, 14)}
          className="mb-6 md:mb-8"
        >
          <span className="section-eyebrow">Almost there</span>
          <h1 className="section-title mt-3">Checkout</h1>
          <div
            className="scroll-x mt-5 p-4"
            style={{
              background: 'var(--surface-raised)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--r-lg)',
            }}
          >
            <CheckoutSteps activeIndex={activeIndex} completedCount={completedCount} />
          </div>
        </motion.header>

        <div className="grid items-start gap-6 lg:grid-cols-12 lg:gap-8">
          {/* ---- Form ---- */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={revealVariants(reduced, 16)}
            className="min-w-0 lg:col-span-7 xl:col-span-8"
          >
            <form onSubmit={handleSubmit} ref={formRef} className="space-y-6">
              {/* Pin the doorstep. Above the address fields because the fastest
                  path is to pin first and let the lookup fill them in — but
                  deliberately not a numbered step, since it is optional and
                  cannot be required of someone whose browser denies location or
                  whose map fails to load. */}
              {adminSettings.deliveryPinEnabled !== false && (
                <section className="panel-editorial glass-card min-w-0 p-5 sm:p-6" aria-labelledby="pin-heading">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center"
                      style={{
                        background: 'rgba(210, 166, 79, 0.18)',
                        border: '1px solid rgba(190, 140, 54, 0.45)',
                        borderRadius: 'var(--r-sm)',
                        color: 'var(--ember-600)',
                      }}
                      aria-hidden="true"
                    >
                      <MapPin className="h-4 w-4" strokeWidth={2.3} />
                    </span>
                    <h2 id="pin-heading" className="subsection-title" style={{ color: 'var(--text-strong)' }}>
                      Pin Your Delivery Location
                    </h2>
                    <span className="badge" style={{ color: 'var(--text-muted)' }}>
                      Optional
                    </span>
                  </div>
                  <hr className="rule-gold my-5" />
                  <p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
                    Drop a pin at your exact door and we will fill in the address below. Our delivery team
                    navigates straight to the pin — useful where street numbers are unclear.
                  </p>
                  <DeliveryLocationPicker value={pin} onChange={setPin} onResolved={applyResolvedAddress} />
                </section>
              )}

              {/* Step 1 — Details */}
              <fieldset className="panel-editorial glass-card min-w-0 p-5 sm:p-6" aria-labelledby="billing-heading">
                <div className="flex items-center gap-3">
                  <span className="badge badge-gold tabular" aria-hidden="true">01</span>
                  <h2 id="billing-heading" className="subsection-title" style={{ color: 'var(--text-strong)' }}>
                    Billing Address
                  </h2>
                </div>
                <hr className="rule-gold my-5" />

                <div className="space-y-4">
                  <CheckoutField
                    id="checkout-name"
                    name="name"
                    label="Full Name"
                    required
                    autoComplete="name"
                    value={formData.name}
                    onChange={handleChange}
                    onBlur={() => markTouched('name')}
                    error={billingError('name')}
                  />

                  <div className="grid gap-4 md:grid-cols-2">
                    <CheckoutField
                      id="checkout-phone"
                      name="phone"
                      type="tel"
                      inputMode="tel"
                      label="Phone"
                      required
                      autoComplete="tel"
                      value={formData.phone}
                      onChange={handleChange}
                      onBlur={() => markTouched('phone')}
                      error={billingError('phone')}
                    />
                    <CheckoutField
                      id="checkout-email"
                      name="email"
                      type="email"
                      inputMode="email"
                      label="Email"
                      autoComplete="email"
                      value={formData.email}
                      onChange={handleChange}
                      hint="We email the invoice here."
                    />
                  </div>

                  <CheckoutField
                    id="checkout-address"
                    name="address"
                    label="Billing Address"
                    required
                    rows={3}
                    autoComplete="street-address"
                    value={formData.address}
                    onChange={handleChange}
                    onBlur={() => markTouched('address')}
                    error={billingError('address')}
                  />

                  <div className="grid gap-4 md:grid-cols-2">
                    <CheckoutField
                      id="checkout-city"
                      name="city"
                      label="City"
                      required
                      autoComplete="address-level2"
                      value={formData.city}
                      onChange={handleChange}
                      onBlur={() => markTouched('city')}
                      error={billingError('city')}
                    />
                    <CheckoutField
                      id="checkout-pincode"
                      name="pincode"
                      label="Pincode"
                      required
                      inputMode="numeric"
                      autoComplete="postal-code"
                      value={formData.pincode}
                      onChange={handleChange}
                      onBlur={() => markTouched('pincode')}
                      error={billingError('pincode')}
                    />
                  </div>
                </div>
              </fieldset>

              {/* Step 2 — Delivery */}
              <fieldset className="panel-editorial glass-card min-w-0 p-5 sm:p-6" aria-labelledby="delivery-heading">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="badge badge-gold tabular" aria-hidden="true">02</span>
                    <h2 id="delivery-heading" className="subsection-title" style={{ color: 'var(--text-strong)' }}>
                      Delivery Address
                    </h2>
                  </div>

                  <label
                    className="inline-flex min-h-[44px] cursor-pointer select-none items-center gap-2.5 px-3 py-2 transition-colors"
                    style={{
                      background: sameAsBilling ? 'rgba(210, 166, 79, 0.14)' : 'var(--surface-sunken)',
                      border: `1px solid ${sameAsBilling ? 'rgba(190, 140, 54, 0.45)' : 'var(--hairline-strong)'}`,
                      borderRadius: 'var(--r-md)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={sameAsBilling}
                      onChange={(e) => setSameAsBilling(e.target.checked)}
                      className="h-5 w-5 cursor-pointer accent-primary-600"
                    />
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-body)' }}>
                      Same as billing address
                    </span>
                  </label>
                </div>

                <hr className="rule-gold my-5" />

                {sameAsBilling ? (
                  <p
                    className="flex items-start gap-2.5 p-4 text-sm"
                    style={{
                      background: 'var(--surface-sunken)',
                      border: '1px solid var(--hairline)',
                      borderRadius: 'var(--r-md)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0"
                      strokeWidth={2.2}
                      style={{ color: 'var(--leaf-600)' }}
                      aria-hidden="true"
                    />
                    <span>Your order will be delivered to the billing address above.</span>
                  </p>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <CheckoutField
                        id="delivery-flat"
                        name="deliveryFlatNo"
                        label="Flat / House No"
                        required
                        placeholder="e.g. 12-3-456"
                        value={deliveryAddress.flatNo}
                        onChange={(e) => changeDelivery('flatNo', e.target.value)}
                        onBlur={() => markTouched('delivery.flatNo')}
                        error={deliveryError('flatNo')}
                      />
                      <CheckoutField
                        id="delivery-street"
                        name="deliveryStreetNo"
                        label="Street / Road Name"
                        required
                        placeholder="e.g. Road No 12, Kukatpally Main Road"
                        value={deliveryAddress.streetNo}
                        onChange={(e) => changeDelivery('streetNo', e.target.value)}
                        onBlur={() => markTouched('delivery.streetNo')}
                        error={deliveryError('streetNo')}
                      />
                    </div>

                    <CheckoutField
                      id="delivery-area"
                      name="deliveryArea"
                      label="Area / Locality"
                      required
                      placeholder="e.g. Kukatpally"
                      value={deliveryAddress.area}
                      onChange={(e) => changeDelivery('area', e.target.value)}
                      onBlur={() => markTouched('delivery.area')}
                      error={deliveryError('area')}
                    />

                    <div className="grid gap-4 md:grid-cols-3">
                      <CheckoutField
                        id="delivery-city"
                        name="deliveryCity"
                        label="Delivery City"
                        required
                        value={deliveryAddress.city}
                        onChange={(e) => changeDelivery('city', e.target.value)}
                        onBlur={() => markTouched('delivery.city')}
                        error={deliveryError('city')}
                      />
                      {/* Not required: the pin and the pincode already fix the
                          region, and an optional field the map can fill is worth
                          more than one more thing to fail validation on. */}
                      <CheckoutField
                        id="delivery-state"
                        name="deliveryState"
                        label="State"
                        placeholder="e.g. Telangana"
                        value={deliveryAddress.state}
                        onChange={(e) => changeDelivery('state', e.target.value)}
                      />
                      <CheckoutField
                        id="delivery-pincode"
                        name="deliveryPincode"
                        label="Delivery Pincode"
                        required
                        inputMode="numeric"
                        value={deliveryAddress.pincode}
                        onChange={(e) => changeDelivery('pincode', e.target.value)}
                        onBlur={() => markTouched('delivery.pincode')}
                        error={deliveryError('pincode')}
                      />
                    </div>

                    <CheckoutField
                      id="delivery-altphone"
                      name="deliveryAltPhone"
                      type="tel"
                      inputMode="tel"
                      label="Alternate Phone No"
                      placeholder="e.g. 9876543210"
                      value={deliveryAddress.altPhone}
                      onChange={(e) => changeDelivery('altPhone', e.target.value)}
                    />
                  </div>
                )}
              </fieldset>

              {/* Step 3 — Payment + review */}
              <fieldset className="panel-editorial glass-card min-w-0 p-5 sm:p-6" aria-labelledby="payment-heading">
                <div className="flex items-center gap-3">
                  <span className="badge badge-gold tabular" aria-hidden="true">03</span>
                  <h2 id="payment-heading" className="subsection-title" style={{ color: 'var(--text-strong)' }}>
                    Payment Method
                  </h2>
                </div>
                <hr className="rule-gold my-5" />

                <div className="flex flex-col gap-3 sm:flex-row">
                  <div
                    className="flex flex-1 items-center gap-2.5 px-4 py-3"
                    style={{
                      background: 'var(--surface-sunken)',
                      border: '1px solid var(--hairline-strong)',
                      borderRadius: 'var(--r-md)',
                    }}
                  >
                    <Banknote className="h-5 w-5 shrink-0" strokeWidth={2.2} style={{ color: 'var(--gold-600)' }} aria-hidden="true" />
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>Cash on Delivery</span>
                  </div>
                  <div
                    className="flex flex-1 items-center gap-2.5 px-4 py-3"
                    style={{
                      background: 'var(--surface-sunken)',
                      border: '1px solid var(--hairline-strong)',
                      borderRadius: 'var(--r-md)',
                    }}
                  >
                    <Smartphone className="h-5 w-5 shrink-0" strokeWidth={2.2} style={{ color: 'var(--gold-600)' }} aria-hidden="true" />
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>UPI on Delivery</span>
                  </div>
                </div>

                <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Pay when your order arrives — cash or UPI scan at your doorstep.
                </p>

                <motion.button
                  whileTap={reduced ? undefined : { scale: 0.98 }}
                  type="submit"
                  disabled={loading}
                  aria-busy={loading}
                  className="btn-primary btn-shine mt-6 w-full text-base"
                >
                  {loading ? (
                    <>
                      <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Placing Order...</span>
                    </>
                  ) : (
                    'Place Order'
                  )}
                </motion.button>

                <p className="mt-3 flex items-center justify-center gap-2 text-xs" style={{ color: 'var(--text-subtle)' }}>
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} aria-hidden="true" />
                  You will review the full order before it is placed.
                </p>
              </fieldset>
            </form>
          </motion.div>

          {/* ---- Order summary ---- */}
          <motion.aside
            initial="hidden"
            animate="visible"
            variants={revealVariants(reduced, 12)}
            aria-label="Order summary"
            className="panel-editorial glass-card min-w-0 p-5 sm:p-6 lg:sticky lg:top-24 lg:col-span-5 xl:col-span-4"
          >
            <h2 className="subsection-title" style={{ color: 'var(--text-strong)' }}>Order Summary</h2>
            <hr className="rule-gold my-4" />

            <ul className="space-y-2.5">
              {cart.map((item) => (
                <li key={item.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate" style={{ color: 'var(--text-muted)' }}>
                    {item.name} <span className="tabular">x {item.quantity}</span>
                  </span>
                  <span className="price shrink-0 font-semibold" style={{ color: 'var(--text-body)' }}>
                    {inr(unitPriceOf(item) * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--hairline)' }}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="label-caps">Total</span>
                <span
                  className="price text-2xl font-bold"
                  style={{ color: 'var(--text-strong)' }}
                >
                  {inr(getCartTotal())}
                </span>
              </div>

              {adminSettings.minimumOrderValueEnabled && (
                <div
                  className="mt-4 p-3 text-sm font-semibold"
                  style={{
                    borderRadius: 'var(--r-md)',
                    background: minimumMet ? 'rgba(44, 122, 83, 0.10)' : 'rgba(203, 42, 42, 0.10)',
                    border: `1px solid ${minimumMet ? 'rgba(44, 122, 83, 0.32)' : 'rgba(203, 42, 42, 0.32)'}`,
                    color: minimumMet ? 'var(--leaf-600)' : 'var(--crimson-600)',
                  }}
                >
                  {minimumMet ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 shrink-0" strokeWidth={2.2} aria-hidden="true" />
                      <span>Minimum order value met</span>
                    </div>
                  ) : (
                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 shrink-0" strokeWidth={2.2} aria-hidden="true" />
                        <span className="tabular">Minimum order value: ₹{adminSettings.minimumOrderValue}</span>
                      </div>
                      <div className="tabular text-xs font-normal">
                        Add ₹{adminSettings.minimumOrderValue - getCartTotal()} more to checkout
                      </div>
                      <Link to="/products" className="btn-primary mt-3 w-full">
                        <ShoppingBag className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                        Shop for More
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.aside>
        </div>

        {/* Confirm Order Modal */}
        <AnimatePresence>
          {showConfirm && (
            <ConfirmOrderModal
              cart={cart}
              formData={formData}
              deliveryAddress={deliveryAddress}
              pin={pin}
              sameAsBilling={sameAsBilling}
              total={getCartTotal()}
              loading={loading}
              onClose={() => setShowConfirm(false)}
              onConfirm={confirmPlaceOrder}
              onAddMore={() => navigate('/products')}
              onQuantityChange={updateQuantity}
              onRemove={removeFromCart}
            />
          )}
        </AnimatePresence>
      </div>

      {/* ---- Mobile sticky checkout bar ----
          The Place Order control lives at the end of the long form; this bar
          keeps it reachable while scrolling on small screens. It submits the
          same form (and therefore the same validation + review modal). */}
      <div className="fixed inset-x-0 bottom-0 z-sticky lg:hidden">
        <div
          className="glass-nav border-t"
          style={{ borderColor: 'var(--hairline)' }}
        >
          <div className="shell flex items-center gap-4 py-3">
            <div className="min-w-0">
              <p className="label-caps">
                {cart.length} {cart.length === 1 ? 'item' : 'items'}
              </p>
              <p
                className="price text-xl font-bold"
                style={{ color: 'var(--text-strong)' }}
              >
                {inr(total)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => formRef.current?.requestSubmit()}
              disabled={loading}
              aria-busy={loading}
              className="btn-primary btn-shine ml-auto shrink-0 px-5"
            >
              {loading ? 'Placing Order...' : 'Place Order'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
