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