'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let currentSessionId  = null;   // local session id (timestamp)
let currentFredSid    = null;   // server-side Fred session id (UUID)
let chatHistory = JSON.parse(localStorage.getItem('easyfind_history')) || [];
let _pendingPostDraft = null;   // draft collected by Fred for property posting
let _agentAttachFiles = [];     // files staged by the agent via the attach button
const synth = window.speechSynthesis;

// ── Fred session helpers ───────────────────────────────────────────────────
function _newFredSid() {
    // Generate a UUID v4 without any external library
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

async function _clearFredSession(fredSid) {
    if (!fredSid) return;
    try {
        await fetch('/api/fred/session/clear', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ session_id: fredSid }),
        });
    } catch (_) { /* non-critical — server evicts idle sessions automatically */ }
}

// ══════════════════════════════════════════════════════════════════════════
// VISUALIZER ENGINE  (ported from voice2.html)
// ══════════════════════════════════════════════════════════════════════════
const VIZ = (() => {
    // --- shared settings ---
    const settings = {
        particleCount: 180,
        sensitivity:   1.5,
        style:         'orb',
        themeIndex:    0,
        contractStrength: 0.8
    };

    const colorThemes = [
        { name: "Cyan Indigo",  primary:[6,182,212],   secondary:[99,102,241],  accent:[236,72,153]  },
        { name: "Neon Emerald", primary:[16,185,129],  secondary:[59,130,246],  accent:[245,158,11]  },
        { name: "Cyber Gold",   primary:[245,158,11],  secondary:[239,68,68],   accent:[168,85,247]  },
        { name: "Vapor Wave",   primary:[236,72,153],  secondary:[139,92,246],  accent:[6,182,212]   },
    ];

    class DotParticle {
        constructor(index) { this.index = index; this.reset(); }
        reset() {
            this.angle       = Math.random() * Math.PI * 2;
            this.baseRadius  = 50 + Math.random() * 180;
            this.currentRadius = this.baseRadius;
            this.speed       = (Math.random() * 0.008 + 0.002) * (Math.random() > .5 ? 1 : -1);
            this.size        = Math.random() * 2.2 + 1.1;
            this.noiseX      = Math.random() * 1000;
            this.noiseY      = Math.random() * 1000;
            this.x = 0; this.y = 0;
        }
        update(audioLevel, freqValue, w, h) {
            this.angle  += this.speed * (1 + audioLevel * 1.5);
            this.noiseX += 0.005; this.noiseY += 0.005;
            const cx = w / 2, cy = h / 2;
            const contractionFactor = Math.sin(audioLevel * Math.PI) * settings.contractStrength;
            const targetRadius = Math.max(25, this.baseRadius * (1 - contractionFactor * 0.6) + (freqValue / 255) * 35);
            this.currentRadius += (targetRadius - this.currentRadius) * 0.1;
            const floatOffset = Math.sin(this.noiseX) * 12 * (1 - audioLevel * 0.5);
            this.x = cx + Math.cos(this.angle) * (this.currentRadius + floatOffset);
            this.y = cy + Math.sin(this.angle) * (this.currentRadius + floatOffset);
        }
        draw(ctx, audioLevel, freqValue) {
            const theme = colorThemes[settings.themeIndex];
            const ratio = freqValue / 255;
            const r = Math.round(theme.primary[0]*(1-ratio)+theme.accent[0]*ratio);
            const g = Math.round(theme.primary[1]*(1-ratio)+theme.accent[1]*ratio);
            const b = Math.round(theme.primary[2]*(1-ratio)+theme.accent[2]*ratio);
            const sz = this.size * (1 + ratio * 1.8);
            ctx.save();
            ctx.beginPath();
            ctx.arc(this.x, this.y, sz, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${r},${g},${b},${0.4+ratio*0.6})`;
            ctx.shadowColor = `rgba(${r},${g},${b},${Math.min(1, audioLevel*1.5)})`;
            ctx.shadowBlur  = 8 + Math.min(1, audioLevel*1.5) * 12;
            ctx.fill(); ctx.restore();
        }
    }

    // --- one instance per canvas ---
    function createInstance(canvasEl) {
        const ctx    = canvasEl.getContext('2d');
        const dpr    = Math.min(window.devicePixelRatio || 1, 2);
        let w = 0, h = 0;
        let particles = [];
        let audioData = new Uint8Array(64);
        let smoothLevel = 0;
        let appState = 'idle';    // 'idle' | 'simulated_speech' | 'listening'
        let rafId    = null;

        function resize() {
            w = canvasEl.parentElement?.offsetWidth  || window.innerWidth;
            h = canvasEl.parentElement?.offsetHeight || window.innerHeight;
            canvasEl.width  = w * dpr;
            canvasEl.height = h * dpr;
            ctx.scale(dpr, dpr);
            particles = Array.from({ length: settings.particleCount }, (_, i) => new DotParticle(i));
        }

        function updateAudio() {
            if (appState === 'simulated_speech') {
                const t = Date.now() * 0.005;
                const wave = Math.max(0, (Math.sin(t*2)*.4+.5) * (Math.cos(t*3.7)*.3+.3) + (Math.random()*.2-.1));
                const lvl  = wave * settings.sensitivity;
                smoothLevel += (lvl - smoothLevel) * 0.15;
                for (let i = 0; i < audioData.length; i++)
                    audioData[i] = Math.min(255, (Math.sin(t + i*.2)*128+127) * smoothLevel);
            } else {
                smoothLevel += (0.04 + Math.sin(Date.now()*.002)*.02 - smoothLevel) * 0.1;
                for (let i = 0; i < audioData.length; i++) audioData[i] = 8 + Math.random()*12;
            }
        }

        function frame() {
            updateAudio();
            ctx.fillStyle = 'rgba(3,7,18,0.28)';
            ctx.fillRect(0, 0, w, h);
            const cx = w/2, cy = h/2;
            const theme = colorThemes[settings.themeIndex];

            // connections
            const maxConn = 70 + smoothLevel * 40;
            ctx.lineWidth = 0.5;
            for (let i = 0; i < particles.length; i++) {
                for (let j = i+1; j < particles.length; j+=3) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const d  = Math.hypot(dx, dy);
                    if (d < maxConn) {
                        const a = (1-d/maxConn)*0.28*(0.3+smoothLevel);
                        ctx.strokeStyle = `rgba(${theme.secondary[0]},${theme.secondary[1]},${theme.secondary[2]},${a})`;
                        ctx.beginPath(); ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y); ctx.stroke();
                    }
                }
            }
            // core glow
            if (smoothLevel > 0.07) {
                const cr = Math.max(8, 35*smoothLevel);
                const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr*2.5);
                grad.addColorStop(0, `rgba(${theme.primary[0]},${theme.primary[1]},${theme.primary[2]},${smoothLevel*.38})`);
                grad.addColorStop(0.5, `rgba(${theme.secondary[0]},${theme.secondary[1]},${theme.secondary[2]},${smoothLevel*.14})`);
                grad.addColorStop(1, 'transparent');
                ctx.save(); ctx.fillStyle = grad;
                ctx.beginPath(); ctx.arc(cx, cy, cr*2.5, 0, Math.PI*2); ctx.fill(); ctx.restore();
            }
            // particles
            for (let i = 0; i < particles.length; i++) {
                const fv = audioData[i % audioData.length] || 0;
                particles[i].update(smoothLevel, fv, w, h);
                particles[i].draw(ctx, smoothLevel, fv);
            }
            rafId = requestAnimationFrame(frame);
        }

        function start(state) {
            appState = state;
            if (!rafId) { resize(); frame(); }
        }
        function stop()  { appState = 'idle'; }
        function destroy() { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }

        window.addEventListener('resize', () => { if (rafId) resize(); });

        return { start, stop, destroy };
    }

    // lazily initialised instances
    let micViz = null, aiViz = null;

    function getMicViz()  { if (!micViz) micViz = createInstance(document.getElementById('visualizerCanvas'));   return micViz; }
    function getAiViz()   { if (!aiViz)  aiViz  = createInstance(document.getElementById('aiVisualizerCanvas')); return aiViz; }

    return { getMicViz, getAiViz };
})();


// ── Google One-Tap / Login modal ───────────────────────────────────────────
let currentUser = null; // { name, email, profilePicture } once logged in

async function checkSession() {
    try {
        // Check agent session first — agents use their agent account on this page
        const agentRes  = await fetch('/api/fred/agent-session');
        const agentData = await agentRes.json();

        if (agentData.loggedIn && agentData.type === 'agent') {
            // Agent is logged in — use their agent identity, no Google sign-in needed
            currentUser = {
                name:           agentData.name,
                email:          agentData.email,
                profilePicture: agentData.profilePicture || null,
                isAgent:        true,
            };
            renderUserProfile();
            return;
        }

        // Fall back to regular user session check
        const res  = await fetch('/api/user/session');
        const data = await res.json();
        if (data.loggedIn) {
            const profileRes  = await fetch('/api/user/profile');
            const profileData = await profileRes.json();
            if (profileData.success !== false) {
                currentUser = profileData;
                renderUserProfile();
            }
        } else {
            showLoginPrompt();
            // Clear any history stored from a previous anonymous session
            chatHistory = [];
            localStorage.removeItem('easyfind_history');
            localStorage.removeItem('easyfind_active_session');
            // Show login modal automatically on first visit (not logged in)
            const hasVisited = localStorage.getItem('easyfind_ai_visited');
            if (!hasVisited) {
                localStorage.setItem('easyfind_ai_visited', '1');
                // Small delay so the page finishes rendering before the modal appears
                setTimeout(openLoginModal, 800);
            }
        }
    } catch (_) {
        showLoginPrompt();
    }
}

function renderUserProfile() {
    const profile = document.querySelector('.user-profile');
    if (!profile) return;
    if (currentUser?.profilePicture) {
        profile.innerHTML = `<img src="${currentUser.profilePicture}" alt="profile" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
        const initial = (currentUser?.name || 'U')[0].toUpperCase();
        profile.textContent = initial;
    }
    profile.style.cursor = 'pointer';
    // Agents go to their dashboard; users go to user profile
    profile.onclick = () => {
        window.location.href = currentUser?.isAgent ? '/agent-loged' : '/user-profile';
    };

    // Update sidebar name + show logout
    const nameEl   = document.getElementById('sidebarUserName');
    const logoutEl = document.getElementById('sidebarLogoutBtn');
    const label    = currentUser?.isAgent ? `${currentUser.name} (Agent)` : (currentUser?.name || 'User');
    if (nameEl)   nameEl.textContent = label;
    if (logoutEl) logoutEl.style.display = 'flex';

    // Show attach button only for agents
    const attachBtn = document.getElementById('agentAttachBtn');
    if (attachBtn) attachBtn.style.display = currentUser?.isAgent ? 'flex' : 'none';
}

function showLoginPrompt() {
    const profile = document.querySelector('.user-profile');
    if (profile) {
        profile.innerHTML = '<i class="fa-solid fa-user" style="font-size:15px;"></i>';
        profile.style.cursor = 'pointer';
        profile.title = 'Sign in';
        profile.onclick = openLoginModal;
    }
    const nameEl   = document.getElementById('sidebarUserName');
    const logoutEl = document.getElementById('sidebarLogoutBtn');
    if (nameEl)   nameEl.textContent = 'Login';
    if (logoutEl) logoutEl.style.display = 'none';
}

function openLoginModal() {
    document.getElementById('loginModal').style.display = 'flex';
}

function closeLoginModal() {
    document.getElementById('loginModal').style.display = 'none';
}

function handleModalBackdropClick(e) {
    if (e.target === document.getElementById('loginModal')) closeLoginModal();
}

// Called by Google Sign-In button via data-callback
async function handleGoogleLogin(response) {
    try {
        const res  = await fetch('/api/signup', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ googleToken: response.credential })
        });
        const data = await res.json();
        if (data.success) {
            currentUser = data.user;
            closeLoginModal();
            renderUserProfile();
        } else {
            alert(data.message || 'Sign-in failed. Please try again.');
        }
    } catch (_) {
        alert('Network error. Please try again.');
    }
}

