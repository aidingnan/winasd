const os = require('os')
const net = require('net')
const fs = require('fs')
const path = require('path')
const child = require('child_process')

const Config = require('config')
const UUID = require('uuid')

const deviceNameP = path.join(Config.storage.dirs.device, Config.storage.files.deviceName)

// default device name
const DEVICE_NAME = 'PocketDrive'

/**
 * return ip for given type, type contain in `['lanip', 'linklocal']`
 * @param {string} type - `lanip/linklocal`
 */
const NetworkAddr = (type) => {
  let interfaces = os.networkInterfaces()
    
  let keys = Object.keys(interfaces).filter(k => !!k && k !== 'lo'&& interfaces[k].length)
  if (!keys.length) return 

  if (type === 'lanip') {
    for (let i = 0; i < keys.length; i++) {
      let iface = interfaces[keys[i]].find(x => x.family === 'IPv4' && !x.address.startsWith('169.254'))
      if (iface) {
        return iface.address
      }
    }
  } else if (type === 'linklocal') {
    for (let i = 0; i < keys.length; i++) {
      let iface = interfaces[keys[i]].find(x => x.family === 'IPv4' && x.address.startsWith('169.254'))
      if (iface) {
        return iface.address
      }
    }
  }
}

const deviceName = () => {
  let name = DEVICE_NAME
  try {
    name = fs.readFileSync(deviceNameP).toString().trim()
  } catch(e) {}
  return name
}

const TMPFILE = () => {
  return path.join(Config.storage.dirs.tmpDir, UUID.v4())
}

const setDeviceName = (name, callback) => {
  let tmpfile = TMPFILE()
  if (!name || !name.length)
    return process.nextTick(() => callback(null, null))
  fs.writeFile(tmpfile, name, err => {
    if (err) return callback(err)
    fs.rename(tmpfile, deviceNameP, err => 
      err ? callback(err) 
        : callback(null, null))
  })
}

const hardwareInfo = () => {
  return {
    ecc: 'microchip',
    sn: deviceSN(),
    fingerprint: 'ea3e82ef-8c44-4771-a696-2dd432203345',
    cert: 'f0af3d0c-cea3-401e-9f3a-513d25717c16',
    signer: 'Wisnuc Inc.',
    notBefore: 1543561560133,
    notAfter: 1859180920786,
    bleAddr: 'XXXX:XXXX:XXXX:XXX',
    name: deviceName(),
    model: deviceModel()
  }
}

const deviceModel = () => {
  const mpath = '/proc/device-tree/model'
  let model
  try {
    model = fs.readFileSync(mpath).toString().trim()
  } catch(e){
    console.log('*****\ndeviceModel not found\n*****\n')
  }
  return model
}

const deviceSN = () => {
  let deviceSN 
  try {
    deviceSN = fs.readFileSync(path.join(Config.storage.dirs.certDir, 'deviceSN')).toString().trim()
  } catch(e){
    console.log('*****\ndeviceSN not found\n*****\n')
  }
  return deviceSN
}

module.exports = {
  NetworkAddr,
  TMPFILE,
  setDeviceName,
  deviceName,
  deviceModel,
  hardwareInfo,
  DEVICE_NAME
}