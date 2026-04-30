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
            fetch('/api/post/property')
        ]);

        const agentData = await agentRes.json();
        const postsData = await postsRes.json();

        if (!agentData.success) { showError('Agent not found.'); return; }

        const agent = agentData.agent;
        const allPosts = postsData.success ? postsData.property : [];
        const agentPosts = allPosts.filter(p => p.agentId === agentId);
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

    document.getElementById('agentName').textContent = agent.name || 'Agent';
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
        const imgSrc = p.imageNames && p.imageNames.length
            ? `/agent-loged/upload-property/${p.imageNames[0]}`
            : '/icon/home icon.png';
        const price = Number(p.price).toLocaleString();
        const cat   = p.category || '';
        const catLabel = cat === 'shortlet' ? 'Short-let' : cat === 'rent' ? 'For Rent' : 'For Sale';

        return `
            <div class="prop-card">
                <div class="prop-card-img">
                    <img src="${imgSrc}" alt="${p.type || 'Property'}" loading="lazy"
                         onerror="this.src='/icon/home icon.png'">
                    ${cat ? `<span class="badge-cat ${cat}">${catLabel}</span>` : ''}
                </div>
                <div class="prop-card-body">
                    <div class="prop-card-price">₦${price}</div>
                    <div class="prop-card-location">
                        <i class="fa-solid fa-location-dot"></i> ${p.location || 'N/A'}
                    </div>
                    <div class="prop-card-stats">
                        ${p.beds  ? `<span><i class="fa-solid fa-bed"></i> ${p.beds} Beds</span>` : ''}
                        ${p.baths ? `<span><i class="fa-solid fa-bath"></i> ${p.baths} Baths</span>` : ''}
                        ${p.area  ? `<span><i class="fa-solid fa-ruler-combined"></i> ${p.area} sqft</span>` : ''}
                    </div>
                </div>
                <div class="prop-card-footer">
                    <a href="/property?id=${p.id}" class="btn-view">
                        View Details <i class="fa-solid fa-arrow-right"></i>
                    </a>
                </div>
            </div>
        `;
    }).join('');
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
