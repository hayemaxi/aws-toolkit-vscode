/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthUtil } from 'aws-core-vscode/codewhisperer'
import { SsoConnection, AuthUtils } from 'aws-core-vscode/auth'
import { AuthStatus } from 'aws-core-vscode/telemetry'

/** Provides the status of the Auth connection for Amazon Q, specifically for telemetry purposes. */
export async function getAuthStatus() {
    // Get auth state from the Amazon Q extension
    const authState = (await AuthUtil.instance.getChatAuthState()).codewhispererChat
    const authStatus: AuthStatus = authState === 'connected' || authState === 'expired' ? authState : 'notConnected'

    return {
        authStatus,
        authEnabledConnections: AuthUtils.getAuthFormIdsFromConnection(AuthUtil.instance.conn).join(','),
        authScopes: ((AuthUtil.instance.conn as SsoConnection)?.scopes ?? []).join(','),
    }
}
