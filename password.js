const bcrypt = require('bcrypt');

(async () => {
	const hashPassword = await bcrypt.hash('freeman419', 10)
	console.log(hashPassword)
})()