import Foundation

print("─── FiHavenCore checks ──────────────────────────────\n")

runModelChecks()
runSettingsChecks()
runIncomeChecks()
runDateLogicChecks()
runScheduleChecks()
runPayoffChecks()
await runAPIChecks()
await runAccountChecks()
await runLiveChecks()

let passed = totalChecks - failedChecks
print("\n──────────────────────────────────────────────────────")
print("\(passed)/\(totalChecks) checks passed")
if failedChecks > 0 {
    print("❌ \(failedChecks) FAILED")
    exit(1)
}
print("✅ ALL PASSED")
