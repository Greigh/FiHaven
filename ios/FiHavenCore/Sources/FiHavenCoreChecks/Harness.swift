import Foundation

// A tiny assertion harness so the core can be verified with just the
// Command Line Tools (no XCTest/Xcode). Tallies results; `main` exits
// non-zero if anything failed.

var totalChecks = 0
var failedChecks = 0

func check(_ condition: Bool, _ message: String,
           file: StaticString = #fileID, line: UInt = #line) {
    totalChecks += 1
    if !condition {
        failedChecks += 1
        print("  ✗ \(message)  (\(file):\(line))")
    }
}

func checkEqual<T: Equatable>(_ actual: T, _ expected: T, _ message: String,
                              file: StaticString = #fileID, line: UInt = #line) {
    check(actual == expected, "\(message) — expected \(expected), got \(actual)",
          file: file, line: line)
}

func checkClose(_ actual: Double, _ expected: Double, _ message: String,
                tol: Double = 1e-6,
                file: StaticString = #fileID, line: UInt = #line) {
    check(abs(actual - expected) <= tol,
          "\(message) — expected ≈\(expected), got \(actual)",
          file: file, line: line)
}

func section(_ name: String, _ body: () throws -> Void) {
    print("• \(name)")
    do { try body() }
    catch { failedChecks += 1; print("  ✗ threw: \(error)") }
}

func sectionAsync(_ name: String, _ body: () async throws -> Void) async {
    print("• \(name)")
    do { try await body() }
    catch { failedChecks += 1; print("  ✗ threw: \(error)") }
}
