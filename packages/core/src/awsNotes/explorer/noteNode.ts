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

    private buildTooltip(): vscode.MarkdownString {
        const md = new vscode.MarkdownString()
        md.appendMarkdown(`**${this.note.title}**\n\n`)
        md.appendText(this.note.content || '(No content)')
        md.appendMarkdown('\n\n---\n\n')
        md.appendText(`Created: ${new Date(this.note.createdAt).toLocaleString()}\n`)
        md.appendText(`Updated: ${new Date(this.note.updatedAt).toLocaleString()}`)

        if (this.note.awsResourceRefs.length > 0) {
            md.appendMarkdown('\n\n**Linked Resources:**\n')
            for (const ref of this.note.awsResourceRefs) {
                md.appendMarkdown(`- $(${this.getServiceIconId(ref.serviceType)}) ${ref.resourceName}\n`)
            }
        }
        return md
    }

    private getServiceIconId(serviceType: string): string {
        const iconMap: Record<string, string> = {
            lambda: 'symbol-function',
            s3: 'archive',
            ec2: 'server',
            cloudwatch: 'pulse',
            ecs: 'layers',
            ecr: 'package',
            iot: 'radio-tower',
        }
        return iconMap[serviceType.toLowerCase()] ?? 'cloud'
    }
}
