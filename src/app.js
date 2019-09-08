// change current working directory
const path = require('path')
process.chdir(path.dirname(__dirname))

const ble = require('./components/ble')
const device = require('./components/device')
const led = require('./components/led')

device.once('ready', () => {
  require('./ble-app')

  const diskman = require('./components/diskman')
  diskman.once('mounted', () => {
    require('./http-app')
    require('./components/responder')
  })
})

