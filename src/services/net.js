const os = require('os')
const child = require('child_process')
const readline = require('readline')
const debug = require('debug')('ws:net')

class Network extends require('events') {
  constructor () {
    super()
    this.startMonitor()
    this.info = {}
    this.state = 'unknown'
    this.nm_state = 'unknown'
    this.conn_state = 'unknown'
    child.exec('systemctl  restart NetworkManager', () => {})
  }

  startMonitor () {
    this.monitor = child.spawn('nmcli', ['monitor'])
    this.readline = readline.createInterface({ input: this.monitor.stdout })
    this.readline.on('close', () => {
      debug('monitor closed')
    })
    this.readline.on('line', this.parseMessage.bind(this))
  }

  parseMessage (message) {
    clearTimeout(this.refreshTimer)
    this.refreshTimer = setTimeout(() => this.refreshInfo(), 1500) // debounce
    message = message.toString().trim()
    if (!message) return
    const ms = message.split(': ')
    if (ms.length === 1) {
      const msgs = ms[0].split("'")
      if (ms[0].startsWith('Networkmanager is now in the') && msgs.length === 3) {
        this.nm_state = msgs[1].trim()
        if (this.nm_state === 'connected') {
          this.state = 'Connected'
          this.emit('connected')
        } else {
          this.state = 'Disconnected'
        }
        this.emit('NM_STATE_CHANGE', this.nm_state)
      } else if (ms[0].startsWith('Connectivity is now') && msgs.length === 3) {
        this.conn_state = msgs[1].trim()
        this.emit('CONN_STATE_CHANGE', this.conn_state)
      }
    } else if (ms.length === '2') {
      // TODO
    }
  }

  refreshInfo () {
    if (this.refreshing) {
      this.pending = true
      return
    }
    this.refreshing = true
    this.pending = false
    child.exec('nmcli d show wlan0', (err, stdout, stderr) => {
      this.refreshing = false
      if (err || stderr) console.log('network info refresh failed')
      else {
        const info = {}
        stdout.toString()
          .split('\n')
          .forEach(x => {
            const arr = x.split(': ')
            if (arr.length !== 2) return
            switch (arr[0]) {
              case 'GENERAL.DEVICE':
                info.device = arr[1].trim()
                break
              case 'GENERAL.TYPE':
                info.type = arr[1].trim()
                break
              case 'GENERAL.HWADDR':
                info.HwAddress = arr[1].trim()
                break
              case 'GENERAL.MTU':
                info.mtu = arr[1].trim()
                break
              case 'GENERAL.STATE':
                info.state = arr[1].trim()
                break
              case 'GENERAL.CONNECTION':
                info.Ssid = arr[1].trim()
                break
              case 'IP4.ADDRESS[1]':
                info.address = arr[1].trim()
                break
              case 'IP4.GATEWAY':
                info.gateway = arr[1].trim()
                break
              default:
                break
            }
          })
        this.info = info
      }
      if (this.pending) {
        this.refreshInfo()
      }
    })
  }

  destroy () {
    clearTimeout(this.refreshTimer)
    if (this.monitor && !this.monitor.killed) this.monitor.kill()
    if (this.readline) this.readline.close()
    this.pending = false
    this.refreshing = false
    this.monitor = undefined
    this.readline = undefined
  }

  connect (ssid, password, callback) {
    if (this.connecting) {
      return process.nextTick(() => callback(Object.assign(new Error('race'), { code: 'ERACE' })))
    }
    this.connecting = true
    let timeout = false
    const timer = setTimeout(() => {
      timeout = true
      this.connecting = false
      callback(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' }))
    }, 30 * 1000)
    child.exec(`nmcli d wifi list && nmcli d wifi connect ${ssid} password ${password}`, (err, stdout, stderr) => {
      if (timeout) return
      clearTimeout(timer)
      this.connecting = false
      if (stderr) {
        if (stderr.toString().includes('No network with SSID')) {
          return callback(Object.assign(new Error('SSID not found', { code: 'ENOSSID' })))
        } else if (stderr.toString().includes('Secrets were required')) {
          return callback(Object.assign(new Error('SSID not found', { code: 'EPASSWORD' })))
        }
        return callback(new Error(stderr))
      }
      if (err) {
        return callback(err)
      }
      if (stdout && stdout.toString().includes('successfully activated with')) {
        const iface = os.networkInterfaces()['wlan0']
          .find(x => x.family === 'IPv4' && x.address && x.cidr)
        if (!iface) return callback(Object.assign(new Error('iface not found'), { code: 'EIFACE' }))
        const prefix = iface.cidr.split('/')[1]
        return callback(null, { address: iface.address, prefix })
      }
      return callback(new Error('unknown error'))
    })
  }

  devices () {
    return []
  }

  view () {
    return this.info
  }
}

module.exports = Network
