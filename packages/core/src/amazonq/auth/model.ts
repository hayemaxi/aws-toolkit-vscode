/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export type AuthFollowUpType = 'full-auth' | 're-auth'

export type AuthMessageData = {
    message: string
}

const reauthenticateData: AuthMessageData = {
    message: `You don't have access to Amazon Q. Please authenticate to get started.`,
}

export const AuthMessageDataMap: Record<AuthFollowUpType, AuthMessageData> = {
    'full-auth': reauthenticateData,
    're-auth': reauthenticateData,
}
