const commands = require('./commands')
const localAuth = require('./localAuth')
const bled = require('./bled')

bled.on('message', msg => {
  if (msg.charUUID === '70000003-0182-406c-9221-0a6680bd0943') {
    switch (msg.action) {
    
    }
  } else if (msg.charUUID === '70000003-0182-406c-9221-0a6680bd0943') {
    switch (msg.action) {
      case 'addAndActive': {
          addAndActive()
        }
        break
      case 'addAndActiveAndBound': {
          addAndActiveAndBound()
        }
        break
      case 'cleanVolume': {
          cleanVolume()
        }
        break
      default:
        break
    }
})
