import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ChevronRight,
  Clock,
  Download,
  Eye,
  Globe2,
  Home,
  IndianRupee,
  Link2,
  Loader2,
  MapPin,
  Monitor,
  Package,
  Receipt,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  Users,
} from 'lucide-react';
import { authFetch, readApiError } from '../utils/apiClient';
import { exportCsv } from '../utils/csv';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { pageVariants } from '../lib/motion';
import { StatCardSkeleton, Skeleton, TableSkeleton } from '../components/ui/Skeleton';
import StatCard from '../components/admin/analytics/StatCard';
import TrendChart from '../components/admin/analytics/TrendChart';
import FunnelChart from '../components/admin/analytics/FunnelChart';
import TrafficHeatmap from '../components/admin/analytics/TrafficHeatmap';
import DeviceDonut from '../components/admin/analytics/DeviceDonut';
import BreakdownTable from '../components/admin/analytics/BreakdownTable';
import RangePicker from '../components/admin/analytics/RangePicker';
import LiveVisitors from '../components/admin/analytics/LiveVisitors';

/* Two independent cadences. The live count is only useful if it is seconds old;
   the aggregates change slowly and cost far more to read, so they refresh at a
   twelfth of the rate. Both stop entirely when the tab is hidden — an admin who
   leaves this open in a background tab should not be billed for reads nobody is
   looking at. */
const LIVE_POLL_MS = 15_000;
const SNAPSHOT_POLL_MS = 180_000;

const METRICS = [
  { key: 'pageviews', label: 'Pageviews' },
  { key: 'sessions', label: 'Visits' },
  { key: 'orders', label: 'Orders' },
  { key: 'revenue', label: 'Revenue' },
];

const nf = new Intl.NumberFormat('en-IN');
const inr = (value) => `₹${nf.format(Math.round(value))}`;

/* Axis labels get the compact form so "1.2L" does not become "1,20,000" and
   push the plot area halfway across the card. */
const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });

const COUNTRY_NAMES = new Intl.DisplayNames(['en'], { type: 'region' });

const countryName = (code) => {
  if (!code || code === 'ZZ') return 'Unknown';
  try {
    return COUNTRY_NAMES.of(code) || code;
  } catch {
    return code;
  }
};

const SectionHeading = ({ icon: Icon, title, hint, action }) => (
  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h2
        className="flex items-center gap-2 text-lg font-bold"
        style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}
      >
        {Icon && <Icon className="h-4 w-4" aria-hidden="true" style={{ color: 'var(--maroon)' }} />}
        {title}
      </h2>
      {hint && (
        <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          {hint}
        </p>
      )}
    </div>
    {action}
  </div>
);

const CsvButton = ({ onClick, label }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold"
    style={{
      borderColor: 'var(--hairline)',
      color: 'var(--text-muted)',
      background: 'var(--surface-card)',
    }}
  >
    <Download className="h-3.5 w-3.5" aria-hidden="true" />
    {label}
  </button>
);