async function logout() {
    if (currentUser?.isAgent) {
        await fetch('/api/agent/logout', { method: 'POST' });
    } else {
        await fetch('/api/logout', { method: 'POST' });
    }
    currentUser = null;
    showLoginPrompt();
}

// ── Sidebar ────────────────────────────────────────────────────────────────
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('active');
    overlay.style.display = sidebar.classList.contains('active') ? 'block' : 'none';
    if (sidebar.classList.contains('active')) renderHistory();
}

function renderHistory() {
    const list = document.getElementById('historyList');
    list.innerHTML = '';
    chatHistory.slice().reverse().forEach(session => {
        const item = document.createElement('div');
        item.className = 'history-item';
        // Use data-id attribute instead of inline onclick string to avoid
        // large timestamp numbers being misparsed in inline handlers
        item.innerHTML = `<span class="history-title" data-id="${session.id}">${session.title}</span><i class="fa-solid fa-trash-can delete-item-btn" data-id="${session.id}"></i>`;
        list.appendChild(item);
    });

    // Attach listeners cleanly after rendering
    list.querySelectorAll('.history-title').forEach(el => {
        el.addEventListener('click', () => loadSession(Number(el.dataset.id)));
    });
    list.querySelectorAll('.delete-item-btn').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSession(Number(el.dataset.id));
        });
    });
}

