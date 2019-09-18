const child = require('child_process')
const os = require('os')
const readline = require('readline')

const strip = require('strip-ansi')

const iwfind = require('../lib/iwfind')
const watson = require('../components/watson')

const logE = err => {
  const { message, code, reason, bssid, status } = err
  console.log('connect-wifi:', { message, code, reason, bssid, status })
}

const logD = data => console.log('connect-wifi:', data)

/**
each Error object has
1. code, set to EWIFI
2. reason,
3. message
4. bssid (optional)
5. status (optional)
*/

/**
ssid: string
password: string
callback(err, null)
*/
const connect = (ssid, password, callback) => {
  console.log(`scan wifi and find ${ssid}`)

  iwfind('wlan0', ssid, 3, (err, found) => {
    if (err) {

      console.log('iwfind error', err.message)

      err.code = 'EWIFI'
      err.reason = 'EINTERNAL'
      callback(err)
      logE(err)
    } else if (!found) {

      console.log(`No network with SSID '${ssid}' found`)

      const err = new Error(`No network with SSID '${ssid}' found`)
      err.code = 'EWIFI'
      err.reason = 'ENOTFOUND'
      callback(err)
      logE(err)
    } else {

      console.log(`nmcli connecting wifi ${ssid}`)

      const wpa = child.spawn('journalctl', ['-u', 'wpa_supplicant', '-f'])
      const rl = readline.createInterface({ input: wpa.stdout })
      let assocRej = null
      rl.on('line', l => {
        if (l.includes('wlan0: CTRL-EVENT-ASSOC-REJECT')) {
          const xs = l.trim().split(' ').map(phr => phr.trim()).filter(phr => phr.startsWith('bssid=') || phr.startsWith('status_code'))
          if (xs.length !== 2) return
          assocRej = {
            bssid: xs[0].slice('bssid='.length),
            status: parseInt(xs[1].slice('status_code='.length))
          }
        }
      })

      const nmcli = child.exec(`nmcli d wifi connect ${ssid} password ${password}`, 
        (err, stdout, stderr) => {
          if (err) {

            console.log(`nmcli connect wifi failed`, err.mesage)

            err.code = 'EWIFI'
            err.reason = 'EINTERNAL'
            callback(err)
            logE(err)
          } else {

            /** 
            nmcli exits with exitCode 0 and signalCode null even in error
            Device 'wlp2s0' successfully activated with '68d5ccc1-f9f0-45c4-82b2-a22fe9ddb518'.
            */

            /*
            console.log(`nmcli connect wifi succeeded`)
            console.log('------ stdout ------')
            console.log(strip(stdout.toString()))
            console.log('------ stderr ------')
            console.log(strip(stderr.toString()))    
            console.log('------ nmcli ------')
            console.log(nmcli)
            */

            const first = strip(stdout.toString()).split('\n')[0]

            if (!first.includes('successfully activated')) {

              const err = new Error(first)
              err.code = 'EWIFI'
              if (assocRej) {
                err.reason = 'EASSOCREJ'
                Object.assign(err, assocRej)
              } else {
                err.reason = 'EFAIL'
              }

              callback(err)
              logE(err)
            } else {

              // dns is available after nmcli finishes.
              // restart timesyncd to force ntp update immediately
              // child.exec('systemctl restart systemd-timesyncd.service', () => {})
              // sync file system
              child.exec('sync', () => {})
              setTimeout(() => child.exec('sync', () => {}), 3 * 1000)

              let data = { address: '0.0.0.0' }
              const wlan0 = os.networkInterfaces().wlan0
              const ip = wlan0 && wlan0.find(x => x.family === 'IPv4')
              if (ip) {
                const { address, netmask, mac, cidr } = ip
                data = { address, netmask, mac, prefix: cidr.split('/')[1] }
              }

              callback(null, data)
              logD(data)
            }
          }
        })
    }
  })
}

module.exports = connect
