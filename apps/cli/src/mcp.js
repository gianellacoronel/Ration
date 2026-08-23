import { chmod, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  WdkMcpServer,
  getAddress,
  getTokenBalance
} from '@tetherto/wdk-mcp-toolkit'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import { z } from 'zod'

import { USDT_ADDRESS } from './config.js'
import { formatEthBaseUnits } from './domain.js'

const CHAIN = 'sepolia'
const SERVER_NAME = 'ration'

function getSepoliaBalance (server) {
  server.registerTool(
    'getBalance',
    {
      title: 'Get Sepolia ETH Balance',
      description: 'Get this sandbox wallet\'s native Sepolia ETH balance, already formatted as ETH and canonical wei. One ETH is 10^18 wei. This read-only tool cannot transfer or spend funds.',
      inputSchema: z.object({
        chain: z.literal(CHAIN).describe('The Sepolia network')
      }),
      outputSchema: z.object({
        balance: z.string().describe('Native balance in canonical wei'),
        balanceEth: z.string().describe('Native balance formatted as Sepolia ETH')
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async () => {
      try {
        const account = await server.wdk.getAccount(CHAIN, 0)
        const balance = (await account.getBalance()).toString()
        const balanceEth = formatEthBaseUnits(balance).replace(/ ETH$/, '')
        return {
          content: [{
            type: 'text',
            text: `Balance: ${balanceEth} Sepolia ETH (${balance} wei)`
          }],
          structuredContent: { balance, balanceEth }
        }
      } catch {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Could not read the sandbox Sepolia ETH balance.' }]
        }
      }
    }
  )
}

const READ_ONLY_TOOLS = [getAddress, getSepoliaBalance, getTokenBalance]

export function resolveMcpBridgePath () {
  return fileURLToPath(new URL('../bin/mcp-bridge.js', import.meta.url))
}

function listen (server, socketPath) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(socketPath)
  })
}

function closeSocketServer (server) {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve()
      return
    }
    server.close((error) => error ? reject(error) : resolve())
  })
}

function tomlString (value) {
  return JSON.stringify(value)
}

function configureOpenCode (args, env, bridgeCommand) {
  let inline = {}
  if (env.OPENCODE_CONFIG_CONTENT) {
    try {
      inline = JSON.parse(env.OPENCODE_CONFIG_CONTENT)
    } catch {
      throw new Error('OPENCODE_CONFIG_CONTENT must be valid JSON for Ration to attach its MCP server.')
    }
  }

  return {
    args,
    env: {
      ...env,
      OPENCODE_CONFIG_CONTENT: JSON.stringify({
        ...inline,
        mcp: {
          ...inline.mcp,
          [SERVER_NAME]: {
            type: 'local',
            command: bridgeCommand,
            enabled: true,
            timeout: 10000
          }
        }
      })
    }
  }
}

function configureCodex (args, env, bridgeCommand) {
  const [command, ...commandArgs] = bridgeCommand
  const config = [
    `mcp_servers.${SERVER_NAME}.command=${tomlString(command)}`,
    `mcp_servers.${SERVER_NAME}.args=[${commandArgs.map(tomlString).join(',')}]`,
    `mcp_servers.${SERVER_NAME}.enabled_tools=["getAddress","getBalance","getTokenBalance"]`,
    `mcp_servers.${SERVER_NAME}.required=true`
  ]
  return {
    args: [...config.flatMap((value) => ['--config', value]), ...args],
    env
  }
}

export async function createReadOnlyMcpService (seed, config, expectedAddress, options = {}) {
  const McpServer = options.WdkMcpServer ?? WdkMcpServer
  const WalletManager = options.WalletManager ?? WalletManagerEvm
  const createSocketServer = options.createSocketServer ?? createServer
  const createTransport = options.createTransport ?? ((socket) => new StdioServerTransport(socket, socket))
  const makeTempDirectory = options.mkdtemp ?? mkdtemp
  const remove = options.rm ?? rm
  const server = new McpServer('ration-sandbox', '0.1.0')
    .useWdk({ seed })
    .registerWallet(CHAIN, WalletManager, config)
    .registerToken(CHAIN, 'USDT', { address: USDT_ADDRESS, decimals: 6 })
    .registerTools(READ_ONLY_TOOLS)
  let directory
  let socketServer
  let connection
  let transport
  let accepted = false
  let closed = false

  const close = async () => {
    if (closed) return
    closed = true
    let closeError
    try {
      await server.close()
    } catch (error) {
      closeError = error
    }
    connection?.destroy()
    try {
      if (socketServer) await closeSocketServer(socketServer)
    } catch (error) {
      closeError ??= error
    }
    try {
      if (directory) await remove(directory, { recursive: true, force: true })
    } catch (error) {
      closeError ??= error
    }
    if (closeError) throw closeError
  }

  try {
    const account = await server.wdk.getAccount(CHAIN, 0)
    if ((await account.getAddress()).toLowerCase() !== expectedAddress.toLowerCase()) {
      throw new Error('The MCP wallet does not match the ephemeral sandbox.')
    }

    directory = await makeTempDirectory(join(tmpdir(), 'ration-mcp-'))
    await (options.chmod ?? chmod)(directory, 0o700)
    const socketPath = join(directory, 'server.sock')
    socketServer = createSocketServer((socket) => {
      if (accepted || closed) {
        socket.destroy()
        return
      }
      accepted = true
      connection = socket
      transport = createTransport(socket)
      server.connect(transport).catch(() => socket.destroy())
    })
    await listen(socketServer, socketPath)
    const bridgeCommand = [process.execPath, resolveMcpBridgePath(), socketPath]

    return {
      configureLaunch (command, args, env = process.env) {
        const agent = basename(command).toLowerCase()
        if (agent === 'opencode') return { command, ...configureOpenCode(args, env, bridgeCommand) }
        if (agent === 'codex') return { command, ...configureCodex(args, env, bridgeCommand) }
        return { command, args, env }
      },
      close
    }
  } catch (error) {
    try {
      await close()
    } catch {}
    throw error
  }
}
