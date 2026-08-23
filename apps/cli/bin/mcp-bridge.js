#!/usr/bin/env node

import { connect } from 'node:net'

const socketPath = process.argv[2]
if (!socketPath) {
  process.stderr.write('Ration MCP bridge endpoint is missing.\n')
  process.exitCode = 1
} else {
  const socket = connect(socketPath)
  socket.once('connect', () => {
    process.stdin.pipe(socket)
    socket.pipe(process.stdout)
  })
  socket.once('error', () => {
    process.stderr.write('Could not connect to the active Ration MCP session.\n')
    process.exitCode = 1
  })
  socket.once('close', () => {
    process.stdin.unpipe(socket)
    process.stdin.pause()
    if (process.exitCode === undefined) process.exitCode = 0
  })
}
