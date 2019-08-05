const Config = require('config')
const initEcc = require('./lib/atecc')

let index = process.argv.findIndex(x => x === '--code')
if (index === -1 || index === process.argv.length - 1) {
  console.log('usage: node src/bpp.js --code xxxx')
  process.exit(1)
}

const code = process.argv[index + 1]
if (!code || !code.length || code.length > 128) {
  console.log('invalid code')
  process.exit(1)
}

initEcc(Config.ecc.bus, (err, ecc) => {
  if (err) throw err
  ecc.preset(err => {
    if (err) throw err
    ecc.serialNumber({}, (err, sn) => {
      if (err) throw err
      if (!/^0123[0-9a-f]{12}ee$/.test(sn)) {
        console.log('bad sn')
        process.exit(1)
      } else {
        ecc.genCsr({
          o: 'Shanghai Dingnan Co., Ltd.',
          cn: 'IntelliDrive',
          ou: code,
          serialNumber: sn
        }, (err, der) => {
          if (err) throw err
          let b64 = der.toString('base64')
          let ls = []
          while (b64.length > 64) {
            ls.push(b64.slice(0, 64))
            b64 = b64.slice(64)
          }
          ls.push(b64)
          ls.unshift('-----BEGIN CERTIFICATE REQUEST-----')
          ls.push('-----END CERTIFICATE REQUEST-----')
          console.log(ls.map(l => l + '\n').join(''))
        })
      }
    })
  })
})

