// Onglets : affiche le panneau correspondant et déplace l'indicateur
const tabs = [...document.querySelectorAll('.tab')];
const indicator = document.querySelector('.tabs__indicator');

function selectTab(i) {
  tabs.forEach((t, j) => {
    const active = i === j;
    t.classList.toggle('is-active', active);
    t.setAttribute('aria-selected', String(active));
    document.getElementById(t.getAttribute('aria-controls')).hidden = !active;
  });
  indicator.style.transform = `translateX(${i * 100}%)`;
}
tabs.forEach((tab, i) => tab.addEventListener('click', () => selectTab(i)));

// L'icône « Métriques » de l'en-tête ouvre l'onglet correspondant
document.querySelectorAll('[data-goto]').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    selectTab(Number(el.dataset.goto));
    document.querySelector('.tabs').scrollIntoView({ behavior: 'smooth' });
  });
});

// J'aime
document.querySelectorAll('.action[data-action="like"]').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.setAttribute('aria-pressed', String(btn.getAttribute('aria-pressed') !== 'true'));
  });
});

// Visionneuse des captures d'écran
const lightbox = document.getElementById('lightbox');
const lbImg = lightbox.querySelector('img');
const lbCaption = lightbox.querySelector('.lightbox__caption');

document.querySelectorAll('.phone').forEach(fig => {
  fig.addEventListener('click', () => {
    lbImg.src = fig.dataset.src;
    lbImg.alt = fig.querySelector('img').alt;
    lbCaption.textContent = fig.dataset.caption;
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
  });
});

function closeLightbox() {
  lightbox.hidden = true;
  document.body.style.overflow = '';
}
lightbox.addEventListener('click', e => { if (e.target !== lbImg) closeLightbox(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !lightbox.hidden) closeLightbox(); });
