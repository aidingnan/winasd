const expect = require('chai').expect
const encode = require('../../src/lib/usn')

describe('usn', () => {
  it('0123e993e14636e6ee => 8785-EPQU-MNXG', () => {
    expect(encode('0123e993e14636e6ee')).to.equal('8785-EPQU-MNXG')
  })
})
