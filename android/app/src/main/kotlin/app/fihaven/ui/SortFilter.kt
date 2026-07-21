package app.fihaven.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.fihaven.ui.theme.Ct

/** Compact sort menu + filter-sheet trigger, shared by Bills and Cards. */
@Composable
fun SortFilterBar(
    sortOptions: List<Pair<String, String>>, // key to label
    sortKey: String,
    onSortChange: (String) -> Unit,
    filterCount: Int,
    onFilters: () -> Unit,
) {
    var sortOpen by remember { mutableStateOf(false) }
    val current = sortOptions.firstOrNull { it.first == sortKey }?.second ?: "Sort"
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box {
            TextButton(onClick = { sortOpen = true }) {
                Icon(Icons.AutoMirrored.Filled.Sort, contentDescription = "Sort",
                    tint = Ct.colors.accent, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text(current, color = Ct.colors.text, fontSize = 14.sp)
            }
            DropdownMenu(expanded = sortOpen, onDismissRequest = { sortOpen = false }) {
                sortOptions.forEach { (key, label) ->
                    DropdownMenuItem(text = { Text(label) }, onClick = { onSortChange(key); sortOpen = false })
                }
            }
        }
        TextButton(onClick = onFilters) {
            Icon(Icons.Default.FilterList, contentDescription = "Filters",
                tint = Ct.colors.accent, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text(if (filterCount > 0) "Filters · $filterCount" else "Filters",
                color = Ct.colors.text, fontSize = 14.sp)
        }
    }
}

/** Search field for list screens (Bills, Cards, Subscriptions, Spending). */
@Composable
fun ListSearchField(
    query: String,
    onQueryChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
) {
    OutlinedTextField(
        value = query,
        onValueChange = onQueryChange,
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        singleLine = true,
        placeholder = { Text(placeholder, color = Ct.colors.muted) },
        leadingIcon = {
            Icon(Icons.Filled.Search, contentDescription = null, tint = Ct.colors.muted)
        },
        trailingIcon = {
            if (query.isNotEmpty()) {
                IconButton(onClick = { onQueryChange("") }) {
                    Icon(Icons.Filled.Clear, contentDescription = "Clear search", tint = Ct.colors.muted)
                }
            }
        },
    )
}

/** Case-insensitive substring match across one or more haystacks. */
fun matchesListSearch(query: String, vararg haystacks: String?): Boolean {
    val q = query.trim()
    if (q.isEmpty()) return true
    return haystacks.any { it?.contains(q, ignoreCase = true) == true }
}

/** A label + Switch row for the filter sheets. */
@Composable
fun FilterSwitch(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = Ct.colors.text, fontSize = 15.sp, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChange)
    }
}
