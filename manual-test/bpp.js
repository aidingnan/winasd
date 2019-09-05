const path = require('path')
const fs = require('fs')
const config = require('config')
const mkdirp = require('mkdirp')
const rimraf = require('rimraf')
const request = require('superagent')

if (!config.cloud.id) {
  const serial = fs.readFileSync('/run/cowroot/root/data/init/sn').toString().trim()

  if (/^0123[0-9a-f]{12}ee$/.test(serial)) {
    config.cloud.id = serial
    console.log(`set config.cloud.id to ${serial}`)
  } else {
    throw new Error(`invalid atecc serial ${serial}`)
  }
}

const homeDir = path.join(config.volume.cloud, config.cloud.domain, config.cloud.id)
const tmpDir = config.volume.tmp
const caData = config.cloud.caList[config.cloud.caIndex]
const deviceCert = path.join(homeDir, 'device.crt')
const caCert = path.join(homeDir, 'ca.crt')

rimraf.sync(tmpDir)
mkdirp.sync(tmpDir)
mkdirp.sync(homeDir)
fs.writeFileSync(caCert, caData)

const bpp = require('../src/ble-app')

