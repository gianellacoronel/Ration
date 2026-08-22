import WDK from '@tetherto/wdk'

const seedPhrase = WDK.getRandomSeedPhrase()

if (!WDK.isValidSeed(seedPhrase)) {
  throw new Error('WDK generated an invalid seed phrase')
}

const wdk = new WDK(seedPhrase)

try {
  console.log('WDK SDK initialized successfully')
} finally {
  wdk.dispose()
}
