import Foundation

print("─── FiHavenCore checks ──────────────────────────────\n")

runModelChecks()
runOfflineCacheChecks()
runSettingsChecks()
runIncomeChecks()
runCashflowHistoryChecks()
runDateLogicChecks()
runScheduleChecks()
runNeedsAmountChecks()
runPresetUpdateChecks()
runPayoffChecks()
runSubscriptionIconChecks()
runSubscriptionsFinderChecks()
runBudgetRulesChecks()
runSpendingInsightsChecks()
runIssuerIconChecks()
runSVGPathChecks()
await runAPIChecks()
await runAccountChecks()
await runHouseholdChecks()
await runLiveChecks()

let passed = totalChecks - failedChecks
print("\n──────────────────────────────────────────────────────")
print("\(passed)/\(totalChecks) checks passed")
if failedChecks > 0 {
    print("❌ \(failedChecks) FAILED")
    exit(1)
}
print("✅ ALL PASSED")
