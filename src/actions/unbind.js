const path = require('path')
const fs = require('fs')
const child = require('child_process')

const uuid = require('uuid')

const blkid = require('../lib/blkid')
const mksubvolp = require('../lib/mksubvolp')
const rimrafSubvol = require('../lib/rimraf-subvol')
const ownership = require('../components/ownership')
const winas = require('../components/winas')


//  request cloud unbind first, if succeeds
module.exports = (encrypted, clean, callback) => {
  console.log('encrypted', encrypted)
  console.log('clean', clean)

  ownership.unbind(encrypted, err => {

    console.log('ownership.unbind', err) 

    if (err) {
      callback(err)
    } else {

      if (!clean) return callback(null)

      console.log('unbinding start polling owner and winas')

      const polling = setInterval(() => {
        console.log('unbinding polling owner and winas state', ownership.owner, winas.getState())
        if (ownership.owner === null && winas.getState() === 'Stopped') {
          clearTimeout(timeout) 
          clearInterval(polling)

          /** 
          {
             "blockdevices": [
                {"name":"sda", "maj:min":"8:0", "rm":false, "size":"223.6G", "ro":false, "type":"disk", "mountpoint":null},
                {"name":"mmcblk1", "maj:min":"179:0", "rm":false, "size":"7.3G", "ro":false, "type":"disk", "mountpoint":null,
                   "children": [
                      {"name":"mmcblk1p1", "maj:min":"179:1", "rm":false, "size":"7.3G", "ro":false, "type":"part", "mountpoint":"/run/cowroot/root"}
                   ]
                },
                {"name":"mmcblk1boot0", "maj:min":"179:32", "rm":false, "size":"4M", "ro":true, "type":"disk", "mountpoint":null},
                {"name":"mmcblk1boot1", "maj:min":"179:64", "rm":false, "size":"4M", "ro":true, "type":"disk", "mountpoint":null},
                {"name":"zram0", "maj:min":"253:0", "rm":false, "size":"64M", "ro":false, "type":"disk", "mountpoint":"[SWAP]"}
             ]
          } 

          **/
          child.exec('lsblk --json', (err, stdout) => {
            if (err) {
              callback(err)
            } else {
              let mp
              try {
                mp = JSON.parse(stdout.toString())
                  .blockdevices
                  .find(blk => blk.name === 'sda' && blk.type === 'disk' && blk.ro === false)
                  .mountpoint
                  .slice()
              } catch (e) {
                return callback(e)
              }

              console.log('mountpoint', mp)

              const name = '.winas-delete-409335d8-cfae-11e9-a1f6-afe5dfd44f79'
              const winasDir = path.join(mp, 'winas')
              const tmpDir = path.join(mp, name)

              fs.lstat(winasDir, (err, stats) => {
                if (err && err.code === 'ENOENT') {
                  callback(null)
                } else if (err) {
                  callback(err)
                } else if (!stats.isDirectory()) {
                  let err = new Error('not a directory')
                  err.code = 'ENOTDIR'
                  callback(err)
                } else if (stats.ino === 256 || stats.ino) {
                  rimrafSubvol(
                }

                  child.exec(`btrfs subvolume show ${tmpDir}`, err => {
                    if (err) {
                      rimraf(tmpDir, err => {
                      })
                    } else {
                      rim
                    }
                  })

                  mksubvolp(tmpVol, err => {
                    if (err) return callback(err)
                    fs.rename(winasDir, tmpDir, err => {
                      if (err) return callback(err)
                      rimrafSubvol(tmpVol, err => {
                        if (err) return callback(err)
                        callback(null)
                      })
                    })
                  })
                }
              })


            }
          })
        }
      }, 1000)

      const timeout = setTimeout(() => {
        clearInterval(polling)
        callback(null, { 
          timeout: 30,
          owner: ownership.owner || ownership.owner.id,
          winasState: winas.getState(),
          clean: 'failed'
        })
      }, 30 * 1000)
    }
  })  
}
