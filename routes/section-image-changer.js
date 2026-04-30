const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadDir = path.join(__dirname, '..', 'public', 'image')

const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, uploadDir)
	},
	filename: (req, file, cb) => {
		const ext = path.extname(file.originalname);
		const newName = `IMG_7296${ext}`;
		cb(null, newName)
	}
});

const format = '.jpg';
const upload = multer({storage,
	fileFilter: (req, res, cb) => {
		const ext = path.extname(file.originalname).toLowerCase();
		if (!ext.includes(format)) {
			return cb(new Error('File forbidden'))
		}
		cb(null, true);
	}
});

function sectionImageChanger(app) {
	app.post('/api/hero-uploader', upload.single('file'), (req, res) => {
		if (!req.file) {
			return res.status(403).json({error: 'no image uploaded'})
		}
		res.json({
			success: true,
			filename: req.file.filename,
			message: 'image uploaded'
		})
	});
}

module.exports = sectionImageChanger