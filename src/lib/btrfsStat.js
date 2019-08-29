const fs = require('fs')
const path = require('path')
const child = require('child_process')

const rimraf = require('rimraf')
const mkdirp = require('mkdirp')

const NewError = (message, code) => Object.assign(new Error(message), { code })
const ESATA = NewError('sda not found', 'ESATA')
const ESIZE = NewError('sda size 0', 'ESIZE')
const EFORMAT = NewError('sda format error', 'EFORMAT')
const EMOUNT = NewError('sda mount error', 'EMOUNT')
const EVOLUME = NewError('sda write error', 'EVOLUME')

// check sata hardware and kernal driver
const checkSata = (callback) => {
  fs.lstat('/sys/block/sda/size', err => {
    if (err) return callback(ESATA)
    fs.readFile('/sys/block/sda/size', (err, data) => {
      if (err || data.toString().trim() === '0') return callback(ESIZE)
      return callback(null)
    })
  })
}

const checkFormat = (callback) => {
  child.exec("lsblk -fs | grep sda | awk '{ print $2 }'", (err, stdout, stderr) => {
    if (err || stderr) return callback(err || new Error(stderr))
    if (!stdout || stdout.toString().trim() !== 'btrfs') return callback(EFORMAT)
    callback(null)
  })
}

const CHECK_FILE = '9262693d-c79c-4bf3-9b3a-b87e668757b1'

const checkVolume = (mountpoint, callback) => {
  const checkfile = path.join(mountpoint, CHECK_FILE)
  child.exec(`mount -t btrfs /dev/sda ${mountpoint}`, (err, stdout, stderr) => {
    if (err || stderr) return callback(EMOUNT)
    rimraf(checkfile, err => {
      if (err) return callback(EVOLUME)
      fs.writeFile(checkfile, '123456', err => {
        if (err) return callback(EVOLUME)
        callback(null)
      })
    })
  })
}

// spec: https://github.com/aidingnan/winasd/blob/master/docs/spec.md
const btrfsStat = (mountpoint, callback) => {
  checkSata(err => err ? callback(err, err.code === 'ESATA' ? 0x01 : 0x02)
    : checkFormat(err => err ? callback(err, 0x03)
      : checkVolume(mountpoint, err => err ? callback(err, 0x04)
        : callback(null, 0x06))))
}

module.exports = btrfsStat
