package app.fihaven.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.fihaven.AppViewModel
import app.fihaven.core.model.HouseholdInfo
import app.fihaven.core.model.HouseholdView
import app.fihaven.core.model.SharedEntity
import app.fihaven.core.net.ApiError
import app.fihaven.ui.theme.Ct
import kotlinx.coroutines.launch
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Family / household management (Phases 1–3): create or join, manage members,
 *  and watch shared finances update live over the SSE stream. */
@Composable
fun HouseholdSection(vm: AppViewModel) {
    var info by remember { mutableStateOf<HouseholdInfo?>(null) }
    var entities by remember { mutableStateOf<List<SharedEntity>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    var loaded by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var inviteEmail by remember { mutableStateOf("") }
    var joinCode by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val myEmail = vm.currentUser?.email ?: ""

    suspend fun reload() {
        try { info = vm.api.getHousehold(); error = null }
        catch (e: Exception) { error = errMsg(e) }
        loaded = true
    }
    fun act(op: suspend () -> Unit) = scope.launch {
        busy = true; error = null
        try { op(); reload() } catch (e: Exception) { error = errMsg(e) }
        busy = false
    }

    LaunchedEffect(Unit) { reload() }

    // Snapshot the shared store, then subscribe to live deltas. Re-runs when
    // the household identity changes (joined / left).
    val hid = info?.household?.household?.id
    LaunchedEffect(hid) {
        if (hid == null) { entities = emptyList(); return@LaunchedEffect }
        val snap = runCatching { vm.api.getHouseholdSharedData() }.getOrNull()
        entities = snap?.entities ?: emptyList()
        vm.streamHousehold(snap?.seq ?: 0L) { e -> entities = applyDelta(entities, e) }
    }

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        error?.let { Text(it, color = Ct.colors.red, fontSize = 13.sp) }

        if (!loaded) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) { CircularProgressIndicator() }
        } else {
            val view = info?.household
            if (view == null) joinOrCreate(info, name, { name = it }, joinCode, { joinCode = it }, busy, ::act, vm)
            else householdBody(view, entities, myEmail, inviteEmail, { inviteEmail = it }, busy, ::act, vm)
        }
    }
}

