const request = require('superagent')
const fs = require('fs')
const path = require('path')
const mkdirp = require('mkdirp')
const rimraf = require('rimraf')
const State = require('../lib/state')
const child = require('child_process')
const Device = require('aws-iot-device-sdk').device
const UUID = require('uuid')
const Config = require('config')

const Client = require('../lib/mqttClient')
const awsCA = require('../lib/awsCA')
const awsCA_RSA = require('../lib/awsCA-RSA')

const storageConf = Config.get('storage')
const provisionConf = Config.get('provision')
const iotConf = Config.get('iot')

const certFolder = storageConf.dirs.certDir
const crtName = storageConf.files.cert
const csrName = storageConf.files.csr
const pkeyName = 'device.key'
const pubKName = 'device.pub'
const snName = 'deviceSN'
const caName = storageConf.files.caCert

// For not ecc device , test environment
const deviceSN = () => process.env.NODE_ENV.startsWith('test') ? 'test_' + UUID.v4().slice(5) : UUID.v4()

class Failed extends State {
  enter(err) {
    this.err = err
    console.log('PROVISION FAILED:', err)
    this.timer = setTimeout(() => {
      this.setState('PreBuild')
    }, 5000)
  }

  exit() {
    clearTimeout(this.timer)
  }
}

class Finished extends State {
  enter() {
    console.log('PROVISION FINISHED')
  }
}

class PreBuild extends State {

  enter() {
    let F = Config.system.withoutEcc ? this.createCsrWithOpenSSL : this.createCsr
    F.bind(this)(err => {
      if (err) return this.setState('Failed', err)
      this.setState('Provisioning')
    })
  }

  // create csr/pkey use software openssl
  createCsrWithOpenSSL(callback) {
    fs.lstat(path.join(certFolder, crtName), err => {
      if (err) {
        rimraf(certFolder, err => {
          if (err) return callback(err)
          mkdirp(certFolder, err => {
            if (err) return callback(err)
            try {
              child.execSync(`openssl genrsa 2048 > ${ path.join(certFolder, pkeyName)}`)
              child.execSync(`openssl rsa -in ${ path.join(certFolder, pkeyName)} -pubout > ${ path.join(certFolder, pubKName)}`)
              child.execSync(`openssl req -new -subj "/C=CN/CN=abc/O=wisnuc" -key ${ path.join(certFolder, pkeyName)} > ${ path.join(certFolder, csrName)}`)
              this.ctx.sn = deviceSN()
              fs.writeFileSync(path.join(certFolder, snName), this.ctx.sn)
              fs.writeFileSync(path.join(certFolder, caName), awsCA_RSA)
            }
            catch(e) {
              callback(e)
            }
            callback(null)
          })
        })
      } else {
        callback(null)
      }
    })
  }

  // create csr use hardware atecc508/608
  createCsr(callback) {
    mkdirp(certFolder, err => {      
      if (err) return callback(err)
      this.ctx.ctx.ecc.genCsr({ o: 'wisnuc', cn: 'xxoxxo'}, (err, der) => {
        if (err) return callback(err)
        let pem = '-----BEGIN CERTIFICATE REQUEST-----\n'
              + der.toString('base64') + '\n'
              + '-----END CERTIFICATE REQUEST-----\n'
        try {
          rimraf.sync(path.join(certFolder, csrName))
          rimraf.sync(path.join(certFolder, caName))
          fs.writeFileSync(path.join(certFolder, csrName), pem)
          fs.writeFileSync(path.join(certFolder, caName), awsCA)
          this.ctx.sn = this.ctx.ctx.deviceSN // test / release mode switch
          fs.writeFileSync(path.join(certFolder, snName), this.ctx.sn)
          return callback(null)
        } catch(e) {
          return callback(e)
        }
      })
    })
  }
}

