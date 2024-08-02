import { Web3 } from 'web3'
import dotenv from 'dotenv'
import BN from 'bn.js'
import wrapABI from './wrap.abi'
import kleur from 'kleur'
import { Listr } from 'listr2'
import promptSync from 'prompt-sync'
import { Web3Account } from 'web3-eth-accounts'

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
const totalTx = prompt('Please enter the total number of transactions per account: ')

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
    kleur.green(`Wrap ${i + 1}: Transaction Hash: https://taikoscan.network/tx/${wrapReceipt.transactionHash}\n`)
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
    kleur.green(`Unwrap ${i + 1}: Transaction Hash: https://taikoscan.network/tx/${unwrapReceipt.transactionHash}\n`)
  )
}

async function wrapUnwrapLoop() {
  const amounts = accounts.map((account) => {
    const amount = prompt(`Please enter the total amount in ether for account ${account.address}: `)
    return web3.utils.toWei(amount, 'ether')
  })

  const totalTransactions = parseInt(totalTx)

  for (let i = 0; i < totalTransactions; i++) {
    for (let accIndex = 0; accIndex < accounts.length; accIndex++) {
      const account = accounts[accIndex]
      const amountPerTx = new BN(amounts[accIndex])
      console.log(kleur.blue(`Transaction : ${i + 1} for account ${account.address}`))

      const wethBalance = new BN(await wethContract.methods.balanceOf(account.address).call())

      const tasks = new Listr([
        {
          title: `Sending Transaction`,
          task: async (ctx, task) => {
            await unwrap(account, i)
            await wrap(account, amountPerTx, i)
            task.title = 'Transaction Completed!'
            await delay(1000)
          },
        },
      ])

      try {
        await tasks.run()
      } catch (error) {
        console.error(kleur.red(`Error in transaction ${i + 1} for account ${account.address}:`), error)
      }
    }
  }
}

wrapUnwrapLoop().catch(console.error)
