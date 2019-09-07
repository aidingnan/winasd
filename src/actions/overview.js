const nm = require('../components/nm')
const ble = require('../components/ble')
const upgrade = require('../components/upgrade')
const winas = require('../components/winas')
const channel = require('../components/channel')
const ownership = require('../components/ownership')
const device = require('../components/device')

// return an full view
module.exports = callback => process.nextTick(() =>
  callback(null, {
    net: nm.view(),
    ble: ble.view(),
    upgrade: upgrade.view(),
    winas: winas.view(),
    channel: channel.view(),
    device: {
      sn: device.sn,
      usn: device.usn,
      version: device.version,
      model: device.model,
      hostname: device.hostname,
      name: ownership.displayName,
      rooted: ownership.rooted
    },
    winasd: {
      state: ownership.owner
        ? 'Bound'
        : ownership.owner === null
          ? 'Unbound'
          : ownership.cache
            ? 'Bound'
            : ownership.cache === null
              ? 'Unbound'
              : 'Pending'
    }
  }))
