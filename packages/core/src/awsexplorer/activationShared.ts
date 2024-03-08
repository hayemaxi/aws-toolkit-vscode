/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { createToolView, ToolView } from './toolView'
import { telemetry } from '../shared/telemetry/telemetry'
import { cdkNode, CdkRootNode } from '../cdk/explorer/rootNode'
import {
    CodeWhispererNode,
    getCodewhispererNode,
    refreshCodeWhisperer,
    refreshCodeWhispererRootNode,
} from '../codewhisperer/explorer/codewhispererNode'
import { once } from '../shared/utilities/functionUtils'
import { isExtensionActive } from '../shared/utilities/vsCodeUtils'
import { VSCODE_EXTENSION_ID } from '../shared/extensions'

/**
 * Activates vscode Views (eg tree view) that work in any vscode environment (nodejs or browser).
 */
export async function activateViewsShared(context: vscode.ExtensionContext): Promise<void> {
    // TODO: Remove check. To avoid conflicts during testing, do not enable CW
    // if the standalone extension is running.
    if (!isExtensionActive(VSCODE_EXTENSION_ID.amazonq)) {
        registerToolView(getCodeWhispererToolView(), context)
    }
}

export function getCodeWhispererToolView(): ToolView {
    return {
        nodes: [getCodewhispererNode()],
        view: 'aws.codewhisperer',
        refreshCommands: [refreshCodeWhisperer, refreshCodeWhispererRootNode],
    }
}

export function registerToolView(viewNode: ToolView, context: vscode.ExtensionContext) {
    const toolView = createToolView(viewNode)
    context.subscriptions.push(toolView)
    if (viewNode.view === 'aws.cdk') {
        // Legacy CDK behavior. Mostly useful for C9 as they do not have inline buttons.
        toolView.onDidChangeVisibility(({ visible }) => visible && cdkNode.refresh())
    }

    toolView.onDidExpandElement(e => {
        if (e.element.resource instanceof CdkRootNode) {
            // Legacy CDK metric, remove this when we add something generic
            const recordExpandCdkOnce = once(() => telemetry.cdk_appExpanded.emit())
            recordExpandCdkOnce()
        } else if (e.element.resource instanceof CodeWhispererNode) {
            const onDidExpandCodeWhisperer = once(() => telemetry.ui_click.emit({ elementId: 'cw_parentNode' }))
            onDidExpandCodeWhisperer()
        }
    })
}
