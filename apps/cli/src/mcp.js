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
  MAX_DEMO_RESOURCE_PURCHASES,
  parseCatalogPayload,
  purchaseResourceViaDemoApi,
  resolveDemoOrigin
} from './demo.js'
import { formatEthBaseUnits, formatUsdtBaseUnits, parseUsdt } from './domain.js'
import { runSubagentCommand } from './processes.js'
import { MAX_CHILDREN } from './sandbox-hierarchy.js'

const CHAIN = 'sepolia'
const SERVER_NAME = 'ration'
const TRANSACTION_TIMEOUT_MS = 180000
const TRANSACTION_POLL_MS = 1000
const MCP_TOOL_TIMEOUT_SECONDS = 1800
const MAX_ROOT_FINANCIAL_WRITES = MAX_DEMO_RESOURCE_PURCHASES + 1
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
          throw new Error(`This sandbox permits at most ${serviceOptions.maxFinancialWrites} financial writes.`)
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
  if (!options.hierarchy) return { expireChildren: async () => {} }
  const childName = z.string().regex(
    /^[a-z][a-z0-9-]{0,31}$/,
    'Must start with a lowercase letter and contain only lowercase letters, digits, or hyphens'
  )
  const syncTree = async (tree) => {
    options.session?.setSandboxTree?.(tree)
    await options.session?.flushActivity?.()
  }
  const activeChildren = new Map()
  let spawning = false

  const boundedText = (value, fallback) => {
    const text = String(value ?? '').trim() || fallback
    return text.length <= 65536 ? text : `${text.slice(0, 65536)}\n[truncated]`
  }
  const rejectionError = () => {
    const rejection = options.paymentRejection?.()
    if (rejection) throw new Error(rejection)
  }
  const closeProvisioningFailure = async (agent, error) => {
    const node = options.hierarchy.snapshot().nodes.find((entry) => entry.name === agent.name)
    let cleanupStatus = node ? 'failed' : 'not_started'
    if (node) {
      try {
        await options.hierarchy.updateAgent(agent.name, {
          agentStatus: 'failed',
          agentFinishedAt: options.session?.now?.() ?? new Date().toISOString()
        }, { onChange: syncTree })
      } catch {}
      try {
        await options.hierarchy.close(agent.name, { onChange: syncTree })
        cleanupStatus = 'closed'
      } catch {}
    }
    const closedNode = options.hierarchy.snapshot().nodes.find((entry) => entry.name === agent.name)
    const returned = BigInt(closedNode?.usdtReturnedToParentBaseUnits ?? 0)
    const funded = closedNode?.transactions?.funding?.usdt?.status === 'confirmed'
      ? BigInt(closedNode.transactions.funding.usdt.amountBaseUnits)
      : returned
    return {
      name: agent.name,
      result: '',
      error: boundedText(error?.message, 'Child wallet provisioning failed.'),
      budget: formatUsdtBaseUnits(agent.amount).replace(/ USDT$/, ''),
      spent: cleanupStatus === 'closed'
        ? formatUsdtBaseUnits(funded - returned).replace(/ USDT$/, '')
        : 'unknown',
      returned: formatUsdtBaseUnits(returned).replace(/ USDT$/, ''),
      agentStatus: 'failed',
      cleanupStatus
    }
  }
  const runChild = async (agent) => {
    let childMcp
    let agentResult
    let executionError
    let cleanupError
    const controller = new AbortController()
    activeChildren.set(agent.name, { controller })
    try {
      await options.hierarchy.updateAgent(agent.name, {
        agentStatus: 'running',
        agentStartedAt: options.session?.now?.() ?? new Date().toISOString()
      }, { onChange: syncTree })
      childMcp = await options.hierarchy.openChildMcp(agent.name, createSandboxMcpService, {
        ...options.childMcpOptions,
        session: options.session
      })
      activeChildren.get(agent.name).mcp = childMcp
      const afterProvisioningRejection = options.paymentRejection?.()
      if (afterProvisioningRejection || controller.signal.aborted) {
        throw new Error(afterProvisioningRejection ?? FINANCIAL_SESSION_EXPIRED_MESSAGE)
      }
      const invocation = subagentInvocation(
        options.subagentCommand,
        options.subagentCommandArgs,
        agent.task
      )
      const launch = childMcp.configureLaunch(invocation.command, invocation.args)
      const run = options.runSubagentCommand ?? runSubagentCommand
      agentResult = await run(launch.command, launch.args, {
        env: launch.env,
        signal: controller.signal
      })
      if (!Number.isInteger(agentResult?.code) || agentResult.code !== 0) {
        const detail = agentResult?.stderr ? ` ${agentResult.stderr}` : ''
        throw new Error(`Subagent "${agent.name}" exited unsuccessfully.${detail}`)
      }
      await options.hierarchy.updateAgent(agent.name, {
        agentStatus: 'exited',
        agentExitCode: agentResult.code,
        agentSignal: agentResult.signal ?? null,
        agentFinishedAt: options.session?.now?.() ?? new Date().toISOString()
      }, { onChange: syncTree })
    } catch (error) {
      executionError = error
      try {
        await options.hierarchy.updateAgent(agent.name, {
          agentStatus: controller.signal.aborted ? 'aborted' : 'failed',
          agentExitCode: agentResult?.code ?? null,
          agentSignal: agentResult?.signal ?? null,
          agentFinishedAt: options.session?.now?.() ?? new Date().toISOString()
        }, { onChange: syncTree })
      } catch {}
    } finally {
      if (childMcp) {
        try { await childMcp.close() } catch (error) { cleanupError ??= error }
      }
      activeChildren.delete(agent.name)
      try {
        await options.hierarchy.close(agent.name, { onChange: syncTree })
      } catch (error) {
        cleanupError ??= error
      }
    }
    const node = options.hierarchy.snapshot().nodes.find((entry) => entry.name === agent.name)
    const returned = BigInt(node.usdtReturnedToParentBaseUnits)
    const financialCleanupComplete = node.status === 'closed' && node.disposalStatus === 'disposed'
    const cleanupStatus = financialCleanupComplete && !cleanupError ? 'closed' : 'failed'
    const spent = financialCleanupComplete
      ? formatUsdtBaseUnits(BigInt(node.delegatedBudgetBaseUnits) - returned).replace(/ USDT$/, '')
      : 'unknown'
    const operationError = executionError ?? cleanupError
    return {
      name: agent.name,
      result: boundedText(agentResult?.stdout, operationError
        ? ''
        : 'The child completed without returning textual output.'),
      error: operationError ? boundedText(operationError.message, 'The child failed.') : '',
      budget: formatUsdtBaseUnits(node.delegatedBudgetBaseUnits).replace(/ USDT$/, ''),
      spent,
      returned: formatUsdtBaseUnits(returned).replace(/ USDT$/, ''),
      agentStatus: node.agentStatus === 'exited'
        ? 'exited'
        : controller.signal.aborted ? 'aborted' : 'failed',
      cleanupStatus
    }
  }

  const spawnSubagents = async ({ agents }) => {
    let ownsSpawn = false
    try {
      rejectionError()
      if (spawning) throw new Error('A subagent batch is already running.')
      spawning = true
      ownsSpawn = true
      const parsed = agents.map((agent) => ({ ...agent, amount: parseUsdt(agent.budget) }))
      await options.hierarchy.preflightDelegation(parsed, { assertOpen: rejectionError })
      const provisioned = []
      const results = []
      for (const agent of parsed) {
        try {
          await options.hierarchy.delegate(agent, {
            onChange: syncTree,
            assertOpen: rejectionError
          })
          provisioned.push(agent)
        } catch (error) {
          results.push({ index: parsed.indexOf(agent), value: await closeProvisioningFailure(agent, error) })
        }
      }
      const completed = await Promise.allSettled(provisioned.map((agent) => runChild(agent)))
      for (const [index, outcome] of completed.entries()) {
        const agent = provisioned[index]
        results.push({
          index: parsed.indexOf(agent),
          value: outcome.status === 'fulfilled'
            ? outcome.value
            : await closeProvisioningFailure(agent, outcome.reason)
        })
      }
      const ordered = results.sort((left, right) => left.index - right.index).map((entry) => entry.value)
      const successful = ordered.filter((agent) =>
        agent.agentStatus === 'exited' && agent.cleanupStatus === 'closed').length
      const status = successful === ordered.length
        ? 'complete'
        : successful === 0 ? 'failed' : 'partial_failure'
      const summary = ordered.map((agent) =>
        `${agent.name}: ${agent.agentStatus}, spent ${agent.spent} USDT, returned ${agent.returned} USDT${agent.error ? `: ${agent.error}` : ''}`).join('\n')
      const childResults = ordered
        .filter((agent) => agent.result)
        .map((agent) => `${agent.name}:\n${agent.result}`)
        .join('\n\n')
      return {
        content: [{ type: 'text', text: childResults ? `${summary}\n\n${childResults}` : summary }],
        structuredContent: { status, agents: ordered }
      }
    } catch (error) {
      return toolError(error)
    } finally {
      if (ownsSpawn) spawning = false
    }
  }

  server.registerTool(
    'ration_spawnSubagents',
    {
      title: 'Spawn Ration Subagents',
      description: 'Create 1-3 isolated child EOAs, delegate each exact USDT budget on-chain, then launch all task-only child agents concurrently with wallet-scoped Ration MCP servers. Results and independent cleanup outcomes are returned in input order. Children cannot access parent, sibling, or treasury wallets and cannot spawn descendants.',
      inputSchema: z.object({
        agents: z.array(z.object({
          name: childName.describe('A unique session-local child name, for example "provider-a"'),
          budget: z.string()
            .refine((value) => parseUsdt(value) !== null, 'Must be a positive USDT amount with at most 6 decimals')
            .describe('The exact USDT budget to transfer to this child'),
          task: z.string().min(1).describe('The only task this child agent receives')
        })).min(1).max(MAX_CHILDREN)
          .superRefine((agents, context) => {
            const names = new Set()
            for (const [index, agent] of agents.entries()) {
              if (names.has(agent.name)) {
                context.addIssue({
                  code: z.ZodIssueCode.custom,
                  message: 'Child names must be unique within a batch',
                  path: [index, 'name']
                })
              }
              names.add(agent.name)
            }
          })
      }),
      outputSchema: z.object({
        status: z.enum(['complete', 'partial_failure', 'failed']),
        agents: z.array(z.object({
          name: z.string(),
          result: z.string(),
          error: z.string(),
          budget: z.string(),
          spent: z.string(),
          returned: z.string(),
          agentStatus: z.enum(['exited', 'failed', 'aborted']),
          cleanupStatus: z.enum(['closed', 'failed', 'not_started'])
        }))
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (input) => {
      const operation = spawnSubagents(input)
      pending.add(operation)
      try {
        return await operation
      } finally {
        pending.delete(operation)
      }
    }
  )

  return {
    expireChildren: async () => {
      const active = [...activeChildren.values()]
      for (const child of active) child.controller.abort('SIGTERM')
      await Promise.allSettled(active.map((child) => child.mcp?.expire()))
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
const ROOT_ENABLED_TOOLS = [...SANDBOX_ENABLED_TOOLS, 'ration_spawnSubagents']

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
  const developerInstructions = [
    'Ration has attached a required session-scoped MCP server named `ration`.',
    `Its enabled tools are: ${enabledTools.join(', ')}.`,
    'These tools may appear in Codex as `mcp__ration__<tool>`.',
    'Treat `ration_getCatalog` as the available paid research catalog and call it before claiming that no paid data source or company context is available.',
    'For research requests, inspect `ration_getRemainingBalance`, inspect the catalog, and use `ration_purchaseResource` as appropriate within the disposable sandbox budget.',
    'The absence of Bloomberg, PitchBook, or similar connectors does not mean the Ration paid resources are unavailable.'
  ].join(' ')
  const config = [
    `developer_instructions=${tomlString(developerInstructions)}`,
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
    {
      ...options,
      maxFinancialWrites: options.maxFinancialWrites ??
        (options.hierarchy ? MAX_ROOT_FINANCIAL_WRITES : undefined)
    }
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
  let closePromise
  let expirePromise

  const close = () => {
    closePromise ??= (async () => {
      closed = true
      if (lifecycle !== 'expired') lifecycle = 'closing'
      let closeError
      try {
        await hierarchyControls.expireChildren()
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
    })()
    return closePromise
  }

  const expire = () => {
    if (expirePromise) return expirePromise
    if (lifecycle !== 'open') return Promise.resolve()
    lifecycle = 'expired'
    expirePromise = (async () => {
      await hierarchyControls.expireChildren()
      while (pendingConfirmations.size > 0) {
        await Promise.allSettled([...pendingConfirmations])
      }
    })()
    return expirePromise
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
