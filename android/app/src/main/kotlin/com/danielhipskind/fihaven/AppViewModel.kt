package com.danielhipskind.fihaven

import android.app.Application
import android.content.Context
import androidx.core.content.edit
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.danielhipskind.fihaven.core.model.AppData
import com.danielhipskind.fihaven.core.model.Bill
import com.danielhipskind.fihaven.core.model.Card
import com.danielhipskind.fihaven.core.model.Entitlement
import com.danielhipskind.fihaven.core.model.IncomeSource
import com.danielhipskind.fihaven.core.model.Payment
import com.danielhipskind.fihaven.core.model.PromoResult
import com.danielhipskind.fihaven.core.model.incomes
import com.danielhipskind.fihaven.core.model.paidGoal
import com.danielhipskind.fihaven.core.model.timezoneSetting
import com.danielhipskind.fihaven.core.model.currency
import com.danielhipskind.fihaven.core.model.withIncomes
import com.danielhipskind.fihaven.core.model.withPaidGoal
import com.danielhipskind.fihaven.core.model.withSetting
import com.danielhipskind.fihaven.core.model.withTimezone
import com.danielhipskind.fihaven.core.Money
import kotlinx.serialization.json.JsonPrimitive
import com.danielhipskind.fihaven.core.logic.DateLogic
import com.danielhipskind.fihaven.core.logic.PaidGoalPolicy
import com.danielhipskind.fihaven.core.logic.PaidState
import com.danielhipskind.fihaven.core.logic.Schedule
import com.danielhipskind.fihaven.core.logic.UpcomingItem
import com.danielhipskind.fihaven.core.net.ApiClient
import com.danielhipskind.fihaven.core.net.ApiConfig
import com.danielhipskind.fihaven.core.net.ApiError
import com.danielhipskind.fihaven.core.net.LoginOutcome
import com.danielhipskind.fihaven.core.net.MfaChallenge
import com.danielhipskind.fihaven.core.net.User
import com.danielhipskind.fihaven.data.PrefsTokenStore
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneId
import kotlin.time.Duration.Companion.milliseconds

private const val BIO_KEY = "fh_biometric"

sealed interface Session {
    data object Loading : Session
    data object SignedOut : Session
    data class Mfa(val challenge: MfaChallenge) : Session
    data class Unverified(val user: User) : Session
    data class SignedIn(val user: User) : Session
}

/// Mirrors the iOS AppEnvironment: owns the API client + token store and
/// the auth state machine, and holds the loaded AppData.
class AppViewModel(app: Application) : AndroidViewModel(app) {
    private val tokens = PrefsTokenStore(app)
    val api = ApiClient(ApiConfig(BuildConfig.API_BASE), tokens)

    private val _session = MutableStateFlow<Session>(Session.Loading)
    val session: StateFlow<Session> = _session.asStateFlow()

    private val _data = MutableStateFlow(AppData())
    val data: StateFlow<AppData> = _data.asStateFlow()

    private val _entitlement = MutableStateFlow(Entitlement())
    val entitlement: StateFlow<Entitlement> = _entitlement.asStateFlow()

    // ── Biometric app lock (local, per-device) ───────────────────────
    private val prefs = app.getSharedPreferences("fh_prefs", Context.MODE_PRIVATE)
    private val _biometricEnabled = MutableStateFlow(prefs.getBoolean(BIO_KEY, false))
    val biometricEnabled: StateFlow<Boolean> = _biometricEnabled.asStateFlow()
    // Cold launch starts locked when enabled; a fresh login clears it.
    private val _locked = MutableStateFlow(prefs.getBoolean(BIO_KEY, false))
    val locked: StateFlow<Boolean> = _locked.asStateFlow()

    fun setBiometricEnabled(on: Boolean) {
        _biometricEnabled.value = on
        prefs.edit { putBoolean(BIO_KEY, on) }
        _locked.value = false
    }

    fun lockIfEnabled() { if (_biometricEnabled.value) _locked.value = true }
    fun confirmUnlock() { _locked.value = false }
    /** DEBUG screenshot aid: force the lock screen. */
    fun demoLock() { _biometricEnabled.value = true; _locked.value = true }

