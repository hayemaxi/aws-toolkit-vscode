/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as localizedText from '../../shared/localizedText'
import * as nls from 'vscode-nls'
import { ToolkitError } from '../../shared/errors'
import { AmazonQPromptSettings } from '../../shared/settings'
import { scopesCodeWhispererCore, scopesCodeWhispererChat, scopesFeatureDev, scopesGumby } from '../../auth/connection'
import { getLogger } from '../../shared/logger/logger'
import { Commands } from '../../shared/vscode/commands2'
import { vsCodeState } from '../models/model'
import { showReauthenticateMessage } from '../../shared/utilities/messages'
import { showAmazonQWalkthroughOnce } from '../../amazonq/onboardingPage/walkthrough'
import { setContext } from '../../shared/vscode/setContext'
import { openUrl } from '../../shared/utilities/vsCodeUtils'
import { telemetry } from '../../shared/telemetry/telemetry'
import {
    AuthStateEvent,
    ConnectionManager,
    IamLogin,
    LanguageClientAuth,
    Login,
    SsoConnection,
    SsoLogin,
} from '../../auth/auth2'
import { builderIdStartUrl } from '../../auth/sso/constants'
import { SsoTokenChangedParams } from '@aws/language-server-runtimes/protocol'
import { VSCODE_EXTENSION_ID } from '../../shared/extensions'

const localize = nls.loadMessageBundle()
const logger = getLogger('AuthUtil')

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
    private session: Login | undefined

    static create(lspAuth: LanguageClientAuth) {
        return (this.#instance ??= new this(lspAuth))
    }

    // TODO: Move away from singleton and pass an instance into the Q modules.
    static #instance: AuthUtil
    public static get instance() {
        if (!this.#instance) {
            throw new ToolkitError('AmazonQSsoAuth not ready. Was it initialized with a running LSP?')
        }
        return this.#instance
    }

    private constructor(
        private readonly lspAuth: LanguageClientAuth,
        private readonly connectionManager = ConnectionManager.instance
    ) {
        this.onDidChangeConnectionState((e: AuthStateEvent) => this.stateChangeHandler(e))
        lspAuth.registerSsoTokenChangedHandler((params: SsoTokenChangedParams) => this.ssoTokenChangedHandler(params))

        const existingConn = connectionManager.getConnection(this.profileName)
        if (existingConn?.type === 'sso') {
            this.session = new SsoLogin(this.profileName, this.lspAuth, this.connectionManager)
        } else if (existingConn?.type === 'iam') {
            this.session = new IamLogin() // TODO
        }
    }

    async login(startUrl: string, region: string) {
        this.session = new SsoLogin(this.profileName, this.lspAuth, this.connectionManager)
        const response = this.session.login(startUrl, region, amazonQScopes)
        await showAmazonQWalkthroughOnce()

        return response
    }

    relogin() {
        if (this.session?.type !== 'sso') {
            throw new ToolkitError('Cannot reauthenticate non-SSO sessions.')
        }

        return this.session.relogin()
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

    get connection(): SsoConnection | undefined {
        return this.connectionManager.getConnection(this.profileName) as SsoConnection // TODO: IAM
    }

    getAuthState() {
        return this.connectionManager.getConnection(this.profileName)?.state ?? 'notConnected'
    }

    private async ssoTokenChangedHandler(params: SsoTokenChangedParams) {
        if (params.ssoTokenId !== this.connection?.tokenId) {
            return
        }
        switch (params.kind) {
            case 'Expired':
                // Not implemented on LSP yet
                logger.debug("AmazonQSsoAuth: received 'Expired' event from LSP, but this event is not handled.")
                break
            case 'Refreshed': {
                const params =
                    this.session?.type === 'sso' ? (await this.session.getToken()).updateCredentialsParams : undefined // TODO
                await this.lspAuth.updateBearerToken(params!)
                break
            }
        }
    }

    isConnected() {
        return this.getAuthState() === 'connected'
    }

    isConnectionExpired() {
        return this.getAuthState() === 'expired'
    }

    isBuilderIdConnection() {
        const conn = this.connection
        return conn?.type === 'sso' && conn.startUrl === builderIdStartUrl
    }

    isIdcConnection() {
        const conn = this.connection
        return conn?.type === 'sso' && conn?.startUrl !== builderIdStartUrl
    }

    onDidChangeConnectionState(handler: (e: AuthStateEvent) => any) {
        return this.connectionManager.onDidChangeConnectionState(this.profileName, handler)
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
