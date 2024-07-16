/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Due to a circular dependency issue with putting this in extensionUtilities.ts, and an
 * import issue for tests in extensions.ts, we finally put this in its own file.
 */

import globals from './extensionGlobals'
import { VSCODE_EXTENSION_ID } from './extensions'
import { once } from './utilities/functionUtils'

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
