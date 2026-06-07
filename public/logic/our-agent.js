document.addEventListener('DOMContentLoaded', () => {

    // ── Hamburger nav ─────────────────────────────────────
    const nav2      = document.getElementById('nav2');
    const hamburger = document.getElementById('hamburger');

    if (hamburger && nav2) {
        hamburger.addEventListener('click', (e) => {
            e.stopPropagation();
            nav2.classList.toggle('active');
            hamburger.classList.toggle('active');
        });
        window.addEventListener('click', (e) => {
            if (!hamburger.contains(e.target) && !nav2.contains(e.target)) {
                nav2.classList.remove('active');
                hamburger.classList.remove('active');
            }
        });
    }

    // ── Scroll animation ──────────────────────────────────
    const animObserver = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('action'); });
    }, { threshold: 0.1 });

    document.querySelectorAll('.section, .section2').forEach(el => animObserver.observe(el));

    // scroll animation 2

    const sections2 = document.querySelectorAll('.section2');

    window.addEventListener('scroll', () => {
        sections2.forEach(section => {
            const rect = section.getBoundingClientRect()
            if (rect.top < window.innerHeight - 100 && rect.bottom > 0) {
                section.classList.add('action2');
            } else {
                section.classList.remove('action2');
            }
        })

    });

    // ── Load verified agents ──────────────────────────────
    let agentPage       = 1;
    let agentLoading    = false;
    let agentTotalCount = 0;

    async function loadVerifiedAgents(page = 1) {
        if (agentLoading) return;
        agentLoading = true;

        const container   = document.getElementById('agents-container');
        const loadMoreBtn = document.getElementById('loadMoreAgentsBtn');
        if (!container) return;

        if (page === 1) {
            container.innerHTML = Array(4).fill(`
                <div class="agent-card skeleton-agent">
                    <div class="skeleton" style="width:100px;height:100px;border-radius:50%;margin:0 auto 12px;"></div>
                    <div class="skeleton skeleton-line" style="width:60%;margin:0 auto 8px;height:14px;"></div>
                    <div class="skeleton skeleton-line" style="width:40%;margin:0 auto;height:12px;"></div>
                </div>
            `).join('');
        }

        try {
            const res  = await fetch(`/api/agents/verified?page=${page}`);
            const data = await res.json();

            if (page === 1) container.innerHTML = '';

            if (data.success && data.agents.length > 0) {
                agentTotalCount = data.totalCount;

                // shuffle within batch
                for (let i = data.agents.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [data.agents[i], data.agents[j]] = [data.agents[j], data.agents[i]];
                }

                data.agents.forEach(agent => {
                    const card = document.createElement('div');
                    card.className = 'agent-card section';
                    card.innerHTML = `
                        ${agent.profilePicture
                            ? `<img src="${agent.profilePicture}" loading="lazy" alt="${agent.name}" onerror="this.style.display='none'">`
                            : `<i class="fa-solid fa-user-tie" style="font-size:3rem;color:#0d7068;margin-bottom:10px;"></i>`
                        }
                        <h3>${agent.name}</h3>
                        <p><i class="fa-solid fa-circle-check" style="color:#0d7068;"></i> ${agent.stand || 'Verified Agent'}</p>
                        <a href="/agent-profile?id=${agent.id}" class="agent-btn">View Profile</a>
                    `;
                    container.appendChild(card);
                    animObserver.observe(card); // animate newly added cards
                });

                if (loadMoreBtn) {
                    loadMoreBtn.style.display = (page * 8) < agentTotalCount ? 'block' : 'none';
                }
            } else if (page === 1) {
                container.innerHTML = '<p style="text-align:center;color:#666;padding:2rem;">No verified agents available at the moment.</p>';
            }
        } catch (err) {
            console.error('Error loading agents:', err);
            if (page === 1) {
                container.innerHTML = '<p style="text-align:center;color:#666;padding:2rem;">Network error. Please refresh.</p>';
            }
        } finally {
            agentLoading = false;
        }
    }

    loadVerifiedAgents(1);

    const loadMoreBtn = document.getElementById('loadMoreAgentsBtn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            agentPage++;
            loadVerifiedAgents(agentPage);
        });
    }

});
