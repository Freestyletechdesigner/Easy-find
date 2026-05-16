// ── Nav ───────────────────────────────────────────────
const nav2      = document.getElementById('nav2');
const hamburger = document.getElementById('hamburger');
hamburger.addEventListener('click', () => {
    nav2.classList.toggle('active');
    hamburger.classList.toggle('active');
});
window.addEventListener('click', e => {
    if (!hamburger.contains(e.target) && !nav2.contains(e.target)) {
        nav2.classList.remove('active');
        hamburger.classList.remove('active');
    }
});

// ── Helpers ───────────────────────────────────────────
const $ = id => document.getElementById(id);


function getQueryId() {
    return new URLSearchParams(window.location.search).get('id');
}

// ── Load Property ─────────────────────────────────────
async function loadProperty() {
    const id = getQueryId();
    console.log(' Property ID from URL:', id);
    if (!id) { showError('No property ID provided.'); return; }

    //view post
    const viewedKey = `viewed_${id}`;
    if (!localStorage.getItem(viewedKey)) {
        fetch(`/api/view/post/${id}/view`, {method: 'POST'});
        localStorage.setItem(viewedKey, '1')
    }

    try {
        const res  = await fetch(`/api/view/property/${id}`);
        const data = await res.json();
        
        if (!data.success) throw new Error('Failed to load');

        const prop = data.property;
        if (!prop) { showError('Property not found.'); return; }

        console.log('✅ Rendering property:', prop.title);
        renderProperty(prop);
    } catch (e) {
        console.error('Error loading property:', e);
        showError('Could not load property details.');
    }
}

// ── Render ────────────────────────────────────────────
function renderProperty(p) {
    document.title = `${p.title || 'Property'} - Easy Find`;

    // Badges
    const cat = p.category || '';
    const catEl = $('badgeCategory');
    catEl.textContent = cat === 'shortlet' ? 'Short-let' : cat === 'rent' ? 'For Rent' : cat === 'sale' ? 'For Sale' : '';
    catEl.className = `badge-category ${cat}`;
    $('badgeType').textContent = p.type ? p.type.charAt(0).toUpperCase() + p.type.slice(1) : '';

    // Title / location / date
    $('propTitle').textContent    = p.title || 'Untitled Property';
    $('propLocation').innerHTML   = `<i class="fa-solid fa-location-dot"></i> ${p.location || 'Location not specified'}`;
    $('propDate').innerHTML       = `<i class="fa-regular fa-calendar"></i> Listed ${new Date(p.date).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}`;


    //make some change if is land
    const quickDetailsList = document.getElementById('quickDetailsList');
    const propStats = document.querySelector('.prop-stats');

    if (p.type.toLowerCase() === 'land') {
        quickDetailsList.children[2].style.display = 'none';
        quickDetailsList.children[3].style.display = 'none';
        propStats.children[0].style.display = 'none';
        propStats.children[1].style.display = 'none';
    } else {
        propStats.children[2].style.display = 'none';
        quickDetailsList.children[4].style.display = 'none'
    }


    // Stats
    $('statBeds').textContent  = p.beds  || '0';
    $('statBaths').textContent = p.baths || '0';
    $('statArea').textContent  = p.area  ? p.area.toLowerCase() : '--';

    // Description
    $('propDescription').textContent = p.description || 'No description provided.';

    // Features
    const featuresList = $('featuresList');
    const featureIcons = {
        'Swimming Pool': 'fa-water-ladder', 'Gym': 'fa-dumbbell', 'Parking': 'fa-square-parking',
        'Garden': 'fa-seedling', 'Balcony': 'fa-building', 'Security': 'fa-shield-halved',
        'Elevator': 'fa-elevator', 'Pet Friendly': 'fa-paw', 'Furnished': 'fa-couch',
        'Air Conditioning': 'fa-wind'
    };
    // Handle features as array or string
    let features = [];
    if (p.features) {
        if (Array.isArray(p.features)) {
            features = p.features.filter(Boolean);
        } else if (typeof p.features === 'string') {
            features = p.features.split(',').map(f => f.trim()).filter(Boolean);
        }
    }
    if (features.length) {
        featuresList.innerHTML = features.map(f =>
            `<div class="feature-chip"><i class="fa-solid ${featureIcons[f] || 'fa-check'}"></i> ${f}</div>`
        ).join('');
    } else {
        $('featuresSection').style.display = 'none';
    }

    // Price
    const price = Number(p.price).toLocaleString();
    $('propPrice').textContent = `₦${price}`;
    $('propPriceSub').textContent = cat === 'rent' ? 'Per year' : cat === 'shortlet' ? 'Per night' : 'Asking price';

    // Quick details
    $('qdType').textContent     = p.type     ? p.type.charAt(0).toUpperCase() + p.type.slice(1) : '—';
    $('qdCategory').textContent = cat === 'shortlet' ? 'Short-let' : cat === 'rent' ? 'For Rent' : cat === 'sale' ? 'For Sale' : '—';
    $('qdBeds').textContent     = p.beds  ? `${p.beds} Bedroom${p.beds > 1 ? 's' : ''}` : '—';
    $('qdBaths').textContent    = p.baths ? `${p.baths} Bathroom${p.baths > 1 ? 's' : ''}` : '—';
    $('qdArea').textContent     = p.area  ? `${p.area.toUpperCase()}` : '—';
    $('qdLocation').textContent = p.location || '—';

    // Map
    if (p.location) {
        const encoded = encodeURIComponent(p.location + ',Enugu State' + ', Nigeria');
        $('mapFrame').src = `https://maps.google.com/maps?q=${encoded}&output=embed`;
    }

    // Images
    renderSlider(p.imageNames || []);

    // Agent
    loadAgent(p.agentId);

    // Related properties
    currentPropId = p._id;
    relatedPage   = 1;
    document.getElementById('relatedGrid').innerHTML = '';
    loadRelated(p._id, 1);

    // Scroll animations
    setTimeout(triggerScrollAnim, 100);
}

