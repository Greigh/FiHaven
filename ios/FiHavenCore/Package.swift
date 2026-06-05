// swift-tools-version: 6.0
import PackageDescription

// FiHavenCore — platform-agnostic core for the native FiHaven apps.
// Pure Foundation (no third-party deps) so it compiles on iOS, macOS,
// and the command line for CI/unit tests. The SwiftUI app target links
// this package; the business logic and networking live here so they
// can be tested without a UI. See docs/native-contract.md.
let package = Package(
    name: "FiHavenCore",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [
        .library(name: "FiHavenCore", targets: ["FiHavenCore"]),
    ],
    targets: [
        .target(name: "FiHavenCore"),
        // Verification harness runnable with just the Command Line Tools
        // (`swift run FiHavenCoreChecks`) — XCTest/swift-testing aren't
        // available without full Xcode. Exercises the public API and
        // asserts on captured requests. Exits non-zero on any failure, so
        // it doubles as a CI gate that needs no Xcode.
        .executableTarget(
            name: "FiHavenCoreChecks",
            dependencies: ["FiHavenCore"]
        ),
    ],
    // Swift 5 language mode keeps the core free of strict-concurrency
    // friction; the app target can opt into Swift 6 mode independently.
    swiftLanguageModes: [.v5]
)
