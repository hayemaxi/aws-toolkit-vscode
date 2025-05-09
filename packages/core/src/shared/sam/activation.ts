/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import globals from '../extensionGlobals'

import * as vscode from 'vscode'
import { createNewSamApplication, resumeCreateNewSamApp } from '../../lambda/commands/createNewSamApp'
import { SamParameterCompletionItemProvider } from '../../lambda/config/samParameterCompletionItemProvider'
import * as codelensUtils from '../codelens/codeLensUtils'
import * as csLensProvider from '../codelens/csharpCodeLensProvider'
import * as javaLensProvider from '../codelens/javaCodeLensProvider'
import * as pyLensProvider from '../codelens/pythonCodeLensProvider'
import * as goLensProvider from '../codelens/goCodeLensProvider'
import { SamTemplateCodeLensProvider } from '../codelens/samTemplateCodeLensProvider'
import * as jsLensProvider from '../codelens/typescriptCodeLensProvider'
import { ExtContext, VSCODE_EXTENSION_ID } from '../extensions'
import { getIdeProperties, getIdeType } from '../extensionUtilities'
import { getLogger } from '../logger/logger'
import { PerfLog } from '../logger/perfLogger'
import { NoopWatcher } from '../fs/watchedFiles'
import { detectSamCli } from './cli/samCliDetection'
import { CodelensRootRegistry } from '../fs/codelensRootRegistry'
import { AWS_SAM_DEBUG_TYPE } from './debugger/awsSamDebugConfiguration'
import { SamDebugConfigProvider } from './debugger/awsSamDebugger'
import { addSamDebugConfiguration } from './debugger/commands/addSamDebugConfiguration'
import { ToolkitPromptSettings } from '../settings'
import { shared } from '../utilities/functionUtils'
import { SamCliSettings } from './cli/samCliSettings'
import { Commands } from '../vscode/commands2'
import { runSync } from './sync'
import { showExtensionPage } from '../utilities/vsCodeUtils'
import { runDeploy } from './deploy'
import { telemetry } from '../telemetry/telemetry'

const sharedDetectSamCli = shared(detectSamCli)

const supportedLanguages: {
    [language: string]: codelensUtils.OverridableCodeLensProvider
} = {}

/**
 * Activate SAM-related functionality.
 */
export async function activate(ctx: ExtContext): Promise<void> {
    let didActivateCodeLensProviders = false
    await createYamlExtensionPrompt()
    const config = SamCliSettings.instance

    // Do this "on-demand" because it is slow.
    async function activateSlowCodeLensesOnce(): Promise<void> {
        if (!didActivateCodeLensProviders) {
            didActivateCodeLensProviders = true
            const disposeable = await activateCodefileOverlays(ctx, config)
            ctx.extensionContext.subscriptions.push(...disposeable)
        }
    }

    if (config.get('enableCodeLenses', false)) {
        await activateSlowCodeLensesOnce()
    }

    await registerCommands(ctx, config)
    Commands.register('aws.addSamDebugConfig', async () => {
        if (!didActivateCodeLensProviders) {
            await activateSlowCodeLensesOnce()
        }
        await samDebugConfigCmd()
    })

    ctx.extensionContext.subscriptions.push(
        activateSamYamlOverlays(),
        vscode.debug.registerDebugConfigurationProvider(AWS_SAM_DEBUG_TYPE, new SamDebugConfigProvider(ctx))
    )

    ctx.extensionContext.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            {
                language: 'json',
                scheme: 'file',
                pattern: '**/.aws/parameters.json',
            },
            new SamParameterCompletionItemProvider(),
            '"'
        )
    )

    config.onDidChange(async (event) => {
        switch (event.key) {
            case 'location':
                // This only shows a message (passive=true), does not set anything.
                await sharedDetectSamCli({ passive: true, showMessage: true })
                break
            case 'enableCodeLenses':
                if (config.get(event.key, false) && !didActivateCodeLensProviders) {
                    await activateSlowCodeLensesOnce()
                }
                break
            default:
                break
        }
    })

    const settings = SamCliSettings.instance
    settings.onDidChange(({ key }) => {
        if (key === 'legacyDeploy') {
            telemetry.aws_modifySetting.run((span) => {
                span.record({ settingId: 'sam_legacyDeploy' })
                const state = settings.get('legacyDeploy')
                span.record({ settingState: state ? 'Enabled' : 'Disabled' })
            })
        }
    })

    ctx.extensionContext.subscriptions.push(config)

    if (globals.didReload) {
        await resumeCreateNewSamApp(ctx)
    }
}

