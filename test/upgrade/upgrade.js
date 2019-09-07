/* eslint-disable no-undef */
const path = require('path')

const rimraf = require('rimraf')
const expect = require('expect')
const mkdirp = require('mkdirp')
const proxyquire = require('proxyquire').noCallThru()
const EventEmitter = require('events')

const config = {
  volume: {
    vols: path.join('tmptest', 'vols'),
    tmp: path.join('tmptest', 'tmp')
  }
}

const channel = new EventEmitter()

const upgrade = proxyquire('src/components/upgrade', {
  config,
  './channel': channel
})

describe('test upgrade module', () => {
  beforeEach(() => {
    rimraf.sync(config.volume.vols)
    rimraf.sync(config.volume.tmp)
    mkdirp.sync(config.volume.vols)
    mkdirp.sync(config.volume.tmp)
  })

  it('should start download given version', done => {
    expect(upgrade.downloader).toEqual(undefined)
    channel.emit('download', {
      tag: '1.2.9',
      hash: '7d750f63cc3dfaf6a808e780ccbdd1454b80b98878f154ebfc753c27ac85e291',
      url: 'https://dingnan-upgrade.s3.cn-north-1.amazonaws.com.cn/beta/backus/v1.2.9-beta.tar.zst',
      desc: null
    })

    setTimeout(() => {
      expect(upgrade.downloader).not.toEqual(undefined)
      expect(upgrade.downloader.status).toEqual('Working')
      done()
    }, 1000)
  })
})
