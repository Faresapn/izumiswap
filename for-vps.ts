import { Web3 } from 'web3'
import dotenv from 'dotenv'
import BN from 'bn.js'
import wrapABI from './wrap.abi'
import kleur from 'kleur'
import promptSync from 'prompt-sync'
import { Web3Account } from 'web3-eth-accounts'
import readline from 'readline'

dotenv.config()

const rpc = 'https://rpc.mainnet.taiko.xyz/'
const privateKeys: string[] = process.env.PRIVATE_KEYS?.split(',') ?? []

if (privateKeys.length === 0) {
  throw new Error('Please set your PRIVATE_KEYS in the .env file')
}

const web3 = new Web3(rpc)
const accounts = privateKeys.map((pk) => {
  const account = web3.eth.accounts.privateKeyToAccount('0x' + pk)
  web3.eth.accounts.wallet.add(account)
  return account
})

const wethAddress = '0xA51894664A773981C6C112C43ce576f315d5b1B6'
const wethContract = new web3.eth.Contract(wrapABI, wethAddress)

const prompt = promptSync()
const totalTx = parseInt(prompt('Please enter the total number of transactions per account: '))

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function getGasPrice() {
  const gasPrice = await web3.eth.getGasPrice()
  console.log(kleur.blue('Gas price in GWEI: '), kleur.green(Web3.utils.fromWei(gasPrice.toString(), 'gwei')))
  return gasPrice
}

async function wrap(account: Web3Account, amount: BN, i: number) {
  const gasPrice = await getGasPrice()

  const wrapGasEstimate = await wethContract.methods.deposit().estimateGas({
    from: account.address,
    value: amount.toString(),
  })

  const wrapReceipt = await wethContract.methods.deposit().send({
    from: account.address,
    value: amount.toString(),
    gas: wrapGasEstimate.toString(),
    gasPrice: gasPrice.toString(),
  })

  console.log(
    kleur.green(`Wrap ${i + 1}: Transaction Hash: https://taikoscan.network/tx/${wrapReceipt.transactionHash}`)
  )
}

async function unwrap(account: Web3Account, i: number) {
  const wethBalance = new BN(await wethContract.methods.balanceOf(account.address).call())
  const gasPrice = await getGasPrice()

  const unwrapGasEstimate = await wethContract.methods.withdraw(wethBalance.toString()).estimateGas({
    from: account.address,
  })

  const unwrapReceipt = await wethContract.methods.withdraw(wethBalance.toString()).send({
    from: account.address,
    gas: unwrapGasEstimate.toString(),
    gasPrice: gasPrice.toString(),
  })

  console.log(
    kleur.green(`Unwrap ${i + 1}: Transaction Hash: https://taikoscan.network/tx/${unwrapReceipt.transactionHash}`)
  )
}

function countdown(ms: number) {
  const end = Date.now() + ms
  const interval = setInterval(() => {
    const now = Date.now()
    const remaining = end - now
    if (remaining <= 0) {
      clearInterval(interval)
      return
    }

    const hours = Math.floor(remaining / (1000 * 60 * 60))
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((remaining % (1000 * 60)) / 1000)
    readline.cursorTo(process.stdout, 0)
    readline.clearLine(process.stdout, 1)
    process.stdout.write(`Time remaining: ${kleur.yellow().bold(`${hours}h ${minutes}m ${seconds}s`)}`)
  }, 1000)
}

async function wrapUnwrapLoop() {
  const amounts = accounts.map((account) => {
    const amount = prompt(`Please enter the total amount in ether for account ${account.address}: `)
    return web3.utils.toWei(amount, 'ether')
  })

  while (true) {
    for (let i = 0; i < totalTx; i++) {
      for (let accIndex = 0; accIndex < accounts.length; accIndex++) {
        const account = accounts[accIndex]
        const amountPerTx = new BN(amounts[accIndex]).div(new BN(totalTx))

        console.log(kleur.blue(`\nTransaction : ${i + 1} for account ${account.address}`))

        const wethBalance = new BN(await wethContract.methods.balanceOf(account.address).call())

        countdown(1000)

        try {
          await delay(1000)
          if (wethBalance.gt(new BN(0))) {
            await unwrap(account, i)
          } else {
            await wrap(account, amountPerTx, i)
          }
          console.log(kleur.green('Transaction Completed!\n'))
          const delayMs = Math.floor(Math.random() * (5 * 60 * 1000 - 3 * 60 * 1000 + 1)) + 3 * 60 * 1000
        } catch (error) {
          console.error(kleur.red(`Error in transaction ${i + 1} for account ${account.address}:`), error)
        }
      }
    }

    console.log(kleur.blue('\nAll transactions completed. Waiting for 24 hours before starting again.'))
    countdown(24 * 60 * 60 * 1000)
    await delay(24 * 60 * 60 * 1000)
  }
}

wrapUnwrapLoop().catch(console.error)
