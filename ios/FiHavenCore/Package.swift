// swift-tools-version: 6.0
import PackageDescription
import Foundation

// FiHavenCore — platform-agnostic core for the native FiHaven apps.
// Pure Foundation (no third-party deps) so it compiles on iOS, macOS,
// and the command line for CI/unit tests. The SwiftUI app target links
// this package; the business logic and networking live here so they
// can be tested without a UI. See docs/native-contract.md.
let includeChecks = ProcessInfo.processInfo.environment["FH_INCLUDE_CHECKS"] == "1"

var products: [Product] = [
    .library(name: "FiHavenCore", targets: ["FiHavenCore"]),
]

var targets: [Target] = [
    .target(name: "FiHavenCore"),
]

if includeChecks {
    products.append(.executable(name: "FiHavenCoreChecks", targets: ["FiHavenCoreChecks"]))
    targets.append(
        .executableTarget(
            name: "FiHavenCoreChecks",
            dependencies: ["FiHavenCore"]
        )
    )
}

let package = Package(
    name: "FiHavenCore",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: products,
    targets: targets,
    // Swift 5 language mode keeps the core free of strict-concurrency
    // friction; the app target can opt into Swift 6 mode independently.
    swiftLanguageModes: [.v5]
)