// ── Slider ────────────────────────────────────────────
let sliderIndex = 0;
let sliderImages = [];
let autoSlide;

function renderSlider(imageNames) {
    sliderImages = imageNames.length
        ? imageNames.map(n => `/agent-loged/upload-property/${n}`)
        : ['/icon/home icon.png'];

    const track = $('holdImg');
    track.innerHTML = sliderImages.map(src =>
        `<div class="slide">
            <img src="${src}" alt="Property image" onerror="this.src='/icon/home icon.png'">
        </div>`
    ).join('');

    updateSlides();
    startAutoSlide();
}

function updateSlides() {
    const slides = document.querySelectorAll('.slide');
    slides.forEach((slide, i) => {
        slide.classList.remove('active', 'left', 'right');
        if (i === sliderIndex) {
            slide.classList.add('active');
        } else if (i === (sliderIndex - 1 + slides.length) % slides.length) {
            slide.classList.add('left');
        } else if (i === (sliderIndex + 1) % slides.length) {
            slide.classList.add('right');
        }
    });
    $('imgCounter').textContent = `${sliderIndex + 1} / ${sliderImages.length}`;
}

window.goToSlide = function(i) {
    sliderIndex = i;
    updateSlides();
};

function startAutoSlide() {
    clearInterval(autoSlide);
    autoSlide = setInterval(() => {
        if (sliderImages.length > 1) {
            sliderIndex = (sliderIndex + 1) % sliderImages.length;
            updateSlides();
        }
    }, 4000);
}

$('next').addEventListener('click', () => {
    sliderIndex = (sliderIndex + 1) % sliderImages.length;
    updateSlides();
    startAutoSlide();
});
$('back').addEventListener('click', () => {
    sliderIndex = (sliderIndex - 1 + sliderImages.length) % sliderImages.length;
    updateSlides();
    startAutoSlide();
});


    //view profile
    const profile = document.getElementById('agent-profile');
    

// ── Agent ─────────────────────────────────────────────
async function loadAgent(agentId) {
    if (!agentId) return;
    try {
        const res  = await fetch(`/api/agent/public/${agentId}`);
        const data = await res.json();
        if (!data.success) return;
        const agent = data.agent;
        if (!agent) return;
        
        const agent_name = agent.name.length > 8?
                                 agent.name.slice(0, 8) + '...' :
                                 agent.name
        $('agentName').textContent = agent_name || 'Agent';
        $('agent-stand').textContent = agent.stand || '';

        profile.addEventListener('click', () => {
            window.location.href = `/agent-profile?id=${agent.id}`
        });

        if (agent.profilePicture) {
            $('agentAvatar').innerHTML = `<img src="${agent.profilePicture}" alt="${agent.name}">`;
        }
    } catch (_) {}
}

// ── Contact popup ─────────────────────────────────────
$('btnContact').addEventListener('click', () => $('contactPopup').classList.add('open'));
$('popupClose').addEventListener('click', () => $('contactPopup').classList.remove('open'));
$('contactPopup').addEventListener('click', e => {
    if (e.target === $('contactPopup')) $('contactPopup').classList.remove('open');
});

// ── Share popup ───────────────────────────────────────
$('sharePop').addEventListener('click', () => $('holdPopshare').classList.add('open'));
$('cancelPop').addEventListener('click', () => $('holdPopshare').classList.remove('open'));
$('holdPopshare').addEventListener('click', e => {
    if (e.target === $('holdPopshare')) $('holdPopshare').classList.remove('open');
});

$('shareBtn').addEventListener('click', () => {
    const url = window.location.href;
    if (navigator.share) {
        navigator.share({ title: document.title, url });
    } else {
        alertBox.info('Share', 'Copy the link from your browser address bar.');
    }
});

$('copyBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
        $('copyBtn').innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
        setTimeout(() => {
            $('copyBtn').innerHTML = '<i class="fa-regular fa-copy"></i> Copy Link';
        }, 2000);
    });
});

