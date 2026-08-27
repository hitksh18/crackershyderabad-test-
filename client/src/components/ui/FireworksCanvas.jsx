import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * Ambient fireworks rendered on a single canvas.
 *
 * One element, one rAF loop, no DOM churn. Density scales with viewport and
 * core count, the loop parks itself when the tab is hidden or the canvas
 * scrolls out of view, and the whole thing renders nothing at all for visitors
 * who asked for reduced motion.
 *
 * Purely decorative — it is aria-hidden and never carries meaning.
 */

const PALETTE = [
  [210, 166, 79], // antique gold
  [247, 174, 44], // saffron
  [223, 76, 33], // ember
  [203, 42, 42], // crimson
  [255, 236, 200], // warm spark
];

const TAU = Math.PI * 2;

const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const range = (min, max) => min + Math.random() * (max - min);

class Burst {
  constructor(width, height, sparkCount) {
    this.reset(width, height, sparkCount);
  }

  reset(width, height, sparkCount) {
    // Keep bursts in the upper two-thirds; the lower band holds content.
    this.x = range(width * 0.06, width * 0.94);
    this.y = range(height * 0.08, height * 0.62);
    this.colour = pick(PALETTE);
    this.age = 0;
    this.life = range(1.1, 1.9);
    this.delay = range(0, 3.2);
    this.sparks = [];

    const speed = range(38, 92);
    for (let i = 0; i < sparkCount; i += 1) {
      const angle = (i / sparkCount) * TAU + range(-0.12, 0.12);
      const velocity = speed * range(0.55, 1);
      this.sparks.push({
        angle,
        velocity,
        size: range(1, 2.4),
        drag: range(0.86, 0.94),
      });
    }
  }

  draw(ctx, dt, width, height, sparkCount) {
    if (this.delay > 0) {
      this.delay -= dt;
      return;
    }

    this.age += dt;
    const t = this.age / this.life;

    if (t >= 1) {
      this.reset(width, height, sparkCount);
      this.delay = range(0.4, 3);
      return;
    }

    const [r, g, b] = this.colour;
    // Ease-out expansion, then fade.
    const spread = 1 - Math.pow(1 - t, 3);
    const alpha = t < 0.12 ? t / 0.12 : Math.pow(1 - (t - 0.12) / 0.88, 1.6);
    const gravity = 26 * t * t;

    for (let i = 0; i < this.sparks.length; i += 1) {
      const s = this.sparks[i];
      const dist = s.velocity * spread;
      const px = this.x + Math.cos(s.angle) * dist;
      const py = this.y + Math.sin(s.angle) * dist + gravity;

      // Short trail: a second, dimmer dot trailing the head.
      const trailDist = dist * 0.82;
      const tx = this.x + Math.cos(s.angle) * trailDist;
      const ty = this.y + Math.sin(s.angle) * trailDist + gravity * 0.82;

      ctx.globalAlpha = alpha * 0.28;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.arc(tx, ty, s.size * 0.7, 0, TAU);
      ctx.fill();

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(px, py, s.size, 0, TAU);
      ctx.fill();
    }

    // Soft core flash on the first beat of the burst.
    if (t < 0.22) {
      ctx.globalAlpha = (1 - t / 0.22) * 0.35;
      const glow = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, 46);
      glow.addColorStop(0, `rgba(${r},${g},${b},1)`);
      glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 46, 0, TAU);
      ctx.fill();
    }
  }
}

const FireworksCanvas = ({ className = '', density = 1, opacity = 0.85 }) => {
  const canvasRef = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return undefined;

    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return undefined;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let bursts = [];
    let frame = 0;
    let last = 0;
    let visible = true;
    let onScreen = true;

    const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;

    const configure = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Small screens and low-core devices get a much thinner show.
      const small = width < 640;
      const weak = cores <= 4;
      const burstCount = Math.max(
        2,
        Math.round((small ? 3 : 6) * (weak ? 0.6 : 1) * density)
      );
      const sparkCount = small ? 12 : weak ? 16 : 22;

      bursts = Array.from({ length: burstCount }, () => new Burst(width, height, sparkCount));
      bursts.sparkCount = sparkCount;
    };

    const loop = (now) => {
      frame = requestAnimationFrame(loop);
      if (!visible || !onScreen) {
        last = now;
        return;
      }

      // Clamp dt so a backgrounded tab does not fast-forward the animation.
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < bursts.length; i += 1) {
        bursts[i].draw(ctx, dt, width, height, bursts.sparkCount);
      }
      ctx.globalAlpha = 1;
    };

    const onVisibility = () => {
      visible = document.visibilityState === 'visible';
    };

    configure();
    last = performance.now();
    frame = requestAnimationFrame(loop);

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(configure) : null;
    resizeObserver?.observe(canvas);

    const intersectionObserver =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            ([entry]) => {
              onScreen = entry.isIntersecting;
            },
            { rootMargin: '120px' }
          )
        : null;
    intersectionObserver?.observe(canvas);

    document.addEventListener('visibilitychange', onVisibility);
    if (!resizeObserver) window.addEventListener('resize', configure);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      if (!resizeObserver) window.removeEventListener('resize', configure);
    };
  }, [reduced, density]);

  if (reduced) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      style={{ opacity }}
    />
  );
};

export default FireworksCanvas;
