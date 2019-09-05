const channel = require('./channel')
const actions = require('./actions')

channel.on('pipe', data => {
  console.log(data)
})

/**
responder responds to cloud message, on behalf of winasd
*/