// ── Scroll animation ──────────────────────────────────
function triggerScrollAnim() {
    const sections = document.querySelectorAll('.section');
    const check = () => sections.forEach(s => {
        const r = s.getBoundingClientRect();
        if (r.top < window.innerHeight - 60) s.classList.add('action');
    });
    window.addEventListener('scroll', check);
    check();
}

// ── Error ─────────────────────────────────────────────
function showError(msg) {
    document.querySelector('main').innerHTML =
        `<div style="text-align:center;padding:80px 20px;color:#555;">
            <i class="fa-solid fa-circle-exclamation" style="font-size:3rem;color:#0d7068;margin-bottom:16px;display:block;"></i>
            <p style="font-size:1.1rem;">${msg}</p>
            <a href="/" style="display:inline-block;margin-top:20px;padding:10px 24px;background:#0d7068;color:#fff;border-radius:10px;text-decoration:none;font-weight:700;">Go Home</a>
        </div>`;
}

// ── Related Properties ────────────────────────────────
let relatedPage = 1;
let currentPropId = null;

function relatedCard(p) {
    const imgSrc   = p.imageNames && p.imageNames.length
        ? `/agent-loged/upload-property/${p.imageNames[0]}`
        : '/icon/home icon.png';
    const imgCount = p.imageNames ? p.imageNames.length : 0;
    const price    = Number(p.price).toLocaleString();
    const date     = new Date(p.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const isLand   = (p.type || '').toLowerCase() === 'land';

    return `
            <div class="related-card section" data-title="${p.title}, ${p.type || 'Property'}" data-location="${p.location || 'N/A'}" data-price="${p.price}" data-room="${p.beds || 0} , ${p.baths || 0}">
                <div class="related-card-img">
                    <img src="${imgSrc}" alt="${p.type || 'Property'}" loading="lazy" onerror="this.src='/icon/home icon.png'">
                    <span class="card-type-badge">${p.type || 'Property'}${p.title ? ', ' + p.title : ''}</span>
                    ${p.category ? `<span class="related-badge ${p.category}">${p.category === 'shortlet' ? 'Short-let' : p.category === 'rent' ? 'For Rent' : 'For Sale'}</span>` : ''}
                    ${imgCount > 1 ? `<span class="related-image-count"><i class="fas fa-images"></i> ${imgCount}</span>` : ''}
                </div>
                <div class="related-card-body">
                    <div class="related-price">₦${price}</div>
                    <div class="related-location"><i class="fas fa-map-marker-alt"></i> ${p.location || 'N/A'}</div>
                    <div class="related-stats">
                        ${isLand ? '' : `<span class="card-stat"><i class="fas fa-bed"></i> ${p.beds || 0} Beds</span>`}
                        ${isLand ? '' : `<span class="card-stat"><i class="fas fa-bath"></i> ${p.baths || 0} Baths</span>`}
                        ${isLand? `<span class="card-stat"><i class="fas fa-ruler-combined"></i> ${p.area || 0}</span>` : ''}
                    </div>
                    <div class="related-date"><i class="fas fa-calendar-alt"></i> Listed ${date} <i class="fas fa-eye"></i> views ${p.view || 0}</div>
                </div>
                <div class="card-footer">
                    <a href="/property?id=${p._id}" class="btn-view-details">
                        View Details <i class="fas fa-arrow-right"></i>
                    </a>
                    <button class="btn-share-card" onclick="shareCard('${p._id}')">
                        <i class="fas fa-share-alt"></i>
                    </button>
                </div>
            </div>
    `;
}

    //share link
    window.shareCard = function(id) {
        const url = `${window.location.origin}/property?id=${id}`;
        if (navigator.share) {
            navigator.share({ title: 'Check out this property on Easy Find', url })
                .catch(() => copyLink(url));
        } else {
            copyLink(url);
        }
    };
    //copy link
    function copyLink(url) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url)
                .then(() => alertBox.success('Copied', 'Property link copied to clipboard'))
                .catch(() => fallbackCopy(url));
        } else {
            fallbackCopy(url);
        }
    }

    function fallbackCopy(url) {
        const el = document.createElement('textarea');
        el.value = url;
        el.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        alertBox.success('Copied', 'Property link copied to clipboard');
    }

async function loadRelated(id, page = 1) {
    try {
        const res  = await fetch(`/api/property/related/${id}?page=${page}`);
        const data = await res.json();

        if (!data.success || !data.related.length) {
            if (page === 1) document.getElementById('relatedSection').style.display = 'none';
            return;
        }

        document.getElementById('relatedSection').style.display = 'block';
        const grid = document.getElementById('relatedGrid');
        data.related.forEach(p => grid.insertAdjacentHTML('beforeend', relatedCard(p)));

        // show load more if full batch returned
        const moreBtn = document.getElementById('relatedMore');
        moreBtn.style.display = data.related.length === 8 ? 'flex' : 'none';

    } catch (err) {
        console.error('Related load error:', err);
    }
}

document.getElementById('btnLoadMore').addEventListener('click', () => {
    relatedPage++;
    loadRelated(currentPropId, relatedPage);
});

// ── Init ──────────────────────────────────────────────
loadProperty();
