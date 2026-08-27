import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FaWhatsapp } from 'react-icons/fa';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { SPRING, DURATION } from '../lib/motion';

const WhatsAppButton = () => {
  const { isAdmin, isSales } = useAuth();
  const reduced = useReducedMotion();
  const [whatsappNumber, setWhatsappNumber] = useState('+91 1234567890');
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const fetchWhatsAppSettings = useCallback(async () => {
    try {
      const adminDoc = await getDoc(doc(db, 'adminSettings', 'main'));
      if (adminDoc.exists() && adminDoc.data().whatsappNumber) {
        setWhatsappNumber(adminDoc.data().whatsappNumber);
      }
    } catch (error) {
      console.error('Error fetching WhatsApp settings:', error);
    } finally {
      setSettingsLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchWhatsAppSettings();
  }, [fetchWhatsAppSettings]);

  if (!settingsLoaded || isAdmin || isSales) {
    return null;
  }

  const message = 'Hi! I have a question about your products.';
  const whatsappURL = `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}`;

  return (
    <motion.a
      href={whatsappURL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="group fixed bottom-6 right-6 z-overlay flex h-14 w-14 items-center justify-center rounded-full text-white"
      style={{
        background: 'linear-gradient(140deg, #3E9A6B 0%, #2C7A53 54%, #245F42 100%)',
        border: '1px solid rgba(210, 166, 79, 0.42)',
        boxShadow: '0 14px 34px rgba(36, 95, 66, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.22)'
      }}
      initial={{ opacity: 0, scale: reduced ? 1 : 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={reduced ? { duration: DURATION.instant } : { delay: 0.5, ...SPRING.soft }}
      whileHover={reduced ? undefined : { scale: 1.06 }}
      whileTap={reduced ? undefined : { scale: 0.94 }}
    >
      {/* Soft halo. Static — no attention-seeking pulse. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{ boxShadow: '0 0 0 7px rgba(44, 122, 83, 0.14)' }}
      />

      {/* Label reveals on hover or keyboard focus. The link itself never depends on it. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-full mr-3 hidden translate-x-1 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-semibold opacity-0 transition duration-200 ease-out group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 sm:block"
        style={{
          background: 'rgba(26, 23, 20, 0.94)',
          border: '1px solid rgba(210, 166, 79, 0.34)',
          color: 'var(--text-on-dark)',
          fontFamily: 'var(--font-body)',
          boxShadow: '0 10px 26px rgba(26, 23, 20, 0.4)'
        }}
      >
        Chat on WhatsApp
      </span>

      <FaWhatsapp className="relative h-7 w-7" aria-hidden="true" />
    </motion.a>
  );
};

export default WhatsAppButton;