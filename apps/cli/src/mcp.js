import { chmod, mkdtemp, rm } from 'node:fs/promises'
import { AsyncLocalStorage } from 'node:async_hooks'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  WdkMcpServer,
  getAddress,
  getTokenBalance,
  transfer
} from '@tetherto/wdk-mcp-toolkit'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import { z } from 'zod'

import { USDT_ADDRESS } from './config.js'
import {
  DemoPaymentError,
  parseCatalogPayload,
  purchaseResourceViaDemoApi,
  resolveDemoOrigin
} from './demo.js'
import { formatEthBaseUnits, formatUsdtBaseUnits, parseUsdt } from './domain.js'
import { runSubagentCommand } from './processes.js'

const CHAIN = 'sepolia'
const SERVER_NAME = 'ration'
const TRANSACTION_TIMEOUT_MS = 180000
const TRANSACTION_POLL_MS = 1000
const MCP_TOOL_TIMEOUT_SECONDS = 1800
const CONFIRMED_TRANSFER = Symbol('confirmedTransfer')
export const FINANCIAL_SESSION_EXPIRED_MESSAGE = 'Ration financial session expired. No further spending is allowed.'

async function confirmedTransaction (account, hash) {
  const receipt = await account.waitForTransaction(hash, {
    target: 'confirmed',
    timeout: TRANSACTION_TIMEOUT_MS,
    interval: TRANSACTION_POLL_MS
  })
  if (receipt.finality === 'dropped' || receipt.success === false) {
    throw new Error('The sandbox transfer was not confirmed successfully.')
  }
}

function confirmTokenTransfers (server, pending, session, paymentContext, paymentRejection, runFinancial, serviceOptions = {}) {
  let financialWrites = 0
  server.wdk.registerMiddleware(CHAIN, async (account) => {
    if (account[CONFIRMED_TRANSFER]) return

    const broadcast = account.transfer.bind(account)
    account.transfer = async (transferOptions) => {
      const rejection = paymentRejection()
      if (rejection) throw new Error(rejection)
      const execute = async () => {
        if (financialWrites >= (serviceOptions.maxFinancialWrites ?? Infinity)) {
          throw new Error(`This child sandbox permits at most ${serviceOptions.maxFinancialWrites} financial writes.`)
        }
        financialWrites++
        const context = paymentContext.getStore()
        const activityId = session?.recordActivity({
          type: context?.type === 'resource_purchase' ? 'resource_purchase' : 'direct_usdt_transfer',
          resource: context?.resource ?? null,
          amountBaseUnits: transferOptions.amount.toString(),
          recipientAddress: transferOptions.recipient,
          transactionHash: null,
          feeWei: null,
          status: 'submission_unknown',
          sandboxId: serviceOptions.sandboxIdentity?.id ?? 'root',
          sandboxName: serviceOptions.sandboxIdentity?.name ?? 'root',
          walletAddress: serviceOptions.sandboxIdentity?.address ?? null,
          submittedAt: session?.now() ?? new Date().toISOString()
        })
        await session?.flushActivity?.()
        const result = await broadcast(transferOptions)
        session?.updateActivity(activityId, {
          transactionHash: result.hash,
          feeWei: result.fee?.toString() ?? null,
          status: 'broadcast',
          broadcastAt: session.now()
        })
        await session?.flushActivity?.()
        try {
          await confirmedTransaction(account, result.hash)
          session?.updateActivity(activityId, { status: 'confirmed', confirmedAt: session.now() })
          await session?.flushActivity?.()
          return result
        } catch (error) {
          session?.updateActivity(activityId, { status: 'confirmation_failed', failedAt: session.now() })
          await session?.flushActivity?.()
          throw error
        }
      }
      const operation = runFinancial ? runFinancial(execute) : execute()
      pending.add(operation)
      try {
        return await operation
      } finally {
        pending.delete(operation)
      }
    }
    Object.defineProperty(account, CONFIRMED_TRANSFER, { value: true })
  })
}

function subagentInvocation (command, commandArgs, task) {
  const agent = basename(command).toLowerCase()
  if (agent === 'opencode') return { command, args: ['run', task] }
  if (agent === 'codex') return { command, args: ['exec', task] }
  return { command, args: [...(commandArgs ?? []), task] }
}