class Provisioning extends State {
  enter() {
    let csrPath = path.join(certFolder, csrName)
    let crtPath = path.join(certFolder, crtName)
    this.req = request
      .post(provisionConf.address + '/sign')
      .send({
        csr: fs.readFileSync(csrPath).toString(),
        type: process.env.NODE_ENV.startsWith('test') ? 'test' : 'production',
        sn: this.ctx.sn
      })
    this.req
      .then(res => {
        if (!res.ok) {
          this.setState('Failed', new Error('Provisioning Error'))
        } else {
          fs.writeFile(crtPath, res.body.certPem, err => {
            if(err) return this.setState('Failed', err)
            this.setState('ConnectTest')
          })
        }
      },err => this.setState('Failed', err))
  }

  exit() {
    if (this.req) this.req.abort()
  }
}

class Saveing extends State {
  enter() {
    let p = path.join(storageConf.roots.p, storageConf.files.provision)
    fs.writeFile(p, '1', err => {
      if (err) return this.setState('Failed', err)
      this.setState('Finished')
    })
  }

}

// TODO: use telsa
class ConnectTest extends State {
  enter () {
    this.ctx.withoutEcc ? this.fakeTest(err => {
      let nextState = err ? 'Failed': 'Saveing'
      this.setState(nextState, err)
    }) : this.realTest(err => {
      let nextState = err ? 'Failed': 'Saveing'
      this.setState(nextState, err)
    })
  }

  fakeTest(callback) {
    let finished = false
    let cb = (err) => {
      if (finished) return
      finished = true
      this.device.removeAllListeners()
      this.device.on('error', () => {})
      setTimeout(() => {
        this.device.end()
        this.device = undefined
        callback(err)
      }, 1000) // fix aws error
    }
    this.device = new Device({
      keyPath: path.join(certFolder, pkeyName),
      certPath: path.join(certFolder, crtName),
      caPath: path.join(certFolder, caName),
      clientId: this.ctx.sn,
      host: iotConf.endpoint,
    })
    this.device.on('connect', () => cb())
    this.device.on('error', cb)
  }

  // use atecc and telas
  realTest(callback) {
    let finished = false
    let cb = (err) => {
      if (finished) return
      finished = true
      this.device.removeAllListeners()
      this.device.on('error', () => {})
      setTimeout(() => {
        this.device.end()
        this.device = undefined
        callback(err)
      }, 1000) // fix aws error
    }
    this.device = new Client({
      clientCertificates: [
        Buffer.from(fs.readFileSync(path.join(certFolder, crtName))
          .toString()
          .split('\n')
          .filter(x => !!x && !x.startsWith('--'))
          .join(''), 'base64')
      ],
      caPath: fs.readFileSync(path.join(certFolder, caName)).toString().replace(/\r\n/g, '\n'),
      clientId: this.ctx.sn,
      host: iotConf.endpoint,
      clientPrivateKey: (data, callback) =>
        this.ctx.ctx.ecc.sign({ data, der: true }, callback),
      clientCertificateVerifier: {
        algorithm: '',
        sign: ''
      }
    })
    this.device.on('connect', () => cb())
    this.device.on('error', cb)
  }

  exit() {
    if (this.device) {
      this.device.removeAllListeners()
      this.device.on('error', () => {})
      this.device.end()
    }
  }
}

/**
 * Provision 模块负责 出厂前的设备注册
 * 使用ecc生成的csr(证书签名请求)通过访问provision-proxy 注册到wisnuc 云服务
 * 并换取证书文件，并尝试连接一次AWS IoT
 */
class Provision extends require('events'){

  constructor(ctx) {
    super()
    this.ctx = ctx
    this.withoutEcc = Config.system.withoutEcc
    new PreBuild(this)
  }

  get status() {
    return this.state.constructor.name
  }

  destroy() {
    this.state.destroy()
  }
}

Provision.prototype.Failed = Failed
Provision.prototype.Finished = Finished
Provision.prototype.Provisioning = Provisioning
Provision.prototype.ConnectTest = ConnectTest
Provision.prototype.PreBuild = PreBuild
Provision.prototype.Saveing = Saveing

module.exports = Provision