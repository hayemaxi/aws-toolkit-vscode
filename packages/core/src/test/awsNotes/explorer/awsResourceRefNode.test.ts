/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { AwsResourceRefNode } from '../../../awsNotes/explorer/awsResourceRefNode'
import { NoteNode } from '../../../awsNotes/explorer/noteNode'
import { Note, AwsResourceRef } from '../../../awsNotes/models/note'

describe('AwsResourceRefNode', function () {
    function createParentNode(): NoteNode {
        const note: Note = {
            id: 'note-id',
            title: 'Test Note',
            content: '',
            awsResourceRefs: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        }
        return new NoteNode(note)
    }

    function createResourceRef(overrides?: Partial<AwsResourceRef>): AwsResourceRef {
        return {
            serviceType: 'lambda',
            resourceName: 'test-resource',
            resourceArn: 'arn:aws:lambda:us-east-1:123456789:function:test-resource',
            regionCode: 'us-east-1',
            ...overrides,
        }
    }

    it('uses resourceName as label', function () {
        const parent = createParentNode()
        const ref = createResourceRef({ resourceName: 'my-lambda' })
        const node = new AwsResourceRefNode(parent, ref)
        assert.strictEqual(node.label, 'my-lambda')
    })

    it('has awsResourceRefNode contextValue', function () {
        const node = new AwsResourceRefNode(createParentNode(), createResourceRef())
        assert.strictEqual(node.contextValue, 'awsResourceRefNode')
    })

    it('shows service type in description', function () {
        const node = new AwsResourceRefNode(createParentNode(), createResourceRef({ serviceType: 's3' }))
        assert.strictEqual(node.description, 's3')
    })

    it('shows Lambda service type in description', function () {
        const node = new AwsResourceRefNode(createParentNode(), createResourceRef({ serviceType: 'lambda' }))
        assert.strictEqual(node.description, 'lambda')
    })

    it('shows EC2 service type in description', function () {
        const ref = createResourceRef({
            serviceType: 'ec2',
            resourceName: 'i-12345',
            resourceArn: 'arn:aws:ec2:us-east-1:123:instance/i-12345',
        })
        const node = new AwsResourceRefNode(createParentNode(), ref)
        assert.strictEqual(node.description, 'ec2')
    })

    it('has tooltip with ARN and region', function () {
        const ref = createResourceRef({
            resourceName: 'my-func',
            resourceArn: 'arn:aws:lambda:us-west-2:123:function:my-func',
            regionCode: 'us-west-2',
        })
        const node = new AwsResourceRefNode(createParentNode(), ref)
        const tooltip = node.tooltip as string
        assert(tooltip.includes('my-func'))
        assert(tooltip.includes('arn:aws:lambda:us-west-2:123:function:my-func'))
        assert(tooltip.includes('us-west-2'))
    })

    it('stores parent reference', function () {
        const parent = createParentNode()
        const node = new AwsResourceRefNode(parent, createResourceRef())
        assert.strictEqual(node.parent, parent)
    })

    it('stores resourceRef', function () {
        const ref = createResourceRef({ resourceName: 'specific-resource' })
        const node = new AwsResourceRefNode(createParentNode(), ref)
        assert.strictEqual(node.resourceRef.resourceName, 'specific-resource')
    })
})
