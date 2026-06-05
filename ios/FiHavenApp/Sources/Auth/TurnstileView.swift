import SwiftUI
import WebKit

/// Renders a Cloudflare Turnstile widget in a transparent WKWebView and
/// reports the solved token back to SwiftUI. Mirrors the web login page's
/// inline widget (docs/native-contract.md §3.2). Tokens are single-use;
/// give the view a fresh `.id(...)` to reset after a failed submit.
struct TurnstileView: UIViewRepresentable {
    let siteKey: String
    var baseURL: URL? = AppConfig.turnstileBaseURL
    var onToken: (String) -> Void
    var onError: () -> Void = {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onToken: onToken, onError: onError)
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

        init(onToken: @escaping (String) -> Void, onError: @escaping () -> Void) {
            self.onToken = onToken
            self.onError = onError
        }

        func userContentController(
            _ controller: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard let body = message.body as? [String: Any],
                  let type = body["type"] as? String else { return }
            if type == "token" {
                onToken((body["token"] as? String) ?? "")
            } else {
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
            .wrap { display: flex; justify-content: center; padding-top: 2px; }
          </style>
        </head>
        <body>
          <div class="wrap">
            <div class="cf-turnstile"
                 data-sitekey="\(siteKey)"
                 data-theme="auto"
                 data-callback="onOK"
                 data-error-callback="onErr"
                 data-expired-callback="onExp"
                 data-timeout-callback="onErr"></div>
          </div>
          <script>
            function post(type, token) {
              try {
                window.webkit.messageHandlers.turnstile.postMessage({ type: type, token: token || "" });
              } catch (e) {}
            }
            function onOK(t)  { post("token", t); }
            function onErr()  { post("error"); }
            function onExp()  { post("expired"); }
          </script>
        </body>
        </html>
        """
    }
}
