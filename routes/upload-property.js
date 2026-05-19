const multer = require('multer');
const fs = require('fs');
const path = require('path');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let folderName = req.body.folder;

        if (!folderName) {
            return cb(new Error('Folder name reqired'))
        }

        folderName = folderName.replace(/[^a-zA-Z0-9_-]/g, "");

        const uploadDir = path.join(__dirname, '..', 'public', folderName);
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true })
        }

        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const name = path.basename(file.originalname, ext);
        cb(null, `${name}${ext}`);
    }
});

const forbidden = ['.exe', '.bat', '.cmd'];

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (forbidden.includes(ext)) {
            return cb(new Error('File forbidden'));
        }
        cb(null, true);
    }
});

module.exports = function uploadnewP(app) {
    // Fix 7: requireAdmin middleware defined inside the module function
    function requireAdmin(req, res, next) {
        if (!req.session.admin) {
            return res.status(403).json({ success: false, message: 'Admin authentication required' });
        }
        next();
    }

    app.post('/api/files-uploader', requireAdmin, upload.array('files'), (req, res) => {
        if (!req.files || req.files.length === 0) {
            return res.status(403).json({ error: 'No file uploaded' });
        }

        res.json({
            success: true,
            message: 'File uploaded',
            files: req.files.map(f => f.filename)
        });
    });
};