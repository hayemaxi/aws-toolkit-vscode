/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path'
import { InitResponseMessage, MessageType, WebviewContext, Command } from '../types'
import { getAmazonqApi } from '../../amazonq/extApi'

export async function initMessageHandler(context: WebviewContext) {
    const filePath = context.defaultTemplatePath
    const amazonqApi = await getAmazonqApi()
    let isConnectedToCodeWhisperer = false
    if (amazonqApi) {
        const authState = await amazonqApi.authApi.getAuthState()
        isConnectedToCodeWhisperer = authState === 'connected' || authState === 'expired'
    }

    const responseMessage: InitResponseMessage = {
        messageType: MessageType.RESPONSE,
        command: Command.INIT,
        templateFileName: path.basename(filePath),
        templateFilePath: filePath,
        isConnectedToCodeWhisperer,
    }

    await context.panel.webview.postMessage(responseMessage)
}
