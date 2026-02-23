/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ExtContext } from '../shared/extensions'
import { Commands } from '../shared/vscode/commands2'
import { NotesRepository } from './models/note'
import { NotesExplorer } from './explorer/notesExplorer'
import { NoteNode } from './explorer/noteNode'
import { createNote, deleteNote, viewNote } from './commands/noteCommands'

/**
 * Activates the AWS Notes feature.
 */
export async function activate(context: ExtContext): Promise<void> {
    const repository = new NotesRepository()
    const explorer = new NotesExplorer(repository)

    context.extensionContext.subscriptions.push(
        vscode.window.registerTreeDataProvider('aws.notes', explorer),

        Commands.register('aws.notes.create', async () => {
            await createNote(repository, explorer)
        }),

        Commands.register('aws.notes.delete', async (node: NoteNode) => {
            await deleteNote(node, repository, explorer)
        }),

        Commands.register('aws.notes.view', async (node: NoteNode) => {
            await viewNote(node)
        }),

        Commands.register('aws.notes.refresh', () => {
            explorer.refresh()
        })
    )
}
