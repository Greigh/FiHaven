import Foundation

/// Build-time configuration read from Info.plist.
enum AppConfig {
    /// Cloudflare Turnstile public sitekey. Driven by the `TURNSTILE_SITEKEY`
    /// build setting (see project.yml); defaults to Cloudflare's always-pass
    /// **test** key so dev/simulator builds work out of the box. Set your
    /// real key for release builds.
    static var turnstileSiteKey: String {
        // Runtime override (set in the Xcode scheme's Run → Arguments,
        // alongside FH_BASE) so a dev build can use the real production
        // sitekey against production without touching build settings.
        // Public sitekeys aren't secrets, so passing one via env is safe.
        if let env = ProcessInfo.processInfo.environment["FH_TURNSTILE_SITEKEY"],
           !env.isEmpty {
            return env
        }
        let key = Bundle.main.object(forInfoDictionaryKey: "TurnstileSiteKey") as? String
        if let key, !key.isEmpty, !key.hasPrefix("$(") { return key }
        return "1x00000000000000000000AA"
    }

    /// Origin the Turnstile widget loads under. The sitekey's allowed
    /// hostnames in the Cloudflare dashboard must include this host.
    static var turnstileBaseURL: URL? { URL(string: "https://fihaven.app") }
}
