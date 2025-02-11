/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode, { env, version } from 'vscode'
import * as nls from 'vscode-nls'
import * as crypto from 'crypto'
import { LanguageClient, LanguageClientOptions } from 'vscode-languageclient'
import { registerInlineCompletion } from '../app/inline/completion'
import { notificationTypes } from './auth'
import { AuthUtil } from 'aws-core-vscode/codewhisperer'
import {
    ResourcePaths,
    Settings,
    createServerOptions,
    oidcClientName,
    globals,
    getLogger,
    openUrl,
} from 'aws-core-vscode/shared'
import {
    ConnectionMetadata,
    ShowDocumentParams,
    ShowDocumentRequest,
    ShowDocumentResult,
} from '@aws/language-server-runtimes/protocol'
import { Auth2, SsoConnection, getRegistrationCacheFile, getTokenCacheFile, getCacheDir } from 'aws-core-vscode/auth'

const localize = nls.loadMessageBundle()

export function startLanguageServer(extensionContext: vscode.ExtensionContext, resourcePaths: ResourcePaths) {
    const toDispose = extensionContext.subscriptions

    const serverModule = resourcePaths.lsp

    const serverOptions = createServerOptions({
        encryptionKey: Auth2.encryptionKey,
        executable: resourcePaths.node,
        serverModule,
        execArgv: [
            '--nolazy',
            '--preserve-symlinks',
            '--stdio',
            '--pre-init-encryption',
            '--set-credentials-encryption-key',
        ],
    })

    const documentSelector = [{ scheme: 'file', language: '*' }]

    const clientId = 'amazonq'
    const traceServerEnabled = Settings.instance.isSet(`${clientId}.trace.server`)

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        // Register the server for json documents
        documentSelector,
        initializationOptions: {
            aws: {
                clientInfo: {
                    name: env.appName,
                    version: version,
                    extension: {
                        name: oidcClientName(),
                        version: '0.0.1',
                    },
                    clientId: crypto.randomUUID(),
                },
                awsClientCapabilities: {
                    window: {
                        notifications: true,
                    },
                },
            },
            credentials: {
                providesBearerToken: true,
            },
        },
        /**
         * When the trace server is enabled it outputs a ton of log messages so:
         *   When trace server is enabled, logs go to a seperate "Amazon Q Language Server" output.
         *   Otherwise, logs go to the regular "Amazon Q Logs" channel.
         */
        ...(traceServerEnabled
            ? {}
            : {
                  outputChannel: globals.logOutputChannel,
              }),
    }

    const lspName = localize('amazonq.server.name', 'Amazon Q Language Server')
    const client = new LanguageClient(clientId, lspName, serverOptions, clientOptions)

    const disposable = client.start()
    toDispose.push(disposable)

    return client.onReady().then(async () => {
        registerInlineCompletion(client)

        // Request handler for when the server wants to know about the clients auth connnection
        client.onRequest<ConnectionMetadata, Error>(notificationTypes.getConnectionMetadata.method, () => {
            return {
                sso: {
                    startUrl: AuthUtil.instance.auth.startUrl,
                },
            }
        })

        client.onRequest<ShowDocumentResult, Error>(ShowDocumentRequest.method, async (params: ShowDocumentParams) => {
            try {
                return { success: await openUrl(vscode.Uri.parse(params.uri), lspName) }
            } catch (err: any) {
                getLogger().error(`Failed to open document for LSP: ${lspName}, error: %s`, err)
                return { success: false }
            }
        })

        // toDispose.push(
        //     AuthUtil.instance.auth.onDidChangeActiveConnection(async () => {
        //         await auth.init()
        //     }),
        //     AuthUtil.instance.auth.onDidDeleteConnection(async () => {
        //         client.sendNotification(notificationTypes.deleteBearerToken.method)
        //     })
        // )
        Auth2.create(client)
        const conn = (AuthUtil.instance.conn as SsoConnection) ?? AuthUtil.instance.auth.activeConnection
        if (conn) {
            await Auth2.instance.importOldSsoSession(
                conn.startUrl,
                conn.ssoRegion,
                getRegistrationCacheFile(getCacheDir(), {
                    startUrl: conn.startUrl,
                    region: conn.ssoRegion,
                    scopes: conn.scopes,
                }),
                getTokenCacheFile(getCacheDir(), (conn.id ?? conn.startUrl) as any)
            )
            await AuthUtil.instance.secondaryAuth.deleteConnection()
        }
    })
}
