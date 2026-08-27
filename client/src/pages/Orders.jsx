import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, getDocs, getDoc, doc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Link } from 'react-router-dom';
import { ArrowLeft, Eye, FileText, StickyNote, Trash2 } from 'lucide-react';
import toast from '../utils/toast';
import { sendOrderSMS } from '../utils/sms';
import CustomModal from '../components/CustomModal';
import { useModal } from '../hooks/useModal';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { downloadInvoicePDF, printInvoicePDF } from '../utils/pdfGenerator';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { pageVariants, revealVariants } from '../lib/motion';
import { Skeleton, TableSkeleton } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import OrderStatusBadge from '../components/admin/OrderStatusBadge';
import { getStatusTone } from '../components/admin/orderStatus';
import OrderActionBar from '../components/admin/OrderActionBar';
import OrderEditModal from '../components/admin/OrderEditModal';

const statusOptions = ['Pending', 'Confirmed', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'];

const orderCodeOf = (order) => order.shortCode || order.id.slice(-6).toUpperCase();

const FilterTab = ({ active, onClick, label, count }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`flex min-h-[44px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-[var(--r-sm)] px-3 text-sm font-semibold transition-[background-color,color,box-shadow] duration-150 sm:w-auto sm:px-5 ${
      active ? 'shadow-[var(--shadow-xs)]' : ''
    }`}
    style={
      active
        ? { background: 'var(--surface-card)', color: 'var(--text-strong)', border: '1px solid var(--hairline-strong)' }
        : { background: 'transparent', color: 'var(--text-muted)', border: '1px solid transparent' }
    }
  >
    {label}
    <span className={`badge ${active ? 'badge-ember' : 'badge-neutral'} tabular`}>{count}</span>
  </button>
);

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('online');
  const { isOpen, modalConfig, openModal, closeModal, handleConfirm } = useModal();
  const { isAdmin, isMod } = useAuth();
  const { isDark } = useTheme();
  const canEditOrder = isAdmin || isMod;
  const canDeleteOrder = isAdmin;
  const [editingOrder, setEditingOrder] = useState(null);
  const [editedItems, setEditedItems] = useState([]);
  const [editedNote, setEditedNote] = useState('');
  const [orderEditMinimum, setOrderEditMinimum] = useState(500);
  const [products, setProducts] = useState([]);
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [downloadingInvoice, setDownloadingInvoice] = useState(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    fetchOrders();
    fetchProducts();
    getDoc(doc(db, 'adminSettings', 'main'))
      .then((snap) => {
        if (snap.exists()) {
          const value = Number(snap.data().minimumOrderValue);
          if (Number.isFinite(value) && value > 0) setOrderEditMinimum(value);
        }
      })
      .catch(() => {});
  }, []);

  const fetchOrders = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'orders'));
      const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOrders(ordersData.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.createdAt?.toDate?.() || new Date(0);
        return dateB - dateA;
      }));
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error('Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'products'));
      const productsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setProducts(productsList);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const startEditingOrder = (order) => {
    setEditingOrder(order);
    setEditedItems([...(order.items || [])]);
    setEditedNote(order.adminNote || '');
    setShowProductSearch(false);
    setProductSearchQuery('');
  };

  const cancelEditingOrder = () => {
    setEditingOrder(null);
    setEditedItems([]);
    setEditedNote('');
    setShowProductSearch(false);
    setProductSearchQuery('');
  };

  const updateItemQuantity = (index, change) => {
    const newItems = [...editedItems];
    const newQuantity = newItems[index].quantity + change;
    if (newQuantity > 0) {
      newItems[index] = { ...newItems[index], quantity: newQuantity };
      setEditedItems(newItems);
    }
  };

  const removeItemFromOrder = (index) => {
    const newItems = editedItems.filter((_, i) => i !== index);
    setEditedItems(newItems);
  };

  const addProductToOrder = (product) => {
    const existingIndex = editedItems.findIndex(item => item.id === product.id);
    if (existingIndex >= 0) {
      const newItems = [...editedItems];
      newItems[existingIndex] = {
        ...newItems[existingIndex],
        quantity: newItems[existingIndex].quantity + 1
      };
      setEditedItems(newItems);
    } else {
      const price = product.discountPrice || product.onlinePrice || product.price || 0;
      setEditedItems([...editedItems, {
        id: product.id,
        name: product.name,
        price: price,
        discountPrice: product.discountPrice,
        quantity: 1
      }]);
    }
    setShowProductSearch(false);
    setProductSearchQuery('');
    toast.success(`${product.name} added to order`);
  };

  const saveOrderChanges = async () => {
    if (!editingOrder) return;

    if (editedItems.length === 0) {
      toast.error('Order must have at least one item');
      return;
    }

    const newTotal = editedItems.reduce((sum, item) => {
      const price = item.discountPrice || item.price || 0;
      return sum + (price * item.quantity);
    }, 0);

    if (newTotal < orderEditMinimum) {
      toast.error(`Order total must be at least Rs ${orderEditMinimum}. Current total: Rs ${newTotal}`);
      return;
    }

    try {
      await updateDoc(doc(db, 'orders', editingOrder.id), {
        items: editedItems,
        total: newTotal,
        adminNote: editedNote.trim() || null,
        adminNoteUpdatedAt: serverTimestamp()
      });

      setOrders(orders.map(order =>
        order.id === editingOrder.id
          ? { ...order, items: editedItems, total: newTotal, adminNote: editedNote.trim() || null }
          : order
      ));

      toast.success('Order updated successfully');
      cancelEditingOrder();
    } catch (error) {
      console.error('Error updating order:', error);
      toast.error('Failed to update order');
    }
  };

  const filteredProducts = products.filter(product =>
    (product.name || '').toLowerCase().includes(productSearchQuery.toLowerCase())
  );

  const onlineOrders = orders.filter(order => !order.paymentMode);
  const storeOrders = orders.filter(order => order.paymentMode);

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { status: newStatus });

      setOrders(orders.map(o =>
        o.id === orderId ? { ...o, status: newStatus } : o
      ));

      const order = orders.find(o => o.id === orderId);
      if (order?.customer?.phone) {
        // The server reads the recipient and the new status straight from the
        // order document, so only its id is needed here.
        sendOrderSMS({ orderId, type: 'status' });
      }

      toast.success('Order status updated');
    } catch (error) {
      console.error('Error updating order:', error);
      toast.error('Failed to update order');
    }
  };

  const handleDeleteOrder = async (orderId, orderNumber) => {
    openModal({
      title: 'Delete Order',
      message: `Are you sure you want to delete order #${orderNumber}?\n\nThis action cannot be undone.`,
      type: 'danger',
      confirmText: 'Delete Order',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'orders', orderId));
          setOrders(orders.filter(order => order.id !== orderId));
          toast.success(`Order #${orderNumber} deleted successfully`);
        } catch (error) {
          console.error('Error deleting order:', error);
          toast.error('Failed to delete order');
        }
      },
    });
  };

  const handleDeleteAllOrders = async () => {
    openModal({
      title: 'Delete All Orders',
      message: `WARNING: This will permanently delete ALL ${orders.length} orders!\n\nThis action CANNOT be undone.\n\nType "DELETE ALL ORDERS" below to confirm:`,
      type: 'danger',
      confirmText: 'Delete All',
      cancelText: 'Cancel',
      requiresInput: true,
      inputPlaceholder: 'Type DELETE ALL ORDERS',
      expectedInput: 'DELETE ALL ORDERS',
      onConfirm: async () => {
        const loadingToast = toast.loading(`Deleting ${orders.length} orders...`);

        try {
          // Use batch writes for better performance (max 500 per batch)
          const batchSize = 500;
          const orderIds = orders.map(order => order.id);

          for (let i = 0; i < orderIds.length; i += batchSize) {
            const batch = writeBatch(db);
            const batchIds = orderIds.slice(i, i + batchSize);

            batchIds.forEach(orderId => {
              batch.delete(doc(db, 'orders', orderId));
            });

            await batch.commit();
          }

          setOrders([]);
          toast.success(`Successfully deleted ${orderIds.length} orders`, { id: loadingToast });
        } catch (error) {
          console.error('Error deleting orders:', error);
          toast.error(`Failed to delete orders: ${error.message}`, { id: loadingToast });
        }
      },
    });
  };

  const openWhatsAppChat = (order) => {
    if (!order?.customer?.phone) {
      toast.error('Customer phone number not available');
      return;
    }

    const phone = order.customer.phone.replace(/\D/g, '');
    const formattedPhone = phone.startsWith('91') ? phone : `91${phone}`;
    const orderId = order.shortCode || order.id.slice(-6).toUpperCase();
    const status = order.status || 'Pending';
    const customerName = order.customer?.name || 'Customer';

    const message = encodeURIComponent(
      `Hello ${customerName},\n\n` +
      `*Order Update - Crackers Hyderabad*\n\n` +
      `Order ID: #${orderId}\n` +
      `Status: ${status}\n` +
      `Total: Rs.${order.total}\n\n` +
      `Thank you for shopping with us!`
    );

    window.open(`https://wa.me/${formattedPhone}?text=${message}`, '_blank');
    toast.success('WhatsApp opened in new tab');
  };

  const handleDownloadInvoice = async (order) => {
    setDownloadingInvoice(order.id);

    try {
      const orderData = {
        orderId: order.id,
        ...order,
        items: order.items || []
      };

      const customerInfo = order.customer || {
        name: 'N/A',
        phone: 'N/A',
        email: '',
        address: '',
        city: '',
        pincode: ''
      };

      downloadInvoicePDF(orderData, customerInfo, { isAdmin: true });
      toast.success('Invoice downloaded successfully!');
    } catch (error) {
      console.error('Error generating invoice:', error);
      toast.error('Failed to generate invoice');
    } finally {
      setDownloadingInvoice(null);
    }
  };

  const handlePrintInvoice = async (order) => {
    setDownloadingInvoice(order.id);

    try {
      const orderData = {
        orderId: order.id,
        ...order,
        items: order.items || []
      };

      const customerInfo = order.customer || {
        name: 'N/A',
        phone: 'N/A',
        email: '',
        address: '',
        city: '',
        pincode: ''
      };

      printInvoicePDF(orderData, customerInfo, { isAdmin: true });
    } catch (error) {
      console.error('Error printing invoice:', error);
      toast.error('Failed to print invoice');
    } finally {
      setDownloadingInvoice(null);
    }
  };

  const visibleOrders = activeTab === 'online' ? onlineOrders : storeOrders;

  const renderActions = (order, labelled) => (
    <OrderActionBar
      orderCode={orderCodeOf(order)}
      showWhatsApp={activeTab === 'online' && Boolean(order.customer?.phone)}
      canEdit={canEditOrder}
      canDelete={canDeleteOrder}
      isBusy={downloadingInvoice === order.id}
      labelled={labelled}
      onDownloadInvoice={() => handleDownloadInvoice(order)}
      onPrintInvoice={() => handlePrintInvoice(order)}
      onWhatsApp={() => openWhatsAppChat(order)}
      onEdit={() => startEditingOrder(order)}
      onDelete={() => handleDeleteOrder(order.id, orderCodeOf(order))}
    />
  );

  const renderStatusControl = (order) => {
    if (activeTab !== 'online') {
      return <OrderStatusBadge status={order.status || 'Completed'} />;
    }

    const tone = getStatusTone(order.status);
    const ToneIcon = tone.Icon;

    return (
      <div className="flex items-center gap-2">
        <ToneIcon className="h-4 w-4 shrink-0" aria-hidden="true" style={{ color: tone.dot }} strokeWidth={2.2} />
        <select
          value={order.status}
          onChange={(e) => handleStatusChange(order.id, e.target.value)}
          aria-label={`Order status for order ${orderCodeOf(order)}`}
          className="min-h-[44px] w-full min-w-[9.5rem] rounded-[var(--r-sm)] border px-2 text-sm font-semibold"
          style={{
            borderColor: 'var(--hairline-strong)',
            background: 'var(--surface-card)',
            color: 'var(--text-strong)',
            colorScheme: isDark ? 'dark' : 'light',
          }}
        >
          {statusOptions.map(status => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </div>
    );
  };

  /* Full order detail lives on its own page; the register links to it. */
  const renderViewLink = (order) => (
    <Link
      to={`/admin/orders/${order.id}`}
      aria-label={`View full details for order ${orderCodeOf(order)}`}
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--hairline)] bg-[var(--surface-card)] px-3 text-xs font-semibold transition-[border-color] duration-150 hover:border-[var(--hairline-strong)]"
      style={{ color: 'var(--text-body)' }}
    >
      <Eye className="h-4 w-4" aria-hidden="true" strokeWidth={2.2} />
      View
    </Link>
  );

  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="shell section-pad-sm">
          <div className="mb-8 space-y-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-10 w-80" />
          </div>
          <div
            className="rounded-[var(--r-lg)] border p-5"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
          >
            <TableSkeleton rows={7} cols={5} label="Loading orders" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <CustomModal
        isOpen={isOpen}
        onClose={closeModal}
        onConfirm={handleConfirm}
        {...modalConfig}
      />

      <motion.div
        variants={pageVariants(reduced)}
        initial="initial"
        animate="animate"
        className="shell section-pad-sm"
      >
        <Link
          to="/admin/dashboard"
          className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold"
          style={{ color: 'var(--ember-600)' }}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Dashboard
        </Link>

        <header className="mb-6 mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <span className="label-caps">Operations</span>
            <h1 className="section-title mt-1.5">Orders Management</h1>
            <p className="tabular mt-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
              {orders.length} orders on record
            </p>
          </div>

          {orders.length > 0 && (
            <button
              type="button"
              onClick={handleDeleteAllOrders}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--r-md)] border px-4 text-sm font-semibold transition-[background-color,transform] duration-150 active:scale-[0.98]"
              style={{
                borderColor: 'rgba(203, 42, 42, 0.38)',
                background: 'rgba(203, 42, 42, 0.10)',
                color: 'var(--text-strong)',
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" style={{ color: '#E14848' }} />
              Delete All Orders (<span className="tabular">{orders.length}</span>)
            </button>
          )}
        </header>

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            role="group"
            aria-label="Filter orders by channel"
            className="flex w-full flex-col gap-1 rounded-[var(--r-md)] border p-1 sm:w-auto sm:flex-row"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}
          >
            <FilterTab
              active={activeTab === 'online'}
              onClick={() => setActiveTab('online')}
              label="Online Orders"
              count={onlineOrders.length}
            />
            <FilterTab
              active={activeTab === 'store'}
              onClick={() => setActiveTab('store')}
              label="Store Orders"
              count={storeOrders.length}
            />
          </div>

          <p className="tabular text-xs" style={{ color: 'var(--text-muted)' }} role="status" aria-live="polite">
            Showing {visibleOrders.length} {activeTab === 'online' ? 'online' : 'store'} orders
          </p>
        </div>

        {orders.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No orders found"
            description="Orders placed online and orders created at the counter will both appear in this register."
          />
        ) : visibleOrders.length === 0 ? (
          <div
            className="flex flex-col items-center gap-2 rounded-[var(--r-lg)] border border-dashed py-14 text-center"
            style={{ borderColor: 'var(--hairline-strong)' }}
          >
            <FileText className="h-6 w-6" aria-hidden="true" style={{ color: 'var(--text-subtle)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No {activeTab === 'online' ? 'online' : 'store'} orders yet
            </p>
          </div>
        ) : (
          <>
            {/* Dense register — tablet and desktop */}
            <div
              className="hidden overflow-hidden rounded-[var(--r-lg)] border md:block"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
            >
              <div className="scroll-x">
                <table className="w-full min-w-[1040px] border-collapse text-left">
                  <caption className="sr-only">
                    {activeTab === 'online' ? 'Online orders register' : 'Store orders register'}
                  </caption>
                  <thead>
                    <tr style={{ background: 'var(--surface-sunken)' }}>
                      <th scope="col" className="w-20 px-3 py-3">
                        <span className="sr-only">View order</span>
                      </th>
                      <th scope="col" className="label-caps px-3 py-3 text-left">Order</th>
                      <th scope="col" className="label-caps px-3 py-3 text-left">Customer</th>
                      <th scope="col" className="label-caps px-3 py-3 text-left">Items</th>
                      <th scope="col" className="label-caps px-3 py-3 text-right">Total</th>
                      <th scope="col" className="label-caps px-3 py-3 text-left">Status</th>
                      <th scope="col" className="label-caps px-3 py-3 text-left">Placed</th>
                      <th scope="col" className="label-caps px-3 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleOrders.map((order) => (
                      <tr key={order.id} style={{ borderTop: '1px solid var(--hairline)' }}>
                        <td className="px-3 py-3 align-middle">{renderViewLink(order)}</td>

                        <td className="px-3 py-3 align-middle">
                          <p className="tabular text-sm font-bold" style={{ color: 'var(--text-strong)' }}>
                            #{orderCodeOf(order)}
                          </p>
                          {order.adminNote && (
                            <span className="badge badge-gold mt-1">
                              <StickyNote className="h-3 w-3" aria-hidden="true" strokeWidth={2.4} />
                              Note
                            </span>
                          )}
                        </td>

                        <td className="px-3 py-3 align-middle">
                          <p className="max-w-[14rem] truncate text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                            {order.customer?.name || 'N/A'}
                          </p>
                          <p className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>
                            {order.customer?.phone}
                          </p>
                        </td>

                        <td className="tabular px-3 py-3 align-middle text-sm" style={{ color: 'var(--text-body)' }}>
                          {order.items?.length || 0}
                        </td>

                        <td
                          className="tabular px-3 py-3 text-right align-middle text-sm font-bold"
                          style={{ color: 'var(--text-strong)' }}
                        >
                          &#8377;{(order.total || 0).toLocaleString('en-IN')}
                          {order.discount > 0 && (
                            <span className="tabular block text-xs font-semibold" style={{ color: '#3E9A6B' }}>
                              &minus;&#8377;{order.discount}
                            </span>
                          )}
                        </td>

                        <td className="px-3 py-3 align-middle">{renderStatusControl(order)}</td>

                        <td
                          className="tabular whitespace-nowrap px-3 py-3 align-middle text-xs"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {order.createdAt?.toDate?.().toLocaleString() || 'N/A'}
                        </td>

                        <td className="px-3 py-3 align-middle">{renderActions(order, false)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Card register — phones */}
            <motion.ul
              initial="hidden"
              animate="visible"
              variants={revealVariants(reduced, 12)}
              className="space-y-3 md:hidden"
            >
              {visibleOrders.map((order) => (
                <li
                  key={order.id}
                  className="rounded-[var(--r-lg)] border p-4"
                  style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="tabular text-sm font-bold" style={{ color: 'var(--text-strong)' }}>
                        #{orderCodeOf(order)}
                      </p>
                      <p className="tabular mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {order.createdAt?.toDate?.().toLocaleString() || 'N/A'}
                      </p>
                    </div>
                    <OrderStatusBadge status={order.status || (activeTab === 'online' ? 'Pending' : 'Completed')} />
                  </div>

                  <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
                        {order.customer?.name || 'N/A'}
                      </p>
                      <p className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>
                        {order.customer?.phone}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="tabular text-lg font-bold" style={{ color: 'var(--text-strong)' }}>
                        &#8377;{(order.total || 0).toLocaleString('en-IN')}
                      </p>
                      <p className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>
                        {order.items?.length || 0} items
                      </p>
                    </div>
                  </div>

                  {order.adminNote && (
                    <span className="badge badge-gold mt-3">
                      <StickyNote className="h-3 w-3" aria-hidden="true" strokeWidth={2.4} />
                      Internal note
                    </span>
                  )}

                  {activeTab === 'online' && <div className="mt-3">{renderStatusControl(order)}</div>}

                  <div className="mt-3">{renderActions(order, true)}</div>

                  <div className="mt-3">
                    <Link
                      to={`/admin/orders/${order.id}`}
                      className="inline-flex min-h-[44px] items-center gap-2 text-xs font-semibold"
                      style={{ color: 'var(--ember-600)' }}
                    >
                      <Eye className="h-4 w-4" aria-hidden="true" strokeWidth={2.2} />
                      View full details
                    </Link>
                  </div>
                </li>
              ))}
            </motion.ul>
          </>
        )}

        <AnimatePresence>
          {editingOrder && (
            <OrderEditModal
              order={editingOrder}
              orderCode={orderCodeOf(editingOrder)}
              items={editedItems}
              note={editedNote}
              onNoteChange={setEditedNote}
              showProductSearch={showProductSearch}
              onToggleProductSearch={() => setShowProductSearch(!showProductSearch)}
              productSearchQuery={productSearchQuery}
              onProductSearchChange={setProductSearchQuery}
              filteredProducts={filteredProducts}
              onAddProduct={addProductToOrder}
              onQuantityChange={updateItemQuantity}
              onRemoveItem={removeItemFromOrder}
              onCancel={cancelEditingOrder}
              onSave={saveOrderChanges}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default Orders;
