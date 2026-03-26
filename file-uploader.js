const multer = require('multer');
const fs = require('fs');
const path = require('path');

const storage = multer.diskStorage({
	destination: (req, file, cb) => cb(null, '/upload'),
	filename: (req, file, cb) => {
		const ext = path.extname(file.originaname);
		const newName = `pro_${ext}`;
		cb(null, newName)
	}
});

const upload = multer({storage});

function logicUploader(app) {
	app.post('/api/uploader', upload.single('file'), (req, res) => {
		if (!req.file) {
			return res.status(403).json({error: 'no file uploaded'})
		}
		res.json({
			succes: true,
			filename: req.file.filename
		})
	});
}

const formidable = require('formidable');
const path = require('path');
const fs = require('fs');

function sectionImageChanger(app) {
	app.post('/hero-uploader', (req, res) => {
		const form = new formidable.IncomingForm({
			uploadDir: path.join(__dirname, 'public', 'image'),
			keepExtensions: true,
			multiples: false
		});
		form.parse(req, (err, fields, files) => {
			if (err) {
				return res.status(500).json({ error: err.message });
			}
			let file = files.heroImage;

			if (Array.isArray(file)) file = file[0];

			if (!file) {
				return res.status(403).send('no file send');
			}

			const filename = file.originalFilename || file.newFilename ||'';
			if (!filename) return res.status(400).send('invalid file');
			
			const ext = path.extname(filename).toLowerCase();

			const allow = ['.jpeg', '.jpg', '.png', '.webp'];
			if (!allow.includes(ext)) {
				return res.status(400).send('image only')
			}

			const newName = `heroImage${ext}`;
			const newPath = path.join(__dirname, 'public', 'image', newName);

			fs.rename(file.filepath, newPath, (err) => {
				if (err) {
					return res.status(500).send('server error')
				}

			    res.json({
			    	success: true,
			    	filename: newName
			    });
			});
		});
	});
}

module.exports = sectionImageChanger;