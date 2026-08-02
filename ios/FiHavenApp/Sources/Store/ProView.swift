import SwiftUI

/// "FiHaven Pro" — the standalone More screen for subscription status,
/// upgrade/manage, and App Store code redemption (lifted out of Settings).
///
/// It shows the paywall itself rather than a status card and an "Upgrade to
/// Pro" button that opened one: this screen has nothing else on it, so that
/// button was a tap between the user and the plans. `PaywallContent` already
/// carries the active-subscription card, the manage link, redemption, restore,
/// and the required plan/legal copy, so nothing is lost by dropping the
/// summary that used to sit here.
struct ProView: View {
    var body: some View {
        ScrollView { PaywallContent() }
            .background(Theme.bg.ignoresSafeArea())
            .navigationTitle("FiHaven Pro")
            .navigationBarTitleDisplayMode(.inline)
    }
}
