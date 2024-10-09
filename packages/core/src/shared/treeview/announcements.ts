/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ResourceTreeDataProvider, TreeNode } from './resourceTreeDataProvider'
import { learnMoreAmazonQCommand } from '../../amazonq/explorer/amazonQChildrenNodes'
import { Commands } from '../vscode/commands2'
import { getIcon } from '../icons'
import { isAmazonQ } from '../extensionUtilities'
import globals from '../../shared/extensionGlobals'
import { setContext } from '../vscode/setContext'

export class AnnouncementsNode implements TreeNode {
    public readonly id = 'announcements'
    public readonly resource = this
    private readonly onDidChangeChildrenEmitter = new vscode.EventEmitter<void>()
    private readonly onDidChangeTreeItemEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeTreeItem = this.onDidChangeTreeItemEmitter.event
    public readonly onDidChangeChildren = this.onDidChangeChildrenEmitter.event
    private readonly onDidChangeVisibilityEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeVisibility = this.onDidChangeVisibilityEmitter.event

    public provider: ResourceTreeDataProvider | undefined = undefined
    public displayEmergency: boolean = false
    public displayWhatsNew: boolean = false

    private constructor() {
        if (isAmazonQ()) {
            globals.context.subscriptions.push(
                qWhatsNew.register(),
                qEmergency.register(),
                sendEmergency.register(),
                sendWhatsNew.register(),
                qDismissNotifications.register()
            )
        }
    }

    public getTreeItem() {
        const item = new vscode.TreeItem('Announcements')
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
        item.contextValue = 'announcements'

        return item
    }

    public refresh(): void {
        this.onDidChangeChildrenEmitter.fire()
        this.provider?.refresh()
    }

    public refreshRootNode() {
        this.onDidChangeTreeItemEmitter.fire()
        this.provider?.refresh()
    }

    public getChildren() {
        const nodes = []
        if (this.displayWhatsNew) {
            nodes.push(createWhatsNew())
        }
        if (this.displayEmergency) {
            nodes.push(createEmergency())
        }

        if (nodes.length === 0) {
            void setContext(`aws.amazonq.showAnnouncements` as any, false)
        }

        return nodes
    }

    public dismissNotification(node: TreeNode) {
        if (!node.id.includes('emergency')) {
            this.displayWhatsNew = false
        }
        this.refresh()
    }

    /**
     * HACK: Since this is assumed to be an immediate child of the
     * root, we return undefined.
     *
     * TODO: Look to have a base root class to extend so we do not
     * need to implement this here.
     * @returns
     */
    getParent(): TreeNode<unknown> | undefined {
        return undefined
    }

    static #instance: AnnouncementsNode

    static get instance(): AnnouncementsNode {
        return (this.#instance ??= new AnnouncementsNode())
    }
}

export const sendEmergency = Commands.declare('aws.amazonq.sendEmergency', () => () => {
    AnnouncementsNode.instance.displayEmergency = true
    void setContext(`aws.amazonq.showAnnouncements` as any, true)
    void vscode.commands.executeCommand(`aws.amazonq.announcements.focus`)
    void vscode.window
        .showErrorMessage("There's a known bug preventing Amazon Q sign-in. A fix is in progress.", 'Learn More')
        .then((resp) => {
            if (resp === 'Learn More') {
                void qEmergency.execute()
            }
        })
    void vscode.commands.executeCommand('_aws.amazonq.refreshTreeNode')
    // AnnouncementsNode.instance.refresh()
})

export const sendWhatsNew = Commands.declare('aws.amazonq.sendWhatsNew', () => () => {
    AnnouncementsNode.instance.displayWhatsNew = true
    void setContext(`aws.amazonq.showAnnouncements` as any, true)
    // if (!globals.globalState.get('aws.amazonq.testing.notificationIsDismissed' as any, false)) {
    void vscode.window.showInformationMessage('New features in Amazon Q!', 'Learn More').then((resp) => {
        if (resp === 'Learn More') {
            void qWhatsNew.execute()
        }
    })
    // }
    void vscode.commands.executeCommand('_aws.amazonq.refreshTreeNode')
    // AnnouncementsNode.instance.refresh()
})

export function createWhatsNew() {
    return qWhatsNew.build().asTreeNode({
        label: "What's New",
        iconPath: getIcon('vscode-question'),
        contextValue: 'awsAmazonQWhatsNew',
    })
}

export function createEmergency() {
    return qEmergency.build().asTreeNode({
        label: 'Error when logging-in to Amazon Q',
        iconPath: getIcon('vscode-alert'),
        contextValue: 'awsAmazonQEmergency',
    })
}

export const qWhatsNew = Commands.declare('_aws.amazonq.whatsnew', () => () => {
    void vscode.window
        .showInformationMessage(
            'New features in 1.20.0!\n' +
                '\n - You can now transform java projects using /transform' +
                '\n - Q will make suggestions based on all files in your workspace.' +
                '\n ...',
            { modal: true },
            'Changelog'
        )
        .then((resp) => {
            if (resp === 'Changelog') {
                void learnMoreAmazonQCommand.execute()
            }
        })
})

export const qEmergency = Commands.declare('_aws.amazonq.emergency', () => () => {
    const content =
        'A bug in this Amazon Q version may prevent users from signing on with the error message:\n\n"A login for this starturl already exists"\n\nA fix is in progress. You can workaround this and sign into Q by:\n' +
        '\n 1. Reload the window\n 2. Enter your auth credentials\n 3. Select a different region and try to login\n 5. If logged in, log out. Otherwise, reload your window\n 6. Try to login with your original credentials and region again'
    void vscode.window.showInformationMessage(content, { modal: true }, 'Open in Editor').then(async (resp) => {
        if (resp === 'Open in Editor') {
            const doc = await vscode.workspace.openTextDocument({ content })
            await vscode.window.showTextDocument(doc)
        }
    })
})

export const qDismissNotifications = Commands.declare('aws.amazonq.dismissNotification', () => (_) => {
    AnnouncementsNode.instance.dismissNotification(_)
    void globals.globalState.update('aws.amazonq.testing.notificationIsDismissed' as any, true)
})

export const refreshAnnouncements = (provider?: ResourceTreeDataProvider) =>
    Commands.register({ id: '_aws.amazonq.refreshTreeNode', logging: false }, () => {
        AnnouncementsNode.instance.refresh()
        if (provider) {
            provider.refresh()
            AnnouncementsNode.instance.provider = provider
        }
    })

export const refreshAnnouncementsRootNode = (provider?: ResourceTreeDataProvider) =>
    Commands.register({ id: '_aws.refreshRootNode', logging: false }, () => {
        AnnouncementsNode.instance.refreshRootNode()
        if (provider) {
            provider.refresh()
            AnnouncementsNode.instance.provider = provider
        }
    })
