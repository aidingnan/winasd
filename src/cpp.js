// change current working directory
const path = require('path')
process.chdir(path.dirname(__dirname))

const ble = require('./components/ble')
const device = require('./components/device')
device.once('ready', () => {
  require('./ble-app')
  require('./http-app')
  require('./components/responder')
})

device.on('error', () => {
})

