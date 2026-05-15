// ── Lightbox ──────────────────────────────────────────
function openLightbox(src) {
    const lb = document.getElementById('lightbox');
    document.getElementById('lightboxImg').src = src;
    lb.classList.add('open');
}

function closeLightbox() {
    document.getElementById('lightbox').classList.remove('open');
}


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

// ── Init ──────────────────────────────────────────────
const agentId = new URLSearchParams(window.location.search).get('id');

if (!agentId) {
    showError('No agent ID provided.');
} else {
    loadProfile();
}

// ── Load profile + listings ───────────────────────────
async function loadProfile() {
    try {
        const [agentRes, postsRes] = await Promise.all([
            fetch(`/api/agent/public/${agentId}`),
            fetch(`/api/get/postForPublicAgentProfile/${agentId}`)
        ]);

        const agentData = await agentRes.json();
        const postsData = await postsRes.json();

        if (!agentData.success) { showError('Agent not found.'); return; }

        const agent = agentData.agent;
        const allPosts = postsData.success ? postsData.property : [];
        const agentPosts = allPosts;
        const totalViews = agentPosts.reduce((sum, p) => sum + (p.view || 0), 0);

        renderProfile(agent, agentPosts.length, totalViews);
        renderListings(agentPosts);
        triggerScrollAnim();

    } catch (e) {
        showError('Could not load agent profile.');
    }
}

// ── Render profile ────────────────────────────────────
function renderProfile(agent, listingCount, totalViews) {
    document.title = `${agent.name} – Easy Find`;

    const agentStand = agent.stand.toLowerCase() === 'verified agent'? `<i class="fa-solid fa-circle-check"></i> ${agent.stand}` : `${agent.stand}`;

    document.getElementById('agentName').textContent = agent.name || 'Agent';
    document.getElementById('agent-stand').innerHTML = agentStand;
    document.getElementById('statListings').textContent = listingCount;
    document.getElementById('statViews').textContent = totalViews.toLocaleString();

    if (agent.joinedAt) {
        document.getElementById('agentJoined').textContent =
            `Member since ${new Date(agent.joinedAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`;
    }

    if (agent.profilePicture) {
        document.getElementById('profileAvatar').innerHTML =
            `<img src="${agent.profilePicture}" alt="${agent.name}" 
                  style="cursor:zoom-in;" 
                  onclick="openLightbox('${agent.profilePicture}')">`;
    }

    if (agent.bio) {
        document.getElementById('agentBio').textContent = agent.bio;
        document.getElementById('bioSection').style.display = 'block';
    }

    // WhatsApp button
    if (agent.phone) {
        const whatsappBtn = document.getElementById('whatsappBtn');
        const phone = agent.phone.replace(/\D/g, ''); // Remove non-digits
        const formattedPhone = phone.startsWith('0') ? '234' + phone.slice(1) : phone;
        const message = encodeURIComponent(`Hi ${agent.name}, I found your profile on Easy Find and I'm interested in your properties.`);
        whatsappBtn.href = `https://wa.me/${formattedPhone}?text=${message}`;
        whatsappBtn.style.display = 'inline-flex';
    }
}

// ── Render listings ───────────────────────────────────
function renderListings(posts) {
    const grid  = document.getElementById('profileGrid');
    const empty = document.getElementById('profileEmpty');
    const count = document.getElementById('listingCount');

    count.textContent = posts.length;

    if (!posts.length) {
        grid.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    grid.innerHTML = posts.map(p => {
        const imgSrc   = p.imageNames && p.imageNames.length
            ? `/agent-loged/upload-property/${p.imageNames[0]}`
            : '/icon/home icon.png';
        const imgCount = p.imageNames ? p.imageNames.length : 0;
        const price = Number(p.price).toLocaleString();
        const date  = new Date(p.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const isLand = (p.type || '').toLowerCase() === 'land';

        return `
            <div class="listing-card" data-title="${p.title || ''}, ${p.type || 'Property'}" data-location="${p.location || 'N/A'}" data-price="${p.price}" data-room="${p.beds || 0} , ${p.baths || 0}">
                <div class="card-image">
                    <img src="${imgSrc}" alt="${p.type || 'Property'}" loading="lazy" onerror="this.src='/icon/home icon.png'">
                    <span class="card-type-badge">${p.type || 'Property'}${p.title ? ', ' + p.title : ''}</span>
                    ${p.category ? `<span class="card-category-badge ${p.category}">${p.category === 'shortlet' ? 'Short-let' : p.category === 'rent' ? 'For Rent' : 'For Sale'}</span>` : ''}
                    ${imgCount > 1 ? `<span class="card-image-count"><i class="fas fa-images"></i> ${imgCount}</span>` : ''}
                </div>
                <div class="card-body">
                    <div class="card-price">₦${price}</div>
                    <div class="card-location"><i class="fas fa-map-marker-alt"></i> ${p.location || 'N/A'}</div>
                    <div class="card-stats">
                        ${isLand ? '' : `<span class="card-stat"><i class="fas fa-bed"></i> ${p.beds || 0} Beds</span>`}
                        ${isLand ? '' : `<span class="card-stat"><i class="fas fa-bath"></i> ${p.baths || 0} Baths</span>`}
                        ${isLand ? `<span class="card-stat"><i class="fas fa-ruler-combined"></i> ${p.area || 0}</span>` : ''}
                    </div>
                    <div class="card-date"><i class="fas fa-calendar-alt"></i> Listed ${date} <i class="fas fa-eye"></i> views ${p.view || 0}</div>
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
    }).join('');
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

// ── Scroll animation ──────────────────────────────────
function triggerScrollAnim() {
    const sections = document.querySelectorAll('.section');
    const check = () => sections.forEach(s => {
        if (s.getBoundingClientRect().top < window.innerHeight - 60) s.classList.add('action');
    });
    window.addEventListener('scroll', check);
    check();
}

// ── Error ─────────────────────────────────────────────
function showError(msg) {
    document.querySelector('main').innerHTML = `
        <div style="text-align:center;padding:80px 20px;color:#555;">
            <i class="fa-solid fa-circle-exclamation" style="font-size:3rem;color:#0d7068;margin-bottom:16px;display:block;"></i>
            <p style="font-size:1.1rem;">${msg}</p>
            <a href="/" style="display:inline-block;margin-top:20px;padding:10px 24px;background:#0d7068;color:#fff;border-radius:10px;text-decoration:none;font-weight:700;">Go Home</a>
        </div>`;
}
