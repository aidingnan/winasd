const Config = require('config')
const initEcc = require('./lib/atecc')

let index = process.argv.findIndex(x => x === '--code')
if (index == -1) throw new Error('--code required')

if (process.argv < index + 2) throw new Error('code must be provided')

const code = process.argv[index + 1]

if (!code || !code.length) throw new Error('invaild code')


initEcc(Config.ecc.bus, (err, ecc) => {
  if (err) throw err
  ecc.preset(e => {
    if (e) throw e
    ecc.serialNumber({}, (err, sn) => {
      if (err) throw err
      ecc.genCsr({ o: 'Shanghai Dingnan Co., Ltd.', cn: 'PocketDrive', serialNumber: sn, ou: code }, (err, der) => {
        if (err) throw err
        let pem = '-----BEGIN CERTIFICATE REQUEST-----\n'
              + der.toString('base64') + '\n'
              + '-----END CERTIFICATE REQUEST-----\n'
        console.log(pem)
      })
    })
  })
})