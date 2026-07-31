// Partial Lunar Eclipse — zero-dependency landing interactions.

const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const finePointer = globalThis.matchMedia?.('(pointer: fine)').matches ?? false;

document.getElementById('year').textContent = String(new Date().getFullYear());

// Reveal elements only after JS is ready, so no-script and full-page captures
// never render large blank sections.
if (!reducedMotion) {
  document.documentElement.classList.add('motion-ready');
}

(() => {
  const items = Array.from(document.querySelectorAll('.reveal'));
  if (reducedMotion || !('IntersectionObserver' in globalThis)) {
    for (const item of items) item.classList.add('is-visible');
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const element = entry.target;
        const siblings = Array.from(element.parentElement?.children ?? []);
        const index = Math.max(0, siblings.indexOf(element));
        element.style.setProperty('--reveal-delay', `${Math.min(index % 4, 3) * 70}ms`);
        element.classList.add('is-visible');
        observer.unobserve(element);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );

  for (const item of items) observer.observe(item);
})();

// Nav materializes only after leaving the hero's top edge.
(() => {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  const update = () => nav.classList.toggle('is-scrolled', scrollY > 18);
  update();
  addEventListener('scroll', update, { passive: true });
})();

// Interactive eclipse phases. The autonomous 14-second cycle resumes after
// a short pause so the hero stays alive without fighting the user's choice.
(() => {
  const system = document.getElementById('eclipseSystem');
  const buttons = Array.from(document.querySelectorAll('.phase-control [data-phase]'));
  if (!system || buttons.length === 0) return;

  const cycle = 14000;
  const phases = [
    { at: 0, phase: 'light' },
    { at: 0.18, phase: 'partial' },
    { at: 0.38, phase: 'maximum' },
    { at: 0.64, phase: 'return' },
    { at: 0.86, phase: 'light' },
  ];
  let controlledUntil = 0;
  const startedAt = performance.now();

  const setActive = (phase) => {
    system.dataset.phase = phase;
    for (const button of buttons) {
      button.classList.toggle('is-active', button.dataset.phase === phase);
    }
  };

  for (const button of buttons) {
    button.addEventListener('click', () => {
      controlledUntil = performance.now() + 5200;
      system.classList.add('is-controlled');
      setActive(button.dataset.phase);
    });
  }

  if (reducedMotion) {
    system.classList.add('is-controlled');
    setActive('partial');
    return;
  }

  const tick = (now) => {
    if (now >= controlledUntil) {
      system.classList.remove('is-controlled');
      const progress = ((now - startedAt) % cycle) / cycle;
      let current = 'light';
      for (const phase of phases) {
        if (progress >= phase.at) current = phase.phase;
      }
      setActive(current);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();

// Gentle hero parallax: the object stays anchored and only tilts a few degrees.
(() => {
  const visual = document.querySelector('[data-parallax]');
  if (!visual || reducedMotion || !finePointer) return;
  const hero = document.querySelector('.hero');
  if (!hero) return;

  hero.addEventListener('pointermove', (event) => {
    const rect = hero.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    visual.style.setProperty('--px', (x * 3.4).toFixed(2));
    visual.style.setProperty('--py', (y * 2.5).toFixed(2));
  });
  hero.addEventListener('pointerleave', () => {
    visual.style.setProperty('--px', '0');
    visual.style.setProperty('--py', '0');
  });
})();

// Local pointer glow for bento cards; no global cursor effects.
if (finePointer) {
  for (const card of document.querySelectorAll('[data-glow-card]')) {
    card.addEventListener('pointermove', (event) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
      card.style.setProperty('--my', `${event.clientY - rect.top}px`);
    });
  }
}

// Lightweight canvas star field with depth drift and occasional shooting light.
(() => {
  const canvas = document.getElementById('starfield');
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const context = canvas.getContext('2d');
  if (!context) return;

  let width = 0;
  let height = 0;
  let ratio = 1;
  let stars = [];
  let animationFrame = 0;
  let pointerX = 0;
  let pointerY = 0;
  let shooting = null;
  let lastShot = performance.now();

  const resize = () => {
    ratio = Math.min(devicePixelRatio || 1, 1.5);
    width = innerWidth;
    height = innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const count = Math.max(40, Math.min(130, Math.round((width * height) / 15000)));
    stars = Array.from({ length: count }, (_, index) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: 0.35 + Math.random() * 1.1,
      alpha: 0.16 + Math.random() * 0.52,
      speed: 0.04 + Math.random() * 0.12,
      depth: 0.3 + Math.random() * 0.7,
      warm: index % 9 === 0,
    }));
  };

  const draw = (now) => {
    animationFrame = 0;
    context.clearRect(0, 0, width, height);
    for (const star of stars) {
      star.y += star.speed;
      if (star.y > height + 2) star.y = -2;
      const x = star.x + pointerX * star.depth * 7;
      const y = star.y + pointerY * star.depth * 5;
      const twinkle = 0.72 + Math.sin(now * 0.0012 + star.x) * 0.28;
      context.beginPath();
      context.fillStyle = star.warm
        ? `rgba(239, 168, 126, ${star.alpha * twinkle})`
        : `rgba(151, 177, 255, ${star.alpha * twinkle})`;
      context.arc(x, y, star.radius, 0, Math.PI * 2);
      context.fill();
    }

    if (!shooting && now - lastShot > 6500 + Math.random() * 5000) {
      shooting = { x: width * (0.42 + Math.random() * 0.4), y: height * 0.12, life: 0 };
      lastShot = now;
    }
    if (shooting) {
      shooting.life += 0.018;
      shooting.x -= 4.2;
      shooting.y += 2.1;
      const opacity = Math.sin(Math.min(1, shooting.life) * Math.PI);
      const gradient = context.createLinearGradient(shooting.x, shooting.y, shooting.x + 84, shooting.y - 42);
      gradient.addColorStop(0, `rgba(255,255,255,${opacity})`);
      gradient.addColorStop(0.45, `rgba(112,180,255,${opacity * 0.5})`);
      gradient.addColorStop(1, 'rgba(112,180,255,0)');
      context.strokeStyle = gradient;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(shooting.x, shooting.y);
      context.lineTo(shooting.x + 84, shooting.y - 42);
      context.stroke();
      if (shooting.life >= 1) shooting = null;
    }
    if (!reducedMotion && !document.hidden) {
      animationFrame = requestAnimationFrame(draw);
    }
  };

  addEventListener('resize', resize, { passive: true });
  if (finePointer) {
    addEventListener('pointermove', (event) => {
      pointerX = event.clientX / Math.max(1, width) - 0.5;
      pointerY = event.clientY / Math.max(1, height) - 0.5;
    }, { passive: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    } else if (!reducedMotion && animationFrame === 0) {
      animationFrame = requestAnimationFrame(draw);
    }
  });
  resize();
  if (!reducedMotion) animationFrame = requestAnimationFrame(draw);
  else draw(0);
})();

for (const button of document.querySelectorAll('[data-copy]')) {
  button.addEventListener('click', async () => {
    const text = button.dataset.copy ?? '';
    const label = button.querySelector('span');
    try {
      await navigator.clipboard.writeText(text);
      if (label) label.textContent = '已复制';
    } catch {
      if (label) label.textContent = '复制失败';
    }
    setTimeout(() => {
      if (label) label.textContent = '复制命令';
    }, 1600);
  });
}
