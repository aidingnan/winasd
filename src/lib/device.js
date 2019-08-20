const os = require('os')
const net = require('net')
const fs = require('fs')
const path = require('path')
const child = require('child_process')

const mkdirp = require('mkdirp')
const Config = require('config')
const UUID = require('uuid')

const deviceNameP = path.join(Config.volume.cloud,
  Config.cloud.domain, Config.cloud.id, 'display-name')

let __device_name = 'PocketDrive'
try { __device_name = fs.readFileSync(deviceNameP).toString().trim() } catch (e) {}

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

/*
const deviceName = () => {
  let name = DEVICE_NAME
  try {
    name = fs.readFileSync(deviceNameP).toString().trim()
  } catch(e) {}
  return name
}
*/
const deviceName = () => __device_name

const TMPFILE = () => {
  // return path.join(Config.storage.dirs.tmpDir, UUID.v4())
  return path.join(Config.volume.tmp, UUID.v4())
}

const setDeviceName = (name, callback) => {
  if (!name || !name.length) 
    return process.nextTick(() => callback(null, null))
  const tmpfile = TMPFILE()
  mkdirp(path.dirname(deviceNameP), err => err
    ? callback(err)
    : fs.writeFile(tmpfile, name, err => err
        ? callback(err)
        : fs.rename(tmpfile, deviceNameP, err => err
            ? callback(err)
            : (__device_name = name, callback(null, null)))))
}

const deviceInfo = () => {
  return {
    sn: deviceSN(),
    usn: deviceUSN(),
    version: SoftwareVersion(),
    name: deviceName(),
    model: deviceModel()
  }
}

const deviceSN = () => {
  /**
    *  let deviceSN 
    *  try {
    *    deviceSN = fs.readFileSync(path.join(Config.storage.dirs.device, 'deviceSN')).toString().trim()
    *  } catch(e){
    *    console.log('*****\ndeviceSN not found\n*****\n')
    *  }
    *  return deviceSN
    */

  return Config.cloud.id
}

const deviceUSN = () => {
  
}

const SoftwareVersion = () => {
  let currentVersion = '0.0.0'
  try {
    currentVersion = fs.readFileSync('/etc/version').toString().trim().slice(1).split('-')[0]
  } catch (e) {
    console.log('device version not found')
  }
  return currentVersion
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

module.exports = {
  NetworkAddr,
  TMPFILE,
  setDeviceName,
  SoftwareVersion,
  deviceName,
  deviceModel,
  deviceInfo,
  deviceUSN,
  DEVICE_NAME
}
