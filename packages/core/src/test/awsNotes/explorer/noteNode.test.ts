/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import { NoteNode } from '../../../awsNotes/explorer/noteNode'
import { Note } from '../../../awsNotes/models/note'
import { AwsResourceRefNode } from '../../../awsNotes/explorer/awsResourceRefNode'

describe('NoteNode', function () {
    function createTestNote(overrides?: Partial<Note>): Note {
        return {
            id: 'test-id',
            title: 'Test Note',
            content: 'Test content here',
            awsResourceRefs: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            ...overrides,
        }
    }

    it('uses note title as label', function () {
        const note = createTestNote({ title: 'My Note' })
        const node = new NoteNode(note)
        assert.strictEqual(node.label, 'My Note')
    })

    it('has awsNoteNode contextValue', function () {
        const node = new NoteNode(createTestNote())
        assert.strictEqual(node.contextValue, 'awsNoteNode')
    })

    it('shows content preview in description', function () {
        const note = createTestNote({ content: 'Short content' })
        const node = new NoteNode(note)
        assert.strictEqual(node.description, 'Short content')
    })

    it('truncates long content in description', function () {
        const longContent = 'a'.repeat(100)
        const node = new NoteNode(createTestNote({ content: longContent }))
        const description = node.description as string
        assert(description.length <= 53) // 50 chars + '...'
        assert(description.endsWith('...'))
    })

    it('shows (empty) when content is empty', function () {
        const node = new NoteNode(createTestNote({ content: '' }))
        assert.strictEqual(node.description, '(empty)')
    })

    it('collapses whitespace in content preview', function () {
        const note = createTestNote({ content: 'line 1\n  line 2\t\tline 3' })
        const node = new NoteNode(note)
        const description = node.description as string
        assert(!description.includes('\n'))
        assert(!description.includes('\t'))
    })

    it('returns resource ref children', async function () {
        const note = createTestNote({
            awsResourceRefs: [
                {
                    serviceType: 'lambda',
                    resourceName: 'func',
                    resourceArn: 'arn:aws:lambda:us-east-1:123:function:func',
                    regionCode: 'us-east-1',
                },
            ],
        })
        const node = new NoteNode(note)
        const children = await node.getChildren()
        assert.strictEqual(children.length, 1)
        assert(children[0] instanceof AwsResourceRefNode)
    })

    it('returns multiple resource ref children', async function () {
        const note = createTestNote({
            awsResourceRefs: [
                {
                    serviceType: 'lambda',
                    resourceName: 'func1',
                    resourceArn: 'arn:aws:lambda:us-east-1:123:function:func1',
                    regionCode: 'us-east-1',
                },
                {
                    serviceType: 's3',
                    resourceName: 'bucket1',
                    resourceArn: 'arn:aws:s3:::bucket1',
                    regionCode: 'us-east-1',
                },
            ],
        })
        const node = new NoteNode(note)
        const children = await node.getChildren()
        assert.strictEqual(children.length, 2)
    })

    it('has collapsed state when there are resource refs', function () {
        const note = createTestNote({
            awsResourceRefs: [
                {
                    serviceType: 'lambda',
                    resourceName: 'func',
                    resourceArn: 'arn:aws:lambda:us-east-1:123:function:func',
                    regionCode: 'us-east-1',
                },
            ],
        })
        const node = new NoteNode(note)
        assert.strictEqual(node.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed)
    })

    it('has no collapsible state when there are no resource refs', function () {
        const node = new NoteNode(createTestNote({ awsResourceRefs: [] }))
        assert.strictEqual(node.collapsibleState, vscode.TreeItemCollapsibleState.None)
    })

    it('has tooltip as MarkdownString', function () {
        const note = createTestNote()
        const node = new NoteNode(note)
        assert(node.tooltip instanceof vscode.MarkdownString)
    })
})
