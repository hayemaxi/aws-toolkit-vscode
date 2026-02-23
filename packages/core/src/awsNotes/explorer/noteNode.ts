/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { Note } from '../models/note'
import { AwsResourceRefNode } from './awsResourceRefNode'
import { getIcon } from '../../shared/icons'

/**
 * Tree node representing a single note in the Notes explorer.
 */
export class NoteNode extends AWSTreeNodeBase {
    public readonly contextValue = 'awsNoteNode'

    public constructor(public readonly note: Note) {
        super(note.title, note.awsResourceRefs.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None)
        this.description = this.getContentPreview()
        this.tooltip = this.buildTooltip()
        this.iconPath = getIcon('vscode-note')
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return this.note.awsResourceRefs.map((ref) => new AwsResourceRefNode(this, ref))
    }

    private getContentPreview(): string {
        const maxLength = 50
        const content = this.note.content.replace(/\s+/g, ' ').trim()
        if (content.length <= maxLength) {
            return content || '(empty)'
        }
        return content.substring(0, maxLength) + '...'
    }

    private buildTooltip(): string {
        const lines: string[] = [
            `Title: ${this.note.title}`,
            '',
            this.note.content || '(No content)',
            '',
            `Created: ${new Date(this.note.createdAt).toLocaleString()}`,
            `Updated: ${new Date(this.note.updatedAt).toLocaleString()}`,
        ]
        if (this.note.awsResourceRefs.length > 0) {
            lines.push('', `Linked Resources: ${this.note.awsResourceRefs.length}`)
        }
        return lines.join('\n')
    }
}
