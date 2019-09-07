const request = require('superagent')

let token, encrypted
request
  .get('https://aws-cn.aidingnan.com/c/v1/user/password/token')
  .query({ 
    username: '15618429080', 
    password: '6GeKongGe',
    clientId: '123456',
    type: 'pc'
  })  
  .then(res => {
    token = res.body.data.token
    console.log('token:', token)
    request
      .post('https://aws-cn.aidingnan.com/c/v1/user/encrypted')
      .set('Authorization', token)
      .then(res => { 
        encrypted = res.body.data.encrypted 
        console.log('encrypted:', encrypted)


      })
      .catch(e => console.log('failed to retrieve encrypted me', e))
  })
  .catch(e => console.log('failed to retrieve cloud token'))

const device = require('../src/components/device')

console.log('======')
console.log(device)
console.log('======')

device.on('ready', () => {

  console.log('0000000000000000000000000000000000000000000 device ready')

  const ownership = require('../src/components/ownership')

  console.log(ownership)

  ownership.on('StateEntering', state => console.log(state))

  let count = 0
  ownership.once('owner', owner => {
    if (owner === null) {
      ownership.bind(encrypted, (err, data) => {
        console.log('bind result', err, data) 
      })
    } else {
      ownership.unbind(encrypted, (err, data) => {
        console.log('unbind result', err, data)
      })
    }
  })
})

device.on('error', err => {
  console.log('device error', err)
})

