const debug = require('debug')('ws:ble-pp')

const diskman = require('./components/diskman')
const ble = require('./components/ble')
const localAuth = require('./components/local-auth')

let ownership, connectWifi, connectWifiAndBind

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

diskman.once('mounted', () => {
  ownership = require('./components/ownership')

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

  connectWifiAndBind = require('./actions/connect-wifi-and-bind')
  connectWifi = require('./actions/connect-wifi')
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
          const packet = { seq: msg.seq }
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
          const packet = { seq: msg.seq }
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
        // TODO
        connectWifi(msg.body.ssid, msg.body.pwd, (err, data) => {
          const packet = { seq: msg.seq }
          if (err) {
            packet.error = err
          } else {
            packet.data = data
          }
          ble.send('70000002-0182-406c-9221-0a6680bd0943', packet)
        })
        break
      case 'addAndActiveAndBound':
        // TODO
        connectWifiAndBind(msg.body.ssid, msg.body.pwd, msg.body.encrypted, res => {
          const packet = { seq: msg.seq }
          if (res instanceof Error) {
            packet.error = res
          } else {
            Object.assign(packet, res)
          }
          ble.send('70000002-0182-406c-9221-0a6680bd0943', packet)
        })
        break

      // TODO enforce rules ???
      // this is triggered on checking stage
      case 'format':
        diskman.format(err => {
          const packet = { seq: msg.seq }
          if (err) {
            packet.error = err
          } else {
            packet.data = null
          }

          console.log('format reply', packet)

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
