/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ExtensionContext } from 'vscode'
import { activate as activateCore, deactivate as deactivateCore } from 'aws-core-vscode'

export async function activate(context: ExtensionContext) {
    await activateCore(context)
}

export async function deactivate() {
    await deactivateCore()
}
