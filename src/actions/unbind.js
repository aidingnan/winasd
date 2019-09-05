const child = require('child_process')

const ownership = require('../components/ownership')
const winas = require('../components/winas')

//  if Unbind suceeded 
//  1. device module should clean device name and 
//  2. wait winas to stop
//  2. clean network manager files (this module, after return) except usb0.nmconnection
module.exports = (encrypted, cleanVolume, callback) => {
  ownership.unbind(encrypted, err => {
    if (err) {
      callback(err)
    } else {

      const polling = setInterval(() => {
        if (!ownership.owner && winas.getState() === 'Stopped') {
          
        }
      }, 1000)

      const timeout = setTimeout(r(() => {
        clearInterval(polling)
        callback(null, { 
          cleanVolume: 'failed'
        })
      }), 30)
    }
  })  
}
