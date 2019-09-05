const path = require('path')
const child = require('child_process')

const blkid = require('../lib/blkid')
const ownership = require('../components/ownership')
const winas = require('../components/winas')

//  request cloud unbind first, if succeeds
module.exports = (encrypted, cleanVolume, callback) => {
  ownership.unbind(encrypted, err => {
    if (err) {
      callback(err)
    } else {
      if (!cleanVolume) return callback(null)

      console.log('unbinding start polling owner and winas')

      const polling = setInterval(() => {
        console.log('unbinding polling owner and winas state', ownership.owner, winas.getState())
        if (ownership.owner === null && winas.getState() === 'Stopped') {
          clearTimeout(timeout) 

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
              try {
                const mp = JSON.parse(stdout.toString())
                  .blockdevices
                  .find(blk => blk.name === 'sda' && blk.type === 'disk' && blk.ro === false)
                  .mountpoint
                  .slice()

                const winasDir = path.join(mp, 'winas')
                const tmpVol = path.join(mp, '.winas-delete-409335d8-cfae-11e9-a1f6-afe5dfd44f79')
                const tmpWinasDir = path.join(tmpVol, 'winas')
                child.exec(`btrfs subvolume create ${tmpVol}`, err => {
                  if (err) return callback(err)
                  fs.rename(winasDir, tmpWinasDir, err => {
                    if (err) return callback(err)
                    console.time('unbind-delete-tmpvol')
                    child.exec(`btrfs subvolume delete --commit-after ${tmpVol}`, err => {
                      console.timeEnd('unbind-delete-tmpvol')
                      if (err) return callback(err) 
                      callback(null, {
                        cleanVolume: '
                      })
                    }) 
                  })
                })
              } catch (e) {
                return callback(e)
              }
            }
          })
        }
      }, 1000)

      const timeout = setTimeout(r(() => {
        clearInterval(polling)
        callback(null, { 
          timeout: 30,
          owner: ownership.owner || ownership.owner.id,
          winasState: winas.getState(),
          cleanVolume: 'failed'
        })
      }), 30)
    }
  })  
}
