const subvolPath = (target, callback) =>
  child.exec(`btrfs subvolume show ${target}`, (err, stdout) => err 
    ? callback(err)
    : callback(null, stdout.toString().split('\n')[0].trim()))

/**
1. retrieves target's subvol path (sub)
2. determine rootvol path (root)
3. list all subvols under root, filter, sort, and delete
*/
module.exports = (target, callback) =>
  fs.lstat(target, (err, stats) => {
    if (err && err.code === 'ENOENT') {
      callback(null)
    } else if (err) {
      callback(err)
    } else {
      subvolPath(target, (err, sub) => {
        if (sub === '/') {
          const err = new Error('rimraf root vol is not allowed')
          err.code = 'EFORBIDDEN'
          callback(err)
        } else {
          const root = path.resolve(target.slice(0, target.length - sub.length))
          child.exec(`btrfs subvolume list ${root}`, (err, stdout) => {
            if (err) return callback(err)
            const subvols = stdout.split('\n')
              .map(l => l.trim())
              .filter(l => l.length)
              .map(l => l.slice(l.indexOf('path') + 5).trim())
              .filter(l => l === sub || l.startsWith(sub + '/'))
              .sort((a, b) => b.length - a.length)
              .map(l => path.join(root, l))
             
            child.exec(`btrfs subvolume delete --commit-each ${subvols.join(' ')}`, err => callback(err))
          })
        }
      })
    }
  })