async function registerCommands(ctx: ExtContext, settings: SamCliSettings): Promise<void> {
    ctx.extensionContext.subscriptions.push(
        Commands.register({ id: 'aws.samcli.detect', autoconnect: false }, () =>
            sharedDetectSamCli({ passive: false, showMessage: true })
        ),
        Commands.register({ id: 'aws.lambda.createNewSamApp', autoconnect: false }, async () => {
            await createNewSamApplication(ctx)
        }),
        Commands.register({ id: 'aws.addSamDebugConfiguration', autoconnect: false }, addSamDebugConfiguration),
        Commands.register(
            { id: 'aws.pickAddSamDebugConfiguration', autoconnect: false },
            codelensUtils.pickAddSamDebugConfiguration
        ),
        Commands.register(
            { id: 'aws.deploySamApplication', autoconnect: true },
            async (arg) =>
                // `arg` is one of :
                //  - undefined
                //  - regionNode (selected from AWS Explorer)
                //  - Uri to template.yaml (selected from File Explorer)
                //  - TreeNode (selected from AppBuilder)
                await runDeploy(arg)
        ),
        Commands.register({ id: 'aws.toggleSamCodeLenses', autoconnect: false }, async () => {
            const toggled = !settings.get('enableCodeLenses', false)
            await settings.update('enableCodeLenses', toggled)
        }),
        Commands.register(
            {
                id: 'aws.samcli.sync',
                autoconnect: true,
            },
            async (arg?, validate?: boolean) => await runSync('infra', arg, validate)
        )
    )
}

async function activateCodeLensRegistry(context: ExtContext) {
    try {
        const registry = new CodelensRootRegistry()
        globals.codelensRootRegistry = registry

        //
        // "**/…" string patterns watch recursively across _all_ workspace
        // folders (see documentation for addWatchPatterns()).
        //
        registry.addWatchPatterns([
            pyLensProvider.pythonBasePattern,
            jsLensProvider.javascriptBasePattern,
            csLensProvider.csharpBasePattern,
            goLensProvider.goBasePattern,
            javaLensProvider.gradleBasePattern,
            javaLensProvider.mavenBasePattern,
        ])
        await registry.rebuild()
    } catch (e) {
        void vscode.window.showErrorMessage(
            localize(
                'AWS.codelens.failToInitializeCode',
                'Failed to activate Lambda handler {0}',
                getIdeProperties().codelenses
            )
        )
        getLogger().error('Failed to activate codelens registry %O', e)
        // This prevents us from breaking for any reason later if it fails to load. Since
        // Noop watcher is always empty, we will get back empty arrays with no issues.
        globals.codelensRootRegistry = new NoopWatcher() as unknown as CodelensRootRegistry
    }
    context.extensionContext.subscriptions.push(globals.codelensRootRegistry)
}

async function samDebugConfigCmd() {
    const activeEditor = vscode.window.activeTextEditor
    if (!activeEditor) {
        getLogger().error(`aws.addSamDebugConfig was called without an active text editor`)
        void vscode.window.showErrorMessage(
            localize('AWS.pickDebugHandler.noEditor', 'Toolkit could not find an active editor')
        )

        return
    }
    const document = activeEditor.document
    const provider = supportedLanguages[document.languageId]
    if (!provider) {
        getLogger().error(`aws.addSamDebugConfig called on a document with an invalid language: ${document.languageId}`)
        void vscode.window.showErrorMessage(
            localize(
                'AWS.pickDebugHandler.invalidLanguage',
                'Toolkit cannot detect handlers in language: {0}',
                document.languageId
            )
        )

        return
    }

    // TODO: No reason for this to depend on the codelense provider (which scans the whole workspace and creates filewatchers).
    const lenses = (await provider.provideCodeLenses(document, new vscode.CancellationTokenSource().token, true)) ?? []
    await codelensUtils.invokeCodeLensCommandPalette(document, lenses)
}

