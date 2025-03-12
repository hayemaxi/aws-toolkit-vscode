/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode, { env, version } from 'vscode'
import * as nls from 'vscode-nls'
import * as crypto from 'crypto'
import * as jose from 'jose'
import { LanguageClient, LanguageClientOptions } from 'vscode-languageclient'
import { registerInlineCompletion } from '../app/inline/completion'
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
    GetSsoTokenProgressType,
    GetSsoTokenProgressToken,
    GetSsoTokenProgress,
    ShowMessageRequest,
} from '@aws/language-server-runtimes/protocol'
import { LanguageClientAuth, notificationTypes } from 'aws-core-vscode/auth'
import { MessageActionItem, ShowMessageRequestParams } from 'vscode-languageclient'

const localize = nls.loadMessageBundle()

export function startLanguageServer(extensionContext: vscode.ExtensionContext, resourcePaths: ResourcePaths) {
    const toDispose = extensionContext.subscriptions

    const serverModule =
        '/Volumes/workplace/language-servers/app/aws-lsp-codewhisperer-runtimes/out/token-standalone.js' // resourcePaths.lsp
    const encryptionKey = crypto.randomBytes(32)

    const serverOptions = createServerOptions({
        encryptionKey,
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
                    startUrl: AuthUtil.instance.connection?.startUrl,
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

        client.onRequest<MessageActionItem | null, Error>(
            ShowMessageRequest.method,
            async (params: ShowMessageRequestParams) => {
                const actions = params.actions?.map((a) => a.title) ?? []
                const response = await vscode.window.showInformationMessage(params.message, { modal: true }, ...actions)
                return params.actions?.find((a) => a.title === response) ?? (undefined as unknown as null)
            }
        )

        let promise: Promise<void> | undefined
        let resolver: () => void = () => {}
        client.onProgress(
            GetSsoTokenProgressType,
            GetSsoTokenProgressToken,
            async (partialResult: GetSsoTokenProgress) => {
                const decryptedKey = await jose.compactDecrypt(partialResult as unknown as string, encryptionKey)
                const val: GetSsoTokenProgress = JSON.parse(decryptedKey.plaintext.toString())

                if (val.state === 'InProgress') {
                    if (promise) {
                        resolver()
                    }
                    promise = new Promise<void>((resolve) => {
                        resolver = resolve
                    })
                } else {
                    resolver()
                    promise = undefined
                    return
                }

                void vscode.window.withProgress(
                    {
                        cancellable: true,
                        location: vscode.ProgressLocation.Notification,
                        title: val.message,
                    },
                    async (_) => {
                        await promise
                    }
                )
            }
        )

        AuthUtil.create(new LanguageClientAuth(client, clientId, encryptionKey))
        // const conn = (AuthUtil.instance.conn as SsoConnection) ?? AuthUtil.instance.auth.activeConnection
        // if (conn) {
        //     await Auth2.instance.importOldSsoSession(
        //         conn.startUrl,
        //         conn.ssoRegion,
        //         getRegistrationCacheFile(getCacheDir(), {
        //             startUrl: conn.startUrl,
        //             region: conn.ssoRegion,
        //             scopes: conn.scopes,
        //         }),
        //         getTokenCacheFile(getCacheDir(), (conn.id ?? conn.startUrl) as any)
        //     )
        //     await OldAuthUtil.instance.secondaryAuth.deleteConnection()
        // }
    })
}
