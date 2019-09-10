const child = require('child_process')
const os = require('os')
const strip = require('strip-ansi')
const device = require('../components/device')

// TODO error code
// TODO nmcli list before connect, return ENOENT

/**
ssid: string
password: string
callback(err, null)
*/
const connect = (ssid, password, callback) => {
  console.log(`nmcli connect wifi ${ssid}`)

  child.exec(`nmcli d wifi connect ${ssid} password ${password}`, (err, stdout, stderr) => {
    if (err) {
      console.log(`nmcli connect wifi failed`)
      console.log(err.message)
      console.log(strip(stderr.toString().trim()))

      callback(err)
    } else {
      console.log(`nmcli connect wifi succeeded`)

      // dns is available after nmcli finishes.
      // restart timesyncd to force ntp update immediately
      child.exec('systemctl restart systemd-timesyncd.service', () => {})
      // sync file system
      child.exec('sync', () => {})
      callback(null, {
        sn: device.sn,
        // TODO who is going to maintain this?
        addr: ((
          wlan0 = os.networkInterfaces().wlan0,
          ip = wlan0 && wlan0.find(x => x.family === 'IPv4'),
          addr = ip ? ip.address : '0.0.0.0'
        ) => addr)()
      })
    }
  })
}

module.exports = connect