    private val _working = MutableStateFlow(false)
    val working: StateFlow<Boolean> = _working.asStateFlow()

    private val _authError = MutableStateFlow<String?>(null)
    val authError: StateFlow<String?> = _authError.asStateFlow()

    private var authStartedAt = ApiClient.now()

    init { bootstrap() }

    fun markAuthStarted() { authStartedAt = ApiClient.now() }

    private fun bootstrap() = viewModelScope.launch {
        if (tokens.get() != null) {
            try {
                val user = api.me()
                if (user != null) { enterSignedIn(user); return@launch }
            } catch (_: Exception) { /* fall through */ }
        }
        _session.value = Session.SignedOut
    }

    fun login(
        email: String,
        password: String,
        captchaToken: String = "dev-bypass-token",
        startedAtOverride: Long? = null,
    ) = viewModelScope.launch {
        runAuth {
            when (val outcome = api.login(email, password, captchaToken, startedAtOverride ?: authStartedAt)) {
                is LoginOutcome.Authenticated -> enterSignedIn(outcome.session.user, fresh = true)
                is LoginOutcome.MfaRequired -> _session.value = Session.Mfa(outcome.challenge)
            }
        }
    }

    fun signup(email: String, password: String, captchaToken: String = "dev-bypass-token") =
        viewModelScope.launch {
            runAuth { enterSignedIn(api.signup(email, password, captchaToken, authStartedAt).user, fresh = true) }
        }

    fun verifyMfa(code: String) = viewModelScope.launch {
        val challenge = (_session.value as? Session.Mfa)?.challenge ?: return@launch
        runAuth { enterSignedIn(api.verifyMfa(challenge.mfaToken, code).user, fresh = true) }
    }

    fun cancelMfa() { _session.value = Session.SignedOut; _authError.value = null }

    fun logout() = viewModelScope.launch {
        runCatching { api.logout() }
        _session.value = Session.SignedOut
        _data.value = AppData()
        _entitlement.value = Entitlement()
    }

    /// DEBUG screenshot helper: log in as the dev demo account.
    fun devAutoLogin() =
        login("demo@fihaven.app", "demopassword11", "dev-bypass-token", ApiClient.now() - 3000)

    private suspend fun enterSignedIn(user: User, fresh: Boolean = false) {
        // Unconfirmed email → the verify screen, never the dashboard. The
        // server also returns email-unverified on data calls, but gating
        // here avoids fetching the data at all.
        if (!user.emailVerified) {
            _session.value = Session.Unverified(user)
            return
        }
        // A fresh password/MFA sign-in already authenticated the user, so
        // don't gate behind biometrics; a token-restored session stays locked.
        if (fresh) _locked.value = false
        _session.value = Session.SignedIn(user)
        loadData()
    }

    /** Re-send the verification email. Returns true on success. */
    suspend fun resendVerification(): Boolean =
        runCatching { api.resendVerification() }.isSuccess

    /** Re-check verification after the user opens the email link elsewhere.
     *  Enters the app when confirmed; returns false (and stays put) if not. */
    suspend fun refreshVerification(): Boolean =
        try {
            val user = api.me()
            when {
                user == null -> { _session.value = Session.SignedOut; false }
                user.emailVerified -> { enterSignedIn(user, fresh = true); true }
                else -> { _session.value = Session.Unverified(user); false }
            }
        } catch (e: ApiError) {
            _authError.value = e.userMessage; false
        } catch (e: Exception) {
            _authError.value = e.message ?: "Something went wrong."; false
        }

    private suspend fun loadData() {
        runCatching {
            _data.value = api.fetchData()
            Money.setCurrency(_data.value.settings.currency)
            // Seed entitlement from the data fetch, then refresh authoritatively.
            _data.value.entitlement?.let { _entitlement.value = it }
        }
        refreshEntitlement()
    }

    // ── Billing / entitlement ────────────────────────────────────────
    suspend fun refreshEntitlement() {
        runCatching { _entitlement.value = api.billingStatus() }
    }

    /** "Restore purchases" — re-sync entitlement from the server. */
    fun restore() = viewModelScope.launch { refreshEntitlement() }