/**
 * Creates vscode.CodeLensProvider for SAM "template.yaml" files.
 *
 * Used for:
 * 1. showing codelenses in SAM template.yaml files
 */
function activateSamYamlOverlays(): vscode.Disposable {
    return vscode.languages.registerCodeLensProvider(
        [
            {
                language: 'yaml',
                scheme: 'file',
                pattern: '**/*template.{yml,yaml}',
            },
        ],
        new SamTemplateCodeLensProvider()
    )
}

/**
 * EXPENSIVE AND SLOW. Creates filewatchers and vscode.CodeLensProvider objects
 * for codefiles (as opposed to SAM template.yaml files).
 *
 * Used for:
 * 1. showing codelenses
 * 2. "Add Local Invoke and Debug Configuration" command (TODO: remove dependency on
 *    codelense provider (which scans the whole workspace and creates
 *    filewatchers)).
 */
async function activateCodefileOverlays(
    context: ExtContext,
    configuration: SamCliSettings
): Promise<vscode.Disposable[]> {
    const perflog = new PerfLog('activateCodefileOverlays')
    const disposables: vscode.Disposable[] = []
    const tsCodeLensProvider = codelensUtils.makeTypescriptCodeLensProvider(configuration)
    const pyCodeLensProvider = await codelensUtils.makePythonCodeLensProvider(configuration)
    const javaCodeLensProvider = await codelensUtils.makeJavaCodeLensProvider(configuration)
    const csCodeLensProvider = await codelensUtils.makeCSharpCodeLensProvider(configuration)
    const goCodeLensProvider = await codelensUtils.makeGoCodeLensProvider(configuration)

    // Ideally we should not need to `await` this Promise, but CodeLens providers are currently not implementing
    // the event to notify on when their results change.
    await activateCodeLensRegistry(context)

    supportedLanguages[jsLensProvider.javascriptLanguage] = tsCodeLensProvider
    supportedLanguages[pyLensProvider.pythonLanguage] = pyCodeLensProvider
    supportedLanguages[javaLensProvider.javaLanguage] = javaCodeLensProvider
    supportedLanguages[csLensProvider.csharpLanguage] = csCodeLensProvider
    supportedLanguages[goLensProvider.goLanguage] = goCodeLensProvider
    supportedLanguages[jsLensProvider.typescriptLanguage] = tsCodeLensProvider

    disposables.push(vscode.languages.registerCodeLensProvider(jsLensProvider.typescriptAllFiles, tsCodeLensProvider))
    disposables.push(vscode.languages.registerCodeLensProvider(pyLensProvider.pythonAllfiles, pyCodeLensProvider))
    disposables.push(vscode.languages.registerCodeLensProvider(javaLensProvider.javaAllfiles, javaCodeLensProvider))
    disposables.push(vscode.languages.registerCodeLensProvider(csLensProvider.csharpAllfiles, csCodeLensProvider))
    disposables.push(vscode.languages.registerCodeLensProvider(goLensProvider.goAllfiles, goCodeLensProvider))

    perflog.done()
    return disposables
}

/**
 * Creates a prompt (via toast) to guide users to installing the Red Hat YAML extension.
 * This is necessary for displaying codelenses on templaye YAML files.
 * Will show once per extension activation at most (all prompting triggers are disposed of on first trigger)
 * Will not show if the YAML extension is installed or if a user has permanently dismissed the message.
 */
