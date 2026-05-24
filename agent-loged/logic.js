document.addEventListener('DOMContentLoaded', () => {

    // ── Auth ──────────────────────────────────────────────
    async function checkAuth() {
        try {
            const response = await fetch('/api/agent/profile', { credentials: 'include' });
            const data = await response.json();
            const verify = document.querySelector('.verify')
            if (!data.agent) {
                window.location.href = '/login-agent';
                return false;
            }
            document.getElementById('agent-name').textContent = data.agent.name.length > 8 
            ? data.agent.name.slice(0, 8) + '...' 
            : data.agent.name;
            loadProfilePicture();

            if (data.agent.stand && data.agent.stand.toLowerCase() === 'verified agent') {
                document.querySelectorAll('[href="/agent-verification"]').forEach(el => {
                    el.style.display = 'none';
                });
                verify.style.display = 'flex'
            } else {
                verify.style.display = 'none'
            }
            return true;
        } catch (error) {
            window.location.href = '/login-agent';
            return false;
        }
    }

    const uploadPic = document.querySelector('.upload-pic')

    async function loadProfilePicture() {
        try {
            const response = await fetch('/api/agent/profile/picture', { credentials: 'include' });
            const data = await response.json();
            if (data.success && data.profilePicture) {
                document.getElementById('profile-picture').src = data.profilePicture;
            } else if (!data.profilePicture) {
                uploadPic.style.display = 'flex'
                setTimeout(() => {
                    uploadPic.style.display = 'none'
                }, 2000);
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
    const landPlot = document.getElementById('groupLand');
    landPlot.style.display = 'none'

    function handleTypeChange() {
        const isLand = typeSelect.value === 'land';
        groupBeds.style.display  = isLand ? 'none' : '';
        groupBaths.style.display = isLand ? 'none' : '';
        if (isLand) {
            propertyForm.querySelector('[name="beds"]').value  = '';
            propertyForm.querySelector('[name="baths"]').value = '';
            landPlot.style.display = ''
        } else {
            landPlot.style.display = 'none'
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
                alertBox.error('File Too Large', `${file.name} exceeds the 20MB limit`);
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
        if (area  && emojiOrSymbol.test(area))                    { alertBox.error('Invalid Area', 'Area must not contain emojis or special symbols'); return; }
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
                    loadProperties(isNewLoad = true);
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

// Keep track of pagination state out of function re-initialization scope
let currentPropertyPage = 1; 
let isPropertyLoading = false;

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

// ── Properties Grid ───────────────────────────────────
window.loadProperties = async function (isNewLoad = false) {
    // Prevent overlapping duplicate API requests if user click-spams
    if (isPropertyLoading) return; 
    
    if (isNewLoad) {
        currentPropertyPage = 1;
    }

    const grid  = document.getElementById('propertiesGrid');
    const empty = document.getElementById('propertiesEmpty');
    const count = document.getElementById('property-count');

    isPropertyLoading = true;

    // Inject skeletons carefully without wiping out previous items if appending
    if (currentPropertyPage === 1) {
        grid.innerHTML = getSkeletonHTML();
        empty.style.display = 'none';
    } else {
        grid.insertAdjacentHTML('beforeend', `<div id="pagination-skeletons">${getSkeletonHTML()}</div>`);
    }

    try {
        const res  = await fetch(`/api/agent/property?page=${currentPropertyPage}`);
        const data = await res.json();

        // Remove temporary skeletons safely
        if (currentPropertyPage === 1) {
            grid.innerHTML = '';
        } else {
            const tempSkeletons = document.getElementById('pagination-skeletons');
            if (tempSkeletons) tempSkeletons.remove();
        }

        if (!data.success || !data.property || !data.property.length) {
            if (currentPropertyPage === 1) {
                empty.style.display = 'block';
                count.textContent = '0';
            }
            isPropertyLoading = false;
            return;
        }

        // Update counts and render cards gracefully
        if (currentPropertyPage === 1) {
            count.textContent = data.totalCount || data.property.length; 
        } else {
            // If backend provides exact database count, use that, else increment aggregate values
            count.textContent = parseInt(count.textContent) + data.property.length;
        }

        // Efficient DOM insertion loop
        data.property.forEach(p => grid.insertAdjacentHTML('beforeend', propertyCard(p)));
        
        // Prepare increment step for the next pagination invocation trigger
        currentPropertyPage++;

    } catch (err) {
        console.error("Failed to load properties:", err);
        if (currentPropertyPage === 1) {
            grid.innerHTML = '';
            empty.style.display = 'block';
            count.textContent = '0';
        } else {
            const tempSkeletons = document.getElementById('pagination-skeletons');
            if (tempSkeletons) tempSkeletons.remove();
        }
    } finally {
        isPropertyLoading = false;
    }
};

function propertyCard(p) {
    const imgSrc = p.imageNames && p.imageNames.length
        ? `/agent-loged/upload-property/${p.imageNames[0]}`
        : 'profile.png';
    const price = Number(p.price).toLocaleString();
    const date = new Date(p.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const isLand = (p.type || '').toLowerCase() === 'land';
    const isVerified = (p.stand || '').toLowerCase() === 'verified agent';

    // SCALING OPTIMIZATION:
    return `
        <div class="property-card" id="card-${p._id}" data-property="${encodeURIComponent(JSON.stringify(p))}">
            <div class="card-image">
                <img src="${imgSrc}" alt="${p.type || 'Property'}" loading="lazy">
                <span class="card-type-badge">${p.type || 'Property'}${p.title ? ', ' + p.title : ''}</span>
                ${p.category ? `<span class="card-category-badge ${p.category}">${p.category === 'shortlet' ? 'Short-let' : p.category === 'rent' ? 'For Rent' : 'For Sale'}</span>` : ''}
                ${isVerified ? `<span class="card-verified-badge"><i class="fa-solid fa-building-shield"></i></span>` : ''}

                <div class="card-menu-wrap">
                    <button class="card-menu-btn" onclick="toggleCardMenu('${p._id}')">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <div class="card-menu" id="menu-${p._id}">
                        <button onclick="deleteProperty('${p._id}')"><i class="fas fa-trash"></i> Delete</button>
                        <button onclick="shareProperty('${p._id}')"><i class="fas fa-share-alt"></i> Share</button>
                        <button onclick="editPost('${p._id}')"><i class="fa-solid fa-gear"></i> Edit post</button>
                    </div>
                </div>
            </div>
            <div class="card-body">
                <div class="card-price">₦${price}</div>
                <div class="card-location"><i class="fas fa-map-marker-alt"></i> ${p.location || 'N/A'}</div>
                <div class="card-stats">
                    ${isLand ? '' : `<span class="card-stat"><i class="fas fa-bed"></i> ${p.beds || 0} Beds</span>`}
                    ${isLand ? '' : `<span class="card-stat"><i class="fas fa-bath"></i> ${p.baths || 0} Baths</span>`}
                    ${isLand ? `<span class="card-stat"><i class="fas fa-ruler-combined"></i> ${p.area || 0}</span>` : ''}
                </div>
                <div class="card-date"><i class="fas fa-calendar-alt"></i> Listed ${date} | <i class="fas fa-eye"></i> ${p.view || 0} views</div>
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

    // ── Edit Property ─────────────────────────────────────
    const editTypeSelect  = document.getElementById('editTypeSelect');
    const editGroupBeds   = document.getElementById('editGroupBeds');
    const editGroupBaths  = document.getElementById('editGroupBaths');
    const editGroupLand   = document.getElementById('editGroupLand');
    const editForm        = document.getElementById('editPropertyForm');
    const editPreview     = document.getElementById('editImagePreviewContainer');
    const editFileInput   = document.getElementById('editFileInput');
    let editImages        = [];
    let editSelectedFeatures = new Set();
    let currentEditId     = null;
    let existingImages    = [];

    function handleEditTypeChange() {
        const isLand = editTypeSelect.value === 'land';
        editGroupBeds.style.display  = isLand ? 'none' : '';
        editGroupBaths.style.display = isLand ? 'none' : '';
        editGroupLand.style.display  = isLand ? '' : 'none';
        if (isLand) {
            document.getElementById('editBeds').value  = '';
            document.getElementById('editBaths').value = '';
        }
    }

    editTypeSelect.addEventListener('change', handleEditTypeChange);

    function initEditFeatures(existing) {
        const list = Array.isArray(existing)
            ? existing
            : (existing ? existing.split(',').map(f => f.trim()).filter(Boolean) : []);
        editSelectedFeatures = new Set(list);
        const container = document.getElementById('editFeaturesContainer');
        container.innerHTML = '';
        availableFeatures.forEach(feature => {
            const tag = document.createElement('div');
            tag.className = 'feature-tag' + (editSelectedFeatures.has(feature) ? ' selected' : '');
            tag.textContent = feature;
            tag.onclick = () => {
                if (editSelectedFeatures.has(feature)) {
                    editSelectedFeatures.delete(feature);
                    tag.classList.remove('selected');
                } else {
                    editSelectedFeatures.add(feature);
                    tag.classList.add('selected');
                }
                document.getElementById('editFeaturesInput').value = Array.from(editSelectedFeatures).join(',');
            };
            container.appendChild(tag);
        });
        document.getElementById('editFeaturesInput').value = Array.from(editSelectedFeatures).join(',');
    }

    function updateEditPreview() {
        editPreview.innerHTML = '';

        // existing images
        existingImages.forEach((name, index) => {
            const item = document.createElement('div');
            item.className = 'preview-item';
            item.innerHTML = `
                <img src="/agent-loged/upload-property/${name}" alt="Current image">
                <button type="button" class="remove-preview" onclick="removeExistingImage(${index})">×</button>
            `;
            editPreview.appendChild(item);
        });

        // new images
        editImages.forEach((file, index) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const item = document.createElement('div');
                item.className = 'preview-item';
                item.innerHTML = `
                    <img src="${e.target.result}" alt="Preview">
                    <button type="button" class="remove-preview" onclick="removeEditImage(${index})">×</button>
                `;
                editPreview.appendChild(item);
            };
            reader.readAsDataURL(file);
        });
    }

    window.removeEditImage = function(index) {
        editImages.splice(index, 1);
        updateEditPreview();
    };

    window.removeExistingImage = function(index) {
        existingImages.splice(index, 1);
        updateEditPreview();
    };

    editFileInput.addEventListener('change', (e) => {
        const valid = Array.from(e.target.files).filter(f => f.type.startsWith('image/') && f.size <= 10 * 1024 * 1024);
        editImages = [...editImages, ...valid];
        updateEditPreview();
    });

    window.editPost = async function(id) {
        currentEditId = id;
        editImages = [];
        existingImages = [];
        updateEditPreview();

        try {
            const card = document.getElementById(`card-${id}`);
            const p    = JSON.parse(decodeURIComponent(card.dataset.property));

            existingImages = Array.isArray(p.imageNames) ? [...p.imageNames] : [];

            document.getElementById('editTitle').value       = p.title       || '';
            document.getElementById('editPrice').value       = p.price       || '';
            document.getElementById('editLocation').value    = p.location    || '';
            document.getElementById('editBeds').value        = p.beds        || '';
            document.getElementById('editBaths').value       = p.baths       || '';
            document.getElementById('editArea').value        = p.area        || '';
            document.getElementById('editDescription').value = p.description || '';
            editTypeSelect.value = (p.type || 'house').toLowerCase();
            document.getElementById('editCategory').value   = p.category    || '';
            handleEditTypeChange();
            initEditFeatures(p.features);
            updateEditPreview();

            document.getElementById('editModalOverlay').classList.add('active');
            document.body.style.overflow = 'hidden';
        } catch (err) {
            alertBox.error('Error', err.message || 'Failed to open editor. Please try again.');
        }
    };

    window.closeEditModal = function() {
        document.getElementById('editModalOverlay').classList.remove('active');
        document.body.style.overflow = 'auto';
        currentEditId  = null;
        editImages     = [];
        existingImages = [];
    };

    window.submitEdit = async function() {
        const btn     = document.getElementById('editSubmitBtn');
        const spinner = btn.querySelector('.spinner');
        const btnText = btn.querySelector('.btn-text');

        if (editImages.length === 0 && existingImages.length === 0) { alertBox.warning('No Images', 'Please keep or upload at least one image'); return; }

        const emojiOrSymbol = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FEFF}!@#$%^&*()+=\[\]{}<>?\\|`~]/u;
        const textOnly      = /^[a-zA-Z0-9\s,.\-'"\/]+$/;
        const numbersOnly   = /^\d+(\.\d+)?$/;

        const title    = document.getElementById('editTitle').value.trim();
        const price    = document.getElementById('editPrice').value.trim();
        const category = document.getElementById('editCategory').value;
        const location = document.getElementById('editLocation').value.trim();
        const beds     = document.getElementById('editBeds').value.trim();
        const baths    = document.getElementById('editBaths').value.trim();
        const area     = document.getElementById('editArea').value.trim();
        const desc     = document.getElementById('editDescription').value.trim();

        if (!title)                                              { alertBox.warning('Missing Field', 'Property title is required'); return; }
        if (emojiOrSymbol.test(title) || !textOnly.test(title)) { alertBox.error('Invalid Title', 'Title must not contain emojis or special symbols'); return; }
        if (!price)                                              { alertBox.warning('Missing Field', 'Price is required'); return; }
        if (!numbersOnly.test(price))                            { alertBox.error('Invalid Price', 'Price must be numbers only'); return; }
        if (!category)                                           { alertBox.warning('Missing Field', 'Please select a listing category'); return; }
        if (!location)                                           { alertBox.warning('Missing Field', 'Location is required'); return; }
        if (emojiOrSymbol.test(location) || !textOnly.test(location)) { alertBox.error('Invalid Location', 'Location must not contain emojis or special symbols'); return; }

        const formData = new FormData(editForm);
        formData.delete('file');
        existingImages.forEach(name => formData.append('keepImages', name));
        editImages.forEach(file => formData.append('file', file));

        btn.disabled          = true;
        spinner.style.display = 'inline-block';
        btnText.style.display = 'none';

        try {
            const res  = await fetch(`/api/edit/post/${currentEditId}`, { method: 'PATCH', body: formData });
            const data = await res.json();

            if (res.ok && data.success) {
                alertBox.success('Updated', 'Property updated successfully!', () => {
                    closeEditModal();
                    loadProperties(isNewLoad = true);
                });
            } else {
                alertBox.error('Failed', data.message || 'Failed to update property');
            }
        } catch (err) {
            alertBox.error('Error', 'Something went wrong. Please try again.');
        } finally {
            btn.disabled          = false;
            spinner.style.display = 'none';
            btnText.style.display = 'inline';
        }
    };

    // Init
    checkAuth();
    loadProperties();
    loadTotalViews();
    Bio()

}); // end DOMContentLoaded
