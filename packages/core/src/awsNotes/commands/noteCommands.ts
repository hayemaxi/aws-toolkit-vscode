/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as crypto from 'crypto'
import { Note, NotesRepository } from '../models/note'
import { NoteNode } from '../explorer/noteNode'
import { NotesExplorer } from '../explorer/notesExplorer'
import { ExtContext } from '../../shared/extensions'
import { NoteEditorPanel } from '../vue/noteEditor/backend'
import { AwsResourceRefNode } from '../explorer/awsResourceRefNode'
import { buildConsoleUrl } from '../utils/resourceUtils'

/**
 * Creates a new note.
 */
export async function createNote(repository: NotesRepository, explorer: NotesExplorer): Promise<void> {
    const title = await vscode.window.showInputBox({
        prompt: 'Enter note title',
        placeHolder: 'My AWS Note',
        validateInput: (value: string) => {
            if (!value || value.trim().length === 0) {
                return 'Title cannot be empty'
            }
            return undefined
        },
    })

    if (!title) {
        return
    }

    const now = Date.now()
    const note: Note = {
        id: crypto.randomUUID(),
        title: title.trim(),
        content: '',
        awsResourceRefs: [],
        createdAt: now,
        updatedAt: now,
    }

    await repository.createNote(note)
    explorer.refresh()
    void vscode.window.showInformationMessage(`Note "${note.title}" created.`)
}

/**
 * Deletes a note with confirmation.
 */
export async function deleteNote(
    node: NoteNode,
    repository: NotesRepository,
    explorer: NotesExplorer
): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to delete "${node.note.title}"?`,
        { modal: true },
        'Delete'
    )

    if (confirm !== 'Delete') {
        return
    }

    await repository.deleteNote(node.note.id)
    explorer.refresh()
    void vscode.window.showInformationMessage(`Note "${node.note.title}" deleted.`)
}

/**
 * Opens a note for viewing in a virtual document.
 */
export async function viewNote(node: NoteNode): Promise<void> {
    const content = [
        `# ${node.note.title}`,
        '',
        node.note.content || '(No content)',
        '',
        '---',
        `Created: ${new Date(node.note.createdAt).toLocaleString()}`,
        `Updated: ${new Date(node.note.updatedAt).toLocaleString()}`,
    ]

    if (node.note.awsResourceRefs.length > 0) {
        content.push('', '## Linked AWS Resources', '')
        for (const ref of node.note.awsResourceRefs) {
            content.push(`- **${ref.resourceName}** (${ref.serviceType}) - ${ref.resourceArn}`)
        }
    }

    const uri = vscode.Uri.parse(`untitled:Note-${node.note.title.replace(/\s+/g, '-')}.md`)
    const doc = await vscode.workspace.openTextDocument(uri)
    const editor = await vscode.window.showTextDocument(doc)
    await editor.edit((edit: vscode.TextEditorEdit) => {
        edit.insert(new vscode.Position(0, 0), content.join('\n'))
    })
}

/**
 * Opens a note for editing in the webview editor.
 */
export async function editNote(
    node: NoteNode,
    repository: NotesRepository,
    explorer: NotesExplorer,
    context: ExtContext
): Promise<void> {
    const panel = new NoteEditorPanel(context.extensionContext, repository, node.note.id)
    panel.server.onNoteUpdated.event(() => {
        explorer.refresh()
    })
    await panel.show({ title: `Edit: ${node.note.title}` })
}

/**
 * Opens a resource reference in the AWS Console.
 */
export async function openResourceInConsole(node: AwsResourceRefNode): Promise<void> {
    const url = buildConsoleUrl(node.resourceRef)
    await vscode.env.openExternal(vscode.Uri.parse(url))
}

/**
 * Reveals a resource in the AWS Explorer.
 */
export async function revealResourceInExplorer(node: AwsResourceRefNode): Promise<void> {
    const ref = node.resourceRef
    // Show the region in explorer, then try to reveal the service
    await vscode.commands.executeCommand('aws.showRegion', ref.regionCode)
    // Optionally try to expand the service node - this is best-effort
    void vscode.window.showInformationMessage(
        `Navigate to ${ref.serviceType} > ${ref.resourceName} in the AWS Explorer`
    )
}
