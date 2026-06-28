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
struct TurnstileView: UIViewRepresentable {
    let siteKey: String
    var baseURL: URL? = AppConfig.turnstileBaseURL
    var onToken: (String) -> Void
    var onError: () -> Void = {}
    var onHeight: (CGFloat) -> Void = { _ in }

    func makeCoordinator() -> Coordinator {
        Coordinator(onToken: onToken, onError: onError, onHeight: onHeight)
    }

    func makeUIView(context: Context) -> WKWebView {
        let controller = WKUserContentController()
        controller.add(context.coordinator, name: "turnstile")

        let config = WKWebViewConfiguration()
        config.userContentController = controller

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false
        webView.loadHTMLString(Self.html(siteKey: siteKey), baseURL: baseURL)
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.configuration.userContentController
            .removeScriptMessageHandler(forName: "turnstile")
    }

    final class Coordinator: NSObject, WKScriptMessageHandler {
        let onToken: (String) -> Void
        let onError: () -> Void
        let onHeight: (CGFloat) -> Void

        init(onToken: @escaping (String) -> Void,
             onError: @escaping () -> Void,
             onHeight: @escaping (CGFloat) -> Void) {
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
    }

    private static func html(siteKey: String) -> String {
        """
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
                 data-sitekey="\(siteKey)"
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
