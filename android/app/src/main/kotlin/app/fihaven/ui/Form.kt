package app.fihaven.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.fihaven.ui.theme.Ct
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

/// Title row for a screen, with optional back (←) and add (+) actions.
@Composable
fun ScreenHeader(
    title: String,
    onAdd: (() -> Unit)? = null,
    onBack: (() -> Unit)? = null,
    branded: Boolean = false,
) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (onBack != null) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Ct.colors.text)
            }
        }
        if (branded) {
            BrandMark(size = 26, modifier = Modifier.padding(start = if (onBack != null) 0.dp else 8.dp, end = 10.dp))
        }
        Text(title, color = Ct.colors.text, fontSize = 28.sp,
            fontWeight = FontWeight.ExtraBold,
            modifier = Modifier.weight(1f).padding(start = if (onBack != null || branded) 0.dp else 8.dp))
        if (onAdd != null) {
            IconButton(onClick = onAdd) { Icon(Icons.Filled.Add, "Add", tint = Ct.colors.accent) }
        }
    }
}

/// A scrollable add/edit dialog with Cancel / Save (and optional Delete).
@Composable
fun FormDialog(
    title: String,
    saveEnabled: Boolean = true,
    saveLabel: String = "Save",
    onSave: () -> Unit,
    onDismiss: () -> Unit,
    onDelete: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val maxDialogHeight = (LocalConfiguration.current.screenHeightDp * 0.88f).dp

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = Ct.colors.surface,
            modifier = Modifier
                .fillMaxWidth(0.92f)
                .wrapContentHeight()
                .heightIn(max = maxDialogHeight),
        ) {
            // Keep the whole dialog — especially the bottom Save/Cancel row —
            // clear of the gesture navigation bar and the on-screen keyboard, so
            // the action buttons stay reachable while a field is focused.
            Column(Modifier.fillMaxWidth().navigationBarsPadding().imePadding()) {
                Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(title, color = Ct.colors.text, fontSize = 18.sp,
                        fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    TextButton(onClick = onDismiss) { Text("Cancel", color = Ct.colors.muted) }
                }
                // weight(fill = false) lets the header and the action row be
                // measured first and take exactly what they need; the scrolling
                // content then gets whatever is left, and shrinks rather than
                // pushing Save past the bottom of the dialog. A fixed content
                // cap (maxDialogHeight - 120dp) could not know the real header
                // and footer heights, so on tall forms, large font scales, or
                // with the keyboard up, Save ended up off-screen.
                Column(
                    Modifier
                        .fillMaxWidth()
                        .weight(1f, fill = false)
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) { content() }
                // No divider here: it spanned the full dialog width while every
                // field is inset 16dp, so on a short form it read as a stray
                // full-bleed line floating above Save. The Surface + the action
                // row's own padding already separate content from the actions.
                Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (onDelete != null) {
                        TextButton(
                            onClick = onDelete,
                            modifier = Modifier.heightIn(min = 48.dp),
                        ) { Text("Delete", color = Ct.colors.red) }
                    }
                    Spacer(Modifier.weight(1f))
                    Button(
                        onClick = onSave, enabled = saveEnabled,
                        colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.accent),
                        modifier = Modifier.heightIn(min = 48.dp),
                    ) { Text(saveLabel) }
                }
            }
        }
    }
}

/// Read-only field that opens a dropdown of [options].
@Composable
fun DropdownField(label: String, options: List<String>, selected: String, onSelect: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Column {
        FieldLabel(label)
        Box {
            OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) {
                Text(selected.ifEmpty { "Select" }, color = Ct.colors.text, modifier = Modifier.weight(1f))
                Icon(Icons.Filled.ArrowDropDown, contentDescription = null, tint = Ct.colors.muted)
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                options.forEach { opt ->
                    DropdownMenuItem(text = { Text(opt) }, onClick = { onSelect(opt); expanded = false })
                }
            }
        }
    }
}

/// Day-of-month picker (1–31), styled like [DropdownField]. When [allowSame]
/// is set it offers "Same as due day" first, which maps to an empty value.
@Composable
fun DayField(
    label: String,
    value: String,
    allowSame: Boolean = false,
    sameLabel: String = "Same as due day",
    onChange: (String) -> Unit,
) {
    val days = (1..31).map { it.toString() }
    val options = if (allowSame) listOf(sameLabel) + days else days
    val selected = if (value.isBlank()) (if (allowSame) sameLabel else "1") else value
    DropdownField(label, options, selected) { picked ->
        onChange(if (picked == sameLabel) "" else picked)
    }
}

private val isoDateFmt: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE
private val prettyDateFmt: DateTimeFormatter = DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.US)

private fun isoToLocalDate(iso: String): LocalDate? =
    iso.takeIf { it.isNotBlank() }?.let { runCatching { LocalDate.parse(it, isoDateFmt) }.getOrNull() }

private fun isoToPretty(iso: String): String = isoToLocalDate(iso)?.format(prettyDateFmt) ?: ""

private fun isoToMillis(iso: String): Long? =
    isoToLocalDate(iso)?.atStartOfDay(ZoneOffset.UTC)?.toInstant()?.toEpochMilli()

private fun millisToIso(millis: Long): String =
    Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate().format(isoDateFmt)

/// Read-only date field styled like [DropdownField]; tapping opens a Material
/// date picker. Stores an ISO "YYYY-MM-DD" string (empty when unset). Clearable
/// dates show a ✕ to unset them.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DateField(
    label: String,
    valueIso: String,
    onChange: (String) -> Unit,
    clearable: Boolean = true,
    supportingText: String? = null,
) {
    var open by remember { mutableStateOf(false) }
    val pretty = isoToPretty(valueIso)
    Column {
        FieldLabel(label)
        OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth()) {
            Text(
                pretty.ifEmpty { "Select a date" },
                color = if (pretty.isEmpty()) Ct.colors.muted else Ct.colors.text,
                modifier = Modifier.weight(1f),
            )
            if (clearable && valueIso.isNotBlank()) {
                Icon(
                    Icons.Filled.Clear, contentDescription = "Clear date", tint = Ct.colors.muted,
                    modifier = Modifier.clickable { onChange("") },
                )
            } else {
                Icon(Icons.Filled.DateRange, contentDescription = null, tint = Ct.colors.muted)
            }
        }
        if (supportingText != null) {
            Text(supportingText, color = Ct.colors.muted, fontSize = 12.sp,
                modifier = Modifier.padding(top = 4.dp, start = 4.dp))
        }
    }
    if (open) {
        val state = rememberDatePickerState(initialSelectedDateMillis = isoToMillis(valueIso))
        DatePickerDialog(
            onDismissRequest = { open = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { onChange(millisToIso(it)) }
                    open = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { open = false }) { Text("Cancel") } },
        ) { DatePicker(state = state) }
    }
}
