const ecc = require('../src/lib/atecc/atecc')

ecc.on('error', err => console.log(err))

ecc.serialNumber({}, (err, serial) => console.log(err || serial))


