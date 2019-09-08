const child = require('child_process')
const strip = require('strip-ansi')

// TODO error code
// TODO nmcli list before connect, return ENOENT

/**
ssid: string
password: string
callback(err, null)
*/
const connect = (ssid, password, callback) =>
  child.exec(`nmcli d wifi connect ${ssid} password ${password}`, (err, stdout, stderr) => {
    if (err) {
      const err = new Error(strip(stderr).toString().trim())
      callback(err)
    } else {
      child.exec('sync', () => {})
      callback(null)
    }
  })

module.exports = connect
