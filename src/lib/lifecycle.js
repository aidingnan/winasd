const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const child = require('child_process')
const Config = require('config')
const request = require('superagent')
const UUID = require('uuid')

const certFolder = path.join(Config.volume.cloud, Config.cloud.domain, Config.cloud.id)
const tmpDir = Config.volume.tmp

// const storageConf = Config.get('storage')
// const certFolder = storageConf.dirs.certDir
// const tmpDir = storageConf.dirs.tmpDir
const pkeyName = 'device.key'

const createSignature = (ecc, op, volume, callback) => {
  let raw
  if (Config.system.withoutEcc) {
    let signature, raw = JSON.stringify({
      lifecycle: 'fack device....',
      op,
      volume
    })
    try {
      let sign = crypto.createSign('SHA256')
      sign.write(raw)
      sign.end()
      signature = sign.sign(fs.readFileSync(path.join(certFolder, pkeyName)), 'hex')
      return callback(null, { signature, raw })
    } catch(e) {
      return callback(e)
    }
  } else {
    readCounter(ecc, (err, count) => {
      if (err) return callback(err)
      raw = JSON.stringify({
        lifecycle: count,
        op,
        volume
      })
      ecc.sign({ data:raw }, (err, sig) => {
        if (err) return callback(err)
        callback(null, { signature: sig.toString('hex'), raw })
      })
    })
  }
}

module.exports.createSignature = createSignature

module.exports.reqUnbind = (ecc, encrypted, token, callback) => {
  let volume = UUID.v4()
  createSignature(ecc, 'unbind', volume, (err, data) => {
    if (err) return callback(err)
    let { signature, raw } = data
    request.post(`${ Config.pipe.baseURL }/s/v1/station/unbind`)
      .send({ signature, encrypted, raw })
      .set('Authorization', token)
      .then(res => {
        callback(null, res.body, volume)
      }, error => {
        callback(error)
      })
  })
}

module.exports.reqBind = (ecc, encrypted, token, callback) => {
  let volume = UUID.v4()
  createSignature(ecc, 'bind', volume, (err, data) => {
    if (err) return callback(err)
    let { signature, raw } = data
    request.post(`${ Config.pipe.baseURL }/s/v1/station/bind`)
      .send({ signature, encrypted, raw })
      .set('Authorization', token)
      .then(res => {
        callback(null, res.body, volume)
      }, error => {
        callback(error)
      })
  })
}

/*
callback: (err, verified, fulfilled) => {}
*/
module.exports.verify = (ecc, signature, raw, callback) => {
  if (!ecc || !signature || !raw) {
    return callback(new Error('invalid args'))
  }
  ecc.verify({
    data: raw,
    signature: Buffer.from(signature, 'hex')
  }, (err, data) => {
    if (err) return callback(err)
    if (!data) return callback(null, false)
    try {
      raw = JSON.parse(raw)
    }catch(e) {
      return callback(null, false)
    }
    readCounter(ecc, (err, count) => {
      if (err) return callback(err)
      // record counter in cloud while do binding or unbinding
      // if current counter equal to cloud, that means not fulfilled
      // else fulfilled
      if (raw.lifecycle === count) {
        callback(null, true, false)  // not fulfilled
      } else if (raw.lifecycle === count - 1) {
        callback(null, true, true) // fulfilled 
      } else {
        callback(null, false)
      }
    })
  })
}

const refresh = (ecc, callback) => {
  ecc.incCounter({}, callback)
}

const readCounter = (ecc, callback) => {
  ecc.readCounter({}, callback)
}

module.exports.refresh = refresh
