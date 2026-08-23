export class WdkCliUnavailableError extends Error {}

export class WdkConfigError extends Error {
  constructor (exitCode, signal, message, wdkCode) {
    super(message ?? (signal ? `WDK was stopped by ${signal}.` : `WDK exited with code ${exitCode}.`))
    this.exitCode = exitCode
    this.signal = signal
    this.wdkCode = wdkCode
  }
}

export class WalletCreationError extends Error {
  constructor (code, signal) {
    super(signal ? `WDK was stopped by ${signal}.` : `WDK exited with code ${code}.`)
    this.code = code
    this.signal = signal
  }
}

export class WalletListingError extends Error {
  constructor (code, signal, message) {
    super(message ?? (signal ? `WDK was stopped by ${signal}.` : `WDK exited with code ${code}.`))
    this.code = code
    this.signal = signal
  }
}

export class WalletUnlockError extends Error {
  constructor (code, signal) {
    super(signal ? `WDK was stopped by ${signal}.` : `WDK exited with code ${code}.`)
    this.code = code
    this.signal = signal
  }
}

export class WalletLockError extends Error {
  constructor (exitCode, signal, message, wdkCode) {
    super(message ?? (signal ? `WDK was stopped by ${signal}.` : `WDK exited with code ${exitCode}.`))
    this.exitCode = exitCode
    this.signal = signal
    this.wdkCode = wdkCode
  }
}

export class CommandLaunchError extends Error {
  constructor (command, cause) {
    super(`Could not start '${command}': ${cause.message}`)
    this.command = command
    this.cause = cause
  }
}

export class WalletAddressError extends Error {
  constructor (exitCode, signal, message, wdkCode) {
    super(message ?? (signal ? `WDK was stopped by ${signal}.` : `WDK exited with code ${exitCode}.`))
    this.exitCode = exitCode
    this.signal = signal
    this.wdkCode = wdkCode
  }
}

export class WalletBalanceError extends Error {
  constructor (exitCode, signal, message, wdkCode) {
    super(message ?? (signal ? `WDK was stopped by ${signal}.` : `WDK exited with code ${exitCode}.`))
    this.exitCode = exitCode
    this.signal = signal
    this.wdkCode = wdkCode
  }
}

export class WalletTransferError extends Error {
  constructor (phase, exitCode, signal, message, wdkCode) {
    super(message ?? (signal ? `WDK was stopped by ${signal}.` : `WDK exited with code ${exitCode}.`))
    this.phase = phase
    this.exitCode = exitCode
    this.signal = signal
    this.wdkCode = wdkCode
  }
}
