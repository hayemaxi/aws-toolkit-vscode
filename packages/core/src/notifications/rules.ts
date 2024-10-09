/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as semver from 'semver'
import globals from '../shared/extensionGlobals'
import { ToolkitError } from '../shared'
import { EnvType, OperatingSystem, getOperatingSystem, getComputeEnvType } from '../shared/telemetry/util'

type ConditionalClause = Range | ExactMatch | OR

interface OR {
    readonly type: 'or'
    readonly clauses: (Range | ExactMatch)[]
}

interface Range {
    readonly type: 'range'
    readonly lowerInclusive?: string // null means "-inf"
    readonly upperExclusive?: string // null means "+inf"
}

interface ExactMatch {
    readonly type: 'exactMatch'
    readonly values: string[]
}

interface Rule {
    evaluate(context: RuleContext): boolean
}

interface RuleContext {
    readonly ideVersion: typeof vscode.version
    readonly extensionVersion: string
    readonly os: OperatingSystem
    readonly computeEnv: EnvType
    readonly authType: string
    readonly authRegion: string
    readonly authState: string
    readonly authScopes: string[]
    readonly installedExtensions: string[]
    readonly activeExtensions: string[]
}

interface RuleDefinition {
    readonly type: string
    readonly params: Record<string, any>
}

class VersionRule implements Rule {
    constructor(private params: ConditionalClause) {}

    evaluate(context: RuleContext): boolean {
        const extVersion = context.extensionVersion
        if (!extVersion) {
            throw new ToolkitError(`Invalid version: ${globals.context.extension.packageJSON.version}`)
        }

        function _range(lowerInclusive?: string, upperExclusive?: string) {
            const lowerBound =
                lowerInclusive === '-inf' || !lowerInclusive ? true : semver.gte(extVersion, lowerInclusive)
            const upperBound =
                upperExclusive === '+inf' || !upperExclusive ? true : semver.lt(extVersion, upperExclusive)
            return lowerBound && upperBound
        }

        function _exactMatch(values: string[]) {
            return values.some((v) => semver.eq(v, extVersion))
        }

        switch (this.params.type) {
            case 'range':
                return _range(this.params.lowerInclusive, this.params.upperExclusive)
            case 'exactMatch':
                return _exactMatch(this.params.values)
            case 'or':
                return this.params.clauses.some((clause) => new VersionRule(clause).evaluate(context))
            default:
                throw new Error(`Unknown clause type: ${(this.params as any).type}`)
        }
    }
}

class ConnectionRule implements Rule {
    evaluate(context: RuleContext): boolean {
        return context.isUserConnected
    }
}

class RuleFactory {
    static createRule(definition: RuleDefinition): Rule {
        switch (definition.type) {
            case 'version':
                return new VersionRule(definition.params.version)
            case 'connection':
                return new ConnectionRule()
            default:
                throw new Error(`Unknown rule type: ${definition.type}`)
        }
    }
}

class RuleEngine {
    private rules: Rule[] = []

    public shouldDisplayNotification(payload: typeof rulesJson) {
        const context = {
            ideVersion: vscode.version,
            extensionVersion: globals.context.extension.packageJSON.version,
            os: getOperatingSystem(),
            computeEnv: getComputeEnvType(),
            authType: '',
            authRegion: '',
            authState: '',
            authScopes: '',
            installedExtensions: vscode.extensions.all.map((e) => e.id),
            activeExtensions: vscode.extensions.all.filter((e) => e.isActive).map((e) => e.id),
        }

        return this.evaluate(payload, context)
    }

    private addRule(definition: RuleDefinition) {
        const rule = RuleFactory.createRule(definition)
        this.rules.push(rule)
    }

    private evaluate(payload: typeof rulesJson, context: RuleContext): boolean {
        const rules: Rule[] = []
        if (payload.extensionId !== globals.context.extension.id) {
            return false
        }

        if (payload.ideVersion) {
            rules.push(new VersionRule(payload.ideVersion))
        }
        if (payload.extensionVersion) {
            rules.push(new VersionRule(payload.extensionVersion))
        }

        payload.additionalCriteria.forEach((criteria) => {
            switch (criteria.type) {
                case 'AuthType':
                    rules.push(new ConnectionRule())
                    break
                default:
                    throw new Error(`Unknown criteria type: ${criteria.type}`)
            }
        })

        return this.rules.every((rule) => rule.evaluate(context))
    }
}

// JSON payload defining the rules
const rulesJson = {
    extensionId: 'amazon-q-vscode',
    ideVersion: {
        comparison: 'range',
        lowerVersionInclusive: '-inf',
        upperVersionExclusive: '+inf',
    },
    extensionVersion: {
        comparison: 'range',
        lowerVersionInclusive: '-inf',
        upperVersionExclusive: '1.20.0',
    },
    additionalCriteria: [
        {
            type: 'AuthType',
            value: 'builderId',
        },
    ],
}

// Create and configure the rule engine
const engine = new RuleEngine()
rulesJson.forEach((ruleDefinition) => engine.addRule(ruleDefinition))

// Evaluate the rules
const context: RuleContext = {
    extensionVersion: '1.0.0',
    isUserConnected: true,
}

const result = engine.evaluate(context)
console.log('All rules passed:', result)
