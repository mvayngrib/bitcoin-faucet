#!/usr/bin/env node

var http = require('http')
var path = require('path')
var Blockchain = require('cb-insight')
var chalk = require('chalk')
var express = require('express')
var fs = require('fs')
var bitcoin = require('bitcoinjs-lib')

var PORT = process.env.FAUCET_PORT || process.env.PORT || 14004

var privkey = process.env.PRIVKEY

if (privkey == undefined) {
  var WALLET_FILE = process.env.FAUCET_WALLET || path.join(process.env.HOME || process.env.USERPROFILE, '.bitcoin-faucet', 'wallet')

  // initialize wallet
  if (!fs.existsSync(WALLET_FILE)) {
    privkey = bitcoin.ECPair.makeRandom({network: bitcoin.networks.testnet, compressed: false}).toWIF()
    fs.writeFileSync(WALLET_FILE, privkey, 'utf-8')
  } else {
    privkey = fs.readFileSync(WALLET_FILE, 'utf-8')
  }
}

var keypair = bitcoin.ECPair.fromWIF(privkey)
var address = keypair.getAddress().toString()

var blockchain = new Blockchain('https://test-insight.bitpay.com')

var app = express()
app.get('/', function (req, res) {
  var pkg = require('./package')
  res.set('Content-Type', 'text/plain')
  res.end('bitcoin-faucet version: ' + pkg.version + '\n\nPlease send funds back to: ' + address)
})

// only bitcoin testnet supported for now
app.get('/withdrawal', function (req, res) {
  if (!req.query.address) {
    return sendErr(res, 422, 'You forgot to set the "address" parameter.')
  }

  var addresses = [].concat(req.query.address)
  var amounts = [].concat(req.query.amount)
    .map(function(a) {
      return parseInt(a, 10) || 10000
    })

  if (addresses.length !== amounts.length) {
    return sendErr(res, 422, 'You have an unequal number of "address" and "amount" parameters')
  }

  var spender = new Spender('testnet')
    .blockchain(blockchain)
    .from(privkey)

  if ('fee' in req.query) {
    spender.fee(parseInt(req.query.fee, 10))
  }

  addresses.forEach(function(addr, i) {
    spender.to(addr, amounts[i])
  })

  spender.execute(function (err, tx) {
    if (err) return sendErr(res, 500, err.message)

    res.send({
      status: 'success',
      data: {
        txId: tx.getId()
      }
    })
  })
})

function sendErr(res, code, msg) {
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