    /** Send a verified Play purchase to the server and adopt the entitlement. */
    fun verifyGooglePurchase(productId: String, purchaseToken: String) = viewModelScope.launch {
        runCatching { _entitlement.value = api.verifyGoogle(productId, purchaseToken) }
    }

    /** Redeem a server promo code. onResult(result, errorMessage). */
    fun redeemPromo(code: String, onResult: (PromoResult?, String?) -> Unit) = viewModelScope.launch {
        runCatching { api.redeemPromo(code.trim()) }
            .onSuccess { result ->
                result.entitlement?.let { _entitlement.value = it }
                onResult(result, null)
            }
            .onFailure { e ->
                onResult(null, (e as? ApiError)?.let(::promoError) ?: "Couldn’t redeem that code.")
            }
    }

    private fun promoError(e: ApiError): String = when ((e as? ApiError.Http)?.code) {
        "already-redeemed" -> "You’ve already used that code."
        "code-exhausted" -> "That code has reached its limit."
        "code-expired" -> "That code has expired."
        "invalid-code" -> "That code isn’t valid."
        else -> "Couldn’t redeem that code."
    }

    private suspend fun runAuth(block: suspend () -> Unit) {
        _working.value = true
        _authError.value = null
        try {
            block()
        } catch (e: ApiError) {
            _authError.value = e.userMessage
        } catch (e: Exception) {
            _authError.value = e.message ?: "Something went wrong."
        } finally {
            _working.value = false
        }
    }

    // ── Account helpers (used by Settings) ───────────────────────────
    val currentUser: User? get() = (_session.value as? Session.SignedIn)?.user

    fun applyUser(user: User) {
        if (_session.value is Session.SignedIn) _session.value = Session.SignedIn(user)
    }

    fun deleteAccount(password: String, onError: (String) -> Unit) = viewModelScope.launch {
        try {
            api.deleteAccount(password)
            tokens.clear()
            _session.value = Session.SignedOut
            _data.value = AppData()
            _entitlement.value = Entitlement()
        } catch (e: ApiError) {
            onError(e.userMessage)
        } catch (e: Exception) {
            onError(e.message ?: "Something went wrong.")
        }
    }

    // ── Data store: in-memory edits + debounced full-snapshot save ───
    private var saveJob: Job? = null

    fun mutate(transform: (AppData) -> AppData) {
        _data.value = transform(_data.value)
        saveJob?.cancel()
        saveJob = viewModelScope.launch {
            delay(800.milliseconds)
            runCatching { api.saveData(_data.value) }
        }
    }

    fun upsertBill(bill: Bill) = mutate { d ->
        val list = d.bills.toMutableList()
        val i = list.indexOfFirst { it.id == bill.id }
        if (i >= 0) list[i] = bill else list.add(bill)
        d.copy(bills = list)
    }

    fun deleteBill(bill: Bill) = mutate { it.copy(bills = it.bills.filterNot { b -> b.id == bill.id }) }

    fun upsertCard(card: Card) = mutate { d ->
        val list = d.cards.toMutableList()
        val i = list.indexOfFirst { it.id == card.id }
        if (i >= 0) list[i] = card else list.add(card)
        d.copy(cards = list)
    }

    fun deleteCard(card: Card) = mutate { it.copy(cards = it.cards.filterNot { c -> c.id == card.id }) }

    fun deletePayment(payment: Payment) = mutate { d ->
        val payments = d.payments.filterNot { p -> p.id == payment.id }
        // Undo the balance decrement a card payment applied.
        val cards = if (payment.type == "card")
            applyCardPaymentDelta(d.cards, payment.refId, -payment.amount) else d.cards
        d.copy(payments = payments, cards = cards)
    }

    fun upsertIncome(source: IncomeSource) = mutate { d ->
        val list = d.settings.incomes.toMutableList()
        val i = list.indexOfFirst { it.id == source.id }
        if (i >= 0) list[i] = source else list.add(source)
        d.copy(settings = d.settings.withIncomes(list))
    }

    fun deleteIncome(source: IncomeSource) =
        mutate { d -> d.copy(settings = d.settings.withIncomes(d.settings.incomes.filterNot { it.id == source.id })) }

