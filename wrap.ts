import { Web3 } from 'web3'
import dotenv from 'dotenv'
import BN from 'bn.js'
import wrapABI from './wrap.abi'
import kleur from 'kleur'
import { Listr } from 'listr2'
import promptSync from 'prompt-sync'

dotenv.config()

const rpc = 'https://rpc.mainnet.taiko.xyz/'
const privateKey = process.env.PRIVATE_KEY

if (!privateKey) {
  throw new Error('Please set your PRIVATE_KEY in the .env file')
}

const web3 = new Web3(rpc)
const account = web3.eth.accounts.privateKeyToAccount('0x' + privateKey)
web3.eth.accounts.wallet.add(account)
web3.eth.defaultAccount = account.address

const wethAddress = '0xA51894664A773981C6C112C43ce576f315d5b1B6'
const wethContract = new web3.eth.Contract(wrapABI, wethAddress)

const prompt = promptSync()
const totalAmount = prompt('Please enter the total amount in ether: ')
const totalTx = prompt('Please enter the total number of transactions: ')

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function getGasPrice() {
  const gasPrice = await web3.eth.getGasPrice()
  console.log(kleur.blue('Gas price in GWEI: '), kleur.green(Web3.utils.fromWei(gasPrice.toString(), 'gwei')))
  return gasPrice
}

async function wrap(i: number) {
  const amount = web3.utils.toWei(totalAmount, 'ether')
  const gasPrice = await getGasPrice()

  const wrapGasEstimate = await wethContract.methods.deposit().estimateGas({
    from: account.address,
    value: amount,
  })

  const wrapReceipt = await wethContract.methods.deposit().send({
    from: account.address,
    value: amount,
    gas: wrapGasEstimate.toString(),
    gasPrice: gasPrice.toString(),
  })

  console.log(
    kleur.green(`Wrap ${i + 1}: Transaction Hash: https://taikoscan.network/tx/${wrapReceipt.transactionHash}`)
  )
}

async function unwrap(i: number) {
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

async function wrapUnwrapLoop() {
  for (let i = 0; i < parseInt(totalTx); i++) {
    console.log(kleur.blue(`Transaction : ${i + 1}`))

    const wethBalance = new BN(await wethContract.methods.balanceOf(account.address).call())

    const tasks = new Listr([
      {
        title: `Sending Transaction`,
        task: async (ctx, task) => {
          if (wethBalance.gt(new BN(0))) {
            await unwrap(i)
          } else {
            await wrap(i)
          }
          task.title = 'Transaction Completed!'
          await delay(5000)
        },
      },
    ])

    try {
      await tasks.run()
    } catch (error) {
      console.error(kleur.red(`Error in transaction ${i + 1}:`), error)
    }
  }
}

wrapUnwrapLoop().catch(console.error)
