const path = require('path')
const fs = require('fs')
const child = require('child_process')

const validator = require('validator')
const rimraf = require('rimraf')

const sata = require('./sata')

// all files names as the following pattern is going to be removed by dustman
// .winas-deleted-<uuid>

const prefix = '.winas-deleted-'
let mountpoint = ''

const match = name =>
  name.startsWith(prefix) &&
  validator.isUUID(name.slice(prefix.length))

sata.once('mounted', mp => {
  mountpoint = mp
  fs.readdir(mp, (err, entries) =>
    !err && entries.filter(match).forEach(name => recycle(name)))
})

const recycle = (name, callback = () => {}) => {
  if (!mountpoint) {
    const err = new Error('not mounted')
    err.code = 'EFORBIDDEN'
    return process.nextTick(() => callback(err))
  }

  if (!match(name)) {
    const err = new Error('invalid name')
    err.code = 'EINVAL'
    return process.nextTick(() => callback(err))
  }

  const target = path.join(mountpoint, name)
  fs.lstat(target, (err, stats) => {
    if (err) return callback(err)
    if (stats.ino === 256 || stats.ino === 2) {
      child.exec(`btrfs subvolume delete --commit-each ${target}`, err => callback(err))
    } else {
      rimraf(target, err => callback(err))
    }
  })
}

module.exports = recycle
