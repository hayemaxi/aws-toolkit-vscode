/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as localizedText from '../../shared/localizedText'
import * as nls from 'vscode-nls'
import { ToolkitError } from '../../shared/errors'
import { AmazonQPromptSettings } from '../../shared/settings'
import {
    scopesCodeWhispererCore,
    scopesCodeWhispererChat,
    scopesFeatureDev,
    scopesGumby,
    StoredProfile,
} from '../../auth/connection'
import { getLogger } from '../../shared/logger/logger'
import { Commands } from '../../shared/vscode/commands2'
import { vsCodeState } from '../models/model'
import { showReauthenticateMessage } from '../../shared/utilities/messages'
import { showAmazonQWalkthroughOnce } from '../../amazonq/onboardingPage/walkthrough'
import { setContext } from '../../shared/vscode/setContext'
import { openUrl } from '../../shared/utilities/vsCodeUtils'
import { telemetry } from '../../shared/telemetry/telemetry'
import { AuthStateEvent, LanguageClientAuth, SsoLogin } from '../../auth/auth2'
import { builderIdStartUrl } from '../../auth/sso/constants'
import { VSCODE_EXTENSION_ID } from '../../shared/extensions'
import { getEnvironmentSpecificMemento } from '../../shared/utilities/mementos'

const localize = nls.loadMessageBundle()
// TODO: Add logging:
// const logger = getLogger('AuthUtil')

/** Backwards compatibility for connections w pre-chat scopes */
export const codeWhispererCoreScopes = [...scopesCodeWhispererCore]
export const codeWhispererChatScopes = [...codeWhispererCoreScopes, ...scopesCodeWhispererChat]
export const amazonQScopes = [...codeWhispererChatScopes, ...scopesGumby, ...scopesFeatureDev]

/**
 * Handles authentication within Amazon Q.
 * Amazon Q only supports connection at a time.
 */
export class AuthUtil {
    public readonly profileName = VSCODE_EXTENSION_ID.amazonq

    // TODO: IAM
    private session: SsoLogin