function startNewChat() {
    // Tell Fred to wipe the old server-side session before we abandon it
    _clearFredSession(currentFredSid);

    currentSessionId = null;
    currentFredSid   = _newFredSid();   // fresh server session for the new chat
    localStorage.removeItem('easyfind_active_session');
    document.getElementById('messagesWrapper').innerHTML = '';
    document.getElementById('heroContainer').style.display = 'flex';
    document.getElementById('chatContainer').style.display = 'none';
    // Close sidebar
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.remove('active');
    overlay.style.display = 'none';
}

function loadSession(id) {
    const session = chatHistory.find(s => s.id === id);
    if (!session) return;
    currentSessionId = id;
    currentFredSid   = session.fredSessionId || _newFredSid();
    // Ensure it's persisted in case it was missing
    if (!session.fredSessionId) {
        session.fredSessionId = currentFredSid;
        localStorage.setItem('easyfind_history', JSON.stringify(chatHistory));
    }
    // Persist the active session so it survives a page refresh
    localStorage.setItem('easyfind_active_session', String(id));
    document.getElementById('heroContainer').style.display = 'none';
    document.getElementById('chatContainer').style.display = 'flex';
    const wrapper = document.getElementById('messagesWrapper');
    wrapper.innerHTML = '';
    session.messages.forEach(msg => appendMessageUI(msg.role, msg.content));
    // Close sidebar after loading
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.remove('active');
    overlay.style.display = 'none';
    // Scroll to bottom
    const chatContainer = document.getElementById('chatContainer');
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function deleteSession(id) {
    chatHistory = chatHistory.filter(s => s.id !== id);
    localStorage.setItem('easyfind_history', JSON.stringify(chatHistory));
    if (currentSessionId === id) {
        localStorage.removeItem('easyfind_active_session');
        startNewChat();
        return; // startNewChat already re-renders
    }
    renderHistory();
}

function clearAllHistory() {
    if (confirm('Delete all history?')) {
        chatHistory = [];
        localStorage.removeItem('easyfind_history');
        startNewChat();
        renderHistory();
    }
}

function saveToLocalStorage(role, content) {
    // Don't persist history for unauthenticated users — history is only kept
    // in the in-memory chatHistory array for the current page session.
    // Once they sign in, subsequent messages will be saved normally.
    if (!currentUser) return;

    if (!currentSessionId) {
        currentSessionId = Date.now();
        // If no Fred session was assigned yet (e.g. page just loaded), create one now
        if (!currentFredSid) currentFredSid = _newFredSid();
        chatHistory.push({
            id:            currentSessionId,
            fredSessionId: currentFredSid,
            title:         content.substring(0, 30) + '...',
            messages:      [],
        });
        localStorage.setItem('easyfind_active_session', String(currentSessionId));
    }
    const session = chatHistory.find(s => s.id === currentSessionId);
    if (!session) return;
    session.messages.push({ role, content });
    localStorage.setItem('easyfind_history', JSON.stringify(chatHistory));
}

// ── Typing animation ───────────────────────────────────────────────────────
const typingText   = document.getElementById('typing-text');
const searchQueries = ['Searching for 3 bedroom flat...', 'Find a lodge under 150k...', 'Looking for duplexes...'];
let qIdx = 0, cIdx = 0, isDel = false;

function typeEffect() {
    const q = searchQueries[qIdx];
    typingText.textContent = isDel ? q.substring(0, cIdx--) : q.substring(0, cIdx++);
    let speed = isDel ? 50 : 100;
    if (!isDel && cIdx > q.length)  { isDel = true;  speed = 2000; }
    else if (isDel && cIdx < 0)     { isDel = false; qIdx = (qIdx + 1) % searchQueries.length; speed = 500; }
    setTimeout(typeEffect, speed);
}

window.onload = () => {
    // Initialise a Fred session id for the page load (may be replaced by loadSession)
    currentFredSid = _newFredSid();

    typeEffect();
    checkSession();

    // Restore the last active chat session after a page refresh
    const savedSessionId = localStorage.getItem('easyfind_active_session');
    if (savedSessionId) {
        const id = Number(savedSessionId);
        const session = chatHistory.find(s => s.id === id);
        if (session) {
            setTimeout(() => loadSession(id), 100);
        } else {
            localStorage.removeItem('easyfind_active_session');
        }
    }

    // ── Check for a pending Fred reply after refresh/disconnect ──────────
    const pendingSid = localStorage.getItem('easyfind_pending_sid');
    if (pendingSid) {
        localStorage.removeItem('easyfind_pending_sid');
        fetch(`/api/fred/pending?session_id=${encodeURIComponent(pendingSid)}`)
            .then(r => r.json())
            .then(data => {
                if (data.found && data.reply) {
                    // Ensure chat is visible
                    if (heroContainer) heroContainer.style.display = 'none';
                    if (chatContainer) chatContainer.style.display = 'flex';
                    appendMessageUI('bot', data.reply);
                    saveToLocalStorage('bot', data.reply);
                }
            })
            .catch(() => {});
    }
};

// ── Voice conversation state ───────────────────────────────────────────────
let isListening      = false;
let voiceModeActive  = false;   // true while the continuous voice loop is running
let pendingTranscript = '';

// ── Status phrases ─────────────────────────────────────────────────────────
// Maps the emoji-prefixed labels Fred sends to:
//   text  — clean text shown in the pill (no emoji)
//   voice — what Fred says aloud in voice mode (conversational fillers)
const _VOICE_STATUS = {
    '🧠 Reading your message…':                                { text: 'Reading your message…',             voice: 'Hmm, let me understand that…'                    },
    '🔍 Figuring out what you need…':                          { text: 'Figuring out what you need…',       voice: 'Hmm, let me think about that…'                   },
    '🏠 Searching EasyFind listings…':                         { text: 'Searching EasyFind listings…',      voice: 'Let me search for that…'                         },
    '🌐 Nothing found locally — searching the web…':           { text: 'Searching the web for properties…', voice: 'Hmm, nothing in my database — let me check online…' },
    '⏳ Still searching, just a moment…':                      { text: 'Still searching, just a moment…',   voice: 'Hmm, still looking — wait a moment…'             },
    '📖 Looking up EasyFind information…':                     { text: 'Looking up EasyFind info…',         voice: 'Let me check that for you…'                      },
    '🌐 Checking the web for more info…':                      { text: 'Checking the web…',                 voice: 'Let me look that up online…'                     },
    '🌐 Looking that up online…':                              { text: 'Looking that up online…',           voice: 'Let me search online real quick…'                },
    '💭 Thinking…':                                            { text: 'Thinking…',                         voice: 'Hmm, give me a second…'                          },
    '✅ Checking answer quality…':                             { text: 'Checking the answer…',              voice: null },
    '🔄 Improving answer…':                                    { text: 'Refining the answer…',              voice: null },
    '👥 Looking up EasyFind agents…':                          { text: 'Looking up agents…',                voice: 'Let me check our agents for you…' },
    '📝 Collecting property details…':                         { text: 'Collecting property details…',       voice: 'Let me help you list that property…' },
};

// Tracks the last voice filler spoken so we never repeat the same one twice in a row
let _lastVoiceFiller = '';

function _speakStatusFiller(rawStatus) {
    if (!voiceModeActive || !synth) return;
    const entry = _VOICE_STATUS[rawStatus];
    if (!entry || !entry.voice) return;
    // Don't repeat the same filler back-to-back
    if (entry.voice === _lastVoiceFiller) return;
    _lastVoiceFiller = entry.voice;

    synth.cancel();   // cut off any prior speech
    const u = new SpeechSynthesisUtterance(entry.voice);
    u.rate = 1.05;
    synth.speak(u);
}

// ── Status pill text lookup ────────────────────────────────────────────────
// Maps the exact strings Fred sends (from Python _STATUS) to clean display text.
// Falls back to stripping leading emoji if not found.
const _STATUS_TEXT = {
    '🧠 Reading your message…':                            'Reading your message…',
    '🔍 Figuring out what you need…':                      'Figuring out what you need…',
    '🏠 Searching EasyFind listings…':                     'Searching EasyFind listings…',
    '🌐 Nothing found locally — searching the web…':       'Searching the web for properties…',
    '⏳ Still searching, just a moment…':                  'Still searching, just a moment…',
    '📖 Looking up EasyFind information…':                 'Looking up EasyFind info…',
    '🌐 Checking the web for more info…':                  'Checking the web…',
    '🌐 Looking that up online…':                          'Looking that up online…',
    '💭 Thinking…':                                        'Thinking…',
    '✅ Checking answer quality…':                         'Checking the answer…',
    '🔄 Improving answer…':                                'Refining the answer…',
    '👥 Looking up EasyFind agents…':                      'Looking up agents…',
    '📝 Collecting property details…':                     'Collecting property details…',
};

function _statusPillText(rawStatus) {
    return _STATUS_TEXT[rawStatus] || rawStatus.replace(/^[\p{Emoji}\s]+/u, '').trim() || rawStatus;
}

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;

// ── helpers to update the unified overlay UI ───────────────────────────────
function _setVoiceStatus(label, dotColor, micActive) {
    document.getElementById('vizStatusText').textContent = label;
    document.getElementById('vizStatusDot').style.background = dotColor;
    document.getElementById('interimText').textContent = label === 'Fred is speaking...'
        ? (pendingTranscript || '...')
        : label;

    const ring = document.getElementById('voiceMicRing');
    if (ring) ring.classList.toggle('speaking', !micActive);
}

// ── Build the recognition object ───────────────────────────────────────────
function _buildRecognition() {
    if (!SpeechRecognition) return;
    recognition = new SpeechRecognition();
    recognition.continuous      = false;   // one utterance per cycle
    recognition.interimResults  = true;

    recognition.onstart = () => {
        isListening = true;
        _setVoiceStatus('Listening...', '#10b981', true);
        VIZ.getMicViz().start('idle');
    };

    recognition.onresult = (e) => {
        let interim = '', final = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) final  += e.results[i][0].transcript;
            else                      interim += e.results[i][0].transcript;
        }
        document.getElementById('interimText').textContent = final || interim || 'Listening...';
        if (final) pendingTranscript = final.trim();
    };

    recognition.onend = () => {
        isListening = false;
        if (!voiceModeActive) return;   // user already cancelled

        if (pendingTranscript) {
            const text = pendingTranscript;
            pendingTranscript = '';
            _voiceHandleUserTurn(text);
        } else {
            // nothing heard → listen again
            _startListeningCycle();
        }
    };

    recognition.onerror = (e) => {
        isListening = false;
        if (!voiceModeActive) return;
        // ignore no-speech; anything else → retry
        setTimeout(_startListeningCycle, 600);
    };
}

