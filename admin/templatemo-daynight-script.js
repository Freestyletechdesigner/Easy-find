  // Check authentication first
  async function checkAuth() {
    try {
      const response = await fetch('/api/admin/status');
      const data = await response.json();
      
      if (!data.isAdmin) {
        console.log('Not authenticated, redirecting to Home...');
        window.location.href = '/';
        return false;
      }

      if (!data.success) {
        console.log('Not authenticated, redirecting to Home...');
        window.location.href = '/';
        return false;
      }
      
      console.log('Authenticated as:', data.user);
      return true;
    } catch (error) {
      console.error('Auth check failed:', error);
      window.location.href = '/';
      return false;
    }
  }
  checkAuth()

// ===== Theme Toggle =====
function initTheme() {
    const savedTheme = localStorage.getItem('daynight-theme');
    if (savedTheme === 'carbon') {
        document.documentElement.classList.add('carbon');
        document.body.classList.add('carbon');
        updateThemeButtons('carbon');
    } else {
        updateThemeButtons('snow');
    }
}

function setTheme(theme) {
    if (theme === 'carbon') {
        document.documentElement.classList.add('carbon');
        document.body.classList.add('carbon');
        localStorage.setItem('daynight-theme', 'carbon');
    } else {
        document.documentElement.classList.remove('carbon');
        document.body.classList.remove('carbon');
        localStorage.setItem('daynight-theme', 'snow');
    }
    updateThemeButtons(theme);
}

function updateThemeButtons(theme) {
    const snowBtns = document.querySelectorAll('.theme-btn-snow');
    const carbonBtns = document.querySelectorAll('.theme-btn-carbon');
    
    snowBtns.forEach(btn => {
        btn.classList.toggle('active', theme === 'snow');
    });
    carbonBtns.forEach(btn => {
        btn.classList.toggle('active', theme === 'carbon');
    });
}

// ===== Time-based Greeting =====
function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
}

function setGreeting() {
    const greetingEl = document.getElementById('greeting');
    if (greetingEl) {
        greetingEl.textContent = getGreeting() + ', Freedom';
    }
}

// ===== Date Range Picker =====
function setDateRange(range, btn) {
    const btns = document.querySelectorAll('.date-btn');
    btns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Update charts based on range
    updateCharts(range);
}

function updateCharts(range) {
    // Animate chart bars based on selected range
    const bars = document.querySelectorAll('.bar');
    bars.forEach(bar => {
        const currentHeight = parseInt(bar.style.height);
        let multiplier = 1;
        
        if (range === '7d') multiplier = 0.7;
        if (range === '30d') multiplier = 1;
        if (range === '90d') multiplier = 1.2;
        if (range === '12m') multiplier = 1.4;
        
        // Random variation
        const variation = 0.8 + Math.random() * 0.4;
        bar.style.height = (currentHeight * multiplier * variation) + 'px';
    });
}

