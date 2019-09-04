const express = require('express')
const router = express.Router()

const ble = require('../components/ble')
const channel = require('../components/channel')
// const 
// const led = 
// net
// const upgrade = require('../components/upgrade')
const winas = require('../components/winas')
const ownership = require('../components/ownership')

/**
ble
channel
device
net
upgrade
winas
winasd
*/

router.get('/', (req, res) => {
  const info = {}

  info.ble = {
    state: 'state',
    address: 'address',
    info: 'info'
  }

  info.channel = {
    state: channel.state
  }
  
  info.device = {
    sn: config.cloud.id,
    usn: 'hello',
    version: '???',
    name: 'hello',
    model: 'hello',
    hostname: 'hello',
    rooted: false
  }

  info.net = {
    state: 70,
    addresses: [],
    detail: null
  }

  info.upgrade = {
    current: 'current version'
  }

  info.winas = { 
    state: winas.state,
    isBeta: false,
    users: []
  }

  info.winasd = {
    state: 'null'
  }
})

module.exports = router
