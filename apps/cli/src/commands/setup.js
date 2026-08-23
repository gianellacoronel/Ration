import { NETWORK, TREASURY_NAME } from '../config.js'
import { isTreasuryConfigured } from '../domain.js'
import { WalletCreationError, WalletUnlockError } from '../errors.js'
import { runWdkGetAddress, runWdkWalletCreate, runWdkWalletUnlock } from '../wdk.js'
import {
  loadWallets,
  lockWallets,
  operationExitCode,
  printWalletError,
  requirePaymasterTokenMode
} from './shared.js'

export async function setupCommand (options, output, { insecure = false } = {}) {
  let wallets = await loadWallets(options, output)
  if (!wallets) return 1
  if (!(await requirePaymasterTokenMode(options, output))) return 1

  const create = options.runWdkWalletCreate ?? runWdkWalletCreate
  const unlock = options.runWdkWalletUnlock ?? runWdkWalletUnlock
  const getAddress = options.runWdkGetAddress ?? runWdkGetAddress
  const locks = new Set()
  let exitCode = 0
  let address

  try {
    const existing = isTreasuryConfigured(wallets)
    if (!existing) {
      if (insecure) {
        output.log('Creating your Ration treasury WITHOUT a passphrase...')
        output.log('WARNING: anyone with access to this machine can spend its funds.')
      } else {
        output.log('Creating your Ration treasury...')
        output.log('WDK will ask you to protect and back up this wallet. Ration never sees those secrets.')
      }
      await create(TREASURY_NAME, insecure ? { emptyPassphrase: true } : {})
      locks.add(TREASURY_NAME)
      wallets = await loadWallets(options, output)
      if (!wallets || !isTreasuryConfigured(wallets)) throw new Error('Treasury creation could not be verified.')
    } else {
      locks.add(TREASURY_NAME)
      output.log('Ration treasury already exists. Checking its address...')
    }

    const treasury = wallets.find((wallet) => wallet.name === TREASURY_NAME)
    if (!treasury.unlocked) {
      await unlock(TREASURY_NAME, insecure ? { emptyPassphrase: true } : {})
    }
    address = (await getAddress(TREASURY_NAME, NETWORK)).address
  } catch (error) {
    exitCode = operationExitCode(error)
    if (error instanceof WalletCreationError) {
      output.error(`Treasury creation failed. ${error.message}`)
    } else if (insecure && error instanceof WalletUnlockError) {
      output.error('The treasury could not be unlocked with an empty passphrase.')
      output.error("It was probably created securely. Run 'ration setup' without --insecure.")
    } else {
      printWalletError(error, output, 'Treasury')
    }
  }

  if (!(await lockWallets(locks, options, output))) exitCode = 1
  if (exitCode !== 0) return exitCode

  output.log('')
  output.log('Treasury ready')
  output.log(`  Address   ${address}`)
  output.log('  Status    locked')
  output.log('  Gas       paid in USD₮')
  output.log('')
  output.log('Fund this address with test USD₮ before creating a sandbox.')
  return 0
}
