<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Properties — Easy Find</title>
    <meta name="description" content="Browse verified homes, lands and commercial properties across Enugu State on Easy Find.">
    <link rel="icon" type="image/x-icon" href="/logo/logo.JPEG">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
    <link rel="stylesheet" href="style.css">
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-NK9XVCBPJM"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-NK9XVCBPJM');</script>
    <style>
        /* ── Properties page — uses new version tokens ───── */
        :root {
            --primary:#0d7068;--primary-dark:#055361;--primary-light:#e6f7f5;
            --bg:#f8fafc;--white:#fff;--text:#111827;--muted:#6b7280;
            --border:#e5e7eb;--shadow-sm:0 1px 3px rgba(17,24,39,.06);
            --shadow-md:0 10px 24px rgba(17,24,39,.08);--shadow-lg:0 24px 60px rgba(17,24,39,.14);
            --radius:14px;--radius-lg:20px;--container:1280px;--nav-h:70px;
            font-family:'Poppins',Arial,sans-serif;
        }
        *{box-sizing:border-box;margin:0;padding:0}
        html,body{scroll-behavior:smooth;background:var(--bg);color:var(--text);-webkit-font-smoothing:antialiased}
        img{max-width:100%;display:block}
        a{color:inherit;text-decoration:none}
        button{font-family:inherit;cursor:pointer;border:0;background:none}

        /* ── Sticky Nav ─────────────────────────────────── */
        .prop-nav {
            position:sticky;top:0;z-index:50;height:var(--nav-h);
            background:rgba(255,255,255,.95);backdrop-filter:blur(10px);
            border-bottom:1px solid var(--border);
        }
        .prop-nav-inner {
            max-width:var(--container);margin:0 auto;padding:0 24px;
            height:100%;display:flex;align-items:center;justify-content:space-between;gap:16px;
        }
        .brand{display:inline-flex;align-items:center;gap:10px;font-weight:700;font-size:17px}
        .brand-mark{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;
            background:linear-gradient(135deg,var(--primary),var(--primary-dark));
            color:#fff;font-weight:700;box-shadow:0 6px 14px rgba(13,112,104,.3)}
        .nav-back{display:inline-flex;align-items:center;gap:8px;padding:9px 16px;
            border-radius:10px;font-size:14px;font-weight:500;color:var(--muted);
            border:1px solid var(--border);background:#fff;transition:.2s}
        .nav-back:hover{background:var(--primary-light);color:var(--primary-dark);border-color:var(--primary-light)}

        /* ── Page hero ──────────────────────────────────── */
        .prop-hero {
            background:linear-gradient(135deg,var(--primary-dark) 0%,#037979 100%);
            padding:56px 24px 80px;color:#fff;text-align:center;position:relative;overflow:hidden;
        }
        .prop-hero::before {
            content:'';position:absolute;inset:0;
            background:url('https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=2000&q=60') center/cover;
            opacity:.18;
            z-index: 0;
            pointer-events: none;
        }
        .prop-hero-inner{position:relative;z-index:1;max-width:700px;margin:0 auto}
        .prop-hero h1{font-size:clamp(28px,5vw,48px);font-weight:700;letter-spacing:-.02em;margin-bottom:12px}
        .prop-hero p{font-size:16px;opacity:.85;margin-bottom:28px}

        /* ── Search & Filter bar ─────────────────────────── */
        .filter-wrap {
            max-width:var(--container);margin:-36px auto 0;padding:0 24px;position:relative;z-index:10;
        }
        .filter-card {
            background:#fff;border-radius:var(--radius-lg);padding:18px 22px;
            box-shadow:var(--shadow-lg);border:1px solid #eef2f7;
            display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;
        }
        .filter-field{display:flex;flex-direction:column;gap:5px;flex:1;min-width:130px}
        .filter-field label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:var(--muted)}
        .filter-field select,.filter-field input {
            height:44px;border:1px solid var(--border);border-radius:10px;padding:0 12px;
            font-size:14px;background:#fff;color:var(--text);transition:.15s;font-family:inherit;
        }
        .filter-field select:focus,.filter-field input:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-light)}
        .filter-search-wrap{flex:2;min-width:200px;position:relative}
        .filter-search-wrap i{position:absolute;left:13px;top:50%;transform:translateY(-50%);color:var(--muted)}
        .filter-search-wrap input{width:100%;padding-left:38px}
        .btn-filter{height:44px;padding:0 22px;border-radius:10px;background:var(--primary);
            color:#fff;font-weight:600;font-size:14px;display:inline-flex;align-items:center;gap:8px;
            transition:.2s;white-space:nowrap}
        .btn-filter:hover{background:var(--primary-dark);transform:translateY(-1px)}
        .btn-reset{height:44px;padding:0 16px;border-radius:10px;border:1px solid var(--border);
            color:var(--muted);font-size:14px;transition:.2s}
        .btn-reset:hover{border-color:var(--primary);color:var(--primary-dark);background:var(--primary-light)}

        /* ── AI understood pills ─────────────────────────── */
        #ai-understood-row {
            max-width:var(--container);margin:16px auto 0;padding:0 24px;
            display:none;flex-wrap:wrap;gap:8px;align-items:center;
        }
        .ai-pill {
            background:var(--primary-light);color:var(--primary-dark);border-radius:999px;
            padding:5px 12px;font-size:12px;font-weight:600;
        }
        .ai-clear {
            margin-left:auto;padding:5px 14px;border-radius:999px;border:1px solid var(--border);
            background:#fff;font-size:12px;color:var(--muted);cursor:pointer;transition:.2s;
        }
        .ai-clear:hover{border-color:var(--primary);color:var(--primary-dark)}

        /* ── Grid ────────────────────────────────────────── */
        .prop-section{max-width:var(--container);margin:32px auto 0;padding:0 24px 80px}
        .prop-toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:22px;flex-wrap:wrap;gap:12px}
        .prop-count{font-size:14px;color:var(--muted)}
        .prop-count strong{color:var(--text)}
        .prop-grid {
            display:grid;grid-template-columns:repeat(4,1fr);gap:24px;
        }
        @media(max-width:1200px){.prop-grid{grid-template-columns:repeat(3,1fr)}}
        @media(max-width:900px){.prop-grid{grid-template-columns:repeat(2,1fr)}}
        @media(max-width:560px){.prop-grid{grid-template-columns:1fr}}

        /* ── Property Card ───────────────────────────────── */
        .p-card {
            background:#fff;border-radius:var(--radius-lg);overflow:hidden;
            border:1px solid #eef2f7;transition:transform .25s,box-shadow .25s;
        }
        .p-card:hover{transform:translateY(-4px);box-shadow:var(--shadow-lg)}
        .p-card-media{position:relative;aspect-ratio:4/3;overflow:hidden;background:#e8fffe}
        .p-card-media img{width:100%;height:100%;object-fit:cover;transition:transform .6s}
        .p-card:hover .p-card-media img{transform:scale(1.06)}
        .p-badge{position:absolute;top:12px;left:12px;background:rgba(13,112,104,.88);color:#fff;
            padding:5px 11px;border-radius:999px;font-size:11.5px;font-weight:600;backdrop-filter:blur(4px)}
        .p-cat{position:absolute;top:12px;right:12px;padding:5px 11px;border-radius:999px;font-size:11.5px;font-weight:700}
        .p-cat.sale{background:rgba(13,112,104,.85);color:#fff}
        .p-cat.rent{background:rgba(234,179,8,.9);color:#fff}
        .p-cat.shortlet{background:rgba(99,102,241,.85);color:#fff}
        .p-verified{position:absolute;bottom:10px;right:12px;color:#fff;font-size:1.4rem;animation:p-bounce 1.5s infinite}
        @keyframes p-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        .p-card-body{padding:16px}
        .p-price{font-size:1.2rem;font-weight:700;color:var(--primary);margin-bottom:3px}
        .p-location{font-size:13px;color:var(--muted);display:flex;align-items:center;gap:5px;margin-bottom:11px}
        .p-stats{display:flex;gap:14px;padding:11px 0;border-top:1px solid #f0f0f0;border-bottom:1px solid #f0f0f0;margin-bottom:11px}
        .p-stat{display:flex;align-items:center;gap:5px;font-size:12.5px;color:#555}
        .p-stat i{color:#66eae3}
        .p-date{font-size:11.5px;color:#aaa;display:flex;align-items:center;gap:5px;margin-bottom:12px}
        .p-card-foot{display:flex;align-items:center;gap:8px;padding-top:4px}
        .p-view-btn{flex:1;display:flex;align-items:center;justify-content:center;gap:7px;
            padding:10px;background:linear-gradient(135deg,#66eae3,var(--primary));
            color:#fff;border-radius:10px;font-size:13.5px;font-weight:600;transition:.3s}
        .p-view-btn:hover{background:linear-gradient(135deg,var(--primary),var(--primary-dark));transform:translateY(-2px)}
        .p-share-btn{width:36px;height:36px;border-radius:8px;border:1.5px solid #66eae3;
            background:#e6f7f5;color:var(--primary);display:flex;align-items:center;justify-content:center;
            font-size:13px;transition:.2s}
        .p-share-btn:hover{background:var(--primary);color:#fff;border-color:var(--primary)}

        /* ── Skeleton loader ─────────────────────────────── */
        .p-skeleton{background:#fff;border-radius:var(--radius-lg);overflow:hidden;border:1px solid #eef2f7}
        .skel{background:linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%);
            background-size:200% 100%;animation:shimmer 1.4s infinite;border-radius:8px}
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        .skel-img{height:200px;border-radius:0}
        .skel-body{padding:16px;display:flex;flex-direction:column;gap:10px}
        .skel-line{height:13px}

        /* ── Sentinel & end ──────────────────────────────── */
        #prop-sentinel{height:50px;display:flex;align-items:center;justify-content:center;
            color:var(--muted);font-size:13px;margin-top:10px}
        #prop-end{text-align:center;padding:32px 0;color:var(--muted);font-size:14px;display:none}
        #prop-empty{text-align:center;padding:60px 20px;color:var(--muted);display:none;grid-column:1/-1}
        #prop-empty i{font-size:3.5rem;color:#66eae3;display:block;margin-bottom:14px}

        /* ── Footer strip ─────────────────────────────────── */
        .prop-footer{background:#fff;border-top:1px solid var(--border);padding:20px 24px;
            text-align:center;font-size:13px;color:var(--muted);margin-top:40px}
        .prop-footer a{color:var(--primary);font-weight:600}

        /* ── Real-time toast (reuse from main style) ──────── */
        #realtime-toast-container{position:fixed;top:80px;right:20px;z-index:9999;
            display:flex;flex-direction:column;gap:10px;pointer-events:none;max-width:340px;width:90%}

        @media(max-width:680px){
            .filter-card{flex-direction:column}
            .filter-field,.filter-search-wrap{width:100%;flex:unset}
        }
        /* ── Taken Property Visual Badges ── */
        .p-taken-badge {
            position: absolute;
            bottom: 12px;
            left: 12px;
            background: linear-gradient(135deg, #e53e3e 0%, #9b2c2c 100%);
            color: white;
            padding: 5px 14px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            box-shadow: 0 4px 10px rgba(229, 62, 62, 0.4);
            z-index: 5;
            animation: p-pulseBadgeTaken 2.5s infinite;
        }
        @keyframes p-pulseBadgeTaken {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }
    </style>
    <!-- OneSignal Web Push -->
    <script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" defer></script>
    <script src="/onesignal-init.js" defer></script>
</head>
<body>

<!-- ── Nav ─────────────────────────────────────────────── -->
<nav class="prop-nav">
    <div class="prop-nav-inner">
        <a href="/" class="brand">
            <span class="brand-mark">E</span>Easy Find
        </a>
        <a href="/" class="nav-back"><i class="fa-solid fa-arrow-left"></i> Back to Home</a>
    </div>
</nav>

<!-- ── Hero ─────────────────────────────────────────────── -->
<section class="prop-hero">
    <div class="prop-hero-inner">
        <h1>Explore Properties</h1>
        <p>Verified listings across Enugu State — houses, land, shops and more</p>
    </div>
    <div class="search-inner">
        <div class="search-field-wrap">
            <div class="search-field">
                <div class="ai-search-companion">
                    <div class="agent-shadow"></div>
                    <div class="agent-body"></div>
                    <div class="agent-head">
                        <div class="agent-visor">
                            <div class="agent-eye"></div>
                            <div class="agent-eye"></div>
                        </div>
                    </div>
                    <div class="agent-arm-left"></div>
                    <div class="agent-arm-right-container">
                        <div class="agent-arm-right"></div>
                        <div class="agent-hand-grip">
                            <div class="agent-magnifying-glass"></div>
                        </div>
                    </div>
                </div>
                <input type="text" id="aiSearch" placeholder="e.g. 2 bedroom flat in GRA under 2 million...">
                <button class="search-mic" id="searchMic" title="Hold to speak" aria-label="Voice search">
                    <i class="fa-solid fa-microphone" id="micIcon"></i>
                </button>
                <button class="search-clear" id="searchClear" style="display:none;" onclick="resetSearch()">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div id="search-agent-list" style="display:none"></div>
        </div>

        <!-- Quick filter pills row -->
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:16px;align-items:center;justify-content:center">
            <select id="filterType" style="height:38px;border:1px solid rgba(255,255,255,.4);border-radius:999px;padding:0 16px;font-size:13px;background:rgba(255,255,255,.15);color:#fff;outline:none;cursor:pointer;backdrop-filter:blur(6px)">
                <option value="" style="color:#000">All types</option>
                <option value="house" style="color:#000">House</option>
                <option value="apartment" style="color:#000">Apartment / Flat</option>
                <option value="land" style="color:#000">Land</option>
                <option value="commercial" style="color:#000">Commercial</option>
                <option value="villa" style="color:#000">Villa</option>
            </select>
            <select id="filterCat" style="height:38px;border:1px solid rgba(255,255,255,.4);border-radius:999px;padding:0 16px;font-size:13px;background:rgba(255,255,255,.15);color:#fff;outline:none;cursor:pointer;backdrop-filter:blur(6px)">
                <option value="" style="color:#000">All categories</option>
                <option value="sale" style="color:#000">For Sale</option>
                <option value="rent" style="color:#000">For Rent</option>
                <option value="shortlet" style="color:#000">Short-let</option>
            </select>
            <input type="text" id="filterPrice" placeholder="Max price e.g. 5,000,000"
                style="height:38px;border:1px solid rgba(255,255,255,.4);border-radius:999px;padding:0 16px;font-size:13px;background:rgb(255, 255, 255);color:#000000;outline:none;width:210px;backdrop-filter:blur(6px)"
                oninput="this.value=this.value.replace(/[^0-9]/g,'')&&(this.value=Number(this.value.replace(/,/g,'')).toLocaleString('en-NG'))">
            <a href="#propertyPage" id="doSearch" style="height:38px;padding: 10px 22px;border-radius:999px;background:#0d7068;color:#fff;font-size:13px;font-weight:600;border:none;cursor:pointer;box-shadow:0 4px 14px rgba(13,112,104,.4);z-index: 1;">
                <i class="fa-solid fa-magnifying-glass"></i> Search
            </a>
            <button id="resetSearch" style="height:38px;padding:0 16px;border-radius:999px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.1);color:#fff;font-size:13px;cursor:pointer">
                <i class="fa-solid fa-arrows-rotate"></i> Refresh
            </button>
        </div>
    </div>
</section>

<!-- ── AI understood pills ─────────────────────────────── -->
<div id="ai-understood-row"></div>

<!-- ── Properties grid ──────────────────────────────────── -->
<section class="prop-section" id="propertyPage">
    <div class="prop-grid" id="propGrid">
        <!-- Skeleton placeholders shown on first load -->
        <div class="p-skeleton"><div class="skel skel-img"></div><div class="skel-body"><div class="skel skel-line" style="width:55%"></div><div class="skel skel-line" style="width:40%"></div><div class="skel skel-line" style="width:70%"></div></div></div>
        <div class="p-skeleton"><div class="skel skel-img"></div><div class="skel-body"><div class="skel skel-line" style="width:65%"></div><div class="skel skel-line" style="width:35%"></div><div class="skel skel-line" style="width:80%"></div></div></div>
        <div class="p-skeleton"><div class="skel skel-img"></div><div class="skel-body"><div class="skel skel-line" style="width:50%"></div><div class="skel skel-line" style="width:45%"></div><div class="skel skel-line" style="width:60%"></div></div></div>
        <div class="p-skeleton"><div class="skel skel-img"></div><div class="skel-body"><div class="skel skel-line" style="width:60%"></div><div class="skel skel-line" style="width:38%"></div><div class="skel skel-line" style="width:75%"></div></div></div>
    </div>

    <div id="prop-empty">
        <i class="fa-solid fa-house-circle-xmark"></i>
        <p style="font-size:16px;margin-bottom:8px">No properties found</p>
        <p>Try adjusting your search or clear the filters.</p>
        <button class="btn-reset" onclick="resetSearch()" style="margin-top:16px;padding:10px 20px;border-radius:10px;border:1px solid var(--border)">Clear filters</button>
    </div>

    <div id="prop-sentinel"><i class="fa-solid fa-spinner fa-spin" style="margin-right:8px"></i> Loading more...</div>
    <div id="prop-end">✓ You've seen all available properties</div>
</section>

<!-- ── Real-time new listing toasts ────────────────────── -->
<div id="realtime-toast-container"></div>

<!-- ── Footer ───────────────────────────────────────────── -->
<div class="prop-footer">
    <p>&copy; 2026 <a href="/">Easy Find</a> — Verified property listings in Enugu State. <a href="/terms">Terms</a></p>
</div>

<script src="logic/alert-box.js"></script>
<script>
'use strict';

// ── Config ────────────────────────────────────────────────
const BATCH   = 8;
const MAX_DOM = 64;

// ── State ─────────────────────────────────────────────────
let allPosts   = [];
let cursor     = 0;
let isLoading  = false;
let searchMode = false;
let currentPage = 1;
let hasMorePages = true;
const PAGE_SIZE  = 16; // fetch 16 per page from API

const grid     = document.getElementById('propGrid');
const sentinel = document.getElementById('prop-sentinel');
const propEnd  = document.getElementById('prop-end');
const propEmpty= document.getElementById('prop-empty');

// ── Helpers ───────────────────────────────────────────────
function fmt(n) { return '₦' + Number(n).toLocaleString('en-NG'); }

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function skeletonHTML() {
    return `<div class="p-skeleton"><div class="skel skel-img"></div><div class="skel-body">
        <div class="skel skel-line" style="width:55%"></div>
        <div class="skel skel-line" style="width:40%"></div>
        <div class="skel skel-line" style="width:70%"></div></div></div>`;
}

function cardHTML(p) {
    const img  = p.imageNames?.length ? `/agent-loged/upload-property/${p.imageNames[0]}` : '/image/IMG_7296.JPG';
    const price= fmt(p.price);
    const date = new Date(p.date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
    const isLand = (p.type||'').toLowerCase()==='land';
    const isVer  = (p.stand||'').toLowerCase().includes('verified agent');
    const cat    = p.category||'';
    const catLabel = cat==='shortlet'?'Short-let':cat==='rent'?'For Rent':'For Sale';
    const isClosed = p.isClosed === true; // <-- Check deal closed status

    return `<article class="p-card" style="${isClosed ? 'opacity: 0.92;' : ''}">
        <div class="p-card-media">
            <img src="${img}" alt="${p.title||'Property'}" loading="lazy" style="${isClosed ? 'filter: grayscale(80%) opacity(0.65);' : ''}">
            <span class="p-badge">${p.type||'Property'}${p.title?', '+p.title:''}</span>
            ${cat?`<span class="p-cat ${cat}">${catLabel}</span>`:''}
            ${isVer?`<span class="p-verified"><i class="fa-solid fa-circle-check"></i></span>`:''}
            ${isClosed?`<span class="p-taken-badge">Property Taken</span>`:''}
        </div>
        <div class="p-card-body">
            <div class="p-price" style="${isClosed ? 'color: #718096; text-decoration: line-through;' : ''}">${price}</div>
            <div class="p-location"><i class="fas fa-map-marker-alt"></i> ${p.location||'N/A'}</div>
            <div class="p-stats">
                ${isLand?`<span class="p-stat"><i class="fas fa-ruler-combined"></i>${p.area||'—'}</span>`:`
                <span class="p-stat"><i class="fas fa-bed"></i>${p.beds||0} Beds</span>
                <span class="p-stat"><i class="fas fa-bath"></i>${p.baths||0} Baths</span>`}
            </div>
            <div class="p-date"><i class="fas fa-calendar-alt"></i> ${date} &nbsp;<i class="fas fa-eye"></i> ${p.view||0}</div>
            <div class="p-card-foot">
                <a href="/property?id=${p._id}" class="p-view-btn">View Details <i class="fas fa-arrow-right"></i></a>
                <button class="p-share-btn" onclick="shareProperty('${p._id}')"><i class="fas fa-share-alt"></i></button>
            </div>
        </div>
    </article>`;
}

// ── Share ─────────────────────────────────────────────────
window.shareProperty = function(id) {
    const url = `${location.origin}/property?id=${id}`;
    if (navigator.share) {
        navigator.share({title:'Check out this property on Easy Find',url}).catch(()=>copyText(url));
    } else { copyText(url); }
};
function copyText(url) {
    navigator.clipboard?.writeText(url).then(()=>flashMsg('Link copied ✓')).catch(()=>{});
}
function flashMsg(msg) {
    const t = document.createElement('div');
    t.style.cssText='background:#0d7068;color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;pointer-events:none';
    t.textContent = msg;
    document.getElementById('realtime-toast-container').appendChild(t);
    setTimeout(()=>t.remove(), 2500);
}

// ── Fetch properties page by page ─────────────────────────
async function fetchProperties(resetPool) {
    if (resetPool === undefined) resetPool = true;
    if (resetPool) {
        allPosts     = [];
        cursor       = 0;
        currentPage  = 1;
        hasMorePages = true;
        grid.innerHTML = Array(4).fill(skeletonHTML()).join('');
        propEmpty.style.display = 'none';
        propEnd.style.display   = 'none';
        sentinel.style.display  = 'flex';
    }
    if (!hasMorePages) return;
    try {
        const res  = await fetch('/api/post/property?page=' + currentPage + '&limit=' + PAGE_SIZE);
        const data = await res.json();
        if (resetPool) grid.innerHTML = '';
        if (data.success && data.property.length) {
            allPosts     = allPosts.concat(data.property);
            hasMorePages = data.hasMore;
            currentPage++;
            renderBatch();
        } else if (allPosts.length === 0) {
            propEmpty.style.display = 'block';
            sentinel.style.display  = 'none';
        }
        if (!hasMorePages) {
            sentinel.style.display = 'none';
            if (allPosts.length > 0) propEnd.style.display = 'block';
        }
    } catch (err) {
        console.error(err);
        if (allPosts.length === 0) {
            grid.innerHTML = '<p style="text-align:center;padding:40px;color:#aaa;grid-column:1/-1">Network error. Please refresh.</p>';
        }
        sentinel.style.display = 'none';
    }
}

// ── Infinite scroll render ────────────────────────────────
function renderBatch() {
    // If we've rendered everything we have but more pages exist, fetch next page
    if (!isLoading && cursor >= allPosts.length && hasMorePages && !searchMode) {
        fetchProperties(false);
        return;
    }
    if (isLoading || cursor >= allPosts.length) return;
    isLoading = true;

    // Insert skeletons
    const skels = [];
    for (let i = 0; i < BATCH; i++) {
        const s = document.createElement('div');
        s.className = 'p-skeleton scroll-skel';
        s.innerHTML = `<div class="skel skel-img"></div><div class="skel-body">
            <div class="skel skel-line" style="width:55%"></div>
            <div class="skel skel-line" style="width:40%"></div>
            <div class="skel skel-line" style="width:70%"></div></div>`;
        grid.appendChild(s);
        skels.push(s);
    }

    setTimeout(() => {
        requestAnimationFrame(() => {
            const scrollY = window.scrollY;
            skels.forEach(s => s.remove());

            const frag = document.createDocumentFragment();
            const end  = Math.min(cursor + BATCH, allPosts.length);
            for (let i = cursor; i < end; i++) {
                const tmp = document.createElement('div');
                tmp.innerHTML = cardHTML(allPosts[i]);
                frag.appendChild(tmp.firstElementChild);
            }
            grid.appendChild(frag);
            cursor = end;

            // Prune excess cards
            const cards = grid.querySelectorAll('.p-card');
            if (cards.length > MAX_DOM) {
                const excess = cards.length - MAX_DOM;
                let removedH = 0;
                for (let i = 0; i < excess; i++) {
                    removedH += cards[i].offsetHeight;
                    cards[i].remove();
                }
                window.scrollTo({top: scrollY - removedH, behavior:'instant'});
            }
            
            isLoading = false;

            if (cursor >= allPosts.length) {
                if (!hasMorePages) {
                    sentinel.style.display = 'none';
                    propEnd.style.display  = 'block';
                } else {
                    sentinel.style.display = 'flex';
                    propEnd.style.display  = 'none';
                }
            }
        });
    }, 350);
}

// ── IntersectionObserver sentinel ─────────────────────────
const scrollObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !isLoading && !searchMode) {
        renderBatch();
    }
}, { rootMargin: '0px 0px 300px 0px' });
scrollObserver.observe(sentinel);

// ── AI Property Search ─────────────────────────────────────
async function doAISearch(q) {
    if (!q.trim()) { resetSearch(); return; }
    searchMode = true;
    sentinel.style.display = 'none';
    propEnd.style.display  = 'none';
    propEmpty.style.display= 'none';
    grid.innerHTML = Array(4).fill(skeletonHTML()).join('');

    try {
        const res  = await fetch(`/api/search/property?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        grid.innerHTML = '';

        if (!data.success || !data.properties?.length) {
            propEmpty.style.display = 'block';
            document.getElementById('ai-understood-row').style.display = 'none';
            return;
        }

        const aiRow = document.getElementById('ai-understood-row');
        if (data.parsed) {
            const pills = buildPills(data.parsed);
            if (pills) {
                aiRow.innerHTML = `<span style="font-size:13px;color:#555"><i class="fa-solid fa-robot"></i>: </span>${pills}
                    <button class="ai-clear" onclick="resetSearch()">✕ Clear</button>`;
                aiRow.style.display = 'flex';
            }
        }

        data.properties.forEach(p => grid.insertAdjacentHTML('beforeend', cardHTML(p)));

    } catch (err) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px;color:#aaa">Search error. Please try again.</div>';
    }
}

function buildPills(parsed) {
    const pills = [];
    const p = (icon, label) => `<span class="ai-pill">${icon} ${label}</span>`;
    if (parsed.type) pills.push(p('<i class="fa-solid fa-house"></i>', parsed.type));
    if (parsed.category) pills.push(p('<i class="fa-solid fa-tag"></i>', parsed.category==='shortlet'?'Short-let':parsed.category==='rent'?'For Rent':'For Sale'));
    if (parsed.minBeds!==null && parsed.maxBeds!==null && parsed.minBeds===parsed.maxBeds)
        pills.push(p('<i class="fa-solid fa-bed"></i>', `${parsed.minBeds} bed${parsed.minBeds!==1?'s':''}`));
    if (parsed.maxPrice) pills.push(p('<i class="fa-solid fa-sack-dollar"></i>', `under ₦${Number(parsed.maxPrice).toLocaleString()}`));
    if (parsed.minPrice) pills.push(p('<i class="fa-solid fa-sack-dollar"></i>', `above ₦${Number(parsed.minPrice).toLocaleString()}`));
    if (parsed.location) pills.push(p('<i class="fa-solid fa-location-dot"></i>', parsed.location));
    return pills.join(' ');
}

// ── Build query from filter dropdowns ─────────────────────
function buildQueryFromFilters() {
    const ai    = document.getElementById('aiSearch').value.trim();
    const type  = document.getElementById('filterType').value;
    const cat   = document.getElementById('filterCat').value;
    const price = document.getElementById('filterPrice').value.replace(/[^0-9]/g,'');
    const parts = [];
    if (ai) parts.push(ai);
    if (type) parts.push(type);
    if (cat) parts.push(cat==='shortlet'?'shortlet':cat==='rent'?'for rent':'for sale');
    if (price) parts.push(`under ${price}`);
    return parts.join(' ');
}

document.getElementById('doSearch').addEventListener('click', () => {
    const q = buildQueryFromFilters();
    if (q.trim()) doAISearch(q); else resetSearch();
});

document.getElementById('aiSearch').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const q = buildQueryFromFilters();
        if (q.trim()) doAISearch(q); else resetSearch();
    }
});

// ── Reset ──────────────────────────────────────────────────
window.resetSearch = function() {
    searchMode = false;
    document.getElementById('aiSearch').value   = '';
    document.getElementById('filterType').value = '';
    document.getElementById('filterCat').value  = '';
    document.getElementById('filterPrice').value= '';
    document.getElementById('searchClear').style.display = 'none';
    const aiRow = document.getElementById('ai-understood-row');
    aiRow.innerHTML = ''; aiRow.style.display = 'none';
    propEmpty.style.display = 'none';
    propEnd.style.display   = 'none';
    sentinel.style.display  = 'flex';
    grid.innerHTML = Array(4).fill(skeletonHTML()).join('');
    fetchProperties(true);
};
document.getElementById('resetSearch').addEventListener('click', resetSearch);

// ── Live price formatter ───────────────────────────────────
document.getElementById('filterPrice').addEventListener('input', function() {
    const raw = this.value.replace(/[^0-9]/g,'');
    this.value = raw ? Number(raw).toLocaleString('en-NG') : '';
});

// ── WebSocket — real-time new listing toasts ───────────────
(function connectWS() {
    try {
        const proto = location.protocol==='https:'?'wss':'ws';
        const ws    = new WebSocket(`${proto}://${location.host}`);
        ws.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type==='NEW_PROPERTY' && msg.property) {
                    showNewPropertyToast(msg.property);
                    if (!searchMode) allPosts.unshift(msg.property);
                }
            } catch(_) {}
        };
        ws.onclose = () => setTimeout(connectWS, 5000);
    } catch(_) {}
})();

function showNewPropertyToast(p) {
    const img = p.imageNames?.length?`/agent-loged/upload-property/${p.imageNames[0]}`:'/image/IMG_7296.JPG';
    const toast = document.createElement('div');
    toast.style.cssText=`pointer-events:auto;background:rgba(13,112,104,.96);color:#fff;border-radius:16px;
        padding:14px 16px;box-shadow:0 15px 40px rgba(0,0,0,.25);display:flex;gap:14px;align-items:center;
        cursor:pointer;transition:all .5s cubic-bezier(.175,.885,.32,1.275);transform:translateX(120%);opacity:0;
        border:1px solid rgba(255,255,255,.15);max-width:340px;`;
    toast.innerHTML=`<img src="${img}" style="width:60px;height:60px;border-radius:10px;object-fit:cover;flex-shrink:0" alt="">
        <div style="flex:1;min-width:0">
            <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#8af7eb">New listing</div>
            <div style="font-size:13.5px;font-weight:700;margin:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.title||p.type||'Property'}</div>
            <div style="font-size:11px;color:#c9ece8">📍 ${p.location||''}</div>
            <div style="font-size:14px;font-weight:700;margin-top:3px">₦${Number(p.price||0).toLocaleString()}</div>
        </div>
        <button onclick="this.parentElement.remove()" style="background:none;border:none;color:rgba(255,255,255,.6);font-size:20px;cursor:pointer;align-self:flex-start">×</button>`;
    toast.addEventListener('click',(e)=>{ if(e.target.tagName!=='BUTTON') location.href=`/property?id=${p._id}`; });
    document.getElementById('realtime-toast-container').appendChild(toast);
    requestAnimationFrame(()=>{ toast.style.transform='translateX(0)'; toast.style.opacity='1'; });
    setTimeout(()=>{ toast.style.opacity='0'; toast.style.transform='translateX(120%)'; setTimeout(()=>toast.remove(),500); },6000);
}

// ── Push-to-talk Voice Search ─────────────────────────────
(function initVoice() {
    const micBtn  = document.getElementById('searchMic');
    const micIcon = document.getElementById('micIcon');
    const input   = document.getElementById('aiSearch');
    const clearBtn= document.getElementById('searchClear');
    if (!micBtn) return;
    const SR = window.SpeechRecognition||window.webkitSpeechRecognition;
    if (!SR) { micBtn.style.display='none'; return; }
    const rec = new SR();
    rec.lang='en-NG'; rec.continuous=false; rec.interimResults=true;
    let listening=false; let finalText='';
    const start=()=>{ if(listening)return; finalText=''; try{rec.start();}catch(_){} };
    const stop =()=>{ if(!listening)return; rec.stop(); };
    micBtn.addEventListener('mousedown', e=>{e.preventDefault();start();});
    micBtn.addEventListener('mouseup',   ()=>stop());
    micBtn.addEventListener('mouseleave',()=>{if(listening)stop();});
    micBtn.addEventListener('touchstart',e=>{e.preventDefault();start();},{passive:false});
    micBtn.addEventListener('touchend',  e=>{e.preventDefault();stop(); },{passive:false});
    rec.addEventListener('start',()=>{ listening=true; micBtn.classList.add('listening'); micIcon.className='fa-solid fa-microphone-lines'; input.placeholder='Listening... speak now'; });
    rec.addEventListener('result', e => {
        let interim = '';
        let finalText = '';
        
        for (const r of e.results) {
            if (r.isFinal) finalText += r[0].transcript;
            else interim += r[0].transcript;
        }
        
        // 1. Update the value
        input.value = finalText || interim;
        
        // 2. IMPORTANT: Dispatch the input event so your search logic notices the change
        input.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Existing UI update logic
        if (clearBtn) clearBtn.style.display = input.value ? 'block' : 'none';
    });
    rec.addEventListener('end',()=>{ listening=false; micBtn.classList.remove('listening'); micIcon.className='fa-solid fa-microphone'; input.placeholder='e.g. 2 bedroom flat in GRA under 2 million...'; const q=(finalText||input.value).trim(); if(q){input.value=q;if(clearBtn)clearBtn.style.display='block';doAISearch(q);} });
    rec.addEventListener('error',e=>{ listening=false; micBtn.classList.remove('listening'); micIcon.className='fa-solid fa-microphone'; input.placeholder='e.g. 2 bedroom flat in GRA under 2 million...'; });
})();

// ── Init ──────────────────────────────────────────────────
fetchProperties();

setInterval(async()=>{
    if(searchMode)return;
    try{
        // Only refresh feed automatically in background if user is near top and still on page 1
        if (currentPage <= 2 && window.scrollY < 300) {
            const r=await fetch('/api/post/property?page=1&limit=' + PAGE_SIZE); 
            const d=await r.json(); 
            if(d.success&&d.property.length){ 
                grid.innerHTML = '';
                allPosts=d.property; 
                cursor=0; 
                currentPage=2; 
                hasMorePages=d.hasMore||false; 
                renderBatch();
            } 
        }
    }catch(_){}
},60000);
</script>
</body>
</html>