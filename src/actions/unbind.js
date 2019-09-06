const path = require('path')

const ownership = require('../components/ownership')
const winas = require('../components/winas')
const sata = require('../components/diskman')
const recycle = require('../components/dustman')

//  request cloud unbind first, if succeeds
module.exports = (encrypted, clean, callback) => {
  ownership.unbind(encrypted, err => {
    if (err) {
      callback(err)
    } else {
      if (!clean) return callback(null)

      const polling = setInterval(() => {
        if (ownership.owner === null && winas.getState() === 'Stopped') {
          clearTimeout(timeout)
          clearInterval(polling)

          const winasDir = path.join(sata.mountpoint, 'winas')
          recycle(winasDir, err => {
            callback(null, { clean: err ? 'failed' : 'succeeded' })
            callback = () => {}
          })

          setTimeout(() => {
            callback(null, { clean: 'progressing' })
            callback = () => {}
          }, 30 * 1000)
        }
      }, 1000)

      const timeout = setTimeout(() => {
        clearInterval(polling)
        callback(null, { clean: 'timeout' })
      }, 30 * 1000)
    }
  })
}
