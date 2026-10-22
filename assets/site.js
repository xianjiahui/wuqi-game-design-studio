(() => {
  const root = document.documentElement;
  const key = 'study-theme';
  try {
    const saved = localStorage.getItem(key);
    if (saved === 'light' || saved === 'dark') root.dataset.theme = saved;
  } catch {}

  document.querySelector('.theme')?.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem(key, next); } catch {}
  });

  const bar = document.querySelector('.progress');
  const links = [...document.querySelectorAll('.rail nav a[href^="#"]')];
  const sections = links.map(link => ({link, section: document.getElementById(link.hash.slice(1))})).filter(item => item.section);
  let scheduled = false;
  function updateProgress() {
    scheduled = false;
    const room = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.width = (room > 0 ? Math.min(100, Math.max(0, scrollY / room * 100)) : 0) + '%';
    let current = sections[0];
    for (const item of sections) {
      if (item.section.getBoundingClientRect().top <= 150) current = item;
    }
    for (const item of sections) {
      if (item === current) item.link.setAttribute('aria-current', 'location');
      else item.link.removeAttribute('aria-current');
    }
  }
  addEventListener('scroll', () => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(updateProgress);
    }
  }, { passive: true });
  addEventListener('resize', updateProgress);
  addEventListener('load', updateProgress);
  updateProgress();

})();
