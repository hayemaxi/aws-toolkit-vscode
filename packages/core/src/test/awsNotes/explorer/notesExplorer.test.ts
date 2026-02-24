/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { NotesExplorer } from '../../../awsNotes/explorer/notesExplorer'
import { NotesRepository, Note } from '../../../awsNotes/models/note'
import { NoteNode } from '../../../awsNotes/explorer/noteNode'
import { stub } from '../../utilities/stubber'
import { assertNodeListOnlyHasPlaceholderNode } from '../../utilities/explorerNodeAssertions'

describe('NotesExplorer', function () {
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

    function createMockRepository(notes: Note[] = []) {
        const repo = stub(NotesRepository)
        repo.getNotes.resolves(notes)
        return repo
    }

    it('returns placeholder when no notes exist', async function () {
        const repo = createMockRepository([])
        const explorer = new NotesExplorer(repo)
        const children = await explorer.getChildren()
        assertNodeListOnlyHasPlaceholderNode(children)
    })

    it('returns NoteNode children for stored notes', async function () {
        const notes = [createTestNote({ id: '1', title: 'Note 1' })]
        const repo = createMockRepository(notes)
        const explorer = new NotesExplorer(repo)
        const children = await explorer.getChildren()
        assert.strictEqual(children.length, 1)
        assert(children[0] instanceof NoteNode)
    })

    it('sorts notes by updatedAt descending', async function () {
        const now = Date.now()
        const notes = [
            createTestNote({ id: '1', title: 'Old', updatedAt: now - 1000 }),
            createTestNote({ id: '2', title: 'New', updatedAt: now }),
        ]
        const repo = createMockRepository(notes)
        const explorer = new NotesExplorer(repo)
        const children = (await explorer.getChildren()) as NoteNode[]
        assert.strictEqual(children[0].note.title, 'New')
        assert.strictEqual(children[1].note.title, 'Old')
    })

    it('returns element children when element is provided', async function () {
        const notes = [
            createTestNote({
                id: '1',
                title: 'Note 1',
                awsResourceRefs: [
                    {
                        serviceType: 'lambda',
                        resourceName: 'func',
                        resourceArn: 'arn:aws:lambda:us-east-1:123:function:func',
                        regionCode: 'us-east-1',
                    },
                ],
            }),
        ]
        const repo = createMockRepository(notes)
        const explorer = new NotesExplorer(repo)
        const topLevelChildren = await explorer.getChildren()
        const noteNode = topLevelChildren[0] as NoteNode
        const resourceChildren = await explorer.getChildren(noteNode)
        assert.strictEqual(resourceChildren.length, 1)
    })

    it('getTreeItem returns the element', function () {
        const repo = createMockRepository([])
        const explorer = new NotesExplorer(repo)
        const note = createTestNote()
        const node = new NoteNode(note)
        assert.strictEqual(explorer.getTreeItem(node), node)
    })

    it('refresh fires onDidChangeTreeData event', function () {
        const repo = createMockRepository([])
        const explorer = new NotesExplorer(repo)
        let eventFired = false
        explorer.onDidChangeTreeData(() => {
            eventFired = true
        })
        explorer.refresh()
        assert(eventFired)
    })
})
