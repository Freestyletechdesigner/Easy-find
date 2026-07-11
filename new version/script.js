// === Preloader ===
window.addEventListener('load', () => {
  setTimeout(() => document.getElementById('preloader')?.classList.add('hide'), 2200);
});

// === Nav scroll shadow ===
const nav = document.getElementById('nav');
const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
document.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// === Mobile drawer ===
const hamburger = document.getElementById('hamburger');
const drawer = document.getElementById('mobileDrawer');
hamburger?.addEventListener('click', () => {
  const open = hamburger.classList.toggle('active');
  drawer.classList.toggle('open', open);
  hamburger.setAttribute('aria-expanded', open);
});
drawer?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
  hamburger.classList.remove('active');
  drawer.classList.remove('open');
}));

// === Category segmented ===
document.querySelectorAll('.seg-btn').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.seg-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
  });
});

// === Bedroom stepper ===
const bedrooms = document.getElementById('bedrooms');
document.querySelectorAll('[data-step]').forEach(btn => {
  btn.addEventListener('click', () => {
    const delta = parseInt(btn.dataset.step, 10);
    const next = Math.max(0, Math.min(10, parseInt(bedrooms.value, 10) + delta));
    bedrooms.value = next;
  });
});

// === Property cards (mock data) ===
const properties = [
  { img: 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=900&q=80', price: '₦45,000,000', title: 'Modern 4-Bedroom Duplex', loc: 'Independence Layout, Enugu', beds: 4, baths: 5, sqft: '320 m²' },
  { img: 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=900&q=80', price: '₦850,000/yr', title: '2-Bedroom Serviced Apartment', loc: 'New Haven, Enugu', beds: 2, baths: 2, sqft: '110 m²' },
  { img: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=900&q=80', price: '₦120,000,000', title: 'Contemporary Family Home', loc: 'GRA, Enugu', beds: 5, baths: 6, sqft: '450 m²' },
  { img: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=900&q=80', price: '₦18,000,000', title: 'Commercial Shop Space', loc: 'Ogui Road, Enugu', beds: 0, baths: 1, sqft: '85 m²' },
  { img: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=900&q=80', price: '₦9,500,000', title: 'Prime Land Plot', loc: 'Trans-Ekulu, Enugu', beds: 0, baths: 0, sqft: '600 m²' },
  { img: 'https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?auto=format&fit=crop&w=900&q=80', price: '₦62,000,000', title: 'Elegant 3-Bedroom Bungalow', loc: 'Nsukka, Enugu', beds: 3, baths: 3, sqft: '210 m²' },
];
const grid = document.getElementById('propertyGrid');
grid.innerHTML = properties.map(p => `
  <article class="card reveal">
    <div class="card-media">
      <img src="${p.img}" alt="${p.title}" loading="lazy" />
      <span class="badge">Verified</span>
      <button class="fav" aria-label="Save">♡</button>
    </div>
    <div class="card-body">
      <div class="price">${p.price}</div>
      <h3 class="card-title">${p.title}</h3>
      <div class="card-loc">📍 ${p.loc}</div>
      <div class="card-meta">
        ${p.beds ? `<span>🛏 ${p.beds} beds</span>` : ''}
        ${p.baths ? `<span>🛁 ${p.baths} baths</span>` : ''}
        <span>📐 ${p.sqft}</span>
      </div>
    </div>
  </article>
`).join('');

// === Reveal on scroll ===
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach(el => io.observe(el));

// === Stats count-up ===
const statsIO = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    const el = e.target;
    const target = +el.dataset.count;
    const dur = 1400;
    const start = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const v = Math.floor(target * (1 - Math.pow(1 - p, 3)));
      el.textContent = v.toLocaleString() + '+';
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    statsIO.unobserve(el);
  });
}, { threshold: 0.4 });
document.querySelectorAll('[data-count]').forEach(el => statsIO.observe(el));

// === Modals ===
function openModal(id){ document.getElementById(id + 'Modal')?.classList.add('open'); }
function closeModals(){ document.querySelectorAll('.modal').forEach(m => m.classList.remove('open')); }
window.closeModals = closeModals;
document.querySelectorAll('[data-open-modal]').forEach(b => b.addEventListener('click', () => openModal(b.dataset.openModal)));
document.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', closeModals));
document.querySelectorAll('[data-switch-modal]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); closeModals(); openModal(a.dataset.switchModal); }));
document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', (e) => { if (e.target === m) closeModals(); }));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModals(); });

// === Feedback panel ===
const fp = document.getElementById('feedbackPanel');
document.getElementById('feedbackFab')?.addEventListener('click', () => fp.classList.toggle('open'));
document.getElementById('closeFeedback')?.addEventListener('click', () => fp.classList.remove('open'));
window.closeFeedback = () => fp.classList.remove('open');
const ta = fp.querySelector('textarea');
const count = fp.querySelector('.count');
ta.addEventListener('input', () => count.textContent = `${ta.value.length}/300`);
fp.querySelectorAll('.rating span').forEach((s, i, arr) => {
  s.addEventListener('click', () => arr.forEach((x, j) => x.style.color = j <= i ? '#fbbf24' : '#e5e7eb'));
});

// === Cookie banner ===
const cookie = document.getElementById('cookie');
if (!localStorage.getItem('ef_cookie')) {
  setTimeout(() => cookie.classList.add('show'), 2800);
}
document.getElementById('cookieAccept')?.addEventListener('click', () => { localStorage.setItem('ef_cookie', '1'); cookie.classList.remove('show'); });
document.getElementById('cookieDecline')?.addEventListener('click', () => { localStorage.setItem('ef_cookie', '0'); cookie.classList.remove('show'); });

// === Toast ===
let toastTimer;
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}
window.toast = toast;

// === Smooth anchor scroll ===
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (id.length > 1) {
      const el = document.querySelector(id);
      if (el) { e.preventDefault(); window.scrollTo({ top: el.offsetTop - 70, behavior: 'smooth' }); }
    }
  });
});

// === Chatbot Logic ===
const chatPanel = document.getElementById('chatbotPanel');
const chatMessages = document.getElementById('chatMessages');
const aiForm = document.getElementById('aiForm');
const aiInput = document.getElementById('aiInput');

// Toggle Chat
document.getElementById('aiFab').addEventListener('click', () => chatPanel.classList.toggle('open'));
document.getElementById('closeChat').addEventListener('click', () => chatPanel.classList.remove('open'));

// Simulate AI Search
aiForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const query = aiInput.value.toLowerCase();
  if (!query) return;

  // Add User Text
  chatMessages.innerHTML += `<p><b>You:</b> ${aiInput.value}</p>`;
  
  // Simulate AI response using the 'properties' array already in your script
  const results = properties.filter(p => p.loc.toLowerCase().includes(query) || p.title.toLowerCase().includes(query));
  
  setTimeout(() => {
    if (results.length > 0) {
      chatMessages.innerHTML += `<p><b>AI:</b> I found ${results.length} properties for you:</p>`;
      results.forEach(p => {
        chatMessages.innerHTML += `<div style="background:#f8fafc; padding:8px; margin-bottom:5px; border-radius:5px; font-size:12px;">
          <strong>${p.title}</strong><br>${p.price}
        </div>`;
      });
    } else {
      chatMessages.innerHTML += `<p><b>AI:</b> Sorry, no properties found for that search.</p>`;
    }
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }, 500);

  aiInput.value = '';
});