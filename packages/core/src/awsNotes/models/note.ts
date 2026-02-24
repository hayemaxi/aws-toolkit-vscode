/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../../shared/extensionGlobals'

/**
 * Represents a reference to an AWS resource linked to a note.
 */
export interface AwsResourceRef {
    serviceType: string
    resourceArn: string
    resourceName: string
    regionCode: string
}

/**
 * Represents a note stored by the AWS Notes feature.
 */
export interface Note {
    id: string
    title: string
    content: string
    awsResourceRefs: AwsResourceRef[]
    createdAt: number
    updatedAt: number
}

/**
 * Serialized format of notes stored in globalState.
 */
interface NotesData {
    notes: Note[]
}

/**
 * Repository for managing notes in VS Code globalState.
 */
export class NotesRepository {
    private static readonly storageKey = 'aws.notes'

    /**
     * Gets all notes from storage.
     */
    public async getNotes(): Promise<Note[]> {
        const data = globals.globalState.get<NotesData>(NotesRepository.storageKey)
        return data?.notes ?? []
    }

    /**
     * Gets a single note by ID.
     */
    public async getNote(id: string): Promise<Note | undefined> {
        const notes = await this.getNotes()
        return notes.find((n) => n.id === id)
    }

    /**
     * Creates a new note.
     */
    public async createNote(note: Note): Promise<void> {
        const notes = await this.getNotes()
        notes.push(note)
        await this.saveNotes(notes)
    }

    /**
     * Updates an existing note.
     */
    public async updateNote(note: Note): Promise<void> {
        const notes = await this.getNotes()
        const index = notes.findIndex((n) => n.id === note.id)
        if (index >= 0) {
            notes[index] = note
            await this.saveNotes(notes)
        }
    }

    /**
     * Deletes a note by ID.
     */
    public async deleteNote(id: string): Promise<void> {
        const notes = await this.getNotes()
        const filtered = notes.filter((n) => n.id !== id)
        await this.saveNotes(filtered)
    }

    private async saveNotes(notes: Note[]): Promise<void> {
        const data: NotesData = { notes }
        await globals.globalState.update(NotesRepository.storageKey, data)
    }
}
