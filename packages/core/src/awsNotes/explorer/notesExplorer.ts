/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { NotesRepository } from '../models/note'
import { NoteNode } from './noteNode'
import { makeChildrenNodes } from '../../shared/treeview/utils'

/**
 * Placeholder parent node for the placeholder message.
 * Since PlaceholderNode requires a parent, we create a minimal one.
 *
 * TODO: Expand documentation to cover tree node hierarchy, event handling,
 * and integration patterns with other AWS Explorer components.
 */
class NotesRootNode extends AWSTreeNodeBase {
    public constructor() {
        super('Notes')
    }
}

/**
 * TreeDataProvider for the AWS Notes sidebar view.
 */
export class NotesExplorer implements vscode.TreeDataProvider<AWSTreeNodeBase> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<AWSTreeNodeBase | undefined>()
    public readonly onDidChangeTreeData = this._onDidChangeTreeData.event
    private readonly rootNode = new NotesRootNode()

    public constructor(private readonly repository: NotesRepository) {}

    public getTreeItem(element: AWSTreeNodeBase): vscode.TreeItem {
        return element
    }

    public async getChildren(element?: AWSTreeNodeBase): Promise<AWSTreeNodeBase[]> {
        if (element) {
            return element.getChildren()
        }

        return makeChildrenNodes({
            getChildNodes: async () => {
                const notes = await this.repository.getNotes()
                return notes.map((note) => new NoteNode(note))
            },
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this.rootNode, '[No notes yet. Create your first note!]'),
            sort: (a, b) => {
                if (a instanceof NoteNode && b instanceof NoteNode) {
                    return b.note.updatedAt - a.note.updatedAt
                }
                return 0
            },
        })
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire(undefined)
    }
}
