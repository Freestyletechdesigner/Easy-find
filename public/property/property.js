// ── Nav ───────────────────────────────────────────────
const nav2      = document.getElementById('nav2');
const hamburger = document.getElementById('hamburger');
hamburger.addEventListener('click', () => {
    nav2.classList.toggle('active');
    hamburger.classList.toggle('active');
});
window.addEventListener('click', e => {
    if (!hamburger.contains(e.target)) {
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

    // Map — route through backend to avoid mobile CORS issues
    const mapFrame   = $('mapFrame');
    const mapSection = mapFrame ? mapFrame.closest('.prop-section') : null;

    if (p.location) {
        fetch(`/api/geocode?location=${encodeURIComponent(p.location)}`)
        .then(r => r.json())
        .then(geo => {
            if (geo.success) {
                const { lat, lng } = geo;
                const delta = 0.008;
                mapFrame.src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng-delta},${lat-delta},${lng+delta},${lat+delta}&layer=mapnik&marker=${lat},${lng}`;
                mapFrame.style.display = 'block';
            } else {
                showMapFallback(mapSection);
            }
        })
        .catch(() => showMapFallback(mapSection));
    } else if (mapSection) {
        mapSection.style.display = 'none';
    }

    function showMapFallback(section) {
        if (!section) return;
        section.innerHTML = `
            <h2><i class="fa-solid fa-map-location-dot"></i> Location on Map</h2>
            <div style="background:#f0fdfb;border:1px dashed #0d7068;border-radius:12px;padding:28px 20px;text-align:center;">
                <i class="fa-solid fa-map-pin" style="font-size:2rem;color:#0d7068;margin-bottom:12px;display:block;"></i>
                <p style="font-weight:700;color:#333;margin-bottom:6px;">Map Unavailable for This Area</p>
                <p style="font-size:0.875rem;color:#666;line-height:1.6;">This property is in a newly developing area. Contact the agent for precise directions.</p>
                <button onclick="document.getElementById('btnContact').click()" style="margin-top:16px;padding:10px 24px;background:#0d7068;color:#fff;border:none;border-radius:10px;font-weight:600;cursor:pointer;font-size:0.9rem;">
                    <i class="fas fa-phone"></i> Contact Agent
                </button>
            </div>
        `;
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

// ── Related Properties State ────────────────────────────────
let relatedPage = 1;
let currentPropId = null;

/**
 * Generates the HTML layout for a single property card
 * @param {Object} p - Property data object
 * @returns {string} HTML Template string
 */
function relatedCard(p) {
    if (!p) return '';

    // Handle Image fallbacks cleanly
    const imgSrc = p.imageNames && p.imageNames.length
        ? `/agent-loged/upload-property/${encodeURIComponent(p.imageNames[0])}`
        : '/icon/home icon.png';
    const imgCount = p.imageNames ? p.imageNames.length : 0;

    // Formatting values defensively
    const price = p.price ? Number(p.price).toLocaleString('en-NG') : 'Price on Ask';
    const date = p.date 
        ? new Date(p.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) 
        : 'Recent';
    const isLand = String(p.type || '').toLowerCase() === 'land';

    // Escape strings injected inside raw data tags to prevent structural breaks
    const cleanTitle = String(p.title || '').replace(/"/g, '&quot;');
    const cleanType = String(p.type || 'Property').replace(/"/g, '&quot;');
    const cleanLocation = String(p.location || 'N/A').replace(/"/g, '&quot;');

    return `
        <div class="related-card section action" 
             data-title="${cleanTitle}, ${cleanType}" 
             data-location="${cleanLocation}" 
             data-price="${p.price || 0}" 
             data-room="${p.beds || 0}, ${p.baths || 0}">
            
            <div class="related-card-img">
                <img src="${imgSrc}" alt="${cleanType}" loading="lazy" onerror="this.onerror=null; this.src='/icon/home icon.png';">
                <span class="card-type-badge">${cleanType}${p.title ? `, ${p.title}` : ''}</span>
                ${p.category ? `<span class="related-badge ${p.category}">${p.category === 'shortlet' ? 'Short-let' : p.category === 'rent' ? 'For Rent' : 'For Sale'}</span>` : ''}
                ${imgCount > 1 ? `<span class="related-image-count"><i class="fas fa-images"></i> ${imgCount}</span>` : ''}
            </div>
            
            <div class="related-card-body">
                <div class="related-price">₦${price}</div>
                <div class="related-location"><i class="fas fa-map-marker-alt"></i> ${p.location || 'N/A'}</div>
                <div class="related-stats">
                    ${isLand ? '' : `<span class="card-stat"><i class="fas fa-bed"></i> ${p.beds || 0} Beds</span>`}
                    ${isLand ? '' : `<span class="card-stat"><i class="fas fa-bath"></i> ${p.baths || 0} Baths</span>`}
                    ${isLand && p.area ? `<span class="card-stat"><i class="fas fa-ruler-combined"></i> ${p.area}</span>` : ''}
                </div>
                <div class="related-date">
                    <i class="fas fa-calendar-alt"></i> Listed ${date} 
                    <span class="view-count"><i class="fas fa-eye"></i> ${p.view || 0} views</span>
                </div>
            </div>
            
            <div class="card-footer">
                <a href="/property?id=${p._id}" class="btn-view-details">
                    View Details <i class="fas fa-arrow-right"></i>
                </a>
                <button class="btn-share-card" onclick="shareCard('${p._id}')" aria-label="Share property">
                    <i class="fas fa-share-alt"></i>
                </button>
            </div>
        </div>
    `;
}

// ── Native Sharing Actions ───────────────────────────────────
window.shareCard = function(id) {
    if (!id) return;
    const url = `${window.location.origin}/property?id=${id}`;
    
    if (navigator.share) {
        navigator.share({ title: 'Check out this property on Easy Find', url })
            .catch((err) => {
                if(err.name !== 'AbortError') copyLink(url);
            });
    } else {
        copyLink(url);
    }
};

function copyLink(url) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url)
            .then(() => showNotification('Copied', 'Property link copied to clipboard'))
            .catch(() => fallbackCopy(url));
    } else {
        fallbackCopy(url);
    }
}

function fallbackCopy(url) {
    const el = document.createElement('textarea');
    el.value = url;
    el.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
    document.body.appendChild(el);
    el.select();
    try {
        document.execCommand('copy');
        showNotification('Copied', 'Property link copied to clipboard');
    } catch (err) {
        console.error('Fallback copy failed', err);
    }
    document.body.removeChild(el);
}

// Global UI notification layer check fallback
function showNotification(title, message) {
    if (typeof alertBox !== 'undefined' && alertBox.success) {
        alertBox.success(title, message);
    } else {
        alert(`${title}: ${message}`);
    }
}

// ── Skeleton Loader Element ──────────────────────────────────
function getSkeletonHTML() {
    return Array(4).fill(`
        <div class="skeleton-card temporary-skeleton">
            <div class="skeleton skeleton-img" style="height:200px; background:#e0e0e0; animation: pulse 1.5s infinite ease-in-out;"></div>
            <div class="skeleton-body" style="padding:15px;">
                <div class="skeleton skeleton-line" style="width:60%; height:15px; margin-bottom:10px; background:#e0e0e0; animation: pulse 1.5s infinite ease-in-out;"></div>
                <div class="skeleton skeleton-line" style="width:40%; height:12px; margin-bottom:10px; background:#e0e0e0; animation: pulse 1.5s infinite ease-in-out;"></div>
                <div class="skeleton skeleton-line" style="width:80%; height:12px; background:#e0e0e0; animation: pulse 1.5s infinite ease-in-out;"></div>
            </div>
        </div>
    `).join('');
}

// ── Data Layer Management ───────────────────────────────────
async function loadRelated(id, page = 1) {
    if (!id) return;
    
    const section = document.getElementById('relatedSection');
    const grid    = document.getElementById('relatedGrid');
    const moreBtn = document.getElementById('btnLoadMore'); // Changed target to target button element accurately

    if (!section || !grid) return;

    section.style.display = 'block';
    
    // Clean up or inject skeleton layout smoothly
    if (page === 1) {
        grid.innerHTML = getSkeletonHTML();
    } else {
        grid.insertAdjacentHTML('beforeend', getSkeletonHTML());
    }

    if (moreBtn) moreBtn.style.display = 'none';

    try {
        const res  = await fetch(`/api/property/related/${id}?page=${page}`);
        const data = await res.json();

        // Clear skeletons
        const skeletons = grid.querySelectorAll('.temporary-skeleton');
        skeletons.forEach(sk => sk.remove());

        if (page === 1 && (!data.success || !data.related || !data.related.length)) {
            grid.innerHTML = `<div class="empty-state-container" style="padding:40px; text-align:center; width:100%;">
                <i class="fas fa-home" style="font-size: 48px; color:#ccc; margin-bottom:15px;"></i>
                <p style="color:#666;">No matching related properties found.</p>
            </div>`;
            return;
        }

        if (data.success && data.related && data.related.length) {
            data.related.forEach(p => grid.insertAdjacentHTML('beforeend', relatedCard(p)));
            // force cards visible — scroll observer may not fire on mobile refresh
            grid.querySelectorAll('.section').forEach(el => el.classList.add('action'));
            if (moreBtn) {
                moreBtn.style.display = data.related.length === 8 ? 'flex' : 'none';
            }
        }
    } catch (err) {
        console.error('Related properties failed loading:', err);
        const skeletons = grid.querySelectorAll('.temporary-skeleton');
        skeletons.forEach(sk => sk.remove());
    }
}

// ── Global App Instantiators ──────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const moreBtn = document.getElementById('btnLoadMore');
    if (moreBtn) {
        moreBtn.addEventListener('click', () => {
            relatedPage++;
            loadRelated(currentPropId, relatedPage);
        });
    }
});

// ── Init ──────────────────────────────────────────────
loadProperty();
