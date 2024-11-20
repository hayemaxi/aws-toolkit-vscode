/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { DevSettings } from '../shared/settings'
import { DevFetcher, NotificationFetcher, NotificationsController, RemoteFetcher } from './controller'
import { NotificationsNode } from './panelNode'
import { RuleEngine, getRuleContext } from './rules'
import globals from '../shared/extensionGlobals'
import { AuthState } from './types'
import { getLogger } from '../shared/logger/logger'
import { oneMinute } from '../shared/datetime'

const logger = getLogger('notifications')

/** Time in MS to poll for emergency notifications */
const emergencyPollTime = oneMinute * 0.2
let interval: NodeJS.Timer
/**
 * Activate the in-IDE notifications module and begin receiving notifications.
 *
 * @param context extension context
 * @param initialState initial auth state
 * @param authStateFn fn to get current auth state
 */
export async function activate(
    context: vscode.ExtensionContext,
    initialState: AuthState,
    authStateFn: () => Promise<AuthState>
) {
    let fetcher: NotificationFetcher = new RemoteFetcher()
    // TODO: Currently gated behind feature-flag.
    if (DevSettings.instance.get('notifications', false)) {
        fetcher = new DevFetcher()
        // return
    }

    try {
        const panelNode = NotificationsNode.instance
        panelNode.registerView(context)

        const controller = new NotificationsController(panelNode, fetcher)
        const engine = new RuleEngine(await getRuleContext(context, initialState))

        await controller.pollForStartUp(engine)
        await controller.pollForEmergencies(engine)

        const setNotificationInterval = () => {
            interval = globals.clock.setInterval(
                async () => {
                    globals.clock.clearInterval(interval)
                    const ruleContext = await getRuleContext(context, await authStateFn())
                    // void controller.dismissNotification('startup1')
                    await controller.pollForEmergencies(new RuleEngine(ruleContext))
                    setNotificationInterval()
                },
                DevSettings.instance.get('notificationsPollInterval', emergencyPollTime)
            )
        }
        setNotificationInterval()

        logger.debug('Activated in-IDE notifications polling module')
    } catch (err) {
        logger.error('Failed to activate in-IDE notifications module.')
    }
}
