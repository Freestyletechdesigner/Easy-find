document.addEventListener('DOMContentLoaded', () => {

    // ── Auth ──────────────────────────────────────────────
    async function checkAuth() {
        try {
            const response = await fetch('/api/agent/status');
            const data = await response.json();
            if (!data.isAgent) {
                window.location.href = '/login-agent.html';
                return false;
            }
            document.getElementById('agent-name').textContent = data.agent.name.length > 8 
            ? data.agent.name.slice(0, 8) + '...' 
            : data.agent.name;
            loadProfilePicture();
            return true;
        } catch (error) {
            window.location.href = '/login-agent.html';
            return false;
        }
    }

    async function loadProfilePicture() {
        try {
            const response = await fetch('/api/agent/profile/picture');
            const data = await response.json();
            if (data.success && data.profilePicture) {
                document.getElementById('profile-picture').src = data.profilePicture;
            }
        } catch (error) {
            console.error('Error loading profile picture:', error);
        }
    }

    window.logout = async function () {
        try {
            const response = await fetch('/api/agent/logout', { method: 'POST' });
            const data = await response.json();
            if (data.success) window.location.href = '/login-agent';
        } catch (error) {
            window.location.href = '/login-agent';
        }
    };

    // ── Nav ───────────────────────────────────────────────
    const nav2 = document.getElementById('nav2');
    const hamburger = document.getElementById('hamburger');

    hamburger.addEventListener('click', (e) => {
        e.stopPropagation();
        nav2.classList.toggle('active');
        hamburger.classList.toggle('active');
    });

    window.addEventListener('click', (e) => {
        if (!hamburger.contains(e.target)) {
            hamburger.classList.remove('active');
            nav2.classList.remove('active');
        }
    });

    // ── Type toggle (Land hides beds/baths, shows plot) ──────
    const typeSelect = document.getElementById('typeSelect');
    const groupBeds  = document.getElementById('groupBeds');
    const groupBaths = document.getElementById('groupBaths');

    function handleTypeChange() {
        const isLand = typeSelect.value === 'land';
        groupBeds.style.display  = isLand ? 'none' : '';
        groupBaths.style.display = isLand ? 'none' : '';
        if (isLand) {
            propertyForm.querySelector('[name="beds"]').value  = '';
            propertyForm.querySelector('[name="baths"]').value = '';
        }
    }

    typeSelect.addEventListener('change', handleTypeChange);

    // ── Modal ─────────────────────────────────────────────
    window.openModal = function () {
        document.getElementById('modalOverlay').classList.add('active');
        document.body.style.overflow = 'hidden';
        initializeFeatures();
        handleTypeChange();
    };

    window.closeModal = function () {
        document.getElementById('modalOverlay').classList.remove('active');
        document.body.style.overflow = 'auto';
        resetForm();
    };

    function resetForm() {
        propertyForm.reset();
        selectedImages = [];
        updateImagePreview();
        selectedFeatures.clear();
        updateFeaturesInput();
    }

    // ── Features ──────────────────────────────────────────
    const availableFeatures = [
        'Swimming Pool', 'Gym', 'Parking', 'Garden', 'Balcony',
        'Security', 'Elevator', 'Pet Friendly', 'Furnished', 'Air Conditioning'
    ];
    const selectedFeatures = new Set();

    function initializeFeatures() {
        const container = document.getElementById('featuresContainer');
        container.innerHTML = '';
        availableFeatures.forEach(feature => {
            const tag = document.createElement('div');
            tag.className = 'feature-tag';
            tag.textContent = feature;
            tag.onclick = () => toggleFeature(feature, tag);
            container.appendChild(tag);
        });
    }

    function toggleFeature(feature, element) {
        if (selectedFeatures.has(feature)) {
            selectedFeatures.delete(feature);
            element.classList.remove('selected');
        } else {
            selectedFeatures.add(feature);
            element.classList.add('selected');
        }
        updateFeaturesInput();
    }

    function updateFeaturesInput() {
        document.getElementById('featuresInput').value = Array.from(selectedFeatures).join(',');
    }

    // ── Image Upload & Drag-Drop ──────────────────────────
    const imagedrop            = document.querySelector('.image-upload-zone');
    const propertyForm         = document.getElementById('propertyForm');
    const imageInput           = document.getElementById('fileInput');
    const imagePreviewContainer = document.getElementById('imagePreviewContainer');
    let selectedImages = [];

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        imagedrop.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        imagedrop.addEventListener(eventName, () => {
            imagedrop.style.borderColor = '#0d7068';
            imagedrop.style.background  = 'linear-gradient(135deg, #e8fffe 0%, #d4fcfb 100%)';
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        imagedrop.addEventListener(eventName, () => {
            imagedrop.style.borderColor = '#66eae3';
            imagedrop.style.background  = 'linear-gradient(135deg, #f5fdfd 0%, #e8fffe 100%)';
        });
    });

    imagedrop.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
    imageInput.addEventListener('change', (e) => handleFiles(e.target.files));

    function handleFiles(files) {
        const validFiles = Array.from(files).filter(file => {
            if (!file.type.startsWith('image/')) {
                alertBox.error('Invalid File', `${file.name} is not an image file`);
                return false;
            }
            if (file.size > 10 * 1024 * 1024) {
                alertBox.error('File Too Large', `${file.name} exceeds the 10MB limit`);
                return false;
            }
            return true;
        });
        selectedImages = [...selectedImages, ...validFiles];
        updateImagePreview();
    }

    function updateImagePreview() {
        imagePreviewContainer.innerHTML = '';
        selectedImages.forEach((file, index) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const item = document.createElement('div');
                item.className = 'preview-item';
                item.innerHTML = `
                    <img src="${e.target.result}" alt="Preview">
                    <button type="button" class="remove-preview" onclick="removeImage(${index})">×</button>
                `;
                imagePreviewContainer.appendChild(item);
            };
            reader.readAsDataURL(file);
        });
    }

    window.removeImage = function (index) {
        selectedImages.splice(index, 1);
        updateImagePreview();
    };

    // ── Submit ────────────────────────────────────────────
    window.submitProperty = async function () {
        const submitBtn = document.getElementById('submit');
        if (submitBtn.disabled) return;

        const spinner = submitBtn.querySelector('.spinner');
        const btnText = submitBtn.querySelector('.btn-text');

        // Image check
        if (selectedImages.length === 0) {
            alertBox.warning('No Images', 'Please upload at least one image');
            return;
        }

        // Validation
        const emojiOrSymbol = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FEFF}!@#$%^&*()+=\[\]{}<>?\\|`~]/u;
        const textOnly      = /^[a-zA-Z0-9\s,.\-'"\/]+$/;
        const numbersOnly   = /^\d+(\.\d+)?$/;

        const title    = propertyForm.querySelector('[name="title"]').value.trim();
        const price    = propertyForm.querySelector('[name="price"]').value.trim();
        const category = propertyForm.querySelector('[name="category"]').value;
        const location = propertyForm.querySelector('[name="location"]').value.trim();
        const beds     = propertyForm.querySelector('[name="beds"]').value.trim();
        const baths    = propertyForm.querySelector('[name="baths"]').value.trim();
        const area     = propertyForm.querySelector('[name="area"]').value.trim();
        const desc     = propertyForm.querySelector('[name="description"]').value.trim();

        if (!title)                                              { alertBox.warning('Missing Field', 'Property title is required'); return; }
        if (emojiOrSymbol.test(title) || !textOnly.test(title)) { alertBox.error('Invalid Title', 'Title must not contain emojis or special symbols'); return; }
        if (!price)                                              { alertBox.warning('Missing Field', 'Price is required'); return; }
        if (!numbersOnly.test(price))                            { alertBox.error('Invalid Price', 'Price must be numbers only'); return; }
        if (!category)                                           { alertBox.warning('Missing Field', 'Please select a listing category (Sale, Rent, or Short-let)'); return; }
        if (!location)                                           { alertBox.warning('Missing Field', 'Location is required'); return; }
        if (emojiOrSymbol.test(location) || !textOnly.test(location)) { alertBox.error('Invalid Location', 'Location must not contain emojis or special symbols'); return; }
        if (beds  && !numbersOnly.test(beds))                    { alertBox.error('Invalid Bedrooms', 'Bedrooms must be a number only'); return; }
        if (baths && !numbersOnly.test(baths))                   { alertBox.error('Invalid Bathrooms', 'Bathrooms must be a number only'); return; }
        if (area  && !numbersOnly.test(area))                    { alertBox.error('Invalid Area', 'Area must be a number only'); return; }
        if (desc  && emojiOrSymbol.test(desc))                   { alertBox.error('Invalid Description', 'Description must not contain emojis or special symbols'); return; }

        // Build FormData
        const formData = new FormData(propertyForm);
        formData.delete('file');
        selectedImages.forEach(file => formData.append('file', file));

        // Loading state
        submitBtn.disabled        = true;
        spinner.style.display     = 'inline-block';
        btnText.style.display     = 'none';

        try {
            const response = await fetch('/api/agent/post', { method: 'POST', body: formData });
            const data     = await response.json();

            if (response.ok && data.success) {
                alertBox.success('Success', 'Property posted successfully!', () => {
                    closeModal();
                    loadProperties();
                });
               document.getElementById('propertiesEmpty').style.display = 'none';
            } else {
                alertBox.error('Failed', data.message || 'Failed to post property');
            }
        } catch (error) {
            console.error('Submit error:', error);
            alertBox.error('Error', 'Error posting property. Please try again.');
        } finally {
            submitBtn.disabled    = false;
            spinner.style.display = 'none';
            btnText.style.display = 'inline';
        }
    };

    // ── Card Menu ─────────────────────────────────────────
    window.toggleCardMenu = function(id) {
        const menu = document.getElementById(`menu-${id}`);
        document.querySelectorAll('.card-menu.open').forEach(m => {
            if (m.id !== `menu-${id}`) m.classList.remove('open');
        });
        menu.classList.toggle('open');
    };

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.card-menu-wrap')) {
            document.querySelectorAll('.card-menu.open').forEach(m => m.classList.remove('open'));
        }
    });

    window.deleteProperty = function(id) {
        alertBox.confirm(
            'Delete Property',
            'Are you sure you want to delete this listing? This cannot be undone.',
            async () => {
                try {
                    const res  = await fetch(`/api/agent/property/${id}`, { method: 'DELETE' });
                    const data = await res.json();
                    if (res.ok && data.success) {
                        document.getElementById(`card-${id}`)?.remove();
                        const remaining = document.querySelectorAll('.property-card').length;
                        document.getElementById('property-count').textContent = remaining;
                        if (!remaining) document.getElementById('propertiesEmpty').style.display = 'block';
                        alertBox.success('Deleted', 'Property removed successfully');
                    } else {
                        alertBox.error('Failed', data.message || 'Could not delete property');
                    }
                } catch (err) {
                    alertBox.error('Error', 'Something went wrong. Please try again.');
                }
            }
        );
    };

    window.shareProperty = async function(id) {
        const url = `${window.location.origin}/property?id=${id}`;
        
        if (navigator.share) {
            try {
            await navigator.share({ title: 'Check out this property', url })
            } catch (err) {
              copyToClipboard(url)
            }
        } else {
            copyToClipboard(url);
        }
    };

    function copyToClipboard(url) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url)
                .then(() => alertBox.success('Link Copied', 'Property link copied to clipboard'))
                .catch(() => fallbackCopy(url));
        } else {
            fallbackCopy(url);
        }
    }

    function fallbackCopy(url) {
        const el = document.createElement('textarea');
        el.value = url;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        alertBox.success('Link Copied', 'Property link copied to clipboard');
    }

    // ── Properties Grid ───────────────────────────────────
    window.loadProperties = async function () {
        const grid  = document.getElementById('propertiesGrid');
        const empty = document.getElementById('propertiesEmpty');
        const count = document.getElementById('property-count');

        grid.innerHTML = Array(3).fill(`
            <div class="skeleton-card">
                <div class="skeleton skeleton-img"></div>
                <div class="skeleton-body">
                    <div class="skeleton skeleton-line" style="width:60%"></div>
                    <div class="skeleton skeleton-line" style="width:40%"></div>
                    <div class="skeleton skeleton-line" style="width:80%"></div>
                </div>
            </div>
        `).join('');

        try {
            const res  = await fetch('/api/agent/property');
            const data = await res.json();

            grid.innerHTML = '';

            if (!data.success || !data.property.length) {
                empty.style.display = 'block';
                count.textContent   = '0';
                return;
            }

            count.textContent = data.property.length;
            data.property.forEach(p => grid.insertAdjacentHTML('beforeend', propertyCard(p)));

        } catch (err) {
            grid.innerHTML      = '';
            empty.style.display = 'block';
            count.textContent   = '0';
        }
    };

    function propertyCard(p) {
        const imgSrc   = p.imageNames && p.imageNames.length
            ? `/agent-loged/upload-property/${p.imageNames[0]}`
            : 'profile.png';
        const imgCount = p.imageNames ? p.imageNames.length : 0;
        const price    = Number(p.price).toLocaleString();
        const date     = new Date(p.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

        return `
            <div class="property-card" id="card-${p._id}">
                <div class="card-image">
                    <img src="${imgSrc}" alt="${p.type || 'Property'}" loading="lazy">
                    <span class="card-type-badge">${p.type || 'Property'}${p.title ? ', ' + p.title : ''}</span>
                    ${p.category ? `<span class="card-category-badge ${p.category}">${p.category === 'shortlet' ? 'Short-let' : p.category === 'rent' ? 'For Rent' : 'For Sale'}</span>` : ''}
                    ${imgCount > 1 ? `<span class="card-image-count"><i class="fas fa-images"></i> ${imgCount}</span>` : ''}

                    <!-- 3-dot menu -->
                    <div class="card-menu-wrap">
                        <button class="card-menu-btn" onclick="toggleCardMenu('${p._id}')">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                        <div class="card-menu" id="menu-${p._id}">
                            <button onclick="deleteProperty('${p._id}')">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                            <button onclick="shareProperty('${p._id}')">
                                <i class="fas fa-share-alt"></i> Share
                            </button>
                            <a href="/property?id=${p._id}" target="_blank">
                                <i class="fas fa-eye"></i> Preview
                            </a>
                        </div>
                    </div>
                </div>
                <div class="card-body">
                    <div class="card-price">₦${price}</div>
                    <div class="card-location"><i class="fas fa-map-marker-alt"></i> ${p.location || 'N/A'}</div>
                    <div class="card-stats">
                        <span class="card-stat"><i class="fas fa-bed"></i> ${p.beds || 0} Beds</span>
                        <span class="card-stat"><i class="fas fa-bath"></i> ${p.baths || 0} Baths</span>
                        <span class="card-stat"><i class="fas fa-ruler-combined"></i> ${p.area || 0} sqft</span>
                    </div>
                    <div class="card-date"><i class="fas fa-calendar-alt"></i> Listed ${date} <i class="fas fa-eye"></i> views ${p.view || 0}</div>
                </div>
                <div class="card-footer">
                    <a href="/property?id=${p._id}" class="btn-view-details">
                        View Details <i class="fas fa-arrow-right"></i>
                    </a>
                </div>
            </div>
        `;
    }

    //total views
    async function loadTotalViews() {
        const res  = await fetch('/api/agent/views');
        const data = await res.json();
        if (data.success) {
            document.getElementById('total-views').innerHTML = `Views <i class="fas fa-eye"></i> <span>${data.totalViews}</span>`;
        }
    }

 
    // Bio
    const bioText     = document.getElementById('bioText');
    const bioEditForm = document.getElementById('bioEditForm');
    const bioInput    = document.getElementById('bioInput');
    const bioCharCount = document.getElementById('bioCharCount');

    // char counter
    bioInput.addEventListener('input', () => {
        bioCharCount.textContent = bioInput.value.length;
    });

    async function Bio() {
        try {
            const res  = await fetch('/api/get/bio');
            const data = await res.json();
            if (data.success) {
                bioText.textContent = data.bio || 'No bio added yet.';
                bioText.classList.toggle('empty', !data.bio);
            }
        } catch (error) {
            console.error(error);
            bioText.textContent = 'No bio added yet.';
        }
    }

    window.toggleBioEdit = function () {
        const open = bioEditForm.style.display !== 'none';
        bioEditForm.style.display = open ? 'none' : 'block';
        if (!open) {
            bioInput.value = bioText.textContent === 'No bio added yet.' ? '' : bioText.textContent;
            bioCharCount.textContent = bioInput.value.length;
            bioInput.focus();
        }
    };

    window.cancelBioEdit = function () {
        bioEditForm.style.display = 'none';
        bioInput.value = '';
        bioCharCount.textContent = '0';
    };

    window.saveBio = async function () {
        const bioSpinner = document.getElementById('bioSpinner');
        const bio = bioInput.value.trim();
        bioSpinner.style.display = 'inline-block';
        try {
            const res  = await fetch('/api/update/bio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bio })
            });
            const data = await res.json();
            if (data.success) {
                bioText.textContent = data.bio || 'No bio added yet.';
                bioText.classList.toggle('empty', !data.bio);
                cancelBioEdit();
                alertBox.success('Saved', 'Bio updated successfully');
            } else {
                alertBox.error('Error', data.message || 'Failed to save bio');
            }
        } catch (error) {
            console.error(error);
            alertBox.error('Error', 'Something went wrong. Please try again.');
        } finally {
            bioSpinner.style.display = 'none';
        }
    };

    // Init
    checkAuth();
    loadProperties();
    loadTotalViews();
    Bio()

}); // end DOMContentLoaded
