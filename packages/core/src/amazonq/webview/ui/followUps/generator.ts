/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MynahIcons } from '@aws/mynah-ui'
import { TabType } from '../storages/tabsStorage'
import { FollowUpsBlock } from './model'

export type AuthFollowUpType = 'full-auth' | 're-auth'

export class FollowUpGenerator {
    public generateAuthFollowUps(tabType: TabType, authType: AuthFollowUpType): FollowUpsBlock {
        const pillText = authType === 'full-auth' ? 'Authenticate' : 'Re-authenticate'
        switch (tabType) {
            default:
                return {
                    text: '',
                    options: [
                        {
                            pillText,
                            type: authType,
                            status: 'info',
                            icon: 'refresh' as MynahIcons,
                        },
                    ],
                }
        }
    }

    public generateWelcomeBlockForTab(tabType: TabType): FollowUpsBlock {
        switch (tabType) {
            case 'featuredev':
                return {
                    text: 'Ask a follow up question',
                    options: [
                        {
                            pillText: 'What are some examples of tasks?',
                            type: 'DevExamples',
                        },
                    ],
                }
            case 'doc':
                return {
                    text: 'Select one of the following...',
                    options: [
                        {
                            pillText: 'Create a README',
                            prompt: 'Create a README',
                            type: 'CreateDocumentation',
                        },
                        {
                            pillText: 'Update an existing README',
                            prompt: 'Update an existing README',
                            type: 'UpdateDocumentation',
                        },
                    ],
                }
            default:
                return {
                    text: 'Try Examples:',
                    options: [
                        {
                            pillText: 'Explain selected code',
                            prompt: 'Explain selected code',
                            type: 'init-prompt',
                        },
                        {
                            pillText: 'How can Amazon Q help me?',
                            type: 'help',
                        },
                    ],
                }
        }
    }
}