// ── Start one listen cycle ─────────────────────────────────────────────────
function _startListeningCycle() {
    if (!voiceModeActive) return;
    pendingTranscript = '';
    try {
        recognition.start();
    } catch (_) {
        // recognition may still be running from a prior cycle; abort & retry
        recognition.abort();
        setTimeout(_startListeningCycle, 300);
    }
}

// ── Handle what the user said, get AI reply, speak it, then loop ───────────
async function _voiceHandleUserTurn(text) {
    if (!voiceModeActive) return;

    // Show the user turn in chat
    if (heroContainer.style.display !== 'none') {
        heroContainer.style.display = 'none';
        chatContainer.style.display = 'flex';
    }
    appendMessageUI('user', text);
    saveToLocalStorage('user', text);

    // Initial overlay state
    _setVoiceStatus('Thinking...', '#f59e0b', false);
    document.getElementById('interimText').textContent = 'Hmm, let me think about that…';
    // Speak the very first filler immediately so there's no dead silence
    if (synth) {
        synth.cancel();
        const opener = new SpeechSynthesisUtterance('Hmm, let me check that for you.');
        opener.rate = 1.05;
        synth.speak(opener);
    }

    try {
        const abortCtrl = new AbortController();
        const res = await fetch('/api/fred/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_message: text,
                chat_history: _buildChatHistory(),
                session_id:   currentFredSid || undefined,
                is_agent:     !!(currentUser?.isAgent),
            }),
            signal: abortCtrl.signal,
        });

        if (!voiceModeActive) { abortCtrl.abort(); return; }

        // ── Read the SSE stream to collect status events + final reply ────
        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer    = '';
        let fullReply = '';

        outer: while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!voiceModeActive) { reader.cancel(); return; }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                const jsonStr = trimmed.slice(5).trim();
                if (jsonStr === '[DONE]') break outer;
                try {
                    const chunk = JSON.parse(jsonStr);

                    if (chunk.status) {
                        // Update overlay label and speak the voice filler
                        const pillText = _statusPillText(chunk.status);
                        _setVoiceStatus(pillText, '#f59e0b', false);
                        document.getElementById('interimText').textContent = pillText;
                        _speakStatusFiller(chunk.status);   // speaks "Hmm, still looking…" etc.

                    } else if (chunk.token) {
                        fullReply += chunk.token;

                    } else if (chunk.reply) {
                        fullReply = chunk.reply;

                    } else if (chunk.done) {
                        break outer;

                    } else if (chunk.error) {
                        break outer;
                    }
                } catch (_) { /* partial chunk */ }
            }
        }

        if (!voiceModeActive) return;

        if (fullReply) {
            appendMessageUI('bot', fullReply);
            saveToLocalStorage('bot', fullReply);
            _voiceSpeakReply(fullReply);
        } else {
            appendMessageUI('bot', '⚠️ Fred didn\'t send a reply. Please try again.');
            _startListeningCycle();
        }

    } catch (err) {
        if (!voiceModeActive) return;
        console.error('[AI.js voice] Fred fetch error:', err);
        appendMessageUI('bot', '⚠️ Could not reach Fred. Check the AI engine and try again.');
        _startListeningCycle();
    }
}

