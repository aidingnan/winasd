const path = require('path')
const child = require('child_process')
const camel = require('camelcase')

/*
example btrfs
DEVNAME=/dev/sda
UUID=e31829d6-a379-4878-8225-787c1ea55b24
UUID_SUB=f69fa09f-3bf5-42e8-b814-4b8abbb7a45d
TYPE=btrfs

{ devname: '/dev/sda',
  uuid: 'e31829d6-a379-4878-8225-787c1ea55b24',
  uuidSub: 'f69fa09f-3bf5-42e8-b814-4b8abbb7a45d',
  type: 'btrfs' }

example partition

DEVNAME=/dev/sda
PTUUID=98d53414-2357-4d20-b5ac-788d9e27e9e5
PTTYPE=gpt
*/

// TODO validate dev
module.exports = (dev, callback) =>
  child.exec(`blkid -o export ${dev}`, (err, stdout) => {
    if (err) {
      callback(err)
    } else {
      callback(stdout.toString().split('\n')
        .map(l => l.trim())
        .filter(l => l.length)
        .map(l => l.split('='))
        .reduce((o, [k, v]) => Object.assign(o, { [camel(k)]: v }), {}))
    }
  })
