const watson = require('../src/components/watson')

watson.on('healthy', healthy => {
})

watson.on('update', () => {
  console.log(watson.report())
})