@Composable
private fun joinOrCreate(
    info: HouseholdInfo?,
    name: String, onName: (String) -> Unit,
    joinCode: String, onJoin: (String) -> Unit,
    busy: Boolean, act: (suspend () -> Unit) -> Unit, vm: AppViewModel,
) {
    if (info?.canCreate == true) {
        LabeledCard("START A HOUSEHOLD") {
            OutlinedTextField(name, onName, label = { Text("Household name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Button(onClick = { act { vm.api.createHousehold(name.ifBlank { "My Household" }) } }, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
                Text("Create household")
            }
        }
    } else {
        LabeledCard("FAMILY SHARING") {
            Text("Household sharing is part of FiHaven Pro. Upgrade to start a household and invite your family.",
                color = Ct.colors.muted, fontSize = 14.sp)
        }
    }
    LabeledCard("HAVE AN INVITE CODE?") {
        OutlinedTextField(joinCode, onJoin, label = { Text("Paste your invite code") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Button(onClick = { act { vm.api.acceptHouseholdInvite(joinCode.trim()) } }, enabled = !busy && joinCode.isNotBlank(), modifier = Modifier.fillMaxWidth()) {
            Text("Join household")
        }
    }
}

@Composable
private fun householdBody(
    view: HouseholdView, entities: List<SharedEntity>, myEmail: String,
    inviteEmail: String, onInvite: (String) -> Unit,
    busy: Boolean, act: (suspend () -> Unit) -> Unit, vm: AppViewModel,
) {
    val isOwner = view.role == "owner"

    LabeledCard(view.household.name.uppercase()) {
        Text("${view.memberCount} of ${view.memberMax} members" + if (isOwner) " · you’re the owner" else "",
            color = Ct.colors.muted, fontSize = 12.5.sp)
        view.members.forEachIndexed { i, m ->
            if (i > 0) HorizontalDivider(color = Ct.colors.border)
            Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(m.name?.takeIf { it.isNotBlank() } ?: m.email, fontSize = 15.sp, color = Ct.colors.text)
                    if (m.email.lowercase() == myEmail.lowercase()) Text("You", fontSize = 12.sp, color = Ct.colors.muted)
                }
                Text(if (m.role == "owner") "Owner" else "Member", fontSize = 12.sp,
                    color = if (m.role == "owner") Ct.colors.accent else Ct.colors.muted)
                if (isOwner && m.role != "owner") {
                    TextButton(onClick = { act { vm.api.removeHouseholdMember(m.userId) } }, enabled = !busy) {
                        Text("Remove", color = Ct.colors.red, fontSize = 13.sp)
                    }
                }
            }
        }
    }

    if (isOwner) {
        LabeledCard("INVITE SOMEONE") {
            OutlinedTextField(inviteEmail, onInvite, label = { Text("name@email.com") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Button(onClick = { act { vm.api.inviteToHousehold(inviteEmail.trim()) } }, enabled = !busy && inviteEmail.isNotBlank(), modifier = Modifier.fillMaxWidth()) {
                Text("Send invite")
            }
        }
    }

    LabeledCard("SHARED FINANCES") {
        if (entities.isEmpty()) {
            Text("Nothing shared yet. Share bills, cards, or goals from the web app.", color = Ct.colors.muted, fontSize = 13.sp)
        } else {
            entities.forEachIndexed { i, e ->
                if (i > 0) HorizontalDivider(color = Ct.colors.border)
                Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(entityTitle(e), Modifier.weight(1f), fontSize = 15.sp, color = Ct.colors.text)
                    Text(view.members.firstOrNull { it.userId == e.ownerUserId }
                        ?.let { if (it.email.lowercase() == myEmail.lowercase()) "You" else (it.name ?: it.email) } ?: "Household",
                        fontSize = 12.sp, color = Ct.colors.muted)
                }
            }
        }
    }

    Button(onClick = { act { vm.api.leaveHousehold() } }, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
        Text(if (isOwner) "Leave (transfers or dissolves)" else "Leave household", color = Ct.colors.red)
    }
}

@Composable
private fun LabeledCard(title: String, content: @Composable () -> Unit) {
    Column {
        Text(title, color = Ct.colors.muted, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(bottom = 8.dp))
        CtCard { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { content() } }
    }
}

private fun entityTitle(e: SharedEntity): String {
    val o = runCatching { e.data.jsonObject }.getOrNull() ?: return e.kind.replaceFirstChar { it.uppercase() }
    return o["name"]?.jsonPrimitive?.contentOrNull
        ?: o["merchant"]?.jsonPrimitive?.contentOrNull
        ?: e.kind.replaceFirstChar { it.uppercase() }
}

private fun applyDelta(list: List<SharedEntity>, e: SharedEntity): List<SharedEntity> {
    val idx = list.indexOfFirst { it.kind == e.kind && it.id == e.id }
    return when {
        e.deleted == true -> if (idx >= 0) list.toMutableList().also { it.removeAt(idx) } else list
        idx >= 0 -> list.toMutableList().also { it[idx] = e }
        else -> list + e
    }
}

private fun errMsg(e: Throwable): String = when {
    e is ApiError.Http && e.code != null -> when (e.code) {
        "pro-required" -> "Household sharing is a Pro feature."
        "already-in-household" -> "You’re already in a household."
        "not-owner" -> "Only the household owner can do that."
        "invalid-email" -> "Enter a valid email address."
        "already-member" -> "That person is already in your household."
        "household-full" -> "Your household is full."
        "invite-email-mismatch" -> "That invite was sent to a different email."
        "invite-expired" -> "That invite has expired."
        "invite-used" -> "That invite was already used."
        "invalid-invite" -> "That invite code is invalid."
        else -> "Something went wrong. Please try again."
    }
    else -> "Something went wrong. Please try again."
}
