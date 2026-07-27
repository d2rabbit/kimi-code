// Kimi Code Desktop — landing page interactions. Kept tiny on purpose.

// Footer year.
document.getElementById('year').textContent = String(new Date().getFullYear());

// Copy-to-clipboard buttons on code blocks.
for (const btn of document.querySelectorAll('[data-copy]')) {
  btn.addEventListener('click', async () => {
    const code = btn.parentElement?.querySelector('code');
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.textContent ?? '');
      btn.textContent = '已复制 ✓';
    } catch {
      // Clipboard API unavailable (insecure context) — fall back to selection.
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
