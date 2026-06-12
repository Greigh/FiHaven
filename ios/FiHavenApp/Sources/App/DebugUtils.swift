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
