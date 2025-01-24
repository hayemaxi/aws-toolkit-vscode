/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/** Known set of scopes that AWS Toolkit/Amazon Q can use */
const scopes = [
    'sso:account:access',
    'codecatalyst:read_write',
    'codewhisperer:completions',
    'codewhisperer:analysis',
    'codewhisperer:conversations',
    'codewhisperer:taskassist',
    'codewhisperer:transformations',
] as const

export type SsoScope = (typeof scopes)[number]

/** Complete scope set required to use non-CodeCatalyst features of AWS Toolkit */
export const explorerScopes: SsoScope[] = ['sso:account:access']

/** Complete scope set required to use only the CodeCatalyst features of AWS Toolkit */
export const codeCatalystScopes: SsoScope[] = ['sso:account:access', 'codecatalyst:read_write']

/** Complete scope set required to use Amazon Q extension */
export const amazonQScopes: SsoScope[] = [
    'codewhisperer:completions',
    'codewhisperer:analysis',
    'codewhisperer:conversations',
    'codewhisperer:taskassist',
    'codewhisperer:transformations',
]

export function isScope(scope: string) {
    return scopes.includes(scope as SsoScope)
}
