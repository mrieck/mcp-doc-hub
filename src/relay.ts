// src/relay.ts  – Streamable HTTP edition
import {
  McpServer,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StreamableHTTPClientTransport,
  StreamableHTTPClientTransportOptions,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import { z } from 'zod';

import {
  ErrorCode,
  JSONRPCRequest,
  JSONRPCNotification,
  ClientCapabilities,
  Implementation,
  ServerCapabilities,
} from '@modelcontextprotocol/sdk/types.js';

import { logger } from './logger.js';
import { config } from './config.js';

/* ------------------------------------------------------------------ */
/*  Tiny helper class for normalising JSON‑RPC errors from the relay  */
/* ------------------------------------------------------------------ */
class RelayRpcError extends Error {
  code: number;
  data?: unknown;
  id: string | number | null;

  constructor(
    message: string,
    code: number,
    data?: unknown,
    id: string | number | null = null,
  ) {
    super(message);
    this.code = code;
    this.data = data;
    this.id = id;
    Object.setPrototypeOf(this, RelayRpcError.prototype);
  }
}

/* ------------------------------------------------------------------ */
/*  Main entry – proxy stdio <‑‑> Streamable HTTP upstream            */
/* ------------------------------------------------------------------ */
export async function runRelay() {
  try {
    logger.info('Starting MCP‑Doc‑Hub relay (Streamable HTTP)…');

    const remoteUrl = new URL(config.remoteServerUrl); // leave query string untouched

    /* -------- Transport config: HTTP headers only ------------------ */
    const httpOpts: StreamableHTTPClientTransportOptions = {
      requestInit: {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'x-api-key': config.apiKey,
          'User-Agent': `${config.clientInfo.name}/${config.clientInfo.version}`,
        },
      },
    };

    const remoteTransport = new StreamableHTTPClientTransport(
      remoteUrl,
      httpOpts,
    ); /* Spec v2025‑03‑26 :contentReference[oaicite:0]{index=0} */

    /* -------- Wrap with high‑level MCP client ---------------------- */
    const clientCaps: ClientCapabilities = {};
    const remoteClient = new Client(config.clientInfo, {
      capabilities: clientCaps,
    });

    let remoteInfo: Implementation | undefined;
    let remoteCaps: ServerCapabilities | undefined;
    let remoteInstructions: string | undefined;

    /* -------- Connect & grab server metadata ----------------------- */
    try {
      logger.info(
        `Connecting upstream: ${remoteUrl.href} (Streamable HTTP)…`,
      );
      await remoteClient.connect(remoteTransport); /* connects via POST then keeps GET event stream open :contentReference[oaicite:1]{index=1} */

      remoteInfo = remoteClient.getServerVersion();
      remoteCaps = remoteClient.getServerCapabilities();
      remoteInstructions = remoteClient.getInstructions();

      if (!remoteInfo || !remoteCaps) {
        throw new Error(
          'Failed to obtain server version/capabilities after connect',
        );
      }

      logger.info(
        `Upstream ready – ${remoteInfo.name} v${remoteInfo.version}`,
      );
      logger.debug('Capabilities:', remoteCaps);
      if (remoteInstructions) {
        logger.debug('Instructions:', remoteInstructions);
      }
    } catch (err: any) {
      /* fall‑back to SSE if server is older (HTTP 4xx per spec) */
      if (err?.status && err.status >= 400 && err.status < 500) {
        logger.error(
          'Streamable HTTP refused – server might still be on SSE transport',
          err,
        );
        logger.error(
          'Upgrade the server or keep using the old relay for SSE.',
        );
      }
      throw err;
    }

    /* -------- Expose identical server details to local stdio client */
    const localServer = new McpServer(
      {
        name: remoteInfo.name,
        version: remoteInfo.version,
      },
      {
        capabilities: remoteCaps,
        instructions: remoteInstructions,
      },
    );

    /* -------- stdio transport (downstream) ------------------------- */
    const stdioTransport = new StdioServerTransport();

    stdioTransport.onmessage = async (msg: unknown) => {
      const m = msg as any;

      /* ---------- Forward requests -------------------------------- */
      if (m && typeof m.method === 'string' && m.id !== undefined) {
        const req = m as JSONRPCRequest;
        logger.debug(`[RELAY IN] ${req.method} (id: ${req.id})`);

        try {
          /* 1) call upstream – Streamable HTTP returns only result */
          const result = await remoteClient.request(req, z.any());

          /* 2) send back wrapped JSON‑RPC response */
          await stdioTransport.send({
            jsonrpc: '2.0',
            id: req.id,
            result,
          });

          logger.debug(`[RELAY OUT] sent response (id: ${req.id})`);
        } catch (err) {
          logger.error('Error forwarding request', err);
          const rpcErr = mapError(err, req.id);
          await stdioTransport.send({
            jsonrpc: '2.0',
            id: req.id,
            error: {
              code: rpcErr.code,
              message: rpcErr.message,
              data: rpcErr.data,
            },
          });
        }
      }

      /* ---------- Forward notifications --------------------------- */
      else if (m && typeof m.method === 'string') {
        try {
          await (remoteClient as any).notification(m);
        } catch (err) {
          logger.error('Error forwarding notification', err);
        }
      } else {
        logger.warn('[RELAY] unknown message from stdio client', m);
      }
    };

    /* -------- Upstream → downstream notifications  ----------------- */
    if ((remoteTransport as any).on) {
      (remoteTransport as any).on('message', (msg: any) => {
        if (msg && typeof msg.method === 'string' && msg.id === undefined) {
          stdioTransport.send(msg).catch((e: Error) =>
            logger.error('Failed to forward upstream notification', e),
          );
        }
      });
      (remoteTransport as any).on('error', (e: Error) => {
        logger.error('Upstream transport error', e);
        stdioTransport.close().catch(() => {});
      });
      (remoteTransport as any).on('close', () => {
        logger.info('Upstream transport closed');
        stdioTransport.close().catch(() => {});
      });
    } else {
      logger.warn(
        'remoteTransport is not an event emitter – cannot forward notifications',
      );
    }

    stdioTransport.onclose = async () => {
      logger.info('Downstream stdio closed – shutting upstream connection');
      if (typeof (remoteClient as any).close === 'function') {
        await (remoteClient as any).close();
      }
    };

    /* -------- Ready! ---------------------------------------------- */
    await stdioTransport.start();
    logger.info('Relay running – waiting for stdio messages…');
  } catch (overallError: any) {
    logger.error('CRITICAL relay failure', overallError);
    process.exit(1);
  }
}

/* ------------------------------------------------------------------ */
/*  Helper to normalise/clone upstream errors                          */
/* ------------------------------------------------------------------ */
function mapError(err: any, id: string | number | null): RelayRpcError {
  if (err instanceof RelayRpcError) return err;

  const code =
    err?.code === ErrorCode.ConnectionClosed
      ? ErrorCode.ConnectionClosed
      : (ErrorCode as any)?.InternalError ?? -32603;

  const msg =
    err instanceof Error
      ? `Relay: ${err.message}`
      : `Relay: ${String(err)}`;

  logger.warn('Mapping error to JSON‑RPC', err);
  return new RelayRpcError(msg, code, err?.data || err?.stack, id);
}
