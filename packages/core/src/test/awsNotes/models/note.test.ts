/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { Note, NotesRepository } from '../../../awsNotes/models/note'
import globals from '../../../shared/extensionGlobals'

describe('NotesRepository', function () {
    let sandbox: sinon.SinonSandbox
    let mockGlobalState: { get: sinon.SinonStub; update: sinon.SinonStub }

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        mockGlobalState = {
            get: sandbox.stub(),
            update: sandbox.stub().resolves(),
        }
        sandbox.stub(globals, 'globalState').value(mockGlobalState)
    })

    afterEach(function () {
        sandbox.restore()
    })

    function createTestNote(overrides?: Partial<Note>): Note {
        return {
            id: 'test-id',
            title: 'Test Note',
            content: 'Test content',
            awsResourceRefs: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            ...overrides,
        }
    }

    describe('getNotes', function () {
        it('returns empty array when no notes stored', async function () {
            mockGlobalState.get.returns(undefined)
            const repo = new NotesRepository()
            const notes = await repo.getNotes()
            assert.deepStrictEqual(notes, [])
        })

        it('returns stored notes', async function () {
            const note = createTestNote()
            mockGlobalState.get.returns({ notes: [note] })
            const repo = new NotesRepository()
            const notes = await repo.getNotes()
            assert.strictEqual(notes.length, 1)
            assert.strictEqual(notes[0].title, 'Test Note')
        })

        it('returns empty array when notes property is empty', async function () {
            mockGlobalState.get.returns({ notes: [] })
            const repo = new NotesRepository()
            const notes = await repo.getNotes()
            assert.deepStrictEqual(notes, [])
        })
    })

    describe('getNote', function () {
        it('returns note by id', async function () {
            const note = createTestNote({ id: 'specific-id' })
            mockGlobalState.get.returns({ notes: [note] })
            const repo = new NotesRepository()
            const result = await repo.getNote('specific-id')
            assert(result)
            assert.strictEqual(result.id, 'specific-id')
        })

        it('returns undefined when note not found', async function () {
            mockGlobalState.get.returns({ notes: [] })
            const repo = new NotesRepository()
            const result = await repo.getNote('nonexistent-id')
            assert.strictEqual(result, undefined)
        })
    })

    describe('createNote', function () {
        it('adds note to storage', async function () {
            mockGlobalState.get.returns({ notes: [] })
            const repo = new NotesRepository()
            const note = createTestNote()
            await repo.createNote(note)
            assert(mockGlobalState.update.calledOnce)
            const savedData = mockGlobalState.update.firstCall.args[1]
            assert.strictEqual(savedData.notes.length, 1)
            assert.strictEqual(savedData.notes[0].id, 'test-id')
        })

        it('appends note to existing notes', async function () {
            const existingNote = createTestNote({ id: 'existing-id' })
            mockGlobalState.get.returns({ notes: [existingNote] })
            const repo = new NotesRepository()
            const newNote = createTestNote({ id: 'new-id' })
            await repo.createNote(newNote)
            const savedData = mockGlobalState.update.firstCall.args[1]
            assert.strictEqual(savedData.notes.length, 2)
        })
    })

    describe('updateNote', function () {
        it('updates existing note', async function () {
            const note = createTestNote({ id: 'update-id', title: 'Original' })
            mockGlobalState.get.returns({ notes: [note] })
            const repo = new NotesRepository()
            const updatedNote = createTestNote({ id: 'update-id', title: 'Updated' })
            await repo.updateNote(updatedNote)
            const savedData = mockGlobalState.update.firstCall.args[1]
            assert.strictEqual(savedData.notes[0].title, 'Updated')
        })

        it('does not update if note not found', async function () {
            mockGlobalState.get.returns({ notes: [] })
            const repo = new NotesRepository()
            const note = createTestNote({ id: 'nonexistent' })
            await repo.updateNote(note)
            assert(mockGlobalState.update.notCalled)
        })
    })

    describe('deleteNote', function () {
        it('removes note from storage', async function () {
            const note = createTestNote({ id: 'delete-id' })
            mockGlobalState.get.returns({ notes: [note] })
            const repo = new NotesRepository()
            await repo.deleteNote('delete-id')
            const savedData = mockGlobalState.update.firstCall.args[1]
            assert.strictEqual(savedData.notes.length, 0)
        })

        it('preserves other notes when deleting', async function () {
            const note1 = createTestNote({ id: 'keep-id' })
            const note2 = createTestNote({ id: 'delete-id' })
            mockGlobalState.get.returns({ notes: [note1, note2] })
            const repo = new NotesRepository()
            await repo.deleteNote('delete-id')
            const savedData = mockGlobalState.update.firstCall.args[1]
            assert.strictEqual(savedData.notes.length, 1)
            assert.strictEqual(savedData.notes[0].id, 'keep-id')
        })
    })
})
