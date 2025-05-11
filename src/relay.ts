// src/relay.ts
import {
    McpServer,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport, SSEClientTransportOptions } from '@modelcontextprotocol/sdk/client/sse.js';
import type { EventSourceInit } from "eventsource";
import { z } from "zod";

import {
    InitializeResult,
    Notification,
    Request,
    ErrorCode,
    JSONRPCResponse,
    JSONRPCNotification,
    JSONRPCRequest,
    ClientCapabilities,
    Implementation,
    LATEST_PROTOCOL_VERSION,
    ServerCapabilities
} from '@modelcontextprotocol/sdk/types.js';

import { logger } from './logger.js';
import { config } from './config.js';

class RelayRpcError extends Error {
    code: number;
    data?: any;
    id: string | number | null;

    constructor(message: string, code: number, data?: any, id: string | number | null = null) {
        super(message);
        this.code = code;
        this.data = data;
        this.id = id;
        Object.setPrototypeOf(this, RelayRpcError.prototype);
    }
}

export async function runRelay() {
    try {
        logger.info('Starting MCP Doc Hub Relay...');

        const remoteUrl = new URL(config.remoteServerUrl);
        remoteUrl.searchParams.set("api_key", config.apiKey);

        const sseTransportOptions: SSEClientTransportOptions = {
            eventSourceInit: {
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'x-api-key':     config.apiKey,
                    'User-Agent': `${config.clientInfo.name}/${config.clientInfo.version}`
                }
            } as EventSourceInit,
            requestInit: {
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'x-api-key':     config.apiKey,
                    'User-Agent': `${config.clientInfo.name}/${config.clientInfo.version}`
                } 
            }
        };
	logger.info('Send headers key...' + config.apiKey);
        const remoteTransport = new SSEClientTransport(remoteUrl, sseTransportOptions);
        
        const clientOwnCapabilities: ClientCapabilities = {}; 
        const remoteClient = new Client(config.clientInfo, { capabilities: clientOwnCapabilities });

        let remoteServerInfo: Implementation | undefined;
        let remoteCapabilities: ServerCapabilities | undefined;
        let remoteServerInstructions: string | undefined;


        try {
            logger.info(`Connecting to remote server at ${remoteUrl.href} using SSEClientTransport...`);
            await remoteClient.connect(remoteTransport);
            logger.info('Transport connected. Retrieving server info/capabilities...');

            remoteServerInfo = remoteClient.getServerVersion();
            remoteCapabilities = remoteClient.getServerCapabilities();
            remoteServerInstructions = remoteClient.getInstructions();


            if (!remoteServerInfo || !remoteCapabilities) {
                throw new Error('Failed to retrieve server info or capabilities after connect.');
            }

            logger.info(`Successfully initialized with remote server: ${remoteServerInfo.name} v${remoteServerInfo.version}`);
            logger.debug('Remote Server Capabilities:', remoteCapabilities);
            if (remoteServerInstructions) {
                logger.debug('Remote Server Instructions:', remoteServerInstructions);
            }

        } catch (error: any) {
            logger.error('Failed to connect to or initialize remote server.', error);
             if (error.code === ErrorCode.InvalidParams || error.code === -32603 || error.code === -32600) {
                 logger.error('JSON-RPC Error from remote during initialize:', error.data || error.message);
             } else if (error.event && typeof error.code === 'number') {
                 logger.error(`SSE Connection Error to remote: Status ${error.code}, Message: ${error.message}`, error.event);
             } else {
                 logger.error('Unknown error during connection-initialization:', error.message);
             }
            process.exit(1);
            return;
        }

        const serverInfoForLocalRelay: Implementation = {
            name: remoteServerInfo.name,
            version: remoteServerInfo.version,
        };
        
        const serverOptionsForLocalRelay = {
            capabilities: remoteCapabilities,
            instructions: remoteServerInstructions, 
        };

	const localRelayServer = new McpServer(
	    {                        
		name:  remoteServerInfo.name!,
		version: remoteServerInfo.version!
	    },
	    serverOptionsForLocalRelay  
	);

        logger.info('Configuring local stdio message forwarding...');
        const localStdioTransport = new StdioServerTransport();
