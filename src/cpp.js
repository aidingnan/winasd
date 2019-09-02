// change current working directory
const path = require('path')
process.chdir(path.dirname(__dirname))

const config = require('config') 

const bled = require('./components/bled')
const ecc = require('../lib/atecc/atecc')
const led = require('./components/led')
const sata = require('./components/sata')
const nm = require('./components/nm')
const http = require('./components/http')
const localAuth = require('./components/localAuth')
const owner = require('./components/owner')

// prepare dirs and local constants
const initDirs = callback => {
  // set LED 
}

ecc.on('error', () => {
  // set LED
})

sata.on('statusUpdate', status => {
  // set LED
})
  
