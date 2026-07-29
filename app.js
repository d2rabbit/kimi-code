// Partial Lunar Eclipse — landing page interactions.

// Footer year.
document.getElementById('year').textContent = String(new Date().getFullYear());

// ---- 相位指示：与 12s 月偏食动画同拍 ----
// 与 styles.css 的 umbra-path 关键帧对齐：望(0-16%) 初亏(16-36%) 食甚(36-54%) 复圆(54-100%)。
(() => {
  const chips = Array.from(document.querySelectorAll('.ph'));
  if (chips.length === 0) return;
  const CYCLE = 12000;
  const timeline = [
    { at: 0, ph: 'full' },
    { at: 0.16, ph: 'start' },
    { at: 0.36, ph: 'max' },
    { at: 0.54, ph: 'end' },
    { at: 0.86, ph: 'full' },
  ];
  const t0 = performance.now();
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    chips.find((c) => c.dataset.ph === 'max')?.classList.add('on');
    return;
  }
  function tick(now) {
    const t = ((now - t0) % CYCLE) / CYCLE;
    let current = 'full';
    for (const step of timeline) {
      if (t >= step.at) current = step.ph;
    }
    for (const chip of chips) {
      chip.classList.toggle('on', chip.dataset.ph === current);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();

// ---- 滚动入场：交错浮现 ----
(() => {
  const items = Array.from(document.querySelectorAll('.rv'));
  if (items.length === 0 || !('IntersectionObserver' in globalThis)) {
    for (const el of items) el.classList.add('rv-in');
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        const idx = items.indexOf(el);
        el.style.setProperty('--rvd', `${Math.min(idx % 4, 3) * 70}ms`);
        el.classList.add('rv-in');
        io.unobserve(el);
      }
    },
    { threshold: 0.12 },
  );
  for (const el of items) io.observe(el);
})();

// Copy-to-clipboard buttons on code blocks.
for (const btn of document.querySelectorAll('[data-copy]')) {
  btn.addEventListener('click', async () => {
    const code = btn.parentElement?.querySelector('code');
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.textContent ?? '');
      btn.textContent = '已复制 ✓';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(code);
      const sel = getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      btn.textContent = '已全选';
    }
    setTimeout(() => { btn.textContent = '复制'; }, 1600);
  });
}
