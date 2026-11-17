/* ==========================================================================
   EasyFind Admin — Layout (sidebar + topbar), shared across every page
   ========================================================================== */

const NAV = [
  { type:'link', key:'dashboard', icon:'ri-dashboard-3-line', label:'Dashboard', href:'dashboard.html' },
  { type:'group', key:'properties', icon:'ri-building-4-line', label:'Properties', items:[
    { key:'properties', label:'All Properties', href:'properties.html' },
    { key:'add-property', label:'Add Property', href:'add-property.html' },
    { key:'property-categories', label:'Property Categories', href:'property-categories.html' },
  ]},
  { type:'group', key:'approvals', icon:'ri-shield-check-line', label:'Pending Approvals', items:[
    { key:'pending-agents', label:'Pending Agents', href:'pending-agents.html' },
    { key:'pending-properties', label:'Pending Properties', href:'pending-properties.html' },
  ]},
  { type:'group', key:'users', icon:'ri-team-line', label:'Users', items:[
    { key:'users', label:'All Users', href:'users.html' },
    { key:'agents', label:'Agents', href:'agents.html' },
  ]},
  { type:'group', key:'inbox', icon:'ri-inbox-line', label:'Inbox', items:[
    { key:'messages', label:'Messages', href:'messages.html' },
    { key:'contact-requests', label:'Contact Requests', href:'contact-requests.html' },
  ]},
  { type:'group', key:'payments', icon:'ri-bank-card-line', label:'Payments', items:[
    { key:'transactions', label:'Transactions', href:'transactions.html' },
    { key:'subscriptions', label:'Subscriptions', href:'subscriptions.html' },
    { key:'payouts', label:'Payouts', href:'payouts.html' },
  ]},
  { type:'group', key:'ads', icon:'ri-megaphone-line', label:'Advertisements', items:[
    { key:'active-ads', label:'Active Ads', href:'active-ads.html' },
    { key:'create-ad', label:'Create Advertisement', href:'create-ad.html' },
    { key:'ad-requests', label:'Advertisement Requests', href:'ad-requests.html' },
  ]},
  { type:'group', key:'reports', icon:'ri-flag-2-line', label:'Reports', items:[
    { key:'reported-properties', label:'Reported Properties', href:'reported-properties.html' },
    { key:'reported-users', label:'Reported Users', href:'reported-users.html' },
  ]},
  { type:'link', key:'settings', icon:'ri-settings-3-line', label:'Settings', href:'settings.html' },
];

const PAGE_META = {
  'dashboard': ['Dashboard','Welcome back, here\u2019s what\u2019s happening today.'],
  'properties': ['All Properties','Manage every listing on EasyFind.'],
  'add-property': ['Add Property','Create a new property listing.'],
  'property-categories': ['Property Categories','Organize listings by category.'],
  'pending-agents': ['Pending Agents','Review and approve new agent applications.'],
  'pending-properties': ['Pending Properties','Review listings awaiting approval.'],
  'users': ['All Users','Manage everyone on the EasyFind platform.'],
  'agents': ['Agents','Manage verified real estate agents.'],
  'messages': ['Messages','Conversations between users and support.'],
  'contact-requests': ['Contact Requests','Enquiries submitted through the website.'],
  'transactions': ['Transactions','All payments processed on EasyFind.'],
  'subscriptions': ['Subscriptions','Agent subscription plans and billing.'],
  'payouts': ['Payouts','Agent withdrawal and payout history.'],
  'active-ads': ['Active Ads','Advertisements currently running.'],
  'create-ad': ['Create Advertisement','Launch a new sponsored campaign.'],
  'ad-requests': ['Advertisement Requests','Review submitted ad campaigns.'],
  'reported-properties': ['Reported Properties','Listings flagged by users.'],
  'reported-users': ['Reported Users','Accounts flagged for review.'],
  'settings': ['Settings','Configure your EasyFind workspace.'],
};

function buildSidebar(active){
  let html = `
  <div class="sidebar-brand">
    <div class="logo-mark">E</div>
    <div class="logo-text">Easy<span>Find</span></div>
    <button class="sidebar-close" id="sidebarClose"><i class="ri-close-line"></i></button>
  </div>
  <div class="sidebar-scroll">
    <div class="nav-group">`;

  NAV.forEach(item=>{
    if(item.type==='link'){
      const isActive = active===item.key;
      html += `<div class="nav-item ${isActive?'active':''}">
        <a class="nav-link" href="${item.href}"><i class="${item.icon}"></i><span>${item.label}</span></a>
      </div>`;
    } else {
      const childActive = item.items.some(s=>s.key===active);
      html += `<div class="nav-item has-sub ${childActive?'open active':''}">
        <a class="nav-link" href="#" data-toggle-group><i class="${item.icon}"></i><span>${item.label}</span><i class="ri-arrow-right-s-line chev"></i></a>
        <div class="nav-sub">`;
      item.items.forEach(sub=>{
        html += `<a class="nav-link ${active===sub.key?'active':''}" href="${sub.href}">${sub.label}</a>`;
      });
      html += `</div></div>`;
    }
  });

  html += `</div>
  </div>
  <div class="sidebar-footer">
    <div class="upgrade-card">
      <i class="ri-shield-star-line"></i>
      <h4>EasyFind Pro Tools</h4>
      <p>Unlock advanced analytics &amp; automation for your team.</p>
      <button class="btn">Explore</button>
    </div>
    <div class="nav-item">
      <a class="nav-link logout-link" href="index.html"><i class="ri-logout-box-r-line"></i><span>Logout</span></a>
    </div>
  </div>`;

  return html;
}

