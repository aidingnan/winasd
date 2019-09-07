const path = require('path')
const fs = require('fs')
const child = require('child_process')
const EventEmitter = require('events')

const mkdirp = require('mkdirp')
const rimraf = require('rimraf')

const lsblk = require('../lib/lsblk')

const volumeDir = '/run/winas/volumes/'

/**
Sata object provides:
1. status 0x00, 0x02..., 0x80, 0xFF
2. status event for disk status
3. mounted event as 0x80 alias, convenient for one-time listener
*/
class Sata extends EventEmitter {
  constructor () {
    super()
    this.status = 0x00
    this.busy = true
    this.checkStatus()
  }

  /** {
    "name": "sda",
    "fstype": "btrfs",
    "label": null,
    "uuid": "e31829d6-a379-4878-8225-787c1ea55b24",
    "fsavail": "217.6G",
    "fsuse%": "2%",
    "mountpoint": "/run/winas/volumes/e31829d6-a379-4878-8225-787c1ea55b24"
  } */
  checkStatus () {
    lsblk((err, blks) => {
      if (err) return this.setStatus(0xff)

      const sda = blks.find(blk => blk.name === 'sda')
      if (!sda) return this.setStatus(0x02)

      const { fstype, uuid } = sda
      if (fstype !== 'btrfs') return this.setStatus(0x03)

      const mountpoint = path.join(volumeDir, uuid)
      if (sda.mountpoint) {
        if (sda.mountpoint !== mountpoint) {
          this.setStatus(0x05)
        } else {
          this.mountpoint = mountpoint
          this.setStatus(0x80)
        }
      } else {
        mkdirp(mountpoint, err => {
          if (err) return this.setStatus(0xff)
          child.exec(`mount -t btrfs /dev/sda ${mountpoint}`, err => {
            if (err) {
              this.setStatus(0x04)
            } else {
              this.mountpoint = mountpoint
              this.setStatus(0x80)
            }
          })
        })
      }
    })
  }

  // internal method
  setStatus (status) {
    this.busy = false
    this.status = status
    process.nextTick(() => this.emit('status', status))
    if (this.status === 0x80) {
      this.swapon()
      process.nextTick(() => this.emit('mounted', this.mountpoint))
    }
  }

  swapon () {
    const swapfile = path.join(this.mountpoint, '.winas-swapfile')
    const tmpswapfile = path.join(this.mountpoint, '.winas-tmpswapfile')
    child.exec('cat /proc/swaps', (err, stdout) => {
      if (err) return
      if (stdout.toString().indexOf(swapfile) !== -1) return
      fs.lstat(swapfile, err => {
        if (!err) { // swapfile ready create
          child.exec(`swapon ${swapfile}`, () => {})
        } else {
          // create swapfile
          // btrfs swapfile need NoCOW
          // https://superuser.com/questions/1067150/how-to-create-swapfile-on-ssd-disk-with-btrfs/1411462#1411462
          rimraf(tmpswapfile, () =>
            child.exec(`set -e;
              touch ${tmpswapfile};
              chattr +C ${tmpswapfile};
              dd if=/dev/zero of=${tmpswapfile} bs=1M count=4096 status=none;
              chmod 600 ${tmpswapfile};
              mkswap -f ${tmpswapfile};
              mv  ${tmpswapfile} ${swapfile};
              swapon ${swapfile}
              `, () => {}))
        }
      })
    })
  }

  // this is the only external method
  format (callback) {
    if (this.busy) {
      const err = new Error('busy')
      err.code = 'EBUSY'
      process.nextTick(() => callback(err))
    } else {
      this.busy = true
      child.exec('mkfs.btrfs -f /dev/sda', err => {
        if (err) {
          this.checkStatus()
        } else {
          child.exec('partprobe', () => this.checkStatus())
        }
        callback(err)
      })
    }
  }
}

module.exports = new Sata()
