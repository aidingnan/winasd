const watson = require('../src/components/watson')

watson.on('healthy', healthy => {
  console.log('healthy', healthy)
})