// ── Speak the AI reply, then loop back to listening ───────────────────────
function _voiceSpeakReply(text) {
    if (!voiceModeActive) return;
    if (!synth) { _startListeningCycle(); return; }

    _setVoiceStatus('Fred is speaking...', '#06b6d4', false);
    document.getElementById('interimText').textContent = text;

    VIZ.getMicViz().start('simulated_speech');

    const utterance      = new SpeechSynthesisUtterance(text);
    utterance.rate       = 1;
    utterance.onend      = () => {
        if (!voiceModeActive) return;
        VIZ.getMicViz().stop();
        // slight pause before listening again
        setTimeout(_startListeningCycle, 400);
    };
    utterance.onerror    = () => {
        if (!voiceModeActive) return;
        VIZ.getMicViz().stop();
        setTimeout(_startListeningCycle, 400);
    };
    synth.speak(utterance);
}

// ── Public: start the full voice conversation ─────────────────────────────
function startVoiceMode() {
    if (!SpeechRecognition) return alert('Voice input is not supported in this browser.');
    if (voiceModeActive)    return;

    voiceModeActive = true;
    pendingTranscript = '';

    // Show the unified voice overlay, hide text input
    document.getElementById('voiceOverlay').style.display     = 'flex';
    document.getElementById('mainInputContainer').style.display = 'none';

    _buildRecognition();
    _startListeningCycle();
}

// ── Public: cancel voice mode, return to text UI ──────────────────────────
function cancelVoiceMode() {
    voiceModeActive  = false;
    isListening      = false;
    _lastVoiceFiller = '';   // reset so fillers play fresh next session

    // Stop recognition & speech
    try { recognition && recognition.abort(); } catch (_) {}
    synth && synth.cancel();

    VIZ.getMicViz().stop();

    // Hide overlays, restore text input
    document.getElementById('voiceOverlay').style.display      = 'none';
    document.getElementById('aiSpeakingOverlay').style.display = 'none';
    document.getElementById('mainInputContainer').style.display = 'flex';
    document.getElementById('stopAiBtn').style.display          = 'none';
}

// ── Kept for backward compat (mic button onclick) ─────────────────────────
function toggleVoiceRecognition() {
    if (voiceModeActive) cancelVoiceMode();
    else                 startVoiceMode();
}

// ── AI voice reply (text-chat path — plays then returns to text UI) ────────
function speakAiText(text) {
    // Only called when NOT in voice mode (normal text chat)
    if (voiceModeActive) return;
    if (!synth) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate  = 1;
    utterance.onstart = () => {
        document.getElementById('aiSpeakingOverlay').style.display = 'flex';
        document.getElementById('aiSpeakingText').textContent      = text;
        document.getElementById('mainInputContainer').style.display = 'none';
        document.getElementById('stopAiBtn').style.display          = 'flex';
        document.getElementById('aiVizStatusText').textContent      = 'Fred is speaking...';
        VIZ.getAiViz().start('simulated_speech');
    };
    utterance.onend = stopAiVoice;
    synth.speak(utterance);
}

function stopAiVoice() {
    synth && synth.cancel();
    document.getElementById('aiSpeakingOverlay').style.display  = 'none';
    document.getElementById('mainInputContainer').style.display  = 'flex';
    document.getElementById('stopAiBtn').style.display           = 'none';
    VIZ.getAiViz().stop();
}

// ── Chat UI ────────────────────────────────────────────────────────────────
const heroContainer    = document.getElementById('heroContainer');
const chatContainer    = document.getElementById('chatContainer');
const messagesWrapper  = document.getElementById('messagesWrapper');
const userInput        = document.getElementById('userInput');
const micBtn           = document.getElementById('micBtn');
const sendBtn          = document.getElementById('sendBtn');

function toggleButtons() {
    const hasText = userInput.value.trim().length > 0;
    micBtn.style.display  = hasText ? 'none' : 'flex';
    sendBtn.style.display = hasText ? 'flex'  : 'none';
}

