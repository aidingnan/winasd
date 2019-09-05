const path = require('path')
const fs = require('fs')
const child = require('child_process')

const validator = require('validator')
const uuid = require('uuid')
const rimraf = require('rimraf')

const sata = require('./sata')

// all files names as the following pattern is going to be removed by dustman
// .winas-deleted-<uuid>

const prefix = '.winas-deleted-'

const match = name =>
  name.startsWith(prefix) &&
  validator.isUUID(name.slice(prefix.length))

sata.once('mounted', () =>
  fs.readdir(sata.mountpoint, (err, entries) =>
    !err && entries.filter(match).forEach(name => recycle(name))))

const recycle = (source, callback = () => {}) => {
  if (!sata.mountpoint) {
    const err = new Error('not mounted')
    err.code = 'EUNAVAIL'
    return process.nextTick(() => callback(err))
  }

  const name = prefix + uuid.v4()
  const target = path.join(sata.mountpoint, name)
  fs.rename(source, target, err => {
    if (err) return callback(err)
    fs.lstat(target, (err, stats) => {
      if (err) return callback(err)
      if (stats.ino === 256 || stats.ino === 2) {
        child.exec(`btrfs subvolume delete --commit-each ${target}`, err => callback(err))
      } else {
        rimraf(target, err => callback(err))
      }
    })
  })
}

module.exports = recycle
