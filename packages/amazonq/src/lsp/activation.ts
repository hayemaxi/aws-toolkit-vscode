/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import { startLanguageServer } from './client'
import { AmazonQLspInstaller } from './lspInstaller'
import { lspSetupStage, ToolkitError } from 'aws-core-vscode/shared'
import { registerInlineCompletion } from '../app/inline/completion'
import { Commands } from 'aws-core-vscode/shared'
import { Experiments } from 'aws-core-vscode/shared'
import { AuthUtil } from 'aws-core-vscode/codewhisperer'

export async function activate(ctx: vscode.ExtensionContext): Promise<boolean> {
    try {
        const client = await lspSetupStage('all', async () => {
            const installResult = await new AmazonQLspInstaller().resolve()
            return await lspSetupStage('launch', () => startLanguageServer(ctx, installResult.resourcePaths))
        })
        await client.onReady()
        await AuthUtil.instance.restore()
        if (Experiments.instance.get('amazonqLSP', false)) {
            registerInlineCompletion(client)
            ctx.subscriptions.push(
                Commands.register({ id: 'aws.amazonq.invokeInlineCompletion', autoconnect: true }, async () => {
                    await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger')
                }),
                Commands.declare('aws.amazonq.rejectCodeSuggestion', () => async () => {
                    await vscode.commands.executeCommand('editor.action.inlineSuggest.hide')
                }).register()
            )
        }
        return true
    } catch (err) {
        const e = err as ToolkitError
        void vscode.window.showInformationMessage(`Unable to launch amazonq language server: ${e.message}`)
        return false
    }
}
