const child = require('child_process')
const camelCase = require('camelcase')

// TODO more option? time format
// TODO more opts check and default
module.exports = (opts, callback) => {
  if (typeof opts === 'function') {
    callback = opts
    opts = { camel: false }
  }

  child.exec('timedatectl', (err, stdout, stderr) => {
    if (err) {
      callback(err)
    } else {
      const timedate = stdout
        .toString()
        .split('\n')
        .filter(l => l.length)
        .reduce((prev, curr) => {
          const pair = curr.split(': ').map(str => str.trim())
          if (opts.camel) {
            prev[camelCase(pair[0])] = pair[1]
          } else {
            prev[pair[0]] = pair[1]
          }
          return prev
        }, {})

      callback(null, timedate)
    }
  })
}
