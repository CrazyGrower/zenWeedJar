// The cat watches the cursor: pupils slide inside the eyes and the head turns
// a little to follow. Pure decoration — it must never throw on a page where
// the cat is hidden (the ≤560px media query removes it).
(function () {
  const HEAD_TURN_PX = 3;   // how far the head slides toward the cursor
  const HEAD_TILT_DEG = 5;  // how far it tilts
  const PUPIL_PX = 2;       // pupils stay inside the 8px-wide eyes

  document.addEventListener('DOMContentLoaded', () => {
    const cat = document.querySelector('.cat');
    if (!cat) return;

    const head = cat.querySelector('.head');
    const pupils = cat.querySelectorAll('.pupil');
    if (!head || !pupils.length) return;

    // Someone who asked for less motion gets a still cat.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    head.style.transition = 'transform .18s ease-out';
    pupils.forEach((p) => { p.style.transition = 'transform .12s ease-out'; });

    let pending = null;

    function look(clientX, clientY) {
      const box = head.getBoundingClientRect();
      if (!box.width) return; // hidden (mobile breakpoint) — nothing to aim
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;

      // Normalise to [-1, 1] over roughly a third of the viewport, so the cat
      // reaches its full turn well before the cursor hits the screen edge.
      const reach = Math.max(window.innerWidth, window.innerHeight) / 3;
      const dx = Math.max(-1, Math.min(1, (clientX - cx) / reach));
      const dy = Math.max(-1, Math.min(1, (clientY - cy) / reach));

      head.style.transform =
        `translate(${(dx * HEAD_TURN_PX).toFixed(2)}px, ${(dy * HEAD_TURN_PX * 0.6).toFixed(2)}px) ` +
        `rotate(${(dx * HEAD_TILT_DEG).toFixed(2)}deg)`;

      const px = (dx * PUPIL_PX).toFixed(2);
      const py = (dy * PUPIL_PX * 0.8).toFixed(2);
      pupils.forEach((p) => { p.style.transform = `translate(${px}px, ${py}px)`; });
    }

    // Coalesce to one update per frame — mousemove fires far faster than paint.
    window.addEventListener('mousemove', (e) => {
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = null;
        look(e.clientX, e.clientY);
      });
    }, { passive: true });

    // Cursor gone: look straight ahead again.
    document.addEventListener('mouseleave', () => {
      head.style.transform = '';
      pupils.forEach((p) => { p.style.transform = ''; });
    });
  });
})();