export default function AdminAnalytics() {
  const reduced = useReducedMotion();

  const [range, setRange] = useState({ days: 7, custom: false });
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [live, setLive] = useState(null);
  const [liveLoading, setLiveLoading] = useState(true);

  const [metric, setMetric] = useState('pageviews');
  const [country, setCountry] = useState(null);

  // Polling stops while the tab is in the background and resumes on return.
  const [hidden, setHidden] = useState(
    typeof document === 'undefined' ? false : document.visibilityState === 'hidden',
  );

  /* The in-flight snapshot request. Changing the range mid-request must not let
     a slow earlier response overwrite the newer one. */
  const snapshotAbort = useRef(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (range.custom) {
      params.set('from', range.from);
      params.set('to', range.to);
    } else {
      params.set('days', String(range.days));
    }
    return params.toString();
  }, [range]);

  const loadSnapshot = useCallback(
    async ({ silent = false } = {}) => {
      snapshotAbort.current?.abort();
      const controller = new AbortController();
      snapshotAbort.current = controller;

      if (silent) setRefreshing(true);
      else setLoading(true);

      try {
        const response = await authFetch(`/api/admin/analytics/site?${query}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(await readApiError(response, 'Could not load analytics.'));
        setSnapshot(await response.json());
        setError('');
      } catch (err) {
        // An abort is this component superseding its own request, not a failure.
        if (err.name === 'AbortError') return;
        setError(err.message || 'Could not load analytics.');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [query],
  );

  const loadLive = useCallback(async (signal) => {
    try {
      const response = await authFetch('/api/admin/analytics/live', { signal });
      if (!response.ok) return;
      setLive(await response.json());
    } catch {
      // Deliberately silent: a missed live tick self-corrects on the next one,
      // and an error banner for it would bury the real dashboard.
    } finally {
      setLiveLoading(false);
    }
  }, []);

  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
    };
  }, []);

  // Range changes reset the country filter: a country that had traffic last
  // week may not appear in this one, and a filter on a missing row shows an
  // empty table with no way to tell why.
  useEffect(() => {
    setCountry(null);
  }, [query]);

  useEffect(() => {
    loadSnapshot();
    return () => snapshotAbort.current?.abort();
  }, [loadSnapshot]);

  useEffect(() => {
    if (hidden) return undefined;
    const timer = setInterval(() => loadSnapshot({ silent: true }), SNAPSHOT_POLL_MS);
    return () => clearInterval(timer);
  }, [hidden, loadSnapshot]);

  useEffect(() => {
    if (hidden) return undefined;
    const controller = new AbortController();
    loadLive(controller.signal);
    const timer = setInterval(() => loadLive(controller.signal), LIVE_POLL_MS);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [hidden, loadLive]);

  const totals = snapshot?.totals;
  const deltas = snapshot?.deltas || {};
  const series = snapshot?.series || [];

  const funnelStages = useMemo(() => {
    const f = snapshot?.funnel;
    if (!f) return [];
    return [
      { key: 'productViews', label: 'Product pages viewed', value: f.productViews },
      { key: 'addToCart', label: 'Added to cart', value: f.addToCart },
      { key: 'checkoutStarts', label: 'Reached checkout', value: f.checkoutStarts },
      {
        key: 'purchases',
        label: 'Orders placed',
        value: f.purchases,
        hint: 'Counted from real orders, not from browser events.',
      },
    ];
  }, [snapshot]);

  const regions = useMemo(
    () =>
      (snapshot?.regions || [])
        .filter((row) => !country || row.country === country)
        .slice(0, 12),
    [snapshot, country],
  );

  const cities = useMemo(
    () => (snapshot?.cities || []).filter((row) => !country || row.country === country).slice(0, 12),
    [snapshot, country],
  );

  const countries = useMemo(
    () => (snapshot?.countries || []).map((row) => ({ ...row, label: countryName(row.label) })),
    [snapshot],
  );

  /* Country rows are displayed by name but filtered by code, so the click
     handler maps the label back to the code the data actually carries. */
  const onCountryClick = (name) => {
    if (name === null) {
      setCountry(null);
      return;
    }
    const match = (snapshot?.countries || []).find((row) => countryName(row.label) === name);
    setCountry(match ? match.label : null);
  };

  const selectedCountryName = country ? countryName(country) : null;

  const formatMetric = (value, axis = false) => {
    if (metric === 'revenue') return axis ? `₹${compact.format(value)}` : inr(value);
    return axis ? compact.format(value) : nf.format(Math.round(value));
  };

  const rangeLabel = snapshot
    ? `${snapshot.range.from} to ${snapshot.range.to}`
    : range.custom
      ? `${range.from} to ${range.to}`
      : `last ${range.days} days`;

  const gaps = snapshot?.dataGaps;
  const noTraffic = Boolean(snapshot) && totals?.pageviews === 0;

  return (
    <motion.div
      variants={pageVariants(reduced)}
      initial="initial"
      animate="animate"
      className="shell-wide section-pad-sm"
    >
      {/* --- Header ------------------------------------------------------- */}
      <nav className="mb-4 flex items-center gap-1.5 text-xs" aria-label="Breadcrumb">
        <Link
          to="/admin/dashboard"
          className="inline-flex items-center gap-1.5 hover:underline"
          style={{ color: 'var(--text-muted)' }}
        >
          <Home className="h-3.5 w-3.5" aria-hidden="true" />
          Dashboard
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" style={{ color: 'var(--text-subtle)' }} />
        <span style={{ color: 'var(--text-body)' }}>Live analytics</span>
      </nav>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            className="text-3xl font-bold leading-tight"
            style={{ color: 'var(--text-strong)', fontFamily: 'var(--font-display)' }}
          >
            Live analytics
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            Traffic, journey and sales for the {rangeLabel}, compared with the period before it.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <RangePicker range={range} onChange={setRange} disabled={loading} />
          <button
            type="button"
            onClick={() => loadSnapshot({ silent: true })}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold disabled:opacity-60"
            style={{
              minHeight: 40,
              borderColor: 'var(--hairline)',
              background: 'var(--surface-card)',
              color: 'var(--text-body)',
            }}
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-2xl border p-4"
          style={{ borderColor: 'var(--delta-down)', background: 'var(--surface-card)' }}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" style={{ color: 'var(--delta-down)' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
              {error}
            </p>
            <button
              type="button"
              onClick={() => loadSnapshot()}
              className="mt-1 text-xs font-semibold underline"
              style={{ color: 'var(--maroon)' }}
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* --- Right now ---------------------------------------------------- */}
      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <LiveVisitors
          live={live?.live ?? 0}
          windowMinutes={live?.windowMinutes ?? 5}
          loading={liveLoading}
          stale={hidden}
        />

        <StatCard
          label="Revenue"
          value={totals?.revenue ?? 0}
          delta={deltas.revenue}
          prefix="₹"
          icon={IndianRupee}
          loading={loading}
          hint="Cancelled and refunded excluded"
        />
        <StatCard
          label="Orders"
          value={totals?.orders ?? 0}
          delta={deltas.orders}
          icon={ShoppingCart}
          loading={loading}
        />
        <StatCard
          label="Average order"
          value={totals?.avgOrderValue ?? 0}
          delta={deltas.avgOrderValue}
          prefix="₹"
          icon={Receipt}
          loading={loading}
        />
      </section>

      {/* --- Headline metrics --------------------------------------------- */}
      <section className="mb-8">
        <SectionHeading
          icon={TrendingUp}
          title="Headline numbers"
          hint="Every arrow compares this period with the equally long period before it."
        />

        {loading ? (
          <StatCardSkeleton count={4} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Pageviews"
              value={totals?.pageviews ?? 0}
              delta={deltas.pageviews}
              icon={Eye}
            />
            <StatCard
              label="Visits"
              value={totals?.sessions ?? 0}
              delta={deltas.sessions}
              icon={Users}
              hint="One per browser tab"
            />
            <StatCard
              label="Pages per visit"
              value={totals?.viewsPerSession ?? 0}
              delta={deltas.viewsPerSession}
              decimals={2}
              icon={Package}
            />
            <StatCard
              label="Conversion"
              value={totals?.conversionRate ?? 0}
              delta={deltas.conversionRate}
              suffix="%"
              decimals={1}
              icon={ShoppingCart}
              hint="Orders per visit"
            />
          </div>
        )}
      </section>

      {noTraffic && (
        <div
          className="mb-8 rounded-2xl border p-5"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}
        >
          <p className="text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
            No visitor data for this period yet.
          </p>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Traffic, device and hour figures start filling in as soon as visitors browse the live
            site — tracking is skipped on staff pages and in local development. Orders and revenue
            above are real and complete regardless.
          </p>
        </div>
      )}

      {/* --- Trend -------------------------------------------------------- */}
      <section className="card-premium mb-8 p-5">
        <SectionHeading
          title="Day by day"
          hint="Hover the chart for a single day."
          action={
            series.length > 0 && (
              <CsvButton
                label="Daily CSV"
                onClick={() =>
                  exportCsv(`analytics-daily-${snapshot.range.from}-to-${snapshot.range.to}.csv`, series, [
                    { key: 'day', header: 'Date' },
                    { key: 'pageviews', header: 'Pageviews' },
                    { key: 'sessions', header: 'Visits' },
                    { key: 'orders', header: 'Orders' },
                    { key: 'revenue', header: 'Revenue (INR)' },
                  ])
                }
              />
            )
          }
        />

        <div
          className="mb-4 inline-flex flex-wrap gap-1 rounded-full border p-1"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}
          role="tablist"
          aria-label="Chart metric"
        >
          {METRICS.map((option) => {
            const active = metric === option.key;
            return (
              <button
                key={option.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMetric(option.key)}
                className="rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{
                  background: active ? 'var(--surface-card)' : 'transparent',
                  color: active ? 'var(--text-strong)' : 'var(--text-muted)',
                  boxShadow: active ? 'var(--shadow-xs)' : 'none',
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <Skeleton className="h-[260px] w-full" rounded="var(--r-lg)" />
        ) : (
          <TrendChart
            series={series}
            metric={metric}
            metricLabel={METRICS.find((m) => m.key === metric)?.label.toLowerCase()}
            formatValue={formatMetric}
          />
        )}
      </section>

      {/* --- Journey and devices ------------------------------------------ */}
      <section className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card-premium p-5">
          <SectionHeading
            title="Where the journey leaks"
            hint="Each percentage is the share that carried on from the step above."
          />
          {loading ? (
            <TableSkeleton rows={4} cols={1} label="Loading funnel" />
          ) : (
            <FunnelChart stages={funnelStages} />
          )}
        </div>

        <div className="card-premium p-5">
          <SectionHeading icon={Monitor} title="Devices" hint="Share of pageviews by device." />
          {loading ? (
            <TableSkeleton rows={3} cols={2} label="Loading device split" />
          ) : (
            <DeviceDonut devices={snapshot?.devices || []} />
          )}
        </div>
      </section>

      {/* --- Heatmap ------------------------------------------------------ */}
      <section className="card-premium mb-8 p-5">
        <SectionHeading
          icon={Clock}
          title="When people browse"
          hint="Pageviews by weekday and hour, in each visitor's own local time."
        />
        {loading ? (
          <Skeleton className="h-52 w-full" rounded="var(--r-lg)" />
        ) : (
          <TrafficHeatmap grid={snapshot?.grid || []} />
        )}
      </section>

      {/* --- Breakdowns --------------------------------------------------- */}
      <section className="mb-8">
        <SectionHeading
          icon={Globe2}
          title="Where visitors come from"
          hint={
            selectedCountryName
              ? `Filtered to ${selectedCountryName}. Click it again to clear.`
              : 'Click a country to filter the regions and cities beside it.'
          }
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <BreakdownTable
            title="Countries"
            icon={Globe2}
            rows={countries}
            loading={loading}
            onSelect={onCountryClick}
            selected={selectedCountryName}
            labelHeading="Country"
            csvName="analytics-countries.csv"
            emptyText="No location data yet."
          />
          <BreakdownTable
            title="Regions"
            icon={MapPin}
            rows={regions}
            loading={loading}
            labelHeading="Region"
            csvName="analytics-regions.csv"
            emptyText={selectedCountryName ? `No regions recorded for ${selectedCountryName}.` : 'No region data yet.'}
            note="Falls back to the visitor's timezone only when their location cannot be resolved."
          />
          <BreakdownTable
            title="Cities"
            icon={MapPin}
            rows={cities}
            loading={loading}
            labelHeading="City"
            csvName="analytics-cities.csv"
            emptyText={
              selectedCountryName
                ? `No cities recorded for ${selectedCountryName}.`
                : 'No city data yet.'
            }
            note="One count per visit, not per page, so this reads as visitors."
          />
        </div>
      </section>

      <section className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BreakdownTable
          title="Most visited pages"
          icon={Eye}
          rows={snapshot?.pages || []}
          loading={loading}
          labelHeading="Path"
          csvName="analytics-pages.csv"
        />
        <BreakdownTable
          title="How they found the shop"
          icon={Link2}
          rows={snapshot?.referrers || []}
          loading={loading}
          labelHeading="Referrer"
          csvName="analytics-referrers.csv"
          emptyText="Everyone arrived directly, or the referrer was hidden."
        />
      </section>

      {/* --- Best sellers ------------------------------------------------- */}
      <section className="card-premium mb-8 p-5">
        <SectionHeading
          icon={Package}
          title="Best sellers this period"
          hint="From placed orders, so these numbers are exact."
          action={
            (snapshot?.topProducts || []).length > 0 && (
              <CsvButton
                label="CSV"
                onClick={() =>
                  exportCsv('analytics-top-products.csv', snapshot.topProducts, [
                    { key: 'name', header: 'Product' },
                    { key: 'units', header: 'Units sold' },
                    { key: 'revenue', header: 'Revenue (INR)' },
                  ])
                }
              />
            )
          }
        />

        {loading ? (
          <TableSkeleton rows={5} cols={3} label="Loading best sellers" />
        ) : (snapshot?.topProducts || []).length === 0 ? (
          <p className="py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            No orders in this period.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: 'var(--text-muted)' }}>
                  <th className="pb-2 text-left text-[11px] font-semibold uppercase tracking-wider">
                    Product
                  </th>
                  <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider">
                    Units
                  </th>
                  <th className="pb-2 text-right text-[11px] font-semibold uppercase tracking-wider">
                    Revenue
                  </th>
                </tr>
              </thead>
              <tbody>
                {snapshot.topProducts.map((product) => (
                  <tr key={product.id} style={{ borderTop: '1px solid var(--hairline)' }}>
                    <td className="py-2.5 pr-3" style={{ color: 'var(--text-body)' }}>
                      {product.name}
                    </td>
                    <td className="tabular py-2.5 text-right font-semibold" style={{ color: 'var(--text-strong)' }}>
                      {nf.format(product.units)}
                    </td>
                    <td className="tabular py-2.5 text-right" style={{ color: 'var(--text-body)' }}>
                      {inr(product.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* --- Honesty about the data --------------------------------------- */}
      {gaps && (gaps.ordersTruncated || gaps.ordersUnavailable) && (
        <p
          className="mb-3 flex items-start gap-2 text-xs"
          style={{ color: 'var(--delta-down)' }}
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {gaps.ordersUnavailable
            ? 'Order figures could not be read for this period, so revenue and best sellers are missing.'
            : 'This period has more orders than a single read returns, so order figures are partial. Choose a shorter range for exact numbers.'}
        </p>
      )}

      {/* Orders go back as far as the shop does; visitor tracking only started
          when it was switched on. Saying so is the difference between an odd
          conversion rate and an apparent bug. */}
      {gaps && snapshot && gaps.trackingDays < snapshot.range.days && (
        <p className="mb-3 flex items-start gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
            style={{ color: 'var(--gold-500)' }}
          />
          <span>
            Visitor tracking has data for {gaps.trackingDays} of these{' '}
            {snapshot.range.days} days, while orders cover the whole period. Anything that
            divides orders by visits — conversion, pages per visit — will settle once tracking
            has run for a full range.
          </span>
        </p>
      )}

      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-subtle)' }}>
        Collected first-party. No IP address is stored and no third-party tracker is loaded —
        location is taken from the visitor's own language and timezone settings, so treat it as a
        rough indication rather than a fact. Staff pages are excluded from every count.
      </p>
    </motion.div>
  );
}
