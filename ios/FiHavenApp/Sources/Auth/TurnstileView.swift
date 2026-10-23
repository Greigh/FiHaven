import SwiftUI
import WebKit

/// Renders a Cloudflare Turnstile widget in a transparent WKWebView and
/// reports the solved token back to SwiftUI. Mirrors the web login page's
/// inline widget (docs/native-contract.md §3.2). Tokens are single-use;
/// give the view a fresh `.id(...)` to reset after a failed submit.
///
/// Also reports the widget's rendered height so the caller can size the
/// frame to fit — invisible-mode sitekeys render nothing, so the host can
/// collapse the space instead of leaving an awkward fixed-height gap.
/// How much of the widget Cloudflare is allowed to draw before a person is
/// actually needed. `interactionOnly` keeps the widget off the form while the
/// challenge runs in the background; `always` is Cloudflare's own default and
/// emits no attribute at all.
enum TurnstileAppearance {
    case interactionOnly
    case always

    /// The value for the widget's `data-appearance` attribute, or nil to leave
    /// the attribute out — `data-appearance=""` is not a value Cloudflare
    /// documents, and the default it falls back to is `always` anyway.
    var dataAttribute: String? {
        switch self {
        case .interactionOnly: "interaction-only"
        case .always: nil
        }
    }
}

struct TurnstileView {
    let siteKey: String
    var appearance: TurnstileAppearance = .interactionOnly
    var baseURL: URL? = AppConfig.turnstileBaseURL
    var onToken: (String) -> Void
    var onError: () -> Void = {}
    var onHeight: (CGFloat) -> Void = { _ in }

    func makeCoordinator() -> Coordinator {
        Coordinator(baseURL: baseURL, onToken: onToken, onError: onError, onHeight: onHeight)
    }

    /// The set of documents the challenge WebView may navigate to. The page is
    /// a static string of ours, so this isn't about hostile content — it's
    /// about keeping the WebView's own surface small. It hands whatever
    /// document it shows an injected message handler that reports the captcha
    /// token, and that token is what the sign-in request carries, so the set of
    /// documents it can reach is worth pinning: the policy failing open is a
    /// hole, and failing closed breaks sign-in for everyone.
    enum TurnstileNavigationPolicy {
        /// Only the document's own base URL (which Turnstile checks the
        /// sitekey against) and Cloudflare's challenge origins may navigate.
        /// Everything else — non-web schemes, missing hosts, frames the
        /// widget loads itself — passes through untouched: none of them can
        /// reach the handler cross-origin, and cancelling navigations we
        /// cannot classify would break the widget.
        static func allows(_ url: URL?, baseHost: String?) -> Bool {
            guard let url,
                  let scheme = url.scheme?.lowercased(),
                  scheme == "https" || scheme == "http",
                  let host = url.host?.lowercased(), !host.isEmpty else {
                return true
            }
            if let baseHost, host == baseHost.lowercased() { return true }
            return host == "cloudflare.com" || host.hasSuffix(".cloudflare.com")
        }
    }

    func makeWebView(coordinator: Coordinator) -> WKWebView {
        let controller = WKUserContentController()
        controller.add(coordinator, name: "turnstile")

        let config = WKWebViewConfiguration()
        config.userContentController = controller

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = coordinator
        #if canImport(UIKit)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false
        #else
        webView.setValue(false, forKey: "drawsBackground")
        webView.underPageBackgroundColor = .clear
        #endif
        webView.loadHTMLString(Self.html(siteKey: siteKey, appearance: appearance), baseURL: baseURL)
        return webView
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        let onToken: (String) -> Void
        let onError: () -> Void
        let onHeight: (CGFloat) -> Void
        /// The document's own host — the one URL besides Cloudflare's that may
        /// navigate inside this WebView, since `loadHTMLString` reports it as
        /// the page's URL and denying it would stop the widget from starting.
        let baseHost: String?

        init(baseURL: URL?,
             onToken: @escaping (String) -> Void,
             onError: @escaping () -> Void,
             onHeight: @escaping (CGFloat) -> Void) {
            self.baseHost = baseURL?.host
            self.onToken = onToken
            self.onError = onError
            self.onHeight = onHeight
        }

        func userContentController(
            _ controller: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard let body = message.body as? [String: Any],
                  let type = body["type"] as? String else { return }
            switch type {
            case "token":
                onToken((body["token"] as? String) ?? "")
            case "height":
                if let raw = body["value"] as? String, let v = Double(raw) {
                    onHeight(CGFloat(v))
                }
            default:
                onError()
            }
        }

        func webView(_ webView: WKWebView,
                     decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            decisionHandler(
                TurnstileNavigationPolicy.allows(navigationAction.request.url,
                                                 baseHost: baseHost) ? .allow : .cancel
            )
        }
    }
}

#if canImport(UIKit)
extension TurnstileView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        makeWebView(coordinator: context.coordinator)
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.configuration.userContentController
            .removeScriptMessageHandler(forName: "turnstile")
    }
}
#else
extension TurnstileView: NSViewRepresentable {
    func makeNSView(context: Context) -> WKWebView {
        makeWebView(coordinator: context.coordinator)
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}

    static func dismantleNSView(_ nsView: WKWebView, coordinator: Coordinator) {
        nsView.configuration.userContentController
            .removeScriptMessageHandler(forName: "turnstile")
    }
}
#endif

extension TurnstileView {
    static func html(siteKey: String, appearance: TurnstileAppearance = .interactionOnly) -> String {
        let appearanceAttr = appearance.dataAttribute.map { "\n                 data-appearance=\"\($0)\"" } ?? ""
        return """
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
          <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
          <style>
            html, body { margin: 0; padding: 0; background: transparent; }
            .wrap { display: flex; justify-content: center; }
          </style>
        </head>
        <body>
          <div class="wrap">
            <div class="cf-turnstile"
                 data-sitekey="\(siteKey)"\(appearanceAttr)
                 data-theme="auto"
                 data-refresh-expired="auto"
                 data-retry="auto"
                 data-callback="onOK"
                 data-error-callback="onErr"
                 data-expired-callback="onExp"
                 data-timeout-callback="onErr"></div>
          </div>
          <script>
            function send(type, payload) {
              try {
                window.webkit.messageHandlers.turnstile.postMessage(Object.assign({ type: type }, payload || {}));
              } catch (e) {}
            }
            function onOK(t)  { send("token", { token: t || "" }); }
            function onErr()  { send("error"); }
            function onExp()  { send("expired"); }
            // Report the actual rendered height so the host can fit (or
            // collapse, for invisible sitekeys) instead of a fixed gap.
            function postHeight() { send("height", { value: String(Math.ceil(document.body.scrollHeight)) }); }
            try { new ResizeObserver(postHeight).observe(document.body); } catch (e) {}
            window.addEventListener("load", function () { postHeight(); setTimeout(postHeight, 600); });
          </script>
        </body>
        </html>
        """
    }
}
