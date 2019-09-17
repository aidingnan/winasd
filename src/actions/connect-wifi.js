const child = require('child_process')
const os = require('os')
const readline = require('readline')

const strip = require('strip-ansi')

const iwfind = require('../lib/iwfind')

// const device = require('../components/device')

// TODO error code

/**
ssid: string
password: string
callback(err, null)
*/
const connect = (ssid, password, callback) => {
  console.log(`scan wifi and find ${ssid}`)

  iwfind('wlan0', ssid, 3, (err, found) => {
    if (err || !found) {
      if (err) {
        console.log('iwfind error', err.message)
      } else {
        console.log(`${ssid} not found`)
      }

      const e = new Error('ssid not found')
      e.code = 'EWIFI'
      e.reason = 'ENOENT'
      callback(e)

    } else {
      console.log(`nmcli connect wifi ${ssid}`)

      const wpa = child.spawn('journalctl', ['-u', 'wpa_supplicant', '-f'])
      const rl = readline.createInterface({ input: wpa.stdout })
      rl.on('line', l => {
        if (l.includes('wlan0:')) console.log(l.trim())
      })

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
  })
}

module.exports = connect
