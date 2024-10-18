/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ToolkitError } from '../shared/errors'
import globals from '../shared/extensionGlobals'
import { globalKey } from '../shared/globalState'
import { NotificationsState, NotificationType, State, ToolkitNotification } from './types'
import { HttpResourceFetcher } from '../shared/resourcefetcher/httpResourceFetcher'
import { getLogger } from '../shared/logger/logger'
import { NotificationsNode } from './notificationsNode'
import { Commands } from '../shared/vscode/commands2'
import { RuleEngine } from './rules'
import { TreeNode } from '../shared/treeview/resourceTreeDataProvider'
import { withRetries } from '../shared/utilities/functionUtils'

const startUpEndpoint = 'https://idetoolkits-hostedfiles.amazonaws.com/Notifications/VSCode/emergency/1.x.json' // TODO: SHOULD BE STARTUP/ BUT IT DOESNT EXIST YET
const emergencyEndpoint = 'https://idetoolkits-hostedfiles.amazonaws.com/Notifications/VSCode/emergency/1.x.json'

export class NotificationsController {
    private readonly storageKey: globalKey
    private readonly state: NotificationsState
    private readonly notificationsNode: NotificationsNode

    static #instance: NotificationsController | undefined

    constructor(extPrefix: 'amazonq' | 'toolkit', node: NotificationsNode) {
        NotificationsController.#instance = this

        this.storageKey = `_aws.test.${extPrefix}.notifications`
        this.notificationsNode = node
        this.state = globals.globalState.get(this.storageKey, {
            startUp: {} as State,
            emergency: {} as State,
            dismissed: [],
        })!

        globals.context.subscriptions.push(
            Commands.register(`_aws.${extPrefix}.notifications.dismiss`, async (node: TreeNode) => {
                const item = node?.getTreeItem()
                if (item instanceof vscode.TreeItem && item.command?.arguments) {
                    // The command used to build the TreeNode contains the notification as an argument.
                    /** See {@link NotificationsNode} for more info. */
                    const notification = item.command?.arguments[0] as ToolkitNotification
                    await NotificationsController.instance.dismissNotification(notification.id)
                } else {
                    getLogger().debug('Cannot dismiss notification: item is not a vscode.TreeItem')
                }
            })
        )
    }

    public pollForStartUp(ruleEngine: RuleEngine) {
        return this.poll(ruleEngine, 'startUp')
    }

    public pollForEmergencies(ruleEngine: RuleEngine) {
        return this.poll(ruleEngine, 'emergency')
    }

    // private async poll(ruleEngine: RuleEngine, category: NotificationType) {
    //     try {
    //         await this.updateNotifications(category)
    //         const dismissed = new Set(this.state.dismissed)
    //         this.state[category].payload?.notifications.forEach((n) => {
    //             if (category === 'startUp' && dismissed.has(n.id)) {
    //                 return
    //             }

    //             if (ruleEngine.shouldDisplayNotification(n)) {
    //                 NotificationsNode.instance.addNotification(n, category)
    //             }
    //         })
    //     } catch (err: any) {
    //         getLogger().error(`Unable to fetch or display %s notifications.`, category, err)
    //     }
    // }

    // public async dismissNotification(notificationId: string) {
    //     this.state.dismissed.push(notificationId)
    //     await this.writeState()
    //     NotificationsNode.instance.dismissNotification(notificationId)
    // }

    private async poll(ruleEngine: RuleEngine, category: NotificationType) {
        try {
            await this.fetchNotifications(category)
        } catch (err: any) {
            getLogger().error(`Unable to fetch %s notifications.`, category, err)
        }

        await this.displayNotifications(ruleEngine)
    }

    private async displayNotifications(ruleEngine: RuleEngine) {
        const dismissed = new Set(this.state.dismissed)
        const startUp =
            this.state.startUp.payload?.notifications.filter(
                (n) => !dismissed.has(n.id) && ruleEngine.shouldDisplayNotification(n)
            ) ?? []
        const emergency = (this.state.emergency.payload?.notifications ?? []).filter((n) =>
            ruleEngine.shouldDisplayNotification(n)
        )

        NotificationsNode.instance.setNotifications(startUp, emergency)

        // Emergency notifications can't be dismissed, but if the user minimizes the panel then
        // we don't want to focus it each time we set the notification nodes.
        // So we store it in dismissed once a focus has been fired for it.
        const newEmergencies = emergency.map((n) => n.id).filter((id) => !dismissed.has(id))
        if (newEmergencies.length > 0) {
            this.state.dismissed = [...this.state.dismissed, ...newEmergencies]
            await this.writeState()
            void this.notificationsNode.focusPanel()
        }
    }

    /**
     * Permanently hides a notification from view. Only 'startUp' notifications can be dismissed.
     * Users are able to collapse or hide the notifications panel in native VSC if they want to
     * hide all notifications.
     */
    public async dismissNotification(notificationId: string) {
        getLogger().debug('Dismissing notification: %s', notificationId)
        this.state.dismissed.push(notificationId)
        await this.writeState()

        NotificationsNode.instance.dismissStartUpNotification(notificationId)
    }

    private async fetchNotifications(category: NotificationType) {
        const fetcher = new HttpResourceFetcher(category === 'startUp' ? startUpEndpoint : emergencyEndpoint, {
            showUrl: true,
        })

        const response = await withRetries(async () => await fetcher.getNewETagContent(this.state[category].etag), {
            maxRetries: 4,
            delay: 1000,
            backoff: 2,
        })

        if (response) {
            getLogger().verbose('ETAG has changed for notifications category: %s', category)
            if (response.content) {
                this.state[category].payload = JSON.parse(response.content)

                // TESTING DELETE THIS:
                this.state[category].payload!.notifications = [
                    {
                        id: category === 'startUp' ? 'id:startup1' : 'id:emergency1',
                        displayIf: {
                            extensionId: 'amazonwebservices.amazon-q-vscode',
                        },
                        uiRenderInstructions: {
                            content: {
                                [`en-US`]: {
                                    title: category === 'startUp' ? "What's New" : 'Emergency: Broken stuff',
                                    description: 'Something crazy is happening! Please update your extension.',
                                },
                            },
                        },
                    },
                ]
            }
            // this.state[category].etag = response.eTag
            // TESTING DELETE THIS AND RESTORE ABOVE:
            this.state[category].etag = undefined

            getLogger().verbose(
                "Fetched notifications JSON for category '%s' with schema version: %s. There were %d notifications.",
                category,
                this.state[category].payload?.schemaVersion,
                this.state[category].payload?.notifications?.length
            )
        } else {
            getLogger().verbose('No new notifications for category: %s', category)
        }

        await this.writeState()
    }

    private async writeState() {
        getLogger().debug('NotificationsController: Updating notifications state at %s', this.storageKey)

        // Clean out anything in 'dismissed' that doesn't exist anymore.
        const notifications = new Set(
            [
                ...(this.state.startUp.payload?.notifications ?? []),
                ...(this.state.emergency.payload?.notifications ?? []),
            ].map((n) => n.id)
        )
        this.state.dismissed = this.state.dismissed.filter((id) => notifications.has(id))

        await globals.globalState.update(this.storageKey, this.state)
    }

    static get instance() {
        if (this.#instance === undefined) {
            throw new ToolkitError('NotificationsController was accessed before it has been initialized.')
        }

        return this.#instance
    }
}