function registerHierarchyTools (server, options, pending) {
  if (!options.hierarchy) return { expireChild: async () => {} }
  const childName = z.string().regex(
    /^[a-z][a-z0-9-]{0,31}$/,
    'Must start with a lowercase letter and contain only lowercase letters, digits, or hyphens'
  )
  const syncTree = async (tree) => {
    options.session?.setSandboxTree?.(tree)
    await options.session?.flushActivity?.()
  }
  let spawning = false
  let activeChildMcp
  let activeChildController

  const spawnSubagent = async ({ name, budget, task }) => {
    const rejection = options.paymentRejection?.()
    if (rejection) return toolError(new Error(rejection))
    if (spawning) return toolError(new Error('A child subagent is already running.'))
    spawning = true
    let delegated = false
    let childMcp
    let agentResult
    let operationError
    try {
      const amount = parseUsdt(budget)
      await options.hierarchy.delegate({ name, amount }, { onChange: syncTree })
      delegated = true
      await options.hierarchy.updateAgent(name, {
        agentStatus: 'running',
        agentStartedAt: options.session?.now?.() ?? new Date().toISOString()
      }, { onChange: syncTree })
      activeChildController = new AbortController()
      childMcp = await options.hierarchy.openChildMcp(name, createSandboxMcpService, {
        ...options.childMcpOptions,
        session: options.session
      })
      activeChildMcp = childMcp
      const afterProvisioningRejection = options.paymentRejection?.()
      if (afterProvisioningRejection || activeChildController.signal.aborted) {
        throw new Error(afterProvisioningRejection ?? FINANCIAL_SESSION_EXPIRED_MESSAGE)
      }
      const invocation = subagentInvocation(
        options.subagentCommand,
        options.subagentCommandArgs,
        task
      )
      const launch = childMcp.configureLaunch(invocation.command, invocation.args)
      const run = options.runSubagentCommand ?? runSubagentCommand
      agentResult = await run(launch.command, launch.args, {
        env: launch.env,
        signal: activeChildController.signal
      })
      if (!Number.isInteger(agentResult?.code) || agentResult.code !== 0) {
        const detail = agentResult?.stderr ? ` ${agentResult.stderr}` : ''
        throw new Error(`Subagent "${name}" exited unsuccessfully.${detail}`)
      }
      await options.hierarchy.updateAgent(name, {
        agentStatus: 'exited',
        agentExitCode: agentResult.code,
        agentSignal: agentResult.signal ?? null,
        agentFinishedAt: options.session?.now?.() ?? new Date().toISOString()
      }, { onChange: syncTree })
    } catch (error) {
      operationError = error
      if (delegated) {
        try {
          await options.hierarchy.updateAgent(name, {
            agentStatus: 'failed',
            agentExitCode: agentResult?.code ?? null,
            agentSignal: agentResult?.signal ?? null,
            agentFinishedAt: options.session?.now?.() ?? new Date().toISOString()
          }, { onChange: syncTree })
        } catch {}
      }
    } finally {
      if (childMcp) {
        try { await childMcp.close() } catch (error) { operationError ??= error }
      }
      activeChildMcp = undefined
      activeChildController = undefined
      if (delegated) {
        try { await options.hierarchy.close(name, { onChange: syncTree }) } catch (error) { operationError ??= error }
      }
      spawning = false
    }
    if (operationError) return toolError(operationError)

    const node = options.hierarchy.snapshot().nodes.find((entry) => entry.name === name)
    const returned = BigInt(node.usdtReturnedToParentBaseUnits)
    const spent = BigInt(node.delegatedBudgetBaseUnits) - returned
    const result = agentResult.stdout || 'The child completed without returning textual output.'
    return {
      content: [{ type: 'text', text: result }],
      structuredContent: {
        name,
        result,
        budget: formatUsdtBaseUnits(node.delegatedBudgetBaseUnits).replace(/ USDT$/, ''),
        spent: formatUsdtBaseUnits(spent).replace(/ USDT$/, ''),
        returned: formatUsdtBaseUnits(returned).replace(/ USDT$/, ''),
        status: 'closed'
      }
    }
  }

  server.registerTool(
    'ration_spawnSubagent',
    {
      title: 'Spawn Ration Subagent',
      description: 'Create one child EOA, move the requested USDT budget to it on-chain, launch one task-only child agent with a wallet-scoped Ration MCP, wait for its result, and return unused USDT and ETH to the parent. The child cannot access the parent wallet, treasury, or subagent tools.',
      inputSchema: z.object({
        name: childName.describe('A session-local child name, for example "research"'),
        budget: z.string()
          .refine((value) => parseUsdt(value) !== null, 'Must be a positive USDT amount with at most 6 decimals')
          .describe('The exact USDT budget to transfer to the child'),
        task: z.string().min(1).describe('The task the child agent must complete')
      }),
      outputSchema: z.object({
        name: z.string(),
        result: z.string(),
        budget: z.string(),
        spent: z.string(),
        returned: z.string(),
        status: z.literal('closed')
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (input) => {
      const operation = spawnSubagent(input)
      pending.add(operation)
      try {
        return await operation
      } finally {
        pending.delete(operation)
      }
    }
  )

  return {
    expireChild: async () => {
      await activeChildMcp?.expire()
      activeChildController?.abort('SIGTERM')
    }
  }
}

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

const SANDBOX_TOOLS = [getAddress, getSepoliaBalance, getTokenBalance, transfer]

function toolError (error) {
  const message = error instanceof Error ? error.message : String(error)
  const spent = error instanceof DemoPaymentError && typeof error.txHash === 'string'
    ? ` A USDT payment was already broadcast with transaction ${error.txHash}; do not pay again for this resource.`
    : ''
  return {
    isError: true,
    content: [{ type: 'text', text: `${message}${spent}` }]
  }
}

function registerDemoTools (server, origin, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch
  const wait = options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  // One successful purchase per resource per session. A repeat call returns
  // the unlocked payload instead of spending from the sandbox a second time.
  const unlockedPayloads = new Map()
  const purchaseOperations = new Map()

  server.registerTool(
    'ration_getRemainingBalance',
    {
      title: 'Get Remaining Ration Balance',
      description: 'Read the USDT balance currently remaining in this session\'s disposable sandbox wallet. This tool cannot transfer or spend funds. Args: none.',
      inputSchema: z.object({}).optional(),
      outputSchema: z.object({
        balance: z.string().describe('Remaining USDT formatted in token units'),
        balanceBaseUnits: z.string().describe('Remaining USDT in canonical 6-decimal base units'),
        currency: z.literal('USDT'),
        decimals: z.literal(6)
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
        const balanceBaseUnits = await account.getTokenBalance(USDT_ADDRESS)
        const formatted = formatUsdtBaseUnits(balanceBaseUnits)
        const balance = formatted.replace(/ USDT$/, '')
        return {
          content: [{
            type: 'text',
            text: `Remaining sandbox balance: ${formatted} (${balanceBaseUnits} base units).`
          }],
          structuredContent: {
            balance,
            balanceBaseUnits: balanceBaseUnits.toString(),
            currency: 'USDT',
            decimals: 6
          }
        }
      } catch {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Could not read the remaining sandbox USDT balance.' }]
        }
      }
    }
  )

  server.registerTool(
    'ration_getCatalog',
    {
      title: 'Get Ration Demo Catalog',
      description: `List the paid resources offered by the Ration demo API, what information each provides, and what each costs.

It returns the seller address, the Sepolia network details, the official test USDT token address, and each resource's id, description, information coverage, and price in USDT.
Args: none.`,
      inputSchema: z.object({}).optional(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async () => {
      try {
        const response = await fetchImpl(`${origin}/api/demo/catalog`, {
          redirect: 'error',
          signal: AbortSignal.timeout(15000)
        })
        if (response.status !== 200) {
          throw new DemoPaymentError(`The demo catalog returned HTTP ${response.status}.`)
        }
        const catalog = parseCatalogPayload(await response.json())
        return {
          content: [{
            type: 'text',
            text: catalog.resources.map((resource) => [
              `${resource.id}: ${resource.name}`,
              `Description: ${resource.description}`,
              `Provides: ${resource.provides.join('; ')}`,
              `Price: ${resource.price.amount} USDT (${resource.method} ${resource.path})`
            ].join('\n')).join('\n\n')
          }],
          structuredContent: catalog
        }
      } catch (error) {
        return toolError(error)
      }
    }
  )

  server.registerTool(
    'ration_purchaseResource',
    {
      title: 'Purchase Ration Demo Resource',
      description: `Buy a paid resource from the Ration demo API using this sandbox wallet.

The full payment flow is handled automatically: the resource is requested, its price in test USDT is validated against amountUsdt and the server's payment requirements, the amount is sent from this sandbox's Sepolia USDT balance to the seller, the transaction is waited until confirmed, and the protected payload is returned with the transaction hash. No other wallet is used. The payment was already authorized when the user funded this disposable session; do not ask for confirmation again.
Args:
  - resourceId (REQUIRED): a resource id returned by ration_getCatalog
  - amountUsdt (REQUIRED): that resource's exact USDT price returned by ration_getCatalog`,
      inputSchema: z.object({
        resourceId: z.string().min(1).describe('The resource id from ration_getCatalog'),
        amountUsdt: z.string()
          .refine((value) => parseUsdt(value) !== null, 'Must be a positive USDT amount with at most 6 decimals')
          .describe('The exact USDT price from ration_getCatalog, for example "0.03"')
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async ({ resourceId, amountUsdt }) => {
      const rejection = options.paymentRejection?.()
      if (rejection) return toolError(new Error(rejection))
      const cached = unlockedPayloads.get(resourceId)
      if (cached) {
        return {
          content: [{
            type: 'text',
            text: `"${resourceId}" was already unlocked earlier in this session; no new payment was made. Payload follows:\n${JSON.stringify(cached, null, 2)}`
          }],
          structuredContent: { purchased: true, resource: resourceId, paidBaseUnits: '0', payload: cached }
        }
      }
      try {
        let operation = purchaseOperations.get(resourceId)
        if (!operation) {
          operation = (async () => {
            const account = await server.wdk.getAccount(CHAIN, 0)
            const result = await options.paymentContext.run(
              { type: 'resource_purchase', resource: resourceId },
              () => purchaseResourceViaDemoApi({
                origin,
                resourceId,
                expectedAmountBaseUnits: parseUsdt(amountUsdt),
                account,
                fetchImpl,
                wait,
                transferWaitsForConfirmation: true
              })
            )
            unlockedPayloads.set(resourceId, result.payload)
            return result
          })()
          purchaseOperations.set(resourceId, operation)
        }
        let result
        try {
          result = await operation
        } finally {
          if (purchaseOperations.get(resourceId) === operation) {
            purchaseOperations.delete(resourceId)
          }
        }
        const paidText = result.txHash
          ? ` Paid ${formatUsdtBaseUnits(result.paidBaseUnits)} with transaction ${result.txHash}.`
          : ''
        return {
          content: [{
            type: 'text',
            text: `Unlocked "${resourceId}".${paidText} Payload follows:\n${JSON.stringify(result.payload, null, 2)}`
          }],
          structuredContent: {
            purchased: true,
            resource: resourceId,
            paidBaseUnits: result.paidBaseUnits.toString(),
            txHash: result.txHash ?? null,
            payload: result.payload
          }
        }
      } catch (error) {
        return toolError(error)
      }
    }
  )
}

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

const SANDBOX_ENABLED_TOOLS = [
  'getAddress', 'getBalance', 'getTokenBalance', 'transfer',
  'ration_getRemainingBalance', 'ration_getCatalog', 'ration_purchaseResource'
]
const ROOT_ENABLED_TOOLS = [...SANDBOX_ENABLED_TOOLS, 'ration_spawnSubagent']

function configureOpenCode (args, env, bridgeCommand, enabledTools) {
  let inline = {}
  if (env.OPENCODE_CONFIG_CONTENT) {
    try {
      inline = JSON.parse(env.OPENCODE_CONFIG_CONTENT)
    } catch {
      throw new Error('OPENCODE_CONFIG_CONTENT must be valid JSON for Ration to attach its MCP server.')
    }
  }
  const inheritedPermissions = typeof inline.permission === 'string'
    ? { '*': inline.permission }
    : (inline.permission ?? {})

  return {
    args,
    env: {
      ...env,
      OPENCODE_CONFIG_CONTENT: JSON.stringify({
        ...inline,
        permission: {
          ...inheritedPermissions,
          ...Object.fromEntries(enabledTools.map((tool) => [`${SERVER_NAME}_${tool}`, 'allow']))
        },
        mcp: {
          ...inline.mcp,
          [SERVER_NAME]: {
            type: 'local',
            command: bridgeCommand,
            enabled: true,
            timeout: MCP_TOOL_TIMEOUT_SECONDS * 1000
          }
        }
      })
    }
  }
}

function configureCodex (args, env, bridgeCommand, enabledTools) {
  const [command, ...commandArgs] = bridgeCommand
  const config = [
    `mcp_servers.${SERVER_NAME}.command=${tomlString(command)}`,
    `mcp_servers.${SERVER_NAME}.args=[${commandArgs.map(tomlString).join(',')}]`,
    `mcp_servers.${SERVER_NAME}.enabled_tools=[${enabledTools.map(tomlString).join(',')}]`,
    `mcp_servers.${SERVER_NAME}.default_tools_approval_mode="approve"`,
    `mcp_servers.${SERVER_NAME}.tool_timeout_sec=${MCP_TOOL_TIMEOUT_SECONDS}`,
    `mcp_servers.${SERVER_NAME}.required=true`
  ]
  return {
    args: [...config.flatMap((value) => ['--config', value]), ...args],
    env
  }
}

export async function createSandboxMcpService (seed, config, expectedAddress, options = {}) {
  const McpServer = options.WdkMcpServer ?? WdkMcpServer
  const WalletManager = options.WalletManager ?? WalletManagerEvm
  const createSocketServer = options.createSocketServer ?? createServer
  const createTransport = options.createTransport ?? ((socket) => new StdioServerTransport(socket, socket))
  const makeTempDirectory = options.mkdtemp ?? mkdtemp
  const remove = options.rm ?? rm
  const resolveDemoOriginImpl = options.resolveDemoOrigin ?? resolveDemoOrigin
  const pendingConfirmations = new Set()
  const paymentContext = new AsyncLocalStorage()
  let lifecycle = 'open'
  const paymentRejection = () => {
    if (lifecycle === 'expired') return FINANCIAL_SESSION_EXPIRED_MESSAGE
    if (lifecycle !== 'open') return 'The Ration session is closing and cannot start another payment.'
    return null
  }
  // Funding is the one-time authorization; this server only holds the sandbox key.
  const server = new McpServer('ration-sandbox', '0.1.0', {
    capabilities: { elicitation: false }
  })
    .useWdk({ seed })
    .registerWallet(CHAIN, WalletManager, config)
    .registerToken(CHAIN, 'USDT', { address: USDT_ADDRESS, decimals: 6 })
    .registerTools(SANDBOX_TOOLS)
  confirmTokenTransfers(
    server,
    pendingConfirmations,
    options.session,
    paymentContext,
    paymentRejection,
    options.runFinancial,
    options
  )
  const demoOrigin = resolveDemoOriginImpl(options.demoEnv ?? process.env)
  registerDemoTools(server, demoOrigin, { ...options, paymentContext, paymentRejection })
  const hierarchyControls = registerHierarchyTools(
    server,
    { ...options, paymentRejection },
    pendingConfirmations
  )
  const enabledTools = options.hierarchy ? ROOT_ENABLED_TOOLS : SANDBOX_ENABLED_TOOLS
  let directory
  let socketServer
  let connection
  let transport
  let accepted = false
  let closed = false

  const close = async () => {
    if (closed) return
    closed = true
    if (lifecycle !== 'expired') lifecycle = 'closing'
    let closeError
    try {
      await hierarchyControls.expireChild()
      while (pendingConfirmations.size > 0) {
        await Promise.allSettled([...pendingConfirmations])
      }
    } catch (error) {
      closeError = error
    }
    try {
      if (options.hierarchy) {
        await options.hierarchy.closeAll({
          onChange: async (tree) => {
            options.session?.setSandboxTree?.(tree)
            await options.session?.flushActivity?.()
          }
        })
      }
    } catch (error) {
      closeError ??= error
    }
    try {
      await server.close()
    } catch (error) {
      closeError ??= error
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
    lifecycle = 'closed'
  }

  const expire = async () => {
    if (lifecycle !== 'open') return
    lifecycle = 'expired'
    await hierarchyControls.expireChild()
    while (pendingConfirmations.size > 0) {
      await Promise.allSettled([...pendingConfirmations])
    }
  }

  try {
    const account = await server.wdk.getAccount(CHAIN, 0)
    if ((await account.getAddress()).toLowerCase() !== expectedAddress.toLowerCase()) {
      throw new Error('The MCP wallet does not match the ephemeral sandbox.')
    }
    if (options.hierarchy) {
      options.session?.setSandboxTree?.(options.hierarchy.snapshot())
      await options.session?.flushActivity?.()
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
        if (agent === 'opencode') return { command, ...configureOpenCode(args, env, bridgeCommand, enabledTools) }
        if (agent === 'codex') return { command, ...configureCodex(args, env, bridgeCommand, enabledTools) }
        return {
          command,
          args,
          env: {
            ...env,
            RATION_MCP_SERVER_NAME: SERVER_NAME,
            RATION_MCP_COMMAND: JSON.stringify(bridgeCommand),
            RATION_MCP_ENABLED_TOOLS: JSON.stringify(enabledTools)
          }
        }
      },
      expire,
      close
    }
  } catch (error) {
    try {
      await close()
    } catch {}
    throw error
  }
}