/*
        localStdioTransport.onmessage = async (message: any) => {
            if (message && typeof message.method === 'string' && typeof message.id !== 'undefined') {
                const request = message as JSONRPCRequest;
                logger.debug(`[RELAY IN] Request from stdio: ${request.method} (id: ${request.id})`);
                try {
                    const response: JSONRPCResponse = await (remoteClient as any).request(request);
                    logger.debug(`[RELAY OUT] Response to stdio for id ${response.id}`);
                    await localStdioTransport.send(response);
                } catch (error: any) {
                    logger.error(`Error forwarding request (id: ${request.id}) to remote or processing its response.`, error);
                    const rpcError = mapError(error, request.id);
                    await localStdioTransport.send({
                        jsonrpc: "2.0", id: request.id,
                        error: { code: rpcError.code, message: rpcError.message, data: rpcError.data }
                    });
                }
            } else if (message && typeof message.method === 'string' && typeof message.id === 'undefined') {
                const notification = message as JSONRPCNotification;
                logger.debug(`[RELAY IN] Notification from stdio: ${notification.method}`);
                try {
                    if (typeof (remoteClient as any).notification === 'function') {
                        await (remoteClient as any).notification(notification);
                    } else {
                         logger.warn(`[RELAY WARN] Remote client doesn't have a generic .notification() method. Cannot forward notification: ${notification.method}`);
                    }
                } catch (error) {
                    logger.error(`Error forwarding notification (${notification.method}) to remote.`, error);
                }
            } else {
                logger.warn('[RELAY WARN] Received unknown message type from stdio client:', message);
            }
        };
*/
	localStdioTransport.onmessage = async (msg: unknown) => {
	  const m = msg as any;
	  if (m && typeof m.method === "string" && m.id !== undefined) {
	    const req = m as JSONRPCRequest;
	    logger.debug(`[RELAY IN] ${req.method} (id: ${req.id})`);

	    try {
	      // -------- 1) call remote, get ONLY the 'result' payload
	      const result = await remoteClient.request(req, z.any());

	      // -------- 2) wrap it in a valid JSONRPC response
	      await localStdioTransport.send({
		jsonrpc: "2.0",
		id: req.id,
		result
	      });

	      logger.debug("[RELAY OUT] sent response", { id: req.id });
	    } catch (err) {
	      logger.error("Error forwarding request", err);
	      const rpcError = mapError(err, req.id);
	      await localStdioTransport.send({
		jsonrpc: "2.0",
		id: req.id,
		error: {
		  code: rpcError.code,
		  message: rpcError.message,
		  data: rpcError.data
		}
	      });
	    }
	  } else if (m && typeof m.method === "string") {
	    try {
	      await (remoteClient as any).notification(m);
	    } catch (err) {
	      logger.error("Error forwarding notification", err);
	    }
	  } else {
	    logger.warn("[RELAY WARN] Unknown message from stdio client", msg);
	  }
	};

        if ((remoteTransport as any).on) {
            logger.info('Setting up remote SSE -> local stdio notification forwarder...');
            (remoteTransport as any).on('message', (message: any ) => {
                if (message && typeof message.method === 'string' && typeof message.id === 'undefined') {
                    logger.debug(`[RELAY OUT] Notification from remote SSE to stdio: ${message.method}`);
                    localStdioTransport.send(message).catch(sendError => {
                        logger.error('Failed to forward notification to local client', sendError);
                    });
                } else if (message && typeof message.id !== 'undefined') {
                    logger.debug('[RELAY DEBUG] Response from remote SSE', message);
                } else {
                    logger.warn('[RELAY WARN] Received unexpected message type from remote transport event', message);
                }
            });
            (remoteTransport as any).on('error', (err: Error) => {
                logger.error('Error on remote transport event emitter.', err);
                localStdioTransport.close().catch(e => logger.error("Error closing local stdio transport on remote error", e));
            });
            (remoteTransport as any).on('close', () => {
                logger.info('Remote transport event emitter closed.');
                localStdioTransport.close().catch(e => logger.error("Error closing local stdio transport on remote close", e));
            });
        } else {
            logger.warn('Cannot set up remote -> local notification forwarder: remoteTransport is not an event emitter.');
        }

        localStdioTransport.onclose = async () => {
            logger.info('Local stdio transport closed. Closing remote connection.');
            if (remoteClient && typeof (remoteClient as any).close === 'function') {
                await (remoteClient as any).close();
            }
            logger.info('Remote connection closed.');
        };

        logger.info('Starting local stdio transport...');
        await localStdioTransport.start();

        logger.info('MCP Doc Hub Relay is running and proxying stdio messages.');
        logger.info('Waiting for messages from local client on stdin...');

    } catch (overallError: any) {
        logger.error('CRITICAL: Unhandled error in runRelay top level.', overallError);
        process.exit(1);
    }
}

function mapError(error: any, id: string | number | null): RelayRpcError {
     if (error instanceof RelayRpcError) {
        return new RelayRpcError(error.message, error.code, error.data, id);
     }
     const errorCode = (error as any)?.code === ErrorCode.ConnectionClosed ? ErrorCode.ConnectionClosed :
                       (ErrorCode as any)?.InternalError ?? -32603;

     let message = 'Relay: Internal error processing request.';
     if (error instanceof Error) {
         message = 'Relay: ' + error.message;
     } else if (typeof error === 'string') {
         message = 'Relay: ' + error;
     }

     logger.warn(`Mapping generic error to RelayRpcError: Original error: ${error.message || error}`, { originalError: error });
     return new RelayRpcError(
         message,
         errorCode,
         error?.data || error?.stack,
         id
     );
}