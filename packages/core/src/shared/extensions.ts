/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AwsContext } from './awsContext'
import { RegionProvider } from './regions/regionProvider'
import { TelemetryService } from './telemetry/telemetryService'
import { CredentialsStore } from '../auth/credentials/store'
import { SamCliContext } from './sam/cli/samCliContext'
import { UriHandler } from './vscode/uriHandler'
import { once } from './utilities/functionUtils'
import globals from './extensionGlobals'

// eslint-disable-next-line @typescript-eslint/naming-convention
export const VSCODE_EXTENSION_ID = {
    awstoolkit: 'amazonwebservices.aws-toolkit-vscode',
    amazonq: 'amazonwebservices.amazon-q-vscode',
    awstoolkitcore: 'amazonwebservices.aws-core-vscode', // Core "extension" for tests - not a real extension.
    python: 'ms-python.python',
    // python depends on jupyter plugin
    jupyter: 'ms-toolsai.jupyter',
    yaml: 'redhat.vscode-yaml',
    go: 'golang.go',
    java: 'redhat.java',
    javadebug: 'vscjava.vscode-java-debug',
    dotnet: 'ms-dotnettools.csdevkit',
    git: 'vscode.git',
    remotessh: 'ms-vscode-remote.remote-ssh',
} as const

export const vscodeExtensionMinVersion = {
    remotessh: '0.74.0',
}

/**
 * Long-lived, extension-scoped, shared globals.
 */
export interface ExtContext {
    extensionContext: vscode.ExtensionContext
    awsContext: AwsContext
    samCliContext: () => SamCliContext
    regionProvider: RegionProvider
    outputChannel: vscode.OutputChannel
    telemetryService: TelemetryService
    credentialsStore: CredentialsStore
    uriHandler: UriHandler
}

/**
 * Version of the .vsix produced by package.ts with the --debug option.
 */
export const extensionAlphaVersion = '99.0.0-SNAPSHOT'

function _isAmazonQ() {
    const id = globals.context.extension.id
    const isToolkit = id === VSCODE_EXTENSION_ID.awstoolkit || id === VSCODE_EXTENSION_ID.awstoolkitcore
    const isQ = id === VSCODE_EXTENSION_ID.amazonq
    if (!isToolkit && !isQ) {
        throw Error(`unexpected extension id: ${id}`) // sanity check
    }
    return isQ
}

/** True if the current extension is "Amazon Q", else the current extension is "AWS Toolkit". */
export const isAmazonQ = once(_isAmazonQ)
