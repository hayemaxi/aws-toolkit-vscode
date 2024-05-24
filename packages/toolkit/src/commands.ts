/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { Auth } from 'aws-core-vscode/auth'
import { Commands, globals } from 'aws-core-vscode/shared'
import { telemetry } from 'aws-core-vscode/telemetry'
import { AuthUtils } from 'aws-core-vscode/auth'

function switchConnections(auth: Auth | TreeNode | unknown) {
    if (!(auth instanceof Auth)) {
        try {
            auth = AuthUtils.getResourceFromTreeNode(auth, Instance(Auth))
        } catch {
            // Fall back in case this command is called from something in package.json.
            // If so, then the value of auth will be unusable.
            auth = Auth.instance
        }
    }

    return AuthUtils.promptAndUseConnection(auth)
}

export function registerCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        Commands.register('aws.toolkit.auth.help', async () => {
            await openUrl(vscode.Uri.parse(authHelpUrl))
            telemetry.aws_help.emit()
        }),
        Commands.register('aws.toolkit.auth.switchConnections', (auth: Auth | TreeNode | unknown) => {
            telemetry.ui_click.emit({ elementId: 'devtools_connectToAws' })
            return switchConnections(auth)
        }),
        Commands.register('_aws.toolkit.auth.useIamCredentials', (auth: Auth) => {
            telemetry.ui_click.emit({ elementId: 'explorer_IAMselect_VSCode' })
            return AuthUtils.promptAndUseConnection(auth, 'iam')
        }),
        Commands.register('aws.toolkit.credentials.edit', () => globals.awsContextCommands.onCommandEditCredentials()),
        Commands.register('aws.toolkit.credentials.profile.create', async () => {
            try {
                await globals.awsContextCommands.onCommandCreateCredentialsProfile()
            } finally {
                telemetry.aws_createCredentials.emit()
            }
        }),
        Commands.register('aws.toolkit.login', async () => {
            const connections = await Auth.instance.listConnections()
            if (connections.length === 0) {
                const source: AuthSource = vscodeComponent
                return vscode.commands.executeCommand(getShowConnectPageCommand(), placeholder, source)
            } else {
                return switchConnections(Auth.instance)
            }
        }),
        Commands.register('aws.toolkit.auth.signout', () => {
            telemetry.ui_click.emit({ elementId: 'devtools_signout' })
            signout(Auth.instance)
        }),
        Commands.register('_aws.toolkit.auth.autoConnect', () => Auth.instance.tryAutoConnect())
    )
}