function appendMessageUI(role, text) {
    const row = document.createElement('div');
    row.className = `chat-row ${role}`;
    const formattedText = role === 'bot' ? _formatBotReply(text) : text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    let html = `<div class="message-content">${formattedText}</div><div class="message-actions"><i class="fa-regular fa-copy action-icon-small" title="Copy" onclick="copyToClipboard(this)"></i>`;
    if (role === 'bot') html += `<i class="fa-solid fa-share-nodes action-icon-small" onclick="shareResponse(this)"></i><i class="fa-solid fa-rotate-right action-icon-small" onclick="retryLastResponse(this)"></i>`;
    html += '</div>';
    row.innerHTML = html;
    messagesWrapper.appendChild(row);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function copyToClipboard(icon) {
    // Get the raw stored text (not innerHTML) to avoid copying button labels
    const row = icon.closest('.chat-row');
    const session = chatHistory.find(s => s.id === currentSessionId);
    let text = '';
    if (session) {
        // Find which message index this row corresponds to
        const allBotRows = [...messagesWrapper.querySelectorAll('.chat-row.bot')];
        const rowIndex   = allBotRows.indexOf(row);
        const botMessages = session.messages.filter(m => m.role === 'bot');
        if (rowIndex >= 0 && botMessages[rowIndex]) {
            text = botMessages[rowIndex].content;
        }
    }
    if (!text) text = row.querySelector('.message-content').textContent;
    navigator.clipboard.writeText(text).then(() => {
        const orig = icon.className;
        icon.className = 'fa-solid fa-check action-icon-small';
        setTimeout(() => icon.className = orig, 2000);
    });
}

function shareResponse(icon) {
    const text = icon.closest('.chat-row').querySelector('.message-content').textContent;
    if (navigator.share) navigator.share({ text });
}

function retryLastResponse(icon) {
    const botRow = icon.closest('.chat-row');
    const session = chatHistory.find(s => s.id === currentSessionId);
    const userMessages = session.messages.filter(m => m.role === 'user');
    const lastUserText = userMessages[userMessages.length - 1].content;
    botRow.remove();
    showThinkingAndReply(lastUserText);
}

function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;
    if (_streamReader || _streamAbort) return;
    if (heroContainer.style.display !== 'none') {
        heroContainer.style.display = 'none';
        chatContainer.style.display = 'flex';
    }
    appendMessageUI('user', text);
    saveToLocalStorage('user', text);
    userInput.value = '';
    // Reset textarea height back to single line
    userInput.style.height = 'auto';
    userInput.style.overflowY = 'hidden';
    toggleButtons();
    showThinkingAndReply(text);
}

// ── Build chat_history array from the current session for Fred ─────────────
// NOTE: When currentFredSid is set (normal flow), Fred manages history
// server-side and this array is NOT sent. It's kept only as a fallback
// for environments where the session store is unavailable.
function _buildChatHistory() {
    if (currentFredSid) return [];   // server handles it — don't send redundant history
    if (!currentSessionId) return [];
    const session = chatHistory.find(s => s.id === currentSessionId);
    if (!session) return [];
    // Send last 6 messages (3 turns) so Fred has context without overloading
    return session.messages.slice(-6).map(m => ({ role: m.role === 'bot' ? 'assistant' : m.role, content: m.content }));
}

// ── Streaming state ────────────────────────────────────────────────────────
let _streamReader   = null;   // active ReadableStream reader
let _streamAbort    = null;   // AbortController for the fetch

function _setStreaming(on) {
    const inputBox   = document.getElementById('inputBox');
    const stopWrapper = document.getElementById('stopStreamWrapper');
    const input      = document.getElementById('userInput');
    if (on) {
        inputBox.classList.add('disabled');
        input.setAttribute('disabled', true);
        stopWrapper.style.display = 'flex';
    } else {
        inputBox.classList.remove('disabled');
        input.removeAttribute('disabled');
        stopWrapper.style.display = 'none';
        _streamReader = null;
        _streamAbort  = null;
    }
}

function stopStreaming() {
    try { _streamReader?.cancel(); } catch (_) {}
    try { _streamAbort?.abort();   } catch (_) {}
    _setStreaming(false);
}