    fun setTimezone(tz: String?) = mutate { it.copy(settings = it.settings.withTimezone(tz)) }

    fun setPaidGoal(policy: PaidGoalPolicy) =
        mutate { it.copy(settings = it.settings.withPaidGoal(policy.raw)) }

    fun setCurrency(code: String) {
        Money.setCurrency(code)
        mutate { it.copy(settings = it.settings.withSetting("currency", JsonPrimitive(code))) }
    }

    fun setLandingView(view: String) =
        mutate { it.copy(settings = it.settings.withSetting("landingView", JsonPrimitive(view))) }

    fun setBillReminders(on: Boolean) =
        mutate { it.copy(settings = it.settings.withSetting("billReminders", JsonPrimitive(on))) }

    fun setMonthlySummary(on: Boolean) =
        mutate { it.copy(settings = it.settings.withSetting("monthlySummary", JsonPrimitive(on))) }

    /**
     * Record a payment of [amount] toward a bill/card on [date]. Payments accumulate
     * toward the monthly goal (partial installments are kept). Card payments decrement
     * the balance, mirroring confirmPay + applyCardPaymentDelta on the web.
     */
    fun recordPayment(type: String, refId: String, name: String, amount: Double, date: LocalDate, note: String) =
        mutate { d ->
            val mk = DateLogic.monthKey(date)
            val iso = "%04d-%02d-%02d".format(date.year, date.monthValue, date.dayOfMonth)
            val payments = d.payments.toMutableList()
            payments.add(Payment(System.currentTimeMillis(), type, refId, name, amount, iso, mk, note))
            val cards = if (type == "card") applyCardPaymentDelta(d.cards, refId, amount) else d.cards
            d.copy(payments = payments, cards = cards)
        }

    /** Decrement a card's balance (and promo balance) by [delta]; negative reverses. */
    private fun applyCardPaymentDelta(cards: List<Card>, refId: String, delta: Double): List<Card> {
        if (delta == 0.0) return cards
        return cards.map { c ->
            if (c.id.toString() != refId) c
            else c.copy(
                balance = (c.balance - delta).coerceAtLeast(0.0),
                promoBalance = c.promoBalance?.let { (it - delta).coerceAtLeast(0.0) },
            )
        }
    }

    // ── Fully-paid goal logic (mirrors utils.js) ────────────────────────────
    fun paidGoalPolicy(): PaidGoalPolicy = PaidGoalPolicy.from(_data.value.settings.paidGoal)

    fun goalAmount(type: String, refId: String): Double {
        val d = _data.value
        return if (type == "bill") {
            d.bills.firstOrNull { it.id.toString() == refId }?.let { Schedule.goalAmount(it) } ?: 0.0
        } else {
            d.cards.firstOrNull { it.id.toString() == refId }?.let {
                Schedule.goalAmount(it, paidGoalPolicy(), d.payments, DateLogic.currentMonthKey(zone()), zone())
            } ?: 0.0
        }
    }

    fun paidAmountFor(type: String, refId: String): Double =
        Schedule.paidAmount(_data.value.payments, type, refId, DateLogic.currentMonthKey(zone()))

    fun remainingFor(type: String, refId: String): Double =
        (goalAmount(type, refId) - paidAmountFor(type, refId)).coerceAtLeast(0.0)

    fun isFullyPaid(type: String, refId: String): Boolean =
        remainingFor(type, refId) <= Schedule.PAID_EPSILON

    fun paidState(type: String, refId: String): PaidState = when {
        isFullyPaid(type, refId) -> PaidState.FULL
        paidAmountFor(type, refId) > Schedule.PAID_EPSILON -> PaidState.PARTIAL
        else -> PaidState.UNPAID
    }

    // UpcomingItem conveniences.
    fun goalAmount(item: UpcomingItem) = goalAmount(item.type, item.refId)
    fun paidAmountFor(item: UpcomingItem) = paidAmountFor(item.type, item.refId)
    fun remainingFor(item: UpcomingItem) = remainingFor(item.type, item.refId)
    fun paidState(item: UpcomingItem) = paidState(item.type, item.refId)

    fun zone(): ZoneId = DateLogic.zone(_data.value.settings.timezoneSetting)
}
