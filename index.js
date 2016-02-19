#!/usr/bin/env node

var http = require('http')
var path = require('path')
// var Blockchain = require('cb-insight')
var Blockchain = require('cb-blockr')
var chalk = require('chalk')
var express = require('express')
var fs = require('fs')
var bitcoin = require('bitcoinjs-lib')
var Spender = require('@tradle/spender')
var networkName = 'testnet'
var network = bitcoin.networks[networkName]

var PORT = process.env.FAUCET_PORT || process.env.PORT || 14004

var privkey = process.env.PRIVKEY

if (!privkey) {
  var WALLET_FILE = process.env.FAUCET_WALLET || path.join(process.env.HOME || process.env.USERPROFILE, '.bitcoin-faucet', 'wallet')

  // initialize wallet
  if (!fs.existsSync(WALLET_FILE)) {
    privkey = bitcoin.ECKey.makeRandom().toWIF()
    fs.writeFileSync(WALLET_FILE, privkey, 'utf-8')
  } else {
    privkey = fs.readFileSync(WALLET_FILE, 'utf-8').trim()
  }
}

var key = bitcoin.ECKey.fromWIF(privkey)
var address = key.pub.getAddress(network).toString()

var blockchain = new Blockchain(networkName)

var app = express()
app.get('/', function (req, res) {
  var pkg = require('./package')
  res.set('Content-Type', 'text/plain')
  res.end('bitcoin-faucet version: ' + pkg.version + '\n\nPlease send funds back to: ' + address)
})

// only bitcoin testnet supported for now
app.get('/withdraw', function (req, res) {
  if (!req.query.address) {
    return sendErr(res, 422, 'You forgot to set the "address" parameter.')
  }

  var addresses = [].concat(req.query.address)
  var valid = addresses.every(function (a) {
    try {
      bitcoin.Address.fromBase58Check(a)
      return true
    } catch (err) {
      sendErr(res, 422, 'Invalid address: ' + a)
      return false
    }
  })

  if (!valid) return

  var amounts = [].concat(req.query.amount)
    .map(function (a) {
      return parseInt(a, 10) || 10000
    })

  if (addresses.length !== amounts.length) {
    return sendErr(res, 422, 'You have an unequal number of "address" and "amount" parameters')
  }

  var spender = new Spender(networkName)
    .blockchain(blockchain)
    .from(privkey)

  if ('fee' in req.query) {
    spender.fee(parseInt(req.query.fee, 10))
  }

  addresses.forEach(function (addr, i) {
    console.log('sending', amounts[i], 'to', addr)
    spender.to(addr, amounts[i])
  })

  spender.execute(function (err, tx) {
    if (err) {
      console.error(err)
      return sendErr(res, 500, err.message)
    }

    res.send({
      status: 'success',
      data: {
        txId: tx.getId()
      }
    })
  })
})

function sendErr (res, code, msg) {
  return res
    .status(code)
    .send({
      status: 'error',
      data: {
        message: msg
      }
    })
}

var server = http.createServer(app)

server.listen(PORT, function (err) {
  if (err) console.error(err)
  console.log('\n  bitcoin-faucet listening on port %s', chalk.blue.bold(PORT))
  console.log('  deposit funds to: %s', chalk.green.bold(address))
})
