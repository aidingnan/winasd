const path = require('path')
const fs = require('fs')
const child = require('child_process')
const mkdirp = require('mkdirp')

/**
This function works like mkdirp but the target is a subvolume
*/
module.exports = (target, callback) =>
  mkdirp(path.dirname(target), err => err
    ? callback(err)
    : fs.lstat(target, (err, stats) => err
      ? err.code === 'ENOENT'
        ? child.exec(`btrfs subvolume create ${target}`, err => callback(err))
        : callback(err) 
      : child.exec(`btrfs subvolume show ${target}`, err => callback(err))))