function buildTopbar(active){
  const meta = PAGE_META[active] || ['Dashboard',''];
  return `
  <button class="burger" id="burgerBtn"><i class="ri-menu-line"></i></button>
  <div class="topbar-title">
    <h1>${meta[0]}</h1>
    <p>${meta[1]}</p>
  </div>
  <div class="topbar-search">
    <i class="ri-search-line"></i>
    <input type="text" placeholder="Search properties, agents, users...">
    <kbd>\u2318K</kbd>
  </div>
  <div class="topbar-actions">
    <div class="dropdown" id="msgDropdown">
      <button class="icon-btn"><i class="ri-message-3-line"></i><span class="dot"></span></button>
      <div class="dropdown-panel">
        <div class="dropdown-head"><h4>Messages</h4><a href="messages.html">View inbox</a></div>
        <div class="dropdown-list">
          <div class="dropdown-item"><div class="di-icon"><i class="ri-user-3-line"></i></div><div class="di-body"><p>Chidinma Okafor</p><span>Is the Lekki duplex still available?</span></div></div>
          <div class="dropdown-item"><div class="di-icon"><i class="ri-user-3-line"></i></div><div class="di-body"><p>Tunde Bakare</p><span>Sent documents for verification</span></div></div>
          <div class="dropdown-item"><div class="di-icon"><i class="ri-user-3-line"></i></div><div class="di-body"><p>Amaka Eze</p><span>Thank you for the quick response!</span></div></div>
        </div>
      </div>
    </div>
    <div class="dropdown" id="notifDropdown">
      <button class="icon-btn"><i class="ri-notification-3-line"></i><span class="dot"></span></button>
      <div class="dropdown-panel">
        <div class="dropdown-head"><h4>Notifications</h4><a href="#">Mark all read</a></div>
        <div class="dropdown-list">
          <div class="dropdown-item"><div class="di-icon"><i class="ri-home-4-line"></i></div><div class="di-body"><p>New property submitted</p><span>4-Bedroom Duplex in Ikoyi &middot; 5m ago</span></div></div>
          <div class="dropdown-item"><div class="di-icon"><i class="ri-user-add-line"></i></div><div class="di-body"><p>Agent application received</p><span>Fatima Bello &middot; 22m ago</span></div></div>
          <div class="dropdown-item"><div class="di-icon"><i class="ri-flag-2-line"></i></div><div class="di-body"><p>Property reported</p><span>Land in Epe flagged as fraud &middot; 1h ago</span></div></div>
          <div class="dropdown-item"><div class="di-icon"><i class="ri-money-dollar-circle-line"></i></div><div class="di-body"><p>Payout requested</p><span>\u20a6450,000 by Emeka Nwosu &middot; 3h ago</span></div></div>
        </div>
        <div class="dropdown-foot"><a href="#">View all notifications</a></div>
      </div>
    </div>
    <div class="dropdown" id="profileDropdown">
      <button class="profile-trigger">
        <div class="avatar">AO</div>
        <div class="profile-info"><strong>Adaeze Obi</strong><span>Super Admin</span></div>
        <i class="ri-arrow-down-s-line"></i>
      </button>
      <div class="dropdown-panel menu-panel">
        <div class="menu-list">
          <a href="settings.html"><i class="ri-user-3-line"></i>My Profile</a>
          <a href="settings.html"><i class="ri-settings-3-line"></i>Account Settings</a>
          <a href="subscriptions.html"><i class="ri-bank-card-line"></i>Billing</a>
          <div class="divider"></div>
          <a href="index.html" class="logout-link"><i class="ri-logout-box-r-line"></i>Logout</a>
        </div>
      </div>
    </div>
  </div>`;
}

function initLayout(){
  const body = document.body;
  const active = body.getAttribute('data-page') || 'dashboard';

  const sidebarEl = document.getElementById('sidebar');
  const topbarEl = document.getElementById('topbar');
  if(sidebarEl) sidebarEl.innerHTML = buildSidebar(active);
  if(topbarEl) topbarEl.innerHTML = buildTopbar(active);

  // group toggle
  document.querySelectorAll('[data-toggle-group]').forEach(link=>{
    link.addEventListener('click', e=>{
      e.preventDefault();
      link.closest('.nav-item').classList.toggle('open');
    });
  });

  // mobile sidebar
  const overlay = document.getElementById('sidebarOverlay');
  const burger = document.getElementById('burgerBtn');
  const closeBtn = document.getElementById('sidebarClose');
  function openSidebar(){ sidebarEl.classList.add('open'); overlay.classList.add('show'); }
  function closeSidebar(){ sidebarEl.classList.remove('open'); overlay.classList.remove('show'); }
  if(burger) burger.addEventListener('click', openSidebar);
  if(closeBtn) closeBtn.addEventListener('click', closeSidebar);
  if(overlay) overlay.addEventListener('click', closeSidebar);

  // dropdowns
  document.querySelectorAll('.dropdown').forEach(dd=>{
    const trigger = dd.querySelector('button');
    const panel = dd.querySelector('.dropdown-panel');
    trigger.addEventListener('click', e=>{
      e.stopPropagation();
      const isOpen = panel.classList.contains('show');
      document.querySelectorAll('.dropdown-panel.show').forEach(p=>p.classList.remove('show'));
      if(!isOpen) panel.classList.add('show');
    });
  });
  document.addEventListener('click', ()=>{
    document.querySelectorAll('.dropdown-panel.show').forEach(p=>p.classList.remove('show'));
  });
}

document.addEventListener('DOMContentLoaded', initLayout);
