package app.fihaven.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.fihaven.ui.theme.Ct

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
    onSave: () -> Unit,
    onDismiss: () -> Unit,
    onDelete: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = Ct.colors.surface,
            modifier = Modifier.fillMaxWidth(0.92f).fillMaxHeight(0.88f),
        ) {
            Column(Modifier.fillMaxSize()) {
                Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(title, color = Ct.colors.text, fontSize = 18.sp,
                        fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    TextButton(onClick = onDismiss) { Text("Cancel", color = Ct.colors.muted) }
                }
                Column(
                    Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) { content() }
                Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (onDelete != null) {
                        TextButton(onClick = onDelete) { Text("Delete", color = Ct.colors.red) }
                    }
                    Spacer(Modifier.weight(1f))
                    Button(
                        onClick = onSave, enabled = saveEnabled,
                        colors = ButtonDefaults.buttonColors(containerColor = Ct.colors.accent),
                    ) { Text("Save") }
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
