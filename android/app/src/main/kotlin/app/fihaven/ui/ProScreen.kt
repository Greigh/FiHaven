package app.fihaven.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.fihaven.AppViewModel
import app.fihaven.ui.theme.Ct

/**
 * "FiHaven Pro" — the standalone More screen for subscription status,
 * upgrade/manage, and promo redemption (lifted out of Settings).
 *
 * It shows the paywall itself rather than a status card and an "Upgrade to
 * Pro" button that opened one: this screen has nothing else on it, so that
 * button was a tap between the user and the plans. [PaywallContent] already
 * carries the active-subscription card, the manage link, redemption, restore,
 * and the required plan/legal copy, so nothing is lost by dropping the
 * summary that used to sit here.
 */
@Composable
fun ProScreen(vm: AppViewModel, padding: PaddingValues, onBack: (() -> Unit)? = null) {
    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)) {
        ScreenHeader("FiHaven Pro", onBack = onBack)
        PaywallContent(
            vm,
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp),
        )
    }
}
