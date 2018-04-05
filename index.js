const makePlugin = require('ilp-plugin')
const crypto = require('crypto')
const SPSP = require('ilp-protocol-spsp')
const IlpStream = require('ilp-protocol-stream')
const EventEmitter = require('eventemitter2')

const base64url = buf => buf
  .toString('base64')
  .replace(/\//g, '_')
  .replace(/\+/g, '-')
  .replace(/=/g, '')

class IlpRedirect extends EventEmitter {
  constructor (opts) {
    super()

    this.makePlugin = (opts && opts.makePlugin) || makePlugin
    this.connected = false
    this.server = null
    this.streams = new Map()
  }

  async _getStream (receiver) {
    const existing = this.streams.get(receiver)
    if (existing) return existing

    const plugin = this.makePlugin()
    await plugin.connect()

    const { destinationAccount, sharedSecret } = await SPSP.query(receiver)
    const conn = await IlpStream.createConnection({
      plugin,
      destinationAccount,
      sharedSecret
    })

    const stream = conn.createMoneyStream()
    this.streams.set(receiver, stream)
  }

  async connect () {
    if (this.connected) return

    const plugin = this.makePlugin()
    await plugin.connect()

    this.server = new IlpStream.Server({
      plugin,
      serverSecret: crypto.randomBytes(32)
    })

    this.server.on('connection', conn => {
      const receiver = Buffer.from(conn.connectionTag, 'base64').toString('utf8')

      conn.on('money_stream', incomingStream => {
        incomingStream.setReceiveMax(Infinity)
        incomingStream.on('incoming', async amount => {
          const outgoingStream = await this._getStream(receiver)
          const newAmount = Number(outgoingStream.sendMax) + Number(amount)
          outgoingStream.setSendMax(newAmount)
          this.emit('receiver:' + receiver, String(newAmount))
        })
      })
    })

    await this.server.listen()
  }

  response (receiver) {
    // encode the spsp receiver so that it fits in the ILP address
    const encodedReceiver = base64url(Buffer.from(receiver, 'utf8'))
    const response = this.server.generateAddressAndSecret(encodedReceiver)
    return {
      destination_account: response.destinationAccount,
      shared_secret: response.sharedSecret.toString('base64')
    }
  }

  sent (receiver) {
    const stream = this.streams.get(receiver)
    return (stream && stream.sendMax) || '0'
  }
}

module.exports = IlpRedirect