// ===== Inbox =====
function selectMessage(el, index) {
    // Remove active from all
    document.querySelectorAll('.message-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Add active to selected
    el.classList.add('active');
    el.classList.remove('unread');
    
    // Update message view
    updateMessageView(index);
}

function updateMessageView(index) {
    const messages = [
        {
            subject: 'Project Update: Q1 Dashboard Redesign',
            sender: 'Sarah Chen',
            email: 'sarah.chen@company.com',
            date: 'Jan 2, 2026 at 9:45 AM',
            body: `<p>Hi Alex,</p>
                   <p>I wanted to give you a quick update on the Q1 dashboard redesign project. We've completed the wireframes and initial mockups, and the team is ready to move into the development phase.</p>
                   <p>Key highlights from our progress:</p>
                   <p>• User research completed with 15 participants<br>
                   • 3 design concepts presented to stakeholders<br>
                   • Final direction approved by leadership<br>
                   • Development sprint starting next Monday</p>
                   <p>Could we schedule a quick sync tomorrow to go over the technical requirements? Let me know what time works best for you.</p>
                   <p>Best regards,<br>Sarah</p>`
        },
        {
            subject: 'Weekly Analytics Report',
            sender: 'Analytics Bot',
            email: 'analytics@company.com',
            date: 'Jan 1, 2026 at 8:00 AM',
            body: `<p>Hello Alex,</p>
                   <p>Here's your weekly analytics summary for December 25-31, 2025:</p>
                   <p><strong>Traffic Overview:</strong><br>
                   Total visitors: 45,230 (+12% vs last week)<br>
                   Page views: 128,450 (+8%)<br>
                   Avg. session duration: 4m 32s</p>
                   <p><strong>Top Performing Pages:</strong><br>
                   1. /dashboard - 15,230 views<br>
                   2. /analytics - 8,450 views<br>
                   3. /projects - 6,780 views</p>
                   <p>View the full report in your Analytics dashboard.</p>`
        },
        {
            subject: 'New Team Member Introduction',
            sender: 'HR Team',
            email: 'hr@company.com',
            date: 'Dec 31, 2025 at 2:30 PM',
            body: `<p>Dear Team,</p>
                   <p>We're excited to announce that Michael Torres will be joining our engineering team starting January 6th as a Senior Frontend Developer.</p>
                   <p>Michael comes to us with 8 years of experience in web development and has previously worked at several notable tech companies. He'll be working closely with the product team on our new features.</p>
                   <p>Please join us in welcoming Michael to the team!</p>
                   <p>Best,<br>HR Team</p>`
        }
    ];
    
    const msg = messages[index] || messages[0];
    
    document.querySelector('.message-view-subject').textContent = msg.subject;
    document.querySelector('.message-view-sender-name').textContent = msg.sender;
    document.querySelector('.message-view-sender-email').textContent = msg.email;
    document.querySelector('.message-view-date').textContent = msg.date;
    document.querySelector('.message-view-body').innerHTML = msg.body;
}

// ===== Kanban =====
function initKanban() {
    const cards = document.querySelectorAll('.kanban-card');
    const columns = document.querySelectorAll('.kanban-cards');
    
    cards.forEach(card => {
        card.setAttribute('draggable', true);
        
        card.addEventListener('dragstart', (e) => {
            card.classList.add('dragging');
        });
        
        card.addEventListener('dragend', (e) => {
            card.classList.remove('dragging');
        });
    });
    
    columns.forEach(column => {
        column.addEventListener('dragover', (e) => {
            e.preventDefault();
            const dragging = document.querySelector('.dragging');
            column.appendChild(dragging);
        });
    });
}

// ===== Settings Toggles =====
function initToggles() {
    const toggles = document.querySelectorAll('.toggle input');
    toggles.forEach(toggle => {
        toggle.addEventListener('change', function() {
            console.log(`${this.id} is now ${this.checked ? 'enabled' : 'disabled'}`);
        });
    });
}

// ===== Mobile Menu =====
function toggleMobileMenu() {
    const menu = document.querySelector('.mobile-menu');
    const overlay = document.querySelector('.mobile-menu-overlay');
    
    if (menu && overlay) {
        menu.classList.toggle('active');
        overlay.classList.toggle('active');
        document.body.style.overflow = menu.classList.contains('active') ? 'hidden' : '';
    }
}

function closeMobileMenu() {
    const menu = document.querySelector('.mobile-menu');
    const overlay = document.querySelector('.mobile-menu-overlay');
    
    if (menu && overlay) {
        menu.classList.remove('active');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', function() {
    initTheme();
    setGreeting();
    
    if (document.querySelector('.kanban-board')) {
        initKanban();
    }
    
    if (document.querySelector('.toggle')) {
        initToggles();
    }
    
    // Close mobile menu on overlay click
    const overlay = document.querySelector('.mobile-menu-overlay');
    if (overlay) {
        overlay.addEventListener('click', closeMobileMenu);
    }
});

//UPLOADER

const alertBox = document.getElementById('alert');
document.querySelectorAll('.hero-upload').forEach(card => {
    const dropZone = card.querySelector('.drop-zone');
    const input = card.querySelector('input[type="file"]');
    const saveBtn = card.querySelector('.save-btn');
    const cancelBtn = card.querySelector('.cancel-btn');
    const placeholder = "placeholder.jpg";
    const img = dropZone.querySelector('img');

    dropZone.addEventListener('click', () => input.click());

    dropZone.addEventListener('dragover', e => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        input.files = e.dataTransfer.files;
        previewFiles(input.files);
    });

    input.addEventListener('change', () => {
        previewFiles(input.files);
    });

    function previewFiles(files) {
        // MULTIPLE FILES (Property uploader)
        if (input.hasAttribute('multiple')) {
            dropZone.innerHTML = "";

            [...files].forEach(file => {
                const box = document.createElement("div");
                box.style.padding = "6px";
                box.style.fontSize = "12px";
                box.style.textAlign = "center";

                // if image → show thumbnail
                if (file.type.startsWith("image/")) {
                    const imgEl = document.createElement("img");
                    imgEl.src = URL.createObjectURL(file);
                    imgEl.style.width = "60px";
                    imgEl.style.borderRadius = "6px";
                    imgEl.style.display = "block";
                    box.appendChild(imgEl);
                }

                // filename
                const name = document.createElement("p");
                name.textContent = file.name;
                box.appendChild(name);

                dropZone.appendChild(box);
            });
        }
        // SINGLE FILE (Hero uploader)
        else {
            const file = files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = () => img.src = reader.result;
            reader.readAsDataURL(file);
        }
    }

    cancelBtn.addEventListener('click', () => {
        input.value = "";
        alertBox.style.display = "none";
        if (input.hasAttribute('multiple')) {
            dropZone.innerHTML = `<span class="drop-text">Tap or drag files here</span>`;
        } else {
            img.src = placeholder;
        }
    });

    saveBtn.addEventListener('click', e => {
        if (!input.files.length) {
            e.preventDefault();
            alert("Please select file(s) before saving.");
        }
    });
});

const forms = document.querySelectorAll('.upload-form');

// HERO
forms[0].addEventListener('submit', async(e) => {
    e.preventDefault();
    const formData = new FormData(e.target);

    const res = await fetch('/api/hero-uploader', {
        method: 'POST',
        body: formData
    });
    const data = await res.json();
    alertBox.style.display = "flex";
    alertBox.style.color = data.success ? "green" : "red";
    alertBox.textContent = data.message || data.error;

    setTimeout(() => {
        alertBox.style.display = "none";
    }, 2000)
});

// PROPERTY
forms[1].addEventListener('submit', async(e) => {
    e.preventDefault();
    const formData = new FormData(e.target);

    const res = await fetch('/api/files-uploader', {
        method: 'POST',
        body: formData
    });

    const data = await res.json();

    alertBox.style.display = "flex";
    alertBox.style.color = data.success ? "green" : "red";
    alertBox.textContent = data.success ?
        "Property files uploaded!" :
        data.error;
    setTimeout(() => {
        alertBox.style.display = "none";
    }, 2000)
});