    static create(lspAuth: LanguageClientAuth) {
        return (this.#instance ??= new this(lspAuth))
    }

    // TODO: Move away from singleton and pass an instance into the Q modules.
    static #instance: AuthUtil
    public static get instance() {
        if (!this.#instance) {
            throw new ToolkitError('AuthUtil not ready. Was it initialized with a running LSP?')
        }
        return this.#instance
    }

    private constructor(private readonly lspAuth: LanguageClientAuth) {
        // TODO: IAM for SageMaker/CodeEditor
        this.session = new SsoLogin(this.profileName, this.lspAuth)
        this.onDidChangeConnectionState((e: AuthStateEvent) => this.stateChangeHandler(e))
    }

    async login(startUrl: string, region: string) {
        const response = await this.session.login({ startUrl, region, scopes: amazonQScopes })
        await showAmazonQWalkthroughOnce()

        return response
    }

    relogin() {
        if (this.session?.type !== 'sso') {
            throw new ToolkitError('Cannot reauthenticate non-SSO sessions.')
        }

        return this.session.login()
    }

    // TODO
    async loginIam() {}

    logout() {
        if (this.session?.type !== 'sso') {
            // No need to log out other session types
            return
        }

        return this.session.logout()
    }

    async getToken() {
        // TODO: IAM
        if (this.session?.type === 'sso') {
            return (await this.session.getToken()).token
        } else {
            throw new ToolkitError('No valid session.')
        }
    }

    get connection() {
        return this.session.data
    }

    // migrateExistingConnection() {
    //     const profiles: { readonly [id: string]: StoredProfile } | undefined =
    //         getEnvironmentSpecificMemento().get('auth.profiles')
    //     if (profiles) {

    //     }
    // }

    // async getConnection() {
    //     const result = (await this.lspAuth.getProfile(this.profileName)).ssoSession?.settings
    //     return result ? { startUrl: result?.sso_start_url, region: result?.sso_region } : undefined
    // }

    getAuthState() {
        return this.session.getConnectionState()
    }

    isConnected() {
        return this.getAuthState() === 'connected'
    }

    isConnectionExpired() {
        return this.getAuthState() === 'expired'
    }

    isBuilderIdConnection() {
        return this.connection?.startUrl === builderIdStartUrl
    }

    isIdcConnection() {
        return this.connection?.startUrl && this.connection?.startUrl !== builderIdStartUrl
    }

    onDidChangeConnectionState(handler: (e: AuthStateEvent) => any) {
        return this.session.onDidChangeConnectionState(handler)
    }

    // legacy
    public async setVscodeContextProps(state = this.getAuthState()) {
        await setContext('aws.codewhisperer.connected', state === 'connected')
        await setContext('aws.amazonq.showLoginView', state !== 'connected') // Login view also handles expired state.
        await setContext('aws.codewhisperer.connectionExpired', state === 'expired')
    }

    private reauthenticatePromptShown: boolean = false
    public async showReauthenticatePrompt(isAutoTrigger?: boolean) {
        if (isAutoTrigger && this.reauthenticatePromptShown) {
            return
        }

        await showReauthenticateMessage({
            message: localizedText.connectionExpired('Amazon Q'),
            connect: localizedText.reauthenticate,
            suppressId: 'codeWhispererConnectionExpired',
            settings: AmazonQPromptSettings.instance,
            reauthFunc: async () => {
                await this.relogin()
            },
        })

        if (isAutoTrigger) {
            this.reauthenticatePromptShown = true
        }
    }

    private _isCustomizationFeatureEnabled: boolean = false
    public get isCustomizationFeatureEnabled(): boolean {
        return this._isCustomizationFeatureEnabled
    }
    // This boolean controls whether the Select Customization node will be visible. A change to this value
    // means that the old UX was wrong and must refresh the devTool tree.
    public set isCustomizationFeatureEnabled(value: boolean) {
        if (this._isCustomizationFeatureEnabled === value) {
            return
        }
        this._isCustomizationFeatureEnabled = value
        void Commands.tryExecute('aws.amazonq.refreshStatusBar')
    }

    public async notifyReauthenticate(isAutoTrigger?: boolean) {
        void this.showReauthenticatePrompt(isAutoTrigger)
        await this.setVscodeContextProps()
    }

    public async notifySessionConfiguration() {
        const suppressId = 'amazonQSessionConfigurationMessage'
        const settings = AmazonQPromptSettings.instance
        const shouldShow = settings.isPromptEnabled(suppressId)
        if (!shouldShow) {
            return
        }

        const message = localize(
            'aws.amazonq.sessionConfiguration.message',
            'Your maximum session length for Amazon Q can be extended to 90 days by your administrator. For more information, refer to How to extend the session duration for Amazon Q in the IDE in the IAM Identity Center User Guide.'
        )

        const learnMoreUrl = vscode.Uri.parse(
            'https://docs.aws.amazon.com/singlesignon/latest/userguide/configure-user-session.html#90-day-extended-session-duration'
        )
        await telemetry.toolkit_showNotification.run(async () => {
            telemetry.record({ id: 'sessionExtension' })
            void vscode.window.showInformationMessage(message, localizedText.learnMore).then(async (resp) => {
                await telemetry.toolkit_invokeAction.run(async () => {
                    if (resp === localizedText.learnMore) {
                        telemetry.record({ action: 'learnMore' })
                        await openUrl(learnMoreUrl)
                    } else {
                        telemetry.record({ action: 'dismissSessionExtensionNotification' })
                    }
                    await settings.disablePrompt(suppressId)
                })
            })
        })
    }

    private async stateChangeHandler(e: AuthStateEvent) {
        if (e.state === 'refreshed') {
            const params =
                this.session?.type === 'sso' ? (await this.session.getToken()).updateCredentialsParams : undefined // TODO
            await this.lspAuth.updateBearerToken(params!)
            return
        }

        if (e.state === 'expired') {
            this.lspAuth.deleteBearerToken()
        }

        getLogger().info(`codewhisperer: connection changed to ${e.state}`)

        vsCodeState.isFreeTierLimitReached = false
        await this.setVscodeContextProps(e.state)
        await Promise.all([
            // may trigger before these modules are activated.
            Commands.tryExecute('aws.amazonq.refreshStatusBar'),
            Commands.tryExecute('aws.amazonq.updateReferenceLog'),
        ])

        if (e.state === 'connected' && this.isIdcConnection()) {
            void vscode.commands.executeCommand('aws.amazonq.notifyNewCustomizations')
        }
    }

    public reformatStartUrl(startUrl: string | undefined) {
        return !startUrl ? undefined : startUrl.replace(/[\/#]+$/g, '')
    }
}

//     /**
//      * Asynchronously returns a snapshot of the overall auth state of CodeWhisperer + Chat features.
//      * It guarantees the latest state is correct at the risk of modifying connection state.
//      * If this guarantee is not required, use sync method getChatAuthStateSync()
//      *
//      * By default, network errors are ignored when determining auth state since they may be silently
//      * recoverable later.
//      *
//      * THROTTLE: This function is called in rapid succession by Amazon Q features and can lead to
//      *           a barrage of disk access and/or token refreshes. We throttle to deal with this.
//      *
//      *           Note we do an explicit cast of the return type due to Lodash types incorrectly indicating
//      *           a FeatureAuthState or undefined can be returned. But since we set `leading: true`
//      *           it will always return FeatureAuthState
//      */
//     public getChatAuthState = throttle(() => this._getChatAuthState(), 2000, {
//         leading: true,
//     }) as () => Promise<FeatureAuthState>
