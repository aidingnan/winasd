const path = require('path')
const fs = require('fs')
const config = require('config')
const mkdirp = require('mkdirp')
const rimraf = require('rimraf')
const request = require('superagent')

if (!config.cloud.id) {
  const serial = fs.readFileSync('/run/cowroot/root/data/init/sn').toString().trim()

  if (/^0123[0-9a-f]{12}ee$/.test(serial)) {
    config.cloud.id = serial
    console.log(`set config.cloud.id to ${serial}`)
  } else {
    throw new Error(`invalid atecc serial ${serial}`)
  }
}

const homeDir = path.join(config.volume.cloud, config.cloud.domain, config.cloud.id)
const tmpDir = config.volume.tmp
const caData = config.cloud.caList[config.cloud.caIndex]
const deviceCert = path.join(homeDir, 'device.crt')
const caCert = path.join(homeDir, 'ca.crt')

rimraf.sync(tmpDir)
mkdirp.sync(tmpDir)
mkdirp.sync(homeDir)
fs.writeFileSync(caCert, caData)

const commands = require('../src/components/commands')

/**
commands.addAndActive('hello', 'wisnuc123456', (err, data) => {
  console.log(err || data)
})
*/

let encrypted
let token

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

        setTimeout(() => {
          commands
            .addAndActiveAndBound('Xiaomi_123_5G', 'wisnuc123456', encrypted, (err, data) => {
              console.log(err, data)
            })  
        }, 5000) 
      })
      .catch(e => console.log('failed to retrieve encrypted me', e))
  })
  .catch(e => console.log('failed to retrieve cloud token'))


