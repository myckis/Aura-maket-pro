// Onglets : déplace l'indicateur sous l'onglet actif
const tabs = document.querySelectorAll('.tab');
const indicator = document.querySelector('.tabs__indicator');
tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => { t.classList.remove('is-active'); t.setAttribute('aria-selected', 'false'); });
    tab.classList.add('is-active');
    tab.setAttribute('aria-selected', 'true');
    indicator.style.transform = `translateX(${i * 100}%)`;
  });
});

// Format compact : 19300 -> 19.3k
const compact = n => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n);

// Like / Repost : bascule l'état et met à jour le compteur
function bindToggles(root) {
  root.querySelectorAll('.action[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const on = btn.getAttribute('aria-pressed') !== 'true';
      const count = Number(btn.dataset.count) + (on ? 1 : -1);
      btn.dataset.count = count;
      btn.setAttribute('aria-pressed', String(on));
      btn.querySelector('span').textContent = compact(count);
    });
  });
}
bindToggles(document);

// Composer : publie un nouveau thread en haut du fil
const form = document.getElementById('composer');
const input = document.getElementById('composerInput');
const feed = document.getElementById('feed');
const avatar = '<div class="avatar avatar--sm"><svg viewBox="0 0 64 64" aria-hidden="true"><use href="#face"/></svg></div>';

form.addEventListener('submit', e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  const post = document.createElement('article');
  post.className = 'post post--new';
  const now = new Date();
  const date = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;
  post.innerHTML = `
    ${avatar}
    <div class="post__body">
      <div class="post__head"><strong>uix.vikram</strong> <time>${date}</time></div>
      <p class="post__text"></p>
      <div class="actions">
        <button class="action" data-action="like" data-count="0" aria-pressed="false">
          <svg viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/></svg><span>0</span>
        </button>
        <button class="action" data-action="repost" data-count="0" aria-pressed="false">
          <svg viewBox="0 0 24 24"><path d="M7 7h10a3 3 0 0 1 3 3v1M17 17H7a3 3 0 0 1-3-3v-1M9 4 6 7l3 3M15 20l3-3-3-3"/></svg><span>0</span>
        </button>
      </div>
    </div>`;
  post.querySelector('.post__text').textContent = text;
  feed.prepend(post);
  bindToggles(post);
  input.value = '';
});