async function createYamlExtensionPrompt(): Promise<void> {
    const settings = ToolkitPromptSettings.instance

    /**
     * Prompt the user to install the YAML plugin when AWSTemplateFormatVersion becomes available as a top level key
     * in the document
     * @param event An vscode text document change event
     * @returns nothing
     */
    async function promptOnAWSTemplateFormatVersion(
        event: vscode.TextDocumentChangeEvent,
        yamlPromptDisposables: vscode.Disposable[]
    ): Promise<void> {
        for (const change of event.contentChanges) {
            const changedLine = event.document.lineAt(change.range.start.line)
            if (changedLine.text.includes('AWSTemplateFormatVersion')) {
                await promptInstallYamlPlugin(yamlPromptDisposables)
                return
            }
        }
        return
    }

    // Show this only in VSCode since other VSCode-like IDEs (e.g. Theia) may
    // not have a marketplace or contain the YAML plugin.
    if (
        settings.isPromptEnabled('yamlExtPrompt') &&
        getIdeType() === 'vscode' &&
        !vscode.extensions.getExtension(VSCODE_EXTENSION_ID.yaml)
    ) {
        // Disposed immediately after showing one, so the user isn't prompted
        // more than once per session.
        const yamlPromptDisposables: vscode.Disposable[] = []

        // user opens a template file
        vscode.workspace.onDidOpenTextDocument(
            async (doc: vscode.TextDocument) => {
                void promptInstallYamlPluginFromFilename(doc.fileName, yamlPromptDisposables)
            },
            undefined,
            yamlPromptDisposables
        )

        // user swaps to an already-open template file that didn't have focus
        vscode.window.onDidChangeActiveTextEditor(
            async (editor: vscode.TextEditor | undefined) => {
                await promptInstallYamlPluginFromEditor(editor, yamlPromptDisposables)
            },
            undefined,
            yamlPromptDisposables
        )

        const promptNotifications = new Map<string, Promise<unknown>>()
        vscode.workspace.onDidChangeTextDocument(
            (event: vscode.TextDocumentChangeEvent) => {
                const uri = event.document.uri.toString()
                if (
                    event.document.languageId === 'yaml' &&
                    !vscode.extensions.getExtension(VSCODE_EXTENSION_ID.yaml) &&
                    !promptNotifications.has(uri)
                ) {
                    promptNotifications.set(
                        uri,
                        promptOnAWSTemplateFormatVersion(event, yamlPromptDisposables).finally(() =>
                            promptNotifications.delete(uri)
                        )
                    )
                }
            },
            undefined,
            yamlPromptDisposables
        )

        vscode.workspace.onDidCloseTextDocument((event: vscode.TextDocument) => {
            promptNotifications.delete(event.uri.toString())
        })

        // user already has an open template with focus
        // prescreen if a template.yaml is current open so we only call once
        const openTemplateYamls = vscode.window.visibleTextEditors.filter((editor) => {
            const fileName = editor.document.fileName
            return fileName.endsWith('template.yaml') || fileName.endsWith('template.yml')
        })

        if (openTemplateYamls.length > 0) {
            void promptInstallYamlPluginFromEditor(openTemplateYamls[0], yamlPromptDisposables)
        }
    }
}

async function promptInstallYamlPluginFromEditor(
    editor: vscode.TextEditor | undefined,
    disposables: vscode.Disposable[]
): Promise<void> {
    if (editor) {
        void promptInstallYamlPluginFromFilename(editor.document.fileName, disposables)
    }
}

/**
 * Prompt user to install YAML plugin for template.yaml and template.yml files
 * @param fileName File name to check against
 * @param disposables List of disposables to dispose of when the filename is a template YAML file
 */
async function promptInstallYamlPluginFromFilename(fileName: string, disposables: vscode.Disposable[]): Promise<void> {
    if (fileName.endsWith('template.yaml') || fileName.endsWith('template.yml')) {
        void promptInstallYamlPlugin(disposables)
    }
}

/**
 * Show the install YAML extension prompt and dispose other listeners
 * @param disposables
 */
async function promptInstallYamlPlugin(disposables: vscode.Disposable[]) {
    // immediately dispose other triggers so it doesn't flash again
    for (const prompt of disposables) {
        prompt.dispose()
    }
    const settings = ToolkitPromptSettings.instance

    const installBtn = localize('AWS.missingExtension.install', 'Install...')
    const permanentlySuppress = localize('AWS.message.info.yaml.suppressPrompt', "Don't show again")

    const response = await vscode.window.showInformationMessage(
        localize(
            'AWS.message.info.yaml.prompt',
            'Install YAML extension for more {0} features in CloudFormation templates',
            getIdeProperties().company
        ),
        installBtn,
        permanentlySuppress
    )

    switch (response) {
        case installBtn:
            await showExtensionPage(VSCODE_EXTENSION_ID.yaml)
            break
        case permanentlySuppress:
            await settings.disablePrompt('yamlExtPrompt')
    }
}