// ── Pre-connect waiting messages ──────────────────────────────────────────
// ── Updates the pill label ────────────────────────────────────────────────
function _setPillLabel(pill, text) {
    const label = pill.querySelector('.pill-label');
    if (!label) return;
    label.textContent = text;
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function showThinkingAndReply(prompt) {
    // Lock input while Fred responds
    _setStreaming(true);
    _streamAbort = new AbortController();

    // ── Bot row: pill sits above, bubble below ────────────────────────────────
    const row    = document.createElement('div');
    row.className = 'chat-row bot';

    // Status pill — starts with "Thinking…", updates to Fred's live statuses once connected
    const pill   = document.createElement('div');
    pill.className = 'fred-status-pill';
    pill.innerHTML = `<span class="pill-spinner"></span><span class="pill-label">Thinking…</span>`;

    const bubble = document.createElement('div');
    bubble.className = 'message-content';
    bubble.style.display = 'none';   // hidden until first token arrives

    row.appendChild(pill);
    row.appendChild(bubble);
    messagesWrapper.appendChild(row);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // ── Pre-connect flag ──────────────────────────────────────────────────────
    // Pill stays "Thinking…" until fetch() resolves, then live SSE statuses take over.
    let _fredConnected = false;

    // Save session id so we can poll for reply if user refreshes mid-stream
    if (currentFredSid) {
        localStorage.setItem('easyfind_pending_sid', currentFredSid);
    }

    try {
        const res = await fetch('/api/fred/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_message: prompt,
                chat_history: _buildChatHistory(),
                session_id:   currentFredSid || undefined,
                is_agent:     !!(currentUser?.isAgent),
            }),
            signal: _streamAbort.signal,
        });

        // Fred is connected — live SSE statuses take over from here
        _fredConnected = true;

        _streamReader    = res.body.getReader();
        const decoder    = new TextDecoder();
        let fullReply    = '';
        let buffer       = '';
        let stopped      = false;
        let hasTokens    = false;

        outer: while (true) {
            let readResult;
            try {
                readResult = await _streamReader.read();
            } catch (_) {
                stopped = true; break;
            }
            const { done, value } = readResult;
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data:')) continue;
                const jsonStr = trimmed.slice(5).trim();
                if (jsonStr === '[DONE]') break outer;
                try {
                    const chunk = JSON.parse(jsonStr);

                    if (chunk.status) {
                        // ── Live status from Fred: update pill while bubble is hidden
                        if (!hasTokens) {
                            _setPillLabel(pill, _statusPillText(chunk.status));
                        }

                    } else if (chunk.correction) {
                        // ── Understanding-layer correction note
                        // Show it as a small italic note inside the pill before tokens start
                        if (!hasTokens) {
                            _setPillLabel(pill, `✏️ ${chunk.correction}`);
                        }

                    } else if (chunk.token) {
                        // ── First token: hide pill, reveal bubble, start streaming
                        if (!hasTokens) {
                            pill.style.display    = 'none';
                            bubble.style.display  = '';
                            hasTokens = true;
                            localStorage.removeItem('easyfind_pending_sid'); // stream working — no need to poll
                        }
                        fullReply += chunk.token;
                        bubble.innerHTML = _formatBotReply(fullReply);
                        chatContainer.scrollTop = chatContainer.scrollHeight;

                    } else if (chunk.done) {
                        break outer;

                    } else if (chunk.post_form) {
                        // Fred collected all property details — show confirmation card
                        _pendingPostDraft = chunk.post_form;
                        if (!hasTokens) {
                            pill.style.display   = 'none';
                            bubble.style.display = '';
                            hasTokens = true;
                        }
                        fullReply += '\n\n' + _renderPostConfirmCard(chunk.post_form);
                        bubble.innerHTML = _formatBotReply(fullReply);
                        chatContainer.scrollTop = chatContainer.scrollHeight;

                    } else if (chunk.reply) {
                        if (!hasTokens) {
                            pill.style.display   = 'none';
                            bubble.style.display = '';
                            hasTokens = true;
                        }
                        fullReply = chunk.reply;
                        bubble.innerHTML = _formatBotReply(fullReply);

                    } else if (chunk.error) {
                        pill.style.display   = 'none';
                        bubble.style.display = '';
                        bubble.textContent = `⚠️ ${chunk.error}`;
                        stopped = true; break outer;
                    }
                } catch (_) { /* incomplete chunk — skip */ }
            }
        }

        // ── Add action buttons after streaming completes ──────────────────────
        if (fullReply && !stopped) {
            localStorage.removeItem('easyfind_pending_sid'); // reply received — no need to poll
            const actions = document.createElement('div');
            actions.className = 'message-actions';
            actions.innerHTML = `
                <i class="fa-regular fa-copy action-icon-small" title="Copy" onclick="copyToClipboard(this)"></i>
                <i class="fa-solid fa-share-nodes action-icon-small" onclick="shareResponse(this)"></i>
                <i class="fa-solid fa-rotate-right action-icon-small" onclick="retryLastResponse(this)"></i>`;
            row.appendChild(actions);
            saveToLocalStorage('bot', fullReply);
        } else if (fullReply && stopped) {
            bubble.innerHTML = _formatBotReply(fullReply) + ' ●';
            const actions = document.createElement('div');
            actions.className = 'message-actions';
            actions.innerHTML = `<i class="fa-regular fa-copy action-icon-small" title="Copy" onclick="copyToClipboard(this)"></i>`;
            row.appendChild(actions);
            saveToLocalStorage('bot', fullReply);
        } else if (!fullReply) {
            // Nothing came through — remove the row entirely
            row.remove();
        }

    } catch (err) {
        row.remove();
        if (err.name !== 'AbortError') {
            appendMessageUI('bot', '⚠️ Could not reach Fred. Please ensure the AI engine is running and try again.');
            console.error('[AI.js] Fred fetch error:', err);
        }
    } finally {
        _setStreaming(false);
    }
}

