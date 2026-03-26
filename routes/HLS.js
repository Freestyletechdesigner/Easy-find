const multer = require('multer');
const fs = require('fs');
const path = require('path');
const {check, validationResult} = require('express-validator');
const { error } = require('console');

const upload = multer()
const HLS_File = path.join(__dirname, '..', 'database', 'HLS.json');

const HSLAPI = (app) => {

    //Route
    app.get('/api/HLS', (req, res) => {

        try {
          const data = JSON.parse(fs.readFileSync(HLS_File, null, 2));
          res.json({
            success: true,
            soldResult: data.soldCount
          })
        } catch(err) {
            console.error(err)
          res.json({
            success: false,
            error: 'Error'
          })
        }
    })

    //form
    app.post('/api/HLS', upload.none(), [
        check('sold').trim().escape()
    ], (req, res) => {

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            res.status(403).json({
                success: false,
                error: 'Error'
            })
        }

        const sold = req.body.sold;

        let data = JSON.parse(fs.readFileSync(HLS_File, 'utf8'));
        data.soldCount = data.soldCount + Number(sold);

        fs.writeFileSync(HLS_File, JSON.stringify(data, null, 2));

        res.json({
            success: true,
            soldResult: data.soldCount
        });
    })
}

module.exports = HSLAPI;