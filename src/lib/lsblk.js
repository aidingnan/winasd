/**
{
  "blockdevices": [
    {
      "name": "sda",
      "fstype": "btrfs",
      "label": null,
      "uuid": "e31829d6-a379-4878-8225-787c1ea55b24",
      "fsavail": "217.6G",
      "fsuse%": "2%",
      "mountpoint": "/run/winas/volumes/e31829d6-a379-4878-8225-787c1ea55b24"
    },
    {
      "name": "mmcblk1",
      "fstype": null,
      "label": null,
      "uuid": null,
      "fsavail": null,
      "fsuse%": null,
      "mountpoint": null,
      "children": [
        {
          "name": "mmcblk1p1",
          "fstype": "btrfs",
          "label": null,
          "uuid": "e383f6f7-6572-46a9-a7fa-2e0633015231",
          "fsavail": "6.3G",
          "fsuse%": "12%",
          "mountpoint": "/run/cowroot/root"
        }
      ]
    },
    {
      "name": "mmcblk1boot0",
      "fstype": null,
      "label": null,
      "uuid": null,
      "fsavail": null,
      "fsuse%": null,
      "mountpoint": null
    },
    {
      "name": "mmcblk1boot1",
      "fstype": null,
      "label": null,
      "uuid": null,
      "fsavail": null,
      "fsuse%": null,
      "mountpoint": null
    },
    {
      "name": "zram0",
      "fstype": null,
      "label": null,
      "uuid": null,
      "fsavail": null,
      "fsuse%": null,
      "mountpoint": "[SWAP]"
    }
  ]
}
*/
module.exports = callback => 
  child.exec('lsblk -f --json', (err, stdout) => {
    if (err) {
      callback(err)
    } else {
      try {
        callback(null, JSON.parse(stdout.toString()).blockdevices)
      } catch (e) {
        callback(e) 
      }
    }
  })
