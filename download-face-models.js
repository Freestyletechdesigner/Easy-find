/**
 * download-face-models.js
 * Run ONCE before starting the server:
 *   node download-face-models.js
 *
 * Downloads @vladmandic/face-api model weights into ./face-models/
 *
 * Models downloaded:
 *   ssd_mobilenetv1   — face detector
 *   face_landmark_68  — 68 facial landmarks (for face alignment)
 *   face_recognition  — 128-dim face embeddings (identity vector)
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const MODELS_DIR = path.join(__dirname, 'face-models');

// @vladmandic/face-api uses single .bin weight files (not shards)
const BASE_URL = 'https://raw.githubusercontent.com/vladmandic/face-api/master/model';

const FILES = [
    // SSD MobileNet V1 — face detector
    'ssd_mobilenetv1_model-weights_manifest.json',
    'ssd_mobilenetv1_model.bin',

    // 68-point face landmark model
    'face_landmark_68_model-weights_manifest.json',
    'face_landmark_68_model.bin',

    // 128-dim face recognition / embedding model
    'face_recognition_model-weights_manifest.json',
    'face_recognition_model.bin',
];

function download(filename) {
    return new Promise((resolve, reject) => {
        const url  = `${BASE_URL}/${filename}`;
        const dest = path.join(MODELS_DIR, filename);

        if (fs.existsSync(dest)) {
            console.log(`  ✓ already exists: ${filename}`);
            return resolve();
        }

        const file = fs.createWriteStream(dest);
        console.log(`  ↓ downloading:    ${filename}`);

        const get = (targetUrl) => {
            https.get(targetUrl, (res) => {
                // Follow redirects
                if (res.statusCode === 301 || res.statusCode === 302) {
                    file.destroy();
                    return get(res.headers.location);
                }
                if (res.statusCode !== 200) {
                    file.destroy();
                    fs.unlink(dest, () => {});
                    return reject(new Error(`HTTP ${res.statusCode} for ${filename}`));
                }
                res.pipe(file);
                file.on('finish', () => file.close(resolve));
                file.on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
            }).on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
        };

        get(url);
    });
}

async function main() {
    if (!fs.existsSync(MODELS_DIR)) {
        fs.mkdirSync(MODELS_DIR, { recursive: true });
        console.log('Created directory:', MODELS_DIR);
    }

    // Delete any stale manifest files from the old (wrong) download attempt
    const staleFiles = [
        'ssd_mobilenetv1_model-shard1',
        'ssd_mobilenetv1_model-shard2',
        'face_landmark_68_model-shard1',
        'face_recognition_model-shard1',
        'face_recognition_model-shard2',
    ];
    for (const f of staleFiles) {
        const fp = path.join(MODELS_DIR, f);
        if (fs.existsSync(fp)) {
            fs.unlinkSync(fp);
            console.log(`  🗑  removed stale file: ${f}`);
        }
    }

    // The manifest JSONs already downloaded from the old attempt point to
    // "-shard1" paths — delete them so they get re-downloaded with correct content.
    const staleManifests = [
        'ssd_mobilenetv1_model-weights_manifest.json',
        'face_landmark_68_model-weights_manifest.json',
        'face_recognition_model-weights_manifest.json',
    ];
    for (const f of staleManifests) {
        const fp = path.join(MODELS_DIR, f);
        if (fs.existsSync(fp)) {
            fs.unlinkSync(fp);
            console.log(`  🗑  removed stale manifest: ${f}`);
        }
    }

    console.log('\nDownloading face-api model weights...\n');

    for (const file of FILES) {
        try {
            await download(file);
        } catch (err) {
            console.error(`\n✗ FAILED to download ${file}: ${err.message}`);
            console.error('Check your internet connection and try again.\n');
            process.exit(1);
        }
    }

    console.log('\n✅ All models downloaded to ./face-models/');
    console.log('You can now start the server.\n');
}

main();
