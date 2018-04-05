zsh:1: command not found: :w
const crypto = require('crypto')
const SPSP = require('ilp-protocol-spsp')
const IlpStream = require('ilp-protocol-stream')

const base64url = buf => buf
  .toString('base64')
  .replace(/\//g, '_')
  .replace(/+/g, '-')
  .replace(/=/g, '')

class IlpRedirect {
  constructor (opts) {
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
    const conn = IlpStream.createConnection({
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

    server.on('connection', conn => {
      const receiver = Buffer.from(conn.connectionTag, 'base64').toString('utf8')

      conn.on('money_stream', incomingStream => {
        incomingStream.setReceiveMax(Infinity)
        incomingStream.on('incoming', amount => {
          const outgoingStream = await this._getStream(receiver)
          const newAmount = outgoingStream.getSendMax() + amount
          outgoingStream.setSendMax(newAmount)
        })
      })
    })

    await this.server.listen()
  }

  async response (receiver) {
    // encode the spsp receiver so that it fits in the ILP address
    const encodedReceiver = base64url(Buffer.from(receiver, 'utf8'))
    return this.server.getAddressAndSecret(encodedReceiver)
  }
}
