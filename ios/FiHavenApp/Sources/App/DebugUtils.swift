import Foundation

#if DEBUG
import Darwin

@inline(__always)
func isDebuggerAttached() -> Bool {
    var kp = kinfo_proc()
    var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
    let size = MemoryLayout<kinfo_proc>.stride
    let result = mib.withUnsafeMutableBufferPointer { ptr -> Int32 in
        var length = size
        return sysctl(ptr.baseAddress, u_int(ptr.count), &kp, &length, nil, 0)
    }
    if result != 0 { return false }
    return (kp.kp_proc.p_flag & P_TRACED) != 0
}
#else
@inline(__always)
func isDebuggerAttached() -> Bool { return false }
#endif

// ── Sweep/harness logging ────────────────────────────────────────────────────
//
// `print()` is block-buffered whenever stdout is a pipe or a file, and the
// sweep's whole evidence model — `session=signedIn`, `pro=true`, `locked=`,
// `[Shell] screen=` — reads the *log a capture launch wrote*. A buffered
// print is invisible there: the process is killed at the capture deadline
// and the buffer dies with it. So harness evidence goes through `fhLog`,
// which writes stderr (unbuffered even under a pipe) AND os_log (which
// `xcrun simctl launch --console` streams — the phone sweep's capture log).
#if DEBUG
import OSLog

private let fhSweepLogger = Logger(subsystem: "app.fihaven", category: "sweep")

func fhLog(_ message: @autoclosure () -> String) {
    let line = message()
    fhSweepLogger.notice("\(line, privacy: .public)")
    FileHandle.standardError.write(Data((line + "\n").utf8))
}
#else
@inline(__always)
func fhLog(_ message: @autoclosure () -> String) {}
#endif
