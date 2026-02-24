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
import { AwsResourceRefNode } from './explorer/awsResourceRefNode'
import { createNote, deleteNote, viewNote, editNote, openResourceInConsole, revealResourceInExplorer } from './commands/noteCommands'

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

        Commands.register('aws.notes.edit', async (node: NoteNode) => {
            await editNote(node, repository, explorer, context)
        }),

        Commands.register('aws.notes.refresh', () => {
            explorer.refresh()
        }),

        Commands.register('aws.notes.openResourceInConsole', async (node: AwsResourceRefNode) => {
            await openResourceInConsole(node)
        }),

        Commands.register('aws.notes.revealInExplorer', async (node: AwsResourceRefNode) => {
            await revealResourceInExplorer(node)
        })
    )
}
