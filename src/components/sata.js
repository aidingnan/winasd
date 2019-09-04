const path = require('path')
const fs = require('fs')
const EventEmitter = require('events')

const uuid = require('uuid')
const mkdirp = require('mkdirp')

const btrfsStat = require('../lib/btrfsStat')

/**
Sata object provides:
1. status 0x00, 0x02..., 0x80, 0xFF
2. statusUpdate event

this 
*/
class Sata extends EventEmitter {
  constructor () {
    super()
    this.status = 0x00
    this.mp = path.join('/run', uuid.v4())
   
    this.busy = true 
    mkdirp(this.mp, err => {
      if (err) {
        this.busy = false
        this.setStatus(0xff)
      } else {
        this.checkSdaAsync()
          .then(status => { 
            this.busy = false 
            this.setStatus(status)
          })
          .catch(e => { 
            this.busy = false 
            this.setStatus(0xff)
          })
      }
    })
  }

  // internal method
  setStatus (status) {
    this.status = status
    process.nextTick(() => this.emit('status', status))
  }

  // internal method
  async checkSdaAsync () {
    return new Promise((resolve, reject) => {
      btrfsStat(this.mp, (err, status) => {
        // This is weird TODO
        if (status) {
          resolve(status)
        } else {
          reject(err)
        }
      })
    }) 
  }

  async formatAsync () {
    if (![0x03, 0x04, 0x80].includes(this.status)) {
      let err = new Error(`operation forbidden for status ${this.status}`) 
      err.code = 'EFORBIDDEN'
      throw err
    }

    if (this.status === 0x80) {
      const stdout = await childExecAsync('cat /proc/mounts')
      const mnts = stdout.toString()
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length)
        .map(l => {
          // <file system> <mount point>   <type>  <options>       <dump>  <pass>
          let flds = l.split(' ').map(fld => fld.trim())
          return {
            fs: flds[0],
            mp: flds[1],
            type: flds[2],
            opts: flds[3],
            dump: flds[4],
            pass: flds[5]
          }
        })

      if (mnts.find(m => m.fs = '/dev/sda' && m.type === 'btrfs')) {
        await childExecAsync('umount -f /dev/sda')  
      }
    }

    await childExecAsync('mkfs.btrfs -f /dev/sda')
    await childExecAsync('partprobe')
  }

  format (callback) {
    if (this.busy) {
      let err = new Error('busy')
      err.code = 'EBUSY'
      process.nextTick(() => callback(err))
    } else {
      this.busy = true
      this.formatAsync()
        .then(() => callback(null))
        .catch(e => callback(e))
        .then(() => {
          this.checkSdaAsync()
            .then(status => {
              this.busy = false
              this.setStatus(status)
            })
            .catch(e => {
              this.busy = false
              this.setStatus(0xff)
            })
        })
    }
  } 
}

module.exports = new Sata()
