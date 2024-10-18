/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { NotificationsController, NotificationsNode } from '../../notifications'
import { HttpResourceFetcher } from '../../shared/resourcefetcher/httpResourceFetcher'

// TODO: remove auth page and tests
describe.only('Notifications Controller', function () {
    let panelNode: NotificationsNode
    let controller: NotificationsController
    let fetchStub: sinon.SinonStub

    beforeEach(() => {
        panelNode = new NotificationsNode('toolkit')
        controller = new NotificationsController('toolkit', panelNode)
        fetchStub = sinon.stub(HttpResourceFetcher.prototype, 'getNewETagContent').callsFake(() => {
            return Promise.resolve({ content: JSON.stringify({}) })
        })
        //getNewETagContent
    })

    it('should', function () {})
})
