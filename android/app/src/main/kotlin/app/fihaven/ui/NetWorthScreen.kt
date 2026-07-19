package app.fihaven.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.fihaven.AppViewModel
import app.fihaven.core.Money
import app.fihaven.core.model.Account
import app.fihaven.ui.theme.Ct

/**
 * Net Worth tab — assets (the accounts you own) minus liabilities (the
 * non-archived cards and loans you owe). Asset accounts are added and edited
 * here; the debts side comes from the Cards/Loans tabs. Mirrors the web
 * NetWorthPanel and the iOS NetWorthView.
 */
private val ACCOUNT_TYPES = mapOf(
    "checking" to ("Checking" to "🏦"),
    "savings" to ("Savings" to "💰"),
    "investment" to ("Investments" to "📈"),
    "property" to ("Property" to "🏠"),
    "cash" to ("Cash" to "💵"),
    "other" to ("Other" to "📦"),
)

private fun typeLabel(t: String) = ACCOUNT_TYPES[t]?.first ?: "Other"
private fun typeIcon(t: String) = ACCOUNT_TYPES[t]?.second ?: "📦"

@Composable
fun NetWorthScreen(vm: AppViewModel, padding: PaddingValues, onBack: (() -> Unit)? = null) {
    val data by vm.data.collectAsStateWithLifecycle()
    var editing by remember { mutableStateOf<Account?>(null) }
    var creating by remember { mutableStateOf(false) }

    val assets = data.accounts.sumOf { it.balance }
    // Archived cards are soft-deleted, so they must not count as debt.
    val liabilities = data.activeCards.sumOf { it.balance }
    val netWorth = assets - liabilities

    Column(Modifier.fillMaxSize().background(Ct.colors.bg).padding(padding)) {
        ScreenHeader("Net Worth", onAdd = { creating = true }, onBack = onBack, branded = true)
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                CtCard {
                    Text("NET WORTH", color = Ct.colors.muted, fontSize = 10.sp,
                        fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        Money.fmt(netWorth),
                        color = if (netWorth >= 0) Ct.colors.green else Ct.colors.red,
                        fontSize = 28.sp, fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.height(12.dp))
                    Row(Modifier.fillMaxWidth()) {
                        Column(Modifier.weight(1f)) {
                            Text("Assets", color = Ct.colors.muted, fontSize = 11.sp)
                            Text(Money.fmt(assets), color = Ct.colors.green,
                                fontSize = 15.sp, fontWeight = FontWeight.Medium)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text("Debts", color = Ct.colors.muted, fontSize = 11.sp)
                            Text(Money.fmt(liabilities), color = Ct.colors.red,
                                fontSize = 15.sp, fontWeight = FontWeight.Medium)
                        }
                    }
                }
            }

            if (data.accounts.isEmpty()) {
                item {
                    CtCard {
                        Text(
                            "No accounts yet. Tap + to add savings, checking, investments, or property.",
                            color = Ct.colors.muted,
                        )
                    }
                }
            } else {
                items(data.accounts, key = { it.id }) { account ->
                    CtCard(modifier = Modifier.clickable { editing = account }) {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Text(typeIcon(account.type), fontSize = 18.sp,
                                modifier = Modifier.padding(end = 12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(
                                    account.name.ifBlank { typeLabel(account.type) },
                                    color = Ct.colors.text, fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                )
                                Text(typeLabel(account.type), color = Ct.colors.muted, fontSize = 12.sp)
                            }
                            Text(Money.fmt(account.balance), color = Ct.colors.text,
                                fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
        }
    }

    if (creating) AccountEditorDialog(null, vm, onDismiss = { creating = false })
    editing?.let { AccountEditorDialog(it, vm, onDismiss = { editing = null }) }
}
