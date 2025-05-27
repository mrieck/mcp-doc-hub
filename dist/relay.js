// src/relay.ts  – Streamable HTTP edition
import { McpServer, } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport, } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
import { ErrorCode, } from '@modelcontextprotocol/sdk/types.js';
import { logger } from './logger.js';
import { config } from './config.js';
/* ------------------------------------------------------------------ */
/*  Tiny helper class for normalising JSON‑RPC errors from the relay  */
/* ------------------------------------------------------------------ */
class RelayRpcError extends Error {
    code;
    data;
    id;
    constructor(message, code, data, id = null) {
        super(message);
        this.code = code;
        this.data = data;
        this.id = id;
        Object.setPrototypeOf(this, RelayRpcError.prototype);
    }
}
/* ------------------------------------------------------------------ */
/*  Main entry – proxy stdio <‑‑> Streamable HTTP upstream            */
/* ------------------------------------------------------------------ */
export async function runRelay() {
    try {
        logger.info('Starting MCP‑Doc‑Hub relay (Streamable HTTP)…');
        const remoteUrl = new URL(config.remoteServerUrl); // leave query string untouched
        /* -------- Transport config: HTTP headers only ------------------ */
        const httpOpts = {
            requestInit: {
                headers: {
                    Authorization: `Bearer ${config.apiKey}`,
                    'x-api-key': config.apiKey,
                    'User-Agent': `${config.clientInfo.name}/${config.clientInfo.version}`,
                },
            },
        };
        const remoteTransport = new StreamableHTTPClientTransport(remoteUrl, httpOpts);
        /* -------- Wrap with high‑level MCP client ---------------------- */
        const clientCaps = {};
        const remoteClient = new Client(config.clientInfo, {
            capabilities: clientCaps,
        });
        let remoteInfo;
        let remoteCaps;
        let remoteInstructions;
        /* -------- Connect & grab server metadata ----------------------- */
        try {
            logger.info(`Connecting upstream: ${remoteUrl.href} (Streamable HTTP)…`);
            await remoteClient.connect(remoteTransport); // POST + keep‑alive GET
            remoteInfo = remoteClient.getServerVersion();
            remoteCaps = remoteClient.getServerCapabilities();
            remoteInstructions = remoteClient.getInstructions();
            if (!remoteInfo || !remoteCaps) {
                throw new Error('Failed to obtain server version/capabilities after connect');
            }
            logger.info(`Upstream ready – ${remoteInfo.name} v${remoteInfo.version}`);
            logger.debug('Capabilities:', remoteCaps);
            if (remoteInstructions) {
                logger.debug('Instructions:', remoteInstructions);
            }
        }
        catch (err) {
            /* fall‑back to SSE if server is older (HTTP 4xx per spec) */
            if (err?.status && err.status >= 400 && err.status < 500) {
                logger.error('Streamable HTTP refused – server might still be on SSE transport', err);
                logger.error('Upgrade the server or keep using the old relay for SSE.');
            }
            throw err;
        }
        /* -------- Expose identical server details to local stdio client */
        const localServer = new McpServer({
            name: remoteInfo.name,
            version: remoteInfo.version,
        }, {
            capabilities: remoteCaps,
            instructions: remoteInstructions,
        });
        /* -------- stdio transport (downstream) ------------------------- */
        const stdioTransport = new StdioServerTransport();
        stdioTransport.onmessage = async (msg) => {
            const m = msg;
            /* ---------- Forward requests -------------------------------- */
            if (m && typeof m.method === 'string' && m.id !== undefined) {
                const req = m;
                // 1️⃣ MINIMAL FIX – intercept stdio 'initialize'
                if (req.method === 'initialize') {
                    /*
                              await stdioTransport.send({
                                jsonrpc: '2.0',
                                id: req.id,
                                result: {
                                  server: remoteInfo,
                                  capabilities: remoteCaps,
                                  instructions: remoteInstructions ?? undefined,
                                },
                              });
                    
                              // emit notifications/initialized upstream so it can start sending deltas
                              await (remoteClient as any).notification({
                                jsonrpc: '2.0',
                                method: 'notifications/initialized',
                              });
                    */
                    await stdioTransport.send({
                        jsonrpc: '2.0',
                        id: req.id,
                        result: {
                            // ① spec‑required top‑level fields
                            protocolVersion: '2025-03-26', // or remoteClient.getProtocolVersion?.()
                            capabilities: remoteCaps,
                            serverInfo: remoteInfo, // NOT “server”
                            instructions: remoteInstructions ?? undefined
                        }
                    });
                    return; // do NOT forward duplicate initialize upstream
                }
                logger.debug(`[RELAY IN] ${req.method} (id: ${req.id})`);
                try {
                    /* 2) call upstream – Streamable HTTP returns only result */
                    const result = await remoteClient.request(req, z.any());
                    /* 3) send back wrapped JSON‑RPC response */
                    await stdioTransport.send({
                        jsonrpc: '2.0',
                        id: req.id,
                        result,
                    });
                    logger.debug(`[RELAY OUT] sent response (id: ${req.id})`);
                }
                catch (err) {
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
                    await remoteClient.notification(m);
                }
                catch (err) {
                    logger.error('Error forwarding notification', err);
                }
            }
            else {
                logger.warn('[RELAY] unknown message from stdio client', m);
            }
        };
        /* -------- Upstream → downstream notifications  ----------------- */
        /*
            (remoteClient as any).on?.('notification', (msg: any) => {
              stdioTransport.send(msg).catch((e: Error) =>
                logger.error('Failed to forward upstream notification', e),
              );
            });
        */
        remoteClient.on?.('notification', (msg) => {
            stdioTransport.send(msg).catch(e => logger.error('Failed to forward upstream notification', e));
        });
        stdioTransport.onclose = async () => {
            logger.info('Downstream stdio closed – shutting upstream connection');
            if (typeof remoteClient.close === 'function') {
                await remoteClient.close();
            }
        };
        /* -------- Ready! ---------------------------------------------- */
        await stdioTransport.start();
        logger.info('Relay running – waiting for stdio messages…');
    }
    catch (overallError) {
        logger.error('CRITICAL relay failure', overallError);
        process.exit(1);
    }
}
/* ------------------------------------------------------------------ */
/*  Helper to normalise/clone upstream errors                          */
/* ------------------------------------------------------------------ */
function mapError(err, id) {
    if (err instanceof RelayRpcError)
        return err;
    const code = err?.code === ErrorCode.ConnectionClosed
        ? ErrorCode.ConnectionClosed
        : ErrorCode?.InternalError ?? -32603;
    const msg = err instanceof Error
        ? `Relay: ${err.message}`
        : `Relay: ${String(err)}`;
    logger.warn('Mapping error to JSON‑RPC', err);
    return new RelayRpcError(msg, code, err?.data || err?.stack, id);
}
//# sourceMappingURL=relay.js.map