const debug = require('debug')('ws:ble-pp')

const diskman = require('./components/diskman')
const ownership = require('./components/ownership')
const ble = require('./components/ble')
const localAuth = require('./components/local-auth')
const connectWifiAndBind = require('./actions/connect-wifi-and-bind')
const connectWifi = require('./actions/connect-wifi')

/**
This is a mediator pattern.

ble-app listens to ble message and dispatch actions accordingly.

the action may be fulfilled by local-auth (6xx) or actions (7xx) modules respectively.

it also listens to disconnect event from ble, and cancel challenge in local-auth.

it also listens to diskman and ownership module, and update ble's advertisements.

The purpose is:

remove inter-dependency between ble and other modules.
let those modules have no knowedge of the existence of ble.
*/
let oldSata = 0x00
diskman.on('status', status => {
  debug('sata status', status)
  if (status !== oldSata) {
    ble.updateSataState(status)
    oldSata = status
  }
})

let oldBound = 0x00
ownership.on('cache', cache => {
  debug('owner cache', cache ? cache.id : null)
  const newBound = cache ? 0x02 : 0x01
  if (newBound !== oldBound) {
    ble.updateBoundState(newBound)
    oldBound = newBound
  }
})

ownership.on('owner', owner => {
  debug('owner', owner ? owner.id : null)
  const newBound = owner ? 0x02 : 0x01
  if (newBound !== oldBound) {
    ble.updateBoundState(newBound)
    oldBound = newBound
  }
})

ble.useAuth(localAuth.verify.bind(localAuth))

ble.on('disconnected', () => {
  debug('ble disconnected')
  localAuth.stop()
})

// req: { action: 'req', seq: 1 , body: {} }
// res: { error, data, seq }
ble.on('message', msg => {
  if (msg.charUUID === '60000003-0182-406c-9221-0a6680bd0943') {
    switch (msg.action) {
      case 'req': 
        localAuth.request((err, data) => {
          let packet = { seq: msg.seq }
          if (err) {
            packet.error = err
          } else {
            packet.data = data
          }
          ble.send('60000002-0182-406c-9221-0a6680bd0943', packet)
        }) 
        break
      case 'auth':
        localAuth.auth(msg.body, (err, data) => {
          let packet = { seq: msg.seq }
          if (err) {
            packet.error = err
          } else {
            packet.data = data
          }
          ble.send('60000002-0182-406c-9221-0a6680bd0943', packet)
        }) 
        break
      default:
        break
    }
  } else if (msg.charUUID === '70000003-0182-406c-9221-0a6680bd0943') {
    switch (msg.action) {
      case 'addAndActive':
        connectWifi(msg.body.ssid, msg.body.pwd, (err, data) => {
          let packet = { seq: msg.seq }  
          if (err) {
            packet.error = err
          } else {
            packet.data = data
          }
          ble.send('70000002-0182-406c-9221-0a6680bd0943', packet)
        })
        break
      case 'addAndActiveAndBound':
        connectWifiAndBind(msg.body.ssid, msg.body.pwd, msg.body.encrypted, res => {
          let packet = { seq: msg.seq }
          if (res instanceof Error) {
            packet.error = res
          } else {
            packet.data = res
          }
          ble.send('70000002-0182-406c-9221-0a6680bd0943', packet)
        })
        break

      // TODO enforce rules ???
      // this is triggered on checking stage
      case 'format':         
        diskman.format(err => {
          let packet = { seq: msg.seq } 
          if (err) {
            packet.error = err
          } else {
            packet.data = res
          }
          ble.send('70000002-0182-406c-9221-0a6680bd0943', packet)
        })
        break
      default:
        // TODO error ?
        break
    }
  }
})

// This module has no exports
