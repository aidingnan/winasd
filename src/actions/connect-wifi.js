const child = require('child_process')
const os = require('os')
const strip = require('strip-ansi')
// const device = require('../components/device')

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

      let data = { address: '0.0.0.0' }
      const wlan0 = os.networkInterfaces().wlan0
      const ip = wlan0 && wlan0.find(x => x.family === 'IPv4')
      if (ip) {
        const { address, netmask, mac, cidr } = ip
        data = { address, netmask, mac, prefix: cidr.split('/')[1] }
      }
      callback(null, data)
    }
  })
}

module.exports = connect
