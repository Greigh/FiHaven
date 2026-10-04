import SwiftUI
import AuthenticationServices

/// The "Continue with Apple" control, at the size the layout asks for.
///
/// iOS hands this straight to SwiftUI's `SignInWithAppleButton`, which draws
/// the platform's Apple button at 48pt and needs no help.
///
/// macOS cannot: SwiftUI hosts a `UIViewRepresentable`'s AppKit twin and sizes
/// it from the hosted view's *intrinsic* size, and `ASAuthorizationAppleIDButton`
/// always reports 130×30. A `.frame(height: 48)` therefore produced a 30pt-tall
/// black band with an 11pt label sitting next to the 48pt white Google button —
/// the aspect the screenshot complains about. Hosting the AppKit control
/// directly and answering the layout proposal with `sizeThatFits` is what makes
/// it draw at 48pt; the button scales its own label to whatever frame it is
/// given (its `controlSize` has no effect on macOS).
///
/// The style is `.white` on the Mac in both appearances, matching the Google
/// button beside it, which is white with a hairline border everywhere. On iOS
/// the black button is the platform norm and stays.
struct AppleSignInButton: View {
    var disabled: Bool = false
    var onResult: (Result<ASAuthorization, Error>) -> Void

    var body: some View {
        #if canImport(UIKit)
        SignInWithAppleButton(.continue) { request in
            request.requestedScopes = [.fullName, .email]
        } onCompletion: { result in
            onResult(result)
        }
        .signInWithAppleButtonStyle(.black)
        .frame(height: 48)
        .disabled(disabled)
        #else
        MacAppleSignInButton(disabled: disabled, onResult: onResult)
            .frame(maxWidth: .infinity, minHeight: 48, maxHeight: 48)
        #endif
    }
}

#if !canImport(UIKit)
/// The AppKit Apple button plus the authorization request it drives.
///
/// `ASAuthorizationController` is the same API the iOS button uses internally;
/// on macOS nobody performs the request for us, so the button's target/action
/// starts it and this object is the controller's delegate.
private struct MacAppleSignInButton: NSViewRepresentable {
    var disabled: Bool
    var onResult: (Result<ASAuthorization, Error>) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onResult: onResult)
    }

    func makeNSView(context: Context) -> ASAuthorizationAppleIDButton {
        let button = ASAuthorizationAppleIDButton(type: .continue, style: .white)
        // Matches the Google button's `RoundedRectangle(cornerRadius: 8)`, so
        // the two read as one pair rather than one Apple-shaped and one not.
        button.cornerRadius = 8
        button.target = context.coordinator
        button.action = #selector(Coordinator.authorize(_:))
        return button
    }

    func updateNSView(_ button: ASAuthorizationAppleIDButton, context: Context) {
        context.coordinator.onResult = onResult
        button.isEnabled = !disabled
    }

    /// Without this the button keeps its 130×30 intrinsic size whatever frame
    /// the layout gives it — see the type's comment.
    func sizeThatFits(
        _ proposal: ProposedViewSize,
        nsView: ASAuthorizationAppleIDButton,
        context: Context
    ) -> CGSize? {
        let intrinsic = nsView.intrinsicContentSize
        return CGSize(
            width: proposal.width ?? intrinsic.width,
            height: proposal.height ?? intrinsic.height
        )
    }

    @MainActor
    final class Coordinator: NSObject, ASAuthorizationControllerDelegate,
                             ASAuthorizationControllerPresentationContextProviding {
        var onResult: (Result<ASAuthorization, Error>) -> Void
        /// Held for the life of the request: `ASAuthorizationController` does
        /// not retain itself, and a deallocated controller reports nothing back.
        private var controller: ASAuthorizationController?

        init(onResult: @escaping (Result<ASAuthorization, Error>) -> Void) {
            self.onResult = onResult
        }

        @objc func authorize(_ sender: Any?) {
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            self.controller = controller
            controller.performRequests()
        }

        func authorizationController(
            controller: ASAuthorizationController,
            didCompleteWithAuthorization authorization: ASAuthorization
        ) {
            self.controller = nil
            onResult(.success(authorization))
        }

        func authorizationController(
            controller: ASAuthorizationController,
            didCompleteWithError error: Error
        ) {
            self.controller = nil
            onResult(.failure(error))
        }

        func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
            keyPlatformWindow() ?? ASPresentationAnchor()
        }
    }
}
#endif
