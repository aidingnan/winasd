// from datasheet
// 
// Opcode Counter  1     0x24
// Param1 Mode     1     Bit 7-1 Must be Zero, Bit 0, 0 read, 1 incr
// Param2 KeyID    2     The counter to be incremented, zero or one
// 
// The following constants are defined in lib/atca_command.h
// 
// #define COUNTER_COUNT                      ATCA_CMD_SIZE_MIN
// #define ATCA_CMD_SIZE_MIN                  ((uint8_t)7)
// #define COUNTER_RSP_SIZE                   ATCA_RSP_SIZE_4 
// #define ATCA_RSP_SIZE_4                    ((uint8_t)7)
// #define ATCA_COUNTER                       ((uint8_t)0x24)

const ATCA_COUNTER = 0x24
const COUNTER_COUNT = 7
const COUNTER_RSP_SIZE = 7

// mode true incr, false read
const Packet = (op, index) => {
  let mode

  if (op === 'read') {
    mode = 0
  } else if (op === 'incr') {
    mode = 1
  } else {
    throw new Error('invalid op in Counter command')
  }

  if (index !== 0 && index !== 1) 
    throw new Error('invalid index in Counter command')

  return {
    txsize: COUNTER_COUNT,
    opcode: ATCA_COUNTER,
    param1: mode,
    param2: index,
    rxsize: COUNTER_RSP_SIZE 
  }
}

module.exports = {
  // op: 'read' or 'incr' 
  // index: 0 or 1, default 0
  // returns a number
  async counterAsync (op, index = 0) {
    let buf = await this.execAsync(Packet(op, index))
    return buf.readUInt32LE()
  }
}

