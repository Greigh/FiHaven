import Foundation
import FiHavenCore

func runAccountChecks() async {
    let cfg = APIConfig.localhost

    await sectionAsync("Account — mfaStatus decodes") {
        MockURLProtocol.reset()
        let client = APIClient(config: cfg, tokens: InMemoryTokenStore("t"),
                               session: MockURLProtocol.session())
        let body = """
        {"totp":{"enabled":true,"enabledAt":1730000000000,"lastUsedAt":null},
         "passkeys":[{"id":3,"name":"iPhone","transports":["internal"],"createdAt":1730000000000,"lastUsedAt":null}],
         "backupCodes":{"total":10,"unused":7},
         "emailMfa":{"enabled":false,"email":"d@e.com"}}
        """
        MockURLProtocol.handler = { _ in (200, Data(body.utf8)) }
        let status = try await client.mfaStatus()
        check(status.totp.enabled, "totp enabled parsed")
        checkEqual(status.backupCodes.unused, 7, "backup unused parsed")
        checkEqual(status.passkeys.count, 1, "passkeys parsed")
        checkEqual(status.passkeys.first?.name, "iPhone", "passkey name parsed")
        check(!status.emailMfa.enabled, "email mfa disabled parsed")
    }

    await sectionAsync("Account — totpSetup + confirm") {
        MockURLProtocol.reset()
        let client = APIClient(config: cfg, tokens: InMemoryTokenStore("t"),
                               session: MockURLProtocol.session())
        MockURLProtocol.handler = { _ in
            (200, Data(#"{"uri":"otpauth://totp/x","qrDataUrl":"data:image/png;base64,AAAA","secret":"ABCD"}"#.utf8))
        }
        let setup = try await client.totpSetup(password: "pw")
        checkEqual(setup.secret, "ABCD", "totp secret parsed")
        check(setup.qrDataUrl.hasPrefix("data:image/png"), "qr data url parsed")

        MockURLProtocol.handler = { _ in (200, Data(#"{"ok":true,"backupCodes":["a-b","c-d"]}"#.utf8)) }
        let codes = try await client.totpConfirm(code: "123456")
        checkEqual(codes, ["a-b", "c-d"], "backup codes returned")
    }

    await sectionAsync("Account — changeName posts to right path") {
        MockURLProtocol.reset()
        let client = APIClient(config: cfg, tokens: InMemoryTokenStore("t"),
                               session: MockURLProtocol.session())
        MockURLProtocol.handler = { _ in (200, Data(#"{"ok":true,"name":"Dana"}"#.utf8)) }
        let name = try await client.changeName("Dana")
        checkEqual(name, "Dana", "name echoed")
        check(MockURLProtocol.lastRequest?.url?.absoluteString
              == "http://localhost:5222/api/account/change-name", "change-name URL")
    }
}