function handleKeyPress(e) {
    // Enter sends, Shift+Enter inserts a newline
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

// Auto-grow textarea like ChatGPT
function autoGrow(el) {
    el.style.overflowY = 'hidden';
    el.style.height    = 'auto';
    el.style.height    = Math.min(el.scrollHeight, 160) + 'px';
    if (el.scrollHeight > 160) el.style.overflowY = 'auto';
}

// ── Format Fred's reply — converts raw URLs into clickable buttons ─────────
function _formatBotReply(text) {
    // If text contains a post confirmation card, split it out and render raw HTML
    const cardStart = text.indexOf('__POST_CONFIRM_CARD__');
    const cardEnd   = text.indexOf('__END_CARD__');
    if (cardStart !== -1 && cardEnd !== -1) {
        const before  = text.slice(0, cardStart);
        const cardHtml = text.slice(cardStart + '__POST_CONFIRM_CARD__'.length, cardEnd);
        const after   = text.slice(cardEnd + '__END_CARD__'.length);
        return _escapeAndLink(before) + cardHtml + _escapeAndLink(after);
    }
    return _escapeAndLink(text);
}

function _escapeAndLink(text) {
    // First escape HTML
    const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Convert markdown bold **text** to <strong>
    let formatted = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Convert markdown bullets * item or - item to list items
    formatted = formatted.replace(/^[\*\-] (.+)$/gm, '• $1');

    // Convert full URLs https://... to buttons
    formatted = formatted.replace(
        /https?:\/\/[^\s<>"&]+/g,
        url => `<a href="${url}" target="_blank" rel="noopener noreferrer" class="fred-link-btn"><i class="fa-solid fa-arrow-up-right-from-square"></i> ${url.replace(/^https?:\/\//, '')}</a>`
    );

    // Convert bare easyfind.com.ng/... links (without https://) to buttons
    formatted = formatted.replace(
        /(?<![/"'>])easyfind\.com\.ng(\/[^\s<>"&]*)?/g,
        (match) => `<a href="https://${match}" target="_blank" rel="noopener noreferrer" class="fred-link-btn"><i class="fa-solid fa-arrow-up-right-from-square"></i> ${match}</a>`
    );

    // Convert newlines to <br>
    formatted = formatted.replace(/\n/g, '<br>');

    return formatted;
}

// ── Property posting confirmation card ────────────────────────────────────
function _renderPostConfirmCard(draft) {
    const price = draft.price ? `₦${Number(draft.price).toLocaleString('en-NG')}` : 'Not set';
    const isLand = draft.type === 'land';
    const bedsBaths = isLand ? '' : `
      <div class="fpc-row"><span>Bedrooms</span><span>${draft.beds ?? 0}</span></div>
      <div class="fpc-row"><span>Bathrooms</span><span>${draft.baths ?? 0}</span></div>`;

    return `\n\n__POST_CONFIRM_CARD__<div class="fred-post-card">
  <div class="fpc-header"><i class="fa-solid fa-house-circle-check"></i> Ready to post</div>
  <div class="fpc-details">
    <div class="fpc-row"><span>Title</span><span>${draft.title || '—'}</span></div>
    <div class="fpc-row"><span>Type</span><span>${draft.type || '—'}</span></div>
    <div class="fpc-row"><span>Category</span><span>${draft.category || '—'}</span></div>
    <div class="fpc-row"><span>Price</span><span>${price}</span></div>
    <div class="fpc-row"><span>Location</span><span>${draft.location || '—'}</span></div>
    ${bedsBaths}
    <div class="fpc-row desc-row"><span>Description</span><span>${(draft.description || 'None').slice(0, 100)}${(draft.description || '').length > 100 ? '…' : ''}</span></div>
  </div>
  <div class="fpc-upload-area" id="fredUploadArea">
    <label class="fpc-upload-label" for="fredFileInput">
      <i class="fa-solid fa-images"></i>
      <span>Drop photos &amp; video here, or <u>click to browse</u></span>
      <small>At least 1 photo required · max 19 photos + 1 video</small>
    </label>
    <input type="file" id="fredFileInput" accept="image/*,video/mp4,video/mov,video/webm,video/avi" multiple style="display:none" onchange="fredOnFilePick(this)">
    <div class="fpc-previews" id="fredPreviews"></div>
  </div>
  <div class="fred-post-actions">
    <button class="fred-post-btn confirm" id="fredPostBtn" onclick="submitPostFromFred()" ${_agentAttachFiles.length > 0 ? '' : 'disabled'}>
      <i class="fa-solid fa-paper-plane"></i> Post property ${_agentAttachFiles.length > 0 ? `(${_agentAttachFiles.length} file${_agentAttachFiles.length > 1 ? 's' : ''} ready)` : ''}
    </button>
    <button class="fred-post-btn cancel" onclick="cancelPostFromFred()">
      <i class="fa-solid fa-xmark"></i> Cancel
    </button>
  </div>
  <p class="fpc-note"><i class="fa-solid fa-location-dot"></i> Location pin defaults to Enugu centre — update it from your dashboard after posting.</p>
</div>__END_CARD__`;
}

// ── File picker handler (inside the confirmation card) ─────────────────────
function fredOnFilePick(input) {
    const previews = document.getElementById('fredPreviews');
    const btn      = document.getElementById('fredPostBtn');
    if (!previews) return;
    previews.innerHTML = '';
    const files = Array.from(input.files);
    // Sync with the global attach state so submitPostFromFred picks them up
    _agentAttachFiles = files;
    files.forEach(f => {
        const div = document.createElement('div');
        div.className = 'fpc-thumb';
        if (f.type.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(f);
            div.appendChild(img);
        } else {
            div.innerHTML = `<i class="fa-solid fa-film"></i><span>${f.name.slice(0,16)}</span>`;
        }
        previews.appendChild(div);
    });
    if (btn) btn.disabled = files.length === 0;
}

// ── Agent attach button — standalone file picker in input bar ─────────────
function onAgentFilePick(input) {
    _agentAttachFiles = Array.from(input.files);
    const strip  = document.getElementById('agentAttachStrip');
    const thumbs = document.getElementById('agentAttachThumbs');
    if (!strip || !thumbs) return;

    if (_agentAttachFiles.length === 0) {
        strip.style.display = 'none';
        return;
    }

    thumbs.innerHTML = '';
    _agentAttachFiles.forEach(f => {
        const div = document.createElement('div');
        div.className = 'aas-thumb';
        if (f.type.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(f);
            div.appendChild(img);
        } else {
            div.innerHTML = `<i class="fa-solid fa-film"></i><span>${f.name.slice(0, 10)}</span>`;
        }
        thumbs.appendChild(div);
    });

    strip.style.display = 'flex';

    // Update attach button to show count badge
    const btn = document.getElementById('agentAttachBtn');
    if (btn) btn.title = `${_agentAttachFiles.length} file${_agentAttachFiles.length > 1 ? 's' : ''} attached`;
}

function clearAgentAttach() {
    _agentAttachFiles = [];
    const input  = document.getElementById('agentFileInput');
    const strip  = document.getElementById('agentAttachStrip');
    const btn    = document.getElementById('agentAttachBtn');
    if (input) input.value = '';
    if (strip) strip.style.display = 'none';
    if (btn)   btn.title = 'Attach photos / video';
}

async function submitPostFromFred() {
    if (!_pendingPostDraft) return;
    const draft = _pendingPostDraft;

    // Prefer files already attached via the input bar; fall back to the card picker
    const cardInput = document.getElementById('fredFileInput');
    const cardFiles = cardInput ? Array.from(cardInput.files) : [];
    const files = _agentAttachFiles.length > 0 ? _agentAttachFiles : cardFiles;

    const btn = document.getElementById('fredPostBtn');

    if (files.length === 0) return;

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Posting…'; }

    try {
        const fd = new FormData();
        fd.append('title',       draft.title       || '');
        fd.append('type',        draft.type        || '');
        fd.append('category',    draft.category    || '');
        fd.append('price',       String(draft.price || 0));
        fd.append('location',    draft.location    || '');
        fd.append('beds',        String(draft.beds  ?? 0));
        fd.append('baths',       String(draft.baths ?? 0));
        fd.append('description', draft.description || '');

        const imageExts = ['.jpg','.jpeg','.png','.gif','.webp'];
        files.forEach(f => {
            const ext = f.name.split('.').pop().toLowerCase();
            if (imageExts.includes('.' + ext)) {
                fd.append('images', f);
            } else {
                fd.append('video', f);
            }
        });

        const res  = await fetch('/api/fred/post-property', { method: 'POST', body: fd });
        const data = await res.json();

        _pendingPostDraft = null;
        clearAgentAttach();   // clean up the input bar too

        if (data.success) {
            const msg = `✅ Your property is now live!\n\n${data.postUrl}\n\nTip: visit your dashboard to update the map pin and add more details.`;
            appendMessageUI('bot', msg);
            saveToLocalStorage('bot', msg);
        } else {
            appendMessageUI('bot', `⚠️ Could not post: ${data.message}`);
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Post property'; }
        }
    } catch (_) {
        appendMessageUI('bot', '⚠️ Network error — please check your connection and try again.');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Post property'; }
    }
}

function cancelPostFromFred() {
    _pendingPostDraft = null;
    appendMessageUI('bot', 'No problem, the listing has been cancelled. Let me know if you need anything else.');
    saveToLocalStorage('bot', 'Property posting cancelled.');
}
